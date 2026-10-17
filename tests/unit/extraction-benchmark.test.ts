import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateExtractionDocument,
  extractionManifestLock,
  runExtractionBenchmark,
  observeExtractionBenchmarkSource,
  validateExtractionManifest,
  type ExtractionManifest,
  type ExtractionObservation,
} from "../../app/lib/server/extraction-benchmark";

function fixture() {
  const manifest: ExtractionManifest = {
    schemaVersion: "extraction-benchmark/1.0.0",
    datasetVersion: "synthetic-test-v1",
    producerVersion: "extractor-test-v1",
    providerVersion: "native-test-v1",
    configurationHash: "a".repeat(64),
    requiredSegments: [
      { id: "native-single", scan: "native", layout: "single-column" },
    ],
    releaseEvidence: {
      calibratedPolicy: null,
      independentHumanAgreement: null,
      representativeCorpusReceipt: null,
      approvedThresholdsReceipt: null,
      sampleSizeJustificationReceipt: null,
    },
    documents: ["one", "two"].map((id, index) => ({
      id,
      family: id,
      template: id,
      duplicateGroup: id,
      segment: "native-single",
      partition: "development",
      sourceHash: String(index + 1).repeat(64),
      generatorVersion: "test-v1",
      permission: "synthetic-authored",
      labelProvenance: "ai-assisted-synthetic",
      pages: [{ page: 1, method: "native", text: "Fictional Name\nEngineer" }],
      fields: [
        {
          type: "name",
          value: "Fictional Name",
          span: { page: 1, start: 0, end: 14 },
        },
      ],
    })),
  };
  const observations: ExtractionObservation[] = manifest.documents.map(
    (doc) => ({
      id: doc.id,
      sourceHash: doc.sourceHash,
      producerVersion: manifest.producerVersion,
      providerVersion: manifest.providerVersion,
      configurationHash: manifest.configurationHash,
      status: "review_required",
      pages: structuredClone(doc.pages),
      fields: structuredClone(doc.fields),
      authoritativeScore: null,
      criticalInputsComplete: true,
      confidenceCalibrated: false,
      wallMs: 10,
      apiFeeMicros: 0,
      computeCostMicros: null,
    }),
  );
  const run = (mode: "engineering" | "release" = "engineering") =>
    runExtractionBenchmark({
      manifest,
      manifestLock: extractionManifestLock(manifest),
      observations,
      mode,
      partition: "development",
      resamples: 100,
    });
  return { manifest, observations, run };
}

describe("extraction-v2 benchmark", () => {
  it("keeps exact grounded coordinates after an unrelated OCR substitution", () => {
    const { manifest, observations } = fixture();
    const truth = manifest.documents[0];
    truth.pages[0].text = "Header\nFictional Name";
    truth.fields[0].span = { page: 1, start: 7, end: 21 };
    const actual = observations[0];
    actual.pages[0].text = "Heoder\nFictional Name";
    actual.fields[0].span = { page: 1, start: 7, end: 21 };
    const result = evaluateExtractionDocument(truth, actual);
    expect(result.counts).toMatchObject({
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 0,
    });
    expect(result.counts.nativeErrors).toBeGreaterThan(0);
  });
  it("matches grounded fields across whitespace-only source offset changes", () => {
    const { manifest, observations } = fixture();
    const truth = manifest.documents[0];
    truth.pages[0].text = "Header\n\nFictional Name\nEngineer";
    truth.fields[0].span = { page: 1, start: 8, end: 22 };
    const actual = observations[0];
    actual.pages[0].text = "Header\nFictional Name\nEngineer";
    actual.fields[0].span = { page: 1, start: 7, end: 21 };
    expect(evaluateExtractionDocument(truth, actual).counts).toMatchObject({
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 0,
    });
    actual.fields[0].span.start++;
    expect(evaluateExtractionDocument(truth, actual).counts.truePositive).toBe(
      0,
    );
  });

  it("rejects a grounded duplicate at a different source occurrence", () => {
    const { manifest, observations } = fixture();
    const truth = manifest.documents[0];
    truth.pages[0].text = "Fictional Name\n\nFictional Name";
    const actual = observations[0];
    actual.pages[0].text = "Fictional Name\nFictional Name";
    actual.fields[0].span = { page: 1, start: 15, end: 29 };
    expect(evaluateExtractionDocument(truth, actual).counts).toMatchObject({
      truePositive: 0,
      falsePositive: 1,
      falseNegative: 1,
    });
  });

  it("preserves Unicode offsets while isolating earlier-line transcription errors", () => {
    const { manifest, observations } = fixture();
    const truth = manifest.documents[0];
    truth.pages[0].text = "📄\n\nFictional Name";
    truth.fields[0].span = { page: 1, start: 3, end: 17 };
    const actual = observations[0];
    actual.pages[0].text = "📄\nFictional Name";
    actual.fields[0].span = { page: 1, start: 2, end: 16 };
    expect(evaluateExtractionDocument(truth, actual).counts.truePositive).toBe(
      1,
    );
    actual.pages[0].text = "X\nFictional Name";
    expect(evaluateExtractionDocument(truth, actual).counts.truePositive).toBe(
      1,
    );
    expect(
      evaluateExtractionDocument(truth, actual).counts.nativeErrors,
    ).toBeGreaterThan(0);
    actual.pages[0].text = "📄\nFictional Name";
    actual.pages[0].page = 2;
    actual.fields[0].span.page = 2;
    expect(evaluateExtractionDocument(truth, actual).counts.truePositive).toBe(
      0,
    );
  });
  it("returns nonzero from the release CLI while engineering output remains reviewable", () => {
    const { manifest, observations } = fixture();
    const directory = mkdtempSync(join(tmpdir(), "extraction-benchmark-"));
    const file = join(directory, "input.json");
    try {
      writeFileSync(
        file,
        JSON.stringify({
          manifest,
          manifestLock: extractionManifestLock(manifest),
          observations,
          partition: "development",
          resamples: 100,
        }),
      );
      const command = [
        "node_modules/vite-node/vite-node.mjs",
        "--config",
        "vitest.config.ts",
        "scripts/benchmark-extraction-v2.ts",
        file,
      ];
      const release = spawnSync(process.execPath, command, {
        encoding: "utf8",
      });
      expect(release.status).toBe(1);
      expect(release.stdout, release.stderr).not.toBe("");
      expect(JSON.parse(release.stdout).releasePassed).toBe(false);
      const engineering = spawnSync(
        process.execPath,
        [...command, "--engineering"],
        { encoding: "utf8" },
      );
      expect(engineering.status).toBe(0);
      expect(JSON.parse(engineering.stdout).engineeringPassed).toBe(true);
      writeFileSync(file, "{invalid private fixture content");
      const malformed = spawnSync(process.execPath, command, {
        encoding: "utf8",
      });
      expect(malformed.status).toBe(1);
      expect(malformed.stderr).toContain(
        "extraction_benchmark_invalid_input\n",
      );
      expect(malformed.stderr).not.toContain("private fixture content");
      expect(malformed.stdout).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("hash-verifies source bytes and never passes labels into the adapter", async () => {
    const { observations } = fixture();
    const bytes = new Uint8Array([1, 2, 3]);
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const adapter = vi.fn(
      async (source: {
        id: string;
        sourceHash: string;
        bytes: Uint8Array;
      }) => ({ ...observations[0], id: source.id, sourceHash }),
    );
    const input = {
      id: observations[0].id,
      sourceHash,
      bytes,
      truth: "must not leak",
    };
    await observeExtractionBenchmarkSource(input, adapter);
    expect(Object.keys(adapter.mock.calls[0][0])).toEqual([
      "id",
      "sourceHash",
      "bytes",
    ]);
    await expect(
      observeExtractionBenchmarkSource(
        { ...input, bytes: new Uint8Array([4]) },
        adapter,
      ),
    ).rejects.toThrow("source_bytes_mismatch");
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("never promotes authored synthetic labels using fabricated release receipts", () => {
    const { manifest, run } = fixture();
    manifest.releaseEvidence = {
      calibratedPolicy: "claimed",
      independentHumanAgreement: 1,
      representativeCorpusReceipt: "claimed",
      approvedThresholdsReceipt: "claimed",
      sampleSizeJustificationReceipt: "claimed",
    };
    manifest.documents.forEach((doc) => {
      doc.labelProvenance = "independent-human-adjudicated";
    });
    expect(run("release").releaseBlockers).toContain(
      "synthetic_corpus_not_representative",
    );
    expect(run("release").releasePassed).toBe(false);
  });
  it("passes engineering checks while explicitly blocking release validation", () => {
    const { run } = fixture();
    const report = run();
    expect(report.exitCode).toBe(0);
    expect(report.engineeringPassed).toBe(true);
    expect(report.releasePassed).toBe(false);
    expect(run("release").exitCode).toBe(1);
    expect(report.releaseBlockers).toContain(
      "independent_human_validation_missing",
    );
    expect(report.releaseBlockers).toContain("calibration_partition_missing");
    expect(report.segments[0].confidenceIntervals95.fieldRecall).toEqual([
      1, 1,
    ]);
    expect(report.segments[0].computeCostMicros).toBeNull();
    expect(JSON.stringify(report)).not.toContain("Fictional Name");
  });

  it("counts duplicate, wrong-type, wrong-span and invented fields as errors", () => {
    const { manifest, observations } = fixture();
    const expected = observations[0].fields[0];
    observations[0].fields = [
      expected,
      expected,
      { ...expected, type: "employer" },
      { ...expected, span: { ...expected.span, start: 1 } },
    ];
    const result = evaluateExtractionDocument(
      manifest.documents[0],
      observations[0],
    );
    expect(result.counts).toMatchObject({
      truePositive: 1,
      falsePositive: 3,
      falseNegative: 0,
    });
    observations[0].fields = [{ ...expected, value: "Invented" }];
    expect(
      evaluateExtractionDocument(manifest.documents[0], observations[0]).counts,
    ).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1 });
  });

  it("requires grounding in actual extraction as well as source truth", () => {
    const { manifest, observations } = fixture();
    observations[0].pages[0].text = "Different Name\nEngineer";
    expect(
      evaluateExtractionDocument(manifest.documents[0], observations[0]).counts,
    ).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1 });
  });

  it("penalizes omitted pages, abstention, extra pages and reordered lines", () => {
    const { manifest, observations, run } = fixture();
    observations[0].pages = [];
    observations[0].fields = [];
    observations[0].status = "insufficient";
    const missing = evaluateExtractionDocument(
      manifest.documents[0],
      observations[0],
    );
    expect(missing.counts.nativeErrors).toBe(missing.counts.nativeCharacters);
    expect(missing.counts.falseNegative).toBe(1);
    observations[1].pages[0].text = "Engineer\nFictional Name";
    observations[1].pages.push({ page: 2, method: "native", text: "Extra" });
    expect(run().exitCode).toBe(1);
    expect(run().segments[0].abstentionRate).toBe(0.5);
    expect(run().failures).toContain("invalid_page_contract");
  });

  it("separates native and OCR character denominators and uses Unicode code points", () => {
    const { manifest, observations } = fixture();
    manifest.documents[0].pages = [
      { page: 1, method: "native", text: "😀" },
      { page: 2, method: "ocr", text: "abcd" },
    ];
    manifest.documents[0].fields = [];
    observations[0].pages = [
      { page: 1, method: "native", text: "😀" },
      { page: 2, method: "ocr", text: "abc" },
    ];
    observations[0].fields = [];
    expect(
      evaluateExtractionDocument(manifest.documents[0], observations[0]).counts,
    ).toMatchObject({
      nativeCharacters: 1,
      nativeErrors: 0,
      ocrCharacters: 4,
      ocrErrors: 1,
      coveredPages: 1.75,
    });
  });

  it("rejects manifest changes, partition contamination and malformed labels", () => {
    const { manifest } = fixture();
    const lock = extractionManifestLock(manifest);
    manifest.producerVersion = "changed";
    expect(() => validateExtractionManifest(manifest, lock)).toThrow(
      "lock_mismatch",
    );
    manifest.documents[1].partition = "locked";
    manifest.documents[1].family = "one";
    expect(() =>
      validateExtractionManifest(manifest, extractionManifestLock(manifest)),
    ).toThrow("partition_leakage");
    manifest.documents[1].family = "two";
    manifest.documents[0].fields[0].span.end = 15;
    expect(() =>
      validateExtractionManifest(manifest, extractionManifestLock(manifest)),
    ).toThrow("invalid_truth_fields");
  });

  it("requires complete unique observations and exact version/source locks", () => {
    const { observations, run } = fixture();
    observations[0].configurationHash = "b".repeat(64);
    expect(() => run()).toThrow("version_lock_mismatch");
    observations[0].configurationHash = "a".repeat(64);
    observations[1].id = observations[0].id;
    expect(() => run()).toThrow("observation_set_mismatch");
  });

  it("does not manufacture intervals from variants of a single source family", () => {
    const { manifest, run } = fixture();
    manifest.documents[1].family = "one";
    expect(run().segments[0].confidenceIntervals95.fieldRecall).toBeNull();
    expect(run().exitCode).toBe(1);
  });

  it("rejects pseudo-independent families sharing a template or near-duplicate group", () => {
    const { manifest, run } = fixture();
    manifest.documents[1].template = manifest.documents[0].template;
    expect(() => run()).toThrow("source_family_alias");
  });

  it("reproducibly resamples whole families rather than individual documents", () => {
    const { observations, run } = fixture();
    observations[0].fields = [];
    const first = run(),
      second = run();
    expect(first).toEqual(second);
    expect(first.segments[0].confidenceIntervals95.fieldRecall).toEqual([0, 1]);
    expect(first.segments[0].bootstrap.unit).toBe("source_family");
  });

  it("blocks unsafe scores even when transcription is perfect", () => {
    const { observations, run } = fixture();
    observations[0].authoritativeScore = 99;
    expect(run().failures).toContain("unsafe_authoritative_score");
    observations[0].status = "ready";
    observations[0].confidenceCalibrated = true;
    expect(run().failures).toContain("score_without_calibrated_policy");
  });

  it("checks each required segment so aggregate quality cannot hide missing data", () => {
    const { manifest, run } = fixture();
    manifest.requiredSegments.push({
      id: "ocr-clean",
      scan: "clean",
      layout: "single-column",
    });
    const report = run();
    expect(report.exitCode).toBe(1);
    expect(report.failures).toContain(
      "segment:ocr-clean:ocrCharacterErrorRate",
    );
  });

  it("rejects nonfinite metrics and unknown contract fields", () => {
    const { manifest, observations } = fixture();
    expect(() =>
      evaluateExtractionDocument(manifest.documents[0], {
        ...observations[0],
        wallMs: Infinity,
      }),
    ).toThrow();
    expect(() =>
      evaluateExtractionDocument(manifest.documents[0], {
        ...observations[0],
        expectedFields: [],
      }),
    ).toThrow();
  });

  it("fails closed on pathological quadratic transcription comparisons", () => {
    const { manifest, observations } = fixture();
    manifest.documents[0].pages[0].text = "a".repeat(10_000);
    observations[0].pages[0].text = "b".repeat(10_000);
    expect(() =>
      evaluateExtractionDocument(manifest.documents[0], observations[0]),
    ).toThrow("metric_resource_limit");
    observations[0].pages[0].text = manifest.documents[0].pages[0].text;
    expect(
      evaluateExtractionDocument(manifest.documents[0], observations[0]).counts
        .nativeErrors,
    ).toBe(0);
  });
});
