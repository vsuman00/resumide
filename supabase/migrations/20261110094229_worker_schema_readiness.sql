-- R11 source-only metadata readiness. No queue/provider/accounting action,
-- candidate/job/pool/user scan, opening balance or activation is performed.
create function public.worker_schema_readiness(
  p_fencing boolean,p_ai_budget boolean,p_model text,p_policy_version text
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  failures text[]:='{}'; target record; routine pg_catalog.pg_proc%rowtype;
  role_name text; relation_oid oid; policy_present boolean;
  selected jsonb:=jsonb_build_object('fencing',coalesce(p_fencing,false),'aiBudget',coalesce(p_ai_budget,false));
begin
  if p_fencing is null or p_ai_budget is null or (p_ai_budget and
    (p_model is null or p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
      or p_policy_version is null or p_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$')) then
    return jsonb_build_object('schemaVersion','worker-schema-readiness/1.0.0','selected',selected,'ready',false,'failures',jsonb_build_array('INVALID_SELECTION'));
  end if;
  if not p_fencing and not p_ai_budget then
    return jsonb_build_object('schemaVersion','worker-schema-readiness/1.0.0','selected',selected,'ready',true,'failures','[]'::jsonb);
  end if;
  -- Critical current state-graph revision: the legacy body has the SAME
  -- signature/grants but cannot implement the selected worker protocol.
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=to_regprocedure('public.transition_analysis(uuid,text,text,uuid,text,text)')
      and encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex')='eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd') then
    failures:=array_append(failures,'SCHEMA_MISSING'); end if;
  -- Catalog observations only; never call any of the listed routines.
  for target in select * from (values
    ('privacy','private.candidate_owner_lock_keys(uuid[])','bigint[]'::regtype,false),
    ('privacy','private.try_lock_candidate_owners(uuid[])','boolean'::regtype,false),
    ('privacy','private.candidate_write_blocked(uuid)','boolean'::regtype,true),
    ('privacy','private.try_candidate_privacy_write(uuid)','boolean'::regtype,true),
    ('privacy','private.serialize_deletion_request()','trigger'::regtype,true),
    ('privacy','private.guard_candidate_privacy_write()','trigger'::regtype,true),
    ('fencing','public.claim_analysis_job_v2(text,integer)','jsonb'::regtype,true),
    ('fencing','public.heartbeat_analysis_job_v2(uuid,text,integer,uuid,integer)','boolean'::regtype,true),
    ('fencing','public.complete_analysis_job_v2(uuid,text,integer,uuid)','boolean'::regtype,true),
    ('fencing','public.release_analysis_job_v2(uuid,text,integer,uuid,integer,text)','boolean'::regtype,true),
    ('fencing','public.assert_analysis_stage_lease(uuid,text,integer,uuid)','boolean'::regtype,true),
    ('fencing','public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)','boolean'::regtype,true),
    ('fencing','public.recover_terminal_analysis_jobs_v2(integer)','integer'::regtype,true),
    ('fencing','private.analysis_job_v2_owner_eligible(uuid)','boolean'::regtype,false),
    ('fencing','private.analysis_job_v2_review_handoff(uuid)','boolean'::regtype,false),
    ('fencing','private.lock_analysis_stage_lease(uuid,text,integer,uuid)','boolean'::regtype,false),
    ('fencing','private.analysis_stage_parameter_keys(jsonb,text[])','boolean'::regtype,false),
    ('fencing','private.analysis_stage_integer(jsonb)','boolean'::regtype,false),
    ('fencing','private.analysis_stage_strings(jsonb,text[])','boolean'::regtype,false),
    ('fencing','public.transition_analysis(uuid,text,text,uuid,text,text)','boolean'::regtype,true),
    ('fencing','public.persist_analysis_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb)','boolean'::regtype,true),
    ('fencing','public.persist_analysis_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb)','boolean'::regtype,true),
    ('fencing','public.persist_native_layout_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb,jsonb)','boolean'::regtype,true),
    ('fencing','public.persist_document_evidence(uuid,jsonb,text,text)','boolean'::regtype,true),
    ('fencing','public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)','boolean'::regtype,true),
    ('fencing','public.persist_partial_analysis(uuid,jsonb,text,text)','boolean'::regtype,true),
    ('fencing','public.persist_qualitative_analysis(uuid,jsonb,text,integer,text,jsonb,integer,text,text,text,text,uuid,jsonb)','boolean'::regtype,true),
    ('ai','public.ai_budget_reserve(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_reserve_next(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_claim_dispatch(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_release(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_mark_unknown(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_settle(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','public.ai_budget_reconcile(uuid,uuid,jsonb)','jsonb'::regtype,true),
    ('ai','private.ai_budget_integer(numeric)','boolean'::regtype,false),
    ('ai','private.ai_budget_cost(numeric,numeric,numeric,numeric)','numeric'::regtype,false),
    ('ai','private.ai_budget_immutable()','trigger'::regtype,false),
    ('ai','private.ai_budget_projection_identity()','trigger'::regtype,false),
    ('ai','private.ai_budget_binding_sha256(uuid,uuid,jsonb)','text'::regtype,false),
    ('ai','private.ai_budget_request_valid(jsonb,text)','boolean'::regtype,false),
    ('ai','private.ai_budget_blocked(uuid)','boolean'::regtype,false),
    ('ai','private.ai_budget_receipt(uuid,boolean,boolean)','jsonb'::regtype,false),
    ('ai','private.ai_budget_denied(text)','jsonb'::regtype,false),
    ('ai','private.ai_budget_transition(uuid,uuid,jsonb,text)','jsonb'::regtype,false)
  ) t(capability,signature,result_type,definer) loop
    if target.capability='fencing' and not p_fencing or target.capability='ai' and not p_ai_budget then continue; end if;
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if not found or routine.prokind<>'f' or routine.proretset or routine.prorettype<>target.result_type
      or (target.signature in ('private.candidate_write_blocked(uuid)','private.try_candidate_privacy_write(uuid)',
        'private.serialize_deletion_request()','private.guard_candidate_privacy_write()') and routine.provolatile<>'v') then
      failures:=array_append(failures,'SCHEMA_MISSING'); continue; end if;
    if routine.prosecdef is distinct from target.definer or cardinality(routine.proconfig) is distinct from 1
      or not exists(select 1 from pg_options_to_table(routine.proconfig) where option_name='search_path' and option_value in ('','""'))
      or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') then
      failures:=array_append(failures,'ACCESS_INVALID'); end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from
        (role_name='service_role' and target.signature like 'public.%') then failures:=array_append(failures,'ACCESS_INVALID'); end if;
    end loop;
  end loop;
  for target in select * from (values
    ('privacy','public.data_requests','user_id','uuid'::regtype),
    ('privacy','public.data_requests','kind','text'::regtype),
    ('privacy','public.data_requests','status','text'::regtype),
    ('privacy','public.data_requests','result_manifest','jsonb'::regtype),
    ('fencing','public.analysis_jobs','analysis_id','uuid'::regtype),
    ('fencing','public.analysis_jobs','lease_owner','text'::regtype),
    ('fencing','public.analysis_jobs','lease_fence','uuid'::regtype),
    ('fencing','public.analysis_jobs','lease_expires_at','timestamptz'::regtype),
    ('fencing','public.analysis_jobs','attempt_count','integer'::regtype),
    ('fencing','public.analysis_jobs','run_after','timestamptz'::regtype),
    ('fencing','public.analysis_jobs','dead_lettered_at','timestamptz'::regtype),
    ('fencing','public.analysis_jobs','last_error_code','text'::regtype),
    ('fencing','public.analyses','id','uuid'::regtype),
    ('fencing','public.analyses','owner_id','uuid'::regtype),
    ('fencing','public.analyses','organization_id','uuid'::regtype),
    ('fencing','public.analyses','resume_version_id','uuid'::regtype),
    ('fencing','public.analyses','status','text'::regtype),
    ('fencing','public.resumes','id','uuid'::regtype),
    ('fencing','public.resumes','owner_id','uuid'::regtype),
    ('fencing','public.resumes','organization_id','uuid'::regtype),
    ('fencing','public.resumes','status','text'::regtype),
    ('fencing','public.resume_versions','id','uuid'::regtype),
    ('fencing','public.resume_versions','owner_id','uuid'::regtype),
    ('fencing','public.resume_versions','organization_id','uuid'::regtype),
    ('fencing','public.resume_versions','resume_id','uuid'::regtype),
    ('fencing','public.resume_versions','checksum','text'::regtype),
    ('fencing','public.memberships','user_id','uuid'::regtype),
    ('fencing','public.memberships','organization_id','uuid'::regtype),
    ('fencing','public.memberships','role','text'::regtype),
    ('fencing','public.document_evidence_attempts','id','uuid'::regtype),
    ('fencing','public.document_evidence_attempts','analysis_id','uuid'::regtype),
    ('fencing','public.document_evidence_attempts','owner_id','uuid'::regtype),
    ('fencing','public.document_evidence_attempts','organization_id','uuid'::regtype),
    ('fencing','public.document_evidence_attempts','resume_version_id','uuid'::regtype),
    ('fencing','public.document_evidence_attempts','input_sha256','text'::regtype),
    ('fencing','public.document_evidence_attempts','attempt_number','integer'::regtype),
    ('fencing','public.document_evidence_attempts','envelope','jsonb'::regtype),
    ('ai','private.ai_budget_policies','version','text'::regtype),
    ('ai','private.ai_budget_policies','model','text'::regtype),
    ('ai','private.ai_budget_policies','monthly_token_limit','numeric'::regtype),
    ('ai','private.ai_budget_policies','monthly_cost_limit_microusd','numeric'::regtype),
    ('ai','private.ai_budget_policies','input_microusd_per_million','numeric'::regtype),
    ('ai','private.ai_budget_policies','output_microusd_per_million','numeric'::regtype),
    ('ai','private.ai_budget_policies','max_attempts','integer'::regtype),
    ('ai','private.ai_budget_policies','enabled','boolean'::regtype),
    ('ai','private.ai_budget_policies','approval_sha256','text'::regtype),
    ('ai','private.ai_budget_policies','created_at','timestamptz'::regtype),
    ('ai','private.ai_budget_period_openings','organization_id','uuid'::regtype),
    ('ai','private.ai_budget_period_openings','period','date'::regtype),
    ('ai','private.ai_budget_period_openings','pool_policy_version','text'::regtype),
    ('ai','private.ai_budget_period_openings','opening_spent_tokens','numeric'::regtype),
    ('ai','private.ai_budget_period_openings','opening_spent_cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_period_openings','unresolved_legacy_attempts','integer'::regtype),
    ('ai','private.ai_budget_period_openings','evidence_sha256','text'::regtype),
    ('ai','private.ai_budget_period_openings','created_at','timestamptz'::regtype),
    ('ai','private.ai_budget_pools','organization_id','uuid'::regtype),
    ('ai','private.ai_budget_pools','period','date'::regtype),
    ('ai','private.ai_budget_pools','pool_policy_version','text'::regtype),
    ('ai','private.ai_budget_pools','token_limit','numeric'::regtype),
    ('ai','private.ai_budget_pools','cost_limit_microusd','numeric'::regtype),
    ('ai','private.ai_budget_pools','reserved_tokens','numeric'::regtype),
    ('ai','private.ai_budget_pools','reserved_cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_pools','spent_tokens','numeric'::regtype),
    ('ai','private.ai_budget_pools','spent_cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_pools','created_at','timestamptz'::regtype),
    ('ai','private.ai_budget_operations','id','uuid'::regtype),
    ('ai','private.ai_budget_operations','organization_id','uuid'::regtype),
    ('ai','private.ai_budget_operations','user_id','uuid'::regtype),
    ('ai','private.ai_budget_operations','surface','text'::regtype),
    ('ai','private.ai_budget_operations','payload_sha256','text'::regtype),
    ('ai','private.ai_budget_operations','model','text'::regtype),
    ('ai','private.ai_budget_operations','prompt_policy_version','text'::regtype),
    ('ai','private.ai_budget_operations','policy_version','text'::regtype),
    ('ai','private.ai_budget_operations','reserved_input_tokens','numeric'::regtype),
    ('ai','private.ai_budget_operations','reserved_output_tokens','numeric'::regtype),
    ('ai','private.ai_budget_operations','input_microusd_per_million','numeric'::regtype),
    ('ai','private.ai_budget_operations','output_microusd_per_million','numeric'::regtype),
    ('ai','private.ai_budget_operations','attempt_limit','integer'::regtype),
    ('ai','private.ai_budget_operations','binding_sha256','text'::regtype),
    ('ai','private.ai_budget_operations','created_at','timestamptz'::regtype),
    ('ai','private.ai_budget_attempts','id','uuid'::regtype),
    ('ai','private.ai_budget_attempts','operation_id','uuid'::regtype),
    ('ai','private.ai_budget_attempts','organization_id','uuid'::regtype),
    ('ai','private.ai_budget_attempts','ordinal','integer'::regtype),
    ('ai','private.ai_budget_attempts','period','date'::regtype),
    ('ai','private.ai_budget_attempts','state','text'::regtype),
    ('ai','private.ai_budget_attempts','reserved_cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_attempts','actual_input_tokens','numeric'::regtype),
    ('ai','private.ai_budget_attempts','actual_output_tokens','numeric'::regtype),
    ('ai','private.ai_budget_attempts','actual_cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_attempts','created_at','timestamptz'::regtype),
    ('ai','private.ai_budget_attempts','updated_at','timestamptz'::regtype),
    ('ai','private.ai_budget_reconciliation_operators','organization_id','uuid'::regtype),
    ('ai','private.ai_budget_reconciliation_operators','operator_id','uuid'::regtype),
    ('ai','private.ai_budget_reconciliation_operators','enabled','boolean'::regtype),
    ('ai','private.ai_budget_reconciliation_operators','approval_sha256','text'::regtype),
    ('ai','private.ai_budget_events','id','uuid'::regtype),
    ('ai','private.ai_budget_events','attempt_id','uuid'::regtype),
    ('ai','private.ai_budget_events','kind','text'::regtype),
    ('ai','private.ai_budget_events','input_tokens','numeric'::regtype),
    ('ai','private.ai_budget_events','output_tokens','numeric'::regtype),
    ('ai','private.ai_budget_events','cost_microusd','numeric'::regtype),
    ('ai','private.ai_budget_events','reconciliation_id','uuid'::regtype),
    ('ai','private.ai_budget_events','operator_id','uuid'::regtype),
    ('ai','private.ai_budget_events','evidence_sha256','text'::regtype),
    ('ai','private.ai_budget_events','created_at','timestamptz'::regtype)
  ) t(capability,table_name,column_name,column_type) loop
    if target.capability='fencing' and not p_fencing or target.capability='ai' and not p_ai_budget then continue; end if;
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(target.table_name)
      and a.attname=target.column_name and a.atttypid=target.column_type and a.attnum>0 and not a.attisdropped) then
      failures:=array_append(failures,'SCHEMA_MISSING'); end if;
  end loop;
  -- Fixed privacy trigger scope/owner arguments. No data row is inspected.
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
    relation_oid:=to_regclass('public.'||target.table_name);
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=relation_oid and a.attname=target.owner_column
      and a.atttypid='uuid'::regtype and a.attnotnull and a.attnum>0 and not a.attisdropped)
      or not exists(select 1 from pg_catalog.pg_trigger g where g.tgrelid=relation_oid and g.tgname='zz_candidate_privacy_write'
        and g.tgfoid=to_regprocedure('private.guard_candidate_privacy_write()') and not g.tgisinternal
        and g.tgenabled in ('O','A') and g.tgtype=23 and g.tgnargs=1 and g.tgqual is null
        and g.tgargs=convert_to(target.owner_column,'UTF8')||decode('00','hex')) then
      failures:=array_append(failures,'PRIVACY_BARRIER_INVALID'); end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_trigger g where g.tgrelid=to_regclass('public.data_requests')
    and g.tgname='serialize_deletion_request' and g.tgfoid=to_regprocedure('private.serialize_deletion_request()')
    and not g.tgisinternal and g.tgenabled in ('O','A') and g.tgtype=23 and g.tgnargs=0 and g.tgqual is null and g.tgargs=''::bytea) then
    failures:=array_append(failures,'PRIVACY_BARRIER_INVALID'); end if;
  if p_fencing then
    relation_oid:=to_regclass('public.analysis_jobs');
    if not exists(select 1 from pg_catalog.pg_class where oid=relation_oid and relrowsecurity) then failures:=array_append(failures,'ACCESS_INVALID'); end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if relation_oid is not null and has_table_privilege(role_name,relation_oid,'INSERT,UPDATE,DELETE,TRUNCATE') then
        failures:=array_append(failures,'ACCESS_INVALID'); end if;
    end loop;
  end if;
  if p_ai_budget then
    -- Only technical policy data is read. Pool openings, spend, attempts, owners
    -- and reconciliation state are deliberately outside schema readiness.
    for target in select * from (values
      ('private.ai_budget_policies'),('private.ai_budget_period_openings'),('private.ai_budget_pools'),('private.ai_budget_operations'),
      ('private.ai_budget_attempts'),('private.ai_budget_events'),('private.ai_budget_reconciliation_operators')
    ) t(table_name) loop
      relation_oid:=to_regclass(target.table_name);
      if not exists(select 1 from pg_catalog.pg_class where oid=relation_oid and relrowsecurity) then failures:=array_append(failures,'ACCESS_INVALID'); end if;
      foreach role_name in array array['anon','authenticated','service_role'] loop
        if relation_oid is not null and has_table_privilege(role_name,relation_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
          failures:=array_append(failures,'ACCESS_INVALID'); end if;
      end loop;
    end loop;
    if not exists(select 1 from pg_catalog.pg_trigger g where g.tgrelid=to_regclass('private.ai_budget_policies')
      and g.tgname='ai_budget_policies_immutable' and g.tgfoid=to_regprocedure('private.ai_budget_immutable()')
      and not g.tgisinternal and g.tgenabled in ('O','A') and g.tgtype=27 and g.tgnargs=0 and g.tgqual is null) then
      failures:=array_append(failures,'ACCESS_INVALID'); end if;
    if not 'SCHEMA_MISSING'=any(failures) then
      select exists(select 1 from private.ai_budget_policies p where p.version=p_policy_version and p.model=p_model and p.enabled
        and p.max_attempts between 1 and 3 and p.approval_sha256 ~ '^[a-f0-9]{64}$'
        and p.monthly_token_limit>0 and p.monthly_token_limit=trunc(p.monthly_token_limit) and p.monthly_token_limit::text not in ('NaN','Infinity','-Infinity')
        and p.monthly_cost_limit_microusd>0 and p.monthly_cost_limit_microusd=trunc(p.monthly_cost_limit_microusd)
        and p.monthly_cost_limit_microusd::text not in ('NaN','Infinity','-Infinity')
        and p.input_microusd_per_million between 1 and 9223372036854775807 and p.input_microusd_per_million=trunc(p.input_microusd_per_million)
        and p.output_microusd_per_million between 1 and 9223372036854775807 and p.output_microusd_per_million=trunc(p.output_microusd_per_million)) into policy_present;
      if not policy_present then failures:=array_append(failures,'AI_BUDGET_POLICY_UNAVAILABLE'); end if;
    end if;
  end if;
  select coalesce(array_agg(label order by label),'{}'::text[]) into failures from (select distinct unnest(failures) label) unique_labels;
  return jsonb_build_object('schemaVersion','worker-schema-readiness/1.0.0','selected',selected,
    'ready',cardinality(failures)=0,'failures',to_jsonb(failures));
exception when others then
  -- An inaccessible/unusable catalog check is never a false ready response.
  -- No SQLERRM, request/config value, candidate identity or provider data escapes.
  return jsonb_build_object('schemaVersion','worker-schema-readiness/1.0.0','selected',selected,
    'ready',false,'failures',jsonb_build_array('ACCESS_INVALID'));
end;
$$;
revoke all on function public.worker_schema_readiness(boolean,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_schema_readiness(boolean,boolean,text,text) to service_role;
