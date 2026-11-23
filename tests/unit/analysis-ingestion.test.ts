import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  run: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  removeVerified: vi.fn(),
  rawUpload: vi.fn(),
  membership: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({ SUPABASE_RESUME_BUCKET: "synthetic" }),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: mocks.membership,
      };
      return query;
    },
    storage: { from: () => ({ upload: mocks.rawUpload }) },
  }),
}));
vi.mock("../../app/lib/server/database", () => ({
  createDatabaseTransactionBoundary: () => ({ run: mocks.run }),
}));
vi.mock("../../app/lib/server/storage", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/storage")>()),
  createResumeStorage: () => ({ upload: mocks.upload, remove: mocks.remove }),
  removeVerifiedResumeStorageObject: mocks.removeVerified,
}));
import { createQueuedAnalysis } from "../../app/lib/server/analysis-ingestion";

const operationId = "00000000-0000-4000-8000-000000000004";
const storageObjectId = "00000000-0000-4000-8000-000000000005";
const isTransportRpc = (name: string) =>
  name === "begin_analysis_admission_upload" ||
  name === "acknowledge_analysis_admission_upload";
type Wire = {
  p_organization_id: string;
  p_operation_id?: string;
  p_upload_id?: string;
  p_request: {
    uploadId: string;
    analysisId: string;
    resumeId: string;
    versionId: string;
    jobId: string;
    bindingSha256: string;
  };
};
function ready(p: Wire) {
  const r = p.p_request;
  return {
    schemaVersion: "analysis-admission/1.0.0" as const,
    kind: "upload" as const,
    operationId,
    uploadId: r.uploadId,
    analysisId: r.analysisId,
    resumeId: r.resumeId,
    versionId: r.versionId,
    jobId: r.jobId,
    bindingSha256: r.bindingSha256,
    storageKey: `organizations/${p.p_organization_id}/resumes/${r.resumeId}/versions/${r.versionId}.pdf`,
  };
}
function final(p: Wire, created: boolean, original = p.p_request) {
  return {
    schemaVersion: "analysis-admission/1.0.0",
    kind: "result",
    operationId,
    analysisId: original.analysisId,
    resumeId: original.resumeId,
    created,
    uploadId: p.p_upload_id,
    storageKey: ready(p).storageKey,
    bindingSha256: p.p_request.bindingSha256,
    cleanupPending: !created,
  };
}

const args = {
  userId: "00000000-0000-4000-8000-000000000001",
  fileName: "synthetic.pdf",
  pdf: new Uint8Array([37, 80, 68, 70]),
  jobTitle: "Engineer",
  jobDescription: "Build APIs.",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  requestId: "synthetic-request",
  bindingEnabled: true,
  requestPolicySha256: "f".repeat(64),
};

it("records a single-use dispatch before Storage and the exact positive receipt before adoption", async () => {
  const order: string[] = [];
  mocks.rawUpload.mockImplementation(async (path: string) => {
    order.push("upload");
    return {
      data: { id: storageObjectId, path, fullPath: `synthetic/${path}` },
      error: null,
    };
  });
  mocks.rpc.mockImplementation(async (name, parameters: Wire) => {
    order.push(name);
    if (name === "prepare_tracked_analysis_admission")
      return { data: ready(parameters), error: null };
    if (name === "finalize_analysis_admission")
      return { data: final(parameters, true), error: null };
    return { data: true, error: null };
  });
  await expect(createQueuedAnalysis(args)).resolves.toMatchObject({
    created: true,
  });
  expect(order).toEqual([
    "prepare_tracked_analysis_admission",
    "begin_analysis_admission_upload",
    "upload",
    "acknowledge_analysis_admission_upload",
    "finalize_analysis_admission",
  ]);
  const [, dispatch] = mocks.rpc.mock.calls[1];
  const [, acknowledgement] = mocks.rpc.mock.calls[2];
  expect(acknowledgement).toEqual({
    ...dispatch,
    p_object_id: storageObjectId,
  });
  expect(dispatch).toMatchObject({
    p_operation_id: operationId,
    p_upload_id: expect.any(String),
    p_bucket: "synthetic",
    p_storage_key: mocks.rawUpload.mock.calls[0][0],
  });
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.membership.mockResolvedValue({
    data: { organization_id: "00000000-0000-4000-8000-000000000003" },
    error: null,
  });
  mocks.upload.mockResolvedValue({
    storageKey: "synthetic-object",
    checksum: "a".repeat(64),
    bytes: 4,
  });
  mocks.remove.mockResolvedValue(undefined);
  mocks.removeVerified.mockResolvedValue(undefined);
  mocks.rawUpload.mockImplementation(async (path: string) => ({
    data: { id: storageObjectId, path, fullPath: `synthetic/${path}` },
    error: null,
  }));
  mocks.run.mockRejectedValue(new Error("synthetic committed response lost"));
  mocks.rpc.mockImplementation(async (name, parameters) => {
    if (name === "prepare_tracked_analysis_admission") {
      return { data: ready(parameters), error: null };
    }
    if (isTransportRpc(name)) return { data: true, error: null };
    throw new Error("synthetic committed response lost");
  });
});

it("never deletes a possibly adopted upload after an ambiguous database commit", async () => {
  await expect(createQueuedAnalysis(args)).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.rawUpload).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "finalize_analysis_admission",
    expect.anything(),
  );
});

it("rejects conflicting payload or revoked access before upload and returns exact replay without a duplicate", async () => {
  for (const code of ["ADMISSION_CONFLICT", "ADMISSION_DENIED"]) {
    mocks.rpc.mockResolvedValue({
      data: { schemaVersion: "analysis-admission/1.0.0", kind: "denied", code },
      error: null,
    });
    await expect(createQueuedAnalysis(args)).rejects.toMatchObject({ code });
    expect(mocks.rawUpload).not.toHaveBeenCalled();
  }
  mocks.rpc.mockImplementation(async (_name, p) => ({
    data: {
      schemaVersion: "analysis-admission/1.0.0",
      kind: "replay",
      operationId,
      bindingSha256: p.p_request.bindingSha256,
      analysisId: operationId,
      resumeId: args.userId,
      created: false,
    },
    error: null,
  }));
  await expect(createQueuedAnalysis(args)).resolves.toEqual({
    analysisId: operationId,
    resumeId: args.userId,
    created: false,
  });
  expect(mocks.rawUpload).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("handles racing finalizations by verifying removal of only the confirmed losing upload", async () => {
  let winner: Wire["p_request"] | undefined;
  let adoptedPath: string | undefined;
  mocks.rpc.mockImplementation(async (name, p: Wire) => {
    if (name === "prepare_tracked_analysis_admission")
      return { data: ready(p), error: null };
    if (isTransportRpc(name) || name === "cleanup_analysis_admission")
      return { data: true, error: null };
    const created = !winner;
    if (!winner) {
      winner = p.p_request;
      adoptedPath = ready(p).storageKey;
    }
    return { data: final(p, created, winner), error: null };
  });
  const results = await Promise.all([
    createQueuedAnalysis(args),
    createQueuedAnalysis(args),
  ]);
  expect(results[0].analysisId).toBe(results[1].analysisId);
  expect(results.map((r) => r.created).sort()).toEqual([false, true]);
  expect(new Set(mocks.rawUpload.mock.calls.map(([path]) => path)).size).toBe(
    2,
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.removeVerified).toHaveBeenCalledExactlyOnceWith(
    mocks.rawUpload.mock.calls.find(([path]) => path !== adoptedPath)?.[0],
    { bucket: "synthetic", objectId: storageObjectId },
  );
});

it.each(["remove", "ack"])(
  "preserves the original result when duplicate cleanup %s fails",
  async (failure) => {
    mocks.rpc.mockImplementation(async (name, p: Wire) => {
      if (name === "prepare_tracked_analysis_admission")
        return { data: ready(p), error: null };
      if (isTransportRpc(name)) return { data: true, error: null };
      if (name === "cleanup_analysis_admission")
        throw new Error("synthetic cleanup acknowledgement lost");
      return {
        data: final(p, false, {
          ...p.p_request,
          analysisId: operationId,
          resumeId: args.userId,
        }),
        error: null,
      };
    });
    if (failure === "remove")
      mocks.removeVerified.mockRejectedValue(
        new Error("synthetic delete failed"),
      );
    await expect(createQueuedAnalysis(args)).resolves.toEqual({
      analysisId: operationId,
      resumeId: args.userId,
      created: false,
    });
    expect(mocks.removeVerified).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    const cleaned = mocks.rpc.mock.calls.filter(
      ([name]) => name === "cleanup_analysis_admission",
    );
    expect(cleaned).toHaveLength(failure === "ack" ? 1 : 0);
  },
);

it.each(["complete", "hold-refused", "absence-unconfirmed"] as const)(
  "preserves the finalize denial and uses scoped compensation for a completed upload (%s)",
  async (outcome) => {
    const order: string[] = [];
    mocks.removeVerified.mockImplementation(async () => {
      order.push("verify-removal");
      if (outcome === "absence-unconfirmed") throw new Error("unconfirmed");
    });
    mocks.rpc.mockImplementation(
      async (name, params: Wire & { p_action?: string }) => {
        if (name === "cleanup_analysis_admission") {
          order.push(params.p_action!);
          return { data: outcome !== "hold-refused", error: null };
        }
        if (name === "prepare_tracked_analysis_admission")
          return { data: ready(params), error: null };
        if (name === "finalize_analysis_admission") {
          order.push(name);
          return {
            data: {
              schemaVersion: "analysis-admission/1.0.0",
              kind: "denied",
              code: "ADMISSION_DENIED",
            },
            error: null,
          };
        }
        return { data: true, error: null };
      },
    );

    await expect(createQueuedAnalysis(args)).rejects.toMatchObject({
      code: "ADMISSION_DENIED",
    });
    const path = mocks.rawUpload.mock.calls[0][0];
    const finalized = mocks.rpc.mock.calls.find(
      ([name]) => name === "finalize_analysis_admission",
    )?.[1];
    expect(mocks.rpc).toHaveBeenCalledWith("cleanup_analysis_admission", {
      p_user_id: args.userId,
      p_organization_id: finalized.p_organization_id,
      p_operation_id: operationId,
      p_upload_id: finalized.p_upload_id,
      p_action: "pending",
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    if (outcome === "hold-refused") {
      expect(mocks.removeVerified).not.toHaveBeenCalled();
      expect(order).toEqual(["finalize_analysis_admission", "pending"]);
    } else {
      expect(mocks.removeVerified).toHaveBeenCalledExactlyOnceWith(path, {
        bucket: "synthetic",
        objectId: storageObjectId,
      });
      expect(order).toEqual([
        "finalize_analysis_admission",
        "pending",
        "verify-removal",
        ...(outcome === "complete" ? ["cleaned"] : []),
      ]);
    }
  },
);

it("retains possibly adopted storage on malformed finalize and journals ambiguous uploads without deleting", async () => {
  mocks.rpc.mockImplementation(async (name, p: Wire) => ({
    data: isTransportRpc(name)
      ? true
      : name === "prepare_tracked_analysis_admission"
        ? ready(p)
        : final(p, false),
    error: null,
  }));
  await expect(createQueuedAnalysis(args)).rejects.toMatchObject({
    code: "ADMISSION_UNAVAILABLE",
  });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.removeVerified).not.toHaveBeenCalled();
  mocks.rpc.mockClear();
  mocks.rawUpload.mockResolvedValue({
    error: { message: "synthetic ambiguous upload" },
  });
  mocks.rpc.mockImplementation(async (name, p: Wire) => ({
    data: name === "prepare_tracked_analysis_admission" ? ready(p) : true,
    error: null,
  }));
  await expect(createQueuedAnalysis(args)).rejects.toMatchObject({
    code: "ADMISSION_UNAVAILABLE",
  });
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "prepare_tracked_analysis_admission",
    "begin_analysis_admission_upload",
    "cleanup_analysis_admission",
  ]);
  expect(mocks.rpc.mock.calls[2][1].p_action).toBe("pending");
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([
  ["begin_analysis_admission_upload", 0],
  ["acknowledge_analysis_admission_upload", 1],
] as const)(
  "stops on a lost %s receipt without replaying Storage or adopting",
  async (lost, uploadCount) => {
    mocks.rpc.mockImplementation(async (name, p: Wire) => {
      if (name === lost) throw Error("synthetic committed response lost");
      return {
        data: name === "prepare_tracked_analysis_admission" ? ready(p) : true,
        error: null,
      };
    });
    await expect(createQueuedAnalysis(args)).rejects.toMatchObject({
      code: "ADMISSION_UNAVAILABLE",
    });
    expect(mocks.rawUpload).toHaveBeenCalledTimes(uploadCount);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain(
      "finalize_analysis_admission",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

it.each(["wrong-key", "missing-id"])(
  "retains a successful-looking upload with %s as unresolved",
  async (variant) => {
    mocks.rawUpload.mockImplementation(async (path: string) => ({
      data:
        variant === "wrong-key"
          ? { id: storageObjectId, path, fullPath: `another-bucket/${path}` }
          : { path, fullPath: `synthetic/${path}` },
      error: null,
    }));
    mocks.rpc.mockImplementation(async (name, p: Wire) => ({
      data: name === "prepare_tracked_analysis_admission" ? ready(p) : true,
      error: null,
    }));
    await expect(createQueuedAnalysis(args)).rejects.toMatchObject({
      code: "ADMISSION_UNAVAILABLE",
    });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "prepare_tracked_analysis_admission",
      "begin_analysis_admission_upload",
      "cleanup_analysis_admission",
    ]);
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

it("preserves the flag-off legacy transaction and upload arguments", async () => {
  mocks.run.mockResolvedValue({
    analysisId: operationId,
    resumeId: args.userId,
    created: true,
  });
  await expect(
    createQueuedAnalysis({ ...args, bindingEnabled: false }),
  ).resolves.toEqual({
    analysisId: operationId,
    resumeId: args.userId,
    created: true,
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.rawUpload).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.run).toHaveBeenCalledWith(
    "create_queued_analysis",
    expect.objectContaining({
      p_idempotency_key: args.idempotencyKey,
      p_job_title: args.jobTitle,
      p_job_description: args.jobDescription,
    }),
    expect.anything(),
  );
});
