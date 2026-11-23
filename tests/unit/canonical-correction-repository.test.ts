import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import type { EvidenceField } from "../../app/lib/server/evidence-fields";
import type { CanonicalCorrectionProjection } from "../../app/lib/server/canonical-corrections";

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  config: {
    CANONICAL_AUTHORING_ENABLED: true,
    EVIDENCE_REVIEW_ENABLED: true,
    CANONICAL_CORRECTIONS_ENABLED: true,
  },
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => mocks.config,
}));
vi.mock("../../app/lib/server/evidence-review", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/evidence-review")>()),
  loadEvidenceReview: mocks.review,
}));
import {
  mutateCanonical,
  mutateCanonicalCorrection,
  loadCanonicalCorrectionWorkspace,
  readCanonicalForm,
} from "../../app/lib/server/canonical-repository";
import {
  CanonicalCorrectionAssignmentSelectorSchema,
  type CanonicalCorrectionCommand,
  type CanonicalCorrectionLedger,
} from "../../app/lib/server/canonical-correction-commands";
import {
  importCanonicalEvidence,
  reviseCanonical,
  rollbackCanonical,
} from "../../app/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "../../app/lib/server/canonical-resume-schema";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(text = "Experience\nEmployer: Fictional Original Lab") {
  const evidence = reconcileDocumentEvidence(
    {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-11-10T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const targets = deriveEvidenceReviewTargets(evidence, {
    ownerId: id(2),
    analysisId: id(3),
    sourceId: id(4),
    inputSha256: "a".repeat(64),
    attemptId: id(1),
  });
  const corrections: CanonicalCorrectionProjection["history"] = [
    {
      id: id(10),
      attempt_id: id(1),
      analysis_id: id(3),
      owner_id: id(2),
      actor_id: id(2),
      revision: 1,
      expected_revision: 0,
      field: "employer" as EvidenceField,
      operation: "correct" as const,
      value: "Fictional Corrected Lab",
      candidate_id: null,
      created_at: "2026-11-10T00:00:00.000Z",
    },
  ];
  return {
    analysisId: id(3),
    attemptId: id(1),
    attemptNumber: 1,
    evidence,
    corrections,
    revision: 1,
    scoringEligible: false as const,
    targets,
    historyAttestation: {
      schemaVersion: "evidence-review-history/1.0.0" as const,
      state: "complete_captured_prefix" as const,
      binding: { ...targets.binding, targetModelVersion: targets.modelVersion },
      highWaterRevision: 1,
      highWaterEventId: corrections[0].id,
      receivedCount: 1,
      pageCount: 1,
    },
  };
}
function database() {
  const rows: Record<string, unknown> = {
    analyses: {
      id: id(3),
      owner_id: id(2),
      organization_id: id(6),
      resume_version_id: id(4),
    },
    resume_versions: {
      id: id(4),
      resume_id: id(5),
      owner_id: id(2),
      organization_id: id(6),
      active_resume: {
        id: id(5),
        owner_id: id(2),
        organization_id: id(6),
        status: "active",
      },
    },
    memberships: { user_id: id(2) },
    data_requests: [],
  };
  const privacy = {
    subjects: new Set([id(2)]),
    preparations: [] as { owner_id: string }[],
    requests: [] as { user_id: string; kind: string; status: string }[],
  };
  const authorityRpc = vi.fn((name: string, args: Record<string, unknown>) => ({
    abortSignal: async (signal: AbortSignal) => {
      if (signal.aborted) throw Error("SYNTHETIC_AUTHORITY_ABORTED");
      if (name === "read_owned_ai_disposition_readiness")
        return {
          data: {
            ...OWNED_AI_DISPOSITION_PROFILE,
            schemaReady: true,
            exportExecutable: false,
            accessExecutable: true,
          },
          error: null,
        };
      const ownerId = String(args.p_user_id);
      if (
        name !== "read_candidate_privacy_access" ||
        !privacy.subjects.has(ownerId)
      )
        return { data: null, error: { code: "42501" } };
      return {
        data: {
          schemaVersion: "candidate-privacy-access/1.0.0",
          ownerId,
          deletionPrepared: privacy.preparations.some(
            (row) => row.owner_id === ownerId,
          ),
          blockingRequest: privacy.requests.some(
            (row) =>
              row.user_id === ownerId &&
              row.kind === "deletion" &&
              !["failed", "cancelled"].includes(row.status),
          ),
        },
        error: null,
      };
    },
  }));
  // Existing mutation/ledger spies keep their original call and replay semantics.
  const dispatchRpc =
    (operationRpc: (name: string, args: Record<string, unknown>) => unknown) =>
    (name: string, args: Record<string, unknown>) =>
      [
        "read_owned_ai_disposition_readiness",
        "read_candidate_privacy_access",
      ].includes(name)
        ? authorityRpc(name, args)
        : operationRpc(name, args);
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (error: unknown) => unknown,
      ) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(
          resolve,
          reject,
        ),
    };
    return chain;
  };
  const rpc = vi.fn().mockResolvedValue({
    data: {
      status: "applied",
      versionId: id(20),
      revision: 1,
      idempotent: false,
    },
    error: null,
  });
  return {
    client: { from, rpc: dispatchRpc(rpc) } as unknown as Parameters<
      typeof mutateCanonical
    >[0],
    rpc,
    privacy,
    authorityRpc,
    dispatchRpc,
  };
}

function emptyLedger(review = fixture()): CanonicalCorrectionLedger {
  return {
    schemaVersion: "candidate-correction-ledger/1.0.0",
    status: "ready",
    writeReady: true,
    scoringEligible: false,
    binding: {
      ...review.targets.binding,
      resumeId: id(5),
      organizationId: id(6),
      targetModelVersion: "evidence-targets/1.0.0",
      projectionModelVersion: "canonical-corrections/1.0.1",
      admissionPolicyVersion: "candidate-correction-admission/1.0.0",
    },
    reviewRevision: review.revision,
    assignmentRevision: 0,
    headId: null,
    operations: [],
    assignments: [],
    applications: [],
    snapshots: [],
    snapshotFacts: [],
  };
}
function scope() {
  return {
    owner_id: id(2),
    organization_id: id(6),
    resume_id: id(5),
    analysis_id: id(3),
    source_resume_version_id: id(4),
    attempt_id: id(1),
    input_sha256: "a".repeat(64),
  };
}
function assignedLedger(document: CanonicalResumeDraft | null = null) {
  const review = fixture(),
    ledger = emptyLedger(review);
  const observation = review.targets.observations.find(
    (row) => row.field === "employer",
  )!;
  const fact = document?.facts.find((row) => row.type === "employer");
  const section = document?.sections.find((section) =>
    section.entries.some((entry) => entry.factIds.includes(fact!.id)),
  );
  const entry = section?.entries.find((entry) =>
    entry.factIds.includes(fact!.id),
  );
  const assignment: CanonicalCorrectionLedger["assignments"][number] = {
    ...scope(),
    id: id(41),
    actor_id: id(2),
    operation_id: id(40),
    assignment_revision: 1,
    expected_assignment_revision: 0,
    correction_event_id: id(10),
    correction_revision: 1,
    field: "employer",
    event_operation: "correct",
    target_model_version: "evidence-targets/1.0.0",
    target_kind: "observed_assertion",
    assertion_id: observation.assertionId,
    opaque_target_id: observation.targetId,
    supersedes_assignment_id: null,
    mapping_mode: document ? "existing" : "imported_assertion",
    base_version_id: document?.versionId ?? null,
    fact_id: fact?.id ?? null,
    mapping_proof_kind: "current_citations",
    origin_version_id: null,
    origin_fact_id: null,
    location_kind: "entry",
    section_id: section?.id ?? null,
    entry_id: entry?.id ?? null,
    bullet_id: null,
    new_section_type: null,
    new_section_title: null,
    created_at: "2026-11-10T00:00:00Z",
  };
  ledger.headId = document?.versionId ?? null;
  ledger.assignmentRevision = 1;
  ledger.assignments = [assignment];
  ledger.operations = [
    {
      ...scope(),
      id: id(40),
      actor_id: id(2),
      kind: "assign",
      idempotency_key: id(50),
      expected_review_revision: 1,
      expected_assignment_revision: 0,
      expected_canonical_version_id: ledger.headId,
      selected_assignment_ids: [id(41)],
      initial_import_version_id: null,
      result_version_id: ledger.headId,
      result_revision: document ? 1 : null,
      result_assignment_revision: 1,
      child_version_ids: [],
      command_sha256: "b".repeat(64),
      target_model_version: "evidence-targets/1.0.0",
      projection_model_version: "canonical-corrections/1.0.1",
      admission_policy_version: "candidate-correction-admission/1.0.0",
      evidence_schema_version: "evidence/2.0.0",
      field_extractor_version: review.targets.binding.fieldExtractorVersion,
      command_codec_version: "c02-command-bytes/1.0.0",
      created_at: "2026-11-10T00:00:00Z",
    },
  ];
  return ledger;
}
function original() {
  return importCanonicalEvidence(fixture().evidence, {
    resumeId: id(5),
    organizationId: id(6),
    ownerId: id(2),
  });
}
function correctedHistory() {
  const source = original(),
    fact = source.facts.find((row) => row.type === "employer")!;
  const corrected = reviseCanonical(source, {
    operation: "edit",
    factId: fact.id,
    value: fixture().corrections[0].value,
  });
  const ledger = assignedLedger(source);
  ledger.headId = corrected.versionId;
  ledger.operations.push({
    ...ledger.operations[0],
    id: id(42),
    kind: "apply",
    idempotency_key: id(52),
    expected_assignment_revision: 1,
    result_version_id: corrected.versionId,
    result_revision: 2,
    child_version_ids: [corrected.versionId],
  });
  ledger.applications.push({
    ...scope(),
    id: id(43),
    actor_id: id(2),
    operation_id: id(42),
    assignment_id: id(41),
    step_ordinal: 1,
    base_version_id: source.versionId,
    result_version_id: corrected.versionId,
    result_fact_id: fact.id,
    supersedes_application_id: null,
    created_at: "2026-11-10T00:00:01Z",
  });
  ledger.snapshots.push({
    canonical_version_id: corrected.versionId,
    owner_id: id(2),
    organization_id: id(6),
    resume_id: id(5),
    source_resume_version_id: id(4),
    source_operation_id: id(42),
    origin_kind: "correction",
    inherited_from_version_id: null,
    restored_from_version_id: null,
    admission_policy_version: "candidate-correction-admission/1.0.0",
    created_at: "2026-11-10T00:00:01Z",
  });
  ledger.snapshotFacts.push({
    canonical_version_id: corrected.versionId,
    fact_id: fact.id,
    owner_id: id(2),
    organization_id: id(6),
    application_id: id(43),
  });
  return { source, corrected, fact, ledger };
}
function command(
  kind: "apply" | "add" | "reapply" = "apply",
  expectedVersionId: string | null = null,
): CanonicalCorrectionCommand {
  const binding = emptyLedger().binding;
  return {
    schemaVersion: "candidate-correction-command/1.0.0",
    kind,
    idempotencyKey: id(70),
    sourceId: binding.sourceId,
    attemptId: binding.attemptId,
    inputSha256: binding.inputSha256,
    evidenceSchemaVersion: binding.evidenceSchemaVersion,
    fieldExtractorVersion: binding.fieldExtractorVersion,
    targetModelVersion: binding.targetModelVersion,
    projectionModelVersion: binding.projectionModelVersion,
    admissionPolicyVersion: binding.admissionPolicyVersion,
    expectedReviewRevision: 1,
    expectedAssignmentRevision: 1,
    expectedVersionId,
    acknowledgement: true,
    selectors: [
      {
        assignmentId: id(41),
        priorApplicationId: kind === "reapply" ? id(43) : null,
      },
    ],
  };
}
function scenario(
  ledger = emptyLedger(),
  documents: CanonicalResumeDraft[] = [],
) {
  const base = database();
  const from = (table: string) => {
    if (!table.startsWith("canonical_resume_")) return base.client.from(table);
    let versionId: unknown;
    const records = documents.map((doc, index) => ({
      id: doc.versionId,
      resume_id: id(5),
      owner_id: id(2),
      organization_id: id(6),
      source_resume_version_id: id(4),
      parent_version_id: doc.parentVersionId,
      revision: index + 1,
      created_at: doc.createdAt,
      content: doc,
    }));
    const rows = () =>
      table === "canonical_resume_heads"
        ? ledger.headId
          ? [{ version_id: ledger.headId, revision: documents.length }]
          : []
        : versionId
          ? records.filter((row) => row.id === versionId)
          : [...records].reverse();
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (column === "id") versionId = value;
        return chain;
      },
      order: () => chain,
      range: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return chain;
  };
  const rpc = vi.fn<
    (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  >(async (name, args) => {
    if (name === "read_candidate_correction_ledger")
      return { data: ledger, error: null };
    if (
      name === "save_canonical_version" ||
      name === "import_canonical_original"
    )
      return {
        data: {
          status: "applied",
          versionId: id(20),
          revision: 1,
          idempotent: false,
        },
        error: null,
      };
    const input = args.p_command as CanonicalCorrectionCommand;
    const imported = args.p_import_body as CanonicalResumeDraft | null;
    return {
      data: {
        schemaVersion: "candidate-correction-result/1.0.0",
        status: input.kind === "assign" ? "assigned" : "applied",
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        operationId: id(81),
        versionId: input.kind === "assign" ? input.expectedVersionId : id(80),
        revision:
          input.kind === "assign"
            ? input.expectedVersionId
              ? documents.length
              : null
            : documents.length + (imported ? 2 : 1),
        assignmentRevision:
          ledger.assignmentRevision +
          (input.kind === "assign" ? input.selectors.length : 0),
        assignmentIds: [id(41)],
        childVersionIds:
          input.kind === "assign"
            ? []
            : [...(imported ? [imported.versionId] : []), id(80)],
        idempotent: false,
        scoringEligible: false,
      },
      error: null,
    };
  });
  return {
    client: { from, rpc: base.dispatchRpc(rpc) } as unknown as Parameters<
      typeof mutateCanonical
    >[0],
    rpc,
    ledger,
    privacy: base.privacy,
    authorityRpc: base.authorityRpc,
  };
}
function mutationCalls(rpc: ReturnType<typeof scenario>["rpc"]) {
  return rpc.mock.calls.filter(
    ([name]) => name !== "read_candidate_correction_ledger",
  );
}

describe("canonical correction repository admission", () => {
  it.each(["failed", "cancelled"])(
    "keeps prepared %s deletion blocked before correction admission",
    async (status) => {
      const db = scenario();
      db.privacy.requests.push({ user_id: id(2), kind: "deletion", status });
      db.privacy.preparations.push({ owner_id: id(2) });
      await expect(
        loadCanonicalCorrectionWorkspace(db.client, id(3), id(2)),
      ).rejects.toMatchObject({ status: 404 });
      expect(mutationCalls(db.rpc)).toEqual([]);
      expect(db.authorityRpc).toHaveBeenCalledWith(
        "read_candidate_privacy_access",
        { p_user_id: id(2) },
      );
    },
  );
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.CANONICAL_CORRECTIONS_ENABLED = true;
    mocks.review.mockResolvedValue(fixture());
  });

  it.each(["employer", "dates"])(
    "allows a reviewed initial-import %s assertion before SQL allocates its entry",
    (field) => {
      expect(
        CanonicalCorrectionAssignmentSelectorSchema.safeParse({
          eventId: id(10),
          targetKind: "observed_assertion",
          assertionId: `synthetic-${field}`,
          opaqueTargetId: `synthetic-target-${field}`,
          mappingMode: "imported_assertion",
          baseVersionId: null,
          factId: null,
          mappingProofKind: "current_citations",
          originVersionId: null,
          originFactId: null,
          location: {
            kind: "entry",
            sectionId: null,
            entryId: null,
            bulletId: null,
            newSectionType: null,
            newSectionTitle: null,
          },
          supersedesAssignmentId: null,
        }).success,
      ).toBe(true);
    },
  );

  it("requires explicit review instead of silently importing original values over active corrections", async () => {
    const db = scenario(),
      { client, rpc } = db;
    rpc.mockImplementation(async (name) => ({
      data:
        name === "read_candidate_correction_ledger"
          ? db.ledger
          : { status: "conflict" },
      error: null,
    }));
    await expect(
      mutateCanonical(
        client,
        id(3),
        id(2),
        {
          operation: "import",
          expectedVersionId: null,
          idempotencyKey: id(30),
        },
        "synthetic-correction-import",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).not.toHaveBeenCalledWith(
      "save_canonical_version",
      expect.anything(),
    );
    expect(mutationCalls(rpc).map(([name]) => name)).toEqual([
      "import_canonical_original",
    ]);
  });

  it("permits a reviewed original import after a later exact confirmation supersedes the correction", async () => {
    const review = fixture(),
      originalAssertion = review.evidence.assertions.find(
        (row) => row.field === "employer",
      )!;
    review.corrections.push({
      ...review.corrections[0],
      id: id(11),
      revision: 2,
      expected_revision: 1,
      operation: "confirm",
      candidate_id: originalAssertion.id,
      value: originalAssertion.value,
      created_at: "2026-11-10T00:00:01Z",
    });
    review.revision = 2;
    review.historyAttestation.highWaterRevision = 2;
    review.historyAttestation.highWaterEventId = id(11);
    review.historyAttestation.receivedCount = 2;
    mocks.review.mockResolvedValue(review);
    const { client, rpc } = scenario(emptyLedger(review));
    await expect(
      mutateCanonical(
        client,
        id(3),
        id(2),
        {
          operation: "import",
          expectedVersionId: null,
          idempotencyKey: id(30),
        },
        "confirmed-original",
      ),
    ).resolves.toMatchObject({ status: "applied" });
    const [[name, args]] = mutationCalls(rpc);
    expect(name).toBe("import_canonical_original");
    expect(args.p_binding).toMatchObject({
      attemptId: review.attemptId,
      reviewRevision: 2,
      assignmentRevision: 0,
      canonicalHeadId: null,
    });
    expect(
      (args.p_body as CanonicalResumeDraft).facts.find(
        (fact) => fact.type === "employer",
      )?.value,
    ).toBe(originalAssertion.value);
  });

  it("binds an unchanged original import to the captured review instead of the legacy writer", async () => {
    const base = fixture(),
      review = {
        ...base,
        corrections: [],
        revision: 0,
        historyAttestation: {
          ...base.historyAttestation,
          highWaterRevision: 0,
          highWaterEventId: null,
          receivedCount: 0,
          pageCount: 0,
        },
      };
    mocks.review.mockResolvedValue(review);
    const ledger = emptyLedger();
    ledger.reviewRevision = 0;
    const db = scenario(ledger);
    await expect(
      mutateCanonical(
        db.client,
        id(3),
        id(2),
        {
          operation: "import",
          expectedVersionId: null,
          idempotencyKey: id(30),
        },
        "unchanged-original",
      ),
    ).resolves.toMatchObject({ status: "applied", scoringEligible: false });
    const [[name, args]] = mutationCalls(db.rpc);
    expect(name).toBe("import_canonical_original");
    expect(Object.keys(args).sort()).toEqual([
      "p_analysis_id",
      "p_binding",
      "p_body",
      "p_command",
      "p_request_id",
      "p_user_id",
    ]);
    expect(args.p_binding).toEqual({
      ...ledger.binding,
      reviewRevision: 0,
      assignmentRevision: 0,
      canonicalHeadId: null,
    });
    expect(args.p_command).toEqual({
      operation: "import",
      expectedVersionId: null,
      idempotencyKey: id(30),
      factId: null,
      value: null,
      targetVersionId: null,
    });
  });

  it("keeps an original-import replay reachable with newer pending corrections and a newer head", async () => {
    const ledger = emptyLedger();
    ledger.headId = id(91);
    const db = scenario(ledger);
    db.rpc.mockImplementation(async (name) => ({
      data:
        name === "read_candidate_correction_ledger"
          ? ledger
          : {
              status: "applied",
              versionId: id(20),
              revision: 1,
              idempotent: true,
            },
      error: null,
    }));
    await expect(
      mutateCanonical(
        db.client,
        id(3),
        id(2),
        {
          operation: "import",
          expectedVersionId: null,
          idempotencyKey: id(30),
        },
        "replayed-original",
      ),
    ).resolves.toEqual({
      status: "applied",
      versionId: id(20),
      revision: 1,
      idempotent: true,
      scoringEligible: false,
    });
    const [[name, args]] = mutationCalls(db.rpc);
    expect(name).toBe("import_canonical_original");
    expect(args.p_binding).toMatchObject({
      canonicalHeadId: id(91),
      reviewRevision: 1,
    });
    expect(args.p_command).toMatchObject({
      expectedVersionId: null,
      idempotencyKey: id(30),
    });
  });

  it.each(["review", "attempt", "extractor"])(
    "rejects original-import %s binding drift before mutation",
    async (kind) => {
      const ledger = emptyLedger();
      if (kind === "review") ledger.reviewRevision++;
      if (kind === "attempt") ledger.binding.attemptId = id(99);
      if (kind === "extractor")
        ledger.binding.fieldExtractorVersion = "evidence-fields/99.0.0";
      const db = scenario(ledger);
      await expect(
        mutateCanonical(
          db.client,
          id(3),
          id(2),
          {
            operation: "import",
            expectedVersionId: null,
            idempotencyKey: id(30),
          },
          "stale-original",
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(mutationCalls(db.rpc)).toEqual([]);
    },
  );

  it("keeps original imports unavailable without authoritative write readiness", async () => {
    const ledger = emptyLedger();
    ledger.writeReady = false;
    const db = scenario(ledger);
    await expect(
      mutateCanonical(
        db.client,
        id(3),
        id(2),
        {
          operation: "import",
          expectedVersionId: null,
          idempotencyKey: id(30),
        },
        "unready-original",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it.each([
    ["invalid", 422],
    ["unavailable", 503],
    ["not_found", 404],
    ["malformed", 503],
    ["transport", 503],
  ] as const)(
    "maps original-import %s outcomes without exposing raw details",
    async (kind, status) => {
      const ledger = emptyLedger(),
        db = scenario(ledger);
      db.rpc.mockImplementation(async (name) => {
        if (name === "read_candidate_correction_ledger")
          return { data: ledger, error: null };
        if (kind === "transport") throw Error("PRIVATE_ORIGINAL_IMPORT_DETAIL");
        return {
          data:
            kind === "malformed"
              ? {
                  status: "not_found",
                  detail: "PRIVATE_ORIGINAL_IMPORT_DETAIL",
                }
              : { status: kind },
          error: null,
        };
      });
      await expect(
        mutateCanonical(
          db.client,
          id(3),
          id(2),
          {
            operation: "import",
            expectedVersionId: null,
            idempotencyKey: id(30),
          },
          "original-outcome",
        ),
      ).rejects.toMatchObject({ status });
      expect(mutationCalls(db.rpc).map(([name]) => name)).toEqual([
        "import_canonical_original",
      ]);
    },
  );

  it("preserves legacy raw import when the new feature is off", async () => {
    mocks.config.CANONICAL_CORRECTIONS_ENABLED = false;
    const { client, rpc } = scenario();
    await mutateCanonical(
      client,
      id(3),
      id(2),
      { operation: "import", expectedVersionId: null, idempotencyKey: id(30) },
      "legacy-import",
    );
    const saved = rpc.mock.calls.find(
      ([name]) => name === "save_canonical_version",
    )![1].p_body as CanonicalResumeDraft;
    expect(saved.facts.find((fact) => fact.type === "employer")?.value).toBe(
      "Fictional Original Lab",
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "read_candidate_correction_ledger",
      expect.anything(),
    );
  });

  it("projects exact original quotes and initial-import choices without granting confirmation", async () => {
    const db = scenario();
    const model = await loadCanonicalCorrectionWorkspace(
      db.client,
      id(3),
      id(2),
    );
    const item = model.corrections.items[0];
    expect(model.corrections.writeReady).toBe(true);
    expect(item).toMatchObject({
      state: "needs_assignment",
      proposedValue: "Fictional Corrected Lab",
      confirmationGranted: false,
    });
    expect(item.sourceChoices[0]).toMatchObject({
      quote: "Fictional Original Lab",
      references: [{ pageId: "page-1", method: "native_text" }],
    });
    expect(item.assignmentOptions[0].selector).toMatchObject({
      mappingMode: "imported_assertion",
      location: { kind: "entry", entryId: null },
    });
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it("offers both existing targets for multiple employer observations without duplicate Add choices", async () => {
    const review = fixture(
      "Experience\nEmployer: Fictional North Lab\nRole: Backend Engineer\nDates: 2020 - 2021\nEmployer: Fictional South Lab\nRole: Data Engineer\nDates: 2022 - 2023",
    );
    mocks.review.mockResolvedValue(review);
    const document = importCanonicalEvidence(review.evidence, {
      resumeId: id(5),
      organizationId: id(6),
      ownerId: id(2),
    });
    const ledger = emptyLedger(review);
    ledger.headId = document.versionId;
    const db = scenario(ledger, [document]);
    const item = (
      await loadCanonicalCorrectionWorkspace(db.client, id(3), id(2))
    ).corrections.items[0];
    const existing = item.assignmentOptions.filter(
      (option) => option.selector.mappingMode === "existing",
    );
    expect(existing).toHaveLength(2);
    for (const observation of review.targets.observations.filter(
      (row) => row.field === "employer",
    )) {
      const fact = document.facts.find(
        (fact) => fact.type === "employer" && fact.value === observation.value,
      )!;
      expect(
        existing
          .filter(
            (option) => option.selector.assertionId === observation.assertionId,
          )
          .map((option) => option.selector.factId),
      ).toEqual([fact.id]);
    }
    expect(
      item.assignmentOptions.some(
        (option) => option.selector.mappingMode === "add",
      ),
    ).toBe(false);
  });

  it("never reuses a selected employer's fact mapping for another source assertion", async () => {
    const review = fixture(
      "Experience\nEmployer: Fictional North Lab\nRole: Backend Engineer\nDates: 2020 - 2021\nEmployer: Fictional South Lab\nRole: Data Engineer\nDates: 2022 - 2023",
    );
    mocks.review.mockResolvedValue(review);
    const document = importCanonicalEvidence(review.evidence, {
      resumeId: id(5),
      organizationId: id(6),
      ownerId: id(2),
    });
    const ledger = assignedLedger(document),
      first = review.targets.observations.find(
        (row) => row.field === "employer",
      )!;
    ledger.assignments[0].assertion_id = first.assertionId;
    ledger.assignments[0].opaque_target_id = first.targetId;
    const db = scenario(ledger, [document]);
    const item = (
      await loadCanonicalCorrectionWorkspace(db.client, id(3), id(2))
    ).corrections.items[0];
    const existing = item.assignmentOptions.filter(
      (option) => option.selector.mappingMode === "existing",
    );
    const pairs = existing.map((option) => [
      option.selector.assertionId,
      option.selector.factId,
    ]);
    const expected = review.targets.observations
      .filter((row) => row.field === "employer")
      .map((observation) => [
        observation.assertionId,
        document.facts.find(
          (fact) =>
            fact.type === "employer" && fact.value === observation.value,
        )!.id,
      ]);
    expect(pairs).toEqual(expected);
  });

  it("distinguishes initial employer choices and the saved target using their exact source context", async () => {
    const review = fixture(
      "Experience\nEmployer: Fictional North Lab\nRole: Backend Engineer\nEmployer: Fictional South Lab\nRole: Data Engineer",
    );
    mocks.review.mockResolvedValue(review);
    const initial = scenario(emptyLedger(review));
    const first = (
      await loadCanonicalCorrectionWorkspace(initial.client, id(3), id(2))
    ).corrections.items[0];
    const imports = first.assignmentOptions.filter(
      (option) => option.selector.mappingMode === "imported_assertion",
    );
    expect.soft(new Set(imports.map((option) => option.label)).size).toBe(2);
    for (const source of first.sourceChoices) {
      expect
        .soft(
          imports.find(
            (option) => option.selector.assertionId === source.assertionId,
          )?.label,
        )
        .toContain(source.label);
    }
    const secondSource = first.sourceChoices[1],
      ledger = assignedLedger();
    ledger.assignments[0].assertion_id = secondSource.assertionId;
    ledger.assignments[0].opaque_target_id = secondSource.targetId;
    const assigned = scenario(ledger);
    const item = (
      await loadCanonicalCorrectionWorkspace(assigned.client, id(3), id(2))
    ).corrections.items[0];
    expect.soft(item.assignment?.label).toContain(secondSource.label);
    expect
      .soft(
        first.sourceChoices.every((source) =>
          /page-1.*occurrence [12]/u.test(source.label),
        ),
      )
      .toBe(true);
    expect
      .soft(
        first.sourceChoices.map(
          (source) => source.label.match(/occurrence (\d+)/u)?.[1],
        ),
      )
      .toEqual(["1", "2"]);
  });

  it("saves an explicit target separately from applying a corrected version", async () => {
    const db = scenario(),
      workspace = await loadCanonicalCorrectionWorkspace(
        db.client,
        id(3),
        id(2),
      );
    const input: CanonicalCorrectionCommand = {
      ...command(),
      kind: "assign",
      expectedAssignmentRevision: 0,
      selectors: [workspace.corrections.items[0].assignmentOptions[0].selector],
    };
    const result = await mutateCanonical(
      db.client,
      id(3),
      id(2),
      { operation: "correction", command: input },
      "assign-target",
    );
    expect(result).toMatchObject({
      status: "assigned",
      versionId: null,
      revision: null,
      childVersionIds: [],
      scoringEligible: false,
    });
    expect(mutationCalls(db.rpc).map(([name]) => name)).toEqual([
      "assign_candidate_correction_targets",
    ]);
  });

  it("sends only the sourced original for atomic corrected initial import", async () => {
    const db = scenario(assignedLedger());
    const result = await mutateCanonicalCorrection(
      db.client,
      id(3),
      id(2),
      command(),
      "apply-initial",
    );
    expect(result.status).toBe("applied");
    const calls = mutationCalls(db.rpc);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("apply_candidate_corrections");
    const body = calls[0][1].p_import_body as CanonicalResumeDraft;
    expect(body.facts.find((fact) => fact.type === "employer")).toMatchObject({
      value: "Fictional Original Lab",
      state: "unconfirmed",
      confirmation: null,
    });
    expect(
      body.facts.find((fact) => fact.type === "employer")!.sources.length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(calls[0][1].p_command)).not.toContain(
      "Fictional Corrected Lab",
    );
  });

  it.each(["apply", "add", "reapply"] as const)(
    "uses one authoritative %s RPC without JavaScript child writes",
    async (kind) => {
      const source = original(),
        ledger = assignedLedger(source),
        db = scenario(ledger, [source]);
      const result = await mutateCanonicalCorrection(
        db.client,
        id(3),
        id(2),
        command(kind, source.versionId),
        `explicit-${kind}`,
      );
      expect(result).toMatchObject({
        status: "applied",
        kind,
        scoringEligible: false,
      });
      expect(mutationCalls(db.rpc)).toHaveLength(1);
      expect(mutationCalls(db.rpc)[0][1]).toMatchObject({
        p_import_body: null,
        p_command: { kind, acknowledgement: true },
      });
      expect(mutationCalls(db.rpc)[0][0]).toBe("apply_candidate_corrections");
    },
  );

  it("makes real SQL readiness a prerequisite while leaving review available", async () => {
    const ledger = emptyLedger();
    ledger.writeReady = false;
    const db = scenario(ledger);
    expect(
      (await loadCanonicalCorrectionWorkspace(db.client, id(3), id(2)))
        .corrections.writeReady,
    ).toBe(false);
    await expect(
      mutateCanonicalCorrection(
        db.client,
        id(3),
        id(2),
        command(),
        "not-ready",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it("discloses applied value provenance and keeps canonical confirmation separate", async () => {
    const history = correctedHistory(),
      db = scenario(history.ledger, [history.source, history.corrected]);
    const model = await loadCanonicalCorrectionWorkspace(
      db.client,
      id(3),
      id(2),
    );
    expect(model.corrections.items[0]).toMatchObject({
      state: "applied",
      currentValue: "Fictional Corrected Lab",
      assignment: { label: expect.stringContaining("Experience") },
      applications: [{ active: true }],
      confirmationGranted: false,
    });
    expect(
      model.current!.document.facts.find((row) => row.id === history.fact.id),
    ).toMatchObject({ sources: [], state: "unconfirmed", confirmation: null });
  });

  it("requires a fresh current-head assignment after a manual edit, then explicit reapply", async () => {
    const h = correctedHistory(),
      edited = reviseCanonical(h.corrected, {
        operation: "edit",
        factId: h.fact.id,
        value: "Fictional Manual Lab",
      });
    h.ledger.headId = edited.versionId;
    const db = scenario(h.ledger, [h.source, h.corrected, edited]);
    let model = await loadCanonicalCorrectionWorkspace(db.client, id(3), id(2));
    expect(model.corrections.items[0]).toMatchObject({
      state: "needs_reassignment",
      currentValue: "Fictional Manual Lab",
      priorApplicationId: id(43),
    });
    const selected = model.corrections.items[0].assignmentOptions[0].selector;
    expect(selected).toMatchObject({
      baseVersionId: edited.versionId,
      mappingProofKind: "owned_origin_chain",
      originVersionId: h.source.versionId,
      originFactId: h.fact.id,
      supersedesAssignmentId: id(41),
    });
    h.ledger.operations.push({
      ...h.ledger.operations[0],
      id: id(45),
      expected_assignment_revision: 1,
      expected_canonical_version_id: edited.versionId,
      selected_assignment_ids: [id(44)],
      result_version_id: edited.versionId,
      result_revision: 3,
      result_assignment_revision: 2,
    });
    h.ledger.assignments.push({
      ...h.ledger.assignments[0],
      id: id(44),
      operation_id: id(45),
      assignment_revision: 2,
      expected_assignment_revision: 1,
      base_version_id: edited.versionId,
      mapping_proof_kind: "owned_origin_chain",
      origin_version_id: h.source.versionId,
      origin_fact_id: h.fact.id,
      supersedes_assignment_id: id(41),
    });
    h.ledger.assignmentRevision = 2;
    model = await loadCanonicalCorrectionWorkspace(db.client, id(3), id(2));
    expect(model.corrections.items[0]).toMatchObject({
      state: "needs_reapply",
      assignment: { id: id(44), baseVersionId: edited.versionId },
      priorApplicationId: id(43),
    });
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it("exposes restore history without overlaying a past correction", async () => {
    const h = correctedHistory(),
      restored = rollbackCanonical(h.corrected, h.source);
    h.ledger.headId = restored.versionId;
    h.ledger.snapshots.push({
      ...h.ledger.snapshots[0],
      canonical_version_id: restored.versionId,
      source_operation_id: null,
      origin_kind: "restore",
      restored_from_version_id: h.source.versionId,
    });
    const db = scenario(h.ledger, [h.source, h.corrected, restored]);
    const model = await loadCanonicalCorrectionWorkspace(
      db.client,
      id(3),
      id(2),
    );
    expect(model.corrections.snapshot).toMatchObject({
      originKind: "restore",
      restoredFromVersionId: h.source.versionId,
      activeApplicationIds: [],
    });
    expect(model.corrections.items[0].state).toBe("needs_reassignment");
    expect(
      model.current!.document.facts.find((fact) => fact.id === h.fact.id)
        ?.value,
    ).toBe("Fictional Original Lab");
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it("provides explicit absent-field add placement and unobserved source status", async () => {
    const review = fixture();
    review.corrections[0] = {
      ...review.corrections[0],
      field: "phone",
      value: "0000000000",
    };
    mocks.review.mockResolvedValue(review);
    const db = scenario(emptyLedger(review));
    const model = await loadCanonicalCorrectionWorkspace(
      db.client,
      id(3),
      id(2),
    );
    expect(model.corrections.items[0]).toMatchObject({
      state: "requires_add",
      sourceChoices: [{ assertionId: null, quote: null }],
      assignmentOptions: [
        {
          selector: {
            mappingMode: "add",
            targetKind: "unobserved_field",
            location: { kind: "contact" },
          },
        },
      ],
    });
    expect(mutationCalls(db.rpc)).toEqual([]);
  });

  it("retains all producer readers and preserves producer2 on edit/confirm/restore", () => {
    const source = original();
    for (const producerVersion of [
      "canonical-engine/1.0.0",
      "canonical-engine/1.0.1",
      "canonical-engine/1.0.2",
    ] as const)
      expect(
        CanonicalResumeDraftSchema.safeParse({ ...source, producerVersion })
          .success,
      ).toBe(true);
    const added = {
      ...source,
      producerVersion: "canonical-engine/1.0.2" as const,
    };
    const confirmed = reviseCanonical(added, {
      operation: "confirm",
      factId: added.facts[0].id,
    });
    expect(confirmed.producerVersion).toBe("canonical-engine/1.0.2");
    expect(rollbackCanonical(confirmed, added).producerVersion).toBe(
      "canonical-engine/1.0.2",
    );
  });

  it.each(["foreign", "gap", "unknown", "snapshot_policy"])(
    "fails closed on %s ledger metadata",
    async (kind) => {
      const documents = kind === "snapshot_policy" ? [original()] : [];
      const ledger = assignedLedger(documents[0] ?? null);
      if (kind === "foreign") ledger.assignments[0].owner_id = id(99);
      if (kind === "gap") ledger.assignments[0].assignment_revision = 2;
      if (kind === "snapshot_policy")
        ledger.snapshots.push({
          canonical_version_id: documents[0].versionId,
          owner_id: id(2),
          organization_id: id(6),
          resume_id: id(5),
          source_resume_version_id: id(4),
          source_operation_id: null,
          origin_kind: "raw_import",
          inherited_from_version_id: null,
          restored_from_version_id: null,
          admission_policy_version: "candidate-correction-admission/1.0.0",
          created_at: "2026-11-10T00:00:00Z",
        });
      const db = scenario(ledger, documents);
      if (kind === "snapshot_policy")
        db.rpc.mockResolvedValueOnce({
          data: {
            ...ledger,
            snapshots: ledger.snapshots.map((row) => ({
              ...row,
              admission_policy_version: "unknown-future-policy/99.0.0",
            })),
          },
          error: null,
        });
      if (kind === "unknown")
        db.rpc.mockResolvedValueOnce({
          data: {
            ...ledger,
            writeReady: "yes",
          } as unknown as CanonicalCorrectionLedger,
          error: null,
        });
      await expect(
        loadCanonicalCorrectionWorkspace(db.client, id(3), id(2)),
      ).rejects.toMatchObject({ status: 503 });
      expect(mutationCalls(db.rpc)).toEqual([]);
    },
  );

  it.each(["conflict", "unavailable", "invalid", "not_found"])(
    "preserves safe %s mutation outcomes",
    async (status) => {
      const db = scenario(assignedLedger());
      db.rpc.mockImplementation(async (name) => ({
        data:
          name === "read_candidate_correction_ledger"
            ? db.ledger
            : { schemaVersion: "candidate-correction-result/1.0.0", status },
        error: null,
      }));
      await expect(
        mutateCanonicalCorrection(
          db.client,
          id(3),
          id(2),
          command(),
          "bounded-outcome",
        ),
      ).rejects.toMatchObject({
        status: {
          conflict: 409,
          unavailable: 503,
          invalid: 422,
          not_found: 404,
        }[status],
      });
    },
  );

  it("rejects malformed command receipts and exposes no raw transport errors", async () => {
    const db = scenario(assignedLedger());
    db.rpc.mockImplementation(async (name) => {
      if (name === "read_candidate_correction_ledger")
        return { data: db.ledger, error: null };
      throw Error("PRIVATE_DATABASE_DETAIL");
    });
    await expect(
      mutateCanonicalCorrection(
        db.client,
        id(3),
        id(2),
        command(),
        "safe-error",
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Structured resume is unavailable. Try again later.",
    });
  });

  it("parses the strict correction form and rejects hidden authority or duplicate JSON keys", async () => {
    const form = (json: string) =>
      new Request("https://example.test/canonical", {
        method: "POST",
        body: new URLSearchParams({ operation: "correction", command: json }),
      });
    expect(await readCanonicalForm(form(JSON.stringify(command())))).toEqual({
      operation: "correction",
      command: command(),
    });
    for (const invalid of [
      { ...command(), value: "Fabricated value" },
      { ...command(), ownerId: id(99) },
      { ...command(), acknowledgement: false },
    ])
      await expect(
        readCanonicalForm(form(JSON.stringify(invalid))),
      ).rejects.toMatchObject({ status: 422 });
    const duplicate = JSON.stringify(command()).replace(
      '{"schemaVersion":',
      '{"kind":"add","schemaVersion":',
    );
    await expect(readCanonicalForm(form(duplicate))).rejects.toMatchObject({
      status: 422,
    });
  });
});
