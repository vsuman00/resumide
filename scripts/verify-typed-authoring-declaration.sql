-- DRAFT / UNPARSED / UNEXECUTED. Privileged MUTATING rollback-only native verifier.
-- Requires separately approved isolated direct Supabase target and exact owned
-- synthetic fixtures through actual canonical/JD/header producers. GUCs are only
-- accident guards, not target isolation, native grant or execution authorization.
-- Supply actual Node1.1 command/hash and a real recorded source-backed1.0 command.
-- Never fabricate PG native hashes, prior events, owner confirmations or citations.
begin;
set transaction isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='30s';
set local search_path='';
do $admission$
begin
  if current_setting('resumide.typed_declaration_test_admission',true) is distinct from 'isolated-managed-synthetic-typed-declaration/1'
    or nullif(current_setting('resumide.typed_declaration_owner_id',true),'') is null
    or nullif(current_setting('resumide.typed_declaration_analysis_id',true),'') is null
    or nullif(current_setting('resumide.typed_declaration_command',true),'') is null
    or nullif(current_setting('resumide.typed_declaration_prior_command',true),'') is null
    or (current_setting('resumide.typed_declaration_command_sha256',true) ~ '^[a-f0-9]{64}$') is not true then
    raise exception 'Typed declaration target/fixture not allocated' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.td_assert(p_value boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_value is not true then raise exception 'Typed declaration assertion: %',p_label using errcode='23514'; end if; end;
$$;
do $verify$
<<fixture>>
declare fixture_owner_id uuid:=current_setting('resumide.typed_declaration_owner_id')::uuid;
  fixture_analysis_id uuid:=current_setting('resumide.typed_declaration_analysis_id')::uuid;
  command jsonb:=current_setting('resumide.typed_declaration_command')::jsonb;
  old_command jsonb:=current_setting('resumide.typed_declaration_prior_command')::jsonb;
  prior public.authoring_events%rowtype; metadata jsonb; context jsonb; fact jsonb; changed jsonb; receipt jsonb; replay jsonb;
  versions_before bigint; events_before bigint; parent_body jsonb; new_body jsonb; resume_id uuid; role_name text; signature text;
begin
  metadata:=public.read_typed_authoring_readiness();
  perform pg_temp.td_assert(metadata->>'profileVersion'='typed-authoring-readiness-profile/1.1.0'
    and metadata->>'canonicalReadinessSha256'='0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428'
    and metadata->>'typedReadinessSha256'='fdb7b1a51ac23303ca5c55a741e2818ca669e7795394ca4d012f1e150266ca08'
    and metadata->>'writerSha256'='c8eaf0ceaaada7ca3407cd0ca2bdb4f0dc4690ef8f42baf8f6136dfa57989558'
    and metadata->>'readerSha256'='55dbfb182f5bbe836df72eb03699b851c22ea542725bb2681b8c5de1e9e70f48'
    and metadata->'schemaReady'='true'::jsonb and metadata->'writerExecutable'='false'::jsonb,'actual_staged_combined_profile');
  foreach signature in array array['private.typed_authoring_validate_v1_1(jsonb)','private.typed_authoring_atoms_v1_1(jsonb)',
    'private.typed_authoring_declaration_support(jsonb,jsonb,text)','public.apply_typed_authoring_action(uuid,uuid,jsonb,text)'] loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      perform pg_temp.td_assert(not has_function_privilege(role_name,signature,'EXECUTE'),'new_helpers_and_writer_denied');
    end loop;
  end loop;
  perform private.typed_authoring_validate_v1_1(command);
  perform pg_temp.td_assert(command->>'schemaVersion'='typed-authoring-command/1.1.0' and command->>'operation'='accept'
    and command->'binding'->'source'->>'ownerId'=fixture_owner_id::text
    and command->'binding'->'source'->>'analysisId'=fixture_analysis_id::text,'actual_owned1_1_command');
  perform pg_temp.td_assert(private.typed_authoring_atoms_sha256(private.typed_authoring_atoms_v1_1(command))=current_setting('resumide.typed_declaration_command_sha256'),'actual_node_pg1_1_atoms');
  select e.* into strict prior from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id
    and e.idempotency_key=(old_command->>'idempotencyKey')::uuid;
  perform pg_temp.td_assert(prior.command=old_command and old_command->>'schemaVersion'='typed-authoring-command/1.0.0'
    and jsonb_array_length(old_command->'sourceCitations')>0,'real_old_source_command');
  replay:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,old_command,old_command->>'idempotencyKey');
  perform pg_temp.td_assert(replay=prior.result||jsonb_build_object('idempotent',true),'old_exact_replay_after_protocol_upgrade');
  resume_id:=(command->'binding'->'source'->>'resumeId')::uuid;
  select v.content into strict parent_body from public.canonical_resume_versions v where v.id=(command->'binding'->'canonical'->>'versionId')::uuid and v.owner_id=fixture_owner_id;
  context:=public.read_requirement_relationship_context(fixture_owner_id,fixture_analysis_id,jsonb_build_object('canonicalVersionId',command->'binding'->'canonical'->>'versionId','requirementVersionId',command->'binding'->'requirements'->>'versionId'));
  perform pg_temp.td_assert(context->>'status'='available','real_owned_reader_context');
  select f.value into strict fact from jsonb_array_elements(context->'canonical'->'content'->'facts') f(value) where f.value->>'id'=command->'target'->>'factId';
  perform pg_temp.td_assert(fact->'sources'='[]'::jsonb and fact->'confirmation'->>'value'=fact->>'value'
    and fact->'confirmation'->>'actorId'=fixture_owner_id::text,'whole_current_declaration_not_quote');
  perform private.typed_authoring_declaration_support(context,fact,command->'clauseIds'->>0);
  begin
    perform private.typed_authoring_validate(command);
    raise exception 'Old validator admitted new version' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  begin
    perform private.typed_authoring_support(context,fact,command->'clauseIds'->>0);
    raise exception 'Old source proof admitted citationless fact' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.td_assert(not exists(select 1 from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.idempotency_key=(command->>'idempotencyKey')::uuid),'fresh_new_fixture_key');
  select count(*) into versions_before from public.canonical_resume_versions v where v.resume_id=fixture.resume_id and v.owner_id=fixture_owner_id;
  select count(*) into events_before from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id;
  changed:=jsonb_set(command,'{sourceCitations}',old_command->'sourceCitations');
  receipt:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,changed,changed->>'idempotencyKey');
  perform pg_temp.td_assert(receipt->>'status'='invalid','historical_source_citations_not_promoted');
  changed:=jsonb_set(command,'{policies}',old_command->'policies');
  receipt:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,changed,changed->>'idempotencyKey');
  perform pg_temp.td_assert(receipt->>'status'='invalid','mixed_version_policy_denied');
  receipt:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,command,command->>'idempotencyKey');
  perform pg_temp.td_assert(receipt->>'status'='applied' and receipt->>'action'='accept'
    and receipt->'revision'=to_jsonb((command->'binding'->'canonical'->>'revision')::integer+2),'declaration_accept_two_children');
  select v.content into strict new_body from public.canonical_resume_versions v where v.id=(receipt->>'versionId')::uuid and v.owner_id=fixture_owner_id;
  perform pg_temp.td_assert(exists(select 1 from jsonb_array_elements(new_body->'facts') f where f->>'id'=fact->>'id'
    and f->'sources'='[]'::jsonb and f->>'state'='candidate_confirmed' and f->'confirmation'->>'actorId'=fixture_owner_id::text
    and f->>'value'=private.typed_authoring_replacement(fact->>'value',command->'transform')),'declared_value_preserved_not_independent_verification');
  replay:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,command,command->>'idempotencyKey');
  perform pg_temp.td_assert(replay=receipt||jsonb_build_object('idempotent',true),'new_exact_replay_after_head_advance');
  replay:=public.apply_typed_authoring_action(fixture_owner_id,fixture_analysis_id,old_command,old_command->>'idempotencyKey');
  perform pg_temp.td_assert(replay=prior.result||jsonb_build_object('idempotent',true),'old_replay_remains_valid_after_new_accept');
  perform pg_temp.td_assert((select count(*) from public.canonical_resume_versions v where v.resume_id=fixture.resume_id and v.owner_id=fixture_owner_id)=versions_before+2
    and (select count(*) from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id)=events_before+1,'no_duplicate_children_or_event');
  perform pg_temp.td_assert((select content from public.canonical_resume_versions where id=(parent_body->>'versionId')::uuid)=parent_body,'immutable_parent_and_historical_origins');
end;
$verify$;
set constraints all immediate;
rollback;
-- NOT RUN: actor/time/value/placement/context falsifiers through actual RPC,
-- old/new rejection and undo, exact replay during privacy/JD/head contention,
-- PostgREST role execution, rollback/cleanup and native/source parity.
-- No representative-usefulness, qualification or numeric claim follows from this draft.
