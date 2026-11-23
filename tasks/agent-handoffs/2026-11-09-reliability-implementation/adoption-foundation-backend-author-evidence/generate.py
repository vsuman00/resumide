from pathlib import Path
import json,re,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent;old=json.loads((t/'terminal-preimages.json').read_text());decl=json.loads((t/'decls.json').read_text());new={};h=lambda s:hashlib.sha256(s.encode()).hexdigest();core=(t/'core.sql').read_text();core=core.replace('alter table public.data_requests add column', (t/'preflight.sql').read_text()+'\nalter table public.data_requests add column',1)
# First durable clock insertion alone advances generation; retries keep both clock and epoch.
b=old['public.prepare_deletion_request'].replace('  first_at timestamptz;','  first_at timestamptz;inserted_clock integer;')
b=b.replace("    and lease_owner = p_worker_id", "    and lease_owner = p_worker_id\n    and attempt_count=p_attempt and lease_expires_at>clock_timestamp() and privacy_generation is not null")
b=b.replace('begin\n','begin\n  if private.privacy_generation_ready() is not true then raise exception \'PRIVACY_GENERATION_UNAVAILABLE\' using errcode=\'P0P01\';end if;\n',1)
needle="values(request_row.user_id,request_row.id,first_at,first_at+interval '720 hours','prepared') on conflict(owner_id) do nothing;";assert b.count(needle)==1
b=b.replace(needle,needle+"\n  get diagnostics inserted_clock=row_count;\n  if inserted_clock=1 then perform private.privacy_generation_advance(request_row.user_id);end if;")
core+="\ncreate function public.prepare_deletion_request(p_request_id uuid,p_worker_id text,p_attempt integer) returns jsonb\nlanguage plpgsql volatile security definer set search_path='' as $generation_prepare$"+b+'$generation_prepare$;\n'
# Current actual claim frame/attempt retained; hidden stamp has no input/default/backfill.
n='public.claim_privacy_request';b=old[n].replace('  request_row public.data_requests%rowtype;','  request_row public.data_requests%rowtype;generation_now bigint;')
b=b.replace('  select * into request_row',"  if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';end if;\n  generation_now:=private.privacy_generation_current();\n  select * into request_row",1)
b=b.replace("  set status = 'processing',", "  set status = 'processing',\n      privacy_generation=generation_now,")
new[n]=b
new['public.prepare_deletion_request']="\nbegin raise exception 'PRIVACY_CLAIM_FENCE_REQUIRED' using errcode='42501';end;\n"
for n in ['public.complete_privacy_request','public.fail_privacy_request']:new[n]='\nbegin return false;end;\n'
n='private.expire_owned_ai_disposition';b=old[n];needle=' perform private.owned_ai_expiry_require_adoption(p_owner_id);';assert b.count(needle)==1;new[n]=b.replace(needle,needle+'\n perform private.privacy_generation_advance(p_owner_id);')
# New closed catalogue covers request column/ACL/trigger changes without touching old seals.
cat=old['private.owned_ai_expiry_catalogue'];i=cat.index(' from pg_catalog.pg_class c where c.oid in (');cat=cat[:i]+" from pg_catalog.pg_class c where c.oid in ('private.privacy_export_generation'::regclass,'public.data_requests'::regclass,'private.privacy_generation_catalogue_seal'::regclass);\n";cat=cat.replace("c.relname='owned_ai_expiry_catalogue_seal' and t.tgname='owned_ai_expiry_seal_closed'","c.relname='privacy_generation_catalogue_seal' and t.tgname='privacy_generation_seal_closed'")
core+="create function private.privacy_generation_catalogue() returns jsonb\nlanguage sql stable set search_path='' as $generation_catalogue$"+cat+'$generation_catalogue$;\n'
def direct(s):
 result={}
 for m in re.finditer(r'^create(?: or replace)? function ([a-z_]+\.[a-z_0-9]+)\(',s,re.I|re.M):
  q=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s[m.start():],re.I);assert q,m[1];result[m[1]+('#prepare' if m[1]=='public.prepare_deletion_request' else '')]=(q[2],s[m.start():m.start()+q.end()])
 return result
def entry(n,definition,b,acl='private'):
 n=n.split('#')[0];header=definition.split(' as $')[0];args=re.search(re.escape(n)+r'\(([\s\S]*?)\)\s*returns',header,re.I)[1];types=[a.strip().split(None,1)[1] for a in args.split(',')] if args else []
 result=re.search(r'\)\s*returns ([^\n]+)',header,re.I)[1].split(' language ')[0]
 return dict(signature=n+'('+','.join(types)+')',sha256=h(b),language=re.search(r'language\s+(\w+)',header,re.I)[1].lower(),definer='security definer' in header.lower(),volatility='s' if ' stable ' in ' '+header.lower()+' ' else 'v',strict=bool(re.search(r'\bstrict\b',header,re.I)),setof=False,acl=acl,resultType=result)
created=direct(core);manifest=[entry(n,definition,b,'service' if n.startswith('public.') else 'private') for n,(b,definition) in created.items()]
manifest+=[entry(n,decl[n],old[n],'optional_service') for n in ['private.serialize_deletion_request','private.set_updated_at','private.initialize_privacy_request_steps']]
manifest+=[entry(n,decl[n],b,'service' if n=='public.claim_privacy_request' else 'optional_service' if n.startswith('public.') else 'private') for n,b in new.items()]
ready=r'''
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;column_row record;rel pg_catalog.pg_class%rowtype;
 manifest jsonb:=$generation_functions$MANIFEST$generation_functions$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if owner_oid is null or service_oid is null or (select relowner from pg_catalog.pg_class where oid='public.data_requests'::regclass)<>owner_oid then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict is distinct from (item->>'strict')::boolean
   or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility' or p.prorettype<>to_regtype(item->>'resultType')
   or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language') or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
   and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl'='service' and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 for rel in select * from pg_catalog.pg_class where oid in ('private.privacy_export_generation'::regclass,'private.privacy_generation_catalogue_seal'::regclass) loop
  if rel.relowner<>owner_oid or rel.relkind<>'r' or not rel.relrowsecurity or rel.relforcerowsecurity
   or exists(select 1 from pg_catalog.pg_policy where polrelid=rel.oid)
   or exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner) then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;end loop;
 end loop;
 if (select count(*) from private.privacy_export_generation)<>1 or not exists(select 1 from private.privacy_export_generation where singleton and generation>=0)
  or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.data_requests'::regclass and attname='privacy_generation' and not attisdropped
   and atttypid='bigint'::regtype and not attnotnull and not atthasdef and attidentity='' and attgenerated='') then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.data_requests','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then return false;end if;
  for column_row in select attname from pg_catalog.pg_attribute where attrelid='public.data_requests'::regclass and attnum>0 and not attisdropped loop
   if has_column_privilege(role_name,'public.data_requests',column_row.attname,'INSERT') and not(role_name='service_role' and column_row.attname in ('id','organization_id','user_id','kind','status'))
    or has_column_privilege(role_name,'public.data_requests',column_row.attname,'UPDATE') and not(role_name='service_role' and column_row.attname='status')
    or has_column_privilege(role_name,'public.data_requests',column_row.attname,'REFERENCES') then return false;end if;
  end loop;
 end loop;
 if not has_column_privilege('service_role','public.data_requests','status','UPDATE')
  or not has_table_privilege('service_role','public.data_requests','SELECT')
  or not has_column_privilege('service_role','public.data_requests','id','INSERT')
  or not has_column_privilege('service_role','public.data_requests','organization_id','INSERT')
  or not has_column_privilege('service_role','public.data_requests','user_id','INSERT')
  or not has_column_privilege('service_role','public.data_requests','kind','INSERT')
  or not has_column_privilege('service_role','public.data_requests','status','INSERT') then return false;end if;
 if (select count(*) from private.privacy_generation_catalogue_seal)<>1 or not exists(select 1 from private.privacy_generation_catalogue_seal where singleton
  and catalogue_sha256=private.ifo_sha(private.privacy_generation_catalogue()::text)) then return false;end if;
 if (select count(*) from pg_catalog.pg_trigger where tgrelid='private.privacy_generation_catalogue_seal'::regclass and not tgisinternal)<>1
  or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.privacy_generation_catalogue_seal'::regclass and tgname='privacy_generation_seal_closed'
   and tgfoid=to_regprocedure('private.privacy_generation_seal_closed()') and tgtype=31 and tgenabled='O' and not tgisinternal and not tgdeferrable and not tginitdeferred
   and tgnargs=0 and tgargs='\x'::bytea and tgqual is null and tgoldtable is null and tgnewtable is null) then return false;end if;
 return true;
exception when others then return false;
end;
'''.replace('MANIFEST',json.dumps(manifest,separators=(',',':')))
core+="create function private.privacy_generation_ready() returns boolean\nlanguage plpgsql stable set search_path='' as $generation_ready$"+ready+'$generation_ready$;\n';created=direct(core)
# Renew exact closure; append the actual fenced producer authority where predecessor manifests pinned old overloads.
checkers=['private.owned_ai_expiry_safety_ready','private.owned_ai_retirement_ready','private.initial_feedback_ready','private.owned_legacy_ai_usage_ready','private.ai_budget_source_ready','private.owned_ai_disposition_ready','private.owned_ai_expiry_ready']
helper=entry('private.privacy_generation_ready',created['private.privacy_generation_ready'][1],ready)
for n in checkers:
 b=old[n]
 for dep,code in new.items():b=b.replace(h(old[dep]),h(code))
 if n in ['private.owned_ai_expiry_safety_ready','private.owned_ai_retirement_ready','private.owned_legacy_ai_usage_ready','private.owned_ai_disposition_ready']:
  tag={'private.owned_ai_expiry_safety_ready':'expiry_safety_functions','private.owned_ai_retirement_ready':'retirement_catalog','private.owned_legacy_ai_usage_ready':'legacy_functions','private.owned_ai_disposition_ready':'disposition_functions'}[n]
  if '$'+tag+'$' not in b:
   tags=re.findall(r'\$([a-z_]+)\$\[',b);assert len(tags)==1,(n,tags);tag=tags[0]
  v=b.split('$'+tag+'$')[1];rows=json.loads(v);rows.append(helper);b=b.replace(v,json.dumps(rows,separators=(',',':')))
 assert b!=old[n],n;new[n]=b
patches=[dict(signature=entry(n,decl[n],b)['signature'],before=h(old[n]),after=h(b),old=old[n],new=b) for n,b in new.items()]
forward='''
do $privacy_generation_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$privacy_generation_patches$PATCHES$privacy_generation_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
   then raise exception 'PRIVACY_GENERATION_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'PRIVACY_GENERATION_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
  then raise exception 'PRIVACY_GENERATION_POSTIMAGE_DRIFT' using errcode='23514';end if;end loop;
end;
$privacy_generation_forward$;
'''.replace('PATCHES',json.dumps(patches,separators=(',',':')))
sql=core+forward+"\ninsert into private.privacy_generation_catalogue_seal values(true,private.ifo_sha(private.privacy_generation_catalogue()::text));\ncreate trigger privacy_generation_seal_closed before insert or update or delete on private.privacy_generation_catalogue_seal for each row execute function private.privacy_generation_seal_closed();\n"
for n,(body,definition) in created.items():
 sig=entry(n,definition,body)['signature'];sql+='revoke all on function '+sig+' from public,anon,authenticated,service_role;\n'
 if n.startswith('public.'):sql+='grant execute on function '+sig+' to service_role;\n'
sql+='-- No expiry/adoption grants, authority seed or clock backfill.\ncommit;\n';(r/'supabase/migrations/20261116075250_privacy_export_generation.sql').write_text(sql)
a=json.loads((t/'allocation.json').read_text())
for file in a['files']:
 if not file.startswith('app/') or not file.endswith('-profile.ts'):continue
 s=(t/'preimages'/file).read_text()
 for n,body in new.items():s=s.replace(h(old[n]),h(body))
 assert s!=(t/'preimages'/file).read_text(),file;(r/file).write_text(s)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n');(t/'created-bodies.json').write_text(json.dumps({entry(n,definition,body)['signature']:body for n,(body,definition) in created.items()},indent=2)+'\n');(t/'functions-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'migration':h(sql),'bytes':len(sql),'patches':len(patches),'created':len(created),'pins':len(manifest)},indent=2))
