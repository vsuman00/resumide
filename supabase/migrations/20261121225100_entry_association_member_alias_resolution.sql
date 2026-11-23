-- Qualify the aggregate with an alias distinct from the PL/pgSQL member row.
begin;

do $entry_association_alias$
declare
  target jsonb;
  dependency jsonb;
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised_source text;
  old_fragment constant text := $before$jsonb_agg(to_jsonb(m.fact_id) order by m.entry_order) into matches,member_ids
    from public.candidate_entry_association_members m where m.group_id=g.id;$before$;
  new_fragment constant text := $after$jsonb_agg(to_jsonb(group_member.fact_id) order by group_member.entry_order) into matches,member_ids
    from public.candidate_entry_association_members group_member where group_member.group_id=g.id;$after$;
  -- Ordered signature, volatility, predecessor body hash and successor body hash.
  profiles constant jsonb := $profiles$[
    ["private.entry_association_group_active(uuid,uuid)","v","62457d48a18d8b024dbae5fe83b371ddd4ffcc5992522b7ba08f34ba1a460289","a2a47e3006b98cbeff96a8f675dedc000e21f40d25bbd7ddda84851b888b99b1"],
    ["private.ai_budget_source_ready()","s","be25c803d2c1d750bc90a96686f29d81b24f30ae24f1f32210976f0066977aa9","467a37df8975bb47c6d9ce0ee90ac455d7415f5376315b607a44c91c8772abe1"],
    ["private.canonical_correction_write_ready()","s","91f2e4b5d9fd270d3e28eba411b0c8cabd63df63ed5f9bc166f0e74e9545ae15","21abbe38e5533a9dfc220d85cf67632741b17771b04257278e9dced3ad7a59c7"],
    ["private.canonical_rewrite_ready()","s","d1162f19e9af62e19137f8e4190848193883b6f1cfe73304b667a6b4bc0aaf7e","bbb744f300b215a0e9fdc1e9f9fa85e9c6823179b55870d9bd248590c0fd93e2"],
    ["private.canonical_rewrite_workspace_ready()","s","aec0d5aa6211a8be5bebf9208be7fc1987af049dd79c53b2bc9decca7524766d","9c8921e59b3a2cdb1f0d87cb228a68466c5b4e1921ba1a537816e55438a709cb"],
    ["private.initial_feedback_ready()","s","cea31d4ed6e2b51a17e4fd9208bc67ae9a9647a1cb08efdc246bcba26a41dccf","bfe6fc5c91aca4d07e1cf04ce3f486e5c3a2dc57ece1d30385096f25d04f8b28"],
    ["private.jd_clause_schema_ready()","s","37e36791b0b93160a01d51b8e9f8cc944dab2598cfa749cf4c28c7bb35051886","4f4770c434f75e6f123c0f1f9011f4a5a9eb8e6227e8e53790b817d1445d1971"],
    ["private.owned_ai_disposition_ready()","s","7d61512ef9d22e67104082dff8b0e8962e4dc0b94cc6fb0a861d808ee1aadf0a","0efc8936329b8aeca4462f9356d4f915fefbf2f2d5c31831a5630604da55034d"],
    ["private.owned_ai_expiry_ready()","s","349d9cb9f0124fdc3b33e7498639634d5f3c66761510e1572d97bc96098436fb","f9e0548c15976344d56a30b4283e5527a96b6d74a105dcc7126d923a05d8ec12"],
    ["private.owned_legacy_ai_usage_ready()","s","2b6347b5b2d4074f8b6160921aee530a7cc96358b889ac8ad927431f19af60b7","e19126f2754e771fea8ce6b6310eb641d6c27e42eca223958b5d2a39d447d2c9"],
    ["private.typed_authoring_write_ready()","s","2de1324409533da2565df1143aef41b5e6f5e9d488dfd99491aeea1d3a19a9a0","34e36ff107a7206c2ff14a8b92bde0012b0ba5e148ef7a75275babf87c2f16a0"]
  ]$profiles$::jsonb;
begin
  if private.canonical_correction_write_ready() is not true
    or private.owned_ai_disposition_ready() is not true then
    raise exception 'ENTRY_ASSOCIATION_ALIAS_PROFILE_UNAVAILABLE' using errcode='23514';
  end if;

  for target in select value from jsonb_array_elements(profiles) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target->>0);
    if routine.prosecdef or routine.provolatile::text<>(target->>1)
      or routine.prorettype<>'boolean'::regtype or routine.proretset or routine.proisstrict
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or routine.proconfig is distinct from array['search_path=""']
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or has_function_privilege('service_role',routine.oid,'EXECUTE')
      or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>(target->>2) then
      raise exception 'ENTRY_ASSOCIATION_ALIAS_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    revised_source:=routine.prosrc;
    if target->>1='v' then
      if length(revised_source)-length(replace(revised_source,old_fragment,''))<>length(old_fragment) then
        raise exception 'ENTRY_ASSOCIATION_ALIAS_POSTIMAGE_DRIFT' using errcode='23514';
      end if;
      revised_source:=replace(revised_source,old_fragment,new_fragment);
    else
      -- Refresh only references to bodies in this exact repair. The successor hash
      -- checks the complete resulting body, including every dependent catalogue.
      for dependency in select value from jsonb_array_elements(profiles) loop
        revised_source:=replace(revised_source,dependency->>2,dependency->>3);
      end loop;
    end if;
    definition:=pg_get_functiondef(routine.oid);
    if length(definition)-length(replace(definition,routine.prosrc,''))<>length(routine.prosrc)
      or encode(sha256(convert_to(revised_source,'UTF8')),'hex')<>(target->>3) then
      raise exception 'ENTRY_ASSOCIATION_ALIAS_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,routine.prosrc,revised_source);
  end loop;

  if private.canonical_correction_write_ready() is not true
    or private.owned_ai_disposition_ready() is not true then
    raise exception 'ENTRY_ASSOCIATION_ALIAS_PROFILE_UNAVAILABLE' using errcode='23514';
  end if;
end;
$entry_association_alias$;

commit;
