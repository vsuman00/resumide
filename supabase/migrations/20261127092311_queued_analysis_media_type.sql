-- ATS-D5 follow-up: the unbound upload path (ANALYSIS_ADMISSION_BINDING_ENABLED=false, the default)
-- has no prepared upload row, so create_queued_analysis must be told the media type directly.
-- A new trailing parameter defaults to NULL; callers that omit it (finalize_analysis_admission and
-- the older positional callers) keep working. NULL falls back to the prepared upload's type, then PDF.
-- The function is replaced, not overloaded, so the RPC name stays unambiguous.

do $queued_guard$
begin
  if (select md5(p.prosrc) from pg_proc p
      where p.oid=to_regprocedure('public.create_queued_analysis(uuid,integer,text,text,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid)'))
    is distinct from '2060cc388ef9013242437dd940ced60a' then
    raise exception 'DOCX_MIGRATION_SOURCE_DRIFT: create_queued_analysis' using errcode='55000';
  end if;
end;
$queued_guard$;

drop function public.create_queued_analysis(uuid,integer,text,text,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid);

create function public.create_queued_analysis(
  p_analysis_id uuid, p_bytes integer, p_checksum text, p_display_name text, p_idempotency_key uuid,
  p_job_description text, p_job_id uuid, p_job_title text, p_organization_id uuid, p_request_id text,
  p_resume_id uuid, p_storage_key text, p_user_id uuid, p_version_id uuid, p_media_type text default null)
returns jsonb language plpgsql security definer set search_path='' as $queued_media$
declare
  existing_analysis public.analyses%rowtype;
begin
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and user_id = p_user_id
      and role in ('owner', 'admin', 'member')
  ) then
    raise exception 'organization access denied' using errcode = '42501';
  end if;

  select * into existing_analysis
  from public.analyses
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_analysis.owner_id <> p_user_id then
      raise exception 'idempotency ownership mismatch' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'analysisId', existing_analysis.id,
      'resumeId', (
        select resume_id from public.resume_versions
        where id = existing_analysis.resume_version_id
      ),
      'created', false
    );
  end if;

  insert into public.jobs (id, organization_id, owner_id, title, description)
  values (p_job_id, p_organization_id, p_user_id, p_job_title, p_job_description);
  insert into public.resumes (id, organization_id, owner_id, display_name)
  values (p_resume_id, p_organization_id, p_user_id, p_display_name);
  insert into public.resume_versions (
    id, resume_id, organization_id, owner_id, storage_key, checksum, bytes,
    media_type
  ) values (
    p_version_id, p_resume_id, p_organization_id, p_user_id, p_storage_key,
    p_checksum, p_bytes,
    coalesce(p_media_type,
      (select u.media_type from private.analysis_admission_uploads u
        where u.version_id = p_version_id and u.storage_key = p_storage_key),
      'application/pdf')
  );
  insert into public.analyses (
    id, resume_version_id, job_id, organization_id, owner_id, status,
    idempotency_key, request_id
  ) values (
    p_analysis_id, p_version_id, p_job_id, p_organization_id, p_user_id,
    'quarantined', p_idempotency_key, p_request_id
  );
  insert into public.analysis_jobs (analysis_id)
  values (p_analysis_id);

  return jsonb_build_object(
    'analysisId', p_analysis_id,
    'resumeId', p_resume_id,
    'created', true
  );
end;
$queued_media$;

revoke all on function public.create_queued_analysis(uuid,integer,text,text,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_queued_analysis(uuid,integer,text,text,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid,text) to service_role;
