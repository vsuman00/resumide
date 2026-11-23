-- All technical-budget caller adoption, SOURCE ONLY. SQL UNPARSED/UNEXECUTED.
-- Budget-off provider branches, quota preservation and full expiry remain open.
begin;
set local statement_timeout='10s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='15s';set local search_path='';
lock table private.ai_budget_operation_sources,private.ai_budget_source_catalogue_seal,private.ai_budget_operations,private.ai_budget_attempts,private.canonical_rewrite_operations,private.initial_feedback_operations,private.initial_feedback_attempts in access exclusive mode;
-- Refuse inherited schema/PK/trigger/ACL drift BEFORE changing or sealing anything.
do $caller_preflight$
begin
 if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.ai_budget_source_ready()'))
   is distinct from '64e051edd163c086e7ab9e3aca423584ebc55ba613d29d5e234b7295a109244a'
   or private.ai_budget_source_ready() is not true then raise exception 'AI_CALLERS_PREIMAGE_DRIFT' using errcode='23514';end if;
end;
$caller_preflight$;
alter table private.ai_budget_operation_sources drop constraint ai_budget_operation_sources_kind_check;
alter table private.ai_budget_operation_sources alter column analysis_id drop not null,alter column resume_id drop not null,alter column resume_version_id drop not null;
alter table private.ai_budget_operation_sources add constraint ai_budget_source_kind_v2 check(kind in ('legacy_rewrite','legacy_qualitative','canonical_rewrite','initial_feedback','build_account')),
 add constraint ai_budget_source_parents_v2 check((kind='build_account' and analysis_id is null and resume_id is null and resume_version_id is null)
  or (kind<>'build_account' and analysis_id is not null and resume_id is not null and resume_version_id is not null));
create table private.ai_budget_source_v2_catalogue_seal(singleton boolean primary key check(singleton),catalogue_sha256 text not null check(catalogue_sha256 collate "C" ~ '^[a-f0-9]{64}$'));
alter table private.ai_budget_source_v2_catalogue_seal enable row level security;
revoke all on private.ai_budget_source_v2_catalogue_seal from public,anon,authenticated,service_role;

create function private.ai_budget_source_identity(p_owner uuid,p_org uuid,p_kind text,p_analysis uuid,p_version uuid,p_nonce text) returns uuid
language plpgsql immutable set search_path='' as $caller_identity$
begin
 if p_kind='legacy_rewrite' then return private.ai_budget_source_operation_id(p_owner,p_org,p_analysis,p_version,p_nonce);
 elsif p_kind='legacy_qualitative' then return p_analysis;
 elsif p_kind='initial_feedback' then return p_nonce::uuid;
 elsif p_kind='canonical_rewrite' then return private.ai_budget_source_uuid(E'AIBUDGET-OP2\n',array[p_owner::text,p_org::text,p_kind,p_analysis::text,p_version::text,p_nonce]);
 elsif p_kind='build_account' then return private.ai_budget_source_uuid(E'AIBUDGET-OP2\n',array[p_owner::text,p_org::text,p_kind,p_nonce]);
 end if;
 raise exception 'AI_SOURCE_INVALID' using errcode='22023';
end;
$caller_identity$;
create function private.ai_budget_source_account_lock(p_owner uuid,p_org uuid) returns void
language plpgsql volatile set search_path='' as $caller_account$
begin
 if p_owner is null or p_org is null or private.try_candidate_privacy_write(p_owner) is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 perform 1 from auth.users where id=p_owner for key share skip locked;
 if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 perform 1 from public.organizations o join public.memberships m on m.organization_id=o.id
  where o.id=p_org and o.owner_id=p_owner and m.user_id=p_owner and m.role in ('owner','admin','member') for share of o,m skip locked;
 if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
end;
$caller_account$;
create function private.ai_budget_source_current(s private.ai_budget_operation_sources) returns void
language plpgsql volatile set search_path='' as $caller_current$
begin
 if s.kind='build_account' then
  if s.analysis_id is not null or s.resume_id is not null or s.resume_version_id is not null then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
  perform private.ai_budget_source_account_lock(s.owner_id,s.organization_id);return;
 end if;
 perform private.ai_budget_source_lock(s.owner_id,s.organization_id,s.analysis_id,s.resume_version_id,s.resume_id);
 if s.kind='legacy_qualitative' then
  perform 1 from public.analyses where id=s.analysis_id and status='qualitative_review' for share skip locked;
  if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 elsif s.kind='canonical_rewrite' then
  perform 1 from private.canonical_rewrite_operations c where (c.owner_id,c.organization_id,c.analysis_id,c.operation_id,c.source_id)
   =(s.owner_id,s.organization_id,s.analysis_id,s.request_nonce::uuid,s.resume_version_id) and c.state='reserved' for share skip locked;
  if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 elsif s.kind='initial_feedback' then
  perform 1 from private.initial_feedback_operations f where (f.owner_id,f.organization_id,f.analysis_id,f.operation_id,f.resume_id,f.resume_version_id)
   =(s.owner_id,s.organization_id,s.analysis_id,s.operation_id,s.resume_id,s.resume_version_id) and f.state='open' and f.publication_id is null for share skip locked;
  if not found then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='55P03';end if;
 end if;
end;
$caller_current$;
create function private.ai_budget_source_typed(p_request jsonb) returns boolean
language sql stable set search_path='' as $caller_typed$
 select exists(select 1 from private.ai_budget_operation_sources s where s.operation_id=(p_request->>'operationId')::uuid and s.kind in ('canonical_rewrite','initial_feedback'));
$caller_typed$;

create or replace function private.ai_budget_source_valid(s private.ai_budget_operation_sources,o private.ai_budget_operations) returns boolean
language sql stable set search_path='' as $caller_valid$
 select coalesce(s.request_nonce collate "C" ~ '^[ -~]{1,128}$' and (s.operation_id,s.owner_id,s.organization_id)=(o.id,o.user_id,o.organization_id)
  and s.operation_id=private.ai_budget_source_identity(s.owner_id,s.organization_id,s.kind,s.analysis_id,s.resume_version_id,s.request_nonce)
  and s.binding_sha256=o.binding_sha256 and isfinite(s.registered_at)
  and ((s.kind='build_account' and o.surface='build' and s.analysis_id is null and s.resume_id is null and s.resume_version_id is null)
   or (s.kind<>'build_account' and s.analysis_id is not null and s.resume_id is not null and s.resume_version_id is not null
    and ((s.kind='legacy_rewrite' and o.surface='rewrite')
     or (s.kind='legacy_qualitative' and o.surface='qualitative' and s.request_nonce=s.analysis_id::text)
     or (s.kind='canonical_rewrite' and o.surface='rewrite' and exists(select 1 from private.canonical_rewrite_operations c
       where (c.owner_id,c.organization_id,c.analysis_id,c.operation_id,c.source_id)=(s.owner_id,s.organization_id,s.analysis_id,s.request_nonce::uuid,s.resume_version_id)
        and c.binding_sha256=o.payload_sha256 and c.policy->>'model'=o.model and c.policy->>'promptVersion'=o.prompt_policy_version))
     or (s.kind='initial_feedback' and o.surface='qualitative' and s.request_nonce=s.operation_id::text and exists(select 1 from private.initial_feedback_operations f
       where (f.owner_id,f.organization_id,f.analysis_id,f.operation_id,f.resume_id,f.resume_version_id)=(s.owner_id,s.organization_id,s.analysis_id,s.operation_id,s.resume_id,s.resume_version_id)
        and f.binding_sha256=o.payload_sha256 and f.binding->'policy'->>'model'=o.model and f.binding->'policy'->>'promptVersion'=o.prompt_policy_version
        and f.binding->'policy'->>'budgetPolicyVersion'=o.policy_version and o.reserved_output_tokens=(f.binding->'policy'->>'maxOutputTokens')::numeric)))))
  and o.binding_sha256=private.ai_budget_binding_sha256(o.user_id,o.organization_id,jsonb_build_object('operationId',o.id,'surface',o.surface,
   'payloadSha256',o.payload_sha256,'model',o.model,'promptPolicyVersion',o.prompt_policy_version,'policyVersion',o.policy_version,
   'reservedInputTokens',trunc(o.reserved_input_tokens)::text,'reservedOutputTokens',trunc(o.reserved_output_tokens)::text)),false);
$caller_valid$;
create or replace function private.ai_budget_source_admit(p_operation uuid) returns void
language plpgsql volatile set search_path='' as $caller_admit$
declare s private.ai_budget_operation_sources%rowtype;o private.ai_budget_operations%rowtype;
begin
 if private.ai_budget_source_ready() is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='23514';end if;
 select * into s from private.ai_budget_operation_sources where operation_id=p_operation for share skip locked;
 if not found then raise exception 'AI_SOURCE_UNREGISTERED' using errcode='23514';end if;
 select * into o from private.ai_budget_operations where id=p_operation;
 if not found or private.ai_budget_source_valid(s,o) is not true then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
 perform private.ai_budget_source_current(s);
end;
$caller_admit$;
create function private.ai_budget_source_attempt_admit(p_operation uuid,p_attempt uuid,p_ordinal integer) returns void
language plpgsql volatile set search_path='' as $caller_attempt$
declare s private.ai_budget_operation_sources%rowtype;
begin
  perform private.ai_budget_source_admit(p_operation);
  select * into strict s from private.ai_budget_operation_sources where operation_id=p_operation;
  if s.kind='canonical_rewrite' and (p_ordinal<>1 or p_attempt<>private.ai_budget_source_uuid(E'AIBUDGET-ATTEMPT1\n',array[s.operation_id::text,'canonical-rewrite/1']))
   then raise exception 'AI_SOURCE_ATTEMPT' using errcode='23514';end if;
  if s.kind='initial_feedback' then
   perform 1 from private.initial_feedback_attempts a where a.attempt_id=p_attempt and a.operation_id=s.operation_id and a.ordinal=p_ordinal and a.state='reserved' for share skip locked;
   if not found then raise exception 'AI_SOURCE_ATTEMPT' using errcode='23514';end if;
  end if;
end;
$caller_attempt$;
create or replace function private.ai_budget_source_guard() returns trigger
language plpgsql volatile set search_path='' as $caller_guard$
declare s private.ai_budget_operation_sources%rowtype;
begin
 if tg_table_name='ai_budget_operation_sources' then
  if tg_op<>'INSERT' then raise exception 'AI_SOURCE_IMMUTABLE' using errcode='23514';end if;
  if new.operation_id is distinct from private.ai_budget_source_identity(new.owner_id,new.organization_id,new.kind,new.analysis_id,new.resume_version_id,new.request_nonce)
    or not isfinite(new.registered_at) or new.registered_at>clock_timestamp() then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
  perform private.ai_budget_source_current(new);
 elsif tg_table_name='ai_budget_operations' then
  if private.ai_budget_source_ready() is not true then raise exception 'AI_SOURCE_UNAVAILABLE' using errcode='23514';end if;
  select * into s from private.ai_budget_operation_sources where operation_id=new.id for share skip locked;
  if not found or private.ai_budget_source_valid(s,new) is not true then raise exception 'AI_SOURCE_UNREGISTERED' using errcode='23514';end if;
  perform private.ai_budget_source_current(s);
 elsif tg_op='INSERT' then
  perform private.ai_budget_source_attempt_admit(new.operation_id,new.id,new.ordinal);
 elsif old.state='reserved' and new.state='dispatched' then
  perform private.ai_budget_source_attempt_admit(new.operation_id,new.id,new.ordinal);
 end if;
 return new;
end;
$caller_guard$;

create or replace function public.ai_budget_reserve_source_next(p_user_id uuid,p_organization_id uuid,p_source jsonb,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $caller_reserve$
declare s private.ai_budget_operation_sources%rowtype;root_id uuid;analysis_id_value uuid;version_id uuid;op_id uuid;old_op uuid;binding text;reply jsonb;kind_value text;nonce text;
 c private.canonical_rewrite_operations%rowtype;f private.initial_feedback_operations%rowtype;a private.initial_feedback_attempts%rowtype;
begin
 if p_user_id is null or p_organization_id is null or p_request ? 'attemptOrdinal'
  or private.ai_budget_request_valid(p_request||'{"attemptOrdinal":1}'::jsonb,'reserve') is not true or jsonb_typeof(p_source) is distinct from 'object'
  then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 kind_value:=p_source->>'kind';
 if kind_value='legacy_rewrite' then
  if private.ifo_keys(p_source,array['schemaVersion','kind','analysisId','resumeVersionId','requestNonce']) is not true or p_source->>'schemaVersion' is distinct from 'ai-budget-source/1.0.0'
   then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;nonce:=p_source->>'requestNonce';
 elsif p_source->>'schemaVersion'='ai-budget-source/2.0.0' then
  if kind_value='build_account' then
   if private.ifo_keys(p_source,array['schemaVersion','kind','requestNonce']) is not true then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;nonce:=p_source->>'requestNonce';
  elsif kind_value='legacy_qualitative' then
   if private.ifo_keys(p_source,array['schemaVersion','kind','analysisId','resumeVersionId']) is not true then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;nonce:=p_source->>'analysisId';
  elsif kind_value='canonical_rewrite' then
   if private.ifo_keys(p_source,array['schemaVersion','kind','analysisId','resumeVersionId','operationId','bindingSha256']) is not true
    or jsonb_typeof(p_source->'bindingSha256') is distinct from 'string' or p_source->>'bindingSha256' collate "C" !~ '^[a-f0-9]{64}$' then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;nonce:=p_source->>'operationId';
  elsif kind_value='initial_feedback' then
   if private.ifo_keys(p_source,array['schemaVersion','kind','analysisId','resumeVersionId','operationId','attemptId','lease']) is not true
    or private.legacy_scoring_lease(p_source->'lease') is not true or jsonb_typeof(p_source->'attemptId') is distinct from 'string'
    or p_source->>'attemptId' collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;nonce:=p_source->>'operationId';
  else return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 else return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 if nonce is null or nonce collate "C" !~ '^[ -~]{1,128}$' or jsonb_typeof(p_source->(case when kind_value='legacy_qualitative' then 'analysisId' when kind_value in ('canonical_rewrite','initial_feedback') then 'operationId' else 'requestNonce' end)) is distinct from 'string'
  then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 if kind_value<>'build_account' then
  if jsonb_typeof(p_source->'analysisId') is distinct from 'string' or p_source->>'analysisId' collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or jsonb_typeof(p_source->'resumeVersionId') is distinct from 'string' or p_source->>'resumeVersionId' collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
  analysis_id_value:=(p_source->>'analysisId')::uuid;version_id:=(p_source->>'resumeVersionId')::uuid;
 end if;
 if kind_value in ('canonical_rewrite','initial_feedback') and nonce collate "C" !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 if p_request->>'surface' is distinct from case when kind_value='build_account' then 'build' when kind_value in ('legacy_rewrite','canonical_rewrite') then 'rewrite' else 'qualitative' end then return private.ai_budget_denied('AI_BUDGET_INVALID');end if;
 if private.ai_budget_source_ready() is not true then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');end if;
 op_id:=private.ai_budget_source_identity(p_user_id,p_organization_id,kind_value,analysis_id_value,version_id,nonce);
 if p_request->>'operationId' is distinct from op_id::text then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 if kind_value in ('legacy_rewrite','build_account') then old_op:=private.ai_budget_source_uuid(E'AIBUDGET-OP1\n',array[p_user_id::text,p_organization_id::text,case when kind_value='build_account' then 'build' else 'rewrite' end,nonce]);
 elsif kind_value='canonical_rewrite' then old_op:=nonce::uuid;
 end if;
 if old_op is not null and exists(select 1 from private.ai_budget_operations where id=old_op) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 if exists(select 1 from private.ai_budget_operations where id=op_id) and not exists(select 1 from private.ai_budget_operation_sources where operation_id=op_id)
  then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 if kind_value='build_account' then perform private.ai_budget_source_account_lock(p_user_id,p_organization_id);
 else root_id:=private.ai_budget_source_lock(p_user_id,p_organization_id,analysis_id_value,version_id,null);end if;
 if old_op is not null and exists(select 1 from private.ai_budget_operations where id=old_op) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
 if kind_value='canonical_rewrite' then
  select * into c from private.canonical_rewrite_operations where (owner_id,organization_id,analysis_id,operation_id,source_id)=(p_user_id,p_organization_id,analysis_id_value,nonce::uuid,version_id) for share skip locked;
  if not found or c.state<>'reserved' or c.binding_sha256 is distinct from p_source->>'bindingSha256' or c.binding_sha256 is distinct from p_request->>'payloadSha256'
   or c.policy->>'model' is distinct from p_request->>'model' or c.policy->>'promptVersion' is distinct from p_request->>'promptPolicyVersion'
   or p_request->>'attemptId' is distinct from private.ai_budget_source_uuid(E'AIBUDGET-ATTEMPT1\n',array[op_id::text,'canonical-rewrite/1'])::text then return private.ai_budget_denied('AI_BUDGET_DENIED');end if;
 elsif kind_value='initial_feedback' then
  select * into f from private.initial_feedback_operations where (operation_id,analysis_id,owner_id,organization_id,resume_id,resume_version_id)=(op_id,analysis_id_value,p_user_id,p_organization_id,root_id,version_id) for share skip locked;
  if not found or f.state<>'open' or f.publication_id is not null then return private.ai_budget_denied('AI_BUDGET_DENIED');end if;
  select * into a from private.initial_feedback_attempts where operation_id=op_id and attempt_id=(p_source->>'attemptId')::uuid for share skip locked;
  if not found or a.state<>'reserved' or p_request->>'attemptId' is distinct from a.attempt_id::text or f.binding_sha256 is distinct from p_request->>'payloadSha256'
   or f.binding->'policy'->>'model' is distinct from p_request->>'model' or f.binding->'policy'->>'promptVersion' is distinct from p_request->>'promptPolicyVersion'
   or f.binding->'policy'->>'budgetPolicyVersion' is distinct from p_request->>'policyVersion' or (f.binding->'policy'->>'maxOutputTokens')::numeric is distinct from (p_request->>'reservedOutputTokens')::numeric
   then return private.ai_budget_denied('AI_BUDGET_DENIED');end if;
  if not private.lock_analysis_stage_lease(analysis_id_value,p_source->'lease'->>'workerId',(p_source->'lease'->>'attempt')::integer,(p_source->'lease'->>'leaseFence')::uuid) then return private.ai_budget_denied('AI_BUDGET_DENIED');end if;
 end if;
 binding:=private.ai_budget_binding_sha256(p_user_id,p_organization_id,p_request);
 begin
  select * into s from private.ai_budget_operation_sources where operation_id=op_id for share skip locked;
  if found then
   if (s.owner_id,s.organization_id,s.kind,s.analysis_id,s.resume_id,s.resume_version_id,s.request_nonce,s.binding_sha256)
    is distinct from (p_user_id,p_organization_id,kind_value,analysis_id_value,root_id,version_id,nonce,binding) then raise exception 'AI_SOURCE_BINDING' using errcode='23514';end if;
  else
   if exists(select 1 from private.ai_budget_operations where id=op_id) then return private.ai_budget_denied('AI_BUDGET_CONFLICT');end if;
   insert into private.ai_budget_operation_sources values(op_id,p_user_id,p_organization_id,kind_value,analysis_id_value,root_id,version_id,nonce,binding,clock_timestamp());
  end if;
  -- Private ordinal helper is reachable ONLY after this variant's actual proof.
  reply:=private.ai_budget_source_reserve_next_core(p_user_id,p_organization_id,p_request);
  if reply->>'schemaVersion' is distinct from 'ai-budget/1.0.0' or reply->>'status' is distinct from 'ok'
   or reply->'receipt'->>'operationId' is distinct from op_id::text or reply->'receipt'->>'bindingSha256' is distinct from binding
   or (kind_value='initial_feedback' and (reply->'receipt'->>'attemptOrdinal')::numeric is distinct from a.ordinal::numeric)
   then raise exception 'AI_SOURCE_RESERVE_ROLLBACK' using errcode='P0S01';end if;
 exception when sqlstate 'P0S01' then
  if reply->>'schemaVersion'='ai-budget/1.0.0' and reply->>'status'='denied' and private.ifo_keys(reply,array['schemaVersion','status','code'])
   and reply->>'code' in ('AI_BUDGET_INVALID','AI_BUDGET_UNAVAILABLE','AI_BUDGET_DISABLED','AI_BUDGET_DENIED','AI_BUDGET_EXHAUSTED','AI_BUDGET_CONFLICT','AI_BUDGET_STATE','AI_BUDGET_BLOCKED') then return reply;end if;
  return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
 end;
 return reply;
exception when others then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
end;
$caller_reserve$;
