-- Deferred integrity triggers can run after the service RPC has returned.
-- Keep the validator private and grant no table or routine access.
begin;

do $correction_commit_identity$
declare
  routine pg_catalog.pg_proc%rowtype;
begin
  select * into strict routine from pg_catalog.pg_proc
    where oid='private.check_correction_ledger_integrity()'::regprocedure;
  if routine.prosecdef or routine.provolatile<>'v'
    or routine.prorettype<>'trigger'::regtype or routine.proretset or routine.proisstrict
    or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or routine.proowner<>(select proowner from pg_catalog.pg_proc
      where oid='public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text)'::regprocedure)
    or routine.proconfig is distinct from array['search_path=""']
    or has_function_privilege('anon',routine.oid,'EXECUTE')
    or has_function_privilege('authenticated',routine.oid,'EXECUTE')
    or has_function_privilege('service_role',routine.oid,'EXECUTE')
    or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>
      '73ac38a37da585475a8e438c53090bca77b42a2d124b9811c4a64118d45dfd24' then
    raise exception 'CORRECTION_COMMIT_VALIDATOR_PREIMAGE_DRIFT' using errcode='23514';
  end if;

  if (select count(*) from pg_catalog.pg_trigger where tgfoid=routine.oid)<>5
    or exists (
      select 1 from (values
        ('public.candidate_correction_operations'::regclass,'correction_operations_consistent'),
        ('public.candidate_correction_assignments'::regclass,'correction_assignments_consistent'),
        ('public.candidate_correction_applications'::regclass,'correction_applications_consistent'),
        ('public.canonical_correction_snapshots'::regclass,'correction_snapshots_consistent'),
        ('public.canonical_correction_snapshot_facts'::regclass,'correction_snapshot_facts_consistent')
      ) as expected(relation, trigger_name)
      where not exists (
        select 1 from pg_catalog.pg_trigger as installed
        join pg_catalog.pg_class as relation on relation.oid=installed.tgrelid
        where installed.tgrelid=expected.relation and installed.tgname=expected.trigger_name
          and installed.tgfoid=routine.oid and relation.relowner=routine.proowner
          and installed.tgtype=5 and installed.tgenabled='O' and not installed.tgisinternal
          and installed.tgconstraint<>0 and installed.tgdeferrable and installed.tginitdeferred
          and installed.tgqual is null and installed.tgnargs=0
      )
    ) then
    raise exception 'CORRECTION_COMMIT_VALIDATOR_TRIGGER_DRIFT' using errcode='23514';
  end if;
end;
$correction_commit_identity$;

alter function private.check_correction_ledger_integrity() security definer;

commit;
