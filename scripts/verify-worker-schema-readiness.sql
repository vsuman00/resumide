-- DRAFT / NOT EXECUTED. Separately reviewed direct Supabase read-only native
-- metadata allocation only. No fixtures, seeds, worker, action RPC or row writes.
-- An operator setting is not authorization, isolation or a production launch gate.
begin transaction isolation level read committed read only;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
do $verify$
declare run_id text:=current_setting('resumide.readiness_test_run_id',true);
  reply jsonb; absent_policy text; p pg_catalog.pg_proc%rowtype;
begin
  if current_setting('resumide.readiness_test_admission',true) is distinct from 'managed-read-only-worker-schema/1'
    or coalesce(run_id,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    raise exception 'Worker readiness metadata allocation missing' using errcode='42501'; end if;
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure('public.worker_schema_readiness(boolean,boolean,text,text)');
  if not found or not p.prosecdef or p.provolatile<>'s' or p.prorettype<>'jsonb'::regtype
    or not has_function_privilege('service_role',p.oid,'EXECUTE')
    or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
    or not exists(select 1 from pg_options_to_table(p.proconfig) where option_name='search_path' and option_value in ('','""')) then
    raise exception 'Worker readiness RPC catalog mismatch' using errcode='23514'; end if;
  -- Empty selection performs no capability observation; legacy client skips RPC.
  reply:=public.worker_schema_readiness(false,false,null,null);
  if reply is distinct from '{"schemaVersion":"worker-schema-readiness/1.0.0","selected":{"fencing":false,"aiBudget":false},"ready":true,"failures":[]}'::jsonb then
    raise exception 'Worker readiness empty-selection mismatch' using errcode='23514'; end if;
  -- Invalid AI selection must fail before any technical policy lookup.
  reply:=public.worker_schema_readiness(false,true,null,null);
  if reply is distinct from '{"schemaVersion":"worker-schema-readiness/1.0.0","selected":{"fencing":false,"aiBudget":true},"ready":false,"failures":["INVALID_SELECTION"]}'::jsonb then
    raise exception 'Worker readiness invalid-selection mismatch' using errcode='23514'; end if;
  -- This positive requires the COMPLETE reviewed selected migration chain. No
  -- claim/recovery/heartbeat/stage-write routine is invoked by the probe.
  reply:=public.worker_schema_readiness(true,false,null,null);
  if reply is distinct from '{"schemaVersion":"worker-schema-readiness/1.0.0","selected":{"fencing":true,"aiBudget":false},"ready":true,"failures":[]}'::jsonb then
    raise exception 'Worker readiness fencing schema unavailable' using errcode='23514'; end if;
  absent_policy:='readiness-absent/'||run_id;
  if exists(select 1 from private.ai_budget_policies where version=absent_policy) then
    raise exception 'Worker readiness technical policy namespace collision' using errcode='42501'; end if;
  -- Negative technical config only. No policies/openings are created, no spend
  -- pool/attempt/user/job rows read, no producer/reservation/provider is called.
  reply:=public.worker_schema_readiness(false,true,'synthetic-readiness-model',absent_policy);
  if reply is distinct from '{"schemaVersion":"worker-schema-readiness/1.0.0","selected":{"fencing":false,"aiBudget":true},"ready":false,"failures":["AI_BUDGET_POLICY_UNAVAILABLE"]}'::jsonb then
    raise exception 'Worker readiness missing-policy mismatch' using errcode='23514'; end if;
end;
$verify$;
rollback;
-- A ready response is catalog/access/config readiness only. Actual configured
-- credentials, RPC execution, pool opening/cutover, lease transactions, privacy
-- races, isolation and release approval require their own admitted evidence.
