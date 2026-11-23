-- Run on a disposable database with no jobs, after applying all migrations.
begin;

do $verify$
<<fixture>>
declare
  owner_id uuid := gen_random_uuid();
  org_id uuid;
  resume_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  analysis_id uuid := gen_random_uuid();
  claimed jsonb;
  observed_at timestamptz;
  signature text;
begin
  foreach signature in array array[
    'public.claim_analysis_job_observed(text,integer,boolean)',
    'public.read_owned_analysis_queue_observation(uuid,uuid)'
  ] loop
    assert has_function_privilege('service_role', signature, 'EXECUTE');
    assert not has_function_privilege('anon', signature, 'EXECUTE');
    assert not has_function_privilege('authenticated', signature, 'EXECUTE');
  end loop;
  assert not has_table_privilege('service_role', 'private.analysis_queue_observation', 'SELECT');

  insert into auth.users (id, email) values (owner_id, owner_id || '@example.test');
  select o.id into strict org_id from public.organizations o where o.owner_id = fixture.owner_id;
  insert into public.resumes (id, organization_id, owner_id, display_name)
  values (resume_id, org_id, owner_id, 'Synthetic resume');
  insert into public.resume_versions
    (id, resume_id, organization_id, owner_id, storage_key, checksum, bytes, media_type)
  values (
    version_id, resume_id, org_id, owner_id,
    format('organizations/%s/resumes/%s/versions/%s.pdf', org_id, resume_id, version_id),
    repeat('a', 64), 1, 'application/pdf'
  );
  insert into public.analyses (id, resume_version_id, organization_id, owner_id, status, idempotency_key)
  values (analysis_id, version_id, org_id, owner_id, 'queued', gen_random_uuid());

  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'no_recent_check';
  assert public.read_owned_analysis_queue_observation(analysis_id, gen_random_uuid()) = 'not_found';

  begin
    perform public.claim_analysis_job_observed('synthetic-worker', 0, true);
    raise exception 'Invalid claim unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'no_recent_check';

  assert public.claim_analysis_job_observed('synthetic-worker', 120, false) is null;
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'recent_check';
  select last_checked_at into observed_at from private.analysis_queue_observation;
  assert public.claim_analysis_job_observed('synthetic-worker', 120, true) is null;
  assert (select last_checked_at = observed_at from private.analysis_queue_observation);

  update private.analysis_queue_observation set last_checked_at = clock_timestamp() - interval '2 minutes';
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'no_recent_check';
  update private.analysis_queue_observation set last_checked_at = clock_timestamp() + interval '2 minutes';
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'no_recent_check';

  insert into public.analysis_jobs (analysis_id) values (analysis_id);
  claimed := public.claim_analysis_job_observed('synthetic-worker', 120, false);
  assert claimed->>'analysisId' = analysis_id::text and claimed->>'attempt' = '1';
  assert not (claimed ? 'leaseFence');
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'recent_check';

  update public.analysis_jobs j set lease_expires_at = clock_timestamp() - interval '1 second'
  where j.analysis_id = fixture.analysis_id;
  claimed := public.claim_analysis_job_observed('synthetic-worker', 120, true);
  assert claimed->>'analysisId' = analysis_id::text and claimed->>'attempt' = '2';
  assert claimed->>'schemaVersion' = 'analysis-job-lease/2.0.0';
  assert (select j.lease_fence::text = claimed->>'leaseFence'
    from public.analysis_jobs j where j.analysis_id = fixture.analysis_id);

  update public.analyses a set status = 'extracting' where a.id = analysis_id;
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'not_waiting';
  begin
    update public.resumes r set status = 'deleted' where r.id = resume_id;
    assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'not_found';
    raise exception 'Undo fixture retirement' using errcode = 'RV001';
  exception when sqlstate 'RV001' then null;
  end;
  begin
    insert into public.data_requests (organization_id, user_id, kind)
    values (org_id, owner_id, 'deletion');
    assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'not_found';
    raise exception 'Undo fixture deletion request' using errcode = 'RV001';
  exception when sqlstate 'RV001' then null;
  end;

  delete from public.memberships m where m.organization_id = org_id and m.user_id = owner_id;
  assert public.read_owned_analysis_queue_observation(analysis_id, owner_id) = 'not_found';
end;
$verify$;

rollback;

select 'queue observation verified' as result;
