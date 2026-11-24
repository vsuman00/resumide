import { createHash } from "node:crypto";
import { APIError } from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }));
vi.mock("openai", async (original) => {
  const actual = await original<typeof import("openai")>();
  return {
    ...actual,
    default: class {
      static APIConnectionTimeoutError =
        actual.default.APIConnectionTimeoutError;
      chat = { completions: { create: mocks.create } };
      constructor(options: unknown) {
        mocks.options(options);
      }
    },
  };
});
import { BUILD_AI_POLICY_VERSION } from "../../app/lib/build-assist";
import {
  executeBuildAssist,
  validateBuildAssistRequest,
} from "../../app/lib/server/build-assist";
const source = [
  "\\documentclass{article}",
  "\\begin{document}",
  "% FAR_BEFORE_CANARY",
  "Nearby A",
  "Nearby B",
  "Selected sentence.",
  "Nearby C",
  "Nearby D",
  "% FAR_AFTER_CANARY",
  "\\end{document}",
].join("\n");
const prepared = () =>
  validateBuildAssistRequest({
    source,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    startLine: 6,
    endLine: 6,
    mode: "rewrite",
    consent: true,
    policyVersion: BUILD_AI_POLICY_VERSION,
  });
const options = {
  apiKey: "unit-only-not-a-key",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-6-luna",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            operation: "replace",
            replacement: "\\textbf{Selected sentence.}",
            explanation: "Adjusts formatting.",
            questions: [],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  });
});
describe("Build provider transport with SDK mocked, no network", () => {
  it("withholds the prior unrelated wording fixture as bounded advice", async () => {
    const value = await mocks.create();
    mocks.create.mockClear();
    value.choices[0].message.content = JSON.stringify({
      operation: "replace",
      replacement: "Improved sentence.",
      explanation: "Clearer wording.",
      questions: [],
    });
    mocks.create.mockResolvedValue(value);
    const result = await executeBuildAssist(prepared(), options);
    expect(result.response.suggestion).toMatchObject({
      operation: "advice",
      replacement: null,
    });
    expect(JSON.stringify(result.response.suggestion)).not.toMatch(
      /Improved sentence|Clearer wording/,
    );
  });
  it.each(["success", "refusal", "malformed"])(
    "records bounded usage once for %s",
    async (kind) => {
      const value = await mocks.create();
      mocks.create.mockClear();
      if (kind === "refusal")
        value.choices[0].message.refusal = "Synthetic refusal";
      if (kind === "malformed") value.choices[0].message.content = "{not-json";
      mocks.create.mockResolvedValue(value);
      const onUsage = vi.fn();
      const pending = executeBuildAssist(prepared(), { ...options, onUsage });
      if (kind === "success") await pending;
      else
        await expect(pending).rejects.toMatchObject({
          code: kind === "refusal" ? "provider_refused" : "output_invalid",
        });
      expect(onUsage).toHaveBeenCalledExactlyOnceWith({
        inputTokens: 20,
        outputTokens: 10,
      });
    },
  );
  it("does not fabricate usage when absent or account invalid reported counts", async () => {
    const value = await mocks.create();
    mocks.create.mockClear();
    delete value.usage;
    mocks.create.mockResolvedValue(value);
    const onUsage = vi.fn();
    expect(
      (await executeBuildAssist(prepared(), { ...options, onUsage })).usage,
    ).toBeNull();
    expect(onUsage).not.toHaveBeenCalled();
    value.usage = { prompt_tokens: -1, completion_tokens: 1 };
    mocks.create.mockResolvedValue(value);
    await expect(
      executeBuildAssist(prepared(), { ...options, onUsage }),
    ).rejects.toMatchObject({ code: "output_invalid" });
    expect(onUsage).not.toHaveBeenCalled();
  });
  it("sends only selected context under bounded no-store/no-retry/no-redirect options", async () => {
    const result = await executeBuildAssist(prepared(), options);
    expect(result.response.suggestion.operation).toBe("replace");
    expect(result.response.suggestion.replacement).toBe(
      "\\textbf{Selected sentence.}",
    );
    expect(mocks.options).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        timeout: 10000,
        logLevel: "off",
        fetchOptions: { redirect: "error" },
        baseURL: options.baseUrl,
      }),
    );
    const [body] = mocks.create.mock.calls[0];
    expect(body.model).toBe(options.model);
    expect(body.max_completion_tokens).toBe(768);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toMatch(/untrusted document data/);
    expect(body.messages[0].content).toMatch(/without inventing/);
    const sent = JSON.parse(body.messages[1].content);
    expect(sent).toEqual({
      mode: "rewrite",
      selectedText: "Selected sentence.",
      beforeContext: "Nearby A\nNearby B",
      afterContext: "Nearby C\nNearby D",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /FAR_BEFORE_CANARY|FAR_AFTER_CANARY|sourceHash|organization_id|user_id/,
    );
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });
  it("revalidates prepared source/hash before any SDK construction", async () => {
    await expect(
      executeBuildAssist(
        { ...prepared(), sourceHash: "0".repeat(64) },
        options,
      ),
    ).rejects.toMatchObject({ code: "stale_source" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it.each([
    "https://foreign.test/v1",
    "http://api.openai.com/v1",
    "https://api.openai.com/v1?secret=yes",
  ])("refuses custom egress %s", async (baseUrl) => {
    await expect(
      executeBuildAssist(prepared(), { ...options, baseUrl }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([
    [
      { choices: [{ finish_reason: "stop", message: { refusal: "Refused" } }] },
      "provider_refused",
    ],
    [
      { choices: [{ finish_reason: "content_filter", message: {} }] },
      "provider_refused",
    ],
    [
      {
        choices: [
          {
            finish_reason: "length",
            message: {
              content:
                '{"operation":"no_change","replacement":null,"explanation":"No edit.","questions":[]}',
            },
          },
        ],
      },
      "output_invalid",
    ],
    [
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              parsed: {
                operation: "replace",
                replacement: "unsafe",
                extra: true,
              },
            },
          },
        ],
      },
      "output_invalid",
    ],
  ])(
    "withholds refused, incomplete or malformed output",
    async (value, code) => {
      mocks.create.mockResolvedValue(value);
      await expect(
        executeBuildAssist(prepared(), options),
      ).rejects.toMatchObject({ code });
    },
  );
  it.each([
    { prompt_tokens: -1, completion_tokens: 1 },
    { prompt_tokens: 1, completion_tokens: 769 },
    { prompt_tokens: 1.5, completion_tokens: 1 },
  ])("rejects invalid usage counters %j", async (usage) => {
    const value = await mocks.create();
    value.usage = usage;
    mocks.create.mockResolvedValue(value);
    await expect(executeBuildAssist(prepared(), options)).rejects.toMatchObject(
      { code: "output_invalid" },
    );
  });
  it("propagates abort signals and does not apply a late result after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeBuildAssist(prepared(), { ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(mocks.create).not.toHaveBeenCalled();
    const running = new AbortController();
    mocks.create.mockImplementation(async () => {
      running.abort();
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                operation: "no_change",
                replacement: null,
                explanation: "No edit.",
                questions: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
    });
    await expect(
      executeBuildAssist(prepared(), { ...options, signal: running.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
  it("redacts arbitrary provider errors and does not retry", async () => {
    mocks.create.mockRejectedValue(Error("PRIVATE-PROVIDER-BODY secret"));
    await expect(executeBuildAssist(prepared(), options)).rejects.toMatchObject(
      {
        code: "provider_unavailable",
        message: "AI suggestions are unavailable. No edit was applied.",
      },
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, "provider_auth"],
    [403, "provider_auth"],
    [429, "provider_transient"],
    [503, "provider_transient"],
  ] as const)(
    "classifies upstream HTTP %s without exposing its body",
    async (status, code) => {
      mocks.create.mockRejectedValue(
        APIError.generate(
          status,
          { error: { message: "PRIVATE-PROVIDER-BODY" } },
          undefined,
          new Headers(),
        ),
      );
      const error = await executeBuildAssist(prepared(), options).catch(
        (failure: unknown) => failure,
      );
      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain("PRIVATE-PROVIDER-BODY");
      expect(mocks.create).toHaveBeenCalledTimes(1);
    },
  );
});

describe("Fix with AI from a compile error (BX-12)", () => {
  const fixRequest = (diagnostic: unknown, mode = "fix") => ({
    source,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    startLine: 4,
    endLine: 8,
    mode,
    consent: true,
    policyVersion: BUILD_AI_POLICY_VERSION,
    diagnostic,
  });
  it.each([
    [
      "a line outside the selection",
      { kind: "undefined_command", line: 9 },
      "fix",
    ],
    ["an unknown kind", { kind: "log_excerpt", line: 6 }, "fix"],
    ["extra keys", { kind: "other", line: 6, text: "! Undefined" }, "fix"],
    ["a non-fix mode", { kind: "other", line: 6 }, "rewrite"],
  ])("rejects %s as invalid_request", (_, diagnostic, mode) => {
    expect(() =>
      validateBuildAssistRequest(fixRequest(diagnostic, mode)),
    ).toThrow(expect.objectContaining({ code: "invalid_request" }));
  });
  it("sends only the kind and the line relative to the selection", async () => {
    const prepared = validateBuildAssistRequest(
      fixRequest({ kind: "undefined_command", line: 6 }),
    );
    await executeBuildAssist(prepared, options).catch(() => undefined);
    const payload = JSON.parse(
      mocks.create.mock.calls[0][0].messages[1].content,
    );
    expect(payload.compileError).toEqual({
      kind: "undefined_command",
      line: 3,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "afterContext",
      "beforeContext",
      "compileError",
      "mode",
      "selectedText",
    ]);
  });
  it("keeps the legacy payload unchanged without a diagnostic", async () => {
    await executeBuildAssist(prepared(), options).catch(() => undefined);
    const payload = JSON.parse(
      mocks.create.mock.calls[0][0].messages[1].content,
    );
    expect(payload.compileError).toBeUndefined();
  });
});
