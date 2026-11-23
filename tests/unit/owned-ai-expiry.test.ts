import { afterEach, expect, it, vi } from "vitest";
import {
  sweepOwnedAiExpiry,
  OwnedAiExpiryError,
} from "../../app/lib/server/owned-ai-expiry";
const profile = {
  schemaVersion: "owned-ai-expiry-readiness/1.0.0" as const,
  profileVersion: "owned-ai-expiry-profile/1.0.0" as const,
  checkerSha256: "1".repeat(64),
  sweepSha256: "2".repeat(64),
  metadataSha256: "3".repeat(64),
};
const report = () => ({
  schemaVersion: "owned-ai-expiry-sweep/1.0.0" as const,
  selectedCount: 1,
  foldedCount: 1,
  blockedCount: 0,
  deadlineBreached: false,
});
it("refuses denied readiness before invoking a sweep", async () => {
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "read_owned_ai_expiry_readiness"
        ? { ...profile, schemaReady: true, foldExecutable: false }
        : report(),
    error: null,
  }));
  await expect(sweepOwnedAiExpiry({ rpc }, profile, 1)).rejects.toThrow();
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_owned_ai_expiry_readiness",
  ]);
});

// Only explicit author-private expected metadata; production CLI imports actual backend pins.
type Reply = { data: unknown; error: unknown };
const ready = () => ({ ...profile, schemaReady: true, foldExecutable: true });
function query(reply: Reply | Promise<Reply>, signals: AbortSignal[]) {
  const pending = Promise.resolve(reply);
  return Object.assign(pending, {
    abortSignal(signal: AbortSignal) {
      signals.push(signal);
      return pending;
    },
  });
}
function fixture(data: unknown = report(), metadata: unknown = ready()) {
  const signals: AbortSignal[] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    expect(Object.keys(args)).toEqual(
      name === "read_owned_ai_expiry_readiness" ? [] : ["p_limit"],
    );
    return query(
      {
        data: name === "read_owned_ai_expiry_readiness" ? metadata : data,
        error: null,
      },
      signals,
    );
  });
  return { rpc, signals };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("uses fresh exact metadata and one bounded sweep, with no identities", async () => {
  const f = fixture();
  expect(await sweepOwnedAiExpiry(f, profile, 1)).toEqual(report());
  expect(f.rpc.mock.calls).toEqual([
    ["read_owned_ai_expiry_readiness", {}],
    ["sweep_owned_ai_expiry", { p_limit: 1 }],
  ]);
  expect(f.signals).toHaveLength(2);
  expect(f.signals[0]).toBe(f.signals[1]);
  await sweepOwnedAiExpiry(f, profile, 100);
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_owned_ai_expiry_readiness",
    "sweep_owned_ai_expiry",
    "read_owned_ai_expiry_readiness",
    "sweep_owned_ai_expiry",
  ]);
});
it("accepts zero work and the maximum requested exact conserved count", async () => {
  for (const data of [
    { ...report(), selectedCount: 0, foldedCount: 0 },
    { ...report(), selectedCount: 100, foldedCount: 100 },
  ])
    expect(await sweepOwnedAiExpiry(fixture(data), profile, 100)).toEqual(data);
});
it.each([
  null,
  {},
  [],
  { ...ready(), schemaReady: false },
  { ...ready(), foldExecutable: false },
  { ...ready(), extra: true },
  ...Object.keys(profile).map((key) => ({
    ...ready(),
    [key]: key.endsWith("Sha256") ? "0".repeat(64) : "wrong",
  })),
])(
  "refuses missing/denied/mismatched metadata %# with no sweep",
  async (metadata) => {
    const f = fixture(report(), metadata);
    await expect(sweepOwnedAiExpiry(f, profile, 1)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each(Object.keys(ready()))(
  "refuses missing metadata key %s",
  async (key) => {
    const metadata: Record<string, unknown> = { ...ready() };
    Reflect.deleteProperty(metadata, key);
    const f = fixture(report(), metadata);
    await expect(sweepOwnedAiExpiry(f, profile)).rejects.toThrow(
      OwnedAiExpiryError,
    );
    expect(f.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each([0, -1, 101, 1.5, NaN, Infinity, "1", null])(
  "refuses invalid limit %j before any RPC",
  async (limit) => {
    const f = fixture();
    await expect(
      Reflect.apply(sweepOwnedAiExpiry, undefined, [f, profile, limit]),
    ).rejects.toThrow(OwnedAiExpiryError);
    expect(f.rpc).not.toHaveBeenCalled();
  },
);
it("refuses bad profile/deadline/pre-abort before any RPC", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  for (const timeoutMs of [0, 5001, 1.5, NaN])
    await expect(
      sweepOwnedAiExpiry(f, profile, 1, { timeoutMs }),
    ).rejects.toThrow();
  await expect(
    sweepOwnedAiExpiry(f, { ...profile, checkerSha256: "bad" }, 1),
  ).rejects.toThrow();
  await expect(
    sweepOwnedAiExpiry(f, profile, 1, { signal: controller.signal }),
  ).rejects.toThrow();
  expect(f.rpc).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  [],
  { ...report(), schemaVersion: "old" },
  { ...report(), selectedCount: "1" },
  { ...report(), foldedCount: null },
  { ...report(), blockedCount: false },
  { ...report(), selectedCount: -1 },
  { ...report(), selectedCount: 101 },
  { ...report(), foldedCount: 0.5 },
  { ...report(), selectedCount: Number.MAX_SAFE_INTEGER + 1 },
  { ...report(), selectedCount: 2 },
  { ...report(), deadlineBreached: "false" },
  { ...report(), ownerId: "PRIVATE_ID" },
  { ...report(), selectedCount: 2, foldedCount: 2 },
])(
  "refuses malformed/incomplete/nonconserved/over-limit sweep %# without retry",
  async (data) => {
    const f = fixture(data);
    await expect(sweepOwnedAiExpiry(f, profile, 1)).rejects.toMatchObject({
      code: "unavailable",
      report: undefined,
    });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      "read_owned_ai_expiry_readiness",
      "sweep_owned_ai_expiry",
    ]);
  },
);
it.each(Object.keys(report()))("refuses missing sweep key %s", async (key) => {
  const data: Record<string, unknown> = { ...report() };
  Reflect.deleteProperty(data, key);
  await expect(sweepOwnedAiExpiry(fixture(data), profile, 1)).rejects.toThrow();
});
it.each([
  { ...report(), selectedCount: 1, foldedCount: 0, blockedCount: 1 },
  { ...report(), deadlineBreached: true },
  {
    ...report(),
    selectedCount: 2,
    foldedCount: 1,
    blockedCount: 1,
    deadlineBreached: true,
  },
])(
  "reports blocked or already-overdue folded work as incomplete, never success %#",
  async (data) => {
    const f = fixture(data);
    const error = await sweepOwnedAiExpiry(f, profile, 2).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(OwnedAiExpiryError);
    expect(error).toMatchObject({ code: "incomplete", report: data });
    expect(Object.keys(error.report)).toEqual(Object.keys(report()));
    expect(f.rpc).toHaveBeenCalledTimes(2);
  },
);
it("rejects accessor/symbol/nested payloads without invoking a getter", async () => {
  const getter = vi.fn(() => "PRIVATE_DETAIL"),
    metadata = ready();
  Object.defineProperty(metadata, "checkerSha256", {
    get: getter,
    enumerable: true,
  });
  const f = fixture(report(), metadata);
  await expect(sweepOwnedAiExpiry(f, profile)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledTimes(1);
  for (const data of [
    { ...report(), [Symbol("hidden")]: true },
    { ...report(), selectedCount: { owner: "PRIVATE_ID" } },
  ])
    await expect(sweepOwnedAiExpiry(fixture(data), profile)).rejects.toThrow();
});
it.each(["read_owned_ai_expiry_readiness", "sweep_owned_ai_expiry"])(
  "sanitizes denied/missing/throwing %s and never retries uncertainty",
  async (method) => {
    for (const failure of [
      null,
      { data: report(), error: { message: "PRIVATE_COMMIT_DETAIL" } },
      Error("PRIVATE_COMMIT_DETAIL"),
    ]) {
      const f = fixture(),
        original = f.rpc.getMockImplementation()!;
      f.rpc.mockImplementation((name, args) => {
        if (name !== method) return original(name, args);
        if (failure instanceof Error) throw failure;
        return query(failure as Reply, f.signals);
      });
      const error = await sweepOwnedAiExpiry(f, profile, 1).catch(
        (error) => error,
      );
      expect(error).toBeInstanceOf(OwnedAiExpiryError);
      expect(error.message).not.toContain("PRIVATE");
      expect(error.report).toBeUndefined();
      expect(f.rpc.mock.calls.filter(([name]) => name === method)).toHaveLength(
        1,
      );
    }
  },
);
it.each(["read_owned_ai_expiry_readiness", "sweep_owned_ai_expiry"])(
  "bounds a hung %s and forwards abort with no retry",
  async (method) => {
    vi.useFakeTimers();
    const f = fixture(),
      original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation((name, args) =>
      name === method
        ? query(new Promise<Reply>(() => {}), f.signals)
        : original(name, args),
    );
    const result = sweepOwnedAiExpiry(f, profile, 1, { timeoutMs: 20 }).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toMatchObject({
      code: "unavailable",
      report: undefined,
    });
    expect(f.signals.every((signal) => signal.aborted)).toBe(true);
    expect(f.rpc.mock.calls.filter(([name]) => name === method)).toHaveLength(
      1,
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("shares the elapsed metadata+sweep deadline and refuses an ignored late commit response", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.rpc.mockImplementation((name) =>
    query(
      new Promise<Reply>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data:
                name === "read_owned_ai_expiry_readiness" ? ready() : report(),
              error: null,
            }),
          15,
        ),
      ),
      f.signals,
    ),
  );
  const result = sweepOwnedAiExpiry(f, profile, 1, { timeoutMs: 20 }).catch(
    (error) => error,
  );
  await vi.advanceTimersByTimeAsync(20);
  expect(await result).toMatchObject({
    code: "unavailable",
    report: undefined,
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(f.rpc).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("honors in-flight cancellation while the sweep ignores abort, then never retries", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    controller = new AbortController(),
    original = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation((name, args) =>
    name === "sweep_owned_ai_expiry"
      ? query(
          new Promise<Reply>((resolve) =>
            setTimeout(() => resolve({ data: report(), error: null }), 30),
          ),
          f.signals,
        )
      : original(name, args),
  );
  const result = sweepOwnedAiExpiry(f, profile, 1, {
    timeoutMs: 50,
    signal: controller.signal,
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect(await result).toMatchObject({
    code: "unavailable",
    report: undefined,
  });
  await vi.advanceTimersByTimeAsync(50);
  expect(f.rpc).toHaveBeenCalledTimes(2);
  expect(f.signals.every((signal) => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("never treats a typed transport exception as an authoritative count receipt", async () => {
  const f = fixture(),
    original = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation((name, args) => {
    if (name === "sweep_owned_ai_expiry")
      throw new OwnedAiExpiryError("incomplete", {
        ...report(),
        deadlineBreached: true,
      });
    return original(name, args);
  });
  await expect(sweepOwnedAiExpiry(f, profile, 1)).rejects.toMatchObject({
    code: "unavailable",
    report: undefined,
  });
  expect(f.rpc).toHaveBeenCalledTimes(2);
});
