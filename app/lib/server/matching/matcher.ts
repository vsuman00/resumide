import { SKILL_TAXONOMY, type SkillTaxonomyEntry } from "./taxonomy";
import { SOFTWARE_SKILLS } from "../job-requirements";

const MAX_TERMS = 20;
const MAX_STORED_SPANS = 3;
const PHRASE_SEPARATOR = String.raw`(?:[\s\u00a0\-_–—]+)`;

const GENERIC_STOPWORDS = new Set([
  "about",
  "ability",
  "able",
  "across",
  "advanced",
  "and",
  "application",
  "applications",
  "architect",
  "are",
  "background",
  "bonus",
  "build",
  "building",
  "candidate",
  "code",
  "company",
  "consumer",
  "developer",
  "developers",
  "design",
  "engineer",
  "engineers",
  "excellent",
  "experience",
  "experienced",
  "expert",
  "expertise",
  "familiarity",
  "for",
  "from",
  "good",
  "great",
  "has",
  "have",
  "help",
  "hire",
  "hiring",
  "including",
  "knowledge",
  "lead",
  "leading",
  "looking",
  "manager",
  "most",
  "must",
  "need",
  "our",
  "platform",
  "platforms",
  "plus",
  "preferred",
  "product",
  "products",
  "required",
  "requirements",
  "responsibilities",
  "responsibility",
  "role",
  "roles",
  "seeking",
  "senior",
  "service",
  "services",
  "should",
  "skill",
  "skills",
  "solutions",
  "strong",
  "such",
  "support",
  "system",
  "systems",
  "team",
  "teams",
  "technical",
  "understanding",
  "using",
  "want",
  "web",
  "will",
  "with",
  "within",
  "work",
  "working",
  "year",
  "years",
  "you",
  "your",
  "the",
  "this",
  "that",
  "job",
  "practical",
  "exposure",
  "focuses",
  "based",
]);

export interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
  alias: string;
}

export interface SourceEvidence {
  occurrenceCount: number;
  spans: EvidenceSpan[];
}

export interface MatchEvidence {
  term: string;
  taxonomyId: string | null;
  kind: "taxonomy" | "keyword";
  uncertain: boolean;
  job: SourceEvidence;
  resume: SourceEvidence;
}

export interface JobDescriptionMatchResult {
  taxonomyVersion: string;
  terms: string[];
  matched: string[];
  missing: string[];
  uncertain: string[];
  evidence: MatchEvidence[];
}

interface CandidateTerm {
  term: string;
  taxonomyId: string | null;
  kind: "taxonomy" | "keyword";
  aliases: readonly string[];
  jobSpans: EvidenceSpan[];
  firstIndex: number;
  recognized: boolean;
}

export function matchJobDescription(args: {
  jobDescription: string;
  resumeText: string;
  maxTerms?: number;
}): JobDescriptionMatchResult {
  const maxTerms = Math.max(0, Math.min(args.maxTerms ?? MAX_TERMS, MAX_TERMS));
  const scopedJob = requirementText(args.jobDescription);
  const taxonomyCandidates = extractTaxonomyCandidates(scopedJob);
  // Exact engineering vocabulary is discoverable without pretending that an
  // external taxonomy mapping or proficiency assessment has been approved.
  for (const skill of SOFTWARE_SKILLS) {
    if (
      taxonomyCandidates.some((candidate) =>
        candidate.aliases.some(
          (alias) => alias.toLowerCase() === skill.toLowerCase(),
        ),
      )
    )
      continue;
    const spans = collectAliasSpans(scopedJob, [skill]);
    if (spans.length)
      taxonomyCandidates.push({
        term: skill,
        taxonomyId: null,
        kind: "keyword",
        aliases: [skill],
        jobSpans: spans,
        firstIndex: spans[0].start,
        recognized: true,
      });
  }
  const occupied = taxonomyCandidates.flatMap(
    (candidate) => candidate.jobSpans,
  );
  const genericCandidates = extractGenericCandidates(scopedJob, occupied);
  const candidates = [...taxonomyCandidates, ...genericCandidates]
    .sort(compareCandidates)
    .slice(0, maxTerms)
    .sort(
      (left, right) =>
        left.firstIndex - right.firstIndex ||
        lexicalCompare(left.term, right.term),
    );

  const evidence = candidates.map((candidate): MatchEvidence => {
    const resumeSpans = collectAliasSpans(args.resumeText, candidate.aliases);
    return {
      term: candidate.term,
      taxonomyId: candidate.taxonomyId,
      kind: candidate.kind,
      uncertain: !candidate.recognized,
      job: sourceEvidence(candidate.jobSpans),
      resume: sourceEvidence(resumeSpans),
    };
  });

  return {
    taxonomyVersion: SKILL_TAXONOMY.version,
    terms: evidence.map((item) => item.term),
    matched: evidence
      .filter((item) => item.resume.occurrenceCount > 0)
      .map((item) => item.term),
    missing: evidence
      .filter((item) => item.resume.occurrenceCount === 0)
      .map((item) => item.term),
    uncertain: evidence
      .filter((item) => item.uncertain && item.resume.occurrenceCount > 0)
      .map((item) => item.term),
    evidence,
  };
}

function extractTaxonomyCandidates(text: string): CandidateTerm[] {
  const candidates: CandidateTerm[] = [];
  for (const entry of SKILL_TAXONOMY.entries) {
    const aliases = aliasesFor(entry);
    const jobSpans = collectAliasSpans(text, aliases);
    if (jobSpans.length === 0) continue;
    candidates.push({
      term: entry.canonical,
      taxonomyId: entry.id,
      kind: "taxonomy",
      aliases,
      jobSpans,
      firstIndex: jobSpans[0].start,
      recognized: true,
    });
  }
  return candidates;
}

function extractGenericCandidates(
  text: string,
  occupied: readonly EvidenceSpan[],
): CandidateTerm[] {
  const byTerm = new Map<string, EvidenceSpan[]>();
  for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}+#]*/gu)) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    if (
      occupied.some((span) => rangesOverlap(start, end, span.start, span.end))
    ) {
      continue;
    }
    const term = raw.normalize("NFKC").toLocaleLowerCase("en-US");
    if (term.length < 3 || /^\d+$/.test(term) || GENERIC_STOPWORDS.has(term)) {
      continue;
    }
    if (negatedAt(text, start, end)) continue;
    const spans = byTerm.get(term) ?? [];
    spans.push({ start, end, text: raw, alias: term });
    byTerm.set(term, spans);
  }

  return [...byTerm.entries()].map(([term, jobSpans]) => ({
    term,
    taxonomyId: null,
    kind: "keyword" as const,
    aliases: [term],
    jobSpans,
    firstIndex: jobSpans[0].start,
    recognized: false,
  }));
}

function aliasesFor(entry: SkillTaxonomyEntry): string[] {
  return [...new Set([entry.canonical, ...entry.aliases])].sort(
    (left, right) => {
      if (left.length !== right.length) return right.length - left.length;
      return lexicalCompare(left, right);
    },
  );
}

function collectAliasSpans(
  text: string,
  aliases: readonly string[],
): EvidenceSpan[] {
  const ignored = collectIgnoredRanges(text);
  const byRange = new Map<string, EvidenceSpan>();
  for (const alias of aliases) {
    const expression = compileAlias(alias);
    for (const match of text.matchAll(expression)) {
      const matchedText = match[0];
      const start = match.index;
      const end = start + matchedText.length;
      if (negatedAt(text, start, end)) continue;
      if (
        ignored.some((range) =>
          rangesOverlap(start, end, range.start, range.end),
        )
      ) {
        continue;
      }
      const key = `${start}:${end}`;
      if (!byRange.has(key)) {
        byRange.set(key, { start, end, text: matchedText, alias });
      }
    }
  }

  const sorted = [...byRange.values()].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    if (left.end !== right.end) return right.end - left.end;
    return lexicalCompare(left.alias, right.alias);
  });
  const nonOverlapping: EvidenceSpan[] = [];
  for (const span of sorted) {
    if (
      nonOverlapping.some((existing) =>
        rangesOverlap(span.start, span.end, existing.start, existing.end),
      )
    ) {
      continue;
    }
    nonOverlapping.push(span);
  }
  return nonOverlapping;
}

function compileAlias(alias: string): RegExp {
  const body = alias
    .trim()
    .split(/\s+/u)
    .map(escapeRegExp)
    .join(PHRASE_SEPARATOR);
  // A two-character word alias such as "JS" must not match the suffix of
  // "Node.js". Longer aliases already have enough lexical context, while a
  // stricter boundary there would reject valid punctuation-bearing skills.
  const boundary = /^[\p{L}\p{N}]{1,2}$/u.test(alias)
    ? String.raw`\p{L}\p{N}.+#`
    : String.raw`\p{L}\p{N}`;
  return new RegExp(
    String.raw`(?<![${boundary}])${body}(?![${boundary}])`,
    "giu",
  );
}

function collectIgnoredRanges(
  text: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const expression =
    /(?:https?:\/\/|www\.)[^\s]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
  for (const match of text.matchAll(expression)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function sourceEvidence(spans: readonly EvidenceSpan[]): SourceEvidence {
  return {
    occurrenceCount: spans.length,
    spans: spans.slice(0, MAX_STORED_SPANS),
  };
}

function compareCandidates(left: CandidateTerm, right: CandidateTerm): number {
  if (left.recognized !== right.recognized) return left.recognized ? -1 : 1;
  if (left.firstIndex !== right.firstIndex)
    return left.firstIndex - right.firstIndex;
  if (left.kind !== right.kind) return left.kind === "taxonomy" ? -1 : 1;
  return lexicalCompare(left.term, right.term);
}

function negatedAt(text: string, start: number, end: number): boolean {
  const boundaries = [
    ...text.matchAll(
      /[;\n]|\.(?=\s|$)|\bbut\b|(?:,\s*|\band\s+)(?=(?:no|not)\b)/giu,
    ),
  ];
  const left = boundaries.filter((match) => match.index! < start).at(-1);
  const right = boundaries.find((match) => match.index! >= end);
  const clause = text.slice(
    left ? left.index! + left[0].length : 0,
    right?.index ?? text.length,
  );
  return /\b(?:no|without|never|not(?!\s+only\b))\b/iu.test(clause);
}

// Mask irrelevant sections rather than rebuilding text, preserving UTF-16
// offsets used by the existing lexical-evidence contract.
function requirementText(text: string): string {
  const heading =
    /^(?:(?:key |job )?responsibilities|duties|(?:job )?requirements|(?:required |basic |minimum |preferred )?qualifications|(?:required |essential )?skills(?: and experience)?|must have|preferred|nice to have):?$/iu;
  const lines = text.split("\n");
  const hasHeading = lines.some((line) => heading.test(line.trim()));
  let active = !hasHeading;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (heading.test(trimmed)) {
        active = true;
        return " ".repeat(line.length);
      }
      if (
        /^(?:benefits|about (?!the job\b|this role\b).+|company overview|equal opportunity):?$/iu.test(
          trimmed,
        )
      )
        active = false;
      return active ? line : " ".repeat(line.length);
    })
    .join("\n");
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
