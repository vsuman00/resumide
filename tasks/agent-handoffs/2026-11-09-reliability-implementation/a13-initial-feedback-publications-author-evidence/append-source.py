from pathlib import Path
import json
w=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats')
p=w/'supabase/migrations/20261115081345_initial_feedback_publications.sql'
schema=json.loads(Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-publications-035socqv/capture-schema.json').read_text())
schema.pop('$schema',None)
s='''
-- Strict frozen Node capture shape. Its rejected decisions remain recorded
-- observations; only retained rendered parts are independently reconstructed.
create function private.ifpub_capture_valid(p_capture jsonb,p_source_sha text) returns boolean
language plpgsql immutable set search_path='' as $ifpub_capture$
declare item jsonb;
begin
 if p_capture is null or p_capture='null'::jsonb then return true;end if;
 if octet_length(convert_to(p_capture::text,'UTF8'))>262144
  or extensions.jsonb_matches_schema($capture_schema$SCHEMA$capture_schema$::json,p_capture) is not true then return false;end if;
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
 if (summary<>'null'::jsonb) is distinct from (observed_summary->>'state'='supported') then
  -- NULL observation has no supported summary.
  if not(summary='null'::jsonb and (observed_summary='null'::jsonb or observed_summary->>'state'<>'supported')) then perform private.ifo_fail('invalid');end if;
 end if;
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
'''.replace('SCHEMA',json.dumps(schema,separators=(',',':')))
with p.open('a') as f:f.write(s)
