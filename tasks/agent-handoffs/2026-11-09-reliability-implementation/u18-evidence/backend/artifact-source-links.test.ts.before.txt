import { expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { assertSourceLinksPreserved } from "../../app/lib/server/artifact-source-links";
import { buildRenderPlan } from "../../app/lib/server/artifact-contract";
import { scoreFixture } from "../fixtures/scoring-v2";

async function sourcePdf(target: string) {
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const bytes = new Promise<Uint8Array>((resolve, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);
  });
  pdf.text("Portfolio", { link: target });
  pdf.end();
  return bytes;
}
it("blocks hidden annotation targets absent from the canonical render plan", async () => {
  const plan = buildRenderPlan(scoreFixture().canonical);
  const bytes = await sourcePdf("https://portfolio.example.test/work");
  await expect(assertSourceLinksPreserved(bytes, plan)).rejects.toThrow(
    "SOURCE_LINKS_NOT_PRESERVED",
  );
  plan.blocks.push({
    id: "link",
    kind: "fact",
    text: "https://portfolio.example.test/work",
    factIds: [],
    link: "https://portfolio.example.test/work",
  });
  await expect(
    assertSourceLinksPreserved(bytes, plan),
  ).resolves.toBeUndefined();
});
