-- Bind Storage absence to a live request and the exact upload selected for it.
begin;

create table private.analysis_admission_cleanup_receipts (
  request_id uuid not null references private.analysis_admission_retirement_capture(request_id) on delete cascade,
  upload_id uuid not null references private.analysis_admission_uploads(id) on delete restrict,
  issued_attempt integer not null check(issued_attempt>0),
  verified_at timestamptz,
  primary key(request_id,upload_id)
);
alter table private.analysis_admission_cleanup_receipts enable row level security;
revoke all on private.analysis_admission_cleanup_receipts from public,anon,authenticated,service_role;

create or replace function private.lock_analysis_admission_cleanup_uploads(
  p_request_id uuid, p_owner_id uuid, p_upload_id uuid, p_include_cleaned boolean
) returns table (
  upload_id uuid, organization_id uuid, resume_id uuid, version_id uuid,
  bucket text, storage_key text, object_id uuid
)
language sql volatile set search_path='' as $uploads$
  select u.id,o.organization_id,u.resume_id,u.version_id,t.bucket,u.storage_key,t.object_id
  from private.analysis_admission_retirement_capture c
  join private.analysis_admission_operations o on o.id=any(c.operation_ids)
  join private.analysis_admission_uploads u on u.operation_id=o.id and u.id=any(c.upload_ids)
  join private.analysis_admission_upload_transport t on t.upload_id=u.id
  where c.request_id=p_request_id and o.owner_id=p_owner_id
    and (p_upload_id is null or u.id=p_upload_id)
    and (u.state in ('prepared','cleanup_pending') or (p_include_cleaned and u.state='cleaned'))
    and o.adopted_upload_id is distinct from u.id
    and (p_upload_id is not null or not exists (
      select 1 from private.analysis_admission_cleanup_receipts proof
      where proof.request_id=c.request_id and proof.upload_id=u.id and proof.verified_at is not null
    ))
    and t.dispatched_at is not null and t.acknowledged_at is not null
    and t.object_id is not null and t.bucket is not null
    and u.storage_key='organizations/'||o.organization_id||'/resumes/'||u.resume_id||'/versions/'||u.version_id||'.pdf'
    and not exists(select 1 from public.analyses a where a.id=u.analysis_id)
    and not exists(select 1 from public.analysis_jobs j where j.analysis_id=u.analysis_id)
    and not exists(select 1 from public.resume_versions v where v.id=u.version_id or v.storage_key=u.storage_key)
    and not exists(select 1 from public.resumes r where r.id=u.resume_id)
    and not exists(select 1 from public.jobs j where j.id=u.job_id)
  order by u.id limit 4
  for update of u skip locked;
$uploads$;

create or replace function public.claim_analysis_admission_cleanup(
  p_request_id uuid, p_worker_id text, p_attempt integer
) returns jsonb
language plpgsql volatile security definer set search_path='' as $claim$
declare
  claimed public.data_requests%rowtype;
  item record;
  uploads jsonb:='[]'::jsonb;
begin
  claimed:=private.lock_analysis_admission_cleanup_scope(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return null; end if;
  for item in select * from private.lock_analysis_admission_cleanup_uploads(
    claimed.id,claimed.user_id,null,true
  ) loop
    -- The existing immutable upload transition prevents later adoption even
    -- if this deletion claim subsequently expires or fails.
    update private.analysis_admission_uploads set state='cleanup_pending'
      where id=item.upload_id and state='prepared';
    insert into private.analysis_admission_cleanup_receipts(request_id,upload_id,issued_attempt)
      values(claimed.id,item.upload_id,claimed.attempt_count)
      on conflict(request_id,upload_id) do update set issued_attempt=excluded.issued_attempt
      where analysis_admission_cleanup_receipts.verified_at is null;
    uploads:=uploads||jsonb_build_array(jsonb_build_object(
      'uploadId',item.upload_id,'organizationId',item.organization_id,
      'resumeId',item.resume_id,'versionId',item.version_id,
      'bucket',item.bucket,'storageKey',item.storage_key,'objectId',item.object_id
    ));
  end loop;
  if claimed.lease_expires_at<=clock_timestamp() then
    raise exception 'ADMISSION_CLEANUP_CLAIM_EXPIRED' using errcode='55P03';
  end if;
  return jsonb_build_object('requestId',claimed.id,'attempt',claimed.attempt_count,'uploads',uploads);
end;
$claim$;

create or replace function public.complete_analysis_admission_cleanup(
  p_request_id uuid, p_worker_id text, p_attempt integer, p_upload_id uuid, p_object_id uuid
) returns boolean
language plpgsql volatile security definer set search_path='' as $complete$
declare
  claimed public.data_requests%rowtype;
  item record;
  receipt private.analysis_admission_cleanup_receipts%rowtype;
  observed_at timestamptz;
begin
  if p_upload_id is null or p_object_id is null then return false; end if;
  claimed:=private.lock_analysis_admission_cleanup_scope(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false; end if;
  select * into item from private.lock_analysis_admission_cleanup_uploads(
    claimed.id,claimed.user_id,p_upload_id,true
  );
  if not found or item.object_id is distinct from p_object_id
    or claimed.lease_expires_at<=clock_timestamp() then return false; end if;
  select * into receipt from private.analysis_admission_cleanup_receipts
    where request_id=claimed.id and upload_id=p_upload_id for update;
  if not found then return false; end if;
  if receipt.verified_at is not null then return true; end if;
  if receipt.issued_attempt is distinct from claimed.attempt_count then return false; end if;

  update private.analysis_admission_uploads set state='cleaned'
    where id=p_upload_id and state='cleanup_pending';
  if not found and not exists (
    select 1 from private.analysis_admission_uploads where id=p_upload_id and state='cleaned'
  ) then return false; end if;

  observed_at:=clock_timestamp();
  if claimed.lease_expires_at<=observed_at then
    raise exception 'ADMISSION_CLEANUP_CLAIM_EXPIRED' using errcode='55P03';
  end if;
  update private.analysis_admission_cleanup_receipts set verified_at=observed_at
    where request_id=claimed.id and upload_id=p_upload_id;
  insert into private.analysis_admission_cleanup_progress(request_id,last_progress_attempt)
    values(claimed.id,claimed.attempt_count)
    on conflict(request_id) do update set last_progress_attempt=excluded.last_progress_attempt;
  return true;
end;
$complete$;

create or replace function public.defer_analysis_admission_cleanup(
  p_request_id uuid, p_worker_id text, p_attempt integer
) returns boolean
language plpgsql volatile security definer set search_path='' as $defer$
declare
  claimed public.data_requests%rowtype;
  progress private.analysis_admission_cleanup_progress%rowtype;
begin
  claimed:=private.lock_analysis_admission_cleanup_scope(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false;end if;
  select * into progress from private.analysis_admission_cleanup_progress
    where request_id=claimed.id for update;
  if not found or progress.last_progress_attempt is distinct from claimed.attempt_count
    or progress.deferred_attempts>=claimed.attempt_count or progress.deferred_attempts>=4096
    or not exists(select 1 from private.lock_analysis_admission_cleanup_uploads(claimed.id,claimed.user_id,null,true))
    or claimed.lease_expires_at<=clock_timestamp() then return false;end if;

  update private.analysis_admission_cleanup_progress
    set deferred_attempts=deferred_attempts+1 where request_id=claimed.id;
  update public.data_requests set status='queued', lease_owner=null, lease_expires_at=null,
    next_attempt_at=clock_timestamp()+interval '1 second', last_error_code='ADMISSION_RETIREMENT_REQUIRED'
    where id=claimed.id;
  update public.privacy_request_steps set status='queued',last_error_code='ADMISSION_RETIREMENT_REQUIRED'
    where request_id=claimed.id and status<>'completed';
  return true;
end;
$defer$;

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
