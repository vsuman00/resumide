import { z } from "zod";
import { runProviderAttempt } from "./provider-attempt";
import type { AiBudgetSourceRpcClient } from "./ai-budget-source";
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
export const OwnedAiExpiryProfileSchema = z.strictObject({
  schemaVersion: z.literal("owned-ai-expiry-readiness/1.0.0"),
  profileVersion: z.literal("owned-ai-expiry-profile/1.0.0"),
  checkerSha256: sha,
  sweepSha256: sha,
  metadataSha256: sha,
});
export type OwnedAiExpiryProfile = z.infer<typeof OwnedAiExpiryProfileSchema>;
export const OwnedAiExpiryReadinessSchema = OwnedAiExpiryProfileSchema.extend({
  schemaReady: z.boolean(),
  foldExecutable: z.boolean(),
});
const count = z.number().int().min(0).max(100);
export const OwnedAiExpirySweepSchema = z
  .strictObject({
    schemaVersion: z.literal("owned-ai-expiry-sweep/1.0.0"),
    selectedCount: count,
    foldedCount: count,
    blockedCount: count,
    deadlineBreached: z.boolean(),
  })
  .refine(
    (value) => value.selectedCount === value.foldedCount + value.blockedCount,
  );
export type OwnedAiExpirySweep = z.infer<typeof OwnedAiExpirySweepSchema>;
export class OwnedAiExpiryError extends Error {
  readonly report?: Readonly<OwnedAiExpirySweep>;
  constructor(
    readonly code: "unavailable" | "incomplete" = "unavailable",
    report?: OwnedAiExpirySweep,
  ) {
    super(
      code === "incomplete"
        ? "Accounting expiry sweep requires attention."
        : "Accounting expiry sweep could not be confirmed.",
    );
    this.name = "OwnedAiExpiryError";
    this.report = report ? Object.freeze({ ...report }) : undefined;
  }
}
const unavailable = () => new OwnedAiExpiryError();
/** Both wire objects are flat, small JSON records; inspect descriptors before decoding. */
function wire(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw unavailable();
  const proto = Object.getPrototypeOf(raw),
    keys = Reflect.ownKeys(raw);
  if ((proto !== Object.prototype && proto !== null) || keys.length > 7)
    throw unavailable();
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 64) throw unavailable();
    const field = Object.getOwnPropertyDescriptor(raw, key);
    if (!field || field.get || field.set || !field.enumerable)
      throw unavailable();
    const value = field.value;
    if (
      typeof value === "string"
        ? value.length > 128 || value.includes("\0")
        : typeof value === "number"
          ? !Number.isSafeInteger(value)
          : typeof value !== "boolean"
    )
      throw unavailable();
  }
  return raw;
}
/** One readiness read and at most one destructive request. No automatic retry after uncertainty. */
export async function sweepOwnedAiExpiry(
  client: AiBudgetSourceRpcClient,
  rawProfile: OwnedAiExpiryProfile,
  limit = 100,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OwnedAiExpirySweep> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  let confirmed: OwnedAiExpirySweep;
  try {
    const profile = OwnedAiExpiryProfileSchema.parse(rawProfile),
      timeoutMs = options.timeoutMs ?? 5000;
    if (
      !client ||
      typeof client.rpc !== "function" ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
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
    const report = await runProviderAttempt({
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
          const request = client.rpc(name, args);
          const reply = await (typeof request.abortSignal === "function"
            ? request.abortSignal(signal)
            : request);
          active();
          if (!reply || reply.error !== null) throw unavailable();
          return wire(reply.data);
        };
        const ready = OwnedAiExpiryReadinessSchema.parse(
          await call("read_owned_ai_expiry_readiness", {}),
        );
        if (
          !ready.schemaReady ||
          !ready.foldExecutable ||
          Object.entries(profile).some(
            ([key, value]) => ready[key as keyof typeof ready] !== value,
          )
        )
          throw unavailable();
        const result = OwnedAiExpirySweepSchema.parse(
          await call("sweep_owned_ai_expiry", { p_limit: limit }),
        );
        if (
          result.selectedCount > limit ||
          result.foldedCount > limit ||
          result.blockedCount > limit
        )
          throw unavailable();
        active();
        return result;
      },
    });
    const finished = Date.now();
    if (
      !Number.isSafeInteger(finished) ||
      finished < observed ||
      finished >= end ||
      controller.signal.aborted ||
      options.signal?.aborted
    )
      throw unavailable();
    confirmed = report;
  } catch {
    // Transport errors cannot manufacture an authoritative count report.
    throw unavailable();
  } finally {
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
  if (confirmed.blockedCount > 0 || confirmed.deadlineBreached)
    throw new OwnedAiExpiryError("incomplete", confirmed);
  return confirmed;
}
