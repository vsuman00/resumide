-- One dispatch per prepared upload. An absent acknowledgement remains unresolved.
begin;

create table private.analysis_admission_upload_transport (
  upload_id uuid primary key references private.analysis_admission_uploads(id) on delete restrict,
  bucket text check (bucket collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'),
  dispatched_at timestamptz,
  acknowledged_at timestamptz,
  object_id uuid,
  check ((bucket is null) = (dispatched_at is null)),
  check ((acknowledged_at is null) = (object_id is null)),
  check (acknowledged_at is null or (dispatched_at is not null and acknowledged_at >= dispatched_at))
);
alter table private.analysis_admission_upload_transport enable row level security;
revoke all on private.analysis_admission_upload_transport from public,anon,authenticated,service_role;

create function private.guard_analysis_admission_upload_transport()
returns trigger language plpgsql set search_path='' as $guard$
begin
  if tg_op='DELETE' then
    raise exception 'Immutable upload transport evidence' using errcode='23514';
  end if;
  if new.upload_id is distinct from old.upload_id or not (
    (old.dispatched_at is null and new.dispatched_at is not null and new.acknowledged_at is null)
    or (old.dispatched_at is not null and row(new.bucket,new.dispatched_at) is not distinct from row(old.bucket,old.dispatched_at)
      and old.acknowledged_at is null and new.acknowledged_at is not null)
  ) then
    raise exception 'Invalid upload transport evidence transition' using errcode='23514';
  end if;
  return new;
end;
$guard$;
create trigger guard_analysis_admission_upload_transport before update or delete
  on private.analysis_admission_upload_transport for each row
  execute function private.guard_analysis_admission_upload_transport();

create function private.require_tracked_upload_acknowledgement()
returns trigger language plpgsql set search_path='' as $adoption$
begin
  if exists(select 1 from private.analysis_admission_upload_transport
      where upload_id=new.id and acknowledged_at is null) then
    raise exception 'Tracked upload has no acknowledgement' using errcode='23514';
  end if;
  return new;
end;
$adoption$;
create trigger require_tracked_upload_acknowledgement before update of state
  on private.analysis_admission_uploads for each row
  when (new.state='adopted') execute function private.require_tracked_upload_acknowledgement();

-- Only this producer enrolls a freshly prepared upload. Existing binaries and
-- old prepared rows remain outside the tracked protocol.
create function public.prepare_tracked_analysis_admission(
  p_user_id uuid,p_organization_id uuid,p_request jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $prepare$
declare receipt jsonb;
begin
  receipt:=public.prepare_analysis_admission(p_user_id,p_organization_id,p_request);
  if receipt->>'kind'='upload' then
    insert into private.analysis_admission_upload_transport(upload_id) values((receipt->>'uploadId')::uuid);
  end if;
  return receipt;
end;
$prepare$;

create function public.begin_analysis_admission_upload(
  p_user_id uuid,p_organization_id uuid,p_operation_id uuid,p_upload_id uuid,p_bucket text,p_storage_key text
) returns boolean language plpgsql volatile security definer set search_path='' as $dispatch$
begin
  if p_bucket is null or p_bucket collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'
    or not private.try_candidate_privacy_write(p_user_id)
    or not private.analysis_admission_authorized(p_user_id,p_organization_id) then
    return false;
  end if;
  perform 1 from private.analysis_admission_uploads u
    join private.analysis_admission_operations o on o.id=u.operation_id
    where u.id=p_upload_id and o.id=p_operation_id and o.owner_id=p_user_id and o.organization_id=p_organization_id
      and u.storage_key=p_storage_key and u.state='prepared'
    for update of u;
  if not found then return false; end if;
  update private.analysis_admission_upload_transport set bucket=p_bucket,dispatched_at=clock_timestamp()
    where upload_id=p_upload_id and dispatched_at is null;
  return found;
end;
$dispatch$;

create function public.acknowledge_analysis_admission_upload(
  p_user_id uuid,p_organization_id uuid,p_operation_id uuid,p_upload_id uuid,p_bucket text,p_storage_key text,p_object_id uuid
) returns boolean language plpgsql volatile security definer set search_path='' as $acknowledge$
declare lock_key bigint; recorded_object uuid;
begin
  if p_user_id is null or p_object_id is null or current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    return false;
  end if;
  -- Existing evidence can settle after deletion is requested. This path grants no new write.
  foreach lock_key in array private.candidate_owner_lock_keys(array[p_user_id]) loop
    if not pg_try_advisory_xact_lock_shared(lock_key) then return false; end if;
  end loop;
  select t.object_id into recorded_object
    from private.analysis_admission_upload_transport t
    join private.analysis_admission_uploads u on u.id=t.upload_id
    join private.analysis_admission_operations o on o.id=u.operation_id
    where u.id=p_upload_id and o.id=p_operation_id and o.owner_id=p_user_id and o.organization_id=p_organization_id
      and u.storage_key=p_storage_key and t.bucket=p_bucket and t.dispatched_at is not null
    for update of t;
  if not found then return false; end if;
  if recorded_object is not null then return recorded_object=p_object_id; end if;
  update private.analysis_admission_upload_transport set acknowledged_at=clock_timestamp(),object_id=p_object_id
    where upload_id=p_upload_id;
  return true;
end;
$acknowledge$;

revoke all on function private.guard_analysis_admission_upload_transport() from public,anon,authenticated,service_role;
revoke all on function private.require_tracked_upload_acknowledgement() from public,anon,authenticated,service_role;
revoke all on function public.prepare_tracked_analysis_admission(uuid,uuid,jsonb),
  public.begin_analysis_admission_upload(uuid,uuid,uuid,uuid,text,text),
  public.acknowledge_analysis_admission_upload(uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_tracked_analysis_admission(uuid,uuid,jsonb),
  public.begin_analysis_admission_upload(uuid,uuid,uuid,uuid,text,text),
  public.acknowledge_analysis_admission_upload(uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

-- The existing export trigger also exports transport evidence. Legacy uploads retain an unknown outcome.
create or replace function private.analysis_admission_export_records(p_owner uuid)
returns jsonb language plpgsql volatile set search_path='' as $export_records$
declare operations jsonb; uploads jsonb; result jsonb;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'PRIVACY_ISOLATION_UNSUPPORTED' using errcode='25000';
  end if;
  if not private.try_lock_candidate_owners(array[p_owner]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;
  -- Both collections share one snapshot, including compensation that may finish
  -- without acquiring the admission insert lock.
  select (select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'organizationId',o.organization_id,'idempotencyKey',o.idempotency_key,
    'bindingSha256',o.binding_sha256,'adoptedUploadId',o.adopted_upload_id,'createdAt',o.created_at
  ) order by o.id),'[]'::jsonb)
  from (select id,organization_id,idempotency_key,binding_sha256,adopted_upload_id,created_at
        from private.analysis_admission_operations where owner_id=p_owner order by id limit 4097) o),
  (select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'operationId',u.operation_id,'analysisId',u.analysis_id,'resumeId',u.resume_id,
    'versionId',u.version_id,'jobId',u.job_id,'storageKey',u.storage_key,'state',u.state,'createdAt',u.created_at,
    'storageTransport',case when u.tracked_upload_id is null then null else jsonb_build_object(
      'bucket',u.bucket,'dispatchedAt',u.dispatched_at,'acknowledgedAt',u.acknowledged_at,'objectId',u.object_id) end
  ) order by u.id),'[]'::jsonb)
  from (select u.id,u.operation_id,u.analysis_id,u.resume_id,u.version_id,u.job_id,u.storage_key,u.state,u.created_at,
               t.upload_id as tracked_upload_id,t.bucket,t.dispatched_at,t.acknowledged_at,t.object_id
        from private.analysis_admission_uploads u join private.analysis_admission_operations o on o.id=u.operation_id
        left join private.analysis_admission_upload_transport t on t.upload_id=u.id
        where o.owner_id=p_owner order by u.id limit 4097) u)
  into operations,uploads;

  if jsonb_array_length(operations)+jsonb_array_length(uploads)>4096 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  result:=jsonb_build_object('analysisAdmissionOperations',operations,'analysisAdmissionUploads',uploads);
  if octet_length(result::text)>4194304 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  return result;
end;
$export_records$;

commit;
