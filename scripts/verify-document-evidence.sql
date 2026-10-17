-- Synthetic transactional AA013/AA014 storage verification. Run after all
-- migrations. Fixtures and audit rows roll back; no hosted deployment implied.
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
    insert into public.analysis_results(analysis_id,organization_id,owner_id,feedback,parse_view,rule_trace,keyword_coverage,parser_version,ruleset_version,normalizer_version,prompt_version,schema_version,model_id,taxonomy_version) values(analysis_id,org_id,owner_id,'{"overallScore":90}','{}','[]','{}','test','test','test','test','test','test','test');
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    execute 'set local role authenticated';
    if not exists(select 1 from public.analysis_results where public.analysis_results.analysis_id = analysis_id) then raise exception 'Legacy result missing before evidence review'; end if;
    execute 'reset role';
    for test_case in 1..10 loop
      bad := case test_case
        when 1 then envelope || '{"unknown":true}'::jsonb
        when 2 then jsonb_set(envelope,'{ownerId}',to_jsonb(other_id))
        when 3 then jsonb_set(envelope,'{inputSha256}',to_jsonb(repeat('b',64)))
        when 4 then jsonb_set(envelope,'{scoringEligible}','true')
        when 5 then jsonb_set(envelope,'{spans,0,text}','"fabricated"')
        when 6 then jsonb_set(envelope,'{assertions,0,value}','"fabricated"')
        when 7 then jsonb_set(envelope,'{assertions,0,evidence,0,end}','18')
        when 8 then jsonb_set(envelope,'{nativeSource,spans,0,text}','"fabricated"')
        when 9 then jsonb_set(envelope,'{fields,0,field}','"email"')
        when 10 then jsonb_set(envelope,'{confidence,kind}','"calibrated"') end;
      rejected := false;
      begin perform public.persist_document_evidence(analysis_id,bad,'aa013-test','aa013-test');
      exception when sqlstate '22023' then rejected := true;
      end;
      if not rejected then raise exception 'Invalid evidence accepted, case %',test_case; end if;
    end loop;
    if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) then raise exception 'Malformed envelope mutated evidence'; end if;
    if not public.persist_document_evidence(analysis_id,envelope,'aa013-test','aa013-test') or not public.persist_document_evidence(analysis_id,envelope,'aa013-test','aa013-retry') then raise exception 'Persistence or identical retry failed'; end if;
    if (select count(*) from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) <> 1 or (select status from public.analyses where id = analysis_id) <> 'needs_ocr' then raise exception 'Persistence not atomic/idempotent'; end if;
    rejected := false;
    begin perform public.persist_document_evidence(analysis_id,jsonb_set(envelope,'{createdAt}','"2026-10-12T12:00:00Z"'),'aa013-test','aa013-test');
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Attempt ID reused with changed payload'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,other_id,0,'email','confirm','alex@example.test','email-1',retry_key,'aa014-test');
    if outcome->>'status' <> 'not_found' then raise exception 'Cross-owner correction allowed'; end if;
    rejected := false;
    begin perform public.correct_document_evidence(analysis_id,attempt_id,owner_id,0,'email','confirm','invented@example.test','email-1',retry_key,'aa014-test');
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Forged confirmation allowed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,0,'email','confirm','alex@example.test','email-1',retry_key,'aa014-test');
    if outcome->>'status' <> 'applied' or outcome->>'revision' <> '1' or outcome->>'idempotent' <> 'false' then raise exception 'Confirmation failed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,0,'email','confirm','alex@example.test','email-1',retry_key,'aa014-retry');
    if outcome->>'idempotent' <> 'true' then raise exception 'Correction retry failed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,0,'email','correct','other@example.test',null,retry_key,'aa014-retry');
    if outcome->>'status' <> 'conflict' then raise exception 'Correction idempotency mismatch allowed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,0,'email','correct','other@example.test',null,gen_random_uuid(),'aa014-stale');
    if outcome->>'status' <> 'conflict' then raise exception 'Stale CAS allowed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,1,'email','correct','other@example.test',null,gen_random_uuid(),'aa014-correct');
    if outcome->>'status' <> 'applied' or outcome->>'revision' <> '2' then raise exception 'Explicit candidate correction failed'; end if;
    if (select envelope from public.document_evidence_attempts where id = attempt_id) <> envelope then raise exception 'Correction mutated immutable source'; end if;
    rejected := false;
    begin update public.document_evidence_attempts set envelope = '{}' where id = attempt_id;
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Attempt update allowed'; end if;
    rejected := false;
    begin update public.evidence_corrections set value = 'mutated' where public.evidence_corrections.analysis_id = analysis_id;
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Correction update allowed'; end if;
    rejected := false;
    begin insert into public.analysis_deterministic_results(analysis_id,organization_id,owner_id,score,parse_view,rule_trace,keyword_coverage,input_text_checksum,result_checksum,parser_version,ruleset_version,normalizer_version) values(analysis_id,org_id,owner_id,90,'{}','[]','{}',repeat('b',64),repeat('c',64),'test','test','test');
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Evidence received numerical scoring'; end if;
    rejected := false;
    begin update public.analysis_results set feedback = '{"overallScore":99}' where public.analysis_results.analysis_id = analysis_id;
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Review permitted legacy result update'; end if;
    rejected := false;
    begin insert into public.analysis_ai_runs(id,analysis_id,organization_id,owner_id,provider,model_id,prompt_version,input_hash,input_tokens,output_tokens,output) values(gen_random_uuid(),analysis_id,org_id,owner_id,'synthetic','test','test',repeat('a',64),0,0,'{}');
    exception when sqlstate '22023' then rejected := true; end;
    if not rejected then raise exception 'Review permitted qualitative result'; end if;
    for test_case in 1..2 loop
      if has_table_privilege(case test_case when 1 then 'anon' else 'authenticated' end,'public.document_evidence_attempts','INSERT, UPDATE, DELETE') or has_table_privilege(case test_case when 1 then 'anon' else 'authenticated' end,'public.evidence_corrections','INSERT, UPDATE, DELETE') or has_function_privilege(case test_case when 1 then 'anon' else 'authenticated' end,'public.persist_document_evidence(uuid,jsonb,text,text)','EXECUTE') or has_function_privilege(case test_case when 1 then 'anon' else 'authenticated' end,'public.correct_document_evidence(uuid,uuid,uuid,integer,text,text,text,text,uuid,text)','EXECUTE') then raise exception 'Client mutation privileges granted'; end if;
    end loop;
    perform set_config('request.jwt.claim.sub',other_id::text,true);
    execute 'set local role authenticated';
    if exists(select 1 from public.document_evidence_attempts where id = attempt_id) or exists(select 1 from public.evidence_corrections where public.evidence_corrections.analysis_id = analysis_id) then raise exception 'RLS exposed other owner evidence'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    execute 'set local role authenticated';
    if not exists(select 1 from public.document_evidence_attempts where id = attempt_id) or (select count(*) from public.evidence_corrections where public.evidence_corrections.analysis_id = analysis_id) <> 2 then raise exception 'Owner cannot read review evidence'; end if;
    if exists(select 1 from public.analysis_results where public.analysis_results.analysis_id = analysis_id) then raise exception 'Review published retained legacy numeric result'; end if;
    rejected := false;
    begin update public.document_evidence_attempts set envelope = '{}' where id = attempt_id;
    exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'Authenticated direct evidence update not denied'; end if;
    rejected := false;
    begin perform public.correct_document_evidence(analysis_id,attempt_id,owner_id,2,'email','correct','other@example.test',null,gen_random_uuid(),'client-denied');
    exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'Authenticated correction RPC not denied'; end if;
    execute 'reset role';
    if not exists(select 1 from public.analysis_results where public.analysis_results.analysis_id = analysis_id) then raise exception 'Review erased legacy provenance'; end if;
    if not public.persist_document_evidence(analysis_id,jsonb_set(envelope,'{id}',to_jsonb(latest_id)),'aa013-test','aa013-test') then raise exception 'New attempt failed'; end if;
    outcome := public.correct_document_evidence(analysis_id,attempt_id,owner_id,2,'email','correct','other@example.test',null,gen_random_uuid(),'aa014-stale-attempt');
    if outcome->>'status' <> 'conflict' then raise exception 'Obsolete attempt correction allowed'; end if;
    native_blank := jsonb_set(jsonb_set(jsonb_set(jsonb_set(graph,'{pages,0,text}','""'),'{spans,0,text}','""'),'{spans,0,end}','0'),'{assertions,1}','{"field":"email","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null}');
    allocation := '{"id":"aa013-test","maxWallTimeMs":10000,"maxPages":10,"externalApiFeeMicros":0}';
    ocr_source := jsonb_build_object('schemaVersion','ocr-evidence-v1','request',jsonb_build_object('schemaVersion','selective-ocr-request-v1','attemptId',gen_random_uuid(),'ownerId',owner_id,'analysisId',analysis_id,'sourceId',source_id,'createdAt','2026-10-11T12:00:00Z','retentionPolicyId','synthetic-evaluation-30d-v1','sourceSha256',repeat('a',64),'nativePageTexts','[""]'::jsonb,'selectedPages','[{"pageId":"page-1","pageNumber":1}]'::jsonb,'remainingDeadlineMs',10000,'limits','{"maxCharacters":200000,"maxPages":20}'::jsonb,'allocation',allocation,'policy','{"executionMode":"self_hosted","purpose":"synthetic_local_test","allowThirdPartyProcessing":false}'::jsonb),'provider','{"name":"tesseract","executionMode":"self_hosted","executionLocation":"local_host","physicalRegion":{"value":null,"reason":"not_verified"},"versions":{"engine":"synthetic-test","renderer":"synthetic-test","languageData":"synthetic-test"}}'::jsonb,'status','review_required','scoringEligible',false,'offsetUnit','unicode_code_point','coordinateSystem','normalized_top_left','durationMs',1,'measuredWallTimeMs',2,'cost',jsonb_build_object('apiFeeMicros',0,'compute','{"status":"unknown","valueMicros":null,"reason":"host_rate_unavailable"}'::jsonb,'boundedAllocation',allocation,'attempts',1),'pages',jsonb_build_array(jsonb_build_object('pageNumber',1,'pageId','page-1','imageSha256',repeat('c',64),'widthPixels',100,'heightPixels',100,'rotation',0,'text','alex@example.test','dimensionUnit','pixel','method','local_ocr','words','[{"text":"alex@example.test","start":0,"end":17,"box":{"x":0.1,"y":0.1,"width":0.3,"height":0.1},"confidence":{"kind":"uncalibrated","scale":"tesseract_0_100","value":90}}]'::jsonb)));
    ocr_envelope := envelope || jsonb_build_object('id',gen_random_uuid(),'nativeSource',native_blank,'ocrSource',ocr_source,'spans','[{"id":"native-page-1-line-1","pageId":"page-1","method":"native_text","text":"","start":0,"end":0,"box":null,"confidence":{"kind":"uncalibrated","value":null}},{"id":"ocr-page-1-line-1","pageId":"page-1","method":"local_ocr","text":"alex@example.test","start":0,"end":17,"box":{"x":0.1,"y":0.1,"width":0.3,"height":0.1},"confidence":{"kind":"uncalibrated","value":null}}]'::jsonb,'assertions','[{"id":"email-1","field":"email","value":"alex@example.test","evidence":[{"spanId":"ocr-page-1-line-1","start":0,"end":17}],"state":"review_required","confidence":{"kind":"uncalibrated","value":null}}]'::jsonb);
    for test_case in 1..14 loop
      bad := case test_case
        when 1 then jsonb_set(ocr_envelope,'{ocrSource,request,ownerId}',to_jsonb(other_id))
        when 2 then jsonb_set(ocr_envelope,'{ocrSource,request,nativePageTexts}','["fabricated"]')
        when 3 then jsonb_set(ocr_envelope,'{ocrSource,pages,0,words,0,text}','"fabricated"')
        when 4 then jsonb_set(ocr_envelope,'{ocrSource,pages,0,words,0,box,width}','2')
        when 5 then jsonb_set(ocr_envelope,'{ocrSource,pages,0,words,0,confidence,value}','101')
        when 6 then jsonb_set(ocr_envelope,'{spans,1,box,x}','0.2')
        when 7 then jsonb_set(ocr_envelope,'{ocrSource,request,selectedPages}','[]')
        when 8 then jsonb_set(ocr_envelope,'{ocrSource,pages,0,words,0,confidence,value}','null')
        when 9 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage}','{"kind":"child_process_rusage","cpuTimeMs":null,"maxChildRssBytes":100,"rendererCalls":1,"recognitionCalls":1}')
        when 10 then jsonb_set(ocr_envelope,'{spans,1,start}','null')
        when 11 then jsonb_set(ocr_envelope,'{ocrSource,request,limits,maxPages}','null')
        when 12 then jsonb_set(ocr_envelope,'{spans,1,box,x}','null')
        when 13 then jsonb_set(ocr_envelope,'{ocrSource,pages,0,widthPixels}','null')
        when 14 then jsonb_set(ocr_envelope,'{ocrSource,resourceUsage}','{"kind":"child_process_rusage","cpuTimeMs":1,"maxChildRssBytes":100,"rendererCalls":1,"recognitionCalls":1,"containerMemoryPeak":{"kind":"cgroup_v2_memory_peak","measuredThrough":"recognition_complete","valueBytes":null,"reason":null}}') end;
      rejected := false;
      begin perform public.persist_document_evidence(analysis_id,bad,'aa013-test','aa013-ocr');
      exception when sqlstate '22023' then rejected := true; end;
      if not rejected then raise exception 'Invalid OCR evidence accepted, case %',test_case; end if;
    end loop;
    if not public.persist_document_evidence(analysis_id,ocr_envelope,'aa013-test','aa013-ocr') then raise exception 'Grounded OCR evidence rejected'; end if;
    begin
      delete from public.analyses where id = analysis_id;
      if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) or exists(select 1 from public.evidence_corrections where public.evidence_corrections.analysis_id = analysis_id) then raise exception 'Analysis deletion retained evidence'; end if;
      raise exception 'Restore analysis cascade fixture' using errcode = 'ZAA15';
    exception when sqlstate 'ZAA15' then null;
    end;
    begin
      delete from auth.users where id = owner_id;
      if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.owner_id = owner_id) or exists(select 1 from public.evidence_corrections where public.evidence_corrections.owner_id = owner_id) then raise exception 'User deletion retained evidence'; end if;
      raise exception 'Restore user cascade fixture' using errcode = 'ZAA16';
    exception when sqlstate 'ZAA16' then null;
    end;
    delete from public.resume_versions where id = source_id;
    if exists(select 1 from public.document_evidence_attempts where public.document_evidence_attempts.analysis_id = analysis_id) or exists(select 1 from public.evidence_corrections where public.evidence_corrections.analysis_id = analysis_id) then raise exception 'Source deletion retained evidence'; end if;
    raise exception 'Rollback synthetic document evidence fixtures' using errcode = 'ZAA14';
  exception when sqlstate 'ZAA14' then null;
  end;
end;
$$;
