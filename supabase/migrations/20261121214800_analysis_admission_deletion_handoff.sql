-- Transfer exact adopted object obligations before sealed privacy preparation removes sources.
begin;

create table private.analysis_admission_deletion_handoffs (
  request_id uuid primary key references private.analysis_admission_retirement_capture(request_id) on delete cascade,
  adopted_upload_ids uuid[] not null check(cardinality(adopted_upload_ids)<=4096),
  plan_sha256 text not null check(plan_sha256 collate "C" ~ '^[0-9a-f]{64}$'),
  first_attempt integer not null check(first_attempt>0),
  prepared_at timestamptz not null default clock_timestamp(),
  authorized_xid xid8
);
alter table private.analysis_admission_deletion_handoffs enable row level security;
revoke all on private.analysis_admission_deletion_handoffs from public,anon,authenticated,service_role;

create function private.analysis_admission_deletion_plan_hash(p_objects jsonb)
returns text language plpgsql immutable set search_path='' as $plan_hash$
declare result text;
begin
  if jsonb_typeof(p_objects) is distinct from 'array' then return null;end if;
  if jsonb_array_length(p_objects)>4096 then return null;end if;
  if exists(select 1 from jsonb_array_elements(p_objects) item
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'storageKey') is distinct from 'string'
      or length(item->>'storageKey') not between 1 and 300) then return null;end if;
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(item order by (item->>'storageKey') collate "C"),'[]'::jsonb)::text,
    'UTF8'),'sha256'),'hex') into result
  from jsonb_array_elements(p_objects) item
  having count(*)=count(distinct item->>'storageKey');
  return result;
end;
$plan_hash$;

create function private.analysis_admission_handoff_authorized(p_request uuid,p_objects jsonb)
returns boolean language sql volatile set search_path='' as $authorized$
  select exists(select 1 from private.analysis_admission_deletion_handoffs h
    join public.data_requests d on d.id=h.request_id
    where h.request_id=p_request and h.authorized_xid=pg_current_xact_id_if_assigned()
      and d.kind='deletion' and d.status='processing' and d.lease_expires_at>clock_timestamp()
      and h.plan_sha256=private.analysis_admission_deletion_plan_hash(p_objects));
$authorized$;

create or replace function private.guard_analysis_admission_deletion_plan()
returns trigger language plpgsql volatile set search_path='' as $plan_guard$
declare candidate uuid;
begin
  select user_id into strict candidate from public.data_requests where id=new.request_id and kind='deletion';
  if not private.analysis_admission_handoff_authorized(new.request_id,new.storage_objects) then
    perform private.assert_analysis_admission_deletion_clear(candidate);
  end if;
  return new;
end;
$plan_guard$;

create or replace function private.guard_analysis_admission_privacy_step()
returns trigger language plpgsql volatile set search_path='' as $step_guard$
declare request_row public.data_requests%rowtype; snapshot jsonb;
begin
  select * into strict request_row from public.data_requests where id=new.request_id;
  if request_row.kind='deletion' then
    -- Only the database preparation step in the authorized transaction may advance.
    if new.step_key='database'
      and exists(select 1 from private.owned_ai_deletion_dispositions p where p.owner_id=request_row.user_id)
      and exists(select 1 from private.privacy_deletion_plans p where p.request_id=request_row.id
        and private.analysis_admission_handoff_authorized(p.request_id,p.storage_objects)) then
      return new;
    end if;
    -- Covers retries with old plans and completion using a previously loaded plan.
    perform private.assert_analysis_admission_deletion_clear(request_row.user_id);
  elsif request_row.kind='export' and new.step_key='export_manifest' then
    if request_row.status is distinct from 'completed'
      or request_row.result_manifest->>'version' is distinct from 'resumide-export-v1'
      or request_row.result_manifest#>>'{account,id}' is distinct from request_row.user_id::text
      or jsonb_typeof(request_row.result_manifest->'records') is distinct from 'object' then
      raise exception 'ADMISSION_EXPORT_MANIFEST_INVALID' using errcode='23514';
    end if;
    snapshot:=private.analysis_admission_export_records(request_row.user_id);
    update public.data_requests set result_manifest=jsonb_set(
      request_row.result_manifest,'{records}',(request_row.result_manifest->'records')||snapshot)
    where id=request_row.id;
  end if;
  return new;
end;
$step_guard$;

-- Validate the whole owner inventory before handing off any object.
create function private.stage_analysis_admission_deletion_handoff(
  p_claim public.data_requests
) returns void language plpgsql volatile set search_path='' as $stage$
declare
  capture_summary jsonb;
  objects jsonb;
  adopted uuid[];
  plan_hash text;
begin
  capture_summary:=public.capture_analysis_admission_retirement(p_claim.id,p_claim.lease_owner,p_claim.attempt_count);
  if capture_summary is null or (capture_summary->>'orphanedOperations')::integer<>0 then
    raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('storageKey',v.storage_key,'checksum',v.checksum,'bytes',v.bytes)),'[]'::jsonb)
    into objects from public.resume_versions v where v.owner_id=p_claim.user_id;
  plan_hash:=private.analysis_admission_deletion_plan_hash(objects);
  if plan_hash is null then raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';end if;

  with captured as materialized (
    select u.id,u.state,u.storage_key,o.adopted_upload_id,u.version_id
    from private.analysis_admission_retirement_capture c
    join private.analysis_admission_operations o on o.id=any(c.operation_ids)
    join private.analysis_admission_uploads u on u.operation_id=o.id and u.id=any(c.upload_ids)
    where c.request_id=p_claim.id and o.owner_id=p_claim.user_id
  ), ready as (
    select u.id,u.state from captured u
    where (u.state='adopted' and u.adopted_upload_id=u.id
      and exists(select 1 from private.analysis_admission_adopted_source_bindings b
        where b.request_id=p_claim.id and b.upload_id=u.id)
      and exists(select 1 from jsonb_array_elements(objects) obj where obj->>'storageKey'=u.storage_key))
    or (u.state='cleaned' and u.adopted_upload_id is distinct from u.id
      and exists(select 1 from private.analysis_admission_cleanup_receipts r
        where r.request_id=p_claim.id and r.upload_id=u.id and r.verified_at is not null)
      and not exists(select 1 from public.resume_versions v where v.id=u.version_id or v.storage_key=u.storage_key))
  )
  select coalesce(array_agg(id order by id) filter(where state='adopted'),array[]::uuid[])
    into adopted from ready having count(*)=(capture_summary->>'uploads')::integer;

  if adopted is null or p_claim.lease_expires_at<=clock_timestamp() then
    raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
  end if;
  insert into private.analysis_admission_deletion_handoffs(
    request_id,adopted_upload_ids,plan_sha256,first_attempt,authorized_xid
  ) values(p_claim.id,adopted,plan_hash,p_claim.attempt_count,pg_current_xact_id());
end;
$stage$;

create function public.prepare_deletion_request_with_admission_handoff(
  p_request_id uuid,p_worker_id text,p_attempt integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $prepare_handoff$
declare
  claimed public.data_requests%rowtype;
  handoff private.analysis_admission_deletion_handoffs%rowtype;
  result jsonb;
  expected jsonb;
begin
  if private.privacy_generation_ready() is not true then
    raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';
  end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then
    raise exception 'privacy deletion request is not owned' using errcode='42501';
  end if;
  if not private.try_lock_candidate_owners(array[claimed.user_id]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;

  select * into handoff from private.analysis_admission_deletion_handoffs where request_id=claimed.id;
  if not found then
    if not exists(select 1 from private.analysis_admission_operations o where o.owner_id=claimed.user_id) then
      return public.prepare_deletion_request(p_request_id,p_worker_id,p_attempt);
    end if;
    perform private.stage_analysis_admission_deletion_handoff(claimed);
    select * into strict handoff from private.analysis_admission_deletion_handoffs where request_id=claimed.id;
  else
    if not exists(select 1 from private.privacy_deletion_plans p where p.request_id=claimed.id
        and handoff.plan_sha256=private.analysis_admission_deletion_plan_hash(p.storage_objects))
      or not exists(select 1 from private.owned_ai_deletion_dispositions d where d.owner_id=claimed.user_id) then
      raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
    end if;
    update private.analysis_admission_deletion_handoffs set authorized_xid=pg_current_xact_id() where request_id=claimed.id;
  end if;

  result:=public.prepare_deletion_request(p_request_id,p_worker_id,p_attempt);
  if private.analysis_admission_deletion_plan_hash(result->'storageObjects') is distinct from handoff.plan_sha256 then
    raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
  end if;
  insert into private.analysis_admission_cleanup_receipts(request_id,upload_id,issued_attempt)
    select claimed.id,upload_id,claimed.attempt_count from unnest(handoff.adopted_upload_ids) upload_id
    on conflict(request_id,upload_id) do update set issued_attempt=excluded.issued_attempt
    where analysis_admission_cleanup_receipts.verified_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('uploadId',u.id,'storageKey',u.storage_key,'bucket',t.bucket,
      'objectId',t.object_id,'verified',r.verified_at is not null) order by u.id),'[]'::jsonb)
    into expected
    from private.analysis_admission_uploads u
    join private.analysis_admission_operations o on o.id=u.operation_id and o.owner_id=claimed.user_id and o.adopted_upload_id=u.id
    join private.analysis_admission_upload_transport t on t.upload_id=u.id and t.acknowledged_at is not null
    join private.analysis_admission_cleanup_receipts r on r.request_id=claimed.id and r.upload_id=u.id
    where u.id=any(handoff.adopted_upload_ids) and u.state='adopted';
  if jsonb_array_length(expected)<>cardinality(handoff.adopted_upload_ids)
    or claimed.lease_expires_at<=clock_timestamp() then
    raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
  end if;
  update private.analysis_admission_deletion_handoffs set authorized_xid=null where request_id=claimed.id;
  return result||jsonb_build_object('admissionHandoff',jsonb_build_object(
    'requestId',claimed.id,'attempt',claimed.attempt_count,'adoptedObjects',expected));
end;
$prepare_handoff$;

create function public.complete_analysis_admission_deletion_object(
  p_request_id uuid,p_worker_id text,p_attempt integer,p_upload_id uuid,p_object_id uuid
) returns boolean language plpgsql volatile security definer set search_path='' as $verify_adopted$
declare
  claimed public.data_requests%rowtype;
  observed_at timestamptz;
begin
  if private.privacy_generation_ready() is not true then
    raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';
  end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false;end if;
  if not private.try_lock_candidate_owners(array[claimed.user_id]) then return false;end if;
  if not exists(
    select 1 from private.analysis_admission_deletion_handoffs h
    join private.privacy_deletion_plans p on p.request_id=h.request_id
    join private.analysis_admission_uploads u on u.id=any(h.adopted_upload_ids)
    join private.analysis_admission_operations o on o.id=u.operation_id and o.adopted_upload_id=u.id and o.owner_id=claimed.user_id
    join private.analysis_admission_upload_transport t on t.upload_id=u.id and t.object_id=p_object_id and t.acknowledged_at is not null
    where h.request_id=claimed.id and u.id=p_upload_id and u.state='adopted'
      and h.plan_sha256=private.analysis_admission_deletion_plan_hash(p.storage_objects)
      and exists(select 1 from private.owned_ai_deletion_dispositions d where d.owner_id=claimed.user_id)
      and not exists(select 1 from public.resume_versions v where v.id=u.version_id or v.storage_key=u.storage_key)
      and not exists(select 1 from public.analyses a where a.id=u.analysis_id or a.resume_version_id=u.version_id)
      and not exists(select 1 from public.analysis_jobs j where j.analysis_id=u.analysis_id)
  ) then return false;end if;
  observed_at:=clock_timestamp();
  if claimed.lease_expires_at<=observed_at then return false;end if;
  update private.analysis_admission_cleanup_receipts set verified_at=observed_at
    where request_id=claimed.id and upload_id=p_upload_id and issued_attempt=claimed.attempt_count and verified_at is null;
  return found or exists(select 1 from private.analysis_admission_cleanup_receipts
    where request_id=claimed.id and upload_id=p_upload_id and verified_at is not null);
end;
$verify_adopted$;

revoke all on function private.analysis_admission_deletion_plan_hash(jsonb),
  private.analysis_admission_handoff_authorized(uuid,jsonb),private.stage_analysis_admission_deletion_handoff(public.data_requests)
  from public,anon,authenticated,service_role;
revoke all on function public.prepare_deletion_request_with_admission_handoff(uuid,text,integer),
  public.complete_analysis_admission_deletion_object(uuid,text,integer,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_deletion_request_with_admission_handoff(uuid,text,integer),
  public.complete_analysis_admission_deletion_object(uuid,text,integer,uuid,uuid)
  to service_role;

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
    select c.request_id,c.operation_ids,c.upload_ids,c.captured_at,
           coalesce(p.deferred_attempts,0) deferred_attempts,p.last_progress_attempt
    from private.analysis_admission_retirement_capture c
    join public.data_requests d on d.id=c.request_id
    left join private.analysis_admission_cleanup_progress p on p.request_id=c.request_id
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
    'requestId',c.request_id,'operationIds',c.operation_ids,'uploadIds',c.upload_ids,'capturedAt',c.captured_at,
    'cleanupDeferredAttempts',c.deferred_attempts,'cleanupLastProgressAttempt',c.last_progress_attempt,
    'deletionHandoff',(
      select jsonb_build_object('adoptedUploadIds',h.adopted_upload_ids,'planSha256',h.plan_sha256,
        'firstAttempt',h.first_attempt,'preparedAt',h.prepared_at)
      from private.analysis_admission_deletion_handoffs h where h.request_id=c.request_id
    ),
    'adoptedSourceBindings',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'uploadId',binding.upload_id,'sourceBindingSha256',binding.source_binding_sha256,
        'capturedAttempt',binding.captured_attempt,'capturedAt',binding.captured_at
      ) order by binding.upload_id),'[]'::jsonb)
      from private.analysis_admission_adopted_source_bindings binding where binding.request_id=c.request_id
    ),
    'storageAbsenceReceipts',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'uploadId',receipt.upload_id,'issuedAttempt',receipt.issued_attempt,'verifiedAt',receipt.verified_at
      ) order by receipt.upload_id),'[]'::jsonb)
      from private.analysis_admission_cleanup_receipts receipt where receipt.request_id=c.request_id
    )
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
