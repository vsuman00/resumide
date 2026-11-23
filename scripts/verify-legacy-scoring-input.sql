-- DEFERRED PRIVILEGED MUTATING ROLLBACK-ONLY VERIFIER. UNPARSED/UNEXECUTED.
-- Requires a separately admitted DIRECT managed synthetic target, exact role/
-- migration/source pins and an owned LEGACY analysis in scoring with extraction,
-- a nonnull owned job, an active lease, and NO deterministic/proof/evidence row.
-- expected_result must be produced beforehand by the actual unchanged Node22
-- scoreExtractedResume on this exact read context and privately hash-bound by
-- the admitted operator. Settings select fixtures; they do not authorize a run.
-- No provider, global claim, parser/OCR or real document is executed here.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';

create function pg_temp.scoring_assert(p_value boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin
  if p_value is not true then raise exception 'SCORING_INPUT_FIXTURE_ASSERTION: %',p_label using errcode='23514';end if;
end;
$$;

do $admission$
declare fixture_analysis_id uuid:=nullif(current_setting('resumide.scoring_analysis_id',true),'')::uuid;
  fixture_owner_id uuid:=nullif(current_setting('resumide.scoring_owner_id',true),'')::uuid;
  foreign_owner_id uuid:=nullif(current_setting('resumide.scoring_foreign_owner_id',true),'')::uuid;
  lease_value jsonb:=nullif(current_setting('resumide.scoring_lease',true),'')::jsonb;
  expected_result jsonb:=nullif(current_setting('resumide.scoring_expected_result',true),'')::jsonb;
  metadata jsonb;signature text;
begin
  perform pg_temp.scoring_assert(current_setting('resumide.scoring_allocation',true)='owned-legacy-scoring-rollback/1'
    and fixture_analysis_id is not null and fixture_owner_id is not null and foreign_owner_id is not null and foreign_owner_id<>fixture_owner_id,
    'separate_admission_required');
  perform pg_temp.scoring_assert(exists(select 1 from public.analyses where id=fixture_analysis_id and owner_id=fixture_owner_id and status='scoring' and job_id is not null)
    and exists(select 1 from auth.users where id=foreign_owner_id)
    and private.legacy_scoring_lease(lease_value) is true and jsonb_typeof(expected_result)='object', 'actual_fixture_and_node_result_required');
  perform pg_temp.scoring_assert(not exists(select 1 from public.analysis_deterministic_results where analysis_id=fixture_analysis_id)
    and not exists(select 1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id)
    and not exists(select 1 from public.document_evidence_attempts where analysis_id=fixture_analysis_id),'fresh_legacy_only');
  metadata:=public.read_legacy_scoring_readiness();
  perform pg_temp.scoring_assert(metadata-'schemaReady'-'writerExecutable' = $profile${"schemaVersion":"legacy-scoring-readiness/1.0.0","profileVersion":"legacy-scoring-profile/1.0.0","checkerSha256":"e891aed3848b39893718d883f7a3ff5efb3ebeda3ee6967d64daa13924075458","readerSha256":"1b9891fc6ece7e948c4623b6455686a2fc42e4896ff3fcc78f0ce0275a44d7c3","finishSha256":"e367a8f688b2661fc8baa374ad44a4be90712016d3ed44214857ed1127e10f18","contextSha256":"c79b6174de5e28fc56a0cb3648d5e1cc4e19ff5139f2869ce54478c9cf6cf618","exportSha256":"e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2","metadataSha256":"f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8"}$profile$::jsonb
    and metadata->'schemaReady'='true'::jsonb and metadata->'writerExecutable'='false'::jsonb,'exact_staged_profile');
  foreach signature in array array['public.read_legacy_scoring_input(uuid,jsonb)','public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text)',
    'public.read_legacy_scoring_context(uuid,uuid)','public.export_legacy_scoring_inputs(uuid)'] loop
    perform pg_temp.scoring_assert(not has_function_privilege('service_role',signature,'EXECUTE')
      and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'),'data_calls_initially_denied');
  end loop;
end;
$admission$;

-- Transaction-only capability for an ADMITTED native test, never activation.
grant execute on function public.read_legacy_scoring_input(uuid,jsonb),public.finish_legacy_scoring_input(uuid,jsonb,jsonb,jsonb,text,text),
  public.read_legacy_scoring_context(uuid,uuid),public.export_legacy_scoring_inputs(uuid) to service_role;

create temporary sequence scoring_fault_reached;
create function pg_temp.scoring_owned_fault() returns trigger language plpgsql set search_path='' as $$
begin
  if new.analysis_id::text=current_setting('resumide.scoring_analysis_id',true) then
    if current_setting('resumide.scoring_fault',true)='old_false' then
      perform nextval('pg_temp.scoring_fault_reached'::regclass);
      update public.analyses set status='cancelled' where id=new.analysis_id;
    elsif current_setting('resumide.scoring_fault',true)='expire' then
      perform nextval('pg_temp.scoring_fault_reached'::regclass);
      update public.analysis_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=new.analysis_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger scoring_owned_fault after insert on public.analysis_deterministic_results for each row execute function pg_temp.scoring_owned_fault();

do $cases$
declare fixture_analysis_id uuid:=current_setting('resumide.scoring_analysis_id')::uuid;
  fixture_owner_id uuid:=current_setting('resumide.scoring_owner_id')::uuid;
  foreign_owner_id uuid:=current_setting('resumide.scoring_foreign_owner_id')::uuid;
  lease_value jsonb:=current_setting('resumide.scoring_lease')::jsonb;
  expected_result jsonb:=current_setting('resumide.scoring_expected_result')::jsonb;
  ready_value jsonb;binding_value jsonb;receipt jsonb;replay jsonb;saved jsonb;exported jsonb;
  a public.analyses%rowtype;j public.analysis_jobs%rowtype;job_before public.jobs%rowtype;
  failed boolean;fault text;probe_before bigint;baseline_context jsonb;old_zone text;new_lease jsonb;
begin
  select * into strict a from public.analyses where id=fixture_analysis_id and owner_id=fixture_owner_id;
  select * into strict j from public.analysis_jobs where analysis_id=fixture_analysis_id;
  select * into strict job_before from public.jobs where id=a.job_id and owner_id=fixture_owner_id;
  ready_value:=public.read_legacy_scoring_input(fixture_analysis_id,lease_value);
  perform pg_temp.scoring_assert(ready_value->>'status'='ready' and not exists(select 1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id)
    and not exists(select 1 from public.analysis_deterministic_results where analysis_id=fixture_analysis_id),'read_has_no_publication');
  baseline_context:=ready_value->'context';binding_value:=baseline_context->'binding';
  perform pg_temp.scoring_assert(expected_result->'inputTextChecksum'=baseline_context->'extraction'->'textChecksum','actual_node_result_same_text');
  -- Current JD mutation invalidates the native binding before any old write.
  update public.jobs set description=description||E'\nSynthetic scoped change.' where id=job_before.id;
  failed:=false;
  begin
    perform public.finish_legacy_scoring_input(fixture_analysis_id,lease_value,binding_value,expected_result,'scoring-native','scoring-native');
  exception when sqlstate 'P0C01' then failed:=true;end;
  perform pg_temp.scoring_assert(failed and not exists(select 1 from public.analysis_deterministic_results where analysis_id=fixture_analysis_id),'jd_changed_no_write');
  update public.jobs set description=job_before.description where id=job_before.id;
  -- These exact scoped faults prove rollback after the old insert is reached.
  foreach fault in array array['old_false','expire'] loop
    select case when is_called then last_value else 0 end into probe_before from pg_temp.scoring_fault_reached;
    perform set_config('resumide.scoring_fault',fault,true);failed:=false;
    begin
      perform public.finish_legacy_scoring_input(fixture_analysis_id,lease_value,binding_value,expected_result,'scoring-native','scoring-native');
    exception when sqlstate 'P0C01' then failed:=true;end;
    perform pg_temp.scoring_assert(failed and (select is_called and last_value>probe_before from pg_temp.scoring_fault_reached)
      and not exists(select 1 from public.analysis_deterministic_results where analysis_id=fixture_analysis_id)
      and not exists(select 1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id)
      and (select status='scoring' from public.analyses where id=fixture_analysis_id)
      and (select lease_expires_at=j.lease_expires_at from public.analysis_jobs where analysis_id=fixture_analysis_id),'old_write_and_fault_rolled_back');
  end loop;
  perform set_config('resumide.scoring_fault','off',true);
  receipt:=public.finish_legacy_scoring_input(fixture_analysis_id,lease_value,binding_value,expected_result,'scoring-native','scoring-native');
  perform pg_temp.scoring_assert(receipt->'replayed'='false'::jsonb and receipt->'inputBindingSha256'=binding_value->'inputBindingSha256'
    and (select status='qualitative_review' from public.analyses where id=fixture_analysis_id)
    and (select count(*)=1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id),'atomic_result_and_snapshot');
  -- Original binding remains replayable after JD movement, expiry and TimeZone.
  update public.jobs set description=description||E'\nLater synthetic job edit.' where id=job_before.id;
  update public.analysis_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=fixture_analysis_id;
  old_zone:=current_setting('TimeZone');perform set_config('TimeZone','Pacific/Honolulu',true);
  replay:=public.finish_legacy_scoring_input(fixture_analysis_id,lease_value,binding_value,expected_result,'different-process','different-request');
  perform pg_temp.scoring_assert(replay-'replayed'=receipt-'replayed' and replay->'replayed'='true'::jsonb,'exact_original_replay_timezone_stable');
  perform set_config('TimeZone',old_zone,true);
  saved:=public.read_legacy_scoring_context(fixture_owner_id,fixture_analysis_id);
  perform pg_temp.scoring_assert(saved->>'status'='bound' and saved->>'currentness'='historical'
    and saved->'context'=baseline_context and saved->'result'=expected_result,'saved_original_not_current_jd');
  failed:=false;
  begin
    perform public.finish_legacy_scoring_input(fixture_analysis_id,lease_value,binding_value,
      expected_result||jsonb_build_object('score',case when (expected_result->>'score')::integer=0 then 1 else 0 end),'scoring-native','scoring-native');
  exception when sqlstate 'P0C01' then failed:=true;end;
  perform pg_temp.scoring_assert(failed,'changed_result_conflict');
  failed:=false;
  begin perform public.read_legacy_scoring_context(foreign_owner_id,fixture_analysis_id);
  exception when insufficient_privilege then failed:=true;end;
  perform pg_temp.scoring_assert(failed,'foreign_reader_refused');
  new_lease:=jsonb_build_object('workerId','scoring-new-claim','attempt',least(3,j.attempt_count+1),'leaseFence',gen_random_uuid());
  update public.analysis_jobs set lease_owner=new_lease->>'workerId',attempt_count=(new_lease->>'attempt')::integer,
    lease_fence=(new_lease->>'leaseFence')::uuid where analysis_id=fixture_analysis_id;
  perform pg_temp.scoring_assert(public.read_legacy_scoring_input(fixture_analysis_id,new_lease)->>'status'='committed','new_claim_skips_committed_scoring');
  exported:=public.export_legacy_scoring_inputs(fixture_owner_id);
  perform pg_temp.scoring_assert(exported->>'schemaVersion'='legacy-scoring-export/1.0.0'
    and exists(select 1 from jsonb_array_elements(exported->'scoringInputs') x where x->>'analysis_id'=fixture_analysis_id::text
      and x->>'owner_id'=fixture_owner_id::text and x->'input_context'=baseline_context),'full_original_owned_export');
  -- Delete only the admitted analysis in a rollback subtransaction. No retention
  -- or account-deletion orchestration is impersonated by this cascade check.
  failed:=false;
  begin
    delete from public.analyses where id=fixture_analysis_id and owner_id=fixture_owner_id;
    perform pg_temp.scoring_assert(not exists(select 1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id)
      and not exists(select 1 from public.analysis_deterministic_results where analysis_id=fixture_analysis_id),'analysis_cascade_removes_proof');
    raise exception 'ROLLBACK_SCOPED_CASCADE' using errcode='P0T01';
  exception when sqlstate 'P0T01' then failed:=true;end;
  perform pg_temp.scoring_assert(failed and exists(select 1 from private.analysis_scoring_inputs where analysis_id=fixture_analysis_id),'cascade_fixture_restored');
end;
$cases$;
set constraints all immediate;
rollback;
-- STILL PENDING: independently admitted role execution; two-session source/JD/
-- lease/deletion races; worker old/new numeric-equality fixtures; no-job, malformed
-- page arrays, source/extraction deletion and retention/account cleanup/export
-- consumer tests. This draft's settings/single session are not proofs of these.
