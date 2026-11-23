import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extraction: vi.fn(),
  scoring: vi.fn(),
  qualitative: vi.fn(),
  config: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  download: vi.fn(),
  document: vi.fn(),
  pdf: vi.fn(),
  uncalibrated: vi.fn(),
}));
vi.mock("../../app/lib/server/extraction-stage", () => ({
  processExtractionStage: mocks.extraction,
}));
vi.mock("../../app/lib/server/scoring-stage", () => ({
  processScoringStage: mocks.scoring,
}));
vi.mock("../../app/lib/server/qualitative-stage", () => ({
  processQualitativeStage: mocks.qualitative,
}));
vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: mocks.config,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("../../app/lib/server/storage", () => ({
  createResumeStorage: () => ({ download: mocks.download }),
}));
vi.mock("../../app/lib/server/document-extraction", () => ({
  extractDocumentForReview: mocks.document,
  extractDocumentForReviewWithMetadata: mocks.document,
}));
vi.mock("../../app/lib/server/ocr/pdf-detection", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../app/lib/server/ocr/pdf-detection")
  >()),
  extractPdfTextLayers: mocks.pdf,
}));
vi.mock("../../app/lib/server/evidence-scoring-guard", () => ({
  hasUncalibratedEvidence: mocks.uncalibrated,
}));
import { processQueuedAnalysis } from "../../app/lib/server/analysis-worker";
import {
  AnalysisStageFenceError,
  assertAnalysisStageLease,
  persistAnalysisStage,
} from "../../app/lib/server/analysis-stage-fence";
import { ResumeExtractionError } from "../../app/lib/server/extract";

const extraction = await vi.importActual<
  typeof import("../../app/lib/server/extraction-stage")
>("../../app/lib/server/extraction-stage");
const scoring = await vi.importActual<
  typeof import("../../app/lib/server/scoring-stage")
>("../../app/lib/server/scoring-stage");
const documentExtraction = await vi.importActual<
  typeof import("../../app/lib/server/document-extraction")
>("../../app/lib/server/document-extraction");
const analysisId = "11111111-1111-4111-8111-111111111111";
const lease = {
  workerId: "worker-synthetic",
  leaseFence: "22222222-2222-4222-8222-222222222222",
  attempt: 2,
};
let input: Record<string, unknown>;
let config: Record<string, unknown>;

beforeEach(() => {
  const pdfBytes = new Uint8Array([37, 80, 68, 70]);
  vi.clearAllMocks();
  mocks.extraction.mockResolvedValue(undefined);
  mocks.scoring.mockResolvedValue(true);
  mocks.qualitative.mockResolvedValue(undefined);
  config = {
    ANALYSIS_FENCING_ENABLED: false,
    EVIDENCE_REVIEW_ENABLED: true,
    NATIVE_LAYOUT_ENABLED: false,
    NATIVE_EVIDENCE_ENABLED: false,
    MAX_UPLOAD_BYTES: 1024,
    MAX_PDF_PAGES: 10,
    MAX_EXTRACTED_CHARACTERS: 100000,
    EXTRACTION_TIMEOUT_MS: 100,
  };
  mocks.config.mockImplementation(() => config);
  input = {
    status: "extracting",
    owner_id: analysisId,
    resume_versions: {
      id: analysisId,
      checksum: createHash("sha256").update(pdfBytes).digest("hex"),
      storage_key: "synthetic-fixture",
      organization_id: analysisId,
    },
    jobs: { description: "Python API development" },
    analysis_extractions: {
      extracted_text: "Built a Python API for event ingestion.",
      text_checksum: "a".repeat(64),
      page_count: 1,
      page_texts: ["Built a Python API for event ingestion."],
    },
  };
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: input, error: null }),
    };
    return q;
  });
  mocks.download.mockResolvedValue(pdfBytes);
  mocks.document.mockResolvedValue({
    envelope: { schemaVersion: "synthetic-envelope" },
    pageCount: 1,
  });
  mocks.pdf.mockResolvedValue({
    text: "Built a Python API for event ingestion.",
    totalPages: 1,
    pageTexts: ["Built a Python API for event ingestion."],
  });
  mocks.uncalibrated.mockResolvedValue(false);
});

it("forwards signal and the exact claimed attempt through each worker stage", async () => {
  const signal = new AbortController().signal;
  await processQueuedAnalysis(analysisId, 2, signal, lease);
  const options = { signal, lease };
  expect(mocks.extraction).toHaveBeenCalledExactlyOnceWith(analysisId, options);
  expect(mocks.scoring).toHaveBeenCalledExactlyOnceWith(analysisId, options);
  expect(mocks.qualitative).toHaveBeenCalledExactlyOnceWith(
    analysisId,
    2,
    undefined,
    options,
  );
  mocks.extraction.mockClear();
  await expect(
    processQueuedAnalysis(analysisId, 1, signal, lease),
  ).rejects.toMatchObject({ code: "ANALYSIS_FENCE_UNAVAILABLE" });
  expect(mocks.extraction).not.toHaveBeenCalled();
});

it("requires the lease before any stage work when fencing is enabled", async () => {
  config.ANALYSIS_FENCING_ENABLED = true;
  await expect(
    extraction.processExtractionStage(analysisId),
  ).rejects.toMatchObject({ code: "ANALYSIS_FENCE_REQUIRED" });
  await expect(scoring.processScoringStage(analysisId)).rejects.toMatchObject({
    code: "ANALYSIS_FENCE_REQUIRED",
  });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("checks ownership before loading or extracting bytes", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await expect(
    extraction.processExtractionStage(analysisId, { lease }),
  ).rejects.toMatchObject({ code: "ANALYSIS_LEASE_LOST" });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "assert_analysis_stage_lease",
    {
      p_analysis_id: analysisId,
      p_worker_id: lease.workerId,
      p_attempt: 2,
      p_lease_fence: lease.leaseFence,
    },
  );
});

it("fences every extraction transition and document-evidence write", async () => {
  input.status = "quarantined";
  await extraction.processExtractionStage(analysisId, { lease });
  const mutations = mocks.rpc.mock.calls.filter(
    ([name]) => name === "persist_analysis_stage_v2",
  );
  expect(mutations.map(([, args]) => args.p_operation)).toEqual([
    "transition_analysis",
    "transition_analysis",
    "persist_document_evidence",
  ]);
  for (const [, args] of mutations) {
    expect(args).toMatchObject({
      p_analysis_id: analysisId,
      p_worker_id: lease.workerId,
      p_attempt: 2,
      p_lease_fence: lease.leaseFence,
      p_parameters: { p_analysis_id: analysisId },
    });
  }
  expect(mutations[0][1].p_parameters).toMatchObject({
    p_expected_status: "quarantined",
    p_next_status: "queued",
    p_actor_id: null,
  });
  expect(
    mocks.rpc.mock.calls.every(([name]) =>
      ["assert_analysis_stage_lease", "persist_analysis_stage_v2"].includes(
        name,
      ),
    ),
  ).toBe(true);
});

it.each([false, true])(
  "fences extraction persistence with native layout enabled=%s",
  async (native) => {
    config.EVIDENCE_REVIEW_ENABLED = false;
    config.NATIVE_LAYOUT_ENABLED = native;
    await extraction.processExtractionStage(analysisId, { lease });
    const mutations = mocks.rpc.mock.calls.filter(
      ([name]) => name === "persist_analysis_stage_v2",
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0][1]).toMatchObject({
      p_operation: native
        ? "persist_native_layout_extraction"
        : "persist_analysis_extraction",
      p_parameters: {
        p_analysis_id: analysisId,
        p_extracted_text: "Built a Python API for event ingestion.",
      },
    });
  },
);

it("also fences the extraction failure transition", async () => {
  mocks.download.mockRejectedValueOnce(new ResumeExtractionError("EMPTY_TEXT"));
  await extraction.processExtractionStage(analysisId, { lease });
  const writes = mocks.rpc.mock.calls.filter(
    ([name]) => name === "persist_analysis_stage_v2",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0][1]).toMatchObject({
    p_operation: "transition_analysis",
    p_parameters: {
      p_expected_status: "extracting",
      p_next_status: "needs_ocr",
    },
  });
});

it.each([false, true])(
  "refuses a source checksum mismatch before parsing with native layout enabled=%s",
  async (native) => {
    config.EVIDENCE_REVIEW_ENABLED = false;
    config.NATIVE_LAYOUT_ENABLED = native;
    mocks.download.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 71]));

    await extraction.processExtractionStage(analysisId, { lease });

    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.document).not.toHaveBeenCalled();
    const writes = mocks.rpc.mock.calls.filter(
      ([name]) => name === "persist_analysis_stage_v2",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toMatchObject({
      p_operation: "transition_analysis",
      p_worker_id: lease.workerId,
      p_attempt: lease.attempt,
      p_lease_fence: lease.leaseFence,
      p_parameters: {
        p_analysis_id: analysisId,
        p_expected_status: "extracting",
        p_next_status: "failed",
      },
    });
  },
);

it("does not write when extraction finishes after cancellation", async () => {
  const controller = new AbortController();
  mocks.document.mockImplementationOnce(async () => {
    controller.abort();
    return {};
  });
  await expect(
    extraction.processExtractionStage(analysisId, {
      lease,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: "ANALYSIS_CANCELLED" });
  expect(
    mocks.rpc.mock.calls.filter(
      ([name]) => name === "persist_analysis_stage_v2",
    ),
  ).toHaveLength(0);
});

it("hands the worker cancellation signal and live OCR lease check to document review", async () => {
  const signal = new AbortController().signal;
  const leaseResults = [true, true, true, false];
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "assert_analysis_stage_lease" ? leaseResults.shift() : true,
    error: null,
  }));
  mocks.document.mockImplementationOnce(async (documentArgs) => {
    expect(documentArgs.signal).toBe(signal);
    await documentArgs.assertOcrAdmission();
    return { envelope: { schemaVersion: "synthetic-envelope" }, pageCount: 1 };
  });
  await expect(
    extraction.processExtractionStage(analysisId, { lease, signal }),
  ).rejects.toMatchObject({ code: "ANALYSIS_LEASE_LOST" });
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(
    Array.from({ length: 4 }, () => "assert_analysis_stage_lease"),
  );
});

it.each([true, false])(
  "binds synthetic OCR evidence to the current source and lease when the writer allows=%s",
  async (writerAllows) => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    (input.resume_versions as Record<string, unknown>).checksum = checksum;
    const pageTexts = ["", "Original native middle page", ""];
    mocks.pdf.mockResolvedValueOnce({
      totalPages: 3,
      text: pageTexts.join("\n\n"),
      pageTexts,
    });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name !== "persist_analysis_stage_v2" || writerAllows,
      error: null,
    }));
    const recognize = vi.fn(async () => ({
      durationMs: 1,
      pages: [1, 3].map((pageNumber) => ({
        pageNumber,
        pageId: `page-${pageNumber}`,
        imageSha256: "b".repeat(64),
        widthPixels: 20,
        heightPixels: 20,
        rotation: 0,
        text: "Test",
        words: [
          {
            text: "Test",
            start: 0,
            end: 4,
            box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
            confidence: 90,
          },
        ],
      })),
    }));
    mocks.document.mockImplementationOnce(
      async (
        args: Parameters<
          typeof documentExtraction.extractDocumentForReviewWithMetadata
        >[0],
      ) => {
        const { context } = args;
        return documentExtraction.extractDocumentForReviewWithMetadata(
          {
            ...args,
            syntheticOcr: {
              request: {
                schemaVersion: "selective-ocr-request-v1",
                attemptId: "33333333-3333-4333-8333-333333333333",
                ownerId: context.ownerId,
                analysisId: context.analysisId,
                sourceId: context.sourceId,
                sourceSha256: context.inputSha256,
                retentionPolicyId: context.retentionPolicyId,
                createdAt: context.createdAt,
                nativePageTexts: pageTexts,
                selectedPages: [1, 3].map((pageNumber) => ({
                  pageNumber,
                  pageId: `page-${pageNumber}`,
                })),
                remainingDeadlineMs: 10_000,
                limits: { maxCharacters: 100_000, maxPages: 10 },
                allocation: {
                  id: "synthetic-review",
                  maxWallTimeMs: 10_000,
                  maxPages: 10,
                  externalApiFeeMicros: 0,
                },
                policy: {
                  purpose: "synthetic_local_test",
                  executionMode: "self_hosted",
                  allowThirdPartyProcessing: false,
                },
              },
              adapter: {
                versions: {
                  engine: "synthetic",
                  renderer: "synthetic",
                  languageData: "synthetic",
                },
                recognize,
              },
            },
          },
          mocks.pdf,
        );
      },
    );

    const processing = extraction.processExtractionStage(analysisId, { lease });
    if (writerAllows) await processing;
    else
      await expect(processing).rejects.toMatchObject({
        code: "ANALYSIS_LEASE_LOST",
      });

    expect(recognize).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "assert_analysis_stage_lease",
      "assert_analysis_stage_lease",
      "assert_analysis_stage_lease",
      "assert_analysis_stage_lease",
      "persist_analysis_stage_v2",
    ]);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({
      p_lease_fence: lease.leaseFence,
      p_operation: "persist_document_evidence",
      p_parameters: {
        p_page_count: 3,
        p_envelope: {
          inputSha256: checksum,
          sourceId: analysisId,
          status: "review_required",
          scoringEligible: false,
          ocrSource: {
            request: { nativePageTexts: pageTexts },
            pages: [{ pageNumber: 1 }, { pageNumber: 3 }],
          },
        },
      },
    });
  },
);

it("fails a stale scoring write without falling back to its legacy RPC", async () => {
  input.status = "scoring";
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name !== "persist_analysis_stage_v2",
    error: null,
  }));
  await expect(
    scoring.processScoringStage(analysisId, { lease }),
  ).rejects.toMatchObject({ code: "ANALYSIS_LEASE_LOST" });
  const writes = mocks.rpc.mock.calls.filter(
    ([name]) => name === "persist_analysis_stage_v2",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0][1]).toMatchObject({
    p_operation: "persist_deterministic_analysis",
    p_attempt: 2,
    p_lease_fence: lease.leaseFence,
    p_parameters: { p_analysis_id: analysisId },
  });
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    "persist_deterministic_analysis",
    expect.anything(),
  );
});

it("preserves the legacy scoring RPC shape when fencing is off and no lease is supplied", async () => {
  input.status = "scoring";
  expect(await scoring.processScoringStage(analysisId)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "persist_deterministic_analysis",
    expect.objectContaining({
      p_analysis_id: analysisId,
      p_parser_version: "parse-sim-v1",
      p_ruleset_version: "ats-rules-v4",
    }),
  );
});

it("fails closed on invalid ownership replies and rejected RPCs without raw error details", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { owned: true }, error: null });
  await expect(
    assertAnalysisStageLease({ rpc: mocks.rpc }, analysisId, { lease }),
  ).rejects.toMatchObject({ code: "ANALYSIS_FENCE_UNAVAILABLE" });
  mocks.rpc.mockRejectedValueOnce(new Error("private SQL detail"));
  await expect(
    assertAnalysisStageLease({ rpc: mocks.rpc }, analysisId, { lease }),
  ).rejects.toEqual(new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE"));
  await expect(
    persistAnalysisStage(
      { rpc: mocks.rpc },
      analysisId,
      "persist_deterministic_analysis",
      { p_analysis_id: lease.leaseFence },
      { lease },
    ),
  ).rejects.toMatchObject({ code: "ANALYSIS_FENCE_UNAVAILABLE" });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it("rejects a pre-aborted worker instead of reporting successful processing", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    processQueuedAnalysis("analysis-1", 1, controller.signal),
  ).rejects.toMatchObject({ code: "ANALYSIS_CANCELLED" });
  expect(mocks.extraction).not.toHaveBeenCalled();
  expect(mocks.scoring).not.toHaveBeenCalled();
  expect(mocks.qualitative).not.toHaveBeenCalled();
});

it("rejects cancellation between stages and never enters the next stage", async () => {
  const controller = new AbortController();
  mocks.extraction.mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(
    processQueuedAnalysis("analysis-1", 1, controller.signal),
  ).rejects.toMatchObject({ code: "ANALYSIS_CANCELLED" });
  expect(mocks.extraction).toHaveBeenCalledTimes(1);
  expect(mocks.scoring).not.toHaveBeenCalled();
  expect(mocks.qualitative).not.toHaveBeenCalled();
});

// Controlled PDF-layer metadata only: no native PDF runtime or database execution.
it.each([false, true])(
  "carries the actual declared review page total outside the immutable envelope, fenced=%s",
  async (fenced) => {
    const actualDocument = await vi.importActual<
      typeof import("../../app/lib/server/document-extraction")
    >("../../app/lib/server/document-extraction");
    const actualDetection = await vi.importActual<
      typeof import("../../app/lib/server/ocr/pdf-detection")
    >("../../app/lib/server/ocr/pdf-detection");
    const detection = await import("../../app/lib/server/ocr/pdf-detection");
    const profile = vi
      .spyOn(detection, "detectPdfTextProfile")
      .mockImplementation(actualDetection.detectPdfTextProfile);
    const bytes = new Uint8Array([37, 80, 68, 70]),
      pages = [
        "Experience\nSoftware Engineer at Orchard Labs\nBuilt services using Python; Developed tools using Git",
        "Projects\nDeveloped command helpers using Rust; Built tooling using Git",
      ];
    config.ANALYSIS_FENCING_ENABLED = fenced;
    input.resume_versions = {
      id: analysisId,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      storage_key: "synthetic-fixture",
      organization_id: analysisId,
    };
    mocks.download.mockResolvedValue(bytes);
    const parser = vi.fn().mockResolvedValue({
      totalPages: 2,
      text: pages.join("\n\n"),
      pageTexts: pages,
    });
    mocks.document.mockImplementationOnce((args) =>
      actualDocument.extractDocumentForReviewWithMetadata(args, parser),
    );
    try {
      await extraction.processExtractionStage(
        analysisId,
        fenced ? { lease } : {},
      );
      expect(parser).toHaveBeenCalledTimes(1);
      const persisted = mocks.rpc.mock.calls.find(
        ([name, args]) =>
          name === "persist_document_evidence" ||
          (name === "persist_analysis_stage_v2" &&
            args.p_operation === "persist_document_evidence"),
      );
      expect(persisted).toBeDefined();
      const parameters = fenced ? persisted![1].p_parameters : persisted![1];
      expect(parameters.p_envelope.nativeSource.pages).toHaveLength(2);
      expect(parameters.p_page_count).toBe(2);
      expect(parameters.p_envelope).not.toHaveProperty("pageCount");
    } finally {
      profile.mockRestore();
    }
  },
);
