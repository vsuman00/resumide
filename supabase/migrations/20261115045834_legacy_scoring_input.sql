-- A13 original legacy scoring inputs. SOURCE ONLY; SQL UNPARSED/UNEXECUTED.
-- No score/rule/producer change, backfill, activation or old-body replacement.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create table private.analysis_scoring_inputs (
 analysis_id uuid primary key references public.analysis_deterministic_results(analysis_id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 resume_id uuid not null references public.resumes(id) on delete cascade,
 resume_version_id uuid not null references public.resume_versions(id) on delete cascade,
 extraction_analysis_id uuid not null references public.analysis_extractions(analysis_id) on delete cascade check(extraction_analysis_id=analysis_id),
 job_id uuid references public.jobs(id) on delete cascade,
 worker_id text not null check(worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 attempt integer not null check(attempt between 1 and 3),lease_fence uuid not null,
 process_id text not null check(process_id ~ '^[ -~]{1,128}$'),request_id text not null check(request_id ~ '^[ -~]{1,128}$'),
 input_context jsonb not null check(jsonb_typeof(input_context)='object' and octet_length(convert_to(input_context::text,'UTF8'))<=4194304),
 input_binding_sha256 text not null check(input_binding_sha256 ~ '^[a-f0-9]{64}$'),
 result_checksum text not null check(result_checksum ~ '^[a-f0-9]{64}$'),
 deterministic_content_sha256 text not null check(deterministic_content_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.analysis_scoring_inputs enable row level security;
revoke all on private.analysis_scoring_inputs from public,anon,authenticated,service_role;

create function private.legacy_scoring_fail(p_code text) returns void
language plpgsql volatile set search_path='' as $legacy_0$
begin
  case p_code
  when 'invalid' then raise exception 'LEGACY_SCORING_INVALID' using errcode='22023';
  when 'not_found' then raise exception 'LEGACY_SCORING_NOT_FOUND' using errcode='42501';
  when 'stale' then raise exception 'LEGACY_SCORING_STALE' using errcode='P0C01';
  else raise exception 'LEGACY_SCORING_UNAVAILABLE' using errcode='P0C03';end case;
end;
$legacy_0$;

create function private.legacy_scoring_keys(p_value jsonb,p_keys text[]) returns boolean
language plpgsql stable set search_path='' as $legacy_1$
begin
  return jsonb_typeof(p_value)='object' and (select array_agg(key order by key) from jsonb_object_keys(p_value) key)
    is not distinct from (select array_agg(key order by key) from unnest(p_keys) key);
end;
$legacy_1$;

create function private.legacy_scoring_lease(p_lease jsonb) returns boolean
language plpgsql stable set search_path='' as $legacy_2$
begin
  return private.legacy_scoring_keys(p_lease,array['workerId','attempt','leaseFence']) is true
    and jsonb_typeof(p_lease->'workerId')='string' and p_lease->>'workerId' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and jsonb_typeof(p_lease->'attempt')='number' and p_lease->>'attempt' ~ '^[1-3]$'
    and jsonb_typeof(p_lease->'leaseFence')='string' and p_lease->>'leaseFence' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
end;
$legacy_2$;

create function private.legacy_scoring_access(p_analysis_id uuid,p_user_id uuid) returns public.analyses
language plpgsql volatile set search_path='' as $legacy_3$
declare a public.analyses%rowtype;v public.resume_versions%rowtype;
begin
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or (p_user_id is not null and a.owner_id<>p_user_id) then perform private.legacy_scoring_fail('not_found');end if;
  if not private.try_candidate_privacy_write(a.owner_id) then perform private.legacy_scoring_fail('not_found');end if;
  -- Same analysis -> queue -> membership -> source/root order as the stage fence.
  perform 1 from public.analysis_jobs where analysis_id=a.id for update;
  perform 1 from public.memberships where organization_id=a.organization_id and user_id=a.owner_id
    and role in ('owner','admin','member') for share skip locked;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  select * into v from public.resume_versions where id=a.resume_version_id and organization_id=a.organization_id
    and owner_id=a.owner_id for no key update skip locked;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  perform 1 from public.resumes where id=v.resume_id and organization_id=a.organization_id and owner_id=a.owner_id
    and status='active' for share skip locked;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  -- Every evidence-v2 attempt remains uncalibrated. No new scored path bypass.
  if exists(select 1 from public.document_evidence_attempts where analysis_id=a.id) then perform private.legacy_scoring_fail('unavailable');end if;
  return a;
end;
$legacy_3$;

create function private.legacy_scoring_static_job(p_analysis_id uuid,p_lease jsonb) returns boolean
language plpgsql stable set search_path='' as $legacy_4$
begin
  return exists(select 1 from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_lease->>'workerId'
    and attempt_count=(p_lease->>'attempt')::integer and lease_fence=(p_lease->>'leaseFence')::uuid);
end;
$legacy_4$;

create function private.legacy_scoring_input_data(p_analysis public.analyses) returns jsonb
language plpgsql volatile set search_path='' as $legacy_5$
declare e public.analysis_extractions%rowtype;v public.resume_versions%rowtype;j public.jobs%rowtype;
  source_value jsonb;extraction_value jsonb;job_value jsonb;producer_value jsonb;core_value jsonb;binding_value jsonb;answer jsonb;
begin
  select * into v from public.resume_versions where id=p_analysis.resume_version_id and owner_id=p_analysis.owner_id and organization_id=p_analysis.organization_id;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  select * into e from public.analysis_extractions where analysis_id=p_analysis.id and owner_id=p_analysis.owner_id
    and organization_id=p_analysis.organization_id for share;
  if not found then perform private.legacy_scoring_fail('unavailable');end if;
  if e.page_count not between 1 and 20 or char_length(e.extracted_text) not between 1 and 200000
    or e.text_checksum is distinct from encode(sha256(convert_to(e.extracted_text,'UTF8')),'hex')
    or jsonb_typeof(e.page_texts) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(e.page_texts) x where jsonb_typeof(x) is distinct from 'string') then perform private.legacy_scoring_fail('unavailable');end if;
  if p_analysis.request_id is not null and p_analysis.request_id !~ '^[ -~]{1,128}$' then perform private.legacy_scoring_fail('unavailable');end if;
  source_value:=jsonb_build_object('resumeId',v.resume_id,'resumeVersionId',v.id,'fileChecksum',v.checksum,'bytes',v.bytes,'mediaType',v.media_type);
  extraction_value:=jsonb_build_object('text',e.extracted_text,'pageCount',e.page_count,'pageTexts',e.page_texts,'textChecksum',e.text_checksum,'extractorVersion',e.extractor_version);
  extraction_value:=extraction_value||jsonb_build_object('contentSha256',encode(sha256(convert_to(extraction_value::text,'UTF8')),'hex'));
  if p_analysis.job_id is null then job_value:=jsonb_build_object('kind','none');
  else
    select * into j from public.jobs where id=p_analysis.job_id and owner_id=p_analysis.owner_id and organization_id=p_analysis.organization_id for share;
    if not found then perform private.legacy_scoring_fail('not_found');end if;
    job_value:=jsonb_build_object('kind','owned_job','id',j.id,'title',j.title,'description',j.description,'companyName',j.company_name);
    job_value:=job_value||jsonb_build_object('contentSha256',encode(sha256(convert_to(job_value::text,'UTF8')),'hex'));
  end if;
  producer_value:=jsonb_build_object('parserVersion','parse-sim-v1','rulesetVersion','ats-rules-v4','normalizerVersion','normalizer-v1','taxonomyVersion','skills-taxonomy-v1');
  core_value:=jsonb_build_object('schemaVersion','legacy-scoring-input-snapshot/1.0.0','analysisId',p_analysis.id,'ownerId',p_analysis.owner_id,
    'organizationId',p_analysis.organization_id,'source',source_value,'extraction',extraction_value,'job',job_value,'producer',producer_value);
  binding_value:=jsonb_build_object('schemaVersion','legacy-scoring-binding/1.0.0','analysisId',p_analysis.id,'ownerId',p_analysis.owner_id,
    'organizationId',p_analysis.organization_id,'resumeId',v.resume_id,'resumeVersionId',v.id,'fileChecksum',v.checksum,'textChecksum',e.text_checksum,
    'extractionSha256',extraction_value->>'contentSha256','jobId',p_analysis.job_id,'jobSha256',job_value->>'contentSha256',
    'inputBindingSha256',encode(sha256(convert_to(core_value::text,'UTF8')),'hex'));
  answer:=(core_value-'schemaVersion')||jsonb_build_object('schemaVersion','legacy-scoring-input/1.0.0','requestId',p_analysis.request_id,'binding',binding_value);
  if octet_length(convert_to(answer::text,'UTF8'))>4194304 then perform private.legacy_scoring_fail('unavailable');end if;
  return answer;
end;
$legacy_5$;

create function private.legacy_scoring_result(p_row public.analysis_deterministic_results) returns jsonb
language plpgsql stable set search_path='' as $legacy_6$
begin
  return jsonb_build_object('score',p_row.score,'parseView',p_row.parse_view,'ruleTrace',p_row.rule_trace,'keywordCoverage',p_row.keyword_coverage,
    'inputTextChecksum',p_row.input_text_checksum,'parserVersion',p_row.parser_version,'rulesetVersion',p_row.ruleset_version,
    'normalizerVersion',p_row.normalizer_version,'taxonomyVersion',p_row.taxonomy_version,'resultChecksum',p_row.result_checksum);
end;
$legacy_6$;

create function private.legacy_scoring_receipt(p_row private.analysis_scoring_inputs,p_replayed boolean) returns jsonb
language plpgsql stable set search_path='' as $legacy_7$
begin
  return jsonb_build_object('schemaVersion','legacy-scoring-receipt/1.0.0','analysisId',p_row.analysis_id,'ownerId',p_row.owner_id,
    'organizationId',p_row.organization_id,'resumeVersionId',p_row.resume_version_id,'inputBindingSha256',p_row.input_binding_sha256,
    'resultChecksum',p_row.result_checksum,'deterministicContentSha256',p_row.deterministic_content_sha256,
    'createdAt',to_char(p_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'replayed',p_replayed);
end;
$legacy_7$;

create function private.legacy_scoring_row_sha256(p_row public.analysis_deterministic_results) returns text
language plpgsql stable set search_path='' as $legacy_15$
begin
  -- created_at is the only temporal column in this actual record. Keep all row
  -- fields/identity; replace its session-dependent JSON timestamp before hashing.
  return encode(sha256(convert_to((to_jsonb(p_row)||jsonb_build_object('created_at',
    to_char(p_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex');
end;
$legacy_15$;

create function private.guard_legacy_scoring_input() returns trigger
language plpgsql volatile set search_path='' as $legacy_8$
declare a public.analyses%rowtype;d public.analysis_deterministic_results%rowtype;actual jsonb;
begin
  if tg_op='UPDATE' then raise exception 'LEGACY_SCORING_INPUT_IMMUTABLE' using errcode='23514';end if;
  a:=private.legacy_scoring_access(new.analysis_id,new.owner_id);
  actual:=private.legacy_scoring_input_data(a);
  select * into d from public.analysis_deterministic_results where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  if not found or new.input_context is distinct from actual or new.organization_id<>a.organization_id
    or new.resume_version_id<>a.resume_version_id or new.resume_id::text is distinct from actual->'source'->>'resumeId'
    or new.extraction_analysis_id<>a.id or new.job_id is distinct from a.job_id
    or not private.legacy_scoring_static_job(a.id,jsonb_build_object('workerId',new.worker_id,'attempt',new.attempt,'leaseFence',new.lease_fence))
    or new.input_binding_sha256 is distinct from actual->'binding'->>'inputBindingSha256'
    or new.result_checksum is distinct from d.result_checksum
    or new.deterministic_content_sha256 is distinct from private.legacy_scoring_row_sha256(d) then
    raise exception 'LEGACY_SCORING_INPUT_BINDING' using errcode='23514';end if;
  return new;
end;
$legacy_8$;

create function public.read_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $legacy_9$
declare a public.analyses%rowtype;s private.analysis_scoring_inputs%rowtype;d public.analysis_deterministic_results%rowtype;context_value jsonb;
begin
  if private.legacy_scoring_lease(p_lease) is not true then perform private.legacy_scoring_fail('invalid');end if;
  a:=private.legacy_scoring_access(p_analysis_id,null);
  if not private.legacy_scoring_ready() then perform private.legacy_scoring_fail('unavailable');end if;
  select * into s from private.analysis_scoring_inputs where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  if found then
    if p_lease is distinct from jsonb_build_object('workerId',s.worker_id,'attempt',s.attempt,'leaseFence',s.lease_fence)
      and not private.legacy_scoring_static_job(a.id,p_lease) then perform private.legacy_scoring_fail('not_found');end if;
    select * into d from public.analysis_deterministic_results where analysis_id=a.id;
    if not found or s.deterministic_content_sha256 is distinct from private.legacy_scoring_row_sha256(d) then perform private.legacy_scoring_fail('unavailable');end if;
    return jsonb_build_object('schemaVersion','legacy-scoring-read/1.0.0','status','committed','receipt',private.legacy_scoring_receipt(s,true));
  end if;
  if not private.legacy_scoring_static_job(a.id,p_lease) then perform private.legacy_scoring_fail('not_found');end if;
  if a.status<>'scoring' then return jsonb_build_object('schemaVersion','legacy-scoring-read/1.0.0','status','skipped','analysisId',a.id,'reason','not_scoring');end if;
  if exists(select 1 from public.analysis_deterministic_results where analysis_id=a.id) then perform private.legacy_scoring_fail('unavailable');end if;
  if not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid) then perform private.legacy_scoring_fail('stale');end if;
  context_value:=private.legacy_scoring_input_data(a);
  if not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
    or not private.try_candidate_privacy_write(a.owner_id) then perform private.legacy_scoring_fail('stale');end if;
  return jsonb_build_object('schemaVersion','legacy-scoring-read/1.0.0','status','ready','context',context_value);
end;
$legacy_9$;

create function public.finish_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb,p_binding jsonb,p_result jsonb,p_process_id text,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $legacy_10$
declare a public.analyses%rowtype;s private.analysis_scoring_inputs%rowtype;d public.analysis_deterministic_results%rowtype;
  context_value jsonb;persisted boolean;
begin
  if private.legacy_scoring_lease(p_lease) is not true or p_process_id is null or p_process_id !~ '^[ -~]{1,128}$'
    or p_request_id is null or p_request_id !~ '^[ -~]{1,128}$'
    or private.legacy_scoring_keys(p_binding,array['schemaVersion','analysisId','ownerId','organizationId','resumeId','resumeVersionId','fileChecksum','textChecksum','extractionSha256','jobId','jobSha256','inputBindingSha256']) is not true
    or private.legacy_scoring_keys(p_result,array['score','parseView','ruleTrace','keywordCoverage','inputTextChecksum','parserVersion','rulesetVersion','normalizerVersion','taxonomyVersion','resultChecksum']) is not true
    or octet_length(convert_to(p_result::text,'UTF8'))>4194304 or octet_length(convert_to(p_binding::text,'UTF8'))>4194304
    or jsonb_typeof(p_result->'score') is distinct from 'number' or p_result->>'score' !~ '^(0|[1-9][0-9]?|100)$'
    or jsonb_typeof(p_result->'parseView') is distinct from 'object' or jsonb_typeof(p_result->'ruleTrace') is distinct from 'array'
    or private.legacy_scoring_keys(p_result->'keywordCoverage',array['taxonomyVersion','job','matched','missing','uncertain','evidence']) is not true
    or p_result->>'parserVersion' is distinct from 'parse-sim-v1' or p_result->>'rulesetVersion' is distinct from 'ats-rules-v4'
    or p_result->>'normalizerVersion' is distinct from 'normalizer-v1' or p_result->>'taxonomyVersion' is distinct from 'skills-taxonomy-v1'
    or p_result->'keywordCoverage'->>'taxonomyVersion' is distinct from 'skills-taxonomy-v1'
    or jsonb_typeof(p_result->'resultChecksum') is distinct from 'string' or p_result->>'resultChecksum' !~ '^[a-f0-9]{64}$' then perform private.legacy_scoring_fail('invalid');end if;
  a:=private.legacy_scoring_access(p_analysis_id,null);
  if not private.legacy_scoring_ready() then perform private.legacy_scoring_fail('unavailable');end if;
  select * into s from private.analysis_scoring_inputs where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  -- Exact original receipt precedes fresh status, current lease and mutable JD.
  if found then
    select * into d from public.analysis_deterministic_results where analysis_id=a.id;
    if not found or s.input_context->'binding' is distinct from p_binding
      or p_lease is distinct from jsonb_build_object('workerId',s.worker_id,'attempt',s.attempt,'leaseFence',s.lease_fence)
      or private.legacy_scoring_result(d) is distinct from p_result
      or s.deterministic_content_sha256 is distinct from private.legacy_scoring_row_sha256(d) then perform private.legacy_scoring_fail('stale');end if;
    return private.legacy_scoring_receipt(s,true);
  end if;
  if a.status<>'scoring' or exists(select 1 from public.analysis_deterministic_results where analysis_id=a.id)
    or not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid) then perform private.legacy_scoring_fail('stale');end if;
  context_value:=private.legacy_scoring_input_data(a);
  if p_binding is distinct from context_value->'binding' or p_result->'inputTextChecksum' is distinct from context_value->'extraction'->'textChecksum' then perform private.legacy_scoring_fail('stale');end if;
  -- No exception is converted to a successful JSON receipt. Any false result or
  -- post-check raises, rolling back the old insert/transition and new proof.
  begin
    persisted:=public.persist_deterministic_analysis(a.id,p_result->>'inputTextChecksum',p_result->'keywordCoverage',p_result->>'normalizerVersion',
      p_result->'parseView',p_result->>'parserVersion',p_process_id,p_request_id,p_result->>'resultChecksum',p_result->'ruleTrace',
      p_result->>'rulesetVersion',(p_result->>'score')::integer,p_result->>'taxonomyVersion');
    if persisted is not true then perform private.legacy_scoring_fail('stale');end if;
    select * into d from public.analysis_deterministic_results where analysis_id=a.id for update;
    if not found or d.owner_id<>a.owner_id or d.organization_id<>a.organization_id or private.legacy_scoring_result(d) is distinct from p_result then perform private.legacy_scoring_fail('unavailable');end if;
    insert into private.analysis_scoring_inputs(analysis_id,organization_id,owner_id,resume_id,resume_version_id,extraction_analysis_id,job_id,
      worker_id,attempt,lease_fence,process_id,request_id,input_context,input_binding_sha256,result_checksum,deterministic_content_sha256)
    values(a.id,a.organization_id,a.owner_id,(context_value->'source'->>'resumeId')::uuid,a.resume_version_id,a.id,a.job_id,
      p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid,p_process_id,p_request_id,context_value,
      p_binding->>'inputBindingSha256',d.result_checksum,private.legacy_scoring_row_sha256(d)) returning * into s;
    if not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
      or not private.try_candidate_privacy_write(a.owner_id) then perform private.legacy_scoring_fail('stale');end if;
    return private.legacy_scoring_receipt(s,false);
  end;
end;
$legacy_10$;

create function public.read_legacy_scoring_context(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $legacy_11$
declare a public.analyses%rowtype;s private.analysis_scoring_inputs%rowtype;d public.analysis_deterministic_results%rowtype;actual jsonb;
begin
  if p_user_id is null then perform private.legacy_scoring_fail('invalid');end if;
  a:=private.legacy_scoring_access(p_analysis_id,p_user_id);
  if not private.legacy_scoring_ready() then perform private.legacy_scoring_fail('unavailable');end if;
  select * into d from public.analysis_deterministic_results where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  select * into s from private.analysis_scoring_inputs where analysis_id=a.id and owner_id=p_user_id and organization_id=a.organization_id;
  if not found then return jsonb_build_object('schemaVersion','legacy-scoring-context/1.0.0','status','legacy_unbound','analysisId',a.id,'reason','original_input_binding_missing');end if;
  if s.deterministic_content_sha256 is distinct from private.legacy_scoring_row_sha256(d) then perform private.legacy_scoring_fail('unavailable');end if;
  actual:=private.legacy_scoring_input_data(a);
  return jsonb_build_object('schemaVersion','legacy-scoring-context/1.0.0','status','bound',
    'currentness',case when actual->'binding' is not distinct from s.input_context->'binding' then 'current' else 'historical' end,
    'context',s.input_context,'result',private.legacy_scoring_result(d),'receipt',private.legacy_scoring_receipt(s,true));
end;
$legacy_11$;

create function public.export_legacy_scoring_inputs(p_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $legacy_12$
declare answer jsonb;item jsonb;row_count integer;total_bytes bigint:=256;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then perform private.legacy_scoring_fail('not_found');end if;
  if not private.legacy_scoring_ready() then perform private.legacy_scoring_fail('unavailable');end if;
  select count(*) into row_count from (select 1 from private.analysis_scoring_inputs where owner_id=p_user_id limit 4097) limited;
  if row_count>4096 then perform private.legacy_scoring_fail('unavailable');end if;
  for item in select to_jsonb(s)||jsonb_build_object('created_at',to_char(s.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) from private.analysis_scoring_inputs s where owner_id=p_user_id loop
    total_bytes:=total_bytes+octet_length(convert_to(item::text,'UTF8'))+2;
    if total_bytes>33554432 then perform private.legacy_scoring_fail('unavailable');end if;
  end loop;
  select jsonb_build_object('schemaVersion','legacy-scoring-export/1.0.0','scoringInputs',coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('created_at',to_char(s.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by s.analysis_id),'[]'::jsonb)) into answer
    from private.analysis_scoring_inputs s where owner_id=p_user_id;
  if octet_length(convert_to(answer::text,'UTF8'))>33554432 then perform private.legacy_scoring_fail('unavailable');end if;
  return answer;
end;
$legacy_12$;

create function public.read_legacy_scoring_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $legacy_13$
begin
  return jsonb_build_object('schemaVersion','legacy-scoring-readiness/1.0.0','profileVersion','legacy-scoring-profile/1.0.0',
    'schemaReady',private.legacy_scoring_ready(),'writerExecutable',has_function_privilege('service_role',to_regprocedure('public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)'),'EXECUTE'),
    'checkerSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('private.legacy_scoring_ready()')),
    'readerSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.read_legacy_scoring_input(uuid,jsonb)')),
    'finishSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)')),
    'contextSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.read_legacy_scoring_context(uuid,uuid)')),
    'exportSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.export_legacy_scoring_inputs(uuid)')),
    'metadataSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.read_legacy_scoring_readiness()')));
end;
$legacy_13$;

create function private.legacy_scoring_ready() returns boolean
language plpgsql stable set search_path='' as $legacy_14$
declare p pg_catalog.pg_proc%rowtype;base pg_catalog.pg_proc%rowtype;item jsonb;role_name text;
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');rel pg_catalog.pg_class%rowtype;
  manifest jsonb:=$legacy_catalog$[
  {
    "signature": "public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)",
    "sha256": "8ccb108f8e38b4634cfe6b9e6e8c3e946272637cca6f0872c6e8213d313c631a",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "acl": "service"
  },
  {
    "signature": "private.lock_analysis_stage_lease(uuid,text,integer,uuid)",
    "sha256": "d5bf2c2c633833a174f5351275b6b09eb4c8bf945bd7c6c889eaa6ef64893883",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.try_candidate_privacy_write(uuid)",
    "sha256": "89e7eec219295b7c834c284012ba7144049380935273e1505a994d38efc4156d",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.candidate_write_blocked(uuid)",
    "sha256": "e94533690339986bb0e0889ec2f98de0687c6061e80b490a7040e5c40cadd53b",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.block_unreviewed_evidence_scores()",
    "sha256": "094fbfee09e0d22c482be9a835ac8fd30ba1390f798d06623ce3e0989f1f78e6",
    "definer": true,
    "volatility": "v",
    "resultType": "trigger",
    "acl": "private"
  },
  {
    "signature": "public.transition_analysis(uuid,text,text,uuid,text,text)",
    "sha256": "eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "acl": "service"
  },
  {
    "signature": "private.legacy_scoring_fail(text)",
    "sha256": "e335af12e27203158cf4d8088b4be71e95632300802ae79620449baf46685f33",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_keys(jsonb,text[])",
    "sha256": "066c21162bd2ac12717eb3bb9609ba615bd217d922b5e266d4d6e59f9ce4d9a3",
    "definer": false,
    "volatility": "s",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_lease(jsonb)",
    "sha256": "fa753641ed86c2b4c6404ab96d390b53852ccf59aff7fe10750f258b7d5d5dbf",
    "definer": false,
    "volatility": "s",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_access(uuid,uuid)",
    "sha256": "faea49c97ab2244d1400d8aaf7f31e401933810017dbb92c1e67aa725641c05c",
    "definer": false,
    "volatility": "v",
    "resultType": "public.analyses",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_static_job(uuid,jsonb)",
    "sha256": "1700af1f41c303ac4a54d80246143655c392dd4b1e94c3362a46c2f690f603b8",
    "definer": false,
    "volatility": "s",
    "resultType": "boolean",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_input_data(public.analyses)",
    "sha256": "3095bfe7147e4566b41bb7ced421ff671811565da3743765a3b28d94dda8de41",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_result(public.analysis_deterministic_results)",
    "sha256": "53312027b70370060adb611dca630dc3ec8171359d0f51d20d0ef5899d1acdeb",
    "definer": false,
    "volatility": "s",
    "resultType": "jsonb",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_receipt(private.analysis_scoring_inputs,boolean)",
    "sha256": "2c8ed25bf130498f48c27e7d64f95ecfdf463a132b256efa8473952e35cefd30",
    "definer": false,
    "volatility": "s",
    "resultType": "jsonb",
    "acl": "private"
  },
  {
    "signature": "private.guard_legacy_scoring_input()",
    "sha256": "ea7d6fe35a0e407663c0d286c4afea53899ab17c4a8138b92640eaac0d09ecbd",
    "definer": false,
    "volatility": "v",
    "resultType": "trigger",
    "acl": "private"
  },
  {
    "signature": "public.read_legacy_scoring_input(uuid,jsonb)",
    "sha256": "1b9891fc6ece7e948c4623b6455686a2fc42e4896ff3fcc78f0ce0275a44d7c3",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)",
    "sha256": "e367a8f688b2661fc8baa374ad44a4be90712016d3ed44214857ed1127e10f18",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_legacy_scoring_context(uuid,uuid)",
    "sha256": "c79b6174de5e28fc56a0cb3648d5e1cc4e19ff5139f2869ce54478c9cf6cf618",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.export_legacy_scoring_inputs(uuid)",
    "sha256": "e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_legacy_scoring_readiness()",
    "sha256": "f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "acl": "metadata"
  },
  {
    "signature": "private.legacy_scoring_row_sha256(public.analysis_deterministic_results)",
    "sha256": "21536d110f524fc5acabb42f588d302fd3558811c2c42787f86c08579c98b26f",
    "definer": false,
    "volatility": "s",
    "resultType": "text",
    "acl": "private"
  }
]$legacy_catalog$::jsonb;
begin
  select * into base from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
  if not found or service_oid is null then return false;end if;
  for item in select value from jsonb_array_elements(manifest) loop
    select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proowner<>base.proowner
      or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname=case when item->>'signature'='private.candidate_write_blocked(uuid)' then 'sql' else 'plpgsql' end)
      or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
      or p.proconfig is distinct from array['search_path=""'] or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>item->>'sha256' then return false;end if;
    if item->>'acl' in ('optional_service','metadata','private','service') then
      if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
        and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
      foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
      if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
      if item->>'acl' in ('metadata','service') and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
      if item->>'acl' in ('optional_service','metadata','service') and has_function_privilege('service_role',p.oid,'EXECUTE')
        and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=service_oid and a.privilege_type='EXECUTE' and not a.is_grantable) then return false;end if;
    end if;
  end loop;
  select * into rel from pg_catalog.pg_class where oid=to_regclass('private.analysis_scoring_inputs');
  if not found or rel.relkind<>'r' or not rel.relrowsecurity or rel.relowner<>base.proowner then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;
  end loop;
  if (select count(*) from pg_catalog.pg_constraint where conrelid=rel.oid and contype='f' and convalidated and confdeltype='c')<>7
    or not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=rel.oid and c.contype='p' and c.convalidated
      and c.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='analysis_id')]::smallint[]) then return false;end if;
  if (select count(*) from pg_catalog.pg_attribute where attrelid=rel.oid and attnum>0 and not attisdropped)<>17
    or exists(select 1 from (values('analysis_id','uuid',true),('organization_id','uuid',true),('owner_id','uuid',true),('resume_id','uuid',true),
      ('resume_version_id','uuid',true),('extraction_analysis_id','uuid',true),('job_id','uuid',false),('worker_id','text',true),('attempt','integer',true),
      ('lease_fence','uuid',true),('process_id','text',true),('request_id','text',true),('input_context','jsonb',true),('input_binding_sha256','text',true),
      ('result_checksum','text',true),('deterministic_content_sha256','text',true),('created_at','timestamp with time zone',true)) expected(name,type_name,required)
      where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=rel.oid and a.attname=expected.name
        and a.atttypid=to_regtype(expected.type_name) and a.attnotnull=expected.required and not a.attisdropped)) then return false;end if;
  if exists(select 1 from (values('analysis_id','public.analysis_deterministic_results','analysis_id'),('organization_id','public.organizations','id'),
      ('owner_id','auth.users','id'),('resume_id','public.resumes','id'),('resume_version_id','public.resume_versions','id'),
      ('extraction_analysis_id','public.analysis_extractions','analysis_id'),('job_id','public.jobs','id')) expected(column_name,target_name,target_column)
    where not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=rel.oid and c.contype='f' and c.convalidated and c.confdeltype='c'
      and c.confrelid=to_regclass(expected.target_name)
      and c.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname=expected.column_name)]::smallint[]
      and c.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=c.confrelid and attname=expected.target_column)]::smallint[])) then return false;end if;
  if exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a cross join lateral aclexplode(a.attacl) grant_value
      where a.attrelid=rel.oid and a.attnum>0 and grant_value.grantee<>rel.relowner) then return false;end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=rel.oid and tgname='guard_legacy_scoring_input' and not tgisinternal and tgenabled='O'
    and tgfoid=to_regprocedure('private.guard_legacy_scoring_input()') and tgtype=23 and tgnargs=0 and tgqual is null) then return false;end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_deterministic_results'::regclass and tgname='document_evidence_no_deterministic_score'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and tgtype=23 and tgnargs=0 and tgqual is null) then return false;end if;
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.legacy_scoring_ready()');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.prorettype<>'boolean'::regtype
    or p.proowner<>base.proowner or p.prosecdef or p.provolatile<>'s' or p.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  return true;
exception when others then return false;
end;
$legacy_14$;

create trigger guard_legacy_scoring_input before insert or update on private.analysis_scoring_inputs for each row execute function private.guard_legacy_scoring_input();

revoke all on function private.legacy_scoring_fail(text) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_keys(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_lease(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_access(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_static_job(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_input_data(public.analyses) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_result(public.analysis_deterministic_results) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_receipt(private.analysis_scoring_inputs,boolean) from public,anon,authenticated,service_role;
revoke all on function private.guard_legacy_scoring_input() from public,anon,authenticated,service_role;
revoke all on function public.read_legacy_scoring_input(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_legacy_scoring_context(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.export_legacy_scoring_inputs(uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_legacy_scoring_readiness() from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_row_sha256(public.analysis_deterministic_results) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_ready() from public,anon,authenticated,service_role;
grant execute on function public.read_legacy_scoring_readiness() to service_role;
-- All new data readers, exporter and finalizer remain staged/denied.
commit;
