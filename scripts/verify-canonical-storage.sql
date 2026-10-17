-- AA020a synthetic local SQL checks. All fixtures roll back.
do $$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  org_id uuid; root_id uuid := gen_random_uuid(); source_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid(); fact_id uuid := gen_random_uuid();
  rejected boolean; case_number integer;
begin
  begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','aa020-'||owner_id||'@example.test',
      '{"provider":"email","providers":["email"]}','{}'),
    (other_id,'authenticated','authenticated','aa020-'||other_id||'@example.test',
      '{"provider":"email","providers":["email"]}','{}');
  select id into strict org_id from public.organizations o where o.owner_id = owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name)
    values(root_id,org_id,owner_id,'Synthetic canonical draft');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'aa020/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content)
    values(version_id,root_id,source_id,org_id,owner_id,'en-IN','review_required','{"sections":[],"contactFactIds":[]}');
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value)
    values(version_id,fact_id,org_id,owner_id,'name','Synthetic Person');
  -- Wrong owner/root/source, unsupported state, wrong locale and oversize data.
  for case_number in 1..6 loop
    rejected := false;
    begin
      insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content)
        values(gen_random_uuid(),case when case_number = 2 then gen_random_uuid() else root_id end,
          case when case_number = 3 then gen_random_uuid() else source_id end,org_id,
          case when case_number = 1 then other_id else owner_id end,
          case when case_number = 5 then 'invalid-locale' else 'en-IN' end,
          case when case_number = 4 then 'verified' else 'draft' end,
          case when case_number = 6 then jsonb_build_object('text',repeat('x',1048576))
            else '{}'::jsonb end);
    exception when check_violation or foreign_key_violation or sqlstate '22023' then rejected := true;
    end;
    if not rejected then raise exception 'Invalid canonical version accepted: %',case_number; end if;
  end loop;
  -- A fact must resolve its exact tenant version; support cannot be fabricated.
  for case_number in 1..4 loop
    rejected := false;
    begin
      insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value,state,sources,confirmation)
        values(version_id,gen_random_uuid(),org_id,case when case_number = 1 then other_id else owner_id end,
          'name','Synthetic Person',case when case_number = 2 then 'source_supported' else 'unconfirmed' end,
          case when case_number = 3 then '[{"spanId":"fake"}]'::jsonb else '[]'::jsonb end,
          case when case_number = 4 then '{"actorId":"fake"}'::jsonb else null end);
    exception when check_violation or foreign_key_violation then rejected := true;
    end;
    if not rejected then raise exception 'Invalid canonical fact accepted: %',case_number; end if;
  end loop;
  rejected := false;
  begin update public.canonical_resume_versions set locale = 'en-US' where id = version_id;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'Version mutation allowed'; end if;
  rejected := false;
  begin update public.resume_facts set value = 'Changed Person' where canonical_version_id = version_id;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'Fact mutation allowed'; end if;
  if has_table_privilege('anon','public.canonical_resume_versions','SELECT')
    or has_table_privilege('anon','public.resume_facts','SELECT') then
    raise exception 'Anonymous canonical access allowed'; end if;
  for case_number in 1..2 loop
    if has_table_privilege('authenticated',case when case_number=1 then 'public.canonical_resume_versions' else 'public.resume_facts' end,'INSERT,UPDATE,DELETE')
      or has_table_privilege('service_role',case when case_number=1 then 'public.canonical_resume_versions' else 'public.resume_facts' end,'INSERT,UPDATE') then
      raise exception 'Unvalidated canonical write grant found'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.canonical_resume_versions where id=version_id) <> 1
    or (select count(*) from public.resume_facts where canonical_version_id=version_id) <> 1 then
    raise exception 'Owner canonical read failed'; end if;
  execute 'reset role';
  -- Even an organization viewer must not see another candidate's canonical PII.
  insert into public.memberships(organization_id,user_id,role)
    values(org_id,other_id,'viewer');
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.canonical_resume_versions where id=version_id)
    or exists(select 1 from public.resume_facts where canonical_version_id=version_id) then
    raise exception 'Cross-owner canonical content exposed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.resumes set status='deleted' where id=root_id;
  execute 'set local role authenticated';
  if exists(select 1 from public.canonical_resume_versions where id=version_id)
    or exists(select 1 from public.resume_facts where canonical_version_id=version_id) then
    raise exception 'Soft-deleted canonical content exposed'; end if;
  execute 'reset role';
  delete from public.resume_versions where id=source_id;
  if exists(select 1 from public.canonical_resume_versions where id=version_id)
    or exists(select 1 from public.resume_facts where canonical_version_id=version_id) then
    raise exception 'Canonical rows survived source deletion'; end if;
  -- Hard resume cleanup and account deletion also remove every derived row.
  update public.resumes set status='active' where id=root_id;
  for case_number in 1..2 loop
    if case_number=2 then
      insert into public.resumes(id,organization_id,owner_id,display_name)
        values(root_id,org_id,owner_id,'Synthetic canonical draft');
    end if;
    insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
      values(source_id,root_id,org_id,owner_id,'aa020/'||source_id,repeat('a',64),1024,'application/pdf');
    insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content)
      values(version_id,root_id,source_id,org_id,owner_id,'en-IN','draft','{}');
    insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value)
      values(version_id,fact_id,org_id,owner_id,'name','Synthetic Person');
    if case_number=1 then delete from public.resumes where id=root_id;
    else delete from auth.users where id=owner_id; end if;
    if exists(select 1 from public.canonical_resume_versions where id=version_id)
      or exists(select 1 from public.resume_facts where canonical_version_id=version_id) then
      raise exception 'Canonical rows survived root/account deletion'; end if;
  end loop;
  raise exception 'AA020 fixture rollback' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then
    raise notice 'AA020a canonical storage: ownership, immutable drafts, unsupported-fact rejection, grants, RLS and source/root/account cascade passed; fixtures rolled back';
  end;
end;
$$;
