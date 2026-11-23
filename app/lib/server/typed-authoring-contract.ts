import { hashTypedAuthoringCommandAtoms } from "./typed-authoring-command-codec";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  RequirementRelationshipContextSchema,
  validateRequirementRelationshipContext,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "./requirement-relationship-context";
import { buildTypedScoreDiagnostics } from "./typed-score-diagnostics";
import {
  deriveRequirementSemanticEvidence,
  REQUIREMENT_SEMANTIC_POLICY_VERSION,
  REQUIREMENT_SEMANTIC_POLICY_SHA256,
} from "./requirement-semantic-evidence";
import {
  REQUIREMENT_COVERAGE_POLICY_VERSION,
  REQUIREMENT_COVERAGE_POLICY_SHA256,
} from "./requirement-coverage";
import { REQUIREMENT_DURATION_POLICY } from "./requirement-duration";
import {
  JOB_DURATION_SUBJECT_POLICY_VERSION,
  JOB_DURATION_SUBJECT_POLICY_SHA256,
} from "./job-duration-subject";
import {
  buildWritingSupportDocument,
  assessWritingSupport,
  WRITING_SUPPORT_POLICY_VERSION,
} from "./writing-support";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().min(1).max(2_147_483_647);
const contextSchema = RequirementRelationshipContextSchema.options[0];
const source = contextSchema.shape.source;
const citation =
  contextSchema.shape.headerSnapshot.shape.groups.element.shape.sourceSelection
    .shape.members.element.shape.citations.element;
export const TYPED_AUTHORING_POLICY_VERSION =
  "typed-authoring-rules/1.0.0" as const;
export const TYPED_AUTHORING_POLICY = Object.freeze({
  version: TYPED_AUTHORING_POLICY_VERSION,
  transform:
    "leading Built/Created/Developed only; lower/title case; remaining UTF8 bytes identical; exact copy is noop",
  support:
    "actual full-current confirmed contribution witness; sourceClause=null; current_fact offsets; unique entry/bullet reference",
  writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
  numerics: "withheld; score and delta null",
  limits: Object.freeze({
    sourceCitations: 20,
    clauseIds: 1,
    commandUtf8Bytes: 16384,
    proposals: 1,
  }),
});
export const TYPED_AUTHORING_POLICY_SHA256 = sha(
  JSON.stringify(TYPED_AUTHORING_POLICY),
);
export const TypedAuthoringPoliciesSchema = z.strictObject({
  authoringVersion: z.literal(TYPED_AUTHORING_POLICY_VERSION),
  authoringSha256: z.literal(TYPED_AUTHORING_POLICY_SHA256),
  writingSupportVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
  coverageVersion: z.literal(REQUIREMENT_COVERAGE_POLICY_VERSION),
  coverageSha256: z.literal(REQUIREMENT_COVERAGE_POLICY_SHA256),
  semanticVersion: z.literal(REQUIREMENT_SEMANTIC_POLICY_VERSION),
  semanticSha256: z.literal(REQUIREMENT_SEMANTIC_POLICY_SHA256),
  durationVersion: z.literal(REQUIREMENT_DURATION_POLICY.version),
  durationSha256: z.literal(sha(JSON.stringify(REQUIREMENT_DURATION_POLICY))),
  durationSubjectVersion: z.literal(JOB_DURATION_SUBJECT_POLICY_VERSION),
  durationSubjectSha256: z.literal(JOB_DURATION_SUBJECT_POLICY_SHA256),
});
export const TYPED_AUTHORING_POLICIES = TypedAuthoringPoliciesSchema.parse({
  authoringVersion: TYPED_AUTHORING_POLICY_VERSION,
  authoringSha256: TYPED_AUTHORING_POLICY_SHA256,
  writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
  coverageVersion: REQUIREMENT_COVERAGE_POLICY_VERSION,
  coverageSha256: REQUIREMENT_COVERAGE_POLICY_SHA256,
  semanticVersion: REQUIREMENT_SEMANTIC_POLICY_VERSION,
  semanticSha256: REQUIREMENT_SEMANTIC_POLICY_SHA256,
  durationVersion: REQUIREMENT_DURATION_POLICY.version,
  durationSha256: sha(JSON.stringify(REQUIREMENT_DURATION_POLICY)),
  durationSubjectVersion: JOB_DURATION_SUBJECT_POLICY_VERSION,
  durationSubjectSha256: JOB_DURATION_SUBJECT_POLICY_SHA256,
});
export const TypedAuthoringSelectionSchema = z.strictObject({
  canonicalVersionId: uuid,
  requirementVersionId: uuid,
  clauseId: digest,
  targetFactId: uuid,
});
export type TypedAuthoringSelection = z.infer<
  typeof TypedAuthoringSelectionSchema
>;
export const TypedAuthoringBindingSchema = z.strictObject({
  source,
  canonical: z.strictObject({
    versionId: uuid,
    revision,
    contentSha256: digest,
  }),
  requirements: z.strictObject({
    versionId: uuid,
    revision,
    inputSha256: digest,
    contentSha256: digest,
  }),
  heads: contextSchema.shape.heads,
  profilesSha256: z.literal(
    sha(JSON.stringify(REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES)),
  ),
});
const action = z.enum(["Built", "Created", "Developed"]);
export const TypedAuthoringTransformSchema = z.strictObject({
  from: action,
  to: action,
  case: z.enum(["lower", "title"]),
  restSha256: digest,
});
export const TypedAuthoringTargetSchema = z.strictObject({
  factId: uuid,
  sectionId: uuid,
  entryId: uuid,
  bulletId: uuid.nullable(),
  currentValueSha256: digest,
  confirmationActorId: uuid,
  confirmedAt: z.iso.datetime(),
});
const commandFields = {
  schemaVersion: z.literal("typed-authoring-command/1.0.0"),
  operation: z.enum(["accept", "reject"]),
  idempotencyKey: uuid,
  acknowledgement: z.boolean(),
  binding: TypedAuthoringBindingSchema,
  diagnosticDigest: digest,
  coverageDigest: digest,
  semanticDigest: digest,
  policies: TypedAuthoringPoliciesSchema,
  target: TypedAuthoringTargetSchema,
  clauseIds: z.array(digest).length(1),
  transform: TypedAuthoringTransformSchema,
  sourceCitations: z.array(citation).max(20),
};
export const TypedAuthoringCommandSchema = z
  .strictObject(commandFields)
  .superRefine((value, ctx) => {
    if (
      value.acknowledgement !== (value.operation === "accept") ||
      (value.operation === "accept" &&
        value.binding.canonical.revision > 2_147_483_645) ||
      value.transform.from === value.transform.to ||
      value.target.confirmationActorId !== value.binding.source.ownerId ||
      value.binding.canonical.versionId !==
        value.binding.heads.canonicalHeadId ||
      value.binding.canonical.revision !==
        value.binding.heads.canonicalHeadRevision ||
      value.binding.requirements.versionId !==
        value.binding.heads.requirementHeadId ||
      value.binding.requirements.revision !==
        value.binding.heads.requirementHeadRevision
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid typed authoring command binding",
      });
  });
export type TypedAuthoringCommand = z.infer<typeof TypedAuthoringCommandSchema>;
export const TypedAuthoringSupportSchema = z.strictObject({
  basis: z.enum(["source_quote", "candidate_declaration"]),
  witnessId: z.string().regex(/^semantic-witness-[a-f0-9]{64}$/u),
  sourceClause: z.null(),
  offsetSpace: z.literal("current_fact"),
  sourceSha256: digest,
  writingSupportVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
  sourceAnchorIds: z.array(z.string().min(1).max(100)).min(1).max(20),
  operations: z
    .array(
      z.enum([
        "copy_source",
        "normalize_layout",
        "replace_equivalent_action",
        "reorder_independent_clauses",
        "compose_explicit_role_contribution",
        "editorial_explanation",
      ]),
    )
    .min(1)
    .max(20),
});
export const TypedAuthoringPatchSchema = z.strictObject({
  schemaVersion: z.literal("typed-authoring-patch/1.0.0"),
  id: digest,
  selection: TypedAuthoringSelectionSchema,
  binding: TypedAuthoringBindingSchema,
  diagnosticDigest: digest,
  coverageDigest: digest,
  semanticDigest: digest,
  policies: TypedAuthoringPoliciesSchema,
  target: TypedAuthoringTargetSchema,
  transform: TypedAuthoringTransformSchema,
  sourceCitations: z.array(citation).max(20),
  before: z.string().min(1).max(2000),
  after: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(500),
  support: TypedAuthoringSupportSchema,
  scoreValue: z.null(),
  scoreDelta: z.null(),
});
export type TypedAuthoringPatch = z.infer<typeof TypedAuthoringPatchSchema>;
export const TypedAuthoringReceiptSchema = z.strictObject({
  schemaVersion: z.literal("typed-authoring-receipt/1.0.0"),
  status: z.literal("applied"),
  action: z.enum(["accept", "reject"]),
  idempotencyKey: uuid,
  commandSha256: digest,
  baseVersionId: uuid,
  baseRevision: revision,
  requirementVersionId: uuid,
  requirementRevision: revision,
  versionId: uuid,
  revision: z.number().int().min(1).max(2_147_483_647),
  eventId: uuid,
  idempotent: z.boolean(),
});
export type TypedAuthoringReceipt = z.infer<typeof TypedAuthoringReceiptSchema>;
export type TypedAuthoringReason =
  | "invalid_input"
  | "invalid_context"
  | "stale_inputs"
  | "incomplete_source_coverage"
  | "unsupported_context"
  | "target_not_editable"
  | "confirmation_required"
  | "ambiguous_location"
  | "fragmented_source_clause"
  | "missing_current_witness"
  | "unsupported_action"
  | "no_change"
  | "writing_support_rejected"
  | "unavailable"
  | "invalid_result";
export class TypedAuthoringError extends Error {
  readonly status: 404 | 409 | 422 | 503;
  constructor(readonly reason: TypedAuthoringReason) {
    super(
      reason === "stale_inputs"
        ? "The reviewed inputs changed. Review the current versions again."
        : reason === "no_change"
          ? "The current wording is unchanged."
          : "Typed authoring is unavailable for this selection. Review the source and current claim.",
    );
    this.status =
      reason === "stale_inputs"
        ? 409
        : ["unavailable", "invalid_result"].includes(reason)
          ? 503
          : 422;
  }
}

export type TypedAuthoringCommandOperation = TypedAuthoringCommand["operation"];
export const TypedAuthoringProposalSchema = z.strictObject({
  patch: TypedAuthoringPatchSchema,
  acceptCommand: TypedAuthoringCommandSchema,
  rejectCommand: TypedAuthoringCommandSchema,
});
export type TypedAuthoringProposal = z.infer<
  typeof TypedAuthoringProposalSchema
>;
export const TypedAuthoringTransportResponseSchema = z.strictObject({
  replacementAction: action,
});
export type TypedAuthoringReplacementAction = z.infer<typeof action>;
const locationSchema = z.strictObject({
  sectionId: uuid,
  entryId: uuid,
  bulletId: uuid.nullable(),
});
export const TypedAuthoringTargetOptionSchema = z.strictObject({
  factId: uuid,
  value: z.string().max(2000),
  state: z.enum(["eligible", "explanation_only"]),
  reason: z.string().min(1).max(100),
  location: locationSchema.nullable(),
});
export const TypedAuthoringWorkspaceSchema = z.strictObject({
  schemaVersion: z.literal("typed-authoring-workspace/1.0.0"),
  binding: TypedAuthoringBindingSchema,
  diagnosticDigest: digest,
  coverageDigest: digest,
  semanticDigest: digest,
  clauses: z
    .array(
      z.strictObject({
        clauseId: digest,
        quote: z.string().max(2000),
        importance: z.enum(["required", "preferred", "contextual", "unknown"]),
        negated: z.boolean(),
        explanation: z.string().max(300),
      }),
    )
    .max(300),
  targets: z.array(TypedAuthoringTargetOptionSchema).max(1000),
  scoreValue: z.null(),
  scoreDelta: z.null(),
});
export type TypedAuthoringWorkspace = z.infer<
  typeof TypedAuthoringWorkspaceSchema
>;
function admitted(raw: unknown) {
  try {
    const key = z
      .object({
        source: z.object({ ownerId: uuid, analysisId: uuid }),
        canonical: z.object({ versionId: uuid }),
        requirements: z.object({ versionId: uuid }),
      })
      .parse(raw);
    const context = validateRequirementRelationshipContext(
      raw,
      key.source.analysisId,
      key.source.ownerId,
      {
        canonicalVersionId: key.canonical.versionId,
        requirementVersionId: key.requirements.versionId,
      },
    );
    const result = buildTypedScoreDiagnostics(context),
      semantic = deriveRequirementSemanticEvidence(context);
    if (semantic.state !== "available")
      throw new TypedAuthoringError("invalid_context");
    const binding = TypedAuthoringBindingSchema.parse({
      source: context.source,
      canonical: {
        versionId: context.canonical.versionId,
        revision: context.canonical.revision,
        contentSha256: context.canonical.contentSha256,
      },
      requirements: {
        versionId: context.requirements.versionId,
        revision: context.requirements.revision,
        inputSha256: context.requirements.inputSha256,
        contentSha256: context.requirements.contentSha256,
      },
      heads: context.heads,
      profilesSha256: sha(JSON.stringify(context.profiles)),
    });
    return {
      context,
      ...result,
      semantic,
      binding,
      diagnosticDigest: result.diagnostics.score.inputSha256,
      coverageDigest: result.typedCoverage.digest,
      semanticDigest: sha(JSON.stringify(semantic)),
    };
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    throw new TypedAuthoringError("invalid_context");
  }
}
type Admitted = ReturnType<typeof admitted>;
function current(a: Admitted) {
  if (
    a.binding.canonical.versionId !== a.binding.heads.canonicalHeadId ||
    a.binding.canonical.revision !== a.binding.heads.canonicalHeadRevision ||
    a.binding.requirements.versionId !== a.binding.heads.requirementHeadId ||
    a.binding.requirements.revision !== a.binding.heads.requirementHeadRevision
  )
    throw new TypedAuthoringError("stale_inputs");
}
function reliability(a: Admitted) {
  if (
    a.diagnostics.readiness.state !== "review_required" ||
    a.context.canonical.locale !== "en-IN" ||
    a.context.requirements.content.state === "unsupported"
  )
    throw new TypedAuthoringError("unsupported_context");
  if (a.diagnostics.readiness.observedPageCoverage !== 1)
    throw new TypedAuthoringError("incomplete_source_coverage");
}
function locations(context: RequirementRelationshipContext, factId: string) {
  const result: z.infer<typeof locationSchema>[] = [],
    doc = context.canonical.content;
  let other = doc.contactFactIds.includes(factId);
  for (const section of doc.sections) {
    other ||= section.factIds.includes(factId);
    for (const entry of section.entries) {
      if (entry.factIds.includes(factId))
        result.push({
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
        });
      for (const bullet of entry.bullets)
        if (bullet.factIds.includes(factId))
          result.push({
            sectionId: section.id,
            entryId: entry.id,
            bulletId: bullet.id,
          });
    }
  }
  if (other || result.length !== 1)
    throw new TypedAuthoringError("ambiguous_location");
  return result[0];
}
function leading(value: string) {
  if (/[\r\n;]/u.test(value) || /\b(?:not|never|without)\b/iu.test(value))
    throw new TypedAuthoringError("unsupported_action");
  const m = /^(Built|Created|Developed|built|created|developed)(?=[ \t])/u.exec(
    value,
  );
  if (!m) throw new TypedAuthoringError("unsupported_action");
  const lower = m[1] === m[1].toLowerCase();
  return {
    from: (m[1][0].toUpperCase() +
      m[1].slice(1).toLowerCase()) as TypedAuthoringReplacementAction,
    case: lower ? ("lower" as const) : ("title" as const),
    rest: value.slice(m[1].length),
  };
}
function target(a: Admitted, factId: string) {
  reliability(a);
  const fact = a.context.canonical.content.facts.find((f) => f.id === factId);
  if (!fact || fact.type !== "contribution")
    throw new TypedAuthoringError("target_not_editable");
  if (fact.state !== "candidate_confirmed" || !fact.confirmation)
    throw new TypedAuthoringError("confirmation_required");
  const location = locations(a.context, factId);
  const all = a.semantic.witnesses.filter((w) => w.factId === factId);
  if (
    all.some((w) => w.sourceClause !== null || w.offsetSpace !== "current_fact")
  )
    throw new TypedAuthoringError("fragmented_source_clause");
  const witness = all.find(
    (w) =>
      w.sourceClause === null &&
      w.offsetSpace === "current_fact" &&
      w.clause.value === fact.value &&
      w.confirmation?.value === fact.value &&
      ["source_contribution", "candidate_responsibility"].includes(w.tier),
  );
  if (!witness) throw new TypedAuthoringError("missing_current_witness");
  const head = leading(fact.value);
  return { fact, location, witness, head };
}
const foldLiteral = (value: string) =>
  value
    .replace(/[A-Z]/gu, (c) => c.toLowerCase())
    .replace(/[\t ]+/gu, " ")
    .trim();
function selected(a: Admitted, rawSelection: unknown, fresh: boolean) {
  let selection: TypedAuthoringSelection;
  try {
    selection = TypedAuthoringSelectionSchema.parse(rawSelection);
  } catch {
    throw new TypedAuthoringError("invalid_input");
  }
  if (
    selection.canonicalVersionId !== a.binding.canonical.versionId ||
    selection.requirementVersionId !== a.binding.requirements.versionId
  )
    throw new TypedAuthoringError("stale_inputs");
  if (fresh) current(a);
  const clause = a.typedCoverage.clauses.find(
    (c) => c.id === selection.clauseId,
  );
  if (
    !clause ||
    clause.scope.negated ||
    !["required", "preferred"].includes(clause.scope.importance)
  )
    throw new TypedAuthoringError("target_not_editable");
  const chosen = target(a, selection.targetFactId);
  const matching = clause.operands.some((o) =>
    o.mapping.conceptId !== null
      ? o.mapping.conceptId === chosen.witness.skill.identity.conceptId
      : foldLiteral(o.value) === chosen.witness.skill.identity.literalKey,
  );
  if (!matching) throw new TypedAuthoringError("missing_current_witness");
  return { selection, clause, ...chosen };
}
export function validateTypedAuthoringSelection(
  rawContext: unknown,
  rawSelection: unknown,
) {
  const a = admitted(rawContext),
    s = selected(a, rawSelection, true);
  if (a.binding.canonical.revision > 2_147_483_645)
    throw new TypedAuthoringError("unsupported_context");
  return {
    selection: s.selection,
    before: s.fact.value,
    clauseQuote: s.clause.evidence.quote,
    binding: a.binding,
  };
}
export function buildTypedAuthoringWorkspace(
  rawContext: unknown,
): TypedAuthoringWorkspace {
  const a = admitted(rawContext);
  current(a);
  const targets = a.context.canonical.content.facts
    .filter((f) => f.type === "contribution" || f.type === "skill")
    .map((f) => {
      try {
        const t = target(a, f.id);
        return {
          factId: f.id,
          value: f.value,
          state: "eligible" as const,
          reason: "whole_current_confirmed_claim",
          location: t.location,
        };
      } catch (error) {
        return {
          factId: f.id,
          value: f.value,
          state: "explanation_only" as const,
          reason:
            error instanceof TypedAuthoringError
              ? error.reason
              : "target_not_editable",
          location: null,
        };
      }
    });
  return TypedAuthoringWorkspaceSchema.parse({
    schemaVersion: "typed-authoring-workspace/1.0.0",
    binding: a.binding,
    diagnosticDigest: a.diagnosticDigest,
    coverageDigest: a.coverageDigest,
    semanticDigest: a.semanticDigest,
    clauses: a.typedCoverage.clauses.map((c) => ({
      clauseId: c.id,
      quote: c.evidence.quote,
      importance: c.scope.importance,
      negated: c.scope.negated,
      explanation: c.explanation,
    })),
    targets,
    scoreValue: null,
    scoreDelta: null,
  });
}
function patchFrom(
  a: Admitted,
  rawSelection: unknown,
  replacement: TypedAuthoringReplacementAction,
  fresh: boolean,
  capturedHeads?: TypedAuthoringCommand["binding"]["heads"],
): TypedAuthoringPatch {
  const s = selected(a, rawSelection, fresh);
  if (s.head.from === replacement) throw new TypedAuthoringError("no_change");
  const word =
    s.head.case === "lower" ? replacement.toLowerCase() : replacement;
  const after = word + s.head.rest;
  const writing = buildWritingSupportDocument(s.fact.value),
    support = assessWritingSupport(writing, {
      kind: "rewrite",
      original: s.fact.value,
      proposed: after,
      expectedSourceSha256: writing.sourceSha256,
      expectedPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
    });
  if (support.state !== "supported")
    throw new TypedAuthoringError("writing_support_rejected");
  const binding = { ...a.binding, heads: capturedHeads ?? a.binding.heads };
  const body = {
    schemaVersion: "typed-authoring-patch/1.0.0" as const,
    selection: s.selection,
    binding,
    diagnosticDigest: a.diagnosticDigest,
    coverageDigest: a.coverageDigest,
    semanticDigest: a.semanticDigest,
    policies: TYPED_AUTHORING_POLICIES,
    target: {
      factId: s.fact.id,
      ...s.location,
      currentValueSha256: sha(s.fact.value),
      confirmationActorId: s.fact.confirmation!.actorId,
      confirmedAt: s.fact.confirmation!.confirmedAt,
    },
    transform: {
      from: s.head.from,
      to: replacement,
      case: s.head.case,
      restSha256: sha(s.head.rest),
    },
    sourceCitations: s.witness.currentSourceCitations,
    before: s.fact.value,
    after,
    rationale:
      "Replaces one equivalent leading action in your current confirmed claim. All remaining bytes and relationships stay unchanged; confirmation is not independent proficiency verification.",
    support: {
      basis: s.witness.basis,
      witnessId: s.witness.id,
      sourceClause: null,
      offsetSpace: "current_fact" as const,
      sourceSha256: writing.sourceSha256,
      writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
      sourceAnchorIds: support.sourceAnchorIds,
      operations: support.operations.map((o) => o.kind),
    },
    scoreValue: null,
    scoreDelta: null,
  };
  return TypedAuthoringPatchSchema.parse({
    ...body,
    id: sha(JSON.stringify(body)),
  });
}
export function buildTypedAuthoringPatch(
  rawContext: unknown,
  rawSelection: unknown,
  replacementAction: unknown,
): TypedAuthoringPatch {
  let replacement: TypedAuthoringReplacementAction;
  try {
    replacement = action.parse(replacementAction);
  } catch {
    throw new TypedAuthoringError("invalid_input");
  }
  const a = admitted(rawContext);
  if (a.binding.canonical.revision > 2_147_483_645)
    throw new TypedAuthoringError("unsupported_context");
  return patchFrom(a, rawSelection, replacement, true);
}
export function createTypedAuthoringCommand(
  rawPatch: unknown,
  operation: TypedAuthoringCommandOperation,
  idempotencyKey: string,
  acknowledgement: boolean,
): TypedAuthoringCommand {
  try {
    const p = TypedAuthoringPatchSchema.parse(rawPatch);
    const command = TypedAuthoringCommandSchema.parse({
      schemaVersion: "typed-authoring-command/1.0.0",
      operation,
      idempotencyKey,
      acknowledgement,
      binding: p.binding,
      diagnosticDigest: p.diagnosticDigest,
      coverageDigest: p.coverageDigest,
      semanticDigest: p.semanticDigest,
      policies: p.policies,
      target: p.target,
      clauseIds: [p.selection.clauseId],
      transform: p.transform,
      sourceCitations: p.sourceCitations,
    });
    if (Buffer.byteLength(JSON.stringify(command), "utf8") > 16384)
      throw new TypedAuthoringError("invalid_input");
    hashTypedAuthoringCommandAtoms(typedAuthoringCommandAtoms(command));
    return command;
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    throw new TypedAuthoringError("invalid_input");
  }
}
export function parseTypedAuthoringCommand(
  raw: unknown,
): TypedAuthoringCommand {
  try {
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray((raw as Record<string, unknown>).sourceCitations) ||
      ((raw as Record<string, unknown>).sourceCitations as unknown[]).length >
        20 ||
      !Array.isArray((raw as Record<string, unknown>).clauseIds) ||
      ((raw as Record<string, unknown>).clauseIds as unknown[]).length !== 1
    )
      throw new TypedAuthoringError("invalid_input");
    const command = TypedAuthoringCommandSchema.parse(raw);
    if (Buffer.byteLength(JSON.stringify(command), "utf8") > 16384)
      throw new TypedAuthoringError("invalid_input");
    return command;
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    throw new TypedAuthoringError("invalid_input");
  }
}
export function verifyTypedAuthoringCommand(
  rawContext: unknown,
  rawCommand: unknown,
): TypedAuthoringCommand {
  const command = parseTypedAuthoringCommand(rawCommand),
    a = admitted(rawContext);
  const patch = patchFrom(
    a,
    {
      canonicalVersionId: command.binding.canonical.versionId,
      requirementVersionId: command.binding.requirements.versionId,
      clauseId: command.clauseIds[0],
      targetFactId: command.target.factId,
    },
    command.transform.to,
    false,
    command.binding.heads,
  );
  const expected = createTypedAuthoringCommand(
    patch,
    command.operation,
    command.idempotencyKey,
    command.acknowledgement,
  );
  if (JSON.stringify(expected) !== JSON.stringify(command))
    throw new TypedAuthoringError("stale_inputs");
  return command;
}
export function typedAuthoringCommandAtoms(raw: unknown): (string | null)[] {
  const c = parseTypedAuthoringCommand(raw),
    b = c.binding,
    p = c.policies,
    t = c.target;
  const atoms: (string | null)[] = [
    c.schemaVersion,
    c.operation,
    String(c.acknowledgement),
    b.source.ownerId,
    b.source.organizationId,
    b.source.resumeId,
    b.source.analysisId,
    b.source.sourceId,
    b.source.attemptId,
    b.source.inputSha256,
    b.canonical.versionId,
    String(b.canonical.revision),
    b.canonical.contentSha256,
    b.requirements.versionId,
    String(b.requirements.revision),
    b.requirements.inputSha256,
    b.requirements.contentSha256,
    b.heads.canonicalHeadId,
    String(b.heads.canonicalHeadRevision),
    b.heads.requirementHeadId,
    String(b.heads.requirementHeadRevision),
    b.profilesSha256,
    c.diagnosticDigest,
    c.coverageDigest,
    c.semanticDigest,
    p.authoringVersion,
    p.authoringSha256,
    p.writingSupportVersion,
    p.coverageVersion,
    p.coverageSha256,
    p.semanticVersion,
    p.semanticSha256,
    p.durationVersion,
    p.durationSha256,
    p.durationSubjectVersion,
    p.durationSubjectSha256,
    t.factId,
    t.sectionId,
    t.entryId,
    t.bulletId,
    t.currentValueSha256,
    t.confirmationActorId,
    t.confirmedAt,
    String(c.clauseIds.length),
    ...c.clauseIds,
    c.transform.from,
    c.transform.to,
    c.transform.case,
    c.transform.restSha256,
    String(c.sourceCitations.length),
  ];
  for (const cite of c.sourceCitations)
    atoms.push(
      cite.attemptId,
      cite.spanId,
      cite.pageId,
      cite.method,
      String(cite.start),
      String(cite.end),
      String(cite.pageStart),
      String(cite.pageEnd),
    );
  return atoms;
}
export function typedAuthoringCommandSha256(raw: unknown) {
  return hashTypedAuthoringCommandAtoms(typedAuthoringCommandAtoms(raw));
}
export function validateTypedAuthoringReceipt(
  raw: unknown,
  command: TypedAuthoringCommand,
): TypedAuthoringReceipt {
  try {
    const receipt = TypedAuthoringReceiptSchema.parse(raw);
    if (
      receipt.action !== command.operation ||
      receipt.idempotencyKey !== command.idempotencyKey ||
      receipt.commandSha256 !== typedAuthoringCommandSha256(command) ||
      receipt.baseVersionId !== command.binding.canonical.versionId ||
      receipt.baseRevision !== command.binding.canonical.revision ||
      receipt.requirementVersionId !== command.binding.requirements.versionId ||
      receipt.requirementRevision !== command.binding.requirements.revision ||
      receipt.revision !==
        command.binding.canonical.revision +
          (command.operation === "accept" ? 2 : 0) ||
      (command.operation === "reject"
        ? receipt.versionId !== command.binding.canonical.versionId
        : receipt.versionId === command.binding.canonical.versionId)
    )
      throw new TypedAuthoringError("invalid_result");
    return receipt;
  } catch {
    throw new TypedAuthoringError("invalid_result");
  }
}
