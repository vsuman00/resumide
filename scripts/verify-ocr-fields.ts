import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  extractionManifestLock,
  runExtractionBenchmark,
  type ExtractionManifest,
  type ExtractionObservation,
} from "../app/lib/server/extraction-benchmark";
import {
  extractEvidenceFields,
  MIXED_OCR_FIELD_PROFILE,
  MIXED_OCR_FIELD_PROFILE_V2,
  MIXED_OCR_FIELD_PROFILE_V3,
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
  createOcrReliabilityHoldout,
  OCR_RELIABILITY_CALIBRATION_ROUND2_VERSION,
} from "../tests/fixtures/ocr-reliability-holdout";
import {
  createOcrEmploymentDevelopmentFixtures,
  createOcrWorkplaceDevelopmentFixtures,
} from "../tests/fixtures/ocr-employment-development";
import { evaluateOcrDocument } from "../tests/fixtures/ocr-evaluation";
import { createOcrSupportedDevelopmentFixtures } from "../tests/fixtures/ocr-supported-development";
import {
  evaluateOcrFields,
  OCR_CRITICAL_FIELDS,
} from "../tests/fixtures/ocr-field-evaluation";
import { bindOcrCalibration } from "./ocr-calibration-binding";

const imageId = process.argv[2];
assert.match(
  imageId ?? "",
  /^sha256:[a-f0-9]{64}$/u,
  "Pass the explicitly built immutable local image ID",
);
const flags = process.argv.slice(3);
const reliabilityDevelopment = flags[0] === "--reliability-development";
const employmentDevelopment =
  flags[0] === "--reliability-employment-development";
const workplaceDevelopment = flags[0] === "--reliability-workplace-development";
const registeredDevelopment =
  reliabilityDevelopment || employmentDevelopment || workplaceDevelopment;
const workplaceOption = workplaceDevelopment ? flags[1] : undefined;
const freshCalibration =
  flags.length === 1 && flags[0] === "--reliability-calibration-round2";
const calibration =
  freshCalibration ||
  (flags.length === 1 && flags[0] === "--reliability-calibration");
const fieldProfile = workplaceDevelopment
  ? MIXED_OCR_FIELD_PROFILE_V3
  : freshCalibration || flags[1] === "--mixed-field-candidate-v2"
    ? MIXED_OCR_FIELD_PROFILE_V2
    : calibration || flags[1] === "--mixed-field-candidate"
      ? MIXED_OCR_FIELD_PROFILE
      : undefined;
assert.ok(
  !flags.length ||
    calibration ||
    (workplaceDevelopment &&
      (flags.length === 1 ||
        (flags.length === 2 &&
          (workplaceOption === "--dpi=300" ||
            workplaceOption === "--text-fusion")))) ||
    (!workplaceDevelopment &&
      registeredDevelopment &&
      (flags.length === 1 || (flags.length === 2 && fieldProfile))),
  "Select a development diagnostic or the registered calibration run",
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
const calibrationConfig = { psm: 3, maxDpi: 150 } as const;
const config =
  workplaceOption === "--dpi=300"
    ? { ...calibrationConfig, maxDpi: 300 as const }
    : workplaceOption === "--text-fusion"
      ? { ...calibrationConfig, model: "text-fusion" as const }
      : calibrationConfig;
const parserSources = [
  "app/lib/server/evidence-fields.ts",
  "app/lib/server/parsing/contact.ts",
  "app/lib/server/parsing/dates.ts",
  "app/lib/server/parsing/sections.ts",
].map((path) => ({ path, sha256: hash(readFileSync(path)) }));
const binding = calibration
  ? bindOcrCalibration(
      imageId,
      calibrationConfig,
      fieldProfile!,
      parserSources,
      freshCalibration,
    )
  : null;
const calibrationFixtures =
  binding &&
  (await createOcrReliabilityHoldout("calibration", freshCalibration));
const fixtures =
  calibrationFixtures ||
  (workplaceDevelopment
    ? await createOcrWorkplaceDevelopmentFixtures()
    : employmentDevelopment
      ? await createOcrEmploymentDevelopmentFixtures()
      : reliabilityDevelopment
        ? await createOcrSupportedDevelopmentFixtures()
        : (await createOcrPrintPilot()).filter(
            (fixture) =>
              fixture.manifest.partition === "development" &&
              fixture.segment !== "controls",
          ));
const versions = createLocalContainerOcrAdapter({
  bytes: fixtures[0].bytes,
  imageId,
  evaluationConfig: config,
}).versions;
if (binding && calibrationFixtures)
  binding.verify(calibrationFixtures, versions);
const partition = calibration
  ? ("calibration" as const)
  : ("development" as const);
const receipt = {
  imageId,
  config,
  partition,
  ...(workplaceDevelopment ? { versions } : {}),
  ...(binding
    ? {
        binding: binding.hashes,
        evaluatorSources: [
          "scripts/verify-ocr-fields.ts",
          "scripts/ocr-calibration-binding.ts",
          "app/lib/server/extraction-benchmark.ts",
        ].map((path) => ({ path, sha256: hash(readFileSync(path)) })),
      }
    : {}),
  ...(fieldProfile ? { fieldProfile } : {}),
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
const benchmarkVersions = {
  producerVersion: fieldProfile ?? MIXED_OCR_FIELD_PROFILE,
  providerVersion: `${versions.engine}/${versions.renderer}`,
  configurationHash: receiptSha256,
};
const observations: ExtractionObservation[] = [];
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
  status: ExtractionObservation["status"];
  selectedPages: number[];
  nativePreservation: "verified";
  cleanup: "verified";
  scoringEligible: false;
  metrics: ReturnType<typeof evaluateOcrFields>;
  previousProfileMetrics?: ReturnType<typeof evaluateOcrFields>;
  transcription?: ReturnType<typeof evaluateOcrDocument>;
}> = [];
for (const fixture of fixtures) {
  const started = performance.now();
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
  if (calibration)
    assert.deepEqual(
      profile.pagesNeedingOcr,
      fixture.segment === "mixed" ? [1, 3] : [1],
    );
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
  if (!calibration) assert.equal(outcome.status, "review_required");
  const recognized =
    outcome.status === "review_required" || outcome.status === "insufficient"
      ? outcome.pages
      : [];
  if (outcome.status === "review_required" || outcome.status === "insufficient")
    assert.equal(outcome.scoringEligible, false);
  const status =
    outcome.status === "not_needed" ? "unsupported" : outcome.status;
  const actual = originalNative.slice();
  for (const page of recognized) actual[page.pageNumber - 1] = page.text;
  const spans = actual.flatMap((text, index) => {
    const page = index + 1;
    const pageId = `page-${page}`;
    const method = profile.pagesNeedingOcr.includes(page)
      ? "local_ocr"
      : "native_text";
    const parts = text.split(/(\r?\n)/u);
    const lines: (FieldSourceSpan & { page: number; start: number })[] = [];
    let start = 0;
    for (let part = 0; part < parts.length; part += 2) {
      const line = parts[part];
      if (line.trim())
        lines.push({
          id: `${pageId}-line-${lines.length + 1}`,
          page,
          pageId,
          text: line,
          method,
          start,
        });
      start += Array.from(line).length + (parts[part + 1]?.length ?? 0);
    }
    return lines;
  });
  // Parser has no access to expected source labels. Every typed prediction is
  // evaluated, including extra candidates and semantically wrong assignments.
  const candidates = extractEvidenceFields(spans, fieldProfile);
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
    status,
    selectedPages: profile.pagesNeedingOcr,
    nativePreservation: "verified",
    cleanup: "verified",
    scoringEligible: false,
    metrics: evaluateOcrFields(fixture.labels, candidates, spans),
    ...(workplaceDevelopment
      ? {
          previousProfileMetrics: evaluateOcrFields(
            fixture.labels,
            extractEvidenceFields(spans, MIXED_OCR_FIELD_PROFILE_V2),
            spans,
          ),
        }
      : {}),
    ...((employmentDevelopment || workplaceDevelopment) &&
    fixture.expectedPageTexts
      ? {
          transcription: evaluateOcrDocument(fixture.expectedPageTexts, actual),
        }
      : {}),
  });
  if (calibration) {
    const locations = new Map(spans.map((span) => [span.id, span]));
    observations.push({
      id: fixture.id,
      sourceHash: fixture.manifest.sourceSha256,
      ...benchmarkVersions,
      status,
      pages: actual.map((text, index) => ({
        page: index + 1,
        method: recognized.some((entry) => entry.pageNumber === index + 1)
          ? "ocr"
          : "native",
        text,
      })),
      fields: candidates.flatMap((candidate) =>
        candidate.evidence.map((reference) => {
          const location = locations.get(reference.spanId);
          assert.ok(location, "Field citation must point to the original page");
          return {
            type: candidate.field,
            value: candidate.value,
            span: {
              page: location.page,
              start: location.start + reference.start,
              end: location.start + reference.end,
            },
          };
        }),
      ),
      authoritativeScore: null,
      criticalInputsComplete: false,
      confidenceCalibrated: false,
      wallMs: performance.now() - started,
      apiFeeMicros: 0,
      computeCostMicros: null,
    });
  }
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
const requiredSegments = [
  { id: "clean", scan: "clean", layout: "single-column" },
  { id: "challenging", scan: "challenging", layout: "single-column" },
  { id: "mixed", scan: "clean", layout: "single-column" },
] satisfies ExtractionManifest["requiredSegments"];
const calibrationReport =
  calibrationFixtures &&
  (() => {
    const manifest: ExtractionManifest = {
      schemaVersion: "extraction-benchmark/1.0.0",
      datasetVersion: freshCalibration
        ? OCR_RELIABILITY_CALIBRATION_ROUND2_VERSION
        : "ocr-reliability-holdout/1.0.0",
      ...benchmarkVersions,
      requiredSegments,
      documents: calibrationFixtures.map((fixture) => ({
        id: fixture.id,
        family: fixture.manifest.sourceFamily,
        template: fixture.manifest.sourceFamily,
        duplicateGroup: fixture.manifest.nearDuplicateGroup,
        segment: fixture.segment,
        partition: "calibration",
        sourceHash: fixture.manifest.sourceSha256,
        generatorVersion: fixture.manifest.generatorVersion,
        permission: "synthetic-authored",
        labelProvenance: "ai-assisted-synthetic",
        pages: fixture.expectedPageTexts.map((text, index) => ({
          page: index + 1,
          method: fixture.segment === "mixed" && index === 1 ? "native" : "ocr",
          text,
        })),
        fields: fixture.labels.map((label) => ({
          type: label.field as (typeof OCR_CRITICAL_FIELDS)[number],
          value: label.value,
          span: { page: label.pageNumber, start: label.start, end: label.end },
        })),
      })),
      releaseEvidence: {
        calibratedPolicy: null,
        independentHumanAgreement: null,
        representativeCorpusReceipt: null,
        approvedThresholdsReceipt: null,
        sampleSizeJustificationReceipt: null,
      },
    };
    return runExtractionBenchmark({
      manifest,
      manifestLock: extractionManifestLock(manifest),
      observations,
      mode: "engineering",
      partition: "calibration",
    });
  })();
process.stdout.write(
  JSON.stringify(
    {
      status: "structured_field_diagnostic_completed",
      receiptSha256,
      completedAt: new Date().toISOString(),
      datasetType: "synthetic_engineering_only",
      partition,
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
      confidenceIntervalReason: registeredDevelopment
        ? "two_authored_families_with_shared_generator"
        : "three_correlated_authored_families_not_representative_release_data",
      aggregate: rates(counts),
      perField,
      results,
      ...(calibrationReport ? { calibration: calibrationReport } : {}),
    },
    null,
    2,
  ) + "\n",
);
if (calibrationReport) process.exitCode = calibrationReport.exitCode;
