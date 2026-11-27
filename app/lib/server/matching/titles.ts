// Title family and seniority alignment (ATS-11). Evidence only: no points until calibrated.
import type { Role } from "./roles";

export type TitleAlignment = "aligned" | "adjacent" | "different" | "unknown";
export interface TitleAlignmentResult {
  alignment: TitleAlignment;
  jdTitle: string | null;
  jdFamily: string | null;
  jdSeniority: number | null;
  /** Resume title that matched best, with its family and seniority. */
  resumeTitle: string | null;
  resumeFamily: string | null;
  resumeSeniority: number | null;
  seniority: "below" | "at" | "above" | "unknown";
}

const FAMILIES: Record<string, readonly string[]> = {
  "software-engineering": [
    "software engineer",
    "software developer",
    "software development engineer",
    "sde",
    "swe",
    "developer",
    "programmer",
    "full stack",
    "full-stack",
    "backend",
    "back end",
    "back-end",
    "frontend",
    "front end",
    "front-end",
    "web developer",
    "application developer",
    "member of technical staff",
    "engineer",
  ],
  "ml-engineering": [
    "machine learning engineer",
    "ml engineer",
    "ai engineer",
    "applied ml",
  ],
  "data-science": [
    "data scientist",
    "applied scientist",
    "research scientist",
    "machine learning scientist",
  ],
  "data-engineering": ["data engineer", "analytics engineer", "etl developer"],
  "data-analysis": [
    "data analyst",
    "business analyst",
    "bi analyst",
    "business intelligence",
    "analyst",
  ],
  "devops-sre": [
    "devops",
    "site reliability",
    "sre",
    "platform engineer",
    "infrastructure engineer",
    "cloud engineer",
    "systems engineer",
    "systems administrator",
  ],
  security: [
    "security engineer",
    "security analyst",
    "penetration tester",
    "information security",
    "cybersecurity",
    "security",
  ],
  "product-management": [
    "product manager",
    "product owner",
    "program manager",
    "technical program manager",
    "product lead",
  ],
  design: [
    "designer",
    "ux",
    "ui designer",
    "product designer",
    "graphic designer",
  ],
  marketing: [
    "marketing manager",
    "marketing specialist",
    "growth",
    "seo specialist",
    "content marketer",
    "digital marketing",
    "marketing",
  ],
  sales: ["sales", "account executive", "business development"],
  "engineering-management": [
    "engineering manager",
    "director of engineering",
    "head of engineering",
  ],
};
const ADJACENT = new Set(
  [
    ["software-engineering", "devops-sre"],
    ["software-engineering", "data-engineering"],
    ["software-engineering", "ml-engineering"],
    ["software-engineering", "security"],
    ["software-engineering", "engineering-management"],
    ["ml-engineering", "data-science"],
    ["data-science", "data-analysis"],
    ["data-engineering", "data-analysis"],
    ["data-engineering", "ml-engineering"],
    ["devops-sre", "security"],
    ["product-management", "design"],
    ["marketing", "sales"],
  ].flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
);
const ROLE_NOUN =
  /\b(engineer|developer|manager|scientist|analyst|designer|architect|lead|director|specialist|consultant|administrator|intern|recruiter|marketer|programmer|owner|executive)\b/i;

function has(text: string, name: string) {
  return new RegExp(
    `(?<![a-z])${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![a-z])`,
    "i",
  ).test(text);
}
// More specific families win: check the longest names first.
const ORDERED = Object.entries(FAMILIES)
  .flatMap(([family, names]) => names.map((name) => ({ family, name })))
  .sort((a, b) => b.name.length - a.name.length);
export function titleFamily(title: string): string | null {
  return ORDERED.find(({ name }) => has(title, name))?.family ?? null;
}
export function titleSeniority(title: string): number | null {
  const t = title.toLowerCase();
  if (/\b(intern|trainee)\b/.test(t)) return 0;
  if (/\b(director|head of|vp|vice president|chief)\b/.test(t)) return 5;
  if (/\b(staff|principal|distinguished|lead)\b|\b(iv|v|4|5)\b/.test(t))
    return 4;
  if (/\b(senior|sr\.?|iii|3)\b/.test(t)) return 3;
  if (/\b(junior|jr\.?|associate|entry|graduate|i|1)\b/.test(t)) return 1;
  if (/\b(manager)\b/.test(t)) return 4;
  // An unmarked role title ("Software Engineer") is treated as mid-level for comparison only.
  return /\b(ii|2)\b/.test(t) || ROLE_NOUN.test(t) ? 2 : null;
}

export function jdTitleOf(jd: string): string | null {
  const labelled = /^\s*(?:job title|title|position|role)\s*:\s*(.+)$/im.exec(
    jd,
  );
  if (labelled) return labelled[1].trim().slice(0, 120);
  const first = jd
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (
    first &&
    first.split(/\s+/).length <= 12 &&
    ROLE_NOUN.test(first) &&
    !/[.;]$/.test(first)
  )
    return first.slice(0, 120);
  return null;
}

export function alignTitle(
  jd: string,
  roles: readonly Role[],
): TitleAlignmentResult {
  const jdTitle = jdTitleOf(jd);
  const base = {
    jdTitle,
    jdFamily: jdTitle ? titleFamily(jdTitle) : null,
    jdSeniority: jdTitle ? titleSeniority(jdTitle) : null,
  };
  const empty = {
    ...base,
    resumeTitle: null,
    resumeFamily: null,
    resumeSeniority: null,
    seniority: "unknown" as const,
  };
  const titled = [...roles]
    .filter((r) => r.title)
    .sort((a, b) => b.endMonth - a.endMonth);
  if (!base.jdFamily || !titled.length)
    return { alignment: "unknown", ...empty };
  const rank = (role: Role) => {
    const family = titleFamily(role.title!);
    return family === base.jdFamily
      ? 2
      : family && ADJACENT.has(`${family}|${base.jdFamily}`)
        ? 1
        : 0;
  };
  const best = titled.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const score = rank(best);
  const resumeSeniority = titleSeniority(best.title!);
  const seniority =
    base.jdSeniority === null || resumeSeniority === null
      ? "unknown"
      : resumeSeniority < base.jdSeniority
        ? "below"
        : resumeSeniority > base.jdSeniority
          ? "above"
          : "at";
  return {
    alignment: score === 2 ? "aligned" : score === 1 ? "adjacent" : "different",
    ...base,
    resumeTitle: best.title,
    resumeFamily: titleFamily(best.title!),
    resumeSeniority,
    seniority,
  };
}
