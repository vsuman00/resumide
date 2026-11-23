import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractPdfForAnalysis,
  OcrRequiredError,
} from "../../../app/lib/server/extraction-stage";
import {
  defineOcrPolicy,
  type OcrRuntime,
} from "../../../app/lib/server/ocr/adapter";
import { detectPdfTextProfile } from "../../../app/lib/server/ocr/pdf-detection";
import { RELIABILITY_REGRESSIONS } from "../../fixtures/reliability-regressions";

const limits = {
  bytes: new Uint8Array([37, 80, 68, 70, 45]),
  maxBytes: 100,
  maxPages: 10,
  maxCharacters: 100_000,
  timeoutMs: 100,
};

const unsupportedRuntime = {
  adapter: {
    id: "unsupported",
    version: "none",
    capabilities: {
      processingRegions: [],
      retentionDays: 0,
      maxCostMicrosPerPage: 0,
    },
    recognize: vi.fn(),
  },
  policy: defineOcrPolicy({
    approval: "not_approved",
    enabled: false,
    allowThirdPartyProcessing: false,
    processingRegion: "ap-south-1",
    maxRetentionDays: 0,
    timeoutMs: 100,
    maxCostMicros: 0,
    minimumConfidence: 0.85,
  }),
  privacy: {
    consentGranted: false,
    thirdPartyProcessingAllowed: false,
    purpose: "resume_text_extraction" as const,
  },
} satisfies OcrRuntime;

describe("OCR extraction router", () => {
  afterEach(() => vi.useRealTimers());

  it.each([0, 60])(
    "keeps the total deadline active during OCR after %i ms of native work",
    async (nativeDuration) => {
      vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "performance"],
      });
      let recognitionSignal: AbortSignal | undefined;
      const runtime: OcrRuntime = {
        ...unsupportedRuntime,
        policy: defineOcrPolicy({
          ...unsupportedRuntime.policy,
          approval: "approved",
          enabled: true,
          allowThirdPartyProcessing: true,
          maxCostMicros: 10,
          timeoutMs: 1_000,
        }),
        privacy: {
          ...unsupportedRuntime.privacy,
          consentGranted: true,
          thirdPartyProcessingAllowed: true,
        },
        adapter: {
          ...unsupportedRuntime.adapter,
          capabilities: {
            processingRegions: ["ap-south-1"],
            retentionDays: 0,
            maxCostMicrosPerPage: 5,
          },
          async recognize(_, signal) {
            recognitionSignal = signal;
            return new Promise<never>(() => undefined);
          },
        },
      };
      let settled = false;
      const outcome = extractPdfForAnalysis(
        limits,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, nativeDuration));
          return { totalPages: 1, text: "", pageTexts: [""] };
        },
        runtime,
      ).then(
        () => {
          settled = true;
          return null;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );

      await vi.advanceTimersByTimeAsync(99);
      expect(settled).toBe(false);
      expect(recognitionSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expect(recognitionSignal?.aborted).toBe(true);
      expect(await outcome).toMatchObject({ code: "TIMEOUT" });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not start OCR after native extraction exhausts the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const recognize = vi.fn();
    const runtime = {
      ...unsupportedRuntime,
      adapter: { ...unsupportedRuntime.adapter, recognize },
    };
    const outcome = extractPdfForAnalysis(
      limits,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { totalPages: 1, text: "", pageTexts: [""] };
      },
      runtime,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(20);
    expect(recognize).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a successful OCR result after the elapsed extraction deadline", async () => {
    let elapsed = 0;
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => elapsed);
    const runtime: OcrRuntime = {
      ...unsupportedRuntime,
      policy: {
        ...unsupportedRuntime.policy,
        approval: "approved",
        enabled: true,
        allowThirdPartyProcessing: true,
        maxCostMicros: 10,
      },
      privacy: {
        ...unsupportedRuntime.privacy,
        consentGranted: true,
        thirdPartyProcessingAllowed: true,
      },
      adapter: {
        ...unsupportedRuntime.adapter,
        capabilities: {
          processingRegions: ["ap-south-1"],
          retentionDays: 0,
          maxCostMicrosPerPage: 5,
        },
        async recognize() {
          elapsed = limits.timeoutMs;
          return {
            pageTexts: ["Synthetic recognized text"],
            confidence: 1,
            costMicros: 5,
          };
        },
      },
    };
    try {
      await expect(
        extractPdfForAnalysis(
          limits,
          vi.fn().mockResolvedValue({
            totalPages: 1,
            text: "",
            pageTexts: [""],
          }),
          runtime,
        ),
      ).rejects.toMatchObject({ code: "TIMEOUT" });
    } finally {
      clock.mockRestore();
    }
  });

  it("persists text PDFs without calling OCR", async () => {
    const result = await extractPdfForAnalysis(
      limits,
      vi.fn().mockResolvedValue({
        totalPages: 1,
        text: "Text resume",
        pageTexts: ["Text resume"],
      }),
      unsupportedRuntime,
    );
    expect(result.text).toBe("Text resume");
    expect(result.warnings).toEqual([]);
    expect(unsupportedRuntime.adapter.recognize).not.toHaveBeenCalled();
  });

  it.each([
    ["scanned", ["   "]],
    ["mixed", ["Text resume", "   "]],
  ])(
    "routes %s PDFs to an explicit unsupported OCR state",
    async (_, pageTexts) => {
      await expect(
        extractPdfForAnalysis(
          limits,
          vi.fn().mockResolvedValue({
            totalPages: pageTexts.length,
            text: pageTexts.join("\n"),
            pageTexts,
          }),
          unsupportedRuntime,
        ),
      ).rejects.toMatchObject({
        reason: "unsupported",
      } satisfies Partial<OcrRequiredError>);
    },
  );
});

describe("native page-boundary admission", () => {
  const rejected = RELIABILITY_REGRESSIONS.nativeProfile.filter((testCase) =>
    testCase.expectedAdmission.startsWith("reject_"),
  );
  const controls = RELIABILITY_REGRESSIONS.nativeProfile.filter(
    (testCase) => !testCase.expectedAdmission.startsWith("reject_"),
  );

  it.each(rejected)(
    "rejects $id instead of copying aggregate text",
    (testCase) => {
      expect(() => detectPdfTextProfile(testCase.input)).toThrow("INVALID_PDF");
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid declared page count %s",
    (totalPages) => {
      expect(() =>
        detectPdfTextProfile({ totalPages, text: "", pageTexts: [] }),
      ).toThrow("INVALID_PDF");
    },
  );

  it("rejects a sparse page array instead of treating holes as native text", () => {
    expect(() =>
      detectPdfTextProfile({
        totalPages: 2,
        text: "",
        pageTexts: new Array<string>(2),
      }),
    ).toThrow("INVALID_PDF");
  });

  it("does not route sparse page arrays as complete native evidence", async () => {
    await expect(
      extractPdfForAnalysis(
        limits,
        vi.fn().mockResolvedValue({
          totalPages: 2,
          text: "",
          pageTexts: new Array<string>(2),
        }),
        unsupportedRuntime,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PDF" });
    expect(unsupportedRuntime.adapter.recognize).not.toHaveBeenCalled();
  });

  it.each(rejected)(
    "does not route $id as complete native evidence",
    async (testCase) => {
      await expect(
        extractPdfForAnalysis(
          limits,
          vi.fn().mockResolvedValue(testCase.input),
          unsupportedRuntime,
        ),
      ).rejects.toMatchObject({ code: "INVALID_PDF" });
      expect(unsupportedRuntime.adapter.recognize).not.toHaveBeenCalled();
    },
  );

  it.each(controls)("preserves $id availability", (testCase) => {
    expect(detectPdfTextProfile(testCase.input).documentType).toBe(
      testCase.expectedAdmission,
    );
  });
});
