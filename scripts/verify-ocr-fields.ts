import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  extractEvidenceFields,
  type FieldSourceSpan,
} from "../app/lib/server/evidence-fields";
import { createLocalContainerOcrAdapter } from "../app/lib/server/ocr/local-container";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../app/lib/server/ocr/pdf-detection";
import {
  runSelectiveLocalOcr,
  type SelectiveOcrRequest,
} from "../app/lib/server/ocr/selective";
import { createOcrPrintPilot } from "../tests/fixtures/ocr-print-pilot";
import {
  evaluateOcrFields,
  OCR_CRITICAL_FIELDS,
} from "../tests/fixtures/ocr-field-evaluation";

const imageId = process.argv[2];
assert.match(
  imageId ?? "",
  /^sha256:[a-f0-9]{64}$/u,
  "Pass the explicitly built immutable local image ID",
);
assert.equal(
  process.argv.length,
  3,
  "Only development diagnostics are authorized by this checker",
);
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const docker = promisify(execFile);
const owned = async () => {
  const { stdout } = await docker(
    "docker",
    ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
    { timeout: 3000, maxBuffer: 4096 },
  );
  return stdout.trim().split(/\s+/u).filter(Boolean);
};
const fixtures = (await createOcrPrintPilot()).filter(
  (fixture) =>
    fixture.manifest.partition === "development" &&
    fixture.segment !== "controls",
);
const config = { psm: 3 as const, maxDpi: 150 as const };
const parserSources = [
  "app/lib/server/evidence-fields.ts",
  "app/lib/server/parsing/contact.ts",
  "app/lib/server/parsing/dates.ts",
  "app/lib/server/parsing/sections.ts",
].map((path) => ({ path, sha256: hash(readFileSync(path)) }));
const receipt = {
  imageId,
  config,
  partition: "development",
  parserSources,
  sources: fixtures.map((fixture) => ({
    id: fixture.id,
    sourceSha256: fixture.manifest.sourceSha256,
    family: fixture.manifest.sourceFamily,
    segment: fixture.segment,
    labelsSha256: hash(JSON.stringify(fixture.labels)),
  })),
};
const receiptSha256 = hash(JSON.stringify(receipt));
process.stdout.write(
  JSON.stringify({
    status: "structured_field_receipt_pre_execution",
    receiptSha256,
    ...receipt,
  }) + "\n",
);
const baseline = await owned();
const results: Array<{
  id: string;
  sourceSha256: string;
  family: string;
  segment: string;
  status: "review_required";
  selectedPages: number[];
  nativePreservation: "verified";
  cleanup: "verified";
  scoringEligible: false;
  metrics: ReturnType<typeof evaluateOcrFields>;
}> = [];
for (const fixture of fixtures) {
  const nativePageTexts = (
    await extractPdfTextLayers(fixture.bytes, {
      maxPages: 10,
      maxCharacters: 100_000,
    })
  ).pageTexts;
  const originalNative = structuredClone(nativePageTexts);
  const profile = detectPdfTextProfile({
    text: nativePageTexts.join("\n"),
    pageTexts: nativePageTexts,
    totalPages: nativePageTexts.length,
  });
  const request: SelectiveOcrRequest = {
    schemaVersion: "selective-ocr-request-v1",
    attemptId: randomUUID(),
    ownerId: randomUUID(),
    analysisId: randomUUID(),
    sourceId: randomUUID(),
    createdAt: new Date().toISOString(),
    retentionPolicyId: "synthetic-local-30d/1.0.0",
    sourceSha256: fixture.manifest.sourceSha256,
    nativePageTexts,
    selectedPages: profile.pagesNeedingOcr.map((pageNumber) => ({
      pageNumber,
      pageId: `page-${pageNumber}`,
    })),
    limits: { maxCharacters: 100_000, maxPages: 10 },
    remainingDeadlineMs: 15_000,
    allocation: {
      id: "owner-approved-synthetic-local-2026-10-04",
      maxWallTimeMs: 10_000,
      maxPages: 10,
      externalApiFeeMicros: 0,
    },
    policy: {
      executionMode: "self_hosted",
      purpose: "synthetic_local_test",
      allowThirdPartyProcessing: false,
    },
  };
  const outcome = await runSelectiveLocalOcr(
    request,
    createLocalContainerOcrAdapter({
      bytes: fixture.bytes,
      imageId,
      evaluationConfig: config,
    }),
    new AbortController().signal,
  );
  assert.ok(
    (await owned()).every((id) => baseline.includes(id)),
    "Exact-owned cleanup failed",
  );
  assert.deepEqual(nativePageTexts, originalNative);
  assert.equal(outcome.status, "review_required");
  if (outcome.status !== "review_required")
    throw new Error("Diagnostic OCR did not complete");
  assert.equal(outcome.scoringEligible, false);
  const actual = originalNative.slice();
  for (const page of outcome.pages) actual[page.pageNumber - 1] = page.text;
  const spans: FieldSourceSpan[] = actual.flatMap((text, page) =>
    text
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => ({
        id: `page-${page + 1}-line-${index + 1}`,
        pageId: `page-${page + 1}`,
        text: line,
        method: profile.pagesNeedingOcr.includes(page + 1)
          ? ("local_ocr" as const)
          : ("native_text" as const),
      })),
  );
  // Parser has no access to expected source labels. Every typed prediction is
  // evaluated, including extra candidates and semantically wrong assignments.
  const candidates = extractEvidenceFields(spans);
  assert.ok(
    candidates.every(
      (candidate) =>
        candidate.state === "review_required" &&
        candidate.confidence.kind === "uncalibrated" &&
        candidate.confidence.value === null,
    ),
  );
  results.push({
    id: fixture.id,
    sourceSha256: fixture.manifest.sourceSha256,
    family: fixture.manifest.sourceFamily,
    segment: fixture.segment,
    status: outcome.status,
    selectedPages: profile.pagesNeedingOcr,
    nativePreservation: "verified",
    cleanup: "verified",
    scoringEligible: false,
    metrics: evaluateOcrFields(fixture.labels, candidates, spans),
  });
}
const counts = results.reduce(
  (sum, result) => ({
    truePositive: sum.truePositive + result.metrics.truePositive,
    falsePositive: sum.falsePositive + result.metrics.falsePositive,
    falseNegative: sum.falseNegative + result.metrics.falseNegative,
    ungroundedPredictions:
      sum.ungroundedPredictions + result.metrics.ungroundedPredictions,
  }),
  {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    ungroundedPredictions: 0,
  },
);
const rates = (count: {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}) => ({
  ...count,
  precision:
    count.truePositive + count.falsePositive
      ? count.truePositive / (count.truePositive + count.falsePositive)
      : null,
  recall:
    count.truePositive + count.falseNegative
      ? count.truePositive / (count.truePositive + count.falseNegative)
      : null,
});
const perField = OCR_CRITICAL_FIELDS.map((field) => ({
  field,
  ...rates(
    results.reduce(
      (sum, result) => {
        const count = result.metrics.perField.find(
          (item) => item.field === field,
        )!;
        return {
          truePositive: sum.truePositive + count.truePositive,
          falsePositive: sum.falsePositive + count.falsePositive,
          falseNegative: sum.falseNegative + count.falseNegative,
        };
      },
      { truePositive: 0, falsePositive: 0, falseNegative: 0 },
    ),
  ),
}));
process.stdout.write(
  JSON.stringify(
    {
      status: "structured_field_diagnostic_completed",
      receiptSha256,
      completedAt: new Date().toISOString(),
      datasetType: "synthetic_engineering_only",
      partition: "development",
      documents: results.length,
      sourceFamilies: new Set(results.map((result) => result.family)).size,
      annotatorType: "ai",
      humanValidation: "not_evaluated",
      representativeValidity: "not_evaluated",
      calibratedConfidence: false,
      persistedRawAssets: false,
      metricScope:
        "typed_parser_predictions_exact_field_value_page_and_source_grounding_one_to_one",
      gate: "diagnostic_only_not_release_acceptance",
      confidenceInterval: null,
      confidenceIntervalReason:
        "three_correlated_authored_families_not_representative_release_data",
      aggregate: rates(counts),
      perField,
      results,
    },
    null,
    2,
  ) + "\n",
);
