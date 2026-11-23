-- ADR0020 clock/closure SOURCE ONLY. SQL UNPARSED/UNEXECUTED.
-- No expiry/purge RPC, data grant, policy seed, Auth mutation or activation.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create table private.owned_ai_deletion_dispositions (
 owner_id uuid primary key,first_request_id uuid not null,
 prepared_at timestamptz not null,expires_at timestamptz not null,
 phase text not null check(phase='prepared'),
 check(isfinite(prepared_at) and isfinite(expires_at) and expires_at=prepared_at+interval '720 hours')
);
-- No Auth/request/source FK: disposition survives request/plan/content cleanup.
create table private.owned_ai_operation_dispositions (
 kind text not null check(kind in ('r03','a12','a13')),
 owner_id uuid not null,organization_id uuid not null,operation_id uuid not null,
 analysis_id uuid,resume_id uuid,resume_version_id uuid,
 source_scope text not null check(source_scope in ('account_only','resume_root','historical_unresolved')),
 phase text not null check(phase in ('prepared','repair_required')),
 first_cause text,deletion_request_id uuid,retention_item_id uuid,
 prepared_at timestamptz,expires_at timestamptz,
 unique nulls not distinct(kind,owner_id,analysis_id,operation_id),
 check(kind='r03' or (analysis_id is not null and resume_version_id is not null)),
 check((phase='repair_required' and source_scope='historical_unresolved' and first_cause is null
   and deletion_request_id is null and retention_item_id is null and prepared_at is null and expires_at is null)
  or (phase='prepared' and source_scope in ('account_only','resume_root') and prepared_at is not null and expires_at is not null
   and isfinite(prepared_at) and isfinite(expires_at) and expires_at=prepared_at+interval '720 hours'
   and ((first_cause='account_preparation' and deletion_request_id is not null and retention_item_id is null)
     or (first_cause='resume_retirement' and deletion_request_id is null and retention_item_id is not null)))),
 check(source_scope<>'account_only' or (kind='r03' and analysis_id is null and resume_id is null and resume_version_id is null and first_cause='account_preparation')),
 check(source_scope<>'resume_root' or (analysis_id is not null and resume_id is not null and resume_version_id is not null))
);
create unique index owned_ai_r03_disposition_identity on private.owned_ai_operation_dispositions(owner_id,operation_id) where kind='r03';
alter table private.owned_ai_deletion_dispositions enable row level security;
alter table private.owned_ai_operation_dispositions enable row level security;
revoke all on private.owned_ai_deletion_dispositions,private.owned_ai_operation_dispositions from public,anon,authenticated,service_role;

create function private.owned_ai_disposition_guard() returns trigger
language plpgsql volatile set search_path='' as $disp_guard$
begin
 if tg_op<>'INSERT' then raise exception 'OWNED_AI_DISPOSITION_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='owned_ai_deletion_dispositions' then
  if new.phase<>'prepared' or not isfinite(new.prepared_at) or new.prepared_at>clock_timestamp()
    or new.expires_at<>new.prepared_at+interval '720 hours'
    or not exists(select 1 from public.data_requests d join private.privacy_deletion_plans p on p.request_id=d.id
      where d.id=new.first_request_id and d.user_id=new.owner_id and d.kind='deletion' and d.status='processing'
        and d.lease_owner is not null and d.lease_expires_at>clock_timestamp() and p.created_at=new.prepared_at)
    then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
 elsif tg_table_name='owned_ai_operation_dispositions' then
  if new.kind='r03' then
   if not exists(select 1 from private.ai_budget_operations o where o.id=new.operation_id and o.user_id=new.owner_id and o.organization_id=new.organization_id)
    then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  elsif new.kind='a12' then
   if not exists(select 1 from private.canonical_rewrite_operations o where (o.owner_id,o.organization_id,o.analysis_id,o.operation_id,o.source_id)
    =(new.owner_id,new.organization_id,new.analysis_id,new.operation_id,new.resume_version_id)) then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  elsif new.kind='a13' then
   if not exists(select 1 from private.initial_feedback_operations o where (o.owner_id,o.organization_id,o.analysis_id,o.operation_id,o.resume_id,o.resume_version_id)
    =(new.owner_id,new.organization_id,new.analysis_id,new.operation_id,new.resume_id,new.resume_version_id)) then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  else raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  if new.phase='prepared' then
   if new.prepared_at>clock_timestamp() or new.expires_at<>new.prepared_at+interval '720 hours' then raise exception 'OWNED_AI_DISPOSITION_CLOCK' using errcode='23514';end if;
   if new.first_cause='account_preparation' then
    if not exists(select 1 from private.owned_ai_deletion_dispositions a where a.owner_id=new.owner_id
     and a.first_request_id=new.deletion_request_id and a.prepared_at=new.prepared_at) then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
   elsif new.first_cause='resume_retirement' then
    if not exists(select 1 from private.retention_items t where t.id=new.retention_item_id and t.owner_id=new.owner_id and t.resume_id=new.resume_id
      and t.created_at=new.prepared_at and not exists(select 1 from private.retention_items earlier where earlier.resume_id=t.resume_id
       and earlier.owner_id=t.owner_id and (earlier.created_at,earlier.id)<(t.created_at,t.id))) then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
   else raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  elsif new.phase<>'repair_required' then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
 else raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
 return new;
end;
$disp_guard$;
create trigger owned_ai_deletion_disposition_guard before insert or update or delete on private.owned_ai_deletion_dispositions for each row execute function private.owned_ai_disposition_guard();
create trigger owned_ai_operation_disposition_guard before insert or update or delete on private.owned_ai_operation_dispositions for each row execute function private.owned_ai_disposition_guard();

create function private.capture_owned_ai_disposition_row(p_kind text,p_owner uuid,p_org uuid,p_operation uuid,p_analysis uuid,p_resume uuid,p_source uuid,p_scope text,p_cause text,p_request uuid,p_item uuid,p_at timestamptz) returns void
language plpgsql volatile set search_path='' as $disp_row$
declare prior private.owned_ai_operation_dispositions%rowtype;
begin
 select * into prior from private.owned_ai_operation_dispositions where kind=p_kind and owner_id=p_owner
  and (p_kind='r03' or analysis_id is not distinct from p_analysis) and operation_id=p_operation for update skip locked;
 if found then
  if prior.organization_id<>p_org or (prior.phase='prepared' and p_at is not null and p_at<prior.prepared_at)
   then raise exception 'OWNED_AI_DISPOSITION_CONFLICT' using errcode='23514';end if;
  -- Preserve first cause, exact clock, source binding and historical repair gap.
  return;
 end if;
 if exists(select 1 from private.owned_ai_operation_dispositions where kind=p_kind and owner_id=p_owner
  and (p_kind='r03' or analysis_id is not distinct from p_analysis) and operation_id=p_operation) then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
 insert into private.owned_ai_operation_dispositions(kind,owner_id,organization_id,operation_id,analysis_id,resume_id,resume_version_id,
  source_scope,phase,first_cause,deletion_request_id,retention_item_id,prepared_at,expires_at)
 values(p_kind,p_owner,p_org,p_operation,p_analysis,p_resume,p_source,p_scope,
  case when p_scope='historical_unresolved' then 'repair_required' else 'prepared' end,p_cause,p_request,p_item,p_at,
  case when p_at is null then null else p_at+interval '720 hours' end);
end;
$disp_row$;

create function private.owned_ai_feedback_budget_link(o private.ai_budget_operations,f private.initial_feedback_operations,a private.initial_feedback_attempts,b private.ai_budget_attempts) returns boolean
language plpgsql stable set search_path='' as $disp_budget_link$
begin
 -- Explicit postclaim link OR the exact trusted reserve-before-claim tuple.
 return coalesce(o.id=f.operation_id and o.user_id=f.owner_id and o.organization_id=f.organization_id
  and a.operation_id=f.operation_id and b.operation_id=o.id and b.organization_id=o.organization_id and b.ordinal=a.ordinal
  and o.surface='qualitative' and o.payload_sha256=f.binding_sha256 and o.model=f.binding->'policy'->>'model'
  and o.prompt_policy_version=f.binding->'policy'->>'promptVersion' and o.policy_version=f.binding->'policy'->>'budgetPolicyVersion'
  and o.reserved_output_tokens=(f.binding->'policy'->>'maxOutputTokens')::numeric
  and o.binding_sha256=private.ai_budget_binding_sha256(o.user_id,o.organization_id,jsonb_build_object(
   'operationId',o.id,'surface',o.surface,'payloadSha256',o.payload_sha256,'model',o.model,'promptPolicyVersion',o.prompt_policy_version,
   'policyVersion',o.policy_version,'reservedInputTokens',o.reserved_input_tokens::text,'reservedOutputTokens',o.reserved_output_tokens::text))
  and (a.budget_attempt_id=b.id or (a.budget_attempt_id is null and a.state='reserved' and b.state='reserved' and b.id=a.attempt_id)),false);
end;
$disp_budget_link$;

create function private.capture_owned_ai_operation_dispositions(p_owner uuid,p_resume uuid,p_request uuid,p_item uuid) returns void
language plpgsql volatile set search_path='' as $disp_capture$
declare x record;source_row record;root_clock record;account_row private.owned_ai_deletion_dispositions%rowtype;
 capture_at timestamptz;cause text;cause_request uuid;cause_item uuid;root_id uuid;version_id uuid;scope text;analysis uuid;n integer:=0;expected integer;locked integer;
begin
 if private.owned_ai_disposition_ready() is not true or p_owner is null
  or (p_request is not null)::integer+(p_item is not null)::integer<>1
  or current_setting('transaction_isolation') not in ('read committed','read uncommitted') then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
 -- Callers may already hold request/item/source rows. Never wait in reverse order.
 if not private.try_lock_candidate_owners(array[p_owner]) then raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';end if;
 if p_request is not null then
  if p_resume is not null then raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
  perform 1 from public.data_requests d join private.privacy_deletion_plans p on p.request_id=d.id
   where d.id=p_request and d.user_id=p_owner and d.kind='deletion' and d.status='processing'
     and d.lease_owner is not null and d.lease_expires_at>clock_timestamp() for update of d skip locked;
  if not found then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  select * into account_row from private.owned_ai_deletion_dispositions where owner_id=p_owner;
  if not found then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
 else
  perform 1 from private.retention_items t join public.resumes r on r.id=t.resume_id and r.owner_id=t.owner_id
   where t.id=p_item and t.owner_id=p_owner and t.resume_id=p_resume and t.status='queued'
    and r.status in ('active','deleted') for update of t skip locked;
  if not found then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
  select count(*) into expected from public.resume_versions where resume_id=p_resume and owner_id=p_owner;
  select count(*) into locked from (select v.id from public.resumes r join public.resume_versions v on v.resume_id=r.id
   where r.id=p_resume and r.owner_id=p_owner and v.owner_id=p_owner for share of r,v skip locked) q;
  if expected=0 or locked<>expected then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
 end if;
 -- All states, including reserved/unpublished, before any candidate parent deletion.
 for x in
  select 'a12'::text kind,o.owner_id,o.organization_id,o.operation_id,o.analysis_id,null::uuid resume_id,o.source_id source_id
   from private.canonical_rewrite_operations o where o.owner_id=p_owner and (p_resume is null or exists(
    select 1 from public.resume_versions v where v.id=o.source_id and v.resume_id=p_resume and v.owner_id=p_owner and v.organization_id=o.organization_id))
  union all
  select 'a13',o.owner_id,o.organization_id,o.operation_id,o.analysis_id,o.resume_id,o.resume_version_id
   from private.initial_feedback_operations o where o.owner_id=p_owner and (p_resume is null or o.resume_id=p_resume)
  order by analysis_id,kind,operation_id loop
  n:=n+1;if n>4096 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
  root_id:=x.resume_id;version_id:=x.source_id;scope:='resume_root';
  select v.resume_id into root_id from public.resume_versions v where v.id=version_id and v.owner_id=p_owner and v.organization_id=x.organization_id;
  if not found then
   if exists(select 1 from public.resume_versions where id=version_id) then raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
   root_id:=x.resume_id;
  end if;
  if root_id is not null then
   perform 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id
    where r.id=root_id and r.owner_id=p_owner and v.id=version_id and v.owner_id=p_owner and v.organization_id=x.organization_id
    for share of r,v skip locked;
   if not found and exists(select 1 from public.resume_versions where id=version_id) then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
  end if;
  select t.id,t.created_at into root_clock from private.retention_items t where t.owner_id=p_owner and t.resume_id=root_id order by t.created_at,t.id limit 1;
  if p_request is not null then
   capture_at:=account_row.prepared_at;cause:='account_preparation';cause_request:=account_row.first_request_id;cause_item:=null;
   if root_clock.id is not null and root_clock.created_at<capture_at then capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;end if;
  else
   if root_clock.id is null then raise exception 'OWNED_AI_DISPOSITION_AUTHORITY' using errcode='23514';end if;
   capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;
  end if;
  if root_id is null or (not exists(select 1 from public.resume_versions where id=version_id and owner_id=p_owner and resume_id=root_id)
      and root_clock.id is null) then
   scope:='historical_unresolved';capture_at:=null;cause:=null;cause_request:=null;cause_item:=null;
  end if;
  if x.kind='a12' then
   perform 1 from private.canonical_rewrite_operations o where (o.owner_id,o.analysis_id,o.operation_id)=(p_owner,x.analysis_id,x.operation_id) for update skip locked;
  else
   perform 1 from private.initial_feedback_operations o where o.operation_id=x.operation_id and o.owner_id=p_owner for update skip locked;
  end if;
  if not found then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
  perform private.capture_owned_ai_disposition_row(x.kind,p_owner,x.organization_id,x.operation_id,x.analysis_id,root_id,version_id,scope,cause,cause_request,cause_item,capture_at);
 end loop;
 -- Account deletion owns every R03 operation across organizations, regardless of flags.
 -- Root retirement may select ONLY the exact producer relations below.
 for x in select o.* from private.ai_budget_operations o where o.user_id=p_owner and (p_resume is null or exists(
   select 1 from private.canonical_rewrite_operations c join public.resume_versions v on v.id=c.source_id
    where c.owner_id=p_owner and c.organization_id=o.organization_id and c.operation_id=o.id and v.owner_id=p_owner and v.organization_id=o.organization_id
      and v.resume_id=p_resume and o.surface='rewrite' and o.payload_sha256=c.binding_sha256
      and o.model=c.policy->>'model' and o.prompt_policy_version=c.policy->>'promptVersion'
   union all
   select 1 from private.initial_feedback_operations f join private.initial_feedback_attempts a on a.operation_id=f.operation_id
    join private.ai_budget_attempts b on b.operation_id=o.id and b.id=coalesce(a.budget_attempt_id,a.attempt_id) and private.owned_ai_feedback_budget_link(o,f,a,b)
    where f.owner_id=p_owner and f.organization_id=o.organization_id and f.resume_id=p_resume and f.operation_id=o.id
      and o.surface='qualitative' and o.payload_sha256=f.binding_sha256 and o.model=f.binding->'policy'->>'model'
      and o.prompt_policy_version=f.binding->'policy'->>'promptVersion' and o.policy_version=f.binding->'policy'->>'budgetPolicyVersion'
   union all
   select 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id
    where a.id=o.id and a.owner_id=p_owner and a.organization_id=o.organization_id and v.owner_id=p_owner and v.organization_id=o.organization_id
      and v.resume_id=p_resume and o.surface='qualitative')) order by o.id loop
  n:=n+1;if n>4096 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
  if p_resume is null then
   -- Account capture cannot restart an already proved root-retirement deadline.
   -- Match the REAL producer binding before using any typed clock or selector.
   select d.* into source_row from private.owned_ai_operation_dispositions d
    where d.owner_id=p_owner and d.organization_id=x.organization_id and d.operation_id=x.id and (
     (d.kind='a12' and x.surface='rewrite' and exists(select 1 from private.canonical_rewrite_operations c
       where (c.owner_id,c.analysis_id,c.operation_id)=(p_owner,d.analysis_id,x.id) and c.binding_sha256=x.payload_sha256
        and c.policy->>'model'=x.model and c.policy->>'promptVersion'=x.prompt_policy_version))
     or (d.kind='a13' and x.surface='qualitative' and exists(select 1 from private.initial_feedback_operations f
       join private.initial_feedback_attempts a on a.operation_id=f.operation_id join private.ai_budget_attempts z on z.operation_id=x.id and z.id=coalesce(a.budget_attempt_id,a.attempt_id) and private.owned_ai_feedback_budget_link(x,f,a,z)
       where f.operation_id=x.id and f.owner_id=p_owner and f.binding_sha256=x.payload_sha256 and z.operation_id=x.id)))
    order by d.prepared_at nulls first,d.kind,d.analysis_id limit 1;
   if found then
    analysis:=source_row.analysis_id;root_id:=source_row.resume_id;version_id:=source_row.resume_version_id;
    scope:=source_row.source_scope;capture_at:=source_row.prepared_at;cause:=source_row.first_cause;
    cause_request:=source_row.deletion_request_id;cause_item:=source_row.retention_item_id;
   else
    select a.id analysis_id,v.resume_id,v.id resume_version_id into source_row from public.analyses a join public.resume_versions v on v.id=a.resume_version_id
     where a.id=x.id and a.owner_id=p_owner and a.organization_id=x.organization_id and v.owner_id=p_owner and v.organization_id=x.organization_id and x.surface='qualitative';
    if found then
     analysis:=source_row.analysis_id;root_id:=source_row.resume_id;version_id:=source_row.resume_version_id;scope:='resume_root';
     select t.id,t.created_at into root_clock from private.retention_items t where t.owner_id=p_owner and t.resume_id=root_id order by t.created_at,t.id limit 1;
     capture_at:=account_row.prepared_at;cause:='account_preparation';cause_request:=account_row.first_request_id;cause_item:=null;
     if root_clock.id is not null and root_clock.created_at<capture_at then capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;end if;
    elsif x.surface='build' then
     -- Standalone Build has no resume root to infer. Its first account cause is exact.
     analysis:=null;root_id:=null;version_id:=null;scope:='account_only';capture_at:=account_row.prepared_at;
     cause:='account_preparation';cause_request:=account_row.first_request_id;cause_item:=null;
    else
     -- Unbound historical qualitative/rewrite identity supplies no first source clock.
     analysis:=null;root_id:=null;version_id:=null;scope:='historical_unresolved';capture_at:=null;cause:=null;cause_request:=null;cause_item:=null;
    end if;
   end if;
  else
   -- Exact previously captured typed selector, or legacy qualitative analysis identity.
   select d.analysis_id,d.resume_id,d.resume_version_id into source_row from private.owned_ai_operation_dispositions d
    where d.owner_id=p_owner and d.organization_id=x.organization_id and d.operation_id=x.id and d.kind in ('a12','a13')
     and d.resume_id=p_resume and d.phase='prepared' and (
      (d.kind='a12' and x.surface='rewrite' and exists(select 1 from private.canonical_rewrite_operations c
        where (c.owner_id,c.analysis_id,c.operation_id)=(p_owner,d.analysis_id,x.id) and c.binding_sha256=x.payload_sha256
          and c.policy->>'model'=x.model and c.policy->>'promptVersion'=x.prompt_policy_version))
      or (d.kind='a13' and x.surface='qualitative' and exists(select 1 from private.initial_feedback_operations f
        join private.initial_feedback_attempts a on a.operation_id=f.operation_id join private.ai_budget_attempts z on z.operation_id=x.id and z.id=coalesce(a.budget_attempt_id,a.attempt_id) and private.owned_ai_feedback_budget_link(x,f,a,z)
        where f.operation_id=x.id and f.owner_id=p_owner and f.binding_sha256=x.payload_sha256 and z.operation_id=x.id)))
    order by d.kind,d.analysis_id limit 1;
   if not found then
    select a.id analysis_id,v.resume_id,v.id resume_version_id into source_row from public.analyses a join public.resume_versions v on v.id=a.resume_version_id
     where a.id=x.id and a.owner_id=p_owner and a.organization_id=x.organization_id and v.owner_id=p_owner and v.organization_id=x.organization_id and v.resume_id=p_resume;
   end if;
   if not found then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
   analysis:=source_row.analysis_id;root_id:=source_row.resume_id;version_id:=source_row.resume_version_id;scope:='resume_root';
   select t.id,t.created_at into root_clock from private.retention_items t where t.owner_id=p_owner and t.resume_id=p_resume order by t.created_at,t.id limit 1;
   capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;
  end if;
  perform 1 from private.ai_budget_operations o where o.id=x.id and o.user_id=p_owner for update skip locked;
  if not found then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
  perform private.capture_owned_ai_disposition_row('r03',p_owner,x.organization_id,x.id,analysis,root_id,version_id,scope,cause,cause_request,cause_item,capture_at);
 end loop;
end;
$disp_capture$;

create function public.read_candidate_privacy_access(p_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $disp_access$
declare answer jsonb;
begin
 if p_user_id is null or private.owned_ai_disposition_ready() is not true then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
 -- One statement snapshot; durable preparation survives status/plan/expiry changes.
 select jsonb_build_object('schemaVersion','candidate-privacy-access/1.0.0','ownerId',u.id,
  'deletionPrepared',exists(select 1 from private.owned_ai_deletion_dispositions d where d.owner_id=u.id),
  'blockingRequest',exists(select 1 from public.data_requests d where d.user_id=u.id and d.kind='deletion'
    and d.status is distinct from 'failed' and d.status is distinct from 'cancelled')) into answer from auth.users u where u.id=p_user_id;
 if answer is null then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
 return answer;
end;
$disp_access$;

create function public.export_owned_ai_disposition_records(p_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $disp_export$
declare accounts jsonb[]:=array[]::jsonb[];operations jsonb[]:=array[]::jsonb[];row_value jsonb;answer jsonb;n integer:=0;bytes bigint:=1024;
begin
 if p_user_id is null or private.owned_ai_disposition_ready() is not true then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
 if not private.try_lock_candidate_owners(array[p_user_id]) then raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';end if;
 perform 1 from auth.users where id=p_user_id for key share skip locked;if not found then raise exception 'OWNED_AI_DISPOSITION_UNAVAILABLE' using errcode='23514';end if;
 -- Missing historical clocks are not an empty complete export. Only PROVED
 -- retired source relationships qualify; standalone Build is never guessed.
 if exists(select 1 from private.initial_feedback_operations o where o.owner_id=p_user_id
   and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='a13' and d.owner_id=p_user_id and d.operation_id=o.operation_id)
   and (exists(select 1 from private.initial_feedback_content_retirements r where r.operation_id=o.operation_id and r.owner_id=p_user_id)
    or exists(select 1 from private.retention_items t where t.resume_id=o.resume_id and t.owner_id=p_user_id)
    or not exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id
      join public.analyses a on a.resume_version_id=v.id where v.id=o.resume_version_id and r.id=o.resume_id and a.id=o.analysis_id
       and v.owner_id=p_user_id and r.owner_id=p_user_id and a.owner_id=p_user_id)))
  or exists(select 1 from private.canonical_rewrite_operations o where o.owner_id=p_user_id
   and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='a12' and (d.owner_id,d.analysis_id,d.operation_id)=(p_user_id,o.analysis_id,o.operation_id))
   and (not exists(select 1 from public.resume_versions v join public.analyses a on a.resume_version_id=v.id
     where v.id=o.source_id and a.id=o.analysis_id and v.owner_id=p_user_id and a.owner_id=p_user_id)
    or exists(select 1 from public.resume_versions v join private.retention_items t on t.resume_id=v.resume_id and t.owner_id=v.owner_id
      where v.id=o.source_id and v.owner_id=p_user_id)))
  or exists(select 1 from private.ai_budget_operations o where o.user_id=p_user_id
   and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='r03' and d.owner_id=p_user_id and d.operation_id=o.id)
   and exists(select 1 from private.owned_ai_operation_dispositions d where d.owner_id=p_user_id and d.organization_id=o.organization_id
     and d.operation_id=o.id and d.first_cause='resume_retirement' and (
      (d.kind='a12' and o.surface='rewrite' and exists(select 1 from private.canonical_rewrite_operations c
        where (c.owner_id,c.analysis_id,c.operation_id)=(p_user_id,d.analysis_id,o.id) and c.binding_sha256=o.payload_sha256))
      or (d.kind='a13' and o.surface='qualitative' and exists(select 1 from private.initial_feedback_operations f
        join private.initial_feedback_attempts a on a.operation_id=f.operation_id join private.ai_budget_attempts z on z.operation_id=o.id and z.id=coalesce(a.budget_attempt_id,a.attempt_id) and private.owned_ai_feedback_budget_link(o,f,a,z)
         where f.operation_id=o.id and f.owner_id=p_user_id and f.binding_sha256=o.payload_sha256 and z.operation_id=o.id)))))
   then raise exception 'OWNED_AI_DISPOSITION_HISTORICAL_REPAIR' using errcode='23514';end if;
 -- Prepared account closure cannot silently omit a retained operation.
 if exists(select 1 from private.owned_ai_deletion_dispositions where owner_id=p_user_id) and (
   exists(select 1 from private.ai_budget_operations o where o.user_id=p_user_id and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='r03' and d.owner_id=p_user_id and d.operation_id=o.id))
   or exists(select 1 from private.canonical_rewrite_operations o where o.owner_id=p_user_id and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='a12' and (d.owner_id,d.analysis_id,d.operation_id)=(p_user_id,o.analysis_id,o.operation_id)))
   or exists(select 1 from private.initial_feedback_operations o where o.owner_id=p_user_id and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='a13' and d.owner_id=p_user_id and d.operation_id=o.operation_id)))
   then raise exception 'OWNED_AI_DISPOSITION_INCOMPLETE' using errcode='23514';end if;
 for row_value in select to_jsonb(d)||jsonb_build_object('prepared_at',private.ifo_stamp(d.prepared_at),'expires_at',private.ifo_stamp(d.expires_at))
  from private.owned_ai_deletion_dispositions d where d.owner_id=p_user_id loop
  n:=n+1;bytes:=bytes+octet_length(convert_to(row_value::text,'UTF8'))+1;if n>4096 or bytes>33554432 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
  accounts:=array_append(accounts,row_value);
 end loop;
 for row_value in select to_jsonb(d)||jsonb_build_object('prepared_at',private.ifo_stamp(d.prepared_at),'expires_at',private.ifo_stamp(d.expires_at),
   'effective_expires_at',case when d.expires_at is null then null else private.ifo_stamp(least(d.expires_at,a.expires_at)) end)
  from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id
  where d.owner_id=p_user_id order by d.kind,d.analysis_id nulls first,d.operation_id limit 4097 loop
  n:=n+1;bytes:=bytes+octet_length(convert_to(row_value::text,'UTF8'))+1;if n>4096 or bytes>33554432 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
  operations:=array_append(operations,row_value);
 end loop;
 answer:=jsonb_build_object('schemaVersion','owned-ai-disposition-export/1.0.0','ownerId',p_user_id,'accounts',to_jsonb(accounts),'operations',to_jsonb(operations));
 if octet_length(convert_to(answer::text,'UTF8'))>33554432 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
 return answer;
end;
$disp_export$;

create function public.read_owned_ai_disposition_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $disp_metadata$
begin
 return jsonb_build_object('schemaVersion','owned-ai-disposition-readiness/1.0.0','profileVersion','owned-ai-disposition-profile/1.0.0',
  'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_ai_disposition_ready()')),
  'exportSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.export_owned_ai_disposition_records(uuid)')),
  'accessSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_candidate_privacy_access(uuid)')),
  'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_owned_ai_disposition_readiness()')),
  'schemaReady',private.owned_ai_disposition_ready(),
  'exportExecutable',has_function_privilege('service_role',to_regprocedure('public.export_owned_ai_disposition_records(uuid)'),'EXECUTE'),
  'accessExecutable',has_function_privilege('service_role',to_regprocedure('public.read_candidate_privacy_access(uuid)'),'EXECUTE'));
end;
$disp_metadata$;

-- Nonpersonal schema seal, initialized ONCE by this future migration only.
create table private.owned_ai_disposition_catalogue_seal (
 singleton boolean primary key check(singleton),catalogue jsonb not null
);
alter table private.owned_ai_disposition_catalogue_seal enable row level security;
revoke all on private.owned_ai_disposition_catalogue_seal from public,anon,authenticated,service_role;
create function private.owned_ai_disposition_catalogue() returns jsonb
language sql stable set search_path='' as $disp_catalogue$
 select jsonb_object_agg(c.relname,jsonb_build_object(
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
    'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,'validated',k.convalidated,
    'deferred',k.condeferred,'deferrable',k.condeferrable,'definition',pg_get_constraintdef(k.oid,false)) order by k.conname),'[]'::jsonb)
    from pg_catalog.pg_constraint k where k.conrelid=c.oid),
  'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),
    'unique',x.indisunique,'primary',x.indisprimary,'valid',x.indisvalid,'nullsNotDistinct',x.indnullsnotdistinct,
    'keys',x.indkey::text,'predicate',pg_get_expr(x.indpred,x.indrelid)) order by i.relname),'[]'::jsonb)
    from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,
    'args',encode(t.tgargs,'hex'),'definition',pg_get_triggerdef(t.oid,false)) order by t.tgname),'[]'::jsonb)
    from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal
     and not (c.relname='owned_ai_disposition_catalogue_seal' and t.tgname='owned_ai_disposition_seal_closed'))))
 from pg_catalog.pg_class c where c.oid in ('private.owned_ai_deletion_dispositions'::regclass,'private.owned_ai_operation_dispositions'::regclass,'private.owned_ai_disposition_catalogue_seal'::regclass);
$disp_catalogue$;
create function private.owned_ai_disposition_seal_closed() returns trigger
language plpgsql volatile set search_path='' as $disp_seal_closed$
begin raise exception 'OWNED_AI_DISPOSITION_SEAL_CLOSED' using errcode='23514';end;
$disp_seal_closed$;
insert into private.owned_ai_disposition_catalogue_seal(singleton,catalogue) values(true,private.owned_ai_disposition_catalogue());
create trigger owned_ai_disposition_seal_closed before insert or update or delete on private.owned_ai_disposition_catalogue_seal for each row execute function private.owned_ai_disposition_seal_closed();
