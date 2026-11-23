import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectPageText,
  PAGE_TEXT_AVAILABILITY_UNITS,
} from "../../app/lib/page-text-diagnostics";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
  type DocumentEvidence,
} from "../../app/lib/server/document-evidence";
import { extractDocumentForReview } from "../../app/lib/server/document-extraction";
import * as pdfDetection from "../../app/lib/server/ocr/pdf-detection";
import {
  loadEvidenceReview,
  type EvidenceReviewClient,
} from "../../app/lib/server/evidence-review";
import legacy from "../fixtures/evidence-fields-v1-envelope.json";

afterEach(() => vi.restoreAllMocks());

const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-11-13T00:00:00.000Z",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
};

function storedFixture(evidence: DocumentEvidence) {
  const analysis = {
    id: evidence.analysisId,
    owner_id: evidence.ownerId,
    resume_version_id: evidence.sourceId,
  };
  const attempt = {
    id: evidence.id,
    analysis_id: evidence.analysisId,
    owner_id: evidence.ownerId,
    resume_version_id: evidence.sourceId,
    input_sha256: evidence.inputSha256,
    attempt_number: 1,
    envelope: evidence,
  };
  const rows = [analysis, attempt, null];
  const calls: { table: string; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const record = { table, filters: [] as unknown[][] };
    calls.push(record);
    const data = rows.shift();
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        record.filters.push(args);
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      abortSignal: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
    };
    return chain;
  });
  const client = { from } as unknown as EvidenceReviewClient;
  return {
    analysis,
    attempt,
    calls,
    load: () =>
      loadEvidenceReview(client, evidence.analysisId, evidence.ownerId),
  };
}

function storedReview(pageTexts: string[]) {
  return storedFixture(
    reconcileDocumentEvidence(context, buildNativeEvidence(pageTexts)),
  ).load();
}

function freeze(value: unknown) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

describe("owned native page review diagnostics", () => {
  it("reports replacement characters despite eight-unit native availability", async () => {
    const review = await storedReview(["\uFFFD".repeat(8)]);
    expect(review).toMatchObject({
      scoringEligible: false,
      nativePageDiagnostics: {
        modelVersion: "native-page-review/1.0.0",
        reliability: "unassessed",
        pages: [
          {
            pageId: "page-1",
            pageNumber: 1,
            nativeTextAvailable: true,
            nonWhitespaceUtf16Units: 8,
            reasons: ["replacement_character"],
            duplicatePageIds: [],
          },
        ],
      },
    });
  });

  it("reports exact duplicate readable native pages without promoting reliability", async () => {
    const review = await storedReview(["Native page text", "Native page text"]);
    expect(review).toMatchObject({
      scoringEligible: false,
      nativePageDiagnostics: {
        reliability: "unassessed",
        pages: [
          {
            pageId: "page-1",
            reasons: ["duplicate_native_page_text"],
            duplicatePageIds: ["page-2"],
          },
          {
            pageId: "page-2",
            reasons: ["duplicate_native_page_text"],
            duplicatePageIds: ["page-1"],
          },
        ],
      },
    });
  });

  it("preserves exact source strings, Unicode offsets and every stored field", async () => {
    const evidence = reconcileDocumentEvidence(
      context,
      buildNativeEvidence([
        "😀 Native\n\uFFFD\uD800\u0000 exact source\n",
        "1234567",
      ]),
    );
    const original = JSON.stringify(evidence);
    const fixture = storedFixture(evidence);
    freeze(evidence);
    const review = await fixture.load();
    expect(JSON.stringify(review.evidence)).toBe(original);
    expect(JSON.stringify(evidence)).toBe(original);
    expect(review.evidence.nativeSource.spans[0]).toMatchObject({
      start: 0,
      end: 8,
      text: "😀 Native",
    });
    expect(review.evidence).not.toHaveProperty("nativePageDiagnostics");
    expect(review.scoringEligible).toBe(false);
    expect(
      fixture.calls.every((call) =>
        call.filters.some(
          (filter) => filter[0] === "owner_id" && filter[1] === context.ownerId,
        ),
      ),
    ).toBe(true);
    for (const page of review.nativePageDiagnostics.pages) {
      expect(Object.keys(page).sort()).toEqual([
        "duplicatePageIds",
        "nativeTextAvailable",
        "nonWhitespaceUtf16Units",
        "pageId",
        "pageNumber",
        "reasons",
      ]);
    }
  });

  it("projects historical stored evidence without adopting the current extractor", async () => {
    const original = JSON.stringify(legacy);
    const evidence = DocumentEvidenceSchema.parse(legacy);
    const review = await storedFixture(evidence).load();
    expect(JSON.stringify(review.evidence)).toBe(original);
    expect(review.evidence).not.toHaveProperty("fieldExtractorVersion");
    expect(review.targets.binding.fieldExtractorVersion).toBeNull();
    expect(review.nativePageDiagnostics.reliability).toBe("unassessed");
    expect(review.nativePageDiagnostics.pages[0].nativeTextAvailable).toBe(
      true,
    );
    expect(review.scoringEligible).toBe(false);
  });

  it.each([
    "analysis owner",
    "attempt owner",
    "source hash",
    "source spans",
    "score",
  ])(
    "rejects invalid %s before deriving page diagnostics",
    async (mutation) => {
      const evidence = reconcileDocumentEvidence(
        context,
        buildNativeEvidence(["Native source text"]),
      );
      const fixture = storedFixture(evidence);
      if (mutation === "analysis owner")
        fixture.analysis.owner_id = "10000000-0000-4000-8000-000000000099";
      if (mutation === "attempt owner")
        fixture.attempt.owner_id = "10000000-0000-4000-8000-000000000099";
      if (mutation === "source hash")
        fixture.attempt.input_sha256 = "b".repeat(64);
      if (mutation === "source spans")
        evidence.nativeSource.pages[0].text += " altered";
      if (mutation === "score")
        Object.assign(evidence, { scoringEligible: true });
      const derive = vi.spyOn(pdfDetection, "deriveNativePageDiagnostics");
      await expect(fixture.load()).rejects.toMatchObject({
        status: mutation === "analysis owner" ? 404 : 422,
      });
      expect(derive).not.toHaveBeenCalled();
    },
  );

  it.each(["unsupported", "engine_failure", "timeout"] as const)(
    "retains the recorded %s OCR state independently of content reasons",
    async (code) => {
      const evidence = reconcileDocumentEvidence(
        context,
        buildNativeEvidence(["\uFFFD".repeat(8), ""]),
        null,
        { code },
      );
      const review = await storedFixture(evidence).load();
      expect(review.evidence).toEqual(evidence);
      expect(review.evidence.ocrFailure).toEqual({ code });
      expect(review.evidence.status).toBe(
        code === "unsupported" ? "unsupported" : "failed",
      );
      expect(review.evidence.blockers).toContain("ocr_failure");
      expect(review.evidence.blockers).toContain("missing_ocr_pages");
      expect(
        review.nativePageDiagnostics.pages.map((page) => page.reasons),
      ).toEqual([["replacement_character"], ["no_native_text"]]);
      expect(review.scoringEligible).toBe(false);
    },
  );

  it.each([
    ["Readable native page"],
    ["\uFFFD".repeat(8)],
    ["Exact native text", "Exact native text"],
  ])("keeps native-only control %j at zero OCR calls", async (...pageTexts) => {
    const bytes = new Uint8Array([1, 2, 3]);
    const inputSha256 = createHash("sha256").update(bytes).digest("hex");
    const recognize = vi.fn(async () => {
      throw new Error("Native-only control must not recognize pages");
    });
    const evidence = await extractDocumentForReview(
      {
        bytes,
        context: { ...context, inputSha256 },
        maxBytes: 100,
        maxPages: 20,
        maxCharacters: 200_000,
        timeoutMs: 1000,
        syntheticOcr: {
          adapter: {
            versions: {
              engine: "synthetic",
              renderer: "synthetic",
              languageData: "synthetic",
            },
            recognize,
          },
          request: {
            schemaVersion: "selective-ocr-request-v1",
            attemptId: context.id,
            ownerId: context.ownerId,
            analysisId: context.analysisId,
            sourceId: context.sourceId,
            createdAt: context.createdAt,
            retentionPolicyId: context.retentionPolicyId,
            sourceSha256: inputSha256,
            nativePageTexts: pageTexts,
            selectedPages: [],
            remainingDeadlineMs: 1000,
            limits: { maxCharacters: 200_000, maxPages: 20 },
            allocation: {
              id: "native-only-control",
              maxWallTimeMs: 1000,
              maxPages: 1,
              externalApiFeeMicros: 0,
            },
            policy: {
              executionMode: "self_hosted",
              purpose: "synthetic_local_test",
              allowThirdPartyProcessing: false,
            },
          },
        },
      },
      vi.fn().mockResolvedValue({
        totalPages: pageTexts.length,
        text: pageTexts.join("\n\n"),
        pageTexts,
      }),
    );
    const review = await storedFixture(evidence).load();
    expect(recognize).not.toHaveBeenCalled();
    expect(evidence.ocrSource).toBeNull();
    expect(evidence.ocrFailure).toBeNull();
    expect(evidence.status).toBe("review_required");
    expect(evidence.scoringEligible).toBe(false);
    expect(
      review.nativePageDiagnostics.pages.every(
        (page) => page.nativeTextAvailable,
      ),
    ).toBe(true);
    expect(review.nativePageDiagnostics.reliability).toBe("unassessed");
    expect(review.scoringEligible).toBe(false);
  });
});

describe("bounded native diagnostic projection", () => {
  it("uses existing whitespace and UTF16-unit availability at zero, seven and eight", () => {
    const native = buildNativeEvidence([
      "",
      " \t\n\r\u000B\u000C\u00A0\u2028\u2029",
      "1234567",
      "12345678",
      "😀".repeat(4),
    ]);
    expect(
      pdfDetection.deriveNativePageDiagnostics(native).pages.map((page) => ({
        count: page.nonWhitespaceUtf16Units,
        available: page.nativeTextAvailable,
        reasons: page.reasons,
      })),
    ).toEqual([
      { count: 0, available: false, reasons: ["no_native_text"] },
      { count: 0, available: false, reasons: ["no_native_text"] },
      { count: 7, available: false, reasons: ["limited_native_text"] },
      { count: 8, available: true, reasons: [] },
      { count: 8, available: true, reasons: [] },
    ]);
    expect(
      pdfDetection.detectPdfTextProfile({
        totalPages: native.pages.length,
        text: native.pages.map((page) => page.text).join("\n\n"),
        pageTexts: native.pages.map((page) => page.text),
      }).pagesNeedingOcr,
    ).toEqual([1, 2, 3]);
  });

  it.each([
    "\uD800",
    "\uDC00",
    "\uD800x",
    "\uD800\uD800",
    "\uDC00\uDC00",
    "\uDC00\uD800",
    "\uD800\uD800\uDC00",
  ])("reports unpaired UTF16 in %j without rewriting it", (suffix) => {
    const native = buildNativeEvidence(["Native text " + suffix]);
    const original = JSON.stringify(native);
    expect(
      pdfDetection.deriveNativePageDiagnostics(native).pages[0].reasons,
    ).toEqual(["invalid_unicode_scalar"]);
    expect(JSON.stringify(native)).toBe(original);
  });

  it("retains valid supplementary scalar pairs and permitted whitespace", () => {
    const native = buildNativeEvidence([
      "Native\t\n\r\u000B\u000C 😀\uDBFF\uDFFF",
    ]);
    expect(
      pdfDetection.deriveNativePageDiagnostics(native).pages[0].reasons,
    ).toEqual([]);
  });

  it("reports each specified C0 control and DEL while preserving raw source", () => {
    const controls = [
      ...Array.from({ length: 9 }, (_, index) => index),
      ...Array.from({ length: 18 }, (_, index) => index + 14),
      127,
    ];
    for (const control of controls) {
      const native = buildNativeEvidence([
        "Native text " + String.fromCharCode(control),
      ]);
      const original = JSON.stringify(native);
      expect(
        pdfDetection.deriveNativePageDiagnostics(native).pages[0].reasons,
      ).toEqual(["unexpected_control_character"]);
      expect(JSON.stringify(native)).toBe(original);
    }
  });

  it("groups only exact eligible raw text and lists every other page in source order", () => {
    const native = buildNativeEvidence([
      "Native café",
      "Native café",
      "Native café",
      "NATIVE café",
      "Native cafe\u0301",
      " Native café",
      "1234567",
      "1234567",
      "",
      "",
    ]);
    const pages = pdfDetection.deriveNativePageDiagnostics(native).pages;
    expect(pages.slice(0, 3).map((page) => page.duplicatePageIds)).toEqual([
      ["page-2", "page-3"],
      ["page-1", "page-3"],
      ["page-1", "page-2"],
    ]);
    expect(
      pages
        .slice(0, 3)
        .every((page) => page.reasons.includes("duplicate_native_page_text")),
    ).toBe(true);
    expect(
      pages.slice(3).every((page) => page.duplicatePageIds.length === 0),
    ).toBe(true);
  });

  it("retains all applicable reasons in the frozen order", () => {
    const text = "\uFFFD\uD800\u0000";
    const pages = pdfDetection.deriveNativePageDiagnostics(
      buildNativeEvidence([text, text.repeat(3), text.repeat(3)]),
    ).pages;
    expect(pages[0].reasons).toEqual([
      "limited_native_text",
      "replacement_character",
      "invalid_unicode_scalar",
      "unexpected_control_character",
    ]);
    expect(pages[1].reasons).toEqual([
      "replacement_character",
      "invalid_unicode_scalar",
      "unexpected_control_character",
      "duplicate_native_page_text",
    ]);
  });

  it("handles the validated twenty-page aggregate limit without exposing raw text", () => {
    const pageTexts = Array.from({ length: 20 }, (_, index) =>
      "x".repeat(index === 19 ? 25_000 : 24_998),
    );
    expect(pageTexts.join("\n\n").length).toBe(500_000);
    const native = buildNativeEvidence(pageTexts);
    const original = JSON.stringify(native);
    freeze(native);
    const diagnostics = pdfDetection.deriveNativePageDiagnostics(native);
    expect(diagnostics.pages).toHaveLength(20);
    expect(diagnostics.pages[0].duplicatePageIds).toHaveLength(18);
    expect(diagnostics.pages[19].duplicatePageIds).toEqual([]);
    expect(JSON.stringify(diagnostics)).not.toContain("x".repeat(100));
    expect(JSON.stringify(native)).toBe(original);
    expect(diagnostics.reliability).toBe("unassessed");
  });
});

describe("shared saved-page text inspection", () => {
  const page = { pageNumber: 1, text: "Native page text" };

  it.each([undefined, null, []])(
    "returns missing data for %j without inventing pages",
    (pages) => {
      expect(inspectPageText(pages, 1)).toEqual({
        modelVersion: "page-text-observations/1.0.0",
        reliability: "unassessed",
        state: "unavailable",
        reason: "missing_page_data",
      });
    },
  );

  const malformed: { label: string; pages: unknown; count: unknown }[] = [
    { label: "nonarray", pages: { 0: page, length: 1 }, count: 1 },
    { label: "sparse array", pages: new Array(1), count: 1 },
    { label: "count mismatch", pages: [page], count: 2 },
    { label: "null page", pages: [null], count: 1 },
    { label: "scalar page", pages: ["Native page text"], count: 1 },
    { label: "array page", pages: [[page]], count: 1 },
    { label: "missing ordinal", pages: [{ text: page.text }], count: 1 },
    {
      label: "string ordinal",
      pages: [{ ...page, pageNumber: "1" }],
      count: 1,
    },
    { label: "wrong ordinal", pages: [{ ...page, pageNumber: 2 }], count: 1 },
    { label: "duplicate ordinal", pages: [page, page], count: 2 },
    {
      label: "ordinal gap",
      pages: [page, { ...page, pageNumber: 3 }],
      count: 2,
    },
    { label: "missing text", pages: [{ pageNumber: 1 }], count: 1 },
    { label: "null text", pages: [{ ...page, text: null }], count: 1 },
    {
      label: "boxed text",
      pages: [{ ...page, text: Object(page.text) }],
      count: 1,
    },
    { label: "undefined count", pages: [page], count: undefined },
    { label: "string count", pages: [page], count: "1" },
    { label: "fractional count", pages: [page], count: 1.5 },
    { label: "infinite count", pages: [page], count: Infinity },
    { label: "NaN count", pages: [page], count: NaN },
  ];
  it.each(malformed)(
    "declines $label before content diagnostics",
    ({ pages, count }) => {
      expect(inspectPageText(pages, count)).toEqual({
        modelVersion: "page-text-observations/1.0.0",
        reliability: "unassessed",
        state: "unavailable",
        reason: "invalid_page_metadata",
      });
    },
  );

  it("does not accept inherited indexed values as a dense page array", () => {
    const pages = new Array(1);
    const inherited = Object.create(Array.prototype);
    inherited[0] = page;
    Object.setPrototypeOf(pages, inherited);
    expect(inspectPageText(pages, 1)).toMatchObject({
      state: "unavailable",
      reason: "invalid_page_metadata",
    });
  });

  it.each([0, -1, 21, Number.MAX_SAFE_INTEGER])(
    "declines unsupported expected count %j",
    (count) => {
      expect(inspectPageText([page], count)).toMatchObject({
        state: "unavailable",
        reason: "unsupported_bounds",
      });
    },
  );

  it("declines an oversized page vector without truncating it", () => {
    const pages = Array.from({ length: 21 }, (_, index) => ({
      pageNumber: index + 1,
      text: page.text,
    }));
    const original = JSON.stringify(pages);
    expect(inspectPageText(pages, 20)).toMatchObject({
      state: "unavailable",
      reason: "unsupported_bounds",
    });
    expect(JSON.stringify(pages)).toBe(original);
  });

  it("counts raw whitespace and page separators against aggregate bounds", () => {
    const pages = [
      { pageNumber: 1, text: " ".repeat(249_999) },
      { pageNumber: 2, text: "\t".repeat(249_999) },
    ];
    expect(inspectPageText(pages, 2)).toMatchObject({
      state: "available",
      pages: [
        { nonWhitespaceUtf16Units: 0, reasons: ["no_text"] },
        { nonWhitespaceUtf16Units: 0, reasons: ["no_text"] },
      ],
    });
    pages[1].text += " ";
    expect(inspectPageText(pages, 2)).toEqual({
      modelVersion: "page-text-observations/1.0.0",
      reliability: "unassessed",
      state: "unavailable",
      reason: "unsupported_bounds",
    });
    expect(
      inspectPageText([{ ...page, text: "x".repeat(500_001) }], 1),
    ).toMatchObject({
      state: "unavailable",
      reason: "unsupported_bounds",
    });
  });

  it("accepts the maximum dense twenty-page vector and reports only ordinals", () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({
      pageNumber: index + 1,
      text: "x".repeat(index === 19 ? 25_000 : 24_998),
      id: `private-source-${index + 1}`,
    }));
    const original = JSON.stringify(pages);
    freeze(pages);
    const result = inspectPageText(pages, 20);
    expect(result.state).toBe("available");
    if (result.state !== "available")
      throw new Error("Expected bounded page data");
    expect(result.pages).toHaveLength(20);
    expect(result.pages[0].duplicatePageNumbers).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 2),
    );
    expect(result.pages[19].duplicatePageNumbers).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private-source");
    expect(JSON.stringify(result)).not.toContain("x".repeat(100));
    expect(JSON.stringify(pages)).toBe(original);
  });

  it("shares exact content reasons and eight-unit availability with the native adapter", () => {
    const native = buildNativeEvidence([
      "",
      "1234567",
      "😀".repeat(4),
      "\uFFFD\uD800\u0000".repeat(3),
      "\uFFFD\uD800\u0000".repeat(3),
    ]);
    const generic = inspectPageText(native.pages, native.pages.length);
    expect(PAGE_TEXT_AVAILABILITY_UNITS).toBe(8);
    expect(pdfDetection.MIN_USABLE_TEXT_CHARACTERS_PER_PAGE).toBe(
      PAGE_TEXT_AVAILABILITY_UNITS,
    );
    expect(generic).toEqual({
      modelVersion: "page-text-observations/1.0.0",
      reliability: "unassessed",
      state: "available",
      pages: [
        {
          pageNumber: 1,
          textAvailable: false,
          nonWhitespaceUtf16Units: 0,
          reasons: ["no_text"],
          duplicatePageNumbers: [],
        },
        {
          pageNumber: 2,
          textAvailable: false,
          nonWhitespaceUtf16Units: 7,
          reasons: ["limited_text"],
          duplicatePageNumbers: [],
        },
        {
          pageNumber: 3,
          textAvailable: true,
          nonWhitespaceUtf16Units: 8,
          reasons: [],
          duplicatePageNumbers: [],
        },
        {
          pageNumber: 4,
          textAvailable: true,
          nonWhitespaceUtf16Units: 9,
          reasons: [
            "replacement_character",
            "invalid_unicode_scalar",
            "unexpected_control_character",
            "duplicate_page_text",
          ],
          duplicatePageNumbers: [5],
        },
        {
          pageNumber: 5,
          textAvailable: true,
          nonWhitespaceUtf16Units: 9,
          reasons: [
            "replacement_character",
            "invalid_unicode_scalar",
            "unexpected_control_character",
            "duplicate_page_text",
          ],
          duplicatePageNumbers: [4],
        },
      ],
    });
    const adapted = pdfDetection.deriveNativePageDiagnostics(native);
    expect(adapted.pages[3]).toEqual({
      pageId: "page-4",
      pageNumber: 4,
      nativeTextAvailable: true,
      nonWhitespaceUtf16Units: 9,
      reasons: [
        "replacement_character",
        "invalid_unicode_scalar",
        "unexpected_control_character",
        "duplicate_native_page_text",
      ],
      duplicatePageIds: ["page-5"],
    });
  });

  it("ignores unrelated metadata and compares eligible raw strings exactly", () => {
    const texts = [
      "Native café",
      "Native café",
      "NATIVE café",
      "Native cafe\u0301",
      " Native café",
      "1234567",
      "1234567",
      "",
      "",
    ];
    const pages = texts.map((text, index) => ({
      pageNumber: index + 1,
      text,
      get unrelatedMetadata() {
        throw new Error("Extra metadata must be ignored");
      },
    }));
    const result = inspectPageText(pages, pages.length);
    expect(result.state).toBe("available");
    if (result.state !== "available")
      throw new Error("Expected bounded page data");
    expect(result.pages[0].duplicatePageNumbers).toEqual([2]);
    expect(result.pages[1].duplicatePageNumbers).toEqual([1]);
    expect(
      result.pages
        .slice(2)
        .every((item) => item.duplicatePageNumbers.length === 0),
    ).toBe(true);
    for (const item of result.pages)
      expect(Object.keys(item).sort()).toEqual([
        "duplicatePageNumbers",
        "nonWhitespaceUtf16Units",
        "pageNumber",
        "reasons",
        "textAvailable",
      ]);
  });
});
