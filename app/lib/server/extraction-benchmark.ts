import { createHash } from "node:crypto";
import { z } from "zod";
import { CRITICAL_FIELDS } from "./evidence-fields";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const span = z
  .strictObject({
    page: z.number().int().positive(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((value) => value.end > value.start);
const field = z.strictObject({
  type: z.enum(CRITICAL_FIELDS),
  value: z.string().min(1),
  span,
});
const page = z.strictObject({
  page: z.number().int().positive(),
  method: z.enum(["native", "ocr"]),
  text: z.string().max(200_000),
});
const document = z.strictObject({
  id,
  family: id,
  template: id,
  duplicateGroup: id,
  segment: id,
  partition: z.enum(["development", "calibration", "locked"]),
  sourceHash: hash,
  generatorVersion: id,
  permission: z.literal("synthetic-authored"),
  labelProvenance: z.enum([
    "ai-assisted-synthetic",
    "independent-human-adjudicated",
  ]),
  pages: z.array(page).min(1).max(100),
  fields: z.array(field).max(1000),
});
export const extractionManifestSchema = z.strictObject({
  schemaVersion: z.literal("extraction-benchmark/1.0.0"),
  datasetVersion: id,
  producerVersion: id,
  providerVersion: id,
  configurationHash: hash,
  documents: z.array(document).min(1).max(10_000),
  requiredSegments: z
    .array(
      z.strictObject({
        id,
        scan: z.enum(["native", "clean", "challenging"]),
        layout: z.enum(["single-column", "multi-column"]),
      }),
    )
    .min(1),
  releaseEvidence: z.strictObject({
    calibratedPolicy: id.nullable(),
    independentHumanAgreement: z.number().min(0).max(1).nullable(),
    representativeCorpusReceipt: id.nullable(),
    approvedThresholdsReceipt: id.nullable(),
    sampleSizeJustificationReceipt: id.nullable(),
  }),
});
export const extractionObservationSchema = z.strictObject({
  id,
  sourceHash: hash,
  producerVersion: id,
  providerVersion: id,
  configurationHash: hash,
  status: z.enum([
    "ready",
    "review_required",
    "insufficient",
    "unsupported",
    "failed",
  ]),
  pages: z.array(page).max(100),
  fields: z.array(field).max(1000),
  authoritativeScore: z.number().finite().min(0).max(100).nullable(),
  criticalInputsComplete: z.boolean(),
  confidenceCalibrated: z.boolean(),
  wallMs: z.number().finite().nonnegative(),
  apiFeeMicros: z.number().int().nonnegative(),
  computeCostMicros: z.number().int().nonnegative().nullable(),
});
export type ExtractionManifest = z.infer<typeof extractionManifestSchema>;
export type ExtractionObservation = z.infer<typeof extractionObservationSchema>;
export type ExtractionTruth = ExtractionManifest["documents"][number];

// Truth is deliberately absent from this adapter boundary. The caller owns the
// source bytes; a separate evaluator joins observations to frozen labels by ID.
export type ExtractionBenchmarkAdapter = (input: {
  id: string;
  sourceHash: string;
  bytes: Uint8Array;
}) => Promise<ExtractionObservation>;

export async function observeExtractionBenchmarkSource(
  input: { id: string; sourceHash: string; bytes: Uint8Array },
  adapter: ExtractionBenchmarkAdapter,
) {
  if (
    createHash("sha256").update(input.bytes).digest("hex") !== input.sourceHash
  )
    throw new Error("benchmark_source_bytes_mismatch");
  // Copy only the approved keys even if the caller supplies extra properties.
  const result = extractionObservationSchema.parse(
    await adapter({
      id: input.id,
      sourceHash: input.sourceHash,
      bytes: input.bytes,
    }),
  );
  if (result.id !== input.id || result.sourceHash !== input.sourceHash)
    throw new Error("benchmark_source_mismatch");
  return result;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function extractionManifestLock(input: unknown) {
  return digest(extractionManifestSchema.parse(input));
}

function grounded(item: z.infer<typeof field>, pages: z.infer<typeof page>[]) {
  const source = pages.find((entry) => entry.page === item.span.page);
  return Boolean(
    source &&
    Array.from(source.text).slice(item.span.start, item.span.end).join("") ===
      item.value,
  );
}
export function validateExtractionManifest(
  input: unknown,
  expectedLock: string,
) {
  const manifest = extractionManifestSchema.parse(input);
  if (digest(manifest) !== expectedLock)
    throw new Error("benchmark_manifest_lock_mismatch");
  const ids = new Set<string>();
  const segments = new Map(
    manifest.requiredSegments.map((item) => [item.id, item]),
  );
  if (segments.size !== manifest.requiredSegments.length)
    throw new Error("benchmark_duplicate_segment");
  const partitions = new Map<string, string>();
  const familyAliases = new Map<string, string>();
  for (const doc of manifest.documents) {
    if (ids.has(doc.id) || !segments.has(doc.segment))
      throw new Error("benchmark_invalid_document_identity");
    ids.add(doc.id);
    const pages = doc.pages.map((item) => item.page);
    if (pages.some((number, index) => number !== index + 1))
      throw new Error("benchmark_invalid_truth_pages");
    const fieldKeys = doc.fields.map((item) => JSON.stringify(item));
    if (
      new Set(fieldKeys).size !== fieldKeys.length ||
      doc.fields.some((item) => !grounded(item, doc.pages))
    )
      throw new Error("benchmark_invalid_truth_fields");
    for (const key of [
      `family:${doc.family}`,
      `template:${doc.template}`,
      `duplicate:${doc.duplicateGroup}`,
      `hash:${doc.sourceHash}`,
    ]) {
      const prior = partitions.get(key);
      if (prior && prior !== doc.partition)
        throw new Error("benchmark_partition_leakage");
      partitions.set(key, doc.partition);
    }
    for (const key of [
      `template:${doc.template}`,
      `duplicate:${doc.duplicateGroup}`,
      `hash:${doc.sourceHash}`,
    ]) {
      const prior = familyAliases.get(key);
      if (prior && prior !== doc.family)
        throw new Error("benchmark_source_family_alias");
      familyAliases.set(key, doc.family);
    }
  }
  return manifest;
}

function distance(reference: string[], actual: string[]) {
  // Trim equal edges without altering Levenshtein distance. Fail closed rather
  // than allowing unbounded quadratic work on malformed benchmark observations.
  let start = 0;
  while (
    start < reference.length &&
    start < actual.length &&
    reference[start] === actual[start]
  )
    start++;
  let referenceEnd = reference.length,
    actualEnd = actual.length;
  while (
    referenceEnd > start &&
    actualEnd > start &&
    reference[referenceEnd - 1] === actual[actualEnd - 1]
  ) {
    referenceEnd--;
    actualEnd--;
  }
  reference = reference.slice(start, referenceEnd);
  actual = actual.slice(start, actualEnd);
  if (reference.length * actual.length > 20_000_000)
    throw new Error("benchmark_metric_resource_limit");
  if (!reference.length) return actual.length;
  if (!actual.length) return reference.length;
  let prior = Array.from({ length: actual.length + 1 }, (_, index) => index);
  reference.forEach((value, index) => {
    const row = [index + 1];
    actual.forEach((other, column) =>
      row.push(
        Math.min(
          row[column] + 1,
          prior[column + 1] + 1,
          prior[column] + Number(value !== other),
        ),
      ),
    );
    prior = row;
  });
  return prior[actual.length];
}
const normalized = (text: string) => text.replace(/\s+/gu, " ").trim();
const lines = (text: string) =>
  text.split(/\n/u).map(normalized).filter(Boolean);
export function evaluateExtractionDocument(
  truth: ExtractionTruth,
  input: unknown,
) {
  const actual = extractionObservationSchema.parse(input);
  if (actual.id !== truth.id || actual.sourceHash !== truth.sourceHash)
    throw new Error("benchmark_source_mismatch");
  const counts = {
    nativeErrors: 0,
    nativeCharacters: 0,
    ocrErrors: 0,
    ocrCharacters: 0,
    coveredPages: 0,
    referencePages: truth.pages.length,
    orderedLines: 0,
    lineDenominator: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
  };
  const seen = new Set<number>();
  let invalidPages = false;
  for (const output of actual.pages) {
    const reference = truth.pages.find((item) => item.page === output.page);
    if (
      !reference ||
      seen.has(output.page) ||
      output.method !== reference.method
    ) {
      invalidPages = true;
      const prefix = output.method === "native" ? "native" : "ocr";
      counts[`${prefix}Errors`] += Array.from(normalized(output.text)).length;
      counts.lineDenominator += lines(output.text).length;
    }
    seen.add(output.page);
  }
  for (const reference of truth.pages) {
    const output = actual.pages.find(
      (item) =>
        item.page === reference.page && item.method === reference.method,
    );
    const text = output?.text ?? "";
    const prefix = reference.method === "native" ? "native" : "ocr";
    const expected = Array.from(normalized(reference.text));
    counts[`${prefix}Characters`] += expected.length;
    counts[`${prefix}Errors`] += distance(
      expected,
      Array.from(normalized(text)),
    );
    // Full page coverage measures recovered text, not merely a nonempty page.
    if (output)
      counts.coveredPages += expected.length
        ? Math.max(
            0,
            1 -
              distance(expected, Array.from(normalized(text))) /
                expected.length,
          )
        : Number(!normalized(text));
    const expectedLines = lines(reference.text),
      outputLines = lines(text);
    counts.lineDenominator += Math.max(
      expectedLines.length,
      outputLines.length,
    );
    counts.orderedLines += expectedLines.filter(
      (line, index) => line === outputLines[index],
    ).length;
  }
  const remaining = [...truth.fields];
  for (const item of actual.fields) {
    const match = remaining.findIndex(
      (expected) =>
        expected.type === item.type &&
        expected.value === item.value &&
        JSON.stringify(expected.span) === JSON.stringify(item.span),
    );
    if (
      match >= 0 &&
      grounded(item, truth.pages) &&
      grounded(item, actual.pages)
    ) {
      counts.truePositive++;
      remaining.splice(match, 1);
    } else counts.falsePositive++;
  }
  counts.falseNegative = remaining.length;
  const unsafeScore =
    actual.authoritativeScore !== null &&
    (actual.status !== "ready" ||
      !actual.criticalInputsComplete ||
      !actual.confidenceCalibrated ||
      invalidPages ||
      counts.coveredPages < counts.referencePages ||
      counts.falseNegative > 0 ||
      counts.falsePositive > 0);
  return {
    id: truth.id,
    family: truth.family,
    segment: truth.segment,
    counts,
    invalidPages,
    unsafeScore,
    status: actual.status,
    wallMs: actual.wallMs,
    apiFeeMicros: actual.apiFeeMicros,
    computeCostMicros: actual.computeCostMicros,
  };
}
type Row = ReturnType<typeof evaluateExtractionDocument>;
function aggregate(rows: Row[]) {
  const sum = (key: keyof Row["counts"]) =>
    rows.reduce((total, row) => total + row.counts[key], 0);
  const ratio = (numerator: number, denominator: number) =>
    denominator ? numerator / denominator : null;
  return {
    nativeCharacterAccuracy: sum("nativeCharacters")
      ? 1 - sum("nativeErrors") / sum("nativeCharacters")
      : null,
    ocrCharacterErrorRate: ratio(sum("ocrErrors"), sum("ocrCharacters")),
    fieldPrecision: ratio(
      sum("truePositive"),
      sum("truePositive") + sum("falsePositive"),
    ),
    fieldRecall: ratio(
      sum("truePositive"),
      sum("truePositive") + sum("falseNegative"),
    ),
    pageCoverage: ratio(sum("coveredPages"), sum("referencePages")),
    orderedLineAgreement: ratio(sum("orderedLines"), sum("lineDenominator")),
  };
}
type Metric = keyof ReturnType<typeof aggregate>;
function summarize(rows: Row[], resamples: number, seed: number) {
  const families = [...new Set(rows.map((row) => row.family))].sort();
  const clusters = families.map((family) =>
    rows.filter((row) => row.family === family),
  );
  const metrics = aggregate(rows);
  const distributions = Object.fromEntries(
    Object.keys(metrics).map((key) => [key, [] as number[]]),
  ) as Record<Metric, number[]>;
  let state = seed;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  if (families.length >= 2)
    for (let index = 0; index < resamples; index++) {
      const sample = aggregate(
        Array.from(
          { length: families.length },
          () => clusters[Math.floor(random() * clusters.length)],
        ).flat(),
      );
      for (const key of Object.keys(metrics) as Metric[])
        if (sample[key] !== null) distributions[key].push(sample[key]);
    }
  const intervals = Object.fromEntries(
    (Object.keys(metrics) as Metric[]).map((key) => {
      const values = distributions[key].sort((a, b) => a - b);
      return [
        key,
        values.length === resamples
          ? [
              values[Math.ceil(resamples * 0.025) - 1],
              values[Math.ceil(resamples * 0.975) - 1],
            ]
          : null,
      ];
    }),
  ) as Record<Metric, [number, number] | null>;
  const latency = rows.map((row) => row.wallMs).sort((a, b) => a - b);
  return {
    documents: rows.length,
    sourceFamilies: families.length,
    metrics,
    confidenceIntervals95: intervals,
    intervalReason:
      families.length < 2
        ? "fewer_than_two_independent_source_families"
        : "null_metrics_have_undefined_bootstrap_denominators",
    bootstrap: { unit: "source_family", resamples, seed },
    failureRate: rows.length
      ? rows.filter((row) => row.status === "failed").length / rows.length
      : null,
    abstentionRate: rows.length
      ? rows.filter((row) =>
          ["insufficient", "unsupported"].includes(row.status),
        ).length / rows.length
      : null,
    latencyMs: {
      p50: latency[Math.ceil(latency.length * 0.5) - 1] ?? null,
      p95: latency[Math.ceil(latency.length * 0.95) - 1] ?? null,
    },
    apiFeeMicros: rows.reduce((sum, row) => sum + row.apiFeeMicros, 0),
    computeCostMicros:
      rows.length && rows.every((row) => row.computeCostMicros !== null)
        ? rows.reduce((sum, row) => sum + (row.computeCostMicros ?? 0), 0)
        : null,
  };
}

export function runExtractionBenchmark(input: {
  manifest: unknown;
  manifestLock: string;
  observations: unknown[];
  mode: "engineering" | "release";
  partition: "development" | "calibration" | "locked";
  resamples?: number;
  seed?: number;
}) {
  const manifest = validateExtractionManifest(
    input.manifest,
    input.manifestLock,
  );
  const resamples = input.resamples ?? 10_000,
    seed = input.seed ?? 20261011;
  if (
    !Number.isInteger(resamples) ||
    resamples < 100 ||
    resamples > 100_000 ||
    !Number.isInteger(seed) ||
    seed <= 0 ||
    seed > 0xffffffff
  )
    throw new Error("benchmark_invalid_bootstrap");
  const truth = manifest.documents.filter(
    (doc) => doc.partition === input.partition,
  );
  const observations = input.observations.map((row) =>
    extractionObservationSchema.parse(row),
  );
  const ids = new Set(observations.map((row) => row.id));
  if (
    ids.size !== observations.length ||
    observations.length !== truth.length ||
    truth.some((doc) => !ids.has(doc.id))
  )
    throw new Error("benchmark_observation_set_mismatch");
  const rows = truth.map((doc) => {
    const observation = observations.find((row) => row.id === doc.id)!;
    if (
      observation.producerVersion !== manifest.producerVersion ||
      observation.providerVersion !== manifest.providerVersion ||
      observation.configurationHash !== manifest.configurationHash
    )
      throw new Error("benchmark_version_lock_mismatch");
    return evaluateExtractionDocument(doc, observation);
  });
  const failures: string[] = [];
  if (rows.some((row) => row.unsafeScore))
    failures.push("unsafe_authoritative_score");
  if (rows.some((row) => row.invalidPages))
    failures.push("invalid_page_contract");
  const segments = manifest.requiredSegments.map((segment) => {
    const summary = summarize(
      rows.filter((row) => row.segment === segment.id),
      resamples,
      seed,
    );
    const limits: Partial<Record<Metric, ["minimum" | "maximum", number]>> = {
      fieldPrecision: ["minimum", 0.98],
      fieldRecall: ["minimum", 0.97],
      pageCoverage: ["minimum", 0.995],
      orderedLineAgreement: [
        "minimum",
        segment.layout === "single-column" ? 0.98 : 0.95,
      ],
    };
    if (
      segment.scan === "native" ||
      summary.metrics.nativeCharacterAccuracy !== null
    )
      limits.nativeCharacterAccuracy = ["minimum", 0.995];
    if (segment.scan !== "native")
      limits.ocrCharacterErrorRate = [
        "maximum",
        segment.scan === "clean" ? 0.01 : 0.03,
      ];
    const thresholdFailures: string[] = [];
    for (const [key, rule] of Object.entries(limits) as [
      Metric,
      ["minimum" | "maximum", number],
    ][]) {
      const interval = summary.confidenceIntervals95[key];
      if (
        !interval ||
        (rule[0] === "minimum" ? interval[0] < rule[1] : interval[1] > rule[1])
      )
        thresholdFailures.push(key);
    }
    for (const key of thresholdFailures)
      failures.push(`segment:${segment.id}:${key}`);
    return { ...segment, ...summary, thresholdFailures };
  });
  const releaseBlockers: string[] = [];
  // This implementation accepts only authored synthetic source permissions.
  // A receipt string cannot turn that corpus into representative validation.
  releaseBlockers.push("synthetic_corpus_not_representative");
  if (input.partition !== "locked")
    releaseBlockers.push("locked_partition_required");
  for (const key of [
    "calibratedPolicy",
    "representativeCorpusReceipt",
    "approvedThresholdsReceipt",
    "sampleSizeJustificationReceipt",
  ] as const)
    if (!manifest.releaseEvidence[key]) releaseBlockers.push(`missing_${key}`);
  if (
    manifest.releaseEvidence.independentHumanAgreement === null ||
    manifest.releaseEvidence.independentHumanAgreement < 0.8 ||
    truth.some((doc) => doc.labelProvenance !== "independent-human-adjudicated")
  )
    releaseBlockers.push("independent_human_validation_missing");
  if (!manifest.documents.some((doc) => doc.partition === "calibration"))
    releaseBlockers.push("calibration_partition_missing");
  const scorePolicyMissing =
    observations.some((row) => row.authoritativeScore !== null) &&
    !manifest.releaseEvidence.calibratedPolicy;
  if (scorePolicyMissing) failures.push("score_without_calibrated_policy");
  const engineeringPassed = failures.length === 0;
  const releasePassed = engineeringPassed && releaseBlockers.length === 0;
  return {
    schemaVersion: "extraction-report/1.0.0",
    mode: input.mode,
    partition: input.partition,
    manifestLock: input.manifestLock,
    datasetVersion: manifest.datasetVersion,
    producerVersion: manifest.producerVersion,
    providerVersion: manifest.providerVersion,
    configurationHash: manifest.configurationHash,
    normalizationPolicy: "unicode-codepoint-whitespace-v1",
    segments,
    failures,
    releaseBlockers,
    engineeringPassed,
    releasePassed,
    exitCode: (input.mode === "engineering" ? engineeringPassed : releasePassed)
      ? 0
      : 1,
  };
}
