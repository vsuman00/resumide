-- Requeue bounded cleanup after durable progress without crediting a failure.
begin;

create table private.analysis_admission_cleanup_progress (
  request_id uuid primary key references private.analysis_admission_retirement_capture(request_id) on delete cascade,
  last_progress_attempt integer not null check(last_progress_attempt>0),
  deferred_attempts integer not null default 0 check(deferred_attempts between 0 and 4096),
  check(deferred_attempts<=last_progress_attempt)
);
alter table private.analysis_admission_cleanup_progress enable row level security;
revoke all on private.analysis_admission_cleanup_progress from public,anon,authenticated,service_role;

create or replace function public.complete_analysis_admission_cleanup(
  p_request_id uuid, p_worker_id text, p_attempt integer, p_upload_id uuid, p_object_id uuid
) returns boolean
language plpgsql volatile security definer set search_path='' as $complete$
declare
  claimed public.data_requests%rowtype;
  item record;
begin
  if p_upload_id is null or p_object_id is null then return false; end if;
  claimed:=private.lock_analysis_admission_cleanup_scope(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false; end if;
  select * into item from private.lock_analysis_admission_cleanup_uploads(
    claimed.id,claimed.user_id,p_upload_id,true
  );
  if not found or item.object_id is distinct from p_object_id
    or claimed.lease_expires_at<=clock_timestamp() then return false; end if;
  update private.analysis_admission_uploads set state='cleaned'
    where id=p_upload_id and state='cleanup_pending';
  if found then
    insert into private.analysis_admission_cleanup_progress(request_id,last_progress_attempt)
      values(claimed.id,claimed.attempt_count)
      on conflict(request_id) do update set last_progress_attempt=excluded.last_progress_attempt;
    return true;
  end if;
  return exists (
    select 1 from private.analysis_admission_uploads where id=p_upload_id and state='cleaned'
  );
end;
$complete$;

create function public.defer_analysis_admission_cleanup(
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
    or not exists(select 1 from private.lock_analysis_admission_cleanup_uploads(claimed.id,claimed.user_id,null,false))
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

create function public.fail_analysis_admission_cleanup(
  p_request_id uuid, p_worker_id text, p_attempt integer, p_error_code text, p_max_attempts integer
) returns boolean
language plpgsql volatile security definer set search_path='' as $fail$
declare
  claimed public.data_requests%rowtype;
  credits integer;
  effective_attempts integer;
  next_status text;
begin
  if private.privacy_generation_ready() is not true then
    raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';
  end if;
  if p_error_code is null or p_error_code collate "C" !~ '^[A-Z0-9_]{1,64}$'
    or p_max_attempts is null or p_max_attempts not between 1 and 10 then return false;end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false;end if;
  select deferred_attempts into credits from private.analysis_admission_cleanup_progress
    where request_id=claimed.id;
  if not found or credits=0 then return null;end if;
  effective_attempts:=claimed.attempt_count-credits;
  if effective_attempts<1 or claimed.lease_expires_at<=clock_timestamp() then return false;end if;

  next_status:=case when effective_attempts>=p_max_attempts then 'failed' else 'queued' end;
  update public.data_requests set status=next_status,next_attempt_at=case when next_status='queued'
    then clock_timestamp()+make_interval(secs=>least(300,10*effective_attempts)) else next_attempt_at end,
    lease_owner=null,lease_expires_at=null,last_error_code=p_error_code where id=claimed.id;
  update public.privacy_request_steps set status=next_status,
    last_error_code=p_error_code,attempt_count=attempt_count+1 where request_id=claimed.id and status<>'completed';
  return true;
end;
$fail$;

revoke all on function public.defer_analysis_admission_cleanup(uuid,text,integer),
  public.fail_analysis_admission_cleanup(uuid,text,integer,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.defer_analysis_admission_cleanup(uuid,text,integer),
  public.fail_analysis_admission_cleanup(uuid,text,integer,text,integer) to service_role;

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
    'cleanupDeferredAttempts',c.deferred_attempts,'cleanupLastProgressAttempt',c.last_progress_attempt
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
