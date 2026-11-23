-- Repair the owner accounting export while preserving its sealed, staged ACL.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local search_path='';

do $budget_export_alias$
declare
  target record;
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised text;
  replacements jsonb;
  entry record;
begin
  for target in select * from (values
    ('public.export_owned_ai_budget_records(uuid)',true,
      '36eeb7a8e50e81d69c134bc4c9dd6c6f994543e13216c2f1c1684fb02578ba8f',
      '45adc45061a3f80ae2f5db27e8814c8c1664d0f4b6b0941b824f53aea3e22c53'),
    ('private.owned_ai_budget_export_ready()',false,
      '085fcc86926b48ae53144a43bc7cb134e6edfbc4f529b14805a387ec3a4dcf24',
      'c162ab0186bbda9079989843f0aa094d69d83a5b0e12db18b23a56ea30f42501'),
    ('private.ai_budget_source_ready()',false,
      'a969d202762622812e1daa71c058c1f6dec9fc3dd1675a5164bcf3739a9dd79d',
      '1713e0f5e126a88013087d5f54764db18c66162966fd8a6c686a9c8997d6c0be'),
    ('private.owned_ai_disposition_ready()',false,
      '914158ff3f977c115f16876d2944965d32fc0a913d72cf59b2a8b13b5dd2a517',
      'e3eb1a300b02267e26ee3a5416c99add2c2a6a77c4073f017edcec3c61a24039'),
    ('private.owned_ai_expiry_ready()',false,
      'f178a9021c27d7c5d7254672388df289f0a590fe724a1e64aa7723b231a26035',
      '3f75ffe2a427d38476ab5ec9a9138e131edc44aa4e83ed18ac1da9cebccde3ad')
  ) as expected(signature,definer,before_sha256,after_sha256) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if routine.prosecdef is distinct from target.definer or routine.provolatile<>'s'
      or routine.proconfig is distinct from array['search_path=""']
      or has_function_privilege('service_role',routine.oid,'EXECUTE')
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>target.before_sha256 then
      raise exception 'OWNED_BUDGET_EXPORT_ALIAS_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    revised:=routine.prosrc;
    if target.definer then
      revised:=replace(revised,
        'for a in select a.* from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=p_user_id order by a.operation_id,a.ordinal limit 12289 loop',
        'for a in select budget_attempt.* from private.ai_budget_attempts budget_attempt join private.ai_budget_operations budget_op on budget_op.id=budget_attempt.operation_id where budget_op.user_id=p_user_id order by budget_attempt.operation_id,budget_attempt.ordinal limit 12289 loop');
      revised:=replace(revised,
        $old$for e in select e.* from private.ai_budget_events e join private.ai_budget_attempts a on a.id=e.attempt_id
  join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=p_user_id or e.operator_id=p_user_id order by e.id limit 147457 loop$old$,
        $new$for e in select budget_event.* from private.ai_budget_events budget_event join private.ai_budget_attempts budget_attempt on budget_attempt.id=budget_event.attempt_id
  join private.ai_budget_operations budget_op on budget_op.id=budget_attempt.operation_id where budget_op.user_id=p_user_id or budget_event.operator_id=p_user_id order by budget_event.id limit 147457 loop$new$);
    else
      -- Reseal only references to the repaired routines, without changing gates.
      replacements:=$hashes$
      {
        "36eeb7a8e50e81d69c134bc4c9dd6c6f994543e13216c2f1c1684fb02578ba8f":"45adc45061a3f80ae2f5db27e8814c8c1664d0f4b6b0941b824f53aea3e22c53",
        "085fcc86926b48ae53144a43bc7cb134e6edfbc4f529b14805a387ec3a4dcf24":"c162ab0186bbda9079989843f0aa094d69d83a5b0e12db18b23a56ea30f42501",
        "a969d202762622812e1daa71c058c1f6dec9fc3dd1675a5164bcf3739a9dd79d":"1713e0f5e126a88013087d5f54764db18c66162966fd8a6c686a9c8997d6c0be",
        "914158ff3f977c115f16876d2944965d32fc0a913d72cf59b2a8b13b5dd2a517":"e3eb1a300b02267e26ee3a5416c99add2c2a6a77c4073f017edcec3c61a24039"
      }$hashes$::jsonb;
      for entry in select * from jsonb_each_text(replacements) loop
        revised:=replace(revised,entry.key,entry.value);
      end loop;
    end if;

    definition:=pg_get_functiondef(routine.oid);
    if encode(sha256(convert_to(revised,'UTF8')),'hex')<>target.after_sha256
      or (length(definition)-length(replace(definition,routine.prosrc,'')))/length(routine.prosrc)<>1 then
      raise exception 'OWNED_BUDGET_EXPORT_ALIAS_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,routine.prosrc,revised);
  end loop;

  if private.owned_ai_budget_export_ready() is not true
    or private.ai_budget_source_ready() is not true
    or private.owned_ai_disposition_ready() is not true
    or private.privacy_generation_ready() is not true then
    raise exception 'OWNED_BUDGET_EXPORT_ALIAS_READINESS_FAILED' using errcode='23514';
  end if;
end;
$budget_export_alias$;

commit;
