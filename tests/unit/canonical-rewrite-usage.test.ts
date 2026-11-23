import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_REWRITE_READINESS_PROFILE as profile } from "../../app/lib/server/canonical-rewrite-readiness-profile";
import {
  readCanonicalRewriteUsage,
  type CanonicalRewriteUsage,
} from "../../app/lib/server/canonical-rewrite-usage";

const owned = {
  ownerId: "60000000-0000-4000-8000-000000000001",
  organizationId: "60000000-0000-4000-8000-000000000002",
  analysisId: "60000000-0000-4000-8000-000000000003",
};
const now = Date.UTC(2026, 10, 15, 12);
const options = { now: () => now };
function response(
  overrides: Record<string, unknown> = {},
): CanonicalRewriteUsage {
  return {
    schemaVersion: "canonical-rewrite-usage/1.0.0",
    profileVersion: profile.profileVersion,
    usageSha256: profile.usageSha256,
    ...owned,
    periodStart: "2026-11-01",
    periodEnd: "2026-12-01",
    legacyTokens: "10",
    canonicalTokens: "12",
    totalTokens: "22",
    unknownClaims: "0",
    ...overrides,
  } as CanonicalRewriteUsage;
}
function client(data: unknown = response(), error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) };
}
afterEach(() => vi.useRealTimers());

describe("owned canonical rewrite monthly usage reader", () => {
  it("requests only the owned native reader and retains both exact components", async () => {
    const c = client();
    expect(await readCanonicalRewriteUsage(c, owned, options)).toEqual(
      response(),
    );
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith(
      "read_canonical_rewrite_usage",
      { p_user_id: owned.ownerId, p_analysis_id: owned.analysisId },
    );
  });
  it("retains canonical spend when the legacy component is zero", async () => {
    const c = client(
      response({
        legacyTokens: "0",
        canonicalTokens: "100000",
        totalTokens: "100000",
      }),
    );
    expect(
      (await readCanonicalRewriteUsage(c, owned, options)).totalTokens,
    ).toBe("100000");
  });
  it("compares components without lossy Number rounding", async () => {
    const value = response({
      legacyTokens: "9007199254740993",
      canonicalTokens: "12",
      totalTokens: "9007199254741005",
    });
    expect(
      await readCanonicalRewriteUsage(client(value), owned, options),
    ).toEqual(value);
    await expect(
      readCanonicalRewriteUsage(
        client({ ...value, totalTokens: "9007199254741004" }),
        owned,
        options,
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });
  it("blocks claimed unknown usage rather than inventing zero or retry permission", async () => {
    await expect(
      readCanonicalRewriteUsage(
        client(response({ unknownClaims: "1" })),
        owned,
        options,
      ),
    ).rejects.toMatchObject({
      reason: "unavailable",
      recovery: "review_again",
    });
  });
  it.each(["ownerId", "organizationId", "analysisId"])(
    "rejects foreign %s in the returned binding",
    async (key) => {
      await expect(
        readCanonicalRewriteUsage(
          client(response({ [key]: "60000000-0000-4000-8000-000000000099" })),
          owned,
          options,
        ),
      ).rejects.toMatchObject({ reason: "unavailable" });
    },
  );
  it.each([null, false, "", " ", "-1", "1.5", "01", "1e3"])(
    "rejects malformed counter %s",
    async (value) => {
      await expect(
        readCanonicalRewriteUsage(
          client(response({ legacyTokens: value })),
          owned,
          options,
        ),
      ).rejects.toMatchObject({ reason: "unavailable" });
    },
  );
  it("rejects counter overflow of the explicit decimal resource bound", async () => {
    await expect(
      readCanonicalRewriteUsage(
        client(response({ unknownClaims: "1".repeat(129) })),
        owned,
        options,
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });
  it.each([
    { schemaVersion: "canonical-rewrite-usage/2.0.0" },
    { profileVersion: "canonical-rewrite-readiness-profile/1.0.0" },
    { usageSha256: "a".repeat(64) },
    { unrecognized: true },
  ])(
    "rejects incompatible schema/profile or extra fields %j",
    async (extra) => {
      await expect(
        readCanonicalRewriteUsage(client(response(extra)), owned, options),
      ).rejects.toMatchObject({ reason: "unavailable" });
    },
  );
  it.each([
    { periodStart: "2026-10-01", periodEnd: "2026-11-01" },
    { periodEnd: "2027-01-01" },
    { periodStart: "2026-11-02" },
  ])("rejects stale or invalid month boundaries %j", async (value) => {
    await expect(
      readCanonicalRewriteUsage(client(response(value)), owned, options),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });
  it.each([
    [Date.UTC(2026, 11, 15), "2026-12-01", "2027-01-01"],
    [Date.UTC(2028, 1, 29), "2028-02-01", "2028-03-01"],
  ] as const)(
    "accepts the actual Gregorian current month at %s",
    async (time, periodStart, periodEnd) => {
      const value = response({ periodStart, periodEnd });
      expect(
        await readCanonicalRewriteUsage(client(value), owned, {
          now: () => time,
        }),
      ).toEqual(value);
    },
  );
  it("rejects a current reply when the request itself crossed UTC month", async () => {
    const clock = vi
      .fn()
      .mockReturnValueOnce(Date.UTC(2026, 10, 30, 23, 59, 59, 999))
      .mockReturnValueOnce(Date.UTC(2026, 11, 1));
    await expect(
      readCanonicalRewriteUsage(
        client(
          response({ periodStart: "2026-12-01", periodEnd: "2027-01-01" }),
        ),
        owned,
        { now: clock },
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });
  it("rejects same-month elapsed deadline even before the timer callback runs", async () => {
    const clock = vi
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 5000);
    await expect(
      readCanonicalRewriteUsage(client(), owned, {
        now: clock,
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });
  it("does not fall back or reflect a raw RPC error", async () => {
    const c = client(null, {
      code: "42501",
      message: "SYNTHETIC_PRIVATE_CANARY",
    });
    const failure = await readCanonicalRewriteUsage(c, owned, options).catch(
      (error) => error,
    );
    expect(failure).toMatchObject({ reason: "unavailable" });
    expect(String(failure) + JSON.stringify(failure)).not.toContain(
      "SYNTHETIC_PRIVATE_CANARY",
    );
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid caller identity before RPC", async () => {
    const c = client();
    await expect(
      readCanonicalRewriteUsage(
        c,
        { ...owned, analysisId: "invalid" },
        options,
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("does not dispatch the reader for an already-aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();
    const c = client();
    await expect(
      readCanonicalRewriteUsage(c, owned, {
        ...options,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("bounds an unresponsive read and forwards its owned abort signal", async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined;
    const pendingResponse = new Promise<{ data: unknown; error: unknown }>(
      () => {},
    );
    const pending = Object.assign(pendingResponse, {
      abortSignal(signal: AbortSignal) {
        observed = signal;
        return pendingResponse;
      },
    });
    const c = { rpc: vi.fn(() => pending) };
    const outcome = readCanonicalRewriteUsage(c, owned, {
      ...options,
      timeoutMs: 5,
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(6);
    expect(await outcome).toMatchObject({ reason: "unavailable" });
    expect(observed?.aborted).toBe(true);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});
