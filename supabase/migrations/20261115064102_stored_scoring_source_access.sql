-- Forward original-source admission only. SOURCE ONLY, UNPARSED/UNEXECUTED.
-- Frozen foundation2cb, numerical producers, complete account exporter and wire
-- versions are preserved. No data RPC or feature is activated.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

do $stored_preimage$
declare item jsonb;p pg_catalog.pg_proc%rowtype;
  expected jsonb:=$stored_preimages$[
  {
    "signature": "public.read_legacy_scoring_input(uuid,jsonb)",
    "sha256": "1b9891fc6ece7e948c4623b6455686a2fc42e4896ff3fcc78f0ce0275a44d7c3"
  },
  {
    "signature": "public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)",
    "sha256": "e367a8f688b2661fc8baa374ad44a4be90712016d3ed44214857ed1127e10f18"
  },
  {
    "signature": "public.read_legacy_scoring_context(uuid,uuid)",
    "sha256": "c79b6174de5e28fc56a0cb3648d5e1cc4e19ff5139f2869ce54478c9cf6cf618"
  },
  {
    "signature": "private.legacy_scoring_ready()",
    "sha256": "e891aed3848b39893718d883f7a3ff5efb3ebeda3ee6967d64daa13924075458"
  }
]$stored_preimages$::jsonb;
begin
  for item in select value from jsonb_array_elements(expected) loop
    select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>item->>'sha256' then
      raise exception 'STORED_SCORING_PREIMAGE_DRIFT' using errcode='23514';end if;
  end loop;
  if not private.legacy_scoring_ready() then raise exception 'STORED_SCORING_PREDECESSOR_UNAVAILABLE' using errcode='23514';end if;
  for item in select value from jsonb_array_elements(expected) where value->>'signature' like 'public.%' loop
    if has_function_privilege('service_role',to_regprocedure(item->>'signature'),'EXECUTE') then
      raise exception 'STORED_SCORING_ALREADY_ACTIVATED' using errcode='23514';end if;
  end loop;
  if has_function_privilege('service_role','public.export_legacy_scoring_inputs(uuid)','EXECUTE') then
    raise exception 'STORED_SCORING_ALREADY_ACTIVATED' using errcode='23514';end if;
end;
$stored_preimage$;

create function private.legacy_scoring_stored_source(p_stored private.analysis_scoring_inputs) returns void
language plpgsql volatile set search_path='' as $stored_source$
declare actual private.analysis_scoring_inputs%rowtype;
begin
  -- The immutable row's FK identity protects the ORIGINAL source. All locks
  -- below are nonblocking: current-source admission already holds its locks,
  -- so never wait in the reverse path of source retirement/FK deletion.
  select * into actual from private.analysis_scoring_inputs where analysis_id=p_stored.analysis_id
    for key share skip locked;
  if not found or actual is distinct from p_stored then perform private.legacy_scoring_fail('not_found');end if;
  perform 1 from public.resume_versions where id=actual.resume_version_id and resume_id=actual.resume_id
    and owner_id=actual.owner_id and organization_id=actual.organization_id for share skip locked;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
  perform 1 from public.resumes where id=actual.resume_id and owner_id=actual.owner_id
    and organization_id=actual.organization_id and status='active' for share skip locked;
  if not found then perform private.legacy_scoring_fail('not_found');end if;
end;
$stored_source$;

create or replace function public.read_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $legacy_9$
declare a public.analyses%rowtype;s private.analysis_scoring_inputs%rowtype;d public.analysis_deterministic_results%rowtype;context_value jsonb;
begin
  if private.legacy_scoring_lease(p_lease) is not true then perform private.legacy_scoring_fail('invalid');end if;
  a:=private.legacy_scoring_access(p_analysis_id,null);
  if not private.legacy_scoring_ready() then perform private.legacy_scoring_fail('unavailable');end if;
  select * into s from private.analysis_scoring_inputs where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  if found then
    perform private.legacy_scoring_stored_source(s);
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

create or replace function public.finish_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb,p_binding jsonb,p_result jsonb,p_process_id text,p_request_id text) returns jsonb
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
    perform private.legacy_scoring_stored_source(s);
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

create or replace function public.read_legacy_scoring_context(p_user_id uuid,p_analysis_id uuid) returns jsonb
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
  perform private.legacy_scoring_stored_source(s);
  if s.deterministic_content_sha256 is distinct from private.legacy_scoring_row_sha256(d) then perform private.legacy_scoring_fail('unavailable');end if;
  actual:=private.legacy_scoring_input_data(a);
  return jsonb_build_object('schemaVersion','legacy-scoring-context/1.0.0','status','bound',
    'currentness',case when actual->'binding' is not distinct from s.input_context->'binding' then 'current' else 'historical' end,
    'context',s.input_context,'result',private.legacy_scoring_result(d),'receipt',private.legacy_scoring_receipt(s,true));
end;
$legacy_11$;

create or replace function private.legacy_scoring_ready() returns boolean
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
    "sha256": "2ea3c5071d8d56e421a37053127dea08fe8eb08ce91e4de9f5c3b4c4b1172ccf",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)",
    "sha256": "5db61206ed04f32af7052fce2d64e2ccf414d6fea13645f58eecf67f616b61a2",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_legacy_scoring_context(uuid,uuid)",
    "sha256": "d64ba9ac11ba732c983cd195cd7d83fba878e67f4ae0bffc8b6e166a600a8bd9",
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
  },
  {
    "signature": "private.legacy_scoring_stored_source(private.analysis_scoring_inputs)",
    "sha256": "abe9dc88974b51a20422def9f71810341e5c4fe2a7bb4e7705cd394c67f5b178",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
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
revoke all on function private.legacy_scoring_stored_source(private.analysis_scoring_inputs) from public,anon,authenticated,service_role;
revoke all on function private.legacy_scoring_ready() from public,anon,authenticated,service_role;
revoke all on function public.read_legacy_scoring_input(uuid,jsonb),public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text),
  public.read_legacy_scoring_context(uuid,uuid) from public,anon,authenticated,service_role;
-- Export is unchanged and remains denied; no active-root filter is introduced.

do $stored_postimage$
declare item jsonb;p pg_catalog.pg_proc%rowtype;role_name text;owner_oid oid;
  expected jsonb:=$stored_postimages$[
  {
    "signature": "public.read_legacy_scoring_input(uuid,jsonb)",
    "sha256": "2ea3c5071d8d56e421a37053127dea08fe8eb08ce91e4de9f5c3b4c4b1172ccf",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)",
    "sha256": "5db61206ed04f32af7052fce2d64e2ccf414d6fea13645f58eecf67f616b61a2",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_legacy_scoring_context(uuid,uuid)",
    "sha256": "d64ba9ac11ba732c983cd195cd7d83fba878e67f4ae0bffc8b6e166a600a8bd9",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "acl": "optional_service"
  },
  {
    "signature": "private.legacy_scoring_stored_source(private.analysis_scoring_inputs)",
    "sha256": "abe9dc88974b51a20422def9f71810341e5c4fe2a7bb4e7705cd394c67f5b178",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "acl": "private"
  },
  {
    "signature": "private.legacy_scoring_ready()",
    "sha256": "56a92f65d533a2f1b053078dbb372b1271728224e5df1c74b201b4cffb21a8d3",
    "definer": false,
    "volatility": "s",
    "resultType": "boolean",
    "acl": "private"
  }
]$stored_postimages$::jsonb;
begin
  select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
  for item in select value from jsonb_array_elements(expected) loop
    select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict
      or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
      or p.proconfig is distinct from array['search_path=""'] or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>item->>'sha256'
      or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then
      raise exception 'STORED_SCORING_POSTIMAGE_DRIFT' using errcode='23514';end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') then raise exception 'STORED_SCORING_DATA_ACTIVATED' using errcode='23514';end if;
    end loop;
  end loop;
  if not private.legacy_scoring_ready() then raise exception 'STORED_SCORING_CLOSURE_DRIFT' using errcode='23514';end if;
end;
$stored_postimage$;
commit;
