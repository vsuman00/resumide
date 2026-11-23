import { createHash } from "node:crypto";
import { z } from "zod";
import { DocumentEvidenceSchema } from "./document-evidence";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";
import {
  JobRequirementsSchema,
  SOFTWARE_SKILLS,
  type JobRequirement,
} from "./job-requirements";
import {
  getDraftScorePolicy,
  WithheldScoreV2Schema,
  ScoreRuleState,
  ScoreBlocker,
} from "./score-v2-contract";

const Citation = z.strictObject({
  kind: z.enum(["fact", "document_span", "requirement"]),
  id: z.string().min(1).max(100),
});
export const TechnicalRuleSchema = z.strictObject({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  state: ScoreRuleState,
  credit: z.number().min(0).max(1).nullable(),
  weight: z.null(),
  critical: z.boolean(),
  reason: z.string().min(1).max(300),
  citations: z.array(Citation).max(20),
  additionalCitationCount: z.number().int().nonnegative(),
});
const MatchState = z.enum([
  "satisfied",
  "partially_satisfied",
  "candidate_confirmation_required",
  "not_evidenced",
  "not_applicable",
  "not_evaluated",
]);
export const AlignmentTraceSchema = z.strictObject({
  id: z.uuid(),
  sourceRequirementIds: z.array(z.uuid()).min(1).max(300),
  type: z.string().min(1),
  value: z.string().min(1),
  importance: z.enum(["required", "preferred", "contextual", "unknown"]),
  state: MatchState,
  proposedState: MatchState,
  reason: z.string().min(1).max(300),
  factIds: z.array(z.uuid()).max(20),
  additionalFactCount: z.number().int().nonnegative(),
  dedupGroup: z.string().min(1).max(100),
});
export const ScoreDiagnosticsSchema = z.strictObject({
  schemaVersion: z.literal("score-diagnostics/1.0.0"),
  score: WithheldScoreV2Schema,
  readiness: z.strictObject({
    state: z.enum(["review_required", "insufficient", "unsupported"]),
    observedPageCoverage: z.number().min(0).max(1),
    blockers: z.array(ScoreBlocker).min(1),
    sourceWarnings: z.array(z.string()).max(20),
    confirmedFactCount: z.number().int().nonnegative(),
  }),
  rules: z.array(TechnicalRuleSchema).max(20),
  alignment: z.array(AlignmentTraceSchema).max(300),
  improvements: z
    .array(
      z.strictObject({
        id: z.string(),
        reason: z.string(),
        target: z.enum(["evidence", "canonical", "requirements"]),
      }),
    )
    .max(5),
  strengths: z.array(z.string()).max(20),
  readinessAggregate: z.null(),
  policyState: z.literal("draft"),
});
export type ScoreDiagnostics = z.infer<typeof ScoreDiagnosticsSchema>;
const Input = z.strictObject({
  evidence: DocumentEvidenceSchema,
  canonical: CanonicalResumeDraftSchema,
  requirements: JobRequirementsSchema.nullable(),
  expectedPageCount: z.number().int().min(1).max(20).optional(),
  policyId: z.string().optional(),
});
const normalized = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
type Fact = CanonicalResumeDraft["facts"][number];
const cited = (fact: Fact) => fact.sources.length > 0;
const confirmed = (fact: Fact) =>
  fact.state === "candidate_confirmed" && cited(fact);
const refs = (facts: Fact[]) =>
  facts.map((f) => ({ kind: "fact" as const, id: f.id }));
function stableUuid(hash: string) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Arithmetic contract, for approved callers or illustrative AA0 tests only.
 * The current draft engine never supplies weights or publishes this fraction. */
export function normalizeWeightedRules(raw: unknown) {
  const rules = z
    .array(
      z.strictObject({
        state: ScoreRuleState,
        weight: z.number().positive(),
        credit: z.number().min(0).max(1).nullable(),
        critical: z.boolean(),
        applicabilityReason: z.string().min(1).nullable(),
      }),
    )
    .max(1000)
    .parse(raw);
  let numerator = 0,
    evaluated = 0,
    applicable = 0,
    criticalUnknown = false;
  for (const r of rules) {
    if (r.state === "not_applicable") {
      if (!r.applicabilityReason) throw Error("APPLICABILITY_REASON_REQUIRED");
      if (r.credit !== null) throw Error("INAPPLICABLE_CREDIT");
      continue;
    }
    applicable += r.weight;
    if (r.state === "not_evaluated") {
      if (r.credit !== null) throw Error("UNKNOWN_CREDIT");
      criticalUnknown ||= r.critical;
      continue;
    }
    if (
      r.credit === null ||
      (r.state === "pass" && r.credit !== 1) ||
      (r.state === "fail" && r.credit !== 0) ||
      (r.state === "partial" && (r.credit <= 0 || r.credit >= 1))
    )
      throw Error("INCONSISTENT_RULE_CREDIT");
    evaluated += r.weight;
    numerator += r.weight * r.credit;
  }
  return {
    internalValue: evaluated ? (100 * numerator) / evaluated : null,
    coverage: applicable ? evaluated / applicable : null,
    criticalUnknown,
    evaluatedWeight: evaluated,
    applicableWeight: applicable,
  };
}
function fullDateRange(value: string) {
  const match =
    /^(\d{4}-\d{2}-\d{2})\s*(?:to|[-–—])\s*(\d{4}-\d{2}-\d{2})$/u.exec(
      value.trim(),
    );
  if (!match) return null;
  const dates = match.slice(1).map((v) => new Date(`${v}T00:00:00Z`));
  if (
    dates.some(
      (d, i) =>
        !Number.isFinite(d.getTime()) ||
        d.toISOString().slice(0, 10) !== match[i + 1],
    ) ||
    dates[1] <= dates[0]
  )
    return null;
  return [dates[0].getTime(), dates[1].getTime()] as const;
}
export function confirmedExperienceMonths(
  doc: CanonicalResumeDraft,
): number | null {
  const intervals: Array<[number, number]> = [];
  for (const section of doc.sections.filter((s) => s.type === "experience"))
    for (const entry of section.entries) {
      const facts = entry.factIds.map((id) =>
        doc.facts.find((f) => f.id === id)!,
      );
      const roles = facts.filter((f) => f.type === "role");
      const dates = facts.filter((f) => f.type === "dates");
      if (!dates.length) continue;
      if (
        !roles.some(
          (r) =>
            confirmed(r) &&
            /\b(software engineer|software developer|web developer|devops|site reliability)\b/iu.test(
              r.value,
            ),
        )
      )
        return null;
      for (const d of dates) {
        const range = confirmed(d) && fullDateRange(d.value);
        if (!range) return null;
        intervals.push([...range]);
      }
    }
  if (!intervals.length) return null;
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of intervals) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged.reduce((sum, [start, end]) => {
    const a = new Date(start),
      b = new Date(end);
    return (
      sum +
      (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
      b.getUTCMonth() -
      a.getUTCMonth() -
      (b.getUTCDate() < a.getUTCDate() ? 1 : 0)
    );
  }, 0);
}
function technicalDateValid(value: string) {
  if (fullDateRange(value)) return true;
  const match = /^(\d{4})\s*[-–—]\s*(\d{4})$/u.exec(value.trim());
  return !!match && Number(match[2]) >= Number(match[1]);
}
function proposeMatch(item: JobRequirement, doc: CanonicalResumeDraft) {
  const result = (
    state: z.infer<typeof MatchState>,
    reason: string,
    facts: Fact[] = [],
  ) => ({ state, reason, facts });
  if (item.negated && item.type === "authorization")
    return result(
      "not_evaluated",
      "A sponsorship exclusion is an eligibility restriction, not an inapplicable qualification; review authorization evidence.",
    );
  if (item.negated)
    return result(
      "not_applicable",
      "Explicit negation excludes this clause from positive qualification credit.",
    );
  if (
    item.derivation !== "exact" ||
    item.importanceBasis !== "explicit" ||
    item.importance === "unknown" ||
    item.ambiguity.length
  )
    return result(
      "not_evaluated",
      "Importance or meaning needs review; it cannot silently become a scored requirement.",
    );
  if (item.type === "experience") {
    // General role tenure does not establish time spent using a named skill.
    if (
      SOFTWARE_SKILLS.some((skill) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}])${skill.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\p{L}\\p{N}])`,
          "iu",
        ).test(item.value),
      )
    )
      return result(
        "not_evaluated",
        "Skill-specific tenure requires dated evidence associated with that skill; general role dates do not establish it.",
      );
    const months = confirmedExperienceMonths(doc);
    if (months === null || item.minimumYears === null)
      return result(
        "not_evaluated",
        "Verify full dates and their association with confirmed software roles.",
      );
    const facts = doc.facts.filter(
      (f) => f.type === "dates" || f.type === "role",
    );
    return result(
      months >= item.minimumYears * 12
        ? "satisfied"
        : months > 0
          ? "partially_satisfied"
          : "not_evidenced",
      "Observed non-overlapping full calendar months; domain and source validation are still required.",
      facts,
    );
  }
  let matches: Fact[] = [];
  if (item.type === "skill")
    matches = doc.facts.filter(
      (f) =>
        f.type === "skill" && normalized(f.value) === normalized(item.value),
    );
  else if (item.type === "education") {
    if (/\b(equivalent|or|comparable)\b/iu.test(item.value))
      return result(
        "not_evaluated",
        "Credential equivalence has no approved domain rule.",
      );
    const target = /\b(bachelor|master|phd|diploma|b\.?tech|bsc|msc)\b/iu.exec(
      item.value,
    )?.[0];
    if (target)
      matches = doc.facts.filter(
        (f) =>
          f.type === "education" &&
          normalized(f.value).includes(normalized(target)),
      );
    const subject =
      /\b(?:in|of)\s+(.+?)(?=\s+(?:required|preferred|mandatory|essential)\b|[.;]|$)/iu.exec(
        item.value,
      )?.[1] ??
      item.value
        .replace(
          /\b(?:bachelor|master|phd|diploma|b\.?tech|bsc|msc)(?:['’]s|s)?\b/giu,
          "",
        )
        .replace(
          /\b(?:degree|a|an|must|have|required|preferred|mandatory|essential|minimum|in|of)\b/giu,
          "",
        )
        .replace(/[.,;:]/gu, " ")
        .trim();
    if (subject)
      matches = matches.filter((f) =>
        normalized(f.value).includes(normalized(subject)),
      );
  } else if (item.type === "certification") {
    const target = item.value
      .replace(
        /\b(must|have|required|preferred|mandatory|certification|certified|certificate)\b/giu,
        "",
      )
      .replace(/^[\s.,;:]+|[\s.,;:]+$/gu, "")
      .trim();
    if (target)
      matches = doc.facts.filter(
        (f) =>
          f.type === "certification" &&
          normalized(f.value) === normalized(target),
      );
  } else if (item.type === "location")
    matches = doc.facts.filter(
      (f) =>
        f.type === "location" &&
        normalized(item.value).includes(normalized(f.value)),
    );
  else
    return result(
      "not_evaluated",
      "No approved factual mapping exists for this requirement type.",
    );
  if (!matches.length)
    return result(
      "not_evaluated",
      "No reliable matching evidence was recovered; absence is not yet established.",
    );
  if (!matches.some(confirmed))
    return result(
      "candidate_confirmation_required",
      "A matching candidate exists but needs exact source-backed confirmation.",
      matches,
    );
  if (item.type === "skill")
    return result(
      "candidate_confirmation_required",
      "A listed skill does not establish proficiency or experience.",
      matches,
    );
  return result(
    "satisfied",
    "A source-backed confirmed exact candidate matches; domain and requirement validation remain pending.",
    matches,
  );
}
export function buildScoreDiagnostics(
  raw: z.input<typeof Input>,
): ScoreDiagnostics {
  const { evidence, canonical, requirements, expectedPageCount, policyId } =
    Input.parse(raw);
  const policy = getDraftScorePolicy(policyId);
  if (
    canonical.ownerId !== evidence.ownerId ||
    canonical.analysisId !== evidence.analysisId ||
    canonical.sourceEvidenceVersionId !== evidence.id ||
    canonical.inputSha256 !== evidence.inputSha256 ||
    canonical.retentionPolicyId !== evidence.retentionPolicyId ||
    (requirements &&
      (requirements.ownerId !== canonical.ownerId ||
        requirements.organizationId !== canonical.organizationId ||
        requirements.analysisId !== canonical.analysisId))
  )
    throw Error("SCORE_SOURCE_BINDING_MISMATCH");
  for (const fact of canonical.facts) {
    if (fact.state === "source_supported")
      throw Error("UNCALIBRATED_FACT_PROMOTED");
    for (const cite of fact.sources) {
      const span = evidence.spans.find((s) => s.id === cite.spanId);
      if (
        !span ||
        cite.attemptId !== evidence.id ||
        Array.from(span.text).slice(cite.start, cite.end).join("") !==
          fact.value
      )
        throw Error("SCORE_FACT_CITATION_MISMATCH");
    }
  }
  const total = expectedPageCount ?? evidence.nativeSource.pages.length;
  if (total < evidence.nativeSource.pages.length)
    throw Error("INVALID_DECLARED_PAGE_COUNT");
  const populated = evidence.nativeSource.pages.filter(
    (p) =>
      evidence.spans.some((s) => s.pageId === p.id && s.text.trim()) ||
      evidence.ocrSource?.pages.some(
        (op) => op.pageNumber === p.pageNumber && op.text.trim(),
      ),
  ).length;
  const observedPageCoverage = total ? populated / total : 0;
  const supported =
    canonical.locale === policy.locale &&
    (!requirements ||
      (requirements.domain === policy.domain &&
        requirements.locale === policy.locale &&
        requirements.state !== "unsupported"));
  const blockers: z.infer<typeof ScoreBlocker>[] = [
    "calibration_not_approved",
    "coverage_policy_unknown",
  ];
  if (evidence.status !== "review_required")
    blockers.push(
      evidence.status === "unsupported"
        ? "unsupported_input"
        : "critical_evidence_missing",
    );
  else blockers.push("extraction_review_required");
  if (
    observedPageCoverage < 1 ||
    evidence.fields.some(
      (f) => f.state === "not_evaluated" || f.state === "conflict",
    )
  )
    blockers.push("critical_evidence_missing");
  if (!supported) blockers.push("unsupported_input");
  if (!requirements) blockers.push("job_description_missing");
  else if (requirements.state === "unsupported")
    blockers.push("unsupported_input");
  else blockers.push("requirements_review_required");
  const uniqueBlockers = [...new Set(blockers)].sort();
  const state =
    !supported ||
    evidence.status === "unsupported" ||
    requirements?.state === "unsupported"
      ? "unsupported"
      : evidence.status === "insufficient" ||
          evidence.status === "failed" ||
          !populated
        ? "insufficient"
        : "review_required";
  const rule = (
    id: string,
    label: string,
    credit: number | null,
    reason: string,
    citations: z.infer<typeof Citation>[] = [],
    critical = false,
    notApplicable = false,
  ) => ({
    id,
    label,
    state: notApplicable
      ? ("not_applicable" as const)
      : credit === null
        ? ("not_evaluated" as const)
        : credit === 1
          ? ("pass" as const)
          : credit === 0
            ? ("fail" as const)
            : ("partial" as const),
    credit: notApplicable ? null : credit,
    weight: null,
    critical,
    reason,
    citations: citations.slice(0, 20),
    additionalCitationCount: Math.max(0, citations.length - 20),
  });
  const contacts = canonical.facts.filter(
    (f) => ["name", "email", "phone"].includes(f.type) && cited(f),
  );
  const contactCount = new Set(contacts.map((f) => f.type)).size;
  const dates = canonical.facts.filter((f) => f.type === "dates");
  const bullets = canonical.sections.flatMap((s) =>
    s.entries.flatMap((e) => e.bullets),
  );
  const uniqueBullets = new Set(bullets.map((b) => normalized(b.text)));
  const hasExperience = canonical.sections.some((s) => s.type === "experience");
  const rules = [
    rule(
      "parse.page-coverage",
      "Recovered page coverage",
      observedPageCoverage,
      "Coverage describes retained pages with text, not calibrated extraction accuracy.",
      evidence.spans
        .filter((s) => s.text.trim())
        .map((s) => ({ kind: "document_span" as const, id: s.id })),
      true,
    ),
    rule(
      "structure.recognized-sections",
      "Recognized section structure",
      canonical.sections.length
        ? canonical.sections.filter((s) => s.type !== "other").length /
            canonical.sections.length
        : null,
      "Unrecognized sections remain inspectable and require review.",
    ),
    rule(
      "contact.recovered",
      "Recovered contact candidates",
      contactCount / 3,
      "Observes name/email/phone recovery without rating identity or candidate merit.",
      refs(contacts),
      true,
    ),
    rule(
      "dates.order",
      "Calendar order in recovered date ranges",
      dates.length && dates.every((f) => technicalDateValid(f.value))
        ? 1
        : null,
      hasExperience
        ? "Ambiguous formats need review; year-only ranges never establish exact experience duration."
        : "No employment section is present; the date rule is not applicable.",
      refs(dates),
      false,
      !hasExperience,
    ),
    rule(
      "content.duplication",
      "Repeated bullet content",
      bullets.length ? uniqueBullets.size / bullets.length : null,
      "Repeated content cannot multiply factual or alignment credit.",
    ),
    rule(
      "format.geometry",
      "Qualified layout evidence",
      null,
      "Text alone cannot establish font, column, clipping or rendered-format compatibility.",
    ),
  ];
  const groups = new Map<string, JobRequirement[]>();
  for (const item of requirements?.requirements ?? []) {
    const key = `${item.type}:${normalized(item.value)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const alignment = [...groups.values()].map((items) => {
    const item = items[0];
    const conflict =
      new Set(
        items.map((i) => `${i.importance}:${i.importanceBasis}:${i.negated}`),
      ).size > 1;
    const match = !supported
      ? {
          state: "not_evaluated" as const,
          reason: "This domain or locale has no supported scoring policy.",
          facts: [],
        }
      : conflict
        ? {
            state: "not_evaluated" as const,
            reason: "Repeated clauses conflict; importance must be reviewed.",
            facts: [],
          }
        : proposeMatch(item, canonical);
    return {
      id: item.id,
      sourceRequirementIds: items.map((i) => i.id),
      type: item.type,
      value: item.value,
      importance: conflict ? ("unknown" as const) : item.importance,
      state:
        match.state === "not_applicable"
          ? ("not_applicable" as const)
          : ("not_evaluated" as const),
      proposedState: match.state,
      reason: match.reason,
      factIds: match.facts.slice(0, 20).map((f) => f.id),
      additionalFactCount: Math.max(0, match.facts.length - 20),
      dedupGroup: item.dedupGroup,
    };
  });
  const repairs = [
    ...(uniqueBlockers.includes("critical_evidence_missing")
      ? [
          {
            id: "evidence.critical_review",
            reason:
              "Inspect missing or conflicting critical fields and incomplete source pages.",
            target: "evidence" as const,
          },
        ]
      : []),
    ...(requirements
      ? [
          {
            id: "requirements.source_review",
            reason:
              "Verify the exact JD clauses and required/preferred importance cues.",
            target: "requirements" as const,
          },
        ]
      : [
          {
            id: "requirements.missing",
            reason: "Provide a job description before evaluating alignment.",
            target: "requirements" as const,
          },
        ]),
    ...rules
      .filter((r) => r.state !== "pass" && r.state !== "not_applicable")
      .map((r) => ({
        id: r.id,
        reason: r.reason,
        target: (r.id.startsWith("parse") || r.id.startsWith("format")
          ? "evidence"
          : "canonical") as "evidence" | "canonical",
      })),
    ...alignment
      .filter((a) => a.state !== "not_applicable")
      .map((a) => ({
        id: a.id,
        reason: a.reason,
        target: "requirements" as const,
      })),
  ].slice(0, 5);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        producer: "score-v2/1.0.1",
        policy,
        evidence,
        canonical,
        requirements,
        expectedPageCount: total,
      }),
    )
    .digest("hex");
  return ScoreDiagnosticsSchema.parse({
    schemaVersion: "score-diagnostics/1.0.0",
    score: {
      schemaVersion: "score/2.0.0",
      id: stableUuid(hash),
      ownerId: canonical.ownerId,
      organizationId: canonical.organizationId,
      analysisId: canonical.analysisId,
      createdAt: [
        canonical.createdAt,
        requirements?.createdAt ?? canonical.createdAt,
      ]
        .sort()
        .at(-1),
      producerVersion: "score-v2/1.0.1",
      retentionPolicyId: canonical.retentionPolicyId,
      inputSha256: hash,
      evidenceVersionId: evidence.id,
      canonicalVersionId: canonical.versionId,
      requirementVersionId: requirements?.id ?? null,
      policyId: policy.id,
      calibrationReceipt: null,
      state: "withheld",
      evidenceState: state,
      dimensions: policy.dimensions.map((d) => ({
        id: d.id,
        value: null,
        eligible: false,
        coverage: null,
        blockers: uniqueBlockers,
      })),
    },
    readiness: {
      state,
      observedPageCoverage,
      blockers: uniqueBlockers,
      sourceWarnings: evidence.blockers,
      confirmedFactCount: canonical.facts.filter(
        (f) => f.state === "candidate_confirmed",
      ).length,
    },
    rules,
    alignment,
    improvements: repairs,
    strengths: rules.filter((r) => r.state === "pass").map((r) => r.label),
    readinessAggregate: null,
    policyState: "draft",
  });
}
