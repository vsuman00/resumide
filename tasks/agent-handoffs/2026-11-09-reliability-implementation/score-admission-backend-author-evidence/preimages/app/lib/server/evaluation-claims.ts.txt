import { createHash } from "node:crypto";
import { z } from "zod";
import { EVALUATION_METRICS } from "./evaluation-runner";

export const EVALUATION_CLAIMS = [
  "Regression-tested",
  "Corpus-validated",
  "Domain-validated",
  "Vendor-observed",
  "Outcome-calibrated",
] as const;
const claim = z.enum(EVALUATION_CLAIMS);
const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.iso.datetime({ offset: true });
const reference = z.strictObject({ reference: id, artifactHash: hash });
const bindings = z.strictObject({
  sourceHash: hash,
  lockHash: hash,
  reportHash: hash,
  policyHash: hash,
  reportPayloadHash: hash,
});
const monitorLimits = z.strictObject({
  maximumSignalAgeMs: z.number().int().min(1).max(86_400_000),
  complaintRate: z.number().min(0).max(1),
  correctionRate: z.number().min(0).max(1),
  latencyMs: z.number().finite().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  fairnessDisparity: z.number().min(0).max(1),
  errorRate: z.number().min(0).max(1),
});
export const evaluationClaimCardSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version,
  previousVersion: version,
  kind: z.enum(["dataset", "ruleset", "model", "evidence"]),
  claim,
  scope: z.strictObject({
    domain: z.string().max(32),
    language: z.string().max(16),
    locale: z.string().max(16),
    segments: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
      .min(1)
      .max(32),
  }),
  bindings,
  execution: reference,
  review: reference.extend({
    reviewerKind: z.enum(["human", "ai"]),
    independent: z.boolean(),
  }),
  sampleJustification: reference.nullable(),
  vendor: z
    .strictObject({
      name: z.string().min(1).max(80),
      version: z.string().min(1).max(80),
      configurationHash: hash,
      evidence: reference,
    })
    .nullable(),
  outcomeStudy: reference.nullable(),
  limitations: z.array(id).min(1).max(32),
  createdAt: time,
  expiresAt: time,
  monitorLimits,
});
export type EvaluationClaimCard = z.infer<typeof evaluationClaimCardSchema>;
const cell = z.strictObject({
  metricId: z.string().min(1).max(64),
  segmentId: z.string().min(1).max(64).nullable(),
  documents: z.number().int().nonnegative(),
  clusters: z.number().int().nonnegative(),
  missingMeasurements: z.number().int().nonnegative(),
  statistic: z.enum([
    "document_mean",
    "spearman_rank",
    "observed_incident_sum",
  ]),
  estimate: z.number().finite().nullable(),
  interval: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
  intervalStatus: z.enum([
    "estimated",
    "missing_segment",
    "insufficient_clusters",
    "undefined",
    "degenerate",
    "exact_observed",
    "withheld",
  ]),
  validReplicates: z.number().int().nonnegative(),
  invalidReplicates: z.number().int().nonnegative(),
  bootstrapHash: hash.nullable(),
  numericGatePassed: z.boolean(),
});
// This is the actual LockedEvaluationReport shape, not a claimed readiness flag.
const reportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["assessed", "rejected"]),
  reason: z
    .enum([
      "INVALID_INPUT",
      "CALIBRATION_DENIED",
      "PARTITION_DENIED",
      "CURRENT_BINDING_CHANGED",
      "INVALID_OBSERVATIONS",
      "OBSERVATION_BINDING_MISMATCH",
    ])
    .nullable(),
  evaluationVersion: z.string().max(100).nullable(),
  lockHash: hash.nullable(),
  calibrationHash: hash.nullable(),
  evaluationHash: hash.nullable(),
  evidenceTier: z.enum([
    "synthetic_engineering",
    "independent_human",
    "unverified",
  ]),
  measuredDocumentCount: z.number().int().min(0).max(4096),
  statistics: z
    .strictObject({
      schemaVersion: z.literal(1),
      status: z.enum(["assessed", "rejected"]),
      reason: z
        .enum([
          "INVALID_INPUT",
          "DOCUMENT_COVERAGE_MISMATCH",
          "METRIC_COVERAGE_MISMATCH",
          "INVALID_MEASUREMENT",
          "COMPUTE_BUDGET_EXCEEDED",
        ])
        .nullable(),
      inputHash: hash.nullable(),
      method: z.literal("seeded-whole-cluster-percentile-v1"),
      resamples: z.literal(10000),
      confidence: z.literal(0.95),
      numericGatePassed: z.boolean(),
      cells: z.array(cell).max(528),
    })
    .nullable(),
  engineeringReady: z.boolean(),
  representativeReady: z.boolean(),
  releaseReady: z.literal(false),
  accessAudit: z
    .strictObject({
      decision: z.enum(["allowed", "denied"]),
      reason: z.string().max(64).nullable(),
      recordCount: z.number().int().min(0).max(4096),
    })
    .nullable(),
});
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function hashEvaluationClaimCard(input: unknown): string | null {
  const parsed = evaluationClaimCardSchema.safeParse(input);
  return parsed.success ? digest(parsed.data) : null;
}
export function hashLockedEvaluationReport(input: unknown): string | null {
  if (!reportSchema.safeParse(input).success) return null;
  try {
    const json = JSON.stringify(input);
    return Buffer.byteLength(json) <= 524288
      ? createHash("sha256").update(json).digest("hex")
      : null;
  } catch {
    return null;
  }
}
export type EvaluationClaimAuthority = {
  authorize(binding: {
    kind:
      | "regression_execution"
      | "representative_execution"
      | "technical_review"
      | "independent_review"
      | "sample_justification"
      | "vendor_observation"
      | "outcome_study";
    reference: string;
    artifactHash: string;
    cardHash: string;
    claim: EvaluationClaimCard["claim"];
    reportPayloadHash: string;
    sourceHash: string;
    lockHash: string;
    policyHash: string;
    scopeHash: string;
  }): boolean;
};
export type EvaluationClaimReason =
  | "INVALID_CARD"
  | "INVALID_REPORT"
  | "INVALID_AS_OF"
  | "OUT_OF_SCOPE"
  | "EXPIRED_CARD"
  | "INVALID_VERSION"
  | "REPORT_BINDING_DRIFT"
  | "EXECUTION_NOT_AUTHORIZED"
  | "REVIEW_NOT_AUTHORIZED"
  | "SYNTHETIC_CLAIM_LIMIT"
  | "SEGMENT_GATES_NOT_PASSED"
  | "SAMPLE_JUSTIFICATION_REQUIRED"
  | "VENDOR_EVIDENCE_REQUIRED"
  | "OUTCOME_STUDY_REQUIRED";
export function assessEvaluationClaim(
  input: unknown,
  lockedReport: unknown,
  asOf: string,
  authority?: EvaluationClaimAuthority,
): {
  status: "eligible" | "blocked" | "rejected";
  cardHash: string | null;
  claim: EvaluationClaimCard["claim"] | null;
  engineeringReady: boolean;
  higherClaimEligible: boolean;
  failedSegmentCells: number;
  reasons: EvaluationClaimReason[];
  activationAllowed: false;
} {
  const result = {
    status: "rejected" as "eligible" | "blocked" | "rejected",
    cardHash: null as string | null,
    claim: null as EvaluationClaimCard["claim"] | null,
    engineeringReady: false,
    higherClaimEligible: false,
    failedSegmentCells: 0,
    reasons: [] as EvaluationClaimReason[],
    activationAllowed: false as const,
  };
  const add = (reason: EvaluationClaimReason) => {
    if (!result.reasons.includes(reason)) result.reasons.push(reason);
  };
  const parsed = evaluationClaimCardSchema.safeParse(input);
  if (!parsed.success) {
    add("INVALID_CARD");
    return result;
  }
  const card = parsed.data;
  result.cardHash = digest(card);
  result.claim = card.claim;
  if (!time.safeParse(asOf).success) {
    add("INVALID_AS_OF");
    return result;
  }
  if (card.version === card.previousVersion) {
    add("INVALID_VERSION");
    return result;
  }
  if (
    card.scope.domain !== "software_engineering" ||
    card.scope.language !== "en" ||
    card.scope.locale !== "IN" ||
    new Set(card.scope.segments).size !== card.scope.segments.length
  ) {
    add("OUT_OF_SCOPE");
    return result;
  }
  if (!(
    Date.parse(card.createdAt) <= Date.parse(asOf) &&
    Date.parse(asOf) < Date.parse(card.expiresAt)
  )) {
    add("EXPIRED_CARD");
    return result;
  }
  const report = reportSchema.safeParse(lockedReport);
  const payloadHash = hashLockedEvaluationReport(lockedReport);
  if (
    !report.success ||
    !payloadHash ||
    report.data.status !== "assessed" ||
    !report.data.measuredDocumentCount
  ) {
    add("INVALID_REPORT");
    return result;
  }
  const r = report.data;
  result.status = "blocked";
  if (
    card.bindings.reportPayloadHash !== payloadHash ||
    card.bindings.lockHash !== r.lockHash ||
    card.bindings.reportHash !== r.evaluationHash ||
    card.bindings.policyHash !== r.calibrationHash
  ) {
    add("REPORT_BINDING_DRIFT");
    return result;
  }
  const higher = card.claim !== "Regression-tested";
  const authorized = (
    kind: Parameters<EvaluationClaimAuthority["authorize"]>[0]["kind"],
    receipt: z.infer<typeof reference> | null,
  ): boolean => {
    if (!receipt || typeof authority?.authorize !== "function") return false;
    try {
      return (
        authority.authorize({
          kind,
          ...receipt,
          cardHash: result.cardHash!,
          claim: card.claim,
          reportPayloadHash: payloadHash,
          sourceHash: card.bindings.sourceHash,
          lockHash: card.bindings.lockHash,
          policyHash: card.bindings.policyHash,
          scopeHash: digest(card.scope),
        }) === true
      );
    } catch {
      return false;
    }
  };
  if (
    !authorized(
      higher ? "representative_execution" : "regression_execution",
      card.execution,
    )
  )
    add("EXECUTION_NOT_AUTHORIZED");
  if (
    (higher &&
      (card.review.reviewerKind !== "human" || !card.review.independent)) ||
    !authorized(higher ? "independent_review" : "technical_review", card.review)
  )
    add("REVIEW_NOT_AUTHORIZED");
  if (higher) {
    if (r.evidenceTier !== "independent_human" || !r.representativeReady)
      add("SYNTHETIC_CLAIM_LIMIT");
    const stats = r.statistics;
    const cells = stats?.cells.filter((c) => c.segmentId !== null) ?? [];
    result.failedSegmentCells = cells.filter(
      (c) =>
        !c.numericGatePassed ||
        !["estimated", "exact_observed"].includes(c.intervalStatus),
    ).length;
    const complete = card.scope.segments.every((segment) =>
      EVALUATION_METRICS.every(
        (metric) =>
          cells.filter((c) => c.segmentId === segment && c.metricId === metric)
            .length === 1,
      ),
    );
    if (
      !stats ||
      stats.status !== "assessed" ||
      !stats.numericGatePassed ||
      !r.engineeringReady ||
      result.failedSegmentCells ||
      !complete ||
      cells.length !== card.scope.segments.length * EVALUATION_METRICS.length
    )
      add("SEGMENT_GATES_NOT_PASSED");
    if (!authorized("sample_justification", card.sampleJustification))
      add("SAMPLE_JUSTIFICATION_REQUIRED");
    if (
      ["Vendor-observed", "Outcome-calibrated"].includes(card.claim) &&
      (!card.vendor || !authorized("vendor_observation", card.vendor.evidence))
    )
      add("VENDOR_EVIDENCE_REQUIRED");
    if (
      card.claim === "Outcome-calibrated" &&
      !authorized("outcome_study", card.outcomeStudy)
    )
      add("OUTCOME_STUDY_REQUIRED");
  }
  if (!result.reasons.length) {
    result.status = "eligible";
    result.engineeringReady = true;
    result.higherClaimEligible = higher;
  }
  return result;
}

const signalSchema = bindings.extend({
  recordedAt: time,
  revoked: z.boolean(),
  failedEvaluation: z.boolean(),
  complaintRate: z.number().min(0).max(1),
  correctionRate: z.number().min(0).max(1),
  latencyMs: z.number().finite().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  fairnessDisparity: z.number().min(0).max(1),
  errorRate: z.number().min(0).max(1),
});
export type EvaluationClaimMonitor = { readSignals(cardHash: string): unknown };
/** A proposed control action only: never flips flags, deploys, publishes or deletes a card. */
export function monitorEvaluationClaim(
  input: unknown,
  asOf: string,
  context?: EvaluationClaimMonitor,
): {
  action: "continue" | "stop_and_rollback";
  cardHash: string | null;
  rollbackVersion: string | null;
  reasons: (
    | "INVALID_CARD"
    | "INVALID_AS_OF"
    | "EXPIRED_CARD"
    | "MISSING_SIGNALS"
    | "STALE_SIGNALS"
    | "BINDING_DRIFT"
    | "REVOKED"
    | "FAILED_EVALUATION"
    | "THRESHOLD_BREACH"
  )[];
  activationAllowed: false;
} {
  const result = {
    action: "stop_and_rollback" as "continue" | "stop_and_rollback",
    cardHash: null as string | null,
    rollbackVersion: null as string | null,
    reasons: [] as (
      | "INVALID_CARD"
      | "INVALID_AS_OF"
      | "EXPIRED_CARD"
      | "MISSING_SIGNALS"
      | "STALE_SIGNALS"
      | "BINDING_DRIFT"
      | "REVOKED"
      | "FAILED_EVALUATION"
      | "THRESHOLD_BREACH"
    )[],
    activationAllowed: false as const,
  };
  const parsed = evaluationClaimCardSchema.safeParse(input);
  if (!parsed.success || parsed.data.version === parsed.data.previousVersion) {
    result.reasons.push("INVALID_CARD");
    return result;
  }
  const card = parsed.data;
  result.cardHash = digest(card);
  result.rollbackVersion = card.previousVersion;
  if (!time.safeParse(asOf).success) {
    result.reasons.push("INVALID_AS_OF");
    return result;
  }
  const now = Date.parse(asOf);
  if (now < Date.parse(card.createdAt) || now >= Date.parse(card.expiresAt))
    result.reasons.push("EXPIRED_CARD");
  let raw: unknown;
  try {
    raw = context?.readSignals(result.cardHash);
  } catch {
    raw = null;
  }
  const parsedSignals = signalSchema.safeParse(raw);
  if (!parsedSignals.success) {
    result.reasons.push("MISSING_SIGNALS");
    return result;
  }
  const signals = parsedSignals.data;
  if (
    Date.parse(signals.recordedAt) > now ||
    now - Date.parse(signals.recordedAt) > card.monitorLimits.maximumSignalAgeMs
  )
    result.reasons.push("STALE_SIGNALS");
  if (
    Object.entries(card.bindings).some(
      ([key, value]) => signals[key as keyof typeof card.bindings] !== value,
    )
  )
    result.reasons.push("BINDING_DRIFT");
  if (signals.revoked) result.reasons.push("REVOKED");
  if (signals.failedEvaluation) result.reasons.push("FAILED_EVALUATION");
  if (
    (
      [
        "complaintRate",
        "correctionRate",
        "latencyMs",
        "costUsd",
        "fairnessDisparity",
        "errorRate",
      ] as const
    ).some((metric) => signals[metric] > card.monitorLimits[metric])
  )
    result.reasons.push("THRESHOLD_BREACH");
  if (!result.reasons.length) result.action = "continue";
  return result;
}
