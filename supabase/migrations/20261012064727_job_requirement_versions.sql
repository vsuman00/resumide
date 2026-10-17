-- AA030 immutable JD requirements. Local rollout only; no numeric scoring.
create function private.job_requirement_shape_valid(p_body jsonb) returns boolean
language sql immutable set search_path='' as $fn$
  select extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"schemaVersion":{"type":"string","const":"requirements/1.0.0"},"producerVersion":{"type":"string","const":"jd-parser/1.0.0"},"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"parentVersionId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"ownerId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"organizationId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"analysisId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"jobId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"},"retentionPolicyId":{"type":"string","const":"candidate-active-30d/1.0.0"},"inputSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"locale":{"type":"string","minLength":2,"maxLength":20},"domain":{"type":"string","minLength":1,"maxLength":80},"state":{"type":"string","enum":["review_required","unsupported","insufficient"]},"sourceText":{"type":"string","maxLength":20000},"requirements":{"maxItems":300,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"type":{"type":"string","enum":["skill","experience","education","certification","responsibility","location","authorization","other"]},"value":{"type":"string","minLength":1,"maxLength":2000},"importance":{"type":"string","enum":["required","preferred","contextual","unknown"]},"importanceBasis":{"type":"string","enum":["explicit","inferred","unknown"]},"importanceEvidence":{"anyOf":[{"type":"object","properties":{"start":{"type":"integer","minimum":0,"maximum":20000},"end":{"type":"integer","exclusiveMinimum":0,"maximum":20000},"quote":{"type":"string","minLength":1,"maxLength":2000}},"required":["start","end","quote"],"additionalProperties":false},{"type":"null"}]},"derivation":{"type":"string","enum":["exact","model_proposed"]},"minimumYears":{"anyOf":[{"type":"number","minimum":0,"maximum":100},{"type":"null"}]},"negated":{"type":"boolean"},"ambiguity":{"maxItems":10,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"dedupGroup":{"type":"string","minLength":1,"maxLength":100},"evidence":{"type":"object","properties":{"spanId":{"type":"string","minLength":1,"maxLength":100},"start":{"type":"integer","minimum":0,"maximum":20000},"end":{"type":"integer","exclusiveMinimum":0,"maximum":20000},"quote":{"type":"string","minLength":1,"maxLength":2000}},"required":["spanId","start","end","quote"],"additionalProperties":false},"confidence":{"type":"object","properties":{"kind":{"type":"string","const":"uncalibrated"},"value":{"anyOf":[{"type":"number","minimum":0,"maximum":1},{"type":"null"}]}},"required":["kind","value"],"additionalProperties":false}},"required":["id","type","value","importance","importanceBasis","importanceEvidence","derivation","minimumYears","negated","ambiguity","dedupGroup","evidence","confidence"],"additionalProperties":false}},"warnings":{"maxItems":30,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}}},"required":["schemaVersion","producerVersion","id","parentVersionId","ownerId","organizationId","analysisId","jobId","createdAt","retentionPolicyId","inputSha256","locale","domain","state","sourceText","requirements","warnings"],"additionalProperties":false}$schema$::json,p_body);
$fn$;
revoke all on function private.job_requirement_shape_valid(jsonb) from public,anon,authenticated;
create table public.job_requirement_versions (
  id uuid primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_version_id uuid references public.job_requirement_versions(id) on delete cascade,
  revision integer not null check(revision>0),
  idempotency_key uuid not null, command jsonb not null,
  content jsonb not null check(octet_length(content::text)<=1048576 and private.job_requirement_shape_valid(content)),
  created_at timestamptz not null default now(),
  unique(analysis_id,revision),unique(analysis_id,idempotency_key),unique(id,organization_id,owner_id)
);
create table public.job_requirements (
  version_id uuid not null, id uuid not null,
  owner_id uuid not null,organization_id uuid not null,
  item jsonb not null,
  primary key(version_id,id),
  foreign key(version_id,organization_id,owner_id) references public.job_requirement_versions(id,organization_id,owner_id) on delete cascade
);
create index job_requirement_owner_idx on public.job_requirement_versions(owner_id);
create index job_requirement_org_idx on public.job_requirement_versions(organization_id);
create index job_requirement_job_idx on public.job_requirement_versions(job_id);
create index job_requirement_parent_idx on public.job_requirement_versions(parent_version_id);
create index job_requirement_facts_owner_idx on public.job_requirements(owner_id);
create function private.reject_job_requirement_update() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'Job requirement versions are immutable' using errcode='22023'; end; $$;
revoke all on function private.reject_job_requirement_update() from public,anon,authenticated;
create trigger immutable_job_requirement_version before update on public.job_requirement_versions for each row execute function private.reject_job_requirement_update();
create trigger immutable_job_requirement before update on public.job_requirements for each row execute function private.reject_job_requirement_update();
alter table public.job_requirement_versions enable row level security;
alter table public.job_requirements enable row level security;
revoke all on public.job_requirement_versions,public.job_requirements from public,anon,authenticated,service_role;
grant select on public.job_requirement_versions,public.job_requirements to authenticated;
grant select,delete on public.job_requirement_versions,public.job_requirements to service_role;
create policy "owners read active job requirement versions" on public.job_requirement_versions for select to authenticated
  using ((select auth.uid())=owner_id and (select private.has_organization_role(organization_id,array['owner','admin','member','viewer']))
    and exists(select 1 from public.analyses a join public.resume_versions v on v.id=a.resume_version_id join public.resumes r on r.id=v.resume_id
      where a.id=public.job_requirement_versions.analysis_id and a.owner_id=public.job_requirement_versions.owner_id
      and v.owner_id=public.job_requirement_versions.owner_id and r.owner_id=public.job_requirement_versions.owner_id and r.status='active')
    and not exists(select 1 from public.data_requests d where d.user_id=public.job_requirement_versions.owner_id and d.kind='deletion' and d.status<>'failed'));
create policy "owners read active job requirements" on public.job_requirements for select to authenticated
  using ((select auth.uid())=owner_id and exists(select 1 from public.job_requirement_versions v where v.id=version_id));

create function public.save_job_requirements(p_user_id uuid,p_analysis_id uuid,p_body jsonb,p_expected_version uuid,p_idempotency_key uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.analyses%rowtype; job public.jobs%rowtype; head public.job_requirement_versions%rowtype;
 prior public.job_requirement_versions%rowtype; command jsonb; item jsonb; evidence jsonb; cue jsonb;
 ids uuid[] := '{}'::uuid[]; keys text[] := '{}'::text[]; key text; rev integer; stated_years text[];
begin
 if p_body is null or p_request_id is null or char_length(p_request_id) not between 1 and 100 or p_idempotency_key is null
   or not private.job_requirement_shape_valid(p_body) or octet_length(p_body::text)>1048576 then
   raise exception 'Invalid requirement envelope' using errcode='22023'; end if;
 select * into a from public.analyses where id=p_analysis_id and owner_id=p_user_id for update;
 if a.id is null or a.job_id is null or exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status<>'failed')
   or not exists(select 1 from public.memberships where organization_id=a.organization_id and user_id=p_user_id) then
   return jsonb_build_object('status','not_found'); end if;
 perform 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id where v.id=a.resume_version_id
   and v.owner_id=p_user_id and v.organization_id=a.organization_id and r.owner_id=p_user_id and r.status='active' for share of v,r;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into job from public.jobs where id=a.job_id and owner_id=p_user_id and organization_id=a.organization_id for share;
 if job.id is null then return jsonb_build_object('status','not_found'); end if;
 if p_body->>'ownerId'<>p_user_id::text or p_body->>'organizationId'<>a.organization_id::text
   or p_body->>'analysisId'<>a.id::text or p_body->>'jobId'<>job.id::text
   or p_body->>'sourceText'<>job.description or p_body->>'inputSha256'<>encode(extensions.digest(convert_to(job.description,'UTF8'),'sha256'),'hex') then
   raise exception 'Requirement provenance mismatch' using errcode='22023'; end if;
 command:=jsonb_build_object('sourceHash',p_body->>'inputSha256','locale',p_body->>'locale','domain',p_body->>'domain','expectedVersionId',p_expected_version);
 select * into prior from public.job_requirement_versions where analysis_id=a.id and idempotency_key=p_idempotency_key;
 if prior.id is not null then
   if prior.command<>command then return jsonb_build_object('status','conflict'); end if;
   return jsonb_build_object('status','applied','versionId',prior.id,'revision',prior.revision,'idempotent',true); end if;
 select * into head from public.job_requirement_versions where analysis_id=a.id order by revision desc limit 1;
 if head.id is distinct from p_expected_version then return jsonb_build_object('status','conflict'); end if;
 if p_body->>'parentVersionId' is distinct from p_expected_version::text then raise exception 'Requirement lineage mismatch' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_body->'requirements') loop
   evidence:=item->'evidence';
   if (item->>'id')::uuid=any(ids) or item->>'id'=p_body->>'id' then raise exception 'Duplicate requirement ID' using errcode='22023'; end if;
   ids:=array_append(ids,(item->>'id')::uuid);
   key:=concat(item->>'type',':',evidence->>'start',':',evidence->>'end',':',item->>'value');
   if key=any(keys) then raise exception 'Duplicate requirement span' using errcode='22023'; end if;
   keys:=array_append(keys,key);
   if (evidence->>'end')::int<=(evidence->>'start')::int or (evidence->>'end')::int>char_length(job.description)
     or substring(job.description from (evidence->>'start')::int+1 for (evidence->>'end')::int-(evidence->>'start')::int)<>evidence->>'quote'
     or position(item->>'value' in evidence->>'quote')=0 or item->>'value'<>btrim(item->>'value')
     or ((item->>'negated')::boolean and item->>'importance'='required')
     or (item->'minimumYears'<>'null'::jsonb and item->>'type'<>'experience') then
     raise exception 'Invalid exact JD evidence' using errcode='22023'; end if;
   cue:=item->'importanceEvidence';
   if item->'minimumYears'<>'null'::jsonb then
     stated_years:=regexp_match(evidence->>'quote','\y([0-9]{1,2})([[:space:]]*[-–][[:space:]]*[0-9]{1,2}|[[:space:]]*[+])?[[:space:]]*(years?|yrs?)\y','i');
     if stated_years is null or (stated_years[1])::numeric<>(item->>'minimumYears')::numeric then
       raise exception 'Experience value differs from JD' using errcode='22023'; end if;
   end if;
   if (item->>'importanceBasis'='explicit') is distinct from (cue<>'null'::jsonb) then
     raise exception 'Explicit importance citation required' using errcode='22023'; end if;
   if cue<>'null'::jsonb and ((cue->>'end')::int<=(cue->>'start')::int or (cue->>'end')::int>char_length(job.description)
     or substring(job.description from (cue->>'start')::int+1 for (cue->>'end')::int-(cue->>'start')::int)<>cue->>'quote') then
     raise exception 'Invalid importance citation' using errcode='22023'; end if;
 end loop;
 if jsonb_array_length(p_body->'requirements')=0 and p_body->>'state'='review_required' then raise exception 'Empty requirements cannot imply success' using errcode='22023'; end if;
 if (p_body->>'domain'<>'software-engineering' or p_body->>'locale'<>'en-IN') and p_body->>'state'<>'unsupported' then
   raise exception 'Unsupported domain promoted' using errcode='22023'; end if;
 rev:=coalesce(head.revision,0)+1;
 insert into public.job_requirement_versions(id,analysis_id,job_id,owner_id,organization_id,parent_version_id,revision,idempotency_key,command,content,created_at)
 values((p_body->>'id')::uuid,a.id,job.id,p_user_id,a.organization_id,head.id,rev,p_idempotency_key,command,p_body,(p_body->>'createdAt')::timestamptz);
 insert into public.job_requirements(version_id,id,owner_id,organization_id,item)
 select (p_body->>'id')::uuid,(value->>'id')::uuid,p_user_id,a.organization_id,value from jsonb_array_elements(p_body->'requirements');
 insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,outcome,request_id)
 values(a.organization_id,p_user_id,'requirements.import','job_requirement_version',(p_body->>'id')::uuid,'success',p_request_id);
 return jsonb_build_object('status','applied','versionId',p_body->>'id','revision',rev,'idempotent',false);
end; $$;
revoke all on function public.save_job_requirements(uuid,uuid,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_job_requirements(uuid,uuid,jsonb,uuid,uuid,text) to service_role;

create function public.export_job_requirement_records(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
 select jsonb_build_object('jobRequirementVersions',coalesce((select jsonb_agg(to_jsonb(v) order by v.analysis_id,v.revision) from public.job_requirement_versions v where owner_id=p_user_id),'[]'::jsonb),
   'jobRequirements',coalesce((select jsonb_agg(to_jsonb(r) order by r.version_id,r.id) from public.job_requirements r where owner_id=p_user_id),'[]'::jsonb)) into snapshot;
 if octet_length(snapshot::text)>33554432 then raise exception 'Requirement export exceeds manifest limit' using errcode='22023'; end if;
 return snapshot;
end; $$;
revoke all on function public.export_job_requirement_records(uuid) from public,anon,authenticated;
grant execute on function public.export_job_requirement_records(uuid) to service_role;
