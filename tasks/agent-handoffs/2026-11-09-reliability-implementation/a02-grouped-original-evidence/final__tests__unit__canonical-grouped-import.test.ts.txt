import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import {
  reconcileDocumentEvidence,
  DocumentEvidenceSchema,
  type DocumentEvidence,
} from "../../app/lib/server/document-evidence";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import * as content from "../../app/lib/server/canonical-content";
import type { CanonicalResumeDraft } from "../../app/lib/server/canonical-resume-schema";
import {
  OcrEvidenceSchema,
  runSelectiveLocalOcr,
} from "../../app/lib/server/ocr/selective";
import {
  GroupedOriginalImportIntentSchema,
  importCanonicalGroupedEvidence,
  type GroupedOriginalPreparation,
} from "../../app/lib/server/canonical-grouped-import";

afterEach(() => vi.restoreAllMocks());
const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-11-13T00:00:00.000Z",
  retentionPolicyId: "synthetic/1.0.0",
};
const jobs =
  "Employer: Synthetic North Labs\nRole: Engineer\nDates: 2020 - 2022\nEmployer: Synthetic South Labs\nRole: Analyst\nDates: 2021 - 2023";
const fixture = (text = `Experience\n${jobs}`) =>
  reconcileDocumentEvidence(context, buildNativeEvidence([text]));
const owned = (evidence: DocumentEvidence, locale?: string) => ({
  ownerId: evidence.ownerId,
  analysisId: evidence.analysisId,
  sourceId: evidence.sourceId,
  inputSha256: evidence.inputSha256,
  attemptId: evidence.id,
  resumeId: "10000000-0000-4000-8000-000000000005",
  organizationId: "10000000-0000-4000-8000-000000000006",
  ...(locale === undefined ? {} : { locale }),
});
function intent(evidence: DocumentEvidence) {
  const associations = deriveEvidenceEntryAssociations(
    evidence,
    owned(evidence),
  );
  return GroupedOriginalImportIntentSchema.parse({
    schemaVersion: "grouped-original-selection/1.0.0",
    binding: {
      ...associations.binding,
      organizationId: owned(evidence).organizationId,
      resumeId: owned(evidence).resumeId,
      associationModelVersion: associations.modelVersion,
      producerVersion: "canonical-engine/1.0.3",
      canonicalHeadId: null,
    },
    acknowledgement: "relationship_only_not_fact_confirmation",
    unselectedDisposition: "retain_original",
    selections: associations.groups.map((group) => ({
      groupId: group.id,
      members: group.members,
    })),
  });
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function requirePrepared(
  result: GroupedOriginalPreparation,
): asserts result is Extract<
  GroupedOriginalPreparation,
  { state: "prepared" }
> {
  expect(result.state).toBe("prepared");
  if (result.state !== "prepared") throw new Error(result.unavailableReason);
}
function captureOriginal(
  transform: (document: CanonicalResumeDraft) => void = () => {},
) {
  const originalImport = content.importCanonicalEvidence;
  const captured: CanonicalResumeDraft[] = [];
  const spy = vi
    .spyOn(content, "importCanonicalEvidence")
    .mockImplementation((raw, owner) => {
      const document = originalImport(raw, owner);
      transform(document);
      captured.push(structuredClone(document));
      return document;
    });
  return { spy, captured };
}

function unavailable(result: GroupedOriginalPreparation) {
  expect(result.state).toBe("unavailable");
  expect(result.document).toBeNull();
  expect(result.associationReceipt).toBeNull();
  expect(result.persistable).toBe(false);
  expect(result.scoringEligible).toBe(false);
}
function runtimeIntent(evidence: DocumentEvidence, selected: unknown) {
  return Reflect.apply(importCanonicalGroupedEvidence, undefined, [
    evidence,
    owned(evidence),
    selected,
  ]) as GroupedOriginalPreparation;
}
async function withSyntheticOcr(nativePageText = "") {
  const text = `Experience\n${jobs}`;
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
      nativePageTexts: [nativePageText],
      selectedPages: [{ pageId: "page-1", pageNumber: 1 }],
      remainingDeadlineMs: 1000,
      limits: { maxCharacters: 100_000, maxPages: 10 },
      allocation: {
        id: "grouped-import-synthetic",
        maxWallTimeMs: 1000,
        maxPages: 1,
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
        pages: [
          {
            pageId: "page-1",
            pageNumber: 1,
            imageSha256: "b".repeat(64),
            widthPixels: 100,
            heightPixels: 100,
            rotation: 0,
            text,
            words: [...text.matchAll(/\S+/gu)].map((word) => ({
              text: word[0],
              start: Array.from(text.slice(0, word.index)).length,
              end: Array.from(text.slice(0, word.index! + word[0].length))
                .length,
              confidence: 80,
              box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
            })),
          },
        ],
      }),
    },
  );
  return reconcileDocumentEvidence(
    context,
    buildNativeEvidence([nativePageText]),
    OcrEvidenceSchema.parse(result),
  );
}

describe("nonpersistable grouped original import", () => {
  it("prepares two entries from six exact unconfirmed facts using one fresh legacy import", () => {
    const evidence = fixture();
    const selected = intent(evidence);
    const originalInputs = digest([evidence, selected]);
    const { spy, captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      selected,
    );
    requirePrepared(result);
    expect(spy).toHaveBeenCalledTimes(1);
    const baseline = captured[0];
    expect(baseline.producerVersion).toBe("canonical-engine/1.0.1");
    expect(baseline.sections[0].entries).toHaveLength(6);
    expect(result.document.producerVersion).toBe("canonical-engine/1.0.3");
    expect(result.document.sections[0].entries).toHaveLength(2);
    expect(
      result.document.sections[0].entries.map((entry) => entry.id),
    ).toEqual([
      baseline.sections[0].entries[0].id,
      baseline.sections[0].entries[3].id,
    ]);
    expect(digest(result.document.facts)).toBe(digest(baseline.facts));
    expect(digest(result.document.changes)).toBe(digest(baseline.changes));
    expect(result.document.versionId).toBe(baseline.versionId);
    expect(result.document.createdAt).toBe(baseline.createdAt);
    expect(
      result.document.facts.every(
        (fact) => fact.state === "unconfirmed" && fact.confirmation === null,
      ),
    ).toBe(true);
    expect(
      result.document.sections[0].entries.flatMap((entry) => entry.factIds),
    ).toEqual(baseline.sections[0].entries.flatMap((entry) => entry.factIds));
    expect(result).toMatchObject({
      persistable: false,
      scoringEligible: false,
      associationReceipt: {
        authority: "derived_preparation_only",
        verified: false,
        requiresDurableAdmission: true,
        acknowledgement: "relationship_only_not_fact_confirmation",
        effectiveLocale: "en-IN",
      },
    });
    expect(digest([evidence, selected])).toBe(originalInputs);
  });

  it("retains every unselected contact, section, entry, bullet and fact", () => {
    const evidence = fixture(
      `Name: Demo Person\nEmail: demo@example.invalid\nExperience\n${jobs}\nUnselected neutral statement.`,
    );
    const selected = intent(evidence);
    selected.selections = [selected.selections[0]];
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      selected,
    );
    requirePrepared(result);
    const original = captured[0];
    expect(digest(result.document.facts)).toBe(digest(original.facts));
    expect(result.document.contactFactIds).toEqual(original.contactFactIds);
    const removed = new Set(
      result.associationReceipt.mappings.flatMap((mapping) =>
        mapping.members
          .filter((value) => value.originalEntryId !== mapping.entryId)
          .map((value) => value.originalEntryId),
      ),
    );
    const anchors = new Set(
      result.associationReceipt.mappings.map((mapping) => mapping.entryId),
    );
    const unselected = original.sections
      .flatMap((section) => section.entries)
      .filter((entry) => !removed.has(entry.id) && !anchors.has(entry.id));
    const after = new Map(
      result.document.sections
        .flatMap((section) => section.entries)
        .map((entry) => [entry.id, entry]),
    );
    for (const entry of unselected)
      expect(digest(after.get(entry.id))).toBe(digest(entry));
    expect(
      result.document.sections.map((section) => [
        section.id,
        section.type,
        section.title,
        section.factIds,
      ]),
    ).toEqual(
      original.sections.map((section) => [
        section.id,
        section.type,
        section.title,
        section.factIds,
      ]),
    );
  });

  it("normalizes reordered selections and members to rederived source order", () => {
    const evidence = fixture();
    const source = intent(evidence);
    const selected = structuredClone(source);
    selected.selections.reverse();
    selected.selections.forEach((group) => group.members.reverse());
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      selected,
    );
    requirePrepared(result);
    expect(result.associationReceipt.selections).toEqual(source.selections);
    expect(
      result.document.sections[0].entries.map((entry) => entry.factIds),
    ).toEqual(
      result.associationReceipt.mappings.map((mapping) =>
        mapping.members.map((value) => value.factId),
      ),
    );
  });

  it("records effective locale without claiming a durable replay identity", () => {
    const evidence = fixture();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence, "en-US"),
      intent(evidence),
    );
    requirePrepared(result);
    expect(result.document.locale).toBe("en-US");
    expect(result.associationReceipt.effectiveLocale).toBe("en-US");
    expect(result.associationReceipt).not.toHaveProperty("semanticHash");
    expect(result.associationReceipt).not.toHaveProperty("decisionRevision");
  });

  it("keeps same-span groups and unsupported contexts unchanged beside selected multiline groups", () => {
    const evidence = fixture(
      `Experience\nEmployer: Existing Labs | Role: Existing Engineer\n${jobs}\nUnsupported section\nEmployer: Unresolved Labs\nRole: Unresolved Engineer`,
    );
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    requirePrepared(result);
    const original = captured[0];
    expect(digest(result.document.facts)).toBe(digest(original.facts));
    const entryIds = new Set(
      result.associationReceipt.mappings.flatMap((mapping) =>
        mapping.members.map((value) => value.originalEntryId),
      ),
    );
    const untouched = original.sections
      .flatMap((section) => section.entries)
      .filter((entry) => !entryIds.has(entry.id));
    const after = new Map(
      result.document.sections
        .flatMap((section) => section.entries)
        .map((entry) => [entry.id, entry]),
    );
    for (const entry of untouched)
      expect(digest(after.get(entry.id))).toBe(digest(entry));
  });

  it("preserves exact Unicode field values and code-point citations", () => {
    const evidence = fixture(
      "Employment\n\tEMPLOYER: Élan 🚀 Labs\nrole: Développeur\nDATES: 2020 - 2022",
    );
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    requirePrepared(result);
    expect(digest(result.document.facts)).toBe(digest(captured[0].facts));
    for (const mapping of result.associationReceipt.mappings)
      for (const value of mapping.members) {
        const assertion = evidence.assertions.find(
          (row) => row.id === value.assertionId,
        )!;
        const fact = result.document.facts.find(
          (row) => row.id === value.factId,
        )!;
        expect(
          digest([
            fact.type,
            fact.value,
            fact.sources.map((cite) => [
              cite.attemptId,
              cite.spanId,
              cite.start,
              cite.end,
            ]),
          ]),
        ).toBe(
          digest([
            assertion.field,
            assertion.value,
            assertion.evidence.map((cite) => [
              evidence.id,
              cite.spanId,
              cite.start,
              cite.end,
            ]),
          ]),
        );
      }
  });

  it("uses actual synthetic OCR placement and preserves extraction method citations", async () => {
    const evidence = await withSyntheticOcr();
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    requirePrepared(result);
    expect(result.document.sections[0].entries).toHaveLength(2);
    expect(digest(result.document.facts)).toBe(digest(captured[0].facts));
    expect(
      result.associationReceipt.selections
        .flatMap((group) => group.members)
        .every((value) => value.citations[0].method === "local_ocr"),
    ).toBe(true);
  });

  it("real OCR selection boundary: rejects a full-native shadow attempt before import", async () => {
    const evidence = fixture();
    const selected = intent(evidence);
    expect(
      deriveEvidenceEntryAssociations(evidence, owned(evidence)).groups,
    ).toHaveLength(2);
    const ocr = (await withSyntheticOcr()).ocrSource;
    if (!ocr) throw new Error("Expected synthetic OCR evidence");
    const attempted = {
      ...evidence,
      ocrSource: {
        ...ocr,
        request: {
          ...ocr.request,
          nativePageTexts: evidence.nativeSource.pages.map((page) => page.text),
        },
      },
    };
    expect(digest(attempted.ocrSource.request.nativePageTexts)).toBe(
      digest(evidence.nativeSource.pages.map((page) => page.text)),
    );
    expect(OcrEvidenceSchema.safeParse(attempted.ocrSource).success).toBe(
      false,
    );
    expect(DocumentEvidenceSchema.safeParse(attempted).success).toBe(false);
    const importer = vi.spyOn(content, "importCanonicalEvidence");
    const result = importCanonicalGroupedEvidence(
      attempted,
      owned(evidence),
      selected,
    );
    unavailable(result);
    expect(result.unavailableReason).toBe("association_unavailable");
    expect(importer).not.toHaveBeenCalled();
  });

  it("real OCR selection boundary: retains unselected sparse native facts without reassignment", async () => {
    const evidence = await withSyntheticOcr("Role:X");
    expect(DocumentEvidenceSchema.safeParse(evidence).success).toBe(true);
    const selected = intent(evidence);
    selected.selections = [selected.selections[0]];
    expect(
      selected.selections[0].members.every(
        (value) => value.citations[0].method === "local_ocr",
      ),
    ).toBe(true);
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      selected,
    );
    requirePrepared(result);
    const nativeSpans = new Set(
      evidence.spans
        .filter((span) => span.method === "native_text")
        .map((span) => span.id),
    );
    const nativeFacts = captured[0].facts.filter(
      (fact) =>
        fact.sources.length &&
        fact.sources.every((source) => nativeSpans.has(source.spanId)),
    );
    expect(nativeFacts).toHaveLength(1);
    for (const fact of nativeFacts)
      expect(
        digest(result.document.facts.find((value) => value.id === fact.id)),
      ).toBe(digest(fact));
    const nativeIds = new Set(nativeFacts.map((fact) => fact.id));
    const placements = (document: CanonicalResumeDraft) =>
      [
        ...document.contactFactIds,
        ...document.sections.flatMap((section) => [
          ...section.factIds,
          ...section.entries.flatMap((entry) => [
            ...entry.factIds,
            ...entry.bullets.flatMap((bullet) => bullet.factIds),
          ]),
        ]),
      ].filter((factId) => nativeIds.has(factId));
    expect(placements(result.document)).toEqual(placements(captured[0]));
    expect(placements(result.document)).toEqual([]);
    expect(digest(result.document.facts)).toBe(digest(captured[0].facts));
  });

  it("accepts exactly thirty-two actual groups without dropping original facts", () => {
    const evidence = fixture(
      "Experience\n" +
        Array.from(
          { length: 32 },
          (_, index) => `Employer: Synthetic ${index} Labs\nRole: Engineer`,
        ).join("\n"),
    );
    const { captured } = captureOriginal();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    requirePrepared(result);
    expect(result.associationReceipt.selections).toHaveLength(32);
    expect(result.document.sections[0].entries).toHaveLength(32);
    expect(result.document.facts).toHaveLength(64);
    expect(digest(result.document.facts)).toBe(digest(captured[0].facts));
  });

  it("does not emit observation values or factual approval in the receipt", () => {
    const evidence = fixture();
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    requirePrepared(result);
    for (const value of evidence.assertions)
      expect(JSON.stringify(result.associationReceipt)).not.toContain(
        value.value,
      );
    const inspect = (value: unknown) => {
      if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value)) {
          expect([
            "value",
            "text",
            "sourceText",
            "confirmation",
            "decisionHistory",
          ]).not.toContain(key);
          inspect(child);
        }
    };
    inspect(result.associationReceipt);
  });

  it.each([
    "ownerId",
    "organizationId",
    "resumeId",
    "analysisId",
    "sourceId",
    "attemptId",
    "inputSha256",
    "evidenceSchemaVersion",
    "fieldExtractorVersion",
    "targetModelVersion",
    "associationModelVersion",
    "producerVersion",
    "canonicalHeadId",
  ] as const)(
    "rejects mismatched intent binding %s before constructing a draft",
    (field) => {
      const evidence = fixture();
      const selected = intent(evidence);
      Object.assign(selected.binding, {
        [field]:
          field === "inputSha256"
            ? "b".repeat(64)
            : "10000000-0000-4000-8000-000000000099",
      });
      const spy = vi.spyOn(content, "importCanonicalEvidence");
      unavailable(
        importCanonicalGroupedEvidence(evidence, owned(evidence), selected),
      );
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each([
    "schema",
    "acknowledgement",
    "disposition",
    "extra root",
    "extra binding",
    "extra selection",
    "extra member",
    "extra citation",
    "copied value",
    "original draft",
    "empty selection",
  ])("rejects invalid intent case %s without legacy fallback", (mutation) => {
    const evidence = fixture();
    const selected = intent(evidence);
    if (mutation === "schema")
      Object.assign(selected, { schemaVersion: "unknown" });
    if (mutation === "acknowledgement")
      Object.assign(selected, { acknowledgement: true });
    if (mutation === "disposition")
      Object.assign(selected, { unselectedDisposition: "drop" });
    if (mutation === "extra root") Object.assign(selected, { unknown: true });
    if (mutation === "extra binding")
      Object.assign(selected.binding, { unknown: true });
    if (mutation === "extra selection")
      Object.assign(selected.selections[0], { unknown: true });
    if (mutation === "extra member")
      Object.assign(selected.selections[0].members[0], { unknown: true });
    if (mutation === "extra citation")
      Object.assign(selected.selections[0].members[0].citations[0], {
        unknown: true,
      });
    if (mutation === "copied value")
      Object.assign(selected.selections[0].members[0], { value: "untrusted" });
    if (mutation === "original draft")
      Object.assign(selected, { originalDraft: {} });
    if (mutation === "empty selection") selected.selections = [];
    const spy = vi.spyOn(content, "importCanonicalEvidence");
    unavailable(
      importCanonicalGroupedEvidence(evidence, owned(evidence), selected),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    "duplicate group",
    "duplicate member",
    "missing member",
    "wrong group",
    "foreign member",
    "assertion",
    "target",
    "field",
    "span",
    "method",
    "start",
    "end",
    "pageStart",
    "pageEnd",
  ])("rejects forged or overlapping selector case %s", (mutation) => {
    const evidence = fixture();
    const selected = intent(evidence);
    const value = selected.selections[0].members[0];
    if (mutation === "duplicate group")
      selected.selections[1] = structuredClone(selected.selections[0]);
    if (mutation === "duplicate member")
      selected.selections[0].members[1] = structuredClone(value);
    if (mutation === "missing member") selected.selections[0].members.pop();
    if (mutation === "wrong group")
      selected.selections[0].groupId = "entry-association-unknown";
    if (mutation === "foreign member")
      selected.selections[0].members[0] = structuredClone(
        selected.selections[1].members[0],
      );
    if (mutation === "assertion") value.assertionId = "assertion-unknown";
    if (mutation === "target") value.targetId = "target-unknown";
    if (mutation === "field") value.field = "role";
    if (mutation === "span") value.citations[0].spanId = "native-unknown";
    if (mutation === "method") value.citations[0].method = "local_ocr";
    if (["start", "end", "pageStart", "pageEnd"].includes(mutation))
      Object.assign(value.citations[0], { [mutation]: 1 });
    const spy = vi.spyOn(content, "importCanonicalEvidence");
    unavailable(
      importCanonicalGroupedEvidence(evidence, owned(evidence), selected),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(["groups", "members", "citations", "scalar"])(
    "preflights intent %s excess before serialization",
    (mutation) => {
      const evidence = fixture();
      const selected = intent(evidence);
      if (mutation === "groups")
        selected.selections = Array.from({ length: 33 }, () =>
          structuredClone(selected.selections[0]),
        );
      if (mutation === "members")
        selected.selections[0].members.push(
          structuredClone(selected.selections[0].members[0]),
        );
      if (mutation === "citations")
        selected.selections[0].members[0].citations.push(
          structuredClone(selected.selections[0].members[0].citations[0]),
        );
      if (mutation === "scalar")
        selected.selections[0].groupId = "x".repeat(201);
      const stringify = vi.spyOn(JSON, "stringify");
      const importer = vi.spyOn(content, "importCanonicalEvidence");
      const result = importCanonicalGroupedEvidence(
        evidence,
        owned(evidence),
        selected,
      );
      unavailable(result);
      expect(result.unavailableReason).toBe("resource_limit");
      expect(stringify).not.toHaveBeenCalled();
      expect(importer).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined, 1, "invalid"])(
    "rejects primitive runtime intent case %#",
    (raw) => {
      unavailable(runtimeIntent(fixture(), raw));
    },
  );

  it("rejects altered raw evidence before import construction", () => {
    const evidence = fixture();
    const selected = intent(evidence);
    evidence.assertions[0].value += " changed";
    const importer = vi.spyOn(content, "importCanonicalEvidence");
    unavailable(
      importCanonicalGroupedEvidence(evidence, owned(evidence), selected),
    );
    expect(importer).not.toHaveBeenCalled();
  });

  it("preserves original importer limits instead of partially grouping an oversized draft", () => {
    const evidence = fixture(
      "Experience\nEmployer: First Labs\nRole: Engineer\n" +
        Array.from(
          { length: 99 },
          (_, index) => `Employer: Other ${index} Labs`,
        ).join("\n"),
    );
    const importer = vi.spyOn(content, "importCanonicalEvidence");
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      intent(evidence),
    );
    unavailable(result);
    expect(result.unavailableReason).toBe("import_limits");
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("defensive refusal of incompatible internally constructed layouts", () => {
  it.each([
    "duplicate fact",
    "missing fact",
    "wrong value",
    "wrong citation",
    "extra citation",
    "unplaced",
    "multiple places",
    "mixed entry",
    "bullet entry",
    "wrong section",
    "cross section",
    "confirmed fact",
  ])("rejects whole preparation for mocked legacy deviation %s", (mutation) => {
    const evidence = fixture();
    const selected = intent(evidence);
    selected.selections = [selected.selections[0]];
    const { spy } = captureOriginal((document) => {
      const section = document.sections[0];
      const entry = section.entries[0];
      const fact = document.facts.find(
        (value) => value.id === entry.factIds[0],
      )!;
      if (mutation === "duplicate fact")
        document.facts.push({
          ...structuredClone(fact),
          id: "10000000-0000-4000-8000-000000000099",
        });
      if (mutation === "missing fact")
        document.facts = document.facts.filter((value) => value.id !== fact.id);
      if (mutation === "wrong value") fact.value += " changed";
      if (mutation === "wrong citation") fact.sources[0].start++;
      if (mutation === "extra citation")
        fact.sources.push(structuredClone(fact.sources[0]));
      if (mutation === "unplaced") section.entries.shift();
      if (mutation === "multiple places")
        section.entries[1].factIds.push(fact.id);
      if (mutation === "mixed entry")
        entry.factIds.push(section.entries[3].factIds[0]);
      if (mutation === "bullet entry")
        entry.bullets.push({
          id: "10000000-0000-4000-8000-000000000098",
          text: "Neutral retained bullet",
          factIds: [],
        });
      if (mutation === "wrong section") section.type = "other";
      if (mutation === "cross section") {
        const role = section.entries.splice(1, 1)[0];
        document.sections.push({
          id: "10000000-0000-4000-8000-000000000097",
          type: "experience",
          title: "Other experience",
          factIds: [],
          entries: [role],
        });
      }
      if (mutation === "confirmed fact") {
        fact.state = "candidate_confirmed";
        fact.confirmation = {
          actorId: document.ownerId,
          confirmedAt: document.createdAt,
          value: fact.value,
        };
      }
    });
    const result = importCanonicalGroupedEvidence(
      evidence,
      owned(evidence),
      selected,
    );
    unavailable(result);
    expect(result.unavailableReason).toBe("unsafe_mapping");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
