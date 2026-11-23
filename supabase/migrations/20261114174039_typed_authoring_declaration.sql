-- Authoring-only confirmed declarations1.1. No scoring policy or writer activation.
-- SQL UNPARSED / UNEXECUTED. Historical migrations and1.0 helper bodies unchanged.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create function private.typed_authoring_validate_v1_1(p_command jsonb) returns void
language plpgsql immutable set search_path='' as $ta_validate_1_1$
declare value jsonb; key text; item jsonb;
  policies jsonb:=$policies${"authoringVersion":"typed-authoring-rules/1.1.0","authoringSha256":"9fe1f173a86350883bf1ae7773ef8dfbd3225e780d23b210d86354c6b6cfb477","writingSupportVersion":"legacy-source-transforms/1.0.4","coverageVersion":"typed-fact-coverage/1.0.1","coverageSha256":"197bb86275f3b27042e09326001ddb13c8fa9cd697f3dd9f65f39070f9c34e49","semanticVersion":"requirement-semantic-rules/1.0.1","semanticSha256":"88751c86a58ae71d433e9795b146f78987202373f7f9a439d2daea14d965edea","durationVersion":"requirement-duration/1.0.0","durationSha256":"a886bfc6fb4625a3d87b6f51758de4949c3b76e6916966a541fa238e2f55a046","durationSubjectVersion":"job-duration-subject-rules/1.0.0","durationSubjectSha256":"ef157c501f0f9d10ea9910b1dddc463a06fdb7a989cbb7409eecbea8caf955db"}$policies$::jsonb;
begin
  if p_command is null or octet_length(p_command::text)>16384
    or private.grouped_import_keys(p_command,array['schemaVersion','operation','idempotencyKey','acknowledgement','binding','diagnosticDigest','coverageDigest','semanticDigest','policies','target','clauseIds','transform','sourceCitations']) is not true
    or p_command->>'schemaVersion' is distinct from 'typed-authoring-command/1.1.0'
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
    or jsonb_array_length(p_command->'sourceCitations')<>0 then
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
$ta_validate_1_1$;

create function private.typed_authoring_atoms_v1_1(p_command jsonb) returns text[]
language plpgsql immutable set search_path='' as $ta_atoms_1_1$
declare atoms text[]; x jsonb; key text;
begin
  perform private.typed_authoring_validate_v1_1(p_command);
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
$ta_atoms_1_1$;

create function private.typed_authoring_declaration_support(p_context jsonb,p_fact jsonb,p_clause_id text) returns void
language plpgsql immutable set search_path='' as $ta_declaration$
declare declared integer; populated integer; clause jsonb; item jsonb; token jsonb; ids jsonb:='[]'; operand jsonb;
  raw text; pieces text[]; object_text text; skill_text text; skill_mapping jsonb; token_mapping jsonb;
  relevant boolean:=false; word text; location jsonb;
  object_index integer; object_point integer; object_char text;
  -- Exact Pc/Pd scalars from pinned Node22.23.4 / Unicode 17.0; L/N/M reuse the existing frozen JD profile.
  punctuation integer[]:=array[45,95,1418,1470,5120,6150,8208,8209,8210,8211,8212,8213,8255,8256,8276,11799,11802,11834,11835,11840,11869,12316,12336,12448,65073,65074,65075,65076,65101,65102,65103,65112,65123,65293,65343,68974,69293];
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
  -- A current declaration, not a quote or an inherited observation.
  if p_fact->>'type' is distinct from 'contribution' or p_fact->>'state' is distinct from 'candidate_confirmed'
    or p_fact->'sources' is distinct from '[]'::jsonb
    or p_fact->'confirmation'->>'actorId' is distinct from p_context->'source'->>'ownerId'
    or p_fact->'confirmation'->>'value' is distinct from p_fact->>'value'
    or jsonb_typeof(p_fact->'confirmation'->'confirmedAt') is distinct from 'string'
    or not exists(select 1 from jsonb_array_elements(p_context->'canonical'->'content'->'facts') current_fact(value)
      where current_fact.value is not distinct from p_fact) then perform private.correction_fail('invalid'); end if;
  location:=private.correction_location(p_context->'canonical'->'content',(p_fact->>'id')::uuid);
  if jsonb_array_length(location)<>1 or location->0->>'kind' not in ('entry','bullet') then
    perform private.correction_fail('invalid'); end if;
  raw:=p_fact->>'value';
  if right(raw,1)='.' then raw:=left(raw,char_length(raw)-1); end if;
  if raw ~ $quotes$["'`“”‘’]$quotes$ or raw ~ E'[\\n\\r;,&]' then perform private.correction_fail('invalid'); end if;
  for word in select x[1] from regexp_matches(translate(raw,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'[a-z]+','g') x loop
    if word=any(forbidden) then perform private.correction_fail('invalid'); end if;
  end loop;
  pieces:=regexp_match(raw collate "C",E'^(Built|Created|Developed|built|created|developed)[\\t ]+([^\\t ].*?)[\\t ]+using[\\t ]+([^\\t ].*)$','i');
  if pieces is null or pieces[1] not in ('Built','Created','Developed','built','created','developed') then perform private.correction_fail('invalid'); end if;
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
  if not relevant then perform private.correction_fail('invalid'); end if;
end;
$ta_declaration$;

-- Only exact known post-readiness bodies may be advanced. Unknown drift aborts.
do $ta_declaration_patch$
declare manifest jsonb:=$ta_declaration_patches$[
  {
    "signature": "public.apply_typed_authoring_action(uuid,uuid,jsonb,text)",
    "sha256": "7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387",
    "newSha256": "c8eaf0ceaaada7ca3407cd0ca2bdb4f0dc4690ef8f42baf8f6136dfa57989558",
    "definer": true,
    "volatility": "v",
    "serviceExecute": false,
    "resultType": "jsonb",
    "patches": [
      {
        "old": "  perform private.typed_authoring_validate(p_command);",
        "new": "  if p_command->>'schemaVersion'='typed-authoring-command/1.0.0' then\n    perform private.typed_authoring_validate(p_command);\n  elsif p_command->>'schemaVersion'='typed-authoring-command/1.1.0' then\n    perform private.typed_authoring_validate_v1_1(p_command);\n  else perform private.correction_fail('invalid'); end if;"
      },
      {
        "old": "  command_sha:=private.typed_authoring_atoms_sha256(private.typed_authoring_atoms(p_command));",
        "new": "  if p_command->>'schemaVersion'='typed-authoring-command/1.1.0' then\n    command_sha:=private.typed_authoring_atoms_sha256(private.typed_authoring_atoms_v1_1(p_command));\n  else command_sha:=private.typed_authoring_atoms_sha256(private.typed_authoring_atoms(p_command)); end if;"
      },
      {
        "old": "  for cite in select value from jsonb_array_elements(fact->'sources') loop\n    if cite->>'attemptId' is distinct from canonical.source_evidence_version_id::text then perform private.correction_fail('invalid'); end if;\n    select x.value into span from jsonb_array_elements(context->'attempt'->'envelope'->'spans') x(value) where x.value->>'id'=cite->>'spanId';\n    if span is null or (cite->>'end')::integer-(cite->>'start')::integer<>char_length(fact->>'value')\n      or convert_to(substring(span->>'text' from (cite->>'start')::integer+1 for (cite->>'end')::integer-(cite->>'start')::integer),'UTF8')<>convert_to(fact->>'value','UTF8')\n      or (cite->>'end')::integer>char_length(span->>'text') or cite::text=any(seen) then perform private.correction_fail('invalid'); end if;\n    seen:=array_append(seen,cite::text);\n    actual_citations:=actual_citations||jsonb_build_array(cite||jsonb_build_object('pageId',span->>'pageId','method',span->>'method','pageStart',(span->>'start')::integer+(cite->>'start')::integer,'pageEnd',(span->>'start')::integer+(cite->>'end')::integer));\n  end loop;\n  if actual_citations is distinct from p_command->'sourceCitations' then perform private.correction_fail('invalid'); end if;\n",
        "new": "  if p_command->>'schemaVersion'='typed-authoring-command/1.0.0' then\n  for cite in select value from jsonb_array_elements(fact->'sources') loop\n    if cite->>'attemptId' is distinct from canonical.source_evidence_version_id::text then perform private.correction_fail('invalid'); end if;\n    select x.value into span from jsonb_array_elements(context->'attempt'->'envelope'->'spans') x(value) where x.value->>'id'=cite->>'spanId';\n    if span is null or (cite->>'end')::integer-(cite->>'start')::integer<>char_length(fact->>'value')\n      or convert_to(substring(span->>'text' from (cite->>'start')::integer+1 for (cite->>'end')::integer-(cite->>'start')::integer),'UTF8')<>convert_to(fact->>'value','UTF8')\n      or (cite->>'end')::integer>char_length(span->>'text') or cite::text=any(seen) then perform private.correction_fail('invalid'); end if;\n    seen:=array_append(seen,cite::text);\n    actual_citations:=actual_citations||jsonb_build_array(cite||jsonb_build_object('pageId',span->>'pageId','method',span->>'method','pageStart',(span->>'start')::integer+(cite->>'start')::integer,'pageEnd',(span->>'start')::integer+(cite->>'end')::integer));\n  end loop;\n  if actual_citations is distinct from p_command->'sourceCitations' then perform private.correction_fail('invalid'); end if;\n  elsif fact->'sources' is distinct from '[]'::jsonb or p_command->'sourceCitations' is distinct from '[]'::jsonb then\n    perform private.correction_fail('invalid');\n  end if;\n"
      },
      {
        "old": "  perform private.typed_authoring_support(context,fact,p_command->'clauseIds'->>0);",
        "new": "  if p_command->>'schemaVersion'='typed-authoring-command/1.1.0' then\n    perform private.typed_authoring_declaration_support(context,fact,p_command->'clauseIds'->>0);\n  else perform private.typed_authoring_support(context,fact,p_command->'clauseIds'->>0); end if;"
      }
    ]
  },
  {
    "signature": "private.typed_authoring_write_ready()",
    "sha256": "f1f32624c906897a7a7a65e6d91fb70bf7ff0ec6986161820309a39138326b8d",
    "newSha256": "fdb7b1a51ac23303ca5c55a741e2818ca669e7795394ca4d012f1e150266ca08",
    "definer": false,
    "volatility": "s",
    "serviceExecute": false,
    "resultType": "boolean",
    "patches": [
      {
        "old": "[\n  {\n    \"signature\": \"private.typed_authoring_sha256(text)\",\n    \"sha256\": \"6f6bcd17a64de775ab50c2381a933dcc4a02b1b9057bcd849c759ddb0648d727\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": true,\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_atoms_sha256(text[])\",\n    \"sha256\": \"3b2add63d500b44b63c290b36e801aea2ae21c2c8129c16a5ef9479f4abbfc7f\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_replacement(text,jsonb)\",\n    \"sha256\": \"ca44ce165cf2c4ff3f2b4eee6b432109935634ae9e218dc95cc2fe3c95167eb2\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_uuid(jsonb)\",\n    \"sha256\": \"a78cd8517907f514c7126f5a0b348712cefa6d54b8f1f261787370c8843e5f63\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"boolean\",\n    \"strict\": false,\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_validate(jsonb)\",\n    \"sha256\": \"f6926fe07ebe884795e9d85dca5b5009ac8487189cf532b52d3f52ba8cff75ed\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_atoms(jsonb)\",\n    \"sha256\": \"44d4a28fff9c84e5083f6d4c5cdb4cb03ded70c17bd35030f3074461a09bfbd7\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text[]\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid)\",\n    \"sha256\": \"8827d407fd816ecff41c289123d6aa99a83f2339089bf926e6ad86c77ee351ff\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_support(jsonb,jsonb,text)\",\n    \"sha256\": \"ee790136a5d0e7cc6caac8f678e0e1c43cada142a92ce876dce543dc796b7600\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.apply_typed_authoring_action(uuid,uuid,jsonb,text)\",\n    \"sha256\": \"7ea525c7603c4ee47333d5f83f51b774a0196d0b33412253c19485074b99b387\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.read_typed_authoring_readiness()\",\n    \"sha256\": \"c70e1e3b07abff4a5f805c3db62643049edfc2a1214aebc5b423ca601a41d072\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  }\n]",
        "new": "[\n  {\n    \"signature\": \"private.typed_authoring_sha256(text)\",\n    \"sha256\": \"6f6bcd17a64de775ab50c2381a933dcc4a02b1b9057bcd849c759ddb0648d727\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": true,\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_atoms_sha256(text[])\",\n    \"sha256\": \"3b2add63d500b44b63c290b36e801aea2ae21c2c8129c16a5ef9479f4abbfc7f\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_replacement(text,jsonb)\",\n    \"sha256\": \"ca44ce165cf2c4ff3f2b4eee6b432109935634ae9e218dc95cc2fe3c95167eb2\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_uuid(jsonb)\",\n    \"sha256\": \"a78cd8517907f514c7126f5a0b348712cefa6d54b8f1f261787370c8843e5f63\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"boolean\",\n    \"strict\": false,\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_validate(jsonb)\",\n    \"sha256\": \"f6926fe07ebe884795e9d85dca5b5009ac8487189cf532b52d3f52ba8cff75ed\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_atoms(jsonb)\",\n    \"sha256\": \"44d4a28fff9c84e5083f6d4c5cdb4cb03ded70c17bd35030f3074461a09bfbd7\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text[]\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_child(jsonb,uuid,text,boolean,text,uuid,uuid)\",\n    \"sha256\": \"8827d407fd816ecff41c289123d6aa99a83f2339089bf926e6ad86c77ee351ff\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_support(jsonb,jsonb,text)\",\n    \"sha256\": \"ee790136a5d0e7cc6caac8f678e0e1c43cada142a92ce876dce543dc796b7600\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.apply_typed_authoring_action(uuid,uuid,jsonb,text)\",\n    \"sha256\": \"c8eaf0ceaaada7ca3407cd0ca2bdb4f0dc4690ef8f42baf8f6136dfa57989558\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.read_typed_authoring_readiness()\",\n    \"sha256\": \"55dbfb182f5bbe836df72eb03699b851c22ea542725bb2681b8c5de1e9e70f48\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_validate_v1_1(jsonb)\",\n    \"sha256\": \"7679cf5398a1f665ad46578151d045a38ddd6d8ccaca76aa74e78251f6412caa\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_atoms_v1_1(jsonb)\",\n    \"sha256\": \"4dc957dd4aba02b72092672e2159c1f4b4848d6a1134d8f6cba1752c1170df52\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"text[]\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.typed_authoring_declaration_support(jsonb,jsonb,text)\",\n    \"sha256\": \"219d58530829174569ffba7e8b5d4aa683b46dcdef9188ba1a824fe632836e5f\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"strict\": false,\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  }\n]"
      }
    ]
  },
  {
    "signature": "public.read_typed_authoring_readiness()",
    "sha256": "c70e1e3b07abff4a5f805c3db62643049edfc2a1214aebc5b423ca601a41d072",
    "newSha256": "55dbfb182f5bbe836df72eb03699b851c22ea542725bb2681b8c5de1e9e70f48",
    "definer": true,
    "volatility": "s",
    "serviceExecute": true,
    "resultType": "jsonb",
    "patches": [
      {
        "old": "typed-authoring-readiness-profile/1.0.0",
        "new": "typed-authoring-readiness-profile/1.1.0"
      }
    ]
  }
]$ta_declaration_patches$::jsonb;
  item jsonb; patch jsonb; routine pg_catalog.pg_proc%rowtype; source text; next_source text; definition text;
  prepared text[]:='{}'; statement text; role_name text;
begin
  for item in select value from jsonb_array_elements(manifest) loop
    select * into routine from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or routine.prokind<>'f' or routine.proretset or routine.proisstrict or routine.prorettype<>to_regtype(item->>'resultType')
      or routine.prosecdef is distinct from (item->>'definer')::boolean or routine.provolatile<>item->>'volatility'
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql') or routine.proconfig is distinct from array['search_path=""']
      or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>item->>'sha256' then
      raise exception 'DECLARATION_PREDECESSOR_DRIFT' using errcode='23514'; end if;
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee<>routine.proowner
      and (acl.grantee<>(select oid from pg_catalog.pg_roles where rolname='service_role') or acl.privilege_type<>'EXECUTE'
        or acl.is_grantable or (item->>'serviceExecute')::boolean is not true)) then raise exception 'DECLARATION_GRANT_DRIFT' using errcode='42501'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from (role_name='service_role' and (item->>'serviceExecute')::boolean) then
        raise exception 'DECLARATION_GRANT_DRIFT' using errcode='42501'; end if;
    end loop;
    source:=routine.prosrc;next_source:=source;
    for patch in select value from jsonb_array_elements(item->'patches') loop
      if (length(next_source)-length(replace(next_source,patch->>'old','')))/length(patch->>'old')<>1 then raise exception 'DECLARATION_PATCH_DRIFT' using errcode='23514'; end if;
      next_source:=replace(next_source,patch->>'old',patch->>'new');
    end loop;
    if encode(extensions.digest(convert_to(next_source,'UTF8'),'sha256'),'hex')<>item->>'newSha256' then raise exception 'DECLARATION_POSTIMAGE_DRIFT' using errcode='23514'; end if;
    definition:=pg_get_functiondef(routine.oid);
    if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then raise exception 'DECLARATION_DEFINITION_DRIFT' using errcode='23514'; end if;
    prepared:=array_append(prepared,replace(definition,source,next_source));
  end loop;
  foreach statement in array prepared loop execute statement; end loop;
end;
$ta_declaration_patch$;

revoke all on function private.typed_authoring_validate_v1_1(jsonb),private.typed_authoring_atoms_v1_1(jsonb),
  private.typed_authoring_declaration_support(jsonb,jsonb,text) from public,anon,authenticated,service_role;
-- The old writer remains denied. No grant, base138 change or legacy-guard change.
revoke all on function public.apply_typed_authoring_action(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
do $ta_declaration_acl$
declare target record; routine pg_catalog.pg_proc%rowtype; role_name text;
  owner_oid oid:=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_correction_write_ready()'));
  service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');
begin
  for target in select * from (values
    ('private.typed_authoring_validate_v1_1(jsonb)','7679cf5398a1f665ad46578151d045a38ddd6d8ccaca76aa74e78251f6412caa',false),
    ('private.typed_authoring_atoms_v1_1(jsonb)','4dc957dd4aba02b72092672e2159c1f4b4848d6a1134d8f6cba1752c1170df52',false),
    ('private.typed_authoring_declaration_support(jsonb,jsonb,text)','219d58530829174569ffba7e8b5d4aa683b46dcdef9188ba1a824fe632836e5f',false),
    ('public.apply_typed_authoring_action(uuid,uuid,jsonb,text)','c8eaf0ceaaada7ca3407cd0ca2bdb4f0dc4690ef8f42baf8f6136dfa57989558',false),
    ('private.typed_authoring_write_ready()','fdb7b1a51ac23303ca5c55a741e2818ca669e7795394ca4d012f1e150266ca08',false),
    ('public.read_typed_authoring_readiness()','55dbfb182f5bbe836df72eb03699b851c22ea542725bb2681b8c5de1e9e70f48',true)
  ) v(signature,sha256,service_execute) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if routine.proowner is distinct from owner_oid or encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex')<>target.sha256
      or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl where acl.grantee<>routine.proowner
        and (not target.service_execute or acl.grantee<>service_oid or acl.privilege_type<>'EXECUTE' or acl.is_grantable)) then
      raise exception 'DECLARATION_UNEXPECTED_GRANT' using errcode='42501'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,routine.oid,'EXECUTE') is distinct from (role_name='service_role' and target.service_execute) then
        raise exception 'DECLARATION_UNEXPECTED_GRANT' using errcode='42501'; end if;
    end loop;
  end loop;
end;
$ta_declaration_acl$;
commit;
