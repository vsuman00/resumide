-- Reconcile finished writes left by an interrupted upload request.
-- Owner retirement and records with unknown write outcomes remain on hold.
begin;

create function private.lock_analysis_admission_cleanup_scope(
  p_request_id uuid, p_worker_id text, p_attempt integer
) returns public.data_requests
language plpgsql volatile set search_path='' as $scope$
declare
  claimed public.data_requests%rowtype;
begin
  -- This checks the live deletion claim, locks the owner without waiting,
  -- and proves the immutable inventory still covers the exact owner scope.
  if public.capture_analysis_admission_retirement(p_request_id,p_worker_id,p_attempt) is null then
    return null;
  end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  return claimed;
end;
$scope$;

create function private.lock_analysis_admission_cleanup_uploads(
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

create function public.claim_analysis_admission_cleanup(
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
    claimed.id,claimed.user_id,null,false
  ) loop
    -- The existing immutable upload transition prevents later adoption even
    -- if this deletion claim subsequently expires or fails.
    update private.analysis_admission_uploads set state='cleanup_pending'
      where id=item.upload_id and state='prepared';
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

create function public.complete_analysis_admission_cleanup(
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
  return found or exists (
    select 1 from private.analysis_admission_uploads where id=p_upload_id and state='cleaned'
  );
end;
$complete$;

revoke all on function private.lock_analysis_admission_cleanup_scope(uuid,text,integer),
  private.lock_analysis_admission_cleanup_uploads(uuid,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_analysis_admission_cleanup(uuid,text,integer),
  public.complete_analysis_admission_cleanup(uuid,text,integer,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_analysis_admission_cleanup(uuid,text,integer),
  public.complete_analysis_admission_cleanup(uuid,text,integer,uuid,uuid)
  to service_role;

commit;
