import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";
import { createLocalContainerOcrAdapter } from "../app/lib/server/ocr/local-container";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../app/lib/server/ocr/pdf-detection";
import {
  runSelectiveLocalOcr,
  type LocalOcrAdapter,
  type SelectiveOcrRequest,
} from "../app/lib/server/ocr/selective";
import { CRITICAL_FIELDS } from "../app/lib/server/evidence-fields";
import { TEXT_FUSION_MANIFEST } from "../app/lib/server/ocr/profiles";
import {
  extractionManifestLock,
  observeExtractionBenchmarkSource,
  runExtractionBenchmark,
  evaluateExtractionDocument,
  type ExtractionBenchmarkAdapter,
  type ExtractionManifest,
  type ExtractionObservation,
  type ExtractionTruth,
} from "../app/lib/server/extraction-benchmark";
import {
  createOcrPrintFixture,
  PRINT_FAMILIES,
  type Family,
} from "../tests/fixtures/ocr-print-pilot";
import {
  EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES,
  EXTRACTION_REPAIR_HEADER_DEVELOPMENT,
} from "../tests/fixtures/extraction-repair-development";
import { EXTRACTION_REPAIR_HELDOUT_FAMILIES } from "../tests/fixtures/extraction-repair-heldout";
import { EXTRACTION_REPAIR_CONFIRMATION_FAMILIES } from "../tests/fixtures/extraction-repair-confirmation";
import { EXTRACTION_REPAIR_VALIDATION_FAMILIES } from "../tests/fixtures/extraction-repair-validation";
import { EXTRACTION_REPAIR_VERIFICATION_FAMILIES } from "../tests/fixtures/extraction-repair-verification";
import { EXTRACTION_REPAIR_ASSESSMENT_FAMILIES } from "../tests/fixtures/extraction-repair-assessment";
import { EXTRACTION_REPAIR_ACCEPTANCE_FAMILIES } from "../tests/fixtures/extraction-repair-acceptance";
import { EXTRACTION_REPAIR_RUNTIME_CHECK_FAMILIES } from "../tests/fixtures/extraction-repair-runtime-check";
export type ExtractionCorpusSet =
  | "original"
  | "repair-20261017"
  | "confirmation-20261017"
  | "validation-20261017"
  | "verification-20261017"
  | "assessment-20261017"
  | "acceptance-20261017"
  | "runtime-check-20261017";
import { syntheticPdf } from "../tests/fixtures/native-pdf";

export const ENGINEERING_OCR_IMAGE =
  "sha256:990ac9d9ff190beeeaa0bb6323a2cbee8b1da0a78926f194ec217f6afa09877d";
const evaluationConfig = Object.freeze({
  psm: 3 as const,
  maxDpi: 150 as const,
  model: "text-fusion" as const,
});
const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const codePaths = [
  "app/lib/server/extraction-benchmark.ts",
  "app/lib/server/evidence-fields.ts",
  "app/lib/server/parsing/contact.ts",
  "app/lib/server/parsing/dates.ts",
  "app/lib/server/parsing/sections.ts",
  "app/lib/server/native-evidence.ts",
  "app/lib/server/native-evidence-schema.ts",
  "app/lib/server/document-evidence.ts",
  "app/lib/server/ocr/pdf-detection.ts",
  "app/lib/server/ocr/selective.ts",
  "app/lib/server/ocr/local-container.ts",
  "app/lib/server/ocr/profiles.ts",
  "scripts/ocr-runtime/runner.py",
  "scripts/ocr-runtime/Dockerfile",
  "scripts/extraction-benchmark-engineering.ts",
  "tests/fixtures/native-pdf.ts",
  "tests/fixtures/ocr-print-pilot.ts",
  "package-lock.json",
  "vitest.config.ts",
  "tests/fixtures/extraction-repair-development.ts",
  "tests/fixtures/extraction-repair-heldout.ts",
  "docs/evaluation/aa1-repair-20261017-heldout-freeze.json",
  "tests/fixtures/extraction-repair-confirmation.ts",
  "docs/evaluation/aa1-repair-20261017-confirmation-freeze.json",
  "app/lib/server/evidence-fields-v1.ts",
  "tests/fixtures/extraction-repair-validation.ts",
  "tests/fixtures/extraction-repair-verification.ts",
  "tests/fixtures/extraction-repair-assessment.ts",
  "tests/fixtures/extraction-repair-acceptance.ts",
  "tests/fixtures/extraction-repair-runtime-check.ts",
];
async function codeReceipt() {
  return Object.fromEntries(
    await Promise.all(
      codePaths.map(async (path) => [
        path,
        sha256(await readFile(new URL(`../${path}`, import.meta.url))),
      ]),
    ),
  );
}

export async function createEngineeringExtractionCorpus(
  imageId = ENGINEERING_OCR_IMAGE,
  partition: "development" | "locked" = "development",
  corpusSet: ExtractionCorpusSet = "original",
) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId))
    throw new Error("benchmark_immutable_image_required");
  const sources = new Map<string, Uint8Array>();
  const documents: ExtractionTruth[] = [];
  let families: readonly Family[] = PRINT_FAMILIES;
  if (corpusSet !== "original") {
    const confirmation = corpusSet === "confirmation-20261017";
    const validation = corpusSet === "validation-20261017";
    const verification = corpusSet === "verification-20261017";
    const assessment = corpusSet === "assessment-20261017";
    const acceptance = corpusSet === "acceptance-20261017";
    const runtimeCheck = corpusSet === "runtime-check-20261017";
    const frozenSet = runtimeCheck
      ? "runtime-check"
      : acceptance
        ? "acceptance"
        : assessment
          ? "assessment"
          : verification
            ? "verification"
            : validation
              ? "validation"
              : confirmation
                ? "confirmation"
                : "heldout";
    const frozen = JSON.parse(
      await readFile(
        new URL(
          `../docs/evaluation/aa1-repair-20261017-${frozenSet}-freeze.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const source = await readFile(
      new URL(
        `../tests/fixtures/extraction-repair-${frozenSet}.ts`,
        import.meta.url,
      ),
    );
    if (
      sha256(source) !== frozen.sourceSha256 ||
      frozen.status !== "frozen-before-parser-evaluation"
    )
      throw new Error("benchmark_heldout_source_changed");
    families = [
      ...EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES,
      ...EXTRACTION_REPAIR_HEADER_DEVELOPMENT,
      ...(runtimeCheck
        ? EXTRACTION_REPAIR_RUNTIME_CHECK_FAMILIES
        : acceptance
          ? EXTRACTION_REPAIR_ACCEPTANCE_FAMILIES
          : assessment
            ? EXTRACTION_REPAIR_ASSESSMENT_FAMILIES
            : verification
              ? EXTRACTION_REPAIR_VERIFICATION_FAMILIES
              : validation
                ? EXTRACTION_REPAIR_VALIDATION_FAMILIES
                : confirmation
                  ? EXTRACTION_REPAIR_CONFIRMATION_FAMILIES
                  : EXTRACTION_REPAIR_HELDOUT_FAMILIES),
    ].map((family) => ({ ...family, left: 48, top: 62, gap: 27 }));
  }
  for (const [index, family] of families.entries()) {
    if (family.partition !== partition) continue;
    const text = family.lines.join("\n");
    const bytes = syntheticPdf(
      family.lines
        .map(
          (line, lineIndex) =>
            `BT /F1 12 Tf 1 0 0 1 42 ${750 - lineIndex * 28} Tm (${line.replace(/[\\()]/gu, (character) => `\\${character}`)}) Tj ET`,
        )
        .join("\n"),
    );
    const nativeId = `native-${family.id}`;
    if (partition === "development") sources.set(nativeId, bytes);
    const base = {
      family: family.id,
      template: family.id,
      duplicateGroup: family.id,
      partition,
      permission: "synthetic-authored" as const,
      labelProvenance: "ai-assisted-synthetic" as const,
    };
    if (partition === "development")
      documents.push({
        ...base,
        id: nativeId,
        segment: "native-single",
        sourceHash: sha256(bytes),
        generatorVersion: "authored-native-pdf-v1",
        pages: [{ page: 1, method: "native", text }],
        fields: CRITICAL_FIELDS.map((type) => {
          const value = family.fields[type],
            start = Array.from(text.slice(0, text.indexOf(value))).length;
          return {
            type,
            value,
            span: { page: 1, start, end: start + Array.from(value).length },
          };
        }),
      });
    for (const segment of ["clean", "challenging", "mixed"] as const) {
      const fixture = await createOcrPrintFixture(index, segment, family);
      sources.set(fixture.manifest.id, fixture.bytes);
      documents.push({
        ...base,
        id: fixture.manifest.id,
        segment,
        sourceHash: fixture.manifest.sourceSha256,
        generatorVersion: fixture.manifest.generatorVersion,
        pages: fixture.expectedPageTexts.map((text, page) => ({
          page: page + 1,
          method:
            segment === "mixed" && page === 1
              ? ("native" as const)
              : ("ocr" as const),
          text,
        })),
        fields: fixture.labels.map((label) => ({
          type: label.field as (typeof CRITICAL_FIELDS)[number],
          value: label.value,
          span: { page: label.pageNumber, start: label.start, end: label.end },
        })),
      });
    }
  }
  const versions = createLocalContainerOcrAdapter({
    bytes: sources.values().next().value!,
    imageId,
    evaluationConfig,
  }).versions;
  const receipt = Object.freeze({
    imageId,
    evaluationConfig,
    versions,
    modelManifest: TEXT_FUSION_MANIFEST,
    sourceCode: await codeReceipt(),
    sourceFamilies: families.map((family) => ({
      id: family.id,
      partition: family.partition,
      authoredSourceHash: sha256(JSON.stringify(family)),
    })),
    runtimePlatform: `${process.platform}/${process.arch}`,
    scope: "synthetic_engineering_only",
    partition,
    corpusSet,
  });
  const manifest: ExtractionManifest = {
    schemaVersion: "extraction-benchmark/1.0.0",
    datasetVersion:
      corpusSet === "original"
        ? `aa015-native-print-${partition}-v1`
        : `aa1-${corpusSet}-${partition}-v1`,
    producerVersion: "document-evidence/2.0.0",
    providerVersion: `${versions.engine}/${versions.renderer}`,
    configurationHash: sha256(JSON.stringify(receipt)),
    documents,
    requiredSegments: [
      ...(partition === "development"
        ? [
            {
              id: "native-single",
              scan: "native" as const,
              layout: "single-column" as const,
            },
          ]
        : []),
      { id: "clean", scan: "clean", layout: "single-column" },
      { id: "challenging", scan: "challenging", layout: "single-column" },
      { id: "mixed", scan: "clean", layout: "single-column" },
    ],
    releaseEvidence: {
      calibratedPolicy: null,
      independentHumanAgreement: null,
      representativeCorpusReceipt: null,
      approvedThresholdsReceipt: null,
      sampleSizeJustificationReceipt: null,
    },
  };
  return {
    manifest,
    manifestLock: extractionManifestLock(manifest),
    receipt,
    sources,
  };
}

export function createEngineeringExtractionAdapter(options: {
  manifest: Pick<
    ExtractionManifest,
    "producerVersion" | "providerVersion" | "configurationHash"
  >;
  imageId: string;
  makeOcrAdapter?: (bytes: Uint8Array) => LocalOcrAdapter;
}): ExtractionBenchmarkAdapter {
  const versions = {
    producerVersion: options.manifest.producerVersion,
    providerVersion: options.manifest.providerVersion,
    configurationHash: options.manifest.configurationHash,
  };
  return async ({ id, sourceHash, bytes }) => {
    const started = performance.now();
    const extracted = await extractPdfTextLayers(bytes, {
      maxPages: 10,
      maxCharacters: 100_000,
      includeLayout: true,
    });
    const native = buildNativeEvidence(extracted.pageTexts);
    const profile = detectPdfTextProfile(extracted);
    const context = {
      id: randomUUID(),
      ownerId: randomUUID(),
      analysisId: randomUUID(),
      sourceId: randomUUID(),
      inputSha256: sourceHash,
      createdAt: new Date().toISOString(),
      retentionPolicyId: "synthetic-local-30d/1.0.0",
    };
    let ocr = null;
    let ocrFailure = null;
    if (profile.pagesNeedingOcr.length) {
      const request: SelectiveOcrRequest = {
        schemaVersion: "selective-ocr-request-v1",
        attemptId: randomUUID(),
        ownerId: context.ownerId,
        analysisId: context.analysisId,
        sourceId: context.sourceId,
        createdAt: context.createdAt,
        retentionPolicyId: context.retentionPolicyId,
        sourceSha256: sourceHash,
        nativePageTexts: extracted.pageTexts,
        selectedPages: profile.pagesNeedingOcr.map((pageNumber) => ({
          pageNumber,
          pageId: `page-${pageNumber}`,
        })),
        remainingDeadlineMs: 15_000,
        limits: { maxCharacters: 100_000, maxPages: 10 },
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
      const adapter =
        options.makeOcrAdapter?.(bytes) ??
        createLocalContainerOcrAdapter({
          bytes,
          imageId: options.imageId,
          evaluationConfig,
        });
      const outcome = await runSelectiveLocalOcr(
        request,
        adapter,
        new AbortController().signal,
      );
      if (
        outcome.status === "review_required" ||
        outcome.status === "insufficient"
      )
        ocr = outcome;
      else if (outcome.status === "failed") ocrFailure = { code: outcome.code };
    }
    const evidence = reconcileDocumentEvidence(
      context,
      native,
      ocr,
      ocrFailure,
    );
    const pages = native.pages.map((page) => {
      const recognized = ocr?.pages.find(
        (item) => item.pageNumber === page.pageNumber,
      );
      return {
        page: page.pageNumber,
        method: recognized ? ("ocr" as const) : ("native" as const),
        text: recognized?.text ?? page.text,
      };
    });
    const fields = evidence.assertions.flatMap((assertion) =>
      assertion.evidence.map((reference) => {
        const source = evidence.spans.find(
          (span) => span.id === reference.spanId,
        )!;
        const page = native.pages.find((page) => page.id === source.pageId)!;
        return {
          type: assertion.field,
          value: assertion.value,
          span: {
            page: page.pageNumber,
            start: source.start + reference.start,
            end: source.start + reference.end,
          },
        };
      }),
    );
    return {
      id,
      sourceHash,
      ...versions,
      status: evidence.status,
      pages,
      fields,
      authoritativeScore: null,
      criticalInputsComplete: !evidence.blockers.some((blocker) =>
        [
          "missing_critical_fields",
          "missing_ocr_pages",
          "conflicting_critical_fields",
          "ocr_failure",
          "no_text",
        ].includes(blocker),
      ),
      confidenceCalibrated: false,
      wallMs: performance.now() - started,
      apiFeeMicros: 0,
      computeCostMicros: null,
    };
  };
}

export async function runEngineeringExtractionHarness(options: {
  mode: "engineering" | "release";
  manifestOnly?: boolean;
  expectedLock?: string;
  imageId?: string;
  partition?: "development" | "locked";
  corpusSet?: ExtractionCorpusSet;
  emit?: (value: unknown) => void;
}) {
  const corpus = await createEngineeringExtractionCorpus(
    options.imageId ?? ENGINEERING_OCR_IMAGE,
    options.partition ?? "development",
    options.corpusSet ?? "original",
  );
  if (options.expectedLock && corpus.manifestLock !== options.expectedLock)
    throw new Error("benchmark_frozen_receipt_mismatch");
  const safeReceipt = {
    status: "manifest_frozen_before_recognition",
    manifestLock: corpus.manifestLock,
    configurationHash: corpus.manifest.configurationHash,
    receipt: corpus.receipt,
    sources: corpus.manifest.documents.map(
      ({
        id,
        family,
        segment,
        partition,
        sourceHash,
        generatorVersion,
        pages,
        fields,
      }) => ({
        id,
        family,
        segment,
        partition,
        sourceHash,
        generatorVersion,
        labelsHash: sha256(JSON.stringify({ pages, fields })),
      }),
    ),
  };
  options.emit?.(safeReceipt);
  if (options.manifestOnly) return { ...safeReceipt, exitCode: 0 };
  if (options.mode === "release")
    return {
      schemaVersion: "extraction-report/1.0.0",
      mode: "release",
      partition: corpus.receipt.partition,
      manifestLock: corpus.manifestLock,
      configurationHash: corpus.manifest.configurationHash,
      evaluation: "not_run_release_prerequisites_missing",
      engineeringPassed: null,
      releasePassed: false,
      releaseBlockers: [
        "synthetic_corpus_not_representative",
        ...(corpus.receipt.partition === "locked"
          ? []
          : ["locked_partition_required"]),
        "missing_calibratedPolicy",
        "missing_representativeCorpusReceipt",
        "missing_approvedThresholdsReceipt",
        "missing_sampleSizeJustificationReceipt",
        "independent_human_validation_missing",
        "calibration_partition_missing",
      ],
      exitCode: 1,
    };
  if (corpus.receipt.partition === "locked" && !options.expectedLock)
    throw new Error("benchmark_previously_frozen_locked_receipt_required");
  const adapter = createEngineeringExtractionAdapter({
    manifest: {
      producerVersion: corpus.manifest.producerVersion,
      providerVersion: corpus.manifest.providerVersion,
      configurationHash: corpus.manifest.configurationHash,
    },
    imageId: corpus.receipt.imageId,
  });
  const observations: ExtractionObservation[] = [];
  for (const truth of corpus.manifest.documents)
    observations.push(
      await observeExtractionBenchmarkSource(
        {
          id: truth.id,
          sourceHash: truth.sourceHash,
          bytes: corpus.sources.get(truth.id)!,
        },
        adapter,
      ),
    );
  if (
    JSON.stringify(await codeReceipt()) !==
    JSON.stringify(corpus.receipt.sourceCode)
  )
    throw new Error("benchmark_source_changed_during_execution");
  const report = runExtractionBenchmark({
    manifest: corpus.manifest,
    manifestLock: corpus.manifestLock,
    observations,
    mode: options.mode,
    partition: corpus.receipt.partition,
  });
  const perField = CRITICAL_FIELDS.map((field) => {
    const total = { truePositive: 0, falsePositive: 0, falseNegative: 0 };
    for (const [index, truth] of corpus.manifest.documents.entries()) {
      const counts = evaluateExtractionDocument(
        {
          ...truth,
          fields: truth.fields.filter((item) => item.type === field),
        },
        {
          ...observations[index],
          fields: observations[index].fields.filter(
            (item) => item.type === field,
          ),
        },
      ).counts;
      total.truePositive += counts.truePositive;
      total.falsePositive += counts.falsePositive;
      total.falseNegative += counts.falseNegative;
    }
    return { field, ...total };
  });
  return {
    ...report,
    perField,
    authoritativeScoresEmitted: observations.filter(
      (observation) => observation.authoritativeScore !== null,
    ).length,
    criticalFields: {
      predicted: observations.reduce(
        (sum, observation) => sum + observation.fields.length,
        0,
      ),
      expected: corpus.manifest.documents.reduce(
        (sum, truth) => sum + truth.fields.length,
        0,
      ),
    },
    resourceMeasurements: {
      computeCost: "host_rate_unavailable",
      memoryAndCpu: "not_aggregated_in_this_harness",
    },
    limitations: [
      `${corpus.receipt.sourceFamilies.filter((family) => family.partition === corpus.receipt.partition).length}_authored_${corpus.receipt.partition}_families_not_representative`,
      "no_calibration_or_representative_recognition",
      "independent_human_validation_deferred",
      "single_column_only",
    ],
  };
}
