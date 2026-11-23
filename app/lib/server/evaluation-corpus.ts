import { createHash } from "node:crypto";
import { z } from "zod";

const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const timestamp = z.iso.datetime({ offset: true });
const taxonomy = z.string().min(1).max(32);

export const evaluationCorpusRecordSchema = z.strictObject({
  id: opaqueId,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceKind: z.enum([
    "synthetic",
    "real_resume",
    "real_job_description",
    "candidate_upload",
    "scraped",
  ]),
  format: taxonomy,
  segment: z.strictObject({
    domain: taxonomy,
    language: taxonomy,
    locale: taxonomy,
    documentClass: taxonomy,
    layout: taxonomy,
  }),
  provenance: z.strictObject({
    reference: opaqueId,
    generatorVersion: opaqueId,
    sourceFamilyId: opaqueId,
    templateId: opaqueId,
    nearDuplicateGroupId: opaqueId,
    fictionalIdentities: z.boolean(),
  }),
  permission: z.strictObject({
    reference: opaqueId,
    licenseReference: opaqueId,
    purpose: z.string().min(1).max(64),
    grantedAt: timestamp,
    expiresAt: timestamp,
    state: z.enum(["active", "revoked"]),
  }),
  partition: z.enum(["development", "calibration", "locked_test"]),
  accessGroup: opaqueId,
  retentionExpiresAt: timestamp,
  state: z.enum(["active", "revoked", "deleted"]),
  stateChangedAt: timestamp,
});

// ponytail: a bounded metadata batch, not a raw-document registry or persistence layer.
export const evaluationCorpusManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  records: z.array(z.unknown()).max(256),
});
const actorSchema = z.strictObject({ groups: z.array(opaqueId).max(32) });

export type EvaluationCorpusRecord = z.infer<
  typeof evaluationCorpusRecordSchema
>;
export const REPRESENTATIVE_CORPUS_PURPOSE = "representative_corpus_evaluation";
export type EvaluationCorpusAuthorization = Readonly<{
  recordHash: string;
  id: string;
  contentHash: string;
  sourceKind: EvaluationCorpusRecord["sourceKind"];
  permissionReference: string;
  licenseReference: string;
  purpose: string;
  actorGroups: readonly string[];
  asOf: string;
}>;
/** Installed server authority verifies current rights; never derive it from request JSON. */
export type EvaluationCorpusAuthority = {
  authorize(binding: EvaluationCorpusAuthorization): boolean;
};
/** Schema-ordered version-1 serialization binds every validated metadata field. */
export function hashEvaluationCorpusRecord(input: unknown): string | null {
  const parsed = evaluationCorpusRecordSchema.safeParse(input);
  return parsed.success
    ? createHash("sha256")
        .update("evaluation-corpus-record/1\0")
        .update(JSON.stringify(parsed.data))
        .digest("hex")
    : null;
}
function authorizedRepresentativeRecord(
  record: EvaluationCorpusRecord,
  groups: readonly string[],
  asOf: string,
  authority?: EvaluationCorpusAuthority,
): boolean {
  if (
    record.permission.purpose !== REPRESENTATIVE_CORPUS_PURPOSE ||
    typeof authority?.authorize !== "function"
  )
    return false;
  try {
    return (
      authority.authorize(
        Object.freeze({
          recordHash: hashEvaluationCorpusRecord(record)!,
          id: record.id,
          contentHash: record.contentHash,
          sourceKind: record.sourceKind,
          permissionReference: record.permission.reference,
          licenseReference: record.permission.licenseReference,
          purpose: record.permission.purpose,
          actorGroups: Object.freeze([...new Set(groups)].sort()),
          asOf,
        }),
      ) === true
    );
  } catch {
    return false;
  }
}
export type CorpusReasonCode =
  | "INVALID_MANIFEST"
  | "INVALID_ACTOR"
  | "INVALID_AS_OF"
  | "INVALID_RECORD"
  | "UNAUTHORIZED_SOURCE"
  | "OUT_OF_SCOPE"
  | "MISSING_PERMISSION"
  | "PERMISSION_NOT_ACTIVE"
  | "PERMISSION_NOT_STARTED"
  | "PERMISSION_EXPIRED"
  | "RECORD_REVOKED"
  | "RECORD_DELETED"
  | "RETENTION_EXPIRED"
  | "ACCESS_DENIED"
  | "DUPLICATE_ID"
  | "DUPLICATE_HASH"
  | "FICTIONAL_PROVENANCE_REQUIRED"
  | "INVALID_TRANSITION";

export type CorpusAssessment = {
  schemaVersion: 1;
  status: "assessed" | "rejected";
  totalRecords: number;
  admittedCount: number;
  excludedCount: number;
  reasonCounts: Partial<Record<CorpusReasonCode, number>>;
  representativeReady: false;
  releaseReady: false;
};

function parseTime(value: unknown): number | null {
  const parsed = timestamp.safeParse(value);
  return parsed.success ? Date.parse(parsed.data) : null;
}

function missingPermission(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (!Object.hasOwn(value, "permission") ||
      (value as { permission?: unknown }).permission == null)
  );
}

function recordReason(
  record: EvaluationCorpusRecord,
  groups: readonly string[],
  now: number,
  asOf: string,
  authority?: EvaluationCorpusAuthority,
): CorpusReasonCode | null {
  const synthetic = record.sourceKind === "synthetic";
  if (
    !synthetic &&
    !authorizedRepresentativeRecord(record, groups, asOf, authority)
  )
    return "UNAUTHORIZED_SOURCE";
  if (
    record.format !== "pdf" ||
    record.segment.domain !== "software_engineering" ||
    record.segment.language !== "en" ||
    record.segment.locale !== "IN" ||
    !["native", "scanned", "mixed"].includes(record.segment.documentClass) ||
    !["single_column", "multi_column", "complex", "challenging_scan"].includes(
      record.segment.layout,
    ) ||
    record.permission.purpose !==
      (synthetic
        ? "synthetic_engineering_evaluation"
        : REPRESENTATIVE_CORPUS_PURPOSE)
  )
    return "OUT_OF_SCOPE";
  if (synthetic && !record.provenance.fictionalIdentities)
    return "FICTIONAL_PROVENANCE_REQUIRED";
  if (Date.parse(record.stateChangedAt) > now) return "INVALID_RECORD";
  if (record.state === "deleted") return "RECORD_DELETED";
  if (record.state === "revoked") return "RECORD_REVOKED";
  if (record.permission.state !== "active") return "PERMISSION_NOT_ACTIVE";
  if (Date.parse(record.permission.grantedAt) > now)
    return "PERMISSION_NOT_STARTED";
  if (Date.parse(record.permission.expiresAt) <= now)
    return "PERMISSION_EXPIRED";
  if (Date.parse(record.retentionExpiresAt) <= now) return "RETENTION_EXPIRED";
  if (!groups.includes(record.accessGroup)) return "ACCESS_DENIED";
  return null;
}

/** Declared rights are metadata, not independently verified permission. */
export function assessEvaluationCorpus(
  manifest: unknown,
  actor: unknown,
  asOf: string,
  authority?: EvaluationCorpusAuthority,
): CorpusAssessment {
  const parsed = evaluationCorpusManifestSchema.safeParse(manifest);
  const result: CorpusAssessment = {
    schemaVersion: 1,
    status: "rejected",
    totalRecords: parsed.success ? parsed.data.records.length : 0,
    admittedCount: 0,
    excludedCount: parsed.success ? parsed.data.records.length : 0,
    reasonCounts: {},
    representativeReady: false,
    releaseReady: false,
  };
  const access = actorSchema.safeParse(actor);
  const now = parseTime(asOf);
  const invalid = !parsed.success
    ? "INVALID_MANIFEST"
    : !access.success
      ? "INVALID_ACTOR"
      : now === null
        ? "INVALID_AS_OF"
        : null;
  if (invalid) {
    result.reasonCounts[invalid] = 1;
    return result;
  }
  // Narrow explicitly: no validation error or input field is returned to callers.
  if (!parsed.success || !access.success || now === null) return result;
  const records = parsed.data.records.map((record) =>
    evaluationCorpusRecordSchema.safeParse(record),
  );
  const ids = new Map<string, number>();
  const hashes = new Map<string, number>();
  for (const record of records) {
    if (!record.success) continue;
    ids.set(record.data.id, (ids.get(record.data.id) ?? 0) + 1);
    hashes.set(
      record.data.contentHash,
      (hashes.get(record.data.contentHash) ?? 0) + 1,
    );
  }
  records.forEach((record, index) => {
    const reason = !record.success
      ? missingPermission(parsed.data.records[index])
        ? "MISSING_PERMISSION"
        : "INVALID_RECORD"
      : (recordReason(record.data, access.data.groups, now, asOf, authority) ??
        ((ids.get(record.data.id) ?? 0) > 1
          ? "DUPLICATE_ID"
          : (hashes.get(record.data.contentHash) ?? 0) > 1
            ? "DUPLICATE_HASH"
            : null));
    if (reason)
      result.reasonCounts[reason] = (result.reasonCounts[reason] ?? 0) + 1;
    else result.admittedCount++;
  });
  result.status = "assessed";
  result.excludedCount = result.totalRecords - result.admittedCount;
  return result;
}

/** Plan metadata invalidation/deletion verification; never delete files or records. */
export function assessCorpusRetention(record: unknown, asOf: string) {
  const parsed = evaluationCorpusRecordSchema.safeParse(record);
  const now = parseTime(asOf);
  const reason: CorpusReasonCode | null = !parsed.success
    ? "INVALID_RECORD"
    : now === null
      ? "INVALID_AS_OF"
      : Date.parse(parsed.data.stateChangedAt) > now
        ? "INVALID_RECORD"
        : null;
  if (reason || !parsed.success || now === null)
    return {
      status: "rejected" as const,
      reason,
      requiresDeletion: false,
      invalidateDerivedEvidence: true,
    };
  const invalidated =
    parsed.data.state !== "active" ||
    parsed.data.permission.state !== "active" ||
    Date.parse(parsed.data.permission.expiresAt) <= now ||
    Date.parse(parsed.data.retentionExpiresAt) <= now;
  return {
    status: "assessed" as const,
    reason: null,
    requiresDeletion: invalidated && parsed.data.state !== "deleted",
    invalidateDerivedEvidence: invalidated,
  };
}

/** Immutable, forward-only metadata transition; not a deletion receipt. */
export function transitionCorpusRecord(
  record: unknown,
  action: "revoke" | "mark_deleted",
  asOf: string,
): {
  status: "updated" | "rejected";
  reason: CorpusReasonCode | null;
  record: EvaluationCorpusRecord | null;
} {
  const parsed = evaluationCorpusRecordSchema.safeParse(record);
  const now = parseTime(asOf);
  if (!parsed.success)
    return { status: "rejected", reason: "INVALID_RECORD", record: null };
  if (now === null)
    return { status: "rejected", reason: "INVALID_AS_OF", record: null };
  if (
    !["revoke", "mark_deleted"].includes(action) ||
    now < Date.parse(parsed.data.stateChangedAt) ||
    (parsed.data.state === "deleted" && action === "revoke")
  )
    return { status: "rejected", reason: "INVALID_TRANSITION", record: null };
  const state = action === "revoke" ? "revoked" : "deleted";
  return {
    status: "updated",
    reason: null,
    record: {
      ...parsed.data,
      state,
      stateChangedAt:
        parsed.data.state === state ? parsed.data.stateChangedAt : asOf,
    },
  };
}
