import { hasUncalibratedEvidence } from "./evidence-scoring-guard";
import { createHash, randomUUID } from "node:crypto";
import { getAnalysisConfig } from "./config";
import {
  OpenAIQualitativeTransport,
  QualitativeAiFailure,
  runQualitativeAi,
  type QualitativeAiTransport,
} from "./qualitative-ai";
import type { FeedbackZod } from "./schema";
import { createSupabaseAdminClient } from "./supabase";
import { recordProviderUsage } from "./observability";

import { BASELINE_SEMANTICS } from "./qualitative-prose";
export const PROMPT_VERSION = "qualitative-cited-prose/2.0.0";

export function buildPartialFeedback(args: {
  score: number;
  ruleTrace: Array<{ passed: boolean; detail: string }>;
}): FeedbackZod {
  const unavailable = {
    score: 0,
    tips: Array.from({ length: 3 }, () => ({
      type: "improve" as const,
      tip: "Qualitative feedback is currently unavailable.",
      explanation:
        "Your saved deterministic checks remain available. Writing feedback was not completed.",
    })),
  };
  return {
    scoreSemantics: BASELINE_SEMANTICS,
    overallScore: args.score,
    ATS: {
      score: args.score,
      tips: args.ruleTrace.slice(0, 4).map((rule) => ({
        type: rule.passed ? "good" : "improve",
        tip: rule.detail,
      })),
    },
    toneAndStyle: unavailable,
    content: unavailable,
    structure: unavailable,
    skills: unavailable,
  };
}

export async function processQualitativeStage(
  analysisId: string,
  attempt: number,
  providedTransport?: QualitativeAiTransport,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analyses")
    .select(
      "status, request_id, organization_id, jobs(title, description), analysis_extractions(extracted_text), analysis_deterministic_results(score, rule_trace)",
    )
    .eq("id", analysisId)
    .single();
  if (error || !data) throw new Error("Qualitative input is unavailable.");
  if (data.status !== "qualitative_review") return false;
  if (await hasUncalibratedEvidence(admin, analysisId)) return false;

  const extraction = Array.isArray(data.analysis_extractions)
    ? data.analysis_extractions[0]
    : data.analysis_extractions;
  const deterministic = Array.isArray(data.analysis_deterministic_results)
    ? data.analysis_deterministic_results[0]
    : data.analysis_deterministic_results;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  if (!extraction || !deterministic) {
    throw new Error("Qualitative prerequisites are unavailable.");
  }

  const config = getAnalysisConfig();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: tokensUsed, error: usageError } = await admin.rpc(
    "get_organization_ai_tokens_used",
    {
      p_organization_id: data.organization_id,
      p_since: monthStart.toISOString(),
    },
  );
  if (usageError) throw new Error("AI usage lookup failed.");

  const transport =
    providedTransport ??
    new OpenAIQualitativeTransport(
      config.OPENAI_API_KEY,
      config.OPENAI_TIMEOUT_MS,
      config.OPENAI_BASE_URL,
    );
  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        resumeText: extraction.extracted_text,
        jobTitle: job?.title ?? "",
        jobDescription: job?.description ?? "",
        promptVersion: PROMPT_VERSION,
      }),
    )
    .digest("hex");
  let ai;
  try {
    ai = await runQualitativeAi(
      {
        enabled: config.AI_ENABLED,
        remainingTokenBudget:
          config.AI_MONTHLY_TOKEN_LIMIT - Number(tokensUsed ?? 0),
        model: config.OPENAI_MODEL,
        maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
        timeoutMs: config.OPENAI_TIMEOUT_MS,
        idempotencyKey: `qualitative-${analysisId}-${inputHash}`,
        resumeText: extraction.extracted_text,
        jobTitle: job?.title ?? "",
        jobDescription: job?.description ?? "",
      },
      transport,
    );
  } catch (error) {
    if (!(error instanceof QualitativeAiFailure)) throw error;
    if (error.retryable && attempt < config.QUALITATIVE_MAX_ATTEMPTS) {
      throw error;
    }
    const { data: transitioned, error: transitionError } = await admin.rpc(
      "persist_partial_analysis",
      {
        p_analysis_id: analysisId,
        p_feedback: buildPartialFeedback({
          score: deterministic.score,
          ruleTrace: deterministic.rule_trace,
        }),
        p_process_id: `qualitative-${randomUUID()}`,
        p_request_id: data.request_id || `worker-${randomUUID()}`,
      },
    );
    if (transitionError || transitioned !== true) {
      throw new Error("Partial-result transition failed.");
    }
    return false;
  }

  const atsTips = deterministic.rule_trace
    .slice(0, 4)
    .map((rule: { passed: boolean; detail: string }) => ({
      type: rule.passed ? "good" : "improve",
      tip: rule.detail,
    }));
  const feedback = {
    scoreSemantics: BASELINE_SEMANTICS,
    overallScore: deterministic.score,
    ATS: { score: deterministic.score, tips: atsTips },
    toneAndStyle: ai.output.toneAndStyle,
    content: ai.output.content,
    structure: ai.output.structure,
    skills: ai.output.skills,
  };
  recordProviderUsage({
    provider: "openai",
    model: config.OPENAI_MODEL,
    inputTokens: ai.usage.inputTokens,
    outputTokens: ai.usage.outputTokens,
    inputCostPer1kUsd: config.AI_INPUT_COST_PER_1K_USD,
    outputCostPer1kUsd: config.AI_OUTPUT_COST_PER_1K_USD,
  });
  const processId = `qualitative-${randomUUID()}`;
  const requestId = data.request_id || `worker-${randomUUID()}`;
  const { data: persisted, error: persistError } = await admin.rpc(
    "persist_qualitative_analysis",
    {
      p_analysis_id: analysisId,
      p_feedback: feedback,
      p_input_hash: inputHash,
      p_input_tokens: ai.usage.inputTokens,
      p_model_id: config.OPENAI_MODEL,
      p_output: ai.prose,
      p_output_tokens: ai.usage.outputTokens,
      p_process_id: processId,
      p_prompt_version: PROMPT_VERSION,
      p_provider: "openai",
      p_request_id: requestId,
      p_run_id: randomUUID(),
      p_writer: ai.output.writer,
    },
  );
  if (persistError || persisted !== true) {
    throw new Error("Qualitative result persistence failed.");
  }
  return true;
}
