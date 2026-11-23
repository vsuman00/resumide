import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWorkerCycle,
  runWorkerLoop,
} from "../../app/lib/server/worker-runner";
import { metrics } from "../../app/lib/server/observability";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

beforeEach(() => metrics.reset());
afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("worker runner", () => {
  it("keeps a standalone idle worker alive until shutdown", async () => {
    const directory = await mkdtemp(join(resolve("tests"), ".idle-worker-"));
    const script = join(directory, "idle.ts");
    await writeFile(
      script,
      `import { runWorkerLoop } from ${JSON.stringify(resolve("app/lib/server/worker-runner.ts"))};
      const shutdown = new AbortController();
      process.once("SIGTERM", () => shutdown.abort());
      await runWorkerLoop({ claim: async () => { console.log("idle"); return null; } }, async () => {}, { signal: shutdown.signal, idleDelayMs: 10000 });`,
    );
    const child = spawn(
      process.execPath,
      [
        "node_modules/vite-node/vite-node.mjs",
        "--config",
        "vitest.config.ts",
        script,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    try {
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Idle worker did not start")),
          5000,
        );
        child.stdout.on("data", (data) => {
          if (String(data).includes("idle")) {
            clearTimeout(timer);
            done();
          }
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error(`Worker exited before idling: ${stderr}`));
        });
      });
      await new Promise((done) => setTimeout(done, 200));
      expect(child.exitCode).toBeNull();
      await new Promise<void>((done) => {
        child.once("exit", () => done());
        child.kill("SIGTERM");
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  }, 10000);

  it("does no work when no job is available", async () => {
    const queue = {
      claim: vi.fn().mockResolvedValue(null),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    };
    expect(await runWorkerCycle(queue, vi.fn())).toBe(false);
  });

  it("releases a failed leased job with its attempt", async () => {
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 2 }),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    await expect(
      runWorkerCycle(queue, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("processing failed");
    expect(queue.release).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      attempt: 2,
      errorCode: "PROCESSING_FAILED",
    });
  });

  it("records a safe stage-specific failure code when one is available", async () => {
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    await expect(
      runWorkerCycle(queue, async () => {
        throw Object.assign(new Error("provider timed out"), {
          code: "AI_TIMEOUT",
        });
      }),
    ).rejects.toThrow("processing failed");
    expect(queue.release).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      attempt: 1,
      errorCode: "AI_TIMEOUT",
    });
  });

  it("completes a successfully processed lease", async () => {
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(),
      complete: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };
    expect(
      await runWorkerCycle(queue, vi.fn().mockResolvedValue(undefined)),
    ).toBe(true);
    expect(queue.complete).toHaveBeenCalledWith("analysis-1");
    expect(queue.release).not.toHaveBeenCalled();
  });

  it("records scheduled queue age when the claim includes runAfter", async () => {
    const queue = {
      claim: vi.fn().mockResolvedValue({
        analysisId: "analysis-1",
        attempt: 1,
        runAfter: new Date(Date.now() - 250).toISOString(),
      }),
      heartbeat: vi.fn(),
      complete: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };

    await runWorkerCycle(queue, vi.fn().mockResolvedValue(undefined));

    expect(metrics.snapshot().histograms["analysis_queue_age_ms|"]).toEqual(
      expect.objectContaining({ count: 1 }),
    );
  });

  it("does not complete or release a lease after heartbeat ownership is lost", async () => {
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn().mockResolvedValue(false),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const aborted = await new Promise<boolean>((resolve) => {
      void runWorkerCycle(
        queue,
        async (_analysisId, _attempt, signal) => {
          await new Promise((done) => setTimeout(done, 20));
          resolve(signal.aborted);
        },
        { heartbeatIntervalMs: 1 },
      );
    });

    expect(aborted).toBe(true);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.release).not.toHaveBeenCalled();
  });

  it("stops claiming new jobs after shutdown is requested", async () => {
    const controller = new AbortController();
    const queue = {
      claim: vi.fn().mockResolvedValue(null),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const worker = runWorkerLoop(queue, vi.fn(), {
      signal: controller.signal,
      idleDelayMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await worker;

    expect(queue.claim).toHaveBeenCalled();
  });
});

describe("worker ownership and shutdown", () => {
  it("waits for the in-flight heartbeat before completing a fast processor", async () => {
    vi.useFakeTimers();
    const ownership = deferred<boolean>();
    const finished = deferred<void>();
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(() => ownership.promise),
      complete: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };
    const cycle = runWorkerCycle(queue, () => finished.promise, {
      heartbeatIntervalMs: 10,
    });
    try {
      await vi.advanceTimersByTimeAsync(10);
      expect(queue.heartbeat).toHaveBeenCalledTimes(1);
      finished.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.complete).not.toHaveBeenCalled();
      ownership.resolve(false);
      expect(await cycle).toBe(false);
      expect(queue.release).not.toHaveBeenCalled();
    } finally {
      ownership.resolve(false);
      finished.resolve();
      await cycle;
    }
  });

  it("serializes heartbeat calls while an ownership check is pending", async () => {
    vi.useFakeTimers();
    const ownership = deferred<boolean>();
    const finished = deferred<void>();
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(() => ownership.promise),
      complete: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };
    const cycle = runWorkerCycle(queue, () => finished.promise, {
      heartbeatIntervalMs: 10,
    });
    try {
      await vi.advanceTimersByTimeAsync(35);
      expect(queue.heartbeat).toHaveBeenCalledTimes(1);
    } finally {
      finished.resolve();
      ownership.resolve(true);
      await cycle;
    }
  });

  it("passes the exact fenced context to processing and queue mutations", async () => {
    vi.useFakeTimers();
    const finished = deferred<void>();
    const lease = {
      workerId: "worker-synthetic",
      leaseFence: "11111111-1111-4111-8111-111111111111",
      attempt: 2,
    };
    const queue = {
      claim: vi.fn().mockResolvedValue({ analysisId: "analysis-1", ...lease }),
      heartbeat: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };
    const processor = vi.fn(() => finished.promise);
    const cycle = runWorkerCycle(queue, processor, { heartbeatIntervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(processor).toHaveBeenCalledWith(
      "analysis-1",
      2,
      expect.any(AbortSignal),
      lease,
    );
    expect(queue.heartbeat).toHaveBeenCalledExactlyOnceWith(
      "analysis-1",
      lease,
    );
    finished.resolve();
    expect(await cycle).toBe(true);
    expect(queue.complete).toHaveBeenCalledExactlyOnceWith("analysis-1", lease);
  });

  it("passes a failed processor's fence through release", async () => {
    const lease = {
      workerId: "worker-synthetic",
      leaseFence: "11111111-1111-4111-8111-111111111111",
      attempt: 2,
    };
    const queue = {
      claim: vi.fn().mockResolvedValue({ analysisId: "analysis-1", ...lease }),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn().mockResolvedValue(true),
    };
    await expect(
      runWorkerCycle(queue, async () => {
        throw new Error("synthetic");
      }),
    ).rejects.toThrow("processing failed");
    expect(queue.release).toHaveBeenCalledExactlyOnceWith({
      analysisId: "analysis-1",
      errorCode: "PROCESSING_FAILED",
      ...lease,
    });
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it("propagates loop shutdown and never completes when the processor returns after abort", async () => {
    vi.useFakeTimers();
    const finished = deferred<void>();
    const controller = new AbortController();
    let processorSignal: AbortSignal | undefined;
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const running = runWorkerLoop(
      queue,
      async (_id, _attempt, signal) => {
        processorSignal = signal;
        await finished.promise;
      },
      { signal: controller.signal, shutdownTimeoutMs: 25 },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(processorSignal?.aborted).toBe(false);
    controller.abort();
    expect(processorSignal?.aborted).toBe(true);
    finished.resolve();
    await running;
    expect(queue.claim).toHaveBeenCalledTimes(1);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.release).not.toHaveBeenCalled();
  });

  it("bounds shutdown when processing ignores abort and prevents late queue mutations", async () => {
    vi.useFakeTimers();
    const finished = deferred<void>();
    const controller = new AbortController();
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    };
    let settled = false;
    const running = runWorkerLoop(queue, () => finished.promise, {
      signal: controller.signal,
      shutdownTimeoutMs: 25,
    }).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(25);
    expect(settled).toBe(true);
    await running;
    finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.claim).toHaveBeenCalledTimes(1);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.release).not.toHaveBeenCalled();
  });

  it("does not release after completion has an uncertain result", async () => {
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(),
      complete: vi.fn().mockRejectedValue(new Error("private RPC detail")),
      release: vi.fn(),
    };
    expect(await runWorkerCycle(queue, async () => {})).toBe(false);
    expect(queue.complete).toHaveBeenCalledTimes(1);
    expect(queue.release).not.toHaveBeenCalled();
  });

  it("bounds an unresolved heartbeat after processing returns without external shutdown", async () => {
    vi.useFakeTimers();
    const finished = deferred<void>();
    const ownership = deferred<boolean>();
    const controller = new AbortController();
    const queue = {
      claim: vi
        .fn()
        .mockResolvedValue({ analysisId: "analysis-1", attempt: 1 }),
      heartbeat: vi.fn(() => ownership.promise),
      complete: vi.fn(),
      release: vi.fn(),
    };
    let settled = false;
    const running = runWorkerLoop(queue, () => finished.promise, {
      signal: controller.signal,
      heartbeatIntervalMs: 10,
      shutdownTimeoutMs: 25,
    }).then(() => {
      settled = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(10);
      finished.resolve();
      await vi.advanceTimersByTimeAsync(25);
      expect(settled).toBe(true);
      expect(queue.claim).toHaveBeenCalledTimes(1);
      expect(queue.heartbeat).toHaveBeenCalledTimes(1);
      expect(queue.complete).not.toHaveBeenCalled();
      expect(queue.release).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      finished.resolve();
      ownership.resolve(false);
      await running;
    }
  });
});
