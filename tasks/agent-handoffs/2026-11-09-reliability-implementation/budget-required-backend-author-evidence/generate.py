from pathlib import Path
import json,hashlib,runpy,re
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
state=runpy.run_path(str(t/'resolve.py'));old=state['current'];decl=state['declarations'];new={};h=lambda s:hashlib.sha256(s.encode()).hexdigest()
n='public.claim_canonical_rewrite_dispatch';needle="  if private.canonical_rewrite_ready() is not true then";assert old[n].count(needle)==1
new[n]=old[n].replace(needle,"  if p_budget is null or p_budget='null'::jsonb then perform private.correction_fail('unavailable');end if;\n"+needle)
n='public.claim_initial_feedback_dispatch';needle="  if a.status<>'qualitative_review' or not private.lock_analysis_stage_lease";assert old[n].count(needle)==1
new[n]=old[n].replace(needle,"  if (op.binding->'policy'->>'budgetPolicyVersion') is null or p_budget is null or p_budget='null'::jsonb then perform private.ifo_fail('unavailable');end if;\n"+needle)
for n in ['private.canonical_rewrite_ready','private.canonical_rewrite_workspace_ready','private.initial_feedback_operation_ready','private.initial_feedback_ready','private.owned_legacy_ai_usage_ready','private.ai_budget_source_ready','private.owned_ai_disposition_ready']:
 b=old[n]
 for dep,code in new.items():b=b.replace(h(old[dep]),h(code))
 assert b!=old[n],n;new[n]=b
patches=[]
for n,b in new.items():
 args=re.search(re.escape(n)+r'\(([\s\S]*?)\)\s*returns',decl[n],re.I)[1];types=[a.strip().split(None,1)[1] for a in args.split(',')] if args else []
 patches.append(dict(signature=n+'('+','.join(types)+')',before=h(old[n]),after=h(b),old=old[n],new=b))
sql='''-- Fresh owned provider dispatch requires technical budget; historical policies/replay stay valid.
-- Source-authored only: not parsed, applied or Native-verified. No schema/grant/flag changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $budget_required_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$budget_required_patches$PATCHES$budget_required_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proconfig is distinct from array['search_path=""']
   or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old' or private.ifo_sha(item->>'new')<>item->>'after'
   then raise exception 'MANDATORY_AI_BUDGET_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'MANDATORY_AI_BUDGET_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
  then raise exception 'MANDATORY_AI_BUDGET_POSTIMAGE_DRIFT' using errcode='23514';end if;end loop;
end;
$budget_required_forward$;
commit;
'''.replace('PATCHES',json.dumps(patches,separators=(',',':')))
(r/'supabase/migrations/20261115182650_mandatory_ai_budget_dispatch.sql').write_text(sql)
for file in json.loads((t/'allocation.json').read_text())['files']:
 if not file.startswith('app/'):continue
 s=(t/'preimages'/file).read_text()
 for n,b in new.items():s=s.replace(h(old[n]),h(b))
 assert s!=(t/'preimages'/file).read_text(),file;(r/file).write_text(s)
(t/'patches.json').write_text(json.dumps(patches,indent=2)+'\n');(t/'terminal-postimages.json').write_text(json.dumps(old|new,indent=2)+'\n')
print(json.dumps({p['signature']:p['after'] for p in patches},indent=2));print('migration',h(sql))
