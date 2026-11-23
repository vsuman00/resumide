export const PAGE_TEXT_AVAILABILITY_UNITS = 8;

type PageTextReason =
  | "no_text"
  | "limited_text"
  | "replacement_character"
  | "invalid_unicode_scalar"
  | "unexpected_control_character"
  | "duplicate_page_text";

type PageTextReviewBase = {
  modelVersion: "page-text-observations/1.0.0";
  reliability: "unassessed";
};

export type PageTextReview = PageTextReviewBase &
  (
    | {
        state: "available";
        pages: {
          pageNumber: number;
          textAvailable: boolean;
          nonWhitespaceUtf16Units: number;
          reasons: PageTextReason[];
          duplicatePageNumbers: number[];
        }[];
      }
    | {
        state: "unavailable";
        reason:
          "missing_page_data" | "invalid_page_metadata" | "unsupported_bounds";
      }
  );

const base: PageTextReviewBase = {
  modelVersion: "page-text-observations/1.0.0",
  reliability: "unassessed",
};

export function inspectPageText(
  pages: unknown,
  expectedPageCount: unknown,
): PageTextReview {
  if (!Number.isSafeInteger(expectedPageCount))
    return { ...base, state: "unavailable", reason: "invalid_page_metadata" };
  const count = expectedPageCount as number;
  if (count < 1 || count > 20)
    return { ...base, state: "unavailable", reason: "unsupported_bounds" };
  if (pages === undefined || pages === null)
    return { ...base, state: "unavailable", reason: "missing_page_data" };
  if (!Array.isArray(pages))
    return { ...base, state: "unavailable", reason: "invalid_page_metadata" };
  if (pages.length === 0)
    return { ...base, state: "unavailable", reason: "missing_page_data" };
  if (pages.length > 20)
    return { ...base, state: "unavailable", reason: "unsupported_bounds" };
  if (pages.length !== count)
    return { ...base, state: "unavailable", reason: "invalid_page_metadata" };

  const texts: string[] = [];
  let aggregateUnits = 2 * (count - 1);
  for (let index = 0; index < count; index++) {
    if (!Object.hasOwn(pages, index))
      return { ...base, state: "unavailable", reason: "invalid_page_metadata" };
    const page: unknown = pages[index];
    if (
      page === null ||
      typeof page !== "object" ||
      Array.isArray(page) ||
      !("pageNumber" in page) ||
      page.pageNumber !== index + 1 ||
      !("text" in page) ||
      typeof page.text !== "string"
    )
      return { ...base, state: "unavailable", reason: "invalid_page_metadata" };
    aggregateUnits += page.text.length;
    if (aggregateUnits > 500_000)
      return { ...base, state: "unavailable", reason: "unsupported_bounds" };
    texts.push(page.text);
  }

  const counts = texts.map((text) => text.replace(/\s/gu, "").length);
  const exactTextGroups = new Map<string, number[]>();
  for (const [index, text] of texts.entries()) {
    if (counts[index] < PAGE_TEXT_AVAILABILITY_UNITS) continue;
    const group = exactTextGroups.get(text);
    if (group) group.push(index + 1);
    else exactTextGroups.set(text, [index + 1]);
  }
  return {
    ...base,
    state: "available",
    pages: texts.map((text, pageIndex) => {
      const nonWhitespaceUtf16Units = counts[pageIndex];
      const reasons: PageTextReason[] = [];
      if (nonWhitespaceUtf16Units === 0) reasons.push("no_text");
      else if (nonWhitespaceUtf16Units < PAGE_TEXT_AVAILABILITY_UNITS)
        reasons.push("limited_text");
      if (text.includes("\uFFFD")) reasons.push("replacement_character");
      let invalidScalar = false;
      let unexpectedControl = false;
      for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        if (unit <= 0x08 || (unit >= 0x0e && unit <= 0x1f) || unit === 0x7f)
          unexpectedControl = true;
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) index++;
          else invalidScalar = true;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) invalidScalar = true;
      }
      if (invalidScalar) reasons.push("invalid_unicode_scalar");
      if (unexpectedControl) reasons.push("unexpected_control_character");
      const pageNumber = pageIndex + 1;
      const duplicatePageNumbers =
        exactTextGroups.get(text)?.filter((number) => number !== pageNumber) ??
        [];
      if (duplicatePageNumbers.length) reasons.push("duplicate_page_text");
      return {
        pageNumber,
        textAvailable: nonWhitespaceUtf16Units >= PAGE_TEXT_AVAILABILITY_UNITS,
        nonWhitespaceUtf16Units,
        reasons,
        duplicatePageNumbers,
      };
    }),
  };
}
