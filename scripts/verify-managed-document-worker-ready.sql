-- Read-only preflight after exact successor replay and before fixture creation.
-- Target identity, migration receipts and exclusive use are verified separately.
begin transaction isolation level repeatable read read only;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local search_path='';
set local row_security=off;

do $worker_target$
begin
  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'DOCUMENT_WORKER_POSTGRES_MAJOR_MISMATCH' using errcode='23514';
  end if;
  if exists(select 1 from auth.users)
    or exists(select 1 from storage.objects)
    or exists(select 1 from public.analyses)
    or exists(select 1 from public.analysis_jobs)
    or exists(select 1 from public.data_requests) then
    raise exception 'DOCUMENT_WORKER_TARGET_NOT_EMPTY' using errcode='23514';
  end if;
  if not exists(select 1 from storage.buckets where id='resumes' and public is false) then
    raise exception 'DOCUMENT_WORKER_PRIVATE_BUCKET_MISSING' using errcode='23514';
  end if;
  if private.privacy_generation_ready() is not true
    or private.owned_ai_disposition_ready() is not true
    or private.owned_legacy_ai_usage_ready() is not true
    or private.ai_budget_source_ready() is not true then
    raise exception 'DOCUMENT_WORKER_CLEANUP_CONTRACT_UNAVAILABLE' using errcode='23514';
  end if;
  if not has_function_privilege('service_role',
      'public.complete_deletion_request_with_admission_retirement(uuid,text,integer)','EXECUTE')
    or has_function_privilege('anon',
      'public.complete_deletion_request_with_admission_retirement(uuid,text,integer)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.complete_deletion_request_with_admission_retirement(uuid,text,integer)','EXECUTE') then
    raise exception 'DOCUMENT_WORKER_RETIREMENT_ROLE_MISMATCH' using errcode='23514';
  end if;
end;
$worker_target$;

set local role service_role;

do $worker_readiness$
begin
  perform id from public.document_evidence_attempts limit 0;
  perform id from public.evidence_corrections limit 0;
  if public.worker_schema_readiness(true,false,null,null) is distinct from
    '{"schemaVersion":"worker-schema-readiness/1.0.0","selected":{"fencing":true,"aiBudget":false},"ready":true,"failures":[]}'::jsonb then
    raise exception 'DOCUMENT_WORKER_FENCE_READINESS_MISMATCH' using errcode='23514';
  end if;
  if public.read_document_page_count_readiness() is distinct from jsonb_build_object(
    'schemaVersion','document-page-count-readiness/1.0.0',
    'profileVersion','document-page-count-native/1.0.0',
    'checkerSha256','df95369c54acc48f5165f8f23c4d233fa2547fa34074b87ea5d665f709369cb2',
    'writerSha256','ed3c838c81a29bd131ebf543aad7cbc140ffb3ced09de76b18ba77a850dc4a54',
    'metadataSha256','88bc5d232d91e29000241223fabb32f1badcbcff71ad01d99deeb92ffeb6773b',
    'schemaReady',true,'writerExecutable',true,'fencedWriterExecutable',true) then
    raise exception 'DOCUMENT_WORKER_PAGE_COUNT_READINESS_MISMATCH' using errcode='23514';
  end if;
end;
$worker_readiness$;

reset role;
select jsonb_build_object('schemaVersion','document-worker-post-replay/1','status','ready',
  'workerFencingReady',true,'pageCountReady',true,'cleanupReady',true,
  'fixtureQueuesEmpty',true,'externalIsolationProved',false) as result;
rollback;
