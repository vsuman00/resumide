// Extra parse-health checks that need only the extracted text (ATS-15).
// Each rule is deterministic and states what was seen. Rules that need the PDF itself
// (hidden text, images, links) live in pdf-structure.ts and arrive as extraction warnings.
export const PARSE_HEALTH_VERSION = "parse-health/1.0.0";

const CID = /\(cid:\d+\)/g;
// Private-use and replacement characters appear when a font has no usable Unicode map.
const GARBLED = /[\uE000-\uF8FF\uFFFD]/g;
const PAGE_NUMBER = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;

function repeated(lines: (string | undefined)[]) {
  const seen = new Map<string, number>();
  for (const line of lines)
    if (line && line.length >= 3 && !PAGE_NUMBER.test(line))
      seen.set(line, (seen.get(line) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n >= 2).map(([line]) => line);
}

export function parseHealthWarnings(args: {
  lines: readonly string[];
  pageTexts?: readonly string[];
  totalPages: number;
}): ParseViewWarning[] {
  const warnings: ParseViewWarning[] = [];
  const text = args.lines.join("\n");

  // Garbled text: the file's fonts do not map to Unicode, so copied text is wrong.
  const garbled =
    (text.match(GARBLED)?.length ?? 0) + (text.match(CID)?.length ?? 0);
  if (garbled > 0 && garbled / Math.max(text.length, 1) > 0.002)
    warnings.push({
      field: "overall",
      severity: "error",
      message:
        "Part of the text looks garbled (font encoding problem). An ATS that copies this text will read the wrong characters. Re-export the PDF with embedded, standard fonts.",
    });

  // Table-like layout: pipe-delimited or many-cell rows.
  const tableRows = args.lines.filter(
    (line) => (line.match(/\|/g)?.length ?? 0) >= 2 && line.trim().length > 6,
  );
  const wideRows = args.lines.filter(
    (line) =>
      line
        .trim()
        .split(/\t+| {4,}/u)
        .filter(Boolean).length >= 3,
  );
  if (tableRows.length >= 3 || wideRows.length >= 3)
    warnings.push({
      field: "overall",
      severity: "warn",
      message:
        "Rows with several cells were found, which usually means a table. Many ATS read tables out of order or skip them. Use plain lines and bullets for roles and skills.",
    });

  // Headers and footers: text repeated on several pages.
  const pages = (args.pageTexts ?? []).map((p) =>
    p
      .split(/\r?\n/u)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  if (pages.length >= 2) {
    const top = repeated(pages.map((p) => p[0]));
    const bottom = repeated(pages.map((p) => p[p.length - 1]));
    const edge = [...top, ...bottom];
    if (edge.length) {
      const contactInEdge = edge.some((l) => EMAIL.test(l) || PHONE.test(l));
      warnings.push({
        field: "overall",
        severity: contactInEdge ? "warn" : "info",
        message: contactInEdge
          ? "Contact details repeat at the top or bottom of each page, which looks like a header or footer. Many ATS skip headers and footers, so keep your contact details in the main text of page 1."
          : "Text repeats at the top or bottom of each page, which looks like a header or footer. Many ATS skip those areas, so do not put anything important there.",
      });
    }
  }

  // Almost no text for the page count: likely an image or a scan.
  const words = text.split(/\s+/u).filter(Boolean).length;
  if (args.totalPages >= 1 && words / args.totalPages < 40)
    warnings.push({
      field: "overall",
      severity: "warn",
      message:
        "Very little text was found for the number of pages. If your resume is mostly an image, an ATS cannot read it. Export a text-based PDF.",
    });

  return warnings;
}
