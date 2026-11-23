-- A credited handoff consumes a lease attempt but does not consume a failure.
-- Keep the sealed legacy claimant available for earlier schemas.
begin;

create function public.claim_privacy_request_with_cleanup_credits(
  p_worker_id text,p_lease_seconds integer,p_max_attempts integer
) returns jsonb
language plpgsql volatile security definer set search_path='' as $claim$
declare
  request_row public.data_requests%rowtype;
  generation_now bigint;
  checked_at timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id)=''
    or p_lease_seconds is null or p_lease_seconds not between 30 and 3600
    or p_max_attempts is null or p_max_attempts not between 1 and 10 then
    raise exception 'invalid privacy lease parameters' using errcode='22023';
  end if;
  if private.privacy_generation_ready() is not true then
    raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';
  end if;
  generation_now:=private.privacy_generation_current();
  checked_at:=clock_timestamp();
  select d.* into request_row
  from public.data_requests d
  left join private.analysis_admission_cleanup_progress progress
    on progress.request_id=d.id and d.kind='deletion' and progress.deferred_attempts>0
  where (
      case when progress.request_id is not null
        then d.attempt_count>=progress.deferred_attempts
          and d.attempt_count-progress.deferred_attempts<p_max_attempts
        else d.attempt_count<3
      end
    )
    and d.next_attempt_at<=checked_at
    and (d.status='queued' or (d.status='processing' and d.lease_expires_at<=checked_at))
  order by d.created_at asc,d.id asc
  for update of d skip locked
  limit 1;
  if not found then return null;end if;

  update public.data_requests
  set status='processing',privacy_generation=generation_now,attempt_count=attempt_count+1,
    lease_owner=p_worker_id,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    last_error_code=null
  where id=request_row.id returning * into request_row;

  return jsonb_build_object('id',request_row.id,'kind',request_row.kind,'userId',request_row.user_id,
    'organizationId',request_row.organization_id,'attempt',request_row.attempt_count);
end;
$claim$;

revoke all on function public.claim_privacy_request_with_cleanup_credits(text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_privacy_request_with_cleanup_credits(text,integer,integer)
  to service_role;

commit;
