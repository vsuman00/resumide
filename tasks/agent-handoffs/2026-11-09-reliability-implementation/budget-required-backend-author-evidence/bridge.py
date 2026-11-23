from pathlib import Path
import json,re,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
b=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/tasks/agent-handoffs/2026-11-09-reliability-implementation')
a=json.loads((b/'budget-required-backend-allocation.json').read_text());(t/'allocation-final.json').write_text(json.dumps(a,indent=2)+'\n')
owned={p for p in a['files'] if p.startswith('app/')}; report={}
for name in ['ai-budget-source-sql','initial-feedback-late-settlement-sql','owned-ai-disposition-sql','owned-ai-retirement-sql','owned-ai-usage-sql','owned-legacy-ai-usage-sql','retention-root-coverage-sql']:
 path=f'tests/unit/{name}.test.ts';assert path in a['files'];s=(t/'preimages'/path).read_text();pre=s
 assert hashlib.sha256(s.encode()).hexdigest()==a['preimages'][path]
 q=t/'preimages'/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_text(s)
 freezes=[];bindings=[]
 def imp(m):
  file='app/lib/server/'+m[2]+'.ts'
  if file not in owned:return m[0]
  specs=[]
  for entry in m[1].split(','):
   parts=entry.strip().split(' as ')
   if not parts[0]:continue
   const=parts[0];alias=parts[-1];fresh='MANDATORY_BUDGET_'+alias
   specs.append(const+' as '+fresh)
   text=(t/'preimages'/file).read_text();match=re.search(r'export const '+const+r' = (Object.freeze\([\s\S]*?\);)',text);assert match,(file,const)
   freezes.append('const '+alias+' = '+match[1]);bindings.append((fresh,alias))
  return 'import { '+', '.join(specs)+' } from "../../app/lib/server/'+m[2]+'";'
 s=re.sub(r'import\s*\{([^}]+)\}\s*from "\.\./\.\./app/lib/server/([^\"]+)";',imp,s)
 # Insert new frozen predecessor objects after all imports, leaving every old object intact.
 matches=list(re.finditer(r'^import[\s\S]*?;',s,re.M));pos=matches[-1].end();s=s[:pos]+'\n// Frozen immediate predecessor profiles; every earlier assertion remains unchanged.\n'+'\n'.join(freezes)+'\n'+s[pos:]
 if name=='owned-ai-usage-sql':
  marker='it("binds current all-caller profile successors while retaining all prior source goldens", () => {'
  snap=(t/'preimages/app/lib/server/canonical-rewrite-readiness-profile.ts').read_text()
  local='\n  const read=(file:string)=>file==="app/lib/server/canonical-rewrite-readiness-profile.ts" ? '+json.dumps(snap)+' : readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");\n'
  assert s.count(marker)==1;s=s.replace(marker,marker+local)
 suffix='''\nit("binds mandatory-budget current profiles while retaining all prior source assertions", () => {
 const terminal = JSON.parse(read("supabase/migrations/20261115182650_mandatory_ai_budget_dispatch.sql").split("$budget_required_patches$")[1]) as Array<{signature:string;old:string;new:string;before:string;after:string}>;
 expect(terminal).toHaveLength(9);
 for(const p of terminal) {
  expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
  expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
 }
'''
 for fresh,prior in bindings:
  suffix+=f' for(const [key,value] of Object.entries({prior})) {{\n  const successor=terminal.find(p=>p.before===value);\n  expect(({fresh} as Record<string,string>)[key]).toBe(successor ? successor.after : value);\n }}\n'
 suffix+='});\n';s+=suffix
 (r/path).write_text(s);report[path]={'imports':len(bindings),'oldAssertions':len(re.findall(r'\bexpect\([\s\S]*?;',pre))}
(t/'bridge-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
