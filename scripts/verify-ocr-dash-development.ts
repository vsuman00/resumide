/** Paired OCR punctuation diagnostic using original synthetic development sources. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  extractEvidenceFields,
  MIXED_OCR_FIELD_PROFILE_V3,
  MIXED_OCR_FIELD_PROFILE_V4,
} from "../app/lib/server/evidence-fields";
import {
  createLocalContainerOcrAdapter,
  type LocalOcrEvaluationConfig,
} from "../app/lib/server/ocr/local-container";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../app/lib/server/ocr/pdf-detection";
import { runSelectiveLocalOcr } from "../app/lib/server/ocr/selective";
import { createOcrWorkplaceDevelopmentFixtures } from "../tests/fixtures/ocr-employment-development";
import { evaluateOcrDocument } from "../tests/fixtures/ocr-evaluation";
import { evaluateOcrFields } from "../tests/fixtures/ocr-field-evaluation";
import {
  createOcrPrintFixture,
  type Family,
} from "../tests/fixtures/ocr-print-pilot";

const family: Family = {
  id: "reliability-dev-cedar-punctuation",
  partition: "development",
  top: 67,
  left: 61,
  gap: 24,
  lines: [
    "Demo Candidate Willow",
    "Email: willow.cedar@example.test",
    "Phone: 0000000000",
    "Professional Experience",
    "Release Engineer | Fictional Cedar Lab | Remote | Mar 2019 - Sep 2021",
    "Checked bins A-Z and index ranges 2–8.",
    "Checked bins A–Z and index ranges 2-8.",
    "Matched the red - green marker on the sample image.",
    "Matched the blue – yellow marker on the sample image.",
    "Checked pre-release flags and archived build-ready files.",
    "Education: BEng Software Systems",
    "Certification: Demo Release Engineering Certificate",
  ],
  fields: {
    name: "Demo Candidate Willow",
    email: "willow.cedar@example.test",
    phone: "0000000000",
    employer: "Fictional Cedar Lab",
    role: "Release Engineer",
    dates: "Mar 2019 - Sep 2021",
    education: "BEng Software Systems",
    certification: "Demo Release Engineering Certificate",
  },
};

const configurations = {
  baseline: { psm: 3, maxDpi: 150 },
  adaptive_otsu: { psm: 3, maxDpi: 150, thresholdingMethod: 1 },
  sauvola: { psm: 3, maxDpi: 150, thresholdingMethod: 2 },
} satisfies Record<string, LocalOcrEvaluationConfig>;
const hash = (input: Uint8Array | string) =>
  createHash("sha256").update(input).digest("hex");
const [imageId, mode, registration] = process.argv.slice(2);
assert.match(imageId ?? "", /^sha256:[a-f0-9]{64}$/u);
assert(
  (mode === "--manifest-only" && process.argv.length === 4) ||
    (mode === "--run-registered" && registration && process.argv.length === 5),
  "Select --manifest-only or --run-registered <registration>",
);

const original = (await createOcrWorkplaceDevelopmentFixtures()).find(
  (fixture) => fixture.id === "print-reliability-dev-copper-workplace-clean-v1",
);
assert(
  original?.manifest.sourceSha256 ===
    "2d9f6735c05e66bf569fcb916668c817d66f12eb633c7ea4f27c90f556b161f1",
);
const fixtures = [original];
for (const segment of ["clean", "challenging", "mixed"] as const)
  fixtures.push(await createOcrPrintFixture(0, segment, family));
assert(
  fixtures.every((fixture) => fixture.manifest.partition === "development"),
);
const variants = Object.entries(configurations);
const manifest = {
  schemaVersion: "synthetic-ocr-dash-development/1.0.0",
  imageId,
  runOrder: variants.map(([name]) => name),
  configurations,
  fieldProfiles: [MIXED_OCR_FIELD_PROFILE_V3, MIXED_OCR_FIELD_PROFILE_V4],
  maxAttempts: variants.length * fixtures.length,
  maxWallTimePerAttemptMs: 10_000,
  provenance: Object.fromEntries(
    [
      "scripts/verify-ocr-dash-development.ts",
      "scripts/ocr-runtime/runner.py",
      "app/lib/server/ocr/local-container.ts",
      "app/lib/server/ocr/selective.ts",
      "app/lib/server/ocr/pdf-detection.ts",
      "app/lib/server/evidence-fields.ts",
      "app/lib/server/parsing/contact.ts",
      "app/lib/server/parsing/dates.ts",
      "app/lib/server/parsing/sections.ts",
      "tests/fixtures/ocr-evaluation.ts",
      "tests/fixtures/ocr-field-evaluation.ts",
      "tests/fixtures/ocr-print-pilot.ts",
    ].map((path) => [path, hash(readFileSync(path))]),
  ),
  sources: fixtures.map(
    ({ manifest, labels, expectedPageTexts, expectedLineOrder }) => ({
      ...manifest,
      labelsSha256: hash(JSON.stringify(labels)),
      expectedTextSha256: hash(JSON.stringify(expectedPageTexts)),
      lineOrderSha256: hash(JSON.stringify(expectedLineOrder)),
    }),
  ),
};
if (mode === "--manifest-only") {
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
} else {
  assert(registration);
  const frozen = readFileSync(registration);
  assert.equal(
    JSON.stringify(manifest),
    JSON.stringify(JSON.parse(frozen.toString())),
    "OCR registration drifted",
  );
  await compare(hash(frozen));
}

function ownedContainers() {
  return execFileSync(
    "docker",
    ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
    { encoding: "utf8", timeout: 3_000, maxBuffer: 4096 },
  ).trim();
}

function punctuation(expected: string[], actual: string[]) {
  const rows = (text: string) =>
    text
      .split("\n")
      .map((line) => line.replace(/\s+/gu, " ").trim())
      .filter(Boolean);
  const substitutions: Array<{
    page: number;
    line: number;
    expected: string;
    observed: string;
  }> = [];
  const hyphen = { expected: 0, exact: 0, unresolved: 0 };
  const enDash = { expected: 0, exact: 0, unresolved: 0 };
  for (const [page, reference] of expected.entries()) {
    const observed = rows(actual[page] ?? "");
    for (const [index, line] of rows(reference).entries()) {
      const candidate = observed[index] ?? "";
      // Preserve positions. Ambiguous alignment is an unresolved control.
      const aligned =
        line.length === candidate.length &&
        line.replace(/[-–]/gu, "#") === candidate.replace(/[-–]/gu, "#");
      for (const { 0: glyph, index: offset } of line.matchAll(/[-–]/gu)) {
        const counter = glyph === "-" ? hyphen : enDash;
        counter.expected++;
        if (!aligned) counter.unresolved++;
        else if (candidate[offset] === glyph) counter.exact++;
        else
          substitutions.push({
            page: page + 1,
            line: index + 1,
            expected: glyph === "-" ? "U+002D" : "U+2013",
            observed: candidate[offset] === "-" ? "U+002D" : "U+2013",
          });
      }
    }
  }
  return { hyphen, enDash, substitutions };
}

async function compare(registeredManifestSha256: string) {
  const results = [];
  assert.equal(
    ownedContainers(),
    "",
    "Wait for the other local OCR run to finish",
  );
  for (const [setting, evaluationConfig] of variants) {
    for (const fixture of fixtures) {
      const { pageTexts } = await extractPdfTextLayers(fixture.bytes, {
        maxPages: 10,
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
        evaluationConfig,
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
        },
        adapter,
        new AbortController().signal,
      );
      assert.equal(ownedContainers(), "", "OCR cleanup failed");
      assert(
        outcome.status === "review_required",
        `Unexpected outcome: ${outcome.status}`,
      );
      assert.equal(outcome.scoringEligible, false);
      assert.deepEqual(
        outcome.pages.map((page) => page.pageNumber),
        selected,
      );
      const texts = [...pageTexts];
      for (const page of outcome.pages) texts[page.pageNumber - 1] = page.text;
      if (fixture.segment === "mixed")
        assert(texts[1] === fixture.expectedPageTexts[1]);
      const spans = texts.flatMap((text, pageIndex) => {
        const page = pageIndex + 1;
        const pageId = `page-${page}`;
        const method = selected.includes(page) ? "local_ocr" : "native_text";
        return text
          .split("\n")
          .filter((line) => line.trim())
          .map(
            (line, index) =>
              ({
                id: `${pageId}-line-${index + 1}`,
                page,
                pageId,
                text: line,
                method,
              }) as const,
          );
      });
      const previous = extractEvidenceFields(spans, MIXED_OCR_FIELD_PROFILE_V3);
      const proposals = extractEvidenceFields(
        spans,
        MIXED_OCR_FIELD_PROFILE_V4,
      );
      assert(
        proposals.every(
          ({ state, confidence }) =>
            state === "review_required" && confidence.kind === "uncalibrated",
        ),
      );
      results.push({
        setting,
        fixture: fixture.id,
        segment: fixture.segment,
        versions: adapter.versions,
        selected,
        punctuation: punctuation(fixture.expectedPageTexts, texts),
        transcription: evaluateOcrDocument(fixture.expectedPageTexts, texts),
        previousFields: evaluateOcrFields(fixture.labels, previous, spans),
        fields: evaluateOcrFields(fixture.labels, proposals, spans),
      });
    }
  }
  process.stdout.write(
    JSON.stringify(
      {
        registeredManifestSha256,
        results,
        ownedCleanup: true,
        scoringEligible: false,
      },
      null,
      2,
    ) + "\n",
  );
}
