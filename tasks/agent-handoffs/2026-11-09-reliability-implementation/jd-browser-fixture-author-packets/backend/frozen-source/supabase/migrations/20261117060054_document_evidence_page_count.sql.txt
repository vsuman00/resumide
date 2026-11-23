-- SOURCE ONLY / UNPARSED / UNEXECUTED. Forward migration; no backfill,
-- flag activation, target admission or runtime acceptance is supplied here.
begin;

do $page_count_preflight$
begin
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_document_evidence(uuid,jsonb,text,text)')
   and encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')='1dac96ffe14e7ba55b1ff0089a3c1fd627e9dcef0cc3de4b9917f2ad5dc10949')
   or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)')
   and encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')='6d6d47ebe9aa2b050b9c8dfce0e72cc90552fbdccc5ba11f63d01b0be2f5dd78') then
  raise exception 'DOCUMENT_PAGE_COUNT_SOURCE_DRIFT' using errcode='23514';end if;
end;
$page_count_preflight$;

create function public.persist_document_evidence(
 p_analysis_id uuid,p_envelope jsonb,p_process_id text,p_request_id text,p_page_count integer
) returns boolean language plpgsql security definer set search_path='' as $page_count_writer$
declare
  a public.analyses%rowtype;
  v public.resume_versions%rowtype;
  prior public.document_evidence_attempts%rowtype;
  page jsonb; ordinal integer:=0; affected integer;
begin
  if p_analysis_id is null or p_page_count is null or p_page_count not between 1 and 20
    or jsonb_typeof(p_envelope) is distinct from 'object'
    or jsonb_typeof(p_envelope->'nativeSource'->'pages') is distinct from 'array'
    or jsonb_array_length(p_envelope->'nativeSource'->'pages')<>p_page_count then return false;end if;
  -- The independently declared extractor count is an input, never inferred from
  -- the envelope. Every native page (including blank pages) must agree with it.
  for page in select e.value from jsonb_array_elements(p_envelope->'nativeSource'->'pages') e(value) loop
    ordinal:=ordinal+1;
    if page->>'id' is distinct from 'page-'||ordinal::text
      or jsonb_typeof(page->'pageNumber') is distinct from 'number'
      or page->>'pageNumber' is distinct from ordinal::text then return false;end if;
  end loop;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or a.status not in ('extracting','needs_ocr','scoring','qualitative_review','partial','completed') then return false;end if;
  if not private.try_candidate_privacy_write(a.owner_id) then return false;end if;
  perform 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id
    and m.role in ('owner','admin','member') for share skip locked;
  if not found then return false;end if;
  select * into v from public.resume_versions where id=a.resume_version_id
    and owner_id=a.owner_id and organization_id=a.organization_id for no key update skip locked;
  if not found or p_envelope->>'ownerId' is distinct from a.owner_id::text
    or p_envelope->>'analysisId' is distinct from a.id::text
    or p_envelope->>'sourceId' is distinct from v.id::text
    or p_envelope->>'inputSha256' is distinct from v.checksum
    or (v.page_count is not null and v.page_count<>p_page_count) then return false;end if;
  perform 1 from public.resumes root where root.id=v.resume_id and root.owner_id=a.owner_id
    and root.organization_id=a.organization_id and root.status='active' for share skip locked;
  if not found then return false;end if;
  select * into prior from public.document_evidence_attempts where id=(p_envelope->>'id')::uuid;
  -- A legacy replay with unknown source metadata cannot manufacture an extractor
  -- observation. A fresh validated extraction/attempt is required instead.
  if found and v.page_count is null then return false;end if;
  -- The outer exception block encloses every write, including legacy writes that
  -- might return false. Raising on refusal is essential for atomic rollback.
  if public.persist_document_evidence(p_analysis_id,p_envelope,p_process_id,p_request_id) is not true then
    raise exception 'DOCUMENT_PAGE_COUNT_REFUSED' using errcode='P0P01';end if;
  if v.page_count is null then
    update public.resume_versions set page_count=p_page_count
      where id=v.id and owner_id=a.owner_id and organization_id=a.organization_id
        and resume_id=v.resume_id and checksum=v.checksum and page_count is null;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'DOCUMENT_PAGE_COUNT_REFUSED' using errcode='P0P01';end if;
  end if;
  if not private.try_candidate_privacy_write(a.owner_id) then
    raise exception 'DOCUMENT_PAGE_COUNT_REFUSED' using errcode='P0P01';end if;
  return true;
exception when others then return false;
end;
$page_count_writer$;

create or replace function public.persist_analysis_stage_v2(
  p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid,p_operation text,p_parameters jsonb
)
returns boolean language plpgsql security definer set search_path='' as $page_count_dispatcher$
declare
  keys text[]; strings text[]; result boolean;
  extraction_keys text[]:=array['p_analysis_id','p_duration_ms','p_extracted_text','p_extractor_version','p_page_count',
    'p_page_texts','p_process_id','p_request_id','p_text_checksum','p_warnings'];
begin
  if p_analysis_id is null or p_operation is null or jsonb_typeof(p_parameters) is distinct from 'object'
    or jsonb_typeof(p_parameters->'p_analysis_id') is distinct from 'string'
    or (p_parameters->>'p_analysis_id')::uuid is distinct from p_analysis_id then return false; end if;

  case p_operation
  when 'transition_analysis' then
    keys:=array['p_analysis_id','p_expected_status','p_next_status','p_actor_id','p_process_id','p_request_id'];
    strings:=array['p_analysis_id','p_expected_status','p_next_status','p_process_id','p_request_id'];
    if p_parameters->'p_actor_id' is distinct from 'null'::jsonb then return false; end if;
  when 'persist_analysis_extraction','persist_native_layout_extraction' then
    keys:=extraction_keys;
    strings:=array['p_analysis_id','p_extracted_text','p_extractor_version','p_process_id','p_request_id','p_text_checksum'];
    if not private.analysis_stage_integer(p_parameters->'p_duration_ms') or not private.analysis_stage_integer(p_parameters->'p_page_count')
      or jsonb_typeof(p_parameters->'p_page_texts') is distinct from 'array' or jsonb_typeof(p_parameters->'p_warnings') is distinct from 'array' then return false; end if;
    if p_operation='persist_native_layout_extraction' then
      keys:=keys||array['p_evidence_graph','p_native_layout'];
    elsif p_parameters ? 'p_evidence_graph' then keys:=keys||array['p_evidence_graph']; end if;
    if (p_parameters ? 'p_evidence_graph') and jsonb_typeof(p_parameters->'p_evidence_graph') not in ('object','null') then return false; end if;
    if p_operation='persist_native_layout_extraction' and jsonb_typeof(p_parameters->'p_native_layout') not in ('object','null') then return false; end if;
  when 'persist_document_evidence' then
    keys:=array['p_analysis_id','p_envelope','p_process_id','p_request_id'];
    strings:=array['p_analysis_id','p_process_id','p_request_id'];
    if jsonb_typeof(p_parameters->'p_envelope') is distinct from 'object' then return false; end if;
    if p_parameters ? 'p_page_count' then
      keys:=keys||array['p_page_count'];
      if not private.analysis_stage_integer(p_parameters->'p_page_count')
        or (p_parameters->>'p_page_count')::integer not between 1 and 20 then return false;end if;
    end if;
  when 'persist_deterministic_analysis' then
    keys:=array['p_analysis_id','p_input_text_checksum','p_keyword_coverage','p_normalizer_version','p_parse_view','p_parser_version',
      'p_process_id','p_request_id','p_result_checksum','p_rule_trace','p_ruleset_version','p_score','p_taxonomy_version'];
    strings:=array['p_analysis_id','p_input_text_checksum','p_normalizer_version','p_parser_version','p_process_id','p_request_id',
      'p_result_checksum','p_ruleset_version','p_taxonomy_version'];
    if not private.analysis_stage_integer(p_parameters->'p_score') or jsonb_typeof(p_parameters->'p_keyword_coverage') is distinct from 'object'
      or jsonb_typeof(p_parameters->'p_parse_view') is distinct from 'object' or jsonb_typeof(p_parameters->'p_rule_trace') is distinct from 'array' then return false; end if;
  when 'persist_partial_analysis' then
    keys:=array['p_analysis_id','p_feedback','p_process_id','p_request_id'];
    strings:=array['p_analysis_id','p_process_id','p_request_id'];
    if jsonb_typeof(p_parameters->'p_feedback') is distinct from 'object' then return false; end if;
  when 'persist_qualitative_analysis' then
    keys:=array['p_analysis_id','p_feedback','p_input_hash','p_input_tokens','p_model_id','p_output','p_output_tokens',
      'p_process_id','p_prompt_version','p_provider','p_request_id','p_run_id','p_writer'];
    strings:=array['p_analysis_id','p_input_hash','p_model_id','p_process_id','p_prompt_version','p_provider','p_request_id','p_run_id'];
    if not private.analysis_stage_integer(p_parameters->'p_input_tokens') or not private.analysis_stage_integer(p_parameters->'p_output_tokens')
      or jsonb_typeof(p_parameters->'p_feedback') is distinct from 'object' or jsonb_typeof(p_parameters->'p_output') is distinct from 'object'
      or jsonb_typeof(p_parameters->'p_writer') is distinct from 'object' then return false; end if;
  else return false;
  end case;
  if not private.analysis_stage_parameter_keys(p_parameters,keys) or not private.analysis_stage_strings(p_parameters,strings) then return false; end if;
  if not private.lock_analysis_stage_lease(p_analysis_id,p_worker_id,p_attempt,p_lease_fence) then return false; end if;

  -- A subtransaction is essential: inner legacy functions may write before
  -- returning false. An expired post-check must roll back those writes, too.
  begin
    case p_operation
    when 'transition_analysis' then
      result:=public.transition_analysis(p_analysis_id,p_parameters->>'p_expected_status',p_parameters->>'p_next_status',
        null::uuid,p_parameters->>'p_process_id',p_parameters->>'p_request_id');
    when 'persist_analysis_extraction' then
      if p_parameters ? 'p_evidence_graph' then
        result:=public.persist_analysis_extraction(p_analysis_id,(p_parameters->>'p_duration_ms')::integer,p_parameters->>'p_extracted_text',
          p_parameters->>'p_extractor_version',(p_parameters->>'p_page_count')::integer,p_parameters->'p_page_texts',p_parameters->>'p_process_id',
          p_parameters->>'p_request_id',p_parameters->>'p_text_checksum',p_parameters->'p_warnings',nullif(p_parameters->'p_evidence_graph','null'::jsonb));
      else
        result:=public.persist_analysis_extraction(p_analysis_id,(p_parameters->>'p_duration_ms')::integer,p_parameters->>'p_extracted_text',
          p_parameters->>'p_extractor_version',(p_parameters->>'p_page_count')::integer,p_parameters->'p_page_texts',p_parameters->>'p_process_id',
          p_parameters->>'p_request_id',p_parameters->>'p_text_checksum',p_parameters->'p_warnings');
      end if;
    when 'persist_native_layout_extraction' then
      result:=public.persist_native_layout_extraction(p_analysis_id,(p_parameters->>'p_duration_ms')::integer,p_parameters->>'p_extracted_text',
        p_parameters->>'p_extractor_version',(p_parameters->>'p_page_count')::integer,p_parameters->'p_page_texts',p_parameters->>'p_process_id',
        p_parameters->>'p_request_id',p_parameters->>'p_text_checksum',p_parameters->'p_warnings',
        nullif(p_parameters->'p_evidence_graph','null'::jsonb),nullif(p_parameters->'p_native_layout','null'::jsonb));
    when 'persist_document_evidence' then
      if p_parameters ? 'p_page_count' then
        result:=public.persist_document_evidence(p_analysis_id,p_parameters->'p_envelope',p_parameters->>'p_process_id',p_parameters->>'p_request_id',
          (p_parameters->>'p_page_count')::integer);
      else
      result:=public.persist_document_evidence(p_analysis_id,p_parameters->'p_envelope',p_parameters->>'p_process_id',p_parameters->>'p_request_id');
      end if;
    when 'persist_deterministic_analysis' then
      result:=public.persist_deterministic_analysis(p_analysis_id,p_parameters->>'p_input_text_checksum',p_parameters->'p_keyword_coverage',
        p_parameters->>'p_normalizer_version',p_parameters->'p_parse_view',p_parameters->>'p_parser_version',p_parameters->>'p_process_id',
        p_parameters->>'p_request_id',p_parameters->>'p_result_checksum',p_parameters->'p_rule_trace',p_parameters->>'p_ruleset_version',
        (p_parameters->>'p_score')::integer,p_parameters->>'p_taxonomy_version');
    when 'persist_partial_analysis' then
      result:=public.persist_partial_analysis(p_analysis_id,p_parameters->'p_feedback',p_parameters->>'p_process_id',p_parameters->>'p_request_id');
    when 'persist_qualitative_analysis' then
      result:=public.persist_qualitative_analysis(p_analysis_id,p_parameters->'p_feedback',p_parameters->>'p_input_hash',
        (p_parameters->>'p_input_tokens')::integer,p_parameters->>'p_model_id',p_parameters->'p_output',
        (p_parameters->>'p_output_tokens')::integer,p_parameters->>'p_process_id',p_parameters->>'p_prompt_version',
        p_parameters->>'p_provider',p_parameters->>'p_request_id',(p_parameters->>'p_run_id')::uuid,p_parameters->'p_writer');
    end case;
    if result is not true or not private.lock_analysis_stage_lease(p_analysis_id,p_worker_id,p_attempt,p_lease_fence) then
      raise exception 'Fenced stage write did not commit' using errcode='P0F01';
    end if;
    return true;
  exception when others then
    -- Roll back this subtransaction, withhold the write and expose no source,
    -- candidate text, token, raw validation exception or provider payload.
    return false;
  end;
exception when others then return false;
end;
$page_count_dispatcher$;

create function private.document_page_count_ready()
returns boolean language plpgsql stable set search_path='' as $page_count_checker$
declare item jsonb; p pg_catalog.pg_proc%rowtype; owner_oid oid; service_oid oid; role_name text;
 manifest jsonb:=$page_count_manifest$[{"signature":"public.persist_document_evidence(uuid,jsonb,text,text)","sha256":"1dac96ffe14e7ba55b1ff0089a3c1fd627e9dcef0cc3de4b9917f2ad5dc10949","definer":true,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"worker"},{"signature":"public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)","sha256":"a1ff8471b7e8e755f06193221da7c442bfd415d40a11d69a3472e940456451c2","definer":true,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"worker"},{"signature":"private.analysis_stage_parameter_keys(jsonb,text[])","sha256":"7573a8f0cff6e0e5207140692f3ceac0151e7fe44607235f26a85ae40d26c4a7","definer":false,"volatility":"i","language":"sql","resultType":"boolean","acl":"private"},{"signature":"private.analysis_stage_integer(jsonb)","sha256":"21a92020f71cc4f9e61026844aab7bbbcc9df11f402abd6c79915633e08fbe3b","definer":false,"volatility":"i","language":"sql","resultType":"boolean","acl":"private"},{"signature":"private.analysis_stage_strings(jsonb,text[])","sha256":"dd976586a3fc326d1ed5067b85830ac9ef5c50aab227c23fee7df6e5c2744937","definer":false,"volatility":"i","language":"plpgsql","resultType":"boolean","acl":"private"},{"signature":"private.lock_analysis_stage_lease(uuid,text,integer,uuid)","sha256":"d5bf2c2c633833a174f5351275b6b09eb4c8bf945bd7c6c889eaa6ef64893883","definer":false,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"private"},{"signature":"private.try_candidate_privacy_write(uuid)","sha256":"89e7eec219295b7c834c284012ba7144049380935273e1505a994d38efc4156d","definer":true,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"private"},{"signature":"private.candidate_write_blocked(uuid)","sha256":"9498dbf45b8a0924bfd27eea08ee8ba722a0d488fa37025b47741c69fb3814f4","definer":true,"volatility":"v","language":"sql","resultType":"boolean","acl":"private"},{"signature":"private.candidate_owner_lock_keys(uuid[])","sha256":"71a245029186c9f601dd9730d5ac894a32b91431be0065538ff57f0c949b7c85","definer":false,"volatility":"i","language":"plpgsql","resultType":"bigint[]","acl":"private"},{"signature":"private.evidence_keys(jsonb,text[])","sha256":"824082145b4e705dfdf1d1be622b7fe4f6959c2fcaec5c69bb28ca0a930e5168","definer":false,"volatility":"i","language":"sql","resultType":"boolean","acl":"private"},{"signature":"private.evidence_integer(jsonb,bigint,bigint)","sha256":"6c4e10bfbef2d70d4a40b9c2346962b5ad5dac1415574b7b33707115d234e765","definer":false,"volatility":"i","language":"sql","resultType":"boolean","acl":"private"},{"signature":"private.evidence_number(jsonb,numeric,numeric)","sha256":"643517f103383dde3bb4f6bb97ad161bf4d304db565f04cee71beede37adfc38","definer":false,"volatility":"i","language":"sql","resultType":"boolean","acl":"private"},{"signature":"public.persist_document_evidence(uuid,jsonb,text,text,integer)","sha256":"ed3c838c81a29bd131ebf543aad7cbc140ffb3ced09de76b18ba77a850dc4a54","definer":true,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"worker"},{"signature":"private.guard_candidate_privacy_write()","sha256":"3d67b52e4694e18dcb43f571e12da97cd75942324fc8323080e1daf8982e8db9","definer":true,"volatility":"v","language":"plpgsql","resultType":"trigger","acl":"private"},{"signature":"private.serialize_deletion_request()","sha256":"682614b2092e88fa3f5452aa5a4392e555e54547167ecc9e20ae2a1a445fc750","definer":true,"volatility":"v","language":"plpgsql","resultType":"trigger","acl":"private"},{"signature":"private.try_lock_candidate_owners(uuid[])","sha256":"e293ad2696defb384613e34647392766c8cbd8c52dd8c9b75ffdb86ee4c5972f","definer":false,"volatility":"v","language":"plpgsql","resultType":"boolean","acl":"private"},{"signature":"public.read_document_page_count_readiness()","sha256":"88bc5d232d91e29000241223fabb32f1badcbcff71ad01d99deeb92ffeb6773b","definer":true,"volatility":"s","language":"plpgsql","resultType":"jsonb","acl":"metadata"}]$page_count_manifest$::jsonb;
begin
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_document_evidence(uuid,jsonb,text,text)');
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 if owner_oid is null or service_oid is null then return false;end if;
 for item in select e.value from jsonb_array_elements(manifest) e(value) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict
   or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
   or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language')
   or p.prorettype<>to_regtype(item->>'resultType') or p.proconfig is distinct from array['search_path=""']
   or encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex')<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee<>p.proowner
   and (item->>'acl'='private' or acl.grantee<>service_oid or acl.privilege_type<>'EXECUTE' or acl.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop
   if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;
  end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl'<>'private' and has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from exists(
   select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where acl.grantee=service_oid and acl.privilege_type='EXECUTE' and not acl.is_grantable) then return false;end if;
  if item->>'acl'='metadata' and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 -- Check the checker attributes/ACL independently; its actual body hash is
 -- returned to the trusted caller, avoiding recursive self-hash literals.
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.document_page_count_ready()');
 if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict or p.prosecdef or p.provolatile<>'s'
  or p.prorettype<>'boolean'::regtype or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
  or p.proconfig is distinct from array['search_path=""']
  or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee<>p.proowner)
  then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;
 end loop;
 if not exists(select 1 from pg_catalog.pg_attribute where attrelid=to_regclass('public.resume_versions')
   and attname='page_count' and atttypid='integer'::regtype and attnum>0 and not attisdropped) then return false;end if;
 -- These are actual privacy-write triggers, not a caller capability label.
 if exists(select 1 from (values ('analyses'),('resume_versions'),('document_evidence_attempts')) required(name)
  where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass('public.'||required.name)
   and t.tgfoid=to_regprocedure('private.guard_candidate_privacy_write()') and not t.tgisinternal
   and t.tgqual is null and t.tgenabled='O' and t.tgtype=23 and t.tgnargs=1 and encode(t.tgargs,'escape')=E'owner_id\\000')) then return false;end if;
 if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass('public.data_requests')
  and t.tgfoid=to_regprocedure('private.serialize_deletion_request()') and not t.tgisinternal
  and t.tgqual is null and t.tgenabled='O' and t.tgtype=23 and t.tgnargs=0 and t.tgargs=''::bytea) then return false;end if;
 if to_regclass('private.owned_ai_deletion_dispositions') is null then return false;end if;
 return true;
exception when others then return false;
end;
$page_count_checker$;

create function public.read_document_page_count_readiness()
returns jsonb language plpgsql stable security definer set search_path='' as $page_count_metadata$
declare checker_oid regprocedure:=to_regprocedure('private.document_page_count_ready()');
 writer_oid regprocedure:=to_regprocedure('public.persist_document_evidence(uuid,jsonb,text,text,integer)');
 metadata_oid regprocedure:=to_regprocedure('public.read_document_page_count_readiness()');
 fenced_oid regprocedure:=to_regprocedure('public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)');
begin
 return jsonb_build_object(
  'schemaVersion','document-page-count-readiness/1.0.0',
  'profileVersion','document-page-count-native/1.0.0',
  'checkerSha256',(select encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc p where p.oid=checker_oid),
  'writerSha256',(select encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc p where p.oid=writer_oid),
  'metadataSha256',(select encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc p where p.oid=metadata_oid),
  'schemaReady',private.document_page_count_ready(),
  'writerExecutable',coalesce(has_function_privilege('service_role',writer_oid,'EXECUTE'),false),
  'fencedWriterExecutable',coalesce(has_function_privilege('service_role',fenced_oid,'EXECUTE'),false));
end;
$page_count_metadata$;

revoke all on function public.persist_document_evidence(uuid,jsonb,text,text,integer),
 private.document_page_count_ready(),public.read_document_page_count_readiness() from public,anon,authenticated,service_role;
grant execute on function public.persist_document_evidence(uuid,jsonb,text,text,integer),
 public.read_document_page_count_readiness() to service_role;
-- Replacing the dispatcher retains its pre-existing owner and ACL. Neither the
-- old four-argument writer nor any frozen JD2 function is replaced here.
do $page_count_final$
begin
 if private.document_page_count_ready() is not true then
  raise exception 'DOCUMENT_PAGE_COUNT_CATALOG_REFUSED' using errcode='23514';end if;
end;
$page_count_final$;
commit;
