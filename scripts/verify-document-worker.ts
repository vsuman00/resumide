import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

// No .env loading, flags, hosted service or provider calls. The caller must
// explicitly supply the running local stack and opt into evidence review.
assert.equal(process.argv.length, 2, "This local checker accepts no options.");
assert.equal(
  process.env.EVIDENCE_REVIEW_ENABLED,
  "true",
  "Explicit EVIDENCE_REVIEW_ENABLED=true is required.",
);
const localUrl = new URL(process.env.SUPABASE_URL ?? "http://invalid.invalid");
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(localUrl.hostname) &&
    ["http:", "https:"].includes(localUrl.protocol) &&
    !localUrl.username &&
    !localUrl.password &&
    localUrl.pathname === "/" &&
    !localUrl.search &&
    !localUrl.hash,
  "Only a localhost Supabase stack is permitted.",
);
const originalFetch = globalThis.fetch;
let blockedEgress = 0;
globalThis.fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input));
  if (target.origin !== localUrl.origin) {
    blockedEgress++;
    throw new Error(
      "External network access is prohibited by this local checker.",
    );
  }
  // A redirect cannot escape the checked local origin inside native fetch.
  return originalFetch(input, { ...init, redirect: "error" });
};
// A configuration-only sentinel ensures the process cannot reuse a provider
// secret, even if a future regression reaches provider construction.
process.env.OPENAI_API_KEY = "local-document-worker-no-provider-access";
process.env.AI_ENABLED = "true";
const { createSupabaseAdminClient } =
  await import("../app/lib/server/supabase");
const { processExtractionStage } =
  await import("../app/lib/server/extraction-stage");
const { processQueuedAnalysis } =
  await import("../app/lib/server/analysis-worker");
const { DocumentEvidenceSchema } =
  await import("../app/lib/server/document-evidence");
const { extractPdfTextLayers } =
  await import("../app/lib/server/ocr/pdf-detection");
const { syntheticPdf } = await import("../tests/fixtures/native-pdf");
const { createOcrSyntheticFixture } =
  await import("../tests/fixtures/ocr-synthetic");
const admin = createSupabaseAdminClient();
const bucket = process.env.SUPABASE_RESUME_BUCKET ?? "resumes";
const storageKeys: string[] = [];
let userId: string | undefined;
const results: Array<{
  fixture: string;
  execution: string;
  sourceSha256: string;
  sourceBytes: number;
  pages: number;
  status: string;
  attempts: number;
  nativePreservation: string;
  retry: string;
  scoringEligible: false;
  scoreAndProviderRows: number;
}> = [];
function check(error: unknown, stage: string) {
  if (error) throw new Error(stage);
}
async function assertNoOutputs(analysisId: string) {
  for (const table of [
    "analysis_extractions",
    "analysis_deterministic_results",
    "analysis_ai_runs",
    "analysis_results",
    "writer_drafts",
  ]) {
    const result = await admin
      .from(table)
      .select("analysis_id")
      .eq("analysis_id", analysisId);
    check(result.error, "Synthetic score/provider absence query failed.");
    assert.equal(
      result.data?.length,
      0,
      "Evidence review must not persist legacy extraction, score, AI or writer outputs.",
    );
  }
}
try {
  const user = await admin.auth.admin.createUser({
    email: `aa014-worker-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    email_confirm: true,
  });
  check(user.error, "Synthetic user creation failed.");
  assert.ok(user.data.user);
  userId = user.data.user.id;
  const org = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .single();
  check(org.error, "Synthetic workspace lookup failed.");
  assert.ok(org.data);
  const organizationId = org.data.id;
  const fixtures = [
    {
      kind: "native",
      bytes: syntheticPdf(
        "BT /F1 12 Tf 50 750 Td (Demo Worker) Tj 0 -20 Td (worker@example.test) Tj 0 -20 Td (Phone: 0000000000) Tj 0 -20 Td (Employer: Fictional Worker Co) Tj ET",
      ),
    },
    { kind: "mixed", bytes: createOcrSyntheticFixture("mixed").bytes },
  ];
  for (const fixture of fixtures)
    for (const execution of ["extraction_stage", "queued_worker"] as const) {
      const resumeId = randomUUID(),
        sourceId = randomUUID(),
        analysisId = randomUUID();
      const sourceSha256 = createHash("sha256")
        .update(fixture.bytes)
        .digest("hex");
      const expectedNative = (
        await extractPdfTextLayers(fixture.bytes, {
          maxPages: 10,
          maxCharacters: 100_000,
        })
      ).pageTexts;
      if (fixture.kind === "mixed") {
        assert.equal(expectedNative[0], "");
        assert.equal(expectedNative[2], "");
        assert.ok(expectedNative[1].includes("SKILLS TYPESCRIPT SQL"));
      }
      const storageKey = `organizations/${organizationId}/resumes/${resumeId}/versions/${sourceId}.pdf`;
      storageKeys.push(storageKey);
      check(
        (
          await admin.storage.from(bucket).upload(storageKey, fixture.bytes, {
            contentType: "application/pdf",
            upsert: false,
          })
        ).error,
        "Synthetic storage upload failed.",
      );
      check(
        (
          await admin.from("resumes").insert({
            id: resumeId,
            organization_id: organizationId,
            owner_id: userId,
            display_name: "aa014-synthetic-worker.pdf",
          })
        ).error,
        "Synthetic resume creation failed.",
      );
      check(
        (
          await admin.from("resume_versions").insert({
            id: sourceId,
            resume_id: resumeId,
            organization_id: organizationId,
            owner_id: userId,
            storage_key: storageKey,
            checksum: sourceSha256,
            bytes: fixture.bytes.length,
            media_type: "application/pdf",
          })
        ).error,
        "Synthetic source version creation failed.",
      );
      check(
        (
          await admin.from("analyses").insert({
            id: analysisId,
            resume_version_id: sourceId,
            organization_id: organizationId,
            owner_id: userId,
            status: "quarantined",
            idempotency_key: randomUUID(),
          })
        ).error,
        "Synthetic queued analysis creation failed.",
      );
      if (execution === "extraction_stage")
        await processExtractionStage(analysisId);
      else
        await processQueuedAnalysis(
          analysisId,
          1,
          new AbortController().signal,
        );
      const state = await admin
        .from("analyses")
        .select("status")
        .eq("id", analysisId)
        .single();
      check(state.error, "Synthetic worker status query failed.");
      assert.equal(state.data?.status, "needs_ocr");
      const transitions = await admin
        .from("analysis_transitions")
        .select("from_status, to_status")
        .eq("analysis_id", analysisId);
      check(transitions.error, "Synthetic extraction transition query failed.");
      assert.ok(
        transitions.data?.some(
          (event) =>
            event.from_status === "quarantined" && event.to_status === "queued",
        ),
      );
      assert.ok(
        transitions.data?.some(
          (event) =>
            event.from_status === "queued" && event.to_status === "extracting",
        ),
      );
      const attempts: {
        data: Array<{
          id: string;
          envelope: unknown;
          input_sha256: string;
          attempt_number: number;
        }> | null;
        error: unknown;
      } = await admin
        .from("document_evidence_attempts")
        .select("id, envelope, input_sha256, attempt_number")
        .eq("analysis_id", analysisId)
        .eq("owner_id", userId);
      check(attempts.error, "Synthetic persisted attempt query failed.");
      assert.equal(attempts.data?.length, 1);
      const attempt = attempts.data![0];
      assert.equal(attempt.attempt_number, 1);
      assert.equal(attempt.input_sha256, sourceSha256);
      const envelope = DocumentEvidenceSchema.parse(attempt.envelope);
      assert.equal(envelope.id, attempt.id);
      assert.equal(envelope.ownerId, userId);
      assert.equal(envelope.analysisId, analysisId);
      assert.equal(envelope.sourceId, sourceId);
      assert.equal(envelope.inputSha256, sourceSha256);
      assert.deepEqual(
        envelope.nativeSource.pages.map((page) => page.text),
        expectedNative,
      );
      assert.equal(envelope.scoringEligible, false);
      assert.equal(envelope.ocrSource, null);
      assert.equal(
        envelope.status,
        fixture.kind === "mixed" ? "unsupported" : "review_required",
      );
      if (fixture.kind === "mixed")
        assert.deepEqual(envelope.ocrFailure, { code: "unsupported" });
      await assertNoOutputs(analysisId);
      // Actual worker retries on the durable no-score state must be no-ops.
      await processExtractionStage(analysisId);
      await processQueuedAnalysis(analysisId, 2, new AbortController().signal);
      const retry: {
        data: Array<{ id: string; envelope: unknown }> | null;
        error: unknown;
      } = await admin
        .from("document_evidence_attempts")
        .select("id, envelope")
        .eq("analysis_id", analysisId)
        .eq("owner_id", userId);
      check(retry.error, "Synthetic retry observation failed.");
      assert.equal(retry.data?.length, 1);
      assert.equal(retry.data![0].id, attempt.id);
      assert.deepEqual(retry.data![0].envelope, attempt.envelope);
      await assertNoOutputs(analysisId);
      results.push({
        fixture: fixture.kind,
        execution,
        sourceSha256,
        sourceBytes: fixture.bytes.length,
        pages: expectedNative.length,
        status: envelope.status,
        attempts: 1,
        nativePreservation: "verified",
        retry: "no_new_attempt_or_outputs",
        scoringEligible: false,
        scoreAndProviderRows: 0,
      });
    }
  assert.equal(blockedEgress, 0, "Worker attempted external network access.");
} finally {
  const cleanupErrors: string[] = [];
  if (
    storageKeys.length &&
    (await admin.storage.from(bucket).remove(storageKeys)).error
  )
    cleanupErrors.push("storage");
  if (userId && (await admin.auth.admin.deleteUser(userId)).error)
    cleanupErrors.push("user");
  globalThis.fetch = originalFetch;
  assert.deepEqual(
    cleanupErrors,
    [],
    "Exact synthetic fixture cleanup failed.",
  );
}
process.stdout.write(
  JSON.stringify(
    {
      status: "local_document_worker_verified",
      completedAt: new Date().toISOString(),
      datasetType: "synthetic_engineering_only",
      fixtureDocuments: results.length,
      authoredSources: 2,
      humanValidation: "not_evaluated",
      representativeValidity: "not_evaluated",
      evidenceReviewOptIn: true,
      productionOcrEnabled: false,
      providerRequests: 0,
      externalEgressAttempts: blockedEgress,
      cleanup: "verified",
      results,
    },
    null,
    2,
  ) + "\n",
);
