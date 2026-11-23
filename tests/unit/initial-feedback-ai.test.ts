import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import { ProseGenerationSchema } from "../../app/lib/server/qualitative-prose";
import {
  createInitialFeedbackRawTransport,
  resolveInitialFeedbackGeneration,
  InitialFeedbackAiFailure,
} from "../../app/lib/server/initial-feedback-ai";

const CANARY = "synthetic-private-provider-content";
const source =
  "Projects\n- Built a Python dashboard for internal reporting.\n- Maintained queue services for internal reporting.";
const config = {
  apiKey: "synthetic-no-provider-key",
  model: "gpt-6-luna",
  maxOutputTokens: 512,
  timeoutMs: 1000,
};
const usage = { inputTokens: 11, outputTokens: 7 };
const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
function candidate() {
  return {
    toneAndStyle: { tips: [] },
    content: {
      tips: [
        {
          type: "good",
          tip: "Invented revenue claim",
          explanation: "The dashboard doubled revenue.",
          quote: buildRewriteSources(source)[0].text,
        },
        {
          type: "improve",
          tip: "What outcome can you verify?",
          explanation:
            "Leave this unanswered if the information is unavailable.",
          quote: buildRewriteSources(source)[0].text,
        },
      ],
    },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: {
      summary: "An unassessed summary remains unchanged.",
      bullets: [
        {
          sourceId: 1,
          rewrite: "First raw rewrite",
          reasoning: "First raw reasoning",
        },
        {
          sourceId: 0,
          rewrite: "Second raw rewrite",
          reasoning: "Second raw reasoning",
        },
      ],
    },
  };
}
type Options = {
  content?: string | null;
  refusal?: unknown;
  finish?: string;
  usage?: unknown;
  status?: number;
};
function completion(options: Options = {}) {
  return new Response(
    JSON.stringify({
      id: "fixture-completion",
      object: "chat.completion",
      created: 0,
      model: config.model,
      choices: [
        {
          index: 0,
          finish_reason: options.finish ?? "stop",
          message: {
            role: "assistant",
            refusal: Object.hasOwn(options, "refusal") ? options.refusal : null,
            content: Object.hasOwn(options, "content")
              ? options.content
              : JSON.stringify(candidate()),
          },
        },
      ],
      ...(Object.hasOwn(options, "usage")
        ? options.usage === undefined
          ? {}
          : { usage: options.usage }
        : {
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          }),
    }),
    {
      status: options.status ?? 200,
      headers: { "Content-Type": "application/json", "Retry-After": "0" },
    },
  );
}
function setup(
  options: Options = {},
  extra: {
    timeoutMs?: number;
    now?: () => number;
    observer?: (value: typeof usage | null) => void | Promise<void>;
  } = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => completion(options));
  const observed = vi.fn(extra.observer ?? (() => undefined));
  const transport = createInitialFeedbackRawTransport(
    { ...config, timeoutMs: extra.timeoutMs ?? config.timeoutMs },
    { fetch, now: extra.now },
  );
  const request = {
    originalSource: source,
    jobTitle: "Synthetic developer",
    jobDescription: "Maintain internal services.",
    idempotencyKey: "initial-feedback-fixture-key",
    onObservedUsage: observed,
  };
  return { fetch, observed, transport, request };
}
async function failure(promise: Promise<unknown>) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(InitialFeedbackAiFailure);
  expect(String(error) + JSON.stringify(error)).not.toContain(CANARY);
  expect(error).not.toHaveProperty("cause");
  return error;
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("REAL_NETWORK_FORBIDDEN");
    }),
  ),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("uses the installed SDK once and exposes every unassessed raw row before lossless resolution", async () => {
  const s = setup(),
    capture = await s.transport.execute(s.request);
  expect(Object.keys(capture.raw).sort()).toEqual(
    ["schemaVersion", "output", "refused", "finishReason", "usage"].sort(),
  );
  expect(capture.raw).toEqual({
    schemaVersion: "initial-feedback-raw/1.0.0",
    output: candidate(),
    refused: false,
    finishReason: "stop",
    usage,
  });
  expect(capture.rawResponseSha256).toBe(hash(JSON.stringify(candidate())));
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect(s.fetch.mock.calls[0][0]).toBe(
    "https://api.openai.com/v1/chat/completions",
  );
  const init = s.fetch.mock.calls[0][1];
  expect(init?.redirect).toBe("error");
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: config.model,
    reasoning_effort: "none",
    max_completion_tokens: 512,
    store: false,
    n: 1,
    stream: false,
    response_format: { type: "json_schema" },
  });
  expect(JSON.parse(body.messages[1].content).sources).toEqual(
    buildRewriteSources(source),
  );
  const resolved = resolveInitialFeedbackGeneration(source, capture),
    sources = buildRewriteSources(source);
  expect(resolved.content.tips).toEqual(candidate().content.tips);
  expect(resolved.writer.summary).toBe(candidate().writer.summary);
  expect(resolved.writer.bullets).toEqual(
    candidate().writer.bullets.map((b) => ({
      original: sources[b.sourceId].text,
      rewrite: b.rewrite,
      reasoning: b.reasoning,
    })),
  );
  expect(resolved.writer.bullets.map((b) => b.original)).toEqual([
    sources[1].text,
    sources[0].text,
  ]);
  expect(resolved.content.tips[0].tip).toBe("Invented revenue claim");
});
it.each(["unknown", "duplicate"])(
  "refuses the whole writer on %s source references without filtering the first valid row",
  async (kind) => {
    const raw = candidate();
    raw.writer.bullets[1].sourceId = kind === "unknown" ? 5 : 1;
    const s = setup({ content: JSON.stringify(raw) }),
      capture = await s.transport.execute(s.request);
    expect(() => resolveInitialFeedbackGeneration(source, capture)).toThrow(
      InitialFeedbackAiFailure,
    );
    try {
      resolveInitialFeedbackGeneration(source, capture);
    } catch (error) {
      expect(error).toMatchObject({
        code: "AI_OUTPUT_INVALID",
        usage,
        generationFailure: {
          reason: "source_reference_invalid",
          rawResponseSha256: hash(JSON.stringify(raw)),
        },
      });
    }
    expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  },
);
it("does not invent an original for a source with no actual selectable units", async () => {
  const s = setup(),
    capture = await s.transport.execute(s.request);
  expect(buildRewriteSources("Tiny.")).toEqual([]);
  expect(() => resolveInitialFeedbackGeneration("Tiny.", capture)).toThrow(
    InitialFeedbackAiFailure,
  );
});
it("strictly rejects unknown generation fields after safe usage observation", async () => {
  const raw = { ...candidate(), extra: CANARY },
    s = setup({ content: JSON.stringify(raw) }),
    capture = await s.transport.execute(s.request);
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  const error = await failure(
    Promise.resolve().then(() =>
      resolveInitialFeedbackGeneration(source, capture),
    ),
  );
  expect(error).toMatchObject({
    usage,
    generationFailure: {
      reason: "schema_invalid",
      rawResponseSha256: hash(JSON.stringify(raw)),
    },
  });
});
it.each([
  ["refusal", { refusal: CANARY }, "refused"],
  ["length", { content: '{"unfinished":', finish: "length" }, "truncated"],
  ["malformed", { content: "{" }, "malformed_json"],
  [
    "duplicate escaped key",
    { content: '{"writer":{},"\\u0077riter":{}}' },
    "malformed_json",
  ],
] satisfies Array<[string, Options, string]>)(
  "observes known usage before %s rejection and retains an exact content hash",
  async (_label, options: Options, reason) => {
    const events: string[] = [],
      s = setup(options, {
        observer: () => {
          events.push("usage");
        },
      });
    const error = await failure(
      s.transport.execute(s.request).catch((error) => {
        events.push("failure");
        throw error;
      }),
    );
    expect(events).toEqual(["usage", "failure"]);
    expect(error).toMatchObject({ usage, generationFailure: { reason } });
    const text = Object.hasOwn(options, "content")
      ? options.content
      : JSON.stringify(candidate());
    expect(error).toHaveProperty(
      "generationFailure.rawResponseSha256",
      typeof text === "string" ? hash(text) : null,
    );
  },
);
it("hashes exact received whitespace rather than reconstructed generation JSON", async () => {
  const text = " \n" + JSON.stringify(candidate(), null, 2) + "\n ",
    s = setup({ content: text });
  const capture = await s.transport.execute(s.request);
  expect(capture.rawResponseSha256).toBe(hash(text));
  expect(capture.rawResponseSha256).not.toBe(
    hash(JSON.stringify(capture.raw.output)),
  );
});
it.each(["\ud800", '{"bad":"\\ud800"}'])(
  "rejects malformed Unicode without a reconstructed raw hash %#",
  async (content) => {
    const s = setup({ content }),
      error = await failure(s.transport.execute(s.request));
    expect(error).toMatchObject({
      usage,
      generationFailure: { reason: "malformed_json" },
    });
    expect(error).toHaveProperty(
      "generationFailure.rawResponseSha256",
      content === "\ud800" ? null : hash(content),
    );
  },
);
it("bounds candidate content and preserves usage on oversized output", async () => {
  const content = " ".repeat(65537),
    s = setup({ content }),
    error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({
    usage,
    generationFailure: {
      reason: "malformed_json",
      rawResponseSha256: hash(content),
    },
  });
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it.each([
  undefined,
  { prompt_tokens: -1, completion_tokens: 7 },
  { prompt_tokens: 1.5, completion_tokens: 7 },
  { prompt_tokens: "11", completion_tokens: 7 },
  { prompt_tokens: Number.MAX_SAFE_INTEGER + 1, completion_tokens: 7 },
])(
  "preserves missing or invalid counters as unknown, never fabricated zero %#",
  async (providerUsage) => {
    const s = setup({ usage: providerUsage }),
      capture = await s.transport.execute(s.request);
    expect(capture.raw.usage).toBeNull();
    expect(s.observed).toHaveBeenCalledExactlyOnceWith(null);
    expect(s.fetch).toHaveBeenCalledTimes(1);
  },
);
it("retains genuinely observed zero counters", async () => {
  const s = setup({ usage: { prompt_tokens: 0, completion_tokens: 0 } }),
    capture = await s.transport.execute(s.request);
  expect(capture.raw.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  expect(s.observed).toHaveBeenCalledExactlyOnceWith({
    inputTokens: 0,
    outputTokens: 0,
  });
});
it("awaits the usage observer before exposing raw output", async () => {
  let release: () => void = () => undefined,
    seen: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
      seen = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const s = setup(
    {},
    {
      observer: () => {
        seen();
        return hold;
      },
    },
  );
  let completed = false;
  const result = s.transport.execute(s.request).then((value) => {
    completed = true;
    return value;
  });
  await ready;
  expect(completed).toBe(false);
  release();
  expect((await result).raw.usage).toEqual(usage);
});
it("preserves known counters when the settlement observer throws", async () => {
  const s = setup(
      {},
      {
        observer: () => {
          throw Error(CANARY);
        },
      },
    ),
    error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({
    code: "AI_PROVIDER_UNAVAILABLE",
    usage,
    generationFailure: null,
  });
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect(s.observed).toHaveBeenCalledTimes(1);
});
it("cancels before dispatch with zero SDK fetches", async () => {
  const s = setup(),
    controller = new AbortController();
  controller.abort();
  const error = await failure(
    s.transport.execute({ ...s.request, signal: controller.signal }),
  );
  expect(error).toMatchObject({ code: "AI_CANCELLED", usage: null });
  expect(s.fetch).not.toHaveBeenCalled();
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(null);
});
it("retains known counters when cancellation follows observation", async () => {
  const controller = new AbortController(),
    s = setup({}, { observer: () => controller.abort() }),
    error = await failure(
      s.transport.execute({ ...s.request, signal: controller.signal }),
    );
  expect(error).toMatchObject({ code: "AI_CANCELLED", usage });
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it.each(["fetch", "body", "observer"])(
  "bounds a stalled %s even when cancellation is ignored",
  async (stage) => {
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
      }),
      s = setup(
        {},
        {
          timeoutMs: 25,
          observer:
            stage === "observer"
              ? () => new Promise<void>(() => undefined)
              : undefined,
        },
      );
    s.fetch.mockImplementation(async () => {
      started();
      if (stage === "fetch")
        return await new Promise<Response>(() => undefined);
      if (stage === "body")
        return new Response(
          new ReadableStream({
            start() {},
            cancel: () => new Promise(() => undefined),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      return completion();
    });
    vi.useFakeTimers();
    const pending = s.transport
      .execute(s.request)
      .catch((error: unknown) => error);
    await ready;
    await vi.advanceTimersByTimeAsync(26);
    const error = await pending;
    expect(error).toBeInstanceOf(InitialFeedbackAiFailure);
    expect(error).toMatchObject({
      code: "AI_TIMEOUT",
      usage: stage === "observer" ? usage : null,
    });
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.observed).toHaveBeenCalledTimes(1);
  },
);
it("checks the absolute injected deadline after observation without waiting for timers", async () => {
  let time = 0;
  const s = setup(
      {},
      {
        timeoutMs: 25,
        now: () => time,
        observer: () => {
          time = 26;
        },
      },
    ),
    error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({ code: "AI_TIMEOUT", usage });
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
});
it("refuses redirects with one fetch and no follow", async () => {
  const s = setup();
  s.fetch.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { Location: "https://not-allowed.test" },
    }),
  );
  const error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", usage: null });
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect(s.fetch.mock.calls[0][1]?.redirect).toBe("error");
});
it.each([
  [401, "AI_PROVIDER_AUTH"],
  [403, "AI_PROVIDER_AUTH"],
  [429, "AI_RATE_LIMITED"],
  [500, "AI_PROVIDER_TRANSIENT"],
] as const)(
  "does not retry SDK HTTP %i and preserves observed counters",
  async (status, code) => {
    const s = setup();
    s.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: CANARY },
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
        {
          status,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        },
      ),
    );
    const error = await failure(s.transport.execute(s.request));
    expect(error).toMatchObject({
      code,
      usage,
    });
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  },
);
it.each([
  [401, null, "AI_PROVIDER_AUTH"],
  [503, CANARY, "AI_PROVIDER_TRANSIENT"],
] as const)(
  "preserves upstream HTTP %i when its error body is empty or unstructured",
  async (status, body, code) => {
    const s = setup();
    s.fetch.mockResolvedValueOnce(new Response(body, { status }));
    const error = await failure(s.transport.execute(s.request));
    expect(error).toMatchObject({ code, usage: null, generationFailure: null });
    expect(s.fetch).toHaveBeenCalledOnce();
    expect(s.observed).toHaveBeenCalledExactlyOnceWith(null);
  },
);
it("sanitizes a network error without retrying or losing the unknown observation", async () => {
  const s = setup();
  s.fetch.mockRejectedValueOnce(Error(CANARY));
  const error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", usage: null });
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(null);
});
it("bounds the outer SDK body and does not wait on hostile stream cleanup", async () => {
  const s = setup();
  s.fetch.mockResolvedValueOnce(
    new Response(new Uint8Array(1048577), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  const error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({ code: "AI_OUTPUT_INVALID", usage: null });
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it("refuses an alternate egress endpoint before any SDK request", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  expect(() =>
    createInitialFeedbackRawTransport(
      { ...config, baseUrl: "https://not-allowed.test/v1" },
      { fetch },
    ),
  ).toThrow(InitialFeedbackAiFailure);
  expect(fetch).not.toHaveBeenCalled();
});

it("retains observable counters from complete bounded bytes before an absolute-deadline refusal", async () => {
  let time = 0,
    pulls = 0;
  const text = await completion().text(),
    bytes = new TextEncoder().encode(text),
    s = setup({}, { timeoutMs: 1000, now: () => time });
  s.fetch.mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(bytes);
          else {
            time = 1001;
            controller.close();
          }
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  const error = await failure(s.transport.execute(s.request));
  expect(error).toMatchObject({ code: "AI_TIMEOUT", usage });
  expect(s.observed).toHaveBeenCalledExactlyOnceWith(usage);
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it("rejects malformed surrogate strings supplied directly to the exported resolver", async () => {
  const s = setup(),
    capture = await s.transport.execute(s.request),
    output = candidate();
  output.content.tips[0].tip = "\ud800";
  expect(ProseGenerationSchema.safeParse(output).success).toBe(true);
  const error = await failure(
    Promise.resolve().then(() =>
      resolveInitialFeedbackGeneration(source, {
        ...capture,
        raw: { ...capture.raw, output },
      }),
    ),
  );
  expect(error).toMatchObject({
    usage,
    generationFailure: {
      reason: "schema_invalid",
      rawResponseSha256: capture.rawResponseSha256,
    },
  });
});
it("rejects schema-valid multibyte candidate JSON beyond64KiB in direct resolver calls", async () => {
  const s = setup(),
    capture = await s.transport.execute(s.request),
    tips = Array.from({ length: 4 }, () => ({
      type: "improve",
      tip: "\u0800".repeat(500),
      explanation: "\u0800".repeat(1000),
      quote: "\u0800".repeat(500),
    }));
  const output = {
    ...candidate(),
    toneAndStyle: { tips },
    content: { tips },
    structure: { tips },
    skills: { tips },
  };
  expect(ProseGenerationSchema.safeParse(output).success).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(output), "utf8")).toBeGreaterThan(
    65536,
  );
  const error = await failure(
    Promise.resolve().then(() =>
      resolveInitialFeedbackGeneration(source, {
        ...capture,
        raw: { ...capture.raw, output },
      }),
    ),
  );
  expect(error).toMatchObject({
    usage,
    generationFailure: {
      reason: "schema_invalid",
      rawResponseSha256: capture.rawResponseSha256,
    },
  });
});
