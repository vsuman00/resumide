const fs=require('node:fs'),ts=require('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const root='/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats';
const p=require(root+'/app/lib/server/initial-feedback-publication-policy.ts');
const {DEFAULT_OPENAI_MODEL}=require(root+'/app/lib/server/openai-model.ts');
const rows=[null,'synthetic-budget-policy/1'].map(budgetPolicyVersion=>{
 const policy=p.createInitialFeedbackPublicationPolicy({model:DEFAULT_OPENAI_MODEL,maxOutputTokens:1200,attemptLimit:1,budgetPolicyVersion});
 const {sha256,...descriptor}=policy;const bytes=p.encodeInitialFeedbackPublicationPolicy(descriptor);
 return {evidence:'ACTUAL_FACTORY_VECTOR_NOT_REGISTRY_SEED_OR_ACTIVATION',budgetPolicyVersionSynthetic:budgetPolicyVersion!==null,policy,framedUtf8:bytes.toString('utf8'),byteLength:bytes.length,sha256};
});
fs.writeFileSync(__dirname+'/publication-policy-vectors.json',JSON.stringify({header:p.INITIAL_FEEDBACK_POLICY_HEADER,atomOrder:p.INITIAL_FEEDBACK_POLICY_ATOM_ORDER,vectors:rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(x=>({byteLength:x.byteLength,sha256:x.sha256,evidence:x.evidence}))));
