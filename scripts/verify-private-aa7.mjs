// Test-only orchestration. Never imported by the application or compiler.
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { parseEnv } from "node:util";
import { isUtf8 } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import { setTimeout, clearTimeout } from "node:timers";

export function sourceHashes(root, env = process.env) {
  const names = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ).split("\0");
  const hashes = {};
  for (const name of [...new Set(names)].sort()) {
    if (
      /(^|\/)(\.env[^/]*|\.npmrc|\.netrc|\.pypirc|private|\.private|secrets|\.secrets|credentials|(?:secrets?|credentials|private)\.json)(\/|$)/i.test(
        name,
      ) ||
      !(
        /^(app|tests|scripts|e2e|types|public|supabase|benchmarks|assets|\.github\/workflows)\//.test(
          name,
        ) ||
        /^[^/]+\.(json|jsonc|js|mjs|cjs|ts|mts|cts|toml|ya?ml)$/.test(name) ||
        /^(Dockerfile(\.[a-z0-9_-]+)?|\.dockerignore|\.gitignore|\.prettierignore)$/.test(
          name,
        ) ||
        name === "docs/operations/ALERTS.json"
      ) ||
      !(
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css|scss|html|sql|py|c|h|sh|toml|ya?ml|cnf|lock)$/.test(
          name,
        ) ||
        /(^|\/)(Dockerfile(\.[a-z0-9_-]+)?|\.dockerignore|\.gitignore|\.prettierignore)$/.test(
          name,
        )
      )
    )
      continue;
    const path = join(root, name);
    let file;
    try {
      file = lstatSync(path);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!file.isFile()) throw Error("Source input is not a regular file");
    const bytes = readFileSync(path);
    if (bytes.includes(0) || !isUtf8(bytes)) continue;
    hashes[name] = createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}

export async function runCommand(command, args, options) {
  if (process.platform === "win32")
    throw Error("Private verification requires POSIX process groups");
  const grace = options.terminationGraceMs ?? 5000;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", options.logFd, options.logFd],
    shell: false,
    detached: true,
  });
  const groupAlive = () => {
    if (!child.pid) return false;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  };
  const identity = () => {
    if (!child.pid) return "";
    try {
      return execFileSync(
        "ps",
        ["-o", "pid=,pgid=,lstart=", "-p", String(child.pid)],
        {
          env: options.env,
          encoding: "utf8",
          timeout: 1000,
        },
      ).trim();
    } catch {
      return "";
    }
  };
  const originalIdentity = identity();
  options.onStart?.({
    processGroup: child.pid ?? null,
    startIdentity: originalIdentity,
  });
  let abortRequested = null;
  let manualGroupCleanupRequired = false;
  let killTimer;
  const signalOwnedGroup = (signal) => {
    if (!groupAlive()) return;
    // A vanished/reused leader requires independent owned-resource cleanup.
    if (!originalIdentity || identity() !== originalIdentity) {
      manualGroupCleanupRequired = true;
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") manualGroupCleanupRequired = true;
    }
  };
  function stop(signal) {
    if (abortRequested) return;
    abortRequested = signal;
    signalOwnedGroup("SIGTERM");
    killTimer = setTimeout(() => signalOwnedGroup("SIGKILL"), grace);
  }
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  let startFailed = false;
  const result = await new Promise((done) => {
    child.once("error", () => {
      startFailed = true;
    });
    child.once("close", (code, signal) => done({ code, signal }));
  });
  let receiptError;
  try {
    options.onClose?.(result);
  } catch (error) {
    receiptError = error;
  }
  try {
    if (abortRequested) {
      const deadline = Date.now() + grace + 1000;
      while (groupAlive() && Date.now() < deadline) await delay(25);
    }
  } finally {
    clearTimeout(killTimer);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
  if (receiptError) throw receiptError;
  return {
    ...result,
    startFailed,
    abortRequested,
    processGroup: child.pid ?? null,
    manualGroupCleanupRequired,
    groupCleanupConfirmed: !manualGroupCleanupRequired && !groupAlive(),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.umask(0o077);
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (
    process.env.RESUMIDE_PRIVATE_VERIFY !== undefined &&
    process.env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic"
  )
    throw Error("Invalid private verification mode");
  const image = process.argv[2];
  if (image === "--help") {
    process.stdout.write(
      "Usage: node scripts/verify-private-aa7.mjs sha256:<immutable-worker-id>\nRuns full verify:ci plus AA7 source/self-test and all-severity audits.\nRetains private logs/fixture ledger for independent exact cleanup.\n",
    );
  } else if (
    process.versions.node.split(".")[0] !== "22" ||
    process.argv.length !== 3 ||
    !/^sha256:[a-f0-9]{64}$/.test(image ?? "")
  ) {
    process.stderr.write(
      "Node22 and one immutable worker image are required.\n",
    );
    process.exitCode = 1;
  } else {
    // ponytail: read only approved Supabase values; no general dotenv loading.
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
      throw Error("Configured managed Supabase test target is unavailable");
    supabase.SUPABASE_RESUME_BUCKET ||= "resumes";
    const id = randomUUID();
    const directory = `/tmp/resumide-aa7-private-${id}`;
    const ledger = `/tmp/resumide-auth-audit-aa7-completion-${id}.jsonl`;
    const aa7Ledger = `/tmp/resumide-aa7-completion-${id}.jsonl`;
    const evidence = `docs/evaluation/aa7-completion-${id}`;
    mkdirSync(directory, { mode: 0o700 });
    mkdirSync(join(directory, "playwright"), { mode: 0o700 });
    mkdirSync(join(root, evidence), { mode: 0o700 });
    closeSync(openSync(ledger, "wx", 0o600));
    closeSync(openSync(aa7Ledger, "wx", 0o600));
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
      BROWSER_TEST_LEDGER: ledger,
      AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
      AA7_TEST_SUPABASE_URL: supabase.SUPABASE_URL,
      AA7_AUTH_RECEIPT_FILE: aa7Ledger,
      BROWSER_EVIDENCE_DIR: evidence,
      BROWSER_PRIVATE_OUTPUT_DIR: join(directory, "playwright"),
    };
    const digest = (path) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    const status = {
      baseHead: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        env: environment,
        encoding: "utf8",
      }).trim(),
      image,
      node: process.versions.node,
      startedAt: new Date().toISOString(),
      state: "running",
      cleanupRequired: true,
      directory,
      fixtureLedger: ledger,
      aa7FixtureLedger: aa7Ledger,
      evidenceDirectory: evidence,
      sourceHashes: sourceHashes(root, environment),
      commands: [],
    };
    const receipt = join(directory, "terminal.json");
    function persist() {
      const fd = openSync(receipt, "w", 0o600);
      try {
        writeFileSync(fd, JSON.stringify(status, null, 2) + "\n");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    persist();
    process.stdout.write(
      JSON.stringify({
        receipt,
        fixtureLedger: ledger,
        aa7FixtureLedger: aa7Ledger,
      }) + "\n",
    );
    const commands = [
      ["npm", ["run", "verify:ci"]],
      ["npm", ["run", "test:e2e:build-ai"]],
      ["npm", ["run", "check:private:aa7:source"]],
      ["npm", ["run", "check:latex:source"]],
      ["npm", ["run", "check:build-ai:source"]],
      ["python3", ["scripts/latex-runtime/build-closure.py", "--self-test"]],
      ["npm", ["audit", "--json"]],
      ["npm", ["audit", "--omit=dev", "--json"]],
      ["npm", ["ls", "minimatch", "--all", "--json"]],
    ];
    for (const [command, args] of commands) {
      const log = join(directory, `command-${status.commands.length + 1}.log`);
      const fd = openSync(log, "wx", 0o600);
      const entry = { command, args, log, startedAt: new Date().toISOString() };
      status.commands.push(entry);
      persist();
      const result = await runCommand(command, args, {
        cwd: root,
        env: environment,
        logFd: fd,
        onStart(state) {
          Object.assign(entry, state);
          persist();
        },
        onClose(result) {
          Object.assign(entry, result, { closedAt: new Date().toISOString() });
          persist();
        },
      });
      fsyncSync(fd);
      closeSync(fd);
      Object.assign(entry, result, {
        finishedAt: new Date().toISOString(),
        logSha256: digest(log),
      });
      persist();
      if (command === "npm" && args[0] === "audit" && result.code === 0) {
        try {
          const audit = JSON.parse(readFileSync(log, "utf8"));
          entry.knownVulnerabilities = audit.metadata?.vulnerabilities?.total;
          if (entry.knownVulnerabilities !== 0) entry.policyFailed = true;
        } catch {
          entry.policyFailed = true;
          entry.auditOutputInvalid = true;
        }
      }
      persist();
      if (
        result.code !== 0 ||
        result.signal ||
        result.abortRequested ||
        !result.groupCleanupConfirmed ||
        entry.policyFailed
      ) {
        status.state = "failed";
        process.exitCode = result.code > 0 ? result.code : 1;
        break;
      }
    }
    status.finishedAt = new Date().toISOString();
    status.sourceHashesAfter = sourceHashes(root, environment);
    if (
      JSON.stringify(status.sourceHashes) !==
      JSON.stringify(status.sourceHashesAfter)
    ) {
      status.sourceChangedDuringRun = true;
      status.state = "failed";
      process.exitCode = 1;
    }
    if (status.state === "running") status.state = "passed";
    persist();
    process.stdout.write(
      JSON.stringify({ state: status.state, receipt, cleanupRequired: true }) +
        "\n",
    );
  }
}
