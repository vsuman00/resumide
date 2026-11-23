-- DRAFT / NOT PARSED OR EXECUTED. Requires separately reviewed isolated managed
-- native-SQL/cutover admission, exact source/fixture allocation and no live workers.
-- Settings are NOT isolation, ownership, credentials or DDL approval. No Docker DB.
-- DB-owner structural fixture setup is explicit; it does not test PDF ingestion,
-- evidence producer grammar, an authenticated browser, export or concurrency.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
declare k text;
begin
  if current_setting('resumide.c02_test_admission',true) is distinct from 'isolated-managed-c02-materialization/1' then
    raise exception 'C02 native target not admitted' using errcode='42501'; end if;
  foreach k in array array['resumide.c02_test_run_id','resumide.c02_test_owner_id'] loop
    if coalesce(current_setting(k,true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'C02 exact fixture allocation missing' using errcode='42501'; end if;
  end loop;
  if exists(select 1 from auth.users where id=current_setting('resumide.c02_test_owner_id')::uuid)
    or private.canonical_correction_write_ready() is not true then
    raise exception 'C02 fixture/canonical cutover not admitted' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.c02_assert(p_ok boolean,p_label text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'C02 native assertion: %',p_label using errcode='23514'; end if; end;
$$;
create function pg_temp.c02_command(p_read jsonb,p_kind text,p_head uuid,p_selectors jsonb) returns jsonb
language sql set search_path='' as $$
  select (p_read->'binding'-array['ownerId','organizationId','resumeId','analysisId'])||jsonb_build_object(
    'schemaVersion','candidate-correction-command/1.0.0','kind',p_kind,'idempotencyKey',gen_random_uuid(),
    'expectedReviewRevision',p_read->'reviewRevision','expectedAssignmentRevision',p_read->'assignmentRevision',
    'expectedVersionId',p_head,'acknowledgement',true,'selectors',p_selectors);
$$;
create function pg_temp.c02_manual(p_user uuid,p_source uuid,p_parent uuid,p_fact uuid,p_value text,p_confirm boolean,p_restore uuid default null)
returns uuid language plpgsql set search_path='' as $$
declare parent public.canonical_resume_versions%rowtype; body jsonb; fact jsonb; timestamp_text text;
  child uuid:=gen_random_uuid(); command jsonb; result jsonb; operation text;
begin
  select * into strict parent from public.canonical_resume_versions where id=p_parent;
  if p_restore is not null then select content into strict body from public.canonical_resume_versions where id=p_restore; operation:='rollback';
  else body:=parent.content; operation:=case when p_confirm then 'confirm' else 'edit' end; end if;
  timestamp_text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  body:=body||jsonb_build_object('versionId',child,'parentVersionId',p_parent,'createdAt',timestamp_text);
  if p_restore is null then
    select value into strict fact from jsonb_array_elements(body->'facts') where value->>'id'=p_fact::text;
    body:=jsonb_set(body,'{facts}',(select jsonb_agg(case when value->>'id'=p_fact::text then
      case when p_confirm then value||jsonb_build_object('state','candidate_confirmed','confirmation',jsonb_build_object('actorId',p_user,'confirmedAt',timestamp_text,'value',fact->>'value'))
      else value||jsonb_build_object('value',p_value,'state','unconfirmed','sources','[]'::jsonb,'confirmation',null) end else value end order by ordinality)
      from jsonb_array_elements(body->'facts') with ordinality));
  end if;
  body:=body||jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',p_user,
    'action',case when p_restore is null then 'edit' else 'rollback' end,'targetId',case when p_restore is null then p_fact else child end,
    'priorValue',case when p_restore is null then fact->>'value' else null end,'createdAt',timestamp_text)));
  command:=jsonb_build_object('operation',operation,'expectedVersionId',p_parent,'idempotencyKey',child,
    'factId',p_fact,'value',case when p_confirm then null else p_value end,'targetVersionId',p_restore);
  result:=public.save_canonical_version(p_user,p_source,body,command,'c02-owned-native');
  perform pg_temp.c02_assert(result->>'status'='applied','ordinary_producer_committed');
  return child;
end;
$$;
do $verify$
#variable_conflict use_variable
<<owned_fixture>>
declare owner_id uuid:=current_setting('resumide.c02_test_owner_id')::uuid; org_id uuid;
  root_id uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid(); analysis_id uuid:=gen_random_uuid(); attempt_id uuid:=gen_random_uuid();
  name_event uuid:=gen_random_uuid(); email_event uuid:=gen_random_uuid(); raw_id uuid:=gen_random_uuid(); name_fact uuid:=gen_random_uuid();
  employer_event uuid:=gen_random_uuid(); employer_fact uuid:=gen_random_uuid();
  employer_section uuid:=gen_random_uuid(); employer_entry1 uuid:=gen_random_uuid(); employer_entry2 uuid:=gen_random_uuid();
  email_fact uuid; name_choice uuid; email_choice uuid; employer_choice uuid; updated_choice uuid; original_application uuid;
  head2 uuid; head3 uuid; head4 uuid; head5 uuid; head6 uuid; restored uuid; timestamp_text text;
  location jsonb; name_selector jsonb; email_selector jsonb; employer_selector jsonb; read_result jsonb; command jsonb; apply_command jsonb; reapply_command jsonb;
  original jsonb; result jsonb; replay jsonb; snapshots_before jsonb; snapshot_after jsonb;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','c02-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic C02 source');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'c02-synthetic/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(analysis_id,source_id,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs j where j.analysis_id=owned_fixture.analysis_id; -- exact owned fixture, never claim/sweep.
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(attempt_id,analysis_id,org_id,owner_id,source_id,repeat('a',64),1,jsonb_build_object('schemaVersion','evidence/2.0.0','id',attempt_id,
      'ownerId',owner_id,'analysisId',analysis_id,'sourceId',source_id,'inputSha256',repeat('a',64),'retentionPolicyId','synthetic-engineering-fixture',
      'spans',jsonb_build_array(jsonb_build_object('id','span-name','text','Demo Candidate Slate'),jsonb_build_object('id','span-employer','text','Synthetic Example Org')),
      'assertions',jsonb_build_array(jsonb_build_object('id','candidate-name','field','name','value','Demo Candidate Slate',
        'evidence',jsonb_build_array(jsonb_build_object('spanId','span-name','start',0,'end',20))),
        jsonb_build_object('id','candidate-employer','field','employer','value','Synthetic Example Org',
          'evidence',jsonb_build_array(jsonb_build_object('spanId','span-employer','start',0,'end',21))))));
  insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
    values(name_event,attempt_id,analysis_id,org_id,owner_id,owner_id,1,0,'name','correct','Demo Candidate Reviewed Slate',null,gen_random_uuid(),'c02-owned-native'),
      (email_event,attempt_id,analysis_id,org_id,owner_id,owner_id,2,1,'email','correct','slate@example.test',null,gen_random_uuid(),'c02-owned-native'),
      (employer_event,attempt_id,analysis_id,org_id,owner_id,owner_id,3,2,'employer','correct','Synthetic Reviewed Org',null,gen_random_uuid(),'c02-owned-native');
  timestamp_text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  original:=jsonb_build_object('schemaVersion','canonical-resume/1.0.0','producerVersion','canonical-engine/1.0.1','analysisId',analysis_id,'inputSha256',repeat('a',64),
    'retentionPolicyId','synthetic-engineering-fixture','resumeId',root_id,'versionId',raw_id,'parentVersionId',null,'ownerId',owner_id,'organizationId',org_id,
    'locale','en-IN','createdAt',timestamp_text,'state','review_required','sourceEvidenceVersionId',attempt_id,'contactFactIds',jsonb_build_array(name_fact),
    'facts',jsonb_build_array(jsonb_build_object('id',name_fact,'type','name','value','Demo Candidate Slate','state','unconfirmed',
      'sources',jsonb_build_array(jsonb_build_object('attemptId',attempt_id,'spanId','span-name','start',0,'end',20)),'confirmation',null),
      jsonb_build_object('id',employer_fact,'type','employer','value','Synthetic Example Org','state','unconfirmed',
        'sources',jsonb_build_array(jsonb_build_object('attemptId',attempt_id,'spanId','span-employer','start',0,'end',21)),'confirmation',null)),
    'sections',jsonb_build_array(jsonb_build_object('id',employer_section,'type','experience','title','Experience','factIds','[]'::jsonb,
      'entries',jsonb_build_array(jsonb_build_object('id',employer_entry1,'factIds',jsonb_build_array(employer_fact),'bullets','[]'::jsonb),
        jsonb_build_object('id',employer_entry2,'factIds',jsonb_build_array(employer_fact),'bullets','[]'::jsonb)))),'changes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',owner_id,'action','import','targetId',raw_id,'priorValue',null,'createdAt',timestamp_text)));
  location:='{"kind":"contact","sectionId":null,"entryId":null,"bulletId":null,"newSectionType":null,"newSectionTitle":null}'::jsonb;
  name_selector:=jsonb_build_object('eventId',name_event,'targetKind','observed_assertion','assertionId','candidate-name','opaqueTargetId','owned-native-name-target',
    'mappingMode','imported_assertion','baseVersionId',null,'factId',null,'mappingProofKind','current_citations','originVersionId',null,'originFactId',null,
    'location',location,'supersedesAssignmentId',null);
  email_selector:=name_selector||jsonb_build_object('eventId',email_event,'targetKind','unobserved_field','assertionId',null,
    'opaqueTargetId','owned-native-email-target','mappingMode','add','mappingProofKind','explicit_candidate_add');
  employer_selector:=name_selector||jsonb_build_object('eventId',employer_event,'assertionId','candidate-employer',
    'opaqueTargetId','owned-native-employer-target','location',location||jsonb_build_object('kind','entry'));
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  command:=pg_temp.c02_command(read_result,'assign',null,jsonb_build_array(name_selector,email_selector,employer_selector));
  result:=public.assign_candidate_correction_targets(owner_id,analysis_id,command,'c02-owned-native');
  perform pg_temp.c02_assert(result->>'status'='assigned' and result->'childVersionIds'='[]'::jsonb and result->'versionId'='null'::jsonb,'assign_no_canonical_mutation');
  name_choice:=(result->'assignmentIds'->>0)::uuid; email_choice:=(result->'assignmentIds'->>1)::uuid; employer_choice:=(result->'assignmentIds'->>2)::uuid;
  -- This raw body is valid ordinary canonical structure, but its shared employer
  -- must not authorize a correction affecting two entries. Planning precedes import.
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  command:=pg_temp.c02_command(read_result,'apply',null,jsonb_build_array(jsonb_build_object('assignmentId',employer_choice,'priorApplicationId',null)));
  result:=public.apply_candidate_corrections(owner_id,analysis_id,command,original,'c02-owned-shared-import');
  perform pg_temp.c02_assert(result->>'status'='conflict' and not exists(select 1 from public.canonical_resume_versions v where v.resume_id=root_id),
    'shared_imported_fact_rejected_before_import');
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  apply_command:=pg_temp.c02_command(read_result,'apply',null,jsonb_build_array(jsonb_build_object('assignmentId',name_choice,'priorApplicationId',null)));
  result:=public.apply_candidate_corrections(owner_id,analysis_id,apply_command,original,'c02-owned-native'); head2:=(result->>'versionId')::uuid;
  perform pg_temp.c02_assert(result->>'status'='applied' and jsonb_array_length(result->'childVersionIds')=2,'initial_import_plus_mapped_child');
  -- Forging one real member location still cannot edit a globally shared fact.
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  employer_selector:=employer_selector||jsonb_build_object('mappingMode','existing','baseVersionId',head2,'factId',employer_fact,
    'supersedesAssignmentId',employer_choice,'location',location||jsonb_build_object('kind','entry','sectionId',employer_section,'entryId',employer_entry1));
  command:=pg_temp.c02_command(read_result,'assign',head2,jsonb_build_array(employer_selector));
  result:=public.assign_candidate_correction_targets(owner_id,analysis_id,command,'c02-owned-shared-existing');
  perform pg_temp.c02_assert(result->>'status'='conflict' and (select version_id=head2 from public.canonical_resume_heads where resume_id=root_id),
    'shared_existing_fact_forged_location_rejected');
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  command:=pg_temp.c02_command(read_result,'add',head2,jsonb_build_array(jsonb_build_object('assignmentId',email_choice,'priorApplicationId',null)));
  result:=public.apply_candidate_corrections(owner_id,analysis_id,command,null,'c02-owned-native'); head3:=(result->>'versionId')::uuid;
  select id into strict email_fact from public.resume_facts where canonical_version_id=head3 and type='email';
  perform pg_temp.c02_assert(result->>'status'='applied' and exists(select 1 from public.resume_facts where canonical_version_id=head3
    and id=email_fact and state='unconfirmed' and sources='[]'::jsonb and confirmation is null),'absent_add_unconfirmed');
  replay:=public.apply_candidate_corrections(owner_id,analysis_id,apply_command,null,'c02-owned-replay');
  perform pg_temp.c02_assert(replay->>'versionId'=head2::text and replay->'idempotent'='true'::jsonb
    and (select version_id=head3 from public.canonical_resume_heads where resume_id=root_id),'historical_replay_does_not_move_head');
  head4:=pg_temp.c02_manual(owner_id,source_id,head3,email_fact,null,true);
  perform pg_temp.c02_assert(exists(select 1 from public.canonical_correction_snapshot_facts where canonical_version_id=head4 and fact_id=email_fact),'confirm_retains_application_link');
  head5:=pg_temp.c02_manual(owner_id,source_id,head4,name_fact,'Demo Candidate Manual Slate',false);
  perform pg_temp.c02_assert(not exists(select 1 from public.canonical_correction_snapshot_facts where canonical_version_id=head5 and fact_id=name_fact),'manual_edit_drops_edited_link');
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  name_selector:=name_selector||jsonb_build_object('mappingMode','existing','baseVersionId',head5,'factId',name_fact,
    'mappingProofKind','owned_origin_chain','originVersionId',raw_id,'originFactId',name_fact,'supersedesAssignmentId',name_choice);
  command:=pg_temp.c02_command(read_result,'assign',head5,jsonb_build_array(name_selector));
  result:=public.assign_candidate_correction_targets(owner_id,analysis_id,command,'c02-owned-native'); updated_choice:=(result->'assignmentIds'->>0)::uuid;
  select id into strict original_application from public.candidate_correction_applications where assignment_id=name_choice;
  read_result:=public.read_candidate_correction_ledger(owner_id,analysis_id);
  reapply_command:=pg_temp.c02_command(read_result,'reapply',head5,jsonb_build_array(jsonb_build_object('assignmentId',updated_choice,'priorApplicationId',original_application)));
  result:=public.apply_candidate_corrections(owner_id,analysis_id,reapply_command,null,'c02-owned-native'); head6:=(result->>'versionId')::uuid;
  perform pg_temp.c02_assert(result->>'status'='applied' and exists(select 1 from public.resume_facts where canonical_version_id=head6
    and id=name_fact and value='Demo Candidate Reviewed Slate' and state='unconfirmed' and sources='[]'::jsonb and confirmation is null),'explicit_reassignment_then_reapply');
  restored:=pg_temp.c02_manual(owner_id,source_id,head6,null,null,false,head3);
  select jsonb_agg(jsonb_build_array(fact_id,application_id) order by fact_id) into snapshots_before from public.canonical_correction_snapshot_facts where canonical_version_id=head3;
  select jsonb_agg(jsonb_build_array(fact_id,application_id) order by fact_id) into snapshot_after from public.canonical_correction_snapshot_facts where canonical_version_id=restored;
  perform pg_temp.c02_assert(snapshots_before=snapshot_after,'restore_uses_selected_snapshot_not_latest_applications');
  replay:=public.apply_candidate_corrections(owner_id,analysis_id,reapply_command,null,'c02-owned-replay');
  perform pg_temp.c02_assert(replay->>'versionId'=head6::text and replay->'idempotent'='true'::jsonb
    and (select version_id=restored from public.canonical_resume_heads where resume_id=root_id),'reapply_replay_after_restore_preserves_head');
  command:=reapply_command||jsonb_build_object('expectedVersionId',restored);
  result:=public.apply_candidate_corrections(owner_id,analysis_id,command,null,'c02-owned-conflict');
  perform pg_temp.c02_assert(result->>'status'='conflict','same_key_changed_head_conflicts');
  result:=public.read_candidate_correction_ledger(gen_random_uuid(),analysis_id);
  perform pg_temp.c02_assert(result->>'status'='not_found','foreign_owner_denied');
  perform set_config('resumide.c02_test_analysis_id',analysis_id::text,true);
end;
$verify$;
-- Separate exact fixture for the original-import branch. These are unexecuted
-- native assertions, not a JavaScript model of SQL or a parser-pass receipt.
do $original_import$
declare v_owner uuid:=current_setting('resumide.c02_test_owner_id')::uuid; v_org uuid;
  v_resume uuid:=gen_random_uuid(); v_source uuid:=gen_random_uuid(); v_analysis uuid:=gen_random_uuid(); v_attempt uuid:=gen_random_uuid();
  v_fact uuid:=gen_random_uuid(); v_version uuid:=gen_random_uuid(); v_key uuid:=gen_random_uuid(); v_manual uuid; v_retry uuid;
  v_section uuid:=gen_random_uuid(); v_entry uuid:=gen_random_uuid(); stamp text;
  original jsonb; retry_body jsonb; command jsonb; binding jsonb; read_result jsonb; result jsonb;
begin
  select o.id into strict v_org from public.organizations o where o.owner_id=v_owner;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(v_resume,v_org,v_owner,'Synthetic original-import branch');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(v_source,v_resume,v_org,v_owner,'c02-original-synthetic/'||v_source,repeat('b',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(v_analysis,v_source,v_org,v_owner,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs j where j.analysis_id=v_analysis;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(v_attempt,v_analysis,v_org,v_owner,v_source,repeat('b',64),1,jsonb_build_object('schemaVersion','evidence/2.0.0','id',v_attempt,
      'ownerId',v_owner,'analysisId',v_analysis,'sourceId',v_source,'inputSha256',repeat('b',64),'retentionPolicyId','synthetic-engineering-fixture',
      'spans',jsonb_build_array(jsonb_build_object('id','span-employer','text','Synthetic Example Org')),
      'assertions',jsonb_build_array(jsonb_build_object('id','candidate-employer','field','employer','value','Synthetic Example Org',
        'evidence',jsonb_build_array(jsonb_build_object('spanId','span-employer','start',0,'end',21))))));
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  original:=jsonb_build_object('schemaVersion','canonical-resume/1.0.0','producerVersion','canonical-engine/1.0.1','analysisId',v_analysis,
    'inputSha256',repeat('b',64),'retentionPolicyId','synthetic-engineering-fixture','resumeId',v_resume,'versionId',v_version,
    'parentVersionId',null,'ownerId',v_owner,'organizationId',v_org,'locale','en-IN','createdAt',stamp,'state','review_required',
    'sourceEvidenceVersionId',v_attempt,'contactFactIds','[]'::jsonb,
    'facts',jsonb_build_array(jsonb_build_object('id',v_fact,'type','employer','value','Synthetic Example Org','state','unconfirmed',
      'sources',jsonb_build_array(jsonb_build_object('attemptId',v_attempt,'spanId','span-employer','start',0,'end',21)),'confirmation',null)),
    'sections',jsonb_build_array(jsonb_build_object('id',v_section,'type','experience','title','Experience','factIds','[]'::jsonb,
      'entries',jsonb_build_array(jsonb_build_object('id',v_entry,'factIds',jsonb_build_array(v_fact),'bullets','[]'::jsonb)))),
    'changes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',v_owner,'action','import','targetId',v_version,'priorValue',null,'createdAt',stamp)));
  command:=jsonb_build_object('operation','import','expectedVersionId',null,'idempotencyKey',v_key,'factId',null,'value',null,'targetVersionId',null);
  read_result:=public.read_candidate_correction_ledger(v_owner,v_analysis);
  binding:=(read_result->'binding')||jsonb_build_object('reviewRevision',read_result->'reviewRevision',
    'assignmentRevision',read_result->'assignmentRevision','canonicalHeadId',read_result->'headId');
  result:=public.correct_document_evidence(v_analysis,v_attempt,v_owner,0,'employer','correct','Synthetic Reviewed Org',null,gen_random_uuid(),'c02-original-owned');
  perform pg_temp.c02_assert(result->>'status'='applied','original_branch_correction_recorded');
  result:=public.import_canonical_original(v_owner,v_analysis,binding,original,command,'c02-original-stale');
  perform pg_temp.c02_assert(result->>'status'='conflict' and not exists(select 1 from public.canonical_resume_versions where resume_id=v_resume),
    'original_import_stale_review_no_write');
  read_result:=public.read_candidate_correction_ledger(v_owner,v_analysis);
  binding:=(read_result->'binding')||jsonb_build_object('reviewRevision',read_result->'reviewRevision',
    'assignmentRevision',read_result->'assignmentRevision','canonicalHeadId',read_result->'headId');
  result:=public.import_canonical_original(v_owner,v_analysis,binding,original,command,'c02-original-active');
  perform pg_temp.c02_assert(result->>'status'='conflict' and not exists(select 1 from public.canonical_resume_versions where resume_id=v_resume),
    'original_import_active_correction_no_write');
  result:=public.correct_document_evidence(v_analysis,v_attempt,v_owner,1,'employer','confirm','Synthetic Example Org','candidate-employer',gen_random_uuid(),'c02-original-owned');
  perform pg_temp.c02_assert(result->>'status'='applied','original_branch_exact_confirmation_recorded');
  read_result:=public.read_candidate_correction_ledger(v_owner,v_analysis);
  binding:=(read_result->'binding')||jsonb_build_object('reviewRevision',read_result->'reviewRevision',
    'assignmentRevision',read_result->'assignmentRevision','canonicalHeadId',read_result->'headId');
  result:=public.import_canonical_original(v_owner,v_analysis,binding,original,command,'c02-original-confirmed');
  perform pg_temp.c02_assert(result->>'status'='applied' and result->>'versionId'=v_version::text and result->'idempotent'='false'::jsonb
    and exists(select 1 from public.resume_facts where canonical_version_id=v_version and id=v_fact and state='unconfirmed'
      and confirmation is null and sources=original->'facts'->0->'sources'),'confirmed_original_import_stays_unconfirmed');
  v_manual:=pg_temp.c02_manual(v_owner,v_source,v_version,v_fact,'Synthetic Manual Org',false);
  result:=public.correct_document_evidence(v_analysis,v_attempt,v_owner,2,'employer','correct','Synthetic Later Reviewed Org',null,gen_random_uuid(),'c02-original-owned');
  perform pg_temp.c02_assert(result->>'status'='applied','original_branch_newer_correction_recorded');
  v_retry:=gen_random_uuid();
  retry_body:=jsonb_set(jsonb_set(original,'{versionId}',to_jsonb(v_retry)),'{changes,0,targetId}',to_jsonb(v_retry));
  retry_body:=jsonb_set(retry_body,'{changes,0,id}',to_jsonb(gen_random_uuid()));
  result:=public.import_canonical_original(v_owner,v_analysis,binding,retry_body,command,'c02-original-replay');
  perform pg_temp.c02_assert(result->>'status'='applied' and result->>'versionId'=v_version::text and result->'idempotent'='true'::jsonb
    and (select version_id=v_manual from public.canonical_resume_heads where resume_id=v_resume),'original_replay_before_fresh_review_and_head');
  result:=public.import_canonical_original(v_owner,v_analysis,binding||jsonb_build_object('attemptId',gen_random_uuid()),retry_body,command,'c02-original-source');
  perform pg_temp.c02_assert(result->>'status'='conflict','original_replay_changed_attempt_denied');
  result:=public.import_canonical_original(v_owner,v_analysis,binding||'{"originalAllowed":true}'::jsonb,retry_body,command,'c02-original-opinion');
  perform pg_temp.c02_assert(result->>'status'='invalid','original_import_opinion_flag_denied');
  result:=public.import_canonical_original(gen_random_uuid(),v_analysis,binding,retry_body,command,'c02-original-foreign');
  perform pg_temp.c02_assert(result->>'status'='not_found','original_import_foreign_owner_denied');
end;
$original_import$;
-- Actual application-role read and DML denial, after privileged fixture setup.
set local role service_role;
do $role$
declare result jsonb; denied boolean:=false;
begin
  result:=public.read_candidate_correction_ledger(current_setting('resumide.c02_test_owner_id')::uuid,current_setting('resumide.c02_test_analysis_id')::uuid);
  if result->>'status' is distinct from 'ready' or result->'writeReady' is distinct from 'true'::jsonb then raise exception 'C02 service-role read failed' using errcode='23514'; end if;
  begin delete from public.candidate_correction_operations where false; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'C02 direct DML not sealed' using errcode='23514'; end if;
end;
$role$;
reset role;
-- Force deferred foundation checks before successful rollback-only completion.
set constraints all immediate;
rollback;
-- STILL REQUIRED on an admitted isolated target: two-session assign/apply/review/
-- head/deletion/legacy-writer races, fault injection after import/each child/add/
-- snapshot/receipt, service-role mutation/column-grant negatives, all add locations,
-- unresolved/newer ambiguity, explicit retargets, add reapply/legacy restore, UTF8
-- codec vectors, body/selection/ancestor bounds, and real consumer/export/cleanup.
-- This source draft does not execute or satisfy any of those gates.
