import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  extractDocumentForReview,
  extractDocumentForReviewWithMetadata,
} from "../../app/lib/server/document-extraction";
import { RELIABILITY_REGRESSIONS } from "../fixtures/reliability-regressions";
import { extractionFailureStatus } from "../../app/lib/server/extraction-stage";
import type {
  LocalOcrAdapter,
  SelectiveOcrRequest,
} from "../../app/lib/server/ocr/selective";
const bytes = new Uint8Array([1, 2, 3]);
const args = {
  bytes,
  maxBytes: 100,
  maxPages: 10,
  maxCharacters: 10000,
  timeoutMs: 50,
  context: {
    id: "10000000-0000-4000-8000-000000000001",
    ownerId: "10000000-0000-4000-8000-000000000002",
    analysisId: "10000000-0000-4000-8000-000000000003",
    sourceId: "10000000-0000-4000-8000-000000000004",
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    createdAt: "2026-10-11T00:00:00.000Z",
    retentionPolicyId: "resume-retention-v1",
  },
};
const mixedTexts = ["Original native text from the reviewed fixture", ""];
const mixedLayers = {
  totalPages: 2,
  text: mixedTexts.join("\n\n"),
  pageTexts: mixedTexts,
};
function mixedOcr(): SelectiveOcrRequest {
  const {
    ownerId,
    analysisId,
    sourceId,
    inputSha256,
    createdAt,
    retentionPolicyId,
  } = args.context;
  return {
    schemaVersion: "selective-ocr-request-v1",
    attemptId: "10000000-0000-4000-8000-000000000005",
    ownerId,
    analysisId,
    sourceId,
    sourceSha256: inputSha256,
    createdAt,
    retentionPolicyId,
    nativePageTexts: mixedTexts,
    selectedPages: [{ pageId: "page-2", pageNumber: 2 }],
    remainingDeadlineMs: 10_000,
    limits: { maxPages: 10, maxCharacters: 10_000 },
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
  };
}
const versions = {
  engine: "local-test",
  renderer: "local-test",
  languageData: "local-test",
};
describe("document review extraction boundary", () => {
  it("propagates worker cancellation to an in-flight native parser", async () => {
    const worker = new AbortController();
    let parserSignal: AbortSignal | undefined;
    const extracting = extractDocumentForReview(
      { ...args, timeoutMs: 250, signal: worker.signal },
      vi.fn((_bytes, options) => {
        parserSignal = options.signal;
        return new Promise<never>(() => {});
      }),
    );
    worker.abort();
    await expect(extracting).rejects.toMatchObject({ name: "AbortError" });
    expect(parserSignal?.aborted).toBe(true);
  });

  it("checks retention binding before preparing recognition", async () => {
    const recognize = vi.fn();
    const assertOcrAdmission = vi.fn();
    await expect(
      extractDocumentForReview(
        {
          ...args,
          assertOcrAdmission,
          syntheticOcr: {
            request: { ...mixedOcr(), retentionPolicyId: "unrelated" },
            adapter: { versions, recognize },
          },
        },
        vi.fn().mockResolvedValue(mixedLayers),
      ),
    ).rejects.toThrow("OCR request source mismatch");
    expect(assertOcrAdmission).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it("keeps the active extraction deadline after an asynchronous OCR admission", async () => {
    const recognize = vi.fn<LocalOcrAdapter["recognize"]>(async () => ({
      durationMs: 1,
      pages: [
        {
          pageId: "page-2",
          pageNumber: 2,
          imageSha256: "b".repeat(64),
          widthPixels: 20,
          heightPixels: 20,
          rotation: 0,
          text: "",
          words: [],
        },
      ],
    }));
    const assertOcrAdmission = vi.fn(async () => {});
    const timeoutMs = 1_000;
    const result = await extractDocumentForReview(
      {
        ...args,
        timeoutMs,
        assertOcrAdmission,
        syntheticOcr: { request: mixedOcr(), adapter: { versions, recognize } },
      },
      vi.fn().mockResolvedValue(mixedLayers),
    );
    expect(assertOcrAdmission).toHaveBeenCalledExactlyOnceWith();
    expect(recognize.mock.calls[0][0].remainingDeadlineMs).toBeLessThanOrEqual(
      timeoutMs,
    );
    expect(result.nativeSource.pages.map((p) => p.text)).toEqual(mixedTexts);
    expect(result.scoringEligible).toBe(false);
  });
  it("declines late OCR admission after the worker cancels", async () => {
    const worker = new AbortController();
    let releaseAdmission!: () => void;
    const admitted = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    let notifyAdmission!: () => void;
    const admissionStarted = new Promise<void>((resolve) => {
      notifyAdmission = resolve;
    });
    const recognize = vi.fn();
    const extraction = extractDocumentForReview(
      {
        ...args,
        timeoutMs: 1_000,
        signal: worker.signal,
        assertOcrAdmission: async () => {
          notifyAdmission();
          return admitted;
        },
        syntheticOcr: { request: mixedOcr(), adapter: { versions, recognize } },
      },
      vi.fn().mockResolvedValue(mixedLayers),
    );
    await admissionStarted;
    worker.abort();
    releaseAdmission();
    await expect(extraction).rejects.toMatchObject({ name: "AbortError" });
    expect(recognize).not.toHaveBeenCalled();
  });
  it("preserves mixed native pages and withholds scores without approved OCR", async () => {
    const text = "Name: Jane Doe\nEmail: jane@example.com";
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue({ totalPages: 2, text, pageTexts: [text, ""] }),
    );
    expect(evidence.nativeSource.pages.map((p) => p.text)).toEqual([text, ""]);
    expect(evidence.status).toBe("unsupported");
    expect(evidence.scoringEligible).toBe(false);
    expect(evidence.blockers).toContain("missing_ocr_pages");
  });
  it("never invokes extraction for altered bytes", async () => {
    const extractor = vi.fn();
    await expect(
      extractDocumentForReview(
        { ...args, bytes: new Uint8Array([4]) },
        extractor,
      ),
    ).rejects.toThrow("checksum");
    expect(extractor).not.toHaveBeenCalled();
  });
  it.each([
    [{ maxBytes: 2 }, "OVERSIZED"],
    [{ bytes: new Uint8Array([4]) }, "CHECKSUM_MISMATCH"],
  ] as const)(
    "classifies rejected review input as a terminal worker failure",
    async (overrides, code) => {
      const parser = vi.fn();
      const error = await extractDocumentForReview(
        { ...args, ...overrides },
        parser,
      ).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code });
      expect(extractionFailureStatus(error)).toBe("failed");
      expect(parser).not.toHaveBeenCalled();
    },
  );
  it("bounds the native extraction deadline", async () => {
    await expect(
      extractDocumentForReview(
        { ...args, timeoutMs: 5 },
        vi.fn(() => new Promise<never>(() => {})),
      ),
    ).rejects.toThrow("timeout");
  });
  it("rejects a parser result received after the elapsed deadline before the timer callback can run", async () => {
    let elapsed = 0;
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => elapsed);
    try {
      await expect(
        extractDocumentForReview(
          args,
          vi.fn(async () => {
            elapsed = args.timeoutMs;
            return {
              totalPages: 1,
              text: "Synthetic native page",
              pageTexts: ["Synthetic native page"],
            };
          }),
        ),
      ).rejects.toMatchObject({ code: "TIMEOUT" });
    } finally {
      clock.mockRestore();
    }
  });
  it("native presence still requires uncalibrated review", async () => {
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue({
        totalPages: 1,
        text: "Jane Smith",
        pageTexts: ["Jane Smith"],
      }),
    );
    expect(evidence.status).toBe("review_required");
    expect(evidence.scoringEligible).toBe(false);
  });
  it.each(
    RELIABILITY_REGRESSIONS.nativeProfile.filter((testCase) =>
      testCase.expectedAdmission.startsWith("reject_"),
    ),
  )(
    "rejects $id before materializing incomplete evidence",
    async (testCase) => {
      await expect(
        extractDocumentForReview(
          args,
          vi.fn().mockResolvedValue(testCase.input),
        ),
      ).rejects.toMatchObject({ code: "INVALID_PDF" });
    },
  );
  it.each(
    RELIABILITY_REGRESSIONS.nativeProfile.filter((testCase) =>
      ["scanned", "mixed"].includes(testCase.expectedAdmission),
    ),
  )("preserves explicit no-text evidence for $id", async (testCase) => {
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue(testCase.input),
    );
    expect(evidence.nativeSource.pages).toHaveLength(testCase.input.totalPages);
    expect(evidence.status).toBe("unsupported");
    expect(evidence.scoringEligible).toBe(false);
    expect(evidence.blockers).toContain("missing_ocr_pages");
  });
  it("rejects sparse page arrays with the typed extraction error", async () => {
    await expect(
      extractDocumentForReview(
        args,
        vi.fn().mockResolvedValue({
          totalPages: 2,
          text: "",
          pageTexts: new Array<string>(2),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_PDF" });
  });
  it.each(
    RELIABILITY_REGRESSIONS.nativeProfile.filter(
      (testCase) =>
        testCase.id === "native-profile-single-page-legacy-fallback",
    ),
  )("materializes $id as exactly one uncalibrated page", async (testCase) => {
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue(testCase.input),
    );
    expect(evidence.nativeSource.pages.map((page) => page.text)).toEqual([
      testCase.input.text,
    ]);
    expect(evidence.status).toBe("review_required");
    expect(evidence.scoringEligible).toBe(false);
  });
});

describe("declared document page-count metadata", () => {
  const pages = [
    "Experience\nSoftware Engineer at Orchard Labs\nBuilt services using Python; Developed tools using Git",
    "Projects\nDeveloped command helpers using Rust; Built tooling using Git",
  ];
  it("carries the actual parser total with one parse and preserves the legacy envelope bytes", async () => {
    const layers = {
      totalPages: 2,
      text: pages.join("\n\n"),
      pageTexts: pages,
    };
    const parser = vi.fn().mockResolvedValue(layers);
    const result = await extractDocumentForReviewWithMetadata(args, parser);
    expect(parser).toHaveBeenCalledExactlyOnceWith(args.bytes, {
      maxPages: args.maxPages,
      maxCharacters: args.maxCharacters,
      signal: expect.any(AbortSignal),
    });
    expect(result.pageCount).toBe(layers.totalPages);
    expect(result.envelope.nativeSource.pages.map((p) => p.text)).toEqual(
      pages,
    );
    expect(result.envelope).not.toHaveProperty("pageCount");
    expect(result.envelope).not.toHaveProperty("totalPages");
    const legacyParser = vi.fn().mockResolvedValue(layers);
    expect(
      JSON.stringify(await extractDocumentForReview(args, legacyParser)),
    ).toBe(JSON.stringify(result.envelope));
    expect(legacyParser).toHaveBeenCalledTimes(1);
    expect(result.envelope.scoringEligible).toBe(false);
  });
  it("retains declared blank pages without manufacturing complete OCR or numerical authority", async () => {
    const parser = vi.fn().mockResolvedValue({
      totalPages: 2,
      text: pages[0],
      pageTexts: [pages[0], ""],
    });
    const result = await extractDocumentForReviewWithMetadata(args, parser);
    expect(result.pageCount).toBe(2);
    expect(result.envelope.nativeSource.pages.map((p) => p.text)).toEqual([
      pages[0],
      "",
    ]);
    expect(result.envelope.status).toBe("unsupported");
    expect(result.envelope.blockers).toContain("missing_ocr_pages");
    expect(result.envelope.scoringEligible).toBe(false);
    expect(parser).toHaveBeenCalledTimes(1);
  });
  it.each([
    undefined,
    null,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "does not infer an unknown/invalid declared total %s from valid page texts",
    async (totalPages) => {
      const parser = vi.fn().mockResolvedValue({
        totalPages,
        text: pages.join("\n\n"),
        pageTexts: pages,
      });
      await expect(
        extractDocumentForReviewWithMetadata(args, parser),
      ).rejects.toMatchObject({ code: "INVALID_PDF" });
      expect(parser).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    undefined,
    [pages[0]],
    [pages[0], pages[1], ""],
    new Array<string>(2),
    [pages[0], 1],
  ])(
    "refuses unrepresented or malformed full page texts %#",
    async (pageTexts) => {
      const parser = vi.fn().mockResolvedValue({
        totalPages: 2,
        text: pages.join("\n\n"),
        pageTexts,
      });
      await expect(
        extractDocumentForReviewWithMetadata(args, parser),
      ).rejects.toMatchObject({ code: "INVALID_PDF" });
      expect(parser).toHaveBeenCalledTimes(1);
    },
  );
  it("enforces the configured page maximum on the actual declared total", async () => {
    const parser = vi.fn().mockResolvedValue({
      totalPages: 2,
      text: pages.join("\n\n"),
      pageTexts: pages,
    });
    await expect(
      extractDocumentForReviewWithMetadata({ ...args, maxPages: 1 }, parser),
    ).rejects.toMatchObject({ code: "PAGE_LIMIT" });
    expect(parser).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "denies invalid configured page bound %s before parsing",
    async (maxPages) => {
      const parser = vi.fn();
      await expect(
        extractDocumentForReviewWithMetadata({ ...args, maxPages }, parser),
      ).rejects.toMatchObject({ code: "INVALID_PDF" });
      expect(parser).not.toHaveBeenCalled();
    },
  );
  it("preserves the explicit one-page legacy aggregate fallback using its declared total", async () => {
    const result = await extractDocumentForReviewWithMetadata(
      args,
      vi.fn().mockResolvedValue({ totalPages: 1, text: pages[0] }),
    );
    expect(result.pageCount).toBe(1);
    expect(result.envelope.nativeSource.pages.map((p) => p.text)).toEqual([
      pages[0],
    ]);
  });
  it("never parses altered source bytes for the metadata path", async () => {
    const parser = vi.fn();
    await expect(
      extractDocumentForReviewWithMetadata(
        { ...args, bytes: new Uint8Array([4]) },
        parser,
      ),
    ).rejects.toThrow("checksum");
    expect(parser).not.toHaveBeenCalled();
  });
});
