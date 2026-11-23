-- A single anonymous transaction verifies the local Phase 4 and T052
-- PostgreSQL contracts and deletes its synthetic data before it returns.

do $$
declare
  owner_id uuid := '11111111-1111-1111-1111-111111111111';
  organization_id uuid := '22222222-2222-2222-2222-222222222222';
  resume_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  version_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  job_id uuid := 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
  test_analysis_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd1';
  partial_analysis_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd2';
  scored_analysis_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd5';
  cancellable_analysis_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd3';
  started_analysis_id uuid := 'dddddddd-dddd-dddd-dddd-ddddddddddd4';
  claimed jsonb;
  cancellation text;
  persisted boolean;
begin
  insert into public.resumes (id, organization_id, owner_id, display_name)
  values (resume_id, organization_id, owner_id, 'phase4-test.pdf');
  insert into public.resume_versions (
    id, resume_id, organization_id, owner_id, storage_key, checksum, bytes, media_type
  ) values (
    version_id, resume_id, organization_id, owner_id,
    format('organizations/%s/resumes/%s/versions/%s.pdf', organization_id, resume_id, version_id),
    repeat('a', 64), 1024, 'application/pdf'
  );
  insert into public.jobs (id, organization_id, owner_id, title, description)
  values (job_id, organization_id, owner_id, 'Engineer', 'Build reliable systems');

  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status, idempotency_key
  ) values (
    test_analysis_id, version_id, job_id, organization_id, owner_id, 'quarantined',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'
  );
  insert into public.analysis_jobs (analysis_id) values (test_analysis_id);

  claimed := public.claim_analysis_job('phase4-worker-a', 120);
  if claimed ->> 'analysisId' <> test_analysis_id::text or (claimed ->> 'attempt')::integer <> 1 then
    raise exception 'first job claim was not atomic or did not record attempt one';
  end if;
  if public.heartbeat_analysis_job(test_analysis_id, 'phase4-worker-a', 120) is distinct from true then
    raise exception 'lease heartbeat was not accepted for the owner';
  end if;
  if public.claim_analysis_job('phase4-worker-b', 120) is not null then
    raise exception 'a second worker claimed an active lease';
  end if;

  update public.analysis_jobs
  set lease_expires_at = timezone('utc', now()) - interval '1 second'
  where analysis_id = test_analysis_id;
  claimed := public.claim_analysis_job('phase4-worker-b', 120);
  if claimed ->> 'analysisId' <> test_analysis_id::text or (claimed ->> 'attempt')::integer <> 2 then
    raise exception 'expired lease was not reclaimed exactly once';
  end if;

  update public.analyses set status = 'extracting' where id = test_analysis_id;
  update public.analysis_jobs
  set attempt_count = 3,
      lease_expires_at = timezone('utc', now()) - interval '1 second'
  where analysis_id = test_analysis_id;
  if public.claim_analysis_job('phase4-worker-c', 120) is not null then
    raise exception 'final expired lease was claimed instead of dead-lettered';
  end if;
  if (select status from public.analyses where id = test_analysis_id) <> 'failed' then
    raise exception 'final expired lease did not fail its analysis';
  end if;
  if (select dead_lettered_at is not null from public.analysis_jobs where analysis_id = test_analysis_id) is not true then
    raise exception 'final expired lease was not dead-lettered';
  end if;

  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status, idempotency_key
  ) values (
    partial_analysis_id, version_id, job_id, organization_id, owner_id,
    'qualitative_review', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
  );
  insert into public.analysis_deterministic_results (
    analysis_id, organization_id, owner_id, score, parse_view, rule_trace,
    keyword_coverage, input_text_checksum, result_checksum, parser_version,
    ruleset_version, normalizer_version, taxonomy_version
  ) values (
    partial_analysis_id, organization_id, owner_id, 74, '{}'::jsonb, '[]'::jsonb,
    '{"taxonomyVersion":"skills-taxonomy-v1"}'::jsonb,
    repeat('b', 64), repeat('c', 64), 'parser-test', 'rules-test',
    'normalizer-test', 'skills-taxonomy-v1'
  );
  persisted := public.persist_partial_analysis(
    partial_analysis_id,
    '{"overallScore":74,"ATS":{"score":74,"tips":[{"type":"good","tip":"Email found"},{"type":"good","tip":"Dates found"},{"type":"improve","tip":"Skills missing"}]},"toneAndStyle":{"score":0,"tips":[{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"}]},"content":{"score":0,"tips":[{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"}]},"structure":{"score":0,"tips":[{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"}]},"skills":{"score":0,"tips":[{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"},{"type":"improve","tip":"Unavailable","explanation":"Retry later"}]}}'::jsonb,
    'phase4-worker-c', 'phase4-test'
  );
  if persisted is not true
     or (select status from public.analyses where id = partial_analysis_id) <> 'partial'
     or not exists (select 1 from public.analysis_results where analysis_id = partial_analysis_id)
     or (select taxonomy_version from public.analysis_results where analysis_id = partial_analysis_id) <> 'skills-taxonomy-v1'
     or not exists (select 1 from public.writer_drafts where analysis_id = partial_analysis_id and kind = 'summary') then
    raise exception 'partial result was not persisted atomically';
  end if;

  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status, idempotency_key
  ) values (
    scored_analysis_id, version_id, job_id, organization_id, owner_id, 'scoring',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5'
  );
  persisted := public.persist_deterministic_analysis(
    scored_analysis_id,
    repeat('d', 64),
    '{"taxonomyVersion":"skills-taxonomy-v1","job":["AWS"],"matched":["AWS"],"missing":[],"evidence":[]}'::jsonb,
    'normalizer-test', '{}'::jsonb, 'parser-test', 'phase5-worker',
    'phase5-test', repeat('e', 64), '[]'::jsonb, 'rules-test', 80,
    'skills-taxonomy-v1'
  );
  if persisted is not true
     or (select taxonomy_version from public.analysis_deterministic_results where analysis_id = scored_analysis_id) <> 'skills-taxonomy-v1'
     or (select status from public.analyses where id = scored_analysis_id) <> 'qualitative_review' then
    raise exception 'versioned taxonomy provenance was not persisted atomically';
  end if;

  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status, idempotency_key
  ) values (
    cancellable_analysis_id, version_id, job_id, organization_id, owner_id, 'queued',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3'
  );
  insert into public.analysis_jobs (analysis_id) values (cancellable_analysis_id);
  cancellation := public.cancel_analysis(cancellable_analysis_id, owner_id, 'phase4-test');
  if cancellation <> 'cancelled'
     or exists (select 1 from public.analysis_jobs where analysis_id = cancellable_analysis_id)
     or public.cancel_analysis(cancellable_analysis_id, owner_id, 'phase4-test') <> 'already_cancelled' then
    raise exception 'queued cancellation was not idempotent';
  end if;

  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status, idempotency_key
  ) values (
    started_analysis_id, version_id, job_id, organization_id, owner_id, 'extracting',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4'
  );
  if public.cancel_analysis(started_analysis_id, owner_id, 'phase4-test') <> 'already_started' then
    raise exception 'in-flight cancellation was not explicitly rejected';
  end if;

  delete from public.analyses
  where id in (test_analysis_id, partial_analysis_id, scored_analysis_id, cancellable_analysis_id, started_analysis_id);
  delete from public.jobs where id = job_id;
  delete from public.resume_versions where id = version_id;
  delete from public.resumes where id = resume_id;
end;
$$;
