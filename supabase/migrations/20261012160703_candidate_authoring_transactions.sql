-- AA5 local authoring. Existing source and canonical histories stay immutable.

alter table public.change_events drop constraint change_events_operation_check;
alter table public.change_events add constraint change_events_operation_check check(operation in ('import','edit','confirm','rollback','rename_section'));

create or replace function public.save_canonical_version(p_user_id uuid,p_source_id uuid,p_body jsonb,p_command jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  root public.resumes%rowtype; source public.resume_versions%rowtype;
  head public.canonical_resume_versions%rowtype; prior public.canonical_resume_versions%rowtype;
  evidence public.document_evidence_attempts%rowtype; target public.canonical_resume_versions%rowtype;
  op text; fact jsonb; old_fact jsonb; citation jsonb; span jsonb; section jsonb; entry jsonb; bullet jsonb;
  event jsonb; object_ids text[]; references_ids text[] := '{}'::text[]; ref text;
  new_entries jsonb; new_bullets jsonb; new_sections jsonb := '[]'::jsonb;
  content_chars bigint; revision_value integer;
begin
  if p_body is null or octet_length(p_body::text)>1048576 or not private.canonical_shape_valid(p_body)
    or p_command is null or not private.evidence_keys(p_command,case when p_command->>'operation'='rename_section' then array['operation','expectedVersionId','idempotencyKey','factId','value','targetVersionId','sectionId'] else array['operation','expectedVersionId','idempotencyKey','factId','value','targetVersionId'] end)
    or p_request_id is null or char_length(p_request_id) not between 1 and 100 then
    raise exception 'Invalid canonical request' using errcode='22023'; end if;
  op:=p_command->>'operation';
  if op not in ('import','edit','confirm','rollback','rename_section') then raise exception 'Invalid canonical operation' using errcode='22023'; end if;
  select * into root from public.resumes where id=(p_body->>'resumeId')::uuid for update;
  if not found or root.owner_id<>p_user_id or root.status<>'active'
    or not exists(select 1 from public.memberships where user_id=p_user_id and organization_id=root.organization_id)
    or exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status not in ('failed')) then
    return jsonb_build_object('status','not_found'); end if;
  if p_body->>'ownerId'<>p_user_id::text or p_body->>'organizationId'<>root.organization_id::text then
    raise exception 'Canonical ownership mismatch' using errcode='22023'; end if;
  select * into source from public.resume_versions where id=p_source_id and resume_id=root.id
    and owner_id=p_user_id and organization_id=root.organization_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into prior from public.canonical_resume_versions
    where resume_id=root.id and idempotency_key=(p_command->>'idempotencyKey')::uuid;
  if found then
    if prior.command<>p_command or prior.source_resume_version_id<>p_source_id then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','applied','versionId',prior.id,'revision',prior.revision,'idempotent',true);
  end if;
  select v.* into head from public.canonical_resume_heads h join public.canonical_resume_versions v on v.id=h.version_id where h.resume_id=root.id;
  if (p_command->>'expectedVersionId')::uuid is distinct from head.id then return jsonb_build_object('status','conflict'); end if;
  if op='import' and head.id is not null then return jsonb_build_object('status','conflict'); end if;
  if op<>'import' and head.id is null then return jsonb_build_object('status','conflict'); end if;
  if (p_body->>'parentVersionId')::uuid is distinct from head.id then raise exception 'Invalid parent' using errcode='22023'; end if;
  if head.id is not null and (head.source_resume_version_id<>p_source_id
      or p_body->'sourceEvidenceVersionId' is distinct from head.content->'sourceEvidenceVersionId') then
    raise exception 'Source cannot change within a lineage' using errcode='22023'; end if;
  select * into evidence from public.document_evidence_attempts where id=(p_body->>'sourceEvidenceVersionId')::uuid
    and resume_version_id=p_source_id and owner_id=p_user_id and organization_id=root.organization_id;
  if not found then raise exception 'Canonical evidence missing' using errcode='22023'; end if;
  if p_body->>'analysisId'<>evidence.analysis_id::text or p_body->>'inputSha256'<>evidence.input_sha256
    or p_body->'retentionPolicyId' is distinct from evidence.envelope->'retentionPolicyId' then
    raise exception 'Canonical provenance metadata mismatch' using errcode='22023'; end if;
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
  if op='import' then
    if event->>'action'<>'import' or event->>'targetId'<>p_body->>'versionId' or event->'priorValue'<>'null'::jsonb then
      raise exception 'Invalid import event' using errcode='22023'; end if;
  elsif op in ('edit','confirm') then
    select value into old_fact from jsonb_array_elements(head.content->'facts') where value->>'id'=p_command->>'factId';
    if old_fact is null or event->>'targetId'<>old_fact->>'id' or event->>'action'<>'edit' or event->>'priorValue'<>old_fact->>'value'
      or p_body->'contactFactIds'<>head.content->'contactFactIds' or p_body->'locale'<>head.content->'locale'
      or jsonb_array_length(p_body->'facts')<>jsonb_array_length(head.content->'facts') then raise exception 'Invalid edit target' using errcode='22023'; end if;
    for fact in select value from jsonb_array_elements(p_body->'facts') loop
      if fact->>'id'=old_fact->>'id' then
        if fact->>'type'<>old_fact->>'type' then raise exception 'Fact type changed' using errcode='22023'; end if;
        if op='edit' and (fact->>'value' is distinct from p_command->>'value' or fact->>'state'<>'unconfirmed'
          or fact->'sources'<>'[]'::jsonb or fact->'confirmation'<>'null'::jsonb) then raise exception 'Edited fact must be unconfirmed' using errcode='22023'; end if;
        if op='confirm' and (fact->>'value'<>old_fact->>'value' or fact->'sources'<>old_fact->'sources'
          or fact->>'state'<>'candidate_confirmed' or fact->'confirmation'->>'confirmedAt'<>p_body->>'createdAt') then raise exception 'Confirmation must bind exact value' using errcode='22023'; end if;
      elsif not exists(select 1 from jsonb_array_elements(head.content->'facts') where value=fact) then
        raise exception 'Unrelated facts changed' using errcode='22023'; end if;
    end loop;
    -- Only update preview text for the one edited, singly-linked bullet.
    for section in select value from jsonb_array_elements(head.content->'sections') loop
      new_entries:='[]';
      for entry in select value from jsonb_array_elements(section->'entries') loop
        new_bullets:='[]';
        for bullet in select value from jsonb_array_elements(entry->'bullets') loop
          if op='edit' and bullet->'factIds'=jsonb_build_array(old_fact->>'id') then
            bullet:=jsonb_set(bullet,'{text}',p_command->'value'); end if;
          new_bullets:=new_bullets||jsonb_build_array(bullet);
        end loop;
        new_entries:=new_entries||jsonb_build_array(jsonb_set(entry,'{bullets}',new_bullets));
      end loop;
      new_sections:=new_sections||jsonb_build_array(jsonb_set(section,'{entries}',new_entries));
    end loop;
    if p_body->'sections'<>new_sections then raise exception 'Unrelated structure changed' using errcode='22023'; end if;
  elsif op='rename_section' then
    select value into section from jsonb_array_elements(head.content->'sections') where value->>'id'=p_command->>'sectionId';
    if section is null or jsonb_typeof(p_command->'value')<>'string' or char_length(p_command->>'value') not between 1 and 100
      or p_body->'facts'<>head.content->'facts' or p_body->'contactFactIds'<>head.content->'contactFactIds' or p_body->'locale'<>head.content->'locale'
      or event->>'action'<>'edit' or event->>'targetId'<>section->>'id' or event->>'priorValue'<>section->>'title' then
      raise exception 'Invalid section rename' using errcode='22023'; end if;
    select jsonb_agg(case when value->>'id'=section->>'id' then jsonb_set(value,'{title}',p_command->'value') else value end order by ordinality)
      into new_sections from jsonb_array_elements(head.content->'sections') with ordinality;
    if p_body->'sections'<>new_sections then raise exception 'Unrelated structure changed' using errcode='22023'; end if;
  else
    with recursive ancestors as (select id,parent_version_id from public.canonical_resume_versions where id=head.id
      union all select v.id,v.parent_version_id from public.canonical_resume_versions v join ancestors a on v.id=a.parent_version_id)
      select v.* into target from public.canonical_resume_versions v join ancestors a on a.id=v.id where v.id=(p_command->>'targetVersionId')::uuid;
    if target.id is null or p_body->'facts'<>target.content->'facts' or p_body->'sections'<>target.content->'sections'
      or p_body->'contactFactIds'<>target.content->'contactFactIds' or p_body->'locale'<>target.content->'locale'
      or event->>'action'<>'rollback' or event->>'targetId'<>p_body->>'versionId' or event->'priorValue'<>'null'::jsonb then
      raise exception 'Invalid rollback lineage' using errcode='22023'; end if;
  end if;
  revision_value:=coalesce(head.revision,0)+1;
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content,created_at,
    parent_version_id,source_evidence_version_id,revision,idempotency_key,command,request_id)
    values((p_body->>'versionId')::uuid,root.id,source.id,root.organization_id,p_user_id,p_body->>'locale',p_body->>'state',p_body,(p_body->>'createdAt')::timestamptz,
      head.id,evidence.id,revision_value,(p_command->>'idempotencyKey')::uuid,p_command,p_request_id);
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value,state,sources,confirmation)
    select (p_body->>'versionId')::uuid,(value->>'id')::uuid,root.organization_id,p_user_id,value->>'type',value->>'value',value->>'state',value->'sources',nullif(value->'confirmation','null'::jsonb)
      from jsonb_array_elements(p_body->'facts');
  insert into public.change_events(canonical_version_id,id,owner_id,organization_id,actor_id,operation,event,created_at)
    values((p_body->>'versionId')::uuid,(event->>'id')::uuid,p_user_id,root.organization_id,p_user_id,op,event,(p_body->>'createdAt')::timestamptz);
  insert into public.canonical_resume_heads(resume_id,version_id,owner_id,organization_id,revision)
    values(root.id,(p_body->>'versionId')::uuid,p_user_id,root.organization_id,revision_value)
    on conflict(resume_id) do update set version_id=excluded.version_id,revision=excluded.revision;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
    values(root.organization_id,p_user_id,'canonical.'||op,'canonical_resume_version',(p_body->>'versionId')::uuid,'success',p_request_id);
  return jsonb_build_object('status','applied','versionId',p_body->>'versionId','revision',revision_value,'idempotent',false);
end;
$$;
revoke all on function public.save_canonical_version(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_canonical_version(uuid,uuid,jsonb,jsonb,text) to service_role;


create function private.authoring_pattern(p_value text,p_pattern text) returns text
language plpgsql immutable set search_path='' as $$
declare result_value text; measurement_value text; scope_value text; method_value text; line text; label text; val text; seen text[]:=array[]::text[];
begin
  if p_pattern not in ('xyz','action_impact_context','action_scope_result') then raise exception 'Invalid pattern' using errcode='22023'; end if;
  for line in select unnest(string_to_array(p_value,E'\n')) offset 1 loop
    label:=split_part(line,': ',1); val:=substring(line from char_length(label)+3);
    if label in ('Result','Measurement','Scope','Method') then
      if label=any(seen) then raise exception 'Ambiguous clarification' using errcode='22023'; end if;
      seen:=array_append(seen,label);
      if val='' or lower(btrim(val)) in ('unknown','n/a','na','none','not known','no measurement') then val:=null; end if;
      if label='Result' then result_value:=val; elsif label='Measurement' then measurement_value:=val;
      elsif label='Scope' then scope_value:=val; else method_value:=val; end if;
    end if;
  end loop;
  if result_value is null or (p_pattern='xyz' and (measurement_value is null or method_value is null)) or (p_pattern<>'xyz' and scope_value is null) then
    raise exception 'Missing clarification' using errcode='22023'; end if;
  if p_pattern='xyz' then return result_value||'; measured by '||measurement_value||'; by '||method_value||'.';
  elsif p_pattern='action_impact_context' then return split_part(p_value,E'\n',1)||'; impact: '||result_value||'; context: '||scope_value||'.';
  else return split_part(p_value,E'\n',1)||'; scope: '||scope_value||'; result: '||result_value||'.'; end if;
end;$$;
revoke all on function private.authoring_pattern(text,text) from public,anon,authenticated;

create table public.authoring_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  base_version_id uuid not null references public.canonical_resume_versions(id) on delete cascade,
  result_version_id uuid references public.canonical_resume_versions(id) on delete cascade,
  idempotency_key uuid not null,
  action text not null check(action in ('edit','confirm','rename','clarify','accept','reject','undo','restore')),
  command jsonb not null check(jsonb_typeof(command)='object' and octet_length(command::text)<=16384),
  result jsonb not null check(jsonb_typeof(result)='object'),
  retention_policy_id text not null,
  created_at timestamptz not null default now(),
  unique(analysis_id,idempotency_key)
);
create index authoring_owner_idx on public.authoring_events(owner_id);
create index authoring_org_idx on public.authoring_events(organization_id);
create index authoring_resume_idx on public.authoring_events(resume_id);
create index authoring_base_idx on public.authoring_events(base_version_id);
create index authoring_result_idx on public.authoring_events(result_version_id);
create trigger immutable_authoring_event before update on public.authoring_events for each row execute function private.reject_canonical_update();
alter table public.authoring_events enable row level security;
revoke all on public.authoring_events from public,anon,authenticated,service_role;
grant select on public.authoring_events to authenticated;
grant select,delete on public.authoring_events to service_role;
create policy "owners read active authoring decisions" on public.authoring_events for select to authenticated
using ((select auth.uid())=owner_id and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active' and r.owner_id=authoring_events.owner_id)
  and exists(select 1 from public.memberships m where m.user_id=authoring_events.owner_id and m.organization_id=authoring_events.organization_id)
  and not exists(select 1 from public.data_requests d where d.user_id=authoring_events.owner_id and d.kind='deletion' and d.status<>'failed'));

create function public.apply_authoring_action(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_body jsonb,p_confirmation_body jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; root public.resumes%rowtype; head public.canonical_resume_versions%rowtype;
  prior public.authoring_events%rowtype; old_fact jsonb; patch jsonb; canonical_command jsonb; applied jsonb; confirmed jsonb;
  action_value text; op text; value_text text; question_kind_value text; label text; target uuid; undo_target uuid; line text; lines text[]; position_value int; event_id uuid:=gen_random_uuid(); result_value jsonb;
begin
  if p_command is null or octet_length(p_command::text)>16384 or not private.evidence_keys(p_command,
    array['action','expectedVersionId','idempotencyKey','targetFactId','sectionId','value','questionKind','pattern','targetVersionId','confirmation','patch'])
    or p_request_id is null or char_length(p_request_id) not between 1 and 100 then raise exception 'Invalid authoring command' using errcode='22023'; end if;
  action_value:=p_command->>'action';
  if action_value not in ('edit','confirm','rename','clarify','accept','reject','undo','restore') then raise exception 'Invalid authoring action' using errcode='22023'; end if;
  select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select r.* into root from public.resumes r join public.resume_versions v on v.resume_id=r.id where v.id=a.resume_version_id for update of r;
  if root.id is null or root.owner_id<>p_user_id or root.status<>'active' or root.organization_id<>a.organization_id
    or not exists(select 1 from public.memberships where user_id=p_user_id and organization_id=root.organization_id)
    or exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed') then return jsonb_build_object('status','not_found'); end if;
  select * into prior from public.authoring_events where analysis_id=a.id and idempotency_key=(p_command->>'idempotencyKey')::uuid;
  if found then if prior.command<>p_command then return jsonb_build_object('status','conflict'); end if;
    return prior.result||jsonb_build_object('idempotent',true); end if;
  select v.* into head from public.canonical_resume_heads h join public.canonical_resume_versions v on v.id=h.version_id where h.resume_id=root.id;
  if head.id is null or head.source_resume_version_id<>a.resume_version_id or head.content->>'analysisId'<>a.id::text then return jsonb_build_object('status','not_found'); end if;
  if head.id is distinct from (p_command->>'expectedVersionId')::uuid then return jsonb_build_object('status','conflict'); end if;
  target:=(p_command->>'targetFactId')::uuid;
  if action_value in ('edit','confirm','clarify','accept','reject') then
    select value into old_fact from jsonb_array_elements(head.content->'facts') where value->>'id'=target::text;
    if old_fact is null then raise exception 'Unknown fact' using errcode='22023'; end if;
  end if;
  if action_value in ('accept','reject') then
    patch:=p_command->'patch';
    if not private.evidence_keys(patch,array['schemaVersion','id','producerVersion','baseVersionId','targetFactId','sectionId','entryId','sourceFactIds','affectedRuleIds','affectedRequirementIds','pattern','operations','rationale','confidence','clarificationNeeds','state'])
      or patch->>'schemaVersion'<>'suggestion-patch/1.0.0' or patch->>'producerVersion'<>'grounded-patterns/1.0.0'
      or patch->>'baseVersionId'<>head.id::text or patch->>'targetFactId'<>target::text
      or patch->'sourceFactIds'<>jsonb_build_array(target::text) or patch->'confidence'<>jsonb_build_object('kind','uncalibrated','value',null)
      or patch->>'pattern'<>p_command->>'pattern' or old_fact->>'type'<>'contribution'
      or not exists(select 1 from jsonb_array_elements(head.content->'sections') s cross join lateral jsonb_array_elements(s.value->'entries') e
        where s.value->>'id'=patch->>'sectionId' and e.value->>'id'=patch->>'entryId' and (e.value->'factIds' ? target::text
          or exists(select 1 from jsonb_array_elements(e.value->'bullets') b where b.value->'factIds' ? target::text))) then
      raise exception 'Invalid patch bindings' using errcode='22023'; end if;
    if action_value='accept' then
      if old_fact->>'state'<>'candidate_confirmed' or patch->>'state'<>'ready' or p_command->'confirmation'<>'true'::jsonb then raise exception 'Candidate review required' using errcode='22023'; end if;
      value_text:=private.authoring_pattern(old_fact->>'value',p_command->>'pattern');
      if patch->'operations'<>jsonb_build_array(jsonb_build_object('operation','replace_fact','factId',target::text,'value',value_text))
        or p_command->>'value'<>value_text then raise exception 'Unsupported generated fact' using errcode='22023'; end if;
    end if;
  end if;
  if action_value='reject' then
    if p_body is not null or p_confirmation_body is not null then raise exception 'Reject cannot mutate content' using errcode='22023'; end if;
    applied:=jsonb_build_object('status','applied','versionId',head.id,'revision',head.revision,'idempotent',false);
  else
    if action_value='rename' then op:='rename_section'; value_text:=p_command->>'value';
    elsif action_value='confirm' then op:='confirm';
    elsif action_value in ('undo','restore') then
      op:='rollback'; undo_target:=(p_command->>'targetVersionId')::uuid;
      if action_value='undo' then
        select base_version_id into undo_target from public.authoring_events where resume_id=root.id and result_version_id=head.id and base_version_id<>head.id order by created_at desc limit 1;
        undo_target:=coalesce(undo_target,head.parent_version_id);
        if undo_target is null or (p_command->>'targetVersionId')::uuid is distinct from undo_target then raise exception 'Invalid undo target' using errcode='22023'; end if;
      end if;
    else op:='edit'; if action_value='edit' then value_text:=p_command->>'value'; end if; end if;
    if action_value='clarify' then
      question_kind_value:=p_command->>'questionKind'; label:=initcap(question_kind_value)||': ';
      if question_kind_value not in ('result','measurement','scope','method','ownership') or old_fact->>'type'<>'contribution'
        or p_command->'confirmation'<>'true'::jsonb or char_length(p_command->>'value') not between 1 and 300
        or p_command->>'value'<>btrim(p_command->>'value') or (p_command->>'value') ~ '[[:cntrl:]]' then raise exception 'Invalid clarification' using errcode='22023'; end if;
      lines:=string_to_array(old_fact->>'value',E'\n'); value_text:=lines[1]; position_value:=0;
      foreach line in array lines loop position_value:=position_value+1; if position_value>1 and left(line,char_length(label))<>label then value_text:=value_text||E'\n'||line; end if; end loop;
      value_text:=value_text||E'\n'||label||(p_command->>'value');
    end if;
    canonical_command:=jsonb_build_object('operation',op,'expectedVersionId',head.id,'idempotencyKey',gen_random_uuid(),
      'factId',case when op in ('edit','confirm') then target else null end,'value',case when op in ('edit','rename_section') then value_text else null end,
      'targetVersionId',case when op='rollback' then undo_target else null end);
    if op='rename_section' then canonical_command:=canonical_command||jsonb_build_object('sectionId',p_command->'sectionId'); end if;
    applied:=public.save_canonical_version(p_user_id,a.resume_version_id,p_body,canonical_command,p_request_id);
    if applied->>'status'<>'applied' then return applied; end if;
    if action_value in ('clarify','accept') then
      canonical_command:=jsonb_build_object('operation','confirm','expectedVersionId',applied->'versionId','idempotencyKey',gen_random_uuid(),
        'factId',target,'value',null,'targetVersionId',null);
      confirmed:=public.save_canonical_version(p_user_id,a.resume_version_id,p_confirmation_body,canonical_command,p_request_id);
      if confirmed->>'status'<>'applied' then raise exception 'Confirmation transaction failed' using errcode='22023'; end if;
      applied:=confirmed;
    elsif p_confirmation_body is not null then raise exception 'Unexpected confirmation' using errcode='22023'; end if;
  end if;
  result_value:=applied||jsonb_build_object('eventId',event_id,'action',action_value);
  insert into public.authoring_events(id,analysis_id,resume_id,owner_id,organization_id,base_version_id,result_version_id,idempotency_key,action,command,result,retention_policy_id)
    values(event_id,a.id,root.id,p_user_id,root.organization_id,head.id,case when action_value='reject' then null else (applied->>'versionId')::uuid end,
      (p_command->>'idempotencyKey')::uuid,action_value,p_command,result_value,head.content->>'retentionPolicyId');
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
    values(root.organization_id,p_user_id,'authoring.'||action_value,'authoring_event',event_id,'success',p_request_id);
  return result_value;
end;$$;
revoke all on function public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;
create function public.export_authoring_records(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
  select jsonb_build_object('authoringEvents',coalesce((select jsonb_agg(to_jsonb(e) order by created_at,id) from public.authoring_events e where owner_id=p_user_id),'[]'::jsonb)) into snapshot;
  if octet_length(snapshot::text)>33554432 then raise exception 'Authoring export exceeds manifest limit' using errcode='22023'; end if;
  return snapshot;
end;$$;
revoke all on function public.export_authoring_records(uuid) from public,anon,authenticated;
grant execute on function public.export_authoring_records(uuid) to service_role;

-- Coupled canonical/JD/authoring collections share one stable MVCC snapshot.
create function public.export_resume_workspace_records(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot:=public.export_canonical_records(p_user_id)||public.export_job_requirement_records(p_user_id)||public.export_authoring_records(p_user_id);
  if octet_length(snapshot::text)>33554432 then raise exception 'Workspace export exceeds manifest limit' using errcode='22023'; end if;
  return snapshot;
end;$$;
revoke all on function public.export_resume_workspace_records(uuid) from public,anon,authenticated;
grant execute on function public.export_resume_workspace_records(uuid) to service_role;
