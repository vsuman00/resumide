-- Run after the managed runner reports success. Bind the five psql variables
-- from that run's private ledger. Use -X -v ON_ERROR_STOP=1 and keep input private.
begin transaction isolation level repeatable read read only;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local search_path='';
set local row_security=off;

select set_config('resumide.audit_owner', :'fixture_owner_id', true) as audit_owner,
       set_config('resumide.audit_outsider', :'fixture_outsider_id', true) as audit_outsider,
       set_config('resumide.audit_analysis', :'fixture_analysis_id', true) as audit_analysis,
       set_config('resumide.audit_request', :'fixture_request_id', true) as audit_request,
       set_config('resumide.audit_storage_key', :'fixture_storage_key', true) as audit_storage_key
\gset

do $cleanup$
declare
  uuid_pattern constant text := '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
  owner_value text := current_setting('resumide.audit_owner');
  outsider_value text := current_setting('resumide.audit_outsider');
  analysis_value text := current_setting('resumide.audit_analysis');
  request_value text := current_setting('resumide.audit_request');
  object_key text := current_setting('resumide.audit_storage_key');
  bound_owner_id uuid;
  bound_outsider_id uuid;
  bound_analysis_id uuid;
  bound_request_id uuid;
  bound_organization_id uuid;
  bound_resume_id uuid;
  bound_version_id uuid;
begin
  if not (owner_value ~ ('^'||uuid_pattern||'$')
    and outsider_value ~ ('^'||uuid_pattern||'$') and owner_value<>outsider_value
    and analysis_value ~ ('^'||uuid_pattern||'$')
    and request_value ~ ('^'||uuid_pattern||'$')
    and object_key ~ ('^organizations/'||uuid_pattern||'/resumes/'||uuid_pattern||'/versions/'||uuid_pattern||'\.pdf$')) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_SCOPE_INVALID' using errcode='23514';
  end if;
  bound_owner_id := owner_value::uuid;
  bound_outsider_id := outsider_value::uuid;
  bound_analysis_id := analysis_value::uuid;
  bound_request_id := request_value::uuid;
  bound_organization_id := split_part(object_key,'/',2)::uuid;
  bound_resume_id := split_part(object_key,'/',4)::uuid;
  bound_version_id := split_part(split_part(object_key,'/',6),'.',1)::uuid;

  if exists(select 1 from auth.users u where u.id in (bound_owner_id,bound_outsider_id))
    or exists(select 1 from public.organizations o where o.id=bound_organization_id or o.owner_id in (bound_owner_id,bound_outsider_id)) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_ACCOUNT_REMAINS' using errcode='23514';
  end if;
  if exists(select 1 from storage.objects o where o.bucket_id='resumes' and o.name=object_key) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_STORAGE_REMAINS' using errcode='23514';
  end if;
  if exists(select 1 from public.analyses a where a.id=bound_analysis_id)
    or exists(select 1 from public.resumes r where r.id=bound_resume_id)
    or exists(select 1 from public.resume_versions v where v.id=bound_version_id)
    or exists(select 1 from public.document_evidence_attempts e where e.analysis_id=bound_analysis_id)
    or exists(select 1 from public.analysis_jobs j where j.analysis_id=bound_analysis_id)
    or exists(select 1 from public.data_requests d where d.id=bound_request_id) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_APPLICATION_ROWS_REMAIN' using errcode='23514';
  end if;

  -- Upload transport is a foreign-key child of uploads. Handoffs, source
  -- bindings, progress and receipts are foreign-key children of captures.
  if exists(select 1 from private.analysis_admission_operations a where a.owner_id in (bound_owner_id,bound_outsider_id))
    or exists(select 1 from private.analysis_admission_uploads u where u.analysis_id=bound_analysis_id or u.storage_key=object_key)
    or exists(select 1 from private.analysis_admission_retirement_capture c where c.request_id=bound_request_id)
    or exists(select 1 from private.analysis_admission_retirement_authority a where a.request_id=bound_request_id)
    or exists(select 1 from private.privacy_deletion_plans p where p.request_id=bound_request_id) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_ADMISSION_ROWS_REMAIN' using errcode='23514';
  end if;

  if not exists(
    select 1 from private.owned_ai_deletion_dispositions d
    where d.owner_id=bound_owner_id and d.first_request_id=bound_request_id and d.phase='prepared'
      and isfinite(d.prepared_at) and d.prepared_at<=statement_timestamp()
      and d.expires_at=d.prepared_at+interval '720 hours' and d.expires_at>statement_timestamp()
  ) or exists(select 1 from private.owned_ai_deletion_dispositions d where d.owner_id=bound_outsider_id)
    or exists(select 1 from private.owned_ai_operation_dispositions d where d.owner_id in (bound_owner_id,bound_outsider_id)) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_DISPOSITION_MISMATCH' using errcode='23514';
  end if;

  -- The single upload consumes one admission token. The bucket has no Auth FK
  -- and its technical rate metadata is separate from AI accounting retention.
  if not exists(
    select 1 from private.analysis_rate_limit_buckets b
    where b.bucket_key=encode(sha256(convert_to(owner_value,'UTF8')),'hex') and b.request_count=1
  ) or exists(
    select 1 from private.analysis_rate_limit_buckets b
    where b.bucket_key=encode(sha256(convert_to(outsider_value,'UTF8')),'hex')
  ) then
    raise exception 'DOCUMENT_WORKER_CLEANUP_RATE_SCOPE_MISMATCH' using errcode='23514';
  end if;
end;
$cleanup$;

select jsonb_build_object('schemaVersion','document-worker-post-cleanup/1','status','verified',
  'exactFixtureRowsAbsent',true,'accountingWriteBarrierRetained',true,'analysisRateBucketRetained',true);
rollback;
