-- DRAFT / NOT EXECUTED. Privileged MUTATING rollback-only native verifier.
-- Requires separately admitted isolated direct Supabase target, reviewed exact
-- source/fixture allocation and stop-on-error runner. Settings below only stop
-- accidental execution; they do NOT prove isolation or authorize hosted DDL.
-- Seed ONE owned synthetic analysis through actual canonical/JD/header producers
-- first. Supply its real Node-generated command from the actual owned reader;
-- do not substitute synthetic PG native hashes or fake approval metadata.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='30s';
set local search_path='';
do $admission$
begin
  if current_setting('resumide.typed_authoring_test_admission',true) is distinct from 'isolated-managed-synthetic-typed-authoring/1'
    or current_setting('resumide.typed_authoring_test_owner_id',true) is null
    or current_setting('resumide.typed_authoring_test_analysis_id',true) is null
    or current_setting('resumide.typed_authoring_test_command',true) is null
    or (current_setting('resumide.typed_authoring_test_command_sha256',true) ~ '^[a-f0-9]{64}$') is not true
    or (current_setting('resumide.typed_authoring_test_unrelated_clause_id',true) ~ '^[a-f0-9]{64}$') is not true then
    raise exception 'Typed authoring target/fixture not allocated' using errcode='42501'; end if;
  if exists(select 1 from pg_catalog.pg_trigger where tgname='a11_owned_atomic_fault') then
    raise exception 'Typed authoring test namespace exists' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.ta_assert(p_condition boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Typed authoring assertion: %',p_label using errcode='23514'; end if;
end;
$$;
create temporary sequence a11_fault_reached;
create function pg_temp.a11_owned_atomic_fault() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.idempotency_key::text=current_setting('resumide.typed_authoring_fault_key',true)
    and new.owner_id::text=current_setting('resumide.typed_authoring_test_owner_id',true) then
    perform nextval('pg_temp.a11_fault_reached'::regclass);
    raise exception 'Owned atomic test fault' using errcode='P0T01';
  end if;
  return new;
end;
$$;
create trigger a11_owned_atomic_fault before insert on public.authoring_events
for each row execute function pg_temp.a11_owned_atomic_fault();

do $verify$
<<fixture>>
declare owner_id uuid:=current_setting('resumide.typed_authoring_test_owner_id')::uuid;
  fixture_analysis_id uuid:=current_setting('resumide.typed_authoring_test_analysis_id')::uuid;
  cmd jsonb:=current_setting('resumide.typed_authoring_test_command')::jsonb;
  context jsonb; allocated_fact jsonb; changed jsonb; receipt jsonb; replay jsonb; before_body jsonb; head_body jsonb; middle_body jsonb;
  versions_before bigint; events_before bigint; role_name text; routine record; fn text;
  base_id uuid; base_revision integer; target_id text; new_value text; rejected_key uuid:=gen_random_uuid(); fault_key uuid:=gen_random_uuid();
begin
  perform private.typed_authoring_validate(cmd);
  perform pg_temp.ta_assert(cmd->>'operation'='accept' and cmd->'acknowledgement'='true'::jsonb,'allocated_accept_command');
  perform pg_temp.ta_assert(cmd->'binding'->'source'->>'ownerId'=owner_id::text and cmd->'binding'->'source'->>'analysisId'=fixture_analysis_id::text,'exact_owned_command');
  base_id:=(cmd->'binding'->'canonical'->>'versionId')::uuid;
  base_revision:=(cmd->'binding'->'canonical'->>'revision')::integer;
  target_id:=cmd->'target'->>'factId';
  select v.content into strict before_body from public.canonical_resume_versions v where v.id=base_id and v.owner_id=fixture.owner_id;
  perform pg_temp.ta_assert(private.typed_authoring_atoms_sha256(private.typed_authoring_atoms(cmd))=current_setting('resumide.typed_authoring_test_command_sha256'),'actual_node_sql_semantic_atoms');
  perform pg_temp.ta_assert(not exists(select 1 from public.authoring_events e where e.analysis_id=fixture_analysis_id and e.idempotency_key=(cmd->>'idempotencyKey')::uuid),'fresh_fixture_key');
  select count(*) into versions_before from public.canonical_resume_versions v where v.resume_id=(cmd->'binding'->'source'->>'resumeId')::uuid;
  select count(*) into events_before from public.authoring_events e where e.analysis_id=fixture_analysis_id;
  foreach fn in array array['public.apply_typed_authoring_action(uuid,uuid,jsonb,text)',
    'private.typed_authoring_sha256(text)','private.typed_authoring_atoms_sha256(text[])','private.typed_authoring_replacement(text,jsonb)',
    'private.typed_authoring_uuid(jsonb)','private.typed_authoring_validate(jsonb)','private.typed_authoring_atoms(jsonb)',
    'private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid)','private.typed_authoring_support(jsonb,jsonb,text)'] loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(fn);
    perform pg_temp.ta_assert(exists(select 1 from pg_catalog.pg_options_to_table(routine.proconfig) where option_name='search_path' and option_value in ('','""')),'empty_path');
    perform pg_temp.ta_assert(not exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) where grantee=0 and privilege_type='EXECUTE'),'public_execute_denied');
    foreach role_name in array array['anon','authenticated','service_role'] loop
      perform pg_temp.ta_assert(not has_function_privilege(role_name,routine.oid,'EXECUTE'),'application_execute_denied');
    end loop;
  end loop;
  perform pg_temp.ta_assert(private.typed_authoring_atoms_sha256(array[null,'','a:;N;'])=encode(extensions.digest(convert_to(E'A11OP1\nN;T0:;T5:a:;N;;','UTF8'),'sha256'),'hex'),'portable_codec_vector');
  new_value:=private.typed_authoring_replacement('Built services using PostgreSQL',jsonb_build_object('from','Built','to','Created','case','title','restSha256',private.typed_authoring_sha256(' services using PostgreSQL')));
  perform pg_temp.ta_assert(new_value='Created services using PostgreSQL','real_changed_kernel');
  begin
    perform private.typed_authoring_replacement('built services',jsonb_build_object('from','Built','to','Created','case',null,'restSha256',private.typed_authoring_sha256(' services')));
    raise exception 'Null case accepted' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  begin
    perform private.typed_authoring_replacement('built services',jsonb_build_object('from','Built','to','Created','restSha256',private.typed_authoring_sha256(' services')));
    raise exception 'Missing case accepted' using errcode='23514';
  exception when invalid_parameter_value then null; end;
  context:=public.read_requirement_relationship_context(owner_id,fixture_analysis_id,jsonb_build_object('canonicalVersionId',base_id,'requirementVersionId',cmd->'binding'->'requirements'->>'versionId'));
  perform pg_temp.ta_assert(context->>'status'='available','actual_owned_context');
  select value into strict allocated_fact from jsonb_array_elements(context->'canonical'->'content'->'facts') where value->>'id'=target_id;
  -- These are native helper tests on the actual loaded context, not a public
  -- request with invented metadata and not proof of an external DB connection.
  begin
    perform private.typed_authoring_support(jsonb_set(context,'{sourceMetadata,pageCount}','null'::jsonb),allocated_fact,cmd->'clauseIds'->>0);
    raise exception 'Unknown page count admitted' using errcode='23514';
  exception when sqlstate 'P0C03' then null; end;
  begin
    perform private.typed_authoring_support(jsonb_set(context,'{sourceMetadata,pageCount}','21'::jsonb),allocated_fact,cmd->'clauseIds'->>0);
    raise exception 'Incomplete pages admitted' using errcode='23514';
  exception when sqlstate 'P0C03' then null; end;
  -- The separately seeded JD must contain this actual unrelated skill clause.
  changed:=jsonb_set(cmd,'{clauseIds}',jsonb_build_array(current_setting('resumide.typed_authoring_test_unrelated_clause_id')));
  receipt:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,changed,changed->>'idempotencyKey');
  perform pg_temp.ta_assert(receipt->>'status'='invalid','unrelated_actual_jd_clause_no_write');
  changed:=jsonb_set(jsonb_set(cmd,'{binding,canonical,revision}',to_jsonb(base_revision+1)),'{binding,heads,canonicalHeadRevision}',to_jsonb(base_revision+1));
  receipt:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,changed,changed->>'idempotencyKey');
  perform pg_temp.ta_assert(receipt->>'status'='conflict','stale_dual_head_no_write');
  -- Reject records one immutable event, no canonical child.
  changed:=cmd||jsonb_build_object('operation','reject','acknowledgement',false,'idempotencyKey',rejected_key);
  receipt:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,changed,rejected_key::text);
  perform pg_temp.ta_assert(receipt->>'status'='applied' and receipt->>'action'='reject' and receipt->>'versionId'=base_id::text and receipt->'revision'=to_jsonb(base_revision),'reject_event_only');
  replay:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,changed,rejected_key::text);
  perform pg_temp.ta_assert(replay=receipt||jsonb_build_object('idempotent',true),'reject_exact_replay');
  replay:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,jsonb_set(changed,'{transform,to}',to_jsonb(case when changed->'transform'->>'to'='Created' then 'Developed' else 'Created' end)),rejected_key::text);
  perform pg_temp.ta_assert(replay->>'status'='conflict','changed_operation_same_key_conflicts');
  perform pg_temp.ta_assert((select count(*) from public.canonical_resume_versions v where v.resume_id=(cmd->'binding'->'source'->>'resumeId')::uuid)=versions_before,'reject_no_child');
  -- Fault after BOTH inner saves: nextval proves the event insertion was reached.
  perform set_config('resumide.typed_authoring_fault_key',fault_key::text,true);
  changed:=cmd||jsonb_build_object('idempotencyKey',fault_key);
  receipt:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,changed,fault_key::text);
  perform pg_temp.ta_assert(receipt->>'status'='unavailable' and (select is_called from pg_temp.a11_fault_reached),'fault_reached_after_saves');
  perform pg_temp.ta_assert((select count(*) from public.canonical_resume_versions v where v.resume_id=(cmd->'binding'->'source'->>'resumeId')::uuid)=versions_before,'atomic_child_rollback');
  perform pg_temp.ta_assert((select count(*) from public.authoring_events e where e.analysis_id=fixture_analysis_id)=events_before+1,'atomic_event_rollback');
  perform set_config('resumide.typed_authoring_fault_key','',true);
  receipt:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,cmd,cmd->>'idempotencyKey');
  perform pg_temp.ta_assert(receipt->>'status'='applied' and receipt->>'action'='accept' and receipt->'revision'=to_jsonb(base_revision+2),'accept_two_children');
  select content into strict head_body from public.canonical_resume_versions where id=(receipt->>'versionId')::uuid;
  select content into strict middle_body from public.canonical_resume_versions where id=(head_body->>'parentVersionId')::uuid;
  perform pg_temp.ta_assert(middle_body->>'parentVersionId'=base_id::text,'edit_confirm_lineage');
  perform pg_temp.ta_assert(exists(select 1 from jsonb_array_elements(middle_body->'facts') f where f->>'id'=target_id and f->>'state'='unconfirmed' and f->'sources'='[]'::jsonb and f->'confirmation'='null'::jsonb),'edit_clears_proof');
  perform pg_temp.ta_assert(exists(select 1 from jsonb_array_elements(head_body->'facts') f where f->>'id'=target_id and f->>'state'='candidate_confirmed' and f->'sources'='[]'::jsonb and f->'confirmation'->>'actorId'=owner_id::text and f->'confirmation'->>'value'=f->>'value'),'explicit_new_value_confirmation');
  replay:=public.apply_typed_authoring_action(owner_id,fixture_analysis_id,cmd,cmd->>'idempotencyKey');
  perform pg_temp.ta_assert(replay=receipt||jsonb_build_object('idempotent',true),'accept_replay_after_head_advance');
  perform pg_temp.ta_assert((select count(*) from public.canonical_resume_versions v where v.resume_id=(cmd->'binding'->'source'->>'resumeId')::uuid)=versions_before+2,'no_duplicate_child');
  perform pg_temp.ta_assert((select content from public.canonical_resume_versions where id=base_id)=before_body,'immutable_parent');
end;
$verify$;
set constraints all immediate;
rollback;
-- Pending actual two-session dual-head/privacy contention, direct-RPC tampering
-- and post-rollback owned fixture cleanup under its separate native allocation.
