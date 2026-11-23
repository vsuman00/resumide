-- Retire only an exact owner ledger with verified object obligations.
begin;

-- This authority is transaction-bound and removed before successful completion.
create table private.analysis_admission_retirement_authority (
  request_id uuid primary key,
  attempt integer not null,
  authorized_xid xid8 not null,
  operation_ids uuid[] not null,
  upload_ids uuid[] not null,
  capture_ids uuid[] not null
);
alter table private.analysis_admission_retirement_authority enable row level security;
revoke all on private.analysis_admission_retirement_authority from public,anon,authenticated,service_role;

create function private.analysis_admission_retirement_authorized(p_kind text,p_id uuid)
returns boolean language sql volatile set search_path='' as $authority$
  select exists(
    select 1 from private.analysis_admission_retirement_authority a
    join public.data_requests d on d.id=a.request_id
    where a.authorized_xid=pg_current_xact_id_if_assigned()
      and d.kind='deletion' and d.status='processing' and d.attempt_count=a.attempt
      and d.lease_expires_at>clock_timestamp()
      and case p_kind when 'operation' then p_id=any(a.operation_ids)
        when 'upload' then p_id=any(a.upload_ids)
        when 'capture' then p_id=any(a.capture_ids)
        else false end
  );
$authority$;
revoke all on function private.analysis_admission_retirement_authorized(text,uuid) from public,anon,authenticated,service_role;

create or replace function private.analysis_admission_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if private.analysis_admission_retirement_authorized(
      case when tg_table_name='analysis_admission_operations' then 'operation' else 'upload' end,old.id
    ) then return old;end if;
    raise exception 'Immutable admission history' using errcode='23514';
  end if;
  if tg_table_name='analysis_admission_operations' then
    if old.adopted_upload_id is not null and new.adopted_upload_id is null
      and (to_jsonb(new)-'adopted_upload_id')=(to_jsonb(old)-'adopted_upload_id')
      and private.analysis_admission_retirement_authorized('operation',old.id) then return new;end if;
    if row(new.id,new.organization_id,new.owner_id,new.idempotency_key,new.binding_sha256,new.created_at)
      is distinct from row(old.id,old.organization_id,old.owner_id,old.idempotency_key,old.binding_sha256,old.created_at)
      or old.adopted_upload_id is not null then raise exception 'Immutable admission identity' using errcode='23514'; end if;
  else
    if row(new.id,new.operation_id,new.analysis_id,new.resume_id,new.version_id,new.job_id,new.storage_key,new.created_at)
      is distinct from row(old.id,old.operation_id,old.analysis_id,old.resume_id,old.version_id,old.job_id,old.storage_key,old.created_at)
      or not ((old.state='prepared' and new.state in ('adopted','cleanup_pending'))
        or (old.state='cleanup_pending' and new.state='cleaned')) then
      raise exception 'Invalid admission transition' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;

create or replace function private.guard_analysis_admission_upload_transport()
returns trigger language plpgsql set search_path='' as $guard$
begin
  if tg_op='DELETE' then
    if private.analysis_admission_retirement_authorized('upload',old.upload_id) then return old;end if;
    raise exception 'Immutable upload transport evidence' using errcode='23514';
  end if;
  if new.upload_id is distinct from old.upload_id or not (
    (old.dispatched_at is null and new.dispatched_at is not null and new.acknowledged_at is null)
    or (old.dispatched_at is not null and row(new.bucket,new.dispatched_at) is not distinct from row(old.bucket,old.dispatched_at)
      and old.acknowledged_at is null and new.acknowledged_at is not null)
  ) then
    raise exception 'Invalid upload transport evidence transition' using errcode='23514';
  end if;
  return new;
end;
$guard$;

create or replace function private.guard_analysis_admission_retirement_capture()
returns trigger language plpgsql set search_path='' as $guard$
begin
  if tg_op='DELETE' and private.analysis_admission_retirement_authorized('capture',old.request_id) then return old;end if;
  raise exception 'Immutable admission retirement capture' using errcode='23514';
end;
$guard$;

create function public.complete_deletion_request_with_admission_retirement(
  p_request_id uuid,p_worker_id text,p_attempt integer
) returns boolean language plpgsql volatile security definer set search_path='' as $retire$
declare
  claimed public.data_requests%rowtype;
  captured private.analysis_admission_retirement_capture%rowtype;
  handoff private.analysis_admission_deletion_handoffs%rowtype;
  operations uuid[];
  uploads uuid[];
  adopted uuid[];
  captures uuid[];
  affected integer;
begin
  if private.privacy_generation_ready() is not true then
    raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';
  end if;
  claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
  if claimed.id is null or claimed.kind is distinct from 'deletion' then return false;end if;
  if not private.try_lock_candidate_owners(array[claimed.user_id]) then return false;end if;

  select * into captured from private.analysis_admission_retirement_capture c where c.request_id=claimed.id;
  select * into handoff from private.analysis_admission_deletion_handoffs h where h.request_id=claimed.id;
  if captured.request_id is null or handoff.request_id is null or handoff.authorized_xid is not null
    or not exists(select 1 from private.privacy_deletion_plans p where p.request_id=claimed.id
      and handoff.plan_sha256=private.analysis_admission_deletion_plan_hash(p.storage_objects))
    or not exists(select 1 from private.owned_ai_deletion_dispositions d where d.owner_id=claimed.user_id)
    or not exists(select 1 from public.privacy_request_steps s
      where s.request_id=claimed.id and s.step_key='database' and s.status='completed') then return false;end if;

  -- Rebuild the complete owner scope after the preparation deleted the sources.
  select coalesce(array_agg(id order by id),array[]::uuid[]) into operations
    from (select o.id from private.analysis_admission_operations o
      where o.owner_id=claimed.user_id order by o.id limit 4097) owner_operations;
  select coalesce(array_agg(id order by id),array[]::uuid[]) into uploads
    from (select u.id from private.analysis_admission_uploads u
      where u.operation_id=any(operations) order by u.id limit 4097) owner_uploads;
  if operations is distinct from captured.operation_ids or uploads is distinct from captured.upload_ids then return false;end if;

  select coalesce(array_agg(o.adopted_upload_id order by o.adopted_upload_id),array[]::uuid[]) into adopted
    from private.analysis_admission_operations o where o.id=any(operations) and o.adopted_upload_id is not null;
  if adopted is distinct from handoff.adopted_upload_ids then return false;end if;
  if exists(
    select 1 from private.analysis_admission_uploads u
    left join private.analysis_admission_cleanup_receipts r on r.request_id=claimed.id and r.upload_id=u.id
    left join private.analysis_admission_upload_transport t on t.upload_id=u.id
    where u.id=any(uploads) and (
      r.verified_at is null or r.issued_attempt>claimed.attempt_count
      or t.acknowledged_at is null or t.object_id is null
      or u.state<>case when u.id=any(adopted) then 'adopted' else 'cleaned' end
      or exists(select 1 from public.resume_versions v where v.id=u.version_id or v.storage_key=u.storage_key)
      or exists(select 1 from public.analyses a where a.id=u.analysis_id or a.resume_version_id=u.version_id)
      or exists(select 1 from public.analysis_jobs q where q.analysis_id=u.analysis_id)
      or exists(select 1 from public.resumes r where r.id=u.resume_id)
      or exists(select 1 from public.jobs j where j.id=u.job_id)
    )
  ) then return false;end if;

  -- Earlier snapshots for this owner may retain the same links. A foreign or
  -- unexplained snapshot must be reconciled before any linked row is removed.
  if exists(
    select 1 from private.analysis_admission_retirement_capture c
    join public.data_requests d on d.id=c.request_id
    where (d.user_id=claimed.user_id and
      (not (c.operation_ids <@ operations) or not (c.upload_ids <@ uploads)))
      or (d.user_id<>claimed.user_id and (c.operation_ids && operations or c.upload_ids && uploads))
  ) then return false;end if;
  select coalesce(array_agg(c.request_id order by c.request_id),array[]::uuid[]) into captures
    from private.analysis_admission_retirement_capture c
    join public.data_requests d on d.id=c.request_id where d.user_id=claimed.user_id;
  if claimed.lease_expires_at<=clock_timestamp() then return false;end if;

  insert into private.analysis_admission_retirement_authority
    (request_id,attempt,authorized_xid,operation_ids,upload_ids,capture_ids)
    values(claimed.id,claimed.attempt_count,pg_current_xact_id(),operations,uploads,captures);

  -- Existing request-scoped FK cascades remove the handoff, receipts, source
  -- bindings and progress. Remove transport before its upload and clear the
  -- adopted pointers before deleting their targets.
  delete from private.analysis_admission_retirement_capture where request_id=any(captures);
  get diagnostics affected=row_count;
  if affected<>cardinality(captures) then raise exception 'ADMISSION_RETIREMENT_SCOPE_CHANGED' using errcode='23514';end if;
  delete from private.analysis_admission_upload_transport where upload_id=any(uploads);
  get diagnostics affected=row_count;
  if affected<>cardinality(uploads) then raise exception 'ADMISSION_RETIREMENT_SCOPE_CHANGED' using errcode='23514';end if;
  update private.analysis_admission_operations set adopted_upload_id=null
    where id=any(operations) and adopted_upload_id is not null;
  get diagnostics affected=row_count;
  if affected<>cardinality(adopted) then raise exception 'ADMISSION_RETIREMENT_SCOPE_CHANGED' using errcode='23514';end if;
  delete from private.analysis_admission_uploads where id=any(uploads);
  get diagnostics affected=row_count;
  if affected<>cardinality(uploads) then raise exception 'ADMISSION_RETIREMENT_SCOPE_CHANGED' using errcode='23514';end if;
  delete from private.analysis_admission_operations where id=any(operations) and owner_id=claimed.user_id;
  get diagnostics affected=row_count;
  if affected<>cardinality(operations) then raise exception 'ADMISSION_RETIREMENT_SCOPE_CHANGED' using errcode='23514';end if;
  delete from private.analysis_admission_retirement_authority where request_id=claimed.id;

  if public.complete_privacy_request(p_request_id,p_worker_id,p_attempt,'{"deleted":true}'::jsonb) is not true then
    raise exception 'ADMISSION_RETIREMENT_COMPLETION_REFUSED' using errcode='23514';
  end if;
  return true;
end;
$retire$;

revoke all on function public.complete_deletion_request_with_admission_retirement(uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_deletion_request_with_admission_retirement(uuid,text,integer)
  to service_role;

commit;
