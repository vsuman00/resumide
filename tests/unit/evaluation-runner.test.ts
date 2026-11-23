import { describe, expect, it, vi } from "vitest";
import { createEvaluationPartitionLock } from "../../app/lib/server/evaluation-partitions";
import { proposeEvaluationCalibration } from "../../app/lib/server/evaluation-calibration";
import { ScoreDimensionId } from "../../app/lib/server/score-v2-contract";
import {
  EVALUATION_METRICS,
  hashEvaluationCalibration,
  runLockedEvaluation,
  type LockedEvaluationContext,
} from "../../app/lib/server/evaluation-runner";
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

describe("locked end-to-end measured evaluation", () => {
  it("uses actual locked API and actual calibration proposal, measures all ten metrics and retains synthetic tier", async () => {
    const { input, rows, context } = await setup();
    const reader = vi.fn(() => rows);
    const result = await runLockedEvaluation(input, reader, context);
    expect(reader).toHaveBeenCalledExactlyOnceWith(
      input.documents.map((row) => row.sourceId),
    );
    expect(result).toMatchObject({
      status: "assessed",
      reason: null,
      evidenceTier: "synthetic_engineering",
      engineeringReady: true,
      representativeReady: false,
      releaseReady: false,
      measuredDocumentCount: 4,
    });
    expect(result.statistics?.cells).toHaveLength(20);
    expect(result.evaluationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accessAudit).toEqual({
      decision: "allowed",
      reason: null,
      recordCount: 4,
    });
    expect(JSON.stringify(result)).not.toContain("source_0003");
  });
  it("denies absent/false/throwing authority and forged calibration before reader", async () => {
    const { input, rows, context } = await setup();
    const reader = vi.fn(() => rows);
    expect((await runLockedEvaluation(input, reader)).reason).toBe(
      "INVALID_INPUT",
    );
    for (const authorizeCalibration of [
      () => false,
      () => {
        throw new Error("PRIVATE_MARKER");
      },
    ]) {
      expect(
        (
          await runLockedEvaluation(input, reader, {
            ...context,
            authorizeCalibration,
          })
        ).reason,
      ).toBe("CALIBRATION_DENIED");
    }
    const forged = structuredClone(input);
    forged.calibration.selectedPolicies[0].threshold = 99;
    expect((await runLockedEvaluation(forged, reader, context)).reason).toBe(
      "CALIBRATION_DENIED",
    );
    expect(reader).not.toHaveBeenCalled();
  });
  it("rejects wrong access group, lock/source bindings and missing configured metric before reading", async () => {
    const { input, rows, context } = await setup();
    const reader = vi.fn(() => rows);
    expect(
      (
        await runLockedEvaluation(
          { ...input, actorGroups: ["wrong_group_000"] },
          reader,
          context,
        )
      ).reason,
    ).toBe("PARTITION_DENIED");
    const drift = structuredClone(input);
    drift.documents[0].sourceHash = digest("9");
    expect((await runLockedEvaluation(drift, reader, context)).reason).toBe(
      "OBSERVATION_BINDING_MISMATCH",
    );
    const missing = structuredClone(input);
    missing.policies.pop();
    expect((await runLockedEvaluation(missing, reader, context)).reason).toBe(
      "INVALID_INPUT",
    );
    expect(reader).not.toHaveBeenCalled();
  });
  it("rechecks current lock and calibration authorization after async reads", async () => {
    const { input, rows, context, manifest } = await setup();
    const result = await runLockedEvaluation(
      input,
      async () => {
        await Promise.resolve();
        manifest.corpusVersion = "changed_corpus";
        return rows;
      },
      context,
    );
    expect(result.reason).toBe("CURRENT_BINDING_CHANGED");
    expect(result.statistics).toBe(null);
    const second = await setup();
    let active = true;
    expect(
      (
        await runLockedEvaluation(
          second.input,
          async () => {
            active = false;
            return second.rows;
          },
          { ...second.context, authorizeCalibration: () => active },
        )
      ).reason,
    ).toBe("CURRENT_BINDING_CHANGED");
  });
  it("fails closed on missing/extra/duplicate/hash/segment/metric and reader errors", async () => {
    const { input, rows, context } = await setup();
    const variants = [
      rows.slice(1),
      [...rows, rows[0]],
      rows.map((row, i) =>
        i === 0 ? { ...row, sourceHash: digest("9") } : row,
      ),
      rows.map((row, i) => (i === 0 ? { ...row, segmentId: "scanned" } : row)),
    ];
    for (const value of variants)
      expect(
        (await runLockedEvaluation(input, () => value, context)).reason,
      ).toBe("OBSERVATION_BINDING_MISMATCH");
    const missingMetric = structuredClone(rows);
    delete missingMetric[0].values.extraction;
    expect(
      (await runLockedEvaluation(input, () => missingMetric, context)).reason,
    ).toBe("INVALID_OBSERVATIONS");
    const failure = await runLockedEvaluation(
      input,
      () => {
        throw new Error("PRIVATE_MARKER");
      },
      context,
    );
    expect(failure.reason).toBe("PARTITION_DENIED");
    expect(failure.accessAudit?.reason).toBe("READER_FAILED");
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_MARKER");
  });
  it("fails aggregate readiness for any missing segment or observed safety incident", async () => {
    const { input, rows, context } = await setup();
    const missing = await runLockedEvaluation(
      { ...input, requiredSegments: ["native", "scanned"] },
      () => rows,
      context,
    );
    expect(missing.status).toBe("assessed");
    expect(missing.engineeringReady).toBe(false);
    const unsafe = structuredClone(rows);
    unsafe[0].values.safe_failure = 1;
    expect(
      (await runLockedEvaluation(input, () => unsafe, context))
        .engineeringReady,
    ).toBe(false);
  });
  it("unions overlapping declared employer/person dependencies rather than trusting ledger cluster IDs", async () => {
    const { manifest, input, rows, context } = await setup();
    manifest.records[2].clusters.employer.ids = ["same_employer"];
    manifest.records[3].clusters.employer.ids = ["same_employer"];
    manifest.records[3].clusters.person = ["same_person_000"];
    manifest.records[4].clusters.person = ["same_person_000"];
    manifest.records[4].clusters.template = ["same_template_000"];
    manifest.records[5].clusters.template = ["same_template_000"];
    const lock = createEvaluationPartitionLock(manifest).lock!;
    input.lock = lock;
    input.calibration.lockHash = lock.lockHash;
    const payloadHash = hashEvaluationCalibration(input.calibration);
    const result = await runLockedEvaluation(input, () => rows, {
      ...context,
      authorizeCalibration: (binding) => binding.payloadHash === payloadHash,
    });
    expect(result.statistics?.cells.every((cell) => cell.clusters === 1)).toBe(
      true,
    );
    expect(result.engineeringReady).toBe(false);
  });
  it("keeps explicit unmeasured cost/render slots without inventing zero or passing incomplete gates", async () => {
    const { input, rows, context } = await setup();
    const partial = rows.map((row, index) => ({
      ...row,
      values: {
        ...row.values,
        cost: null,
        artifact_parity: index === 0 ? null : row.values.artifact_parity,
      },
    }));
    const result = await runLockedEvaluation(input, () => partial, context);
    expect(result).toMatchObject({
      status: "assessed",
      measuredDocumentCount: 4,
      engineeringReady: false,
    });
    expect(
      result.statistics?.cells.find(
        (cell) => cell.metricId === "cost" && cell.segmentId === null,
      ),
    ).toMatchObject({
      documents: 4,
      missingMeasurements: 4,
      estimate: null,
      intervalStatus: "withheld",
    });
    expect(
      result.statistics?.cells.find(
        (cell) => cell.metricId === "extraction" && cell.segmentId === null,
      )?.intervalStatus,
    ).toBe("estimated");
  });
  it("requires separate sample authority for representative claims and never grants release", async () => {
    const { input, rows, context } = await setup(true);
    input.sampleJustificationReference = "sample_justification";
    const without = await runLockedEvaluation(input, () => rows, context);
    expect(without.engineeringReady).toBe(true);
    expect(without.representativeReady).toBe(false);
    const claim = vi.fn(() => true);
    const authorized = await runLockedEvaluation(input, () => rows, {
      ...context,
      authorizeRepresentativeEvaluation: claim,
    });
    expect(authorized.evidenceTier).toBe("independent_human");
    expect(authorized.representativeReady).toBe(true);
    expect(authorized.releaseReady).toBe(false);
    expect(claim).toHaveBeenCalledExactlyOnceWith({
      evaluationHash: authorized.evaluationHash,
      lockHash: authorized.lockHash,
      calibrationHash: authorized.calibrationHash,
      sampleJustificationReference: "sample_justification",
    });
    const denied = await runLockedEvaluation(input, () => rows, {
      ...context,
      authorizeRepresentativeEvaluation: () => {
        throw new Error("PRIVATE_MARKER");
      },
    });
    expect(denied.representativeReady).toBe(false);
  });
  it("does not promote synthetic results even when an optional claim callback returns true", async () => {
    const { input, rows, context } = await setup();
    input.sampleJustificationReference = "sample_justification";
    const claim = vi.fn(() => true);
    const result = await runLockedEvaluation(input, () => rows, {
      ...context,
      authorizeRepresentativeEvaluation: claim,
    });
    expect(result.engineeringReady).toBe(true);
    expect(result.representativeReady).toBe(false);
    expect(claim).not.toHaveBeenCalled();
  });
});
