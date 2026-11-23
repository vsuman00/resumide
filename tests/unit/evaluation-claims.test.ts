import { describe, expect, it } from "vitest";
import { createEvaluationPartitionLock } from "../../app/lib/server/evaluation-partitions";
import { proposeEvaluationCalibration } from "../../app/lib/server/evaluation-calibration";
import { ScoreDimensionId } from "../../app/lib/server/score-v2-contract";
import {
  EVALUATION_METRICS,
  hashEvaluationCalibration,
  runLockedEvaluation,
  type LockedEvaluationContext,
} from "../../app/lib/server/evaluation-runner";
import {
  EVALUATION_CLAIMS,
  assessEvaluationClaim,
  hashEvaluationClaimCard,
  hashLockedEvaluationReport,
  monitorEvaluationClaim,
  type EvaluationClaimAuthority,
} from "../../app/lib/server/evaluation-claims";

// Contract fixtures execute the actual upstream pipeline; no real reviewers, corpus or pilot occurred.
const digest = (char: string) => char.repeat(64);
function fixture() {
  const records = (
    [
      "development",
      "calibration",
      "locked_test",
      "locked_test",
      "locked_test",
      "locked_test",
    ] as const
  ).map((partition, index) => ({
    id: `source_000${index + 1}`,
    contentHash: digest(["b", "c", "d", "e", "f", "1"][index]),
    partition,
    clusters: {
      person: [`person_000${index}`],
      employer: { status: "known", ids: [`employer_000${index}`] },
      template: [`template_000${index}`],
      sourceFamily: [`family_000${index}`],
      nearDuplicate: [`cluster_000${index}`],
    },
  }));
  return {
    schemaVersion: 1,
    corpusVersion: "synthetic_corpus_v1",
    accessGroups: {
      development: ["development_group"],
      calibration: ["calibration_group"],
      locked_test: ["locked_test_group"],
    },
    records,
    annotationEvidence: {
      schemaVersion: 1,
      provenance: "synthetic",
      handbookHash: digest("a"),
      annotators: ["annotator_01", "annotator_02"].map((id) => ({
        id,
        kind: "human",
        trainingHandbookHash: digest("a"),
        independent: true,
        blindedToOtherLabels: true,
        blindedToModelOutput: true,
      })),
      adjudicator: {
        id: "adjudicator_01",
        kind: "human",
        trainingHandbookHash: digest("a"),
        blindedToModelOutput: true,
        blindedToAnnotatorIdentity: true,
      },
      declaredFamilies: ["critical_fields"],
      units: records.flatMap((record, index) =>
        [0, 1].map((category) => ({
          id: `unit_000${index}_${category}`,
          sourceId: record.id,
          sourceHash: record.contentHash,
          family: "critical_fields",
          critical: true,
          submissions: ["annotator_01", "annotator_02"].map(
            (annotatorId, rater) => ({
              id: `submission_${index}_${category}_${rater}`,
              annotatorId,
              labelHash: digest(category === 0 ? "e" : "f"),
              handbookHash: digest("a"),
              sourceHash: record.contentHash,
              submittedAt: "2026-11-07T00:00:00Z",
            }),
          ),
        })),
      ),
    },
  };
}

async function setup(representative = false) {
  const manifest = fixture();
  if (representative) manifest.annotationEvidence.provenance = "representative";
  const authority = representative
    ? {
        authorizeSource: () => true,
        authorizeReviewer: () => true,
        authorizePartitionManifest: () => true,
        authorizeCalibration: () => true,
      }
    : undefined;
  const lock = createEvaluationPartitionLock(manifest, authority).lock;
  if (!lock) throw new Error("Synthetic lock failed");
  const calibration = await proposeEvaluationCalibration(
    {
      schemaVersion: 1,
      proposalVersion: "proposal_0001",
      previousPolicyVersion: "previous_policy_0001",
      rationaleReference: "rationale_0001",
      partition: "calibration",
      actorGroups: ["calibration_group"],
      lock,
      currentPartitionInput: manifest,
      candidates: ScoreDimensionId.options.map((dimension) => ({
        version: "candidate_good",
        dimension,
        weights: [{ featureId: "signal_0001", weight: 1 }],
        minimumCoverage: 1,
        threshold: 70,
      })),
    },
    () =>
      ScoreDimensionId.options.map((dimension) => ({
        sourceId: "source_0002",
        sourceHash: digest("c"),
        dimension,
        features: [{ featureId: "signal_0001", credit: 0.8 }],
        referenceScore: 80,
        referencePositive: true,
        state: "evaluated",
      })),
    authority,
  );
  expect(calibration.status).toBe("proposed");
  const calibrationHash = hashEvaluationCalibration(calibration);
  const records = lock.records.filter(
    (record) => record.partition === "locked_test",
  );
  const input = {
    schemaVersion: 1,
    evaluationVersion: "evaluation_0001",
    seed: 7,
    actorGroups: ["locked_test_group"],
    lock,
    calibration,
    requiredSegments: ["native"],
    documents: records.map((record) => ({
      sourceId: record.id,
      sourceHash: record.contentHash,
      segmentId: "native",
    })),
    policies: EVALUATION_METRICS.map((id) => ({
      id,
      kind:
        id === "safe_failure"
          ? "exact_zero"
          : id === "latency" || id === "cost"
            ? "mean_upper"
            : "success",
      threshold:
        id === "safe_failure" ? 0 : id === "latency" || id === "cost" ? 10 : 0,
      minimumClusters: 2,
    })),
    sampleJustificationReference: null as string | null,
  };
  const rows = records.map((record, index) => ({
    sourceId: record.id,
    sourceHash: record.contentHash,
    segmentId: "native",
    values: Object.fromEntries(
      EVALUATION_METRICS.map((metric) => [
        metric,
        metric === "safe_failure" ? 0 : [0, 0.25, 0.5, 1][index],
      ]),
    ),
  }));
  const context: LockedEvaluationContext = {
    currentPartitionInput: () => manifest,
    partitionAuthority: authority,
    authorizeCalibration: (binding) =>
      binding.payloadHash === calibrationHash &&
      binding.lockHash === lock.lockHash,
  };
  return { input, rows, context, manifest };
}

const clock = "2026-11-07T12:00:00Z";
const receipt = (reference: string) => ({
  reference,
  artifactHash: digest("8"),
});
async function claimFixture(representative = false) {
  const pipeline = await setup(representative);
  if (representative) {
    pipeline.input.sampleJustificationReference = "sample_justification";
    pipeline.context.authorizeRepresentativeEvaluation = () => true;
  }
  const report = await runLockedEvaluation(
    pipeline.input,
    () => pipeline.rows,
    pipeline.context,
  );
  const card = {
    schemaVersion: 1,
    version: "evidence-card/1.0.0",
    previousVersion: "evidence-card/0.9.0",
    kind: "evidence",
    claim: "Regression-tested",
    scope: {
      domain: "software_engineering",
      language: "en",
      locale: "IN",
      segments: ["native"],
    },
    bindings: {
      sourceHash: digest("9"),
      lockHash: report.lockHash!,
      reportHash: report.evaluationHash!,
      policyHash: report.calibrationHash!,
      reportPayloadHash: hashLockedEvaluationReport(report)!,
    },
    execution: receipt("execution_0001"),
    review: {
      ...receipt("review_0001"),
      reviewerKind: representative ? "human" : "ai",
      independent: representative,
    },
    sampleJustification: receipt("sample_justification"),
    vendor: {
      name: "Fictional unit vendor",
      version: "fixture/1.0",
      configurationHash: digest("7"),
      evidence: receipt("vendor_observation"),
    },
    outcomeStudy: receipt("outcome_study_0001"),
    limitations: ["limit_synthetic_scope"],
    createdAt: "2026-11-07T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    monitorLimits: {
      maximumSignalAgeMs: 60000,
      complaintRate: 0.1,
      correctionRate: 0.5,
      latencyMs: 1000,
      costUsd: 10,
      fairnessDisparity: 0.1,
      errorRate: 0.05,
    },
  };
  const authority: EvaluationClaimAuthority = {
    authorize: (binding) =>
      binding.reportPayloadHash === hashLockedEvaluationReport(report) &&
      binding.lockHash === report.lockHash &&
      binding.policyHash === report.calibrationHash &&
      binding.cardHash === hashEvaluationClaimCard(card),
  };
  return { card, report, authority, pipeline };
}
function signals(card: Awaited<ReturnType<typeof claimFixture>>["card"]) {
  return {
    ...card.bindings,
    recordedAt: clock,
    revoked: false,
    failedEvaluation: false,
    complaintRate: 0,
    correctionRate: 0,
    latencyMs: 1,
    costUsd: 0,
    fairnessDisparity: 0,
    errorRate: 0,
  };
}

describe("versioned evidence cards and staged claim controls", () => {
  it("uses the exact five specification labels and only regression scope for synthetic evidence", async () => {
    expect(EVALUATION_CLAIMS).toEqual([
      "Regression-tested",
      "Corpus-validated",
      "Domain-validated",
      "Vendor-observed",
      "Outcome-calibrated",
    ]);
    const { card, report, authority } = await claimFixture();
    expect(report.status).toBe("assessed");
    const result = assessEvaluationClaim(card, report, clock, authority);
    expect(result.status).toBe("eligible");
    expect(result.engineeringReady).toBe(true);
    expect(result.higherClaimEligible).toBe(false);
    expect(result.activationAllowed).toBe(false);
    for (const label of EVALUATION_CLAIMS.slice(1)) {
      card.claim = label;
      expect(
        assessEvaluationClaim(card, report, clock, authority).reasons,
      ).toContain("SYNTHETIC_CLAIM_LIMIT");
    }
  });

  it("does not turn low-power evaluation into a failed regression claim or higher validity", async () => {
    const { card, pipeline } = await claimFixture();
    pipeline.input.policies.forEach((p) => {
      p.minimumClusters = 100;
    });
    const report = await runLockedEvaluation(
      pipeline.input,
      () => pipeline.rows,
      pipeline.context,
    );
    expect(report.engineeringReady).toBe(false);
    card.bindings.reportHash = report.evaluationHash!;
    card.bindings.reportPayloadHash = hashLockedEvaluationReport(report)!;
    const authority: EvaluationClaimAuthority = { authorize: () => true };
    expect(assessEvaluationClaim(card, report, clock, authority).status).toBe(
      "eligible",
    );
    card.claim = "Corpus-validated";
    card.review.reviewerKind = "human";
    card.review.independent = true;
    expect(
      assessEvaluationClaim(card, report, clock, authority).reasons,
    ).toContain("SEGMENT_GATES_NOT_PASSED");
  });

  it("requires trusted exact execution and review bindings, never input readiness flags", async () => {
    const { card, report } = await claimFixture();
    expect(assessEvaluationClaim(card, report, clock).status).toBe("blocked");
    expect(
      assessEvaluationClaim(card, report, clock, { authorize: true } as never)
        .status,
    ).toBe("blocked");
    const denied = assessEvaluationClaim(card, report, clock, {
      authorize: () => {
        throw Error("PRIVATE_AUTHORITY_CANARY");
      },
    });
    expect(JSON.stringify(denied)).not.toContain("PRIVATE_AUTHORITY_CANARY");
    const payloadHash = hashLockedEvaluationReport(report);
    const authority: EvaluationClaimAuthority = {
      authorize: (binding) => binding.reportPayloadHash === payloadHash,
    };
    const changed = structuredClone(report);
    changed.measuredDocumentCount++;
    card.bindings.reportPayloadHash = hashLockedEvaluationReport(changed)!;
    expect(
      assessEvaluationClaim(card, changed, clock, authority).reasons,
    ).toContain("EXECUTION_NOT_AUTHORIZED");
  });

  it("supports each future higher claim through actual upstream representative gates plus reviewed context", async () => {
    const { card, report, authority } = await claimFixture(true);
    expect(report.representativeReady).toBe(true);
    for (const label of EVALUATION_CLAIMS.slice(1)) {
      card.claim = label;
      const result = assessEvaluationClaim(card, report, clock, authority);
      expect(result.status).toBe("eligible");
      expect(result.higherClaimEligible).toBe(true);
      expect(result.activationAllowed).toBe(false);
    }
  });

  it("requires all segment/metric gates, sample justification and independent human evidence for higher claims", async () => {
    const { card, report } = await claimFixture(true);
    card.claim = "Domain-validated";
    const authority: EvaluationClaimAuthority = { authorize: () => true };
    card.scope.segments.push("scanned");
    expect(
      assessEvaluationClaim(card, report, clock, authority).reasons,
    ).toContain("SEGMENT_GATES_NOT_PASSED");
    card.scope.segments.pop();
    card.review.reviewerKind = "ai";
    expect(
      assessEvaluationClaim(card, report, clock, authority).reasons,
    ).toContain("REVIEW_NOT_AUTHORIZED");
    card.review.reviewerKind = "human";
    expect(
      assessEvaluationClaim(
        { ...card, sampleJustification: null },
        report,
        clock,
        authority,
      ).reasons,
    ).toContain("SAMPLE_JUSTIFICATION_REQUIRED");
    const failed = structuredClone(report);
    failed.statistics!.cells.find(
      (c) => c.segmentId !== null,
    )!.numericGatePassed = false;
    card.bindings.reportPayloadHash = hashLockedEvaluationReport(failed)!;
    expect(
      assessEvaluationClaim(card, failed, clock, authority).reasons,
    ).toContain("SEGMENT_GATES_NOT_PASSED");
  });

  it("requires named vendor and prospective-study receipts at their precise levels", async () => {
    const { card, report } = await claimFixture(true);
    const authority: EvaluationClaimAuthority = { authorize: () => true };
    card.claim = "Vendor-observed";
    expect(
      assessEvaluationClaim({ ...card, vendor: null }, report, clock, authority)
        .reasons,
    ).toContain("VENDOR_EVIDENCE_REQUIRED");
    card.claim = "Outcome-calibrated";
    expect(
      assessEvaluationClaim(
        { ...card, outcomeStudy: null },
        report,
        clock,
        authority,
      ).reasons,
    ).toContain("OUTCOME_STUDY_REQUIRED");
  });

  it("denies stale hashes, expired cards, invalid versions and unsupported fields safely", async () => {
    const { card, report, authority } = await claimFixture();
    expect(
      assessEvaluationClaim(
        { ...card, bindings: { ...card.bindings, policyHash: digest("6") } },
        report,
        clock,
        authority,
      ).reasons,
    ).toContain("REPORT_BINDING_DRIFT");
    expect(
      assessEvaluationClaim(card, report, "2027-01-01T00:00:00Z", authority)
        .reasons,
    ).toContain("EXPIRED_CARD");
    expect(
      assessEvaluationClaim(
        { ...card, version: card.previousVersion },
        report,
        clock,
        authority,
      ).reasons,
    ).toContain("INVALID_VERSION");
    const invalid = assessEvaluationClaim(
      { ...card, rawClaim: "PRIVATE_CARD_CANARY" },
      report,
      clock,
      authority,
    );
    expect(invalid.reasons).toEqual(["INVALID_CARD"]);
    expect(JSON.stringify(invalid)).not.toContain("PRIVATE_CARD_CANARY");
  });

  it("continues only on fresh complete trusted monitor signals and proposes no actual activation", async () => {
    const { card } = await claimFixture();
    const result = monitorEvaluationClaim(card, clock, {
      readSignals: (cardHash) => {
        expect(cardHash).toBe(hashEvaluationClaimCard(card));
        return signals(card);
      },
    });
    expect(result).toMatchObject({
      action: "continue",
      rollbackVersion: card.previousVersion,
      reasons: [],
      activationAllowed: false,
    });
  });

  it("stops and rolls back on every required monitor breach, failure, revocation and binding drift", async () => {
    const { card } = await claimFixture();
    for (const metric of [
      "complaintRate",
      "correctionRate",
      "latencyMs",
      "costUsd",
      "fairnessDisparity",
      "errorRate",
    ] as const) {
      const measured = signals(card);
      measured[metric] = card.monitorLimits[metric] + 0.01;
      const result = monitorEvaluationClaim(card, clock, {
        readSignals: () => measured,
      });
      expect(result.action).toBe("stop_and_rollback");
      expect(result.reasons).toContain("THRESHOLD_BREACH");
      expect(result.rollbackVersion).toBe(card.previousVersion);
    }
    for (const flag of ["revoked", "failedEvaluation"] as const) {
      const measured = signals(card);
      measured[flag] = true;
      expect(
        monitorEvaluationClaim(card, clock, { readSignals: () => measured })
          .action,
      ).toBe("stop_and_rollback");
    }
    const drift = { ...signals(card), sourceHash: digest("6") };
    expect(
      monitorEvaluationClaim(card, clock, { readSignals: () => drift }).reasons,
    ).toContain("BINDING_DRIFT");
  });

  it("fails closed for absent, incomplete, malformed, stale, future or throwing signals", async () => {
    const { card } = await claimFixture();
    expect(monitorEvaluationClaim(card, clock).reasons).toContain(
      "MISSING_SIGNALS",
    );
    for (const field of [
      "complaintRate",
      "correctionRate",
      "latencyMs",
      "costUsd",
      "fairnessDisparity",
      "errorRate",
    ]) {
      const incomplete: Record<string, unknown> = signals(card);
      delete incomplete[field];
      expect(
        monitorEvaluationClaim(card, clock, { readSignals: () => incomplete })
          .reasons,
      ).toContain("MISSING_SIGNALS");
    }
    for (const recordedAt of ["2026-11-07T10:00:00Z", "2026-11-07T13:00:00Z"]) {
      expect(
        monitorEvaluationClaim(card, clock, {
          readSignals: () => ({ ...signals(card), recordedAt }),
        }).reasons,
      ).toContain("STALE_SIGNALS");
    }
    expect(
      monitorEvaluationClaim(card, clock, {
        readSignals: () => ({ ...signals(card), costUsd: Infinity }),
      }).reasons,
    ).toContain("MISSING_SIGNALS");
    const failure = monitorEvaluationClaim(card, clock, {
      readSignals: () => {
        throw Error("PRIVATE_MONITOR_ERROR");
      },
    });
    expect(failure.action).toBe("stop_and_rollback");
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_MONITOR_ERROR");
    expect(
      monitorEvaluationClaim({ ...card, monitorLimits: {} }, clock).reasons,
    ).toEqual(["INVALID_CARD"]);
  });
});
