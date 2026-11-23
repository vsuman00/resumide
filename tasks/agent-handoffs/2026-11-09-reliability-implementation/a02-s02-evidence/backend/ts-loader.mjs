import {readFileSync,existsSync} from 'node:fs';
import ts from '/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats/node_modules/typescript/lib/typescript.js';
export async function resolve(specifier,context,next){
 if(specifier.startsWith('.')&&context.parentURL){const candidate=new URL(specifier+'.ts',context.parentURL);if(existsSync(candidate))return {url:candidate.href,shortCircuit:true};}
 return next(specifier,context);
}
export async function load(url,context,next){
 if(url.startsWith('file:///Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats/')&&url.endsWith('.ts'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText};
 return next(url,context);
}
