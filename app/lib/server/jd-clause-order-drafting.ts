import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type RequirementRelationshipContext,
  validateRequirementRelationshipContext,
} from "./requirement-relationship-context";
import {
  TypedAuthoringBindingSchema,
  TypedAuthoringSelectionSchema,
  TypedAuthoringTargetSchema,
  TypedAuthoringPatchSchema,
  TypedAuthoringError,
} from "./typed-authoring-contract";
import {
  buildWritingSupportDocument,
  assessWritingSupport,
  WRITING_SUPPORT_POLICY_VERSION,
} from "./writing-support";
import { resolveJobAlias } from "./job-aliases";
import type { JobRequirementRelations } from "./job-requirement-admission";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const JD_CLAUSE_ORDER_POLICY_VERSION =
  "jd-clause-order-rules/2.0.0" as const;
export const JD_CLAUSE_ORDER_POLICY = Object.freeze({
  version: JD_CLAUSE_ORDER_POLICY_VERSION,
  writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
  source:
    "whole-current-owner-confirmed-source-quote;unique-current-placement;selected-full-stream-scope",
  grammar:
    "exactly two Built/Created/Developed object using skill clauses;literal semicolon-space;optional final period;no metrics or dependencies",
  relevance:
    "saved-positive-required/preferred-atomic-skill;exact-literal-or-existing-approved-alias;second-only",
  renderer:
    "C1 + semicolon-space + C0 + original terminal;unchanged clause bytes",
  limits: Object.freeze({
    factUtf16: 2000,
    sourceUtf16: 100000,
    sourceCitations: 20,
    clauses: 2,
  }),
  numerics: "withheld",
});
export const JD_CLAUSE_ORDER_POLICY_SHA256 = sha(
  JSON.stringify(JD_CLAUSE_ORDER_POLICY),
);
export const JdClauseOrderSelectionSchema = TypedAuthoringSelectionSchema;
const digest = z.string().regex(/^[a-f0-9]{64}$/u),
  text = z.string().min(1).max(2000);
const sourceClause = z.strictObject({
  index: z.union([z.literal(0), z.literal(1)]),
  start: z.number().int().nonnegative().max(2000),
  end: z.number().int().positive().max(2000),
  text,
  sha256: digest,
});
const operations = z.enum([
  "copy_source",
  "normalize_layout",
  "replace_equivalent_action",
  "reorder_independent_clauses",
  "compose_explicit_role_contribution",
  "editorial_explanation",
]);
const DraftBodySchema = z.strictObject({
  schemaVersion: z.literal("jd-clause-order-draft/2.0.0"),
  selection: JdClauseOrderSelectionSchema,
  binding: TypedAuthoringBindingSchema,
  policies: z.strictObject({
    clauseOrderVersion: z.literal(JD_CLAUSE_ORDER_POLICY_VERSION),
    clauseOrderSha256: z.literal(JD_CLAUSE_ORDER_POLICY_SHA256),
    writingSupportVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
  }),
  target: TypedAuthoringTargetSchema,
  sourceCitations: TypedAuthoringPatchSchema.shape.sourceCitations.min(1),
  sourceClauses: z.tuple([sourceClause, sourceClause]),
  relevance: z.strictObject({
    clauseId: digest,
    quote: text,
    importance: z.enum(["required", "preferred"]),
    expressionKind: z.literal("atom"),
    movedSourceClauseIndex: z.literal(1),
    conceptId: z.string().min(1).max(100).nullable(),
    sourceSkillValue: text,
    jdSkillValue: text,
  }),
  transform: z.strictObject({
    kind: z.literal("reorder_source_clauses"),
    order: z.tuple([z.literal(1), z.literal(0)]),
    rendererVersion: z.literal("jd-two-clause-renderer/1.0.0"),
    terminal: z.enum(["", "."]),
  }),
  before: text,
  after: text,
  support: z.strictObject({
    basis: z.literal("source_quote"),
    offsetSpace: z.literal("current_fact"),
    writingSupportVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
    sourceSha256: digest,
    sourceAnchorIds: z.array(digest).min(1).max(512),
    operations: z.array(operations).min(1).max(32),
  }),
  scoreValue: z.null(),
  scoreDelta: z.null(),
  qualificationCredit: z.literal("not_assessed"),
});
export const JdClauseOrderDraftSchema = DraftBodySchema.extend({
  id: digest,
}).refine((d) => {
  const { id, ...body } = d;
  return (
    id === sha(JSON.stringify(body)) &&
    d.before !== d.after &&
    d.sourceClauses.every(
      (c, i) =>
        c.index === i &&
        c.end > c.start &&
        Array.from(d.before).slice(c.start, c.end).join("") === c.text &&
        sha(c.text) === c.sha256,
    ) &&
    d.after ===
      d.sourceClauses[1].text +
        "; " +
        d.sourceClauses[0].text +
        d.transform.terminal
  );
});
export type JdClauseOrderDraft = z.infer<typeof JdClauseOrderDraftSchema>;
const fail: (
  reason: ConstructorParameters<typeof TypedAuthoringError>[0],
) => never = (reason) => {
  throw new TypedAuthoringError(reason);
};
const fold = (s: string) =>
  s
    .replace(/[A-Z]/gu, (c) => c.toLowerCase())
    .replace(/[\t ]+/gu, " ")
    .trim();
const forbidden =
  /\b(?:not|no|never|without|cannot|will|would|could|may|might|shall|should|if|unless|planned|planning|future|intend|intended|aim|goal|potential|i|we|he|she|they|it|them|their|our|my|his|her|you|your|its|team|teams|by|and|or|but|then|before|after|because|thereby|following|while|alongside|together|plus|also|this|that|these|those|former|latter|respectively)\b/iu;
function clauses(value: string) {
  if (/[\r\n\d"'`“”‘’]/u.test(value) || forbidden.test(value))
    fail("unsupported_action");
  const terminal = value.endsWith(".") ? "." : "",
    body = terminal ? value.slice(0, -1) : value,
    parts = body.split("; ");
  if (parts.length !== 2 || parts.some((p) => /[;.!?:]/u.test(p)))
    fail("unsupported_action");
  const skills = parts.map((part) => {
    const matched =
      /^(?:Built|Created|Developed|built|created|developed)[ ](?<object>[\p{L}][\p{L}\p{M} -]{0,159}) using (?<skill>[\p{L}][\p{L}\p{M}+# -]{0,79})$/u.exec(
        part,
      );
    if (!matched?.groups || part.trim() !== part) fail("unsupported_action");
    return matched.groups.skill;
  });
  const firstLength = Array.from(parts[0]).length,
    secondStart = firstLength + 2;
  return {
    terminal,
    parts,
    skills,
    spans: [
      {
        index: 0 as const,
        start: 0,
        end: firstLength,
        text: parts[0],
        sha256: sha(parts[0]),
      },
      {
        index: 1 as const,
        start: secondStart,
        end: secondStart + Array.from(parts[1]).length,
        text: parts[1],
        sha256: sha(parts[1]),
      },
    ] as const,
  };
}

type SavedClause = JobRequirementRelations["relations"]["clauses"][number];
function editableAtom(clause: SavedClause) {
  return !clause.scope.negated &&
    ["required", "preferred"].includes(clause.scope.importance) &&
    clause.skillExpression.kind === "atom"
    ? clause.skillExpression
    : null;
}

function skillKeys(value: string) {
  const keys = [`literal:${fold(value)}`];
  const concept = resolveJobAlias(value).conceptId;
  if (concept !== null) keys.push(`concept:${concept}`);
  return keys;
}

function atomKey(atom: NonNullable<ReturnType<typeof editableAtom>>) {
  return atom.mapping.conceptId === null
    ? `literal:${fold(atom.value)}`
    : `concept:${atom.mapping.conceptId}`;
}
/** A local projected source transform. This does not mint a mutation command or saved authority. */
export function buildJdClauseOrderDraft(
  rawContext: unknown,
  expected: { analysisId: string; ownerId: string },
  rawSelection: unknown,
): JdClauseOrderDraft {
  try {
    const selection = JdClauseOrderSelectionSchema.parse(rawSelection);
    const context = validateRequirementRelationshipContext(
      rawContext,
      expected.analysisId,
      expected.ownerId,
      {
        canonicalVersionId: selection.canonicalVersionId,
        requirementVersionId: selection.requirementVersionId,
      },
    );
    return draftFromValidated(context, expected, selection);
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    fail("invalid_context");
  }
}

/** Rebuild the original proposal binding from an owned immutable selected pair.
 * Current reader heads remain untouched; only Native decides fresh-head admission. */
export function rebuildOriginalJdClauseOrderDraft(
  rawContext: unknown,
  expected: { analysisId: string; ownerId: string },
  rawSelection: unknown,
): JdClauseOrderDraft {
  try {
    const selection = JdClauseOrderSelectionSchema.parse(rawSelection);
    const context = validateRequirementRelationshipContext(
      rawContext,
      expected.analysisId,
      expected.ownerId,
      {
        canonicalVersionId: selection.canonicalVersionId,
        requirementVersionId: selection.requirementVersionId,
      },
    );
    const proposalHeads = {
      canonicalHeadId: context.canonical.versionId,
      canonicalHeadRevision: context.canonical.revision,
      requirementHeadId: context.requirements.versionId,
      requirementHeadRevision: context.requirements.revision,
    };
    return draftFromValidated(
      context,
      expected,
      selection,
      requireDraftContext(context, "original"),
      undefined,
      proposalHeads,
    );
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    fail("invalid_context");
  }
}

function requireDraftContext(
  context: RequirementRelationshipContext,
  freshness: "fresh" | "original" = "fresh",
) {
  const { canonical, requirements, heads, attempt } = context;
  if (
    freshness === "fresh" &&
    (canonical.versionId !== heads.canonicalHeadId ||
      canonical.revision !== heads.canonicalHeadRevision ||
      requirements.versionId !== heads.requirementHeadId ||
      requirements.revision !== heads.requirementHeadRevision)
  )
    fail("stale_inputs");
  if (
    canonical.locale !== "en-IN" ||
    requirements.content.locale !== "en-IN" ||
    requirements.content.domain !== "software-engineering" ||
    requirements.content.state === "unsupported" ||
    attempt.envelope.status !== "review_required" ||
    attempt.envelope.ocrFailure !== null
  )
    fail("unsupported_context");
  const pages = attempt.envelope.nativeSource.pages;
  if (
    context.sourceMetadata.pageCount === null ||
    pages.length !== context.sourceMetadata.pageCount
  )
    fail("incomplete_source_coverage");
  const streams = pages.map((page) => {
    const ocr = attempt.envelope.ocrSource?.pages.find(
      (p) => p.pageNumber === page.pageNumber,
    );
    return {
      pageId: ocr?.pageId ?? page.id,
      method: ocr ? ("local_ocr" as const) : ("native_text" as const),
      text: ocr?.text ?? page.text,
    };
  });
  if (streams.some((p) => !p.text.trim())) fail("incomplete_source_coverage");
  return streams;
}

function prepareWritingContext(
  streams: ReturnType<typeof requireDraftContext>,
) {
  let sourceText = "",
    offset = 0;
  const bases = new Map<string, number>();
  for (const stream of streams) {
    bases.set(JSON.stringify([stream.pageId, stream.method]), offset);
    sourceText += stream.text + "\n\n";
    offset += Array.from(stream.text).length + 2;
  }
  sourceText = sourceText.slice(0, -2);
  return { writing: buildWritingSupportDocument(sourceText), bases };
}

function draftFromValidated(
  context: RequirementRelationshipContext,
  expected: { analysisId: string; ownerId: string },
  selection: z.infer<typeof JdClauseOrderSelectionSchema>,
  streams = requireDraftContext(context),
  preparedWriting?: ReturnType<typeof prepareWritingContext>,
  proposalHeads?: z.infer<typeof TypedAuthoringBindingSchema>["heads"],
): JdClauseOrderDraft {
  const { canonical, requirements, heads, attempt } = context;
  const fact = canonical.content.facts.find(
    (f) => f.id === selection.targetFactId,
  );
  if (!fact || fact.type !== "contribution") fail("target_not_editable");
  if (
    fact.state !== "candidate_confirmed" ||
    !fact.confirmation ||
    fact.confirmation.actorId !== expected.ownerId ||
    fact.confirmation.value !== fact.value
  )
    fail("confirmation_required");
  const locations: {
    sectionId: string;
    entryId: string;
    bulletId: string | null;
  }[] = [];
  if (
    canonical.content.contactFactIds.includes(fact.id) ||
    canonical.content.sections.some((s) => s.factIds.includes(fact.id))
  )
    fail("ambiguous_location");
  for (const section of canonical.content.sections)
    for (const entry of section.entries) {
      if (entry.factIds.includes(fact.id))
        locations.push({
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
        });
      for (const bullet of entry.bullets)
        if (bullet.factIds.includes(fact.id))
          locations.push({
            sectionId: section.id,
            entryId: entry.id,
            bulletId: bullet.id,
          });
    }
  if (locations.length !== 1) fail("ambiguous_location");
  const parsed = clauses(fact.value);
  const clause = requirements.content.relations.clauses.find(
    (c) => c.id === selection.clauseId,
  );
  const atom = clause && editableAtom(clause);
  if (!atom) fail("target_not_editable");
  const key = atomKey(atom);
  if (skillKeys(parsed.skills[0]).includes(key)) fail("no_change");
  if (!skillKeys(parsed.skills[1]).includes(key))
    fail("missing_current_witness");
  if (fact.sources.length === 0) fail("missing_current_witness");
  const { writing, bases } = preparedWriting ?? prepareWritingContext(streams);
  const anchors: string[] = [],
    seen = new Set<string>();
  const sourceCitations = fact.sources.map((cite) => {
    const span = attempt.envelope.spans.find((s) => s.id === cite.spanId);
    if (!span || cite.attemptId !== attempt.id) fail("missing_current_witness");
    const key = JSON.stringify([span.pageId, span.method]),
      base = bases.get(key),
      stream = streams.find(
        (s) => JSON.stringify([s.pageId, s.method]) === key,
      );
    if (
      base === undefined ||
      !stream ||
      Array.from(stream.text).slice(span.start, span.end).join("") !==
        span.text ||
      Array.from(span.text).slice(cite.start, cite.end).join("") !== fact.value
    )
      fail("missing_current_witness");
    const prefix = Array.from(span.text).slice(0, cite.start).join(""),
      suffix = Array.from(span.text).slice(cite.end).join("");
    if (!/^[\t ]*$/u.test(prefix) || !/^[\t ]*$/u.test(suffix))
      fail("fragmented_source_clause");
    const exact = writing.anchors.filter(
      (a) =>
        a.span.start === base + span.start + cite.start &&
        a.span.text === fact.value,
    );
    if (
      exact.length !== 1 ||
      exact[0].context.kind !== "unqualified_resume_clause" ||
      !exact[0].reorderable ||
      exact[0].clauses.length !== 2 ||
      exact[0].clauses.some(
        (c) =>
          c.actor.kind !== "implicit_source_subject" ||
          c.negated ||
          c.metrics.length > 0,
      )
    )
      fail("writing_support_rejected");
    const identity = JSON.stringify(cite);
    if (seen.has(identity)) fail("missing_current_witness");
    seen.add(identity);
    anchors.push(exact[0].span.id);
    return {
      ...cite,
      pageId: span.pageId,
      method: span.method,
      pageStart: span.start + cite.start,
      pageEnd: span.start + cite.end,
    };
  });
  const after = parsed.parts[1] + "; " + parsed.parts[0] + parsed.terminal;
  if (after === fact.value) fail("no_change");
  const support = assessWritingSupport(writing, {
    kind: "rewrite",
    original: fact.value,
    proposed: after,
    expectedSourceSha256: writing.sourceSha256,
    expectedPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
  });
  if (
    support.state !== "supported" ||
    !support.operations.some((o) => o.kind === "reorder_independent_clauses") ||
    support.sourceAnchorIds.some((id) => !anchors.includes(id))
  )
    fail("writing_support_rejected");
  const body = DraftBodySchema.parse({
    schemaVersion: "jd-clause-order-draft/2.0.0",
    selection,
    binding: {
      source: context.source,
      canonical: {
        versionId: canonical.versionId,
        revision: canonical.revision,
        contentSha256: canonical.contentSha256,
      },
      requirements: {
        versionId: requirements.versionId,
        revision: requirements.revision,
        inputSha256: requirements.inputSha256,
        contentSha256: requirements.contentSha256,
      },
      heads: proposalHeads ?? heads,
      profilesSha256: sha(JSON.stringify(context.profiles)),
    },
    policies: {
      clauseOrderVersion: JD_CLAUSE_ORDER_POLICY_VERSION,
      clauseOrderSha256: JD_CLAUSE_ORDER_POLICY_SHA256,
      writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
    },
    target: {
      factId: fact.id,
      ...locations[0],
      currentValueSha256: sha(fact.value),
      confirmationActorId: fact.confirmation.actorId,
      confirmedAt: fact.confirmation.confirmedAt,
    },
    sourceCitations,
    sourceClauses: parsed.spans,
    relevance: {
      clauseId: clause.id,
      quote: clause.evidence.quote,
      importance: clause.scope.importance,
      expressionKind: "atom",
      movedSourceClauseIndex: 1,
      conceptId: atom.mapping.conceptId,
      sourceSkillValue: parsed.skills[1],
      jdSkillValue: atom.value,
    },
    transform: {
      kind: "reorder_source_clauses",
      order: [1, 0],
      rendererVersion: "jd-two-clause-renderer/1.0.0",
      terminal: parsed.terminal,
    },
    before: fact.value,
    after,
    support: {
      basis: "source_quote",
      offsetSpace: "current_fact",
      writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
      sourceSha256: writing.sourceSha256,
      sourceAnchorIds: support.sourceAnchorIds,
      operations: support.operations.map((o) => o.kind),
    },
    scoreValue: null,
    scoreDelta: null,
    qualificationCredit: "not_assessed",
  });
  return JdClauseOrderDraftSchema.parse({
    ...body,
    id: sha(JSON.stringify(body)),
  });
}

const PLAN_VERSION = "jd-clause-order-plan/2.1.0" as const;
const PlanBodySchema = z.strictObject({
  schemaVersion: z.literal(PLAN_VERSION),
  binding: TypedAuthoringBindingSchema,
  policies: DraftBodySchema.shape.policies,
  state: z.enum(["available", "unavailable"]),
  reason: z
    .enum(["historical_inputs", "unsupported_context", "no_admitted_pairs"])
    .nullable(),
  drafts: z.array(JdClauseOrderDraftSchema).max(5),
  inspectedPairCount: z.number().int().min(0).max(50),
  truncated: z.boolean(),
  scoreValue: z.null(),
  scoreDelta: z.null(),
  qualificationCredit: z.literal("not_assessed"),
});
export const JdClauseOrderPlanSchema = PlanBodySchema.extend({
  id: digest,
}).refine((plan) => {
  const { id, ...body } = plan;
  return (
    id === sha(JSON.stringify(body)) &&
    (plan.state === "available"
      ? plan.reason === null && plan.drafts.length > 0
      : plan.reason !== null && plan.drafts.length === 0) &&
    plan.drafts.length <= plan.inspectedPairCount &&
    new Set(plan.drafts.map((d) => d.id)).size === plan.drafts.length &&
    plan.drafts.every(
      (d) =>
        JSON.stringify(d.binding) === JSON.stringify(plan.binding) &&
        JSON.stringify(d.policies) === JSON.stringify(plan.policies),
    )
  );
});
export type JdClauseOrderPlan = z.infer<typeof JdClauseOrderPlanSchema>;
/** Inspect relevant candidates in saved order. All admitted drafts still pass the full validator. */
export function buildJdClauseOrderPlan(
  rawContext: unknown,
  expected: {
    analysisId: string;
    ownerId: string;
    canonicalVersionId: string;
    requirementVersionId: string;
  },
): JdClauseOrderPlan {
  try {
    const context = validateRequirementRelationshipContext(
      rawContext,
      expected.analysisId,
      expected.ownerId,
      {
        canonicalVersionId: expected.canonicalVersionId,
        requirementVersionId: expected.requirementVersionId,
      },
    );
    const { canonical, requirements, heads } = context;
    const binding = TypedAuthoringBindingSchema.parse({
      source: context.source,
      canonical: {
        versionId: canonical.versionId,
        revision: canonical.revision,
        contentSha256: canonical.contentSha256,
      },
      requirements: {
        versionId: requirements.versionId,
        revision: requirements.revision,
        inputSha256: requirements.inputSha256,
        contentSha256: requirements.contentSha256,
      },
      heads,
      profilesSha256: sha(JSON.stringify(context.profiles)),
    });
    const policies = {
      clauseOrderVersion: JD_CLAUSE_ORDER_POLICY_VERSION,
      clauseOrderSha256: JD_CLAUSE_ORDER_POLICY_SHA256,
      writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
    };
    const drafts: JdClauseOrderDraft[] = [];
    let inspectedPairCount = 0,
      truncated = false;
    const finish = (reason: JdClauseOrderPlan["reason"]) => {
      const body = PlanBodySchema.parse({
        schemaVersion: PLAN_VERSION,
        binding,
        policies,
        state: reason === null ? "available" : "unavailable",
        reason,
        drafts,
        inspectedPairCount,
        truncated,
        scoreValue: null,
        scoreDelta: null,
        qualificationCredit: "not_assessed",
      });
      return JdClauseOrderPlanSchema.parse({
        ...body,
        id: sha(JSON.stringify(body)),
      });
    };
    if (
      canonical.versionId !== heads.canonicalHeadId ||
      canonical.revision !== heads.canonicalHeadRevision ||
      requirements.versionId !== heads.requirementHeadId ||
      requirements.revision !== heads.requirementHeadRevision
    )
      return finish("historical_inputs");
    let streams: ReturnType<typeof requireDraftContext>;
    try {
      streams = requireDraftContext(context);
    } catch (error) {
      if (
        error instanceof TypedAuthoringError &&
        ["unsupported_context", "incomplete_source_coverage"].includes(
          error.reason,
        )
      )
        return finish("unsupported_context");
      throw error;
    }
    let preparedWriting: ReturnType<typeof prepareWritingContext>;
    try {
      preparedWriting = prepareWritingContext(streams);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("WRITING_SUPPORT_")
      )
        return finish("unsupported_context");
      throw error;
    }
    const bySkill = new Map<string, { clauseId: string; index: number }[]>();
    requirements.content.relations.clauses.forEach((clause, index) => {
      const atom = editableAtom(clause);
      if (!atom) return;
      const key = atomKey(atom);
      const matches = bySkill.get(key) ?? [];
      matches.push({ clauseId: clause.id, index });
      bySkill.set(key, matches);
    });
    outer: for (const fact of canonical.content.facts) {
      if (
        fact.type !== "contribution" ||
        fact.state !== "candidate_confirmed" ||
        !fact.sources.length
      )
        continue;
      let skills: ReturnType<typeof clauses>["skills"];
      try {
        skills = clauses(fact.value).skills;
      } catch (error) {
        if (
          error instanceof TypedAuthoringError &&
          error.reason === "unsupported_action"
        )
          continue;
        throw error;
      }
      const first = skillKeys(skills[0]);
      const matchingClauses = skillKeys(skills[1])
        .filter((key) => !first.includes(key))
        .flatMap((key) => bySkill.get(key) ?? [])
        .sort((a, b) => a.index - b.index);
      for (const { clauseId } of matchingClauses) {
        if (inspectedPairCount === 50 || drafts.length === 5) {
          truncated = true;
          break outer;
        }
        inspectedPairCount++;
        try {
          drafts.push(
            draftFromValidated(
              context,
              expected,
              {
                canonicalVersionId: canonical.versionId,
                requirementVersionId: requirements.versionId,
                clauseId,
                targetFactId: fact.id,
              },
              streams,
              preparedWriting,
            ),
          );
        } catch (error) {
          if (
            !(error instanceof TypedAuthoringError) ||
            ![
              "target_not_editable",
              "confirmation_required",
              "ambiguous_location",
              "fragmented_source_clause",
              "missing_current_witness",
              "unsupported_action",
              "no_change",
              "writing_support_rejected",
            ].includes(error.reason)
          )
            throw error;
        }
      }
    }
    return finish(drafts.length ? null : "no_admitted_pairs");
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    fail("invalid_context");
  }
}
