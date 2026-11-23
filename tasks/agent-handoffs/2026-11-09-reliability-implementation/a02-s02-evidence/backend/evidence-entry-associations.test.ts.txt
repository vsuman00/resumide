import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
  type DocumentEvidence,
} from "../../app/lib/server/document-evidence";
import {
  deriveEvidenceReviewTargets,
  type OwnedEvidenceBinding,
} from "../../app/lib/server/evidence-targets";
import { importCanonicalEvidence } from "../../app/lib/server/canonical-content";
import {
  OcrEvidenceSchema,
  runSelectiveLocalOcr,
} from "../../app/lib/server/ocr/selective";
import {
  deriveEvidenceEntryAssociations,
  ENTRY_ASSOCIATION_MODEL_VERSION,
} from "../../app/lib/server/evidence-entry-associations";
import legacy from "../fixtures/evidence-fields-v1-envelope.json";

const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-11-13T00:00:00.000Z",
  retentionPolicyId: "synthetic/1.0.0",
};
const jobs = [
  "Employer: Synthetic North Labs",
  "Role: Engineer",
  "Dates: 2020 - 2022",
  "Employer: Synthetic South Labs",
  "Role: Analyst",
  "Dates: 2021 - 2023",
].join("\n");
const fixture = (
  pages = [`Experience\n${jobs}`],
  overrides: Partial<typeof context> = {},
) =>
  reconcileDocumentEvidence(
    { ...context, ...overrides },
    buildNativeEvidence(pages),
  );
const owned = (evidence: DocumentEvidence): OwnedEvidenceBinding => ({
  ownerId: evidence.ownerId,
  analysisId: evidence.analysisId,
  sourceId: evidence.sourceId,
  inputSha256: evidence.inputSha256,
  attemptId: evidence.id,
});
const derive = (evidence: DocumentEvidence) =>
  deriveEvidenceEntryAssociations(evidence, owned(evidence));
function freeze(value: unknown) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
function coverage(evidence: DocumentEvidence) {
  const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
  const review = derive(evidence);
  const preserved = model.groups
    .filter((group) => review.preservedGroupIds.includes(group.id))
    .flatMap((group) => group.observationIds);
  const received = [
    ...preserved,
    ...review.groups.flatMap((group) => group.observationIds),
    ...review.unresolved.map((value) => value.observationId),
  ];
  expect(received.sort()).toEqual(
    model.observations.map((value) => value.id).sort(),
  );
  expect(new Set(received).size).toBe(received.length);
  return review;
}
async function withSyntheticOcr(pages: string[], ocrText: string) {
  const selectedPages = pages.flatMap((text, index) =>
    text.replace(/\s/gu, "").length < 8
      ? [{ pageNumber: index + 1, pageId: `page-${index + 1}` }]
      : [],
  );
  const result = await runSelectiveLocalOcr(
    {
      schemaVersion: "selective-ocr-request-v1",
      attemptId: context.id,
      ownerId: context.ownerId,
      analysisId: context.analysisId,
      sourceId: context.sourceId,
      sourceSha256: context.inputSha256,
      createdAt: context.createdAt,
      retentionPolicyId: context.retentionPolicyId,
      nativePageTexts: pages,
      selectedPages,
      remainingDeadlineMs: 1000,
      limits: { maxCharacters: 100_000, maxPages: 10 },
      allocation: {
        id: "association-synthetic",
        maxWallTimeMs: 1000,
        maxPages: 10,
        externalApiFeeMicros: 0,
      },
      policy: {
        executionMode: "self_hosted",
        purpose: "synthetic_local_test",
        allowThirdPartyProcessing: false,
      },
    },
    {
      versions: {
        engine: "tesseract/synthetic",
        renderer: "synthetic/1",
        languageData: "synthetic/1",
      },
      recognize: async () => ({
        durationMs: 1,
        pages: selectedPages.map((page) => ({
          ...page,
          imageSha256: "b".repeat(64),
          widthPixels: 100,
          heightPixels: 100,
          rotation: 0,
          text: ocrText,
          words: [...ocrText.matchAll(/\S+/gu)].map((word) => ({
            text: word[0],
            start: Array.from(ocrText.slice(0, word.index)).length,
            end: Array.from(ocrText.slice(0, word.index! + word[0].length))
              .length,
            box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
            confidence: 80,
          })),
        })),
      }),
    },
  );
  return reconcileDocumentEvidence(
    context,
    buildNativeEvidence(pages),
    OcrEvidenceSchema.parse(result),
  );
}

describe("separate nonpersistable entry association review", () => {
  it("adds two unverified candidates while preserving the characterized legacy gap", () => {
    const evidence = fixture();
    const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
    const canonical = importCanonicalEvidence(evidence, {
      ownerId: context.ownerId,
      resumeId: "10000000-0000-4000-8000-000000000005",
      organizationId: "10000000-0000-4000-8000-000000000006",
    });
    expect(evidence.assertions).toHaveLength(6);
    expect(model.groups).toEqual([]);
    expect(
      canonical.sections.flatMap((section) => section.entries),
    ).toHaveLength(6);
    expect(
      evidence.fields
        .filter((value) => ["employer", "role", "dates"].includes(value.field))
        .every((value) => value.state === "conflict"),
    ).toBe(true);
    const review = coverage(evidence);
    expect(review).toMatchObject({
      modelVersion: ENTRY_ASSOCIATION_MODEL_VERSION,
      authority: "derived_review_only",
      scoringEligible: false,
      persistable: false,
      qualificationAssessment: "not_assessed",
      state: "review_required",
      unavailableReason: null,
      binding: { ...model.binding, targetModelVersion: model.modelVersion },
      preservedGroupIds: [],
      unresolved: [],
    });
    expect(review.groups).toHaveLength(2);
    expect(
      review.groups.every(
        (group) =>
          group.verified === false &&
          group.kind === "employment" &&
          group.association === "explicit_labelled_multiline_candidate",
      ),
    ).toBe(true);
    expect(
      review.groups.map((group) => group.members.map((value) => value.field)),
    ).toEqual([
      ["employer", "role", "dates"],
      ["employer", "role", "dates"],
    ]);
    expect(canonical.producerVersion).toBe("canonical-engine/1.0.1");
    expect(evidence.scoringEligible).toBe(false);
  });

  it.each([
    "Employment",
    "Experience",
    "WORK EXPERIENCE",
    "professional experience",
    "Employment History",
  ])(
    "supports ASCII structural casing in %s without modifying values",
    (heading) => {
      const evidence = fixture([
        `${heading}\n\tEMPLOYER: Élan 🚀 Labs\nrole: Développeur\nDaTeS: 2020 - 2022`,
      ]);
      const review = coverage(evidence);
      expect(review.groups).toHaveLength(1);
      const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
      for (const value of review.groups[0].members) {
        const source = model.observations.find(
          (row) => row.id === value.observationId,
        )!;
        expect(value.citations).toEqual(source.citations);
        expect(value.targetId).toBe(source.targetId);
        for (const reference of value.citations) {
          const span = evidence.spans.find(
            (row) => row.id === reference.spanId,
          )!;
          expect(
            Array.from(span.text)
              .slice(reference.start, reference.end)
              .join(""),
          ).toBe(source.value);
        }
      }
    },
  );

  it.each(["", "Work History", "Experience Overview", "WorK Experience"])(
    "keeps observations unresolved outside exact supported heading %j",
    (heading) => {
      const evidence = fixture([`${heading}\n${jobs}`]);
      const review = coverage(evidence);
      expect(review.groups).toEqual([]);
      expect(
        review.unresolved
          .filter((value) =>
            ["employer", "role", "dates"].includes(value.field),
          )
          .every(
            (value) => value.reason === "outside_supported_employment_section",
          ),
      ).toBe(true);
    },
  );

  it.each([
    "Education",
    "Certifications",
    "Summary",
    "Unsupported section",
    "Built neutral tools",
    "Education: BSc Synthetic",
  ])("clears employment eligibility at boundary case %#", (boundary) => {
    const evidence = fixture([
      `Experience\nEmployer: First Labs\nRole: Engineer\n${boundary}\nEmployer: Second Labs\nRole: Analyst`,
    ]);
    const review = coverage(evidence);
    expect(review.groups).toHaveLength(1);
    expect(
      review.unresolved.some(
        (value) =>
          value.field === "employer" &&
          value.reason === "outside_supported_employment_section",
      ),
    ).toBe(true);
  });

  it("ends blocks at blanks without inheriting an incomplete employer", () => {
    const evidence = fixture([
      "Experience\nEmployer: First Labs\n\nRole: Engineer\nEmployer: Second Labs\nRole: Analyst",
    ]);
    const review = coverage(evidence);
    expect(review.groups).toHaveLength(1);
    expect(review.unresolved.map((value) => value.reason)).toEqual([
      "incomplete_labelled_block",
      "missing_employer_anchor",
    ]);
  });

  it("does not link across pages even when ordinals are adjacent", () => {
    const evidence = fixture([
      "Experience\nEmployer: First Labs",
      "Role: Engineer\nDates: 2020 - 2022",
    ]);
    const review = coverage(evidence);
    expect(review.groups).toEqual([]);
    expect(
      review.unresolved.some(
        (value) => value.reason === "incomplete_labelled_block",
      ),
    ).toBe(true);
    expect(
      review.unresolved.some(
        (value) => value.reason === "outside_supported_employment_section",
      ),
    ).toBe(true);
  });

  it.each([
    "Employer: First Labs\nRole: Engineer\nRole: Analyst",
    "Employer: First Labs\nRole: Engineer\nDates: 2020 - 2021\nDates: 2022 - 2023",
    "Employer: First Labs\nRole: Engineer | Role: Analyst",
    "Employer: First Labs\nRole: Engineer | Role: Engineer",
  ])("keeps repeated-label case %# unresolved", (source) => {
    const evidence = fixture([`Experience\n${source}`]);
    const review = coverage(evidence);
    expect(review.groups).toEqual([]);
    expect(
      review.unresolved.some(
        (value) => value.reason === "ambiguous_labelled_block",
      ),
    ).toBe(true);
  });

  it("requires Employer and Role, allows optional Dates, and starts afresh at Employer", () => {
    const evidence = fixture([
      "Experience\nEmployer: Incomplete Labs\nEmployer: Complete Labs\nRole: Engineer",
    ]);
    const review = coverage(evidence);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0].members.map((value) => value.field)).toEqual([
      "employer",
      "role",
    ]);
    expect(review.unresolved.map((value) => value.reason)).toEqual([
      "incomplete_labelled_block",
    ]);
  });

  it("preserves same-span group IDs and disjoint membership beside a multiline candidate", () => {
    const evidence = fixture([
      "Experience\nEmployer: First Labs | Role: Engineer | Dates: 2020 - 2022\nEmployer: Second Labs | Role: Analyst\nEmployer: Third Labs\nRole: Developer\nEducation: BSc Computing | Dates: 2016 - 2020\nCertification: Synthetic Certificate | Dates: 2024",
    ]);
    const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
    const review = coverage(evidence);
    expect(review.preservedGroupIds).toEqual(
      model.groups.map((value) => value.id),
    );
    expect(review.preservedGroupIds).toHaveLength(4);
    expect(review.groups).toHaveLength(1);
    expect(review.unresolved).toEqual([]);
  });

  it("retains contact, education, certification and duplicate headers as observations", () => {
    const evidence = fixture([
      "Name: Demo Person\nEmail: demo@example.invalid\nEducation: BSc Synthetic\nCertification: Synthetic Certificate",
      "Name: Demo Person\nEmail: demo@example.invalid",
    ]);
    const review = coverage(evidence);
    expect(review.groups).toEqual([]);
    expect(review.unresolved.length).toBe(evidence.assertions.length);
    expect(
      review.unresolved.every((value) => value.reason === "out_of_scope_field"),
    ).toBe(true);
    expect(
      review.unresolved.filter((value) => value.field === "email"),
    ).toHaveLength(2);
    expect(review.qualificationAssessment).toBe("not_assessed");
  });

  it("clears context for out-of-scope content beside a preserved employment group", () => {
    const evidence = fixture([
      "Experience\nEmployer: First Labs | Role: Engineer | Name: Demo Person\nEmployer: Second Labs\nRole: Analyst",
    ]);
    const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
    expect(model.groups).toHaveLength(1);
    const review = coverage(evidence);
    expect(review.preservedGroupIds).toEqual(
      model.groups.map((group) => group.id),
    );
    expect(review.groups).toEqual([]);
    expect(
      review.unresolved.some(
        (value) =>
          value.field === "name" && value.reason === "out_of_scope_field",
      ),
    ).toBe(true);
    expect(
      review.unresolved
        .filter((value) => ["employer", "role"].includes(value.field))
        .every(
          (value) => value.reason === "outside_supported_employment_section",
        ),
    ).toBe(true);
  });

  it.each(["Education: BSc Physics", "Education:"])(
    "clears context for ungrouped mixed-category span case %#",
    (outside) => {
      const evidence = fixture([
        `Experience\nEmployer: Synthetic Alpha Labs | ${outside}\nEmployer: Synthetic Beta Labs\nRole: Data Engineer`,
      ]);
      const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
      expect(model.groups).toEqual([]);
      const review = coverage(evidence);
      expect(review.groups).toEqual([]);
      expect(
        review.unresolved
          .filter((value) => value.field === "role")
          .every(
            (value) => value.reason === "outside_supported_employment_section",
          ),
      ).toBe(true);
    },
  );

  it("keeps valid empty evidence reviewable without fabricating absence", () => {
    expect(derive(fixture([""]))).toMatchObject({
      state: "review_required",
      groups: [],
      unresolved: [],
      qualificationAssessment: "not_assessed",
    });
  });

  it("preserves current native/OCR disagreement without merging methods", async () => {
    const evidence = await withSyntheticOcr(
      ["Role:X"],
      "Experience\nEmployer: Synthetic OCR Labs\nRole: Y",
    );
    const before = JSON.stringify(evidence);
    const model = deriveEvidenceReviewTargets(evidence, owned(evidence));
    expect(
      model.notices.some((value) => value.code === "native_ocr_values_differ"),
    ).toBe(true);
    const review = coverage(evidence);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0].method).toBe("local_ocr");
    expect(
      review.unresolved.some((value) =>
        value.citations.some((cite) => cite.method === "native_text"),
      ),
    ).toBe(true);
    expect(JSON.stringify(evidence)).toBe(before);
  });

  it("does not carry native employment context into an OCR method/page", async () => {
    const evidence = await withSyntheticOcr(
      ["Experience\nEmployer: Native Labs\nRole: Engineer", ""],
      "Role: OCR Analyst\nDates: 2020 - 2022",
    );
    const review = coverage(evidence);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0].method).toBe("native_text");
    expect(
      review.unresolved
        .filter((value) =>
          value.citations.some((cite) => cite.method === "local_ocr"),
        )
        .every(
          (value) => value.reason === "outside_supported_employment_section",
        ),
    ).toBe(true);
  });

  it("is deterministic, immutable and emits references without values or source text", () => {
    const evidence = fixture();
    const before = JSON.stringify(evidence);
    const targetsBefore = deriveEvidenceReviewTargets(
      evidence,
      owned(evidence),
    );
    freeze(evidence);
    const first = coverage(evidence);
    expect(derive(evidence)).toEqual(first);
    expect(JSON.stringify(evidence)).toBe(before);
    expect(deriveEvidenceReviewTargets(evidence, owned(evidence))).toEqual(
      targetsBefore,
    );
    for (const value of evidence.assertions)
      expect(JSON.stringify(first)).not.toContain(value.value);
    const visit = (value: unknown) => {
      if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value)) {
          expect(["value", "text", "sourceText", "confidence"]).not.toContain(
            key,
          );
          visit(child);
        }
    };
    visit(first);
    first.groups[0].members[0].citations[0].start++;
    expect(JSON.stringify(evidence)).toBe(before);
  });

  it.each([
    "ownerId",
    "analysisId",
    "sourceId",
    "inputSha256",
    "attemptId",
  ] as const)(
    "rejects mismatched owned %s with no partial references",
    (field) => {
      const evidence = fixture();
      const binding = owned(evidence);
      binding[field] =
        field === "inputSha256"
          ? "b".repeat(64)
          : "10000000-0000-4000-8000-000000000099";
      expect(deriveEvidenceEntryAssociations(evidence, binding)).toMatchObject({
        state: "unavailable",
        binding: null,
        unavailableReason: "binding_mismatch",
        groups: [],
        unresolved: [],
        preservedGroupIds: [],
      });
    },
  );

  it.each(["ownerId", "analysisId", "sourceId", "inputSha256", "id"] as const)(
    "binds candidate identity to exact evidence %s",
    (field) => {
      const changed = fixture(undefined, {
        [field]:
          field === "inputSha256"
            ? "b".repeat(64)
            : "10000000-0000-4000-8000-000000000099",
      });
      expect(derive(changed).groups[0].id).not.toBe(
        derive(fixture()).groups[0].id,
      );
    },
  );

  it.each(["score", "span", "value", "field state"])(
    "rejects forged replay %s",
    (mutation) => {
      const evidence = fixture();
      if (mutation === "score")
        Object.assign(evidence, { scoringEligible: true });
      if (mutation === "span") evidence.spans[0].text += " changed";
      if (mutation === "value") evidence.assertions[0].value += " changed";
      if (mutation === "field state")
        evidence.fields.find((value) => value.field === "employer")!.state =
          "review_required";
      expect(
        deriveEvidenceEntryAssociations(evidence, owned(evidence)),
      ).toMatchObject({
        state: "unavailable",
        binding: null,
        unavailableReason: "invalid_evidence",
        groups: [],
        unresolved: [],
      });
    },
  );

  it.each([null, undefined, {}])(
    "rejects missing or malformed evidence %j",
    (raw) => {
      expect(
        deriveEvidenceEntryAssociations(raw, owned(fixture())),
      ).toMatchObject({
        state: "unavailable",
        unavailableReason: "invalid_evidence",
        binding: null,
      });
    },
  );

  it("keeps replay-valid historical extractors unavailable and unchanged", () => {
    const evidence = DocumentEvidenceSchema.parse(legacy);
    const before = JSON.stringify(evidence);
    const review = derive(evidence);
    expect(review).toMatchObject({
      state: "unavailable",
      unavailableReason: "unsupported_extractor",
      binding: { fieldExtractorVersion: null },
      groups: [],
    });
    expect(JSON.stringify(evidence)).toBe(before);
  });
});

describe("preflight resource limits before strict replay", () => {
  function oversized(length: number): unknown[] {
    const values = new Array(length);
    Object.defineProperty(values, 0, {
      get() {
        throw new Error("Over-budget arrays must not reach replay");
      },
    });
    return values;
  }
  const cases: {
    label: string;
    raw: (evidence: DocumentEvidence) => unknown;
  }[] = [
    {
      label: "projected spans",
      raw: (e) => ({ ...e, spans: oversized(20_001) }),
    },
    {
      label: "assertions",
      raw: (e) => ({ ...e, assertions: oversized(1001) }),
    },
    {
      label: "assertion references",
      raw: (e) => ({
        ...e,
        assertions: [{ ...e.assertions[0], evidence: oversized(21) }],
      }),
    },
    { label: "field states", raw: (e) => ({ ...e, fields: oversized(9) }) },
    { label: "blockers", raw: (e) => ({ ...e, blockers: oversized(7) }) },
    {
      label: "native assertions",
      raw: (e) => ({
        ...e,
        nativeSource: { ...e.nativeSource, assertions: oversized(4) },
      }),
    },
    {
      label: "native spans",
      raw: (e) => ({
        ...e,
        nativeSource: { ...e.nativeSource, spans: oversized(20_001) },
      }),
    },
    {
      label: "native pages",
      raw: (e) => ({
        ...e,
        nativeSource: { ...e.nativeSource, pages: oversized(21) },
      }),
    },
    {
      label: "native span text",
      raw: (e) => ({
        ...e,
        nativeSource: {
          ...e.nativeSource,
          spans: Array.from({ length: 2 }, () => ({
            ...e.nativeSource.spans[0],
            text: "x".repeat(300_000),
          })),
        },
      }),
    },
    {
      label: "OCR text with malformed native sibling",
      raw: (e) => ({
        ...e,
        nativeSource: null,
        ocrSource: { request: { nativePageTexts: ["x".repeat(200_001)] } },
      }),
    },
    {
      label: "native text",
      raw: (e) => ({
        ...e,
        nativeSource: {
          ...e.nativeSource,
          pages: [{ ...e.nativeSource.pages[0], text: "x".repeat(500_001) }],
        },
      }),
    },
    {
      label: "projected text",
      raw: (e) => ({
        ...e,
        spans: Array.from({ length: 4 }, () => ({
          ...e.spans[0],
          text: "x".repeat(200_000),
        })),
      }),
    },
    {
      label: "OCR pages",
      raw: (e) => ({ ...e, ocrSource: { pages: oversized(11) } }),
    },
    {
      label: "OCR words",
      raw: (e) => ({
        ...e,
        ocrSource: { pages: [{ words: oversized(10_001) }] },
      }),
    },
    {
      label: "OCR native pages",
      raw: (e) => ({
        ...e,
        ocrSource: { request: { nativePageTexts: oversized(21) } },
      }),
    },
    {
      label: "OCR selected pages",
      raw: (e) => ({
        ...e,
        ocrSource: { request: { selectedPages: oversized(11) } },
      }),
    },
    {
      label: "OCR request text",
      raw: (e) => ({
        ...e,
        ocrSource: { request: { nativePageTexts: ["x".repeat(200_001)] } },
      }),
    },
    {
      label: "OCR page text",
      raw: (e) => ({
        ...e,
        ocrSource: { pages: [{ text: "x".repeat(200_001) }] },
      }),
    },
    {
      label: "OCR word text",
      raw: (e) => ({
        ...e,
        ocrSource: { pages: [{ words: [{ text: "x".repeat(200_001) }] }] },
      }),
    },
    {
      label: "OCR combined text",
      raw: (e) => ({
        ...e,
        ocrSource: {
          request: { nativePageTexts: ["x".repeat(100_000)] },
          pages: [{ text: "x".repeat(100_001) }],
        },
      }),
    },
  ];
  it.each(cases)(
    "rejects excessive $label without partial authority",
    ({ raw }) => {
      const evidence = fixture();
      expect(
        deriveEvidenceEntryAssociations(raw(evidence), owned(evidence)),
      ).toMatchObject({
        state: "unavailable",
        unavailableReason: "resource_limit",
        binding: null,
        groups: [],
        unresolved: [],
        preservedGroupIds: [],
        scoringEligible: false,
        persistable: false,
      });
    },
  );

  it("retains the exact validated twenty-page aggregate native bound", () => {
    const pages = Array.from({ length: 20 }, (_, index) =>
      "x".repeat(index === 19 ? 25_000 : 24_998),
    );
    expect(pages.join("\n\n").length).toBe(500_000);
    expect(derive(fixture(pages))).toMatchObject({
      state: "review_required",
      unavailableReason: null,
    });
  });

  it("retains the validated thousand-assertion boundary", () => {
    const evidence = fixture([
      Array.from(
        { length: 1000 },
        (_, index) => `Employer: Synthetic ${index} Labs`,
      ).join("\n"),
    ]);
    expect(evidence.assertions).toHaveLength(1000);
    const review = coverage(evidence);
    expect(review.state).toBe("review_required");
    expect(review.unresolved).toHaveLength(1000);
  });
});
