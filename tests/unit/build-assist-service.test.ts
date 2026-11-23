import { AI_BUDGET_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";
import { hashAiBudgetBinding } from "../../app/lib/server/ai-budget";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  member: vi.fn(),
  consent: vi.fn(),
  audit: vi.fn(),
  execute: vi.fn(),
  usage: vi.fn(),
  config: {
    LATEX_CONVERTER_ENABLED: true,
    BUILD_AI_ASSIST_ENABLED: true,
    AI_ENABLED: true,
    AI_BUDGET_ENABLED: false,
    AI_BUDGET_POLICY_VERSION: "",
    APP_ORIGIN: "https://example.test",
    AI_MONTHLY_TOKEN_LIMIT: 100000,
    OPENAI_API_KEY: "unit-only",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-6-luna",
    AI_INPUT_COST_PER_1K_USD: 0,
    AI_OUTPUT_COST_PER_1K_USD: 0,
  },
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => mocks.config,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/observability", () => ({
  recordProviderUsage: mocks.usage,
}));
vi.mock("../../app/lib/server/build-assist", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/build-assist")>()),
  executeBuildAssist: mocks.execute,
}));
import { BUILD_AI_POLICY_VERSION } from "../../app/lib/build-assist";
import { BuildAssistError } from "../../app/lib/server/build-assist";
import { buildSuggestAction } from "../../app/lib/server/build-assist-service";
const userId = "11111111-1111-4111-8111-111111111111",
  orgId = "22222222-2222-4222-8222-222222222222";
const source =
  "\\documentclass{article}\n\\begin{document}\nSelected sentence.\n\\end{document}\n";
const body = () => ({
  source,
  sourceHash: createHash("sha256").update(source).digest("hex"),
  startLine: 3,
  endLine: 3,
  mode: "rewrite",
  consent: true,
  policyVersion: BUILD_AI_POLICY_VERSION,
});
const request = (
  headers: Record<string, string> = {},
  value: unknown = body(),
) =>
  new Request("https://example.test/build/suggest", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.LATEX_CONVERTER_ENABLED = true;
  mocks.config.BUILD_AI_ASSIST_ENABLED = true;
  mocks.config.AI_ENABLED = true;
  mocks.config.AI_BUDGET_ENABLED = true;
  mocks.config.AI_BUDGET_POLICY_VERSION = "synthetic-budget/1";
  mocks.user.mockResolvedValue({ id: userId });
  mocks.member.mockResolvedValue({
    data: { organization_id: orgId },
    error: null,
  });
  mocks.consent.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue({ error: null });
  installAdmittedBuildRpc();
  mocks.admin.mockReturnValue({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "consents") return { upsert: mocks.consent };
      if (table === "audit_events") return { insert: mocks.audit };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: mocks.member,
      };
      return chain;
    },
  });
  mocks.execute.mockImplementation(async (prepared) => ({
    response: {
      sourceHash: prepared.sourceHash,
      startLine: 3,
      endLine: 3,
      originalText: "Selected sentence.",
      mode: "rewrite",
      suggestion: {
        operation: "replace",
        replacement: "Clear sentence.",
        explanation: "Clearer.",
        questions: [],
      },
      requiresFactConfirmation: false,
    },
    usage: { inputTokens: 20, outputTokens: 10 },
  }));
});
describe("Build suggest server guards (provider mocked)", () => {
  it("bounds declared input before admission and promptly handles an already-aborted stream", async () => {
    expect(
      (await buildSuggestAction(request({ "Content-Length": "9999999" })))
        .status,
    ).toBe(400);
    const controller = new AbortController();
    controller.abort();
    const aborted = new Request("https://example.test/build/suggest", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body: new ReadableStream(),
      duplex: "half",
      signal: controller.signal,
    } as RequestInit);
    expect((await buildSuggestAction(aborted)).status).toBe(409);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  }, 1000);
  it("requires pre-consent rate admission and content-free audit before provider work", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await buildSuggestAction(request())).status).toBe(429);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    installAdmittedBuildRpc();
    mocks.audit.mockResolvedValue({
      error: { message: "PRIVATE_AUDIT_ERROR" },
    });
    const failed = await buildSuggestAction(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("PRIVATE_AUDIT_ERROR");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("admits at most two active requests and releases both slots on cancellation", async () => {
    const controllers = [new AbortController(), new AbortController()];
    mocks.execute.mockImplementation(
      (_prepared, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(new BuildAssistError("cancelled")),
            { once: true },
          ),
        ),
    );
    const pending = controllers.map((controller) =>
      buildSuggestAction(new Request(request(), { signal: controller.signal })),
    );
    try {
      await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
      const third = await buildSuggestAction(request());
      expect(third.status).toBe(429);
      expect(await third.json()).toMatchObject({ code: "busy" });
    } finally {
      controllers.forEach((controller) => controller.abort());
      const results = await Promise.all(pending);
      expect(results.map((result) => result.status)).toEqual([409, 409]);
    }
  });
  it.each([null, false, ""])(
    "fails closed for an unknown technical readiness value %j",
    async (value) => {
      mocks.rpc.mockImplementation(async (name: string) => ({
        data: name === "read_ai_budget_source_readiness" ? value : true,
        error: null,
      }));
      expect((await buildSuggestAction(request())).status).toBe(503);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("authenticates before privileged admission", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await buildSuggestAction(request())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([
    "LATEX_CONVERTER_ENABLED",
    "BUILD_AI_ASSIST_ENABLED",
    "AI_ENABLED",
  ] as const)("fails closed while %s is disabled", async (flag) => {
    mocks.config[flag] = false;
    expect((await buildSuggestAction(request())).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT", "DELETE"])("rejects method %s", async (method) => {
    expect(
      (
        await buildSuggestAction(
          new Request("https://example.test/build/suggest", { method }),
        )
      ).status,
    ).toBe(405);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["https://foreign.test", "null", ""])(
    "rejects untrusted Origin %s",
    async (Origin) => {
      expect((await buildSuggestAction(request({ Origin }))).status).toBe(403);
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it("rejects missing Origin, contradictory fetch metadata and non-JSON content", async () => {
    const missing = request();
    missing.headers.delete("Origin");
    expect((await buildSuggestAction(missing)).status).toBe(403);
    expect(
      (await buildSuggestAction(request({ "Sec-Fetch-Site": "cross-site" })))
        .status,
    ).toBe(403);
    expect(
      (await buildSuggestAction(request({ "Content-Type": "text/plain" })))
        .status,
    ).toBe(415);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    { consent: false },
    { policyVersion: "old" },
    { sourceHash: "0".repeat(64) },
    { startLine: 0 },
    { extra: "forged" },
  ])(
    "validates consent/hash/bounds before metadata or provider work %j",
    async (patch) => {
      expect([400, 403, 409]).toContain(
        (await buildSuggestAction(request({}, { ...body(), ...patch }))).status,
      );
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("uses independent user/global and atomic technical admission, content-free versioned consent and audit", async () => {
    const response = await buildSuggestAction(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const calls = mocks.rpc.mock.calls;
    expect(calls[0][1]).toMatchObject({
      p_key:
        "build-ai:user:" + createHash("sha256").update(userId).digest("hex"),
      p_limit: 3,
      p_window_seconds: 60,
    });
    expect(calls[1][1]).toMatchObject({
      p_key: "build-ai:global:v1",
      p_limit: 20,
    });
    expect(calls[2][0]).toBe("read_ai_budget_source_readiness");
    expect(calls[3][0]).toBe("ai_budget_reserve_source_next");
    expect(calls[3][1]).toMatchObject({
      p_user_id: userId,
      p_organization_id: orgId,
      p_request: {
        reservedInputTokens: "24232",
        reservedOutputTokens: "768",
        policyVersion: "synthetic-budget/1",
      },
    });
    expect(
      calls.some(([name]) => name === "get_organization_ai_tokens_used"),
    ).toBe(false);
    expect(
      calls.some(([, args]) =>
        String(args.p_key).startsWith("build-ai:month:"),
      ),
    ).toBe(false);
    expect(mocks.consent).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        organization_id: orgId,
        purpose: "qualitative_ai",
        policy_version: BUILD_AI_POLICY_VERSION,
      }),
      expect.any(Object),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: userId,
        action: "build_ai.consent_recorded",
      }),
    );
    expect(
      JSON.stringify([
        mocks.rpc.mock.calls,
        mocks.consent.mock.calls,
        mocks.audit.mock.calls,
        mocks.usage.mock.calls,
      ]),
    ).not.toContain("Selected sentence.");
    expect(mocks.execute.mock.calls[0][0].source).toBe(source);
    expect(mocks.execute.mock.calls[0][1].model).toBe("gpt-6-luna");
  });
  it("requires an owned membership and fails closed if consent/audit persistence fails", async () => {
    mocks.member.mockResolvedValue({ data: null, error: null });
    expect((await buildSuggestAction(request())).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.member.mockResolvedValue({
      data: { organization_id: orgId },
      error: null,
    });
    mocks.consent.mockResolvedValue({ error: { message: "PRIVATE" } });
    expect((await buildSuggestAction(request())).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(["budget", "rate", "storage"])(
    "fails closed for %s admission failures",
    async (kind) => {
      if (kind === "budget") mocks.config.AI_BUDGET_POLICY_VERSION = "";
      mocks.rpc.mockImplementation(async (name: string) => ({
        data:
          kind === "budget" && name === "get_organization_ai_tokens_used"
            ? 100000
            : kind === "rate"
              ? false
              : name === "get_organization_ai_tokens_used"
                ? 0
                : true,
        error: kind === "storage" ? { message: "PRIVATE" } : null,
      }));
      expect([429, 503]).toContain(
        (await buildSuggestAction(request())).status,
      );
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.consent).not.toHaveBeenCalled();
    },
  );
  it.each([
    "timeout",
    "cancelled",
    "output_invalid",
    "provider_unavailable",
  ] as const)("redacts safe provider failure %s", async (code) => {
    mocks.execute.mockRejectedValue(new BuildAssistError(code));
    const response = await buildSuggestAction(request());
    expect(response.status).toBe(
      code === "timeout"
        ? 504
        : code === "cancelled"
          ? 409
          : code === "output_invalid"
            ? 422
            : 503,
    );
    expect(await response.json()).toMatchObject({ code });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("never reflects an arbitrary provider exception", async () => {
    mocks.execute.mockRejectedValue(Error("PRIVATE-KEY-OR-BODY"));
    const response = await buildSuggestAction(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE-KEY-OR-BODY");
  });
});

it("requires technical admission even with an injected Build executor", async () => {
  mocks.config.AI_BUDGET_ENABLED = false;
  const response = await buildSuggestAction(request());
  expect(response.status).toBe(503);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    "get_organization_ai_tokens_used",
    expect.anything(),
  );
});

function admittedBudgetReply(name: string, args: Record<string, unknown>) {
  const p = args.p_request as Record<string, unknown>;
  const binding = {
    userId: String(args.p_user_id),
    organizationId: String(args.p_organization_id),
    operationId: String(p.operationId),
    attemptId: String(p.attemptId),
    attemptOrdinal: Number(p.attemptOrdinal ?? 1),
    surface: p.surface as "qualitative" | "rewrite" | "build",
    payloadSha256: String(p.payloadSha256),
    model: String(p.model),
    promptPolicyVersion: String(p.promptPolicyVersion),
    policyVersion: String(p.policyVersion),
    reservedInputTokens: Number(p.reservedInputTokens),
    reservedOutputTokens: Number(p.reservedOutputTokens),
  };
  const usage = p.usage as
    { inputTokens: string; outputTokens: string } | undefined;
  const state =
    name === "ai_budget_claim_dispatch"
      ? "dispatched"
      : name === "ai_budget_settle"
        ? "settled"
        : name === "ai_budget_mark_unknown"
          ? "held_unknown"
          : name === "ai_budget_release"
            ? "released"
            : "reserved";
  return {
    data: {
      schemaVersion: "ai-budget/1.0.0",
      status: "ok",
      receipt: {
        schemaVersion: "ai-budget/1.0.0",
        ...binding,
        reservedInputTokens: String(binding.reservedInputTokens),
        reservedOutputTokens: String(binding.reservedOutputTokens),
        bindingSha256: hashAiBudgetBinding(binding),
        period: "2026-11-01",
        state,
        reservedCostMicrousd: String(
          binding.reservedInputTokens + binding.reservedOutputTokens,
        ),
        actualInputTokens: state === "settled" ? usage!.inputTokens : null,
        actualOutputTokens: state === "settled" ? usage!.outputTokens : null,
        actualCostMicrousd:
          state === "settled"
            ? String(BigInt(usage!.inputTokens) + BigInt(usage!.outputTokens))
            : null,
        replayed: false,
        dispatchAllowed: state === "dispatched",
        poolBlocked: false,
        poolPolicyVersion: "synthetic-pool/1",
        attemptLimit: 3,
        inputMicrousdPerMillion: "1000000",
        outputMicrousdPerMillion: "1000000",
      },
    },
    error: null,
  };
}

function installAdmittedBuildRpc() {
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      if (name === "read_ai_budget_source_readiness")
        return {
          data: {
            ...AI_BUDGET_SOURCE_PROFILE,
            schemaReady: true,
            reserveExecutable: true,
            exportExecutable: false,
          },
          error: null,
        };
      if (
        name === "get_organization_ai_tokens_used" ||
        name === "ai_budget_reserve_next"
      )
        throw Error("LEGACY_BUDGET_FALLBACK_FORBIDDEN");
      if (name === "ai_budget_reserve_source_next")
        expect(args.p_source).toMatchObject({
          schemaVersion: "ai-budget-source/2.0.0",
          kind: "build_account",
        });
      if (name.startsWith("ai_budget_")) return admittedBudgetReply(name, args);
      return { data: true, error: null };
    },
  );
}

it.each([
  [false, "synthetic-budget/1"],
  [undefined, "synthetic-budget/1"],
  [true, undefined],
  [true, ""],
  [true, "   "],
])(
  "denies missing Build technical selection before admission/SDK: %s/%s",
  async (enabled, policy) => {
    Reflect.set(mocks.config, "AI_BUDGET_ENABLED", enabled);
    Reflect.set(mocks.config, "AI_BUDGET_POLICY_VERSION", policy);
    expect((await buildSuggestAction(request())).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
