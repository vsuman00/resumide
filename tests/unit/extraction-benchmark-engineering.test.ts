import { describe, expect, it } from "vitest";
import {
  createEngineeringExtractionCorpus,
  createEngineeringExtractionAdapter,
  ENGINEERING_OCR_IMAGE,
  runEngineeringExtractionHarness,
} from "../../scripts/extraction-benchmark-engineering";
import {
  evaluateExtractionDocument,
  observeExtractionBenchmarkSource,
} from "../../app/lib/server/extraction-benchmark";

describe("real PDF engineering benchmark adapter", () => {
  it("keeps existing locked families separate and requires their pre-execution receipt", async () => {
    const corpus = await createEngineeringExtractionCorpus(
      ENGINEERING_OCR_IMAGE,
      "locked",
    );
    expect(corpus.manifest.documents).toHaveLength(6);
    expect(
      corpus.manifest.documents.every(
        (doc) => doc.partition === "locked" && doc.segment !== "native-single",
      ),
    ).toBe(true);
    expect(
      new Set(corpus.manifest.documents.map((doc) => doc.family)).size,
    ).toBe(2);
    await expect(
      runEngineeringExtractionHarness({
        mode: "engineering",
        partition: "locked",
      }),
    ).rejects.toThrow("previously_frozen_locked_receipt_required");
  }, 30_000);
  it("refuses release before recognition and binds explicit immutable CI images", async () => {
    const imageId = `sha256:${"f".repeat(64)}`;
    const corpus = await createEngineeringExtractionCorpus(imageId);
    expect(corpus.receipt.imageId).toBe(imageId);
    expect(corpus.receipt.evaluationConfig).toEqual({
      psm: 3,
      maxDpi: 150,
      model: "text-fusion",
    });
    await expect(
      createEngineeringExtractionCorpus("mutable-tag"),
    ).rejects.toThrow("immutable_image_required");
    const report = await runEngineeringExtractionHarness({
      mode: "release",
      imageId,
    });
    expect(report.exitCode).toBe(1);
    expect("evaluation" in report && report.evaluation).toBe(
      "not_run_release_prerequisites_missing",
    );
    expect("releasePassed" in report && report.releasePassed).toBe(false);
  }, 30_000);
  it("freezes every development source and label before running recognition", async () => {
    const first = await createEngineeringExtractionCorpus();
    expect(first.manifest.documents).toHaveLength(12);
    expect(
      first.manifest.documents.every((doc) => doc.partition === "development"),
    ).toBe(true);
    expect(
      first.receipt.sourceFamilies.filter(
        (family) => family.partition === "development",
      ),
    ).toHaveLength(3);
    expect(
      first.receipt.sourceFamilies.some(
        (family) => family.partition === "locked",
      ),
    ).toBe(true);
    expect(
      first.manifest.documents.every((doc) =>
        doc.fields.some((item) => item.type === "certification"),
      ),
    ).toBe(true);
    expect(first.manifest.releaseEvidence.calibratedPolicy).toBeNull();
  }, 30_000);

  it("extracts all fields through real PDF parsing and reconciliation without truth input", async () => {
    const corpus = await createEngineeringExtractionCorpus();
    const adapter = createEngineeringExtractionAdapter({
      manifest: {
        producerVersion: corpus.manifest.producerVersion,
        providerVersion: corpus.manifest.providerVersion,
        configurationHash: corpus.manifest.configurationHash,
      },
      imageId: ENGINEERING_OCR_IMAGE,
      makeOcrAdapter: () => {
        throw new Error("Native pages must never call OCR");
      },
    });
    for (const truth of corpus.manifest.documents.filter(
      (doc) => doc.segment === "native-single",
    )) {
      const actual = await observeExtractionBenchmarkSource(
        {
          id: truth.id,
          sourceHash: truth.sourceHash,
          bytes: corpus.sources.get(truth.id)!,
        },
        adapter,
      );
      const evaluated = evaluateExtractionDocument(truth, actual);
      expect(evaluated.counts.truePositive).toBe(8);
      expect(evaluated.counts.falsePositive).toBe(0);
      expect(evaluated.counts.falseNegative).toBe(0);
      expect(actual.authoritativeScore).toBeNull();
      expect(actual.status).toBe("review_required");
      expect(actual.confidenceCalibrated).toBe(false);
    }
  }, 30_000);
});
