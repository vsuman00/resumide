// One view-model for the ATS result (R-07). The page header, Overview counts, Keywords and
// Parse tabs and the downloaded report all read this, so they cannot disagree. Pure and
// shared: no server imports.
import type { AnalysisResultZod, TypedCoverage } from "~/lib/server/schema";
import { ONET_ATTRIBUTION } from "~/lib/onet-attribution";

type AnalysisResult = AnalysisResultZod;

export type ReportItem = TypedCoverage["requirements"][number];

export const STATE_LABEL: Record<ReportItem["state"], string> = {
  met: "Met",
  partial: "Partly met",
  missing: "Not found",
  not_evaluated: "Not checked",
};

/** The label shown for an item: a stand-in alternative is not itself "found". */
export const itemLabel = (item: ReportItem) =>
  item.state === "met" && item.satisfiedBy
    ? "Met by alternative"
    : STATE_LABEL[item.state];

/** What to do next. Never suggests claiming something that is not true. */
export function itemHint(item: ReportItem): string | null {
  if (item.state === "met")
    return item.context === "skills_list"
      ? "Found only in your skills list. If it is true, also show it in a dated role."
      : null;
  if (item.state === "not_evaluated")
    return item.kind === "years"
      ? "Add dates to your roles so years of experience can be checked."
      : "This is a general quality; keywords cannot check it.";
  if (item.kind === "degree")
    return "If you hold this degree or an equivalent, list it under Education.";
  if (item.kind === "years") return null;
  return "If you have this experience, show it in a bullet inside a dated role.";
}

const RANK = { met: 2, partial: 1, missing: 0, not_evaluated: -1 } as const;

export interface Summary {
  total: number;
  met: number;
  partial: number;
  missing: number;
}

/**
 * Counts qualifications, not options: "A, B or C" is one item, as good as its best option.
 * Results saved before altGroup existed group stand-ins by the option that satisfied them;
 * a group where nothing was found still counts each option (a known over-count of misses).
 */
export function summarize(items: readonly ReportItem[]): Summary {
  const groups = new Map<string, ReportItem>();
  for (const r of items) {
    if (r.state === "not_evaluated") continue;
    const key = r.altGroup ?? `alt:${r.satisfiedBy ?? r.phrase}`;
    const seen = groups.get(key);
    if (!seen || RANK[r.state] > RANK[seen.state]) groups.set(key, r);
  }
  const checked = [...groups.values()];
  return {
    total: checked.length,
    met: checked.filter((r) => r.state === "met").length,
    partial: checked.filter((r) => r.state === "partial").length,
    missing: checked.filter((r) => r.state === "missing").length,
  };
}

export interface ParseCheck {
  label: string;
  passed: boolean;
  detail: string;
}
export interface ReportAction {
  source: "JD match" | "Parse health";
  tip: string;
  explanation: string;
}
export interface AtsReport {
  parseHealth: { passed: number; total: number; checks: ParseCheck[] };
  minimum: Summary;
  preferred: Summary;
  /** Required items, missing first. */
  minimumItems: ReportItem[];
  preferredItems: ReportItem[];
  actions: ReportAction[];
  strengths: ReportItem[];
  applicationChecks: TypedCoverage["applicationChecks"];
  title: TypedCoverage["titleAlignment"];
  profile: TypedCoverage["profile"];
  truncated: boolean;
  downgraded: number;
  versions: { matcher: string; vocabulary: string; asOf: string };
}

const ORDER = { missing: 0, partial: 1, not_evaluated: 2, met: 3 } as const;
const bySeverity = (list: ReportItem[]) =>
  [...list].sort((a, b) => ORDER[a.state] - ORDER[b.state]);

/** Present for results that carry the typed matcher output; older results return null. */
export function buildAtsReport(result: AnalysisResult): AtsReport | null {
  const typed = result.typed;
  if (!typed) return null;
  const checks: ParseCheck[] = [
    ...result.ruleTrace
      .filter(
        (r) =>
          r.ruleId !== "keywords.coverage" && r.outcome !== "not_evaluated",
      )
      .map((r) => ({ label: r.label, passed: r.passed, detail: r.detail })),
    // File-level findings (hidden text, tables, headers, garbled fonts, images, links).
    ...result.parseView.warnings
      .filter((w) => w.field === "overall" && w.severity !== "info")
      .map((w) => ({ label: "File check", passed: false, detail: w.message })),
  ];
  const required = typed.requirements.filter(
    (r) => r.importance === "required",
  );
  const preferred = typed.requirements.filter(
    (r) => r.importance === "preferred",
  );
  const minimumItems = bySeverity(required);
  const actions: ReportAction[] = [
    ...minimumItems
      .filter((i) => i.state === "missing" || i.state === "partial")
      .map((i) => ({
        source: "JD match" as const,
        tip: `${i.state === "missing" ? "Minimum not found" : "Minimum partly met"}: ${i.phrase}`,
        explanation: i.detail ?? itemHint(i) ?? "Review this requirement.",
      })),
    ...checks
      .filter((c) => !c.passed)
      .map((c) => ({
        source: "Parse health" as const,
        tip: c.label,
        explanation: c.detail,
      })),
    ...bySeverity(preferred)
      .filter((i) => i.state === "missing" || i.state === "partial")
      .map((i) => ({
        source: "JD match" as const,
        tip: `Preferred ${i.state === "missing" ? "not found" : "partly met"}: ${i.phrase}`,
        explanation: i.detail ?? itemHint(i) ?? "Review this requirement.",
      })),
  ];
  return {
    parseHealth: {
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    },
    minimum: summarize(required),
    preferred: summarize(preferred),
    minimumItems,
    preferredItems: bySeverity(preferred),
    actions,
    strengths: required.filter((i) => i.state === "met" && !i.satisfiedBy),
    applicationChecks: typed.applicationChecks,
    title: typed.titleAlignment,
    profile: typed.profile,
    truncated: typed.truncated,
    downgraded: typed.integrity?.downgraded ?? 0,
    versions: {
      matcher: typed.matcherVersion,
      vocabulary: typed.vocabularyVersion,
      asOf: typed.asOf,
    },
  };
}

const TITLE_TEXT = {
  aligned: "matches",
  adjacent: "is close to",
  different: "differs from",
  unknown: "could not be compared with",
} as const;

function reportLine(item: ReportItem): string {
  const quote =
    item.state !== "missing" &&
    item.state !== "not_evaluated" &&
    item.kind !== "years" &&
    item.resumeEvidence.length
      ? ` - found: "${item.resumeEvidence[0].text.slice(0, 120)}"`
      : "";
  const alt = item.satisfiedBy ? ` (met through ${item.satisfiedBy})` : "";
  const detail = item.detail ? ` - ${item.detail}` : "";
  return `- ${itemLabel(item)}: ${item.phrase}${alt}${quote}${detail}`;
}

/** The downloadable report: the same numbers and states as the page. */
export function formatAtsReport(
  result: AnalysisResult,
  report: AtsReport | null,
  unscored: boolean,
): string {
  const lines = ["Resumide evidence report", ""];
  if (report) {
    const m = report.minimum;
    lines.push(
      `Parse health: ${report.parseHealth.passed} of ${report.parseHealth.total} checks pass`,
      ...report.parseHealth.checks.map(
        (c) =>
          `- ${c.label}: ${c.passed ? "Pass" : "Needs attention"} (${c.detail})`,
      ),
      "",
      m.total
        ? `JD match: ${m.met} of ${m.total} minimum qualifications met (${m.partial} partly met, ${m.missing} not found)`
        : "JD match: no minimum qualifications were found in the job description",
      ...report.minimumItems.map(reportLine),
    );
    if (report.preferredItems.length)
      lines.push(
        "",
        "Preferred qualifications:",
        ...report.preferredItems.map(reportLine),
      );
    if (report.truncated)
      lines.push(
        "",
        "Note: the job description was long; only the first 80 requirements are included.",
      );
    if (report.applicationChecks.length)
      lines.push(
        "",
        "Answer these in the application (they never change the result):",
        ...report.applicationChecks.map((c) => `- ${c.kind}: ${c.text}`),
      );
    const t = report.title;
    if (t.jdTitle && t.resumeTitle)
      lines.push(
        "",
        `Title evidence: "${t.jdTitle}" ${TITLE_TEXT[t.alignment]} "${t.resumeTitle}" (evidence only).`,
      );
    const roles = report.profile.roles.length;
    const edu = report.profile.education.length;
    lines.push(
      "",
      `Parsed profile: ${roles} role(s), ${
        report.profile.totalMonths === null
          ? "no dated experience"
          : `${(report.profile.totalMonths / 12).toFixed(1)} years of dated roles`
      }, ${edu} education entr${edu === 1 ? "y" : "ies"}.`,
      "",
      "Next actions:",
      ...(report.actions.length
        ? report.actions.map((a, i) => `${i + 1}. [${a.source}] ${a.tip}`)
        : ["- None from the checks above."]),
      "",
      `Versions: matcher ${report.versions.matcher}, vocabulary ${report.versions.vocabulary}, as of ${report.versions.asOf}.`,
      ONET_ATTRIBUTION,
      "",
    );
  } else {
    lines.push(
      "Deterministic checks:",
      ...result.ruleTrace.map(
        (rule) =>
          `- ${rule.label}: ${rule.outcome === "not_evaluated" ? "Skipped" : rule.passed ? "Pass" : "Needs attention"} (${rule.detail})`,
      ),
      "",
      "Keyword coverage:",
      ...result.jdKeywords.map((keyword) => {
        const status = result.uncertainKeywords.includes(keyword)
          ? "Uncertain evidence"
          : result.matchedKeywords.includes(keyword)
            ? "Found in resume"
            : "Missing from resume";
        return `- ${keyword}: ${status}`;
      }),
      "",
    );
  }
  lines.push(
    `Legacy analysis score (does not measure job fit): ${result.feedback.overallScore}/100`,
    ...(unscored
      ? ["Qualitative categories: cited prose only, no ratings."]
      : [
          `- Legacy tone and style: ${result.feedback.toneAndStyle.score}/100`,
          `- Legacy content: ${result.feedback.content.score}/100`,
          `- Legacy structure: ${result.feedback.structure.score}/100`,
          `- Legacy skills: ${result.feedback.skills.score}/100`,
        ]),
    "",
    "This report is guidance from a parse simulation, not a guarantee from a specific employer ATS.",
  );
  return lines.join("\n");
}
