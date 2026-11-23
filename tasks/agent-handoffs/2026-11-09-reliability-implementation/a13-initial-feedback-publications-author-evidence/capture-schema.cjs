const fs=require('node:fs'),root='/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats',ts=require(root+'/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {z}=require(root+'/node_modules/zod');const {QualitativeSupportSchema}=require(root+'/app/lib/server/qualitative-support.ts');
fs.writeFileSync(__dirname+'/capture-schema.json',JSON.stringify(z.toJSONSchema(QualitativeSupportSchema,{target:'draft-7'}),null,2)+'\n');
console.log('Exported actual frozen QualitativeSupportSchema; citation range correlation is additionally checked by Native source.');
