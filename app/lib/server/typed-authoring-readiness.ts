import { z } from "zod";
import { TypedAuthoringError } from "./typed-authoring-contract";

const digest = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/u);
export const TypedAuthoringReadinessProfileSchema = z.strictObject({
  schemaVersion: z.literal("typed-authoring-readiness/1.0.0"),
  profileVersion: z.enum([
    "typed-authoring-readiness-profile/1.0.0",
    "typed-authoring-readiness-profile/1.1.0",
  ]),
  canonicalReadinessSha256: digest,
  typedReadinessSha256: digest,
  writerSha256: digest,
  readerSha256: digest,
});
export const TypedAuthoringReadinessSchema =
  TypedAuthoringReadinessProfileSchema.extend({
    schemaReady: z.boolean(),
    writerExecutable: z.boolean(),
  });
export type TypedAuthoringReadinessProfile = z.infer<
  typeof TypedAuthoringReadinessProfileSchema
>;
export type TypedAuthoringReadiness = z.infer<
  typeof TypedAuthoringReadinessSchema
>;
export type TypedAuthoringReadinessOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};
type ReadResult = { data: unknown; error: unknown };
type ReadRequest = PromiseLike<ReadResult> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<ReadResult>;
};
export interface TypedAuthoringReadinessClient {
  rpc?: (
    name: "read_typed_authoring_readiness",
    args: Record<string, never>,
  ) => ReadRequest;
}

const hashFields = [
  "canonicalReadinessSha256",
  "typedReadinessSha256",
  "writerSha256",
  "readerSha256",
] as const;
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
 * Pins are supplied by the server source profile, never by browser commands.
 * Schema integrity and effective service EXECUTE are separate requirements. */
export async function assertTypedAuthoringReady(
  client: TypedAuthoringReadinessClient,
  expectedProfile: unknown,
  options: TypedAuthoringReadinessOptions = {},
): Promise<TypedAuthoringReadiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal: AbortSignal | undefined;
  let onAbort: (() => void) | undefined;
  const controller = new AbortController();
  try {
    const expectedProfiles = Array.isArray(expectedProfile)
      ? expectedProfile
      : [expectedProfile];
    if (expectedProfiles.length === 0 || expectedProfiles.length > 2)
      throw new TypedAuthoringError("unavailable");
    const profiles = expectedProfiles.map((profile) => {
      if (!bounded(profile, profileFields))
        throw new TypedAuthoringError("unavailable");
      return TypedAuthoringReadinessProfileSchema.parse(profile);
    });
    const parsedOptions = optionsSchema.safeParse(options);
    if (!parsedOptions.success || !client?.rpc)
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
      const request = rpc.call(client, "read_typed_authoring_readiness", {});
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
    const parsed = TypedAuthoringReadinessSchema.safeParse(result.data);
    if (
      !parsed.success ||
      !parsed.data.schemaReady ||
      !parsed.data.writerExecutable ||
      !profiles.some((profile) =>
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
