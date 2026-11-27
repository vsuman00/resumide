// Section-aware requirement extraction and matching (ATS-04, ATS-05).
// Deterministic: the JD and the resume share one normalizer and one versioned vocabulary.
import { NORMALIZER_VERSION, stem, tokenize, type Token } from "./normalize";
import {
  mergeMonths,
  parseResumeStructure,
  roleAtLine,
  type ResumeStructure,
} from "./roles";
import { alignTitle, type TitleAlignmentResult } from "./titles";
import {
  DEGREE_LEVELS,
  SKILLS,
  SKILL_CLASSES,
  STOPWORDS,
  VOCABULARY_VERSION,
  type VocabularySkill,
} from "./vocabulary";
import type { EvidenceSpan, MatchEvidence } from "./matcher";

export const MATCHER_VERSION = "requirement-matcher/1.0.0";
export const MAX_REQUIREMENTS = 80;

export type Section = "required" | "preferred" | "responsibilities";
export type Importance = "required" | "preferred" | "contextual";
export type RequirementKind = "skill" | "degree" | "years" | "phrase" | "soft";
export type MatchState = "met" | "partial" | "missing" | "not_evaluated";

export interface LineEvidence {
  line: number;
  start: number;
  end: number;
  text: string;
}
export interface RequirementMatch {
  phrase: string;
  kind: RequirementKind;
  section: Section;
  importance: Importance;
  state: MatchState;
  /** Skill id when the phrase came from the vocabulary. */
  skillId: string | null;
  /** Set when this item is one of several alternatives ("Java, C++, or C#"). */
  altGroup: string | null;
  /** The alternative that satisfied this item, when it was not met directly. */
  satisfiedBy: string | null;
  /** Human-readable explanation of the state, for example years found. */
  detail: string | null;
  /** Where the strongest evidence sits: a dated role, a skills list, or elsewhere. */
  context: "role" | "skills_list" | "elsewhere" | null;
  /** Last calendar year of the role that evidences this item. */
  lastYear: number | null;
  jobEvidence: LineEvidence[];
  resumeEvidence: LineEvidence[];
}
export type ApplicationCheckKind =
  "authorization" | "location" | "relocation" | "travel";
export interface ApplicationCheck {
  kind: ApplicationCheckKind;
  text: string;
  line: number;
}
export interface RequirementMatchResult {
  matcherVersion: string;
  /** Date used for "Present" in role ranges (ISO), so results are reproducible. */
  asOf: string;
  applicationChecks: ApplicationCheck[];
  titleAlignment: TitleAlignmentResult;
  structure: ResumeStructure;
  vocabularyVersion: string;
  normalizerVersion: string;
  requirements: RequirementMatch[];
  truncated: boolean;
  /** Items whose evidence did not match the resume text and were not reported as found. */
  integrity: { downgraded: number };
}

const ACTION_VERBS = new Set([
  "write",
  "build",
  "design",
  "develop",
  "create",
  "manage",
  "lead",
  "maintain",
  "implement",
  "participate",
  "collaborate",
  "ensure",
  "work",
  "deliver",
  "support",
  "drive",
  "own",
]);
// Compared on the raw word: stems merge "write" with "written".
const isActionVerb = (t: { raw: string }) =>
  ACTION_VERBS.has(t.raw.toLowerCase());
const STOP_STEMS = new Set([...STOPWORDS].map((word) => stem(word)));
const IMPORTANCE_RANK: Record<Importance, number> = {
  required: 3,
  preferred: 2,
  contextual: 1,
};
const SECTION_IMPORTANCE: Record<Section, Importance> = {
  required: "required",
  preferred: "preferred",
  responsibilities: "contextual",
};

// ---- vocabulary index ------------------------------------------------------
interface SkillIndexEntry {
  skill: VocabularySkill;
  tokens: string[];
}
const skillIndex = (() => {
  const byFirst = new Map<string, SkillIndexEntry[]>();
  for (const skill of SKILLS) {
    for (const alias of new Set([skill.canonical, ...skill.aliases])) {
      const tokens = tokenize(alias).map((t) => t.token);
      if (!tokens.length) continue;
      const list = byFirst.get(tokens[0]) ?? [];
      list.push({ skill, tokens });
      byFirst.set(tokens[0], list);
    }
  }
  for (const list of byFirst.values())
    list.sort((a, b) => b.tokens.length - a.tokens.length);
  return byFirst;
})();

interface SkillHit {
  skill: VocabularySkill;
  from: number;
  to: number; // token index, exclusive
}
function findSkills(tokens: Token[], rawCase = false): SkillHit[] {
  const hits: SkillHit[] = [];
  for (let i = 0; i < tokens.length;) {
    const candidates = skillIndex.get(tokens[i].token) ?? [];
    const hit = candidates.find(
      (c) =>
        c.tokens.every((t, k) => tokens[i + k]?.token === t) &&
        // "Go" is a skill only when written capitalized, never the verb "go".
        (!rawCase ||
          c.skill.canonical !== "Go" ||
          tokens[i].raw === "Go" ||
          tokens[i].raw === "Golang"),
    );
    if (hit) {
      hits.push({ skill: hit.skill, from: i, to: i + hit.tokens.length });
      i += hit.tokens.length;
    } else i++;
  }
  return hits;
}

// Soft skills cannot be evidenced by keywords, so they are listed but never scored.
const SOFT = new Set(
  [
    "communication",
    "written communication",
    "verbal communication",
    "communication skill",
    "interpersonal skill",
    "problem solving",
    "team player",
    "attention to detail",
    "time management",
    "collaboration",
    "teamwork",
    "leadership",
    "work ethic",
    "self motivated",
  ].map((phrase) =>
    tokenize(phrase)
      .map((t) => t.token)
      .join(" "),
  ),
);

// ---- JD parsing -------------------------------------------------------------
type Heading = Section | "other";
function classifyHeading(text: string): Heading | null {
  const t = text
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 8) return null;
  if (
    /\b(preferred|nice to have|bonus|good to have|desirable|a plus|extra credit)\b/.test(
      t,
    )
  )
    return "preferred";
  if (
    /^(about|benefits|perks|compensation|salary|equal opportunity|our (mission|values|culture)|why (join|us)|company|who we are|what we offer)\b/.test(
      t,
    )
  )
    return "other";
  if (
    /\b(responsibilit|what you.?ll do|duties|day to day|the role|your role|what the role)/.test(
      t,
    )
  )
    return "responsibilities";
  if (
    /\b(qualifications?|requirements?|must have|what you.?ll bring|what we.?re looking for|you have|who you are|about you|skills|basic|minimum|essential|required)\b/.test(
      t,
    )
  )
    return "required";
  return null;
}
// Digits only count as a bullet when numbered ("1." or "2)"), so "5 years" keeps its number.
const APPLICATION: [ApplicationCheckKind, RegExp][] = [
  [
    "authorization",
    /(?:authori[sz]ed|eligible|legally|right) to work|work authori[sz]ation|visa|sponsorship|citizen|security clearance|\bclearance\b/i,
  ],
  ["relocation", /relocat/i],
  [
    "travel",
    /\btravel(?:l?ing)?\b.{0,40}(?:%|percent|up to|required|willing|ability)|willing(?:ness)? to travel|ability to travel/i,
  ],
  [
    "location",
    /\b(?:based in|located in|in[- ]office|on-?site|hybrid|remote[- ]first|fully remote|remote (?:position|role|work from)|office[- ]based|location\s*:)/i,
  ],
];
const BULLET = /^(?:[\s\-*•·●▪‣–—]|\d+[.)](?=\s))+/;
const OPTIONAL_CUE =
  /\b(nice to have|a plus|is a plus|bonus|preferred|desirable|good to have|extra credit)\b/i;
const NOT_REQUIRED =
  /\b(not required|not necessary|isn'?t required|no .{0,30} required|not needed)\b/i;
const YEARS = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/i;
const EQUIVALENT =
  /\bor (?:equivalent|comparable)\b|\bequivalent (?:practical |work |industry )?experience\b/i;
const SHORT_DEGREE = /\b(BS|MS|BA)\s+(?:in|of)\b/;

function degreeLevelsIn(text: string): { levels: number[]; generic: boolean } {
  const lower = text.toLowerCase();
  const levels: number[] = [];
  let generic = false;
  for (const level of DEGREE_LEVELS) {
    for (const alias of level.aliases) {
      const escaped = alias.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
      if (
        !new RegExp(
          `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
          "iu",
        ).test(lower)
      )
        continue;
      if (alias === "degree") generic = true;
      else if (!levels.includes(level.level)) levels.push(level.level);
    }
  }
  const short = SHORT_DEGREE.exec(text)?.[1];
  if (short) levels.push(short === "BS" || short === "BA" ? 3 : 4);
  return { levels, generic };
}
// "degree in Computer Science, Statistics or a related field" -> field names and flexibility.
function degreeField(
  text: string,
): { parts: string[][]; flexible: boolean } | undefined {
  const match =
    /\b(?:degree|bachelor'?s?|master'?s?|b\.?\s?s\.?|m\.?\s?s\.?|ph\.?d\.?|doctorate)\b[^.;]*?\b(?:in|of)\s+([^.;]+)/i.exec(
      text,
    );
  if (!match) return undefined;
  const flexible =
    /\b(?:related|similar|relevant|quantitative|technical|equivalent|comparable)\b/i.test(
      match[1],
    );
  const parts = match[1]
    .split(/,|\bor\b|\band\b|\//i)
    .map((part) =>
      tokenize(part)
        .map((t) => t.token)
        .filter((t) => !STOP_STEMS.has(t) && t.length > 2),
    )
    .filter((tokens) => tokens.length);
  return parts.length ? { parts, flexible } : undefined;
}
const LEVEL_NAME: Record<number, string> = {
  2: "Associate's",
  3: "Bachelor's",
  4: "Master's",
  5: "Doctorate",
};

interface Draft {
  phrase: string;
  kind: RequirementKind;
  section: Section;
  importance: Importance;
  skillId: string | null;
  tokens: string[];
  level?: number;
  alternative?: boolean;
  years?: number;
  altGroup?: string;
  /** Words that name what the years are of, when it is not a vocabulary skill. */
  yearsSubject?: { tokens: string[]; raw: string };
  /** Skill ids named in the same line as a years requirement. */
  yearsSkills?: string[];
  /** Field of study named by a degree requirement. */
  field?: { parts: string[][]; flexible: boolean };
  jobEvidence: LineEvidence[];
}

function extractRequirements(jd: string): {
  drafts: Draft[];
  truncated: boolean;
  applicationChecks: ApplicationCheck[];
} {
  const applicationChecks: ApplicationCheck[] = [];
  const lines = jd.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const hasHeading = lines.some((l) => {
    const t = l.replace(BULLET, "").replace(/:$/, "");
    return classifyHeading(t) !== null && !/[.;]$/.test(t);
  });
  let section: Heading = hasHeading ? "other" : "required";
  const byKey = new Map<string, Draft>();
  const add = (draft: Draft, key: string) => {
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, draft);
      return;
    }
    existing.jobEvidence.push(...draft.jobEvidence);
    if (
      IMPORTANCE_RANK[draft.importance] > IMPORTANCE_RANK[existing.importance]
    ) {
      existing.importance = draft.importance;
      existing.section = draft.section;
    }
  };

  lines.forEach((rawLine, index) => {
    let text = rawLine.replace(BULLET, "");
    const colon = text.indexOf(":");
    const head =
      colon > 0
        ? classifyHeading(text.slice(0, colon))
        : classifyHeading(text.replace(/:$/, ""));
    if (head && (colon < 0 || colon < 60) && !/[.;]$/.test(text)) {
      section = head;
      if (colon < 0 || !text.slice(colon + 1).trim()) return;
      text = text.slice(colon + 1);
    }
    // Application questions are answered in the employer's form, never scored. Scan every
    // section so a location line in the header or benefits is still listed.
    const asked = APPLICATION.filter(([, pattern]) => pattern.test(text));
    for (const [kind] of asked)
      applicationChecks.push({
        kind,
        text: text.trim().slice(0, 240),
        line: index + 1,
      });
    if (asked.length) return;
    if (section === "other" || !text.trim() || NOT_REQUIRED.test(text)) return;
    const lineSection: Section =
      OPTIONAL_CUE.test(text) && section === "required" ? "preferred" : section;
    const importance = SECTION_IMPORTANCE[lineSection];
    const base =
      offsets[index] + (rawLine.length - rawLine.replace(BULLET, "").length);
    const evidence = (start: number, end: number): LineEvidence => ({
      line: index + 1,
      start: base + start,
      end: base + end,
      text: text.slice(start, end),
    });

    const years = YEARS.exec(text);
    if (years)
      add(
        {
          phrase: `${years[1]}+ years`,
          kind: "years",
          section: lineSection,
          importance,
          skillId: null,
          tokens: [],
          years: Number(years[1]),
          jobEvidence: [evidence(years.index, years.index + years[0].length)],
        },
        `years:${years[1]}`,
      );
    const { levels, generic } = degreeLevelsIn(text);
    if (levels.length || generic) {
      const level = levels.length ? Math.min(...levels) : 3;
      add(
        {
          phrase: `${LEVEL_NAME[level]} degree`,
          kind: "degree",
          section: lineSection,
          importance,
          skillId: null,
          tokens: [],
          level,
          alternative: EQUIVALENT.test(text),
          field: degreeField(text),
          jobEvidence: [evidence(0, text.length)],
        },
        `degree:${level}`,
      );
    }

    const tokens = tokenize(text);
    const consumed = new Set<number>();
    const items: { key: string; start: number; end: number }[] = [];
    for (const hit of findSkills(tokens, true)) {
      for (let k = hit.from; k < hit.to; k++) consumed.add(k);
      items.push({
        key: `skill:${hit.skill.id}`,
        start: tokens[hit.from].start,
        end: tokens[hit.to - 1].end,
      });
      add(
        {
          phrase: hit.skill.canonical,
          kind: "skill",
          section: lineSection,
          importance,
          skillId: hit.skill.id,
          tokens: [],
          jobEvidence: [
            evidence(tokens[hit.from].start, tokens[hit.to - 1].end),
          ],
        },
        `skill:${hit.skill.id}`,
      );
    }
    if (years) {
      const draft = byKey.get(`years:${years[1]}`);
      if (draft && !draft.yearsSkills)
        draft.yearsSkills = findSkills(tokens, true).map((h) => h.skill.id);
    }
    // Remaining content words: only adjacent runs of 2-3 words are requirement phrases.
    let run: Token[] = [];
    const yearsEnd = years ? years.index + years[0].length : -1;
    const fieldTokens = new Set(degreeField(text)?.parts.flat() ?? []);
    const yearsDraft = years ? byKey.get(`years:${years[1]}`) : undefined;
    // The words after "N years of" name what the years are of. Only a plain subject is folded
    // in: a list, an exclusion ("non-internship") or a named skill keeps the old reading.
    const subjectMode =
      yearsDraft !== undefined &&
      !yearsDraft.yearsSkills?.length &&
      !/\b(?:or|and|non|not|without|except)\b|[,;/]/i.test(
        text.slice(yearsEnd),
      );
    if (subjectMode && yearsDraft) {
      const words = tokens.filter(
        (t) =>
          t.start >= yearsEnd &&
          !STOP_STEMS.has(t.token) &&
          !isActionVerb(t) &&
          !/^\d+$/.test(t.token) &&
          t.token.length > 2,
      );
      if (words.length)
        yearsDraft.yearsSubject = {
          tokens: words.map((t) => t.token),
          raw: words.map((t) => t.raw).join(" "),
        };
    }
    const flush = () => {
      const isSubject =
        subjectMode && run.length > 0 && run[0].start >= yearsEnd;
      // "Write unit and integration tests": a leading action verb is not part of the phrase.
      while (run.length && isActionVerb(run[0])) run.shift();
      if (isSubject || lineSection === "responsibilities") {
        run = [];
        return;
      }
      for (let i = 0; i < run.length; i += 3) {
        const chunk = run.slice(i, i + 3);
        if (chunk.length < 2) continue;
        // The field named by a degree line ("in Computer Science") is part of the degree.
        if (fieldTokens.size && chunk.every((t) => fieldTokens.has(t.token)))
          continue;
        items.push({
          key: `phrase:${chunk.map((t) => t.token).join(" ")}`,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
        });
        const soft = SOFT.has(chunk.map((t) => t.token).join(" "));
        add(
          {
            phrase: chunk.map((t) => t.raw).join(" "),
            kind: soft ? "soft" : "phrase",
            section: lineSection,
            importance,
            skillId: null,
            tokens: chunk.map((t) => t.token),
            jobEvidence: [
              evidence(chunk[0].start, chunk[chunk.length - 1].end),
            ],
          },
          `phrase:${chunk.map((t) => t.token).join(" ")}`,
        );
      }
      run = [];
    };
    tokens.forEach((token, i) => {
      const gap = i > 0 ? text.slice(tokens[i - 1].end, token.start) : "";
      const content =
        !consumed.has(i) &&
        !STOP_STEMS.has(token.token) &&
        !/^\d+$/.test(token.token) &&
        token.token.length > 2;
      if (!content || (run.length && !/^[\s-]+$/.test(gap))) flush();
      if (content) run.push(token);
    });
    flush();
    // "A, B or C": adjacent items joined by "or" or "/" are alternatives, not all required.
    items.sort((a, b) => a.start - b.start);
    let chain: typeof items = [];
    let hasOr = false;
    const close = () => {
      // "A, B or a related field": the "or" may follow the last item.
      if (
        chain.length > 1 &&
        /^\s*,?\s*or\b/i.test(text.slice(chain[chain.length - 1].end))
      )
        hasOr = true;
      if (hasOr && chain.length > 1)
        for (const item of chain) {
          const draft = byKey.get(item.key);
          if (draft && !draft.altGroup)
            draft.altGroup = `${index + 1}:${chain[0].start}`;
        }
      chain = [];
      hasOr = false;
    };
    for (const item of items) {
      const gap = chain.length
        ? text.slice(chain[chain.length - 1].end, item.start)
        : "";
      if (
        chain.length &&
        /^\s*(?:,|\/|,?\s*or|and\/or|,\s*or)\s*$/i.test(gap)
      ) {
        hasOr ||= /or|\//i.test(gap);
        chain.push(item);
      } else {
        close();
        chain = [item];
      }
    }
    close();
  });

  const all = [...byKey.values()];
  return {
    drafts: all.slice(0, MAX_REQUIREMENTS),
    truncated: all.length > MAX_REQUIREMENTS,
    applicationChecks,
  };
}

// ---- resume matching --------------------------------------------------------
interface ResumeLine {
  text: string;
  start: number;
  tokens: Token[];
}
function resumeLines(resume: string): ResumeLine[] {
  const out: ResumeLine[] = [];
  let at = 0;
  for (const text of resume.split("\n")) {
    out.push({ text, start: at, tokens: tokenize(text) });
    at += text.length + 1;
  }
  return out;
}
const lineEvidence = (
  line: ResumeLine,
  index: number,
  from: number,
  to: number,
): LineEvidence => ({
  line: index + 1,
  start: line.start + line.tokens[from].start,
  end: line.start + line.tokens[to - 1].end,
  text: line.text.slice(line.tokens[from].start, line.tokens[to - 1].end),
});
function findSequence(lines: ResumeLine[], seq: string[]): LineEvidence[] {
  const found: LineEvidence[] = [];
  lines.forEach((line, index) => {
    for (let i = 0; i + seq.length <= line.tokens.length; i++)
      if (seq.every((t, k) => line.tokens[i + k].token === t)) {
        found.push(lineEvidence(line, index, i, i + seq.length));
        break;
      }
  });
  return found;
}
// A phrase that names a class of skills is met by any member of the class.
const CONCEPTS: Record<string, readonly string[]> = Object.fromEntries(
  (
    [
      [
        "programming language",
        [
          "Python",
          "Java",
          "JavaScript",
          "TypeScript",
          "C++",
          "C#",
          "Go",
          "Rust",
          "Scala",
          "Kotlin",
          "Swift",
          "Ruby",
          "PHP",
        ],
      ],
      ["cloud platform", ["AWS", "Azure", "Google Cloud Platform"]],
      ["database", ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQL", "NoSQL"]],
    ] as const
  ).map(([phrase, members]) => [
    tokenize(phrase)
      .map((t) => t.token)
      .join(" "),
    members,
  ]),
);
/** A skill id plus the members of its class (digital marketing includes SEO). */
const expandSkill = (id: string): string[] => [
  id,
  ...(SKILL_CLASSES[id] ?? []),
];

interface MatchContext {
  structure: ResumeStructure;
  /** Month intervals per skill id, from dated roles only. */
  skillIntervals: Map<string, [number, number][]>;
  skillAnywhere: Set<string>;
}
type Outcome = Pick<RequirementMatch, "state" | "resumeEvidence"> & {
  detail?: string;
};

function matchYears(
  draft: Draft,
  lines: ResumeLine[],
  ctx: MatchContext,
): Outcome {
  const { structure } = ctx;
  if (!structure.roles.length || structure.totalMonths === null)
    return {
      state: "not_evaluated",
      resumeEvidence: [],
      detail:
        "No dated roles were found, so years of experience cannot be checked.",
    };
  const needed = draft.years! * 12;
  const skills = draft.yearsSkills ?? [];
  // "5+ years of enterprise SaaS sales": the subject must itself appear on the resume.
  if (!skills.length && draft.yearsSubject) {
    const subject = matchDraft(
      { ...draft, kind: "phrase", tokens: draft.yearsSubject.tokens },
      lines,
      ctx,
    );
    if (subject.state === "missing")
      return {
        state: "missing",
        resumeEvidence: [],
        detail: `${draft.years}+ years of ${draft.yearsSubject.raw} asked for; ${draft.yearsSubject.raw} was not found on the resume.`,
      };
  }
  const months = skills.length
    ? Math.max(
        0,
        ...skills.map((id) =>
          mergeMonths(
            expandSkill(id).flatMap((m) => ctx.skillIntervals.get(m) ?? []),
          ),
        ),
      )
    : structure.totalMonths;
  const evidence = structure.roles
    .filter((r) => lines[r.lineStart - 1]?.tokens.length)
    .slice(0, 3)
    .map((r) =>
      lineEvidence(
        lines[r.lineStart - 1],
        r.lineStart - 1,
        0,
        lines[r.lineStart - 1].tokens.length,
      ),
    );
  const interns =
    !skills.length && structure.internMonths > 0
      ? `, including ${(structure.internMonths / 12).toFixed(1)} years of internships`
      : "";
  const found = `${(months / 12).toFixed(1)} years found${skills.length ? " for the named skill" : ` across dated roles${interns}`}`;
  if (months >= needed)
    return { state: "met", resumeEvidence: evidence, detail: found };
  if (months > 0)
    return {
      state: "partial",
      resumeEvidence: evidence,
      detail: `${found}; ${draft.years}+ asked for.`,
    };
  if (
    skills.some((id) => expandSkill(id).some((m) => ctx.skillAnywhere.has(m)))
  )
    return {
      state: "partial",
      resumeEvidence: [],
      detail:
        "The skill appears, but not inside a dated role, so its years cannot be counted.",
    };
  return {
    state: "missing",
    resumeEvidence: [],
    detail: skills.length
      ? "The named skill does not appear in any dated role."
      : `${(structure.totalMonths / 12).toFixed(1)} years of dated roles found; ${draft.years}+ asked for.`,
  };
}

function matchDegree(draft: Draft, lines: ResumeLine[]): Outcome {
  const evidence: LineEvidence[] = [];
  let best = 0;
  const qualifying: number[] = [];
  lines.forEach((line, index) => {
    const { levels } = degreeLevelsIn(line.text);
    if (levels.length && line.tokens.length) {
      best = Math.max(best, ...levels);
      evidence.push(lineEvidence(line, index, 0, line.tokens.length));
      if (Math.max(...levels) >= draft.level!) qualifying.push(index);
    }
  });
  if (best < draft.level!)
    return {
      state: draft.alternative ? "partial" : "missing",
      resumeEvidence: evidence.slice(0, 3),
    };
  // The named field must appear on, or next to, a qualifying degree line unless the
  // posting accepts a related field.
  const field = draft.field;
  if (field && !field.flexible) {
    const near = (index: number) =>
      new Set(
        [lines[index - 1], lines[index], lines[index + 1]]
          .filter(Boolean)
          .flatMap((l) => l.tokens.map((t) => t.token)),
      );
    const fieldMet = qualifying.some((index) =>
      field.parts.some((part) => part.every((t) => near(index).has(t))),
    );
    if (!fieldMet)
      return {
        state: "partial",
        resumeEvidence: evidence.slice(0, 3),
        detail: "A qualifying degree was found, but not in the named field.",
      };
  }
  return { state: "met", resumeEvidence: evidence.slice(0, 3) };
}

function matchDraft(
  draft: Draft,
  lines: ResumeLine[],
  ctx: MatchContext,
): Outcome {
  if (draft.kind === "soft")
    return { state: "not_evaluated", resumeEvidence: [] };
  if (draft.kind === "years") return matchYears(draft, lines, ctx);
  if (draft.kind === "degree") return matchDegree(draft, lines);
  const aliases: string[][] =
    draft.kind === "skill"
      ? [
          ...new Set(
            expandSkill(draft.skillId!).flatMap((id) => {
              const skill = SKILLS.find((s) => s.id === id);
              return skill ? [skill.canonical, ...skill.aliases] : [];
            }),
          ),
        ].map((a) => tokenize(a).map((t) => t.token))
      : [draft.tokens];
  // shortcut: "Go" matches only when capitalized, so a sentence-initial "Go" still false-matches.
  if (draft.skillId === "go") {
    for (const [index, line] of lines.entries()) {
      const hit = findSkills(line.tokens, true).find(
        (h) => h.skill.id === "go",
      );
      if (hit)
        return {
          state: "met",
          resumeEvidence: [lineEvidence(line, index, hit.from, hit.to)],
        };
    }
    return { state: "missing", resumeEvidence: [] };
  }
  for (const seq of aliases) {
    const found = findSequence(lines, seq);
    if (found.length)
      return { state: "met", resumeEvidence: found.slice(0, 3) };
  }
  if (draft.kind === "phrase" && CONCEPTS[draft.tokens.join(" ")]) {
    const members = CONCEPTS[draft.tokens.join(" ")];
    for (const [index, line] of lines.entries()) {
      const hit = findSkills(line.tokens, true).find((h) =>
        members.includes(h.skill.canonical),
      );
      if (hit)
        return {
          state: "met",
          resumeEvidence: [lineEvidence(line, index, hit.from, hit.to)],
        };
    }
  }
  if (draft.kind === "phrase") {
    // Met: the words in order, at most two other words between each. Same line in any
    // order, or spread across the resume, is only partial.
    const wanted = new Set(draft.tokens);
    let sameLine = false;
    for (const [index, line] of lines.entries()) {
      const toks = line.tokens.map((t) => t.token);
      for (let start = 0; start < toks.length; start++) {
        if (toks[start] !== draft.tokens[0]) continue;
        let at = start;
        let ok = true;
        for (const want of draft.tokens.slice(1)) {
          const next = toks.indexOf(want, at + 1);
          if (next < 0 || next - at > 3) {
            ok = false;
            break;
          }
          at = next;
        }
        if (ok)
          return {
            state: "met",
            resumeEvidence: [lineEvidence(line, index, start, at + 1)],
          };
      }
      if ([...wanted].every((w) => toks.includes(w))) sameLine = true;
    }
    if (sameLine) return { state: "partial", resumeEvidence: [] };
    const everywhere = new Set(
      lines.flatMap((l) => l.tokens.map((t) => t.token)),
    );
    if ([...wanted].every((t) => everywhere.has(t)))
      return { state: "partial", resumeEvidence: [] };
  }
  return { state: "missing", resumeEvidence: [] };
}

const sectionContext = (
  section: ResumeStructure["lineSections"][number],
  inRole: boolean,
): "role" | "skills_list" | "elsewhere" =>
  section === "skills" ? "skills_list" : inRole ? "role" : "elsewhere";

/**
 * Every quoted span must equal the resume text at its offsets, and "met" needs at least one.
 * An item that breaks this is shown as not checked, never as found.
 */
export function assertEvidenceGrounded(
  requirements: RequirementMatch[],
  resumeText: string,
): { downgraded: number } {
  let downgraded = 0;
  for (const item of requirements) {
    const grounded = item.resumeEvidence.every(
      (e) => resumeText.slice(e.start, e.end) === e.text,
    );
    const needsEvidence = item.state === "met" && !item.resumeEvidence.length;
    if (grounded && !needsEvidence) continue;
    item.state = "not_evaluated";
    item.satisfiedBy = null;
    item.resumeEvidence = [];
    item.detail = "The evidence check failed, so this item is not reported.";
    downgraded++;
  }
  return { downgraded };
}

export function matchRequirements(args: {
  jobDescription: string;
  resumeText: string;
  /** Date used for "Present"; defaults to today. Pass one for reproducible results. */
  now?: Date;
}): RequirementMatchResult {
  const now = args.now ?? new Date();
  const { drafts, truncated, applicationChecks } = extractRequirements(
    args.jobDescription,
  );
  const lines = resumeLines(args.resumeText);
  const structure = parseResumeStructure(args.resumeText, now);
  const skillIntervals = new Map<string, [number, number][]>();
  const skillAnywhere = new Set<string>();
  lines.forEach((line, index) => {
    for (const hit of findSkills(line.tokens, true)) {
      skillAnywhere.add(hit.skill.id);
      const role = roleAtLine(structure, index + 1);
      if (role) {
        const list = skillIntervals.get(hit.skill.id) ?? [];
        list.push([role.startMonth, role.endMonth]);
        skillIntervals.set(hit.skill.id, list);
      }
    }
  });
  const ctx: MatchContext = { structure, skillIntervals, skillAnywhere };
  const requirements = drafts.map((draft): RequirementMatch => {
    const outcome = matchDraft(draft, lines, ctx);
    // Where the evidence sits, and how recent it is (evidence for hints; not scored yet).
    let context: RequirementMatch["context"] = null;
    let lastYear: number | null = null;
    if (outcome.resumeEvidence.length && draft.kind !== "years") {
      const rank = { role: 3, elsewhere: 2, skills_list: 1 } as const;
      for (const e of outcome.resumeEvidence) {
        const role = roleAtLine(structure, e.line);
        const c = sectionContext(
          structure.lineSections[e.line - 1],
          role !== null,
        );
        if (!context || rank[c] > rank[context]) context = c;
        if (role)
          lastYear = Math.max(lastYear ?? 0, Math.floor(role.endMonth / 12));
      }
    }
    return {
      phrase: draft.phrase,
      kind: draft.kind,
      section: draft.section,
      importance: draft.importance,
      skillId: draft.skillId,
      altGroup: draft.altGroup ?? null,
      satisfiedBy: null,
      detail: outcome.detail ?? null,
      context,
      lastYear,
      jobEvidence: draft.jobEvidence.slice(0, 3),
      state: outcome.state,
      resumeEvidence: outcome.resumeEvidence,
    };
  });
  // One met alternative satisfies the others in its group.
  for (const item of requirements) {
    if (item.state !== "missing" || !item.altGroup) continue;
    const winner = requirements.find(
      (o) => o.altGroup === item.altGroup && o.state === "met",
    );
    if (winner) {
      item.state = "met";
      item.satisfiedBy = winner.phrase;
      item.resumeEvidence = winner.resumeEvidence;
      item.context = winner.context;
      item.lastYear = winner.lastYear;
    }
  }
  const integrity = assertEvidenceGrounded(requirements, args.resumeText);
  return {
    matcherVersion: MATCHER_VERSION,
    asOf: now.toISOString().slice(0, 10),
    vocabularyVersion: VOCABULARY_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    applicationChecks,
    titleAlignment: alignTitle(args.jobDescription, structure.roles),
    structure,
    requirements,
    truncated,
    integrity,
  };
}

// ---- compatibility with the live score payload --------------------------------
const span = (e: LineEvidence, alias: string): EvidenceSpan => ({
  start: e.start,
  end: e.end,
  text: e.text,
  alias,
});

/** Maps the typed result onto the legacy keyword-coverage shape the live score stores. */
export function toLegacyCoverage(result: RequirementMatchResult) {
  // Responsibilities and untyped years are context, not coverage.
  // An alternative met through another option was not itself found, so it is not listed as found.
  const scored = result.requirements.filter(
    (r) =>
      r.importance !== "contextual" &&
      r.state !== "not_evaluated" &&
      !r.satisfiedBy,
  );
  const hasRequired = scored.some((r) => r.importance === "required");
  const counted = hasRequired
    ? scored.filter((r) => r.importance === "required")
    : scored;
  const evidence = result.requirements.map((r): MatchEvidence => ({
    term: r.phrase,
    taxonomyId: r.skillId,
    kind: r.skillId ? "taxonomy" : "keyword",
    uncertain: false,
    job: {
      occurrenceCount: r.jobEvidence.length,
      spans: r.jobEvidence.map((e) => span(e, r.phrase)),
    },
    resume: {
      occurrenceCount:
        r.state === "met" || r.state === "partial"
          ? Math.max(1, r.resumeEvidence.length)
          : 0,
      spans: r.resumeEvidence.map((e) => span(e, r.phrase)),
    },
  }));
  return {
    taxonomyVersion: `${result.matcherVersion}+${result.vocabularyVersion}`,
    terms: counted.map((r) => r.phrase),
    matched: counted.filter((r) => r.state !== "missing").map((r) => r.phrase),
    missing: counted.filter((r) => r.state === "missing").map((r) => r.phrase),
    uncertain: [] as string[],
    evidence: evidence.filter((e) => counted.some((r) => r.phrase === e.term)),
  };
}
