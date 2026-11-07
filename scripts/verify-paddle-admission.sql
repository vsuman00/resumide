-- Synthetic transactional hosted-PaddleOCR admission verification. Run after
-- all migrations. Fixtures and receipts roll back; no hosted deployment or
-- provider request is implied.
do $$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  org_id uuid;
  resume_id uuid := gen_random_uuid();
  source_id uuid := gen_random_uuid();
  analysis_id uuid := gen_random_uuid();
  second_analysis_id uuid := gen_random_uuid();
  third_analysis_id uuid := gen_random_uuid();
  admission_id uuid;
  second_admission_id uuid;
  rejected boolean;
begin
  begin
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
      values
        (owner_id,'authenticated','authenticated','paddle-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
        (other_id,'authenticated','authenticated','paddle-'||other_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
    select id into org_id from public.organizations
      where public.organizations.owner_id = owner_id limit 1;
    if org_id is null then
      insert into public.organizations(owner_id,name)
        values(owner_id,'paddle-synthetic') returning id into org_id;
    end if;
    insert into public.resumes(id,organization_id,owner_id,display_name)
      values(resume_id,org_id,owner_id,'paddle-synthetic.pdf');
    insert into public.resume_versions(
      id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,
      media_type,page_count
    ) values(
      source_id,resume_id,org_id,owner_id,'paddle/'||source_id,repeat('a',64),
      1024,'application/pdf',5
    );
    insert into public.analyses(
      id,resume_version_id,organization_id,owner_id,status,idempotency_key
    ) values
      (analysis_id,source_id,org_id,owner_id,'queued',gen_random_uuid()),
      (second_analysis_id,source_id,org_id,owner_id,'queued',gen_random_uuid()),
      (third_analysis_id,source_id,org_id,owner_id,'queued',gen_random_uuid());

    admission_id := public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[2,5],2048,3,4096,86400
    );
    if admission_id is null then raise exception 'Valid admission was denied'; end if;
    if (select count(*) from public.paddle_ocr_admissions where public.paddle_ocr_admissions.id = admission_id) <> 1
       or (select count(*) from public.paddle_ocr_admission_pages where public.paddle_ocr_admission_pages.admission_id = admission_id) <> 2 then
      raise exception 'Admission was not persisted with its page set';
    end if;
    if public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[2,5],2048,3,4096,86400
    ) is not null then
      raise exception 'Duplicate admission was accepted';
    end if;
    if (select count(*) from public.paddle_ocr_admissions where public.paddle_ocr_admissions.analysis_id = analysis_id) <> 1 then
      raise exception 'Duplicate admission mutated the ledger';
    end if;

    if not public.record_paddle_ocr_attempt(admission_id,2,'submit_started',null)
       or public.record_paddle_ocr_attempt(admission_id,2,'submit_started',null)
       or not public.record_paddle_ocr_attempt(admission_id,2,'acknowledged','job/synthetic')
       or public.record_paddle_ocr_attempt(admission_id,2,'acknowledged','job/synthetic')
       or public.record_paddle_ocr_attempt(admission_id,2,'completed','job/other')
       or not public.record_paddle_ocr_attempt(admission_id,2,'completed','job/synthetic')
       or public.record_paddle_ocr_attempt(admission_id,2,'completed','job/synthetic')
       or public.record_paddle_ocr_attempt(admission_id,3,'submit_started',null)
       or public.record_paddle_ocr_attempt(admission_id,2,'unknown',null) then
      raise exception 'Attempt receipt transition policy failed';
    end if;
    if (select count(*) from public.paddle_ocr_attempt_events where public.paddle_ocr_attempt_events.admission_id = admission_id) <> 3 then
      raise exception 'Attempt receipt history is incomplete';
    end if;

    if public.admit_paddle_ocr(
      owner_id,second_analysis_id,source_id,repeat('a',64),array[1,3,4],3072,3,4096,86400
    ) is not null then
      raise exception 'Page budget overflow was accepted';
    end if;
    if exists(select 1 from public.paddle_ocr_admissions where public.paddle_ocr_admissions.analysis_id = second_analysis_id)
       or (select page_count from private.paddle_ocr_budget_buckets where private.paddle_ocr_budget_buckets.owner_id = owner_id) <> 2
       or (select upload_bytes from private.paddle_ocr_budget_buckets where private.paddle_ocr_budget_buckets.owner_id = owner_id) <> 2048 then
      raise exception 'Budget overflow mutated the ledger or bucket';
    end if;

    second_admission_id := public.admit_paddle_ocr(
      owner_id,second_analysis_id,source_id,repeat('a',64),array[1],1024,3,4096,86400
    );
    if second_admission_id is null
       or (select page_count from private.paddle_ocr_budget_buckets where private.paddle_ocr_budget_buckets.owner_id = owner_id) <> 3 then
      raise exception 'Within-budget admission failed';
    end if;

    if public.admit_paddle_ocr(
      owner_id,third_analysis_id,source_id,repeat('a',64),array[1],1024,10,3500,86400
    ) is not null then
      raise exception 'Byte budget overflow was accepted';
    end if;
    if exists(select 1 from public.paddle_ocr_admissions where public.paddle_ocr_admissions.analysis_id = third_analysis_id) then
      raise exception 'Byte budget overflow persisted an admission';
    end if;

    update private.paddle_ocr_budget_buckets
      set window_started_at = timezone('utc', now()) - interval '2 minutes'
      where private.paddle_ocr_budget_buckets.owner_id = owner_id;
    second_admission_id := public.admit_paddle_ocr(
      owner_id,third_analysis_id,source_id,repeat('a',64),array[1],1024,3,4096,60
    );
    if second_admission_id is null
       or (select page_count from private.paddle_ocr_budget_buckets where private.paddle_ocr_budget_buckets.owner_id = owner_id) <> 1 then
      raise exception 'Expired budget window was not reset';
    end if;

    if public.admit_paddle_ocr(
      other_id,analysis_id,source_id,repeat('a',64),array[2],1024,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('b',64),array[2],1024,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[2],1025,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[6],1024,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[]::integer[],1,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[1,1],2048,3,4096,86400
    ) is not null
       or public.admit_paddle_ocr(
      owner_id,analysis_id,source_id,repeat('a',64),array[1],1024,0,4096,86400
    ) is not null then
      raise exception 'Invalid owner, source, page set or budget was accepted';
    end if;

    if has_table_privilege('authenticated','public.paddle_ocr_admissions','INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','public.paddle_ocr_admission_pages','INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','public.paddle_ocr_attempt_events','INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','private.paddle_ocr_budget_buckets','SELECT')
       or has_function_privilege('authenticated','public.admit_paddle_ocr(uuid,uuid,uuid,text,integer[],bigint,integer,bigint,integer)','EXECUTE')
       or has_function_privilege('authenticated','public.record_paddle_ocr_attempt(uuid,integer,text,text)','EXECUTE') then
      raise exception 'Client mutation or budget privileges were granted';
    end if;

    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    execute 'set local role authenticated';
    if (select count(*) from public.paddle_ocr_admissions where public.paddle_ocr_admissions.owner_id = owner_id) < 2
       or (select count(*) from public.paddle_ocr_admission_pages pages
           join public.paddle_ocr_admissions admission on admission.id = pages.admission_id
           where admission.owner_id = owner_id) < 4
       or (select count(*) from public.paddle_ocr_attempt_events events
           join public.paddle_ocr_admissions admission on admission.id = events.admission_id
           where admission.owner_id = owner_id) <> 3 then
      raise exception 'Owner cannot read admitted receipts';
    end if;
    rejected := false;
    begin
      insert into public.paddle_ocr_admissions(
        organization_id,owner_id,analysis_id,source_id,source_sha256,upload_bytes
      ) values(org_id,owner_id,second_analysis_id,source_id,repeat('a',64),1024);
    exception when insufficient_privilege then rejected := true;
    end;
    if not rejected then raise exception 'Authenticated direct admission insert was allowed'; end if;
    rejected := false;
    begin
      perform public.admit_paddle_ocr(
        owner_id,second_analysis_id,source_id,repeat('a',64),array[1],1024,3,4096,86400
      );
    exception when insufficient_privilege then rejected := true;
    end;
    if not rejected then raise exception 'Authenticated admission RPC was allowed'; end if;
    execute 'reset role';

    perform set_config('request.jwt.claim.sub',other_id::text,true);
    execute 'set local role authenticated';
    if exists(select 1 from public.paddle_ocr_admissions where public.paddle_ocr_admissions.owner_id = owner_id)
       or exists(select 1 from public.paddle_ocr_attempt_events) then
      raise exception 'RLS exposed another owner receipts';
    end if;
    execute 'reset role';

    delete from public.analyses where id = analysis_id;
    if exists(select 1 from public.paddle_ocr_admissions where public.paddle_ocr_admissions.analysis_id = analysis_id)
       or exists(select 1 from public.paddle_ocr_attempt_events where public.paddle_ocr_attempt_events.admission_id = admission_id) then
      raise exception 'Analysis deletion retained admission receipts';
    end if;
    raise exception 'Rollback synthetic PaddleOCR admission fixtures' using errcode = 'ZAA17';
  exception when sqlstate 'ZAA17' then null;
  end;
end;
$$;
