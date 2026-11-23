import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  fixtureBundleKey,
  readFixtureBundle,
  writeFixtureBundle,
} from "./managed-fixture-bundle.ts";
import {
  readPrivateTestLedger,
  requireManagedApiTarget,
} from "./managed-test-target.ts";

const prefix = Buffer.from("resumide-document-worker-ledger-v1\n");
const runIdSchema = z.uuid().regex(/^[a-f0-9-]+$/);
const identitySchema = z.object({ targetUrl: z.url(), runId: runIdSchema });
const archiveSchema = identitySchema
  .extend({
    admission: z.string().max(8192),
    ledger: z.string().max(128 * 1024),
  })
  .strict();

function fixturePaths(runId: string) {
  const directory = `/tmp/resumide-managed-${runId}`;
  return {
    directory,
    admission: join(directory, "worker-admission.json"),
    ledger: join(directory, "fixtures.jsonl"),
  };
}

function privateDirectory(path: string) {
  const directory = lstatSync(path, { throwIfNoEntry: false });
  if (
    directory &&
    (!directory.isDirectory() ||
      (directory.mode & 0o7777) !== 0o700 ||
      directory.uid !== process.getuid?.())
  )
    throw new Error("Document worker fixture directory is invalid");
  return directory !== undefined;
}

function verifyIdentity(archive: z.infer<typeof archiveSchema>) {
  const receipt = identitySchema.parse(JSON.parse(archive.admission));
  if (
    receipt.runId !== archive.runId ||
    receipt.targetUrl !== archive.targetUrl
  )
    throw new Error("Document worker fixture identity differs");
}

export function sealDocumentWorkerArchive(
  file: string,
  environment: NodeJS.ProcessEnv,
) {
  const key = fixtureBundleKey(environment.MANAGED_WORKER_LEDGER_KEY);
  const targetUrl = environment.SUPABASE_URL ?? "";
  requireManagedApiTarget(targetUrl);
  const runId = runIdSchema.parse(environment.MANAGED_WORKER_RUN_ID);
  const paths = fixturePaths(runId);
  if (
    !privateDirectory(paths.directory) ||
    (!lstatSync(paths.admission, { throwIfNoEntry: false }) &&
      !lstatSync(paths.ledger, { throwIfNoEntry: false }))
  )
    return false;

  const archive = archiveSchema.parse({
    targetUrl,
    runId,
    admission: readPrivateTestLedger(paths.admission),
    ledger: readPrivateTestLedger(paths.ledger),
  });
  verifyIdentity(archive);
  writeFixtureBundle(file, prefix, archive, key);
  return true;
}

export function recoverDocumentWorkerArchive(
  file: string,
  environment: NodeJS.ProcessEnv,
) {
  const targetUrl = environment.SUPABASE_URL ?? "";
  requireManagedApiTarget(targetUrl);
  const archive = archiveSchema.parse(
    readFixtureBundle(
      file,
      prefix,
      fixtureBundleKey(environment.MANAGED_WORKER_LEDGER_KEY),
    ),
  );
  if (archive.targetUrl !== targetUrl)
    throw new Error("Document worker archive belongs to a different target");
  verifyIdentity(archive);
  const paths = fixturePaths(archive.runId);
  if (!privateDirectory(paths.directory))
    mkdirSync(paths.directory, { mode: 0o700 });
  const files = [
    [paths.admission, archive.admission],
    [paths.ledger, archive.ledger],
  ];
  const missing = files.filter(([path, value]) => {
    if (!lstatSync(path, { throwIfNoEntry: false })) return true;
    if (readPrivateTestLedger(path) !== value)
      throw new Error("Document worker recovery would overwrite a fixture");
    return false;
  });
  for (const [path, value] of missing)
    writeFileSync(path, value, { mode: 0o600, flag: "wx" });
  return archive.runId;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const [, , mode, file, ...extra] = process.argv;
  try {
    if (mode === "--check-key" && file === undefined) {
      fixtureBundleKey(process.env.MANAGED_WORKER_LEDGER_KEY);
    } else if (file && !extra.length && mode === "--seal") {
      const sealed = sealDocumentWorkerArchive(file, process.env);
      process.stdout.write(
        sealed ? "Recovery archive sealed\n" : "No fixture files to archive\n",
      );
    } else if (file && !extra.length && mode === "--recover") {
      process.stdout.write(
        recoverDocumentWorkerArchive(file, process.env) + "\n",
      );
    } else {
      throw new Error("Invalid archive arguments");
    }
  } catch {
    process.stderr.write("Document worker archive operation refused\n");
    process.exitCode = 1;
  }
}
