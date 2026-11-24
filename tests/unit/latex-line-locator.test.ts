import { describe, expect, it } from "vitest";
import {
  locateLineInPdf,
  visibleTextOfLine,
  type PdfPageItems,
} from "../../app/lib/latex-line-locator";

describe("visibleTextOfLine", () => {
  it.each([
    [String.raw`\item \textbf{Built} APIs \% 30`, "Built APIs % 30"],
    [String.raw`\vspace{2pt}`, ""],
    [String.raw`\section{Experience} % private note`, "Experience"],
    [String.raw`\href{mailto:a@example.com}{a@example.com}`, "a@example.com"],
    [
      String.raw`\resumeItem{Developed an example API}`,
      "Developed an example API",
    ],
    [
      String.raw`\textcolor{red}{Warm} words~here \& there`,
      "Warm words here & there",
    ],
    [String.raw`\hspace*{\fill}`, ""],
    [String.raw`\emph{Rust} \_ \# \$5`, "Rust _ # $5"],
  ])("%s -> %j", (line, expected) => {
    expect(visibleTextOfLine(line)).toBe(expected);
  });
});

const item = (str: string, x = 10, y = 700) => ({
  str,
  x,
  y,
  width: str.length * 5,
  height: 10,
});
describe("locateLineInPdf", () => {
  const bullet = "Built example APIs for a synthetic team";
  const pages: PdfPageItems[] = [
    {
      page: 1,
      items: [
        item("Header"),
        item(bullet, 10, 600),
        ...Array.from({ length: 8 }, (_, i) => item("filler " + i)),
      ],
    },
    {
      page: 2,
      items: [
        ...Array.from({ length: 8 }, (_, i) => item("more " + i)),
        item(bullet, 10, 300),
        item("Footer"),
      ],
    },
  ];
  it("picks the occurrence closest in document order", () => {
    expect(locateLineInPdf(bullet, 80, 100, pages)?.page).toBe(2);
    expect(locateLineInPdf(bullet, 5, 100, pages)?.page).toBe(1);
  });
  it("returns one rect per item when text is split across items", () => {
    const split: PdfPageItems[] = [
      {
        page: 1,
        items: [
          item("Built exa"),
          item("mple AP"),
          item("Is now"),
          item("other"),
        ],
      },
    ];
    const result = locateLineInPdf("Built example APIs now", 0, 1, split);
    expect(result?.page).toBe(1);
    expect(result?.rects).toHaveLength(3);
  });
  it("returns null when nothing matches or the text is too short", () => {
    expect(locateLineInPdf("Nowhere in the PDF", 0, 1, pages)).toBeNull();
    expect(locateLineInPdf("ab", 0, 1, pages)).toBeNull();
  });
  it("matches case and whitespace insensitively using the first 60 characters", () => {
    const long = "x".repeat(70);
    const p: PdfPageItems[] = [{ page: 1, items: [item("X".repeat(60))] }];
    expect(locateLineInPdf(long, 0, 1, p)?.page).toBe(1);
    expect(locateLineInPdf("BUILT   example apis", 0, 1, pages)).not.toBeNull();
  });
});
