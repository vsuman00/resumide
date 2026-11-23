import { z } from "zod";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import type { OwnedEvidenceBinding } from "./evidence-targets";
import { hashGroupedImportCommandAtoms } from "./grouped-import-command-codec";

const uuid = z.uuid().regex(/^[a-f0-9-]+$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().min(0).max(2_147_483_647);
const bindingShape = {
  ownerId: uuid,
  organizationId: uuid,
  resumeId: uuid,
  analysisId: uuid,
  sourceId: uuid,
  attemptId: uuid,
  inputSha256: sha256,
  evidenceSchemaVersion: z.literal("evidence/2.0.0"),
  fieldExtractorVersion: z.literal("evidence-fields/1.0.1"),
  targetModelVersion: z.literal("evidence-targets/1.0.0"),
  associationModelVersion: z.literal("evidence-entry-associations/1.0.0"),
  producerVersion: z.literal("canonical-engine/1.0.3"),
  admissionPolicyVersion: z.literal("grouped-original-admission/1.0.0"),
  structuralTextProfileVersion: z.literal("a02-structural-text/1.0.0"),
  correctionProjectionModelVersion: z.literal("canonical-corrections/1.0.1"),
  correctionAdmissionPolicyVersion: z.literal(
    "candidate-correction-admission/1.0.0",
  ),
  effectiveLocale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
};
const expectedShape = {
  reviewRevision: revision,
  reviewHeadId: uuid.nullable(),
  assignmentRevision: revision,
  assignmentHeadId: uuid.nullable(),
  associationRevision: revision,
  associationHeadId: uuid.nullable(),
  canonicalHeadId: z.null(),
};
const expectedSchema = z
  .strictObject(expectedShape)
  .refine(
    (value) =>
      (value.reviewRevision === 0) === (value.reviewHeadId === null) &&
      (value.assignmentRevision === 0) === (value.assignmentHeadId === null) &&
      (value.associationRevision === 0) === (value.associationHeadId === null),
  );
const previewShape = {
  schemaVersion: z.literal("grouped-original-command/1.0.0"),
  operation: z.literal("approve_and_import_grouped_original"),
  binding: z.strictObject(bindingShape),
  expected: expectedSchema,
  selectedGroupIds: z
    .array(
      z
        .string()
        .max(100)
        .regex(/^entry-association-[a-f0-9]{64}$/),
    )
    .min(1)
    .max(32)
    .refine((ids) => new Set(ids).size === ids.length),
  unselectedDisposition: z.literal("retain_original"),
};
export const GroupedOriginalPreviewRequestSchema = z.strictObject(previewShape);
export const GroupedOriginalCommandSchema = z.strictObject({
  ...previewShape,
  acknowledgement: z.literal(true),
  previewHash: sha256,
  idempotencyKey: uuid,
});
export type GroupedOriginalPreviewRequest = z.infer<
  typeof GroupedOriginalPreviewRequestSchema
>;
export type GroupedOriginalCommand = z.infer<
  typeof GroupedOriginalCommandSchema
>;
export type GroupedOriginalOwnedContext = OwnedEvidenceBinding & {
  organizationId: string;
  resumeId: string;
};
type StructuralCitation = {
  attemptId: string;
  spanId: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  start: number;
  end: number;
  pageStart: number;
  pageEnd: number;
};
export type GroupedOriginalStructuralSelection = {
  pageId: string;
  method: StructuralCitation["method"];
  members: {
    assertionId: string;
    field: "employer" | "role" | "dates";
    citations: StructuralCitation[];
  }[];
};
export type GroupedOriginalNormalForm = {
  schemaVersion: GroupedOriginalPreviewRequest["schemaVersion"];
  operation: GroupedOriginalPreviewRequest["operation"];
  binding: GroupedOriginalPreviewRequest["binding"];
  expected: GroupedOriginalPreviewRequest["expected"];
  acknowledgementPolicy: "relationship_only_not_fact_confirmation";
  acknowledgement: true;
  unselectedDisposition: "retain_original";
  selections: GroupedOriginalStructuralSelection[];
};
const flags = {
  authority: "derived_review_only",
  persistable: false,
  scoringEligible: false,
  requiresDurableAdmission: true,
} as const;
type UnavailableReason =
  | "invalid_command"
  | "binding_mismatch"
  | "association_unavailable"
  | "invalid_selection"
  | "resource_limit"
  | "preview_mismatch";
type Prepared = typeof flags & {
  state: "prepared";
  normalForm: GroupedOriginalNormalForm;
  semanticAtoms: (string | null)[];
  previewHash: string;
  selectedGroupIds: string[];
};
type Unavailable = typeof flags & {
  state: "unavailable";
  reason: UnavailableReason;
};
export type GroupedOriginalCommandPreparation = Prepared | Unavailable;
export type GroupedOriginalCommandNormalization =
  | (Prepared & { command: GroupedOriginalCommand; idempotencyKey: string })
  | Unavailable;
const unavailable = (reason: UnavailableReason): Unavailable => ({
  ...flags,
  state: "unavailable",
  reason,
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function boundedRecord(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (++count > keys.length || !keys.includes(key)) return false;
    const item = value[key];
    if (typeof item === "string" && item.length > 200) return false;
  }
  return count === keys.length;
}
function preflight(raw: unknown, commit: boolean): boolean {
  const keys = commit
    ? [
        ...Object.keys(previewShape),
        "acknowledgement",
        "previewHash",
        "idempotencyKey",
      ]
    : Object.keys(previewShape);
  if (!boundedRecord(raw, keys) || !isRecord(raw)) return false;
  if (
    !boundedRecord(raw.binding, Object.keys(bindingShape)) ||
    !boundedRecord(raw.expected, Object.keys(expectedShape)) ||
    !Array.isArray(raw.selectedGroupIds) ||
    raw.selectedGroupIds.length < 1 ||
    raw.selectedGroupIds.length > 32
  )
    return false;
  for (let index = 0; index < raw.selectedGroupIds.length; index++) {
    if (
      !Object.hasOwn(raw.selectedGroupIds, index) ||
      typeof raw.selectedGroupIds[index] !== "string" ||
      raw.selectedGroupIds[index].length > 100
    )
      return false;
  }
  return true;
}

function atomsFor(normal: GroupedOriginalNormalForm): (string | null)[] {
  const atoms: (string | null)[] = [normal.schemaVersion, normal.operation];
  for (const key of Object.keys(bindingShape) as (keyof typeof bindingShape)[])
    atoms.push(normal.binding[key]);
  for (const key of Object.keys(
    expectedShape,
  ) as (keyof typeof expectedShape)[]) {
    const value = normal.expected[key];
    atoms.push(value === null ? null : String(value));
  }
  atoms.push(
    normal.acknowledgementPolicy,
    "1",
    normal.unselectedDisposition,
    String(normal.selections.length),
  );
  for (const group of normal.selections) {
    atoms.push(group.pageId, group.method, String(group.members.length));
    for (const member of group.members) {
      atoms.push(
        member.assertionId,
        member.field,
        String(member.citations.length),
      );
      for (const source of member.citations)
        atoms.push(
          source.attemptId,
          source.spanId,
          source.pageId,
          source.method,
          String(source.start),
          String(source.end),
          String(source.pageStart),
          String(source.pageEnd),
        );
    }
  }
  return atoms;
}

function prepare(
  rawEvidence: unknown,
  owned: GroupedOriginalOwnedContext,
  request: GroupedOriginalPreviewRequest,
): GroupedOriginalCommandPreparation {
  const binding = request.binding;
  const scopeKeys = [
    "ownerId",
    "organizationId",
    "resumeId",
    "analysisId",
    "sourceId",
    "attemptId",
    "inputSha256",
  ] as const;
  if (scopeKeys.some((key) => binding[key] !== owned[key]))
    return unavailable("binding_mismatch");
  const review = deriveEvidenceEntryAssociations(rawEvidence, owned);
  if (review.state !== "review_required")
    return unavailable("association_unavailable");
  if (
    binding.evidenceSchemaVersion !== review.binding.evidenceSchemaVersion ||
    binding.fieldExtractorVersion !== review.binding.fieldExtractorVersion ||
    binding.targetModelVersion !== review.binding.targetModelVersion ||
    binding.associationModelVersion !== review.modelVersion
  )
    return unavailable("binding_mismatch");
  const selected = new Set(request.selectedGroupIds);
  const groups = review.groups.filter((group) => selected.has(group.id));
  if (groups.length !== selected.size) return unavailable("invalid_selection");
  const assertions = new Set<string>();
  const references = new Set<string>();
  const selections: GroupedOriginalStructuralSelection[] = [];
  for (const group of groups) {
    if (group.members.length < 2 || group.members.length > 3)
      return unavailable("invalid_selection");
    const members: GroupedOriginalStructuralSelection["members"] = [];
    for (const member of group.members) {
      if (
        (member.field !== "employer" &&
          member.field !== "role" &&
          member.field !== "dates") ||
        member.citations.length !== 1 ||
        assertions.has(member.assertionId)
      )
        return unavailable("invalid_selection");
      const source = member.citations[0];
      const reference = JSON.stringify([
        source.spanId,
        source.start,
        source.end,
      ]);
      if (
        references.has(reference) ||
        source.pageId !== group.pageId ||
        source.method !== group.method
      )
        return unavailable("invalid_selection");
      assertions.add(member.assertionId);
      references.add(reference);
      members.push({
        assertionId: member.assertionId,
        field: member.field,
        citations: [
          {
            attemptId: owned.attemptId,
            spanId: source.spanId,
            pageId: source.pageId,
            method: source.method,
            start: source.start,
            end: source.end,
            pageStart: source.pageStart,
            pageEnd: source.pageEnd,
          },
        ],
      });
    }
    selections.push({ pageId: group.pageId, method: group.method, members });
  }
  const normalForm: GroupedOriginalNormalForm = {
    schemaVersion: request.schemaVersion,
    operation: request.operation,
    binding: { ...binding },
    expected: { ...request.expected },
    acknowledgementPolicy: "relationship_only_not_fact_confirmation",
    acknowledgement: true,
    unselectedDisposition: request.unselectedDisposition,
    selections,
  };
  if (Buffer.byteLength(JSON.stringify(normalForm), "utf8") > 131_072)
    return unavailable("resource_limit");
  const semanticAtoms = atomsFor(normalForm);
  const previewHash = hashGroupedImportCommandAtoms(semanticAtoms);
  return {
    ...flags,
    state: "prepared",
    normalForm,
    semanticAtoms,
    previewHash,
    selectedGroupIds: groups.map((group) => group.id),
  };
}

/** Prospective semantics only; no approval, current-prefix CAS or storage access. */
export function prepareGroupedOriginalCommand(
  rawEvidence: unknown,
  ownedContext: GroupedOriginalOwnedContext,
  rawPreviewRequest: unknown,
): GroupedOriginalCommandPreparation {
  if (!preflight(rawPreviewRequest, false))
    return unavailable("invalid_command");
  const parsed =
    GroupedOriginalPreviewRequestSchema.safeParse(rawPreviewRequest);
  if (!parsed.success) return unavailable("invalid_command");
  try {
    return prepare(rawEvidence, ownedContext, parsed.data);
  } catch {
    return unavailable("association_unavailable");
  }
}

/** Preserve the submitted capture for later exact replay before fresh admission. */
export function normalizeGroupedOriginalCommand(
  rawEvidence: unknown,
  ownedContext: GroupedOriginalOwnedContext,
  rawCommitCommand: unknown,
): GroupedOriginalCommandNormalization {
  if (!preflight(rawCommitCommand, true)) return unavailable("invalid_command");
  const parsed = GroupedOriginalCommandSchema.safeParse(rawCommitCommand);
  if (!parsed.success) return unavailable("invalid_command");
  try {
    const prepared = prepare(rawEvidence, ownedContext, parsed.data);
    if (prepared.state !== "prepared") return prepared;
    if (prepared.previewHash !== parsed.data.previewHash)
      return unavailable("preview_mismatch");
    return {
      ...prepared,
      command: parsed.data,
      idempotencyKey: parsed.data.idempotencyKey,
    };
  } catch {
    return unavailable("association_unavailable");
  }
}
