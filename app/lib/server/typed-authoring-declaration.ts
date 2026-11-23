import { createHash } from "node:crypto";
import { z } from "zod";
import {
  validateRequirementRelationshipContext,
  type RequirementRelationshipContext,
} from "./requirement-relationship-context";
import { buildTypedScoreDiagnostics } from "./typed-score-diagnostics";
import {
  deriveRequirementSemanticEvidence,
  REQUIREMENT_SEMANTIC_POLICY,
  REQUIREMENT_SEMANTIC_POLICY_SHA256,
} from "./requirement-semantic-evidence";
import { resolveJobAlias } from "./job-aliases";
import {
  TypedAuthoringBindingSchema,
  TypedAuthoringError,
  TYPED_AUTHORING_POLICY,
  type TypedAuthoringReason,
} from "./typed-authoring-contract";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const TYPED_AUTHORING_DECLARATION_POLICY_VERSION =
  "typed-authoring-rules/1.1.0" as const;
export const TYPED_AUTHORING_DECLARATION_POLICY = Object.freeze({
  ...TYPED_AUTHORING_POLICY,
  version: TYPED_AUTHORING_DECLARATION_POLICY_VERSION,
  support:
    "actual whole current owner-confirmed contribution; actual fact.sources empty; unique entry/bullet; declaration only, never a source quote or qualification credit",
  declarationGrammar:
    "Built|Created|Developed lower/title + single object + using + same-clause admitted skill; optional one terminal period",
  declarationWitnessNamespace: "declaration-witness-<sha256>",
  declarationCoordinates:
    "current_fact; sourceClause=null; current citations=[]",
  declarationGuardsSha256: REQUIREMENT_SEMANTIC_POLICY_SHA256,
  declarationObjectCodePoints: 160,
  limits: Object.freeze({
    ...TYPED_AUTHORING_POLICY.limits,
    facts: 1000,
    references: 20000,
    work: 200000,
  }),
} as const);
export const TYPED_AUTHORING_DECLARATION_POLICY_SHA256 = sha(
  JSON.stringify(TYPED_AUTHORING_DECLARATION_POLICY),
);
const locationSchema = z.strictObject({
  sectionId: z.uuid(),
  entryId: z.uuid(),
  bulletId: z.uuid().nullable(),
});
export const TypedAuthoringDeclarationWitnessSchema = z.strictObject({
  id: z.string().regex(/^declaration-witness-[a-f0-9]{64}$/u),
  factId: z.uuid(),
  value: z.string().min(1).max(2000),
  location: locationSchema,
  confirmation: z.strictObject({
    actorId: z.uuid(),
    value: z.string().min(1).max(2000),
    confirmedAt: z.iso.datetime(),
  }),
  from: z.enum(["Built", "Created", "Developed"]),
  case: z.enum(["lower", "title"]),
  rest: z.string().min(1).max(2000),
  skill: z.string().min(1).max(2000),
  clauseIds: z
    .array(z.string().regex(/^[a-f0-9]{64}$/u))
    .min(1)
    .max(300),
  basis: z.literal("candidate_declaration"),
  sourceClause: z.null(),
  offsetSpace: z.literal("current_fact"),
  currentSourceCitations: z.array(z.never()).length(0),
});
export type TypedAuthoringDeclarationWitness = z.infer<
  typeof TypedAuthoringDeclarationWitnessSchema
>;
const fold = (value: string) =>
  value
    .replace(/[A-Z]/gu, (c) => c.toLowerCase())
    .replace(/[\t ]+/gu, " ")
    .trim();
const forbidden = new Set<string>([
  ...REQUIREMENT_SEMANTIC_POLICY.modality,
  ...REQUIREMENT_SEMANTIC_POLICY.agency,
  ...REQUIREMENT_SEMANTIC_POLICY.compound,
]);
function grammar(value: string) {
  if (
    /["'`“”‘’\n\r;,&]/u.test(value) ||
    (fold(value).match(/[a-z]+/gu) ?? []).some((word) => forbidden.has(word))
  )
    throw new TypedAuthoringError("unsupported_action");
  const head =
    /^(Built|Created|Developed|built|created|developed)(?=[\t ])/u.exec(value);
  if (!head) throw new TypedAuthoringError("unsupported_action");
  const body = value.endsWith(".") ? value.slice(0, -1) : value;
  const parts =
    /^(?:Built|Created|Developed)[\t ]+(\S(?:.*?\S)?)[\t ]+using[\t ]+(\S(?:.*\S)?)$/iu.exec(
      body,
    );
  if (
    !parts ||
    Array.from(parts[1]).length > 160 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Pc}\p{Pd} /\t]*$/u.test(parts[1])
  )
    throw new TypedAuthoringError("unsupported_action");
  const from = head[1].toLowerCase();
  return {
    from:
      from === "built"
        ? ("Built" as const)
        : from === "created"
          ? ("Created" as const)
          : ("Developed" as const),
    case: head[1] === from ? ("lower" as const) : ("title" as const),
    rest: value.slice(head[1].length),
    skill: parts[2],
  };
}

/** Internally derives editorial declaration witnesses from the actual admitted
 * reader context. The returned data is not an authorization/caller proof. */
export function deriveTypedAuthoringDeclarations(raw: unknown) {
  let context: Extract<RequirementRelationshipContext, { status: "available" }>;
  try {
    const key = z
      .object({
        source: z.object({ ownerId: z.uuid(), analysisId: z.uuid() }),
        canonical: z.object({ versionId: z.uuid() }),
        requirements: z.object({ versionId: z.uuid() }),
      })
      .parse(raw);
    context = validateRequirementRelationshipContext(
      raw,
      key.source.analysisId,
      key.source.ownerId,
      {
        canonicalVersionId: key.canonical.versionId,
        requirementVersionId: key.requirements.versionId,
      },
    );
  } catch {
    throw new TypedAuthoringError("invalid_context");
  }
  const result = buildTypedScoreDiagnostics(context);
  const semantic = deriveRequirementSemanticEvidence(context);
  if (semantic.state !== "available")
    throw new TypedAuthoringError("invalid_context");
  if (
    result.diagnostics.readiness.state !== "review_required" ||
    context.canonical.locale !== "en-IN" ||
    context.requirements.content.state === "unsupported"
  )
    throw new TypedAuthoringError("unsupported_context");
  if (result.diagnostics.readiness.observedPageCoverage !== 1)
    throw new TypedAuthoringError("incomplete_source_coverage");
  const binding = TypedAuthoringBindingSchema.parse({
    source: context.source,
    canonical: {
      versionId: context.canonical.versionId,
      revision: context.canonical.revision,
      contentSha256: context.canonical.contentSha256,
    },
    requirements: {
      versionId: context.requirements.versionId,
      revision: context.requirements.revision,
      inputSha256: context.requirements.inputSha256,
      contentSha256: context.requirements.contentSha256,
    },
    heads: context.heads,
    profilesSha256: sha(JSON.stringify(context.profiles)),
  });
  let work = 0,
    references = 0;
  const charge = (n = 1) => {
    work += n;
    if (work > 200000) throw new TypedAuthoringError("unsupported_context");
  };
  const locations = new Map<string, z.infer<typeof locationSchema>[]>();
  const other = new Set(context.canonical.content.contactFactIds);
  for (const section of context.canonical.content.sections) {
    charge();
    for (const factId of section.factIds) {
      charge();
      other.add(factId);
    }
    for (const entry of section.entries) {
      charge();
      const add = (ids: string[], bulletId: string | null) => {
        for (const factId of ids) {
          charge();
          if (++references > 20000)
            throw new TypedAuthoringError("unsupported_context");
          let places = locations.get(factId);
          if (!places) {
            places = [];
            locations.set(factId, places);
          }
          places.push({ sectionId: section.id, entryId: entry.id, bulletId });
        }
      };
      add(entry.factIds, null);
      for (const bullet of entry.bullets) {
        charge();
        add(bullet.factIds, bullet.id);
      }
    }
  }
  const bySkill = new Map<string, Set<string>>();
  for (const clause of result.typedCoverage.clauses) {
    charge();
    if (
      clause.scope.negated ||
      !["required", "preferred"].includes(clause.scope.importance)
    )
      continue;
    for (const operand of clause.operands) {
      charge();
      const key = operand.mapping.conceptId ?? "literal:" + fold(operand.value);
      let ids = bySkill.get(key);
      if (!ids) {
        ids = new Set();
        bySkill.set(key, ids);
      }
      ids.add(clause.id);
    }
  }
  if (context.canonical.content.facts.length > 1000)
    throw new TypedAuthoringError("unsupported_context");
  const witnesses: TypedAuthoringDeclarationWitness[] = [];
  const failures = new Map<string, TypedAuthoringReason>();
  for (const fact of context.canonical.content.facts) {
    charge();
    if (fact.type !== "contribution" || fact.sources.length !== 0) continue;
    if (
      fact.state !== "candidate_confirmed" ||
      !fact.confirmation ||
      fact.confirmation.actorId !== context.source.ownerId ||
      fact.confirmation.value !== fact.value
    ) {
      failures.set(fact.id, "confirmation_required");
      continue;
    }
    const places = locations.get(fact.id) ?? [];
    if (other.has(fact.id) || places.length !== 1) {
      failures.set(fact.id, "ambiguous_location");
      continue;
    }
    try {
      const claim = grammar(fact.value);
      const mapping = resolveJobAlias(claim.skill);
      const clauseIds = [
        ...(bySkill.get(mapping.conceptId ?? "literal:" + fold(claim.skill)) ??
          []),
      ];
      charge(clauseIds.length);
      if (!clauseIds.length) {
        failures.set(fact.id, "missing_current_witness");
        continue;
      }
      const body = {
        factId: fact.id,
        value: fact.value,
        location: places[0],
        confirmation: fact.confirmation,
        ...claim,
        clauseIds,
        basis: "candidate_declaration" as const,
        sourceClause: null,
        offsetSpace: "current_fact" as const,
        currentSourceCitations: [],
      };
      witnesses.push(
        TypedAuthoringDeclarationWitnessSchema.parse({
          id:
            "declaration-witness-" +
            sha(
              JSON.stringify([
                TYPED_AUTHORING_DECLARATION_POLICY_SHA256,
                binding,
                body,
              ]),
            ),
          ...body,
        }),
      );
    } catch (error) {
      if (!(error instanceof TypedAuthoringError)) throw error;
      if (error.reason === "unsupported_context") throw error;
      failures.set(fact.id, error.reason);
    }
  }
  return {
    context,
    binding,
    diagnosticDigest: result.diagnostics.score.inputSha256,
    coverageDigest: result.typedCoverage.digest,
    semanticDigest: sha(JSON.stringify(semantic)),
    witnesses,
    failures,
  };
}
