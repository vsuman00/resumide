import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ready: vi.fn(),
  config: vi.fn(),
  construct: vi.fn(),
  claim: vi.fn(),
  loop: vi.fn(),
  cycle: vi.fn(),
  processor: vi.fn(),
  admin: { from: vi.fn(), rpc: vi.fn() },
  events: [] as string[],
}));
vi.mock("../../app/lib/server/worker-readiness", () => ({
  assertWorkerSchemaReady: mocks.ready,
  WorkerReadinessError: class extends Error {
    readonly code = "WORKER_SCHEMA_UNAVAILABLE";
  },
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: mocks.config,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => mocks.admin,
}));
vi.mock("../../app/lib/server/analysis-worker", () => ({
  processQueuedAnalysis: mocks.processor,
}));
vi.mock("../../app/lib/server/jobs", () => ({
  AnalysisJobQueue: class {
    claim = mocks.claim;
    constructor() {
      mocks.construct();
      mocks.events.push("construct");
    }
  },
}));
vi.mock("../../app/lib/server/worker-runner", () => ({
  runWorkerLoop: mocks.loop,
  runWorkerCycle: mocks.cycle,
}));

const load = {
  loop: () => import("../../scripts/run-worker"),
  once: () => import("../../scripts/run-worker-once"),
};
let originalExitCode: typeof process.exitCode;
const snapshotListeners = () => ({
  SIGINT: new Set(process.listeners("SIGINT")),
  SIGTERM: new Set(process.listeners("SIGTERM")),
});
let listeners: ReturnType<typeof snapshotListeners>;
let stderr: { mock: { calls: unknown[][] } };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.events.length = 0;
  originalExitCode = process.exitCode;
  listeners = snapshotListeners();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mocks.config.mockReturnValue({
    ANALYSIS_FENCING_ENABLED: true,
    EVIDENCE_REVIEW_ENABLED: false,
    AI_ENABLED: true,
    AI_BUDGET_ENABLED: true,
    AI_BUDGET_POLICY_VERSION: "synthetic-policy/1",
    OPENAI_MODEL: "synthetic-model",
    READINESS_TIMEOUT_MS: 250,
    SHUTDOWN_TIMEOUT_MS: 1000,
  });
  mocks.ready.mockResolvedValue(undefined);
  mocks.loop.mockImplementation(async () => {
    mocks.events.push("loop");
  });
  mocks.cycle.mockImplementation(async () => {
    mocks.events.push("cycle");
    return false;
  });
});
afterEach(() => {
  for (const name of ["SIGINT", "SIGTERM"] as const)
    for (const listener of process.listeners(name))
      if (!listeners[name].has(listener))
        process.removeListener(name, listener);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

it.each(["loop", "once"] as const)(
  "stops the actual %s CLI before queue construction when readiness fails",
  async (mode) => {
    const failure = new Error("synthetic-private-readiness-detail");
    mocks.ready.mockRejectedValueOnce(failure);
    await load[mode]().catch(() => undefined);
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.loop).not.toHaveBeenCalled();
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(failure.message);
    expect(process.exitCode).toBe(1);
  },
);

it("waits for capability readiness before starting the actual loop and forwards shutdown", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finishLoop: (() => void) | undefined;
  const loopPending = new Promise<void>((resolve) => {
    finishLoop = resolve;
  });
  mocks.loop.mockImplementationOnce(async () => {
    mocks.events.push("loop");
    await loopPending;
  });
  mocks.ready.mockImplementationOnce(async () => {
    mocks.events.push("readiness");
    await pending;
  });
  const loading = load.loop();
  try {
    await vi.waitFor(() => expect(mocks.ready).toHaveBeenCalledTimes(1));
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.ready).toHaveBeenCalledWith(
      mocks.admin,
      expect.objectContaining({
        analysisFencingEnabled: true,
        aiEnabled: true,
        aiBudgetEnabled: true,
        aiBudgetPolicyVersion: "synthetic-policy/1",
        model: "synthetic-model",
        timeoutMs: 250,
      }),
    );
    release();
    await vi.waitFor(() => expect(mocks.loop).toHaveBeenCalledTimes(1));
    expect(mocks.events).toEqual(["readiness", "construct", "loop"]);
    expect(mocks.claim).not.toHaveBeenCalled();
    const signal = mocks.loop.mock.calls[0][2].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    const shutdown = process
      .listeners("SIGTERM")
      .find((listener) => !listeners.SIGTERM.has(listener));
    expect(shutdown).toBeDefined();
    shutdown?.("SIGTERM");
    expect(signal.aborted).toBe(true);
    finishLoop?.();
    await loading;
  } finally {
    release();
    finishLoop?.();
    await loading;
  }
});

it.each([
  ["loop", false],
  ["loop", true],
  ["once", false],
  ["once", true],
] as const)(
  "forwards required document metadata readiness before %s queue when fencing=%s",
  async (mode, fenced) => {
    mocks.config.mockReturnValue({
      ...mocks.config(),
      ANALYSIS_FENCING_ENABLED: fenced,
      EVIDENCE_REVIEW_ENABLED: true,
    });
    mocks.ready.mockRejectedValueOnce(
      new Error("synthetic-document-metadata-unavailable"),
    );
    await load[mode]();
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    expect(mocks.ready.mock.calls[0][1]).toMatchObject({
      analysisFencingEnabled: fenced,
      evidenceReviewEnabled: true,
    });
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.loop).not.toHaveBeenCalled();
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(
      "synthetic-document-metadata-unavailable",
    );
  },
);
it.each(["loop", "once"] as const)(
  "forwards explicit false review selection to the actual %s CLI readiness",
  async (mode) => {
    mocks.config.mockReturnValue({
      ...mocks.config(),
      ANALYSIS_FENCING_ENABLED: false,
      EVIDENCE_REVIEW_ENABLED: false,
    });
    await load[mode]();
    expect(mocks.ready).toHaveBeenCalledExactlyOnceWith(
      mocks.admin,
      expect.objectContaining({
        analysisFencingEnabled: false,
        evidenceReviewEnabled: false,
      }),
    );
    expect(mocks.construct).toHaveBeenCalledTimes(1);
  },
);
