from pathlib import Path
import runpy,re,json,hashlib
root=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
state=runpy.run_path(str(t/'resolve.py'));old=state['current'];decl=state['declarations'];new={};created={}
h=lambda s:hashlib.sha256(s.encode()).hexdigest()
def block(s,n):return s.split('$'+n+'$')[1]
def direct(s):
 out={}
 for m in re.finditer(r'create(?: or replace)? function ([a-z_]+\.[a-z_]+)\(',s,re.I):
  b=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s[m.start():],re.I)
  out[m[1]]=(b[2],s[m.start():m.start()+b.end()])
 return out
core=(t/'core.sql').read_text()
for name,(b,definition) in direct(core).items():
 if name in old:new[name]=b
 else:created[name]=(b,definition)
# Remove existing definitions from core; all replacements below are preimage-guarded.
for name,(b,definition) in direct(core).items():
 if name in old:core=core.replace(definition,'')
created['private.ai_budget_source_reserve_next_core']=(old['public.ai_budget_reserve_next'],"create function private.ai_budget_source_reserve_next_core(p_user_id uuid,p_organization_id uuid,p_request jsonb) returns jsonb\nlanguage plpgsql volatile set search_path='' as $caller_ordinal$"+old['public.ai_budget_reserve_next']+'$caller_ordinal$;')
gate=r"""
begin
 if p_owner is null or current_setting('transaction_isolation') not in ('read committed','read uncommitted') then return false;end if;
 -- SAME owner lock domain as shared source admission, EXCLUSIVE through transition.
 if not private.try_lock_candidate_owners(array[p_owner]) then return false;end if;
 -- Separate VOLATILE statements after exclusion see committed registration.
 if private.candidate_write_blocked(p_owner) then return false;end if;
 if private.ai_budget_source_typed(p_request) then return false;end if;
 return true;
exception when others then return false;
end;
"""
created['private.ai_budget_source_generic_allowed']=(gate,"create function private.ai_budget_source_generic_allowed(p_owner uuid,p_request jsonb) returns boolean\nlanguage plpgsql volatile set search_path='' as $caller_generic$"+gate+'$caller_generic$;')
for n in ['public.ai_budget_reserve','public.ai_budget_claim_dispatch']:
 action='reserve' if n.endswith('reserve') else 'claim_dispatch'
 new[n]="\n select case when private.ai_budget_source_generic_allowed(p_user_id,p_request) then private.ai_budget_transition(p_user_id,p_organization_id,p_request,'"+action+"') else private.ai_budget_denied('AI_BUDGET_DENIED') end;\n"
new['public.ai_budget_reserve_next']=old['public.ai_budget_reserve_next'].replace("begin\n","begin\n  if not private.ai_budget_source_generic_allowed(p_user_id,p_request) then return private.ai_budget_denied('AI_BUDGET_DENIED');end if;\n",1)
# Typed claims preserve all existing source/lease/once/consent checks and result wires.
n='public.claim_canonical_rewrite_dispatch';b=old[n]
needle="p_budget->'p_request'->>'operationId' is distinct from p_operation_id::text"
assert b.count(needle)==1
b=b.replace(needle,"p_budget->'p_request'->>'operationId' is distinct from private.ai_budget_source_identity(p_user_id,a.organization_id,'canonical_rewrite',p_analysis_id,op.source_id,p_operation_id::text)::text")
b=b.replace("public.ai_budget_claim_dispatch(p_user_id,a.organization_id,p_budget->'p_request')","private.ai_budget_transition(p_user_id,a.organization_id,p_budget->'p_request','claim_dispatch')")
# Require exact registered mapping, not just a mathematically matching UUID.
needle="    budget:=private.ai_budget_transition"
b=b.replace(needle,"    if not exists(select 1 from private.ai_budget_operation_sources s where s.operation_id=(p_budget->'p_request'->>'operationId')::uuid and s.kind='canonical_rewrite'\n      and (s.owner_id,s.organization_id,s.analysis_id,s.resume_version_id,s.request_nonce)=(p_user_id,a.organization_id,p_analysis_id,op.source_id,p_operation_id::text)) then perform private.correction_fail('invalid');end if;\n"+needle)
new[n]=b
n='public.claim_initial_feedback_dispatch';b=old[n]
needle='budget:=public.ai_budget_claim_dispatch(a.owner_id,a.organization_id,req);';assert b.count(needle)==1
b=b.replace(needle,"if not exists(select 1 from private.ai_budget_operation_sources s where s.kind='initial_feedback' and (s.operation_id,s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)\n      =(op.operation_id,a.owner_id,a.organization_id,a.id,op.resume_id,op.resume_version_id)) then perform private.ifo_fail('invalid');end if;\n    budget:=private.ai_budget_transition(a.owner_id,a.organization_id,req,'claim_dispatch');")
new[n]=b
# General registered closure already precedes historical inference. Build is solely account-scoped.
n='private.capture_owned_ai_operation_dispositions';b=old[n]
needle="   analysis:=registration.analysis_id;root_id:=registration.resume_id;version_id:=registration.resume_version_id;scope:='resume_root';"
assert b.count(needle)==1
b=b.replace(needle,"""   if registration.kind='build_account' then
    if p_request is null or p_resume is not null then raise exception 'OWNED_AI_DISPOSITION_SCOPE' using errcode='23514';end if;
    perform 1 from private.ai_budget_operations o where o.id=x.id and o.user_id=p_owner for update skip locked;
    if not found then raise exception 'OWNED_AI_DISPOSITION_BUSY' using errcode='55P03';end if;
    perform private.capture_owned_ai_disposition_row('r03',p_owner,x.organization_id,x.id,null,null,null,'account_only','account_preparation',account_row.first_request_id,null,account_row.prepared_at);
    continue;
   end if;
"""+needle)
new[n]=b
n='public.export_owned_ai_budget_sources';b=old[n].replace('owned-ai-budget-sources/1.0.0','owned-ai-budget-sources/2.0.0')
b=b.replace('  if not exists(select 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id',"  if s.kind<>'build_account' and not exists(select 1 from public.resumes r join public.resume_versions v on v.resume_id=r.id",1)
# Group missing-parent + no-disposition terms, so Build never enters either predicate.
b=b.replace("  if s.kind<>'build_account' and not exists(","  if s.kind<>'build_account' and (not exists(",1)
needle="and d.phase='prepared' and d.source_scope='resume_root') then raise exception";assert b.count(needle)==1
b=b.replace(needle,"and d.phase='prepared' and d.source_scope='resume_root')) then raise exception")
new[n]=b
n='public.export_owned_ai_disposition_records';b=old[n]
needle="   and (exists(select 1 from private.retention_items t where t.owner_id=p_user_id and t.resume_id=s.resume_id)"
assert b.count(needle)==1
b=b.replace(needle,"   and ((s.kind='build_account' and exists(select 1 from private.owned_ai_deletion_dispositions a where a.owner_id=p_user_id)) or (s.kind<>'build_account' and (exists(select 1 from private.retention_items t where t.owner_id=p_user_id and t.resume_id=s.resume_id)")
needle="=(s.resume_id,s.owner_id,s.organization_id,s.resume_version_id,s.owner_id,s.organization_id)))"
assert b.count(needle)==1;b=b.replace(needle,"=(s.resume_id,s.owner_id,s.organization_id,s.resume_version_id,s.owner_id,s.organization_id)))))")
b=b.replace('(d.owner_id,d.organization_id,d.analysis_id,d.resume_id,d.resume_version_id)=(s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)', '(d.owner_id,d.organization_id,d.analysis_id,d.resume_id,d.resume_version_id) is not distinct from (s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)')
new[n]=b
n='public.read_ai_budget_source_readiness';new[n]=old[n].replace('ai-budget-source-readiness/1.0.0','ai-budget-source-readiness/2.0.0').replace('ai-budget-source-profile/1.0.0','ai-budget-source-profile/2.0.0')
n='private.ai_budget_source_catalogue';b=old[n]
b=b.replace("c.relname='ai_budget_source_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'","c.relname='ai_budget_source_v2_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'")
b=b.replace("'private.ai_budget_attempts'::regclass)","'private.ai_budget_attempts'::regclass,'private.ai_budget_source_v2_catalogue_seal'::regclass,'private.canonical_rewrite_operations'::regclass,'private.initial_feedback_operations'::regclass,'private.initial_feedback_attempts'::regclass)")
new[n]=b
# Literal-pin checker closure, in dependency order. Unchanged policy descriptors stay frozen.
def renew(name):
 b=old[name]
 for n,v in new.items():
  if n!=name:b=b.replace(h(old[n]),h(v))
 return b
for n in ['private.canonical_rewrite_ready','private.canonical_rewrite_workspace_ready','private.initial_feedback_operation_ready','private.initial_feedback_ready']:new[n]=renew(n)
# Source checker exact manifest includes all changed dependencies and new authority helpers.
n='private.ai_budget_source_ready';b=old[n];manifest=json.loads(block(b,'source_functions'))
for row in manifest:
 name=row['signature'].split('(')[0]
 if name in new:row['sha256']=h(new[name])
# Signature/properties from new declaration or preserved actual old declarations.
def entry(name,definition,code,acl='private'):
 header=definition.split(' as $',1)[0]
 args=re.search(re.escape(name)+r'\(([^\n]*)\)',header)[1]
 types=[a.strip().split(' ',1)[1] for a in args.split(',')] if args else []
 result=re.search(r'\)\s*returns ([^\n]+)',header,re.I)[1]
 if ' language ' in result:result=result.split(' language ')[0]
 return dict(signature=name+'('+','.join(types)+')',sha256=h(code),language=re.search(r'language\s+(\w+)',header,re.I)[1].lower(),definer='security definer' in header.lower(),volatility='i' if ' immutable ' in ' '+header.lower()+' ' else 's' if ' stable ' in ' '+header.lower()+' ' else 'v',strict=bool(re.search(r'\bstrict\b',header,re.I)),setof=False,acl=acl,resultType=result)
existing={p['signature'].split('(')[0] for p in manifest}
for name,(code,definition) in created.items():
 if name not in existing:manifest.append(entry(name,definition,code));existing.add(name)
for name in ['public.claim_canonical_rewrite_dispatch','public.claim_initial_feedback_dispatch','private.canonical_rewrite_ready','private.initial_feedback_operation_ready','private.try_lock_candidate_owners']:
 if name not in existing:manifest.append(entry(name,decl[name],new.get(name,old[name]),'optional_service' if name.startswith('public.') else 'private'));existing.add(name)
b=b.replace(block(b,'source_functions'),json.dumps(manifest,separators=(',',':')))
b=b.replace("private.owned_ai_budget_export_ready() is not true","private.owned_ai_budget_export_ready() is not true or private.canonical_rewrite_ready() is not true or private.initial_feedback_operation_ready() is not true",1)
b=b.replace("'private.ai_budget_source_catalogue_seal'::regclass)","'private.ai_budget_source_catalogue_seal'::regclass,'private.ai_budget_source_v2_catalogue_seal'::regclass)")
b=b.replace('from private.ai_budget_source_catalogue_seal','from private.ai_budget_source_v2_catalogue_seal')
b=b.replace('"table":"private.ai_budget_source_catalogue_seal"','"table":"private.ai_budget_source_v2_catalogue_seal"')
b=b.replace("tgrelid='private.ai_budget_source_catalogue_seal'::regclass","tgrelid='private.ai_budget_source_v2_catalogue_seal'::regclass")
new[n]=b
new['private.owned_ai_disposition_ready']=renew('private.owned_ai_disposition_ready')
# All old body replacements retain their exact existing definition properties.
patches=[]
for n,b in new.items():
 signature=entry(n,decl[n],b)['signature']
 patches.append(dict(signature=signature,before=h(old[n]),after=h(b),old=old[n],new=b,setof=False))
# New helpers already present in core, append generated helpers only once.
for n in ['private.ai_budget_source_reserve_next_core','private.ai_budget_source_generic_allowed']:core+='\n'+created[n][1]+'\n'
forward=r"""
do $callers_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$callers_patches$PATCHES$callers_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
    or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
    then raise exception 'AI_CALLERS_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'AI_CALLERS_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
   then raise exception 'AI_CALLERS_POSTIMAGE_DRIFT' using errcode='23514';end if;
 end loop;
end;
$callers_forward$;
""".replace('PATCHES',json.dumps(patches,separators=(',',':')))
sql=core+forward+"\n-- Successor seal only. Never update or reseal the old closed metadata row.\ninsert into private.ai_budget_source_v2_catalogue_seal(singleton,catalogue_sha256) values(true,private.ifo_sha(private.ai_budget_source_catalogue()::text));\ncreate trigger ai_budget_source_seal_closed before insert or update or delete on private.ai_budget_source_v2_catalogue_seal for each row execute function private.ai_budget_source_seal_closed();\n"
for row in manifest:
 name=row['signature'].split('(')[0]
 if name in created:sql+='revoke all on function '+row['signature']+' from public,anon,authenticated,service_role;\n'
sql+='-- Existing denied data grants/default-off flags unchanged.\ncommit;\n'
(root/'supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql').write_text(sql)
# Renew allocated Node profiles from original archived bytes only.
profile_names={'app/lib/server/ai-budget-source-profile.ts':{'checkerSha256':'private.ai_budget_source_ready','reserveSha256':'public.ai_budget_reserve_source_next','exportSha256':'public.export_owned_ai_budget_sources','metadataSha256':'public.read_ai_budget_source_readiness'},'app/lib/server/owned-ai-disposition-profile.ts':{'checkerSha256':'private.owned_ai_disposition_ready','exportSha256':'public.export_owned_ai_disposition_records'},'app/lib/server/canonical-rewrite-readiness-profile.ts':{'checkerSha256':'private.canonical_rewrite_ready','claimSha256':'public.claim_canonical_rewrite_dispatch'},'app/lib/server/canonical-rewrite-workspace-profile.ts':{'checkerSha256':'private.canonical_rewrite_workspace_ready'},'app/lib/server/initial-feedback-operation-profile.ts':{'checkerSha256':'private.initial_feedback_operation_ready','claimSha256':'public.claim_initial_feedback_dispatch'},'app/lib/server/initial-feedback-profile.ts':{'checkerSha256':'private.initial_feedback_ready','claimSha256':'public.claim_initial_feedback_dispatch'}}
for file,values in profile_names.items():
 source=(t/'preimages'/file).read_text()
 if file.endswith('ai-budget-source-profile.ts'):source=source.replace('ai-budget-source-readiness/1.0.0','ai-budget-source-readiness/2.0.0').replace('ai-budget-source-profile/1.0.0','ai-budget-source-profile/2.0.0')
 for key,name in values.items():
  # First checker in full module is full feedback; retirement subprofile unchanged.
  source,n=re.subn(r'('+key+r':\s*")[a-f0-9]{64}("[ ,\n])',lambda m:m[1]+h(new[name])+m[2],source,count=1);assert n==1,(file,key)
 (root/file).write_text(source)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n');(t/'functions-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(t/'old-bodies.json').write_text(json.dumps({n:old[n] for n in new},indent=2)+'\n')
print(json.dumps({'migration':h(sql),'bytes':len(sql),'patches':len(patches),'sourceChecker':h(new['private.ai_budget_source_ready']),'sourcePins':len(manifest),'newFunctions':len(created)},indent=2))
