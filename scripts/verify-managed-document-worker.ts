import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient, serializeCookieHeader } from "@supabase/ssr";
import { z } from "zod";
import { getServerConfig } from "../app/lib/server/config";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { processQueuedAnalysis } from "../app/lib/server/analysis-worker";
import { runWorkerCycle } from "../app/lib/server/worker-runner";
import { AnalysisJobQueue } from "../app/lib/server/jobs";
import { assertWorkerSchemaReady } from "../app/lib/server/worker-readiness";
import {
  runPrivacyWorkerCycle,
  SupabasePrivacyRequestRepository,
} from "../app/lib/server/privacy-worker";
import { loadEvidenceReview } from "../app/lib/server/evidence-review";
import { createResumeStorageKey } from "../app/lib/server/storage";
import { syntheticPdf, CONTACT_PDF_STREAM } from "../tests/fixtures/native-pdf";
import {
  appendPrivateTestLedger,
  requireManagedTestTarget,
  requirePrivateTestLedger,
} from "./managed-test-target";
import {
  verifyDocumentReviewEvidence,
  verifyDocumentReviewResponses,
} from "./verify-managed-document-review";
import { submitManagedDocumentDeletion } from "./verify-managed-document-deletion";

const purpose = "cr-a01-document-worker";
const sharedProject = "wreqkdavofpfblsupnls.supabase.co";
const packet =
  "310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76";
const admissionSchema = z.strictObject({
  targetUrl: z.url(),
  runId: z.uuid(),
  orderedDigest: z.literal(packet),
  authorizedScope: z.literal("exclusive-project-worker-and-privacy-fixtures"),
  postReplay: z.strictObject({
    schemaVersion: z.literal("document-worker-post-replay/1"),
    status: z.literal("ready"),
    workerFencingReady: z.literal(true),
    pageCountReady: z.literal(true),
    cleanupReady: z.literal(true),
    fixtureQueuesEmpty: z.literal(true),
    externalIsolationProved: z.literal(false),
  }),
});

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieHeader(cookies: ReadonlyMap<string, string>) {
  return Array.from(
    cookies,
    ([name, value]) => serializeCookieHeader(name, value, {}).split(";")[0],
  ).join("; ");
}

function admit() {
  const environment = process.env;
  const target = requireManagedTestTarget(
    {
      targetUrl: environment.SUPABASE_URL ?? "",
      purpose,
      runId: environment.MANAGED_TEST_RUN_ID ?? "",
      ledgerPath: environment.MANAGED_TEST_LEDGER ?? "",
      capability: "owned-fixtures",
    },
    environment,
  );
  check(new URL(target.targetUrl).hostname !== sharedProject, "SHARED_TARGET");
  // The operator supplies this receipt only after independently verifying and
  // admitting the target. Local receipt fields cannot establish exclusivity.
  const path = join(dirname(target.ledgerPath), "worker-admission.json");
  requirePrivateTestLedger(path);
  check(statSync(path).size <= 8_192, "RECEIPT_TOO_LARGE");
  check(statSync(target.ledgerPath).size === 0, "FIXTURE_RUN_ALREADY_STARTED");
  const receipt = admissionSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  check(
    receipt.targetUrl === target.targetUrl && receipt.runId === target.runId,
    "TARGET_MISMATCH",
  );
  const config = getServerConfig();
  const origin = new URL(config.APP_ORIGIN);
  check(
    origin.origin === config.APP_ORIGIN &&
      origin.protocol === "http:" &&
      origin.hostname === "127.0.0.1" &&
      origin.port,
    "LOOPBACK_REQUIRED",
  );
  check(
    config.SUPABASE_URL === target.targetUrl &&
      config.SUPABASE_RESUME_BUCKET === "resumes" &&
      config.ANALYSIS_FENCING_ENABLED &&
      config.ANALYSIS_ADMISSION_BINDING_ENABLED &&
      config.EVIDENCE_REVIEW_ENABLED &&
      config.NATIVE_EVIDENCE_ENABLED &&
      !config.AI_ENABLED &&
      !config.AI_BUDGET_ENABLED &&
      !config.INITIAL_FEEDBACK_ENABLED &&
      !config.LEGACY_SCORING_INPUT_ENABLED &&
      !config.BUILD_AI_ASSIST_ENABLED &&
      !config.LATEX_CONVERTER_ENABLED,
    "CONFIGURATION_MISMATCH",
  );
  return { target, config, origin };
}

async function main() {
  let stage = "admission";
  let app: ReturnType<typeof spawn> | undefined;
  let appExited: Promise<number | null> | undefined;
  let receipt: Record<string, string | number | boolean> | undefined;
  let restoreFetch: (() => void) | undefined;
  try {
    const { target, config, origin } = admit();
    const globalFetch = globalThis.fetch;
    const allowedOrigins = new Set([
      new URL(target.targetUrl).origin,
      origin.origin,
    ]);
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      check(allowedOrigins.has(url.origin), "EGRESS_REFUSED");
      const limit = AbortSignal.timeout(10_000);
      const inputSignal =
        init?.signal ?? (input instanceof Request ? input.signal : null);
      return globalFetch(input, {
        ...init,
        redirect: "error",
        signal: inputSignal ? AbortSignal.any([inputSignal, limit]) : limit,
      });
    };
    restoreFetch = () => {
      globalThis.fetch = globalFetch;
    };
    const ledger = (event: string, identity: Record<string, string> = {}) =>
      appendPrivateTestLedger(
        target.ledgerPath,
        JSON.stringify({ runId: target.runId, event, ...identity }) + "\n",
      );

    stage = "readiness";
    const admin = createSupabaseAdminClient();
    await assertWorkerSchemaReady(admin, {
      analysisFencingEnabled: true,
      evidenceReviewEnabled: true,
    });
    for (const [table, key] of [
      ["analyses", "id"],
      ["analysis_jobs", "analysis_id"],
      ["data_requests", "id"],
    ]) {
      const rows = await admin.from(table).select(key).limit(1);
      check(!rows.error && rows.data.length === 0, "TARGET_QUEUE_NOT_EMPTY");
    }
    const health = new URL("/healthz", origin);
    const occupied = await fetch(health).then(
      () => true,
      () => false,
    );
    check(!occupied, "LOOPBACK_OCCUPIED");
    app = spawn(
      process.execPath,
      [
        "--import",
        "./scripts/managed-document-server-lifetime.mjs",
        "--experimental-strip-types",
        "scripts/server.mjs",
      ],
      {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          ...process.env,
          HOST: origin.hostname,
          PORT: origin.port,
          SHUTDOWN_TIMEOUT_MS: "10000",
        },
      },
    );
    const ownedApp = app;
    appExited = new Promise((done) => {
      ownedApp.once("exit", done);
      ownedApp.once("error", () => done(null));
    });
    let spawnFailed = false;
    app.once("error", () => {
      spawnFailed = true;
    });
    let listening = false;
    for (let i = 0; i < 40 && !listening; i++) {
      check(!spawnFailed && app.exitCode === null, "LOCAL_SERVER_EXITED");
      listening = await fetch(health, {
        signal: AbortSignal.timeout(400),
      }).then(
        (r) => r.ok,
        () => false,
      );
      if (!listening) await delay(250);
    }
    check(listening, "LOCAL_SERVER_UNAVAILABLE");

    async function createFixture(label: "owner" | "outsider") {
      const ownerId = randomUUID();
      const email = `${label}-${ownerId}@example.test`;
      const password = randomUUID() + randomUUID();
      ledger("auth_creation_requested", { ownerId, label });
      const created = await admin.auth.admin.createUser({
        id: ownerId,
        email,
        password,
        email_confirm: true,
      });
      check(
        !created.error && created.data.user?.id === ownerId,
        "AUTH_CREATE_FAILED",
      );
      const cookies = new Map<string, string>();
      const user = createServerClient(
        target.targetUrl,
        config.SUPABASE_PUBLISHABLE_KEY,
        {
          cookies: {
            getAll: () =>
              Array.from(cookies, ([name, value]) => ({ name, value })),
            setAll: (values) => {
              for (const { name, value } of values) cookies.set(name, value);
            },
          },
        },
      );
      const signedIn = await user.auth.signInWithPassword({ email, password });
      check(
        !signedIn.error && signedIn.data.user.id === ownerId,
        "AUTH_SIGN_IN_FAILED",
      );
      return { ownerId, user, cookies };
    }

    stage = "synthetic-auth";
    const owner = await createFixture("owner");
    const outsider = await createFixture("outsider");
    stage = "http-upload";
    const pdf = syntheticPdf([CONTACT_PDF_STREAM, ""]);
    const uploadKey = randomUUID();
    ledger("upload_requested", { ownerId: owner.ownerId, uploadKey });
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
      "synthetic-two-page.pdf",
    );
    form.set("jobTitle", "Synthetic reviewer");
    form.set(
      "jobDescription",
      "This synthetic role exists only to verify the imported two-page PDF.",
    );
    form.set("aiConsent", "accepted");
    form.set("idempotencyKey", uploadKey);
    const upload = await fetch(new URL("/api/analyze", origin), {
      method: "POST",
      body: form,
      headers: {
        Origin: origin.origin,
        "X-Request-Id": uploadKey,
        Cookie: cookieHeader(owner.cookies),
      },
    });
    check(upload.status === 202, "UPLOAD_FAILED");
    const { id: analysisId } = z
      .object({ id: z.uuid(), status: z.literal("quarantined") })
      .parse(await upload.json());
    const analysis = await admin
      .from("analyses")
      .select("resume_version_id,organization_id")
      .eq("id", analysisId)
      .eq("owner_id", owner.ownerId)
      .single();
    check(!analysis.error && analysis.data, "ANALYSIS_MISSING");
    const version = await admin
      .from("resume_versions")
      .select("id,resume_id,checksum,storage_key")
      .eq("id", analysis.data.resume_version_id)
      .eq("owner_id", owner.ownerId)
      .single();
    check(
      !version.error &&
        version.data &&
        version.data.checksum ===
          createHash("sha256").update(pdf).digest("hex"),
      "SOURCE_MISMATCH",
    );
    const organizationId = z.uuid().parse(analysis.data.organization_id);
    const storageKey = createResumeStorageKey({
      organizationId,
      resumeId: z.uuid().parse(version.data.resume_id),
      versionId: z.uuid().parse(version.data.id),
    });
    check(version.data.storage_key === storageKey, "STORAGE_PATH_MISMATCH");
    ledger("upload_accepted", {
      ownerId: owner.ownerId,
      analysisId,
      storageKey,
    });
    const bucket = admin.storage.from(config.SUPABASE_RESUME_BUCKET);
    const object = await bucket.info(storageKey);
    check(
      !object.error && z.uuid().safeParse(object.data.id).success,
      "OBJECT_UNAVAILABLE",
    );

    stage = "worker-recovery";
    const abandonedWorker = `abandoned-${target.runId}`;
    const claim = await admin.rpc("claim_analysis_job_v2", {
      p_worker_id: abandonedWorker,
      p_lease_seconds: 3,
    });
    check(!claim.error, "INITIAL_CLAIM_FAILED");
    const abandoned = z
      .object({
        analysisId: z.literal(analysisId),
        attempt: z.literal(1),
        leaseFence: z.uuid(),
        leaseExpiresAt: z.iso.datetime({ offset: true }),
      })
      .parse(claim.data);
    const waitMs =
      Math.max(0, Date.parse(abandoned.leaseExpiresAt) - Date.now()) + 500;
    check(waitMs <= 5_000, "LEASE_CLOCK_MISMATCH");
    await delay(waitMs);
    const stale = await admin.rpc("assert_analysis_stage_lease", {
      p_analysis_id: analysisId,
      p_worker_id: abandonedWorker,
      p_attempt: 1,
      p_lease_fence: abandoned.leaseFence,
    });
    check(!stale.error && stale.data === false, "STALE_LEASE_NOT_FENCED");
    const ran = await runWorkerCycle(
      new AnalysisJobQueue(),
      async (id, attempt, signal, lease) => {
        check(
          id === analysisId &&
            attempt === 2 &&
            lease &&
            lease.leaseFence !== abandoned.leaseFence,
          "RECOVERY_SCOPE_MISMATCH",
        );
        await processQueuedAnalysis(id, attempt, signal, lease);
      },
      { signal: AbortSignal.timeout(60_000) },
    );
    check(ran, "WORKER_DID_NOT_RUN");

    stage = "read-evidence";
    const state = await admin
      .from("analyses")
      .select("status")
      .eq("id", analysisId)
      .eq("owner_id", owner.ownerId)
      .single();
    check(
      !state.error && state.data.status === "needs_ocr",
      "REVIEW_HANDOFF_MISMATCH",
    );
    const measuredSource = await admin
      .from("resume_versions")
      .select("page_count")
      .eq("id", version.data.id)
      .eq("owner_id", owner.ownerId)
      .single();
    check(!measuredSource.error, "SOURCE_PAGE_COUNT_UNAVAILABLE");
    const saved = await loadEvidenceReview(
      owner.user,
      analysisId,
      owner.ownerId,
    );
    verifyDocumentReviewEvidence(saved, measuredSource.data.page_count);
    const evidencePage = new URL(`/analysis/${analysisId}/evidence`, origin);
    const [ownerPage, outsiderPage] = await Promise.all([
      fetch(evidencePage, { headers: { Cookie: cookieHeader(owner.cookies) } }),
      fetch(evidencePage, {
        headers: { Cookie: cookieHeader(outsider.cookies) },
      }),
    ]);
    await verifyDocumentReviewResponses(ownerPage, outsiderPage);
    const hidden = await outsider.user
      .from("document_evidence_attempts")
      .select("id")
      .eq("analysis_id", analysisId);
    check(
      !hidden.error && hidden.data.length === 0,
      "FOREIGN_EVIDENCE_VISIBLE",
    );
    for (const table of [
      "analysis_jobs",
      "analysis_ai_runs",
      "analysis_deterministic_results",
      "analysis_results",
    ]) {
      const rows = await admin
        .from(table)
        .select("analysis_id")
        .eq("analysis_id", analysisId)
        .limit(1);
      check(!rows.error && rows.data.length === 0, "UNEXPECTED_WORKER_OUTPUT");
    }

    stage = "http-deletion";
    const requestKey = randomUUID();
    ledger("deletion_intent", { ownerId: owner.ownerId, requestKey });
    const deletionId = await submitManagedDocumentDeletion(
      admin,
      origin,
      cookieHeader(owner.cookies),
      { ownerId: owner.ownerId, organizationId, requestKey },
    );
    ledger("deletion_requested", {
      ownerId: owner.ownerId,
      requestKey,
      requestId: deletionId,
    });

    stage = "physical-cleanup";
    const repository = new (class extends SupabasePrivacyRequestRepository {
      override async claim(workerId: string) {
        const request = await super.claim(workerId);
        check(
          request?.id === deletionId && request.userId === owner.ownerId,
          "PRIVACY_SCOPE_MISMATCH",
        );
        return request;
      }
    })();
    check(await runPrivacyWorkerCycle(repository), "CLEANUP_DID_NOT_RUN");
    const [request, deletedObject] = await Promise.all([
      admin
        .from("data_requests")
        .select("status,result_manifest")
        .eq("id", deletionId)
        .eq("user_id", owner.ownerId)
        .single(),
      bucket.info(storageKey),
    ]);
    check(
      !request.error &&
        request.data.status === "completed" &&
        request.data.result_manifest?.deleted === true,
      "DELETION_INCOMPLETE",
    );
    check(
      !deletedObject.data &&
        deletedObject.error &&
        "status" in deletedObject.error &&
        deletedObject.error.status === 404 &&
        "code" in deletedObject.error &&
        deletedObject.error.code === "NoSuchKey",
      "STORAGE_ABSENCE_UNVERIFIED",
    );
    for (const table of [
      "analyses",
      "resume_versions",
      "resumes",
      "document_evidence_attempts",
    ]) {
      const rows = await admin
        .from(table)
        .select("id")
        .eq("owner_id", owner.ownerId)
        .limit(1);
      check(!rows.error && rows.data.length === 0, "CANDIDATE_ROWS_REMAIN");
    }
    ledger("application_and_storage_cleanup_verified", {
      ownerId: owner.ownerId,
      requestId: deletionId,
    });
    // Remove only the two exact synthetic Auth accounts. The durable write
    // barrier and rate metadata are subject to separate retention checks.
    for (const fixture of [owner, outsider]) {
      const signOut = await fixture.user.auth.signOut();
      check(!signOut.error, "AUTH_SIGN_OUT_FAILED");
      const deleted = await admin.auth.admin.deleteUser(fixture.ownerId);
      check(!deleted.error, "AUTH_DELETE_FAILED");
      const absent = await admin.auth.admin.getUserById(fixture.ownerId);
      check(
        !absent.data.user && (!absent.error || absent.error.status === 404),
        "AUTH_ABSENCE_UNVERIFIED",
      );
      ledger("auth_cleanup_verified", { ownerId: fixture.ownerId });
    }
    receipt = {
      status: "managed_document_worker_journey_passed",
      packet,
      pages: 2,
      recoveredAttempt: 2,
      reviewRouteVerified: true,
      deletionRouteVerified: true,
      exactStorageAbsence: true,
      syntheticAuthAbsence: true,
      retentionMetadata: "separate_verification_required",
    };
  } catch {
    process.stderr.write(
      `CR-A01 refused or failed at ${stage}. Existing fixture ledger remains available.\n`,
    );
    process.exitCode = 1;
  } finally {
    if (app && appExited) {
      const connected = app.connected;
      if (connected) app.disconnect();
      const code = await Promise.race([
        appExited,
        delay(13_000, undefined, { ref: false }),
      ]);
      if (
        code === undefined &&
        app.exitCode === null &&
        app.signalCode === null
      ) {
        app.kill("SIGKILL");
        await Promise.race([
          appExited,
          delay(1_000, undefined, { ref: false }),
        ]);
      }
      if (!connected || code !== 0) {
        process.stderr.write(
          "CR-A01 could not verify clean exit of its local app.\n",
        );
        process.exitCode = 1;
      }
    }
    restoreFetch?.();
  }
  if (receipt && process.exitCode !== 1)
    process.stdout.write(JSON.stringify(receipt) + "\n");
}

await main();
