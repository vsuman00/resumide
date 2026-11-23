-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- Separately admit a DIRECT isolated synthetic target/function owner, actual
-- CHECK/default/role/ACL reconciliation and real R03 factory-created fixtures.
-- Natural historical periods are required; no backdating/clock override or
-- replacement empty fixture. Settings select preregistered rows, not permission.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';
create function pg_temp.budget_export_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'BUDGET_EXPORT_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $owned_budget_cases$
declare owner_value uuid:=nullif(current_setting('resumide.budget_export_owner',true),'')::uuid;
 foreign_actor uuid:=nullif(current_setting('resumide.budget_export_foreign_actor',true),'')::uuid;
 expected jsonb:=nullif(current_setting('resumide.budget_export_expected8',true),'')::jsonb;
 answer jsonb;metadata jsonb;before_value jsonb;after_value jsonb;function_owner name;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
  where oid=to_regprocedure('public.export_owned_ai_budget_records(uuid)'));
 perform pg_temp.budget_export_assert(current_user=function_owner and owner_value is not null and foreign_actor is not null
  and foreign_actor<>owner_value and expected is not null,'separate_exact_synthetic_target_admission');
 metadata:=public.read_owned_ai_budget_export_readiness();
 perform pg_temp.budget_export_assert(metadata->'schemaReady'='true'::jsonb and metadata->'exportExecutable'='false'::jsonb
  and not has_function_privilege('service_role','public.export_owned_ai_budget_records(uuid)','EXECUTE'),
  'staged_export_not_runtime_R03_ready');
 before_value:=jsonb_build_object(
  'ops',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb) from private.ai_budget_operations o where o.user_id=owner_value),
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from private.ai_budget_events e join private.ai_budget_attempts a on a.id=e.attempt_id join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value or e.operator_id=owner_value),
  'operators',(select coalesce(jsonb_agg(to_jsonb(r) order by r.organization_id),'[]'::jsonb) from private.ai_budget_reconciliation_operators r where r.operator_id=owner_value));
 answer:=public.export_owned_ai_budget_records(owner_value);
 perform pg_temp.budget_export_assert(answer=expected,'exact_preregistered_owner_collections');
 perform pg_temp.budget_export_assert((select count(distinct x->>'organization_id') from jsonb_array_elements(answer->'operations') x)>=2
  and (select count(distinct x->>'period') from jsonb_array_elements(answer->'attempts') x)>=2
  and jsonb_array_length(answer->'operatorActions')>0 and jsonb_array_length(answer->'reconciliationOperators')>0,
  'real_multi_org_historical_and_operator_fixture_not_empty');
 perform pg_temp.budget_export_assert(exists(select 1 from jsonb_array_elements(answer->'events') x
  where x->>'kind'='reconcile' and x->>'operator_disposition'='redacted' and x->'operator_id'='null'::jsonb)
  and position(foreign_actor::text in answer::text)=0,'foreign_actor_redacted');
 perform pg_temp.budget_export_assert(not exists(select 1 from jsonb_array_elements(answer->'operatorActions') x
  where x->>'operator_id'<>owner_value::text or (select array_agg(k order by k) from jsonb_object_keys(x) k)
    <>array['created_at','evidence_sha256','kind','operator_id','reconciliation_id']),
  'own_operator_foreign_target_receipt_only');
 perform pg_temp.budget_export_assert(exists(select 1 from jsonb_array_elements(answer->'attempts') x where x->>'state'='held_unknown'
  and x->'actual_input_tokens'='null'::jsonb and x->'actual_output_tokens'='null'::jsonb and x->'actual_cost_microusd'='null'::jsonb),
  'unknown_null_not_zero');
 perform pg_temp.budget_export_assert(answer->'omissions'=jsonb_build_object('sharedPools','not_subject_attributable','periodOpenings','not_subject_attributable',
  'foreignOperatorIdentity','redacted','foreignTargetHistory','redacted') and not(answer?'pools') and not(answer?'periodOpenings'),
  'no_shared_pool_or_opening_history_as_subject_data');
 after_value:=jsonb_build_object(
  'ops',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb) from private.ai_budget_operations o where o.user_id=owner_value),
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from private.ai_budget_events e join private.ai_budget_attempts a on a.id=e.attempt_id join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value or e.operator_id=owner_value),
  'operators',(select coalesce(jsonb_agg(to_jsonb(r) order by r.organization_id),'[]'::jsonb) from private.ai_budget_reconciliation_operators r where r.operator_id=owner_value));
 perform pg_temp.budget_export_assert(after_value=before_value,'ledger_unchanged_after_read');
end;
$owned_budget_cases$;
set constraints all immediate;
rollback;
-- OPEN: actual SQL compilation/roles/snapshot/resource and malformed-row refusal,
-- concurrent deletion, owner-wide privacy-worker adoption and ADR0020 lifecycle.
-- This read-only export supplies no permission for R03 reserve/claim/settlement.
