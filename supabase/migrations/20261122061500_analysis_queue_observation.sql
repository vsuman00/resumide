begin;

create table private.analysis_queue_observation (
  singleton boolean primary key default true check (singleton),
  last_checked_at timestamptz
);

insert into private.analysis_queue_observation (singleton) values (true);

revoke all on table private.analysis_queue_observation
  from public, anon, authenticated, service_role;

create function public.claim_analysis_job_observed(
  p_worker_id text,
  p_lease_seconds integer,
  p_fenced boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claim jsonb;
  checked_at timestamptz;
begin
  if p_fenced is null then
    raise exception 'Claim mode is required' using errcode = '22023';
  end if;

  if p_fenced then
    claim := public.claim_analysis_job_v2(p_worker_id, p_lease_seconds);
  else
    claim := public.claim_analysis_job(p_worker_id, p_lease_seconds);
  end if;

  checked_at := clock_timestamp();
  -- A busy observation row must never block a worker from acquiring a lease.
  with due as (
    select o.singleton
    from private.analysis_queue_observation o
    where o.singleton and (
      o.last_checked_at is null
      or o.last_checked_at <= checked_at - interval '15 seconds'
      or o.last_checked_at > checked_at
    )
    for update skip locked
  )
  update private.analysis_queue_observation o
  set last_checked_at = checked_at
  from due
  where o.singleton = due.singleton;

  return claim;
end;
$$;

create function public.read_owned_analysis_queue_observation(
  p_analysis_id uuid,
  p_user_id uuid
)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  with checked as (select clock_timestamp() as read_at)
  select coalesce((
    select case
      when a.status not in ('quarantined', 'queued') then 'not_waiting'
      when o.last_checked_at between checked.read_at - interval '60 seconds'
        and checked.read_at then 'recent_check'
      else 'no_recent_check'
    end
    from public.analyses a
    join public.resume_versions v on v.id = a.resume_version_id
      and v.owner_id = a.owner_id
      and v.organization_id = a.organization_id
    join public.resumes r on r.id = v.resume_id
      and r.owner_id = v.owner_id
      and r.organization_id = v.organization_id
      and r.status = 'active'
    join public.memberships m on m.organization_id = a.organization_id
      and m.user_id = a.owner_id
    left join private.analysis_queue_observation o on o.singleton
    cross join checked
    where a.id = p_analysis_id and a.owner_id = p_user_id
      and not private.candidate_write_blocked(p_user_id)
  ), 'not_found');
$$;

revoke all on function public.claim_analysis_job_observed(text, integer, boolean),
  public.read_owned_analysis_queue_observation(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_analysis_job_observed(text, integer, boolean),
  public.read_owned_analysis_queue_observation(uuid, uuid)
  to service_role;

commit;
