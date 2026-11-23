-- DEFERRED PRIVATE PURE RENDERER VERIFIER. UNPARSED/UNEXECUTED.
-- Privileged, mutating only transaction-local test structures, ROLLBACK ONLY.
-- Requires a separately admitted DIRECT managed synthetic target, exact new
-- migration/profile, frozen actual Node compiler/renderer sources and independent
-- meaning labels. Settings/expected JSON do not authorize execution or prove
-- ownership. NO candidate table read/write, queue, provider or real text here.
-- The future driver must privately record exact synthetic source/plan/expected
-- render bytes, actual producer/policy hashes and fixture hashes BEFORE native
-- execution. No expected render may be fabricated from a desired passing shape.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';

create function pg_temp.ifp_assert(p_value boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin
  if p_value is not true then raise exception 'INITIAL_FEEDBACK_NATIVE_ASSERTION: %',p_label using errcode='23514';end if;
end;
$$;

do $admission$
declare metadata jsonb;vectors jsonb:=nullif(current_setting('resumide.ifp_vectors',true),'')::jsonb;entry jsonb;role_name text;p record;
begin
  perform pg_temp.ifp_assert(current_setting('resumide.ifp_allocation',true)='private-content-renderer-rollback/1'
    and nullif(current_setting('resumide.ifp_node_source_manifest_sha256',true),'')~'^[a-f0-9]{64}$', 'separate_target_and_real_node_sources_required');
  metadata:=public.read_initial_feedback_plan_readiness();
  perform pg_temp.ifp_assert(metadata-'schemaReady'=$profile${"schemaVersion":"initial-feedback-plan-readiness/1.0.0","profileVersion":"initial-feedback-plan-profile/1.0.0","policyVersion":"initial-feedback-plan-policy/1.0.0","policySha256":"972b648ccc90b29c0c88fc504ac2746ab1489e17f05cfd2048cb487a2b38cc48","checkerSha256":"c5d8c0e8e5ac52c8b06a4fad5ea78f6fe6e42297bbbfd51cd2779243c8418b36","rendererSha256":"c8bc131aacc7f9ddd8e30dcca8f5f429e78ee84180e5dd4542254883001cedc6","metadataSha256":"3c133694d11334e9430821945c94782b562ab1efb3f26bb8d4e7a9f2699369c5"}$profile$::jsonb and metadata->'schemaReady'='true'::jsonb,'exact_native_profile');
  perform pg_temp.ifp_assert(jsonb_typeof(vectors)='array' and jsonb_array_length(vectors) between 1 and 32
    and octet_length(convert_to(vectors::text,'UTF8'))<=4194304,'bounded_actual_producer_vectors');
  for entry in select value from jsonb_array_elements(vectors) loop
    perform pg_temp.ifp_assert(private.ifp_keys(entry,array['label','source','plan','expected']) is true
      and jsonb_typeof(entry->'label')='string' and entry->>'label'~'^[A-Za-z0-9_-]{1,64}$'
      and jsonb_typeof(entry->'source')='string' and jsonb_typeof(entry->'plan')='object'
      and entry->'expected'->>'authority'='source_content_only' and entry->'expected'->>'ownedVersionProof'='not_provided', 'real_compiler_vector_shape');
  end loop;
  -- Inspect actual ACLs; do not grant helpers merely to make the test pass.
  for p in select oid from pg_catalog.pg_proc where pronamespace='private'::regnamespace
    and (proname like 'ifp_%' or proname in ('render_initial_feedback_plan','initial_feedback_plan_ready')) loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      perform pg_temp.ifp_assert(not has_function_privilege(role_name,p.oid,'EXECUTE'),'private_execution_denied');
    end loop;
  end loop;
end;
$admission$;

create temporary table ifp_native_results(label text primary key,actual jsonb not null) on commit drop;

do $positive_equivalence$
declare entry jsonb;actual jsonb;repeat_value jsonb;old_zone text:=current_setting('TimeZone');count_value integer:=0;
begin
  for entry in select value from jsonb_array_elements(current_setting('resumide.ifp_vectors')::jsonb) loop
    actual:=private.render_initial_feedback_plan(entry->>'source',entry->'plan');
    perform pg_temp.ifp_assert(actual=entry->'expected','actual_node_native_render_equivalence');
    perform pg_temp.ifp_assert(not (actual?'bindingSha256') and not (actual?'planSha256')
      and actual->>'authority'='source_content_only' and actual->>'ownedVersionProof'='not_provided','no_owned_or_jsonb_digest_claim');
    insert into pg_temp.ifp_native_results values(entry->>'label',actual);
    perform set_config('TimeZone','Pacific/Honolulu',true);
    repeat_value:=private.render_initial_feedback_plan(entry->>'source',entry->'plan');
    perform pg_temp.ifp_assert(repeat_value=actual,'pure_repeat_and_timezone_stability');
    perform set_config('TimeZone',old_zone,true);count_value:=count_value+1;
  end loop;
  perform pg_temp.ifp_assert(count_value=(select count(*) from pg_temp.ifp_native_results),'complete_vector_collection');
end;
$positive_equivalence$;

-- A concrete closed-plan positive is required before each tamper: select the
-- first actual producer vector with a retained tip and use only its real spans.
do $negative_tampers$
declare entry jsonb;plan_value jsonb;bad jsonb;category text;tip jsonb;failed boolean;mode text;state_value text;
begin
  for entry in select value from jsonb_array_elements(current_setting('resumide.ifp_vectors')::jsonb) loop
    plan_value:=entry->'plan';
    foreach category in array array['toneAndStyle','content','structure','skills'] loop
      if jsonb_array_length(plan_value->category)>0 then exit;end if;
    end loop;
    if jsonb_array_length(plan_value->category)>0 then exit;end if;
  end loop;
  perform pg_temp.ifp_assert(jsonb_array_length(plan_value->category)>0,'actual_retained_tip_positive_required');
  foreach mode in array array['unknown_authority','wrong_source_hash','wrong_span_hash','duplicate_original_index','unsupported_operator','unknown_question','overflow_source'] loop
    bad:=plan_value;
    case mode
      when 'unknown_authority' then bad:=bad||jsonb_build_object('supported',true);
      when 'wrong_source_hash' then bad:=bad||jsonb_build_object('sourceTextSha256',repeat('0',64));
      when 'wrong_span_hash' then bad:=jsonb_set(bad,array[category,'0','quote','textSha256'],to_jsonb(repeat('0',64)));
      when 'duplicate_original_index' then bad:=jsonb_set(bad,array[category],jsonb_build_array(bad->category->0,bad->category->0));
      when 'unsupported_operator' then bad:=jsonb_set(bad,array[category,'0','title'],jsonb_build_object('kind','invent_metric','value',9000));
      when 'unknown_question' then bad:=jsonb_set(bad,array[category,'0','title'],jsonb_build_object('kind','clarification_question','topic','invented_outcome','form','what_verify'));
      when 'overflow_source' then bad:=bad||jsonb_build_object('sourceTextSha256',private.ifp_sha(repeat('x',100001)));
      else raise exception 'UNKNOWN_DEFERRED_TAMPER';
    end case;
    failed:=false;
    begin
      perform private.render_initial_feedback_plan(case when mode='overflow_source' then repeat('x',100001) else entry->>'source' end,bad);
    exception when sqlstate '22023' or sqlstate 'P0C03' then failed:=true;end;
    perform pg_temp.ifp_assert(failed,'tampered_plan_refused');
  end loop;
end;
$negative_tampers$;
set constraints all immediate;
rollback;
-- Required future driver vectors include all actual operator families, astral
-- prefix + exact CP/U16 IDs, NFC/ligatures/SHY and opaque contexts, reordered
-- clauses with metric/actor/polarity/scope/direction/dependency negatives,
-- qualified/quoted/team source boundaries, explicit-role uniqueness/adjacency,
-- title AND explanation, min3-padding maps, and aggregate limit boundaries.
-- This draft has not executed any vector and does not claim Node/native parity,
-- query performance, role runtime behavior, owned-source admission, publication,
-- provider usefulness, worker/consumer adoption, privacy or release acceptance.
