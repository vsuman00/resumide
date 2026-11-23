// Exact completed-run evidence preservation and owned-file cleanup only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { sourceHashes } from "../../../scripts/verify-private-aa7.mjs";

process.umask(0o077);
assert.match(process.version, /^v22\./);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const privateDirectory = "/tmp/resumide-aa7-private-2bfd289a-a847-47cf-a00a-83da6e6d9e85";
const originalTerminal = join(privateDirectory, "terminal.json");
const originalBytes = fs.readFileSync(originalTerminal);
const status = JSON.parse(originalBytes);
const image = "sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16";
const env = { PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME };
const digest = (data) => createHash("sha256").update(data).digest("hex");
const hashFile = (path) => digest(fs.readFileSync(path));
const receiptPrefix = join(root, "docs/evaluation/AA7_FREETYPE_FINAL_PRIVATE_CI_20261107");
const receiptPath = `${receiptPrefix}.json`;
assert.equal(status.directory, privateDirectory);
assert.equal(status.state, "passed");
assert.equal(status.image, image);
assert.equal(status.commands.length, 9);
assert.equal(Object.keys(status.sourceHashes).length, 588);
assert.deepEqual(status.sourceHashesAfter, status.sourceHashes);
assert.deepEqual(sourceHashes(root, env), status.sourceHashesAfter);
assert.ok(status.commands.every((row) => row.code === 0 && row.signal === null && row.groupCleanupConfirmed));
const fixtureProofPath = join(root, "docs/evaluation/AA7_FREETYPE_FINAL_FIXTURE_CLEANUP_20261107.json");
const fixtureProof = JSON.parse(fs.readFileSync(fixtureProofPath));
assert.equal(fixtureProof.allOwnedRowsRemaining, 0);
assert.equal(fixtureProof.recordedStorageObjectsRemaining, 0);
assert.equal(fixtureProof.ownedRateRowsAfter, 0);
assert.equal(fixtureProof.protectedGlobalsUnchanged, true);
assert.equal(fixtureProof.globalRowsDeletedOrReset, 0);
const groups = status.commands.map((entry) => {
  let absent = false;
  try { process.kill(-entry.processGroup, 0); }
  catch (error) { assert.equal(error.code, "ESRCH"); absent = true; }
  assert.equal(absent, true);
  return { processGroup: entry.processGroup, absent };
});
let port3110Listening;
try {
  port3110Listening = !!execFileSync("/usr/sbin/lsof", ["-nP", "-iTCP:3110", "-sTCP:LISTEN", "-t"], { env, timeout: 5000, encoding: "utf8" }).trim();
} catch (error) { assert.equal(error.status, 1); assert.equal(error.stdout.length, 0); port3110Listening = false; }
assert.equal(port3110Listening, false);
assert.equal(execFileSync("/usr/local/bin/docker", ["ps", "-a", "-q", "--filter", "label=resumide.latex.service=converter"], { env, encoding: "utf8", timeout: 5000, maxBuffer: 4096 }).trim(), "");
const render = JSON.parse(fs.readFileSync(join(root, "docs/evaluation/AA7_FREETYPE_FINAL_RENDER_20261107.json")));
const runtimeHashes = Object.fromEntries(Object.keys(render.after.runtime).map((name) => [name, hashFile(join(root, name))]));
assert.equal(Object.keys(runtimeHashes).length, 61);
assert.deepEqual(runtimeHashes, render.after.runtime);
const configured = parseEnv(fs.readFileSync(join(root, ".env"), "utf8"));
const credentials = Object.entries(configured).filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD/.test(name) && value.length >= 12).map(([, value]) => value);
const commandBytes = status.commands.map((entry, index) => {
  assert.equal(entry.log, join(privateDirectory, `command-${index + 1}.log`));
  const stat = fs.lstatSync(entry.log);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16777216);
  const bytes = fs.readFileSync(entry.log);
  assert.equal(digest(bytes), entry.logSha256);
  assert.ok(credentials.every((credential) => !bytes.includes(credential)));
  assert.ok(!/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./.test(bytes.toString("utf8")));
  return bytes;
});
const text = commandBytes[0].toString("utf8").replace(/\x1b\[[0-9;]*m/g, "");
const testFiles = Number(/Test Files\s+(\d+) passed/.exec(text)?.[1]);
const tests = Number(/\n\s*Tests\s+(\d+) passed/.exec(text)?.[1]);
const generalBrowserCases = (text.match(/✓\s+\d+ \[chromium\]/g) ?? []).length;
const aiBrowserCases = (commandBytes[1].toString("utf8").match(/✓\s+\d+ \[chromium\]/g) ?? []).length;
assert.equal(testFiles, 149); assert.equal(tests, 1242);
assert.equal(generalBrowserCases, 65); assert.equal(aiBrowserCases, 6);
const allAudit = JSON.parse(commandBytes[6]);
const productionAudit = JSON.parse(commandBytes[7]);
assert.equal(allAudit.metadata.vulnerabilities.total, 0);
assert.equal(productionAudit.metadata.vulnerabilities.total, 0);
const inventory = (directory, destination = []) => {
  const base = fs.lstatSync(directory); assert.ok(base.isDirectory() && !base.isSymbolicLink());
  for (const name of fs.readdirSync(directory).sort()) {
    const path = join(directory, name), stat = fs.lstatSync(path);
    assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) inventory(path, destination);
    else { assert.ok(stat.isFile()); destination.push({ path, bytes: stat.size, sha256: hashFile(path), device: stat.dev, inode: stat.ino }); }
  }
  return destination;
};
const evidenceDirectory = join(root, status.evidenceDirectory);
assert.equal(dirname(evidenceDirectory), join(root, "docs/evaluation"));
assert.match(status.evidenceDirectory, /^docs\/evaluation\/aa7-completion-[a-f0-9-]{36}$/);
const artifacts = inventory(evidenceDirectory);
assert.ok(artifacts.length > 0 && artifacts.length < 128);
const privateFiles = inventory(privateDirectory);
const ledgerFiles = [status.fixtureLedger, status.aa7FixtureLedger].map((path, index) => {
  const stat = fs.lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600);
  assert.equal(hashFile(path), fixtureProof.ledgerHashes[index]);
  return { path, bytes: stat.size, sha256: hashFile(path), device: stat.dev, inode: stat.ino };
});
assert.equal(status.fixtureLedger, "/tmp/resumide-auth-audit-aa7-completion-2bfd289a-a847-47cf-a00a-83da6e6d9e85.jsonl");
assert.equal(status.aa7FixtureLedger, "/tmp/resumide-aa7-completion-2bfd289a-a847-47cf-a00a-83da6e6d9e85.jsonl");
const commands = status.commands.map((entry, index) => {
  const path = `${receiptPrefix}_COMMAND${index + 1}.log`;
  fs.writeFileSync(path, commandBytes[index], { flag: "wx", mode: 0o600 });
  return { ...entry, log: relative(root, path), logSha256: hashFile(path) };
});
const result = {
  recordedAt: new Date().toISOString(), status: "PRIVATE_CI_PASSED_CLEANUP_PENDING_FILE_REMOVAL",
  baseHead: status.baseHead, image, node: status.node, startedAt: status.startedAt, finishedAt: status.finishedAt,
  outerCliExit: 0, outerCliSignal: null,
  sourceHashes: status.sourceHashes, sourceHashesAfter: status.sourceHashesAfter,
  sourceInputCount: 588, sourceStable: true, runtimeSourceHashes: runtimeHashes, runtimeSourceInputCount: 61, runtimeSourceStable: true,
  commands, results: { unitFiles: testFiles, unitTests: tests, generalBrowserCases, controlledAiBrowserCases: aiBrowserCases,
    allDependencyAudit: allAudit.metadata.vulnerabilities, productionDependencyAudit: productionAudit.metadata.vulnerabilities },
  cleanup: { ...fixtureProof.counts, independentAuthPublicOwnerPredicates: fixtureProof.ownerPredicates.length,
    allOwnedRowsRemaining: 0, recordedStorageObjectsRemaining: 0, validatedOwnedRateKeys: fixtureProof.counts.rateKeys,
    ownedRateRowsRemoved: fixtureProof.ownedRateRowsRemoved, ownedRateRowsRemaining: 0, protectedGlobalsUnchanged: true, globalRateRowsDeletedOrReset: 0,
    commandGroups: groups, port3110Listening, converterContainersRemaining: 0, ledgerHashes: fixtureProof.ledgerHashes, privateFilesRemoved: false },
  credentialMatchesInCommandLogs: 0, originalTerminalReceiptSha256: digest(originalBytes), fixtureCleanupReceiptSha256: hashFile(fixtureProofPath),
  evidenceDirectory: status.evidenceDirectory, artifacts: artifacts.map(({ path, ...rest }) => ({ path: relative(root, path), ...rest })),
  exactPrivateFileInventory: [...privateFiles, ...ledgerFiles].map(({ path, ...rest }) => ({ path, ...rest })),
  finalizerSha256: hashFile(fileURLToPath(import.meta.url)),
  limitations: "Completed private synthetic engineering verification; historical Poppler70/71/56 under original FreeType retained; no co-installed upstream-suite rerun or production release acceptance claimed",
};
fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
for (const entry of [...privateFiles, ...ledgerFiles]) {
  const stat = fs.lstatSync(entry.path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.dev === entry.device && stat.ino === entry.inode);
  assert.equal(hashFile(entry.path), entry.sha256);
  fs.unlinkSync(entry.path);
}
const removeEmpty = (directory) => {
  for (const name of fs.readdirSync(directory)) { const path = join(directory, name); assert.ok(fs.lstatSync(path).isDirectory()); removeEmpty(path); }
  fs.rmdirSync(directory);
};
removeEmpty(privateDirectory);
assert.ok(!fs.existsSync(privateDirectory) && ledgerFiles.every((entry) => !fs.existsSync(entry.path)));
result.status = "PRIVATE_CI_PASSED_EXACT_CLEANUP_COMPLETE";
result.cleanup.privateFilesRemoved = true;
result.cleanup.privateFilesRemovedCount = privateFiles.length + ledgerFiles.length;
result.cleanup.ownedPrivateDirectoryAbsent = true;
result.recordedAt = new Date().toISOString();
fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, commands: 9, unitFiles: testFiles, unitTests: tests,
  generalBrowserCases, controlledAiBrowserCases: aiBrowserCases, artifacts: artifacts.length,
  ownerCount: fixtureProof.counts.owners, ownedRowsRemaining: 0, ownedRateRowsRemoved: fixtureProof.ownedRateRowsRemoved,
  privateFilesRemoved: true, sourceStable: true, runtimeSourceStable: true, receiptPath }));
