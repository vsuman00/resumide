-- Private engineering foundation. No policies, opening balances or operators are
-- seeded; no existing provider caller is changed. Hosted application, cutover,
-- retention and actual managed concurrency acceptance remain separate gates.

create function private.ai_budget_integer(p_value numeric)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_value >= 0 and p_value = pg_catalog.trunc(p_value)
    and p_value::text not in ('NaN', 'Infinity', '-Infinity');
$$;

create function private.ai_budget_cost(
  p_input numeric, p_output numeric, p_input_rate numeric, p_output_rate numeric
)
returns numeric language sql immutable strict set search_path = '' as $$
  select pg_catalog.ceil((p_input * p_input_rate + p_output * p_output_rate) / 1000000::numeric);
$$;

create table private.ai_budget_policies (
  version text primary key check (version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),
  model text not null check (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),
  monthly_token_limit numeric not null check (private.ai_budget_integer(monthly_token_limit) and monthly_token_limit > 0),
  monthly_cost_limit_microusd numeric not null check (private.ai_budget_integer(monthly_cost_limit_microusd) and monthly_cost_limit_microusd > 0),
  input_microusd_per_million numeric not null check (private.ai_budget_integer(input_microusd_per_million) and input_microusd_per_million between 1 and 9223372036854775807),
  output_microusd_per_million numeric not null check (private.ai_budget_integer(output_microusd_per_million) and output_microusd_per_million between 1 and 9223372036854775807),
  max_attempts integer not null check (max_attempts between 1 and 3),
  enabled boolean not null default false,
  approval_sha256 text not null check (approval_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

-- An operator must account for legacy spend before opening a month. A missing
-- record never creates a zero balance. Unknown legacy spend blocks this opening.
create table private.ai_budget_period_openings (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period date not null check (period = date_trunc('month', period)::date),
  pool_policy_version text not null references private.ai_budget_policies(version) on delete restrict,
  opening_spent_tokens numeric not null check (private.ai_budget_integer(opening_spent_tokens)),
  opening_spent_cost_microusd numeric not null check (private.ai_budget_integer(opening_spent_cost_microusd)),
  unresolved_legacy_attempts integer not null check (unresolved_legacy_attempts = 0),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, period)
);

create table private.ai_budget_pools (
  organization_id uuid not null,
  period date not null,
  pool_policy_version text not null references private.ai_budget_policies(version) on delete restrict,
  token_limit numeric not null check (private.ai_budget_integer(token_limit) and token_limit > 0),
  cost_limit_microusd numeric not null check (private.ai_budget_integer(cost_limit_microusd) and cost_limit_microusd > 0),
  reserved_tokens numeric not null check (private.ai_budget_integer(reserved_tokens)),
  reserved_cost_microusd numeric not null check (private.ai_budget_integer(reserved_cost_microusd)),
  spent_tokens numeric not null check (private.ai_budget_integer(spent_tokens)),
  spent_cost_microusd numeric not null check (private.ai_budget_integer(spent_cost_microusd)),
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, period),
  foreign key (organization_id, period) references private.ai_budget_period_openings(organization_id, period) on delete restrict
);

create table private.ai_budget_operations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  surface text not null check (surface in ('qualitative', 'rewrite', 'build')),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  model text not null,
  prompt_policy_version text not null,
  policy_version text not null references private.ai_budget_policies(version) on delete restrict,
  reserved_input_tokens numeric not null check (private.ai_budget_integer(reserved_input_tokens) and reserved_input_tokens between 1 and 9007199254740991),
  reserved_output_tokens numeric not null check (private.ai_budget_integer(reserved_output_tokens) and reserved_output_tokens between 1 and 9007199254740991),
  input_microusd_per_million numeric not null check (private.ai_budget_integer(input_microusd_per_million) and input_microusd_per_million between 1 and 9223372036854775807),
  output_microusd_per_million numeric not null check (private.ai_budget_integer(output_microusd_per_million) and output_microusd_per_million between 1 and 9223372036854775807),
  attempt_limit integer not null check (attempt_limit between 1 and 3),
  binding_sha256 text not null check (binding_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id)
);

create table private.ai_budget_attempts (
  id uuid primary key,
  operation_id uuid not null,
  organization_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 3),
  period date not null,
  state text not null check (state in ('reserved', 'dispatched', 'released', 'held_unknown', 'settled')),
  reserved_cost_microusd numeric not null check (private.ai_budget_integer(reserved_cost_microusd)),
  actual_input_tokens numeric,
  actual_output_tokens numeric,
  actual_cost_microusd numeric,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (operation_id, ordinal),
  foreign key (operation_id, organization_id) references private.ai_budget_operations(id, organization_id) on delete restrict,
  foreign key (organization_id, period) references private.ai_budget_pools(organization_id, period) on delete restrict,
  check (
    (state <> 'settled' and actual_input_tokens is null and actual_output_tokens is null and actual_cost_microusd is null)
    or (state = 'settled' and actual_input_tokens is not null and actual_output_tokens is not null and actual_cost_microusd is not null
      and private.ai_budget_integer(actual_input_tokens) and actual_input_tokens <= 9007199254740991
      and private.ai_budget_integer(actual_output_tokens) and actual_output_tokens <= 9007199254740991
      and private.ai_budget_integer(actual_cost_microusd))
  )
);
create index ai_budget_attempts_pool_idx on private.ai_budget_attempts(organization_id, period);

create table private.ai_budget_reconciliation_operators (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operator_id uuid not null references auth.users(id) on delete restrict,
  enabled boolean not null default false,
  approval_sha256 text not null check (approval_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (organization_id, operator_id)
);

create table private.ai_budget_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references private.ai_budget_attempts(id) on delete restrict,
  kind text not null check (kind in ('reserve', 'dispatch', 'release', 'unknown', 'settle', 'reconcile')),
  input_tokens numeric,
  output_tokens numeric,
  cost_microusd numeric,
  reconciliation_id uuid unique,
  operator_id uuid references auth.users(id) on delete restrict,
  evidence_sha256 text,
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, kind),
  check ((kind in ('settle', 'reconcile') and input_tokens is not null and output_tokens is not null and cost_microusd is not null
      and private.ai_budget_integer(input_tokens) and private.ai_budget_integer(output_tokens) and private.ai_budget_integer(cost_microusd))
    or (kind not in ('settle', 'reconcile') and input_tokens is null and output_tokens is null and cost_microusd is null)),
  check ((kind = 'reconcile' and reconciliation_id is not null and operator_id is not null and evidence_sha256 is not null and evidence_sha256 ~ '^[a-f0-9]{64}$')
    or (kind <> 'reconcile' and reconciliation_id is null and operator_id is null and evidence_sha256 is null))
);

create function private.ai_budget_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Immutable technical AI budget record' using errcode = '23514';
end;
$$;
create trigger ai_budget_policies_immutable before update or delete on private.ai_budget_policies for each row execute function private.ai_budget_immutable();
create trigger ai_budget_openings_immutable before update or delete on private.ai_budget_period_openings for each row execute function private.ai_budget_immutable();
create trigger ai_budget_operations_immutable before update or delete on private.ai_budget_operations for each row execute function private.ai_budget_immutable();
create trigger ai_budget_events_immutable before update or delete on private.ai_budget_events for each row execute function private.ai_budget_immutable();

create function private.ai_budget_projection_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'ai_budget_pools' then
    if row(new.organization_id, new.period, new.pool_policy_version, new.token_limit, new.cost_limit_microusd, new.created_at)
      is distinct from row(old.organization_id, old.period, old.pool_policy_version, old.token_limit, old.cost_limit_microusd, old.created_at) then
      raise exception 'Immutable technical AI budget identity' using errcode = '23514';
    end if;
  elsif row(new.id, new.operation_id, new.organization_id, new.ordinal, new.period, new.reserved_cost_microusd, new.created_at)
    is distinct from row(old.id, old.operation_id, old.organization_id, old.ordinal, old.period, old.reserved_cost_microusd, old.created_at) then
    raise exception 'Immutable technical AI budget identity' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ai_budget_pool_identity before update on private.ai_budget_pools for each row execute function private.ai_budget_projection_identity();
create trigger ai_budget_attempt_identity before update on private.ai_budget_attempts for each row execute function private.ai_budget_projection_identity();

create function private.ai_budget_binding_sha256(p_user_id uuid, p_organization_id uuid, p_request jsonb)
returns text language plpgsql immutable strict set search_path = '' as $$
declare
  atom text;
  bytes bytea := convert_to(E'AIBUDGET1\n', 'UTF8');
begin
  foreach atom in array array[p_user_id::text, p_organization_id::text, p_request->>'operationId', p_request->>'surface',
    p_request->>'payloadSha256', p_request->>'model', p_request->>'promptPolicyVersion', p_request->>'policyVersion',
    p_request->>'reservedInputTokens', p_request->>'reservedOutputTokens'] loop
    if atom is null then raise exception 'Invalid technical AI budget binding' using errcode = '22023'; end if;
    bytes := bytes || convert_to('T' || octet_length(convert_to(atom, 'UTF8'))::text || ':' || atom || ';', 'UTF8');
  end loop;
  return encode(extensions.digest(bytes, 'sha256'), 'hex');
end;
$$;

create function private.ai_budget_request_valid(p_request jsonb, p_action text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  keys text[];
  expected text[] := array['operationId','attemptId','attemptOrdinal','surface','payloadSha256','model',
    'promptPolicyVersion','policyVersion','reservedInputTokens','reservedOutputTokens'];
  key text;
begin
  if p_request is null or jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text) > 8192 then return false; end if;
  if p_action = 'settle' then expected := expected || array['usage'];
  elsif p_action = 'reconcile' then expected := expected || array['usage','reconciliationId','operatorId','evidenceSha256'];
  elsif p_action not in ('reserve','claim_dispatch','release','mark_unknown') then return false;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(p_request) k;
  if keys is distinct from (select array_agg(k order by k) from unnest(expected) k) then return false; end if;
  foreach key in array array['operationId','attemptId'] || case when p_action='reconcile' then array['reconciliationId','operatorId'] else '{}'::text[] end loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  end loop;
  foreach key in array array['payloadSha256'] || case when p_action='reconcile' then array['evidenceSha256'] else '{}'::text[] end loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  foreach key in array array['model','promptPolicyVersion','policyVersion'] loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$' then return false; end if;
  end loop;
  if jsonb_typeof(p_request->'surface') is distinct from 'string' or (p_request->>'surface') not in ('qualitative','rewrite','build')
    or jsonb_typeof(p_request->'attemptOrdinal') is distinct from 'number'
    or (p_request->>'attemptOrdinal')::numeric not in (1,2,3) then return false; end if;
  foreach key in array array['reservedInputTokens','reservedOutputTokens'] loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~ '^[1-9][0-9]{0,15}$' then return false; end if;
    if (p_request->>key)::numeric > 9007199254740991 then return false; end if;
  end loop;
  if p_action in ('settle','reconcile') then
    if jsonb_typeof(p_request->'usage') is distinct from 'object' then return false; end if;
    select array_agg(k order by k) into keys from jsonb_object_keys(p_request->'usage') k;
    if keys is distinct from array['inputTokens','outputTokens'] then return false; end if;
    foreach key in array array['inputTokens','outputTokens'] loop
      if jsonb_typeof(p_request->'usage'->key) is distinct from 'string' or (p_request->'usage'->>key) !~ '^(0|[1-9][0-9]{0,15})$' then return false; end if;
      if (p_request->'usage'->>key)::numeric > 9007199254740991 then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create function private.ai_budget_blocked(p_organization_id uuid)
returns boolean language sql volatile set search_path = '' as $$
  select exists(select 1 from private.ai_budget_pools p where p.organization_id=p_organization_id
    and (p.spent_tokens+p.reserved_tokens>p.token_limit or p.spent_cost_microusd+p.reserved_cost_microusd>p.cost_limit_microusd))
    or exists(select 1 from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id
      where a.organization_id=p_organization_id and a.state='settled'
        and (a.actual_input_tokens>o.reserved_input_tokens or a.actual_output_tokens>o.reserved_output_tokens
          or a.actual_cost_microusd>a.reserved_cost_microusd)
        and not exists(select 1 from private.ai_budget_events e where e.attempt_id=a.id and e.kind='reconcile'));
$$;

create function private.ai_budget_receipt(p_attempt_id uuid, p_replayed boolean, p_dispatch_allowed boolean)
returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('schemaVersion','ai-budget/1.0.0','status','ok','receipt',jsonb_build_object(
    'schemaVersion','ai-budget/1.0.0','userId',o.user_id,'organizationId',o.organization_id,
    'operationId',o.id,'attemptId',a.id,'attemptOrdinal',a.ordinal,'surface',o.surface,
    'payloadSha256',o.payload_sha256,'model',o.model,'promptPolicyVersion',o.prompt_policy_version,'policyVersion',o.policy_version,
    'reservedInputTokens',pg_catalog.trunc(o.reserved_input_tokens)::text,'reservedOutputTokens',pg_catalog.trunc(o.reserved_output_tokens)::text,
    'bindingSha256',o.binding_sha256,'poolPolicyVersion',p.pool_policy_version,'attemptLimit',o.attempt_limit,
    'period',to_char(a.period,'YYYY-MM-DD'),'state',a.state,'inputMicrousdPerMillion',pg_catalog.trunc(o.input_microusd_per_million)::text,
    'outputMicrousdPerMillion',pg_catalog.trunc(o.output_microusd_per_million)::text,'reservedCostMicrousd',pg_catalog.trunc(a.reserved_cost_microusd)::text,
    'actualInputTokens',pg_catalog.trunc(a.actual_input_tokens)::text,'actualOutputTokens',pg_catalog.trunc(a.actual_output_tokens)::text,
    'actualCostMicrousd',pg_catalog.trunc(a.actual_cost_microusd)::text,'replayed',p_replayed,'dispatchAllowed',p_dispatch_allowed,
    'poolBlocked',private.ai_budget_blocked(o.organization_id)))
  from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id
  join private.ai_budget_pools p on p.organization_id=a.organization_id and p.period=a.period where a.id=p_attempt_id;
$$;

create function private.ai_budget_denied(p_code text)
returns jsonb language sql immutable strict set search_path = '' as $$
  select jsonb_build_object('schemaVersion','ai-budget/1.0.0','status','denied','code',p_code);
$$;

-- Every mutation locks one organization first. Admission/dispatch additionally
-- lock its current owner membership BEFORE any operation/attempt lookup. Static
-- accounting remains possible after revocation, without authorizing new AI.
create function private.ai_budget_transition(p_user_id uuid, p_organization_id uuid, p_request jsonb, p_action text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  organization_owner uuid;
  operation_row private.ai_budget_operations%rowtype;
  attempt_row private.ai_budget_attempts%rowtype;
  pool_row private.ai_budget_pools%rowtype;
  policy_row private.ai_budget_policies%rowtype;
  opening_row private.ai_budget_period_openings%rowtype;
  event_row private.ai_budget_events%rowtype;
  op_id uuid; attempt_id uuid; ordinal integer; binding text; period_start date;
  reserved_input numeric; reserved_output numeric; reserved_total numeric; reserve_cost numeric;
  actual_input numeric; actual_output numeric; actual_cost numeric;
  previous_ordinal integer; operation_exists boolean; attempt_exists boolean;
begin
  if p_user_id is null or p_organization_id is null or not private.ai_budget_request_valid(p_request,p_action) then
    return private.ai_budget_denied('AI_BUDGET_INVALID');
  end if;
  select owner_id into organization_owner from public.organizations where id=p_organization_id for update;
  if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  if p_action in ('reserve','claim_dispatch') then
    if organization_owner<>p_user_id then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
    perform 1 from public.memberships where organization_id=p_organization_id and user_id=p_user_id and role in ('owner','admin','member') for update;
    if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  elsif p_action='reconcile' then
    perform 1 from private.ai_budget_reconciliation_operators where organization_id=p_organization_id
      and operator_id=(p_request->>'operatorId')::uuid and enabled for share;
    if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  end if;
  op_id:=(p_request->>'operationId')::uuid;
  attempt_id:=(p_request->>'attemptId')::uuid;
  ordinal:=(p_request->>'attemptOrdinal')::numeric::integer;
  binding:=private.ai_budget_binding_sha256(p_user_id,p_organization_id,p_request);
  reserved_input:=(p_request->>'reservedInputTokens')::numeric;
  reserved_output:=(p_request->>'reservedOutputTokens')::numeric;
  reserved_total:=reserved_input+reserved_output;

  select * into operation_row from private.ai_budget_operations where id=op_id and organization_id=p_organization_id and user_id=p_user_id for update;
  operation_exists:=found;
  if not operation_exists and exists(select 1 from private.ai_budget_operations where id=op_id) then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  if operation_exists and operation_row.binding_sha256<>binding then return private.ai_budget_denied('AI_BUDGET_CONFLICT'); end if;
  select * into attempt_row from private.ai_budget_attempts where id=attempt_id and organization_id=p_organization_id for update;
  attempt_exists:=found;
  if not attempt_exists and exists(select 1 from private.ai_budget_attempts where id=attempt_id) then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  if attempt_exists and (attempt_row.operation_id<>op_id or attempt_row.ordinal<>ordinal) then return private.ai_budget_denied('AI_BUDGET_CONFLICT'); end if;

  if p_action='reserve' then
    if attempt_exists then return private.ai_budget_receipt(attempt_id,true,false); end if;
    if private.ai_budget_blocked(p_organization_id) then return private.ai_budget_denied('AI_BUDGET_BLOCKED'); end if;
    if not operation_exists then
      select * into policy_row from private.ai_budget_policies where version=p_request->>'policyVersion' and model=p_request->>'model' and enabled;
      if not found then return private.ai_budget_denied('AI_BUDGET_DISABLED'); end if;
      if ordinal<>1 then return private.ai_budget_denied('AI_BUDGET_CONFLICT'); end if;
    else
      if ordinal>operation_row.attempt_limit then return private.ai_budget_denied('AI_BUDGET_EXHAUSTED'); end if;
      select coalesce(max(a.ordinal),0) into previous_ordinal from private.ai_budget_attempts a where a.operation_id=op_id;
      if ordinal<>previous_ordinal+1 then return private.ai_budget_denied('AI_BUDGET_CONFLICT'); end if;
      if exists(select 1 from private.ai_budget_attempts a where a.operation_id=op_id and a.state in ('reserved','dispatched')) then
        return private.ai_budget_denied('AI_BUDGET_STATE');
      end if;
      select * into policy_row from private.ai_budget_policies where version=operation_row.policy_version;
    end if;
    period_start:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
    select * into pool_row from private.ai_budget_pools where organization_id=p_organization_id and period=period_start for update;
    if not found then
      select * into opening_row from private.ai_budget_period_openings where organization_id=p_organization_id and period=period_start;
      if not found then return private.ai_budget_denied('AI_BUDGET_DISABLED'); end if;
      insert into private.ai_budget_pools(organization_id,period,pool_policy_version,token_limit,cost_limit_microusd,
        reserved_tokens,reserved_cost_microusd,spent_tokens,spent_cost_microusd)
      select p_organization_id,period_start,p.version,p.monthly_token_limit,p.monthly_cost_limit_microusd,
        0,0,opening_row.opening_spent_tokens,opening_row.opening_spent_cost_microusd
      from private.ai_budget_policies p where p.version=opening_row.pool_policy_version and p.enabled
      returning * into pool_row;
      if not found then return private.ai_budget_denied('AI_BUDGET_DISABLED'); end if;
    end if;
    reserve_cost:=private.ai_budget_cost(reserved_input,reserved_output,policy_row.input_microusd_per_million,policy_row.output_microusd_per_million);
    if private.ai_budget_blocked(p_organization_id) then return private.ai_budget_denied('AI_BUDGET_BLOCKED'); end if;
    if pool_row.spent_tokens+pool_row.reserved_tokens+reserved_total>pool_row.token_limit
      or pool_row.spent_cost_microusd+pool_row.reserved_cost_microusd+reserve_cost>pool_row.cost_limit_microusd then
      return private.ai_budget_denied('AI_BUDGET_EXHAUSTED');
    end if;
    if not operation_exists then
      insert into private.ai_budget_operations(id,organization_id,user_id,surface,payload_sha256,model,prompt_policy_version,policy_version,
        reserved_input_tokens,reserved_output_tokens,input_microusd_per_million,output_microusd_per_million,attempt_limit,binding_sha256)
      values(op_id,p_organization_id,p_user_id,p_request->>'surface',p_request->>'payloadSha256',p_request->>'model',
        p_request->>'promptPolicyVersion',policy_row.version,reserved_input,reserved_output,policy_row.input_microusd_per_million,
        policy_row.output_microusd_per_million,policy_row.max_attempts,binding);
    end if;
    insert into private.ai_budget_attempts(id,operation_id,organization_id,ordinal,period,state,reserved_cost_microusd)
      values(attempt_id,op_id,p_organization_id,ordinal,period_start,'reserved',reserve_cost);
    update private.ai_budget_pools set reserved_tokens=reserved_tokens+reserved_total,reserved_cost_microusd=reserved_cost_microusd+reserve_cost
      where organization_id=p_organization_id and period=period_start;
    insert into private.ai_budget_events(attempt_id,kind) values(attempt_id,'reserve');
    return private.ai_budget_receipt(attempt_id,false,false);
  end if;

  if not operation_exists or not attempt_exists then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  select * into pool_row from private.ai_budget_pools where organization_id=p_organization_id and period=attempt_row.period for update;
  if p_action='claim_dispatch' then
    if attempt_row.state in ('dispatched','held_unknown','settled') then return private.ai_budget_receipt(attempt_id,true,false); end if;
    if attempt_row.state<>'reserved' then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
    if private.ai_budget_blocked(p_organization_id) then return private.ai_budget_denied('AI_BUDGET_BLOCKED'); end if;
    update private.ai_budget_attempts set state='dispatched',updated_at=clock_timestamp() where id=attempt_id;
    insert into private.ai_budget_events(attempt_id,kind) values(attempt_id,'dispatch');
    return private.ai_budget_receipt(attempt_id,false,true);
  elsif p_action='release' then
    if attempt_row.state='released' then return private.ai_budget_receipt(attempt_id,true,false); end if;
    if attempt_row.state<>'reserved' then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
    update private.ai_budget_pools set reserved_tokens=reserved_tokens-reserved_total,reserved_cost_microusd=reserved_cost_microusd-attempt_row.reserved_cost_microusd
      where organization_id=p_organization_id and period=attempt_row.period;
    update private.ai_budget_attempts set state='released',updated_at=clock_timestamp() where id=attempt_id;
    insert into private.ai_budget_events(attempt_id,kind) values(attempt_id,'release');
    return private.ai_budget_receipt(attempt_id,false,false);
  elsif p_action='mark_unknown' then
    if attempt_row.state='held_unknown' then return private.ai_budget_receipt(attempt_id,true,false); end if;
    if attempt_row.state<>'dispatched' then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
    update private.ai_budget_attempts set state='held_unknown',updated_at=clock_timestamp() where id=attempt_id;
    insert into private.ai_budget_events(attempt_id,kind) values(attempt_id,'unknown');
    return private.ai_budget_receipt(attempt_id,false,false);
  end if;

  actual_input:=(p_request->'usage'->>'inputTokens')::numeric;
  actual_output:=(p_request->'usage'->>'outputTokens')::numeric;
  actual_cost:=private.ai_budget_cost(actual_input,actual_output,operation_row.input_microusd_per_million,operation_row.output_microusd_per_million);
  if p_action='settle' then
    if attempt_row.state='settled' then
      if attempt_row.actual_input_tokens<>actual_input or attempt_row.actual_output_tokens<>actual_output then return private.ai_budget_denied('AI_BUDGET_CONFLICT'); end if;
      return private.ai_budget_receipt(attempt_id,true,false);
    end if;
    if attempt_row.state<>'dispatched' then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
  else
    select * into event_row from private.ai_budget_events where reconciliation_id=(p_request->>'reconciliationId')::uuid;
    if found then
      if event_row.attempt_id<>attempt_id or event_row.operator_id<>(p_request->>'operatorId')::uuid
        or event_row.evidence_sha256<>p_request->>'evidenceSha256' or event_row.input_tokens<>actual_input or event_row.output_tokens<>actual_output then
        return private.ai_budget_denied('AI_BUDGET_CONFLICT');
      end if;
      return private.ai_budget_receipt(attempt_id,true,false);
    end if;
    if attempt_row.state='settled' then
      if attempt_row.actual_input_tokens<>actual_input or attempt_row.actual_output_tokens<>actual_output then
        return private.ai_budget_denied('AI_BUDGET_CONFLICT');
      end if;
      if not (actual_input>operation_row.reserved_input_tokens or actual_output>operation_row.reserved_output_tokens
        or actual_cost>attempt_row.reserved_cost_microusd) then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
      if exists(select 1 from private.ai_budget_events e where e.attempt_id=attempt_row.id and e.kind='reconcile') then
        return private.ai_budget_denied('AI_BUDGET_CONFLICT');
      end if;
      -- Audit an already charged overrun. Identical observed usage only: this
      -- appends authority/evidence, never refunds or charges the attempt again.
      insert into private.ai_budget_events(attempt_id,kind,input_tokens,output_tokens,cost_microusd,reconciliation_id,operator_id,evidence_sha256)
        values(attempt_id,'reconcile',actual_input,actual_output,actual_cost,(p_request->>'reconciliationId')::uuid,
          (p_request->>'operatorId')::uuid,p_request->>'evidenceSha256');
      return private.ai_budget_receipt(attempt_id,false,false);
    end if;
    if attempt_row.state<>'held_unknown' then return private.ai_budget_denied('AI_BUDGET_STATE'); end if;
  end if;
  update private.ai_budget_pools set reserved_tokens=reserved_tokens-reserved_total,reserved_cost_microusd=reserved_cost_microusd-attempt_row.reserved_cost_microusd,
    spent_tokens=spent_tokens+actual_input+actual_output,spent_cost_microusd=spent_cost_microusd+actual_cost
    where organization_id=p_organization_id and period=attempt_row.period;
  update private.ai_budget_attempts set state='settled',actual_input_tokens=actual_input,actual_output_tokens=actual_output,
    actual_cost_microusd=actual_cost,updated_at=clock_timestamp() where id=attempt_id;
  insert into private.ai_budget_events(attempt_id,kind,input_tokens,output_tokens,cost_microusd,reconciliation_id,operator_id,evidence_sha256)
    values(attempt_id,case when p_action='settle' then 'settle' else 'reconcile' end,actual_input,actual_output,actual_cost,
      case when p_action='reconcile' then (p_request->>'reconciliationId')::uuid end,
      case when p_action='reconcile' then (p_request->>'operatorId')::uuid end,
      case when p_action='reconcile' then p_request->>'evidenceSha256' end);
  return private.ai_budget_receipt(attempt_id,false,false);
exception
  when unique_violation then return private.ai_budget_denied('AI_BUDGET_CONFLICT');
  when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then return private.ai_budget_denied('AI_BUDGET_INVALID');
  when others then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
end;
$$;

create function public.ai_budget_reserve(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'reserve'); $$;
create function public.ai_budget_claim_dispatch(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'claim_dispatch'); $$;
create function public.ai_budget_release(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'release'); $$;
create function public.ai_budget_mark_unknown(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'mark_unknown'); $$;
create function public.ai_budget_settle(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'settle'); $$;
create function public.ai_budget_reconcile(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.ai_budget_transition(p_user_id,p_organization_id,p_request,'reconcile'); $$;

alter table private.ai_budget_policies enable row level security;
alter table private.ai_budget_period_openings enable row level security;
alter table private.ai_budget_pools enable row level security;
alter table private.ai_budget_operations enable row level security;
alter table private.ai_budget_attempts enable row level security;
alter table private.ai_budget_events enable row level security;
alter table private.ai_budget_reconciliation_operators enable row level security;
revoke all on private.ai_budget_policies,private.ai_budget_period_openings,private.ai_budget_pools,private.ai_budget_operations,
  private.ai_budget_attempts,private.ai_budget_events,private.ai_budget_reconciliation_operators from public,anon,authenticated,service_role;
revoke all on function private.ai_budget_integer(numeric),private.ai_budget_cost(numeric,numeric,numeric,numeric),
  private.ai_budget_immutable(),private.ai_budget_projection_identity(),private.ai_budget_binding_sha256(uuid,uuid,jsonb),
  private.ai_budget_request_valid(jsonb,text),private.ai_budget_blocked(uuid),private.ai_budget_receipt(uuid,boolean,boolean),
  private.ai_budget_denied(text),private.ai_budget_transition(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.ai_budget_reserve(uuid,uuid,jsonb),public.ai_budget_claim_dispatch(uuid,uuid,jsonb),
  public.ai_budget_release(uuid,uuid,jsonb),public.ai_budget_mark_unknown(uuid,uuid,jsonb),public.ai_budget_settle(uuid,uuid,jsonb),
  public.ai_budget_reconcile(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ai_budget_reserve(uuid,uuid,jsonb),public.ai_budget_claim_dispatch(uuid,uuid,jsonb),
  public.ai_budget_release(uuid,uuid,jsonb),public.ai_budget_mark_unknown(uuid,uuid,jsonb),public.ai_budget_settle(uuid,uuid,jsonb),
  public.ai_budget_reconcile(uuid,uuid,jsonb) to service_role;

-- Server-selected provider ordinal. Job retry counts are not provider attempts.
-- The old six RPCs and their request/receipt/hash contracts remain unchanged.
create function public.ai_budget_reserve_next(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  organization_owner uuid;
  chosen_ordinal integer;
begin
  if p_user_id is null or p_organization_id is null or jsonb_typeof(p_request) is distinct from 'object'
    or p_request ? 'attemptOrdinal'
    or not private.ai_budget_request_valid(p_request||'{"attemptOrdinal":1}'::jsonb,'reserve') then
    return private.ai_budget_denied('AI_BUDGET_INVALID');
  end if;
  select owner_id into organization_owner from public.organizations where id=p_organization_id for update;
  if not found or organization_owner<>p_user_id then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;
  perform 1 from public.memberships where organization_id=p_organization_id and user_id=p_user_id
    and role in ('owner','admin','member') for update;
  if not found then return private.ai_budget_denied('AI_BUDGET_DENIED'); end if;

  select a.ordinal into chosen_ordinal from private.ai_budget_attempts a
    where a.id=(p_request->>'attemptId')::uuid and a.organization_id=p_organization_id;
  if not found then
    select coalesce(max(a.ordinal),0)+1 into chosen_ordinal from private.ai_budget_attempts a
      join private.ai_budget_operations o on o.id=a.operation_id
      where o.id=(p_request->>'operationId')::uuid and o.organization_id=p_organization_id and o.user_id=p_user_id;
  end if;
  if chosen_ordinal>3 then return private.ai_budget_denied('AI_BUDGET_EXHAUSTED'); end if;
  return private.ai_budget_transition(p_user_id,p_organization_id,
    p_request||jsonb_build_object('attemptOrdinal',chosen_ordinal),'reserve');
exception
  when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then return private.ai_budget_denied('AI_BUDGET_INVALID');
  when others then return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE');
end;
$$;
revoke all on function public.ai_budget_reserve_next(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ai_budget_reserve_next(uuid,uuid,jsonb) to service_role;
