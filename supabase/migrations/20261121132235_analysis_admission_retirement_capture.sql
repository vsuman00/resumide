-- Capture the exact owner scope while a deletion claim is live. This migration
-- supplies neither a Storage command nor authority to retire admission rows.
begin;

create index analysis_admission_uploads_operation_idx
  on private.analysis_admission_uploads(operation_id,id);

create table private.analysis_admission_retirement_capture (
  request_id uuid primary key references public.data_requests(id) on delete restrict,
  operation_ids uuid[] not null,
  upload_ids uuid[] not null,
  captured_at timestamptz not null default clock_timestamp(),
  check (cardinality(operation_ids) > 0 and cardinality(operation_ids)+cardinality(upload_ids)<=4096)
);
alter table private.analysis_admission_retirement_capture enable row level security;
revoke all on private.analysis_admission_retirement_capture from public,anon,authenticated,service_role;

create function private.guard_analysis_admission_retirement_capture()
returns trigger language plpgsql set search_path='' as $guard$
begin
  raise exception 'Immutable admission retirement capture' using errcode='23514';
end;
$guard$;
create trigger guard_analysis_admission_retirement_capture before update or delete
  on private.analysis_admission_retirement_capture for each row
  execute function private.guard_analysis_admission_retirement_capture();
revoke all on function private.guard_analysis_admission_retirement_capture() from public,anon,authenticated,service_role;

create function public.capture_analysis_admission_retirement(
  p_request_id uuid,p_worker_id text,p_attempt integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $capture$
declare
  claimed public.data_requests%rowtype;
  prior private.analysis_admission_retirement_capture%rowtype;
  operations uuid[];
  uploads uuid[];
  legacy integer;
  undispatched integer;
  uncertain integer;
  acknowledged integer;
  leased integer;
  invalid_keys integer;
  orphaned_operations integer;
  unresolved_sources integer;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted')
    or private.privacy_generation_ready() is not true then
    raise exception 'ADMISSION_RETIREMENT_CAPTURE_UNAVAILABLE' using errcode='P0P01';
  end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return null; end if;
  -- The inherited claim locks its row first. Try the owner lock without waiting
  -- so admission or other owner work can finish without a lock-order cycle.
  if not private.try_lock_candidate_owners(array[claimed.user_id]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;

  -- One statement snapshot also covers post-upload compensation, which can
  -- change status without taking the owner's new-work lock.
  with owned_operations as materialized (
    select id,organization_id,adopted_upload_id from private.analysis_admission_operations
    where owner_id=claimed.user_id order by id limit 4097
  ), observed_uploads as (
    select u.id,t.upload_id as transport_id,t.dispatched_at,t.object_id,j.lease_owner,j.lease_expires_at,
           u.storage_key,'organizations/'||o.organization_id||'/resumes/'||u.resume_id||'/versions/'||u.version_id||'.pdf' as expected_key,
           case when u.state='adopted' then coalesce(
             o.adopted_upload_id=u.id and
             (a.owner_id,a.organization_id,a.resume_version_id,a.job_id)=(claimed.user_id,o.organization_id,u.version_id,u.job_id) and
             (v.owner_id,v.organization_id,v.resume_id,v.storage_key)=(claimed.user_id,o.organization_id,u.resume_id,u.storage_key) and
             v.bytes>0 and v.checksum collate "C" ~ '^[0-9a-f]{64}$' and
             (r.owner_id,r.organization_id)=(claimed.user_id,o.organization_id) and
             (jd.owner_id,jd.organization_id)=(claimed.user_id,o.organization_id),false)
           else a.id is null and v.id is null and r.id is null and jd.id is null and o.adopted_upload_id is distinct from u.id
           end as source_consistent
    from private.analysis_admission_uploads u
    join owned_operations o on o.id=u.operation_id
    left join private.analysis_admission_upload_transport t on t.upload_id=u.id
    left join public.analyses a on a.id=u.analysis_id
    left join public.analysis_jobs j on j.analysis_id=u.analysis_id
    left join public.resume_versions v on v.id=u.version_id
    left join public.resumes r on r.id=u.resume_id
    left join public.jobs jd on jd.id=u.job_id
    order by u.id limit 4097
  )
  select (select coalesce(array_agg(o.id order by o.id),array[]::uuid[]) from owned_operations o),
         (select count(*)::integer from owned_operations o where not exists (
           select 1 from private.analysis_admission_uploads u where u.operation_id=o.id
         )),
         coalesce(array_agg(u.id order by u.id),array[]::uuid[]),
         count(*) filter (where u.transport_id is null)::integer,
         count(*) filter (where u.transport_id is not null and u.dispatched_at is null)::integer,
         count(*) filter (where u.dispatched_at is not null and u.object_id is null)::integer,
         count(*) filter (where u.object_id is not null)::integer,
         count(*) filter (where u.lease_owner is not null or u.lease_expires_at is not null)::integer,
         count(*) filter (where u.storage_key is distinct from u.expected_key)::integer,
         count(*) filter (where not u.source_consistent)::integer
  into operations,orphaned_operations,uploads,legacy,undispatched,uncertain,acknowledged,leased,invalid_keys,unresolved_sources
  from observed_uploads u;
  if cardinality(operations)=0 or cardinality(operations)+cardinality(uploads)>4096 then
    raise exception 'ADMISSION_RETIREMENT_CAPTURE_SCOPE' using errcode='23514';
  end if;
  if claimed.lease_expires_at<=clock_timestamp() then return null; end if;
  insert into private.analysis_admission_retirement_capture(request_id,operation_ids,upload_ids)
    values(claimed.id,operations,uploads) on conflict(request_id) do nothing;
  select * into strict prior from private.analysis_admission_retirement_capture where request_id=claimed.id;
  if row(prior.operation_ids,prior.upload_ids) is distinct from row(operations,uploads) then
    raise exception 'ADMISSION_RETIREMENT_CAPTURE_CHANGED' using errcode='23514';
  end if;
  -- The private row pins the IDs. Only the bounded classification leaves the DB.
  -- Observed transport success and lease markers do not establish quiescence.
  return jsonb_build_object(
    'requestId',claimed.id,'attempt',claimed.attempt_count,'operations',cardinality(operations),'uploads',cardinality(uploads),
    'legacy',legacy,'undispatched',undispatched,'uncertain',uncertain,'acknowledged',acknowledged,
    'recordedWorkerLeases',leased,'invalidKeys',invalid_keys,'orphanedOperations',orphaned_operations,'unresolvedSources',unresolved_sources
  );
end;
$capture$;
revoke all on function public.capture_analysis_admission_retirement(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.capture_analysis_admission_retirement(uuid,text,integer) to service_role;

-- Retained capture metadata is part of the same bounded owner export.
create or replace function private.analysis_admission_export_records(p_owner uuid)
returns jsonb language plpgsql volatile set search_path='' as $export_records$
declare operations jsonb; uploads jsonb; captures jsonb; capture_items bigint; result jsonb;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'PRIVACY_ISOLATION_UNSUPPORTED' using errcode='25000';
  end if;
  if not private.try_lock_candidate_owners(array[p_owner]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;
  -- Both collections share one snapshot, including compensation that may finish
  -- without acquiring the admission insert lock.
  with owner_captures as materialized (
    select c.request_id,c.operation_ids,c.upload_ids,c.captured_at
    from private.analysis_admission_retirement_capture c
    join public.data_requests d on d.id=c.request_id
    where d.user_id=p_owner and d.kind='deletion' order by c.request_id limit 4097
  ), capture_size as (
    select coalesce(sum(1+cardinality(operation_ids)+cardinality(upload_ids)),0) items from owner_captures
  )
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
        where o.owner_id=p_owner order by u.id limit 4097) u),
  (select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',c.request_id,'operationIds',c.operation_ids,'uploadIds',c.upload_ids,'capturedAt',c.captured_at
  ) order by c.request_id),'[]'::jsonb) from owner_captures c where (select items from capture_size)<=4096),
  (select items from capture_size)
  into operations,uploads,captures,capture_items;

  if jsonb_array_length(operations)+jsonb_array_length(uploads)+capture_items>4096 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  result:=jsonb_build_object('analysisAdmissionOperations',operations,'analysisAdmissionUploads',uploads,
    'analysisAdmissionRetirementCaptures',captures);
  if octet_length(result::text)>4194304 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  return result;
end;
$export_records$;

commit;
