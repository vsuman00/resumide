import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readPrivateTestLedger } from "./managed-test-target.ts";
import {
  managedDbConnection,
  runManagedPsql,
  type ManagedPsql,
} from "./verify-managed-db.ts";

const profile = {
  schemaVersion: "managed-db-document-worker-approval/1",
  purpose: "cr-a01-document-worker",
  orderedDigest:
    "310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76",
};
const authorizedScope = "exclusive-project-worker-and-privacy-fixtures";
const readySchema = z.strictObject({
  schemaVersion: z.literal("document-worker-post-replay/1"),
  status: z.literal("ready"),
  workerFencingReady: z.literal(true),
  pageCountReady: z.literal(true),
  cleanupReady: z.literal(true),
  fixtureQueuesEmpty: z.literal(true),
  externalIsolationProved: z.literal(false),
});
const lifecycleSchema = z.strictObject({
  status: z.literal("managed_document_worker_journey_passed"),
  packet: z.literal(profile.orderedDigest),
  pages: z.literal(2),
  recoveredAttempt: z.literal(2),
  reviewRouteVerified: z.literal(true),
  deletionRouteVerified: z.literal(true),
  exactStorageAbsence: z.literal(true),
  syntheticAuthAbsence: z.literal(true),
  retentionMetadata: z.literal("separate_verification_required"),
});
const cleanupSchema = z.strictObject({
  schemaVersion: z.literal("document-worker-post-cleanup/1"),
  status: z.literal("verified"),
  exactFixtureRowsAbsent: z.literal(true),
  accountingWriteBarrierRetained: z.literal(true),
  analysisRateBucketRetained: z.literal(true),
});
const id = z.uuid().regex(/^[a-f0-9-]+$/);
const uuidPattern = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
const sourceKey = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${uuidPattern}/resumes/${uuidPattern}/versions/${uuidPattern}\\.pdf$`,
    ),
  );
const sqlFiles = {
  ready: [
    "verify-managed-document-worker-ready.sql",
    "e5f3657e4ae2dd23f4ab585044c611278c5a322560186c21f127ea994be43eb4",
  ],
  cleanup: [
    "verify-managed-document-worker-cleanup.sql",
    "261f722faa33625e7540d9094d73fd888118e6920a557d493dac0ce1be6d3197",
  ],
} as const;
const marker = "resumide-document-worker-sql-complete";

function sqlSource(step: keyof typeof sqlFiles) {
  const [name, expected] = sqlFiles[step];
  const file = readFileSync(new URL(name, import.meta.url));
  if (createHash("sha256").update(file).digest("hex") !== expected)
    throw new Error("Document worker SQL changed");
  return file.toString("utf8");
}

function verifiedSqlResult<T>(
  input: string,
  connection: NodeJS.ProcessEnv,
  run: ManagedPsql,
  schema: z.ZodType<T>,
) {
  const result = run(input + "\n\\echo " + marker + "\n", connection);
  const lines = result.stdout.trim().split(/\r?\n/);
  if (result.status !== 0 || lines.length !== 2 || lines[1] !== marker)
    throw new Error("Incomplete document worker SQL receipt");
  return schema.parse(JSON.parse(lines[0]));
}

function cleanupBindings(ledger: string, runId: string) {
  const event = <Name extends string>(name: Name) =>
    z.strictObject({
      event: z.literal(name),
      runId: z.literal(runId),
      ownerId: id,
    });
  const authCreate = event("auth_creation_requested");
  const authCleanup = event("auth_cleanup_verified");
  const schema = z.tuple([
    authCreate.extend({ label: z.literal("owner") }),
    authCreate.extend({ label: z.literal("outsider") }),
    event("upload_requested").extend({ uploadKey: id }),
    event("upload_accepted").extend({ analysisId: id, storageKey: sourceKey }),
    event("deletion_intent").extend({ requestKey: id }),
    event("deletion_requested").extend({ requestId: id, requestKey: id }),
    event("application_and_storage_cleanup_verified").extend({ requestId: id }),
    authCleanup,
    authCleanup,
  ]);
  const lines = readPrivateTestLedger(ledger).split("\n");
  if (lines.pop() !== "") throw new Error("Incomplete document worker ledger");
  const [
    owner,
    outsider,
    upload,
    accepted,
    intent,
    request,
    cleanup,
    ownerDone,
    outsiderDone,
  ] = schema.parse(lines.map((line) => JSON.parse(line)));
  if (
    owner.ownerId === outsider.ownerId ||
    [upload, accepted, intent, request, cleanup, ownerDone].some(
      (entry) => entry.ownerId !== owner.ownerId,
    ) ||
    outsiderDone.ownerId !== outsider.ownerId ||
    request.requestKey !== intent.requestKey ||
    cleanup.requestId !== request.requestId
  )
    throw new Error("Document worker fixture lineage differs");
  // Every value is already restricted to lowercase UUIDs or the exact key shape.
  return (
    [
      `\\set fixture_owner_id ${owner.ownerId}`,
      `\\set fixture_outsider_id ${outsider.ownerId}`,
      `\\set fixture_analysis_id ${accepted.analysisId}`,
      `\\set fixture_request_id ${request.requestId}`,
      `\\set fixture_storage_key ${accepted.storageKey}`,
    ].join("\n") + "\n"
  );
}

function runWorker(environment: NodeJS.ProcessEnv) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      "scripts/verify-managed-document-worker.ts",
    ],
    {
      env: environment,
      encoding: "utf8",
      timeout: 240_000,
      killSignal: "SIGKILL",
      maxBuffer: 128 * 1024,
    },
  );
  return { status: result.status, stdout: result.stdout ?? "" };
}

export function runManagedDocumentWorkerVerification(
  environment: NodeJS.ProcessEnv,
  operations = { runSql: runManagedPsql, runWorker },
) {
  let stage = "admission";
  let runId: string | undefined;
  try {
    const url = z.url().parse(environment.SUPABASE_URL);
    const origin = z
      .string()
      .regex(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/)
      .parse(environment.APP_ORIGIN);
    if (
      environment.MANAGED_WORKER_AUTHORIZATION !== authorizedScope ||
      !environment.SUPABASE_PUBLISHABLE_KEY ||
      !environment.SUPABASE_SECRET_KEY ||
      new URL(origin).origin !== origin
    )
      throw new Error("Worker scope is unavailable");
    const run = id.parse(environment.MANAGED_WORKER_RUN_ID);
    const connection = managedDbConnection(environment, profile);
    const readySql = sqlSource("ready");
    const cleanupSql = sqlSource("cleanup");
    const directory = `/tmp/resumide-managed-${run}`;
    mkdirSync(directory, { mode: 0o700 });
    runId = run;
    stage = "readiness";
    const postReplay = verifiedSqlResult(
      readySql,
      connection,
      operations.runSql,
      readySchema,
    );
    const ledgerPath = join(directory, "fixtures.jsonl");
    writeFileSync(ledgerPath, "", { flag: "wx", mode: 0o600 });
    writeFileSync(
      join(directory, "worker-admission.json"),
      JSON.stringify({
        targetUrl: url,
        runId,
        orderedDigest: profile.orderedDigest,
        authorizedScope,
        postReplay,
      }),
      { flag: "wx", mode: 0o600 },
    );

    stage = "lifecycle";
    const outcome = operations.runWorker({
      PATH: environment.PATH,
      HOME: environment.HOME,
      TMPDIR: environment.TMPDIR,
      SUPABASE_URL: url,
      SUPABASE_SECRET_KEY: environment.SUPABASE_SECRET_KEY,
      SUPABASE_PUBLISHABLE_KEY: environment.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_RESUME_BUCKET: "resumes",
      APP_ORIGIN: origin,
      RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
      MANAGED_TEST_TARGET_URL: url,
      MANAGED_TEST_RUN_ID: runId,
      MANAGED_TEST_LEDGER: ledgerPath,
      MANAGED_TEST_PURPOSE: profile.purpose,
      MANAGED_TEST_CAPABILITY: "owned-fixtures",
      MANAGED_TEST_AUTHORIZATION: "synthetic-owned-records-only",
      ANALYSIS_FENCING_ENABLED: "true",
      ANALYSIS_ADMISSION_BINDING_ENABLED: "true",
      EVIDENCE_REVIEW_ENABLED: "true",
      NATIVE_EVIDENCE_ENABLED: "true",
      AI_ENABLED: "false",
      OPENAI_API_KEY: "build-ai-harness-no-live-key",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    });
    if (outcome.status !== 0)
      throw new Error("Document worker lifecycle failed");
    lifecycleSchema.parse(JSON.parse(outcome.stdout));

    stage = "cleanup";
    verifiedSqlResult(
      cleanupBindings(ledgerPath, runId) + cleanupSql,
      connection,
      operations.runSql,
      cleanupSchema,
    );
    return { status: "verified", stage: "complete", runId };
  } catch {
    return {
      status: stage === "admission" ? "unavailable" : "failed",
      stage,
      runId,
    };
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result =
    process.argv.length === 2
      ? runManagedDocumentWorkerVerification(process.env)
      : { status: "unavailable", stage: "arguments" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
}
