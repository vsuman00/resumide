from pathlib import Path
import json,re,hashlib
root=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats')
t=Path(__file__).parent
read=lambda f:(root/f).read_text()
h=lambda s:hashlib.sha256(s.encode()).hexdigest()
def literal(s,tag):return s.split('$'+tag+'$')[1]
def body(s,n):
 m=re.search(r'create(?: or replace)? function '+re.escape(n)+r'\(',s,re.I)
 assert m,n
 b=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s[m.start():],re.I)
 assert b,n
 return b[2]
clock=read('supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql')
r17=read('supabase/migrations/20261115143547_retention_root_coverage.sql')
old={p['signature']:p['new'] for p in json.loads(literal(clock,'disposition_patches'))}
old.update({p['signature']:p['new'] for p in json.loads(literal(r17,'r17_patches'))})
for n in ['private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)','public.export_owned_ai_disposition_records(uuid)']:
 old[n]=body(clock,n.split('(')[0])
cap=old['private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)']
cap=cap.replace('declare x record;','declare registration private.ai_budget_operation_sources%rowtype;x record;')
cap=cap.replace('if private.owned_ai_disposition_ready() is not true or p_owner is null','if private.owned_ai_disposition_ready() is not true or private.ai_budget_source_ready() is not true or p_owner is null')
needle='for x in select o.* from private.ai_budget_operations o where o.user_id=p_owner and (p_resume is null or exists('
assert cap.count(needle)==1
cap=cap.replace(needle,"for x in select o.* from private.ai_budget_operations o where o.user_id=p_owner and (p_resume is null or exists(select 1 from private.ai_budget_operation_sources s where s.operation_id=o.id and s.owner_id=p_owner and s.resume_id=p_resume) or exists(")
needle="  n:=n+1;if n>4096 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;\n  if p_resume is null then"
branch=r"""  n:=n+1;if n>4096 then raise exception 'OWNED_AI_DISPOSITION_LIMIT' using errcode='23514';end if;
  -- Registered OP2 source wins before legacy/account-only inference, in ALL states.
  if exists(select 1 from private.ai_budget_operation_sources where operation_id=x.id) then
   select * into registration from private.ai_budget_operation_sources where operation_id=x.id for share skip locked;
   if not found then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
   if private.ai_budget_source_valid(registration,x) is not true or registration.owner_id<>p_owner
     or (p_resume is not null and registration.resume_id<>p_resume) then raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
   analysis:=registration.analysis_id;root_id:=registration.resume_id;version_id:=registration.resume_version_id;scope:='resume_root';
   select * into source_row from private.owned_ai_operation_dispositions d where d.kind='r03' and d.owner_id=p_owner and d.operation_id=x.id for share skip locked;
   if found then
    if (source_row.organization_id,source_row.analysis_id,source_row.resume_id,source_row.resume_version_id)
      is distinct from (registration.organization_id,analysis,root_id,version_id) then raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
    capture_at:=source_row.prepared_at;cause:=source_row.first_cause;cause_request:=source_row.deletion_request_id;cause_item:=source_row.retention_item_id;scope:=source_row.source_scope;
   else
    if exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='r03' and d.owner_id=p_owner and d.operation_id=x.id)
      then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
    perform 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id
      where (r.id,r.owner_id,r.organization_id,v.id,v.owner_id,v.organization_id)=(root_id,p_owner,x.organization_id,version_id,p_owner,x.organization_id) for share of r,v skip locked;
    if not found then
     scope:='historical_unresolved';capture_at:=null;cause:=null;cause_request:=null;cause_item:=null;
    else
     select t.id,t.created_at into root_clock from private.retention_items t where t.owner_id=p_owner and t.resume_id=root_id order by t.created_at,t.id limit 1;
     if p_request is not null then
      capture_at:=account_row.prepared_at;cause:='account_preparation';cause_request:=account_row.first_request_id;cause_item:=null;
      if root_clock.id is not null and root_clock.created_at<capture_at then capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;end if;
      if root_clock.id is null and exists(select 1 from public.resumes where id=root_id and status='deleted') then
       scope:='historical_unresolved';capture_at:=null;cause:=null;cause_request:=null;cause_item:=null;
      end if;
     else
      capture_at:=root_clock.created_at;cause:='resume_retirement';cause_request:=null;cause_item:=root_clock.id;
     end if;
    end if;
   end if;
   perform 1 from private.ai_budget_operations o where o.id=x.id and o.user_id=p_owner for update skip locked;
   if not found then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
   perform private.capture_owned_ai_disposition_row('r03',p_owner,x.organization_id,x.id,analysis,root_id,version_id,scope,cause,cause_request,cause_item,capture_at);
   continue;
  end if;
  if p_resume is null then"""
assert cap.count(needle)==1
cap=cap.replace(needle,branch)
exp=old['public.export_owned_ai_disposition_records(uuid)']
needle=' -- Missing historical clocks are not an empty complete export.'
assert exp.count(needle)==1
exp=exp.replace(needle,r""" -- Registered-source completeness is independent of current membership/flags.
 if private.ai_budget_source_ready() is not true or exists(
  select 1 from private.ai_budget_operation_sources s where s.owner_id=p_user_id
   and (exists(select 1 from private.retention_items t where t.owner_id=p_user_id and t.resume_id=s.resume_id)
    or exists(select 1 from private.owned_ai_deletion_dispositions a where a.owner_id=p_user_id)
    or not exists(select 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id
      where (r.id,r.owner_id,r.organization_id,v.id,v.owner_id,v.organization_id)=(s.resume_id,s.owner_id,s.organization_id,s.resume_version_id,s.owner_id,s.organization_id)))
   and not exists(select 1 from private.owned_ai_operation_dispositions d where d.kind='r03' and d.operation_id=s.operation_id
    and (d.owner_id,d.organization_id,d.analysis_id,d.resume_id,d.resume_version_id)=(s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)))
  then raise exception 'OWNED_AI_DISPOSITION_INCOMPLETE' using errcode='23514';end if;
"""+needle)
new={'private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)':cap,'public.export_owned_ai_disposition_records(uuid)':exp}
sql=(t/'functions.sql').read_text()
# Fresh metadata-only catalogue seal: includes its own SCHEMA, never its row value.
cat=literal(clock,'disp_catalogue').replace("c.relname='owned_ai_disposition_catalogue_seal' and t.tgname='owned_ai_disposition_seal_closed'","c.relname='ai_budget_source_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'")
cat=cat.replace("'private.owned_ai_deletion_dispositions'::regclass,'private.owned_ai_operation_dispositions'::regclass,'private.owned_ai_disposition_catalogue_seal'::regclass","'private.ai_budget_operation_sources'::regclass,'private.ai_budget_source_catalogue_seal'::regclass,'private.ai_budget_operations'::regclass,'private.ai_budget_attempts'::regclass")
sql+='\ncreate function private.ai_budget_source_catalogue() returns jsonb\nlanguage sql stable set search_path=\'\' as $source_catalogue$'+cat+'$source_catalogue$;\n'
sql+="""create function private.ai_budget_source_seal_closed() returns trigger
language plpgsql volatile set search_path='' as $source_seal_closed$
begin raise exception 'AI_SOURCE_SEAL_CLOSED' using errcode='23514';end;
$source_seal_closed$;
insert into private.ai_budget_source_catalogue_seal(singleton,catalogue_sha256) values(true,private.ifo_sha(private.ai_budget_source_catalogue()::text));
create trigger ai_budget_source_seal_closed before insert or update or delete on private.ai_budget_source_catalogue_seal for each row execute function private.ai_budget_source_seal_closed();
"""
metadata=r"""
declare ready boolean:=private.ai_budget_source_ready();
begin
 return jsonb_build_object('schemaVersion','ai-budget-source-readiness/1.0.0','profileVersion','ai-budget-source-profile/1.0.0',
  'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.ai_budget_source_ready()')),
  'reserveSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.ai_budget_reserve_source_next(uuid,uuid,jsonb,jsonb)')),
  'exportSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.export_owned_ai_budget_sources(uuid)')),
  'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_ai_budget_source_readiness()')),
  'schemaReady',ready,'reserveExecutable',ready and has_function_privilege('service_role','public.ai_budget_reserve_source_next(uuid,uuid,jsonb,jsonb)','EXECUTE'),
  'exportExecutable',ready and has_function_privilege('service_role','public.export_owned_ai_budget_sources(uuid)','EXECUTE'));
end;
"""
sql+="create function public.read_ai_budget_source_readiness() returns jsonb\nlanguage plpgsql stable security definer set search_path='' as $source_metadata$"+metadata+'$source_metadata$;\n'
# Exact old generic dependencies remain unmodified.
tech=read('supabase/migrations/20261110062548_technical_ai_budget.sql')
budget={n:body(tech,n) for n in ['public.ai_budget_reserve','public.ai_budget_reserve_next','private.ai_budget_transition']}
privacy=read('supabase/migrations/20261110085512_privacy_write_barrier.sql')
for m in re.finditer(r'\$([A-Za-z0-9_]+)\$(\[[\s\S]*?\])\$\1\$',privacy):
 try:rows=json.loads(m[2])
 except json.JSONDecodeError:continue
 for p in rows:
  n=p.get('signature','').split('(')[0]
  if n in budget and 'patches' in p:
   for change in p['patches']:
    assert budget[n].count(change['old'])==change['count']
    budget[n]=budget[n].replace(change['old'],change['new'])
ifo=old['private.initial_feedback_operation_ready()']
ifo_catalog=json.loads(literal(ifo,'ifo_catalog'))
manifest=[]
for p in ifo_catalog:
 if p['signature'].startswith('private.ai_budget_') or p['signature']=='public.ai_budget_claim_dispatch(uuid,uuid,jsonb)':
  manifest.append({**p,'setof':False})
# Explicit dependencies for reserve/ordinal selection and existing authority.
for sig,b,lang,definer,vol,acl,result in [
 ('public.ai_budget_reserve(uuid,uuid,jsonb)',budget['public.ai_budget_reserve'],'sql',True,'v','service','jsonb'),
 ('public.ai_budget_reserve_next(uuid,uuid,jsonb)',budget['public.ai_budget_reserve_next'],'plpgsql',True,'v','service','jsonb'),
 ('private.owned_ai_budget_export_ready()',body(read('supabase/migrations/20261115102625_owned_ai_budget_export.sql'),'private.owned_ai_budget_export_ready'),'plpgsql',False,'s','private','boolean'),
 ('private.try_candidate_privacy_write(uuid)',body(privacy,'private.try_candidate_privacy_write'),'plpgsql',True,'v','private','boolean'),
 ('private.r17_version_write_guard()',body(r17,'private.r17_version_write_guard'),'plpgsql',True,'v','private','trigger'),
 ('private.r17_root_tombstone_guard()',body(r17,'private.r17_root_tombstone_guard'),'plpgsql',False,'v','private','trigger')]:
 manifest.append(dict(signature=sig,sha256=h(b),language=lang,definer=definer,volatility=vol,strict=False,setof=False,acl=acl,resultType=result))
for entry in json.loads(literal(old['private.owned_ai_disposition_ready()'],'disposition_catalog')):
 if entry['signature'] in ['private.candidate_write_blocked(uuid)','private.candidate_owner_lock_keys(uuid[])','private.ifo_sha(text)','private.ifo_stamp(timestamp with time zone)']:
  manifest.append({**entry,'strict':False})
for entry in ifo_catalog:
 if entry['signature']=='private.ifo_keys(jsonb,text[])':manifest.append({**entry,'setof':False})
manifest.append(dict(signature='private.r17_storage_key(uuid,uuid,uuid)',sha256=h(body(r17,'private.r17_storage_key')),language='sql',definer=False,volatility='i',strict=False,setof=False,acl='private',resultType='text'))
for sig,b in new.items():manifest.append(dict(signature=sig,sha256=h(b),language='plpgsql',definer=sig.startswith('public.'),volatility='v',strict=False,setof=False,acl='optional_service' if sig.startswith('public.') else 'private',resultType='jsonb' if sig.startswith('public.') else 'void'))
# Every actual new function, including guards/metadata/export.
for match in re.finditer(r'create function ([a-z_]+\.[a-z_]+)\(([^\n]*)\) returns ([^\n]+)\nlanguage ([a-z]+) (immutable|stable|volatile)( security definer)? set search_path=\'\' as (\$[a-z_]+\$)([\s\S]*?)\7;',sql):
 n,args,result,lang,vol,definer,tag,b=match.groups()
 types=[]
 for a in args.split(',') if args else []:types.append(a.strip().split(' ',1)[1])
 manifest.append(dict(signature=n+'('+','.join(types)+')',sha256=h(b),language=lang,definer=bool(definer),volatility={'immutable':'i','stable':'s','volatile':'v'}[vol],strict=False,setof=False,acl='metadata' if n=='public.read_ai_budget_source_readiness' else 'optional_service' if n.startswith('public.') else 'private',resultType=result))
assert len({p['signature'] for p in manifest})==len(manifest)
assert any(p['signature']=='private.ai_budget_source_guard()' for p in manifest)
checker=r"""
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;rel pg_catalog.pg_class%rowtype;
 manifest jsonb:=$source_functions$MANIFEST$source_functions$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.ai_budget_claim_dispatch(uuid,uuid,jsonb)');
 if owner_oid is null or service_oid is null or private.owned_ai_budget_export_ready() is not true then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict is distinct from (item->>'strict')::boolean
    or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
    or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language')
    or p.proconfig is distinct from array['search_path=""'] or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
    and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl' in ('service','metadata') and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.ai_budget_source_ready()');
 if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.prosecdef or p.proretset or p.proisstrict or p.provolatile<>'s'
   or p.prorettype<>'boolean'::regtype or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
   or p.proconfig is distinct from array['search_path=""'] or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner)
   then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
 for rel in select * from pg_catalog.pg_class where oid in ('private.ai_budget_operation_sources'::regclass,'private.ai_budget_source_catalogue_seal'::regclass) loop
  if rel.relkind<>'r' or rel.relowner<>owner_oid or not rel.relrowsecurity or rel.relforcerowsecurity
    or exists(select 1 from pg_catalog.pg_policy where polrelid=rel.oid)
    or exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner)
    or exists(select 1 from pg_catalog.pg_attribute where attrelid=rel.oid and attnum>0 and not attisdropped and (atthasdef or attidentity<>'' or attgenerated<>''))
    or exists(select 1 from pg_catalog.pg_constraint where conrelid=rel.oid and contype='f') then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;
  end loop;
 end loop;
 if (select count(*) from private.ai_budget_source_catalogue_seal)<>1 or not exists(select 1 from private.ai_budget_source_catalogue_seal where singleton)
  or private.ifo_sha(private.ai_budget_source_catalogue()::text) is distinct from (select catalogue_sha256 from private.ai_budget_source_catalogue_seal where singleton)
  then return false;end if;
 for item in select value from jsonb_array_elements($source_triggers$[
  {"table":"private.ai_budget_operation_sources","name":"ai_budget_source_identity","function":"private.ai_budget_source_guard()","type":31},
  {"table":"private.ai_budget_operations","name":"ai_budget_source_operation_admission","function":"private.ai_budget_source_guard()","type":7},
  {"table":"private.ai_budget_attempts","name":"ai_budget_source_attempt_admission","function":"private.ai_budget_source_guard()","type":23},
  {"table":"private.ai_budget_source_catalogue_seal","name":"ai_budget_source_seal_closed","function":"private.ai_budget_source_seal_closed()","type":31},
  {"table":"public.resume_versions","name":"zy_retention_version_write","function":"private.r17_version_write_guard()","type":23},
  {"table":"public.resumes","name":"zy_retention_root_tombstone","function":"private.r17_root_tombstone_guard()","type":19}
 ]$source_triggers$::jsonb) loop
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass(item->>'table') and tgname=item->>'name'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure(item->>'function') and tgtype=(item->>'type')::smallint
    and tgnargs=0 and tgqual is null and tgconstraint=0) then return false;end if;
 end loop;
 if (select count(*) from pg_catalog.pg_trigger where tgrelid='private.ai_budget_source_catalogue_seal'::regclass and not tgisinternal)<>1 then return false;end if;
 return true;
exception when others then return false;
end;
""".replace('MANIFEST',json.dumps(manifest,separators=(',',':')))
sql+="create function private.ai_budget_source_ready() returns boolean\nlanguage plpgsql stable set search_path='' as $source_ready$"+checker+'$source_ready$;\n'
disp=old['private.owned_ai_disposition_ready()']
dcat=json.loads(literal(disp,'disposition_catalog'))
for p in dcat:
 if p['signature'] in new:p['sha256']=h(new[p['signature']])
dcat.append(dict(signature='private.ai_budget_source_ready()',sha256=h(checker),definer=False,volatility='s',language='plpgsql',setof=False,resultType='boolean',acl='private'))
disp=disp.replace(literal(disp,'disposition_catalog'),json.dumps(dcat,separators=(',',':')))
assert disp.count(' return true;')==1
disp=disp.replace(' return true;',' if private.ai_budget_source_ready() is not true then return false;end if;\n return true;')
new['private.owned_ai_disposition_ready()']=disp
patches=[dict(signature=sig,before=h(old[sig]),after=h(b),old=old[sig],new=b,setof=False) for sig,b in new.items()]
forward=r"""
do $source_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$source_patches$PATCHES$source_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
    or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
    then raise exception 'AI_SOURCE_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'AI_SOURCE_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
   then raise exception 'AI_SOURCE_POSTIMAGE_DRIFT' using errcode='23514';end if;
 end loop;
end;
$source_forward$;
""".replace('PATCHES',json.dumps(patches,separators=(',',':')))
sql+=forward
for p in manifest:
 if p['signature'].split('(')[0].startswith('private.ai_budget_source_') or p['signature'].split('(')[0] in ['public.ai_budget_reserve_source_next','public.export_owned_ai_budget_sources','public.read_ai_budget_source_readiness']:
  sql+='revoke all on function '+p['signature']+' from public,anon,authenticated,service_role;\n'
sql+="revoke all on function private.ai_budget_source_ready() from public,anon,authenticated,service_role;\ngrant execute on function public.read_ai_budget_source_readiness() to service_role;\n-- Reserve and source export stay explicitly default-denied; no activation here.\ncommit;\n"
(root/'supabase/migrations/20261115154855_ai_budget_source_registration.sql').write_text(sql)
profile="// Actual source pins only; data grants denied, Native/adoption unverified.\nexport const AI_BUDGET_SOURCE_PROFILE = Object.freeze({\n"
for key,value in dict(schemaVersion='ai-budget-source-readiness/1.0.0',profileVersion='ai-budget-source-profile/1.0.0',checkerSha256=h(checker),reserveSha256=h(body(sql,'public.ai_budget_reserve_source_next')),exportSha256=h(body(sql,'public.export_owned_ai_budget_sources')),metadataSha256=h(metadata)).items():profile+=f'  {key}: "{value}",\n'
profile+='});\n'
(root/'app/lib/server/ai-budget-source-profile.ts').write_text(profile)
p=read('app/lib/server/owned-ai-disposition-profile.ts')
# Only renew the actual two affected disposition pins.
for key,value in [('checkerSha256',h(disp)),('exportSha256',h(exp))]:p=re.sub(r'('+key+r':\s*")[a-f0-9]{64}("[ ,\n])',lambda m:m[1]+value+m[2],p)
(root/'app/lib/server/owned-ai-disposition-profile.ts').write_text(p)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n')
(t/'functions-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'migration':h(sql),'sourceChecker':h(checker),'dispositionChecker':h(disp),'bytes':len(sql),'functionPins':len(manifest)},indent=2))
