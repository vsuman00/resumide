import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRewriteTransport,
  generateGroundedRewrite,
  type RewriteTransport,
} from "../../app/lib/server/rewrite-ai";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import { resolveWriterProposals } from "../../app/lib/server/writer-proposals";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const source =
  "Experience\n– Built React services with PostgreSQL;\nreduced latency by 20%.\nProjects\n– Maintained Python tools for reporting.";
const request = {
  resumeText: source,
  jobTitle: "Engineer",
  jobDescription: "React, PostgreSQL, AWS and Kubernetes",
  idempotencyKey: "synthetic-rewrite",
};
const output = {
  summary: null,
  bullets: [
    {
      sourceId: 0,
      rewrite:
        "Developed React services with PostgreSQL; reduced latency by 20%.",
      reasoning: "Clarifies the existing contribution and measured result.",
    },
  ],
};
const transport = (value: unknown = output): RewriteTransport => ({
  execute: vi.fn().mockResolvedValue({
    output: value,
    usage: { inputTokens: 100, outputTokens: 200 },
  }),
});
it("binds model source IDs to exact wrapped source and retains useful factual wording", async () => {
  const result = await generateGroundedRewrite(request, transport(), 100);
  expect(result.writer.bullets).toHaveLength(1);
  expect(result.writer.bullets[0].original).toBe(
    "– Built React services with PostgreSQL;\nreduced latency by 20%.",
  );
  expect(source.includes(result.writer.bullets[0].original)).toBe(true);
  expect(result.usage.outputTokens).toBe(200);
});
it("does not combine a following heading or unrelated contribution", () => {
  const sources = buildRewriteSources(source);
  expect(sources).toHaveLength(2);
  expect(sources[0].text).not.toContain("Projects");
  expect(sources[1].text).not.toContain("React");
});
it("rejects invented metrics and skills from the JD", async () => {
  const result = await generateGroundedRewrite(
    request,
    transport({
      ...output,
      bullets: [
        {
          ...output.bullets[0],
          rewrite:
            "Built React services with AWS and Kubernetes; reduced latency by 99%.",
        },
      ],
    }),
    100,
  );
  expect(result.writer.bullets).toEqual([]);
});
it("rejects invented source IDs, duplicate references and numeric score fields", async () => {
  expect(
    resolveWriterProposals(
      {
        ...output,
        bullets: [
          output.bullets[0],
          output.bullets[0],
          { ...output.bullets[0], sourceId: 31 },
        ],
      },
      buildRewriteSources(source),
    ).bullets,
  ).toHaveLength(1);
  await expect(
    generateGroundedRewrite(request, transport({ ...output, score: 100 }), 100),
  ).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
});
it("handles missing source, provider refusal and a bounded timeout", async () => {
  expect(buildRewriteSources("")).toEqual([]);
  const refusal = transport();
  vi.mocked(refusal.execute).mockResolvedValue({
    output,
    refused: true,
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  await expect(
    generateGroundedRewrite(request, refusal, 100),
  ).rejects.toMatchObject({ code: "AI_REFUSED" });
  const hanging = transport();
  vi.mocked(hanging.execute).mockImplementation(
    () => new Promise(() => undefined),
  );
  await expect(
    generateGroundedRewrite(request, hanging, 5),
  ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
});

const sdkConfig = {
  OPENAI_API_KEY: "synthetic-no-provider-key",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_TIMEOUT_MS: 1000,
  OPENAI_MODEL: "gpt-6-luna",
  OPENAI_MAX_OUTPUT_TOKENS: 128,
};
const sdkRequest = {
  resumeText: "Built synthetic services.",
  jobTitle: "Synthetic engineer",
  jobDescription: "Maintain synthetic services.",
  idempotencyKey: "synthetic-rewrite-sdk",
};
function sdkCompletion() {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 0,
      model: sdkConfig.OPENAI_MODEL,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            refusal: null,
            content: JSON.stringify({ summary: null, bullets: [] }),
          },
        },
      ],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
describe("installed rewrite SDK dispatch controls", () => {
  it("passes redirect rejection while preserving the model, schema, tokens and idempotency", async () => {
    const fetch = vi.fn(async () => sdkCompletion());
    vi.stubGlobal("fetch", fetch);
    const result = await createRewriteTransport(sdkConfig).execute(sdkRequest);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      sdkRequest.idempotencyKey,
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: sdkConfig.OPENAI_MODEL,
      reasoning_effort: "none",
      store: false,
      max_completion_tokens: 128,
      response_format: {
        type: "json_schema",
        json_schema: { name: "resume_rewrite" },
      },
    });
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(result.output).toEqual({ summary: null, bullets: [] });
  });
  it.each([
    [401, "AI_PROVIDER_AUTH", false],
    [403, "AI_PROVIDER_AUTH", false],
    [429, "AI_RATE_LIMITED", true],
    [503, "AI_PROVIDER_TRANSIENT", true],
  ] as const)(
    "classifies synthetic HTTP %i with one SDK dispatch",
    async (status, code, retryable) => {
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "Synthetic provider failure",
                type: "synthetic",
              },
            }),
            {
              status,
              headers: {
                "content-type": "application/json",
                "x-should-retry": "true",
                "retry-after-ms": "0",
              },
            },
          ),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(
        createRewriteTransport(sdkConfig).execute(sdkRequest),
      ).rejects.toMatchObject({
        code,
        retryable,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("disables installed SDK logging even when ambient logging is debug", async () => {
    vi.stubEnv("OPENAI_LOG", "debug");
    const logs = [
      vi.spyOn(console, "debug"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "log"),
    ];
    for (const log of logs) log.mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sdkCompletion()),
    );
    await createRewriteTransport(sdkConfig).execute(sdkRequest);
    expect(logs.reduce((count, log) => count + log.mock.calls.length, 0)).toBe(
      0,
    );
  });
  it("fails closed at the real SDK fetch boundary for a synthetic redirect", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.redirect === "error")
        throw new TypeError("Synthetic redirect rejected");
      return sdkCompletion();
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      createRewriteTransport(sdkConfig).execute(sdkRequest),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("provider attempt cancellation contract", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  const call = (client: RewriteTransport, signal?: AbortSignal) =>
    generateGroundedRewrite({ ...request, signal }, client, 50);
  it("does not dispatch an already aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = transport();
    await expect(call(client, controller.signal)).rejects.toMatchObject({
      code: "AI_CANCELLED",
      retryable: false,
    });
    expect(client.execute).not.toHaveBeenCalled();
  });
  it("aborts the actual in-flight transport when its deadline expires", async () => {
    vi.useFakeTimers();
    let dispatchedSignal: AbortSignal | undefined;
    const execute = vi
      .fn<RewriteTransport["execute"]>()
      .mockImplementation((sent) => {
        dispatchedSignal = sent.signal;
        return new Promise(() => undefined);
      });
    const pending = call({ execute }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({
      code: "AI_TIMEOUT",
      retryable: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(dispatchedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels an in-flight caller immediately rather than waiting for its deadline", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const execute = vi
      .fn<RewriteTransport["execute"]>()
      .mockImplementation((sent) => {
        signal = sent.signal;
        return new Promise(() => undefined);
      });
    let immediate: unknown;
    const pending = call({ execute }, controller.signal).catch(
      (error: unknown) => {
        immediate = error;
        return error;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    const atCancellation = immediate;
    await vi.advanceTimersByTimeAsync(51);
    expect(atCancellation).toMatchObject({
      code: "AI_CANCELLED",
      retryable: false,
    });
    expect(await pending).toBe(atCancellation);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("never accepts a valid transport result that arrives after the deadline", async () => {
    vi.useFakeTimers();
    let complete:
      | ((value: Awaited<ReturnType<RewriteTransport["execute"]>>) => void)
      | undefined;
    const execute = vi.fn<RewriteTransport["execute"]>().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = call({ execute }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(51);
    const failure = await pending;
    expect(failure).toMatchObject({ code: "AI_TIMEOUT" });
    expect(complete).toBeTypeOf("function");
    complete?.({ output, usage: { inputTokens: 3, outputTokens: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans its timer and caller subscription after a successful attempt", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const client = transport();
    expect((await call(client, controller.signal)).usage).toEqual({
      inputTokens: 100,
      outputTokens: 200,
    });
    const linked = vi.mocked(client.execute).mock.calls[0][0].signal;
    expect(linked).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    const laterAbort = vi.fn();
    linked?.addEventListener("abort", laterAbort);
    controller.abort();
    expect(laterAbort).not.toHaveBeenCalled();
  });
  it.each([
    { inputTokens: 0, outputTokens: 0 },
    { inputTokens: 11, outputTokens: 7 },
  ])(
    "retains known safe integer usage including known zero %j",
    async (usage) => {
      const client = { execute: vi.fn().mockResolvedValue({ output, usage }) };
      expect((await call(client)).usage).toEqual(usage);
    },
  );
  it.each([
    { label: "missing", usage: undefined },
    { label: "null", usage: null },
    { label: "negative", usage: { inputTokens: -1, outputTokens: 2 } },
    { label: "fractional", usage: { inputTokens: 1, outputTokens: 0.5 } },
  ])("fails safely without fabricating $label usage", async ({ usage }) => {
    const client = { execute: vi.fn().mockResolvedValue({ output, usage }) };
    await expect(call(client)).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      usage: null,
    });
  });
  it.each([
    {
      label: "refusal",
      response: { output, refused: true },
      code: "AI_REFUSED",
    },
    {
      label: "invalid schema",
      response: { output: { invalid: true } },
      code: "AI_OUTPUT_INVALID",
    },
  ])(
    "preserves known usage when output ends in $label",
    async ({ response, code }) => {
      const usage = { inputTokens: 9, outputTokens: 4 };
      const client = {
        execute: vi.fn().mockResolvedValue({ ...response, usage }),
      };
      await expect(call(client)).rejects.toMatchObject({ code, usage });
    },
  );
});
