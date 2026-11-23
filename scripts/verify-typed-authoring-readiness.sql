-- DRAFT / UNPARSED / UNEXECUTED. Privileged MUTATING rollback-only verifier.
-- Requires a separately approved isolated direct Supabase target, exact migration
-- and fixture allocation, stop-on-error runner and post-rollback cleanup proof.
-- These GUCs are accident guards, NOT isolation, credential or DDL authorization.
-- Fixture prerequisite: actual owned canonical/JD producers, current typed JD,
-- a recorded legacy accept/reject from before that JD, and a fresh real Node-built
-- manual rename command/body at the CURRENT canonical head. Never invent PG
-- hashes, recorded events, confirmations, source metadata or ownership booleans.
begin;
set transaction isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='30s';
set local search_path='';
do $admission$
begin
  if current_setting('resumide.typed_readiness_test_admission',true) is distinct from 'isolated-managed-synthetic-typed-readiness/1'
    or nullif(current_setting('resumide.typed_readiness_owner_id',true),'') is null
    or nullif(current_setting('resumide.typed_readiness_analysis_id',true),'') is null
    or nullif(current_setting('resumide.typed_readiness_legacy_replay_command',true),'') is null
    or nullif(current_setting('resumide.typed_readiness_manual_command',true),'') is null
    or nullif(current_setting('resumide.typed_readiness_manual_body',true),'') is null then
    raise exception 'Typed readiness target/fixture not allocated' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.tr_assert(p_value boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin
  if p_value is not true then raise exception 'Typed readiness assertion: %',p_label using errcode='23514'; end if;
end;
$$;
do $verify$
<<fixture>>
declare metadata jsonb; changed jsonb; replay jsonb; result_value jsonb; prior public.authoring_events%rowtype;
  fixture_owner_id uuid:=current_setting('resumide.typed_readiness_owner_id')::uuid;
  fixture_analysis_id uuid:=current_setting('resumide.typed_readiness_analysis_id')::uuid;
  original_command jsonb:=current_setting('resumide.typed_readiness_legacy_replay_command')::jsonb;
  manual_command jsonb:=current_setting('resumide.typed_readiness_manual_command')::jsonb;
  manual_body jsonb:=current_setting('resumide.typed_readiness_manual_body')::jsonb;
  versions_before bigint; events_before bigint; resume_id uuid;
begin
  metadata:=public.read_typed_authoring_readiness();
  perform pg_temp.tr_assert(private.evidence_keys(metadata,array['schemaVersion','profileVersion','schemaReady','writerExecutable','canonicalReadinessSha256','typedReadinessSha256','writerSha256','readerSha256']),'strict_metadata_keys');
  perform pg_temp.tr_assert(metadata->>'schemaVersion'='typed-authoring-readiness/1.0.0'
    and metadata->>'profileVersion'='typed-authoring-readiness-profile/1.0.0'
    and metadata->>'canonicalReadinessSha256'='0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428'
    and metadata->>'typedReadinessSha256'='f1f32624c906897a7a7a65e6d91fb70bf7ff0ec6986161820309a39138326b8d'
    and metadata->>'writerSha256'='7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387'
    and metadata->>'readerSha256'='c70e1e3b07abff4a5f805c3db62643049edfc2a1214aebc5b423ca601a41d072','actual_catalog_profile');
  perform pg_temp.tr_assert(metadata->'schemaReady'='true'::jsonb and metadata->'writerExecutable'='false'::jsonb,'coherent_staged_denied');
  perform pg_temp.tr_assert(has_function_privilege('service_role','public.read_typed_authoring_readiness()','EXECUTE')
    and not has_function_privilege('anon','public.read_typed_authoring_readiness()','EXECUTE')
    and not has_function_privilege('authenticated','public.read_typed_authoring_readiness()','EXECUTE'),'metadata_service_only');
  -- Each injected catalog change is confined to its own rolled-back subtransaction.
  -- Temporary service EXECUTE tests capability coherence; it is not activation.
  begin
    grant execute on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) to service_role;
    changed:=public.read_typed_authoring_readiness();
    perform pg_temp.tr_assert(changed->'schemaReady'='true'::jsonb and changed->'writerExecutable'='true'::jsonb,'optional_direct_service_execute');
    raise exception 'Rollback owned grant probe' using errcode='P0T11';
  exception when sqlstate 'P0T11' then null; end;
  begin
    grant execute on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) to service_role with grant option;
    perform pg_temp.tr_assert(public.read_typed_authoring_readiness()->'schemaReady'='false'::jsonb,'writer_grant_option_denied');
    raise exception 'Rollback owned grant probe' using errcode='P0T11';
  exception when sqlstate 'P0T11' then null; end;
  begin
    grant execute on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) to authenticated;
    perform pg_temp.tr_assert(public.read_typed_authoring_readiness()->'schemaReady'='false'::jsonb,'foreign_writer_role_denied');
    raise exception 'Rollback owned grant probe' using errcode='P0T11';
  exception when sqlstate 'P0T11' then null; end;
  begin
    alter function private.typed_authoring_support(jsonb,jsonb,text) stable;
    perform pg_temp.tr_assert(public.read_typed_authoring_readiness()->'schemaReady'='false'::jsonb,'typed_attribute_drift_denied');
    raise exception 'Rollback owned attribute probe' using errcode='P0T11';
  exception when sqlstate 'P0T11' then null; end;
  begin
    grant update(content) on public.canonical_resume_versions to service_role;
    perform pg_temp.tr_assert(public.read_typed_authoring_readiness()->'schemaReady'='false'::jsonb,'base_column_dml_floor_retained');
    raise exception 'Rollback owned column probe' using errcode='P0T11';
  exception when sqlstate 'P0T11' then null; end;
  perform pg_temp.tr_assert(public.read_typed_authoring_readiness()=metadata,'catalog_probe_restoration');
  select e.* into strict prior from public.authoring_events e where e.analysis_id=fixture_analysis_id
    and e.owner_id=fixture_owner_id and e.idempotency_key=(original_command->>'idempotencyKey')::uuid;
  perform pg_temp.tr_assert(prior.command=original_command and original_command->>'action' in ('accept','reject'),'real_recorded_legacy_command');
  select source.resume_id into strict resume_id from public.analyses a join public.resume_versions source on source.id=a.resume_version_id
    join public.resumes root on root.id=source.resume_id where a.id=fixture_analysis_id and a.owner_id=fixture_owner_id
    and source.owner_id=fixture_owner_id and root.owner_id=fixture_owner_id and root.status='active';
  perform pg_temp.tr_assert((select j.content->>'schemaVersion' from public.job_requirement_versions j
    where j.analysis_id=fixture_analysis_id and j.owner_id=fixture_owner_id order by j.revision desc limit 1)='requirements/2.0.0','actual_current_typed_jd');
  select count(*) into versions_before from public.canonical_resume_versions v where v.resume_id=fixture.resume_id and v.owner_id=fixture_owner_id;
  select count(*) into events_before from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id;
  replay:=public.apply_authoring_action(fixture_owner_id,fixture_analysis_id,original_command,null,null,gen_random_uuid()::text);
  perform pg_temp.tr_assert(replay=prior.result||jsonb_build_object('idempotent',true),'old_exact_replay_before_new_jd_denial');
  changed:=original_command||jsonb_build_object('idempotencyKey',gen_random_uuid());
  result_value:=public.apply_authoring_action(fixture_owner_id,fixture_analysis_id,changed,null,null,gen_random_uuid()::text);
  perform pg_temp.tr_assert(result_value->>'status'='unavailable','fresh_legacy_typed_denied');
  perform pg_temp.tr_assert((select count(*) from public.canonical_resume_versions v where v.resume_id=fixture.resume_id and v.owner_id=fixture_owner_id)=versions_before
    and (select count(*) from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id)=events_before,'denial_and_replay_no_new_writes');
  perform pg_temp.tr_assert(manual_command->>'action'='rename','actual_manual_rename_control');
  result_value:=public.apply_authoring_action(fixture_owner_id,fixture_analysis_id,manual_command,manual_body,null,gen_random_uuid()::text);
  perform pg_temp.tr_assert(result_value->>'status'='applied' and result_value->>'action'='rename','manual_operation_preserved');
end;
$verify$;
set constraints all immediate;
rollback;
-- NOT RUN: actual two-session latest-JD/privacy contention, foreign/current-job
-- tampering, no-JD/legacy1 fresh pattern positives, all other manual operations,
-- role execution through PostgREST, rollback/cleanup and source/catalog parity.
-- These remain acceptance cases; the source draft proves none of them ran.
