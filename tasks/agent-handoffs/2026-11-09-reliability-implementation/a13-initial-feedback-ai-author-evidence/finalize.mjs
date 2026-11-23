import {readFileSync,writeFileSync,chmodSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {sourceHashes} from './source-hashes.mjs';
const packet='/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-initial-feedback-ai-_1wq3awg';
const root='/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-frontend/resume_ats';
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const read=(n)=>JSON.parse(readFileSync(join(packet,n),'utf8'));
const save=(n,v)=>{writeFileSync(join(packet,n),JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});};
const assert=(v,m)=>{if(!v)throw Error(m);};
const paths=['app/lib/server/initial-feedback-ai.ts','tests/unit/initial-feedback-ai.test.ts','tasks/agent-handoffs/2026-11-09-reliability-implementation/frontend-a13-initial-feedback-ai.md'];
const expected=['67035c816131428a0005cd48ee3af44578d1e30c5bf64b6df020c24d9e5df809','8452eb9ed636d43bfc0e63718fdfe2d492ef725aa60b0678464c22b0a32367e5'];
const owned={};
paths.forEach((p,i)=>{const b=readFileSync(join(root,p));const hash=sha(b);if(i<2)assert(hash===expected[i],`Frozen source mismatch: ${p}`);const snapshot='final__'+p.replaceAll('/','__')+'.txt';writeFileSync(join(packet,snapshot),b,{flag:'wx',mode:0o600});owned[p]={sha256:hash,bytes:b.length,snapshot};});
const current=sourceHashes(root),red=read('body-clock-red.json'),finite=read('finite.json'),proof=read('type-only-proof.json');
assert(Object.keys(current).length===785,'Input count');
assert(Object.keys(red.sourceHashes).length===785,'RED input count');
const changed=Object.keys(current).filter(p=>current[p]!==red.sourceHashes[p]);
assert(changed.length===2&&changed.every(p=>paths.includes(p)),'Nonowned input drift');
assert(finite.sourceHashes[paths[0]]===expected[0],'Runtime source binding');
assert(finite.sourceHashes[paths[1]]===proof.beforeSha256&&expected[1]===proof.afterSha256,'Runtime test type-only binding');
assert(sha(readFileSync(join(packet,'types-before.js.txt')))===sha(readFileSync(join(packet,'types-after.js.txt'))),'Emitted JS drift');
assert(sha(readFileSync(join(packet,'clock-red-formatted-source.ts.txt')))===red.sourceHashes[paths[0]],'RED source snapshot');
assert(sha(readFileSync(join(packet,'clock-red-formatted-test.ts.txt')))===red.sourceHashes[paths[1]],'RED test snapshot');
const legacy=read('legacy-preservation-baseline.json');for(const [p,h]of Object.entries(legacy))assert(current[p]===h,'Legacy drift '+p);
const receiptNames=readdirSync(packet).filter(n=>n.endsWith('.json')&&JSON.parse(readFileSync(join(packet,n),'utf8')).result);
const receipts={};
for(const n of receiptNames){const v=read(n);const ln=n.replace(/\.json$/,'.log');const lh=sha(readFileSync(join(packet,ln)));assert(lh===v.logSha256,'Log mismatch '+n);let absent=false;try{process.kill(-v.process.processGroup,0);}catch(e){if(e.code==='ESRCH')absent=true;else throw e;}assert(absent,'Process group live '+n);receipts[n]={status:v.status,receiptSha256:sha(readFileSync(join(packet,n))),log:ln,logSha256:lh,processGroup:v.process.processGroup,processGroupAbsent:true};}
for(const n of ['types-final.json','lint-final.json','format-final.json','handoff-format.json']){const r=read(n);assert(r.status==='PASS','Final static status');assert(JSON.stringify(r.sourceHashes)===JSON.stringify(current),'Final static input mismatch '+n);}
save('preservation.json',{status:'PASS',sourceInputs:785,changedSinceClockRed:changed,otherInputsUnchanged:783,legacyNineUnchanged:legacy,runtimeReceipt:'finite.json',runtimeSourceHash:finite.sourceHashes[paths[0]],runtimeTestHash:finite.sourceHashes[paths[1]],finalTestHash:proof.afterSha256,typeOnlyEmittedJavaScriptUnchanged:true,redSnapshotsBound:true});
save('cleanup-final.json',{status:'PASS',checkedAt:new Date().toISOString(),sourceHashes:current,owned,receipts,groupCount:receiptNames.length,allGroupsAbsent:true,allLogHashesMatched:true,providerRequests:0,databaseOperations:0,sqlParsingOrExecution:0,servicesStarted:0});
for(const n of readdirSync(packet)){if(statSync(join(packet,n)).isFile())chmodSync(join(packet,n),0o600);}
const manifest={};for(const n of readdirSync(packet).sort()){if(statSync(join(packet,n)).isFile())manifest[n]={sha256:sha(readFileSync(join(packet,n))),bytes:statSync(join(packet,n)).size};}
save('archive-manifest.json',manifest);
save('final-packet.json',{status:'RELEASED_SOURCE_ONLY',root,owned,checks:{clockRed:'body-clock-red.json',finite:'finite.json',runtimeCases:36,runtimeFiles:1,types:'types-final.json',typeRoots:4,typeSources:13,typeDiagnostics:0,lint:'lint-final.json',format:'format-final.json',handoffFormat:'handoff-format.json',typeOnlyProof:'type-only-proof.json'},preservation:{file:'preservation.json',sha256:sha(readFileSync(join(packet,'preservation.json')))},cleanup:{file:'cleanup-final.json',sha256:sha(readFileSync(join(packet,'cleanup-final.json')))},hygiene:{file:'hygiene.json',sha256:sha(readFileSync(join(packet,'hygiene.json'))),densityTier:'low',score:0.1225,byteIdentical:true},archiveManifest:{file:'archive-manifest.json',sha256:sha(readFileSync(join(packet,'archive-manifest.json')))},limits:'Installed SDK and fake transport only. No native operation, ownership, accounting transaction, real provider, representative usefulness or release acceptance proof.'});
console.log(JSON.stringify({owned,packet,packetSha256:sha(readFileSync(join(packet,'final-packet.json'))),sourceInputs:785,nonownedUnchanged:783,groupsAbsent:receiptNames.length},null,2));
