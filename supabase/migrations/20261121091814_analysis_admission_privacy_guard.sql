-- Protect the existing privacy RPCs through their mandatory plan/step writes.
-- The sealed privacy generation routines and data_requests catalogue are unchanged.
begin;

-- Export and deletion look up all operations for the owner across organizations.
create index analysis_admission_operations_owner_idx
  on private.analysis_admission_operations(owner_id, id);

create function private.fence_analysis_admission_inserts()
returns trigger language plpgsql volatile set search_path='' as $fence$
declare candidate uuid;
begin
  if tg_table_name='analysis_admission_operations' then
    candidate:=new.owner_id;
  else
    select owner_id into candidate from private.analysis_admission_operations where id=new.operation_id;
  end if;
  if not private.try_candidate_privacy_write(candidate) then
    raise exception 'ADMISSION_INTAKE_BLOCKED' using errcode='42501';
  end if;
  return new;
end;
$fence$;

create trigger fence_analysis_admission_operation_insert
  before insert on private.analysis_admission_operations for each row
  execute function private.fence_analysis_admission_inserts();
create trigger fence_analysis_admission_upload_insert
  before insert on private.analysis_admission_uploads for each row
  execute function private.fence_analysis_admission_inserts();

create function private.assert_analysis_admission_deletion_clear(p_owner uuid)
returns void language plpgsql volatile set search_path='' as $deletion_clear$
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'PRIVACY_ISOLATION_UNSUPPORTED' using errcode='25000';
  end if;
  if not private.try_lock_candidate_owners(array[p_owner]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;
  if exists(select 1 from private.analysis_admission_operations where owner_id=p_owner) then
    raise exception 'ADMISSION_RETIREMENT_REQUIRED' using errcode='P0A01';
  end if;
end;
$deletion_clear$;

create function private.guard_analysis_admission_deletion_plan()
returns trigger language plpgsql volatile set search_path='' as $plan_guard$
declare candidate uuid;
begin
  select user_id into strict candidate from public.data_requests where id=new.request_id and kind='deletion';
  perform private.assert_analysis_admission_deletion_clear(candidate);
  return new;
end;
$plan_guard$;
create trigger guard_analysis_admission_deletion_plan before insert on private.privacy_deletion_plans
  for each row execute function private.guard_analysis_admission_deletion_plan();

create function private.analysis_admission_export_records(p_owner uuid)
returns jsonb language plpgsql volatile set search_path='' as $export_records$
declare operations jsonb; uploads jsonb; result jsonb;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'PRIVACY_ISOLATION_UNSUPPORTED' using errcode='25000';
  end if;
  if not private.try_lock_candidate_owners(array[p_owner]) then
    raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';
  end if;
  -- Both collections share one snapshot, including compensation that may finish
  -- without acquiring the admission insert lock.
  select (select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'organizationId',o.organization_id,'idempotencyKey',o.idempotency_key,
    'bindingSha256',o.binding_sha256,'adoptedUploadId',o.adopted_upload_id,'createdAt',o.created_at
  ) order by o.id),'[]'::jsonb)
  from (select id,organization_id,idempotency_key,binding_sha256,adopted_upload_id,created_at
        from private.analysis_admission_operations where owner_id=p_owner order by id limit 4097) o),
  (select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'operationId',u.operation_id,'analysisId',u.analysis_id,'resumeId',u.resume_id,
    'versionId',u.version_id,'jobId',u.job_id,'storageKey',u.storage_key,'state',u.state,'createdAt',u.created_at
  ) order by u.id),'[]'::jsonb)
  from (select u.id,u.operation_id,u.analysis_id,u.resume_id,u.version_id,u.job_id,u.storage_key,u.state,u.created_at
        from private.analysis_admission_uploads u join private.analysis_admission_operations o on o.id=u.operation_id
        where o.owner_id=p_owner order by u.id limit 4097) u)
  into operations,uploads;

  if jsonb_array_length(operations)+jsonb_array_length(uploads)>4096 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  result:=jsonb_build_object('analysisAdmissionOperations',operations,'analysisAdmissionUploads',uploads);
  if octet_length(result::text)>4194304 then
    raise exception 'ADMISSION_EXPORT_LIMIT' using errcode='54000';
  end if;
  return result;
end;
$export_records$;

create function private.guard_analysis_admission_privacy_step()
returns trigger language plpgsql volatile set search_path='' as $step_guard$
declare request_row public.data_requests%rowtype; snapshot jsonb;
begin
  select * into strict request_row from public.data_requests where id=new.request_id;
  if request_row.kind='deletion' then
    -- Covers retries with old plans and completion using a previously loaded plan.
    perform private.assert_analysis_admission_deletion_clear(request_row.user_id);
  elsif request_row.kind='export' and new.step_key='export_manifest' then
    if request_row.status is distinct from 'completed'
      or request_row.result_manifest->>'version' is distinct from 'resumide-export-v1'
      or request_row.result_manifest#>>'{account,id}' is distinct from request_row.user_id::text
      or jsonb_typeof(request_row.result_manifest->'records') is distinct from 'object' then
      raise exception 'ADMISSION_EXPORT_MANIFEST_INVALID' using errcode='23514';
    end if;
    snapshot:=private.analysis_admission_export_records(request_row.user_id);
    update public.data_requests set result_manifest=jsonb_set(
      request_row.result_manifest,'{records}',(request_row.result_manifest->'records')||snapshot)
    where id=request_row.id;
  end if;
  return new;
end;
$step_guard$;

create trigger guard_analysis_admission_privacy_step
  before update of status on public.privacy_request_steps for each row
  when (new.status='completed') execute function private.guard_analysis_admission_privacy_step();

-- Confirm that existing requests possess the steps used by both sealed RPCs.
-- The existing request-initialization trigger supplies the same steps for new requests.
do $step_coverage$
begin
  if exists(select 1 from public.data_requests d
    where (d.kind='deletion' and not exists(select 1 from public.privacy_request_steps s
              where s.request_id=d.id and s.step_key='database'))
       or (d.kind='export' and not exists(select 1 from public.privacy_request_steps s
              where s.request_id=d.id and s.step_key='export_manifest'))) then
    raise exception 'PRIVACY_STEP_COVERAGE_REQUIRED' using errcode='23514';
  end if;
end;
$step_coverage$;

-- Definer-owned RPCs and the initialization trigger are the step writers.
revoke insert,update,delete,truncate,references,trigger on public.privacy_request_steps
  from public,anon,authenticated,service_role;
do $step_column_acl$
declare field record;
begin
  for field in select attname from pg_catalog.pg_attribute where attrelid='public.privacy_request_steps'::regclass
    and attnum>0 and not attisdropped loop
    execute format('revoke insert(%1$I),update(%1$I),references(%1$I) on public.privacy_request_steps from public,anon,authenticated,service_role',field.attname);
  end loop;
end;
$step_column_acl$;

revoke all on function private.fence_analysis_admission_inserts(),private.assert_analysis_admission_deletion_clear(uuid),
  private.guard_analysis_admission_deletion_plan(),private.analysis_admission_export_records(uuid),
  private.guard_analysis_admission_privacy_step() from public,anon,authenticated,service_role;

commit;
