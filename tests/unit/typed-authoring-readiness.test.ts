import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { TypedAuthoringError } from "../../app/lib/server/typed-authoring-contract";
import { TYPED_AUTHORING_REGROUP_READINESS_PROFILE } from "../../app/lib/server/typed-authoring-readiness-profile";
import {
  assertTypedAuthoringReady,
  TypedAuthoringReadinessSchema,
  type TypedAuthoringReadinessClient,
} from "../../app/lib/server/typed-authoring-readiness";

// Explicit fake-catalog vectors, not production source or catalog authority.
const syntheticProfile = {
  schemaVersion: "typed-authoring-readiness/1.0.0",
  profileVersion: "typed-authoring-readiness-profile/1.0.0",
  canonicalReadinessSha256: "a".repeat(64),
  typedReadinessSha256: "b".repeat(64),
  writerSha256: "c".repeat(64),
  readerSha256: "d".repeat(64),
};
const ready = () => ({
  ...syntheticProfile,
  schemaReady: true,
  writerExecutable: true,
});
const clientFor = (data: unknown, error: unknown = null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});
const unavailable = new TypedAuthoringError("unavailable");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("typed authoring readiness with synthetic catalog metadata", () => {
  it("pins both successor checkers from the regroup migration", () => {
    const sql = readFileSync(
      new URL(
        "../../supabase/migrations/20261121225200_entry_regroup_head_comparison_resolution.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const profiles = sql.split("$profiles$")[1];
    const checkers = new Map(
      (JSON.parse(profiles) as [string, string, string, number][]).map(
        ([signature, , successor]) => [signature, successor],
      ),
    );
    expect(checkers.get("private.canonical_correction_write_ready()")).toBe(
      TYPED_AUTHORING_REGROUP_READINESS_PROFILE.canonicalReadinessSha256,
    );
    expect(checkers.get("private.typed_authoring_write_ready()")).toBe(
      TYPED_AUTHORING_REGROUP_READINESS_PROFILE.typedReadinessSha256,
    );
  });

  it("requires one complete known profile when a successor changes multiple pins", async () => {
    const successor = {
      ...syntheticProfile,
      canonicalReadinessSha256: "e".repeat(64),
      typedReadinessSha256: "f".repeat(64),
    };
    const profiles = [syntheticProfile, successor];
    const data = { ...ready(), ...successor };
    const client = clientFor(data);
    await expect(assertTypedAuthoringReady(client, profiles)).resolves.toEqual(
      data,
    );
    expect(client.rpc).toHaveBeenCalledTimes(1);
    await expect(
      assertTypedAuthoringReady(
        clientFor({
          ...data,
          typedReadinessSha256: syntheticProfile.typedReadinessSha256,
        }),
        profiles,
      ),
    ).rejects.toEqual(unavailable);
    await expect(
      assertTypedAuthoringReady(
        clientFor({ ...data, writerExecutable: false }),
        profiles,
      ),
    ).rejects.toEqual(unavailable);
  });

  it("admits only the exact supported1.1 profile with its own expected pins", async () => {
    const expected = {
      ...syntheticProfile,
      profileVersion: "typed-authoring-readiness-profile/1.1.0",
    };
    expect(
      await assertTypedAuthoringReady(
        clientFor({ ...expected, schemaReady: true, writerExecutable: true }),
        expected,
      ),
    ).toEqual({ ...expected, schemaReady: true, writerExecutable: true });
    const client = clientFor({
      ...ready(),
      profileVersion: "typed-authoring-readiness-profile/1.2.0",
    });
    await expect(
      assertTypedAuthoringReady(client, {
        ...expected,
        profileVersion: "typed-authoring-readiness-profile/1.2.0",
      }),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("admits exactly the pinned profile through one fresh zero-argument RPC", async () => {
    const client = clientFor(ready());
    const result = await assertTypedAuthoringReady(client, syntheticProfile);
    expect(result).toEqual(ready());
    expect(TypedAuthoringReadinessSchema.parse(result)).toEqual(ready());
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
      "read_typed_authoring_readiness",
      {},
    );
  });

  it.each([
    { schemaReady: true, writerExecutable: false },
    { schemaReady: false, writerExecutable: false },
    { schemaReady: false, writerExecutable: true },
  ])("refuses staged or incompatible metadata %j", async (flags) => {
    const client = clientFor({ ...ready(), ...flags });
    await expect(
      assertTypedAuthoringReady(client, syntheticProfile),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    "schemaVersion",
    "profileVersion",
    "canonicalReadinessSha256",
    "typedReadinessSha256",
    "writerSha256",
    "readerSha256",
  ])(
    "refuses a changed %s rather than trusting ready booleans",
    async (field) => {
      await expect(
        assertTypedAuthoringReady(
          clientFor({ ...ready(), [field]: "e".repeat(64) }),
          syntheticProfile,
        ),
      ).rejects.toEqual(unavailable);
    },
  );

  it.each([
    null,
    [],
    { ...ready(), extra: true },
    { ...ready(), schemaReady: "true" },
    { ...ready(), writerExecutable: 1 },
    { ...ready(), readerSha256: "d".repeat(65) },
    { ...ready(), readerSha256: "D".repeat(64) },
    { ...ready(), readerSha256: null },
  ])(
    "refuses malformed metadata without raw response leakage %#",
    async (data) => {
      await expect(
        assertTypedAuthoringReady(clientFor(data), syntheticProfile),
      ).rejects.toEqual(unavailable);
    },
  );

  it("refuses a missing field", async () => {
    const { writerSha256: omitted, ...data } = ready();
    expect(omitted).toBe(syntheticProfile.writerSha256);
    await expect(
      assertTypedAuthoringReady(clientFor(data), syntheticProfile),
    ).rejects.toEqual(unavailable);
  });

  it("requires an explicit complete expected profile before any RPC", async () => {
    const client = clientFor(ready());
    for (const profile of [
      undefined,
      {},
      { ...syntheticProfile, extra: true },
      [],
      [syntheticProfile, {}],
      [syntheticProfile, syntheticProfile, syntheticProfile],
    ]) {
      await expect(assertTypedAuthoringReady(client, profile)).rejects.toEqual(
        unavailable,
      );
    }
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([0, 5001, 1.5, NaN])(
    "refuses invalid timeout %s before IO",
    async (timeoutMs) => {
      const client = clientFor(ready());
      await expect(
        assertTypedAuthoringReady(client, syntheticProfile, { timeoutMs }),
      ).rejects.toEqual(unavailable);
      expect(client.rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the metadata RPC is missing or reports an error", async () => {
    await expect(
      assertTypedAuthoringReady({}, syntheticProfile),
    ).rejects.toEqual(unavailable);
    await expect(
      assertTypedAuthoringReady(
        clientFor(ready(), { message: "PRIVATE_SYNTHETIC_RPC_ERROR" }),
        syntheticProfile,
      ),
    ).rejects.toEqual(new TypedAuthoringError("unavailable"));
  });

  it("maps synchronous RPC throws and asynchronous rejection to one fixed error", async () => {
    const synchronous = {
      rpc: vi.fn(() => {
        throw new Error("PRIVATE_SYNTHETIC_THROW");
      }),
    };
    const asynchronous = {
      rpc: vi.fn(async () => {
        throw new Error("PRIVATE_SYNTHETIC_REJECTION");
      }),
    };
    for (const client of [synchronous, asynchronous]) {
      await expect(
        assertTypedAuthoringReady(client, syntheticProfile),
      ).rejects.toEqual(new TypedAuthoringError("unavailable"));
      expect(client.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("does not cache a prior ready reply or retry a staged reply", async () => {
    const client = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: ready(), error: null })
        .mockResolvedValueOnce({
          data: { ...ready(), writerExecutable: false },
          error: null,
        }),
    };
    await assertTypedAuthoringReady(client, syntheticProfile);
    await expect(
      assertTypedAuthoringReady(client, syntheticProfile),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("refuses a preaborted caller before IO", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = clientFor(ready());
    await expect(
      assertTypedAuthoringReady(client, syntheticProfile, {
        signal: controller.signal,
      }),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("bounds a stalled thenable and forwards the same cancellation signal", async () => {
    vi.useFakeTimers();
    let rpcSignal: AbortSignal | undefined;
    const pending = Object.assign(new Promise<never>(() => {}), {
      abortSignal: (signal: AbortSignal) => {
        rpcSignal = signal;
        return new Promise<never>(() => {});
      },
    });
    const client: TypedAuthoringReadinessClient = { rpc: () => pending };
    const assertion = expect(
      assertTypedAuthoringReady(client, syntheticProfile, { timeoutMs: 5 }),
    ).rejects.toEqual(unavailable);
    await vi.advanceTimersByTimeAsync(5);
    await assertion;
    expect(rpcSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles a caller abort even if the RPC ignores abort", async () => {
    const controller = new AbortController();
    const client = { rpc: vi.fn(() => new Promise<never>(() => {})) };
    const assertion = expect(
      assertTypedAuthoringReady(client, syntheticProfile, {
        signal: controller.signal,
      }),
    ).rejects.toEqual(unavailable);
    await Promise.resolve();
    controller.abort();
    await assertion;
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses an abort racing with an immediately valid reply", async () => {
    const controller = new AbortController();
    const client = {
      rpc: vi.fn(async () => {
        controller.abort();
        return { data: ready(), error: null };
      }),
    };
    await expect(
      assertTypedAuthoringReady(client, syntheticProfile, {
        signal: controller.signal,
      }),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("enforces the absolute deadline after an immediate successful RPC", async () => {
    let clock = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const client = {
      rpc: vi.fn(async () => {
        clock += 5;
        return { data: ready(), error: null };
      }),
    };
    await expect(
      assertTypedAuthoringReady(client, syntheticProfile, { timeoutMs: 5 }),
    ).rejects.toEqual(unavailable);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
});
