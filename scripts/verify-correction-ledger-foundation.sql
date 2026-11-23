-- DRAFT / NOT EXECUTED. Operator-only, separately admitted ISOLATED managed target.
-- This file is not a target guard or permission to connect/apply. It requires the
-- reviewed migration, an operator transaction and stop-on-error execution. Never
-- run on the deployed shared project or a Docker database. No APPLY RPC exists.
-- Fixtures below exercise physical foundation integrity, not producer authority,
-- source truth, current-head/review CAS, deletion races or a full restore.
begin;
set local statement_timeout='20s';
set local lock_timeout='2s';

do $verify$
declare
  t text; r text; p record; b bytea; keys bigint[]; rejected boolean; n integer;
  bad_atoms text[]; bad_owners uuid[];
begin
  foreach t in array array['candidate_correction_operations','candidate_correction_assignments',
    'candidate_correction_applications','canonical_correction_snapshots','canonical_correction_snapshot_facts'] loop
    if not exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname=t and c.relrowsecurity) then
      raise exception 'Foundation RLS missing';
    end if;
    if exists(select 1 from pg_policies where schemaname='public' and tablename=t) then
      raise exception 'Foundation policy activated';
    end if;
    foreach r in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Foundation table grant exposed';
      end if;
    end loop;
  end loop;
  for p in select f.oid,f.prosecdef from pg_proc f join pg_namespace s on s.oid=f.pronamespace
    where s.nspname='private' and f.proname in ('correction_uuid_list_valid','correction_command_bytes',
      'correction_command_sha256','candidate_owner_lock_keys','lock_candidate_owners',
      'try_lock_candidate_owners','reject_correction_ledger_update','check_correction_ledger_integrity') loop
    if p.prosecdef then raise exception 'Foundation helper is definer'; end if;
    foreach r in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(r,p.oid,'EXECUTE') then raise exception 'Foundation helper grant exposed'; end if;
    end loop;
  end loop;

  if private.correction_command_bytes(array[null,'','a:;N;'])<>convert_to(E'C02OP1\nN;T0:;T5:a:;N;;','UTF8')
    or private.correction_command_bytes(array[U&'\+01F9ED',U&'e\0301',U&'\00E9',E'a\nb'])
      <>convert_to(E'C02OP1\nT4:🧭;T3:é;T2:é;T3:a\nb;','UTF8')
    or private.correction_command_bytes('{}'::text[])<>convert_to(E'C02OP1\n','UTF8') then
    raise exception 'Cross-language byte vector differs';
  end if;
  b:=private.correction_command_bytes(array['assign','00000000-0000-4000-8000-000000000001','0']);
  if private.correction_command_sha256(array['assign','00000000-0000-4000-8000-000000000001','0'])
    <>encode(extensions.digest(b,'sha256'),'hex') then raise exception 'Byte hash differs'; end if;
  if private.correction_command_bytes(array['é'])=private.correction_command_bytes(array[U&'e\0301'])
    or private.correction_command_bytes(array[null])=private.correction_command_bytes(array['']) then
    raise exception 'Codec normalized distinct atoms';
  end if;
  -- Fixed typed-property order, not JSON serialization or JSON key order.
  if private.correction_command_bytes(array['{"kind":"assign","revision":"0"}'::jsonb->>'kind',
      '{"kind":"assign","revision":"0"}'::jsonb->>'revision'])
    <>private.correction_command_bytes(array['{"revision":"0","kind":"assign"}'::jsonb->>'kind',
      '{"revision":"0","kind":"assign"}'::jsonb->>'revision']) then
    raise exception 'Technical atom ordering differs';
  end if;
  if octet_length(private.correction_command_bytes(array[repeat('x',65521)]))<>65536
    or octet_length(private.correction_command_bytes(array_fill(null::text,array[1024])))<>2055 then
    raise exception 'Exact codec bound differs';
  end if;
  for n in 1..5 loop
    rejected:=false;
    bad_atoms:=case n when 1 then null when 2 then array[['a'],['b']]
      when 3 then '[0:0]={a}'::text[] when 4 then array[repeat('x',65522)]
      else array_fill(null::text,array[1025]) end;
    begin perform private.correction_command_bytes(bad_atoms);
    exception when sqlstate '22023' then rejected:=true; end;
    if not rejected then raise exception 'Invalid codec input accepted'; end if;
  end loop;
  for n in 1..2 loop
    rejected:=false;
    begin
      if n=1 then perform private.correction_command_bytes(array[convert_from(decode('eda080','hex'),'UTF8')]);
      else perform private.correction_command_bytes(array[chr(0)]); end if;
    exception when character_not_in_repertoire then rejected:=true; end;
    if not rejected then raise exception 'Unrepresentable PostgreSQL text accepted'; end if;
  end loop;

  keys:=private.candidate_owner_lock_keys(array['00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid]);
  if keys<>(select array_agg(k order by k) from(select distinct unnest(keys) k) s) then
    raise exception 'Owner resources not signed-sorted unique'; end if;
  -- Forced hash-collision ordering oracle: UUID order X,Y versus Y,X is unsafe;
  -- sorting the ACTUAL resource sets gives the same signed [-2,9] order.
  if (select array_agg(k order by k) from(select distinct unnest(array[-2,9,-2]::bigint[]) k) s)
    <>array[-2,9]::bigint[] then raise exception 'Collision ordering oracle failed'; end if;
  for n in 1..5 loop
    bad_owners:=case n when 1 then null when 2 then '{}'::uuid[] when 3 then array[null::uuid]
      when 4 then array[['00000000-0000-4000-8000-000000000001'::uuid],['00000000-0000-4000-8000-000000000002'::uuid]]
      else array_fill('00000000-0000-4000-8000-000000000001'::uuid,array[1025]) end;
    rejected:=false;
    begin perform private.candidate_owner_lock_keys(bad_owners);
    exception when sqlstate '22023' then rejected:=true; end;
    if not rejected then raise exception 'Invalid owner batch admitted'; end if;
  end loop;
  perform private.lock_candidate_owners(array['00000000-0000-4000-8000-000000000001'::uuid]);
  if not private.try_lock_candidate_owners(array['00000000-0000-4000-8000-000000000001'::uuid]) then
    raise exception 'Same-transaction owner relock failed'; end if;
end;
$verify$;

do $fixtures$
#variable_conflict use_variable
declare
  owner_id uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); org_id uuid;
  root_id uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid(); analysis_id uuid:=gen_random_uuid();
  attempt_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid();
  original_id uuid:=gen_random_uuid(); corrected_id uuid:=gen_random_uuid(); fact_id uuid:=gen_random_uuid();
  section_id uuid:=gen_random_uuid(); entry_id uuid:=gen_random_uuid();
  assign_id uuid:=gen_random_uuid(); apply_id uuid:=gen_random_uuid(); choice_id uuid:=gen_random_uuid(); application_id uuid:=gen_random_uuid();
  scope jsonb; body jsonb; op public.candidate_correction_operations%rowtype;
  choice public.candidate_correction_assignments%rowtype;
  app public.candidate_correction_applications%rowtype;
  snap public.canonical_correction_snapshots%rowtype;
  rejected boolean; table_name text; case_number integer;
  placement text; malformed_case integer; fact_path text[]; bad_body jsonb;
  bad_version_id uuid; bad_bullet_id uuid:=gen_random_uuid(); failure_message text; expected_failure text;
  bad_op public.candidate_correction_operations%rowtype;
  bad_choice public.candidate_correction_assignments%rowtype;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
    (owner_id,'authenticated','authenticated','c02-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
    (other_owner,'authenticated','authenticated','c02-'||other_owner||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select o.id into strict org_id from public.organizations o where o.owner_id=owner_id;
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic foundation fixture');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'c02-synthetic/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,idempotency_key)
    values(analysis_id,source_id,org_id,owner_id,gen_random_uuid());
  -- Deliberately minimal operator fixture, not a claimed valid evidence producer.
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(attempt_id,analysis_id,org_id,owner_id,source_id,repeat('a',64),1,
      '{"assertions":[{"id":"synthetic-role","field":"role","value":"Backend Engineer"}]}');
  insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,idempotency_key,request_id)
    values(event_id,attempt_id,analysis_id,org_id,owner_id,owner_id,1,0,'role','correct','Platform Engineer',gen_random_uuid(),'c02-fixture');
  body:=jsonb_build_object('analysisId',analysis_id,'inputSha256',repeat('a',64),'contactFactIds','[]'::jsonb,
    'sections',jsonb_build_array(jsonb_build_object('id',section_id,'type','experience','title','Experience','factIds','[]'::jsonb,
      'entries',jsonb_build_array(jsonb_build_object('id',entry_id,'factIds',jsonb_build_array(fact_id),'bullets','[]'::jsonb)))));
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content,source_evidence_version_id,parent_version_id,revision)
    values(original_id,root_id,source_id,org_id,owner_id,'en','review_required',body,attempt_id,null,1),
      (corrected_id,root_id,source_id,org_id,owner_id,'en','review_required',body,attempt_id,original_id,2);
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value)
    values(original_id,fact_id,org_id,owner_id,'role','Backend Engineer'),(corrected_id,fact_id,org_id,owner_id,'role','Platform Engineer');
  scope:=jsonb_build_object('owner_id',owner_id,'organization_id',org_id,'resume_id',root_id,'analysis_id',analysis_id,
    'source_resume_version_id',source_id,'attempt_id',attempt_id,'input_sha256',repeat('a',64),'actor_id',owner_id,'created_at',now());
  op:=jsonb_populate_record(null::public.candidate_correction_operations,scope||jsonb_build_object(
    'id',assign_id,'kind','assign','idempotency_key',gen_random_uuid(),'expected_review_revision',1,'expected_assignment_revision',0,
    'expected_canonical_version_id',original_id,'target_model_version','synthetic-target/1','projection_model_version','synthetic-projection/1',
    'admission_policy_version','synthetic-admission/1','evidence_schema_version','synthetic-evidence/1',
    'command_codec_version','c02-command-bytes/1.0.0','command_sha256',repeat('b',64),'selected_assignment_ids',jsonb_build_array(choice_id),
    'result_version_id',original_id,'result_revision',1,'result_assignment_revision',1,'child_version_ids','[]'::jsonb,'request_id','c02-fixture'));
  insert into public.candidate_correction_operations select op.*;
  choice:=jsonb_populate_record(null::public.candidate_correction_assignments,scope||jsonb_build_object(
    'id',choice_id,'operation_id',assign_id,'assignment_revision',1,'expected_assignment_revision',0,'correction_event_id',event_id,
    'correction_revision',1,'field','role','event_operation','correct','target_model_version','synthetic-target/1',
    'target_kind','observed_assertion','assertion_id','synthetic-role','opaque_target_id','synthetic-opaque-target',
    'mapping_mode','existing','base_version_id',original_id,'fact_id',fact_id,'mapping_proof_kind','current_citations',
    'location_kind','entry','section_id',section_id,'entry_id',entry_id));
  insert into public.candidate_correction_assignments select choice.*;
  op.id:=apply_id;op.kind:='apply';op.idempotency_key:=gen_random_uuid();op.expected_assignment_revision:=1;
  op.result_version_id:=corrected_id;op.result_revision:=2;op.child_version_ids:=array[corrected_id];
  insert into public.candidate_correction_operations select op.*;
  app:=jsonb_populate_record(null::public.candidate_correction_applications,scope||jsonb_build_object(
    'id',application_id,'operation_id',apply_id,'assignment_id',choice_id,'step_ordinal',1,
    'base_version_id',original_id,'result_version_id',corrected_id,'result_fact_id',fact_id));
  insert into public.candidate_correction_applications select app.*;
  snap:=jsonb_populate_record(null::public.canonical_correction_snapshots,scope||jsonb_build_object(
    'canonical_version_id',original_id,'origin_kind','raw_import','admission_policy_version','synthetic-admission/1'));
  insert into public.canonical_correction_snapshots select snap.*;
  snap.canonical_version_id:=corrected_id;snap.origin_kind:='correction';snap.source_operation_id:=apply_id;snap.inherited_from_version_id:=original_id;
  insert into public.canonical_correction_snapshots select snap.*;
  insert into public.canonical_correction_snapshot_facts values(corrected_id,fact_id,owner_id,org_id,application_id);
  set constraints all immediate; -- Flush real deferred result/array/lineage checks.

  -- Dangling technical IDs and wrong final child must fail, never be unchecked arrays.
  for case_number in 1..2 loop
    rejected:=false;
    begin
      op.id:=gen_random_uuid();op.idempotency_key:=gen_random_uuid();
      if case_number=1 then op.selected_assignment_ids:=array[gen_random_uuid()];
      else op.selected_assignment_ids:=array[choice_id];op.child_version_ids:=array[original_id]; end if;
      insert into public.candidate_correction_operations select op.*;
    exception when check_violation or foreign_key_violation then rejected:=true; end;
    if not rejected then raise exception 'Invalid receipt collection accepted'; end if;
  end loop;
  rejected:=false;
  begin
    choice.id:=gen_random_uuid();choice.actor_id:=other_owner;choice.assignment_revision:=2;
    insert into public.candidate_correction_assignments select choice.*;
  exception when check_violation or foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'Foreign actor accepted'; end if;
  -- Exercise the ACTUAL deferred mapped-location validator, not a copied predicate.
  -- Each subtransaction is expected to roll back on its exact placement error.
  foreach placement in array array['contact','section','entry','bullet'] loop
    fact_path:=case placement when 'contact' then array['contactFactIds']
      when 'section' then array['sections','0','factIds']
      when 'entry' then array['sections','0','entries','0','factIds']
      else array['sections','0','entries','0','bullets','0','factIds'] end;
    expected_failure:=case placement when 'contact' then 'CORRECTION_CONTACT_LOCATION'
      when 'section' then 'CORRECTION_SECTION_FACT' when 'entry' then 'CORRECTION_ENTRY_FACT'
      else 'CORRECTION_BULLET_FACT' end;
    for malformed_case in 1..4 loop
      rejected:=false; failure_message:=null;
      begin
        set constraints all deferred;
        bad_body:=jsonb_set(body,'{contactFactIds}',jsonb_build_array(fact_id));
        bad_body:=jsonb_set(bad_body,'{sections,0,factIds}',jsonb_build_array(fact_id));
        bad_body:=jsonb_set(bad_body,'{sections,0,entries,0,bullets}',jsonb_build_array(jsonb_build_object(
          'id',bad_bullet_id,'text','Synthetic contribution.','factIds',jsonb_build_array(fact_id))));
        bad_body:=case when malformed_case=1 then bad_body #- fact_path
          else jsonb_set(bad_body,fact_path,case malformed_case when 2 then 'null'::jsonb
            when 3 then jsonb_build_object(fact_id::text,true) else to_jsonb(fact_id::text) end) end;
        bad_version_id:=gen_random_uuid();
        insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,
          locale,state,content,source_evidence_version_id,parent_version_id,revision)
          values(bad_version_id,root_id,source_id,org_id,owner_id,'en','review_required',bad_body,attempt_id,corrected_id,3);
        insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value)
          values(bad_version_id,fact_id,org_id,owner_id,'role','Backend Engineer');
        select * into bad_op from public.candidate_correction_operations where id=assign_id;
        select * into bad_choice from public.candidate_correction_assignments where id=choice_id;
        bad_op.id:=gen_random_uuid();bad_op.idempotency_key:=gen_random_uuid();bad_op.expected_assignment_revision:=1;
        bad_op.expected_canonical_version_id:=bad_version_id;bad_op.result_version_id:=bad_version_id;
        bad_op.result_revision:=3;bad_op.result_assignment_revision:=2;
        bad_choice.id:=gen_random_uuid();bad_choice.operation_id:=bad_op.id;
        bad_choice.assignment_revision:=2;bad_choice.expected_assignment_revision:=1;bad_choice.base_version_id:=bad_version_id;
        bad_choice.location_kind:=placement;
        bad_choice.section_id:=case when placement='contact' then null else section_id end;
        bad_choice.entry_id:=case when placement in ('entry','bullet') then entry_id else null end;
        bad_choice.bullet_id:=case when placement='bullet' then bad_bullet_id else null end;
        bad_op.selected_assignment_ids:=array[bad_choice.id];
        insert into public.candidate_correction_operations select bad_op.*;
        insert into public.candidate_correction_assignments select bad_choice.*;
        set constraints all immediate;
      exception when check_violation then
        get stacked diagnostics failure_message=message_text;
        rejected:=failure_message=expected_failure;
      end;
      if not rejected then raise exception 'Malformed mapped location was not rejected by its exact validator: %/%',placement,malformed_case; end if;
    end loop;
  end loop;
  foreach table_name in array array['candidate_correction_operations','candidate_correction_assignments',
    'candidate_correction_applications','canonical_correction_snapshots','canonical_correction_snapshot_facts'] loop
    rejected:=false;
    begin execute format('update public.%I set owner_id=owner_id',table_name);
    exception when sqlstate '22023' then rejected:=true; end;
    if not rejected then raise exception 'Ledger mutation accepted'; end if;
  end loop;
  -- Same root cascade erases every new collection. No global cleanup or storage call.
  delete from public.resumes where id=root_id;
  foreach table_name in array array['candidate_correction_operations','candidate_correction_assignments',
    'candidate_correction_applications','canonical_correction_snapshots','canonical_correction_snapshot_facts'] loop
    execute format('select count(*) from public.%I where owner_id=$1',table_name) into case_number using owner_id;
    if case_number<>0 then raise exception 'Ledger survived synthetic root deletion'; end if;
  end loop;
end;
$fixtures$;
rollback;
-- NO PASS claimed until a separately admitted target executes this exact draft.
-- Multi-session lock collisions, late deletion enqueue, all old-writer barriers,
-- authoritative assignment/APPLY/add/CAS, complete privacy exports and managed
-- backup/restore are later cutover/runtime evidence, not tested by this script.
