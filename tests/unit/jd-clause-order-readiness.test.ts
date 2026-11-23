import { afterEach, expect, it, vi } from "vitest";
import { JD_CLAUSE_ORDER_READINESS_PROFILE } from "../../app/lib/server/jd-clause-order-readiness-profile";
import {
  assertJdClauseOrderReady,
  JdClauseOrderReadinessSchema,
} from "../../app/lib/server/jd-clause-order-readiness";
import { TypedAuthoringError } from "../../app/lib/server/typed-authoring-contract";
const ready = () => ({
  ...JD_CLAUSE_ORDER_READINESS_PROFILE,
  schemaReady: true,
  writerExecutable: true,
});
const clientFor = (data: unknown, error: unknown = null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("admits exactly the trusted real source profile through one zero-argument metadata RPC", async () => {
  const client = clientFor(ready());
  expect(await assertJdClauseOrderReady(client)).toEqual(ready());
  expect(JdClauseOrderReadinessSchema.parse(ready())).toEqual(ready());
  expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
    "read_jd_clause_order_readiness",
    {},
  );
});
it("admits the exact regroup checker only with the writer available", async () => {
  const current = {
    ...ready(),
    checkerSha256:
      "c915c4c4b8353a1846aa83feed6ef9a1a3afa87ddb106b262980304fcecbc0d7",
  };
  await expect(assertJdClauseOrderReady(clientFor(current))).resolves.toEqual(
    current,
  );
  await expect(
    assertJdClauseOrderReady(
      clientFor({ ...current, writerExecutable: false }),
    ),
  ).rejects.toMatchObject({ reason: "unavailable" });
});
it.each([
  "schemaVersion",
  "profileVersion",
  "checkerSha256",
  "writerSha256",
  "metadataSha256",
])(
  "denies changed %s even when both capability flags are true",
  async (field) => {
    await expect(
      assertJdClauseOrderReady(
        clientFor({ ...ready(), [field]: "f".repeat(64) }),
      ),
    ).rejects.toEqual(new TypedAuthoringError("unavailable"));
  },
);
it.each([
  { schemaReady: false, writerExecutable: false },
  { schemaReady: false, writerExecutable: true },
  { schemaReady: true, writerExecutable: false },
])(
  "keeps source integrity and effective EXECUTE independently required %j",
  async (flags) => {
    await expect(
      assertJdClauseOrderReady(clientFor({ ...ready(), ...flags })),
    ).rejects.toMatchObject({ reason: "unavailable" });
  },
);
it.each([
  null,
  [],
  { ...ready(), extra: true },
  { ...ready(), schemaReady: "true" },
  { ...ready(), writerExecutable: 1 },
  { ...ready(), checkerSha256: "F".repeat(64) },
  { ...ready(), writerSha256: "a".repeat(100000) },
  { ...ready(), metadataSha256: null },
])("denies malformed bounded metadata %#", async (data) => {
  await expect(assertJdClauseOrderReady(clientFor(data))).rejects.toMatchObject(
    { reason: "unavailable" },
  );
});
it("refuses missing keys, RPC errors, absent transport and exceptions without leaking response text", async () => {
  const { checkerSha256: omitted, ...data } = ready();
  expect(omitted).toBe(JD_CLAUSE_ORDER_READINESS_PROFILE.checkerSha256);
  for (const client of [
    clientFor(data),
    clientFor(ready(), { message: "SYNTHETIC_PRIVATE_RESPONSE" }),
    {},
    {
      rpc: vi.fn(() => {
        throw Error("SYNTHETIC_PRIVATE_RESPONSE");
      }),
    },
  ])
    await expect(assertJdClauseOrderReady(client)).rejects.toEqual(
      new TypedAuthoringError("unavailable"),
    );
});
it("denies invalid options before RPC", async () => {
  const client = clientFor(ready());
  await expect(
    assertJdClauseOrderReady(client, { timeoutMs: 0 }),
  ).rejects.toMatchObject({ reason: "unavailable" });
  expect(client.rpc).not.toHaveBeenCalled();
});
it("does no work for a signal already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = clientFor(ready());
  await expect(
    assertJdClauseOrderReady(client, { signal: controller.signal }),
  ).rejects.toMatchObject({ reason: "unavailable" });
  expect(client.rpc).not.toHaveBeenCalled();
});
it("cancels a hanging SDK request at the finite deadline", async () => {
  vi.useFakeTimers();
  let sdkSignal: AbortSignal | undefined;
  const client = {
    rpc: vi.fn(() => ({
      then: () => new Promise<never>(() => {}),
      abortSignal: (signal: AbortSignal) => {
        sdkSignal = signal;
        return new Promise<never>(() => {});
      },
    })),
  };
  const work = assertJdClauseOrderReady(client, { timeoutMs: 20 });
  const outcome = expect(work).rejects.toMatchObject({ reason: "unavailable" });
  await vi.advanceTimersByTimeAsync(20);
  await outcome;
  expect(sdkSignal?.aborted).toBe(true);
  expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("forwards caller abort to SDK without retrying", async () => {
  const controller = new AbortController();
  let sdkSignal: AbortSignal | undefined;
  const client = {
    rpc: vi.fn(() => ({
      then: () => new Promise<never>(() => {}),
      abortSignal: (signal: AbortSignal) => {
        sdkSignal = signal;
        return new Promise<never>(() => {});
      },
    })),
  };
  const work = assertJdClauseOrderReady(client, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await expect(work).rejects.toMatchObject({ reason: "unavailable" });
  expect(sdkSignal?.aborted).toBe(true);
  expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("refuses a response that crosses the deadline before its timer can run", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const client = {
    rpc: vi.fn(async () => {
      now = 21;
      return { data: ready(), error: null };
    }),
  };
  await expect(
    assertJdClauseOrderReady(client, { timeoutMs: 20 }),
  ).rejects.toMatchObject({ reason: "unavailable" });
});
