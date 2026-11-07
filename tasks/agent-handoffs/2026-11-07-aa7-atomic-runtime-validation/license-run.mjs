// Single exact-image metadata inventory; no target code, database or network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHashes } from "../../../scripts/verify-private-aa7.mjs";
process.umask(0o077);
assert.match(process.version, /^v22\./);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const image = "sha256:6f623e1c0210724e742e24dc4ec6fe2516b4116eb978c9abae22bb71b1db614a";
const docker = "/usr/local/bin/docker";
const env = { HOME: process.env.HOME, PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C.UTF-8" };
const prefix = join(root, "docs/evaluation/AA7_ATOMIC_NATIVE_LICENSES_20261107");
const name = `aa7-license-${randomUUID()}`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const audit = fs.readFileSync(join(root, "scripts/audit-latex-licenses.py"));
const extra = fs.readFileSync(fileURLToPath(new URL("license-extra.py", import.meta.url)));
const payload = Buffer.concat([audit, Buffer.from("\n"), extra]);
const before = sourceHashes(root, env);
const full = JSON.parse(fs.readFileSync(join(root, "docs/evaluation/AA7_ATOMIC_NATIVE_PRIVATE_CI_20261107.json")));
assert.deepEqual(before, full.sourceHashesAfter);
assert.equal(Object.keys(before).length, 578);
const runtimeBefore = Object.fromEntries(Object.keys(full.runtimeSourceHashes).map((path) => [path, digest(fs.readFileSync(join(root, path)))]));
assert.deepEqual(runtimeBefore, full.runtimeSourceHashes);
const record = { imageId: image, observedAt: new Date().toISOString(), auditScriptSha256: digest(audit),
  supplementalSourceSha256: digest(extra), payloadSha256: digest(payload), beforeSourceHashes: before,
  beforeRuntimeHashes: runtimeBefore, forwardedEnvironment: 0, hostMounts: 0, legalApproval: false };
const run = (args, options = {}) => spawnSync(docker, args, { env, encoding: "utf8", timeout: 5000, maxBuffer: 2097152, ...options });
const inspect = run(["image", "inspect", image]);
assert.equal(inspect.status, 0);
const metadata = JSON.parse(inspect.stdout)[0];
assert.equal(metadata.Id, image); assert.equal(metadata.Os, "linux"); assert.equal(metadata.Architecture, "arm64"); assert.equal(metadata.Config.User, "65532:65532");
record.image = { id: metadata.Id, os: metadata.Os, architecture: metadata.Architecture, user: metadata.Config.User };
const args = ["run", "-i", "--rm", "--pull=never", "--name", name, "--label", "resumide.latex.audit=licenses",
  "--network=none", "--ipc=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65532:65532",
  "--cpus=1", "--memory=128m", "--memory-swap=128m", "--pids-limit=32", "--ulimit", "nofile=64:64", "--ulimit", "cpu=10:10", "--ulimit", "fsize=0:0",
  "--entrypoint", "/usr/bin/python3", image, "-I", "-B", "-", "--image-id", image];
record.argv = [docker, ...args];
let result;
const started = performance.now();
try {
  result = run(args, { input: payload, timeout: 30000 });
  record.elapsedMs = Math.round(performance.now() - started);
  record.exitCode = result.status; record.signal = result.signal;
  record.errorCode = result.error?.code ?? null;
  fs.writeFileSync(`${prefix}_RAW.jsonl`, result.stdout ?? "", { flag: "wx", mode: 0o600 });
  fs.writeFileSync(`${prefix}_STDERR.log`, result.stderr ?? "", { flag: "wx", mode: 0o600 });
  record.stdoutSha256 = digest(result.stdout ?? ""); record.stderrSha256 = digest(result.stderr ?? "");
  record.stdoutBytes = Buffer.byteLength(result.stdout ?? ""); record.stderrBytes = Buffer.byteLength(result.stderr ?? "");
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.ok(record.stdoutBytes + record.stderrBytes <= 2097152);
  const lines = result.stdout.trim().split("\n"); assert.equal(lines.length, 2);
  const inventory = JSON.parse(lines[0]), native = JSON.parse(lines[1]);
  assert.equal(inventory.expectedImageId, image); assert.equal(inventory.packages.length, 216);
  assert.deepEqual(inventory.lockEntriesWithoutInstalledPackage, []);
  assert.deepEqual(inventory.pythonInventory.unresolved, []);
  const rawDirectory = `${prefix}_RAW_FILES`; fs.mkdirSync(rawDirectory, { mode: 0o700 });
  const rawFiles = [];
  for (const [path, row] of Object.entries(native.rawFiles)) {
    const bytes = Buffer.from(row.text, "utf8"); assert.equal(bytes.length, row.bytes); assert.equal(digest(bytes), row.sha256);
    assert.ok(path.startsWith("/opt/latex/native-") || path.startsWith("/usr/share/doc/") || path.startsWith("/opt/latex/pypdf-6.21.4.dist-info/"));
    assert.ok(!path.split("/").includes(".."));
    const output = join(rawDirectory, path.slice(1)); fs.mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, bytes, { flag: "wx", mode: 0o600 });
    rawFiles.push({ imagePath: path, savedPath: relative(root, output), bytes: row.bytes, sha256: row.sha256 });
  }
  record.rawFiles = rawFiles;
  fs.writeFileSync(`${prefix}_INVENTORY.json`, JSON.stringify(inventory, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  fs.writeFileSync(`${prefix}_NATIVE.json`, JSON.stringify(native, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  record.status = "metadata-collected";
} catch (error) {
  record.status = "failed"; record.failure = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  const removed = run(["rm", "-f", name]);
  record.cleanupRemovalExitCode = removed.status;
  const absent = run(["container", "inspect", name]);
  record.ownedContainerAbsent = absent.status !== 0 && /No such (object|container)/i.test(absent.stderr);
  record.afterSourceHashes = sourceHashes(root, env);
  record.afterRuntimeHashes = Object.fromEntries(Object.keys(runtimeBefore).map((path) => [path, digest(fs.readFileSync(join(root, path)))]));
  record.sourceStable = JSON.stringify(record.beforeSourceHashes) === JSON.stringify(record.afterSourceHashes);
  record.runtimeStable = JSON.stringify(runtimeBefore) === JSON.stringify(record.afterRuntimeHashes);
  if (!record.ownedContainerAbsent || !record.sourceStable || !record.runtimeStable) { record.status = "failed"; process.exitCode = 1; }
  fs.writeFileSync(`${prefix}_RECEIPT.json`, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: record.status, exitCode: record.exitCode, signal: record.signal, outputBytes: record.stdoutBytes,
    rawFiles: record.rawFiles?.length ?? 0, ownedContainerAbsent: record.ownedContainerAbsent, sourceStable: record.sourceStable, runtimeStable: record.runtimeStable }));
}
