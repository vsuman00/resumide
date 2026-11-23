import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { assessEvaluationCorpus } from "../app/lib/server/evaluation-corpus";
import { assessAnnotationEvidence } from "../app/lib/server/evaluation-annotation";
import {
  createEvaluationPartitionLock,
  readEvaluationPartitionLabels,
} from "../app/lib/server/evaluation-partitions";
import {
  proposeEvaluationCalibration,
  type CalibrationObservation,
} from "../app/lib/server/evaluation-calibration";
import {
  EVALUATION_METRICS,
  hashEvaluationCalibration,
  runLockedEvaluation,
} from "../app/lib/server/evaluation-runner";
import {
  extractPdfTextLayers,
  detectPdfTextProfile,
} from "../app/lib/server/ocr/pdf-detection";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../app/lib/server/canonical-content";
import { parseJobRequirements } from "../app/lib/server/job-requirements";
import {
  buildScoreDiagnostics,
  normalizeWeightedRules,
} from "../app/lib/server/score-v2-engine";
import {
  ScoreDimensionId,
  getDraftScorePolicy,
} from "../app/lib/server/score-v2-contract";
import { groundWriterSuggestions } from "../app/lib/server/writer-grounding";
import { renderArtifact } from "../app/lib/server/artifact-renderer";
import { TEMPLATE } from "../app/lib/server/artifact-contract";
import {
  assessEvaluationClaim,
  EVALUATION_CLAIMS,
  hashEvaluationClaimCard,
  hashLockedEvaluationReport,
  monitorEvaluationClaim,
} from "../app/lib/server/evaluation-claims";
import { createPilotWorkflow } from "../app/lib/server/pilot-workflow";
import {
  PILOT_METRICS,
  PILOT_OPERATIONS,
} from "../app/lib/server/pilot-evidence";
import {
  createEvaluationWorkflowFixture,
  WORKFLOW_AS_OF,
  WORKFLOW_CORPUS_VERSION,
  type EvaluationWorkflowDocument,
} from "../tests/fixtures/evaluation-workflow";

const digest = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const uuid = (value: string) => {
  const h = digest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const normalized = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
type Value = number | { actual: number; reference: number } | null;
type MetricValues = Record<(typeof EVALUATION_METRICS)[number], Value>;

async function analyze(doc: EvaluationWorkflowDocument) {
  const started = performance.now();
  if (digest(doc.bytes) !== doc.sourceHash)
    throw new Error("SOURCE_HASH_DRIFT");
  const extracted = await extractPdfTextLayers(doc.bytes, {
    maxPages: 3,
    maxCharacters: 20_000,
    includeLayout: true,
  });
  const profile = detectPdfTextProfile(extracted);
  const ownerId = uuid("workflow-owner"),
    organizationId = uuid("workflow-organization"),
    analysisId = uuid(doc.id);
  const evidence = reconcileDocumentEvidence(
    {
      id: uuid(`${doc.id}-evidence`),
      ownerId,
      analysisId,
      sourceId: uuid(`${doc.id}-source`),
      inputSha256: doc.sourceHash,
      createdAt: WORKFLOW_AS_OF,
      retentionPolicyId: "synthetic-workflow/1.0.0",
    },
    buildNativeEvidence(extracted.pageTexts),
  );
  let canonical = importCanonicalEvidence(evidence, {
    resumeId: uuid(`${doc.id}-resume`),
    organizationId,
    ownerId,
  });
  // Simulated confirmation of known fictional source facts, never an end-user approval.
  for (const fact of [...canonical.facts])
    canonical = reviseCanonical(
      canonical,
      { operation: "confirm", factId: fact.id },
      WORKFLOW_AS_OF,
    );
  const requirements = parseJobRequirements(doc.jd, {
    ownerId,
    organizationId,
    analysisId,
    jobId: uuid(`${doc.id}-job`),
  });
  const diagnostics = buildScoreDiagnostics({
    evidence,
    canonical,
    requirements,
    expectedPageCount: extracted.totalPages,
  });
  const expected = doc.reference
    ? [
        doc.reference.name,
        doc.reference.email,
        doc.reference.phone,
        doc.reference.employer,
      ]
    : [];
  const recovered = expected.filter((value) =>
    evidence.assertions.some(
      (assertion) => normalized(assertion.value) === normalized(value),
    ),
  );
  const criticalCoverage = expected.length
    ? recovered.length / expected.length
    : null;
  const matched = diagnostics.alignment.filter(
    (row) => row.state === "satisfied" || row.state === "partially_satisfied",
  ).length;
  const alignmentCredit = diagnostics.alignment.length
    ? matched / diagnostics.alignment.length
    : null;
  const jobPass =
    requirements.requirements.some(
      (row) =>
        row.value.toLowerCase() === "python" && row.importance === "required",
    ) &&
    requirements.requirements.some(
      (row) =>
        row.value.toLowerCase() === "sql" && row.importance === "preferred",
    );
  const original = doc.reference?.originalBullet ?? "Built reliable services";
  const writer = groundWriterSuggestions(
    {
      summary: null,
      bullets: [
        {
          original,
          rewrite: "Saved 97% at Imaginary Corporation.",
          reasoning: "Adds a fabricated metric.",
        },
      ],
    },
    extracted.text,
  );
  const safeWriter = groundWriterSuggestions(
    {
      summary: null,
      bullets: [
        {
          original,
          rewrite: original,
          reasoning: "Preserves the existing source statement.",
        },
      ],
    },
    extracted.text,
  );
  const unsafeAccepted = writer.bullets.length;
  const unpublished =
    diagnostics.score.state === "withheld" &&
    diagnostics.score.dimensions.every((dimension) => dimension.value === null);
  const arithmetic =
    criticalCoverage === null || alignmentCredit === null
      ? null
      : normalizeWeightedRules([
          {
            state:
              criticalCoverage === 1
                ? "pass"
                : criticalCoverage === 0
                  ? "fail"
                  : "partial",
            weight: 0.5,
            credit: criticalCoverage,
            critical: false,
            applicabilityReason: null,
          },
          {
            state:
              alignmentCredit === 1
                ? "pass"
                : alignmentCredit === 0
                  ? "fail"
                  : "partial",
            weight: 0.5,
            credit: alignmentCredit,
            critical: false,
            applicabilityReason: null,
          },
        ]);
  const featureState =
    profile.documentType === "text" &&
    criticalCoverage !== null &&
    alignmentCredit !== null
      ? "evaluated"
      : "withheld";
  return {
    canonical,
    diagnostics,
    extracted,
    profile,
    criticalCoverage,
    alignmentCredit,
    jobPass,
    unsafeAccepted,
    safeWriterAccepted: safeWriter.bullets.length,
    unpublished,
    arithmetic,
    featureState,
    durationMs: performance.now() - started,
  };
}
type Analysis = Awaited<ReturnType<typeof analyze>>;

async function operationalPilot(
  fixture: ReturnType<typeof createEvaluationWorkflowFixture>,
  analyses: Map<string, Analysis>,
  lockHash: string,
  annotationEvidenceHash: string,
) {
  const first = fixture.documents.find((doc) => doc.cohort === "native")!;
  const second = fixture.documents.find(
    (doc) => doc.id !== first.id && doc.cohort === "native",
  )!;
  const retained = new Map(
    fixture.documents.map((doc) => [doc.sourceHash, new Uint8Array(doc.bytes)]),
  );
  const notices = new Map<string, string>();
  const participant = "workflow_participant";
  const owner = "workflow_solo_owner";
  let reads = 0,
    next = 0;
  const protocol = {
    schemaVersion: 1,
    mode: "prerelease_engineering",
    id: "workflow_protocol_v1",
    createdBy: owner,
    scope: { domain: "software_engineering", language: "en", locale: "IN" },
    vendor: null,
    partnerReference: null,
    environmentReference: null,
    corpus: {
      corpusVersion: WORKFLOW_CORPUS_VERSION,
      lockHash,
      annotationEvidenceHash,
    },
    documentHashes: fixture.documents.map((doc) => doc.sourceHash),
    participantReferences: [participant],
    startsAt: WORKFLOW_AS_OF,
    endsAt: "2026-11-08T00:00:00Z",
    retentionUntil: "2026-11-30T00:00:00Z",
    controls: Object.fromEntries(
      [...PILOT_OPERATIONS, "rubric", "claim"].map((id) => [
        id,
        `workflow_${id}_policy`,
      ]),
    ),
    claimTextHash: digest("Regression-tested synthetic workflow only"),
    limitations: ["synthetic_role_simulation_only"],
    criteria: PILOT_METRICS.map((metric) => ({
      metric,
      comparison: [
        "rubric_agreement",
        "user_comprehension",
        "workflow_usefulness",
      ].includes(metric)
        ? "minimum"
        : "maximum",
      value:
        metric === "safety_incidents"
          ? 0
          : [
                "rubric_agreement",
                "user_comprehension",
                "workflow_usefulness",
              ].includes(metric)
            ? 0.8
            : metric === "latency_ms" || metric === "cost_usd"
              ? 1000
              : 1,
    })),
    restrictions: {
      advisoryOnly: true,
      visibleRubric: true,
      overrideRequiresRationale: true,
      automaticRejection: false,
      hiddenScore: false,
      proprietaryScoreInference: false,
      generalVendorEquivalence: false,
      selectionProbabilityClaims: false,
    },
  };
  const created = createPilotWorkflow(protocol, {
    runId: "workflow_pilot_run",
    previousPolicyVersion: getDraftScorePolicy().id,
    actors: [
      { reference: owner, role: "owner", kind: "human" },
      { reference: participant, role: "participant", kind: "human" },
    ],
    participantSources: [
      { participantReference: participant, sourceHash: first.sourceHash },
    ],
    actorContext: () => ({
      reference: owner,
      role: "owner",
      kind: "human",
      asOf: "2026-11-07T12:00:00Z",
    }),
    deliverNotice: (binding) => {
      const hash = digest(JSON.stringify(binding));
      notices.set(binding.participantReference, hash);
      return { receiptHash: hash };
    },
    readRubric: (binding) => {
      reads++;
      const doc = fixture.documents.find(
        (doc) => doc.sourceHash === binding.sourceHash,
      );
      const analysis = doc && analyses.get(doc.id);
      if (!analysis) throw new Error("UNKNOWN_SYNTHETIC_SOURCE");
      return {
        schemaVersion: 1,
        producer: "deterministic_rules",
        policyVersion: getDraftScorePolicy().id,
        sourceHash: binding.sourceHash,
        evidenceHash: digest(JSON.stringify(analysis.diagnostics.rules)),
        dimensions: analysis.diagnostics.score.dimensions.map((dimension) => ({
          id: dimension.id,
          value: dimension.value,
          withheldReason: "uncalibrated",
        })),
      };
    },
    authorizeSourceUpdate: (binding) =>
      fixture.documents.some((doc) => doc.sourceHash === binding.newSourceHash),
    deleteRetainedData: () => {
      const priorKeys = [...retained.keys()];
      for (const key of priorKeys) retained.delete(key);
      return {
        deletionReceiptHash: digest(
          JSON.stringify({
            priorKeys,
            absent: priorKeys.every((key) => !retained.has(key)),
          }),
        ),
        remainingDocumentCount: retained.size,
      };
    },
  });
  if (!created.workflow) throw new Error("PILOT_PROTOCOL_REJECTED");
  const workflow = created.workflow;
  const execute = (action: string, fields: Record<string, unknown> = {}) =>
    workflow.execute({
      schemaVersion: 1,
      runId: "workflow_pilot_run",
      commandId: `workflow_command_${++next}`,
      expectedRevision: workflow.auditSnapshot().revision,
      action,
      ...fields,
    });
  const beforeNotice = await execute("read_advisory", {
    participantReference: participant,
  });
  const noPrematureRead =
    reads === 0 && beforeNotice.reason === "NOTICE_REQUIRED";
  const notice = await execute("notice", {
    participantReference: participant,
    noticeReference: "workflow_notice_v1",
  });
  const advisory = await execute("read_advisory", {
    participantReference: participant,
  });
  const rubricHash = workflow.auditSnapshot().events.at(-1)?.details.rubricHash;
  const decision = await execute("decision", {
    participantReference: participant,
    rubricHash,
    decision: "overridden",
    rationaleReference: "workflow_override_rationale",
  });
  const correction = await execute("open_correction", {
    participantReference: participant,
    caseReference: "workflow_correction_case",
    reasonReference: "workflow_correction_reason",
  });
  const resolution = await execute("resolve_correction", {
    participantReference: participant,
    caseReference: "workflow_correction_case",
    oldSourceHash: first.sourceHash,
    newSourceHash: second.sourceHash,
    resolutionReference: "workflow_corrected_source",
  });
  const appeal = await execute("open_appeal", {
    participantReference: participant,
    caseReference: "workflow_appeal_case",
    decisionEventHash: decision.eventHash,
    reasonReference: "workflow_appeal_reason",
  });
  const appealResolution = await execute("resolve_appeal", {
    participantReference: participant,
    caseReference: "workflow_appeal_case",
    resolutionReference: "workflow_appeal_resolution",
  });
  const vendor = await execute("vendor_observe", {
    documentHash: first.sourceHash,
    attempts: 2,
  });
  const monitor = await execute("monitor", {
    measurement: { metric: "safety_incidents", value: 1 },
  });
  const rollback = await execute("rollback", {
    previousPolicyVersion: getDraftScorePolicy().id,
    reasonReference: "workflow_stop_rollback",
  });
  const revoke = await execute("revoke", {
    reasonReference: "workflow_revoke_reason",
  });
  const deleted = await execute("delete_retained", {
    reasonReference: "workflow_delete_reason",
  });
  return {
    mode: "prerelease_engineering",
    actorExecution: "synthetic_role_simulation",
    retentionAdapter: "in_memory_synthetic_only",
    actualExternalVendorCalls: 0,
    checks: {
      noticeBeforeRead: noPrematureRead,
      notice: notice.status === "applied" && notices.size === 1,
      advisory: advisory.status === "applied",
      override: decision.status === "applied",
      correction:
        correction.status === "applied" && resolution.status === "applied",
      appeal:
        appeal.status === "applied" && appealResolution.status === "applied",
      noUnauthorizedVendor: vendor.reason === "VENDOR_AUTHORITY_REQUIRED",
      stop: monitor.status === "applied",
      rollback: rollback.status === "applied",
      revoke: revoke.status === "applied",
      delete: deleted.status === "applied" && retained.size === 0,
    },
    eventCount: workflow.auditSnapshot().events.length,
    auditHash: digest(JSON.stringify(workflow.auditSnapshot())),
    remainingSyntheticDocuments: retained.size,
  };
}

export async function runEvaluationWorkflow() {
  const fixture = createEvaluationWorkflowFixture();
  const policyBefore = JSON.stringify(getDraftScorePolicy());
  const corpus = assessEvaluationCorpus(
    { schemaVersion: 1, records: fixture.documents.map((doc) => doc.metadata) },
    { groups: ["synthetic-evaluation-group"] },
    WORKFLOW_AS_OF,
  );
  const annotation = assessAnnotationEvidence(
    fixture.partitionInput.annotationEvidence,
  );
  const locked = createEvaluationPartitionLock(fixture.partitionInput);
  if (!locked.lock) throw new Error("ENGINEERING_LOCK_REJECTED");
  const lock = locked.lock;
  const analyses = new Map<string, Analysis>();
  const cases: {
    sourceId: string;
    sourceHash: string;
    segmentId: string;
    values: MetricValues;
    sourceUnchanged: boolean;
    safeWriterAccepted: number;
    offlineShadowScore: number | null;
    outputHashes: string[];
    errorCode: string | null;
  }[] = [];
  const labelReads: { purpose: string; ids: string[] }[] = [];
  const analyzed = async (id: string) => {
    const doc = fixture.documents.find((doc) => doc.id === id);
    if (!doc) throw new Error("UNKNOWN_SOURCE");
    if (!analyses.has(id)) analyses.set(id, await analyze(doc));
    return { doc, analysis: analyses.get(id)! };
  };
  const calibrationReader = async (ids: readonly string[]) => {
    labelReads.push({ purpose: "calibration", ids: [...ids] });
    const rows: CalibrationObservation[] = [];
    for (const id of ids) {
      const { doc, analysis } = await analyzed(id);
      if (doc.partition === "locked_test") throw new Error("LOCKED_LABEL_READ");
      for (const dimension of ScoreDimensionId.options)
        rows.push({
          sourceId: id,
          sourceHash: doc.sourceHash,
          dimension,
          features: [
            {
              featureId: "critical_coverage",
              credit: analysis.criticalCoverage,
            },
            { featureId: "alignment_credit", credit: analysis.alignmentCredit },
          ],
          referenceScore:
            doc.cohort === "native" ? (doc.rich ? 100 : 50) : null,
          referencePositive: doc.cohort === "native" ? doc.rich : null,
          state:
            analysis.featureState === "evaluated" ? "evaluated" : "withheld",
        });
    }
    return rows;
  };
  await readEvaluationPartitionLabels(
    lock,
    fixture.partitionInput,
    {
      purpose: "development",
      partition: "development",
      actorGroups: ["workflow_development_group"],
    },
    calibrationReader,
  );
  const calibrationInput = {
    schemaVersion: 1,
    proposalVersion: "workflow_proposal_v1",
    previousPolicyVersion: getDraftScorePolicy().id,
    rationaleReference: "workflow_known_source_rubric",
    partition: "calibration",
    actorGroups: ["workflow_calibration_group"],
    lock,
    currentPartitionInput: fixture.partitionInput,
    candidates: ScoreDimensionId.options.flatMap((dimension) =>
      [0.25, 0.5, 0.75].map((weight, index) => ({
        version: `workflow_candidate_${index}`,
        dimension,
        weights: [
          { featureId: "critical_coverage", weight },
          { featureId: "alignment_credit", weight: 1 - weight },
        ],
        minimumCoverage: 1,
        threshold: 70,
      })),
    ),
  };
  const calibration = await proposeEvaluationCalibration(
    calibrationInput,
    calibrationReader,
  );
  let forbiddenReaderCalls = 0;
  const forbidden = await proposeEvaluationCalibration(
    {
      ...calibrationInput,
      partition: "locked_test",
      actorGroups: ["workflow_locked_group"],
    },
    () => {
      forbiddenReaderCalls++;
      return [];
    },
  );
  const calibrationPayloadHash = hashEvaluationCalibration(calibration);
  const lockedDocs = fixture.documents.filter(
    (doc) => doc.partition === "locked_test",
  );
  const ledger = async (ids: readonly string[]) => {
    labelReads.push({ purpose: "locked_evaluation", ids: [...ids] });
    for (const id of ids) {
      const documentStarted = performance.now();
      const { doc, analysis } = await analyzed(id);
      const values = Object.fromEntries(
        EVALUATION_METRICS.map((metric) => [metric, null]),
      ) as MetricValues;
      values.extraction =
        doc.cohort === "native" ? analysis.criticalCoverage : null;
      values.job_intelligence = Number(analysis.jobPass);
      values.writer_grounding = analysis.unsafeAccepted;
      values.safe_failure =
        Number(!analysis.unpublished) + analysis.unsafeAccepted;
      const outputHashes: string[] = [];
      if (doc.cohort === "native") {
        const selected = calibration.selectedPolicies.find(
          (policy) => policy.dimension === "ats_compatibility",
        );
        if (
          selected &&
          analysis.criticalCoverage !== null &&
          analysis.alignmentCredit !== null
        ) {
          const shadow =
            selected.weights.reduce(
              (sum, feature) =>
                sum +
                feature.weight *
                  (feature.featureId === "critical_coverage"
                    ? analysis.criticalCoverage!
                    : analysis.alignmentCredit!),
              0,
            ) * 100;
          values.scoring = { actual: shadow, reference: doc.rich ? 100 : 50 };
        }
      }
      if (doc.cohort === "native" && doc.id.endsWith("_0")) {
        for (const format of ["pdf", "docx"] as const) {
          const artifact = await renderArtifact(analysis.canonical, {
            versionId: analysis.canonical.versionId,
            format,
            pageSize: "A4",
            templateId: TEMPLATE.id,
          });
          const parity =
            artifact.report.state === "verified" &&
            artifact.report.criticalParity === 1 &&
            artifact.report.normalizedTextCoverage === 1 &&
            artifact.report.orderParity &&
            artifact.report.linkParity;
          values.artifact_parity =
            values.artifact_parity === null
              ? Number(parity)
              : Math.min(values.artifact_parity as number, Number(parity));
          values.accessibility =
            values.accessibility === null
              ? Number(artifact.report.structuralAccessibility)
              : Math.min(
                  values.accessibility as number,
                  Number(artifact.report.structuralAccessibility),
                );
          if (artifact.bytes) outputHashes.push(digest(artifact.bytes));
        }
      }
      values.latency = performance.now() - documentStarted;
      cases.push({
        sourceId: id,
        sourceHash: doc.sourceHash,
        segmentId: doc.cohort,
        values,
        sourceUnchanged: digest(doc.bytes) === doc.sourceHash,
        safeWriterAccepted: analysis.safeWriterAccepted,
        offlineShadowScore: analysis.arithmetic?.internalValue ?? null,
        outputHashes,
        errorCode: null,
      });
    }
    return cases.map(({ sourceId, sourceHash, segmentId, values }) => ({
      sourceId,
      sourceHash,
      segmentId,
      values,
    }));
  };
  const policies = EVALUATION_METRICS.map((id) => ({
    id,
    kind:
      id === "safe_failure"
        ? "exact_zero"
        : id === "scoring"
          ? "rank"
          : id === "latency" ||
              id === "cost" ||
              id === "fairness_error" ||
              id === "writer_grounding"
            ? "mean_upper"
            : "mean_lower",
    threshold:
      id === "safe_failure" ||
      id === "fairness_error" ||
      id === "writer_grounding"
        ? 0
        : id === "latency"
          ? 10_000
          : id === "cost"
            ? 1
            : id === "scoring"
              ? 0.8
              : id === "job_intelligence"
                ? 0.95
                : id === "extraction"
                  ? 0.98
                  : 1,
    minimumClusters: 2,
  }));
  const evaluation = await runLockedEvaluation(
    {
      schemaVersion: 1,
      evaluationVersion: "workflow_evaluation_v1",
      seed: 701107,
      actorGroups: ["workflow_locked_group"],
      lock,
      calibration,
      requiredSegments: ["native", "simulated_scanned", "simulated_mixed"],
      documents: lockedDocs.map((doc) => ({
        sourceId: doc.id,
        sourceHash: doc.sourceHash,
        segmentId: doc.cohort,
      })),
      policies,
      sampleJustificationReference: null,
    },
    ledger,
    {
      currentPartitionInput: () => fixture.partitionInput,
      authorizeCalibration: (binding) =>
        binding.payloadHash === calibrationPayloadHash &&
        binding.proposalHash === calibration.proposalHash &&
        binding.lockHash === lock.lockHash,
    },
  );
  const pilot = await operationalPilot(
    fixture,
    analyses,
    lock.lockHash,
    lock.annotationEvidenceHash,
  );
  const payloadHash = hashLockedEvaluationReport(evaluation);
  if (!payloadHash || !evaluation.evaluationHash || !evaluation.calibrationHash)
    throw new Error("CLAIM_REPORT_UNAVAILABLE");
  const card = {
    schemaVersion: 1,
    version: "workflow-evidence/1.0.0",
    previousVersion: "workflow-evidence/0.9.0",
    kind: "evidence",
    claim: "Regression-tested",
    scope: {
      domain: "software_engineering",
      language: "en",
      locale: "IN",
      segments: ["native", "simulated_scanned", "simulated_mixed"],
    },
    bindings: {
      sourceHash: fixture.manifestHash,
      lockHash: lock.lockHash,
      reportHash: evaluation.evaluationHash,
      policyHash: evaluation.calibrationHash,
      reportPayloadHash: payloadHash,
    },
    execution: {
      reference: "workflow_actual_execution",
      artifactHash: digest(JSON.stringify(cases)),
    },
    review: {
      reference: "workflow_review_pending",
      artifactHash: digest("Pending exact post-run AI technical review"),
      reviewerKind: "ai",
      independent: false,
    },
    sampleJustification: null,
    vendor: null,
    outcomeStudy: null,
    limitations: [
      "synthetic_controlled_scope",
      "underpowered_withheld_results",
      "technical_review_pending",
    ],
    createdAt: WORKFLOW_AS_OF,
    expiresAt: "2026-12-01T00:00:00Z",
    monitorLimits: {
      maximumSignalAgeMs: 60_000,
      complaintRate: 0.1,
      correctionRate: 0.5,
      latencyMs: 10_000,
      costUsd: 1,
      fairnessDisparity: 0,
      errorRate: 0,
    },
  };
  const cardHash = hashEvaluationClaimCard(card);
  const authority = {
    authorize: (binding: {
      kind: string;
      reference: string;
      artifactHash: string;
      cardHash: string;
      reportPayloadHash: string;
    }) =>
      binding.kind === "regression_execution" &&
      binding.reference === card.execution.reference &&
      binding.artifactHash === card.execution.artifactHash &&
      binding.cardHash === cardHash &&
      binding.reportPayloadHash === payloadHash,
  };
  const regressionClaim = assessEvaluationClaim(
    card,
    evaluation,
    WORKFLOW_AS_OF,
    authority,
  );
  const higherClaims = EVALUATION_CLAIMS.slice(1).map((claim) => ({
    claim,
    assessment: assessEvaluationClaim(
      { ...card, claim },
      evaluation,
      WORKFLOW_AS_OF,
      authority,
    ),
  }));
  // No complaint/fairness/compute telemetry has been measured. Missing signals stop,
  // rather than inventing zeros that would allow a continued claim.
  const monitor = monitorEvaluationClaim(card, WORKFLOW_AS_OF, {
    readSignals: () => null,
  });
  const claims = {
    card,
    regression: regressionClaim,
    higher: higherClaims,
    monitor,
    actualTechnicalReviewRegistered: false,
  };
  const checks = {
    corpusAdmitted: corpus.admittedCount === fixture.documents.length,
    annotationEngineering:
      annotation.engineeringReady &&
      annotation.evidenceTier === "synthetic_engineering",
    lockEngineering: lock.evidenceTier === "synthetic_engineering",
    calibrationProposed:
      calibration.proposalReady && !calibration.productionAdoptionAllowed,
    calibrationNeverReadLockedLabels: labelReads
      .filter((read) => read.purpose === "calibration")
      .every((read) =>
        read.ids.every(
          (id) =>
            fixture.documents.find((doc) => doc.id === id)?.partition !==
            "locked_test",
        ),
      ),
    lockedCalibrationDeniedBeforeReader:
      forbidden.status === "rejected" && forbiddenReaderCalls === 0,
    lockedActualRows:
      cases.length === lockedDocs.length &&
      evaluation.measuredDocumentCount === lockedDocs.length,
    everySourceUnchanged: fixture.documents.every(
      (doc) => digest(doc.bytes) === doc.sourceHash,
    ),
    noAuthoritativeScore: [...analyses.values()].every(
      (analysis) => analysis.unpublished,
    ),
    unchangedProductionPolicy:
      JSON.stringify(getDraftScorePolicy()) === policyBefore,
    pilotControls: Object.values(pilot.checks).every(Boolean),
    claimsFailClosed:
      regressionClaim.status === "blocked" &&
      higherClaims.every((item) => item.assessment.status !== "eligible") &&
      monitor.action === "stop_and_rollback" &&
      monitor.activationAllowed === false,
  };
  return {
    schemaVersion: 1,
    status: Object.values(checks).every(Boolean)
      ? "engineering_pass"
      : "engineering_failure",
    evidenceTier: "synthetic_engineering",
    manifestHash: fixture.manifestHash,
    documentCount: fixture.documents.length,
    commonSerializer: fixture.documents[0].serializer,
    annotation,
    lockHash: lock.lockHash,
    calibration,
    lockedEvaluation: evaluation,
    cases,
    pilot,
    claims,
    engineeringChecksPassed: Object.values(checks).every(Boolean),
    checks,
    providerRequests: 0,
    providerCostUsd: 0,
    computeCostUsd: null,
    representativeReady: false,
    releaseReady: false,
    limitations: [
      "Three authored composition families share one serializer; not representative independence",
      "Empty-page controls simulate missing text layers, not actual scans or OCR accuracy",
      "Known-source AI-assisted labels are not independent human annotations",
      "Offline toy rubric proposals do not alter or validate the published score",
      "Unmeasured render/fairness/compute-cost slots remain null and fail numeric gates",
      "Structural accessibility observations do not certify assistive-technology usability",
      "Pilot roles, notices and retention use local simulated adapters; no external vendor or recruiter pilot",
    ],
  };
}

const entry = process.argv.includes("--run-local-evaluation");
if (entry) {
  if (
    process.env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic" ||
    process.env.AI_ENABLED !== "false" ||
    process.argv.slice(2).some((arg) => arg !== "--run-local-evaluation")
  ) {
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        status: "rejected",
        reason: "LOCAL_PRIVATE_MODE_REQUIRED",
      }) + "\n",
    );
    process.exitCode = 1;
  } else {
    void runEvaluationWorkflow()
      .then((report) => {
        process.stdout.write(JSON.stringify(report) + "\n");
        process.exitCode = report.status === "engineering_pass" ? 0 : 1;
      })
      .catch(() => {
        process.stdout.write(
          JSON.stringify({
            schemaVersion: 1,
            status: "failed",
            reason: "WORKFLOW_FAILED",
          }) + "\n",
        );
        process.exitCode = 1;
      });
  }
}
