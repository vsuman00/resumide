import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { loadCanonical, CanonicalError } from "./canonical-repository";
import { applyAuthoring } from "./authoring-repository";
import type { CanonicalResumeDraft } from "./canonical-resume-schema";
import {
  parseClauseOrderCommand,
  clauseOrderCommandSha256,
  validateClauseOrderReceipt,
} from "./clause-order-authoring";
import {
  JdClauseOrderUndoReceiptSchema,
  JdClauseOrderHttpErrorSchema,
  JdClauseOrderHttpSuccessSchema,
  JdClauseOrderReceiptSchema,
  type JdClauseOrderCommand,
  type JdClauseOrderReceipt,
} from "../jd-clause-order-decisions";
import { applyJdClauseOrderAction } from "./jd-clause-order-repository";
import {
  TypedAuthoringError,
  type TypedAuthoringReason,
} from "./typed-authoring-contract";
export { JdClauseOrderHttpSuccessSchema, JdClauseOrderHttpErrorSchema };
const canonicalUuid = z.uuid().regex(/^[a-f0-9-]+$/u);
type Client = Parameters<typeof applyAuthoring>[0];
export type JdClauseOrderHttpInput =
  | {
      action: "decision";
      command: JdClauseOrderCommand;
      reviewAcknowledgement: "accepted" | null;
    }
  | { action: "undo"; receipt: JdClauseOrderReceipt; idempotencyKey: string };
export type JdClauseOrderHttpRecovery =
  "retry_exact" | "review_again" | "unavailable";
export class JdClauseOrderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly reason: TypedAuthoringReason = "invalid_input",
    readonly recovery: JdClauseOrderHttpRecovery = "review_again",
  ) {
    super("The clause-order request could not be completed.");
  }
}
export const jdClauseOrderPrivateHeaders = () =>
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
export function jdClauseOrderHttpErrorResponse(
  error: unknown,
  headers = jdClauseOrderPrivateHeaders(),
  action?: JdClauseOrderHttpInput["action"],
) {
  const known = error instanceof JdClauseOrderHttpError ? error : null,
    typed = error instanceof TypedAuthoringError ? error : null,
    canonical = error instanceof CanonicalError ? error : null;
  const originalStatus =
    known?.status ?? typed?.status ?? canonical?.status ?? 503;
  const status = [401, 403, 404, 405, 409, 413, 415, 422, 503].includes(
    originalStatus,
  )
    ? originalStatus
    : 503;
  const rawReason = canonical
    ? status === 409
      ? "stale_inputs"
      : status === 422
        ? "invalid_input"
        : "unavailable"
    : (known?.reason ?? typed?.reason ?? "unavailable");
  const parsedReason = reasonSchema.safeParse(rawReason),
    reason = parsedReason.success ? parsedReason.data : "unavailable";
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
    JdClauseOrderHttpErrorSchema.parse({ kind: "error", reason, recovery }),
    { status, headers },
  );
}
function strictJson(text: string, limit = 65_536): unknown {
  if (Buffer.byteLength(text, "utf8") > limit)
    throw new JdClauseOrderHttpError(422);
  const frames: { kind: string; key: boolean; keys: Set<string> }[] = [];
  let nodes = 0;
  for (const match of text.matchAll(
    /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu,
  )) {
    if (++nodes > 4096) throw new JdClauseOrderHttpError(422);
    const token = match[0],
      frame = frames.at(-1);
    if (token === "{" || token === "[") {
      if (frames.length >= 8) throw new JdClauseOrderHttpError(422);
      frames.push({ kind: token, key: token === "{", keys: new Set() });
    } else if (token === "}" || token === "]") frames.pop();
    else if (token === "," && frame?.kind === "{") frame.key = true;
    else if (frame?.kind === "{" && frame.key && token.startsWith('"')) {
      const key: string = JSON.parse(token);
      if (frame.keys.has(key)) throw new JdClauseOrderHttpError(422);
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
  let stop!: (error: JdClauseOrderHttpError) => void;
  const stopped = new Promise<JdClauseOrderHttpError>((resolve) => {
    stop = resolve;
  });
  const unavailable = () =>
    new JdClauseOrderHttpError(503, "unavailable", "retry_exact");
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
    throw new JdClauseOrderHttpError(413);
  if (!request.body || request.bodyUsed || request.body.locked)
    throw new JdClauseOrderHttpError(422);
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
      if (bytes > 65536) throw new JdClauseOrderHttpError(413);
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
export async function readJdClauseOrderHttpForm(
  request: Request,
  options: { timeoutMs?: number } = {},
): Promise<JdClauseOrderHttpInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/iu.test(
      contentType,
    ) &&
    !/^multipart\/form-data\s*;/iu.test(contentType)
  )
    throw new JdClauseOrderHttpError(415);
  const timeout = z
    .number()
    .int()
    .min(1)
    .max(5000)
    .safeParse(options.timeoutMs ?? 5000);
  if (!timeout.success) throw new JdClauseOrderHttpError(422);
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
          "command",
          "reviewAcknowledgement",
          "receipt",
          "idempotencyKey",
        ].includes(key)
      )
        throw new JdClauseOrderHttpError(422);
      values.set(key, value);
    }
    const action = values.get("action");
    if (action === "decision" && values.has("command")) {
      const command = parseClauseOrderCommand(
        strictJson(values.get("command")!),
      );
      clauseOrderCommandSha256(command);
      const accepting = command.operation === "accept";
      if (
        values.size !== (accepting ? 3 : 2) ||
        (accepting
          ? values.get("reviewAcknowledgement") !== "accepted"
          : values.has("reviewAcknowledgement"))
      )
        throw new JdClauseOrderHttpError(422);
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
      const receipt = JdClauseOrderReceiptSchema.parse(
        strictJson(values.get("receipt")!),
      );
      const idempotencyKey = canonicalUuid.parse(values.get("idempotencyKey"));
      if (
        receipt.action !== "accept" ||
        idempotencyKey === receipt.idempotencyKey
      )
        throw new JdClauseOrderHttpError(422);
      budget.check();
      return { action, receipt, idempotencyKey };
    }
    throw new JdClauseOrderHttpError(422);
  } catch (error) {
    if (error instanceof JdClauseOrderHttpError) throw error;
    throw new JdClauseOrderHttpError(422);
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
export function validateJdClauseOrderUndoEvent(
  raw: unknown,
  receipt: JdClauseOrderReceipt,
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
      command = parseClauseOrderCommand(event.command),
      stored = validateClauseOrderReceipt(event.result, command),
      doc = accepted.document;
    validateClauseOrderReceipt(receipt, command);
    if (
      stored.idempotent !== false ||
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
      throw new JdClauseOrderHttpError(422);
    return { command, receipt: stored };
  } catch {
    throw new JdClauseOrderHttpError(422);
  }
}
const legacyUndoReceiptSchema = z.strictObject({
  status: z.literal("applied"),
  action: z.literal("undo"),
  versionId: canonicalUuid,
  revision: z.number().int().min(1).max(2_147_483_647),
  eventId: canonicalUuid,
  idempotent: z.boolean(),
});
const eventColumns =
  "id,analysis_id,resume_id,owner_id,organization_id,base_version_id,result_version_id,idempotency_key,action,command,result,retention_policy_id";
/** Internal legacy undo acknowledgement is never the public v2 wire. */
export function validateJdClauseOrderUndoResult(
  raw: unknown,
  rawEvent: unknown,
  accepted: JdClauseOrderReceipt,
  idempotencyKey: string,
  originalEvent: z.infer<typeof eventSchema>,
) {
  try {
    const receipt = legacyUndoReceiptSchema.parse(raw),
      event = eventSchema.extend({ action: z.literal("undo") }).parse(rawEvent),
      stored = legacyUndoReceiptSchema.parse(event.result);
    const command = {
      action: "undo",
      expectedVersionId: accepted.versionId,
      idempotencyKey,
      targetFactId: null,
      sectionId: null,
      value: null,
      questionKind: null,
      pattern: null,
      targetVersionId: accepted.baseVersionId,
      confirmation: false,
      patch: null,
    };
    if (
      stored.idempotent !== false ||
      !isDeepStrictEqual(
        { ...stored, idempotent: false },
        { ...receipt, idempotent: false },
      ) ||
      event.id !== receipt.eventId ||
      event.id === accepted.eventId ||
      event.analysis_id !== originalEvent.analysis_id ||
      event.owner_id !== originalEvent.owner_id ||
      event.organization_id !== originalEvent.organization_id ||
      event.resume_id !== originalEvent.resume_id ||
      event.retention_policy_id !== originalEvent.retention_policy_id ||
      event.base_version_id !== accepted.versionId ||
      event.result_version_id !== receipt.versionId ||
      event.idempotency_key !== idempotencyKey ||
      !isDeepStrictEqual(event.command, command) ||
      receipt.revision !== accepted.revision + 1 ||
      receipt.versionId === accepted.versionId ||
      receipt.versionId === accepted.baseVersionId
    )
      throw Error("CLAUSE_ORDER_UNDO_RESULT");
    return JdClauseOrderUndoReceiptSchema.parse({
      schemaVersion: "jd-clause-order-undo-receipt/2.0.0",
      status: "applied",
      action: "undo",
      idempotencyKey,
      acceptedEventId: accepted.eventId,
      acceptedCommandSha256: accepted.commandSha256,
      acceptedVersionId: accepted.versionId,
      baseVersionId: accepted.baseVersionId,
      versionId: receipt.versionId,
      revision: receipt.revision,
      eventId: receipt.eventId,
      idempotent: receipt.idempotent,
    });
  } catch {
    throw new JdClauseOrderHttpError(503, "invalid_result", "retry_exact");
  }
}
/** Scope only the existing SDK select/RPC seams; late continuations cannot issue
 * another read or write after cancellation. An issued write may remain unknown. */
async function boundedUndo<T>(
  client: Client,
  signal: AbortSignal | undefined,
  work: (scoped: Client, active: () => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController(),
    deadline = Date.now() + 5000;
  const unavailable = () =>
    new JdClauseOrderHttpError(503, "unavailable", "retry_exact");
  let stop!: (error: unknown) => void;
  const stopped = new Promise<never>((_, reject) => {
    stop = reject;
  });
  const active = () => {
    if (signal?.aborted || controller.signal.aborted || Date.now() >= deadline)
      throw unavailable();
  };
  const cancel = () => {
    controller.abort();
    stop(unavailable());
  };
  const seen = new WeakSet<object>();
  function scopedRequest<
    TRequest extends { abortSignal(signal: AbortSignal): TRequest },
  >(request: TRequest): TRequest {
    active();
    if (!seen.has(request)) {
      seen.add(request);
      request.abortSignal = new Proxy(request.abortSignal, {
        apply(target, thisArg, args) {
          active();
          const supplied = args[0];
          if (!(supplied instanceof AbortSignal)) throw unavailable();
          return Reflect.apply(target, thisArg, [
            AbortSignal.any([controller.signal, supplied]),
          ]);
        },
      });
    }
    return request.abortSignal(controller.signal);
  }
  const scoped: Client = {
    from: (relation) => {
      active();
      const query = client.from(relation);
      // Preserve the SDK generic select signature while decorating this one query.
      query.select = new Proxy(query.select, {
        apply(target, thisArg, args) {
          active();
          return scopedRequest(Reflect.apply(target, thisArg, args));
        },
      });
      return query;
    },
    rpc: (name, args, options) => {
      active();
      return scopedRequest(client.rpc(name, args, options));
    },
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 5000);
  try {
    active();
    const result = await Promise.race([work(scoped, active), stopped]);
    active();
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
export async function executeJdClauseOrderHttp(
  client: Client,
  analysisId: string,
  ownerId: string,
  input: JdClauseOrderHttpInput,
  options: { signal?: AbortSignal } = {},
) {
  if (
    !canonicalUuid.safeParse(analysisId).success ||
    !canonicalUuid.safeParse(ownerId).success
  )
    throw new JdClauseOrderHttpError(422);
  if (input.action === "decision") {
    const command = parseClauseOrderCommand(input.command);
    if (
      input.reviewAcknowledgement !==
      (command.operation === "accept" ? "accepted" : null)
    )
      throw new JdClauseOrderHttpError(422);
    const receipt = await applyJdClauseOrderAction(
      client,
      analysisId,
      ownerId,
      command,
      command.idempotencyKey,
    );
    return JdClauseOrderHttpSuccessSchema.parse({ kind: "applied", receipt });
  }
  if (input.action !== "undo") throw new JdClauseOrderHttpError(422);
  const parsedInputReceipt = JdClauseOrderReceiptSchema.safeParse(
      input.receipt,
    ),
    parsedKey = canonicalUuid.safeParse(input.idempotencyKey);
  if (!parsedInputReceipt.success || !parsedKey.success)
    throw new JdClauseOrderHttpError(422);
  const receipt = parsedInputReceipt.data,
    key = parsedKey.data;
  if (receipt.action !== "accept" || key === receipt.idempotencyKey)
    throw new JdClauseOrderHttpError(422);
  return boundedUndo(client, options.signal, async (client, active) => {
    const accepted = await loadCanonical(client, analysisId, ownerId, {
      versionId: receipt.versionId,
    });
    active();
    if (!accepted.current)
      throw new JdClauseOrderHttpError(404, "unavailable", "unavailable");
    const event = await client
      .from("authoring_events")
      .select(eventColumns)
      .eq("id", receipt.eventId)
      .eq("analysis_id", analysisId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    active();
    if (event.error)
      throw new JdClauseOrderHttpError(503, "unavailable", "retry_exact");
    if (!event.data)
      throw new JdClauseOrderHttpError(404, "unavailable", "unavailable");
    validateJdClauseOrderUndoEvent(event.data, receipt, analysisId, ownerId, {
      document: accepted.current.document,
      revision: accepted.current.revision,
      sourceId: accepted.current.sourceId,
    });
    const originalEvent = eventSchema.parse(event.data);
    active();
    const raw = await applyAuthoring(
      client,
      analysisId,
      ownerId,
      {
        action: "undo",
        expectedVersionId: receipt.versionId,
        idempotencyKey: key,
      },
      key,
    );
    active();
    const parsed = legacyUndoReceiptSchema.safeParse(raw);
    if (!parsed.success)
      throw new JdClauseOrderHttpError(503, "invalid_result", "retry_exact");
    const undone = await client
      .from("authoring_events")
      .select(eventColumns)
      .eq("id", parsed.data.eventId)
      .eq("analysis_id", analysisId)
      .eq("owner_id", ownerId)
      .eq("idempotency_key", key)
      .maybeSingle();
    active();
    if (undone.error || !undone.data)
      throw new JdClauseOrderHttpError(503, "invalid_result", "retry_exact");
    return JdClauseOrderHttpSuccessSchema.parse({
      kind: "undone",
      receipt: validateJdClauseOrderUndoResult(
        raw,
        undone.data,
        receipt,
        key,
        originalEvent,
      ),
    });
  });
}
