-- Current C02/A04 source, native parsing/application/cutover NOT authorized.
-- Frozen foundation/proposal remain unchanged; old application DML is not revoked.
begin;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
set local search_path='';

create function private.correction_fail(p_kind text) returns void
language plpgsql immutable set search_path='' as $$
begin
  case p_kind
    when 'not_found' then raise exception 'C02_NOT_FOUND' using errcode='42501';
    when 'conflict' then raise exception 'C02_CONFLICT' using errcode='P0C01';
    when 'invalid' then raise exception 'C02_INVALID' using errcode='22023';
    else raise exception 'C02_UNAVAILABLE' using errcode='P0C03';
  end case;
end;
$$;
create function private.correction_uuid(p_value jsonb,p_nullable boolean default false) returns boolean
language sql immutable set search_path='' as $$
  select (p_nullable and p_value='null'::jsonb) or
    (jsonb_typeof(p_value)='string' and p_value#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');
$$;
create function private.correction_scope(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare a public.analyses%rowtype; r public.resumes%rowtype; v public.resume_versions%rowtype;
  e public.document_evidence_attempts%rowtype; h public.canonical_resume_versions%rowtype;
  review_max bigint; review_count bigint; assignment_max bigint; assignment_count bigint; initial_owner uuid;
begin
  select owner_id into initial_owner from public.analyses where id=p_analysis_id;
  if initial_owner is distinct from p_user_id or p_user_id is null then perform private.correction_fail('not_found'); end if;
  -- Only the frozen candidate owner, before ANY row lock. Never add owners later.
  perform private.lock_candidate_owners(array[p_user_id]);
  if not private.try_candidate_privacy_write(p_user_id) then perform private.correction_fail('not_found'); end if;
  select root.* into r from public.resumes root join public.resume_versions source on source.resume_id=root.id
    join public.analyses analysis on analysis.resume_version_id=source.id
    where analysis.id=p_analysis_id and analysis.owner_id=p_user_id and source.owner_id=p_user_id
      and root.owner_id=p_user_id and source.organization_id=analysis.organization_id and root.organization_id=analysis.organization_id
    for update of root;
  if not found or r.status<>'active' then perform private.correction_fail('not_found'); end if;
  select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id and organization_id=r.organization_id for update;
  if not found then perform private.correction_fail('not_found'); end if;
  perform 1 from public.memberships where organization_id=r.organization_id and user_id=p_user_id and role in ('owner','admin','member') for share;
  if not found then perform private.correction_fail('not_found'); end if;
  select * into v from public.resume_versions where id=a.resume_version_id and resume_id=r.id
    and owner_id=p_user_id and organization_id=r.organization_id for share;
  if not found then perform private.correction_fail('not_found'); end if;
  select * into e from public.document_evidence_attempts where analysis_id=a.id
    order by attempt_number desc limit 1 for share;
  if not found or (e.owner_id,e.organization_id,e.resume_version_id,e.input_sha256)
    is distinct from (p_user_id,r.organization_id,v.id,v.checksum)
    or e.envelope->>'id' is distinct from e.id::text or e.envelope->>'analysisId' is distinct from a.id::text
    or e.envelope->>'ownerId' is distinct from p_user_id::text or e.envelope->>'sourceId' is distinct from v.id::text
    or e.envelope->>'inputSha256' is distinct from v.checksum or e.envelope->>'schemaVersion' is distinct from 'evidence/2.0.0'
    or jsonb_typeof(e.envelope->'assertions') is distinct from 'array' or jsonb_typeof(e.envelope->'spans') is distinct from 'array' then
    perform private.correction_fail('unavailable'); end if;
  select coalesce(max(revision),0),count(*) into review_max,review_count from public.evidence_corrections where analysis_id=a.id;
  select coalesce(max(assignment_revision),0),count(*) into assignment_max,assignment_count
    from public.candidate_correction_assignments where analysis_id=a.id;
  if review_max>1000 or review_count<>review_max or assignment_max>1000 or assignment_count<>assignment_max
    or exists(select 1 from public.evidence_corrections where analysis_id=a.id and (owner_id,organization_id) is distinct from (p_user_id,r.organization_id))
    or exists(select 1 from public.candidate_correction_assignments where analysis_id=a.id
      and (owner_id,organization_id,resume_id,source_resume_version_id,input_sha256) is distinct from (p_user_id,r.organization_id,r.id,v.id,v.checksum)) then
    perform private.correction_fail('unavailable'); end if;
  select version.* into h from public.canonical_resume_heads head join public.canonical_resume_versions version on version.id=head.version_id
    where head.resume_id=r.id for update of head;
  if found and ((h.owner_id,h.organization_id,h.source_resume_version_id) is distinct from (p_user_id,r.organization_id,v.id)
    or h.content->>'analysisId' is distinct from a.id::text or private.canonical_shape_valid(h.content) is not true) then
    perform private.correction_fail('conflict'); end if;
  return jsonb_build_object('ownerId',p_user_id,'organizationId',r.organization_id,'resumeId',r.id,'analysisId',a.id,
    'sourceId',v.id,'attemptId',e.id,'inputSha256',v.checksum,'evidenceSchemaVersion','evidence/2.0.0',
    'fieldExtractorVersion',e.envelope->'fieldExtractorVersion','targetModelVersion','evidence-targets/1.0.0',
    'projectionModelVersion','canonical-corrections/1.0.1','admissionPolicyVersion','candidate-correction-admission/1.0.0',
    'reviewRevision',review_max,'assignmentRevision',assignment_max,'headId',h.id,'headRevision',h.revision,'headAttemptId',h.source_evidence_version_id);
end;
$$;

create function private.correction_location(p_body jsonb,p_fact uuid) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; s jsonb; e jsonb; b jsonb;
begin
  if p_body->'contactFactIds' ? p_fact::text then result:=result||jsonb_build_array(jsonb_build_object('kind','contact','sectionId',null,'entryId',null,'bulletId',null)); end if;
  for s in select value from jsonb_array_elements(p_body->'sections') loop
    if s->'factIds' ? p_fact::text then result:=result||jsonb_build_array(jsonb_build_object('kind','section','sectionId',s->>'id','entryId',null,'bulletId',null)); end if;
    for e in select value from jsonb_array_elements(s->'entries') loop
      if e->'factIds' ? p_fact::text then result:=result||jsonb_build_array(jsonb_build_object('kind','entry','sectionId',s->>'id','entryId',e->>'id','bulletId',null)); end if;
      for b in select value from jsonb_array_elements(e->'bullets') loop
        if b->'factIds' ? p_fact::text then result:=result||jsonb_build_array(jsonb_build_object('kind','bullet','sectionId',s->>'id','entryId',e->>'id','bulletId',b->>'id')); end if;
      end loop;
    end loop;
  end loop;
  return coalesce((select jsonb_agg(value order by convert_to(value::text,'UTF8')) from jsonb_array_elements(result)),'[]'::jsonb);
end;
$$;
-- Match the A03 placement floor before any global fact replacement. A selected
-- location alone cannot authorize changing the same employer in two entries.
create function private.correction_assert_fact_placement(p_body jsonb,p_fact uuid,p_field text) returns void
language plpgsql immutable set search_path='' as $$
declare locations jsonb:=private.correction_location(p_body,p_fact); entries integer;
begin
  select count(distinct value->>'entryId') into entries
    from jsonb_array_elements(locations) where value->>'entryId' is not null;
  if jsonb_array_length(locations)=0
    or (p_field not in ('name','email','phone') and entries>1) then
    perform private.correction_fail('conflict');
  end if;
end;
$$;
create function private.correction_citations(p_assertion jsonb,p_attempt uuid) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('attemptId',p_attempt,'spanId',value->>'spanId','start',value->'start','end',value->'end')
    order by convert_to(value->>'spanId','UTF8'),(value->>'start')::integer,(value->>'end')::integer),'[]'::jsonb)
  from jsonb_array_elements(p_assertion->'evidence');
$$;
create function private.correction_sorted_citations(p_sources jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(value order by convert_to(value->>'attemptId','UTF8'),convert_to(value->>'spanId','UTF8'),(value->>'start')::integer,(value->>'end')::integer),'[]'::jsonb)
  from jsonb_array_elements(p_sources);
$$;

create function private.write_correction_snapshot(p_version_id uuid,p_command jsonb) returns void
language plpgsql volatile set search_path='' as $$
declare v public.canonical_resume_versions%rowtype; application public.candidate_correction_applications%rowtype;
  source_operation uuid; origin text; inherited uuid; restored uuid;
begin
  select * into strict v from public.canonical_resume_versions where id=p_version_id;
  if exists(select 1 from public.canonical_correction_snapshots where canonical_version_id=v.id) then perform private.correction_fail('conflict'); end if;
  select * into application from public.candidate_correction_applications where result_version_id=v.id;
  if found then
    source_operation:=application.operation_id; origin:='correction'; inherited:=v.parent_version_id;
  elsif v.parent_version_id is null then
    origin:='raw_import';
    select id into source_operation from public.candidate_correction_operations where initial_import_version_id=v.id;
  elsif p_command->>'operation'='rollback' then
    restored:=(p_command->>'targetVersionId')::uuid;
    origin:=case when exists(select 1 from public.canonical_correction_snapshots where canonical_version_id=restored) then 'restore' else 'legacy_restore' end;
  else origin:='inherited'; inherited:=v.parent_version_id;
  end if;
  insert into public.canonical_correction_snapshots(canonical_version_id,owner_id,organization_id,resume_id,source_resume_version_id,
    source_operation_id,origin_kind,inherited_from_version_id,restored_from_version_id,admission_policy_version)
    values(v.id,v.owner_id,v.organization_id,v.resume_id,v.source_resume_version_id,source_operation,origin,inherited,restored,'candidate-correction-admission/1.0.0');
  insert into public.canonical_correction_snapshot_facts(canonical_version_id,fact_id,owner_id,organization_id,application_id)
    select v.id,old.fact_id,v.owner_id,v.organization_id,old.application_id
      from public.canonical_correction_snapshot_facts old
      join public.resume_facts fact on fact.canonical_version_id=v.id and fact.id=old.fact_id
      join public.candidate_correction_applications applied on applied.id=old.application_id
      join public.resume_facts original on original.canonical_version_id=applied.result_version_id and original.id=applied.result_fact_id
    where old.canonical_version_id=coalesce(inherited,restored) and old.owner_id=v.owner_id and old.organization_id=v.organization_id
      and fact.type=original.type and fact.value=original.value
      and (p_command->>'operation' is distinct from 'edit' or old.fact_id::text is distinct from p_command->>'factId')
      and (application.id is null or old.fact_id<>application.result_fact_id)
      and (application.supersedes_application_id is null or old.application_id<>application.supersedes_application_id);
  if application.id is not null then
    insert into public.canonical_correction_snapshot_facts(canonical_version_id,fact_id,owner_id,organization_id,application_id)
      values(v.id,application.result_fact_id,v.owner_id,v.organization_id,application.id);
  end if;
end;
$$;

create function private.correction_validate_command(p_command jsonb,p_assign boolean) returns void
language plpgsql immutable set search_path='' as $$
declare key text; item jsonb; location jsonb; mode text;
begin
  if jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>65536
    or private.evidence_keys(p_command,array['schemaVersion','kind','idempotencyKey','sourceId','attemptId','inputSha256',
      'evidenceSchemaVersion','fieldExtractorVersion','targetModelVersion','projectionModelVersion','admissionPolicyVersion',
      'expectedReviewRevision','expectedAssignmentRevision','expectedVersionId','acknowledgement','selectors']) is not true
    or p_command->>'schemaVersion' is distinct from 'candidate-correction-command/1.0.0'
    or p_command->>'kind' not in ('assign','apply','add','reapply') or (p_command->>'kind'='assign') is distinct from p_assign
    or p_command->'acknowledgement' is distinct from 'true'::jsonb then perform private.correction_fail('invalid'); end if;
  foreach key in array array['idempotencyKey','sourceId','attemptId'] loop
    if private.correction_uuid(p_command->key) is not true then perform private.correction_fail('invalid'); end if;
  end loop;
  if private.correction_uuid(p_command->'expectedVersionId',true) is not true
    or jsonb_typeof(p_command->'inputSha256') is distinct from 'string' or p_command->>'inputSha256' !~ '^[a-f0-9]{64}$'
    or p_command->>'evidenceSchemaVersion' is distinct from 'evidence/2.0.0'
    or p_command->>'targetModelVersion' is distinct from 'evidence-targets/1.0.0'
    or p_command->>'projectionModelVersion' is distinct from 'canonical-corrections/1.0.1'
    or p_command->>'admissionPolicyVersion' is distinct from 'candidate-correction-admission/1.0.0'
    or (p_command->'fieldExtractorVersion'<>'null'::jsonb and (jsonb_typeof(p_command->'fieldExtractorVersion') is distinct from 'string'
      or char_length(p_command->>'fieldExtractorVersion') not between 1 and 100)) then perform private.correction_fail('invalid'); end if;
  foreach key in array array['expectedReviewRevision','expectedAssignmentRevision'] loop
    if jsonb_typeof(p_command->key) is distinct from 'number' or p_command->>key !~ '^(0|[1-9][0-9]{0,9})$'
      or (p_command->>key)::bigint>2147483647 then perform private.correction_fail('invalid'); end if;
  end loop;
  if jsonb_typeof(p_command->'selectors') is distinct from 'array' or jsonb_array_length(p_command->'selectors') not between 1 and 32 then
    perform private.correction_fail('invalid'); end if;
  for item in select value from jsonb_array_elements(p_command->'selectors') loop
    if not p_assign then
      if private.evidence_keys(item,array['assignmentId','priorApplicationId']) is not true
        or private.correction_uuid(item->'assignmentId') is not true or private.correction_uuid(item->'priorApplicationId',true) is not true
        or (item->'priorApplicationId'<>'null'::jsonb) is distinct from (p_command->>'kind'='reapply') then perform private.correction_fail('invalid'); end if;
      continue;
    end if;
    if private.evidence_keys(item,array['eventId','targetKind','assertionId','opaqueTargetId','mappingMode','baseVersionId','factId',
      'mappingProofKind','originVersionId','originFactId','location','supersedesAssignmentId']) is not true
      or private.correction_uuid(item->'eventId') is not true or item->>'targetKind' not in ('observed_assertion','unobserved_field')
      or jsonb_typeof(item->'opaqueTargetId') is distinct from 'string' or char_length(item->>'opaqueTargetId') not between 1 and 200
      or (item->>'targetKind'='observed_assertion') is distinct from (item->'assertionId'<>'null'::jsonb)
      or (item->'assertionId'<>'null'::jsonb and (jsonb_typeof(item->'assertionId') is distinct from 'string' or char_length(item->>'assertionId') not between 1 and 100)) then
      perform private.correction_fail('invalid'); end if;
    foreach key in array array['baseVersionId','factId','originVersionId','originFactId','supersedesAssignmentId'] loop
      if private.correction_uuid(item->key,true) is not true then perform private.correction_fail('invalid'); end if;
    end loop;
    if (item->'baseVersionId'='null'::jsonb) is distinct from (item->'factId'='null'::jsonb)
      or (item->'originVersionId'='null'::jsonb) is distinct from (item->'originFactId'='null'::jsonb)
      or item->>'mappingProofKind' not in ('current_citations','owned_origin_chain','explicit_candidate_add')
      or (item->>'mappingProofKind'='owned_origin_chain') is distinct from (item->'originVersionId'<>'null'::jsonb) then perform private.correction_fail('invalid'); end if;
    mode:=item->>'mappingMode'; location:=item->'location';
    if jsonb_typeof(item->'mappingMode') is distinct from 'string' or jsonb_typeof(item->'mappingProofKind') is distinct from 'string'
      or jsonb_typeof(location->'kind') is distinct from 'string' then perform private.correction_fail('invalid'); end if;
    if mode not in ('existing','imported_assertion','add') or private.evidence_keys(location,array['kind','sectionId','entryId','bulletId','newSectionType','newSectionTitle']) is not true
      or location->>'kind' not in ('contact','section','entry','bullet','new_entry','new_section_entry') then perform private.correction_fail('invalid'); end if;
    foreach key in array array['sectionId','entryId','bulletId'] loop
      if private.correction_uuid(location->key,true) is not true then perform private.correction_fail('invalid'); end if;
    end loop;
    if mode='imported_assertion' then
      if item->'baseVersionId'<>'null'::jsonb or item->>'targetKind'<>'observed_assertion' or item->>'mappingProofKind'<>'current_citations'
        or location->>'kind' not in ('contact','entry') or location->'sectionId'<>'null'::jsonb or location->'entryId'<>'null'::jsonb
        or location->'bulletId'<>'null'::jsonb or location->'newSectionType'<>'null'::jsonb or location->'newSectionTitle'<>'null'::jsonb then perform private.correction_fail('invalid'); end if;
    else
      if (mode='existing' and (item->'baseVersionId'='null'::jsonb or item->>'mappingProofKind'='explicit_candidate_add'))
        or (mode='add' and (item->'baseVersionId'<>'null'::jsonb or item->>'mappingProofKind'<>'explicit_candidate_add')) then perform private.correction_fail('invalid'); end if;
      if location->>'kind'='new_section_entry' then
        if mode<>'add' or location->'sectionId'<>'null'::jsonb or location->'entryId'<>'null'::jsonb or location->'bulletId'<>'null'::jsonb
          or jsonb_typeof(location->'newSectionType') is distinct from 'string'
          or location->>'newSectionType' not in ('summary','experience','education','skills','certifications','projects','other')
          or jsonb_typeof(location->'newSectionTitle') is distinct from 'string' or char_length(location->>'newSectionTitle') not between 1 and 100
          or location->>'newSectionTitle'<>btrim(location->>'newSectionTitle') then perform private.correction_fail('invalid'); end if;
      else
        if location->'newSectionType'<>'null'::jsonb or location->'newSectionTitle'<>'null'::jsonb
          or (location->>'kind'='contact' and (location->'sectionId'<>'null'::jsonb or location->'entryId'<>'null'::jsonb or location->'bulletId'<>'null'::jsonb))
          or (location->>'kind' in ('section','new_entry') and (location->'sectionId'='null'::jsonb or location->'entryId'<>'null'::jsonb or location->'bulletId'<>'null'::jsonb))
          or (location->>'kind'='entry' and (location->'sectionId'='null'::jsonb or location->'entryId'='null'::jsonb or location->'bulletId'<>'null'::jsonb))
          or (location->>'kind'='bullet' and (location->'sectionId'='null'::jsonb or location->'entryId'='null'::jsonb or location->'bulletId'='null'::jsonb))
          or (location->>'kind'='new_entry' and mode<>'add') then perform private.correction_fail('invalid'); end if;
      end if;
    end if;
  end loop;
end;
$$;

create function private.correction_selector_from_row(p_choice public.candidate_correction_assignments,p_prior uuid default null) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('assignmentId',p_choice.id,'eventId',p_choice.correction_event_id,'targetKind',p_choice.target_kind,
    'assertionId',p_choice.assertion_id,'opaqueTargetId',p_choice.opaque_target_id,'mappingMode',p_choice.mapping_mode,
    'baseVersionId',p_choice.base_version_id,'factId',p_choice.fact_id,'mappingProofKind',p_choice.mapping_proof_kind,
    'originVersionId',p_choice.origin_version_id,'originFactId',p_choice.origin_fact_id,'supersedesAssignmentId',p_choice.supersedes_assignment_id,
    'location',jsonb_build_object('kind',p_choice.location_kind,'sectionId',p_choice.section_id,'entryId',p_choice.entry_id,'bulletId',p_choice.bullet_id,
      'newSectionType',p_choice.new_section_type,'newSectionTitle',p_choice.new_section_title),'priorApplicationId',p_prior);
$$;
create function private.correction_normalize(p_scope jsonb,p_command jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare raw jsonb; item jsonb; result jsonb:='[]'; event public.evidence_corrections%rowtype;
  choice public.candidate_correction_assignments%rowtype; evidence public.document_evidence_attempts%rowtype;
  version public.canonical_resume_versions%rowtype; origin public.canonical_resume_versions%rowtype;
  fact public.resume_facts%rowtype; original_fact public.resume_facts%rowtype; assertion jsonb; ref jsonb; span jsonb;
  assembled text; count_value integer; depth integer; seen uuid[]; previous_revision integer; location jsonb;
begin
  foreach assembled in array array['sourceId','attemptId','inputSha256','evidenceSchemaVersion','fieldExtractorVersion',
    'targetModelVersion','projectionModelVersion','admissionPolicyVersion'] loop
    if p_command->assembled is distinct from p_scope->assembled then perform private.correction_fail('conflict'); end if;
  end loop;
  select * into strict evidence from public.document_evidence_attempts where id=(p_scope->>'attemptId')::uuid;
  for raw in select value from jsonb_array_elements(p_command->'selectors') loop
    if p_command->>'kind'='assign' then item:=raw||jsonb_build_object('assignmentId',null,'priorApplicationId',null);
    else
      select * into choice from public.candidate_correction_assignments where id=(raw->>'assignmentId')::uuid
        and (owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256)=
          ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'analysisId')::uuid,
            (p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'inputSha256');
      if not found then perform private.correction_fail('conflict'); end if;
      item:=private.correction_selector_from_row(choice,(raw->>'priorApplicationId')::uuid);
    end if;
    select * into event from public.evidence_corrections where id=(item->>'eventId')::uuid
      and (owner_id,organization_id,analysis_id,attempt_id,actor_id)=((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,
        (p_scope->>'analysisId')::uuid,evidence.id,(p_scope->>'ownerId')::uuid);
    if not found or event.operation<>'correct' or event.candidate_id is not null or event.field not in ('name','email','phone','employer','role','dates','education','certification')
      or event.value<>btrim(event.value) then perform private.correction_fail('invalid'); end if;
    assertion:=null;
    if item->>'targetKind'='observed_assertion' then
      select count(*),jsonb_agg(value)->0 into count_value,assertion from jsonb_array_elements(evidence.envelope->'assertions')
        where value->>'id'=item->>'assertionId' and value->>'field'=event.field;
      if count_value<>1 or jsonb_typeof(assertion->'evidence') is distinct from 'array' or jsonb_array_length(assertion->'evidence') not between 1 and 20 then perform private.correction_fail('invalid'); end if;
      assembled:='';
      for ref in select value from jsonb_array_elements(assertion->'evidence') loop
        select count(*),jsonb_agg(value)->0 into count_value,span from jsonb_array_elements(evidence.envelope->'spans') where value->>'id'=ref->>'spanId';
        if count_value<>1 or private.evidence_keys(ref,array['spanId','start','end']) is not true
          or private.evidence_integer(ref->'start',0,200000) is not true or private.evidence_integer(ref->'end',1,200000) is not true
          or (ref->>'end')::integer<=(ref->>'start')::integer or (ref->>'end')::integer>char_length(span->>'text') then perform private.correction_fail('invalid'); end if;
        assembled:=assembled||substring(span->>'text' from (ref->>'start')::integer+1 for (ref->>'end')::integer-(ref->>'start')::integer);
      end loop;
      if assertion->>'value' is distinct from assembled then perform private.correction_fail('invalid'); end if;
    elsif exists(select 1 from jsonb_array_elements(evidence.envelope->'assertions') where value->>'field'=event.field) then
      perform private.correction_fail('invalid');
    end if;
    if item->>'mappingMode'='existing' then
      if item->'baseVersionId' is distinct from p_command->'expectedVersionId' then perform private.correction_fail('conflict'); end if;
      select * into version from public.canonical_resume_versions where id=(item->>'baseVersionId')::uuid
        and (owner_id,organization_id,resume_id,source_resume_version_id,source_evidence_version_id)=
          ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,evidence.id);
      select * into fact from public.resume_facts where canonical_version_id=version.id and id=(item->>'factId')::uuid;
      if version.id is null or fact.id is null or fact.type<>event.field then perform private.correction_fail('invalid'); end if;
      location:=item->'location';
      if not exists(select 1 from jsonb_array_elements(private.correction_location(version.content,fact.id)) l
        where l.value=jsonb_build_object('kind',location->>'kind','sectionId',location->'sectionId','entryId',location->'entryId','bulletId',location->'bulletId')) then perform private.correction_fail('invalid'); end if;
      perform private.correction_assert_fact_placement(version.content,fact.id,event.field);
      if item->>'mappingProofKind'='current_citations' then original_fact:=fact;
      else
        if (item->>'originFactId')::uuid<>fact.id then perform private.correction_fail('invalid'); end if;
        origin:=version; seen:='{}'; depth:=0;
        loop
          if origin.id is null or origin.id=any(seen) or depth>64 then perform private.correction_fail('invalid'); end if;
          seen:=array_append(seen,origin.id);
          if origin.id=(item->>'originVersionId')::uuid then exit; end if;
          previous_revision:=origin.revision;
          select * into origin from public.canonical_resume_versions where id=origin.parent_version_id
            and (owner_id,organization_id,resume_id,source_resume_version_id,source_evidence_version_id)=
              ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,evidence.id);
          if not found or origin.revision<>previous_revision-1 then perform private.correction_fail('invalid'); end if;
          depth:=depth+1;
        end loop;
        select * into original_fact from public.resume_facts where canonical_version_id=origin.id and id=fact.id;
      end if;
      if original_fact.id is null or original_fact.type<>event.field then perform private.correction_fail('invalid'); end if;
      if assertion is not null then
        if private.correction_sorted_citations(original_fact.sources)<>private.correction_citations(assertion,evidence.id) then perform private.correction_fail('invalid'); end if;
      elsif item->>'mappingProofKind'<>'owned_origin_chain' or not exists(
        select 1 from public.canonical_correction_snapshot_facts link
          join public.candidate_correction_applications applied on applied.id=link.application_id
          join public.candidate_correction_assignments assigned on assigned.id=applied.assignment_id
        where link.canonical_version_id=origin.id and link.fact_id=original_fact.id and link.owner_id=(p_scope->>'ownerId')::uuid
          and link.organization_id=(p_scope->>'organizationId')::uuid and assigned.analysis_id=(p_scope->>'analysisId')::uuid
          and assigned.source_resume_version_id=(p_scope->>'sourceId')::uuid and assigned.attempt_id=evidence.id
          and assigned.input_sha256=p_scope->>'inputSha256' and assigned.target_kind='unobserved_field' and assigned.field=event.field) then
        -- A candidate-added absent slot has no source assertion/citation. Its
        -- exact owned snapshot/application origin can prove identity, not truth.
        perform private.correction_fail('invalid');
      end if;
    elsif item->>'mappingMode'='imported_assertion' and p_command->>'kind'='assign' and p_command->'expectedVersionId'<>'null'::jsonb then perform private.correction_fail('conflict');
    elsif item->>'mappingMode'='add' and p_command->>'kind'='assign' then
      if p_command->'expectedVersionId'='null'::jsonb then
        version.content:='{"facts":[],"sections":[],"contactFactIds":[]}'::jsonb;
      else
        select * into version from public.canonical_resume_versions where id=(p_command->>'expectedVersionId')::uuid
          and (owner_id,organization_id,resume_id,source_resume_version_id,source_evidence_version_id)=
            ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,evidence.id);
        if not found then perform private.correction_fail('conflict'); end if;
      end if;
      -- Dry placement checks existing owned structure/field compatibility only;
      -- null scratch IDs are discarded. No technical IDs/writes before replay.
      perform private.correction_place(version.content,item->'location',event.field,null,event.value,null,null,null);
    end if;
    item:=item||jsonb_build_object('field',event.field,'eventRevision',event.revision);
    if exists(select 1 from jsonb_array_elements(result) where value->>'eventId'=event.id::text) then perform private.correction_fail('invalid'); end if;
    result:=result||jsonb_build_array(item);
  end loop;
  return (select jsonb_agg(value order by (value->>'eventRevision')::integer,
    array_position(array['name','email','phone','employer','role','dates','education','certification'],value->>'field'),
    convert_to(coalesce(value->>'assertionId','unobserved:'||(value->>'field')),'UTF8'),
    array_position(array['contact','section','entry','bullet','new_entry','new_section_entry'],value->'location'->>'kind'),
    convert_to(coalesce(value->>'baseVersionId',''),'UTF8'),convert_to(coalesce(value->>'factId',''),'UTF8'),
    convert_to(coalesce(value->'location'->>'sectionId',''),'UTF8'),convert_to(coalesce(value->'location'->>'entryId',''),'UTF8'),convert_to(coalesce(value->'location'->>'bulletId',''),'UTF8'))
    from jsonb_array_elements(result));
end;
$$;

create function private.correction_atoms(p_scope jsonb,p_command jsonb,p_selectors jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare atoms text[]; item jsonb; location jsonb;
begin
  atoms:=array[p_command->>'kind',p_scope->>'ownerId',p_scope->>'organizationId',p_scope->>'resumeId',p_scope->>'analysisId',
    p_scope->>'sourceId',p_scope->>'attemptId',p_scope->>'inputSha256',p_scope->>'ownerId',p_scope->>'evidenceSchemaVersion',
    p_scope->>'fieldExtractorVersion',p_scope->>'targetModelVersion',p_scope->>'projectionModelVersion',p_scope->>'admissionPolicyVersion',
    p_command->>'expectedReviewRevision',p_command->>'expectedAssignmentRevision',p_command->>'expectedVersionId','1',jsonb_array_length(p_selectors)::text];
  for item in select value from jsonb_array_elements(p_selectors) loop
    location:=item->'location';
    atoms:=atoms||array[item->>'assignmentId',item->>'eventId',item->>'eventRevision',
      (array_position(array['name','email','phone','employer','role','dates','education','certification'],item->>'field')-1)::text,
      item->>'targetKind',item->>'assertionId',item->>'opaqueTargetId',item->>'mappingMode',item->>'baseVersionId',item->>'factId',
      item->>'mappingProofKind',item->>'originVersionId',item->>'originFactId',
      (array_position(array['contact','section','entry','bullet','new_entry','new_section_entry'],location->>'kind')-1)::text,
      location->>'sectionId',location->>'entryId',location->>'bulletId',location->>'newSectionType',location->>'newSectionTitle',
      item->>'supersedesAssignmentId',item->>'priorApplicationId'];
  end loop;
  return atoms;
end;
$$;

create function private.correction_latest(p_scope jsonb,p_item jsonb,p_pending jsonb) returns boolean
language plpgsql volatile set search_path='' as $$
declare newer public.evidence_corrections%rowtype; target jsonb; choice public.candidate_correction_assignments%rowtype;
begin
  for newer in select * from public.evidence_corrections where analysis_id=(p_scope->>'analysisId')::uuid
    and attempt_id=(p_scope->>'attemptId')::uuid and field=p_item->>'field' and revision>(p_item->>'eventRevision')::integer loop
    if newer.operation='confirm' then
      if newer.candidate_id is null or newer.candidate_id is not distinct from p_item->>'assertionId' then return false; end if;
    else
      select value into target from jsonb_array_elements(p_pending) where value->>'eventId'=newer.id::text;
      if not found then
        select * into choice from public.candidate_correction_assignments where correction_event_id=newer.id order by assignment_revision desc limit 1;
        if not found then return false; end if;
        target:=private.correction_selector_from_row(choice);
      end if;
      if (target->>'targetKind',target->>'assertionId') is not distinct from (p_item->>'targetKind',p_item->>'assertionId') then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
create function private.correction_receipt(p_operation uuid,p_replayed boolean) returns jsonb
language sql volatile set search_path='' as $$
  select jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status',case when kind='assign' then 'assigned' else 'applied' end,
    'kind',kind,'idempotencyKey',idempotency_key,'operationId',id,'versionId',result_version_id,'revision',result_revision,
    'assignmentRevision',result_assignment_revision,'assignmentIds',to_jsonb(selected_assignment_ids),'childVersionIds',to_jsonb(child_version_ids),
    'idempotent',p_replayed,'scoringEligible',false) from public.candidate_correction_operations where id=p_operation;
$$;
create function private.correction_replay(p_scope jsonb,p_command jsonb,p_selectors jsonb,p_hash text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare op public.candidate_correction_operations%rowtype; recorded jsonb:='[]'; item jsonb; choice public.candidate_correction_assignments%rowtype;
  application public.candidate_correction_applications%rowtype; normalized jsonb; selected_id uuid;
begin
  select * into op from public.candidate_correction_operations where resume_id=(p_scope->>'resumeId')::uuid
    and idempotency_key=(p_command->>'idempotencyKey')::uuid;
  if not found then return null; end if;
  if op.command_sha256<>p_hash or op.kind<>p_command->>'kind'
    or (op.owner_id,op.organization_id,op.analysis_id,op.source_resume_version_id,op.attempt_id,op.input_sha256,op.actor_id)
      is distinct from ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'analysisId')::uuid,
        (p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'inputSha256',(p_scope->>'ownerId')::uuid)
    or op.expected_review_revision<>(p_command->>'expectedReviewRevision')::bigint
    or op.expected_assignment_revision<>(p_command->>'expectedAssignmentRevision')::bigint
    or op.expected_canonical_version_id is distinct from (p_command->>'expectedVersionId')::uuid
    or (op.evidence_schema_version,op.field_extractor_version,op.target_model_version,op.projection_model_version,op.admission_policy_version)
      is distinct from (p_command->>'evidenceSchemaVersion',p_command->>'fieldExtractorVersion',p_command->>'targetModelVersion',p_command->>'projectionModelVersion',p_command->>'admissionPolicyVersion') then
    perform private.correction_fail('conflict'); end if;
  foreach selected_id in array op.selected_assignment_ids loop
    select * into strict choice from public.candidate_correction_assignments where id=selected_id;
    if op.kind='assign' then normalized:=private.correction_selector_from_row(choice)||'{"assignmentId":null}'::jsonb;
    else
      select * into strict application from public.candidate_correction_applications where operation_id=op.id and assignment_id=choice.id;
      normalized:=private.correction_selector_from_row(choice,application.supersedes_application_id);
    end if;
    normalized:=normalized||jsonb_build_object('field',choice.field,'eventRevision',choice.correction_revision);
    recorded:=recorded||jsonb_build_array(normalized);
  end loop;
  if recorded<>p_selectors then perform private.correction_fail('conflict'); end if;
  return private.correction_receipt(op.id,true);
end;
$$;
create function private.correction_admit_new(p_scope jsonb,p_command jsonb,p_selectors jsonb) returns void
language plpgsql volatile set search_path='' as $$
declare item jsonb; current_choice public.candidate_correction_assignments%rowtype; prior public.candidate_correction_applications%rowtype;
  prior_event uuid;
begin
  if p_command->'expectedVersionId' is distinct from p_scope->'headId'
    or p_command->'expectedReviewRevision' is distinct from p_scope->'reviewRevision'
    or p_command->'expectedAssignmentRevision' is distinct from p_scope->'assignmentRevision'
    or (p_scope->'headId'<>'null'::jsonb and p_scope->'headAttemptId' is distinct from p_scope->'attemptId') then perform private.correction_fail('conflict'); end if;
  for item in select value from jsonb_array_elements(p_selectors) loop
    if not private.correction_latest(p_scope,item,p_selectors) then perform private.correction_fail('conflict'); end if;
    select * into current_choice from public.candidate_correction_assignments where correction_event_id=(item->>'eventId')::uuid order by assignment_revision desc limit 1;
    if p_command->>'kind'='assign' then
      if current_choice.id is distinct from (item->>'supersedesAssignmentId')::uuid then perform private.correction_fail('conflict'); end if;
    else
      if current_choice.id is distinct from (item->>'assignmentId')::uuid then perform private.correction_fail('conflict'); end if;
      select applied.* into prior from public.candidate_correction_applications applied
        join public.candidate_correction_assignments assigned on assigned.id=applied.assignment_id
        join public.canonical_resume_versions result on result.id=applied.result_version_id
        where assigned.correction_event_id=(item->>'eventId')::uuid order by result.revision desc limit 1;
      if p_command->>'kind'='reapply' then
        if prior.id is null or prior.id is distinct from (item->>'priorApplicationId')::uuid then perform private.correction_fail('conflict'); end if;
      elsif prior.id is not null or item->'priorApplicationId'<>'null'::jsonb then perform private.correction_fail('conflict'); end if;
      if (p_command->>'kind'='add' and item->>'mappingMode'<>'add')
        or (p_command->>'kind'='apply' and item->>'mappingMode'='add') then perform private.correction_fail('invalid'); end if;
    end if;
  end loop;
end;
$$;

create function private.correction_place(p_body jsonb,p_location jsonb,p_field text,p_fact uuid,p_value text,
  p_section uuid,p_entry uuid,p_bullet uuid) returns jsonb
language plpgsql immutable set search_path='' as $$
declare s jsonb; e jsonb; b jsonb; sections jsonb:='[]'; entries jsonb; bullets jsonb; found_section boolean:=false;
  found_entry boolean:=false; found_bullet boolean:=false; kind text:=p_location->>'kind'; section_type text;
begin
  if kind='contact' then
    if p_field not in ('name','email','phone') or exists(select 1 from jsonb_array_elements(p_body->'facts') where value->>'type'=p_field) then perform private.correction_fail('invalid'); end if;
    return jsonb_set(p_body,'{contactFactIds}',(p_body->'contactFactIds')||jsonb_build_array(p_fact));
  end if;
  if p_field in ('name','email','phone') then perform private.correction_fail('invalid'); end if;
  if kind='new_section_entry' then
    section_type:=p_location->>'newSectionType';
    if (p_field in ('employer','role','dates') and section_type<>'experience') or (p_field='education' and section_type<>'education')
      or (p_field='certification' and section_type<>'certifications') then perform private.correction_fail('invalid'); end if;
    return jsonb_set(p_body,'{sections}',(p_body->'sections')||jsonb_build_array(jsonb_build_object('id',p_section,'type',section_type,
      'title',p_location->>'newSectionTitle','factIds','[]'::jsonb,'entries',jsonb_build_array(jsonb_build_object('id',p_entry,'factIds',jsonb_build_array(p_fact),'bullets','[]'::jsonb)))));
  end if;
  for s in select value from jsonb_array_elements(p_body->'sections') loop
    if s->>'id'=p_location->>'sectionId' then
      found_section:=true; section_type:=s->>'type';
      if (p_field in ('employer','role','dates') and (section_type<>'experience' or kind='section'))
        or (p_field='education' and section_type<>'education') or (p_field='certification' and section_type<>'certifications') then perform private.correction_fail('invalid'); end if;
      if kind='section' then s:=jsonb_set(s,'{factIds}',(s->'factIds')||jsonb_build_array(p_fact));
      elsif kind='new_entry' then
        s:=jsonb_set(s,'{entries}',(s->'entries')||jsonb_build_array(jsonb_build_object('id',p_entry,'factIds',jsonb_build_array(p_fact),'bullets','[]'::jsonb)));
      else
        entries:='[]';
        for e in select value from jsonb_array_elements(s->'entries') loop
          if e->>'id'=p_location->>'entryId' then
            found_entry:=true;
            if kind='entry' then e:=jsonb_set(e,'{factIds}',(e->'factIds')||jsonb_build_array(p_fact));
            elsif kind='bullet' then
              bullets:='[]';
              for b in select value from jsonb_array_elements(e->'bullets') loop
                bullets:=bullets||jsonb_build_array(b);
                if b->>'id'=p_location->>'bulletId' then
                  found_bullet:=true;
                  -- Preserve the selected factual bullet; insert one new singly-
                  -- linked sibling immediately after it, never merge/replace it.
                  bullets:=bullets||jsonb_build_array(jsonb_build_object('id',p_bullet,'text',p_value,'factIds',jsonb_build_array(p_fact)));
                end if;
              end loop;
              e:=jsonb_set(e,'{bullets}',bullets);
            else perform private.correction_fail('invalid'); end if;
          end if;
          entries:=entries||jsonb_build_array(e);
        end loop;
        s:=jsonb_set(s,'{entries}',entries);
      end if;
    end if;
    sections:=sections||jsonb_build_array(s);
  end loop;
  if not found_section or (kind in ('entry','bullet') and not found_entry) or (kind='bullet' and not found_bullet) then perform private.correction_fail('invalid'); end if;
  return jsonb_set(p_body,'{sections}',sections);
end;
$$;

create function private.correction_child_body(p_parent jsonb,p_version uuid,p_item jsonb,p_created text,p_change uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare base public.canonical_resume_versions%rowtype; event public.evidence_corrections%rowtype;
  previous public.candidate_correction_applications%rowtype; previous_choice public.candidate_correction_assignments%rowtype; original public.canonical_resume_versions%rowtype;
  evidence public.document_evidence_attempts%rowtype; assertion jsonb; fact jsonb; body jsonb; sections jsonb:='[]'; entries jsonb; bullets jsonb;
  s jsonb; e jsonb; b jsonb; fact_id uuid; new_fact uuid; count_value integer; changed jsonb; loc jsonb;
begin
  base.content:=p_parent; base.id:=(p_parent->>'versionId')::uuid; base.owner_id:=(p_parent->>'ownerId')::uuid;
  select * into strict event from public.evidence_corrections where id=(p_item->>'eventId')::uuid;
  if p_item->>'mappingMode'='existing' then fact_id:=(p_item->>'factId')::uuid; end if;
  if fact_id is null and p_item->'priorApplicationId'<>'null'::jsonb then
    select * into strict previous from public.candidate_correction_applications where id=(p_item->>'priorApplicationId')::uuid;
    select * into strict original from public.canonical_resume_versions where id=previous.result_version_id;
    select * into strict previous_choice from public.candidate_correction_assignments where id=previous.assignment_id;
    select value into fact from jsonb_array_elements(base.content->'facts') where value->>'id'=previous.result_fact_id::text and value->>'type'=event.field;
    if found and (p_item->>'mappingMode'<>'add' or (private.correction_selector_from_row(previous_choice)->'location')=p_item->'location') then
      fact_id:=previous.result_fact_id;
      if private.correction_location(base.content,fact_id)<>private.correction_location(original.content,fact_id) then perform private.correction_fail('conflict'); end if;
    end if;
  end if;
  if fact_id is null and p_item->>'mappingMode'='existing' then fact_id:=(p_item->>'factId')::uuid; end if;
  if fact_id is null and p_item->>'mappingMode'='imported_assertion' then
    select * into strict evidence from public.document_evidence_attempts where id=event.attempt_id;
    select value into strict assertion from jsonb_array_elements(evidence.envelope->'assertions') where value->>'id'=p_item->>'assertionId' and value->>'field'=event.field;
    select count(*),min((value->>'id')::text)::uuid into count_value,fact_id from jsonb_array_elements(base.content->'facts')
      where value->>'type'=event.field and private.correction_sorted_citations(value->'sources')=private.correction_citations(assertion,event.attempt_id);
    if count_value<>1 then perform private.correction_fail('conflict'); end if;
  end if;
  body:=base.content||jsonb_build_object('versionId',p_version,'parentVersionId',base.id,'createdAt',p_created);
  if fact_id is not null then
    select value into fact from jsonb_array_elements(base.content->'facts') where value->>'id'=fact_id::text and value->>'type'=event.field;
    if not found then perform private.correction_fail('conflict'); end if;
    perform private.correction_assert_fact_placement(base.content,fact_id,event.field);
    changed:=fact||jsonb_build_object('value',event.value,'state','unconfirmed','sources','[]'::jsonb,'confirmation',null);
    body:=jsonb_set(body,'{facts}',(select jsonb_agg(case when value->>'id'=fact_id::text then changed else value end order by ordinality)
      from jsonb_array_elements(base.content->'facts') with ordinality));
    for s in select value from jsonb_array_elements(base.content->'sections') loop
      entries:='[]';
      for e in select value from jsonb_array_elements(s->'entries') loop
        bullets:='[]';
        for b in select value from jsonb_array_elements(e->'bullets') loop
          if b->'factIds'=jsonb_build_array(fact_id) then b:=jsonb_set(b,'{text}',to_jsonb(event.value)); end if;
          bullets:=bullets||jsonb_build_array(b);
        end loop;
        entries:=entries||jsonb_build_array(jsonb_set(e,'{bullets}',bullets));
      end loop;
      sections:=sections||jsonb_build_array(jsonb_set(s,'{entries}',entries));
    end loop;
    body:=jsonb_set(body,'{sections}',sections);
    body:=jsonb_set(body,'{changes}',jsonb_build_array(jsonb_build_object('id',p_change,'actorId',base.owner_id,'action','edit',
      'targetId',fact_id,'priorValue',fact->>'value','createdAt',p_created)));
  else
    if p_item->>'mappingMode'<>'add' then perform private.correction_fail('invalid'); end if;
    new_fact:=gen_random_uuid();
    -- Placement operates on the old facts so contact duplicate checks remain
    -- independent of the one newly appended fact.
    body:=private.correction_place(body,p_item->'location',event.field,new_fact,event.value,gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
    body:=jsonb_set(body,'{facts}',(body->'facts')||jsonb_build_array(jsonb_build_object('id',new_fact,'type',event.field,'value',event.value,
      'state','unconfirmed','sources','[]'::jsonb,'confirmation',null)));
    body:=body||jsonb_build_object('producerVersion','canonical-engine/1.0.2','changes',jsonb_build_array(jsonb_build_object('id',p_change,
      'actorId',base.owner_id,'action','create','targetId',new_fact,'priorValue',null,'createdAt',p_created)));
  end if;
  return body;
end;
$$;

-- Structural producer extension only; add remains private/event-derived and
-- ordinary import/edit/confirm/restore keep their strong delta validators.
do $shape_guard$
begin
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_shape_valid(jsonb)')
    and encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')='fffef6a7a030d0f7370c0c64de126cb5de4e5f1a55d8290b3a864a28bd7b078c') then
    raise exception 'C02_SHAPE_DRIFT' using errcode='23514'; end if;
end;
$shape_guard$;
create or replace function private.canonical_shape_valid(p_body jsonb) returns boolean language sql immutable set search_path = '' as $fn$ select extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"schemaVersion":{"type":"string","const":"canonical-resume/1.0.0"},"producerVersion":{"type":"string","enum":["canonical-engine/1.0.0","canonical-engine/1.0.1","canonical-engine/1.0.2"]},"analysisId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"inputSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"retentionPolicyId":{"type":"string","minLength":1,"maxLength":100},"resumeId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"versionId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"parentVersionId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"ownerId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"organizationId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"locale":{"type":"string","pattern":"^[a-z]{2,3}(?:-[A-Z]{2})?$"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"},"state":{"type":"string","enum":["draft","review_required"]},"sourceEvidenceVersionId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"contactFactIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"facts":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["name","email","phone","employer","role","dates","education","certification","skill","contribution","metric","link","location"]},"value":{"type":"string","minLength":1,"maxLength":2000},"state":{"type":"string","enum":["source_supported","candidate_confirmed","unconfirmed"]},"sources":{"maxItems":20,"type":"array","items":{"type":"object","properties":{"attemptId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"spanId":{"type":"string","minLength":1,"maxLength":100},"start":{"type":"integer","minimum":0,"maximum":200000},"end":{"type":"integer","exclusiveMinimum":0,"maximum":200000}},"required":["attemptId","spanId","start","end"],"additionalProperties":false}},"confirmation":{"anyOf":[{"type":"object","properties":{"actorId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"confirmedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"},"value":{"type":"string","minLength":1,"maxLength":2000}},"required":["actorId","confirmedAt","value"],"additionalProperties":false},{"type":"null"}]}},"required":["id","type","value","state","sources","confirmation"],"additionalProperties":false}},"sections":{"maxItems":30,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["summary","experience","education","skills","certifications","projects","other"]},"title":{"type":"string","minLength":1,"maxLength":100},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"entries":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"bullets":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"text":{"type":"string","minLength":1,"maxLength":2000},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}},"required":["id","text","factIds"],"additionalProperties":false}}},"required":["id","factIds","bullets"],"additionalProperties":false}}},"required":["id","type","title","factIds","entries"],"additionalProperties":false}},"changes":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"actorId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"action":{"type":"string","enum":["create","import","edit","rollback"]},"targetId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"priorValue":{"anyOf":[{"type":"string","minLength":1,"maxLength":2000},{"type":"null"}]},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}},"required":["id","actorId","action","targetId","priorValue","createdAt"],"additionalProperties":false}}},"required":["schemaVersion","producerVersion","analysisId","inputSha256","retentionPolicyId","resumeId","versionId","parentVersionId","ownerId","organizationId","locale","createdAt","state","sourceEvidenceVersionId","contactFactIds","facts","sections","changes"],"additionalProperties":false}$schema$::json,p_body); $fn$;
revoke all on function private.canonical_shape_valid(jsonb) from public,anon,authenticated,service_role;

-- Reuse the existing canonical common identities/citations/reference validator
-- verbatim for add; its import-only branch is inactive, not weakened.
create function private.validate_correction_child(p_body jsonb,p_user_id uuid,p_attempt uuid) returns void
language plpgsql volatile set search_path='' as $$
declare evidence public.document_evidence_attempts%rowtype; op text:='add'; fact jsonb; citation jsonb; span jsonb;
  section jsonb; entry jsonb; bullet jsonb; event jsonb; ref text; object_ids text[]; references_ids text[]:='{}'; content_chars bigint;
begin
  if private.canonical_shape_valid(p_body) is not true or octet_length(p_body::text)>1048576 then perform private.correction_fail('invalid'); end if;
  select * into strict evidence from public.document_evidence_attempts where id=p_attempt and owner_id=p_user_id;
  if p_body->>'ownerId' is distinct from p_user_id::text or p_body->>'analysisId' is distinct from evidence.analysis_id::text
    or p_body->>'inputSha256' is distinct from evidence.input_sha256 or p_body->'retentionPolicyId' is distinct from evidence.envelope->'retentionPolicyId'
    or p_body->>'sourceEvidenceVersionId' is distinct from evidence.id::text then perform private.correction_fail('invalid'); end if;
  object_ids:=array[p_body->>'resumeId',p_body->>'versionId'];
  content_chars:=0;
  for fact in select value from jsonb_array_elements(p_body->'facts') loop
    object_ids:=array_append(object_ids,fact->>'id');
    content_chars:=content_chars+char_length(fact->>'value');
    if fact->>'value'<>btrim(fact->>'value') or fact->>'state'='source_supported' then
      raise exception 'Unsupported canonical fact' using errcode='22023'; end if;
    if (fact->>'state'='candidate_confirmed') is distinct from (fact->'confirmation'<>'null'::jsonb) then
      raise exception 'Confirmation state mismatch' using errcode='22023'; end if;
    if fact->'confirmation'<>'null'::jsonb and (fact->'confirmation'->>'actorId'<>p_user_id::text
      or fact->'confirmation'->>'value'<>fact->>'value') then raise exception 'Invalid confirmation' using errcode='22023'; end if;
    for citation in select value from jsonb_array_elements(fact->'sources') loop
      select value into span from jsonb_array_elements(evidence.envelope->'spans') where value->>'id'=citation->>'spanId';
      if span is null or citation->>'attemptId'<>evidence.id::text or (citation->>'end')::int<=(citation->>'start')::int
        or (citation->>'end')::int>char_length(span->>'text') then raise exception 'Invalid canonical citation' using errcode='22023'; end if;
      -- Source text is exact and Unicode code-point indexed, including OCR.
      if substring(span->>'text' from (citation->>'start')::int+1 for (citation->>'end')::int-(citation->>'start')::int)
        <> fact->>'value' then raise exception 'Fact does not match cited text' using errcode='22023'; end if;
    end loop;
    if op='import' and (fact->>'state'<>'unconfirmed' or jsonb_array_length(fact->'sources')=0) then
      raise exception 'Imports require uncertain sourced facts' using errcode='22023'; end if;
  end loop;
  for ref in select jsonb_array_elements_text(p_body->'contactFactIds') loop
    if not exists(select 1 from jsonb_array_elements(p_body->'facts') where value->>'id'=ref and value->>'type' in ('name','email','phone','link','location')) then
      raise exception 'Invalid contact reference' using errcode='22023'; end if;
  end loop;
  references_ids:=array(select jsonb_array_elements_text(p_body->'contactFactIds'));
  if cardinality(references_ids)<>(select count(distinct x) from unnest(references_ids) x) then
    raise exception 'Duplicate contact references' using errcode='22023'; end if;
  for section in select value from jsonb_array_elements(p_body->'sections') loop
    if jsonb_array_length(section->'factIds')<>(select count(distinct value) from jsonb_array_elements(section->'factIds')) then
      raise exception 'Duplicate section references' using errcode='22023'; end if;
    object_ids:=array_append(object_ids,section->>'id'); content_chars:=content_chars+char_length(section->>'title');
    references_ids:=references_ids||array(select jsonb_array_elements_text(section->'factIds'));
    for entry in select value from jsonb_array_elements(section->'entries') loop
      if jsonb_array_length(entry->'factIds')<>(select count(distinct value) from jsonb_array_elements(entry->'factIds')) then
        raise exception 'Duplicate entry references' using errcode='22023'; end if;
      object_ids:=array_append(object_ids,entry->>'id');
      references_ids:=references_ids||array(select jsonb_array_elements_text(entry->'factIds'));
      for bullet in select value from jsonb_array_elements(entry->'bullets') loop
        object_ids:=array_append(object_ids,bullet->>'id'); content_chars:=content_chars+char_length(bullet->>'text');
        references_ids:=references_ids||array(select jsonb_array_elements_text(bullet->'factIds'));
        if jsonb_array_length(bullet->'factIds')<>1 or not exists(select 1 from jsonb_array_elements(p_body->'facts') f
          where f.value->>'id'=bullet->'factIds'->>0 and f.value->>'value'=bullet->>'text') then
          raise exception 'Draft bullet must reference its exact factual content' using errcode='22023'; end if;
      end loop;
    end loop;
  end loop;
  if jsonb_array_length(p_body->'changes')<>1 then raise exception 'Exactly one append-only event required' using errcode='22023'; end if;
  event:=p_body->'changes'->0; object_ids:=array_append(object_ids,event->>'id');
  if content_chars>200000 or cardinality(object_ids)<>(select count(distinct x) from unnest(object_ids) x)
    or event->>'actorId'<>p_user_id::text or event->>'createdAt'<>p_body->>'createdAt' then raise exception 'Invalid canonical identities or event' using errcode='22023'; end if;
  for ref in select unnest(references_ids) loop
    if not exists(select 1 from jsonb_array_elements(p_body->'facts') where value->>'id'=ref) then raise exception 'Dangling fact reference' using errcode='22023'; end if;
  end loop;
end;
$$;

create function private.save_candidate_authored_fact(p_user_id uuid,p_source_id uuid,p_body jsonb,p_assignment uuid,p_operation uuid,p_request_id text)
returns jsonb language plpgsql volatile set search_path='' as $$
declare base public.canonical_resume_versions%rowtype; choice public.candidate_correction_assignments%rowtype; event public.evidence_corrections%rowtype;
  application public.candidate_correction_applications%rowtype; fact jsonb; change jsonb; expected jsonb; section jsonb; entry jsonb; bullet jsonb;
  new_section uuid; new_entry uuid; new_bullet uuid; new_fact uuid; command jsonb;
begin
  select * into strict choice from public.candidate_correction_assignments where id=p_assignment;
  select * into strict event from public.evidence_corrections where id=choice.correction_event_id;
  select * into strict base from public.canonical_resume_versions where id=(p_body->>'parentVersionId')::uuid
    and owner_id=p_user_id and source_resume_version_id=p_source_id and resume_id=choice.resume_id and organization_id=choice.organization_id;
  perform 1 from public.canonical_resume_heads where resume_id=base.resume_id and version_id=base.id;
  if not found or choice.mapping_mode<>'add' or base.source_evidence_version_id<>choice.attempt_id then perform private.correction_fail('conflict'); end if;
  select * into strict application from public.candidate_correction_applications where result_version_id=(p_body->>'versionId')::uuid
    and assignment_id=choice.id and operation_id=p_operation and base_version_id=base.id;
  new_fact:=application.result_fact_id;
  fact:=jsonb_build_object('id',new_fact,'type',event.field,'value',event.value,'state','unconfirmed','sources','[]'::jsonb,'confirmation',null);
  if p_body->'facts' is distinct from (base.content->'facts')||jsonb_build_array(fact)
    or p_body->>'producerVersion' is distinct from 'canonical-engine/1.0.2'
    or (p_body-array['versionId','parentVersionId','createdAt','producerVersion','facts','sections','contactFactIds','changes'])
      is distinct from (base.content-array['versionId','parentVersionId','createdAt','producerVersion','facts','sections','contactFactIds','changes']) then perform private.correction_fail('invalid'); end if;
  change:=p_body->'changes'->0;
  if change is distinct from jsonb_build_object('id',change->>'id','actorId',p_user_id,'action','create','targetId',new_fact,'priorValue',null,'createdAt',p_body->>'createdAt') then
    perform private.correction_fail('invalid'); end if;
  if choice.location_kind='new_section_entry' then
    section:=p_body->'sections'->(jsonb_array_length(p_body->'sections')-1); new_section:=(section->>'id')::uuid; new_entry:=(section->'entries'->0->>'id')::uuid;
  elsif choice.location_kind='new_entry' then
    select value into strict section from jsonb_array_elements(p_body->'sections') where value->>'id'=choice.section_id::text;
    entry:=section->'entries'->(jsonb_array_length(section->'entries')-1); new_entry:=(entry->>'id')::uuid;
  elsif choice.location_kind='bullet' then
    select b.value into strict bullet from jsonb_array_elements(p_body->'sections') s cross join lateral jsonb_array_elements(s.value->'entries') e
      cross join lateral jsonb_array_elements(e.value->'bullets') b
      where s.value->>'id'=choice.section_id::text and e.value->>'id'=choice.entry_id::text and b.value->'factIds'=jsonb_build_array(new_fact);
    new_bullet:=(bullet->>'id')::uuid;
  end if;
  expected:=private.correction_place(base.content,private.correction_selector_from_row(choice)->'location',event.field,new_fact,event.value,new_section,new_entry,new_bullet);
  if p_body->'sections' is distinct from expected->'sections' or p_body->'contactFactIds' is distinct from expected->'contactFactIds' then perform private.correction_fail('invalid'); end if;
  perform private.validate_correction_child(p_body,p_user_id,choice.attempt_id);
  command:=jsonb_build_object('operation','add','expectedVersionId',base.id,'idempotencyKey',p_body->>'versionId','factId',new_fact,'value',event.value,'targetVersionId',null);
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content,created_at,
    parent_version_id,source_evidence_version_id,revision,idempotency_key,command,request_id)
    values((p_body->>'versionId')::uuid,base.resume_id,p_source_id,base.organization_id,p_user_id,p_body->>'locale',p_body->>'state',p_body,(p_body->>'createdAt')::timestamptz,
      base.id,choice.attempt_id,base.revision+1,(p_body->>'versionId')::uuid,command,p_request_id);
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value,state,sources,confirmation)
    select (p_body->>'versionId')::uuid,(value->>'id')::uuid,base.organization_id,p_user_id,value->>'type',value->>'value',value->>'state',value->'sources',nullif(value->'confirmation','null'::jsonb)
      from jsonb_array_elements(p_body->'facts');
  insert into public.change_events(canonical_version_id,id,owner_id,organization_id,actor_id,operation,event,created_at)
    values((p_body->>'versionId')::uuid,(change->>'id')::uuid,p_user_id,base.organization_id,p_user_id,'add',change,(p_body->>'createdAt')::timestamptz);
  update public.canonical_resume_heads set version_id=(p_body->>'versionId')::uuid,revision=base.revision+1 where resume_id=base.resume_id;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
    values(base.organization_id,p_user_id,'canonical.add','canonical_resume_version',(p_body->>'versionId')::uuid,'success',p_request_id);
  perform private.write_correction_snapshot((p_body->>'versionId')::uuid,command);
  return jsonb_build_object('status','applied','versionId',p_body->>'versionId','revision',base.revision+1,'idempotent',false);
end;
$$;

create function private.correction_insert_operation(p_scope jsonb,p_command jsonb,p_hash text,p_selected uuid[],p_children uuid[],
  p_initial uuid,p_result uuid,p_revision integer,p_assignment_revision bigint,p_request text) returns uuid
language plpgsql volatile set search_path='' as $$
declare operation_id uuid:=gen_random_uuid();
begin
  insert into public.candidate_correction_operations(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256,
    actor_id,kind,idempotency_key,expected_review_revision,expected_assignment_revision,expected_canonical_version_id,target_model_version,
    projection_model_version,admission_policy_version,evidence_schema_version,field_extractor_version,command_codec_version,command_sha256,
    selected_assignment_ids,initial_import_version_id,result_version_id,result_revision,result_assignment_revision,child_version_ids,request_id)
    values(operation_id,(p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'analysisId')::uuid,
      (p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'inputSha256',(p_scope->>'ownerId')::uuid,p_command->>'kind',
      (p_command->>'idempotencyKey')::uuid,(p_command->>'expectedReviewRevision')::bigint,(p_command->>'expectedAssignmentRevision')::bigint,
      (p_command->>'expectedVersionId')::uuid,p_scope->>'targetModelVersion',p_scope->>'projectionModelVersion',p_scope->>'admissionPolicyVersion',
      p_scope->>'evidenceSchemaVersion',p_scope->>'fieldExtractorVersion','c02-command-bytes/1.0.0',p_hash,
      p_selected,p_initial,p_result,p_revision,p_assignment_revision,p_children,p_request);
  return operation_id;
end;
$$;

create function public.assign_candidate_correction_targets(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare scope jsonb; selectors jsonb; item jsonb; location jsonb; command_hash text; replay jsonb;
  ids uuid[]:='{}'; op_id uuid; ordinal integer:=0;
begin
  -- This exception block encloses ALL writes: a failure rolls the whole action
  -- back, never JSON-returning a partially imported/applied transaction.
  perform private.correction_validate_command(p_command,true);
  if p_request_id is null or char_length(p_request_id) not between 1 and 100 then perform private.correction_fail('invalid'); end if;
  scope:=private.correction_scope(p_user_id,p_analysis_id);
  if not private.canonical_correction_write_ready() then perform private.correction_fail('unavailable'); end if;
  selectors:=private.correction_normalize(scope,p_command);
  command_hash:=private.correction_command_sha256(private.correction_atoms(scope,p_command,selectors));
  replay:=private.correction_replay(scope,p_command,selectors,command_hash);
  if replay is not null then return replay; end if;
  perform private.correction_admit_new(scope,p_command,selectors);
  if (scope->>'assignmentRevision')::bigint+jsonb_array_length(selectors)>1000 then perform private.correction_fail('unavailable'); end if;
  select array_agg(gen_random_uuid() order by ordinality) into ids from jsonb_array_elements(selectors) with ordinality;
  op_id:=private.correction_insert_operation(scope,p_command,command_hash,ids,'{}',null,(scope->>'headId')::uuid,(scope->>'headRevision')::integer,
    (scope->>'assignmentRevision')::bigint+cardinality(ids),p_request_id);
  for item in select value from jsonb_array_elements(selectors) loop
    ordinal:=ordinal+1; location:=item->'location';
    insert into public.candidate_correction_assignments(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256,
      operation_id,actor_id,assignment_revision,expected_assignment_revision,correction_event_id,correction_revision,field,event_operation,target_model_version,
      target_kind,assertion_id,opaque_target_id,supersedes_assignment_id,mapping_mode,base_version_id,fact_id,mapping_proof_kind,origin_version_id,origin_fact_id,
      location_kind,section_id,entry_id,bullet_id,new_section_type,new_section_title)
      values(ids[ordinal],p_user_id,(scope->>'organizationId')::uuid,(scope->>'resumeId')::uuid,p_analysis_id,(scope->>'sourceId')::uuid,(scope->>'attemptId')::uuid,
        scope->>'inputSha256',op_id,p_user_id,(scope->>'assignmentRevision')::bigint+ordinal,(scope->>'assignmentRevision')::bigint,
        (item->>'eventId')::uuid,(item->>'eventRevision')::integer,item->>'field','correct',scope->>'targetModelVersion',item->>'targetKind',item->>'assertionId',
        item->>'opaqueTargetId',(item->>'supersedesAssignmentId')::uuid,item->>'mappingMode',(item->>'baseVersionId')::uuid,(item->>'factId')::uuid,
        item->>'mappingProofKind',(item->>'originVersionId')::uuid,(item->>'originFactId')::uuid,location->>'kind',(location->>'sectionId')::uuid,
        (location->>'entryId')::uuid,(location->>'bulletId')::uuid,location->>'newSectionType',location->>'newSectionTitle');
  end loop;
  return private.correction_receipt(op_id,false);
exception
  when insufficient_privilege then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','not_found');
  when sqlstate 'P0C01' or unique_violation then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','conflict');
  when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','invalid');
  when others then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','unavailable');
end;
$$;

create function public.apply_candidate_corrections(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_import_body jsonb,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare scope jsonb; selectors jsonb; item jsonb; body jsonb; parent_body jsonb; plans jsonb:='[]'; replay jsonb; command_hash text;
  selected_ids uuid[]; children uuid[]:='{}'; initial_id uuid; parent_id uuid; final_id uuid; op_id uuid; app_id uuid; result_fact uuid;
  ordinal integer:=0; offset_value integer:=0; total_bytes bigint:=0; revision_value integer; created text; result jsonb; canonical_command jsonb;
begin
  perform private.correction_validate_command(p_command,false);
  if p_request_id is null or char_length(p_request_id) not between 1 and 100 then perform private.correction_fail('invalid'); end if;
  scope:=private.correction_scope(p_user_id,p_analysis_id);
  if not private.canonical_correction_write_ready() then perform private.correction_fail('unavailable'); end if;
  selectors:=private.correction_normalize(scope,p_command);
  command_hash:=private.correction_command_sha256(private.correction_atoms(scope,p_command,selectors));
  replay:=private.correction_replay(scope,p_command,selectors,command_hash);
  if replay is not null then return replay; end if;
  perform private.correction_admit_new(scope,p_command,selectors);
  parent_id:=(scope->>'headId')::uuid; revision_value:=coalesce((scope->>'headRevision')::integer,0);
  if parent_id is null then
    if jsonb_typeof(p_import_body) is distinct from 'object' or private.canonical_shape_valid(p_import_body) is not true
      or p_import_body->'parentVersionId' is distinct from 'null'::jsonb or p_import_body->>'producerVersion' not in ('canonical-engine/1.0.0','canonical-engine/1.0.1')
      or (p_import_body->>'ownerId',p_import_body->>'organizationId',p_import_body->>'resumeId',p_import_body->>'analysisId',p_import_body->>'sourceEvidenceVersionId',p_import_body->>'inputSha256')
        is distinct from (scope->>'ownerId',scope->>'organizationId',scope->>'resumeId',scope->>'analysisId',scope->>'attemptId',scope->>'inputSha256') then perform private.correction_fail('invalid'); end if;
    parent_body:=p_import_body; initial_id:=(p_import_body->>'versionId')::uuid; children:=array[initial_id]; offset_value:=1;
    total_bytes:=octet_length(p_import_body::text); if total_bytes>1048576 then perform private.correction_fail('invalid'); end if;
  else
    if p_import_body is not null and p_import_body<>'null'::jsonb then perform private.correction_fail('invalid'); end if;
    select content into strict parent_body from public.canonical_resume_versions where id=parent_id;
  end if;
  -- Freeze bounded child plans BEFORE any canonical/ledger write. Technical
  -- IDs are allocated only after exact replay and all fresh CAS/target checks.
  for item in select value from jsonb_array_elements(selectors) loop
    final_id:=gen_random_uuid(); created:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    body:=private.correction_child_body(parent_body,final_id,item,created,gen_random_uuid());
    if octet_length(body::text)>1048576 then perform private.correction_fail('invalid'); end if;
    total_bytes:=total_bytes+octet_length(body::text); if total_bytes>8388608 then perform private.correction_fail('unavailable'); end if;
    plans:=plans||jsonb_build_array(body); children:=array_append(children,final_id); parent_body:=body;
  end loop;
  select array_agg((value->>'assignmentId')::uuid order by ordinality) into selected_ids from jsonb_array_elements(selectors) with ordinality;
  op_id:=private.correction_insert_operation(scope,p_command,command_hash,selected_ids,children,initial_id,final_id,
    revision_value+cardinality(children),(scope->>'assignmentRevision')::bigint,p_request_id);
  if initial_id is not null then
    canonical_command:=jsonb_build_object('operation','import','expectedVersionId',null,'idempotencyKey',initial_id,'factId',null,'value',null,'targetVersionId',null);
    result:=public.save_canonical_version(p_user_id,(scope->>'sourceId')::uuid,p_import_body,canonical_command,p_request_id);
    if result->>'status' is distinct from 'applied' or result->'idempotent' is distinct from 'false'::jsonb or result->>'versionId' is distinct from initial_id::text then perform private.correction_fail('conflict'); end if;
    parent_id:=initial_id;
  end if;
  for item in select value from jsonb_array_elements(selectors) loop
    body:=plans->ordinal; ordinal:=ordinal+1;
    result_fact:=(body->'changes'->0->>'targetId')::uuid; app_id:=gen_random_uuid();
    insert into public.candidate_correction_applications(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,attempt_id,input_sha256,
      operation_id,assignment_id,actor_id,step_ordinal,base_version_id,result_version_id,result_fact_id,supersedes_application_id)
      values(app_id,p_user_id,(scope->>'organizationId')::uuid,(scope->>'resumeId')::uuid,p_analysis_id,(scope->>'sourceId')::uuid,(scope->>'attemptId')::uuid,
        scope->>'inputSha256',op_id,(item->>'assignmentId')::uuid,p_user_id,ordinal,parent_id,(body->>'versionId')::uuid,result_fact,(item->>'priorApplicationId')::uuid);
    if body->'changes'->0->>'action'='create' then
      result:=private.save_candidate_authored_fact(p_user_id,(scope->>'sourceId')::uuid,body,(item->>'assignmentId')::uuid,op_id,p_request_id);
    else
      canonical_command:=jsonb_build_object('operation','edit','expectedVersionId',parent_id,'idempotencyKey',body->>'versionId','factId',result_fact,
        'value',(select value->>'value' from jsonb_array_elements(body->'facts') where value->>'id'=result_fact::text),'targetVersionId',null);
      result:=public.save_canonical_version(p_user_id,(scope->>'sourceId')::uuid,body,canonical_command,p_request_id);
    end if;
    if result->>'status' is distinct from 'applied' or result->'idempotent' is distinct from 'false'::jsonb or result->>'versionId' is distinct from body->>'versionId' then perform private.correction_fail('conflict'); end if;
    parent_id:=(body->>'versionId')::uuid;
  end loop;
  return private.correction_receipt(op_id,false);
exception
  when insufficient_privilege then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','not_found');
  when sqlstate 'P0C01' or unique_violation then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','conflict');
  when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','invalid');
  when others then return jsonb_build_object('schemaVersion','candidate-correction-result/1.0.0','status','unavailable');
end;
$$;

create function public.read_candidate_correction_ledger(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare scope jsonb; result jsonb; table_name text; count_value bigint;
begin
  scope:=private.correction_scope(p_user_id,p_analysis_id);
  if (select count(*) from public.candidate_correction_operations where analysis_id=p_analysis_id)>1000
    or (select count(*) from public.candidate_correction_applications where analysis_id=p_analysis_id)>1000
    or (select count(*) from public.canonical_correction_snapshots where resume_id=(scope->>'resumeId')::uuid and source_resume_version_id=(scope->>'sourceId')::uuid)>1000
    or (select count(*) from public.canonical_correction_snapshot_facts f join public.canonical_correction_snapshots s on s.canonical_version_id=f.canonical_version_id
      where s.resume_id=(scope->>'resumeId')::uuid and s.source_resume_version_id=(scope->>'sourceId')::uuid)>20000 then perform private.correction_fail('unavailable'); end if;
  select jsonb_build_object('schemaVersion','candidate-correction-ledger/1.0.0','status','ready','writeReady',private.canonical_correction_write_ready(),
    'scoringEligible',false,'binding',scope-array['headId','headRevision','headAttemptId','reviewRevision','assignmentRevision'],
    'reviewRevision',scope->'reviewRevision','assignmentRevision',scope->'assignmentRevision','headId',scope->'headId',
    'operations',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at,o.id) from public.candidate_correction_operations o where o.analysis_id=p_analysis_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.assignment_revision) from public.candidate_correction_assignments a where a.analysis_id=p_analysis_id),'[]'::jsonb),
    'applications',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.candidate_correction_applications a where a.analysis_id=p_analysis_id),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.canonical_version_id) from public.canonical_correction_snapshots s
      where s.resume_id=(scope->>'resumeId')::uuid and s.source_resume_version_id=(scope->>'sourceId')::uuid),'[]'::jsonb),
    'snapshotFacts',coalesce((select jsonb_agg(to_jsonb(f) order by f.canonical_version_id,f.fact_id) from public.canonical_correction_snapshot_facts f
      join public.canonical_correction_snapshots s on s.canonical_version_id=f.canonical_version_id
      where s.resume_id=(scope->>'resumeId')::uuid and s.source_resume_version_id=(scope->>'sourceId')::uuid),'[]'::jsonb)) into result;
  if octet_length(result::text)>8388608 then perform private.correction_fail('unavailable'); end if;
  return result;
exception when insufficient_privilege then return jsonb_build_object('schemaVersion','candidate-correction-ledger/1.0.0','status','not_found');
  when others then return jsonb_build_object('schemaVersion','candidate-correction-ledger/1.0.0','status','unavailable');
end;
$$;

-- Extend only the exact known change-event operation check. A same-relation
-- parsed-expression probe prevents replacing a stronger/drifted constraint.
do $add_check$
declare old_check pg_catalog.pg_constraint%rowtype; probe pg_catalog.pg_constraint%rowtype;
begin
  if exists(select 1 from pg_catalog.pg_constraint where conrelid='public.change_events'::regclass and conname='c02_add_operation_probe') then
    raise exception 'C02_CHANGE_CHECK_DRIFT' using errcode='23514'; end if;
  select * into strict old_check from pg_catalog.pg_constraint where conrelid='public.change_events'::regclass and conname='change_events_operation_check';
  alter table public.change_events add constraint c02_add_operation_probe check(operation in ('import','edit','confirm','rollback','rename_section')) not valid;
  select * into strict probe from pg_catalog.pg_constraint where conrelid='public.change_events'::regclass and conname='c02_add_operation_probe';
  if old_check.contype<>'c' or not old_check.convalidated or old_check.connoinherit is distinct from probe.connoinherit
    or pg_get_expr(old_check.conbin,old_check.conrelid) is distinct from pg_get_expr(probe.conbin,probe.conrelid) then
    raise exception 'C02_CHANGE_CHECK_DRIFT' using errcode='23514'; end if;
  alter table public.change_events drop constraint c02_add_operation_probe;
  alter table public.change_events drop constraint change_events_operation_check;
  alter table public.change_events add constraint change_events_operation_check check(operation in ('import','edit','confirm','rollback','rename_section','add'));
end;
$add_check$;

-- Current R19 body predecessors, never historical pre-barrier overwrites.
-- Both producers take the candidate mutex BEFORE their own/nested row locks.
do $producer_patch$
declare manifest jsonb:=$manifest$[
  {
    "signature": "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "a56b7990a63eb3ac922d387f498e823ead13efca093758a11d8cdcf3f9a07b6d",
    "newSha256": "efa13971568aace742c6aa98fe823a5ea1b4b2cd3c81c0882de2cb102db10521",
    "patches": [
      {
        "old": "begin\n  if p_body",
        "new": "begin\n  if p_user_id is null then return jsonb_build_object('status','not_found'); end if;\n  perform private.lock_candidate_owners(array[p_user_id]);\n  if not private.try_candidate_privacy_write(p_user_id) then return jsonb_build_object('status','not_found'); end if;\n  if p_body"
      },
      {
        "old": "  return jsonb_build_object('status','applied','versionId',p_body->>'versionId','revision',revision_value,'idempotent',false);",
        "new": "  perform private.write_correction_snapshot((p_body->>'versionId')::uuid,p_command);\n  return jsonb_build_object('status','applied','versionId',p_body->>'versionId','revision',revision_value,'idempotent',false);"
      }
    ]
  },
  {
    "signature": "public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "fb668f334fb37f7ced3882d11a977ed33f5a70bf160c4d71795538f2e19adea7",
    "newSha256": "b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2",
    "patches": [
      {
        "old": "begin\n  if p_command",
        "new": "begin\n  if p_user_id is null then return jsonb_build_object('status','not_found'); end if;\n  perform private.lock_candidate_owners(array[p_user_id]);\n  if not private.try_candidate_privacy_write(p_user_id) then return jsonb_build_object('status','not_found'); end if;\n  if p_command"
      }
    ]
  }
]$manifest$::jsonb;
  item jsonb; change jsonb; body text; next_body text; definition text; prepared text[]:='{}'; statement text; routine pg_catalog.pg_proc%rowtype;
begin
  for item in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or not routine.prosecdef or routine.provolatile<>'v' or cardinality(routine.proconfig) is distinct from 1
      or not exists(select 1 from pg_options_to_table(routine.proconfig) where option_name='search_path' and option_value in ('','""'))
      or not has_function_privilege('service_role',routine.oid,'EXECUTE') or has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>item->>'sha256' then
      raise exception 'C02_PRODUCER_DRIFT' using errcode='23514'; end if;
    body:=routine.prosrc; next_body:=body;
    for change in select value from jsonb_array_elements(item->'patches') loop
      if (length(next_body)-length(replace(next_body,change->>'old','')))/length(change->>'old')<>1 then raise exception 'C02_PRODUCER_DRIFT' using errcode='23514'; end if;
      next_body:=replace(next_body,change->>'old',change->>'new');
    end loop;
    if encode(extensions.digest(convert_to(next_body,'UTF8'),'sha256'),'hex')<>item->>'newSha256' then raise exception 'C02_PRODUCER_DRIFT' using errcode='23514'; end if;
    definition:=pg_get_functiondef(routine.oid);
    if (length(definition)-length(replace(definition,body,'')))/length(body)<>1 then raise exception 'C02_PRODUCER_DRIFT' using errcode='23514'; end if;
    prepared:=array_append(prepared,replace(definition,body,next_body));
  end loop;
  foreach statement in array prepared loop execute statement; end loop;
end;
$producer_patch$;

-- No broad/core grant cutover here. New internals and authority RPCs only.
revoke all on function private.canonical_shape_valid(jsonb),
  private.correction_admit_new(jsonb,jsonb,jsonb),
  private.correction_assert_fact_placement(jsonb,uuid,text),
  private.correction_atoms(jsonb,jsonb,jsonb),
  private.correction_child_body(jsonb,uuid,jsonb,text,uuid),
  private.correction_citations(jsonb,uuid),
  private.correction_fail(text),
  private.correction_insert_operation(jsonb,jsonb,text,uuid[],uuid[],uuid,uuid,integer,bigint,text),
  private.correction_latest(jsonb,jsonb,jsonb),
  private.correction_location(jsonb,uuid),
  private.correction_normalize(jsonb,jsonb),
  private.correction_place(jsonb,jsonb,text,uuid,text,uuid,uuid,uuid),
  private.correction_receipt(uuid,boolean),
  private.correction_replay(jsonb,jsonb,jsonb,text),
  private.correction_scope(uuid,uuid),
  private.correction_selector_from_row(public.candidate_correction_assignments,uuid),
  private.correction_sorted_citations(jsonb),
  private.correction_uuid(jsonb,boolean),
  private.correction_validate_command(jsonb,boolean),
  private.save_candidate_authored_fact(uuid,uuid,jsonb,uuid,uuid,text),
  private.validate_correction_child(jsonb,uuid,uuid),
  private.write_correction_snapshot(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_candidate_correction_ledger(uuid,uuid),public.assign_candidate_correction_targets(uuid,uuid,jsonb,text),
  public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.read_candidate_correction_ledger(uuid,uuid),public.assign_candidate_correction_targets(uuid,uuid,jsonb,text),
  public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text) to service_role;

-- A real bounded canonical-producer capability, not an activation switch.
-- The old deployed direct-DML caller keeps its grants until reviewed cutover;
-- those grants make this false and safely withhold new correction writes.
create function private.canonical_correction_write_ready() returns boolean
language plpgsql stable set search_path='' as $$
declare target record; routine pg_catalog.pg_proc%rowtype; role_name text; relation_oid oid;
begin
  for target in select * from (values
    ('private.correction_assert_fact_placement(jsonb,uuid,text)','dc457354f50cf9abe54f8e412338502f10d7c68275effaebf2b0d03ff68369fb',false,'i','void'::regtype),
    ('private.candidate_owner_lock_keys(uuid[])','71a245029186c9f601dd9730d5ac894a32b91431be0065538ff57f0c949b7c85',false,'i','bigint[]'::regtype),
    ('private.candidate_write_blocked(uuid)','e94533690339986bb0e0889ec2f98de0687c6061e80b490a7040e5c40cadd53b',true,'v','boolean'::regtype),
    ('private.canonical_shape_valid(jsonb)','c90713766245857144ee9ee291684f625eeb297deb5fa317cc92b207ea54794f',false,'i','boolean'::regtype),
    ('private.correction_admit_new(jsonb,jsonb,jsonb)','33ff0b2956f8dc84cf72a71fde1553c446d2aa1d6b887fb982326ac6393f0370',false,'v','void'::regtype),
    ('private.correction_atoms(jsonb,jsonb,jsonb)','c361ebe4f11baa3069999145b2b8da5be0f4afaca8ce1b038099e33e951c14dc',false,'i','text[]'::regtype),
    ('private.correction_child_body(jsonb,uuid,jsonb,text,uuid)','2315b0eb5aabd09ce9003268abd528dc7eb5886c5c537ed9f91eff0698a44390',false,'v','jsonb'::regtype),
    ('private.correction_citations(jsonb,uuid)','7c49ed406cc85a8395c0953b2a220f86173199e2f7448c01758a8df0ef0f710c',false,'i','jsonb'::regtype),
    ('private.correction_command_bytes(text[])','afb4eca3cf9ebd31bf49f5ccbb62f859056c34b177b9ae4fca69dae52a47b797',false,'i','bytea'::regtype),
    ('private.correction_command_sha256(text[])','5571e9221b6738c50923c32813fc8b5f2f74306129227dab0ccb9849b66ffe67',false,'i','text'::regtype),
    ('private.correction_fail(text)','5830ddc09c3ab01037c99910e32b7d2af71eaad41d5c0f8a8ec34e89638ac1d7',false,'i','void'::regtype),
    ('private.correction_insert_operation(jsonb,jsonb,text,uuid[],uuid[],uuid,uuid,integer,bigint,text)','bc071ad288642b50a116724ad3230864effea2fb944b637dfcd094bc07aa0d35',false,'v','uuid'::regtype),
    ('private.correction_latest(jsonb,jsonb,jsonb)','dce9e9295ec122146bc836a8ffa9c243804727da95465bf90a253ae58859267e',false,'v','boolean'::regtype),
    ('private.correction_location(jsonb,uuid)','1f8e4da690698cdef6d5b9949a5f78d10b72217bd9a87eb2d1cf0703dd98093a',false,'i','jsonb'::regtype),
    ('private.correction_normalize(jsonb,jsonb)','dd0dc4ad2ea4e8e56ee633cd395d6caf182015d37f8906f66cbd5ccc8e095764',false,'v','jsonb'::regtype),
    ('private.correction_place(jsonb,jsonb,text,uuid,text,uuid,uuid,uuid)','6da429e9875880782057342788c472697e145ad0ceca12324349b1a5f3ca90cd',false,'i','jsonb'::regtype),
    ('private.correction_receipt(uuid,boolean)','1d58cb7258edb1a265cbb69507195b7ee1ab6d8e649be22e5559edf1378fe5ea',false,'v','jsonb'::regtype),
    ('private.correction_replay(jsonb,jsonb,jsonb,text)','e5b954bc4ab638d132f6eb2018454b0aa7ab0e3dfb7e5a9f0a9762872a7c92f5',false,'v','jsonb'::regtype),
    ('private.correction_scope(uuid,uuid)','65a240608b318de05941e03f33af8f8e9aa5f64ab2a5bdf0b41a1dbca1857048',false,'v','jsonb'::regtype),
    ('private.correction_selector_from_row(public.candidate_correction_assignments,uuid)','ec1be8a462926ed22ae4bb58b4a34fef76d919a5a0c7286df4d19788e75d86cc',false,'i','jsonb'::regtype),
    ('private.correction_sorted_citations(jsonb)','b95b7924f4943f09d7976fc943289ed648572dab7c139fd053be5883a963b465',false,'i','jsonb'::regtype),
    ('private.correction_uuid(jsonb,boolean)','602919fd3c33bfe75d0999b29879f3dc04a0215e82e92c53c87c9789c4c6c454',false,'i','boolean'::regtype),
    ('private.correction_validate_command(jsonb,boolean)','164e99251599c9520c8eb314c2371600bf5b94a87eca6c641c9b5b2789c42afe',false,'i','void'::regtype),
    ('private.evidence_integer(jsonb,bigint,bigint)','6c4e10bfbef2d70d4a40b9c2346962b5ad5dac1415574b7b33707115d234e765',false,'i','boolean'::regtype),
    ('private.evidence_keys(jsonb,text[])','824082145b4e705dfdf1d1be622b7fe4f6959c2fcaec5c69bb28ca0a930e5168',false,'i','boolean'::regtype),
    ('private.lock_candidate_owners(uuid[])','f456097e005450c5cac7c2a601fc6641681bc4afdff1fab0abe649cd4562bd4a',false,'v','void'::regtype),
    ('private.save_candidate_authored_fact(uuid,uuid,jsonb,uuid,uuid,text)','a3d2c3b21e117277bb65da29976400a5130badb2c523bd7f2082ff8a6687ea27',false,'v','jsonb'::regtype),
    ('private.try_candidate_privacy_write(uuid)','89e7eec219295b7c834c284012ba7144049380935273e1505a994d38efc4156d',true,'v','boolean'::regtype),
    ('private.validate_correction_child(jsonb,uuid,uuid)','92385c2299fb20d4b339805e2cdc4a95c824afad444a4924a61acb2a6e20aecc',false,'v','void'::regtype),
    ('private.write_correction_snapshot(uuid,jsonb)','7843a1b6e2ba875c27df1ca67a028e05b6070ca1802cc006f07cb81d7c3a7a22',false,'v','void'::regtype),
    ('public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)','b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2',true,'v','jsonb'::regtype),
    ('public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text)','b562db15226cfcf5818e1e23dda0ea38282b0f54df46607172d249e063834292',true,'v','jsonb'::regtype),
    ('public.assign_candidate_correction_targets(uuid,uuid,jsonb,text)','0c8788e948b9481df2ae5a3593a5e7aba044467103f4e13c4cf7959eafb54e34',true,'v','jsonb'::regtype),
    ('public.read_candidate_correction_ledger(uuid,uuid)','b380edcf9d0fb9c743ee957e00946ed05049d5b5e6345f68cd1981c1563744b8',true,'v','jsonb'::regtype),
    ('public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)','efa13971568aace742c6aa98fe823a5ea1b4b2cd3c81c0882de2cb102db10521',true,'v','jsonb'::regtype)
  ) t(signature,sha256,definer,volatility,result_type) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if not found or routine.prokind<>'f' or routine.proretset or routine.prorettype<>target.result_type
      or routine.prosecdef is distinct from target.definer or routine.provolatile<>target.volatility
      or cardinality(routine.proconfig) is distinct from 1
      or not exists(select 1 from pg_options_to_table(routine.proconfig) where option_name='search_path' and option_value in ('','""'))
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>target.sha256 then return false; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from
        (role_name='service_role' and target.signature like 'public.%') then return false; end if;
    end loop;
  end loop;
  for target in select * from (values
    ('public.canonical_resume_versions'),('public.resume_facts'),('public.canonical_resume_heads'),('public.change_events'),('public.authoring_events'),
    ('public.candidate_correction_operations'),('public.candidate_correction_assignments'),('public.candidate_correction_applications'),
    ('public.canonical_correction_snapshots'),('public.canonical_correction_snapshot_facts')
  ) t(table_name) loop
    relation_oid:=to_regclass(target.table_name);
    if not exists(select 1 from pg_catalog.pg_class where oid=relation_oid and relrowsecurity) then return false; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,relation_oid,'INSERT,UPDATE,DELETE,TRUNCATE')
        or has_any_column_privilege(role_name,relation_oid,'INSERT,UPDATE') then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.canonical_correction_write_ready() from public,anon,authenticated,service_role;
commit;
