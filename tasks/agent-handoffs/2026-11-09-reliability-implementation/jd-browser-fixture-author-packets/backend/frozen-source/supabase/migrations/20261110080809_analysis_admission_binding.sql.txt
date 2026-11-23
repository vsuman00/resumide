-- Additive, inactive foundation. No seeds, caller activation or managed SQL run.
-- AI technical admission remains at actual dispatch; this ledger never invents usage.
create table private.analysis_admission_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  binding_sha256 text not null check(binding_sha256 ~ '^[a-f0-9]{64}$'),
  adopted_upload_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(organization_id,owner_id,idempotency_key)
);
create table private.analysis_admission_uploads (
  id uuid primary key,
  operation_id uuid not null references private.analysis_admission_operations(id) on delete restrict,
  analysis_id uuid not null unique, resume_id uuid not null unique,
  version_id uuid not null unique, job_id uuid not null unique,
  storage_key text not null unique,
  state text not null default 'prepared' check(state in ('prepared','adopted','cleanup_pending','cleaned')),
  created_at timestamptz not null default clock_timestamp(),
  unique(id,operation_id)
);
alter table private.analysis_admission_operations add foreign key(adopted_upload_id,id)
  references private.analysis_admission_uploads(id,operation_id) on delete restrict;

create function private.analysis_admission_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Immutable admission history' using errcode='23514'; end if;
  if tg_table_name='analysis_admission_operations' then
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
create trigger analysis_admission_operation_identity before update or delete on private.analysis_admission_operations
  for each row execute function private.analysis_admission_identity();
create trigger analysis_admission_upload_identity before update or delete on private.analysis_admission_uploads
  for each row execute function private.analysis_admission_identity();

create function private.analysis_admission_denied(p_code text)
returns jsonb language sql immutable strict set search_path='' as $$
  select jsonb_build_object('schemaVersion','analysis-admission/1.0.0','kind','denied','code',p_code);
$$;
create function private.analysis_admission_hash(p_request jsonb)
returns text language plpgsql immutable strict set search_path='' as $$
declare atom text; bytes bytea:=convert_to(E'ANALYSIS-ADMISSION1\n','UTF8');
begin
  foreach atom in array array[p_request->>'checksum',p_request->>'bytes',p_request->>'titleSha256',
    p_request->>'jobSha256',p_request->>'nameSha256',p_request->>'requestPolicySha256',
    p_request->>'policyVersion',p_request->>'consentPolicyVersion'] loop
    if atom is null then raise exception 'Invalid admission binding' using errcode='22023'; end if;
    bytes:=bytes||convert_to('T'||octet_length(convert_to(atom,'UTF8'))::text||':'||atom||';','UTF8');
  end loop;
  return encode(extensions.digest(bytes,'sha256'),'hex');
end; $$;
create function private.analysis_admission_request_valid(p_request jsonb,p_final boolean)
returns boolean language plpgsql immutable set search_path='' as $$
declare keys text[]; expected text[]:=array['idempotencyKey','uploadId','analysisId','resumeId','versionId','jobId',
  'checksum','bytes','titleSha256','jobSha256','nameSha256','requestPolicySha256','policyVersion','consentPolicyVersion','bindingSha256']; key text;
begin
  if p_request is null or jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>2097152 then return false; end if;
  if p_final then expected:=expected||array['jobTitle','jobDescription','displayName','requestId']; end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(p_request) k;
  if keys is distinct from (select array_agg(k order by k) from unnest(expected) k) then return false; end if;
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
end; $$;
create function private.analysis_admission_authorized(p_user_id uuid,p_organization_id uuid)
returns boolean language plpgsql set search_path='' as $$
begin
  if p_user_id is null or p_organization_id is null then return false; end if;
  perform 1 from public.organizations where id=p_organization_id and owner_id=p_user_id for update;
  if not found then return false; end if;
  perform 1 from public.memberships where organization_id=p_organization_id and user_id=p_user_id and role='owner' for share;
  if not found then return false; end if;
  perform 1 from public.consents where organization_id=p_organization_id and user_id=p_user_id
    and purpose='qualitative_ai' and policy_version='candidate-ai-v1' for share;
  if not found then return false; end if;
  return not exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed');
end; $$;
create function private.analysis_admission_replay(p_operation_id uuid,p_request jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('schemaVersion','analysis-admission/1.0.0','kind','replay','operationId',o.id,
    'bindingSha256',o.binding_sha256,'analysisId',u.analysis_id,'resumeId',u.resume_id,'created',false) into result
  from private.analysis_admission_operations o join private.analysis_admission_uploads u on u.id=o.adopted_upload_id and u.operation_id=o.id
  join public.analyses a on a.id=u.analysis_id and a.owner_id=o.owner_id and a.organization_id=o.organization_id
    and a.resume_version_id=u.version_id and a.job_id=u.job_id
  join public.resume_versions v on v.id=u.version_id and v.resume_id=u.resume_id and v.owner_id=o.owner_id
    and v.organization_id=o.organization_id and v.storage_key=u.storage_key
    and v.checksum=p_request->>'checksum' and v.bytes=(p_request->>'bytes')::integer
  join public.jobs j on j.id=u.job_id and j.owner_id=o.owner_id and j.organization_id=o.organization_id
    and encode(extensions.digest(convert_to(j.title,'UTF8'),'sha256'),'hex')=p_request->>'titleSha256'
    and encode(extensions.digest(convert_to(j.description,'UTF8'),'sha256'),'hex')=p_request->>'jobSha256'
  join public.resumes r on r.id=u.resume_id and r.owner_id=o.owner_id and r.organization_id=o.organization_id and r.status='active'
    and encode(extensions.digest(convert_to(r.display_name,'UTF8'),'sha256'),'hex')=p_request->>'nameSha256'
  where o.id=p_operation_id and u.state='adopted';
  if result is null then raise exception 'Admission result unavailable' using errcode='42501'; end if;
  return result;
end; $$;

create function public.prepare_analysis_admission(p_user_id uuid,p_organization_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  path:='organizations/'||p_organization_id::text||'/resumes/'||(p_request->>'resumeId')::uuid::text||'/versions/'||(p_request->>'versionId')::uuid::text||'.pdf';
  insert into private.analysis_admission_uploads(id,operation_id,analysis_id,resume_id,version_id,job_id,storage_key)
    values((p_request->>'uploadId')::uuid,o.id,(p_request->>'analysisId')::uuid,(p_request->>'resumeId')::uuid,
      (p_request->>'versionId')::uuid,(p_request->>'jobId')::uuid,path);
  return jsonb_build_object('schemaVersion','analysis-admission/1.0.0','kind','upload','operationId',o.id,'bindingSha256',o.binding_sha256,
    'uploadId',(p_request->>'uploadId')::uuid,'analysisId',(p_request->>'analysisId')::uuid,'resumeId',(p_request->>'resumeId')::uuid,
    'versionId',(p_request->>'versionId')::uuid,'jobId',(p_request->>'jobId')::uuid,'storageKey',path);
exception when unique_violation then return private.analysis_admission_denied('ADMISSION_CONFLICT');
  when insufficient_privilege then return private.analysis_admission_denied('ADMISSION_DENIED');
  when others then return private.analysis_admission_denied('ADMISSION_UNAVAILABLE');
end; $$;

create function public.finalize_analysis_admission(p_user_id uuid,p_organization_id uuid,p_operation_id uuid,p_upload_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.analysis_admission_operations%rowtype; u private.analysis_admission_uploads%rowtype; result jsonb; created boolean:=false; cleanup boolean:=false;
begin
  if not private.analysis_admission_request_valid(p_request,true) then return private.analysis_admission_denied('ADMISSION_INVALID'); end if;
  if not private.analysis_admission_authorized(p_user_id,p_organization_id) then return private.analysis_admission_denied('ADMISSION_DENIED'); end if;
  select * into o from private.analysis_admission_operations where id=p_operation_id and owner_id=p_user_id and organization_id=p_organization_id for update;
  if not found then return private.analysis_admission_denied('ADMISSION_DENIED'); end if;
  select * into u from private.analysis_admission_uploads where id=p_upload_id and operation_id=o.id for update;
  if not found then return private.analysis_admission_denied('ADMISSION_DENIED'); end if;
  if o.binding_sha256 is distinct from p_request->>'bindingSha256' or o.idempotency_key is distinct from (p_request->>'idempotencyKey')::uuid
    or u.id is distinct from (p_request->>'uploadId')::uuid or u.analysis_id is distinct from (p_request->>'analysisId')::uuid
    or u.resume_id is distinct from (p_request->>'resumeId')::uuid or u.version_id is distinct from (p_request->>'versionId')::uuid
    or u.job_id is distinct from (p_request->>'jobId')::uuid then return private.analysis_admission_denied('ADMISSION_CONFLICT'); end if;
  if o.adopted_upload_id is not null then
    result:=private.analysis_admission_replay(o.id,p_request);
    if o.adopted_upload_id<>u.id then
      if u.state='prepared' then update private.analysis_admission_uploads set state='cleanup_pending' where id=u.id; end if;
      cleanup:=u.state in ('prepared','cleanup_pending');
    end if;
  else
    if u.state<>'prepared' then return private.analysis_admission_denied('ADMISSION_CONFLICT'); end if;
    result:=public.create_queued_analysis(u.analysis_id,(p_request->>'bytes')::integer,p_request->>'checksum',p_request->>'displayName',
      o.id,p_request->>'jobDescription',u.job_id,p_request->>'jobTitle',p_organization_id,p_request->>'requestId',u.resume_id,u.storage_key,p_user_id,u.version_id);
    -- The old RPC's global key is never authority to adopt an unrelated result.
    if result->'created' is distinct from 'true'::jsonb or result->>'analysisId' is distinct from u.analysis_id::text
      or result->>'resumeId' is distinct from u.resume_id::text then raise exception 'Legacy key collision' using errcode='23505'; end if;
    update private.analysis_admission_uploads set state='adopted' where id=u.id;
    update private.analysis_admission_operations set adopted_upload_id=u.id where id=o.id;
    created:=true;
  end if;
  return jsonb_build_object('schemaVersion','analysis-admission/1.0.0','kind','result','operationId',o.id,'bindingSha256',o.binding_sha256,
    'analysisId',result->>'analysisId','resumeId',result->>'resumeId','created',created,'uploadId',u.id,'storageKey',u.storage_key,'cleanupPending',cleanup);
exception when unique_violation then return private.analysis_admission_denied('ADMISSION_CONFLICT');
  when insufficient_privilege then return private.analysis_admission_denied('ADMISSION_DENIED');
  when others then return private.analysis_admission_denied('ADMISSION_UNAVAILABLE');
end; $$;

create function public.cleanup_analysis_admission(p_user_id uuid,p_organization_id uuid,p_operation_id uuid,p_upload_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o private.analysis_admission_operations%rowtype; u private.analysis_admission_uploads%rowtype;
begin
  -- Exact post-work compensation, not new admission: may finish after revocation.
  perform 1 from public.organizations where id=p_organization_id for update;
  select * into o from private.analysis_admission_operations where id=p_operation_id and owner_id=p_user_id and organization_id=p_organization_id for update;
  if not found or p_action is null or p_action not in ('pending','cleaned') then return false; end if;
  select * into u from private.analysis_admission_uploads where id=p_upload_id and operation_id=o.id for update;
  if not found or u.state='adopted' or o.adopted_upload_id=u.id then return false; end if;
  if p_action='pending' then
    if u.state='prepared' then update private.analysis_admission_uploads set state='cleanup_pending' where id=u.id; end if;
  elsif u.state='cleanup_pending' then
    update private.analysis_admission_uploads set state='cleaned' where id=u.id;
  elsif u.state<>'cleaned' then return false;
  end if;
  return true;
end; $$;

alter table private.analysis_admission_operations enable row level security;
alter table private.analysis_admission_uploads enable row level security;
revoke all on private.analysis_admission_operations,private.analysis_admission_uploads from public,anon,authenticated,service_role;
revoke all on function private.analysis_admission_identity(),private.analysis_admission_denied(text),private.analysis_admission_hash(jsonb),
  private.analysis_admission_request_valid(jsonb,boolean),private.analysis_admission_authorized(uuid,uuid),private.analysis_admission_replay(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.prepare_analysis_admission(uuid,uuid,jsonb),public.finalize_analysis_admission(uuid,uuid,uuid,uuid,jsonb),
  public.cleanup_analysis_admission(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_analysis_admission(uuid,uuid,jsonb),public.finalize_analysis_admission(uuid,uuid,uuid,uuid,jsonb),
  public.cleanup_analysis_admission(uuid,uuid,uuid,uuid,text) to service_role;
