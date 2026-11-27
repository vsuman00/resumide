import { describe, expect, it } from "vitest";
import { syntheticPdf } from "../fixtures/native-pdf";
import {
  inspectPdfStructure,
  readPdfStructure,
  structureMessages,
  structureWarnings,
  STRUCTURE_PREFIX,
} from "../../app/lib/server/pdf-structure";

const visible = "0 g BT /F1 12 Tf 50 700 Td (Visible text) Tj ET";
// 1x1 grayscale inline image.
const inlineImage =
  "q 40 0 0 40 50 600 cm BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI Q";

/** A one-page PDF with a link annotation over the rectangle [x1 y1 x2 y2]. */
function pdfWithLink(stream: string, rect: [number, number, number, number]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Annot /Subtype /Link /Rect [${rect.join(" ")}] /Border [0 0 0] /A << /S /URI /URI (https://example.test/profile) >> >>`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("PDF structure checks (ATS-15)", () => {
  it("finds nothing in an ordinary text PDF", async () => {
    const s = await readPdfStructure(syntheticPdf(visible));
    expect(s).toMatchObject({
      hiddenTextRuns: 0,
      images: 0,
      links: 0,
      linksWithoutText: 0,
    });
    expect(await inspectPdfStructure(syntheticPdf(visible))).toEqual([]);
  });
  it("detects white text, counts only the hidden runs, and reports the page", async () => {
    const stream = `${visible} 1 1 1 rg BT /F1 12 Tf 50 650 Td (secret keywords) Tj ET BT /F1 12 Tf 50 630 Td (more secret) Tj ET 0 g BT /F1 12 Tf 50 600 Td (Visible again) Tj ET`;
    const s = await readPdfStructure(syntheticPdf(stream));
    expect(s.hiddenTextRuns).toBe(2);
    expect(s.hiddenTextPages).toEqual([1]);
    const [message] = structureMessages(s);
    expect(message).toMatch(
      /^\[structure\] error\|2 pieces of text on page 1 are drawn in white/,
    );
  });
  it("treats near-white gray the same, and resets when the colour changes back", async () => {
    expect(
      (
        await readPdfStructure(
          syntheticPdf("1 g BT /F1 12 Tf 50 650 Td (x) Tj ET"),
        )
      ).hiddenTextRuns,
    ).toBe(1);
    expect(
      (
        await readPdfStructure(
          syntheticPdf("0.5 g BT /F1 12 Tf 50 650 Td (x) Tj ET"),
        )
      ).hiddenTextRuns,
    ).toBe(0);
  });
  it("counts images", async () => {
    const s = await readPdfStructure(syntheticPdf(`${visible} ${inlineImage}`));
    expect(s.images).toBe(1);
    expect(structureMessages(s)[0]).toMatch(
      /^\[structure\] info\|1 image found/,
    );
  });
  it("flags a link with no text over it, but not one over visible text", async () => {
    const stream = "BT /F1 12 Tf 50 700 Td (linkedin.com/in/example) Tj ET";
    const over = await readPdfStructure(
      pdfWithLink(stream, [50, 698, 200, 712]),
    );
    expect(over).toMatchObject({ links: 1, linksWithoutText: 0 });
    const icon = await readPdfStructure(
      pdfWithLink(stream, [400, 400, 420, 420]),
    );
    expect(icon).toMatchObject({ links: 1, linksWithoutText: 1 });
    expect(structureMessages(icon)[0]).toMatch(
      /^\[structure\] warn\|1 link has no visible text over it/,
    );
  });
  it("never throws on a damaged file", async () => {
    expect(await inspectPdfStructure(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });
});

describe("stored structure warnings", () => {
  it("round-trips only well-formed structure entries into parse warnings", () => {
    const stored = [
      "OCR was used because no usable PDF text layer was detected.",
      `${STRUCTURE_PREFIX}error|Hidden text on page 1.`,
      `${STRUCTURE_PREFIX}bogus|nope`,
      `${STRUCTURE_PREFIX}warn|`,
      42,
    ];
    expect(structureWarnings(stored)).toEqual([
      {
        field: "overall",
        severity: "error",
        message: "Hidden text on page 1.",
      },
    ]);
    expect(structureWarnings(null)).toEqual([]);
  });
});

import { extractBoundedInput } from "../../app/lib/server/extraction-stage";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";

describe("extraction to scoring seam (ATS-15)", () => {
  const limits = {
    maxBytes: 1_000_000,
    maxPages: 5,
    maxCharacters: 100_000,
    timeoutMs: 20_000,
  };
  const body =
    "BT /F1 12 Tf 50 740 Td (Alex Example) Tj 0 -16 Td (alex@example.test) Tj 0 -16 Td (Experience) Tj ET";
  it("stores a structure warning for hidden text and shows it in the parse view", async () => {
    const hidden = syntheticPdf(
      `${body} 1 1 1 rg BT /F1 12 Tf 50 500 Td (kubernetes terraform python) Tj ET`,
    );
    const extracted = await extractBoundedInput({ bytes: hidden, ...limits });
    const stored = extracted.warnings.filter((w) =>
      w.startsWith(STRUCTURE_PREFIX),
    );
    expect(stored).toHaveLength(1);
    const scored = scoreExtractedResume({
      text: extracted.text,
      pageCount: extracted.totalPages,
      pageTexts: extracted.pageTexts,
      extractionWarnings: extracted.warnings,
      jobDescription: "",
      textChecksum: extracted.textChecksum,
    });
    expect(
      scored.parseView.warnings.some(
        (w) => w.severity === "error" && /drawn in white/.test(w.message),
      ),
    ).toBe(true);
  });
  it("adds nothing for a clean PDF and keeps the old two-page warning", async () => {
    const clean = await extractBoundedInput({
      bytes: syntheticPdf(body),
      ...limits,
    });
    expect(clean.warnings).toEqual([]);
    const three = await extractBoundedInput({
      bytes: syntheticPdf([body, body, body]),
      ...limits,
    });
    expect(three.warnings).toEqual(["Resume exceeds two pages."]);
  });
});
