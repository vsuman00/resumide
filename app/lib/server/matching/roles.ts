// Resume structure for matching and the parsed-profile preview (ATS-09, ATS-11, ATS-12, ATS-14).
// Deterministic text heuristics. This is what a keyword ATS could plausibly store, not a promise
// about any vendor's parser: every field can be missing and the UI says so.
export const STRUCTURE_VERSION = "resume-structure/1.0.0";

export type ResumeSection =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "other"
  | null;

export interface Role {
  title: string | null;
  employer: string | null;
  startMonth: number;
  endMonth: number;
  /** True when the range ends in "Present" or "Current". */
  current: boolean;
  dateText: string;
  /** 1-based line numbers, inclusive. */
  lineStart: number;
  lineEnd: number;
}
export interface EducationEntry {
  text: string;
  line: number;
  year: number | null;
}
export interface ResumeStructure {
  version: string;
  /** Section of each line (index 0 is line 1). */
  lineSections: ResumeSection[];
  roles: Role[];
  education: EducationEntry[];
  /** Total months across roles with overlaps merged; null when no dated role exists. */
  totalMonths: number | null;
  /** Months in roles titled as internships, merged; included in totalMonths. */
  internMonths: number;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = `(?:${MONTH}\\.?,?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const PRESENT = "(?:present|current|now|today|ongoing)";
const RANGE = new RegExp(
  `(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|${PRESENT})`,
  "iu",
);

function toMonth(text: string, now: Date, asEnd: boolean): number | null {
  const t = text.trim().toLowerCase();
  if (new RegExp(`^${PRESENT}$`).test(t))
    return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const named = new RegExp(`^(${MONTH})\\.?,?\\s+(\\d{4})$`).exec(t);
  if (named) return Number(named[2]) * 12 + (MONTHS[named[1].slice(0, 3)] - 1);
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (slash && Number(slash[1]) >= 1 && Number(slash[1]) <= 12)
    return Number(slash[2]) * 12 + Number(slash[1]) - 1;
  const year = /^(\d{4})$/.exec(t);
  // A bare year covers the whole year when it ends a range.
  if (year) return Number(year[1]) * 12 + (asEnd ? 11 : 0);
  return null;
}

const HEADINGS: [RegExp, ResumeSection][] = [
  [
    /^((professional|work|relevant|employment|career) )?(experience|history|background)$|^employment( history)?$|^work history$/,
    "experience",
  ],
  [/^(education|academic( background)?|education and training)$/, "education"],
  [
    /^((technical|key|core) )?(skills|technologies|competencies)( and .*)?$|^tools$/,
    "skills",
  ],
  [
    /^(projects|selected projects|personal projects|side projects|project experience)$/,
    "projects",
  ],
  [/^(summary|professional summary|profile|objective|about( me)?)$/, "summary"],
  [
    /^(certifications?|licenses?.*|awards|publications|volunteer.*|languages|interests|references|achievements|honors.*)$/,
    "other",
  ],
];
function headingOf(line: string): ResumeSection {
  const t = line
    .toLowerCase()
    .replace(/[^a-z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 6) return null;
  for (const [pattern, section] of HEADINGS)
    if (pattern.test(t)) return section;
  return null;
}

export function mergeMonths(
  intervals: readonly (readonly [number, number])[],
): number {
  const sorted = intervals
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [start, end] of sorted) {
    const from = Math.max(start, cursor);
    if (end + 1 > from) total += end + 1 - from;
    cursor = Math.max(cursor, end + 1);
  }
  return total;
}

const EDUCATION_ENTRY =
  /\b(university|college|institute|school|academy|polytechnic|bachelor'?s?|master'?s?|associate'?s?|doctorate|ph\.?\s?d|mba|diploma|degree|b\.?\s?tech|m\.?\s?tech|b\.?\s?e|b\.?\s?sc?|m\.?\s?sc?|b\.?\s?a|m\.?\s?a)\b/i;
const SEPARATORS = /\s*(?:\||,|—|–| - | at | @ |·)\s*/;
const ROLE_WORD =
  /\b(engineer|developer|manager|scientist|analyst|designer|architect|lead|director|specialist|consultant|administrator|intern|recruiter|marketer|programmer|owner|executive|associate|officer|coordinator|researcher)\b/i;
/** "Title, Employer" and "Employer, Title" are both common; the part naming a role is the title. */
function titleAndEmployer(text: string) {
  const parts = text
    .replace(/[()[\]]/g, " ")
    .split(SEPARATORS)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 1);
  const titleIndex = parts.findIndex((p) => ROLE_WORD.test(p));
  if (titleIndex <= 0)
    return { title: parts[0] ?? null, employer: parts[1] ?? null };
  return { title: parts[titleIndex], employer: parts[0] };
}

export function parseResumeStructure(
  resume: string,
  now: Date = new Date(),
): ResumeStructure {
  const lines = resume.split("\n");
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const lineSections: ResumeSection[] = [];
  const roles: Role[] = [];
  const education: EducationEntry[] = [];
  let section: ResumeSection = null;
  lines.forEach((raw, index) => {
    const heading = headingOf(raw.trim());
    if (heading) {
      section = heading;
      lineSections.push(section);
      return;
    }
    lineSections.push(section);
    const lineNo = index + 1;
    if (section === "education") {
      // Only degree or institution lines are entries; coursework, GPA and honours lines are not.
      if (raw.trim() && EDUCATION_ENTRY.test(raw)) {
        const year = /\b(?:19|20)\d{2}\b/.exec(raw);
        education.push({
          text: raw.trim(),
          line: lineNo,
          year: year ? Number(year[0]) : null,
        });
      }
      return;
    }
    const match = RANGE.exec(raw);
    if (!match) return;
    const start = toMonth(match[1], now, false);
    const current = new RegExp(`^${PRESENT}$`, "i").test(match[2].trim());
    const end = toMonth(match[2], now, true);
    if (start === null || end === null || end < start || start < 1970 * 12)
      return;
    const before = raw.slice(0, match.index).trim();
    const after = raw.slice(match.index + match[0].length).trim();
    let header = `${before} ${after}`.trim();
    if (header.replace(/[^\p{L}]/gu, "").length < 3) {
      // Title and employer sit on the line above the dates.
      for (let k = index - 1; k >= 0 && k >= index - 2; k--)
        if (lines[k].trim() && !headingOf(lines[k].trim())) {
          header = lines[k].trim();
          break;
        }
    }
    const { title, employer } = titleAndEmployer(header);
    roles.push({
      title,
      employer,
      startMonth: start,
      endMonth: Math.min(end, nowMonth),
      current,
      dateText: match[0],
      lineStart: lineNo,
      lineEnd: lineNo,
    });
  });
  // A role runs until the next role or heading.
  roles.forEach((role, i) => {
    const next = roles[i + 1]?.lineStart ?? lines.length + 1;
    let end = role.lineStart;
    for (let n = role.lineStart + 1; n < next; n++) {
      if (headingOf(lines[n - 1].trim())) break;
      end = n;
    }
    role.lineEnd = end;
  });
  return {
    version: STRUCTURE_VERSION,
    lineSections,
    roles,
    education,
    totalMonths: roles.length
      ? mergeMonths(roles.map((r) => [r.startMonth, r.endMonth] as const))
      : null,
    internMonths: mergeMonths(
      roles
        .filter((r) => /\b(intern|internship|trainee)\b/i.test(r.title ?? ""))
        .map((r) => [r.startMonth, r.endMonth] as const),
    ),
  };
}

/** Role that contains a 1-based line, if any. */
export function roleAtLine(
  structure: ResumeStructure,
  line: number,
): Role | null {
  return (
    structure.roles.find((r) => line >= r.lineStart && line <= r.lineEnd) ??
    null
  );
}
