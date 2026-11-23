-- C02 FOUNDATION ONLY. No caller, public RPC, policy, backfill or old grant change.
-- Source-reviewed draft; execution requires a separately admitted isolated target.
-- All application roles are denied access to every new table/helper below.

create function private.correction_uuid_list_valid(p_ids uuid[], p_min integer, p_max integer)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_ids is not null and p_min >= 0 and p_max >= p_min
    and cardinality(p_ids) between p_min and p_max
    and (cardinality(p_ids) = 0 or (array_ndims(p_ids) = 1 and array_lower(p_ids,1) = 1))
    and not exists(select 1 from unnest(p_ids) i where i is null)
    and cardinality(p_ids) = (select count(distinct i) from unnest(p_ids) i);
$$;
revoke all on function private.correction_uuid_list_valid(uuid[],integer,integer) from public,anon,authenticated,service_role;

-- Low-level atoms only, not authoritative command normalization or admission.
-- PostgreSQL UTF8 text cannot contain NUL or unpaired surrogates; JS rejects both.
create function private.correction_command_bytes(p_atoms text[])
returns bytea language plpgsql immutable security invoker set search_path = '' as $$
declare result bytea := convert_to(E'C02OP1\n','UTF8'); atom text; token bytea; data bytea;
begin
  if p_atoms is null
    or (cardinality(p_atoms)>0 and (array_ndims(p_atoms)<>1 or array_lower(p_atoms,1)<>1)) then
    raise exception 'CORRECTION_CODEC_ATOMS' using errcode='22023';
  end if;
  if cardinality(p_atoms)>1024 then raise exception 'CORRECTION_CODEC_LIMIT' using errcode='22023'; end if;
  foreach atom in array p_atoms loop
    if atom is null then token:=convert_to('N;','UTF8');
    else
      if octet_length(atom)>65536 then raise exception 'CORRECTION_CODEC_LIMIT' using errcode='22023'; end if;
      data:=convert_to(atom,'UTF8');
      if octet_length(result)+char_length(octet_length(data)::text)+octet_length(data)+3>65536 then
        raise exception 'CORRECTION_CODEC_LIMIT' using errcode='22023';
      end if;
      token:=convert_to('T'||octet_length(data)::text||':','UTF8')||data||convert_to(';','UTF8');
    end if;
    if octet_length(result)+octet_length(token)>65536 then
      raise exception 'CORRECTION_CODEC_LIMIT' using errcode='22023';
    end if;
    result:=result||token;
  end loop;
  return result;
end;
$$;
revoke all on function private.correction_command_bytes(text[]) from public,anon,authenticated,service_role;
create function private.correction_command_sha256(p_atoms text[])
returns text language sql immutable security invoker set search_path = '' as $$
  select encode(extensions.digest(private.correction_command_bytes(p_atoms),'sha256'),'hex');
$$;
revoke all on function private.correction_command_sha256(text[]) from public,anon,authenticated,service_role;

-- Compute in SQL, then sort/deduplicate ACTUAL signed bigint resources. UUID
-- ordering is insufficient under hash collisions. This function grants no owner authority.
create function private.candidate_owner_lock_keys(p_owners uuid[])
returns bigint[] language plpgsql immutable security invoker set search_path = '' as $$
declare keys bigint[];
begin
  if p_owners is null or cardinality(p_owners) not between 1 and 1024
    or array_ndims(p_owners)<>1 or array_lower(p_owners,1)<>1
    or exists(select 1 from unnest(p_owners) o where o is null) then
    raise exception 'CORRECTION_OWNER_BATCH' using errcode='22023';
  end if;
  select array_agg(k order by k) into keys from (
    select distinct ('x'||substr(encode(extensions.digest(
      convert_to('resumide:owner-write:v1:'||lower(o::text),'UTF8'),'sha256'),'hex'),1,16))::bit(64)::bigint k
    from unnest(p_owners) o
  ) derived;
  return keys;
end;
$$;
revoke all on function private.candidate_owner_lock_keys(uuid[]) from public,anon,authenticated,service_role;
create function private.lock_candidate_owners(p_owners uuid[])
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare k bigint;
begin
  foreach k in array private.candidate_owner_lock_keys(p_owners) loop
    perform pg_advisory_xact_lock(k);
  end loop;
end;
$$;
revoke all on function private.lock_candidate_owners(uuid[]) from public,anon,authenticated,service_role;
create function private.try_lock_candidate_owners(p_owners uuid[])
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare k bigint;
begin
  foreach k in array private.candidate_owner_lock_keys(p_owners) loop
    if not pg_try_advisory_xact_lock(k) then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.try_lock_candidate_owners(uuid[]) from public,anon,authenticated,service_role;
-- A false try-lock retains earlier transaction locks until the transaction ends.
-- Future callers must freeze the FULL owner batch and call before ANY row lock.

-- Each supporting key includes the existing primary-key ID: historical contents
-- cannot introduce duplicate tuples. Index/lock costs still need target review.
alter table public.resumes add constraint correction_root_scope unique(id,owner_id,organization_id);
alter table public.resume_versions add constraint correction_source_scope unique(id,resume_id,owner_id,organization_id);
alter table public.analyses add constraint correction_analysis_scope unique(id,resume_version_id,owner_id,organization_id);
alter table public.document_evidence_attempts add constraint correction_attempt_scope
  unique(id,analysis_id,resume_version_id,owner_id,organization_id,input_sha256);
alter table public.evidence_corrections add constraint correction_event_scope
  unique(id,attempt_id,analysis_id,owner_id,organization_id,revision,field,operation,actor_id);
alter table public.canonical_resume_versions add constraint correction_canonical_scope
  unique(id,resume_id,source_resume_version_id,owner_id,organization_id);
alter table public.resume_facts add constraint correction_fact_scope unique(canonical_version_id,id,owner_id,organization_id);

create table public.candidate_correction_operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resume_id uuid not null,
  analysis_id uuid not null,
  source_resume_version_id uuid not null,
  attempt_id uuid not null,
  input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references auth.users(id) on delete cascade check(actor_id=owner_id),
  kind text not null check(kind in ('assign','apply','reapply','add')),
  idempotency_key uuid not null,
  expected_review_revision bigint not null check(expected_review_revision between 0 and 2147483647),
  expected_assignment_revision bigint not null check(expected_assignment_revision>=0),
  expected_canonical_version_id uuid,
  target_model_version text not null check(char_length(target_model_version) between 1 and 100),
  projection_model_version text not null check(char_length(projection_model_version) between 1 and 100),
  admission_policy_version text not null check(char_length(admission_policy_version) between 1 and 100),
  evidence_schema_version text not null check(char_length(evidence_schema_version) between 1 and 100),
  field_extractor_version text check(field_extractor_version is null or char_length(field_extractor_version) between 1 and 100),
  command_codec_version text not null check(command_codec_version='c02-command-bytes/1.0.0'),
  command_sha256 text not null check(command_sha256 ~ '^[a-f0-9]{64}$'),
  selected_assignment_ids uuid[] not null check(private.correction_uuid_list_valid(selected_assignment_ids,1,32)),
  initial_import_version_id uuid,
  result_version_id uuid,
  result_revision integer check(result_revision>0),
  result_assignment_revision bigint not null check(result_assignment_revision>=expected_assignment_revision),
  child_version_ids uuid[] not null check(private.correction_uuid_list_valid(child_version_ids,0,33)),
  request_id text not null check(char_length(request_id) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(resume_id,idempotency_key),
  unique(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256),
  unique(id,resume_id,source_resume_version_id,owner_id,organization_id),
  foreign key(resume_id,owner_id,organization_id) references public.resumes(id,owner_id,organization_id) on delete cascade,
  foreign key(source_resume_version_id,resume_id,owner_id,organization_id) references public.resume_versions(id,resume_id,owner_id,organization_id) on delete cascade,
  foreign key(analysis_id,source_resume_version_id,owner_id,organization_id) references public.analyses(id,resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(attempt_id,analysis_id,source_resume_version_id,owner_id,organization_id,input_sha256)
    references public.document_evidence_attempts(id,analysis_id,resume_version_id,owner_id,organization_id,input_sha256) on delete cascade,
  foreign key(expected_canonical_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(initial_import_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade deferrable initially deferred,
  foreign key(result_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade deferrable initially deferred,
  check((result_version_id is null)=(result_revision is null)),
  check((kind='assign' and result_version_id is not distinct from expected_canonical_version_id
      and cardinality(child_version_ids)=0 and initial_import_version_id is null)
    or (kind<>'assign' and result_version_id is not null and cardinality(child_version_ids)>0)),
  check(initial_import_version_id is null or (expected_canonical_version_id is null and initial_import_version_id=child_version_ids[1]))
);

create table public.candidate_correction_assignments (
  id uuid primary key,
  owner_id uuid not null,
  organization_id uuid not null,
  resume_id uuid not null,
  analysis_id uuid not null,
  source_resume_version_id uuid not null,
  attempt_id uuid not null,
  input_sha256 text not null,
  operation_id uuid not null,
  actor_id uuid not null check(actor_id=owner_id),
  assignment_revision bigint not null check(assignment_revision>0),
  expected_assignment_revision bigint not null check(expected_assignment_revision>=0 and assignment_revision>expected_assignment_revision),
  correction_event_id uuid not null,
  correction_revision integer not null check(correction_revision>0),
  field text not null,
  event_operation text not null check(event_operation='correct'),
  target_model_version text not null check(char_length(target_model_version) between 1 and 100),
  target_kind text not null check(target_kind in ('observed_assertion','unobserved_field')),
  assertion_id text check(assertion_id is null or char_length(assertion_id) between 1 and 100),
  opaque_target_id text not null check(char_length(opaque_target_id) between 1 and 200),
  supersedes_assignment_id uuid,
  mapping_mode text not null check(mapping_mode in ('existing','imported_assertion','add')),
  base_version_id uuid,
  fact_id uuid,
  mapping_proof_kind text not null check(mapping_proof_kind in ('current_citations','owned_origin_chain','explicit_candidate_add')),
  origin_version_id uuid,
  origin_fact_id uuid,
  location_kind text not null check(location_kind in ('contact','section','entry','bullet','new_entry','new_section_entry')),
  section_id uuid,
  entry_id uuid,
  bullet_id uuid,
  new_section_type text check(new_section_type in ('summary','experience','education','skills','certifications','projects','other')),
  new_section_title text check(char_length(new_section_title) between 1 and 100 and new_section_title=btrim(new_section_title)),
  created_at timestamptz not null default now(),
  unique(analysis_id,assignment_revision),
  unique(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256),
  foreign key(operation_id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256)
    references public.candidate_correction_operations(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256) on delete cascade,
  foreign key(correction_event_id,attempt_id,analysis_id,owner_id,organization_id,correction_revision,field,event_operation,actor_id)
    references public.evidence_corrections(id,attempt_id,analysis_id,owner_id,organization_id,revision,field,operation,actor_id) on delete cascade,
  foreign key(supersedes_assignment_id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256)
    references public.candidate_correction_assignments(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256) on delete cascade,
  foreign key(base_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(base_version_id,fact_id,owner_id,organization_id) references public.resume_facts(canonical_version_id,id,owner_id,organization_id) on delete cascade,
  foreign key(origin_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(origin_version_id,origin_fact_id,owner_id,organization_id) references public.resume_facts(canonical_version_id,id,owner_id,organization_id) on delete cascade,
  check((target_kind='observed_assertion')=(assertion_id is not null)),
  check((base_version_id is null)=(fact_id is null)),
  check((origin_version_id is null)=(origin_fact_id is null)),
  check((mapping_mode='existing' and base_version_id is not null and mapping_proof_kind<>'explicit_candidate_add')
    or (mapping_mode='imported_assertion' and base_version_id is null and target_kind='observed_assertion' and mapping_proof_kind='current_citations')
    or (mapping_mode='add' and base_version_id is null and mapping_proof_kind='explicit_candidate_add')),
  check((mapping_proof_kind='owned_origin_chain')=(origin_version_id is not null)),
  check(mapping_mode='imported_assertion' or
    (location_kind='contact' and section_id is null and entry_id is null and bullet_id is null and new_section_type is null and new_section_title is null)
    or (location_kind='section' and section_id is not null and entry_id is null and bullet_id is null and new_section_type is null and new_section_title is null)
    or (location_kind='entry' and section_id is not null and entry_id is not null and bullet_id is null and new_section_type is null and new_section_title is null)
    or (location_kind='bullet' and section_id is not null and entry_id is not null and bullet_id is not null and new_section_type is null and new_section_title is null)
    or (mapping_mode='add' and location_kind='new_entry' and section_id is not null and entry_id is null and bullet_id is null and new_section_type is null and new_section_title is null)
    or (mapping_mode='add' and location_kind='new_section_entry' and section_id is null and entry_id is null and bullet_id is null and new_section_type is not null and new_section_title is not null)),
  check(mapping_mode<>'imported_assertion' or (section_id is null and entry_id is null and bullet_id is null and new_section_type is null and new_section_title is null)),
  check(supersedes_assignment_id is distinct from id)
);

create table public.candidate_correction_applications (
  id uuid primary key,
  owner_id uuid not null,
  organization_id uuid not null,
  resume_id uuid not null,
  analysis_id uuid not null,
  source_resume_version_id uuid not null,
  attempt_id uuid not null,
  input_sha256 text not null,
  operation_id uuid not null,
  assignment_id uuid not null,
  actor_id uuid not null check(actor_id=owner_id),
  step_ordinal integer not null check(step_ordinal between 1 and 32),
  base_version_id uuid,
  result_version_id uuid not null,
  result_fact_id uuid not null,
  supersedes_application_id uuid,
  created_at timestamptz not null default now(),
  unique(operation_id,step_ordinal),
  unique(operation_id,assignment_id),
  unique(result_version_id,result_fact_id),
  unique(id,owner_id,organization_id),
  foreign key(operation_id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256)
    references public.candidate_correction_operations(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256) on delete cascade,
  foreign key(assignment_id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256)
    references public.candidate_correction_assignments(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256) on delete cascade,
  foreign key(base_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(result_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade deferrable initially deferred,
  foreign key(result_version_id,result_fact_id,owner_id,organization_id)
    references public.resume_facts(canonical_version_id,id,owner_id,organization_id) on delete cascade deferrable initially deferred,
  foreign key(supersedes_application_id,owner_id,organization_id)
    references public.candidate_correction_applications(id,owner_id,organization_id) on delete cascade,
  check(supersedes_application_id is distinct from id)
);

create table public.canonical_correction_snapshots (
  canonical_version_id uuid primary key,
  owner_id uuid not null,
  organization_id uuid not null,
  resume_id uuid not null,
  source_resume_version_id uuid not null,
  source_operation_id uuid,
  origin_kind text not null check(origin_kind in ('raw_import','inherited','correction','restore','legacy_restore')),
  inherited_from_version_id uuid,
  restored_from_version_id uuid,
  admission_policy_version text not null check(char_length(admission_policy_version) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(canonical_version_id,owner_id,organization_id),
  foreign key(canonical_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(source_operation_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.candidate_correction_operations(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade deferrable initially deferred,
  foreign key(inherited_from_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  foreign key(restored_from_version_id,resume_id,source_resume_version_id,owner_id,organization_id)
    references public.canonical_resume_versions(id,resume_id,source_resume_version_id,owner_id,organization_id) on delete cascade,
  check((origin_kind='raw_import' and inherited_from_version_id is null and restored_from_version_id is null)
    or (origin_kind='inherited' and inherited_from_version_id is not null and restored_from_version_id is null and source_operation_id is null)
    or (origin_kind='correction' and source_operation_id is not null and restored_from_version_id is null)
    or (origin_kind in ('restore','legacy_restore') and restored_from_version_id is not null and inherited_from_version_id is null and source_operation_id is null)),
  check(inherited_from_version_id is distinct from canonical_version_id),
  check(restored_from_version_id is distinct from canonical_version_id)
);

create table public.canonical_correction_snapshot_facts (
  canonical_version_id uuid not null,
  fact_id uuid not null,
  owner_id uuid not null,
  organization_id uuid not null,
  application_id uuid not null,
  primary key(canonical_version_id,fact_id),
  foreign key(canonical_version_id,owner_id,organization_id)
    references public.canonical_correction_snapshots(canonical_version_id,owner_id,organization_id) on delete cascade,
  foreign key(canonical_version_id,fact_id,owner_id,organization_id)
    references public.resume_facts(canonical_version_id,id,owner_id,organization_id) on delete cascade,
  foreign key(application_id,owner_id,organization_id)
    references public.candidate_correction_applications(id,owner_id,organization_id) on delete cascade deferrable initially deferred
);

alter table public.candidate_correction_operations enable row level security;
alter table public.candidate_correction_assignments enable row level security;
alter table public.candidate_correction_applications enable row level security;
alter table public.canonical_correction_snapshots enable row level security;
alter table public.canonical_correction_snapshot_facts enable row level security;
revoke all on public.candidate_correction_operations,public.candidate_correction_assignments,
  public.candidate_correction_applications,public.canonical_correction_snapshots,
  public.canonical_correction_snapshot_facts from public,anon,authenticated,service_role;
-- No read policy or grants until the separately reviewed owner/deletion read path.

create index correction_operations_attempt_idx on public.candidate_correction_operations(attempt_id);
create index correction_operations_owner_idx on public.candidate_correction_operations(owner_id);
create index correction_assignments_operation_idx on public.candidate_correction_assignments(operation_id);
create index correction_assignments_event_idx on public.candidate_correction_assignments(correction_event_id);
create index correction_assignments_supersedes_idx on public.candidate_correction_assignments(supersedes_assignment_id);
create index correction_applications_assignment_idx on public.candidate_correction_applications(assignment_id);
create index correction_applications_supersedes_idx on public.candidate_correction_applications(supersedes_application_id);
create index correction_snapshot_operation_idx on public.canonical_correction_snapshots(source_operation_id);
create index correction_snapshot_inherited_idx on public.canonical_correction_snapshots(inherited_from_version_id);
create index correction_snapshot_restored_idx on public.canonical_correction_snapshots(restored_from_version_id);
create index correction_snapshot_application_idx on public.canonical_correction_snapshot_facts(application_id);

create function private.reject_correction_ledger_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Correction ledger is immutable' using errcode='22023'; end;
$$;
revoke all on function private.reject_correction_ledger_update() from public,anon,authenticated,service_role;
create trigger correction_operations_immutable before update on public.candidate_correction_operations for each row execute function private.reject_correction_ledger_update();
create trigger correction_assignments_immutable before update on public.candidate_correction_assignments for each row execute function private.reject_correction_ledger_update();
create trigger correction_applications_immutable before update on public.candidate_correction_applications for each row execute function private.reject_correction_ledger_update();
create trigger correction_snapshots_immutable before update on public.canonical_correction_snapshots for each row execute function private.reject_correction_ledger_update();
create trigger correction_snapshot_facts_immutable before update on public.canonical_correction_snapshot_facts for each row execute function private.reject_correction_ledger_update();

-- Deferred collection integrity, not APPLY authority. Future admission must still
-- attest active attempts/history, target proofs, consent, deletion, CAS and codec.
-- No trigger below acquires an owner mutex or changes any historical row.
create function private.check_correction_ledger_integrity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  op public.candidate_correction_operations%rowtype;
  choice public.candidate_correction_assignments%rowtype;
  prior_choice public.candidate_correction_assignments%rowtype;
  applied public.candidate_correction_applications%rowtype;
  prior_applied public.candidate_correction_applications%rowtype;
  snap public.canonical_correction_snapshots%rowtype;
  link public.canonical_correction_snapshot_facts%rowtype;
  ver public.canonical_resume_versions%rowtype;
  fact public.resume_facts%rowtype;
  result_fact public.resume_facts%rowtype;
  event public.evidence_corrections%rowtype;
  evidence public.document_evidence_attempts%rowtype;
  previous_id uuid; previous_revision integer; child_id uuid;
  n integer; offset_count integer; i integer; matched integer;
  section jsonb; entry jsonb; bullet jsonb;
begin
  if tg_table_name='candidate_correction_operations' then
    select * into op from public.candidate_correction_operations where id=new.id;
    if not found then return null; end if; -- Transaction-local cascading erasure.
    n:=cardinality(op.selected_assignment_ids);
    select count(*) into matched from public.candidate_correction_assignments a
      where a.id=any(op.selected_assignment_ids)
        and (a.owner_id,a.organization_id,a.resume_id,a.analysis_id,a.source_resume_version_id,a.attempt_id,a.input_sha256)
          =(op.owner_id,op.organization_id,op.resume_id,op.analysis_id,op.source_resume_version_id,op.attempt_id,op.input_sha256);
    if matched<>n then raise exception 'CORRECTION_SELECTION_SCOPE' using errcode='23514'; end if;
    if exists(select 1 from public.candidate_correction_assignments a where a.id=any(op.selected_assignment_ids)
      and a.mapping_mode='existing' and a.base_version_id is distinct from op.expected_canonical_version_id) then
      raise exception 'CORRECTION_SELECTION_BASE' using errcode='23514';
    end if;
    if op.expected_canonical_version_id is not null then
      select * into ver from public.canonical_resume_versions where id=op.expected_canonical_version_id;
      if ver.source_evidence_version_id is distinct from op.attempt_id then
        raise exception 'CORRECTION_HEAD_ATTEMPT' using errcode='23514';
      end if;
      previous_revision:=ver.revision;
    else previous_revision:=0; end if;
    previous_id:=op.expected_canonical_version_id;
    if op.kind='assign' then
      if op.result_assignment_revision<>op.expected_assignment_revision+n
        or op.result_revision is distinct from nullif(previous_revision,0)
        or exists(select 1 from public.candidate_correction_applications where operation_id=op.id) then
        raise exception 'CORRECTION_ASSIGN_RESULT' using errcode='23514';
      end if;
      for i in 1..n loop
        select * into choice from public.candidate_correction_assignments where id=op.selected_assignment_ids[i];
        if choice.operation_id<>op.id or choice.assignment_revision<>op.expected_assignment_revision+i then
          raise exception 'CORRECTION_ASSIGN_ORDER' using errcode='23514';
        end if;
      end loop;
    else
      offset_count:=case when op.initial_import_version_id is null then 0 else 1 end;
      if (op.expected_canonical_version_id is null)<>(op.initial_import_version_id is not null)
        or op.result_assignment_revision<>op.expected_assignment_revision
        or cardinality(op.child_version_ids)<>n+offset_count
        or (select count(*) from public.candidate_correction_applications where operation_id=op.id)<>n then
        raise exception 'CORRECTION_APPLY_RESULT' using errcode='23514';
      end if;
      for i in 1..cardinality(op.child_version_ids) loop
        child_id:=op.child_version_ids[i];
        select * into ver from public.canonical_resume_versions where id=child_id
          and resume_id=op.resume_id and source_resume_version_id=op.source_resume_version_id
          and owner_id=op.owner_id and organization_id=op.organization_id;
        if not found or ver.parent_version_id is distinct from previous_id or ver.revision<>previous_revision+1
          or ver.source_evidence_version_id is distinct from op.attempt_id
          or ver.content->>'analysisId' is distinct from op.analysis_id::text
          or ver.content->>'inputSha256' is distinct from op.input_sha256 then
          raise exception 'CORRECTION_CHILD_CHAIN' using errcode='23514';
        end if;
        if i>offset_count then
          select * into applied from public.candidate_correction_applications
            where operation_id=op.id and step_ordinal=i-offset_count;
          if not found or applied.result_version_id<>child_id
            or applied.base_version_id is distinct from previous_id
            or applied.assignment_id<>op.selected_assignment_ids[i-offset_count] then
            raise exception 'CORRECTION_CHILD_APPLICATION' using errcode='23514';
          end if;
        end if;
        previous_id:=child_id; previous_revision:=ver.revision;
      end loop;
      if op.result_version_id<>previous_id or op.result_revision<>previous_revision then
        raise exception 'CORRECTION_FINAL_RESULT' using errcode='23514';
      end if;
    end if;

  elsif tg_table_name='candidate_correction_assignments' then
    select * into choice from public.candidate_correction_assignments where id=new.id;
    if not found then return null; end if;
    select * into op from public.candidate_correction_operations where id=choice.operation_id;
    if op.kind<>'assign' or choice.target_model_version<>op.target_model_version
      or choice.expected_assignment_revision<>op.expected_assignment_revision
      or not(choice.id=any(op.selected_assignment_ids))
      or (choice.mapping_mode='existing' and choice.base_version_id is distinct from op.expected_canonical_version_id)
      or (choice.mapping_mode='imported_assertion' and op.expected_canonical_version_id is not null) then
      raise exception 'CORRECTION_ASSIGN_BINDING' using errcode='23514';
    end if;
    if choice.supersedes_assignment_id is not null then
      select * into prior_choice from public.candidate_correction_assignments where id=choice.supersedes_assignment_id;
      if prior_choice.correction_event_id<>choice.correction_event_id
        or prior_choice.assignment_revision>=choice.assignment_revision then
        raise exception 'CORRECTION_ASSIGN_SUPERSESSION' using errcode='23514';
      end if;
    end if;
    select * into evidence from public.document_evidence_attempts where id=choice.attempt_id;
    if jsonb_typeof(evidence.envelope->'assertions') is distinct from 'array' then
      raise exception 'CORRECTION_ASSERTIONS' using errcode='23514';
    end if;
    if choice.target_kind='observed_assertion' then
      select count(*) into matched from jsonb_array_elements(evidence.envelope->'assertions') a
        where a->>'id'=choice.assertion_id and a->>'field'=choice.field;
      if matched<>1 then raise exception 'CORRECTION_ASSERTION_BINDING' using errcode='23514'; end if;
    elsif exists(select 1 from jsonb_array_elements(evidence.envelope->'assertions') a where a->>'field'=choice.field) then
      raise exception 'CORRECTION_FIELD_OBSERVED' using errcode='23514';
    end if;
    if choice.mapping_mode='existing' then
      select * into fact from public.resume_facts where canonical_version_id=choice.base_version_id and id=choice.fact_id;
      select * into ver from public.canonical_resume_versions where id=choice.base_version_id;
      if fact.type<>choice.field then raise exception 'CORRECTION_FACT_TYPE' using errcode='23514'; end if;
      if choice.location_kind='contact' then
        if jsonb_typeof(ver.content->'contactFactIds') is distinct from 'array'
          or (ver.content->'contactFactIds' ? choice.fact_id::text) is not true then
          raise exception 'CORRECTION_CONTACT_LOCATION' using errcode='23514';
        end if;
      else
        select value into section from jsonb_array_elements(ver.content->'sections') where value->>'id'=choice.section_id::text;
        if section is null then raise exception 'CORRECTION_SECTION_LOCATION' using errcode='23514'; end if;
        if choice.location_kind='section' then
          if jsonb_typeof(section->'factIds') is distinct from 'array'
            or (section->'factIds' ? choice.fact_id::text) is not true then raise exception 'CORRECTION_SECTION_FACT' using errcode='23514'; end if;
        else
          select value into entry from jsonb_array_elements(section->'entries') where value->>'id'=choice.entry_id::text;
          if entry is null then raise exception 'CORRECTION_ENTRY_LOCATION' using errcode='23514'; end if;
          if choice.location_kind='entry' then
            if jsonb_typeof(entry->'factIds') is distinct from 'array'
              or (entry->'factIds' ? choice.fact_id::text) is not true then raise exception 'CORRECTION_ENTRY_FACT' using errcode='23514'; end if;
          elsif choice.location_kind='bullet' then
            select value into bullet from jsonb_array_elements(entry->'bullets') where value->>'id'=choice.bullet_id::text;
            if bullet is null or jsonb_typeof(bullet->'factIds') is distinct from 'array'
              or (bullet->'factIds' ? choice.fact_id::text) is not true then raise exception 'CORRECTION_BULLET_FACT' using errcode='23514'; end if;
          else raise exception 'CORRECTION_EXISTING_LOCATION' using errcode='23514';
          end if;
        end if;
      end if;
    end if;

  elsif tg_table_name='candidate_correction_applications' then
    select * into applied from public.candidate_correction_applications where id=new.id;
    if not found then return null; end if;
    select * into op from public.candidate_correction_operations where id=applied.operation_id;
    select * into choice from public.candidate_correction_assignments where id=applied.assignment_id;
    select * into event from public.evidence_corrections where id=choice.correction_event_id;
    select * into fact from public.resume_facts where canonical_version_id=applied.result_version_id and id=applied.result_fact_id;
    select * into ver from public.canonical_resume_versions where id=applied.result_version_id;
    if op.kind='assign' or not(applied.assignment_id=any(op.selected_assignment_ids))
      or ver.parent_version_id is distinct from applied.base_version_id
      or fact.type is distinct from choice.field or fact.value is distinct from event.value
      or fact.state is distinct from 'unconfirmed' or fact.sources is distinct from '[]'::jsonb
      or fact.confirmation is not null then
      raise exception 'CORRECTION_APPLICATION_FACT' using errcode='23514';
    end if;
    if applied.supersedes_application_id is not null then
      select * into prior_applied from public.candidate_correction_applications where id=applied.supersedes_application_id;
      select * into prior_choice from public.candidate_correction_assignments where id=prior_applied.assignment_id;
      if (prior_applied.resume_id,prior_applied.analysis_id,prior_applied.source_resume_version_id,prior_applied.attempt_id,prior_applied.input_sha256)
          is distinct from (applied.resume_id,applied.analysis_id,applied.source_resume_version_id,applied.attempt_id,applied.input_sha256)
        or prior_choice.correction_event_id<>choice.correction_event_id
        or (select revision from public.canonical_resume_versions where id=prior_applied.result_version_id)>=ver.revision then
        raise exception 'CORRECTION_APPLICATION_SUPERSESSION' using errcode='23514';
      end if;
    end if;

  elsif tg_table_name='canonical_correction_snapshots' then
    select * into snap from public.canonical_correction_snapshots where canonical_version_id=new.canonical_version_id;
    if not found then return null; end if;
    select * into ver from public.canonical_resume_versions where id=snap.canonical_version_id;
    if (snap.inherited_from_version_id is not null and ver.parent_version_id is distinct from snap.inherited_from_version_id)
      or (snap.origin_kind='raw_import' and (ver.parent_version_id is not null or ver.revision<>1))
      or (snap.origin_kind in ('raw_import','legacy_restore') and exists(
        select 1 from public.canonical_correction_snapshot_facts where canonical_version_id=snap.canonical_version_id)) then
      raise exception 'CORRECTION_SNAPSHOT_ORIGIN' using errcode='23514';
    end if;
    if snap.inherited_from_version_id is not null then
      select revision into previous_revision from public.canonical_resume_versions where id=snap.inherited_from_version_id;
      if ver.revision<>previous_revision+1 then raise exception 'CORRECTION_SNAPSHOT_PARENT_REVISION' using errcode='23514'; end if;
    end if;
    if snap.restored_from_version_id is not null then
      select revision into previous_revision from public.canonical_resume_versions where id=snap.restored_from_version_id;
      if previous_revision>=ver.revision
        or (snap.origin_kind='legacy_restore' and exists(select 1 from public.canonical_correction_snapshots where canonical_version_id=snap.restored_from_version_id))
        or (snap.origin_kind='restore' and not exists(select 1 from public.canonical_correction_snapshots where canonical_version_id=snap.restored_from_version_id)) then
        raise exception 'CORRECTION_SNAPSHOT_RESTORE' using errcode='23514';
      end if;
    end if;
    if snap.source_operation_id is not null then
      select * into op from public.candidate_correction_operations where id=snap.source_operation_id;
      if (snap.origin_kind='raw_import' and op.initial_import_version_id is distinct from snap.canonical_version_id)
        or (snap.origin_kind='correction' and not(snap.canonical_version_id=any(op.child_version_ids))) then
        raise exception 'CORRECTION_SNAPSHOT_OPERATION' using errcode='23514';
      end if;
    end if;

  elsif tg_table_name='canonical_correction_snapshot_facts' then
    select * into link from public.canonical_correction_snapshot_facts
      where canonical_version_id=new.canonical_version_id and fact_id=new.fact_id;
    if not found then return null; end if;
    select * into snap from public.canonical_correction_snapshots where canonical_version_id=link.canonical_version_id;
    select * into applied from public.candidate_correction_applications where id=link.application_id;
    select * into ver from public.canonical_resume_versions where id=link.canonical_version_id;
    select * into fact from public.resume_facts where canonical_version_id=link.canonical_version_id and id=link.fact_id;
    select * into result_fact from public.resume_facts where canonical_version_id=applied.result_version_id and id=applied.result_fact_id;
    if (snap.resume_id,snap.source_resume_version_id) is distinct from (applied.resume_id,applied.source_resume_version_id)
      or ver.source_evidence_version_id is distinct from applied.attempt_id
      or ver.content->>'analysisId' is distinct from applied.analysis_id::text
      or ver.content->>'inputSha256' is distinct from applied.input_sha256
      or link.fact_id<>applied.result_fact_id or fact.type is distinct from result_fact.type or fact.value is distinct from result_fact.value then
      raise exception 'CORRECTION_SNAPSHOT_FACT' using errcode='23514';
    end if;
    if snap.origin_kind='correction' and applied.result_version_id=link.canonical_version_id
      and applied.operation_id=snap.source_operation_id then return null; end if;
    previous_id:=case when snap.origin_kind in ('inherited','correction') then snap.inherited_from_version_id
      when snap.origin_kind='restore' then snap.restored_from_version_id else null end;
    if previous_id is null or not exists(select 1 from public.canonical_correction_snapshot_facts p
      where p.canonical_version_id=previous_id and p.fact_id=link.fact_id and p.application_id=link.application_id
        and p.owner_id=link.owner_id and p.organization_id=link.organization_id) then
      raise exception 'CORRECTION_SNAPSHOT_LINEAGE' using errcode='23514';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.check_correction_ledger_integrity() from public,anon,authenticated,service_role;
create constraint trigger correction_operations_consistent after insert on public.candidate_correction_operations
  deferrable initially deferred for each row execute function private.check_correction_ledger_integrity();
create constraint trigger correction_assignments_consistent after insert on public.candidate_correction_assignments
  deferrable initially deferred for each row execute function private.check_correction_ledger_integrity();
create constraint trigger correction_applications_consistent after insert on public.candidate_correction_applications
  deferrable initially deferred for each row execute function private.check_correction_ledger_integrity();
create constraint trigger correction_snapshots_consistent after insert on public.canonical_correction_snapshots
  deferrable initially deferred for each row execute function private.check_correction_ledger_integrity();
create constraint trigger correction_snapshot_facts_consistent after insert on public.canonical_correction_snapshot_facts
  deferrable initially deferred for each row execute function private.check_correction_ledger_integrity();
