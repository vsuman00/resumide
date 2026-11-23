import { createHash } from "node:crypto";
import { z } from "zod";
import * as legacy from "./typed-authoring-contract";
import {
  deriveTypedAuthoringDeclarations,
  TYPED_AUTHORING_DECLARATION_POLICY_VERSION,
  TYPED_AUTHORING_DECLARATION_POLICY_SHA256,
} from "./typed-authoring-declaration";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
  WRITING_SUPPORT_POLICY_VERSION,
} from "./writing-support";
import { hashTypedAuthoringCommandAtoms } from "./typed-authoring-command-codec";

export * from "./typed-authoring-contract";
export {
  TYPED_AUTHORING_DECLARATION_POLICY,
  TYPED_AUTHORING_DECLARATION_POLICY_VERSION,
  TYPED_AUTHORING_DECLARATION_POLICY_SHA256,
} from "./typed-authoring-declaration";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const TypedAuthoringDeclarationPoliciesSchema =
  legacy.TypedAuthoringPoliciesSchema.extend({
    authoringVersion: z.literal(TYPED_AUTHORING_DECLARATION_POLICY_VERSION),
    authoringSha256: z.literal(TYPED_AUTHORING_DECLARATION_POLICY_SHA256),
  });
export const TYPED_AUTHORING_DECLARATION_POLICIES =
  TypedAuthoringDeclarationPoliciesSchema.parse({
    ...legacy.TYPED_AUTHORING_POLICIES,
    authoringVersion: TYPED_AUTHORING_DECLARATION_POLICY_VERSION,
    authoringSha256: TYPED_AUTHORING_DECLARATION_POLICY_SHA256,
  });
export const TypedAuthoringPoliciesSchema = z.union([
  legacy.TypedAuthoringPoliciesSchema,
  TypedAuthoringDeclarationPoliciesSchema,
]);
const emptyCitations =
  legacy.TypedAuthoringPatchSchema.shape.sourceCitations.length(0);
export const TypedAuthoringDeclarationSupportSchema =
  legacy.TypedAuthoringSupportSchema.extend({
    basis: z.literal("candidate_declaration"),
    witnessId: z.string().regex(/^declaration-witness-[a-f0-9]{64}$/u),
  });
export const TypedAuthoringSupportSchema = z.union([
  legacy.TypedAuthoringSupportSchema,
  TypedAuthoringDeclarationSupportSchema,
]);
export const TypedAuthoringDeclarationPatchSchema =
  legacy.TypedAuthoringPatchSchema.extend({
    schemaVersion: z.literal("typed-authoring-patch/1.1.0"),
    policies: TypedAuthoringDeclarationPoliciesSchema,
    sourceCitations: emptyCitations,
    support: TypedAuthoringDeclarationSupportSchema,
  });
export const TypedAuthoringPatchSchema = z.discriminatedUnion("schemaVersion", [
  legacy.TypedAuthoringPatchSchema,
  TypedAuthoringDeclarationPatchSchema,
]);
export type TypedAuthoringPatch = z.infer<typeof TypedAuthoringPatchSchema>;
export const TypedAuthoringDeclarationCommandSchema = z
  .strictObject({
    ...legacy.TypedAuthoringCommandSchema.shape,
    schemaVersion: z.literal("typed-authoring-command/1.1.0"),
    policies: TypedAuthoringDeclarationPoliciesSchema,
    sourceCitations: emptyCitations,
  })
  .superRefine((value, ctx) => {
    if (
      value.acknowledgement !== (value.operation === "accept") ||
      (value.operation === "accept" &&
        value.binding.canonical.revision > 2147483645) ||
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
        message: "Invalid typed declaration command binding",
      });
  });
export const TypedAuthoringCommandSchema = z.discriminatedUnion(
  "schemaVersion",
  [legacy.TypedAuthoringCommandSchema, TypedAuthoringDeclarationCommandSchema],
);
export type TypedAuthoringCommand = z.infer<typeof TypedAuthoringCommandSchema>;
const declarationProposalSchema = z.strictObject({
  patch: TypedAuthoringDeclarationPatchSchema,
  acceptCommand: TypedAuthoringDeclarationCommandSchema,
  rejectCommand: TypedAuthoringDeclarationCommandSchema,
});
export const TypedAuthoringProposalSchema = z.union([
  legacy.TypedAuthoringProposalSchema,
  declarationProposalSchema,
]);
export type TypedAuthoringProposal = z.infer<
  typeof TypedAuthoringProposalSchema
>;
export const TypedAuthoringDeclarationWorkspaceSchema =
  legacy.TypedAuthoringWorkspaceSchema.extend({
    schemaVersion: z.literal("typed-authoring-workspace/1.1.0"),
  });
export const TypedAuthoringWorkspaceSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    legacy.TypedAuthoringWorkspaceSchema,
    TypedAuthoringDeclarationWorkspaceSchema,
  ],
);
export type TypedAuthoringWorkspace = z.infer<
  typeof TypedAuthoringWorkspaceSchema
>;

function declarationSelection(
  rawContext: unknown,
  rawSelection: unknown,
  fresh: boolean,
) {
  const selection =
    legacy.TypedAuthoringSelectionSchema.safeParse(rawSelection);
  if (!selection.success) throw new legacy.TypedAuthoringError("invalid_input");
  const admitted = deriveTypedAuthoringDeclarations(rawContext),
    b = admitted.binding;
  if (
    selection.data.canonicalVersionId !== b.canonical.versionId ||
    selection.data.requirementVersionId !== b.requirements.versionId ||
    (fresh &&
      (b.heads.canonicalHeadId !== b.canonical.versionId ||
        b.heads.canonicalHeadRevision !== b.canonical.revision ||
        b.heads.requirementHeadId !== b.requirements.versionId ||
        b.heads.requirementHeadRevision !== b.requirements.revision))
  )
    throw new legacy.TypedAuthoringError("stale_inputs");
  const witness = admitted.witnesses.find(
    (w) => w.factId === selection.data.targetFactId,
  );
  if (!witness)
    throw new legacy.TypedAuthoringError(
      admitted.failures.get(selection.data.targetFactId) ??
        "missing_current_witness",
    );
  if (!witness.clauseIds.includes(selection.data.clauseId))
    throw new legacy.TypedAuthoringError("missing_current_witness");
  const clause = admitted.context.requirements.content.relations.clauses.find(
    (c) => c.id === selection.data.clauseId,
  );
  if (!clause) throw new legacy.TypedAuthoringError("missing_current_witness");
  return { ...admitted, witness, selection: selection.data, clause };
}
function declarationPatch(
  rawContext: unknown,
  selection: unknown,
  replacement: legacy.TypedAuthoringReplacementAction,
  fresh: boolean,
  capturedHeads?: TypedAuthoringCommand["binding"]["heads"],
) {
  const a = declarationSelection(rawContext, selection, fresh),
    w = a.witness;
  if (fresh && a.binding.canonical.revision > 2147483645)
    throw new legacy.TypedAuthoringError("unsupported_context");
  if (w.from === replacement) throw new legacy.TypedAuthoringError("no_change");
  const after =
    (w.case === "lower" ? replacement.toLowerCase() : replacement) + w.rest;
  const writing = buildWritingSupportDocument(w.value);
  const support = assessWritingSupport(writing, {
    kind: "rewrite",
    original: w.value,
    proposed: after,
    expectedSourceSha256: writing.sourceSha256,
    expectedPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
  });
  if (support.state !== "supported")
    throw new legacy.TypedAuthoringError("writing_support_rejected");
  const body = {
    schemaVersion: "typed-authoring-patch/1.1.0" as const,
    selection: a.selection,
    binding: { ...a.binding, heads: capturedHeads ?? a.binding.heads },
    diagnosticDigest: a.diagnosticDigest,
    coverageDigest: a.coverageDigest,
    semanticDigest: a.semanticDigest,
    policies: TYPED_AUTHORING_DECLARATION_POLICIES,
    target: {
      factId: w.factId,
      ...w.location,
      currentValueSha256: sha(w.value),
      confirmationActorId: w.confirmation.actorId,
      confirmedAt: w.confirmation.confirmedAt,
    },
    transform: {
      from: w.from,
      to: replacement,
      case: w.case,
      restSha256: sha(w.rest),
    },
    sourceCitations: [],
    before: w.value,
    after,
    rationale:
      "Replaces one equivalent leading action in your recorded current confirmed declaration. There is no current source quote; all remaining bytes stay unchanged. This is not independent source or proficiency verification.",
    support: {
      basis: "candidate_declaration" as const,
      witnessId: w.id,
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
  return TypedAuthoringDeclarationPatchSchema.parse({
    ...body,
    id: sha(JSON.stringify(body)),
  });
}
export function buildTypedAuthoringPatch(
  rawContext: unknown,
  rawSelection: unknown,
  replacement: unknown,
): TypedAuthoringPatch {
  try {
    return legacy.buildTypedAuthoringPatch(
      rawContext,
      rawSelection,
      replacement,
    );
  } catch (error) {
    if (
      !(error instanceof legacy.TypedAuthoringError) ||
      error.reason !== "missing_current_witness"
    )
      throw error;
  }
  const parsed = legacy.TypedAuthoringTransportResponseSchema.safeParse({
    replacementAction: replacement,
  });
  if (!parsed.success) throw new legacy.TypedAuthoringError("invalid_input");
  return declarationPatch(
    rawContext,
    rawSelection,
    parsed.data.replacementAction,
    true,
  );
}
export function validateTypedAuthoringSelection(
  rawContext: unknown,
  rawSelection: unknown,
) {
  try {
    return legacy.validateTypedAuthoringSelection(rawContext, rawSelection);
  } catch (error) {
    if (
      !(error instanceof legacy.TypedAuthoringError) ||
      error.reason !== "missing_current_witness"
    )
      throw error;
  }
  const a = declarationSelection(rawContext, rawSelection, true);
  if (a.binding.canonical.revision > 2147483645)
    throw new legacy.TypedAuthoringError("unsupported_context");
  return {
    selection: a.selection,
    before: a.witness.value,
    clauseQuote: a.clause.evidence.quote,
    binding: a.binding,
  };
}
export function buildTypedAuthoringWorkspace(
  rawContext: unknown,
): TypedAuthoringWorkspace {
  const original = legacy.buildTypedAuthoringWorkspace(rawContext);
  let derived: ReturnType<typeof deriveTypedAuthoringDeclarations>;
  try {
    derived = deriveTypedAuthoringDeclarations(rawContext);
  } catch (error) {
    if (error instanceof legacy.TypedAuthoringError) return original;
    throw error;
  }
  const witnesses = new Map(derived.witnesses.map((w) => [w.factId, w]));
  let changed = false;
  const targets = original.targets.map((target) => {
    if (target.state === "eligible" || !witnesses.has(target.factId))
      return target;
    changed = true;
    return {
      ...target,
      state: "eligible" as const,
      reason: "whole_current_confirmed_declaration",
      location: witnesses.get(target.factId)!.location,
    };
  });
  return changed
    ? TypedAuthoringDeclarationWorkspaceSchema.parse({
        ...original,
        schemaVersion: "typed-authoring-workspace/1.1.0",
        targets,
      })
    : original;
}
export function parseTypedAuthoringCommand(
  raw: unknown,
): TypedAuthoringCommand {
  if (
    raw &&
    typeof raw === "object" &&
    (raw as Record<string, unknown>).schemaVersion ===
      "typed-authoring-command/1.0.0"
  )
    return legacy.parseTypedAuthoringCommand(raw);
  try {
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray((raw as Record<string, unknown>).sourceCitations) ||
      ((raw as Record<string, unknown>).sourceCitations as unknown[]).length !==
        0 ||
      !Array.isArray((raw as Record<string, unknown>).clauseIds) ||
      ((raw as Record<string, unknown>).clauseIds as unknown[]).length !== 1
    )
      throw new legacy.TypedAuthoringError("invalid_input");
    const command = TypedAuthoringDeclarationCommandSchema.parse(raw);
    if (Buffer.byteLength(JSON.stringify(command), "utf8") > 16384)
      throw new legacy.TypedAuthoringError("invalid_input");
    return command;
  } catch {
    throw new legacy.TypedAuthoringError("invalid_input");
  }
}
export function createTypedAuthoringCommand(
  rawPatch: unknown,
  operation: legacy.TypedAuthoringCommandOperation,
  idempotencyKey: string,
  acknowledgement: boolean,
): TypedAuthoringCommand {
  if (
    rawPatch &&
    typeof rawPatch === "object" &&
    (rawPatch as Record<string, unknown>).schemaVersion ===
      "typed-authoring-patch/1.0.0"
  )
    return legacy.createTypedAuthoringCommand(
      rawPatch,
      operation,
      idempotencyKey,
      acknowledgement,
    );
  try {
    const p = TypedAuthoringDeclarationPatchSchema.parse(rawPatch);
    const command = parseTypedAuthoringCommand({
      schemaVersion: "typed-authoring-command/1.1.0",
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
    typedAuthoringCommandSha256(command);
    return command;
  } catch (error) {
    if (error instanceof legacy.TypedAuthoringError) throw error;
    throw new legacy.TypedAuthoringError("invalid_input");
  }
}
export function verifyTypedAuthoringCommand(
  rawContext: unknown,
  rawCommand: unknown,
): TypedAuthoringCommand {
  const command = parseTypedAuthoringCommand(rawCommand);
  if (command.schemaVersion === "typed-authoring-command/1.0.0")
    return legacy.verifyTypedAuthoringCommand(rawContext, command);
  const patch = declarationPatch(
    rawContext,
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
    throw new legacy.TypedAuthoringError("stale_inputs");
  return command;
}
export function typedAuthoringCommandAtoms(raw: unknown): (string | null)[] {
  const c = parseTypedAuthoringCommand(raw);
  if (c.schemaVersion === "typed-authoring-command/1.0.0")
    return legacy.typedAuthoringCommandAtoms(c);
  const b = c.binding,
    p = c.policies,
    t = c.target;
  // Frame validated 1.1 fields directly in the frozen 50 + 8N order. No downgrade.
  return [
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
}
export function typedAuthoringCommandSha256(raw: unknown) {
  return hashTypedAuthoringCommandAtoms(typedAuthoringCommandAtoms(raw));
}
export function validateTypedAuthoringReceipt(
  raw: unknown,
  command: TypedAuthoringCommand,
): legacy.TypedAuthoringReceipt {
  if (command.schemaVersion === "typed-authoring-command/1.0.0")
    return legacy.validateTypedAuthoringReceipt(raw, command);
  try {
    const r = legacy.TypedAuthoringReceiptSchema.parse(raw);
    if (
      r.action !== command.operation ||
      r.idempotencyKey !== command.idempotencyKey ||
      r.commandSha256 !== typedAuthoringCommandSha256(command) ||
      r.baseVersionId !== command.binding.canonical.versionId ||
      r.baseRevision !== command.binding.canonical.revision ||
      r.requirementVersionId !== command.binding.requirements.versionId ||
      r.requirementRevision !== command.binding.requirements.revision ||
      r.revision !==
        command.binding.canonical.revision +
          (command.operation === "accept" ? 2 : 0) ||
      (command.operation === "reject"
        ? r.versionId !== command.binding.canonical.versionId
        : r.versionId === command.binding.canonical.versionId)
    )
      throw new legacy.TypedAuthoringError("invalid_result");
    return r;
  } catch {
    throw new legacy.TypedAuthoringError("invalid_result");
  }
}
