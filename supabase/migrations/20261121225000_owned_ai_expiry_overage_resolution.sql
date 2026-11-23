-- Resolve the monthly overage reference without changing expiry adoption.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local search_path='';

do $expiry_overage_alias$
declare
  target record;
  changed record;
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised text;
begin
  for target in with expected(signature,volatility,before_sha,after_sha) as (values
    ('private.expire_owned_ai_disposition(uuid)','v',
      '22c4975dc834fd4dd38d5c381b03da0f87ad618b0f89cb6026d9c7d8c2d9ddc5',
      'cc9505c7d244051f66ee17779e7cae176600190c9f01d7462d68b9a455782607'),
    ('private.owned_ai_expiry_safety_ready()','s',
      'fbbda1192b32e590dd535398cba3eb938f719f0bd9af3717a3695236e331fc38',
      '3382cdab3e970d8233c00f181f7a40d9d3b88225dfeacc88d8bc8ef3a17b5281'),
    ('private.privacy_generation_ready()','s',
      'e5bcd708c111e165ff8ac9bffa1c1eb5c21d3924041a6cba6b5656cde715f59f',
      '8f5a8c0e7655e7fbafe3c2f1bcde67567594390030f7a11be0f0ba8d3ff59e17'),
    ('private.ai_budget_source_ready()','s',
      'f8e834d0615ba31c0227db15cfc61fc815ddc8ee3b0e8d3a92258c40a327ea91',
      'be25c803d2c1d750bc90a96686f29d81b24f30ae24f1f32210976f0066977aa9'),
    ('private.owned_legacy_ai_usage_ready()','s',
      '40daaa334795190b51e19778253bc89738464bfd9f7c0000e626cc488c444922',
      '2b6347b5b2d4074f8b6160921aee530a7cc96358b889ac8ad927431f19af60b7'),
    ('private.owned_ai_disposition_ready()','s',
      'de6382aa02977795b6633dd50d294d6b06efd409cc9aefd8c64b743df554c2c1',
      '7d61512ef9d22e67104082dff8b0e8962e4dc0b94cc6fb0a861d808ee1aadf0a'),
    ('private.owned_ai_retirement_ready()','s',
      '93f8feaa0aa3529395c4f4c164c2f76adfeb1009399dbacd478748af9745fefd',
      '5631ec24d56d85a557a0e2eb3e66e670eb5569cb58b90ca25031af4be9688eb3'),
    ('private.owned_ai_expiry_ready()','s',
      'a9f9474cea71fbe3853aec8c70ec214ba65f71b3a93b54b8ceb1a096edcb0c6a',
      '349d9cb9f0124fdc3b33e7498639634d5f3c66761510e1572d97bc96098436fb'),
    ('private.initial_feedback_ready()','s',
      '02966e12d9fe7e0a53ae600755db884ed29bfe7d96b6c3e2396103b9a3bef5a6',
      'cea31d4ed6e2b51a17e4fd9208bc67ae9a9647a1cb08efdc246bcba26a41dccf')
  )
  select e.*,(select jsonb_object_agg(before_sha,after_sha) from expected) as replacements
    from expected e
  loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if routine.prosecdef or routine.provolatile::text<>target.volatility
      or routine.proconfig is distinct from array['search_path=""']
      or has_function_privilege('service_role',routine.oid,'EXECUTE')
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>target.before_sha then
      raise exception 'OWNED_AI_EXPIRY_OVERAGE_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    revised:=routine.prosrc;
    if target.volatility='v' then
      revised:=replace(revised,';shared numeric;unknown_count numeric;overage numeric;',';');
      revised:=replace(revised,'sum(overage) from technical where month=m.month',
        'sum(t.overage) from technical t where t.month=m.month');
    else
      for changed in select * from jsonb_each_text(target.replacements) loop
        revised:=replace(revised,changed.key,changed.value);
      end loop;
    end if;
    definition:=pg_get_functiondef(routine.oid);
    if encode(sha256(convert_to(revised,'UTF8')),'hex')<>target.after_sha
      or (length(definition)-length(replace(definition,routine.prosrc,'')))/length(routine.prosrc)<>1 then
      raise exception 'OWNED_AI_EXPIRY_OVERAGE_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,routine.prosrc,revised);
  end loop;

  if private.owned_ai_expiry_safety_ready() is not true
    or private.owned_ai_expiry_ready() is not true
    or private.privacy_generation_ready() is not true
    or private.initial_feedback_ready() is not true
    or private.owned_ai_expiry_adoption_ready() is not false
    or has_function_privilege('service_role','public.sweep_owned_ai_expiry(integer)','EXECUTE') then
    raise exception 'OWNED_AI_EXPIRY_OVERAGE_READINESS_FAILED' using errcode='23514';
  end if;
end;
$expiry_overage_alias$;

commit;
