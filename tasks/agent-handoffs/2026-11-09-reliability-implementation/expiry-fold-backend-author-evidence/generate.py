from pathlib import Path
import re,json,hashlib,runpy
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
p=t/'resolve.py';s=p.read_text().replace("if f.name>='20261116000000':continue","if f.name>='20261115190341':continue");p.write_text(s)
state=runpy.run_path(str(p));old=state['current'];decl=state['declarations'];new={};h=lambda s:hashlib.sha256(s.encode()).hexdigest()
core=(t/'combined.sql').read_text()
# Global safety has a separately sealed finite source/schema guard, avoiding a checker hash cycle.
a=core.index('create function private.owned_ai_expiry_global_blocked(');z=core.index('$expiry_global$;',a)+len('$expiry_global$;')
core=core[:a]+'''create function private.owned_ai_expiry_global_blocked(p_month date) returns boolean
language plpgsql volatile set search_path='' as $expiry_global$
begin
 if private.owned_ai_expiry_read_lock() is not true then return true;end if;
 if private.owned_ai_expiry_safety_ready() is not true then return true;end if;
 return exists(select 1 from private.owned_ai_expiry_months m where
  m.shared_unknown_claims>0 or m.technical_reserved_tokens>0 or m.technical_reserved_cost_microusd>0
  or m.technical_unknown_claims>0 or m.unreconciled_overages>0 or m.unresolved_pool_deficits>0
  or (m.month=p_month and (m.shared_known_tokens>0 or m.technical_spent_tokens>0 or m.technical_spent_cost_microusd>0)));
end;
$expiry_global$;'''+core[z:]
core+='''
create function private.owned_ai_expiry_late_lock(p_owner uuid,p_kind text,p_analysis uuid,p_operation uuid) returns void
language plpgsql volatile set search_path='' as $expiry_late_lock$
declare k bigint;
begin
 foreach k in array private.candidate_owner_lock_keys(array[p_owner]) loop
  if not pg_try_advisory_xact_lock_shared(k) then raise exception 'OWNED_AI_EXPIRY_RETRY' using errcode='55P03';end if;
 end loop;
 if private.owned_ai_expiry_due(p_owner,p_kind,p_analysis,p_operation) then raise exception 'OWNED_AI_EXPIRY_CLOSED' using errcode='P0E01';end if;
end;
$expiry_late_lock$;
create function private.owned_ai_expiry_month_guard() returns trigger
language plpgsql volatile set search_path='' as $expiry_month_guard$
begin
 if tg_op='DELETE' or not exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current())
  or private.owned_ai_expiry_adoption_ready() is not true then raise exception 'OWNED_AI_EXPIRY_MONTH_AUTHORITY' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.month<>old.month or new.shared_known_tokens<old.shared_known_tokens or new.shared_unknown_claims<old.shared_unknown_claims
  or new.technical_spent_tokens<old.technical_spent_tokens or new.technical_spent_cost_microusd<old.technical_spent_cost_microusd
  or new.technical_reserved_tokens<old.technical_reserved_tokens or new.technical_reserved_cost_microusd<old.technical_reserved_cost_microusd
  or new.technical_unknown_claims<old.technical_unknown_claims or new.unreconciled_overages<old.unreconciled_overages or new.unresolved_pool_deficits<old.unresolved_pool_deficits or new.legacy_erased_runs<old.legacy_erased_runs)
  then raise exception 'OWNED_AI_EXPIRY_MONTH_IMMUTABLE' using errcode='23514';end if;
 return new;
end;
$expiry_month_guard$;
create trigger owned_ai_expiry_month_guard before insert or update or delete on private.owned_ai_expiry_months for each row execute function private.owned_ai_expiry_month_guard();
create table private.owned_ai_expiry_catalogue_seal(singleton boolean primary key check(singleton),catalogue_sha256 text not null check(catalogue_sha256 collate "C" ~ '^[a-f0-9]{64}$'));
alter table private.owned_ai_expiry_catalogue_seal enable row level security;
revoke all on private.owned_ai_expiry_catalogue_seal from public,anon,authenticated,service_role;
create function private.owned_ai_expiry_seal_closed() returns trigger
language plpgsql volatile set search_path='' as $expiry_seal_closed$
begin raise exception 'OWNED_AI_EXPIRY_SEAL_CLOSED' using errcode='23514';end;
$expiry_seal_closed$;
'''
cat=old['private.owned_legacy_ai_usage_catalogue'];start=cat.index(' from pg_catalog.pg_class c where c.oid in (');cat=cat[:start]+" from pg_catalog.pg_class c where c.oid in ('private.owned_ai_expiry_months'::regclass,'private.owned_ai_expiry_work'::regclass,'private.owned_ai_expiry_adoption_capability'::regclass,'private.owned_ai_expiry_catalogue_seal'::regclass);\n"
cat=cat.replace("c.relname='owned_legacy_ai_usage_catalogue_seal' and t.tgname='owned_legacy_ai_usage_seal_closed'","c.relname='owned_ai_expiry_catalogue_seal' and t.tgname='owned_ai_expiry_seal_closed'")
core+="create function private.owned_ai_expiry_catalogue() returns jsonb\nlanguage sql stable set search_path='' as $expiry_catalogue$"+cat+'$expiry_catalogue$;\n'
metadata='''
declare ready boolean:=private.owned_ai_expiry_ready();
begin
 return jsonb_build_object('schemaVersion','owned-ai-expiry-readiness/1.0.0','profileVersion','owned-ai-expiry-profile/1.0.0',
  'schemaReady',ready,'foldExecutable',ready and private.owned_ai_expiry_adoption_ready() and has_function_privilege('service_role','public.sweep_owned_ai_expiry(integer)','EXECUTE'),
  'checkerSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_ai_expiry_ready()')),
  'sweepSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.sweep_owned_ai_expiry(integer)')),
  'metadataSha256',(select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_owned_ai_expiry_readiness()')));
end;
'''
core+="create function public.read_owned_ai_expiry_readiness() returns jsonb\nlanguage plpgsql stable security definer set search_path='' as $expiry_metadata$"+metadata+'$expiry_metadata$;\n'
# Relationally selected DELETE only; every old INSERT/UPDATE byte stays intact.
for n in ['private.ai_budget_immutable','private.ifo_immutable','private.ifo_attempt_guard','private.owned_ai_retirement_guard','private.owned_ai_disposition_guard','private.ai_budget_source_guard','private.owned_legacy_ai_usage_guard']:
 b=old[n];needle='begin\n';assert b.count(needle)==1,n
 new[n]=b.replace(needle,needle+" if tg_op='DELETE' and private.owned_ai_expiry_delete_allowed(tg_table_name,to_jsonb(old)) then return old;end if;\n",1)
n='private.ai_budget_blocked';b=old[n];assert b.count('  select exists(')==1
new[n]=b.replace('  select exists(',"  select private.owned_ai_expiry_global_blocked(date_trunc('month',clock_timestamp() at time zone 'UTC')::date) or exists(",1)
n='private.assert_owned_legacy_ai_usage_month';needle=' perform private.assert_owned_legacy_ai_usage(p_org);';assert old[n].count(needle)==1
new[n]=old[n].replace(needle,needle+"\n if private.owned_ai_expiry_global_blocked(p_month) then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;")
n='private.read_preserved_organization_ai_tokens';b=old[n];needle='begin\n';assert b.count(needle)==1
new[n]=b.replace(needle,needle+" if private.owned_ai_expiry_since_blocked(p_since) then raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE' using errcode='23514';end if;\n",1)
n='private.ai_budget_transition';needle="  if p_action='reserve' then";assert old[n].count(needle)==1
new[n]=old[n].replace(needle,"  if operation_exists and p_action not in ('reserve','claim_dispatch') then perform private.owned_ai_expiry_late_lock(p_user_id,'r03',null,op_id);end if;\n"+needle)
for n,needle,call in [
 ('public.settle_canonical_rewrite_attempt',"  if op.binding_sha256 is distinct from p_binding_sha256", "private.owned_ai_expiry_late_lock(op.owner_id,'a12',op.analysis_id,op.operation_id)"),
 ('public.finish_canonical_rewrite',"  if op.binding_sha256 is distinct from p_binding_sha256", "private.owned_ai_expiry_late_lock(op.owner_id,'a12',op.analysis_id,op.operation_id)"),
 ('public.settle_initial_feedback_attempt',"  select * into att from private.initial_feedback_attempts", "private.owned_ai_expiry_late_lock(op.owner_id,'a13',op.analysis_id,op.operation_id)"),
 ('public.finish_initial_feedback'," select * into pub from private.initial_feedback_publications", "private.owned_ai_expiry_late_lock(op.owner_id,'a13',op.analysis_id,op.operation_id)")]:
 b=old[n]
 if n=='public.finish_initial_feedback':
  # Place after the actual locked operation identity validation, before exact publication replay.
  needle=' -- Exact completed publication replay';
  if needle not in b:
   print('IFO_FINISH_MARKERS',[(x,b.find(x)) for x in ['if op.publication_id','select * into pub','-- Exact']]);needle=" perform private.ifpub_validate_completion(p_completion,op.binding->>'sourceTextSha256');"
 assert b.count(needle)==1,(n,needle)
 new[n]=b.replace(needle,' perform '+call+';\n'+needle,1)
# Parse declarations as text only. This does not invoke any SQL parser/compiler.
def direct(s):
 out={}
 for m in re.finditer(r'create(?: or replace)? function ([a-z_]+\.[a-z_0-9]+)\(',s,re.I):
  q=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s[m.start():],re.I);assert q,m[1];out[m[1]]=(q[2],s[m.start():m.start()+q.end()])
 return out
def entry(n,definition,b,acl='private'):
 header=definition.split(' as $')[0];args=re.search(re.escape(n)+r'\(([\s\S]*?)\)\s*returns',header,re.I)[1];types=[a.strip().split(None,1)[1] for a in args.split(',')] if args else []
 result=re.search(r'\)\s*returns ([^\n]+)',header,re.I)[1].split(' language ')[0];setof=result.lower().startswith('table(') or result.lower().startswith('setof ')
 if result.lower().startswith('table('):result='record'
 if result.lower().startswith('setof '):result=result[6:]
 return dict(signature=n+'('+','.join(types)+')',sha256=h(b),language=re.search(r'language\s+(\w+)',header,re.I)[1].lower(),definer='security definer' in header.lower(),volatility='i' if ' immutable ' in ' '+header.lower()+' ' else 's' if ' stable ' in ' '+header.lower()+' ' else 'v',strict=bool(re.search(r'\bstrict\b',header,re.I)),setof=setof,acl=acl,resultType=result)
created=direct(core)
manifest=[entry(n,definition,b,'metadata' if n=='public.read_owned_ai_expiry_readiness' else 'optional_service' if n.startswith('public.') else 'private') for n,(b,definition) in created.items()]
# Independent safety closure has no dependency on an old checker which will pin it.
safety=r'''
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;rel pg_catalog.pg_class%rowtype;
 manifest jsonb:=$expiry_safety_functions$MANIFEST$expiry_safety_functions$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if owner_oid is null or service_oid is null or exists(select 1 from private.owned_ai_expiry_work where transaction_id<>txid_current()) then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset is distinct from (item->>'setof')::boolean or p.proisstrict is distinct from (item->>'strict')::boolean
   or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility' or p.prorettype<>to_regtype(item->>'resultType')
   or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language') or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
   and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
  if item->>'acl'='metadata' and not has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.owned_ai_expiry_safety_ready()');
 if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.prosecdef or p.proretset or p.proisstrict or p.provolatile<>'s' or p.prorettype<>'boolean'::regtype
  or p.proconfig is distinct from array['search_path=""'] or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then return false;end if;
 for rel in select * from pg_catalog.pg_class where oid in ('private.owned_ai_expiry_months'::regclass,'private.owned_ai_expiry_work'::regclass,'private.owned_ai_expiry_adoption_capability'::regclass,'private.owned_ai_expiry_catalogue_seal'::regclass) loop
  if rel.relkind<>'r' or rel.relowner<>owner_oid or not rel.relrowsecurity or rel.relforcerowsecurity
   or exists(select 1 from pg_catalog.pg_policy where polrelid=rel.oid)
   or exists(select 1 from aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner))) a where a.grantee<>rel.relowner)
   or exists(select 1 from pg_catalog.pg_attribute where attrelid=rel.oid and attnum>0 and not attisdropped and (atthasdef or attidentity<>'' or attgenerated<>''))
   or exists(select 1 from pg_catalog.pg_constraint where conrelid=rel.oid and contype='f') then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_table_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(role_name,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES') then return false;end if;end loop;
 end loop;
 if (select count(*) from private.owned_ai_expiry_catalogue_seal)<>1 or not exists(select 1 from private.owned_ai_expiry_catalogue_seal s
  where s.singleton and s.catalogue_sha256=private.ifo_sha(private.owned_ai_expiry_catalogue()::text)) then return false;end if;
 if (select count(*) from pg_catalog.pg_trigger where tgrelid='private.owned_ai_expiry_catalogue_seal'::regclass and not tgisinternal)<>1
  or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.owned_ai_expiry_catalogue_seal'::regclass and tgname='owned_ai_expiry_seal_closed'
   and tgtype=31 and tgenabled='O' and tgfoid=to_regprocedure('private.owned_ai_expiry_seal_closed()') and not tgisinternal and not tgdeferrable and not tginitdeferred
   and tgnargs=0 and tgargs='\x'::bytea and tgqual is null and tgoldtable is null and tgnewtable is null)
  then return false;end if;
 return true;
exception when others then return false;
end;
'''.replace('MANIFEST',json.dumps(manifest,separators=(',',':')))
core+="create function private.owned_ai_expiry_safety_ready() returns boolean\nlanguage plpgsql stable set search_path='' as $expiry_safety$"+safety+'$expiry_safety$;\n';created=direct(core)
# Renew all actual body-pin dependencies, topologically. No old policy descriptor is rewritten.
newhelperrows=[entry(n,created[n][1],created[n][0]) for n in ['private.owned_ai_expiry_safety_ready','private.owned_ai_expiry_late_lock','private.owned_ai_expiry_delete_allowed','private.owned_ai_expiry_due','private.owned_ai_expiry_global_blocked','private.owned_ai_expiry_since_blocked']]
checkers=['private.canonical_rewrite_ready','private.canonical_rewrite_workspace_ready','private.initial_feedback_operation_ready','private.initial_feedback_publication_ready','private.owned_ai_retirement_ready','private.initial_feedback_ready','private.owned_ai_budget_export_ready','private.owned_legacy_ai_usage_ready','private.ai_budget_source_ready','private.owned_ai_disposition_ready']
# Direct dependency DAG over actual old hashes; avoid assuming publication/retirement ordering.
pending=checkers[:]
while pending:
 ready=[n for n in pending if not any(h(old[x]) in old[n] for x in pending if x!=n)]
 assert ready, pending
 for n in ready:
  b=old[n]
  for dep,code in new.items():b=b.replace(h(old[dep]),h(code))
  # The source checker and retained usage checker consume new helpers through old entry points.
  if n in ['private.ai_budget_source_ready','private.owned_legacy_ai_usage_ready']:
   tag='source_functions' if n=='private.ai_budget_source_ready' else 'legacy_functions';v=b.split('$'+tag+'$')[1];rows=json.loads(v)
   for row in newhelperrows:
    if not any(x['signature']==row['signature'] for x in rows):rows.append(row)
   b=b.replace(v,json.dumps(rows,separators=(',',':')))
  
  if b!=old[n]:new[n]=b
  pending.remove(n)
# Pin every guarded postimage and all top-level checkers in the main readiness.
mainrows=[entry(n,decl[n],code,'optional_service' if n.startswith('public.') else 'private') for n,code in new.items()]
main=r'''
declare item jsonb;p pg_catalog.pg_proc%rowtype;owner_oid oid;service_oid oid;role_name text;
 manifest jsonb:=$expiry_functions$MANIFEST$expiry_functions$::jsonb;
begin
 select oid into service_oid from pg_catalog.pg_roles where rolname='service_role';
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if owner_oid is null or service_oid is null or private.owned_ai_expiry_safety_ready() is not true
  or private.ai_budget_source_ready() is not true or private.owned_legacy_ai_usage_ready() is not true
  or private.owned_ai_disposition_ready() is not true or private.owned_ai_budget_export_ready() is not true then return false;end if;
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset is distinct from (item->>'setof')::boolean or p.proisstrict is distinct from (item->>'strict')::boolean
   or p.prosecdef is distinct from (item->>'definer')::boolean or p.provolatile<>item->>'volatility' or p.prorettype<>to_regtype(item->>'resultType')
   or p.prolang<>(select oid from pg_catalog.pg_language where lanname=item->>'language') or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'sha256' then return false;end if;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
   and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
  foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
 end loop;
 return true;
exception when others then return false;
end;
'''.replace('MANIFEST',json.dumps(mainrows,separators=(',',':')))
core+="create function private.owned_ai_expiry_ready() returns boolean\nlanguage plpgsql stable set search_path='' as $expiry_ready$"+main+'$expiry_ready$;\n';created=direct(core)
patches=[dict(signature=entry(n,decl[n],code)['signature'],before=h(old[n]),after=h(code),old=old[n],new=code) for n,code in new.items()]
forward='''
do $expiry_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$expiry_patches$PATCHES$expiry_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.proowner<>owner_oid or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
   then raise exception 'OWNED_AI_EXPIRY_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'OWNED_AI_EXPIRY_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
  then raise exception 'OWNED_AI_EXPIRY_POSTIMAGE_DRIFT' using errcode='23514';end if;end loop;
end;
$expiry_forward$;
'''.replace('PATCHES',json.dumps(patches,separators=(',',':')))
sql=core+forward+"\ninsert into private.owned_ai_expiry_catalogue_seal values(true,private.ifo_sha(private.owned_ai_expiry_catalogue()::text));\ncreate trigger owned_ai_expiry_seal_closed before insert or update or delete on private.owned_ai_expiry_catalogue_seal for each row execute function private.owned_ai_expiry_seal_closed();\n"
for n,(b,definition) in created.items():sql+='revoke all on function '+entry(n,definition,b)['signature']+' from public,anon,authenticated,service_role;\n'
sql+='grant execute on function public.read_owned_ai_expiry_readiness() to service_role;\n-- No sweep/data capability or verifier is granted/seeded.\ncommit;\n'
(r/'supabase/migrations/20261115190341_owned_ai_expiry_fold.sql').write_text(sql)
profile='// Exact source pins; destructive capability denied and actual adoption remains missing.\nexport const OWNED_AI_EXPIRY_PROFILE=Object.freeze({\n'
for k,v in dict(schemaVersion='owned-ai-expiry-readiness/1.0.0',profileVersion='owned-ai-expiry-profile/1.0.0',checkerSha256=h(main),sweepSha256=h(created['public.sweep_owned_ai_expiry'][0]),metadataSha256=h(metadata)).items():profile+=f'{k}:"{v}",\n'
profile+='});\n';(r/'app/lib/server/owned-ai-expiry-profile.ts').write_text(profile)
a=json.loads((t/'allocation-final.json').read_text())
for file in a['files']:
 if not file.startswith('app/') or file.endswith('owned-ai-expiry-profile.ts'):continue
 s=(t/'preimages'/file).read_text()
 for n,b in new.items():s=s.replace(h(old[n]),h(b))
 assert s!=(t/'preimages'/file).read_text(),file;(r/file).write_text(s)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n');(t/'created-bodies.json').write_text(json.dumps({n:b for n,(b,_) in created.items()},indent=2)+'\n');(t/'safety-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(t/'main-manifest.json').write_text(json.dumps(mainrows,indent=2)+'\n')
print(json.dumps({'bytes':len(sql),'migration':h(sql),'patches':len(patches),'created':len(created),'safetyPins':len(manifest),'mainPins':len(mainrows),'checker':h(main)},indent=2))
