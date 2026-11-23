-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. UNPARSED/UNEXECUTED.
-- Requires a separately admitted DIRECT synthetic target/function owner, actual
-- CHECK/default/role/catalog reconciliation and isolated exact fixture orgs.
-- No settings authorize a run. No SDK, global worker, grants, backfill or clock
-- override is provided. All valid claims/publications come from actual factories.
-- Current/past unknown claims MUST retain actual original DB-clock timestamps:
-- no backdating/trigger disablement to fabricate historical producer proof.
-- Precompat/bad-link technical compatibility fixtures, if separately admitted,
-- must be labeled privileged raw fixtures; they prove no producer admission.
-- The preregistered expected13reply must independently enumerate three current
-- partitions, authoritative A12/A13 linked IDs and any natural cross-month
-- claim/publish records. Missing cases refuse admission, never pass substitutes.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';
create function pg_temp.owned_usage_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'OWNED_USAGE_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $owned_usage_cases$
declare owner_value uuid:=nullif(current_setting('resumide.owned_usage_owner',true),'')::uuid;
 analysis_value uuid:=nullif(current_setting('resumide.owned_usage_analysis',true),'')::uuid;
 foreign_value uuid:=nullif(current_setting('resumide.owned_usage_foreign_owner',true),'')::uuid;
 bad_analysis uuid:=nullif(current_setting('resumide.owned_usage_bad_link_analysis',true),'')::uuid;
 current_attempt uuid:=nullif(current_setting('resumide.owned_usage_current_unknown_attempt',true),'')::uuid;
 past_attempt uuid:=nullif(current_setting('resumide.owned_usage_past_unknown_attempt',true),'')::uuid;
 expected jsonb:=nullif(current_setting('resumide.owned_usage_expected13',true),'')::jsonb;
 observed jsonb;after_current jsonb;after_past jsonb;metadata jsonb;denied boolean;function_owner name;
 a public.analyses%rowtype;o private.initial_feedback_operations%rowtype;t private.initial_feedback_attempts%rowtype;
 pool_before jsonb;pool_after jsonb;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
   where oid=to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)'));
 perform pg_temp.owned_usage_assert(current_user=function_owner and owner_value is not null and analysis_value is not null
   and foreign_value is not null and foreign_value<>owner_value and bad_analysis is not null
   and current_attempt is not null and past_attempt is not null and current_attempt<>past_attempt and expected is not null,
   'separate_exact_target_fixture_admission');
 metadata:=public.read_initial_feedback_readiness();
 perform pg_temp.owned_usage_assert(metadata-array['schemaReady','readerExecutable','prepareExecutable','claimExecutable','settleExecutable','finishExecutable','usageExecutable','exportExecutable']
   =$actual_profile${"schemaVersion":"initial-feedback-readiness/1.0.0","profileVersion":"initial-feedback-readiness-profile/1.0.0","checkerSha256":"7e37b1d085058f95b15bfd5f7e28b8e120875ee2b1eef5ad13aca110ea10ed2f","readerSha256":"57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b","prepareSha256":"93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92","claimSha256":"335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a","settleSha256":"739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148","finishSha256":"966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8","usageSha256":"b242c0e264b0dfa5307f742a77e7a3cc0818bc9c18c88b946d9b27ee0a25889f","exportSha256":"eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd","metadataSha256":"2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6"}$actual_profile$::jsonb and metadata->'schemaReady'='true'::jsonb
   and metadata->'usageExecutable'='false'::jsonb and metadata->'readerExecutable'='false'::jsonb and metadata->'prepareExecutable'='false'::jsonb
   and metadata->'claimExecutable'='false'::jsonb and metadata->'settleExecutable'='false'::jsonb and metadata->'finishExecutable'='false'::jsonb
   and metadata->'exportExecutable'='false'::jsonb and not has_function_privilege('service_role','public.read_initial_feedback_usage(uuid,uuid)','EXECUTE'),
   'actual_full_profile_staged_not_adopted');
 select * into strict a from public.analyses where id=analysis_value and owner_id=owner_value;
 -- Independent expected fixture values include all claimed outcomes and exact
 -- linked old runs once, using ORIGINAL claim month rather than run.created_at.
 observed:=public.read_initial_feedback_usage(owner_value,analysis_value);
 perform pg_temp.owned_usage_assert(observed=expected,'exact_preregistered_partition_no_double_count');
 perform pg_temp.owned_usage_assert((observed->>'legacyUnlinkedTokens')::numeric>0 and (observed->>'canonicalTokens')::numeric>0
   and (observed->>'initialFeedbackTokens')::numeric>0 and (observed->>'unknownClaims')::numeric>0,
   'all_components_and_unknown_present_not_empty_substitute');
 -- Required actual linkage fixtures span all months, including a known A12
 -- precompat run and a natural old-claim/current-publication A13 record.
 perform pg_temp.owned_usage_assert(exists(select 1 from private.canonical_rewrite_operations c join public.analysis_ai_runs r on r.id=c.run_id
   where c.organization_id=a.organization_id and c.claimed_at is not null and c.usage is not null)
   and exists(select 1 from private.initial_feedback_publications p join private.initial_feedback_attempts x on x.attempt_id=p.attempt_id
     join public.analysis_ai_runs r on r.id=p.run_id where p.organization_id=a.organization_id
       and x.claimed_at<(observed->>'periodStart')::date::timestamp at time zone 'UTC'
       and r.created_at>=(observed->>'periodStart')::date::timestamp at time zone 'UTC'),
   'real_linked_and_cross_month_fixture_requirements');
 pool_before:=(select coalesce(jsonb_agg(to_jsonb(p) order by p.period),'[]'::jsonb) from private.ai_budget_pools p where p.organization_id=a.organization_id);
 select * into strict t from private.initial_feedback_attempts where attempt_id=current_attempt and claimed_at is not null and usage is null;
 select * into strict o from private.initial_feedback_operations where operation_id=t.operation_id and organization_id=a.organization_id;
 perform pg_temp.owned_usage_assert(t.claimed_at>=(observed->>'periodStart')::date::timestamp at time zone 'UTC'
   and t.claimed_at<(observed->>'periodEnd')::date::timestamp at time zone 'UTC','real_current_unknown_claim');
 perform public.settle_initial_feedback_attempt(o.operation_id,t.attempt_id,o.binding_sha256,'{"inputTokens":"7","outputTokens":"5"}'::jsonb,t.error_code);
 after_current:=public.read_initial_feedback_usage(owner_value,analysis_value);
 perform pg_temp.owned_usage_assert(after_current->>'periodStart'=observed->>'periodStart'
   and (after_current->>'initialFeedbackTokens')::numeric=(observed->>'initialFeedbackTokens')::numeric+12
   and (after_current->>'totalTokens')::numeric=(observed->>'totalTokens')::numeric+12
   and (after_current->>'unknownClaims')::numeric=(observed->>'unknownClaims')::numeric-1
   and after_current->'legacyUnlinkedTokens'=observed->'legacyUnlinkedTokens' and after_current->'canonicalTokens'=observed->'canonicalTokens',
   'known_late_observation_keeps_claim_month');
 select * into strict t from private.initial_feedback_attempts where attempt_id=past_attempt and claimed_at is not null and usage is null;
 select * into strict o from private.initial_feedback_operations where operation_id=t.operation_id and organization_id=a.organization_id;
 perform pg_temp.owned_usage_assert(t.claimed_at<(observed->>'periodStart')::date::timestamp at time zone 'UTC','actual_prior_month_no_backdate');
 perform public.settle_initial_feedback_attempt(o.operation_id,t.attempt_id,o.binding_sha256,'{"inputTokens":"7","outputTokens":"5"}'::jsonb,t.error_code);
 after_past:=public.read_initial_feedback_usage(owner_value,analysis_value);
 perform pg_temp.owned_usage_assert(after_past=after_current,'prior_month_settlement_not_current_month_credit');
 pool_after:=(select coalesce(jsonb_agg(to_jsonb(p) order by p.period),'[]'::jsonb) from private.ai_budget_pools p where p.organization_id=a.organization_id);
 perform pg_temp.owned_usage_assert(pool_after=pool_before,'read_and_technical_mirror_do_not_debit_budget');
 denied:=false;
 begin perform public.read_initial_feedback_usage(foreign_value,analysis_value);
 exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.owned_usage_assert(denied,'foreign_owned_binding_refused');
 denied:=false;
 begin perform public.read_initial_feedback_usage(owner_value,bad_analysis);
 exception when sqlstate 'P0C03' then denied:=true;end;
 perform pg_temp.owned_usage_assert(denied,'malformed_authoritative_link_refused_whole_reply');
end;
$owned_usage_cases$;
set constraints all immediate;
rollback;
-- OPEN: actual SQL compilation/execution, Native roles/isolation/concurrency,
-- resource bounds, current UTC cutover, caller deployment and privacy/retention.
-- A single transaction does not prove concurrent quota enforcement. R03 owns
-- hard reserve/debit; this counter is an observational quota read only.
