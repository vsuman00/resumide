import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWorkerCycle,
  runWorkerLoop,
} from "../../app/lib/server/worker-runner";
import { metrics } from "../../app/lib/server/observability";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

beforeEach(() => metrics.reset());

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
