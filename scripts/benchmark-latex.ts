import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LATEX_EXAMPLES, getLatexExample } from "../app/lib/latex-converter";
import { compileLatex } from "../app/lib/server/latex-sandbox";
import { prepareLatexDocument } from "../app/lib/server/latex-source";
import { inspectLatexPdf } from "../tests/fixtures/latex";
import {
  assertNoOwnedContainers,
  latexSourceHashes,
} from "./latex-test-fixtures";
const imageId = process.argv.find((arg) => arg.startsWith("sha256:")) ?? "";
assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
await assertNoOwnedContainers();
const results = [];
for (const profile of LATEX_EXAMPLES)
  for (const paper of ["A4", "LETTER"] as const) {
    const source = getLatexExample(profile.id, paper),
      prepared = prepareLatexDocument({ source, profile: profile.id }),
      compiled = await compileLatex(prepared, { imageId });
    const parsed = await inspectLatexPdf(compiled.pdf);
    assert.ok(parsed.text.trim());
    assert.equal(parsed.pages, compiled.pages);
    const dimensions = paper === "A4" ? [595.276, 841.89] : [612, 792];
    for (const page of parsed.dimensions) {
      assert.ok(Math.abs(page.width - dimensions[0]) < 2);
      assert.ok(Math.abs(page.height - dimensions[1]) < 2);
    }
    const expected =
      profile.id === "document"
        ? ["A short document", "A useful identity"]
        : profile.id === "experienced"
          ? ["Experience", "Selected work", "Education"]
          : ["Education", "Projects", "Skills"];
    let cursor = -1;
    for (const phrase of expected) {
      const found = parsed.text.indexOf(phrase, cursor + 1);
      assert.ok(
        found > cursor,
        `Missing/changed synthetic heading order for ${profile.id}/${paper}`,
      );
      cursor = found;
    }
    results.push({
      profile: profile.id,
      paper,
      sourceSha256: prepared.sourceHash,
      pdfSha256: createHash("sha256").update(compiled.pdf).digest("hex"),
      pages: parsed.pages,
      pdfBytes: compiled.pdf.length,
      durationMs: compiled.durationMs,
      headingOrderPass: true,
      taggedPages: parsed.taggedPages,
    });
  }
await assertNoOwnedContainers();
const sorted = results.map((result) => result.durationMs).sort((a, b) => a - b);
process.stdout.write(
  JSON.stringify(
    {
      imageId,
      sourceHashes: await latexSourceHashes(),
      results,
      latency: {
        sampleSize: sorted.length,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        target: "No performance target approved",
      },
      limits:
        "Six synthetic profile/paper examples; not representative validity or accessibility acceptance",
    },
    null,
    2,
  ) + "\n",
);
