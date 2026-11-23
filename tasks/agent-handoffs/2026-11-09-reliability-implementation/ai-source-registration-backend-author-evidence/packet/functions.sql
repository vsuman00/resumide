-- Legacy rewrite source registration SOURCE ONLY. SQL UNPARSED/UNEXECUTED.
-- Activation blocked until every R03 caller is adopted. No expiry mutator here.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';
create table private.ai_budget_operation_sources (
 operation_id uuid primary key,owner_id uuid not null,organization_id uuid not null,
 kind text not null check(kind='legacy_rewrite'),analysis_id uuid not null,resume_id uuid not null,resume_version_id uuid not null,
 request_nonce text not null check(request_nonce collate "C" ~ '^[ -~]{1,128}$'),
 binding_sha256 text not null check(binding_sha256 collate "C" ~ '^[a-f0-9]{64}$'),
 registered_at timestamptz not null check(isfinite(registered_at))
);
alter table private.ai_budget_operation_sources enable row level security;
revoke all on private.ai_budget_operation_sources from public,anon,authenticated,service_role;
create table private.ai_budget_source_catalogue_seal (
 singleton boolean primary key check(singleton),catalogue_sha256 text not null check(catalogue_sha256 collate "C" ~ '^[a-f0-9]{64}$')
);
alter table private.ai_budget_source_catalogue_seal enable row level security;
revoke all on private.ai_budget_source_catalogue_seal from public,anon,authenticated,service_role;

create function private.ai_budget_source_uuid(p_header text,p_atoms text[]) returns uuid
language plpgsql immutable set search_path='' as $source_uuid$
declare bytes bytea:=convert_to(p_header,'UTF8');atom text;hex text;
begin
 if p_header is null or p_atoms is null then raise exception 'AI_SOURCE_INVALID' using errcode='22023';end if;
 foreach atom in array p_atoms loop
  if atom is null then raise exception 'AI_SOURCE_INVALID' using errcode='22023';end if;
  bytes:=bytes||convert_to('T'||octet_length(convert_to(atom,'UTF8'))::text||':'||atom||';','UTF8');
 end loop;
 bytes:=substring(extensions.digest(bytes,'sha256') from 1 for 16);
 bytes:=set_byte(bytes,6,(get_byte(bytes,6)&15)|128);bytes:=set_byte(bytes,8,(get_byte(bytes,8)&63)|128);
 hex:=encode(bytes,'hex');return (substring(hex,1,8)||'-'||substring(hex,9,4)||'-'||substring(hex,13,4)||'-'||substring(hex,17,4)||'-'||substring(hex,21,12))::uuid;
end;
$source_uuid$;
create function private.ai_budget_source_operation_id(p_owner uuid,p_org uuid,p_analysis uuid,p_version uuid,p_nonce text) returns uuid
language sql immutable set search_path='' as $source_op$
 select private.ai_budget_source_uuid(E'AIBUDGET-OP2\n',array[p_owner::text,p_org::text,'legacy_rewrite',p_analysis::text,p_version::text,p_nonce]);
$source_op$;

create function private.ai_budget_source_lock(p_owner uuid,p_org uuid,p_analysis uuid,p_version uuid,p_resume uuid) returns uuid
language plpgsql volatile set search_path='' as $source_lock$
declare root_id uuid;
begin
 if p_owner is null or p_org is null or p_analysis is null or p_version is null
  or current_setting('transaction_isolation') not in ('read committed','read uncommitted')
  or private.try_candidate_privacy_write(p_owner) is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 select v.resume_id into root_id from public.analyses a join public.resume_versions v on v.id=a.resume_version_id
  where a.id=p_analysis and a.owner_id=p_owner and a.organization_id=p_org and v.id=p_version and v.owner_id=p_owner and v.organization_id=p_org;
 if not found or (p_resume is not null and p_resume<>root_id) then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='23514';end if;
 -- SHARE conflicts with retirement UPDATE; all inverse/prelocked paths retry.
 perform 1 from public.resumes r where r.id=root_id and r.owner_id=p_owner and r.organization_id=p_org and r.status='active' for share skip locked;
 if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 perform 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id
  where a.id=p_analysis and a.owner_id=p_owner and a.organization_id=p_org and v.id=p_version
    and v.owner_id=p_owner and v.organization_id=p_org and v.resume_id=root_id
    and v.storage_key=private.r17_storage_key(p_org,root_id,p_version) for share of a,v skip locked;
 if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 perform 1 from public.organizations o join public.memberships m on m.organization_id=o.id
  where o.id=p_org and o.owner_id=p_owner and m.user_id=p_owner and m.role in ('owner','admin','member') for share of o,m skip locked;
 if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 return root_id;
end;
$source_lock$;
create function private.ai_budget_source_valid(s private.ai_budget_operation_sources,o private.ai_budget_operations) returns boolean
language sql stable set search_path='' as $source_valid$
 select coalesce(s.kind='legacy_rewrite' and s.request_nonce collate "C" ~ '^[ -~]{1,128}$'
  and (s.operation_id,s.owner_id,s.organization_id)=(o.id,o.user_id,o.organization_id)
  and s.operation_id=private.ai_budget_source_operation_id(s.owner_id,s.organization_id,s.analysis_id,s.resume_version_id,s.request_nonce)
  and s.binding_sha256=o.binding_sha256 and o.surface='rewrite' and isfinite(s.registered_at)
  and o.binding_sha256=private.ai_budget_binding_sha256(o.user_id,o.organization_id,jsonb_build_object(
    'operationId',o.id,'surface',o.surface,'payloadSha256',o.payload_sha256,'model',o.model,'promptPolicyVersion',o.prompt_policy_version,
    'policyVersion',o.policy_version,'reservedInputTokens',trunc(o.reserved_input_tokens)::text,'reservedOutputTokens',trunc(o.reserved_output_tokens)::text)),false);
$source_valid$;
create function private.ai_budget_source_admit(p_operation uuid) returns void
language plpgsql volatile set search_path='' as $source_admit$
declare s private.ai_budget_operation_sources%rowtype;o private.ai_budget_operations%rowtype;
begin
 if private.ai_budget_source_ready() is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='23514';end if;
 select * into s from private.ai_budget_operation_sources where operation_id=p_operation for share skip locked;
 if not found then raise exception 'AI_SOURCE_UNREGISTERED' using errcode='23514';end if;
 select * into o from private.ai_budget_operations where id=p_operation;
 if not found or private.ai_budget_source_valid(s,o) is not true then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
 perform private.ai_budget_source_lock(s.owner_id,s.organization_id,s.analysis_id,s.resume_version_id,s.resume_id);
end;
$source_admit$;
create function private.ai_budget_source_guard() returns trigger
language plpgsql volatile set search_path='' as $source_guard$
declare s private.ai_budget_operation_sources%rowtype;
begin
 if tg_table_name='ai_budget_operation_sources' then
  if tg_op<>'INSERT' then raise exception 'AI_SOURCE_IMMUTABLE' using errcode='23514';end if;
  if new.operation_id is distinct from private.ai_budget_source_operation_id(new.owner_id,new.organization_id,new.analysis_id,new.resume_version_id,new.request_nonce)
    or new.kind<>'legacy_rewrite' or not isfinite(new.registered_at) or new.registered_at>clock_timestamp()
    then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
  perform private.ai_budget_source_lock(new.owner_id,new.organization_id,new.analysis_id,new.resume_version_id,new.resume_id);
 elsif tg_table_name='ai_budget_operations' then
  if private.ai_budget_source_ready() is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='23514';end if;
  select * into s from private.ai_budget_operation_sources where operation_id=new.id for share skip locked;
  if not found or private.ai_budget_source_valid(s,new) is not true then raise exception 'AI_SOURCE_UNREGISTERED' using errcode='23514';end if;
  perform private.ai_budget_source_lock(s.owner_id,s.organization_id,s.analysis_id,s.resume_version_id,s.resume_id);
 elsif tg_op='INSERT' then
  perform private.ai_budget_source_admit(new.operation_id);
 elsif old.state='reserved' and new.state='dispatched' then
  perform private.ai_budget_source_admit(new.operation_id);
 end if;
 return new;
end;
$source_guard$;
create trigger ai_budget_source_identity before insert or update or delete on private.ai_budget_operation_sources for each row execute function private.ai_budget_source_guard();
create trigger ai_budget_source_operation_admission before insert on private.ai_budget_operations for each row execute function private.ai_budget_source_guard();
create trigger ai_budget_source_attempt_admission before insert or update on private.ai_budget_attempts for each row execute function private.ai_budget_source_guard();

create function public.ai_budget_reserve_source_next(p_user_id uuid,p_organization_id uuid,p_source jsonb,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $source_reserve$
declare s private.ai_budget_operation_sources%rowtype;root_id uuid;op_id uuid;old_op uuid;binding text;reply jsonb;stamp timestamptz;
begin
 if private.ifo_keys(p_source,array['schemaVersion','kind','analysisId','resumeVersionId','requestNonce']) is not true
  or p_source->>'schemaVersion' is distinct from 'ai-budget-source/1.0.0' or p_source->>'kind' is distinct from 'legacy_rewrite'
  or jsonb_typeof(p_source->'analysisId') is distinct from 'string' or p_source->>'analysisId' collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or jsonb_typeof(p_source->'resumeVersionId') is distinct from 'string' or p_source->>'resumeVersionId' collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or jsonb_typeof(p_source->'requestNonce') is distinct from 'string' or p_source->>'requestNonce' collate "C" !~ '^[ -~]{1,128}$'
  or p_request ? 'attemptOrdinal' or private.ai_budget_request_valid(p_request||'{"attemptOrdinal":1}'::jsonb,'reserve') is not true
  or p_request->>'surface' is distinct from 'rewrite' or p_user_id is null or p_organization_id is null then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 if private.ai_budget_source_ready() is not true then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');end if;
 op_id:=private.ai_budget_source_operation_id(p_user_id,p_organization_id,(p_source->>'analysisId')::uuid,(p_source->>'resumeVersionId')::uuid,p_source->>'requestNonce');
 if p_request->>'operationId' is distinct from op_id::text then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 -- No retained OP1 state is safe to silently retry under OP2: its parent is unbound.
 old_op:=private.ai_budget_source_uuid(E'AIBUDGET-OP1\n',array[p_user_id::text,p_organization_id::text,'rewrite',p_source->>'requestNonce']);
 if exists(select 1 from private.ai_budget_operations where id=old_op) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 binding:=private.ai_budget_binding_sha256(p_user_id,p_organization_id,p_request);
 root_id:=private.ai_budget_source_lock(p_user_id,p_organization_id,(p_source->>'analysisId')::uuid,(p_source->>'resumeVersionId')::uuid,null);
 if exists(select 1 from private.ai_budget_operations where id=old_op) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 -- Denied envelopes do not abort old reserve_next. The inner subtransaction MUST.
 begin
  select * into s from private.ai_budget_operation_sources where operation_id=op_id for share skip locked;
  if found then
   if (s.owner_id,s.organization_id,s.kind,s.analysis_id,s.resume_id,s.resume_version_id,s.request_nonce,s.binding_sha256)
     is distinct from (p_user_id,p_organization_id,'legacy_rewrite'::text,(p_source->>'analysisId')::uuid,root_id,(p_source->>'resumeVersionId')::uuid,p_source->>'requestNonce',binding)
     then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
  else
   if exists(select 1 from private.ai_budget_operations where id=op_id) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
   stamp:=clock_timestamp();
   insert into private.ai_budget_operation_sources values(op_id,p_user_id,p_organization_id,'legacy_rewrite',(p_source->>'analysisId')::uuid,root_id,(p_source->>'resumeVersionId')::uuid,p_source->>'requestNonce',binding,stamp);
  end if;
  reply:=public.ai_budget_reserve_next(p_user_id,p_organization_id,p_request);
  if reply->>'schemaVersion' is distinct from 'ai-budget/1.0.0' or reply->>'status' is distinct from 'ok'
    or reply->'receipt'->>'operationId' is distinct from op_id::text or reply->'receipt'->>'bindingSha256' is distinct from binding
    then raise exception 'AI_SOURCE_RESERVE_ROLLBACK' using errcode='P0S01';end if;
 exception when sqlstate 'P0S01' then
  if reply->>'schemaVersion'='ai-budget/1.0.0' and reply->>'status'='denied' and private.ifo_keys(reply,array['schemaVersion','status','code'])
    and reply->>'code' in ('AI_BUDGET_INVALID','AI_BUDGET_UNAVAILABLE','AI_BUDGET_DISABLED','AI_BUDGET_DENIED','AI_BUDGET_EXHAUSTED','AI_BUDGET_CONFLICT','AI_BUDGET_STATE','AI_BUDGET_BLOCKED')
    then return reply;end if;
  return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
 end;
 return reply;
exception when others then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
end;
$source_reserve$;

create function public.export_owned_ai_budget_sources(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $source_export$
declare s private.ai_budget_operation_sources%rowtype;o private.ai_budget_operations%rowtype;item jsonb;answer jsonb;rows jsonb:='[]'::jsonb;n integer:=0;bytes bigint:=1024;
begin
 if p_user_id is null then raise exception 'AI_SOURCE_EXPORT_INVALID' using errcode='22023';end if;
 if private.ai_budget_source_ready() is not true then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
 perform 1 from auth.users where id=p_user_id;if not found then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
 -- Entire owner set, across organizations and flags; no current source/membership filter.
 for s in select * from private.ai_budget_operation_sources where owner_id=p_user_id order by operation_id limit 4097 loop
  n:=n+1;if n>4096 then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
  select * into o from private.ai_budget_operations where id=s.operation_id;
  if not found or private.ai_budget_source_valid(s,o) is not true then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
  if not exists(select 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id
    where (r.id,r.owner_id,r.organization_id,v.id,v.owner_id,v.organization_id)=(s.resume_id,s.owner_id,s.organization_id,s.resume_version_id,s.owner_id,s.organization_id))
   and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='r03' and d.operation_id=s.operation_id
    and (d.owner_id,d.organization_id,d.analysis_id,d.resume_id,d.resume_version_id)=(s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)
    and d.phase='prepared' and d.source_scope='resume_root') then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
  item:=jsonb_build_object('operationId',s.operation_id,'ownerId',s.owner_id,'organizationId',s.organization_id,'kind',s.kind,'analysisId',s.analysis_id,
   'resumeId',s.resume_id,'resumeVersionId',s.resume_version_id,'requestNonce',s.request_nonce,'bindingSha256',s.binding_sha256,'registeredAt',private.ifo_stamp(s.registered_at));
  bytes:=bytes+octet_length(convert_to(item::text,'UTF8'))+1;if bytes>33554432 then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
  rows:=rows||jsonb_build_array(item);
 end loop;
 answer:=jsonb_build_object('schemaVersion','owned-ai-budget-sources/1.0.0','ownerId',p_user_id,'sources',rows);
 if octet_length(convert_to(answer::text,'UTF8'))>33554432 then raise exception 'AI_SOURCE_EXPORT_UNAVAILABLE' using errcode='23514';end if;
 return answer;
end;
$source_export$;
