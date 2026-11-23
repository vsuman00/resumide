import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPaddleOcrReview } from "../../app/lib/server/ocr/paddle-extraction";
import {
  parsePaddleOcrConfig,
  PADDLEOCR_CONSENT_VERSION,
} from "../../app/lib/server/ocr/paddle-config";
import { CONTACT_PDF_STREAM, syntheticPdf } from "../fixtures/native-pdf";
import { extractPdfTextLayers } from "../../app/lib/server/ocr/pdf-detection";

afterEach(() => vi.useRealTimers());

const source = {
  ownerId: "10000000-0000-4000-8000-000000000001",
  sourceId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
};
const policy = () =>
  parsePaddleOcrConfig({
    PADDLEOCR_ENABLED: "true",
    PADDLEOCR_ACCESS_TOKEN: "synthetic-token",
    PADDLEOCR_RESULT_HOSTS: "contract-test.bj.bcebos.com",
    PADDLEOCR_DISCLOSURE_POLICY_ID: "synthetic-only",
  });
function input(bytes: Uint8Array) {
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    ...source,
    bytes,
    sourceSha256,
    maxPdfPages: 10,
    consent: {
      ...source,
      sourceSha256,
      policyVersion: PADDLEOCR_CONSENT_VERSION,
      disclosurePolicyId: "synthetic-only",
      wholeDocumentDisclosureAccepted: true,
    },
  };
}
describe("native PDF to hosted OCR contract integration (no live provider)", () => {
  it("enforces the actual PDF page count before provider admission", async () => {
    const request = input(syntheticPdf([CONTACT_PDF_STREAM, ""]));
    request.maxPdfPages = 1;
    const fetch = vi.fn<typeof globalThis.fetch>();
    const admit = vi.fn(async () => true);
    expect(
      await extractPaddleOcrReview(request, policy(), {
        fetch,
        admit,
        recordAttempt: async () => undefined,
      }),
    ).toMatchObject({ status: "failed", code: "resource_limit" });
    expect(fetch).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });

  it("retains acknowledged receipts when the caller cancels the hosted phase", async () => {
    const controller = new AbortController();
    let acknowledged: (() => void) | undefined;
    const recorded = new Promise<void>((resolve) => {
      acknowledged = resolve;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json({ code: 0, data: { jobId: "retained" } }),
      );
    const extractor = vi.fn<typeof extractPdfTextLayers>().mockResolvedValue({
      totalPages: 2,
      text: "Native first page",
      pageTexts: ["Native first page", ""],
    });
    const pending = extractPaddleOcrReview(
      input(syntheticPdf([CONTACT_PDF_STREAM, ""])),
      policy(),
      {
        fetch,
        admit: async () => true,
        signal: controller.signal,
        recordAttempt: async (receipt) => {
          if (receipt.state === "acknowledged") acknowledged?.();
        },
      },
      extractor,
    );
    await recorded;
    controller.abort();
    expect(await pending).toMatchObject({
      status: "failed",
      code: "cancelled",
      attempts: [{ pageNumber: 2, state: "acknowledged", jobId: "retained" }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled native parser without making provider requests", async () => {
    vi.useFakeTimers();
    const config = policy();
    config.PADDLEOCR_TIMEOUT_MS = 100;
    const fetch = vi.fn<typeof globalThis.fetch>();
    const extractor = vi
      .fn<typeof extractPdfTextLayers>()
      .mockImplementation(() => new Promise(() => undefined));
    const pending = extractPaddleOcrReview(
      input(syntheticPdf()),
      config,
      { fetch, admit: async () => true, recordAttempt: async () => undefined },
      extractor,
    );
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toMatchObject({ status: "failed", code: "timeout" });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("parses a real synthetic PDF natively without admission or API traffic", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const admit = vi.fn(async () => true);
    const output = await extractPaddleOcrReview(
      input(syntheticPdf()),
      policy(),
      { fetch, admit, recordAttempt: async () => undefined },
    );
    expect(output.status).toBe("not_needed");
    expect(output.nativePageTexts.join("\n")).toContain("Alex Example");
    expect(fetch).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });

  it("uses the actual native parser's missing page, preserving all native text", async () => {
    const responses = [
      Response.json({ code: 0, data: { jobId: "synthetic-page-2" } }),
      Response.json({
        code: 0,
        data: {
          state: "done",
          resultUrl: {
            jsonUrl: "https://contract-test.bj.bcebos.com/result.jsonl",
          },
        },
      }),
      new Response(
        JSON.stringify({
          result: {
            ocrResults: [
              {
                prunedResult: {
                  rec_texts: ["Role: Synthetic Developer"],
                  rec_scores: [0.99],
                },
              },
            ],
          },
        }),
      ),
    ];
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected network");
        return response;
      });
    const output = await extractPaddleOcrReview(
      input(syntheticPdf([CONTACT_PDF_STREAM, ""])),
      policy(),
      { fetch, admit: async () => true, recordAttempt: async () => undefined },
    );
    expect(output.status).toBe("review_required");
    expect(output.nativePageTexts[0]).toContain("Alex Example");
    expect(output.nativePageTexts[1]).toBe("");
    expect(output.scoringEligible).toBe(false);
    if (output.status !== "review_required") throw new Error("Expected review");
    expect(output.pages.map((page) => page.pageNumber)).toEqual([2]);
    expect((fetch.mock.calls[0][1]?.body as FormData).get("pageRanges")).toBe(
      "2",
    );
    expect(output.source.sourceSha256).toBe(
      input(syntheticPdf([CONTACT_PDF_STREAM, ""])).sourceSha256,
    );
  });

  it.each(["malformed", "page_limit", "checksum"])(
    "rejects %s before API disclosure",
    async (scenario) => {
      const request = input(
        scenario === "malformed"
          ? new TextEncoder().encode("invalid")
          : syntheticPdf(),
      );
      if (scenario === "page_limit") request.maxPdfPages = 0;
      if (scenario === "checksum") request.sourceSha256 = "b".repeat(64);
      const fetch = vi.fn<typeof globalThis.fetch>();
      expect(
        await extractPaddleOcrReview(request, policy(), {
          fetch,
          admit: async () => true,
          recordAttempt: async () => undefined,
        }),
      ).toMatchObject({ status: "failed", scoringEligible: false });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
