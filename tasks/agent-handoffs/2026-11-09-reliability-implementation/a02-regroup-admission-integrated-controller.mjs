// Local synthetic application verification only. Never imports dotenv or runs SQL.
import {
  closeSync,
  mkdtempSync,
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
  join(tmpdir(), "resumide-a02-regroup-admission-integrated-"),
);
for (const name of ["npmrc", "global-npmrc"])
  writeFileSync(join(temporary, name), "", { flag: "wx", mode: 0o600 });
const env = {
  HOME: process.env.HOME,
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
  "tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-admission-integrated-controller.mjs":
    digest(self),
  ...Object.fromEntries(
    [
      "a02-regroup-admission-contract.json",
      "a02-regroup-admission-scaffold.json",
    ].map((name) => [
      `tasks/agent-handoffs/2026-11-09-reliability-implementation/${name}`,
      digest(join(output, name)),
    ]),
  ),
});
const name = `a02-regroup-admission-integrated-${randomUUID()}`;
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
  environment: "SEALED_NO_LIVE_CREDENTIALS_NO_DOTENV",
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
const tests = [
  "tests/unit/entry-regroup-admission-sql.test.ts",
  "tests/unit/canonical-entry-regroup-repository.test.ts",
  "tests/unit/canonical-resume-schema.test.ts",
  "tests/unit/canonical-sql-contract.test.ts",
  "tests/components/CanonicalEntryRegroupReview.test.tsx",
  "tests/unit/canonical-route.test.ts",
  "tests/unit/canonical-entry-regroup-commands.test.ts",
];
const overall = Date.now() + 600_000;
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
    if (statSync(log).size <= 8 * 1024 * 1024 || logLimitExceeded) return;
    logLimitExceeded = true;
  } catch {
    receipt.logObservationError = true;
  }
  process.kill(process.pid, "SIGTERM");
}, 100);
save();
for (const args of [
  ["test", "--", ...tests],
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
  const lifecycle = runCommand("/opt/homebrew/bin/npm", args, {
    cwd: root,
    env,
    logFd: fd,
    onStart: (identity) => {
      item.process = identity;
      save();
    },
  }).then((result) => ({ status: "settled", result }));
  const stageMs = Math.min(
    args[1] === "build" ? 180_000 : 120_000,
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
  receipt.commands.length === 5 &&
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
