-- A12 staged native source. NOT parsed, executed, activated or granted to writers.
-- Operation rows contain technical metadata only. Content versions cascade with
-- the owned analysis/source; post-revocation spend accounting remains possible.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create table private.canonical_rewrite_operations (
  owner_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  analysis_id uuid not null, operation_id uuid not null,
  source_id uuid not null, request jsonb not null, policy jsonb not null,
  binding_sha256 text not null check(binding_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'reserved' check(state in ('reserved','dispatched','saved','rejected','unknown')),
  run_id uuid not null default gen_random_uuid(), claimed_at timestamptz,
  usage jsonb, error_code text, receipt jsonb, plan_sha256 text,
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,analysis_id,operation_id), unique(run_id),
  check(state not in ('dispatched','saved','unknown') or claimed_at is not null),
  check((state='saved')=(receipt is not null))
);
create table private.canonical_rewrite_versions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  source_id uuid not null references public.resume_versions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.writer_drafts(id) on delete cascade,
  operation_id uuid not null, revision integer not null check(revision>0),
  parent_id uuid references private.canonical_rewrite_versions(id),
  result jsonb not null, receipt jsonb not null, projection_sha256 text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(draft_id,revision), unique(owner_id,analysis_id,operation_id),
  unique(id,draft_id,analysis_id,owner_id,organization_id),
  foreign key(owner_id,analysis_id,operation_id) references private.canonical_rewrite_operations(owner_id,analysis_id,operation_id)
);
create table private.canonical_rewrite_heads (
  draft_id uuid primary key references public.writer_drafts(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  source_id uuid not null references public.resume_versions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null, revision integer not null check(revision>0),
  foreign key(version_id,draft_id,analysis_id,owner_id,organization_id)
    references private.canonical_rewrite_versions(id,draft_id,analysis_id,owner_id,organization_id) on delete cascade
);
alter table private.canonical_rewrite_operations enable row level security;
alter table private.canonical_rewrite_versions enable row level security;
alter table private.canonical_rewrite_heads enable row level security;
revoke all on private.canonical_rewrite_operations,private.canonical_rewrite_versions,private.canonical_rewrite_heads from public,anon,authenticated,service_role;

create function private.canonical_rewrite_immutable() returns trigger
language plpgsql volatile set search_path='' as $cr_immutable$
begin
  -- DELETE is left to the authorized privacy/cascade lifecycle.
  raise exception 'CANONICAL_REWRITE_IMMUTABLE' using errcode='23514';
end;
$cr_immutable$;
create trigger canonical_rewrite_versions_immutable before update on private.canonical_rewrite_versions
for each row execute function private.canonical_rewrite_immutable();

create function private.canonical_rewrite_policy(p_policy jsonb) returns void
language plpgsql immutable set search_path='' as $cr_policy$
begin
  if private.evidence_keys(p_policy,array['version','sha256','promptVersion','writingSupportVersion','model']) is not true
    or p_policy->>'version' is distinct from 'canonical-rewrite-rules/1.0.0'
    or p_policy->>'sha256' is distinct from '648e65d09340f4bd0b6ef36aa9c3799b883f6d41211883a238e6c222381d536f'
    or p_policy->>'promptVersion' is distinct from 'canonical-closed-rewrite/1.0.0'
    or p_policy->>'writingSupportVersion' is distinct from 'legacy-source-transforms/1.0.4'
    or jsonb_typeof(p_policy->'model') is distinct from 'string'
    or (p_policy->>'model') collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then perform private.correction_fail('invalid'); end if;
end;
$cr_policy$;

create function private.canonical_rewrite_request(p_request jsonb) returns void
language plpgsql immutable set search_path='' as $cr_request$
declare k text;
begin
  if private.evidence_keys(p_request,array['schemaVersion','operationId','canonicalVersionId','requirementVersionId','draftId','expectedDraftUpdatedAt']) is not true
    or p_request->>'schemaVersion' is distinct from 'canonical-rewrite-request/1.0.0' then perform private.correction_fail('invalid'); end if;
  foreach k in array array['operationId','canonicalVersionId','requirementVersionId','draftId'] loop
    if private.typed_authoring_uuid(p_request->k) is not true then perform private.correction_fail('invalid'); end if;
  end loop;
  if jsonb_typeof(p_request->'expectedDraftUpdatedAt') is distinct from 'string'
    or (p_request->>'expectedDraftUpdatedAt') !~ '^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$' then perform private.correction_fail('invalid'); end if;
  perform (p_request->>'expectedDraftUpdatedAt')::timestamptz;
end;
$cr_request$;

create function private.canonical_rewrite_usage(p_usage jsonb) returns void
language plpgsql immutable set search_path='' as $cr_usage$
declare k text;
begin
  if p_usage is null or p_usage='null'::jsonb then return; end if;
  if private.evidence_keys(p_usage,array['inputTokens','outputTokens']) is not true then perform private.correction_fail('invalid'); end if;
  foreach k in array array['inputTokens','outputTokens'] loop
    if jsonb_typeof(p_usage->k) is distinct from 'string'
      or (p_usage->>k) !~ '^(0|[1-9][0-9]{0,15})$'
      or (p_usage->>k)::numeric>9007199254740991 then perform private.correction_fail('invalid'); end if;
  end loop;
end;
$cr_usage$;

-- All candidate-content paths establish the common owner mutex before rows.
-- Fresh VOLATILE privacy visibility, exact current source and current membership
-- are re-proved. Technical settle deliberately does NOT call this helper.
create function private.canonical_rewrite_owner(p_user_id uuid,p_analysis_id uuid) returns public.analyses
language plpgsql volatile security definer set search_path='' as $cr_owner$
declare a public.analyses%rowtype; root_id uuid;
begin
  select x.* into strict a from public.analyses x where x.id=p_analysis_id and x.owner_id=p_user_id;
  perform private.lock_candidate_owners(array[p_user_id]);
  if private.try_candidate_privacy_write(p_user_id) is not true then perform private.correction_fail('not_found'); end if;
  select r.id into strict root_id from public.resumes r join public.resume_versions s on s.resume_id=r.id
    where s.id=a.resume_version_id and r.owner_id=p_user_id and r.organization_id=a.organization_id and r.status='active' for update of r;
  select x.* into strict a from public.analyses x where x.id=p_analysis_id and x.owner_id=p_user_id for update;
  perform 1 from public.resume_versions s where s.id=a.resume_version_id and s.resume_id=root_id and s.owner_id=p_user_id and s.organization_id=a.organization_id for share;
  if not found then perform private.correction_fail('not_found'); end if;
  perform 1 from public.memberships m where m.user_id=p_user_id and m.organization_id=a.organization_id and m.role in ('owner','admin','member') for share;
  if not found then perform private.correction_fail('not_found'); end if;
  perform 1 from public.jobs j where j.id=a.job_id and j.owner_id=p_user_id and j.organization_id=a.organization_id for share;
  if not found then perform private.correction_fail('not_found'); end if;
  return a;
end;
$cr_owner$;

-- Rewrite-only counterpart of frozen job-duration-subject-rules/1.0.0.
-- It derives temporary clause expressions from the immutable admitted document;
-- persisted JD clauses and old A11/coverage policies are never modified.
create function private.canonical_rewrite_effective_clauses(p_doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $cr_effective$
declare tokens jsonb; selected jsonb; clause jsonb; dur jsonb; tok jsonb; prior_tok jsonb;
  members jsonb; operators jsonb; result_value jsonb:='[]'; expression_value jsonb;
  prefix text; suffix text; cue text; between_text text; word text; op text;
  each_value boolean; either_value boolean; bad boolean; start_value integer; finish_value integer;
  work integer:=char_length(p_doc->>'sourceText'); operand_count integer:=0; n integer;
begin
  if octet_length(p_doc::text)>1048576 or p_doc->>'locale' is distinct from 'en-IN'
    or p_doc->>'domain' is distinct from 'software-engineering' or p_doc->>'state'='unsupported' then return '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('evidence',x.evidence,'requirementIds',x.ids) order by x.start_value,x.end_value),'[]') into tokens
    from (select min(t.value::text)::jsonb evidence,(t.value->>'start')::integer start_value,(t.value->>'end')::integer end_value,
      to_jsonb(array_agg(distinct item.value->>'id')) ids
      from jsonb_array_elements(p_doc->'requirements') item(value)
      cross join lateral jsonb_array_elements(item.value->'tokenEvidence') t(value)
      where item.value->>'type'='skill' group by (t.value->>'start')::integer,(t.value->>'end')::integer) x;
  work:=work+jsonb_array_length(p_doc->'requirements')+(select coalesce(sum(jsonb_array_length(value->'tokenEvidence')),0)::integer from jsonb_array_elements(p_doc->'requirements'));
  for clause in select value from jsonb_array_elements(p_doc->'relations'->'clauses') loop
    work:=work+1;
    if work>500000 then perform private.correction_fail('unavailable'); end if;
    if clause->'scope'->'negated' is distinct from 'false'::jsonb then continue; end if;
    if clause->'skillExpression'->>'kind'<>'unknown' then result_value:=result_value||jsonb_build_array(clause);continue; end if;
    dur:=clause->'duration';
    if dur->>'kind' in ('unknown','not_stated') or dur->'evidence' is null or dur->'evidence'='null'::jsonb
      or jsonb_array_length(dur->'candidateEvidence')<>1
      or (dur->'evidence'->>'start')::integer<(clause->'evidence'->>'start')::integer
      or (dur->'evidence'->>'end')::integer>(clause->'evidence'->>'end')::integer then continue; end if;
    cue:=translate(private.jd_relation_trim(regexp_replace(substring(p_doc->>'sourceText' from (clause->'evidence'->>'start')::integer+1
      for (dur->'evidence'->>'start')::integer-(clause->'evidence'->>'start')::integer),E'[\\t ]+',' ','g')),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
    if cue not in ('','must have','requires','required:') then continue; end if;
    work:=work+jsonb_array_length(tokens);
    if work>500000 then perform private.correction_fail('unavailable'); end if;
    select coalesce(jsonb_agg(t.value order by (t.value->'evidence'->>'start')::integer,(t.value->'evidence'->>'end')::integer),'[]') into selected
      from jsonb_array_elements(tokens) t(value)
      where (t.value->'evidence'->>'start')::integer>=(dur->'evidence'->>'end')::integer
        and (t.value->'evidence'->>'end')::integer<=(clause->'evidence'->>'end')::integer
        and exists(select 1 from jsonb_array_elements_text(t.value->'requirementIds') r(id) where clause->'skillExpression'->'observedRequirementIds' ? r.id);
    n:=jsonb_array_length(selected);if n<1 or n>32 then continue; end if;
    prefix:=translate(private.jd_relation_trim(regexp_replace(substring(p_doc->>'sourceText' from (dur->'evidence'->>'end')::integer+1
      for (selected->0->'evidence'->>'start')::integer-(dur->'evidence'->>'end')::integer),E'[\\t ]+',' ','g')),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
    suffix:=translate(private.jd_relation_trim(regexp_replace(substring(p_doc->>'sourceText' from (selected->(n-1)->'evidence'->>'end')::integer+1
      for (clause->'evidence'->>'end')::integer-(selected->(n-1)->'evidence'->>'end')::integer),E'[\\t ]+',' ','g')),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
    suffix:=private.jd_relation_trim(regexp_replace(private.jd_relation_trim(regexp_replace(suffix,'[.]$','')),'(^| )(is required|required|preferred|mandatory|essential|optional)$',''));
    each_value:=false;either_value:=false;
    if prefix ~ '(^| )either$' then either_value:=true;prefix:=private.jd_relation_trim(regexp_replace(prefix,'(^| )either$',''));
    elsif prefix ~ '(^| )each of$' then each_value:=true;prefix:=private.jd_relation_trim(regexp_replace(prefix,'(^| )each of$',''));end if;
    if suffix ~ '(^| )each$' then each_value:=true;suffix:=private.jd_relation_trim(regexp_replace(suffix,'(^| )each$',''));end if;
    if not ((prefix='of' and suffix='experience') or (prefix in ('of experience with','of experience in') and suffix=''))
      or (each_value and either_value) then continue; end if;
    members:='[]';operators:='[]';op:=null;prior_tok:=null;bad:=false;
    for tok in select value from jsonb_array_elements(selected) loop
      if prior_tok is not null then
        work:=work+1;
        start_value:=(prior_tok->'evidence'->>'end')::integer;finish_value:=(tok->'evidence'->>'start')::integer;
        if start_value>finish_value then bad:=true;exit;end if;
        between_text:=substring(p_doc->>'sourceText' from start_value+1 for finish_value-start_value);
        if between_text collate "C" !~* E'^[\\t ]*(and|or)[\\t ]*$' then bad:=true;exit;end if;
        word:=translate(private.jd_relation_trim(between_text),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
        if op is not null and op<>word then bad:=true;exit;end if;op:=word;
        start_value:=start_value+char_length(between_text)-char_length(ltrim(between_text,E' \t'));
        operators:=operators||jsonb_build_array(jsonb_build_object('spanId','jd-'||start_value||'-'||(start_value+char_length(word)),
          'start',start_value,'end',start_value+char_length(word),'quote',substring(p_doc->>'sourceText' from start_value+1 for char_length(word))));
      end if;
      prior_tok:=tok;
    end loop;
    if bad or (n=1 and (each_value or either_value)) or (n>1 and ((op='or' and (not either_value or each_value)) or (op='and' and (not each_value or either_value)))) then continue;end if;
    for tok in select value from jsonb_array_elements(selected) loop
      operand_count:=operand_count+1;work:=work+1;
      if operand_count>1024 or work>500000 then perform private.correction_fail('unavailable');end if;
      members:=members||jsonb_build_array(jsonb_build_object('kind','atom','value',tok->'evidence'->'quote','evidence',tok->'evidence',
        'requirementIds',(select coalesce(jsonb_agg(id),'[]') from jsonb_array_elements_text(tok->'requirementIds') r(id) where clause->'skillExpression'->'observedRequirementIds' ? r.id),
        'mapping',private.jd_relation_alias(tok->'evidence'->>'quote')));
    end loop;
    if n=1 then expression_value:=members->0;
    else
      start_value:=(selected->0->'evidence'->>'start')::integer;finish_value:=(selected->(n-1)->'evidence'->>'end')::integer;
      expression_value:=jsonb_build_object('kind',case when op='or' then 'any_of' else 'all_of' end,'operands',members,'operatorEvidence',operators,
        'evidence',jsonb_build_object('spanId','jd-'||start_value||'-'||finish_value,'start',start_value,'end',finish_value,'quote',substring(p_doc->>'sourceText' from start_value+1 for finish_value-start_value)));
    end if;
    result_value:=result_value||jsonb_build_array(clause||jsonb_build_object('skillExpression',expression_value));
  end loop;
  if octet_length(result_value::text)>1048576 then perform private.correction_fail('unavailable');end if;
  return result_value;
end;
$cr_effective$;

-- Native manifest derives only whole current confirmed contributions. Clause
-- order and fact order are the stored immutable array order. A failed closed
-- support check excludes that pair; infrastructure failures are never swallowed.
create function private.canonical_rewrite_sources(p_context jsonb) returns jsonb
language plpgsql immutable set search_path='' as $cr_sources$
declare f jsonb; clause jsonb; loc jsonb; cite jsonb; sp jsonb; cites jsonb; ids jsonb;
  items jsonb:='[]'; basis text; seen text[]; eligible boolean; effective_context jsonb; declared integer; populated integer;
begin
  if private.evidence_integer(p_context->'sourceMetadata'->'pageCount',1,2147483647) is not true then return '[]';end if;
  declared:=(p_context->'sourceMetadata'->>'pageCount')::integer;
  select count(*) into populated from jsonb_array_elements(p_context->'attempt'->'envelope'->'nativeSource'->'pages') page(value)
    where exists(select 1 from jsonb_array_elements(p_context->'attempt'->'envelope'->'spans') sp(value) where sp.value->>'pageId'=page.value->>'id' and private.grouped_import_trim(sp.value->>'text')<>'')
      or exists(select 1 from jsonb_array_elements(coalesce(p_context->'attempt'->'envelope'->'ocrSource'->'pages','[]'::jsonb)) op(value) where op.value->'pageNumber'=page.value->'pageNumber' and private.grouped_import_trim(op.value->>'text')<>'');
  if populated<>declared or jsonb_array_length(p_context->'attempt'->'envelope'->'nativeSource'->'pages')>declared then return '[]';end if;
  effective_context:=jsonb_set(p_context,'{requirements,content,relations,clauses}',private.canonical_rewrite_effective_clauses(p_context->'requirements'->'content'));
  for f in select value from jsonb_array_elements(p_context->'canonical'->'content'->'facts') loop
    exit when jsonb_array_length(items)=32;
    if f->>'type' is distinct from 'contribution' or f->>'state' is distinct from 'candidate_confirmed'
      or f->'confirmation'->>'actorId' is distinct from p_context->'source'->>'ownerId'
      or f->'confirmation'->>'value' is distinct from f->>'value'
      or jsonb_typeof(f->'confirmation'->'confirmedAt') is distinct from 'string'
      or private.grouped_import_utf16_length(f->>'value') not between 1 and 2000
      or (f->>'value') collate "C" !~ E'^(Built|Created|Developed|built|created|developed)[\\t ]' then continue; end if;
    loc:=private.correction_location(p_context->'canonical'->'content',(f->>'id')::uuid);
    if jsonb_array_length(loc)<>1 or loc->0->>'kind' not in ('entry','bullet') then continue; end if;
    cites:='[]';seen:='{}';eligible:=true;
    for cite in select value from jsonb_array_elements(f->'sources') loop
      select value into sp from jsonb_array_elements(p_context->'attempt'->'envelope'->'spans') where value->>'id'=cite->>'spanId';
      if sp is null or cite->>'attemptId' is distinct from p_context->'source'->>'attemptId'
        or cite::text=any(seen) or (cite->>'start')::integer<0 or (cite->>'end')::integer>char_length(sp->>'text')
        or convert_to(substring(sp->>'text' from (cite->>'start')::integer+1 for (cite->>'end')::integer-(cite->>'start')::integer),'UTF8') is distinct from convert_to(f->>'value','UTF8') then eligible:=false;exit; end if;
      seen:=array_append(seen,cite::text);
      cites:=cites||jsonb_build_array(cite||jsonb_build_object('pageId',sp->>'pageId','method',sp->>'method','pageStart',(sp->>'start')::integer+(cite->>'start')::integer,'pageEnd',(sp->>'start')::integer+(cite->>'end')::integer));
    end loop;
    if not eligible or jsonb_array_length(cites)>20 then continue; end if;
    basis:=case when f->'sources'='[]'::jsonb then 'candidate_declaration' else 'source_quote' end;ids:='[]';
    for clause in select value from jsonb_array_elements(effective_context->'requirements'->'content'->'relations'->'clauses') loop
      begin
        if basis='candidate_declaration' then perform private.typed_authoring_declaration_support(effective_context,f,clause->>'id');
        else perform private.typed_authoring_support(effective_context,f,clause->>'id'); end if;
        ids:=ids||jsonb_build_array(clause->>'id');
      exception when invalid_parameter_value then null;
      end;
    end loop;
    if jsonb_array_length(ids)=0 then continue; end if;
    items:=items||jsonb_build_array(jsonb_build_object('sourceId',jsonb_array_length(items),'factId',f->>'id','valueSha256',private.typed_authoring_sha256(f->>'value'),
      'location',jsonb_build_object('sectionId',loc->0->'sectionId','entryId',loc->0->'entryId','bulletId',loc->0->'bulletId'),
      'confirmation',f->'confirmation','basis',basis,'currentCitations',cites,'clauseIds',ids,
      'authoringVersion',case when basis='source_quote' then 'typed-authoring-rules/1.0.0' else 'typed-authoring-rules/1.1.0' end));
  end loop;
  return items;
end;
$cr_sources$;

create function private.canonical_rewrite_binding(p_context jsonb,p_draft jsonb,p_policy jsonb) returns jsonb
language sql immutable set search_path='' as $cr_binding$
  select jsonb_build_object('authoring',jsonb_build_object('source',p_context->'source','canonical',p_context->'canonical'-'content'-'locale',
    'requirements',p_context->'requirements'-'content','heads',p_context->'heads',
    'profilesSha256','f1aa440e764197f8aab96ddb9bf5c84dbdfdf177ff04063f15e6c4ccff78df62'),'draft',p_draft,'policy',p_policy);
$cr_binding$;

create function private.canonical_rewrite_projection(p_projection jsonb) returns void
language plpgsql immutable set search_path='' as $cr_projection$
declare b jsonb;
begin
  if private.evidence_keys(p_projection,array['summary','bullets']) is not true
    or (p_projection->'summary'<>'null'::jsonb and (jsonb_typeof(p_projection->'summary') is distinct from 'string'
      or private.grouped_import_utf16_length(p_projection->>'summary') not between 1 and 1200))
    or jsonb_typeof(p_projection->'bullets') is distinct from 'array' or jsonb_array_length(p_projection->'bullets')>4 then perform private.correction_fail('invalid'); end if;
  for b in select value from jsonb_array_elements(p_projection->'bullets') loop
    if private.evidence_keys(b,array['original','rewrite','reasoning']) is not true
      or jsonb_typeof(b->'original') is distinct from 'string' or private.grouped_import_utf16_length(b->>'original') not between 1 and 500
      or jsonb_typeof(b->'rewrite') is distinct from 'string' or private.grouped_import_utf16_length(b->>'rewrite') not between 1 and 700
      or jsonb_typeof(b->'reasoning') is distinct from 'string' or private.grouped_import_utf16_length(b->>'reasoning') not between 1 and 500 then perform private.correction_fail('invalid'); end if;
  end loop;
end;
$cr_projection$;

create function private.canonical_rewrite_consent(p_user_id uuid,p_org_id uuid) returns void
language plpgsql volatile set search_path='' as $cr_consent$
begin
  perform 1 from public.consents where user_id=p_user_id
    and purpose='qualitative_ai' and policy_version='candidate-ai-v1' for share;
  if not found then perform private.correction_fail('not_found'); end if;
end;
$cr_consent$;

-- Returns publication only through an owned immutable version, never operation
-- metadata pretending to be candidate content. Original input binding is retained.
create function private.canonical_rewrite_operation(p_op private.canonical_rewrite_operations,p_dispatch boolean) returns jsonb
language plpgsql stable set search_path='' as $cr_operation$
declare publication jsonb; v private.canonical_rewrite_versions%rowtype;
begin
  if p_op.state='saved' then
    select * into strict v from private.canonical_rewrite_versions where owner_id=p_op.owner_id and analysis_id=p_op.analysis_id and operation_id=p_op.operation_id;
    if v.receipt is distinct from p_op.receipt or v.organization_id is distinct from p_op.organization_id or v.source_id is distinct from p_op.source_id
      or (v.receipt->>'operationId',v.receipt->>'bindingSha256',v.receipt->>'runId',v.receipt->>'draftId',v.receipt->>'draftVersionId',v.receipt->>'revision',v.receipt->>'projectionSha256')
        is distinct from (p_op.operation_id::text,p_op.binding_sha256,p_op.run_id::text,v.draft_id::text,v.id::text,v.revision::text,v.projection_sha256)
      or v.receipt->>'resultSha256' is distinct from private.typed_authoring_sha256(v.result::text)
      or v.result->'binding'->'policy' is distinct from p_op.policy or v.result->>'operationId' is distinct from p_op.operation_id::text
      or v.result->>'bindingSha256' is distinct from p_op.binding_sha256
      or (v.result->'binding'->'authoring'->'source'->>'ownerId',v.result->'binding'->'authoring'->'source'->>'analysisId')
        is distinct from (p_op.owner_id::text,p_op.analysis_id::text) then perform private.correction_fail('unavailable'); end if;
    publication:=jsonb_build_object('result',v.result,'receipt',v.receipt||jsonb_build_object('idempotent',true));
  end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-operation/1.0.0','operationId',p_op.operation_id,
    'ownerId',p_op.owner_id,'analysisId',p_op.analysis_id,'request',p_op.request,'policy',p_op.policy,'bindingSha256',p_op.binding_sha256,
    'state',p_op.state,'dispatchAllowed',p_dispatch,'publication',publication);
end;
$cr_operation$;

create function public.read_canonical_rewrite_context(p_user_id uuid,p_analysis_id uuid,p_selection jsonb,p_policy jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_read$
declare a public.analyses%rowtype; context jsonb; d public.writer_drafts%rowtype; h private.canonical_rewrite_heads%rowtype;
  v private.canonical_rewrite_versions%rowtype; draft jsonb; binding jsonb; sources jsonb; saved jsonb; readiness jsonb; publication jsonb;
begin
  perform private.canonical_rewrite_policy(p_policy);
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  readiness:=public.read_canonical_rewrite_readiness();
  if readiness->'schemaReady' is distinct from 'true'::jsonb then perform private.correction_fail('unavailable'); end if;
  context:=public.read_requirement_relationship_context(p_user_id,p_analysis_id,p_selection);
  if context->>'status' is distinct from 'available' or context->'source'->>'ownerId' is distinct from p_user_id::text
    or context->'source'->>'analysisId' is distinct from p_analysis_id::text then perform private.correction_fail('not_found'); end if;
  select * into strict d from public.writer_drafts where analysis_id=p_analysis_id and owner_id=p_user_id and organization_id=a.organization_id and kind='summary' for update;
  perform private.canonical_rewrite_projection(d.draft);
  select * into h from private.canonical_rewrite_heads where draft_id=d.id and owner_id=p_user_id and analysis_id=p_analysis_id for update;
  if found then
    select * into strict v from private.canonical_rewrite_versions where id=h.version_id and draft_id=d.id and owner_id=p_user_id and analysis_id=p_analysis_id;
    if (v.source_id,v.organization_id,v.revision) is distinct from (h.source_id,h.organization_id,h.revision)
      or (v.result->'binding'->'authoring'->'source'->>'ownerId',v.result->'binding'->'authoring'->'source'->>'analysisId',v.result->'binding'->'authoring'->'source'->>'sourceId',v.result->'binding'->'authoring'->'source'->>'organizationId')
        is distinct from (p_user_id::text,p_analysis_id::text,v.source_id::text,a.organization_id::text)
      or (v.receipt->>'draftVersionId',v.receipt->>'draftId',v.receipt->>'revision') is distinct from (v.id::text,d.id::text,v.revision::text)
      or v.receipt->>'resultSha256' is distinct from private.typed_authoring_sha256(v.result::text) then perform private.correction_fail('unavailable'); end if;
  end if;
  draft:=jsonb_build_object('id',d.id,'updatedAt',to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'contentSha256',private.typed_authoring_sha256(d.draft::text),'versionId',h.version_id,'revision',coalesce(h.revision,0),'headId',h.version_id);
  sources:=private.canonical_rewrite_sources(context);
  binding:=private.canonical_rewrite_binding(context,draft,p_policy);
  if v.id is null or v.projection_sha256 is distinct from private.typed_authoring_sha256(d.draft::text) then
    saved:=jsonb_build_object('state','legacy_unbound','publication',null,'legacyDraft',d.draft);
  else
    publication:=jsonb_build_object('result',v.result,'receipt',v.receipt);
    saved:=jsonb_build_object('state',case when v.result->'binding'->'authoring'=binding->'authoring' and v.result->'binding'->'policy'=p_policy
      and v.receipt->>'draftId'=d.id::text and v.receipt->>'draftVersionId'=h.version_id::text and (v.receipt->>'revision')::integer=h.revision
      and (v.receipt->>'draftUpdatedAt')::timestamptz=d.updated_at then 'current' else 'historical' end,'publication',publication,'legacyDraft',null);
  end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-context/1.0.0','status','available','relationshipContext',context,'draft',draft,
    'bindingSha256',private.typed_authoring_sha256(jsonb_build_object('binding',binding,'manifest',sources)::text),
    'manifest',sources,'saved',saved,'readiness',readiness);
end;
$cr_read$;

create function public.prepare_canonical_rewrite(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_prepare$
declare a public.analyses%rowtype; op private.canonical_rewrite_operations%rowtype; ctx jsonb; req jsonb; pol jsonb;
begin
  if private.evidence_keys(p_command,array['schemaVersion','request','policy']) is not true
    or p_command->>'schemaVersion' is distinct from 'canonical-rewrite-command/1.0.0' then perform private.correction_fail('invalid'); end if;
  req:=p_command->'request';pol:=p_command->'policy';perform private.canonical_rewrite_request(req);perform private.canonical_rewrite_policy(pol);
  if p_request_id is distinct from req->>'operationId' then perform private.correction_fail('invalid'); end if;
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  select * into op from private.canonical_rewrite_operations where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=(req->>'operationId')::uuid for update;
  if found then
    if op.request is distinct from req or op.policy is distinct from pol or op.organization_id is distinct from a.organization_id then perform private.correction_fail('conflict'); end if;
    return jsonb_build_object('status','prepared','operation',private.canonical_rewrite_operation(op,false),'context',null);
  end if;
  if private.canonical_rewrite_ready() is not true then perform private.correction_fail('unavailable'); end if;
  ctx:=public.read_canonical_rewrite_context(p_user_id,p_analysis_id,jsonb_build_object('canonicalVersionId',req->'canonicalVersionId','requirementVersionId',req->'requirementVersionId'),pol);
  if ctx->'relationshipContext'->'heads'->'canonicalHeadId' is distinct from req->'canonicalVersionId'
    or ctx->'relationshipContext'->'heads'->'requirementHeadId' is distinct from req->'requirementVersionId'
    or ctx->'draft'->'id' is distinct from req->'draftId'
    or (ctx->'draft'->>'updatedAt')::timestamptz is distinct from (req->>'expectedDraftUpdatedAt')::timestamptz
    or jsonb_array_length(ctx->'manifest')=0 then perform private.correction_fail('conflict'); end if;
  insert into private.canonical_rewrite_operations(owner_id,organization_id,analysis_id,operation_id,source_id,request,policy,binding_sha256)
    values(p_user_id,a.organization_id,p_analysis_id,(req->>'operationId')::uuid,a.resume_version_id,req,pol,ctx->>'bindingSha256') returning * into op;
  return jsonb_build_object('status','prepared','operation',private.canonical_rewrite_operation(op,false),'context',ctx);
end;
$cr_prepare$;

create function public.claim_canonical_rewrite_dispatch(p_user_id uuid,p_analysis_id uuid,p_operation_id uuid,p_binding_sha256 text,p_budget jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_claim$
declare a public.analyses%rowtype; op private.canonical_rewrite_operations%rowtype; ctx jsonb; budget jsonb;
begin
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  select * into strict op from private.canonical_rewrite_operations where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id for update;
  if op.binding_sha256 is distinct from p_binding_sha256 or op.organization_id is distinct from a.organization_id then perform private.correction_fail('conflict'); end if;
  if op.state<>'reserved' then return jsonb_build_object('operation',private.canonical_rewrite_operation(op,false),'budget',null); end if;
  if private.canonical_rewrite_ready() is not true then perform private.correction_fail('unavailable'); end if;
  perform private.canonical_rewrite_consent(p_user_id,a.organization_id);
  ctx:=public.read_canonical_rewrite_context(p_user_id,p_analysis_id,jsonb_build_object('canonicalVersionId',op.request->'canonicalVersionId','requirementVersionId',op.request->'requirementVersionId'),op.policy);
  if ctx->>'bindingSha256' is distinct from op.binding_sha256
    or ctx->'relationshipContext'->'heads'->'canonicalHeadId' is distinct from op.request->'canonicalVersionId'
    or ctx->'relationshipContext'->'heads'->'requirementHeadId' is distinct from op.request->'requirementVersionId' then perform private.correction_fail('conflict'); end if;
  if p_budget is not null and p_budget<>'null'::jsonb then
    if private.evidence_keys(p_budget,array['p_user_id','p_organization_id','p_request']) is not true
      or p_budget->>'p_user_id' is distinct from p_user_id::text or p_budget->>'p_organization_id' is distinct from a.organization_id::text
      or p_budget->'p_request'->>'operationId' is distinct from p_operation_id::text
      or p_budget->'p_request'->>'surface' is distinct from 'rewrite'
      or p_budget->'p_request'->>'model' is distinct from op.policy->>'model'
      or p_budget->'p_request'->>'promptPolicyVersion' is distinct from op.policy->>'promptVersion'
      or p_budget->'p_request'->>'payloadSha256' is distinct from op.binding_sha256 then perform private.correction_fail('invalid'); end if;
    budget:=public.ai_budget_claim_dispatch(p_user_id,a.organization_id,p_budget->'p_request');
    -- A denied/replayed budget claim must roll back the operation claim as well.
    if budget->>'status' is distinct from 'ok' or budget->'receipt'->'dispatchAllowed' is distinct from 'true'::jsonb then
      return jsonb_build_object('operation',private.canonical_rewrite_operation(op,false),'budget',budget); end if;
  end if;
  update private.canonical_rewrite_operations set state='dispatched',claimed_at=clock_timestamp()
    where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id returning * into op;
  return jsonb_build_object('operation',private.canonical_rewrite_operation(op,true),'budget',budget);
end;
$cr_claim$;

-- This is technical accounting, not permission to read/create candidate content.
-- The exact technical identity remains settleable after membership, consent,
-- deletion request or source removal; unknown usage is never invented zero.
create function public.settle_canonical_rewrite_attempt(p_user_id uuid,p_analysis_id uuid,p_operation_id uuid,p_binding_sha256 text,p_usage jsonb,p_error_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_settle$
declare op private.canonical_rewrite_operations%rowtype; actual jsonb:=nullif(p_usage,'null'::jsonb);
begin
  perform private.canonical_rewrite_usage(actual);
  if p_error_code is not null and p_error_code not in ('invalid_output','stale_inputs','cancelled','provider_failed','storage_failed','unknown') then perform private.correction_fail('invalid'); end if;
  select * into strict op from private.canonical_rewrite_operations where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id for update;
  if op.binding_sha256 is distinct from p_binding_sha256 or (op.claimed_at is null and (actual is not null or p_error_code is null)) then perform private.correction_fail('conflict'); end if;
  if op.usage is not null and actual is not null and op.usage is distinct from actual then perform private.correction_fail('conflict'); end if;
  if op.state='saved' then return jsonb_build_object('schemaVersion','canonical-rewrite-settlement/1.0.0','operationId',op.operation_id,'bindingSha256',op.binding_sha256,'usage',op.usage,'state',op.state); end if;
  update private.canonical_rewrite_operations set usage=coalesce(usage,actual),error_code=coalesce(error_code,p_error_code),
    state=case when claimed_at is null then 'rejected' when usage is null and actual is null then 'unknown' when p_error_code is not null then 'rejected' else state end
    where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id returning * into op;
  return jsonb_build_object('schemaVersion','canonical-rewrite-settlement/1.0.0','operationId',op.operation_id,'bindingSha256',op.binding_sha256,'usage',op.usage,'state',op.state);
end;
$cr_settle$;

create function private.canonical_rewrite_item(p_context jsonb,p_sources jsonb,p_item jsonb) returns jsonb
language plpgsql immutable set search_path='' as $cr_item$
declare source jsonb; f jsonb; value_text text; after_text text; action text; form text; replacement jsonb; rationale text; effective_context jsonb;
begin
  effective_context:=jsonb_set(p_context,'{requirements,content,relations,clauses}',private.canonical_rewrite_effective_clauses(p_context->'requirements'->'content'));
  if private.evidence_keys(p_item,array['sourceId','clauseId','operation','replacementAction']) is not true
    or private.evidence_integer(p_item->'sourceId',0,31) is not true
    or jsonb_typeof(p_item->'clauseId') is distinct from 'string' or (p_item->>'clauseId') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_item->'operation') is distinct from 'string' or p_item->>'operation' not in ('copy','equivalent_action') then perform private.correction_fail('invalid'); end if;
  select value into source from jsonb_array_elements(p_sources) where value->'sourceId'=p_item->'sourceId';
  if source is null or not (source->'clauseIds' ? (p_item->>'clauseId')) then perform private.correction_fail('invalid'); end if;
  select value into strict f from jsonb_array_elements(p_context->'canonical'->'content'->'facts') where value->'id'=source->'factId';
  value_text:=f->>'value';after_text:=value_text;
  -- Re-run the exact selected proof before reconstructing output, independent of
  -- the upstream Node writing IR and without trusting a grounded flag or digest.
  if source->>'basis'='candidate_declaration' then perform private.typed_authoring_declaration_support(effective_context,f,p_item->>'clauseId');
  else perform private.typed_authoring_support(effective_context,f,p_item->>'clauseId'); end if;
  if p_item->>'operation'='copy' then
    if p_item->'replacementAction' is distinct from 'null'::jsonb then perform private.correction_fail('invalid'); end if;
    rationale:='Preserves the source facts.';
  else
    if jsonb_typeof(p_item->'replacementAction') is distinct from 'string' or p_item->>'replacementAction' not in ('Built','Created','Developed') then perform private.correction_fail('invalid'); end if;
    form:=substring(value_text from E'^(Built|Created|Developed|built|created|developed)(?=[\\t ])');
    if form is null then perform private.correction_fail('invalid'); end if;
    action:=case lower(form) when 'built' then 'Built' when 'created' then 'Created' else 'Developed' end;
    replacement:=jsonb_build_object('from',action,'to',p_item->>'replacementAction','case',case when form=lower(form) then 'lower' else 'title' end,
      'restSha256',private.typed_authoring_sha256(substring(value_text from char_length(form)+1)));
    after_text:=private.typed_authoring_replacement(value_text,replacement);rationale:='Clarifies wording.';
  end if;
  return jsonb_build_object('source',source||jsonb_build_object('value',value_text),'clauseId',p_item->'clauseId','operation',p_item->'operation',
    'replacementAction',p_item->'replacementAction','before',value_text,'after',after_text,'rationale',rationale,'supportPolicyVersion','legacy-source-transforms/1.0.4');
end;
$cr_item$;

create function public.finish_canonical_rewrite(p_user_id uuid,p_analysis_id uuid,p_operation_id uuid,p_binding_sha256 text,p_plan jsonb,p_usage jsonb,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_finish$
declare a public.analyses%rowtype; op private.canonical_rewrite_operations%rowtype; ctx jsonb; binding jsonb; result_value jsonb;
  receipt_value jsonb; plan_item jsonb; item jsonb; bullets jsonb:='[]'; summary jsonb; projection jsonb; projected_bullets jsonb:='[]';
  d public.writer_drafts%rowtype; version_id uuid:=gen_random_uuid(); revision_value integer; seen integer[]:='{}'; sid integer; src jsonb;
begin
  if p_request_id is distinct from p_operation_id::text then perform private.correction_fail('invalid'); end if;
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  select * into strict op from private.canonical_rewrite_operations where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id for update;
  if op.binding_sha256 is distinct from p_binding_sha256 or op.organization_id is distinct from a.organization_id then perform private.correction_fail('conflict'); end if;
  -- Exact immutable publication replay precedes plan/fresh-head/CAS checks.
  if op.state='saved' then
    if op.plan_sha256 is distinct from private.typed_authoring_sha256(p_plan::text) or op.usage is distinct from p_usage then perform private.correction_fail('conflict');end if;
    return private.canonical_rewrite_operation(op,false)->'publication'; end if;
  if op.state<>'dispatched' then perform private.correction_fail('conflict'); end if;
  if private.canonical_rewrite_ready() is not true then perform private.correction_fail('unavailable'); end if;
  perform private.canonical_rewrite_usage(p_usage);
  if p_usage is null or p_usage='null'::jsonb or op.usage is null or op.usage is distinct from p_usage then perform private.correction_fail('conflict'); end if;
  perform private.canonical_rewrite_consent(p_user_id,a.organization_id);
  ctx:=public.read_canonical_rewrite_context(p_user_id,p_analysis_id,jsonb_build_object('canonicalVersionId',op.request->'canonicalVersionId','requirementVersionId',op.request->'requirementVersionId'),op.policy);
  if ctx->>'bindingSha256' is distinct from op.binding_sha256 or ctx->'relationshipContext'->'heads'->'canonicalHeadId' is distinct from op.request->'canonicalVersionId'
    or ctx->'relationshipContext'->'heads'->'requirementHeadId' is distinct from op.request->'requirementVersionId' then perform private.correction_fail('conflict'); end if;
  if private.evidence_keys(p_plan,array['summarySourceId','bullets']) is not true or octet_length(p_plan::text)>131072
    or (p_plan->'summarySourceId'<>'null'::jsonb and private.evidence_integer(p_plan->'summarySourceId',0,31) is not true)
    or jsonb_typeof(p_plan->'bullets') is distinct from 'array' or jsonb_array_length(p_plan->'bullets')>4 then perform private.correction_fail('invalid'); end if;
  for plan_item in select value from jsonb_array_elements(p_plan->'bullets') loop
    item:=private.canonical_rewrite_item(ctx->'relationshipContext',ctx->'manifest',plan_item);sid:=(plan_item->>'sourceId')::integer;
    if sid=any(seen) then perform private.correction_fail('invalid'); end if;seen:=array_append(seen,sid);
    bullets:=bullets||jsonb_build_array(item);
    projected_bullets:=projected_bullets||jsonb_build_array(jsonb_build_object('original',item->'before','rewrite',item->'after','reasoning',item->'rationale'));
  end loop;
  if p_plan->'summarySourceId'<>'null'::jsonb then
    select value into src from jsonb_array_elements(ctx->'manifest') where value->'sourceId'=p_plan->'summarySourceId';
    if src is null then perform private.correction_fail('invalid'); end if;
    summary:=private.canonical_rewrite_item(ctx->'relationshipContext',ctx->'manifest',jsonb_build_object('sourceId',p_plan->'summarySourceId','clauseId',src->'clauseIds'->0,'operation','copy','replacementAction',null));
  end if;
  if summary is null and jsonb_array_length(bullets)=0 then perform private.correction_fail('invalid'); end if;
  projection:=jsonb_build_object('summary',summary->'after','bullets',projected_bullets);
  -- Enforce existing consumer caps exactly. No truncation of validated claims.
  perform private.canonical_rewrite_projection(projection);
  binding:=private.canonical_rewrite_binding(ctx->'relationshipContext',ctx->'draft',op.policy);
  result_value:=jsonb_build_object('schemaVersion','canonical-rewrite-result/1.0.0','operationId',p_operation_id,'bindingSha256',p_binding_sha256,
    'binding',binding,'summary',summary,'bullets',bullets);
  revision_value:=(ctx->'draft'->>'revision')::integer+1;
  if revision_value>2147483647 then perform private.correction_fail('invalid'); end if;
  -- Native content triggers and the held owner/analysis/JD/draft locks are in the
  -- SAME transaction as run/version/head/publication. Any exception rolls ALL
  -- candidate writes back; already-recorded usage is a prior technical call.
  update public.writer_drafts set draft=projection where id=(op.request->>'draftId')::uuid and owner_id=p_user_id and analysis_id=p_analysis_id
    and updated_at=(op.request->>'expectedDraftUpdatedAt')::timestamptz returning * into d;
  if not found then perform private.correction_fail('conflict'); end if;
  receipt_value:=jsonb_build_object('schemaVersion','canonical-rewrite-receipt/1.0.0','state','saved_proposals','operationId',p_operation_id,'bindingSha256',p_binding_sha256,
    'runId',op.run_id,'draftId',d.id,'draftVersionId',version_id,'revision',revision_value,
    'draftUpdatedAt',to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'resultSha256',private.typed_authoring_sha256(result_value::text),'projectionSha256',private.typed_authoring_sha256(projection::text),'idempotent',false);
  insert into public.analysis_ai_runs(id,analysis_id,organization_id,owner_id,provider,model_id,prompt_version,input_hash,input_tokens,output_tokens,output,completed_at)
    values(op.run_id,p_analysis_id,a.organization_id,p_user_id,'openai',op.policy->>'model',op.policy->>'promptVersion',p_binding_sha256,
      (p_usage->>'inputTokens')::integer,(p_usage->>'outputTokens')::integer,jsonb_build_object('state','canonical_bound_proposals','publication',jsonb_build_object('result',result_value,'receipt',receipt_value)),clock_timestamp());
  insert into private.canonical_rewrite_versions(id,analysis_id,source_id,owner_id,organization_id,draft_id,operation_id,revision,parent_id,result,receipt,projection_sha256)
    values(version_id,p_analysis_id,a.resume_version_id,p_user_id,a.organization_id,d.id,p_operation_id,revision_value,(ctx->'draft'->>'versionId')::uuid,result_value,receipt_value,private.typed_authoring_sha256(projection::text));
  insert into private.canonical_rewrite_heads(draft_id,analysis_id,source_id,owner_id,organization_id,version_id,revision)
    values(d.id,p_analysis_id,a.resume_version_id,p_user_id,a.organization_id,version_id,revision_value)
    on conflict(draft_id) do update set version_id=excluded.version_id,revision=excluded.revision;
  update private.canonical_rewrite_operations set state='saved',receipt=receipt_value,plan_sha256=private.typed_authoring_sha256(p_plan::text)
    where owner_id=p_user_id and analysis_id=p_analysis_id and operation_id=p_operation_id;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
    values(a.organization_id,p_user_id,'canonical_rewrite.saved','writer_draft',d.id,'success',p_request_id);
  return jsonb_build_object('result',result_value,'receipt',receipt_value);
end;
$cr_finish$;

-- New owner export closure is mandatory for the privacy worker. Unknown schema
-- or missing access is a failed export, never an assertion that no data exists.
create function public.export_canonical_rewrite_records(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $cr_export$
begin
  if p_user_id is null then perform private.correction_fail('invalid'); end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-export/1.0.0',
    'canonicalRewriteOperations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.operation_id),'[]') from private.canonical_rewrite_operations x where x.owner_id=p_user_id),
    'canonicalRewriteVersions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]') from private.canonical_rewrite_versions x where x.owner_id=p_user_id),
    'canonicalRewriteHeads',(select coalesce(jsonb_agg(to_jsonb(x) order by x.draft_id),'[]') from private.canonical_rewrite_heads x where x.owner_id=p_user_id));
end;
$cr_export$;

create function private.canonical_rewrite_content_barrier() returns trigger
language plpgsql volatile security definer set search_path='' as $cr_content$
begin
  if private.try_candidate_privacy_write(new.owner_id) is not true then perform private.correction_fail('not_found'); end if;
  return new;
end;
$cr_content$;
create trigger canonical_rewrite_versions_privacy before insert or update on private.canonical_rewrite_versions
for each row execute function private.canonical_rewrite_content_barrier();
create trigger canonical_rewrite_heads_privacy before insert or update on private.canonical_rewrite_heads
for each row execute function private.canonical_rewrite_content_barrier();

create function public.read_canonical_rewrite_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $cr_readiness$
declare signature text; executable boolean:=true; r pg_catalog.pg_proc%rowtype; result_value jsonb;
begin
  result_value:=jsonb_build_object('schemaVersion','canonical-rewrite-readiness/1.0.0','profileVersion','canonical-rewrite-readiness-profile/1.0.0',
    'schemaReady',private.canonical_rewrite_ready());
  foreach signature in array array['public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)',
    'public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)',
    'public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)',
    'public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)'] loop
    if to_regprocedure(signature) is null or not has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE') then executable:=false; end if;
  end loop;
  result_value:=result_value||jsonb_build_object('mutatorsExecutable',executable);
  return result_value||jsonb_build_object(
    'checkerSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_rewrite_ready()')),
    'readerSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb)')),
    'prepareSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)')),
    'claimSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)')),
    'finishSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)')),
    'settleSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)')));
end;
$cr_readiness$;


create function private.canonical_rewrite_ready() returns boolean
language plpgsql stable set search_path='' as $cr_ready$
declare routine pg_catalog.pg_proc%rowtype; predecessor pg_catalog.pg_proc%rowtype; rel pg_catalog.pg_class%rowtype;
  target jsonb; role_name text; name text; service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');
  manifest jsonb:=$cr_catalog$[
  {
    "signature": "private.canonical_rewrite_immutable()",
    "sha256": "c9112879a49deae16f5714cd898b7ab7a960e532a126f0227d443f4fecebfb1d",
    "definer": false,
    "volatility": "v",
    "resultType": "trigger",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_policy(jsonb)",
    "sha256": "0794d56ad1efb60d9ed5d3466f84c158abc3875a9b717955c28642158e493580",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_request(jsonb)",
    "sha256": "6d2d62ed6dc312ae6a0d881a13b78189b9c35e3ffba40b6238209ec4221a562a",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_usage(jsonb)",
    "sha256": "3b2800b6509d3da376ad3b8bd6436e084165bb0c0b9bb00d504828a78de880ea",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_owner(uuid,uuid)",
    "sha256": "cd4efcafe71b9c270ee709dd10009da352ce25382d1ce2b821aa7d23923b5b5b",
    "definer": true,
    "volatility": "v",
    "resultType": "public.analyses",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_effective_clauses(jsonb)",
    "sha256": "496fa9ad2020184db532e5b1b5c55ae5cbaabc882ff0c7354b14a2419c1fa6c3",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_sources(jsonb)",
    "sha256": "3587bb71fee3161cf900894e789fbba8586718b7735ff51c0915c4164388f571",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_binding(jsonb,jsonb,jsonb)",
    "sha256": "ec425c3ccc6e527c8dd64ac4af0d1c99512e6ff57293120e8c12baef0ad3c6bc",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "language": "sql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_projection(jsonb)",
    "sha256": "b7048d1c479c473a9f9d521df53f544cd7ef393c0f78a90332eafdad231cc357",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_consent(uuid,uuid)",
    "sha256": "7ef2efd29fb36e4537ddc2f2813090ca1c661cb61fa80253c7414d6adc461b16",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "private.canonical_rewrite_operation(private.canonical_rewrite_operations,boolean)",
    "sha256": "0f717d3e282cef81f755d07e4bddcc45f7be66fa3d6ecb58a883092e71bd1fe8",
    "definer": false,
    "volatility": "s",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb)",
    "sha256": "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "service_only"
  },
  {
    "signature": "public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)",
    "sha256": "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "optional_service"
  },
  {
    "signature": "public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)",
    "sha256": "d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "optional_service"
  },
  {
    "signature": "public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)",
    "sha256": "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "optional_service"
  },
  {
    "signature": "private.canonical_rewrite_item(jsonb,jsonb,jsonb)",
    "sha256": "6ff0dc76c02cf79ac2d399a85d792ec37b13a857a9800883056f4a12bd43c229",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)",
    "sha256": "fa8caa7e6818545b495bf35f7b085a02a8e1f3d08e10f87ee33cacd68dcf38ed",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "optional_service"
  },
  {
    "signature": "public.export_canonical_rewrite_records(uuid)",
    "sha256": "575ba48091f2444893dafa42788a1f8becfef5058533ecffefac245ec8eb5738",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "service_only"
  },
  {
    "signature": "private.canonical_rewrite_content_barrier()",
    "sha256": "9c9a1640542afa030cbc86c90750c9cd4579076d819534d38553a3224ceaf9df",
    "definer": true,
    "volatility": "v",
    "resultType": "trigger",
    "language": "plpgsql",
    "acl": "owner_only"
  },
  {
    "signature": "public.read_canonical_rewrite_readiness()",
    "sha256": "acedde01a4395048f4fc63be4745a956738dcc2db2c678d398b762309d0daad4",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "language": "plpgsql",
    "acl": "service_only"
  }
]$cr_catalog$::jsonb;
  columns_expected jsonb:=$cr_columns${"canonical_rewrite_operations":[["owner_id","uuid",true],["organization_id","uuid",true],["analysis_id","uuid",true],["operation_id","uuid",true],["source_id","uuid",true],["request","jsonb",true],["policy","jsonb",true],["binding_sha256","text",true],["state","text",true],["run_id","uuid",true],["claimed_at","timestamp with time zone",false],["usage","jsonb",false],["error_code","text",false],["receipt","jsonb",false],["plan_sha256","text",false],["created_at","timestamp with time zone",true]],"canonical_rewrite_versions":[["id","uuid",true],["analysis_id","uuid",true],["source_id","uuid",true],["owner_id","uuid",true],["organization_id","uuid",true],["draft_id","uuid",true],["operation_id","uuid",true],["revision","integer",true],["parent_id","uuid",false],["result","jsonb",true],["receipt","jsonb",true],["projection_sha256","text",true],["created_at","timestamp with time zone",true]],"canonical_rewrite_heads":[["draft_id","uuid",true],["analysis_id","uuid",true],["source_id","uuid",true],["owner_id","uuid",true],["organization_id","uuid",true],["version_id","uuid",true],["revision","integer",true]]}$cr_columns$::jsonb;
  names text[]; expected jsonb;
begin
  select * into predecessor from pg_catalog.pg_proc where oid=to_regprocedure('private.typed_authoring_write_ready()');
  if not found or predecessor.prosecdef or predecessor.provolatile<>'s' or predecessor.proconfig is distinct from array['search_path=""']
    or private.typed_authoring_sha256(predecessor.prosrc)<>'fdb7b1a51ac23303ca5c55a741e2818ca669e7795394ca4d012f1e150266ca08'
    or exists(select 1 from aclexplode(coalesce(predecessor.proacl,acldefault('f',predecessor.proowner))) acl where acl.grantee<>predecessor.proowner)
    or private.typed_authoring_write_ready() is not true then return false; end if;
  for target in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(target->>'signature');
    if not found or routine.prokind<>'f' or routine.proretset or routine.proisstrict
      or routine.proowner<>predecessor.proowner or routine.prorettype<>to_regtype(target->>'resultType')
      or routine.prosecdef is distinct from (target->>'definer')::boolean or routine.provolatile<>target->>'volatility'
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname=target->>'language')
      or routine.proconfig is distinct from array['search_path=""']
      or private.typed_authoring_sha256(routine.prosrc)<>target->>'sha256' then return false; end if;
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
      where acl.grantee<>routine.proowner and (target->>'acl'='owner_only' or acl.grantee<>service_oid or acl.privilege_type<>'EXECUTE' or acl.is_grantable)) then return false; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') then return false; end if;
    end loop;
    if target->>'acl'='owner_only' and has_function_privilege('service_role',routine.oid,'EXECUTE') then return false; end if;
    if target->>'acl'='service_only' and (not has_function_privilege('service_role',routine.oid,'EXECUTE')
      or not exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee=service_oid and acl.privilege_type='EXECUTE' and not acl.is_grantable)) then return false; end if;
    if target->>'acl'='optional_service' and has_function_privilege('service_role',routine.oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee=service_oid and acl.privilege_type='EXECUTE' and not acl.is_grantable) then return false; end if;
  end loop;
  -- No public/private-role direct or column-DML bypass. Exact selected column
  -- names/types/nullability are required; extra columns are drift, not ignored.
  for name,expected in select key,value from jsonb_each(columns_expected) loop
    select * into rel from pg_catalog.pg_class where oid=to_regclass('private.'||name);
    if not found or rel.relkind<>'r' or not rel.relrowsecurity or rel.relowner<>predecessor.proowner
      or exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) acl where acl.grantee<>rel.relowner)
      or exists(select 1 from pg_catalog.pg_attribute a cross join lateral aclexplode(a.attacl) acl where a.attrelid=rel.oid and acl.grantee<>rel.relowner) then return false; end if;
    if (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum)
      from pg_catalog.pg_attribute a where a.attrelid=rel.oid and a.attnum>0 and not a.attisdropped) is distinct from expected then return false; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false; end if;
    end loop;
    if exists(select 1 from pg_catalog.pg_policy where polrelid=rel.oid) then return false; end if;
  end loop;
  -- Candidate versions/head FK cascades and immutable/privacy triggers are part
  -- of the closure. Technical operations intentionally have no analysis FK.
  if exists(select 1 from pg_catalog.pg_constraint where conrelid='private.canonical_rewrite_operations'::regclass and confrelid in ('public.analyses'::regclass,'public.resume_versions'::regclass))
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid='private.canonical_rewrite_operations'::regclass and contype='p') then return false; end if;
  foreach name in array array['canonical_rewrite_versions','canonical_rewrite_heads'] loop
    if not exists(select 1 from pg_catalog.pg_constraint where conrelid=to_regclass('private.'||name) and confrelid='public.analyses'::regclass and contype='f' and confdeltype='c' and convalidated)
      or not exists(select 1 from pg_catalog.pg_constraint where conrelid=to_regclass('private.'||name) and confrelid='public.resume_versions'::regclass and contype='f' and confdeltype='c' and convalidated)
      or not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('private.'||name) and tgname=name||'_privacy'
        and tgfoid=to_regprocedure('private.canonical_rewrite_content_barrier()') and not tgisinternal and tgenabled='O' and tgtype=23 and tgnargs=0 and tgqual is null) then return false; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.canonical_rewrite_versions'::regclass and not tgisinternal and tgname not in ('canonical_rewrite_versions_privacy','canonical_rewrite_versions_immutable'))
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.canonical_rewrite_heads'::regclass and not tgisinternal and tgname<>'canonical_rewrite_heads_privacy')
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.canonical_rewrite_operations'::regclass and not tgisinternal) then return false;end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.canonical_rewrite_versions'::regclass and tgname='canonical_rewrite_versions_immutable'
    and tgfoid=to_regprocedure('private.canonical_rewrite_immutable()') and not tgisinternal and tgenabled='O' and tgtype=19 and tgnargs=0 and tgqual is null) then return false; end if;
  select * into routine from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_rewrite_ready()');
  if not found or routine.proowner<>predecessor.proowner or routine.prosecdef or routine.provolatile<>'s'
    or routine.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee<>routine.proowner) then return false; end if;
  return true;
exception when others then return false;
end;
$cr_ready$;

revoke all on function private.canonical_rewrite_immutable() from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_policy(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_request(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_usage(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_owner(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_effective_clauses(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_sources(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_binding(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_projection(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_consent(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_operation(private.canonical_rewrite_operations,boolean) from public,anon,authenticated,service_role;
revoke all on function public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.prepare_canonical_rewrite(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_item(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.export_canonical_rewrite_records(uuid) from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_content_barrier() from public,anon,authenticated,service_role;
revoke all on function public.read_canonical_rewrite_readiness() from public,anon,authenticated,service_role;
revoke all on function private.canonical_rewrite_ready() from public,anon,authenticated,service_role;
grant execute on function public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.export_canonical_rewrite_records(uuid) to service_role;
grant execute on function public.read_canonical_rewrite_readiness() to service_role;

-- No writer grant. A separate native/retention/cutover approval is mandatory.
commit;
