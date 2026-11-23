import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  JdClauseOrderWorkspaceSchema,
  type JdClauseOrderWorkspace,
} from "../jd-clause-order-decisions";
import { assertJdClauseOrderReady } from "./jd-clause-order-readiness";
import {
  loadRequirementRelationshipContext,
  RequirementRelationshipContextError,
} from "./requirement-relationship-context";
import { buildJdClauseOrderPlan } from "./jd-clause-order-drafting";
import {
  buildClauseOrderProposal,
  parseClauseOrderCommand,
  verifyOriginalClauseOrderCommand,
  validateClauseOrderReceipt,
  type JdClauseOrderReceipt,
} from "./clause-order-authoring";
import { TypedAuthoringError } from "./typed-authoring-contract";

type Client = Parameters<typeof loadRequirementRelationshipContext>[0];
const selectionSchema = z.strictObject({
  canonicalVersionId: z.uuid().regex(/^[a-f0-9-]+$/u),
  requirementVersionId: z.uuid().regex(/^[a-f0-9-]+$/u),
});
const optionsSchema = z.strictObject({
  enabled: z.boolean(),
  signal: z.instanceof(AbortSignal).optional(),
});
const unavailable = () => new TypedAuthoringError("unavailable");
/** One bounded flow, including SDK cancellation. A timeout never retries a write. */
async function bounded<T>(
  client: Client,
  signal: AbortSignal | undefined,
  work: (scoped: Client, signal: AbortSignal, active: () => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController(),
    deadline = Date.now() + 5000;
  let rejectStopped!: (reason: unknown) => void;
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  const cancel = () => {
    controller.abort();
    rejectStopped(unavailable());
  };
  const active = () => {
    if (signal?.aborted || controller.signal.aborted || Date.now() >= deadline)
      throw unavailable();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 5000);
  try {
    active();
    const scoped: Client = {
      rpc: (name, args) =>
        client.rpc(name, args).abortSignal(controller.signal),
    };
    const result = await Promise.race([
      work(scoped, controller.signal, active),
      stopped,
    ]);
    active();
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
async function owned(
  client: Client,
  analysisId: string,
  ownerId: string,
  selection: z.infer<typeof selectionSchema>,
) {
  try {
    return await loadRequirementRelationshipContext(
      client,
      analysisId,
      ownerId,
      selection,
    );
  } catch (error) {
    if (
      error instanceof RequirementRelationshipContextError &&
      error.reason === "invalid_input"
    )
      throw new TypedAuthoringError("invalid_input");
    throw unavailable();
  }
}
/** Release real proposals only after current owned source/pair and readiness agree twice. */
export async function loadJdClauseOrderWorkspace(
  client: Client,
  analysisId: string,
  ownerId: string,
  rawSelection: unknown,
  options: { enabled: boolean; signal?: AbortSignal },
): Promise<JdClauseOrderWorkspace | null> {
  if (options?.enabled !== true) return null;
  const parsed = selectionSchema.safeParse(rawSelection),
    configured = optionsSchema.safeParse(options);
  if (!parsed.success || !configured.success)
    throw new TypedAuthoringError("invalid_input");
  return bounded(
    client,
    configured.data.signal,
    async (scoped, signal, active) => {
      const first = await owned(scoped, analysisId, ownerId, parsed.data);
      active();
      const plan = buildJdClauseOrderPlan(first, {
        analysisId,
        ownerId,
        ...parsed.data,
      });
      active();
      if (plan.state !== "available") return null;
      try {
        await assertJdClauseOrderReady(scoped, { signal });
      } catch {
        active();
        return null;
      }
      const second = await owned(scoped, analysisId, ownerId, parsed.data);
      active();
      if (!isDeepStrictEqual(second, first))
        throw new TypedAuthoringError("stale_inputs");
      const proposals: JdClauseOrderWorkspace["proposals"] = [];
      for (const draft of plan.drafts) {
        active();
        try {
          proposals.push(
            buildClauseOrderProposal(
              second,
              { analysisId, ownerId },
              draft.selection,
            ),
          );
        } catch (error) {
          if (
            error instanceof TypedAuthoringError &&
            [
              "writing_support_rejected",
              "unsupported_context",
              "target_not_editable",
              "missing_current_witness",
              "fragmented_source_clause",
              "confirmation_required",
              "ambiguous_location",
              "no_change",
            ].includes(error.reason)
          )
            continue;
          throw error;
        }
      }
      active();
      if (proposals.length === 0) return null;
      return JdClauseOrderWorkspaceSchema.parse({
        schemaVersion: "jd-clause-order-workspace/2.0.0",
        binding: plan.binding,
        proposals,
        inspectedPairCount: plan.inspectedPairCount,
        truncated: plan.truncated,
      });
    },
  );
}
/** ORIGINAL proof precedes fresh capability admission; Native owns exact replay and fresh CAS. */
export async function applyJdClauseOrderAction(
  client: Client,
  analysisId: string,
  ownerId: string,
  rawCommand: unknown,
  requestId: string,
): Promise<JdClauseOrderReceipt> {
  const command = parseClauseOrderCommand(rawCommand);
  if (
    requestId !== command.idempotencyKey ||
    ownerId !== command.binding.source.ownerId ||
    analysisId !== command.binding.source.analysisId
  )
    throw new TypedAuthoringError("invalid_input");
  return bounded(client, undefined, async (scoped, signal, active) => {
    const context = await owned(scoped, analysisId, ownerId, {
      canonicalVersionId: command.binding.canonical.versionId,
      requirementVersionId: command.binding.requirements.versionId,
    });
    active();
    verifyOriginalClauseOrderCommand(context, { analysisId, ownerId }, command);
    active();
    await assertJdClauseOrderReady(scoped, { signal });
    active();
    let result: { data: unknown; error: unknown };
    try {
      result = await scoped.rpc("apply_jd_clause_order_action", {
        p_user_id: ownerId,
        p_analysis_id: analysisId,
        p_command: command,
        p_request_id: requestId,
      });
    } catch {
      throw unavailable();
    }
    active();
    if (result.error) throw unavailable();
    if (
      z.strictObject({ status: z.literal("conflict") }).safeParse(result.data)
        .success
    )
      throw new TypedAuthoringError("stale_inputs");
    return validateClauseOrderReceipt(result.data, command);
  });
}
