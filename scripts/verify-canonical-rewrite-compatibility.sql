-- DEFERRED PRIVILEGED MUTATING SYNTHETIC VERIFIER. UNPARSED/UNEXECUTED.
-- Requires separate exact managed-target/fixture/role/cleanup admission. These
-- settings select owned fixtures; they do not prove isolation or authorize use.
-- Keep all original legacy scoring/evidence triggers installed and enabled.
-- No provider, global queue, new real data or permanent writer activation.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';

do $admission$
declare fixture_owner_id uuid:=nullif(current_setting('resumide.fixture_owner_id',true),'')::uuid;
  fixture_analysis_id uuid:=nullif(current_setting('resumide.fixture_analysis_id',true),'')::uuid;
  ready jsonb; signature text;
begin
  if fixture_owner_id is null or fixture_analysis_id is null
    or current_setting('resumide.native_fixture_allocation',true) is distinct from 'a12-compatibility-owned-rollback' then
    raise exception 'A12_COMPATIBILITY_FIXTURE_ADMISSION_REQUIRED';end if;
  if not exists(select 1 from public.analyses a where a.id=fixture_analysis_id and a.owner_id=fixture_owner_id)
    or not exists(select 1 from public.document_evidence_attempts e where e.analysis_id=fixture_analysis_id and e.owner_id=fixture_owner_id)
    or private.candidate_write_blocked(fixture_owner_id) then raise exception 'A12_OWNED_EVIDENCE_FIXTURE_REQUIRED';end if;
  ready:=public.read_canonical_rewrite_readiness();
  if ready-'schemaReady'-'mutatorsExecutable' is distinct from $profile${"schemaVersion":"canonical-rewrite-readiness/1.0.0","profileVersion":"canonical-rewrite-readiness-profile/1.0.1","checkerSha256":"e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b","readerSha256":"fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707","prepareSha256":"3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9","claimSha256":"d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6","finishSha256":"cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828","settleSha256":"7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28","usageSha256":"e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca"}$profile$::jsonb
    or ready->'schemaReady' is distinct from 'true'::jsonb or ready->'mutatorsExecutable' is distinct from 'false'::jsonb then raise exception 'A12_COMPATIBILITY_PROFILE_REQUIRED';end if;
  if (select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.block_unreviewed_evidence_scores()'))
    is distinct from '094fbfee09e0d22c482be9a835ac8fd30ba1390f798d06623ce3e0989f1f78e6'
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_ai_runs'::regclass
      and tgname='document_evidence_no_qualitative_score' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and not tgisinternal and tgenabled='O') then
    raise exception 'A12_LEGACY_GUARD_DRIFT';end if;
  foreach signature in array array['public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)',
    'public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)',
    'public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)',
    'public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)'] loop
    if has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE') then raise exception 'A12_WRITER_ALREADY_ACTIVATED';end if;
  end loop;
  if not has_function_privilege('service_role','public.read_canonical_rewrite_usage(uuid,uuid)','EXECUTE') then raise exception 'A12_USAGE_READER_DENIED';end if;
end;
$admission$;

-- Temporary grants only inside this separately approved rollback exercise.
grant execute on function public.prepare_canonical_rewrite(uuid,uuid,jsonb,text),
  public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb),
  public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text),
  public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text) to service_role;

do $compatibility_cases$
declare fixture_owner_id uuid:=current_setting('resumide.fixture_owner_id')::uuid;
  fixture_analysis_id uuid:=current_setting('resumide.fixture_analysis_id')::uuid;
  a public.analyses%rowtype; ctx jsonb; request_value jsonb; policy jsonb; prepared jsonb; claim_value jsonb;
  before_usage jsonb; unknown_usage jsonb; rejected_usage jsonb; after_usage jsonb; publication jsonb; replay jsonb;
  op_id uuid:=gen_random_uuid(); unknown_id uuid:=gen_random_uuid(); old_month_id uuid:=gen_random_uuid();
  plan jsonb; before_runs integer; before_versions integer; guard_failed boolean:=false;
  usage_value jsonb:=jsonb_build_object('inputTokens','11','outputTokens','3');
  original_claim timestamptz; export_value jsonb;
begin
  select * into strict a from public.analyses where id=fixture_analysis_id and owner_id=fixture_owner_id;
  insert into public.consents(organization_id,user_id,purpose,policy_version)
    values(a.organization_id,fixture_owner_id,'qualitative_ai','candidate-ai-v1') on conflict(user_id,purpose,policy_version) do nothing;
  policy:=jsonb_build_object('version','canonical-rewrite-rules/1.0.0','sha256','648e65d09340f4bd0b6ef36aa9c3799b883f6d41211883a238e6c222381d536f',
    'promptVersion','canonical-closed-rewrite/1.0.0','writingSupportVersion','legacy-source-transforms/1.0.4','model','synthetic-model');
  before_usage:=public.read_canonical_rewrite_usage(fixture_owner_id,fixture_analysis_id);
  if before_usage->>'unknownClaims'<>'0' then raise exception 'A12_FIXTURE_HAS_UNRESOLVED_SPEND';end if;
  ctx:=public.read_canonical_rewrite_context(fixture_owner_id,fixture_analysis_id,jsonb_build_object('canonicalVersionId',null,'requirementVersionId',null),policy);
  if jsonb_array_length(ctx->'manifest')=0 then raise exception 'A12_REAL_SUPPORTED_FIXTURE_REQUIRED';end if;
  request_value:=jsonb_build_object('schemaVersion','canonical-rewrite-request/1.0.0','operationId',op_id,
    'canonicalVersionId',ctx->'relationshipContext'->'canonical'->'versionId','requirementVersionId',ctx->'relationshipContext'->'requirements'->'versionId',
    'draftId',ctx->'draft'->'id','expectedDraftUpdatedAt',ctx->'draft'->'updatedAt');
  select count(*) into before_runs from public.analysis_ai_runs where analysis_id=fixture_analysis_id;
  select count(*) into before_versions from private.canonical_rewrite_versions where analysis_id=fixture_analysis_id;
  -- The protected legacy insertion must STILL fail on this same real fixture.
  begin
    insert into public.analysis_ai_runs(id,analysis_id,organization_id,owner_id,provider,model_id,prompt_version,input_hash,input_tokens,output_tokens,output)
      values(gen_random_uuid(),fixture_analysis_id,a.organization_id,fixture_owner_id,'synthetic','synthetic-model','guard-probe',repeat('a',64),0,0,'{}');
  exception when invalid_parameter_value then
    if sqlerrm is distinct from 'Document evidence is scoring ineligible' then raise;end if;
    guard_failed:=true;
  end;
  if not guard_failed then raise exception 'A12_LEGACY_GUARD_BYPASSED';end if;
  prepared:=public.prepare_canonical_rewrite(fixture_owner_id,fixture_analysis_id,jsonb_build_object('schemaVersion','canonical-rewrite-command/1.0.0','request',request_value,'policy',policy),op_id::text);
  if prepared->'operation'->'dispatchAllowed' is distinct from 'false'::jsonb or prepared->'context'='null'::jsonb then raise exception 'A12_PREPARE_IS_NOT_PERMISSION';end if;
  claim_value:=public.claim_canonical_rewrite_dispatch(fixture_owner_id,fixture_analysis_id,op_id,prepared->'operation'->>'bindingSha256',null);
  if claim_value->'operation'->'dispatchAllowed' is distinct from 'true'::jsonb then raise exception 'A12_ONCE_CLAIM_REQUIRED';end if;
  perform public.settle_canonical_rewrite_attempt(fixture_owner_id,fixture_analysis_id,op_id,prepared->'operation'->>'bindingSha256',usage_value,null);
  plan:=jsonb_build_object('summarySourceId',null,'bullets',jsonb_build_array(jsonb_build_object('sourceId',0,'clauseId',ctx->'manifest'->0->'clauseIds'->0,'operation','copy','replacementAction',null)));
  publication:=public.finish_canonical_rewrite(fixture_owner_id,fixture_analysis_id,op_id,prepared->'operation'->>'bindingSha256',plan,usage_value,op_id::text);
  replay:=public.finish_canonical_rewrite(fixture_owner_id,fixture_analysis_id,op_id,prepared->'operation'->>'bindingSha256',plan,usage_value,op_id::text);
  if replay->'receipt' is distinct from (publication->'receipt'||jsonb_build_object('idempotent',true))
    or (select count(*) from public.analysis_ai_runs where analysis_id=fixture_analysis_id)<>before_runs
    or (select count(*) from private.canonical_rewrite_versions where analysis_id=fixture_analysis_id)<>before_versions+1
    or not exists(select 1 from private.canonical_rewrite_operations x where x.owner_id=fixture_owner_id and x.analysis_id=fixture_analysis_id and x.operation_id=op_id
      and x.state='saved' and x.run_id=(publication->'receipt'->>'runId')::uuid and x.usage=usage_value) then raise exception 'A12_PRIVATE_PUBLICATION_OR_REPLAY';end if;
  -- A distinct claimed synthetic operation first has unknown usage, then known
  -- rejected output. It must affect quota even though it publishes no content.
  ctx:=public.read_canonical_rewrite_context(fixture_owner_id,fixture_analysis_id,jsonb_build_object('canonicalVersionId',null,'requirementVersionId',null),policy);
  request_value:=request_value||jsonb_build_object('operationId',unknown_id,'expectedDraftUpdatedAt',ctx->'draft'->'updatedAt');
  prepared:=public.prepare_canonical_rewrite(fixture_owner_id,fixture_analysis_id,jsonb_build_object('schemaVersion','canonical-rewrite-command/1.0.0','request',request_value,'policy',policy),unknown_id::text);
  perform public.claim_canonical_rewrite_dispatch(fixture_owner_id,fixture_analysis_id,unknown_id,prepared->'operation'->>'bindingSha256',null);
  perform public.settle_canonical_rewrite_attempt(fixture_owner_id,fixture_analysis_id,unknown_id,prepared->'operation'->>'bindingSha256',null,'unknown');
  unknown_usage:=public.read_canonical_rewrite_usage(fixture_owner_id,fixture_analysis_id);
  if (unknown_usage->>'unknownClaims')::numeric<>(before_usage->>'unknownClaims')::numeric+1 then raise exception 'A12_UNKNOWN_SPEND_LOST';end if;
  perform public.settle_canonical_rewrite_attempt(fixture_owner_id,fixture_analysis_id,unknown_id,prepared->'operation'->>'bindingSha256',jsonb_build_object('inputTokens','13','outputTokens','4'),'invalid_output');
  rejected_usage:=public.read_canonical_rewrite_usage(fixture_owner_id,fixture_analysis_id);
  if rejected_usage->>'unknownClaims'<>'0' or (rejected_usage->>'canonicalTokens')::numeric<>(before_usage->>'canonicalTokens')::numeric+31
    or rejected_usage->>'legacyTokens' is distinct from before_usage->>'legacyTokens' then raise exception 'A12_REJECTED_KNOWN_USAGE_NOT_COUNTED';end if;
  -- Privileged fixture setup ONLY: insert a NEW synthetic technical identity with
  -- a prior-month claim, then use the actual settle RPC. Never rewrite an existing
  -- real operation's clock or claim. This is not a two-session/clock-race proof.
  original_claim:=((before_usage->>'periodStart')::date::timestamp at time zone 'UTC')-interval '1 microsecond';
  insert into private.canonical_rewrite_operations(owner_id,organization_id,analysis_id,operation_id,source_id,request,policy,binding_sha256,state,claimed_at)
    values(fixture_owner_id,a.organization_id,fixture_analysis_id,old_month_id,a.resume_version_id,request_value||jsonb_build_object('operationId',old_month_id),policy,repeat('b',64),'dispatched',original_claim);
  perform public.settle_canonical_rewrite_attempt(fixture_owner_id,fixture_analysis_id,old_month_id,repeat('b',64),jsonb_build_object('inputTokens','17','outputTokens','2'),null);
  after_usage:=public.read_canonical_rewrite_usage(fixture_owner_id,fixture_analysis_id);
  if after_usage is distinct from rejected_usage or not exists(select 1 from private.canonical_rewrite_operations x where x.owner_id=fixture_owner_id and x.analysis_id=fixture_analysis_id
    and x.operation_id=old_month_id and x.claimed_at=original_claim and x.usage=jsonb_build_object('inputTokens','17','outputTokens','2')) then raise exception 'A12_LATE_USAGE_MOVED_PERIOD';end if;
  if after_usage->>'periodStart' is distinct from before_usage->>'periodStart' then raise exception 'A12_FIXTURE_CROSSED_UTC_MONTH';end if;
  export_value:=public.export_canonical_rewrite_records(fixture_owner_id);
  if not exists(select 1 from jsonb_array_elements(export_value->'canonicalRewriteOperations') x(value) where x.value->>'run_id'=publication->'receipt'->>'runId')
    or not exists(select 1 from jsonb_array_elements(export_value->'canonicalRewriteVersions') x(value) where x.value->'receipt'=publication->'receipt') then raise exception 'A12_COMPATIBILITY_EXPORT_OMISSION';end if;
  set constraints all immediate;
end;
$compatibility_cases$;
rollback;
