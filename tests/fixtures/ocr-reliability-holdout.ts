import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createOcrPrintFixture } from "./ocr-print-pilot";

export const OCR_RELIABILITY_HOLDOUT_VERSION = "ocr-reliability-holdout/1.0.0";
export const OCR_RELIABILITY_CALIBRATION_ROUND2_VERSION =
  "ocr-reliability-calibration-round2/1.0.0";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function createOcrReliabilityHoldout(
  partition: "calibration" | "locked",
  freshCalibration = false,
) {
  assert.ok(!freshCalibration || partition === "calibration");
  const collectionVersion = freshCalibration
    ? OCR_RELIABILITY_CALIBRATION_ROUND2_VERSION
    : OCR_RELIABILITY_HOLDOUT_VERSION;
  const families = freshCalibration
    ? (await import("./ocr-reliability-calibration-round2"))
        .OCR_RELIABILITY_CALIBRATION_ROUND2_FAMILIES
    : partition === "calibration"
      ? (await import("./ocr-reliability-calibration"))
          .OCR_RELIABILITY_CALIBRATION_FAMILIES
      : (await import("./ocr-reliability-locked"))
          .OCR_RELIABILITY_LOCKED_FAMILIES;
  assert.ok(families.length >= 2, "Holdout needs multiple source families");
  assert.equal(
    new Set(families.map((family) => family.id)).size,
    families.length,
  );
  const fixtures = [];
  for (const [index, family] of families.entries()) {
    assert.equal(family.partition, partition);
    const source = family.lines.join("\n");
    for (const value of Object.values(family.fields))
      assert.ok(
        value.length &&
          source.indexOf(value) >= 0 &&
          source.indexOf(value) === source.lastIndexOf(value),
        "Authored field must have one unambiguous source occurrence",
      );
    for (const segment of ["clean", "challenging", "mixed"] as const) {
      const fixture = await createOcrPrintFixture(index, segment, family);
      assert.ok(fixture.bytes.byteLength <= 10 * 1024 * 1024);
      fixtures.push({
        ...fixture,
        manifest: {
          ...fixture.manifest,
          collectionVersion,
          familyDefinitionSha256: hash(family),
          expectedTextSha256: hash(fixture.expectedPageTexts),
          lineOrderSha256: hash(fixture.expectedLineOrder),
        },
      });
    }
  }
  return fixtures;
}
