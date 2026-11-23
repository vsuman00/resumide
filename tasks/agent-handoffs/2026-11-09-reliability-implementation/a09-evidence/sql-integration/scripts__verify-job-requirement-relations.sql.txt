-- MUTATING / ROLLBACK-ONLY / UNPARSED / UNEXECUTED
-- Requires a separately approved isolated managed target, reviewed migration chain,
-- exact fresh synthetic owner/run UUIDs, and no live workers. Settings do not
-- authorize DDL or establish isolation. Do not run against an existing owner.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
declare key text;
begin
  if current_setting('resumide.a09_test_admission',true) is distinct from 'isolated-managed-a09-relations/1' then
    raise exception 'A09 native target not admitted' using errcode='42501'; end if;
  foreach key in array array['resumide.a09_test_owner_id','resumide.a09_test_run_id'] loop
    if coalesce(current_setting(key,true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'A09 exact fixture allocation missing' using errcode='42501'; end if;
  end loop;
  if exists(select 1 from auth.users where id=current_setting('resumide.a09_test_owner_id')::uuid) then
    raise exception 'A09 owner allocation is not fresh' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.a09_assert(p_ok boolean,p_label text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'A09 native assertion: %',p_label using errcode='23514'; end if; end;
$$;
-- Fixed independent fixture; source tests validate this body through the frozen TS
-- admission module. Changing authority IDs below preserves all interpretation data.
create function pg_temp.a09_fixture() returns jsonb language sql set search_path='' as $fixture$
  select $body${"schemaVersion":"requirements/2.0.0","producerVersion":"jd-relations/1.0.0","id":"10000000-0000-4000-8000-000000000010","parentVersionId":null,"ownerId":"10000000-0000-4000-8000-000000000020","organizationId":"10000000-0000-4000-8000-000000000021","analysisId":"10000000-0000-4000-8000-000000000022","jobId":"10000000-0000-4000-8000-000000000023","createdAt":"2026-11-12T00:00:00.000Z","retentionPolicyId":"candidate-active-30d/1.0.0","inputSha256":"1de901e8686e713bec2344ecec7542a6d8eae217f1a9f0ffde4f8342765cbf54","locale":"en-IN","domain":"software-engineering","state":"review_required","sourceText":"Requirements:\nJS or PostgreSQL\nat least 3 years experience","scoringEligible":false,"mappingPolicy":{"version":"jd-local-aliases/1.0.0","lexiconSha256":"e5298fd95320299996a4f5eceff3fc7afcd61ed636aaec386e1d4107a7500fa2","externalTaxonomy":null},"relationPolicy":{"version":"jd-local-relation-rules/1.0.0","sha256":"fd69dde2640bcdc1cdd76ce622015cb577090d61581515585f7cdfe0cdcd8cdc"},"requirements":[{"id":"10000000-0000-4000-8000-000000000001","type":"skill","value":"PostgreSQL","importance":"required","importanceBasis":"explicit","importanceEvidence":{"start":0,"end":13,"quote":"Requirements:"},"derivation":"exact","minimumYears":null,"negated":false,"ambiguity":["skill_alternative_review"],"dedupGroup":"052be4116f0d920c2178392a58f00e128b33488a25dc542155e967c788c9a373","evidence":{"spanId":"jd-14-30","start":14,"end":30,"quote":"JS or PostgreSQL"},"confidence":{"kind":"uncalibrated","value":null},"mapping":{"kind":"exact","policyVersion":"jd-local-aliases/1.0.0","conceptId":"local-software:postgresql","canonicalValue":"PostgreSQL","prospectiveCreditGroup":"22e7c117764a257dad78c41cf7ee0eebc38fb6400c35eee0700931a1a5e0a4be"},"tokenEvidence":[{"spanId":"jd-20-30","start":20,"end":30,"quote":"PostgreSQL"}]},{"id":"10000000-0000-4000-8000-000000000002","type":"experience","value":"at least 3 years experience","importance":"required","importanceBasis":"explicit","importanceEvidence":{"start":0,"end":13,"quote":"Requirements:"},"derivation":"exact","minimumYears":3,"negated":false,"ambiguity":[],"dedupGroup":"ad4398e403e981601d2629679c1cb4223ebc3bb9d701b1a66046a1bf81d7780e","evidence":{"spanId":"jd-31-58","start":31,"end":58,"quote":"at least 3 years experience"},"confidence":{"kind":"uncalibrated","value":null},"mapping":null,"tokenEvidence":[]},{"id":"10000000-0000-4000-8000-000000000003","type":"skill","value":"JS","importance":"required","importanceBasis":"explicit","importanceEvidence":{"start":0,"end":13,"quote":"Requirements:"},"derivation":"exact","minimumYears":null,"negated":false,"ambiguity":["skill_alternative_review"],"dedupGroup":"ade48ac3029e4bb61c9b335d4b808fedb5296a171431b032bbea5778fd34f94b","evidence":{"spanId":"jd-14-30","start":14,"end":30,"quote":"JS or PostgreSQL"},"confidence":{"kind":"uncalibrated","value":null},"mapping":{"kind":"alias","policyVersion":"jd-local-aliases/1.0.0","conceptId":"local-software:javascript","canonicalValue":"JavaScript","prospectiveCreditGroup":"31dee37de55a044d99547753dadc16472712bb270701a191dcf3b5a94a06578b"},"tokenEvidence":[{"spanId":"jd-14-16","start":14,"end":16,"quote":"JS"}]}],"retainedClauses":[{"evidence":{"spanId":"jd-14-30","start":14,"end":30,"quote":"JS or PostgreSQL"},"importance":"required","negated":false,"interpretation":"partial_vocabulary","reviewRequired":true,"requirementIds":["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000003"]},{"evidence":{"spanId":"jd-31-58","start":31,"end":58,"quote":"at least 3 years experience"},"importance":"required","negated":false,"interpretation":"partial_vocabulary","reviewRequired":true,"requirementIds":["10000000-0000-4000-8000-000000000002"]}],"relations":{"clauses":[{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","evidence":{"spanId":"jd-14-30","start":14,"end":30,"quote":"JS or PostgreSQL"},"reviewRequired":true,"scope":{"importance":"required","negated":false},"skillExpression":{"kind":"any_of","evidence":{"spanId":"jd-14-30","start":14,"end":30,"quote":"JS or PostgreSQL"},"operands":[{"kind":"atom","value":"JS","evidence":{"spanId":"jd-14-16","start":14,"end":16,"quote":"JS"},"requirementIds":["10000000-0000-4000-8000-000000000003"],"mapping":{"kind":"alias","policyVersion":"jd-local-aliases/1.0.0","conceptId":"local-software:javascript","canonicalValue":"JavaScript","prospectiveCreditGroup":"31dee37de55a044d99547753dadc16472712bb270701a191dcf3b5a94a06578b"}},{"kind":"atom","value":"PostgreSQL","evidence":{"spanId":"jd-20-30","start":20,"end":30,"quote":"PostgreSQL"},"requirementIds":["10000000-0000-4000-8000-000000000001"],"mapping":{"kind":"exact","policyVersion":"jd-local-aliases/1.0.0","conceptId":"local-software:postgresql","canonicalValue":"PostgreSQL","prospectiveCreditGroup":"22e7c117764a257dad78c41cf7ee0eebc38fb6400c35eee0700931a1a5e0a4be"}}],"operatorEvidence":[{"spanId":"jd-17-19","start":17,"end":19,"quote":"or"}]},"duration":{"kind":"not_stated","evidence":null,"lower":null,"upper":null,"operatorEvidence":[],"candidateEvidence":[],"reason":null,"subjectBinding":"literal_clause_only","evaluated":false},"prospectiveCreditGroups":["31dee37de55a044d99547753dadc16472712bb270701a191dcf3b5a94a06578b","22e7c117764a257dad78c41cf7ee0eebc38fb6400c35eee0700931a1a5e0a4be"],"numericCredit":null},{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","evidence":{"spanId":"jd-31-58","start":31,"end":58,"quote":"at least 3 years experience"},"reviewRequired":true,"scope":{"importance":"required","negated":false},"skillExpression":{"kind":"unknown","reason":"no_discovered_operands_review","evidence":{"spanId":"jd-31-58","start":31,"end":58,"quote":"at least 3 years experience"},"observedRequirementIds":["10000000-0000-4000-8000-000000000002"]},"duration":{"kind":"at_least","evidence":{"spanId":"jd-31-47","start":31,"end":47,"quote":"at least 3 years"},"lower":{"value":3,"inclusive":true,"evidence":{"spanId":"jd-40-41","start":40,"end":41,"quote":"3"}},"upper":null,"operatorEvidence":[{"spanId":"jd-31-39","start":31,"end":39,"quote":"at least"}],"candidateEvidence":[{"spanId":"jd-31-47","start":31,"end":47,"quote":"at least 3 years"}],"reason":null,"subjectBinding":"literal_clause_only","evaluated":false},"prospectiveCreditGroups":[],"numericCredit":null}]},"warnings":["uncalibrated_requirements","domain_pack_review_pending","local_alias_policy_not_admitted","clause_interpretation_review_pending"]}$body$::jsonb;
$fixture$;
do $verify$
#variable_conflict use_variable
<<fixture>>
declare owner_id uuid:=current_setting('resumide.a09_test_owner_id')::uuid;
  org_id uuid; root_id uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid(); analysis_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid();
  first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); first_key uuid:=gen_random_uuid(); first_body jsonb; second_body jsonb;
  result jsonb; replay jsonb; bad jsonb; legacy jsonb; path text[]; path_json jsonb; failed boolean;
  request_id text:='a09-'||current_setting('resumide.a09_test_run_id');
begin
  -- Pinned base profile f3f8335d9a957bc16e33d61321f28ed7a12c8c81ff8912f0c17c041d86d95571;
  -- supplemental raw profile f838fbb3dd98b07553d908a788ea17af7a2683d31ca80400cc314474c2ff4889.
  perform pg_temp.a09_assert(encode(extensions.digest(convert_to(private.jd_relation_canonical_json(private.jd_relation_ln_ranges()),'UTF8'),'sha256'),'hex')
    ='784c211586a61233de56dcb1bd821a958e519f466370efa50f0b4ab4929f8937','supplemental_ln_fingerprint');
  perform pg_temp.a09_assert(encode(extensions.digest(convert_to(private.jd_relation_canonical_json(private.jd_relation_project(pg_temp.a09_fixture())),'UTF8'),'sha256'),'hex')
    ='bbf3f1a67bb415881726624bdad8941b5b6a4fb9a2476fc60ea6b25851317c1e','fixed_ts_fixture_semantic_codec');
  perform pg_temp.a09_assert(not has_function_privilege('anon','public.save_job_requirement_relations(uuid,uuid,jsonb,uuid,uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.save_job_requirement_relations(uuid,uuid,jsonb,uuid,uuid,text)','EXECUTE')
    and has_function_privilege('service_role','public.save_job_requirement_relations(uuid,uuid,jsonb,uuid,uuid,text)','EXECUTE'),'service_role_only');
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','a09-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=fixture.owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic A09 source');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'a09-synthetic/'||source_id,repeat('a',64),1024,'application/pdf');
  first_body:=pg_temp.a09_fixture()||jsonb_build_object('id',first_id,'ownerId',owner_id,'organizationId',org_id,'analysisId',analysis_id,'jobId',job_id);
  insert into public.jobs(id,organization_id,owner_id,title,description) values(job_id,org_id,owner_id,'Synthetic A09 role',first_body->>'sourceText');
  insert into public.analyses(id,resume_version_id,job_id,organization_id,owner_id,status,idempotency_key)
    values(analysis_id,source_id,job_id,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs j where j.analysis_id=fixture.analysis_id; -- exact fresh fixture only
  perform pg_temp.a09_assert(private.job_requirement_relations_valid(first_body),'fixed_ts_fixture_valid');
  -- Source-internal tampering must fail admission before receipt lookup.
  for path_json in select value from jsonb_array_elements($paths$[["requirements","0","evidence","quote"],["requirements","0","mapping","conceptId"],["requirements","0","importance"],["relations","clauses","0","skillExpression","kind"],["relations","clauses","0","skillExpression","operatorEvidence","0","quote"],["relations","clauses","1","duration","lower","value"],["relations","clauses","1","duration","lower","inclusive"],["relations","clauses","1","skillExpression","reason"],["mappingPolicy","lexiconSha256"]]$paths$::jsonb) loop
    select array_agg(value order by ordinality) into path from jsonb_array_elements_text(path_json) with ordinality;
    bad:=jsonb_set(first_body,path,'"tampered"'::jsonb);
    perform pg_temp.a09_assert(not private.job_requirement_relations_valid(bad),'source_semantics_tamper_denied');
  end loop;
  result:=public.save_job_requirement_relations(owner_id,analysis_id,first_body,null,first_key,request_id);
  perform pg_temp.a09_assert(result->>'status'='applied' and result->'idempotent'='false'::jsonb,'initial_applied');
  perform pg_temp.a09_assert((select count(*)=1 from public.job_requirement_versions v where v.analysis_id=fixture.analysis_id)
    and (select count(*)=3 from public.job_requirements i where i.version_id=first_id)
    and (select count(*)=1 from public.audit_events e where e.actor_id=fixture.owner_id and e.request_id=fixture.request_id and e.action='requirements.relations.import'),
    'atomic_version_items_audit');
  replay:=public.save_job_requirement_relations(owner_id,analysis_id,first_body||jsonb_build_object('id',gen_random_uuid(),'createdAt','2026-11-12T00:00:01.000Z'),null,first_key,request_id);
  perform pg_temp.a09_assert(replay->>'versionId'=first_id::text and replay->'idempotent'='true'::jsonb,'identity_time_replay');
  bad:=first_body||jsonb_build_object('locale','fr-FR','state','unsupported','warnings',jsonb_build_array('unsupported_domain_or_locale','uncalibrated_requirements','domain_pack_review_pending','local_alias_policy_not_admitted','clause_interpretation_review_pending'));
  -- Rebuild only this changed-segment candidate; fixed baseline remains independent.
  bad:=private.jd_relation_expected_body(bad)||jsonb_build_object('id',gen_random_uuid());
  result:=public.save_job_requirement_relations(owner_id,analysis_id,bad,null,first_key,request_id);
  perform pg_temp.a09_assert(result->>'status'='conflict','changed_semantics_conflict');
  result:=public.save_job_requirement_relations(owner_id,analysis_id,first_body,null,gen_random_uuid(),request_id);
  perform pg_temp.a09_assert(result->>'status'='conflict','stale_parent_conflicts');
  second_body:=first_body||jsonb_build_object('id',second_id,'parentVersionId',first_id);
  result:=public.save_job_requirement_relations(owner_id,analysis_id,second_body,first_id,gen_random_uuid(),request_id);
  perform pg_temp.a09_assert(result->>'status'='applied','second_applied');
  replay:=public.save_job_requirement_relations(owner_id,analysis_id,first_body,null,first_key,request_id);
  perform pg_temp.a09_assert(replay->>'versionId'=first_id::text and replay->'idempotent'='true'::jsonb
    and (select id=second_id from public.job_requirement_versions v where v.analysis_id=fixture.analysis_id order by revision desc limit 1),
    'historical_replay_preserves_head');
  result:=public.save_job_requirement_relations(gen_random_uuid(),analysis_id,first_body,null,first_key,request_id);
  perform pg_temp.a09_assert(result->>'status'='not_found','foreign_owner_denied');
  -- A direct valid legacy insert must independently reject a typed parent.
  legacy:=(first_body-array['scoringEligible','mappingPolicy','relationPolicy','retainedClauses','relations'])||jsonb_build_object(
    'schemaVersion','requirements/1.0.0','producerVersion','jd-parser/1.0.0','id',gen_random_uuid(),'parentVersionId',second_id,
    'requirements','[]'::jsonb,'warnings',jsonb_build_array('uncalibrated_requirements','domain_pack_review_pending'));
  perform pg_temp.a09_assert(private.job_requirement_shape_valid(legacy),'legacy_fixture_structurally_valid');
  failed:=false;
  begin
    insert into public.job_requirement_versions(id,analysis_id,job_id,owner_id,organization_id,parent_version_id,revision,idempotency_key,command,content)
      values((legacy->>'id')::uuid,analysis_id,job_id,owner_id,org_id,second_id,3,gen_random_uuid(),'{}',legacy);
  exception when sqlstate '22023' then failed:=true; end;
  perform pg_temp.a09_assert(failed,'legacy_child_of_typed_denied');
  -- Same source after a job edit is still replayable; a fresh command is not.
  update public.jobs j set description='Synthetic changed source' where j.id=fixture.job_id;
  replay:=public.save_job_requirement_relations(owner_id,analysis_id,first_body,null,first_key,request_id);
  perform pg_temp.a09_assert(replay->>'versionId'=first_id::text,'historical_source_replay');
  failed:=false;
  begin
    result:=public.save_job_requirement_relations(owner_id,analysis_id,second_body||jsonb_build_object('id',gen_random_uuid(),'parentVersionId',second_id),second_id,gen_random_uuid(),request_id);
  exception when sqlstate '22023' then failed:=true; end;
  perform pg_temp.a09_assert(failed,'fresh_source_mismatch_denied');
  insert into public.data_requests(organization_id,user_id,kind,status) values(org_id,owner_id,'deletion','queued');
  result:=public.save_job_requirement_relations(owner_id,analysis_id,first_body,null,first_key,request_id);
  perform pg_temp.a09_assert(result->>'status'='not_found','privacy_replay_denied');
  -- Cleanup uses exact owned IDs. Final ROLLBACK also removes all setup and temp functions.
  delete from auth.users u where u.id=fixture.owner_id;
  perform pg_temp.a09_assert(not exists(select 1 from public.job_requirement_versions v where v.analysis_id=fixture.analysis_id)
    and not exists(select 1 from public.job_requirements i where i.version_id in (first_id,second_id))
    and not exists(select 1 from public.analyses a where a.id=fixture.analysis_id)
    and not exists(select 1 from auth.users u where u.id=fixture.owner_id),'exact_fixture_cleanup');
end;
$verify$;
rollback;
