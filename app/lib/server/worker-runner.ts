import { JOB_LEASE_SECONDS } from "./job-policy";
import { recordJobEvent } from "./observability";

export type WorkerLeaseContext = Readonly<{
  workerId: string;
  leaseFence: string;
  attempt: number;
}>;
export type ClaimedAnalysisJob = {
  analysisId: string;
  attempt: number;
  runAfter?: string;
  workerId?: string;
  leaseFence?: string;
  leaseExpiresAt?: string;
};
export interface LeasedJobQueue {
  claim(): Promise<ClaimedAnalysisJob | null>;
  heartbeat(analysisId: string, lease?: WorkerLeaseContext): Promise<boolean>;
  complete(analysisId: string, lease?: WorkerLeaseContext): Promise<boolean>;
  release(args: {
    analysisId: string;
    attempt: number;
    errorCode: string;
    leaseFence?: string;
    workerId?: string;
  }): Promise<boolean>;
}

export type AnalysisJobProcessor = (
  analysisId: string,
  attempt: number,
  signal: AbortSignal,
  lease?: WorkerLeaseContext,
) => Promise<void>;

export type WorkerCycleOptions = {
  heartbeatIntervalMs?: number;
  signal?: AbortSignal;
  shutdownTimeoutMs?: number;
};

export class LeaseOwnershipLostError extends Error {
  constructor() {
    super("Analysis job lease ownership was lost.");
    this.name = "LeaseOwnershipLostError";
  }
}

class WorkerShutdownTimeoutError extends Error {
  constructor() {
    super("Analysis worker shutdown could not settle its in-flight work.");
  }
}
type Outcome<T> =
  { state: "done"; value: T } | { state: "error"; error: unknown };
type ShutdownWait = { timeoutMs: number; deadline?: number };
async function settleWithShutdown<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  wait: ShutdownWait,
): Promise<Outcome<T>> {
  const settled = promise.then<Outcome<T>, Outcome<T>>(
    (value) => ({ state: "done", value }),
    (error: unknown) => ({ state: "error", error }),
  );
  if (!signal.aborted) {
    let abort = () => {};
    const interrupted = new Promise<{ state: "aborted" }>((resolve) => {
      abort = () => resolve({ state: "aborted" });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      const result = await Promise.race([settled, interrupted]);
      if (result.state !== "aborted") return result;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = (wait.deadline ??= Date.now() + wait.timeoutMs);
  try {
    return await Promise.race([
      settled,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new WorkerShutdownTimeoutError()),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runWorkerCycle(
  queue: LeasedJobQueue,
  process: AnalysisJobProcessor,
  options: WorkerCycleOptions = {},
): Promise<boolean> {
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? (JOB_LEASE_SECONDS * 1_000) / 2;
  if (
    !Number.isSafeInteger(shutdownTimeoutMs) ||
    shutdownTimeoutMs < 1 ||
    shutdownTimeoutMs > 60_000 ||
    !Number.isSafeInteger(heartbeatIntervalMs) ||
    heartbeatIntervalMs < 1 ||
    heartbeatIntervalMs > JOB_LEASE_SECONDS * 1_000
  )
    throw new Error("Analysis worker timing options are invalid.");
  const controller = new AbortController();
  const shutdownWait: ShutdownWait = { timeoutMs: shutdownTimeoutMs };
  const setDeadline = () => {
    shutdownWait.deadline ??= Date.now() + shutdownTimeoutMs;
  };
  controller.signal.addEventListener("abort", setDeadline, { once: true });
  const shutdown = () => controller.abort();
  options.signal?.addEventListener("abort", shutdown, { once: true });
  if (options.signal?.aborted) controller.abort();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller.signal.aborted) return false;
    const claimed = await settleWithShutdown(
      queue.claim(),
      controller.signal,
      shutdownWait,
    );
    if (claimed.state === "error")
      throw new Error("Analysis job claim failed.");
    const job = claimed.value;
    if (!job || controller.signal.aborted) return false;
    let lease: WorkerLeaseContext | undefined;
    if (job.leaseFence !== undefined) {
      if (
        !job.workerId ||
        !/^[\x20-\x7e]{1,128}$/u.test(job.workerId) ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(
          job.leaseFence,
        ) ||
        !Number.isInteger(job.attempt) ||
        job.attempt < 1 ||
        job.attempt > 3
      )
        throw new Error("Analysis job lease context is invalid.");
      lease = Object.freeze({
        workerId: job.workerId,
        leaseFence: job.leaseFence,
        attempt: job.attempt,
      });
    }
    const runAfterMs = job.runAfter ? Date.parse(job.runAfter) : Number.NaN;
    recordJobEvent({
      event: "claimed",
      queueAgeMs: Number.isFinite(runAfterMs)
        ? Math.max(0, Date.now() - runAfterMs)
        : undefined,
    });
    const startedAt = performance.now();

    let leaseOwnershipLost = false;
    let heartbeatUnsettled = false;
    let stopping = false;
    const ownership: { pending?: Promise<void> } = {};
    const lost = () => {
      leaseOwnershipLost = true;
      controller.abort();
    };
    heartbeat = setInterval(() => {
      if (stopping || ownership.pending || controller.signal.aborted) return;
      const response = Promise.resolve().then(() =>
        lease
          ? queue.heartbeat(job.analysisId, lease)
          : queue.heartbeat(job.analysisId),
      );
      const pending = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          heartbeatUnsettled = true;
          lost();
          resolve();
        }, shutdownTimeoutMs);
        heartbeatTimeout = timeout;
        void response.then(
          (owned) => {
            clearTimeout(timeout);
            if (!owned) lost();
            resolve();
          },
          () => {
            clearTimeout(timeout);
            lost();
            resolve();
          },
        );
      });
      ownership.pending = pending;
      void pending.finally(() => {
        if (ownership.pending === pending) ownership.pending = undefined;
      });
    }, heartbeatIntervalMs);
    heartbeat.unref();

    const result = await settleWithShutdown(
      Promise.resolve().then(() =>
        lease
          ? process(job.analysisId, job.attempt, controller.signal, lease)
          : process(job.analysisId, job.attempt, controller.signal),
      ),
      controller.signal,
      shutdownWait,
    );
    stopping = true;
    clearInterval(heartbeat);
    // A late negative ownership response must settle before success or failure can mutate the queue.
    if (ownership.pending)
      await settleWithShutdown(
        ownership.pending,
        controller.signal,
        shutdownWait,
      );
    if (heartbeatUnsettled) throw new WorkerShutdownTimeoutError();
    if (leaseOwnershipLost || controller.signal.aborted) {
      if (leaseOwnershipLost)
        recordJobEvent({
          event: "lease_lost",
          durationMs: performance.now() - startedAt,
        });
      return false;
    }
    if (result.state === "error") {
      if (result.error instanceof LeaseOwnershipLostError) {
        recordJobEvent({
          event: "lease_lost",
          durationMs: performance.now() - startedAt,
        });
        return false;
      }
      const released = await settleWithShutdown(
        queue.release({
          analysisId: job.analysisId,
          attempt: job.attempt,
          errorCode: errorCodeFor(result.error),
          ...(lease
            ? { leaseFence: lease.leaseFence, workerId: lease.workerId }
            : {}),
        }),
        controller.signal,
        shutdownWait,
      );
      if (released.state === "done" && !released.value) {
        recordJobEvent({
          event: "lease_lost",
          durationMs: performance.now() - startedAt,
        });
        return false;
      }
      recordJobEvent({
        event: "failed",
        durationMs: performance.now() - startedAt,
      });
      throw new Error("Analysis job processing failed.");
    }
    const completed = await settleWithShutdown(
      lease
        ? queue.complete(job.analysisId, lease)
        : queue.complete(job.analysisId),
      controller.signal,
      shutdownWait,
    );
    if (
      completed.state === "error" ||
      !completed.value ||
      controller.signal.aborted
    ) {
      recordJobEvent({
        event: "lease_lost",
        durationMs: performance.now() - startedAt,
      });
      return false;
    }
    recordJobEvent({
      event: "completed",
      durationMs: performance.now() - startedAt,
    });
    return true;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(heartbeatTimeout);
    options.signal?.removeEventListener("abort", shutdown);
    controller.signal.removeEventListener("abort", setDeadline);
  }
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
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    // A standalone worker must stay alive while its durable queue is empty.
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function runWorkerLoop(
  queue: LeasedJobQueue,
  process: AnalysisJobProcessor,
  options: WorkerCycleOptions & {
    signal: AbortSignal;
    idleDelayMs?: number;
  } = {
    signal: new AbortController().signal,
  },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      const processed = await runWorkerCycle(queue, process, options);
      if (!processed) {
        await waitFor(options.idleDelayMs ?? 1_000, options.signal);
      }
    } catch (error) {
      // Do not start another job while a previous processor may still be running.
      if (error instanceof WorkerShutdownTimeoutError) return;
      await waitFor(options.idleDelayMs ?? 1_000, options.signal);
    }
  }
}
