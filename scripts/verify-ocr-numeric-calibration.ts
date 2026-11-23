/** One fresh synthetic calibration against the frozen numeric OCR candidate. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  extractEvidenceFields,
  MIXED_OCR_FIELD_PROFILE_V4,
  type EvidenceField,
  type FieldSourceSpan,
} from "../app/lib/server/evidence-fields";
import {
  evaluateExtractionDocument,
  extractionManifestLock,
  runExtractionBenchmark,
  validateExtractionManifest,
  type ExtractionManifest,
  type ExtractionObservation,
} from "../app/lib/server/extraction-benchmark";
import {
  createLocalContainerOcrAdapter,
  type DockerCommand,
} from "../app/lib/server/ocr/local-container";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../app/lib/server/ocr/pdf-detection";
import { runSelectiveLocalOcr } from "../app/lib/server/ocr/selective";
import { createOcrPrintFixture } from "../tests/fixtures/ocr-print-pilot";
import { OCR_RELIABILITY_CALIBRATION_ROUND3_FAMILIES } from "../tests/fixtures/ocr-reliability-calibration-round3";

const folder = "tasks/agent-handoffs/2026-11-09-reliability-implementation";
const receiptPath = `${folder}/cr-a05-calibration-round3.json`;
const developmentLock =
  "docs/evaluation/OCR_NUMERIC_PUNCTUATION_REGISTRATION.json";
const oldLockPaths = [
  `${folder}/cr-a05-holdout-registration.json`,
  `${folder}/cr-a05-calibration-round2-registration.json`,
];
const core = "scripts/ocr-runtime/dash-geometry-probe.py";
const numeric = "scripts/ocr-runtime/numeric-punctuation.py";
const hash = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const fileHash = (path: string) => hash(readFileSync(path));
const jsonHash = (data: unknown) => hash(JSON.stringify(data));
type EarlierSource = {
  id: string;
  sourceFamily?: string;
  family?: string;
  nearDuplicateGroup?: string;
  sourceSha256: string;
  authoredSourceSha256: string;
  expectedTextSha256: string;
};
type CandidateRegistration = {
  schemaVersion: string;
  imageId: string;
  fieldProfile: string;
  configuration: { psm: 3; maxDpi: 150 };
  files: Record<string, string>;
  sources: EarlierSource[];
};
const development = JSON.parse(
  readFileSync(developmentLock, "utf8"),
) as CandidateRegistration;
assert.equal(
  development.schemaVersion,
  "ocr-development-numeric-punctuation/1.0.1",
);
assert.equal(development.fieldProfile, MIXED_OCR_FIELD_PROFILE_V4);
assert.match(development.imageId, /^sha256:[a-f0-9]{64}$/u);
assert.deepEqual(development.configuration, { psm: 3, maxDpi: 150 });
for (const [path, expected] of Object.entries(development.files)) {
  if (fileHash(path) !== expected)
    throw new Error("Frozen development candidate changed");
}
const imageId = development.imageId;
const entry = '\n\nif __name__ == "__main__":';
const source = readFileSync(core, "utf8");
assert.equal(source.split(entry).length, 2);
const injected = source.replace(
  entry,
  "\n\n" +
    readFileSync(numeric, "utf8") +
    "\nrefine_word = numeric_punctuation_refiner(refine_word)" +
    entry,
);

const priorSources = [...development.sources];
for (const path of oldLockPaths) {
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    partitions: Record<string, { sourceManifest: EarlierSource[] }>;
  };
  for (const partition of Object.values(file.partitions))
    priorSources.push(...partition.sourceManifest);
}
const priorIdentities = new Set(
  priorSources.flatMap((item) => [
    item.id,
    item.sourceFamily,
    item.family,
    item.nearDuplicateGroup,
    item.sourceSha256,
    item.authoredSourceSha256,
    item.expectedTextSha256,
  ]),
);

const requiredSegments = [
  { id: "clean", scan: "clean", layout: "single-column" },
  { id: "challenging", scan: "challenging", layout: "single-column" },
  { id: "mixed", scan: "clean", layout: "single-column" },
] as const;
const fixtures: Awaited<ReturnType<typeof createOcrPrintFixture>>[] = [];
for (const [
  index,
  family,
] of OCR_RELIABILITY_CALIBRATION_ROUND3_FAMILIES.entries()) {
  for (const value of Object.values(family.fields)) {
    const authored = family.lines.join("\n");
    assert(
      authored.includes(value) &&
        authored.indexOf(value) === authored.lastIndexOf(value),
    );
  }
  for (const { id } of requiredSegments)
    fixtures.push(await createOcrPrintFixture(index, id, family));
}
const records = fixtures.map(
  ({ id, manifest, labels, expectedPageTexts, expectedLineOrder }) => {
    assert.equal(manifest.partition, "calibration");
    const expectedTextSha256 = jsonHash(expectedPageTexts);
    for (const identity of [
      id,
      manifest.sourceFamily,
      manifest.nearDuplicateGroup,
      manifest.sourceSha256,
      manifest.authoredSourceSha256,
      expectedTextSha256,
    ])
      assert(
        !priorIdentities.has(identity),
        "Calibration identity overlaps with an earlier partition",
      );
    return {
      ...manifest,
      labelsSha256: jsonHash(labels),
      lineOrderSha256: jsonHash(expectedLineOrder),
      expectedTextSha256,
    };
  },
);
assert.equal(
  new Set(records.map(({ sourceSha256 }) => sourceSha256)).size,
  records.length,
);

const provider = createLocalContainerOcrAdapter({
  bytes: fixtures[0].bytes,
  imageId,
  evaluationConfig: development.configuration,
}).versions;
const versions = {
  ...provider,
  engine: provider.engine + "/glyph-box-development-4",
};
const files = Object.fromEntries(
  [
    developmentLock,
    ...oldLockPaths,
    "scripts/verify-ocr-numeric-calibration.ts",
    "tests/fixtures/ocr-reliability-calibration-round3.ts",
    "app/lib/server/extraction-benchmark.ts",
    "app/lib/server/parsing/contact.ts",
    "app/lib/server/parsing/dates.ts",
    "app/lib/server/parsing/sections.ts",
  ].map((path) => [path, fileHash(path)]),
);
const configurationHash = jsonHash({
  imageId,
  versions,
  workerSourceSha256: hash(injected),
  execution: development.configuration,
  producer: MIXED_OCR_FIELD_PROFILE_V4,
  files,
});
const identity = {
  producerVersion: MIXED_OCR_FIELD_PROFILE_V4,
  providerVersion: `${versions.engine}/${versions.renderer}`,
  configurationHash,
};
const manifest: ExtractionManifest = {
  schemaVersion: "extraction-benchmark/1.0.0",
  datasetVersion: "ocr-reliability-calibration-round3/1.0.0",
  ...identity,
  requiredSegments: [...requiredSegments],
  documents: fixtures.map((fixture) => ({
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
      type: label.field as EvidenceField,
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
const manifestLock = extractionManifestLock(manifest);
validateExtractionManifest(manifest, manifestLock);
const registration = {
  schemaVersion: "ocr-numeric-calibration-registration/1.0.0",
  datasetVersion: manifest.datasetVersion,
  partition: "calibration",
  nodeVersion: process.versions.node,
  workerImage: imageId,
  versions,
  manifestLock,
  configurationHash,
  sharedRendererLineage: true,
  workerSourceSha256: hash(injected),
  maxSerialAttempts: fixtures.length,
  maxWallTimePerAttemptMs: 10_000,
  files,
  sources: records,
};

function docker(
  args: readonly string[],
  options: Parameters<DockerCommand>[1],
) {
  return execFileSync("docker", args, {
    env: { HOME: process.env.HOME, PATH: process.env.PATH },
    input: options.input,
    encoding: "utf8",
    timeout: options.timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: options.maxOutputBytes ?? 4 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const command: DockerCommand = async (args, options) => {
  try {
    assert(!options.signal?.aborted);
    if (args[0] !== "create") return docker(args, options);
    const index = args.indexOf(imageId);
    assert(index > 0 && /^(?:1|1,3)$/u.test(args[index + 1]));
    return docker(
      [
        ...args.slice(0, index),
        "--entrypoint=/usr/bin/python3",
        imageId,
        "-I",
        "-B",
        "-c",
        injected,
        args[index + 1],
      ],
      options,
    );
  } catch {
    throw new Error("Calibration worker command failed");
  }
};

function requireCleanWorkerPool() {
  assert(
    !docker(
      ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
      { timeoutMs: 3_000, maxOutputBytes: 4096 },
    ).trim(),
    "Wait for the existing OCR evaluation to finish",
  );
}

async function observe(
  fixture: (typeof fixtures)[number],
): Promise<ExtractionObservation> {
  const started = performance.now();
  const { pageTexts } = await extractPdfTextLayers(fixture.bytes, {
    maxPages: 3,
    maxCharacters: 100_000,
  });
  const routing = detectPdfTextProfile({
    text: pageTexts.join("\n"),
    pageTexts,
    totalPages: pageTexts.length,
  });
  const selected = fixture.segment === "mixed" ? [1, 3] : [1];
  assert.deepEqual(routing.pagesNeedingOcr, selected);
  const adapter = createLocalContainerOcrAdapter({
    bytes: fixture.bytes,
    imageId,
    evaluationConfig: development.configuration,
    command,
  });
  const outcome = await runSelectiveLocalOcr(
    {
      schemaVersion: "selective-ocr-request-v1",
      attemptId: randomUUID(),
      ownerId: randomUUID(),
      analysisId: randomUUID(),
      sourceId: randomUUID(),
      createdAt: new Date().toISOString(),
      retentionPolicyId: "synthetic-local-30d/1.0.0",
      sourceSha256: fixture.manifest.sourceSha256,
      nativePageTexts: pageTexts,
      selectedPages: selected.map((pageNumber) => ({
        pageNumber,
        pageId: `page-${pageNumber}`,
      })),
      limits: { maxCharacters: 100_000, maxPages: 3 },
      remainingDeadlineMs: 15_000,
      allocation: {
        id: "owner-approved-synthetic-local-2026-10-04",
        maxWallTimeMs: 10_000,
        maxPages: 3,
        externalApiFeeMicros: 0,
      },
      policy: {
        executionMode: "self_hosted",
        purpose: "synthetic_local_test",
        allowThirdPartyProcessing: false,
      },
    },
    { ...adapter, versions },
    new AbortController().signal,
  );
  requireCleanWorkerPool();
  assert(!("scoringEligible" in outcome && outcome.scoringEligible));
  const recognized =
    outcome.status === "review_required" || outcome.status === "insufficient"
      ? outcome.pages
      : [];
  const pages: ExtractionObservation["pages"] = pageTexts.flatMap(
    (text, index) =>
      selected.includes(index + 1)
        ? []
        : [{ page: index + 1, method: "native", text }],
  );
  pages.push(
    ...recognized.map(({ pageNumber: page, text }) => ({
      page,
      method: "ocr" as const,
      text,
    })),
  );
  pages.sort((a, b) => a.page - b.page);
  const spans = pages.flatMap(({ page, text, method }) => {
    const pageId = `page-${page}`;
    let start = 0;
    return text
      .split("\n")
      .map((line, index) => {
        const span = {
          id: `${pageId}-line-${index + 1}`,
          pageId,
          page,
          text: line,
          method: method === "ocr" ? "local_ocr" : "native_text",
          start,
        } as const;
        start += Array.from(line).length + 1;
        return span;
      })
      .filter(({ text }) => text.trim());
  });
  const bySpan = new Map<
    string,
    FieldSourceSpan & { page: number; start: number }
  >(spans.map((span) => [span.id, span]));
  const fields = extractEvidenceFields(
    spans,
    MIXED_OCR_FIELD_PROFILE_V4,
  ).flatMap((field) =>
    field.evidence.map((ref) => {
      const span = bySpan.get(ref.spanId);
      assert(span, "Field citation must resolve to its recognized source");
      return {
        type: field.field,
        value: field.value,
        span: {
          page: span.page,
          start: span.start + ref.start,
          end: span.start + ref.end,
        },
      };
    }),
  );
  return {
    id: fixture.id,
    sourceHash: fixture.manifest.sourceSha256,
    ...identity,
    status: outcome.status === "not_needed" ? "unsupported" : outcome.status,
    pages,
    fields,
    authoritativeScore: null,
    criticalInputsComplete: false,
    confidenceCalibrated: false,
    wallMs: performance.now() - started,
    apiFeeMicros: 0,
    computeCostMicros: null,
  };
}

const [mode, path] = process.argv.slice(2);
if (mode === "--manifest-only" && !path) {
  process.stdout.write(JSON.stringify(registration, null, 2) + "\n");
} else {
  assert(
    mode === "--run-registered" && path && process.argv.length === 4,
    "Pass --run-registered <registration>",
  );
  const frozen = readFileSync(path);
  assert(
    jsonHash(registration) === jsonHash(JSON.parse(frozen.toString())),
    "Calibration registration drift",
  );
  requireCleanWorkerPool();
  assert.equal(
    docker(
      [
        "image",
        "inspect",
        imageId,
        "--format",
        "{{.Id}} {{.Os}}/{{.Architecture}}",
      ],
      { timeoutMs: 3_000, maxOutputBytes: 4096 },
    ).trim(),
    `${imageId} linux/arm64`,
  );
  const run = {
    registrationSha256: hash(frozen),
    datasetVersion: manifest.datasetVersion,
    startedAt: new Date().toISOString(),
    partition: "calibration",
    scoringEligible: false,
  };
  writeFileSync(
    receiptPath,
    JSON.stringify({ ...run, status: "claimed" }) + "\n",
    { flag: "wx" },
  );
  const partial = `${receiptPath}.${randomUUID()}.tmp`;
  const observations: ExtractionObservation[] = [];
  const complete = (data: unknown) => {
    writeFileSync(partial, JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
    renameSync(partial, receiptPath);
  };
  try {
    for (const fixture of fixtures) observations.push(await observe(fixture));
    const benchmark = runExtractionBenchmark({
      manifest,
      manifestLock,
      observations,
      mode: "engineering",
      partition: "calibration",
    });
    const documents = manifest.documents.map((truth, index) =>
      evaluateExtractionDocument(truth, observations[index]),
    );
    const report = {
      ...run,
      status: "completed",
      recognitionExecutions: observations.length,
      ownedWorkerCleanupVerified: true,
      lockedRecognitionExecuted: false,
      benchmark,
      documents,
    };
    complete(report);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = benchmark.exitCode;
  } catch {
    complete({
      ...run,
      status: "execution_failed",
      completedObservations: observations.length,
    });
    process.stderr.write(
      "Calibration execution failed after the receipt was claimed.\n",
    );
    process.exitCode = 1;
  }
}
