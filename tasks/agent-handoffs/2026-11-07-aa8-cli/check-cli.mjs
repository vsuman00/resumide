import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const output = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
assert.equal(process.versions.node.split(".")[0], "22");
const sourcePaths = [
  "scripts/verify-evaluation-corpus.ts",
  "app/lib/server/evaluation-corpus.ts",
  "tests/fixtures/evaluation-corpus.ts",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (name) => [name, hash(await readFile(join(root, name)))])));
const before = await hashes();
const { EVALUATION_CORPUS_DEMO: demo } = await import(pathToFileURL(join(root, "tests/fixtures/evaluation-corpus.ts")).href);
const temp = await mkdtemp(join(tmpdir(), "resumide-aa8-corpus-cli-"));
const identity = await lstat(temp);
const ownedNames = new Set();
const marker = "AA8_SYNTHETIC_METADATA_OUTPUT_CANARY";
const env = {
  PATH: `${dirname(node)}:/usr/bin:/bin`,
  HOME: temp,
  TMPDIR: temp,
  LANG: "C.UTF-8",
  RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
};
const receipt = {
  status: "RUNNING",
  node: process.versions.node,
  sourceHashesBefore: before,
  environmentNames: Object.keys(env).sort(),
  cases: [],
  noDatabaseDockerProviderOrCorpusDocumentOperations: true,
};
const save = () => writeFile(join(output, "actual-cli-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
async function fixture(name, value) {
  const path = join(temp, name);
  await writeFile(path, value, { flag: "wx", mode: 0o600 });
  ownedNames.add(name);
  return path;
}
const assessArgs = (path, groups = demo.actor.groups, asOf = demo.asOf) => [
  "--manifest", path, "--as-of", asOf, ...groups.flatMap((group) => ["--group", group]),
];
async function check(name, args, expectedExit, expected) {
  const child = spawnSync(node, [join(root, "node_modules/vite-node/vite-node.mjs"), "--config", "vitest.config.ts", "scripts/verify-evaluation-corpus.ts", ...args], {
    cwd: root, env, encoding: "utf8", timeout: 15000, maxBuffer: 65536,
  });
  const row = {
    name, exitCode: child.status, signal: child.signal,
    processErrorCode: child.error?.code ?? null,
    stdout: child.stdout ?? "", stderr: child.stderr ?? "",
  };
  receipt.cases.push(row);
  await save();
  assert.equal(row.processErrorCode, null, `${name}: subprocess failed`);
  assert.equal(child.status, expectedExit, `${name}: exit`);
  assert.equal(child.signal, null, `${name}: signal`);
  for (const forbidden of [temp, marker, "aa7-owned-synthetic", "ZodError"]) {
    assert.equal((row.stdout + row.stderr).includes(forbidden), false, `${name}: private diagnostic echoed`);
  }
  const data = JSON.parse(row.stdout);
  assert.equal(data.representativeReady, false);
  assert.equal(data.releaseReady, false);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(data[key], value, `${name}: ${key}`);
  row.passed = true;
  await save();
  process.stdout.write(`${name}: PASS\n`);
  return row.stdout;
}

try {
  const valid = await fixture("valid.json", JSON.stringify(demo.manifest));
  const partial = structuredClone(demo.manifest);
  partial.records[1].sourceKind = "candidate_upload";
  const unauthorized = await fixture("partial.json", JSON.stringify(partial));
  const unknown = structuredClone(demo.manifest);
  unknown.records[0].unapprovedField = marker;
  const privateMetadata = await fixture("unknown-field.json", JSON.stringify(unknown));
  const malformed = await fixture("malformed.json", `{"schemaVersion":1,"${marker}":`);
  const utf8 = await fixture("invalid-utf8.json", Buffer.concat([Buffer.from('{"schemaVersion":1,"records":[],"extra":"'), Buffer.from([0xff]), Buffer.from('"}') ]));
  const oversized = await fixture("oversized.json", Buffer.alloc(1_048_577, 0x20));
  const link = join(temp, "symlink.json");
  await symlink(valid, link);
  ownedNames.add("symlink.json");
  const success = { status: "assessed", totalRecords: 3, admittedCount: 3, excludedCount: 0, reasonCounts: {} };
  const first = await check("deterministic-demo-first", [], 0, success);
  const second = await check("deterministic-demo-second", [], 0, success);
  assert.equal(first, second, "demo output changed without input changes");
  await check("explicit-manifest-membership", assessArgs(valid), 0, success);
  await check("missing-operator-membership", assessArgs(valid, []), 1, { status: "rejected", reasonCounts: { INVALID_ARGUMENTS: 1 } });
  await check("wrong-operator-membership", assessArgs(valid, ["different-synthetic-group"]), 1, { admittedCount: 0, excludedCount: 3, reasonCounts: { ACCESS_DENIED: 3 } });
  await check("partial-unauthorized-source", assessArgs(unauthorized), 1, { totalRecords: 3, admittedCount: 2, excludedCount: 1, reasonCounts: { UNAUTHORIZED_SOURCE: 1 } });
  await check("unknown-private-metadata", assessArgs(privateMetadata), 1, { admittedCount: 2, excludedCount: 1, reasonCounts: { INVALID_RECORD: 1 } });
  await check("malformed-json", assessArgs(malformed), 1, { status: "rejected", reasonCounts: { MANIFEST_INVALID_JSON: 1 } });
  await check("invalid-utf8", assessArgs(utf8), 1, { status: "rejected", reasonCounts: { MANIFEST_INVALID_JSON: 1 } });
  await check("oversized-manifest", assessArgs(oversized), 1, { status: "rejected", reasonCounts: { MANIFEST_TOO_LARGE: 1 } });
  await check("symlink-refused", assessArgs(link), 1, { status: "rejected", reasonCounts: { MANIFEST_UNREADABLE: 1 } });
  await check("invalid-explicit-clock", assessArgs(valid, demo.actor.groups, marker), 1, { status: "rejected", reasonCounts: { INVALID_AS_OF: 1 } });
  await check("unknown-argument-safe", ["--unapproved", marker], 1, { status: "rejected", reasonCounts: { INVALID_ARGUMENTS: 1 } });
  await check("missing-file-safe", assessArgs(join(temp, "missing.json")), 1, { status: "rejected", reasonCounts: { MANIFEST_UNREADABLE: 1 } });
  receipt.status = "PASS_14_ACTUAL_CLI_SUBPROCESSES";
} catch (error) {
  receipt.status = "FAILED_STOPPED_NO_RETRY_OR_SOURCE_CHANGE";
  receipt.failure = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  receipt.sourceHashesAfter = await hashes();
  receipt.sourcesUnchanged = JSON.stringify(before) === JSON.stringify(receipt.sourceHashesAfter);
  const current = await lstat(temp);
  assert.equal(current.ino, identity.ino);
  assert.equal(current.dev, identity.dev);
  assert.equal(current.uid, identity.uid);
  assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
  assert.deepEqual((await readdir(temp)).sort(), [...ownedNames].sort());
  for (const name of ownedNames) {
    const path = join(temp, name);
    const info = await lstat(path);
    if (name === "symlink.json") assert.equal(await readlink(path), join(temp, "valid.json"));
    else assert.equal(info.isFile() && !info.isSymbolicLink(), true);
    await unlink(path);
  }
  await rmdir(temp);
  receipt.temporaryMetadataFilesRemoved = ownedNames.size;
  receipt.temporaryMetadataDirectoryAbsent = await lstat(temp).then(() => false, (error) => error.code === "ENOENT");
  assert.equal(receipt.sourcesUnchanged && receipt.temporaryMetadataDirectoryAbsent, true);
  await save();
  process.stdout.write(JSON.stringify({ status: receipt.status, cases: receipt.cases.length, sourcesUnchanged: receipt.sourcesUnchanged, cleanup: receipt.temporaryMetadataDirectoryAbsent }) + "\n");
}
