-- Local synthetic regression; fixtures roll back without changing retained data.
do $$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  org_id uuid; resume_id uuid := gen_random_uuid(); source_id uuid := gen_random_uuid();
  analysis_id uuid := gen_random_uuid(); attempt_id uuid := gen_random_uuid();
  retry_key uuid := gen_random_uuid(); outcome jsonb; envelope jsonb; bad jsonb; ocr_envelope jsonb; ocr_source jsonb; native_blank jsonb; allocation jsonb;
  rejected boolean; test_case integer; latest_id uuid := gen_random_uuid();
  graph jsonb := '{"schemaVersion":"native-evidence-v1","extractorVersion":"unpdf-v1","offsetUnit":"unicode_code_point","pages":[{"id":"page-1","pageNumber":1,"text":"alex@example.test","method":"native_text","confidence":"uncalibrated"}],"spans":[{"id":"page-1-line-1","pageId":"page-1","start":0,"end":17,"text":"alex@example.test"}],"assertions":[{"field":"name","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null},{"field":"email","value":"alex@example.test","state":"review_required","confidence":"uncalibrated","evidence":{"spanId":"page-1-line-1","start":0,"end":17}},{"field":"phone","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null}]}';
begin
  begin
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
      values(owner_id,'authenticated','authenticated','aa013-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
      (other_id,'authenticated','authenticated','aa013-'||other_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
    select id into strict org_id from public.organizations where public.organizations.owner_id = owner_id;
    insert into public.resumes(id,organization_id,owner_id,display_name) values(resume_id,org_id,owner_id,'aa013-synthetic.pdf');
    insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type) values(source_id,resume_id,org_id,owner_id,'aa013/'||source_id,repeat('a',64),1024,'application/pdf');
    insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key) values(analysis_id,source_id,org_id,owner_id,'extracting',gen_random_uuid());
    envelope := jsonb_build_object('schemaVersion','evidence/2.0.0','id',attempt_id,'ownerId',owner_id,'analysisId',analysis_id,'sourceId',source_id,'inputSha256',repeat('a',64),'createdAt','2026-10-11T12:00:00Z','retentionPolicyId','synthetic-evaluation-30d-v1','nativeSource',graph,'ocrSource',null,'ocrFailure',null,'status','review_required','scoringEligible',false,'confidence',jsonb_build_object('kind','uncalibrated','reason','calibration_not_approved'),'spans','[{"id":"native-page-1-line-1","pageId":"page-1","method":"native_text","text":"alex@example.test","start":0,"end":17,"box":null,"confidence":{"kind":"uncalibrated","value":null}}]'::jsonb,'assertions','[{"id":"email-1","field":"email","value":"alex@example.test","evidence":[{"spanId":"native-page-1-line-1","start":0,"end":17}],"state":"review_required","confidence":{"kind":"uncalibrated","value":null}}]'::jsonb,'fields','[{"field":"name","state":"not_evaluated"},{"field":"email","state":"review_required"},{"field":"phone","state":"not_evaluated"},{"field":"employer","state":"not_evaluated"},{"field":"role","state":"not_evaluated"},{"field":"dates","state":"not_evaluated"},{"field":"education","state":"not_evaluated"},{"field":"certification","state":"not_evaluated"}]'::jsonb,'blockers','["uncalibrated_confidence","missing_critical_fields"]'::jsonb);
    for test_case in 1..10 loop
      bad := envelope || '{"fieldExtractorVersion":"evidence-fields/1.0.1"}'::jsonb;
      bad := case test_case
        when 1 then jsonb_set(bad,'{fieldExtractorVersion}','"unknown"')
        when 2 then jsonb_set(bad,'{fieldExtractorVersion}','null')
        when 3 then jsonb_set(bad,'{fieldExtractorVersion}','101')
        when 4 then jsonb_set(bad,'{fieldExtractorVersion}','"evidence-fields/1.0.0"')
        when 5 then bad || '{"unknown":true}'::jsonb
        when 6 then jsonb_set(bad,'{ownerId}',to_jsonb(other_id))
        when 7 then jsonb_set(bad,'{inputSha256}',to_jsonb(repeat('b',64)))
        when 8 then jsonb_set(bad,'{scoringEligible}','true')
        when 9 then jsonb_set(bad,'{assertions,0,value}','"forged@example.test"')
        when 10 then jsonb_set(bad,'{spans,0,text}','"forged@example.test"') end;
      rejected := false;
      begin perform public.persist_document_evidence(analysis_id,bad,'version-test','version-test');
      exception when sqlstate '22023' then rejected := true; end;
      if not rejected then raise exception 'Versioned invalid evidence accepted: %',test_case; end if;
    end loop;
    if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) then raise exception 'Rejected envelopes mutated evidence'; end if;
    if not public.persist_document_evidence(analysis_id,envelope,'version-test','version-legacy') then raise exception 'Historical missing version rejected'; end if;
    envelope := jsonb_set(envelope,'{id}',to_jsonb(gen_random_uuid())) || '{"fieldExtractorVersion":"evidence-fields/1.0.1"}'::jsonb;
    if not public.persist_document_evidence(analysis_id,envelope,'version-test','version-current') then raise exception 'Current version rejected'; end if;
    if not public.persist_document_evidence(analysis_id,envelope,'version-test','version-retry') then raise exception 'Current identical retry rejected'; end if;
    if (select count(*) from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) <> 2 then raise exception 'Version retry not idempotent'; end if;
    if (select status from public.analyses where id = analysis_id) <> 'needs_ocr' then raise exception 'Versioned evidence bypassed review'; end if;
    raise exception 'Rollback version fixtures' using errcode = 'ZAV01';
  exception when sqlstate 'ZAV01' then null;
  end;
  raise notice 'Evidence version DB checks passed: historical/current accepted, retry idempotent, 10 invalid variants rejected, review required; fixtures rolled back';
end;
$$;
