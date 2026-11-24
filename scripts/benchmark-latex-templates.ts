// Template corpus report: admission for every fixture, plus a real compile when
// LATEX_COMPILER_IMAGE names a local image. Prints JSON to stdout; no source or logs.
import { readFileSync } from "node:fs";
import {
  LATEX_PACKAGES,
  LatexSourceError,
  prepareLatexDocument,
} from "../app/lib/server/latex-source";
import {
  compileLatex,
  LatexSandboxError,
} from "../app/lib/server/latex-sandbox";

const dir = new URL("../tests/fixtures/latex-templates/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", dir), "utf8"),
) as { file: string; expected: "compile" | "reject" }[];
const imageId = process.env.LATEX_COMPILER_IMAGE;
const withoutComments = (s: string) => s.replace(/(^|[^\\])%.*$/gm, "$1");

const report = [];
for (const { file, expected } of manifest) {
  const source = readFileSync(new URL(file, dir), "utf8");
  const used = [
    ...withoutComments(source).matchAll(
      /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g,
    ),
  ].flatMap((m) => m[1].split(",").map((p) => p.trim()));
  const row: Record<string, unknown> = {
    file,
    expected,
    unsupportedPackages: used.filter((p) => !LATEX_PACKAGES.includes(p)),
  };
  try {
    const prepared = prepareLatexDocument({ source, profile: "document" });
    row.admission = "ok";
    if (imageId) {
      try {
        const result = await compileLatex(prepared, { imageId });
        row.compile = "ok";
        row.pages = result.pages;
        row.warnings = result.diagnostics.length;
      } catch (error) {
        row.compile = error instanceof LatexSandboxError ? error.code : "error";
        if (error instanceof LatexSandboxError && error.diagnostic)
          row.diagnostic = error.diagnostic;
      }
    }
  } catch (error) {
    row.admission = error instanceof LatexSourceError ? error.code : "error";
  }
  report.push(row);
}
console.log(JSON.stringify(report, null, 2));
