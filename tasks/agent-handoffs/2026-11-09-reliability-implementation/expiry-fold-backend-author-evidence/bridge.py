from pathlib import Path
import json,re,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
b=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/tasks/agent-handoffs/2026-11-09-reliability-implementation');a=json.loads((b/'expiry-fold-backend-allocation.json').read_text());(t/'allocation-final.json').write_text(json.dumps(a,indent=2)+'\n')
owned={p for p in a['files'] if p.startswith('app/')};report={}
for path in a['files']:
 if not path.startswith('tests/') or not a['preimages'].get(path):continue
 s=(r/path).read_text();pre=s;assert hashlib.sha256(s.encode()).hexdigest()==a['preimages'][path],path
 q=t/'preimages'/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_text(s)
 freezes=[];bindings=[]
 def imp(m):
  file='app/lib/server/'+m[2]+'.ts'
  if file not in owned:return m[0]
  specs=[]
  for entry in m[1].split(','):
   parts=entry.strip().split(' as ')
   if not parts[0]:continue
   const=parts[0];alias=parts[-1];fresh='EXPIRY_CURRENT_'+alias;specs.append(const+' as '+fresh)
   text=(t/'preimages'/file).read_text();match=re.search(r'export const '+const+r' = (Object.freeze\([\s\S]*?\);)',text);assert match,(file,const)
   freezes.append('const '+alias+' = '+match[1]);bindings.append((fresh,alias))
  return 'import { '+', '.join(specs)+' } from "../../app/lib/server/'+m[2]+'";'
 s=re.sub(r'import\s*\{([^}]+)\}\s*from "\.\./\.\./app/lib/server/([^\"]+)";',imp,s)
 matches=list(re.finditer(r'^import[\s\S]*?;',s,re.M));pos=matches[-1].end()
 s=s[:pos]+'\n// Frozen immediate predecessor imports; every earlier assertion/object remains unchanged.\n'+'\n'.join(freezes)+'\n'+s[pos:]
 s,n=re.subn(r'^const read\b','const preExpiryRead',s,count=1,flags=re.M);assert n==1
 # Freeze only current profile file bytes at the explicit immediate predecessor, using real exact inverse patches.
 wrapper='''\n// Historical source assertions read the pre-expiry profile view; live successor exports are tied below.
function read(file:string){
 let value=preExpiryRead(file);
 if(file.startsWith("app/lib/server/") && file.endsWith("-profile.ts")){
  const expiry=JSON.parse(readFileSync(new URL("../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",import.meta.url),"utf8").split("$expiry_patches$")[1]) as Array<{before:string;after:string}>;
  for(const p of [...expiry].reverse())value=value.replaceAll(p.after,p.before);
 }
 return value;
}
'''
 # Function declaration is hoisted; original preExpiryRead initialization still precedes all actual calls.
 s+=wrapper
 suffix='''\nit("binds atomic-expiry successors while retaining all historical Source assertions",()=>{
 const rows=JSON.parse(readFileSync(new URL("../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",import.meta.url),"utf8").split("$expiry_patches$")[1]) as Array<{signature:string;old:string;new:string;before:string;after:string}>;
 expect(rows).toHaveLength(24);
 for(const p of rows){expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);}
'''
 for fresh,prior in bindings:
  suffix+=f' for(const [key,value] of Object.entries({prior})){{const successor=rows.find(p=>p.before===value);expect(({fresh} as Record<string,string>)[key]).toBe(successor ? successor.after : value);}}\n'
 suffix+='});\n';s+=suffix;(r/path).write_text(s)
 report[path]={'imports':len(bindings),'oldExpectExpressionSpans':len(re.findall(r'\bexpect\([\s\S]*?;',pre)),'oldFrozenObjects':len(re.findall(r'const \w+ = Object.freeze\([\s\S]*?\);',pre))}
(t/'bridge-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
