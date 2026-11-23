-- Subtract the private fields from the saved-head object before comparing it.
begin;

do $regroup_head_repair$
declare
  target jsonb;
  dependency jsonb;
  routine pg_catalog.pg_proc%rowtype;
  definition text;
  revised_source text;
  fragment_count integer;
  direct_repair boolean;
  old_fragment constant text := $old$(current_view->'head'-array['content','envelope'])$old$;
  new_fragment constant text := $new$((current_view->'head')-array['content','envelope'])$new$;
  -- Signature, predecessor body hash, successor body hash and direct edit count.
  profiles constant jsonb := $profiles$[
    ["public.apply_canonical_entry_regroup(uuid,uuid,jsonb,text)","90f0e137e2f9bf97a5d50805c38a79184ab9ecf98823f044eb9144cae93955bc","a687fd39e85f825db3774c8e8a6639fd753540ae130f335d1ca173fd8b8a9aac",1],
    ["private.ai_budget_source_ready()","467a37df8975bb47c6d9ce0ee90ac455d7415f5376315b607a44c91c8772abe1","4ec263219e63f63d33a064d74a6d42cb380d8d4ae51f980a9c0c0f78b6d6d16f",0],
    ["private.canonical_correction_write_ready()","21abbe38e5533a9dfc220d85cf67632741b17771b04257278e9dced3ad7a59c7","ebabc64c03321a6cc6c21fb19b2a0f3c7139fe9ff4c7dde11ea0dce1eff283c3",0],
    ["private.canonical_rewrite_ready()","bbb744f300b215a0e9fdc1e9f9fa85e9c6823179b55870d9bd248590c0fd93e2","f7d09f593cb5ac544e3681b253d5946756e217d90df592a589de0baa53a2d561",0],
    ["private.canonical_rewrite_workspace_ready()","9c8921e59b3a2cdb1f0d87cb228a68466c5b4e1921ba1a537816e55438a709cb","6e14d608712a0f809a972af98174c125a928d0cea4a490f79280f9425a3c63e2",0],
    ["private.initial_feedback_ready()","bfe6fc5c91aca4d07e1cf04ce3f486e5c3a2dc57ece1d30385096f25d04f8b28","7440f70fa83d114d82dd8d987c22cefa68c943abc2ee84d991729bde0acd69ec",0],
    ["private.jd_clause_schema_ready()","4f4770c434f75e6f123c0f1f9011f4a5a9eb8e6227e8e53790b817d1445d1971","c915c4c4b8353a1846aa83feed6ef9a1a3afa87ddb106b262980304fcecbc0d7",0],
    ["private.owned_ai_disposition_ready()","0efc8936329b8aeca4462f9356d4f915fefbf2f2d5c31831a5630604da55034d","e796d58b1dcd07d7c9f97bbebe06b4a20210ead7fb249b3032bf07a5a10197fe",0],
    ["private.owned_ai_expiry_ready()","f9e0548c15976344d56a30b4283e5527a96b6d74a105dcc7126d923a05d8ec12","7ef31d4799058f5d24b2e9c39737c47c496b04590215d73dd4c8f1f652bd67f9",0],
    ["private.owned_legacy_ai_usage_ready()","e19126f2754e771fea8ce6b6310eb641d6c27e42eca223958b5d2a39d447d2c9","b5ddf1b2f084f3a15386e7ebe0ae665214bd5cf5d9a159912730ee7b7e42cd9e",0],
    ["private.typed_authoring_write_ready()","34e36ff107a7206c2ff14a8b92bde0012b0ba5e148ef7a75275babf87c2f16a0","4f4b013a9e205a44253a6eb607b840e9d792ef9b2c5d1bba53a249f2720da10b",0],
    ["public.read_canonical_entry_regroup_workspace(uuid,uuid,jsonb)","64232d5c1fb96e2345087401a3d23250d0e7557701befe3fef2085c080f05463","3ab52757245bb3fa7ffd7d7c7a91fac2209dee12ce50285c96b04d3f539d65e0",2]
  ]$profiles$::jsonb;
begin
  if private.canonical_correction_write_ready() is not true
    or private.owned_ai_disposition_ready() is not true then
    raise exception 'REGROUP_HEAD_REPAIR_PROFILE_UNAVAILABLE' using errcode='23514';
  end if;

  for target in select value from jsonb_array_elements(profiles) loop
    fragment_count:=(target->>3)::integer;
    direct_repair:=fragment_count>0;
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target->>0);
    if routine.prosecdef is distinct from direct_repair
      or routine.provolatile::text<>(case when direct_repair then 'v' else 's' end)
      or routine.prorettype<>(case when direct_repair then 'jsonb'::regtype else 'boolean'::regtype end)
      or routine.proretset or routine.proisstrict
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or routine.proconfig is distinct from array['search_path=""']
      or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or has_function_privilege('service_role',routine.oid,'EXECUTE') is distinct from (fragment_count=2)
      or encode(sha256(convert_to(routine.prosrc,'UTF8')),'hex')<>(target->>1) then
      raise exception 'REGROUP_HEAD_REPAIR_PREIMAGE_DRIFT' using errcode='23514';
    end if;

    revised_source:=routine.prosrc;
    if direct_repair then
      if length(revised_source)-length(replace(revised_source,old_fragment,''))<>fragment_count*length(old_fragment) then
        raise exception 'REGROUP_HEAD_REPAIR_POSTIMAGE_DRIFT' using errcode='23514';
      end if;
      revised_source:=replace(revised_source,old_fragment,new_fragment);
    else
      -- Only substitute fingerprints for the exact bodies repaired in this transaction.
      for dependency in select value from jsonb_array_elements(profiles) loop
        revised_source:=replace(revised_source,dependency->>1,dependency->>2);
      end loop;
    end if;
    definition:=pg_get_functiondef(routine.oid);
    if length(definition)-length(replace(definition,routine.prosrc,''))<>length(routine.prosrc)
      or encode(sha256(convert_to(revised_source,'UTF8')),'hex')<>(target->>2) then
      raise exception 'REGROUP_HEAD_REPAIR_POSTIMAGE_DRIFT' using errcode='23514';
    end if;
    execute replace(definition,routine.prosrc,revised_source);
  end loop;

  if private.canonical_correction_write_ready() is not true
    or private.owned_ai_disposition_ready() is not true then
    raise exception 'REGROUP_HEAD_REPAIR_PROFILE_UNAVAILABLE' using errcode='23514';
  end if;
end;
$regroup_head_repair$;

commit;
