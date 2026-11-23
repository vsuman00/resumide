-- A11 typed authoring source. Intentionally NOT activated by this migration.
-- No existing writer, source policy or readiness manifest is replaced here.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '15s';
set local search_path = '';

create function private.typed_authoring_sha256(p_value text) returns text
language sql immutable strict set search_path='' as $$
  select encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex');
$$;

-- Portable A11OP1 atom bytes; semantic order/authority belongs to the caller.
create function private.typed_authoring_atoms_sha256(p_atoms text[]) returns text
language plpgsql immutable set search_path='' as $$
declare encoded bytea:=convert_to(E'A11OP1\n','UTF8'); atom text; part bytea;
begin
  if p_atoms is null or cardinality(p_atoms)>256
    or coalesce(array_ndims(p_atoms),1)<>1 then
    raise exception 'TYPED_AUTHORING_CODEC_LIMIT' using errcode='22023'; end if;
  foreach atom in array p_atoms loop
    if atom is null then part:=convert_to('N;','UTF8');
    else
      if octet_length(atom)>16384 then raise exception 'TYPED_AUTHORING_CODEC_LIMIT' using errcode='22023'; end if;
      part:=convert_to('T'||octet_length(convert_to(atom,'UTF8'))::text||':'||atom||';','UTF8');
    end if;
    if octet_length(encoded)+octet_length(part)>16384 then
      raise exception 'TYPED_AUTHORING_CODEC_LIMIT' using errcode='22023'; end if;
    encoded:=encoded||part;
  end loop;
  return encode(extensions.digest(encoded,'sha256'),'hex');
end;
$$;

-- Exact leading create-action substitution, never arbitrary supplied prose.
create function private.typed_authoring_replacement(p_value text,p_transform jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare from_form text; to_form text; rest text;
begin
  if private.evidence_keys(p_transform,array['from','to','case','restSha256']) is not true
    or jsonb_typeof(p_transform->'from') is distinct from 'string'
    or jsonb_typeof(p_transform->'to') is distinct from 'string'
    or jsonb_typeof(p_transform->'case') is distinct from 'string'
    or p_transform->>'from' not in ('Built','Created','Developed')
    or p_transform->>'to' not in ('Built','Created','Developed')
    or p_transform->>'case' not in ('lower','title')
    or p_transform->>'from'=p_transform->>'to'
    or jsonb_typeof(p_transform->'restSha256') is distinct from 'string'
    or (p_transform->>'restSha256') !~ '^[a-f0-9]{64}$'
    or p_value is null or private.grouped_import_utf16_length(p_value) not between 1 and 2000
    or p_value ~ E'[\n\r;]'
    or p_value collate "C" ~* '(^|[^A-Za-z0-9_])(not|never|without)([^A-Za-z0-9_]|$)' then
    perform private.correction_fail('invalid'); end if;
  from_form:=case when p_transform->>'case'='title' then p_transform->>'from'
    when p_transform->>'from'='Built' then 'built' when p_transform->>'from'='Created' then 'created' else 'developed' end;
  to_form:=case when p_transform->>'case'='title' then p_transform->>'to'
    when p_transform->>'to'='Built' then 'built' when p_transform->>'to'='Created' then 'created' else 'developed' end;
  if convert_to(left(p_value,char_length(from_form)),'UTF8')<>convert_to(from_form,'UTF8') then
    perform private.correction_fail('invalid'); end if;
  rest:=substring(p_value from char_length(from_form)+1);
  if left(rest,1) not in (' ',E'\t') or char_length(rest)<2
    or private.typed_authoring_sha256(rest) is distinct from p_transform->>'restSha256'
    or private.grouped_import_utf16_length(to_form||rest)>2000 then
    perform private.correction_fail('invalid'); end if;
  return to_form||rest;
end;
$$;

create function private.typed_authoring_uuid(p_value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(p_value)='string' and (p_value#>>'{}') ~* '^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
$$;
create function private.typed_authoring_validate(p_command jsonb) returns void
language plpgsql immutable set search_path='' as $ta_validate$
declare value jsonb; key text; item jsonb;
  policies jsonb:=$policies${"authoringVersion":"typed-authoring-rules/1.0.0","authoringSha256":"9c3895d9abab9b0456b13cc10fa9c273bc968a5d9308da53c776a07e7d47acaf","writingSupportVersion":"legacy-source-transforms/1.0.4","coverageVersion":"typed-fact-coverage/1.0.1","coverageSha256":"197bb86275f3b27042e09326001ddb13c8fa9cd697f3dd9f65f39070f9c34e49","semanticVersion":"requirement-semantic-rules/1.0.1","semanticSha256":"88751c86a58ae71d433e9795b146f78987202373f7f9a439d2daea14d965edea","durationVersion":"requirement-duration/1.0.0","durationSha256":"a886bfc6fb4625a3d87b6f51758de4949c3b76e6916966a541fa238e2f55a046","durationSubjectVersion":"job-duration-subject-rules/1.0.0","durationSubjectSha256":"ef157c501f0f9d10ea9910b1dddc463a06fdb7a989cbb7409eecbea8caf955db"}$policies$::jsonb;
begin
  if p_command is null or octet_length(p_command::text)>16384
    or private.grouped_import_keys(p_command,array['schemaVersion','operation','idempotencyKey','acknowledgement','binding','diagnosticDigest','coverageDigest','semanticDigest','policies','target','clauseIds','transform','sourceCitations']) is not true
    or p_command->>'schemaVersion' is distinct from 'typed-authoring-command/1.0.0'
    or jsonb_typeof(p_command->'operation') is distinct from 'string'
    or p_command->>'operation' not in ('accept','reject')
    or private.typed_authoring_uuid(p_command->'idempotencyKey') is not true
    or p_command->'acknowledgement' is distinct from to_jsonb(p_command->>'operation'='accept')
    or p_command->'policies' is distinct from policies
    or private.grouped_import_keys(p_command->'binding',array['source','canonical','requirements','heads','profilesSha256']) is not true
    or private.grouped_import_keys(p_command->'binding'->'source',array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId','inputSha256']) is not true
    or private.grouped_import_keys(p_command->'binding'->'canonical',array['versionId','revision','contentSha256']) is not true
    or private.grouped_import_keys(p_command->'binding'->'requirements',array['versionId','revision','inputSha256','contentSha256']) is not true
    or private.grouped_import_keys(p_command->'binding'->'heads',array['canonicalHeadId','canonicalHeadRevision','requirementHeadId','requirementHeadRevision']) is not true
    or p_command->'binding'->>'profilesSha256' is distinct from 'f1aa440e764197f8aab96ddb9bf5c84dbdfdf177ff04063f15e6c4ccff78df62'
    or private.grouped_import_keys(p_command->'target',array['factId','sectionId','entryId','bulletId','currentValueSha256','confirmationActorId','confirmedAt']) is not true
    or private.grouped_import_keys(p_command->'transform',array['from','to','case','restSha256']) is not true
    or jsonb_typeof(p_command->'clauseIds') is distinct from 'array'
    or jsonb_array_length(p_command->'clauseIds')<>1
    or jsonb_typeof(p_command->'sourceCitations') is distinct from 'array'
    or jsonb_array_length(p_command->'sourceCitations')>20 then
    perform private.correction_fail('invalid'); end if;
  foreach key in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId'] loop
    if private.typed_authoring_uuid(p_command->'binding'->'source'->key) is not true then perform private.correction_fail('invalid'); end if;
  end loop;
  foreach key in array array['canonical','requirements'] loop
    value:=p_command->'binding'->key;
    if private.typed_authoring_uuid(value->'versionId') is not true or private.evidence_integer(value->'revision',1,2147483646) is not true
      or jsonb_typeof(value->'contentSha256') is distinct from 'string' or (value->>'contentSha256') !~ '^[a-f0-9]{64}$' then perform private.correction_fail('invalid'); end if;
  end loop;
  value:=p_command->'binding'->'heads';
  if private.typed_authoring_uuid(value->'canonicalHeadId') is not true or private.typed_authoring_uuid(value->'requirementHeadId') is not true
    or private.evidence_integer(value->'canonicalHeadRevision',1,2147483646) is not true or private.evidence_integer(value->'requirementHeadRevision',1,2147483646) is not true
    or value->'canonicalHeadId' is distinct from p_command->'binding'->'canonical'->'versionId'
    or value->'canonicalHeadRevision' is distinct from p_command->'binding'->'canonical'->'revision'
    or value->'requirementHeadId' is distinct from p_command->'binding'->'requirements'->'versionId'
    or value->'requirementHeadRevision' is distinct from p_command->'binding'->'requirements'->'revision' then perform private.correction_fail('invalid'); end if;
  foreach key in array array['diagnosticDigest','coverageDigest','semanticDigest'] loop
    if jsonb_typeof(p_command->key) is distinct from 'string' or (p_command->>key) !~ '^[a-f0-9]{64}$' then perform private.correction_fail('invalid'); end if;
  end loop;
  if jsonb_typeof(p_command->'binding'->'source'->'inputSha256') is distinct from 'string' or (p_command->'binding'->'source'->>'inputSha256') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_command->'binding'->'requirements'->'inputSha256') is distinct from 'string' or (p_command->'binding'->'requirements'->>'inputSha256') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_command->'clauseIds'->0) is distinct from 'string' or (p_command->'clauseIds'->>0) !~ '^[a-f0-9]{64}$' then perform private.correction_fail('invalid'); end if;
  value:=p_command->'target';
  foreach key in array array['factId','sectionId','entryId','confirmationActorId'] loop
    if private.typed_authoring_uuid(value->key) is not true then perform private.correction_fail('invalid'); end if;
  end loop;
  if (value->'bulletId'<>'null'::jsonb and private.typed_authoring_uuid(value->'bulletId') is not true)
    or value->'confirmationActorId' is distinct from p_command->'binding'->'source'->'ownerId'
    or jsonb_typeof(value->'currentValueSha256') is distinct from 'string' or (value->>'currentValueSha256') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(value->'confirmedAt') is distinct from 'string' or char_length(value->>'confirmedAt') not between 1 and 40 then perform private.correction_fail('invalid'); end if;
  for item in select x.value from jsonb_array_elements(p_command->'sourceCitations') x(value) loop
    if private.grouped_import_keys(item,array['attemptId','spanId','pageId','method','start','end','pageStart','pageEnd']) is not true
      or private.typed_authoring_uuid(item->'attemptId') is not true
      or jsonb_typeof(item->'spanId') is distinct from 'string' or char_length(item->>'spanId') not between 1 and 100
      or jsonb_typeof(item->'pageId') is distinct from 'string' or char_length(item->>'pageId') not between 1 and 100
      or jsonb_typeof(item->'method') is distinct from 'string' or item->>'method' not in ('native_text','local_ocr')
      or private.evidence_integer(item->'start',0,200000) is not true or private.evidence_integer(item->'end',1,200000) is not true
      or private.evidence_integer(item->'pageStart',0,500000) is not true or private.evidence_integer(item->'pageEnd',1,500000) is not true
      or (item->>'start')::numeric>=(item->>'end')::numeric or (item->>'pageStart')::numeric>=(item->>'pageEnd')::numeric then perform private.correction_fail('invalid'); end if;
  end loop;
end;
$ta_validate$;

create function private.typed_authoring_atoms(p_command jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare atoms text[]; x jsonb; key text;
begin
  perform private.typed_authoring_validate(p_command);
  atoms:=array[p_command->>'schemaVersion',p_command->>'operation',p_command->>'acknowledgement'];
  foreach key in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId','inputSha256'] loop atoms:=array_append(atoms,p_command->'binding'->'source'->>key); end loop;
  atoms:=atoms||array[p_command->'binding'->'canonical'->>'versionId',((p_command->'binding'->'canonical'->>'revision')::numeric::integer)::text,p_command->'binding'->'canonical'->>'contentSha256',
    p_command->'binding'->'requirements'->>'versionId',((p_command->'binding'->'requirements'->>'revision')::numeric::integer)::text,p_command->'binding'->'requirements'->>'inputSha256',p_command->'binding'->'requirements'->>'contentSha256',
    p_command->'binding'->'heads'->>'canonicalHeadId',((p_command->'binding'->'heads'->>'canonicalHeadRevision')::numeric::integer)::text,p_command->'binding'->'heads'->>'requirementHeadId',((p_command->'binding'->'heads'->>'requirementHeadRevision')::numeric::integer)::text,
    p_command->'binding'->>'profilesSha256',p_command->>'diagnosticDigest',p_command->>'coverageDigest',p_command->>'semanticDigest'];
  foreach key in array array['authoringVersion','authoringSha256','writingSupportVersion','coverageVersion','coverageSha256','semanticVersion','semanticSha256','durationVersion','durationSha256','durationSubjectVersion','durationSubjectSha256'] loop atoms:=array_append(atoms,p_command->'policies'->>key); end loop;
  foreach key in array array['factId','sectionId','entryId','bulletId','currentValueSha256','confirmationActorId','confirmedAt'] loop atoms:=array_append(atoms,p_command->'target'->>key); end loop;
  atoms:=array_append(atoms,jsonb_array_length(p_command->'clauseIds')::text);
  for x in select value from jsonb_array_elements(p_command->'clauseIds') loop atoms:=array_append(atoms,x#>>'{}'); end loop;
  foreach key in array array['from','to','case','restSha256'] loop atoms:=array_append(atoms,p_command->'transform'->>key); end loop;
  atoms:=array_append(atoms,jsonb_array_length(p_command->'sourceCitations')::text);
  for x in select value from jsonb_array_elements(p_command->'sourceCitations') loop
    foreach key in array array['attemptId','spanId','pageId','method'] loop atoms:=array_append(atoms,x->>key); end loop;
    foreach key in array array['start','end','pageStart','pageEnd'] loop atoms:=array_append(atoms,((x->>key)::numeric::integer)::text); end loop;
  end loop;
  return atoms;
end;
$$;

-- An ordinary edit/confirm child, derived from the owned parent. No caller body.
create function private.typed_authoring_child(p_parent jsonb,p_fact uuid,p_value text,p_confirm boolean,p_created text,p_version uuid,p_change uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare body jsonb; facts jsonb:='[]'; sections jsonb:='[]'; entries jsonb; bullets jsonb; fact jsonb; section jsonb; entry jsonb; bullet jsonb; prior_value text;
begin
  for fact in select value from jsonb_array_elements(p_parent->'facts') loop
    if fact->>'id'=p_fact::text then
      prior_value:=fact->>'value';
      if p_confirm then fact:=fact||jsonb_build_object('state','candidate_confirmed','confirmation',jsonb_build_object('actorId',p_parent->>'ownerId','value',fact->>'value','confirmedAt',p_created));
      else fact:=fact||jsonb_build_object('value',p_value,'sources','[]'::jsonb,'confirmation',null,'state','unconfirmed'); end if;
    end if;
    facts:=facts||jsonb_build_array(fact);
  end loop;
  if prior_value is null then perform private.correction_fail('invalid'); end if;
  for section in select value from jsonb_array_elements(p_parent->'sections') loop
    entries:='[]';
    for entry in select value from jsonb_array_elements(section->'entries') loop
      bullets:='[]';
      for bullet in select value from jsonb_array_elements(entry->'bullets') loop
        if not p_confirm and bullet->'factIds'=jsonb_build_array(p_fact::text) then bullet:=bullet||jsonb_build_object('text',p_value); end if;
        bullets:=bullets||jsonb_build_array(bullet);
      end loop;
      entries:=entries||jsonb_build_array(entry||jsonb_build_object('bullets',bullets));
    end loop;
    sections:=sections||jsonb_build_array(section||jsonb_build_object('entries',entries));
  end loop;
  body:=p_parent||jsonb_build_object('versionId',p_version,'parentVersionId',p_parent->>'versionId','createdAt',p_created,'state','review_required','facts',facts,'sections',sections,
    'changes',jsonb_build_array(jsonb_build_object('id',p_change,'actorId',p_parent->>'ownerId','action','edit','targetId',p_fact,'priorValue',prior_value,'createdAt',p_created)));
  if private.canonical_shape_valid(body) is not true then perform private.correction_fail('invalid'); end if;
  return body;
end;
$$;


-- Native support is a source-preserving relevance proof, not JD satisfaction.
-- Unknown saved expressions may still contain actual admitted skill tokens;
-- no boolean/duration interpretation or numeric qualification is invented.
create function private.typed_authoring_support(p_context jsonb,p_fact jsonb,p_clause_id text) returns void
language plpgsql immutable set search_path='' as $ta_support$
declare declared integer; populated integer; clause jsonb; item jsonb; token jsonb; ids jsonb:='[]'; operand jsonb;
  raw text; pieces text[]; object_text text; skill_text text; skill_mapping jsonb; token_mapping jsonb;
  relevant boolean:=false; words text[]; word text; row_value record; span jsonb; cite jsonb; text_value text; heading text;
  blocked boolean:=false; quoted boolean:=false; matched integer:=0; before_text text; after_text text;
  object_index integer; object_point integer; object_char text;
  -- Exact Pc/Pd scalars from pinned Node22.23.4 / Unicode 17.0; L/N/M reuse the existing frozen JD profile.
  punctuation integer[]:=array[45,95,1418,1470,5120,6150,8208,8209,8210,8211,8212,8213,8255,8256,8276,11799,11802,11834,11835,11840,11869,12316,12336,12448,65073,65074,65075,65076,65101,65102,65103,65112,65123,65293,65343,68974,69293];
  personal text[]:=array['personal contributions','individual contributions','personal achievements','individual achievements'];
  neutral text[]:=array['experience','work experience','professional experience','employment','employment history','projects','skills','technical skills','education','summary','professional summary','responsibilities','achievements','contributions'];
  forbidden text[]:=array['not','no','never','without','cannot','will','would','could','may','might','shall','should','if','unless','planned','planning','intend','intended','aim','goal','potential','i','we','he','she','they','it','them','their','our','my','his','her','you','your','its','team','teams','by','and','or','but','then','while','alongside','together','plus','also'];
begin
  if p_context->'sourceMetadata'->'pageCount'='null'::jsonb
    or private.evidence_integer(p_context->'sourceMetadata'->'pageCount',1,2147483647) is not true
    or p_context->'canonical'->>'locale' is distinct from 'en-IN'
    or p_context->'requirements'->'content'->>'locale' is distinct from 'en-IN'
    or p_context->'requirements'->'content'->>'domain' is distinct from 'software-engineering'
    or p_context->'requirements'->'content'->>'state'='unsupported'
    or p_context->'attempt'->'envelope'->>'status' is distinct from 'review_required' then perform private.correction_fail('unavailable'); end if;
  declared:=(p_context->'sourceMetadata'->>'pageCount')::integer;
  select count(*) into populated from jsonb_array_elements(p_context->'attempt'->'envelope'->'nativeSource'->'pages') page(value)
    where exists(select 1 from jsonb_array_elements(p_context->'attempt'->'envelope'->'spans') sp(value) where sp.value->>'pageId'=page.value->>'id' and private.grouped_import_trim(sp.value->>'text')<>'')
      or exists(select 1 from jsonb_array_elements(coalesce(p_context->'attempt'->'envelope'->'ocrSource'->'pages','[]'::jsonb)) op(value) where op.value->'pageNumber'=page.value->'pageNumber' and private.grouped_import_trim(op.value->>'text')<>'');
  if populated<>declared or jsonb_array_length(p_context->'attempt'->'envelope'->'nativeSource'->'pages')>declared then perform private.correction_fail('unavailable'); end if;
  select value into clause from jsonb_array_elements(p_context->'requirements'->'content'->'relations'->'clauses') where value->>'id'=p_clause_id;
  if clause is null or clause->'scope'->'negated' is distinct from 'false'::jsonb or clause->'scope'->>'importance' not in ('required','preferred') then perform private.correction_fail('invalid'); end if;
  if clause->'skillExpression'->>'kind'='unknown' then ids:=clause->'skillExpression'->'observedRequirementIds';
  elsif clause->'skillExpression'->>'kind'='atom' then ids:=clause->'skillExpression'->'requirementIds';
  else
    for operand in select value from jsonb_array_elements(clause->'skillExpression'->'operands') loop ids:=ids||operand->'requirementIds'; end loop;
  end if;
  -- A create-action kernel intersects the existing source-contribution grammar.
  -- Responsible/Used declarations cannot acquire a fabricated create-action.
  raw:=p_fact->>'value';
  if right(raw,1)='.' then raw:=left(raw,char_length(raw)-1); end if;
  if raw ~ $quotes$["'`“”‘’]$quotes$ or raw ~ E'[\\n\\r;,&]' then perform private.correction_fail('invalid'); end if;
  for word in select x[1] from regexp_matches(translate(raw,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'[a-z]+','g') x loop
    if word=any(forbidden) then perform private.correction_fail('invalid'); end if;
  end loop;
  pieces:=regexp_match(raw collate "C",E'^(Built|Developed|built|developed)[\\t ]+([^\\t ].*?)[\\t ]+using[\\t ]+([^\\t ].*)$','i');
  if pieces is null then perform private.correction_fail('invalid'); end if;
  object_text:=pieces[2];skill_text:=pieces[3];
  if char_length(object_text) not between 1 and 160
    or private.jd_relation_in_ranges(private.jd_relation_ln_ranges(),ascii(left(object_text,1))) is not true then perform private.correction_fail('invalid'); end if;
  for object_index in 1..char_length(object_text) loop
    object_char:=substring(object_text from object_index for 1);object_point:=ascii(object_char);
    if private.jd_relation_in_ranges(private.jd_relation_unicode_profile()->'data'->'identifierRanges',object_point) is not true
      and not (object_point=any(punctuation)) and object_char not in (' ',E'\t','/') then perform private.correction_fail('invalid'); end if;
  end loop;
  skill_mapping:=private.jd_relation_alias(skill_text);
  for item in select value from jsonb_array_elements(p_context->'requirements'->'content'->'requirements') loop
    if item->>'type'<>'skill' or not (ids ? (item->>'id')) then continue; end if;
    for token in select value from jsonb_array_elements(item->'tokenEvidence') loop
      if (token->>'start')::integer<(clause->'evidence'->>'start')::integer or (token->>'end')::integer>(clause->'evidence'->>'end')::integer then continue; end if;
      if convert_to(substring(p_context->'requirements'->'content'->>'sourceText' from (token->>'start')::integer+1 for (token->>'end')::integer-(token->>'start')::integer),'UTF8')<>convert_to(token->>'quote','UTF8') then perform private.correction_fail('invalid'); end if;
      token_mapping:=private.jd_relation_alias(token->>'quote');
      if skill_mapping->>'conceptId' is not null and skill_mapping->>'conceptId'=token_mapping->>'conceptId'
        or translate(regexp_replace(btrim(skill_text,E' \t'),E'[\\t ]+',' ','g'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=
          translate(regexp_replace(btrim(token->>'quote',E' \t'),E'[\\t ]+',' ','g'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') then relevant:=true; end if;
    end loop;
  end loop;
  if not relevant or jsonb_array_length(p_fact->'sources')=0 then perform private.correction_fail('invalid'); end if;
  -- Re-derive selected immutable stream scope, including sticky quotation blocks.
  for row_value in select sp.value as data from jsonb_array_elements(p_context->'attempt'->'envelope'->'nativeSource'->'pages') with ordinality page(value,n)
    cross join lateral jsonb_array_elements(p_context->'attempt'->'envelope'->'spans') sp(value)
    where sp.value->>'pageId'=page.value->>'id' and sp.value->>'method'=case when exists(select 1 from jsonb_array_elements(coalesce(p_context->'attempt'->'envelope'->'ocrSource'->'pages','[]'::jsonb)) op(value) where op.value->'pageNumber'=page.value->'pageNumber') then 'local_ocr' else 'native_text' end
    order by page.n,(sp.value->>'start')::integer loop
    span:=row_value.data;text_value:=btrim(span->>'text',E' \t');
    heading:=translate(regexp_replace(regexp_replace(text_value,E':[\\t ]*$',''),E'[\\t ]+',' ','g'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
    if heading=any(personal) then blocked:=false; end if;
    for cite in select value from jsonb_array_elements(p_fact->'sources') where value->>'spanId'=span->>'id' loop
      matched:=matched+1;
      before_text:=substring(span->>'text' from 1 for (cite->>'start')::integer);
      after_text:=substring(span->>'text' from (cite->>'end')::integer+1);
      if blocked or quoted or before_text !~ (E'^[\\t '||chr(160)||']*([•*–—-][\\t '||chr(160)||']+)?$')
        or after_text !~ (E'^[\\t '||chr(160)||']*[.]?[\\t '||chr(160)||']*$') then perform private.correction_fail('invalid'); end if;
    end loop;
    if heading=any(personal) or heading=any(neutral) then continue; end if;
    if text_value ~ $delimiter$^["'`“”‘’]+$$delimiter$ then quoted:=true;
    elsif text_value collate "C" ~* '^(team|company|organization|department|group|client|our|their)([^A-Za-z0-9_]|$)' then blocked:=true;
    elsif right(text_value,1)=':' or text_value collate "C" ~* '^(not|no|never|planned|planning|future)([^A-Za-z0-9_]|$)' then blocked:=true; end if;
  end loop;
  if matched<>jsonb_array_length(p_fact->'sources') then perform private.correction_fail('invalid'); end if;
end;
$ta_support$;

create function public.apply_typed_authoring_action(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_request_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $ta_apply$
declare a public.analyses%rowtype; source_row public.resume_versions%rowtype; root public.resumes%rowtype; current_head public.canonical_resume_heads%rowtype;
  canonical public.canonical_resume_versions%rowtype; jd public.job_requirement_versions%rowtype; prior public.authoring_events%rowtype;
  context jsonb; fact jsonb; span jsonb; cite jsonb; actual_citations jsonb:='[]'; seen text[]:='{}'; location jsonb;
  native_binding jsonb; replacement text; command_sha text; value_text text; created text; event_id uuid; edit_id uuid; confirm_id uuid;
  edit_body jsonb; confirm_body jsonb; saved jsonb; result_value jsonb; canonical_command jsonb; result_version uuid; result_revision integer;
  profiles jsonb:=$profiles${"evidenceSchemaVersion":"evidence/2.0.0","fieldExtractorVersion":"evidence-fields/1.0.1","targetModelVersion":"evidence-targets/1.0.0","associationModelVersion":"evidence-entry-associations/1.0.0","correctionProjectionVersion":"canonical-corrections/1.0.1","regroupModelVersion":"canonical-entry-regroup/1.0.0","jdAdmissionProfileSha256":"e82d68b1e58cf220d3584a8d510128d4428441a2b02815711e7f198adaeaacb8","aliasPolicyVersion":"jd-local-aliases/1.0.0","aliasLexiconSha256":"e5298fd95320299996a4f5eceff3fc7afcd61ed636aaec386e1d4107a7500fa2","relationPolicyVersion":"jd-local-relation-rules/1.0.0","relationPolicySha256":"fd69dde2640bcdc1cdd76ce622015cb577090d61581515585f7cdfe0cdcd8cdc","unicodePolicyVersion":"jd-unicode-profile/1.0.0","unicodePolicySha256":"f3f8335d9a957bc16e33d61321f28ed7a12c8c81ff8912f0c17c041d86d95571","readinessProfileVersion":"requirement-relationship-readiness/1.0.0","readinessPredecessorSha256":"de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd"}$profiles$::jsonb;
begin
  perform private.typed_authoring_validate(p_command);
  if p_user_id is null or p_analysis_id is null or p_request_id is distinct from p_command->>'idempotencyKey'
    or p_command->'binding'->'source'->>'ownerId' is distinct from p_user_id::text
    or p_command->'binding'->'source'->>'analysisId' is distinct from p_analysis_id::text then perform private.correction_fail('invalid'); end if;
  -- Establish the actual owner before the common mutex and before any row lock.
  select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id;
  if not found then perform private.correction_fail('not_found'); end if;
  perform private.lock_candidate_owners(array[p_user_id]);
  if private.try_candidate_privacy_write(p_user_id) is not true then perform private.correction_fail('not_found'); end if;
  select r.* into root from public.resumes r join public.resume_versions s on s.resume_id=r.id
    where s.id=a.resume_version_id and r.owner_id=p_user_id and r.organization_id=a.organization_id for update of r;
  if not found or root.status is distinct from 'active' then perform private.correction_fail('not_found'); end if;
  select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id and organization_id=root.organization_id for update;
  if not found then perform private.correction_fail('not_found'); end if;
  select * into source_row from public.resume_versions where id=a.resume_version_id and resume_id=root.id and owner_id=p_user_id and organization_id=a.organization_id for share;
  if not found then perform private.correction_fail('not_found'); end if;
  perform 1 from public.memberships where organization_id=a.organization_id and user_id=p_user_id and role in ('owner','admin','member') for share;
  if not found then perform private.correction_fail('not_found'); end if;
  if (p_command->'binding'->'source'->>'organizationId',p_command->'binding'->'source'->>'resumeId',p_command->'binding'->'source'->>'sourceId',p_command->'binding'->'source'->>'inputSha256')
    is distinct from (a.organization_id::text,root.id::text,source_row.id::text,source_row.checksum) then perform private.correction_fail('not_found'); end if;
  command_sha:=private.typed_authoring_atoms_sha256(private.typed_authoring_atoms(p_command));
  -- Current access precedes exact replay; fresh heads are checked only afterward.
  select * into prior from public.authoring_events where analysis_id=p_analysis_id and idempotency_key=(p_command->>'idempotencyKey')::uuid;
  if found then
    if prior.command is distinct from p_command or (prior.owner_id,prior.organization_id,prior.resume_id) is distinct from (p_user_id,a.organization_id,root.id)
      or prior.result->>'schemaVersion' is distinct from 'typed-authoring-receipt/1.0.0'
      or prior.result->>'commandSha256' is distinct from command_sha
      or prior.result->>'eventId' is distinct from prior.id::text
      or prior.result->>'baseVersionId' is distinct from prior.base_version_id::text then perform private.correction_fail('conflict'); end if;
    return prior.result||jsonb_build_object('idempotent',true);
  end if;
  if private.canonical_correction_write_ready() is not true then perform private.correction_fail('unavailable'); end if;
  select * into current_head from public.canonical_resume_heads where resume_id=root.id and owner_id=p_user_id and organization_id=a.organization_id for update;
  if not found then perform private.correction_fail('conflict'); end if;
  select * into canonical from public.canonical_resume_versions where id=current_head.version_id and owner_id=p_user_id and organization_id=a.organization_id and resume_id=root.id;
  if not found or canonical.source_resume_version_id<>source_row.id then perform private.correction_fail('conflict'); end if;
  select * into jd from public.job_requirement_versions where analysis_id=p_analysis_id and owner_id=p_user_id and organization_id=a.organization_id order by revision desc limit 1 for share;
  if not found or jd.job_id is distinct from a.job_id then perform private.correction_fail('conflict'); end if;
  native_binding:=jsonb_build_object('source',jsonb_build_object('ownerId',p_user_id,'organizationId',a.organization_id,'resumeId',root.id,'analysisId',p_analysis_id,'sourceId',source_row.id,'attemptId',canonical.source_evidence_version_id,'inputSha256',source_row.checksum),
    'canonical',jsonb_build_object('versionId',canonical.id,'revision',canonical.revision,'contentSha256',private.typed_authoring_sha256(canonical.content::text)),
    'requirements',jsonb_build_object('versionId',jd.id,'revision',jd.revision,'inputSha256',jd.content->>'inputSha256','contentSha256',private.typed_authoring_sha256(jd.content::text)),
    'heads',jsonb_build_object('canonicalHeadId',current_head.version_id,'canonicalHeadRevision',current_head.revision,'requirementHeadId',jd.id,'requirementHeadRevision',jd.revision),'profilesSha256','f1aa440e764197f8aab96ddb9bf5c84dbdfdf177ff04063f15e6c4ccff78df62');
  if p_command->'binding' is distinct from native_binding then perform private.correction_fail('conflict'); end if;
  -- Existing owned reader independently re-proves source, typed headers, JD and privacy.
  context:=public.read_requirement_relationship_context(p_user_id,p_analysis_id,jsonb_build_object('canonicalVersionId',canonical.id,'requirementVersionId',jd.id));
  if context->>'status' is distinct from 'available' or context->'profiles' is distinct from profiles
    or context->'source' is distinct from native_binding->'source'
    or context->'heads' is distinct from native_binding->'heads'
    or context->'canonical'->'content' is distinct from canonical.content
    or context->'requirements'->'content' is distinct from jd.content then perform private.correction_fail('unavailable'); end if;
  if not exists(select 1 from jsonb_array_elements(jd.content->'relations'->'clauses') c(value) where c.value->>'id'=p_command->'clauseIds'->>0
    and c.value->'scope'->'negated'='false'::jsonb and c.value->'scope'->>'importance' in ('required','preferred')) then perform private.correction_fail('invalid'); end if;
  select x.value into fact from jsonb_array_elements(canonical.content->'facts') x(value) where x.value->>'id'=p_command->'target'->>'factId';
  if fact is null or fact->>'type' is distinct from 'contribution' or fact->>'state' is distinct from 'candidate_confirmed'
    or fact->'confirmation'->>'actorId' is distinct from p_user_id::text or fact->'confirmation'->>'value' is distinct from fact->>'value'
    or fact->'confirmation'->>'confirmedAt' is distinct from p_command->'target'->>'confirmedAt'
    or private.typed_authoring_sha256(fact->>'value') is distinct from p_command->'target'->>'currentValueSha256' then perform private.correction_fail('invalid'); end if;
  location:=private.correction_location(canonical.content,(fact->>'id')::uuid);
  if jsonb_array_length(location)<>1 or location->0->>'kind' not in ('entry','bullet')
    or location->0->'sectionId' is distinct from p_command->'target'->'sectionId'
    or location->0->'entryId' is distinct from p_command->'target'->'entryId'
    or location->0->'bulletId' is distinct from p_command->'target'->'bulletId' then perform private.correction_fail('invalid'); end if;
  for cite in select value from jsonb_array_elements(fact->'sources') loop
    if cite->>'attemptId' is distinct from canonical.source_evidence_version_id::text then perform private.correction_fail('invalid'); end if;
    select x.value into span from jsonb_array_elements(context->'attempt'->'envelope'->'spans') x(value) where x.value->>'id'=cite->>'spanId';
    if span is null or (cite->>'end')::integer-(cite->>'start')::integer<>char_length(fact->>'value')
      or convert_to(substring(span->>'text' from (cite->>'start')::integer+1 for (cite->>'end')::integer-(cite->>'start')::integer),'UTF8')<>convert_to(fact->>'value','UTF8')
      or (cite->>'end')::integer>char_length(span->>'text') or cite::text=any(seen) then perform private.correction_fail('invalid'); end if;
    seen:=array_append(seen,cite::text);
    actual_citations:=actual_citations||jsonb_build_array(cite||jsonb_build_object('pageId',span->>'pageId','method',span->>'method','pageStart',(span->>'start')::integer+(cite->>'start')::integer,'pageEnd',(span->>'start')::integer+(cite->>'end')::integer));
  end loop;
  if actual_citations is distinct from p_command->'sourceCitations' then perform private.correction_fail('invalid'); end if;
  perform private.typed_authoring_support(context,fact,p_command->'clauseIds'->>0);
  replacement:=private.typed_authoring_replacement(fact->>'value',p_command->'transform');
  if replacement is null or convert_to(replacement,'UTF8')=convert_to(fact->>'value','UTF8') then perform private.correction_fail('invalid'); end if;
  event_id:=gen_random_uuid();result_version:=canonical.id;result_revision:=canonical.revision;
  if p_command->>'operation'='accept' then
    if canonical.revision>2147483645 then perform private.correction_fail('invalid'); end if;
    edit_id:=gen_random_uuid();confirm_id:=gen_random_uuid();created:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    edit_body:=private.typed_authoring_child(canonical.content,(fact->>'id')::uuid,replacement,false,created,edit_id,gen_random_uuid());
    confirm_body:=private.typed_authoring_child(edit_body,(fact->>'id')::uuid,replacement,true,created,confirm_id,gen_random_uuid());
    canonical_command:=jsonb_build_object('operation','edit','expectedVersionId',canonical.id,'idempotencyKey',edit_id,'factId',fact->>'id','value',replacement,'targetVersionId',null);
    saved:=public.save_canonical_version(p_user_id,source_row.id,edit_body,canonical_command,p_request_id);
    if saved->>'status' is distinct from 'applied' or saved->>'versionId' is distinct from edit_id::text or saved->'idempotent' is distinct from 'false'::jsonb or saved->'revision' is distinct from to_jsonb(canonical.revision+1) then perform private.correction_fail('conflict'); end if;
    canonical_command:=jsonb_build_object('operation','confirm','expectedVersionId',edit_id,'idempotencyKey',confirm_id,'factId',fact->>'id','value',null,'targetVersionId',null);
    saved:=public.save_canonical_version(p_user_id,source_row.id,confirm_body,canonical_command,p_request_id);
    if saved->>'status' is distinct from 'applied' or saved->>'versionId' is distinct from confirm_id::text or saved->'idempotent' is distinct from 'false'::jsonb or saved->'revision' is distinct from to_jsonb(canonical.revision+2) then perform private.correction_fail('conflict'); end if;
    result_version:=confirm_id;result_revision:=canonical.revision+2;
  end if;
  result_value:=jsonb_build_object('schemaVersion','typed-authoring-receipt/1.0.0','status','applied','action',p_command->>'operation','idempotencyKey',p_command->>'idempotencyKey','commandSha256',command_sha,
    'baseVersionId',canonical.id,'baseRevision',canonical.revision,'requirementVersionId',jd.id,'requirementRevision',jd.revision,'versionId',result_version,'revision',result_revision,'eventId',event_id,'idempotent',false);
  insert into public.authoring_events(id,analysis_id,resume_id,owner_id,organization_id,base_version_id,result_version_id,idempotency_key,action,command,result,retention_policy_id)
    values(event_id,p_analysis_id,root.id,p_user_id,a.organization_id,canonical.id,case when p_command->>'operation'='accept' then result_version else null end,(p_command->>'idempotencyKey')::uuid,p_command->>'operation',p_command,result_value,canonical.content->>'retentionPolicyId');
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
    values(a.organization_id,p_user_id,'typed_authoring.'||(p_command->>'operation'),'authoring_event',event_id,'success',p_request_id);
  return result_value;
exception
  when insufficient_privilege then return jsonb_build_object('status','not_found');
  when sqlstate 'P0C01' or unique_violation then return jsonb_build_object('status','conflict');
  when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid');
  when others then return jsonb_build_object('status','unavailable');
end;
$ta_apply$;

-- Access is DENIED, including service_role. A later reviewed activation must
-- renew caller/producer/manifest/cutover admission; this is not a ready flag.
revoke all on function private.typed_authoring_sha256(text),private.typed_authoring_atoms_sha256(text[]),
  private.typed_authoring_replacement(text,jsonb),private.typed_authoring_uuid(jsonb),private.typed_authoring_validate(jsonb),
  private.typed_authoring_atoms(jsonb),private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid),private.typed_authoring_support(jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
-- Abort on unexpected default/inherited application grants; do not silently
-- turn a source-only migration into an activation through existing defaults.
do $ta_denial$
declare signature text; routine pg_catalog.pg_proc%rowtype; role_name text;
begin
  foreach signature in array array['private.typed_authoring_sha256(text)','private.typed_authoring_atoms_sha256(text[])',
    'private.typed_authoring_replacement(text,jsonb)','private.typed_authoring_uuid(jsonb)','private.typed_authoring_validate(jsonb)',
    'private.typed_authoring_atoms(jsonb)','private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid)',
    'private.typed_authoring_support(jsonb,jsonb,text)','public.apply_typed_authoring_action(uuid,uuid,jsonb,text)'] loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(signature);
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
      where acl.grantee<>routine.proowner and acl.privilege_type='EXECUTE') then
      raise exception 'TYPED_AUTHORING_UNEXPECTED_GRANT' using errcode='42501'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') then
        raise exception 'TYPED_AUTHORING_APPLICATION_EXECUTE' using errcode='42501'; end if;
    end loop;
  end loop;
end;
$ta_denial$;
commit;
