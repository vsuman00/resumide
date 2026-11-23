import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { loadCanonical, CanonicalError } from "./canonical-repository";
import { applyAuthoring } from "./authoring-repository";
import type { CanonicalResumeDraft } from "./canonical-resume-schema";
import {
  TypedAuthoringSelectionSchema,
  TypedAuthoringReceiptSchema,
  TypedAuthoringProposalSchema,
  TypedAuthoringError,
  parseTypedAuthoringCommand,
  typedAuthoringCommandSha256,
  validateTypedAuthoringReceipt,
  type TypedAuthoringCommand,
  type TypedAuthoringReason,
  type TypedAuthoringReceipt,
} from "./typed-authoring-protocol";
import {
  applyTypedAuthoring,
  proposeTypedAuthoring,
} from "./typed-authoring-repository";

type Client = Parameters<typeof applyAuthoring>[0];
export type TypedAuthoringHttpInput =
  | {
      action: "preview";
      selection: z.infer<typeof TypedAuthoringSelectionSchema>;
    }
  | {
      action: "decision";
      command: TypedAuthoringCommand;
      reviewAcknowledgement: "accepted" | null;
    }
  | { action: "undo"; receipt: TypedAuthoringReceipt; idempotencyKey: string };
export const TypedAuthoringUndoReceiptSchema = z.strictObject({
  status: z.literal("applied"),
  action: z.literal("undo"),
  versionId: z.uuid(),
  revision: z.number().int().min(1).max(2_147_483_647),
  eventId: z.uuid(),
  idempotent: z.boolean(),
});
export type TypedAuthoringUndoReceipt = z.infer<
  typeof TypedAuthoringUndoReceiptSchema
>;
export type TypedAuthoringHttpRecovery =
  "retry_exact" | "review_again" | "unavailable";
export class TypedAuthoringHttpError extends Error {
  constructor(
    readonly status: number,
    readonly reason: TypedAuthoringReason = "invalid_input",
    readonly recovery: TypedAuthoringHttpRecovery = "review_again",
  ) {
    super("The typed authoring request could not be completed.");
  }
}
export const typedAuthoringPrivateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
const reasonSchema = z.enum([
  "invalid_input",
  "invalid_context",
  "stale_inputs",
  "incomplete_source_coverage",
  "unsupported_context",
  "target_not_editable",
  "confirmation_required",
  "ambiguous_location",
  "fragmented_source_clause",
  "missing_current_witness",
  "unsupported_action",
  "no_change",
  "writing_support_rejected",
  "unavailable",
  "invalid_result",
]);
export const TypedAuthoringHttpSuccessSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("proposal"),
    proposal: TypedAuthoringProposalSchema,
  }),
  z.strictObject({
    kind: z.literal("applied"),
    receipt: TypedAuthoringReceiptSchema,
  }),
  z.strictObject({
    kind: z.literal("undone"),
    receipt: TypedAuthoringUndoReceiptSchema,
    idempotencyKey: z.uuid(),
  }),
]);
export const TypedAuthoringHttpErrorSchema = z.strictObject({
  kind: z.literal("error"),
  reason: reasonSchema,
  recovery: z.enum(["retry_exact", "review_again", "unavailable"]),
});
export function typedAuthoringHttpErrorResponse(
  error: unknown,
  headers = typedAuthoringPrivateHeaders(),
  action?: TypedAuthoringHttpInput["action"],
) {
  const known = error instanceof TypedAuthoringHttpError ? error : null;
  const typed = error instanceof TypedAuthoringError ? error : null;
  const canonical = error instanceof CanonicalError ? error : null;
  const originalStatus =
    known?.status ?? typed?.status ?? canonical?.status ?? 503;
  const status = [401, 403, 404, 405, 409, 413, 415, 422, 503].includes(
    originalStatus,
  )
    ? originalStatus
    : 503;
  const mappedReason = canonical
    ? status === 409
      ? "stale_inputs"
      : status === 422
        ? "invalid_input"
        : "unavailable"
    : (known?.reason ?? typed?.reason ?? "unavailable");
  const parsedReason = reasonSchema.safeParse(mappedReason);
  const reason = parsedReason.success ? parsedReason.data : "unavailable";
  const recovery =
    known?.recovery ??
    (status === 404
      ? "unavailable"
      : reason === "stale_inputs" || status === 422
        ? "review_again"
        : action === "decision" || action === "undo"
          ? "retry_exact"
          : "unavailable");
  return Response.json(
    TypedAuthoringHttpErrorSchema.parse({ kind: "error", reason, recovery }),
    { status, headers },
  );
}
function strictJson(text: string, limit = 65_536): unknown {
  if (Buffer.byteLength(text, "utf8") > limit)
    throw new TypedAuthoringHttpError(422);
  const frames: { kind: string; key: boolean; keys: Set<string> }[] = [];
  let nodes = 0;
  for (const match of text.matchAll(
    /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu,
  )) {
    if (++nodes > 4096) throw new TypedAuthoringHttpError(422);
    const token = match[0],
      frame = frames.at(-1);
    if (token === "{" || token === "[") {
      if (frames.length >= 8) throw new TypedAuthoringHttpError(422);
      frames.push({ kind: token, key: token === "{", keys: new Set() });
    } else if (token === "}" || token === "]") frames.pop();
    else if (token === "," && frame?.kind === "{") frame.key = true;
    else if (frame?.kind === "{" && frame.key && token.startsWith('"')) {
      const key: string = JSON.parse(token);
      if (frame.keys.has(key)) throw new TypedAuthoringHttpError(422);
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return JSON.parse(text);
}
type BodyBudget = {
  run<T>(work: () => Promise<T>): Promise<T>;
  check(): void;
  dispose(): void;
};
function bodyBudget(request: Request, timeoutMs: number): BodyBudget {
  const deadline = Date.now() + timeoutMs;
  let stop!: (error: TypedAuthoringHttpError) => void;
  const stopped = new Promise<TypedAuthoringHttpError>((resolve) => {
    stop = resolve;
  });
  const unavailable = () =>
    new TypedAuthoringHttpError(503, "unavailable", "retry_exact");
  const check = () => {
    if (request.signal.aborted || Date.now() >= deadline) throw unavailable();
  };
  const abort = () => stop(unavailable());
  const timer = setTimeout(abort, timeoutMs);
  request.signal.addEventListener("abort", abort, { once: true });
  return {
    check,
    async run<T>(work: () => Promise<T>) {
      check();
      const result = await Promise.race([
        Promise.resolve().then(() => {
          check();
          return work();
        }),
        stopped.then((error) => {
          throw error;
        }),
      ]);
      check();
      return result;
    },
    dispose() {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    },
  };
}
/** Cleanup is best effort and never waits for an untrusted cancellation promise
 * or replaces the primary body limit/deadline error. Both outcomes are observed. */
function releaseBodyReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cancel: boolean,
): boolean {
  let cancellationStarted = true;
  if (cancel) {
    try {
      void reader.cancel().then(
        () => true,
        () => false,
      );
    } catch {
      cancellationStarted = false;
    }
  }
  try {
    reader.releaseLock();
  } catch {
    return false;
  }
  return cancellationStarted;
}
async function boundedBytes(
  request: Request,
  budget: BodyBudget,
): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 65536))
    throw new TypedAuthoringHttpError(413);
  if (!request.body || request.bodyUsed || request.body.locked)
    throw new TypedAuthoringHttpError(422);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0,
    completed = false;
  try {
    while (true) {
      const next = await budget.run(() => reader.read());
      if (next.done) {
        completed = true;
        break;
      }
      bytes += next.value.byteLength;
      if (bytes > 65536) throw new TypedAuthoringHttpError(413);
      chunks.push(next.value);
    }
    const result = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    releaseBodyReader(reader, !completed);
  }
}
export async function readTypedAuthoringHttpForm(
  request: Request,
  options: { timeoutMs?: number } = {},
): Promise<TypedAuthoringHttpInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/iu.test(
      contentType,
    ) &&
    !/^multipart\/form-data\s*;/iu.test(contentType)
  )
    throw new TypedAuthoringHttpError(415);
  const timeout = z
    .number()
    .int()
    .min(1)
    .max(5000)
    .safeParse(options.timeoutMs ?? 5000);
  if (!timeout.success) throw new TypedAuthoringHttpError(422);
  const budget = bodyBudget(request, timeout.data);
  try {
    const bytes = await boundedBytes(request, budget);
    const body = await budget.run(() =>
      new Response(bytes, {
        headers: { "Content-Type": contentType },
      }).formData(),
    );
    const values = new Map<string, string>();
    for (const [key, value] of body) {
      if (
        typeof value !== "string" ||
        values.has(key) ||
        ![
          "action",
          "selection",
          "command",
          "reviewAcknowledgement",
          "receipt",
          "idempotencyKey",
        ].includes(key)
      )
        throw new TypedAuthoringHttpError(422);
      values.set(key, value);
    }
    const action = values.get("action");
    if (action === "preview" && values.size === 2 && values.has("selection")) {
      const selection = TypedAuthoringSelectionSchema.parse(
        strictJson(values.get("selection")!),
      );
      budget.check();
      return { action, selection };
    }
    if (action === "decision" && values.has("command")) {
      const command = parseTypedAuthoringCommand(
        strictJson(values.get("command")!, 16384),
      );
      typedAuthoringCommandSha256(command);
      const accepting = command.operation === "accept";
      if (
        values.size !== (accepting ? 3 : 2) ||
        (accepting
          ? values.get("reviewAcknowledgement") !== "accepted"
          : values.has("reviewAcknowledgement"))
      )
        throw new TypedAuthoringHttpError(422);
      budget.check();
      return {
        action,
        command,
        reviewAcknowledgement: accepting ? "accepted" : null,
      };
    }
    if (
      action === "undo" &&
      values.size === 3 &&
      values.has("receipt") &&
      values.has("idempotencyKey")
    ) {
      const receipt = TypedAuthoringReceiptSchema.parse(
        strictJson(values.get("receipt")!),
      );
      const idempotencyKey = z.uuid().parse(values.get("idempotencyKey"));
      if (
        receipt.action !== "accept" ||
        idempotencyKey === receipt.idempotencyKey
      )
        throw new TypedAuthoringHttpError(422);
      budget.check();
      return { action, receipt, idempotencyKey };
    }
    throw new TypedAuthoringHttpError(422);
  } catch (error) {
    if (error instanceof TypedAuthoringHttpError) throw error;
    throw new TypedAuthoringHttpError(422);
  } finally {
    budget.dispose();
  }
}
const eventSchema = z.strictObject({
  id: z.uuid(),
  analysis_id: z.uuid(),
  resume_id: z.uuid(),
  owner_id: z.uuid(),
  organization_id: z.uuid(),
  base_version_id: z.uuid(),
  result_version_id: z.uuid(),
  idempotency_key: z.uuid(),
  action: z.literal("accept"),
  command: z.unknown(),
  result: z.unknown(),
  retention_policy_id: z.string(),
});
/** Consistency validation only; the caller must first load the accepted version
 * through the actual owned canonical repository and owner-filtered event query. */
export function validateTypedUndoEvent(
  raw: unknown,
  receipt: TypedAuthoringReceipt,
  analysisId: string,
  ownerId: string,
  accepted: {
    document: CanonicalResumeDraft;
    revision: number;
    sourceId: string;
  },
) {
  try {
    const event = eventSchema.parse(raw),
      command = parseTypedAuthoringCommand(event.command),
      stored = validateTypedAuthoringReceipt(event.result, command),
      doc = accepted.document;
    validateTypedAuthoringReceipt(receipt, command);
    if (
      receipt.action !== "accept" ||
      command.operation !== "accept" ||
      event.id !== receipt.eventId ||
      event.analysis_id !== analysisId ||
      event.owner_id !== ownerId ||
      event.resume_id !== doc.resumeId ||
      event.organization_id !== doc.organizationId ||
      event.base_version_id !== receipt.baseVersionId ||
      event.result_version_id !== receipt.versionId ||
      event.idempotency_key !== receipt.idempotencyKey ||
      event.retention_policy_id !== doc.retentionPolicyId ||
      doc.ownerId !== ownerId ||
      doc.analysisId !== analysisId ||
      doc.versionId !== receipt.versionId ||
      accepted.revision !== receipt.revision ||
      accepted.sourceId !== command.binding.source.sourceId ||
      doc.sourceEvidenceVersionId !== command.binding.source.attemptId ||
      doc.inputSha256 !== command.binding.source.inputSha256 ||
      command.binding.source.ownerId !== ownerId ||
      command.binding.source.analysisId !== analysisId ||
      command.binding.source.resumeId !== doc.resumeId ||
      command.binding.source.organizationId !== doc.organizationId ||
      !isDeepStrictEqual(
        { ...stored, idempotent: false },
        { ...receipt, idempotent: false },
      )
    )
      throw new TypedAuthoringHttpError(422);
    return { command, receipt: stored };
  } catch {
    throw new TypedAuthoringHttpError(422);
  }
}
export async function executeTypedAuthoringHttp(
  client: Client,
  analysisId: string,
  ownerId: string,
  input: TypedAuthoringHttpInput,
) {
  if (
    !z.uuid().safeParse(analysisId).success ||
    !z.uuid().safeParse(ownerId).success
  )
    throw new TypedAuthoringHttpError(422);
  if (input.action === "preview") {
    // This is a local, closed editorial rule. It does not call an AI provider.
    const result = await proposeTypedAuthoring(
      client,
      analysisId,
      ownerId,
      input.selection,
      {
        execute: async (request) => {
          const data = JSON.parse(request.context) as { before?: unknown };
          if (typeof data.before !== "string")
            throw new TypedAuthoringHttpError(422);
          const from =
            /^(Built|Created|Developed|built|created|developed)(?=[ \t])/u
              .exec(data.before)?.[1]
              .toLowerCase();
          const replacementAction =
            from === "built"
              ? "Created"
              : from === "created"
                ? "Developed"
                : from === "developed"
                  ? "Built"
                  : null;
          if (!replacementAction) throw new TypedAuthoringHttpError(422);
          return { replacementAction };
        },
      },
      { timeoutMs: 5000 },
    );
    if (result.state !== "review_required")
      throw new TypedAuthoringHttpError(422, "no_change");
    return { kind: "proposal" as const, proposal: result.proposal };
  }
  if (input.action === "decision") {
    if (
      input.command.operation === "accept" &&
      input.reviewAcknowledgement !== "accepted"
    )
      throw new TypedAuthoringHttpError(422);
    if (
      input.command.operation === "reject" &&
      input.reviewAcknowledgement !== null
    )
      throw new TypedAuthoringHttpError(422);
    const receipt = await applyTypedAuthoring(
      client,
      analysisId,
      ownerId,
      input.command,
      input.command.idempotencyKey,
      {
        apply: async (args) => {
          const result = await client.rpc("apply_typed_authoring_action", args);
          return { data: result.data, error: result.error };
        },
      },
    );
    return { kind: "applied" as const, receipt };
  }
  const accepted = await loadCanonical(client, analysisId, ownerId, {
    versionId: input.receipt.versionId,
  });
  if (!accepted.current)
    throw new TypedAuthoringHttpError(404, "unavailable", "unavailable");
  const event = await client
    .from("authoring_events")
    .select(
      "id,analysis_id,resume_id,owner_id,organization_id,base_version_id,result_version_id,idempotency_key,action,command,result,retention_policy_id",
    )
    .eq("id", input.receipt.eventId)
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (event.error)
    throw new TypedAuthoringHttpError(503, "unavailable", "retry_exact");
  if (!event.data)
    throw new TypedAuthoringHttpError(404, "unavailable", "unavailable");
  validateTypedUndoEvent(event.data, input.receipt, analysisId, ownerId, {
    document: accepted.current.document,
    revision: accepted.current.revision,
    sourceId: accepted.current.sourceId,
  });
  const raw = await applyAuthoring(
    client,
    analysisId,
    ownerId,
    {
      action: "undo",
      expectedVersionId: input.receipt.versionId,
      idempotencyKey: input.idempotencyKey,
    },
    input.idempotencyKey,
  );
  const parsedReceipt = TypedAuthoringUndoReceiptSchema.safeParse(raw);
  if (!parsedReceipt.success)
    throw new TypedAuthoringHttpError(503, "invalid_result", "retry_exact");
  const receipt = parsedReceipt.data;
  if (
    receipt.revision !== input.receipt.revision + 1 ||
    receipt.versionId === input.receipt.versionId ||
    receipt.versionId === input.receipt.baseVersionId
  )
    throw new TypedAuthoringHttpError(503, "invalid_result", "retry_exact");
  return {
    kind: "undone" as const,
    receipt,
    idempotencyKey: input.idempotencyKey,
  };
}
