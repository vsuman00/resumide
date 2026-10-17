import PDFDocument from "pdfkit";
import {
  CANONICAL_FIXTURE_TEXT,
  createCanonicalFixture,
} from "./canonical-test-fixture";

/** Real synthetic PDF source, private storage object and matching checksum.
 * Kept separate so canonical-only tests retain their lightweight fixtures. */
export async function createArtifactFixture(text = CANONICAL_FIXTURE_TEXT) {
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);
  });
  pdf.fontSize(11).text(text);
  pdf.end();
  return createCanonicalFixture(text, await completed);
}
