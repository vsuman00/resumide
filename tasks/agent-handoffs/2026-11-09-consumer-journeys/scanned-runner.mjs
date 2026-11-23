// Isolated validation driver. Does not modify application files or build outputs.
import process from "node:process";
import { randomUUID, createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { pathToFileURL, fileURLToPath } from "node:url";
const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const image = process.argv[2];
if (
  process.versions.node.split(".")[0] !== "22" ||
  ![3, 4].includes(process.argv.length) ||
  !/^sha256:[a-f0-9]{64}$/.test(image ?? "")
)
  throw Error("Node22 and one allocated immutable worker image are required");
if (process.env.CONSUMER_BROWSER_ALLOCATION !== "port3110-ready-20261109")
  throw Error("Coordinator service allocation required");
const coreOnly = process.argv[3] === "--core-only";
if (process.argv[3] && !coreOnly) throw Error("Unknown browser selection");
process.umask(0o077);
const { runCommand, sourceHashes } = await import(
  pathToFileURL(join(root, "scripts/verify-private-aa7.mjs"))
);
const configured = parseEnv(readFileSync(join(root, ".env"), "utf8"));
const supabase = Object.fromEntries(
  [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_RESUME_BUCKET",
  ].map((name) => [name, configured[name] ?? ""]),
);
if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabase.SUPABASE_URL) ||
  !supabase.SUPABASE_PUBLISHABLE_KEY ||
  !supabase.SUPABASE_SECRET_KEY
)
  throw Error("Configured managed target unavailable");
supabase.SUPABASE_RESUME_BUCKET ||= "resumes";
const id = randomUUID();
const directory = `/tmp/resumide-aa7-private-${id}`;
const browserLedger = `/tmp/resumide-auth-audit-consumer-${id}.jsonl`;
const aa7Ledger = `/tmp/resumide-aa7-consumer-${id}.jsonl`;
const evidence = `docs/evaluation/aa7-completion-${id}`;
mkdirSync(directory, { mode: 0o700 });
mkdirSync(join(directory, "playwright"), { mode: 0o700 });
mkdirSync(join(root, evidence), { mode: 0o700 });
for (const ledger of [browserLedger, aa7Ledger])
  closeSync(openSync(ledger, "wx", 0o600));
const environment = {
  ...Object.fromEntries(
    ["HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "SYSTEMROOT"]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  ),
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  ...supabase,
  RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
  AI_ENABLED: "false",
  OPENAI_API_KEY: "build-ai-harness-no-live-key",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  APP_ORIGIN: "http://127.0.0.1:3110",
  LATEX_COMPILER_IMAGE: image,
  BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
  BROWSER_TEST_SUPABASE_URL: supabase.SUPABASE_URL,
  BROWSER_TEST_LEDGER: browserLedger,
  AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
  AA7_TEST_SUPABASE_URL: supabase.SUPABASE_URL,
  AA7_AUTH_RECEIPT_FILE: aa7Ledger,
  BROWSER_EVIDENCE_DIR: evidence,
  BROWSER_PRIVATE_OUTPUT_DIR: join(directory, "playwright"),
  CANONICAL_AUTHORING_ENABLED: "true",
  JOB_INTELLIGENCE_ENABLED: "true",
  SCORING_V2_ENABLED: "true",
  AUTHORING_ENABLED: "true",
  ARTIFACT_RENDERING_ENABLED: "true",
  NATIVE_EVIDENCE_ENABLED: "true",
  EVIDENCE_REVIEW_ENABLED: "true",
  NATIVE_LAYOUT_ENABLED: "true",
};
const driverDirectory = dirname(fileURLToPath(import.meta.url));
const driverHashes = Object.fromEntries(
  [
    "scanned-runner.mjs",
    "scanned.config.ts",
    "core.config.ts",
    "scanned-consumer.spec.ts",
  ].map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(join(driverDirectory, name)))
      .digest("hex"),
  ]),
);
const status = {
  driverHashes,
  startedAt: new Date().toISOString(),
  node: process.version,
  image,
  state: "running",
  cleanupRequired: true,
  directory,
  browserLedger,
  aa7Ledger,
  evidence,
  sourceHashes: sourceHashes(root, environment),
  commands: [],
};
const receipt = join(directory, "consumer-browser-receipt.json");
const persist = () =>
  writeFileSync(receipt, JSON.stringify(status, null, 2) + "\n", {
    mode: 0o600,
  });
persist();
process.stdout.write(
  JSON.stringify({ receipt, browserLedger, aa7Ledger, evidence }) + "\n",
);
const extraConfig = join(
  dirname(fileURLToPath(import.meta.url)),
  "scanned.config.ts",
);
const coreConfig = join(
  dirname(fileURLToPath(import.meta.url)),
  "core.config.ts",
);
status.selection = "scanned-consumer-production-ocr-observation";
status.compilerRuntimeExcluded = coreOnly;
for (const config of [extraConfig]) {
  const log = join(directory, `browser-${status.commands.length + 1}.log`);
  const fd = openSync(log, "wx", 0o600);
  const entry = { config, log, startedAt: new Date().toISOString() };
  status.commands.push(entry);
  persist();
  const result = await runCommand(
    process.execPath,
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      config,
    ],
    {
      cwd: root,
      env: environment,
      logFd: fd,
      onStart(value) {
        Object.assign(entry, value);
        persist();
      },
      onClose(value) {
        Object.assign(entry, value);
        persist();
      },
    },
  );
  fsyncSync(fd);
  closeSync(fd);
  Object.assign(entry, result, {
    finishedAt: new Date().toISOString(),
    logSha256: createHash("sha256").update(readFileSync(log)).digest("hex"),
  });
  persist();
  if (
    result.code !== 0 ||
    result.signal ||
    result.abortRequested ||
    !result.groupCleanupConfirmed
  ) {
    status.state = "failed";
    process.exitCode = 1;
    break;
  }
}
status.finishedAt = new Date().toISOString();
status.sourceHashesAfter = sourceHashes(root, environment);
if (
  JSON.stringify(status.sourceHashes) !==
  JSON.stringify(status.sourceHashesAfter)
) {
  status.state = "failed";
  status.sourceChangedDuringRun = true;
  process.exitCode = 1;
}
if (status.state === "running") status.state = "passed";
persist();
process.stdout.write(
  JSON.stringify({ state: status.state, receipt, cleanupRequired: true }) +
    "\n",
);
