import { createHash } from "node:crypto";
import { z } from "zod";
import {
  readEvaluationPartitionLabels,
  verifyEvaluationPartitionLock,
  type EvaluationPartitionLock,
  type PartitionAuthority,
} from "./evaluation-partitions";
import {
  evaluateStatistics,
  evaluationMetricPolicySchema,
  type EvaluationStatistics,
} from "./evaluation-statistics";

export const EVALUATION_METRICS = [
  "extraction",
  "job_intelligence",
  "scoring",
  "writer_grounding",
  "artifact_parity",
  "accessibility",
  "fairness_error",
  "safe_failure",
  "latency",
  "cost",
] as const;
const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const segment = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const inputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evaluationVersion: id,
  seed: z.number().int().min(0).max(0xffff_ffff),
  actorGroups: z.array(id).max(32),
  lock: z.unknown(),
  calibration: z.unknown(),
  requiredSegments: z.array(segment).min(1).max(32),
  documents: z
    .array(
      z.strictObject({ sourceId: id, sourceHash: hash, segmentId: segment }),
    )
    .min(1)
    .max(4096),
  policies: z
    .array(evaluationMetricPolicySchema)
    .length(EVALUATION_METRICS.length),
  sampleJustificationReference: id.nullable(),
});
const calibrationSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("proposed"),
  proposalReady: z.literal(true),
  proposalVersion: z.string().min(1).max(100),
  inputHash: hash,
  proposalHash: hash,
  lockHash: hash,
  partition: z.enum(["development", "calibration"]),
  representativeCalibrationEligible: z.boolean(),
});
const number = z.number().finite().min(-1e12).max(1e12);
const ledgerSchema = z
  .array(
    z.strictObject({
      sourceId: id,
      sourceHash: hash,
      segmentId: segment,
      values: z
        .record(
          z.string().max(64),
          z
            .union([
              number,
              z.strictObject({ actual: number, reference: number }),
            ])
            .nullable(),
        )
        .refine((values) => Object.keys(values).length <= 16),
    }),
  )
  .max(4096);
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Register the exact server-produced proposal, never a readiness flag received from a client. */
export function hashEvaluationCalibration(proposal: unknown): string | null {
  try {
    const json = JSON.stringify(proposal);
    return json && Buffer.byteLength(json) <= 262144
      ? createHash("sha256").update(json).digest("hex")
      : null;
  } catch {
    return null;
  }
}
export type EvaluationCalibrationBinding = {
  payloadHash: string;
  proposalHash: string;
  proposalVersion: string;
  inputHash: string;
  lockHash: string;
};
export type LockedEvaluationContext = {
  currentPartitionInput(): unknown;
  partitionAuthority?: PartitionAuthority;
  authorizeCalibration(binding: EvaluationCalibrationBinding): boolean;
  authorizeRepresentativeEvaluation?(binding: {
    evaluationHash: string;
    lockHash: string;
    calibrationHash: string;
    sampleJustificationReference: string;
  }): boolean;
};
export type LockedEvaluationReport = {
  schemaVersion: 1;
  status: "assessed" | "rejected";
  reason:
    | "INVALID_INPUT"
    | "CALIBRATION_DENIED"
    | "PARTITION_DENIED"
    | "CURRENT_BINDING_CHANGED"
    | "INVALID_OBSERVATIONS"
    | "OBSERVATION_BINDING_MISMATCH"
    | null;
  evaluationVersion: string | null;
  lockHash: string | null;
  calibrationHash: string | null;
  evaluationHash: string | null;
  evidenceTier: "synthetic_engineering" | "independent_human" | "unverified";
  measuredDocumentCount: number;
  statistics: EvaluationStatistics | null;
  engineeringReady: boolean;
  representativeReady: boolean;
  releaseReady: false;
  accessAudit: {
    decision: "allowed" | "denied";
    reason: string | null;
    recordCount: number;
  } | null;
};

/** Connected components retain every declared dependency, including overlapping cluster categories. */
function clusterIds(records: EvaluationPartitionLock["records"]) {
  const parent = records.map((_, i) => i);
  const first = new Map<string, number>();
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  records.forEach((record, index) => {
    const keys = [
      "person",
      "template",
      "sourceFamily",
      "nearDuplicate",
    ] as const;
    const memberships = keys.flatMap((key) =>
      record.clusters[key].map((value) => `${key}:${value}`),
    );
    if (record.clusters.employer.status === "known")
      memberships.push(
        ...record.clusters.employer.ids.map((value) => `employer:${value}`),
      );
    for (const membership of memberships) {
      const prior = first.get(membership);
      if (prior === undefined) first.set(membership, index);
      else parent[find(index)] = find(prior);
    }
  });
  const members = new Map<number, string[]>();
  records.forEach((record, index) => {
    const root = find(index);
    members.set(root, [...(members.get(root) ?? []), record.contentHash]);
  });
  return new Map(
    records.map((record, index) => [
      record.id,
      digest(members.get(find(index))!.sort()),
    ]),
  );
}

/** Assesses a supplied measured ledger. The reader, not this function, runs application operations. */
export async function runLockedEvaluation(
  input: unknown,
  reader: (sourceIds: readonly string[]) => unknown | Promise<unknown>,
  context?: LockedEvaluationContext,
): Promise<LockedEvaluationReport> {
  const report: LockedEvaluationReport = {
    schemaVersion: 1,
    status: "rejected",
    reason: null,
    evaluationVersion: null,
    lockHash: null,
    calibrationHash: null,
    evaluationHash: null,
    evidenceTier: "unverified",
    measuredDocumentCount: 0,
    statistics: null,
    engineeringReady: false,
    representativeReady: false,
    releaseReady: false,
    accessAudit: null,
  };
  const deny = (reason: LockedEvaluationReport["reason"]) => ({
    ...report,
    reason,
  });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !context) return deny("INVALID_INPUT");
  const data = parsed.data;
  report.evaluationVersion = data.evaluationVersion;
  if (
    new Set(data.requiredSegments).size !== data.requiredSegments.length ||
    new Set(data.documents.map((row) => row.sourceId)).size !==
      data.documents.length ||
    new Set(data.policies.map((policy) => policy.id)).size !==
      EVALUATION_METRICS.length ||
    EVALUATION_METRICS.some(
      (metric) => !data.policies.some((policy) => policy.id === metric),
    ) ||
    data.policies.some((policy) =>
      policy.id === "safe_failure"
        ? policy.kind !== "exact_zero"
        : policy.id === "latency" || policy.id === "cost"
          ? policy.kind !== "mean_upper"
          : false,
    )
  )
    return deny("INVALID_INPUT");
  const calibration = calibrationSchema.safeParse(data.calibration);
  const payloadHash = hashEvaluationCalibration(data.calibration);
  if (!calibration.success || !payloadHash) return deny("CALIBRATION_DENIED");
  const binding = {
    payloadHash,
    proposalHash: calibration.data.proposalHash,
    proposalVersion: calibration.data.proposalVersion,
    inputHash: calibration.data.inputHash,
    lockHash: calibration.data.lockHash,
  };
  report.calibrationHash = payloadHash;
  const authorize = () => {
    try {
      return (
        context.authorizeCalibration(binding) === true &&
        hashEvaluationCalibration(data.calibration) === payloadHash
      );
    } catch {
      return false;
    }
  };
  if (!authorize()) return deny("CALIBRATION_DENIED");
  let current: unknown;
  try {
    current = context.currentPartitionInput();
  } catch {
    return deny("PARTITION_DENIED");
  }
  const checked = verifyEvaluationPartitionLock(
    data.lock,
    current,
    context.partitionAuthority,
  );
  if (!checked.lock || checked.lock.lockHash !== binding.lockHash)
    return deny("PARTITION_DENIED");
  const lock = checked.lock;
  report.lockHash = lock.lockHash;
  report.evidenceTier = lock.evidenceTier;
  const records = lock.records.filter(
    (record) => record.partition === "locked_test",
  );
  const expected = new Map(data.documents.map((row) => [row.sourceId, row]));
  if (
    records.length !== expected.size ||
    records.some(
      (record) => expected.get(record.id)?.sourceHash !== record.contentHash,
    )
  )
    return deny("OBSERVATION_BINDING_MISMATCH");
  const access = await readEvaluationPartitionLabels(
    lock,
    current,
    {
      purpose: "locked_evaluation",
      partition: "locked_test",
      actorGroups: data.actorGroups,
    },
    reader,
    context.partitionAuthority,
  );
  report.accessAudit = {
    decision: access.audit.decision,
    reason: access.audit.reason,
    recordCount: access.audit.recordCount,
  };
  if (access.status !== "read") return deny("PARTITION_DENIED");
  // Re-read authority/current manifest after the async operation; never reuse a stale acceptance decision.
  let fresh: unknown;
  try {
    fresh = context.currentPartitionInput();
  } catch {
    return deny("CURRENT_BINDING_CHANGED");
  }
  if (
    !verifyEvaluationPartitionLock(lock, fresh, context.partitionAuthority)
      .lock ||
    !authorize()
  )
    return deny("CURRENT_BINDING_CHANGED");
  const ledger = ledgerSchema.safeParse(access.value);
  if (!ledger.success) return deny("INVALID_OBSERVATIONS");
  const observed = new Set<string>();
  for (const row of ledger.data) {
    const source = expected.get(row.sourceId);
    if (
      !source ||
      observed.has(row.sourceId) ||
      source.sourceHash !== row.sourceHash ||
      source.segmentId !== row.segmentId
    )
      return deny("OBSERVATION_BINDING_MISMATCH");
    observed.add(row.sourceId);
  }
  if (observed.size !== records.length)
    return deny("OBSERVATION_BINDING_MISMATCH");
  const clusters = clusterIds(records);
  const statistics = evaluateStatistics({
    schemaVersion: 1,
    seed: data.seed,
    requiredSegments: data.requiredSegments,
    policies: data.policies,
    expectedDocuments: data.documents.map((row) => ({
      documentHash: row.sourceHash,
      clusterId: clusters.get(row.sourceId),
      segmentId: row.segmentId,
    })),
    observations: ledger.data.map((row) => ({
      documentHash: row.sourceHash,
      clusterId: clusters.get(row.sourceId),
      segmentId: row.segmentId,
      values: row.values,
    })),
  });
  report.statistics = statistics;
  if (statistics.status === "rejected") return deny("INVALID_OBSERVATIONS");
  report.status = "assessed";
  report.measuredDocumentCount = ledger.data.length;
  report.evaluationHash = digest({
    evaluationVersion: data.evaluationVersion,
    lockHash: lock.lockHash,
    calibrationHash: payloadHash,
    statisticsHash: statistics.inputHash,
  });
  report.engineeringReady = statistics.numericGatePassed;
  if (
    report.engineeringReady &&
    lock.representativePartitionEligible &&
    calibration.data.representativeCalibrationEligible &&
    data.sampleJustificationReference
  ) {
    try {
      report.representativeReady =
        context.authorizeRepresentativeEvaluation?.({
          evaluationHash: report.evaluationHash,
          lockHash: lock.lockHash,
          calibrationHash: payloadHash,
          sampleJustificationReference: data.sampleJustificationReference,
        }) === true;
    } catch {
      /* A failed optional claim authority never grants a claim. */
    }
  }
  return report;
}
