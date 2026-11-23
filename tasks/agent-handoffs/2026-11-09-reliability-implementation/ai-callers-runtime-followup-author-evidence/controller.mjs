import { sourceHashes, runCommand } from "file:///Users/vaibhavsuman/.codex/worktrees/reliability-20261109-runtime/resume_ats/scripts/verify-private-aa7.mjs";
import { mkdtempSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
const root="/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-runtime/resume_ats";
if(process.version!=="v22.23.4") throw Error("Pinned Node required");
process.umask(0o077);
const out=mkdtempSync("/tmp/resumide-ai-callers-followup-"); mkdirSync(join(out,"home"));
const env={HOME:join(out,"home"),PATH:dirname(process.execPath)+":/usr/bin:/bin:/usr/sbin:/sbin",NODE_ENV:"test",NO_COLOR:"1",RESUMIDE_PRIVATE_VERIFY:"aa7-owned-synthetic",AI_ENABLED:"false",OPENAI_API_KEY:"offline-no-live-key",SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_PUBLISHABLE_KEY:"offline-publishable",SUPABASE_SECRET_KEY:"offline-secret",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_OPTIONAL_LOCKS:"0"};
const hash=(p)=>createHash("sha256").update(readFileSync(p)).digest("hex");
const inputs=()=>({...sourceHashes(root,env),".env.example":hash(join(root,".env.example"))});
const before=inputs(), log=join(out,"check.log"),fd=openSync(log,"wx",0o600);
const receipt={startedAt:new Date().toISOString(),node:process.version,root,environment:"SEALED_EMPTY_HOME_FAKE_KEYS_PRIVATE_MARKER_NO_DOTENV",controller:{pid:process.pid,startIdentity:execFileSync("/bin/ps",["-o","pid=,pgid=,lstart=","-p",String(process.pid)],{encoding:"utf8",env}).trim()},sourceHashes:before,commands:[],log};
const save=()=>writeFileSync(join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
const cli=join(root,"node_modules/vitest/vitest.mjs");
const owned=["tests/unit/canonical-rewrite-service.test.ts", "tests/unit/initial-feedback-stage.test.ts", "tests/unit/qualitative-stage-outage.test.ts"];
const testSpecs=[["caller-followup",[cli,"run",...owned,"--maxWorkers=3","--reporter=default","--reporter=json","--outputFile="+join(out,"tests.json")]]];
const mode=process.argv[2];
const specs = mode === "types" ? [["types",[join(root,"node_modules/typescript/bin/tsc"),"--noEmit"]]] : mode === "core" ? [["caller-core",[cli,"run","tests/unit/ai-budget-source.test.ts","tests/unit/ai-budget-source-export.test.ts","--maxWorkers=3","--reporter=default","--reporter=json","--outputFile="+join(out,"tests.json")]]] : mode === "format" ? [["scoped-format",[join(root,"node_modules/prettier/bin/prettier.cjs"),"--write",...owned]]] : mode === "lint" ? [["scoped-format-check",[join(root,"node_modules/prettier/bin/prettier.cjs"),"--check",...owned]],["scoped-lint",[join(root,"node_modules/eslint/bin/eslint.js"),...owned]]] : mode === "static" ? [["scoped-format-check",[join(root,"node_modules/prettier/bin/prettier.cjs"),"--check",...owned]],["scoped-lint",[join(root,"node_modules/eslint/bin/eslint.js"),...owned]],["types",[join(root,"node_modules/typescript/bin/tsc"),"--noEmit"]]] : testSpecs;
const gitCommon=execFileSync("git",["rev-parse","--path-format=absolute","--git-common-dir"],{cwd:root,env,encoding:"utf8"}).trim();
const rootMain="/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const policy='(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath '+JSON.stringify(gitCommon)+'))\n'+[root,rootMain].flatMap(dir=>[".env",".env.local",".env.test",".env.test.local",".env.development",".env.development.local",".env.production",".env.production.local"].map(name=>'(deny file-read* (literal '+JSON.stringify(join(dir,name))+'))\n')).join("");
receipt.isolationPolicy=policy;receipt.environment="SEALED_EMPTY_HOME_FAKE_KEYS_PRIVATE_MARKER_OS_NETWORK_DOTENV_GIT_DENIED";
const watcher=setInterval(()=>{if(statSync(log).size>8*1024*1024){receipt.logLimitExceeded=true;process.kill(process.pid,"SIGTERM");}},100);
for(const [label,args] of specs){const item={label,args,startedAt:new Date().toISOString()};receipt.commands.push(item);save();let deadline;try { deadline=setTimeout(()=>{item.deadlineExceeded=true;process.kill(process.pid,"SIGTERM");},120000);item.result=await runCommand("/usr/bin/sandbox-exec",["-p",policy,process.execPath,...args],{cwd:root,env,logFd:fd,onStart:(identity)=>{item.process=identity;save();}});}finally{clearTimeout(deadline);}item.finishedAt=new Date().toISOString();
if (!item.result.groupCleanupConfirmed && !item.result.manualGroupCleanupRequired && item.result.processGroup) {
  await new Promise(resolve => setTimeout(resolve, 100));
  try { process.kill(-item.result.processGroup, 0); item.groupAbsentAfterExit=false; }
  catch (error) { item.groupAbsentAfterExit=error.code==="ESRCH"; }
}
save();if(item.result.code!==0||(!item.result.groupCleanupConfirmed&&!item.groupAbsentAfterExit)||item.deadlineExceeded)break;}
clearInterval(watcher);closeSync(fd);receipt.after=inputs();receipt.changedInputs=[...new Set([...Object.keys(before),...Object.keys(receipt.after)])].filter(k=>before[k]!==receipt.after[k]);receipt.finishedAt=new Date().toISOString();receipt.logSha256=hash(log);receipt.status=receipt.commands.length===specs.length&&receipt.commands.every(i=>i.result.code===0&&(i.result.groupCleanupConfirmed||i.groupAbsentAfterExit)&&!i.deadlineExceeded)&&!receipt.changedInputs.length&&!receipt.logLimitExceeded?"PASS":"FAILED_OR_INCOMPLETE";save();console.log(JSON.stringify({out,status:receipt.status,commands:receipt.commands.map(i=>({label:i.label,...i.result})),changedInputs:receipt.changedInputs}));process.exitCode=receipt.status==="PASS"?0:1;
