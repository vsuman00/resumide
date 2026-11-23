-- R10 source only. Requires the R08 fence migration first. No flag, legacy
-- producer grant cutover, worker, target or verification allocation is enabled.
create function private.analysis_stage_parameter_keys(p_value jsonb,p_keys text[])
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_value)='object' then
    (select array_agg(k order by k) from jsonb_object_keys(p_value) k)
      is not distinct from (select array_agg(k order by k) from unnest(p_keys) k)
    else false end;
$$;
create function private.analysis_stage_integer(p_value jsonb)
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_value)='number' then
    (p_value #>> '{}')::numeric between -2147483648 and 2147483647
      and (p_value #>> '{}')::numeric=trunc((p_value #>> '{}')::numeric)
    else false end;
$$;
create function private.analysis_stage_strings(p_value jsonb,p_keys text[])
returns boolean language plpgsql immutable set search_path='' as $$
declare key text;
begin
  foreach key in array p_keys loop
    if jsonb_typeof(p_value->key) is distinct from 'string' then return false; end if;
  end loop;
  return true;
end;
$$;

create function private.lock_analysis_stage_lease(p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid)
returns boolean language plpgsql set search_path='' as $$
declare a public.analyses%rowtype; j public.analysis_jobs%rowtype; v public.resume_versions%rowtype;
begin
  if p_analysis_id is null or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_attempt is null or p_attempt not between 1 and 3 or p_lease_fence is null then return false; end if;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or a.status='cancelled' then return false; end if;
  if exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed') then return false; end if;
  select * into j from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id
    and attempt_count=p_attempt and lease_fence=p_lease_fence for update;
  if not found or j.dead_lettered_at is not null then return false; end if;
  perform 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id
    and m.role in ('owner','admin','member') for share skip locked;
  if not found then return false; end if;
  -- Extraction updates version.page_count. Take its write-compatible lock now,
  -- avoiding two stage transactions both upgrading a shared version lock later.
  select * into v from public.resume_versions where id=a.resume_version_id
    and organization_id=a.organization_id and owner_id=a.owner_id for no key update skip locked;
  if not found then return false; end if;
  perform 1 from public.resumes r where r.id=v.resume_id and r.organization_id=a.organization_id
    and r.owner_id=a.owner_id and r.status='active' for share skip locked;
  if not found then return false; end if;
  -- Refresh AFTER all locks; transaction-start time must not revive a lease.
  return j.lease_expires_at is not null and j.lease_expires_at>clock_timestamp();
end;
$$;

create function public.assert_analysis_stage_lease(p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  return private.lock_analysis_stage_lease(p_analysis_id,p_worker_id,p_attempt,p_lease_fence);
end;
$$;

create function public.persist_analysis_stage_v2(
  p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid,p_operation text,p_parameters jsonb
)
returns boolean language plpgsql security definer set search_path='' as $$
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
      result:=public.persist_document_evidence(p_analysis_id,p_parameters->'p_envelope',p_parameters->>'p_process_id',p_parameters->>'p_request_id');
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
$$;

revoke all on function private.analysis_stage_parameter_keys(jsonb,text[]),private.analysis_stage_integer(jsonb),
  private.analysis_stage_strings(jsonb,text[]),private.lock_analysis_stage_lease(uuid,text,integer,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.assert_analysis_stage_lease(uuid,text,integer,uuid),public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.assert_analysis_stage_lease(uuid,text,integer,uuid),public.persist_analysis_stage_v2(uuid,text,integer,uuid,text,jsonb) to service_role;
