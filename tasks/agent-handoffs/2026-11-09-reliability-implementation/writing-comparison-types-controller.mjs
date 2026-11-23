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
    "resumide-writing-comparison-integrated-",
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
  "docs/operations/AI_BUDGETS.md": digest(join(root, "docs/operations/AI_BUDGETS.md")),
  "docs/operations/OWNED_AI_EXPIRY.md": digest(join(root, "docs/operations/OWNED_AI_EXPIRY.md")),
  "docs/operations/RESTORE_ADMISSION.md": digest(join(root, "docs/operations/RESTORE_ADMISSION.md")),
  "docs/security/PRIVACY_DATA_MAP.md": digest(join(root, "docs/security/PRIVACY_DATA_MAP.md")),
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/writing-comparison-types-controller.mjs":
    digest(self),
  "docs/design/SCORING_V2_REVIEW.md":digest(join(root,"docs/design/SCORING_V2_REVIEW.md")),
  "docs/design/CANDIDATE_AUTHORING_WORKSPACE.md":digest(join(root,"docs/design/CANDIDATE_AUTHORING_WORKSPACE.md")),
  ...Object.fromEntries([
    "writing-comparison-type-followup-allocation.json",
    "writing-comparison-contract.json",
    "writing-comparison-source-sync.json",
    "writing-comparison-backend-allocation.json",
    "writing-comparison-frontend-allocation.json",
    "writing-comparison-review-allocation.json",
    "writing-comparison-frontend-dependency-sync-01.json",
    "writing-comparison-frontend-dependency-sync-02.json",
    "writing-comparison-frontend-successor-integration.json",
    "writing-comparison-review-traceability-successor.md",
    "writing-comparison-selector-followup-allocation.json",
    "writing-comparison-selector-followup-integration.json",
    "writing-comparison-review-test-scope-successor.md",
    "writing-comparison-types-allocation.json",
    "writing-comparison-types-integration.json",
    "writing-comparison-types-preservation.json",
    "writing-comparison-review-type-integration-successor.md",
    "writing-comparison-backend-integration.json",
    "writing-comparison-frontend-integration.json",
    "writing-comparison-review.md",
    "writing-comparison-backend.md",
    "writing-comparison-frontend.md",
  ].map(name=>[`tasks/agent-handoffs/2026-11-09-reliability-implementation/${name}`,digest(join(output,name))])),
});
const gitDirectory = execFileSync("/usr/bin/git", ["rev-parse", "--absolute-git-dir"], { cwd: root, env, encoding: "utf8" }).trim();
const isolationPolicy = `(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath ${JSON.stringify(gitDirectory)}))\n` + [".env", ".env.local", ".env.test", ".env.test.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"].map((file) => `(deny file-read* (literal ${JSON.stringify(join(root, file))}))\n`).join("");
const name = `writing-comparison-types-${randomUUID()}`;
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
  exhaustivePartition: "All affected files/cases underSeatbelt, no skip. Direct installed VitestCLI equals package test script without npm metadata activity.",
  outerDeadlineMs: 1200000,
  testDeadlineMs: 180000,
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
const tests = ["tests/unit/score-snapshot-binding.test.ts", "tests/unit/scoring-release-admission.test.ts"];
const expectedTests = tests.map(name=>join(root,name)).sort();
receipt.expectedTestFiles=expectedTests;
receipt.sourceAudit="Only two changed typed readmodel fixture files. Production emitted JavaScript is independently identical; Root reconciles current713original+19new snapshot cases across three receipts without double counting. All stages OS-network/dotenv/Git-write denied; no integration/Native/browser/provider/realdata.";
for(const relative of tests)if(!statSync(join(root,relative)).isFile())throw Error("Required affected test is missing");
for (const allocationFile of [
  "writing-comparison-type-followup-allocation.json",
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
const reportPaths=[join(output,`${name}.affected-tests.json`)];
const stages=[
 {label:"changed-readmodel-type-fixtures",command:process.execPath,args:[vitest,"run",...tests,"--maxWorkers=4","--reporter=default","--reporter=json",`--outputFile=${reportPaths[0]}`],isolated:true,maxMs:180000},
 ...[["typecheck",120000],["lint",120000],["build",180000],["build:worker",120000]].map(([script,maxMs])=>({label:script,command:"/opt/homebrew/bin/npm",args:["run",script],isolated:true,maxMs})),
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
  receipt.commands.length === 5 &&
  receipt.commands.every(stagePassed) &&
  !receipt.changedSourceInputs.length &&
  !logLimitExceeded &&
  !receipt.logObservationError
    ? "PASS"
    : "FAILED_OR_INCOMPLETE";
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
if(receipt.summary.partitions.length!==1||receipt.summary.testsFailed||receipt.summary.testsPending||receipt.summary.duplicateFiles.length||receipt.summary.missingFiles.length||receipt.summary.unexpectedFiles.length||receipt.reportIncomplete)receipt.status="FAILED_OR_INCOMPLETE";

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
