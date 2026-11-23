-- DRAFT / NOT EXECUTED. Requires a separately admitted ISOLATED direct Supabase
-- native-SQL target, exact reviewed migration and stop-on-error execution.
-- The custom setting below is only an accidental-execution stop; it does not
-- establish target isolation, authorize DDL or replace a private fixture ledger.
-- No provider, global queue, Docker database or commercial pricing is involved.
begin;
set local statement_timeout = '20s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '30s';

do $admission$
declare key text; value text;
begin
  if current_setting('resumide.ai_budget_test_admission',true) is distinct from 'isolated-managed-synthetic-ai-budget/1' then
    raise exception 'Technical budget test target not admitted' using errcode='42501';
  end if;
  foreach key in array array['resumide.ai_budget_test_run_id','resumide.ai_budget_test_owner_id','resumide.ai_budget_test_other_owner_id'] loop
    value:=current_setting(key,true);
    if value is null or value !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'Technical budget fixture identity not allocated' using errcode='42501';
    end if;
  end loop;
  if current_setting('resumide.ai_budget_test_owner_id')=current_setting('resumide.ai_budget_test_other_owner_id') then
    raise exception 'Technical budget fixture identities collide' using errcode='42501';
  end if;
end;
$admission$;

create function pg_temp.ai_budget_assert(p_condition boolean,p_label text)
returns void language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Technical budget assertion: %',p_label using errcode='23514'; end if;
end;
$$;

do $catalog$
declare t text; r text; f text; p record;
begin
  foreach t in array array['ai_budget_policies','ai_budget_period_openings','ai_budget_pools','ai_budget_operations',
    'ai_budget_attempts','ai_budget_events','ai_budget_reconciliation_operators'] loop
    perform pg_temp.ai_budget_assert(exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='private' and c.relname=t and c.relrowsecurity),'private_table_rls');
    perform pg_temp.ai_budget_assert(not exists(select 1 from pg_policies where schemaname='private' and tablename=t),'no_table_policy');
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.ai_budget_assert(not has_table_privilege(r,'private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'no_direct_table_grant');
    end loop;
  end loop;
  foreach f in array array['reserve','claim_dispatch','release','mark_unknown','settle','reconcile','reserve_next'] loop
    select * into strict p from pg_proc where oid=to_regprocedure('public.ai_budget_'||f||'(uuid,uuid,jsonb)');
    perform pg_temp.ai_budget_assert(p.prosecdef,'rpc_definer');
    perform pg_temp.ai_budget_assert(exists(select 1 from pg_options_to_table(p.proconfig)
      where option_name='search_path' and option_value in ('','""')),'rpc_empty_search_path');
    perform pg_temp.ai_budget_assert(has_function_privilege('service_role',p.oid,'EXECUTE'),'service_rpc_grant');
    foreach r in array array['anon','authenticated'] loop
      perform pg_temp.ai_budget_assert(not has_function_privilege(r,p.oid,'EXECUTE'),'no_client_rpc_grant');
    end loop;
  end loop;
  for p in select f.oid,f.prosecdef from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='private' and f.proname like 'ai_budget_%' loop
    perform pg_temp.ai_budget_assert(not p.prosecdef,'private_helpers_invoker');
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.ai_budget_assert(not has_function_privilege(r,p.oid,'EXECUTE'),'no_private_helper_grant');
    end loop;
  end loop;
  perform pg_temp.ai_budget_assert(private.ai_budget_cost(1,1,1,1)=1,'one_combined_integer_ceiling');
  perform pg_temp.ai_budget_assert(private.ai_budget_cost(0,0,1,1)=0,'known_zero_cost');
  perform pg_temp.ai_budget_assert(private.ai_budget_binding_sha256(
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
    '{"operationId":"00000000-0000-4000-8000-000000000003","attemptId":"00000000-0000-4000-8000-000000000004","attemptOrdinal":1,"surface":"qualitative","payloadSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","model":"synthetic-model","promptPolicyVersion":"synthetic-prompt/1","policyVersion":"synthetic-policy/1","reservedInputTokens":"10","reservedOutputTokens":"2"}'::jsonb
  )='aef2b4e2a2034dad016ec7d92116ef2e16c5f2f64751101e153943f7458b91fe','typescript_sql_binding_vector');
end;
$catalog$;

do $fixtures$
#variable_conflict use_variable
declare
  run_id uuid:=current_setting('resumide.ai_budget_test_run_id')::uuid;
  owner_id uuid:=current_setting('resumide.ai_budget_test_owner_id')::uuid;
  other_owner uuid:=current_setting('resumide.ai_budget_test_other_owner_id')::uuid;
  org_id uuid; other_org uuid; policy_a text; policy_b text; policy_off text;
  month_start date:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
  old_month date:=(date_trunc('month',clock_timestamp() at time zone 'UTC')-interval '1 month')::date;
  request jsonb; first_request jsonb; second_attempt jsonb; third_attempt jsonb; rotated_request jsonb;
  revoke_request jsonb; late_request jsonb; blocked_request jsonb; reconciliation jsonb;
  result jsonb; before_spent numeric; before_cost numeric; event_count bigint;
  requests jsonb[]:='{}'; feature text; rejected boolean;
begin
  -- The operation packet must journal these exact new synthetic users before
  -- execution. Bootstrap creates their own organizations/memberships. Generated
  -- operation IDs remain inside this rollback-only, owner-bound transaction.
  if exists(select 1 from auth.users u where u.id in (owner_id,other_owner))
    or exists(select 1 from public.organizations o where o.owner_id in (owner_id,other_owner)) then
    raise exception 'Technical budget fixture namespace already exists' using errcode='42501';
  end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
    (owner_id,'authenticated','authenticated','r03-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
    (other_owner,'authenticated','authenticated','r03-'||other_owner||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  select o.id into strict other_org from public.organizations o where o.owner_id=other_owner;
  policy_a:='synthetic-r03/'||run_id||'/a'; policy_b:='synthetic-r03/'||run_id||'/b'; policy_off:='synthetic-r03/'||run_id||'/off';
  -- Fixed synthetic microUSD rates exercise arithmetic only. They are NOT
  -- approved prices for any real model, and all inserted policies roll back.
  insert into private.ai_budget_policies(version,model,monthly_token_limit,monthly_cost_limit_microusd,
    input_microusd_per_million,output_microusd_per_million,max_attempts,enabled,approval_sha256) values
    (policy_a,'synthetic-model',1000,1000,1000000,2000000,3,true,repeat('a',64)),
    (policy_b,'synthetic-model-v2',1000000,1000000,2000000,1000000,1,true,repeat('b',64)),
    (policy_off,'synthetic-model',1000,1000,1000000,2000000,1,false,repeat('c',64));

  request:=jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid(),'attemptOrdinal',1,
    'surface','qualitative','payloadSha256',repeat('a',64),'model','synthetic-model','promptPolicyVersion','synthetic-prompt/1',
    'policyVersion',policy_a,'reservedInputTokens','10','reservedOutputTokens','2');
  result:=public.ai_budget_reserve(owner_id,org_id,request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DISABLED','missing_opening_denies_no_zero_bootstrap');
  perform pg_temp.ai_budget_assert(not exists(select 1 from private.ai_budget_pools p where p.organization_id=org_id),'missing_opening_no_pool');
  result:=public.ai_budget_reserve(owner_id,org_id,request||jsonb_build_object('policyVersion',policy_off));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DISABLED','disabled_policy_denies');
  result:=public.ai_budget_reserve(owner_id,org_id,request||'{"period":"2099-01-01"}'::jsonb);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_INVALID','caller_period_denied');
  result:=public.ai_budget_reserve(owner_id,org_id,request||'{"tokenLimit":"999999999"}'::jsonb);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_INVALID','caller_limits_denied');

  rejected:=false;
  begin
    insert into private.ai_budget_period_openings(organization_id,period,pool_policy_version,opening_spent_tokens,
      opening_spent_cost_microusd,unresolved_legacy_attempts,evidence_sha256)
      values(other_org,month_start,policy_a,0,0,1,repeat('d',64));
  exception when check_violation then rejected:=true; end;
  perform pg_temp.ai_budget_assert(rejected,'unresolved_legacy_opening_denied');
  insert into private.ai_budget_period_openings(organization_id,period,pool_policy_version,opening_spent_tokens,
    opening_spent_cost_microusd,unresolved_legacy_attempts,evidence_sha256)
    values(org_id,month_start,policy_a,0,0,0,repeat('d',64));

  foreach feature in array array['qualitative','rewrite','build'] loop
    request:=request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid(),'surface',feature);
    result:=public.ai_budget_reserve(owner_id,org_id,request);
    perform pg_temp.ai_budget_assert(result->>'status'='ok' and result->'receipt'->>'state'='reserved'
      and result->'receipt'->>'dispatchAllowed'='false' and result->'receipt'->>'period'=month_start::text,'shared_surface_reserve');
    requests:=array_append(requests,request);
  end loop;
  first_request:=requests[1];
  perform pg_temp.ai_budget_assert((select p.reserved_tokens=36 and p.reserved_cost_microusd=42 and p.token_limit=1000
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'all_three_share_one_pool');
  result:=public.ai_budget_reserve(owner_id,org_id,first_request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'replayed'='true','exact_reserve_replay');
  perform pg_temp.ai_budget_assert((select p.reserved_tokens=36 from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'reserve_replay_no_double_hold');
  result:=public.ai_budget_reserve(owner_id,org_id,first_request||jsonb_build_object('payloadSha256',repeat('f',64)));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','changed_operation_binding_conflict');
  result:=public.ai_budget_reserve(other_owner,org_id,first_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','foreign_owner_denied');
  result:=public.ai_budget_reserve(other_owner,other_org,first_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','cross_tenant_operation_denied');
  foreach request in array requests[2:3] loop
    result:=public.ai_budget_release(owner_id,org_id,request);
    perform pg_temp.ai_budget_assert(result->'receipt'->>'state'='released','release_before_dispatch');
    result:=public.ai_budget_release(owner_id,org_id,request);
    perform pg_temp.ai_budget_assert(result->'receipt'->>'replayed'='true','release_replay');
  end loop;
  result:=public.ai_budget_claim_dispatch(owner_id,org_id,first_request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'dispatchAllowed'='true','first_dispatch_claim');
  result:=public.ai_budget_claim_dispatch(owner_id,org_id,first_request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'dispatchAllowed'='false' and result->'receipt'->>'replayed'='true','claim_replay_no_dispatch');
  result:=public.ai_budget_release(owner_id,org_id,first_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_STATE','dispatched_release_denied');
  request:=first_request||'{"usage":{"inputTokens":"11","outputTokens":"7"}}'::jsonb;
  result:=public.ai_budget_settle(owner_id,org_id,request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'actualCostMicrousd'='25' and result->'receipt'->>'poolBlocked'='true','known_invalid_output_overrun_still_charged_and_blocked');
  result:=public.ai_budget_settle(owner_id,org_id,request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'replayed'='true','settlement_replay');
  result:=public.ai_budget_settle(owner_id,org_id,first_request||'{"usage":{"inputTokens":"12","outputTokens":"7"}}'::jsonb);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','conflicting_usage_denied');
  perform pg_temp.ai_budget_assert((select p.spent_tokens=18 and p.spent_cost_microusd=25 and p.reserved_tokens=0
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'known_charge_once_no_output_required');
  result:=public.ai_budget_reserve(owner_id,org_id,first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid()));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_BLOCKED','overrun_below_monthly_limit_blocks_admission');
  insert into private.ai_budget_reconciliation_operators(organization_id,operator_id,enabled,approval_sha256)
    values(org_id,owner_id,true,repeat('f',64));
  reconciliation:=first_request||jsonb_build_object('usage',jsonb_build_object('inputTokens','11','outputTokens','7'),
    'reconciliationId',gen_random_uuid(),'operatorId',owner_id,'evidenceSha256',repeat('e',64));
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'poolBlocked'='false' and result->'receipt'->>'actualCostMicrousd'='25','operator_ack_clears_only_reviewed_overrun');
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'replayed'='true','overrun_ack_replay');
  perform pg_temp.ai_budget_assert((select p.spent_tokens=18 and p.spent_cost_microusd=25 and p.reserved_tokens=0
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'overrun_ack_no_second_debit');
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation||'{"usage":{"inputTokens":"10","outputTokens":"7"}}'::jsonb);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','overrun_ack_cannot_lower_actual_usage');
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation||jsonb_build_object('reconciliationId',gen_random_uuid()));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','overrun_ack_cannot_replace_receipt_id');

  second_attempt:=first_request||jsonb_build_object('attemptId',gen_random_uuid(),'attemptOrdinal',2);
  result:=public.ai_budget_reserve(owner_id,org_id,second_attempt);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'attemptLimit'='3','operation_captures_retry_limit');
  perform public.ai_budget_claim_dispatch(owner_id,org_id,second_attempt);
  result:=public.ai_budget_mark_unknown(owner_id,org_id,second_attempt);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'state'='held_unknown' and result->'receipt'->'actualInputTokens'='null'::jsonb,'unknown_not_zero');
  perform public.ai_budget_mark_unknown(owner_id,org_id,second_attempt);
  result:=public.ai_budget_release(owner_id,org_id,second_attempt);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_STATE','unknown_never_refunded');
  third_attempt:=first_request||jsonb_build_object('attemptId',gen_random_uuid(),'attemptOrdinal',3);
  result:=public.ai_budget_reserve(owner_id,org_id,third_attempt);
  perform pg_temp.ai_budget_assert(result->>'status'='ok','bounded_retry_keeps_prior_unknown_hold');
  perform pg_temp.ai_budget_assert((select p.reserved_tokens=24 and p.reserved_cost_microusd=28
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'unknown_hold_plus_new_attempt');
  perform public.ai_budget_claim_dispatch(owner_id,org_id,third_attempt);
  perform public.ai_budget_mark_unknown(owner_id,org_id,third_attempt);

  reconciliation:=second_attempt||jsonb_build_object('usage',jsonb_build_object('inputTokens','8','outputTokens','2'),
    'reconciliationId',gen_random_uuid(),'operatorId',other_owner,'evidenceSha256',repeat('e',64));
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','reconcile_not_owner_permission');
  insert into private.ai_budget_reconciliation_operators(organization_id,operator_id,enabled,approval_sha256)
    values(other_org,other_owner,true,repeat('f',64));
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','reconciler_is_org_scoped');
  insert into private.ai_budget_reconciliation_operators(organization_id,operator_id,enabled,approval_sha256)
    values(org_id,other_owner,true,repeat('f',64));
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'state'='settled' and result->'receipt'->>'actualCostMicrousd'='12','authorized_known_reconciliation');
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'replayed'='true','reconciliation_idempotent');
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation||jsonb_build_object('evidenceSha256',repeat('a',64)));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','conflicting_reconciliation_denied');
  perform pg_temp.ai_budget_assert((select count(*)=1 from private.ai_budget_events e where e.attempt_id=(second_attempt->>'attemptId')::uuid and e.kind='unknown'),'old_unknown_receipt_retained');
  result:=public.ai_budget_reconcile(owner_id,org_id,third_attempt||jsonb_build_object('usage',jsonb_build_object('inputTokens','0','outputTokens','0'),
    'reconciliationId',gen_random_uuid(),'operatorId',other_owner,'evidenceSha256',repeat('e',64)));
  perform pg_temp.ai_budget_assert(result->'receipt'->>'actualCostMicrousd'='0','observed_zero_is_known_not_unknown');

  rotated_request:=first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid(),
    'policyVersion',policy_b,'model','synthetic-model-v2','surface','build');
  result:=public.ai_budget_reserve(owner_id,org_id,rotated_request);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'poolPolicyVersion'=policy_a and result->'receipt'->>'policyVersion'=policy_b
    and result->'receipt'->>'reservedCostMicrousd'='22' and result->'receipt'->>'attemptLimit'='1','rotation_prices_without_pool_reset');
  perform pg_temp.ai_budget_assert((select p.token_limit=1000 and p.cost_limit_microusd=1000 and p.spent_tokens=28 and p.spent_cost_microusd=37
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'first_period_limits_retained');
  perform public.ai_budget_release(owner_id,org_id,rotated_request);
  result:=public.ai_budget_reserve(owner_id,org_id,rotated_request||jsonb_build_object('attemptId',gen_random_uuid(),'attemptOrdinal',2));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_EXHAUSTED','captured_one_attempt_limit');

  revoke_request:=first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid());
  perform public.ai_budget_reserve(owner_id,org_id,revoke_request);
  perform public.ai_budget_claim_dispatch(owner_id,org_id,revoke_request);
  delete from public.memberships m where m.organization_id=org_id and m.user_id=owner_id;
  result:=public.ai_budget_reserve(owner_id,org_id,revoke_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','revoked_reserve_replay_denied');
  result:=public.ai_budget_claim_dispatch(owner_id,org_id,revoke_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_DENIED','revoked_claim_replay_denied');
  result:=public.ai_budget_settle(owner_id,org_id,revoke_request||'{"usage":{"inputTokens":"6","outputTokens":"2"}}'::jsonb);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'state'='settled','known_charge_after_revocation');
  insert into public.memberships(organization_id,user_id,role) values(org_id,owner_id,'owner');

  rejected:=false;
  begin update private.ai_budget_policies set monthly_token_limit=10000000 where version=policy_a;
  exception when check_violation then rejected:=true; end;
  perform pg_temp.ai_budget_assert(rejected,'policy_immutable');
  rejected:=false;
  begin update private.ai_budget_period_openings set opening_spent_tokens=0 where organization_id=org_id and period=month_start;
  exception when check_violation then rejected:=true; end;
  perform pg_temp.ai_budget_assert(rejected,'opening_immutable');
  rejected:=false;
  begin update private.ai_budget_operations set payload_sha256=repeat('b',64) where id=(first_request->>'operationId')::uuid;
  exception when check_violation then rejected:=true; end;
  perform pg_temp.ai_budget_assert(rejected,'operation_immutable');
  rejected:=false;
  begin delete from private.ai_budget_events e where e.attempt_id=(first_request->>'attemptId')::uuid;
  exception when check_violation then rejected:=true; end;
  perform pg_temp.ai_budget_assert(rejected,'event_history_append_only');

  -- The job attempt number is deliberately absent. SQL assigns the provider
  -- ordinal, exact UUID replay keeps it, and a new bounded retry increments it.
  request:=first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid());
  result:=public.ai_budget_reserve_next(owner_id,org_id,request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_INVALID','reserve_next_rejects_caller_ordinal');
  result:=public.ai_budget_reserve_next(owner_id,org_id,request-'attemptOrdinal');
  perform pg_temp.ai_budget_assert(result->'receipt'->>'attemptOrdinal'='1' and result->'receipt'->>'dispatchAllowed'='false','reserve_next_first_ordinal');
  result:=public.ai_budget_reserve_next(owner_id,org_id,request-'attemptOrdinal');
  perform pg_temp.ai_budget_assert(result->'receipt'->>'attemptOrdinal'='1' and result->'receipt'->>'replayed'='true','reserve_next_exact_replay');
  result:=public.ai_budget_reserve_next(owner_id,org_id,(request-'attemptOrdinal')||jsonb_build_object('payloadSha256',repeat('b',64)));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_CONFLICT','reserve_next_changed_binding_conflicts');
  perform public.ai_budget_release(owner_id,org_id,request);
  request:=request||jsonb_build_object('attemptId',gen_random_uuid());
  result:=public.ai_budget_reserve_next(owner_id,org_id,request-'attemptOrdinal');
  perform pg_temp.ai_budget_assert(result->'receipt'->>'attemptOrdinal'='2','reserve_next_derives_next_ordinal');
  perform public.ai_budget_release(owner_id,org_id,request||'{"attemptOrdinal":2}'::jsonb);

  -- Seed a previously dispatched, exactly bound historical attempt. This tests
  -- late-period accounting, not a real wall-clock rollover or worker crash.
  blocked_request:=first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid());
  perform public.ai_budget_reserve(owner_id,org_id,blocked_request);
  select p.spent_tokens,p.spent_cost_microusd into before_spent,before_cost from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start;
  insert into private.ai_budget_period_openings(organization_id,period,pool_policy_version,opening_spent_tokens,
    opening_spent_cost_microusd,unresolved_legacy_attempts,evidence_sha256) values(org_id,old_month,policy_a,0,0,0,repeat('d',64));
  insert into private.ai_budget_pools(organization_id,period,pool_policy_version,token_limit,cost_limit_microusd,
    reserved_tokens,reserved_cost_microusd,spent_tokens,spent_cost_microusd) values(org_id,old_month,policy_a,1000,1000,12,14,0,0);
  late_request:=first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid());
  insert into private.ai_budget_operations(id,organization_id,user_id,surface,payload_sha256,model,prompt_policy_version,policy_version,
    reserved_input_tokens,reserved_output_tokens,input_microusd_per_million,output_microusd_per_million,attempt_limit,binding_sha256)
    values((late_request->>'operationId')::uuid,org_id,owner_id,'qualitative',repeat('a',64),'synthetic-model','synthetic-prompt/1',policy_a,
      10,2,1000000,2000000,3,private.ai_budget_binding_sha256(owner_id,org_id,late_request));
  insert into private.ai_budget_attempts(id,operation_id,organization_id,ordinal,period,state,reserved_cost_microusd)
    values((late_request->>'attemptId')::uuid,(late_request->>'operationId')::uuid,org_id,1,old_month,'dispatched',14);
  insert into private.ai_budget_events(attempt_id,kind) values((late_request->>'attemptId')::uuid,'reserve'),((late_request->>'attemptId')::uuid,'dispatch');
  result:=public.ai_budget_settle(owner_id,org_id,late_request||'{"usage":{"inputTokens":"1001","outputTokens":"1"}}'::jsonb);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'period'=old_month::text and result->'receipt'->>'poolBlocked'='true','late_excess_blocks_across_months');
  perform pg_temp.ai_budget_assert((select p.spent_tokens=1002 and p.spent_cost_microusd=1003 and p.reserved_tokens=0 and p.reserved_cost_microusd=0
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=old_month),'full_actual_over_reserve_debit');
  perform pg_temp.ai_budget_assert((select p.spent_tokens=before_spent and p.spent_cost_microusd=before_cost
    from private.ai_budget_pools p where p.organization_id=org_id and p.period=month_start),'late_charge_does_not_move_month');
  result:=public.ai_budget_claim_dispatch(owner_id,org_id,blocked_request);
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_BLOCKED','old_deficit_blocks_new_dispatch');
  result:=public.ai_budget_reserve(owner_id,org_id,first_request||jsonb_build_object('operationId',gen_random_uuid(),'attemptId',gen_random_uuid()));
  perform pg_temp.ai_budget_assert(result->>'code'='AI_BUDGET_BLOCKED','old_deficit_blocks_new_reserve');
  reconciliation:=late_request||jsonb_build_object('usage',jsonb_build_object('inputTokens','1001','outputTokens','1'),
    'reconciliationId',gen_random_uuid(),'operatorId',owner_id,'evidenceSha256',repeat('e',64));
  result:=public.ai_budget_reconcile(owner_id,org_id,reconciliation);
  perform pg_temp.ai_budget_assert(result->'receipt'->>'poolBlocked'='true','operator_ack_does_not_erase_monthly_deficit');
  perform pg_temp.ai_budget_assert((select p.spent_tokens=1002 and p.spent_cost_microusd=1003 from private.ai_budget_pools p
    where p.organization_id=org_id and p.period=old_month),'old_deficit_ack_no_second_debit');
  perform public.ai_budget_release(owner_id,org_id,blocked_request);
  select count(*) into event_count from private.ai_budget_events e join private.ai_budget_attempts a on a.id=e.attempt_id where a.organization_id=org_id;
  perform pg_temp.ai_budget_assert(event_count>0,'bounded_fixture_recorded_events');
end;
$fixtures$;

-- This draft does NOT prove two-session races, crash/lease lifecycle, real
-- provider cost, retention/deletion, cutover or a native-SQL target admission.
-- Those require the separately reviewed protocol in docs/operations/AI_BUDGETS.md.
rollback;
