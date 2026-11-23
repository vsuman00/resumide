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
    "resumide-a13-worker-adoption-static-followup-",
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
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_USERCONFIG: join(temporary, "npmrc"),
  NPM_CONFIG_GLOBALCONFIG: join(temporary, "global-npmrc"),
};
const digest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const inputs = () => ({
  ...sourceHashes(root, env),
  ".env.example": digest(join(root, ".env.example")),
  "docs/decisions/0020-owned-ai-accounting-retention.md": digest(join(root, "docs/decisions/0020-owned-ai-accounting-retention.md")),
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/a13-worker-adoption-static-followup-controller.mjs":
    digest(self),
  ...Object.fromEntries(
    [
      "a13-worker-adoption-integrated-allocation.json",
      "a13-worker-adoption-contract.json",
      "a13-worker-adoption-integrated-8dce4a82-890f-4a5b-acd3-f80b478a54a1.json",
      "a13-worker-backend-author-evidence/root-evidence-rename.json",
      "a13-worker-adoption-ordering-supplement.json",
      "a13-worker-stage-coordinator.json",
      "a13-worker-startup-coordinator.json",
      "a13-worker-integration-peer-coordinator.json",
      "a13-worker-integration-peer.md",
      "a13-worker-backend-integration.json",
      "a13-worker-runtime-integration.json",
      "owned-ai-privacy-final-integrated-review.json",
    ].map((name) => [
      `tasks/agent-handoffs/2026-11-09-reliability-implementation/${name}`,
      digest(join(output, name)),
    ]),
  ),
});
const gitDirectory = execFileSync("/usr/bin/git", ["rev-parse", "--absolute-git-dir"], { cwd: root, env, encoding: "utf8" }).trim();
const isolationPolicy = `(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath ${JSON.stringify(gitDirectory)}))\n` + [".env", ".env.local", ".env.test", ".env.test.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"].map((file) => `(deny file-read* (literal ${JSON.stringify(join(root, file))}))\n`).join("");
const name = `a13-worker-adoption-static-followup-${randomUUID()}`;
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
  outerDeadlineMs: 1200000,
  testDeadlineMs: 600000,
  log: `${name}.log`,
  sourceInputs: Object.keys(before).length,
  sourceHashes: before,
  commands: [],
  unitEvidence: "Prior integrated receipt223/10PASS; onlyarchive extension changed; testsnotrepeated",
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
const tests = [
  "tests/unit/initial-feedback-stage.test.ts",
  "tests/unit/worker-readiness.test.ts",
  "tests/unit/config.test.ts",
  "tests/unit/qualitative-stage.test.ts",
  "tests/unit/qualitative-stage-outage.test.ts",
  "tests/unit/worker-runner.test.ts",
  "tests/unit/analysis-worker-fence.test.ts",
  "tests/unit/worker-startup.test.ts",
  "tests/unit/document-worker-cli.test.ts",
  "tests/unit/initial-feedback-service.test.ts",
];
for (const relative of tests) {
  if (!statSync(join(root, relative)).isFile())
    throw Error("Required affected test is missing");
}
for (const allocationFile of [
  "a13-worker-adoption-integrated-allocation.json",
]) {
  const allocation = JSON.parse(
    readFileSync(join(output, allocationFile), "utf8"),
  );
  if (allocation.status !== "FROZEN_SOURCE_CANDIDATE")
    throw Error("A13 candidate has not been frozen");
  if (
    !allocation.integratedFiles ||
    Object.keys(allocation.integratedFiles).length < 3
  )
    throw Error("A13 source bindings are missing");
  for (const [relative, expected] of Object.entries(
    allocation.integratedFiles,
  )) {
    const path = join(root, relative);
    if (
      !statSync(path).isFile() ||
      statSync(path).size === 0 ||
      digest(path) !== expected
    )
      throw Error("A13 source binding drift");
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
for (const args of [
  ["run", "typecheck"],
  ["run", "lint"],
  ["run", "build"],
  ["run", "build:worker"],
]) {
  const item = {
    command: `npm ${args.join(" ")}`,
    startedAt: new Date().toISOString(),
  };
  receipt.commands.push(item);
  save();
  let stageTimer, graceTimer;
  const lifecycle = runCommand("/usr/bin/sandbox-exec", ["-p", isolationPolicy, "/opt/homebrew/bin/npm", ...args], {
    cwd: root,
    env,
    logFd: fd,
    onStart: (identity) => {
      item.process = identity;
      save();
    },
  }).then((result) => ({ status: "settled", result }));
  const stageMs = Math.min(
    args[0] === "test" ? 600_000 : args[1] === "build" ? 180_000 : 120_000,
    Math.max(1, overall - Date.now()),
  );
  const timeout = new Promise((resolve) => {
    stageTimer = setTimeout(() => {
      item.deadlineExceeded = true;
      process.kill(process.pid, "SIGTERM");
      graceTimer = setTimeout(
        () => resolve({ status: "UNKNOWN_OWNED_LIFECYCLE" }),
        10_000,
      );
    }, stageMs);
  });
  item.lifecycle = await Promise.race([lifecycle, timeout]);
  clearTimeout(stageTimer);
  clearTimeout(graceTimer);
  item.finishedAt = new Date().toISOString();
  save();
  if (!stagePassed(item) || logLimitExceeded || receipt.logObservationError)
    break;
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
  receipt.commands.length === 4 &&
  receipt.commands.every(stagePassed) &&
  !receipt.changedSourceInputs.length &&
  !logLimitExceeded &&
  !receipt.logObservationError
    ? "PASS"
    : "FAILED_OR_INCOMPLETE";
const text = readFileSync(log, "utf8").replace(/\u001b\[[0-9;]*m/g, "");
receipt.summary = {
  testFilesPassed: Number(
    text.match(/Test Files[^\n]*?\b(\d+) passed/)?.[1] ?? 0,
  ),
  testsPassed: Number(text.match(/Tests[^\n]*?\b(\d+) passed/)?.[1] ?? 0),
};
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
