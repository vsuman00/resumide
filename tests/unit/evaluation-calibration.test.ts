import { describe, expect, it, vi } from "vitest";
import {
  proposeEvaluationCalibration,
  type CalibrationAuthority,
  type CalibrationObservation,
} from "../../app/lib/server/evaluation-calibration";
import { createEvaluationPartitionLock } from "../../app/lib/server/evaluation-partitions";
import {
  ScoreDimensionId,
  getDraftScorePolicy,
} from "../../app/lib/server/score-v2-contract";

const digest = (char: string) => char.repeat(64);
function fixture() {
  const records = (["development", "calibration", "locked_test"] as const).map(
    (partition, index) => ({
      id: `source_000${index + 1}`,
      contentHash: digest(["b", "c", "d"][index]),
      partition,
      clusters: {
        person: [`person_000${index}`],
        employer: { status: "known", ids: [`employer_000${index}`] },
        template: [`template_000${index}`],
        sourceFamily: [`family_000${index}`],
        nearDuplicate: [`cluster_000${index}`],
      },
    }),
  );
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

function calibration(representative = false) {
  const currentPartitionInput = fixture();
  if (representative)
    currentPartitionInput.annotationEvidence.provenance = "representative";
  const authority: CalibrationAuthority = {
    authorizeSource: () => true,
    authorizeReviewer: () => true,
    authorizePartitionManifest: () => true,
    authorizeCalibration: () => true,
  };
  const lock = createEvaluationPartitionLock(
    currentPartitionInput,
    representative ? authority : undefined,
  ).lock;
  if (!lock) throw new Error("Synthetic fixture failed to lock");
  const input = {
    schemaVersion: 1,
    proposalVersion: "proposal_0001",
    previousPolicyVersion: "previous_policy_0001",
    rationaleReference: "rationale_0001",
    partition: "calibration",
    actorGroups: ["calibration_group"],
    lock,
    currentPartitionInput,
    candidates: ScoreDimensionId.options.flatMap((dimension) => [
      {
        version: "candidate_good",
        dimension,
        weights: [
          { featureId: "signal_0001", weight: 0.8 },
          { featureId: "signal_0002", weight: 0.2 },
        ],
        minimumCoverage: 1,
        threshold: 70,
      },
      {
        version: "candidate_bad",
        dimension,
        weights: [
          { featureId: "signal_0001", weight: 0.2 },
          { featureId: "signal_0002", weight: 0.8 },
        ],
        minimumCoverage: 0,
        threshold: 70,
      },
    ]),
  };
  const rows: CalibrationObservation[] = ScoreDimensionId.options.map(
    (dimension) => ({
      sourceId: "source_0002",
      sourceHash: digest("c"),
      dimension,
      features: [
        { featureId: "signal_0001", credit: 1 },
        { featureId: "signal_0002", credit: 0 },
      ],
      referenceScore: 80,
      referencePositive: true,
      state: "evaluated",
    }),
  );
  return { input, rows, authority };
}

describe("offline calibration proposals without locked-label access", () => {
  it("selects actual dimension weights and reports sensitivity and rollback without policy adoption", async () => {
    const { input, rows } = calibration();
    const draft = getDraftScorePolicy();
    input.previousPolicyVersion = draft.id;
    const before = structuredClone(input);
    const reader = vi.fn(() => rows);
    const report = await proposeEvaluationCalibration(input, reader);
    expect(reader).toHaveBeenCalledExactlyOnceWith(["source_0002"]);
    expect(report.status).toBe("proposed");
    expect(report.proposalReady).toBe(true);
    expect(report.selectedPolicies).toHaveLength(3);
    expect(
      report.selectedPolicies.every((p) => p.version === "candidate_good"),
    ).toBe(true);
    expect(
      report.candidateResults
        .filter((r) => r.candidate.version === "candidate_good")
        .every((r) => r.penalizedLoss === 0),
    ).toBe(true);
    expect(
      report.candidateResults
        .filter((r) => r.candidate.version === "candidate_bad")
        .every(
          (r) =>
            Math.abs(r.lossDeltaFromBest - 0.8) < 1e-12 &&
            r.rejectionReason === "HIGHER_LOSS",
        ),
    ).toBe(true);
    expect(report.rollbackPolicyVersion).toBe(draft.id);
    expect(report.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.observationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.lockHash).toBe(input.lock.lockHash);
    expect(report.evidenceTier).toBe("synthetic_engineering");
    expect(report.representativeCalibrationEligible).toBe(false);
    expect(report.productionAdoptionAllowed).toBe(false);
    expect(input).toEqual(before);
    expect(getDraftScorePolicy()).toEqual(draft);
    expect(JSON.stringify(report)).not.toContain("referenceScore");
  });

  it("fits threshold alternatives against the supplied classification reference", async () => {
    const { input, rows } = calibration();
    input.candidates
      .filter((c) => c.version === "candidate_bad")
      .forEach((c) => {
        c.weights[0].weight = 0.8;
        c.weights[1].weight = 0.2;
        c.threshold = 90;
      });
    const report = await proposeEvaluationCalibration(input, () => rows);
    expect(report.selectedPolicies.every((p) => p.threshold === 70)).toBe(true);
    expect(
      report.candidateResults
        .filter((r) => r.candidate.threshold === 90)
        .every((r) => r.penalizedLoss === 0.5),
    ).toBe(true);
  });

  it("never calls the reader for calibration access to locked test, denied groups or lock drift", async () => {
    for (const mode of ["locked", "group", "drift"]) {
      const { input, rows } = calibration();
      const reader = vi.fn(() => rows);
      if (mode === "locked") input.partition = "locked_test";
      if (mode === "group") input.actorGroups = ["unapproved_group"];
      if (mode === "drift")
        input.currentPartitionInput.records[0].contentHash = digest("f");
      const report = await proposeEvaluationCalibration(input, reader);
      expect(report.status).toBe("rejected");
      expect(reader).not.toHaveBeenCalled();
      if (mode === "locked")
        expect(report.reason).toBe("LOCKED_TEST_FORBIDDEN");
    }
  });

  it("rejects lock drift during asynchronous label loading before fitting", async () => {
    const { input, rows } = calibration();
    const report = await proposeEvaluationCalibration(input, () => {
      input.currentPartitionInput.records[0].contentHash = digest("f");
      return rows;
    });
    expect(report.status).toBe("rejected");
    expect(report.candidateResults).toEqual([]);
  });

  it("withholds missing high-weight credit even at a zero coverage threshold", async () => {
    const { input, rows } = calibration();
    rows.forEach((r) => {
      r.features[0].credit = null;
    });
    const report = await proposeEvaluationCalibration(input, () => rows);
    expect(report.status).toBe("insufficient");
    expect(report.proposalReady).toBe(false);
    expect(
      report.candidateResults.every(
        (r) =>
          r.withheldCount === 1 &&
          r.penalizedLoss === 1 &&
          r.evaluatedCount === 0,
      ),
    ).toBe(true);
    rows.forEach((r) => {
      r.features[0].credit = 0;
      r.referenceScore = 0;
      r.referencePositive = false;
    });
    const knownZero = await proposeEvaluationCalibration(input, () => rows);
    expect(knownZero.proposalReady).toBe(true);
    expect(
      knownZero.candidateResults.every(
        (r) => r.evaluatedCount === 1 && r.penalizedLoss === 0,
      ),
    ).toBe(true);
  });

  it("penalizes missing observations, references, declared features and withheld states", async () => {
    for (const mode of ["row", "reference", "feature", "withheld"]) {
      const { input, rows } = calibration();
      if (mode === "row") rows.length = 0;
      if (mode === "reference")
        rows.forEach((r) => {
          r.referenceScore = null;
        });
      if (mode === "feature")
        rows.forEach((r) => {
          r.features.pop();
        });
      if (mode === "withheld")
        rows.forEach((r) => {
          r.state = "withheld";
        });
      const report = await proposeEvaluationCalibration(input, () => rows);
      expect(report.status).toBe("insufficient");
      expect(
        report.candidateResults.every(
          (r) =>
            r.expectedCount === 1 &&
            r.evaluatedCount === 0 &&
            r.penalizedLoss === 1,
        ),
      ).toBe(true);
    }
  });

  it("rejects duplicate/foreign/hash-drift rows and raw label fields without echoing data", async () => {
    for (const mode of ["duplicate", "foreign", "hash", "raw"]) {
      const { input, rows } = calibration();
      if (mode === "duplicate") rows.push(structuredClone(rows[0]));
      if (mode === "foreign") rows[0].sourceId = "source_0003";
      if (mode === "hash") rows[0].sourceHash = digest("e");
      if (mode === "raw")
        Object.assign(rows[0], { rawLabel: "private-not-returned" });
      const report = await proposeEvaluationCalibration(input, () => rows);
      expect(report.status).toBe("rejected");
      expect(report.candidateResults).toEqual([]);
      expect(JSON.stringify(report)).not.toContain("private-not-returned");
    }
  });

  it("forbids dropping a declared feature or duplicating candidates to evade evidence", async () => {
    for (const mode of ["drop", "duplicate", "missing_dimension"]) {
      const { input, rows } = calibration();
      const reader = vi.fn(() => rows);
      if (mode === "drop") input.candidates[0].weights.pop();
      if (mode === "duplicate")
        input.candidates.push(structuredClone(input.candidates[0]));
      if (mode === "missing_dimension")
        input.candidates = input.candidates.filter(
          (c) => c.dimension !== "job_alignment_preferred",
        );
      expect((await proposeEvaluationCalibration(input, reader)).reason).toBe(
        "INVALID_CANDIDATES",
      );
      expect(reader).not.toHaveBeenCalled();
    }
  });

  it("is deterministic under candidate, feature and observation reordering", async () => {
    const { input, rows } = calibration();
    const first = await proposeEvaluationCalibration(input, () => rows);
    input.candidates.reverse();
    input.candidates.forEach((c) => c.weights.reverse());
    rows.reverse();
    rows.forEach((r) => r.features.reverse());
    expect(await proposeEvaluationCalibration(input, () => rows)).toEqual(
      first,
    );
  });

  it("supports development-only fitting and keeps source binding strict", async () => {
    const { input, rows } = calibration();
    input.partition = "development";
    input.actorGroups = ["development_group"];
    rows.forEach((r) => {
      r.sourceId = "source_0001";
      r.sourceHash = digest("b");
    });
    expect(
      (await proposeEvaluationCalibration(input, () => rows)).proposalReady,
    ).toBe(true);
  });

  it("allows future representative calibration only with exact trusted receipt authorization", async () => {
    const { input, rows, authority } = calibration(true);
    let binding: unknown;
    const report = await proposeEvaluationCalibration(input, () => rows, {
      ...authority,
      authorizeCalibration: (value) => {
        binding = value;
        return true;
      },
    });
    expect(report.proposalReady).toBe(true);
    expect(report.representativeCalibrationEligible).toBe(true);
    expect(binding).toEqual({
      proposalVersion: input.proposalVersion,
      proposalHash: report.proposalHash,
      inputHash: report.inputHash,
      lockHash: input.lock.lockHash,
      previousPolicyVersion: input.previousPolicyVersion,
    });
    expect(report.productionAdoptionAllowed).toBe(false);
    expect(
      (
        await proposeEvaluationCalibration(input, () => rows, {
          ...authority,
          authorizeCalibration: () => false,
        })
      ).representativeCalibrationEligible,
    ).toBe(false);
    expect((await proposeEvaluationCalibration(input, () => rows)).status).toBe(
      "rejected",
    );
  });

  it("returns fixed reader failures, never raw exceptions", async () => {
    const { input } = calibration();
    const report = await proposeEvaluationCalibration(input, () => {
      throw new Error("secret-reader-details");
    });
    expect(report.reason).toBe("READER_FAILED");
    expect(JSON.stringify(report)).not.toContain("secret-reader-details");
  });
});
