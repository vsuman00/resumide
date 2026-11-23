-- Run after migrations on local or hosted Supabase. One statement for the CLI's
-- prepared-query protocol; the nested subtransaction rolls back fixtures.
do $$
#variable_conflict use_variable
declare
  analysis_id uuid := gen_random_uuid();
  resume_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  organization_id uuid;
  graph jsonb := '{
    "schemaVersion":"native-evidence-v1", "extractorVersion":"unpdf-v1", "offsetUnit":"unicode_code_point",
    "pages":[{"id":"page-1","pageNumber":1,"text":"alex@example.test","method":"native_text","confidence":"uncalibrated"}],
    "spans":[{"id":"page-1-line-1","pageId":"page-1","start":0,"end":17,"text":"alex@example.test"}],
    "assertions":[
      {"field":"name","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null},
      {"field":"email","value":"alex@example.test","state":"review_required","confidence":"uncalibrated","evidence":{"spanId":"page-1-line-1","start":0,"end":17}},
      {"field":"phone","value":null,"state":"not_evaluated","confidence":"uncalibrated","evidence":null}
    ]
  }';
  bad_graph jsonb;
  layout jsonb := '{"schemaVersion":"native-layout-v1","pages":[{
    "pageId":"page-1","pageNumber":1,"text":"alex@example.test","width":612,"height":792,"rotation":0,
    "coordinateSystem":"normalized_top_left","readingOrder":"pdf_source_order","state":"uncalibrated","warnings":[],
    "blocks":[{"id":"page-1-run-1","pageId":"page-1","text":"alex@example.test","start":0,"end":17,"sourceOrder":0,
      "box":{"x":0.1,"y":0.1,"width":0.3,"height":0.02},"geometry":"approximate_font_em"}]
  }]}';
  bad_layout jsonb;
  test_case integer;
  persisted boolean;
  saved public.analysis_extractions%rowtype;
begin
  begin
  -- The existing Auth trigger creates an isolated personal workspace. All
  -- fixture rows, including this user, roll back in the subtransaction below.
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    values (owner_id, 'authenticated', 'authenticated',
      'aa010-' || owner_id::text || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}');
  select o.id into strict organization_id from public.organizations o where o.owner_id = owner_id;
  insert into public.resumes (id, organization_id, owner_id, display_name)
    values (resume_id, organization_id, owner_id, 'aa010-synthetic.pdf');
  insert into public.resume_versions (id, resume_id, organization_id, owner_id, storage_key, checksum, bytes, media_type)
    values (version_id, resume_id, organization_id, owner_id,
      format('organizations/%s/resumes/%s/versions/%s.pdf', organization_id, resume_id, version_id),
      repeat('a', 64), 1024, 'application/pdf');
  insert into public.analyses (id, resume_version_id, organization_id, owner_id, status, idempotency_key)
    values (analysis_id, version_id, organization_id, owner_id, 'extracting', gen_random_uuid());

  -- Tampered assertion must fail before either the extraction or transition.
  bad_graph := jsonb_set(graph, '{assertions,1,value}', '"fabricated@example.test"');
  begin
    perform public.persist_analysis_extraction(analysis_id, 1, 'alex@example.test', 'unpdf-v1', 1,
      '["alex@example.test"]', 'aa010-worker', 'aa010-test', repeat('b', 64), '[]', bad_graph);
    raise exception 'Tampered evidence accepted' using errcode = 'XX000';
  exception when raise_exception then
    if SQLERRM <> 'Native assertion is not grounded' then raise; end if;
  end;
  if exists (select 1 from public.analysis_extractions e where e.analysis_id = analysis_id)
     or (select a.status from public.analyses a where a.id = analysis_id) <> 'extracting' then
    raise exception 'Rejected evidence mutated extraction state';
  end if;

  for test_case in 1..6 loop
    bad_layout := case test_case
      when 1 then jsonb_set(layout, '{pages,0,blocks,0,text}', '"fabricated"')
      when 2 then jsonb_set(layout, '{pages,0,blocks,0,start}', '-1')
      when 3 then jsonb_set(layout, '{pages,0,blocks,0,box,width}', '-0.1')
      when 4 then jsonb_set(layout, '{pages,0,blocks,0,box}', 'null')
      when 5 then jsonb_set(layout, '{pages,0,pageId}', '"page-2"')
      when 6 then jsonb_set(layout, '{pages,0,blocks,0,end}', '16') end;
    begin
      perform public.persist_native_layout_extraction(analysis_id, 1, 'alex@example.test', 'unpdf-v1', 1,
        '["alex@example.test"]', 'aa011-worker', 'aa011-test', repeat('b', 64), '[]', graph, bad_layout);
      raise exception 'Tampered layout accepted' using errcode = 'XX000';
    exception when raise_exception then null;
    end;
  end loop;
  if exists (select 1 from public.analysis_extractions e where e.analysis_id = analysis_id)
     or (select a.status from public.analyses a where a.id = analysis_id) <> 'extracting' then
    raise exception 'Rejected layout mutated extraction state';
  end if;
  persisted := public.persist_native_layout_extraction(analysis_id, 1, 'alex@example.test', 'unpdf-v1', 1,
    '["alex@example.test"]', 'aa011-worker', 'aa011-test', repeat('b', 64), '[]', graph, layout);
  select * into saved from public.analysis_extractions e where e.analysis_id = analysis_id;
  if persisted is not true or saved.evidence_graph is distinct from graph
     or saved.native_layout is distinct from layout
     or saved.owner_id is distinct from owner_id or saved.organization_id is distinct from organization_id
     or (select a.status from public.analyses a where a.id = analysis_id) <> 'scoring' then
    raise exception 'Native evidence was not atomically persisted with derived ownership';
  end if;
  if public.persist_native_layout_extraction(analysis_id, 1, 'alex@example.test', 'unpdf-v1', 1,
    '["alex@example.test"]', 'aa011-worker', 'aa011-test', repeat('b', 64), '[]', null, null) then
    raise exception 'Repeated extraction changed a terminal stage';
  end if;
  if (select e.evidence_graph from public.analysis_extractions e where e.analysis_id = analysis_id) is distinct from graph then
    raise exception 'Repeated extraction overwrote evidence';
  end if;
  if (select e.native_layout from public.analysis_extractions e where e.analysis_id = analysis_id) is distinct from layout then
    raise exception 'Repeated extraction overwrote layout';
  end if;
  if has_table_privilege('authenticated', 'public.analysis_extractions', 'SELECT')
     or has_table_privilege('anon', 'public.analysis_extractions', 'SELECT')
     or has_function_privilege('authenticated',
       'public.persist_analysis_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.persist_analysis_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Client roles can read raw evidence or execute the worker RPC';
  end if;
  if has_function_privilege('authenticated',
       'public.persist_native_layout_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.persist_native_layout_extraction(uuid,integer,text,text,integer,jsonb,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Client roles can execute the layout worker RPC';
  end if;
  raise exception 'Rollback synthetic AA010 fixture' using errcode = 'ZAA01';
  exception when sqlstate 'ZAA01' then null;
  end;
end;
$$;
