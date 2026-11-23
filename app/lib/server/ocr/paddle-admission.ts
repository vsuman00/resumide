import type { PaddleOcrAdmissionRequest, PaddleOcrAttempt } from "./paddle";

export type PaddleOcrBudget = {
  maxPagesPerWindow: number;
  maxUploadBytesPerWindow: number;
  windowSeconds: number;
};

type RpcResult = { data: unknown; error: unknown };
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

const admissionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function validBudget(budget: PaddleOcrBudget) {
  return (
    Number.isInteger(budget.maxPagesPerWindow) &&
    budget.maxPagesPerWindow > 0 &&
    budget.maxPagesPerWindow <= 1_000 &&
    Number.isInteger(budget.maxUploadBytesPerWindow) &&
    budget.maxUploadBytesPerWindow > 0 &&
    budget.maxUploadBytesPerWindow <= 107_374_182_400 &&
    Number.isInteger(budget.windowSeconds) &&
    budget.windowSeconds >= 60 &&
    budget.windowSeconds <= 604_800
  );
}

function validAdmission(request: PaddleOcrAdmissionRequest) {
  return (
    request.pageCount >= 1 &&
    request.pageCount <= 10 &&
    Array.isArray(request.pageNumbers) &&
    request.pageNumbers.length === request.pageCount &&
    new Set(request.pageNumbers).size === request.pageNumbers.length &&
    request.pageNumbers.every(
      (page) => Number.isInteger(page) && page >= 1 && page <= 20,
    ) &&
    Number.isSafeInteger(request.uploadBytes) &&
    request.uploadBytes > 0 &&
    /^[a-f0-9]{64}$/u.test(request.sourceSha256)
  );
}

/**
 * Durable, service-only admission and attempt receipts for hosted PaddleOCR.
 * The RPCs verify owner/source binding and consume the budget atomically. This
 * store is intentionally not wired to upload/worker/scoring yet.
 */
export function createPaddleOcrAdmissionStore(args: {
  client: RpcClient;
  budget: PaddleOcrBudget;
}) {
  if (!validBudget(args.budget)) {
    throw new Error("PaddleOCR admission budget is invalid.");
  }
  let admissionId: string | null = null;
  let admittedPages = new Set<number>();

  return {
    async admit(request: PaddleOcrAdmissionRequest) {
      if (admissionId || !validAdmission(request)) return false;
      const { data, error } = await args.client.rpc("admit_paddle_ocr", {
        p_owner_id: request.ownerId,
        p_analysis_id: request.analysisId,
        p_source_id: request.sourceId,
        p_source_sha256: request.sourceSha256,
        p_page_numbers: request.pageNumbers,
        p_upload_bytes: request.uploadBytes,
        p_max_pages: args.budget.maxPagesPerWindow,
        p_max_upload_bytes: args.budget.maxUploadBytesPerWindow,
        p_window_seconds: args.budget.windowSeconds,
      });
      if (error) {
        throw new Error("PaddleOCR admission could not be checked.");
      }
      if (data === null || data === undefined) return false;
      if (typeof data !== "string" || !admissionIdPattern.test(data)) {
        throw new Error("PaddleOCR admission response is invalid.");
      }
      admissionId = data;
      admittedPages = new Set(request.pageNumbers);
      return true;
    },

    async recordAttempt(attempt: PaddleOcrAttempt) {
      if (!admissionId) {
        throw new Error("PaddleOCR admission is not active.");
      }
      if (
        !Number.isInteger(attempt.pageNumber) ||
        !admittedPages.has(attempt.pageNumber) ||
        (attempt.state === "submit_started"
          ? attempt.jobId !== null
          : typeof attempt.jobId !== "string" ||
            attempt.jobId.length === 0 ||
            attempt.jobId.length > 256 ||
            /[\r\n]/u.test(attempt.jobId))
      ) {
        throw new Error("PaddleOCR attempt receipt is invalid.");
      }
      const { data, error } = await args.client.rpc(
        "record_paddle_ocr_attempt",
        {
          p_admission_id: admissionId,
          p_page_number: attempt.pageNumber,
          p_state: attempt.state,
          p_job_id: attempt.jobId,
        },
      );
      if (error || data !== true) {
        throw new Error("PaddleOCR attempt receipt could not be persisted.");
      }
    },
  };
}
