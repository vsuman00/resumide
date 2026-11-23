import { z } from "zod";
import { importCanonicalEvidence } from "./canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";
import { DocumentEvidenceSchema } from "./document-evidence";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import type { OwnedEvidenceBinding } from "./evidence-targets";

export const GROUPED_ORIGINAL_PRODUCER_VERSION =
  "canonical-engine/1.0.3" as const;
const uuid = z.uuid();
const identifier = z.string().min(1).max(200);
const offset = z.number().int().nonnegative().max(500_000);
const citation = z.strictObject({
  spanId: identifier,
  pageId: identifier,
  method: z.enum(["native_text", "local_ocr"]),
  start: offset,
  end: offset,
  pageStart: offset,
  pageEnd: offset,
});
const member = z.strictObject({
  observationId: identifier,
  assertionId: identifier,
  targetId: identifier,
  field: z.enum(["employer", "role", "dates"]),
  citations: z.array(citation).length(1),
});
const bindingSchema = z.strictObject({
  ownerId: uuid,
  organizationId: uuid,
  resumeId: uuid,
  analysisId: uuid,
  sourceId: uuid,
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  attemptId: uuid,
  evidenceSchemaVersion: z.literal("evidence/2.0.0"),
  fieldExtractorVersion: z.literal("evidence-fields/1.0.1"),
  targetModelVersion: z.literal("evidence-targets/1.0.0"),
  associationModelVersion: z.literal("evidence-entry-associations/1.0.0"),
  producerVersion: z.literal(GROUPED_ORIGINAL_PRODUCER_VERSION),
  canonicalHeadId: z.null(),
});
export const GroupedOriginalImportIntentSchema = z.strictObject({
  schemaVersion: z.literal("grouped-original-selection/1.0.0"),
  binding: bindingSchema,
  acknowledgement: z.literal("relationship_only_not_fact_confirmation"),
  unselectedDisposition: z.literal("retain_original"),
  selections: z
    .array(
      z.strictObject({
        groupId: identifier,
        members: z.array(member).min(2).max(3),
      }),
    )
    .min(1)
    .max(32),
});
export type GroupedOriginalImportIntent = z.infer<
  typeof GroupedOriginalImportIntentSchema
>;
type Selection = GroupedOriginalImportIntent["selections"][number];
type Fact = CanonicalResumeDraft["facts"][number];
type Section = CanonicalResumeDraft["sections"][number];
type Entry = Section["entries"][number];
type Mapping = {
  groupId: string;
  sectionId: string;
  entryId: string;
  members: {
    observationId: string;
    assertionId: string;
    targetId: string;
    field: Selection["members"][number]["field"];
    factId: string;
    originalEntryId: string;
  }[];
};
type AssociationReceipt = {
  schemaVersion: "grouped-original-preparation/1.0.0";
  authority: "derived_preparation_only";
  verified: false;
  requiresDurableAdmission: true;
  binding: GroupedOriginalImportIntent["binding"];
  effectiveLocale: string;
  acknowledgement: GroupedOriginalImportIntent["acknowledgement"];
  unselectedDisposition: "retain_original";
  selections: Selection[];
  mappings: Mapping[];
};
export type GroupedOriginalPreparation = {
  persistable: false;
  scoringEligible: false;
} & (
  | {
      state: "prepared";
      document: CanonicalResumeDraft;
      associationReceipt: AssociationReceipt;
      unavailableReason: null;
    }
  | {
      state: "unavailable";
      document: null;
      associationReceipt: null;
      unavailableReason:
        | "invalid_intent"
        | "resource_limit"
        | "association_unavailable"
        | "binding_mismatch"
        | "selection_mismatch"
        | "unsafe_mapping"
        | "import_limits";
    }
);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function overIntentBudget(raw: unknown) {
  if (object(raw) && Array.isArray(raw.selections)) {
    if (raw.selections.length > 32) return true;
    for (const selection of raw.selections) {
      if (!object(selection) || !Array.isArray(selection.members)) continue;
      if (selection.members.length > 3) return true;
      for (const value of selection.members)
        if (
          object(value) &&
          Array.isArray(value.citations) &&
          value.citations.length > 1
        )
          return true;
    }
  }
  const pending = [{ value: raw, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++visited > 4096 || item.depth > 8) return true;
    if (typeof item.value === "string" && item.value.length > 200) return true;
    if (Array.isArray(item.value)) {
      if (item.value.length > 32) return true;
      for (const value of item.value)
        pending.push({ value, depth: item.depth + 1 });
    } else if (object(item.value)) {
      const keys = Object.keys(item.value);
      if (keys.length > 16 || keys.some((key) => key.length > 100)) return true;
      for (const key of keys)
        pending.push({ value: item.value[key], depth: item.depth + 1 });
    }
  }
  return false;
}
function fail(
  unavailableReason: Extract<
    GroupedOriginalPreparation,
    { state: "unavailable" }
  >["unavailableReason"],
): GroupedOriginalPreparation {
  return {
    state: "unavailable",
    persistable: false,
    scoringEligible: false,
    document: null,
    associationReceipt: null,
    unavailableReason,
  };
}
function memberKey(value: Selection["members"][number]) {
  return JSON.stringify([
    value.observationId,
    value.assertionId,
    value.targetId,
    value.field,
    value.citations.map((cite) => [
      cite.spanId,
      cite.pageId,
      cite.method,
      cite.start,
      cite.end,
      cite.pageStart,
      cite.pageEnd,
    ]),
  ]);
}
function factKey(type: string, value: string, sources: Fact["sources"]) {
  return JSON.stringify([
    type,
    value,
    sources.map((source) => [
      source.attemptId,
      source.spanId,
      source.start,
      source.end,
    ]),
  ]);
}

/** Source-only first-import preparation. A relationship intent is neither an
 * authenticated decision nor factual confirmation, CAS or permission to save. */
export function importCanonicalGroupedEvidence(
  raw: unknown,
  owned: OwnedEvidenceBinding & {
    resumeId: string;
    organizationId: string;
    locale?: string;
  },
  intent: GroupedOriginalImportIntent,
): GroupedOriginalPreparation {
  if (overIntentBudget(intent)) return fail("resource_limit");
  const parsedIntent = GroupedOriginalImportIntentSchema.safeParse(intent);
  if (!parsedIntent.success) return fail("invalid_intent");
  if (
    new TextEncoder().encode(JSON.stringify(parsedIntent.data)).byteLength >
    128 * 1024
  )
    return fail("resource_limit");
  const preliminary = deriveEvidenceEntryAssociations(raw, owned);
  if (preliminary.state !== "review_required")
    return fail("association_unavailable");
  const parsedEvidence = DocumentEvidenceSchema.safeParse(raw);
  if (!parsedEvidence.success) return fail("association_unavailable");
  const evidence = parsedEvidence.data;
  // Recompute from the captured parsed value, never a caller's group DTO/draft.
  const associations = deriveEvidenceEntryAssociations(evidence, owned);
  if (associations.state !== "review_required")
    return fail("association_unavailable");
  const expectedBinding = bindingSchema.safeParse({
    ...associations.binding,
    organizationId: owned.organizationId,
    resumeId: owned.resumeId,
    associationModelVersion: associations.modelVersion,
    producerVersion: GROUPED_ORIGINAL_PRODUCER_VERSION,
    canonicalHeadId: null,
  });
  if (
    !expectedBinding.success ||
    JSON.stringify(parsedIntent.data.binding) !==
      JSON.stringify(expectedBinding.data)
  )
    return fail("binding_mismatch");
  const byGroup = new Map(
    associations.groups.map((group) => [group.id, group]),
  );
  const selectedIds = new Set<string>();
  const selectedObservations = new Set<string>();
  for (const selection of parsedIntent.data.selections) {
    const group = byGroup.get(selection.groupId);
    if (
      !group ||
      selectedIds.has(group.id) ||
      selection.members.length !== group.members.length
    )
      return fail("selection_mismatch");
    const expectedMembers = new Map(
      group.members.map((value) => [value.observationId, member.parse(value)]),
    );
    const receivedIds = new Set<string>();
    for (const value of selection.members) {
      const expected = expectedMembers.get(value.observationId);
      if (
        !expected ||
        receivedIds.has(value.observationId) ||
        selectedObservations.has(value.observationId) ||
        memberKey(value) !== memberKey(expected)
      )
        return fail("selection_mismatch");
      receivedIds.add(value.observationId);
      selectedObservations.add(value.observationId);
    }
    selectedIds.add(group.id);
  }
  const selections: Selection[] = associations.groups
    .filter((group) => selectedIds.has(group.id))
    .map((group) => ({
      groupId: group.id,
      members: group.members.map((value) => member.parse(value)),
    }));
  let document: CanonicalResumeDraft;
  try {
    document = importCanonicalEvidence(evidence, owned);
  } catch {
    return fail("import_limits");
  }
  const factsBySource = new Map<string, Fact[]>();
  for (const fact of document.facts) {
    const key = factKey(fact.type, fact.value, fact.sources);
    const values = factsBySource.get(key) ?? [];
    values.push(fact);
    factsBySource.set(key, values);
  }
  const assertions = new Map(
    evidence.assertions.map((value) => [value.id, value]),
  );
  const locations = new Map<
    string,
    { section: Section; entry: Entry; index: number }[]
  >();
  const nonEntry = new Set(document.contactFactIds);
  for (const section of document.sections) {
    for (const factId of section.factIds) nonEntry.add(factId);
    for (const [index, entry] of section.entries.entries()) {
      for (const factId of entry.factIds) {
        const values = locations.get(factId) ?? [];
        values.push({ section, entry, index });
        locations.set(factId, values);
      }
      for (const bullet of entry.bullets)
        for (const factId of bullet.factIds) nonEntry.add(factId);
    }
  }
  const mappings: Mapping[] = [];
  const assignedFacts = new Set<string>();
  const merged = new Map<string, string[]>();
  const removed = new Set<string>();
  for (const selection of selections) {
    const matches: {
      value: Selection["members"][number];
      fact: Fact;
      location: { section: Section; entry: Entry; index: number };
    }[] = [];
    for (const value of selection.members) {
      const assertion = assertions.get(value.assertionId);
      if (!assertion || assertion.field !== value.field)
        return fail("unsafe_mapping");
      const sources = assertion.evidence.map((cite) => ({
        attemptId: evidence.id,
        ...cite,
      }));
      const facts =
        factsBySource.get(factKey(assertion.field, assertion.value, sources)) ??
        [];
      if (facts.length !== 1 || assignedFacts.has(facts[0].id))
        return fail("unsafe_mapping");
      const fact = facts[0];
      const places = locations.get(fact.id) ?? [];
      if (
        places.length !== 1 ||
        nonEntry.has(fact.id) ||
        fact.state !== "unconfirmed" ||
        fact.confirmation !== null
      )
        return fail("unsafe_mapping");
      const location = places[0];
      if (
        location.section.type !== "experience" ||
        location.entry.factIds.length !== 1 ||
        location.entry.bullets.length !== 0
      )
        return fail("unsafe_mapping");
      matches.push({ value, fact, location });
      assignedFacts.add(fact.id);
    }
    const anchor = matches.find((value) => value.value.field === "employer");
    if (
      !anchor ||
      matches.some(
        (value) => value.location.section.id !== anchor.location.section.id,
      )
    )
      return fail("unsafe_mapping");
    const ordered = [...matches].sort(
      (a, b) => a.location.index - b.location.index,
    );
    if (ordered[0] !== anchor) return fail("unsafe_mapping");
    merged.set(
      anchor.location.entry.id,
      ordered.map((value) => value.fact.id),
    );
    for (const value of ordered)
      if (value !== anchor) removed.add(value.location.entry.id);
    mappings.push({
      groupId: selection.groupId,
      sectionId: anchor.location.section.id,
      entryId: anchor.location.entry.id,
      members: ordered.map(({ value, fact, location }) => ({
        observationId: value.observationId,
        assertionId: value.assertionId,
        targetId: value.targetId,
        field: value.field,
        factId: fact.id,
        originalEntryId: location.entry.id,
      })),
    });
  }
  for (const section of document.sections)
    section.entries = section.entries
      .filter((entry) => !removed.has(entry.id))
      .map((entry) =>
        merged.has(entry.id)
          ? { ...entry, factIds: merged.get(entry.id)! }
          : entry,
      );
  document.producerVersion = GROUPED_ORIGINAL_PRODUCER_VERSION;
  const validated = CanonicalResumeDraftSchema.safeParse(document);
  if (!validated.success) return fail("import_limits");
  return {
    state: "prepared",
    persistable: false,
    scoringEligible: false,
    document: validated.data,
    unavailableReason: null,
    associationReceipt: {
      schemaVersion: "grouped-original-preparation/1.0.0",
      authority: "derived_preparation_only",
      verified: false,
      requiresDurableAdmission: true,
      binding: expectedBinding.data,
      effectiveLocale: validated.data.locale,
      acknowledgement: parsedIntent.data.acknowledgement,
      unselectedDisposition: "retain_original",
      selections,
      mappings,
    },
  };
}
