create extension if not exists pg_jsonschema with schema extensions;
create function private.canonical_shape_valid(p_body jsonb) returns boolean language sql immutable set search_path = '' as $fn$ select extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"schemaVersion":{"type":"string","const":"canonical-resume/1.0.0"},"producerVersion":{"type":"string","const":"canonical-engine/1.0.0"},"analysisId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"inputSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"retentionPolicyId":{"type":"string","minLength":1,"maxLength":100},"resumeId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"versionId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"parentVersionId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"ownerId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"organizationId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"locale":{"type":"string","pattern":"^[a-z]{2,3}(?:-[A-Z]{2})?$"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"},"state":{"type":"string","enum":["draft","review_required"]},"sourceEvidenceVersionId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"contactFactIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"facts":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["name","email","phone","employer","role","dates","education","certification","skill","contribution","metric","link","location"]},"value":{"type":"string","minLength":1,"maxLength":2000},"state":{"type":"string","enum":["source_supported","candidate_confirmed","unconfirmed"]},"sources":{"maxItems":20,"type":"array","items":{"type":"object","properties":{"attemptId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"spanId":{"type":"string","minLength":1,"maxLength":100},"start":{"type":"integer","minimum":0,"maximum":200000},"end":{"type":"integer","exclusiveMinimum":0,"maximum":200000}},"required":["attemptId","spanId","start","end"],"additionalProperties":false}},"confirmation":{"anyOf":[{"type":"object","properties":{"actorId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"confirmedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"},"value":{"type":"string","minLength":1,"maxLength":2000}},"required":["actorId","confirmedAt","value"],"additionalProperties":false},{"type":"null"}]}},"required":["id","type","value","state","sources","confirmation"],"additionalProperties":false}},"sections":{"maxItems":30,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["summary","experience","education","skills","certifications","projects","other"]},"title":{"type":"string","minLength":1,"maxLength":100},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"entries":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"bullets":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"text":{"type":"string","minLength":1,"maxLength":2000},"factIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}},"required":["id","text","factIds"],"additionalProperties":false}}},"required":["id","factIds","bullets"],"additionalProperties":false}}},"required":["id","type","title","factIds","entries"],"additionalProperties":false}},"changes":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"actorId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"action":{"type":"string","enum":["create","import","edit","rollback"]},"targetId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"priorValue":{"anyOf":[{"type":"string","minLength":1,"maxLength":2000},{"type":"null"}]},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}},"required":["id","actorId","action","targetId","priorValue","createdAt"],"additionalProperties":false}}},"required":["schemaVersion","producerVersion","analysisId","inputSha256","retentionPolicyId","resumeId","versionId","parentVersionId","ownerId","organizationId","locale","createdAt","state","sourceEvidenceVersionId","contactFactIds","facts","sections","changes"],"additionalProperties":false}$schema$::json,p_body); $fn$;
revoke all on function private.canonical_shape_valid(jsonb) from public,anon,authenticated;
-- AA020–AA024 service-mediated transaction boundary. No numeric score or
-- verified-document state is introduced. Source-supported facts remain disabled
-- for the current uncalibrated evidence profile; confirmation is an owner act.
alter table public.canonical_resume_versions
  add column parent_version_id uuid references public.canonical_resume_versions(id) on delete cascade,
  add column source_evidence_version_id uuid references public.document_evidence_attempts(id) on delete cascade,
  add column revision integer not null default 1 check (revision > 0),
  add column idempotency_key uuid not null default gen_random_uuid(),
  add column command jsonb not null default '{}'::jsonb,
  add column request_id text not null default 'storage-foundation' check (char_length(request_id) between 1 and 100),
  add constraint canonical_no_self_parent check (parent_version_id is distinct from id),
  add constraint canonical_idempotency unique (resume_id,idempotency_key),
  add constraint canonical_revision unique (resume_id,revision);
create index canonical_parent_idx on public.canonical_resume_versions(parent_version_id);
create index canonical_evidence_idx on public.canonical_resume_versions(source_evidence_version_id);
create function private.canonical_citations_valid(p_sources jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_sources)='array' then
    jsonb_array_length(p_sources)<=20 and coalesce((select bool_and(case
      when private.evidence_keys(value,array['attemptId','spanId','start','end'])
        and private.evidence_integer(value->'start',0,200000)
        and private.evidence_integer(value->'end',1,200000)
      then jsonb_typeof(value->'attemptId')='string'
        and value->>'attemptId' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
        and jsonb_typeof(value->'spanId')='string' and char_length(value->>'spanId') between 1 and 100
        and (value->>'end')::int>(value->>'start')::int
      else false end) from jsonb_array_elements(p_sources)),true)
    else false end;
$$;
revoke all on function private.canonical_citations_valid(jsonb) from public,anon,authenticated;
alter table public.resume_facts drop constraint resume_facts_state_check;
alter table public.resume_facts drop constraint resume_facts_sources_check;
alter table public.resume_facts drop constraint resume_facts_confirmation_check;
alter table public.resume_facts add constraint canonical_fact_state check (state in ('unconfirmed','candidate_confirmed')),
  add constraint canonical_fact_sources check (private.canonical_citations_valid(sources)),
  add constraint canonical_fact_confirmation check ((state='candidate_confirmed')=(confirmation is not null));
create table public.canonical_resume_heads (
  resume_id uuid primary key references public.resumes(id) on delete cascade,
  version_id uuid not null references public.canonical_resume_versions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision integer not null check (revision>0)
);
create index canonical_head_owner_idx on public.canonical_resume_heads(owner_id);
create index canonical_head_org_idx on public.canonical_resume_heads(organization_id);
create index canonical_head_version_idx on public.canonical_resume_heads(version_id);
create table public.change_events (
  canonical_version_id uuid not null references public.canonical_resume_versions(id) on delete cascade,
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('import','edit','confirm','rollback')),
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key(canonical_version_id,id)
);
create index canonical_change_owner_idx on public.change_events(owner_id);
create index canonical_change_org_idx on public.change_events(organization_id);
create index canonical_change_actor_idx on public.change_events(actor_id);
create trigger canonical_change_immutable before update on public.change_events
  for each row execute function private.reject_canonical_update();
alter table public.canonical_resume_heads enable row level security;
alter table public.change_events enable row level security;
revoke all on public.canonical_resume_heads,public.change_events from public,anon,authenticated,service_role;
grant select on public.canonical_resume_heads,public.change_events to authenticated;
grant select,delete on public.canonical_resume_heads,public.change_events to service_role;
create policy "owners read active canonical heads" on public.canonical_resume_heads for select to authenticated
  using ((select auth.uid())=owner_id and exists(select 1 from public.canonical_resume_versions v where v.id=version_id));
create policy "owners read active canonical events" on public.change_events for select to authenticated
  using ((select auth.uid())=owner_id and exists(select 1 from public.canonical_resume_versions v where v.id=canonical_version_id));

create function public.save_canonical_version(p_user_id uuid,p_source_id uuid,p_body jsonb,p_command jsonb,p_request_id text)
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
    or p_command is null or not private.evidence_keys(p_command,array['operation','expectedVersionId','idempotencyKey','factId','value','targetVersionId'])
    or p_request_id is null or char_length(p_request_id) not between 1 and 100 then
    raise exception 'Invalid canonical request' using errcode='22023'; end if;
  op:=p_command->>'operation';
  if op not in ('import','edit','confirm','rollback') then raise exception 'Invalid canonical operation' using errcode='22023'; end if;
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

-- A pending deletion immediately revokes canonical access, before cleanup.
alter policy "owners read active canonical versions" on public.canonical_resume_versions
  using ((select auth.uid())=owner_id
    and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.resumes r where r.id=resume_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=owner_id and d.kind='deletion' and d.status<>'failed'));

-- Fetch the four canonical collections in one MVCC snapshot. PostgREST table
-- reads silently stop at its configured row cap, which would truncate facts
-- from an account with many immutable versions.
create function public.export_canonical_records(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  select jsonb_build_object(
    'canonicalResumeVersions',coalesce((select jsonb_agg(to_jsonb(v) order by v.revision)
      from public.canonical_resume_versions v where v.owner_id=p_user_id),'[]'::jsonb),
    'resumeFacts',coalesce((select jsonb_agg(to_jsonb(f) order by f.canonical_version_id,f.id)
      from public.resume_facts f where f.owner_id=p_user_id),'[]'::jsonb),
    'canonicalResumeHeads',coalesce((select jsonb_agg(to_jsonb(h) order by h.resume_id)
      from public.canonical_resume_heads h where h.owner_id=p_user_id),'[]'::jsonb),
    'changeEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.canonical_version_id,e.id)
      from public.change_events e where e.owner_id=p_user_id),'[]'::jsonb)
    ) into snapshot;
  if octet_length(snapshot::text)>33554432 then
    raise exception 'Canonical export exceeds manifest limit' using errcode='22023';
  end if;
  return snapshot;
end;
$$;
revoke all on function public.export_canonical_records(uuid) from public,anon,authenticated;
grant execute on function public.export_canonical_records(uuid) to service_role;
