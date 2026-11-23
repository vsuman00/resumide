import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  ProseAnalysisSchema,
  ProseGenerationSchema,
  PROSE_INSTRUCTIONS,
  groundQualitativeProseWithSupport,
  legacyCategoryFromProse,
} from "./qualitative-prose";
import { buildRewriteSources, type RewriteSource } from "./rewrite-sources";
import { resolveWriterProposals } from "./writer-proposals";
import { DEFAULT_OPENAI_BASE_URL } from "./egress-policy";
import { proseModelOptions } from "./openai-model";
import {
  classifyProviderHttpStatus,
  readProviderUsage,
  runProviderAttempt,
  type ProviderUsage,
} from "./provider-attempt";

export type QualitativeAiFailureCode =
  | "AI_DISABLED"
  | "AI_BUDGET_EXHAUSTED"
  | "AI_REFUSED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_AUTH"
  | "AI_PROVIDER_TRANSIENT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_CANCELLED"
  | "AI_OUTPUT_INVALID";

export class QualitativeAiFailure extends Error {
  readonly code: QualitativeAiFailureCode;
  readonly retryable: boolean;
  readonly usage: ProviderUsage | null;
  declare readonly status?: number;

  constructor(
    code: QualitativeAiFailureCode,
    retryable = false,
    usage: ProviderUsage | null = null,
  ) {
    super("Qualitative analysis is unavailable.");
    this.name = "QualitativeAiFailure";
    this.code = code;
    this.retryable = retryable;
    this.usage = readProviderUsage({
      prompt_tokens: usage?.inputTokens,
      completion_tokens: usage?.outputTokens,
    });
  }
}

export interface QualitativeAiTransport {
  execute(request: {
    sources?: RewriteSource[];
    model: string;
    system: string;
    user: string;
    maxOutputTokens: number;
    idempotencyKey: string;
    signal?: AbortSignal;
  }): Promise<{
    output: unknown;
    refused?: boolean;
    usage: ProviderUsage | null;
  }>;
}

export class OpenAIQualitativeTransport implements QualitativeAiTransport {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    timeoutMs: number,
    baseUrl = DEFAULT_OPENAI_BASE_URL,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: timeoutMs,
      maxRetries: 0,
      logLevel: "off",
      fetchOptions: { redirect: "error" },
    });
  }

  async execute(request: {
    sources?: RewriteSource[];
    model: string;
    system: string;
    user: string;
    maxOutputTokens: number;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    if (request.signal?.aborted) throw new QualitativeAiFailure("AI_CANCELLED");
    let usage: ProviderUsage | null = null;
    try {
      const completion = await this.client.chat.completions.create(
        {
          ...proseModelOptions(request.model),
          max_completion_tokens: request.maxOutputTokens,
          store: false,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: zodResponseFormat(
            ProseGenerationSchema,
            "qualitative_analysis",
          ),
        },
        {
          headers: { "Idempotency-Key": request.idempotencyKey },
          signal: request.signal,
        },
      );
      usage = readProviderUsage(completion.usage);
      if (request.signal?.aborted)
        throw new QualitativeAiFailure("AI_CANCELLED", false, usage);
      if (!usage) throw new QualitativeAiFailure("AI_OUTPUT_INVALID");
      const choice = completion.choices[0];
      if (choice?.message?.refusal)
        throw new QualitativeAiFailure("AI_REFUSED", false, usage);
      if (
        choice?.finish_reason !== "stop" ||
        typeof choice.message.content !== "string"
      )
        throw new QualitativeAiFailure("AI_OUTPUT_INVALID", false, usage);
      let raw: unknown;
      try {
        raw = JSON.parse(choice.message.content);
      } catch {
        throw new QualitativeAiFailure("AI_OUTPUT_INVALID", false, usage);
      }
      const parsed = ProseGenerationSchema.safeParse(raw);
      if (!parsed.success)
        throw new QualitativeAiFailure("AI_OUTPUT_INVALID", false, usage);
      return {
        output: {
          ...parsed.data,
          writer: resolveWriterProposals(
            parsed.data.writer,
            request.sources ?? [],
          ),
        },
        refused: false,
        usage,
      };
    } catch (error) {
      if (request.signal?.aborted)
        throw new QualitativeAiFailure("AI_CANCELLED", false, usage);
      const failure = classifyProviderError(error);
      if (failure.usage !== null || usage === null) throw failure;
      throw new QualitativeAiFailure(
        failure.code,
        failure.retryable,
        failure.usage ?? usage,
      );
    }
  }
}

export function classifyProviderError(error: unknown): QualitativeAiFailure {
  if (error instanceof QualitativeAiFailure) return error;
  if (
    typeof OpenAI.APIConnectionTimeoutError === "function" &&
    error instanceof OpenAI.APIConnectionTimeoutError
  )
    return new QualitativeAiFailure("AI_TIMEOUT", true);
  const rawStatus =
    typeof error === "object" && error && "status" in error
      ? error.status
      : undefined;
  const status =
    typeof rawStatus === "number" &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 100 &&
    rawStatus <= 599
      ? rawStatus
      : null;
  const code = classifyProviderHttpStatus(status);
  const failure = new QualitativeAiFailure(
    code,
    code === "AI_RATE_LIMITED" || code === "AI_PROVIDER_TRANSIENT",
  );
  if (status !== null)
    Object.defineProperty(failure, "status", {
      value: status,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  return failure;
}

export async function runQualitativeAi(
  args: {
    enabled: boolean;
    remainingTokenBudget: number;
    model: string;
    maxOutputTokens: number;
    timeoutMs: number;
    idempotencyKey: string;
    resumeText: string;
    jobTitle: string;
    jobDescription: string;
    signal?: AbortSignal;
  },
  transport: QualitativeAiTransport,
) {
  if (!args.enabled) throw new QualitativeAiFailure("AI_DISABLED");
  if (args.remainingTokenBudget < args.maxOutputTokens) {
    throw new QualitativeAiFailure("AI_BUDGET_EXHAUSTED");
  }

  let usage: ProviderUsage | null = null;
  try {
    return await runProviderAttempt({
      timeoutMs: args.timeoutMs,
      signal: args.signal,
      failure: (reason) =>
        new QualitativeAiFailure(
          reason === "timeout" ? "AI_TIMEOUT" : "AI_CANCELLED",
          reason === "timeout",
          usage,
        ),
      execute: async (signal) => {
        const response = await transport.execute({
          model: args.model,
          system: PROSE_INSTRUCTIONS,
          sources: buildRewriteSources(args.resumeText),
          user: JSON.stringify({
            resumeText: args.resumeText,
            sources: buildRewriteSources(args.resumeText),
            jobTitle: args.jobTitle,
            jobDescription: args.jobDescription,
          }),
          maxOutputTokens: args.maxOutputTokens,
          idempotencyKey: args.idempotencyKey,
          signal,
        });
        usage = readProviderUsage({
          prompt_tokens: response.usage?.inputTokens,
          completion_tokens: response.usage?.outputTokens,
        });
        if (signal.aborted)
          throw new QualitativeAiFailure("AI_CANCELLED", false, usage);
        if (!usage) throw new QualitativeAiFailure("AI_OUTPUT_INVALID");
        if (response.refused)
          throw new QualitativeAiFailure("AI_REFUSED", false, usage);
        const parsed = ProseAnalysisSchema.safeParse(response.output);
        if (!parsed.success)
          throw new QualitativeAiFailure("AI_OUTPUT_INVALID", false, usage);
        const { prose, support } = groundQualitativeProseWithSupport(
          parsed.data,
          args.resumeText,
        );
        return {
          prose,
          support,
          output: {
            toneAndStyle: legacyCategoryFromProse(prose.toneAndStyle),
            content: legacyCategoryFromProse(prose.content),
            structure: legacyCategoryFromProse(prose.structure),
            skills: legacyCategoryFromProse(prose.skills),
            writer: prose.writer,
          },
          usage,
        };
      },
    });
  } catch (error) {
    const failure = classifyProviderError(error);
    if (failure.usage !== null || usage === null) throw failure;
    throw new QualitativeAiFailure(
      failure.code,
      failure.retryable,
      failure.usage ?? usage,
    );
  }
}
