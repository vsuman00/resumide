begin;

create function public.cancel_owned_analysis(
  p_analysis_id uuid,
  p_user_id uuid,
  p_request_id text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_analysis_id is null or p_user_id is null or p_request_id is null
    or char_length(p_request_id) not between 1 and 128 then
    return 'not_found';
  end if;

  -- Take the shared owner lock before row locks. Deletion intake takes the
  -- exclusive lock, so it cannot start between admission and mutation.
  if not private.try_candidate_privacy_write(p_user_id) then
    if private.candidate_write_blocked(p_user_id) then
      return 'not_found';
    end if;
    raise exception 'Cancellation owner scope is busy' using errcode = '55P03';
  end if;

  -- Keep source and membership stable through the existing queue mutation.
  -- Fail promptly if another operation already holds any needed row.
  perform 1
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
  where a.id = p_analysis_id and a.owner_id = p_user_id
  for update of a nowait
  for share of v, r, m nowait;

  if not found then
    return 'not_found';
  end if;

  perform 1 from public.analysis_jobs j
  where j.analysis_id = p_analysis_id
  for update nowait;

  return public.cancel_analysis(p_analysis_id, p_user_id, p_request_id);
end;
$$;

revoke all on function public.cancel_owned_analysis(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_owned_analysis(uuid, uuid, text)
  to service_role;

commit;
