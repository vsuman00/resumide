export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PdfPageItems = { page: number; items: PdfTextItem[] };

// Commands whose brace arguments are never printed text.
const DROP = new Set([
  "vspace",
  "hspace",
  "vskip",
  "hskip",
  "setlength",
  "addtolength",
  "label",
  "ref",
  "pageref",
  "cite",
  "color",
  "pagecolor",
  "definecolor",
  "usepackage",
  "documentclass",
  "begin",
  "end",
  "newcommand",
  "renewcommand",
  "titleformat",
  "titlespacing",
  "setlist",
  "geometry",
  "pagestyle",
  "thispagestyle",
  "fontsize",
  "includegraphics",
  "hypersetup",
  "fancyhf",
  "fancyhead",
  "fancyfoot",
  "raisebox",
  "rule",
]);
const DIMENSION = /^\s*-?[\d.]+\s*(pt|em|ex|in|cm|mm|bp|sp|pc|\\[a-z]+)?\s*$/i;

/** Best-effort printed text of one LaTeX source line. Never exact; used only to find it in the PDF. */
export function visibleTextOfLine(latexLine: string): string {
  let s = latexLine.replace(/(^|[^\\])%.*$/, "$1");
  s = s.replace(/\\(?:textcolor|colorbox)\s*\{[^{}]*\}/g, "");
  for (let previous = ""; previous !== s;) {
    previous = s;
    s = s.replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, " $1 ");
    s = s.replace(
      /\\([a-zA-Z]+)\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g,
      (_, name: string, arg: string) =>
        DROP.has(name) || DIMENSION.test(arg) ? " " : ` {${arg}}`,
    );
    s = s.replace(/\{([^{}]*)\}/g, "$1");
  }
  return s
    .replace(/\\([a-zA-Z]+)\*?/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/\\([&%$_#{}])/g, "$1")
    .replace(/~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const compact = (text: string) => text.toLowerCase().replace(/\s+/g, "");

export function locateLineInPdf(
  lineText: string,
  lineIndex: number,
  totalLines: number,
  pages: PdfPageItems[],
): { page: number; rects: PdfTextItem[] } | null {
  const needle = compact(lineText.replace(/\s+/g, " ").trim().slice(0, 60));
  if (needle.length < 3) return null;
  const total = pages.reduce((sum, p) => sum + p.items.length, 0) || 1;
  const target = totalLines > 0 ? lineIndex / totalLines : 0;
  let best: { page: number; rects: PdfTextItem[]; distance: number } | null =
    null;
  let before = 0;
  for (const { page, items } of pages) {
    // Map each character of the page's compacted text back to its item.
    let hay = "";
    const owner: number[] = [];
    items.forEach((item, index) => {
      const text = compact(item.str);
      hay += text;
      for (let i = 0; i < text.length; i++) owner.push(index);
    });
    for (
      let at = hay.indexOf(needle);
      at !== -1;
      at = hay.indexOf(needle, at + 1)
    ) {
      const first = owner[at];
      const last = owner[at + needle.length - 1];
      const distance = Math.abs((before + first) / total - target);
      if (!best || distance < best.distance)
        best = { page, rects: items.slice(first, last + 1), distance };
    }
    before += items.length;
  }
  return best && { page: best.page, rects: best.rects };
}
