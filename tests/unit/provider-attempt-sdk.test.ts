import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import {
  OpenAIQualitativeTransport,
  QualitativeAiFailure,
  runQualitativeAi,
  classifyProviderError,
} from "../../app/lib/server/qualitative-ai";
import {
  createRewriteTransport,
  generateGroundedRewrite,
} from "../../app/lib/server/rewrite-ai";
import { BUILD_AI_POLICY_VERSION } from "../../app/lib/build-assist";
import {
  executeBuildAssist,
  validateBuildAssistRequest,
} from "../../app/lib/server/build-assist";

const CANARY = "synthetic-private-response-canary";
const usage = { inputTokens: 11, outputTokens: 7 };
const config = {
  OPENAI_API_KEY: "synthetic-no-provider-key",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_TIMEOUT_MS: 2_000,
  OPENAI_MODEL: "gpt-6-luna",
  OPENAI_MAX_OUTPUT_TOKENS: 128,
};
type Pipeline = "qualitative" | "rewrite";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function validOutput(pipeline: Pipeline) {
  const writer = { summary: null, bullets: [] };
  if (pipeline === "rewrite") return writer;
  return {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer,
  };
}

type CompletionOptions = {
  content?: string | null;
  refusal?: string | null;
  finishReason?: string;
  usage?: unknown;
};

function completion(pipeline: Pipeline, options: CompletionOptions = {}) {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 0,
      model: config.OPENAI_MODEL,
      choices: [
        {
          index: 0,
          finish_reason: options.finishReason ?? "stop",
          message: {
            role: "assistant",
            refusal: options.refusal ?? null,
            content: Object.hasOwn(options, "content")
              ? options.content
              : JSON.stringify(validOutput(pipeline)),
          },
        },
      ],
      usage: Object.hasOwn(options, "usage")
        ? options.usage
        : { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function invoke(pipeline: Pipeline, timeoutMs = 75, signal?: AbortSignal) {
  const request = {
    resumeText:
      "Projects\nSignal Dashboard\n- Built a Python service dashboard.",
    jobTitle: "Python developer",
    jobDescription: "Maintain Python services.",
    idempotencyKey: "synthetic-sdk-attempt",
    signal,
  };
  if (pipeline === "rewrite")
    return generateGroundedRewrite(
      request,
      createRewriteTransport(config),
      timeoutMs,
    );
  return runQualitativeAi(
    {
      ...request,
      enabled: true,
      remainingTokenBudget: 1_000,
      model: config.OPENAI_MODEL,
      maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
      timeoutMs,
    },
    new OpenAIQualitativeTransport(
      config.OPENAI_API_KEY,
      config.OPENAI_TIMEOUT_MS,
    ),
  );
}

async function captureFailure(result: Promise<unknown>) {
  try {
    await result;
    throw new Error("Expected a safe provider failure");
  } catch (error) {
    expect(error).toBeInstanceOf(QualitativeAiFailure);
    expect(String(error)).not.toContain(CANARY);
    expect(JSON.stringify(error)).not.toContain(CANARY);
    return error;
  }
}

function pendingFetch(pipeline: Pipeline) {
  let wireSignal: AbortSignal | null | undefined;
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetch = vi.fn((_input: unknown, init?: RequestInit) => {
    wireSignal = init?.signal;
    started?.();
    return new Promise<Response>((resolve, reject) => {
      release = () => resolve(completion(pipeline));
      wireSignal?.addEventListener(
        "abort",
        () => reject(new DOMException(CANARY, "AbortError")),
        { once: true },
      );
    });
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, ready, signal: () => wireSignal, release: () => release?.() };
}

it("classifies the installed SDK's actual timeout constructor safely", () => {
  const fetch = vi.fn(() => {
    throw new Error(CANARY);
  });
  vi.stubGlobal("fetch", fetch);
  const failure = classifyProviderError(new OpenAI.APIConnectionTimeoutError());
  expect(failure).toMatchObject({
    code: "AI_TIMEOUT",
    retryable: true,
    usage: null,
  });
  expect(String(failure)).not.toContain(CANARY);
  expect(fetch).not.toHaveBeenCalled();
});

it("classifies a Build timeout from the actual installed SDK without accepting usage", async () => {
  const source =
    "\\documentclass{article}\n\\begin{document}\nSelected sentence.\n\\end{document}\n";
  const prepared = validateBuildAssistRequest({
    source,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    startLine: 3,
    endLine: 3,
    mode: "fix",
    consent: true,
    policyVersion: BUILD_AI_POLICY_VERSION,
  });
  const fetch = vi
    .fn()
    .mockRejectedValue(new DOMException("synthetic", "AbortError"));
  const observed = vi.fn();
  const metrics = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    executeBuildAssist(prepared, {
      apiKey: config.OPENAI_API_KEY,
      baseUrl: config.OPENAI_BASE_URL,
      model: config.OPENAI_MODEL,
      onObservedUsage: observed,
      onUsage: metrics,
    }),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(observed).not.toHaveBeenCalled();
  expect(metrics).not.toHaveBeenCalled();
});

describe.each<Pipeline>(["qualitative", "rewrite"])(
  "installed SDK %s boundary",
  (pipeline) => {
    it("aborts the actual SDK fetch at the wrapper deadline", async () => {
      const wire = pendingFetch(pipeline);
      try {
        const failure = await captureFailure(invoke(pipeline));
        expect(wire.signal()?.aborted).toBe(true);
        expect(failure).toMatchObject({
          code: "AI_TIMEOUT",
          retryable: true,
          usage: null,
        });
        expect(wire.fetch).toHaveBeenCalledTimes(1);
      } finally {
        wire.release();
      }
    });

    it("forwards caller cancellation to the actual SDK fetch", async () => {
      const controller = new AbortController();
      const wire = pendingFetch(pipeline);
      const failure = captureFailure(
        invoke(pipeline, 1_000, controller.signal),
      );
      try {
        await wire.ready;
        controller.abort();
        expect(await failure).toMatchObject({
          code: "AI_CANCELLED",
          retryable: false,
          usage: null,
        });
        expect(wire.signal()?.aborted).toBe(true);
        expect(wire.fetch).toHaveBeenCalledTimes(1);
      } finally {
        wire.release();
      }
    });

    it("does not fetch when the caller is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const fetch = vi.fn(() => {
        throw new Error(CANARY);
      });
      vi.stubGlobal("fetch", fetch);
      const failure = await captureFailure(
        invoke(pipeline, 1_000, controller.signal),
      );
      expect(failure).toMatchObject({
        code: "AI_CANCELLED",
        retryable: false,
        usage: null,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    const rejectedCompletions: Array<{
      name: string;
      options: CompletionOptions;
      code: "AI_OUTPUT_INVALID" | "AI_REFUSED";
      usage: typeof usage | null;
    }> = [
      {
        name: "malformed JSON",
        options: { content: CANARY },
        code: "AI_OUTPUT_INVALID",
        usage,
      },
      {
        name: "invalid schema",
        options: {
          content: JSON.stringify({ ...validOutput(pipeline), extra: CANARY }),
        },
        code: "AI_OUTPUT_INVALID",
        usage,
      },
      {
        name: "refusal",
        options: { content: null, refusal: CANARY },
        code: "AI_REFUSED",
        usage,
      },
      {
        name: "length truncation",
        options: { finishReason: "length" },
        code: "AI_OUTPUT_INVALID",
        usage,
      },
      {
        name: "content filtering",
        options: { finishReason: "content_filter" },
        code: "AI_OUTPUT_INVALID",
        usage,
      },
      {
        name: "invalid output without usage",
        options: { content: CANARY, usage: undefined },
        code: "AI_OUTPUT_INVALID",
        usage: null,
      },
      {
        name: "valid output without usage",
        options: { usage: undefined },
        code: "AI_OUTPUT_INVALID",
        usage: null,
      },
      {
        name: "valid output with invalid usage",
        options: {
          usage: { prompt_tokens: -1, completion_tokens: 7, total_tokens: 6 },
        },
        code: "AI_OUTPUT_INVALID",
        usage: null,
      },
    ];
    it.each(rejectedCompletions)(
      "retains safe metadata on $name",
      async ({ options, code, usage: expectedUsage }) => {
        const fetch = vi.fn().mockResolvedValue(completion(pipeline, options));
        vi.stubGlobal("fetch", fetch);
        const failure = await captureFailure(invoke(pipeline, 1_000));
        expect(failure).toMatchObject({
          code,
          retryable: false,
          usage: expectedUsage,
        });
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );

    it("preserves genuine zero usage on a successful raw completion", async () => {
      const fetch = vi.fn().mockResolvedValue(
        completion(pipeline, {
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(invoke(pipeline, 1_000)).resolves.toMatchObject({
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  },
);
