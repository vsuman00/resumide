import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { afterEach, expect, it } from "vitest";
import {
  recoverDocumentWorkerArchive,
  sealDocumentWorkerArchive,
} from "../../scripts/manage-document-worker-archive";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { force: true, recursive: true });
});

function fixture() {
  const runId = randomUUID();
  const targetUrl = "https://archive-fixture.supabase.co";
  const environment = {
    MANAGED_WORKER_RUN_ID: runId,
    SUPABASE_URL: targetUrl,
    MANAGED_WORKER_LEDGER_KEY: randomBytes(32).toString("base64"),
  };
  const ownerId = randomUUID();
  const directory = `/tmp/resumide-managed-${runId}`;
  const output = `/tmp/resumide-worker-archive-test-${runId}`;
  const file = output + "/worker.enc";
  const ledgerPath = directory + "/fixtures.jsonl";
  const admissionPath = directory + "/worker-admission.json";
  const ledger =
    JSON.stringify({ event: "auth_creation_requested", ownerId, runId }) + "\n";
  const admission = JSON.stringify({ targetUrl, runId });
  directories.push(directory, output);
  mkdirSync(output, { mode: 0o700 });
  return {
    runId,
    ownerId,
    targetUrl,
    environment,
    directory,
    file,
    ledgerPath,
    admissionPath,
    ledger,
    admission,
    create() {
      mkdirSync(directory, { mode: 0o700 });
      writeFileSync(ledgerPath, ledger, { mode: 0o600 });
      writeFileSync(admissionPath, admission, { mode: 0o600 });
    },
  };
}

it("seals the exact interrupted run and recovers it without overwriting", () => {
  const f = fixture();
  f.create();
  expect(sealDocumentWorkerArchive(f.file, f.environment)).toBe(true);
  const encrypted = readFileSync(f.file);
  expect(encrypted.includes(f.ownerId)).toBe(false);
  expect(encrypted.includes(f.targetUrl)).toBe(false);
  expect(encrypted.includes(f.runId)).toBe(false);
  expect(statSync(f.file).mode & 0o777).toBe(0o600);
  expect(() => sealDocumentWorkerArchive(f.file, f.environment)).toThrow();

  rmSync(f.directory, { recursive: true });
  expect(recoverDocumentWorkerArchive(f.file, f.environment)).toBe(f.runId);
  expect(statSync(f.directory).mode & 0o777).toBe(0o700);
  expect(statSync(f.ledgerPath).mode & 0o777).toBe(0o600);
  expect(statSync(f.admissionPath).mode & 0o777).toBe(0o600);
  expect(readFileSync(f.ledgerPath, "utf8")).toBe(f.ledger);
  expect(readFileSync(f.admissionPath, "utf8")).toBe(f.admission);
  expect(recoverDocumentWorkerArchive(f.file, f.environment)).toBe(f.runId);
  rmSync(f.admissionPath);
  writeFileSync(f.ledgerPath, "new evidence\n");
  expect(() => recoverDocumentWorkerArchive(f.file, f.environment)).toThrow();
  expect(readFileSync(f.ledgerPath, "utf8")).toBe("new evidence\n");
  expect(existsSync(f.admissionPath)).toBe(false);
});

it("refuses the wrong target, wrong key, tampering and symlinks before restoring", () => {
  const f = fixture();
  f.create();
  sealDocumentWorkerArchive(f.file, f.environment);
  rmSync(f.directory, { recursive: true });
  expect(() =>
    recoverDocumentWorkerArchive(f.file, {
      ...f.environment,
      SUPABASE_URL: "https://other-worker.supabase.co",
    }),
  ).toThrow();
  expect(() =>
    recoverDocumentWorkerArchive(f.file, {
      ...f.environment,
      MANAGED_WORKER_LEDGER_KEY: randomBytes(32).toString("base64"),
    }),
  ).toThrow();
  const damaged = readFileSync(f.file);
  damaged[damaged.length - 1] ^= 1;
  writeFileSync(f.file, damaged);
  expect(() => recoverDocumentWorkerArchive(f.file, f.environment)).toThrow();
  const link = f.file + ".link";
  symlinkSync(f.file, link);
  expect(() => recoverDocumentWorkerArchive(link, f.environment)).toThrow();
  expect(existsSync(f.directory)).toBe(false);
});

it("skips a run with no private files and refuses a partial or mismatched pair", () => {
  const f = fixture();
  expect(sealDocumentWorkerArchive(f.file, f.environment)).toBe(false);
  f.create();
  expect(() =>
    sealDocumentWorkerArchive(f.file, {
      ...f.environment,
      MANAGED_WORKER_LEDGER_KEY: "bad-key",
    }),
  ).toThrow();
  chmodSync(f.directory, 0o755);
  expect(() => sealDocumentWorkerArchive(f.file, f.environment)).toThrow();
  chmodSync(f.directory, 0o700);
  writeFileSync(
    f.admissionPath,
    JSON.stringify({ targetUrl: f.targetUrl, runId: randomUUID() }),
  );
  expect(() => sealDocumentWorkerArchive(f.file, f.environment)).toThrow();
  rmSync(f.admissionPath);
  expect(() => sealDocumentWorkerArchive(f.file, f.environment)).toThrow();
  expect(existsSync(f.file)).toBe(false);
});
