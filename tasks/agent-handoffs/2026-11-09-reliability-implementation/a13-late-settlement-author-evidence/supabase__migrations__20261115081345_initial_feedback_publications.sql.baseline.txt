-- A13 owned initial publication SOURCE ONLY. UNPARSED/UNEXECUTED.
-- Full usage/readiness, account erasure/technical retention, grants and caller
-- adoption remain explicitly held. No seeds, scores, flags or old source change.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

do $ifpub_pre$
begin
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_operation_ready()'))
    is distinct from '7f5b37d5bb4f46acc5aa3926d2fbf9da83b8d9dc7687f86ed086a2571f1be0ca'
    or private.initial_feedback_operation_ready() is not true then
    raise exception 'INITIAL_FEEDBACK_PUBLICATION_PREIMAGE_DRIFT' using errcode='23514';end if;
  if has_function_privilege('service_role','public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)','EXECUTE') then
    raise exception 'INITIAL_FEEDBACK_PUBLICATION_ALREADY_ACTIVATED' using errcode='23514';end if;
end;
$ifpub_pre$;

create table private.initial_feedback_publications (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 operation_id uuid not null unique references private.initial_feedback_operations(operation_id) on delete restrict,
 attempt_id uuid unique references private.initial_feedback_attempts(attempt_id) on delete restrict,
 analysis_id uuid not null unique references public.analyses(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 resume_id uuid not null references public.resumes(id) on delete cascade,
 resume_version_id uuid not null references public.resume_versions(id) on delete cascade,
 run_id uuid unique references public.analysis_ai_runs(id) on delete cascade,
 state text not null check(state in ('assessed','deterministic_only')),
 reason text,
 binding_sha256 text not null check(binding_sha256 ~ '^[a-f0-9]{64}$'),
 completion jsonb not null check(jsonb_typeof(completion)='object' and octet_length(convert_to(completion::text,'UTF8'))<=1048576),
 completion_sha256 text not null check(completion_sha256=private.ifo_sha(completion::text)),
 publication_core jsonb not null check(jsonb_typeof(publication_core)='object' and not(publication_core?'receipt') and octet_length(convert_to(publication_core::text,'UTF8'))<=8388608),
 publication_sha256 text not null check(publication_sha256=private.ifo_sha(publication_core::text)),
 receipt jsonb not null check(jsonb_typeof(receipt)='object'),
 render jsonb check(render is null or (jsonb_typeof(render)='object' and octet_length(convert_to(render::text,'UTF8'))<=1048576)),
 plan_sha256 text,
 render_sha256 text,
 support_sha256 text,
 capture_sha256 text,
 result_content_sha256 text not null check(result_content_sha256 ~ '^[a-f0-9]{64}$'),
 writer_content_sha256 text not null check(writer_content_sha256 ~ '^[a-f0-9]{64}$'),
 run_content_sha256 text,
 finish_lease jsonb not null check(private.legacy_scoring_lease(finish_lease) is true),
 process_id text not null check(process_id ~ '^[ -~]{1,128}$'),
 request_id text not null check(request_id ~ '^[ -~]{1,128}$'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(analysis_id) references private.analysis_scoring_inputs(analysis_id) on delete cascade,
 check((state='assessed' and attempt_id is not null and run_id is not null and reason is null and render is not null
   and plan_sha256 is not null and render_sha256 is not null and support_sha256 is not null and capture_sha256 is not null and run_content_sha256 is not null)
  or (state='deterministic_only' and run_id is null and reason is not null and render is null and plan_sha256 is null
   and render_sha256 is null and support_sha256 is null and run_content_sha256 is null))
);
alter table private.initial_feedback_publications enable row level security;
revoke all on private.initial_feedback_publications from public,anon,authenticated,service_role;
-- Candidate rows cascade. Technical operation/attempt RESTRICT references and
-- their erasure/unlink/retention policy remain a mandatory NO-ADOPTION hold.

create function private.initial_feedback_publication_ready() returns boolean
language plpgsql stable set search_path='' as $ifpub_ready$
declare rel pg_catalog.pg_class%rowtype;role_name text;
begin
  -- Diagnostic source closure only. CHECK/default expressions, role execution,
  -- shared usage and account-retention adoption are NOT certified here.
  if private.initial_feedback_operation_ready() is not true then return false;end if;
  select * into rel from pg_catalog.pg_class where oid=to_regclass('private.initial_feedback_publications');
  if not found or rel.relkind<>'r' or not rel.relrowsecurity then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;
  end loop;
  if exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a cross join lateral aclexplode(a.attacl) g
      where a.attrelid=rel.oid and a.attnum>0 and g.grantee<>rel.relowner) then return false;end if;
  return true;
exception when others then return false;
end;
$ifpub_ready$;

create function public.read_initial_feedback_publication_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $ifpub_metadata$
begin
  return jsonb_build_object('schemaVersion','initial-feedback-publication-readiness/1.0.0','profileVersion','initial-feedback-publication-profile/1.0.0',
    'schemaReady',private.initial_feedback_publication_ready(),
    'readerExecutable',has_function_privilege('service_role',to_regprocedure('public.read_initial_feedback(uuid,uuid)'),'EXECUTE'),
    'finishExecutable',has_function_privilege('service_role',to_regprocedure('public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)'),'EXECUTE'),
    'exportExecutable',has_function_privilege('service_role',to_regprocedure('public.export_initial_feedback_records(uuid)'),'EXECUTE'),
    'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_publication_ready()')),
    'readerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback(uuid,uuid)')),
    'finishSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)')),
    'exportSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.export_initial_feedback_records(uuid)')),
    'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_publication_readiness()')));
end;
$ifpub_metadata$;

-- Strict frozen Node capture shape. Its rejected decisions remain recorded
-- observations; only retained rendered parts are independently reconstructed.
create function private.ifpub_capture_valid(p_capture jsonb,p_source_sha text) returns boolean
language plpgsql immutable set search_path='' as $ifpub_capture$
declare item jsonb;
begin
 if p_capture is null or p_capture='null'::jsonb then return true;end if;
 if octet_length(convert_to(p_capture::text,'UTF8'))>262144
  or extensions.jsonb_matches_schema($capture_schema${"type":"object","properties":{"schemaVersion":{"type":"string","const":"qualitative-support/1.0.0"},"authority":{"type":"string","const":"source_content_only"},"ownedVersionProof":{"type":"string","const":"not_provided"},"status":{"type":"string","enum":["assessed","unavailable"]},"reason":{"anyOf":[{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},{"type":"null"}]},"binding":{"anyOf":[{"type":"object","properties":{"sourceSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"policyVersion":{"type":"string","const":"qualitative-content-support/1.0.0"},"policySha256":{"type":"string","const":"230f22333dd468f3bf78395b118330ec1ff78de18be9da5349356e84d0f6bd13"},"writingSupportPolicyVersion":{"type":"string","const":"legacy-source-transforms/1.0.4"}},"required":["sourceSha256","policyVersion","policySha256","writingSupportPolicyVersion"],"additionalProperties":false},{"type":"null"}]},"items":{"maxItems":16,"type":"array","items":{"type":"object","properties":{"category":{"type":"string","enum":["toneAndStyle","content","structure","skills"]},"index":{"type":"integer","minimum":0,"maximum":3},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"retained":{"type":"boolean"},"type":{"type":"string","enum":["good","improve"]},"citation":{"anyOf":[{"type":"object","properties":{"quoteSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"offsetUnit":{"type":"string","const":"unicode_code_point"},"start":{"type":"integer","minimum":0,"maximum":100000},"end":{"type":"integer","minimum":1,"maximum":100000},"anchorIds":{"minItems":1,"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}}},"required":["quoteSha256","offsetUnit","start","end","anchorIds"],"additionalProperties":false},{"type":"null"}]},"title":{"type":"object","properties":{"textSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"anchorIds":{"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"operations":{"maxItems":34,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["copy_source","normalize_layout","replace_equivalent_action","reorder_independent_clauses","compose_explicit_role_contribution","editorial_explanation"]},"anchorId":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["kind","anchorId"],"additionalProperties":false}}},"required":["textSha256","kind","state","reason","anchorIds","operations"],"additionalProperties":false},"explanation":{"type":"object","properties":{"textSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"anchorIds":{"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"operations":{"maxItems":34,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["copy_source","normalize_layout","replace_equivalent_action","reorder_independent_clauses","compose_explicit_role_contribution","editorial_explanation"]},"anchorId":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["kind","anchorId"],"additionalProperties":false}}},"required":["textSha256","kind","state","reason","anchorIds","operations"],"additionalProperties":false}},"required":["category","index","kind","state","reason","retained","type","citation","title","explanation"],"additionalProperties":false}},"writer":{"type":"object","properties":{"summary":{"anyOf":[{"type":"object","properties":{"textSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"anchorIds":{"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"operations":{"maxItems":34,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["copy_source","normalize_layout","replace_equivalent_action","reorder_independent_clauses","compose_explicit_role_contribution","editorial_explanation"]},"anchorId":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["kind","anchorId"],"additionalProperties":false}}},"required":["textSha256","kind","state","reason","anchorIds","operations"],"additionalProperties":false},{"type":"null"}]},"bullets":{"maxItems":4,"type":"array","items":{"type":"object","properties":{"index":{"type":"integer","minimum":0,"maximum":3},"retained":{"type":"boolean"},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"rewrite":{"type":"object","properties":{"textSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"anchorIds":{"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"operations":{"maxItems":34,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["copy_source","normalize_layout","replace_equivalent_action","reorder_independent_clauses","compose_explicit_role_contribution","editorial_explanation"]},"anchorId":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["kind","anchorId"],"additionalProperties":false}}},"required":["textSha256","kind","state","reason","anchorIds","operations"],"additionalProperties":false},"reasoning":{"type":"object","properties":{"textSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"kind":{"type":"string","enum":["source_claim","editorial_observation","clarification_question"]},"state":{"type":"string","enum":["supported","clarification_required","rejected"]},"reason":{"type":"string","enum":["source_transformation","editorial_template","clarification_template","question_only","unsupported_assertion","quote_missing","quote_ambiguous","binding_mismatch","invalid_input","source_resource_limit","qualified_source","missing_source_anchor"]},"anchorIds":{"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"operations":{"maxItems":34,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["copy_source","normalize_layout","replace_equivalent_action","reorder_independent_clauses","compose_explicit_role_contribution","editorial_explanation"]},"anchorId":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["kind","anchorId"],"additionalProperties":false}}},"required":["textSha256","kind","state","reason","anchorIds","operations"],"additionalProperties":false}},"required":["index","retained","state","reason","rewrite","reasoning"],"additionalProperties":false}}},"required":["summary","bullets"],"additionalProperties":false}},"required":["schemaVersion","authority","ownedVersionProof","status","reason","binding","items","writer"],"additionalProperties":false}$capture_schema$::json,p_capture) is not true then return false;end if;
 if p_capture->'binding'<>'null'::jsonb and p_capture->'binding'->>'sourceSha256' is distinct from p_source_sha then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_capture->'items') x group by x->>'category',x->>'index' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_capture->'writer'->'bullets') x group by x->>'index' having count(*)>1) then return false;end if;
 for item in select value from jsonb_array_elements(p_capture->'items') loop
  if item->'citation'<>'null'::jsonb and (item->'citation'->>'end')::integer<=(item->'citation'->>'start')::integer then return false;end if;
 end loop;return true;
exception when others then return false;
end;
$ifpub_capture$;

create function private.ifpub_part_matches(p_part jsonb,p_observed jsonb,p_document jsonb) returns boolean
language plpgsql stable set search_path='' as $ifpub_part$
declare ids jsonb:='[]';ref jsonb;anchor jsonb;
begin
 if p_part is null or p_observed is null then return false;end if;
 if p_part->'textSha256' is distinct from p_observed->'textSha256' or p_part->'kind' is distinct from p_observed->'kind'
  or p_part->'state' is distinct from p_observed->'state' or p_part->'reason' is distinct from p_observed->'reason' then return false;end if;
 for ref in select value from jsonb_array_elements(p_part->'sourceRefs') loop
  select value into anchor from jsonb_array_elements(p_document->'anchors') where value->'ref'=ref;
  if not found then return false;end if;ids:=ids||jsonb_build_array(anchor->>'id');
 end loop;
 return jsonb_array_length(ids)>0 and ids=p_observed->'anchorIds';
exception when others then return false;
end;
$ifpub_part$;

create function private.ifpub_correspondence(p_source text,p_plan jsonb,p_capture jsonb,p_render jsonb) returns void
language plpgsql stable set search_path='' as $ifpub_correspondence$
declare doc jsonb;category text;expected jsonb;observed jsonb;part jsonb;planned jsonb;ids jsonb;summary jsonb;observed_summary jsonb;
begin
 if private.ifpub_capture_valid(p_capture,private.ifo_sha(p_source)) is not true or p_capture->>'status' is distinct from 'assessed'
  or p_capture->'binding'->>'sourceSha256' is distinct from private.ifo_sha(p_source) then perform private.ifo_fail('invalid');end if;
 -- Bounded extra document construction supplies actual legacy UTF16-ID anchors
 -- for capture correlation; it does not assess raw rejected prose or trust IDs.
 doc:=private.ifp_document(p_source);
 foreach category in array array['toneAndStyle','content','structure','skills'] loop
  select coalesce(jsonb_agg(value->'originalIndex' order by ord),'[]') into expected from jsonb_array_elements(p_plan->category) with ordinality x(value,ord);
  select coalesce(jsonb_agg(value->'index' order by ord),'[]') into observed from jsonb_array_elements(p_capture->'items') with ordinality x(value,ord)
   where value->>'category'=category and value->'retained'='true'::jsonb;
  if expected is distinct from observed then perform private.ifo_fail('invalid');end if;
 end loop;
 for part in select value from jsonb_array_elements(p_render->'parts'->'tips') loop
  select value into observed from jsonb_array_elements(p_capture->'items') where value->'category'=part->'category'
   and value->'index'=part->'originalIndex' and value->'retained'='true'::jsonb;
  if not found or observed->'kind' is distinct from part->'kind' or observed->'state' is distinct from part->'state'
   or observed->'reason' is distinct from part->'reason' or observed->'type' is distinct from part->'type'
   or observed->'citation'->'start' is distinct from part->'quote'->'start' or observed->'citation'->'end' is distinct from part->'quote'->'end'
   or observed->'citation'->'quoteSha256' is distinct from part->'quote'->'textSha256'
   or private.ifpub_part_matches(part->'title',observed->'title',doc) is not true
   or private.ifpub_part_matches(part->'explanation',observed->'explanation',doc) is not true then perform private.ifo_fail('invalid');end if;
  select coalesce(jsonb_agg(value->'id' order by ord),'[]') into ids from jsonb_array_elements(doc->'anchors') with ordinality x(value,ord)
   where (value->>'start')::integer<(part->'quote'->>'end')::integer and (value->>'end')::integer>(part->'quote'->>'start')::integer;
  if ids is distinct from observed->'citation'->'anchorIds' then perform private.ifo_fail('invalid');end if;
 end loop;
 select coalesce(jsonb_agg(value->'originalIndex' order by ord),'[]') into expected from jsonb_array_elements(p_plan->'writer'->'bullets') with ordinality x(value,ord);
 select coalesce(jsonb_agg(value->'index' order by ord),'[]') into observed from jsonb_array_elements(p_capture->'writer'->'bullets') with ordinality x(value,ord) where value->'retained'='true'::jsonb;
 if expected is distinct from observed then perform private.ifo_fail('invalid');end if;
 for part in select value from jsonb_array_elements(p_render->'parts'->'writer'->'bullets') loop
  select value into observed from jsonb_array_elements(p_capture->'writer'->'bullets') where value->'index'=part->'originalIndex' and value->'retained'='true'::jsonb;
  if not found or observed->>'state' is distinct from 'supported'
   or private.ifpub_part_matches(part->'rewrite',observed->'rewrite',doc) is not true
   or private.ifpub_part_matches(part->'reasoning',observed->'reasoning',doc) is not true then perform private.ifo_fail('invalid');end if;
 end loop;
 summary:=p_render->'parts'->'writer'->'summary';observed_summary:=p_capture->'writer'->'summary';
 if (summary<>'null'::jsonb) is distinct from coalesce(observed_summary->>'state'='supported',false) then perform private.ifo_fail('invalid');end if;
 if summary<>'null'::jsonb and private.ifpub_part_matches(summary,observed_summary,doc) is not true then perform private.ifo_fail('invalid');end if;
end;
$ifpub_correspondence$;

create function private.ifpub_feedback(p_result jsonb,p_render jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifpub_feedback$
declare feedback jsonb;ats jsonb;category text;unavailable jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('type',case when (value->>'passed')::boolean then 'good' else 'improve' end,'tip',value->>'detail') order by ord),'[]')
  into ats from jsonb_array_elements(p_result->'ruleTrace') with ordinality x(value,ord) where ord<=4;
 feedback:=jsonb_build_object('scoreSemantics','deterministic_baseline_no_model_ratings/1.0.0','overallScore',p_result->'score',
  'ATS',jsonb_build_object('score',p_result->'score','tips',ats));
 unavailable:=jsonb_build_object('score',0,'tips',jsonb_build_array(
  jsonb_build_object('type','improve','tip','Qualitative feedback is currently unavailable.','explanation','Your saved deterministic checks remain available. Writing feedback was not completed.'),
  jsonb_build_object('type','improve','tip','Qualitative feedback is currently unavailable.','explanation','Your saved deterministic checks remain available. Writing feedback was not completed.'),
  jsonb_build_object('type','improve','tip','Qualitative feedback is currently unavailable.','explanation','Your saved deterministic checks remain available. Writing feedback was not completed.')));
 foreach category in array array['toneAndStyle','content','structure','skills'] loop
  feedback:=feedback||jsonb_build_object(category,case when p_render is null then unavailable else p_render->'compatibility'->category end);
 end loop;return feedback;
end;
$ifpub_feedback$;

create function private.ifpub_result_json(p_row public.analysis_results) returns jsonb
language sql stable set search_path='' as $ifpub_result$
 select to_jsonb(p_row)||jsonb_build_object('created_at',private.ifo_stamp(p_row.created_at),'updated_at',private.ifo_stamp(p_row.updated_at));
$ifpub_result$;
create function private.ifpub_writer_json(p_row public.writer_drafts) returns jsonb
language sql stable set search_path='' as $ifpub_writer$
 select to_jsonb(p_row)||jsonb_build_object('created_at',private.ifo_stamp(p_row.created_at),'updated_at',private.ifo_stamp(p_row.updated_at));
$ifpub_writer$;
create function private.ifpub_run_json(p_row public.analysis_ai_runs) returns jsonb
language sql stable set search_path='' as $ifpub_run$
 select to_jsonb(p_row)||jsonb_build_object('created_at',private.ifo_stamp(p_row.created_at),'completed_at',private.ifo_stamp(p_row.completed_at));
$ifpub_run$;

create function private.ifpub_json(p_publication private.initial_feedback_publications,p_replayed boolean) returns jsonb
language plpgsql volatile set search_path='' as $ifpub_json$
declare op private.initial_feedback_operations%rowtype;r public.analysis_results%rowtype;w public.writer_drafts%rowtype;run public.analysis_ai_runs%rowtype;
 original jsonb;a public.analyses%rowtype;core jsonb;receipt jsonb;
begin
 select * into op from private.initial_feedback_operations where operation_id=p_publication.operation_id for key share skip locked;
 if not found or op.state<>'published' or op.publication_id is distinct from p_publication.id or op.analysis_id<>p_publication.analysis_id
  or op.owner_id<>p_publication.owner_id or op.organization_id<>p_publication.organization_id or op.resume_id<>p_publication.resume_id
  or op.resume_version_id<>p_publication.resume_version_id or op.binding_sha256<>p_publication.binding_sha256 then perform private.ifo_fail('unavailable');end if;
 select * into r from public.analysis_results where analysis_id=op.analysis_id and owner_id=op.owner_id and organization_id=op.organization_id for share skip locked;
 if not found or private.ifo_sha(private.ifpub_result_json(r)::text)<>p_publication.result_content_sha256 then perform private.ifo_fail('unavailable');end if;
 select * into w from public.writer_drafts where analysis_id=op.analysis_id and owner_id=op.owner_id and organization_id=op.organization_id and kind='summary' for share skip locked;
 if not found or private.ifo_sha(private.ifpub_writer_json(w)::text)<>p_publication.writer_content_sha256 then perform private.ifo_fail('unavailable');end if;
 core:=p_publication.publication_core;receipt:=p_publication.receipt;
 if private.ifo_sha(core::text)<>p_publication.publication_sha256 or private.ifo_sha(p_publication.completion::text)<>p_publication.completion_sha256
  or core->'binding' is distinct from op.binding or core->>'publicationId' is distinct from p_publication.id::text
  or core->>'state' is distinct from p_publication.state or core->>'reason' is distinct from p_publication.reason
  or core->'compatibility'->'feedback' is distinct from r.feedback
  or core->'plan' is distinct from p_publication.completion->'plan'
  or core->'recordedObservation' is distinct from p_publication.completion->'observation'
  or core->'generationFailure' is distinct from p_publication.completion->'generationFailure'
  or receipt->>'publicationSha256' is distinct from p_publication.publication_sha256
  or receipt->>'resultSha256' is distinct from p_publication.result_content_sha256
  or receipt->>'bindingSha256' is distinct from op.binding_sha256 or receipt->>'operationId' is distinct from op.operation_id::text
  or receipt->>'publicationId' is distinct from p_publication.id::text or receipt->>'analysisId' is distinct from op.analysis_id::text
  or receipt->>'ownerId' is distinct from op.owner_id::text or receipt->>'attemptId' is distinct from p_publication.attempt_id::text
  or receipt->>'runId' is distinct from p_publication.run_id::text or receipt->>'createdAt' is distinct from private.ifo_stamp(p_publication.created_at)
  or (case when core->'recordedObservation'='null'::jsonb then null else private.ifo_sha((core->'recordedObservation')::text) end) is distinct from p_publication.capture_sha256
  then perform private.ifo_fail('unavailable');end if;
 if p_publication.state='assessed' then
  if private.ifo_sha((core->'plan')::text) is distinct from p_publication.plan_sha256
   or private.ifo_sha(p_publication.render::text) is distinct from p_publication.render_sha256
   or private.ifo_sha((core->'ownedSupport')::text) is distinct from p_publication.support_sha256
   or core->'prose' is distinct from p_publication.render->'prose'
   or core->'ownedSupport'->'parts' is distinct from p_publication.render->'parts'
   or core->'ownedSupport'->'mapping' is distinct from p_publication.render->'mapping'
   or core->'ownedSupport'->>'bindingSha256' is distinct from op.binding_sha256
   or core->'ownedSupport'->>'planSha256' is distinct from p_publication.plan_sha256
   or core->'compatibility'->'writer' is distinct from w.draft
   or receipt->>'writerSha256' is distinct from p_publication.writer_content_sha256 then perform private.ifo_fail('unavailable');end if;
  select * into run from public.analysis_ai_runs where id=p_publication.run_id and analysis_id=op.analysis_id and owner_id=op.owner_id and organization_id=op.organization_id for share skip locked;
  if not found or private.ifo_sha(private.ifpub_run_json(run)::text)<>p_publication.run_content_sha256
   or run.input_hash<>op.binding_sha256 or run.provider<>'openai' or run.model_id<>op.binding->'policy'->>'model'
   or run.prompt_version<>op.binding->'policy'->>'promptVersion' or run.output is distinct from p_publication.render->'prose'
   or not exists(select 1 from private.initial_feedback_attempts att where att.attempt_id=p_publication.attempt_id and att.operation_id=op.operation_id
    and att.state='published' and att.error_code is null and att.usage is not null
    and run.input_tokens::numeric=(att.usage->>'inputTokens')::numeric and run.output_tokens::numeric=(att.usage->>'outputTokens')::numeric)
   then perform private.ifo_fail('unavailable');end if;
 else
  if core->'compatibility'->'writer'<>'null'::jsonb or receipt->'writerSha256'<>'null'::jsonb
   or w.draft<>jsonb_build_object('summary',null,'bullets','[]'::jsonb) then perform private.ifo_fail('unavailable');end if;
 end if;
 return core||jsonb_build_object('receipt',receipt||jsonb_build_object('replayed',p_replayed));
end;
$ifpub_json$;

create function private.ifpub_validate_completion(p_completion jsonb,p_source_sha text) returns void
language plpgsql stable set search_path='' as $ifpub_completion$
declare failure jsonb;kind text;
begin
 if jsonb_typeof(p_completion) is distinct from 'object' or octet_length(convert_to(p_completion::text,'UTF8'))>1048576 then perform private.ifo_fail('invalid');end if;
 kind:=p_completion->>'kind';
 if kind='assessed' then
  if private.ifo_keys(p_completion,array['kind','plan','observation','generationFailure']) is not true
   or p_completion->'generationFailure'<>'null'::jsonb or jsonb_typeof(p_completion->'plan') is distinct from 'object'
   or p_completion->'plan'->>'sourceTextSha256' is distinct from p_source_sha or p_completion->'observation'->>'status' is distinct from 'assessed'
   or p_completion->'observation'->'binding'->>'sourceSha256' is distinct from p_source_sha then perform private.ifo_fail('invalid');end if;
 elsif kind='deterministic_only' then
  if private.ifo_keys(p_completion,array['kind','reason','plan','observation','generationFailure']) is not true
   or p_completion->'plan'<>'null'::jsonb or jsonb_typeof(p_completion->'reason') is distinct from 'string' or p_completion->>'reason' not in ('ai_disabled','historical_inputs','source_resource_limit','pre_dispatch_unavailable',
    'provider_unavailable','invalid_output','unsupported_output','attempts_exhausted') then perform private.ifo_fail('invalid');end if;
  if p_completion->>'reason' in ('ai_disabled','historical_inputs','source_resource_limit','pre_dispatch_unavailable')
   and (p_completion->'observation'<>'null'::jsonb or p_completion->'generationFailure'<>'null'::jsonb) then perform private.ifo_fail('invalid');end if;
 else perform private.ifo_fail('invalid');end if;
 if p_completion->'observation'<>'null'::jsonb and p_completion->'generationFailure'<>'null'::jsonb then perform private.ifo_fail('invalid');end if;
 if private.ifpub_capture_valid(p_completion->'observation',p_source_sha) is not true then perform private.ifo_fail('invalid');end if;
 failure:=p_completion->'generationFailure';
 if failure<>'null'::jsonb then
  if private.ifo_keys(failure,array['schemaVersion','reason','rawResponseSha256']) is not true
   or failure->>'schemaVersion' is distinct from 'initial-feedback-generation-failure/1.0.0'
   or jsonb_typeof(failure->'reason') is distinct from 'string' or failure->>'reason' not in ('refused','truncated','malformed_json','schema_invalid','source_reference_invalid')
   or not(failure->'rawResponseSha256'='null'::jsonb or (jsonb_typeof(failure->'rawResponseSha256')='string'
     and (failure->>'rawResponseSha256') collate "C" ~ '^[a-f0-9]{64}$')) then perform private.ifo_fail('invalid');end if;
 end if;
end;
$ifpub_completion$;

create function public.finish_initial_feedback(p_analysis_id uuid,p_lease jsonb,p_operation_id uuid,p_attempt_id uuid,p_binding_sha256 text,
 p_completion jsonb,p_process_id text,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $ifpub_finish$
declare a public.analyses%rowtype;op private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;
 pub private.initial_feedback_publications%rowtype;r public.analysis_results%rowtype;w public.writer_drafts%rowtype;run public.analysis_ai_runs%rowtype;
 original jsonb;ctx jsonb;rendered jsonb:=null;feedback jsonb;writer jsonb:=null;proof jsonb:=null;core jsonb;receipt jsonb;pol jsonb;
 publication_id uuid:=gen_random_uuid();run_id uuid:=null;now_value timestamptz;state_value text;reason_value text;
 result_sha text;writer_sha text;run_sha text:=null;completion_sha text;budget_att private.ai_budget_attempts%rowtype;budget_op private.ai_budget_operations%rowtype;
begin
 if p_analysis_id is null or p_operation_id is null or p_binding_sha256 is null or (p_binding_sha256 collate "C")!~'^[a-f0-9]{64}$'
  or private.legacy_scoring_lease(p_lease) is not true or p_process_id is null or (p_process_id collate "C")!~'^[ -~]{1,128}$'
  or p_request_id is null or (p_request_id collate "C")!~'^[ -~]{1,128}$' then perform private.ifo_fail('invalid');end if;
 if private.initial_feedback_publication_ready() is not true then perform private.ifo_fail('unavailable');end if;
 -- Actual current owner/privacy/source AND independently active immutable
 -- original source always precede stored content, including exact replay.
 a:=private.legacy_scoring_access(p_analysis_id,null);original:=private.ifo_original(a);
 select * into op from private.initial_feedback_operations where operation_id=p_operation_id and analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id for update;
 if not found or op.binding_sha256<>p_binding_sha256 or op.binding is distinct from private.ifo_binding(original,op.binding->'policy') then perform private.ifo_fail('not_found');end if;
 perform private.ifpub_validate_completion(p_completion,op.binding->>'sourceTextSha256');completion_sha:=private.ifo_sha(p_completion::text);
 if op.state='published' then
  select * into pub from private.initial_feedback_publications where id=op.publication_id and operation_id=op.operation_id for key share skip locked;
  if not found or pub.completion_sha256<>completion_sha or pub.completion is distinct from p_completion or pub.attempt_id is distinct from p_attempt_id
   then perform private.ifo_fail('stale');end if;
  if private.legacy_scoring_static_job(a.id,p_lease) is not true and pub.finish_lease is distinct from p_lease then perform private.ifo_fail('not_found');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-finish/1.0.0','status','published','publication',private.ifpub_json(pub,true));
 end if;
 if a.status<>'qualitative_review' or not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
  then perform private.ifo_fail('stale');end if;
 if exists(select 1 from public.analysis_results where analysis_id=a.id) or exists(select 1 from public.writer_drafts where analysis_id=a.id)
  or exists(select 1 from public.analysis_ai_runs where analysis_id=a.id) then perform private.ifo_fail('stale');end if;
 pol:=op.binding->'policy';state_value:=p_completion->>'kind';reason_value:=p_completion->>'reason';
 if p_attempt_id is not null then
  select * into att from private.initial_feedback_attempts where attempt_id=p_attempt_id and operation_id=op.operation_id for update;
  if not found or att.claimed_at is null then perform private.ifo_fail('stale');end if;
 end if;
 if state_value='assessed' then
  if p_attempt_id is null or att.state<>'known' or att.usage is null or att.error_code is not null
   or att.ordinal<>(select max(ordinal) from private.initial_feedback_attempts where operation_id=op.operation_id)
   or (att.usage->>'inputTokens')::numeric>2147483647 or (att.usage->>'outputTokens')::numeric>2147483647
   then perform private.ifo_fail('stale');end if;
  ctx:=private.ifo_context(a,original);
  if ctx->>'generationEligibility'<>'eligible' or private.ifo_selected_policy(a.organization_id,jsonb_build_object('version',op.policy_version,'sha256',op.policy_sha256)) is distinct from pol
   then perform private.ifo_fail('stale');end if;
  perform 1 from public.consents where user_id=a.owner_id and purpose='qualitative_ai' and policy_version='candidate-ai-v1' for share skip locked;
  if not found then perform private.ifo_fail('not_found');end if;
  if pol->'budgetPolicyVersion'<>'null'::jsonb then
   select * into budget_att from private.ai_budget_attempts where id=att.budget_attempt_id and operation_id=op.operation_id
    and organization_id=op.organization_id and ordinal=att.ordinal for share skip locked;
   if not found or budget_att.state<>'settled' or budget_att.actual_input_tokens is distinct from (att.usage->>'inputTokens')::numeric
    or budget_att.actual_output_tokens is distinct from (att.usage->>'outputTokens')::numeric then perform private.ifo_fail('stale');end if;
   select * into budget_op from private.ai_budget_operations where id=op.operation_id and user_id=op.owner_id and organization_id=op.organization_id for share skip locked;
   if not found or budget_op.payload_sha256<>op.binding_sha256 or budget_op.surface<>'qualitative'
    or budget_op.model<>pol->>'model' or budget_op.prompt_policy_version<>pol->>'promptVersion'
    or budget_op.policy_version<>pol->>'budgetPolicyVersion' then perform private.ifo_fail('stale');end if;
  elsif att.budget_attempt_id is not null then perform private.ifo_fail('stale');end if;
  -- Exactly ONE pure renderer invocation: no model support boolean, filtered
  -- prose, fabricated assessment, or recomputed JS checksum supplies authority.
  rendered:=private.render_initial_feedback_plan(original->'scoringContext'->'extraction'->>'text',p_completion->'plan');
  perform private.ifpub_correspondence(original->'scoringContext'->'extraction'->>'text',p_completion->'plan',p_completion->'observation',rendered);
  proof:=jsonb_build_object('schemaVersion','initial-feedback-native-support/1.0.0','scope','retained_output_only','bindingSha256',op.binding_sha256,
   'planSha256',private.ifo_sha((p_completion->'plan')::text),'parts',rendered->'parts','mapping',rendered->'mapping');
  feedback:=private.ifpub_feedback(original->'deterministicResult',rendered);writer:=rendered->'prose'->'writer';run_id:=gen_random_uuid();
  if public.persist_qualitative_analysis(a.id,feedback,op.binding_sha256,(att.usage->>'inputTokens')::integer,pol->>'model',rendered->'prose',
   (att.usage->>'outputTokens')::integer,p_process_id,pol->>'promptVersion','openai',p_request_id,run_id,writer) is not true then perform private.ifo_fail('stale');end if;
 else
  if reason_value in ('ai_disabled','historical_inputs','source_resource_limit','pre_dispatch_unavailable') then
   if p_attempt_id is not null or exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and claimed_at is not null)
    then perform private.ifo_fail('stale');end if;
   if reason_value in ('historical_inputs','source_resource_limit') then
    ctx:=private.ifo_context(a,original);if ctx->>'generationEligibility'<>reason_value then perform private.ifo_fail('stale');end if;
   end if;
  else
   if p_attempt_id is null or att.state not in ('failed','held_unknown') or att.error_code is null
    or exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and ordinal>att.ordinal and claimed_at is not null)
    then perform private.ifo_fail('stale');end if;
  end if;
  feedback:=private.ifpub_feedback(original->'deterministicResult',null);
  if public.persist_partial_analysis(a.id,feedback,p_process_id,p_request_id) is not true then perform private.ifo_fail('stale');end if;
 end if;
 -- A false old factory, lost lease, source/privacy drift or denied consent must
 -- abort this entire transaction, including its old result/run/draft/transition.
 if not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
  or private.try_candidate_privacy_write(a.owner_id) is not true then perform private.ifo_fail('stale');end if;
 a:=private.legacy_scoring_access(a.id,a.owner_id);
 if private.ifo_original(a) is distinct from original then perform private.ifo_fail('stale');end if;
 if state_value='assessed' then
  if private.ifo_context(a,original)->>'generationEligibility'<>'eligible' then perform private.ifo_fail('stale');end if;
  perform 1 from public.consents where user_id=a.owner_id and purpose='qualitative_ai' and policy_version='candidate-ai-v1' for share skip locked;
  if not found then perform private.ifo_fail('not_found');end if;
 end if;
 select * into r from public.analysis_results where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id for share skip locked;
 if not found or r.feedback is distinct from feedback then perform private.ifo_fail('unavailable');end if;
 select * into w from public.writer_drafts where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id and kind='summary' for share skip locked;
 if not found or w.draft is distinct from coalesce(writer,jsonb_build_object('summary',null,'bullets','[]'::jsonb)) then perform private.ifo_fail('unavailable');end if;
 result_sha:=private.ifo_sha(private.ifpub_result_json(r)::text);writer_sha:=private.ifo_sha(private.ifpub_writer_json(w)::text);
 if state_value='assessed' then
  select * into run from public.analysis_ai_runs where id=run_id and analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id for share skip locked;
  if not found then perform private.ifo_fail('unavailable');end if;run_sha:=private.ifo_sha(private.ifpub_run_json(run)::text);
 end if;
 now_value:=clock_timestamp();
 core:=jsonb_build_object('schemaVersion','initial-feedback-publication/1.0.0','publicationId',publication_id,'state',state_value,'reason',reason_value,
  'binding',op.binding,'plan',p_completion->'plan','recordedObservation',p_completion->'observation','generationFailure',p_completion->'generationFailure',
  'ownedSupport',proof,'prose',rendered->'prose','compatibility',jsonb_build_object('deterministicResult',original->'deterministicResult','feedback',feedback,'writer',writer));
 receipt:=jsonb_build_object('schemaVersion','initial-feedback-receipt/1.0.0','operationId',op.operation_id,'attemptId',p_attempt_id,'publicationId',publication_id,
  'analysisId',a.id,'ownerId',a.owner_id,'bindingSha256',op.binding_sha256,'publicationSha256',private.ifo_sha(core::text),'resultSha256',result_sha,
  'writerSha256',case when writer is null then null else writer_sha end,'runId',run_id,'createdAt',private.ifo_stamp(now_value),'replayed',false);
 insert into private.initial_feedback_publications(id,operation_id,attempt_id,analysis_id,owner_id,organization_id,resume_id,resume_version_id,run_id,state,reason,
  binding_sha256,completion,completion_sha256,publication_core,publication_sha256,receipt,render,plan_sha256,render_sha256,support_sha256,capture_sha256,
  result_content_sha256,writer_content_sha256,run_content_sha256,finish_lease,process_id,request_id,created_at)
 values(publication_id,op.operation_id,p_attempt_id,a.id,a.owner_id,a.organization_id,op.resume_id,op.resume_version_id,run_id,state_value,reason_value,op.binding_sha256,
  p_completion,completion_sha,core,private.ifo_sha(core::text),receipt,rendered,case when rendered is null then null else private.ifo_sha((p_completion->'plan')::text) end,
  case when rendered is null then null else private.ifo_sha(rendered::text) end,case when proof is null then null else private.ifo_sha(proof::text) end,
  case when p_completion->'observation'='null'::jsonb then null else private.ifo_sha((p_completion->'observation')::text) end,
  result_sha,writer_sha,run_sha,p_lease,p_process_id,p_request_id,now_value) returning * into pub;
 update private.initial_feedback_attempts set state='cancelled_before_dispatch' where operation_id=op.operation_id and state='reserved' and claimed_at is null;
 if state_value='assessed' then update private.initial_feedback_attempts set state='published' where attempt_id=p_attempt_id;end if;
 update private.initial_feedback_operations set state='published',publication_id=pub.id where operation_id=op.operation_id returning * into op;
 return jsonb_build_object('schemaVersion','initial-feedback-finish/1.0.0','status','published','publication',private.ifpub_json(pub,false));
end;
$ifpub_finish$;

create function public.read_initial_feedback(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $ifpub_read$
declare a public.analyses%rowtype;op private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;
 pub private.initial_feedback_publications%rowtype;original jsonb;ctx jsonb;
begin
 if p_user_id is null or p_analysis_id is null then perform private.ifo_fail('invalid');end if;
 if private.initial_feedback_publication_ready() is not true then perform private.ifo_fail('unavailable');end if;
 a:=private.legacy_scoring_access(p_analysis_id,p_user_id);
 if not exists(select 1 from public.analysis_deterministic_results where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id)
  then perform private.ifo_fail('not_found');end if;
 if not exists(select 1 from private.analysis_scoring_inputs where analysis_id=a.id) then
  return jsonb_build_object('schemaVersion','initial-feedback-read/1.0.0','status','legacy_unbound','analysisId',a.id,'reason','original_input_or_publication_missing');end if;
 original:=private.ifo_original(a);
 select * into op from private.initial_feedback_operations where analysis_id=a.id and owner_id=a.owner_id and organization_id=a.organization_id for key share skip locked;
 if not found then
  if exists(select 1 from private.initial_feedback_operations where analysis_id=a.id) then perform private.ifo_fail('unavailable');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-read/1.0.0','status','legacy_unbound','analysisId',a.id,'reason','original_input_or_publication_missing');end if;
 if op.binding is distinct from private.ifo_binding(original,op.binding->'policy') then perform private.ifo_fail('unavailable');end if;
 if op.state<>'published' then
  select * into att from private.initial_feedback_attempts where operation_id=op.operation_id order by ordinal desc limit 1 for key share skip locked;
  if not found then perform private.ifo_fail('unavailable');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-read/1.0.0','status','pending','operation',private.ifo_operation_json(op),'attempt',private.ifo_attempt_json(att));end if;
 select * into pub from private.initial_feedback_publications where id=op.publication_id and operation_id=op.operation_id for key share skip locked;
 if not found then perform private.ifo_fail('unavailable');end if;
 ctx:=private.ifo_context(a,original);
 return jsonb_build_object('schemaVersion','initial-feedback-read/1.0.0','status','available','currentness',ctx->>'currentness','publication',private.ifpub_json(pub,true));
end;
$ifpub_read$;

create function public.export_initial_feedback_records(p_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $ifpub_export$
declare answer jsonb;row_value jsonb;total_bytes bigint:=1024;n integer;
 operation_rows jsonb[]:=array[]::jsonb[];attempt_rows jsonb[]:=array[]::jsonb[];publication_rows jsonb[]:=array[]::jsonb[];
begin
 if p_user_id is null then perform private.ifo_fail('invalid');end if;
 if private.initial_feedback_publication_ready() is not true then perform private.ifo_fail('unavailable');end if;
 perform 1 from auth.users where id=p_user_id for key share skip locked;if not found then perform private.ifo_fail('not_found');end if;
 -- Complete owner export across organizations, periods, source status and flags.
 -- Bounded local arrays capture rows only after the shared byte/row checks.
 -- No unbounded jsonb_agg is built first, no truncation, and no retired filter.
 n:=0;
 for row_value in select to_jsonb(o)||jsonb_build_object('created_at',private.ifo_stamp(o.created_at))
  from private.initial_feedback_operations o where o.owner_id=p_user_id order by o.operation_id limit 4097 loop
  n:=n+1;total_bytes:=total_bytes+octet_length(convert_to(row_value::text,'UTF8'))+1;
  if n>4096 or total_bytes>33554432 then perform private.ifo_fail('unavailable');end if;
  operation_rows:=array_append(operation_rows,row_value);
 end loop;
 n:=0;
 for row_value in select to_jsonb(a)||jsonb_build_object('owner_id',o.owner_id,'organization_id',o.organization_id,'analysis_id',o.analysis_id,
  'created_at',private.ifo_stamp(a.created_at),'claimed_at',private.ifo_stamp(a.claimed_at))
  from private.initial_feedback_attempts a join private.initial_feedback_operations o on o.operation_id=a.operation_id where o.owner_id=p_user_id
  order by a.operation_id,a.ordinal limit 12289 loop
  n:=n+1;total_bytes:=total_bytes+octet_length(convert_to(row_value::text,'UTF8'))+1;
  if n>12288 or total_bytes>33554432 then perform private.ifo_fail('unavailable');end if;
  attempt_rows:=array_append(attempt_rows,row_value);
 end loop;
 n:=0;
 for row_value in select to_jsonb(p)||jsonb_build_object('created_at',private.ifo_stamp(p.created_at))
  from private.initial_feedback_publications p where p.owner_id=p_user_id order by p.operation_id limit 4097 loop
  n:=n+1;total_bytes:=total_bytes+octet_length(convert_to(row_value::text,'UTF8'))+1;
  if n>4096 or total_bytes>33554432 then perform private.ifo_fail('unavailable');end if;
  publication_rows:=array_append(publication_rows,row_value);
 end loop;
 answer:=jsonb_build_object('schemaVersion','initial-feedback-export/1.0.0','operations',to_jsonb(operation_rows),'attempts',to_jsonb(attempt_rows),'publications',to_jsonb(publication_rows));
 if octet_length(convert_to(answer::text,'UTF8'))>33554432 then perform private.ifo_fail('unavailable');end if;
 return answer;
end;
$ifpub_export$;

-- Forward state constraints without assuming generated constraint names.
do $ifpub_constraints$
declare c record;state_attribute smallint;publication_attribute smallint;n integer:=0;
begin
 select attnum into state_attribute from pg_catalog.pg_attribute where attrelid='private.initial_feedback_operations'::regclass and attname='state';
 select attnum into publication_attribute from pg_catalog.pg_attribute where attrelid='private.initial_feedback_operations'::regclass and attname='publication_id';
 for c in select conname from pg_catalog.pg_constraint where conrelid='private.initial_feedback_operations'::regclass and contype='c'
  and conkey in (array[state_attribute]::smallint[],array[publication_attribute]::smallint[]) loop
  execute format('alter table private.initial_feedback_operations drop constraint %I',c.conname);n:=n+1;
 end loop;
 if n<>2 then raise exception 'INITIAL_FEEDBACK_PUBLICATION_CONSTRAINT_DRIFT' using errcode='23514';end if;
 alter table private.initial_feedback_operations add constraint initial_feedback_operation_publication_state check
  ((state='open' and publication_id is null) or (state='published' and publication_id is not null));
 select attnum into state_attribute from pg_catalog.pg_attribute where attrelid='private.initial_feedback_attempts'::regclass and attname='state';n:=0;
 for c in select conname from pg_catalog.pg_constraint where conrelid='private.initial_feedback_attempts'::regclass and contype='c' and state_attribute=any(conkey) loop
  execute format('alter table private.initial_feedback_attempts drop constraint %I',c.conname);n:=n+1;
 end loop;
 if n<>5 then raise exception 'INITIAL_FEEDBACK_PUBLICATION_ATTEMPT_DRIFT' using errcode='23514';end if;
 alter table private.initial_feedback_attempts add constraint initial_feedback_attempt_publication_state check(state in
  ('reserved','dispatched','known','held_unknown','failed','cancelled_before_dispatch','published'));
 alter table private.initial_feedback_attempts add constraint initial_feedback_attempt_publication_claim check
  ((state in ('reserved','cancelled_before_dispatch') and claimed_at is null and claim_lease is null and budget_attempt_id is null and usage is null)
   or (state not in ('reserved','cancelled_before_dispatch') and claimed_at is not null and private.legacy_scoring_lease(claim_lease) is true));
 alter table private.initial_feedback_attempts add constraint initial_feedback_attempt_publication_usage check
  ((state in ('known','published') and usage is not null and error_code is null)
   or (state='held_unknown' and usage is null)
   or (state='failed' and error_code is not null)
   or (state in ('reserved','dispatched','cancelled_before_dispatch') and usage is null and error_code is null));
end;
$ifpub_constraints$;

create or replace function private.ifo_immutable() returns trigger
language plpgsql volatile set search_path='' as $ifpub_operation_guard$
begin
 if tg_op='DELETE' then perform private.ifo_fail('stale');end if;
 if tg_table_name='initial_feedback_policies' then
  if tg_op='UPDATE' or private.ifo_policy_valid(new.descriptor) is not true then perform private.ifo_fail('stale');end if;
 elsif tg_table_name='initial_feedback_operations' then
  if tg_op='UPDATE' then
   if old.state<>'open' or old.publication_id is not null or new.state<>'published' or new.publication_id is null
    or (to_jsonb(new)-'state'-'publication_id') is distinct from (to_jsonb(old)-'state'-'publication_id')
    or not exists(select 1 from private.initial_feedback_publications p where p.id=new.publication_id and p.operation_id=new.operation_id
     and p.analysis_id=new.analysis_id and p.owner_id=new.owner_id and p.organization_id=new.organization_id and p.binding_sha256=new.binding_sha256)
    then perform private.ifo_fail('stale');end if;
   return new;
  end if;
  if new.state<>'open' or new.publication_id is not null or new.binding->>'analysisId' is distinct from new.analysis_id::text
   or new.binding->>'ownerId' is distinct from new.owner_id::text or new.binding->>'organizationId' is distinct from new.organization_id::text
   or new.binding->>'resumeId' is distinct from new.resume_id::text or new.binding->>'resumeVersionId' is distinct from new.resume_version_id::text
   or new.binding->'policy'->>'version' is distinct from new.policy_version or new.binding->'policy'->>'sha256' is distinct from new.policy_sha256
   or (new.binding->'policy'->>'attemptLimit')::integer is distinct from new.attempt_limit
   or not exists(select 1 from private.initial_feedback_policies where version=new.policy_version and sha256=new.policy_sha256 and descriptor=new.binding->'policy')
   then perform private.ifo_fail('invalid');end if;
 else perform private.ifo_fail('invalid');end if;
 return new;
end;
$ifpub_operation_guard$;

create or replace function private.ifo_attempt_guard() returns trigger
language plpgsql volatile set search_path='' as $ifpub_attempt_guard$
declare op private.initial_feedback_operations%rowtype;previous private.initial_feedback_attempts%rowtype;
begin
 if tg_op='DELETE' then perform private.ifo_fail('stale');end if;
 select * into op from private.initial_feedback_operations where operation_id=new.operation_id for update;
 if not found then perform private.ifo_fail('stale');end if;
 if tg_op='INSERT' then
  if op.state<>'open' or op.publication_id is not null or new.state<>'reserved' or new.ordinal>op.attempt_limit then perform private.ifo_fail('stale');end if;
  select * into previous from private.initial_feedback_attempts where operation_id=op.operation_id order by ordinal desc limit 1 for update;
  if found then
   if new.ordinal<>previous.ordinal+1 or previous.state<>'failed' or previous.usage is null or previous.error_code not in ('provider_failed','timeout') then perform private.ifo_fail('stale');end if;
  elsif new.ordinal<>1 then perform private.ifo_fail('stale');end if;
 else
  if (new.attempt_id,new.operation_id,new.ordinal,new.created_at) is distinct from (old.attempt_id,old.operation_id,old.ordinal,old.created_at)
   or (old.claimed_at is not null and (new.claimed_at,new.claim_lease,new.budget_attempt_id) is distinct from (old.claimed_at,old.claim_lease,old.budget_attempt_id))
   or (old.usage is not null and new.usage is distinct from old.usage) or (old.error_code is not null and new.error_code is distinct from old.error_code)
   then perform private.ifo_fail('stale');end if;
  if op.state='published' then
   -- A partial's unknown hold may learn actual usage after publication. It
   -- cannot change its terminal reason, acquire a dispatch, or alter content.
   if not exists(select 1 from private.initial_feedback_publications p where p.id=op.publication_id and p.state='deterministic_only')
    or not(old.state='held_unknown' and old.usage is null and old.error_code is not null and new.state='failed' and new.usage is not null
      and new.error_code=old.error_code) then
    if to_jsonb(new) is distinct from to_jsonb(old) then perform private.ifo_fail('stale');end if;
   end if;
  elsif old.state='reserved' then
   if not((new.state='dispatched' and new.claimed_at is not null and new.claim_lease is not null and new.usage is null and new.error_code is null)
    or (new.state='cancelled_before_dispatch' and new.claimed_at is null and new.claim_lease is null and new.budget_attempt_id is null and new.usage is null and new.error_code is null))
    then perform private.ifo_fail('stale');end if;
  elsif new.state='published' then
   if old.state<>'known' or old.usage is null or old.error_code is not null
    or not exists(select 1 from private.initial_feedback_publications p where p.operation_id=op.operation_id and p.attempt_id=new.attempt_id and p.state='assessed')
    then perform private.ifo_fail('stale');end if;
  elsif old.state in ('published','cancelled_before_dispatch') or new.state not in ('known','held_unknown','failed') then perform private.ifo_fail('stale');end if;
 end if;return new;
end;
$ifpub_attempt_guard$;

create function private.ifpub_immutable() returns trigger
language plpgsql volatile set search_path='' as $ifpub_immutable$
begin
 -- Actual candidate FK deletion may remove content; UPDATE can never rewrite
 -- a published receipt/capture/proof. Technical unlink/retention remains held.
 if tg_op='UPDATE' then perform private.ifo_fail('stale');end if;return old;
end;
$ifpub_immutable$;
create trigger initial_feedback_publication_immutable before update on private.initial_feedback_publications
 for each row execute function private.ifpub_immutable();

-- Published replay is admitted before fresh lease/JD/consent/selection.
create or replace function public.prepare_initial_feedback(p_analysis_id uuid,p_lease jsonb,p_policy jsonb,p_retry_after_attempt_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $ifo_16$
declare a public.analyses%rowtype;op private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;
  pub private.initial_feedback_publications%rowtype;replayed_attempt private.initial_feedback_attempts%rowtype;original jsonb;ctx jsonb;pol jsonb;b jsonb;next_ordinal integer:=1;
begin
  if private.legacy_scoring_lease(p_lease) is not true or p_analysis_id is null
    or private.ifo_keys(p_policy,array['version','sha256']) is not true
    or jsonb_typeof(p_policy->'version') is distinct from 'string' or jsonb_typeof(p_policy->'sha256') is distinct from 'string'
    or p_policy->>'version' is distinct from 'initial-feedback-publication/1.0.0' or (p_policy->>'sha256') collate "C" !~ '^[a-f0-9]{64}$'
    then perform private.ifo_fail('invalid');end if;
  if private.initial_feedback_operation_ready() is not true then perform private.ifo_fail('unavailable');end if;
  a:=private.legacy_scoring_access(p_analysis_id,null);original:=private.ifo_original(a);
  select * into op from private.initial_feedback_operations where analysis_id=a.id for update;
  if found then
    if op.owner_id<>a.owner_id or op.organization_id<>a.organization_id
      or op.binding is distinct from private.ifo_binding(original,op.binding->'policy') then perform private.ifo_fail('not_found');end if;
    if op.state='published' then
      select * into pub from private.initial_feedback_publications where id=op.publication_id and operation_id=op.operation_id for key share skip locked;
      if not found then perform private.ifo_fail('unavailable');end if;
      if private.legacy_scoring_static_job(a.id,p_lease) is not true and pub.finish_lease is distinct from p_lease
        and not exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and claim_lease=p_lease)
        then perform private.ifo_fail('not_found');end if;
      if p_retry_after_attempt_id is not null and not exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and attempt_id=p_retry_after_attempt_id)
        then perform private.ifo_fail('stale');end if;
      return jsonb_build_object('schemaVersion','initial-feedback-prepare/1.0.0','status','published','operation',private.ifo_operation_json(op),
        'publication',private.ifpub_json(pub,true),'context',null,'dispatchAllowed',false,'replayed',true);
    end if;
    if private.legacy_scoring_static_job(a.id,p_lease) is not true and not exists(select 1 from private.initial_feedback_attempts
      where operation_id=op.operation_id and claim_lease=p_lease) then perform private.ifo_fail('not_found');end if;
    select * into att from private.initial_feedback_attempts where operation_id=op.operation_id order by ordinal desc limit 1 for update;
    if not found then perform private.ifo_fail('unavailable');end if;
    -- Null selector and a replayed explicit retry return status BEFORE fresh
    -- policy/lease/current-JD/consent/rate/budget checks. No dispatch context.
    if p_retry_after_attempt_id is not null then
      select next_attempt.* into replayed_attempt from private.initial_feedback_attempts previous_attempt
        join private.initial_feedback_attempts next_attempt on next_attempt.operation_id=previous_attempt.operation_id
          and next_attempt.ordinal=previous_attempt.ordinal+1
        where previous_attempt.attempt_id=p_retry_after_attempt_id and previous_attempt.operation_id=op.operation_id
        for update of next_attempt;
      if found then
        return jsonb_build_object('schemaVersion','initial-feedback-prepare/1.0.0','status','pending','operation',private.ifo_operation_json(op),
          'attempt',private.ifo_attempt_json(replayed_attempt),'context',null,'dispatchAllowed',false,'replayed',true);
      end if;
    end if;
    if p_retry_after_attempt_id is null then
      return jsonb_build_object('schemaVersion','initial-feedback-prepare/1.0.0','status','pending','operation',private.ifo_operation_json(op),
        'attempt',private.ifo_attempt_json(att),'context',null,'dispatchAllowed',false,'replayed',true);
    end if;
    if att.attempt_id<>p_retry_after_attempt_id or att.state<>'failed' or att.usage is null or att.error_code not in ('provider_failed','timeout')
      or att.ordinal>=op.attempt_limit then perform private.ifo_fail('stale');end if;
    next_ordinal:=att.ordinal+1;
  elsif p_retry_after_attempt_id is not null then perform private.ifo_fail('stale');end if;
  if a.status<>'qualitative_review' or not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
    then perform private.ifo_fail('stale');end if;
  pol:=private.ifo_selected_policy(a.organization_id,p_policy);ctx:=private.ifo_context(a,original);b:=private.ifo_binding(ctx,pol);
  if op.operation_id is not null then
    if op.policy_version<>pol->>'version' or op.policy_sha256<>pol->>'sha256' or op.binding is distinct from b
      or ctx->>'generationEligibility'<>'eligible' then perform private.ifo_fail('stale');end if;
    -- Retry preparation requires actual current consent; initial preparation
    -- remains usable for AI-off/historical/resource deterministic-only recovery.
    perform 1 from public.consents where user_id=a.owner_id and purpose='qualitative_ai' and policy_version='candidate-ai-v1' for share skip locked;
    if not found then perform private.ifo_fail('not_found');end if;
  else
    insert into private.initial_feedback_operations(analysis_id,owner_id,organization_id,resume_id,resume_version_id,policy_version,policy_sha256,binding,binding_sha256,attempt_limit)
      values(a.id,a.owner_id,a.organization_id,(b->>'resumeId')::uuid,(b->>'resumeVersionId')::uuid,pol->>'version',pol->>'sha256',b,private.ifo_sha(b::text),(pol->>'attemptLimit')::integer)
      returning * into op;
  end if;
  insert into private.initial_feedback_attempts(operation_id,ordinal) values(op.operation_id,next_ordinal) returning * into att;
  if not private.lock_analysis_stage_lease(a.id,p_lease->>'workerId',(p_lease->>'attempt')::integer,(p_lease->>'leaseFence')::uuid)
    or private.try_candidate_privacy_write(a.owner_id) is not true then perform private.ifo_fail('stale');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-prepare/1.0.0','status','prepared','operation',private.ifo_operation_json(op),
    'attempt',private.ifo_attempt_json(att),'context',ctx,'dispatchAllowed',false,'replayed',false);
end;
$ifo_16$;
create or replace function public.settle_initial_feedback_attempt(p_operation_id uuid,p_attempt_id uuid,p_binding_sha256 text,p_usage jsonb,p_error_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $ifo_18$
declare op private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;
  actual jsonb:=nullif(p_usage,'null'::jsonb);replayed boolean;
begin
  if p_operation_id is null or p_attempt_id is null or p_binding_sha256 is null or p_binding_sha256 collate "C" !~ '^[a-f0-9]{64}$'
    or private.ifo_usage_valid(actual) is not true or (p_error_code is not null and p_error_code not in
      ('provider_failed','timeout','cancelled','invalid_output','unsupported_output','storage_failed','unknown')) then perform private.ifo_fail('invalid');end if;
  if private.initial_feedback_operation_ready() is not true then perform private.ifo_fail('unavailable');end if;
  -- No current candidate/auth/source/lease/policy-selection read. Static exact
  -- metadata remains settleable after withdrawal; this NEVER calls R03 settle.
  select * into op from private.initial_feedback_operations where operation_id=p_operation_id for update;
  if not found or op.binding_sha256<>p_binding_sha256 then perform private.ifo_fail('not_found');end if;
  select * into att from private.initial_feedback_attempts where attempt_id=p_attempt_id and operation_id=op.operation_id for update;
  if not found or att.claimed_at is null or att.claim_lease is null or att.state='reserved' then perform private.ifo_fail('stale');end if;
  if (att.usage is not null and actual is not null and att.usage is distinct from actual)
    or (att.error_code is not null and p_error_code is not null and att.error_code<>p_error_code) then perform private.ifo_fail('stale');end if;
  if att.state='published' then
    -- Saved assessed output cannot be converted into a technical failure.
    if p_error_code is not null then perform private.ifo_fail('stale');end if;
    return jsonb_build_object('schemaVersion','initial-feedback-settlement/1.0.0','operationId',op.operation_id,'attemptId',att.attempt_id,
      'bindingSha256',op.binding_sha256,'state','known','usage',att.usage,'errorCode',null,'replayed',true);
  end if;
  if op.state='published' and att.usage is null and att.error_code is null then perform private.ifo_fail('stale');end if;
  replayed:=(actual is null or att.usage is not distinct from actual) and (p_error_code is null or att.error_code is not distinct from p_error_code)
    and att.state<>'dispatched';
  if not replayed then
    update private.initial_feedback_attempts set usage=coalesce(usage,actual),error_code=coalesce(error_code,p_error_code),
      state=case when coalesce(usage,actual) is null then 'held_unknown' when coalesce(error_code,p_error_code) is not null then 'failed' else 'known' end
      where attempt_id=att.attempt_id returning * into att;
  end if;
  return jsonb_build_object('schemaVersion','initial-feedback-settlement/1.0.0','operationId',op.operation_id,'attemptId',att.attempt_id,
    'bindingSha256',op.binding_sha256,'state',att.state,'usage',att.usage,'errorCode',att.error_code,'replayed',replayed);
end;
$ifo_18$;


-- GENERATED PUBLICATION CLOSURE: actual prosrc source postimages, not runtime evidence.
create or replace function private.initial_feedback_operation_ready() returns boolean
language plpgsql stable set search_path='' as $ifo_20$
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;role_name text;rel pg_catalog.pg_class%rowtype;
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');col jsonb;table_name text;attribute_numbers smallint[];
  manifest jsonb:=$ifo_catalog$[{"signature":"private.legacy_scoring_fail(text)","sha256":"e335af12e27203158cf4d8088b4be71e95632300802ae79620449baf46685f33","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"void","acl":"private"},{"signature":"private.legacy_scoring_lease(jsonb)","sha256":"fa753641ed86c2b4c6404ab96d390b53852ccf59aff7fe10750f258b7d5d5dbf","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.legacy_scoring_access(uuid,uuid)","sha256":"faea49c97ab2244d1400d8aaf7f31e401933810017dbb92c1e67aa725641c05c","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"public.analyses","acl":"private"},{"signature":"private.legacy_scoring_static_job(uuid,jsonb)","sha256":"1700af1f41c303ac4a54d80246143655c392dd4b1e94c3362a46c2f690f603b8","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.legacy_scoring_input_data(public.analyses)","sha256":"3095bfe7147e4566b41bb7ced421ff671811565da3743765a3b28d94dda8de41","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.legacy_scoring_result(public.analysis_deterministic_results)","sha256":"53312027b70370060adb611dca630dc3ec8171359d0f51d20d0ef5899d1acdeb","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.legacy_scoring_row_sha256(public.analysis_deterministic_results)","sha256":"21536d110f524fc5acabb42f588d302fd3558811c2c42787f86c08579c98b26f","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"text","acl":"private"},{"signature":"private.legacy_scoring_stored_source(private.analysis_scoring_inputs)","sha256":"abe9dc88974b51a20422def9f71810341e5c4fe2a7bb4e7705cd394c67f5b178","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"void","acl":"private"},{"signature":"private.legacy_scoring_ready()","sha256":"56a92f65d533a2f1b053078dbb372b1271728224e5df1c74b201b4cffb21a8d3","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifp_u16_length(text)","sha256":"d7d28a2022991977c4c7b68249fdd090745aa7f4c0450d7b12273f0e56deb087","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"integer","acl":"private"},{"signature":"private.ifp_document(text)","sha256":"8989dc6da24c12c99d1f921e1e9d24f6ec446a50cba52963b87fd8854dee0d19","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.initial_feedback_plan_ready()","sha256":"c5d8c0e8e5ac52c8b06a4fad5ea78f6fe6e42297bbbfd51cd2779243c8418b36","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.lock_analysis_stage_lease(uuid,text,integer,uuid)","sha256":"d5bf2c2c633833a174f5351275b6b09eb4c8bf945bd7c6c889eaa6ef64893883","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ai_budget_integer(numeric)","sha256":"863c4d9ec3f71c48829128a6fd0ebad472a6f1bbbab2b7ad548fc8eca4477d70","language":"sql","definer":false,"volatility":"i","strict":true,"resultType":"boolean","acl":"private"},{"signature":"private.ai_budget_cost(numeric,numeric,numeric,numeric)","sha256":"d23346e5553140981353ddf58fbce895d3fcfdf252658007250eb162fc82fbda","language":"sql","definer":false,"volatility":"i","strict":true,"resultType":"numeric","acl":"private"},{"signature":"private.ai_budget_binding_sha256(uuid,uuid,jsonb)","sha256":"d1718008235bfbcd89cc4047890b554f582ad13f57ccc518902f918704548587","language":"plpgsql","definer":false,"volatility":"i","strict":true,"resultType":"text","acl":"private"},{"signature":"private.ai_budget_request_valid(jsonb,text)","sha256":"863095c78233fd1f5b27784eb33b5329c18a2d050b6ae8327450a60663edab56","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ai_budget_blocked(uuid)","sha256":"1644f31e39c50b189a36814b0deab287a1be39300247fa6b38018b1770e61033","language":"sql","definer":false,"volatility":"v","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ai_budget_receipt(uuid,boolean,boolean)","sha256":"5df5d55af4a53305cb62d8edf4e493a6ad67304bb7af6bb3a114828fd0b5b571","language":"sql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ai_budget_denied(text)","sha256":"14932dfff0d011ee02f4b20c53e6e83250d54f22c5063a5bd1f994a5df35e41a","language":"sql","definer":false,"volatility":"i","strict":true,"resultType":"jsonb","acl":"private"},{"signature":"private.ai_budget_immutable()","sha256":"95448e43a5a6d3bdd94474aa90da6b9d7b512e61c31abcb390c08f7238742206","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"trigger","acl":"private"},{"signature":"private.ai_budget_projection_identity()","sha256":"dba0e340be6e7d29af9dfd0939ab49aa8699b702368ea2c3f23890ea3be689b6","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"trigger","acl":"private"},{"signature":"private.ai_budget_transition(uuid,uuid,jsonb,text)","sha256":"b2ee84cc0468cd21f68865bdabfca570b830b60a61ecc1f4c453c84c015f60e9","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"public.ai_budget_claim_dispatch(uuid,uuid,jsonb)","sha256":"2fee99317d5893cf734278bef8f63cd339ea66c7c2ae6364291144a1ade7381c","language":"sql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"service"},{"signature":"private.ifo_fail(text)","sha256":"ecec5dddb2a02e7c02293ca7ed1b79c36d268e1e607be94ed3f39e1419b1c446","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"void","acl":"private"},{"signature":"private.ifo_keys(jsonb,text[])","sha256":"6940ae69ece8937572426849656eb518140650367b5ecf4ec193428c3ae9e6d1","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifo_sha(text)","sha256":"e5250af925064180a23863a27e15497294527ddf301b92306095e2647b6ed52f","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"text","acl":"private"},{"signature":"private.ifo_atom(text)","sha256":"ad0c934c5bbdb99de4812af00cdcfde048c2866e8fd1ec35a0d118c2492e97ca","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"text","acl":"private"},{"signature":"private.ifo_stamp(timestamptz)","sha256":"4167f675c819dfaa75a88253c396f3822fbaf6542f7020c4558c80c8b1b8b4e0","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"text","acl":"private"},{"signature":"private.ifo_usage_valid(jsonb)","sha256":"eaad99f9a4064320c648f12452b1f9a4007d872431c21e98a7eded66b4e9018c","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifo_policy_frame(jsonb)","sha256":"accc0f61de5a9bbc7e3b9c268a5e6fb3dbe4b1920f625af1fb19a79cb6e1cca1","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"text","acl":"private"},{"signature":"private.ifo_policy_valid(jsonb)","sha256":"d07340f92efbd90a7471391ab0dd5a75272d0dc8850caf2a93b577ca37365790","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifo_selected_policy(uuid,jsonb)","sha256":"05f5e1b8e40b8d9a7388d103be47ee3693e4eacb770628873c1134042f964291","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifo_original(public.analyses)","sha256":"941b3f21158a05025aaa227f877664375fe773b58986d8258ee91c2a11bf600e","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifo_binding(jsonb,jsonb)","sha256":"3ca5c0686824de07445fcc83cf7f8291b89de0d15ef92e32a36ce7b041b69928","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifo_attempt_json(private.initial_feedback_attempts)","sha256":"922f89127ec01e82a97c4db234ecb73a5601b1774745a236d0535a0dd93a065b","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifo_operation_json(private.initial_feedback_operations)","sha256":"f541991d765916bf88eac8c8b7a6835f5c705743360a6dbccc72a153a4e57fcc","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifo_immutable()","sha256":"df4cb3de2bdddd82061d5c2e44d0afbf77dee7ed30653cd469beb292c1cf8496","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"trigger","acl":"private"},{"signature":"private.ifo_attempt_guard()","sha256":"cde43794f51052a21567059232fe446d36aedc357c32893843ef25090da5ebaf","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"trigger","acl":"private"},{"signature":"private.ifo_context(public.analyses,jsonb)","sha256":"f015f6cb94028cf2850823e67bfd1f606e66840f60fe36aed2e75f3175ada268","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)","sha256":"93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)","sha256":"335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)","sha256":"739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"public.read_initial_feedback_operation_readiness()","sha256":"8b38d923165d34fab6a4462cf9940a0447e501cc74ec657b93efc569953fe5e7","language":"plpgsql","definer":true,"volatility":"s","strict":false,"resultType":"jsonb","acl":"metadata"},{"signature":"private.initial_feedback_publication_ready()","sha256":"e3b968b748f2e67983a034885c920510566bb71c69fc3d7bc0204b7d22b005d4","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"public.read_initial_feedback_publication_readiness()","sha256":"7e0241d21256d6262014eacaf56ca1ff6c36f5efaf824aa122890b583718062a","language":"plpgsql","definer":true,"volatility":"s","strict":false,"resultType":"jsonb","acl":"metadata"},{"signature":"private.ifpub_capture_valid(jsonb,text)","sha256":"9703de29b1542fb794cb7a2bb1bda913b980e487c288525c403f23adf36be947","language":"plpgsql","definer":false,"volatility":"i","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifpub_part_matches(jsonb,jsonb,jsonb)","sha256":"7957984ccad0db909eca93277755fa9b44ed61981163b2ac3403fb39d758e1cf","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"boolean","acl":"private"},{"signature":"private.ifpub_correspondence(text,jsonb,jsonb,jsonb)","sha256":"2b29de4f739cf0fcb8afc739282c0cd4e117078acd92f8c86678cc8bba2ad958","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"void","acl":"private"},{"signature":"private.ifpub_feedback(jsonb,jsonb)","sha256":"22ce3d7df69f285d76b05972c92d9bd642da78ecf6db0426c194492d364c4099","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifpub_result_json(public.analysis_results)","sha256":"bc1b2b7e9e9bb4dd77046b07a9ec34f243686cc6a2e49bd3a81ac3d8d06a95c3","language":"sql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifpub_writer_json(public.writer_drafts)","sha256":"bc1b2b7e9e9bb4dd77046b07a9ec34f243686cc6a2e49bd3a81ac3d8d06a95c3","language":"sql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifpub_run_json(public.analysis_ai_runs)","sha256":"9dedeeb63dc7d748849fa743205e1d7623a0d393700f0864bb37eed0670a936e","language":"sql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifpub_json(private.initial_feedback_publications,boolean)","sha256":"af019c58f9aaf01c1eff4d06bf671285c244794975f03c695275190034c336d2","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"jsonb","acl":"private"},{"signature":"private.ifpub_validate_completion(jsonb,text)","sha256":"4c70441b7af5e77a72c78b20dd2a76e5d8378cefbf15a7cd416f59e36ed8f6b9","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"void","acl":"private"},{"signature":"public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)","sha256":"966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"public.read_initial_feedback(uuid,uuid)","sha256":"57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"public.export_initial_feedback_records(uuid)","sha256":"eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"jsonb","acl":"optional_service"},{"signature":"private.ifpub_immutable()","sha256":"ac30b62d67d8b6c7d375c34629d0d3c935b0547b9379dfd4ebdd9e51ac16870e","language":"plpgsql","definer":false,"volatility":"v","strict":false,"resultType":"trigger","acl":"private"},{"signature":"public.persist_qualitative_analysis(uuid,jsonb,text,integer,text,jsonb,integer,text,text,text,text,uuid,jsonb)","sha256":"2ba7d1464e2c870f9cd714b4a3d683004f00d13439e3af8f4968a22432188778","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"boolean","acl":"optional_service"},{"signature":"public.persist_partial_analysis(uuid,jsonb,text,text)","sha256":"dd10ab4f0e37a30e886ce74f4e7c42c8f0dcd3ec01b618deb0381af2238c3a9b","language":"plpgsql","definer":true,"volatility":"v","strict":false,"resultType":"boolean","acl":"optional_service"},{"signature":"private.render_initial_feedback_plan(text,jsonb)","sha256":"c8bc131aacc7f9ddd8e30dcca8f5f429e78ee84180e5dd4542254883001cedc6","language":"plpgsql","definer":false,"volatility":"s","strict":false,"resultType":"jsonb","acl":"private"}]$ifo_catalog$::jsonb;
  columns jsonb:=$ifo_columns${"initial_feedback_policies":[["version","text",true],["sha256","text",true],["descriptor","jsonb",true],["created_at","timestamp with time zone",true]],"initial_feedback_selections":[["organization_id","uuid",true],["policy_version","text",true],["policy_sha256","text",true],["enabled","boolean",true]],"initial_feedback_operations":[["operation_id","uuid",true],["analysis_id","uuid",true],["owner_id","uuid",true],["organization_id","uuid",true],["resume_id","uuid",true],["resume_version_id","uuid",true],["policy_version","text",true],["policy_sha256","text",true],["binding","jsonb",true],["binding_sha256","text",true],["attempt_limit","integer",true],["state","text",true],["publication_id","uuid",false],["created_at","timestamp with time zone",true]],"initial_feedback_attempts":[["attempt_id","uuid",true],["operation_id","uuid",true],["ordinal","integer",true],["state","text",true],["claim_lease","jsonb",false],["claimed_at","timestamp with time zone",false],["usage","jsonb",false],["error_code","text",false],["budget_attempt_id","uuid",false],["created_at","timestamp with time zone",true]],"initial_feedback_publications":[["id","uuid",true],["operation_id","uuid",true],["attempt_id","uuid",false],["analysis_id","uuid",true],["owner_id","uuid",true],["organization_id","uuid",true],["resume_id","uuid",true],["resume_version_id","uuid",true],["run_id","uuid",false],["state","text",true],["reason","text",false],["binding_sha256","text",true],["completion","jsonb",true],["completion_sha256","text",true],["publication_core","jsonb",true],["publication_sha256","text",true],["receipt","jsonb",true],["render","jsonb",false],["plan_sha256","text",false],["render_sha256","text",false],["support_sha256","text",false],["capture_sha256","text",false],["result_content_sha256","text",true],["writer_content_sha256","text",true],["run_content_sha256","text",false],["finish_lease","jsonb",true],["process_id","text",true],["request_id","text",true],["created_at","timestamp with time zone",true]]}$ifo_columns$::jsonb;
begin
  if to_regprocedure('extensions.jsonb_matches_schema(json,jsonb)') is null then return false;end if;
  if current_setting('server_encoding')<>'UTF8' or current_setting('server_version_num')::integer<150000 or service_oid is null then return false;end if;
  select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
  if owner_oid is null then return false;end if;
  for item in select value from jsonb_array_elements(manifest) loop
    select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset
      or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language')
      or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
      or p.proisstrict is distinct from (item->>'strict')::boolean or p.proconfig is distinct from array['search_path=""']
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>item->>'sha256' then return false;end if;
    if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee<>p.proowner
      and (item->>'acl'='private' or g.grantee<>service_oid or g.privilege_type<>'EXECUTE' or g.is_grantable)) then return false;end if;
    foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
    if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
    if item->>'acl' in ('service','metadata') and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
    if item->>'acl' in ('service','metadata','optional_service') and has_function_privilege('service_role',p.oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g
        where g.grantee=service_oid and g.privilege_type='EXECUTE' and not g.is_grantable) then return false;end if;
  end loop;
  if private.legacy_scoring_ready() is not true or private.initial_feedback_plan_ready() is not true then return false;end if;
  -- The called R03 factory keeps its immutable/projection guards and denied
  -- direct table access. No record/pool/opening/policy data is read here.
  foreach table_name in array array['ai_budget_policies','ai_budget_period_openings','ai_budget_pools','ai_budget_operations','ai_budget_attempts','ai_budget_events','ai_budget_reconciliation_operators'] loop
    select * into rel from pg_catalog.pg_class where oid=to_regclass('private.'||table_name);
    if not found or rel.relkind<>'r' or rel.relowner<>owner_oid or not rel.relrowsecurity then return false;end if;
    if exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) g where g.grantee<>rel.relowner)
      or exists(select 1 from pg_catalog.pg_attribute a cross join lateral aclexplode(a.attacl) g where a.attrelid=rel.oid and g.grantee<>rel.relowner) then return false;end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements($ifo_budget_triggers$[
    {"table":"private.ai_budget_policies","name":"ai_budget_policies_immutable","function":"private.ai_budget_immutable()","type":27},
    {"table":"private.ai_budget_period_openings","name":"ai_budget_openings_immutable","function":"private.ai_budget_immutable()","type":27},
    {"table":"private.ai_budget_operations","name":"ai_budget_operations_immutable","function":"private.ai_budget_immutable()","type":27},
    {"table":"private.ai_budget_events","name":"ai_budget_events_immutable","function":"private.ai_budget_immutable()","type":27},
    {"table":"private.ai_budget_pools","name":"ai_budget_pool_identity","function":"private.ai_budget_projection_identity()","type":19},
    {"table":"private.ai_budget_attempts","name":"ai_budget_attempt_identity","function":"private.ai_budget_projection_identity()","type":19}
  ]$ifo_budget_triggers$::jsonb) loop
    if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass(item->>'table') and tgname=item->>'name'
      and tgfoid=to_regprocedure(item->>'function') and tgtype=(item->>'type')::integer and not tgisinternal and tgenabled='O' and tgnargs=0 and tgqual is null) then return false;end if;
  end loop;
  for table_name,item in select key,value from jsonb_each(columns) loop
    select * into rel from pg_catalog.pg_class where oid=to_regclass('private.'||table_name);
    if not found or rel.relkind<>'r' or rel.relowner<>owner_oid or not rel.relrowsecurity then return false;end if;
    if (select count(*) from pg_catalog.pg_attribute where attrelid=rel.oid and attnum>0 and not attisdropped)<>jsonb_array_length(item) then return false;end if;
    for col in select value from jsonb_array_elements(item) loop
      if not exists(select 1 from pg_catalog.pg_attribute where attrelid=rel.oid and attname=col->>0
        and atttypid=to_regtype(col->>1) and attnotnull=(col->>2)::boolean and not attisdropped) then return false;end if;
    end loop;
    if exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) g where g.grantee<>rel.relowner)
      or exists(select 1 from pg_catalog.pg_attribute a cross join lateral aclexplode(a.attacl) g
        where a.attrelid=rel.oid and a.attnum>0 and g.grantee<>rel.relowner) then return false;end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements($ifo_keys$[{"table":"private.initial_feedback_policies","kind":"p","columns":["version","sha256"]},{"table":"private.initial_feedback_selections","kind":"p","columns":["organization_id"]},{"table":"private.initial_feedback_operations","kind":"p","columns":["operation_id"]},{"table":"private.initial_feedback_operations","kind":"u","columns":["analysis_id"]},{"table":"private.initial_feedback_attempts","kind":"p","columns":["attempt_id"]},{"table":"private.initial_feedback_attempts","kind":"u","columns":["operation_id","ordinal"]},{"table":"private.initial_feedback_publications","kind":"p","columns":["id"]},{"table":"private.initial_feedback_publications","kind":"u","columns":["operation_id"]},{"table":"private.initial_feedback_publications","kind":"u","columns":["attempt_id"]},{"table":"private.initial_feedback_publications","kind":"u","columns":["analysis_id"]},{"table":"private.initial_feedback_publications","kind":"u","columns":["run_id"]}]$ifo_keys$::jsonb) loop
    select array_agg(a.attnum::smallint order by k.ord) into attribute_numbers from jsonb_array_elements_text(item->'columns') with ordinality k(name,ord)
      join pg_catalog.pg_attribute a on a.attrelid=to_regclass(item->>'table') and a.attname=k.name;
    if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=to_regclass(item->>'table') and c.contype=item->>'kind'
      and c.conkey=attribute_numbers and c.convalidated and not c.condeferrable) then return false;end if;
  end loop;
  for item in select value from jsonb_array_elements($ifo_fks$[{"table":"private.initial_feedback_selections","columns":["organization_id"],"target":"public.organizations","targetColumns":["id"],"delete":"r"},{"table":"private.initial_feedback_selections","columns":["policy_version","policy_sha256"],"target":"private.initial_feedback_policies","targetColumns":["version","sha256"],"delete":"r"},{"table":"private.initial_feedback_operations","columns":["owner_id"],"target":"auth.users","targetColumns":["id"],"delete":"r"},{"table":"private.initial_feedback_operations","columns":["organization_id"],"target":"public.organizations","targetColumns":["id"],"delete":"r"},{"table":"private.initial_feedback_operations","columns":["policy_version","policy_sha256"],"target":"private.initial_feedback_policies","targetColumns":["version","sha256"],"delete":"r"},{"table":"private.initial_feedback_attempts","columns":["operation_id"],"target":"private.initial_feedback_operations","targetColumns":["operation_id"],"delete":"r"},{"table":"private.initial_feedback_publications","columns":["operation_id"],"target":"private.initial_feedback_operations","targetColumns":["operation_id"],"delete":"r"},{"table":"private.initial_feedback_publications","columns":["attempt_id"],"target":"private.initial_feedback_attempts","targetColumns":["attempt_id"],"delete":"r"},{"table":"private.initial_feedback_publications","columns":["analysis_id"],"target":"public.analyses","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["owner_id"],"target":"auth.users","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["organization_id"],"target":"public.organizations","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["resume_id"],"target":"public.resumes","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["resume_version_id"],"target":"public.resume_versions","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["run_id"],"target":"public.analysis_ai_runs","targetColumns":["id"],"delete":"c"},{"table":"private.initial_feedback_publications","columns":["analysis_id"],"target":"private.analysis_scoring_inputs","targetColumns":["analysis_id"],"delete":"c"}]$ifo_fks$::jsonb) loop
    select array_agg(a.attnum::smallint order by k.ord) into attribute_numbers from jsonb_array_elements_text(item->'columns') with ordinality k(name,ord)
      join pg_catalog.pg_attribute a on a.attrelid=to_regclass(item->>'table') and a.attname=k.name;
    if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=to_regclass(item->>'table') and c.contype='f' and c.convalidated
      and c.confdeltype=item->>'delete' and not c.condeferrable and c.conkey=attribute_numbers and c.confrelid=to_regclass(item->>'target')
      and c.confkey=(select array_agg(a.attnum::smallint order by k.ord) from jsonb_array_elements_text(item->'targetColumns') with ordinality k(name,ord)
        join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attname=k.name)) then return false;end if;
  end loop;
  if (select count(*) from pg_catalog.pg_constraint where conrelid in ('private.initial_feedback_policies'::regclass,'private.initial_feedback_selections'::regclass,
    'private.initial_feedback_operations'::regclass,'private.initial_feedback_attempts'::regclass,'private.initial_feedback_publications'::regclass) and contype='f')<>15 then return false;end if;
  for item in select value from jsonb_array_elements($ifo_triggers$[{"table":"private.initial_feedback_policies","name":"initial_feedback_policy_immutable","function":"private.ifo_immutable()","type":31},{"table":"private.initial_feedback_operations","name":"initial_feedback_operation_immutable","function":"private.ifo_immutable()","type":31},{"table":"private.initial_feedback_attempts","name":"initial_feedback_attempt_guard","function":"private.ifo_attempt_guard()","type":31},{"table":"private.initial_feedback_publications","name":"initial_feedback_publication_immutable","function":"private.ifpub_immutable()","type":19}]$ifo_triggers$::jsonb) loop
    if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass(item->>'table') and tgname=item->>'name'
      and tgfoid=to_regprocedure(item->>'function') and not tgisinternal and tgenabled='O' and tgtype=(item->>'type')::integer and tgnargs=0 and tgqual is null) then return false;end if;
  end loop;
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_operation_ready()');
  if not found or p.proowner<>owner_oid or p.prosecdef or p.prokind<>'f' or p.proretset or p.proisstrict or p.provolatile<>'s'
    or p.prorettype<>'boolean'::regtype or p.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee<>p.proowner) then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  -- Preserve BOTH unchanged legacy score-store guards used by the factories.
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_ai_runs'::regclass and tgname='document_evidence_no_qualitative_score'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and tgtype=23 and tgnargs=0 and tgqual is null)
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_results'::regclass and tgname='document_evidence_no_result'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and tgtype=23 and tgnargs=0 and tgqual is null) then return false;end if;
  return true;
exception when others then return false;
end;
$ifo_20$;
revoke all on function private.initial_feedback_publication_ready() from public,anon,authenticated,service_role;
revoke all on function public.read_initial_feedback_publication_readiness() from public,anon,authenticated,service_role;
revoke all on function private.ifpub_capture_valid(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_part_matches(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_correspondence(text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_feedback(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_result_json(public.analysis_results) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_writer_json(public.writer_drafts) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_run_json(public.analysis_ai_runs) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_json(private.initial_feedback_publications,boolean) from public,anon,authenticated,service_role;
revoke all on function private.ifpub_validate_completion(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_initial_feedback(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.export_initial_feedback_records(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ifo_immutable() from public,anon,authenticated,service_role;
revoke all on function private.ifo_attempt_guard() from public,anon,authenticated,service_role;
revoke all on function private.ifpub_immutable() from public,anon,authenticated,service_role;
revoke all on function public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.initial_feedback_operation_ready() from public,anon,authenticated,service_role;
grant execute on function public.read_initial_feedback_publication_readiness() to service_role;
do $ifpub_post$
declare item jsonb;
begin
 for item in select value from jsonb_array_elements($ifpub_postimages$[{"signature":"private.initial_feedback_publication_ready()","sha256":"e3b968b748f2e67983a034885c920510566bb71c69fc3d7bc0204b7d22b005d4"},{"signature":"public.read_initial_feedback_publication_readiness()","sha256":"7e0241d21256d6262014eacaf56ca1ff6c36f5efaf824aa122890b583718062a"},{"signature":"private.ifpub_capture_valid(jsonb,text)","sha256":"9703de29b1542fb794cb7a2bb1bda913b980e487c288525c403f23adf36be947"},{"signature":"private.ifpub_part_matches(jsonb,jsonb,jsonb)","sha256":"7957984ccad0db909eca93277755fa9b44ed61981163b2ac3403fb39d758e1cf"},{"signature":"private.ifpub_correspondence(text,jsonb,jsonb,jsonb)","sha256":"2b29de4f739cf0fcb8afc739282c0cd4e117078acd92f8c86678cc8bba2ad958"},{"signature":"private.ifpub_feedback(jsonb,jsonb)","sha256":"22ce3d7df69f285d76b05972c92d9bd642da78ecf6db0426c194492d364c4099"},{"signature":"private.ifpub_result_json(public.analysis_results)","sha256":"bc1b2b7e9e9bb4dd77046b07a9ec34f243686cc6a2e49bd3a81ac3d8d06a95c3"},{"signature":"private.ifpub_writer_json(public.writer_drafts)","sha256":"bc1b2b7e9e9bb4dd77046b07a9ec34f243686cc6a2e49bd3a81ac3d8d06a95c3"},{"signature":"private.ifpub_run_json(public.analysis_ai_runs)","sha256":"9dedeeb63dc7d748849fa743205e1d7623a0d393700f0864bb37eed0670a936e"},{"signature":"private.ifpub_json(private.initial_feedback_publications,boolean)","sha256":"af019c58f9aaf01c1eff4d06bf671285c244794975f03c695275190034c336d2"},{"signature":"private.ifpub_validate_completion(jsonb,text)","sha256":"4c70441b7af5e77a72c78b20dd2a76e5d8378cefbf15a7cd416f59e36ed8f6b9"},{"signature":"public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)","sha256":"966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8"},{"signature":"public.read_initial_feedback(uuid,uuid)","sha256":"57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b"},{"signature":"public.export_initial_feedback_records(uuid)","sha256":"eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd"},{"signature":"private.ifo_immutable()","sha256":"df4cb3de2bdddd82061d5c2e44d0afbf77dee7ed30653cd469beb292c1cf8496"},{"signature":"private.ifo_attempt_guard()","sha256":"cde43794f51052a21567059232fe446d36aedc357c32893843ef25090da5ebaf"},{"signature":"private.ifpub_immutable()","sha256":"ac30b62d67d8b6c7d375c34629d0d3c935b0547b9379dfd4ebdd9e51ac16870e"},{"signature":"public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)","sha256":"93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92"},{"signature":"public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)","sha256":"739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148"},{"signature":"private.initial_feedback_operation_ready()","sha256":"a88195b8cc89503549d43a9fe23f649bd9b4d9abecdad8461974f3ed9c7e1b9d"}]$ifpub_postimages$::jsonb) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256' then
   raise exception 'INITIAL_FEEDBACK_PUBLICATION_POSTIMAGE_DRIFT' using errcode='23514';end if;
 end loop;
 if private.initial_feedback_publication_ready() is not true then raise exception 'INITIAL_FEEDBACK_PUBLICATION_NOT_READY' using errcode='23514';end if;
 if has_function_privilege('service_role','public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;
 if has_function_privilege('service_role','public.read_initial_feedback(uuid,uuid)','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;
 if has_function_privilege('service_role','public.export_initial_feedback_records(uuid)','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;
 if has_function_privilege('service_role','public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;
 if has_function_privilege('service_role','public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;
end;
$ifpub_post$;
-- DIAGNOSTIC SOURCE ONLY: CHECK/default reconciliation, full shared usage,
-- account erasure/retention and activation remain mandatory external holds.
commit;
