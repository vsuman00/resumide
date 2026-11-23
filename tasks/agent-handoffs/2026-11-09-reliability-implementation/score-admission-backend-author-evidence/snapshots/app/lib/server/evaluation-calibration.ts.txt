import { createHash } from "node:crypto";
import { z } from "zod";
import { ScoreDimensionId } from "./score-v2-contract";
import {
  readEvaluationPartitionLabels,
  verifyEvaluationPartitionLock,
  type PartitionAuthority,
  type PartitionReason,
} from "./evaluation-partitions";

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const candidateSchema = z.strictObject({
  version,
  dimension: ScoreDimensionId,
  weights: z
    .array(
      z.strictObject({ featureId: id, weight: z.number().positive().max(1) }),
    )
    .min(1)
    .max(16),
  minimumCoverage: z.number().min(0).max(1),
  threshold: z.number().min(0).max(100),
});
const inputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proposalVersion: version,
  previousPolicyVersion: version,
  rationaleReference: id,
  partition: z.enum(["development", "calibration", "locked_test"]),
  actorGroups: z.array(id).max(32),
  lock: z.unknown(),
  currentPartitionInput: z.unknown(),
  candidates: z.array(candidateSchema).min(3).max(48),
});
const observationSchema = z.strictObject({
  sourceId: id,
  sourceHash: sha256,
  dimension: ScoreDimensionId,
  features: z
    .array(
      z.strictObject({
        featureId: id,
        credit: z.number().min(0).max(1).nullable(),
      }),
    )
    .max(16),
  referenceScore: z.number().min(0).max(100).nullable(),
  referencePositive: z.boolean().nullable(),
  state: z.enum(["evaluated", "withheld"]),
});
const observationsSchema = z.array(observationSchema).max(12_288);
export type CalibrationAuthority = PartitionAuthority & {
  authorizeCalibration(binding: {
    proposalVersion: string;
    proposalHash: string;
    inputHash: string;
    lockHash: string;
    previousPolicyVersion: string;
  }): boolean;
};
export type CalibrationCandidate = z.infer<typeof candidateSchema>;
export type CalibrationObservation = z.infer<typeof observationSchema>;
export type CalibrationReason =
  | PartitionReason
  | "INVALID_CALIBRATION_INPUT"
  | "INVALID_CANDIDATES"
  | "INVALID_OBSERVATIONS"
  | "OBSERVATION_BINDING_MISMATCH"
  | "NO_EVALUATED_PAIRS";
type CandidateResult = {
  candidate: CalibrationCandidate;
  expectedCount: number;
  evaluatedCount: number;
  missingCount: number;
  withheldCount: number;
  missingReferenceCount: number;
  coverage: number;
  meanAbsoluteError: number | null;
  classificationErrorRate: number | null;
  penalizedLoss: number;
  lossDeltaFromBest: number;
  coverageDeltaFromBest: number;
  rejectionReason:
    | "HIGHER_LOSS"
    | "LOWER_COVERAGE"
    | "TIE_BREAK"
    | "NO_EVALUATED_PAIRS"
    | null;
};
export type CalibrationProposal = {
  schemaVersion: 1;
  status: "proposed" | "rejected" | "insufficient";
  reason: CalibrationReason | null;
  proposalVersion: string | null;
  rollbackPolicyVersion: string | null;
  rationaleReference: string | null;
  partition: "development" | "calibration" | "locked_test" | null;
  lockHash: string | null;
  inputHash: string | null;
  observationHash: string | null;
  proposalHash: string | null;
  evidenceTier: "synthetic_engineering" | "independent_human" | "unverified";
  sourceCount: number;
  proposalReady: boolean;
  representativeCalibrationEligible: boolean;
  productionAdoptionAllowed: false;
  selectedPolicies: CalibrationCandidate[];
  candidateResults: CandidateResult[];
  accessAudit: {
    decision: "allowed" | "denied";
    reason: PartitionReason | null;
    recordCount: number;
  } | null;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Offline policy proposals only: these numbers never change the AA4 scoring policy. */
export async function proposeEvaluationCalibration(
  input: unknown,
  reader: (sourceIds: readonly string[]) => unknown | Promise<unknown>,
  authority?: CalibrationAuthority,
): Promise<CalibrationProposal> {
  const report: CalibrationProposal = {
    schemaVersion: 1,
    status: "rejected",
    reason: null,
    proposalVersion: null,
    rollbackPolicyVersion: null,
    rationaleReference: null,
    partition: null,
    lockHash: null,
    inputHash: null,
    observationHash: null,
    proposalHash: null,
    evidenceTier: "unverified",
    sourceCount: 0,
    proposalReady: false,
    representativeCalibrationEligible: false,
    productionAdoptionAllowed: false,
    selectedPolicies: [],
    candidateResults: [],
    accessAudit: null,
  };
  const deny = (reason: CalibrationReason) => {
    report.reason = reason;
    return report;
  };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return deny("INVALID_CALIBRATION_INPUT");
  const data = parsed.data;
  report.proposalVersion = data.proposalVersion;
  report.rollbackPolicyVersion = data.previousPolicyVersion;
  report.rationaleReference = data.rationaleReference;
  report.partition = data.partition;
  const candidates = data.candidates
    .map((candidate) => ({
      ...candidate,
      weights: [...candidate.weights].sort((a, b) =>
        compare(a.featureId, b.featureId),
      ),
    }))
    .sort(
      (a, b) =>
        compare(a.dimension, b.dimension) || compare(a.version, b.version),
    );
  const keys = new Set<string>();
  const featureSets = new Map<string, string>();
  for (const candidate of candidates) {
    const key = `${candidate.dimension}:${candidate.version}`;
    const features = candidate.weights.map((w) => w.featureId);
    const featureKey = features.join(":");
    if (
      keys.has(key) ||
      new Set(features).size !== features.length ||
      (featureSets.has(candidate.dimension) &&
        featureSets.get(candidate.dimension) !== featureKey)
    )
      return deny("INVALID_CANDIDATES");
    keys.add(key);
    featureSets.set(candidate.dimension, featureKey);
  }
  if (featureSets.size !== ScoreDimensionId.options.length)
    return deny("INVALID_CANDIDATES");
  const read = await readEvaluationPartitionLabels(
    data.lock,
    data.currentPartitionInput,
    {
      purpose: "calibration",
      partition: data.partition,
      actorGroups: data.actorGroups,
    },
    reader,
    authority,
  );
  report.accessAudit = {
    decision: read.audit.decision,
    reason: read.audit.reason,
    recordCount: read.audit.recordCount,
  };
  if (read.status !== "read") return deny(read.audit.reason ?? "ACCESS_DENIED");
  // Recheck immutable membership after an asynchronous reader, before using any labels.
  const checked = verifyEvaluationPartitionLock(
    data.lock,
    data.currentPartitionInput,
    authority,
  );
  if (!checked.lock) return deny(checked.reason ?? "INVALID_LOCK");
  if (read.audit.lockHash !== checked.lock.lockHash) return deny("LOCK_DRIFT");
  const lock = checked.lock;
  report.lockHash = lock.lockHash;
  report.evidenceTier = lock.evidenceTier;
  const sources = lock.records.filter((r) => r.partition === data.partition);
  report.sourceCount = sources.length;
  const allowed = new Map(sources.map((r) => [r.id, r.contentHash]));
  const rows = observationsSchema.safeParse(read.value);
  if (!rows.success) return deny("INVALID_OBSERVATIONS");
  const observations = rows.data
    .map((row) => ({
      ...row,
      features: [...row.features].sort((a, b) =>
        compare(a.featureId, b.featureId),
      ),
    }))
    .sort(
      (a, b) =>
        compare(a.sourceId, b.sourceId) || compare(a.dimension, b.dimension),
    );
  const indexed = new Map<string, CalibrationObservation>();
  for (const row of observations) {
    const key = `${row.sourceId}:${row.dimension}`;
    if (allowed.get(row.sourceId) !== row.sourceHash)
      return deny("OBSERVATION_BINDING_MISMATCH");
    if (
      indexed.has(key) ||
      new Set(row.features.map((f) => f.featureId)).size !==
        row.features.length ||
      row.features.some(
        (f) =>
          !featureSets.get(row.dimension)!.split(":").includes(f.featureId),
      )
    )
      return deny("INVALID_OBSERVATIONS");
    indexed.set(key, row);
  }
  report.observationHash = digest(observations);
  report.inputHash = digest({
    schemaVersion: 1,
    proposalVersion: data.proposalVersion,
    previousPolicyVersion: data.previousPolicyVersion,
    rationaleReference: data.rationaleReference,
    partition: data.partition,
    actorGroups: [...new Set(data.actorGroups)].sort(),
    lockHash: lock.lockHash,
    candidates,
    observationHash: report.observationHash,
  });
  for (const candidate of candidates) {
    let evaluatedCount = 0,
      missingCount = 0,
      withheldCount = 0,
      missingReferenceCount = 0;
    let errors = 0,
      classificationErrors = 0;
    const totalWeight = candidate.weights.reduce((sum, w) => sum + w.weight, 0);
    for (const source of sources) {
      const row = indexed.get(`${source.id}:${candidate.dimension}`);
      if (!row) {
        missingCount++;
        continue;
      }
      if (row.referenceScore === null || row.referencePositive === null) {
        missingReferenceCount++;
        continue;
      }
      const features = new Map(
        row.features.map((f) => [f.featureId, f.credit]),
      );
      const complete = candidate.weights.every(
        (w) => features.get(w.featureId) != null,
      );
      // No not-applicable proof exists: unknown applicable credit always withholds.
      // A lower tunable coverage threshold cannot renormalize missing weight away.
      if (row.state === "withheld" || !complete) {
        withheldCount++;
        continue;
      }
      const score =
        (100 *
          candidate.weights.reduce(
            (sum, w) => sum + w.weight * features.get(w.featureId)!,
            0,
          )) /
        totalWeight;
      errors += Math.abs(score - row.referenceScore);
      classificationErrors += Number(
        score >= candidate.threshold !== row.referencePositive,
      );
      evaluatedCount++;
    }
    const expectedCount = sources.length;
    report.candidateResults.push({
      candidate,
      expectedCount,
      evaluatedCount,
      missingCount,
      withheldCount,
      missingReferenceCount,
      coverage: expectedCount ? evaluatedCount / expectedCount : 0,
      meanAbsoluteError: evaluatedCount ? errors / evaluatedCount : null,
      classificationErrorRate: evaluatedCount
        ? classificationErrors / evaluatedCount
        : null,
      // Every absent/withheld/reference-missing pair contributes worst normalized loss 1.
      penalizedLoss: expectedCount
        ? ((errors / 100 + classificationErrors) / 2 +
            expectedCount -
            evaluatedCount) /
          expectedCount
        : 1,
      lossDeltaFromBest: 0,
      coverageDeltaFromBest: 0,
      rejectionReason: null,
    });
  }
  for (const dimension of ScoreDimensionId.options) {
    const ranked = report.candidateResults
      .filter((r) => r.candidate.dimension === dimension)
      .sort(
        (a, b) =>
          a.penalizedLoss - b.penalizedLoss ||
          b.coverage - a.coverage ||
          compare(a.candidate.version, b.candidate.version),
      );
    const best = ranked[0];
    if (best.evaluatedCount) report.selectedPolicies.push(best.candidate);
    for (const result of ranked) {
      result.lossDeltaFromBest = result.penalizedLoss - best.penalizedLoss;
      result.coverageDeltaFromBest = result.coverage - best.coverage;
      result.rejectionReason = !result.evaluatedCount
        ? "NO_EVALUATED_PAIRS"
        : result === best
          ? null
          : result.penalizedLoss > best.penalizedLoss
            ? "HIGHER_LOSS"
            : result.coverage < best.coverage
              ? "LOWER_COVERAGE"
              : "TIE_BREAK";
    }
  }
  report.proposalReady =
    report.selectedPolicies.length === ScoreDimensionId.options.length;
  report.status = report.proposalReady ? "proposed" : "insufficient";
  report.reason = report.proposalReady ? null : "NO_EVALUATED_PAIRS";
  report.proposalHash = digest({
    inputHash: report.inputHash,
    selectedPolicies: report.selectedPolicies,
    candidateResults: report.candidateResults,
    rollbackPolicyVersion: report.rollbackPolicyVersion,
  });
  if (
    report.proposalReady &&
    lock.evidenceTier === "independent_human" &&
    lock.representativePartitionEligible
  ) {
    try {
      report.representativeCalibrationEligible =
        authority?.authorizeCalibration({
          proposalVersion: data.proposalVersion,
          proposalHash: report.proposalHash,
          inputHash: report.inputHash,
          lockHash: lock.lockHash,
          previousPolicyVersion: data.previousPolicyVersion,
        }) === true;
    } catch {
      report.representativeCalibrationEligible = false;
    }
  }
  return report;
}
