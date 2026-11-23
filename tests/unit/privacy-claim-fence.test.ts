import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageApiError } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
  info: vi.fn(),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove, info: mocks.info }) },
  }),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    PRIVACY_MAX_ATTEMPTS: 3,
    PRIVACY_LEASE_SECONDS: 300,
    SUPABASE_RESUME_BUCKET: "resumes",
  }),
}));
import {
  SupabasePrivacyRequestRepository,
  processPrivacyRequest,
  runPrivacyWorkerCycle,
  type PrivacyRequest,
} from "../../app/lib/server/privacy-worker";
const request: PrivacyRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  workerId: "same-worker",
  attempt: 2,
  kind: "deletion",
};
const captureReceipt = {
  requestId: request.id,
  attempt: request.attempt,
  operations: 1,
  uploads: 1,
  legacy: 1,
  undispatched: 0,
  uncertain: 0,
  acknowledged: 0,
  recordedWorkerLeases: 0,
  invalidKeys: 0,
  orphanedOperations: 0,
  unresolvedSources: 0,
};
const storageKey =
  "organizations/00000000-0000-4000-8000-000000000003/resumes/00000000-0000-4000-8000-000000000004/versions/00000000-0000-4000-8000-000000000005.pdf";
function storageError(status: number, code?: string) {
  return new StorageApiError(
    "storage response",
    status,
    String(status),
    "storage",
    code,
  );
}
const recoveryUpload = {
  uploadId: "00000000-0000-4000-8000-000000000006",
  organizationId: request.organizationId,
  resumeId: "00000000-0000-4000-8000-000000000004",
  versionId: "00000000-0000-4000-8000-000000000005",
  objectId: "00000000-0000-4000-8000-000000000007",
  bucket: "resumes",
  storageKey,
};
function fixtureUploads(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(100 + index).padStart(12, "0");
    const versionId = "00000000-0000-4000-8000-" + suffix;
    return {
      ...recoveryUpload,
      uploadId: "10000000-0000-4000-8000-" + suffix,
      objectId: "20000000-0000-4000-8000-" + suffix,
      versionId,
      storageKey: `organizations/${recoveryUpload.organizationId}/resumes/${recoveryUpload.resumeId}/versions/${versionId}.pdf`,
    };
  });
}

function recoveryResponses(
  options: {
    badKey?: boolean;
    wrongAttempt?: boolean;
    completion?: boolean;
    defer?: boolean;
    batches?: (typeof recoveryUpload)[][];
    inventorySize?: number;
  } = {},
) {
  const batches = options.batches ?? [
    [
      {
        ...recoveryUpload,
        storageKey: options.badKey ? "unrelated.pdf" : storageKey,
      },
    ],
  ];
  const inventorySize = options.inventorySize ?? 1;
  let nextBatch = 0;
  mocks.rpc.mockImplementation(
    async (name, parameters: { p_attempt: number }) => {
      if (name === "prepare_deletion_request_with_admission_handoff")
        return {
          data: null,
          error: { code: "P0A01", message: "ADMISSION_RETIREMENT_REQUIRED" },
        };
      if (name === "capture_analysis_admission_retirement")
        return {
          data: {
            ...captureReceipt,
            attempt: parameters.p_attempt,
            legacy: 0,
            uploads: inventorySize,
            acknowledged: inventorySize,
          },
          error: null,
        };
      if (name === "claim_analysis_admission_cleanup")
        return {
          data: {
            requestId: request.id,
            attempt: parameters.p_attempt + (options.wrongAttempt ? 1 : 0),
            uploads: batches[nextBatch++] ?? [],
          },
          error: null,
        };
      return {
        data:
          name === "complete_analysis_admission_cleanup"
            ? (options.completion ?? true)
            : name === "defer_analysis_admission_cleanup"
              ? (options.defer ?? false)
              : name === "fail_analysis_admission_cleanup"
                ? null
                : true,
        error: null,
      };
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "prepare_deletion_request_with_admission_handoff" ||
      name === "prepare_deletion_request"
        ? { storageObjects: [] }
        : name === "capture_analysis_admission_retirement"
          ? captureReceipt
          : name === "complete_deletion_request_with_admission_retirement"
            ? false
            : name === "fail_analysis_admission_cleanup"
              ? null
              : true,
    error: null,
  }));
});
afterEach(() => vi.useRealTimers());

describe("actual privacy repository claim fencing", () => {
  it.each([false, true])(
    "retires the ledger only after adopted Storage verification (%s)",
    async (storageFailure) => {
      const repo = new SupabasePrivacyRequestRepository();
      vi.spyOn(repo, "claim").mockResolvedValue(request);
      const order: string[] = [];
      const remove = vi.fn(async () => {
        order.push("verify-storage");
        if (storageFailure) throw new Error("STORAGE_DELETE_UNVERIFIED");
      });
      mocks.rpc.mockImplementation(async (name) => {
        order.push(name);
        return {
          error: null,
          data:
            name === "prepare_deletion_request_with_admission_handoff"
              ? {
                  storageObjects: [{ storageKey }],
                  admissionHandoff: {
                    requestId: request.id,
                    attempt: request.attempt,
                    adoptedObjects: [
                      {
                        uploadId: recoveryUpload.uploadId,
                        storageKey,
                        bucket: "resumes",
                        objectId: recoveryUpload.objectId,
                        verified: false,
                      },
                    ],
                  },
                }
              : name === "fail_analysis_admission_cleanup"
                ? null
                : true,
        };
      });
      const result = runPrivacyWorkerCycle(repo, request.workerId, remove);
      if (storageFailure) {
        await expect(result).rejects.toThrow("STORAGE_DELETE_UNVERIFIED");
        expect(order).not.toContain(
          "complete_deletion_request_with_admission_retirement",
        );
        expect(order).not.toContain(
          "complete_analysis_admission_deletion_object",
        );
      } else {
        await expect(result).resolves.toBe(true);
        expect(order).toEqual([
          "prepare_deletion_request_with_admission_handoff",
          "verify-storage",
          "complete_analysis_admission_deletion_object",
          "complete_deletion_request_with_admission_retirement",
        ]);
        expect(mocks.rpc).toHaveBeenLastCalledWith(
          "complete_deletion_request_with_admission_retirement",
          {
            p_request_id: request.id,
            p_worker_id: request.workerId,
            p_attempt: request.attempt,
          },
        );
      }
    },
  );
  it.each([false, true])(
    "uses the adopted object's identity and preserves the retirement hold (%s)",
    async (verified) => {
      const repo = new SupabasePrivacyRequestRepository();
      vi.spyOn(repo, "claim").mockResolvedValue(request);
      const remove = vi.fn();
      mocks.rpc.mockResolvedValueOnce({
        data: {
          storageObjects: [{ storageKey }, { storageKey: "ordinary.pdf" }],
          admissionHandoff: {
            requestId: request.id,
            attempt: request.attempt,
            adoptedObjects: [
              {
                uploadId: recoveryUpload.uploadId,
                storageKey,
                bucket: "resumes",
                objectId: recoveryUpload.objectId,
                verified,
              },
            ],
          },
        },
        error: null,
      });
      await expect(
        runPrivacyWorkerCycle(repo, request.workerId, remove),
      ).rejects.toThrow("ADMISSION_RETIREMENT_REQUIRED");
      expect(remove.mock.calls).toEqual([
        ...(verified
          ? []
          : [
              [
                storageKey,
                { bucket: "resumes", objectId: recoveryUpload.objectId },
              ],
            ]),
        ["ordinary.pdf"],
      ]);
      const receipts = mocks.rpc.mock.calls.filter(
        ([name]) => name === "complete_analysis_admission_deletion_object",
      );
      expect(receipts).toHaveLength(verified ? 0 : 1);
      if (!verified) {
        expect(receipts[0][1]).toEqual({
          p_request_id: request.id,
          p_worker_id: request.workerId,
          p_attempt: request.attempt,
          p_upload_id: recoveryUpload.uploadId,
          p_object_id: recoveryUpload.objectId,
        });
      }
      expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain(
        "complete_privacy_request",
      );
    },
  );

  it("refuses an adopted object outside the returned plan before attempting Storage", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    const remove = vi.fn();
    mocks.rpc.mockResolvedValueOnce({
      data: {
        storageObjects: [{ storageKey: "ordinary.pdf" }],
        admissionHandoff: {
          requestId: request.id,
          attempt: request.attempt,
          adoptedObjects: [
            {
              uploadId: recoveryUpload.uploadId,
              storageKey,
              bucket: "resumes",
              objectId: recoveryUpload.objectId,
              verified: false,
            },
          ],
        },
      },
      error: null,
    });
    await expect(processPrivacyRequest(repo, remove, request)).rejects.toThrow(
      "Privacy deletion plan was invalid.",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("uses legacy preparation only when the handoff RPC is absent", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202" },
    });
    await expect(repo.prepareDeletion(request)).resolves.toEqual({
      storageObjects: [],
    });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "prepare_deletion_request_with_admission_handoff",
      "prepare_deletion_request",
    ]);
  });
  it("claims through the credit-aware queue and preserves the returned attempt fence", async () => {
    const { workerId, ...queued } = { ...request, attempt: 5 };
    mocks.rpc.mockResolvedValueOnce({ data: queued, error: null });
    await expect(
      new SupabasePrivacyRequestRepository().claim(workerId),
    ).resolves.toEqual({
      ...queued,
      workerId,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "claim_privacy_request_with_cleanup_credits",
      { p_worker_id: workerId, p_lease_seconds: 300, p_max_attempts: 3 },
    );
  });

  it("falls back only when the credit-aware claim RPC is unavailable on the older schema", async () => {
    const { workerId, ...queued } = request;
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ data: queued, error: null });
    await expect(
      new SupabasePrivacyRequestRepository().claim(workerId),
    ).resolves.toEqual(request);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_privacy_request_with_cleanup_credits",
      "claim_privacy_request",
    ]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("claim_privacy_request", {
      p_worker_id: workerId,
      p_lease_seconds: 300,
    });
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "55P03" } },
  ])(
    "does not try the legacy queue after an empty or contested claim",
    async (reply) => {
      mocks.rpc.mockResolvedValueOnce(reply);
      const outcome = new SupabasePrivacyRequestRepository().claim(
        request.workerId,
      );
      if (reply.error)
        await expect(outcome).rejects.toThrow("Privacy request claim failed.");
      else await expect(outcome).resolves.toBeNull();
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        "claim_privacy_request_with_cleanup_credits",
        {
          p_worker_id: request.workerId,
          p_lease_seconds: 300,
          p_max_attempts: 3,
        },
      );
    },
  );
  it("drains two successive batches and observes exhaustion under the same claim", async () => {
    const uploads = fixtureUploads(5);
    const repo = new SupabasePrivacyRequestRepository();
    recoveryResponses({
      batches: [uploads.slice(0, 4), uploads.slice(4)],
      inventorySize: 5,
    });
    mocks.info.mockResolvedValue({
      data: null,
      error: storageError(404, "NoSuchKey"),
    });

    await expect(repo.prepareDeletion(request)).rejects.toThrow(
      "ADMISSION_RETIREMENT_REQUIRED",
    );
    expect(mocks.info.mock.calls.map(([key]) => key)).toEqual(
      uploads.map(({ storageKey }) => storageKey),
    );
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "claim_analysis_admission_cleanup",
      ),
    ).toHaveLength(3);
    expect(
      mocks.rpc.mock.calls
        .filter(([name]) => name === "complete_analysis_admission_cleanup")
        .map(([, args]) => [args.p_upload_id, args.p_attempt]),
    ).toEqual(uploads.map(({ uploadId }) => [uploadId, request.attempt]));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(["repeated-id", "repeated-key", "out-of-inventory"] as const)(
    "stops before Storage when a later batch breaks the claim contract (%s)",
    async (defect) => {
      const [first, next] = fixtureUploads(2);
      const replacement =
        defect === "repeated-id"
          ? { ...next, uploadId: first.uploadId }
          : defect === "repeated-key"
            ? { ...first, uploadId: next.uploadId }
            : next;
      const repo = new SupabasePrivacyRequestRepository();
      recoveryResponses({
        batches: [[first], [replacement]],
        inventorySize: defect === "out-of-inventory" ? 1 : 2,
      });
      mocks.info.mockResolvedValue({
        data: null,
        error: storageError(404, "NoSuchKey"),
      });
      await expect(repo.prepareDeletion(request)).rejects.toThrow(
        "ADMISSION_RETIREMENT_REQUIRED",
      );
      expect(
        mocks.rpc.mock.calls.filter(
          ([name]) => name === "claim_analysis_admission_cleanup",
        ),
      ).toHaveLength(2);
      expect(mocks.info).toHaveBeenCalledExactlyOnceWith(first.storageKey);
    },
  );

  it("cancels a later batch on the shared deadline without recording a late response", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const uploads = fixtureUploads(8);
    const repo = new SupabasePrivacyRequestRepository();
    recoveryResponses({
      batches: [uploads.slice(0, 4), uploads.slice(4)],
      inventorySize: 8,
    });
    mocks.info.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4500));
      return { data: null, error: storageError(404, "NoSuchKey") };
    });
    let settled = false;
    const result = repo.prepareDeletion(request).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await result).toMatchObject({
      message: "ADMISSION_RETIREMENT_REQUIRED",
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.info).toHaveBeenCalledTimes(5);
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "complete_analysis_admission_cleanup",
      ),
    ).toHaveLength(4);
  });
  it("hands off a deadline-limited claim without completing or failing the account request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const uploads = fixtureUploads(8);
    const repo = new SupabasePrivacyRequestRepository();
    vi.spyOn(repo, "claim").mockResolvedValue(request);
    recoveryResponses({
      batches: [uploads.slice(0, 4), uploads.slice(4)],
      inventorySize: 8,
      defer: true,
    });
    mocks.info.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4500));
      return { data: null, error: storageError(404, "NoSuchKey") };
    });
    const result = expect(
      runPrivacyWorkerCycle(repo, request.workerId),
    ).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(mocks.rpc).toHaveBeenCalledWith("defer_analysis_admission_cleanup", {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: request.attempt,
    });
    const names = mocks.rpc.mock.calls.map(([name]) => name);
    expect(names).not.toContain("complete_privacy_request");
    expect(names).not.toContain("fail_privacy_request");
    expect(names).not.toContain("fail_analysis_admission_cleanup");
  });
  it("recovers a positively acknowledged upload without completing account deletion", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    vi.spyOn(repo, "claim").mockResolvedValue(request);
    const complete = vi.spyOn(repo, "complete");
    const removeUnrelated = vi.fn();
    recoveryResponses();
    mocks.info
      .mockResolvedValueOnce({
        data: { id: recoveryUpload.objectId },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: storageError(404, "NoSuchKey"),
      });
    mocks.remove.mockResolvedValue({ data: [], error: null });

    await expect(
      runPrivacyWorkerCycle(repo, request.workerId, removeUnrelated),
    ).rejects.toThrow("ADMISSION_RETIREMENT_REQUIRED");
    expect(mocks.info.mock.calls).toEqual([[storageKey], [storageKey]]);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([storageKey]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_analysis_admission_cleanup",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_attempt: request.attempt,
        p_upload_id: recoveryUpload.uploadId,
        p_object_id: recoveryUpload.objectId,
      },
    );
    expect(complete).not.toHaveBeenCalled();
    expect(removeUnrelated).not.toHaveBeenCalled();
  });

  it.each([{ badKey: true }, { wrongAttempt: true }])(
    "rejects mismatched cleanup scope before a Storage call (%j)",
    async (options) => {
      const repo = new SupabasePrivacyRequestRepository();
      recoveryResponses(options);
      await expect(repo.prepareDeletion(request)).rejects.toThrow(
        "ADMISSION_RETIREMENT_REQUIRED",
      );
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toContain(
        "claim_analysis_admission_cleanup",
      );
      expect(mocks.info).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain(
        "complete_analysis_admission_cleanup",
      );
    },
  );

  it("lets a fresh claim reconcile absent Storage after a refused completion", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    recoveryResponses({ completion: false });
    mocks.info.mockResolvedValue({
      data: null,
      error: storageError(404, "NoSuchKey"),
    });
    await expect(repo.prepareDeletion(request)).rejects.toThrow(
      "ADMISSION_RETIREMENT_REQUIRED",
    );
    recoveryResponses();
    await expect(
      repo.prepareDeletion({ ...request, attempt: 3 }),
    ).rejects.toThrow("ADMISSION_RETIREMENT_REQUIRED");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.info.mock.calls).toEqual([[storageKey], [storageKey]]);
    expect(
      mocks.rpc.mock.calls
        .filter(([name]) => name === "complete_analysis_admission_cleanup")
        .map(([, args]) => args.p_attempt),
    ).toEqual([2, 3]);
  });
  it.each([
    ["the object still exists", { data: { id: "synthetic" }, error: null }],
    ["only a generic 404", { data: null, error: storageError(404) }],
    [
      "a bucket error",
      { data: null, error: storageError(404, "NoSuchBucket") },
    ],
    [
      "a permission error",
      { data: null, error: storageError(403, "AccessDenied") },
    ],
    ["a service outage", { data: null, error: storageError(503, "NoSuchKey") }],
  ])("holds deletion completion on %s", async (_reason, info) => {
    const repo = new SupabasePrivacyRequestRepository();
    vi.spyOn(repo, "claim").mockResolvedValue(request);
    vi.spyOn(repo, "prepareDeletion").mockResolvedValue({
      storageObjects: [{ storageKey }],
    });
    const complete = vi.spyOn(repo, "complete");
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.info.mockResolvedValue(info);

    await expect(
      runPrivacyWorkerCycle(repo, request.workerId),
    ).rejects.toMatchObject({
      code: "STORAGE_DELETE_UNVERIFIED",
    });
    expect(mocks.remove).toHaveBeenCalledWith([storageKey]);
    expect(mocks.info).toHaveBeenCalledWith(storageKey);
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "fail_privacy_request",
      expect.objectContaining({
        p_attempt: request.attempt,
        p_error_code: "STORAGE_DELETE_UNVERIFIED",
      }),
    );
  });

  it("allows a fresh claim to complete when the previously removed exact key is verified absent", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    const claim = vi
      .spyOn(repo, "claim")
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce({ ...request, attempt: 3 });
    vi.spyOn(repo, "prepareDeletion").mockResolvedValue({
      storageObjects: [{ storageKey }],
    });
    const complete = vi.spyOn(repo, "complete");
    const absent = storageError(404, "NoSuchKey");
    mocks.remove
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: absent });
    mocks.info
      .mockRejectedValueOnce(new Error("unknown"))
      .mockResolvedValueOnce({ data: null, error: absent });
    await expect(
      runPrivacyWorkerCycle(repo, request.workerId),
    ).rejects.toMatchObject({
      code: "STORAGE_DELETE_UNVERIFIED",
    });
    expect(complete).not.toHaveBeenCalled();
    await expect(runPrivacyWorkerCycle(repo, request.workerId)).resolves.toBe(
      true,
    );
    expect(claim).toHaveBeenCalledTimes(2);
    expect(mocks.info.mock.calls).toEqual([[storageKey], [storageKey]]);
    expect(complete).toHaveBeenCalledExactlyOnceWith(
      { ...request, attempt: 3 },
      { deleted: true },
    );
  });
  it("sends actual attempt to deletion preparation", async () => {
    await new SupabasePrivacyRequestRepository().prepareDeletion(request);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_deletion_request_with_admission_handoff",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_attempt: 2,
      },
    );
  });
  it("sends actual attempt to completion", async () => {
    await new SupabasePrivacyRequestRepository().complete(request, {
      deleted: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_privacy_request", {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: 2,
      p_manifest: { deleted: true },
    });
  });
  it("sends actual attempt to failure bookkeeping", async () => {
    await new SupabasePrivacyRequestRepository().fail(request, "EXPORT_FAILED");
    expect(mocks.rpc).toHaveBeenCalledWith("fail_privacy_request", {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: 2,
      p_error_code: "EXPORT_FAILED",
      p_max_attempts: 3,
    });
  });
  it("uses adjusted failure bookkeeping after a prior verified handoff", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    const current = { ...request, attempt: 7 };
    await expect(
      new SupabasePrivacyRequestRepository().fail(
        current,
        "PRIVACY_REQUEST_FAILED",
      ),
    ).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "fail_analysis_admission_cleanup",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_attempt: 7,
        p_error_code: "PRIVACY_REQUEST_FAILED",
        p_max_attempts: 3,
      },
    );
  });
  it("keeps the old attempt when the same worker has reclaimed another attempt", async () => {
    mocks.rpc.mockImplementation(
      async (_name: string, args: { p_attempt: number }) => ({
        data: args.p_attempt === 3,
        error: null,
      }),
    );
    const repo = new SupabasePrivacyRequestRepository();
    expect(await repo.complete(request, { stale: true })).toBe(false);
    expect(
      await repo.complete({ ...request, attempt: 3 }, { fresh: true }),
    ).toBe(true);
    expect(
      mocks.rpc.mock.calls.map(
        (call) => (call[1] as { p_attempt: number }).p_attempt,
      ),
    ).toEqual([2, 3]);
  });
  it("throws on a refused completion and rebuilds rather than reusing a stale manifest on a fresh claim", async () => {
    const build = vi
      .fn()
      .mockResolvedValueOnce({ old: true })
      .mockResolvedValueOnce({ fresh: true });
    const complete = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const repository = {
      claim: vi.fn(),
      buildExportManifest: build,
      prepareDeletion: vi.fn(),
      complete,
      fail: vi.fn(),
    };
    const exportRequest = { ...request, kind: "export" as const };
    await expect(
      processPrivacyRequest(repository, vi.fn(), exportRequest),
    ).rejects.toThrow("Privacy request completion failed.");
    await processPrivacyRequest(repository, vi.fn(), {
      ...exportRequest,
      attempt: 3,
    });
    expect(build).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls.map((call) => call[1])).toEqual([
      { old: true },
      { fresh: true },
    ]);
  });
  it("does not treat error or nontrue acknowledgement as completion", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private" },
    });
    await expect(repo.complete(request, { deleted: true })).rejects.toThrow(
      "Privacy request completion failed.",
    );
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.complete(request, { deleted: true })).toBe(false);
  });
  it("records an upload cleanup hold without removing objects or completing the request", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    vi.spyOn(repo, "claim").mockResolvedValue(request);
    const remove = vi.fn();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0A01", message: "ADMISSION_RETIREMENT_REQUIRED" },
    });

    await expect(
      runPrivacyWorkerCycle(repo, request.workerId, remove),
    ).rejects.toThrow("ADMISSION_RETIREMENT_REQUIRED");
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "prepare_deletion_request_with_admission_handoff",
      "capture_analysis_admission_retirement",
      "fail_analysis_admission_cleanup",
      "fail_privacy_request",
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "capture_analysis_admission_retirement",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_attempt: request.attempt,
      },
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_privacy_request", {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: request.attempt,
      p_error_code: "ADMISSION_RETIREMENT_REQUIRED",
      p_max_attempts: 3,
    });
  });
  it("preserves an exact completion hold and masks mismatched database errors", async () => {
    const repo = new SupabasePrivacyRequestRepository();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0A01", message: "ADMISSION_RETIREMENT_REQUIRED" },
    });
    await expect(repo.complete(request, { deleted: true })).rejects.toThrow(
      "ADMISSION_RETIREMENT_REQUIRED",
    );
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0A01", message: "private failure detail" },
    });
    await expect(repo.prepareDeletion(request)).rejects.toThrow(
      "Privacy deletion preparation failed.",
    );
  });
  it.each([
    null,
    { ...captureReceipt, attempt: request.attempt - 1 },
    { ...captureReceipt, acknowledged: 1 },
    { ...captureReceipt, uploads: 4096, legacy: 4096 },
    { ...captureReceipt, storageKey: "private-payload" },
  ])(
    "keeps deletion held when the capture receipt is missing or invalid",
    async (receipt) => {
      const repo = new SupabasePrivacyRequestRepository();
      vi.spyOn(repo, "claim").mockResolvedValue(request);
      const remove = vi.fn();
      mocks.rpc
        .mockResolvedValueOnce({
          data: null,
          error: { code: "P0A01", message: "ADMISSION_RETIREMENT_REQUIRED" },
        })
        .mockResolvedValueOnce({ data: receipt, error: null });
      await expect(
        runPrivacyWorkerCycle(repo, request.workerId, remove),
      ).rejects.toThrow("ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE");
      expect(remove).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalledWith(
        "complete_privacy_request",
        expect.anything(),
      );
      expect(mocks.rpc).toHaveBeenLastCalledWith(
        "fail_privacy_request",
        expect.objectContaining({
          p_error_code: "ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE",
        }),
      );
    },
  );
});
