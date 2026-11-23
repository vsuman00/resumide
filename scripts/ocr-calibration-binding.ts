import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { createOcrReliabilityHoldout } from "../tests/fixtures/ocr-reliability-holdout";
import type { LocalOcrAdapter } from "../app/lib/server/ocr/selective";

const evidencePath = new URL(
  "../tasks/agent-handoffs/2026-11-09-reliability-implementation/",
  import.meta.url,
);
const hash = (contents: string | Uint8Array) =>
  createHash("sha256").update(contents).digest("hex");
const jsonHash = (value: unknown) => hash(JSON.stringify(value));

export function bindOcrCalibration(
  imageId: string,
  config: { psm: 3; maxDpi: 150 },
  fieldProfile: string,
  parserSources: { path: string; sha256: string }[],
  freshCalibration = false,
) {
  const candidateFile = freshCalibration
    ? "cr-a05-employment-field-candidate.json"
    : "cr-a05-mixed-field-candidate.json";
  const registrationFile = freshCalibration
    ? "cr-a05-calibration-round2-registration.json"
    : "cr-a05-holdout-registration.json";
  const candidate = JSON.parse(
    readFileSync(new URL(candidateFile, evidencePath), "utf8"),
  );
  const registrationBytes = readFileSync(
    new URL(registrationFile, evidencePath),
  );
  const registrationSha256 = hash(registrationBytes);
  assert.equal(
    registrationSha256,
    freshCalibration
      ? candidate.calibrationRegistrationSha256
      : candidate.lockedRegistrationSha256,
  );
  if (freshCalibration)
    assert.equal(
      hash(
        readFileSync(new URL("cr-a05-calibration-first.json", evidencePath)),
      ),
      candidate.previousCalibrationFailureSha256,
      "Prior calibration failure differs from the frozen candidate record",
    );
  const registration = JSON.parse(registrationBytes.toString("utf8"));
  const calibration = registration.partitions.calibration;
  const receipt = calibration.evaluationReceipt;
  assert.equal(
    imageId,
    receipt.imageId,
    "Calibration image differs from registration",
  );
  assert.equal(imageId, candidate.receipt.imageId);
  assert.deepEqual(config, receipt.evaluationConfig);
  assert.deepEqual(config, candidate.receipt.config);
  assert.equal(fieldProfile, candidate.receipt.fieldProfile);
  assert.deepEqual(parserSources, candidate.receipt.parserSources);
  assert.equal(receipt.partition, "calibration");
  assert.equal(jsonHash(receipt), calibration.evaluationReceiptSha256);
  const boundPaths = [
    "tests/fixtures/ocr-print-pilot.ts",
    "tests/fixtures/ocr-reliability-holdout.ts",
    freshCalibration
      ? "tests/fixtures/ocr-reliability-calibration-round2.ts"
      : "tests/fixtures/ocr-reliability-calibration.ts",
    "tests/fixtures/ocr-field-evaluation.ts",
    "app/lib/server/ocr/selective.ts",
    "app/lib/server/ocr/local-container.ts",
    "app/lib/server/ocr/pdf-detection.ts",
  ];
  for (const path of boundPaths) {
    const expected =
      registration.sources[path] ?? candidate.testedSources[path];
    assert.equal(
      hash(readFileSync(path)),
      expected,
      `Frozen source differs: ${path}`,
    );
  }
  return {
    hashes: {
      registration: registrationSha256,
      candidate: candidate.receipt.receiptSha256 as string,
      calibration: calibration.evaluationReceiptSha256 as string,
    },
    verify(
      fixtures: Awaited<ReturnType<typeof createOcrReliabilityHoldout>>,
      versions: LocalOcrAdapter["versions"],
    ) {
      assert.deepEqual(versions, receipt.versions);
      const sourceManifest = fixtures.map((fixture) => ({
        ...fixture.manifest,
        segment: fixture.segment,
        transform: fixture.transform,
        labelsSha256: jsonHash(fixture.labels),
      }));
      assert.equal(
        jsonHash(sourceManifest),
        receipt.manifestSha256,
        "Calibration fixtures differ from registration",
      );
    },
  };
}
