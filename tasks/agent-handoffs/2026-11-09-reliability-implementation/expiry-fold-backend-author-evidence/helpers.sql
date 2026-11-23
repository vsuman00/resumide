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
 if ok is not true then return false;end if;
 perform private.owned_ai_expiry_require_adoption(owner);
 return true;
end;
$expiry_delete_allowed$;

create function private.owned_ai_expiry_rebuild_pools(p_owner uuid) returns void
language plpgsql volatile set search_path='' as $expiry_rebuild_pools$
declare pool private.ai_budget_pools%rowtype;opening private.ai_budget_period_openings%rowtype;totals record;remaining record;
begin
 perform private.owned_ai_expiry_require_adoption(p_owner);
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
  update private.ai_budget_pools set spent_tokens=opening.opening_spent_tokens+remaining.spent,spent_cost_microusd=opening.opening_spent_cost_microusd+remaining.cost,
   reserved_tokens=remaining.reserved_tokens,reserved_cost_microusd=remaining.reserved_cost
   where (organization_id,period)=(pool.organization_id,pool.period);
 end loop;
end;
$expiry_rebuild_pools$;

create function public.sweep_owned_ai_expiry(p_limit integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $expiry_sweep$
declare owner uuid;answer jsonb;selected integer:=0;folded integer:=0;blocked integer:=0;breached boolean;now_value timestamptz:=clock_timestamp();
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
  begin
   answer:=private.expire_owned_ai_disposition(owner);
   if answer=jsonb_build_object('status','folded') then folded:=folded+1;else blocked:=blocked+1;end if;
  exception when sqlstate 'P0E01' or check_violation or lock_not_available then blocked:=blocked+1;
  end;
 end loop;
 return jsonb_build_object('schemaVersion','owned-ai-expiry-sweep/1.0.0','selectedCount',selected,'foldedCount',folded,'blockedCount',blocked,'deadlineBreached',breached);
end;
$expiry_sweep$;
