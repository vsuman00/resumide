import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assessAnnotationEvidence,
  type AnnotationAuthority,
} from "./evaluation-annotation";

const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const partitionSchema = z.enum(["development", "calibration", "locked_test"]);
const groups = z.array(opaqueId).min(1).max(32);
const clusterKeys = [
  "person",
  "template",
  "sourceFamily",
  "nearDuplicate",
] as const;
const employerSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("known"), ids: groups }),
  z.strictObject({
    status: z.literal("not_applicable"),
    reasonReference: opaqueId,
    evidenceReference: opaqueId,
  }),
]);
const recordSchema = z.strictObject({
  id: opaqueId,
  contentHash: sha256,
  partition: partitionSchema,
  clusters: z.strictObject({
    person: groups,
    employer: employerSchema,
    template: groups,
    sourceFamily: groups,
    nearDuplicate: groups,
  }),
});
const accessSchema = z.strictObject({
  development: groups,
  calibration: groups,
  locked_test: groups,
});
const inputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  corpusVersion: opaqueId,
  annotationEvidence: z.unknown(),
  records: z.array(recordSchema).min(1).max(4096),
  accessGroups: accessSchema,
});
const payloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  corpusVersion: opaqueId,
  annotationEvidenceHash: sha256,
  evidenceTier: z.enum(["synthetic_engineering", "independent_human"]),
  representativePartitionEligible: z.boolean(),
  records: z.array(recordSchema).min(1).max(4096),
  accessGroups: accessSchema,
  representativeReady: z.literal(false),
  releaseReady: z.literal(false),
});
const lockSchema = payloadSchema.extend({ lockHash: sha256 });
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type EvaluationPartitionLock = DeepReadonly<z.infer<typeof lockSchema>>;
export type PartitionReason =
  | "INVALID_INPUT"
  | "ANNOTATION_INELIGIBLE"
  | "ANNOTATION_BINDING_MISMATCH"
  | "MISSING_PARTITION"
  | "DUPLICATE_ID"
  | "DUPLICATE_HASH"
  | "CLUSTER_LEAKAGE"
  | "INVALID_LOCK"
  | "LOCK_DRIFT"
  | "ACCESS_DENIED"
  | "LOCKED_TEST_FORBIDDEN"
  | "PURPOSE_DENIED"
  | "READER_FAILED";
export type PartitionAuthority = AnnotationAuthority & {
  authorizePartitionManifest(binding: {
    corpusVersion: string;
    membershipHash: string;
  }): boolean;
};
type LockResult = {
  status: "locked" | "rejected";
  reason: PartitionReason | null;
  lock: EvaluationPartitionLock | null;
  representativeReady: false;
  releaseReady: false;
};
function rejected(reason: PartitionReason): LockResult {
  return {
    status: "rejected",
    reason,
    lock: null,
    representativeReady: false,
    releaseReady: false,
  };
}
function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
const sorted = (values: string[]) => [...new Set(values)].sort();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** A hash-bound lock; declared clustering is not independently verified identity evidence. */
export function createEvaluationPartitionLock(
  input: unknown,
  authority?: PartitionAuthority,
): LockResult {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return rejected("INVALID_INPUT");
  const { corpusVersion, records, accessGroups } = parsed.data;
  const annotations = assessAnnotationEvidence(
    parsed.data.annotationEvidence,
    authority,
  );
  if (
    annotations.status !== "assessed" ||
    !annotations.agreementPassed ||
    !["synthetic_engineering", "independent_human"].includes(
      annotations.evidenceTier,
    )
  )
    return rejected("ANNOTATION_INELIGIBLE");
  if (
    annotations.evidenceTier === "independent_human" &&
    !annotations.representativeAnnotationEligible
  )
    return rejected("ANNOTATION_INELIGIBLE");
  const eligible = new Map(
    annotations.eligibleSources.map((source) => [source.sourceId, source]),
  );
  const evidenceHashes = new Set<string>();
  for (const record of records) {
    const source = eligible.get(record.id);
    if (!source || source.sourceHash !== record.contentHash)
      return rejected("ANNOTATION_BINDING_MISMATCH");
    evidenceHashes.add(source.annotationEvidenceHash);
  }
  if (evidenceHashes.size !== 1) return rejected("ANNOTATION_BINDING_MISMATCH");
  if (new Set(records.map((record) => record.partition)).size !== 3)
    return rejected("MISSING_PARTITION");
  if (new Set(records.map((record) => record.id)).size !== records.length)
    return rejected("DUPLICATE_ID");
  if (
    new Set(records.map((record) => record.contentHash)).size !== records.length
  )
    return rejected("DUPLICATE_HASH");
  for (const key of clusterKeys) {
    const seen = new Map<string, string>();
    for (const record of records) {
      for (const cluster of record.clusters[key]) {
        const prior = seen.get(cluster);
        if (prior !== undefined && prior !== record.partition)
          return rejected("CLUSTER_LEAKAGE");
        seen.set(cluster, record.partition);
      }
    }
  }
  const employers = new Map<string, string>();
  for (const record of records) {
    if (record.clusters.employer.status !== "known") continue;
    for (const id of record.clusters.employer.ids) {
      const prior = employers.get(id);
      if (prior !== undefined && prior !== record.partition)
        return rejected("CLUSTER_LEAKAGE");
      employers.set(id, record.partition);
    }
  }
  const normalized = records
    .map((record) => ({
      ...record,
      clusters: {
        person: sorted(record.clusters.person),
        employer:
          record.clusters.employer.status === "known"
            ? { status: "known", ids: sorted(record.clusters.employer.ids) }
            : record.clusters.employer,
        template: sorted(record.clusters.template),
        sourceFamily: sorted(record.clusters.sourceFamily),
        nearDuplicate: sorted(record.clusters.nearDuplicate),
      },
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload = payloadSchema.parse({
    schemaVersion: 1,
    corpusVersion,
    annotationEvidenceHash: [...evidenceHashes][0],
    evidenceTier: annotations.evidenceTier,
    representativePartitionEligible:
      annotations.representativeAnnotationEligible,
    records: normalized,
    accessGroups: {
      development: sorted(accessGroups.development),
      calibration: sorted(accessGroups.calibration),
      locked_test: sorted(accessGroups.locked_test),
    },
    representativeReady: false,
    releaseReady: false,
  });
  if (payload.evidenceTier === "independent_human") {
    try {
      if (
        authority?.authorizePartitionManifest({
          corpusVersion,
          membershipHash: hash({
            records: payload.records,
            accessGroups: payload.accessGroups,
          }),
        }) !== true
      )
        return rejected("ANNOTATION_INELIGIBLE");
    } catch {
      return rejected("ANNOTATION_INELIGIBLE");
    }
  }
  return {
    status: "locked",
    reason: null,
    lock: freeze({ ...payload, lockHash: hash(payload) }),
    representativeReady: false,
    releaseReady: false,
  };
}

/** Recheck current source and annotation bindings; a valid historical hash cannot hide drift. */
export function verifyEvaluationPartitionLock(
  lock: unknown,
  currentInput: unknown,
  authority?: PartitionAuthority,
): LockResult {
  const parsed = lockSchema.safeParse(lock);
  if (!parsed.success) return rejected("INVALID_LOCK");
  const { lockHash, ...payload } = parsed.data;
  if (hash(payload) !== lockHash) return rejected("INVALID_LOCK");
  const current = createEvaluationPartitionLock(currentInput, authority);
  if (!current.lock) return current;
  if (current.lock.lockHash !== lockHash) return rejected("LOCK_DRIFT");
  return current;
}

const requestSchema = z.strictObject({
  purpose: z.enum(["development", "calibration", "locked_evaluation"]),
  partition: partitionSchema,
  actorGroups: z.array(opaqueId).max(32),
});
type AccessAudit = {
  schemaVersion: 1;
  decision: "allowed" | "denied";
  reason: PartitionReason | null;
  lockHash: string | null;
  purpose: z.infer<typeof requestSchema>["purpose"] | null;
  partition: z.infer<typeof partitionSchema> | null;
  recordCount: number;
};

/** The caller authenticates group membership and persists this content-free audit receipt. */
export async function readEvaluationPartitionLabels<T>(
  lock: unknown,
  currentInput: unknown,
  request: unknown,
  reader: (sourceIds: readonly string[]) => T | Promise<T>,
  authority?: PartitionAuthority,
): Promise<
  | { status: "read"; audit: AccessAudit; value: T }
  | { status: "rejected"; audit: AccessAudit }
> {
  const access = requestSchema.safeParse(request);
  const checked = verifyEvaluationPartitionLock(lock, currentInput, authority);
  const audit: AccessAudit = {
    schemaVersion: 1,
    decision: "denied",
    reason: null,
    lockHash: checked.lock?.lockHash ?? null,
    purpose: access.success ? access.data.purpose : null,
    partition: access.success ? access.data.partition : null,
    recordCount: 0,
  };
  const deny = (reason: PartitionReason) => ({
    status: "rejected" as const,
    audit: { ...audit, reason },
  });
  if (!checked.lock) return deny(checked.reason ?? "INVALID_LOCK");
  if (!access.success) return deny("ACCESS_DENIED");
  const { purpose, partition, actorGroups } = access.data;
  if (purpose === "calibration" && partition === "locked_test")
    return deny("LOCKED_TEST_FORBIDDEN");
  if (
    (purpose === "development" && partition !== "development") ||
    (purpose === "locked_evaluation" && partition !== "locked_test")
  )
    return deny("PURPOSE_DENIED");
  if (
    !checked.lock.accessGroups[partition].some((group) =>
      actorGroups.includes(group),
    )
  )
    return deny("ACCESS_DENIED");
  const sourceIds = Object.freeze(
    checked.lock.records
      .filter((record) => record.partition === partition)
      .map((record) => record.id),
  );
  audit.decision = "allowed";
  audit.recordCount = sourceIds.length;
  try {
    return { status: "read", audit, value: await reader(sourceIds) };
  } catch {
    return deny("READER_FAILED");
  }
}
