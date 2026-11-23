import { createHash, randomUUID } from "node:crypto";
import { getAnalysisConfig } from "./config";
import { createSupabaseAdminClient } from "./supabase";
import { createInitialFeedbackPublicationPolicy } from "./initial-feedback-publication-policy";
import { INITIAL_FEEDBACK_PROFILES } from "./initial-feedback-profile";
import { createInitialFeedbackRawTransport } from "./initial-feedback-ai";
import { runInitialFeedbackService } from "./initial-feedback-service";
import { AI_CONSENT_POLICY_VERSION } from "./privacy";
import {
  AnalysisStageFenceError,
  assertAnalysisStageActive,
  type AnalysisStageOptions,
} from "./analysis-stage-fence";

export class InitialFeedbackPendingError extends Error {
  readonly code = "INITIAL_FEEDBACK_PENDING";
  constructor() {
    super("Initial feedback is pending durable completion.");
    this.name = "InitialFeedbackPendingError";
  }
}

/** Opt-in worker adapter; Native prepare/claim/finish own lease and input checks. */
export async function processInitialFeedbackStage(
  analysisId: string,
  attempt: number,
  options: AnalysisStageOptions = {},
): Promise<boolean> {
  assertAnalysisStageActive(options);
  if (!options.lease)
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_REQUIRED");
  if (options.lease.attempt !== attempt)
    throw new AnalysisStageFenceError("ANALYSIS_LEASE_LOST");
  const config = getAnalysisConfig();
  if (
    config.INITIAL_FEEDBACK_ENABLED !== true ||
    config.LEGACY_SCORING_INPUT_ENABLED !== true ||
    config.ANALYSIS_FENCING_ENABLED !== true
  )
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  const policy = createInitialFeedbackPublicationPolicy({
    model: config.OPENAI_MODEL,
    maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
    attemptLimit: config.QUALITATIVE_MAX_ATTEMPTS,
    budgetPolicyVersion: config.AI_BUDGET_ENABLED
      ? config.AI_BUDGET_POLICY_VERSION
      : null,
  });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analyses")
    .select("owner_id, organization_id, request_id")
    .eq("id", analysisId)
    .single();
  assertAnalysisStageActive(options);
  if (error || !data) throw new Error("Initial feedback scope is unavailable.");
  const result = await runInitialFeedbackService(admin, {
    scope: {
      analysisId,
      ownerId: data.owner_id,
      organizationId: data.organization_id,
      lease: options.lease,
      policy,
    },
    expectedProfile: INITIAL_FEEDBACK_PROFILES,
    aiEnabled: config.AI_ENABLED,
    tokenLimit: String(config.AI_MONTHLY_TOKEN_LIMIT),
    signal: options.signal,
    audit: {
      processId: `initial-feedback-${randomUUID()}`,
      requestId: data.request_id || `worker-${randomUUID()}`,
    },
    authorize: async () => {
      assertAnalysisStageActive(options);
      const { data: consent, error: consentError } = await admin
        .from("consents")
        .select("id")
        .eq("user_id", data.owner_id)
        .eq("organization_id", data.organization_id)
        .eq("purpose", "qualitative_ai")
        .eq("policy_version", AI_CONSENT_POLICY_VERSION)
        .limit(1)
        .maybeSingle();
      assertAnalysisStageActive(options);
      if (consentError || !consent)
        throw new Error("Initial feedback authorization is unavailable.");
      for (const [key, limit, seconds] of [
        [
          `initial-feedback:${createHash("sha256").update(analysisId).digest("hex")}`,
          1,
          Math.ceil(config.OPENAI_TIMEOUT_MS / 1000) + 60,
        ],
        [
          `initial-feedback-user:${createHash("sha256").update(data.owner_id).digest("hex")}`,
          3,
          300,
        ],
      ] as const) {
        const allowed = await admin.rpc("consume_analysis_rate_limit", {
          p_key: key,
          p_limit: limit,
          p_window_seconds: seconds,
        });
        assertAnalysisStageActive(options);
        if (allowed.error || allowed.data !== true)
          throw new Error("Initial feedback authorization is unavailable.");
      }
    },
    // The service validates the captured Native policy against this exact
    // descriptor before constructing a transport. DB selection remains authority.
    createTransport: () =>
      createInitialFeedbackRawTransport({
        apiKey: config.OPENAI_API_KEY,
        model: policy.model,
        maxOutputTokens: policy.maxOutputTokens,
        timeoutMs: config.OPENAI_TIMEOUT_MS,
        baseUrl: config.OPENAI_BASE_URL,
      }),
  });
  assertAnalysisStageActive(options);
  if (result.kind !== "published") throw new InitialFeedbackPendingError();
  return true;
}
