-- PRIVILEGED MUTATING ROLLBACK-ONLY draft. SQL UNPARSED/UNEXECUTED.
-- Requires separately admitted DIRECT synthetic target/function owner, exact
-- source profiles, actual CHECK/default reconciliation, cleanup packet and three
-- real original-bound qualitative_review fixtures with independent active roots.
-- The assessed completion MUST come from the actual Node compiler on fixture1's
-- exact stored original text (including its full capture), not a fabricated plan.
-- Native producer/role/race/cleanup acceptance remains OPEN. No SDK/app grant.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';
create function pg_temp.ifpub_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'INITIAL_FEEDBACK_PUBLICATION_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $ifpub_cases$
declare owner_value uuid:=nullif(current_setting('resumide.feedback_owner',true),'')::uuid;
 assessed_id uuid:=nullif(current_setting('resumide.feedback_assessed_analysis',true),'')::uuid;
 unknown_id uuid:=nullif(current_setting('resumide.feedback_unknown_analysis',true),'')::uuid;
 no_dispatch_id uuid:=nullif(current_setting('resumide.feedback_partial_analysis',true),'')::uuid;
 descriptor jsonb:=nullif(current_setting('resumide.feedback_publication_policy',true),'')::jsonb;
 completion jsonb:=nullif(current_setting('resumide.feedback_assessed_completion',true),'')::jsonb;
 a public.analyses%rowtype;j public.analysis_jobs%rowtype;lease_value jsonb;selector jsonb;prepared jsonb;won jsonb;settled jsonb;
 finished jsonb;replayed jsonb;current_read jsonb;exported jsonb;metadata jsonb;op uuid;att uuid;binding_sha text;pub_id uuid;pub_before jsonb;
 denied boolean;function_owner name;partial_completion jsonb;fixture_id uuid;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
  where oid=to_regprocedure('public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)'));
 perform pg_temp.ifpub_assert(current_user=function_owner and owner_value is not null and assessed_id is not null and unknown_id is not null
  and no_dispatch_id is not null and assessed_id<>unknown_id and assessed_id<>no_dispatch_id and unknown_id<>no_dispatch_id,'separate_owner_fixtures_required');
 perform pg_temp.ifpub_assert(private.ifo_policy_valid(descriptor) and descriptor->'budgetPolicyVersion'='null'::jsonb
  and completion->>'kind'='assessed','actual_source_descriptor_and_compiler_capture_required');
 metadata:=public.read_initial_feedback_publication_readiness();
 perform pg_temp.ifpub_assert(metadata->'schemaReady'='true'::jsonb and metadata->'readerExecutable'='false'::jsonb
  and metadata->'finishExecutable'='false'::jsonb and metadata->'exportExecutable'='false'::jsonb,'source_ready_staged_data_denied');
 foreach fixture_id in array array[assessed_id,unknown_id,no_dispatch_id] loop
  select * into strict a from public.analyses where id=fixture_id and owner_id=owner_value;
  perform pg_temp.ifpub_assert(a.status='qualitative_review' and exists(select 1 from private.analysis_scoring_inputs where analysis_id=a.id)
   and not exists(select 1 from private.initial_feedback_operations where analysis_id=a.id)
   and not exists(select 1 from public.analysis_results where analysis_id=a.id)
   and not exists(select 1 from public.writer_drafts where analysis_id=a.id),'fresh_actual_bound_unpublished_fixtures_required');
 end loop;
 -- Owner-only rollback fixture registration, never a migration/application seed.
 insert into private.initial_feedback_policies(version,sha256,descriptor) values(descriptor->>'version',descriptor->>'sha256',descriptor);
 insert into private.initial_feedback_selections(organization_id,policy_version,policy_sha256,enabled)
  select distinct organization_id,descriptor->>'version',descriptor->>'sha256',true from public.analyses where id=any(array[assessed_id,unknown_id,no_dispatch_id]);
 selector:=jsonb_build_object('version',descriptor->>'version','sha256',descriptor->>'sha256');
 select * into strict j from public.analysis_jobs where analysis_id=assessed_id;
 lease_value:=jsonb_build_object('workerId',j.lease_owner,'attempt',j.attempt_count,'leaseFence',j.lease_fence);
 prepared:=public.prepare_initial_feedback(assessed_id,lease_value,selector,null);
 op:=(prepared->'operation'->>'operationId')::uuid;att:=(prepared->'attempt'->>'attemptId')::uuid;binding_sha:=prepared->'operation'->>'bindingSha256';
 perform pg_temp.ifpub_assert(prepared->'dispatchAllowed'='false'::jsonb and prepared->'context'<>'null'::jsonb,'prepare_is_not_dispatch');
 won:=public.claim_initial_feedback_dispatch(assessed_id,lease_value,op,att,binding_sha,null);
 perform pg_temp.ifpub_assert(won->'dispatchAllowed'='true'::jsonb,'one_actual_claim');
 perform public.settle_initial_feedback_attempt(op,att,binding_sha,'{"inputTokens":"13","outputTokens":"2"}'::jsonb,null);
 finished:=public.finish_initial_feedback(assessed_id,lease_value,op,att,binding_sha,completion,'synthetic-publication','synthetic-assessed');
 pub_id:=(finished->'publication'->>'publicationId')::uuid;
 perform pg_temp.ifpub_assert(finished->>'status'='published' and finished->'publication'->>'state'='assessed'
  and finished->'publication'->'receipt'->'replayed'='false'::jsonb
  and (select count(*)=1 from private.initial_feedback_publications where id=pub_id)
  and (select count(*)=1 from public.analysis_ai_runs where id=(finished->'publication'->'receipt'->>'runId')::uuid)
  and (select status='completed' from public.analyses where id=assessed_id),'atomic_real_assessed_publication');
 perform pg_temp.ifpub_assert((select publication_sha256=private.ifo_sha(publication_core::text) and not(publication_core?'receipt')
  and completion_sha256=private.ifo_sha(completion::text) from private.initial_feedback_publications where id=pub_id),'native_digest_domains');
 -- Exact original publication before fresh lease, current JD and policy choice.
 update public.analysis_jobs set lease_owner='synthetic-new-worker',lease_fence=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=assessed_id;
 update private.initial_feedback_selections set enabled=false where organization_id=(select organization_id from public.analyses where id=assessed_id);
 replayed:=public.finish_initial_feedback(assessed_id,lease_value,op,att,binding_sha,completion,'new-audit-only','new-audit-only');
 perform pg_temp.ifpub_assert(replayed->'publication'->'receipt'->'replayed'='true'::jsonb
  and (replayed->'publication'-'receipt')=(finished->'publication'-'receipt')
  and (select count(*)=1 from public.analysis_ai_runs where analysis_id=assessed_id),'exact_finish_replay_no_provider_or_projection_duplication');
 replayed:=public.prepare_initial_feedback(assessed_id,lease_value,selector,null);
 perform pg_temp.ifpub_assert(replayed->>'status'='published' and replayed->'dispatchAllowed'='false'::jsonb and replayed->'context'='null'::jsonb,'prepare_published_replay');
 denied:=false;
 begin perform public.finish_initial_feedback(assessed_id,lease_value,op,att,binding_sha,jsonb_set(completion,array['plan','sourceTextSha256'],to_jsonb(repeat('a',64))),'same','same');
 exception when sqlstate 'P0C01' or sqlstate '22023' then denied:=true;end;
 perform pg_temp.ifpub_assert(denied,'changed_completion_conflicts');
 current_read:=public.read_initial_feedback(owner_value,assessed_id);
 perform pg_temp.ifpub_assert(current_read->>'status'='available' and current_read->'publication'->>'publicationId'=pub_id::text,'owned_exact_projection_read');
 -- Isolated projection mutation must fail closed; rollback this branch only.
 begin
  update public.writer_drafts set draft=jsonb_build_object('summary','synthetic changed text','bullets','[]'::jsonb) where analysis_id=assessed_id and kind='summary';
  denied:=false;begin perform public.read_initial_feedback(owner_value,assessed_id);exception when sqlstate 'P0C03' then denied:=true;end;
  perform pg_temp.ifpub_assert(denied,'projection_digest_mismatch_refused');raise exception 'ROLLBACK_PUBLICATION_PROBE' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;end;
 -- Unknown terminal attempt publishes only a deterministic partial. Late safe
 -- usage fills metadata while immutable publication and hold history stay exact.
 update private.initial_feedback_selections set enabled=true where organization_id in (select organization_id from public.analyses where id=any(array[unknown_id,no_dispatch_id]));
 select * into strict j from public.analysis_jobs where analysis_id=unknown_id;
 lease_value:=jsonb_build_object('workerId',j.lease_owner,'attempt',j.attempt_count,'leaseFence',j.lease_fence);
 prepared:=public.prepare_initial_feedback(unknown_id,lease_value,selector,null);
 op:=(prepared->'operation'->>'operationId')::uuid;att:=(prepared->'attempt'->>'attemptId')::uuid;binding_sha:=prepared->'operation'->>'bindingSha256';
 won:=public.claim_initial_feedback_dispatch(unknown_id,lease_value,op,att,binding_sha,null);
 perform pg_temp.ifpub_assert(won->'dispatchAllowed'='true'::jsonb,'unknown_actual_claim');
 perform public.settle_initial_feedback_attempt(op,att,binding_sha,null,'timeout');
 partial_completion:=jsonb_build_object('kind','deterministic_only','reason','provider_unavailable','plan',null,'observation',null,'generationFailure',null);
 finished:=public.finish_initial_feedback(unknown_id,lease_value,op,att,binding_sha,partial_completion,'synthetic','synthetic-unknown');
 pub_id:=(finished->'publication'->>'publicationId')::uuid;
 select to_jsonb(p) into strict pub_before from private.initial_feedback_publications p where id=pub_id;
 perform pg_temp.ifpub_assert(finished->'publication'->'compatibility'->'writer'='null'::jsonb and finished->'publication'->'receipt'->'writerSha256'='null'::jsonb
  and exists(select 1 from public.writer_drafts where analysis_id=unknown_id and kind='summary' and draft=jsonb_build_object('summary',null,'bullets','[]'::jsonb)),
  'logical_partial_no_writer_proof_and_real_physical_empty_legacy_row');
 settled:=public.settle_initial_feedback_attempt(op,att,binding_sha,'{"inputTokens":"7","outputTokens":"3"}'::jsonb,'timeout');
 perform pg_temp.ifpub_assert(settled->>'state'='failed' and (select to_jsonb(p)=pub_before from private.initial_feedback_publications p where id=pub_id),'late_known_preserves_publication');
 won:=public.claim_initial_feedback_dispatch(unknown_id,lease_value,op,att,binding_sha,null);
 perform pg_temp.ifpub_assert(won->'dispatchAllowed'='false'::jsonb,'late_claim_refused');
 -- AI-off branch has no claim/consent/budget/provider side effect.
 select * into strict j from public.analysis_jobs where analysis_id=no_dispatch_id;
 lease_value:=jsonb_build_object('workerId',j.lease_owner,'attempt',j.attempt_count,'leaseFence',j.lease_fence);
 prepared:=public.prepare_initial_feedback(no_dispatch_id,lease_value,selector,null);
 op:=(prepared->'operation'->>'operationId')::uuid;binding_sha:=prepared->'operation'->>'bindingSha256';
 partial_completion:=jsonb_build_object('kind','deterministic_only','reason','ai_disabled','plan',null,'observation',null,'generationFailure',null);
 finished:=public.finish_initial_feedback(no_dispatch_id,lease_value,op,null,binding_sha,partial_completion,'synthetic','synthetic-no-dispatch');
 perform pg_temp.ifpub_assert(finished->'publication'->'receipt'->'attemptId'='null'::jsonb
  and not exists(select 1 from private.initial_feedback_attempts where operation_id=op and (state<>'cancelled_before_dispatch' or claimed_at is not null)),'unclaimed_metadata_cancelled');
 -- Complete account export includes all three source/status variants.
 exported:=public.export_initial_feedback_records(owner_value);
 perform pg_temp.ifpub_assert(exported->>'schemaVersion'='initial-feedback-export/1.0.0'
  and (select count(*)=3 from jsonb_array_elements(exported->'publications') x where (x->>'analysis_id')::uuid=any(array[assessed_id,unknown_id,no_dispatch_id])),
  'complete_owned_publication_export');
end;
$ifpub_cases$;
set constraints all immediate;
rollback;
-- OPEN: independent budget-on finish + actual R03 settlement, actual source/JD
-- historical and retirement/privacy refusal, Node/compiler→PG equality, two-
-- session CAS/cancellation/lease/consent/source races, RLS/catalog/default/check
-- reconciliation, account erase/unlink/retention and staged grant adoption.
-- This draft is not concurrency, Native behavior, release or usefulness proof.
