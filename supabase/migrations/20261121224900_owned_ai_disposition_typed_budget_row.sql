-- Use the exact accounting row type when capturing R03 operation dispositions.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local search_path='';

do $disposition_type$
declare
  target record;
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised text;
  loop_start integer;
  budget_loop constant text:=' for x in select o.* from private.ai_budget_operations';
begin
  for target in select * from (values
    ('private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)','v',
      'dcb7f1a6e5941a2202ea8edd80cae62e240e862b3bec37bd5b2b762afe59f1d4',
      'c1614f146569d69c7be6bc31f53fef549877bc9405fc9488b82003ad0e01bddb'),
    ('private.ai_budget_source_ready()','s',
      '1713e0f5e126a88013087d5f54764db18c66162966fd8a6c686a9c8997d6c0be',
      'f8e834d0615ba31c0227db15cfc61fc815ddc8ee3b0e8d3a92258c40a327ea91'),
    ('private.owned_ai_disposition_ready()','s',
      'e3eb1a300b02267e26ee3a5416c99add2c2a6a77c4073f017edcec3c61a24039',
      'de6382aa02977795b6633dd50d294d6b06efd409cc9aefd8c64b743df554c2c1'),
    ('private.owned_ai_expiry_ready()','s',
      '3f75ffe2a427d38476ab5ec9a9138e131edc44aa4e83ed18ac1da9cebccde3ad',
      'a9f9474cea71fbe3853aec8c70ec214ba65f71b3a93b54b8ceb1a096edcb0c6a')
  ) as expected(signature,volatility,before_sha256,after_sha256) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if routine.prosecdef or routine.provolatile::text<>target.volatility
      or routine.proconfig is distinct from array['search_path=""']
      or has_function_privilege('service_role',routine.oid,'EXECUTE')
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>target.before_sha256 then
      raise exception 'OWNED_AI_DISPOSITION_TYPE_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    if target.volatility='v' then
      loop_start:=strpos(routine.prosrc,budget_loop);
      if loop_start=0 then
        raise exception 'OWNED_AI_DISPOSITION_TYPE_SOURCE_MISSING' using errcode='23514';
      end if;
      -- The A12/A13 producer projection still uses its original record.
      revised:=replace(left(routine.prosrc,loop_start-1),';x record;source_row record;',
        ';x record;budget_operation private.ai_budget_operations%rowtype;source_row record;')
        || regexp_replace(substr(routine.prosrc,loop_start),$word$\mx\M$word$,'budget_operation','g');
    else
      revised:=replace(replace(replace(routine.prosrc,
        'dcb7f1a6e5941a2202ea8edd80cae62e240e862b3bec37bd5b2b762afe59f1d4',
        'c1614f146569d69c7be6bc31f53fef549877bc9405fc9488b82003ad0e01bddb'),
        '1713e0f5e126a88013087d5f54764db18c66162966fd8a6c686a9c8997d6c0be',
        'f8e834d0615ba31c0227db15cfc61fc815ddc8ee3b0e8d3a92258c40a327ea91'),
        'e3eb1a300b02267e26ee3a5416c99add2c2a6a77c4073f017edcec3c61a24039',
        'de6382aa02977795b6633dd50d294d6b06efd409cc9aefd8c64b743df554c2c1');
    end if;

    definition:=pg_get_functiondef(routine.oid);
    if encode(sha256(convert_to(revised,'UTF8')),'hex')<>target.after_sha256
      or (length(definition)-length(replace(definition,routine.prosrc,'')))/length(routine.prosrc)<>1 then
      raise exception 'OWNED_AI_DISPOSITION_TYPE_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,routine.prosrc,revised);
  end loop;

  if private.ai_budget_source_ready() is not true
    or private.owned_ai_disposition_ready() is not true
    or private.privacy_generation_ready() is not true then
    raise exception 'OWNED_AI_DISPOSITION_TYPE_READINESS_FAILED' using errcode='23514';
  end if;
end;
$disposition_type$;

commit;
