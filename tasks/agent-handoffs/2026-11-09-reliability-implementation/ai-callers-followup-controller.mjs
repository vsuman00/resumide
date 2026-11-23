// Local synthetic application verification only. Never imports dotenv or runs SQL.
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  sourceHashes,
  runCommand,
} from "../../../scripts/verify-private-aa7.mjs";

if (
  process.version !== "v22.23.4" ||
  process.versions.unicode !== "17.0" ||
  process.versions.icu !== "78.3" ||
  process.versions.v8 !== "12.4.254.21-node.57"
)
  throw Error("Frozen source verification runtime required");
process.umask(0o077);
const self = fileURLToPath(import.meta.url);
const output = dirname(self);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = mkdtempSync(
  join(
    tmpdir(),
    "resumide-ai-callers-followup-",
  ),
);
mkdirSync(join(temporary, "home"));
for (const name of ["npmrc", "global-npmrc"])
  writeFileSync(join(temporary, name), "", { flag: "wx", mode: 0o600 });
const env = {
  HOME: join(temporary, "home"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_FUND: "false",
  NO_UPDATE_NOTIFIER: "1",
  PATH: `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  LANG: "en_US.UTF-8",
  TZ: "Asia/Kolkata",
  NO_COLOR: "1",
  RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
  AI_ENABLED: "false",
  OPENAI_API_KEY: "offline-no-live-key",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "offline-publishable",
  SUPABASE_SECRET_KEY: "offline-secret",
  SUPABASE_RESUME_BUCKET: "resumes",
  APP_ORIGIN: "http://127.0.0.1:3110",
  NPM_CONFIG_USERCONFIG: join(temporary, "npmrc"),
  NPM_CONFIG_GLOBALCONFIG: join(temporary, "global-npmrc"),
};
const digest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const inputs = () => ({
  ...sourceHashes(root, env),
  ".env.example": digest(join(root, ".env.example")),
  "docs/decisions/0020-owned-ai-accounting-retention.md": digest(join(root, "docs/decisions/0020-owned-ai-accounting-retention.md")),
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/ai-callers-followup-controller.mjs":
    digest(self),
  ...Object.fromEntries(
    [
      "ai-callers-followup-allocation.json",
      "ai-callers-contract.json",
      "ai-callers-contract-amendment.json",
      "ai-callers-codec-vectors.json",
      "ai-callers-backend-allocation.json",
      "ai-callers-runtime-allocation.json",
      "ai-callers-peer-allocation.json",
      "ai-callers-backend-integration.json",
      "ai-callers-runtime-integration.json",
      "peer-ai-callers.md",
      "backend-ai-callers.md",
      "runtime-ai-callers.md",
      "ai-callers-runtime-followup-allocation.json",
      "ai-callers-runtime-followup-integration.json",
      "runtime-ai-callers-followup.md",
      "peer-ai-callers-followup.md",
    ].map((name) => [
      `tasks/agent-handoffs/2026-11-09-reliability-implementation/${name}`,
      digest(join(output, name)),
    ]),
  ),
});
const gitDirectory = execFileSync("/usr/bin/git", ["rev-parse", "--absolute-git-dir"], { cwd: root, env, encoding: "utf8" }).trim();
const isolationPolicy = `(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath ${JSON.stringify(gitDirectory)}))\n` + [".env", ".env.local", ".env.test", ".env.test.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"].map((file) => `(deny file-read* (literal ${JSON.stringify(join(root, file))}))\n`).join("");
const name = `ai-callers-followup-${randomUUID()}`;
const log = join(output, `${name}.log`);
const receiptPath = join(output, `${name}.json`);
const fd = openSync(log, "wx", 0o600);
const before = inputs();
const receipt = {
  status: "RUNNING",
  node: process.version,
  startedAt: new Date().toISOString(),
  controllerProcess: {
    pid: process.pid,
    startIdentity: execFileSync(
      "/bin/ps",
      ["-o", "pid=,pgid=,lstart=", "-p", String(process.pid)],
      { env, encoding: "utf8", timeout: 1000 },
    ).trim(),
  },
  baseHead: execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], {
    cwd: root,
    env,
    encoding: "utf8",
  }).trim(),
  environment: "SEALED_EMPTY_HOME_OS_NETWORK_DENIED_ROOT_DOTENV_READ_DENIED_GIT_WRITE_DENIED",
  isolationPolicy,
  unitWorkers: 4,
  exhaustivePartition: "Three repaired fixture files underSeatbelt; SHA-pinned neutral lifecycle file plainsealedbecauseSeatbeltcannotrunps. Other271 complete passed files are carried only by exact unchanged-input proof. No skip; no fresh whole-suite pass claimed. DirectinstalledVitestCLI equals package testscript.",
  outerDeadlineMs: 1200000,
  testDeadlineMs: 600000,
  log: `${name}.log`,
  sourceInputs: Object.keys(before).length,
  sourceHashes: before,
  commands: [],
  providerRequests: 0,
  databaseOperations: 0,
  dockerOperations: 0,
  browserTests: "NOT_RUN",
  sqlExecution: "NOT_RUN",
};
const save = () =>
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
const tests = ["tests/unit/canonical-rewrite-service.test.ts", "tests/unit/initial-feedback-stage.test.ts", "tests/unit/qualitative-stage-outage.test.ts"];
const expectedTests = [...tests, "tests/unit/private-verification.test.ts"].map(name => join(root,name)).sort();
receipt.expectedTestFiles = expectedTests;
receipt.sourceAudit = "Three repaired fixture files plus unchanged audited neutral lifecycle file; no fresh whole-suite pass claimed.";
const baselinePath = join(output,"ai-callers-integrated-bcbb73e2-209a-44e0-a91c-a5ceec86b77d.json");
const baseline = JSON.parse(readFileSync(baselinePath,"utf8"));
const baselineReportPath = join(output,baseline.log.replace(/\.log$/,".bulk-tests.json"));
const baselineReport = JSON.parse(readFileSync(baselineReportPath,"utf8"));
if(baseline.status!=="FAILED_OR_INCOMPLETE" || baseline.changedSourceInputs.length || baseline.summary.testsFailed!==11 || digest(baselineReportPath)!==baseline.summary.partitions[0].sha256 || digest(join(output,baseline.log))!==baseline.logSha256) throw Error("Original failed receipt drift");
const allowedChanges = new Set(tests);
const changedFromBulk = Object.keys(baseline.sourceHashes).filter(name=>digest(join(root,name))!==baseline.sourceHashes[name]);
if(changedFromBulk.length!==3 || changedFromBulk.some(name=>!allowedChanges.has(name)))throw Error("Carry-forward source drift outside three fixture files");
const carried = baselineReport.testResults.filter(row=>row.status==="passed");
if(carried.length!==271 || carried.some(row=>row.assertionResults.some(test=>test.status!=="passed")) || carried.some(row=>expectedTests.includes(row.name)))throw Error("Invalid disjoint carry partition");
for(const row of carried){const name=row.name.slice(root.length);if(digest(row.name)!==baseline.sourceHashes[name])throw Error("Carried test source drift");}
const carriedCases=carried.reduce((n,row)=>n+row.assertionResults.length,0);
if(carriedCases!==5509)throw Error("Carry case count drift");
receipt.carryEvidence={baselineReceipt:baselinePath,baselineReceiptSha256:digest(baselinePath),bulkReportSha256:digest(baselineReportPath),files:271,cases:5509,changedFromBulk,productionInputsUnchanged:true,carriedFileNames:carried.map(row=>row.name),allUnitComponentExpectedFileNames:baseline.expectedTestFiles};

for (const relative of tests) {
  if (!statSync(join(root, relative)).isFile())
    throw Error("Required affected test is missing");
}
for (const allocationFile of [
  "ai-callers-followup-allocation.json",
]) {
  const allocation = JSON.parse(
    readFileSync(join(output, allocationFile), "utf8"),
  );
  if (allocation.status !== "FROZEN_SOURCE_CANDIDATE")
    throw Error("Caller source candidate has not been frozen");
  if (
    !allocation.integratedFiles ||
    Object.keys(allocation.integratedFiles).length < 3
  )
    throw Error("Caller source source bindings are missing");
  for (const [relative, expected] of Object.entries(
    allocation.integratedFiles,
  )) {
    const path = join(root, relative);
    if (
      !statSync(path).isFile() ||
      statSync(path).size === 0 ||
      digest(path) !== expected
    )
      throw Error("Caller source source binding drift");
  }
}
// The sole unisolated partition retains the exact previously audited neutral process fixtures.
for (const [relative, expected] of Object.entries({"tests/unit/private-verification.test.ts": "1b81db6bd2de5f22c4b7ba0a3a01a357686d1c7edb435b4b2c06e46f2a06da39", "scripts/verify-private-aa7.mjs": "61824cf91a9488a41093ab7774c7fb0e56ba45fa8c959f0ff9efd2a6e79ec226"}))
  if (digest(join(root, relative)) !== expected) throw Error("Neutral lifecycle fixture drift");
const overall = Date.now() + 1200_000;
const stagePassed = (item) => {
  const result = item.lifecycle?.result;
  return (
    item.lifecycle?.status === "settled" &&
    result?.code === 0 &&
    result.signal === null &&
    result.abortRequested === null &&
    result.startFailed === false &&
    result.groupCleanupConfirmed === true &&
    result.manualGroupCleanupRequired === false &&
    item.deadlineExceeded !== true &&
    typeof item.process?.startIdentity === "string" &&
    item.process.startIdentity.trim().length > 0 &&
    result.processGroup === item.process.processGroup
  );
};
let logLimitExceeded = false;
const watcher = setInterval(() => {
  try {
    if (statSync(log).size <= 32 * 1024 * 1024 || logLimitExceeded) return;
    logLimitExceeded = true;
  } catch {
    receipt.logObservationError = true;
  }
  process.kill(process.pid, "SIGTERM");
}, 100);
save();
const vitest = join(root, "node_modules/vitest/vitest.mjs");
const packageScripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
if (packageScripts.test !== "vitest run" || packageScripts.pretest || packageScripts.posttest)
  throw Error("Direct installed test script equivalence changed");
const reportPaths = [join(output, `${name}.bulk-tests.json`), join(output, `${name}.lifecycle-tests.json`)];
const stages = [
  { label: "three-updated-fixture-files", command: process.execPath, args: [vitest, "run", ...tests, "--exclude=tests/unit/private-verification.test.ts", "--maxWorkers=4", "--reporter=default", "--reporter=json", `--outputFile=${reportPaths[0]}`], isolated: true, maxMs: 600000 },
  { label: "all-process-lifecycle-tests", command: process.execPath, args: [vitest, "run", "tests/unit/private-verification.test.ts", "--maxWorkers=1", "--reporter=default", "--reporter=json", `--outputFile=${reportPaths[1]}`], isolated: false, maxMs: 60000 },
  ...[["typecheck",120000],["lint",120000],["build",180000],["build:worker",120000]].map(([script,maxMs]) => ({ label:script, command:"/opt/homebrew/bin/npm",args:["run",script],isolated:true,maxMs })),
];
for (const spec of stages) {
  const command = spec.isolated ? "/usr/bin/sandbox-exec" : spec.command;
  const args = spec.isolated ? ["-p", isolationPolicy, spec.command, ...spec.args] : spec.args;
  const item = { label:spec.label, command:spec.command, args:spec.args, isolation:spec.isolated ? "OS_NETWORK_ENV_GIT_DENIED" : "PLAIN_SEALED_EMPTY_HOME_SOURCE_AUDITED_PROCESS_FIXTURE_NO_LIVE_PATH", startedAt:new Date().toISOString() };
  receipt.commands.push(item); save();
  let stageTimer,graceTimer;
  const lifecycle=runCommand(command,args,{cwd:root,env,logFd:fd,onStart:(identity)=>{item.process=identity;save();}}).then(result=>({status:"settled",result}));
  const stageMs=Math.min(spec.maxMs,Math.max(1,overall-Date.now()));
  const timeout=new Promise(resolve=>{stageTimer=setTimeout(()=>{item.deadlineExceeded=true;process.kill(process.pid,"SIGTERM");graceTimer=setTimeout(()=>resolve({status:"UNKNOWN_OWNED_LIFECYCLE"}),10000);},stageMs);});
  item.lifecycle=await Promise.race([lifecycle,timeout]);clearTimeout(stageTimer);clearTimeout(graceTimer);item.finishedAt=new Date().toISOString();save();
  if(!stagePassed(item)||logLimitExceeded||receipt.logObservationError)break;
}
clearInterval(watcher);
closeSync(fd);
receipt.finishedAt = new Date().toISOString();
const after = inputs();
receipt.changedSourceInputs = [
  ...new Set([...Object.keys(before), ...Object.keys(after)]),
].filter((key) => before[key] !== after[key]);
receipt.logSha256 = digest(log);
receipt.logLimitExceeded = logLimitExceeded;
receipt.status =
  receipt.commands.length === 6 &&
  receipt.commands.every(stagePassed) &&
  !receipt.changedSourceInputs.length &&
  !logLimitExceeded &&
  !receipt.logObservationError
    ? "PASS"
    : "FAILED_OR_INCOMPLETE";
const text = readFileSync(log, "utf8").replace(/\u001b\[[0-9;]*m/g, "");
receipt.summary = { testFilesPassed:0, testsPassed:0, testsFailed:0, testsPending:0, duplicateFiles:[], partitions:[] };
const seenFiles = new Set();
for (const path of reportPaths) {
  try {
    const report=JSON.parse(readFileSync(path,"utf8"));
    const rows=report.testResults;
    if(!Array.isArray(rows))throw Error("Missing test file results");
    for(const row of rows){if(seenFiles.has(row.name))receipt.summary.duplicateFiles.push(row.name);seenFiles.add(row.name);}
    const partition={path,sha256:digest(path),files:rows.length,passed:report.numPassedTests,failed:report.numFailedTests,pending:report.numPendingTests,status:report.success};
    receipt.summary.partitions.push(partition);receipt.summary.testFilesPassed+=rows.filter(row=>row.status==="passed").length;receipt.summary.testsPassed+=partition.passed;receipt.summary.testsFailed+=partition.failed;receipt.summary.testsPending+=partition.pending;
  }catch{receipt.reportIncomplete=true;}
}
receipt.summary.missingFiles = expectedTests.filter(path => !seenFiles.has(path));
receipt.summary.unexpectedFiles = [...seenFiles].filter(path => !expectedTests.includes(path));
if(receipt.summary.partitions.length!==2||receipt.summary.testsFailed||receipt.summary.testsPending||receipt.summary.duplicateFiles.length||receipt.summary.missingFiles.length||receipt.summary.unexpectedFiles.length||receipt.reportIncomplete)receipt.status="FAILED_OR_INCOMPLETE";

receipt.summary.carriedCases=5509;
receipt.summary.carriedFiles=271;
receipt.summary.totalUniqueCases=receipt.summary.testsPassed+5509;
receipt.summary.totalUniqueFiles=receipt.summary.testFilesPassed+271;
const combinedFiles = [...new Set([...receipt.carryEvidence.carriedFileNames,...seenFiles])].sort();
if(combinedFiles.length!==receipt.carryEvidence.allUnitComponentExpectedFileNames.length || receipt.carryEvidence.allUnitComponentExpectedFileNames.some(name=>!combinedFiles.includes(name)))receipt.status="FAILED_OR_INCOMPLETE";
receipt.artifacts = {};
if (receipt.status === "PASS")
  for (const path of ["build/server/index.js", "build/worker/analysis.mjs"])
    receipt.artifacts[path] = {
      bytes: statSync(join(root, path)).size,
      sha256: digest(join(root, path)),
    };
save();
process.stdout.write(
  `${JSON.stringify({ status: receipt.status, receipt: receiptPath, summary: receipt.summary, sourceInputs: receipt.sourceInputs })}\n`,
);
process.exit(receipt.status === "PASS" ? 0 : 1);
