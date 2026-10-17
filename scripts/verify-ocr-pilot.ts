import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  createLocalContainerOcrAdapter,
  type LocalOcrEvaluationConfig,
} from "../app/lib/server/ocr/local-container";
import {
  extractPdfTextLayers,
  detectPdfTextProfile,
} from "../app/lib/server/ocr/pdf-detection";
import {
  runSelectiveLocalOcr,
  type LocalOcrAdapter,
  type SelectiveOcrRequest,
} from "../app/lib/server/ocr/selective";
import { createOcrDiagnosticPilot } from "../tests/fixtures/ocr-pilot";
import { createOcrPrintPilot } from "../tests/fixtures/ocr-print-pilot";
import {
  evaluateOcrDocument,
  summarizeOcrSegment,
  type OcrObservation,
} from "../tests/fixtures/ocr-evaluation";

const imageId = process.argv[2];
assert.match(
  imageId ?? "",
  /^sha256:[a-f0-9]{64}$/u,
  "Pass the reviewed immutable local image ID; no images are built or downloaded.",
);
const flags = process.argv.slice(3);
const seen = new Set<string>();
for (const flag of flags) {
  assert.match(
    flag,
    /^(--require-quality|--manifest-only|--print-pilot|--partition=(development|calibration|locked)|--psm=(3|6)|--dpi=(150|300)|--lock-receipt=[a-f0-9]{64})$/u,
    "Unknown checker option",
  );
  const key = flag.split("=")[0];
  assert.ok(!seen.has(key), "Duplicate checker option");
  seen.add(key);
}
const printPilot = flags.includes("--print-pilot");
const partitionFlag = flags.find((flag) => flag.startsWith("--partition="));
assert.ok(
  printPilot === Boolean(partitionFlag),
  "Print pilot requires an explicit partition; diagnostic corpus has development only",
);
const partition = partitionFlag?.split("=")[1] ?? "development";
const lockReceipt = flags
  .find((flag) => flag.startsWith("--lock-receipt="))
  ?.split("=")[1];
assert.ok(
  !lockReceipt || (printPilot && partition === "locked"),
  "Lock receipt is valid only for the locked print partition",
);
assert.ok(
  partition !== "locked" || flags.includes("--manifest-only") || lockReceipt,
  "Locked execution requires the previously frozen receipt",
);
const evaluationConfig: LocalOcrEvaluationConfig = {
  psm: flags.includes("--psm=6") ? 6 : 3,
  maxDpi: flags.includes("--dpi=150") ? 150 : 300,
};
const docker = promisify(execFile);
async function ownedContainers() {
  const { stdout } = await docker(
    "docker",
    ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
    { timeout: 3000 },
  );
  return stdout.trim().split(/\s+/u).filter(Boolean);
}
async function assertCleanup(baseline: string[]) {
  const deadline = performance.now() + 7000;
  do {
    if ((await ownedContainers()).every((id) => baseline.includes(id))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (performance.now() < deadline);
  throw new Error(
    "New owned OCR containers remain; no broad cleanup attempted.",
  );
}

const allFixtures = printPilot
  ? await createOcrPrintPilot()
  : createOcrDiagnosticPilot();
// Rendered variants must stay with their authored family before any recognition.
const familyPartitions = new Map<string, Set<string>>();
for (const fixture of allFixtures) {
  const partitions =
    familyPartitions.get(fixture.manifest.sourceFamily) ?? new Set<string>();
  partitions.add(fixture.manifest.partition);
  familyPartitions.set(fixture.manifest.sourceFamily, partitions);
}
assert.ok(
  [...familyPartitions.values()].every((partitions) => partitions.size === 1),
  "Source-family partition leakage",
);
const fixtures = allFixtures.filter(
  (fixture) => fixture.manifest.partition === partition,
);
assert.ok(fixtures.length, "Selected partition has no fixtures");
const datasetId = printPilot
  ? "normal-font-pdf-v1"
  : "block-glyph-diagnostic-v1";
const selectedVersions = createLocalContainerOcrAdapter({
  bytes: fixtures[0].bytes,
  imageId,
  evaluationConfig,
}).versions;
// Bind every authored hash and label before the first recognition. This is a
// development receipt, NOT a held-out lock or independent-family partition.
const sourceManifest = fixtures.map((fixture) => ({
  ...fixture.manifest,
  segment: fixture.segment,
  transform: fixture.transform,
  labelsSha256: createHash("sha256")
    .update(JSON.stringify(fixture.labels))
    .digest("hex"),
}));
const manifestSha256 = createHash("sha256")
  .update(JSON.stringify(sourceManifest))
  .digest("hex");
const evaluationReceipt = Object.freeze({
  datasetId,
  partition,
  imageId,
  evaluationConfig: Object.freeze({ ...evaluationConfig }),
  manifestSha256,
  versions: selectedVersions,
});
const evaluationReceiptSha256 = createHash("sha256")
  .update(JSON.stringify(evaluationReceipt))
  .digest("hex");
if (lockReceipt)
  assert.equal(
    lockReceipt,
    evaluationReceiptSha256,
    "Frozen receipt mismatches source, configuration or immutable image",
  );
if (flags.includes("--manifest-only")) {
  process.stdout.write(
    JSON.stringify(
      {
        status: "manifest_only_no_recognition",
        evaluationReceipt,
        evaluationReceiptSha256,
        sourceManifest,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}
process.stdout.write(
  JSON.stringify({
    status: "evaluation_receipt_pre_execution",
    ...evaluationReceipt,
    evaluationReceiptSha256,
  }) + "\n",
);
const baseline = await ownedContainers();
const results: Array<
  OcrObservation & { segment: string; [key: string]: unknown }
> = [];
for (const fixture of fixtures) {
  const started = performance.now();
  // Corrupt/oversized controls intentionally bypass the native extractor to
  // test the runtime input boundary directly; never label them successful PDFs.
  const nativePageTexts =
    fixture.expectedPageTexts === null
      ? [""]
      : (
          await extractPdfTextLayers(fixture.bytes, {
            maxPages: 10,
            maxCharacters: 100_000,
          })
        ).pageTexts;
  const originalNative = structuredClone(nativePageTexts);
  const profile = detectPdfTextProfile({
    pageTexts: nativePageTexts,
    totalPages: nativePageTexts.length,
    text: nativePageTexts.join("\n"),
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
    limits: { maxCharacters: 100_000, maxPages: 10 },
    selectedPages: profile.pagesNeedingOcr.map((pageNumber) => ({
      pageNumber,
      pageId: `page-${pageNumber}`,
    })),
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
  const adapter: LocalOcrAdapter = fixture.providerPageInjection
    ? {
        versions: selectedVersions,
        async recognize() {
          return {
            durationMs: 1,
            pages: fixture.providerPageInjection!.map((pageNumber) => ({
              pageNumber,
              pageId: `page-${pageNumber}`,
              imageSha256: "0".repeat(64),
              widthPixels: 100,
              heightPixels: 100,
              rotation: 0,
              text: "",
              words: [],
            })),
          };
        },
      }
    : createLocalContainerOcrAdapter({
        bytes: fixture.bytes,
        imageId,
        evaluationConfig,
      });
  const outcome = await runSelectiveLocalOcr(
    request,
    adapter,
    new AbortController().signal,
  );
  await assertCleanup(baseline);
  assert.deepEqual(
    nativePageTexts,
    originalNative,
    "Native evidence must remain immutable.",
  );
  if (fixture.segment === "mixed")
    assert.deepEqual(
      request.selectedPages.map((page) => page.pageNumber),
      [1, 3],
    );
  if (
    outcome.status === "review_required" ||
    outcome.status === "insufficient"
  ) {
    assert.equal(outcome.scoringEligible, false);
    assert.deepEqual(
      outcome.pages.map((page) => page.pageNumber),
      profile.pagesNeedingOcr,
    );
  }
  if (fixture.transform === "native_control")
    assert.equal(outcome.status, "not_needed");
  if (fixture.transform === "blank_control")
    assert.equal(outcome.status, "insufficient");
  if (fixture.expectedPageTexts === null || fixture.providerPageInjection) {
    assert.equal(outcome.status, "failed");
    if (outcome.status === "failed")
      assert.equal(
        outcome.code,
        fixture.providerPageInjection ? "invalid_output" : "engine_failure",
      );
  }
  const actual = originalNative.slice();
  if (outcome.status === "review_required" || outcome.status === "insufficient")
    for (const page of outcome.pages) actual[page.pageNumber - 1] = page.text;
  const metrics = evaluateOcrDocument(fixture.expectedPageTexts ?? [], actual);
  const ocrMetrics = evaluateOcrDocument(
    profile.pagesNeedingOcr.map(
      (page) => fixture.expectedPageTexts?.[page - 1] ?? "",
    ),
    profile.pagesNeedingOcr.map((page) => actual[page - 1] ?? ""),
  );
  const recoveredLabels = fixture.labels.filter((label) =>
    (actual[label.pageNumber - 1] ?? "").includes(label.value),
  ).length;
  const resourceUsage =
    outcome.status === "review_required" || outcome.status === "insufficient"
      ? (outcome.resourceUsage ?? null)
      : null;
  results.push({
    id: fixture.manifest.id,
    family: fixture.manifest.sourceFamily,
    segment: fixture.segment,
    transform: fixture.transform,
    sourceSha256: fixture.manifest.sourceSha256,
    executionEvidence: fixture.providerPageInjection
      ? "contract_injection_only"
      : "local_runtime_boundary",
    status: outcome.status,
    errorCode: outcome.status === "failed" ? outcome.code : null,
    selectedPages: request.selectedPages.map((page) => page.pageNumber),
    wallMs: performance.now() - started,
    resourceUsage,
    resourceUsageReason: resourceUsage
      ? null
      : outcome.status === "failed"
        ? "failed_attempt_resources_not_measured"
        : "no_successful_child_rusage_observation",
    resourceUsageScope:
      "child_cpu_sum_and_max_single_child_rss_with_optional_container_cgroup_peak_through_recognition",
    // Expected workload, not measured engine attempts or billable usage.
    expectedRuntimeAttempts:
      fixture.providerPageInjection ||
      !request.selectedPages.length ||
      fixture.transform === "oversized_input"
        ? 0
        : 1,
    nativePreservation: "verified",
    cleanup: "verified",
    metrics,
    ocrMetrics,
    criticalValueTextRecovery: {
      recovered: recoveredLabels,
      reference: fixture.labels.length,
      reason:
        "exact_source_value_substring_not_structured_field_precision_or_recall",
    },
    wordGeometry:
      outcome.status === "review_required" || outcome.status === "insufficient"
        ? "contract_validated"
        : "not_applicable",
  });
}
const completedAt = new Date();
const observedUsage = results.flatMap((row) =>
  row.resourceUsage
    ? [
        row.resourceUsage as NonNullable<
          Extract<
            Awaited<ReturnType<typeof runSelectiveLocalOcr>>,
            { schemaVersion: "ocr-evidence-v1" }
          >["resourceUsage"]
        >,
      ]
    : [],
);
const observedContainerPeaks = observedUsage.flatMap((usage) =>
  usage.containerMemoryPeak?.valueBytes != null
    ? [usage.containerMemoryPeak.valueBytes]
    : [],
);
const report = {
  status: "diagnostic_execution_completed",
  imageId,
  versions: selectedVersions,
  datasetId,
  evaluationConfig,
  evaluationReceipt,
  evaluationReceiptSha256,
  suppliedLockReceipt: lockReceipt ?? null,
  requireQualityScope:
    "CER_and_exact_position_single_column_screening_only_not_AA012_acceptance",
  manifestSha256,
  completedAt: completedAt.toISOString(),
  rawExpiresAt: new Date(completedAt.getTime() + 30 * 86400000).toISOString(),
  persistedRawAssets: false,
  datasetType: "synthetic_engineering_only",
  partition,
  humanValidation: "not_evaluated",
  independentFamilyProtocol: printPilot
    ? "source_family_disjoint_synthetic_partitions_declared_not_independent_human_validation"
    : "not_satisfied",
  representativeValidity: "not_evaluated",
  fullAA1Gate: "open",
  selection: "revise_and_review_no_production_enablement",
  automaticRetries: 0,
  runtimeAttemptAccounting:
    "successful_child_starts_observed_when_rusage_present_failed_attempts_unknown_expected_workload_not_usage",
  cpuTime: {
    value: observedUsage.length
      ? observedUsage.reduce((sum, usage) => sum + usage.cpuTimeMs, 0)
      : null,
    unit: "ms",
    scope: "sum_of_observed_successful_child_processes_only",
    observedDocuments: observedUsage.length,
    unmeasuredDocuments: results.length - observedUsage.length,
  },
  maxSingleChildRssBytes: {
    value: observedUsage.length
      ? Math.max(...observedUsage.map((usage) => usage.maxChildRssBytes))
      : null,
    scope: "maximum_individual_child_rss_not_whole_container_peak",
    observedDocuments: observedUsage.length,
  },
  observedChildStarts: {
    renderer: observedUsage.length
      ? observedUsage.reduce((sum, usage) => sum + usage.rendererCalls, 0)
      : null,
    recognition: observedUsage.length
      ? observedUsage.reduce((sum, usage) => sum + usage.recognitionCalls, 0)
      : null,
    scope: "successful_observations_only_failed_attempts_unknown",
  },
  peakMemory: {
    value: observedContainerPeaks.length
      ? Math.max(...observedContainerPeaks)
      : null,
    unit: "bytes",
    source: "cgroup_v2_memory_peak",
    scope: "maximum_observed_successful_container_peak_through_recognition",
    observedDocuments: observedContainerPeaks.length,
    unmeasuredDocuments: results.length - observedContainerPeaks.length,
    reason: observedContainerPeaks.length
      ? null
      : "no_container_peak_observation",
    limitations:
      "failed_attempts_and_post_recognition_serialization_unmeasured",
  },
  structuredFieldPrecisionRecall: {
    value: null,
    reason: "field_extractor_not_evaluated",
  },
  segments: ["clean", "challenging", "mixed"].map((segment) => ({
    segment,
    ...summarizeOcrSegment(
      results
        .filter((row) => row.segment === segment)
        .map((row) => ({
          ...row,
          metrics: row.ocrMetrics as ReturnType<typeof evaluateOcrDocument>,
        })),
      segment === "challenging" ? 0.03 : 0.01,
    ),
    minimumExactPositionLineAgreement: 0.98,
  })),
  controls: results.filter((row) => row.segment === "controls"),
  results,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (
  process.argv.includes("--require-quality") &&
  report.segments.some(
    (segment) =>
      segment.screeningGate !== "passed" ||
      segment.macroExactPositionLineAgreement === null ||
      segment.macroExactPositionLineAgreement <
        segment.minimumExactPositionLineAgreement,
  )
)
  process.exitCode = 1;
