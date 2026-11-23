import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import policy from "../jd-clause-order-decision-policy.json";
import {
  JdClauseOrderCommandSchema,
  JdClauseOrderReceiptSchema,
  JdClauseOrderProposalSchema,
  clauseOrderCommandAtoms as atoms,
  type JdClauseOrderCommand,
  type JdClauseOrderReceipt,
  type JdClauseOrderProposal,
} from "../jd-clause-order-decisions";
import {
  buildJdClauseOrderDraft,
  rebuildOriginalJdClauseOrderDraft,
  JdClauseOrderDraftSchema,
} from "./jd-clause-order-drafting";
import { assertJdClauseOrderWriterScope } from "./jd-clause-order-writer-scope";
import { hashClauseOrderCommandAtoms } from "./clause-order-command-codec";
import { TypedAuthoringError } from "./typed-authoring-contract";
export {
  JdClauseOrderCommandSchema,
  JdClauseOrderReceiptSchema,
  JdClauseOrderProposalSchema,
};
export type {
  JdClauseOrderCommand,
  JdClauseOrderReceipt,
  JdClauseOrderProposal,
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function parseClauseOrderCommand(raw: unknown): JdClauseOrderCommand {
  try {
    const command = JdClauseOrderCommandSchema.parse(raw);
    hashClauseOrderCommandAtoms(atoms(command));
    return command;
  } catch {
    throw new TypedAuthoringError("invalid_input");
  }
}
export function clauseOrderCommandAtoms(raw: unknown): (string | null)[] {
  return atoms(parseClauseOrderCommand(raw));
}
export function clauseOrderCommandSha256(raw: unknown): string {
  return hashClauseOrderCommandAtoms(clauseOrderCommandAtoms(raw));
}
/** Closed wire construction only. Owned admission belongs to proposal/original verification and Native. */
export function createClauseOrderCommand(
  rawDraft: unknown,
  operation: "accept" | "reject",
  idempotencyKey: string,
  acknowledgement: boolean,
): JdClauseOrderCommand {
  try {
    const d = JdClauseOrderDraftSchema.parse(rawDraft);
    return parseClauseOrderCommand({
      schemaVersion: policy.body.commandSchemaVersion,
      operation,
      idempotencyKey,
      acknowledgement,
      draftId: d.id,
      binding: d.binding,
      policies: d.policies,
      decisionPolicy: { version: policy.body.version, sha256: policy.sha256 },
      target: d.target,
      jdClauseId: d.selection.clauseId,
      sourceClauses: d.sourceClauses.map((c) => ({
        index: c.index,
        start: c.start,
        end: c.end,
        sha256: c.sha256,
      })),
      transform: d.transform,
      afterSha256: sha(d.after),
      sourceCitations: d.sourceCitations,
    });
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    throw new TypedAuthoringError("invalid_input");
  }
}
export function buildClauseOrderProposal(
  rawContext: unknown,
  expected: { analysisId: string; ownerId: string },
  rawSelection: unknown,
  rawKeys?: { acceptKey: string; rejectKey: string },
): JdClauseOrderProposal {
  try {
    const keys = z
      .strictObject({ acceptKey: z.uuid(), rejectKey: z.uuid() })
      .refine((k) => k.acceptKey !== k.rejectKey)
      .parse(rawKeys ?? { acceptKey: randomUUID(), rejectKey: randomUUID() });
    const draft = buildJdClauseOrderDraft(rawContext, expected, rawSelection);
    assertJdClauseOrderWriterScope(rawContext, expected, draft);
    const acceptCommand = createClauseOrderCommand(
        draft,
        "accept",
        keys.acceptKey,
        true,
      ),
      rejectCommand = createClauseOrderCommand(
        draft,
        "reject",
        keys.rejectKey,
        false,
      );
    return JdClauseOrderProposalSchema.parse({
      schemaVersion: policy.body.proposalSchemaVersion,
      draft,
      acceptCommand,
      rejectCommand,
      acceptCommandSha256: clauseOrderCommandSha256(acceptCommand),
      rejectCommandSha256: clauseOrderCommandSha256(rejectCommand),
    });
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    throw new TypedAuthoringError("invalid_input");
  }
}
export function verifyOriginalClauseOrderCommand(
  rawContext: unknown,
  expected: { analysisId: string; ownerId: string },
  rawCommand: unknown,
): JdClauseOrderCommand {
  const command = parseClauseOrderCommand(rawCommand);
  if (
    command.binding.source.ownerId !== expected.ownerId ||
    command.binding.source.analysisId !== expected.analysisId
  )
    throw new TypedAuthoringError("invalid_input");
  const draft = rebuildOriginalJdClauseOrderDraft(rawContext, expected, {
    canonicalVersionId: command.binding.canonical.versionId,
    requirementVersionId: command.binding.requirements.versionId,
    clauseId: command.jdClauseId,
    targetFactId: command.target.factId,
  });
  assertJdClauseOrderWriterScope(rawContext, expected, draft);
  const derived = createClauseOrderCommand(
    draft,
    command.operation,
    command.idempotencyKey,
    command.acknowledgement,
  );
  if (!isDeepStrictEqual(command, derived))
    throw new TypedAuthoringError("stale_inputs");
  return command;
}
export function validateClauseOrderReceipt(
  raw: unknown,
  rawCommand: unknown,
): JdClauseOrderReceipt {
  try {
    const c = parseClauseOrderCommand(rawCommand),
      r = JdClauseOrderReceiptSchema.parse(raw);
    if (
      r.action !== c.operation ||
      r.idempotencyKey !== c.idempotencyKey ||
      r.commandSha256 !== clauseOrderCommandSha256(c) ||
      r.draftId !== c.draftId ||
      r.baseVersionId !== c.binding.canonical.versionId ||
      r.baseRevision !== c.binding.canonical.revision ||
      r.requirementVersionId !== c.binding.requirements.versionId ||
      r.requirementRevision !== c.binding.requirements.revision ||
      r.revision !==
        c.binding.canonical.revision + (c.operation === "accept" ? 2 : 0) ||
      (c.operation === "accept"
        ? r.versionId === r.baseVersionId
        : r.versionId !== r.baseVersionId)
    )
      throw Error("CLAUSE_ORDER_INVALID_RECEIPT");
    return r;
  } catch {
    throw new TypedAuthoringError("invalid_result");
  }
}
