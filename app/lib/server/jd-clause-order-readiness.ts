import { z } from "zod";
import { TypedAuthoringError } from "./typed-authoring-contract";

import {
  JD_CLAUSE_ORDER_READINESS_PROFILE,
  JD_CLAUSE_ORDER_REGROUP_READINESS_PROFILE,
} from "./jd-clause-order-readiness-profile";
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const JdClauseOrderReadinessProfileSchema = z.strictObject({
  schemaVersion: z.literal("jd-clause-order-readiness/2.0.0"),
  profileVersion: z.literal("jd-clause-order-native/2.0.0"),
  checkerSha256: digest,
  writerSha256: digest,
  metadataSha256: digest,
});
export const JdClauseOrderReadinessSchema =
  JdClauseOrderReadinessProfileSchema.extend({
    schemaReady: z.boolean(),
    writerExecutable: z.boolean(),
  });
export type JdClauseOrderReadinessProfile = z.infer<
  typeof JdClauseOrderReadinessProfileSchema
>;
export type JdClauseOrderReadiness = z.infer<
  typeof JdClauseOrderReadinessSchema
>;
export type JdClauseOrderReadinessOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};
type ReadResult = { data: unknown; error: unknown };
type ReadRequest = PromiseLike<ReadResult> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<ReadResult>;
};
export interface JdClauseOrderReadinessClient {
  rpc?: (
    name: "read_jd_clause_order_readiness",
    args: Record<string, never>,
  ) => ReadRequest;
}

const hashFields = ["checkerSha256", "writerSha256", "metadataSha256"] as const;
const profileFields = [
  "schemaVersion",
  "profileVersion",
  ...hashFields,
] as const;
const replyFields = [...profileFields, "schemaReady", "writerExecutable"];
const optionsSchema = z.strictObject({
  timeoutMs: z.number().int().min(1).max(5000).optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

/** Bound scalar work before schema parsing. The RPC has no candidate payload. */
function bounded(raw: unknown, fields: readonly string[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    return false;
  return hashFields.every(
    (field) => typeof value[field] === "string" && value[field].length === 64,
  );
}

/** Fresh catalog admission only. Owned ORIGINAL command proof must run first.
 * Pins come only from the imported trusted source profile, never function arguments.
 * Schema integrity and effective service EXECUTE are separate requirements. */
export async function assertJdClauseOrderReady(
  client: JdClauseOrderReadinessClient,
  options: JdClauseOrderReadinessOptions = {},
): Promise<JdClauseOrderReadiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal: AbortSignal | undefined;
  let onAbort: (() => void) | undefined;
  const controller = new AbortController();
  try {
    const profiles = JdClauseOrderReadinessProfileSchema.array().safeParse([
      JD_CLAUSE_ORDER_READINESS_PROFILE,
      JD_CLAUSE_ORDER_REGROUP_READINESS_PROFILE,
    ]);
    const parsedOptions = optionsSchema.safeParse(options);
    if (!profiles.success || !parsedOptions.success || !client?.rpc)
      throw new TypedAuthoringError("unavailable");
    signal = parsedOptions.data.signal;
    const timeoutMs = parsedOptions.data.timeoutMs ?? 2000;
    const deadline = Date.now() + timeoutMs;
    const interrupted = Symbol("readiness interrupted");
    let stop!: (value: typeof interrupted) => void;
    const stopped = new Promise<typeof interrupted>((resolve) => {
      stop = resolve;
    });
    onAbort = () => {
      controller.abort();
      stop(interrupted);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const active = () => {
      if (
        signal?.aborted ||
        controller.signal.aborted ||
        Date.now() >= deadline
      )
        throw new TypedAuthoringError("unavailable");
    };
    active();
    timer = setTimeout(onAbort, timeoutMs);
    const rpc = client.rpc;
    const work = Promise.resolve().then(async () => {
      active();
      const request = rpc.call(client, "read_jd_clause_order_readiness", {});
      return await (request.abortSignal
        ? request.abortSignal(controller.signal)
        : request);
    });
    const result = await Promise.race([work, stopped]);
    active();
    if (
      result === interrupted ||
      result.error ||
      !bounded(result.data, replyFields)
    )
      throw new TypedAuthoringError("unavailable");
    const parsed = JdClauseOrderReadinessSchema.safeParse(result.data);
    if (
      !parsed.success ||
      !parsed.data.schemaReady ||
      !parsed.data.writerExecutable ||
      !profiles.data.some((profile) =>
        profileFields.every((field) => parsed.data[field] === profile[field]),
      )
    )
      throw new TypedAuthoringError("unavailable");
    active();
    return parsed.data;
  } catch {
    throw new TypedAuthoringError("unavailable");
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
