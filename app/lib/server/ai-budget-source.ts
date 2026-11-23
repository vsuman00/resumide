import { createHash } from "node:crypto";
import { z } from "zod";
import { AiBudgetError, createAiBudgetClient } from "./ai-budget";
import { runProviderAttempt } from "./provider-attempt";

export const AiBudgetSourceUuidSchema = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
export const AiBudgetSourceSchema = z.strictObject({
  schemaVersion: z.literal("ai-budget-source/1.0.0"),
  kind: z.literal("legacy_rewrite"),
  analysisId: AiBudgetSourceUuidSchema,
  resumeVersionId: AiBudgetSourceUuidSchema,
  requestNonce: z.string().regex(/^[\x20-\x7e]{1,128}$/u),
});
export type AiBudgetSource = z.infer<typeof AiBudgetSourceSchema>;
const sourceSha = z.string().regex(/^[a-f0-9]{64}$/u);
export const AiBudgetCallerSourceSchema = z.discriminatedUnion("kind", [
  AiBudgetSourceSchema,
  z.strictObject({
    schemaVersion: z.literal("ai-budget-source/2.0.0"),
    kind: z.literal("legacy_qualitative"),
    analysisId: AiBudgetSourceUuidSchema,
    resumeVersionId: AiBudgetSourceUuidSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal("ai-budget-source/2.0.0"),
    kind: z.literal("canonical_rewrite"),
    analysisId: AiBudgetSourceUuidSchema,
    resumeVersionId: AiBudgetSourceUuidSchema,
    operationId: AiBudgetSourceUuidSchema,
    bindingSha256: sourceSha,
  }),
  z.strictObject({
    schemaVersion: z.literal("ai-budget-source/2.0.0"),
    kind: z.literal("initial_feedback"),
    analysisId: AiBudgetSourceUuidSchema,
    resumeVersionId: AiBudgetSourceUuidSchema,
    operationId: AiBudgetSourceUuidSchema,
    attemptId: AiBudgetSourceUuidSchema,
    lease: z.strictObject({
      workerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
      attempt: z.number().int().min(1).max(3),
      leaseFence: AiBudgetSourceUuidSchema,
    }),
  }),
  z.strictObject({
    schemaVersion: z.literal("ai-budget-source/2.0.0"),
    kind: z.literal("build_account"),
    requestNonce: AiBudgetSourceSchema.shape.requestNonce,
  }),
]);
const scopeSchema = z.strictObject({
  userId: AiBudgetSourceUuidSchema,
  organizationId: AiBudgetSourceUuidSchema,
  source: AiBudgetCallerSourceSchema,
});
export type AiBudgetSourceScope = z.infer<typeof scopeSchema>;
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
export const AiBudgetSourceProfileSchema = z.strictObject({
  schemaVersion: z.literal("ai-budget-source-readiness/2.0.0"),
  profileVersion: z.literal("ai-budget-source-profile/2.0.0"),
  checkerSha256: sha,
  reserveSha256: sha,
  exportSha256: sha,
  metadataSha256: sha,
});
export type AiBudgetSourceProfile = z.infer<typeof AiBudgetSourceProfileSchema>;
export type AiBudgetSourceProfileSelection =
  AiBudgetSourceProfile | readonly AiBudgetSourceProfile[];
export const AiBudgetSourceReadinessSchema = AiBudgetSourceProfileSchema.extend(
  {
    schemaReady: z.boolean(),
    reserveExecutable: z.boolean(),
    exportExecutable: z.boolean(),
  },
);
const unavailable = () => new AiBudgetError("AI_BUDGET_UNAVAILABLE");

/** OP2 only. OP1 and its existing framing remain unchanged. */
export function createSourceBoundAiBudgetOperationId(
  raw: AiBudgetSourceScope,
): string {
  const parsed = scopeSchema.safeParse(raw);
  if (!parsed.success) throw new AiBudgetError("AI_BUDGET_INVALID");
  const { userId, organizationId, source } = parsed.data;
  if (source.kind === "legacy_qualitative") return source.analysisId;
  if (source.kind === "initial_feedback") return source.operationId;
  const atoms =
    source.kind === "build_account"
      ? [userId, organizationId, source.kind, source.requestNonce]
      : [
          userId,
          organizationId,
          source.kind,
          source.analysisId,
          source.resumeVersionId,
          source.kind === "legacy_rewrite"
            ? source.requestNonce
            : source.operationId,
        ];
  const hash = createHash("sha256").update("AIBUDGET-OP2\n", "utf8");
  for (const atom of atoms)
    hash.update(`T${Buffer.byteLength(atom, "utf8")}:${atom};`, "utf8");
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Check JSON without invoking accessors or serializing an unbounded reply. */
export function assertAiBudgetSourceJson(raw: unknown): void {
  const pending = [{ value: raw, depth: 0 }];
  let visits = 0,
    bytes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++visits > 100000 || depth > 8) throw unavailable();
    if (typeof value === "string") {
      if (
        value.length > 33554432 ||
        value.includes("\0") ||
        /[\uD800-\uDFFF]/u.test(value)
      )
        throw unavailable();
      bytes += Buffer.byteLength(JSON.stringify(value), "utf8");
    } else if (typeof value === "boolean" || value === null) bytes += 5;
    else if (Array.isArray(value)) {
      if (
        value.length > 4096 ||
        Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1
      )
        throw unavailable();
      bytes += value.length + 2;
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (
          !descriptor ||
          descriptor.get ||
          descriptor.set ||
          !descriptor.enumerable
        )
          throw unavailable();
        pending.push({ value: descriptor.value, depth: depth + 1 });
      }
    } else if (typeof value === "object" && value !== null) {
      const proto = Object.getPrototypeOf(value),
        descriptors = Object.getOwnPropertyDescriptors(value);
      if (
        (proto !== Object.prototype && proto !== null) ||
        Reflect.ownKeys(value).length !== Object.keys(descriptors).length
      )
        throw unavailable();
      bytes += 2;
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (
          descriptor.get ||
          descriptor.set ||
          !descriptor.enumerable ||
          key.includes("\0") ||
          /[\uD800-\uDFFF]/u.test(key)
        )
          throw unavailable();
        bytes += Buffer.byteLength(JSON.stringify(key), "utf8") + 2;
        pending.push({ value: descriptor.value, depth: depth + 1 });
      }
    } else throw unavailable();
    if (bytes > 33554432) throw unavailable();
  }
}
type Reply = { data: unknown; error: unknown };
export interface AiBudgetSourceRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<Reply> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<Reply>;
  };
}
export type AiBudgetSourceOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};
/** One fresh deadline covers readiness and its dependent source operation. */
export async function withAiBudgetSourceReadiness<T>(
  client: AiBudgetSourceRpcClient,
  rawProfile: AiBudgetSourceProfileSelection,
  capability: "reserveExecutable" | "exportExecutable",
  work: (
    call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ) => Promise<T>,
  options: AiBudgetSourceOptions = {},
): Promise<T> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  try {
    const profiles = z
        .array(AiBudgetSourceProfileSchema)
        .nonempty()
        .parse(Array.isArray(rawProfile) ? rawProfile : [rawProfile]),
      timeoutMs = options.timeoutMs ?? 5000;
    if (
      !client ||
      typeof client.rpc !== "function" ||
      !["reserveExecutable", "exportExecutable"].includes(capability) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 5000 ||
      options.signal?.aborted
    )
      throw unavailable();
    let observed = Date.now();
    const end = observed + timeoutMs;
    if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(end))
      throw unavailable();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    return await runProviderAttempt({
      timeoutMs,
      signal: controller.signal,
      failure: unavailable,
      execute: async (signal) => {
        const active = () => {
          const at = Date.now();
          if (!Number.isSafeInteger(at) || at < observed || at >= end)
            controller.abort();
          if (signal.aborted) throw unavailable();
          observed = at;
        };
        const call = async (name: string, args: Record<string, unknown>) => {
          active();
          const pending = client.rpc(name, args);
          const reply = await (typeof pending.abortSignal === "function"
            ? pending.abortSignal(signal)
            : pending);
          active();
          if (!reply || reply.error !== null) throw unavailable();
          return reply.data;
        };
        const raw = await call("read_ai_budget_source_readiness", {});
        assertAiBudgetSourceJson(raw);
        const ready = AiBudgetSourceReadinessSchema.parse(raw);
        if (
          !ready.schemaReady ||
          !ready[capability] ||
          !profiles.some((profile) =>
            Object.entries(profile).every(
              ([key, value]) => ready[key as keyof typeof ready] === value,
            ),
          )
        )
          throw unavailable();
        const result = await work(call);
        active();
        return result;
      },
    });
  } catch {
    throw unavailable();
  } finally {
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

/** Reserve alone uses the new atomic source RPC. Existing receipt and post-dispatch accounting remain owned by createAiBudgetClient. */
export function createSourceBoundAiBudgetClient(
  client: AiBudgetSourceRpcClient,
  rawScope: AiBudgetSourceScope,
  profile: AiBudgetSourceProfileSelection,
  options: AiBudgetSourceOptions = {},
) {
  const parsed = scopeSchema.safeParse(rawScope);
  if (!parsed.success) throw new AiBudgetError("AI_BUDGET_INVALID");
  const scope = parsed.data,
    operationId = createSourceBoundAiBudgetOperationId(scope);
  const source = scope.source;
  const surface =
    source.kind === "build_account"
      ? "build"
      : source.kind === "legacy_qualitative" ||
          source.kind === "initial_feedback"
        ? "qualitative"
        : "rewrite";
  return createAiBudgetClient({
    rpc: async (name, args) => {
      const p = args.p_request;
      if (
        !p ||
        typeof p !== "object" ||
        Array.isArray(p) ||
        args.p_user_id !== scope.userId ||
        args.p_organization_id !== scope.organizationId ||
        (p as Record<string, unknown>).operationId !== operationId ||
        (p as Record<string, unknown>).surface !== surface ||
        (source.kind === "canonical_rewrite" &&
          (p as Record<string, unknown>).payloadSha256 !==
            source.bindingSha256) ||
        (source.kind === "initial_feedback" &&
          (p as Record<string, unknown>).attemptId !== source.attemptId)
      )
        throw new AiBudgetError("AI_BUDGET_INVALID");
      if (name === "ai_budget_reserve")
        throw new AiBudgetError("AI_BUDGET_INVALID");
      if (name === "ai_budget_reserve_next") {
        return await withAiBudgetSourceReadiness(
          client,
          profile,
          "reserveExecutable",
          async (call) => ({
            data: await call("ai_budget_reserve_source_next", {
              ...args,
              p_source: structuredClone(scope.source),
            }),
            error: null,
          }),
          options,
        );
      }
      // Fresh dispatch is guarded by Native source admission under locks. Settlement,
      // holds and predispatch release must not acquire a new live-source prerequisite.
      return await client.rpc(name, args);
    },
  });
}
