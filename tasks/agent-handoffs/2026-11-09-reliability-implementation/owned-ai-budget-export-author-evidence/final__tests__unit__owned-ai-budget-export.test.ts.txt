import { describe, expect, it, vi } from "vitest";
import {
  calculateAiBudgetCost,
  hashAiBudgetBinding,
} from "../../app/lib/server/ai-budget";
import { OWNED_AI_BUDGET_EXPORT_PROFILE as profile } from "../../app/lib/server/owned-ai-budget-export-profile";
import {
  OwnedAiBudgetExportError,
  readOwnedAiBudgetExport,
  validateOwnedAiBudgetExport,
  type OwnedAiBudgetExport,
} from "../../app/lib/server/owned-ai-budget-export";

const id = (n: number) =>
  `a0000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const owner = id(1),
  stamp = "2026-11-15T00:00:00.000001Z";
function fixture(
  state:
    | "reserved"
    | "released"
    | "dispatched"
    | "held_unknown"
    | "settled" = "settled",
  offset = 0,
): OwnedAiBudgetExport {
  const binding = {
    userId: owner,
    organizationId: id(2 + offset),
    operationId: id(10 + offset),
    attemptId: id(20 + offset),
    attemptOrdinal: 1,
    surface: "qualitative" as const,
    payloadSha256: "1".repeat(64),
    model: "synthetic-model",
    promptPolicyVersion: "synthetic-prompt/1",
    policyVersion: "synthetic-budget/1",
    reservedInputTokens: 1000,
    reservedOutputTokens: 1000,
  };
  const rates = {
    inputMicrousdPerMillion: "1000000",
    outputMicrousdPerMillion: "2000000",
  };
  const actual = calculateAiBudgetCost({
    inputTokens: 37,
    outputTokens: 11,
    ...rates,
  });
  const data: OwnedAiBudgetExport = {
    schemaVersion: "owned-ai-budget-export/1.0.0",
    ownerId: owner,
    operations: [
      {
        id: binding.operationId,
        organization_id: binding.organizationId,
        user_id: owner,
        surface: binding.surface,
        payload_sha256: binding.payloadSha256,
        model: binding.model,
        prompt_policy_version: binding.promptPolicyVersion,
        policy_version: binding.policyVersion,
        reserved_input_tokens: "1000",
        reserved_output_tokens: "1000",
        input_microusd_per_million: rates.inputMicrousdPerMillion,
        output_microusd_per_million: rates.outputMicrousdPerMillion,
        attempt_limit: 3,
        binding_sha256: hashAiBudgetBinding(binding),
        created_at: stamp,
      },
    ],
    attempts: [
      {
        id: binding.attemptId,
        operation_id: binding.operationId,
        organization_id: binding.organizationId,
        ordinal: 1,
        period: "2026-11-01",
        state,
        reserved_cost_microusd: calculateAiBudgetCost({
          inputTokens: 1000,
          outputTokens: 1000,
          ...rates,
        }),
        actual_input_tokens: state === "settled" ? "37" : null,
        actual_output_tokens: state === "settled" ? "11" : null,
        actual_cost_microusd: state === "settled" ? actual : null,
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    events: [],
    reconciliationOperators: [],
    operatorActions: [],
    omissions: {
      sharedPools: "not_subject_attributable",
      periodOpenings: "not_subject_attributable",
      foreignOperatorIdentity: "redacted",
      foreignTargetHistory: "redacted",
    },
  };
  const kinds =
    state === "reserved"
      ? ["reserve"]
      : state === "released"
        ? ["reserve", "release"]
        : state === "dispatched"
          ? ["reserve", "dispatch"]
          : state === "held_unknown"
            ? ["reserve", "dispatch", "unknown"]
            : ["reserve", "dispatch", "unknown", "reconcile"];
  data.events = kinds.map((kind, index) => ({
    id: id(100 + offset + index),
    attempt_id: binding.attemptId,
    kind: kind as OwnedAiBudgetExport["events"][number]["kind"],
    input_tokens: kind === "reconcile" ? "37" : null,
    output_tokens: kind === "reconcile" ? "11" : null,
    cost_microusd: kind === "reconcile" ? actual : null,
    reconciliation_id: kind === "reconcile" ? id(500 + offset) : null,
    operator_id: null,
    evidence_sha256: kind === "reconcile" ? "2".repeat(64) : null,
    created_at: stamp,
    operator_disposition: kind === "reconcile" ? "redacted" : "none",
  }));
  return data;
}
function client(
  data = fixture(),
  metadata: unknown = { ...profile, schemaReady: true, exportExecutable: true },
) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: name === "read_owned_ai_budget_export_readiness" ? metadata : data,
      error: null,
      args,
    })),
  };
}
describe("owned R03 export; synthetic RPCs, no Native proof", () => {
  it("admits each real lifecycle shape and preserves unknown nulls", () => {
    for (const state of [
      "reserved",
      "released",
      "dispatched",
      "held_unknown",
      "settled",
    ] as const) {
      const data = fixture(state);
      expect(validateOwnedAiBudgetExport(data, owner)).toEqual(data);
      if (state !== "settled")
        expect(data.attempts[0].actual_cost_microusd).toBeNull();
    }
  });
  it("uses exact large integer costs from the existing R03 producer math", () => {
    const data = fixture();
    const a = data.attempts[0];
    a.actual_input_tokens = "9007199254740991";
    a.actual_output_tokens = "0";
    a.actual_cost_microusd = calculateAiBudgetCost({
      inputTokens: 9007199254740991,
      outputTokens: 0,
      inputMicrousdPerMillion: "1000000",
      outputMicrousdPerMillion: "2000000",
    });
    const e = data.events.at(-1)!;
    e.input_tokens = a.actual_input_tokens;
    e.output_tokens = a.actual_output_tokens;
    e.cost_microusd = a.actual_cost_microusd;
    expect(
      validateOwnedAiBudgetExport(data, owner).attempts[0].actual_input_tokens,
    ).toBe("9007199254740991");
  });
  it("preserves whole historical multi-organization owner rows without current membership", () => {
    const data = fixture("held_unknown"),
      other = fixture("released", 1000);
    other.operations[0].created_at = "2025-01-03T00:00:00.000000Z";
    other.attempts[0].created_at = other.operations[0].created_at;
    other.attempts[0].updated_at = other.operations[0].created_at;
    other.attempts[0].period = "2025-01-01";
    for (const e of other.events) e.created_at = other.operations[0].created_at;
    data.operations.push(...other.operations);
    data.attempts.push(...other.attempts);
    data.events.push(...other.events);
    expect(validateOwnedAiBudgetExport(data, owner).operations).toHaveLength(2);
  });
  it("records a redacted foreign actor while rejecting disclosure of that UUID", () => {
    const data = fixture();
    expect(
      validateOwnedAiBudgetExport(data, owner).events.at(-1),
    ).toMatchObject({ operator_id: null, operator_disposition: "redacted" });
    data.events.at(-1)!.operator_id = id(999);
    expect(() => validateOwnedAiBudgetExport(data, owner)).toThrow(
      OwnedAiBudgetExportError,
    );
  });
  it("exports own operator records/actions without foreign target or usage fields", () => {
    const data = fixture();
    data.reconciliationOperators.push({
      organization_id: id(900),
      operator_id: owner,
      enabled: false,
      approval_sha256: "3".repeat(64),
    });
    data.operatorActions.push({
      kind: "reconcile",
      operator_id: owner,
      reconciliation_id: id(901),
      evidence_sha256: "4".repeat(64),
      created_at: stamp,
    });
    expect(validateOwnedAiBudgetExport(data, owner).operatorActions).toEqual(
      data.operatorActions,
    );
    expect(() =>
      validateOwnedAiBudgetExport(
        {
          ...data,
          operatorActions: [
            { ...data.operatorActions[0], attempt_id: id(999) },
          ],
        },
        owner,
      ),
    ).toThrow(OwnedAiBudgetExportError);
  });
  it.each([0, "01", "-1", "1.0", "1e3", "NaN", "Infinity", "9007199254740992"])(
    "rejects malformed/nonexact numeric value %s",
    (value) => {
      const data = fixture();
      const row = { ...data.attempts[0], actual_input_tokens: value };
      expect(() =>
        validateOwnedAiBudgetExport({ ...data, attempts: [row] }, owner),
      ).toThrow(OwnedAiBudgetExportError);
    },
  );
  it("rejects owner/parent/duplicate/binding/cost corruption independently", () => {
    const mutations: ((x: OwnedAiBudgetExport) => void)[] = [
      (x) => {
        x.operations[0].user_id = id(999);
      },
      (x) => {
        x.attempts[0].organization_id = id(999);
      },
      (x) => {
        x.events[0].attempt_id = id(999);
      },
      (x) => {
        x.attempts.push({ ...x.attempts[0] });
      },
      (x) => {
        x.events.push({ ...x.events[0] });
      },
      (x) => {
        x.operations[0].binding_sha256 = "0".repeat(64);
      },
      (x) => {
        x.attempts[0].actual_cost_microusd = "0";
      },
    ];
    for (const change of mutations) {
      const data = fixture();
      change(data);
      expect(() => validateOwnedAiBudgetExport(data, owner)).toThrow(
        OwnedAiBudgetExportError,
      );
    }
  });
  it("rejects impossible history, fabricated zero unknowns and false non-overrun acknowledgment", () => {
    const data = fixture();
    data.events = data.events.filter((e) => e.kind !== "reserve");
    expect(() => validateOwnedAiBudgetExport(data, owner)).toThrow(
      OwnedAiBudgetExportError,
    );
    const unknown = fixture("held_unknown");
    unknown.attempts[0].actual_input_tokens = "0";
    expect(() => validateOwnedAiBudgetExport(unknown, owner)).toThrow(
      OwnedAiBudgetExportError,
    );
    const ack = fixture();
    ack.events = ack.events.filter((e) => e.kind !== "unknown");
    ack.events.push({
      ...ack.events.at(-1)!,
      id: id(999),
      kind: "settle",
      reconciliation_id: null,
      operator_id: null,
      evidence_sha256: null,
      operator_disposition: "none",
    });
    expect(() => validateOwnedAiBudgetExport(ack, owner)).toThrow(
      OwnedAiBudgetExportError,
    );
  });
  it("requires exact current source metadata before the one owned data RPC", async () => {
    const c = client();
    expect(await readOwnedAiBudgetExport(c, owner, profile)).toEqual(fixture());
    expect(c.rpc.mock.calls).toEqual([
      ["read_owned_ai_budget_export_readiness", {}],
      ["export_owned_ai_budget_records", { p_user_id: owner }],
    ]);
  });
  it.each([
    null,
    { ...profile, schemaReady: true, exportExecutable: false },
    { ...profile, schemaReady: false, exportExecutable: true },
    {
      ...profile,
      schemaReady: true,
      exportExecutable: true,
      exportSha256: "0".repeat(64),
    },
    { ...profile, schemaReady: true, exportExecutable: true, extra: true },
  ])(
    "fails malformed/staged/drifted readiness without data lookup",
    async (metadata) => {
      const c = client(fixture(), metadata);
      await expect(
        readOwnedAiBudgetExport(c, owner, profile),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(c.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps permission errors safe without empty fallback", async () => {
    const c = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "synthetic private detail" },
      })),
    };
    await expect(
      readOwnedAiBudgetExport(c, owner, profile),
    ).rejects.toMatchObject({
      message: "Owned AI budget export is unavailable.",
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("pre-aborts with zero IO and forwards mid-query cancellation", async () => {
    const first = new AbortController();
    first.abort();
    const c = client();
    await expect(
      readOwnedAiBudgetExport(c, owner, profile, { signal: first.signal }),
    ).rejects.toBeInstanceOf(OwnedAiBudgetExportError);
    expect(c.rpc).not.toHaveBeenCalled();
    let entered!: () => void;
    const entry = new Promise<void>((r) => {
      entered = r;
    });
    let signal: AbortSignal | undefined;
    const raw = new Promise<{ data: unknown; error: unknown }>(() => undefined);
    const query = Object.assign(raw, {
      abortSignal: (s: AbortSignal) => {
        signal = s;
        entered();
        return raw;
      },
    });
    const mid = {
      rpc: vi.fn((name: string) =>
        name === "read_owned_ai_budget_export_readiness"
          ? Promise.resolve({
              data: { ...profile, schemaReady: true, exportExecutable: true },
              error: null,
            })
          : query,
      ),
    };
    const control = new AbortController(),
      result = readOwnedAiBudgetExport(mid, owner, profile, {
        signal: control.signal,
      });
    await entry;
    control.abort();
    await expect(result).rejects.toBeInstanceOf(OwnedAiBudgetExportError);
    expect(signal?.aborted).toBe(true);
    expect(mid.rpc).toHaveBeenCalledTimes(2);
  });
  it("enforces absolute elapsed deadline even before a delayed timer callback", async () => {
    let now = 0;
    const c = {
      rpc: vi.fn(async () => {
        now = 6;
        return {
          data: { ...profile, schemaReady: true, exportExecutable: true },
          error: null,
        };
      }),
    };
    await expect(
      readOwnedAiBudgetExport(c, owner, profile, {
        now: () => now,
        timeoutMs: 5,
      }),
    ).rejects.toBeInstanceOf(OwnedAiBudgetExportError);
    expect(c.rpc).toHaveBeenCalledTimes(1);
    let reads = 0;
    const second = client();
    await expect(
      readOwnedAiBudgetExport(second, owner, profile, {
        timeoutMs: 5,
        now: () => (reads++ < 3 ? 0 : 6),
      }),
    ).rejects.toBeInstanceOf(OwnedAiBudgetExportError);
    expect(second.rpc).toHaveBeenCalledTimes(2);
  });
  it("times out without accepting late data and safely handles synchronous throws", async () => {
    let finish!: (x: { data: unknown; error: unknown }) => void;
    const pending = new Promise<{ data: unknown; error: unknown }>((r) => {
      finish = r;
    });
    const c = { rpc: vi.fn(() => pending) };
    await expect(
      readOwnedAiBudgetExport(c, owner, profile, { timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(OwnedAiBudgetExportError);
    finish({ data: fixture(), error: null });
    await expect(
      readOwnedAiBudgetExport(
        {
          rpc: () => {
            throw new Error("synthetic raw detail");
          },
        },
        owner,
        profile,
      ),
    ).rejects.toMatchObject({
      message: "Owned AI budget export is unavailable.",
    });
  });
});
