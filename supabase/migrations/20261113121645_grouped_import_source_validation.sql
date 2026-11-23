begin;

-- Pure source preparation only. No authentication, stored replay, CAS or save.
create function private.grouped_import_invalid() returns void
language plpgsql immutable security invoker set search_path = '' as $$
begin raise exception 'GROUPED_IMPORT_SOURCE_INVALID' using errcode='22023'; end;
$$;

create function private.grouped_import_keys(p_value jsonb,p_keys text[]) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  return (select count(*)=cardinality(p_keys) and bool_and(k=any(p_keys)) from jsonb_object_keys(p_value) k);
end;
$$;
create function private.grouped_import_whitespace() returns text
language sql immutable security invoker set search_path = '' as $$
  select chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)
    ||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)
    ||chr(8287)||chr(12288)||chr(65279);
$$;
create function private.grouped_import_trim(p_text text) returns text
language sql immutable strict security invoker set search_path = '' as $$
  select btrim(p_text,private.grouped_import_whitespace());
$$;
create function private.grouped_import_ascii_lower(p_text text) returns text
language sql immutable strict security invoker set search_path = '' as $$
  select translate(p_text,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
$$;
create function private.grouped_import_utf16_length(p_text text) returns integer
language plpgsql immutable strict security invoker set search_path = '' as $$
declare data bytea:=convert_to(p_text,'UTF8'); units integer:=char_length(p_text); i integer; b integer;
begin
  if octet_length(data)>0 then
    for i in 0..octet_length(data)-1 loop
      b:=get_byte(data,i);
      if b between 240 and 244 then units:=units+1; end if;
    end loop;
  end if;
  return units;
end;
$$;
create function private.grouped_import_uuid(p_value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(p_value)='string' and (p_value #>> '{}') collate "C" ~
    '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
$$;

-- Relevant immutable-source checks and indexes, not a full extractor replay.
create function private.grouped_import_source_index(p_envelope jsonb,p_binding jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare k text; page jsonb; span jsonb; candidate jsonb; ref jsonb; source jsonb; obs jsonb;
  pages jsonb:='{}'; spans jsonb:='{}'; assertions jsonb:='{}'; observations jsonb:='{}'; by_span jsonb:='{}';
  assembled text; piece text; assembled_units integer; n integer:=0; units integer:=0; projected integer:=0;
  ocr_units integer:=0; native_span_units integer:=0; ord integer:=0; first_ord integer;
  assertion_ord integer:=0; page_key text;
begin
  if private.grouped_import_keys(p_binding,array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId','inputSha256',
    'evidenceSchemaVersion','fieldExtractorVersion','targetModelVersion','associationModelVersion','producerVersion',
    'admissionPolicyVersion','structuralTextProfileVersion','correctionProjectionModelVersion','correctionAdmissionPolicyVersion','effectiveLocale']) is not true
    or jsonb_typeof(p_envelope) is distinct from 'object' then perform private.grouped_import_invalid(); end if;
  foreach k in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId'] loop
    if private.grouped_import_uuid(p_binding->k) is not true then perform private.grouped_import_invalid(); end if;
  end loop;
  if jsonb_typeof(p_binding->'inputSha256') is distinct from 'string'
    or (p_binding->>'inputSha256') collate "C" !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_binding->'effectiveLocale') is distinct from 'string'
    or (p_binding->>'effectiveLocale') collate "C" !~ '^[a-z]{2,3}(?:-[A-Z]{2})?$'
    or p_binding->>'evidenceSchemaVersion' is distinct from 'evidence/2.0.0'
    or p_binding->>'fieldExtractorVersion' is distinct from 'evidence-fields/1.0.1'
    or p_binding->>'targetModelVersion' is distinct from 'evidence-targets/1.0.0'
    or p_binding->>'associationModelVersion' is distinct from 'evidence-entry-associations/1.0.0'
    or p_binding->>'producerVersion' is distinct from 'canonical-engine/1.0.3'
    or p_binding->>'admissionPolicyVersion' is distinct from 'grouped-original-admission/1.0.0'
    or p_binding->>'structuralTextProfileVersion' is distinct from 'a02-structural-text/1.0.0'
    or p_binding->>'correctionProjectionModelVersion' is distinct from 'canonical-corrections/1.0.1'
    or p_binding->>'correctionAdmissionPolicyVersion' is distinct from 'candidate-correction-admission/1.0.0'
    or p_envelope->'schemaVersion' is distinct from p_binding->'evidenceSchemaVersion'
    or p_envelope->'fieldExtractorVersion' is distinct from p_binding->'fieldExtractorVersion'
    or p_envelope->'id' is distinct from p_binding->'attemptId'
    or p_envelope->'ownerId' is distinct from p_binding->'ownerId'
    or p_envelope->'analysisId' is distinct from p_binding->'analysisId'
    or p_envelope->'sourceId' is distinct from p_binding->'sourceId'
    or p_envelope->'inputSha256' is distinct from p_binding->'inputSha256'
    or jsonb_typeof(p_envelope->'retentionPolicyId') is distinct from 'string'
    or private.grouped_import_utf16_length(p_envelope->>'retentionPolicyId') not between 1 and 100 then
    perform private.grouped_import_invalid();
  end if;
  if jsonb_typeof(p_envelope->'spans') is distinct from 'array'
    or jsonb_typeof(p_envelope->'assertions') is distinct from 'array'
    or jsonb_typeof(p_envelope->'nativeSource'->'pages') is distinct from 'array'
    or jsonb_typeof(p_envelope->'nativeSource'->'spans') is distinct from 'array'
    or jsonb_typeof(p_envelope->'nativeSource'->'assertions') is distinct from 'array' then
    perform private.grouped_import_invalid();
  end if;
  if jsonb_array_length(p_envelope->'spans') not between 1 and 20000
    or jsonb_array_length(p_envelope->'assertions')>1000
    or jsonb_array_length(p_envelope->'nativeSource'->'pages') not between 1 and 20
    or jsonb_array_length(p_envelope->'nativeSource'->'spans')>20000
    or jsonb_array_length(p_envelope->'nativeSource'->'assertions')<>3 then perform private.grouped_import_invalid(); end if;
  units:=(jsonb_array_length(p_envelope->'nativeSource'->'pages')-1)*2;
  for page in select value from jsonb_array_elements(p_envelope->'nativeSource'->'pages') loop
    n:=n+1;
    if jsonb_typeof(page->'text') is distinct from 'string' or page->>'id' is distinct from 'page-'||n
      or private.evidence_integer(page->'pageNumber',1,20) is not true or page->'pageNumber' is distinct from to_jsonb(n) then
      perform private.grouped_import_invalid();
    end if;
    units:=units+private.grouped_import_utf16_length(page->>'text');
    if units>500000 then perform private.grouped_import_invalid(); end if;
    pages:=pages||jsonb_build_object('native_text|'||(page->>'id'),page->'text');
  end loop;
  for span in select value from jsonb_array_elements(p_envelope->'nativeSource'->'spans') loop
    if jsonb_typeof(span->'text') is distinct from 'string' then perform private.grouped_import_invalid(); end if;
    native_span_units:=native_span_units+private.grouped_import_utf16_length(span->>'text');
    if native_span_units>500000 then perform private.grouped_import_invalid(); end if;
  end loop;
  if p_envelope->'ocrSource' is distinct from 'null'::jsonb then
    if jsonb_typeof(p_envelope->'ocrSource'->'pages') is distinct from 'array' then perform private.grouped_import_invalid(); end if;
    if jsonb_array_length(p_envelope->'ocrSource'->'pages') not between 1 and 10 then perform private.grouped_import_invalid(); end if;
    ocr_units:=(jsonb_array_length(p_envelope->'ocrSource'->'pages')-1)*2;
    for page in select value from jsonb_array_elements(p_envelope->'ocrSource'->'pages') loop
      if jsonb_typeof(page->'text') is distinct from 'string' or jsonb_typeof(page->'pageId') is distinct from 'string'
        or not (pages ? ('native_text|'||(page->>'pageId'))) then perform private.grouped_import_invalid(); end if;
      page_key:='local_ocr|'||(page->>'pageId');
      if pages ? page_key then perform private.grouped_import_invalid(); end if;
      ocr_units:=ocr_units+private.grouped_import_utf16_length(page->>'text');
      if ocr_units>200000 or units+ocr_units>200000 then perform private.grouped_import_invalid(); end if;
      pages:=pages||jsonb_build_object(page_key,page->'text');
    end loop;
  end if;
  -- Preflight every nested reference cardinality before assembling references.
  for candidate in select value from jsonb_array_elements(p_envelope->'assertions') loop
    if jsonb_typeof(candidate->'evidence') is distinct from 'array' then perform private.grouped_import_invalid(); end if;
    if jsonb_array_length(candidate->'evidence') not between 1 and 20 then perform private.grouped_import_invalid(); end if;
  end loop;
  for span in select value from jsonb_array_elements(p_envelope->'spans') loop
    ord:=ord+1;
    if private.grouped_import_keys(span,array['id','pageId','method','text','start','end','box','confidence']) is not true
      or jsonb_typeof(span->'id') is distinct from 'string' or jsonb_typeof(span->'pageId') is distinct from 'string'
      or jsonb_typeof(span->'text') is distinct from 'string' or span->>'method' not in ('native_text','local_ocr')
      or jsonb_typeof(span->'method') is distinct from 'string'
      or private.grouped_import_utf16_length(span->>'id') not between 1 and 100
      or private.grouped_import_utf16_length(span->>'pageId') not between 1 and 100
      or private.evidence_integer(span->'start',0,200000) is not true
      or private.evidence_integer(span->'end',0,200000) is not true then perform private.grouped_import_invalid(); end if;
    units:=private.grouped_import_utf16_length(span->>'text'); projected:=projected+units;
    if units>200000 or projected>700000 or (span->>'end')::numeric::integer-(span->>'start')::numeric::integer<>char_length(span->>'text') then
      perform private.grouped_import_invalid();
    end if;
    page_key:=(span->>'method')||'|'||(span->>'pageId');
    if not (pages ? page_key) or (span->>'end')::numeric::integer>char_length(pages->>page_key)
      or substring(pages->>page_key from (span->>'start')::numeric::integer+1
      for (span->>'end')::numeric::integer-(span->>'start')::numeric::integer) is distinct from span->>'text' then perform private.grouped_import_invalid(); end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_envelope->'spans'))<>jsonb_array_length(p_envelope->'spans') then
    perform private.grouped_import_invalid();
  end if;
  select jsonb_object_agg(value->>'id',value||jsonb_build_object('ordinal',ordinality)) into spans
    from jsonb_array_elements(p_envelope->'spans') with ordinality;
  for candidate in select value from jsonb_array_elements(p_envelope->'assertions') loop
    assertion_ord:=assertion_ord+1;
    if private.grouped_import_keys(candidate,array['id','field','value','evidence','state','confidence']) is not true
      or jsonb_typeof(candidate->'id') is distinct from 'string' or jsonb_typeof(candidate->'value') is distinct from 'string'
      or jsonb_typeof(candidate->'field') is distinct from 'string'
      or candidate->>'field' not in ('name','email','phone','employer','role','dates','education','certification')
      or private.grouped_import_utf16_length(candidate->>'id') not between 1 and 100
      or private.grouped_import_utf16_length(candidate->>'value') not between 1 and 500
      or candidate->>'state' is distinct from 'review_required'
      or candidate->'confidence' is distinct from '{"kind":"uncalibrated","value":null}'::jsonb then perform private.grouped_import_invalid(); end if;
    assembled:=''; assembled_units:=0;
    for ref in select value from jsonb_array_elements(candidate->'evidence') loop
      if private.grouped_import_keys(ref,array['spanId','start','end']) is not true
        or jsonb_typeof(ref->'spanId') is distinct from 'string'
        or private.evidence_integer(ref->'start',0,200000) is not true
        or private.evidence_integer(ref->'end',1,200000) is not true then perform private.grouped_import_invalid(); end if;
      source:=spans->(ref->>'spanId');
      if source is null or (ref->>'end')::numeric::integer<=(ref->>'start')::numeric::integer
        or (ref->>'end')::numeric::integer>char_length(source->>'text') then perform private.grouped_import_invalid(); end if;
      piece:=substring(source->>'text' from (ref->>'start')::numeric::integer+1 for (ref->>'end')::numeric::integer-(ref->>'start')::numeric::integer);
      assembled_units:=assembled_units+private.grouped_import_utf16_length(piece);
      if assembled_units>500 then perform private.grouped_import_invalid(); end if;
      assembled:=assembled||piece;
    end loop;
    if assembled is distinct from candidate->>'value' then perform private.grouped_import_invalid(); end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_envelope->'assertions'))<>jsonb_array_length(p_envelope->'assertions') then
    perform private.grouped_import_invalid();
  end if;
  select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into assertions from jsonb_array_elements(p_envelope->'assertions');
  -- Aggregate indexes once; bySpan stores IDs rather than duplicating large multi-reference observations.
  select coalesce(jsonb_object_agg(c.value->>'id',jsonb_build_object('assertionId',c.value->'id','field',c.value->'field',
    'value',c.value->'value','ordinal',c.ordinality,'firstOrdinal',refs.first_ordinal,'citations',refs.citations)),'{}'::jsonb)
    into observations from jsonb_array_elements(p_envelope->'assertions') with ordinality c(value,ordinality)
    cross join lateral (select min((spans->(r.value->>'spanId')->>'ordinal')::numeric::integer) as first_ordinal,
      jsonb_agg(jsonb_build_object('attemptId',p_binding->'attemptId','spanId',r.value->'spanId',
        'pageId',spans->(r.value->>'spanId')->'pageId','method',spans->(r.value->>'spanId')->'method',
        'start',r.value->'start','end',r.value->'end',
        'pageStart',(spans->(r.value->>'spanId')->>'start')::numeric::integer+(r.value->>'start')::numeric::integer,
        'pageEnd',(spans->(r.value->>'spanId')->>'start')::numeric::integer+(r.value->>'end')::numeric::integer) order by r.ordinality) as citations
      from jsonb_array_elements(c.value->'evidence') with ordinality r(value,ordinality)) refs;
  select coalesce(jsonb_object_agg(grouped.span_id,grouped.ids),'{}'::jsonb) into by_span from (
    select r.value->>'spanId' as span_id,jsonb_object_agg(c.value->>'id',true) as ids
      from jsonb_array_elements(p_envelope->'assertions') c(value) cross join lateral jsonb_array_elements(c.value->'evidence') r(value)
      group by r.value->>'spanId') grouped;
  return jsonb_build_object('spans',spans,'assertions',assertions,'observations',observations,'bySpan',by_span);
end;
$$;

-- /giu target segmentation recognizes date-long-s as a separator, but its
-- captured field remains noncanonical after the frozen JS toLowerCase behavior.
create function private.grouped_import_same_span(p_text text,p_values jsonb) returns text
language plpgsql immutable security invoker set search_path = '' as $$
declare ws text:='['||private.grouped_import_whitespace()||']'; pattern text; m text[];
  cursor_pos integer:=0; segment_start integer:=0; previous_field text; gap text; field_name text;
  seen text[]:='{}'; matched jsonb:='{}'; obs jsonb; cite jsonb; start_pos integer; end_pos integer;
  kind text; next_kind text;
begin
  if jsonb_array_length(p_values)<2 then return null; end if;
  for obs in select value from jsonb_array_elements(p_values) loop
    if jsonb_array_length(obs->'citations')<>1 then return null; end if;
  end loop;
  pattern:='(.*?)((?:^|[|;]'||ws||'*)(name|email|phone|employer|role|date[sſ]|education|certification)'||ws||'*:'||ws||'*)';
  for m in select regexp_matches(private.grouped_import_ascii_lower(p_text) collate "C",pattern,'g') loop
    gap:=m[1];
    if previous_field=any(array['employer','role','dates','education','certification']) then
      start_pos:=segment_start+char_length(gap)-char_length(ltrim(gap,private.grouped_import_whitespace()));
      end_pos:=greatest(start_pos,segment_start+char_length(rtrim(gap,private.grouped_import_whitespace())));
      for obs in select value from jsonb_array_elements(p_values) loop
        cite:=obs->'citations'->0;
        if obs->>'field'=previous_field and (cite->>'start')::numeric::integer>=start_pos and (cite->>'end')::numeric::integer<=end_pos then
          matched:=matched||jsonb_build_object(obs->>'assertionId',true);
        end if;
      end loop;
    end if;
    cursor_pos:=cursor_pos+char_length(m[1])+char_length(m[2]); segment_start:=cursor_pos; field_name:=m[3];
    if field_name=any(array['employer','role','dates','education','certification']) then
      if field_name=any(seen) then return null; end if;
      seen:=array_append(seen,field_name);
      next_kind:=case when field_name in ('employer','role') then 'employment' when field_name='education' then 'education'
        when field_name='certification' then 'certification' else null end;
      if next_kind is not null then
        if kind is not null and kind<>next_kind then return null; end if;
        kind:=next_kind;
      end if;
    end if;
    previous_field:=field_name;
  end loop;
  gap:=substring(p_text from cursor_pos+1);
  if previous_field=any(array['employer','role','dates','education','certification']) then
    start_pos:=segment_start+char_length(gap)-char_length(ltrim(gap,private.grouped_import_whitespace()));
    end_pos:=greatest(start_pos,segment_start+char_length(rtrim(gap,private.grouped_import_whitespace())));
    for obs in select value from jsonb_array_elements(p_values) loop
      cite:=obs->'citations'->0;
      if obs->>'field'=previous_field and (cite->>'start')::numeric::integer>=start_pos and (cite->>'end')::numeric::integer<=end_pos then
        matched:=matched||jsonb_build_object(obs->>'assertionId',true);
      end if;
    end loop;
  end if;
  if kind is null then return null; end if;
  for obs in select value from jsonb_array_elements(p_values) loop
    if not (matched ? (obs->>'assertionId')) then return null; end if;
  end loop;
  return kind;
end;
$$;

create function private.grouped_import_flush(p_block jsonb,p_ambiguous boolean,p_assigned jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare obs jsonb; members jsonb:='[]'; has_employer boolean:=false; has_role boolean:=false;
begin
  if p_block is null or p_ambiguous then return null; end if;
  for obs in select value from jsonb_array_elements(p_block) loop
    if p_assigned ? (obs->>'assertionId') then return null; end if;
    has_employer:=has_employer or obs->>'field'='employer'; has_role:=has_role or obs->>'field'='role';
    members:=members||jsonb_build_array(jsonb_build_object('assertionId',obs->'assertionId','field',obs->'field','citations',obs->'citations'));
  end loop;
  if not has_employer or not has_role then return null; end if;
  return jsonb_build_object('pageId',p_block->0->'citations'->0->'pageId','method',p_block->0->'citations'->0->'method','members',members);
end;
$$;

create function private.grouped_import_project_candidates(p_envelope jsonb,p_binding jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare idx jsonb:=private.grouped_import_source_index(p_envelope,p_binding); pair record; bucket record; span jsonb; obs jsonb;
  protected jsonb:='{}'; preserved jsonb:='{}'; assigned jsonb:='{}'; values_here jsonb; relevant jsonb;
  kind text; text_value text; folded text; ws text:='['||private.grouped_import_whitespace()||']';
  block jsonb; ambiguous boolean; in_employment boolean; mode text; prefix text[]; field_name text;
  group_value jsonb; result jsonb:='[]'; suffix text; start_pos integer; end_pos integer; exact_line boolean; labels_count integer;
begin
  for pair in select key,value from jsonb_each(idx->'bySpan') loop
    select coalesce(jsonb_agg(ob.value order by (ob.value->>'ordinal')::numeric::integer),'[]'::jsonb) into values_here from jsonb_each(pair.value) keys
      cross join lateral (values (idx->'observations'->keys.key)) ob(value)
      where ob.value->>'field' in ('employer','role','dates','education','certification');
    kind:=private.grouped_import_same_span(idx->'spans'->pair.key->>'text',values_here);
    if kind is not null then
      protected:=protected||jsonb_build_object(pair.key,kind);
      for obs in select value from jsonb_array_elements(values_here) loop preserved:=preserved||jsonb_build_object(obs->>'assertionId',true); end loop;
    end if;
  end loop;
  for bucket in select value->>'pageId' as page_id,value->>'method' as method,min(ordinality) as first_ordinal
    from jsonb_array_elements(p_envelope->'spans') with ordinality group by value->>'pageId',value->>'method' order by min(ordinality) loop
    in_employment:=false; block:=null; ambiguous:=false;
    for span in select value from jsonb_array_elements(p_envelope->'spans') with ordinality
      where value->>'pageId'=bucket.page_id and value->>'method'=bucket.method order by (value->>'start')::numeric::integer,ordinality loop
      text_value:=span->>'text'; folded:=private.grouped_import_ascii_lower(text_value);
      select coalesce(jsonb_agg(ob.value order by (ob.value->>'firstOrdinal')::numeric::integer,(ob.value->'citations'->0->>'start')::numeric::integer,(ob.value->>'ordinal')::numeric::integer),'[]'::jsonb)
        into values_here from jsonb_each(coalesce(idx->'bySpan'->(span->>'id'),'{}'::jsonb)) keys
        cross join lateral (values (idx->'observations'->keys.key)) ob(value) where not (preserved ? (ob.value->>'assertionId'));
      select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into relevant from jsonb_array_elements(values_here) with ordinality
        where value->>'field' in ('employer','role','dates');
      prefix:=regexp_match(folded collate "C",'^([\t ]*(employer|role|dates):[\t ]*)'); field_name:=prefix[2];
      mode:=case
        when private.grouped_import_trim(folded)=any(array['employment','experience','work experience','professional experience','employment history']) then 'heading'
        when exists(select 1 from jsonb_array_elements(values_here) where value->>'field' not in ('employer','role','dates'))
          or exists(select 1 from regexp_matches(text_value collate "C",'(?:^[\t ]*|[|;]'||ws||'*)([A-Za-z][A-Za-z ]*):','g') label
            where private.grouped_import_ascii_lower(private.grouped_import_trim(label[1])) not in ('employer','role','dates')) then 'barrier'
        when protected ? (span->>'id') then 'protected'
        when private.grouped_import_trim(text_value)='' then 'blank'
        when prefix is null then 'unlabelled' else 'labelled' end;
      if mode<>'labelled' or (in_employment and field_name='employer') then
        group_value:=private.grouped_import_flush(block,ambiguous,assigned);
        if group_value is not null then
          result:=result||jsonb_build_array(group_value);
          for obs in select value from jsonb_array_elements(group_value->'members') loop assigned:=assigned||jsonb_build_object(obs->>'assertionId',true); end loop;
        end if;
        block:=null; ambiguous:=false;
      end if;
      if mode='heading' then in_employment:=true; continue;
      elsif mode='barrier' or mode='unlabelled' then in_employment:=false; continue;
      elsif mode='protected' then if protected->>(span->>'id')<>'employment' then in_employment:=false; end if; continue;
      elsif mode='blank' then continue;
      end if;
      if not in_employment then continue; end if;
      suffix:=substring(text_value from char_length(prefix[1])+1);
      start_pos:=char_length(prefix[1])+char_length(suffix)-char_length(ltrim(suffix,private.grouped_import_whitespace()));
      end_pos:=char_length(rtrim(text_value,private.grouped_import_whitespace()));
      select count(*) into labels_count from regexp_matches(folded collate "C",'(?:^[\t ]*|[|;]'||ws||'*)(employer|role|dates)'||ws||'*:','g');
      obs:=relevant->0;
      exact_line:=jsonb_array_length(values_here)=1 and jsonb_array_length(relevant)=1 and obs->>'field'=field_name
        and jsonb_array_length(obs->'citations')=1 and obs->'citations'->0->'spanId'=span->'id'
        and obs->'citations'->0->'start'=to_jsonb(start_pos) and obs->'citations'->0->'end'=to_jsonb(end_pos)
        and obs->>'value'=private.grouped_import_trim(suffix) and labels_count=1;
      if exact_line is not true then block:=coalesce(block,'[]'::jsonb)||relevant; ambiguous:=true; continue; end if;
      if block is null and field_name<>'employer' then continue; end if;
      block:=coalesce(block,'[]'::jsonb);
      if exists(select 1 from jsonb_array_elements(block) where value->>'field'=field_name) then ambiguous:=true; end if;
      block:=block||jsonb_build_array(obs);
    end loop;
    group_value:=private.grouped_import_flush(block,ambiguous,assigned);
    if group_value is not null then
      result:=result||jsonb_build_array(group_value);
      for obs in select value from jsonb_array_elements(group_value->'members') loop assigned:=assigned||jsonb_build_object(obs->>'assertionId',true); end loop;
    end if;
  end loop;
  return result;
end;
$$;

create function private.grouped_import_check_refs(p_refs jsonb,p_facts jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare ref text; seen jsonb:='{}';
begin
  for ref in select jsonb_array_elements_text(p_refs) loop
    if seen ? ref or not (p_facts ? ref) then perform private.grouped_import_invalid(); end if;
    seen:=seen||jsonb_build_object(ref,true);
  end loop;
end;
$$;

create function private.grouped_import_place_original(p_envelope jsonb,p_binding jsonb,p_original jsonb,p_selections jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare idx jsonb:=private.grouped_import_source_index(p_envelope,p_binding); projected jsonb; canonical_selection jsonb;
  facts jsonb:='{}'; facts_by_source jsonb:='{}'; assertion_facts jsonb:='{}'; matched_facts jsonb:='{}';
  identities jsonb:='{}'; locations jsonb:='{}'; non_entry jsonb:='{}'; merged jsonb:='{}'; removed jsonb:='{}'; assigned jsonb:='{}';
  fact jsonb; citation jsonb; span jsonb; candidate jsonb; section jsonb; entry jsonb; bullet jsonb; event jsonb;
  selection jsonb; member jsonb; mapping jsonb; matches jsonb; anchor jsonb; matched jsonb; location jsonb;
  expected_sources jsonb; normalized_sources jsonb; ids jsonb; mappings jsonb:='[]'; new_sections jsonb:='[]'; new_entries jsonb; new_entry jsonb;
  document jsonb; input_producer_copy jsonb; ref text; key text; fact_id text; object_id text;
  content_units integer:=0; entry_index integer; minimum_index integer;
begin
  if jsonb_typeof(p_original) is distinct from 'object' or jsonb_typeof(p_selections) is distinct from 'array' then
    perform private.grouped_import_invalid();
  end if;
  if jsonb_array_length(p_selections) not between 1 and 32 then perform private.grouped_import_invalid(); end if;
  -- Keep current original-import structure/byte limits, then supplement refinements.
  if octet_length(p_original::text)>1048576 then perform private.grouped_import_invalid(); end if;
  if private.canonical_shape_valid(p_original) is not true then perform private.grouped_import_invalid(); end if;
  if p_original->>'producerVersion' is distinct from 'canonical-engine/1.0.1'
    or p_original->'parentVersionId' is distinct from 'null'::jsonb or p_original->>'state' is distinct from 'review_required'
    or p_original->'ownerId' is distinct from p_binding->'ownerId' or p_original->'organizationId' is distinct from p_binding->'organizationId'
    or p_original->'resumeId' is distinct from p_binding->'resumeId' or p_original->'analysisId' is distinct from p_binding->'analysisId'
    or p_original->'inputSha256' is distinct from p_binding->'inputSha256'
    or p_original->'sourceEvidenceVersionId' is distinct from p_binding->'attemptId'
    or p_original->'retentionPolicyId' is distinct from p_envelope->'retentionPolicyId'
    or p_original->'locale' is distinct from p_binding->'effectiveLocale'
    or jsonb_array_length(p_original->'changes')<>1 then perform private.grouped_import_invalid(); end if;
  event:=p_original->'changes'->0;
  if event->'actorId' is distinct from p_binding->'ownerId' or event->>'action' is distinct from 'import'
    or event->'targetId' is distinct from p_original->'versionId' or event->'priorValue' is distinct from 'null'::jsonb
    or event->'createdAt' is distinct from p_original->'createdAt' then perform private.grouped_import_invalid(); end if;
  foreach object_id in array array[p_original->>'resumeId',p_original->>'versionId',event->>'id'] loop
    if identities ? object_id then perform private.grouped_import_invalid(); end if;
    identities:=identities||jsonb_build_object(object_id,true);
  end loop;
  for fact in select value from jsonb_array_elements(p_original->'facts') loop
    fact_id:=fact->>'id';
    if identities ? fact_id or fact->>'state' is distinct from 'unconfirmed' or fact->'confirmation' is distinct from 'null'::jsonb
      or jsonb_array_length(fact->'sources')=0 or fact->>'value' is distinct from private.grouped_import_trim(fact->>'value')
      or private.grouped_import_utf16_length(fact->>'value') not between 1 and 2000 then perform private.grouped_import_invalid(); end if;
    identities:=identities||jsonb_build_object(fact_id,true); facts:=facts||jsonb_build_object(fact_id,fact);
    content_units:=content_units+private.grouped_import_utf16_length(fact->>'value');
    if content_units>200000 then perform private.grouped_import_invalid(); end if;
    for citation in select value from jsonb_array_elements(fact->'sources') loop
      if private.evidence_integer(citation->'start',0,200000) is not true or private.evidence_integer(citation->'end',1,200000) is not true then
        perform private.grouped_import_invalid();
      end if;
      span:=idx->'spans'->(citation->>'spanId');
      if span is null or citation->'attemptId' is distinct from p_binding->'attemptId'
        or (citation->>'end')::numeric::integer<=(citation->>'start')::numeric::integer or (citation->>'end')::numeric::integer>char_length(span->>'text')
        or substring(span->>'text' from (citation->>'start')::numeric::integer+1 for (citation->>'end')::numeric::integer-(citation->>'start')::numeric::integer)
          is distinct from fact->>'value' then perform private.grouped_import_invalid(); end if;
    end loop;
    select jsonb_agg(jsonb_build_object('attemptId',value->'attemptId','spanId',value->'spanId',
      'start',(value->>'start')::numeric::integer,'end',(value->>'end')::numeric::integer) order by ordinality)
      into normalized_sources from jsonb_array_elements(fact->'sources') with ordinality;
    key:=jsonb_build_array(fact->'type',fact->'value',normalized_sources)::text;
    facts_by_source:=jsonb_set(facts_by_source,array[key],coalesce(facts_by_source->key,'[]'::jsonb)||jsonb_build_array(fact_id),true);
  end loop;
  -- Bijection over all critical assertions, independent of selected groups.
  for candidate in select value from jsonb_array_elements(p_envelope->'assertions') loop
    select jsonb_agg(jsonb_build_object('attemptId',p_binding->'attemptId','spanId',value->'spanId','start',value->'start','end',value->'end') order by ordinality)
      into expected_sources from jsonb_array_elements(candidate->'evidence') with ordinality;
    select jsonb_agg(jsonb_build_object('attemptId',value->'attemptId','spanId',value->'spanId',
      'start',(value->>'start')::numeric::integer,'end',(value->>'end')::numeric::integer) order by ordinality)
      into normalized_sources from jsonb_array_elements(expected_sources) with ordinality;
    key:=jsonb_build_array(candidate->'field',candidate->'value',normalized_sources)::text;
    ids:=coalesce(facts_by_source->key,'[]'::jsonb);
    if jsonb_array_length(ids)<>1 or matched_facts ? (ids->>0) then perform private.grouped_import_invalid(); end if;
    assertion_facts:=assertion_facts||jsonb_build_object(candidate->>'id',ids->0);
    matched_facts:=matched_facts||jsonb_build_object(ids->>0,true);
  end loop;
  for fact in select value from jsonb_array_elements(p_original->'facts') loop
    if fact->>'type' in ('name','email','phone','employer','role','dates','education','certification')
      and not (matched_facts ? (fact->>'id')) then perform private.grouped_import_invalid(); end if;
  end loop;
  perform private.grouped_import_check_refs(p_original->'contactFactIds',facts);
  for ref in select jsonb_array_elements_text(p_original->'contactFactIds') loop
    if facts->ref->>'type' not in ('name','email','phone','link','location') then perform private.grouped_import_invalid(); end if;
    non_entry:=non_entry||jsonb_build_object(ref,true);
  end loop;
  for section in select value from jsonb_array_elements(p_original->'sections') loop
    object_id:=section->>'id';
    if identities ? object_id or section->>'title' is distinct from private.grouped_import_trim(section->>'title')
      or private.grouped_import_utf16_length(section->>'title') not between 1 and 100 then perform private.grouped_import_invalid(); end if;
    identities:=identities||jsonb_build_object(object_id,true);
    content_units:=content_units+private.grouped_import_utf16_length(section->>'title');
    if content_units>200000 then perform private.grouped_import_invalid(); end if;
    perform private.grouped_import_check_refs(section->'factIds',facts);
    for ref in select jsonb_array_elements_text(section->'factIds') loop non_entry:=non_entry||jsonb_build_object(ref,true); end loop;
    entry_index:=0;
    for entry in select value from jsonb_array_elements(section->'entries') loop
      object_id:=entry->>'id';
      if identities ? object_id then perform private.grouped_import_invalid(); end if;
      identities:=identities||jsonb_build_object(object_id,true);
      perform private.grouped_import_check_refs(entry->'factIds',facts);
      for ref in select jsonb_array_elements_text(entry->'factIds') loop
        location:=jsonb_build_object('sectionId',section->'id','sectionType',section->'type','entryId',entry->'id','entryIndex',entry_index,
          'pure',jsonb_array_length(entry->'factIds')=1 and jsonb_array_length(entry->'bullets')=0);
        locations:=jsonb_set(locations,array[ref],coalesce(locations->ref,'[]'::jsonb)||jsonb_build_array(location),true);
      end loop;
      for bullet in select value from jsonb_array_elements(entry->'bullets') loop
        object_id:=bullet->>'id';
        if identities ? object_id or bullet->>'text' is distinct from private.grouped_import_trim(bullet->>'text')
          or private.grouped_import_utf16_length(bullet->>'text') not between 1 and 2000 then perform private.grouped_import_invalid(); end if;
        identities:=identities||jsonb_build_object(object_id,true);
        content_units:=content_units+private.grouped_import_utf16_length(bullet->>'text');
        if content_units>200000 then perform private.grouped_import_invalid(); end if;
        perform private.grouped_import_check_refs(bullet->'factIds',facts);
        if jsonb_array_length(bullet->'factIds')<>1 or facts->(bullet->'factIds'->>0)->'value' is distinct from bullet->'text' then
          perform private.grouped_import_invalid();
        end if;
        for ref in select jsonb_array_elements_text(bullet->'factIds') loop non_entry:=non_entry||jsonb_build_object(ref,true); end loop;
      end loop;
      entry_index:=entry_index+1;
    end loop;
  end loop;
  projected:=private.grouped_import_project_candidates(p_envelope,p_binding);
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into canonical_selection
    from jsonb_array_elements(projected) with ordinality where value in (select value from jsonb_array_elements(p_selections));
  if canonical_selection is distinct from p_selections then perform private.grouped_import_invalid(); end if;
  -- Build every mapping/removal plan before changing any returned structure.
  for selection in select value from jsonb_array_elements(canonical_selection) loop
    if jsonb_array_length(selection->'members') not between 2 and 3 then perform private.grouped_import_invalid(); end if;
    matches:='[]'; anchor:=null;
    for member in select value from jsonb_array_elements(selection->'members') loop
      fact_id:=assertion_facts->>(member->>'assertionId');
      ids:=coalesce(locations->fact_id,'[]'::jsonb);
      if fact_id is null or assigned ? fact_id or non_entry ? fact_id or jsonb_array_length(ids)<>1 then perform private.grouped_import_invalid(); end if;
      location:=ids->0;
      if location->>'sectionType'<>'experience' or location->'pure' is distinct from 'true'::jsonb then perform private.grouped_import_invalid(); end if;
      matched:=jsonb_build_object('member',member,'factId',fact_id,'location',location);
      matches:=matches||jsonb_build_array(matched); assigned:=assigned||jsonb_build_object(fact_id,true);
      if member->>'field'='employer' then anchor:=matched; end if;
    end loop;
    if anchor is null then perform private.grouped_import_invalid(); end if;
    if exists(select 1 from jsonb_array_elements(matches) where value->'location'->'sectionId' is distinct from anchor->'location'->'sectionId') then
      perform private.grouped_import_invalid();
    end if;
    select min((value->'location'->>'entryIndex')::numeric::integer) into minimum_index from jsonb_array_elements(matches);
    if minimum_index<>(anchor->'location'->>'entryIndex')::numeric::integer then perform private.grouped_import_invalid(); end if;
    select jsonb_agg(value->'factId' order by (value->'location'->>'entryIndex')::numeric::integer) into ids from jsonb_array_elements(matches);
    merged:=merged||jsonb_build_object(anchor->'location'->>'entryId',ids);
    mapping:=jsonb_build_object('selection',selection,'sectionId',anchor->'location'->'sectionId','entryId',anchor->'location'->'entryId','members','[]'::jsonb);
    for matched in select value from jsonb_array_elements(matches) order by (value->'location'->>'entryIndex')::numeric::integer loop
      if matched->'location'->'entryId' is distinct from anchor->'location'->'entryId' then removed:=removed||jsonb_build_object(matched->'location'->>'entryId',true); end if;
      member:=matched->'member';
      mapping:=jsonb_set(mapping,'{members}',(mapping->'members')||jsonb_build_array(jsonb_build_object('assertionId',member->'assertionId',
        'field',member->'field','factId',matched->'factId','originalEntryId',matched->'location'->'entryId','citations',member->'citations')));
    end loop;
    mappings:=mappings||jsonb_build_array(mapping);
  end loop;
  for section in select value from jsonb_array_elements(p_original->'sections') loop
    new_entries:='[]';
    for entry in select value from jsonb_array_elements(section->'entries') loop
      if removed ? (entry->>'id') then continue; end if;
      new_entry:=entry;
      if merged ? (entry->>'id') then new_entry:=jsonb_set(entry,'{factIds}',merged->(entry->>'id')); end if;
      new_entries:=new_entries||jsonb_build_array(new_entry);
    end loop;
    new_sections:=new_sections||jsonb_build_array(jsonb_set(section,'{entries}',new_entries));
  end loop;
  document:=jsonb_set(jsonb_set(p_original,'{sections}',new_sections),'{producerVersion}','"canonical-engine/1.0.3"'::jsonb);
  input_producer_copy:=jsonb_set(document,'{producerVersion}','"canonical-engine/1.0.1"'::jsonb);
  if private.canonical_shape_valid(input_producer_copy) is not true
    or (document-array['producerVersion','sections']) is distinct from (p_original-array['producerVersion','sections']) then
    perform private.grouped_import_invalid();
  end if;
  return jsonb_build_object('schemaVersion','grouped-original-placement/1.0.0','authority','derived_preparation_only',
    'persistable',false,'scoringEligible',false,'requiresDurableAdmission',true,'document',document,'mappings',mappings);
end;
$$;

revoke all on function private.grouped_import_invalid(),private.grouped_import_keys(jsonb,text[]),private.grouped_import_whitespace(),private.grouped_import_trim(text),
  private.grouped_import_ascii_lower(text),private.grouped_import_utf16_length(text),private.grouped_import_uuid(jsonb),
  private.grouped_import_source_index(jsonb,jsonb),private.grouped_import_same_span(text,jsonb),private.grouped_import_flush(jsonb,boolean,jsonb),
  private.grouped_import_project_candidates(jsonb,jsonb),private.grouped_import_check_refs(jsonb,jsonb),
  private.grouped_import_place_original(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

commit;
