import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCanonicalFixture } from "./canonical-test-fixture";
import {
  loadCanonical,
  mutateCanonical,
  CanonicalError,
} from "../app/lib/server/canonical-repository";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../app/lib/server/canonical-content";
import { SupabasePrivacyRequestRepository } from "../app/lib/server/privacy-worker";

const fixture = await createCanonicalFixture();
const other = await createCanonicalFixture("Name: Other Synthetic Person");
const { admin, ownerId, analysisId } = fixture;
let assertions = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  assertions++;
}
async function rejects(operation: () => Promise<unknown>, status: number) {
  await assert.rejects(
    operation,
    (error) => error instanceof CanonicalError && error.status === status,
  );
  assertions++;
}
try {
  const initial = await loadCanonical(admin, analysisId, ownerId);
  check(initial.current === null, "Initial draft must be absent");
  const importCommand = {
    operation: "import",
    expectedVersionId: null,
    idempotencyKey: randomUUID(),
  } as const;
  const imported = await mutateCanonical(
    admin,
    analysisId,
    ownerId,
    importCommand,
    "aa2-import",
  );
  const current = await loadCanonical(admin, analysisId, ownerId);
  check(
    current.current?.document.facts.every((f) => f.state === "unconfirmed"),
    "Import promoted uncertain facts",
  );
  check(
    current.current?.document.sections.some((s) => s.type === "skills"),
    "Skills missing",
  );
  const replay = await mutateCanonical(
    admin,
    analysisId,
    ownerId,
    importCommand,
    "aa2-import-retry",
  );
  check(
    replay.idempotent && replay.versionId === imported.versionId,
    "Import idempotency failed",
  );
  const original = current.current!.document;
  const fact = original.facts.find((f) => f.type === "employer")!;
  const confirmCommand = {
    operation: "confirm",
    expectedVersionId: imported.versionId,
    idempotencyKey: randomUUID(),
    factId: fact.id,
  } as const;
  const confirmed = await mutateCanonical(
    admin,
    analysisId,
    ownerId,
    confirmCommand,
    "aa2-confirm",
  );
  const confirmedRead = await loadCanonical(admin, analysisId, ownerId);
  check(
    confirmedRead.current?.document.facts.find((f) => f.id === fact.id)
      ?.confirmation?.actorId === ownerId,
    "Exact owner confirmation missing",
  );
  check(
    (
      await loadCanonical(admin, analysisId, ownerId, {
        versionId: imported.versionId,
      })
    ).current?.document.facts.find((f) => f.id === fact.id)?.state ===
      "unconfirmed",
    "Ancestor mutated",
  );
  const competitors = ["First correction", "Second correction"].map(
    (value) => ({
      operation: "edit" as const,
      expectedVersionId: confirmed.versionId,
      idempotencyKey: randomUUID(),
      factId: fact.id,
      value,
    }),
  );
  const race = await Promise.allSettled(
    competitors.map((command) =>
      mutateCanonical(admin, analysisId, ownerId, command, "aa2-concurrent"),
    ),
  );
  check(
    race.filter((r) => r.status === "fulfilled").length === 1,
    "Concurrent CAS accepted two writers",
  );
  check(
    race.some(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof CanonicalError &&
        r.reason.status === 409,
    ),
    "Concurrent loser did not conflict",
  );
  const winner = race.findIndex((r) => r.status === "fulfilled");
  const retry = await mutateCanonical(
    admin,
    analysisId,
    ownerId,
    competitors[winner],
    "aa2-edit-retry",
  );
  check(retry.idempotent, "Edit retry duplicated version");
  const edited = await loadCanonical(admin, analysisId, ownerId);
  const editedFact = edited.current!.document.facts.find(
    (f) => f.id === fact.id,
  )!;
  check(
    editedFact.state === "unconfirmed" &&
      editedFact.sources.length === 0 &&
      editedFact.confirmation === null,
    "Edited fact retained stale support",
  );
  await rejects(
    () =>
      mutateCanonical(
        admin,
        analysisId,
        ownerId,
        { ...competitors[winner], value: "Changed retry payload" },
        "aa2-reuse",
      ),
    409,
  );
  const restored = await mutateCanonical(
    admin,
    analysisId,
    ownerId,
    {
      operation: "rollback",
      expectedVersionId: edited.headId!,
      targetVersionId: confirmed.versionId,
      idempotencyKey: randomUUID(),
    },
    "aa2-rollback",
  );
  const restoredRead = await loadCanonical(admin, analysisId, ownerId, {
    compareId: confirmed.versionId,
  });
  check(
    restoredRead.current!.document.parentVersionId === edited.headId &&
      restored.versionId !== confirmed.versionId,
    "Rollback mutated history",
  );
  check(
    restoredRead.comparison?.length === 0,
    "Rollback lost fact provenance or confirmation",
  );
  await rejects(() => loadCanonical(admin, analysisId, other.ownerId), 404);
  await rejects(
    () =>
      loadCanonical(admin, analysisId, ownerId, { versionId: randomUUID() }),
    404,
  );
  await rejects(
    () => loadCanonical(admin, analysisId, ownerId, { offset: 10001 }),
    422,
  );
  check(
    (
      await other.user
        .from("canonical_resume_versions")
        .select("id")
        .eq("resume_id", fixture.resumeId)
    ).data?.length === 0,
    "RLS exposed another owner",
  );
  const direct = await fixture.user
    .from("resume_facts")
    .update({ value: "Forgery" })
    .eq("canonical_version_id", restored.versionId);
  check(!!direct.error, "Client mutated canonical facts");
  const directRpc = await fixture.user.rpc("save_canonical_version", {
    p_user_id: ownerId,
    p_source_id: fixture.sourceId,
    p_body: original,
    p_command: {},
    p_request_id: "forgery",
  });
  check(!!directRpc.error, "Client invoked privileged writer");
  const forged = reviseCanonical(restoredRead.current!.document, {
    operation: "edit",
    factId: fact.id,
    value: "Forged employer",
  });
  forged.facts.find((f) => f.id === fact.id)!.state = "source_supported";
  const forgeResult = await admin.rpc("save_canonical_version", {
    p_user_id: ownerId,
    p_source_id: fixture.sourceId,
    p_body: forged,
    p_command: {
      operation: "edit",
      expectedVersionId: restored.versionId,
      idempotencyKey: randomUUID(),
      factId: fact.id,
      value: "Forged employer",
      targetVersionId: null,
    },
    p_request_id: "aa2-forged",
  });
  check(!!forgeResult.error, "Unsupported fact accepted");
  check(
    (await loadCanonical(admin, analysisId, ownerId)).headId ===
      restored.versionId,
    "Rejected write changed head",
  );
  const raw = importCanonicalEvidence(fixture.envelope, {
    resumeId: fixture.resumeId,
    organizationId: fixture.organizationId,
    ownerId,
  });
  raw.facts[0].sources[0].end = 200000;
  const invalid = await admin.rpc("save_canonical_version", {
    p_user_id: ownerId,
    p_source_id: fixture.sourceId,
    p_body: raw,
    p_command: {
      operation: "import",
      expectedVersionId: restored.versionId,
      idempotencyKey: randomUUID(),
      factId: null,
      value: null,
      targetVersionId: null,
    },
    p_request_id: "aa2-invalid",
  });
  check(
    invalid.data?.status === "conflict" || !!invalid.error,
    "Invalid import accepted",
  );
  const exported =
    await new SupabasePrivacyRequestRepository().buildExportManifest({
      id: randomUUID(),
      kind: "export",
      userId: ownerId,
      organizationId: fixture.organizationId,
      attempt: 1,
      workerId: "aa2-local",
    });
  check(
    exported.records.canonicalResumeVersions.length === 4,
    "Export lost immutable versions",
  );
  check(
    exported.records.resumeFacts.length > 0 &&
      exported.records.changeEvents.length === 4,
    "Export lost facts or ledger",
  );
  const events = await admin
    .from("audit_events")
    .select("action,request_id")
    .eq("actor_id", ownerId)
    .like("action", "canonical.%");
  check(events.data?.length === 4, "Audit events missing or duplicated");
  check(
    (
      await admin
        .from("analysis_ai_runs")
        .select("id")
        .eq("analysis_id", analysisId)
    ).data?.length === 0,
    "Unexpected AI call",
  );
  if (
    (
      await admin
        .from("resumes")
        .update({ status: "deleted" })
        .eq("id", fixture.resumeId)
    ).error
  )
    throw new Error("Soft deletion failed");
  await rejects(() => loadCanonical(admin, analysisId, ownerId), 404);
  check(
    (
      await fixture.user
        .from("resume_facts")
        .select("id")
        .eq("canonical_version_id", restored.versionId)
    ).data?.length === 0,
    "Soft deletion exposed facts",
  );
  if ((await admin.from("resumes").delete().eq("id", fixture.resumeId)).error)
    throw new Error("Hard deletion failed");
  for (const table of [
    "canonical_resume_versions",
    "resume_facts",
    "canonical_resume_heads",
    "change_events",
  ]) {
    const rows = await admin
      .from(table)
      .select("owner_id")
      .eq("owner_id", ownerId);
    check(
      !rows.error && rows.data?.length === 0,
      "Canonical cascade incomplete",
    );
  }
  // Fresh lineage: verify rejection inside the SQL transaction, before CAS
  // could mask the malformed data as an existing-head conflict.
  const otherDraft = importCanonicalEvidence(other.envelope, {
    resumeId: other.resumeId,
    organizationId: other.organizationId,
    ownerId: other.ownerId,
  });
  for (const mutation of [
    "source-text",
    "foreign-source",
    "duplicate-id",
    "unsupported-fact",
    "missing-fact",
    "unknown-field",
  ]) {
    const bad = structuredClone(otherDraft);
    if (mutation === "source-text") bad.facts[0].value = "Invented metric: 99%";
    if (mutation === "foreign-source")
      bad.facts[0].sources[0].attemptId = fixture.attemptId;
    if (mutation === "duplicate-id") bad.facts[0].id = bad.versionId;
    if (mutation === "unsupported-fact")
      bad.facts[0].state = "source_supported";
    if (mutation === "missing-fact") bad.contactFactIds = [randomUUID()];
    const body = mutation === "unknown-field" ? { ...bad, score: 100 } : bad;
    const result = await admin.rpc("save_canonical_version", {
      p_user_id: other.ownerId,
      p_source_id: other.sourceId,
      p_body: body,
      p_command: {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
        factId: null,
        value: null,
        targetVersionId: null,
      },
      p_request_id: "aa2-adversarial",
    });
    check(!!result.error, `SQL accepted ${mutation}`);
    check(
      (
        await admin
          .from("canonical_resume_versions")
          .select("id")
          .eq("resume_id", other.resumeId)
      ).data?.length === 0,
      "Rejected transaction left a partial version",
    );
  }
  const otherImport = await mutateCanonical(
    admin,
    other.analysisId,
    other.ownerId,
    {
      operation: "import",
      expectedVersionId: null,
      idempotencyKey: randomUUID(),
    },
    "aa2-retention-import",
  );
  const deletionId = randomUUID();
  check(
    !(
      await admin.from("data_requests").insert({
        id: deletionId,
        user_id: other.ownerId,
        organization_id: other.organizationId,
        kind: "deletion",
      })
    ).error,
    "Deletion request failed",
  );
  await rejects(
    () => loadCanonical(admin, other.analysisId, other.ownerId),
    404,
  );
  check(
    (
      await other.user
        .from("resume_facts")
        .select("id")
        .eq("canonical_version_id", otherImport.versionId)
    ).data?.length === 0,
    "Pending deletion did not revoke canonical reads",
  );
  // Mark only this synthetic request failed to exercise retention independently.
  check(
    !(
      await admin
        .from("data_requests")
        .update({ status: "failed" })
        .eq("id", deletionId)
    ).error,
    "Synthetic deletion reset failed",
  );
  check(
    !(
      await admin
        .from("resumes")
        .update({ created_at: "1900-01-01T00:00:00Z" })
        .eq("id", other.resumeId)
    ).error,
    "Synthetic age setup failed",
  );
  const retained = await admin.rpc("claim_expired_resume_objects", {
    p_before: "1900-01-02T00:00:00Z",
    p_limit: 10,
  });
  check(
    !retained.error &&
      retained.data.length === 1 &&
      retained.data[0].resume_id === other.resumeId,
    "Retention claim mismatch",
  );
  await rejects(
    () => loadCanonical(admin, other.analysisId, other.ownerId),
    404,
  );
  check(
    (
      await admin.rpc("complete_retention_item", {
        p_item_id: retained.data[0].item_id,
      })
    ).data === true,
    "Retention cleanup failed",
  );
  for (const table of [
    "canonical_resume_versions",
    "resume_facts",
    "canonical_resume_heads",
    "change_events",
  ])
    check(
      (await admin.from(table).select("owner_id").eq("owner_id", other.ownerId))
        .data?.length === 0,
      "Retention left canonical records",
    );
  const deletionFixture = await createCanonicalFixture(
    "Name: Deletion Synthetic Person",
  );
  try {
    await mutateCanonical(
      admin,
      deletionFixture.analysisId,
      deletionFixture.ownerId,
      {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
      },
      "aa2-delete-import",
    );
    const requestId = randomUUID();
    check(
      !(
        await admin.from("data_requests").insert({
          id: requestId,
          user_id: deletionFixture.ownerId,
          organization_id: deletionFixture.organizationId,
          kind: "deletion",
        })
      ).error,
      "Privacy request setup failed",
    );
    const claimed = await admin.rpc("claim_privacy_request", {
      p_worker_id: "aa2-delete-worker",
      p_lease_seconds: 120,
    });
    check(
      !claimed.error && claimed.data.id === requestId,
      "Privacy deletion claim failed",
    );
    const plan = await admin.rpc("prepare_deletion_request", {
      p_request_id: requestId,
      p_worker_id: "aa2-delete-worker",
    });
    check(
      !plan.error && plan.data.storageObjects.length === 1,
      "Privacy deletion preparation failed",
    );
    const retryPlan = await admin.rpc("prepare_deletion_request", {
      p_request_id: requestId,
      p_worker_id: "aa2-delete-worker",
    });
    check(
      !retryPlan.error &&
        JSON.stringify(retryPlan.data.storageObjects) ===
          JSON.stringify(plan.data.storageObjects),
      "Deletion retry lost durable storage plan",
    );
    for (const table of [
      "canonical_resume_versions",
      "resume_facts",
      "canonical_resume_heads",
      "change_events",
    ])
      check(
        (
          await admin
            .from(table)
            .select("owner_id")
            .eq("owner_id", deletionFixture.ownerId)
        ).data?.length === 0,
        "Privacy deletion left canonical records",
      );
  } finally {
    await deletionFixture.cleanup();
  }
  const exportFixture = await createCanonicalFixture(
    `Name: Bulk Synthetic Person\nSkills\n${Array.from({ length: 90 }, (_, i) => `Synthetic skill ${i + 1}`).join("\n")}`,
  );
  try {
    let head = await mutateCanonical(
      admin,
      exportFixture.analysisId,
      exportFixture.ownerId,
      {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
      },
      "aa2-bulk-import",
    );
    const first = await loadCanonical(
      admin,
      exportFixture.analysisId,
      exportFixture.ownerId,
    );
    const factsPerVersion = first.current!.document.facts.length;
    const name = first.current!.document.facts.find(
      (item) => item.type === "name",
    )!;
    for (let i = 1; i < 12; i++)
      head = await mutateCanonical(
        admin,
        exportFixture.analysisId,
        exportFixture.ownerId,
        {
          operation: "edit",
          expectedVersionId: head.versionId,
          idempotencyKey: randomUUID(),
          factId: name.id,
          value: `Bulk Synthetic Person ${i}`,
        },
        `aa2-bulk-edit-${i}`,
      );
    const expectedFacts = factsPerVersion * 12;
    check(
      expectedFacts > 1000,
      "Bulk fixture did not exceed the Data API row cap",
    );
    const capped = await admin
      .from("resume_facts")
      .select("id")
      .eq("owner_id", exportFixture.ownerId);
    check(
      !capped.error && capped.data?.length === 1000,
      "Data API row-cap fixture was not exercised",
    );
    const bulkExport =
      await new SupabasePrivacyRequestRepository().buildExportManifest({
        id: randomUUID(),
        kind: "export",
        userId: exportFixture.ownerId,
        organizationId: exportFixture.organizationId,
        attempt: 1,
        workerId: "aa2-local-bulk",
      });
    check(
      bulkExport.records.resumeFacts.length === expectedFacts,
      "Canonical export truncated facts",
    );
    check(
      bulkExport.records.canonicalResumeVersions.length === 12 &&
        bulkExport.records.changeEvents.length === 12 &&
        bulkExport.records.canonicalResumeHeads.length === 1,
      "Bulk export lost version history or head",
    );
  } finally {
    await exportFixture.cleanup();
  }
  process.stdout.write(
    JSON.stringify({
      phase: "AA2",
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
