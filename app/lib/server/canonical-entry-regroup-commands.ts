import { z } from "zod";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupInput,
} from "./canonical-entry-regroup";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import { hashGroupedImportCommandAtoms } from "./grouped-import-command-codec";

const uuid = z.uuid().regex(/^[a-f0-9-]+$/),
  sha256 = z.string().regex(/^[a-f0-9]{64}$/);
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
  producerVersion: z.literal("canonical-engine/1.0.4"),
  admissionPolicyVersion: z.literal("whole-entry-regroup-admission/1.0.0"),
  structuralTextProfileVersion: z.literal("a02-structural-text/1.0.0"),
  correctionProjectionModelVersion: z.literal("canonical-corrections/1.0.1"),
  correctionAdmissionPolicyVersion: z.literal(
    "candidate-correction-admission/1.0.0",
  ),
  regroupModelVersion: z.literal("canonical-entry-regroup/1.0.0"),
};
const baseShape = {
  versionId: uuid,
  revision: z.number().int().min(1).max(2_147_483_646),
  contentSha256: sha256,
  locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
};
const expectedShape = {
  reviewRevision: revision,
  reviewHeadId: uuid.nullable(),
  assignmentRevision: revision,
  assignmentHeadId: uuid.nullable(),
  associationRevision: revision,
  associationHeadId: uuid.nullable(),
  regroupRevision: revision,
  regroupHeadId: uuid.nullable(),
  canonicalHeadId: uuid,
};
const expectedSchema = z
  .strictObject(expectedShape)
  .refine(
    (v) =>
      (v.reviewRevision === 0) === (v.reviewHeadId === null) &&
      (v.assignmentRevision === 0) === (v.assignmentHeadId === null) &&
      (v.associationRevision === 0) === (v.associationHeadId === null) &&
      (v.regroupRevision === 0) === (v.regroupHeadId === null),
  );
const requestShape = {
  schemaVersion: z.literal("canonical-entry-regroup-command/1.0.0"),
  operation: z.literal("approve_whole_entry_regroup"),
  binding: z.strictObject(bindingShape),
  base: z.strictObject(baseShape),
  expected: expectedSchema,
  selections: z
    .array(
      z.strictObject({
        groupId: z.string().regex(/^entry-association-[a-f0-9]{64}$/),
        factIds: z.array(uuid).min(2).max(3),
      }),
    )
    .min(1)
    .max(32),
  unselectedDisposition: z.literal("retain_eligible_original_origins"),
};
function coherent(v: {
  base: { versionId: string };
  expected: { canonicalHeadId: string };
  selections: { groupId: string; factIds: string[] }[];
}) {
  const groups = v.selections.map((s) => s.groupId),
    facts = v.selections.flatMap((s) => s.factIds);
  return (
    v.expected.canonicalHeadId === v.base.versionId &&
    new Set(groups).size === groups.length &&
    new Set(facts).size === facts.length
  );
}
export const CanonicalEntryRegroupRequestSchema = z
  .strictObject(requestShape)
  .refine(coherent);
export const CanonicalEntryRegroupCommandSchema = z
  .strictObject({
    ...requestShape,
    acknowledgement: z.literal(true),
    previewHash: sha256,
    idempotencyKey: uuid,
  })
  .refine(coherent);
export type CanonicalEntryRegroupRequest = z.infer<
  typeof CanonicalEntryRegroupRequestSchema
>;
export type CanonicalEntryRegroupCommand = z.infer<
  typeof CanonicalEntryRegroupCommandSchema
>;
export type CanonicalEntryRegroupCommandContext = {
  /** Owned immutable original base/ancestry and original GLOBAL review prefix.
   * The legacy Core's `current` property denotes this historical base view. */
  historicalBaseView: CanonicalEntryRegroupInput;
  /** Native stored content::text digest, supplied by the owned row reader. */
  sqlBaseContentSha256: string;
};
export type CanonicalEntryRegroupNormalForm = {
  schemaVersion: CanonicalEntryRegroupRequest["schemaVersion"];
  operation: CanonicalEntryRegroupRequest["operation"];
  binding: CanonicalEntryRegroupRequest["binding"];
  base: CanonicalEntryRegroupRequest["base"];
  expected: CanonicalEntryRegroupRequest["expected"];
  acknowledgementPolicy: "whole_entry_merge_not_fact_confirmation";
  acknowledgement: true;
  unselectedDisposition: "retain_eligible_original_origins";
  selections: {
    pageId: string;
    method: "native_text" | "local_ocr";
    sectionId: string;
    anchorEntryId: string;
    insertionIndex: number;
    affectedEntryIds: string[];
    members: {
      assertionId: string;
      field: "employer" | "role" | "dates";
      factId: string;
      citations: {
        attemptId: string;
        spanId: string;
        pageId: string;
        method: "native_text" | "local_ocr";
        start: number;
        end: number;
        pageStart: number;
        pageEnd: number;
      }[];
      mappedThrough: "current_citations" | "owned_ancestor_chain";
      originVersionId: string | null;
      location: {
        kind: "entry" | "bullet";
        sectionId: string;
        entryId: string;
        bulletId: string | null;
      };
    }[];
  }[];
};
const flags = {
  authority: "derived_review_only",
  persistable: false,
  scoringEligible: false,
  requiresDurableAdmission: true,
} as const;
export type CanonicalEntryRegroupCommandReason =
  | "invalid_command"
  | "binding_mismatch"
  | "captured_history_mismatch"
  | "association_unavailable"
  | "invalid_selection"
  | "preparation_unavailable"
  | "resource_limit"
  | "preview_mismatch";
type Prepared = typeof flags & {
  state: "prepared";
  normalForm: CanonicalEntryRegroupNormalForm;
  semanticAtoms: (string | null)[];
  previewHash: string;
};
type Unavailable = typeof flags & {
  state: "unavailable";
  reason: CanonicalEntryRegroupCommandReason;
};
export type CanonicalEntryRegroupCommandPreparation = Prepared | Unavailable;
export type CanonicalEntryRegroupCommandNormalization =
  | (Prepared & {
      command: CanonicalEntryRegroupCommand;
      idempotencyKey: string;
    })
  | Unavailable;
const unavailable = (
  reason: CanonicalEntryRegroupCommandReason,
): Unavailable => ({ ...flags, state: "unavailable", reason });
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function bounded(v: unknown, keys: readonly string[]) {
  if (!record(v)) return false;
  let count = 0;
  for (const key in v) {
    if (!Object.hasOwn(v, key)) continue;
    if (++count > keys.length || !keys.includes(key)) return false;
    if (typeof v[key] === "string" && v[key].length > 200) return false;
  }
  return count === keys.length;
}
function preflight(raw: unknown, commit: boolean) {
  if (
    !bounded(raw, [
      ...Object.keys(requestShape),
      ...(commit ? ["acknowledgement", "previewHash", "idempotencyKey"] : []),
    ]) ||
    !record(raw) ||
    !bounded(raw.binding, Object.keys(bindingShape)) ||
    !bounded(raw.base, Object.keys(baseShape)) ||
    !bounded(raw.expected, Object.keys(expectedShape)) ||
    !Array.isArray(raw.selections) ||
    raw.selections.length < 1 ||
    raw.selections.length > 32
  )
    return false;
  for (let i = 0; i < raw.selections.length; i++) {
    if (!Object.hasOwn(raw.selections, i)) return false;
    const s = raw.selections[i];
    if (
      !bounded(s, ["groupId", "factIds"]) ||
      !record(s) ||
      !Array.isArray(s.factIds) ||
      s.factIds.length < 2 ||
      s.factIds.length > 3
    )
      return false;
    for (let j = 0; j < s.factIds.length; j++)
      if (
        !Object.hasOwn(s.factIds, j) ||
        typeof s.factIds[j] !== "string" ||
        s.factIds[j].length > 36
      )
        return false;
  }
  return true;
}
function atomsFor(normal: CanonicalEntryRegroupNormalForm): (string | null)[] {
  const atoms: (string | null)[] = [normal.schemaVersion, normal.operation];
  for (const key of Object.keys(bindingShape) as (keyof typeof bindingShape)[])
    atoms.push(normal.binding[key]);
  for (const key of Object.keys(baseShape) as (keyof typeof baseShape)[])
    atoms.push(String(normal.base[key]));
  for (const key of Object.keys(
    expectedShape,
  ) as (keyof typeof expectedShape)[]) {
    const v = normal.expected[key];
    atoms.push(v === null ? null : String(v));
  }
  atoms.push(
    normal.acknowledgementPolicy,
    "1",
    normal.unselectedDisposition,
    String(normal.selections.length),
  );
  for (const group of normal.selections) {
    atoms.push(
      group.pageId,
      group.method,
      group.sectionId,
      group.anchorEntryId,
      String(group.insertionIndex),
      String(group.affectedEntryIds.length),
      ...group.affectedEntryIds,
      String(group.members.length),
    );
    for (const m of group.members) {
      const c = m.citations[0];
      atoms.push(
        m.assertionId,
        m.field,
        m.factId,
        String(m.citations.length),
        c.spanId,
        String(c.start),
        String(c.end),
        String(c.pageStart),
        String(c.pageEnd),
        m.mappedThrough,
        m.originVersionId,
        m.location.kind,
        m.location.entryId,
        m.location.bulletId,
      );
    }
  }
  return atoms;
}
function prepare(
  context: CanonicalEntryRegroupCommandContext,
  request: CanonicalEntryRegroupRequest,
): CanonicalEntryRegroupCommandPreparation {
  if (
    !record(context) ||
    !record(context.historicalBaseView) ||
    !sha256.safeParse(context.sqlBaseContentSha256).success
  )
    return unavailable("binding_mismatch");
  const view = context.historicalBaseView,
    base = view.canonicalSnapshot?.current,
    b = request.binding;
  const scopeKeys = [
    "ownerId",
    "organizationId",
    "resumeId",
    "analysisId",
    "sourceId",
    "attemptId",
    "inputSha256",
  ] as const;
  if (
    !base ||
    !record(view.ownedContext) ||
    scopeKeys.some((k) => b[k] !== view.ownedContext[k]) ||
    request.base.versionId !== view.canonicalSnapshot?.headId ||
    request.base.versionId !== base.versionId ||
    request.base.revision !== view.canonicalRevision ||
    request.base.contentSha256 !== context.sqlBaseContentSha256 ||
    request.base.locale !== base.locale
  )
    return unavailable("binding_mismatch");
  const review = view.review,
    attestation = review?.historyAttestation;
  if (
    !record(review) ||
    !Array.isArray(review.corrections) ||
    review.corrections.length > 1000 ||
    !record(attestation) ||
    review.revision !== request.expected.reviewRevision ||
    review.corrections.length !== request.expected.reviewRevision ||
    (review.corrections.at(-1)?.id ?? null) !== request.expected.reviewHeadId ||
    attestation.highWaterRevision !== request.expected.reviewRevision ||
    attestation.highWaterEventId !== request.expected.reviewHeadId
  )
    return unavailable("captured_history_mismatch");
  const associations = deriveEvidenceEntryAssociations(
    review.evidence,
    view.ownedContext,
  );
  if (associations.state !== "review_required")
    return unavailable("association_unavailable");
  const selected = new Set(request.selections.map((s) => s.groupId));
  const groups = associations.groups.filter((g) => selected.has(g.id));
  if (
    groups.length !== request.selections.length ||
    groups.some(
      (g, i) =>
        g.id !== request.selections[i].groupId ||
        g.members.length !== request.selections[i].factIds.length,
    )
  )
    return unavailable("invalid_selection");
  const prepared = prepareCanonicalEntryRegroup(view, {
    schemaVersion: "canonical-entry-regroup-intent/1.0.0",
    operation: "preview_whole_entry_merge",
    baseVersionId: request.base.versionId,
    baseRevision: request.base.revision,
    selections: groups.map((g, i) => ({
      groupId: g.id,
      members: g.members.map((m, j) => ({
        assertionId: m.assertionId,
        factId: request.selections[i].factIds[j],
      })),
    })),
  });
  if (prepared.state !== "prepared")
    return unavailable(
      prepared.reason === "resource_limit"
        ? "resource_limit"
        : "preparation_unavailable",
    );
  const selections: CanonicalEntryRegroupNormalForm["selections"] = [];
  for (const g of prepared.groups) {
    const members: CanonicalEntryRegroupNormalForm["selections"][number]["members"] =
      [];
    for (const m of g.members) {
      if (
        m.sourceCitations.length !== 1 ||
        m.location.sectionId !== g.sectionId ||
        (m.mappedThrough === "owned_ancestor_chain"
          ? m.originVersionId === null || m.originFactId !== m.factId
          : m.originVersionId !== null || m.originFactId !== null)
      )
        return unavailable("preparation_unavailable");
      const c = m.sourceCitations[0];
      if (
        c.attemptId !== b.attemptId ||
        c.pageId !== g.pageId ||
        c.method !== g.method
      )
        return unavailable("preparation_unavailable");
      members.push({
        assertionId: m.assertionId,
        field: m.field,
        factId: m.factId,
        citations: [
          {
            attemptId: c.attemptId,
            spanId: c.spanId,
            pageId: c.pageId,
            method: c.method,
            start: c.start,
            end: c.end,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
          },
        ],
        mappedThrough: m.mappedThrough,
        originVersionId: m.originVersionId,
        location: {
          kind: m.location.kind,
          sectionId: m.location.sectionId,
          entryId: m.location.entryId,
          bulletId: m.location.bulletId,
        },
      });
    }
    selections.push({
      pageId: g.pageId,
      method: g.method,
      sectionId: g.sectionId,
      anchorEntryId: g.anchorEntryId,
      insertionIndex: g.insertionIndex,
      affectedEntryIds: [...g.affectedEntryIds],
      members,
    });
  }
  const normalForm: CanonicalEntryRegroupNormalForm = {
    schemaVersion: request.schemaVersion,
    operation: request.operation,
    binding: { ...b },
    base: { ...request.base },
    expected: { ...request.expected },
    acknowledgementPolicy: "whole_entry_merge_not_fact_confirmation",
    acknowledgement: true,
    unselectedDisposition: request.unselectedDisposition,
    selections,
  };
  const semanticAtoms = atomsFor(normalForm);
  if (
    semanticAtoms.length > 1700 ||
    Buffer.byteLength(JSON.stringify(normalForm), "utf8") > 262_144
  )
    return unavailable("resource_limit");
  return {
    ...flags,
    state: "prepared",
    normalForm,
    semanticAtoms,
    previewHash: hashGroupedImportCommandAtoms(semanticAtoms),
  };
}
/** Prospective semantics only. No generated IDs, current-head CAS or save authority. */
export function prepareCanonicalEntryRegroupCommand(
  context: CanonicalEntryRegroupCommandContext,
  rawRequest: unknown,
): CanonicalEntryRegroupCommandPreparation {
  if (!preflight(rawRequest, false)) return unavailable("invalid_command");
  const parsed = CanonicalEntryRegroupRequestSchema.safeParse(rawRequest);
  if (!parsed.success) return unavailable("invalid_command");
  try {
    return prepare(context, parsed.data);
  } catch {
    return unavailable("preparation_unavailable");
  }
}
/** Normalize the retained ORIGINAL request; never rebase onto today's head/history. */
export function normalizeCanonicalEntryRegroupCommand(
  context: CanonicalEntryRegroupCommandContext,
  rawCommand: unknown,
): CanonicalEntryRegroupCommandNormalization {
  if (!preflight(rawCommand, true)) return unavailable("invalid_command");
  const parsed = CanonicalEntryRegroupCommandSchema.safeParse(rawCommand);
  if (!parsed.success) return unavailable("invalid_command");
  try {
    const prepared = prepare(context, parsed.data);
    if (prepared.state !== "prepared") return prepared;
    if (prepared.previewHash !== parsed.data.previewHash)
      return unavailable("preview_mismatch");
    return {
      ...prepared,
      command: parsed.data,
      idempotencyKey: parsed.data.idempotencyKey,
    };
  } catch {
    return unavailable("preparation_unavailable");
  }
}
