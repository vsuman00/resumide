-- ATS-D5 (owner-approved 2026-11-27): accept Word (.docx) resumes next to PDF.
--
-- Scope, kept deliberately small:
--   * resume_versions.media_type may be PDF or DOCX; the private bucket accepts both types.
--   * An admission request may carry an optional "mediaType". It is NOT part of the binding hash:
--     the file checksum already pins the exact bytes, and the type is derived from those bytes.
--   * The storage key keeps its ".pdf" suffix. The key is an opaque identity used by retention,
--     deletion and privacy export (private.r17_storage_key and five other functions), so its shape
--     is not changed here. The real type lives in media_type.
-- Each rewritten function is fingerprinted first, so the migration stops if the schema drifted.

do $docx_guard$
declare
  expected constant jsonb:=jsonb_build_object(
    'private.analysis_admission_request_valid(jsonb,boolean)','ccd52bf371951683d7fc29885349ad3a',
    'public.prepare_analysis_admission(uuid,uuid,jsonb)','c91ca33b5004ed548d1303d3c1130c1e',
    'public.create_queued_analysis(uuid,integer,text,text,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid)','68c8f9473e8051ed9a1a9388f5d6660a');
  item record;
begin
  for item in select key as fn, value #>> '{}' as fingerprint from jsonb_each(expected) loop
    if (select md5(p.prosrc) from pg_proc p where p.oid=to_regprocedure(item.fn))
      is distinct from item.fingerprint then
      raise exception 'DOCX_MIGRATION_SOURCE_DRIFT: %', item.fn using errcode='55000';
    end if;
  end loop;
end;
$docx_guard$;

alter table public.resume_versions drop constraint resume_versions_media_type_check;
alter table public.resume_versions add constraint resume_versions_media_type_check
  check (media_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

update storage.buckets
  set allowed_mime_types=array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  where id='resumes';

alter table private.analysis_admission_uploads
  add column media_type text not null default 'application/pdf'
  check (media_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

create or replace function private.analysis_admission_request_valid(p_request jsonb, p_final boolean)
returns boolean language plpgsql immutable set search_path='' as $docx_valid$
declare keys text[]; expected text[]:=array['idempotencyKey','uploadId','analysisId','resumeId','versionId','jobId',
  'checksum','bytes','titleSha256','jobSha256','nameSha256','requestPolicySha256','policyVersion','consentPolicyVersion','bindingSha256']; key text;
begin
  if p_request is null or jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>2097152 then return false; end if;
  if p_final then expected:=expected||array['jobTitle','jobDescription','displayName','requestId']; end if;
  -- "mediaType" is optional and validated below; every other key must match exactly.
  select array_agg(k order by k) into keys from jsonb_object_keys(p_request) k where k<>'mediaType';
  if keys is distinct from (select array_agg(k order by k) from unnest(expected) k) then return false; end if;
  if p_request ? 'mediaType' and (jsonb_typeof(p_request->'mediaType') is distinct from 'string'
    or p_request->>'mediaType' not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then return false; end if;
  foreach key in array array['idempotencyKey','uploadId','analysisId','resumeId','versionId','jobId'] loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  end loop;
  foreach key in array array['checksum','titleSha256','jobSha256','nameSha256','requestPolicySha256','bindingSha256'] loop
    if jsonb_typeof(p_request->key) is distinct from 'string' or (p_request->>key) !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  if p_request->>'policyVersion' is distinct from 'analysis-admission/1.0.0'
    or p_request->>'consentPolicyVersion' is distinct from 'candidate-ai-v1'
    or jsonb_typeof(p_request->'bytes') is distinct from 'number'
    or (p_request->>'bytes') !~ '^[1-9][0-9]{0,7}$' then return false; end if;
  if (p_request->>'bytes')::integer>10485760 or private.analysis_admission_hash(p_request) is distinct from p_request->>'bindingSha256' then return false; end if;
  if p_final then
    foreach key in array array['jobTitle','jobDescription','displayName','requestId'] loop
      if jsonb_typeof(p_request->key) is distinct from 'string' then return false; end if;
    end loop;
    if encode(extensions.digest(convert_to(p_request->>'jobTitle','UTF8'),'sha256'),'hex') is distinct from p_request->>'titleSha256'
      or encode(extensions.digest(convert_to(p_request->>'jobDescription','UTF8'),'sha256'),'hex') is distinct from p_request->>'jobSha256'
      or encode(extensions.digest(convert_to(p_request->>'displayName','UTF8'),'sha256'),'hex') is distinct from p_request->>'nameSha256'
      or (p_request->>'requestId') !~ '^[A-Za-z0-9._:-]{8,128}$' then return false; end if;
  end if;
  return true;
end; $docx_valid$;

create or replace function public.prepare_analysis_admission(p_user_id uuid, p_organization_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $docx_prepare$
declare o private.analysis_admission_operations%rowtype; path text;
begin
  if not private.analysis_admission_request_valid(p_request,false) then return private.analysis_admission_denied('ADMISSION_INVALID'); end if;
  if not private.analysis_admission_authorized(p_user_id,p_organization_id) then return private.analysis_admission_denied('ADMISSION_DENIED'); end if;
  select * into o from private.analysis_admission_operations where organization_id=p_organization_id and owner_id=p_user_id
    and idempotency_key=(p_request->>'idempotencyKey')::uuid for update;
  if found then
    if o.binding_sha256 is distinct from p_request->>'bindingSha256' then return private.analysis_admission_denied('ADMISSION_CONFLICT'); end if;
    if o.adopted_upload_id is not null then return private.analysis_admission_replay(o.id,p_request); end if;
  else
    insert into private.analysis_admission_operations(organization_id,owner_id,idempotency_key,binding_sha256)
      values(p_organization_id,p_user_id,(p_request->>'idempotencyKey')::uuid,p_request->>'bindingSha256') returning * into o;
  end if;
  -- The ".pdf" suffix is an opaque storage identity for every media type (see the file header).
  path:='organizations/'||p_organization_id::text||'/resumes/'||(p_request->>'resumeId')::uuid::text||'/versions/'||(p_request->>'versionId')::uuid::text||'.pdf';
  insert into private.analysis_admission_uploads(id,operation_id,analysis_id,resume_id,version_id,job_id,storage_key,media_type)
    values((p_request->>'uploadId')::uuid,o.id,(p_request->>'analysisId')::uuid,(p_request->>'resumeId')::uuid,
      (p_request->>'versionId')::uuid,(p_request->>'jobId')::uuid,path,coalesce(p_request->>'mediaType','application/pdf'));
  return jsonb_build_object('schemaVersion','analysis-admission/1.0.0','kind','upload','operationId',o.id,'bindingSha256',o.binding_sha256,
    'uploadId',(p_request->>'uploadId')::uuid,'analysisId',(p_request->>'analysisId')::uuid,'resumeId',(p_request->>'resumeId')::uuid,
    'versionId',(p_request->>'versionId')::uuid,'jobId',(p_request->>'jobId')::uuid,'storageKey',path);
exception when unique_violation then return private.analysis_admission_denied('ADMISSION_CONFLICT');
  when insufficient_privilege then return private.analysis_admission_denied('ADMISSION_DENIED');
  when others then return private.analysis_admission_denied('ADMISSION_UNAVAILABLE');
end; $docx_prepare$;

create or replace function public.create_queued_analysis(
  p_analysis_id uuid, p_bytes integer, p_checksum text, p_display_name text, p_idempotency_key uuid,
  p_job_description text, p_job_id uuid, p_job_title text, p_organization_id uuid, p_request_id text,
  p_resume_id uuid, p_storage_key text, p_user_id uuid, p_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $docx_queue$
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
  -- The type was recorded when the upload was prepared; direct callers without a prepared upload are PDF.
  insert into public.resume_versions (
    id, resume_id, organization_id, owner_id, storage_key, checksum, bytes,
    media_type
  ) values (
    p_version_id, p_resume_id, p_organization_id, p_user_id, p_storage_key,
    p_checksum, p_bytes,
    coalesce((select u.media_type from private.analysis_admission_uploads u
      where u.version_id = p_version_id and u.storage_key = p_storage_key), 'application/pdf')
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
$docx_queue$;
