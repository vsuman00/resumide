from pathlib import Path
import runpy,re,json,hashlib
root=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
state=runpy.run_path(str(t/'resolve.py'));old=state['current'];decl=state['declarations'];new={};h=lambda s:hashlib.sha256(s.encode()).hexdigest()
def block(s,n):return s.split('$'+n+'$')[1]
def direct(s):
 out={}
 for m in re.finditer(r'create(?: or replace)? function ([a-z_]+\.[a-z_]+)\(',s,re.I):
  b=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s[m.start():],re.I);out[m[1]]=(b[2],s[m.start():m.start()+b.end()])
 return out
core=(t/'core.sql').read_text()
pre="""-- Lock existing catalogue/parent relations and prove the frozen predecessor before bootstrap.
lock table private.owned_ai_deletion_dispositions,private.owned_ai_operation_dispositions,private.owned_ai_disposition_catalogue_seal,private.retention_items,public.analysis_ai_runs,public.analyses,public.resume_versions,public.resumes,private.canonical_rewrite_operations,private.initial_feedback_operations,private.initial_feedback_attempts,private.initial_feedback_publications,private.initial_feedback_content_retirements in access exclusive mode;
do $usage_preflight$
begin
 if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_ai_disposition_ready()')) is distinct from 'OLD_READY'
  or private.owned_ai_disposition_ready() is not true then raise exception 'OWNED_LEGACY_AI_USAGE_PREIMAGE_DRIFT' using errcode='23514';end if;
end;
$usage_preflight$;
""".replace('OLD_READY',h(old['private.owned_ai_disposition_ready']))
core=core.replace('create table private.owned_legacy_ai_usage_retirements(',pre+'create table private.owned_legacy_ai_usage_retirements(',1)
# Both actual final erasure producers capture in their existing transaction.
n='public.prepare_deletion_request';b=old[n];needle='perform private.retire_initial_feedback_publications(request_row.user_id,null,request_row.id,null);';assert b.count(needle)==1
new[n]=b.replace(needle,'perform private.capture_owned_legacy_ai_usage(request_row.user_id,null,request_row.id,null);\n  '+needle)
n='public.complete_retention_item';b=old[n];needle='perform private.retire_initial_feedback_publications(root_row.owner_id,root_row.id,null,item_row.id);';assert b.count(needle)==1
new[n]=b.replace(needle,'perform private.capture_owned_legacy_ai_usage(root_row.owner_id,root_row.id,null,item_row.id);\n  '+needle)
n='public.get_organization_ai_tokens_used';new[n]="\n select private.read_preserved_organization_ai_tokens(p_organization_id,p_since);\n"
n='public.read_initial_feedback_usage';b=old[n]
needle="  -- One statement snapshot; link validation/exclusion has NO month predicate."
assert b.count(needle)==1
insert="""  if private.owned_legacy_ai_usage_ready() is not true then perform private.ifo_fail('unavailable');end if;
"""
b=b.replace(needle,insert+needle)
b=b.replace('  with canonical_scope as materialized (','  with preserved_integrity as materialized (select private.assert_owned_legacy_ai_usage_month(a.organization_id,period_start) proved), canonical_scope as materialized (',1)
b=b.replace('from legacy cross join canonical cross join feedback cross join integrity;','from legacy cross join canonical cross join feedback cross join integrity cross join preserved_integrity where preserved_integrity.proved;',1)

needle="select legacy.tokens,canonical.tokens,feedback.tokens,canonical.unknown_count+feedback.unknown_count,"
assert b.count(needle)==1
b=b.replace(needle,"select legacy.tokens+(select coalesce(sum(t.input_tokens::numeric+t.output_tokens::numeric),0) from private.owned_legacy_ai_usage_retirements t\n      where t.organization_id=a.organization_id and t.classification='legacy_unlinked' and t.original_month=period_start\n        and not exists(select 1 from public.analysis_ai_runs r where r.id=t.run_id)),canonical.tokens,feedback.tokens,canonical.unknown_count+feedback.unknown_count,")
new[n]=b
# Renew exact existing checker digests; source checker is linked after new readiness exists.
def renew(name):
 b=old[name]
 for n,v in new.items():
  if n!=name:b=b.replace(h(old[n]),h(v))
 return b
for name in ['private.owned_ai_retirement_ready','private.initial_feedback_ready']:new[name]=renew(name)
# New independent metadata/closed catalogue, no existing seal is updated or resealed.
cat=old['private.ai_budget_source_catalogue']
start=cat.index(" from pg_catalog.pg_class c where c.oid in (")
cat=cat[:start]+" from pg_catalog.pg_class c where c.oid in ('private.owned_legacy_ai_usage_retirements'::regclass,'private.owned_legacy_ai_usage_catalogue_seal'::regclass,'public.analysis_ai_runs'::regclass,'public.analyses'::regclass,'public.resume_versions'::regclass,'public.resumes'::regclass,'private.owned_ai_deletion_dispositions'::regclass,'private.owned_ai_disposition_catalogue_seal'::regclass,'private.initial_feedback_content_retirements'::regclass);\n"
cat=cat.replace("c.relname='ai_budget_source_v2_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'","c.relname='owned_legacy_ai_usage_catalogue_seal' and t.tgname='owned_legacy_ai_usage_seal_closed'")
core+="\ncreate function private.owned_legacy_ai_usage_catalogue() returns jsonb\nlanguage sql stable set search_path='' as $legacy_catalogue$"+cat+'$legacy_catalogue$;\n'
core+="""create function private.owned_legacy_ai_usage_seal_closed() returns trigger
language plpgsql volatile set search_path='' as $legacy_seal_closed$
begin raise exception 'OWNED_LEGACY_AI_USAGE_SEAL_CLOSED' using errcode='23514';end;
$legacy_seal_closed$;
"""
metadata="""
declare ready boolean:=private.owned_legacy_ai_usage_ready();
begin
 return jsonb_build_object('schemaVersion','owned-legacy-ai-usage-readiness/1.0.0','profileVersion','owned-legacy-ai-usage-profile/1.0.0',
  'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_legacy_ai_usage_ready()')),
  'captureSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.capture_owned_legacy_ai_usage(uuid,uuid,uuid,uuid)')),
  'exportSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.export_owned_legacy_ai_usage_records(uuid)')),
  'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_owned_legacy_ai_usage_readiness()')),
  'schemaReady',ready,'exportExecutable',ready and has_function_privilege('service_role','public.export_owned_legacy_ai_usage_records(uuid)','EXECUTE'));
end;
"""
core+="create function public.read_owned_legacy_ai_usage_readiness() returns jsonb\nlanguage plpgsql stable security definer set search_path='' as $legacy_metadata$"+metadata+'$legacy_metadata$;\n'
created=direct(core)
def entry(name,definition,code,acl='private'):
 header=definition.split(' as $',1)[0];args=re.search(re.escape(name)+r'\(([\s\S]*?)\)\s*returns',header)[1];types=[a.strip().split(None,1)[1] for a in args.split(',')] if args else []
 result=re.search(r'\)\s*returns ([^\n]+)',header,re.I)[1]
 if ' language ' in result:result=result.split(' language ')[0]
 setof=result.lower().startswith('table(') or result.lower().startswith('setof ')
 if result.lower().startswith('table('):result='record'
 if result.lower().startswith('setof '):result=result[6:]
 return dict(signature=name+'('+','.join(types)+')',sha256=h(code),language=re.search(r'language\s+(\w+)',header,re.I)[1].lower(),definer='security definer' in header.lower(),volatility='i' if ' immutable ' in ' '+header.lower()+' ' else 's' if ' stable ' in ' '+header.lower()+' ' else 'v',strict=bool(re.search(r'\bstrict\b',header,re.I)),setof=setof,acl=acl,resultType=result)
manifest=[]
for name,(code,definition) in created.items():manifest.append(entry(name,definition,code,'metadata' if name=='public.read_owned_legacy_ai_usage_readiness' else 'optional_service' if name.startswith('public.') else 'private'))
deps=['public.prepare_deletion_request','public.complete_retention_item','public.read_initial_feedback_usage','public.get_organization_ai_tokens_used','private.owned_ai_retirement_ready','private.initial_feedback_ready','private.try_lock_candidate_owners','private.candidate_owner_lock_keys','private.r17_root_covered','private.r17_storage_key','private.ifo_usage_valid','private.ifo_sha','private.ifo_stamp','private.owned_ai_disposition_guard','private.owned_ai_disposition_catalogue','private.retire_initial_feedback_publications']
for name in deps:manifest.append(entry(name,decl[name],new.get(name,old[name]),'service' if name in ['public.prepare_deletion_request','public.complete_retention_item','public.get_organization_ai_tokens_used'] else 'optional_service' if name.startswith('public.') else 'private'))
checker=r"""
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;rel pg_catalog.pg_class%rowtype;column_name text;
 manifest jsonb:=$legacy_functions$MANIFEST$legacy_functions$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if owner_oid is null or service_oid is null or private.initial_feedback_ready() is not true then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset is distinct from (item->>'setof')::boolean or p.proisstrict is distinct from (item->>'strict')::boolean
   or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility'
   or p.prorettype<>to_regtype(item->>'resultType') or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language')
   or p.proconfig is distinct from array['search_path=""'] or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
    and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl' in ('service','metadata') and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_legacy_ai_usage_ready()');
 if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.prosecdef or p.proretset or p.proisstrict or p.provolatile<>'s' or p.prorettype<>'boolean'::regtype
   or p.proconfig is distinct from array['search_path=""'] or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then return false;end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
 for rel in select * from pg_catalog.pg_class where oid in ('private.owned_legacy_ai_usage_retirements'::regclass,'private.owned_legacy_ai_usage_catalogue_seal'::regclass) loop
  if rel.relkind<>'r' or rel.relowner<>owner_oid or not rel.relrowsecurity or rel.relforcerowsecurity
    or exists(select 1 from pg_catalog.pg_policy where polrelid=rel.oid)
    or exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner)
    or exists(select 1 from pg_catalog.pg_attribute where attrelid=rel.oid and attnum>0 and not attisdropped and (atthasdef or attidentity<>'' or attgenerated<>''))
    or exists(select 1 from pg_catalog.pg_constraint where conrelid=rel.oid and contype='f') then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;end loop;
 end loop;
 -- Parent locks rely on the actual validated cascade FKs, never a learned missing key.
 if not exists(select 1 from pg_catalog.pg_constraint k where k.conrelid='public.analysis_ai_runs'::regclass and k.contype='p' and k.convalidated
   and (select array_agg(a.attname::text order by v.ordinality) from unnest(k.conkey) with ordinality v(n,ordinality)
     join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=v.n)=array['id']) then return false;end if;
 for item in select value from jsonb_array_elements($legacy_source_fks$[
  {"child":"public.analysis_ai_runs","parent":"public.analyses","column":"analysis_id"},
  {"child":"public.analyses","parent":"public.resume_versions","column":"resume_version_id"},
  {"child":"public.resume_versions","parent":"public.resumes","column":"resume_id"}
 ]$legacy_source_fks$::jsonb) loop
  if not exists(select 1 from pg_catalog.pg_constraint k where k.conrelid=to_regclass(item->>'child') and k.confrelid=to_regclass(item->>'parent')
    and k.contype='f' and k.convalidated and not k.condeferrable and k.confdeltype='c'
    and (select array_agg(a.attname::text order by v.ordinality) from unnest(k.conkey) with ordinality v(n,ordinality)
      join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=v.n)=array[item->>'column']
    and (select array_agg(a.attname::text order by v.ordinality) from unnest(k.confkey) with ordinality v(n,ordinality)
      join pg_catalog.pg_attribute a on a.attrelid=k.confrelid and a.attnum=v.n)=array['id']
    and exists(select 1 from pg_catalog.pg_trigger g where g.tgconstraint=k.oid and g.tgrelid=k.conrelid)
    and exists(select 1 from pg_catalog.pg_trigger g where g.tgconstraint=k.oid and g.tgrelid=k.confrelid)
    and not exists(select 1 from pg_catalog.pg_trigger g where g.tgconstraint=k.oid and g.tgenabled<>'O')) then return false;end if;
 end loop;
 -- Actual source INT counters must retain their original NOT NULL and >=0 CHECK.
 foreach column_name in array array['input_tokens','output_tokens'] loop
  if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.analysis_ai_runs'::regclass and a.attname=column_name
    and a.atttypid='integer'::regtype and a.attnotnull and not a.attisdropped)
   or not exists(select 1 from pg_catalog.pg_constraint k where k.conrelid='public.analysis_ai_runs'::regclass and k.contype='c' and k.convalidated
    and regexp_replace(pg_get_expr(k.conbin,k.conrelid),'[[:space:]()"]','','g')=column_name||'>=0') then return false;end if;
 end loop;
 if private.owned_ai_disposition_catalogue() is distinct from (select catalogue from private.owned_ai_disposition_catalogue_seal where singleton)
   then return false;end if;
 if (select count(*) from private.owned_legacy_ai_usage_catalogue_seal)<>1 or not exists(select 1 from private.owned_legacy_ai_usage_catalogue_seal where singleton)
   or private.ifo_sha(private.owned_legacy_ai_usage_catalogue()::text) is distinct from (select catalogue_sha256 from private.owned_legacy_ai_usage_catalogue_seal where singleton) then return false;end if;
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.owned_legacy_ai_usage_retirements'::regclass and tgname='owned_legacy_ai_usage_guard'
   and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.owned_legacy_ai_usage_guard()') and tgtype=31 and tgnargs=0 and tgqual is null and tgconstraint=0)
  or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.owned_legacy_ai_usage_catalogue_seal'::regclass and tgname='owned_legacy_ai_usage_seal_closed'
   and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.owned_legacy_ai_usage_seal_closed()') and tgtype=31 and tgnargs=0 and tgqual is null and tgconstraint=0)
  or (select count(*) from pg_catalog.pg_trigger where tgrelid='private.owned_legacy_ai_usage_catalogue_seal'::regclass and not tgisinternal)<>1 then return false;end if;
 return true;
exception when others then return false;
end;
""".replace('MANIFEST',json.dumps(manifest,separators=(',',':')))
core+="create function private.owned_legacy_ai_usage_ready() returns boolean\nlanguage plpgsql stable set search_path='' as $legacy_ready$"+checker+'$legacy_ready$;\n'
# Add the independent new schema prerequisite to source admission. No hash cycle:
# the new checker pins full/retirement/readers/producers, never source/disposition ready.
n='private.ai_budget_source_ready';b=renew(n);sm=json.loads(block(b,'source_functions'));sm.append(dict(signature='private.owned_legacy_ai_usage_ready()',sha256=h(checker),language='plpgsql',definer=False,volatility='s',strict=False,setof=False,acl='private',resultType='boolean'))
b=b.replace(block(b,'source_functions'),json.dumps(sm,separators=(',',':')))
assert b.count(' return true;')==1;b=b.replace(' return true;',' if private.owned_legacy_ai_usage_ready() is not true then return false;end if;\n return true;');new[n]=b
new['private.owned_ai_disposition_ready']=renew('private.owned_ai_disposition_ready')
patches=[]
for n,b in new.items():patches.append(dict(signature=entry(n,decl[n],b)['signature'],before=h(old[n]),after=h(b),old=old[n],new=b,setof=False))
forward=r"""
do $usage_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$usage_patches$PATCHES$usage_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
   then raise exception 'OWNED_LEGACY_AI_USAGE_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'OWNED_LEGACY_AI_USAGE_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
  then raise exception 'OWNED_LEGACY_AI_USAGE_POSTIMAGE_DRIFT' using errcode='23514';end if;end loop;
end;
$usage_forward$;
""".replace('PATCHES',json.dumps(patches,separators=(',',':')))
sql=core+forward+"\ninsert into private.owned_legacy_ai_usage_catalogue_seal(singleton,catalogue_sha256) values(true,private.ifo_sha(private.owned_legacy_ai_usage_catalogue()::text));\ncreate trigger owned_legacy_ai_usage_seal_closed before insert or update or delete on private.owned_legacy_ai_usage_catalogue_seal for each row execute function private.owned_legacy_ai_usage_seal_closed();\n"
for name,(code,definition) in created.items():sql+='revoke all on function '+entry(name,definition,code)['signature']+' from public,anon,authenticated,service_role;\n'
sql+="revoke all on function private.owned_legacy_ai_usage_ready() from public,anon,authenticated,service_role;\ngrant execute on function public.read_owned_legacy_ai_usage_readiness() to service_role;\n-- New data export remains explicitly default-denied; no expiry mutator.\ncommit;\n"
(root/'supabase/migrations/20261115172527_owned_legacy_ai_usage_retention.sql').write_text(sql)
profile="// Actual source pins only; export denied, Native/purge/expiry unverified.\nexport const OWNED_LEGACY_AI_USAGE_PROFILE=Object.freeze({\n"
for key,value in dict(schemaVersion='owned-legacy-ai-usage-readiness/1.0.0',profileVersion='owned-legacy-ai-usage-profile/1.0.0',checkerSha256=h(checker),captureSha256=h(created['private.capture_owned_legacy_ai_usage'][0]),exportSha256=h(created['public.export_owned_legacy_ai_usage_records'][0]),metadataSha256=h(metadata)).items():profile+=f' {key}:"{value}",\n'
profile+='});\n';(root/'app/lib/server/owned-legacy-ai-usage-profile.ts').write_text(profile)
profiles={'app/lib/server/initial-feedback-profile.ts':{'INITIAL_FEEDBACK_PROFILE':{'checkerSha256':'private.initial_feedback_ready','usageSha256':'public.read_initial_feedback_usage'},'OWNED_AI_RETIREMENT_PROFILE':{'checkerSha256':'private.owned_ai_retirement_ready'}},'app/lib/server/ai-budget-source-profile.ts':{'AI_BUDGET_SOURCE_PROFILE':{'checkerSha256':'private.ai_budget_source_ready'}},'app/lib/server/owned-ai-disposition-profile.ts':{'OWNED_AI_DISPOSITION_PROFILE':{'checkerSha256':'private.owned_ai_disposition_ready'}}}
for file,constants in profiles.items():
 source=(t/'preimages'/file).read_text()
 for constant,values in constants.items():
  start=source.index('export const '+constant+' = Object.freeze(');end=source.index(');',start)+2;section=source[start:end]
  for key,name in values.items():section,n=re.subn(r'('+key+r':\s*")[a-f0-9]{64}("[ ,\n])',lambda m:m[1]+h(new[name])+m[2],section,count=1);assert n==1
  source=source[:start]+section+source[end:]
 (root/file).write_text(source)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n');(t/'functions-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(t/'old-bodies.json').write_text(json.dumps({n:old[n] for n in new},indent=2)+'\n')
print(json.dumps({'migration':h(sql),'bytes':len(sql),'patches':len(patches),'profileChecker':h(checker),'functionPins':len(manifest),'newFunctions':len(created)+1},indent=2))
