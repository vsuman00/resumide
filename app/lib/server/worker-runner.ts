import { JOB_LEASE_SECONDS } from "./job-policy";
import { recordJobEvent } from "./observability";

export interface LeasedJobQueue {
  claim(): Promise<{
    analysisId: string;
    attempt: number;
    runAfter?: string;
  } | null>;
  heartbeat(analysisId: string): Promise<boolean>;
  complete(analysisId: string): Promise<boolean>;
  release(args: {
    analysisId: string;
    attempt: number;
    errorCode: string;
  }): Promise<boolean>;
}

export type AnalysisJobProcessor = (
  analysisId: string,
  attempt: number,
  signal: AbortSignal,
) => Promise<void>;

export type WorkerCycleOptions = {
  heartbeatIntervalMs?: number;
};

export class LeaseOwnershipLostError extends Error {
  constructor() {
    super("Analysis job lease ownership was lost.");
    this.name = "LeaseOwnershipLostError";
  }
}

export async function runWorkerCycle(
  queue: LeasedJobQueue,
  process: AnalysisJobProcessor,
  options: WorkerCycleOptions = {},
): Promise<boolean> {
  const job = await queue.claim();
  if (!job) return false;
  const runAfterMs = job.runAfter ? Date.parse(job.runAfter) : Number.NaN;
  recordJobEvent({
    event: "claimed",
    queueAgeMs: Number.isFinite(runAfterMs)
      ? Math.max(0, Date.now() - runAfterMs)
      : undefined,
  });
  const startedAt = performance.now();

  const controller = new AbortController();
  let leaseOwnershipLost = false;
  const heartbeat = setInterval(
    () => {
      void queue.heartbeat(job.analysisId).then(
        (owned) => {
          if (!owned) {
            leaseOwnershipLost = true;
            controller.abort();
          }
        },
        () => {
          leaseOwnershipLost = true;
          controller.abort();
        },
      );
    },
    options.heartbeatIntervalMs ?? (JOB_LEASE_SECONDS * 1_000) / 2,
  );
  heartbeat.unref();

  try {
    await process(job.analysisId, job.attempt, controller.signal);
    if (leaseOwnershipLost) throw new LeaseOwnershipLostError();
    if (!(await queue.complete(job.analysisId))) {
      throw new LeaseOwnershipLostError();
    }
    recordJobEvent({
      event: "completed",
      durationMs: performance.now() - startedAt,
    });
  } catch (error) {
    if (leaseOwnershipLost || error instanceof LeaseOwnershipLostError) {
      recordJobEvent({
        event: "lease_lost",
        durationMs: performance.now() - startedAt,
      });
      return false;
    }
    await queue.release({
      analysisId: job.analysisId,
      attempt: job.attempt,
      errorCode: errorCodeFor(error),
    });
    recordJobEvent({
      event: "failed",
      durationMs: performance.now() - startedAt,
    });
    throw new Error("Analysis job processing failed.");
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

function errorCodeFor(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,64}$/.test(error.code)
  ) {
    return error.code;
  }
  return "PROCESSING_FAILED";
}

function waitFor(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, delayMs);
    // A standalone worker must stay alive while its durable queue is empty.
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function runWorkerLoop(
  queue: LeasedJobQueue,
  process: AnalysisJobProcessor,
  options: { signal: AbortSignal; idleDelayMs?: number } = {
    signal: new AbortController().signal,
  },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      const processed = await runWorkerCycle(queue, process);
      if (!processed) {
        await waitFor(options.idleDelayMs ?? 1_000, options.signal);
      }
    } catch {
      await waitFor(options.idleDelayMs ?? 1_000, options.signal);
    }
  }
}
