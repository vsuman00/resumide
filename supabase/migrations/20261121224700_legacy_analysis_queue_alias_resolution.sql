-- Keep the unfenced compatibility worker callable without changing its scope.
begin;

do $legacy_alias_repair$
declare
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised_source text;
  matched text[];
  query_count integer := 0;
  revised_query text;
begin
  select * into strict routine from pg_catalog.pg_proc
    where oid='public.claim_analysis_job(text,integer)'::regprocedure;
  if not routine.prosecdef or routine.provolatile<>'v'
    or routine.proconfig is distinct from array['search_path=""']
    or not has_function_privilege('service_role',routine.oid,'EXECUTE')
    or has_function_privilege('anon',routine.oid,'EXECUTE')
    or has_function_privilege('authenticated',routine.oid,'EXECUTE')
    or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')
      <>'8ecb0f61201b0d03dc246b4a9678c56bbfcaecbc79422ec4f4976960ba525bb7' then
    raise exception 'LEGACY_ANALYSIS_QUEUE_ALIAS_PREIMAGE_DRIFT' using errcode='23514';
  end if;

  revised_source:=routine.prosrc;
  for matched in select regexp_matches(routine.prosrc,
    $pattern$select a\.id from public\.analyses a join public\.analysis_jobs j\M.*?for update of a skip locked$pattern$,
    'g') loop
    revised_query:=replace(matched[1],'public.analyses a join public.analysis_jobs j',
      'public.analyses queued_analysis join public.analysis_jobs queued_job');
    revised_query:=replace(revised_query,'for update of a skip locked','for update of queued_analysis skip locked');
    revised_query:=regexp_replace(revised_query,$pattern$\ma\.$pattern$,'queued_analysis.','g');
    revised_query:=regexp_replace(revised_query,$pattern$\mj\.$pattern$,'queued_job.','g');
    revised_source:=replace(revised_source,matched[1],revised_query);
    query_count:=query_count+1;
  end loop;

  definition:=pg_get_functiondef(routine.oid);
  if query_count<>2 or encode(sha256(convert_to(revised_source,'UTF8')),'hex')
    <>'3ba83b229394b7981604d8b5557ea7631fd25cf942b1406877af504db4369db6'
    or (length(definition)-length(replace(definition,routine.prosrc,'')))/length(routine.prosrc)<>1 then
    raise exception 'LEGACY_ANALYSIS_QUEUE_ALIAS_POSTIMAGE_DRIFT' using errcode='23514';
  end if;
  execute replace(definition,routine.prosrc,revised_source);
end;
$legacy_alias_repair$;

commit;
