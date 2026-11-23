import {
  readNativePdfText,
  requireNativeExtractionActive,
  ResumeExtractionError,
  withNativePdf,
} from "../extract";
import {
  normalizeNativePageLayout,
  type NativePageLayout,
} from "../native-layout";
import type { NativeEvidence } from "../native-evidence-schema";
import {
  inspectPageText,
  PAGE_TEXT_AVAILABILITY_UNITS,
} from "../../page-text-diagnostics";

export const MIN_USABLE_TEXT_CHARACTERS_PER_PAGE = PAGE_TEXT_AVAILABILITY_UNITS;
export const MAX_NATIVE_LAYOUT_ITEMS_PER_PAGE = 10_000;

export type PdfDocumentType = "scanned" | "mixed" | "text";

export type PdfTextExtraction = {
  totalPages: number;
  text: string;
  pageTexts: string[];
  nativeLayout?: {
    schemaVersion: "native-layout-v1";
    pages: NativePageLayout[];
  };
};

export type PdfTextProfile = {
  documentType: PdfDocumentType;
  pageCharacterCounts: number[];
  pagesNeedingOcr: number[];
};

export type NativePageDiagnosticReason =
  | "no_native_text"
  | "limited_native_text"
  | "replacement_character"
  | "invalid_unicode_scalar"
  | "unexpected_control_character"
  | "duplicate_native_page_text";

export type NativePageDiagnostics = {
  modelVersion: "native-page-review/1.0.0";
  reliability: "unassessed";
  pages: {
    pageId: string;
    pageNumber: number;
    nativeTextAvailable: boolean;
    nonWhitespaceUtf16Units: number;
    reasons: NativePageDiagnosticReason[];
    duplicatePageIds: string[];
  }[];
};

function countTextCharacters(text: string): number {
  return text.replace(/\s/gu, "").length;
}

// Call only with validated immutable native evidence (20 pages, 500,000 units).
// These review observations neither measure accuracy nor change OCR selection.
export function deriveNativePageDiagnostics(
  native: NativeEvidence,
): NativePageDiagnostics {
  const review = inspectPageText(native.pages, native.pages.length);
  if (review.state !== "available")
    throw new Error("Validated native evidence exceeds page review bounds");
  return {
    modelVersion: "native-page-review/1.0.0",
    reliability: "unassessed",
    pages: review.pages.map((page, index) => ({
      pageId: native.pages[index].id,
      pageNumber: page.pageNumber,
      nativeTextAvailable: page.textAvailable,
      nonWhitespaceUtf16Units: page.nonWhitespaceUtf16Units,
      reasons: page.reasons.map((reason) => {
        if (reason === "no_text") return "no_native_text";
        if (reason === "limited_text") return "limited_native_text";
        if (reason === "duplicate_page_text")
          return "duplicate_native_page_text";
        return reason;
      }),
      duplicatePageIds: page.duplicatePageNumbers.map(
        (number) => native.pages[number - 1].id,
      ),
    })),
  };
}

export function detectPdfTextProfile(args: {
  totalPages: number;
  text: string;
  pageTexts?: readonly string[];
}): PdfTextProfile {
  if (
    !Number.isSafeInteger(args.totalPages) ||
    args.totalPages < 1 ||
    typeof args.text !== "string"
  )
    throw new ResumeExtractionError("INVALID_PDF");
  let pageTexts: readonly string[];
  if (args.pageTexts === undefined) {
    // An aggregate can describe one page, but cannot establish page boundaries.
    if (args.totalPages !== 1) throw new ResumeExtractionError("INVALID_PDF");
    pageTexts = [args.text];
  } else {
    if (
      !Array.isArray(args.pageTexts) ||
      args.pageTexts.length !== args.totalPages
    )
      throw new ResumeExtractionError("INVALID_PDF");
    // Densify first: Array#some and Array#map skip missing indexed slots.
    pageTexts = Array.from(args.pageTexts);
    if (pageTexts.some((text) => typeof text !== "string"))
      throw new ResumeExtractionError("INVALID_PDF");
  }
  const pageCharacterCounts = pageTexts.map(countTextCharacters);
  const pagesNeedingOcr = pageCharacterCounts.flatMap((count, index) =>
    count < MIN_USABLE_TEXT_CHARACTERS_PER_PAGE ? [index + 1] : [],
  );

  let documentType: PdfDocumentType = "text";
  if (pagesNeedingOcr.length === args.totalPages) documentType = "scanned";
  else if (pagesNeedingOcr.length > 0) documentType = "mixed";

  return { documentType, pageCharacterCounts, pagesNeedingOcr };
}

export function textLayerWarning(profile: PdfTextProfile): string | null {
  if (profile.documentType === "scanned") {
    return "No usable PDF text layer was detected; OCR is required before scoring.";
  }
  if (profile.documentType === "mixed") {
    return `PDF pages ${profile.pagesNeedingOcr.join(", ")} lack a usable text layer; OCR is required before scoring.`;
  }
  return null;
}

export async function extractPdfTextLayers(
  pdf: Uint8Array,
  limits: {
    maxPages: number;
    maxCharacters: number;
    includeLayout?: boolean;
    signal?: AbortSignal;
  },
): Promise<PdfTextExtraction> {
  return withNativePdf(pdf, async (document) => {
    if (document.numPages > limits.maxPages) {
      throw new ResumeExtractionError("PAGE_LIMIT");
    }
    if (limits.includeLayout) {
      const pageTexts: string[] = [];
      const pages: NativePageLayout[] = [];
      let characters = 0;
      // One bounded sequential pass keeps text and layout source offsets equal.
      for (let number = 1; number <= document.numPages; number++) {
        requireNativeExtractionActive(limits.signal);
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        requireNativeExtractionActive(limits.signal);
        if (content.items.length > MAX_NATIVE_LAYOUT_ITEMS_PER_PAGE) {
          throw new ResumeExtractionError("LAYOUT_LIMIT");
        }
        const items = content.items.filter((item) => "str" in item);
        const text = items
          .map((item) => item.str + (item.hasEOL ? "\n" : ""))
          .join("");
        characters += text.length + (number > 1 ? 2 : 0);
        if (characters > limits.maxCharacters)
          throw new ResumeExtractionError("TEXT_LIMIT");
        pageTexts.push(text);
        pages.push(
          normalizeNativePageLayout(
            number,
            page.getViewport({ scale: 1 }),
            items,
            content.styles,
          ),
        );
        page.cleanup();
      }
      return {
        totalPages: document.numPages,
        text: pageTexts.join("\n\n"),
        pageTexts,
        nativeLayout: { schemaVersion: "native-layout-v1", pages },
      };
    }
    return readNativePdfText(document, limits);
  });
}
