import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createOcrSupportedDevelopmentFixtures,
  OCR_SUPPORTED_DEVELOPMENT_FAMILIES,
  OCR_SUPPORTED_DEVELOPMENT_SEGMENTS,
  OCR_SUPPORTED_DEVELOPMENT_VERSION,
} from "../../fixtures/ocr-supported-development";
import { PRINT_FAMILIES } from "../../fixtures/ocr-print-pilot";
import {
  EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES,
  EXTRACTION_REPAIR_HEADER_DEVELOPMENT,
} from "../../fixtures/extraction-repair-development";
import { EXTRACTION_REPAIR_HELDOUT_FAMILIES } from "../../fixtures/extraction-repair-heldout";
import { EXTRACTION_REPAIR_CONFIRMATION_FAMILIES } from "../../fixtures/extraction-repair-confirmation";
import { EXTRACTION_REPAIR_VALIDATION_FAMILIES } from "../../fixtures/extraction-repair-validation";
import { EXTRACTION_REPAIR_VERIFICATION_FAMILIES } from "../../fixtures/extraction-repair-verification";
import { EXTRACTION_REPAIR_ASSESSMENT_FAMILIES } from "../../fixtures/extraction-repair-assessment";
import { EXTRACTION_REPAIR_ACCEPTANCE_FAMILIES } from "../../fixtures/extraction-repair-acceptance";
import { EXTRACTION_REPAIR_RUNTIME_CHECK_FAMILIES } from "../../fixtures/extraction-repair-runtime-check";
import { OCR_CRITICAL_FIELDS } from "../../fixtures/ocr-field-evaluation";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../../../app/lib/server/ocr/pdf-detection";

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
let fixtures: Awaited<ReturnType<typeof createOcrSupportedDevelopmentFixtures>>;
beforeAll(async () => {
  fixtures = await createOcrSupportedDevelopmentFixtures();
}, 15_000);

describe("preregistered OCR reliability development sources", () => {
  it("keeps two fresh source families in development and binds every raw label", () => {
    const prior = [
      ...PRINT_FAMILIES,
      ...EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES,
      ...EXTRACTION_REPAIR_HEADER_DEVELOPMENT,
      ...EXTRACTION_REPAIR_HELDOUT_FAMILIES,
      ...EXTRACTION_REPAIR_CONFIRMATION_FAMILIES,
      ...EXTRACTION_REPAIR_VALIDATION_FAMILIES,
      ...EXTRACTION_REPAIR_VERIFICATION_FAMILIES,
      ...EXTRACTION_REPAIR_ASSESSMENT_FAMILIES,
      ...EXTRACTION_REPAIR_ACCEPTANCE_FAMILIES,
      ...EXTRACTION_REPAIR_RUNTIME_CHECK_FAMILIES,
    ];
    const priorIds = new Set(prior.map((family) => family.id));
    const priorText = new Set(prior.map((family) => family.lines.join("\n")));
    expect(OCR_SUPPORTED_DEVELOPMENT_FAMILIES).toHaveLength(2);
    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(6);
    for (const family of OCR_SUPPORTED_DEVELOPMENT_FAMILIES) {
      expect(priorIds.has(family.id)).toBe(false);
      expect(priorText.has(family.lines.join("\n"))).toBe(false);
      const members = fixtures.filter(
        (fixture) => fixture.manifest.sourceFamily === family.id,
      );
      expect(members.map((fixture) => fixture.segment)).toEqual(
        OCR_SUPPORTED_DEVELOPMENT_SEGMENTS,
      );
      for (const fixture of members) {
        expect(fixture.manifest.partition).toBe("development");
        expect(fixture.manifest.nearDuplicateGroup).toBe(family.id);
        expect(fixture.manifest.collectionVersion).toBe(
          OCR_SUPPORTED_DEVELOPMENT_VERSION,
        );
        expect(fixture.manifest.familyDefinitionSha256).toBe(
          hash(JSON.stringify(family)),
        );
        expect(fixture.manifest.sourceSha256).toBe(hash(fixture.bytes));
        expect(fixture.manifest.expectedTextSha256).toBe(
          hash(JSON.stringify(fixture.expectedPageTexts)),
        );
        expect(fixture.manifest.labelsSha256).toBe(
          hash(JSON.stringify(fixture.labels)),
        );
        expect(fixture.manifest.lineOrderSha256).toBe(
          hash(JSON.stringify(fixture.expectedLineOrder)),
        );
        expect(fixture.manifest.registrationStage).toBe("before_recognition");
        expect(fixture.manifest.recognitionExecuted).toBe(false);
        expect(fixture.manifest.qualityStatus).toBe("not_evaluated");
        expect(fixture.providerPageInjection).toBeNull();
        expect(fixture.expectedOutcome).toBe("review_required");
        expect(fixture.labels.map((label) => label.field).sort()).toEqual(
          [...OCR_CRITICAL_FIELDS].sort(),
        );
        for (const label of fixture.labels) {
          expect(label.value).toBe(
            family.fields[label.field as keyof typeof family.fields],
          );
          expect(label.sourceReference).toBe(
            `${family.id}/authored-page-${label.pageNumber}`,
          );
          expect(label.offsetUnit).toBe("unicode_code_point");
          expect(
            Array.from(fixture.expectedPageTexts[label.pageNumber - 1])
              .slice(label.start, label.end)
              .join(""),
          ).toBe(label.value);
        }
        fixture.expectedLineOrder.forEach((lines, page) => {
          expect(lines.map((line) => line.text).join("\n")).toBe(
            fixture.expectedPageTexts[page],
          );
          for (const line of lines)
            expect(
              Array.from(fixture.expectedPageTexts[page])
                .slice(line.start, line.end)
                .join(""),
            ).toBe(line.text);
        });
      }
    }
  });

  it("has image-only scanned pages and preserves only the native mixed middle page", async () => {
    for (const fixture of fixtures) {
      const native = await extractPdfTextLayers(fixture.bytes, {
        maxPages: 3,
        maxCharacters: 10_000,
      });
      const mixed = fixture.segment === "mixed";
      expect(native.pageTexts).toEqual(
        mixed ? ["", fixture.expectedPageTexts[1], ""] : [""],
      );
      const profile = detectPdfTextProfile(native);
      expect(profile.documentType).toBe(mixed ? "mixed" : "scanned");
      expect(profile.pagesNeedingOcr).toEqual(mixed ? [1, 3] : [1]);
      expect(native.totalPages).toBe(mixed ? 3 : 1);
    }
  }, 15_000);

  it("reproduces bounded nonblank rasters and records source hashes before recognition", async () => {
    const repeated = await createOcrSupportedDevelopmentFixtures();
    const receipts = [];
    for (const [index, fixture] of fixtures.entries()) {
      expect(repeated[index].bytes).toEqual(fixture.bytes);
      expect(repeated[index].manifest).toEqual(fixture.manifest);
      expect(fixture.bytes.byteLength).toBeLessThanOrEqual(10 * 1024 * 1024);
      expect(fixture.sourceImageDpi).toBe(
        fixture.segment === "challenging" ? 150 : 300,
      );
      for (const page of fixture.rasterDiagnostics) {
        expect(page.widthPixels * page.heightPixels).toBeLessThanOrEqual(
          10_000_000,
        );
        expect(page.darkPixelCount).toBeGreaterThan(100);
        expect(page.inkBounds.left).toBeGreaterThanOrEqual(10);
        expect(page.inkBounds.top).toBeGreaterThanOrEqual(10);
        expect(page.inkBounds.right).toBeLessThan(page.widthPixels - 10);
        expect(page.inkBounds.bottom).toBeLessThan(page.heightPixels - 10);
      }
      receipts.push(fixture.manifest);
    }
    // Only synthetic source metadata; never OCR output or raw labels/prompts.
    process.stdout.write(
      JSON.stringify({
        status: "ocr_development_fixture_registration_only",
        nodeVersion: process.versions.node,
        recognitionCalls: 0,
        receipts,
      }) + "\n",
    );
  }, 15_000);
});
