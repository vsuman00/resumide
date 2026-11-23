import { z } from "zod";
import { runProviderAttempt } from "./provider-attempt";

import {
  InitialFeedbackUsageReplySchema,
  type InitialFeedbackUsageReply,
} from "./initial-feedback-operation-contract";

export const OwnedAiUsageSchema = InitialFeedbackUsageReplySchema;
export type OwnedAiUsage = InitialFeedbackUsageReply;
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z.uuid().regex(/^[a-f0-9-]+$/u);
export class OwnedAiUsageError extends Error {
  constructor(readonly code: "unavailable" | "unknown_usage" = "unavailable") {
    super("AI usage is unavailable.");
    this.name = "OwnedAiUsageError";
  }
}
type Result = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<Result> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<Result>;
};
export interface OwnedAiUsageClient {
  rpc(name: string, args: Record<string, unknown>): RpcRequest;
}
const owned = z.strictObject({
  ownerId: id,
  organizationId: id,
  analysisId: id,
});
export interface OwnedAiUsageExpectedProfile {
  readonly profileVersion: "initial-feedback-readiness-profile/1.0.0";
  readonly usageSha256: string;
}
const profile = z.object({
  profileVersion: z.literal("initial-feedback-readiness-profile/1.0.0"),
  usageSha256: sha,
});
const unavailable = () => new OwnedAiUsageError();
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
/** Owned current-month observation, not an atomic quota reservation.
 * All three disjoint components and unknown claimed spend are mandatory. */
export async function readOwnedAiUsage(
  client: OwnedAiUsageClient,
  binding: z.infer<typeof owned>,
  expectedProfile: OwnedAiUsageExpectedProfile,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): Promise<OwnedAiUsage> {
  const parsed = owned.safeParse(binding),
    expected = profile.safeParse(expectedProfile),
    timeoutMs = options.timeoutMs ?? 5000;
  if (
    !parsed.success ||
    !expected.success ||
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
        const pending = client.rpc("read_initial_feedback_usage", {
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
  const raw = OwnedAiUsageSchema.safeParse(result?.data);
  if (result?.error || !raw.success) throw unavailable();
  const value = raw.data;
  try {
    const ended = now();
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
    value.profileVersion !== expected.data.profileVersion ||
    value.usageSha256 !== expected.data.usageSha256 ||
    BigInt(value.legacyUnlinkedTokens) +
      BigInt(value.canonicalTokens) +
      BigInt(value.initialFeedbackTokens) !==
      BigInt(value.totalTokens)
  )
    throw unavailable();
  if (BigInt(value.unknownClaims) !== 0n)
    throw new OwnedAiUsageError("unknown_usage");
  return value;
}
