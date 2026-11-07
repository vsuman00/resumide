import { createHash } from "node:crypto";
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
  "FAR_BEFORE_CANARY",
  "Nearby A",
  "Nearby B",
  "Selected sentence.",
  "Nearby C",
  "Nearby D",
  "FAR_AFTER_CANARY",
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
            replacement: "Improved sentence.",
            explanation: "Clearer wording.",
            questions: [],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  });
});
describe("Build provider transport with SDK mocked, no network", () => {
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
        await expect(pending).rejects.toMatchObject({ code: "output_invalid" });
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
    { choices: [{ finish_reason: "stop", message: { refusal: "Refused" } }] },
    { choices: [{ finish_reason: "length", message: { parsed: {} } }] },
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
  ])("withholds refused, incomplete or malformed output", async (value) => {
    mocks.create.mockResolvedValue(value);
    await expect(executeBuildAssist(prepared(), options)).rejects.toMatchObject(
      { code: "output_invalid" },
    );
  });
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
});
