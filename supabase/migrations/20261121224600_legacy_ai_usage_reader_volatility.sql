-- Match the established readiness contract for the retained usage reader.
begin;

do $usage_reader_contract$
declare
  routine pg_catalog.pg_proc%rowtype;
begin
  select * into strict routine from pg_catalog.pg_proc
    where oid=to_regprocedure('public.get_organization_ai_tokens_used(uuid,timestamptz)');
  if not routine.prosecdef or routine.provolatile not in ('s','v')
    or routine.prorettype<>'bigint'::regtype or routine.proretset or routine.proisstrict
    or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='sql')
    or routine.proconfig is distinct from array['search_path=""']
    or not has_function_privilege('service_role',routine.oid,'EXECUTE')
    or has_function_privilege('anon',routine.oid,'EXECUTE')
    or has_function_privilege('authenticated',routine.oid,'EXECUTE')
    or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>
      '148f1822c223d95e7b6e4ffc8854e89f3699e3c61de7ac31b6b3ffeaeaa0cafc' then
    raise exception 'LEGACY_AI_USAGE_READER_PREIMAGE_DRIFT' using errcode='23514';
  end if;
end;
$usage_reader_contract$;

alter function public.get_organization_ai_tokens_used(uuid,timestamptz) volatile;

commit;
