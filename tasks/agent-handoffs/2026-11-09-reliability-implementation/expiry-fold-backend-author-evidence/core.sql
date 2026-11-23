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
 unreconciled_overages numeric not null check(private.ai_budget_integer(unreconciled_overages))
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
  or m.technical_unknown_claims>0 or m.unreconciled_overages>0
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
 if exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current())
  then raise exception 'OWNED_AI_EXPIRY_WORK_UNCLOSED' using errcode='23514';end if;
 return null;
end;
$expiry_work_closed$;
create constraint trigger owned_ai_expiry_work_closed after insert or update on private.owned_ai_expiry_work
 deferrable initially deferred for each row execute function private.owned_ai_expiry_work_closed();

create function private.expire_owned_ai_disposition(p_owner_id uuid) returns jsonb
language plpgsql volatile set search_path='' as $expiry_core$
declare account_row private.owned_ai_deletion_dispositions%rowtype;d private.owned_ai_operation_dispositions%rowtype;
 t private.owned_legacy_ai_usage_retirements%rowtype;o private.ai_budget_operations%rowtype;
 a private.ai_budget_attempts%rowtype;c private.canonical_rewrite_operations%rowtype;
 f private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;
 organization uuid;month_row record;effective_at timestamptz;selected_count integer:=0;actual_count integer;expected_count integer;
 now_value timestamptz:=clock_timestamp();shared numeric;unknown_count numeric;overage numeric;
begin
 if p_owner_id is null then raise exception 'OWNED_AI_EXPIRY_INVALID' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' or not private.try_lock_candidate_owners(array[p_owner_id])
  then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 if exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current()) then raise exception 'OWNED_AI_EXPIRY_REENTRY' using errcode='23514';end if;
 select * into account_row from private.owned_ai_deletion_dispositions where owner_id=p_owner_id for update nowait;
 if not found and exists(select 1 from private.owned_ai_deletion_dispositions where owner_id=p_owner_id)
  then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 if account_row.owner_id is not null and account_row.expires_at<=now_value then
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,'account',jsonb_build_object('analysisId',null,'operationId',null,'runId',null),account_row.expires_at);
 end if;
 -- Capture every selected actual identity. Historical repair never manufactures a clock.
 for d in select x.* from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and (x.phase='repair_required' or least(x.expires_at,account_row.expires_at)<=now_value)
  order by x.kind,x.analysis_id,x.operation_id for update nowait loop
  if d.phase<>'prepared' or d.prepared_at is null or d.expires_at is distinct from d.prepared_at+interval '720 hours'
   then raise exception 'OWNED_AI_EXPIRY_CLOCK_REPAIR' using errcode='23514';end if;
  effective_at:=least(d.expires_at,account_row.expires_at);
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,d.kind,
   jsonb_build_object('analysisId',d.analysis_id,'operationId',d.operation_id,'runId',null),effective_at);
  selected_count:=selected_count+1;
 end loop;
 select count(*) into expected_count from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and (x.phase='repair_required' or least(x.expires_at,account_row.expires_at)<=now_value);
 if expected_count<>selected_count then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 for t in select x.* from private.owned_legacy_ai_usage_retirements x where x.owner_id=p_owner_id
  and least(x.expires_at,account_row.expires_at)<=now_value order by x.run_id for update nowait loop
  if private.owned_legacy_ai_usage_row_valid(t) is not true then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  insert into private.owned_ai_expiry_work values(txid_current(),p_owner_id,'legacy',jsonb_build_object('analysisId',t.analysis_id,'operationId',null,'runId',t.run_id),least(t.expires_at,account_row.expires_at));
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
   or (o.user_id=p_owner_id and private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null) and e.operator_id is not null and e.operator_id<>p_owner_id))
  then raise exception 'OWNED_AI_EXPIRY_FOREIGN_ACTOR_AUTHORITY' using errcode='23514';end if;
 -- Exact owned operation locks and paired closures; no current membership or content parent is required.
 for o in select x.* from private.ai_budget_operations x where x.user_id=p_owner_id
  and private.owned_ai_expiry_selected('r03',x.user_id,null,x.id,null) order by x.id for update nowait loop
  if exists(select 1 from private.ai_budget_attempts x where x.operation_id=o.id and x.organization_id<>o.organization_id)
   then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  perform 1 from private.ai_budget_attempts where operation_id=o.id order by ordinal for update nowait;
  perform 1 from private.ai_budget_events where attempt_id in(select id from private.ai_budget_attempts where operation_id=o.id) order by id for update nowait;
 end loop;
 for c in select x.* from private.canonical_rewrite_operations x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected('a12',x.owner_id,x.analysis_id,x.operation_id,null) order by x.analysis_id,x.operation_id for update nowait loop
  if c.claimed_at is not null and not isfinite(c.claimed_at) then raise exception 'OWNED_AI_EXPIRY_PROVENANCE' using errcode='23514';end if;
  if exists(select 1 from private.ai_budget_operation_sources s where s.kind='canonical_rewrite' and s.owner_id=c.owner_id and s.analysis_id=c.analysis_id
   and s.request_nonce=c.operation_id::text and not private.owned_ai_expiry_selected('r03',c.owner_id,null,s.operation_id,null))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
  if exists(select 1 from public.analysis_ai_runs x where x.id=c.run_id) and not private.owned_ai_expiry_selected('legacy',c.owner_id,c.analysis_id,null,c.run_id)
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
 end loop;
 for f in select x.* from private.initial_feedback_operations x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected('a13',x.owner_id,x.analysis_id,x.operation_id,null) order by x.operation_id for update nowait loop
  if exists(select 1 from private.ai_budget_operations x where x.id=f.operation_id and not private.owned_ai_expiry_selected('r03',f.owner_id,null,x.id,null))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
  if exists(select 1 from private.initial_feedback_publications x where x.operation_id=f.operation_id)
   then raise exception 'OWNED_AI_EXPIRY_CONTENT_NOT_RETIRED' using errcode='23514';end if;
  perform 1 from private.initial_feedback_attempts where operation_id=f.operation_id order by ordinal for update nowait;
 end loop;
 -- Fail on missing/skipped operation locks before totals or deletes.
 for d in select * from private.owned_ai_operation_dispositions x where x.owner_id=p_owner_id
  and private.owned_ai_expiry_selected(x.kind,x.owner_id,x.analysis_id,x.operation_id,null) loop
  if (d.kind='r03' and not exists(select 1 from private.ai_budget_operations x where (x.id,x.user_id,x.organization_id)=(d.operation_id,d.owner_id,d.organization_id)))
   or (d.kind='a12' and not exists(select 1 from private.canonical_rewrite_operations x where (x.operation_id,x.owner_id,x.analysis_id,x.organization_id,x.source_id)=(d.operation_id,d.owner_id,d.analysis_id,d.organization_id,d.resume_version_id)))
   or (d.kind='a13' and not exists(select 1 from private.initial_feedback_operations x where (x.operation_id,x.owner_id,x.analysis_id,x.organization_id,x.resume_id,x.resume_version_id)=(d.operation_id,d.owner_id,d.analysis_id,d.organization_id,d.resume_id,d.resume_version_id)))
   then raise exception 'OWNED_AI_EXPIRY_INCOMPLETE_PAIR' using errcode='23514';end if;
 end loop;
 -- Fold contributions once. Linked raw/run copies contribute through the typed authority only.
 for month_row in
  with shared_usage as (
   select t.original_month month,t.input_tokens+t.output_tokens tokens,0::numeric unknowns
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
  ), months as(select month from shared_usage union select month from technical)
  select m.month,coalesce((select sum(tokens) from shared_usage where month=m.month),0) shared,
   coalesce((select sum(unknowns) from shared_usage where month=m.month),0) shared_unknown,
   coalesce((select sum(tokens) from technical where month=m.month),0) spent,
   coalesce((select sum(cost) from technical where month=m.month),0) cost,
   coalesce((select sum(reserved_tokens) from technical where month=m.month),0) reserved_tokens,
   coalesce((select sum(reserved_cost) from technical where month=m.month),0) reserved_cost,
   coalesce((select sum(unknowns) from technical where month=m.month),0) technical_unknown,
   coalesce((select sum(overage) from technical where month=m.month),0) overage
  from months m order by m.month loop
  insert into private.owned_ai_expiry_months values(month_row.month,month_row.shared,month_row.shared_unknown,month_row.spent,month_row.cost,
   month_row.reserved_tokens,month_row.reserved_cost,month_row.technical_unknown,month_row.overage)
  on conflict(month) do update set shared_known_tokens=owned_ai_expiry_months.shared_known_tokens+excluded.shared_known_tokens,
   shared_unknown_claims=owned_ai_expiry_months.shared_unknown_claims+excluded.shared_unknown_claims,
   technical_spent_tokens=owned_ai_expiry_months.technical_spent_tokens+excluded.technical_spent_tokens,
   technical_spent_cost_microusd=owned_ai_expiry_months.technical_spent_cost_microusd+excluded.technical_spent_cost_microusd,
   technical_reserved_tokens=owned_ai_expiry_months.technical_reserved_tokens+excluded.technical_reserved_tokens,
   technical_reserved_cost_microusd=owned_ai_expiry_months.technical_reserved_cost_microusd+excluded.technical_reserved_cost_microusd,
   technical_unknown_claims=owned_ai_expiry_months.technical_unknown_claims+excluded.technical_unknown_claims,
   unreconciled_overages=owned_ai_expiry_months.unreconciled_overages+excluded.unreconciled_overages;
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
