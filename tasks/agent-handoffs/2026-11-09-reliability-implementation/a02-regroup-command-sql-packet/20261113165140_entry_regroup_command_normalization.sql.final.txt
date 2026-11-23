-- SOURCE PREPARATION ONLY: UNPARSED / UNAPPLIED / UNEXECUTED.
-- No caller, authorization, stored replay, fresh CAS, writer or producer adoption.
begin;
create function private.entry_regroup_original_base(p_scope jsonb,p_base jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare v public.canonical_resume_versions%rowtype; checked public.canonical_resume_versions%rowtype; evidence public.document_evidence_attempts%rowtype;
  k text; fact jsonb; section jsonb; entry jsonb; bullet jsonb; change jsonb; citation jsonb; observation jsonb; facts jsonb; ids text[]; targets text[];
  adapter jsonb; idx jsonb; quote_index jsonb:='{}'; signature text; depth integer:=0; visited uuid[]:='{}'; previous_revision integer;
  total_facts bigint:=0; total_refs bigint:=0; total_text bigint:=0; doc_text bigint;
  layers jsonb[]:='{}'; origin_json jsonb; prior_json jsonb; layer integer; matches bigint;
begin
  if private.grouped_import_keys(p_scope,array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId','inputSha256']) is not true
    or private.grouped_import_keys(p_base,array['versionId','revision','contentSha256','locale']) is not true then perform private.correction_fail('invalid'); end if;
  foreach k in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId'] loop
    if private.grouped_import_uuid(p_scope->k) is not true then perform private.correction_fail('invalid'); end if;
  end loop;
  if private.grouped_import_uuid(p_base->'versionId') is not true or private.evidence_integer(p_base->'revision',1,2147483646) is not true
    or jsonb_typeof(p_scope->'inputSha256') is distinct from 'string' or (p_scope->>'inputSha256') collate "C" !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_base->'contentSha256') is distinct from 'string' or (p_base->>'contentSha256') collate "C" !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_base->'locale') is distinct from 'string' or (p_base->>'locale') collate "C" !~ '^[a-z]{2,3}(?:-[A-Z]{2})?$' then perform private.correction_fail('invalid'); end if;
  select * into v from public.canonical_resume_versions where id=(p_base->>'versionId')::uuid;
  if not found or v.revision<>(p_base->>'revision')::numeric::integer or v.locale is distinct from p_base->>'locale'
    or encode(extensions.digest(convert_to(v.content::text,'UTF8'),'sha256'),'hex') is distinct from p_base->>'contentSha256' then perform private.correction_fail('invalid'); end if;
  select * into evidence from public.document_evidence_attempts where id=(p_scope->>'attemptId')::uuid
    and (owner_id,organization_id,analysis_id,resume_version_id,input_sha256)=
      ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'analysisId')::uuid,(p_scope->>'sourceId')::uuid,p_scope->>'inputSha256');
  if not found then perform private.correction_fail('invalid'); end if;
  adapter:=p_scope||jsonb_build_object('evidenceSchemaVersion','evidence/2.0.0','fieldExtractorVersion','evidence-fields/1.0.1',
    'targetModelVersion','evidence-targets/1.0.0','associationModelVersion','evidence-entry-associations/1.0.0','producerVersion','canonical-engine/1.0.3',
    'admissionPolicyVersion','grouped-original-admission/1.0.0','structuralTextProfileVersion','a02-structural-text/1.0.0',
    'correctionProjectionModelVersion','canonical-corrections/1.0.1','correctionAdmissionPolicyVersion','candidate-correction-admission/1.0.0','effectiveLocale',v.locale);
  idx:=private.grouped_import_source_index(evidence.envelope,adapter);
  for observation in select value from jsonb_each(idx->'observations') loop
    select jsonb_agg(jsonb_build_array(c.value->>'attemptId',c.value->>'spanId',(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)
      order by convert_to(c.value->>'attemptId','UTF8'),convert_to(c.value->>'spanId','UTF8'),(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)::text
      into signature from jsonb_array_elements(observation->'citations') c(value);
    signature:=jsonb_build_array(observation->>'field',signature::jsonb)::text;
    quote_index:=quote_index||jsonb_build_object(signature,coalesce(quote_index->signature,'[]'::jsonb)||jsonb_build_array(observation->'value'));
  end loop;
  checked:=v;
  loop
    if checked.id=any(visited) or (checked.owner_id,checked.organization_id,checked.resume_id,checked.source_resume_version_id,checked.source_evidence_version_id)
      is distinct from ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid)
      or checked.content->>'producerVersion' not in ('canonical-engine/1.0.0','canonical-engine/1.0.1','canonical-engine/1.0.2','canonical-engine/1.0.3')
      or private.canonical_shape_valid(case when checked.content->>'producerVersion'='canonical-engine/1.0.3'
        then jsonb_set(checked.content,'{producerVersion}','"canonical-engine/1.0.1"'::jsonb) else checked.content end) is not true
      or octet_length(checked.content::text)>1048576 or private.grouped_import_utf16_length(checked.content->>'retentionPolicyId')>100
      or checked.content->'parentVersionId' is distinct from coalesce(to_jsonb(checked.parent_version_id),'null'::jsonb)
      or (checked.content->>'versionId',checked.content->>'ownerId',checked.content->>'organizationId',checked.content->>'resumeId',checked.content->>'analysisId',
          checked.content->>'sourceEvidenceVersionId',checked.content->>'inputSha256',checked.content->>'locale',checked.content->>'state')
        is distinct from (checked.id::text,p_scope->>'ownerId',p_scope->>'organizationId',p_scope->>'resumeId',p_scope->>'analysisId',p_scope->>'attemptId',p_scope->>'inputSha256',checked.locale,checked.state) then perform private.correction_fail('invalid'); end if;
    visited:=array_append(visited,checked.id);
    if checked.parent_version_id=any(visited) then perform private.correction_fail('invalid'); end if;
    total_facts:=total_facts+jsonb_array_length(checked.content->'facts');
    if total_facts>20000 then perform private.correction_fail('invalid'); end if;
    -- Existing metadata proof checks an actual .3 origin; shape adaptation alone grants nothing.
    perform private.entry_association_validate_head(checked.id);
    if (select count(*) from public.resume_facts where canonical_version_id=checked.id)<>jsonb_array_length(checked.content->'facts')
      or exists(select 1 from jsonb_array_elements(checked.content->'facts') j(value)
        left join public.resume_facts f on f.canonical_version_id=checked.id and f.id=(j.value->>'id')::uuid
        where f.id is null or (f.owner_id,f.organization_id) is distinct from (checked.owner_id,checked.organization_id)
          or jsonb_build_object('id',f.id,'type',f.type,'value',f.value,'state',f.state,'sources',f.sources,'confirmation',f.confirmation) is distinct from j.value) then perform private.correction_fail('invalid'); end if;
    facts:='{}'; ids:=array[checked.resume_id::text,checked.id::text]; doc_text:=0;
    for fact in select value from jsonb_array_elements(checked.content->'facts') loop
      ids:=array_append(ids,fact->>'id'); facts:=facts||jsonb_build_object(fact->>'id',fact);
      doc_text:=doc_text+private.grouped_import_utf16_length(fact->>'value'); total_refs:=total_refs+jsonb_array_length(fact->'sources');
      if private.grouped_import_utf16_length(fact->>'value')>2000 or fact->>'value' is distinct from private.grouped_import_trim(fact->>'value')
        or (fact->>'state'='source_supported' and jsonb_array_length(fact->'sources')=0)
        or (fact->>'state'='candidate_confirmed') is distinct from (fact->'confirmation'<>'null'::jsonb)
        or (fact->'confirmation'<>'null'::jsonb and ((fact->'confirmation'->>'actorId',fact->'confirmation'->>'value') is distinct from (checked.owner_id::text,fact->>'value')
          or private.grouped_import_utf16_length(fact->'confirmation'->>'value')>2000)) then perform private.correction_fail('invalid'); end if;
      for citation in select value from jsonb_array_elements(fact->'sources') loop
        if citation->>'attemptId' is distinct from checked.source_evidence_version_id::text
          or private.grouped_import_utf16_length(citation->>'spanId')>100
          or private.evidence_integer(citation->'start',0,200000) is not true or private.evidence_integer(citation->'end',1,200000) is not true
          or (citation->>'end')::numeric::integer<=(citation->>'start')::numeric::integer then perform private.correction_fail('invalid'); end if;
      end loop;
      if fact->>'type' in ('name','email','phone','employer','role','dates','education','certification') and jsonb_array_length(fact->'sources')>0 then
        select jsonb_agg(jsonb_build_array(c.value->>'attemptId',c.value->>'spanId',(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)
          order by convert_to(c.value->>'attemptId','UTF8'),convert_to(c.value->>'spanId','UTF8'),(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)::text
          into signature from jsonb_array_elements(fact->'sources') c(value);
        signature:=jsonb_build_array(fact->>'type',signature::jsonb)::text;
        if quote_index ? signature and not exists(select 1 from jsonb_array_elements(quote_index->signature) q(value) where q.value=fact->'value') then perform private.correction_fail('invalid'); end if;
      end if;
    end loop;
    perform private.grouped_import_check_refs(checked.content->'contactFactIds',facts); total_refs:=total_refs+jsonb_array_length(checked.content->'contactFactIds');
    if exists(select 1 from jsonb_array_elements_text(checked.content->'contactFactIds') r(id) where facts->r.id->>'type' not in ('name','email','phone','link','location')) then perform private.correction_fail('invalid'); end if;
    for section in select value from jsonb_array_elements(checked.content->'sections') loop
      ids:=array_append(ids,section->>'id'); perform private.grouped_import_check_refs(section->'factIds',facts); total_refs:=total_refs+jsonb_array_length(section->'factIds');
      doc_text:=doc_text+private.grouped_import_utf16_length(section->>'title');
      if private.grouped_import_utf16_length(private.grouped_import_trim(section->>'title')) not between 1 and 100 then perform private.correction_fail('invalid'); end if;
      for entry in select value from jsonb_array_elements(section->'entries') loop
        ids:=array_append(ids,entry->>'id'); perform private.grouped_import_check_refs(entry->'factIds',facts); total_refs:=total_refs+jsonb_array_length(entry->'factIds');
        for bullet in select value from jsonb_array_elements(entry->'bullets') loop
          ids:=array_append(ids,bullet->>'id'); perform private.grouped_import_check_refs(bullet->'factIds',facts); total_refs:=total_refs+jsonb_array_length(bullet->'factIds');
          doc_text:=doc_text+private.grouped_import_utf16_length(bullet->>'text');
          if private.grouped_import_utf16_length(bullet->>'text')>2000 or bullet->>'text' is distinct from private.grouped_import_trim(bullet->>'text') then perform private.correction_fail('invalid'); end if;
        end loop;
      end loop;
    end loop;
    targets:=ids; total_text:=total_text+doc_text;
    for change in select value from jsonb_array_elements(checked.content->'changes') loop
      ids:=array_append(ids,change->>'id');
      if change->>'actorId' is distinct from checked.owner_id::text or not (change->>'targetId'=any(targets)) then perform private.correction_fail('invalid'); end if;
      if change->'priorValue'<>'null'::jsonb then
        total_text:=total_text+private.grouped_import_utf16_length(change->>'priorValue');
        if private.grouped_import_utf16_length(change->>'priorValue')>2000 or change->>'priorValue' is distinct from private.grouped_import_trim(change->>'priorValue') then perform private.correction_fail('invalid'); end if;
      end if;
    end loop;
    if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or doc_text>200000 or total_text>2000000 or total_refs>20000 then perform private.correction_fail('invalid'); end if;
    layers:=array_append(layers,facts);
    -- A bounded suffix may stop before its root, exactly as the Node projection permits.
    if checked.parent_version_id is null or depth=64 then exit; end if;
    previous_revision:=checked.revision;
    select * into checked from public.canonical_resume_versions where id=checked.parent_version_id;
    if not found or checked.revision<>previous_revision-1 then perform private.correction_fail('invalid'); end if;
    depth:=depth+1;
  end loop;
  -- Match the existing source-choice reader's additional reference budget, including unselected choices.
  for fact in select value from jsonb_array_elements(v.content->'facts') loop
    if fact->>'type' not in ('name','email','phone','employer','role','dates','education','certification') then continue; end if;
    origin_json:=fact;
    if jsonb_array_length(fact->'sources')=0 then
      origin_json:=null;
      for layer in 2..array_length(layers,1) loop
        prior_json:=layers[layer]->(fact->>'id');
        if prior_json is null or prior_json->>'type' is distinct from fact->>'type' then exit; end if;
        if jsonb_array_length(prior_json->'sources')>0 then origin_json:=prior_json; exit; end if;
      end loop;
    end if;
    if origin_json is null then continue; end if;
    select jsonb_agg(jsonb_build_array(c.value->>'attemptId',c.value->>'spanId',(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)
      order by convert_to(c.value->>'attemptId','UTF8'),convert_to(c.value->>'spanId','UTF8'),(c.value->>'start')::numeric::integer,(c.value->>'end')::numeric::integer)::text
      into signature from jsonb_array_elements(origin_json->'sources') c(value);
    signature:=jsonb_build_array(origin_json->>'type',signature::jsonb)::text;
    select count(*) into matches from jsonb_array_elements(coalesce(quote_index->signature,'[]'::jsonb)) q(value) where q.value=origin_json->'value';
    total_refs:=total_refs+matches*(1+jsonb_array_length(private.correction_location(v.content,(fact->>'id')::uuid)));
    if total_refs>20000 then perform private.correction_fail('invalid'); end if;
  end loop;
  return jsonb_build_object('versionId',v.id,'revision',v.revision,'contentSha256',p_base->'contentSha256','locale',v.locale,'content',v.content,'envelope',evidence.envelope);
end;
$$;

create function private.entry_regroup_resolve(p_scope jsonb,p_base jsonb,p_selections jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare base jsonb; adapter jsonb; projected jsonb; requested jsonb:='[]'; canonical jsonb; selection jsonb; member jsonb; citation jsonb; src jsonb; assertion jsonb;
  output jsonb:='[]'; members jsonb; actual_member jsonb; actual_group jsonb; selected_ids jsonb:='{}'; seen_assertions jsonb:='{}'; used_entries jsonb:='{}';
  fact public.resume_facts%rowtype; origin_fact public.resume_facts%rowtype; version public.canonical_resume_versions%rowtype; previous_revision integer;
  location jsonb; places jsonb; source_refs jsonb; original_version uuid; through text; visited uuid[]; depth integer; k text;
  section jsonb; entry jsonb; bullet jsonb; ref text; fact_index jsonb; group_facts jsonb; affected jsonb; anchor text; section_id text;
  affected_entry jsonb; direct_refs jsonb; bullets jsonb; plans jsonb:='{}'; sections jsonb:='[]'; new_entries jsonb; retired jsonb:='[]'; index_value integer; insertion integer;
begin
  if private.grouped_import_keys(p_base,array['versionId','revision','contentSha256','locale','content','envelope']) is not true
    or jsonb_typeof(p_selections) is distinct from 'array' then perform private.correction_fail('invalid'); end if;
  if jsonb_array_length(p_selections) not between 1 and 32 then perform private.correction_fail('invalid'); end if;
  base:=private.entry_regroup_original_base(p_scope,p_base-array['content','envelope']);
  if base is distinct from p_base then perform private.correction_fail('invalid'); end if;
  adapter:=p_scope||jsonb_build_object('evidenceSchemaVersion','evidence/2.0.0','fieldExtractorVersion','evidence-fields/1.0.1',
    'targetModelVersion','evidence-targets/1.0.0','associationModelVersion','evidence-entry-associations/1.0.0','producerVersion','canonical-engine/1.0.3',
    'admissionPolicyVersion','grouped-original-admission/1.0.0','structuralTextProfileVersion','a02-structural-text/1.0.0',
    'correctionProjectionModelVersion','canonical-corrections/1.0.1','correctionAdmissionPolicyVersion','candidate-correction-admission/1.0.0','effectiveLocale',base->'locale');
  projected:=private.grouped_import_project_candidates(base->'envelope',adapter);
  select jsonb_object_agg(value->>'id',value) into fact_index from jsonb_array_elements(base->'content'->'facts');
  for selection in select value from jsonb_array_elements(p_selections) loop
    if private.grouped_import_keys(selection,array['pageId','method','sectionId','anchorEntryId','insertionIndex','affectedEntryIds','members']) is not true
      or jsonb_typeof(selection->'members') is distinct from 'array' then perform private.correction_fail('invalid'); end if;
    if jsonb_array_length(selection->'members') not between 2 and 3 then perform private.correction_fail('invalid'); end if;
    members:='[]';
    for member in select value from jsonb_array_elements(selection->'members') loop
      if private.grouped_import_keys(member,array['assertionId','field','factId','citations','mappedThrough','originVersionId','location']) is not true
        or private.grouped_import_keys(member->'location',array['kind','sectionId','entryId','bulletId']) is not true
        or jsonb_typeof(member->'citations') is distinct from 'array' then perform private.correction_fail('invalid'); end if;
      if jsonb_array_length(member->'citations')<>1 or private.grouped_import_uuid(member->'factId') is not true then perform private.correction_fail('invalid'); end if;
      citation:=member->'citations'->0;
      if private.grouped_import_keys(citation,array['attemptId','spanId','pageId','method','start','end','pageStart','pageEnd']) is not true then perform private.correction_fail('invalid'); end if;
      members:=members||jsonb_build_array(jsonb_build_object('assertionId',member->'assertionId','field',member->'field','citations',member->'citations'));
    end loop;
    requested:=requested||jsonb_build_array(jsonb_build_object('pageId',selection->'pageId','method',selection->'method','members',members));
  end loop;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into canonical from jsonb_array_elements(projected) with ordinality
    where value in (select value from jsonb_array_elements(requested));
  if canonical is distinct from requested then perform private.correction_fail('invalid'); end if;
  for selection in select value from jsonb_array_elements(p_selections) loop
    members:='[]'; group_facts:='{}'; section_id:=null; anchor:=null;
    for member in select value from jsonb_array_elements(selection->'members') loop
      if selected_ids ? (member->>'factId') or seen_assertions ? (member->>'assertionId') then perform private.correction_fail('invalid'); end if;
      selected_ids:=selected_ids||jsonb_build_object(member->>'factId',true); seen_assertions:=seen_assertions||jsonb_build_object(member->>'assertionId',true);
      select * into fact from public.resume_facts where canonical_version_id=(base->>'versionId')::uuid and id=(member->>'factId')::uuid;
      if not found or (fact.owner_id,fact.organization_id,fact.type) is distinct from ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,member->>'field') then perform private.correction_fail('invalid'); end if;
      places:=private.correction_location(base->'content',fact.id);
      if jsonb_array_length(places)<>1 then perform private.correction_fail('invalid'); end if;
      location:=places->0;
      if location->>'kind' not in ('entry','bullet') or location->'sectionId'='null'::jsonb or location->'entryId'='null'::jsonb then perform private.correction_fail('invalid'); end if;
      if section_id is null then section_id:=location->>'sectionId'; elsif section_id<>location->>'sectionId' then perform private.correction_fail('invalid'); end if;
      if member->>'field'='employer' then anchor:=location->>'entryId'; end if;
      select value into section from jsonb_array_elements(base->'content'->'sections') where value->>'id'=section_id;
      if not found or section->>'type'<>'experience' then perform private.correction_fail('invalid'); end if;
      origin_fact:=fact; original_version:=null; through:='current_citations';
      if jsonb_array_length(origin_fact.sources)=0 then
        through:='owned_ancestor_chain'; depth:=0; visited:='{}';
        select * into version from public.canonical_resume_versions where id=(base->>'versionId')::uuid;
        loop
          if version.parent_version_id is null or depth>=64 or version.id=any(visited) then perform private.correction_fail('invalid'); end if;
          visited:=array_append(visited,version.id); previous_revision:=version.revision;
          select * into version from public.canonical_resume_versions where id=version.parent_version_id
            and (owner_id,organization_id,resume_id,source_resume_version_id,source_evidence_version_id)=
              ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid)
            and content->>'analysisId'=p_scope->>'analysisId' and content->>'inputSha256'=p_scope->>'inputSha256';
          if not found or version.revision<>previous_revision-1
            or version.content->>'versionId' is distinct from version.id::text
            or version.content->'parentVersionId' is distinct from coalesce(to_jsonb(version.parent_version_id),'null'::jsonb) then perform private.correction_fail('invalid'); end if;
          select * into origin_fact from public.resume_facts where canonical_version_id=version.id and id=fact.id;
          if not found or (origin_fact.owner_id,origin_fact.organization_id,origin_fact.type) is distinct from (fact.owner_id,fact.organization_id,fact.type) then perform private.correction_fail('invalid'); end if;
          if not exists(select 1 from jsonb_array_elements(version.content->'facts') j(value) where j.value=jsonb_build_object('id',origin_fact.id,
            'type',origin_fact.type,'value',origin_fact.value,'state',origin_fact.state,'sources',origin_fact.sources,'confirmation',origin_fact.confirmation)) then perform private.correction_fail('invalid'); end if;
          depth:=depth+1;
          if jsonb_array_length(origin_fact.sources)>0 then original_version:=version.id; exit; end if;
        end loop;
      end if;
      select value into assertion from jsonb_array_elements(base->'envelope'->'assertions') where value->>'id'=member->>'assertionId';
      -- Selectable groups have exactly one citation, so no collation-dependent multireference ordering is introduced.
      select jsonb_agg(jsonb_build_object('attemptId',p_scope->'attemptId','spanId',value->'spanId','start',value->'start','end',value->'end') order by ordinality)
        into source_refs from jsonb_array_elements(assertion->'evidence') with ordinality;
      if origin_fact.value is distinct from assertion->>'value' or origin_fact.type is distinct from assertion->>'field'
        or origin_fact.sources is distinct from source_refs then perform private.correction_fail('invalid'); end if;
      actual_member:=jsonb_build_object('assertionId',member->'assertionId','field',member->'field','factId',fact.id,'citations',member->'citations',
        'mappedThrough',through,'originVersionId',original_version,'location',location);
      if actual_member is distinct from member then perform private.correction_fail('invalid'); end if;
      members:=members||jsonb_build_array(actual_member); group_facts:=group_facts||jsonb_build_object(fact.id::text,true);
    end loop;
    if anchor is null then perform private.correction_fail('invalid'); end if;
    select coalesce(jsonb_agg(e.value->'id' order by e.ordinality),'[]'::jsonb),min(e.ordinality)::integer-1 into affected,insertion
      from jsonb_array_elements(section->'entries') with ordinality e(value,ordinality)
      where e.value->>'id' in (select value->'location'->>'entryId' from jsonb_array_elements(members));
    direct_refs:='[]'; bullets:='[]';
    for entry in select e.value from jsonb_array_elements(section->'entries') with ordinality e(value,ordinality)
      where e.value->'id' in (select value from jsonb_array_elements(affected)) order by e.ordinality loop
      if used_entries ? (entry->>'id') then perform private.correction_fail('invalid'); end if;
      used_entries:=used_entries||jsonb_build_object(entry->>'id',true);
      for ref in select jsonb_array_elements_text(entry->'factIds') union all
        select jsonb_array_elements_text(b.value->'factIds') from jsonb_array_elements(entry->'bullets') b(value) loop
        if fact_index->ref->>'type' in ('employer','role','dates') and not (group_facts ? ref) then perform private.correction_fail('invalid'); end if;
      end loop;
      direct_refs:=direct_refs||(entry->'factIds'); bullets:=bullets||(entry->'bullets');
      if entry->>'id'<>anchor then retired:=retired||jsonb_build_array(entry->'id'); end if;
    end loop;
    if jsonb_array_length(direct_refs)>100 or jsonb_array_length(bullets)>100 then perform private.correction_fail('invalid'); end if;
    perform private.grouped_import_check_refs(direct_refs,fact_index);
    actual_group:=jsonb_build_object('pageId',selection->'pageId','method',selection->'method','sectionId',section_id,'anchorEntryId',anchor,
      'insertionIndex',insertion,'affectedEntryIds',affected,'members',members);
    if actual_group is distinct from selection then perform private.correction_fail('invalid'); end if;
    output:=output||jsonb_build_array(actual_group);
    plans:=plans||jsonb_build_object(section_id||':'||insertion,jsonb_build_object('id',anchor,'factIds',direct_refs,'bullets',bullets));
  end loop;
  for section in select value from jsonb_array_elements(base->'content'->'sections') loop
    new_entries:='[]'; index_value:=0;
    for entry in select value from jsonb_array_elements(section->'entries') loop
      affected_entry:=plans->((section->>'id')||':'||index_value);
      if affected_entry is not null then new_entries:=new_entries||jsonb_build_array(affected_entry);
      elsif not (used_entries ? (entry->>'id')) then new_entries:=new_entries||jsonb_build_array(entry); end if;
      index_value:=index_value+1;
    end loop;
    sections:=sections||jsonb_build_array(jsonb_set(section,'{entries}',new_entries));
  end loop;
  return jsonb_build_object('selections',output,'afterSections',sections,'retiredEntryIds',retired);
end;
$$;

create function private.entry_regroup_atoms(p_normal jsonb) returns text[]
language plpgsql immutable security invoker set search_path='' as $$
declare atoms text[]; key text; atom_value jsonb; selection jsonb; member jsonb; citation jsonb;
begin
  if private.grouped_import_keys(p_normal,array['schemaVersion','operation','binding','base','expected','acknowledgementPolicy','acknowledgement','unselectedDisposition','selections']) is not true
    or jsonb_typeof(p_normal->'selections') is distinct from 'array' then perform private.correction_fail('invalid'); end if;
  if jsonb_array_length(p_normal->'selections') not between 1 and 32 then perform private.correction_fail('invalid'); end if;
  atoms:=array[p_normal->>'schemaVersion',p_normal->>'operation'];
  foreach key in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId','inputSha256','evidenceSchemaVersion',
    'fieldExtractorVersion','targetModelVersion','associationModelVersion','producerVersion','admissionPolicyVersion','structuralTextProfileVersion',
    'correctionProjectionModelVersion','correctionAdmissionPolicyVersion','regroupModelVersion'] loop
    atoms:=array_append(atoms,p_normal->'binding'->>key);
  end loop;
  atoms:=atoms||array[p_normal->'base'->>'versionId',(p_normal->'base'->>'revision')::numeric::bigint::text,p_normal->'base'->>'contentSha256',p_normal->'base'->>'locale'];
  foreach key in array array['reviewRevision','reviewHeadId','assignmentRevision','assignmentHeadId','associationRevision','associationHeadId','regroupRevision','regroupHeadId','canonicalHeadId'] loop
    atom_value:=p_normal->'expected'->key;
    atoms:=array_append(atoms,case when atom_value='null'::jsonb then null when jsonb_typeof(atom_value)='number' then (atom_value#>>'{}')::numeric::bigint::text else atom_value#>>'{}' end);
  end loop;
  atoms:=atoms||array[p_normal->>'acknowledgementPolicy','1',p_normal->>'unselectedDisposition',jsonb_array_length(p_normal->'selections')::text];
  for selection in select value from jsonb_array_elements(p_normal->'selections') loop
    atoms:=atoms||array[selection->>'pageId',selection->>'method',selection->>'sectionId',selection->>'anchorEntryId',
      (selection->>'insertionIndex')::numeric::bigint::text,jsonb_array_length(selection->'affectedEntryIds')::text];
    for atom_value in select x.value from jsonb_array_elements(selection->'affectedEntryIds') x loop atoms:=array_append(atoms,atom_value#>>'{}'); end loop;
    atoms:=array_append(atoms,jsonb_array_length(selection->'members')::text);
    for member in select value from jsonb_array_elements(selection->'members') loop
      atoms:=atoms||array[member->>'assertionId',member->>'field',member->>'factId',jsonb_array_length(member->'citations')::text];
      for citation in select value from jsonb_array_elements(member->'citations') loop
        atoms:=atoms||array[citation->>'spanId',(citation->>'start')::numeric::bigint::text,(citation->>'end')::numeric::bigint::text,
          (citation->>'pageStart')::numeric::bigint::text,(citation->>'pageEnd')::numeric::bigint::text];
      end loop;
      atoms:=atoms||array[member->>'mappedThrough',member->>'originVersionId',member->'location'->>'kind',member->'location'->>'entryId',member->'location'->>'bulletId'];
    end loop;
  end loop;
  if cardinality(atoms)>1700 then perform private.correction_fail('invalid'); end if;
  perform private.grouped_import_command_bytes(atoms);
  return atoms;
end;
$$;

create function private.entry_regroup_normalize(p_scope jsonb,p_command jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare normal jsonb; base jsonb; expected jsonb; binding jsonb; resolved jsonb; prefix text; revision_value integer; head uuid; n bigint; bad boolean; k text;
begin
  if private.grouped_import_keys(p_command,array['normalForm','previewHash','idempotencyKey']) is not true
    or private.grouped_import_uuid(p_command->'idempotencyKey') is not true
    or jsonb_typeof(p_command->'previewHash') is distinct from 'string' or (p_command->>'previewHash') collate "C" !~ '^[a-f0-9]{64}$' then perform private.correction_fail('invalid'); end if;
  normal:=p_command->'normalForm';
  if private.grouped_import_keys(normal,array['schemaVersion','operation','binding','base','expected','acknowledgementPolicy','acknowledgement','unselectedDisposition','selections']) is not true
    or normal->>'schemaVersion' is distinct from 'canonical-entry-regroup-command/1.0.0'
    or normal->>'operation' is distinct from 'approve_whole_entry_regroup'
    or normal->>'acknowledgementPolicy' is distinct from 'whole_entry_merge_not_fact_confirmation'
    or normal->'acknowledgement' is distinct from 'true'::jsonb
    or normal->>'unselectedDisposition' is distinct from 'retain_eligible_original_origins'
    or octet_length(normal::text)>262144 then perform private.correction_fail('invalid'); end if;
  base:=private.entry_regroup_original_base(p_scope,normal->'base');
  binding:=p_scope||jsonb_build_object('evidenceSchemaVersion','evidence/2.0.0','fieldExtractorVersion','evidence-fields/1.0.1',
    'targetModelVersion','evidence-targets/1.0.0','associationModelVersion','evidence-entry-associations/1.0.0','producerVersion','canonical-engine/1.0.4',
    'admissionPolicyVersion','whole-entry-regroup-admission/1.0.0','structuralTextProfileVersion','a02-structural-text/1.0.0',
    'correctionProjectionModelVersion','canonical-corrections/1.0.1','correctionAdmissionPolicyVersion','candidate-correction-admission/1.0.0','regroupModelVersion','canonical-entry-regroup/1.0.0');
  if normal->'binding' is distinct from binding then perform private.correction_fail('invalid'); end if;
  for k in select jsonb_object_keys(binding) loop
    if jsonb_typeof(binding->k) is distinct from 'string' or private.grouped_import_utf16_length(binding->>k)>200 then perform private.correction_fail('invalid'); end if;
  end loop;
  expected:=normal->'expected';
  if private.grouped_import_keys(expected,array['reviewRevision','reviewHeadId','assignmentRevision','assignmentHeadId','associationRevision','associationHeadId','regroupRevision','regroupHeadId','canonicalHeadId']) is not true
    or expected->'canonicalHeadId' is distinct from base->'versionId' then perform private.correction_fail('invalid'); end if;
  -- Captures are immutable GLOBAL-analysis prefixes, not today's state and not attempt-filtered history.
  foreach prefix in array array['review','assignment','association','regroup'] loop
    if private.evidence_integer(expected->(prefix||'Revision'),0,2147483647) is not true then perform private.correction_fail('invalid'); end if;
    revision_value:=(expected->>(prefix||'Revision'))::numeric::integer;
    if prefix='review' and revision_value>1000 then perform private.correction_fail('invalid'); end if;
    if revision_value=0 then
      if expected->(prefix||'HeadId') is distinct from 'null'::jsonb then perform private.correction_fail('invalid'); end if;
    elsif private.grouped_import_uuid(expected->(prefix||'HeadId')) is not true then perform private.correction_fail('invalid'); end if;
    head:=null;
    if prefix='review' then
      select count(*) into n from public.evidence_corrections where analysis_id=(p_scope->>'analysisId')::uuid and revision<=revision_value;
      select id into head from public.evidence_corrections where analysis_id=(p_scope->>'analysisId')::uuid and revision=revision_value;
      select exists(select 1 from public.evidence_corrections e left join public.document_evidence_attempts a on a.id=e.attempt_id
        where e.analysis_id=(p_scope->>'analysisId')::uuid and e.revision<=revision_value and
        ((e.owner_id,e.organization_id,e.actor_id) is distinct from ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'ownerId')::uuid)
          or a.id is null or (a.owner_id,a.organization_id,a.analysis_id,a.resume_version_id,a.input_sha256) is distinct from
            ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'analysisId')::uuid,(p_scope->>'sourceId')::uuid,p_scope->>'inputSha256')
          or e.expected_revision<>e.revision-1 or e.field not in ('name','email','phone','employer','role','dates','education','certification')
          or e.operation not in ('confirm','correct') or private.grouped_import_utf16_length(e.value) not between 1 and 2000
          or e.value is distinct from private.grouped_import_trim(e.value)
          or (e.operation='confirm') is distinct from (e.candidate_id is not null)
          or (e.operation='confirm' and private.grouped_import_utf16_length(e.candidate_id) not between 1 and 100)
          or (e.operation='confirm' and e.attempt_id=(p_scope->>'attemptId')::uuid and not exists(
            select 1 from jsonb_array_elements(base->'envelope'->'assertions') a(value)
            where a.value->>'id'=e.candidate_id and a.value->>'field'=e.field and a.value->>'value'=e.value)))) into bad;
    elsif prefix='assignment' then
      select count(*) into n from public.candidate_correction_assignments where analysis_id=(p_scope->>'analysisId')::uuid and assignment_revision<=revision_value;
      select id into head from public.candidate_correction_assignments where analysis_id=(p_scope->>'analysisId')::uuid and assignment_revision=revision_value;
      select exists(select 1 from public.candidate_correction_assignments where analysis_id=(p_scope->>'analysisId')::uuid and assignment_revision<=revision_value
        and (owner_id,organization_id,resume_id,source_resume_version_id,input_sha256) is distinct from
          ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,p_scope->>'inputSha256')) into bad;
    elsif prefix='association' then
      select count(*) into n from public.candidate_entry_association_batches where analysis_id=(p_scope->>'analysisId')::uuid and association_revision<=revision_value;
      select id into head from public.candidate_entry_association_batches where analysis_id=(p_scope->>'analysisId')::uuid and association_revision=revision_value;
      select exists(select 1 from public.candidate_entry_association_batches where analysis_id=(p_scope->>'analysisId')::uuid and association_revision<=revision_value
        and (owner_id,organization_id,resume_id,source_resume_version_id,input_sha256) is distinct from
          ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,p_scope->>'inputSha256')) into bad;
    else
      select count(*) into n from public.candidate_entry_regroup_batches where analysis_id=(p_scope->>'analysisId')::uuid and regroup_revision<=revision_value;
      select id into head from public.candidate_entry_regroup_batches where analysis_id=(p_scope->>'analysisId')::uuid and regroup_revision=revision_value;
      select exists(select 1 from public.candidate_entry_regroup_batches where analysis_id=(p_scope->>'analysisId')::uuid and regroup_revision<=revision_value
        and (owner_id,organization_id,resume_id,source_resume_version_id,evidence_attempt_id,input_sha256) is distinct from
          ((p_scope->>'ownerId')::uuid,(p_scope->>'organizationId')::uuid,(p_scope->>'resumeId')::uuid,(p_scope->>'sourceId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'inputSha256')) into bad;
    end if;
    if n<>revision_value or coalesce(to_jsonb(head),'null'::jsonb) is distinct from expected->(prefix||'HeadId') or bad then perform private.correction_fail('invalid'); end if;
  end loop;
  resolved:=private.entry_regroup_resolve(p_scope,base,normal->'selections');
  if resolved->'selections' is distinct from normal->'selections'
    or private.grouped_import_command_sha256(private.entry_regroup_atoms(normal)) is distinct from p_command->>'previewHash' then perform private.correction_fail('invalid'); end if;
  return normal;
end;
$$;
revoke all on function private.entry_regroup_original_base(jsonb,jsonb),private.entry_regroup_resolve(jsonb,jsonb,jsonb),
  private.entry_regroup_normalize(jsonb,jsonb),private.entry_regroup_atoms(jsonb) from public,anon,authenticated,service_role;
commit;
