import { createHash } from "node:crypto";
import type { LocalAliasJobRequirements } from "./job-requirements";
import type { JobRequirementRelations } from "./job-requirement-admission";
import {
  discoverJobAliasMentions,
  JOB_ALIAS_LEXICON_SHA256,
  JOB_ALIAS_POLICY_VERSION,
  resolveJobAlias,
  type JobAliasMapping,
} from "./job-aliases";

type Span = { spanId: string; start: number; end: number; quote: string };
type Operand = {
  kind: "atom";
  value: string;
  evidence: Span;
  requirementIds: string[];
  mapping: JobAliasMapping;
};
export type LocalSkillExpression =
  | Operand
  | {
      kind: "any_of" | "all_of";
      evidence: Span;
      operands: Operand[];
      operatorEvidence: Span[];
    }
  | {
      kind: "unknown";
      reason: string;
      evidence: Span;
      observedRequirementIds: string[];
    };
type Bound = { value: number; inclusive: boolean; evidence: Span };
export type LocalDuration = {
  kind:
    | "range"
    | "at_least"
    | "more_than"
    | "at_most"
    | "less_than"
    | "exactly"
    | "unknown"
    | "not_stated";
  evidence: Span | null;
  lower: Bound | null;
  upper: Bound | null;
  operatorEvidence: Span[];
  candidateEvidence: Span[];
  reason: string | null;
  subjectBinding: "literal_clause_only";
  evaluated: false;
};
const limits = Object.freeze({
  sourceUtf16: 20000,
  clauseUtf16: 2000,
  clauses: 300,
  requirements: 300,
  tokens: 1000,
  operands: 32,
  nodes: 1024,
  rawDepth: 8,
  durationCandidates: 8,
  ambiguityEntries: 10,
  ambiguityItemUtf16: 100,
});
export const LOCAL_JOB_RELATION_POLICY_VERSION =
  "jd-local-relation-rules/1.0.0" as const;
const ruleIdentity = {
  policy: LOCAL_JOB_RELATION_POLICY_VERSION,
  limits,
  grammar: "flat-literal-and-or/1.0.0",
  durations: "explicit-year-comparators-closed-dash-range/1.0.0",
  unknowns: "no-precedence-negation-or-subject-inference/1.0.0",
  durationScope: "explicit-prefix-or-experience-metadata/1.0.0",
  sourceProof: "exact-alias-boundary-and-negation-replay/1.0.0",
  segments: "en-IN-software-only-review/1.0.0",
};
export const LOCAL_JOB_RELATION_POLICY_SHA256 = createHash("sha256")
  .update(JSON.stringify(ruleIdentity))
  .digest("hex");
export type LocalJobRelations = {
  schemaVersion: "jd-local-relations/1.0.0";
  authority: "local_review_only";
  persistable: false;
  scoringEligible: false;
  sourceDocumentId: string;
  inputSha256: string;
  sourceText: string;
  sourceModelVersion: "jd-local-alias-parser/1.0.0";
  sourceState: LocalAliasJobRequirements["state"];
  locale: string;
  domain: string;
  aliasPolicy: LocalAliasJobRequirements["mappingPolicy"];
  policy: { version: typeof LOCAL_JOB_RELATION_POLICY_VERSION; sha256: string };
  clauses: Array<{
    id: string;
    evidence: Span;
    reviewRequired: true;
    scope: {
      importance: LocalAliasJobRequirements["retainedClauses"][number]["importance"];
      negated: boolean;
      authority: "inherited_local_review_scope";
    };
    skillExpression: LocalSkillExpression;
    duration: LocalDuration;
    prospectiveCreditGroups: string[];
    numericCredit: null;
  }>;
};
const invalid = (): never => {
  throw new Error("JD_RELATION_INPUT_INVALID");
};
const overLimit = (): never => {
  throw new Error("JD_RELATION_LIMIT");
};
const normalized = (value: string) =>
  value.trim().replace(/\s+/gu, " ").toLowerCase();
const prefixes = new Set([
  "",
  "must have",
  "experience with",
  "experience in",
  "hands-on experience with",
  "proficiency in",
  "knowledge of",
  "either",
  "both",
]);
const suffixes = new Set([
  "",
  "required",
  "preferred",
  "mandatory",
  "essential",
  "optional",
  "experience",
  "skills",
  "experience required",
  "skills required",
  "is required",
  "are required",
  "is preferred",
  "are preferred",
]);
const durationPattern = () =>
  /(?<![\p{L}\p{N}\p{M}_.,])(?:(?<comparator>at\s+least|more\s+than|over|at\s+most|less\s+than|under|exactly)\s+)?(?<amount>\d{1,3})(?:\s*(?<range>[-–])\s*(?<upper>\d{1,3})|(?<plus>\s*\+))?\s*(?<unit>years?|yrs?)(?![\p{L}\p{N}\p{M}_])/dgiu;

export function deriveLocalJobRelations(
  document: LocalAliasJobRequirements,
): LocalJobRelations {
  return deriveRelations(document);
}

/** Interpret one leading list marker on an already admitted JD for review. */
export function deriveJobListClauses(
  document: JobRequirementRelations,
): Map<string, { marker: Span; clause: LocalJobRelations["clauses"][number] }> {
  const chars = Array.from(document.sourceText);
  const markers = new Map<number, Span>();
  for (const { evidence } of document.relations.clauses) {
    if (!/^[•*-][\t \u00a0]+/u.test(evidence.quote)) continue;
    let cursor = evidence.start - 1;
    while (cursor >= 0 && /^[\t \u00a0]$/u.test(chars[cursor])) cursor--;
    if (cursor >= 0 && chars[cursor] !== "\n") continue;
    const { start } = evidence;
    markers.set(start, {
      spanId: `jd-${start}-${start + 1}`,
      start,
      end: start + 1,
      quote: chars[start],
    });
  }
  if (!markers.size) return new Map();
  const result = deriveRelations(
    {
      ...document,
      schemaVersion: "jd-local-discovery/1.0.0",
      modelVersion: "jd-local-alias-parser/1.0.0",
      authority: "local_review_only",
      persistable: false,
    },
    markers,
  );
  return new Map(
    result.clauses.flatMap((clause) => {
      const marker = markers.get(clause.evidence.start);
      return marker
        ? [[clause.evidence.spanId, { marker, clause }] as const]
        : [];
    }),
  );
}

type RelationInput = Omit<LocalAliasJobRequirements, "legacyParserVersion">;
function deriveRelations(
  document: RelationInput,
  listMarkers?: ReadonlyMap<number, Span>,
): LocalJobRelations {
  if (
    !document ||
    typeof document.sourceText !== "string" ||
    !Array.isArray(document.requirements) ||
    !Array.isArray(document.retainedClauses)
  )
    invalid();
  if (
    document.sourceText.length > limits.sourceUtf16 ||
    document.requirements.length > limits.requirements ||
    document.retainedClauses.length > limits.clauses
  )
    overLimit();
  if (
    document.schemaVersion !== "jd-local-discovery/1.0.0" ||
    document.modelVersion !== "jd-local-alias-parser/1.0.0" ||
    document.authority !== "local_review_only" ||
    document.persistable !== false ||
    document.scoringEligible !== false ||
    document.mappingPolicy?.version !== JOB_ALIAS_POLICY_VERSION ||
    document.mappingPolicy.lexiconSha256 !== JOB_ALIAS_LEXICON_SHA256 ||
    document.mappingPolicy.externalTaxonomy !== null ||
    createHash("sha256").update(document.sourceText).digest("hex") !==
      document.inputSha256
  )
    invalid();
  const supported =
    document.locale === "en-IN" &&
    document.domain === "software-engineering" &&
    document.state !== "unsupported";
  const chars = Array.from(document.sourceText);
  const exact = (e: Span) => {
    if (
      !e ||
      !Number.isInteger(e.start) ||
      !Number.isInteger(e.end) ||
      e.start < 0 ||
      e.end <= e.start ||
      e.end > chars.length ||
      typeof e.quote !== "string" ||
      e.quote.length > limits.clauseUtf16 ||
      chars.slice(e.start, e.end).join("") !== e.quote ||
      e.spanId !== `jd-${e.start}-${e.end}`
    )
      invalid();
  };
  const span = (start: number, end: number): Span => ({
    spanId: `jd-${start}-${end}`,
    start,
    end,
    quote: chars.slice(start, end).join(""),
  });
  const ids = new Set<string>();
  const aliasCitations = new Map<string, Set<string>>();
  let tokens = 0;
  for (const r of document.requirements) {
    if (
      !r ||
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.value !== "string" ||
      !r.value.length ||
      r.value.length > 2000 ||
      !Array.isArray(r.tokenEvidence) ||
      !Array.isArray(r.ambiguity) ||
      r.ambiguity.length > limits.ambiguityEntries ||
      Array.from(r.ambiguity).some(
        (item) =>
          typeof item !== "string" ||
          item.length === 0 ||
          item.length > limits.ambiguityItemUtf16,
      )
    )
      invalid();
    ids.add(r.id);
    exact(r.evidence);
    if (!r.evidence.quote.includes(r.value)) invalid();
    if (tokens + r.tokenEvidence.length > limits.tokens) overLimit();
    tokens += r.tokenEvidence.length;
    let allowedAliasTokens: Set<string> | null = null;
    if (resolveJobAlias(r.value).kind !== "unmapped") {
      const key = `${r.evidence.start}:${r.evidence.end}`;
      allowedAliasTokens =
        aliasCitations.get(key) ??
        new Set(
          discoverJobAliasMentions(r.evidence.quote).map(
            (m) =>
              `${r.evidence.start + m.evidence.start}:${r.evidence.start + m.evidence.end}`,
          ),
        );
      aliasCitations.set(key, allowedAliasTokens);
    }
    for (const token of r.tokenEvidence) {
      exact(token);
      if (
        allowedAliasTokens &&
        !allowedAliasTokens.has(`${token.start}:${token.end}`)
      )
        invalid();
      if (
        r.type !== "skill" ||
        token.start < r.evidence.start ||
        token.end > r.evidence.end ||
        token.quote.toLowerCase() !== r.value.toLowerCase()
      )
        invalid();
    }
  }
  for (const clause of document.retainedClauses)
    if (
      !clause ||
      !clause.evidence ||
      typeof clause.evidence.quote !== "string"
    )
      invalid();
  const clauseInputs = [...document.retainedClauses];
  const existingSpans = new Set(
    clauseInputs.map((c) => `${c?.evidence?.start}:${c?.evidence?.end}`),
  );
  // The A07 review list deliberately excludes metadata. Experience observations
  // still retain exact source clauses, so include those in this new local view.
  for (const r of document.requirements)
    if (r.type === "experience") {
      const key = `${r.evidence.start}:${r.evidence.end}`;
      if (existingSpans.has(key)) continue;
      if (clauseInputs.length >= limits.clauses) overLimit();
      clauseInputs.push({
        evidence: r.evidence,
        importance: r.importance,
        negated: r.negated,
        interpretation: "partial_vocabulary",
        reviewRequired: true,
        requirementIds: document.requirements
          .filter(
            (item) =>
              item.evidence.start === r.evidence.start &&
              item.evidence.end === r.evidence.end,
          )
          .map((item) => item.id),
      });
      existingSpans.add(key);
    }
  clauseInputs.sort((a, b) => a.evidence.start - b.evidence.start);
  const seenClauses = new Set<string>();
  let nodeCount = 0;
  // All counters and exact-reference checks precede output graph construction.
  const prepared = clauseInputs.map((clause) => {
    if (
      !clause ||
      !clause.evidence ||
      typeof clause.evidence.quote !== "string"
    )
      invalid();
    if (clause.evidence.quote.length > limits.clauseUtf16) overLimit();
    exact(clause.evidence);
    if (
      typeof clause.negated !== "boolean" ||
      clause.negated !==
        /\b(no|not(?!\s+only\b)|without|never)\b/iu.test(clause.evidence.quote)
    )
      invalid();
    const key = `${clause.evidence.start}:${clause.evidence.end}`;
    if (seenClauses.has(key)) invalid();
    seenClauses.add(key);
    const members = document.requirements.filter(
      (r) =>
        r.evidence.start === clause.evidence.start &&
        r.evidence.end === clause.evidence.end,
    );
    if (
      !Array.isArray(clause.requirementIds) ||
      clause.requirementIds.length !== members.length ||
      clause.requirementIds.some((id, i) => id !== members[i].id)
    )
      invalid();
    const observed = new Map<
      string,
      { evidence: Span; requirementIds: string[] }
    >();
    for (const r of members)
      for (const token of r.tokenEvidence) {
        const tokenKey = `${token.start}:${token.end}`;
        const existing = observed.get(tokenKey);
        if (existing) {
          existing.requirementIds.push(r.id);
          continue;
        }
        if (observed.size >= limits.operands) overLimit();
        observed.set(tokenKey, { evidence: token, requirementIds: [r.id] });
      }
    let depth = 0,
      deepest = 0,
      unbalanced = false;
    for (const char of clause.evidence.quote) {
      if (char === "(") {
        depth++;
        deepest = Math.max(depth, deepest);
        if (depth > limits.rawDepth) overLimit();
      }
      if (char === ")") {
        if (depth === 0) unbalanced = true;
        else depth--;
      }
    }
    unbalanced ||= depth !== 0;
    const durationMatches: RegExpMatchArray[] = [];
    for (const match of clause.evidence.quote.matchAll(durationPattern())) {
      if (durationMatches.length >= limits.durationCandidates) overLimit();
      durationMatches.push(match);
    }
    nodeCount += 1 + observed.size + 4 * durationMatches.length;
    if (nodeCount > limits.nodes) overLimit();
    return {
      clause,
      members,
      observed: [...observed.values()].sort(
        (a, b) => a.evidence.start - b.evidence.start,
      ),
      deepest,
      unbalanced,
      durationMatches,
    };
  });
  const clauses = prepared.map(
    ({ clause, members, observed, deepest, unbalanced, durationMatches }) => {
      const evidence = { ...clause.evidence };
      const prefixOffset = listMarkers?.has(evidence.start) ? 1 : 0;
      const unknown = (reason: string): LocalSkillExpression => ({
        kind: "unknown",
        reason,
        evidence,
        observedRequirementIds: members.map((r) => r.id),
      });
      let skillExpression: LocalSkillExpression;
      if (!supported) skillExpression = unknown("unsupported_segment_review");
      else if (unbalanced)
        skillExpression = unknown("unbalanced_parentheses_review");
      else if (deepest)
        skillExpression = unknown("parenthesized_expression_review");
      else if (clause.negated)
        skillExpression = unknown("negated_expression_review");
      else if (
        members.some((r) => r.ambiguity.includes("conflicting_importance"))
      )
        skillExpression = unknown("conflicting_importance_review");
      else if (!observed.length)
        skillExpression = unknown("no_discovered_operands_review");
      else {
        const first = observed[0].evidence,
          last = observed[observed.length - 1].evidence;
        const prefix = normalized(
          chars.slice(evidence.start + prefixOffset, first.start).join(""),
        );
        const suffix = normalized(
          chars.slice(last.end, evidence.end).join(""),
        ).replace(/[.!]$/u, "");
        const operators: Span[] = [];
        let badConnector = false,
          overlapping = false;
        for (let i = 1; i < observed.length; i++) {
          const left = observed[i - 1].evidence,
            right = observed[i].evidence;
          if (left.end > right.start) {
            overlapping = true;
            break;
          }
          const between = chars.slice(left.end, right.start).join("");
          const match = /^\s*(and|or)\s*$/iu.exec(between);
          if (!match) {
            badConnector = true;
            break;
          }
          const begin =
            left.end +
            Array.from(between.slice(0, between.indexOf(match[1]))).length;
          operators.push(span(begin, begin + Array.from(match[1]).length));
        }
        const kinds = new Set(operators.map((o) => o.quote.toLowerCase()));
        if (overlapping)
          skillExpression = unknown("overlapping_operands_review");
        else if (kinds.size > 1)
          skillExpression = unknown("mixed_connectors_review");
        else if (badConnector)
          skillExpression = unknown("unsupported_connector_review");
        else if (!prefixes.has(prefix) || !suffixes.has(suffix))
          skillExpression = unknown("unparsed_scope_or_operand_review");
        else if (
          (prefix === "either" && kinds.has("and")) ||
          (prefix === "both" && kinds.has("or"))
        )
          skillExpression = unknown("scope_connector_conflict_review");
        else {
          const operands: Operand[] = observed.map((o) => ({
            kind: "atom",
            value: o.evidence.quote,
            evidence: { ...o.evidence },
            requirementIds: [...o.requirementIds],
            mapping: resolveJobAlias(o.evidence.quote),
          }));
          skillExpression =
            operands.length === 1
              ? operands[0]
              : {
                  kind: kinds.has("or") ? "any_of" : "all_of",
                  evidence: span(first.start, last.end),
                  operands,
                  operatorEvidence: operators,
                };
        }
      }
      const relative = (indices: [number, number]): Span =>
        span(
          evidence.start +
            Array.from(evidence.quote.slice(0, indices[0])).length,
          evidence.start +
            Array.from(evidence.quote.slice(0, indices[1])).length,
        );
      const candidates = durationMatches.map((m) => relative(m.indices![0]));
      const unknownDuration = (reason: string): LocalDuration => ({
        kind: "unknown",
        evidence,
        lower: null,
        upper: null,
        operatorEvidence: [],
        candidateEvidence: candidates,
        reason,
        subjectBinding: "literal_clause_only",
        evaluated: false,
      });
      let duration: LocalDuration;
      if (!durationMatches.length)
        duration = /\b(years?|yrs?|months?|mos?)\b/iu.test(evidence.quote)
          ? unknownDuration("unsupported_duration_review")
          : {
              kind: "not_stated",
              evidence: null,
              lower: null,
              upper: null,
              operatorEvidence: [],
              candidateEvidence: [],
              reason: null,
              subjectBinding: "literal_clause_only",
              evaluated: false,
            };
      else if (!supported)
        duration = unknownDuration("unsupported_segment_review");
      else if (clause.negated)
        duration = unknownDuration("negated_duration_review");
      else if (durationMatches.length > 1)
        duration = unknownDuration("multiple_durations_review");
      else {
        const match = durationMatches[0],
          groups = match.groups!,
          indices = match.indices!.groups!;
        const amount = Number(groups.amount),
          upper = groups.upper ? Number(groups.upper) : null,
          comparator = groups.comparator ? normalized(groups.comparator) : "";
        const bound = (
          value: number,
          inclusive: boolean,
          key: string,
        ): Bound => ({ value, inclusive, evidence: relative(indices[key]) });
        const operators = ["comparator", "range", "plus"]
          .filter((key) => indices[key] !== undefined)
          .map((key) => relative(indices[key]));
        const base = {
          evidence: candidates[0],
          lower: null,
          upper: null,
          operatorEvidence: operators,
          candidateEvidence: candidates,
          reason: null,
          subjectBinding: "literal_clause_only" as const,
          evaluated: false as const,
        };
        const prefix = normalized(
          evidence.quote.slice(prefixOffset, match.index),
        );
        const knownPrefix =
          ["", "must have", "requires", "required:"].includes(prefix) ||
          /^(?:exp(?:erience)?\s*range|experience)\s*:$/iu.test(prefix);
        if (!knownPrefix) duration = unknownDuration("duration_prefix_review");
        else if (amount > 100 || (upper !== null && upper > 100))
          duration = unknownDuration("duration_value_review");
        else if (comparator && (groups.range || groups.plus))
          duration = unknownDuration("mixed_comparator_review");
        else if (upper !== null && amount > upper)
          duration = unknownDuration("inverted_range_review");
        else if (upper !== null)
          duration = {
            ...base,
            kind: "range",
            lower: bound(amount, true, "amount"),
            upper: bound(upper, true, "upper"),
          };
        else if (comparator === "at least" || groups.plus)
          duration = {
            ...base,
            kind: "at_least",
            lower: bound(amount, true, "amount"),
          };
        else if (comparator === "more than" || comparator === "over")
          duration = {
            ...base,
            kind: "more_than",
            lower: bound(amount, false, "amount"),
          };
        else if (comparator === "at most")
          duration = {
            ...base,
            kind: "at_most",
            upper: bound(amount, true, "amount"),
          };
        else if (comparator === "less than" || comparator === "under")
          duration = {
            ...base,
            kind: "less_than",
            upper: bound(amount, false, "amount"),
          };
        else if (comparator === "exactly")
          duration = {
            ...base,
            kind: "exactly",
            lower: bound(amount, true, "amount"),
            upper: bound(amount, true, "amount"),
          };
        else duration = unknownDuration("comparator_unstated_review");
      }
      const groups = new Set(
        observed
          .map((o) => resolveJobAlias(o.evidence.quote).prospectiveCreditGroup)
          .filter((group): group is string => group !== null),
      );
      return {
        id: createHash("sha256")
          .update(
            `${LOCAL_JOB_RELATION_POLICY_SHA256}:${document.id}:${document.inputSha256}:${evidence.start}:${evidence.end}`,
          )
          .digest("hex"),
        evidence,
        reviewRequired: true as const,
        scope: {
          importance: clause.importance,
          negated: clause.negated,
          authority: "inherited_local_review_scope" as const,
        },
        skillExpression,
        duration,
        prospectiveCreditGroups: [...groups],
        numericCredit: null,
      };
    },
  );
  return {
    schemaVersion: "jd-local-relations/1.0.0",
    authority: "local_review_only",
    persistable: false,
    scoringEligible: false,
    sourceDocumentId: document.id,
    inputSha256: document.inputSha256,
    sourceText: document.sourceText,
    sourceModelVersion: document.modelVersion,
    sourceState: document.state,
    locale: document.locale,
    domain: document.domain,
    aliasPolicy: { ...document.mappingPolicy },
    policy: {
      version: LOCAL_JOB_RELATION_POLICY_VERSION,
      sha256: LOCAL_JOB_RELATION_POLICY_SHA256,
    },
    clauses,
  };
}
