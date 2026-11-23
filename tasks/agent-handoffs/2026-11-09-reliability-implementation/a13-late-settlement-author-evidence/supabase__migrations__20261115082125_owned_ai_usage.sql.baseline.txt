-- Shared usage/source closure. SOURCE ONLY; SQL UNPARSED/UNEXECUTED.
-- Existing counters/profiles/policies remain frozen. No data grant or activation.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create function private.owned_ai_usage_owner(p_user_id uuid,p_analysis_id uuid) returns public.analyses
language plpgsql volatile set search_path='' as $usage_owner$
declare a public.analyses%rowtype;v public.resume_versions%rowtype;
begin
  if p_user_id is null or p_analysis_id is null then perform private.ifo_fail('invalid');end if;
  select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id for share skip locked;
  if not found or private.try_candidate_privacy_write(a.owner_id) is not true then perform private.ifo_fail('not_found');end if;
  perform 1 from public.memberships where organization_id=a.organization_id and user_id=p_user_id
    and role in ('owner','admin','member') for share skip locked;
  if not found then perform private.ifo_fail('not_found');end if;
  select * into v from public.resume_versions where id=a.resume_version_id and owner_id=p_user_id and organization_id=a.organization_id for share skip locked;
  if not found then perform private.ifo_fail('not_found');end if;
  perform 1 from public.resumes where id=v.resume_id and owner_id=p_user_id and organization_id=a.organization_id and status='active' for share skip locked;
  if not found then perform private.ifo_fail('not_found');end if;
  if a.job_id is not null then
    perform 1 from public.jobs where id=a.job_id and owner_id=p_user_id and organization_id=a.organization_id for share skip locked;
    if not found then perform private.ifo_fail('not_found');end if;
  end if;
  -- Authorization for technical organization usage only. No scored-evidence
  -- admission or candidate qualification is inferred (A12 and no-JD A13 both use it).
  return a;
end;
$usage_owner$;

create function public.read_initial_feedback_usage(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $owned_usage$
declare a public.analyses%rowtype;period_start date;period_end date;
  legacy_tokens numeric;canonical_tokens numeric;feedback_tokens numeric;unknown_claims bigint;
  values_valid boolean;links_valid boolean;total_tokens numeric;
begin
  if private.initial_feedback_ready() is not true then perform private.ifo_fail('unavailable');end if;
  a:=private.owned_ai_usage_owner(p_user_id,p_analysis_id);
  period_start:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
  period_end:=(period_start+interval '1 month')::date;
  -- One statement snapshot; link validation/exclusion has NO month predicate.
  -- Only the three disjoint components below select their respective month.
  with canonical_scope as materialized (
    select x.owner_id,x.organization_id,x.analysis_id,x.operation_id,x.run_id,x.claimed_at,nullif(x.usage,'null'::jsonb) usage,
      x.binding_sha256,x.policy->>'model' model,x.policy->>'promptVersion' prompt_version
    from private.canonical_rewrite_operations x where x.organization_id=a.organization_id
    union
    select x.owner_id,x.organization_id,x.analysis_id,x.operation_id,x.run_id,x.claimed_at,nullif(x.usage,'null'::jsonb),
      x.binding_sha256,x.policy->>'model',x.policy->>'promptVersion'
    from private.canonical_rewrite_operations x join public.analysis_ai_runs r on r.id=x.run_id where r.organization_id=a.organization_id
  ), feedback_attempts as materialized (
    select t.attempt_id,t.operation_id,t.claimed_at,nullif(t.usage,'null'::jsonb) usage,o.owner_id,o.organization_id,o.analysis_id,
      o.binding_sha256,o.binding->'policy'->>'model' model,o.binding->'policy'->>'promptVersion' prompt_version
    from private.initial_feedback_attempts t join private.initial_feedback_operations o on o.operation_id=t.operation_id
    where o.organization_id=a.organization_id
  ), publication_scope as materialized (
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p where p.organization_id=a.organization_id
    union
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p join private.initial_feedback_operations o on o.operation_id=p.operation_id where o.organization_id=a.organization_id
    union
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p join public.analysis_ai_runs r on r.id=p.run_id where r.organization_id=a.organization_id
  ), links as materialized (
    -- Retained pre-compatibility A12 legacy runs are authoritative links too.
    select r.id run_id,coalesce(x.organization_id=a.organization_id and x.claimed_at is not null and isfinite(x.claimed_at)
      and x.usage is not null and private.ifo_usage_valid(x.usage)
      and (r.owner_id,r.organization_id,r.analysis_id)=(x.owner_id,x.organization_id,x.analysis_id)
      and r.provider='openai' and r.model_id=x.model and r.prompt_version=x.prompt_version and r.input_hash=x.binding_sha256
      and r.input_tokens>=0 and r.output_tokens>=0
      and r.input_tokens::text=x.usage->>'inputTokens' and r.output_tokens::text=x.usage->>'outputTokens',false) valid
    from canonical_scope x join public.analysis_ai_runs r on r.id=x.run_id
    union all
    select p.run_id,coalesce(p.organization_id=a.organization_id and p.state='assessed'
      and o.operation_id=p.operation_id and o.publication_id=p.id and o.state='published'
      and t.attempt_id=p.attempt_id and t.operation_id=o.operation_id
      and (p.owner_id,p.organization_id,p.analysis_id)=(o.owner_id,o.organization_id,o.analysis_id)
      and p.binding_sha256=o.binding_sha256 and t.claimed_at is not null and isfinite(t.claimed_at)
      and nullif(t.usage,'null'::jsonb) is not null and private.ifo_usage_valid(t.usage)
      and (r.owner_id,r.organization_id,r.analysis_id)=(p.owner_id,p.organization_id,p.analysis_id)
      and r.provider='openai' and r.model_id=o.binding->'policy'->>'model' and r.prompt_version=o.binding->'policy'->>'promptVersion'
      and r.input_hash=o.binding_sha256 and r.input_tokens>=0 and r.output_tokens>=0
      and r.input_tokens::text=t.usage->>'inputTokens' and r.output_tokens::text=t.usage->>'outputTokens',false)
    from publication_scope p left join private.initial_feedback_operations o on o.operation_id=p.operation_id
      left join private.initial_feedback_attempts t on t.attempt_id=p.attempt_id
      left join public.analysis_ai_runs r on r.id=p.run_id where p.run_id is not null
  ), integrity as (
    select not exists(select 1 from links where not valid)
      and not exists(select 1 from links group by run_id having count(*)>1)
      and not exists(select 1 from private.initial_feedback_operations o where o.organization_id=a.organization_id and o.publication_id is not null
        and not exists(select 1 from private.initial_feedback_publications p where p.id=o.publication_id and p.operation_id=o.operation_id
          and p.owner_id=o.owner_id and p.organization_id=o.organization_id and p.analysis_id=o.analysis_id)) valid
  ), legacy as (
    select coalesce(sum(case when r.input_tokens>=0 and r.output_tokens>=0 then r.input_tokens::numeric+r.output_tokens::numeric else 0 end),0) tokens,
      coalesce(bool_and(coalesce(r.input_tokens>=0 and r.output_tokens>=0,false)),true) valid
    from public.analysis_ai_runs r where r.organization_id=a.organization_id
      and r.created_at>=period_start::timestamp at time zone 'UTC' and r.created_at<period_end::timestamp at time zone 'UTC'
      and not exists(select 1 from links l where l.run_id=r.id)
  ), canonical as (
    select coalesce(sum(case when x.usage is not null and private.ifo_usage_valid(x.usage) then
      (x.usage->>'inputTokens')::numeric+(x.usage->>'outputTokens')::numeric else 0 end),0) tokens,
      count(*) filter(where x.usage is null) unknown_count,
      coalesce(bool_and(private.ifo_usage_valid(x.usage)),true) valid
    from canonical_scope x where x.organization_id=a.organization_id
      and x.claimed_at>=period_start::timestamp at time zone 'UTC' and x.claimed_at<period_end::timestamp at time zone 'UTC'
  ), feedback as (
    select coalesce(sum(case when x.usage is not null and private.ifo_usage_valid(x.usage) then
      (x.usage->>'inputTokens')::numeric+(x.usage->>'outputTokens')::numeric else 0 end),0) tokens,
      count(*) filter(where x.usage is null) unknown_count,
      coalesce(bool_and(private.ifo_usage_valid(x.usage)),true) valid
    from feedback_attempts x where x.claimed_at>=period_start::timestamp at time zone 'UTC'
      and x.claimed_at<period_end::timestamp at time zone 'UTC'
  ) select legacy.tokens,canonical.tokens,feedback.tokens,canonical.unknown_count+feedback.unknown_count,
      legacy.valid and canonical.valid and feedback.valid,integrity.valid
    into legacy_tokens,canonical_tokens,feedback_tokens,unknown_claims,values_valid,links_valid
    from legacy cross join canonical cross join feedback cross join integrity;
  if values_valid is not true or links_valid is not true or legacy_tokens is null or canonical_tokens is null or feedback_tokens is null
    then perform private.ifo_fail('unavailable');end if;
  total_tokens:=legacy_tokens+canonical_tokens+feedback_tokens;
  if greatest(length(legacy_tokens::text),length(canonical_tokens::text),length(feedback_tokens::text),length(total_tokens::text))>128
    then perform private.ifo_fail('unavailable');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-usage/1.0.0','profileVersion','initial-feedback-readiness-profile/1.0.0',
    'usageSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)')),
    'ownerId',p_user_id,'organizationId',a.organization_id,'analysisId',a.id,'periodStart',to_char(period_start,'YYYY-MM-DD'),'periodEnd',to_char(period_end,'YYYY-MM-DD'),
    'legacyUnlinkedTokens',legacy_tokens::text,'canonicalTokens',canonical_tokens::text,'initialFeedbackTokens',feedback_tokens::text,
    'totalTokens',total_tokens::text,'unknownClaims',unknown_claims::text);
end;
$owned_usage$;
revoke all on function private.owned_ai_usage_owner(uuid,uuid),public.read_initial_feedback_usage(uuid,uuid) from public,anon,authenticated,service_role;
-- FULL INITIAL FEEDBACK CLOSURE (all referenced bodies actually exist).
-- This completes source identity binding, not Native execution/adoption proof.
create function public.read_initial_feedback_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $shared_usage_metadata$
begin
  return jsonb_build_object('schemaVersion','initial-feedback-readiness/1.0.0','profileVersion','initial-feedback-readiness-profile/1.0.0',
    'schemaReady',private.initial_feedback_ready(),
    'readerExecutable',has_function_privilege('service_role',to_regprocedure('public.read_initial_feedback(uuid,uuid)'),'EXECUTE'),
    'prepareExecutable',has_function_privilege('service_role',to_regprocedure('public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)'),'EXECUTE'),
    'claimExecutable',has_function_privilege('service_role',to_regprocedure('public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)'),'EXECUTE'),
    'settleExecutable',has_function_privilege('service_role',to_regprocedure('public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)'),'EXECUTE'),
    'finishExecutable',has_function_privilege('service_role',to_regprocedure('public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)'),'EXECUTE'),
    'usageExecutable',has_function_privilege('service_role',to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)'),'EXECUTE'),
    'exportExecutable',has_function_privilege('service_role',to_regprocedure('public.export_initial_feedback_records(uuid)'),'EXECUTE'),
    'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_ready()')),
    'readerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback(uuid,uuid)')),
    'prepareSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)')),
    'claimSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)')),
    'settleSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)')),
    'finishSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)')),
    'usageSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)')),
    'exportSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.export_initial_feedback_records(uuid)')),
    'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_readiness()')));
end;
$shared_usage_metadata$;
create function private.initial_feedback_ready() returns boolean
language plpgsql stable set search_path='' as $shared_usage_ready$
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;
 manifest jsonb:=$shared_usage_catalog$[{"signature":"private.initial_feedback_publication_ready()","sha256":"e3b968b748f2e67983a034885c920510566bb71c69fc3d7bc0204b7d22b005d4","resultType":"boolean","language":"plpgsql","definer":false,"strict":false,"volatility":"s","acl":"private"},{"signature":"public.read_initial_feedback(uuid,uuid)","sha256":"57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)","sha256":"966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"public.export_initial_feedback_records(uuid)","sha256":"eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"private.initial_feedback_operation_ready()","sha256":"a88195b8cc89503549d43a9fe23f649bd9b4d9abecdad8461974f3ed9c7e1b9d","resultType":"boolean","language":"plpgsql","definer":false,"strict":false,"volatility":"s","acl":"private"},{"signature":"public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)","sha256":"93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)","sha256":"739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)","sha256":"335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"private.ifo_usage_valid(jsonb)","sha256":"eaad99f9a4064320c648f12452b1f9a4007d872431c21e98a7eded66b4e9018c","resultType":"boolean","language":"plpgsql","definer":false,"strict":false,"volatility":"i","acl":"private"},{"signature":"private.owned_ai_usage_owner(uuid,uuid)","sha256":"6c8dc21f6ef2cca5778cbfac9808a570507873d2f1ff8ac14f21e7393e18aa16","resultType":"public.analyses","language":"plpgsql","definer":false,"strict":false,"volatility":"v","acl":"private"},{"signature":"public.read_initial_feedback_usage(uuid,uuid)","sha256":"b242c0e264b0dfa5307f742a77e7a3cc0818bc9c18c88b946d9b27ee0a25889f","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"v","acl":"optional_service"},{"signature":"private.canonical_rewrite_ready()","sha256":"e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b","resultType":"boolean","language":"plpgsql","definer":false,"strict":false,"volatility":"s","acl":"private"},{"signature":"public.read_initial_feedback_readiness()","sha256":"2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6","resultType":"jsonb","language":"plpgsql","definer":true,"strict":false,"volatility":"s","acl":"metadata"}]$shared_usage_catalog$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if service_oid is null or owner_oid is null then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict is distinct from (item->>'strict')::boolean
    or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language')
    or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
    or p.proconfig is distinct from array['search_path=""'] or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee<>p.proowner
    and (item->>'acl'='private' or g.grantee<>service_oid or g.privilege_type<>'EXECUTE' or g.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl'='metadata' and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl'<>'private' and has_function_privilege('service_role',p.oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee=service_oid and g.privilege_type='EXECUTE' and not g.is_grantable) then return false;end if;
 end loop;
 if private.initial_feedback_publication_ready() is not true or private.canonical_rewrite_ready() is not true then return false;end if;
 -- Exact function/table source closures are diagnostic: inherited CHECK/default,
 -- retention/erasure, actual role/CAS/rollback and caller adoption remain open.
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_ready()');
 if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.prosecdef or p.proretset or p.proisstrict or p.provolatile<>'s'
   or p.prorettype<>'boolean'::regtype or p.proconfig is distinct from array['search_path=""']
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee<>p.proowner) then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
 return true;
exception when others then return false;
end;
$shared_usage_ready$;
revoke all on function private.initial_feedback_ready(),public.read_initial_feedback_readiness() from public,anon,authenticated,service_role;
grant execute on function public.read_initial_feedback_readiness() to service_role;
-- No data RPC grant, configured model/policy seed, commercial pricing or adoption.
commit;
