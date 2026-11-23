import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), rpc: vi.fn() }));
vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: mocks.config,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));
import { AnalysisJobQueue } from "../../app/lib/server/jobs";
import type { WorkerLeaseContext } from "../../app/lib/server/worker-runner";

const analysisId = "11111111-1111-4111-8111-111111111111";
const fence = "22222222-2222-4222-8222-222222222222";
const secondFence = "33333333-3333-4333-8333-333333333333";
const claim = {
  schemaVersion: "analysis-job-lease/2.0.0",
  analysisId,
  attempt: 1,
  runAfter: "2026-11-10T00:00:00Z",
  leaseFence: fence,
  leaseExpiresAt: "2026-11-10T00:02:00Z",
};
function context(
  value: Awaited<ReturnType<AnalysisJobQueue["claim"]>>,
): WorkerLeaseContext {
  if (!value?.workerId || !value.leaseFence)
    throw new Error("Missing synthetic fenced context");
  return {
    workerId: value.workerId,
    leaseFence: value.leaseFence,
    attempt: value.attempt,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ ANALYSIS_FENCING_ENABLED: true });
  mocks.rpc.mockResolvedValue({ data: claim, error: null });
});

it("strictly reads a fenced claim and injects only its private worker ID", async () => {
  const queue = new AnalysisJobQueue();
  const job = await queue.claim();
  expect(job).toEqual({
    ...claim,
    schemaVersion: undefined,
    workerId: expect.stringMatching(/^worker-[a-f0-9-]{36}$/),
  });
  expect(job).not.toHaveProperty("schemaVersion");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("claim_analysis_job_v2", {
    p_worker_id: job?.workerId,
    p_lease_seconds: 120,
  });
});

it("observes the configured worker queue without changing its fenced claim", async () => {
  const job = await new AnalysisJobQueue(true).claim();
  expect(job?.leaseFence).toBe(fence);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "claim_analysis_job_observed",
    {
      p_worker_id: job?.workerId,
      p_lease_seconds: 120,
      p_fenced: true,
    },
  );
});

it("keeps the same fenced claim if the observation RPC is absent", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
  const queue = new AnalysisJobQueue(true);
  expect((await queue.claim())?.leaseFence).toBe(fence);
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "claim_analysis_job_observed",
    "claim_analysis_job_v2",
  ]);
});

it("never retries an observed claim after an ambiguous failure", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST003" } });
  await expect(new AnalysisJobQueue(true).claim()).rejects.toThrow(
    "claim failed",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][0]).toBe("claim_analysis_job_observed");
});

it.each([
  { ...claim, leaseFence: undefined },
  { ...claim, leaseFence: "not-a-token" },
  { ...claim, analysisId: "analysis-1" },
  { ...claim, attempt: 1.5 },
  { ...claim, attempt: 4 },
  { ...claim, extra: true },
])(
  "rejects an invalid fenced claim without legacy fallback %#",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(new AnalysisJobQueue().claim()).rejects.toThrow(
      "invalid result",
    );
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_analysis_job_v2",
    ]);
  },
);

it("accepts only explicit null for an empty fenced queue and redacts RPC failures", async () => {
  const queue = new AnalysisJobQueue();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await queue.claim()).toBeNull();
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  await expect(queue.claim()).rejects.toThrow("invalid result");
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "private-schema-detail" },
  });
  await expect(queue.claim()).rejects.toThrow("Analysis job claim failed.");
});

it("rejects missing or malformed context and refuses foreign tuples before RPC", async () => {
  const queue = new AnalysisJobQueue();
  const lease = context(await queue.claim());
  mocks.rpc.mockClear();
  await expect(queue.complete(analysisId)).rejects.toThrow("invalid");
  await expect(
    queue.heartbeat(analysisId, { ...lease, leaseFence: "invalid" }),
  ).rejects.toThrow("invalid");
  expect(
    await queue.complete(analysisId, { ...lease, leaseFence: secondFence }),
  ).toBe(false);
  expect(
    await queue.complete(analysisId, { ...lease, workerId: "worker-foreign" }),
  ).toBe(false);
  expect(await queue.complete(analysisId, { ...lease, attempt: 2 })).toBe(
    false,
  );
  expect(await queue.complete(secondFence, lease)).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("cannot complete an old claim after the same worker reacquires a newer fence", async () => {
  const queue = new AnalysisJobQueue();
  const old = context(await queue.claim());
  mocks.rpc.mockResolvedValueOnce({
    data: { ...claim, attempt: 2, leaseFence: secondFence },
    error: null,
  });
  const current = context(await queue.claim());
  mocks.rpc.mockClear();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  expect(await queue.complete(analysisId, old)).toBe(false);
  expect(await queue.complete(analysisId, current)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "complete_analysis_job_v2",
    {
      p_analysis_id: analysisId,
      p_worker_id: current.workerId,
      p_attempt: 2,
      p_lease_fence: secondFence,
    },
  );
});

it("sends the exact attempt and opaque token through every fenced mutation", async () => {
  const queue = new AnalysisJobQueue();
  const lease = context(await queue.claim());
  mocks.rpc.mockClear();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  expect(await queue.heartbeat(analysisId, lease)).toBe(true);
  expect(await queue.complete(analysisId, lease)).toBe(true);
  expect(mocks.rpc.mock.calls).toEqual([
    [
      "heartbeat_analysis_job_v2",
      {
        p_analysis_id: analysisId,
        p_worker_id: lease.workerId,
        p_attempt: 1,
        p_lease_fence: fence,
        p_lease_seconds: 120,
      },
    ],
    [
      "complete_analysis_job_v2",
      {
        p_analysis_id: analysisId,
        p_worker_id: lease.workerId,
        p_attempt: 1,
        p_lease_fence: fence,
      },
    ],
  ]);
  mocks.rpc.mockResolvedValueOnce({
    data: { ...claim, attempt: 2, leaseFence: secondFence },
    error: null,
  });
  const retry = context(await queue.claim());
  mocks.rpc.mockClear();
  expect(
    await queue.release({ analysisId, ...retry, errorCode: "AI_TIMEOUT" }),
  ).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("release_analysis_job_v2", {
    p_analysis_id: analysisId,
    p_worker_id: retry.workerId,
    p_attempt: 2,
    p_lease_fence: secondFence,
    p_retry_delay_seconds: 20,
    p_error_code: "AI_TIMEOUT",
  });
});

it("fails closed on malformed mutation output and drops ownership after explicit false", async () => {
  const queue = new AnalysisJobQueue();
  const lease = context(await queue.claim());
  mocks.rpc.mockResolvedValueOnce({ data: { owned: true }, error: null });
  await expect(queue.heartbeat(analysisId, lease)).rejects.toThrow(
    "invalid result",
  );
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect(await queue.heartbeat(analysisId, lease)).toBe(false);
  mocks.rpc.mockClear();
  expect(await queue.complete(analysisId, lease)).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("retains the legacy RPC shapes when the flag is missing", async () => {
  mocks.config.mockReturnValue({});
  const queue = new AnalysisJobQueue();
  mocks.rpc.mockResolvedValueOnce({
    data: { analysisId: "legacy-analysis", attempt: 2 },
    error: null,
  });
  expect(await queue.claim()).toEqual({
    analysisId: "legacy-analysis",
    attempt: 2,
  });
  const workerId = mocks.rpc.mock.calls[0][1].p_worker_id;
  mocks.rpc.mockClear();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  await queue.heartbeat("legacy-analysis");
  await queue.complete("legacy-analysis");
  await queue.release({
    analysisId: "legacy-analysis",
    attempt: 2,
    errorCode: "AI_TIMEOUT",
  });
  expect(mocks.rpc.mock.calls).toEqual([
    [
      "heartbeat_analysis_job",
      {
        p_analysis_id: "legacy-analysis",
        p_worker_id: workerId,
        p_lease_seconds: 120,
      },
    ],
    [
      "complete_analysis_job",
      { p_analysis_id: "legacy-analysis", p_worker_id: workerId },
    ],
    [
      "release_analysis_job",
      {
        p_analysis_id: "legacy-analysis",
        p_worker_id: workerId,
        p_retry_delay_seconds: 20,
        p_error_code: "AI_TIMEOUT",
      },
    ],
  ]);
});
