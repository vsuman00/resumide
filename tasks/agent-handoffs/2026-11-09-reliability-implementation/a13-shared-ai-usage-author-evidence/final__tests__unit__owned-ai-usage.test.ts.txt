import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readOwnedAiUsage,
  OwnedAiUsageError,
  type OwnedAiUsage,
} from "../../app/lib/server/owned-ai-usage";

// Decoder/transport vectors only. This injected source pin is not Native proof.
const expected = {
  profileVersion: "initial-feedback-readiness-profile/1.0.0" as const,
  usageSha256: "a".repeat(64),
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { ownerId: id(1), organizationId: id(2), analysisId: id(3) };
const at = Date.UTC(2026, 10, 15);
const reply = (patch: Record<string, unknown> = {}): OwnedAiUsage =>
  ({
    schemaVersion: "initial-feedback-usage/1.0.0",
    ...expected,
    ...binding,
    periodStart: "2026-11-01",
    periodEnd: "2026-12-01",
    legacyUnlinkedTokens: "7",
    canonicalTokens: "11",
    initialFeedbackTokens: "13",
    totalTokens: "31",
    unknownClaims: "0",
    ...patch,
  }) as OwnedAiUsage;
const fixture = (data: unknown = reply(), error: unknown = null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});
const options = { now: () => at };
afterEach(() => vi.useRealTimers());

describe("actual shared owned usage helper (fake RPC only)", () => {
  it("reads the exact owned RPC once and retains all three disjoint components", async () => {
    const c = fixture(),
      result = await readOwnedAiUsage(c, binding, expected, options);
    expect(result).toEqual(reply());
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith(
      "read_initial_feedback_usage",
      { p_user_id: binding.ownerId, p_analysis_id: binding.analysisId },
    );
  });
  it("preserves zero and aggregate integers above Number safe precision without coercion", async () => {
    for (const value of [
      reply({
        legacyUnlinkedTokens: "0",
        canonicalTokens: "0",
        initialFeedbackTokens: "0",
        totalTokens: "0",
      }),
      reply({
        legacyUnlinkedTokens: "9007199254740993",
        totalTokens: "9007199254741017",
      }),
    ])
      expect(
        await readOwnedAiUsage(fixture(value), binding, expected, options),
      ).toEqual(value);
  });
  it.each([
    ["number", { canonicalTokens: 11 }],
    ["null", { initialFeedbackTokens: null }],
    ["leading zero", { canonicalTokens: "011" }],
    ["negative", { canonicalTokens: "-1" }],
    ["fraction", { canonicalTokens: "1.0" }],
    ["exponent", { canonicalTokens: "1e2" }],
    ["oversized", { canonicalTokens: "1".repeat(129) }],
    ["extra key", { grounded: true }],
    ["owner", { ownerId: id(4) }],
    ["org", { organizationId: id(4) }],
    ["analysis", { analysisId: id(4) }],
    ["uppercase UUID", { ownerId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["pin", { usageSha256: "b".repeat(64) }],
    [
      "old profile",
      { profileVersion: "canonical-rewrite-readiness-profile/1.0.1" },
    ],
    ["sum", { totalTokens: "30" }],
    ["nonadjacent month", { periodEnd: "2027-01-01" }],
    ["prior month", { periodStart: "2026-10-01", periodEnd: "2026-11-01" }],
  ])("refuses %s metadata without fallback", async (_label, patch) => {
    const c = fixture(reply(patch));
    await expect(
      readOwnedAiUsage(c, binding, expected, options),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("reports claimed unknown usage as a hold rather than zero or capacity", async () => {
    await expect(
      readOwnedAiUsage(
        fixture(reply({ unknownClaims: "1" })),
        binding,
        expected,
        options,
      ),
    ).rejects.toMatchObject({ code: "unknown_usage" });
  });
  it("refuses malformed bindings and expected pins before RPC", async () => {
    for (const [b, p, t] of [
      [
        { ...binding, ownerId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
        expected,
        5000,
      ],
      [binding, { ...expected, usageSha256: "bad" }, 5000],
      [binding, expected, 0],
    ] as const) {
      const c = fixture();
      await expect(
        readOwnedAiUsage(c, b, p, { ...options, timeoutMs: t }),
      ).rejects.toBeInstanceOf(OwnedAiUsageError);
      expect(c.rpc).not.toHaveBeenCalled();
    }
  });
  it("sanitizes actual RPC errors and missing data", async () => {
    for (const c of [
      fixture(null),
      fixture(reply(), { message: "synthetic private detail" }),
      {
        rpc: vi.fn(() => {
          throw new Error("synthetic private detail");
        }),
      },
    ]) {
      await expect(
        readOwnedAiUsage(c, binding, expected, options),
      ).rejects.toMatchObject({
        code: "unavailable",
        message: "AI usage is unavailable.",
      });
    }
  });
  it("refuses absolute elapsed deadline even before timer delivery", async () => {
    const now = vi
      .fn()
      .mockReturnValueOnce(at)
      .mockReturnValueOnce(at + 50);
    await expect(
      readOwnedAiUsage(fixture(), binding, expected, { timeoutMs: 50, now }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("refuses reversed clocks and UTC month crossings at completion", async () => {
    for (const times of [
      [at, at - 1],
      [Date.UTC(2026, 10, 30, 23, 59, 59, 999), Date.UTC(2026, 11, 1)],
    ]) {
      const now = vi
        .fn()
        .mockReturnValueOnce(times[0])
        .mockReturnValueOnce(times[1]);
      await expect(
        readOwnedAiUsage(fixture(), binding, expected, { now }),
      ).rejects.toMatchObject({ code: "unavailable" });
    }
  });
  it("handles actual calendar year rollover without day approximations", async () => {
    const value = reply({ periodStart: "2026-12-01", periodEnd: "2027-01-01" });
    expect(
      await readOwnedAiUsage(fixture(value), binding, expected, {
        now: () => Date.UTC(2026, 11, 31),
      }),
    ).toEqual(value);
  });
  it("pre-aborts before IO and passes a linked abort signal for cancellation", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const no = fixture();
    await expect(
      readOwnedAiUsage(no, binding, expected, {
        ...options,
        signal: aborted.signal,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(no.rpc).not.toHaveBeenCalled();
    let observed: AbortSignal | undefined;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = Object.assign(
      new Promise<{ data: unknown; error: unknown }>(() => {}),
      {
        abortSignal: (s: AbortSignal) => {
          observed = s;
          entered();
          return pending;
        },
      },
    );
    const c = { rpc: vi.fn(() => pending) },
      controller = new AbortController();
    const result = readOwnedAiUsage(c, binding, expected, {
      ...options,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    await started;
    expect(c.rpc).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(await result).toMatchObject({ code: "unavailable" });
    expect(observed?.aborted).toBe(true);
  });
  it("times out a pending real RPC shape and ignores late completion", async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined,
      resolve!: (v: { data: unknown; error: unknown }) => void;
    const pending = Object.assign(
      new Promise<{ data: unknown; error: unknown }>((r) => {
        resolve = r;
      }),
      {
        abortSignal: (s: AbortSignal) => {
          observed = s;
          return pending;
        },
      },
    );
    const result = readOwnedAiUsage({ rpc: () => pending }, binding, expected, {
      ...options,
      timeoutMs: 10,
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: "unavailable" });
    expect(observed?.aborted).toBe(true);
    resolve({ data: reply(), error: null });
    await Promise.resolve();
    expect(await result).toBeInstanceOf(OwnedAiUsageError);
  });
});
