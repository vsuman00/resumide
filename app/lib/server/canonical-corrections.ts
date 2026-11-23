import { z } from "zod";
import { DocumentEvidenceSchema } from "./document-evidence";
import { CRITICAL_FIELDS, type EvidenceField } from "./evidence-fields";
import {
  EvidenceHistoryAttestationSchema,
  type EvidenceHistoryAttestation,
  type loadEvidenceReview,
} from "./evidence-review";
import {
  deriveEvidenceReviewTargets,
  EVIDENCE_TARGET_MODEL_VERSION,
  type EvidenceReviewTargets,
  type OwnedEvidenceBinding,
} from "./evidence-targets";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";

export const CANONICAL_CORRECTION_PROJECTION_VERSION =
  "canonical-corrections/1.0.1" as const;
const LIMITS = {
  events: 1000,
  selections: 1000,
  ancestors: 64,
  facts: 20_000,
  text: 2_000_000,
  references: 20_000,
};
type Review = Omit<
  Awaited<ReturnType<typeof loadEvidenceReview>>,
  "historyAttestation"
> & { historyAttestation?: EvidenceHistoryAttestation };
type Event = Review["corrections"][number];
type Fact = CanonicalResumeDraft["facts"][number];
type Citation = Fact["sources"][number];
type Observation = EvidenceReviewTargets["observations"][number];
type Context = OwnedEvidenceBinding & {
  resumeId: string;
  organizationId: string;
};
export type CanonicalCorrectionBinding = EvidenceReviewTargets["binding"] & {
  resumeId: string;
  organizationId: string;
  targetModelVersion: typeof EVIDENCE_TARGET_MODEL_VERSION;
  projectionModelVersion: typeof CANONICAL_CORRECTION_PROJECTION_VERSION;
  reviewRevision: number;
  canonicalHeadId: string | null;
};
/** Caller supplies current server-owned/replayed records, never browser snapshots.
 * This pure projection cannot authenticate a caller or authorize a write. */
export type CanonicalCorrectionProjectionInput = {
  review: Review;
  ownedContext: Context;
  expectedBinding: CanonicalCorrectionBinding;
  canonicalSnapshot: {
    sourceId: string;
    headId: string;
    current: CanonicalResumeDraft;
    ancestors: CanonicalResumeDraft[];
  } | null;
  selections?: Array<{
    eventId: string;
    sourceTargetId: string;
    canonicalFactId?: string;
  }>;
};
type Location = {
  kind: "contact" | "section" | "entry" | "bullet";
  sectionId: string | null;
  entryId: string | null;
  bulletId: string | null;
};
type CanonicalChoice = {
  factId: string;
  currentValue: string;
  locations: Location[];
  mappedThrough: "current_citations" | "owned_ancestor_chain";
};
export type CanonicalCorrectionSourceChoice = CanonicalChoice & {
  originVersionId: string | null;
  originFactId: string | null;
};
type SourceChoice = {
  targetId: string;
  assertionId: string;
  value: string;
  citations: Citation[];
};
type ItemState =
  | "mapped"
  | "ambiguous"
  | "requires_add"
  | "unmapped"
  | "stale"
  | "superseded"
  | "unchanged_provenance"
  | "blocked_by_newer_ambiguity";
type ProjectionItem = {
  event: Event;
  state: ItemState;
  effect: "candidate_authored_value" | "evidence_review_only";
  sourceTargetId: string | null;
  sourceChoices: SourceChoice[];
  canonicalChoices: CanonicalChoice[];
  canonicalTarget: CanonicalChoice | null;
  canonicalResolution: {
    state:
      "mapped" | "initial_import" | "ambiguous" | "unmapped" | "not_evaluated";
    reason: string | null;
  };
  currentValue: string | null;
  originalCitations: Citation[];
  proposedFact: {
    value: string;
    state: "unconfirmed";
    sources: [];
    confirmation: null;
    provenance: {
      kind: "candidate_authored_evidence_correction";
      eventId: string;
      actorId: string;
      revision: number;
      attemptId: string;
      sourceId: string;
      inputSha256: string;
      field: EvidenceField;
      targetId: string | null;
    };
  } | null;
  requiresExplicitReview: true;
  canonicalConfirmationGranted: false;
  supersededByEventId: string | null;
  blockedByEventIds: string[];
};
export type CanonicalCorrectionProjection = {
  modelVersion: typeof CANONICAL_CORRECTION_PROJECTION_VERSION;
  authority: "review_projection_only";
  materialized: false;
  scoringEligible: false;
  binding: CanonicalCorrectionBinding;
  history: Event[];
  historyCompleteness:
    "not_attested_by_read_model" | "complete_captured_prefix";
  historyAttestation: EvidenceHistoryAttestation | null;
  latestScope:
    | "supplied_contiguous_history_per_target"
    | "captured_contiguous_prefix_per_target";
  items: ProjectionItem[];
};

const critical = new Set<string>(CRITICAL_FIELDS);
const contact = new Set<string>(["name", "email", "phone"]);
function fail(code: string): never {
  throw Error(code);
}
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
function sourceKey(type: string, sources: readonly Citation[]) {
  return JSON.stringify([
    type,
    sources
      .map((source) => [
        source.attemptId,
        source.spanId,
        source.start,
        source.end,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}
function sourceCitations(
  observation: Observation,
  attemptId: string,
): Citation[] {
  return observation.citations.map(({ spanId, start, end }) => ({
    attemptId,
    spanId,
    start,
    end,
  }));
}
function validateHistory(review: Review, context: Context) {
  const ids = new Set<string>();
  if (
    !Number.isSafeInteger(review.revision) ||
    review.revision !== review.corrections.length
  )
    fail("CORRECTION_EVENT_INVALID");
  for (const [index, event] of review.corrections.entries()) {
    if (
      !z.uuid().safeParse(event.id).success ||
      ids.has(event.id) ||
      !z.uuid().safeParse(event.attempt_id).success ||
      event.owner_id !== context.ownerId ||
      event.actor_id !== context.ownerId ||
      event.analysis_id !== context.analysisId ||
      event.revision !== index + 1 ||
      event.expected_revision !== index ||
      !critical.has(event.field) ||
      !["confirm", "correct"].includes(event.operation) ||
      typeof event.value !== "string" ||
      !event.value.trim() ||
      event.value !== event.value.trim() ||
      event.value.length > 2000 ||
      !z.iso.datetime({ offset: true }).safeParse(event.created_at).success ||
      (event.operation === "confirm") !==
        (typeof event.candidate_id === "string" &&
          event.candidate_id.length > 0 &&
          event.candidate_id.length <= 100) ||
      (event.operation === "correct" && event.candidate_id !== null)
    )
      fail("CORRECTION_EVENT_INVALID");
    ids.add(event.id);
    if (
      event.attempt_id === context.attemptId &&
      event.operation === "confirm" &&
      !review.evidence.assertions.some(
        (candidate) =>
          candidate.id === event.candidate_id &&
          candidate.field === event.field &&
          candidate.value === event.value,
      )
    )
      fail("CORRECTION_EVENT_INVALID");
  }
}
function validateHistoryAttestation(
  review: Review,
  model: EvidenceReviewTargets,
): EvidenceHistoryAttestation | null {
  if (review.historyAttestation === undefined) return null;
  const parsed = EvidenceHistoryAttestationSchema.safeParse(
    review.historyAttestation,
  );
  if (
    !parsed.success ||
    !equal(parsed.data.binding, {
      ...model.binding,
      targetModelVersion: model.modelVersion,
    }) ||
    parsed.data.highWaterRevision !== review.revision ||
    parsed.data.receivedCount !== review.corrections.length ||
    parsed.data.highWaterEventId !== (review.corrections.at(-1)?.id ?? null)
  )
    fail("CORRECTION_HISTORY_ATTESTATION_INVALID");
  return parsed.data;
}
function admitCanonical(input: CanonicalCorrectionProjectionInput) {
  const snapshot = input.canonicalSnapshot;
  if (!snapshot) return 0;
  if (
    !Array.isArray(snapshot.ancestors) ||
    snapshot.ancestors.length > LIMITS.ancestors
  )
    fail("CORRECTION_PROJECTION_LIMIT");
  let facts = 0,
    text = 0,
    references = 0;
  const addReferences = (values: unknown, maximum: number) => {
    if (!Array.isArray(values) || values.length > maximum)
      fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
    references += values.length;
    if (references > LIMITS.references) fail("CORRECTION_PROJECTION_LIMIT");
  };
  const addText = (value: unknown) => {
    if (typeof value === "string") text += value.length;
    if (text > LIMITS.text) fail("CORRECTION_PROJECTION_LIMIT");
  };
  for (const doc of [snapshot.current, ...snapshot.ancestors]) {
    if (
      !doc ||
      !Array.isArray(doc.facts) ||
      !Array.isArray(doc.changes) ||
      !Array.isArray(doc.sections)
    )
      fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
    facts += doc.facts.length;
    if (facts > LIMITS.facts) fail("CORRECTION_PROJECTION_LIMIT");
    if (
      doc.facts.length > 1000 ||
      doc.changes.length > 1000 ||
      doc.sections.length > 30
    )
      fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
    addReferences(doc.contactFactIds, 20);
    for (const fact of doc.facts) {
      addText(fact?.value);
      addReferences(fact?.sources, 20);
    }
    for (const change of doc.changes) addText(change?.priorValue);
    for (const section of doc.sections) {
      addText(section?.title);
      addReferences(section?.factIds, 100);
      if (!Array.isArray(section?.entries) || section.entries.length > 100)
        fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
      for (const entry of section.entries) {
        addReferences(entry?.factIds, 100);
        if (!Array.isArray(entry?.bullets) || entry.bullets.length > 100)
          fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
        for (const bullet of entry.bullets) {
          addText(bullet?.text);
          addReferences(bullet?.factIds, 100);
        }
      }
    }
  }
  return references;
}
function canonicalData(
  input: CanonicalCorrectionProjectionInput,
  model: EvidenceReviewTargets,
) {
  const snapshot = input.canonicalSnapshot,
    context = input.ownedContext;
  if (!snapshot) return null;
  if (
    snapshot.sourceId !== context.sourceId ||
    snapshot.headId !== snapshot.current.versionId
  )
    fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
  const documents = [snapshot.current, ...snapshot.ancestors].map((raw) => {
    const parsed = CanonicalResumeDraftSchema.safeParse(raw);
    if (!parsed.success) return fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
    const doc = parsed.data;
    if (
      doc.ownerId !== context.ownerId ||
      doc.organizationId !== context.organizationId ||
      doc.resumeId !== context.resumeId ||
      doc.analysisId !== context.analysisId ||
      doc.inputSha256 !== context.inputSha256 ||
      doc.sourceEvidenceVersionId !== context.attemptId
    )
      fail("CORRECTION_CANONICAL_BINDING_MISMATCH");
    return doc;
  });
  const versionIds = new Map<string, number>();
  for (const [index, doc] of documents.entries()) {
    if (
      versionIds.has(doc.versionId) ||
      (index > 0 && documents[index - 1].parentVersionId !== doc.versionId)
    )
      fail("CORRECTION_CANONICAL_LINEAGE_INVALID");
    versionIds.set(doc.versionId, index);
  }
  for (const [index, doc] of documents.entries()) {
    const parentIndex =
      doc.parentVersionId === null
        ? undefined
        : versionIds.get(doc.parentVersionId);
    if (parentIndex !== undefined && parentIndex <= index)
      fail("CORRECTION_CANONICAL_LINEAGE_INVALID");
  }
  const current = documents[0];
  const factsByVersion = documents.map(
    (doc) => new Map(doc.facts.map((fact) => [fact.id, fact])),
  );
  const observationsBySource = new Map<string, Observation[]>();
  for (const observation of model.observations) {
    const key = sourceKey(
      observation.field,
      sourceCitations(observation, context.attemptId),
    );
    const values = observationsBySource.get(key) ?? [];
    values.push(observation);
    observationsBySource.set(key, values);
  }
  // Source-bearing critical records cannot use a quotation for a different
  // value. This does not invent proof for an unmatched/unknown citation set.
  for (const doc of documents)
    for (const fact of doc.facts) {
      if (!critical.has(fact.type) || !fact.sources.length) continue;
      const exact = observationsBySource.get(
        sourceKey(fact.type, fact.sources),
      );
      if (
        exact &&
        !exact.some((observation) => observation.value === fact.value)
      )
        fail("CORRECTION_CANONICAL_SOURCE_INVALID");
    }
  const locations = new Map<string, Location[]>();
  const addLocation = (factId: string, location: Location) => {
    const current = locations.get(factId) ?? [];
    current.push(location);
    locations.set(factId, current);
  };
  for (const factId of current.contactFactIds)
    addLocation(factId, {
      kind: "contact",
      sectionId: null,
      entryId: null,
      bulletId: null,
    });
  for (const section of current.sections) {
    for (const factId of section.factIds)
      addLocation(factId, {
        kind: "section",
        sectionId: section.id,
        entryId: null,
        bulletId: null,
      });
    for (const entry of section.entries) {
      for (const factId of entry.factIds)
        addLocation(factId, {
          kind: "entry",
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
        });
      for (const bullet of entry.bullets)
        for (const factId of bullet.factIds)
          addLocation(factId, {
            kind: "bullet",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: bullet.id,
          });
    }
  }
  const choicesByTarget = new Map<string, CanonicalChoice[]>();
  const originsByFact = new Map<
    string,
    { originVersionId: string | null; originFactId: string | null }
  >();
  for (const fact of current.facts) {
    if (!critical.has(fact.type)) continue;
    let origin: Fact | undefined = fact;
    let through: CanonicalChoice["mappedThrough"] = "current_citations";
    let originVersionId: string | null = null;
    if (!fact.sources.length) {
      origin = undefined;
      through = "owned_ancestor_chain";
      for (let index = 1; index < documents.length; index++) {
        const prior = factsByVersion[index].get(fact.id);
        // Never bridge a missing identity, changed type or parent link.
        if (!prior || prior.type !== fact.type) break;
        if (prior.sources.length) {
          origin = prior;
          originVersionId = documents[index].versionId;
          break;
        }
      }
    }
    if (!origin?.sources.length) continue;
    originsByFact.set(fact.id, {
      originVersionId,
      originFactId: originVersionId === null ? null : origin.id,
    });
    const observations =
      observationsBySource.get(sourceKey(origin.type, origin.sources)) ?? [];
    for (const observation of observations.filter(
      (value) => value.value === origin!.value,
    )) {
      const choices = choicesByTarget.get(observation.targetId) ?? [];
      choices.push({
        factId: fact.id,
        currentValue: fact.value,
        locations: locations.get(fact.id) ?? [],
        mappedThrough: through,
      });
      choicesByTarget.set(observation.targetId, choices);
    }
  }
  return {
    choicesByTarget,
    originsByFact,
    chainComplete: documents.at(-1)!.parentVersionId === null,
  };
}

function prepareCanonicalCorrections(
  input: CanonicalCorrectionProjectionInput,
) {
  const { review, ownedContext: context } = input;
  const selections = input.selections ?? [];
  if (
    !Array.isArray(review.corrections) ||
    review.corrections.length > LIMITS.events ||
    !Array.isArray(selections) ||
    selections.length > LIMITS.selections
  )
    fail("CORRECTION_PROJECTION_LIMIT");
  const canonicalReferences = admitCanonical(input);
  const parsed = DocumentEvidenceSchema.safeParse(review.evidence);
  if (
    !parsed.success ||
    review.analysisId !== context.analysisId ||
    review.attemptId !== context.attemptId ||
    !z.uuid().safeParse(context.resumeId).success ||
    !z.uuid().safeParse(context.organizationId).success
  )
    fail("CORRECTION_PROJECTION_SOURCE_INVALID");
  let model: EvidenceReviewTargets;
  try {
    model = deriveEvidenceReviewTargets(parsed.data, context);
  } catch {
    return fail("CORRECTION_PROJECTION_SOURCE_INVALID");
  }
  if (!equal(review.targets, model))
    fail("CORRECTION_PROJECTION_SOURCE_INVALID");
  validateHistory(review, context);
  const historyAttestation = validateHistoryAttestation(review, model);
  const canonical = canonicalData(input, model);
  const binding: CanonicalCorrectionBinding = {
    ...model.binding,
    resumeId: context.resumeId,
    organizationId: context.organizationId,
    targetModelVersion: EVIDENCE_TARGET_MODEL_VERSION,
    projectionModelVersion: CANONICAL_CORRECTION_PROJECTION_VERSION,
    reviewRevision: review.revision,
    canonicalHeadId: input.canonicalSnapshot?.headId ?? null,
  };
  if (
    !input.expectedBinding ||
    Object.keys(input.expectedBinding).length !== Object.keys(binding).length ||
    Object.entries(binding).some(
      ([key, value]) =>
        input.expectedBinding[key as keyof CanonicalCorrectionBinding] !==
        value,
    )
  )
    fail("CORRECTION_PROJECTION_BINDING_MISMATCH");
  const selectedByEvent = new Map<string, (typeof selections)[number]>();
  const eventById = new Map(
    review.corrections.map((event) => [event.id, event]),
  );
  for (const selection of selections) {
    const event = eventById.get(selection.eventId);
    if (
      !event ||
      event.attempt_id !== context.attemptId ||
      selectedByEvent.has(selection.eventId) ||
      Object.keys(selection).some(
        (key) =>
          !["eventId", "sourceTargetId", "canonicalFactId"].includes(key),
      ) ||
      !model.observations.some(
        (observation) =>
          observation.field === event.field &&
          observation.targetId === selection.sourceTargetId &&
          (event.operation !== "confirm" ||
            observation.assertionId === event.candidate_id),
      )
    )
      fail("CORRECTION_SELECTION_INVALID");
    selectedByEvent.set(selection.eventId, selection);
  }
  const byField = new Map<EvidenceField, Observation[]>(
    CRITICAL_FIELDS.map((field) => [field, []]),
  );
  for (const observation of model.observations)
    byField.get(observation.field)!.push(observation);
  // Admit the expanded graph before allocating per-event choices/citations.
  // These are work limits, not a statement that deeper histories are unsupported.
  let references = canonicalReferences;
  const charge = (count: number) => {
    references += count;
    if (references > LIMITS.references) fail("CORRECTION_PROJECTION_LIMIT");
  };
  for (const event of review.corrections) {
    if (event.attempt_id !== context.attemptId) continue;
    const selection = selectedByEvent.get(event.id);
    const candidates = byField
      .get(event.field)!
      .filter(
        (observation) =>
          event.operation !== "confirm" ||
          observation.assertionId === event.candidate_id,
      );
    for (const candidate of candidates) charge(1 + candidate.citations.length);
    const observation = selection
      ? candidates.find((value) => value.targetId === selection.sourceTargetId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (!observation) continue;
    charge(observation.citations.length);
    const choices = canonical?.choicesByTarget.get(observation.targetId) ?? [];
    for (const choice of choices) charge(1 + choice.locations.length);
    const chosen = selection?.canonicalFactId
      ? choices.find((choice) => choice.factId === selection.canonicalFactId)
      : choices.length === 1
        ? choices[0]
        : undefined;
    if (chosen) charge(1 + chosen.locations.length);
  }
  return {
    review,
    context,
    model,
    canonical,
    binding,
    historyAttestation,
    selectedByEvent,
    byField,
    canonicalReferences,
  };
}

function projectPrepared(
  prepared: ReturnType<typeof prepareCanonicalCorrections>,
): CanonicalCorrectionProjection {
  const {
    review,
    context,
    canonical,
    binding,
    historyAttestation,
    selectedByEvent,
    byField,
  } = prepared;
  const items: ProjectionItem[] = review.corrections.map((event) => {
    const stale = event.attempt_id !== context.attemptId;
    const selection = selectedByEvent.get(event.id);
    const candidates = stale
      ? []
      : byField
          .get(event.field)!
          .filter(
            (observation) =>
              event.operation !== "confirm" ||
              observation.assertionId === event.candidate_id,
          );
    const observation = selection
      ? candidates.find((value) => value.targetId === selection.sourceTargetId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    const item: ProjectionItem = {
      event: { ...event },
      state: stale
        ? "stale"
        : !candidates.length
          ? "requires_add"
          : observation
            ? "mapped"
            : "ambiguous",
      effect:
        event.operation === "correct"
          ? "candidate_authored_value"
          : "evidence_review_only",
      sourceTargetId: observation?.targetId ?? null,
      sourceChoices: candidates.map((value) => ({
        targetId: value.targetId,
        assertionId: value.assertionId,
        value: value.value,
        citations: sourceCitations(value, context.attemptId),
      })),
      canonicalChoices: [],
      canonicalTarget: null,
      canonicalResolution: {
        state: "not_evaluated",
        reason: stale ? "inactive_attempt" : null,
      },
      currentValue: null,
      originalCitations: observation
        ? sourceCitations(observation, context.attemptId)
        : [],
      proposedFact:
        !stale && event.operation === "correct"
          ? {
              value: event.value,
              state: "unconfirmed",
              sources: [],
              confirmation: null,
              provenance: {
                kind: "candidate_authored_evidence_correction",
                eventId: event.id,
                actorId: event.actor_id,
                revision: event.revision,
                attemptId: event.attempt_id,
                sourceId: context.sourceId,
                inputSha256: context.inputSha256,
                field: event.field,
                targetId: observation?.targetId ?? null,
              },
            }
          : null,
      requiresExplicitReview: true,
      canonicalConfirmationGranted: false,
      supersededByEventId: null,
      blockedByEventIds: [],
    };
    if (!observation) {
      if (selection?.canonicalFactId) fail("CORRECTION_SELECTION_INVALID");
      return item;
    }
    if (!canonical) {
      if (selection?.canonicalFactId) fail("CORRECTION_SELECTION_INVALID");
      item.canonicalResolution = { state: "initial_import", reason: null };
      return item;
    }
    const choices = canonical.choicesByTarget.get(observation.targetId) ?? [];
    item.canonicalChoices = choices.map((choice) => ({
      ...choice,
      locations: choice.locations.map((location) => ({ ...location })),
    }));
    if (
      selection?.canonicalFactId &&
      !choices.some((choice) => choice.factId === selection.canonicalFactId)
    )
      fail("CORRECTION_SELECTION_INVALID");
    const choice = selection?.canonicalFactId
      ? choices.find((choice) => choice.factId === selection.canonicalFactId)
      : choices.length === 1
        ? choices[0]
        : undefined;
    if (!choice) {
      item.state = choices.length ? "ambiguous" : "unmapped";
      item.canonicalResolution = {
        state: choices.length ? "ambiguous" : "unmapped",
        reason: choices.length
          ? "multiple_canonical_citation_targets"
          : canonical.chainComplete
            ? "canonical_origin_not_proven"
            : "canonical_lineage_incomplete",
      };
      return item;
    }
    if (
      !choice.locations.length ||
      (!contact.has(event.field) &&
        new Set(
          choice.locations.map((location) => location.entryId).filter(Boolean),
        ).size > 1)
    ) {
      item.state = "unmapped";
      item.canonicalResolution = {
        state: "unmapped",
        reason: choice.locations.length
          ? "shared_canonical_fact_requires_review"
          : "unplaced_canonical_fact",
      };
      item.canonicalChoices = [];
      return item;
    }
    item.canonicalTarget = {
      ...choice,
      locations: choice.locations.map((location) => ({ ...location })),
    };
    item.currentValue = choice.currentValue;
    item.canonicalResolution = { state: "mapped", reason: null };
    if (event.operation === "correct" && choice.currentValue === event.value)
      item.state = "unchanged_provenance";
    return item;
  });
  const latestByTarget = new Map<string, ProjectionItem>();
  for (const item of items)
    if (item.sourceTargetId) latestByTarget.set(item.sourceTargetId, item);
  for (const item of items) {
    if (!item.sourceTargetId) continue;
    const latest = latestByTarget.get(item.sourceTargetId)!;
    if (latest !== item) {
      item.state = "superseded";
      item.supersededByEventId = latest.event.id;
      continue;
    }
    const pending = items.filter(
      (other) =>
        other.event.attempt_id === context.attemptId &&
        other.event.field === item.event.field &&
        other.event.revision > item.event.revision &&
        !other.sourceTargetId &&
        other.state === "ambiguous",
    );
    if (pending.length) {
      item.state = "blocked_by_newer_ambiguity";
      item.blockedByEventIds = pending.map((other) => other.event.id);
    }
  }
  return {
    modelVersion: CANONICAL_CORRECTION_PROJECTION_VERSION,
    authority: "review_projection_only",
    materialized: false,
    scoringEligible: false,
    binding,
    history: review.corrections.map((event) => ({ ...event })),
    historyCompleteness: historyAttestation
      ? "complete_captured_prefix"
      : "not_attested_by_read_model",
    historyAttestation,
    latestScope: historyAttestation
      ? "captured_contiguous_prefix_per_target"
      : "supplied_contiguous_history_per_target",
    items,
  };
}

/** Historical projection/model output is unchanged. Admission is shared with
 * the batch source-choice reader below; neither helper authorizes writes. */
export function projectCanonicalCorrections(
  input: CanonicalCorrectionProjectionInput,
): CanonicalCorrectionProjection {
  return projectPrepared(prepareCanonicalCorrections(input));
}

/** Resolve all real source targets in one admitted batch, independently of an
 * event's optional selected observation. Never cross-pair same-field sources. */
export function projectCanonicalCorrectionSourceChoices(
  input: CanonicalCorrectionProjectionInput,
) {
  const prepared = prepareCanonicalCorrections(input);
  let references = prepared.canonicalReferences;
  for (const choices of prepared.canonical?.choicesByTarget.values() ?? []) {
    for (const choice of choices) {
      references += 1 + choice.locations.length;
      if (references > LIMITS.references) fail("CORRECTION_PROJECTION_LIMIT");
    }
  }
  const choicesBySourceTarget = new Map<
    string,
    CanonicalCorrectionSourceChoice[]
  >();
  for (const observation of prepared.model.observations) {
    const choices =
      prepared.canonical?.choicesByTarget.get(observation.targetId) ?? [];
    choicesBySourceTarget.set(
      observation.targetId,
      choices
        .filter(
          (choice) =>
            choice.locations.length > 0 &&
            (contact.has(observation.field) ||
              new Set(
                choice.locations
                  .map((location) => location.entryId)
                  .filter(Boolean),
              ).size <= 1),
        )
        .map((choice) => ({
          ...choice,
          locations: choice.locations.map((location) => ({ ...location })),
          ...prepared.canonical!.originsByFact.get(choice.factId)!,
        })),
    );
  }
  return { projection: projectPrepared(prepared), choicesBySourceTarget };
}
