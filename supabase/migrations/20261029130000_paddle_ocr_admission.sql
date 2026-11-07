-- Hosted PaddleOCR admission ledger. Forward-only and default-off: no upload,
-- worker, scoring or UI path calls these RPCs yet. The service-only functions
-- bind owner/source, consume a per-owner page/byte window and append immutable
-- attempt receipts. An interrupted submission therefore remains visible and
-- cannot be automatically resubmitted.
create table public.paddle_ocr_admissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  source_id uuid not null references public.resume_versions (id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  upload_bytes bigint not null check (upload_bytes between 1 and 104857600),
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, source_id, source_sha256)
);

create table public.paddle_ocr_admission_pages (
  admission_id uuid not null references public.paddle_ocr_admissions (id) on delete cascade,
  page_number integer not null check (page_number between 1 and 20),
  primary key (admission_id, page_number)
);

create table public.paddle_ocr_attempt_events (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null,
  page_number integer not null,
  state text not null check (state in ('submit_started', 'acknowledged', 'completed')),
  job_id text check (
    job_id is null
    or (
      char_length(job_id) between 1 and 256
      and job_id = btrim(job_id)
      and job_id !~ '[\r\n]'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (admission_id, page_number)
    references public.paddle_ocr_admission_pages (admission_id, page_number)
    on delete cascade,
  unique (admission_id, page_number, state),
  check (
    (state = 'submit_started' and job_id is null)
    or (state in ('acknowledged', 'completed') and job_id is not null)
  )
);

create index paddle_ocr_admissions_owner_idx
  on public.paddle_ocr_admissions (owner_id);
create index paddle_ocr_admissions_org_idx
  on public.paddle_ocr_admissions (organization_id);
create index paddle_ocr_admissions_source_idx
  on public.paddle_ocr_admissions (source_id);
create index paddle_ocr_attempt_events_admission_idx
  on public.paddle_ocr_attempt_events (admission_id);

create table private.paddle_ocr_budget_buckets (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  page_count integer not null check (page_count >= 0),
  upload_bytes bigint not null check (upload_bytes >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);
revoke all on private.paddle_ocr_budget_buckets from public, anon, authenticated;

alter table public.paddle_ocr_admissions enable row level security;
alter table public.paddle_ocr_admission_pages enable row level security;
alter table public.paddle_ocr_attempt_events enable row level security;
revoke all on public.paddle_ocr_admissions, public.paddle_ocr_admission_pages,
  public.paddle_ocr_attempt_events from public, anon, authenticated;
grant select on public.paddle_ocr_admissions, public.paddle_ocr_admission_pages,
  public.paddle_ocr_attempt_events to authenticated;
grant select on public.paddle_ocr_admissions, public.paddle_ocr_admission_pages,
  public.paddle_ocr_attempt_events to service_role;

create policy "owners read paddle admissions" on public.paddle_ocr_admissions
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "owners read paddle admission pages" on public.paddle_ocr_admission_pages
  for select to authenticated
  using (exists (
    select 1 from public.paddle_ocr_admissions admission
    where admission.id = paddle_ocr_admission_pages.admission_id
      and admission.owner_id = (select auth.uid())
  ));
create policy "owners read paddle attempt events" on public.paddle_ocr_attempt_events
  for select to authenticated
  using (exists (
    select 1 from public.paddle_ocr_admissions admission
    where admission.id = paddle_ocr_attempt_events.admission_id
      and admission.owner_id = (select auth.uid())
  ));

create function public.admit_paddle_ocr(
  p_owner_id uuid,
  p_analysis_id uuid,
  p_source_id uuid,
  p_source_sha256 text,
  p_page_numbers integer[],
  p_upload_bytes bigint,
  p_max_pages integer,
  p_max_upload_bytes bigint,
  p_window_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := pg_catalog.clock_timestamp();
  analysis_organization_id uuid;
  analysis_source_id uuid;
  version_organization_id uuid;
  version_checksum text;
  version_bytes integer;
  version_page_count integer;
  admission_id uuid;
  bucket_pages integer;
  bucket_bytes bigint;
begin
  if p_owner_id is null or p_analysis_id is null or p_source_id is null
     or p_source_sha256 is null
     or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_page_numbers is null
     or pg_catalog.cardinality(p_page_numbers) not between 1 and 10
     or p_upload_bytes is null
     or p_upload_bytes < 1
     or p_upload_bytes > 104857600
     or p_max_pages is null or p_max_pages < 1 or p_max_pages > 1000
     or p_max_upload_bytes is null or p_max_upload_bytes < 1
     or p_max_upload_bytes > 107374182400
     or p_window_seconds is null or p_window_seconds < 60
     or p_window_seconds > 604800 then
    return null;
  end if;
  if exists (
    select 1 from unnest(p_page_numbers) as pages(page_number)
    where page_number is null or page_number < 1 or page_number > 20
  ) or (
    select count(distinct page_number)
    from unnest(p_page_numbers) as pages(page_number)
  ) <> pg_catalog.cardinality(p_page_numbers) then
    return null;
  end if;

  select analysis.organization_id, analysis.resume_version_id
    into analysis_organization_id, analysis_source_id
  from public.analyses analysis
  where analysis.id = p_analysis_id
    and analysis.owner_id = p_owner_id;
  if not found then return null; end if;

  select version.organization_id, version.checksum, version.bytes,
    version.page_count
    into version_organization_id, version_checksum, version_bytes,
      version_page_count
  from public.resume_versions version
  where version.id = p_source_id
    and version.owner_id = p_owner_id
    and version.id = analysis_source_id;
  if not found
     or version_organization_id is distinct from analysis_organization_id
     or version_checksum is distinct from p_source_sha256
     or p_upload_bytes <> version_bytes::bigint * pg_catalog.cardinality(p_page_numbers)
     or (
       version_page_count is not null
       and exists (
         select 1 from unnest(p_page_numbers) as pages(page_number)
         where page_number > version_page_count
       )
     ) then
    return null;
  end if;

  insert into public.paddle_ocr_admissions (
    organization_id, owner_id, analysis_id, source_id, source_sha256,
    upload_bytes
  )
  values (
    analysis_organization_id, p_owner_id, p_analysis_id, p_source_id,
    p_source_sha256, p_upload_bytes
  )
  on conflict (analysis_id, source_id, source_sha256) do nothing
  returning id into admission_id;
  if admission_id is null then return null; end if;

  insert into public.paddle_ocr_admission_pages (admission_id, page_number)
  select admission_id, page_number
  from unnest(p_page_numbers) as pages(page_number);

  insert into private.paddle_ocr_budget_buckets as bucket (
    owner_id, window_started_at, page_count, upload_bytes, updated_at
  )
  values (
    p_owner_id, now_at, pg_catalog.cardinality(p_page_numbers),
    p_upload_bytes, now_at
  )
  on conflict (owner_id) do update
  set window_started_at = case
        when bucket.window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds) <= now_at
        then now_at
        else bucket.window_started_at
      end,
      page_count = case
        when bucket.window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds) <= now_at
        then pg_catalog.cardinality(p_page_numbers)
        else bucket.page_count + pg_catalog.cardinality(p_page_numbers)
      end,
      upload_bytes = case
        when bucket.window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds) <= now_at
        then p_upload_bytes
        else bucket.upload_bytes + p_upload_bytes
      end,
      updated_at = now_at
  returning page_count, upload_bytes into bucket_pages, bucket_bytes;

  if bucket_pages > p_max_pages or bucket_bytes > p_max_upload_bytes then
    raise exception 'PaddleOCR admission budget exceeded' using errcode = 'P0001';
  end if;
  return admission_id;
exception
  when sqlstate 'P0001' then
    return null;
end;
$$;

create function public.record_paddle_ocr_attempt(
  p_admission_id uuid,
  p_page_number integer,
  p_state text,
  p_job_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_admission_id is null or p_page_number is null or p_state is null then
    return false;
  end if;
  if not exists (
    select 1 from public.paddle_ocr_admission_pages page
    where page.admission_id = p_admission_id
      and page.page_number = p_page_number
  ) then
    return false;
  end if;

  if p_state = 'submit_started' then
    if p_job_id is not null then return false; end if;
    if exists (
      select 1 from public.paddle_ocr_attempt_events event
      where event.admission_id = p_admission_id
        and event.page_number = p_page_number
    ) then
      return false;
    end if;
  elsif p_state = 'acknowledged' then
    if p_job_id is null
       or char_length(p_job_id) not between 1 and 256
       or p_job_id <> btrim(p_job_id)
       or p_job_id ~ '[\r\n]' then
      return false;
    end if;
    if not exists (
      select 1 from public.paddle_ocr_attempt_events event
      where event.admission_id = p_admission_id
        and event.page_number = p_page_number
        and event.state = 'submit_started'
    ) or exists (
      select 1 from public.paddle_ocr_attempt_events event
      where event.admission_id = p_admission_id
        and event.page_number = p_page_number
        and event.state in ('acknowledged', 'completed')
    ) then
      return false;
    end if;
  elsif p_state = 'completed' then
    if p_job_id is null
       or char_length(p_job_id) not between 1 and 256
       or p_job_id <> btrim(p_job_id)
       or p_job_id ~ '[\r\n]' then
      return false;
    end if;
    if not exists (
      select 1 from public.paddle_ocr_attempt_events event
      where event.admission_id = p_admission_id
        and event.page_number = p_page_number
        and event.state = 'acknowledged'
        and event.job_id = p_job_id
    ) or exists (
      select 1 from public.paddle_ocr_attempt_events event
      where event.admission_id = p_admission_id
        and event.page_number = p_page_number
        and event.state = 'completed'
    ) then
      return false;
    end if;
  else
    return false;
  end if;

  insert into public.paddle_ocr_attempt_events (
    admission_id, page_number, state, job_id
  )
  values (p_admission_id, p_page_number, p_state, p_job_id)
  on conflict (admission_id, page_number, state) do nothing;
  return found;
end;
$$;

revoke all on function public.admit_paddle_ocr(
  uuid, uuid, uuid, text, integer[], bigint, integer, bigint, integer
) from public, anon, authenticated;
revoke all on function public.record_paddle_ocr_attempt(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admit_paddle_ocr(
  uuid, uuid, uuid, text, integer[], bigint, integer, bigint, integer
) to service_role;
grant execute on function public.record_paddle_ocr_attempt(uuid, integer, text, text)
  to service_role;
