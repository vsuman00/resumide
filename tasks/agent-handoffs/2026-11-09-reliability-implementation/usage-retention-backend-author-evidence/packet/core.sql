-- Original-month run conservation SOURCE ONLY. SQL UNPARSED/UNEXECUTED.
-- No purge, refund, lifetime extension or data activation.
begin;
set local statement_timeout='10s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='15s';set local search_path='';
create table private.owned_legacy_ai_usage_retirements(
 run_id uuid primary key,owner_id uuid not null,organization_id uuid not null,analysis_id uuid not null,resume_id uuid not null,resume_version_id uuid not null,
 run_created_at timestamptz not null check(isfinite(run_created_at)),original_month date not null,
 input_tokens numeric not null check(input_tokens=trunc(input_tokens) and input_tokens between 0 and 2147483647),
 output_tokens numeric not null check(output_tokens=trunc(output_tokens) and output_tokens between 0 and 2147483647),
 classification text not null check(classification in ('legacy_unlinked','a12_linked','a13_linked')),
 first_cause text not null check(first_cause in ('account_preparation','resume_retirement')),deletion_request_id uuid,retention_item_id uuid,
 prepared_at timestamptz not null check(isfinite(prepared_at)),expires_at timestamptz not null,
 check(original_month=date_trunc('month',run_created_at at time zone 'UTC')::date),check(expires_at=prepared_at+interval '720 hours'),
 check((first_cause='account_preparation' and deletion_request_id is not null and retention_item_id is null)
  or (first_cause='resume_retirement' and deletion_request_id is null and retention_item_id is not null))
);
alter table private.owned_legacy_ai_usage_retirements enable row level security;
revoke all on private.owned_legacy_ai_usage_retirements from public,anon,authenticated,service_role;
create table private.owned_legacy_ai_usage_catalogue_seal(singleton boolean primary key check(singleton),catalogue_sha256 text not null check(catalogue_sha256 collate "C" ~ '^[a-f0-9]{64}$'));
alter table private.owned_legacy_ai_usage_catalogue_seal enable row level security;
revoke all on private.owned_legacy_ai_usage_catalogue_seal from public,anon,authenticated,service_role;

create function private.owned_legacy_ai_usage_links(p_org uuid) returns table(run_id uuid,classification text,valid boolean)
language sql stable set search_path='' as $legacy_links$
  with canonical_scope as materialized (
    select x.owner_id,x.organization_id,x.analysis_id,x.operation_id,x.run_id,x.claimed_at,nullif(x.usage,'null'::jsonb) usage,
      x.binding_sha256,x.policy->>'model' model,x.policy->>'promptVersion' prompt_version
    from private.canonical_rewrite_operations x where x.organization_id=p_org
    union
    select x.owner_id,x.organization_id,x.analysis_id,x.operation_id,x.run_id,x.claimed_at,nullif(x.usage,'null'::jsonb),
      x.binding_sha256,x.policy->>'model',x.policy->>'promptVersion'
    from private.canonical_rewrite_operations x join public.analysis_ai_runs r on r.id=x.run_id where r.organization_id=p_org
  ), feedback_attempts as materialized (
    select t.attempt_id,t.operation_id,t.claimed_at,nullif(t.usage,'null'::jsonb) usage,o.owner_id,o.organization_id,o.analysis_id,
      o.binding_sha256,o.binding->'policy'->>'model' model,o.binding->'policy'->>'promptVersion' prompt_version
    from private.initial_feedback_attempts t join private.initial_feedback_operations o on o.operation_id=t.operation_id
    where o.organization_id=p_org
  ), retirement_scope as materialized (
    select s.* from private.initial_feedback_content_retirements s where s.organization_id=p_org
    union select s.* from private.initial_feedback_content_retirements s join private.initial_feedback_operations o on o.operation_id=s.operation_id where o.organization_id=p_org
    union select s.* from private.initial_feedback_content_retirements s join public.analysis_ai_runs r on r.id=s.run_id where r.organization_id=p_org
  ), publication_scope as materialized (
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p where p.organization_id=p_org
    union
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p join private.initial_feedback_operations o on o.operation_id=p.operation_id where o.organization_id=p_org
    union
    select p.id,p.operation_id,p.attempt_id,p.analysis_id,p.owner_id,p.organization_id,p.run_id,p.state,p.binding_sha256
    from private.initial_feedback_publications p join public.analysis_ai_runs r on r.id=p.run_id where r.organization_id=p_org
    union
    select s.publication_id,s.operation_id,s.attempt_id,s.analysis_id,s.owner_id,s.organization_id,s.run_id,s.publication_state,s.binding_sha256
    from retirement_scope s
  ), links as materialized (
    -- Retained pre-compatibility A12 legacy runs are authoritative links too.
    select r.id run_id,'a12_linked'::text classification,coalesce(x.organization_id=p_org and x.claimed_at is not null and isfinite(x.claimed_at)
      and x.usage is not null and private.ifo_usage_valid(x.usage)
      and (r.owner_id,r.organization_id,r.analysis_id)=(x.owner_id,x.organization_id,x.analysis_id)
      and r.provider='openai' and r.model_id=x.model and r.prompt_version=x.prompt_version and r.input_hash=x.binding_sha256
      and r.input_tokens>=0 and r.output_tokens>=0
      and r.input_tokens::text=x.usage->>'inputTokens' and r.output_tokens::text=x.usage->>'outputTokens',false) valid
    from canonical_scope x join public.analysis_ai_runs r on r.id=x.run_id
    union all
    select p.run_id,'a13_linked'::text,coalesce(p.organization_id=p_org and p.state='assessed'
      and o.operation_id=p.operation_id and o.publication_id=p.id and o.state='published'
      and t.attempt_id=p.attempt_id and t.operation_id=o.operation_id
      and (p.owner_id,p.organization_id,p.analysis_id)=(o.owner_id,o.organization_id,o.analysis_id)
      and p.binding_sha256=o.binding_sha256 and t.claimed_at is not null and isfinite(t.claimed_at)
      and nullif(t.usage,'null'::jsonb) is not null and private.ifo_usage_valid(t.usage)
      and (r.owner_id,r.organization_id,r.analysis_id)=(p.owner_id,p.organization_id,p.analysis_id)
      and r.provider='openai' and r.model_id=o.binding->'policy'->>'model' and r.prompt_version=o.binding->'policy'->>'promptVersion'
      and r.input_hash=o.binding_sha256 and r.input_tokens>=0 and r.output_tokens>=0
      and r.input_tokens::text=t.usage->>'inputTokens' and r.output_tokens::text=t.usage->>'outputTokens',false)
    from publication_scope p left join private.initial_feedback_operations o on o.operation_id=p.operation_id
      left join private.initial_feedback_attempts t on t.attempt_id=p.attempt_id
      left join public.analysis_ai_runs r on r.id=p.run_id where p.run_id is not null
      and (r.id is not null or not exists(select 1 from retirement_scope s where s.publication_id=p.id and s.run_id=p.run_id))
  ), integrity as (
    select not exists(select 1 from links where not valid)
      and not exists(select 1 from links group by run_id having count(*)>1)
      and not exists(select 1 from retirement_scope s left join private.initial_feedback_operations o on o.operation_id=s.operation_id
        where o.operation_id is null or o.state<>'published' or s.publication_id is distinct from o.publication_id
          or (s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id,s.binding_sha256)
            is distinct from (o.owner_id,o.organization_id,o.analysis_id,o.resume_id,o.resume_version_id,o.binding_sha256)
          or exists(select 1 from private.initial_feedback_publications p where p.id=s.publication_id or p.operation_id=s.operation_id)
          or s.publication_state not in ('assessed','deterministic_only') or not isfinite(s.retired_at)
          or (s.publication_state='assessed' and (s.run_id is null or not exists(select 1 from private.initial_feedback_attempts t
            where t.attempt_id=s.attempt_id and t.operation_id=o.operation_id and t.state='published' and t.error_code is null
              and t.claimed_at is not null and isfinite(t.claimed_at) and t.usage is not null and private.ifo_usage_valid(t.usage))))
          or (s.publication_state='deterministic_only' and s.run_id is not null)
          or (s.attempt_id is not null and not exists(select 1 from private.initial_feedback_attempts t where t.attempt_id=s.attempt_id and t.operation_id=o.operation_id)))
      and not exists(select 1 from private.initial_feedback_operations o where o.organization_id=p_org and o.publication_id is not null
        and not exists(select 1 from private.initial_feedback_publications p where p.id=o.publication_id and p.operation_id=o.operation_id
          and p.owner_id=o.owner_id and p.organization_id=o.organization_id and p.analysis_id=o.analysis_id)
        and not exists(select 1 from retirement_scope s where s.publication_id=o.publication_id and s.operation_id=o.operation_id
          and s.owner_id=o.owner_id and s.organization_id=o.organization_id and s.analysis_id=o.analysis_id and s.binding_sha256=o.binding_sha256)) valid
  )
 select l.run_id,l.classification,i.valid from links l cross join integrity i
 union all select null::uuid,null::text,i.valid from integrity i;
$legacy_links$;

create function private.owned_legacy_ai_usage_class(p_org uuid,p_run uuid) returns text
language plpgsql stable set search_path='' as $legacy_class$
declare ok boolean;kind text;
begin
 select coalesce(bool_and(valid),false),max(classification) filter(where run_id=p_run) into ok,kind
  from private.owned_legacy_ai_usage_links(p_org) where run_id=p_run or run_id is null;
 if ok is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 return coalesce(kind,'legacy_unlinked');
end;
$legacy_class$;
create function private.owned_legacy_ai_usage_row_valid(t private.owned_legacy_ai_usage_retirements) returns boolean
language plpgsql stable set search_path='' as $legacy_row_valid$
declare r public.analysis_ai_runs%rowtype;
begin
 if not isfinite(t.run_created_at) or not isfinite(t.prepared_at) or t.expires_at is distinct from t.prepared_at+interval '720 hours'
  or t.original_month is distinct from date_trunc('month',t.run_created_at at time zone 'UTC')::date
  or t.input_tokens is null or t.output_tokens is null or t.input_tokens<>trunc(t.input_tokens) or t.output_tokens<>trunc(t.output_tokens)
  or t.input_tokens not between 0 and 2147483647 or t.output_tokens not between 0 and 2147483647 then return false;end if;
 if t.first_cause='account_preparation' then
  if t.retention_item_id is not null or not exists(select 1 from private.owned_ai_deletion_dispositions a
    where (a.owner_id,a.first_request_id,a.prepared_at)=(t.owner_id,t.deletion_request_id,t.prepared_at)) then return false;end if;
 elsif t.first_cause='resume_retirement' then
  if t.deletion_request_id is not null or not exists(select 1 from private.retention_items x where (x.id,x.owner_id,x.resume_id,x.created_at)
    =(t.retention_item_id,t.owner_id,t.resume_id,t.prepared_at) and not exists(select 1 from private.retention_items earlier
      where earlier.owner_id=t.owner_id and earlier.resume_id=t.resume_id and earlier.created_at<t.prepared_at)) then return false;end if;
 else return false;end if;
 select * into r from public.analysis_ai_runs where id=t.run_id;
 if found then
  if (r.owner_id,r.organization_id,r.analysis_id,r.created_at,r.input_tokens::numeric,r.output_tokens::numeric)
    is distinct from (t.owner_id,t.organization_id,t.analysis_id,t.run_created_at,t.input_tokens,t.output_tokens)
    or not exists(select 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id join public.resumes root on root.id=v.resume_id
      where (a.id,a.owner_id,a.organization_id,v.id,v.owner_id,v.organization_id,root.id,root.owner_id,root.organization_id)
       =(t.analysis_id,t.owner_id,t.organization_id,t.resume_version_id,t.owner_id,t.organization_id,t.resume_id,t.owner_id,t.organization_id))
    then return false;end if;
  return private.owned_legacy_ai_usage_class(t.organization_id,t.run_id)=t.classification;
 end if;
 -- Missing raw rows never erase the authoritative typed contribution.
 if t.classification='legacy_unlinked' then
  return not exists(select 1 from private.canonical_rewrite_operations c where c.run_id=t.run_id)
    and not exists(select 1 from private.initial_feedback_publications p where p.run_id=t.run_id)
    and not exists(select 1 from private.initial_feedback_content_retirements s where s.run_id=t.run_id);
 elsif t.classification='a12_linked' then
  return exists(select 1 from private.canonical_rewrite_operations c where (c.run_id,c.owner_id,c.organization_id,c.analysis_id,c.source_id)
    =(t.run_id,t.owner_id,t.organization_id,t.analysis_id,t.resume_version_id) and c.claimed_at is not null and isfinite(c.claimed_at)
    and private.ifo_usage_valid(c.usage) and (c.usage->>'inputTokens')::numeric=t.input_tokens and (c.usage->>'outputTokens')::numeric=t.output_tokens);
 elsif t.classification='a13_linked' then
  return (exists(select 1 from private.initial_feedback_content_retirements s join private.initial_feedback_operations o on o.operation_id=s.operation_id
    join private.initial_feedback_attempts a on a.attempt_id=s.attempt_id and a.operation_id=o.operation_id
    where (s.run_id,s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)=(t.run_id,t.owner_id,t.organization_id,t.analysis_id,t.resume_id,t.resume_version_id)
      and s.publication_state='assessed' and s.publication_id=o.publication_id and s.binding_sha256=o.binding_sha256 and o.state='published'
      and (o.owner_id,o.organization_id,o.analysis_id,o.resume_id,o.resume_version_id)=(t.owner_id,t.organization_id,t.analysis_id,t.resume_id,t.resume_version_id)
      and a.state='published' and a.error_code is null and a.claimed_at is not null and isfinite(a.claimed_at) and private.ifo_usage_valid(a.usage)
      and (a.usage->>'inputTokens')::numeric=t.input_tokens and (a.usage->>'outputTokens')::numeric=t.output_tokens))
   or (private.owned_legacy_ai_usage_class(t.organization_id,t.run_id)='a13_linked' and exists(
   select 1 from private.initial_feedback_publications p join private.initial_feedback_operations o on o.operation_id=p.operation_id
    join private.initial_feedback_attempts a on a.attempt_id=p.attempt_id and a.operation_id=o.operation_id
    where (p.run_id,p.owner_id,p.organization_id,p.analysis_id,o.resume_id,o.resume_version_id)
     =(t.run_id,t.owner_id,t.organization_id,t.analysis_id,t.resume_id,t.resume_version_id) and o.publication_id=p.id
     and a.claimed_at is not null and isfinite(a.claimed_at) and private.ifo_usage_valid(a.usage)
     and (a.usage->>'inputTokens')::numeric=t.input_tokens and (a.usage->>'outputTokens')::numeric=t.output_tokens));
 end if;
 return false;
end;
$legacy_row_valid$;
create function private.owned_legacy_ai_usage_guard() returns trigger
language plpgsql volatile set search_path='' as $legacy_guard$
begin
 if tg_op<>'INSERT' then raise exception 'OWNED_LEGACY_AI_USAGE_IMMUTABLE' using errcode='23514';end if;
 if not exists(select 1 from public.analysis_ai_runs where id=new.run_id) or private.owned_legacy_ai_usage_row_valid(new) is not true
  then raise exception 'OWNED_LEGACY_AI_USAGE_AUTHORITY' using errcode='23514';end if;
 return new;
end;
$legacy_guard$;
create trigger owned_legacy_ai_usage_guard before insert or update or delete on private.owned_legacy_ai_usage_retirements for each row execute function private.owned_legacy_ai_usage_guard();
create function private.assert_owned_legacy_ai_usage(p_org uuid) returns void
language plpgsql stable set search_path='' as $legacy_assert$
declare t private.owned_legacy_ai_usage_retirements%rowtype;ok boolean;
begin
 -- All-month partition validation precedes any accounting period predicate.
 select coalesce(bool_and(valid),false) into ok from private.owned_legacy_ai_usage_links(p_org);
 if ok is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 -- Include either side's org BEFORE filters, so moved live identity cannot hide drift.
 for t in select x.* from private.owned_legacy_ai_usage_retirements x where x.organization_id=p_org
  or exists(select 1 from public.analysis_ai_runs r where r.id=x.run_id and r.organization_id=p_org) loop
  if private.owned_legacy_ai_usage_row_valid(t) is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 end loop;
end;
$legacy_assert$;

create function private.assert_owned_legacy_ai_usage_month(p_org uuid,p_month date) returns boolean
language plpgsql stable set search_path='' as $legacy_month$
begin
 perform private.assert_owned_legacy_ai_usage(p_org);
 -- Due rows never disappear from quota eligibility. Folding/purge is separate.
 if exists(select 1 from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id
   where t.organization_id=p_org and t.classification='legacy_unlinked' and t.original_month=p_month
    and least(t.expires_at,a.expires_at)<=clock_timestamp()) then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 return true;
end;
$legacy_month$;
create function private.owned_legacy_ai_usage_analysis_scope(p_owner uuid,p_resume uuid) returns setof uuid
language sql stable set search_path='' as $legacy_scope$
 select a.id from public.analyses a where (p_resume is not null and exists(select 1 from public.resume_versions v where v.id=a.resume_version_id and v.resume_id=p_resume))
  or (p_resume is null and (a.owner_id=p_owner or exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id where v.id=a.resume_version_id and r.owner_id=p_owner)));
$legacy_scope$;
create function private.capture_owned_legacy_ai_usage(p_owner uuid,p_resume uuid,p_request uuid,p_item uuid) returns void
language plpgsql volatile set search_path='' as $legacy_capture$
declare locked_root public.resumes%rowtype;locked_version public.resume_versions%rowtype;locked_analysis public.analyses%rowtype;x record;prior private.owned_legacy_ai_usage_retirements%rowtype;
 account_row private.owned_ai_deletion_dispositions%rowtype;root_clock record;expected bigint;locked bigint:=0;kind text;first_at timestamptz;cause text;cause_request uuid;cause_item uuid;
begin
 if private.owned_legacy_ai_usage_ready() is not true or p_owner is null or (p_request is not null)::integer+(p_item is not null)::integer<>1
  or current_setting('transaction_isolation') not in ('read committed','read uncommitted') then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 if not private.try_lock_candidate_owners(array[p_owner]) then raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';end if;
 select * into account_row from private.owned_ai_deletion_dispositions where owner_id=p_owner;
 if p_request is not null then
  if p_resume is not null or account_row.owner_id is null or not exists(select 1 from public.data_requests d join private.privacy_deletion_plans p on p.request_id=d.id
   where d.id=p_request and d.user_id=p_owner and d.kind='deletion' and d.status='processing' and d.lease_owner is not null and d.lease_expires_at>clock_timestamp())
   then raise exception 'OWNED_LEGACY_AI_USAGE_AUTHORITY' using errcode='23514';end if;
 else
  if p_resume is null or not exists(select 1 from private.retention_items t join public.resumes r on r.id=t.resume_id
    where t.id=p_item and t.resume_id=p_resume and t.owner_id=p_owner and r.owner_id=p_owner and t.status='deleted'
     and private.r17_root_covered(p_owner,p_resume,r.organization_id)) then raise exception 'OWNED_LEGACY_AI_USAGE_AUTHORITY' using errcode='23514';end if;
 end if;
 -- Lock every actual root/version/analysis in the cascading closure, not only
 -- owner-filtered child rows. FK KEY SHARE inserts conflict with FOR UPDATE.
 select count(*) into expected from public.resumes r where (p_resume is not null and r.id=p_resume) or (p_resume is null and (r.owner_id=p_owner or exists(
  select 1 from public.resume_versions v join public.analyses a on a.resume_version_id=v.id where v.resume_id=r.id and a.owner_id=p_owner)));
 for locked_root in select r.* from public.resumes r where (p_resume is not null and r.id=p_resume) or (p_resume is null and (r.owner_id=p_owner or exists(
  select 1 from public.resume_versions v join public.analyses a on a.resume_version_id=v.id where v.resume_id=r.id and a.owner_id=p_owner))) order by r.id for update of r skip locked loop
  locked:=locked+1;if locked_root.owner_id<>p_owner then raise exception 'OWNED_LEGACY_AI_USAGE_SCOPE' using errcode='23514';end if;
 end loop;
 if locked<>expected then raise exception 'OWNED_LEGACY_AI_USAGE_BUSY' using errcode='55P03';end if;
 select count(*) into expected from public.resume_versions v where exists(select 1 from public.resumes r where r.id=v.resume_id
  and ((p_resume is not null and r.id=p_resume) or (p_resume is null and (r.owner_id=p_owner or exists(select 1 from public.analyses a where a.resume_version_id=v.id and a.owner_id=p_owner)))));
 locked:=0;
 for locked_version in select v.* from public.resume_versions v where exists(select 1 from public.resumes r where r.id=v.resume_id
  and ((p_resume is not null and r.id=p_resume) or (p_resume is null and (r.owner_id=p_owner or exists(select 1 from public.analyses a where a.resume_version_id=v.id and a.owner_id=p_owner))))) order by v.id for update of v skip locked loop
  locked:=locked+1;select * into strict locked_root from public.resumes where id=locked_version.resume_id;
  if (locked_version.owner_id,locked_version.organization_id) is distinct from (p_owner,locked_root.organization_id) or locked_version.storage_key is distinct from private.r17_storage_key(locked_root.organization_id,locked_root.id,locked_version.id)
   then raise exception 'OWNED_LEGACY_AI_USAGE_SCOPE' using errcode='23514';end if;
 end loop;
 if locked<>expected then raise exception 'OWNED_LEGACY_AI_USAGE_BUSY' using errcode='55P03';end if;
 select count(*) into expected from private.owned_legacy_ai_usage_analysis_scope(p_owner,p_resume);locked:=0;
 for locked_analysis in select a.* from public.analyses a where a.id in(select * from private.owned_legacy_ai_usage_analysis_scope(p_owner,p_resume)) order by a.id for update of a skip locked loop
  locked:=locked+1;select * into locked_version from public.resume_versions where id=locked_analysis.resume_version_id;
  if not found or (locked_analysis.owner_id,locked_analysis.organization_id) is distinct from (p_owner,locked_version.organization_id) or locked_version.owner_id<>p_owner then raise exception 'OWNED_LEGACY_AI_USAGE_SCOPE' using errcode='23514';end if;
 end loop;
 if locked<>expected then raise exception 'OWNED_LEGACY_AI_USAGE_BUSY' using errcode='55P03';end if;
 select count(*) into expected from public.analysis_ai_runs r where r.analysis_id in(select * from private.owned_legacy_ai_usage_analysis_scope(p_owner,p_resume));locked:=0;
 for x in select r.*,a.owner_id analysis_owner,a.organization_id analysis_org,a.resume_version_id version_id,v.owner_id version_owner,v.organization_id version_org,
   v.resume_id root_id,root.owner_id root_owner,root.organization_id root_org,root.status root_status
  from public.analysis_ai_runs r join public.analyses a on a.id=r.analysis_id join public.resume_versions v on v.id=a.resume_version_id join public.resumes root on root.id=v.resume_id
  where r.analysis_id in(select * from private.owned_legacy_ai_usage_analysis_scope(p_owner,p_resume)) order by r.id for update of r skip locked loop
  locked:=locked+1;
  if (x.owner_id,x.analysis_owner,x.version_owner,x.root_owner) is distinct from (p_owner,p_owner,p_owner,p_owner)
    or (x.organization_id,x.analysis_org,x.version_org) is distinct from (x.root_org,x.root_org,x.root_org)
    or not isfinite(x.created_at) or x.input_tokens is null or x.output_tokens is null or x.input_tokens not between 0 and 2147483647 or x.output_tokens not between 0 and 2147483647
    then raise exception 'OWNED_LEGACY_AI_USAGE_SCOPE' using errcode='23514';end if;
  kind:=private.owned_legacy_ai_usage_class(x.organization_id,x.id);
  select t.id,t.created_at into root_clock from private.retention_items t where t.owner_id=p_owner and t.resume_id=x.root_id order by t.created_at,t.id limit 1;
  if x.root_status='deleted' and root_clock.id is null then raise exception 'OWNED_LEGACY_AI_USAGE_CLOCK_REPAIR' using errcode='23514';end if;
  if root_clock.id is not null and not isfinite(root_clock.created_at) then raise exception 'OWNED_LEGACY_AI_USAGE_CLOCK_REPAIR' using errcode='23514';end if;
  first_at:=account_row.prepared_at;cause:='account_preparation';cause_request:=account_row.first_request_id;cause_item:=null;
  if root_clock.id is not null and (first_at is null or root_clock.created_at<first_at) then first_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;end if;
  if first_at is null or not isfinite(first_at) then raise exception 'OWNED_LEGACY_AI_USAGE_CLOCK_REPAIR' using errcode='23514';end if;
  -- Run creation may legitimately be later than first preparation. Never restart it.
  select * into prior from private.owned_legacy_ai_usage_retirements where run_id=x.id for update skip locked;
  if found then
   if (prior.owner_id,prior.organization_id,prior.analysis_id,prior.resume_id,prior.resume_version_id,prior.run_created_at,prior.original_month,prior.input_tokens,prior.output_tokens,
      prior.classification,prior.first_cause,prior.deletion_request_id,prior.retention_item_id,prior.prepared_at,prior.expires_at)
    is distinct from (p_owner,x.organization_id,x.analysis_id,x.root_id,x.version_id,x.created_at,date_trunc('month',x.created_at at time zone 'UTC')::date,x.input_tokens::numeric,x.output_tokens::numeric,
      kind,cause,cause_request,cause_item,first_at,first_at+interval '720 hours') then raise exception 'OWNED_LEGACY_AI_USAGE_CONFLICT' using errcode='23514';end if;
  else
   if exists(select 1 from private.owned_legacy_ai_usage_retirements where run_id=x.id) then raise exception 'OWNED_LEGACY_AI_USAGE_BUSY' using errcode='55P03';end if;
   insert into private.owned_legacy_ai_usage_retirements values(x.id,p_owner,x.organization_id,x.analysis_id,x.root_id,x.version_id,x.created_at,
     date_trunc('month',x.created_at at time zone 'UTC')::date,x.input_tokens::numeric,x.output_tokens::numeric,kind,cause,cause_request,cause_item,first_at,first_at+interval '720 hours');
  end if;
 end loop;
 if locked<>expected then raise exception 'OWNED_LEGACY_AI_USAGE_BUSY' using errcode='55P03';end if;
end;
$legacy_capture$;
create function private.read_preserved_organization_ai_tokens(p_org uuid,p_since timestamptz) returns bigint
language plpgsql stable set search_path='' as $legacy_reader$
declare total numeric;
begin
 if p_org is null or p_since is null or not isfinite(p_since) or private.owned_legacy_ai_usage_ready() is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 perform private.assert_owned_legacy_ai_usage(p_org);
 if exists(select 1 from public.analysis_ai_runs r where r.organization_id=p_org and r.created_at>=p_since
   and (not isfinite(r.created_at) or r.input_tokens is null or r.output_tokens is null or r.input_tokens<0 or r.output_tokens<0))
  or exists(select 1 from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id
    where t.organization_id=p_org and t.run_created_at>=p_since and least(t.expires_at,a.expires_at)<=clock_timestamp())
  then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 select coalesce(sum(amount),0) into total from (
  select r.input_tokens::numeric+r.output_tokens::numeric amount from public.analysis_ai_runs r where r.organization_id=p_org and r.created_at>=p_since
  union all select t.input_tokens::numeric+t.output_tokens::numeric from private.owned_legacy_ai_usage_retirements t where t.organization_id=p_org and t.run_created_at>=p_since
   and not exists(select 1 from public.analysis_ai_runs r where r.id=t.run_id)) amounts;
 if total<0 or total<>trunc(total) or total>9223372036854775807 then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 return total::bigint;
end;
$legacy_reader$;
create function public.export_owned_legacy_ai_usage_records(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $legacy_export$
declare retired_row private.owned_legacy_ai_usage_retirements%rowtype;item jsonb;answer jsonb;rows jsonb:='[]'::jsonb;n integer:=0;bytes bigint:=1024;account_expiry timestamptz;
begin
 if p_user_id is null or private.owned_legacy_ai_usage_ready() is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 perform 1 from auth.users where id=p_user_id;if not found then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 if exists(select 1 from private.owned_legacy_ai_usage_retirements t join public.analysis_ai_runs r on r.id=t.run_id
    where (t.owner_id=p_user_id or r.owner_id=p_user_id) and private.owned_legacy_ai_usage_row_valid(t) is not true)
  then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 for retired_row in select * from private.owned_legacy_ai_usage_retirements where owner_id=p_user_id order by run_id limit 4097 loop
  n:=n+1;if n>4096 or private.owned_legacy_ai_usage_row_valid(retired_row) is not true then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
  select expires_at into account_expiry from private.owned_ai_deletion_dispositions where owner_id=p_user_id;
  item:=jsonb_build_object('runId',retired_row.run_id,'ownerId',retired_row.owner_id,'organizationId',retired_row.organization_id,'analysisId',retired_row.analysis_id,'resumeId',retired_row.resume_id,'resumeVersionId',retired_row.resume_version_id,
   'runCreatedAt',private.ifo_stamp(retired_row.run_created_at),'originalMonth',to_char(retired_row.original_month,'YYYY-MM-DD'),'inputTokens',trunc(retired_row.input_tokens)::text,'outputTokens',trunc(retired_row.output_tokens)::text,
   'classification',retired_row.classification,'firstCause',retired_row.first_cause,'deletionRequestId',retired_row.deletion_request_id,'retentionItemId',retired_row.retention_item_id,
   'preparedAt',private.ifo_stamp(retired_row.prepared_at),'expiresAt',private.ifo_stamp(retired_row.expires_at),'effectiveExpiresAt',private.ifo_stamp(least(retired_row.expires_at,account_expiry)));
  bytes:=bytes+octet_length(convert_to(item::text,'UTF8'))+1;if bytes>33554432 then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
  rows:=rows||jsonb_build_array(item);
 end loop;
 answer:=jsonb_build_object('schemaVersion','owned-legacy-ai-usage-export/1.0.0','ownerId',p_user_id,'records',rows);
 if octet_length(convert_to(answer::text,'UTF8'))>33554432 then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;
 return answer;
end;
$legacy_export$;
