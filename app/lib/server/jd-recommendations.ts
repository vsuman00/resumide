import { createHash } from "node:crypto";
import { z } from "zod";
import {
  RequirementCoverageSchema,
  evaluateRequirementCoverage,
} from "./requirement-coverage";
import { validateRequirementRelationshipContext } from "./requirement-relationship-context";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const coverageSchema = RequirementCoverageSchema.options[0];
const PLAN_VERSION = "jd-recommendations/1.1.0" as const;
const itemSchema = z
  .strictObject({
    id: digest,
    clauseId: digest,
    requirementQuote: z.string().min(1).max(20000),
    importance: z.enum(["required", "preferred", "contextual", "unknown"]),
    expressionKind: z.enum(["atom", "all_of", "any_of", "unknown"]),
    observation: z.enum([
      "source_related_claim",
      "recorded_declaration",
      "listed_skill_only",
      "evidence_gap",
      "review_scope",
    ]),
    target: z
      .strictObject({
        factId: z.uuid(),
        value: z.string().min(1).max(20000),
        basis: z.enum(["source_quote", "candidate_declaration"]),
        sourceQuote: z.string().min(1).max(20000).nullable(),
      })
      .nullable(),
    action: z.enum(["review_claim", "clarify_if_true", "review_requirement"]),
    reason: z.string().min(1).max(600),
    question: z.string().min(1).max(600).nullable(),
    effort: z.literal("review_required"),
  })
  .refine((item) => {
    if (
      item.target?.basis === "candidate_declaration" &&
      item.target.sourceQuote !== null
    )
      return false;
    if (
      item.target?.basis === "source_quote" &&
      item.target.sourceQuote !== item.target.value
    )
      return false;
    if (
      item.observation === "source_related_claim" &&
      item.target?.basis !== "source_quote"
    )
      return false;
    if (
      item.observation === "recorded_declaration" &&
      item.target?.basis !== "candidate_declaration"
    )
      return false;
    if (
      ["listed_skill_only", "evidence_gap", "review_scope"].includes(
        item.observation,
      ) &&
      item.target !== null
    )
      return false;
    return item.target === null
      ? item.action === "review_requirement" && item.question === null
      : item.action !== "review_requirement" &&
          (item.question === null || item.action === "clarify_if_true");
  });
export const JdRecommendationPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(PLAN_VERSION),
    binding: coverageSchema.shape.binding,
    coverageDigest: digest,
    digest,
    items: z.array(itemSchema).max(5),
    total: z.number().int().min(0).max(300),
    remainingCount: z.number().int().min(0).max(300),
    retainedClauseCount: z.number().int().min(0).max(300),
    scoreValue: z.null(),
    scoreDelta: z.null(),
    qualificationCredit: z.literal("not_assessed"),
  })
  .refine((p) => p.remainingCount === p.total - p.items.length);
export type JdRecommendationPlan = z.infer<typeof JdRecommendationPlanSchema>;
const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Local review guidance only. All evidence and relationships are recomputed from the owned context. */
export function buildJdRecommendations(
  rawContext: unknown,
  expected: {
    analysisId: string;
    ownerId: string;
    canonicalVersionId: string;
    requirementVersionId: string;
  },
): JdRecommendationPlan {
  const context = validateRequirementRelationshipContext(
    rawContext,
    expected.analysisId,
    expected.ownerId,
    {
      canonicalVersionId: expected.canonicalVersionId,
      requirementVersionId: expected.requirementVersionId,
    },
  );
  const coverage = evaluateRequirementCoverage(context);
  if (coverage.state !== "available")
    throw Error("JD_RECOMMENDATIONS_UNAVAILABLE");
  const witnesses = new Map(coverage.witnesses.map((w) => [w.id, w]));
  const facts = new Map(context.canonical.content.facts.map((f) => [f.id, f]));
  const inventory = coverage.clauses
    .filter((c) => c.duplicateOf === null)
    .map((clause, index) => {
      const related = [
        ...new Map(
          clause.operands
            .flatMap((o) => o.matches)
            .map((m) => [m.witnessId, witnesses.get(m.witnessId)]),
        ).values(),
      ].filter((w) => w !== undefined);
      const contributions = related.filter(
        (w) =>
          w.factType === "contribution" &&
          w.offsetSpace === "current_fact" &&
          w.sourceClause === null,
      );
      const ids = new Set(contributions.map((w) => w.factId));
      const placements = new Set(
        contributions.map((w) => JSON.stringify(w.location)),
      );
      const complete = clause.operands.every(
        (o) => o.additionalWitnessCount === 0 && o.additionalFactCount === 0,
      );
      const scoped =
        clause.scope.negated ||
        !["required", "preferred"].includes(clause.scope.importance) ||
        clause.expressionKind === "unknown";
      const witness =
        !scoped && complete && ids.size === 1 && placements.size === 1
          ? contributions[0]
          : undefined;
      const fact = witness ? facts.get(witness.factId) : undefined;
      const target =
        witness && fact
          ? {
              factId: fact.id,
              value: fact.value,
              basis: witness.basis,
              sourceQuote: witness.basis === "source_quote" ? fact.value : null,
            }
          : null;
      const partial =
        clause.expressionKind === "all_of" &&
        clause.operands.some(
          (o) =>
            !o.matches.some((match) => {
              const witness = witnesses.get(match.witnessId);
              return (
                witness?.factType === "contribution" &&
                witness.offsetSpace === "current_fact" &&
                witness.sourceClause === null
              );
            }),
        );
      const observation: JdRecommendationPlan["items"][number]["observation"] =
        scoped
          ? "review_scope"
          : target
            ? target.basis === "source_quote"
              ? "source_related_claim"
              : "recorded_declaration"
            : related.some((w) => w.factType === "contribution")
              ? "review_scope"
              : related.some((w) => w.tier === "listed")
                ? "listed_skill_only"
                : "evidence_gap";
      const content = {
        clauseId: clause.id,
        requirementQuote: clause.evidence.quote,
        importance: clause.scope.importance,
        expressionKind: clause.expressionKind,
        observation,
        target,
        action: target
          ? partial
            ? ("clarify_if_true" as const)
            : ("review_claim" as const)
          : ("review_requirement" as const),
        reason:
          (target
            ? "Review this exact current claim against the saved requirement. "
            : related.length
              ? "The evidence does not identify one whole current contribution to target. "
              : "No related contribution is established for this clause. ") +
          clause.explanation,
        question:
          target && partial
            ? "If true of this current contribution, what evidence supports the remaining parts of this requirement?"
            : null,
        effort: "review_required" as const,
      };
      return {
        item: {
          id: sha({ binding: coverage.binding, ...content }),
          ...content,
        },
        index,
        alreadySupported: clause.proposedState === "satisfied",
        rank: target
          ? partial
            ? 1
            : 0
          : observation === "listed_skill_only"
            ? 2
            : 3,
      };
    });
  const importance = { required: 0, preferred: 1, contextual: 2, unknown: 3 };
  inventory.sort(
    (a, b) =>
      importance[a.item.importance] - importance[b.item.importance] ||
      Number(a.alreadySupported) - Number(b.alreadySupported) ||
      a.rank - b.rank ||
      a.index - b.index,
  );
  // Within each importance tier, show distinct current contributions before repeated placements.
  const seen = new Set<string>();
  const ranked = inventory
    .map((row) => {
      const key = row.item.target?.factId;
      const repeated = key !== undefined && seen.has(row.item.importance + key);
      if (key) seen.add(row.item.importance + key);
      return { ...row, repeated };
    })
    .sort(
      (a, b) =>
        importance[a.item.importance] - importance[b.item.importance] ||
        Number(a.alreadySupported) - Number(b.alreadySupported) ||
        Number(a.repeated) - Number(b.repeated) ||
        a.rank - b.rank ||
        a.index - b.index,
    );
  const content = {
    schemaVersion: PLAN_VERSION,
    binding: coverage.binding,
    coverageDigest: coverage.digest,
    items: ranked.slice(0, 5).map((r) => r.item),
    total: inventory.length,
    remainingCount: Math.max(0, inventory.length - 5),
    retainedClauseCount: coverage.retainedClauses.length,
    scoreValue: null,
    scoreDelta: null,
    qualificationCredit: "not_assessed" as const,
  };
  return JdRecommendationPlanSchema.parse({ ...content, digest: sha(content) });
}
