import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfBytes = new Uint8Array([1]);
const mocks = vi.hoisted(() => ({
  enabled: false,
  layoutEnabled: false,
  rpc: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: () => ({
    NATIVE_EVIDENCE_ENABLED: mocks.enabled,
    NATIVE_LAYOUT_ENABLED: mocks.layoutEnabled,
    MAX_UPLOAD_BYTES: 1_000,
    MAX_PDF_PAGES: 2,
    MAX_EXTRACTED_CHARACTERS: 10_000,
    EXTRACTION_TIMEOUT_MS: 1_000,
  }),
}));
vi.mock("../../app/lib/server/storage", () => ({
  createResumeStorage: () => ({ download: async () => pdfBytes }),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              status: "extracting",
              resume_versions: {
                storage_key: "owned.pdf",
                checksum: createHash("sha256").update(pdfBytes).digest("hex"),
              },
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("../../app/lib/server/ocr/pdf-detection", () => ({
  extractPdfTextLayers: async (
    _bytes: Uint8Array,
    limits: { includeLayout?: boolean },
  ) => ({
    totalPages: 1,
    text: "Alex Example\nalex@example.test",
    pageTexts: ["Alex Example\nalex@example.test"],
    ...(limits.includeLayout
      ? {
          nativeLayout: {
            schemaVersion: "native-layout-v1",
            pages: [
              {
                pageId: "page-1",
                pageNumber: 1,
                text: "Alex Example\nalex@example.test",
                width: 612,
                height: 792,
                rotation: 0,
                coordinateSystem: "normalized_top_left",
                readingOrder: "pdf_source_order",
                state: "uncalibrated",
                warnings: [],
                blocks: [
                  {
                    id: "page-1-run-1",
                    pageId: "page-1",
                    text: "Alex Example",
                    start: 0,
                    end: 12,
                    sourceOrder: 0,
                    box: { x: 0.1, y: 0.1, width: 0.2, height: 0.02 },
                    geometry: "approximate_font_em",
                  },
                  {
                    id: "page-1-run-2",
                    pageId: "page-1",
                    text: "alex@example.test",
                    start: 13,
                    end: 30,
                    sourceOrder: 1,
                    box: { x: 0.1, y: 0.2, width: 0.2, height: 0.02 },
                    geometry: "approximate_font_em",
                  },
                ],
              },
            ],
          },
        }
      : {}),
  }),
  detectPdfTextProfile: () => ({ documentType: "text" }),
}));

import { processExtractionStage } from "../../app/lib/server/extraction-stage";

describe("native evidence worker rollout", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.layoutEnabled = false;
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });

  it("opts into validated layout persistence and source evidence together", async () => {
    mocks.layoutEnabled = true;
    await processExtractionStage("owned-analysis");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "persist_native_layout_extraction",
      expect.objectContaining({
        p_native_layout: expect.objectContaining({
          schemaVersion: "native-layout-v1",
        }),
        p_evidence_graph: expect.objectContaining({
          schemaVersion: "native-evidence-v1",
        }),
      }),
    );
  });

  it("keeps the legacy RPC signature while disabled", async () => {
    await processExtractionStage("owned-analysis");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("persist_analysis_extraction");
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_evidence_graph");
  });

  it("persists grounded native evidence when enabled", async () => {
    mocks.enabled = true;
    await processExtractionStage("owned-analysis");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "persist_analysis_extraction",
      expect.objectContaining({
        p_analysis_id: "owned-analysis",
        p_evidence_graph: expect.objectContaining({
          schemaVersion: "native-evidence-v1",
          assertions: expect.arrayContaining([
            expect.objectContaining({
              field: "email",
              value: "alex@example.test",
              state: "review_required",
            }),
          ]),
        }),
      }),
    );
  });

  it("does not report successful extraction when persistence fails", async () => {
    mocks.enabled = true;
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(processExtractionStage("owned-analysis")).rejects.toThrow(
      "Extraction persistence failed.",
    );
  });
});
