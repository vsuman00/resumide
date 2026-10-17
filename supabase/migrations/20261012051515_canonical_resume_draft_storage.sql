-- AA020 storage foundation only. No application import/write endpoint yet.
-- Accepted facts stay unavailable until the grounding/confirmation services
-- are implemented. The existing resumes row is the canonical aggregate root.
create table public.canonical_resume_versions (
  id uuid primary key,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  source_resume_version_id uuid not null references public.resume_versions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_version text not null default 'canonical-resume/1.0.0'
    check (schema_version = 'canonical-resume/1.0.0'),
  locale text not null check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  state text not null check (state in ('draft','review_required')),
  -- Ordered sections/entries/bullets are validated by the draft contract at
  -- the later transactional repository boundary. This is not a trust grant.
  content jsonb not null check (jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 1048576),
  created_at timestamptz not null default now(),
  unique (id,organization_id,owner_id)
);
create table public.resume_facts (
  canonical_version_id uuid not null,
  id uuid not null,
  organization_id uuid not null,
  owner_id uuid not null,
  type text not null check (type in ('name','email','phone','employer','role',
    'dates','education','certification','skill','contribution','metric','link','location')),
  value text not null check (value = btrim(value) and char_length(value) between 1 and 2000),
  -- Fail closed: this foundation may retain unconfirmed content, but cannot
  -- store invented source support or a supplied candidate confirmation.
  state text not null default 'unconfirmed' check (state = 'unconfirmed'),
  sources jsonb not null default '[]'::jsonb check (sources = '[]'::jsonb),
  confirmation jsonb check (confirmation is null),
  primary key (canonical_version_id,id),
  foreign key (canonical_version_id,organization_id,owner_id)
    references public.canonical_resume_versions(id,organization_id,owner_id) on delete cascade
);
create index canonical_resume_owner_idx on public.canonical_resume_versions(owner_id);
create index canonical_resume_org_idx on public.canonical_resume_versions(organization_id);
create index canonical_resume_root_idx on public.canonical_resume_versions(resume_id);
create index canonical_resume_source_idx on public.canonical_resume_versions(source_resume_version_id);
create index resume_facts_tenant_idx on public.resume_facts(organization_id,owner_id);

create function private.validate_canonical_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Locks serialize new versions with source/root deletion or access removal.
  perform 1 from public.resumes r join public.resume_versions v on v.resume_id = r.id
    where r.id = new.resume_id and r.status = 'active'
      and r.owner_id = new.owner_id and r.organization_id = new.organization_id
      and v.id = new.source_resume_version_id
      and v.owner_id = new.owner_id and v.organization_id = new.organization_id
    for share of r,v;
  if not found then
    raise exception 'Canonical source ownership mismatch' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_canonical_source() from public,anon,authenticated;
create trigger canonical_source_owner before insert on public.canonical_resume_versions
  for each row execute function private.validate_canonical_source();
create function private.reject_canonical_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Canonical versions and facts are immutable' using errcode = '22023';
end;
$$;
revoke all on function private.reject_canonical_update() from public,anon,authenticated;
create trigger canonical_version_immutable before update on public.canonical_resume_versions
  for each row execute function private.reject_canonical_update();
create trigger canonical_fact_immutable before update on public.resume_facts
  for each row execute function private.reject_canonical_update();

alter table public.canonical_resume_versions enable row level security;
alter table public.resume_facts enable row level security;
revoke all on public.canonical_resume_versions,public.resume_facts
  from public,anon,authenticated,service_role;
grant select on public.canonical_resume_versions,public.resume_facts to authenticated;
-- Service writes stay revoked until an atomic validated repository exists.
-- Read/delete support is sufficient for privacy cleanup and later exports.
grant select,delete on public.canonical_resume_versions,public.resume_facts to service_role;
create policy "owners read active canonical versions" on public.canonical_resume_versions
  for select to authenticated using ((select auth.uid()) = owner_id
    and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.resumes r where r.id = resume_id and r.status = 'active'));
create policy "owners read active canonical facts" on public.resume_facts
  for select to authenticated using ((select auth.uid()) = owner_id
    and exists(select 1 from public.canonical_resume_versions v where v.id = canonical_version_id));
