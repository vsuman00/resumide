-- R19 FORWARD source: no migration application or activation is implied.
-- Same owner-write:v1 key as C02. PostgreSQL READ COMMITTED is required.
-- Fixed migration-time source patches abort on drift; no runtime SQL dispatch.
begin;

-- This predicate never locks: safe for pre-LIMIT filtering. After the shared
-- owner lock the caller MUST issue a separate command through the VOLATILE guard.
create function private.candidate_write_blocked(p_owner_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select p_owner_id is null or exists(select 1 from public.data_requests d
    where d.user_id=p_owner_id and d.kind='deletion'
      and d.status is distinct from 'failed' and d.status is distinct from 'cancelled');
$$;

create function private.try_candidate_privacy_write(p_owner_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare owner_key bigint;
begin
  if p_owner_id is null or current_setting('transaction_isolation') not in ('read committed','read uncommitted') then return false; end if;
  foreach owner_key in array private.candidate_owner_lock_keys(array[p_owner_id]) loop
    -- Never wait while holding candidate/source/queue row locks.
    if not pg_try_advisory_xact_lock_shared(owner_key) then return false; end if;
  end loop;
  -- Separate VOLATILE command sees deletions committed before lock acquisition.
  return not private.candidate_write_blocked(p_owner_id);
end;
$$;

create function private.serialize_deletion_request()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id,new.user_id,new.organization_id,new.kind)
    is distinct from (old.id,old.user_id,old.organization_id,old.kind) then
    raise exception 'PRIVACY_REQUEST_IDENTITY' using errcode='23514'; end if;
  if new.kind='deletion' then
    if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
      raise exception 'PRIVACY_ISOLATION_UNSUPPORTED' using errcode='25000'; end if;
    if not private.try_lock_candidate_owners(array[new.user_id]) then
      raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03'; end if;
  elsif new.kind='export' and (tg_op='INSERT'
    or (new.result_manifest is not null and new.result_manifest<>'null'::jsonb
      and new.result_manifest is distinct from old.result_manifest)) then
    -- New intake/personal-data copies are work; failure bookkeeping and manifest
    -- erasure remain available after deletion, including the privacy worker.
    if not private.try_candidate_privacy_write(new.user_id) then
      raise exception 'CANDIDATE_WRITE_BLOCKED' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
create trigger serialize_deletion_request before insert or update on public.data_requests
for each row execute function private.serialize_deletion_request();

create function private.guard_candidate_privacy_write()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare new_owner uuid; old_owner uuid;
begin
  if tg_nargs<>1 or tg_table_schema<>'public' then
    raise exception 'PRIVACY_GUARD_SCOPE' using errcode='23514'; end if;
  new_owner:=(to_jsonb(new)->>tg_argv[0])::uuid;
  if new_owner is null then raise exception 'PRIVACY_GUARD_OWNER' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    old_owner:=(to_jsonb(old)->>tg_argv[0])::uuid;
    if new_owner is distinct from old_owner then raise exception 'PRIVACY_GUARD_OWNER' using errcode='23514'; end if;
    -- Only the existing content-free cancellation/retention tombstones bypass
    -- new-work admission. No INSERT, owner transfer or content change is exempt.
    if tg_table_name='resumes' and to_jsonb(new)->>'status'='deleted'
      and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at']) then return new; end if;
    if tg_table_name='analyses' and to_jsonb(new)->>'status'='cancelled' and to_jsonb(old)->>'status' in ('queued','quarantined','cancelled')
      and (to_jsonb(new)-array['status','request_id','stage_updated_at','completed_at','updated_at'])
        =(to_jsonb(old)-array['status','request_id','stage_updated_at','completed_at','updated_at']) then return new; end if;
  end if;
  if not private.try_candidate_privacy_write(new_owner) then
    raise exception 'CANDIDATE_WRITE_BLOCKED' using errcode='42501'; end if;
  return new;
end;
$$;

-- Fixed reviewed content tables only. Existing FKs/validators retain tenant and
-- deferred-insert semantics; safety/accounting/audit ledgers and DELETE are excluded.
do $install$
declare target record;
begin
  for target in select * from (values
    ('profiles','id'),('consents','user_id'),
    ('organizations','owner_id'),('jobs','owner_id'),('resumes','owner_id'),('resume_versions','owner_id'),
    ('analyses','owner_id'),('analysis_results','owner_id'),('writer_drafts','owner_id'),
    ('analysis_extractions','owner_id'),('analysis_deterministic_results','owner_id'),('analysis_ai_runs','owner_id'),
    ('document_evidence_attempts','owner_id'),('evidence_corrections','owner_id'),
    ('canonical_resume_versions','owner_id'),('resume_facts','owner_id'),('canonical_resume_heads','owner_id'),('change_events','owner_id'),
    ('job_requirement_versions','owner_id'),('job_requirements','owner_id'),('authoring_events','owner_id'),
    ('candidate_correction_operations','owner_id'),('candidate_correction_assignments','owner_id'),('candidate_correction_applications','owner_id'),
    ('canonical_correction_snapshots','owner_id'),('canonical_correction_snapshot_facts','owner_id')
  ) t(table_name,owner_column) loop
    if not exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.'||target.table_name) and a.attname=target.owner_column
        and a.atttypid='uuid'::regtype and a.attnotnull and a.attnum>0 and not a.attisdropped) then
      raise exception 'PRIVACY_GUARD_CATALOG_DRIFT' using errcode='23514'; end if;
    execute format('CREATE TRIGGER zz_candidate_privacy_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_candidate_privacy_write(%L)',target.table_name,target.owner_column);
  end loop;
end;
$install$;

revoke all on function private.candidate_write_blocked(uuid),private.try_candidate_privacy_write(uuid),
  private.serialize_deletion_request(),private.guard_candidate_privacy_write() from public,anon,authenticated,service_role;

-- The following manifest is derived from the latest checked-in prosrc bodies.
-- Verify ALL bodies/substrings before replacing any body. pg_get_functiondef
-- preserves signatures, security, volatility, config and existing grants.
do $patch$
declare
  manifest jsonb:=$manifest$[
  {
    "signature": "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    "source": "20261012160703_candidate_authoring_transactions.sql",
    "sha256": "da099d547bb99588c665775b84bb1cd9af30d0dac779cf3b42802b25e5418542",
    "patches": [
      {
        "old": "exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status not in ('failed'))",
        "new": "not private.try_candidate_privacy_write(p_user_id)",
        "count": 1
      }
    ]
  },
  {
    "signature": "public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "source": "20261012160703_candidate_authoring_transactions.sql",
    "sha256": "07a6dbe31d28b3689456beb3c7b4a9fc7394018e37824fdd79e2417c8c7772a6",
    "patches": [
      {
        "old": "exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed')",
        "new": "not private.try_candidate_privacy_write(p_user_id)",
        "count": 1
      }
    ]
  },
  {
    "signature": "public.save_job_requirements(uuid,uuid,jsonb,uuid,uuid,text)",
    "source": "20261012064727_job_requirement_versions.sql",
    "sha256": "b24bd48963c35bc07768f1beda3eda12de32ced7fc7556c11d2f6ed4462534b8",
    "patches": [
      {
        "old": "exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed')",
        "new": "not private.try_candidate_privacy_write(p_user_id)",
        "count": 1
      }
    ]
  },
  {
    "signature": "private.ai_budget_transition(uuid,uuid,jsonb,text)",
    "source": "20261110062548_technical_ai_budget.sql",
    "sha256": "1c2323f58ff85e76544f2d0cbdfe9202bc26e5fc69acf71716d2b03c191b5f46",
    "patches": [
      {
        "old": "    if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;\n  elsif p_action='reconcile' then",
        "new": "    if not found or not private.try_candidate_privacy_write(p_user_id) then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;\n  elsif p_action='reconcile' then",
        "count": 1
      }
    ]
  },
  {
    "signature": "public.ai_budget_reserve_next(uuid,uuid,jsonb)",
    "source": "20261110062548_technical_ai_budget.sql",
    "sha256": "a15b262a163f336cccc358426598f62e261d07d4a5fdc4336bcf34dc133487f0",
    "patches": [
      {
        "old": "  if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;\n\n  select a.ordinal",
        "new": "  if not found or not private.try_candidate_privacy_write(p_user_id) then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;\n\n  select a.ordinal",
        "count": 1
      }
    ]
  },
  {
    "signature": "private.analysis_admission_authorized(uuid,uuid)",
    "source": "20261110080809_analysis_admission_binding.sql",
    "sha256": "6b845a6c8adcee866b5c0d18951056874871c6f94378e317da5e66d408d4ea10",
    "patches": [
      {
        "old": "return not exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed');",
        "new": "return private.try_candidate_privacy_write(p_user_id);",
        "count": 1
      }
    ]
  },
  {
    "signature": "private.analysis_job_v2_owner_eligible(uuid)",
    "source": "20261110080810_lease_fencing_and_verification_scope.sql",
    "sha256": "03cdc5ca50e97b70ebb5ef549b4e11bdb9f43b5cda799ee8b5ff010023ca7695",
    "patches": [
      {
        "old": "if exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed') then return false; end if;",
        "new": "if not private.try_candidate_privacy_write(a.owner_id) then return false; end if;",
        "count": 1
      }
    ]
  },
  {
    "signature": "private.lock_analysis_stage_lease(uuid,text,integer,uuid)",
    "source": "20261110082455_analysis_stage_write_fencing.sql",
    "sha256": "2d88d85da739cedf6905e3aafeff298463c94c6cf96c8737461c20fda8bd56b3",
    "patches": [
      {
        "old": "if exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed') then return false; end if;",
        "new": "if not private.try_candidate_privacy_write(a.owner_id) then return false; end if;",
        "count": 1
      }
    ]
  },
  {
    "signature": "public.claim_analysis_job_v2(text,integer)",
    "source": "20261110080810_lease_fencing_and_verification_scope.sql",
    "sha256": "1f2de1d4942810ca7d48e0e0cfae358403d486786636ffd54918cd1b36cfd7b6",
    "patches": [
      {
        "old": "not exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed')",
        "new": "not private.candidate_write_blocked(a.owner_id)",
        "count": 2
      }
    ]
  },
  {
    "signature": "public.claim_analysis_job(text,integer)",
    "source": "20261110080810_lease_fencing_and_verification_scope.sql",
    "sha256": "760b2d56916f467a984e6095b65e9d238d9de5348e90a9bfa6d113e4711567c3",
    "patches": [
      {
        "old": "    order by j.run_after,a.id limit 100 for update of a skip locked",
        "new": "      and not private.candidate_write_blocked(a.owner_id)\n      and exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id and m.role in ('owner','admin','member'))\n      and exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id\n        where v.id=a.resume_version_id and v.organization_id=a.organization_id and v.owner_id=a.owner_id\n          and r.organization_id=a.organization_id and r.owner_id=a.owner_id and r.status='active')\n    order by j.run_after,a.id limit 100 for update of a skip locked",
        "count": 2
      },
      {
        "old": "    if not found then continue; end if;\n    checked_at:=clock_timestamp();",
        "new": "    if not found then continue; end if;\n    if not private.analysis_job_v2_owner_eligible(candidate.id) then continue; end if;\n    checked_at:=clock_timestamp();",
        "count": 2
      }
    ]
  }
]$manifest$::jsonb;
  item jsonb; change jsonb; function_oid regprocedure; body text; next_body text; definition text;
  prepared jsonb:='[]'::jsonb;
begin
  for item in select value from jsonb_array_elements(manifest) loop
    function_oid:=to_regprocedure(item->>'signature');
    if function_oid is null then raise exception 'PRIVACY_FUNCTION_DRIFT' using errcode='23514'; end if;
    select p.prosrc into body from pg_catalog.pg_proc p where p.oid=function_oid;
    if encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')<>item->>'sha256' then
      raise exception 'PRIVACY_FUNCTION_DRIFT' using errcode='23514'; end if;
    next_body:=body;
    for change in select value from jsonb_array_elements(item->'patches') loop
      if (length(next_body)-length(replace(next_body,change->>'old','')))/length(change->>'old')<>(change->>'count')::integer then
        raise exception 'PRIVACY_FUNCTION_DRIFT' using errcode='23514'; end if;
      next_body:=replace(next_body,change->>'old',change->>'new');
    end loop;
    definition:=pg_get_functiondef(function_oid);
    if (length(definition)-length(replace(definition,body,'')))/length(body)<>1 then
      raise exception 'PRIVACY_FUNCTION_DRIFT' using errcode='23514'; end if;
    prepared:=prepared||jsonb_build_array(jsonb_build_object('ddl',replace(definition,body,next_body)));
  end loop;
  for item in select value from jsonb_array_elements(prepared) loop execute item->>'ddl'; end loop;
end;
$patch$;

-- Compare deparsed expressions on the SAME relation, avoiding pg_node_tree
-- source-location differences. Probe policies exist only inside this transaction
-- and are dropped before the status-only ALTER. Existing drift is never replaced.
do $policy_names$
begin
  if exists(select 1 from pg_catalog.pg_policy where polname='r19_privacy_policy_probe'
    and polrelid in ('public.canonical_resume_versions'::regclass,'public.job_requirement_versions'::regclass,'public.authoring_events'::regclass)) then
    raise exception 'PRIVACY_POLICY_DRIFT' using errcode='23514'; end if;
end;
$policy_names$;
create policy r19_privacy_policy_probe on public.canonical_resume_versions for select to authenticated
using ((select auth.uid())=owner_id
    and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=owner_id and d.kind='deletion' and d.status<>'failed'));
create policy r19_privacy_policy_probe on public.job_requirement_versions for select to authenticated
using ((select auth.uid())=owner_id and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id join public.resumes r on r.id=v.resume_id
      where a.id=public.job_requirement_versions.analysis_id and a.owner_id=public.job_requirement_versions.owner_id
      and v.owner_id=public.job_requirement_versions.owner_id and r.owner_id=public.job_requirement_versions.owner_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=public.job_requirement_versions.owner_id and d.kind='deletion' and d.status<>'failed'));
create policy r19_privacy_policy_probe on public.authoring_events for select to authenticated
using ((select auth.uid())=owner_id and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active' and r.owner_id=authoring_events.owner_id)
  and exists(select 1 from public.memberships m where m.user_id=authoring_events.owner_id and m.organization_id=authoring_events.organization_id)
  and not exists(select 1 from public.data_requests d where d.user_id=authoring_events.owner_id and d.kind='deletion' and d.status<>'failed'));
do $policy_shapes$
declare target record; old_policy pg_catalog.pg_policy%rowtype; probe pg_catalog.pg_policy%rowtype;
begin
  for target in select * from (values
    ('public.canonical_resume_versions'::regclass,'owners read active canonical versions'),
    ('public.job_requirement_versions'::regclass,'owners read active job requirement versions'),
    ('public.authoring_events'::regclass,'owners read active authoring decisions')
  ) t(table_oid,policy_name) loop
    select * into old_policy from pg_catalog.pg_policy where polrelid=target.table_oid and polname=target.policy_name;
    if not found then raise exception 'PRIVACY_POLICY_DRIFT' using errcode='23514'; end if;
    select * into strict probe from pg_catalog.pg_policy where polrelid=target.table_oid and polname='r19_privacy_policy_probe';
    if old_policy.polroles is distinct from probe.polroles or old_policy.polcmd is distinct from probe.polcmd
      or old_policy.polpermissive is distinct from probe.polpermissive
      or pg_get_expr(old_policy.polqual,old_policy.polrelid) is distinct from pg_get_expr(probe.polqual,probe.polrelid)
      or pg_get_expr(old_policy.polwithcheck,old_policy.polrelid) is distinct from pg_get_expr(probe.polwithcheck,probe.polrelid) then
      raise exception 'PRIVACY_POLICY_DRIFT' using errcode='23514'; end if;
  end loop;
end;
$policy_shapes$;
drop policy r19_privacy_policy_probe on public.canonical_resume_versions;
drop policy r19_privacy_policy_probe on public.job_requirement_versions;
drop policy r19_privacy_policy_probe on public.authoring_events;

-- Fixed RLS status compatibility only: all ownership, membership and active
-- source clauses are preserved. Reads do not acquire owner advisory locks.
alter policy "owners read active canonical versions" on public.canonical_resume_versions
  using ((select auth.uid())=owner_id
    and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=owner_id and d.kind='deletion'
      and d.status is distinct from 'failed' and d.status is distinct from 'cancelled'));
alter policy "owners read active job requirement versions" on public.job_requirement_versions
  using ((select auth.uid())=owner_id and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id join public.resumes r on r.id=v.resume_id
      where a.id=public.job_requirement_versions.analysis_id and a.owner_id=public.job_requirement_versions.owner_id
      and v.owner_id=public.job_requirement_versions.owner_id and r.owner_id=public.job_requirement_versions.owner_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=public.job_requirement_versions.owner_id and d.kind='deletion'
      and d.status is distinct from 'failed' and d.status is distinct from 'cancelled'));
alter policy "owners read active authoring decisions" on public.authoring_events
  using ((select auth.uid())=owner_id and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active' and r.owner_id=authoring_events.owner_id)
    and exists(select 1 from public.memberships m where m.user_id=authoring_events.owner_id and m.organization_id=authoring_events.organization_id)
    and not exists(select 1 from public.data_requests d where d.user_id=authoring_events.owner_id and d.kind='deletion'
      and d.status is distinct from 'failed' and d.status is distinct from 'cancelled'));
commit;
