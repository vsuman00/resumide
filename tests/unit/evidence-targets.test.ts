import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
  type DocumentEvidence,
} from "../../app/lib/server/document-evidence";
import {
  deriveEvidenceReviewTargets,
  EVIDENCE_TARGET_MODEL_VERSION,
  type OwnedEvidenceBinding,
} from "../../app/lib/server/evidence-targets";
import {
  OcrEvidenceSchema,
  runSelectiveLocalOcr,
} from "../../app/lib/server/ocr/selective";

const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-10-11T00:00:00.000Z",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
};
const fixture = (pages: string[], overrides: Partial<typeof context> = {}) =>
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
  deriveEvidenceReviewTargets(evidence, owned(evidence));

function freeze(value: unknown) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
async function withSyntheticOcr(pages: string[], ocrText: string) {
  const selectedPages = pages.flatMap((text, index) =>
    text.replace(/\s/gu, "").length < 8
      ? [{ pageNumber: index + 1, pageId: `page-${index + 1}` }]
      : [],
  );
  const allocation = {
    id: "target-unit-synthetic",
    maxWallTimeMs: 1000,
    maxPages: 10,
    externalApiFeeMicros: 0 as const,
  };
  const outcome = await runSelectiveLocalOcr(
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
      allocation,
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
    OcrEvidenceSchema.parse(outcome),
  );
}

describe("derived owner/source-bound evidence review targets", () => {
  it("retains every raw assertion and citation without modifying the envelope", () => {
    const evidence = fixture([
      "🌏 Employer: Synthetic Labs | Role: Backend Engineer\nEmail: demo@example.invalid",
    ]);
    const before = JSON.stringify(evidence);
    freeze(evidence);
    const model = derive(evidence);
    expect(model.authority).toBe("derived_review_only");
    expect(model.modelVersion).toBe(EVIDENCE_TARGET_MODEL_VERSION);
    expect(model.scoringEligible).toBe(false);
    expect(model.offsetUnit).toBe("unicode_code_point");
    expect(model.offsetOrigin).toBe("span_text");
    expect(model.observations).toHaveLength(evidence.assertions.length);
    for (const assertion of evidence.assertions) {
      const observation = model.observations.find(
        (value) => value.assertionId === assertion.id,
      )!;
      expect(observation).toMatchObject({
        field: assertion.field,
        value: assertion.value,
        state: assertion.state,
        confidence: assertion.confidence,
      });
      expect(observation.citations).toHaveLength(assertion.evidence.length);
      for (const reference of assertion.evidence) {
        const span = evidence.spans.find(
          (value) => value.id === reference.spanId,
        )!;
        expect(observation.citations).toContainEqual({
          ...reference,
          pageId: span.pageId,
          method: span.method,
          pageStart: span.start + reference.start,
          pageEnd: span.start + reference.end,
        });
        expect(
          Array.from(span.text).slice(reference.start, reference.end).join(""),
        ).toBe(assertion.value);
      }
    }
    expect(JSON.stringify(evidence)).toBe(before);
  });

  it("is deterministic and binds IDs to owner, analysis, source, hash and attempt", () => {
    const source = ["Employer: Synthetic Labs"];
    const baseline = fixture(source);
    const first = derive(baseline);
    expect(first).toEqual(derive(baseline));
    const id = first.targets.find((target) => target.field === "employer")!.id;
    for (const override of [
      { id: "20000000-0000-4000-8000-000000000001" },
      { ownerId: "20000000-0000-4000-8000-000000000002" },
      { analysisId: "20000000-0000-4000-8000-000000000003" },
      { sourceId: "20000000-0000-4000-8000-000000000004" },
      { inputSha256: "b".repeat(64) },
    ]) {
      expect(
        derive(fixture(source, override)).targets.find(
          (target) => target.field === "employer",
        )!.id,
      ).not.toBe(id);
    }
    for (const field of [
      "ownerId",
      "analysisId",
      "sourceId",
      "inputSha256",
      "attemptId",
    ] as const) {
      expect(() =>
        deriveEvidenceReviewTargets(baseline, {
          ...owned(baseline),
          [field]:
            field === "inputSha256"
              ? "b".repeat(64)
              : "20000000-0000-4000-8000-000000000006",
        }),
      ).toThrow("EVIDENCE_TARGET_BINDING_MISMATCH");
    }
  });

  it("encodes the absent legacy extractor version as null and separates its target IDs", () => {
    const current = fixture(["Employer: Synthetic Labs"]);
    const legacy = structuredClone(current);
    delete legacy.fieldExtractorVersion;
    expect(DocumentEvidenceSchema.safeParse(legacy).success).toBe(true);
    const oldModel = derive(legacy);
    expect(oldModel.binding.fieldExtractorVersion).toBeNull();
    expect(JSON.parse(JSON.stringify(oldModel.binding))).toHaveProperty(
      "fieldExtractorVersion",
      null,
    );
    expect(oldModel.targets[0].id).not.toBe(derive(current).targets[0].id);
  });

  it("keeps dual email slots and repeated page headers as separate observations", () => {
    const evidence = fixture([
      "Name: Demo Person\nfirst@example.invalid\nsecond@example.invalid\nExperience",
      "first@example.invalid\nExperience",
    ]);
    const model = derive(evidence);
    const emails = model.observations.filter(
      (value) => value.field === "email",
    );
    expect(emails).toHaveLength(3);
    expect(
      emails.filter((value) => value.value === "first@example.invalid"),
    ).toHaveLength(2);
    expect(new Set(emails.map((value) => value.targetId)).size).toBe(3);
    expect(
      model.targets
        .filter((target) => target.field === "email")
        .every((target) => target.kind === "contact_slot"),
    ).toBe(true);
    expect(model.notices).toContainEqual(
      expect.objectContaining({
        code: "multiple_contact_slots",
        field: "email",
        relationship: "unresolved",
      }),
    );
  });

  it("offers two labelled employment candidates with overlapping dates without declaring contradictions", () => {
    const evidence = fixture([
      "Employer: Northwind Labs | Role: Backend Engineer | Dates: 2020 - 2021\nEmployer: Cedar Labs | Role: Software Engineer | Dates: 2020 - 2022",
    ]);
    const model = derive(evidence);
    expect(model.groups).toHaveLength(2);
    expect(
      model.groups.every(
        (group) =>
          group.kind === "employment" &&
          group.association === "labelled_same_span_candidate" &&
          group.verified === false,
      ),
    ).toBe(true);
    expect(model.groups.every((group) => group.targetIds.length === 3)).toBe(
      true,
    );
    expect(model.notices).toContainEqual(
      expect.objectContaining({
        code: "multiple_entry_candidates",
        field: "employer",
        relationship: "unresolved",
      }),
    );
    expect(
      model.coverage.find((value) => value.field === "employer")?.rawState,
    ).toBe("conflict");
    expect(
      model.notices.some((notice) => /contradict/iu.test(notice.code)),
    ).toBe(false);
  });

  it("separates same-span education and certification candidates from employment", () => {
    const model = derive(
      fixture([
        "Education: BSc Computing | Dates: 2016 - 2020\nCertification: Synthetic Systems Certificate | Dates: 2024",
      ]),
    );
    expect(model.groups.map((group) => group.kind)).toEqual([
      "education",
      "certification",
    ]);
    expect(model.groups.every((group) => group.verified === false)).toBe(true);
    expect(
      model.targets.filter((target) => target.kind === "entry_field"),
    ).toHaveLength(4);
  });

  it("does not infer cross-line employment associations from proximity", () => {
    const evidence = fixture([
      "Experience\nBackend Engineer\nNorthwind Labs\n2020 - 2021",
    ]);
    expect(evidence.assertions.map((value) => value.field)).toEqual(
      expect.arrayContaining(["employer", "role", "dates"]),
    );
    const model = derive(evidence);
    expect(model.groups).toEqual([]);
    expect(
      model.targets
        .filter(
          (target) =>
            target.observationIds.length &&
            ["employer", "role", "dates"].includes(target.field),
        )
        .every(
          (target) =>
            target.kind === "unassigned_observation" && target.groupId === null,
        ),
    ).toBe(true);
    expect(
      model.notices.some((notice) => notice.code === "unresolved_entry_link"),
    ).toBe(true);
  });

  it.each([
    "Employer: Northwind Labs | Employer: Cedar Labs | Role: Backend Engineer",
    "Employer: Northwind Labs | Education: BSc Computing | Dates: 2020 - 2021",
    "Backend Engineer at Northwind Labs | 2020 - 2021",
  ])(
    "keeps repeated-label, mixed-category or unlabelled same-span links ambiguous: %s",
    (source) => {
      const evidence = fixture([`Experience\n${source}`]);
      expect(evidence.assertions.length).toBeGreaterThan(1);
      const model = derive(evidence);
      expect(model.groups).toEqual([]);
      expect(
        model.targets
          .filter(
            (target) =>
              target.observationIds.length &&
              !["name", "email", "phone"].includes(target.field),
          )
          .every((target) => target.kind === "unassigned_observation"),
      ).toBe(true);
    },
  );

  it("retains actual synthetic native/OCR value differences with unresolved target links", async () => {
    const evidence = await withSyntheticOcr(["Name: A"], "Name: B");
    const model = derive(evidence);
    const names = model.observations.filter((value) => value.field === "name");
    expect(names.map((value) => value.value)).toEqual(["A", "B"]);
    expect(
      names.flatMap((value) =>
        value.citations.map((citation) => citation.method),
      ),
    ).toEqual(["native_text", "local_ocr"]);
    expect(model.notices).toContainEqual(
      expect.objectContaining({
        code: "native_ocr_values_differ",
        field: "name",
        pageId: "page-1",
        relationship: "unresolved",
      }),
    );
    expect(
      names.every(
        (value) =>
          value.state === "review_required" && value.confidence.value === null,
      ),
    ).toBe(true);
    expect(model.scoringEligible).toBe(false);
  });

  it("does not invent a same-target disagreement across pages or from equal OCR values", async () => {
    for (const evidence of [
      await withSyntheticOcr(["Name: A"], "Name: A"),
      await withSyntheticOcr(["Name: Demo Person", ""], "Name: B"),
    ]) {
      const model = derive(evidence);
      expect(
        model.observations.filter((value) => value.field === "name"),
      ).toHaveLength(2);
      expect(
        model.notices.some(
          (notice) => notice.code === "native_ocr_values_differ",
        ),
      ).toBe(false);
    }
  });

  it("represents an unobserved optional field without assessing a job qualification", () => {
    const model = derive(fixture(["Employer: Synthetic Labs"]));
    expect(
      model.coverage.find((value) => value.field === "certification"),
    ).toMatchObject({
      state: "unobserved",
      rawState: "not_evaluated",
      qualificationAssessment: "not_assessed",
      observationIds: [],
    });
    expect(
      model.targets.find((value) => value.field === "certification"),
    ).toMatchObject({
      kind: "unobserved_field",
      state: "unobserved",
      observationIds: [],
      groupId: null,
    });
  });
});
