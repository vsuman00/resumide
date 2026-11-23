import { z } from "zod";
import { checkWritingQuality } from "./writing-quality";
import type { CanonicalResumeDraft } from "./server/canonical-resume-schema";
import type { compareCanonical } from "./server/canonical-content";

type CanonicalFact = CanonicalResumeDraft["facts"][number];
export type WritingComparison = {
  schemaVersion: "writing-comparison/1.0.0";
  mode: "projected" | "saved";
  factId: string;
  beforeVersionId: string;
  afterVersionId: string | null;
  changeKind:
    "wording_changed" | "record_only" | "added" | "removed" | "unchanged";
  beforeWordCount: number | null;
  afterWordCount: number | null;
  wordCountDelta: number | null;
  beforeWarnings: string[];
  afterWarnings: string[];
  newWarnings: string[];
  resolvedWarnings: string[];
  beforeState: CanonicalFact["state"] | null;
  afterState: CanonicalFact["state"] | "not_saved" | null;
  beforeSourceReferenceCount: number | null;
  afterSourceReferenceCount: number | null;
  beforeConfirmationRecorded: boolean | null;
  afterConfirmationRecorded: boolean | null;
  scoreValue: null;
  scoreDelta: null;
  qualificationCredit: "not_assessed";
};
export type SavedWritingComparison = {
  schemaVersion: "saved-writing-comparison/1.0.0";
  mode: "saved";
  beforeVersionId: string;
  afterVersionId: string;
  beforeRevision: number;
  afterRevision: number;
  items: WritingComparison[];
  total: number;
  remainingCount: number;
  scoreValue: null;
  scoreDelta: null;
  qualificationCredit: "not_assessed";
};
const uuid = z.uuid();
const refuse = (): never => {
  throw Error("WRITING_COMPARISON_INVALID");
};
function validId(value: string) {
  if (typeof value !== "string" || !uuid.safeParse(value).success) refuse();
}
function validText(value: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2000 ||
    value.trim() !== value
  )
    refuse();
}
function validFact(fact: CanonicalFact) {
  validId(fact.id);
  validText(fact.value);
  if (
    !["source_supported", "candidate_confirmed", "unconfirmed"].includes(
      fact.state,
    ) ||
    !Array.isArray(fact.sources) ||
    fact.sources.length > 20
  )
    refuse();
}
const words = (value: string) => (value.match(/[\p{L}\p{N}]+/gu) ?? []).length;
function observe(input: {
  before: CanonicalFact | null;
  after: CanonicalFact | null;
  factId: string;
  beforeVersionId: string;
  afterVersionId: string | null;
  mode: "saved" | "projected";
}): WritingComparison {
  const { before, after } = input;
  const beforeWarnings = before
    ? checkWritingQuality(before.value, before.value).warnings
    : [];
  const afterWarnings = after
    ? checkWritingQuality(after.value, before?.value ?? after.value).warnings
    : [];
  const beforeWordCount = before ? words(before.value) : null;
  const afterWordCount = after ? words(after.value) : null;
  return {
    schemaVersion: "writing-comparison/1.0.0",
    mode: input.mode,
    factId: input.factId,
    beforeVersionId: input.beforeVersionId,
    afterVersionId: input.afterVersionId,
    changeKind: !before
      ? "added"
      : !after
        ? "removed"
        : before.value !== after.value
          ? "wording_changed"
          : input.mode === "saved" &&
              JSON.stringify(before) !== JSON.stringify(after)
            ? "record_only"
            : "unchanged",
    beforeWordCount,
    afterWordCount,
    wordCountDelta:
      beforeWordCount === null || afterWordCount === null
        ? null
        : afterWordCount - beforeWordCount,
    beforeWarnings,
    afterWarnings,
    newWarnings: afterWarnings.filter((w) => !beforeWarnings.includes(w)),
    resolvedWarnings: beforeWarnings.filter((w) => !afterWarnings.includes(w)),
    beforeState: before?.state ?? null,
    afterState:
      input.mode === "projected" ? "not_saved" : (after?.state ?? null),
    beforeSourceReferenceCount: before?.sources.length ?? null,
    afterSourceReferenceCount:
      input.mode === "projected" ? null : (after?.sources.length ?? null),
    beforeConfirmationRecorded: before ? before.confirmation !== null : null,
    afterConfirmationRecorded:
      input.mode === "projected"
        ? null
        : after
          ? after.confirmation !== null
          : null,
    scoreValue: null,
    scoreDelta: null,
    qualificationCredit: "not_assessed",
  };
}
/** Wording observations only; the proposed value receives no saved provenance or confirmation. */
export function buildProjectedWritingComparison(input: {
  baseVersionId: string;
  fact: CanonicalFact;
  proposedValue: string;
}): WritingComparison {
  validId(input.baseVersionId);
  validFact(input.fact);
  validText(input.proposedValue);
  // The temporary value supplies text only. observe never reads its authority in projected mode.
  const proposed: CanonicalFact = {
    id: input.fact.id,
    type: input.fact.type,
    value: input.proposedValue,
    state: "unconfirmed",
    sources: [],
    confirmation: null,
  };
  return observe({
    before: input.fact,
    after: proposed,
    factId: input.fact.id,
    beforeVersionId: input.baseVersionId,
    afterVersionId: null,
    mode: "projected",
  });
}
/** Compare selected saved versions in either direction; no accepted-transition or chronology inference. */
export function buildSavedWritingComparison(input: {
  before: CanonicalResumeDraft;
  after: CanonicalResumeDraft;
  beforeRevision: number;
  afterRevision: number;
  changes: ReturnType<typeof compareCanonical>;
}): SavedWritingComparison {
  const { before, after, changes } = input;
  for (const doc of [before, after]) {
    validId(doc.versionId);
    if (!Array.isArray(doc.facts) || doc.facts.length > 1000) refuse();
    doc.facts.forEach(validFact);
    if (new Set(doc.facts.map((f) => f.id)).size !== doc.facts.length) refuse();
  }
  for (const key of [
    "ownerId",
    "resumeId",
    "organizationId",
    "analysisId",
    "inputSha256",
    "sourceEvidenceVersionId",
    "retentionPolicyId",
  ] as const)
    if (before[key] !== after[key]) refuse();
  if (
    !Number.isSafeInteger(input.beforeRevision) ||
    input.beforeRevision < 1 ||
    !Number.isSafeInteger(input.afterRevision) ||
    input.afterRevision < 1 ||
    !Array.isArray(changes) ||
    changes.length > 2000
  )
    refuse();
  const prior = new Map(before.facts.map((f) => [f.id, f]));
  const next = new Map(after.facts.map((f) => [f.id, f]));
  const changedIds = new Set(
    [...prior.keys(), ...next.keys()].filter(
      (id) =>
        JSON.stringify(prior.get(id) ?? null) !==
        JSON.stringify(next.get(id) ?? null),
    ),
  );
  if (changes.length !== changedIds.size) refuse();
  for (const row of changes) {
    if (
      !changedIds.delete(row.id) ||
      JSON.stringify(row.before) !==
        JSON.stringify(prior.get(row.id) ?? null) ||
      JSON.stringify(row.after) !== JSON.stringify(next.get(row.id) ?? null)
    )
      refuse();
  }
  return {
    schemaVersion: "saved-writing-comparison/1.0.0",
    mode: "saved",
    beforeVersionId: before.versionId,
    afterVersionId: after.versionId,
    beforeRevision: input.beforeRevision,
    afterRevision: input.afterRevision,
    items: changes.slice(0, 50).map((row) =>
      observe({
        before: row.before,
        after: row.after,
        factId: row.id,
        beforeVersionId: before.versionId,
        afterVersionId: after.versionId,
        mode: "saved",
      }),
    ),
    total: changes.length,
    remainingCount: Math.max(0, changes.length - 50),
    scoreValue: null,
    scoreDelta: null,
    qualificationCredit: "not_assessed",
  };
}
