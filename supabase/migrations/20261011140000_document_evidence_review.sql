-- AA013/AA014 engineering-only review. Originals are immutable; confirmations
-- never calibrate evidence or authorize numerical scoring. Forward-only.
create table public.document_evidence_attempts (
  id uuid primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions(id) on delete cascade,
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_number integer not null check (attempt_number > 0),
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  unique (analysis_id, attempt_number)
);
create table public.evidence_corrections (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.document_evidence_attempts(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  expected_revision integer not null check (expected_revision >= 0),
  field text not null check (field in ('name','email','phone','employer','role','dates','education','certification')),
  operation text not null check (operation in ('confirm','correct')),
  value text not null check (value = btrim(value) and char_length(value) between 1 and 2000),
  candidate_id text,
  idempotency_key uuid not null,
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (analysis_id, revision),
  unique (analysis_id, idempotency_key)
);
create index document_evidence_owner_idx on public.document_evidence_attempts(owner_id);
create index document_evidence_org_idx on public.document_evidence_attempts(organization_id);
create index document_evidence_source_idx on public.document_evidence_attempts(resume_version_id);
create index evidence_corrections_attempt_idx on public.evidence_corrections(attempt_id);
create index evidence_corrections_owner_idx on public.evidence_corrections(owner_id);
create index evidence_corrections_org_idx on public.evidence_corrections(organization_id);
create index evidence_corrections_actor_idx on public.evidence_corrections(actor_id);
alter table public.document_evidence_attempts enable row level security;
alter table public.evidence_corrections enable row level security;
revoke all on public.document_evidence_attempts, public.evidence_corrections from public, anon, authenticated, service_role;
grant select on public.document_evidence_attempts, public.evidence_corrections to authenticated;
grant select on public.document_evidence_attempts, public.evidence_corrections to service_role;
create policy "owners read evidence attempts" on public.document_evidence_attempts for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners read evidence corrections" on public.evidence_corrections for select to authenticated using ((select auth.uid()) = owner_id);

-- Older numeric payloads stay in storage for legacy provenance, but cannot be
-- published through PostgREST once this analysis enters document review. The
-- security-definer lookup sees attempts even for members who cannot read the
-- owner's raw evidence; membership remains required before the lookup returns.
create function private.analysis_has_document_evidence(p_analysis_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.document_evidence_attempts e
    join public.analyses a on a.id = e.analysis_id
    where a.id = p_analysis_id and private.has_organization_role(a.organization_id,array['owner','admin','member','viewer']));
$$;
revoke all on function private.analysis_has_document_evidence(uuid) from public,anon;
grant execute on function private.analysis_has_document_evidence(uuid) to authenticated;
alter policy "members read analysis results" on public.analysis_results
  using ((select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and not private.analysis_has_document_evidence(analysis_id));

create function private.reject_evidence_update() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Evidence originals and corrections are immutable' using errcode = '22023';
end;
$$;
revoke all on function private.reject_evidence_update() from public;
create trigger immutable_evidence_attempt before update on public.document_evidence_attempts for each row execute function private.reject_evidence_update();
create trigger immutable_evidence_correction before update on public.evidence_corrections for each row execute function private.reject_evidence_update();

-- Locking the same analysis row serializes evidence persistence with all score
-- writes, including direct service inserts. Previous legacy rows are retained.
create function private.block_unreviewed_evidence_scores() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.analyses where id = new.analysis_id for update;
  if exists (select 1 from public.document_evidence_attempts where analysis_id = new.analysis_id) then
    raise exception 'Document evidence is scoring ineligible' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.block_unreviewed_evidence_scores() from public;
create trigger document_evidence_no_deterministic_score before insert or update on public.analysis_deterministic_results for each row execute function private.block_unreviewed_evidence_scores();
create trigger document_evidence_no_qualitative_score before insert or update on public.analysis_ai_runs for each row execute function private.block_unreviewed_evidence_scores();
create trigger document_evidence_no_result before insert or update on public.analysis_results for each row execute function private.block_unreviewed_evidence_scores();

create function private.evidence_keys(p_value jsonb, p_keys text[]) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_value) = 'object' and
    (select array_agg(k order by k) from jsonb_object_keys(p_value) k) =
    (select array_agg(k order by k) from unnest(p_keys) k);
$$;
revoke all on function private.evidence_keys(jsonb,text[]) from public;

create function private.evidence_integer(p_value jsonb,p_min bigint,p_max bigint) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' then
    (p_value #>> '{}')::numeric between p_min and p_max and
    trunc((p_value #>> '{}')::numeric) = (p_value #>> '{}')::numeric
  else false end;
$$;
revoke all on function private.evidence_integer(jsonb,bigint,bigint) from public;

create function private.evidence_number(p_value jsonb,p_min numeric,p_max numeric) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric between p_min and p_max else false end;
$$;
revoke all on function private.evidence_number(jsonb,numeric,numeric) from public;

create function public.persist_document_evidence(p_analysis_id uuid, p_envelope jsonb, p_process_id text, p_request_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  a public.analyses%rowtype;
  v public.resume_versions%rowtype;
  prior public.document_evidence_attempts%rowtype;
  page jsonb; span jsonb; source_span jsonb; source_page jsonb; candidate jsonb; ref jsonb;
  graph jsonb; ocr jsonb; request jsonb; word jsonb; box jsonb; field_state jsonb;
  assembled text; n integer; cursor integer; line text; line_number integer;
  left_edge numeric; top_edge numeric; right_edge numeric; bottom_edge numeric; candidate_count integer;
  expected_blockers jsonb := '["uncalibrated_confidence"]'::jsonb; resource jsonb;
begin
  select * into a from public.analyses where id = p_analysis_id for update;
  if not found then return false; end if;
  if a.status not in ('extracting','needs_ocr','scoring','qualitative_review','partial','completed') then return false; end if;
  select * into strict v from public.resume_versions where id = a.resume_version_id;
  if not private.evidence_keys(p_envelope, array['schemaVersion','id','ownerId','analysisId','sourceId','inputSha256','createdAt','retentionPolicyId','nativeSource','ocrSource','ocrFailure','status','scoringEligible','confidence','spans','assertions','fields','blockers'])
     or p_envelope->>'schemaVersion' is distinct from 'evidence/2.0.0'
     or p_envelope->>'ownerId' is distinct from a.owner_id::text
     or p_envelope->>'analysisId' is distinct from a.id::text
     or p_envelope->>'sourceId' is distinct from v.id::text
     or p_envelope->>'inputSha256' is distinct from v.checksum
     or v.owner_id <> a.owner_id or v.organization_id <> a.organization_id
     or p_envelope->'scoringEligible' is distinct from 'false'::jsonb
     or p_envelope->>'status' not in ('review_required','insufficient','unsupported','failed')
     or p_envelope->'confidence' is distinct from '{"kind":"uncalibrated","reason":"calibration_not_approved"}'::jsonb
       or jsonb_typeof(p_envelope->'retentionPolicyId') is distinct from 'string' or char_length(p_envelope->>'retentionPolicyId') not between 1 and 100
     or jsonb_typeof(p_envelope->'spans') is distinct from 'array'
     or jsonb_typeof(p_envelope->'assertions') is distinct from 'array'
     or jsonb_typeof(p_envelope->'fields') is distinct from 'array'
     or jsonb_typeof(p_envelope->'blockers') is distinct from 'array'
     or jsonb_array_length(p_envelope->'spans') not between 1 and 20000
     or jsonb_array_length(p_envelope->'assertions') > 1000
     or octet_length(p_envelope::text) > 10000000 then
    raise exception 'Invalid document evidence envelope' using errcode = '22023';
  end if;
  if jsonb_typeof(p_envelope->'id') is distinct from 'string' or jsonb_typeof(p_envelope->'createdAt') is distinct from 'string' or p_envelope->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T.*Z$' then raise exception 'Invalid evidence identity/time' using errcode = '22023'; end if;
  perform (p_envelope->>'id')::uuid, (p_envelope->>'createdAt')::timestamptz;
  graph := p_envelope->'nativeSource';
  if not private.evidence_keys(graph,array['schemaVersion','extractorVersion','offsetUnit','pages','spans','assertions'])
     or graph->>'schemaVersion' is distinct from 'native-evidence-v1'
     or graph->>'extractorVersion' is distinct from 'unpdf-v1'
     or graph->>'offsetUnit' is distinct from 'unicode_code_point'
     or jsonb_typeof(graph->'pages') is distinct from 'array'
     or jsonb_typeof(graph->'spans') is distinct from 'array'
     or jsonb_typeof(graph->'assertions') is distinct from 'array'
     or jsonb_array_length(graph->'pages') not between 1 and 20 then
    raise exception 'Invalid native evidence source' using errcode = '22023';
  end if;
  if (select sum(char_length(value->>'text')) + (count(*)-1)*2 from jsonb_array_elements(graph->'pages')) > 500000 then raise exception 'Native source text limit' using errcode = '22023'; end if;
  n := 0;
  for page in select value from jsonb_array_elements(graph->'pages') loop
    n := n + 1;
    if not private.evidence_keys(page,array['id','pageNumber','text','method','confidence'])
       or page->>'id' is distinct from 'page-' || n or page->>'pageNumber' is distinct from n::text
       or not private.evidence_integer(page->'pageNumber',1,20)
       or jsonb_typeof(page->'text') is distinct from 'string'
       or page->>'method' is distinct from 'native_text' or page->>'confidence' is distinct from 'uncalibrated' then
      raise exception 'Invalid native page' using errcode = '22023';
    end if;
    cursor := 0; line_number := 0;
    for line in select regexp_split_to_table(page->>'text', E'\n') loop
      line_number := line_number + 1;
      select value into source_span from jsonb_array_elements(graph->'spans') where value->>'id' = page->>'id' || '-line-' || line_number;
      if source_span is null or not private.evidence_keys(source_span,array['id','pageId','start','end','text'])
         or not private.evidence_integer(source_span->'start',0,500000) or not private.evidence_integer(source_span->'end',0,500000)
         or source_span->>'pageId' is distinct from page->>'id'
         or source_span->>'start' is distinct from cursor::text
         or source_span->>'end' is distinct from (cursor + char_length(line))::text
         or source_span->>'text' is distinct from line then
        raise exception 'Native span mismatch' using errcode = '22023';
      end if;
      cursor := cursor + char_length(line) + 1;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(graph->'spans')) <> (select coalesce(sum(1 + char_length(value->>'text') - char_length(replace(value->>'text', E'\n',''))),0) from jsonb_array_elements(graph->'pages')) then
    raise exception 'Native source has extra spans' using errcode = '22023';
  end if;
  if jsonb_array_length(graph->'assertions') <> 3 or (select count(distinct value->>'field') from jsonb_array_elements(graph->'assertions') where value->>'field' in ('name','email','phone')) <> 3 then
    raise exception 'Invalid native assertions' using errcode = '22023';
  end if;
  for candidate in select value from jsonb_array_elements(graph->'assertions') loop
    if not private.evidence_keys(candidate,array['field','value','state','confidence','evidence']) or candidate->>'confidence' is distinct from 'uncalibrated' then raise exception 'Invalid native assertion' using errcode = '22023'; end if;
    if candidate->>'state' = 'not_evaluated' then
      if candidate->'value' <> 'null'::jsonb or candidate->'evidence' <> 'null'::jsonb then raise exception 'Invalid unevaluated assertion' using errcode = '22023'; end if;
    elsif candidate->>'state' = 'review_required' then
      ref := candidate->'evidence';
      select value into source_span from jsonb_array_elements(graph->'spans') where value->>'id' = ref->>'spanId';
      if source_span is null or not private.evidence_keys(ref,array['spanId','start','end']) or not private.evidence_integer(ref->'start',0,500000) or not private.evidence_integer(ref->'end',1,500000) or (ref->>'end')::integer <= (ref->>'start')::integer or (ref->>'end')::integer > char_length(source_span->>'text') or candidate->>'value' is distinct from substring(source_span->>'text' from (ref->>'start')::integer+1 for (ref->>'end')::integer-(ref->>'start')::integer) then raise exception 'Ungrounded native assertion' using errcode = '22023'; end if;
    else raise exception 'Invalid native assertion state' using errcode = '22023'; end if;
  end loop;
  ocr := p_envelope->'ocrSource';
  if ocr <> 'null'::jsonb then
    if not private.evidence_keys(ocr - 'resourceUsage',array['schemaVersion','request','provider','status','scoringEligible','offsetUnit','coordinateSystem','durationMs','measuredWallTimeMs','cost','pages'])
       or ocr->>'schemaVersion' is distinct from 'ocr-evidence-v1'
       or ocr->'scoringEligible' is distinct from 'false'::jsonb
       or ocr->>'status' not in ('review_required','insufficient')
       or ocr->>'offsetUnit' is distinct from 'unicode_code_point'
       or ocr->>'coordinateSystem' is distinct from 'normalized_top_left'
       or jsonb_typeof(ocr->'pages') is distinct from 'array' or jsonb_array_length(ocr->'pages') not between 1 and 10 then raise exception 'Invalid OCR source' using errcode = '22023'; end if;
    request := ocr->'request';
    if not private.evidence_keys(request,array['schemaVersion','attemptId','ownerId','analysisId','sourceId','createdAt','retentionPolicyId','sourceSha256','nativePageTexts','selectedPages','remainingDeadlineMs','limits','allocation','policy'])
       or request->>'schemaVersion' is distinct from 'selective-ocr-request-v1'
       or request->>'ownerId' is distinct from a.owner_id::text
       or request->>'analysisId' is distinct from a.id::text
       or request->>'sourceId' is distinct from v.id::text
       or request->>'sourceSha256' is distinct from v.checksum
       or request->'nativePageTexts' is distinct from (select jsonb_agg(value->'text') from jsonb_array_elements(graph->'pages'))
       or request->'policy' is distinct from '{"executionMode":"self_hosted","purpose":"synthetic_local_test","allowThirdPartyProcessing":false}'::jsonb
       or not private.evidence_keys(request->'limits',array['maxCharacters','maxPages'])
       or not private.evidence_integer(request->'limits'->'maxCharacters',1,200000) or not private.evidence_integer(request->'limits'->'maxPages',1,20)
       or (request->'limits'->>'maxCharacters')::integer not between 1 and 200000
       or (request->'limits'->>'maxPages')::integer not between 1 and 20
       or not private.evidence_keys(request->'allocation',array['id','maxWallTimeMs','maxPages','externalApiFeeMicros'])
       or jsonb_typeof(request->'allocation'->'id') is distinct from 'string' or char_length(request->'allocation'->>'id') not between 1 and 100
       or not private.evidence_integer(request->'allocation'->'maxWallTimeMs',1,10000) or not private.evidence_integer(request->'allocation'->'maxPages',1,10)
       or request->'allocation'->'externalApiFeeMicros' is distinct from '0'::jsonb
       or (request->'allocation'->>'maxWallTimeMs')::integer not between 1 and 10000
       or (request->'allocation'->>'maxPages')::integer not between 1 and 10
       or (request->>'remainingDeadlineMs')::integer not between 1 and 30000
       or not private.evidence_integer(request->'remainingDeadlineMs',1,30000)
       or jsonb_typeof(request->'selectedPages') is distinct from 'array'
       or jsonb_array_length(request->'selectedPages') <> jsonb_array_length(ocr->'pages')
       or request->'selectedPages' is distinct from (select coalesce(jsonb_agg(jsonb_build_object('pageId',value->'id','pageNumber',value->'pageNumber')),'[]'::jsonb) from jsonb_array_elements(graph->'pages') where char_length(regexp_replace(value->>'text','\s','','g')) < 8)
       or (ocr->>'durationMs')::numeric not between 0 and least((request->>'remainingDeadlineMs')::integer,(request->'allocation'->>'maxWallTimeMs')::integer)
       or jsonb_typeof(ocr->'durationMs') is distinct from 'number' or jsonb_typeof(ocr->'measuredWallTimeMs') is distinct from 'number'
       or (ocr->>'measuredWallTimeMs')::numeric not between 0 and least((request->>'remainingDeadlineMs')::integer,(request->'allocation'->>'maxWallTimeMs')::integer)
       or ocr->'cost' is distinct from jsonb_build_object('apiFeeMicros',0,'compute',jsonb_build_object('status','unknown','valueMicros',null,'reason','host_rate_unavailable'),'boundedAllocation',request->'allocation','attempts',1)
       or not private.evidence_keys(ocr->'provider',array['name','executionMode','executionLocation','physicalRegion','versions'])
       or ocr->'provider'->>'name' is distinct from 'tesseract'
       or ocr->'provider'->>'executionMode' is distinct from 'self_hosted'
       or ocr->'provider'->>'executionLocation' is distinct from 'local_host'
       or ocr->'provider'->'physicalRegion' is distinct from '{"value":null,"reason":"not_verified"}'::jsonb
       or not private.evidence_keys(ocr->'provider'->'versions',array['engine','renderer','languageData']) then raise exception 'Invalid OCR request binding' using errcode = '22023'; end if;
    perform (request->>'attemptId')::uuid, (request->>'createdAt')::timestamptz;
    if jsonb_typeof(request->'attemptId') is distinct from 'string' or jsonb_typeof(request->'createdAt') is distinct from 'string' or request->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T.*Z$' or jsonb_typeof(request->'retentionPolicyId') is distinct from 'string' or request->>'retentionPolicyId' !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$' or exists(select 1 from jsonb_each(ocr->'provider'->'versions') where jsonb_typeof(value) is distinct from 'string' or char_length(value #>> '{}') not between 1 and 100) or jsonb_array_length(ocr->'pages') > (request->'allocation'->>'maxPages')::integer or jsonb_array_length(graph->'pages') > (request->'limits'->>'maxPages')::integer then raise exception 'Invalid OCR bounds' using errcode = '22023'; end if;
    resource := ocr->'resourceUsage';
    if resource is not null and (not private.evidence_keys(resource - 'containerMemoryPeak',array['kind','cpuTimeMs','maxChildRssBytes','rendererCalls','recognitionCalls']) or resource->>'kind' is distinct from 'child_process_rusage' or not private.evidence_number(resource->'cpuTimeMs',0,30000) or not private.evidence_integer(resource->'maxChildRssBytes',1,1073741824) or not private.evidence_integer(resource->'rendererCalls',1,10) or not private.evidence_integer(resource->'recognitionCalls',1,10) or (resource->>'rendererCalls')::integer <> jsonb_array_length(ocr->'pages') or (resource->>'recognitionCalls')::integer <> jsonb_array_length(ocr->'pages')) then raise exception 'Invalid OCR resource receipt' using errcode = '22023'; end if;
    if resource ? 'containerMemoryPeak' then
      word := resource->'containerMemoryPeak';
      if not private.evidence_keys(word,array['kind','measuredThrough','valueBytes','reason']) or word->>'kind' is distinct from 'cgroup_v2_memory_peak' or word->>'measuredThrough' is distinct from 'recognition_complete' or not coalesce(((private.evidence_integer(word->'valueBytes',1,9007199254740991) and word->'reason'='null'::jsonb) or (word->'valueBytes'='null'::jsonb and word->>'reason' in ('cgroup_scope_unverified','cgroup_peak_invalid','cgroup_files_unavailable'))),false) then raise exception 'Invalid OCR memory receipt' using errcode = '22023'; end if;
    end if;
    n := 0;
    for page in select value from jsonb_array_elements(ocr->'pages') loop
      if not private.evidence_keys(page,array['pageNumber','pageId','imageSha256','widthPixels','heightPixels','rotation','text','words','dimensionUnit','method'])
         or page->>'pageId' is distinct from 'page-' || (page->>'pageNumber')
         or request->'selectedPages'->n is distinct from jsonb_build_object('pageId',page->'pageId','pageNumber',page->'pageNumber')
         or (page->>'pageNumber')::integer not between 1 and jsonb_array_length(graph->'pages')
         or not private.evidence_integer(page->'pageNumber',1,20) or not private.evidence_integer(page->'widthPixels',1,10000000) or not private.evidence_integer(page->'heightPixels',1,10000000) or not private.evidence_integer(page->'rotation',0,359)
         or jsonb_typeof(page->'imageSha256') is distinct from 'string'
         or page->>'imageSha256' !~ '^[a-f0-9]{64}$'
         or (page->>'widthPixels')::integer <= 0 or (page->>'heightPixels')::integer <= 0
         or (page->>'widthPixels')::bigint * (page->>'heightPixels')::bigint > 10000000
         or (page->>'rotation')::integer not between 0 and 359
         or page->>'dimensionUnit' is distinct from 'pixel' or page->>'method' is distinct from 'local_ocr'
         or jsonb_typeof(page->'text') is distinct from 'string'
         or char_length(page->>'text') > 200000
         or jsonb_typeof(page->'words') is distinct from 'array' or jsonb_array_length(page->'words') > 10000 then raise exception 'Invalid OCR page' using errcode = '22023'; end if;
      n := n + 1; cursor := 0;
      for word in select value from jsonb_array_elements(page->'words') loop
        box := word->'box';
        if not private.evidence_keys(word,array['text','start','end','box','confidence'])
           or jsonb_typeof(word->'text') is distinct from 'string' or jsonb_typeof(word->'start') is distinct from 'number' or jsonb_typeof(word->'end') is distinct from 'number'
           or not private.evidence_integer(word->'start',0,200000) or not private.evidence_integer(word->'end',1,200000)
           or word->>'text' !~ '^\S+$' or (word->>'start')::integer < cursor
           or (word->>'end')::integer <= (word->>'start')::integer
           or (word->>'end')::integer > char_length(page->>'text')
           or substring(page->>'text' from cursor+1 for (word->>'start')::integer-cursor) ~ '\S'
           or word->>'text' is distinct from substring(page->>'text' from (word->>'start')::integer+1 for (word->>'end')::integer-(word->>'start')::integer)
           or not private.evidence_keys(box,array['x','y','width','height'])
           or jsonb_typeof(box->'x') is distinct from 'number' or jsonb_typeof(box->'y') is distinct from 'number' or jsonb_typeof(box->'width') is distinct from 'number' or jsonb_typeof(box->'height') is distinct from 'number'
           or (box->>'x')::numeric not between 0 and 1 or (box->>'y')::numeric not between 0 and 1
           or (box->>'width')::numeric <= 0 or (box->>'height')::numeric <= 0
           or (box->>'x')::numeric+(box->>'width')::numeric > 1 or (box->>'y')::numeric+(box->>'height')::numeric > 1
           or not private.evidence_keys(word->'confidence',array['kind','scale','value'])
           or word->'confidence'->>'kind' is distinct from 'uncalibrated'
           or word->'confidence'->>'scale' is distinct from 'tesseract_0_100'
           or jsonb_typeof(word->'confidence'->'value') is distinct from 'number'
           or (word->'confidence'->>'value')::numeric not between 0 and 100 then raise exception 'Ungrounded OCR word' using errcode = '22023'; end if;
        cursor := (word->>'end')::integer;
      end loop;
      if substring(page->>'text' from cursor+1) ~ '\S' then raise exception 'OCR word coverage mismatch' using errcode = '22023'; end if;
    end loop;
    if (select count(distinct value->>'pageId') from jsonb_array_elements(ocr->'pages')) <> n then raise exception 'Duplicate OCR pages' using errcode = '22023'; end if;
    if (select sum(char_length(value->>'text')) + (count(*)-1)*2 from jsonb_array_elements(graph->'pages')) + (select sum(char_length(value->>'text')) + (count(*)-1)*2 from jsonb_array_elements(ocr->'pages')) > (request->'limits'->>'maxCharacters')::integer then raise exception 'OCR source text limit' using errcode = '22023'; end if;
    if ocr->>'status' is distinct from (case when exists(select 1 from jsonb_array_elements(ocr->'pages') where value->>'text' ~ '\S') then 'review_required' else 'insufficient' end) then raise exception 'OCR status contradicts pages' using errcode = '22023'; end if;
  end if;
  if p_envelope->'ocrFailure' <> 'null'::jsonb and (ocr <> 'null'::jsonb or not private.evidence_keys(p_envelope->'ocrFailure',array['code']) or p_envelope->'ocrFailure'->>'code' not in ('unsupported','timeout','cancelled','resource_limit','engine_failure','invalid_request','invalid_output')) then raise exception 'Invalid OCR failure' using errcode = '22023'; end if;
  if jsonb_array_length(p_envelope->'fields') <> 8 or (select count(distinct value->>'field') from jsonb_array_elements(p_envelope->'fields') where value->>'field' in ('name','email','phone','employer','role','dates','education','certification')) <> 8 then raise exception 'Invalid field states' using errcode = '22023'; end if;
  for field_state in select value from jsonb_array_elements(p_envelope->'fields') loop
    if not private.evidence_keys(field_state,array['field','state']) or field_state->>'state' not in ('not_evaluated','review_required','conflict') then raise exception 'Invalid field state' using errcode = '22023'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_envelope->'blockers') b where b.value #>> '{}' not in ('uncalibrated_confidence','missing_critical_fields','conflicting_critical_fields','missing_ocr_pages','ocr_failure','no_text')) or not p_envelope->'blockers' @> '["uncalibrated_confidence"]'::jsonb then raise exception 'Invalid evidence blockers' using errcode = '22023'; end if;
  for span in select value from jsonb_array_elements(p_envelope->'spans') loop
    if not private.evidence_keys(span,array['id','pageId','method','text','start','end','box','confidence'])
       or jsonb_typeof(span->'id') is distinct from 'string' or char_length(span->>'id') not between 1 and 100
       or jsonb_typeof(span->'text') is distinct from 'string'
       or jsonb_typeof(span->'start') is distinct from 'number' or jsonb_typeof(span->'end') is distinct from 'number'
       or not private.evidence_integer(span->'start',0,200000) or not private.evidence_integer(span->'end',0,200000) or char_length(span->>'text') > 200000
       or span->'confidence'->>'kind' is distinct from 'uncalibrated'
       or not private.evidence_keys(span->'confidence',array['kind','value']) then raise exception 'Invalid evidence span' using errcode = '22023'; end if;
    if span->>'method' = 'native_text' then
      select value into source_span from jsonb_array_elements(graph->'spans') where value->>'pageId' = span->>'pageId' and value->'start' = span->'start' and value->'end' = span->'end' and value->'text' = span->'text';
      if source_span is null or span->'box' <> 'null'::jsonb or span->'confidence'->'value' <> 'null'::jsonb then raise exception 'Ungrounded native envelope span' using errcode = '22023'; end if;
    elsif span->>'method' = 'local_ocr' then
      select value into source_page from jsonb_array_elements(ocr->'pages') where value->>'pageId' = span->>'pageId';
      if source_page is null or (span->>'start')::integer < 0 or (span->>'end')::integer < (span->>'start')::integer or (span->>'end')::integer > char_length(source_page->>'text') or span->>'text' is distinct from substring(source_page->>'text' from (span->>'start')::integer+1 for (span->>'end')::integer-(span->>'start')::integer) or span->'confidence'->'value' <> 'null'::jsonb then raise exception 'Ungrounded OCR envelope span' using errcode = '22023'; end if;
      select min((value->'box'->>'x')::numeric),min((value->'box'->>'y')::numeric),max((value->'box'->>'x')::numeric+(value->'box'->>'width')::numeric),max((value->'box'->>'y')::numeric+(value->'box'->>'height')::numeric) into left_edge,top_edge,right_edge,bottom_edge from jsonb_array_elements(source_page->'words') where (value->>'start')::integer >= (span->>'start')::integer and (value->>'end')::integer <= (span->>'end')::integer;
      box := span->'box';
      if left_edge is null then
        if box <> 'null'::jsonb then raise exception 'Fabricated OCR geometry' using errcode = '22023'; end if;
      elsif not private.evidence_keys(box,array['x','y','width','height']) or not private.evidence_number(box->'x',0,1) or not private.evidence_number(box->'y',0,1) or not private.evidence_number(box->'width',0,1) or (box->>'width')::numeric <= 0 or not private.evidence_number(box->'height',0,1) or (box->>'height')::numeric <= 0 or abs((box->>'x')::numeric-left_edge)>0.000000000001 or abs((box->>'y')::numeric-top_edge)>0.000000000001 or abs((box->>'width')::numeric-(right_edge-left_edge))>0.000000000001 or abs((box->>'height')::numeric-(bottom_edge-top_edge))>0.000000000001 then raise exception 'Fabricated OCR geometry' using errcode = '22023'; end if;
    else
      raise exception 'Invalid extraction method' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_envelope->'spans')) <> jsonb_array_length(p_envelope->'spans') then raise exception 'Duplicate evidence spans' using errcode = '22023'; end if;
  -- Require the complete deterministic source projection, including empty
  -- lines; a caller cannot omit inconvenient native/OCR source text.
  for source_span in select value from jsonb_array_elements(graph->'spans') loop
    if not exists(select 1 from jsonb_array_elements(p_envelope->'spans') where value->>'id' = 'native-' || (source_span->>'id') and value->>'method' = 'native_text' and value->'text' = source_span->'text' and value->'start' = source_span->'start' and value->'end' = source_span->'end' and value->'pageId' = source_span->'pageId') then raise exception 'Native projection incomplete' using errcode = '22023'; end if;
  end loop;
  n := jsonb_array_length(graph->'spans');
  if ocr <> 'null'::jsonb then
    for page in select value from jsonb_array_elements(ocr->'pages') loop
      cursor := 0; line_number := 0;
      for line in select regexp_split_to_table(page->>'text', E'\n') loop
        line_number := line_number + 1; n := n + 1;
        if not exists(select 1 from jsonb_array_elements(p_envelope->'spans') where value->>'id' = 'ocr-' || (page->>'pageId') || '-line-' || line_number and value->>'method' = 'local_ocr' and value->>'text' = line and value->>'start' = cursor::text and value->>'end' = (cursor+char_length(line))::text and value->>'pageId' = page->>'pageId') then raise exception 'OCR projection incomplete' using errcode = '22023'; end if;
        cursor := cursor + char_length(line) + 1;
      end loop;
    end loop;
  end if;
  if jsonb_array_length(p_envelope->'spans') <> n then raise exception 'Evidence projection has extra spans' using errcode = '22023'; end if;
  for candidate in select value from jsonb_array_elements(p_envelope->'assertions') loop
    if not private.evidence_keys(candidate,array['id','field','value','evidence','state','confidence'])
       or jsonb_typeof(candidate->'id') is distinct from 'string' or char_length(candidate->>'id') not between 1 and 100
       or jsonb_typeof(candidate->'value') is distinct from 'string' or char_length(candidate->>'value') not between 1 and 500
       or candidate->>'field' not in ('name','email','phone','employer','role','dates','education','certification')
       or candidate->>'state' is distinct from 'review_required'
       or candidate->'confidence' is distinct from '{"kind":"uncalibrated","value":null}'::jsonb
       or jsonb_typeof(candidate->'evidence') is distinct from 'array' or jsonb_array_length(candidate->'evidence') not between 1 and 20 then raise exception 'Invalid evidence assertion' using errcode = '22023'; end if;
    assembled := '';
    for ref in select value from jsonb_array_elements(candidate->'evidence') loop
      select value into source_span from jsonb_array_elements(p_envelope->'spans') where value->>'id' = ref->>'spanId';
      if source_span is null or not private.evidence_keys(ref,array['spanId','start','end']) or not private.evidence_integer(ref->'start',0,200000) or not private.evidence_integer(ref->'end',1,200000) or (ref->>'end')::integer <= (ref->>'start')::integer or (ref->>'end')::integer > char_length(source_span->>'text') then raise exception 'Invalid assertion reference' using errcode = '22023'; end if;
      assembled := assembled || substring(source_span->>'text' from (ref->>'start')::integer+1 for (ref->>'end')::integer-(ref->>'start')::integer);
    end loop;
    if candidate->>'value' is distinct from assembled then raise exception 'Ungrounded evidence assertion' using errcode = '22023'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_envelope->'assertions')) <> jsonb_array_length(p_envelope->'assertions') then raise exception 'Duplicate assertion IDs' using errcode = '22023'; end if;
  for field_state in select value from jsonb_array_elements(p_envelope->'fields') loop
    select count(distinct value->>'value') into candidate_count from jsonb_array_elements(p_envelope->'assertions') where value->>'field' = field_state->>'field';
    if field_state->>'state' is distinct from (case when candidate_count=0 then 'not_evaluated' when candidate_count=1 then 'review_required' else 'conflict' end) then raise exception 'Field state contradicts candidates' using errcode = '22023'; end if;
  end loop;
  if p_envelope->>'status' is distinct from (case when p_envelope->'ocrFailure' <> 'null'::jsonb then case when p_envelope->'ocrFailure'->>'code' = 'unsupported' then 'unsupported' else 'failed' end when exists(select 1 from jsonb_array_elements(p_envelope->'spans') where btrim(value->>'text') <> '') then 'review_required' else 'insufficient' end) then raise exception 'Evidence status contradicts sources' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_envelope->'fields') where value->>'state'='not_evaluated') then expected_blockers := expected_blockers || '["missing_critical_fields"]'::jsonb; end if;
  if exists(select 1 from jsonb_array_elements(p_envelope->'fields') where value->>'state'='conflict') then expected_blockers := expected_blockers || '["conflicting_critical_fields"]'::jsonb; end if;
  if exists(select 1 from jsonb_array_elements(graph->'pages') p where char_length(regexp_replace(p.value->>'text','\s','','g')) < 8 and not exists(select 1 from jsonb_array_elements(coalesce(ocr->'pages','[]'::jsonb)) op where op.value->'pageNumber'=p.value->'pageNumber')) then expected_blockers := expected_blockers || '["missing_ocr_pages"]'::jsonb; end if;
  if p_envelope->'ocrFailure' <> 'null'::jsonb then expected_blockers := expected_blockers || '["ocr_failure"]'::jsonb; end if;
  if not exists(select 1 from jsonb_array_elements(p_envelope->'spans') where btrim(value->>'text') <> '') then expected_blockers := expected_blockers || '["no_text"]'::jsonb; end if;
  if p_envelope->'blockers' is distinct from expected_blockers then raise exception 'Blockers contradict evidence' using errcode = '22023'; end if;
  select * into prior from public.document_evidence_attempts where id = (p_envelope->>'id')::uuid;
  if found then
    if prior.analysis_id <> a.id or prior.envelope <> p_envelope then raise exception 'Evidence idempotency conflict' using errcode = '22023'; end if;
    return true;
  end if;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
  values ((p_envelope->>'id')::uuid,a.id,a.organization_id,a.owner_id,v.id,v.checksum,
    coalesce((select max(attempt_number) from public.document_evidence_attempts where analysis_id = a.id),0)+1,p_envelope);
  if a.status in ('extracting','scoring','needs_ocr') then
    update public.analyses set status = 'needs_ocr',stage_updated_at = now() where id = a.id;
    if a.status <> 'needs_ocr' then insert into public.analysis_transitions(analysis_id,from_status,to_status,process_id,request_id) values(a.id,a.status,'needs_ocr',p_process_id,p_request_id); end if;
  end if;
  return true;
end;
$$;
revoke all on function public.persist_document_evidence(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.persist_document_evidence(uuid,jsonb,text,text) to service_role;

create function public.correct_document_evidence(p_analysis_id uuid,p_attempt_id uuid,p_user_id uuid,p_expected_revision integer,p_field text,p_operation text,p_value text,p_candidate_id text,p_idempotency_key uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.analyses%rowtype; attempt public.document_evidence_attempts%rowtype;
  prior public.evidence_corrections%rowtype; candidate jsonb; revision integer; correction_id uuid;
begin
  select * into a from public.analyses where id = p_analysis_id and owner_id = p_user_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into attempt from public.document_evidence_attempts where id = p_attempt_id and analysis_id = a.id and owner_id = p_user_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into prior from public.evidence_corrections where analysis_id = a.id and idempotency_key = p_idempotency_key;
  if found then
    if prior.attempt_id = p_attempt_id and prior.actor_id = p_user_id and prior.expected_revision = p_expected_revision and prior.field = p_field and prior.operation = p_operation and prior.value = p_value and prior.candidate_id is not distinct from p_candidate_id then
      return jsonb_build_object('status','applied','revision',prior.revision,'id',prior.id,'idempotent',true);
    end if;
    return jsonb_build_object('status','conflict');
  end if;
  select coalesce(max(c.revision),0) into revision from public.evidence_corrections c where c.analysis_id = a.id;
  if attempt.attempt_number <> (select max(attempt_number) from public.document_evidence_attempts where analysis_id = a.id) or p_expected_revision is distinct from revision then return jsonb_build_object('status','conflict','revision',revision); end if;
  if p_field is null or p_field not in ('name','email','phone','employer','role','dates','education','certification') or p_operation is null or p_operation not in ('confirm','correct') or p_value is null or p_value <> btrim(p_value) or char_length(p_value) not between 1 and 2000 or p_idempotency_key is null or p_request_id is null or char_length(p_request_id) not between 1 and 100 then raise exception 'Invalid evidence correction' using errcode = '22023'; end if;
  if p_operation = 'confirm' then
    select value into candidate from jsonb_array_elements(attempt.envelope->'assertions') where value->>'id' = p_candidate_id and value->>'field' = p_field and value->>'value' = p_value;
    if candidate is null then raise exception 'Confirmation requires exact source candidate' using errcode = '22023'; end if;
  elsif p_candidate_id is not null then
    raise exception 'Corrections cannot fabricate source candidates' using errcode = '22023';
  end if;
  insert into public.evidence_corrections(attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
  values(attempt.id,a.id,a.organization_id,a.owner_id,p_user_id,revision+1,p_expected_revision,p_field,p_operation,p_value,p_candidate_id,p_idempotency_key,p_request_id) returning id into correction_id;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
  values(a.organization_id,p_user_id,'document_evidence.' || p_operation,'evidence_correction',correction_id,'success',p_request_id);
  return jsonb_build_object('status','applied','revision',revision+1,'id',correction_id,'idempotent',false);
end;
$$;
revoke all on function public.correct_document_evidence(uuid,uuid,uuid,integer,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.correct_document_evidence(uuid,uuid,uuid,integer,text,text,text,text,uuid,text) to service_role;
