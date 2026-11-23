import { createHash } from "node:crypto";
import { z } from "zod";
import {
  validateRequirementRelationshipContext,
  RequirementRelationshipContextSchema,
  type RequirementRelationshipContext,
} from "./requirement-relationship-context";
import {
  JOB_ALIAS_POLICY_VERSION,
  JOB_ALIAS_LEXICON_SHA256,
  resolveJobAlias,
} from "./job-aliases";
import { CanonicalResumeDraftSchema } from "./canonical-resume-schema";

export const REQUIREMENT_SEMANTIC_POLICY_VERSION =
  "requirement-semantic-rules/1.0.1" as const;
const actions = [
  "built",
  "developed",
  "implemented",
  "designed",
  "maintained",
  "optimized",
  "automated",
  "tested",
] as const;
const modal = [
  "not",
  "no",
  "never",
  "without",
  "cannot",
  "can't",
  "didn't",
  "will",
  "would",
  "could",
  "may",
  "might",
  "shall",
  "should",
  "if",
  "unless",
  "planned",
  "planning",
  "intend",
  "intended",
  "aim",
  "goal",
  "potential",
] as const;
const agency = [
  "i",
  "we",
  "he",
  "she",
  "they",
  "it",
  "them",
  "their",
  "our",
  "my",
  "his",
  "her",
  "you",
  "your",
  "its",
  "team",
  "teams",
  "by",
] as const;
const compound = [
  "and",
  "or",
  "but",
  "then",
  "while",
  "alongside",
  "together",
  "plus",
  "also",
] as const;
export const REQUIREMENT_SEMANTIC_POLICY = Object.freeze({
  version: REQUIREMENT_SEMANTIC_POLICY_VERSION,
  locale: "en-IN",
  domain: "software-engineering",
  actions: Object.freeze(actions),
  sourceGrammar: "<past-action> <single-object> using <skill>",
  responsibilityGrammar: "Responsible for <single-object> using <skill>",
  datedGrammar: "Used <skill> from YYYY-MM-DD to YYYY-MM-DD",
  keywordCase: "ascii-insensitive",
  terminalPeriod: "optional-one",
  offsetUnit: "unicode_code_point",
  objectGrammar:
    "unicode-letter-or-number then letters/marks/numbers/connector/dash/space/slash only",
  modality: Object.freeze(modal),
  agency: Object.freeze(agency),
  compound: Object.freeze(compound),
  aliasPolicyVersion: JOB_ALIAS_POLICY_VERSION,
  aliasLexiconSha256: JOB_ALIAS_LEXICON_SHA256,
  literalIdentity:
    "exact-typed-JD-atom-or-admitted-skill-record/token-or-single-skill-fact; ASCII-case/space-fold only; vocabulary is not relation authority; no synonym inference",
  sourceFragmentDates:
    "one full selected immutable Used clause; exact unchanged current cited fragments cover all non-space/non-ISO-separator characters; no ancestor borrowing",
  sourceQuoteBlocks:
    "standalone ASCII/curly quote/backtick lines set sticky ambiguity for the remaining selected source stream; headings cannot clear it",
  sourceStream:
    "native page order; OCR pageNumber replacement; selected pageId/method spans sorted by start",
  sourceScope:
    "whole-claim slice; preceding immutable qualifier headings persist until explicit personal/individual contribution heading",
  sourceNeutralHeadings: Object.freeze([
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "employment history",
    "projects",
    "skills",
    "technical skills",
    "education",
    "summary",
    "professional summary",
    "responsibilities",
    "achievements",
    "contributions",
  ]),
  sourcePersonalHeadings: Object.freeze([
    "personal contributions",
    "individual contributions",
    "personal achievements",
    "individual achievements",
  ]),
  dateYears: Object.freeze([1, 9999]),
  endpointSemantics: "literal_to_unspecified",
  futureCutoff: "selected-canonical-createdAt-UTC-date",
  durationScalar: null,
  limits: Object.freeze({
    facts: 1000,
    suffixFacts: 20000,
    suffixReferences: 20000,
    suffixTextUtf16: 2000000,
    literalAtoms: 1024,
    objectCodePoints: 160,
    work: 200000,
    witnesses: 1000,
    unresolved: 1000,
    outputUtf8Bytes: 5242880,
    sourceTextUtf16: 2000000,
    sourceClauseUtf16: 2000,
  }),
} as const);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const REQUIREMENT_SEMANTIC_POLICY_SHA256 = sha(
  JSON.stringify(REQUIREMENT_SEMANTIC_POLICY),
);
const uuid = z.uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sourceSchema =
  RequirementRelationshipContextSchema.options[0].shape.source;
const profileSchema =
  RequirementRelationshipContextSchema.options[0].shape.profiles;
const bindingSchema = z.strictObject({
  source: sourceSchema,
  attemptId: uuid,
  canonical: z.strictObject({
    versionId: uuid,
    revision: z.number().int().positive(),
    contentSha256: digest,
  }),
  requirements: z.strictObject({
    versionId: uuid,
    revision: z.number().int().positive(),
    inputSha256: digest,
    contentSha256: digest,
  }),
  profiles: profileSchema,
});
const part = z
  .strictObject({
    value: z.string().min(1).max(2000),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((v) => v.end > v.start);
const location = z.strictObject({
  kind: z.enum(["contact", "section", "entry", "bullet"]),
  sectionId: uuid.nullable(),
  entryId: uuid.nullable(),
  bulletId: uuid.nullable(),
});
const citation = z.strictObject({
  attemptId: uuid,
  spanId: z.string().min(1).max(100),
  pageId: z.string().min(1).max(100),
  method: z.enum(["native_text", "local_ocr"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  pageStart: z.number().int().nonnegative(),
  pageEnd: z.number().int().positive(),
});
const identity = z.strictObject({
  kind: z.enum(["literal_only", "mapped_concept"]),
  literalKey: z.string().min(1).max(2000),
  mappingKind: z.enum(["exact", "alias", "unmapped"]),
  conceptId: z.string().nullable(),
  canonicalValue: z.string().nullable(),
  policyVersion: z.literal(JOB_ALIAS_POLICY_VERSION),
  lexiconSha256: z.literal(JOB_ALIAS_LEXICON_SHA256),
});
const skill = part.safeExtend({ identity });
const interval = z.strictObject({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  startEvidence: part,
  endEvidence: part,
  endpointSemantics: z.literal("literal_to_unspecified"),
  claim: z.enum(["source_reported", "candidate_declared"]),
});
const factSchema = CanonicalResumeDraftSchema.shape.facts.element;
const sourceClauseSchema = z.strictObject({
  quote: z.string().min(1).max(2000),
  citation,
  supportingFacts: z
    .array(
      z.strictObject({
        factId: uuid,
        factType: factSchema.shape.type,
        locations: z.array(location).max(20000),
        citation,
      }),
    )
    .min(1)
    .max(1000),
  confirmation: z.null(),
});
const witness = z.strictObject({
  id: z.string().regex(/^semantic-witness-[a-f0-9]{64}$/u),
  evidenceGroupId: z.string().regex(/^semantic-evidence-[a-f0-9]{64}$/u),
  factId: uuid,
  factType: z.enum(["skill", "contribution"]),
  location,
  tier: z.enum([
    "listed",
    "source_contribution",
    "candidate_responsibility",
    "dated_use",
  ]),
  basis: z.enum(["source_quote", "candidate_declaration"]),
  actor: z.enum(["resume_author_claim", "owner_declaration"]),
  clause: part,
  action: part.nullable(),
  object: part.nullable(),
  skill,
  confirmation: factSchema.shape.confirmation,
  currentSourceCitations: z.array(citation).max(20),
  offsetSpace: z.enum(["current_fact", "source_span"]),
  confirmationScope: z.literal("current_fact"),
  sourceClause: sourceClauseSchema.nullable(),
  observedOrigin: z
    .strictObject({
      versionId: uuid,
      factId: uuid,
      value: factSchema.shape.value,
      citations: z.array(citation).min(1).max(20),
    })
    .nullable(),
  interval: interval.nullable(),
});
const reason = z.enum([
  "out_of_scope_fact_type",
  "unbound_job_dates",
  "ambiguous_location",
  "unsupported_grammar",
  "ambiguous_agency",
  "negated_or_modal",
  "quoted_claim",
  "compound_clause",
  "unknown_skill_identity",
  "invalid_date_interval",
  "future_interval",
  "missing_source_or_confirmation",
  "source_quote_mismatch",
  "missing_responsibility_confirmation",
  "source_slice_context",
  "source_scope_ambiguous",
  "covered_by_source_clause",
]);
const unresolvedSchema = z.strictObject({
  factId: uuid,
  reason,
  locations: z.array(location).max(20000),
});
const policy = z.strictObject({
  version: z.literal(REQUIREMENT_SEMANTIC_POLICY_VERSION),
  sha256: z.literal(REQUIREMENT_SEMANTIC_POLICY_SHA256),
});
const common = {
  schemaVersion: z.literal("requirement-semantic-evidence/1.0.0"),
  authority: z.literal("derived_bounded_semantic_witnesses"),
  scoringEligible: z.literal(false),
  policy,
};
export const RequirementSemanticEvidenceSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...common,
    state: z.literal("available"),
    binding: bindingSchema,
    witnesses: z.array(witness).max(1000),
    unresolved: z.array(unresolvedSchema).max(1000),
    unavailableReason: z.null(),
  }),
  z.strictObject({
    ...common,
    state: z.literal("unavailable"),
    binding: bindingSchema.nullable(),
    witnesses: z.array(witness).length(0),
    unresolved: z.array(unresolvedSchema).length(0),
    unavailableReason: z.enum([
      "invalid_context",
      "unsupported_context",
      "resource_limit",
    ]),
  }),
]);
export type RequirementSemanticEvidence = z.infer<
  typeof RequirementSemanticEvidenceSchema
>;
type Context = RequirementRelationshipContext;
type Fact = Context["canonical"]["content"]["facts"][number];
type Location = z.infer<typeof location>;
type Citation = z.infer<typeof citation>;
type Witness = z.infer<typeof witness>;
type Reason = z.infer<typeof reason>;
const flags = {
  schemaVersion: "requirement-semantic-evidence/1.0.0",
  authority: "derived_bounded_semantic_witnesses",
  scoringEligible: false,
  policy: {
    version: REQUIREMENT_SEMANTIC_POLICY_VERSION,
    sha256: REQUIREMENT_SEMANTIC_POLICY_SHA256,
  },
} as const;
const fold = (s: string) =>
  s.replace(/[A-Z]/gu, (c) => c.toLowerCase()).replace(/[\t ]+/gu, " ");
const tuple = (c: {
  attemptId: string;
  spanId: string;
  start: number;
  end: number;
}) => [c.attemptId, c.spanId, c.start, c.end];
class ResourceLimit extends Error {}
function binding(c: Context): z.infer<typeof bindingSchema> {
  return {
    source: c.source,
    attemptId: c.attempt.id,
    canonical: {
      versionId: c.canonical.versionId,
      revision: c.canonical.revision,
      contentSha256: c.canonical.contentSha256,
    },
    requirements: {
      versionId: c.requirements.versionId,
      revision: c.requirements.revision,
      inputSha256: c.requirements.inputSha256,
      contentSha256: c.requirements.contentSha256,
    },
    profiles: c.profiles,
  };
}
function unavailable(
  why: "invalid_context" | "unsupported_context" | "resource_limit",
  b: z.infer<typeof bindingSchema> | null,
): RequirementSemanticEvidence {
  return {
    ...flags,
    state: "unavailable",
    binding: b,
    witnesses: [],
    unresolved: [],
    unavailableReason: why,
  };
}
function date(value: string) {
  const d = new Date(value + "T00:00:00Z");
  return (
    Number(value.slice(0, 4)) >= 1 &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === value
  );
}
const contribution =
  /^(?<action>Built|Developed|Implemented|Designed|Maintained|Optimized|Automated|Tested)[\t ]+(?<object>\S(?:.*?\S)?)[\t ]+using[\t ]+(?<skill>\S(?:.*\S)?)$/di;
const responsibility =
  /^(?<action>Responsible[\t ]+for)[\t ]+(?<object>\S(?:.*?\S)?)[\t ]+using[\t ]+(?<skill>\S(?:.*\S)?)$/di;
const dated =
  /^(?<action>Used)[\t ]+(?<skill>\S(?:.*?\S)?)[\t ]+from[\t ]+(?<start>\d{4}-\d{2}-\d{2})[\t ]+to[\t ]+(?<end>\d{4}-\d{2}-\d{2})$/di;
function guarded(value: string): Reason | null {
  if (/["'`“”‘’]/u.test(value)) return "quoted_claim";
  const words = fold(value).match(/[a-z]+/gu) ?? [];
  if (words.some((w) => (modal as readonly string[]).includes(w)))
    return "negated_or_modal";
  if (words.some((w) => (agency as readonly string[]).includes(w)))
    return "ambiguous_agency";
  if (
    /[\n\r;,&]/u.test(value) ||
    words.some((w) => (compound as readonly string[]).includes(w))
  )
    return "compound_clause";
  return null;
}
/** Pure bounded projection of a server-owned reader context; neither parser nor witnesses authenticate a caller or admit scores. */
export function deriveRequirementSemanticEvidence(
  rawContext: unknown,
): RequirementSemanticEvidence {
  let context: Context;
  try {
    const keys = z
      .object({
        source: z.object({ ownerId: uuid, analysisId: uuid }),
        canonical: z.object({ versionId: uuid }),
        requirements: z.object({ versionId: uuid }),
      })
      .parse(rawContext);
    context = validateRequirementRelationshipContext(
      rawContext,
      keys.source.analysisId,
      keys.source.ownerId,
      {
        canonicalVersionId: keys.canonical.versionId,
        requirementVersionId: keys.requirements.versionId,
      },
    );
  } catch {
    return unavailable("invalid_context", null);
  }
  const b = binding(context);
  if (
    context.canonical.locale !== "en-IN" ||
    context.requirements.content.locale !== "en-IN" ||
    context.requirements.content.domain !== "software-engineering" ||
    context.requirements.content.state === "unsupported"
  )
    return unavailable("unsupported_context", b);
  let work = 0;
  const charge = (n = 1) => {
    work += n;
    if (work > REQUIREMENT_SEMANTIC_POLICY.limits.work)
      throw new ResourceLimit();
  };
  try {
    const docs = [
      context.canonical.content,
      ...context.ancestors.map((a) => a.content),
    ];
    let facts = 0,
      refs = 0,
      text = 0;
    for (const d of docs) {
      facts += d.facts.length;
      refs += d.contactFactIds.length;
      for (const f of d.facts) {
        charge();
        text += f.value.length + (f.confirmation?.value.length ?? 0);
        refs += f.sources.length;
      }
      for (const s of d.sections) {
        charge();
        text += s.title.length;
        refs += s.factIds.length;
        for (const e of s.entries) {
          charge();
          refs += e.factIds.length;
          for (const bullet of e.bullets) {
            charge();
            text += bullet.text.length;
            refs += bullet.factIds.length;
          }
        }
      }
      if (facts > 20000 || refs > 20000 || text > 2000000)
        throw new ResourceLimit();
    }
    const literals = new Set<string>();
    let atoms = 0;
    for (const c of context.requirements.content.relations.clauses) {
      charge();
      const exp = c.skillExpression;
      const values =
        exp.kind === "atom"
          ? [exp]
          : exp.kind === "all_of" || exp.kind === "any_of"
            ? exp.operands
            : [];
      for (const a of values) {
        charge();
        if (++atoms > 1024) throw new ResourceLimit();
        literals.add(fold(a.value));
      }
    }
    // A stored unknown expression can still retain exact admitted skill records.
    // These literals permit source parsing; they never bind a duration or upgrade
    // the stored relationship expression.
    for (const item of context.requirements.content.requirements) {
      charge();
      if (item.type !== "skill") continue;
      for (const value of [
        item.value,
        ...item.tokenEvidence.map((token) => token.quote),
      ]) {
        charge();
        const key = fold(value);
        if (!literals.has(key) && literals.size >= 1024)
          throw new ResourceLimit();
        literals.add(key);
      }
    }
    const indexes = docs.map(
      (d) =>
        new Map(
          d.facts.map((f) => {
            charge();
            return [f.id, f] as const;
          }),
        ),
    );
    const characters = new Map<string, string[]>();
    let sourceUnits = 0;
    const spans = new Map(
      context.attempt.envelope.spans.map((s) => {
        charge();
        sourceUnits += s.text.length;
        if (sourceUnits > 2000000) throw new ResourceLimit();
        return [s.id, s] as const;
      }),
    );
    const locations = new Map<string, Location[]>();
    const put = (id: string, l: Location) => {
      charge();
      const prior = locations.get(id);
      if (prior) prior.push(l);
      else locations.set(id, [l]);
    };
    for (const id of docs[0].contactFactIds)
      put(id, {
        kind: "contact",
        sectionId: null,
        entryId: null,
        bulletId: null,
      });
    for (const s of docs[0].sections) {
      charge();
      for (const id of s.factIds)
        put(id, {
          kind: "section",
          sectionId: s.id,
          entryId: null,
          bulletId: null,
        });
      for (const e of s.entries) {
        charge();
        for (const id of e.factIds)
          put(id, {
            kind: "entry",
            sectionId: s.id,
            entryId: e.id,
            bulletId: null,
          });
        for (const bullet of e.bullets) {
          charge();
          for (const id of bullet.factIds)
            put(id, {
              kind: "bullet",
              sectionId: s.id,
              entryId: e.id,
              bulletId: bullet.id,
            });
        }
      }
    }
    function citations(f: Fact): Citation[] | null {
      const result: Citation[] = [],
        seen = new Set<string>();
      const expectedLength = Array.from(f.value).length;
      for (const c of f.sources) {
        charge();
        const s = spans.get(c.spanId);
        if (
          !s ||
          c.attemptId !== context.source.attemptId ||
          c.end - c.start !== expectedLength
        )
          return null;
        let chars = characters.get(s.id);
        if (!chars) {
          chars = Array.from(s.text);
          characters.set(s.id, chars);
        }
        if (
          !s ||
          c.attemptId !== context.source.attemptId ||
          c.end > chars.length ||
          chars.slice(c.start, c.end).join("") !== f.value
        )
          return null;
        const key = JSON.stringify(tuple(c));
        if (seen.has(key)) return null;
        seen.add(key);
        result.push({
          ...c,
          pageId: s.pageId,
          method: s.method,
          pageStart: s.start + c.start,
          pageEnd: s.start + c.end,
        });
      }
      return result;
    }
    const inheritedScope = new Map<string, Reason | null>();
    let activeScope: Reason | null = null;
    let quotedScope = false;
    const byPageMethod = new Map<
      string,
      Context["attempt"]["envelope"]["spans"]
    >();
    for (const span of context.attempt.envelope.spans) {
      charge();
      const key = JSON.stringify([span.pageId, span.method]);
      const prior = byPageMethod.get(key);
      if (prior) prior.push(span);
      else byPageMethod.set(key, [span]);
    }
    const selectedStream: Context["attempt"]["envelope"]["spans"] = [];
    for (const page of context.attempt.envelope.nativeSource.pages) {
      charge();
      const method = context.attempt.envelope.ocrSource?.pages.some((p) => {
        charge();
        return p.pageNumber === page.pageNumber;
      })
        ? "local_ocr"
        : "native_text";
      const selected =
        byPageMethod.get(JSON.stringify([page.id, method])) ?? [];
      selected.sort((a, b) => {
        charge();
        return a.start - b.start;
      });
      for (const span of selected) {
        charge();
        selectedStream.push(span);
      }
    }
    for (const span of selectedStream) {
      charge();
      const text = span.text.replace(/^[\t ]+|[\t ]+$/gu, "");
      const heading = fold(text.replace(/:[\t ]*$/u, ""));
      if (
        (
          REQUIREMENT_SEMANTIC_POLICY.sourcePersonalHeadings as readonly string[]
        ).includes(heading)
      )
        activeScope = null;
      inheritedScope.set(span.id, quotedScope ? "quoted_claim" : activeScope);
      if (
        (
          REQUIREMENT_SEMANTIC_POLICY.sourceNeutralHeadings as readonly string[]
        ).includes(heading) ||
        (
          REQUIREMENT_SEMANTIC_POLICY.sourcePersonalHeadings as readonly string[]
        ).includes(heading)
      )
        continue;
      if (/^[\t ]*["'`“”‘’]+[\t ]*$/u.test(text)) quotedScope = true;
      else if (
        /^(?:team|company|organization|department|group|client|our|their)\b/i.test(
          text,
        )
      )
        activeScope = "ambiguous_agency";
      else if (
        /:$/u.test(text) ||
        /^(?:not|no|never|planned|planning|future)\b/i.test(text)
      )
        activeScope = guarded(text) ?? "source_scope_ambiguous";
    }
    function sourceScope(cites: Citation[]): Reason | null {
      for (const cite of cites) {
        charge();
        const span = spans.get(cite.spanId)!;
        if (!inheritedScope.has(span.id)) return "source_scope_ambiguous";
        const chars = characters.get(span.id)!;
        const before = chars.slice(0, cite.start).join("");
        const after = chars.slice(cite.end).join("");
        if (
          !/^[\t \u00a0]*(?:[•*–—-][\t \u00a0]+)?$/u.test(before) ||
          !/^[\t \u00a0]*\.?[\t \u00a0]*$/u.test(after)
        )
          return guarded(span.text) ?? "source_slice_context";
        const scope = inheritedScope.get(span.id);
        if (scope) return scope;
      }
      return null;
    }
    type FragmentClause = {
      sourceClause: z.infer<typeof sourceClauseSchema>;
      coordinate: string;
      startUtf16: number;
    };
    const fragmentCache = new Map<string, FragmentClause | Reason | null>();
    function fragmentedDate(
      f: Fact,
      current: Citation[],
    ): FragmentClause | Reason | null {
      if (current.length !== 1 || !/^Used\b/i.test(f.value)) return null;
      const cite = current[0],
        span = spans.get(cite.spanId)!;
      if (fragmentCache.has(span.id)) {
        const cached = fragmentCache.get(span.id)!;
        if (
          cached &&
          typeof cached !== "string" &&
          cite.start !== cached.sourceClause.citation.start
        )
          return null;
        return cached;
      }
      const finish = (value: FragmentClause | Reason | null) => {
        fragmentCache.set(span.id, value);
        return value;
      };
      if (span.text.length > 2000) return finish(null);
      const prefix = /^[\t \u00a0]*(?:[•*–—-][\t \u00a0]+)?/u.exec(
        span.text,
      )![0];
      const tail = /[\t \u00a0]*$/u.exec(span.text)![0];
      const quote = span.text.slice(
        prefix.length,
        span.text.length - tail.length,
      );
      const parsed = dated.exec(
        quote.endsWith(".") ? quote.slice(0, -1) : quote,
      );
      if (!parsed) return finish(null);
      const start = Array.from(prefix).length,
        end = start + Array.from(quote).length;
      if (
        cite.start !== start ||
        cite.end <
          start +
            Array.from(quote.slice(0, parsed.indices!.groups!.skill[1])).length
      )
        return null;
      const whole: Citation = {
        attemptId: context.source.attemptId,
        spanId: span.id,
        pageId: span.pageId,
        method: span.method,
        start,
        end,
        pageStart: span.start + start,
        pageEnd: span.start + end,
      };
      const blocked = sourceScope([whole]);
      if (blocked) return finish(blocked);
      const chars = characters.get(span.id)!,
        covered = new Uint8Array(end - start);
      const supportingFacts: z.infer<
        typeof sourceClauseSchema
      >["supportingFacts"] = [];
      for (const other of docs[0].facts) {
        charge();
        if (!other.sources.length) {
          for (let i = 1; i < indexes.length; i++) {
            charge();
            const old = indexes[i].get(other.id);
            if (!old || old.type !== other.type) break;
            if (old.sources.length) {
              if (
                old.sources.some((c) => {
                  charge();
                  return (
                    c.attemptId === whole.attemptId &&
                    c.spanId === whole.spanId &&
                    c.start < end &&
                    c.end > start
                  );
                })
              )
                return finish("source_quote_mismatch");
              break;
            }
          }
          continue;
        }
        const same = other.sources.filter((c) => {
          charge();
          return (
            c.attemptId === whole.attemptId &&
            c.spanId === whole.spanId &&
            c.start < end &&
            c.end > start
          );
        });
        if (!same.length) continue;
        const exact = citations(other);
        if (exact === null) return finish("source_quote_mismatch");
        for (const c of exact.filter((c) => {
          charge();
          return c.spanId === whole.spanId;
        })) {
          charge();
          if (c.start < start || c.end > end)
            return finish("source_quote_mismatch");
          supportingFacts.push({
            factId: other.id,
            factType: other.type,
            locations: locations.get(other.id) ?? [],
            citation: c,
          });
          for (let at = c.start; at < c.end; at++) {
            charge();
            covered[at - start] = 1;
          }
        }
      }
      for (let at = start; at < end; at++) {
        charge();
        if (!covered[at - start] && !/^[\t \u00a0-]$/u.test(chars[at]))
          return finish("missing_source_or_confirmation");
      }
      supportingFacts.sort((a, b) => {
        charge();
        return (
          a.citation.start - b.citation.start ||
          a.citation.end - b.citation.end ||
          (a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0)
        );
      });
      return finish({
        sourceClause: {
          quote,
          citation: whole,
          supportingFacts,
          confirmation: null,
        },
        coordinate: span.text,
        startUtf16: prefix.length,
      });
    }
    function identityFor(
      value: string,
      listed = false,
    ): z.infer<typeof identity> | null {
      charge();
      const m = resolveJobAlias(value),
        literalKey = fold(value);
      if (m.kind !== "unmapped")
        return {
          kind: "mapped_concept",
          literalKey,
          mappingKind: m.kind,
          conceptId: m.conceptId,
          canonicalValue: m.canonicalValue,
          policyVersion: JOB_ALIAS_POLICY_VERSION,
          lexiconSha256: JOB_ALIAS_LEXICON_SHA256,
        };
      if (!listed && !literals.has(literalKey)) return null;
      return {
        kind: "literal_only",
        literalKey,
        mappingKind: "unmapped",
        conceptId: null,
        canonicalValue: null,
        policyVersion: JOB_ALIAS_POLICY_VERSION,
        lexiconSha256: JOB_ALIAS_LEXICON_SHA256,
      };
    }
    const emittedSourceClauses = new Set<string>();
    const witnesses: Witness[] = [],
      unresolved: z.infer<typeof unresolvedSchema>[] = [];
    for (const f of docs[0].facts) {
      charge();
      const places = locations.get(f.id) ?? [];
      const miss = (r: Reason) => {
        unresolved.push({ factId: f.id, reason: r, locations: places });
      };
      if (f.type !== "skill" && f.type !== "contribution") {
        miss(
          f.type === "dates" ? "unbound_job_dates" : "out_of_scope_fact_type",
        );
        continue;
      }
      if (places.length !== 1) {
        miss("ambiguous_location");
        continue;
      }
      const current = citations(f);
      if (current === null) {
        miss("source_quote_mismatch");
        continue;
      }
      let observed: Witness["observedOrigin"] = null;
      if (current.length)
        observed = {
          versionId: context.canonical.versionId,
          factId: f.id,
          value: f.value,
          citations: current,
        };
      else
        for (let i = 1; i < indexes.length; i++) {
          charge();
          const old = indexes[i].get(f.id);
          if (!old || old.type !== f.type) break;
          if (old.sources.length) {
            const cites = citations(old);
            if (cites?.length)
              observed = {
                versionId: context.ancestors[i - 1].versionId,
                factId: f.id,
                value: old.value,
                citations: cites,
              };
            break;
          }
        }
      const declared =
        f.state === "candidate_confirmed" &&
        f.confirmation?.actorId === context.source.ownerId &&
        f.confirmation.value === f.value;
      if (!current.length && !declared) {
        miss("missing_source_or_confirmation");
        continue;
      }
      const rawBody = f.value.endsWith(".") ? f.value.slice(0, -1) : f.value;
      const fragment =
        f.type === "contribution" && !dated.test(rawBody)
          ? fragmentedDate(f, current)
          : null;
      if (typeof fragment === "string") {
        miss(fragment);
        continue;
      }
      const sourceClause = fragment?.sourceClause ?? null;
      const sourceClauseKey = sourceClause
        ? JSON.stringify(tuple(sourceClause.citation))
        : null;
      if (sourceClauseKey && emittedSourceClauses.has(sourceClauseKey)) {
        miss("covered_by_source_clause");
        continue;
      }
      const semanticText = sourceClause?.quote ?? f.value;
      const sourceBlocked = current.length
        ? sourceScope(sourceClause ? [sourceClause.citation] : current)
        : null;
      const body = semanticText.endsWith(".")
        ? semanticText.slice(0, -1)
        : semanticText;
      const blocked = guarded(body);
      if (blocked) {
        miss(blocked);
        continue;
      }
      let tier: Witness["tier"],
        basis: Witness["basis"] = current.length
          ? "source_quote"
          : "candidate_declaration",
        match: RegExpExecArray | null = null;
      let skillValue: string,
        skillStart = 0,
        skillEnd = f.value.length,
        actionPart: z.infer<typeof part> | null = null,
        objectPart: z.infer<typeof part> | null = null,
        range: Witness["interval"] = null;
      const partAt = (value: string, start: number, end: number) => ({
        value,
        start: Array.from(
          (fragment?.coordinate ?? f.value).slice(
            0,
            (fragment?.startUtf16 ?? 0) + start,
          ),
        ).length,
        end: Array.from(
          (fragment?.coordinate ?? f.value).slice(
            0,
            (fragment?.startUtf16 ?? 0) + end,
          ),
        ).length,
      });
      const groupPart = (name: string) => {
        const bounds = match?.indices?.groups?.[name];
        if (!bounds || !match?.groups?.[name]) throw new ResourceLimit();
        return partAt(match.groups[name], bounds[0], bounds[1]);
      };
      if (f.type === "skill") {
        if (sourceBlocked) {
          if (!declared) {
            miss(sourceBlocked);
            continue;
          }
          basis = "candidate_declaration";
        }
        if (/[\n\r,;|]/u.test(f.value)) {
          miss("compound_clause");
          continue;
        }
        tier = "listed";
        skillValue = f.value;
      } else if ((match = dated.exec(body))) {
        if (sourceBlocked) {
          if (!declared || sourceClause !== null) {
            miss(sourceBlocked);
            continue;
          }
          basis = "candidate_declaration";
        }
        tier = "dated_use";
        skillValue = match.groups!.skill;
        const start = match.groups!.start,
          end = match.groups!.end;
        if (!date(start) || !date(end) || end <= start) {
          miss("invalid_date_interval");
          continue;
        }
        if (
          end >
          new Date(context.canonical.content.createdAt)
            .toISOString()
            .slice(0, 10)
        ) {
          miss("future_interval");
          continue;
        }
        range = {
          startDate: start,
          endDate: end,
          startEvidence: groupPart("start"),
          endEvidence: groupPart("end"),
          endpointSemantics: "literal_to_unspecified",
          claim:
            basis === "source_quote" ? "source_reported" : "candidate_declared",
        };
        actionPart = groupPart("action");
      } else if ((match = responsibility.exec(body))) {
        if (!declared) {
          miss("missing_responsibility_confirmation");
          continue;
        }
        basis = "candidate_declaration";
        tier = "candidate_responsibility";
        skillValue = match.groups!.skill;
        actionPart = groupPart("action");
        objectPart = groupPart("object");
      } else if ((match = contribution.exec(body))) {
        if (sourceBlocked) {
          miss(sourceBlocked);
          continue;
        }
        if (!current.length) {
          miss("missing_source_or_confirmation");
          continue;
        }
        tier = "source_contribution";
        skillValue = match.groups!.skill;
        actionPart = groupPart("action");
        objectPart = groupPart("object");
      } else {
        miss("unsupported_grammar");
        continue;
      }
      if (
        objectPart &&
        (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Pc}\p{Pd} /\t]*$/u.test(
          objectPart.value,
        ) ||
          Array.from(objectPart.value).length > 160)
      ) {
        miss("unsupported_grammar");
        continue;
      }
      const skillIdentity = identityFor(skillValue, f.type === "skill");
      if (!skillIdentity) {
        miss("unknown_skill_identity");
        continue;
      }
      if (match) {
        const bounds = match.indices!.groups!.skill;
        skillStart = bounds[0];
        skillEnd = bounds[1];
      }
      const skillPart = {
        ...partAt(skillValue, skillStart, skillEnd),
        identity: skillIdentity,
      };
      const claimKey =
        basis === "source_quote"
          ? (sourceClause ? [sourceClause.citation] : current)
              .map(tuple)
              .sort((a, b) =>
                JSON.stringify(a) < JSON.stringify(b)
                  ? -1
                  : JSON.stringify(a) > JSON.stringify(b)
                    ? 1
                    : 0,
              )
          : [context.source.ownerId, f.value];
      const evidenceGroupId =
        "semantic-evidence-" +
        sha(
          JSON.stringify([
            REQUIREMENT_SEMANTIC_POLICY_SHA256,
            context.source.inputSha256,
            basis,
            claimKey,
            skillIdentity.conceptId ?? skillIdentity.literalKey,
            range?.startDate ?? null,
            range?.endDate ?? null,
          ]),
        );
      const candidate = {
        evidenceGroupId,
        factId: f.id,
        factType: f.type,
        location: places[0],
        tier,
        basis,
        actor:
          basis === "source_quote"
            ? ("resume_author_claim" as const)
            : ("owner_declaration" as const),
        clause: partAt(semanticText, 0, semanticText.length),
        action: actionPart,
        object: objectPart,
        skill: skillPart,
        confirmation: f.confirmation,
        currentSourceCitations: current,
        offsetSpace: sourceClause
          ? ("source_span" as const)
          : ("current_fact" as const),
        confirmationScope: "current_fact" as const,
        sourceClause,
        observedOrigin: observed,
        interval: range,
      };
      const id =
        "semantic-witness-" +
        sha(JSON.stringify([b, REQUIREMENT_SEMANTIC_POLICY_SHA256, candidate]));
      witnesses.push({ id, ...candidate });
      if (sourceClauseKey) emittedSourceClauses.add(sourceClauseKey);
      if (witnesses.length > 1000 || unresolved.length > 1000)
        throw new ResourceLimit();
    }
    const result: RequirementSemanticEvidence = {
      ...flags,
      state: "available",
      binding: b,
      witnesses,
      unresolved,
      unavailableReason: null,
    };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 5242880)
      throw new ResourceLimit();
    return RequirementSemanticEvidenceSchema.parse(result);
  } catch (error) {
    if (error instanceof ResourceLimit) return unavailable("resource_limit", b);
    throw error;
  }
}
