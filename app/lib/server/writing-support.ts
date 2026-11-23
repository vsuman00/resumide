import { createHash } from "node:crypto";

export const WRITING_SUPPORT_POLICY_VERSION = "legacy-source-transforms/1.0.4";
const SCHEMA_VERSION = "writing-support/1.1.0";
const LIMITS = {
  source: 100_000,
  anchors: 512,
  clauses: 16,
  proposal: 2000,
  clauseMetrics: 32,
  documentMetrics: 256,
  clauseScopes: 16,
  documentScopes: 256,
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export type WritingSourceSpan = {
  id: string;
  start: number;
  end: number;
  text: string;
};
type Direction =
  "increase" | "decrease" | "improvement_unspecified" | "unknown";
type Agency =
  "contributor" | "supporting" | "leader" | "manager" | "owner" | "unknown";
type ActionConcept =
  | "create"
  | "design"
  | "implement"
  | "improve"
  | "decrease"
  | "increase"
  | "support"
  | "lead"
  | "manage"
  | "own"
  | "maintain"
  | "work"
  | "unknown";
export type WritingClause = {
  span: WritingSourceSpan;
  actor: {
    kind: "implicit_source_subject" | "explicit" | "unknown";
    value: string | null;
  };
  action: {
    surface: string | null;
    concept: ActionConcept;
    agency: Agency;
    span: WritingSourceSpan | null;
  };
  object: WritingSourceSpan | null;
  negated: boolean;
  direction: Direction;
  metrics: Array<{
    span: WritingSourceSpan;
    literal: string;
    value: string;
    unit: string | null;
    governor: WritingSourceSpan | null;
    direction: Direction;
    scopeBinding: "clause_context_only";
    scope: WritingSourceSpan[];
  }>;
  scope: WritingSourceSpan[];
};
export type WritingSourceAnchor = {
  span: WritingSourceSpan;
  clauses: WritingClause[];
  reorderable: boolean;
  role: {
    title: string;
    employer: string;
    subject: "implicit_source_subject";
  } | null;
  context: {
    kind:
      "unqualified_resume_clause" | "qualified_or_unknown" | "section_heading";
    qualifierIds: string[];
    adjacentRoleId: string | null;
    layoutEntry: WritingLayoutEntry | null;
  };
};
export type WritingLayoutEntry = {
  id: string;
  kind: "project" | "employer_role";
  headerAnchorIds: string[];
  entrySpan: Pick<WritingSourceSpan, "id" | "start" | "end">;
  authority: "derived_layout_only";
  attribution: "not_inferred";
};
export type WritingSupportDocument = {
  schemaVersion: string;
  policyVersion: string;
  sourceSha256: string;
  offsetUnit: "unicode_code_point";
  sourceText: string;
  anchors: WritingSourceAnchor[];
};
type Binding = { sourceSha256: string; policyVersion: string };
export type WritingSupportOperation = {
  kind:
    | "copy_source"
    | "normalize_layout"
    | "replace_equivalent_action"
    | "reorder_independent_clauses"
    | "compose_explicit_role_contribution"
    | "editorial_explanation";
  anchorId: string;
};
export type WritingSupportOutcome =
  | {
      state: "supported";
      authority: "source_transformation_only";
      binding: Binding;
      sourceAnchorIds: string[];
      operations: WritingSupportOperation[];
    }
  | {
      state: "clarification_required";
      binding: Binding;
      missingSupport: string;
    }
  | { state: "rejected"; binding: Binding; reason: string };
export type WritingSupportRequest = (
  | { kind: "rewrite" | "editorial"; original: string; proposed: string }
  | { kind: "summary"; proposed: string }
) & { expectedSourceSha256?: string; expectedPolicyVersion?: string };

const ACTIONS: Record<string, { concept: ActionConcept; agency: Agency }> = {
  built: { concept: "create", agency: "contributor" },
  created: { concept: "create", agency: "contributor" },
  developed: { concept: "create", agency: "contributor" },
  designed: { concept: "design", agency: "contributor" },
  implemented: { concept: "implement", agency: "contributor" },
  improved: { concept: "improve", agency: "contributor" },
  reduced: { concept: "decrease", agency: "contributor" },
  increased: { concept: "increase", agency: "contributor" },
  supported: { concept: "support", agency: "supporting" },
  helped: { concept: "support", agency: "supporting" },
  led: { concept: "lead", agency: "leader" },
  lead: { concept: "lead", agency: "leader" },
  managed: { concept: "manage", agency: "manager" },
  owned: { concept: "own", agency: "owner" },
  maintained: { concept: "maintain", agency: "contributor" },
  worked: { concept: "work", agency: "supporting" },
};
const verbs = Object.keys(ACTIONS).join("|");
const actionPattern = new RegExp(
  `^(?:(I|We)\\s+)?(?:(did\\s+not|never)\\s+)?(${verbs})\\b`,
  "iu",
);
const startsAction = (text: string) => actionPattern.test(stripBullet(text));
// A title is a reviewed resume field grammar, not an arbitrary phrase ending in
// "Engineer" (for example, "Met a Backend Engineer" describes another person).
const roleTitleSource = String.raw`(?:(?:contract|freelance|senior|junior|lead|principal|staff|associate|graduate|intern)\s+)*(?:(?:backend|frontend|full[- ]stack|software|data|platform|cloud|devops|security|research|machine learning|AI|ML|product|QA)\s+)?(?:engineer|developer|analyst|architect|designer|scientist)`;
const rolePattern = new RegExp(
  `^(${roleTitleSource})\\s+at\\s+([^;\\n]+?)\\.?$`,
  "iu",
);
const standaloneRolePattern = new RegExp(`^${roleTitleSource}$`, "iu");
const headingPattern =
  /^(?:(?:professional|technical|relevant|work)\s+)?(?:summary|skills|experience|education|projects|certifications|achievements|awards|publications)\s*$/iu;
const metricPattern =
  /(?<![\p{L}\p{N}])[+−-]?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|milliseconds?|ms|seconds?|minutes?|hours?|users?|requests?|engineers?))?/giu;
const scopePattern = /\b(?:at|for|with|during|within|in)\s+/giu;
// This finite engineering-layout policy grants context for source transforms,
// never an employer/project fact or candidate attribution.
const layoutPolicy = {
  version: "engineering-entry-metadata/1.0.0",
  maxLabelUtf16: 80,
  minWords: 2,
  maxWords: 4,
  maxWordUtf16: 24,
  projectMarkers: [
    "project",
    "dashboard",
    "worker",
    "service",
    "api",
    "tool",
    "platform",
    "app",
    "application",
    "system",
    "library",
    "pipeline",
    "portal",
    "tracker",
    "console",
  ],
  employerMarkers: [
    "labs",
    "works",
    "technologies",
    "systems",
    "software",
    "solutions",
    "inc",
    "llc",
    "ltd",
    "limited",
    "corporation",
    "corp",
    "company",
    "co",
  ],
  rejectedTokens: [
    ...Object.keys(ACTIONS),
    "no",
    "not",
    "never",
    "without",
    "thing",
    "things",
    "done",
    "team",
    "teams",
    "result",
    "results",
    "hypothetical",
    "fictional",
    "fake",
    "mock",
    "planned",
    "proposed",
    "template",
    "example",
    "examples",
    "sample",
    "samples",
    "other",
    "candidate",
    "candidates",
    "colleague",
    "colleagues",
    "i",
    "we",
    "our",
    "ours",
    "my",
    "mine",
    "your",
    "yours",
    "you",
    "he",
    "his",
    "she",
    "her",
    "hers",
    "their",
    "theirs",
    "they",
    "them",
    "teamresults",
    "othercandidates",
    "hypotheticalexample",
    "thingsneverdone",
  ],
  roleTitleSource,
};
const layoutPolicySha256 = hash(JSON.stringify(layoutPolicy));
function unsafeLayoutTokens(text: string): boolean {
  const words = text
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u);
  return words.some((word) => layoutPolicy.rejectedTokens.includes(word));
}
function neutralLayoutLabel(
  text: string,
  kind: WritingLayoutEntry["kind"],
): boolean {
  if (text.length > layoutPolicy.maxLabelUtf16 || unsafeLayoutTokens(text))
    return false;
  const words = text.split(/[ \t]+/u);
  if (
    words.length < layoutPolicy.minWords ||
    words.length > layoutPolicy.maxWords ||
    words.some(
      (word) =>
        word.length > layoutPolicy.maxWordUtf16 ||
        !/^[A-Z][A-Za-z0-9]+$/u.test(word),
    )
  )
    return false;
  const markers =
    kind === "project"
      ? layoutPolicy.projectMarkers
      : layoutPolicy.employerMarkers;
  return markers.includes(words.at(-1)!.toLowerCase());
}
type SourceContext = {
  text: string;
  sha256: string;
  codePointOffsets: Uint32Array;
};

function boundedMatches(
  text: string,
  pattern: RegExp,
  limit: number,
): RegExpMatchArray[] {
  const matches: RegExpMatchArray[] = [];
  for (const match of text.matchAll(pattern)) {
    if (matches.length >= limit) throw Error("WRITING_SUPPORT_RELATION_LIMIT");
    matches.push(match);
  }
  return matches;
}
function sourceContext(text: string): SourceContext {
  // Admit the document before expanding any metric/scope relationships or spans.
  boundedMatches(text, metricPattern, LIMITS.documentMetrics);
  boundedMatches(text, scopePattern, LIMITS.documentScopes);
  const codePointOffsets = new Uint32Array(text.length + 1);
  let points = 0;
  for (let offset = 0; offset < text.length;) {
    const width = text.codePointAt(offset)! > 0xffff ? 2 : 1;
    codePointOffsets[offset] = points;
    if (width === 2) codePointOffsets[offset + 1] = points;
    offset += width;
    codePointOffsets[offset] = ++points;
  }
  return { text, sha256: hash(text), codePointOffsets };
}

function stripBullet(text: string): string {
  return text.trim().replace(/^[•●·▪–—-]\s+(?=\p{L})/u, "");
}
function comparable(text: string): string {
  const normalized = stripBullet(text).normalize("NFC").replace(/\s+/gu, " ");
  return /https?:\/\/|mailto:/iu.test(normalized)
    ? normalized
    : normalized.replace(/\.$/u, "");
}
const proseLigatures: Readonly<Record<string, string>> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};
const opaqueProseCues = new Set([
  "argument",
  "called",
  "class",
  "code",
  "column",
  "command",
  "email",
  "field",
  "file",
  "filename",
  "function",
  "identifier",
  "key",
  "literal",
  "mailbox",
  "method",
  "metric",
  "model",
  "module",
  "named",
  "namespace",
  "package",
  "parameter",
  "path",
  "property",
  "symbol",
  "token",
  "unit",
  "url",
  "variable",
]);
/** Comparison of admitted prose only. Never use this for anchor lookup or IR. */
function comparableProse(text: string): string {
  const literal = comparable(text);
  // Numeric/technical/quoted contexts retain their existing exact comparison.
  // This deliberately withholds uncertain typography instead of interpreting
  // opaque identifiers, code, contact details or metric names/units as prose.
  if (
    !actionPattern.test(literal) ||
    /\p{N}|[`"'“”‘’\\/<>\[\]{}=:@_$#|*]/u.test(literal)
  )
    return literal;
  const words = literal.split(" ");
  return words
    .map((word, index) => {
      const token = /^([a-z\u00AD\uFB00-\uFB06]+)([.,;!?]?)$/u.exec(word);
      if (!token || !/[\u00AD\uFB00-\uFB06]/u.test(token[1])) return word;
      const previous = words[index - 1]?.toLowerCase().replace(/[.,;!?]$/u, "");
      if (previous && opaqueProseCues.has(previous)) return word;
      // A discretionary hyphen must have alphabetic neighbors in this same
      // lower-case word. Leading, trailing and consecutive marks remain opaque.
      if (
        /(?<![a-z\uFB00-\uFB06])\u00AD|\u00AD(?![a-z\uFB00-\uFB06])/u.test(
          token[1],
        )
      )
        return word;
      return (
        token[1]
          .replace(/[\uFB00-\uFB06]/gu, (glyph) => proseLigatures[glyph])
          .replace(/\u00AD/gu, "") + token[2]
      );
    })
    .join(" ");
}
function inertContactMetadata(text: string): boolean {
  const mailbox = text.replace(/^Email:[ \t]*/iu, "");
  if (
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u.test(
      mailbox,
    )
  )
    return true;
  if (!/^https?:\/\//iu.test(text) || /\s/u.test(text)) return false;
  try {
    const url = new URL(text);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
function span(
  source: SourceContext,
  start: number,
  end: number,
): WritingSourceSpan {
  const raw = source.text.slice(start, end);
  start += raw.length - raw.trimStart().length;
  end = Math.max(start, end - (raw.length - raw.trimEnd().length));
  return {
    id: hash(`${source.sha256}:${start}:${end}`),
    start: source.codePointOffsets[start],
    end: source.codePointOffsets[end],
    text: source.text.slice(start, end),
  };
}
function lowerIsBetter(object: string | null): boolean {
  if (!object) return false;
  // Exactly one positive time/percentage metric. Compound outcomes, negative
  // changes, and counts do not prove the direction of an "improvement".
  const metric =
    /^(?:API\s+)?(?:latency|response time)\s+by\s+([+]?(?:\d+(?:\.\d+)?))\s*(%|percent|milliseconds?|ms|seconds?)(?![\p{L}\p{N}])(.*)$/iu.exec(
      object,
    );
  if (!metric || !Number.isFinite(Number(metric[1])) || Number(metric[1]) <= 0)
    return false;
  const suffix = metric[3].replace(/\.$/u, "");
  return (
    !/\b(?:and|or|but|not|never|without)\b|[,;\d]/iu.test(suffix) &&
    (!suffix.trim() || /^\s+(?:at|for|during|within|in)\s+\p{L}/iu.test(suffix))
  );
}
function clause(
  source: SourceContext,
  start: number,
  end: number,
): WritingClause {
  const raw = source.text.slice(start, end);
  const metricTokens = boundedMatches(raw, metricPattern, LIMITS.clauseMetrics);
  const scopeTokens = boundedMatches(raw, scopePattern, LIMITS.clauseScopes);
  start += raw.length - raw.trimStart().length;
  const initial = span(source, start, end);
  start += /^[•●·▪–—-]\s+(?=\p{L})/u.exec(initial.text)?.[0].length ?? 0;
  const anchored = span(source, start, end);
  const text = anchored.text;
  const action = actionPattern.exec(text);
  const objectStart = action ? start + action[0].length : end;
  const object =
    action && text.slice(action[0].length).trim()
      ? span(source, objectStart, end)
      : null;
  const details = action
    ? ACTIONS[action[3].toLowerCase()]
    : { concept: "unknown" as const, agency: "unknown" as const };
  const negated = /\b(?:not|never|without)\b/iu.test(text);
  const direction: Direction =
    details.concept === "decrease"
      ? "decrease"
      : details.concept === "increase"
        ? "increase"
        : details.concept === "improve"
          ? lowerIsBetter(object?.text ?? null)
            ? "decrease"
            : "improvement_unspecified"
          : "unknown";
  const scope: WritingSourceSpan[] = [];
  if (object) {
    const objectOffset = objectStart - (end - raw.length);
    const tokens = scopeTokens.filter((match) => match.index! >= objectOffset);
    for (let index = 0; index < tokens.length; index++) {
      const tokenStart = end - raw.length + tokens[index].index!;
      const tokenEnd =
        index + 1 < tokens.length
          ? end - raw.length + tokens[index + 1].index!
          : end;
      scope.push(span(source, tokenStart, tokenEnd));
    }
  }
  const metrics: WritingClause["metrics"] = [];
  if (object) {
    const body = source.text.slice(objectStart, end);
    const bodyOffset = objectStart - (end - raw.length);
    const separators = [...body.matchAll(/\b(?:and|or)\s+|[,;]/giu)];
    let separatorIndex = -1;
    for (const match of metricTokens.filter(
      (token) => token.index! >= bodyOffset,
    )) {
      const metricIndex = match.index! - bodyOffset;
      const prefix = body.slice(0, metricIndex);
      while (
        separatorIndex + 1 < separators.length &&
        separators[separatorIndex + 1].index! +
          separators[separatorIndex + 1][0].length <=
          metricIndex
      )
        separatorIndex++;
      const split = separators[separatorIndex];
      const segment = prefix.slice(split ? split.index! + split[0].length : 0);
      const governorText = segment
        .trim()
        .replace(/\s+(?:by|of|to|at)\s*$/iu, "")
        .trim();
      const governorStart = governorText
        ? prefix.lastIndexOf(governorText)
        : -1;
      const amount = /^([+−-]?\d+(?:[.,]\d+)*)(.*)$/u.exec(match[0])!;
      metrics.push({
        span: span(
          source,
          objectStart + metricIndex,
          objectStart + metricIndex + match[0].length,
        ),
        literal: match[0].trim(),
        value: amount[1],
        unit: amount[2].trim() || null,
        governor:
          governorStart >= 0
            ? span(
                source,
                objectStart + governorStart,
                objectStart + governorStart + governorText.length,
              )
            : null,
        direction,
        // Literal clause context is retained, never promoted to an inferred
        // per-metric employer/date association. Acceptance reconstructs the
        // complete original object and qualifiers instead of joining this list.
        scopeBinding: "clause_context_only",
        scope,
      });
    }
  }
  return {
    span: anchored,
    actor: {
      kind: action
        ? action[1]
          ? "explicit"
          : "implicit_source_subject"
        : "unknown",
      value: action?.[1]
        ? action[1].toLowerCase() === "we"
          ? "We"
          : "I"
        : null,
    },
    action: {
      surface: action?.[3] ?? null,
      ...details,
      span: action
        ? span(
            source,
            start + action[0].length - action[3].length,
            start + action[0].length,
          )
        : null,
    },
    object,
    negated,
    direction,
    metrics,
    scope,
  };
}
function splitClauses(
  source: SourceContext,
  start: number,
  end: number,
): WritingClause[] {
  const body = source.text.slice(start, end);
  const separator = new RegExp(
    `;\\s*|\\s+and\\s+(?=(?:(?:I|We)\\s+)?(?:${verbs})\\b)|\\.\\s+(?=(?:(?:I|We)\\s+)?(?:${verbs})\\b)`,
    "giu",
  );
  const ranges: Array<[number, number]> = [];
  const addRange = (from: number, to: number) => {
    if (!body.slice(from, to).trim()) return;
    if (ranges.length >= LIMITS.clauses)
      throw Error("WRITING_SUPPORT_ANCHOR_LIMIT");
    ranges.push([start + from, start + to]);
  };
  let cursor = 0;
  for (const match of body.matchAll(separator)) {
    addRange(cursor, match.index!);
    cursor = match.index! + match[0].length;
  }
  addRange(cursor, body.length);
  return ranges.map(([from, to]) => clause(source, from, to));
}

export function buildWritingSupportDocument(
  sourceText: string,
): WritingSupportDocument {
  if (typeof sourceText !== "string" || sourceText.length > LIMITS.source)
    throw Error("WRITING_SUPPORT_SOURCE_LIMIT");
  const source = sourceContext(sourceText);
  const lines = [...sourceText.matchAll(/[^\n]+/gu)].filter((line) =>
    line[0].trim(),
  );
  const units: Array<{
    start: number;
    end: number;
    anchored: WritingSourceSpan;
    clauses: WritingClause[];
    role: RegExpExecArray | null;
    heading: boolean;
    initialLabel: boolean;
    parsedContribution: boolean;
  }> = [];
  for (let index = 0; index < lines.length; index++) {
    if (units.length >= LIMITS.anchors)
      throw Error("WRITING_SUPPORT_ANCHOR_LIMIT");
    const line = lines[index];
    const start = line.index!;
    let end = start + line[0].length;
    let tail = line[0];
    if (startsAction(line[0])) {
      while (!/[.!?]\s*$/u.test(tail) && index + 1 < lines.length) {
        const next = lines[index + 1];
        const text = next[0].trim();
        const adjacent = /^\r?\n$/u.test(sourceText.slice(end, next.index));
        const continuation =
          /^\p{Ll}/u.test(text) || (/;\s*$/u.test(tail) && startsAction(text));
        if (
          !adjacent ||
          !continuation ||
          headingPattern.test(text) ||
          /^[•●·▪–—-]\s/u.test(text) ||
          rolePattern.test(text)
        )
          break;
        end = next.index! + next[0].length;
        tail = next[0];
        index++;
      }
    }
    const anchored = span(source, start, end);
    const clauses = splitClauses(source, start, end);
    const role = rolePattern.exec(anchored.text);
    const heading = headingPattern.test(anchored.text);
    // A neutral first-line name label or whole contact metadata line adds no
    // subject qualifier. Its exact anchor remains, without identity authority.
    // Contact metadata never clears an earlier meaningful or unknown qualifier.
    const initialLabel =
      units.length === 0 &&
      /^(?:\p{Lu}\p{Ll}{2,39})(?:[ '-]\p{Lu}\p{Ll}{2,39}){1,3}$/u.test(
        anchored.text,
      ) &&
      !/\b(?:not|never|colleague|manager|team|other|their|example|hypothetical|fictional)\b/iu.test(
        anchored.text,
      ) &&
      !unsafeLayoutTokens(anchored.text) &&
      !neutralLayoutLabel(anchored.text, "project") &&
      !neutralLayoutLabel(anchored.text, "employer_role");
    const parsedContribution = clauses.every(
      (c) => c.action.concept !== "unknown",
    );
    units.push({
      start,
      end,
      anchored,
      clauses,
      role,
      heading,
      initialLabel,
      parsedContribution,
    });
  }

  const layoutMetadata = new Set<number>();
  const completeEntryBoundaries = new Set<number>();
  const layoutEntries = new Map<number, WritingLayoutEntry>();
  let sectionIndex = -1;
  let sectionKind: WritingLayoutEntry["kind"] | null = null;
  const singleLine = (from: number, to: number) =>
    /^\r?\n$/u.test(sourceText.slice(from, to));
  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    if (unit.heading) {
      sectionKind = /^Projects$/iu.test(unit.anchored.text)
        ? "project"
        : /^Experience$/iu.test(unit.anchored.text)
          ? "employer_role"
          : null;
      sectionIndex = index;
      continue;
    }
    if (!sectionKind || !neutralLayoutLabel(unit.anchored.text, sectionKind))
      continue;
    const previous = units[index - 1];
    const afterSection =
      index === sectionIndex + 1 &&
      singleLine(units[sectionIndex].end, unit.start);
    const afterContribution =
      previous?.parsedContribution &&
      /^\r?\n(?:[ \t]*\r?\n)+$/u.test(
        sourceText.slice(previous.end, unit.start),
      );
    if (!afterSection && !afterContribution) continue;
    const headerIndices = [index];
    let first = index + 1;
    if (sectionKind === "employer_role") {
      const title = units[first];
      if (
        !title ||
        !standaloneRolePattern.test(title.anchored.text) ||
        !singleLine(unit.end, title.start)
      )
        continue;
      headerIndices.push(first++);
    }
    const contribution = units[first];
    if (
      !contribution?.parsedContribution ||
      !singleLine(units[first - 1].end, contribution.start)
    )
      continue;
    let last = first;
    while (units[last + 1]?.parsedContribution) last++;
    const headerAnchorIds = [sectionIndex, ...headerIndices].map(
      (i) => units[i].anchored.id,
    );
    const exactEntry = span(source, unit.start, units[last].end);
    const entrySpan = {
      id: exactEntry.id,
      start: exactEntry.start,
      end: exactEntry.end,
    };
    const entry: WritingLayoutEntry = {
      id: hash(
        `${layoutPolicySha256}:${source.sha256}:${sectionKind}:${headerAnchorIds.join(":")}:${entrySpan.id}`,
      ),
      kind: sectionKind,
      headerAnchorIds,
      entrySpan,
      authority: "derived_layout_only",
      attribution: "not_inferred",
    };
    completeEntryBoundaries.add(index);
    if (afterSection) completeEntryBoundaries.add(sectionIndex);
    for (const i of headerIndices) layoutMetadata.add(i);
    for (let i = first; i <= last; i++) layoutEntries.set(i, entry);
    index = last;
  }

  // A finite reference can spare only its preceding project's right edge. It
  // remains an ordinary forward qualifier and never ends the continuation scan.
  const neutralReferences = new Set<number>();
  for (let index = 1; index < units.length; index++) {
    if (
      /^[ \t\r]*API reference[ \t\r]*$/u.test(units[index].anchored.text) &&
      units[index - 1].parsedContribution &&
      layoutEntries.get(index - 1)?.kind === "project" &&
      singleLine(units[index - 1].end, units[index].start)
    )
      neutralReferences.add(index);
  }
  const rightQualifiers = new Map<number, string[]>();
  for (let index = 0; index < units.length; index++) {
    if (!units[index].parsedContribution && !units[index].role) continue;
    const responsible: string[] = [];
    for (let next = index + 1; next < units.length; next++) {
      const unit = units[next];
      if (
        unit.parsedContribution ||
        unit.role ||
        completeEntryBoundaries.has(next)
      )
        break;
      // Cosmetic metadata does not prove a new subject or hide later scope.
      if (
        unit.heading ||
        unit.initialLabel ||
        inertContactMetadata(unit.anchored.text) ||
        neutralReferences.has(next)
      )
        continue;
      responsible.push(unit.anchored.id);
    }
    if (responsible.length) rightQualifiers.set(index, responsible);
  }

  const anchors: WritingSourceAnchor[] = [];
  const qualifiers: string[] = [];
  let previousEnd = 0;
  for (let index = 0; index < units.length; index++) {
    const {
      start,
      end,
      anchored,
      clauses,
      role,
      heading,
      initialLabel,
      parsedContribution,
    } = units[index];
    const actor = clauses[0]?.actor;
    if (
      !heading &&
      !role &&
      !parsedContribution &&
      !initialLabel &&
      !inertContactMetadata(anchored.text) &&
      !layoutMetadata.has(index)
    )
      qualifiers.push(anchored.id);
    const previous = anchors.at(-1);
    const rightQualifierIds = rightQualifiers.get(index) ?? [];
    const unqualified =
      qualifiers.length === 0 &&
      rightQualifierIds.length === 0 &&
      (parsedContribution || !!role);
    anchors.push({
      span: anchored,
      clauses,
      reorderable: clauses.every(
        (c) =>
          c.action.concept !== "unknown" &&
          !c.negated &&
          JSON.stringify(c.actor) === JSON.stringify(actor) &&
          !/\b(?:then|before|after|because|thereby|following|their|its|this|that|these|those|it|they|them|former|latter|respectively)\b/iu.test(
            c.span.text,
          ),
      ),
      role: role
        ? {
            title: role[1],
            employer: role[2],
            subject: "implicit_source_subject",
          }
        : null,
      context: {
        kind: heading
          ? "section_heading"
          : unqualified
            ? "unqualified_resume_clause"
            : "qualified_or_unknown",
        qualifierIds: [...qualifiers, ...rightQualifierIds],
        adjacentRoleId:
          unqualified &&
          previous?.role &&
          previous.context.kind === "unqualified_resume_clause" &&
          /^\r?\n$/u.test(sourceText.slice(previousEnd, start))
            ? previous.span.id
            : null,
        layoutEntry: layoutEntries.has(index)
          ? {
              ...layoutEntries.get(index)!,
              headerAnchorIds: [...layoutEntries.get(index)!.headerAnchorIds],
              entrySpan: { ...layoutEntries.get(index)!.entrySpan },
            }
          : null,
      },
    });
    previousEnd = end;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: WRITING_SUPPORT_POLICY_VERSION,
    sourceSha256: source.sha256,
    offsetUnit: "unicode_code_point",
    sourceText,
    anchors,
  };
}

function clauseVariants(
  c: WritingClause,
): Array<{ text: string; changedAction: boolean }> {
  const literal = comparable(c.span.text);
  const action = actionPattern.exec(literal);
  if (!action) return [{ text: literal, changedAction: false }];
  const surface = action[3];
  const prefix = literal.slice(0, action[0].length - surface.length);
  const body = literal.slice(action[0].length);
  const variants = [surface];
  if (!c.negated && c.action.concept === "create")
    variants.push("Built", "Created", "Developed");
  if (
    !c.negated &&
    c.action.concept === "improve" &&
    c.direction === "decrease"
  )
    variants.push("Reduced");
  return [
    ...new Set(
      variants.flatMap((v) => [
        v[0].toUpperCase() + v.slice(1),
        v.toLowerCase(),
      ]),
    ),
  ].map((v) => ({
    text: `${prefix}${v}${body}`,
    changedAction: v.toLowerCase() !== surface.toLowerCase(),
  }));
}
const supported = (
  binding: Binding,
  anchors: WritingSourceAnchor[],
  operations: WritingSupportOperation[],
): WritingSupportOutcome => ({
  state: "supported",
  authority: "source_transformation_only",
  binding,
  sourceAnchorIds: [
    ...new Set(
      anchors.flatMap((a) => [
        ...(a.context.layoutEntry?.headerAnchorIds ?? []),
        a.span.id,
      ]),
    ),
  ],
  operations,
});
const rejected = (binding: Binding, reason: string): WritingSupportOutcome => ({
  state: "rejected",
  binding,
  reason,
});
const clarification = (binding: Binding): WritingSupportOutcome => ({
  state: "clarification_required",
  binding,
  missingSupport:
    "A new claim or unreviewed transformation requires additional source evidence.",
});

function assessRewrite(
  anchor: WritingSourceAnchor,
  proposed: string,
  binding: Binding,
): WritingSupportOutcome {
  if (anchor.context.kind !== "unqualified_resume_clause")
    return clarification(binding);
  if (comparable(anchor.span.text) === comparable(proposed))
    return supported(
      binding,
      [anchor],
      [{ kind: "copy_source", anchorId: anchor.span.id }],
    );
  if (comparableProse(anchor.span.text) === comparableProse(proposed))
    return supported(
      binding,
      [anchor],
      [{ kind: "normalize_layout", anchorId: anchor.span.id }],
    );
  let candidates: WritingClause[];
  try {
    candidates = splitClauses(sourceContext(proposed), 0, proposed.length);
  } catch {
    return rejected(binding, "proposal_relationship_limit");
  }
  if (candidates.length !== anchor.clauses.length)
    return clarification(binding);
  const used = new Set<number>();
  const operations: WritingSupportOperation[] = [
    { kind: "normalize_layout", anchorId: anchor.span.id },
  ];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const matches = anchor.clauses.flatMap((original, originalIndex) =>
      clauseVariants(original)
        .filter(
          (variant) =>
            comparableProse(variant.text) ===
            comparableProse(candidate.span.text),
        )
        .map((variant) => ({ originalIndex, variant })),
    );
    const match = matches.find((m) => !used.has(m.originalIndex));
    if (!match) {
      const original = anchor.clauses[index];
      if (
        original &&
        original.action.concept !== "unknown" &&
        candidate.action.concept !== "unknown" &&
        (JSON.stringify(original.actor) !== JSON.stringify(candidate.actor) ||
          original.negated !== candidate.negated ||
          original.action.agency !== candidate.action.agency ||
          original.direction !== candidate.direction ||
          JSON.stringify(
            original.metrics.map((m) => [m.literal, m.governor?.text]),
          ) !==
            JSON.stringify(
              candidate.metrics.map((m) => [m.literal, m.governor?.text]),
            ))
      )
        return rejected(binding, "unsupported_relationship_change");
      return clarification(binding);
    }
    if (match.originalIndex !== index) {
      if (!anchor.reorderable)
        return rejected(binding, "unsupported_clause_order");
      operations.push({
        kind: "reorder_independent_clauses",
        anchorId: anchor.span.id,
      });
    }
    if (match.variant.changedAction)
      operations.push({
        kind: "replace_equivalent_action",
        anchorId: anchor.span.id,
      });
    used.add(match.originalIndex);
  }
  return supported(binding, [anchor], operations);
}

function editorialForms(anchor: WritingSourceAnchor): string[] {
  const forms = [
    "Clarifies wording.",
    "Clarifies the wording.",
    "Clarifies the contribution.",
    "Clarifies the existing contribution.",
    "Clarifies the technical contribution.",
    "Emphasizes the existing technical contribution without adding claims.",
    "Makes the source clearer.",
    "Reorders the existing facts.",
    "Preserves the source facts.",
  ];
  if (anchor.clauses.some((c) => c.metrics.length))
    forms.push(
      "Makes the measured outcome clearer.",
      "Clarifies the measured contribution.",
      "Clarifies the existing measured contribution.",
      "Clarifies the existing contribution and measured result.",
      "Clarifies the result.",
    );
  const object = anchor.clauses[0]?.object?.text
    .replace(/^(?:a|an|the)\s+/iu, "")
    .replace(/\.$/u, "");
  if (object) {
    const words = object.split(/\s+/u);
    for (let count = 1; count <= Math.min(4, words.length); count++) {
      if (
        /\b(?:at|for|with|during|within|in|by|and)\b|\d/iu.test(
          words[count - 1],
        )
      )
        break;
      forms.push(`Clarifies ${words.slice(0, count).join(" ")} wording.`);
    }
  }
  return forms;
}
function roleDisplay(title: string): string {
  return title.replace(
    /\b(?:Engineer|Developer|Analyst|Architect|Designer|Scientist)\b/gu,
    (word) => word.toLowerCase(),
  );
}
function assessSummary(
  document: WritingSupportDocument,
  proposed: string,
  binding: Binding,
): WritingSupportOutcome {
  for (const anchor of document.anchors) {
    if (anchor.context.kind !== "unqualified_resume_clause") continue;
    if (comparable(anchor.span.text) === comparable(proposed))
      return supported(
        binding,
        [anchor],
        [{ kind: "copy_source", anchorId: anchor.span.id }],
      );
    if (
      anchor.role &&
      comparable(
        `${roleDisplay(anchor.role.title)} at ${anchor.role.employer}`,
      ) === comparable(proposed)
    )
      return supported(
        binding,
        [anchor],
        [{ kind: "copy_source", anchorId: anchor.span.id }],
      );
    const contribution = assessRewrite(anchor, proposed, binding);
    if (contribution.state === "supported") return contribution;
  }
  for (const role of document.anchors.filter((a) => a.role)) {
    if (
      role.context.kind !== "unqualified_resume_clause" ||
      document.anchors.filter((a) => a.role?.employer === role.role!.employer)
        .length !== 1
    )
      continue;
    for (const contribution of document.anchors) {
      if (
        contribution.context.kind !== "unqualified_resume_clause" ||
        contribution.context.adjacentRoleId !== role.span.id
      )
        continue;
      if (contribution.clauses.length !== 1) continue;
      const c = contribution.clauses[0];
      if (
        c.actor.kind !== "implicit_source_subject" ||
        c.action.concept === "unknown" ||
        !c.object ||
        c.negated
      )
        continue;
      const employer = /\s+at\s+([^;]+?)\.?$/iu.exec(c.object.text)?.[1];
      if (employer !== role.role!.employer) continue;
      for (const variant of clauseVariants(c)) {
        if (!actionPattern.test(variant.text)) continue;
        const sentence = variant.text[0].toLowerCase() + variant.text.slice(1);
        const candidate = `${roleDisplay(role.role!.title)} who ${sentence}`;
        if (comparable(candidate) === comparable(proposed))
          return supported(
            binding,
            [role, contribution],
            [
              {
                kind: "compose_explicit_role_contribution",
                anchorId: role.span.id,
              },
              { kind: "copy_source", anchorId: contribution.span.id },
            ],
          );
      }
    }
  }
  return clarification(binding);
}

/** Proves a bounded transformation of raw source, never ownership or calibrated truth. */
export function assessWritingSupport(
  document: WritingSupportDocument,
  request: WritingSupportRequest,
): WritingSupportOutcome {
  const binding = {
    sourceSha256: document.sourceSha256,
    policyVersion: document.policyVersion,
  };
  let canonical: WritingSupportDocument;
  try {
    canonical = buildWritingSupportDocument(document.sourceText);
  } catch {
    return rejected(binding, "invalid_support_document");
  }
  if (
    document.schemaVersion !== SCHEMA_VERSION ||
    document.policyVersion !== WRITING_SUPPORT_POLICY_VERSION ||
    document.sourceSha256 !== canonical.sourceSha256 ||
    document.offsetUnit !== canonical.offsetUnit ||
    JSON.stringify(document.anchors) !== JSON.stringify(canonical.anchors) ||
    (request.expectedSourceSha256 !== undefined &&
      request.expectedSourceSha256 !== document.sourceSha256) ||
    (request.expectedPolicyVersion !== undefined &&
      request.expectedPolicyVersion !== document.policyVersion)
  )
    return rejected(binding, "source_or_policy_binding_mismatch");
  if (
    typeof request.proposed !== "string" ||
    !request.proposed.trim() ||
    request.proposed.length > LIMITS.proposal
  )
    return rejected(binding, "invalid_proposal");
  if (request.kind === "summary")
    return assessSummary(canonical, request.proposed, binding);
  const originals = canonical.anchors.filter(
    (anchor) => comparable(anchor.span.text) === comparable(request.original),
  );
  if (originals.length !== 1)
    return rejected(
      binding,
      originals.length ? "ambiguous_source_anchor" : "missing_source_anchor",
    );
  const anchor = originals[0];
  if (request.kind === "editorial")
    return editorialForms(anchor).some(
      (form) => comparable(form) === comparable(request.proposed),
    )
      ? supported(
          binding,
          [anchor],
          [{ kind: "editorial_explanation", anchorId: anchor.span.id }],
        )
      : clarification(binding);
  return assessRewrite(anchor, request.proposed, binding);
}
