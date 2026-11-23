import { z } from "zod";
import type { CanonicalResumeDraft } from "./canonical-resume-schema";
import type { compareCanonical } from "./canonical-content";
import type { CanonicalCorrectionProjection } from "./canonical-corrections";

export const CANONICAL_CORRECTION_COMMAND_VERSION =
  "candidate-correction-command/1.0.0" as const;
export const CANONICAL_CORRECTION_ADMISSION_VERSION =
  "candidate-correction-admission/1.0.0" as const;
const uuid = z.uuid().refine((value) => value === value.toLowerCase());
const identifier = z.string().min(1).max(200).refine(validText);
const version = z.string().min(1).max(100).refine(validText);
const revision = z.number().int().nonnegative().max(2_147_483_647);
function validText(value: string) {
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n === 0) return false;
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
const locationShape = z.strictObject({
  kind: z.enum([
    "contact",
    "section",
    "entry",
    "bullet",
    "new_entry",
    "new_section_entry",
  ]),
  sectionId: uuid.nullable(),
  entryId: uuid.nullable(),
  bulletId: uuid.nullable(),
  newSectionType: z
    .enum([
      "summary",
      "experience",
      "education",
      "skills",
      "certifications",
      "projects",
      "other",
    ])
    .nullable(),
  newSectionTitle: z
    .string()
    .min(1)
    .max(100)
    .refine((s) => s === s.trim() && validText(s))
    .nullable(),
});
export const CanonicalCorrectionLocationSchema = locationShape.refine((v) => {
  const existing = v.newSectionType === null && v.newSectionTitle === null;
  if (v.kind === "contact")
    return (
      existing &&
      v.sectionId === null &&
      v.entryId === null &&
      v.bulletId === null
    );
  if (v.kind === "section" || v.kind === "new_entry")
    return (
      existing &&
      v.sectionId !== null &&
      v.entryId === null &&
      v.bulletId === null
    );
  if (v.kind === "entry")
    return (
      existing &&
      v.sectionId !== null &&
      v.entryId !== null &&
      v.bulletId === null
    );
  if (v.kind === "bullet")
    return (
      existing &&
      v.sectionId !== null &&
      v.entryId !== null &&
      v.bulletId !== null
    );
  return (
    v.sectionId === null &&
    v.entryId === null &&
    v.bulletId === null &&
    v.newSectionType !== null &&
    v.newSectionTitle !== null
  );
});
export type CanonicalCorrectionLocation = z.infer<
  typeof CanonicalCorrectionLocationSchema
>;
export const CanonicalCorrectionAssignmentSelectorSchema = z
  .strictObject({
    eventId: uuid,
    targetKind: z.enum(["observed_assertion", "unobserved_field"]),
    assertionId: z.string().min(1).max(100).refine(validText).nullable(),
    opaqueTargetId: identifier,
    mappingMode: z.enum(["existing", "imported_assertion", "add"]),
    baseVersionId: uuid.nullable(),
    factId: uuid.nullable(),
    mappingProofKind: z.enum([
      "current_citations",
      "owned_origin_chain",
      "explicit_candidate_add",
    ]),
    originVersionId: uuid.nullable(),
    originFactId: uuid.nullable(),
    location: locationShape,
    supersedesAssignmentId: uuid.nullable(),
  })
  .superRefine((v, c) => {
    const fail = () =>
      c.addIssue({
        code: "custom",
        message: "Choose a consistent source and canonical target.",
      });
    if ((v.targetKind === "observed_assertion") !== (v.assertionId !== null))
      fail();
    if ((v.baseVersionId === null) !== (v.factId === null)) fail();
    if ((v.originVersionId === null) !== (v.originFactId === null)) fail();
    // Initial import has no allocated canonical entry IDs yet. Only that mode
    // uses the null placement tuple; existing/add keep real placement checks.
    if (
      v.mappingMode !== "imported_assertion" &&
      !CanonicalCorrectionLocationSchema.safeParse(v.location).success
    )
      fail();
    if (
      (v.mappingProofKind === "owned_origin_chain") !==
      (v.originVersionId !== null)
    )
      fail();
    if (
      v.mappingMode === "existing" &&
      (v.baseVersionId === null ||
        v.mappingProofKind === "explicit_candidate_add")
    )
      fail();
    if (
      v.mappingMode === "imported_assertion" &&
      (v.targetKind !== "observed_assertion" ||
        v.baseVersionId !== null ||
        v.mappingProofKind !== "current_citations" ||
        !["contact", "entry"].includes(v.location.kind) ||
        [
          v.location.sectionId,
          v.location.entryId,
          v.location.bulletId,
          v.location.newSectionType,
          v.location.newSectionTitle,
        ].some((x) => x !== null))
    )
      fail();
    if (
      v.mappingMode === "add" &&
      (v.baseVersionId !== null ||
        v.mappingProofKind !== "explicit_candidate_add")
    )
      fail();
  });
export type CanonicalCorrectionAssignmentSelector = z.infer<
  typeof CanonicalCorrectionAssignmentSelectorSchema
>;
export const CanonicalCorrectionApplySelectorSchema = z.strictObject({
  assignmentId: uuid,
  priorApplicationId: uuid.nullable(),
});
const common = {
  schemaVersion: z.literal(CANONICAL_CORRECTION_COMMAND_VERSION),
  idempotencyKey: uuid,
  sourceId: uuid,
  attemptId: uuid,
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  evidenceSchemaVersion: z.literal("evidence/2.0.0"),
  fieldExtractorVersion: version.nullable(),
  targetModelVersion: z.literal("evidence-targets/1.0.0"),
  projectionModelVersion: z.literal("canonical-corrections/1.0.1"),
  admissionPolicyVersion: z.literal(CANONICAL_CORRECTION_ADMISSION_VERSION),
  expectedReviewRevision: revision,
  expectedAssignmentRevision: revision,
  expectedVersionId: uuid.nullable(),
  acknowledgement: z.literal(true),
};
export const CanonicalCorrectionCommandSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...common,
      kind: z.literal("assign"),
      selectors: z
        .array(CanonicalCorrectionAssignmentSelectorSchema)
        .min(1)
        .max(32),
    }),
    ...(["apply", "add", "reapply"] as const).map((kind) =>
      z.strictObject({
        ...common,
        kind: z.literal(kind),
        selectors: z
          .array(CanonicalCorrectionApplySelectorSchema)
          .min(1)
          .max(32),
      }),
    ),
  ])
  .superRefine((command, context) => {
    const keys = command.selectors.map((selector) =>
      "eventId" in selector ? selector.eventId : selector.assignmentId,
    );
    if (
      new Set(keys).size !== keys.length ||
      Buffer.byteLength(JSON.stringify(command), "utf8") > 65_536
    )
      context.addIssue({
        code: "custom",
        message: "Choose distinct targets within the operation limit.",
      });
    if (
      command.kind !== "assign" &&
      command.selectors.some(
        (selector) =>
          (selector.priorApplicationId !== null) !==
          (command.kind === "reapply"),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Reapplication must identify the prior application.",
      });
  });
export type CanonicalCorrectionCommand = z.infer<
  typeof CanonicalCorrectionCommandSchema
>;

export type CanonicalCorrectionWorkspaceBinding = {
  ownerId: string;
  organizationId: string;
  resumeId: string;
  analysisId: string;
  sourceId: string;
  attemptId: string;
  inputSha256: string;
  evidenceSchemaVersion: "evidence/2.0.0";
  fieldExtractorVersion: string | null;
  targetModelVersion: "evidence-targets/1.0.0";
  projectionModelVersion: "canonical-corrections/1.0.1";
  admissionPolicyVersion: typeof CANONICAL_CORRECTION_ADMISSION_VERSION;
  reviewRevision: number;
  assignmentRevision: number;
  canonicalHeadId: string | null;
};
export type CanonicalCorrectionAssignmentOption = {
  id: string;
  label: string;
  selector: CanonicalCorrectionAssignmentSelector;
};
export type CanonicalCorrectionSourceChoice = {
  targetId: string;
  assertionId: string | null;
  field: string;
  label: string;
  quote: string | null;
  references: Array<{
    pageId: string;
    method: "native_text" | "local_ocr";
    spanId: string;
    start: number;
    end: number;
  }>;
};
export type CanonicalCorrectionWorkspaceItem = {
  event: CanonicalCorrectionProjection["items"][number]["event"];
  projectionState: CanonicalCorrectionProjection["items"][number]["state"];
  state:
    | "needs_assignment"
    | "ready_to_apply"
    | "requires_add"
    | "needs_reassignment"
    | "needs_reapply"
    | "applied"
    | "blocked"
    | "stale"
    | "superseded";
  currentValue: string | null;
  proposedValue: string | null;
  sourceChoices: CanonicalCorrectionSourceChoice[];
  assignmentOptions: CanonicalCorrectionAssignmentOption[];
  placementOptions: Array<{
    id: string;
    label: string;
    location: CanonicalCorrectionLocation;
  }>;
  assignment: {
    id: string;
    label: string;
    revision: number;
    baseVersionId: string | null;
    mappingMode: "existing" | "imported_assertion" | "add";
  } | null;
  applications: Array<{
    id: string;
    assignmentId: string;
    resultVersionId: string;
    resultFactId: string;
    active: boolean;
  }>;
  priorApplicationId: string | null;
  actionKeys: Record<"assign" | "apply" | "add" | "reapply", string>;
  confirmationGranted: false;
};
export type CanonicalCorrectionWorkspace = {
  analysisId: string;
  resumeId: string;
  current: {
    document: CanonicalResumeDraft;
    revision: number;
    sourceId: string;
  } | null;
  headId: string | null;
  history: Array<{
    id: string;
    parent_version_id: string | null;
    revision: number;
    created_at: string;
  }>;
  nextOffset: number | null;
  comparison: ReturnType<typeof compareCanonical> | null;
  scoringEligible: false;
  corrections: {
    schemaVersion: "canonical-correction-workspace/1.0.0";
    writeReady: boolean;
    binding: CanonicalCorrectionWorkspaceBinding;
    projection: CanonicalCorrectionProjection;
    items: CanonicalCorrectionWorkspaceItem[];
    snapshot: {
      state: "legacy_unrecorded" | "recorded";
      originKind: string | null;
      restoredFromVersionId: string | null;
      activeApplicationIds: string[];
    };
  };
};
export type CanonicalCorrectionResult = {
  schemaVersion: "candidate-correction-result/1.0.0";
  status: "assigned" | "applied";
  kind: "assign" | "apply" | "add" | "reapply";
  idempotencyKey: string;
  operationId: string;
  versionId: string | null;
  revision: number | null;
  assignmentRevision: number;
  assignmentIds: string[];
  childVersionIds: string[];
  idempotent: boolean;
  scoringEligible: false;
};

/** Bounded JSON form parsing. Duplicate decoded keys must not become a different
 * selector merely because JSON.parse otherwise keeps its final occurrence. */
export function parseCanonicalCorrectionJson(
  text: string,
): CanonicalCorrectionCommand {
  if (Buffer.byteLength(text, "utf8") > 65_536)
    throw Error("CORRECTION_COMMAND_LIMIT");
  const frames: Array<{ kind: string; key: boolean; keys: Set<string> }> = [];
  let nodes = 0;
  for (const match of text.matchAll(
    /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu,
  )) {
    if (++nodes > 4096) throw Error("CORRECTION_COMMAND_LIMIT");
    const token = match[0],
      frame = frames.at(-1);
    if (token === "{" || token === "[") {
      if (frames.length >= 8) throw Error("CORRECTION_COMMAND_LIMIT");
      frames.push({ kind: token, key: token === "{", keys: new Set() });
    } else if (token === "}" || token === "]") frames.pop();
    else if (token === "," && frame?.kind === "{") frame.key = true;
    else if (token.startsWith('"') && frame?.kind === "{" && frame.key) {
      const key: unknown = JSON.parse(token);
      if (typeof key !== "string" || frame.keys.has(key))
        throw Error("CORRECTION_COMMAND_DUPLICATE");
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return CanonicalCorrectionCommandSchema.parse(JSON.parse(text));
}

const scope = {
  owner_id: uuid,
  organization_id: uuid,
  resume_id: uuid,
  analysis_id: uuid,
  source_resume_version_id: uuid,
  attempt_id: uuid,
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
};
const time = z.iso.datetime({ offset: true });
const operationRow = z.object({
  ...scope,
  id: uuid,
  actor_id: uuid,
  kind: z.enum(["assign", "apply", "add", "reapply"]),
  idempotency_key: uuid,
  expected_review_revision: revision,
  expected_assignment_revision: revision,
  expected_canonical_version_id: uuid.nullable(),
  selected_assignment_ids: z.array(uuid).min(1).max(32),
  initial_import_version_id: uuid.nullable(),
  result_version_id: uuid.nullable(),
  result_revision: z.number().int().positive().nullable(),
  result_assignment_revision: revision,
  child_version_ids: z.array(uuid).max(33),
  command_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  created_at: time,
  target_model_version: common.targetModelVersion,
  projection_model_version: common.projectionModelVersion,
  admission_policy_version: common.admissionPolicyVersion,
  evidence_schema_version: common.evidenceSchemaVersion,
  field_extractor_version: common.fieldExtractorVersion,
  command_codec_version: z.literal("c02-command-bytes/1.0.0"),
});
const assignmentRow = z.object({
  ...scope,
  id: uuid,
  actor_id: uuid,
  operation_id: uuid,
  assignment_revision: revision.refine((n) => n > 0),
  expected_assignment_revision: revision,
  correction_event_id: uuid,
  correction_revision: revision.refine((n) => n > 0),
  field: z.enum([
    "name",
    "email",
    "phone",
    "employer",
    "role",
    "dates",
    "education",
    "certification",
  ]),
  event_operation: z.literal("correct"),
  target_kind: z.enum(["observed_assertion", "unobserved_field"]),
  assertion_id: z.string().min(1).max(100).nullable(),
  opaque_target_id: identifier,
  supersedes_assignment_id: uuid.nullable(),
  mapping_mode: z.enum(["existing", "imported_assertion", "add"]),
  base_version_id: uuid.nullable(),
  fact_id: uuid.nullable(),
  mapping_proof_kind: z.enum([
    "current_citations",
    "owned_origin_chain",
    "explicit_candidate_add",
  ]),
  origin_version_id: uuid.nullable(),
  origin_fact_id: uuid.nullable(),
  location_kind: CanonicalCorrectionLocationSchema.shape.kind,
  section_id: uuid.nullable(),
  entry_id: uuid.nullable(),
  bullet_id: uuid.nullable(),
  new_section_type: locationShape.shape.newSectionType,
  new_section_title: locationShape.shape.newSectionTitle,
  created_at: time,
  target_model_version: common.targetModelVersion,
});
const applicationRow = z.object({
  ...scope,
  id: uuid,
  actor_id: uuid,
  operation_id: uuid,
  assignment_id: uuid,
  step_ordinal: z.number().int().min(1).max(32),
  base_version_id: uuid.nullable(),
  result_version_id: uuid,
  result_fact_id: uuid,
  supersedes_application_id: uuid.nullable(),
  created_at: time,
});
const snapshotRow = z.object({
  canonical_version_id: uuid,
  owner_id: uuid,
  organization_id: uuid,
  resume_id: uuid,
  source_resume_version_id: uuid,
  source_operation_id: uuid.nullable(),
  origin_kind: z.enum([
    "raw_import",
    "inherited",
    "correction",
    "restore",
    "legacy_restore",
  ]),
  inherited_from_version_id: uuid.nullable(),
  restored_from_version_id: uuid.nullable(),
  admission_policy_version: common.admissionPolicyVersion,
  created_at: time,
});
export const CanonicalCorrectionLedgerSchema = z.strictObject({
  schemaVersion: z.literal("candidate-correction-ledger/1.0.0"),
  status: z.literal("ready"),
  writeReady: z.boolean(),
  scoringEligible: z.literal(false),
  binding: z.strictObject({
    ownerId: uuid,
    organizationId: uuid,
    resumeId: uuid,
    analysisId: uuid,
    sourceId: uuid,
    attemptId: uuid,
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    evidenceSchemaVersion: common.evidenceSchemaVersion,
    fieldExtractorVersion: common.fieldExtractorVersion,
    targetModelVersion: common.targetModelVersion,
    projectionModelVersion: common.projectionModelVersion,
    admissionPolicyVersion: common.admissionPolicyVersion,
  }),
  reviewRevision: revision,
  assignmentRevision: revision,
  headId: uuid.nullable(),
  operations: z.array(operationRow).max(1000),
  assignments: z.array(assignmentRow).max(1000),
  applications: z.array(applicationRow).max(1000),
  snapshots: z.array(snapshotRow).max(1000),
  snapshotFacts: z
    .array(
      z.object({
        canonical_version_id: uuid,
        fact_id: uuid,
        owner_id: uuid,
        organization_id: uuid,
        application_id: uuid,
      }),
    )
    .max(20_000),
});
export type CanonicalCorrectionLedger = z.infer<
  typeof CanonicalCorrectionLedgerSchema
>;
export const CanonicalCorrectionResultSchema = z
  .strictObject({
    schemaVersion: z.literal("candidate-correction-result/1.0.0"),
    status: z.enum(["assigned", "applied"]),
    kind: z.enum(["assign", "apply", "add", "reapply"]),
    idempotencyKey: uuid,
    operationId: uuid,
    versionId: uuid.nullable(),
    revision: z.number().int().positive().nullable(),
    assignmentRevision: revision,
    assignmentIds: z.array(uuid).min(1).max(32),
    childVersionIds: z.array(uuid).max(33),
    idempotent: z.boolean(),
    scoringEligible: z.literal(false),
  })
  .superRefine((v, c) => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (
      (v.status === "assigned") !== (v.kind === "assign") ||
      !unique(v.assignmentIds) ||
      !unique(v.childVersionIds) ||
      (v.versionId === null) !== (v.revision === null) ||
      (v.status === "assigned"
        ? v.childVersionIds.length !== 0
        : v.versionId === null || v.childVersionIds.at(-1) !== v.versionId)
    )
      c.addIssue({ code: "custom", message: "Invalid correction receipt." });
  });
