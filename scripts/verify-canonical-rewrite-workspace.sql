-- DEFERRED PRIVILEGED MUTATING ROLLBACK-ONLY WORKSPACE VERIFIER.
-- UNPARSED/UNEXECUTED. Requires a separately admitted direct managed synthetic
-- target, actual owned canonical/JD producers, two admitted test owners and an
-- initial analysis with NO summary writer row. Settings select fixtures; they
-- do NOT prove isolation or authorize execution. No provider, queue or scoring.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';

do $admission$
declare fixture_owner_id uuid:=nullif(current_setting('resumide.fixture_owner_id',true),'')::uuid;
  fixture_analysis_id uuid:=nullif(current_setting('resumide.fixture_analysis_id',true),'')::uuid;
  foreign_fixture_owner uuid:=nullif(current_setting('resumide.fixture_foreign_owner_id',true),'')::uuid;
  readiness jsonb;
begin
  if fixture_owner_id is null or fixture_analysis_id is null or foreign_fixture_owner is null or foreign_fixture_owner=fixture_owner_id
    or current_setting('resumide.native_fixture_allocation',true) is distinct from 'a12-workspace-owned-rollback' then raise exception 'WORKSPACE_NATIVE_ADMISSION_REQUIRED';end if;
  if not exists(select 1 from public.analyses a where a.id=fixture_analysis_id and a.owner_id=fixture_owner_id)
    or not exists(select 1 from auth.users u where u.id=foreign_fixture_owner)
    or exists(select 1 from public.writer_drafts d where d.analysis_id=fixture_analysis_id and d.kind='summary') then raise exception 'WORKSPACE_EMPTY_OWNED_FIXTURE_REQUIRED';end if;
  readiness:=public.read_canonical_rewrite_workspace_readiness();
  if readiness-'schemaReady'-'initializerExecutable' is distinct from $profile${"schemaVersion":"canonical-rewrite-workspace-readiness/1.0.0","profileVersion":"canonical-rewrite-workspace-profile/1.0.0","checkerSha256":"b5be9c0b3ddebfe557c9caaddc91d542a53f1463035af0fa0609594f558672c5","readerSha256":"c4d92e2e4e9cf666ce2ccb3ced23c61873d2f974fd61303d9f0828331a5537e3","initializerSha256":"07f71d4063e15301fe797a3eab876a6223a66350c6fa334295c9369accdf7f75","metadataSha256":"f05e249fed5e0f7852a198935780a05324505abaf182b0b6a2f22a6c3b95ccb3"}$profile$::jsonb
    or readiness->'schemaReady' is distinct from 'true'::jsonb or readiness->'initializerExecutable' is distinct from 'false'::jsonb then raise exception 'WORKSPACE_STAGED_PROFILE_REQUIRED';end if;
  if has_function_privilege('service_role','public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb)','EXECUTE') then raise exception 'WORKSPACE_INITIALIZER_ALREADY_GRANTED';end if;
end;
$admission$;

-- This temporary grant is rolled back. It is not a production activation.
grant execute on function public.initialize_canonical_rewrite_workspace(uuid,uuid,jsonb,jsonb) to service_role;

do $workspace_cases$
declare fixture_owner_id uuid:=current_setting('resumide.fixture_owner_id')::uuid;
  fixture_analysis_id uuid:=current_setting('resumide.fixture_analysis_id')::uuid;
  foreign_fixture_owner uuid:=current_setting('resumide.fixture_foreign_owner_id')::uuid;
  state_value jsonb; initialized jsonb; repeated jsonb; relationship jsonb; selection_value jsonb; policy jsonb;
  analysis_before jsonb; version_before jsonb; head_before jsonb; a public.analyses%rowtype;
  before_ops integer; before_ai integer; before_results integer; inserted_id uuid; row_before public.writer_drafts%rowtype;
  current_row public.writer_drafts%rowtype; failed boolean; stale_selection jsonb; follow_request jsonb; prepared jsonb;
begin
  select * into strict a from public.analyses where id=fixture_analysis_id and owner_id=fixture_owner_id;
  select to_jsonb(x) into analysis_before from public.analyses x where x.id=fixture_analysis_id;
  select to_jsonb(x) into version_before from public.resume_versions x where x.id=a.resume_version_id;
  select to_jsonb(x) into head_before from public.canonical_resume_heads x where x.resume_id=(select v.resume_id from public.resume_versions v where v.id=a.resume_version_id);
  select count(*) into before_ops from private.canonical_rewrite_operations where analysis_id=fixture_analysis_id;
  select count(*) into before_ai from public.analysis_ai_runs where analysis_id=fixture_analysis_id;
  select count(*) into before_results from public.analysis_results where analysis_id=fixture_analysis_id;
  policy:=jsonb_build_object('version','canonical-rewrite-rules/1.0.0','sha256','648e65d09340f4bd0b6ef36aa9c3799b883f6d41211883a238e6c222381d536f',
    'promptVersion','canonical-closed-rewrite/1.0.0','writingSupportVersion','legacy-source-transforms/1.0.4','model','synthetic-model');
  state_value:=public.read_canonical_rewrite_workspace_state(fixture_owner_id,fixture_analysis_id,jsonb_build_object('canonicalVersionId',null,'requirementVersionId',null),policy);
  if state_value->>'status' is distinct from 'initialization_required'
    or state_value ? 'context' or state_value ? 'draft' or state_value ? 'bindingSha256'
    or exists(select 1 from public.writer_drafts d where d.analysis_id=fixture_analysis_id and d.kind='summary')
    or (select count(*) from private.canonical_rewrite_operations where analysis_id=fixture_analysis_id)<>before_ops
    or (select count(*) from public.analysis_ai_runs where analysis_id=fixture_analysis_id)<>before_ai
    or (select count(*) from public.analysis_results where analysis_id=fixture_analysis_id)<>before_results
    or (select to_jsonb(x) from public.analyses x where x.id=fixture_analysis_id) is distinct from analysis_before
    or (select to_jsonb(x) from public.resume_versions x where x.id=a.resume_version_id) is distinct from version_before
    or (select to_jsonb(x) from public.canonical_resume_heads x where x.resume_id=(select v.resume_id from public.resume_versions v where v.id=a.resume_version_id)) is distinct from head_before then raise exception 'WORKSPACE_GET_WROTE_OR_FAKED_TOKENS';end if;
  relationship:=state_value->'relationshipContext';
  selection_value:=jsonb_build_object('canonicalVersionId',relationship->'canonical'->'versionId','requirementVersionId',relationship->'requirements'->'versionId');
  -- Exact, newly inserted synthetic collisions: never disable a privacy trigger
  -- or transfer an existing real row's owner to manufacture these negatives.
  insert into public.writer_drafts(analysis_id,organization_id,owner_id,kind,draft)
    values(fixture_analysis_id,a.organization_id,foreign_fixture_owner,'summary',jsonb_build_object('summary',null,'bullets','[]'::jsonb)) returning id into inserted_id;
  failed:=false;
  begin
    perform public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,selection_value,policy);
  exception when insufficient_privilege then failed:=true;end;
  if not failed or not exists(select 1 from public.writer_drafts where id=inserted_id and owner_id=foreign_fixture_owner) then raise exception 'WORKSPACE_FOREIGN_COLLISION_ADOPTED';end if;
  delete from public.writer_drafts where id=inserted_id;
  insert into public.writer_drafts(analysis_id,organization_id,owner_id,kind,draft)
    values(fixture_analysis_id,a.organization_id,fixture_owner_id,'summary','{"unexpected":true}') returning id into inserted_id;
  failed:=false;
  begin
    perform public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,selection_value,policy);
  exception when invalid_parameter_value then failed:=true;end;
  if not failed or not exists(select 1 from public.writer_drafts where id=inserted_id and draft='{"unexpected":true}'::jsonb) then raise exception 'WORKSPACE_CORRUPT_COLLISION_ADOPTED';end if;
  delete from public.writer_drafts where id=inserted_id;
  -- Real initializer starts from absence and creates only the exact empty shape.
  initialized:=public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,selection_value,policy);
  select * into strict row_before from public.writer_drafts where analysis_id=fixture_analysis_id and kind='summary';
  if initialized->'created' is distinct from 'true'::jsonb or initialized->'state'->>'status' is distinct from 'available'
    or row_before.draft is distinct from jsonb_build_object('summary',null,'bullets','[]'::jsonb)
    or initialized->'state'->'context'->'draft'->>'id' is distinct from row_before.id::text
    or (initialized->'state'->'context'->'draft'->>'updatedAt')::timestamptz is distinct from row_before.updated_at
    or initialized->'state'->'context'->'draft'->>'contentSha256' is distinct from private.typed_authoring_sha256(row_before.draft::text)
    or (select count(*) from private.canonical_rewrite_operations where analysis_id=fixture_analysis_id)<>before_ops then raise exception 'WORKSPACE_EMPTY_INITIALIZATION_NOT_REAL';end if;
  repeated:=public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,selection_value,policy);
  if repeated->'created' is distinct from 'false'::jsonb or repeated->'state' is distinct from initialized->'state'
    or (select count(*) from public.writer_drafts where analysis_id=fixture_analysis_id and kind='summary')<>1 then raise exception 'WORKSPACE_REPEAT_CHANGED_ROW';end if;
  -- Owned legacy content is synthetic setup. Initializer must preserve its exact
  -- actual bytes/time, without treating nonempty prose as supported/current.
  update public.writer_drafts set draft=jsonb_build_object('summary','Synthetic saved draft.','bullets','[]'::jsonb) where id=row_before.id returning * into row_before;
  repeated:=public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,selection_value,policy);
  select * into strict current_row from public.writer_drafts where id=row_before.id;
  if repeated->'created' is distinct from 'false'::jsonb or to_jsonb(current_row) is distinct from to_jsonb(row_before)
    or repeated->'state'->'context'->'saved'->>'state' is distinct from 'legacy_unbound' then raise exception 'WORKSPACE_EXISTING_CONTENT_CHANGED';end if;
  -- The fixture must have an actual historical parent; no fabricated UUID proves
  -- a stale-but-valid selected version or fresh-head CAS.
  relationship:=repeated->'state'->'context'->'relationshipContext';
  if jsonb_array_length(relationship->'ancestors')=0 then raise exception 'WORKSPACE_HISTORICAL_FIXTURE_REQUIRED';end if;
  stale_selection:=selection_value||jsonb_build_object('canonicalVersionId',relationship->'ancestors'->0->'versionId');failed:=false;
  begin
    perform public.initialize_canonical_rewrite_workspace(fixture_owner_id,fixture_analysis_id,stale_selection,policy);
  exception when sqlstate 'P0C01' then failed:=true;end;
  if not failed or (select to_jsonb(x) from public.writer_drafts x where x.id=row_before.id) is distinct from to_jsonb(row_before) then raise exception 'WORKSPACE_STALE_POST_CHANGED_ROW';end if;
  -- Ordinary generation PREPARATION uses actual returned tokens. This separate
  -- metadata-only follow-on is not performed by GET or the initializer; it never
  -- claims dispatch, invokes a provider or writes a scored result.
  follow_request:=jsonb_build_object('schemaVersion','canonical-rewrite-request/1.0.0','operationId',gen_random_uuid(),
    'canonicalVersionId',selection_value->'canonicalVersionId','requirementVersionId',selection_value->'requirementVersionId',
    'draftId',repeated->'state'->'context'->'draft'->'id','expectedDraftUpdatedAt',repeated->'state'->'context'->'draft'->'updatedAt');
  prepared:=public.prepare_canonical_rewrite(fixture_owner_id,fixture_analysis_id,jsonb_build_object('schemaVersion','canonical-rewrite-command/1.0.0','request',follow_request,'policy',policy),follow_request->>'operationId');
  if prepared->'operation'->'dispatchAllowed' is distinct from 'false'::jsonb or prepared->'context'->'draft' is distinct from repeated->'state'->'context'->'draft' then raise exception 'WORKSPACE_FOLLOW_ON_USED_FAKE_TOKENS';end if;
  set constraints all immediate;
end;
$workspace_cases$;
rollback;

-- REQUIRED SEPARATE CONCURRENCY PROTOCOL, NOT EXECUTED BY THE ROLLBACK FILE:
-- Use two independently bounded approved connections and another exact empty
-- synthetic analysis. A invokes initializer and holds its transaction. B invokes
-- the same current selection. After A commits ONLY that admitted fixture, B must
-- return created=false with A's exact ID/time/hash and row count must be one.
-- Verify a third call preserves nonempty saved content. Use explicit owner-role
-- calls so the default service initializer grant stays denied; a production-role
-- activation test is a separate approval. Commit/cleanup of this fixture needs its
-- own admitted packet. Two rollback sessions cannot prove this committed race.
