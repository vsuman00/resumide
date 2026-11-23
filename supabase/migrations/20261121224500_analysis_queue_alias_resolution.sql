-- Repair runtime ambiguity between queue table aliases and PL/pgSQL records.
-- Reuse the installed bodies to preserve their claim, recovery, and ACL rules.
begin;

do $queue_alias_repair$
declare
  target record;
  routine pg_catalog.pg_proc%rowtype;
  source text;
  next_source text;
  definition text;
  matched text[];
  original_query text;
  revised_query text;
  query_count integer;
begin
  for target in select * from (values
    ('public.recover_terminal_analysis_jobs_v2(integer)', 1,
      '81104c34b26d9d9af1d46de63c790e896d5a3f99d94009a450f0a2b402074f3e',
      '76841c1fce63806e0a733c7693b6f641c36992cbc688a282b1fe9e139130f2d2'),
    ('public.claim_analysis_job_v2(text,integer)', 2,
      'c83dcad9cc9f523218f4fa02ec85f81ccd36d5883f9867ba658bbb7f6ea4adfb',
      '4a858e6084eb1bc76125134bbaf459bb69ab459527196a20295df82b647c0d8d')
  ) as expected(signature, queries, before_sha256, after_sha256) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    source:=routine.prosrc;
    if not routine.prosecdef or routine.provolatile<>'v'
      or routine.proconfig is distinct from array['search_path=""']
      or not has_function_privilege('service_role',routine.oid,'EXECUTE')
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or encode(sha256(convert_to(source,'UTF8')),'hex')<>target.before_sha256 then
      raise exception 'ANALYSIS_QUEUE_ALIAS_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    next_source:=source;
    query_count:=0;
    for matched in select regexp_matches(source,
      $pattern$    select a\.id from public\.analyses a join public\.analysis_jobs j\M.*?for update of a skip locked$pattern$,
      'g') loop
      original_query:=matched[1];
      revised_query:=replace(original_query,'public.analyses a join public.analysis_jobs j',
        'public.analyses queued_analysis join public.analysis_jobs queued_job');
      revised_query:=replace(revised_query,'for update of a skip locked','for update of queued_analysis skip locked');
      revised_query:=regexp_replace(revised_query,$pattern$\ma\.$pattern$,'queued_analysis.','g');
      revised_query:=regexp_replace(revised_query,$pattern$\mj\.$pattern$,'queued_job.','g');
      next_source:=replace(next_source,original_query,revised_query);
      query_count:=query_count+1;
    end loop;

    definition:=pg_get_functiondef(routine.oid);
    if query_count<>target.queries or encode(sha256(convert_to(next_source,'UTF8')),'hex')<>target.after_sha256
      or (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then
      raise exception 'ANALYSIS_QUEUE_ALIAS_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,source,next_source);
  end loop;
end;
$queue_alias_repair$;

commit;
