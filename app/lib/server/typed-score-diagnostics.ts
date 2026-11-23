import { createHash } from "node:crypto";
import { z } from "zod";
import {
  buildTechnicalScoreRules,
  ScoreDiagnosticsSchema,
} from "./score-v2-engine";
import { getDraftScorePolicy } from "./score-v2-contract";
import {
  evaluateRequirementCoverage,
  RequirementCoverageSchema,
} from "./requirement-coverage";
import { validateRequirementRelationshipContext } from "./requirement-relationship-context";

export const TYPED_SCORE_DIAGNOSTIC_PRODUCER = "score-v2/typed-1.0.1" as const;
export const TypedScoreDiagnosticsSchema = ScoreDiagnosticsSchema.extend({
  schemaVersion: z.literal("score-diagnostics/typed-1.0.0"),
  score: ScoreDiagnosticsSchema.shape.score.refine(
    (score) => score.producerVersion === TYPED_SCORE_DIAGNOSTIC_PRODUCER,
  ),
  readiness: ScoreDiagnosticsSchema.shape.readiness.extend({
    declaredPageCount: z.number().int().min(1).max(2_147_483_647).nullable(),
    observedPageCoverage: z.number().min(0).max(1).nullable(),
  }),
  // Typed clause identities and witnesses belong to the strict sidecar.
  alignment: ScoreDiagnosticsSchema.shape.alignment.length(0),
});
export type TypedScoreDiagnostics = z.infer<typeof TypedScoreDiagnosticsSchema>;
export const TypedScoreDiagnosticResultSchema = z
  .strictObject({
    diagnostics: TypedScoreDiagnosticsSchema,
    typedCoverage: RequirementCoverageSchema.options[0],
  })
  .superRefine(({ diagnostics, typedCoverage }, ctx) => {
    const score = diagnostics.score,
      binding = typedCoverage.binding;
    if (
      score.ownerId !== binding.source.ownerId ||
      score.organizationId !== binding.source.organizationId ||
      score.analysisId !== binding.source.analysisId ||
      score.evidenceVersionId !== binding.attemptId ||
      score.canonicalVersionId !== binding.canonical.versionId ||
      score.requirementVersionId !== binding.requirements.versionId
    )
      ctx.addIssue({
        code: "custom",
        message: "Typed diagnostic binding mismatch",
      });
  });
export type TypedScoreDiagnosticResult = z.infer<
  typeof TypedScoreDiagnosticResultSchema
>;

/** Derives all semantic witnesses and coverage from one admitted owned context.
 * It never accepts supplied matches, numeric scores or relationship booleans. */
export function buildTypedScoreDiagnostics(
  rawContext: unknown,
): TypedScoreDiagnosticResult {
  const key = z
    .object({
      source: z.object({ analysisId: z.uuid(), ownerId: z.uuid() }),
      canonical: z.object({ versionId: z.uuid() }),
      requirements: z.object({ versionId: z.uuid() }),
    })
    .parse(rawContext);
  const context = validateRequirementRelationshipContext(
    rawContext,
    key.source.analysisId,
    key.source.ownerId,
    {
      canonicalVersionId: key.canonical.versionId,
      requirementVersionId: key.requirements.versionId,
    },
  );
  const typedCoverage = evaluateRequirementCoverage(context);
  if (typedCoverage.state !== "available")
    throw Error("TYPED_COVERAGE_UNAVAILABLE");
  const { content: canonical } = context.canonical,
    { content: requirements } = context.requirements,
    evidence = context.attempt.envelope,
    declaredPageCount = context.sourceMetadata.pageCount,
    policy = getDraftScorePolicy();
  if (
    declaredPageCount !== null &&
    declaredPageCount < evidence.nativeSource.pages.length
  )
    throw Error("INVALID_DECLARED_PAGE_COUNT");
  const populated = evidence.nativeSource.pages.filter(
    (page) =>
      evidence.spans.some(
        (span) => span.pageId === page.id && span.text.trim(),
      ) ||
      evidence.ocrSource?.pages.some(
        (p) => p.pageNumber === page.pageNumber && p.text.trim(),
      ),
  ).length;
  const observedPageCoverage =
    declaredPageCount === null ? null : populated / declaredPageCount;
  const supported =
    canonical.locale === policy.locale &&
    requirements.locale === policy.locale &&
    requirements.domain === policy.domain &&
    requirements.state !== "unsupported";
  const blockers: z.infer<
    typeof ScoreDiagnosticsSchema
  >["readiness"]["blockers"] = [
    "calibration_not_approved",
    "coverage_policy_unknown",
    "requirements_review_required",
  ];
  blockers.push(
    evidence.status === "review_required"
      ? "extraction_review_required"
      : evidence.status === "unsupported"
        ? "unsupported_input"
        : "critical_evidence_missing",
  );
  if (
    observedPageCoverage === null ||
    observedPageCoverage < 1 ||
    evidence.fields.some(
      (field) => field.state === "not_evaluated" || field.state === "conflict",
    )
  )
    blockers.push("critical_evidence_missing");
  if (!supported) blockers.push("unsupported_input");
  const uniqueBlockers = [...new Set(blockers)].sort();
  const state =
    !supported || evidence.status === "unsupported"
      ? ("unsupported" as const)
      : evidence.status === "insufficient" ||
          evidence.status === "failed" ||
          !populated
        ? ("insufficient" as const)
        : ("review_required" as const);
  const rules = buildTechnicalScoreRules(
    evidence,
    canonical,
    observedPageCoverage,
  );
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        producer: TYPED_SCORE_DIAGNOSTIC_PRODUCER,
        policy,
        binding: typedCoverage.binding,
        coverageDigest: typedCoverage.digest,
        declaredPageCount,
      }),
    )
    .digest("hex");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return TypedScoreDiagnosticResultSchema.parse({
    diagnostics: {
      schemaVersion: "score-diagnostics/typed-1.0.0",
      score: {
        schemaVersion: "score/2.0.0",
        id,
        ownerId: canonical.ownerId,
        organizationId: canonical.organizationId,
        analysisId: canonical.analysisId,
        createdAt: [canonical.createdAt, requirements.createdAt].sort().at(-1),
        producerVersion: TYPED_SCORE_DIAGNOSTIC_PRODUCER,
        retentionPolicyId: canonical.retentionPolicyId,
        inputSha256: digest,
        evidenceVersionId: evidence.id,
        canonicalVersionId: canonical.versionId,
        requirementVersionId: requirements.id,
        policyId: policy.id,
        calibrationReceipt: null,
        state: "withheld",
        evidenceState: state,
        dimensions: policy.dimensions.map((dimension) => ({
          id: dimension.id,
          value: null,
          eligible: false,
          coverage: null,
          blockers: uniqueBlockers,
        })),
      },
      readiness: {
        state,
        declaredPageCount,
        observedPageCoverage,
        blockers: uniqueBlockers,
        sourceWarnings: evidence.blockers,
        confirmedFactCount: canonical.facts.filter(
          (fact) => fact.state === "candidate_confirmed",
        ).length,
      },
      rules,
      alignment: [],
      improvements: [
        ...(uniqueBlockers.includes("critical_evidence_missing")
          ? [
              {
                id: "evidence.critical_review",
                reason:
                  "Inspect missing or conflicting critical fields and incomplete or unknown source-page coverage.",
                target: "evidence" as const,
              },
            ]
          : []),
        {
          id: "requirements.typed_review",
          reason:
            "Review the exact typed clauses, semantic witnesses and unresolved evidence in the requirement coverage panel.",
          target: "requirements" as const,
        },
        ...rules
          .filter(
            (rule) => rule.state !== "pass" && rule.state !== "not_applicable",
          )
          .map((rule) => ({
            id: rule.id,
            reason: rule.reason,
            target:
              rule.id.startsWith("parse") || rule.id.startsWith("format")
                ? ("evidence" as const)
                : ("canonical" as const),
          })),
      ].slice(0, 5),
      strengths: rules
        .filter((rule) => rule.state === "pass")
        .map((rule) => rule.label),
      readinessAggregate: null,
      policyState: "draft",
    },
    typedCoverage,
  });
}
