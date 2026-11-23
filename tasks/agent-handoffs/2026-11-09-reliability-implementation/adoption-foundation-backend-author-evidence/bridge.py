from pathlib import Path
import json,re,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent;b=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/tasks/agent-handoffs/2026-11-09-reliability-implementation');a=json.loads((b/'adoption-foundation-backend-allocation.json').read_text());(t/'allocation-final.json').write_text(json.dumps(a,indent=2)+'\n');owned={f for f in a['files'] if f.endswith('-profile.ts')};report={}
for name in ['ai-budget-source-sql','mandatory-ai-budget-sql','owned-ai-disposition-sql','owned-ai-expiry-sql','owned-ai-retirement-sql','owned-legacy-ai-usage-sql','retention-root-coverage-sql']:
 path=f'tests/unit/{name}.test.ts';s=(r/path).read_text();pre=s;assert hashlib.sha256(s.encode()).hexdigest()==a['preimages'][path],path;q=t/'preimages'/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_text(s);frozen=[];bindings=[]
 def imp(m):
  file='app/lib/server/'+m[2]+'.ts'
  if file not in owned:return m[0]
  entries=[]
  for entry in m[1].split(','):
   spec=entry.strip().split(' as ')
   if not spec[0]:continue
   const=spec[0];alias=spec[-1];live='GENERATION_CURRENT_'+alias;entries.append(const+' as '+live)
   obj=re.search(r'export const '+const+r' = (Object.freeze\([\s\S]*?\);)',(t/'preimages'/file).read_text());assert obj,(file,const);frozen.append('const '+alias+' = '+obj[1]);bindings.append((live,alias))
  return 'import { '+', '.join(entries)+' } from "../../app/lib/server/'+m[2]+'";'
 s=re.sub(r'import\s*\{([^}]+)\}\s*from "\.\./\.\./app/lib/server/([^\"]+)";',imp,s)
 s,n=re.subn(r'import \{ readFileSync \} from "node:fs";', 'import { readFileSync as generationReadFileSync } from "node:fs";',s,count=1);assert n==1,path
 pos=list(re.finditer(r'^import[\s\S]*?;',s,re.M))[-1].end();s=s[:pos]+'\n// Freeze immediate predecessor imports; all previous assertions remain exact.\n'+'\n'.join(frozen)+'\n'+s[pos:]
 s+='''\n// Apply the newest explicit historical cutoff before older fixture readers invert their own successors.
function readFileSync(input:URL|string,encoding:"utf8"):string{
 let value=generationReadFileSync(input,encoding);
 if(String(input).includes("/app/lib/server/")&&String(input).endsWith("-profile.ts")){
  const rows=JSON.parse(generationReadFileSync(new URL("../../supabase/migrations/20261116075250_privacy_export_generation.sql",import.meta.url),"utf8").split("$privacy_generation_patches$")[1]) as Array<{before:string;after:string}>;
  for(const row of [...rows].reverse())value=value.replaceAll(row.after,row.before);
 }
 return value;
}
it("binds live privacy-generation successors and preserves every historical assertion",()=>{
 const rows=JSON.parse(generationReadFileSync(new URL("../../supabase/migrations/20261116075250_privacy_export_generation.sql",import.meta.url),"utf8").split("$privacy_generation_patches$")[1]) as Array<{signature:string;before:string;after:string;old:string;new:string}>;
 expect(rows).toHaveLength(12);for(const p of rows){expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);}
'''
 for live,old in bindings:s+=f'for(const [key,value]of Object.entries({old})){{const successor=rows.find(p=>p.before===value);expect(({live} as Record<string,string>)[key]).toBe(successor?successor.after:value);}}\n'
 s+='});\n';(r/path).write_text(s);report[path]={'imports':len(bindings),'oldExpressions':len(re.findall(r'\bexpect\([\s\S]*?;',pre)),'oldObjects':len(re.findall(r'const \w+ = Object.freeze\([\s\S]*?\);',pre))}
(t/'bridge-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
