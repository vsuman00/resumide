-- DEFERRED PRIVILEGED MUTATING ROLLBACK-ONLY VERIFIER. UNPARSED/UNEXECUTED.
-- Requires separate authorization for a DIRECT synthetic target and the actual
-- function/table owner. No app/service grant, scoring, provider, rebase, backfill
-- or fixture-producing shortcut is supplied by this script.
-- S1/S2/foreign snapshots must already come from the real immutable-input/Node
-- deterministic producer. IDs select fixtures; settings do not authorize a run.
-- Keep original native JSONB digests and JS resultChecksum domains distinct.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';

create function pg_temp.stored_source_assert(p_value boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin
  if p_value is not true then raise exception 'STORED_SOURCE_FIXTURE_ASSERTION: %',p_label using errcode='23514';end if;
end;
$$;

do $stored_source_cases$
declare analysis_id_value uuid:=nullif(current_setting('resumide.stored_source_analysis_id',true),'')::uuid;
  owner_id_value uuid:=nullif(current_setting('resumide.stored_source_owner_id',true),'')::uuid;
  replacement_version_id uuid:=nullif(current_setting('resumide.stored_source_replacement_version_id',true),'')::uuid;
  second_analysis_id uuid:=nullif(current_setting('resumide.stored_source_second_analysis_id',true),'')::uuid;
  foreign_owner_id uuid:=nullif(current_setting('resumide.stored_source_foreign_owner_id',true),'')::uuid;
  a public.analyses%rowtype;s private.analysis_scoring_inputs%rowtype;replacement public.resume_versions%rowtype;
  d public.analysis_deterministic_results%rowtype;lease_value jsonb;original_context jsonb;original_result jsonb;
  original_receipt jsonb;snapshot_before jsonb;result_before jsonb;export_before jsonb;export_after jsonb;
  saved jsonb;replayed jsonb;worker_read jsonb;metadata jsonb;signature text;denied boolean;function_owner name;
begin
  select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
    where oid=to_regprocedure('public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)'));
  perform pg_temp.stored_source_assert(current_setting('resumide.stored_source_allocation',true)='owned-stored-source-rollback/1'
    and current_user=function_owner and analysis_id_value is not null and owner_id_value is not null
    and replacement_version_id is not null and second_analysis_id is not null and second_analysis_id<>analysis_id_value
    and foreign_owner_id is not null and foreign_owner_id<>owner_id_value,'separate_privileged_admission_required');
  metadata:=public.read_legacy_scoring_readiness();
  perform pg_temp.stored_source_assert(metadata-'schemaReady'-'writerExecutable'=$profile${"schemaVersion":"legacy-scoring-readiness/1.0.0","profileVersion":"legacy-scoring-profile/1.0.0","checkerSha256":"56a92f65d533a2f1b053078dbb372b1271728224e5df1c74b201b4cffb21a8d3","readerSha256":"2ea3c5071d8d56e421a37053127dea08fe8eb08ce91e4de9f5c3b4c4b1172ccf","finishSha256":"5db61206ed04f32af7052fce2d64e2ccf414d6fea13645f58eecf67f616b61a2","contextSha256":"d64ba9ac11ba732c983cd195cd7d83fba878e67f4ae0bffc8b6e166a600a8bd9","exportSha256":"e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2","metadataSha256":"f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8"}$profile$::jsonb
    and metadata->'schemaReady'='true'::jsonb and metadata->'writerExecutable'='false'::jsonb,'exact_current_staged_profile');
  foreach signature in array array['public.read_legacy_scoring_input(uuid,jsonb)',
    'public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)','public.read_legacy_scoring_context(uuid,uuid)',
    'public.export_legacy_scoring_inputs(uuid)'] loop
    perform pg_temp.stored_source_assert(not has_function_privilege('service_role',signature,'EXECUTE')
      and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'),
      'all_data_calls_still_denied');
  end loop;
  select * into strict a from public.analyses where id=analysis_id_value and owner_id=owner_id_value;
  select * into strict s from private.analysis_scoring_inputs where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  select * into strict d from public.analysis_deterministic_results where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id;
  select * into strict replacement from public.resume_versions where id=replacement_version_id and owner_id=a.owner_id and organization_id=a.organization_id;
  perform pg_temp.stored_source_assert(a.resume_version_id=s.resume_version_id and replacement.id<>s.resume_version_id
    and replacement.resume_id<>s.resume_id and exists(select 1 from public.resumes where id=s.resume_id and owner_id=a.owner_id
      and organization_id=a.organization_id and status='active')
    and exists(select 1 from public.resumes where id=replacement.resume_id and owner_id=a.owner_id and organization_id=a.organization_id and status='active')
    and exists(select 1 from private.analysis_scoring_inputs where analysis_id=second_analysis_id and owner_id=owner_id_value)
    and exists(select 1 from private.analysis_scoring_inputs where owner_id=foreign_owner_id)
    and not exists(select 1 from public.document_evidence_attempts where analysis_id=a.id),'actual_committed_legacy_fixtures_required');
  -- The real FK constraints remain enabled. Optional correction/grouping children
  -- that forbid this rebind make the fixture unsuitable; never disable them.
  lease_value:=jsonb_build_object('workerId',s.worker_id,'attempt',s.attempt,'leaseFence',s.lease_fence);
  original_context:=s.input_context;original_result:=private.legacy_scoring_result(d);
  original_receipt:=private.legacy_scoring_receipt(s,true);snapshot_before:=to_jsonb(s);result_before:=to_jsonb(d);
  export_before:=public.export_legacy_scoring_inputs(owner_id_value);
  perform pg_temp.stored_source_assert(private.legacy_scoring_row_sha256(d)=s.deterministic_content_sha256
    and s.input_binding_sha256=original_context->'binding'->>'inputBindingSha256','original_producer_binding_intact');

  -- Oracle 1: active original source permits historical access and exact replay.
  update public.analyses set resume_version_id=replacement.id where id=a.id and owner_id=a.owner_id
    and organization_id=a.organization_id and resume_version_id=s.resume_version_id;
  perform pg_temp.stored_source_assert(found,'privileged_pointer_rebind_succeeded');
  saved:=public.read_legacy_scoring_context(owner_id_value,a.id);
  perform pg_temp.stored_source_assert(saved->>'status'='bound' and saved->>'currentness'='historical'
    and saved->'context'=original_context and saved->'result'=original_result and saved->'receipt'=original_receipt,
    'active_original_historical_not_rebound');
  replayed:=public.finish_legacy_scoring_input(a.id,lease_value,original_context->'binding',original_result,'stored-source-native','stored-source-native');
  worker_read:=public.read_legacy_scoring_input(a.id,lease_value);
  perform pg_temp.stored_source_assert(replayed=original_receipt and worker_read->>'status'='committed'
    and worker_read->'receipt'=original_receipt,'active_original_exact_replay_preserved');

  -- Oracle 2: a replacement active root cannot authorize tombstoned original data.
  update public.resumes set status='deleted' where id=s.resume_id and owner_id=a.owner_id and organization_id=a.organization_id;
  perform pg_temp.stored_source_assert(found and exists(select 1 from public.resume_versions where id=s.resume_version_id)
    and exists(select 1 from private.analysis_scoring_inputs where analysis_id=a.id)
    and exists(select 1 from public.analysis_deterministic_results where analysis_id=a.id)
    and exists(select 1 from public.resumes where id=replacement.resume_id and status='active'),'real_tombstone_before_cascade');
  denied:=false;
  begin perform public.read_legacy_scoring_context(owner_id_value,a.id);
  exception when insufficient_privilege then denied:=true;end;
  perform pg_temp.stored_source_assert(denied,'tombstoned_saved_context_denied');
  denied:=false;
  begin perform public.finish_legacy_scoring_input(a.id,lease_value,original_context->'binding',original_result,'stored-source-native','stored-source-native');
  exception when insufficient_privilege then denied:=true;end;
  perform pg_temp.stored_source_assert(denied,'tombstoned_finish_replay_denied');
  denied:=false;
  begin perform public.read_legacy_scoring_input(a.id,lease_value);
  exception when insufficient_privilege then denied:=true;end;
  perform pg_temp.stored_source_assert(denied,'tombstoned_committed_worker_denied');

  -- Oracle 3: privacy export remains a complete account collection, not a view.
  export_after:=public.export_legacy_scoring_inputs(owner_id_value);
  perform pg_temp.stored_source_assert(export_after=export_before
    and exists(select 1 from jsonb_array_elements(export_after->'scoringInputs') x where x->>'analysis_id'=a.id::text and x->'input_context'=original_context)
    and exists(select 1 from jsonb_array_elements(export_after->'scoringInputs') x where x->>'analysis_id'=second_analysis_id::text)
    and not exists(select 1 from jsonb_array_elements(export_after->'scoringInputs') x where x->>'owner_id'<>owner_id_value::text),
    'complete_retained_owned_export_not_filtered');
  perform pg_temp.stored_source_assert((select to_jsonb(x)=snapshot_before from private.analysis_scoring_inputs x where analysis_id=a.id)
    and (select to_jsonb(x)=result_before from public.analysis_deterministic_results x where analysis_id=a.id),
    'snapshot_and_result_unchanged');
end;
$stored_source_cases$;
set constraints all immediate;
rollback;
-- Still deferred: real role/catalog installation and multi-session contention,
-- concurrent original retirement/deletion/FK cleanup and consumer adoption.
