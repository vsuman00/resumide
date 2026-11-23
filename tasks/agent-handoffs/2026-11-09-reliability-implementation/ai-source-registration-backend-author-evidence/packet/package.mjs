import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {sourceHashes} from '/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats/scripts/verify-private-aa7.mjs';
const root='/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats';
const upstream='/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats';
const temp='/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-ai-source-backend-jxl23la2';
const base='tasks/agent-handoffs/2026-11-09-reliability-implementation';
const hash=(s)=>createHash('sha256').update(s).digest('hex');
const json=(p)=>JSON.parse(readFileSync(p,'utf8'));
const allocation=json(upstream+'/'+base+'/ai-source-registration-backend-allocation.json');
const files=[...allocation.files,allocation.handoff];
if(files.length!==8||new Set(files).size!==8)throw Error('OWNERSHIP');
const owned={};
for(const file of files){
 const now=readFileSync(root+'/'+file);const pre=allocation.preimages[file]??null;
 const archived=temp+'/preimages/'+file;
 if(pre!==null&&hash(readFileSync(archived))!==pre)throw Error('PREIMAGE '+file);
 const out=temp+'/snapshots/'+file;mkdirSync(out.substring(0,out.lastIndexOf('/')),{recursive:true});copyFileSync(root+'/'+file,out);
 if(now.includes(Buffer.from('\r'))||now.toString().split('\n').some(l=>/[ \t]+$/.test(l)))throw Error('WHITESPACE '+file);
 owned[file]={preimage:pre,postimage:hash(now),bytes:now.length,snapshot:out,preimageSnapshot:pre===null?null:archived};
}
const contracts={};
for(const name of ['ai-source-registration-contract.json','ai-source-registration-backend-allocation.json','ai-source-registration-wire.json','ai-source-registration-consumer-supplement.json','ai-source-registration-codec-vectors.json']){
 const file=base+'/'+name;const bytes=readFileSync(upstream+'/'+file);const out=temp+'/contracts/'+name;mkdirSync(temp+'/contracts',{recursive:true});writeFileSync(out,bytes);contracts[file]={sha256:hash(bytes),snapshot:out};
}
if(contracts[base+'/ai-source-registration-contract.json'].sha256!==allocation.contractSha256)throw Error('CONTRACT_DRIFT');
const receiptNames=['cli-version','cli-help','cli-new','source-red','source-first','source-second','source-third','format-write','source-final','statics-lint-final','statics-format-final'];
const receipts={};
for(const name of receiptNames){const file=temp+'/'+name+'.json',r=json(file);if(hash(readFileSync(r.log))!==r.logSha256)throw Error('LOG_DRIFT');if(!r.commands.every(c=>c.groupCleanupConfirmed&&!c.manualGroupCleanupRequired))throw Error('GROUP_CLEANUP');receipts[name]={file,sha256:hash(readFileSync(file)),log:r.log,logSha256:r.logSha256,sourceStable:r.sourceStable,start:r.start,close:r.close,commands:r.commands};}
const pgids=Object.values(receipts).map(r=>r.start.processGroup);
const ps=spawnSync('/bin/ps',['-axo','pid=,pgid='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:temp+'/home',LANG:'en_US.UTF-8'}});
if(ps.status!==0)throw Error('PS_UNAVAILABLE');
const remaining=ps.stdout.trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number)).filter(([pid,pgid])=>pgids.includes(pgid));
if(remaining.length)throw Error('LIVE_GROUP');
const env={HOME:temp+'/home',PATH:'/usr/bin:/bin',RESUMIDE_PRIVATE_VERIFY:'aa7-owned-synthetic'};
const source=sourceHashes(root,env),before=json(temp+'/cli-version.json').sourceBefore;
const delta=[...new Set([...Object.keys(before),...Object.keys(source)])].sort().filter(f=>before[f]!==source[f]);
const outside=delta.filter(f=>!files.includes(f));if(outside.length)throw Error('OUTSIDE_SCOPE '+JSON.stringify(outside));
writeFileSync(temp+'/source-final-manifest.json',JSON.stringify(source,null,2)+'\n');
const assertions={};
for(const f of ["tests/unit/retention-root-coverage-sql.test.ts","tests/unit/owned-ai-disposition-sql.test.ts"]){const a=readFileSync(temp+'/preimages/'+f,'utf8'),b=readFileSync(root+'/'+f,'utf8');const oldSuffix=a.slice(a.indexOf('const read ='));
 if(!b.includes(oldSuffix))throw Error('HISTORICAL_ASSERTION_DRIFT');
 assertions[f]={preexistingAssertionAndGoldenSuffixBytePreserved:true,oldSuffixSha256:hash(oldSuffix),oldSuffixBytes:Buffer.byteLength(oldSuffix)};
}
const migration=readFileSync(root+'/'+allocation.files[0],'utf8');
const patches=JSON.parse(migration.split('$source_patches$')[1]);
const pins={};for(const p of patches){if(hash(p.old)!==p.before||hash(p.new)!==p.after)throw Error('BODY_HASH');pins[p.signature]={before:p.before,after:p.after};}
const clock='supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql';
if(source[clock]!=='19e3d3c7f3d5dd996a13d504e3f675dc8c8957ec2c311f4bdea282a433abda11')throw Error('OLD_CLOCK_DRIFT');
mkdirSync(temp+'/frozen-predecessors',{recursive:true});copyFileSync(root+'/'+clock,temp+'/frozen-predecessors/20261115131621_owned_ai_disposition_clocks.sql');
const packet={status:'FROZEN_SOURCE_ONLY_RELEASE',task:'ADR0020_LEGACY_REWRITE_SOURCE_REGISTRATION',baseHead:allocation.baseHead,worktree:root,files:owned,contracts,bodyPins:pins,independentFunctionManifest:{path:temp+'/functions-manifest.json',sha256:hash(readFileSync(temp+'/functions-manifest.json'))},historicalAssertions:assertions,source:{beforeReceipt:temp+'/cli-version.json',finalManifest:temp+'/source-final-manifest.json',finalManifestSha256:hash(readFileSync(temp+'/source-final-manifest.json')),inputCount:Object.keys(source).length,changedInputs:delta,outsideOwnedChanges:outside,frozenClockSha256:source[clock]},receipts,processGroups:{checkedAt:new Date().toISOString(),groups:pgids,remaining,allAbsent:true},verification:{red:'Three actual predecessor source regressions failed; no missing-module/fixture error',final:'45 tests / 3 files passed, scoped ESLint and Prettier passed, all final sourceStable true',formatting:'Two new-test TS syntax errors and one incorrect raw timestamp expectation corrected; all preserved; not product RED evidence',limits:'Pinned Node22.23.4; maxWorkers1; each child120s/8MiB; sealed fake env/empty HOME/OS network denial',omissions:'No SQL parsing/execution, database, Native races/performance/role/erasure proof, real storage/provider calls, workspace Git/deps or deploy. Root integrated fullstatics pending.',delivery:'At least once; duplicate immutable key delivery possible; no lease/exclusive guarantee'},deferredVerifier:{path:'scripts/verify-ai-budget-source.sql',status:'PRIVILEGED_MUTATING_ROLLBACK_ONLY_DRAFT_UNPARSED_UNEXECUTED',physicalStorage:false},proseHygiene:{receipt:temp+'/handoff-text-hygiene.json',sha256:hash(readFileSync(temp+'/handoff-text-hygiene.json'))}};
writeFileSync(temp+'/release.json',JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({release:temp+'/release.json',sha256:hash(readFileSync(temp+'/release.json')),files:Object.keys(owned).length,inputs:Object.keys(source).length,changed:delta,groupsAbsent:true,pins},null,2));
