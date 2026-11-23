-- Verify that privacy deletion survives a storage failure after candidate rows
-- have already been removed. It deletes its synthetic account before returning.

do $$
declare
  test_owner_id uuid := '55555555-5555-5555-5555-555555555555';
  test_organization_id uuid;
  test_resume_id uuid := '66666666-6666-6666-6666-666666666666';
  test_version_id uuid := gen_random_uuid();
  test_request_id uuid := '77777777-7777-7777-7777-777777777777';
  first_claim jsonb;
  retry_claim jsonb;
  first_plan jsonb;
  retry_plan jsonb;
  retention_count integer;
begin
  if has_function_privilege(
    'anon',
    'public.persist_partial_analysis(uuid,jsonb,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.persist_partial_analysis(uuid,jsonb,text,text)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.persist_partial_analysis(uuid,jsonb,text,text)',
    'execute'
  ) then
    raise exception 'partial-analysis RPC privileges are not worker-only';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname in (
        'analysis_rate_limit_buckets',
        'privacy_deletion_plans',
        'retention_items'
      )
      and relation.relrowsecurity is not true
  ) then
    raise exception 'private operational tables must have RLS enabled';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', test_owner_id,
    'authenticated', 'authenticated', 'phase7-retry@example.test',
    timezone('utc', now()), '{"provider":"email","providers":["email"]}',
    '{}', timezone('utc', now()), timezone('utc', now())
  );

  select id into strict test_organization_id
  from public.organizations
  where owner_id = test_owner_id;

  insert into public.resumes (id, organization_id, owner_id, display_name)
  values (
    test_resume_id, test_organization_id, test_owner_id, 'phase7-retry.pdf'
  );
  update public.resumes
  set created_at = '2000-01-01T00:00:00Z'
  where id = test_resume_id;

  insert into public.resume_versions (
    id, resume_id, organization_id, owner_id, storage_key, checksum, bytes, media_type
  ) values (
    test_version_id, test_resume_id, test_organization_id, test_owner_id,
    format('organizations/%s/resumes/%s/versions/%s.pdf', test_organization_id, test_resume_id, test_version_id),
    repeat('f', 64), 1024,
    'application/pdf'
  );

  select count(*) into retention_count
  from public.claim_expired_resume_objects(
    '2000-01-02T00:00:00Z'::timestamptz, 10
  );
  if retention_count <> 1
     or (select status from public.resumes where id = test_resume_id) <> 'deleted' then
    raise exception 'retention claim did not return and mark the resume';
  end if;

  insert into public.data_requests (id, organization_id, user_id, kind)
  values (
    test_request_id, test_organization_id, test_owner_id, 'deletion'
  );

  first_claim := public.claim_privacy_request_with_cleanup_credits('phase7-worker-a', 120, 3);
  if first_claim ->> 'id' is distinct from test_request_id::text
     or (first_claim ->> 'attempt')::integer is distinct from 1 then
    raise exception 'privacy deletion request was not claimed';
  end if;

  first_plan := public.prepare_deletion_request(
    test_request_id, 'phase7-worker-a', 1
  );
  if jsonb_array_length(first_plan -> 'storageObjects') <> 1 then
    raise exception 'first deletion plan did not contain the storage object';
  end if;
  if exists (
    select 1 from public.resume_versions where owner_id = test_owner_id
  ) then
    raise exception 'candidate rows were not deleted during preparation';
  end if;
  if not exists (
    select 1 from private.privacy_deletion_plans
    where request_id = test_request_id
  ) then
    raise exception 'deletion plan was not persisted for retry';
  end if;

  if public.fail_privacy_request(
    test_request_id, 'phase7-worker-a', 1, 'STORAGE_DELETE_FAILED', 3
  ) is distinct from true then
    raise exception 'failed deletion attempt was not requeued';
  end if;
  update public.data_requests
  set next_attempt_at = timezone('utc', now())
  where id = test_request_id;

  retry_claim := public.claim_privacy_request_with_cleanup_credits('phase7-worker-b', 120, 3);
  if retry_claim ->> 'id' is distinct from test_request_id::text
     or (retry_claim ->> 'attempt')::integer is distinct from 2 then
    raise exception 'privacy deletion retry was not claimed';
  end if;

  retry_plan := public.prepare_deletion_request(
    test_request_id, 'phase7-worker-b', 2
  );
  if retry_plan -> 'storageObjects' <> first_plan -> 'storageObjects' then
    raise exception 'privacy deletion retry lost its storage plan';
  end if;

  if public.complete_privacy_request(
    test_request_id, 'phase7-worker-b', 2, '{"deleted":true}'::jsonb
  ) is distinct from true then
    raise exception 'privacy deletion request did not complete';
  end if;
  if exists (
    select 1 from private.privacy_deletion_plans
    where request_id = test_request_id
  ) then
    raise exception 'completed deletion plan was not removed';
  end if;

  delete from auth.users where id = test_owner_id;
end;
$$;
