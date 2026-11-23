import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
export const MAX_ANNOTATION_UNITS = 65_536;
const family = z.enum([
  "critical_fields",
  "requirements",
  "evidence_spans",
  "reading_order",
  "expert_rubric",
  "ambiguity",
  "unsupported_boundaries",
]);
const submissionSchema = z.strictObject({
  id,
  annotatorId: id,
  labelHash: hash,
  handbookHash: hash,
  sourceHash: hash,
  submittedAt: timestamp,
});
const annotator = z.strictObject({
  id,
  kind: z.enum(["human", "ai"]),
  trainingHandbookHash: hash,
  independent: z.boolean(),
  blindedToOtherLabels: z.boolean(),
  blindedToModelOutput: z.boolean(),
});
export const annotationEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provenance: z.enum(["synthetic", "representative"]),
  handbookHash: hash,
  annotators: z.tuple([annotator, annotator]),
  adjudicator: z.strictObject({
    id,
    kind: z.enum(["human", "ai"]),
    trainingHandbookHash: hash,
    blindedToModelOutput: z.boolean(),
    blindedToAnnotatorIdentity: z.boolean(),
  }),
  declaredFamilies: z.array(family).min(1).max(7),
  units: z
    .array(
      z.strictObject({
        id,
        sourceId: id,
        sourceHash: hash,
        family,
        critical: z.boolean(),
        submissions: z.tuple([submissionSchema, submissionSchema]),
        resolution: z
          .strictObject({
            adjudicatorId: id,
            labelHash: hash,
            reasonReference: id,
            handbookHash: hash,
            sourceHash: hash,
            submissionHashes: z.tuple([hash, hash]),
            resolvedAt: timestamp,
          })
          .optional(),
      }),
    )
    .max(MAX_ANNOTATION_UNITS),
});
export type AnnotationEvidence = z.infer<typeof annotationEvidenceSchema>;
export type AnnotationEligibilityBinding = {
  sourceId: string;
  sourceHash: string;
  annotationEvidenceHash: string;
};
/** Trusted application context, not a permission claim accepted from a JSON file. */
export type AnnotationAuthority = {
  authorizeSource(binding: {
    sourceId: string;
    sourceHash: string;
    handbookHash: string;
    annotationEvidenceHash: string;
  }): boolean;
  authorizeReviewer(binding: {
    reviewerId: string;
    role: "annotator" | "adjudicator";
    handbookHash: string;
    annotationEvidenceHash: string;
  }): boolean;
};
export type AnnotationReason =
  | "INVALID_EVIDENCE"
  | "ACTOR_CONFLICT"
  | "DUPLICATE_UNIT"
  | "DUPLICATE_SUBMISSION"
  | "SUBMISSION_ACTOR_MISMATCH"
  | "SOURCE_BINDING_MISMATCH"
  | "HANDBOOK_BINDING_MISMATCH"
  | "INVALID_RESOLUTION"
  | "UNDECLARED_FAMILY"
  | "DUPLICATE_FAMILY"
  | "UNRESOLVED_DISAGREEMENT"
  | "AGREEMENT_NOT_PASSED"
  | "HUMAN_INDEPENDENCE_NOT_ESTABLISHED"
  | "REAL_DATA_NOT_AUTHORIZED";
export type FamilyAgreement = {
  family: z.infer<typeof family>;
  uniqueSourceCount: number;
  pairs: number;
  agreements: number;
  exactAgreement: number | null;
  expectedAgreement: number | null;
  kappa: number | null;
  threshold: 0.8;
  status: "passed" | "failed" | "undefined" | "insufficient";
};
export type AnnotationAssessment = {
  schemaVersion: 1;
  status: "assessed" | "rejected";
  annotationEvidenceHash: string | null;
  evidenceTier: "synthetic_engineering" | "independent_human" | "unverified";
  totalUnits: number;
  uniqueSourceCount: number;
  uniqueContentCount: number;
  engineeringReady: boolean;
  resolvedDisagreements: number;
  unresolvedUnits: number;
  unresolvedCriticalUnits: number;
  familyReports: FamilyAgreement[];
  agreementPassed: boolean;
  humanIndependenceDeclared: boolean;
  representativeAnnotationEligible: boolean;
  eligibleSources: AnnotationEligibilityBinding[];
  reasonCounts: Partial<Record<AnnotationReason, number>>;
  representativeReady: false;
  releaseReady: false;
};

// Arrays retain original submission order; object-key order does not change binding.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function hashAnnotationSubmission(value: unknown): string | null {
  const parsed = submissionSchema.safeParse(value);
  return parsed.success ? digest(parsed.data) : null;
}

function agreement(
  name: z.infer<typeof family>,
  units: AnnotationEvidence["units"],
  firstAnnotatorId: string,
): FamilyAgreement {
  const pairs = units.length;
  const agreements = units.filter(
    (u) => u.submissions[0].labelHash === u.submissions[1].labelHash,
  ).length;
  const report: FamilyAgreement = {
    family: name,
    uniqueSourceCount: new Set(units.map((u) => u.sourceId)).size,
    pairs,
    agreements,
    exactAgreement: pairs ? agreements / pairs : null,
    expectedAgreement: null,
    kappa: null,
    threshold: 0.8,
    status: "insufficient",
  };
  // Two pairs is only a mathematical floor, never representative sample sufficiency.
  if (pairs < 2) return report;
  const first = new Map<string, number>();
  const second = new Map<string, number>();
  for (const unit of units) {
    const a = unit.submissions.find((s) => s.annotatorId === firstAnnotatorId)!;
    const b = unit.submissions.find((s) => s.annotatorId !== firstAnnotatorId)!;
    first.set(a.labelHash, (first.get(a.labelHash) ?? 0) + 1);
    second.set(b.labelHash, (second.get(b.labelHash) ?? 0) + 1);
  }
  let matchingMarginals = 0;
  for (const [label, count] of first)
    matchingMarginals += count * (second.get(label) ?? 0);
  report.expectedAgreement = matchingMarginals / (pairs * pairs);
  if (matchingMarginals === pairs * pairs) {
    report.status = "undefined";
    return report;
  }
  report.kappa =
    (agreements * pairs - matchingMarginals) /
    (pairs * pairs - matchingMarginals);
  report.status = report.kappa >= 0.8 ? "passed" : "failed";
  return report;
}

/** Declared identity/blinding remains evidence metadata, not independent verification. */
export function assessAnnotationEvidence(
  input: unknown,
  authority?: AnnotationAuthority,
): AnnotationAssessment {
  const result: AnnotationAssessment = {
    schemaVersion: 1,
    status: "rejected",
    annotationEvidenceHash: null,
    evidenceTier: "unverified",
    totalUnits: 0,
    uniqueSourceCount: 0,
    uniqueContentCount: 0,
    engineeringReady: false,
    resolvedDisagreements: 0,
    unresolvedUnits: 0,
    unresolvedCriticalUnits: 0,
    familyReports: [],
    agreementPassed: false,
    humanIndependenceDeclared: false,
    representativeAnnotationEligible: false,
    eligibleSources: [],
    reasonCounts: {},
    representativeReady: false,
    releaseReady: false,
  };
  const count = (code: AnnotationReason) => {
    result.reasonCounts[code] = (result.reasonCounts[code] ?? 0) + 1;
  };
  const inputUnits =
    typeof input === "object" && input !== null
      ? (input as { units?: unknown }).units
      : undefined;
  if (Array.isArray(inputUnits) && inputUnits.length > MAX_ANNOTATION_UNITS) {
    count("INVALID_EVIDENCE");
    return result;
  }
  const parsed = annotationEvidenceSchema.safeParse(input);
  if (!parsed.success) {
    count("INVALID_EVIDENCE");
    return result;
  }
  const data = parsed.data;
  result.totalUnits = data.units.length;
  const evidenceHash = digest(data);
  result.annotationEvidenceHash = evidenceHash;
  const actorIds = data.annotators.map((a) => a.id);
  if (new Set([...actorIds, data.adjudicator.id]).size !== 3)
    count("ACTOR_CONFLICT");
  if (new Set(data.declaredFamilies).size !== data.declaredFamilies.length)
    count("DUPLICATE_FAMILY");
  const unitIds = new Set<string>();
  const submissionIds = new Set<string>();
  const sources = new Map<string, { hash: string; unresolved: boolean }>();
  for (const unit of data.units) {
    if (unitIds.has(unit.id)) count("DUPLICATE_UNIT");
    unitIds.add(unit.id);
    if (!data.declaredFamilies.includes(unit.family))
      count("UNDECLARED_FAMILY");
    if (
      sources.has(unit.sourceId) &&
      sources.get(unit.sourceId)?.hash !== unit.sourceHash
    )
      count("SOURCE_BINDING_MISMATCH");
    if (!sources.has(unit.sourceId))
      sources.set(unit.sourceId, { hash: unit.sourceHash, unresolved: false });
    if (
      new Set(unit.submissions.map((s) => s.annotatorId)).size !== 2 ||
      unit.submissions.some((s) => !actorIds.includes(s.annotatorId))
    )
      count("SUBMISSION_ACTOR_MISMATCH");
    for (const submission of unit.submissions) {
      if (submissionIds.has(submission.id)) count("DUPLICATE_SUBMISSION");
      submissionIds.add(submission.id);
      if (submission.handbookHash !== data.handbookHash)
        count("HANDBOOK_BINDING_MISMATCH");
      if (submission.sourceHash !== unit.sourceHash)
        count("SOURCE_BINDING_MISMATCH");
    }
    const disagrees =
      unit.submissions[0].labelHash !== unit.submissions[1].labelHash;
    const resolution = unit.resolution;
    if (resolution) {
      if (
        resolution.adjudicatorId !== data.adjudicator.id ||
        resolution.handbookHash !== data.handbookHash ||
        resolution.sourceHash !== unit.sourceHash ||
        resolution.submissionHashes.some(
          (h, i) => h !== digest(unit.submissions[i]),
        ) ||
        Date.parse(resolution.resolvedAt) <
          Math.max(...unit.submissions.map((s) => Date.parse(s.submittedAt))) ||
        (!disagrees && resolution.labelHash !== unit.submissions[0].labelHash)
      )
        count("INVALID_RESOLUTION");
      else if (disagrees) result.resolvedDisagreements++;
    } else if (disagrees) {
      result.unresolvedUnits++;
      if (unit.critical) result.unresolvedCriticalUnits++;
      sources.get(unit.sourceId)!.unresolved = true;
    }
  }
  result.uniqueSourceCount = sources.size;
  result.uniqueContentCount = new Set(
    [...sources.values()].map((s) => s.hash),
  ).size;
  // Binding failures are terminal; no partial eligible-source claims survive them.
  if (Object.keys(result.reasonCounts).length) return result;
  result.status = "assessed";
  result.familyReports = data.declaredFamilies.map((name) =>
    agreement(
      name,
      data.units.filter((u) => u.family === name),
      data.annotators[0].id,
    ),
  );
  result.agreementPassed = result.familyReports.every(
    (r) => r.status === "passed",
  );
  if (!result.agreementPassed) count("AGREEMENT_NOT_PASSED");
  if (result.unresolvedUnits)
    result.reasonCounts.UNRESOLVED_DISAGREEMENT = result.unresolvedUnits;
  result.humanIndependenceDeclared =
    data.annotators.every(
      (a) =>
        a.kind === "human" &&
        a.independent &&
        a.blindedToOtherLabels &&
        a.blindedToModelOutput &&
        a.trainingHandbookHash === data.handbookHash,
    ) &&
    data.adjudicator.kind === "human" &&
    data.adjudicator.blindedToModelOutput &&
    data.adjudicator.blindedToAnnotatorIdentity &&
    data.adjudicator.trainingHandbookHash === data.handbookHash;
  let authorizedReviewers = false;
  if (
    data.provenance === "representative" &&
    result.humanIndependenceDeclared &&
    typeof authority?.authorizeReviewer === "function" &&
    typeof authority?.authorizeSource === "function"
  ) {
    try {
      authorizedReviewers =
        data.annotators.every(
          (a) =>
            authority.authorizeReviewer({
              reviewerId: a.id,
              role: "annotator",
              handbookHash: data.handbookHash,
              annotationEvidenceHash: evidenceHash,
            }) === true,
        ) &&
        authority.authorizeReviewer({
          reviewerId: data.adjudicator.id,
          role: "adjudicator",
          handbookHash: data.handbookHash,
          annotationEvidenceHash: evidenceHash,
        }) === true;
    } catch {
      authorizedReviewers = false;
    }
  }
  if (data.provenance === "synthetic")
    result.evidenceTier = "synthetic_engineering";
  else {
    if (!result.humanIndependenceDeclared)
      count("HUMAN_INDEPENDENCE_NOT_ESTABLISHED");
    if (!authorizedReviewers) count("REAL_DATA_NOT_AUTHORIZED");
    else result.evidenceTier = "independent_human";
  }
  for (const [sourceId, source] of sources) {
    if (!result.agreementPassed || source.unresolved) continue;
    let authorized = data.provenance === "synthetic";
    if (data.provenance === "representative" && authorizedReviewers) {
      try {
        authorized =
          authority!.authorizeSource({
            sourceId,
            sourceHash: source.hash,
            handbookHash: data.handbookHash,
            annotationEvidenceHash: evidenceHash,
          }) === true;
      } catch {
        authorized = false;
      }
      if (!authorized) count("REAL_DATA_NOT_AUTHORIZED");
    }
    if (authorized)
      result.eligibleSources.push({
        sourceId,
        sourceHash: source.hash,
        annotationEvidenceHash: result.annotationEvidenceHash,
      });
  }
  result.engineeringReady =
    result.agreementPassed &&
    sources.size > 0 &&
    result.eligibleSources.length === sources.size;
  result.representativeAnnotationEligible =
    data.provenance === "representative" &&
    result.evidenceTier === "independent_human" &&
    sources.size > 0 &&
    result.eligibleSources.length === sources.size;
  return result;
}
