// Test orchestration only; excluded from application imports and build context.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCommand, sourceHashes } from "../../../scripts/verify-private-aa7.mjs";

process.umask(0o077);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const image = "sha256:6f623e1c0210724e742e24dc4ec6fe2516b4116eb978c9abae22bb71b1db614a";
const baseline = "sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac";
const npm = "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js";
const env = {
  PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: process.env.HOME,
  LANG: "C.UTF-8",
  RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
  AI_ENABLED: "false",
  npm_config_update_notifier: "false",
};
assert.match(process.version, /^v22\./);
const steps = [
  ["RUNTIME", "verify:latex", [image]],
  ["BENCHMARK", "benchmark:latex", [image]],
  ["ROLLBACK", "verify:latex:rollback", [image]],
  ["RENDER", "verify:latex:render", [baseline, image]],
];
const index = Number(process.argv[2]);
assert.ok(Number.isInteger(index) && index >= 0 && index < steps.length);
const [label, alias, arguments_] = steps[index];
const prefix = `${root}docs/evaluation/AA7_ATOMIC_NATIVE_${label}_20261107`;
const receiptPath = `${prefix}.json`;
const logPath = `${prefix}.log`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const snapshot = () => {
  const source = sourceHashes(root, env);
  assert.equal(Object.keys(source).length, 578);
  const helper = readFileSync(`${root}scripts/latex-test-fixtures.ts`, "utf8");
  const start = helper.indexOf("export async function latexSourceHashes()");
  assert.ok(start >= 0);
  const list = helper.slice(start, helper.indexOf("];", start));
  const names = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, 48);
  const runtime = Object.fromEntries(names.map((name) => [name, digest(readFileSync(`${root}${name}`))]));
  return { source, runtime };
};
const ownedContainerCount = () => {
  const output = execFileSync("/usr/local/bin/docker", ["ps", "-a", "-q", "--filter", "label=resumide.latex.service=converter"],
    { env, encoding: "utf8", timeout: 5000, maxBuffer: 4096 }).trim();
  return output ? output.split("\n").length : 0;
};
const receiptFd = openSync(receiptPath, "wx", 0o600);
closeSync(receiptFd);
const receipt = {
  tier: "actual immutable worker verification; no browser/database/provider",
  imageId: image,
  baselineImage: label === "RENDER" ? baseline : null,
  observedAt: new Date().toISOString(),
  nodeVersion: process.version,
  command: [process.execPath, npm, "run", alias, "--", ...arguments_],
  environmentNames: Object.keys(env).sort(),
  orchestratorSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  status: "preflight",
};
const persist = () => writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
persist();
let fd;
try {
  receipt.before = snapshot();
  receipt.ownedContainersBefore = ownedContainerCount();
  assert.equal(receipt.ownedContainersBefore, 0);
  assert.equal(execFileSync("/usr/local/bin/docker", ["image", "inspect", image, "--format", "{{.Id}}"],
    { env, encoding: "utf8", timeout: 5000, maxBuffer: 4096 }).trim(), image);
  fd = openSync(logPath, "wx", 0o600);
  receipt.status = "running";
  receipt.startedAt = new Date().toISOString();
  persist();
  const started = performance.now();
  receipt.terminal = await runCommand(process.execPath, [npm, "run", alias, "--", ...arguments_], {
    cwd: root, env, logFd: fd,
    onStart: (identity) => { receipt.commandProcess = identity; persist(); console.log(JSON.stringify({ label, ...identity, receiptPath })); },
    onClose: (actual) => { receipt.actualCommandClose = actual; persist(); },
  });
  receipt.durationMs = Math.round(performance.now() - started);
  receipt.after = snapshot();
  receipt.sourceStable = JSON.stringify(receipt.before.source) === JSON.stringify(receipt.after.source);
  receipt.runtimeStable = JSON.stringify(receipt.before.runtime) === JSON.stringify(receipt.after.runtime);
  receipt.ownedContainersAfter = ownedContainerCount();
  const bytes = readFileSync(logPath);
  receipt.logSha256 = digest(bytes);
  receipt.logBytes = bytes.length;
  assert.equal(receipt.terminal.code, 0);
  assert.equal(receipt.terminal.signal, null);
  assert.equal(receipt.terminal.groupCleanupConfirmed, true);
  assert.equal(receipt.sourceStable, true);
  assert.equal(receipt.runtimeStable, true);
  assert.equal(receipt.ownedContainersAfter, 0);
  const output = bytes.toString("utf8");
  const marker = label === "RENDER" ? '{\n  "baselineImage":' : '{\n  "imageId":';
  assert.ok(output.indexOf(marker) >= 0);
  receipt.result = JSON.parse(output.slice(output.indexOf(marker)));
  if (label === "RUNTIME") {
    assert.equal(receipt.result.checksExecuted, 27);
    assert.equal(receipt.result.checks.find((check) => check.name === "actual-pdf-parser-active-content-and-bounds").cases, 20);
    assert.equal(receipt.result.checks.find((check) => check.name === "native-frame-provenance-and-frozen-consumer").consumerSuite.cases, 107);
  } else if (label === "BENCHMARK") assert.equal(receipt.result.results.length, 6);
  receipt.status = "passed";
  persist();
  console.log(JSON.stringify({ label, status: receipt.status, terminal: receipt.terminal, sourceCount: 578, runtimeCount: 48, receiptPath }));
} catch (error) {
  receipt.status = "failed";
  receipt.failure = { name: error.name, message: error.message };
  try { receipt.after = snapshot(); receipt.sourceStable = JSON.stringify(receipt.before?.source) === JSON.stringify(receipt.after.source); receipt.runtimeStable = JSON.stringify(receipt.before?.runtime) === JSON.stringify(receipt.after.runtime); } catch { receipt.snapshotAfterFailed = true; }
  try { receipt.ownedContainersAfter = ownedContainerCount(); } catch { receipt.containerAbsenceUnconfirmed = true; }
  if (fd !== undefined) { const bytes = readFileSync(logPath); receipt.logSha256 = digest(bytes); receipt.logBytes = bytes.length; }
  persist();
  console.log(JSON.stringify({ label, status: receipt.status, terminal: receipt.terminal ?? receipt.actualCommandClose, failure: receipt.failure, receiptPath }));
  process.exitCode = 1;
} finally {
  if (fd !== undefined) closeSync(fd);
}
