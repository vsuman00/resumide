-- Synthetic transactional OCR fusion profile verification; all fixtures roll back.
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
    native_blank := jsonb_set(jsonb_set(jsonb_set(jsonb_set(graph,'{pages,0,text}','""'),'{spans,0,text}','""'),'{spans,0,end}','0'),'{assertions,1}','{"field":"email","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null}');
    allocation := '{"id":"aa013-test","maxWallTimeMs":10000,"maxPages":10,"externalApiFeeMicros":0}';
    ocr_source := jsonb_build_object('schemaVersion','ocr-evidence-v1','request',jsonb_build_object('schemaVersion','selective-ocr-request-v1','attemptId',gen_random_uuid(),'ownerId',owner_id,'analysisId',analysis_id,'sourceId',source_id,'createdAt','2026-10-11T12:00:00Z','retentionPolicyId','synthetic-evaluation-30d-v1','sourceSha256',repeat('a',64),'nativePageTexts','[""]'::jsonb,'selectedPages','[{"pageId":"page-1","pageNumber":1}]'::jsonb,'remainingDeadlineMs',10000,'limits','{"maxCharacters":200000,"maxPages":20}'::jsonb,'allocation',allocation,'policy','{"executionMode":"self_hosted","purpose":"synthetic_local_test","allowThirdPartyProcessing":false}'::jsonb),'provider','{"name":"tesseract","executionMode":"self_hosted","executionLocation":"local_host","physicalRegion":{"value":null,"reason":"not_verified"},"versions":{"engine":"synthetic-test","renderer":"synthetic-test","languageData":"synthetic-test"}}'::jsonb,'status','review_required','scoringEligible',false,'offsetUnit','unicode_code_point','coordinateSystem','normalized_top_left','durationMs',1,'measuredWallTimeMs',2,'cost',jsonb_build_object('apiFeeMicros',0,'compute','{"status":"unknown","valueMicros":null,"reason":"host_rate_unavailable"}'::jsonb,'boundedAllocation',allocation,'attempts',1),'pages',jsonb_build_array(jsonb_build_object('pageNumber',1,'pageId','page-1','imageSha256',repeat('c',64),'widthPixels',100,'heightPixels',100,'rotation',0,'text','alex@example.test','dimensionUnit','pixel','method','local_ocr','words','[{"text":"alex@example.test","start":0,"end":17,"box":{"x":0.1,"y":0.1,"width":0.3,"height":0.1},"confidence":{"kind":"uncalibrated","scale":"tesseract_0_100","value":90}}]'::jsonb)));
    ocr_envelope := envelope || jsonb_build_object('id',gen_random_uuid(),'nativeSource',native_blank,'ocrSource',ocr_source,'spans','[{"id":"native-page-1-line-1","pageId":"page-1","method":"native_text","text":"","start":0,"end":0,"box":null,"confidence":{"kind":"uncalibrated","value":null}},{"id":"ocr-page-1-line-1","pageId":"page-1","method":"local_ocr","text":"alex@example.test","start":0,"end":17,"box":{"x":0.1,"y":0.1,"width":0.3,"height":0.1},"confidence":{"kind":"uncalibrated","value":null}}]'::jsonb,'assertions','[{"id":"email-1","field":"email","value":"alex@example.test","evidence":[{"spanId":"ocr-page-1-line-1","start":0,"end":17}],"state":"review_required","confidence":{"kind":"uncalibrated","value":null}}]'::jsonb);
    ocr_source := ocr_envelope->'ocrSource';
    ocr_envelope := jsonb_set(ocr_envelope,'{ocrSource,provider,versions}','{"engine":"tesseract-5.3.0-2/text-fusion-v4","renderer":"poppler-22.12.0-2+deb12u3/dpi-150","languageData":"model-bundle-sha256:74a6c07f4943981367364af90d830c36c6de018cb0c7762caba61e51189c44cc"}'::jsonb);
    ocr_envelope := jsonb_set(ocr_envelope,'{ocrSource,resourceUsage}','{"kind":"child_process_rusage","cpuTimeMs":1,"maxChildRssBytes":100,"rendererCalls":1,"recognitionCalls":2}'::jsonb);
    for test_case in 1..15 loop
      bad := case test_case
        when 1 then jsonb_set(ocr_envelope,'{ocrSource,provider,versions,renderer}','"wrong-renderer"')
        when 2 then jsonb_set(ocr_envelope,'{ocrSource,provider,versions,languageData}','"wrong-bundle"')
        when 3 then ocr_envelope #- '{ocrSource,resourceUsage}'
        when 4 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage}','null')
        when 5 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,recognitionCalls}','1')
        when 6 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,recognitionCalls}','3')
        when 7 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,rendererCalls}','2')
        when 8 then jsonb_set(ocr_envelope,'{ocrSource,provider,versions,engine}','"unknown-fusion-engine"')
        when 9 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,recognitionCalls}','21')
        when 10 then jsonb_set(ocr_envelope,'{ownerId}',to_jsonb(other_id))
        when 11 then jsonb_set(ocr_envelope,'{assertions,0,value}','"forged@example.test"')
        when 12 then jsonb_set(ocr_envelope,'{scoringEligible}','true')
        when 13 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,cpuTimeMs}','null')
        when 14 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,maxChildRssBytes}','1073741825')
        when 15 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage,extra}','true') end;
      rejected := false;
      begin perform public.persist_document_evidence(analysis_id,bad,'fusion-test','invalid-fusion-test');
      exception when sqlstate '22023' then rejected := true; end;
      if not rejected then raise exception 'Invalid OCR fusion accepted: %',test_case; end if;
    end loop;
    if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) then raise exception 'Invalid OCR mutated evidence'; end if;
    if not public.persist_document_evidence(analysis_id,ocr_envelope,'fusion-test','known-2n') then raise exception 'Known 2N OCR rejected'; end if;
    if not public.persist_document_evidence(analysis_id,ocr_envelope,'fusion-test','known-idempotent') then raise exception 'Known OCR retry failed'; end if;
    bad := jsonb_set(ocr_envelope,'{id}',to_jsonb(gen_random_uuid()));
    bad := jsonb_set(bad,'{ocrSource}',ocr_source);
    if not public.persist_document_evidence(analysis_id,bad,'fusion-test','legacy-without-resources') then raise exception 'Legacy optional resources rejected'; end if;
    bad := jsonb_set(bad,'{id}',to_jsonb(gen_random_uuid()));
    bad := jsonb_set(bad,'{ocrSource,resourceUsage}','{"kind":"child_process_rusage","cpuTimeMs":1,"maxChildRssBytes":100,"rendererCalls":1,"recognitionCalls":1}'::jsonb);
    if not public.persist_document_evidence(analysis_id,bad,'fusion-test','legacy-1n') then raise exception 'Legacy 1N resources rejected'; end if;
    if (select count(*) from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) <> 3 then raise exception 'OCR fusion retry not idempotent'; end if;
    if (select status from public.analyses where id = analysis_id) <> 'needs_ocr' then raise exception 'OCR fusion bypassed review'; end if;
    raise exception 'Rollback OCR fusion fixtures' using errcode = 'ZOF01';
  exception when sqlstate 'ZOF01' then null;
  end;
  raise notice 'OCR fusion persistence: known 2N, legacy optional/1N, idempotency and review passed; 15 invalid variants rejected; fixtures rolled back';
end;
$$;
