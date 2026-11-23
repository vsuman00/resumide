-- DRAFT / NOT EXECUTED. Exact owned synthetic fixtures on a separately admitted
-- direct Supabase native-SQL target only; no Docker DB, provider or global worker.
-- Settings are assertions by the operator, NOT isolation/permission evidence.
-- This single-session draft cannot prove advisory contention or commit visibility.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
declare k text;
begin
  if current_setting('resumide.privacy_barrier_test_admission',true) is distinct from 'isolated-managed-synthetic-privacy/1' then
    raise exception 'Privacy native target not admitted' using errcode='42501'; end if;
  foreach k in array array['resumide.privacy_barrier_test_run_id','resumide.privacy_barrier_test_owner_id'] loop
    if coalesce(current_setting(k,true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'Privacy fixture identity not allocated' using errcode='42501'; end if;
  end loop;
  if exists(select 1 from auth.users where id=current_setting('resumide.privacy_barrier_test_owner_id')::uuid) then
    raise exception 'Privacy fixture already exists' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.privacy_assert(p_condition boolean,p_label text)
returns void language plpgsql set search_path='' as $$
begin
  if p_condition is not true then raise exception 'Privacy assertion: %',p_label using errcode='23514'; end if;
end;
$$;
do $verify$
#variable_conflict use_variable
declare owner_id uuid:=current_setting('resumide.privacy_barrier_test_owner_id')::uuid;
  org_id uuid; request_id uuid:=gen_random_uuid(); export_id uuid:=gen_random_uuid();
  resume_id uuid:=gen_random_uuid(); state text; denied boolean;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','r19-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(resume_id,org_id,owner_id,'Synthetic privacy fixture');
  insert into public.data_requests(id,organization_id,user_id,kind) values(export_id,org_id,owner_id,'export');
  perform pg_temp.privacy_assert(private.try_candidate_privacy_write(owner_id),'initial_work_allowed');
  insert into public.data_requests(id,organization_id,user_id,kind) values(request_id,org_id,owner_id,'deletion');
  foreach state in array array['queued','processing','completed'] loop
    update public.data_requests set status=state where id=request_id;
    perform pg_temp.privacy_assert(private.candidate_write_blocked(owner_id),'active_deletion_blocks');
    denied:=false;
    begin
      insert into public.jobs(organization_id,owner_id,title) values(org_id,owner_id,'Synthetic blocked');
    exception when insufficient_privilege then denied:=true; end;
    perform pg_temp.privacy_assert(denied,'legacy_direct_content_write_denied');
  end loop;
  denied:=false;
  begin
    insert into public.data_requests(organization_id,user_id,kind) values(org_id,owner_id,'export');
  exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.privacy_assert(denied,'new_export_intake_denied');
  denied:=false;
  begin
    update public.data_requests set result_manifest='{"synthetic":true}'::jsonb where id=export_id;
  exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.privacy_assert(denied,'new_export_copy_denied');
  update public.data_requests set status='failed',result_manifest=null where id=export_id;
  update public.resumes set status='deleted' where id=resume_id;
  perform pg_temp.privacy_assert((select status='deleted' from public.resumes where id=resume_id),'retention_tombstone_allowed');
  foreach state in array array['cancelled','failed'] loop
    update public.data_requests set status=state where id=request_id;
    perform pg_temp.privacy_assert(not private.candidate_write_blocked(owner_id),'inactive_deletion_allows_work');
    insert into public.jobs(organization_id,owner_id,title) values(org_id,owner_id,'Synthetic allowed');
  end loop;
  -- Same-session shared→exclusive succeeds by design; it is NOT contention proof.
end;
$verify$;
rollback;
-- Separately admitted two-session drill is still required: writer shared lock
-- versus deletion insert/status-update must return55P03 without waiting, and
-- deletion-held exclusive versus writer must deny/no-write. After deletion COMMIT,
-- a writer whose outer statement began earlier must observe the committed blocker.
-- Test REPEATABLE READ/SERIALIZABLE rejection separately; no inferred race PASS.
