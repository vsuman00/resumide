import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ construct: vi.fn(), rpc: vi.fn() }));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.construct,
}));
import { OWNED_AI_EXPIRY_PROFILE } from "../../app/lib/server/owned-ai-expiry-profile";
const ready = () => ({
  ...OWNED_AI_EXPIRY_PROFILE,
  schemaReady: true,
  foldExecutable: true,
});
const report = () => ({
  schemaVersion: "owned-ai-expiry-sweep/1.0.0" as const,
  selectedCount: 1,
  foldedCount: 1,
  blockedCount: 0,
  deadlineBreached: false,
});
type Reply = { data: unknown; error: unknown };
const load = () => import("../../scripts/run-owned-ai-expiry");
let argv: string[],
  exitCode: typeof process.exitCode,
  output: ReturnType<typeof vi.spyOn>,
  errors: ReturnType<typeof vi.spyOn>;
const snapshot = () => ({
  SIGINT: new Set(process.listeners("SIGINT")),
  SIGTERM: new Set(process.listeners("SIGTERM")),
});
let listeners: ReturnType<typeof snapshot>;
let signals: AbortSignal[];
function query(raw: Reply | Promise<Reply>) {
  const pending = Promise.resolve(raw);
  return Object.assign(pending, {
    abortSignal(signal: AbortSignal) {
      signals.push(signal);
      return pending;
    },
  });
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  argv = [...process.argv];
  exitCode = process.exitCode;
  listeners = snapshot();
  signals = [];
  output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  errors = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.argv = [...argv.slice(0, 2), "--execute"];
  mocks.construct.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(
    (name: string, args: Record<string, unknown>) => {
      expect(args).toEqual(
        name === "read_owned_ai_expiry_readiness" ? {} : { p_limit: 100 },
      );
      return query({
        data: name === "read_owned_ai_expiry_readiness" ? ready() : report(),
        error: null,
      });
    },
  );
});
afterEach(() => {
  for (const name of ["SIGINT", "SIGTERM"] as const) {
    const added = process
      .listeners(name)
      .filter((listener) => !listeners[name].has(listener));
    for (const listener of added) process.removeListener(name, listener);
    expect(added).toEqual([]);
  }
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it.each(
  [
    [],
    ["--limit=1"],
    ["--execute", "--execute"],
    ["--execute", "--limit=0"],
    ["--execute", "--limit=101"],
    ["--execute", "--limit=01"],
    ["--execute", "--limit=1.5"],
    ["--execute", "--limit=1", "--limit=2"],
    ["--execute", "--limit", "1"],
    ["--execute", "--unknown"],
  ].map((args) => [args]),
)(
  "requires explicit exact one-shot arguments %# before client creation",
  async (args) => {
    process.argv = [...argv.slice(0, 2), ...args];
    await load();
    expect(process.exitCode).toBe(1);
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
  },
);
it("executes one actual client sweep with current backend pins and default limit", async () => {
  await load();
  expect(mocks.construct).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_owned_ai_expiry_readiness",
    "sweep_owned_ai_expiry",
  ]);
  expect(output).toHaveBeenCalledExactlyOnceWith(
    `${JSON.stringify(report())}\n`,
  );
  expect(errors).not.toHaveBeenCalled();
});
it.each([1, 100])("forwards exact bounded limit %s once", async (limit) => {
  process.argv = [...argv.slice(0, 2), `--limit=${limit}`, "--execute"];
  mocks.rpc.mockImplementation(
    (name: string, args: Record<string, unknown>) => {
      expect(args).toEqual(
        name === "read_owned_ai_expiry_readiness" ? {} : { p_limit: limit },
      );
      return query({
        data: name === "read_owned_ai_expiry_readiness" ? ready() : report(),
        error: null,
      });
    },
  );
  await load();
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(output).toHaveBeenCalledTimes(1);
  expect(errors).not.toHaveBeenCalled();
});
it("refuses denied metadata without a sweep or profile leakage", async () => {
  mocks.rpc.mockImplementation(() =>
    query({ data: { ...ready(), foldExecutable: false }, error: null }),
  );
  await load();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(process.exitCode).toBe(1);
  expect(output).not.toHaveBeenCalled();
  expect(JSON.stringify(errors.mock.calls)).not.toContain(
    OWNED_AI_EXPIRY_PROFILE.checkerSha256,
  );
});
it.each([
  { ...report(), foldedCount: 0, blockedCount: 1 },
  { ...report(), deadlineBreached: true },
])(
  "prints only validated counts and fails visibly on incomplete cleanup %#",
  async (data) => {
    mocks.rpc.mockImplementation((name: string) =>
      query({
        data: name === "read_owned_ai_expiry_readiness" ? ready() : data,
        error: null,
      }),
    );
    await load();
    expect(process.exitCode).toBe(1);
    expect(output).not.toHaveBeenCalled();
    expect(errors).toHaveBeenNthCalledWith(1, `${JSON.stringify(data)}\n`);
    expect(errors).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  },
);
it.each(["malformed", "denied", "thrown"])(
  "never retries or prints private data after an uncertain %s sweep",
  async (kind) => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "read_owned_ai_expiry_readiness")
        return query({ data: ready(), error: null });
      if (kind === "thrown") throw Error("PRIVATE_TRANSACTION_DETAIL");
      return query({
        data:
          kind === "malformed"
            ? { ...report(), ownerId: "PRIVATE_ID" }
            : report(),
        error:
          kind === "denied" ? { message: "PRIVATE_TRANSACTION_DETAIL" } : null,
      });
    });
    await load();
    expect(process.exitCode).toBe(1);
    expect(output).not.toHaveBeenCalled();
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "sweep_owned_ai_expiry"),
    ).toHaveLength(1);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("PRIVATE");
    expect(errors).toHaveBeenCalledTimes(1);
  },
);
it("sanitizes client construction failure without any RPC", async () => {
  mocks.construct.mockImplementation(() => {
    throw Error("PRIVATE_CONFIG_DETAIL");
  });
  await load();
  expect(process.exitCode).toBe(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
  expect(JSON.stringify(errors.mock.calls)).not.toContain("PRIVATE");
});
it.each(["SIGINT", "SIGTERM"] as const)(
  "propagates %s cancellation and refuses a late commit response without retry",
  async (name) => {
    let finish!: (reply: Reply) => void;
    mocks.rpc.mockImplementation((method: string) =>
      query(
        method === "read_owned_ai_expiry_readiness"
          ? { data: ready(), error: null }
          : new Promise<Reply>((resolve) => {
              finish = resolve;
            }),
      ),
    );
    const pending = load();
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    const added = process
      .listeners(name)
      .filter((listener) => !listeners[name].has(listener));
    expect(added).toHaveLength(1);
    for (const listener of added) Reflect.apply(listener, process, [name]);
    await pending;
    finish({ data: report(), error: null });
    await Promise.resolve();
    expect(process.exitCode).toBe(1);
    expect(output).not.toHaveBeenCalled();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(
      mocks.rpc.mock.calls.filter(
        ([method]) => method === "sweep_owned_ai_expiry",
      ),
    ).toHaveLength(1);
  },
);
it("bounds one hung destructive call without a hidden retry", async () => {
  mocks.rpc.mockImplementation((name: string) =>
    query(
      name === "read_owned_ai_expiry_readiness"
        ? { data: ready(), error: null }
        : new Promise<Reply>(() => {}),
    ),
  );
  const pending = load();
  await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
  await pending;
  expect(process.exitCode).toBe(1);
  expect(output).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
}, 7000);

it("does not print invented counts from a client-construction exception", async () => {
  const { OwnedAiExpiryError } =
    await import("../../app/lib/server/owned-ai-expiry");
  mocks.construct.mockImplementation(() => {
    throw new OwnedAiExpiryError("incomplete", {
      ...report(),
      schemaVersion: "owned-ai-expiry-sweep/1.0.0" as const,
      deadlineBreached: true,
    });
  });
  await load();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(String(errors.mock.calls[0][0])).not.toContain("selectedCount");
  expect(process.exitCode).toBe(1);
});
