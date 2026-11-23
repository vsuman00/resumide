import { z } from "zod";
import { runProviderAttempt } from "./provider-attempt";
import {
  assertAiBudgetSourceJson,
  type AiBudgetSourceRpcClient,
} from "./ai-budget-source";
const id = z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const stamp = z.iso
  .datetime()
  .regex(/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u);
const counter = z
  .string()
  .max(10)
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= 2147483647n);
const duration = 720n * 60n * 60n * 1000000n;
export const OwnedLegacyAiUsageProfileSchema = z.strictObject({
  schemaVersion: z.literal("owned-legacy-ai-usage-readiness/1.0.0"),
  profileVersion: z.literal("owned-legacy-ai-usage-profile/1.0.0"),
  checkerSha256: sha,
  captureSha256: sha,
  exportSha256: sha,
  metadataSha256: sha,
});
export type OwnedLegacyAiUsageProfile = z.infer<
  typeof OwnedLegacyAiUsageProfileSchema
>;
export const OwnedLegacyAiUsageReadinessSchema =
  OwnedLegacyAiUsageProfileSchema.extend({
    schemaReady: z.boolean(),
    exportExecutable: z.boolean(),
  });
const row = z.strictObject({
  runId: id,
  ownerId: id,
  organizationId: id,
  analysisId: id,
  resumeId: id,
  resumeVersionId: id,
  runCreatedAt: stamp,
  originalMonth: z.string().regex(/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])-01$/u),
  inputTokens: counter,
  outputTokens: counter,
  classification: z.enum(["legacy_unlinked", "a12_linked", "a13_linked"]),
  firstCause: z.enum(["account_preparation", "resume_retirement"]),
  deletionRequestId: id.nullable(),
  retentionItemId: id.nullable(),
  preparedAt: stamp,
  expiresAt: stamp,
  effectiveExpiresAt: stamp,
});
const envelope = z.strictObject({
  schemaVersion: z.literal("owned-legacy-ai-usage-export/1.0.0"),
  ownerId: id,
  records: z.array(row).max(4096),
});
export type OwnedLegacyAiUsageExport = z.infer<typeof envelope>;
export class OwnedLegacyAiUsageExportError extends Error {
  readonly code = "unavailable";
  constructor() {
    super("Owned legacy AI usage export is unavailable.");
    this.name = "OwnedLegacyAiUsageExportError";
  }
}
const unavailable = () => new OwnedLegacyAiUsageExportError();
/** Preserve microseconds; paired account disposition stamps may have zero to six fractional digits. */
export function ownedLegacyAiUsageMicros(value: string): bigint {
  const match =
    /^(?!0000)(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/u.exec(value);
  if (!match) throw unavailable();
  const ms = Date.parse(match[1] + "Z");
  if (
    !Number.isSafeInteger(ms) ||
    new Date(ms).toISOString() !== match[1] + ".000Z"
  )
    throw unavailable();
  return BigInt(ms) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}
export function validateOwnedLegacyAiUsageExport(
  raw: unknown,
  ownerId: string,
): OwnedLegacyAiUsageExport {
  try {
    id.parse(ownerId);
    assertAiBudgetSourceJson(raw);
    const value = envelope.parse(raw),
      seen = new Set<string>();
    if (value.ownerId !== ownerId) throw unavailable();
    for (const item of value.records) {
      const prepared = ownedLegacyAiUsageMicros(item.preparedAt),
        expires = ownedLegacyAiUsageMicros(item.expiresAt),
        effective = ownedLegacyAiUsageMicros(item.effectiveExpiresAt);
      ownedLegacyAiUsageMicros(item.runCreatedAt);
      if (
        item.ownerId !== ownerId ||
        seen.has(item.runId) ||
        item.originalMonth !== item.runCreatedAt.slice(0, 7) + "-01" ||
        expires - prepared !== duration ||
        effective > expires ||
        (item.firstCause === "account_preparation"
          ? item.deletionRequestId === null || item.retentionItemId !== null
          : item.deletionRequestId !== null || item.retentionItemId === null)
      )
        throw unavailable();
      seen.add(item.runId);
    }
    return value;
  } catch {
    throw unavailable();
  }
}
export async function readOwnedLegacyAiUsageExport(
  client: AiBudgetSourceRpcClient,
  ownerId: string,
  rawProfile: OwnedLegacyAiUsageProfile,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OwnedLegacyAiUsageExport> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  try {
    id.parse(ownerId);
    const profile = OwnedLegacyAiUsageProfileSchema.parse(rawProfile),
      timeoutMs = options.timeoutMs ?? 5000;
    if (
      !client ||
      typeof client.rpc !== "function" ||
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
        const raw = await call("read_owned_legacy_ai_usage_readiness", {});
        assertAiBudgetSourceJson(raw);
        const ready = OwnedLegacyAiUsageReadinessSchema.parse(raw);
        if (
          !ready.schemaReady ||
          !ready.exportExecutable ||
          Object.entries(profile).some(
            ([key, value]) => ready[key as keyof typeof ready] !== value,
          )
        )
          throw unavailable();
        const value = validateOwnedLegacyAiUsageExport(
          await call("export_owned_legacy_ai_usage_records", {
            p_user_id: ownerId,
          }),
          ownerId,
        );
        active();
        return value;
      },
    });
  } catch {
    throw unavailable();
  } finally {
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
