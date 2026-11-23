import { afterEach, expect, it, vi } from "vitest";
import {
  readOwnedLegacyAiUsageExport,
  validateOwnedLegacyAiUsageExport,
  OwnedLegacyAiUsageExportError,
  ownedLegacyAiUsageMicros,
} from "../../app/lib/server/owned-legacy-ai-usage-export";
const id = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1);
// Explicit private expected fixture; production callers import actual backend pins.
const profile = {
  schemaVersion: "owned-legacy-ai-usage-readiness/1.0.0" as const,
  profileVersion: "owned-legacy-ai-usage-profile/1.0.0" as const,
  checkerSha256: "1".repeat(64),
  captureSha256: "2".repeat(64),
  exportSha256: "3".repeat(64),
  metadataSha256: "4".repeat(64),
};
const ready = () => ({ ...profile, schemaReady: true, exportExecutable: true });
function row(n = 10) {
  return {
    runId: id(n),
    ownerId: owner,
    organizationId: id(2),
    analysisId: id(3),
    resumeId: id(4),
    resumeVersionId: id(5),
    runCreatedAt: "2026-09-30T23:59:59.999999Z",
    originalMonth: "2026-09-01",
    inputTokens: "7",
    outputTokens: "11",
    classification: "legacy_unlinked" as const,
    firstCause: "resume_retirement" as const,
    deletionRequestId: null,
    retentionItemId: id(6),
    preparedAt: "2026-10-01T00:00:00.123456Z",
    expiresAt: "2026-10-31T00:00:00.123456Z",
    effectiveExpiresAt: "2026-10-31T00:00:00.123456Z",
  };
}
const envelope = () => ({
  schemaVersion: "owned-legacy-ai-usage-export/1.0.0",
  ownerId: owner,
  records: [row()],
});
type Reply = { data: unknown; error: unknown };
function query(raw: Reply | Promise<Reply>, signals: AbortSignal[]) {
  const pending = Promise.resolve(raw);
  return Object.assign(pending, {
    abortSignal(signal: AbortSignal): Promise<Reply> {
      signals.push(signal);
      return pending;
    },
  });
}
function db(data: unknown = envelope(), metadata: unknown = ready()) {
  const signals: AbortSignal[] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    expect(args).toEqual(
      name === "read_owned_legacy_ai_usage_readiness"
        ? {}
        : { p_user_id: owner },
    );
    return query(
      {
        data: name === "read_owned_legacy_ai_usage_readiness" ? metadata : data,
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
it("reads exact private-independent metadata and complete owner data once", async () => {
  const data = {
    ...envelope(),
    records: [
      row(),
      { ...row(11), organizationId: id(20), classification: "a12_linked" },
      {
        ...row(12),
        classification: "a13_linked",
        runCreatedAt: "2026-01-01T00:00:00.000000Z",
        originalMonth: "2026-01-01",
      },
    ],
  };
  const client = db(data);
  expect(await readOwnedLegacyAiUsageExport(client, owner, profile)).toEqual(
    data,
  );
  expect(client.rpc.mock.calls).toEqual([
    ["read_owned_legacy_ai_usage_readiness", {}],
    ["export_owned_legacy_ai_usage_records", { p_user_id: owner }],
  ]);
  expect(client.signals).toHaveLength(2);
  expect(client.signals[0]).toBe(client.signals[1]);
  expect(
    validateOwnedLegacyAiUsageExport({ ...envelope(), records: [] }, owner)
      .records,
  ).toEqual([]);
});
it("accepts both real cause shapes, max counters and exact microseconds without due-row filtering", () => {
  const data = {
    ...envelope(),
    records: [
      {
        ...row(),
        firstCause: "account_preparation",
        deletionRequestId: id(30),
        retentionItemId: null,
        inputTokens: "2147483647",
        outputTokens: "0",
      },
    ],
  };
  expect(validateOwnedLegacyAiUsageExport(data, owner)).toEqual(data);
  expect(
    ownedLegacyAiUsageMicros(row().expiresAt) -
      ownedLegacyAiUsageMicros(row().preparedAt),
  ).toBe(720n * 3600n * 1000000n);
  expect(
    ownedLegacyAiUsageMicros("2026-10-31T00:00:00.123456Z") -
      ownedLegacyAiUsageMicros("2026-10-31T00:00:00.123455Z"),
  ).toBe(1n);
  expect(ownedLegacyAiUsageMicros("2026-10-31T00:00:00Z")).toBe(
    ownedLegacyAiUsageMicros("2026-10-31T00:00:00.000000Z"),
  );
});
it.each([
  null,
  {},
  { ...ready(), schemaReady: false },
  { ...ready(), exportExecutable: false },
  { ...ready(), captureExecutable: true },
  ...Object.keys(profile).map((key) => ({
    ...ready(),
    [key]: key.endsWith("Sha256") ? "0".repeat(64) : "wrong",
  })),
])(
  "refuses malformed or denied current metadata %# without data fallback",
  async (metadata) => {
    const client = db(envelope(), metadata);
    await expect(
      readOwnedLegacyAiUsageExport(client, owner, profile),
    ).rejects.toEqual(new OwnedLegacyAiUsageExportError());
    expect(client.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each(Object.keys(row()))("rejects missing record key %s", (key) => {
  const value: Record<string, unknown> = { ...row() };
  Reflect.deleteProperty(value, key);
  expect(() =>
    validateOwnedLegacyAiUsageExport(
      { ...envelope(), records: [value] },
      owner,
    ),
  ).toThrow(OwnedLegacyAiUsageExportError);
});
it.each([
  { ownerId: id(99) },
  { runId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
  { inputTokens: null },
  { inputTokens: 7 },
  { inputTokens: "-1" },
  { inputTokens: "01" },
  { inputTokens: "1e2" },
  { inputTokens: "1.5" },
  { inputTokens: "2147483648" },
  { outputTokens: "2147483648" },
  { runCreatedAt: "2026-09-30T23:59:59.999Z" },
  { runCreatedAt: "2026-09-30T23:59:59.999999+00:00" },
  { runCreatedAt: "2026-02-30T00:00:00.000000Z" },
  { originalMonth: "2026-10-01" },
  { originalMonth: "2026-09-02" },
  { classification: "unknown" },
  { firstCause: "account_preparation" },
  { retentionItemId: null },
  { deletionRequestId: id(50) },
  { firstCause: "unknown" },
  { expiresAt: "2026-10-31T00:00:00.123455Z" },
  { preparedAt: "2026-10-01T00:00:00.123457Z" },
  { effectiveExpiresAt: "2026-10-31T00:00:00.123457Z" },
  { effectiveExpiresAt: "2026-10-31T00:00:00.123Z" },
  { extra: true },
])("refuses invalid counter/month/cause/clock or row shape %#", (patch) =>
  expect(() =>
    validateOwnedLegacyAiUsageExport(
      { ...envelope(), records: [{ ...row(), ...patch }] },
      owner,
    ),
  ).toThrow(OwnedLegacyAiUsageExportError),
);
it("refuses wrong owner/envelope/duplicates and whole-export limits without truncation", () => {
  for (const data of [
    { ...envelope(), ownerId: id(99) },
    { ...envelope(), schemaVersion: "old" },
    { ...envelope(), extra: true },
    { ...envelope(), records: [row(), row()] },
    {
      ...envelope(),
      records: Array.from({ length: 4097 }, (_, i) => row(i + 100)),
    },
    { ...envelope(), extra: "x".repeat(33554433) },
  ])
    expect(() => validateOwnedLegacyAiUsageExport(data, owner)).toThrow(
      OwnedLegacyAiUsageExportError,
    );
  expect(
    validateOwnedLegacyAiUsageExport(
      {
        ...envelope(),
        records: Array.from({ length: 4096 }, (_, i) => row(i + 100)),
      },
      owner,
    ).records,
  ).toHaveLength(4096);
  const getter = vi.fn(() => row()),
    data = envelope();
  Object.defineProperty(data.records, "0", { get: getter, enumerable: true });
  expect(() => validateOwnedLegacyAiUsageExport(data, owner)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it("rejects bad owner/profile/deadline and pre-cancellation before RPC", async () => {
  const client = db(),
    controller = new AbortController();
  controller.abort();
  await expect(
    readOwnedLegacyAiUsageExport(client, id(99).toUpperCase(), profile),
  ).rejects.toThrow();
  await expect(
    readOwnedLegacyAiUsageExport(client, owner, {
      ...profile,
      captureSha256: "bad",
    }),
  ).rejects.toThrow();
  for (const timeoutMs of [0, 5001, NaN, 1.5])
    await expect(
      readOwnedLegacyAiUsageExport(client, owner, profile, { timeoutMs }),
    ).rejects.toThrow();
  await expect(
    readOwnedLegacyAiUsageExport(client, owner, profile, {
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(client.rpc).not.toHaveBeenCalled();
});
it.each([
  "read_owned_legacy_ai_usage_readiness",
  "export_owned_legacy_ai_usage_records",
])("sanitizes missing/denied/throwing %s replies", async (method) => {
  for (const failure of [
    null,
    { data: null, error: { message: "PRIVATE_DETAIL" } },
    Error("PRIVATE_DETAIL"),
  ]) {
    const client = db(),
      original = client.rpc.getMockImplementation()!;
    client.rpc.mockImplementation((name, args) => {
      if (name !== method) return original(name, args);
      if (failure instanceof Error) throw failure;
      return query(failure as Reply, client.signals);
    });
    await expect(
      readOwnedLegacyAiUsageExport(client, owner, profile),
    ).rejects.toEqual(new OwnedLegacyAiUsageExportError());
  }
});
it.each([
  "read_owned_legacy_ai_usage_readiness",
  "export_owned_legacy_ai_usage_records",
])("bounds hung %s with abort and no late publication", async (method) => {
  vi.useFakeTimers();
  const client = db(),
    original = client.rpc.getMockImplementation()!;
  client.rpc.mockImplementation((name, args) =>
    name !== method
      ? original(name, args)
      : query(new Promise<Reply>(() => {}), client.signals),
  );
  const result = readOwnedLegacyAiUsageExport(client, owner, profile, {
    timeoutMs: 20,
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(20);
  expect(await result).toEqual(new OwnedLegacyAiUsageExportError());
  expect(client.signals.every((signal) => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("shares one elapsed deadline and observes cancellation even when the RPC ignores it", async () => {
  vi.useFakeTimers();
  const client = db(),
    controller = new AbortController();
  client.rpc.mockImplementation((name) =>
    query(
      new Promise<Reply>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data:
                name === "read_owned_legacy_ai_usage_readiness"
                  ? ready()
                  : envelope(),
              error: null,
            }),
          15,
        ),
      ),
      client.signals,
    ),
  );
  const result = readOwnedLegacyAiUsageExport(client, owner, profile, {
    timeoutMs: 20,
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(20);
  expect(await result).toEqual(new OwnedLegacyAiUsageExportError());
  await vi.advanceTimersByTimeAsync(20);
  expect(client.rpc).toHaveBeenCalledTimes(2);
  client.rpc.mockClear();
  const pending = readOwnedLegacyAiUsageExport(client, owner, profile, {
    signal: controller.signal,
    timeoutMs: 20,
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect(await pending).toEqual(new OwnedLegacyAiUsageExportError());
  await vi.advanceTimersByTimeAsync(30);
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves a late run's original month without extending its prior preparation clock", () => {
  const record = {
    ...row(),
    runCreatedAt: "2026-10-02T00:00:00.000001Z",
    originalMonth: "2026-10-01",
  };
  expect(
    validateOwnedLegacyAiUsageExport(
      { ...envelope(), records: [record] },
      owner,
    ).records,
  ).toEqual([record]);
  expect(record.expiresAt).toBe("2026-10-31T00:00:00.123456Z");
});
