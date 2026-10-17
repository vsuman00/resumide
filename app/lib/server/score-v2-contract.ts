import { z } from "zod";

export const ScoreDimensionId = z.enum([
  "ats_compatibility",
  "job_alignment_required",
  "job_alignment_preferred",
]);
export const ScoreRuleState = z.enum([
  "pass",
  "partial",
  "fail",
  "not_applicable",
  "not_evaluated",
]);
export const ScoreBlocker = z.enum([
  "calibration_not_approved",
  "extraction_review_required",
  "critical_evidence_missing",
  "unsupported_input",
  "requirements_review_required",
  "job_description_missing",
  "coverage_policy_unknown",
]);

// AA0-approved interface only. Drafts cannot carry calibrated weights or bands.
export const ScorePolicyDraftSchema = z
  .strictObject({
    schemaVersion: z.literal("score-policy/1.0.0"),
    id: z.string().min(1).max(100),
    state: z.literal("draft"),
    domain: z.literal("software-engineering"),
    locale: z.literal("en-IN"),
    calibrationReceipt: z.null(),
    confidencePolicyId: z.null(),
    dimensions: z
      .array(
        z.strictObject({
          id: ScoreDimensionId,
          weight: z.null(),
          minimumCoverage: z.null(),
          bands: z.array(z.never()).length(0),
        }),
      )
      .length(3),
    normalization: z.literal("weighted_evaluated_over_evaluated_weight"),
    coverage: z.literal("evaluated_weight_over_applicable_weight"),
    zeroDenominator: z.literal("null"),
    criticalUnknown: z.literal("withhold"),
    readinessAggregate: z.literal("disabled"),
  })
  .superRefine((policy, context) => {
    if (new Set(policy.dimensions.map((d) => d.id)).size !== 3)
      context.addIssue({
        code: "custom",
        message: "Every dimension must appear exactly once",
      });
  });
export type ScorePolicyDraft = z.infer<typeof ScorePolicyDraftSchema>;
const draft: ScorePolicyDraft = {
  schemaVersion: "score-policy/1.0.0",
  id: "software-engineering-en-IN/draft-1.0.0",
  state: "draft",
  domain: "software-engineering",
  locale: "en-IN",
  calibrationReceipt: null,
  confidencePolicyId: null,
  dimensions: [
    "ats_compatibility",
    "job_alignment_required",
    "job_alignment_preferred",
  ].map((id) => ({
    id: id as z.infer<typeof ScoreDimensionId>,
    weight: null,
    minimumCoverage: null,
    bands: [],
  })),
  normalization: "weighted_evaluated_over_evaluated_weight",
  coverage: "evaluated_weight_over_applicable_weight",
  zeroDenominator: "null",
  criticalUnknown: "withhold",
  readinessAggregate: "disabled",
};
export function getDraftScorePolicy(id = draft.id): ScorePolicyDraft {
  if (id !== draft.id) throw new Error("UNKNOWN_SCORE_POLICY_VERSION");
  return ScorePolicyDraftSchema.parse(structuredClone(draft));
}

export const WithheldScoreV2Schema = z
  .strictObject({
    schemaVersion: z.literal("score/2.0.0"),
    id: z.uuid(),
    ownerId: z.uuid(),
    organizationId: z.uuid(),
    analysisId: z.uuid(),
    createdAt: z.iso.datetime(),
    producerVersion: z.enum([
      "score-v2/preparation-1.0.0",
      "score-v2/1.0.0",
      "score-v2/1.0.1",
    ]),
    retentionPolicyId: z.string().min(1).max(100),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    evidenceVersionId: z.uuid().nullable(),
    canonicalVersionId: z.uuid().nullable(),
    requirementVersionId: z.uuid().nullable(),
    policyId: z.string().min(1).max(100),
    calibrationReceipt: z.null(),
    state: z.literal("withheld"),
    evidenceState: z.enum(["review_required", "insufficient", "unsupported"]),
    dimensions: z
      .array(
        z.strictObject({
          id: ScoreDimensionId,
          value: z.null(),
          eligible: z.literal(false),
          coverage: z.null(),
          blockers: z.array(ScoreBlocker).min(1).max(10),
        }),
      )
      .length(3),
  })
  .superRefine((score, context) => {
    if (new Set(score.dimensions.map((d) => d.id)).size !== 3)
      context.addIssue({
        code: "custom",
        message: "Duplicate or missing score dimensions",
      });
    if (
      score.dimensions.some(
        (d) => !d.blockers.includes("calibration_not_approved"),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Unapproved calibration cannot be hidden",
      });
  });

const LegacyScoreSchema = z.strictObject({
  value: z.number().min(0).max(100).nullable(),
  scoringVersion: z.string().min(1).max(100).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  kind: z.enum(["legacy_blended", "deterministic_baseline"]),
});
export function presentLegacyScore(raw: unknown) {
  const record = LegacyScoreSchema.parse(raw);
  return {
    ...record,
    label: "Legacy analysis score",
    v2Comparable: false as const,
  };
}
