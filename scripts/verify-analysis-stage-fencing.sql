-- DRAFT / NOT EXECUTED. Requires a reviewed isolated direct Supabase native-SQL
-- target, exact migration/fixture allocation and stop-on-error execution.
-- The owned fault trigger below is transaction-only test DDL, never a production
-- mechanism. Settings do not establish isolation or grant permission. No global
-- queue claim, worker, provider, parser, OCR or candidate document is executed.
begin;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
declare k text; v text;
begin
  if current_setting('resumide.stage_fence_test_admission',true) is distinct from 'isolated-managed-synthetic-stage/2' then
    raise exception 'Stage-fence native target not admitted' using errcode='42501';
  end if;
  foreach k in array array['resumide.stage_fence_test_run_id','resumide.stage_fence_test_owner_id'] loop
    v:=current_setting(k,true);
    if v is null or v !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'Stage-fence fixture identity not allocated' using errcode='42501';
    end if;
  end loop;
  if exists(select 1 from auth.users where id=current_setting('resumide.stage_fence_test_owner_id')::uuid)
    or exists(select 1 from pg_trigger where tgname='r10_owned_expiry_probe') then
    raise exception 'Stage-fence owned namespace already exists' using errcode='42501';
  end if;
end;
$admission$;
create function pg_temp.stage_assert(p_condition boolean,p_label text)
returns void language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Stage-fence assertion: %',p_label using errcode='23514'; end if;
end;
$$;
-- nextval is intentionally nontransactional: is_called proves the inner insert
-- reached the fault trigger even after its table writes are rolled back.
create temporary sequence r10_stage_probe;
create function pg_temp.r10_expire_owned_lease()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.analysis_id::text=current_setting('resumide.stage_fence_fault_analysis_id',true) then
    perform nextval('pg_temp.r10_stage_probe'::regclass);
    update public.analysis_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where analysis_id=new.analysis_id;
  end if;
  return new;
end;
$$;
create trigger r10_owned_expiry_probe after insert on public.analysis_extractions
  for each row execute function pg_temp.r10_expire_owned_lease();

do $verify$
#variable_conflict use_variable
declare
  owner_id uuid:=current_setting('resumide.stage_fence_test_owner_id')::uuid;
  run_id uuid:=current_setting('resumide.stage_fence_test_run_id')::uuid;
  org_id uuid; resume_id uuid:=gen_random_uuid(); version_id uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); old_fence uuid:=gen_random_uuid(); current_fence uuid:=gen_random_uuid(); b_fence uuid:=gen_random_uuid();
  worker text:='stage-test-'||run_id; neutral text:='Synthetic stage evidence.'; original_expiry timestamptz;
  transition_args jsonb; extraction_args jsonb; p record; role_name text;
begin
  for p in select * from pg_proc where oid in (to_regprocedure('public.assert_analysis_stage_lease(uuid,text,integer,uuid)'),
    to_regprocedure('public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)')) loop
    perform pg_temp.stage_assert(p.prosecdef and exists(select 1 from pg_options_to_table(p.proconfig)
      where option_name='search_path' and option_value in ('','""')),'service_definer_empty_path');
    perform pg_temp.stage_assert(has_function_privilege('service_role',p.oid,'EXECUTE'),'service_only_execute');
    foreach role_name in array array['anon','authenticated'] loop
      perform pg_temp.stage_assert(not has_function_privilege(role_name,p.oid,'EXECUTE'),'client_execute_denied');
    end loop;
  end loop;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','r10-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(resume_id,org_id,owner_id,'Synthetic stage fixture');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(version_id,resume_id,org_id,owner_id,'r10-synthetic/'||version_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(a,version_id,org_id,owner_id,'queued',gen_random_uuid()),(b,version_id,org_id,owner_id,'extracting',gen_random_uuid());
  -- Seed exact leases for guard assertions; this is not a real claim/reclaim or
  -- concurrent worker proof. R08/R11 require their own admitted runtime drills.
  insert into public.analysis_jobs(analysis_id,lease_owner,lease_fence,attempt_count,lease_expires_at)
    values(a,worker,old_fence,1,clock_timestamp()+interval '120 seconds'),(b,worker,b_fence,1,clock_timestamp()+interval '120 seconds');
  update public.analysis_jobs set lease_fence=current_fence,attempt_count=2 where analysis_id=a;
  perform pg_temp.stage_assert(not public.assert_analysis_stage_lease(a,worker,1,old_fence),'stale_tuple_denied');
  perform pg_temp.stage_assert(not public.assert_analysis_stage_lease(a,worker,2,old_fence),'old_fence_same_worker_denied');
  perform pg_temp.stage_assert(public.assert_analysis_stage_lease(a,worker,2,current_fence),'current_lease_asserted');
  transition_args:=jsonb_build_object('p_analysis_id',a,'p_expected_status','queued','p_next_status','extracting',
    'p_actor_id',null,'p_process_id',worker,'p_request_id','r10-owned-request');
  perform pg_temp.stage_assert(not public.persist_analysis_stage_v2(a,worker,2,current_fence,'unknown_operation',transition_args),'unknown_operation_denied');
  perform pg_temp.stage_assert(not public.persist_analysis_stage_v2(a,worker,2,current_fence,'transition_analysis',transition_args||jsonb_build_object('p_analysis_id',b)),'foreign_parameter_identity_denied');
  perform pg_temp.stage_assert(not public.persist_analysis_stage_v2(a,worker,2,current_fence,'transition_analysis',transition_args||jsonb_build_object('p_actor_id',owner_id)),'worker_actor_not_null_denied');
  perform pg_temp.stage_assert((select status='queued' from public.analyses where id=a),'invalid_calls_no_transition');
  perform pg_temp.stage_assert(public.persist_analysis_stage_v2(a,worker,2,current_fence,'transition_analysis',transition_args),'typed_transition_commits');
  extraction_args:=jsonb_build_object('p_analysis_id',a,'p_duration_ms',1,'p_extracted_text',neutral,'p_extractor_version','unpdf-v1',
    'p_page_count',1,'p_page_texts',jsonb_build_array(neutral),'p_process_id',worker,'p_request_id','r10-owned-request',
    'p_text_checksum',encode(extensions.digest(convert_to(neutral,'UTF8'),'sha256'),'hex'),'p_warnings','[]'::jsonb);
  perform pg_temp.stage_assert(not public.persist_analysis_stage_v2(a,worker,1,old_fence,'persist_analysis_extraction',extraction_args),'stale_extraction_denied');
  perform pg_temp.stage_assert(not exists(select 1 from public.analysis_extractions where analysis_id=a),'stale_call_no_extraction');
  perform pg_temp.stage_assert(public.persist_analysis_stage_v2(a,worker,2,current_fence,'persist_analysis_extraction',extraction_args),'typed_extraction_commits');
  perform pg_temp.stage_assert((select status='scoring' from public.analyses where id=a),'typed_extraction_preserves_transition');

  select lease_expires_at into original_expiry from public.analysis_jobs where analysis_id=b;
  perform set_config('resumide.stage_fence_fault_analysis_id',b::text,true);
  extraction_args:=extraction_args||jsonb_build_object('p_analysis_id',b,'p_page_count',2,
    'p_extracted_text',neutral||E'\n\n'||neutral,'p_page_texts',jsonb_build_array(neutral,neutral),
    'p_text_checksum',encode(extensions.digest(convert_to(neutral||E'\n\n'||neutral,'UTF8'),'sha256'),'hex'));
  perform pg_temp.stage_assert(not public.persist_analysis_stage_v2(b,worker,1,b_fence,'persist_analysis_extraction',extraction_args),'postwrite_expiry_withholds_and_rolls_back');
  perform pg_temp.stage_assert((select is_called from pg_temp.r10_stage_probe),'inner_insert_reached_fault_trigger');
  perform pg_temp.stage_assert(not exists(select 1 from public.analysis_extractions where analysis_id=b),'expired_postcheck_undoes_extraction');
  perform pg_temp.stage_assert((select status='extracting' from public.analyses where id=b),'expired_postcheck_undoes_status');
  perform pg_temp.stage_assert((select page_count=1 from public.resume_versions where id=version_id),'expired_postcheck_undoes_source_update');
  perform pg_temp.stage_assert((select lease_expires_at=original_expiry from public.analysis_jobs where analysis_id=b),'fault_update_also_rolled_back');
end;
$verify$;
-- Roll back source fixtures, fault trigger, sequence and temporary helper DDL.
-- This draft is not execution, a real queue run, isolation or concurrency proof.
rollback;
