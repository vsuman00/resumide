import { INACTIVE_DELETION_STATUSES } from "../privacy-deletion";
import { z } from "zod";
import {
  OWNED_AI_DISPOSITION_PROFILE,
  OWNED_AI_DISPOSITION_REGROUP_PROFILE,
} from "./owned-ai-disposition-profile";

import { OwnedAiDispositionReadinessSchema as readiness } from "./owned-ai-disposition-export";

const owner = z.uuid().regex(/^[a-f0-9-]+$/u);
const access = z.strictObject({
  schemaVersion: z.literal("candidate-privacy-access/1.0.0"),
  ownerId: owner,
  deletionPrepared: z.boolean(),
  blockingRequest: z.boolean(),
});
type PrivacyAccessReply = { data: unknown; error: unknown };
type PrivacyAccessClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<PrivacyAccessReply> & {
    abortSignal(signal: AbortSignal): PromiseLike<PrivacyAccessReply>;
  };
};
export type CandidatePrivacyAccess =
  | { state: "unavailable"; deletionPrepared: null }
  | { state: "clear" | "blocked"; deletionPrepared: boolean };

/** One deadline covers metadata and access. Missing authority never clears access. */
export async function readCandidatePrivacyAccess(
  client: PrivacyAccessClient,
  userId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<CandidatePrivacyAccess> {
  const unavailable = { state: "unavailable", deletionPrepared: null } as const;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (
    !owner.safeParse(userId).success ||
    options.signal?.aborted ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 5000
  )
    return unavailable;
  let observedAt = Date.now();
  const deadline = observedAt + timeoutMs;
  if (!Number.isFinite(observedAt) || !Number.isFinite(deadline))
    return unavailable;
  const controller = new AbortController();
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  const abort = () => {
    if (controller.signal.aborted) return;
    rejectInterrupted(new Error("Privacy access is unavailable."));
    controller.abort();
  };
  const active = () => {
    const now = Date.now();
    if (!Number.isFinite(now) || now < observedAt || now >= deadline) abort();
    if (controller.signal.aborted)
      throw new Error("Privacy access is unavailable.");
    observedAt = now;
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    const work = async (): Promise<CandidatePrivacyAccess> => {
      active();
      const metadata = await client
        .rpc("read_owned_ai_disposition_readiness", {})
        .abortSignal(controller.signal);
      active();
      const parsed = readiness.safeParse(metadata.data);
      if (
        metadata.error !== null ||
        !parsed.success ||
        !parsed.data.schemaReady ||
        !parsed.data.accessExecutable ||
        ![
          OWNED_AI_DISPOSITION_PROFILE,
          OWNED_AI_DISPOSITION_REGROUP_PROFILE,
        ].some((profile) =>
          Object.entries(profile).every(
            ([key, expected]) =>
              parsed.data[key as keyof typeof parsed.data] === expected,
          ),
        )
      )
        return unavailable;
      active();
      const reply = await client
        .rpc("read_candidate_privacy_access", { p_user_id: userId })
        .abortSignal(controller.signal);
      active();
      const value = access.safeParse(reply.data);
      if (
        reply.error !== null ||
        !value.success ||
        value.data.ownerId !== userId
      )
        return unavailable;
      return {
        state:
          value.data.deletionPrepared || value.data.blockingRequest
            ? "blocked"
            : "clear",
        deletionPrepared: value.data.deletionPrepared,
      };
    };
    const result = await Promise.race([work(), interrupted]);
    active();
    return result;
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
  }
}

type StatusFilter = {
  neq(
    column: "status",
    value: (typeof INACTIVE_DELETION_STATUSES)[number],
  ): unknown;
};

/** Failed work and a successfully withdrawn request do not block access. */
export function filterBlockingDeletions(query: StatusFilter): void {
  // PostgREST filters mutate this builder; callers keep its concrete result type.
  for (const status of INACTIVE_DELETION_STATUSES) query.neq("status", status);
}

export function deletionAccessState(result: {
  data: unknown;
  error: unknown;
}): "clear" | "blocked" | "unavailable" {
  if (result.error !== null || !Array.isArray(result.data))
    return "unavailable";
  return result.data.length === 0 ? "clear" : "blocked";
}
