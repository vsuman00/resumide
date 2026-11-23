import type { createSupabaseAdminClient } from "./supabase";
import { z } from "zod";
import { LegacyScoringInputProfileSchema } from "./legacy-scoring-input";
import { LEGACY_SCORING_INPUT_PROFILE } from "./legacy-scoring-input-profile";
import {
  INITIAL_FEEDBACK_CAPABILITIES,
  validateInitialFeedbackReadiness,
} from "./initial-feedback-operation-contract";
import {
  INITIAL_FEEDBACK_PROFILES,
  OWNED_AI_RETIREMENT_PROFILE,
} from "./initial-feedback-profile";
import { OwnedAiRetirementProfileSchema } from "./owned-ai-retirement-export";
import { OWNED_AI_BUDGET_EXPORT_PROFILE } from "./owned-ai-budget-export-profile";
import { OwnedAiBudgetExportReadinessSchema } from "./owned-ai-budget-export";

import { DOCUMENT_PAGE_COUNT_READINESS_PROFILE } from "./document-page-count-readiness-profile";

const pageCountReadinessSchema = z.strictObject({
  schemaVersion: z.literal("document-page-count-readiness/1.0.0"),
  profileVersion: z.literal("document-page-count-native/1.0.0"),
  checkerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  writerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  metadataSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  schemaReady: z.boolean(),
  writerExecutable: z.boolean(),
  fencedWriterExecutable: z.boolean(),
});

const legacyReadinessSchema = LegacyScoringInputProfileSchema.extend({
  schemaReady: z.boolean(),
  writerExecutable: z.boolean(),
});
const retirementReadinessSchema = OwnedAiRetirementProfileSchema.extend({
  schemaReady: z.boolean(),
  exportExecutable: z.boolean(),
});

const labels = [
  "INVALID_SELECTION",
  "SCHEMA_MISSING",
  "ACCESS_INVALID",
  "PRIVACY_BARRIER_INVALID",
  "AI_BUDGET_POLICY_UNAVAILABLE",
] as const;
const responseSchema = z.strictObject({
  schemaVersion: z.literal("worker-schema-readiness/1.0.0"),
  selected: z.strictObject({ fencing: z.boolean(), aiBudget: z.boolean() }),
  ready: z.boolean(),
  failures: z.array(z.enum(labels)).max(labels.length),
});
type ReadinessCode =
  | "WORKER_SCHEMA_UNAVAILABLE"
  | "WORKER_SCHEMA_INVALID"
  | "WORKER_SCHEMA_CAPABILITY_MISSING"
  | "WORKER_STARTUP_TIMEOUT"
  | "WORKER_STARTUP_CANCELLED";
const messages: Record<ReadinessCode, string> = {
  WORKER_SCHEMA_UNAVAILABLE:
    "Worker startup blocked: verify database connectivity and apply the document-evidence migration 20261011140000 and selected worker capability migrations before processing analyses.",
  WORKER_SCHEMA_INVALID:
    "Worker startup blocked: invalid schema readiness response or configuration.",
  WORKER_SCHEMA_CAPABILITY_MISSING:
    "Worker startup blocked: required database capabilities are unavailable.",
  WORKER_STARTUP_TIMEOUT:
    "Worker startup blocked: database readiness timed out.",
  WORKER_STARTUP_CANCELLED: "Worker startup was cancelled.",
};
export class WorkerReadinessError extends Error {
  readonly failures: readonly (typeof labels)[number][];
  constructor(
    readonly code: ReadinessCode,
    failures: readonly (typeof labels)[number][] = [],
  ) {
    super(messages[code]);
    this.name = "WorkerReadinessError";
    this.failures = Object.freeze([...failures]);
  }
}
export type WorkerReadinessOptions = {
  signal?: AbortSignal;
  analysisFencingEnabled?: boolean;
  initialFeedbackEnabled?: boolean;
  evidenceReviewEnabled?: boolean;
  legacyScoringInputEnabled?: boolean;
  aiEnabled?: boolean;
  aiBudgetEnabled?: boolean;
  aiBudgetPolicyVersion?: string;
  model?: string;
  timeoutMs?: number;
};

export async function assertWorkerSchemaReady(
  client: Pick<ReturnType<typeof createSupabaseAdminClient>, "from"> &
    Partial<Pick<ReturnType<typeof createSupabaseAdminClient>, "rpc">>,
  options: WorkerReadinessOptions = {},
) {
  if (options.signal?.aborted)
    throw new WorkerReadinessError("WORKER_STARTUP_CANCELLED");
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 5_000 ||
    [
      options.analysisFencingEnabled,
      options.initialFeedbackEnabled,
      options.evidenceReviewEnabled,
      options.legacyScoringInputEnabled,
      options.aiEnabled,
      options.aiBudgetEnabled,
    ].some((value) => value !== undefined && typeof value !== "boolean")
  )
    throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
  const fencing = options.analysisFencingEnabled === true;
  const evidenceReview = options.evidenceReviewEnabled === true;
  const initialFeedback = options.initialFeedbackEnabled === true;
  if (
    initialFeedback &&
    (!fencing || options.legacyScoringInputEnabled !== true)
  )
    throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
  const aiBudget =
    options.aiEnabled === true && options.aiBudgetEnabled === true;
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/u;
  if (
    aiBudget &&
    (typeof options.model !== "string" ||
      !identifier.test(options.model) ||
      typeof options.aiBudgetPolicyVersion !== "string" ||
      !identifier.test(options.aiBudgetPolicyVersion))
  )
    throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  let interrupted: WorkerReadinessError | undefined;
  let rejectInterrupted!: (error: WorkerReadinessError) => void;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  const abort = (
    code: "WORKER_STARTUP_TIMEOUT" | "WORKER_STARTUP_CANCELLED",
  ) => {
    if (interrupted) return;
    interrupted = new WorkerReadinessError(code);
    rejectInterrupted(interrupted);
    controller.abort();
  };
  const onAbort = () => abort("WORKER_STARTUP_CANCELLED");
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const timer = setTimeout(() => abort("WORKER_STARTUP_TIMEOUT"), timeoutMs);
  const active = () => {
    if (!controller.signal.aborted && Date.now() >= deadline)
      abort("WORKER_STARTUP_TIMEOUT");
    if (controller.signal.aborted)
      throw interrupted ?? new WorkerReadinessError("WORKER_STARTUP_CANCELLED");
  };
  try {
    const work = async () => {
      // Legacy storage checks remain first; they never claim or mutate a job.
      for (const table of [
        "document_evidence_attempts",
        "evidence_corrections",
      ]) {
        active();
        const { error } = await client
          .from(table)
          .select("id")
          .limit(0)
          .abortSignal(controller.signal);
        active();
        if (error) throw new WorkerReadinessError("WORKER_SCHEMA_UNAVAILABLE");
      }
      if (!fencing && !aiBudget && !initialFeedback && !evidenceReview) return;
      active();
      if (!client.rpc)
        throw new WorkerReadinessError("WORKER_SCHEMA_UNAVAILABLE");
      const readMetadata = async (name: string) => {
        active();
        const reply = await client.rpc!(name, {}).abortSignal(
          controller.signal,
        );
        active();
        if (reply.error)
          throw new WorkerReadinessError("WORKER_SCHEMA_UNAVAILABLE");
        return reply.data;
      };
      if (evidenceReview) {
        const value = pageCountReadinessSchema.safeParse(
          await readMetadata("read_document_page_count_readiness"),
        );
        if (
          !value.success ||
          Object.entries(DOCUMENT_PAGE_COUNT_READINESS_PROFILE).some(
            ([key, expected]) =>
              value.data[key as keyof typeof value.data] !== expected,
          )
        )
          throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
        if (
          !value.data.schemaReady ||
          !value.data.writerExecutable ||
          (fencing && !value.data.fencedWriterExecutable)
        )
          throw new WorkerReadinessError("WORKER_SCHEMA_CAPABILITY_MISSING");
      }
      if (!fencing && !aiBudget && !initialFeedback) return;
      const result = await client
        .rpc("worker_schema_readiness", {
          p_fencing: fencing,
          p_ai_budget: aiBudget,
          p_model: aiBudget ? options.model : null,
          p_policy_version: aiBudget ? options.aiBudgetPolicyVersion : null,
        })
        .abortSignal(controller.signal);
      active();
      if (result.error)
        throw new WorkerReadinessError("WORKER_SCHEMA_UNAVAILABLE");
      const parsed = responseSchema.safeParse(result.data);
      if (
        !parsed.success ||
        parsed.data.selected.fencing !== fencing ||
        parsed.data.selected.aiBudget !== aiBudget ||
        parsed.data.ready !== (parsed.data.failures.length === 0) ||
        new Set(parsed.data.failures).size !== parsed.data.failures.length
      )
        throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
      if (!parsed.data.ready)
        throw new WorkerReadinessError(
          "WORKER_SCHEMA_CAPABILITY_MISSING",
          parsed.data.failures,
        );
      if (!initialFeedback) return;
      const checkExport = (
        raw: unknown,
        schema:
          | typeof retirementReadinessSchema
          | typeof OwnedAiBudgetExportReadinessSchema,
        profile:
          | typeof OWNED_AI_RETIREMENT_PROFILE
          | typeof OWNED_AI_BUDGET_EXPORT_PROFILE,
      ) => {
        const value = schema.safeParse(raw);
        if (
          !value.success ||
          Object.entries(profile).some(
            ([key, expected]) =>
              value.data[key as keyof typeof value.data] !== expected,
          )
        )
          throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
        if (!value.data.schemaReady || !value.data.exportExecutable)
          throw new WorkerReadinessError("WORKER_SCHEMA_CAPABILITY_MISSING");
      };
      // Metadata only: all private reader/writer/export ACLs must be ready before
      // queue construction. These requests share the original deadline and signal.
      await Promise.all([
        (async () => {
          const value = legacyReadinessSchema.safeParse(
            await readMetadata("read_legacy_scoring_readiness"),
          );
          if (
            !value.success ||
            Object.entries(LEGACY_SCORING_INPUT_PROFILE).some(
              ([key, expected]) =>
                value.data[key as keyof typeof value.data] !== expected,
            )
          )
            throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
          if (!value.data.schemaReady || !value.data.writerExecutable)
            throw new WorkerReadinessError("WORKER_SCHEMA_CAPABILITY_MISSING");
        })(),
        (async () => {
          const raw = await readMetadata("read_initial_feedback_readiness");
          try {
            validateInitialFeedbackReadiness(
              raw,
              INITIAL_FEEDBACK_PROFILES,
              INITIAL_FEEDBACK_CAPABILITIES,
            );
          } catch {
            throw new WorkerReadinessError("WORKER_SCHEMA_INVALID");
          }
        })(),
        (async () =>
          checkExport(
            await readMetadata("read_owned_ai_retirement_readiness"),
            retirementReadinessSchema,
            OWNED_AI_RETIREMENT_PROFILE,
          ))(),
        (async () =>
          checkExport(
            await readMetadata("read_owned_ai_budget_export_readiness"),
            OwnedAiBudgetExportReadinessSchema,
            OWNED_AI_BUDGET_EXPORT_PROFILE,
          ))(),
      ]);
      active();
    };
    await Promise.race([work(), cancellation]);
    active();
  } catch (error) {
    active();
    if (error instanceof WorkerReadinessError) throw error;
    throw new WorkerReadinessError("WORKER_SCHEMA_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener("abort", onAbort);
  }
}
