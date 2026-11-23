import { describe, expect, it, vi } from "vitest";
import {
  createPaddleOcrAdmissionStore,
  type PaddleOcrBudget,
} from "../../../app/lib/server/ocr/paddle-admission";
import type {
  PaddleOcrAdmissionRequest,
  PaddleOcrAttempt,
} from "../../../app/lib/server/ocr/paddle";

const budget: PaddleOcrBudget = {
  maxPagesPerWindow: 3,
  maxUploadBytesPerWindow: 4_096,
  windowSeconds: 86_400,
};
const request: PaddleOcrAdmissionRequest = {
  ownerId: "10000000-0000-4000-8000-000000000001",
  sourceId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceSha256: "a".repeat(64),
  pageCount: 2,
  pageNumbers: [2, 5],
  uploadBytes: 2_048,
};
const receipt = (
  state: PaddleOcrAttempt["state"],
  pageNumber = 2,
): PaddleOcrAttempt => ({
  pageNumber,
  state,
  jobId: state === "submit_started" ? null : "job/synthetic",
});

function rpcClient(
  respond: (name: string, args: Record<string, unknown>) => RpcResult,
) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) =>
      respond(name, args),
    ),
  };
}
type RpcResult = { data: unknown; error: unknown };

describe("PaddleOCR admission store", () => {
  it("admits the source once and persists each attempt receipt", async () => {
    const client = rpcClient((name) =>
      name === "admit_paddle_ocr"
        ? { data: "20000000-0000-4000-8000-000000000001", error: null }
        : { data: true, error: null },
    );
    const store = createPaddleOcrAdmissionStore({ client, budget });

    await expect(store.admit(request)).resolves.toBe(true);
    await expect(store.admit(request)).resolves.toBe(false);
    await store.recordAttempt(receipt("submit_started"));
    await store.recordAttempt(receipt("acknowledged"));
    await store.recordAttempt(receipt("completed"));

    expect(client.rpc).toHaveBeenNthCalledWith(1, "admit_paddle_ocr", {
      p_owner_id: request.ownerId,
      p_analysis_id: request.analysisId,
      p_source_id: request.sourceId,
      p_source_sha256: request.sourceSha256,
      p_page_numbers: [2, 5],
      p_upload_bytes: 2_048,
      p_max_pages: 3,
      p_max_upload_bytes: 4_096,
      p_window_seconds: 86_400,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "record_paddle_ocr_attempt", {
      p_admission_id: "20000000-0000-4000-8000-000000000001",
      p_page_number: 2,
      p_state: "submit_started",
      p_job_id: null,
    });
    expect(client.rpc).toHaveBeenCalledTimes(4);
  });

  it("does not activate an admission when the RPC denies it", async () => {
    const client = rpcClient(() => ({ data: null, error: null }));
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await expect(store.admit(request)).resolves.toBe(false);
    await expect(
      store.recordAttempt(receipt("submit_started")),
    ).rejects.toThrow("admission is not active");
  });

  it.each([
    [
      "storage error",
      {
        data: "20000000-0000-4000-8000-000000000001",
        error: { message: "synthetic" },
      },
    ],
    ["malformed id", { data: "not-a-uuid", error: null }],
    ["invalid payload", { data: 42, error: null }],
  ])("fails closed on an admission %s", async (_, result) => {
    const client = rpcClient(() => result);
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await expect(store.admit(request)).rejects.toThrow("admission");
    await expect(
      store.recordAttempt(receipt("submit_started")),
    ).rejects.toThrow("admission is not active");
  });

  it("propagates an admission transport failure", async () => {
    const client = {
      rpc: vi.fn(async () => {
        throw new Error("synthetic offline");
      }),
    };
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await expect(store.admit(request)).rejects.toThrow("synthetic offline");
  });

  it.each([
    ["mismatched count", { pageCount: 1 }],
    ["duplicate pages", { pageNumbers: [2, 2] }],
    ["out-of-range page", { pageNumbers: [0, 5] }],
    ["zero bytes", { uploadBytes: 0 }],
    ["bad checksum", { sourceSha256: "b".repeat(63) }],
  ])("rejects %s before calling storage", async (_, override) => {
    const client = rpcClient(() => ({
      data: "20000000-0000-4000-8000-000000000001",
      error: null,
    }));
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await expect(store.admit({ ...request, ...override })).resolves.toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["zero pages", { maxPagesPerWindow: 0 }],
    ["excess pages", { maxPagesPerWindow: 1_001 }],
    ["fractional bytes", { maxUploadBytesPerWindow: 1.5 }],
    ["excess bytes", { maxUploadBytesPerWindow: 107_374_182_401 }],
    ["short window", { windowSeconds: 59 }],
  ])("refuses an invalid %s budget", (_, override) => {
    expect(() =>
      createPaddleOcrAdmissionStore({
        client: rpcClient(() => ({ data: null, error: null })),
        budget: { ...budget, ...override },
      }),
    ).toThrow("budget is invalid");
  });

  it("rejects a receipt for a page or state that was not admitted", async () => {
    const client = rpcClient((name) =>
      name === "admit_paddle_ocr"
        ? { data: "20000000-0000-4000-8000-000000000001", error: null }
        : { data: true, error: null },
    );
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await store.admit(request);

    await expect(
      store.recordAttempt(receipt("submit_started", 3)),
    ).rejects.toThrow("receipt is invalid");
    await expect(
      store.recordAttempt({
        ...receipt("submit_started"),
        jobId: "unexpected",
      }),
    ).rejects.toThrow("receipt is invalid");
    await expect(
      store.recordAttempt({ ...receipt("acknowledged"), jobId: null }),
    ).rejects.toThrow("receipt is invalid");
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("stops when a receipt cannot be persisted", async () => {
    const client = rpcClient((name) =>
      name === "admit_paddle_ocr"
        ? { data: "20000000-0000-4000-8000-000000000001", error: null }
        : { data: false, error: null },
    );
    const store = createPaddleOcrAdmissionStore({ client, budget });
    await store.admit(request);
    await expect(
      store.recordAttempt(receipt("submit_started")),
    ).rejects.toThrow("could not be persisted");
  });
});
