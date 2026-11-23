import { z } from "zod";
import { runProviderAttempt } from "./provider-attempt";

const id = z.uuid().regex(/^[a-f0-9-]+$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const stamp = z.iso
  .datetime()
  .regex(/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/u);
export const OwnedAiRetirementProfileSchema = z.strictObject({
  schemaVersion: z.literal("owned-ai-retirement-readiness/1.0.0"),
  profileVersion: z.literal("owned-ai-retirement-profile/1.0.0"),
  checkerSha256: sha,
  captureSha256: sha,
  exportSha256: sha,
  metadataSha256: sha,
});
export type OwnedAiRetirementProfile = z.infer<
  typeof OwnedAiRetirementProfileSchema
>;
export const OwnedAiRetirementRowSchema = z
  .strictObject({
    operation_id: id,
    publication_id: id,
    attempt_id: id.nullable(),
    run_id: id.nullable(),
    owner_id: id,
    organization_id: id,
    analysis_id: id,
    resume_id: id,
    resume_version_id: id,
    publication_state: z.enum(["assessed", "deterministic_only"]),
    binding_sha256: sha,
    retired_at: stamp,
    deletion_request_id: id.nullable(),
    retention_item_id: id.nullable(),
  })
  .superRefine((r, ctx) => {
    if (
      (r.deletion_request_id === null) === (r.retention_item_id === null) ||
      (r.publication_state === "assessed"
        ? r.attempt_id === null || r.run_id === null
        : r.run_id !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Retirement correlation is invalid.",
      });
  });
export type OwnedAiRetirementRow = Readonly<
  z.infer<typeof OwnedAiRetirementRowSchema>
>;
const metadata = OwnedAiRetirementProfileSchema.extend({
  schemaReady: z.boolean(),
  exportExecutable: z.boolean(),
});
const owner = z.strictObject({ ownerId: id });
export class OwnedAiRetirementExportError extends Error {
  constructor() {
    super("Owned AI retirement export is unavailable.");
    this.name = "OwnedAiRetirementExportError";
  }
}
const unavailable = () => new OwnedAiRetirementExportError();
function bounded(raw: unknown) {
  const work = [{ value: raw, depth: 0 }];
  let bytes = 0,
    visits = 0;
  while (work.length) {
    const { value, depth } = work.pop()!;
    if (++visits > 100000 || depth > 12) throw unavailable();
    if (typeof value === "string") {
      if (
        value.length > 33554432 ||
        value.includes("\0") ||
        /[\uD800-\uDFFF]/u.test(value)
      )
        throw unavailable();
      bytes += Buffer.byteLength(JSON.stringify(value), "utf8");
    } else if (value === null || typeof value === "boolean") bytes += 5;
    else if (Array.isArray(value)) {
      if (value.length > 4096) throw unavailable();
      bytes += value.length + 2;
      for (const v of value) work.push({ value: v, depth: depth + 1 });
    } else if (typeof value === "object" && value !== null) {
      const proto = Object.getPrototypeOf(value),
        ds = Object.getOwnPropertyDescriptors(value);
      if (
        (proto !== Object.prototype && proto !== null) ||
        Reflect.ownKeys(value).length !== Object.keys(ds).length
      )
        throw unavailable();
      bytes += 2;
      for (const [key, d] of Object.entries(ds)) {
        if (
          d.get ||
          d.set ||
          !d.enumerable ||
          key.includes("\0") ||
          /[\uD800-\uDFFF]/u.test(key)
        )
          throw unavailable();
        bytes += Buffer.byteLength(JSON.stringify(key), "utf8") + 2;
        work.push({ value: d.value, depth: depth + 1 });
      }
    } else throw unavailable();
    if (bytes > 33554432) throw unavailable();
  }
}
/** Shape only. Parsing ordinary JSON does not mint retirement authority. */
export const OwnedAiRetirementExportSchema = z.preprocess(
  (raw, ctx) => {
    try {
      bounded(raw);
      return raw;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Retirement export is unavailable.",
      });
      return z.NEVER;
    }
  },
  z.strictObject({
    schemaVersion: z.literal("owned-ai-retirement-export/1.0.0"),
    retirements: z.array(OwnedAiRetirementRowSchema).max(4096),
  }),
);
type Reply = { data: unknown; error: unknown };
export interface OwnedAiRetirementExportClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<Reply> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<Reply>;
  };
}
const brand: unique symbol = Symbol("validated owned retirement export");
export interface ValidatedOwnedAiRetirementExport {
  readonly [brand]: true;
}
const captures = new WeakMap<
  ValidatedOwnedAiRetirementExport,
  { ownerId: string; rows: readonly OwnedAiRetirementRow[] }
>();
/** A fresh bounded two-RPC admission. No default pins, cache, fallback or retry. */
export async function readOwnedAiRetirementExport(
  client: OwnedAiRetirementExportClient,
  rawOwner: { ownerId: string },
  rawProfile: OwnedAiRetirementProfile,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): Promise<ValidatedOwnedAiRetirementExport> {
  const binding = owner.safeParse(rawOwner),
    profile = OwnedAiRetirementProfileSchema.safeParse(rawProfile),
    timeoutMs = options.timeoutMs ?? 5000,
    now = options.now ?? Date.now;
  if (
    !binding.success ||
    !profile.success ||
    !client ||
    typeof client.rpc !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 5000 ||
    typeof now !== "function"
  )
    throw unavailable();
  try {
    const started = now();
    if (!Number.isFinite(started)) throw unavailable();
    const active = () => {
      const at = now();
      if (!Number.isFinite(at) || at < started || at - started >= timeoutMs)
        throw unavailable();
    };
    return await runProviderAttempt({
      timeoutMs,
      signal: options.signal,
      failure: unavailable,
      execute: async (signal) => {
        const call = async (name: string, args: Record<string, unknown>) => {
          active();
          if (signal.aborted) throw unavailable();
          const pending = client.rpc(name, args);
          const reply = await (typeof pending.abortSignal === "function"
            ? pending.abortSignal(signal)
            : pending);
          active();
          if (signal.aborted || !reply || reply.error) throw unavailable();
          return reply.data;
        };
        const ready = metadata.safeParse(
          await call("read_owned_ai_retirement_readiness", {}),
        );
        if (
          !ready.success ||
          !ready.data.schemaReady ||
          !ready.data.exportExecutable ||
          Object.entries(profile.data).some(
            ([key, value]) =>
              ready.data[key as keyof typeof ready.data] !== value,
          )
        )
          throw unavailable();
        const data = OwnedAiRetirementExportSchema.safeParse(
          await call("export_owned_ai_retirement_records", {
            p_user_id: binding.data.ownerId,
          }),
        );
        if (!data.success) throw unavailable();
        const seen = {
          op: new Set<string>(),
          pub: new Set<string>(),
          attempt: new Set<string>(),
          run: new Set<string>(),
        };
        const rows = data.data.retirements.map((r) => {
          if (
            r.owner_id !== binding.data.ownerId ||
            seen.op.has(r.operation_id) ||
            seen.pub.has(r.publication_id) ||
            (r.attempt_id !== null && seen.attempt.has(r.attempt_id)) ||
            (r.run_id !== null && seen.run.has(r.run_id))
          )
            throw unavailable();
          seen.op.add(r.operation_id);
          seen.pub.add(r.publication_id);
          if (r.attempt_id !== null) seen.attempt.add(r.attempt_id);
          if (r.run_id !== null) seen.run.add(r.run_id);
          return Object.freeze({ ...r });
        });
        active();
        if (signal.aborted) throw unavailable();
        const value: ValidatedOwnedAiRetirementExport = Object.freeze({
          [brand]: true as const,
        });
        captures.set(value, {
          ownerId: binding.data.ownerId,
          rows: Object.freeze(rows),
        });
        return value;
      },
    });
  } catch {
    throw unavailable();
  }
}
/** Only a capability issued by the actual reader can reveal this immutable snapshot. */
export function snapshotOwnedAiRetirementExport(
  value: ValidatedOwnedAiRetirementExport,
  ownerId: string,
) {
  const held = captures.get(value);
  if (!held || held.ownerId !== ownerId) throw unavailable();
  return Object.freeze({
    schemaVersion: "owned-ai-retirement-export/1.0.0" as const,
    retirements: held.rows,
  });
}
