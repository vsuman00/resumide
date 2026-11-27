// PDF-level parse-health checks (ATS-15): hidden white text, images, links with no visible text.
// Best-effort and read-only. A failure here must never fail an extraction, so callers get an
// empty list. Messages carry a prefix so the scoring stage can tell them from OCR notices.
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

export const PDF_STRUCTURE_VERSION = "pdf-structure/1.0.0";
export const STRUCTURE_PREFIX = "[structure] ";

export interface PdfStructureSignals {
  pages: number;
  /** Text runs drawn in white (or near white) ink, which a person cannot see. */
  hiddenTextRuns: number;
  hiddenTextPages: number[];
  images: number;
  links: number;
  linksWithoutText: number;
}

const luminance = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255
  );
};

export async function readPdfStructure(
  bytes: Uint8Array,
  maxPages = 6,
): Promise<PdfStructureSignals> {
  const pdfjs = await getResolvedPDFJS();
  const { OPS } = pdfjs;
  const document = await getDocumentProxy(Uint8Array.from(bytes));
  const signals: PdfStructureSignals = {
    pages: document.numPages,
    hiddenTextRuns: 0,
    hiddenTextPages: [],
    images: 0,
    links: 0,
    linksWithoutText: 0,
  };
  try {
    const showOps = new Set<number>([
      OPS.showText,
      OPS.showSpacedText,
      OPS.nextLineShowText,
      OPS.nextLineSetSpacingShowText,
    ]);
    const imageOps = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageXObjectRepeat,
    ]);
    for (
      let number = 1;
      number <= Math.min(document.numPages, maxPages);
      number++
    ) {
      const page = await document.getPage(number);
      try {
        const list = await page.getOperatorList();
        let white = false;
        let hiddenOnPage = 0;
        list.fnArray.forEach((fn: number, index: number) => {
          const args = list.argsArray[index] as unknown[] | null;
          if (fn === OPS.setFillRGBColor && typeof args?.[0] === "string")
            white = luminance(args[0]) >= 0.97;
          else if (fn === OPS.setFillGray && typeof args?.[0] === "number")
            white = args[0] >= 0.97;
          else if (fn === OPS.setFillColorN || fn === OPS.setFillColor)
            white = false;
          else if (showOps.has(fn) && white) hiddenOnPage++;
          else if (imageOps.has(fn)) signals.images++;
        });
        if (hiddenOnPage) {
          signals.hiddenTextRuns += hiddenOnPage;
          signals.hiddenTextPages.push(number);
        }
        const annotations = await page.getAnnotations({ intent: "display" });
        const links = (
          annotations as {
            subtype?: string;
            url?: string;
            unsafeUrl?: string;
            rect: number[];
          }[]
        ).filter((a) => a.subtype === "Link" && (a.url || a.unsafeUrl));
        if (links.length) {
          const content = await page.getTextContent();
          const boxes = content.items.flatMap((item) => {
            if (!("str" in item) || !item.str.trim() || !item.transform)
              return [];
            const [, , , , x, y] = item.transform;
            return [{ x1: x, y1: y, x2: x + item.width, y2: y + item.height }];
          });
          for (const link of links) {
            signals.links++;
            const [lx1, ly1, lx2, ly2] = link.rect;
            const covered = boxes.some(
              (b) =>
                b.x1 < Math.max(lx1, lx2) &&
                b.x2 > Math.min(lx1, lx2) &&
                b.y1 < Math.max(ly1, ly2) &&
                b.y2 > Math.min(ly1, ly2),
            );
            if (!covered) signals.linksWithoutText++;
          }
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }
  return signals;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function structureMessages(s: PdfStructureSignals): string[] {
  const out: string[] = [];
  if (s.hiddenTextRuns)
    out.push(
      `${STRUCTURE_PREFIX}error|${s.hiddenTextRuns} ${plural(s.hiddenTextRuns, "piece", "pieces")} of text on ${plural(s.hiddenTextPages.length, "page", "pages")} ${s.hiddenTextPages.join(", ")} ${plural(s.hiddenTextRuns, "is", "are")} drawn in white. An ATS reads it but a person cannot see it, and many employers treat hidden text as keyword stuffing. Remove it.`,
    );
  if (s.images)
    out.push(
      `${STRUCTURE_PREFIX}info|${s.images} ${plural(s.images, "image", "images")} found. An ATS cannot read text inside images, so keep names, dates and skills as real text.`,
    );
  if (s.linksWithoutText)
    out.push(
      `${STRUCTURE_PREFIX}warn|${s.linksWithoutText} ${plural(s.linksWithoutText, "link has", "links have")} no visible text over ${plural(s.linksWithoutText, "it", "them")} (for example an icon). The ATS may store the address without a label, or not at all. Write the address or a clear label as text.`,
    );
  return out;
}

/** Messages for the extraction stage; never throws. */
export async function inspectPdfStructure(
  bytes: Uint8Array,
): Promise<string[]> {
  try {
    return structureMessages(await readPdfStructure(bytes));
  } catch {
    return [];
  }
}

/** Turns stored "[structure] severity|message" strings into parse-view warnings. */
export function structureWarnings(
  stored: readonly unknown[] | null | undefined,
): ParseViewWarning[] {
  return (stored ?? []).flatMap((entry) => {
    if (typeof entry !== "string" || !entry.startsWith(STRUCTURE_PREFIX))
      return [];
    const [severity, ...rest] = entry.slice(STRUCTURE_PREFIX.length).split("|");
    const message = rest.join("|").trim();
    if (!["info", "warn", "error"].includes(severity) || !message) return [];
    return [
      {
        field: "overall" as const,
        severity: severity as "info" | "warn" | "error",
        message: message.slice(0, 400),
      },
    ];
  });
}
