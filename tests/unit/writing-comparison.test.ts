import { describe, expect, it } from "vitest";
import {
  buildProjectedWritingComparison,
  buildSavedWritingComparison,
} from "../../app/lib/writing-comparison";
import { checkWritingQuality } from "../../app/lib/writing-quality";
import {
  compareCanonical,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "../../app/lib/server/canonical-resume-schema";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
const saved = (
  before: CanonicalResumeDraft,
  after: CanonicalResumeDraft,
  beforeRevision = 1,
  afterRevision = 2,
) =>
  buildSavedWritingComparison({
    before,
    after,
    beforeRevision,
    afterRevision,
    changes: compareCanonical(before, after),
  });
async function fixture() {
  const f = await createRequirementContextFixture({ confirm: true });
  const doc = f.context.canonical.content;
  return { doc, fact: doc.facts.find((x) => x.id === f.targetFactId)! };
}
describe("writing observations without score or factual authority", () => {
  it.each(["Built useful services", "Built services using PostgreSQL"])(
    "keeps projected wording unsaved even for confirmed current text: %s",
    async (proposedValue) => {
      const { doc, fact } = await fixture();
      const before = JSON.stringify({ doc, fact });
      const model = buildProjectedWritingComparison({
        baseVersionId: doc.versionId,
        fact,
        proposedValue,
      });
      expect(model).toMatchObject({
        mode: "projected",
        afterVersionId: null,
        beforeVersionId: doc.versionId,
        beforeState: "candidate_confirmed",
        afterState: "not_saved",
        beforeConfirmationRecorded: true,
        afterConfirmationRecorded: null,
        afterSourceReferenceCount: null,
        scoreValue: null,
        scoreDelta: null,
        qualificationCredit: "not_assessed",
      });
      expect(model.beforeSourceReferenceCount).toBe(fact.sources.length);
      expect(JSON.stringify({ doc, fact })).toBe(before);
      expect(model.changeKind).toBe(
        proposedValue === fact.value ? "unchanged" : "wording_changed",
      );
    },
  );
  it("reports exact existing warning differences and Unicode word counts, not quality gain", async () => {
    const { doc, fact } = await fixture();
    const proposedValue = "Senior architect built built services by 99% !!";
    const model = buildProjectedWritingComparison({
      baseVersionId: doc.versionId,
      fact,
      proposedValue,
    });
    expect(model.beforeWarnings).toEqual(
      checkWritingQuality(fact.value, fact.value).warnings,
    );
    expect(model.afterWarnings).toEqual(
      checkWritingQuality(proposedValue, fact.value).warnings,
    );
    expect(model.newWarnings).toEqual(model.afterWarnings);
    expect(model.resolvedWarnings).toEqual([]);
    expect(model.afterWordCount).toBe(7);
    expect(model.wordCountDelta).toBe(3);
    expect(model.scoreDelta).toBeNull();
  });
  it("shows resolved punctuation and repetition warnings without asserting factual support", async () => {
    const { doc, fact } = await fixture();
    const current = {
      ...fact,
      value: "Built built services !!",
      state: "unconfirmed" as const,
      confirmation: null,
    };
    const model = buildProjectedWritingComparison({
      baseVersionId: doc.versionId,
      fact: current,
      proposedValue: "Built services",
    });
    expect(model.resolvedWarnings).toEqual(
      checkWritingQuality(current.value, current.value).warnings,
    );
    expect(model.newWarnings).toEqual([]);
    expect(model.afterWarnings).toEqual([]);
    expect(model.qualificationCredit).toBe("not_assessed");
  });
  it("preserves actual saved identity and revisions in either direction", async () => {
    const { doc, fact } = await fixture();
    const next = reviseCanonical(doc, {
      operation: "edit",
      factId: fact.id,
      value: "Built useful services",
    });
    const forward = saved(doc, next, 9, 10);
    const reverse = saved(next, doc, 10, 9);
    expect(forward).toMatchObject({
      mode: "saved",
      beforeVersionId: doc.versionId,
      afterVersionId: next.versionId,
      beforeRevision: 9,
      afterRevision: 10,
      total: 1,
      remainingCount: 0,
    });
    expect(reverse).toMatchObject({
      beforeVersionId: next.versionId,
      afterVersionId: doc.versionId,
      beforeRevision: 10,
      afterRevision: 9,
    });
    expect(forward.items[0].wordCountDelta).toBe(
      -reverse.items[0].wordCountDelta!,
    );
    expect(forward.items[0]).toMatchObject({
      changeKind: "wording_changed",
      beforeConfirmationRecorded: true,
      afterConfirmationRecorded: false,
      afterSourceReferenceCount: 0,
    });
  });
  it("same-version comparison is an empty saved observation, not an accepted edit", async () => {
    const { doc } = await fixture();
    const model = saved(doc, doc, 4, 4);
    expect(model).toMatchObject({
      beforeVersionId: doc.versionId,
      afterVersionId: doc.versionId,
      items: [],
      total: 0,
      remainingCount: 0,
      beforeRevision: 4,
      afterRevision: 4,
      scoreValue: null,
      scoreDelta: null,
    });
  });
  it("separates confirmation-only records from wording changes", async () => {
    const f = await createRequirementContextFixture();
    const before = f.context.canonical.content;
    const after = reviseCanonical(before, {
      operation: "confirm",
      factId: f.targetFactId,
    });
    const model = saved(before, after);
    expect(model.items[0]).toMatchObject({
      changeKind: "record_only",
      beforeConfirmationRecorded: false,
      afterConfirmationRecorded: true,
      wordCountDelta: 0,
      newWarnings: [],
      resolvedWarnings: [],
    });
  });
  it.each(["type", "citation"])(
    "reports saved %s metadata without wording gains",
    async (kind) => {
      const { doc, fact } = await fixture();
      const after = structuredClone(doc);
      const target = after.facts.find((f) => f.id === fact.id)!;
      if (kind === "type") target.type = "metric";
      else target.sources = [];
      CanonicalResumeDraftSchema.parse(after);
      const model = saved(doc, after);
      expect(model.items[0]).toMatchObject({
        changeKind: "record_only",
        wordCountDelta: 0,
        newWarnings: [],
        resolvedWarnings: [],
        scoreDelta: null,
      });
      if (kind === "citation")
        expect(model.items[0].afterSourceReferenceCount).toBe(0);
    },
  );
  it("location-only changes preserve the unchanged raw fact comparison semantics", async () => {
    const { doc } = await fixture();
    const after = structuredClone(doc);
    after.sections.reverse();
    CanonicalResumeDraftSchema.parse(after);
    expect(compareCanonical(doc, after)).toEqual([]);
    expect(saved(doc, after).items).toEqual([]);
  });
  it("keeps added and removed absence explicit", async () => {
    const { doc, fact } = await fixture();
    const after = structuredClone(doc);
    after.facts.push({
      ...fact,
      id: id(901),
      state: "unconfirmed",
      confirmation: null,
      value: "Built extra services",
    });
    CanonicalResumeDraftSchema.parse(after);
    expect(saved(doc, after).items[0]).toMatchObject({
      changeKind: "added",
      beforeWordCount: null,
      wordCountDelta: null,
      beforeState: null,
      beforeSourceReferenceCount: null,
      beforeConfirmationRecorded: null,
    });
    expect(saved(after, doc).items[0]).toMatchObject({
      changeKind: "removed",
      afterWordCount: null,
      wordCountDelta: null,
      afterState: null,
      afterSourceReferenceCount: null,
      afterConfirmationRecorded: null,
    });
  });
  it("caps diagnostics at50 but preserves raw ordering, total, remaining and immutable input", async () => {
    const { doc, fact } = await fixture();
    const after = structuredClone(doc);
    for (let i = 0; i < 55; i++)
      after.facts.push({
        ...fact,
        id: id(1000 + i),
        value: `Built service ${i}`,
        state: "unconfirmed",
        confirmation: null,
      });
    CanonicalResumeDraftSchema.parse(after);
    const changes = compareCanonical(doc, after);
    const original = JSON.stringify({ doc, after, changes });
    const model = buildSavedWritingComparison({
      before: doc,
      after,
      beforeRevision: 1,
      afterRevision: 2,
      changes,
    });
    expect(model.items).toHaveLength(50);
    expect(model.total).toBe(55);
    expect(model.remainingCount).toBe(5);
    expect(model.items.map((i) => i.factId)).toEqual(
      changes.slice(0, 50).map((c) => c.id),
    );
    expect(JSON.stringify({ doc, after, changes })).toBe(original);
    expect(saved(doc, after)).toEqual(model);
  });
  it.each([
    "ownerId",
    "organizationId",
    "resumeId",
    "analysisId",
    "inputSha256",
    "sourceEvidenceVersionId",
    "retentionPolicyId",
  ] as const)("refuses a saved %s mismatch", async (key) => {
    const { doc } = await fixture();
    const after = {
      ...doc,
      [key]:
        key === "inputSha256"
          ? "f".repeat(64)
          : key === "retentionPolicyId"
            ? "different/1.0.0"
            : id(999),
    };
    expect(() =>
      buildSavedWritingComparison({
        before: doc,
        after,
        beforeRevision: 1,
        afterRevision: 2,
        changes: [],
      }),
    ).toThrow("WRITING_COMPARISON_INVALID");
  });
  it.each(["omitted", "duplicated", "substituted"])(
    "rejects %s comparison rows",
    async (kind) => {
      const { doc, fact } = await fixture();
      const after = reviseCanonical(doc, {
        operation: "edit",
        factId: fact.id,
        value: "Built useful services",
      });
      const changes = compareCanonical(doc, after);
      if (kind === "omitted") changes.length = 0;
      if (kind === "duplicated") changes.push(changes[0]);
      if (kind === "substituted") changes[0] = { ...changes[0], before: null };
      expect(() =>
        buildSavedWritingComparison({
          before: doc,
          after,
          beforeRevision: 1,
          afterRevision: 2,
          changes,
        }),
      ).toThrow();
    },
  );
  it.each([
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ])("preserves schema-valid UUID compatibility: %s", async (versionId) => {
    const { doc, fact } = await fixture();
    const actual = CanonicalResumeDraftSchema.parse({ ...doc, versionId });
    expect(
      buildProjectedWritingComparison({
        baseVersionId: versionId,
        fact,
        proposedValue: fact.value,
      }).beforeVersionId,
    ).toBe(versionId);
    expect(saved(actual, actual).beforeVersionId).toBe(versionId);
  });
  it.each(["", " ", "a".repeat(2001)])(
    "rejects unbounded or empty proposed text",
    async (proposedValue) => {
      const { doc, fact } = await fixture();
      expect(() =>
        buildProjectedWritingComparison({
          baseVersionId: doc.versionId,
          fact,
          proposedValue,
        }),
      ).toThrow();
    },
  );
  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid saved revision %s",
    async (beforeRevision) => {
      const { doc } = await fixture();
      expect(() => saved(doc, doc, beforeRevision, 1)).toThrow();
    },
  );
});
