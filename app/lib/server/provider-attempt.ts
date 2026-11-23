export type ProviderUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export function classifyProviderHttpStatus(status: unknown) {
  if (status === 401 || status === 403) return "AI_PROVIDER_AUTH";
  if (status === 429) return "AI_RATE_LIMITED";
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 500 &&
    status <= 599
  )
    return "AI_PROVIDER_TRANSIENT";
  return "AI_PROVIDER_UNAVAILABLE";
}

/** Accept only observed SDK counters; absent, fractional or malformed is unknown. */
export function readProviderUsage(raw: unknown): ProviderUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const inputTokens = usage.prompt_tokens;
  const outputTokens = usage.completion_tokens;
  if (
    typeof inputTokens !== "number" ||
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    typeof outputTokens !== "number" ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0
  )
    return null;
  return Object.freeze({ inputTokens, outputTokens });
}

type AbortReason = "timeout" | "cancelled";

/** One in-memory attempt. Its signal reaches transport; it is not a spend ledger. */
export async function runProviderAttempt<T>(options: {
  timeoutMs: number;
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
  failure: (reason: AbortReason) => Error;
}): Promise<T> {
  if (options.signal?.aborted) throw options.failure("cancelled");
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 2_147_483_647
  )
    throw options.failure("timeout");
  const controller = new AbortController();
  let reason: AbortReason | null = null;
  let rejectCancellation!: (error: Error) => void;
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const abort = (next: AbortReason) => {
    if (reason !== null) return;
    reason = next;
    // Settle the bounded outcome before SDK abort listeners can race its code.
    rejectCancellation(options.failure(next));
    controller.abort();
  };
  const onAbort = () => abort("cancelled");
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (reason !== null) return await cancellation;
    timer = setTimeout(() => abort("timeout"), options.timeoutMs);
    timer.unref?.();
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted)
        throw options.failure(reason ?? "cancelled");
      return options.execute(controller.signal);
    });
    const result = await Promise.race([work, cancellation]);
    if (controller.signal.aborted) throw options.failure(reason ?? "cancelled");
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
