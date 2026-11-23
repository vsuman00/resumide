import { z } from "zod";
import { CanonicalRewriteError } from "./canonical-rewrite-contract";
import { CANONICAL_REWRITE_READINESS_PROFILE } from "./canonical-rewrite-readiness-profile";
import { runProviderAttempt } from "./provider-attempt";

const count = z
  .string()
  .max(128)
  .regex(/^(?:0|[1-9][0-9]*)$/u);
const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-01$/u);
export const CanonicalRewriteUsageSchema = z.strictObject({
  schemaVersion: z.literal("canonical-rewrite-usage/1.0.0"),
  profileVersion: z.literal("canonical-rewrite-readiness-profile/1.0.1"),
  usageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  ownerId: z.uuid(),
  organizationId: z.uuid(),
  analysisId: z.uuid(),
  periodStart: month,
  periodEnd: month,
  legacyTokens: count,
  canonicalTokens: count,
  totalTokens: count,
  unknownClaims: count,
});
export type CanonicalRewriteUsage = z.infer<typeof CanonicalRewriteUsageSchema>;
type Result = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<Result> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<Result>;
};
export interface CanonicalRewriteUsageClient {
  rpc(name: string, args: Record<string, unknown>): RpcRequest;
}
const owned = z.strictObject({
  ownerId: z.uuid(),
  organizationId: z.uuid(),
  analysisId: z.uuid(),
});
const unavailable = () =>
  new CanonicalRewriteError("unavailable", "retry_exact");
function utcMonth(time: number) {
  if (!Number.isFinite(time)) throw unavailable();
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString().slice(0, 7) + "-01";
}
function nextMonth(time: number) {
  const date = new Date(time);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return utcMonth(date.getTime());
}
/** Fresh owned observation only; this does not reserve an atomic monthly quota.
 * Current-month ambiguity and unknown spend stop admission without fallback. */
export async function readCanonicalRewriteUsage(
  client: CanonicalRewriteUsageClient,
  binding: z.infer<typeof owned>,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): Promise<CanonicalRewriteUsage> {
  const parsed = owned.safeParse(binding),
    timeoutMs = options.timeoutMs ?? 5000;
  if (
    !parsed.success ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 5000
  )
    throw unavailable();
  const now = options.now ?? Date.now;
  let started: number;
  let result: Result;
  try {
    started = now();
    utcMonth(started);
    result = await runProviderAttempt({
      timeoutMs,
      signal: options.signal,
      failure: unavailable,
      execute: async (signal) => {
        const pending = client.rpc("read_canonical_rewrite_usage", {
          p_user_id: parsed.data.ownerId,
          p_analysis_id: parsed.data.analysisId,
        });
        return await (typeof pending.abortSignal === "function"
          ? pending.abortSignal(signal)
          : pending);
      },
    });
  } catch {
    throw unavailable();
  }
  const raw = CanonicalRewriteUsageSchema.safeParse(result?.data);
  if (result?.error || !raw.success) throw unavailable();
  const value = raw.data;
  let ended: number;
  try {
    ended = now();
    if (
      ended < started ||
      ended - started >= timeoutMs ||
      utcMonth(started) !== utcMonth(ended) ||
      value.periodStart !== utcMonth(ended) ||
      value.periodEnd !== nextMonth(ended)
    )
      throw unavailable();
  } catch {
    throw unavailable();
  }
  if (
    value.ownerId !== parsed.data.ownerId ||
    value.organizationId !== parsed.data.organizationId ||
    value.analysisId !== parsed.data.analysisId ||
    value.profileVersion !==
      CANONICAL_REWRITE_READINESS_PROFILE.profileVersion ||
    value.usageSha256 !== CANONICAL_REWRITE_READINESS_PROFILE.usageSha256 ||
    BigInt(value.legacyTokens) + BigInt(value.canonicalTokens) !==
      BigInt(value.totalTokens)
  )
    throw unavailable();
  if (BigInt(value.unknownClaims) !== 0n)
    throw new CanonicalRewriteError("unavailable", "review_again");
  return value;
}
