-- Explicit A12 workspace bootstrap source. No native execution or activation.
-- Read does not create rows. Only a separately admitted POST may initialize one
-- empty legacy-compatible projection; existing content/timestamps stay intact.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create function public.read_canonical_rewrite_workspace_state(p_user_id uuid,p_analysis_id uuid,p_selection jsonb,p_policy jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $workspace_read$
declare a public.analyses%rowtype; draft_row public.writer_drafts%rowtype;
  context_value jsonb; relationship jsonb; readiness jsonb;
begin
  perform private.canonical_rewrite_policy(p_policy);
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  readiness:=public.read_canonical_rewrite_workspace_readiness();
  if readiness->'schemaReady' is distinct from 'true'::jsonb then perform private.correction_fail('unavailable');end if;
  -- Select by the actual UNIQUE key, not owner-filtered absence. A foreign or
  -- corrupt conflicting row must never be relabelled initialization_required.
  select * into draft_row from public.writer_drafts where analysis_id=p_analysis_id and kind='summary';
  if found then
    if (draft_row.owner_id,draft_row.organization_id) is distinct from (p_user_id,a.organization_id) then perform private.correction_fail('not_found');end if;
    perform private.canonical_rewrite_projection(draft_row.draft);
    -- Existing reader performs its real RR/source proof and returns actual
    -- ID/time/native hashes. No exception is converted into a missing state.
    context_value:=public.read_canonical_rewrite_context(p_user_id,p_analysis_id,p_selection,p_policy);
    if context_value->>'status' is distinct from 'available' then perform private.correction_fail('unavailable');end if;
    return jsonb_build_object('schemaVersion','canonical-rewrite-workspace-state/1.0.0','status','available','context',context_value,'readiness',readiness);
  end if;
  relationship:=public.read_requirement_relationship_context(p_user_id,p_analysis_id,p_selection);
  if relationship->>'status' is distinct from 'available'
    or (relationship->'source'->>'ownerId',relationship->'source'->>'organizationId',relationship->'source'->>'analysisId',relationship->'source'->>'sourceId')
      is distinct from (p_user_id::text,a.organization_id::text,p_analysis_id::text,a.resume_version_id::text) then perform private.correction_fail('unavailable');end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-workspace-state/1.0.0','status','initialization_required','relationshipContext',relationship,'readiness',readiness);
end;
$workspace_read$;

create function public.initialize_canonical_rewrite_workspace(p_user_id uuid,p_analysis_id uuid,p_selection jsonb,p_policy jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $workspace_initialize$
declare initial_state jsonb; actual_state jsonb; relationship jsonb; inserted_row public.writer_drafts%rowtype; created_value boolean;
begin
  if private.grouped_import_keys(p_selection,array['canonicalVersionId','requirementVersionId']) is not true
    or private.typed_authoring_uuid(p_selection->'canonicalVersionId') is not true
    or private.typed_authoring_uuid(p_selection->'requirementVersionId') is not true then perform private.correction_fail('invalid');end if;
  -- This call takes the common owner mutex before analysis/source rows, applies
  -- fresh R19 privacy/current membership admission, and proves the actual RR.
  initial_state:=public.read_canonical_rewrite_workspace_state(p_user_id,p_analysis_id,p_selection,p_policy);
  if initial_state->>'status'='available' then relationship:=initial_state->'context'->'relationshipContext';
  elsif initial_state->>'status'='initialization_required' then relationship:=initial_state->'relationshipContext';
  else perform private.correction_fail('unavailable');end if;
  -- Fresh POSTs always bind exact current UUIDs, even when a row already exists.
  -- Existing/historical GET remains a read; it is not initialization authority.
  if relationship->'canonical'->'versionId' is distinct from p_selection->'canonicalVersionId'
    or relationship->'requirements'->'versionId' is distinct from p_selection->'requirementVersionId'
    or relationship->'heads'->'canonicalHeadId' is distinct from p_selection->'canonicalVersionId'
    or relationship->'heads'->'requirementHeadId' is distinct from p_selection->'requirementVersionId'
    or relationship->'canonical'->'revision' is distinct from relationship->'heads'->'canonicalHeadRevision'
    or relationship->'requirements'->'revision' is distinct from relationship->'heads'->'requirementHeadRevision' then perform private.correction_fail('conflict');end if;
  if initial_state->>'status'='available' then
    return jsonb_build_object('schemaVersion','canonical-rewrite-workspace-initialization/1.0.0','created',false,'state',initial_state);
  end if;
  insert into public.writer_drafts(analysis_id,organization_id,owner_id,kind,draft)
    values(p_analysis_id,(relationship->'source'->>'organizationId')::uuid,p_user_id,'summary',jsonb_build_object('summary',null,'bullets','[]'::jsonb))
    on conflict(analysis_id,kind) do nothing returning * into inserted_row;
  created_value:=found;
  -- A concurrent legacy insertion is adopted only after its actual owned row
  -- and projection are validated. Never update a conflicting row or timestamp.
  actual_state:=public.read_canonical_rewrite_workspace_state(p_user_id,p_analysis_id,p_selection,p_policy);
  if actual_state->>'status' is distinct from 'available' then perform private.correction_fail('unavailable');end if;
  if created_value and (actual_state->'context'->'draft'->>'id' is distinct from inserted_row.id::text
    or (actual_state->'context'->'draft'->>'updatedAt')::timestamptz is distinct from inserted_row.updated_at
    or actual_state->'context'->'draft'->>'contentSha256' is distinct from private.typed_authoring_sha256(inserted_row.draft::text)) then perform private.correction_fail('conflict');end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-workspace-initialization/1.0.0','created',created_value,'state',actual_state);
end;
$workspace_initialize$;

create function public.read_canonical_rewrite_workspace_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $workspace_metadata$
begin
  return jsonb_build_object('schemaVersion','canonical-rewrite-workspace-readiness/1.0.0','profileVersion','canonical-rewrite-workspace-profile/1.0.0',
    'schemaReady',private.canonical_rewrite_workspace_ready(),
    'initializerExecutable',has_function_privilege('service_role',to_regprocedure('public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)'),'EXECUTE'),
    'checkerSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_rewrite_workspace_ready()')),
    'readerSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_canonical_rewrite_workspace_state(uuid,uuid,jsonb,jsonb)')),
    'initializerSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)')),
    'metadataSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_canonical_rewrite_workspace_readiness()')));
end;
$workspace_metadata$;


create function private.canonical_rewrite_workspace_ready() returns boolean
language plpgsql stable set search_path='' as $workspace_ready$
declare predecessor pg_catalog.pg_proc%rowtype; routine pg_catalog.pg_proc%rowtype; target jsonb;
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role'); role_name text;
  relation pg_catalog.pg_class%rowtype; manifest jsonb:=$workspace_catalog$[
  {
    "signature": "public.read_canonical_rewrite_workspace_state(uuid,uuid,jsonb,jsonb)",
    "sha256": "c4d92e2e4e9cf666ce2ccb3ced23c61873d2f974fd61303d9f0828331a5537e3",
    "resultType": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "volatility": "v",
    "acl": "service_only"
  },
  {
    "signature": "public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)",
    "sha256": "07f71d4063e15301fe797a3eab876a6223a66350c6fa334295c9369accdf7f75",
    "resultType": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "volatility": "v",
    "acl": "optional_service"
  },
  {
    "signature": "public.read_canonical_rewrite_workspace_readiness()",
    "sha256": "f05e249fed5e0f7852a198935780a05324505abaf182b0b6a2f22a6c3b95ccb3",
    "resultType": "jsonb",
    "language": "plpgsql",
    "definer": true,
    "volatility": "s",
    "acl": "service_only"
  }
]$workspace_catalog$::jsonb;
begin
  select * into predecessor from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_rewrite_ready()');
  if not found or predecessor.prokind<>'f' or predecessor.proretset or predecessor.proisstrict or predecessor.prosecdef
    or predecessor.provolatile<>'s' or predecessor.prorettype<>'boolean'::regtype
    or predecessor.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or predecessor.proconfig is distinct from array['search_path=""']
    or private.typed_authoring_sha256(predecessor.prosrc)<>'e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b'
    or exists(select 1 from aclexplode(coalesce(predecessor.proacl,acldefault('f',predecessor.proowner))) a where a.grantee<>predecessor.proowner)
    or private.canonical_rewrite_ready() is not true then return false;end if;
  for target in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target->>'signature');
    if not found or routine.prokind<>'f' or routine.proretset or routine.proisstrict or routine.proowner<>predecessor.proowner
      or routine.prorettype<>to_regtype(target->>'resultType') or routine.prolang<>(select oid from pg_catalog.pg_language where lanname=target->>'language')
      or routine.prosecdef is distinct from (target->>'definer')::boolean or routine.provolatile<>target->>'volatility'
      or routine.proconfig is distinct from array['search_path=""'] or private.typed_authoring_sha256(routine.prosrc)<>target->>'sha256' then return false;end if;
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a
      where a.grantee<>routine.proowner and (a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') then return false;end if;
    end loop;
    if target->>'acl'='service_only' and (not has_function_privilege('service_role',routine.oid,'EXECUTE')
      or not exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a where a.grantee=service_oid and a.privilege_type='EXECUTE' and not a.is_grantable)) then return false;end if;
    if target->>'acl'='optional_service' and has_function_privilege('service_role',routine.oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a where a.grantee=service_oid and a.privilege_type='EXECUTE' and not a.is_grantable) then return false;end if;
  end loop;
  select * into relation from pg_catalog.pg_class where oid='public.writer_drafts'::regclass;
  if not found or relation.relkind<>'r' or not relation.relrowsecurity then return false;end if;
  if exists(select 1 from (values('id','uuid'),('analysis_id','uuid'),('organization_id','uuid'),('owner_id','uuid'),
    ('kind','text'),('draft','jsonb'),('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')) expected(name,type_name)
    where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=relation.oid and a.attname=expected.name and a.atttypid=to_regtype(expected.type_name) and a.attnotnull and not a.attisdropped and a.attnum>0)) then return false;end if;
  if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=relation.oid and c.contype='u' and c.convalidated
    and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['analysis_id','kind']) then return false;end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=relation.oid and tgname='zz_candidate_privacy_write' and not tgisinternal and tgenabled='O'
    and tgfoid=to_regprocedure('private.guard_candidate_privacy_write()') and tgtype=23 and tgnargs=1 and tgargs=convert_to('owner_id','UTF8')||decode('00','hex') and tgqual is null) then return false;end if;
  select * into routine from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_rewrite_workspace_ready()');
  if not found or routine.prokind<>'f' or routine.proretset or routine.proisstrict or routine.prorettype<>'boolean'::regtype
    or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or routine.proowner<>predecessor.proowner or routine.prosecdef or routine.provolatile<>'s'
    or routine.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a where a.grantee<>routine.proowner) then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,routine.oid,'EXECUTE') then return false;end if;
  end loop;
  return true;
exception when others then return false;
end;
$workspace_ready$;

revoke all on function public.read_canonical_rewrite_workspace_state(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_canonical_rewrite_workspace_readiness() from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_workspace_ready() from public,anon,authenticated,service_role;
grant execute on function public.read_canonical_rewrite_workspace_state(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.read_canonical_rewrite_workspace_readiness() to service_role;

-- Initializer remains denied; no old profile or mutation grant is changed.
commit;
