-- Forward-only compatibility bridge. SOURCE ONLY: no hosted application,
-- worker claim, provider, candidate scan or index operation has been authorized.
-- Do not replay complete_phase4: newer persistence/taxonomy must remain intact.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';
do $bridge$
declare
  transition_ddl text:=$transition$create or replace function public.transition_analysis(
  p_analysis_id uuid,
  p_expected_status text,
  p_next_status text,
  p_actor_id uuid,
  p_process_id text,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_allowed boolean;
begin
  transition_allowed := (p_expected_status, p_next_status) in (
    ('created', 'uploading'), ('created', 'cancelled'),
    ('uploading', 'quarantined'), ('uploading', 'cancelled'),
    ('quarantined', 'queued'), ('quarantined', 'rejected'), ('quarantined', 'failed'),
    ('queued', 'extracting'), ('queued', 'cancelled'), ('queued', 'failed'),
    ('extracting', 'scoring'), ('extracting', 'needs_ocr'), ('extracting', 'failed'),
    ('needs_ocr', 'scoring'), ('needs_ocr', 'failed'),
    ('scoring', 'qualitative_review'), ('scoring', 'failed'),
    ('qualitative_review', 'completed'), ('qualitative_review', 'partial'), ('qualitative_review', 'failed')
  );
  if not transition_allowed then
    raise exception 'invalid analysis transition' using errcode = '22023';
  end if;

  update public.analyses
  set status = p_next_status,
      current_attempt = current_attempt + case when p_next_status = 'extracting' then 1 else 0 end,
      request_id = p_request_id,
      stage_updated_at = timezone('utc', now()),
      completed_at = case when p_next_status in ('completed', 'partial', 'failed', 'cancelled', 'rejected') then timezone('utc', now()) else completed_at end
  where id = p_analysis_id and status = p_expected_status;
  if not found then return false; end if;

  insert into public.analysis_transitions (
    analysis_id, from_status, to_status, actor_id, process_id, request_id
  ) values (
    p_analysis_id, p_expected_status, p_next_status, p_actor_id, p_process_id, p_request_id
  );
  return true;
end;
$$;$transition$;
  release_ddl text:=$release$create or replace function public.release_analysis_job(
  p_analysis_id uuid,p_worker_id text,p_retry_delay_seconds integer,p_error_code text
)
returns boolean language plpgsql security definer set search_path='' as $$
declare analysis_row public.analyses%rowtype; job_row public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_analysis_id is null or p_worker_id is null or btrim(p_worker_id)=''
    or p_retry_delay_seconds is null or p_retry_delay_seconds<0 or p_retry_delay_seconds>3600
    or p_error_code is null or btrim(p_error_code)='' then return false; end if;
  -- Same analysis→job order as cancel, R08 and the atomic stage wrapper.
  select * into analysis_row from public.analyses where id=p_analysis_id for update;
  if not found or analysis_row.status not in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review') then return false; end if;
  select * into job_row from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id for update;
  if not found then return false; end if;
  checked_at:=clock_timestamp();
  -- JSON field lookup preserves the NULL-fence boundary before/after R08 adds
  -- the column. A legacy caller must never mutate a token-protected row.
  if to_jsonb(job_row)->>'lease_fence' is not null or job_row.dead_lettered_at is not null
    or job_row.attempt_count not between 1 and 3 or job_row.lease_expires_at is null or job_row.lease_expires_at<=checked_at then return false; end if;
  if job_row.attempt_count<3 then
    update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,
      run_after=checked_at+make_interval(secs=>p_retry_delay_seconds) where analysis_id=p_analysis_id;
    return true;
  end if;
  update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,dead_lettered_at=checked_at
    where analysis_id=p_analysis_id;
  if not public.transition_analysis(analysis_row.id,analysis_row.status,'failed',null,p_worker_id,
    coalesce(analysis_row.request_id,'worker-dead-letter')) then
    raise exception 'Legacy dead-letter transition failed' using errcode='23514'; end if;
  return true;
end;
$$;$release$;
  cancel_ddl text:=$cancel$create or replace function public.cancel_analysis(p_analysis_id uuid,p_user_id uuid,p_request_id text)
returns text language plpgsql security definer set search_path='' as $$
declare analysis_row public.analyses%rowtype; job_row public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_analysis_id is null or p_user_id is null or p_request_id is null or char_length(p_request_id) not between 1 and 128 then return 'not_found'; end if;
  select * into analysis_row from public.analyses where id=p_analysis_id and owner_id=p_user_id for update;
  if not found then return 'not_found'; end if;
  if analysis_row.status='cancelled' then return 'already_cancelled'; end if;
  if analysis_row.status not in ('quarantined','queued') then return 'already_started'; end if;
  select * into job_row from public.analysis_jobs where analysis_id=p_analysis_id for update;
  if found then
    checked_at:=clock_timestamp();
    -- Proven unleased means BOTH fields NULL. Owner-set/missing-expiry is
    -- uncertain; any future expiry is live even if its owner is malformed/null.
    if (job_row.lease_expires_at is null and job_row.lease_owner is not null)
      or (job_row.lease_expires_at is not null and job_row.lease_expires_at>checked_at) then return 'already_started'; end if;
  end if;
  update public.analyses set status='cancelled',request_id=p_request_id,
    stage_updated_at=timezone('utc',now()),completed_at=timezone('utc',now())
    where id=p_analysis_id and owner_id=p_user_id and status=analysis_row.status;
  if not found then return 'already_started'; end if;
  delete from public.analysis_jobs where analysis_id=p_analysis_id;
  insert into public.analysis_transitions(analysis_id,from_status,to_status,actor_id,process_id,request_id)
    values(p_analysis_id,analysis_row.status,'cancelled',p_user_id,'web',p_request_id);
  return 'cancelled';
end;
$$;$cancel$;
  target record; routine pg_catalog.pg_proc%rowtype; actual_sha text;
  prepared text[]:='{}'; statement text; role_name text;
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');
  index_oid oid:=to_regclass('public.analysis_ai_runs_analysis_input_key');
  table_oid oid:=to_regclass('public.analysis_ai_runs');
  known_index record; unexpected_unique boolean;
begin
  if service_oid is null or table_oid is null then raise exception 'LEGACY_COMPAT_SCHEMA_DRIFT' using errcode='23514'; end if;
  -- All predecessors and attributes are checked before ANY DDL. Exact intended
  -- bodies permit a safe replay; unknown revisions/overloads never get replaced.
  for target in select * from (values
    ('public.transition_analysis(uuid,text,text,uuid,text,text)',
      array['p_analysis_id','p_expected_status','p_next_status','p_actor_id','p_process_id','p_request_id'],
      'boolean'::regtype,false,
      array['71c8cdcbfc1c7ae9e91390c65b83648ecb0fe58a46df4d60cc508c20be595c2f','eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd'],
      'eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd',transition_ddl),
    ('public.release_analysis_job(uuid,text,integer,text)',
      array['p_analysis_id','p_worker_id','p_retry_delay_seconds','p_error_code'],
      'boolean'::regtype,false,
      array['5c7348eaf680d4fb49f9f07e77e13246129654e847971bb552591d3d0edcd015',
        '0896a69746a6c15a3d9240b9cbd5b36c0a1868ecc892ed1a3072c3d20387e850',
        'f68914145ca04245c4c7402a31bac55c3c8e7151b120a0f71dd91d41533ba55a','750798339f61230201c162a824f4b858a0d189dbd9cc03afbf2528a5d4edd190'],
      '750798339f61230201c162a824f4b858a0d189dbd9cc03afbf2528a5d4edd190',release_ddl),
    ('public.cancel_analysis(uuid,uuid,text)',array['p_analysis_id','p_user_id','p_request_id'],
      'text'::regtype,true,array['e76bd4d03107f09952685f2312d973e4bc2e4cc3c1cf04ad1496b3dae668e9dd','777e7bd2ccb838e3764104b85ba8f9ed9491da9750a746c2c36545ea72ed379b'],
      '777e7bd2ccb838e3764104b85ba8f9ed9491da9750a746c2c36545ea72ed379b',cancel_ddl)
  ) t(signature,argument_names,result_type,may_be_absent,accepted_sha,final_sha,ddl) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if not found then
      if not target.may_be_absent then raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
      -- No differently typed overload may silently substitute for the missing RPC.
      if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=split_part(split_part(target.signature,'.',2),'(',1)) then
        raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
      prepared:=array_append(prepared,target.ddl); continue;
    end if;
    if routine.prokind<>'f' or routine.proretset or routine.prorettype<>target.result_type
      or routine.proargnames is distinct from target.argument_names or routine.proargmodes is not null
      or routine.pronargdefaults<>0 or routine.provariadic<>0 or not routine.prosecdef or routine.provolatile<>'v'
      or cardinality(routine.proconfig) is distinct from 1
      or not exists(select 1 from pg_options_to_table(routine.proconfig) where option_name='search_path' and option_value in ('','""'))
      or exists(select 1 from pg_catalog.pg_proc p where p.pronamespace=routine.pronamespace and p.proname=routine.proname and p.oid<>routine.oid) then
      raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
    if not has_function_privilege('service_role',routine.oid,'EXECUTE')
      or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a
        where a.privilege_type='EXECUTE' and (a.grantee not in (routine.proowner,service_oid) or (a.grantee=service_oid and a.is_grantable))) then
      raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') then raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
    end loop;
    actual_sha:=encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex');
    if not actual_sha=any(target.accepted_sha) then raise exception 'LEGACY_COMPAT_FUNCTION_DRIFT' using errcode='23514'; end if;
    if actual_sha<>target.final_sha then prepared:=array_append(prepared,target.ddl); end if;
  end loop;

  -- input_hash is content/policy provenance, NOT a global request identity.
  -- A run UUID identifies each invocation. Never restore a global input index.
  -- Any unexpected non-PK uniqueness requires separate review; nothing unknown
  -- is dropped, and every unrelated/nonunique index remains untouched.
  select exists(select 1 from pg_catalog.pg_index i where i.indrelid=table_oid and i.indisunique and not i.indisprimary
    and (index_oid is null or i.indexrelid<>index_oid)) into unexpected_unique;
  if unexpected_unique then raise exception 'LEGACY_COMPAT_INDEX_REVIEW_REQUIRED' using errcode='23514'; end if;
  if index_oid is not null then
    select i.*,c.relkind,c.reloptions,c.relispartition,am.amname into known_index
      from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam
      where i.indexrelid=index_oid;
    if not found then raise exception 'LEGACY_COMPAT_INDEX_DRIFT' using errcode='23514'; end if;
    if known_index.indrelid<>table_oid or known_index.relkind<>'i' or known_index.amname<>'btree'
      or known_index.reloptions is not null or known_index.relispartition or not known_index.indisunique
      or not known_index.indisvalid or not known_index.indisready or not known_index.indislive or not known_index.indimmediate
      or known_index.indisprimary or known_index.indisexclusion or known_index.indnullsnotdistinct
      or known_index.indnkeyatts<>2 or known_index.indnatts<>2 or known_index.indexprs is not null or known_index.indpred is not null
      or (select array_agg(a.attname::text order by k.ordinality) from unnest(known_index.indkey::smallint[]) with ordinality k(attnum,ordinality)
        join pg_catalog.pg_attribute a on a.attrelid=table_oid and a.attnum=k.attnum) is distinct from array['analysis_id','input_hash']
      or exists(select 1 from pg_catalog.pg_constraint where conindid=index_oid)
      or encode(extensions.digest(convert_to(pg_get_indexdef(index_oid,0,false),'UTF8'),'sha256'),'hex')<>'30236673e1cd5e8824e051a7c7e3fbe3ad19d2318cc79115527321a53c3f6968' then
      raise exception 'LEGACY_COMPAT_INDEX_DRIFT' using errcode='23514'; end if;
    prepared:=array_append(prepared,'DROP INDEX public.analysis_ai_runs_analysis_input_key');
  end if;
  foreach statement in array prepared loop execute statement; end loop;
end;
$bridge$;
revoke all on function public.transition_analysis(uuid,text,text,uuid,text,text),public.release_analysis_job(uuid,text,integer,text),
  public.cancel_analysis(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_analysis(uuid,text,text,uuid,text,text),public.release_analysis_job(uuid,text,integer,text),
  public.cancel_analysis(uuid,uuid,text) to service_role;
commit;
