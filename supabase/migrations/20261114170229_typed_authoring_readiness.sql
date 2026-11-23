-- A11 readiness source and fresh legacy bypass closure. No writer activation.
-- SQL is a deferred source artifact until an explicitly admitted native target.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

-- Verify every known predecessor and every exact textual postimage before DDL.
-- The canonical base138 body changes ONLY its legacy-writer SHA literal.
do $typed_readiness_patch$
declare item jsonb; patch jsonb; routine pg_catalog.pg_proc%rowtype; source text; next_source text;
  definition text; prepared text[]:='{}'; statement text; role_name text;
  manifest jsonb:=$typed_patches$[
  {
    "signature": "public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2",
    "newSha256": "d4caf737e5814882f8ada7199ff99048d6f87fdc78b568a5be0d2d9e961f6416",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "serviceExecute": true,
    "patches": [
      {
        "old": "  prior public.authoring_events%rowtype; old_fact jsonb;",
        "new": "  current_requirements public.job_requirement_versions%rowtype;\n  prior public.authoring_events%rowtype; old_fact jsonb;"
      },
      {
        "old": "    return prior.result||jsonb_build_object('idempotent',true); end if;\n  select v.* into head",
        "new": "    return prior.result||jsonb_build_object('idempotent',true); end if;\n  -- Fresh legacy proposals may not bypass the typed protocol. Exact prior replay\n  -- and the existing owner/privacy admission remain above this branch.\n  if action_value in ('accept','reject') then\n    perform 1 from public.analyses current_analysis where current_analysis.id=a.id\n      and current_analysis.owner_id=p_user_id and current_analysis.organization_id=a.organization_id\n      and current_analysis.resume_version_id=a.resume_version_id\n      and current_analysis.job_id is not distinct from a.job_id for share;\n    if not found then return jsonb_build_object('status','conflict'); end if;\n    if a.job_id is not null then\n      perform 1 from public.jobs current_job where current_job.id=a.job_id\n        and current_job.owner_id=p_user_id and current_job.organization_id=a.organization_id for share;\n      if not found then return jsonb_build_object('status','unavailable'); end if;\n    end if;\n    select * into current_requirements from public.job_requirement_versions\n      where analysis_id=a.id and owner_id=p_user_id and organization_id=a.organization_id\n      order by revision desc limit 1 for share;\n    if found and (current_requirements.job_id is distinct from a.job_id\n      or current_requirements.content->>'schemaVersion' is distinct from 'requirements/1.0.0') then\n      return jsonb_build_object('status','unavailable');\n    end if;\n  end if;\n  select v.* into head"
      }
    ]
  },
  {
    "signature": "private.canonical_correction_write_ready()",
    "sha256": "f88516e99f6ee34120dc66217eea3191486ff0083d9053615e14cd925cdec999",
    "newSha256": "0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428",
    "definer": false,
    "volatility": "s",
    "resultType": "boolean",
    "serviceExecute": false,
    "patches": [
      {
        "old": "b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2",
        "new": "d4caf737e5814882f8ada7199ff99048d6f87fdc78b568a5be0d2d9e961f6416"
      }
    ]
  },
  {
    "signature": "public.apply_typed_authoring_action(uuid,uuid,jsonb,text)",
    "sha256": "57af4c1e2e29ca909e586609b253786e48bdbe719eba6e3479ca3befc4779c21",
    "newSha256": "7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "serviceExecute": false,
    "patches": [
      {
        "old": "if private.canonical_correction_write_ready() is not true then perform private.correction_fail('unavailable'); end if;",
        "new": "if private.typed_authoring_write_ready() is not true then perform private.correction_fail('unavailable'); end if;"
      }
    ]
  }
]$typed_patches$::jsonb;
begin
  for item in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or routine.prokind<>'f' or routine.proretset or routine.proisstrict
      or routine.prorettype<>to_regtype(item->>'resultType') or routine.prosecdef is distinct from (item->>'definer')::boolean
      or routine.provolatile<>item->>'volatility' or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or routine.proconfig is distinct from array['search_path=""']
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>item->>'sha256' then
      raise exception 'TYPED_READINESS_PREDECESSOR_DRIFT' using errcode='23514'; end if;
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
      where acl.grantee<>routine.proowner and (acl.grantee<>(select oid from pg_catalog.pg_roles where rolname='service_role')
        or acl.privilege_type<>'EXECUTE' or acl.is_grantable or (item->>'serviceExecute')::boolean is not true)) then
      raise exception 'TYPED_READINESS_GRANT_DRIFT' using errcode='42501'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from (role_name='service_role' and (item->>'serviceExecute')::boolean) then
        raise exception 'TYPED_READINESS_GRANT_DRIFT' using errcode='42501'; end if;
    end loop;
    source:=routine.prosrc; next_source:=source;
    for patch in select value from jsonb_array_elements(item->'patches') loop
      if (length(next_source)-length(replace(next_source,patch->>'old','')))/length(patch->>'old')<>1 then
        raise exception 'TYPED_READINESS_PATCH_DRIFT' using errcode='23514'; end if;
      next_source:=replace(next_source,patch->>'old',patch->>'new');
    end loop;
    if encode(extensions.digest(convert_to(next_source,'UTF8'),'sha256'),'hex')<>item->>'newSha256' then
      raise exception 'TYPED_READINESS_POSTIMAGE_DRIFT' using errcode='23514'; end if;
    definition:=pg_get_functiondef(routine.oid);
    if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then
      raise exception 'TYPED_READINESS_DEFINITION_DRIFT' using errcode='23514'; end if;
    prepared:=array_append(prepared,replace(definition,source,next_source));
  end loop;
  foreach statement in array prepared loop execute statement; end loop;
end;
$typed_readiness_patch$;

create function public.read_typed_authoring_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $typed_read$
declare canonical_oid oid:=to_regprocedure('private.canonical_correction_write_ready()');
  typed_oid oid:=to_regprocedure('private.typed_authoring_write_ready()');
  writer_oid oid:=to_regprocedure('public.apply_typed_authoring_action(uuid,uuid,jsonb,text)');
  reader_oid oid:=to_regprocedure('public.read_typed_authoring_readiness()');
begin
  return jsonb_build_object(
    'schemaVersion','typed-authoring-readiness/1.0.0',
    'profileVersion','typed-authoring-readiness-profile/1.0.0',
    'schemaReady',private.typed_authoring_write_ready(),
    -- This is effective EXECUTE for the service role, never current_user (the definer).
    'writerExecutable',coalesce(has_function_privilege('service_role',writer_oid,'EXECUTE'),false),
    'canonicalReadinessSha256',(select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc where oid=canonical_oid),
    'typedReadinessSha256',(select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc where oid=typed_oid),
    'writerSha256',(select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc where oid=writer_oid),
    'readerSha256',(select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc where oid=reader_oid));
end;
$typed_read$;

create function private.typed_authoring_write_ready() returns boolean
language plpgsql stable security invoker set search_path='' as $typed_ready$
declare canonical_routine pg_catalog.pg_proc%rowtype; routine pg_catalog.pg_proc%rowtype;
  target jsonb; role_name text; service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');
  manifest jsonb:=$typed_catalog$[
  {
    "signature": "private.typed_authoring_sha256(text)",
    "sha256": "6f6bcd17a64de775ab50c2381a933dcc4a02b1b9057bcd849c759ddb0648d727",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": true,
    "language": "sql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_atoms_sha256(text[])",
    "sha256": "3b2add63d500b44b63c290b36e801aea2ae21c2c8129c16a5ef9479f4abbfc7f",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_replacement(text,jsonb)",
    "sha256": "ca44ce165cf2c4ff3f2b4eee6b432109935634ae9e218dc95cc2fe3c95167eb2",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_uuid(jsonb)",
    "sha256": "a78cd8517907f514c7126f5a0b348712cefa6d54b8f1f261787370c8843e5f63",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_validate(jsonb)",
    "sha256": "f6926fe07ebe884795e9d85dca5b5009ac8487189cf532b52d3f52ba8cff75ed",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_atoms(jsonb)",
    "sha256": "44d4a28fff9c84e5083f6d4c5cdb4cb03ded70c17bd35030f3074461a09bfbd7",
    "definer": false,
    "volatility": "i",
    "resultType": "text[]",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid)",
    "sha256": "8827d407fd816ecff41c289123d6aa99a83f2339089bf926e6ad86c77ee351ff",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.typed_authoring_support(jsonb,jsonb,text)",
    "sha256": "ee790136a5d0e7cc6caac8f678e0e1c43cada142a92ce876dce543dc796b7600",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "public.apply_typed_authoring_action(uuid,uuid,jsonb,text)",
    "sha256": "7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_typed_authoring_readiness()",
    "sha256": "c70e1e3b07abff4a5f805c3db62643049edfc2a1214aebc5b423ca601a41d072",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "acl": "service_only"
  }
]$typed_catalog$::jsonb;
begin
  select * into canonical_routine from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_correction_write_ready()');
  if not found or canonical_routine.prokind<>'f' or canonical_routine.proretset or canonical_routine.prosecdef
    or canonical_routine.provolatile<>'s' or canonical_routine.prorettype<>'boolean'::regtype or canonical_routine.proisstrict
    or canonical_routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or canonical_routine.proconfig is distinct from array['search_path=""']
    or encode(extensions.digest(convert_to(canonical_routine.prosrc,'UTF8'),'sha256'),'hex')<>'0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428'
    or exists(select 1 from aclexplode(coalesce(canonical_routine.proacl,acldefault('f',canonical_routine.proowner))) acl where acl.grantee<>canonical_routine.proowner)
    or canonical_routine.proowner in (select oid from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')) then return false; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,canonical_routine.oid,'EXECUTE') then return false; end if;
  end loop;
  -- Independent finite extension: base138 remains intact; no new grant is needed
  -- for its checks. This helper is externally pinned, never recursively self-hashed.
  if private.canonical_correction_write_ready() is not true then return false; end if;
  for target in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target->>'signature');
    if not found or routine.prokind<>'f' or routine.proretset or routine.proowner<>canonical_routine.proowner
      or routine.prorettype<>to_regtype(target->>'resultType') or routine.prosecdef is distinct from (target->>'definer')::boolean
      or routine.provolatile<>target->>'volatility' or routine.proisstrict is distinct from (target->>'strict')::boolean
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname=target->>'language')
      or routine.proconfig is distinct from array['search_path=""']
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>target->>'sha256' then return false; end if;
    -- Only the owner, and a direct non-grantable service EXECUTE where admitted.
    -- PUBLIC, arbitrary roles, inherited service permission and grant options fail.
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
      where acl.grantee<>routine.proowner and (acl.grantee<>service_oid or acl.privilege_type<>'EXECUTE'
        or acl.is_grantable or target->>'acl'='owner_only')) then return false; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') then return false; end if;
    end loop;
    if has_function_privilege('service_role',routine.oid,'EXECUTE') is distinct from
      exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
        where acl.grantee=service_oid and acl.privilege_type='EXECUTE' and not acl.is_grantable) then return false; end if;
    if target->>'acl'='service_only' and not has_function_privilege('service_role',routine.oid,'EXECUTE') then return false; end if;
  end loop;
  select * into routine from pg_catalog.pg_proc where oid=to_regprocedure('private.typed_authoring_write_ready()');
  if not found or routine.proowner<>canonical_routine.proowner or routine.prokind<>'f' or routine.proretset or routine.prosecdef
    or routine.provolatile<>'s' or routine.prorettype<>'boolean'::regtype or routine.proisstrict
    or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or routine.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee<>routine.proowner) then return false; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,routine.oid,'EXECUTE') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$typed_ready$;

revoke all on function private.typed_authoring_write_ready() from public,anon,authenticated,service_role;
revoke all on function public.read_typed_authoring_readiness() from public,anon,authenticated,service_role;
grant execute on function public.read_typed_authoring_readiness() to service_role;
-- No mutation grant is introduced, even though integrity permits a separately
-- approved future direct service grant without pretending that grant is approval.
revoke all on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
-- Unknown default or inherited grants abort rather than exposing the new reader.
do $typed_readiness_acl$
declare target record; routine pg_catalog.pg_proc%rowtype; role_name text;
  owner_oid oid:=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_correction_write_ready()'));
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');
begin
  for target in select * from (values
    ('private.typed_authoring_write_ready()','f1f32624c906897a7a7a65e6d91fb70bf7ff0ec6986161820309a39138326b8d',false),
    ('public.read_typed_authoring_readiness()','c70e1e3b07abff4a5f805c3db62643049edfc2a1214aebc5b423ca601a41d072',true),
    ('public.apply_typed_authoring_action(uuid,uuid,jsonb,text)','7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387',false)
  ) v(signature,sha256,service_execute) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if routine.proowner is distinct from owner_oid
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>target.sha256
      or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
        where acl.grantee<>routine.proowner and (not target.service_execute or acl.grantee<>service_oid
          or acl.privilege_type<>'EXECUTE' or acl.is_grantable)) then
      raise exception 'TYPED_READINESS_UNEXPECTED_GRANT' using errcode='42501'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from (role_name='service_role' and target.service_execute) then
        raise exception 'TYPED_READINESS_UNEXPECTED_GRANT' using errcode='42501'; end if;
    end loop;
  end loop;
end;
$typed_readiness_acl$;
commit;
