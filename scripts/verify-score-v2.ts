import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createScoreFixture } from "./score-v2-test-fixture";
import { loadScoreDiagnostics } from "../app/lib/server/score-v2-repository";
import {
  mutateCanonical,
  loadCanonical,
  CanonicalError,
} from "../app/lib/server/canonical-repository";
import { saveJobRequirements } from "../app/lib/server/job-requirement-repository";
const f = await createScoreFixture(),
  other = await createScoreFixture();
let assertions = 0;
const check = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions++;
};
const rejects = async (fn: () => Promise<unknown>, status: number) => {
  await assert.rejects(
    fn,
    (e) => e instanceof CanonicalError && e.status === status,
  );
  assertions++;
};
try {
  const read = () => loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId);
  const initial = await read();
  check(
    initial.diagnostics.score.dimensions.every(
      (d) => d.value === null && !d.eligible,
    ),
    "Numeric authority activated",
  );
  check(
    initial.diagnostics.readinessAggregate === null,
    "Readiness aggregate activated",
  );
  check(
    initial.diagnostics.improvements.length <= 5,
    "Unbounded repair priorities",
  );
  check(initial.diagnostics.alignment.length > 0, "JD traces missing");
  check(
    JSON.stringify(initial) === JSON.stringify(await read()),
    "Identical inputs drifted",
  );
  await rejects(
    () => loadScoreDiagnostics(f.admin, f.analysisId, other.ownerId),
    404,
  );
  await rejects(
    () =>
      loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
        canonical: other.canonical.versionId,
      }),
    404,
  );
  await rejects(
    () =>
      loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
        requirements: other.requirements.versionId,
      }),
    404,
  );
  for (const options of [
    { ownerId: other.ownerId },
    { policyId: "fake-approved" },
    { canonical: "invalid" },
    { weights: 100 },
  ])
    await rejects(
      () => loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, options),
      422,
    );
  await rejects(
    () =>
      loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
        expectedCanonical: randomUUID(),
      }),
    409,
  );
  await rejects(
    () =>
      loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
        expectedRequirements: randomUUID(),
      }),
    409,
  );
  const canonical = await loadCanonical(f.admin, f.analysisId, f.ownerId);
  const changed = await mutateCanonical(
    f.admin,
    f.analysisId,
    f.ownerId,
    {
      operation: "confirm",
      factId: canonical.current!.document.facts[0].id,
      expectedVersionId: f.canonical.versionId,
      idempotencyKey: randomUUID(),
    },
    "aa4-confirm",
  );
  check(
    changed.versionId !== f.canonical.versionId,
    "Canonical history unchanged",
  );
  const newer = await read();
  check(
    newer.diagnostics.score.inputSha256 !==
      initial.diagnostics.score.inputSha256,
    "Changed version did not change input binding",
  );
  const historical = await loadScoreDiagnostics(
    f.admin,
    f.analysisId,
    f.ownerId,
    {
      canonical: f.canonical.versionId,
      requirements: f.requirements.versionId,
    },
  );
  check(historical.historical, "History not labeled");
  check(
    JSON.stringify(historical.diagnostics) ===
      JSON.stringify(initial.diagnostics),
    "Historical diagnostics drifted",
  );
  check(
    !(
      await f.admin
        .from("jobs")
        .update({ description: "Requirements\nSQL required" })
        .eq("id", f.jobId)
    ).error,
    "JD change failed",
  );
  await saveJobRequirements(
    f.admin,
    f.analysisId,
    f.ownerId,
    {
      expectedVersionId: f.requirements.versionId,
      idempotencyKey: randomUUID(),
    },
    "aa4-jd-change",
  );
  await rejects(
    () =>
      loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
        expectedRequirements: f.requirements.versionId,
      }),
    409,
  );
  const oldBoth = await loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId, {
    canonical: f.canonical.versionId,
    requirements: f.requirements.versionId,
  });
  check(
    JSON.stringify(oldBoth.diagnostics) === JSON.stringify(initial.diagnostics),
    "JD change mutated historical diagnostics",
  );
  check(
    !(
      await f.admin
        .from("analyses")
        .update({ job_id: null })
        .eq("id", f.analysisId)
    ).error,
    "Remove JD failed",
  );
  check(
    (await read()).diagnostics.readiness.blockers.includes(
      "job_description_missing",
    ),
    "Missing JD fabricated alignment",
  );
  check(
    !(
      await f.admin
        .from("resume_versions")
        .update({ page_count: 2 })
        .eq("id", f.sourceId)
    ).error,
    "Declared page setup failed",
  );
  check(
    (await read()).diagnostics.readiness.observedPageCoverage === 0.5,
    "Incomplete page coverage lost",
  );
  check(
    !(
      await f.admin
        .from("resumes")
        .update({ status: "deleted" })
        .eq("id", f.resumeId)
    ).error,
    "Source deletion setup failed",
  );
  await rejects(read, 404);
  check(
    !(
      await other.admin.from("data_requests").insert({
        user_id: other.ownerId,
        organization_id: other.organizationId,
        kind: "deletion",
      })
    ).error,
    "Privacy deletion setup failed",
  );
  await rejects(
    () => loadScoreDiagnostics(other.admin, other.analysisId, other.ownerId),
    404,
  );
  const results = await f.admin
    .from("analysis_results")
    .select("analysis_id")
    .in("analysis_id", [f.analysisId, other.analysisId]);
  check(
    !results.error && results.data?.length === 0,
    "Diagnostics wrote scoring results",
  );
  process.stdout.write(
    JSON.stringify({
      scope: "local synthetic AA4",
      assertions,
      passed: true,
      providerCalls: 0,
    }) + "\n",
  );
} finally {
  await f.cleanup();
  await other.cleanup();
}
