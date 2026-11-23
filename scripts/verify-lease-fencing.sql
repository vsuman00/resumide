-- DRAFT / NOT EXECUTED. GLOBAL claim/sweep calls below are permitted ONLY on a
-- separately verified, exclusively allocated isolated direct Supabase target.
-- No shared-project scoped RPC is supplied. Settings and an empty snapshot do
-- NOT prove isolation or authorize applying/running this file. Never run it on
-- the configured shared project or a Docker database. No provider/OCR runs.
begin;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';

do $admission$
declare key text; value text;
begin
  if current_setting('resumide.lease_fence_test_admission',true) is distinct from 'isolated-managed-synthetic-lease/2' then
    raise exception 'Lease-fence native target not admitted' using errcode='42501';
  end if;
  foreach key in array array['resumide.lease_fence_test_run_id','resumide.lease_fence_test_owner_id','resumide.lease_fence_test_other_owner_id'] loop
    value:=current_setting(key,true);
    if value is null or value !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'Lease-fence fixture identity not allocated' using errcode='42501';
    end if;
  end loop;
  if current_setting('resumide.lease_fence_test_owner_id')=current_setting('resumide.lease_fence_test_other_owner_id') then
    raise exception 'Lease-fence fixture identities collide' using errcode='42501';
  end if;
  -- Negative sanity check only; it cannot prevent a shared producer racing us.
  if exists(select 1 from public.analysis_jobs) then
    raise exception 'Lease-fence isolated queue is not empty' using errcode='42501';
  end if;
end;
$admission$;

create function pg_temp.lease_assert(p_condition boolean,p_label text)
returns void language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Lease-fence assertion: %',p_label using errcode='23514'; end if;
end;
$$;
create function pg_temp.lease_fixture(p_owner uuid,p_org uuid,p_version uuid,p_status text default 'queued')
returns uuid language plpgsql set search_path='' as $$
declare id uuid:=gen_random_uuid();
begin
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(id,p_version,p_org,p_owner,p_status,gen_random_uuid());
  insert into public.analysis_jobs(analysis_id,run_after) values(id,clock_timestamp()-interval '1 second');
  return id;
end;
$$;
create function pg_temp.lease_review_fixture(p_analysis uuid,p_owner uuid,p_org uuid,p_version uuid,p_checksum text)
returns void language plpgsql set search_path='' as $$
declare evidence_id uuid:=gen_random_uuid();
begin
  -- Seed only operational identity metadata as an operator. This does NOT test
  -- persist_document_evidence's full producer grammar, extraction or OCR truth.
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(evidence_id,p_analysis,p_org,p_owner,p_version,p_checksum,1,jsonb_build_object(
      'schemaVersion','evidence/2.0.0','id',evidence_id,'analysisId',p_analysis,'ownerId',p_owner,'sourceId',p_version,
      'inputSha256',p_checksum,'scoringEligible',false,'confidence',jsonb_build_object('kind','uncalibrated','reason','calibration_not_approved'),
      'status','review_required'));
end;
$$;

do $catalog$
declare name text; r text; p record;
begin
  perform pg_temp.lease_assert(exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='analysis_jobs' and column_name='lease_fence' and udt_name='uuid'),'opaque_fence_column');
  foreach r in array array['anon','authenticated','service_role'] loop
    perform pg_temp.lease_assert(not has_table_privilege(r,'public.analysis_jobs','INSERT,UPDATE,DELETE,TRUNCATE'),'no_direct_queue_dml');
  end loop;
  foreach name in array array['claim_analysis_job_v2(text,integer)','heartbeat_analysis_job_v2(uuid,text,integer,uuid,integer)',
    'complete_analysis_job_v2(uuid,text,integer,uuid)','release_analysis_job_v2(uuid,text,integer,uuid,integer,text)'] loop
    select * into strict p from pg_proc where oid=to_regprocedure('public.'||name);
    perform pg_temp.lease_assert(p.prosecdef,'v2_definer');
    perform pg_temp.lease_assert(exists(select 1 from pg_options_to_table(p.proconfig)
      where option_name='search_path' and option_value in ('','""')),'v2_empty_search_path');
    perform pg_temp.lease_assert(has_function_privilege('service_role',p.oid,'EXECUTE'),'v2_service_grant');
    foreach r in array array['anon','authenticated'] loop
      perform pg_temp.lease_assert(not has_function_privilege(r,p.oid,'EXECUTE'),'no_client_v2_grant');
    end loop;
  end loop;
end;
$catalog$;

do $fixtures$
#variable_conflict use_variable
declare
  run_id uuid:=current_setting('resumide.lease_fence_test_run_id')::uuid;
  owner_id uuid:=current_setting('resumide.lease_fence_test_owner_id')::uuid;
  other_owner uuid:=current_setting('resumide.lease_fence_test_other_owner_id')::uuid;
  org_id uuid; other_org uuid; resume_id uuid:=gen_random_uuid(); other_resume uuid:=gen_random_uuid();
  version_id uuid:=gen_random_uuid(); alternate_version uuid:=gen_random_uuid(); other_version uuid:=gen_random_uuid();
  a uuid; b uuid; rejected_id uuid; completed_id uuid; review_id uuid; foreign_review uuid; cap_review uuid; cancel_id uuid;
  good_expired uuid; good_next uuid; bad uuid; n integer;
  claim jsonb; first_fence uuid; second_fence uuid; third_fence uuid; cap_fence uuid; foreign_fence uuid;
  worker text:='lease-test-'||run_id;
begin
  if exists(select 1 from auth.users u where u.id in (owner_id,other_owner)) then
    raise exception 'Lease-fence owner namespace already exists' using errcode='42501';
  end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
    (owner_id,'authenticated','authenticated','r08-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
    (other_owner,'authenticated','authenticated','r08-'||other_owner||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  select o.id into strict other_org from public.organizations o where o.owner_id=other_owner;
  insert into public.resumes(id,organization_id,owner_id,display_name) values
    (resume_id,org_id,owner_id,'Synthetic lease fixture'),(other_resume,other_org,other_owner,'Synthetic revoked fixture');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type) values
    (version_id,resume_id,org_id,owner_id,'r08-synthetic/'||version_id,repeat('a',64),1024,'application/pdf'),
    (alternate_version,resume_id,org_id,owner_id,'r08-synthetic/'||alternate_version,repeat('b',64),1024,'application/pdf'),
    (other_version,other_resume,other_org,other_owner,'r08-synthetic/'||other_version,repeat('c',64),1024,'application/pdf');

  a:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  perform pg_temp.lease_assert(claim->>'schemaVersion'='analysis-job-lease/2.0.0' and claim->>'analysisId'=a::text
    and claim->>'attempt'='1' and (select array_agg(k order by k) from jsonb_object_keys(claim) k)
      =array['analysisId','attempt','leaseExpiresAt','leaseFence','runAfter','schemaVersion'],'strict_claim_dto');
  first_fence:=(claim->>'leaseFence')::uuid;
  perform pg_temp.lease_assert((claim->>'leaseExpiresAt')::timestamptz>clock_timestamp(),'claim_unexpired');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job(a,worker,120),'legacy_heartbeat_cannot_touch_fence');
  perform pg_temp.lease_assert(not public.complete_analysis_job(a,worker),'legacy_complete_cannot_touch_fence');
  perform pg_temp.lease_assert(not public.release_analysis_job(a,worker,0,'PROCESSING_FAILED'),'legacy_release_cannot_touch_fence');
  perform pg_temp.lease_assert(not public.complete_analysis_job_v2(a,worker,1,first_fence),'active_without_result_not_completed');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(a,'foreign-worker',1,first_fence,120),'foreign_worker_denied');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(a,worker,1,gen_random_uuid(),120),'foreign_fence_denied');
  update public.analysis_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=a;
  perform pg_temp.lease_assert(public.claim_analysis_job(worker,120) is null,'legacy_claim_cannot_steal_expired_fence');
  claim:=public.claim_analysis_job_v2(worker,120); second_fence:=(claim->>'leaseFence')::uuid;
  perform pg_temp.lease_assert(claim->>'analysisId'=a::text and claim->>'attempt'='2' and second_fence<>first_fence,'same_worker_reclaim_rotates_token');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(a,worker,2,first_fence,120),'old_token_same_worker_new_attempt_denied');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(a,worker,1,second_fence,120),'old_attempt_current_token_denied');
  perform pg_temp.lease_assert(not public.complete_analysis_job_v2(a,worker,1,first_fence),'stale_completion_denied');
  perform pg_temp.lease_assert(not public.release_analysis_job_v2(a,worker,1,first_fence,0,'PROCESSING_FAILED'),'stale_release_denied');
  perform pg_temp.lease_assert(public.heartbeat_analysis_job_v2(a,worker,2,second_fence,120),'current_heartbeat');
  perform pg_temp.lease_assert(public.heartbeat_analysis_job_v2(a,worker,2,second_fence,120),'duplicate_heartbeat_safe');
  perform pg_temp.lease_assert(public.release_analysis_job_v2(a,worker,2,second_fence,0,'PROCESSING_FAILED'),'current_release');
  perform pg_temp.lease_assert((select j.lease_fence=second_fence and j.lease_owner is null from public.analysis_jobs j where j.analysis_id=a),'retry_retains_fence_tombstone');
  perform pg_temp.lease_assert(public.claim_analysis_job(worker,120) is null,'legacy_cannot_adopt_fenced_retry');
  claim:=public.claim_analysis_job_v2(worker,120); third_fence:=(claim->>'leaseFence')::uuid;
  perform pg_temp.lease_assert(claim->>'attempt'='3' and third_fence<>second_fence,'third_claim_rotates');
  update public.analysis_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=a;
  perform pg_temp.lease_assert(public.claim_analysis_job(worker,120) is null,'legacy_sweep_does_not_deadletter_fenced_row');
  perform pg_temp.lease_assert((select j.dead_lettered_at is null from public.analysis_jobs j where j.analysis_id=a),'legacy_sweep_no_mutation');
  perform pg_temp.lease_assert(public.claim_analysis_job_v2(worker,120) is null,'expired_final_attempt_not_reclaimed');
  perform pg_temp.lease_assert((select x.status='failed' and j.dead_lettered_at is not null and j.last_error_code='LEASE_EXPIRED'
    from public.analyses x join public.analysis_jobs j on j.analysis_id=x.id where x.id=a),'expired_cap_deadletter_and_transition');

  b:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  for n in 1..3 loop
    claim:=public.claim_analysis_job_v2(worker,120);
    perform pg_temp.lease_assert(claim->>'analysisId'=b::text and (claim->>'attempt')::integer=n,'release_retry_sequence');
    perform pg_temp.lease_assert(public.release_analysis_job_v2(b,worker,n,(claim->>'leaseFence')::uuid,0,'PROCESSING_FAILED'),'release_each_owned_attempt');
  end loop;
  perform pg_temp.lease_assert((select x.status='failed' and j.dead_lettered_at is not null and j.last_error_code='PROCESSING_FAILED'
    from public.analyses x join public.analysis_jobs j on j.analysis_id=x.id where x.id=b),'release_cap_deadletter');

  rejected_id:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  update public.analyses set status='rejected' where id=rejected_id;
  perform pg_temp.lease_assert(public.complete_analysis_job_v2(rejected_id,worker,1,(claim->>'leaseFence')::uuid),'rejected_pdf_terminal_cleanup');
  completed_id:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  update public.analyses set status='completed' where id=completed_id;
  perform pg_temp.lease_assert(public.complete_analysis_job_v2(completed_id,worker,1,(claim->>'leaseFence')::uuid),'completed_terminal_cleanup');
  perform pg_temp.lease_assert(not public.complete_analysis_job_v2(completed_id,worker,1,(claim->>'leaseFence')::uuid),'duplicate_completion_not_owned');

  review_id:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  update public.analyses set status='needs_ocr' where id=review_id;
  perform pg_temp.lease_review_fixture(review_id,owner_id,org_id,version_id,repeat('a',64));
  perform pg_temp.lease_assert(public.complete_analysis_job_v2(review_id,worker,1,(claim->>'leaseFence')::uuid),'current_source_review_handoff_cleanup');
  perform pg_temp.lease_assert((select status='needs_ocr' from public.analyses where id=review_id),'handoff_preserves_review_status');
  foreign_review:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120); foreign_fence:=(claim->>'leaseFence')::uuid;
  update public.analyses set status='needs_ocr' where id=foreign_review;
  perform pg_temp.lease_review_fixture(foreign_review,owner_id,org_id,alternate_version,repeat('b',64));
  perform pg_temp.lease_assert(not public.complete_analysis_job_v2(foreign_review,worker,1,foreign_fence),'other_source_metadata_not_handoff');
  delete from public.memberships m where m.organization_id=org_id and m.user_id=owner_id;
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(foreign_review,worker,1,foreign_fence,120),'revoked_member_heartbeat_denied');
  perform pg_temp.lease_assert(not public.release_analysis_job_v2(foreign_review,worker,1,foreign_fence,0,'PROCESSING_FAILED'),'revoked_member_release_denied');
  insert into public.memberships(organization_id,user_id,role) values(org_id,owner_id,'owner');
  update public.resumes set status='deleted' where id=resume_id;
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(foreign_review,worker,1,foreign_fence,120),'deleted_source_heartbeat_denied');
  update public.resumes set status='active' where id=resume_id;

  cap_review:=pg_temp.lease_fixture(owner_id,org_id,version_id,'needs_ocr'); cap_fence:=gen_random_uuid();
  perform pg_temp.lease_review_fixture(cap_review,owner_id,org_id,version_id,repeat('a',64));
  update public.analysis_jobs set attempt_count=3,lease_fence=cap_fence,lease_owner=worker,
    lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=cap_review;
  cancel_id:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  perform pg_temp.lease_assert(claim->>'analysisId'=cancel_id::text,'review_cap_does_not_steal_next_claim');
  perform pg_temp.lease_assert(public.cancel_analysis(cancel_id,owner_id,'r08-owned-cancel')='cancelled','authorized_cancel_invalidates_job');
  perform pg_temp.lease_assert(not public.heartbeat_analysis_job_v2(cancel_id,worker,1,(claim->>'leaseFence')::uuid,120),'cancelled_fence_cannot_renew');
  perform pg_temp.lease_assert((select x.status='needs_ocr' and j.dead_lettered_at is null and j.lease_fence=cap_fence
    from public.analyses x join public.analysis_jobs j on j.analysis_id=x.id where x.id=cap_review),'expired_review_handoff_not_failed');

  -- Concrete LIMIT100 regression: both permanently ineligible prefixes are
  -- filtered BEFORE the sweep/selection limit, not after locking each bad row.
  delete from public.memberships m where m.organization_id=other_org and m.user_id=other_owner;
  for n in 1..200 loop
    bad:=pg_temp.lease_fixture(other_owner,other_org,other_version);
    update public.analysis_jobs set run_after=clock_timestamp()-interval '1 day',
      attempt_count=case when n<=100 then 0 else 3 end,
      lease_expires_at=case when n<=100 then null else clock_timestamp()-interval '1 hour' end,
      lease_fence=case when n<=100 then null else gen_random_uuid() end where analysis_id=bad;
  end loop;
  good_expired:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  update public.analysis_jobs set attempt_count=3,lease_fence=gen_random_uuid(),lease_owner=worker,
    lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=good_expired;
  good_next:=pg_temp.lease_fixture(owner_id,org_id,version_id);
  claim:=public.claim_analysis_job_v2(worker,120);
  perform pg_temp.lease_assert(claim->>'analysisId'=good_next::text,'revoked_prefix_cannot_starve_valid_claim');
  perform pg_temp.lease_assert((select x.status='failed' and j.dead_lettered_at is not null
    from public.analyses x join public.analysis_jobs j on j.analysis_id=x.id where x.id=good_expired),'revoked_prefix_cannot_starve_valid_sweep');
  perform pg_temp.lease_assert((select count(*)=200 from public.analyses x join public.analysis_jobs j on j.analysis_id=x.id
    where x.owner_id=other_owner and j.dead_lettered_at is null),'revoked_prefix_not_mutated');
end;
$fixtures$;

-- Single-session statements above are NOT a concurrent-worker, deadlock,
-- shutdown, atomic-stage-write, source/consent-revocation or real global queue
-- proof. Real expiry/same-worker races require separately admitted two-session
-- or owned-worker drills on an isolated target. No such operation ran here.
rollback;
