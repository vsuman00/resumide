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
    "resumide-budget-required-integrated-",
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
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/budget-required-integrated-controller.mjs": digest(join(output, "budget-required-integrated-controller.mjs")),
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/budget-required-followup-controller.mjs": digest(self),
  ...Object.fromEntries(
    [
      "budget-required-integrated-allocation.json",
      "budget-required-contract.json",
      "budget-required-backend-allocation.json",
      "budget-required-runtime-allocation.json",
      "budget-required-peer-allocation.json",
      "budget-required-backend-integration.json",
      "budget-required-runtime-integration.json",
      "peer-budget-required.md",
      "backend-budget-required.md",
      "runtime-budget-required.md",
      "budget-required-runtime-followup-allocation.json",
      "budget-required-runtime-followup-integration.json",
      "runtime-budget-required-followup.md",
      "peer-budget-required-followup.md",
    ].map((name) => [
      `tasks/agent-handoffs/2026-11-09-reliability-implementation/${name}`,
      digest(join(output, name)),
    ]),
  ),
});
const gitDirectory = execFileSync("/usr/bin/git", ["rev-parse", "--absolute-git-dir"], { cwd: root, env, encoding: "utf8" }).trim();
const isolationPolicy = `(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath ${JSON.stringify(gitDirectory)}))\n` + [".env", ".env.local", ".env.test", ".env.test.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"].map((file) => `(deny file-read* (literal ${JSON.stringify(join(root, file))}))\n`).join("");
const name = `budget-required-followup-${randomUUID()}`;
const log = join(output, `${name}.log`);
const receiptPath = join(output, `${name}.json`);
const fd = openSync(log, "wx", 0o600);
const before = inputs();
const previousPath = join(output, "budget-required-integrated-22abcfd1-990c-4fe4-9d7c-9692e51d40fc.json");
if (digest(previousPath) !== "e00226ea8a0fa8afb7d26d82ba1384f276aa756dbf8f43f4fe74cc69966c1668") throw Error("Original failed receipt drift");
const previous = JSON.parse(readFileSync(previousPath, "utf8"));
if (previous.changedSourceInputs.length || previous.summary.testsFailed !== 7) throw Error("Original source execution not stable");
const originalReportPath = previous.summary.partitions[0].path;
if (digest(originalReportPath) !== previous.summary.partitions[0].sha256 || digest(join(output, previous.log)) !== previous.logSha256) throw Error("Original executed evidence drift");
const originalReport = JSON.parse(readFileSync(originalReportPath, "utf8"));
const repaired = ["tests/unit/canonical-rewrite-route.test.ts", "tests/unit/canonical-rewrite-workspace.test.ts"];
const allowed = new Set([...repaired, "tasks/agent-handoffs/2026-11-09-reliability-implementation/budget-required-integrated-allocation.json"]);
const drift = Object.keys(previous.sourceHashes).filter(key => previous.sourceHashes[key] !== before[key] && !allowed.has(key));
const unexpectedSources = Object.keys(before).filter(key => !(key in previous.sourceHashes) && !key.startsWith("tasks/agent-handoffs/2026-11-09-reliability-implementation/"));
if (drift.length || unexpectedSources.length) throw Error("Cannot carry results across unrelated source changes");
const carried = originalReport.testResults.filter(row => row.status === "passed" && !repaired.some(path => row.name === join(root, path)));
if (carried.length !== 275 || carried.some(row => row.assertionResults.some(test => test.status !== "passed"))) throw Error("Carried execution has incomplete cases");
for (const row of carried) {const relative = row.name.slice(root.length); if (digest(row.name) !== previous.sourceHashes[relative]) throw Error("Carried test bytes changed");}
const carriedReportPath = join(output, `${name}.carried-tests.json`);
writeFileSync(carriedReportPath, JSON.stringify({schemaVersion:"carried-passed-vitest-files/1", execution:"NOT_RERUN_VERIFIED_IDENTICAL_SOURCE_CARRY_FORWARD", originalReceipt:previousPath, originalReceiptSha256:digest(previousPath), originalReportSha256:digest(originalReportPath), numPassedTests:carried.reduce((sum,row)=>sum+row.assertionResults.length,0),numFailedTests:0,numPendingTests:0,success:true,testResults:carried},null,2)+"\n");
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
  exhaustivePartition: "275 fully passed files carried from exact frozen production/test inputs; two failed fixture files freshly executed; SHA-pinned three-case neutral lifecycle file executes plain sealed. No case omitted or counted twice.",
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
const tests = ["tests/unit", "tests/components"];
const expectedTests = Object.keys(before).filter(name =>
  ((name.startsWith("tests/unit/") && name.endsWith(".test.ts")) ||
   (name.startsWith("tests/components/") && name.endsWith(".test.tsx"))) &&
  !name.split("/").some(part => part.startsWith("._"))
).map(name => join(root, name)).sort();
receipt.expectedTestFiles = expectedTests;
receipt.sourceAudit = "All unit/component cases only; integration/Native/browser not included. Sole plain-sealed neutral process file matches frozen audited SHA and existing disposable Git-fixture exception.";
for (const relative of tests) {
  if (!statSync(join(root, relative)).isDirectory())
    throw Error("Required affected test is missing");
}
for (const allocationFile of [
  "budget-required-integrated-allocation.json",
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
const reportPaths = [carriedReportPath, join(output, `${name}.repaired-tests.json`), join(output, `${name}.lifecycle-tests.json`)];
const stages = [
  { label: "observed-two-fixture-repairs", command: process.execPath, args: [vitest, "run", ...repaired, "--maxWorkers=2", "--reporter=default", "--reporter=json", `--outputFile=${reportPaths[1]}`], isolated: true, maxMs: 120000 },
  { label: "all-process-lifecycle-tests", command: process.execPath, args: [vitest, "run", "tests/unit/private-verification.test.ts", "--maxWorkers=1", "--reporter=default", "--reporter=json", `--outputFile=${reportPaths[2]}`], isolated: false, maxMs: 60000 },
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
receipt.summary = { testFilesPassed:0, testsPassed:0, testsFailed:0, testsPending:0, duplicateFiles:[], partitions:[] };
const seenFiles = new Set();
for (const path of reportPaths) {
  try {
    const report=JSON.parse(readFileSync(path,"utf8"));
    const rows=report.testResults;
    if(!Array.isArray(rows))throw Error("Missing test file results");
    for(const row of rows){if(seenFiles.has(row.name))receipt.summary.duplicateFiles.push(row.name);seenFiles.add(row.name);}
    const partition={path,mode:path===carriedReportPath ? "CARRIED_FROM_FROZEN_EXECUTED_SOURCE" : "FRESH_EXECUTION",sha256:digest(path),files:rows.length,passed:report.numPassedTests,failed:report.numFailedTests,pending:report.numPendingTests,status:report.success};
    receipt.summary.partitions.push(partition);receipt.summary.testFilesPassed+=rows.filter(row=>row.status==="passed").length;receipt.summary.testsPassed+=partition.passed;receipt.summary.testsFailed+=partition.failed;receipt.summary.testsPending+=partition.pending;
  }catch{receipt.reportIncomplete=true;}
}
receipt.summary.missingFiles = expectedTests.filter(path => !seenFiles.has(path));
receipt.summary.unexpectedFiles = [...seenFiles].filter(path => !expectedTests.includes(path));
if(receipt.summary.partitions.length!==3||receipt.summary.testsFailed||receipt.summary.testsPending||receipt.summary.duplicateFiles.length||receipt.summary.missingFiles.length||receipt.summary.unexpectedFiles.length||receipt.reportIncomplete)receipt.status="FAILED_OR_INCOMPLETE";

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
