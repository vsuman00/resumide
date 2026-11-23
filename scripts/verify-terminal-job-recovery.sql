-- DRAFT / NOT EXECUTED. Calls GLOBAL recovery: only an exclusively allocated,
-- independently verified isolated direct Supabase native target is eligible.
-- Exact settings/empty-queue checks do NOT establish isolation or authorization.
-- No shared-project execution, Docker DB, live worker, provider or document read.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
begin
  if current_setting('resumide.recovery_test_admission',true) is distinct from 'isolated-managed-synthetic-recovery/1'
    or coalesce(current_setting('resumide.recovery_test_run_id',true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or coalesce(current_setting('resumide.recovery_test_owner_id',true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    raise exception 'Recovery native target/fixtures not admitted' using errcode='42501'; end if;
  if exists(select 1 from public.analysis_jobs) or exists(select 1 from auth.users where id=current_setting('resumide.recovery_test_owner_id')::uuid) then
    raise exception 'Recovery owned namespace is not empty' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.recovery_assert(p_condition boolean,p_label text)
returns void language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Recovery assertion: %',p_label using errcode='23514'; end if;
end;
$$;
do $verify$
#variable_conflict use_variable
declare owner_id uuid:=current_setting('resumide.recovery_test_owner_id')::uuid;
  org_id uuid; resume_id uuid:=gen_random_uuid(); version_id uuid:=gen_random_uuid();
  completed_id uuid:=gen_random_uuid(); partial_id uuid:=gen_random_uuid(); rejected_id uuid:=gen_random_uuid();
  live_id uuid:=gen_random_uuid(); uncertain_id uuid:=gen_random_uuid(); failed_id uuid:=gen_random_uuid(); dead_id uuid:=gen_random_uuid();
  review_id uuid:=gen_random_uuid(); evidence_id uuid:=gen_random_uuid();
  prior_jobs jsonb; after_jobs jsonb; prior_analyses jsonb;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','r11-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(resume_id,org_id,owner_id,'Synthetic recovery fixture');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(version_id,resume_id,org_id,owner_id,'r11-synthetic/'||version_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(completed_id,version_id,org_id,owner_id,'completed',gen_random_uuid()),(partial_id,version_id,org_id,owner_id,'partial',gen_random_uuid()),
      (rejected_id,version_id,org_id,owner_id,'rejected',gen_random_uuid()),(live_id,version_id,org_id,owner_id,'completed',gen_random_uuid()),
      (failed_id,version_id,org_id,owner_id,'failed',gen_random_uuid()),(dead_id,version_id,org_id,owner_id,'failed',gen_random_uuid()),
      (review_id,version_id,org_id,owner_id,'extracting',gen_random_uuid()),(uncertain_id,version_id,org_id,owner_id,'completed',gen_random_uuid());
  insert into public.analysis_jobs(analysis_id,lease_owner,lease_fence,attempt_count,lease_expires_at,last_error_code,dead_lettered_at)
    values(completed_id,null,null,1,null,null,null),(partial_id,'synthetic',gen_random_uuid(),2,clock_timestamp()-interval '1 second',null,null),
      (rejected_id,null,null,1,null,null,null),(live_id,'synthetic',gen_random_uuid(),1,clock_timestamp()+interval '120 seconds',null,null),
      (failed_id,'synthetic',gen_random_uuid(),2,clock_timestamp()-interval '1 second','AI_TIMEOUT',null),
      (dead_id,null,gen_random_uuid(),3,null,'AI_TIMEOUT',clock_timestamp()),(review_id,null,null,1,null,null,null),(uncertain_id,'synthetic-uncertain',gen_random_uuid(),1,null,null,null);
  -- Exact operational handoff fixture, NOT evidence producer/extraction validation.
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(evidence_id,review_id,org_id,owner_id,version_id,repeat('a',64),1,jsonb_build_object(
      'schemaVersion','evidence/2.0.0','id',evidence_id,'analysisId',review_id,'ownerId',owner_id,'sourceId',version_id,
      'inputSha256',repeat('a',64),'scoringEligible',false,'confidence',jsonb_build_object('kind','uncalibrated','reason','calibration_not_approved'),'status','review_required'));
  select jsonb_agg(to_jsonb(j) order by j.analysis_id) into prior_jobs from public.analysis_jobs j where analysis_id in(live_id,dead_id,uncertain_id);
  select jsonb_agg(to_jsonb(a) order by a.id) into prior_analyses from public.analyses a where a.owner_id=owner_id;
  perform pg_temp.recovery_assert(public.recover_terminal_analysis_jobs_v2(100)=5,'finished_review_removed_failed_normalized');
  perform pg_temp.recovery_assert(not exists(select 1 from public.analysis_jobs where analysis_id in(completed_id,partial_id,rejected_id,review_id)),'finished_metadata_removed');
  perform pg_temp.recovery_assert((select attempt_count=2 and last_error_code='AI_TIMEOUT' and lease_fence is not null and dead_lettered_at is not null from public.analysis_jobs where analysis_id=failed_id),'failed_history_preserved');
  select jsonb_agg(to_jsonb(j) order by j.analysis_id) into after_jobs from public.analysis_jobs j where analysis_id in(live_id,dead_id,uncertain_id);
  perform pg_temp.recovery_assert(prior_jobs=after_jobs,'live_uncertain_lease_and_deadletter_unchanged');
  perform pg_temp.recovery_assert(public.recover_terminal_analysis_jobs_v2(100)=0,'recovery_idempotent');
  perform pg_temp.recovery_assert(prior_analyses=(select jsonb_agg(to_jsonb(a) order by a.id) from public.analyses a where a.owner_id=owner_id),'no_result_or_status_rewrite');
  perform pg_temp.recovery_assert(exists(select 1 from public.document_evidence_attempts where id=evidence_id),'review_evidence_preserved');
end;
$verify$;
rollback;
-- Restart/global claim/sweep, reclaim races, exact current-source negative and
-- deletion contention drills remain separate native acceptance, NOT proven here.
