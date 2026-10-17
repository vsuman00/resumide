import { matchJobDescription, type MatchEvidence } from "./matching";

export interface RuleTrace {
  ruleId: string;
  label: string;
  passed: boolean;
  outcome: "passed" | "failed" | "not_evaluated";
  confidence: "high" | "none";
  weight: number;
  detail: string;
  evidence?: string[];
}

export interface ATSRulesResult {
  score: number;
  tips: { type: "good" | "improve"; tip: string }[];
  ruleTrace: RuleTrace[];
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  uncertainKeywords: string[];
  taxonomyVersion: string;
  matchingEvidence: MatchEvidence[];
}

interface RuleResult {
  passed: boolean | null;
  detail: string;
  evidence?: string[];
}

interface Rule {
  ruleId: string;
  label: string;
  weight: number;
  run: (ctx: ScoreContext) => RuleResult;
}

interface ScoreContext {
  wordCount: number;
  parseView: ParseViewData;
  jdKeywords: string[];
  matched: string[];
  missing: string[];
}

const RULES: Rule[] = [
  {
    ruleId: "contact.email",
    label: "Email address present",
    weight: 12,
    run: (ctx) => {
      const email = ctx.parseView.contact.email;
      return {
        passed: email !== null,
        detail: email ? `Found: ${email}` : "No email detected.",
        evidence: email ? [email] : [],
      };
    },
  },
  {
    ruleId: "contact.phone",
    label: "Phone number present",
    weight: 4,
    run: (ctx) => {
      const phone = ctx.parseView.contact.phone;
      return {
        passed: phone !== null,
        detail: phone
          ? `Found: ${phone}`
          : "No phone detected (optional but recommended).",
        evidence: phone ? [phone] : [],
      };
    },
  },
  {
    ruleId: "sections.experience",
    label: "Experience section present",
    weight: 14,
    run: (ctx) => {
      const passed = ctx.parseView.sections.some(
        (section) => section.type === "experience",
      );
      return {
        passed,
        detail: passed ? "Detected." : "No 'Experience' section header.",
      };
    },
  },
  {
    ruleId: "sections.education",
    label: "Education section present",
    weight: 8,
    run: (ctx) => {
      const passed = ctx.parseView.sections.some(
        (section) => section.type === "education",
      );
      return {
        passed,
        detail: passed ? "Detected." : "No 'Education' section header.",
      };
    },
  },
  {
    ruleId: "sections.skills",
    label: "Skills section present",
    weight: 10,
    run: (ctx) => {
      const passed = ctx.parseView.sections.some(
        (section) => section.type === "skills",
      );
      return {
        passed,
        detail: passed ? "Detected." : "No 'Skills' section header.",
      };
    },
  },
  {
    ruleId: "dates.parseable",
    label: "Experience section has parseable dates",
    weight: 10,
    run: (ctx) => {
      const experience = ctx.parseView.sections.filter(
        (section) => section.type === "experience",
      );
      const dates = experience.flatMap((section) => section.dateStrings ?? []);
      return {
        passed: dates.length > 0,
        detail:
          dates.length > 0
            ? `Found ${dates.length} date string${dates.length === 1 ? "" : "s"}.`
            : "No dates detected in the Experience section.",
        evidence: dates.slice(0, 3),
      };
    },
  },
  {
    ruleId: "bullets.experience",
    label: "Experience section uses bullets",
    weight: 8,
    run: (ctx) => {
      const experience = ctx.parseView.sections.filter(
        (section) => section.type === "experience",
      );
      const bullets = experience.reduce(
        (total, section) => total + (section.bulletCount ?? 0),
        0,
      );
      return {
        passed: bullets >= 2,
        detail: `${bullets} bullet${bullets === 1 ? "" : "s"} detected.`,
        evidence: [String(bullets)],
      };
    },
  },
  {
    ruleId: "length.reasonable",
    label: "Resume length is reasonable",
    weight: 8,
    run: (ctx) => {
      const pages = ctx.parseView.totalPages;
      const passed = pages <= 2 && ctx.wordCount >= 200;
      const detail =
        pages > 2
          ? `${pages} pages - most ATS prefer 1-2 pages.`
          : ctx.wordCount < 200
            ? `Only ${ctx.wordCount} words - may be too short.`
            : `${pages} page${pages === 1 ? "" : "s"}, ${ctx.wordCount} words.`;
      return {
        passed,
        detail,
        evidence: [String(pages), `${ctx.wordCount} words`],
      };
    },
  },
  {
    ruleId: "keywords.coverage",
    label: "JD phrase and skill coverage",
    weight: 26,
    run: (ctx) => {
      if (ctx.jdKeywords.length === 0) {
        return {
          passed: null,
          detail: "No recognized JD skill terms available - not evaluated.",
        };
      }
      const ratio = ctx.matched.length / ctx.jdKeywords.length;
      return {
        passed: ratio >= 0.5,
        detail: `${ctx.matched.length}/${ctx.jdKeywords.length} JD phrases and skills present (${Math.round(ratio * 100)}%).`,
        evidence: ctx.missing.slice(0, 5),
      };
    },
  },
];

export function atsRules(args: {
  text: string;
  jobDescription: string;
  parseView: ParseViewData;
}): ATSRulesResult {
  const matching = matchJobDescription({
    jobDescription: args.jobDescription,
    resumeText: args.text,
  });
  const context: ScoreContext = {
    wordCount: args.text.trim().split(/\s+/).filter(Boolean).length,
    parseView: args.parseView,
    jdKeywords: matching.evidence
      .filter((item) => !item.uncertain)
      .map((item) => item.term),
    matched: matching.matched.filter(
      (term) => !matching.uncertain.includes(term),
    ),
    missing: matching.evidence
      .filter((item) => !item.uncertain && item.resume.occurrenceCount === 0)
      .map((item) => item.term),
  };
  const ruleTrace = RULES.map((rule) => toRuleTrace(rule, context));
  const evaluated = ruleTrace.filter(
    (rule) => rule.outcome !== "not_evaluated",
  );
  const totalWeight = evaluated.reduce((total, rule) => total + rule.weight, 0);
  const earnedWeight = ruleTrace
    .filter((rule) => rule.outcome === "passed")
    .reduce((total, rule) => total + rule.weight, 0);
  const score =
    totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100);

  return {
    score,
    tips: buildTips(ruleTrace),
    ruleTrace,
    jdKeywords: matching.terms,
    matchedKeywords: matching.matched,
    missingKeywords: matching.missing,
    uncertainKeywords: matching.uncertain,
    taxonomyVersion: matching.taxonomyVersion,
    matchingEvidence: matching.evidence,
  };
}

function toRuleTrace(rule: Rule, context: ScoreContext): RuleTrace {
  const result = rule.run(context);
  return {
    ruleId: rule.ruleId,
    label: rule.label,
    passed: result.passed === true,
    outcome:
      result.passed === null
        ? "not_evaluated"
        : result.passed
          ? "passed"
          : "failed",
    confidence: result.passed === null ? "none" : "high",
    weight: rule.weight,
    detail: result.detail,
    evidence: result.evidence,
  };
}

function buildTips(ruleTrace: RuleTrace[]) {
  const good = ruleTrace
    .filter((rule) => rule.outcome === "passed" && rule.weight >= 10)
    .slice(0, 2)
    .map((rule) => ({
      type: "good" as const,
      tip: `${rule.label}: ${rule.detail}`,
    }));
  const improve = ruleTrace
    .filter((rule) => rule.outcome === "failed" && rule.weight >= 8)
    .slice(0, 4)
    .map((rule) => ({
      type: "improve" as const,
      tip: `${rule.label}: ${rule.detail}`,
    }));
  const tips = [...good, ...improve];
  while (tips.length < 3) {
    tips.push({
      type: "improve",
      tip: "Consider adding more detail to strengthen your resume.",
    });
  }
  return tips.slice(0, 4);
}
