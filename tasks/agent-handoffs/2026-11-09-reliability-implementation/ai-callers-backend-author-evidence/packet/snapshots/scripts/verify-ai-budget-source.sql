-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- Separate direct disposable synthetic fixture admission required. No network,
-- storage/provider calls or physical-erasure proof. Do not run through test:db.
-- Configure resumide.ai_source_fixture JSON with ownerId,organizationId,
-- analysisId,resumeVersionId,source,request,badPolicyRequest and legacyCases[].
-- Every legacy case is pre-migration fixture data {source,request,organizationId}
-- with a retained OP1 in one of all five states. Use separate unblocked success
-- organization; no policy/opening/consent/legacy row is seeded by this draft.
begin;
set local statement_timeout='30s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='35s';
set local search_path='';
create function pg_temp.ai_source_assert(ok boolean,label text) returns void
language plpgsql set search_path='' as $$
begin if ok is not true then raise exception 'AI_SOURCE_FIXTURE_ASSERT: %',label using errcode='23514';end if;end;
$$;
do $source_cases$
declare fixture jsonb:=nullif(current_setting('resumide.ai_source_fixture',true),'')::jsonb;
 owner_id_value uuid;org_id_value uuid;operation_id_value uuid;function_owner name;reply jsonb;prior jsonb;exported jsonb;source_row private.ai_budget_operation_sources%rowtype;
 legacy_case jsonb;attempt_id_value uuid;root_id_value uuid;work record;denied boolean;count_value integer;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.ai_budget_reserve_source_next(uuid,uuid,jsonb,jsonb)'));
 perform pg_temp.ai_source_assert(current_user=function_owner and fixture is not null,'separately_admitted_disposable_owner_fixture');
 owner_id_value:=(fixture->>'ownerId')::uuid;org_id_value:=(fixture->>'organizationId')::uuid;
 operation_id_value:=(fixture->'request'->>'operationId')::uuid;
 perform pg_temp.ai_source_assert(private.ai_budget_source_ready(),'actual_exact_catalogue_and_generic_dependencies');
 reply:=public.read_ai_budget_source_readiness();
 perform pg_temp.ai_source_assert(reply->'schemaReady'='true'::jsonb and reply->'reserveExecutable'='false'::jsonb and reply->'exportExecutable'='false'::jsonb,'source_ready_default_data_grants_denied');
 -- Source-v2 additions retain every historical assertion below.
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','canonical_rewrite','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555')='8cb42107-f602-89c3-838f-2c05c01c79c8','all_caller_identity_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','canonical_rewrite','66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555')='244a1e4c-00fa-8c96-82ea-b5eb5e14a853','all_caller_identity_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','canonical_rewrite','33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555')='a91ff81a-14c6-8661-9ceb-c6cf211cae0e','all_caller_identity_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','build_account',null,null,'shared-request')='b47ea95f-21e8-8049-99fb-7df1fe878b9b','all_caller_identity_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','build_account',null,null,' ')='f07631ae-cf6d-886a-912a-bb5be37f0d5c','all_caller_identity_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_identity('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','build_account',null,null,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')='4d249a64-2a19-87ae-a3e1-9244fbb4b420','all_caller_identity_golden');
 reply:=public.ai_budget_reserve_source_next(owner_id_value,org_id_value,jsonb_build_object(
  'schemaVersion','ai-budget-source/2.0.0','kind','initial_feedback','analysisId',fixture->>'analysisId','resumeVersionId',fixture->>'resumeVersionId',
  'operationId',operation_id_value,'attemptId',fixture->'request'->>'attemptId','lease',jsonb_build_object('workerId','invalid worker','attempt',1,'leaseFence','11111111-1111-4111-8111-111111111111')),fixture->'request');
 perform pg_temp.ai_source_assert(reply->>'code'='AI_BUDGET_INVALID','invalid_native_worker_id');
 -- Required separately admitted v2 Native cases: all five source reservations,
 -- A12 cross-analysis/client-UUID separation, typed generic reserve/next/claim
 -- denial and exclusive-owner race, A13 stale lease/attempt/ordinal refusal,
 -- Build account-only deletion/export, old-seal drift and successor bootstrap.
 -- Independent Root byte vectors. These assert the REAL Native codec when this
 -- separately approved draft eventually executes; Node vectors are not SQL proof.
 perform pg_temp.ai_source_assert(private.ai_budget_source_operation_id('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','shared-request')='7cd53f15-ba8c-8625-9698-4604dabfcb4b','independent_op2_golden');
 perform pg_temp.ai_source_assert(private.ai_budget_source_operation_id('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',' ')='3a4d4106-1f24-8dc3-9b3c-12b3c76b3b03','exact_space_nonce');
 perform pg_temp.ai_source_assert(private.ai_budget_source_operation_id('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',repeat('a',128))='05dff7c7-f067-86a1-a31b-7d95f2e83fce','exact_128_byte_nonce');
 perform pg_temp.ai_source_assert(not exists(select 1 from private.ai_budget_operation_sources where operation_id=operation_id_value),'fresh_source_fixture');
 reply:=public.ai_budget_reserve_source_next(owner_id_value,org_id_value,fixture->'source',fixture->'badPolicyRequest');
 perform pg_temp.ai_source_assert(reply->>'status'='denied' and not exists(select 1 from private.ai_budget_operation_sources where operation_id=(fixture->'badPolicyRequest'->>'operationId')::uuid),'denial_rolls_back_registration');
 perform pg_temp.ai_source_assert(jsonb_array_length(fixture->'legacyCases')=5,'five_preexisting_legacy_state_fixtures_required');
 for legacy_case in select value from jsonb_array_elements(fixture->'legacyCases') loop
  reply:=public.ai_budget_reserve_source_next(owner_id_value,(legacy_case->>'organizationId')::uuid,legacy_case->'source',legacy_case->'request');
  perform pg_temp.ai_source_assert(reply->>'code'='AI_BUDGET_CONFLICT','all_retained_op1_states_refuse_ambiguous_retry');
 end loop;
 reply:=public.ai_budget_reserve_source_next(owner_id_value,org_id_value,fixture->'source',fixture->'request');
 perform pg_temp.ai_source_assert(reply->>'status'='ok' and reply->'receipt'->>'operationId'=operation_id_value::text,'actual_atomic_source_reserve');
 select * into strict source_row from private.ai_budget_operation_sources where operation_id=operation_id_value;
 root_id_value:=source_row.resume_id;attempt_id_value:=(reply->'receipt'->>'attemptId')::uuid;
 prior:=to_jsonb(source_row);
 reply:=public.ai_budget_reserve_source_next(owner_id_value,org_id_value,fixture->'source',fixture->'request');
 perform pg_temp.ai_source_assert(reply->'receipt'->'replayed'='true'::jsonb and (select to_jsonb(s) from private.ai_budget_operation_sources s where operation_id=operation_id_value)=prior,'exact_retry_does_not_rewrite_registration');
 exported:=public.export_owned_ai_budget_sources(owner_id_value);
 perform pg_temp.ai_source_assert(exported->>'ownerId'=owner_id_value::text and exists(select 1 from jsonb_array_elements(exported->'sources') x where x->>'operationId'=operation_id_value::text),'complete_source_export_contains_actual_registration');
 denied:=false;
 begin update private.ai_budget_operation_sources set request_nonce='changed' where operation_id=operation_id_value;
 exception when sqlstate '23514' then denied:=SQLERRM='AI_SOURCE_IMMUTABLE';end;
 perform pg_temp.ai_source_assert(denied,'immutable_registered_selector');
 -- One-version isolated root fixture; ensure this claim cannot touch another root.
 perform pg_temp.ai_source_assert((select count(*) from public.resume_versions where resume_id=root_id_value)=1 and not exists(select 1 from public.resumes r where r.id<>root_id_value and (r.status='deleted' or r.created_at<clock_timestamp())),'single_retirement_root_fixture');
 count_value:=0;
 for work in select * from public.claim_expired_resume_objects(clock_timestamp(),1) loop
  count_value:=count_value+1;perform pg_temp.ai_source_assert(work.resume_id=root_id_value,'exact_fixture_root_claimed');
  perform pg_temp.ai_source_assert(public.complete_retention_item(work.item_id),'simulated_storage_removal_receipt_only');
 end loop;
 perform pg_temp.ai_source_assert(count_value=1 and not exists(select 1 from public.resumes where id=root_id_value),'actual_retirement_capture_before_parent_cascade');
 perform pg_temp.ai_source_assert(exists(select 1 from private.owned_ai_operation_dispositions where kind='r03' and operation_id=operation_id_value and phase='prepared' and source_scope='resume_root' and resume_id=root_id_value),'registered_unpublished_r03_clock_captured');
 exported:=public.export_owned_ai_budget_sources(owner_id_value);
 perform pg_temp.ai_source_assert(exists(select 1 from jsonb_array_elements(exported->'sources') x where x->>'operationId'=operation_id_value::text),'source_export_survives_exact_parent_deletion');
 reply:=public.ai_budget_claim_dispatch(owner_id_value,org_id_value,(fixture->'request')||jsonb_build_object('attemptOrdinal',1));
 perform pg_temp.ai_source_assert(reply->>'status'='denied' and (select state from private.ai_budget_attempts where id=attempt_id_value)='reserved','generic_claim_cannot_bypass_retired_parent');
 reply:=public.ai_budget_release(owner_id_value,org_id_value,(fixture->'request')||jsonb_build_object('attemptOrdinal',1));
 perform pg_temp.ai_source_assert(reply->>'status'='ok' and (select state from private.ai_budget_attempts where id=attempt_id_value)='released','predispatch_release_retains_original_semantics');
 -- Separately admitted Native follow-up remains mandatory: account preparation
 -- then export; reserve/claim/retirement/old-selector races; all-role direct DML
 -- denial; postdispatch settle/unknown/reconcile without live parents; dropped
 -- CHECK/index/guard/default catalogue drift; original-month totals and holds.
end;
$source_cases$;
rollback;
