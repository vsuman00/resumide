import { createHash } from "node:crypto";
import type { DocumentEvidence } from "./document-evidence";
import { CRITICAL_FIELDS, type EvidenceField } from "./evidence-fields";

export const EVIDENCE_TARGET_MODEL_VERSION = "evidence-targets/1.0.0" as const;

/** Supplied only by the owned-analysis/replayed-attempt read boundary. This
 * helper cannot authenticate an actor and never authorizes a correction/write. */
export type OwnedEvidenceBinding = {
  ownerId: string;
  analysisId: string;
  sourceId: string;
  inputSha256: string;
  attemptId: string;
};
type ModelBinding = OwnedEvidenceBinding & {
  evidenceSchemaVersion: DocumentEvidence["schemaVersion"];
  fieldExtractorVersion: string | null;
};
type Citation = {
  spanId: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  start: number;
  end: number;
  pageStart: number;
  pageEnd: number;
};
type Observation = {
  id: string;
  assertionId: string;
  field: EvidenceField;
  value: string;
  state: "review_required";
  confidence: { kind: "uncalibrated"; value: null };
  citations: Citation[];
  targetId: string;
};
type Target = {
  id: string;
  slotId: string;
  field: EvidenceField;
  kind:
    | "contact_slot"
    | "entry_field"
    | "unassigned_observation"
    | "unobserved_field";
  state: "review_required" | "unobserved";
  observationIds: string[];
  groupId: string | null;
};
type EntryKind = "employment" | "education" | "certification";
type CandidateGroup = {
  id: string;
  kind: EntryKind;
  association: "labelled_same_span_candidate";
  verified: false;
  spanId: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  observationIds: string[];
  targetIds: string[];
};
type Notice = {
  code:
    | "multiple_contact_slots"
    | "multiple_entry_candidates"
    | "unresolved_entry_link"
    | "ambiguous_labelled_context"
    | "native_ocr_values_differ";
  field: EvidenceField;
  pageId: string | null;
  relationship: "unresolved";
  observationIds: string[];
  targetIds: string[];
};
export type EvidenceReviewTargets = {
  modelVersion: typeof EVIDENCE_TARGET_MODEL_VERSION;
  authority: "derived_review_only";
  scoringEligible: false;
  offsetUnit: "unicode_code_point";
  offsetOrigin: "span_text";
  binding: ModelBinding;
  observations: Observation[];
  targets: Target[];
  groups: CandidateGroup[];
  notices: Notice[];
  coverage: Array<{
    field: EvidenceField;
    rawState: DocumentEvidence["fields"][number]["state"];
    state: "observed" | "unobserved";
    qualificationAssessment: "not_assessed";
    observationIds: string[];
  }>;
};

const contact = new Set<EvidenceField>(["name", "email", "phone"]);
const entryFields = new Set<EvidenceField>([
  "employer",
  "role",
  "dates",
  "education",
  "certification",
]);
// This derived read version recognizes canonical explicit labels only. Other
// producer-supported layouts retain their individual observations and unknown
// entry links until a separately reviewed grouping rule can establish context.
const labelPattern =
  /(?:^|[|;]\s*)(name|email|phone|employer|role|dates|education|certification)\s*:\s*/giu;
type Label = { field: EvidenceField; start: number; end: number };

function id(kind: string, binding: ModelBinding, ...parts: unknown[]) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([EVIDENCE_TARGET_MODEL_VERSION, kind, binding, ...parts]),
    )
    .digest("hex");
  return `${kind}-${digest}`;
}
function labels(text: string): Label[] {
  const matches = [...text.matchAll(labelPattern)];
  const offsets = new Uint32Array(text.length + 1);
  let count = 0;
  for (let index = 0; index < text.length;) {
    const width = text.codePointAt(index)! > 0xffff ? 2 : 1;
    offsets[index] = count;
    if (width === 2) offsets[index + 1] = count;
    index += width;
    offsets[index] = ++count;
  }
  return matches.map((match, index) => {
    let start = match.index! + match[0].length;
    let end = matches[index + 1]?.index ?? text.length;
    const raw = text.slice(start, end);
    start += raw.length - raw.trimStart().length;
    end = Math.max(start, end - (raw.length - raw.trimEnd().length));
    return {
      field: match[1].toLowerCase() as EvidenceField,
      start: offsets[start],
      end: offsets[end],
    };
  });
}
function entryKind(fields: EvidenceField[]): EntryKind | null {
  const kinds = new Set<EntryKind>();
  for (const field of fields) {
    if (field === "employer" || field === "role") kinds.add("employment");
    if (field === "education") kinds.add("education");
    if (field === "certification") kinds.add("certification");
  }
  return kinds.size === 1 ? [...kinds][0] : null;
}

/** Pure projection of already replay-validated immutable evidence. Matching an
 * owned binding is necessary, but this function is not an authorization check. */
export function deriveEvidenceReviewTargets(
  evidence: DocumentEvidence,
  owned: OwnedEvidenceBinding,
): EvidenceReviewTargets {
  if (
    evidence.ownerId !== owned.ownerId ||
    evidence.analysisId !== owned.analysisId ||
    evidence.sourceId !== owned.sourceId ||
    evidence.inputSha256 !== owned.inputSha256 ||
    evidence.id !== owned.attemptId
  )
    throw Error("EVIDENCE_TARGET_BINDING_MISMATCH");
  const binding: ModelBinding = {
    ownerId: owned.ownerId,
    analysisId: owned.analysisId,
    sourceId: owned.sourceId,
    inputSha256: owned.inputSha256,
    attemptId: owned.attemptId,
    evidenceSchemaVersion: evidence.schemaVersion,
    fieldExtractorVersion: evidence.fieldExtractorVersion ?? null,
  };
  const spans = new Map(evidence.spans.map((span) => [span.id, span]));
  const targets: Target[] = [];
  const observations: Observation[] = evidence.assertions.map((assertion) => {
    const observationId = id(
      "observation",
      binding,
      assertion.id,
      assertion.field,
      assertion.value,
      assertion.evidence,
    );
    const targetId = id(
      "target",
      binding,
      assertion.id,
      assertion.field,
      assertion.value,
      assertion.evidence,
    );
    const citations = assertion.evidence.map((reference) => {
      const span = spans.get(reference.spanId);
      if (!span) throw Error("EVIDENCE_TARGET_REFERENCE_INVALID");
      return {
        ...reference,
        pageId: span.pageId,
        method: span.method,
        pageStart: span.start + reference.start,
        pageEnd: span.start + reference.end,
      };
    });
    targets.push({
      id: targetId,
      slotId: assertion.id,
      field: assertion.field,
      kind: contact.has(assertion.field)
        ? "contact_slot"
        : "unassigned_observation",
      state: "review_required",
      observationIds: [observationId],
      groupId: null,
    });
    return {
      id: observationId,
      assertionId: assertion.id,
      field: assertion.field,
      value: assertion.value,
      state: assertion.state,
      confidence: { ...assertion.confidence },
      citations,
      targetId,
    };
  });
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const bySpan = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (!entryFields.has(observation.field)) continue;
    for (const citation of observation.citations) {
      const values = bySpan.get(citation.spanId) ?? [];
      values.push(observation);
      bySpan.set(citation.spanId, values);
    }
  }
  const groups: CandidateGroup[] = [];
  const notices: Notice[] = [];
  const notice = (
    code: Notice["code"],
    field: EvidenceField,
    values: Observation[],
    pageId: string | null = null,
  ) => {
    notices.push({
      code,
      field,
      pageId,
      relationship: "unresolved",
      observationIds: values.map((value) => value.id),
      targetIds: values.map((value) => value.targetId),
    });
  };
  for (const [spanId, values] of bySpan) {
    const span = spans.get(spanId)!;
    const segments = labels(span.text);
    const fields = segments
      .filter((segment) => entryFields.has(segment.field))
      .map((segment) => segment.field);
    const kind = entryKind(fields);
    const uniqueLabels = new Set(fields).size === fields.length;
    const exactLabelledValues = values.every(
      (value) =>
        value.citations.length === 1 &&
        segments.some(
          (segment) =>
            segment.field === value.field &&
            value.citations[0].start >= segment.start &&
            value.citations[0].end <= segment.end,
        ),
    );
    if (kind && uniqueLabels && exactLabelledValues && values.length >= 2) {
      const groupId = id(
        "group",
        binding,
        spanId,
        kind,
        values.map((value) => value.id).sort(),
      );
      groups.push({
        id: groupId,
        kind,
        association: "labelled_same_span_candidate",
        verified: false,
        spanId,
        pageId: span.pageId,
        method: span.method,
        observationIds: values.map((value) => value.id),
        targetIds: values.map((value) => value.targetId),
      });
      for (const value of values) {
        const target = targetById.get(value.targetId)!;
        target.kind = "entry_field";
        target.groupId = groupId;
      }
    } else if (values.length > 1 && fields.length > 1) {
      for (const field of new Set(values.map((value) => value.field)))
        notice("ambiguous_labelled_context", field, values, span.pageId);
    }
  }
  const byField = new Map<EvidenceField, Observation[]>(
    CRITICAL_FIELDS.map((field) => [field, []]),
  );
  for (const value of observations) byField.get(value.field)!.push(value);
  for (const field of CRITICAL_FIELDS) {
    const values = byField.get(field)!;
    if (!values.length) {
      const slotId = `unobserved:${field}`;
      targets.push({
        id: id("target", binding, slotId, field),
        slotId,
        field,
        kind: "unobserved_field",
        state: "unobserved",
        observationIds: [],
        groupId: null,
      });
    } else {
      if (values.length > 1)
        notice(
          contact.has(field)
            ? "multiple_contact_slots"
            : "multiple_entry_candidates",
          field,
          values,
        );
      const unresolved = values.filter(
        (value) =>
          targetById.get(value.targetId)!.kind === "unassigned_observation",
      );
      if (unresolved.length) notice("unresolved_entry_link", field, unresolved);
      const byPage = new Map<string, Observation[]>();
      for (const value of values) {
        for (const pageId of new Set(
          value.citations.map((citation) => citation.pageId),
        )) {
          const current = byPage.get(pageId) ?? [];
          current.push(value);
          byPage.set(pageId, current);
        }
      }
      for (const [pageId, pageValues] of byPage) {
        const native = new Set(
          pageValues
            .filter((value) =>
              value.citations.some(
                (citation) =>
                  citation.pageId === pageId &&
                  citation.method === "native_text",
              ),
            )
            .map((value) => value.value),
        );
        const ocr = new Set(
          pageValues
            .filter((value) =>
              value.citations.some(
                (citation) =>
                  citation.pageId === pageId && citation.method === "local_ocr",
              ),
            )
            .map((value) => value.value),
        );
        if (
          native.size &&
          ocr.size &&
          (native.size !== ocr.size ||
            [...native].some((value) => !ocr.has(value)))
        )
          notice("native_ocr_values_differ", field, pageValues, pageId);
      }
    }
  }
  return {
    modelVersion: EVIDENCE_TARGET_MODEL_VERSION,
    authority: "derived_review_only",
    scoringEligible: false,
    offsetUnit: "unicode_code_point",
    offsetOrigin: "span_text",
    binding,
    observations,
    targets,
    groups,
    notices,
    coverage: evidence.fields.map((field) => ({
      field: field.field,
      rawState: field.state,
      state: byField.get(field.field)!.length ? "observed" : "unobserved",
      qualificationAssessment: "not_assessed",
      observationIds: byField.get(field.field)!.map((value) => value.id),
    })),
  };
}
