-- ADR0020 atomic accounting expiry. SOURCE ONLY; SQL UNPARSED/UNEXECUTED.
-- Destructive and data access remain denied; no external adoption is asserted.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

-- The sole retained accounting key is an original UTC month. No personal receipt.
create table private.owned_ai_expiry_months(
 month date primary key check(isfinite(month) and month=date_trunc('month',month)::date),
 shared_known_tokens numeric not null check(private.ai_budget_integer(shared_known_tokens)),
 shared_unknown_claims numeric not null check(private.ai_budget_integer(shared_unknown_claims)),
 technical_spent_tokens numeric not null check(private.ai_budget_integer(technical_spent_tokens)),
 technical_spent_cost_microusd numeric not null check(private.ai_budget_integer(technical_spent_cost_microusd)),
 technical_reserved_tokens numeric not null check(private.ai_budget_integer(technical_reserved_tokens)),
 technical_reserved_cost_microusd numeric not null check(private.ai_budget_integer(technical_reserved_cost_microusd)),
 technical_unknown_claims numeric not null check(private.ai_budget_integer(technical_unknown_claims)),
 unreconciled_overages numeric not null check(private.ai_budget_integer(unreconciled_overages)),
 unresolved_pool_deficits numeric not null check(private.ai_budget_integer(unresolved_pool_deficits)),
 legacy_erased_runs numeric not null check(private.ai_budget_integer(legacy_erased_runs))
);
-- Transient relational authority must be empty at commit, including failed/retried work.
create table private.owned_ai_expiry_work(
 transaction_id bigint not null,owner_id uuid not null,kind text not null check(kind in ('account','r03','a12','a13','legacy')),
 identity jsonb not null check(jsonb_typeof(identity)='object' and octet_length(identity::text)<=1024),
 expires_at timestamptz not null check(isfinite(expires_at)),
 primary key(transaction_id,owner_id,kind,identity)
);
alter table private.owned_ai_expiry_months enable row level security;
alter table private.owned_ai_expiry_work enable row level security;
revoke all on private.owned_ai_expiry_months,private.owned_ai_expiry_work from public,anon,authenticated,service_role;

create function private.owned_ai_expiry_global_blocked(p_month date) returns boolean
language sql stable set search_path='' as $expiry_global$
 select exists(select 1 from private.owned_ai_expiry_months m where
  m.shared_unknown_claims>0 or m.technical_reserved_tokens>0 or m.technical_reserved_cost_microusd>0
  or m.technical_unknown_claims>0 or m.unreconciled_overages>0 or m.unresolved_pool_deficits>0
  or (m.month=p_month and (m.shared_known_tokens>0 or m.technical_spent_tokens>0 or m.technical_spent_cost_microusd>0)));
$expiry_global$;

create function private.owned_ai_expiry_due(p_owner uuid,p_kind text,p_analysis uuid,p_operation uuid) returns boolean
language sql volatile set search_path='' as $expiry_due$
 select exists(select 1 from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id
  where d.owner_id=p_owner and d.kind=p_kind and d.operation_id=p_operation and d.analysis_id is not distinct from p_analysis
   and (d.phase='repair_required' or least(d.expires_at,a.expires_at)<=clock_timestamp()))
  or exists(select 1 from private.owned_ai_deletion_dispositions a where a.owner_id=p_owner and a.expires_at<=clock_timestamp());
$expiry_due$;

create function private.owned_ai_expiry_selected(p_kind text,p_owner uuid,p_analysis uuid,p_operation uuid,p_run uuid) returns boolean
language sql volatile set search_path='' as $expiry_selected$
 select exists(select 1 from private.owned_ai_expiry_work w where w.transaction_id=txid_current() and w.owner_id=p_owner and w.kind=p_kind
  and (p_kind='r03' or nullif(w.identity->>'analysisId','')::uuid is not distinct from p_analysis)
  and nullif(w.identity->>'operationId','')::uuid is not distinct from p_operation
  and nullif(w.identity->>'runId','')::uuid is not distinct from p_run and w.expires_at<=clock_timestamp());
$expiry_selected$;

create function private.owned_ai_expiry_work_closed() returns trigger
language plpgsql volatile set search_path='' as $expiry_work_closed$
begin
 if exists(select 1 from private.owned_ai_expiry_work where transaction_id=new.transaction_id)
  then raise exception 'OWNED_AI_EXPIRY_WORK_UNCLOSED' using errcode='23514';end if;
 return null;
end;
$expiry_work_closed$;
create constraint trigger owned_ai_expiry_work_closed after insert or update on private.owned_ai_expiry_work
 deferrable initially deferred for each row execute function private.owned_ai_expiry_work_closed();

-- Immutable approval is installed only by a separately reviewed future migration.
-- No verifier implementation, capability row, external proof or data grant is seeded here.
create table private.owned_ai_expiry_adoption_capability(
 signature text primary key check(signature='private.verify_owned_ai_expiry_adoption(uuid,jsonb)'),
 trusted_owner oid not null,body_sha256 text not null check(body_sha256 collate "C" ~ '^[a-f0-9]{64}$')
);
alter table private.owned_ai_expiry_adoption_capability enable row level security;
revoke all on private.owned_ai_expiry_adoption_capability from public,anon,authenticated,service_role;
create function private.owned_ai_expiry_capability_closed() returns trigger
language plpgsql volatile set search_path='' as $expiry_capability_closed$
begin raise exception 'OWNED_AI_EXPIRY_CAPABILITY_CLOSED' using errcode='23514';end;
$expiry_capability_closed$;
create trigger owned_ai_expiry_capability_closed before insert or update or delete on private.owned_ai_expiry_adoption_capability
 for each row execute function private.owned_ai_expiry_capability_closed();

create function private.owned_ai_expiry_adoption_ready() returns boolean
language plpgsql stable set search_path='' as $expiry_adoption_ready$
declare p pg_catalog.pg_proc%rowtype;c private.owned_ai_expiry_adoption_capability%rowtype;owner_oid oid;role_name text;
begin
 select * into c from private.owned_ai_expiry_adoption_capability where signature='private.verify_owned_ai_expiry_adoption(uuid,jsonb)';
 if not found then return false;end if;
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure(c.signature);
 if not found or owner_oid is null or p.proowner<>owner_oid or c.trusted_owner<>owner_oid or p.prokind<>'f' or p.prosecdef or p.proretset or p.proisstrict
  or p.provolatile<>'v' or p.prorettype<>'jsonb'::regtype or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
  or p.proconfig is distinct from array['search_path=""'] or private.ifo_sha(p.prosrc)<>c.body_sha256
  or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
 return true;
exception when others then return false;
end;
$expiry_adoption_ready$;

create function private.owned_ai_expiry_require_adoption(p_owner uuid) returns void
language plpgsql volatile set search_path='' as $expiry_require_adoption$
declare scope jsonb;witness jsonb;minimum_at timestamptz;selected jsonb;count_rows bigint;
begin
 if private.owned_ai_expiry_adoption_ready() is not true then raise exception 'OWNED_AI_EXPIRY_ADOPTION_UNAVAILABLE' using errcode='P0E01';end if;
 select min(expires_at),count(*),jsonb_agg(jsonb_build_object('kind',kind,'identity',identity,'expiresAt',private.ifo_stamp(expires_at)) order by kind,identity::text)
  into minimum_at,count_rows,selected from private.owned_ai_expiry_work where transaction_id=txid_current() and owner_id=p_owner;
 if count_rows=0 or minimum_at is null or not isfinite(minimum_at) or minimum_at>clock_timestamp()
  or exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current() and owner_id<>p_owner)
  then raise exception 'OWNED_AI_EXPIRY_AUTHORITY' using errcode='23514';end if;
 scope:=jsonb_build_object('schemaVersion','owned-ai-expiry-scope/1.0.0','ownerId',p_owner,'minimumExpiresAt',private.ifo_stamp(minimum_at),'selected',selected);
 -- Exact fixed identifier, never a caller-provided function/Boolean/GUC. The pinned actual verifier is absent in this leaf.
 execute 'select private.verify_owned_ai_expiry_adoption($1,$2)' into witness using p_owner,scope;
 if witness is distinct from jsonb_build_object('schemaVersion','owned-ai-expiry-adoption/1.0.0','ownerId',p_owner,'scope',scope)
  then raise exception 'OWNED_AI_EXPIRY_ADOPTION_UNAVAILABLE' using errcode='P0E01';end if;
end;
$expiry_require_adoption$;

create function private.owned_ai_expiry_delete_allowed(p_table text,p_row jsonb) returns boolean
language plpgsql volatile set search_path='' as $expiry_delete_allowed$
declare operation uuid;owner uuid;analysis uuid;run_id uuid;ok boolean:=false;
begin
 if p_table in ('ai_budget_operations','ai_budget_operation_sources') then
  operation:=coalesce(p_row->>'operation_id',p_row->>'id')::uuid;owner:=coalesce(p_row->>'owner_id',p_row->>'user_id')::uuid;
  ok:=private.owned_ai_expiry_selected('r03',owner,null,operation,null);
 elsif p_table='ai_budget_events' then
  select o.user_id,o.id into owner,operation from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where a.id=(p_row->>'attempt_id')::uuid;
  ok:=private.owned_ai_expiry_selected('r03',owner,null,operation,null);
 elsif p_table='ai_budget_period_openings' then return false;
 elsif p_table in ('initial_feedback_operations','initial_feedback_content_retirements') then
  owner:=(p_row->>'owner_id')::uuid;analysis:=(p_row->>'analysis_id')::uuid;operation:=(p_row->>'operation_id')::uuid;
  ok:=private.owned_ai_expiry_selected('a13',owner,analysis,operation,null);
 elsif p_table='initial_feedback_attempts' then
  select owner_id,analysis_id,operation_id into owner,analysis,operation from private.initial_feedback_operations where operation_id=(p_row->>'operation_id')::uuid;
  ok:=private.owned_ai_expiry_selected('a13',owner,analysis,operation,null);
 elsif p_table='owned_legacy_ai_usage_retirements' then
  owner:=(p_row->>'owner_id')::uuid;analysis:=(p_row->>'analysis_id')::uuid;run_id:=(p_row->>'run_id')::uuid;
  ok:=private.owned_ai_expiry_selected('legacy',owner,analysis,null,run_id);
 elsif p_table='owned_ai_operation_dispositions' then
  owner:=(p_row->>'owner_id')::uuid;analysis:=(p_row->>'analysis_id')::uuid;operation:=(p_row->>'operation_id')::uuid;
  ok:=private.owned_ai_expiry_selected(p_row->>'kind',owner,analysis,operation,null);
 elsif p_table='owned_ai_deletion_dispositions' then
  owner:=(p_row->>'owner_id')::uuid;ok:=private.owned_ai_expiry_selected('account',owner,null,null,null);
 end if;
 if ok is not true or private.owned_ai_expiry_adoption_ready() is not true then return false;end if;
 return true;
end;
$expiry_delete_allowed$;

create function private.owned_ai_expiry_rebuild_pools(p_owner uuid) returns void
language plpgsql volatile set search_path='' as $expiry_rebuild_pools$
declare pool private.ai_budget_pools%rowtype;opening private.ai_budget_period_openings%rowtype;totals record;remaining record;
begin
 if private.owned_ai_expiry_adoption_ready() is not true then raise exception 'OWNED_AI_EXPIRY_ADOPTION_UNAVAILABLE' using errcode='P0E01';end if;
 for pool in select p.* from private.ai_budget_pools p where exists(select 1 from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id
   where (a.organization_id,a.period)=(p.organization_id,p.period) and private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null))
  order by p.organization_id,p.period for update nowait loop
  select * into strict opening from private.ai_budget_period_openings where (organization_id,period)=(pool.organization_id,pool.period) for key share nowait;
  -- Approved external authority must prove opening evidence no longer reconnects the erased subject. Never invent an evidence hash.
  select coalesce(sum(case when a.state='settled' then a.actual_input_tokens+a.actual_output_tokens else 0 end),0) spent,
   coalesce(sum(case when a.state='settled' then a.actual_cost_microusd else 0 end),0) cost,
   coalesce(sum(case when a.state in ('reserved','dispatched','held_unknown') then o.reserved_input_tokens+o.reserved_output_tokens else 0 end),0) reserved_tokens,
   coalesce(sum(case when a.state in ('reserved','dispatched','held_unknown') then a.reserved_cost_microusd else 0 end),0) reserved_cost
   into totals from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where (a.organization_id,a.period)=(pool.organization_id,pool.period);
  if (pool.spent_tokens,pool.spent_cost_microusd,pool.reserved_tokens,pool.reserved_cost_microusd)
   is distinct from (opening.opening_spent_tokens+totals.spent,opening.opening_spent_cost_microusd+totals.cost,totals.reserved_tokens,totals.reserved_cost)
   then raise exception 'OWNED_AI_EXPIRY_POOL_PROVENANCE' using errcode='23514';end if;
  select coalesce(sum(case when a.state='settled' then a.actual_input_tokens+a.actual_output_tokens else 0 end),0) spent,
   coalesce(sum(case when a.state='settled' then a.actual_cost_microusd else 0 end),0) cost,
   coalesce(sum(case when a.state in ('reserved','dispatched','held_unknown') then o.reserved_input_tokens+o.reserved_output_tokens else 0 end),0) reserved_tokens,
   coalesce(sum(case when a.state in ('reserved','dispatched','held_unknown') then a.reserved_cost_microusd else 0 end),0) reserved_cost
   into remaining from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id
   where (a.organization_id,a.period)=(pool.organization_id,pool.period) and not private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null);
  -- Preserve exactly the transition which would clear an existing all-period pool fence.
  -- While the remaining pool stays over limit, it retains its own fence and no aggregate deficit is duplicated.
  if (pool.spent_tokens+pool.reserved_tokens>pool.token_limit or pool.spent_cost_microusd+pool.reserved_cost_microusd>pool.cost_limit_microusd)
   and not (opening.opening_spent_tokens+remaining.spent+remaining.reserved_tokens>pool.token_limit
    or opening.opening_spent_cost_microusd+remaining.cost+remaining.reserved_cost>pool.cost_limit_microusd) then
   insert into private.owned_ai_expiry_months values(pool.period,0,0,0,0,0,0,0,0,1,0)
    on conflict(month) do update set unresolved_pool_deficits=owned_ai_expiry_months.unresolved_pool_deficits+1;
  end if;
  update private.ai_budget_pools set spent_tokens=opening.opening_spent_tokens+remaining.spent,spent_cost_microusd=opening.opening_spent_cost_microusd+remaining.cost,
   reserved_tokens=remaining.reserved_tokens,reserved_cost_microusd=remaining.reserved_cost
   where (organization_id,period)=(pool.organization_id,pool.period);
 end loop;
end;
$expiry_rebuild_pools$;

create function public.sweep_owned_ai_expiry(p_limit integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $expiry_sweep$
declare owner uuid;answer jsonb;selected integer:=0;folded integer:=0;blocked integer:=0;breached boolean;selected_deadline timestamptz;now_value timestamptz:=clock_timestamp();
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'OWNED_AI_EXPIRY_INVALID' using errcode='22023';end if;
 if private.owned_ai_expiry_ready() is not true then raise exception 'OWNED_AI_EXPIRY_UNAVAILABLE' using errcode='P0E01';end if;
 select exists(select 1 from private.owned_ai_deletion_dispositions where expires_at<now_value)
  or exists(select 1 from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id where d.phase='repair_required' or least(d.expires_at,a.expires_at)<now_value)
  or exists(select 1 from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id where least(t.expires_at,a.expires_at)<now_value) into breached;
 for owner in select owner_id from (
  select owner_id from private.owned_ai_deletion_dispositions where expires_at<=now_value
  union select d.owner_id from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id where d.phase='repair_required' or least(d.expires_at,a.expires_at)<=now_value
  union select t.owner_id from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id where least(t.expires_at,a.expires_at)<=now_value
 ) due order by owner_id limit p_limit loop
  selected:=selected+1;
  select min(deadline) into selected_deadline from (
   select expires_at deadline from private.owned_ai_deletion_dispositions where owner_id=owner
   union all select least(d.expires_at,a.expires_at) from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id where d.owner_id=owner
   union all select least(t.expires_at,a.expires_at) from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id where t.owner_id=owner
  ) selected_clocks;
  begin
   answer:=private.expire_owned_ai_disposition(owner);
   if answer=jsonb_build_object('status','folded') then folded:=folded+1;else blocked:=blocked+1;end if;
  exception when sqlstate 'P0E01' or check_violation or lock_not_available then blocked:=blocked+1;
  end;
  breached:=breached or selected_deadline<clock_timestamp();
 end loop;
 breached:=breached or exists(select 1 from private.owned_ai_deletion_dispositions where expires_at<clock_timestamp())
  or exists(select 1 from private.owned_ai_operation_dispositions d left join private.owned_ai_deletion_dispositions a on a.owner_id=d.owner_id where d.phase='repair_required' or least(d.expires_at,a.expires_at)<clock_timestamp())
  or exists(select 1 from private.owned_legacy_ai_usage_retirements t left join private.owned_ai_deletion_dispositions a on a.owner_id=t.owner_id where least(t.expires_at,a.expires_at)<clock_timestamp());
 return jsonb_build_object('schemaVersion','owned-ai-expiry-sweep/1.0.0','selectedCount',selected,'foldedCount',folded,'blockedCount',blocked,'deadlineBreached',breached);
end;
$expiry_sweep$;

create function private.expire_owned_ai_disposition(p_owner_id uuid) returns jsonb
language plpgsql volatile set search_path='' as $expiry_core$
declare account_row private.owned_ai_deletion_dispositions%rowtype;selected_disposition private.owned_ai_operation_dispositions%rowtype;
 retired_run private.owned_legacy_ai_usage_retirements%rowtype;budget_operation private.ai_budget_operations%rowtype;
 rewrite_operation private.canonical_rewrite_operations%rowtype;
 feedback_operation private.initial_feedback_operations%rowtype;
 organization uuid;month_row record;effective_at timestamptz;selected_count integer:=0;actual_count integer;expected_count integer;
 now_value timestamptz:=clock_timestamp();shared numeric;unknown_count numeric;overage numeric;
begin
 if p_owner_id is null then raise exception 'OWNED_AI_EXPIRY_INVALID' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' or not private.try_lock_candidate_owners(array[p_owner_id])
  then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 if not pg_try_advisory_xact_lock(('x'||substr(private.ifo_sha('resumide:owned-ai-expiry-global:v1'),1,16))::bit(64)::bigint) then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 if exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current()) then raise exception 'OWNED_AI_EXPIRY_REENTRY' using errcode='23514';end if;
 select * into account_row from private.owned_ai_deletion_dispositions where owner_id=p_owner_id for update nowait;
 if not found and exists(select 1 from private.owned_ai_deletion_dispositions where owner_id=p_owner_id)
  then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 if account_row.owner_id is not null and account_row.expires_at<=now_value then
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,'account',jsonb_build_object('analysisId',null,'operationId',null,'runId',null),account_row.expires_at);
 end if;
 -- Capture every selected actual identity. Historical repair never manufactures a clock.
 for selected_disposition in select x.* from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and (x.phase='repair_required' or least(x.expires_at,account_row.expires_at)<=now_value)
  order by x.kind,x.analysis_id,x.operation_id for update nowait loop
  if selected_disposition.phase<>'prepared' or selected_disposition.prepared_at is null or selected_disposition.expires_at is distinct from selected_disposition.prepared_at+interval '720 hours'
   then raise exception 'OWNED_AI_EXPIRY_CLOCK_REPAIR' using errcode='23514';end if;
  effective_at:=least(selected_disposition.expires_at,account_row.expires_at);
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,selected_disposition.kind,
   jsonb_build_object('analysisId',selected_disposition.analysis_id,'operationId',selected_disposition.operation_id,'runId',null),effective_at);
  selected_count:=selected_count+1;
 end loop;
 select count(*) into expected_count from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and (x.phase='repair_required' or least(x.expires_at,account_row.expires_at)<=now_value);
 if expected_count<>selected_count then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 for retired_run in select x.* from private.owned_legacy_ai_usage_retirements x where x.owner_id=p_owner_id
  and least(x.expires_at,account_row.expires_at)<=now_value order by x.run_id for update nowait loop
  if private.owned_legacy_ai_usage_row_valid(retired_run) is not true then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,'legacy',jsonb_build_object('analysisId',retired_run.analysis_id,'operationId',null,'runId',retired_run.run_id),least(retired_run.expires_at,account_row.expires_at));
 end loop;
 if not exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current()) then return jsonb_build_object('status','not_pending');end if;
 -- External paired authority is required here; it is never a client Boolean or renewed consent.
 perform private.owned_ai_expiry_require_adoption(p_owner_id);
 -- Organization row locks serialize private R03 accounting before attempts/pools. No waiting on reverse locks.
 for organization in select distinct x.organization_id from private.owned_ai_operation_dispositions x
  where x.owner_id=p_owner_id and private.owned_ai_expiry_selected(x.kind,x.owner_id,x.analysis_id,x.operation_id,null)
  union select x.organization_id from private.owned_legacy_ai_usage_retirements x
   where x.owner_id=p_owner_id and private.owned_ai_expiry_selected('legacy',x.owner_id,x.analysis_id,null,x.run_id)
  order by 1 loop
  perform 1 from public.organizations where id=organization for update nowait;
  if not found then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
  perform private.assert_owned_legacy_ai_usage(organization);
 end loop;
 -- Never erase foreign actor receipts or infer opening-evidence anonymity.
 if exists(select 1 from private.ai_budget_events e join private.ai_budget_attempts a on a.id=e.attempt_id
  join private.ai_budget_operations o on o.id=a.operation_id where
   (e.operator_id=p_owner_id and o.user_id<>p_owner_id and exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current() and kind='account'))
   )
  then raise exception 'OWNED_AI_EXPIRY_FOREIGN_ACTOR_AUTHORITY' using errcode='23514';end if;
 -- Exact owned operation locks and paired closures; no current membership or content parent is required.
 for budget_operation in select x.* from private.ai_budget_operations x where x.user_id=p_owner_id
  and private.owned_ai_expiry_selected('r03',x.user_id,null,x.id,null) order by x.id for update nowait loop
  if exists(select 1 from private.ai_budget_attempts x where x.operation_id=budget_operation.id and x.organization_id<>budget_operation.organization_id)
   then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  perform 1 from private.ai_budget_attempts where operation_id=budget_operation.id order by ordinal for update nowait;
  perform 1 from private.ai_budget_events where attempt_id in(select id from private.ai_budget_attempts where operation_id=budget_operation.id) order by id for update nowait;
 end loop;
 for rewrite_operation in select x.* from private.canonical_rewrite_operations x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected('a12',x.owner_id,x.analysis_id,x.operation_id,null) order by x.analysis_id,x.operation_id for update nowait loop
  if rewrite_operation.claimed_at is not null and not isfinite(rewrite_operation.claimed_at) then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  if exists(select 1 from private.ai_budget_operation_sources s where s.kind='canonical_rewrite' and s.owner_id=rewrite_operation.owner_id and s.analysis_id=rewrite_operation.analysis_id
   and s.request_nonce=rewrite_operation.operation_id::text and not private.owned_ai_expiry_selected('r03',rewrite_operation.owner_id,null,s.operation_id,null))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
  if exists(select 1 from public.analysis_ai_runs x where x.id=rewrite_operation.run_id) and not private.owned_ai_expiry_selected('legacy',rewrite_operation.owner_id,rewrite_operation.analysis_id,null,rewrite_operation.run_id)
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
 end loop;
 for feedback_operation in select x.* from private.initial_feedback_operations x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected('a13',x.owner_id,x.analysis_id,x.operation_id,null) order by x.operation_id for update nowait loop
  if exists(select 1 from private.ai_budget_operations x where x.id=feedback_operation.operation_id and not private.owned_ai_expiry_selected('r03',feedback_operation.owner_id,null,x.id,null))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
  if exists(select 1 from private.initial_feedback_publications x where x.operation_id=feedback_operation.operation_id)
   then raise exception 'OWNED_AI_EXPIRY_CONTENT_NOT_RETIRED' using errcode='23514';end if;
  perform 1 from private.initial_feedback_attempts where operation_id=feedback_operation.operation_id order by ordinal for update nowait;
 end loop;
 -- Fail on missing/skipped operation locks before totals or deletes.
 for selected_disposition in select * from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected(x.kind,x.owner_id,x.analysis_id,x.operation_id,null) loop
  if (selected_disposition.kind='r03' and not exists(select 1 from private.ai_budget_operations x where (x.id,x.user_id,x.organization_id)=(selected_disposition.operation_id,selected_disposition.owner_id,selected_disposition.organization_id)))
   or (selected_disposition.kind='a12' and not exists(select 1 from private.canonical_rewrite_operations x where (x.operation_id,x.owner_id,x.analysis_id,x.organization_id,x.source_id)=(selected_disposition.operation_id,selected_disposition.owner_id,selected_disposition.analysis_id,selected_disposition.organization_id,selected_disposition.resume_version_id)))
   or (selected_disposition.kind='a13' and not exists(select 1 from private.initial_feedback_operations x where (x.operation_id,x.owner_id,x.analysis_id,x.organization_id,x.resume_id,x.resume_version_id)=(selected_disposition.operation_id,selected_disposition.owner_id,selected_disposition.analysis_id,selected_disposition.organization_id,selected_disposition.resume_id,selected_disposition.resume_version_id)))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
 end loop;
 perform 1 from private.ai_budget_operation_sources s where private.owned_ai_expiry_selected('r03',s.owner_id,null,s.operation_id,null) order by s.operation_id for update nowait;
 perform 1 from private.owned_legacy_ai_usage_retirements t where private.owned_ai_expiry_selected('legacy',t.owner_id,t.analysis_id,null,t.run_id) order by t.run_id for update nowait;
 perform 1 from public.analysis_ai_runs r where private.owned_ai_expiry_selected('legacy',r.owner_id,r.analysis_id,null,r.id) order by r.id for update nowait;
 if exists(select 1 from private.ai_budget_operation_sources s where private.owned_ai_expiry_selected('r03',s.owner_id,null,s.operation_id,null)
  and ((s.kind='canonical_rewrite' and not private.owned_ai_expiry_selected('a12',s.owner_id,s.analysis_id,s.request_nonce::uuid,null))
   or (s.kind='initial_feedback' and not private.owned_ai_expiry_selected('a13',s.owner_id,s.analysis_id,s.operation_id,null))))
  or exists(select 1 from public.analysis_ai_runs r join private.owned_ai_operation_dispositions d on d.analysis_id=r.analysis_id
   where private.owned_ai_expiry_selected(d.kind,d.owner_id,d.analysis_id,d.operation_id,null)
    and not private.owned_ai_expiry_selected('legacy',r.owner_id,r.analysis_id,null,r.id))
  or exists(select 1 from private.owned_legacy_ai_usage_retirements t where private.owned_ai_expiry_selected('legacy',t.owner_id,t.analysis_id,null,t.run_id)
   and ((t.classification='a12_linked' and not exists(select 1 from private.canonical_rewrite_operations c where c.run_id=t.run_id
     and private.owned_ai_expiry_selected('a12',c.owner_id,c.analysis_id,c.operation_id,null)))
    or (t.classification='a13_linked' and not exists(select 1 from private.initial_feedback_content_retirements s where s.run_id=t.run_id
      and private.owned_ai_expiry_selected('a13',s.owner_id,s.analysis_id,s.operation_id,null)))))
  then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
 -- Fold contributions once. Linked raw/run copies contribute through the typed authority only.
 for month_row in
  with shared_usage as (
   select t.original_month month,t.input_tokens::numeric+t.output_tokens::numeric tokens,0::numeric unknowns
    from private.owned_legacy_ai_usage_retirements t where t.classification='legacy_unlinked'
     and private.owned_ai_expiry_selected('legacy',t.owner_id,t.analysis_id,null,t.run_id)
   union all select date_trunc('month',x.claimed_at at time zone 'UTC')::date,
    case when x.usage is null then 0 else (x.usage->>'inputTokens')::numeric+(x.usage->>'outputTokens')::numeric end,
    case when x.usage is null then 1 else 0 end
    from private.canonical_rewrite_operations x where x.claimed_at is not null and private.owned_ai_expiry_selected('a12',x.owner_id,x.analysis_id,x.operation_id,null)
   union all select date_trunc('month',a.claimed_at at time zone 'UTC')::date,
    case when a.usage is null then 0 else (a.usage->>'inputTokens')::numeric+(a.usage->>'outputTokens')::numeric end,
    case when a.usage is null then 1 else 0 end
    from private.initial_feedback_attempts a join private.initial_feedback_operations x on x.operation_id=a.operation_id
    where a.claimed_at is not null and private.owned_ai_expiry_selected('a13',x.owner_id,x.analysis_id,x.operation_id,null)
  ), technical as (
   select a.period month,
    case when a.state='settled' then a.actual_input_tokens+a.actual_output_tokens else 0 end tokens,
    case when a.state='settled' then a.actual_cost_microusd else 0 end cost,
    case when a.state in ('reserved','dispatched','held_unknown') then o.reserved_input_tokens+o.reserved_output_tokens else 0 end reserved_tokens,
    case when a.state in ('reserved','dispatched','held_unknown') then a.reserved_cost_microusd else 0 end reserved_cost,
    case when a.state in ('dispatched','held_unknown') then 1 else 0 end unknowns,
    case when a.state='settled' and (a.actual_input_tokens>o.reserved_input_tokens or a.actual_output_tokens>o.reserved_output_tokens or a.actual_cost_microusd>a.reserved_cost_microusd)
     and not exists(select 1 from private.ai_budget_events e where e.attempt_id=a.id and e.kind='reconcile') then 1 else 0 end overage
   from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id
   where private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null)
  ), erased_runs as (
   select t.original_month month,count(*)::numeric runs from private.owned_legacy_ai_usage_retirements t
    where private.owned_ai_expiry_selected('legacy',t.owner_id,t.analysis_id,null,t.run_id) group by t.original_month
  ), months as(select month from shared_usage union select month from technical union select month from erased_runs)
  select m.month,coalesce((select sum(tokens) from shared_usage where month=m.month),0) shared,
   coalesce((select sum(unknowns) from shared_usage where month=m.month),0) shared_unknown,
   coalesce((select sum(tokens) from technical where month=m.month),0) spent,
   coalesce((select sum(cost) from technical where month=m.month),0) cost,
   coalesce((select sum(reserved_tokens) from technical where month=m.month),0) reserved_tokens,
   coalesce((select sum(reserved_cost) from technical where month=m.month),0) reserved_cost,
   coalesce((select sum(unknowns) from technical where month=m.month),0) technical_unknown,
   coalesce((select sum(overage) from technical where month=m.month),0) overage,
   coalesce((select sum(runs) from erased_runs where month=m.month),0) erased_runs
  from months m order by m.month loop
  insert into private.owned_ai_expiry_months values(month_row.month,month_row.shared,month_row.shared_unknown,month_row.spent,month_row.cost,
   month_row.reserved_tokens,month_row.reserved_cost,month_row.technical_unknown,month_row.overage,0,month_row.erased_runs)
  on conflict(month) do update set shared_known_tokens=owned_ai_expiry_months.shared_known_tokens+excluded.shared_known_tokens,
   shared_unknown_claims=owned_ai_expiry_months.shared_unknown_claims+excluded.shared_unknown_claims,
   technical_spent_tokens=owned_ai_expiry_months.technical_spent_tokens+excluded.technical_spent_tokens,
   technical_spent_cost_microusd=owned_ai_expiry_months.technical_spent_cost_microusd+excluded.technical_spent_cost_microusd,
   technical_reserved_tokens=owned_ai_expiry_months.technical_reserved_tokens+excluded.technical_reserved_tokens,
   technical_reserved_cost_microusd=owned_ai_expiry_months.technical_reserved_cost_microusd+excluded.technical_reserved_cost_microusd,
   technical_unknown_claims=owned_ai_expiry_months.technical_unknown_claims+excluded.technical_unknown_claims,
   unreconciled_overages=owned_ai_expiry_months.unreconciled_overages+excluded.unreconciled_overages,
   legacy_erased_runs=owned_ai_expiry_months.legacy_erased_runs+excluded.legacy_erased_runs;
 end loop;
 -- Pool/opening sanitization requires the paired adoption authority, never a silent refund.
 perform private.owned_ai_expiry_rebuild_pools(p_owner_id);
 delete from private.ai_budget_events e using private.ai_budget_attempts a,private.ai_budget_operations o
  where e.attempt_id=a.id and a.operation_id=o.id and private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null);
 delete from private.ai_budget_attempts a using private.ai_budget_operations o where a.operation_id=o.id and private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null);
 delete from private.ai_budget_operation_sources s where private.owned_ai_expiry_selected('r03',s.owner_id,null,s.operation_id,null);
 delete from private.ai_budget_operations o where private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null);
 delete from private.initial_feedback_content_retirements r where private.owned_ai_expiry_selected('a13',r.owner_id,r.analysis_id,r.operation_id,null);
 delete from private.initial_feedback_attempts a using private.initial_feedback_operations o where a.operation_id=o.operation_id and private.owned_ai_expiry_selected('a13',o.owner_id,o.analysis_id,o.operation_id,null);
 delete from private.initial_feedback_operations o where private.owned_ai_expiry_selected('a13',o.owner_id,o.analysis_id,o.operation_id,null);
 delete from private.canonical_rewrite_operations o where private.owned_ai_expiry_selected('a12',o.owner_id,o.analysis_id,o.operation_id,null);
 delete from public.analysis_ai_runs r where private.owned_ai_expiry_selected('legacy',r.owner_id,r.analysis_id,null,r.id);
 delete from private.owned_legacy_ai_usage_retirements r where private.owned_ai_expiry_selected('legacy',r.owner_id,r.analysis_id,null,r.run_id);
 delete from private.owned_ai_operation_dispositions d where private.owned_ai_expiry_selected(d.kind,d.owner_id,d.analysis_id,d.operation_id,null);
 if exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current() and kind='account') then
  if exists(select 1 from private.ai_budget_operations where user_id=p_owner_id)
   or exists(select 1 from private.canonical_rewrite_operations where owner_id=p_owner_id)
   or exists(select 1 from private.initial_feedback_operations where owner_id=p_owner_id)
   or exists(select 1 from private.owned_ai_operation_dispositions where owner_id=p_owner_id)
   or exists(select 1 from private.owned_legacy_ai_usage_retirements where owner_id=p_owner_id)
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_ACCOUNT' using errcode='23514';end if;
  delete from private.ai_budget_reconciliation_operators where operator_id=p_owner_id;
  delete from private.owned_ai_deletion_dispositions where owner_id=p_owner_id;
 end if;
 delete from private.owned_ai_expiry_work where transaction_id=txid_current();
 return jsonb_build_object('status','folded');
end;
$expiry_core$;

create function private.owned_ai_expiry_work_guard() returns trigger
language plpgsql volatile set search_path='' as $expiry_work_guard$
begin
 if tg_op='UPDATE' or new.transaction_id<>txid_current() or new.expires_at>clock_timestamp()
  then raise exception 'OWNED_AI_EXPIRY_WORK_AUTHORITY' using errcode='23514';end if;
 return new;
end;
$expiry_work_guard$;
create trigger owned_ai_expiry_work_guard before insert or update on private.owned_ai_expiry_work for each row execute function private.owned_ai_expiry_work_guard();

create function private.owned_ai_expiry_read_lock() returns boolean
language sql volatile set search_path='' as $expiry_read_lock$
 select pg_try_advisory_xact_lock_shared(('x'||substr(private.ifo_sha('resumide:owned-ai-expiry-global:v1'),1,16))::bit(64)::bigint);
$expiry_read_lock$;

create function private.owned_ai_expiry_since_blocked(p_since timestamptz) returns boolean
language plpgsql volatile set search_path='' as $expiry_since_blocked$
begin
 -- Separate VOLATILE post-lock SELECT sees holds committed before this lock even when the caller is STABLE.
 if private.owned_ai_expiry_read_lock() is not true then return true;end if;
 if private.owned_ai_expiry_safety_ready() is not true then return true;end if;
 return exists(select 1 from private.owned_ai_expiry_months m where (m.month+interval '1 month')::timestamp at time zone 'UTC'>p_since
  and (m.shared_known_tokens>0 or m.shared_unknown_claims>0 or m.legacy_erased_runs>0));
end;
$expiry_since_blocked$;
