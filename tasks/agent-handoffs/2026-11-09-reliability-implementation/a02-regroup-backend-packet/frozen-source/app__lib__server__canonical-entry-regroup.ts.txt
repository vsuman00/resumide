import { createHash } from "node:crypto";
import { z } from "zod";
import {
  projectCanonicalCorrectionSourceChoices,
  type CanonicalCorrectionProjectionInput,
  type CanonicalCorrectionSourceChoice,
} from "./canonical-corrections";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import { hashGroupedImportCommandAtoms } from "./grouped-import-command-codec";
import type { CanonicalResumeDraft } from "./canonical-resume-schema";

export type CanonicalEntryRegroupInput = CanonicalCorrectionProjectionInput & {
  canonicalRevision: number;
};
const uuid = z.uuid().regex(/^[a-f0-9-]+$/);
const revision = z.number().int().min(1).max(2_147_483_647);
const intentSchema = z.strictObject({
  schemaVersion: z.literal("canonical-entry-regroup-intent/1.0.0"),
  operation: z.literal("preview_whole_entry_merge"),
  baseVersionId: uuid,
  baseRevision: revision,
  selections: z
    .array(
      z.strictObject({
        groupId: z.string().regex(/^entry-association-[a-f0-9]{64}$/),
        members: z
          .array(
            z.strictObject({
              assertionId: z.string().min(1).max(100),
              factId: uuid,
            }),
          )
          .min(2)
          .max(3),
      }),
    )
    .min(1)
    .max(32),
});
export type CanonicalEntryRegroupIntent = z.infer<typeof intentSchema>;
type Section = CanonicalResumeDraft["sections"][number];
type Entry = Section["entries"][number];
export type CanonicalEntryRegroupMember = {
  observationId: string;
  assertionId: string;
  targetId: string;
  field: "employer" | "role" | "dates";
  factId: string;
  sourceValue: string;
  currentValue: string;
  sourceCitations: {
    attemptId: string;
    spanId: string;
    pageId: string;
    method: "native_text" | "local_ocr";
    start: number;
    end: number;
    pageStart: number;
    pageEnd: number;
  }[];
  mappedThrough: CanonicalCorrectionSourceChoice["mappedThrough"];
  originVersionId: string | null;
  originFactId: string | null;
  location: {
    kind: "entry" | "bullet";
    sectionId: string;
    entryId: string;
    bulletId: string | null;
  };
};
export type CanonicalEntryRegroupGroup = {
  groupId: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  sectionId: string;
  anchorEntryId: string;
  insertionIndex: number;
  affectedEntryIds: string[];
  members: CanonicalEntryRegroupMember[];
};
export type CanonicalEntryRegroupRetiredMapping = {
  groupId: string;
  sectionId: string;
  retiredEntryId: string;
  anchorEntryId: string;
};
export type CanonicalEntryRegroupReason =
  | "invalid_intent"
  | "invalid_snapshot"
  | "binding_mismatch"
  | "association_unavailable"
  | "selection_mismatch"
  | "ambiguous_mapping"
  | "unsafe_placement"
  | "overlapping_groups"
  | "foreign_header"
  | "resource_limit";
const flags = {
  modelVersion: "canonical-entry-regroup/1.0.0",
  authority: "derived_preparation_only",
  persistable: false,
  scoringEligible: false,
  requiresDurableAdmission: true,
  requiredProducerVersion: "canonical-engine/1.0.4",
} as const;
export type CanonicalEntryRegroupPreparation = typeof flags &
  (
    | {
        state: "prepared";
        baseVersionId: string;
        baseRevision: number;
        locale: string;
        facts: CanonicalResumeDraft["facts"];
        beforeSections: Section[];
        afterSections: Section[];
        groups: CanonicalEntryRegroupGroup[];
        mappings: CanonicalEntryRegroupRetiredMapping[];
        retiredEntryIds: string[];
        changed: boolean;
        contentDigest: string;
        previewHash: string;
      }
    | { state: "unavailable"; reason: CanonicalEntryRegroupReason }
  );
const fail = (
  reason: CanonicalEntryRegroupReason,
): CanonicalEntryRegroupPreparation => ({
  ...flags,
  state: "unavailable",
  reason,
});
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function record(v: unknown, keys: readonly string[]) {
  if (!object(v)) return false;
  let count = 0;
  for (const key in v) {
    if (!Object.hasOwn(v, key)) continue;
    if (++count > keys.length || !keys.includes(key)) return false;
    if (typeof v[key] === "string" && v[key].length > 200) return false;
  }
  return count === keys.length;
}
function boundedIntent(raw: unknown) {
  if (
    !record(raw, [
      "schemaVersion",
      "operation",
      "baseVersionId",
      "baseRevision",
      "selections",
    ]) ||
    !object(raw) ||
    !Array.isArray(raw.selections) ||
    raw.selections.length < 1 ||
    raw.selections.length > 32
  )
    return false;
  for (let i = 0; i < raw.selections.length; i++) {
    if (!Object.hasOwn(raw.selections, i)) return false;
    const selection = raw.selections[i];
    if (
      !record(selection, ["groupId", "members"]) ||
      !object(selection) ||
      !Array.isArray(selection.members) ||
      selection.members.length < 2 ||
      selection.members.length > 3
    )
      return false;
    for (let j = 0; j < selection.members.length; j++)
      if (
        !Object.hasOwn(selection.members, j) ||
        !record(selection.members[j], ["assertionId", "factId"])
      )
        return false;
  }
  return true;
}
function sectionsTuple(sections: Section[]) {
  return sections.map((s) => [
    s.id,
    s.type,
    s.title,
    s.factIds,
    s.entries.map((e) => [
      e.id,
      e.factIds,
      e.bullets.map((b) => [b.id, b.text, b.factIds]),
    ]),
  ]);
}
function contentDigest(
  facts: CanonicalResumeDraft["facts"],
  before: Section[],
  after: Section[],
  groups: CanonicalEntryRegroupGroup[],
  mappings: CanonicalEntryRegroupRetiredMapping[],
  retired: string[],
) {
  const content = [
    facts.map((f) => [
      f.id,
      f.type,
      f.value,
      f.state,
      f.sources.map((c) => [c.attemptId, c.spanId, c.start, c.end]),
      f.confirmation
        ? [
            f.confirmation.actorId,
            f.confirmation.confirmedAt,
            f.confirmation.value,
          ]
        : null,
    ]),
    sectionsTuple(before),
    sectionsTuple(after),
    groups.map((g) => [
      g.groupId,
      g.pageId,
      g.method,
      g.sectionId,
      g.anchorEntryId,
      g.insertionIndex,
      g.affectedEntryIds,
      g.members.map((m) => [
        m.observationId,
        m.assertionId,
        m.targetId,
        m.field,
        m.factId,
        m.sourceValue,
        m.currentValue,
        m.sourceCitations.map((c) => [
          c.attemptId,
          c.spanId,
          c.pageId,
          c.method,
          c.start,
          c.end,
          c.pageStart,
          c.pageEnd,
        ]),
        m.mappedThrough,
        m.originVersionId,
        m.originFactId,
        [
          m.location.kind,
          m.location.sectionId,
          m.location.entryId,
          m.location.bulletId,
        ],
      ]),
    ]),
    mappings.map((m) => [
      m.groupId,
      m.sectionId,
      m.retiredEntryId,
      m.anchorEntryId,
    ]),
    retired,
  ];
  return createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");
}

/** Pure preparation only. The caller supplies an owned snapshot/revision;
 * this function cannot authenticate that caller, approve a relationship or save. */
export function prepareCanonicalEntryRegroup(
  input: CanonicalEntryRegroupInput,
  intent: unknown,
): CanonicalEntryRegroupPreparation {
  if (!boundedIntent(intent)) return fail("invalid_intent");
  const parsed = intentSchema.safeParse(intent);
  if (!parsed.success) return fail("invalid_intent");
  const request = parsed.data;
  const seenGroups = new Set<string>(),
    seenAssertions = new Set<string>(),
    seenFacts = new Set<string>();
  for (const selection of request.selections) {
    if (seenGroups.has(selection.groupId)) return fail("invalid_intent");
    seenGroups.add(selection.groupId);
    for (const member of selection.members) {
      if (
        seenAssertions.has(member.assertionId) ||
        seenFacts.has(member.factId)
      )
        return fail("invalid_intent");
      seenAssertions.add(member.assertionId);
      seenFacts.add(member.factId);
    }
  }
  if (
    !object(input) ||
    !object(input.canonicalSnapshot) ||
    !object(input.canonicalSnapshot.current) ||
    !object(input.review) ||
    !object(input.ownedContext) ||
    !object(input.expectedBinding) ||
    !revision.safeParse(input.canonicalRevision).success
  )
    return fail("invalid_snapshot");
  if (
    request.baseRevision !== input.canonicalRevision ||
    request.baseVersionId !== input.canonicalSnapshot.headId ||
    request.baseVersionId !== input.canonicalSnapshot.current?.versionId
  )
    return fail("binding_mismatch");
  // Existing helper bounds unknown evidence before the existing projection replays it.
  const associations = deriveEvidenceEntryAssociations(
    input.review.evidence,
    input.ownedContext,
  );
  if (associations.state !== "review_required")
    return fail("association_unavailable");
  let choices: ReturnType<typeof projectCanonicalCorrectionSourceChoices>;
  try {
    choices = projectCanonicalCorrectionSourceChoices(input);
  } catch (error) {
    return fail(
      error instanceof Error && error.message.endsWith("_LIMIT")
        ? "resource_limit"
        : "invalid_snapshot",
    );
  }
  const current = input.canonicalSnapshot.current;
  const facts = new Map(current.facts.map((f) => [f.id, f]));
  const observations = new Map(
    input.review.targets.observations.map((o) => [o.id, o]),
  );
  const selections = new Map(request.selections.map((s) => [s.groupId, s]));
  const sourceGroups = associations.groups.filter((g) => selections.has(g.id));
  if (sourceGroups.length !== selections.size)
    return fail("selection_mismatch");
  const entries = new Map<
    string,
    { section: Section; entry: Entry; index: number }
  >();
  for (const section of current.sections)
    for (const [index, entry] of section.entries.entries())
      entries.set(entry.id, { section, entry, index });
  const groups: CanonicalEntryRegroupGroup[] = [],
    mappings: CanonicalEntryRegroupRetiredMapping[] = [];
  const plans = new Map<
    string,
    { sectionId: string; index: number; anchor: Entry; affected: Set<string> }
  >();
  const usedEntries = new Set<string>();
  for (const group of sourceGroups) {
    const selection = selections.get(group.id)!;
    if (selection.members.length !== group.members.length)
      return fail("selection_mismatch");
    const requested = new Map(selection.members.map((m) => [m.assertionId, m]));
    const members: CanonicalEntryRegroupMember[] = [];
    for (const member of group.members) {
      const selected = requested.get(member.assertionId),
        observation = observations.get(member.observationId);
      if (
        !selected ||
        !observation ||
        observation.assertionId !== member.assertionId ||
        observation.targetId !== member.targetId ||
        (member.field !== "employer" &&
          member.field !== "role" &&
          member.field !== "dates")
      )
        return fail("selection_mismatch");
      const matches = (
        choices.choicesBySourceTarget.get(member.targetId) ?? []
      ).filter((c) => c.factId === selected.factId);
      if (matches.length !== 1 || matches[0].locations.length !== 1)
        return fail("ambiguous_mapping");
      const choice = matches[0],
        location = choice.locations[0],
        fact = facts.get(choice.factId);
      if (
        !fact ||
        fact.type !== member.field ||
        (location.kind !== "entry" && location.kind !== "bullet") ||
        location.sectionId === null ||
        location.entryId === null
      )
        return fail("unsafe_placement");
      const place = entries.get(location.entryId);
      if (
        !place ||
        place.section.id !== location.sectionId ||
        place.section.type !== "experience"
      )
        return fail("unsafe_placement");
      members.push({
        observationId: member.observationId,
        assertionId: member.assertionId,
        targetId: member.targetId,
        field: member.field,
        factId: fact.id,
        sourceValue: observation.value,
        currentValue: fact.value,
        sourceCitations: member.citations.map((c) => ({
          attemptId: input.ownedContext.attemptId,
          ...c,
        })),
        mappedThrough: choice.mappedThrough,
        originVersionId: choice.originVersionId,
        originFactId: choice.originFactId,
        location: {
          kind: location.kind,
          sectionId: location.sectionId,
          entryId: location.entryId,
          bulletId: location.bulletId,
        },
      });
    }
    const employer = members.find((m) => m.field === "employer");
    if (
      !employer ||
      members.some((m) => m.location.sectionId !== employer.location.sectionId)
    )
      return fail("unsafe_placement");
    const affected = [...new Set(members.map((m) => m.location.entryId))]
      .map((id) => entries.get(id)!)
      .sort((a, b) => a.index - b.index);
    if (affected.some((p) => usedEntries.has(p.entry.id)))
      return fail("overlapping_groups");
    const memberFacts = new Set(members.map((m) => m.factId));
    for (const { entry } of affected)
      for (const ref of [
        ...entry.factIds,
        ...entry.bullets.flatMap((b) => b.factIds),
      ]) {
        const fact = facts.get(ref)!;
        if (
          ["employer", "role", "dates"].includes(fact.type) &&
          !memberFacts.has(ref)
        )
          return fail("foreign_header");
      }
    const direct = affected.flatMap((p) => p.entry.factIds),
      bullets = affected.flatMap((p) => p.entry.bullets);
    if (direct.length > 100 || bullets.length > 100)
      return fail("resource_limit");
    if (new Set(direct).size !== direct.length) return fail("unsafe_placement");
    const anchorId = employer.location.entryId;
    groups.push({
      groupId: group.id,
      pageId: group.pageId,
      method: group.method,
      sectionId: employer.location.sectionId,
      anchorEntryId: anchorId,
      insertionIndex: affected[0].index,
      affectedEntryIds: affected.map((p) => p.entry.id),
      members,
    });
    for (const place of affected) {
      usedEntries.add(place.entry.id);
      if (place.entry.id !== anchorId)
        mappings.push({
          groupId: group.id,
          sectionId: place.section.id,
          retiredEntryId: place.entry.id,
          anchorEntryId: anchorId,
        });
    }
    plans.set(anchorId, {
      sectionId: employer.location.sectionId,
      index: affected[0].index,
      anchor: { id: anchorId, factIds: direct, bullets },
      affected: new Set(affected.map((p) => p.entry.id)),
    });
  }
  const beforeSections = structuredClone(current.sections);
  const afterSections = current.sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry, index) => {
      const plan = [...plans.values()].find(
        (p) => p.sectionId === section.id && p.index === index,
      );
      if (plan) return [plan.anchor];
      return usedEntries.has(entry.id) ? [] : [entry];
    }),
  }));
  const retiredEntryIds = mappings.map((m) => m.retiredEntryId);
  const digest = contentDigest(
    current.facts,
    beforeSections,
    afterSections,
    groups,
    mappings,
    retiredEntryIds,
  );
  const b = input.expectedBinding;
  const previewHash = hashGroupedImportCommandAtoms([
    "canonical-entry-regroup-preview/1.0.0",
    "preview_whole_entry_merge",
    b.ownerId,
    b.organizationId,
    b.resumeId,
    b.analysisId,
    b.sourceId,
    b.attemptId,
    b.inputSha256,
    b.evidenceSchemaVersion,
    b.fieldExtractorVersion,
    b.targetModelVersion,
    associations.modelVersion,
    b.projectionModelVersion,
    String(b.reviewRevision),
    request.baseVersionId,
    String(request.baseRevision),
    current.locale,
    digest,
  ]);
  return {
    ...flags,
    state: "prepared",
    baseVersionId: request.baseVersionId,
    baseRevision: request.baseRevision,
    locale: current.locale,
    facts: structuredClone(current.facts),
    beforeSections,
    afterSections: structuredClone(afterSections),
    groups,
    mappings,
    retiredEntryIds,
    changed:
      JSON.stringify(sectionsTuple(beforeSections)) !==
      JSON.stringify(sectionsTuple(afterSections)),
    contentDigest: digest,
    previewHash,
  };
}
