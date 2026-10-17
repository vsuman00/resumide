import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { scoreFixture } from "../tests/fixtures/scoring-v2";
import {
  buildRenderPlan,
  verifyArtifact,
  TEMPLATE,
  type ArtifactObservation,
} from "../app/lib/server/artifact-contract";
import { renderArtifact } from "../app/lib/server/artifact-renderer";
const flags = process.argv.slice(2),
  release = flags.includes("--release");
const output = flags.find((x) => x.startsWith("--output="))?.slice(9),
  samples = flags.find((x) => x.startsWith("--samples="))?.slice(10);
if (
  flags.some(
    (x) =>
      !["--release"].includes(x) &&
      !x.startsWith("--output=") &&
      !x.startsWith("--samples="),
  )
)
  throw Error("Unsupported benchmark flag");
const sources = [
  "app/lib/server/artifact-contract.ts",
  "app/lib/server/artifact-renderer.ts",
  "app/lib/server/artifact-worker.mjs",
  "assets/fonts/NotoSans-Regular.ttf",
  "assets/fonts/NotoSansMath-Regular.ttf",
];
const sourceHashes = Object.fromEntries(
  sources.map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
const cases = [];
let allPass = true;
for (const locale of TEMPLATE.locales) {
  const document = scoreFixture().canonical;
  document.locale = locale;
  for (const format of TEMPLATE.formats)
    for (const pageSize of ["A4", "LETTER"] as const) {
      const options = {
        versionId: document.versionId,
        format,
        pageSize,
        templateId: TEMPLATE.id,
      };
      const result = await renderArtifact(document, options);
      const pass =
        result.report.state === "verified" &&
        result.report.criticalParity === 1 &&
        result.report.normalizedTextCoverage === 1 &&
        result.report.orderParity &&
        result.report.linkParity &&
        result.report.sectionParity &&
        result.report.structuralAccessibility;
      allPass &&= pass;
      cases.push({
        id: `${locale}/${format}/${pageSize}`,
        passed: pass,
        pages: result.report.pages,
        durationMs: Math.round(result.report.durationMs),
        criticalParity: result.report.criticalParity,
        textCoverage: result.report.normalizedTextCoverage,
        diagnostics: result.report.diagnostics,
      });
      if (samples && locale === "en-IN" && pageSize === "A4" && result.bytes) {
        mkdirSync(samples, { recursive: true });
        writeFileSync(
          resolve(samples, `fictional-resume.${format}`),
          result.bytes,
          { mode: 0o600 },
        );
      }
    }
}
const plan = buildRenderPlan(scoreFixture().canonical),
  options = {
    versionId: plan.versionId,
    format: "pdf" as const,
    pageSize: "A4" as const,
    templateId: TEMPLATE.id,
  };
const clean: ArtifactObservation = {
  text: plan.blocks.map((b) => b.text).join("\n"),
  links: plan.blocks.flatMap((b) => (b.link ? [b.link] : [])),
  linkBindings: plan.blocks.flatMap((b) =>
    b.link ? [`${b.link}|${b.text.replace(/\s+/gu, "")}`] : [],
  ),
  pages: 1,
  layoutPass: true,
  structuralAccessibility: true,
  diagnostics: [],
};
const corruptions = [
  {
    id: "missing-critical",
    value: { text: clean.text.replace(plan.critical[0], "") },
  },
  {
    id: "reordered-column",
    value: {
      text: [...plan.blocks]
        .reverse()
        .map((b) => b.text)
        .join("\n"),
    },
  },
  { id: "broken-link", value: { links: [] } },
  {
    id: "misbound-link",
    value: {
      linkBindings: clean.linkBindings.map((x) =>
        x.replace(/^[^|]+/u, "https://wrong.test"),
      ),
    },
  },
  {
    id: "omitted-section",
    value: {
      text: clean.text.replace(
        plan.blocks.find((b) => b.kind === "heading")!.text,
        "",
      ),
    },
  },
  { id: "clipping", value: { layoutPass: false } },
  { id: "missing-structure", value: { structuralAccessibility: false } },
  { id: "extra-text", value: { text: clean.text + " invented fact" } },
];
for (const item of corruptions) {
  const report = verifyArtifact(
    plan,
    options,
    { ...clean, ...item.value },
    new Uint8Array([1]),
    0,
  );
  const passed = report.state === "export_verification_failed";
  allPass &&= passed;
  cases.push({ id: item.id, passed });
}
const report = {
  schemaVersion: "render-parity-engineering/1.0.0",
  kind: "known-synthetic-local",
  template: { id: TEMPLATE.id, version: TEMPLATE.version },
  sourceHashes,
  caseCount: cases.length,
  passed: cases.filter((c) => c.passed).length,
  cases,
  measured: {
    criticalParity: allPass ? 1 : null,
    textCoverage: allPass ? 1 : null,
    approvedViewer: null,
    assistiveTechnology: null,
    representativeCorpus: null,
    expertAccessibilityReview: null,
  },
  engineeringPass: allPass,
  releasePass: false,
  releaseBlockers: [
    "approved viewer matrix",
    "assistive technology evaluation",
    "representative domain and locale corpus",
    "security/accessibility owner acceptance",
    "upstream formal gates",
  ],
};
const json = JSON.stringify(report, null, 2) + "\n";
if (output) writeFileSync(output, json);
process.stdout.write(json);
if (!allPass || release) process.exitCode = 1;
