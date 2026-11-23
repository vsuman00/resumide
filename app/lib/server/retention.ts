import { z } from "zod";
import { retentionCutoff } from "./privacy-operations";
import { createResumeStorage, createResumeStorageKey } from "./storage";
import { createSupabaseAdminClient } from "./supabase";
import { runProviderAttempt } from "./provider-attempt";
import { OwnedAiDispositionReadinessSchema } from "./owned-ai-disposition-export";
import { OWNED_AI_DISPOSITION_PROFILE } from "./owned-ai-disposition-profile";

export type RetentionOptions = { signal?: AbortSignal; timeoutMs?: number };
export interface RetentionRepository {
  claimExpiredObjects(
    before: string,
    limit: number,
    options?: RetentionOptions,
  ): Promise<Array<{ id: string; storageKey: string }>>;
  complete(id: string, options?: RetentionOptions): Promise<void>;
  fail(
    id: string,
    errorCode: string,
    options?: RetentionOptions,
  ): Promise<void>;
}
type Code =
  | "RETENTION_CLAIM_UNAVAILABLE"
  | "RETENTION_STORAGE_UNCONFIRMED"
  | "RETENTION_COMPLETION_UNCONFIRMED"
  | "RETENTION_FAILURE_UNCONFIRMED";
const messages: Record<Code, string> = {
  RETENTION_CLAIM_UNAVAILABLE: "Retention claim failed.",
  RETENTION_STORAGE_UNCONFIRMED:
    "Retention storage removal could not be confirmed.",
  RETENTION_COMPLETION_UNCONFIRMED:
    "Retention completion could not be confirmed.",
  RETENTION_FAILURE_UNCONFIRMED: "Retention failure could not be recorded.",
};
export class RetentionError extends Error {
  constructor(readonly code: Code) {
    super(messages[code]);
    this.name = "RetentionError";
  }
}
type Deadline = {
  signal: AbortSignal;
  active(): void;
  rpcOptions(): RetentionOptions;
};
async function bounded<T>(
  options: RetentionOptions,
  maxMs: number,
  failure: () => RetentionError,
  execute: (deadline: Deadline) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  try {
    const timeoutMs = options.timeoutMs ?? maxMs;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > maxMs ||
      options.signal?.aborted
    )
      throw failure();
    let observed = Date.now();
    const end = observed + timeoutMs;
    if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(end))
      throw failure();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    return await runProviderAttempt({
      timeoutMs,
      signal: controller.signal,
      failure,
      execute: async (signal) => {
        const active = () => {
          const at = Date.now();
          if (!Number.isSafeInteger(at) || at < observed || at >= end)
            controller.abort();
          if (signal.aborted) throw failure();
          observed = at;
        };
        const deadline = {
          signal,
          active,
          rpcOptions() {
            active();
            return { signal, timeoutMs: Math.min(5000, end - observed) };
          },
        };
        active();
        const result = await execute(deadline);
        active();
        return result;
      },
    });
  } catch (error) {
    if (error instanceof RetentionError) throw error;
    throw failure();
  } finally {
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export async function runRetentionSweep(
  repository: RetentionRepository,
  removeObject: (storageKey: string) => Promise<void>,
  now: Date,
  retentionDays: number,
  limit = 100,
  options: RetentionOptions = {},
): Promise<{ claimed: number; completed: number; failed: number }> {
  let phase: Code = "RETENTION_CLAIM_UNAVAILABLE";
  const failure = () => new RetentionError(phase);
  return bounded(options, 30000, failure, async (deadline) => {
    if (
      !(now instanceof Date) ||
      !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(retentionDays) ||
      retentionDays < 1 ||
      retentionDays > 3650 ||
      !validLimit(limit)
    )
      throw failure();
    const items = await repository.claimExpiredObjects(
      retentionCutoff(now, retentionDays).toISOString(),
      limit,
      deadline.rpcOptions(),
    );
    deadline.active();
    let completed = 0,
      failed = 0;
    for (const item of items) {
      phase = "RETENTION_STORAGE_UNCONFIRMED";
      deadline.active();
      try {
        // The storage API has no abort hook. A bounded wait is not proof that a
        // timed-out or cancelled removal stopped at the object service.
        await removeObject(item.storageKey);
      } catch {
        deadline.active();
        phase = "RETENTION_FAILURE_UNCONFIRMED";
        await repository.fail(
          item.id,
          "STORAGE_DELETE_FAILED",
          deadline.rpcOptions(),
        );
        deadline.active();
        failed += 1;
        continue;
      }
      deadline.active();
      phase = "RETENTION_COMPLETION_UNCONFIRMED";
      // Completion uncertainty must never be relabelled as storage failure.
      await repository.complete(item.id, deadline.rpcOptions());
      deadline.active();
      completed += 1;
    }
    return { claimed: items.length, completed, failed };
  });
}

const uuid = z.uuid().regex(/^[a-f0-9-]+$/u);
const stamp = z.iso.datetime();
const validLimit = (limit: number) =>
  Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000;
const row = z.strictObject({
  item_id: uuid,
  resume_id: uuid,
  storage_key: z.string().max(300),
});
const frame =
  /^organizations\/([a-f0-9-]{36})\/resumes\/([a-f0-9-]{36})\/versions\/([a-f0-9-]{36})\.pdf$/u;
function claimItems(raw: unknown, limit: number) {
  if (!Array.isArray(raw) || raw.length > limit)
    throw new RetentionError("RETENTION_CLAIM_UNAVAILABLE");
  const parsed = z.array(row).max(limit).safeParse(raw);
  if (!parsed.success) throw new RetentionError("RETENTION_CLAIM_UNAVAILABLE");
  const items = new Set<string>(),
    keys = new Set<string>(),
    versions = new Set<string>();
  return parsed.data.map((item) => {
    const parts = frame.exec(item.storage_key);
    if (
      !parts ||
      !uuid.safeParse(parts[1]).success ||
      !uuid.safeParse(parts[3]).success ||
      parts[2] !== item.resume_id ||
      createResumeStorageKey({
        organizationId: parts[1],
        resumeId: item.resume_id,
        versionId: parts[3],
      }) !== item.storage_key ||
      items.has(item.item_id) ||
      keys.has(item.storage_key) ||
      versions.has(parts[3])
    )
      throw new RetentionError("RETENTION_CLAIM_UNAVAILABLE");
    items.add(item.item_id);
    keys.add(item.storage_key);
    versions.add(parts[3]);
    return { id: item.item_id, storageKey: item.storage_key };
  });
}
type Reply = { data: unknown; error: unknown };
export interface RetentionRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<Reply> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<Reply>;
  };
}
export class SupabaseRetentionRepository implements RetentionRepository {
  constructor(private readonly client?: RetentionRpcClient) {}
  private async operation<T>(
    name: string,
    args: Record<string, unknown>,
    options: RetentionOptions,
    code: Code,
    decode: (raw: unknown) => T,
  ): Promise<T> {
    const failure = () => new RetentionError(code);
    return bounded(options, 5000, failure, async (deadline) => {
      const client: RetentionRpcClient =
        this.client ?? createSupabaseAdminClient();
      const invoke = async (method: string, input: Record<string, unknown>) => {
        deadline.active();
        const pending = client.rpc(method, input);
        const reply = await (typeof pending.abortSignal === "function"
          ? pending.abortSignal(deadline.signal)
          : pending);
        deadline.active();
        if (!reply || reply.error !== null) throw failure();
        return reply.data;
      };
      const metadata = OwnedAiDispositionReadinessSchema.safeParse(
        await invoke("read_owned_ai_disposition_readiness", {}),
      );
      if (
        !metadata.success ||
        !metadata.data.schemaReady ||
        Object.entries(OWNED_AI_DISPOSITION_PROFILE).some(
          ([key, expected]) =>
            metadata.data[key as keyof typeof metadata.data] !== expected,
        )
      )
        throw failure();
      return decode(await invoke(name, args));
    });
  }
  async claimExpiredObjects(
    before: string,
    limit: number,
    options: RetentionOptions = {},
  ) {
    if (!stamp.safeParse(before).success || !validLimit(limit))
      throw new RetentionError("RETENTION_CLAIM_UNAVAILABLE");
    return this.operation(
      "claim_expired_resume_objects",
      { p_before: before, p_limit: limit },
      options,
      "RETENTION_CLAIM_UNAVAILABLE",
      (raw) => claimItems(raw, limit),
    );
  }
  async complete(id: string, options: RetentionOptions = {}) {
    if (!uuid.safeParse(id).success)
      throw new RetentionError("RETENTION_COMPLETION_UNCONFIRMED");
    await this.operation(
      "complete_retention_item",
      { p_item_id: id },
      options,
      "RETENTION_COMPLETION_UNCONFIRMED",
      (raw) => {
        if (raw !== true)
          throw new RetentionError("RETENTION_COMPLETION_UNCONFIRMED");
      },
    );
  }
  async fail(id: string, errorCode: string, options: RetentionOptions = {}) {
    if (
      !uuid.safeParse(id).success ||
      typeof errorCode !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(errorCode)
    )
      throw new RetentionError("RETENTION_FAILURE_UNCONFIRMED");
    await this.operation(
      "fail_retention_item",
      { p_item_id: id, p_error_code: errorCode },
      options,
      "RETENTION_FAILURE_UNCONFIRMED",
      (raw) => {
        if (raw !== true)
          throw new RetentionError("RETENTION_FAILURE_UNCONFIRMED");
      },
    );
  }
}
export function createRetentionObjectRemover() {
  const storage = createResumeStorage();
  return (storageKey: string) => storage.remove(storageKey);
}
