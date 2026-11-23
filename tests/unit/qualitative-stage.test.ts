import { describe, expect, it, vi } from "vitest";
import { FeedbackSchema } from "../../app/lib/server/schema";
import { buildPartialFeedback } from "../../app/lib/server/qualitative-stage";
import {
  createAiBudgetClient,
  hashAiBudgetBinding,
  type AiBudgetNextBinding,
  type AiBudgetReceipt,
} from "../../app/lib/server/ai-budget";
import {
  createAiBudgetOperationId,
  createAiBudgetAttemptId,
  reserveAiBudgetTokens,
  runBudgetedAiAttempt,
} from "../../app/lib/server/ai-budget-attempt";
import { QualitativeAiFailure } from "../../app/lib/server/qualitative-ai";

describe("partial qualitative result", () => {
  it("keeps the deterministic ATS score while clearly marking qualitative feedback unavailable", () => {
    const feedback = buildPartialFeedback({
      score: 74,
      ruleTrace: [
        { passed: true, detail: "Email address was found." },
        { passed: false, detail: "Add a Skills section." },
        { passed: true, detail: "Dates are parseable." },
      ],
    });

    expect(FeedbackSchema.parse(feedback)).toEqual(feedback);
    expect(feedback.overallScore).toBe(74);
    expect(feedback.ATS.score).toBe(74);
    expect(feedback.content.tips[0].tip).toMatch(/unavailable/i);
  });
});

function budgetAttempt() {
  const binding: AiBudgetNextBinding = {
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    operationId: "00000000-0000-4000-8000-000000000003",
    attemptId: "00000000-0000-4000-8000-000000000004",
    surface: "qualitative",
    payloadSha256: "a".repeat(64),
    model: "synthetic-model",
    promptPolicyVersion: "synthetic-prompt/1",
    policyVersion: "synthetic-budget/1",
    reservedInputTokens: 1000,
    reservedOutputTokens: 100,
  };
  const receipt: AiBudgetReceipt = {
    ...binding,
    schemaVersion: "ai-budget/1.0.0",
    attemptOrdinal: 1,
    attemptLimit: 3,
    bindingSha256: hashAiBudgetBinding({ ...binding, attemptOrdinal: 1 }),
    poolPolicyVersion: binding.policyVersion,
    period: "2026-11-01",
    state: "reserved",
    reservedInputTokens: "1000",
    reservedOutputTokens: "100",
    reservedCostMicrousd: "1100",
    inputMicrousdPerMillion: "1000000",
    outputMicrousdPerMillion: "1000000",
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostMicrousd: null,
    replayed: false,
    dispatchAllowed: false,
    poolBlocked: false,
  };
  const client = {
    ...createAiBudgetClient({ rpc: vi.fn() }),
    reserveNext: vi.fn().mockResolvedValue(receipt),
    claimDispatch: vi.fn().mockResolvedValue({
      ...receipt,
      state: "dispatched",
      dispatchAllowed: true,
    }),
    releaseBeforeDispatch: vi.fn().mockResolvedValue(receipt),
    markUnknown: vi.fn().mockResolvedValue(receipt),
    settle: vi.fn().mockResolvedValue(receipt),
  };
  return { binding, receipt, client };
}

describe("shared provider attempt orchestration", () => {
  it("recovers the first dispatch after a reservation-only crash via the claim CAS", async () => {
    const { binding, receipt, client } = budgetAttempt();
    client.reserveNext.mockResolvedValue({ ...receipt, replayed: true });
    const execute = vi.fn().mockResolvedValue({
      value: "kept",
      usage: { inputTokens: 5, outputTokens: 2 },
    });
    await expect(
      runBudgetedAiAttempt({ client, binding, execute }),
    ).resolves.toBe("kept");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(client.claimDispatch).toHaveBeenCalledTimes(1);
    expect(client.settle).toHaveBeenCalledTimes(1);
    expect(client.releaseBeforeDispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch or mutate a prior dispatched replay or a claim loser", async () => {
    for (const terminalReplay of [true, false]) {
      const { binding, receipt, client } = budgetAttempt();
      if (terminalReplay)
        client.reserveNext.mockResolvedValue({
          ...receipt,
          state: "dispatched",
          replayed: true,
        });
      else
        client.claimDispatch.mockResolvedValue({
          ...receipt,
          state: "dispatched",
          replayed: true,
          dispatchAllowed: false,
        });
      const execute = vi.fn();
      await expect(
        runBudgetedAiAttempt({ client, binding, execute }),
      ).rejects.toMatchObject({ code: "AI_BUDGET_STATE" });
      expect(execute).not.toHaveBeenCalled();
      expect(client.settle).not.toHaveBeenCalled();
      expect(client.markUnknown).not.toHaveBeenCalled();
      expect(client.releaseBeforeDispatch).not.toHaveBeenCalled();
    }
  });

  it("releases a fresh preclaim abort but never releases a replay's hold", async () => {
    for (const replayed of [false, true]) {
      const { binding, receipt, client } = budgetAttempt();
      client.reserveNext.mockResolvedValue({ ...receipt, replayed });
      const controller = new AbortController();
      const execute = vi.fn();
      await expect(
        runBudgetedAiAttempt({
          client,
          binding,
          execute,
          signal: controller.signal,
          onAdmitted: () => controller.abort(),
        }),
      ).rejects.toMatchObject({ code: "AI_CANCELLED" });
      expect(client.releaseBeforeDispatch).toHaveBeenCalledTimes(
        replayed ? 0 : 1,
      );
      expect(client.claimDispatch).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("does not reserve for a caller already aborted", async () => {
    const { binding, client } = budgetAttempt();
    const execute = vi.fn();
    await expect(
      runBudgetedAiAttempt({
        client,
        binding,
        execute,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(client.reserveNext).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("settles observed or error-bound usage before preserving the original failure", async () => {
    for (const viaObserver of [true, false]) {
      const { binding, client } = budgetAttempt();
      const usage = { inputTokens: 5, outputTokens: 2 };
      const failure = new QualitativeAiFailure(
        "AI_OUTPUT_INVALID",
        false,
        viaObserver ? null : usage,
      );
      await expect(
        runBudgetedAiAttempt({
          client,
          binding,
          execute: async (recordUsage) => {
            if (viaObserver) {
              recordUsage(usage);
              recordUsage(null);
            }
            throw failure;
          },
        }),
      ).rejects.toBe(failure);
      expect(client.settle).toHaveBeenCalledWith(
        { ...binding, attemptOrdinal: 1 },
        usage,
      );
      expect(client.markUnknown).not.toHaveBeenCalled();
      expect(client.releaseBeforeDispatch).not.toHaveBeenCalled();
    }
  });

  it("retains unknown dispatched usage and never refunds after dispatch", async () => {
    const { binding, client } = budgetAttempt();
    const failure = new QualitativeAiFailure("AI_TIMEOUT", true);
    await expect(
      runBudgetedAiAttempt({
        client,
        binding,
        execute: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(client.markUnknown).toHaveBeenCalledWith({
      ...binding,
      attemptOrdinal: 1,
    });
    expect(client.settle).not.toHaveBeenCalled();
    expect(client.releaseBeforeDispatch).not.toHaveBeenCalled();
  });

  it("withholds late cancelled output while settling its known usage", async () => {
    const { binding, client } = budgetAttempt();
    const controller = new AbortController();
    await expect(
      runBudgetedAiAttempt({
        client,
        binding,
        signal: controller.signal,
        execute: async () => {
          controller.abort();
          return {
            value: "must not escape",
            usage: { inputTokens: 5, outputTokens: 2 },
          };
        },
      }),
    ).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(client.settle).toHaveBeenCalledTimes(1);
    expect(client.releaseBeforeDispatch).not.toHaveBeenCalled();
  });

  it("does not emit success when settlement fails or choose between conflicting observations", async () => {
    const accountingFailure = new Error("synthetic ledger unavailable");
    const first = budgetAttempt();
    first.client.settle.mockRejectedValue(accountingFailure);
    await expect(
      runBudgetedAiAttempt({
        ...first,
        execute: async () => ({
          value: "withheld",
          usage: { inputTokens: 5, outputTokens: 2 },
        }),
      }),
    ).rejects.toBe(accountingFailure);
    expect(first.client.markUnknown).not.toHaveBeenCalled();
    const second = budgetAttempt();
    await expect(
      runBudgetedAiAttempt({
        ...second,
        execute: async (recordUsage) => {
          recordUsage({ inputTokens: 5, outputTokens: 2 });
          return {
            value: "withheld",
            usage: { inputTokens: 6, outputTokens: 2 },
          };
        },
      }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_UNAVAILABLE" });
    expect(second.client.markUnknown).toHaveBeenCalledTimes(1);
    expect(second.client.settle).not.toHaveBeenCalled();
  });

  it("keeps payload outside operation identity and bounds server reservation by serialized UTF8 bytes", () => {
    const { binding } = budgetAttempt();
    const input = {
      userId: binding.userId,
      organizationId: binding.organizationId,
      surface: binding.surface,
      nonce: "http-post/1",
    };
    const operationId = createAiBudgetOperationId(input);
    expect(operationId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
    );
    expect(createAiBudgetOperationId({ ...input })).toBe(operationId);
    expect(
      createAiBudgetOperationId({ ...input, surface: "rewrite" }),
    ).not.toBe(operationId);
    expect(
      createAiBudgetAttemptId({ operationId, attemptNonce: "1" }),
    ).not.toBe(createAiBudgetAttemptId({ operationId, attemptNonce: "2" }));
    const request = {
      system: "neutral",
      user: "synthetic emoji 🧪",
      schema: { type: "object" },
      maxOutputTokens: 768,
    };
    expect(reserveAiBudgetTokens(request)).toEqual({
      reservedInputTokens:
        Buffer.byteLength(
          JSON.stringify({
            system: request.system,
            user: request.user,
            schema: request.schema,
          }),
          "utf8",
        ) + 1024,
      reservedOutputTokens: 768,
    });
  });
});
