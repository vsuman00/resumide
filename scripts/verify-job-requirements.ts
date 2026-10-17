import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createJobRequirementFixture } from "./job-requirement-test-fixture";
import {
  loadJobRequirements,
  saveJobRequirements,
} from "../app/lib/server/job-requirement-repository";
import { parseJobRequirements } from "../app/lib/server/job-requirements";
import { CanonicalError } from "../app/lib/server/canonical-repository";
import { SupabasePrivacyRequestRepository } from "../app/lib/server/privacy-worker";
const fixture = await createJobRequirementFixture(),
  other = await createJobRequirementFixture(
    "SQL preferred\n3 years experience required",
  );
let assertions = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  assertions++;
}
async function rejects(operation: () => Promise<unknown>, status: number) {
  await assert.rejects(
    operation,
    (e) => e instanceof CanonicalError && e.status === status,
  );
  assertions++;
}
const { admin, ownerId, analysisId } = fixture;
try {
  check(
    (await loadJobRequirements(admin, analysisId, ownerId)).current === null,
    "Initial version present",
  );
  const command = { expectedVersionId: null, idempotencyKey: randomUUID() };
  const first = await saveJobRequirements(
    admin,
    analysisId,
    ownerId,
    command,
    "aa3-first",
  );
  const doc = (await loadJobRequirements(admin, analysisId, ownerId)).current!
    .document;
  check(
    doc.requirements.length === 10 && doc.state === "review_required",
    "Typed requirements missing",
  );
  check(
    (
      await saveJobRequirements(
        admin,
        analysisId,
        ownerId,
        command,
        "aa3-retry",
      )
    ).versionId === first.versionId,
    "Retry duplicated version",
  );
  const race = await Promise.allSettled(
    [1, 2].map((i) =>
      saveJobRequirements(
        admin,
        analysisId,
        ownerId,
        { expectedVersionId: first.versionId, idempotencyKey: randomUUID() },
        `aa3-race-${i}`,
      ),
    ),
  );
  check(
    race.filter((r) => r.status === "fulfilled").length === 1,
    "Concurrent winner count",
  );
  check(
    race.some(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof CanonicalError &&
        r.reason.status === 409,
    ),
    "Concurrent conflict missing",
  );
  check(
    (
      await loadJobRequirements(admin, analysisId, ownerId, {
        versionId: first.versionId,
      })
    ).current!.document.id === first.versionId,
    "History mutated",
  );
  await rejects(
    () => loadJobRequirements(admin, analysisId, other.ownerId),
    404,
  );
  await rejects(
    () =>
      saveJobRequirements(
        admin,
        analysisId,
        other.ownerId,
        command,
        "aa3-foreign",
      ),
    404,
  );
  await rejects(
    () => loadJobRequirements(admin, analysisId, ownerId, { offset: -1 }),
    422,
  );
  check(
    (await fixture.user.from("job_requirement_versions").select("id")).data
      ?.length === 2,
    "Owner RLS failed",
  );
  check(
    (
      await other.user
        .from("job_requirement_versions")
        .select("id")
        .eq("analysis_id", analysisId)
    ).data?.length === 0,
    "Other owner read JD",
  );
  check(
    !!(
      await fixture.user.rpc("save_job_requirements", {
        p_user_id: ownerId,
        p_analysis_id: analysisId,
        p_body: doc,
        p_expected_version: null,
        p_idempotency_key: randomUUID(),
        p_request_id: "bad",
      })
    ).error,
    "Client called privileged writer",
  );
  check(
    !!(
      await fixture.user.rpc("export_job_requirement_records", {
        p_user_id: ownerId,
      })
    ).error,
    "Client exported privileged data",
  );
  check(
    !!(
      await admin
        .from("job_requirement_versions")
        .update({ revision: 99 })
        .eq("id", first.versionId)
    ).error,
    "Direct immutable write permitted",
  );
  for (const kind of [
    "quote",
    "owner",
    "hash",
    "duplicate",
    "years",
    "unsupported",
    "score",
    "experience-value",
    "importance-cue",
  ]) {
    const bad = parseJobRequirements(other.description, {
      ownerId: other.ownerId,
      organizationId: other.organizationId,
      analysisId: other.analysisId,
      jobId: other.jobId,
    });
    if (kind === "quote") bad.requirements[0].evidence.quote = "Forged JD";
    if (kind === "owner") bad.ownerId = ownerId;
    if (kind === "hash") bad.inputSha256 = "b".repeat(64);
    if (kind === "duplicate")
      bad.requirements.push(structuredClone(bad.requirements[0]));
    if (kind === "years") bad.requirements[0].minimumYears = 10;
    if (kind === "experience-value")
      bad.requirements.find((x) => x.type === "experience")!.minimumYears = 99;
    if (kind === "importance-cue")
      bad.requirements[0].importanceEvidence!.quote = "invented importance";
    if (kind === "unsupported") bad.domain = "nursing";
    const r = await admin.rpc("save_job_requirements", {
      p_user_id: other.ownerId,
      p_analysis_id: other.analysisId,
      p_body: kind === "score" ? { ...bad, score: 100 } : bad,
      p_expected_version: null,
      p_idempotency_key: randomUUID(),
      p_request_id: "aa3-adversarial",
    });
    check(!!r.error, `Accepted ${kind} tampering`);
  }
  check(
    (
      await admin
        .from("job_requirement_versions")
        .select("id")
        .eq("analysis_id", other.analysisId)
    ).data?.length === 0,
    "Rejected writes leaked partial version",
  );
  check(
    !(
      await admin
        .from("jobs")
        .update({ title: "Civil Engineer" })
        .eq("id", other.jobId)
    ).error,
    "Unsupported title setup failed",
  );
  await saveJobRequirements(
    admin,
    other.analysisId,
    other.ownerId,
    { expectedVersionId: null, idempotencyKey: randomUUID() },
    "aa3-job-delete",
  );
  check(
    (await loadJobRequirements(admin, other.analysisId, other.ownerId)).current!
      .document.state === "unsupported",
    "Unrelated job inherited software pack",
  );
  check(
    !(await admin.from("jobs").delete().eq("id", other.jobId)).error,
    "Job deletion failed",
  );
  for (const table of ["job_requirement_versions", "job_requirements"])
    check(
      (await admin.from(table).select("owner_id").eq("owner_id", other.ownerId))
        .data?.length === 0,
      "Job cascade left requirements",
    );
  const exported =
    await new SupabasePrivacyRequestRepository().buildExportManifest({
      id: randomUUID(),
      kind: "export",
      userId: ownerId,
      organizationId: fixture.organizationId,
      attempt: 1,
      workerId: "aa3-local",
    });
  check(
    exported.records.jobRequirementVersions.length === 2 &&
      exported.records.jobRequirements.length === 20,
    "Privacy export dropped requirements",
  );
  const audit = await admin
    .from("audit_events")
    .select("action,request_id")
    .eq("actor_id", ownerId)
    .eq("action", "requirements.import");
  check(
    audit.data?.length === 2 &&
      !JSON.stringify(audit.data).includes("TypeScript"),
    "Audit duplicated or leaked source",
  );
  check(
    (
      await admin
        .from("analysis_ai_runs")
        .select("id")
        .eq("analysis_id", analysisId)
    ).data?.length === 0,
    "Unexpected AI call",
  );
  check(
    !(
      await admin.from("data_requests").insert({
        id: randomUUID(),
        user_id: ownerId,
        organization_id: fixture.organizationId,
        kind: "deletion",
      })
    ).error,
    "Deletion request setup failed",
  );
  await rejects(() => loadJobRequirements(admin, analysisId, ownerId), 404);
  check(
    (await fixture.user.from("job_requirements").select("id")).data?.length ===
      0,
    "Pending deletion leaked requirements",
  );
  const claimed = await admin.rpc("claim_privacy_request", {
    p_worker_id: "aa3-delete-worker",
    p_lease_seconds: 120,
  });
  check(
    !claimed.error && claimed.data?.userId === ownerId,
    "Privacy deletion claim failed",
  );
  const deleted = await admin.rpc("prepare_deletion_request", {
    p_request_id: claimed.data.id,
    p_worker_id: "aa3-delete-worker",
  });
  check(
    !deleted.error && deleted.data?.storageObjects.length === 1,
    "Privacy deletion preparation failed",
  );
  for (const table of ["job_requirement_versions", "job_requirements"])
    check(
      (await admin.from(table).select("owner_id").eq("owner_id", ownerId)).data
        ?.length === 0,
      "Analysis cascade left requirements",
    );
  process.stdout.write(
    JSON.stringify({
      phase: "AA3",
      localOnly: true,
      assertions,
      concurrentWinners: 1,
      aiCalls: 0,
      passed: true,
    }) + "\n",
  );
} finally {
  await fixture.cleanup();
  await other.cleanup();
}
