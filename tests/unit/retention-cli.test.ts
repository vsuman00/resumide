import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  sweep: vi.fn(),
  remove: vi.fn(),
  construct: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: mocks.config,
}));
vi.mock("../../app/lib/server/retention", () => ({
  SupabaseRetentionRepository: class {
    constructor() {
      mocks.construct();
    }
  },
  createRetentionObjectRemover: () => mocks.remove,
  runRetentionSweep: mocks.sweep,
}));
const load = () => import("../../scripts/run-retention");
let exitCode: typeof process.exitCode;
const snapshotListeners = () => ({
  SIGINT: new Set(process.listeners("SIGINT")),
  SIGTERM: new Set(process.listeners("SIGTERM")),
});
let listeners: ReturnType<typeof snapshotListeners>;
let output: ReturnType<typeof vi.spyOn>, errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  exitCode = process.exitCode;
  listeners = snapshotListeners();
  output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  errors = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mocks.config.mockReturnValue({ RETENTION_DAYS: 30 });
  mocks.sweep.mockResolvedValue({ claimed: 2, completed: 1, failed: 1 });
});
afterEach(() => {
  for (const name of ["SIGINT", "SIGTERM"] as const) {
    const added = process
      .listeners(name)
      .filter((listener) => !listeners[name].has(listener));
    for (const listener of added) process.removeListener(name, listener);
    expect(added).toEqual([]);
  }
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});
it("imports the actual CLI, forwards its controller and preserves the success report wire", async () => {
  await load();
  expect(mocks.construct).toHaveBeenCalledTimes(1);
  expect(mocks.sweep).toHaveBeenCalledWith(
    expect.any(Object),
    mocks.remove,
    expect.any(Date),
    30,
    100,
    { signal: expect.any(AbortSignal) },
  );
  expect(output).toHaveBeenCalledExactlyOnceWith(
    `${JSON.stringify({ retentionDays: 30, claimed: 2, completed: 1, failed: 1 })}\n`,
  );
  expect(errors).not.toHaveBeenCalled();
});
it("reports a safe configuration failure before constructing any repository", async () => {
  mocks.config.mockImplementation(() => {
    throw new Error("PRIVATE_CONFIG_DETAIL");
  });
  await load();
  expect(mocks.construct).not.toHaveBeenCalled();
  expect(mocks.sweep).not.toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  expect(JSON.stringify(errors.mock.calls)).not.toContain(
    "PRIVATE_CONFIG_DETAIL",
  );
});
it("does not print a success report or private detail for an unconfirmed sweep", async () => {
  mocks.sweep.mockRejectedValue(
    new Error("PRIVATE_STORAGE_OR_COMPLETION_DETAIL"),
  );
  await load();
  expect(output).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(errors.mock.calls)).not.toContain(
    "PRIVATE_STORAGE_OR_COMPLETION_DETAIL",
  );
  expect(process.exitCode).toBe(1);
});
it.each(["SIGINT", "SIGTERM"] as const)(
  "forwards %s cancellation and suppresses a late resolved report",
  async (name) => {
    let finish!: () => void;
    mocks.sweep.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const loading = load();
    await vi.waitFor(() => expect(mocks.sweep).toHaveBeenCalledTimes(1));
    const signal = mocks.sweep.mock.calls[0][5].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    const stop = process
      .listeners(name)
      .find((listener) => !listeners[name].has(listener));
    expect(stop).toBeDefined();
    stop?.(name);
    expect(signal.aborted).toBe(true);
    finish();
    await loading;
    expect(output).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  },
);
