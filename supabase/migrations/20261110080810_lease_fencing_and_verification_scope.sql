-- R08 source-only foundation. No flag, worker, migration or global verification
-- scope is activated. R10 must separately fence every durable stage write.
alter table public.analysis_jobs add column lease_fence uuid;
revoke insert,update,delete,truncate on public.analysis_jobs from public,anon,authenticated,service_role;

-- Call only after the analysis/job locks. Shared locks serialize permission and
-- source deletion with this RPC; SKIP LOCKED avoids a source-first retention
-- transaction waiting for our analysis while we wait for its source row.
create function private.analysis_job_v2_owner_eligible(p_analysis_id uuid)
returns boolean language plpgsql set search_path='' as $$
declare a public.analyses%rowtype;
begin
  select * into a from public.analyses where id=p_analysis_id;
  if not found then return false; end if;
  if exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed') then return false; end if;
  perform 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id
    and m.role in ('owner','admin','member') for share skip locked;
  if not found then return false; end if;
  perform 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id
    where v.id=a.resume_version_id and v.organization_id=a.organization_id and v.owner_id=a.owner_id
      and r.organization_id=a.organization_id and r.owner_id=a.owner_id and r.status='active'
    for share of v,r skip locked;
  return found;
end;
$$;

-- The latest attempt must belong to the CURRENT source and match the persisted
-- uncalibrated envelope identity. An unrelated/historical row is not a handoff.
create function private.analysis_job_v2_review_handoff(p_analysis_id uuid)
returns boolean language sql volatile set search_path='' as $$
  select exists(select 1 from public.analyses a
    join public.resume_versions v on v.id=a.resume_version_id
    join public.document_evidence_attempts e on e.analysis_id=a.id
    where a.id=p_analysis_id and e.owner_id=a.owner_id and e.organization_id=a.organization_id
      and e.resume_version_id=a.resume_version_id and v.owner_id=a.owner_id and v.organization_id=a.organization_id
      and e.input_sha256=v.checksum
      and e.attempt_number=(select max(x.attempt_number) from public.document_evidence_attempts x where x.analysis_id=a.id)
      and e.envelope->>'schemaVersion'='evidence/2.0.0' and e.envelope->>'id'=e.id::text
      and e.envelope->>'analysisId'=a.id::text and e.envelope->>'ownerId'=a.owner_id::text
      and e.envelope->>'sourceId'=v.id::text and e.envelope->>'inputSha256'=v.checksum
      and e.envelope->'scoringEligible'='false'::jsonb
      and e.envelope->'confidence'='{"kind":"uncalibrated","reason":"calibration_not_approved"}'::jsonb
      and e.envelope->>'status' in ('review_required','insufficient','unsupported','failed'));
$$;

create function public.claim_analysis_job_v2(p_worker_id text,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  candidate record; a public.analyses%rowtype; j public.analysis_jobs%rowtype;
  checked_at timestamptz; token uuid; expires_at timestamptz;
begin
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_lease_seconds is null or p_lease_seconds<1 or p_lease_seconds>3600 then
    raise exception 'Invalid fenced lease parameters' using errcode='22023';
  end if;
  -- Both the expired sweep and candidate selection acquire analysis first.
  -- Bounded sweep work does not grant a safe shared-project verification scope.
  for candidate in
    select a.id from public.analyses a join public.analysis_jobs j on j.analysis_id=a.id
    where j.dead_lettered_at is null and j.attempt_count>=3 and j.lease_expires_at<=clock_timestamp()
      and a.status in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
      and not private.analysis_job_v2_review_handoff(a.id)
      and not exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed')
      and exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id and m.role in ('owner','admin','member'))
      and exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id
        where v.id=a.resume_version_id and v.organization_id=a.organization_id and v.owner_id=a.owner_id
          and r.organization_id=a.organization_id and r.owner_id=a.owner_id and r.status='active')
    order by j.run_after,a.id limit 100 for update of a skip locked
  loop
    select * into a from public.analyses where id=candidate.id;
    select * into j from public.analysis_jobs where analysis_id=a.id for update skip locked;
    if not found then continue; end if;
    if not private.analysis_job_v2_owner_eligible(a.id) then continue; end if;
    checked_at:=clock_timestamp();
    if a.status not in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
      or j.dead_lettered_at is not null or j.attempt_count<3 or j.lease_expires_at is null or j.lease_expires_at>checked_at
      or private.analysis_job_v2_review_handoff(a.id) then continue; end if;
    update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',dead_lettered_at=checked_at
      where analysis_id=a.id;
    if not public.transition_analysis(a.id,a.status,'failed',null,p_worker_id,coalesce(a.request_id,'worker-dead-letter')) then
      raise exception 'Fenced dead-letter transition failed' using errcode='23514';
    end if;
  end loop;

  for candidate in
    select a.id from public.analyses a join public.analysis_jobs j on j.analysis_id=a.id
    where j.run_after<=clock_timestamp() and j.dead_lettered_at is null and j.attempt_count<3
      and (j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp())
      and a.status in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
      and not private.analysis_job_v2_review_handoff(a.id)
      and not exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed')
      and exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id and m.role in ('owner','admin','member'))
      and exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id
        where v.id=a.resume_version_id and v.organization_id=a.organization_id and v.owner_id=a.owner_id
          and r.organization_id=a.organization_id and r.owner_id=a.owner_id and r.status='active')
    order by j.run_after,a.id limit 100 for update of a skip locked
  loop
    select * into a from public.analyses where id=candidate.id;
    select * into j from public.analysis_jobs where analysis_id=a.id for update skip locked;
    if not found then continue; end if;
    if not private.analysis_job_v2_owner_eligible(a.id) then continue; end if;
    checked_at:=clock_timestamp();
    if a.status not in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
      or j.dead_lettered_at is not null or j.attempt_count>=3 or j.run_after>checked_at
      or (j.lease_expires_at is not null and j.lease_expires_at>checked_at)
      or private.analysis_job_v2_review_handoff(a.id) then continue; end if;
    token:=gen_random_uuid(); expires_at:=checked_at+make_interval(secs=>p_lease_seconds);
    update public.analysis_jobs set lease_owner=p_worker_id,lease_fence=token,lease_expires_at=expires_at,
      attempt_count=attempt_count+1,last_error_code=case when j.lease_expires_at is not null then 'LEASE_EXPIRED' else last_error_code end
      where analysis_id=a.id returning * into j;
    return jsonb_build_object('schemaVersion','analysis-job-lease/2.0.0','analysisId',a.id,'attempt',j.attempt_count,
      'runAfter',j.run_after,'leaseFence',token,'leaseExpiresAt',expires_at);
  end loop;
  return null;
end;
$$;

create function public.heartbeat_analysis_job_v2(
  p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid,p_lease_seconds integer
)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; j public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_analysis_id is null or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_attempt is null or p_attempt not between 1 and 3 or p_lease_fence is null
    or p_lease_seconds is null or p_lease_seconds<1 or p_lease_seconds>3600 then return false; end if;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or a.status='cancelled' then return false; end if;
  select * into j from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id
    and attempt_count=p_attempt and lease_fence=p_lease_fence for update;
  if not found then return false; end if;
  if not private.analysis_job_v2_owner_eligible(a.id) then return false; end if;
  checked_at:=clock_timestamp();
  if j.dead_lettered_at is not null or j.lease_expires_at is null or j.lease_expires_at<=checked_at then return false; end if;
  update public.analysis_jobs set lease_expires_at=checked_at+make_interval(secs=>p_lease_seconds)
    where analysis_id=p_analysis_id and lease_owner=p_worker_id and attempt_count=p_attempt and lease_fence=p_lease_fence;
  return found;
end;
$$;

create function public.complete_analysis_job_v2(p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; j public.analysis_jobs%rowtype;
begin
  if p_analysis_id is null or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_attempt is null or p_attempt not between 1 and 3 or p_lease_fence is null then return false; end if;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or a.status='cancelled' then return false; end if;
  select * into j from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id
    and attempt_count=p_attempt and lease_fence=p_lease_fence for update;
  if not found then return false; end if;
  if not private.analysis_job_v2_owner_eligible(a.id) then return false; end if;
  if j.dead_lettered_at is not null or j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp() then return false; end if;
  if a.status not in ('completed','partial','failed','rejected') and not private.analysis_job_v2_review_handoff(a.id) then return false; end if;
  delete from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id
    and attempt_count=p_attempt and lease_fence=p_lease_fence;
  return found;
end;
$$;

create function public.release_analysis_job_v2(
  p_analysis_id uuid,p_worker_id text,p_attempt integer,p_lease_fence uuid,p_retry_delay_seconds integer,p_error_code text
)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; j public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_analysis_id is null or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_attempt is null or p_attempt not between 1 and 3 or p_lease_fence is null
    or p_retry_delay_seconds is null or p_retry_delay_seconds<0 or p_retry_delay_seconds>3600
    or p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,64}$' then return false; end if;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found or a.status not in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review','failed') then return false; end if;
  select * into j from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id
    and attempt_count=p_attempt and lease_fence=p_lease_fence for update;
  if not found then return false; end if;
  if not private.analysis_job_v2_owner_eligible(a.id) then return false; end if;
  checked_at:=clock_timestamp();
  if j.dead_lettered_at is not null or j.lease_expires_at is null or j.lease_expires_at<=checked_at
    or private.analysis_job_v2_review_handoff(a.id) then return false; end if;
  if j.attempt_count<3 and a.status<>'failed' then
    update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,
      run_after=checked_at+make_interval(secs=>p_retry_delay_seconds)
      where analysis_id=p_analysis_id and lease_fence=p_lease_fence and attempt_count=p_attempt;
    -- Keep the non-null fence: no legacy worker may adopt this retry row.
    return found;
  end if;
  update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,dead_lettered_at=checked_at
    where analysis_id=p_analysis_id and lease_fence=p_lease_fence and attempt_count=p_attempt;
  if a.status<>'failed' and not public.transition_analysis(a.id,a.status,'failed',null,p_worker_id,coalesce(a.request_id,'worker-dead-letter')) then
    raise exception 'Fenced dead-letter transition failed' using errcode='23514';
  end if;
  return true;
end;
$$;

-- Preserve legacy signatures and NULL-fence row behavior, but never permit a
-- tokenless RPC to claim/sweep/renew/release/delete a v2-protected row.
create or replace function public.claim_analysis_job(p_worker_id text,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; a public.analyses%rowtype; j public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id)='' or p_lease_seconds is null or p_lease_seconds<1 or p_lease_seconds>3600 then
    raise exception 'invalid lease parameters' using errcode='22023';
  end if;
  for candidate in select a.id from public.analyses a join public.analysis_jobs j on j.analysis_id=a.id
    where j.lease_fence is null and j.dead_lettered_at is null and j.attempt_count>=3 and j.lease_expires_at<=clock_timestamp()
      and a.status in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
    order by j.run_after,a.id limit 100 for update of a skip locked
  loop
    select * into a from public.analyses where id=candidate.id;
    select * into j from public.analysis_jobs where analysis_id=a.id and lease_fence is null for update skip locked;
    if not found then continue; end if;
    checked_at:=clock_timestamp();
    if a.status not in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
      or j.dead_lettered_at is not null or j.attempt_count<3 or j.lease_expires_at is null or j.lease_expires_at>checked_at then continue; end if;
    update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',dead_lettered_at=checked_at
      where analysis_id=a.id and lease_fence is null;
    perform public.transition_analysis(a.id,a.status,'failed',null,p_worker_id,coalesce(a.request_id,'worker-dead-letter'));
  end loop;
  for candidate in select a.id from public.analyses a join public.analysis_jobs j on j.analysis_id=a.id
    where j.lease_fence is null and j.run_after<=clock_timestamp() and j.dead_lettered_at is null and j.attempt_count<3
      and (j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp())
    order by j.run_after,a.id limit 100 for update of a skip locked
  loop
    select * into j from public.analysis_jobs where analysis_id=candidate.id and lease_fence is null for update skip locked;
    if not found then continue; end if;
    checked_at:=clock_timestamp();
    if j.dead_lettered_at is not null or j.attempt_count>=3 or j.run_after>checked_at
      or (j.lease_expires_at is not null and j.lease_expires_at>checked_at) then continue; end if;
    update public.analysis_jobs set lease_owner=p_worker_id,lease_expires_at=checked_at+make_interval(secs=>p_lease_seconds),
      attempt_count=attempt_count+1,last_error_code=case when j.lease_expires_at is not null then 'LEASE_EXPIRED' else last_error_code end
      where analysis_id=candidate.id and lease_fence is null returning * into j;
    return jsonb_build_object('analysisId',candidate.id,'attempt',j.attempt_count,'runAfter',j.run_after);
  end loop;
  return null;
end;
$$;

create or replace function public.heartbeat_analysis_job(p_analysis_id uuid,p_worker_id text,p_lease_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or btrim(p_worker_id)='' or p_lease_seconds is null or p_lease_seconds<1 or p_lease_seconds>3600 then return false; end if;
  update public.analysis_jobs set lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    where analysis_id=p_analysis_id and lease_fence is null and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
  return found;
end;
$$;
create or replace function public.complete_analysis_job(p_analysis_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_worker_id is null or btrim(p_worker_id)='' then return false; end if;
  delete from public.analysis_jobs where analysis_id=p_analysis_id and lease_fence is null and lease_owner=p_worker_id and lease_expires_at>clock_timestamp();
  return found;
end;
$$;
create or replace function public.release_analysis_job(p_analysis_id uuid,p_worker_id text,p_retry_delay_seconds integer,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; j public.analysis_jobs%rowtype; checked_at timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id)='' or p_retry_delay_seconds is null or p_retry_delay_seconds<0 or p_retry_delay_seconds>3600
    or p_error_code is null or btrim(p_error_code)='' then return false; end if;
  select * into a from public.analyses where id=p_analysis_id for update;
  if not found then return false; end if;
  select * into j from public.analysis_jobs where analysis_id=p_analysis_id and lease_owner=p_worker_id and lease_fence is null for update;
  if not found then return false; end if;
  checked_at:=clock_timestamp();
  if j.attempt_count<3 then
    update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,
      run_after=checked_at+make_interval(secs=>p_retry_delay_seconds) where analysis_id=p_analysis_id and lease_fence is null;
    return true;
  end if;
  update public.analysis_jobs set lease_owner=null,lease_expires_at=null,last_error_code=p_error_code,dead_lettered_at=checked_at
    where analysis_id=p_analysis_id and lease_fence is null;
  if a.status in ('extracting','needs_ocr','scoring','qualitative_review') then
    perform public.transition_analysis(a.id,a.status,'failed',null,p_worker_id,coalesce(a.request_id,'worker-dead-letter'));
  end if;
  return true;
end;
$$;

revoke all on function private.analysis_job_v2_owner_eligible(uuid),private.analysis_job_v2_review_handoff(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_analysis_job_v2(text,integer),public.heartbeat_analysis_job_v2(uuid,text,integer,uuid,integer),
  public.complete_analysis_job_v2(uuid,text,integer,uuid),public.release_analysis_job_v2(uuid,text,integer,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_analysis_job_v2(text,integer),public.heartbeat_analysis_job_v2(uuid,text,integer,uuid,integer),
  public.complete_analysis_job_v2(uuid,text,integer,uuid),public.release_analysis_job_v2(uuid,text,integer,uuid,integer,text) to service_role;
revoke all on function public.claim_analysis_job(text,integer),public.heartbeat_analysis_job(uuid,text,integer),
  public.complete_analysis_job(uuid,text),public.release_analysis_job(uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_analysis_job(text,integer),public.heartbeat_analysis_job(uuid,text,integer),
  public.complete_analysis_job(uuid,text),public.release_analysis_job(uuid,text,integer,text) to service_role;
