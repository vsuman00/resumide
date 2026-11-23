import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiBudgetError,
  calculateAiBudgetCost,
  createAiBudgetClient,
  hashAiBudgetBinding,
} from "../../app/lib/server/ai-budget";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  operation: "33333333-3333-4333-8333-333333333333",
  attempt: "44444444-4444-4444-8444-444444444444",
  secondAttempt: "55555555-5555-4555-8555-555555555555",
  thirdAttempt: "66666666-6666-4666-8666-666666666666",
  event: "77777777-7777-4777-8777-777777777777",
  operator: "88888888-8888-4888-8888-888888888888",
};
const binding = {
  userId: ids.user,
  organizationId: ids.organization,
  operationId: ids.operation,
  attemptId: ids.attempt,
  attemptOrdinal: 1,
  surface: "qualitative" as const,
  payloadSha256: "a".repeat(64),
  model: "synthetic-model",
  promptPolicyVersion: "synthetic-prompt-v1",
  policyVersion: "synthetic-policy-v1",
  reservedInputTokens: 8,
  reservedOutputTokens: 4,
};
type Binding = Omit<typeof binding, "surface"> & {
  surface: "qualitative" | "rewrite" | "build";
};
function receipt(
  input: Binding = binding,
  patch: Record<string, unknown> = {},
) {
  return {
    schemaVersion: "ai-budget/1.0.0",
    ...input,
    bindingSha256: hashAiBudgetBinding(input),
    period: "2026-11-01",
    state: "reserved",
    reservedInputTokens: String(input.reservedInputTokens),
    reservedOutputTokens: String(input.reservedOutputTokens),
    reservedCostMicrousd: "16",
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostMicrousd: null,
    replayed: false,
    dispatchAllowed: false,
    poolBlocked: false,
    attemptLimit: 3,
    poolPolicyVersion: "synthetic-pool-v1",
    inputMicrousdPerMillion: "1000000",
    outputMicrousdPerMillion: "2000000",
    ...patch,
  };
}
function ok(value = receipt()) {
  return {
    data: { schemaVersion: "ai-budget/1.0.0", status: "ok", receipt: value },
    error: null,
  };
}
function denied(code: string) {
  return {
    data: { schemaVersion: "ai-budget/1.0.0", status: "denied", code },
    error: null,
  };
}
function rpcRequest(input: Binding = binding) {
  const { userId, organizationId, ...command } = input;
  return {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_request: {
      ...command,
      reservedInputTokens: String(command.reservedInputTokens),
      reservedOutputTokens: String(command.reservedOutputTokens),
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("technical budget arithmetic and immutable operation binding", () => {
  it.each([
    [0, 0, "3", "5", "0"],
    [1, 1, "1", "1", "1"],
    [500000, 500000, "1", "1", "1"],
    [1, 0, "1000001", "1", "2"],
    [8, 4, "1000000", "2000000", "16"],
  ] as const)(
    "uses one combined integer ceiling for neutral rate vector %#",
    (
      inputTokens,
      outputTokens,
      inputMicrousdPerMillion,
      outputMicrousdPerMillion,
      expected,
    ) => {
      expect(
        calculateAiBudgetCost({
          inputTokens,
          outputTokens,
          inputMicrousdPerMillion,
          outputMicrousdPerMillion,
        }),
      ).toBe(expected);
    },
  );
  it("rejects invalid counters and noncanonical rates rather than pricing them locally", () => {
    const base = {
      inputTokens: 1,
      outputTokens: 1,
      inputMicrousdPerMillion: "1",
      outputMicrousdPerMillion: "1",
    };
    for (const patch of [
      { inputTokens: -1 },
      { outputTokens: 0.5 },
      { inputMicrousdPerMillion: "1.5" },
      { outputMicrousdPerMillion: "-1" },
    ]) {
      expect(() => calculateAiBudgetCost({ ...base, ...patch })).toThrow(
        AiBudgetError,
      );
    }
  });
  it("matches the independently framed AIBUDGET1 operation vector", () => {
    const input = {
      ...binding,
      userId: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000002",
      operationId: "00000000-0000-4000-8000-000000000003",
      attemptId: "00000000-0000-4000-8000-000000000004",
      promptPolicyVersion: "synthetic-prompt/1",
      policyVersion: "synthetic-policy/1",
      reservedInputTokens: 10,
      reservedOutputTokens: 2,
    };
    const bytes =
      "AIBUDGET1\n" +
      "T36:00000000-0000-4000-8000-000000000001;" +
      "T36:00000000-0000-4000-8000-000000000002;" +
      "T36:00000000-0000-4000-8000-000000000003;" +
      "T11:qualitative;T64:" +
      "a".repeat(64) +
      ";T15:synthetic-model;T18:synthetic-prompt/1;T18:synthetic-policy/1;T2:10;T1:2;";
    const expected =
      "aef2b4e2a2034dad016ec7d92116ef2e16c5f2f64751101e153943f7458b91fe";
    expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(
      expected,
    );
    expect(hashAiBudgetBinding(input)).toBe(expected);
  });
  it("keeps operation binding stable across distinct attempts and key order", () => {
    const next = {
      ...binding,
      attemptId: ids.secondAttempt,
      attemptOrdinal: 2,
    };
    expect(hashAiBudgetBinding(next)).toBe(hashAiBudgetBinding(binding));
    expect(
      hashAiBudgetBinding({
        reservedOutputTokens: binding.reservedOutputTokens,
        reservedInputTokens: binding.reservedInputTokens,
        policyVersion: binding.policyVersion,
        promptPolicyVersion: binding.promptPolicyVersion,
        model: binding.model,
        payloadSha256: binding.payloadSha256,
        surface: binding.surface,
        attemptOrdinal: binding.attemptOrdinal,
        attemptId: binding.attemptId,
        operationId: binding.operationId,
        organizationId: binding.organizationId,
        userId: binding.userId,
      }),
    ).toBe(hashAiBudgetBinding(binding));
    const variants = [
      { userId: ids.operator },
      { organizationId: ids.operator },
      { operationId: ids.operator },
      { surface: "build" as const },
      { payloadSha256: "b".repeat(64) },
      { model: "synthetic-other-model" },
      { promptPolicyVersion: "synthetic-prompt-v2" },
      { policyVersion: "synthetic-policy-v2" },
      { reservedInputTokens: 9 },
      { reservedOutputTokens: 5 },
    ];
    expect(
      new Set(
        [binding, ...variants.map((patch) => ({ ...binding, ...patch }))].map(
          hashAiBudgetBinding,
        ),
      ).size,
    ).toBe(variants.length + 1);
  });
});

describe("real technical-budget RPC client with local response doubles", () => {
  it.each(["qualitative", "rewrite", "build"] as const)(
    "uses the same organization pool contract for %s without caller-selected periods or caps",
    async (surface) => {
      const input = { ...binding, surface };
      const rpc = vi.fn().mockResolvedValue(ok(receipt(input)));
      const result = await createAiBudgetClient({ rpc }).reserve(input);
      expect(result).toEqual(receipt(input));
      expect(result.dispatchAllowed).toBe(false);
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        "ai_budget_reserve",
        rpcRequest(input),
      );
      expect(rpc.mock.calls[0][1].p_request).not.toHaveProperty("period");
      expect(rpc.mock.calls[0][1].p_request).not.toHaveProperty(
        "poolPolicyVersion",
      );
      expect(rpc.mock.calls[0][1].p_request).not.toHaveProperty(
        "inputMicrousdPerMillion",
      );
    },
  );
  it.each(["AI_BUDGET_DISABLED", "AI_BUDGET_EXHAUSTED", "AI_BUDGET_CONFLICT"])(
    "preserves authoritative %s without fallback admission",
    async (code) => {
      const rpc = vi.fn().mockResolvedValue(denied(code));
      await expect(
        createAiBudgetClient({ rpc }).reserve(binding),
      ).rejects.toMatchObject({ code });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { data: null, error: null },
    { data: { schemaVersion: "ai-budget/1.0.0", status: "ok" }, error: null },
    { data: null, error: { message: "UNTRUSTED_DATABASE_DETAIL" } },
  ])(
    "fails closed on absent, malformed or failed RPC output %#",
    async (raw) => {
      const rpc = vi.fn().mockResolvedValue(raw);
      const error = await createAiBudgetClient({ rpc })
        .reserve(binding)
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
      expect(String(error)).not.toContain("UNTRUSTED_DATABASE_DETAIL");
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects returned owner, organization, operation, attempt and immutable-field substitution", async () => {
    const patches = [
      { userId: ids.operator },
      { organizationId: ids.operator },
      { operationId: ids.operator },
      { attemptId: ids.secondAttempt },
      { attemptOrdinal: 2 },
      { surface: "rewrite" },
      { payloadSha256: "b".repeat(64) },
      { model: "synthetic-other-model" },
      { promptPolicyVersion: "synthetic-prompt-v2" },
      { policyVersion: "synthetic-policy-v2" },
      { bindingSha256: "f".repeat(64) },
      { reservedInputTokens: "9" },
      { reservedOutputTokens: "5" },
      { period: "2026-13-01" },
    ];
    for (const patch of patches) {
      const rpc = vi.fn().mockResolvedValue(ok(receipt(binding, patch)));
      await expect(
        createAiBudgetClient({ rpc }).reserve(binding),
      ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    }
  });
  it("supports distinct captured-policy attempts while exact replay never authorizes another dispatch", async () => {
    const second = {
      ...binding,
      attemptId: ids.secondAttempt,
      attemptOrdinal: 2,
    };
    const third = {
      ...binding,
      attemptId: ids.thirdAttempt,
      attemptOrdinal: 3,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok(receipt(binding, { replayed: true })))
      .mockResolvedValueOnce(
        ok(receipt(binding, { state: "dispatched", dispatchAllowed: true })),
      )
      .mockResolvedValueOnce(
        ok(receipt(binding, { state: "dispatched", replayed: true })),
      )
      .mockResolvedValueOnce(ok(receipt(second)))
      .mockResolvedValueOnce(ok(receipt(third)));
    const client = createAiBudgetClient({ rpc });
    expect((await client.reserve(binding)).dispatchAllowed).toBe(false);
    expect((await client.reserve(binding)).replayed).toBe(true);
    expect((await client.claimDispatch(binding)).dispatchAllowed).toBe(true);
    expect((await client.claimDispatch(binding)).dispatchAllowed).toBe(false);
    expect((await client.reserve(second)).attemptOrdinal).toBe(2);
    expect((await client.reserve(third)).attemptOrdinal).toBe(3);
    await expect(
      client.reserve({ ...third, attemptId: ids.operator, attemptOrdinal: 4 }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_INVALID" });
    expect(rpc).toHaveBeenCalledTimes(6);
    expect(rpc.mock.calls[4]).toEqual([
      "ai_budget_reserve",
      rpcRequest(second),
    ]);
    expect(rpc.mock.calls[5]).toEqual(["ai_budget_reserve", rpcRequest(third)]);
  });
  it("retains the server's captured attempt-cap denial without automatic retries", async () => {
    const rpc = vi.fn().mockResolvedValue(denied("AI_BUDGET_STATE"));
    await expect(
      createAiBudgetClient({ rpc }).reserve({
        ...binding,
        attemptId: ids.thirdAttempt,
        attemptOrdinal: 3,
      }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_STATE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not accept dispatch permission from reserve or an exact replay", async () => {
    const reserveRpc = vi
      .fn()
      .mockResolvedValue(ok(receipt(binding, { dispatchAllowed: true })));
    await expect(
      createAiBudgetClient({ rpc: reserveRpc }).reserve(binding),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    const claimRpc = vi.fn().mockResolvedValue(
      ok(
        receipt(binding, {
          state: "dispatched",
          replayed: true,
          dispatchAllowed: true,
        }),
      ),
    );
    await expect(
      createAiBudgetClient({ rpc: claimRpc }).claimDispatch(binding),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
  });
  it("accepts the SQL-assigned reserve-next ordinal without sending a caller ordinal", async () => {
    const { attemptOrdinal, ...input } = binding;
    void attemptOrdinal;
    const rpc = vi
      .fn()
      .mockResolvedValue(ok(receipt(binding, { attemptOrdinal: 3 })));
    const result = await createAiBudgetClient({ rpc }).reserveNext(input);
    expect(result.attemptOrdinal).toBe(3);
    const { attemptOrdinal: removed, ...expectedRequest } =
      rpcRequest().p_request;
    void removed;
    expect(rpc).toHaveBeenCalledExactlyOnceWith("ai_budget_reserve_next", {
      p_user_id: ids.user,
      p_organization_id: ids.organization,
      p_request: expectedRequest,
    });
    expect(result.dispatchAllowed).toBe(false);
  });
  it("rejects an out-of-policy reserve-next ordinal instead of admitting dispatch", async () => {
    const { attemptOrdinal, ...input } = binding;
    void attemptOrdinal;
    const rpc = vi
      .fn()
      .mockResolvedValue(ok(receipt(binding, { attemptOrdinal: 4 })));
    await expect(
      createAiBudgetClient({ rpc }).reserveNext(input),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("never labels unknown usage as known zero in a held receipt", async () => {
    const rpc = vi.fn().mockResolvedValue(
      ok(
        receipt(binding, {
          state: "held_unknown",
          actualInputTokens: "0",
          actualOutputTokens: "0",
          actualCostMicrousd: "0",
        }),
      ),
    );
    await expect(
      createAiBudgetClient({ rpc }).markUnknown(binding),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("releases only through the pre-dispatch RPC and preserves a post-dispatch refusal", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(ok(receipt(binding, { state: "released" })))
      .mockResolvedValueOnce(denied("AI_BUDGET_STATE"));
    const client = createAiBudgetClient({ rpc });
    expect((await client.releaseBeforeDispatch(binding)).state).toBe(
      "released",
    );
    await expect(client.releaseBeforeDispatch(binding)).rejects.toMatchObject({
      code: "AI_BUDGET_STATE",
    });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "ai_budget_release",
      "ai_budget_release",
    ]);
  });
  it("retains unknown usage and its original reservation rather than expiring it into free capacity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-02T00:00:00Z"));
    const held = receipt(binding, { state: "held_unknown" });
    const rpc = vi.fn().mockResolvedValue(ok(held));
    const result = await createAiBudgetClient({ rpc }).markUnknown(binding);
    expect(result).toMatchObject({
      state: "held_unknown",
      period: "2026-11-01",
      reservedCostMicrousd: "16",
      actualInputTokens: null,
      actualOutputTokens: null,
      actualCostMicrousd: null,
      dispatchAllowed: false,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "ai_budget_mark_unknown",
      rpcRequest(),
    );
  });
  it("settles known usage in the original period without requiring accepted output or current membership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-02T00:00:00Z"));
    const usage = { inputTokens: 3, outputTokens: 2 };
    const settled = receipt(binding, {
      state: "settled",
      actualInputTokens: "3",
      actualOutputTokens: "2",
      actualCostMicrousd: "7",
    });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(denied("AI_BUDGET_DENIED"))
      .mockResolvedValueOnce(ok(settled));
    const client = createAiBudgetClient({ rpc });
    await expect(client.claimDispatch(binding)).rejects.toMatchObject({
      code: "AI_BUDGET_DENIED",
    });
    expect(await client.settle(binding, usage)).toEqual(settled);
    expect(rpc.mock.calls[1]).toEqual([
      "ai_budget_settle",
      {
        ...rpcRequest(),
        p_request: {
          ...rpcRequest().p_request,
          usage: { inputTokens: "3", outputTokens: "2" },
        },
      },
    ]);
    expect(rpc.mock.calls[1][1].p_request).not.toHaveProperty("period");
  });
  it("does not clip usage above its reservation and preserves the server's blocked-pool result", async () => {
    const usage = { inputTokens: 9, outputTokens: 7 };
    const rpc = vi.fn().mockResolvedValue(
      ok(
        receipt(binding, {
          state: "settled",
          actualInputTokens: "9",
          actualOutputTokens: "7",
          actualCostMicrousd: "23",
          poolBlocked: true,
        }),
      ),
    );
    const result = await createAiBudgetClient({ rpc }).settle(binding, usage);
    expect(result).toMatchObject({
      actualInputTokens: "9",
      actualOutputTokens: "7",
      actualCostMicrousd: "23",
      poolBlocked: true,
    });
    expect(rpc.mock.calls[0][1].p_request.usage).toEqual({
      inputTokens: "9",
      outputTokens: "7",
    });
  });
  it("rejects a fresh over-reservation settlement that leaves the pool unblocked", async () => {
    const rpc = vi.fn().mockResolvedValue(
      ok(
        receipt(binding, {
          state: "settled",
          actualInputTokens: "9",
          actualOutputTokens: "7",
          actualCostMicrousd: "23",
          poolBlocked: false,
        }),
      ),
    );
    await expect(
      createAiBudgetClient({ rpc }).settle(binding, {
        inputTokens: 9,
        outputTokens: 7,
      }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps captured pool policy separate from a new operation's rotated rate policy", async () => {
    const rotated = {
      ...binding,
      operationId: ids.operator,
      policyVersion: "synthetic-policy-v2",
    };
    const rpc = vi
      .fn()
      .mockResolvedValue(
        ok(receipt(rotated, { poolPolicyVersion: "synthetic-pool-v1" })),
      );
    const result = await createAiBudgetClient({ rpc }).reserve(rotated);
    expect(result).toMatchObject({
      policyVersion: "synthetic-policy-v2",
      poolPolicyVersion: "synthetic-pool-v1",
      period: "2026-11-01",
    });
    expect(rpc.mock.calls[0][1].p_request).not.toHaveProperty(
      "poolPolicyVersion",
    );
  });
  it("sends exact operator/evidence reconciliation as one RPC without local ledger mutation", async () => {
    const reconciliation = {
      reconciliationId: ids.event,
      operatorId: ids.operator,
      evidenceSha256: "e".repeat(64),
      usage: { inputTokens: 3, outputTokens: 2 },
    };
    const settled = receipt(binding, {
      state: "settled",
      actualInputTokens: "3",
      actualOutputTokens: "2",
      actualCostMicrousd: "7",
    });
    const rpc = vi.fn().mockResolvedValue(ok(settled));
    expect(
      await createAiBudgetClient({ rpc }).reconcile(binding, reconciliation),
    ).toEqual(settled);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("ai_budget_reconcile", {
      ...rpcRequest(),
      p_request: {
        ...rpcRequest().p_request,
        ...reconciliation,
        usage: { inputTokens: "3", outputTokens: "2" },
      },
    });
  });
});
