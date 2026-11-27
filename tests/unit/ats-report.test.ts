import { describe, expect, it } from "vitest";
import {
  buildAtsReport,
  formatAtsReport,
  summarize,
} from "../../app/lib/ats-report";
import { type AnalysisResultZod } from "../../app/lib/server/schema";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";

const JD = `Senior Software Engineer

Requirements
- 5+ years of software engineering experience
- Bachelor's degree in Computer Science or a related field
- Strong experience with TypeScript and React
- Experience with AWS, Terraform or Google Cloud
- Experience with GraphQL

Preferred Qualifications
- Experience with Kubernetes
- Master's degree

You must be authorized to work in the United States.`;
const RESUME = `Alex Example
alex@example.test | +1 202 555 0100 | Austin, TX

Experience
Senior Software Engineer, Example Corp
Jan 2020 - Present
- Built TypeScript and React services on AWS, deployed with Docker and Kubernetes.

Software Engineer, Sample Systems
Jun 2016 - Dec 2019
- Developed Python data pipelines and improved SQL query performance.

Education
B.S. Computer Science, State University, 2016

Skills
TypeScript, React, Python, SQL, AWS, Docker, Kubernetes`;

function resultFor(
  resume = RESUME,
  extraWarnings: {
    field: "overall";
    severity: "warn" | "error" | "info";
    message: string;
  }[] = [],
) {
  const s = scoreExtractedResume({
    text: resume,
    pageCount: 1,
    jobDescription: JD,
    textChecksum: "x",
    matcher: "v2",
  });
  return {
    typed: s.keywordCoverage.typed,
    ruleTrace: s.ruleTrace,
    parseView: {
      ...s.parseView,
      warnings: [...s.parseView.warnings, ...extraWarnings],
    },
    feedback: {
      overallScore: s.score,
      ATS: { score: s.score },
      toneAndStyle: { score: 1 },
      content: { score: 2 },
      structure: { score: 3 },
      skills: { score: 4 },
    },
    jdKeywords: [],
    matchedKeywords: [],
    uncertainKeywords: [],
  } as unknown as AnalysisResultZod;
}

describe("buildAtsReport (R-07)", () => {
  const result = resultFor();
  const report = buildAtsReport(result)!;
  it("counts alternatives once and reports the one real gap", () => {
    expect(report.minimum).toEqual({
      total: 6,
      met: 5,
      partial: 0,
      missing: 1,
    });
    expect(report.minimumItems[0].phrase).toBe("GraphQL");
  });
  it("returns null for results saved without the typed output", () => {
    expect(
      buildAtsReport({ ...result, typed: undefined } as AnalysisResultZod),
    ).toBeNull();
  });
  it("gives a saved result without altGroup the same counts as a new one", () => {
    const old = structuredClone(result);
    for (const r of old.typed!.requirements)
      delete (r as { altGroup?: unknown }).altGroup;
    expect(buildAtsReport(old)!.minimum).toEqual(report.minimum);
  });
});

describe("parse health includes file problems (R-08)", () => {
  it("counts each file warning as a failing check", () => {
    const clean = buildAtsReport(resultFor())!.parseHealth;
    const flagged = buildAtsReport(
      resultFor(RESUME, [
        {
          field: "overall",
          severity: "error",
          message: "2 pieces of text are drawn in white.",
        },
        { field: "overall", severity: "info", message: "1 image found." },
      ]),
    )!.parseHealth;
    expect(flagged.total).toBe(clean.total + 1);
    expect(flagged.passed).toBe(clean.passed);
    expect(flagged.checks.at(-1)).toMatchObject({
      passed: false,
      label: "File check",
    });
  });
});

describe("overview counts and actions (R-09)", () => {
  const report = buildAtsReport(resultFor())!;
  it("puts the missing minimum qualification first", () => {
    expect(report.actions[0]).toMatchObject({ source: "JD match" });
    expect(report.actions[0].tip).toBe("Minimum not found: GraphQL");
  });
  it("lists preferred gaps after the minimums and parse problems", () => {
    const tips = report.actions.map((a) => a.tip);
    expect(tips.findIndex((t) => t.startsWith("Preferred"))).toBeGreaterThan(0);
  });
  it("counts strengths from genuine matches, not stand-in alternatives", () => {
    expect(
      report.strengths.every((i) => !i.satisfiedBy && i.state === "met"),
    ).toBe(true);
    expect(report.strengths.map((i) => i.phrase)).not.toContain("Terraform");
  });
  it("has no actions when every minimum is met and the file is clean", () => {
    const easy = scoreExtractedResume({
      text: RESUME,
      pageCount: 1,
      jobDescription: "Requirements\n- Experience with AWS",
      textChecksum: "x",
      matcher: "v2",
    });
    const r = buildAtsReport({
      ...resultFor(),
      typed: easy.keywordCoverage.typed,
      ruleTrace: easy.ruleTrace,
    } as unknown as AnalysisResultZod)!;
    expect(r.actions.filter((a) => a.source === "JD match")).toEqual([]);
  });
});

describe("downloaded report equals the page (R-11)", () => {
  const result = resultFor();
  const report = buildAtsReport(result)!;
  const text = formatAtsReport(result, report, true);
  it("prints the same counts as the report object", () => {
    expect(text).toContain(
      `Parse health: ${report.parseHealth.passed} of ${report.parseHealth.total} checks pass`,
    );
    expect(text).toContain(
      `JD match: ${report.minimum.met} of ${report.minimum.total} minimum qualifications met`,
    );
  });
  it("carries the O*NET CC BY 4.0 attribution (ATS-D1)", () => {
    expect(text).toContain("O*NET 31.0 Database");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("has not approved, endorsed, or tested");
  });
  it("lists each minimum item with its state, and quotes only what the resume says", () => {
    expect(text).toMatch(/- Not found: GraphQL/);
    expect(text).toMatch(/- Met by alternative: Terraform \(met through AWS\)/);
    expect(text).toMatch(/- Met: TypeScript - found: "TypeScript/);
    expect(text).not.toMatch(/Not found: GraphQL - found:/);
  });
  it("includes application questions, profile, actions, versions and the legacy score last", () => {
    expect(text).toMatch(/authorized to work/);
    expect(text).toMatch(/Parsed profile: 2 role\(s\)/);
    expect(text).toMatch(
      /Next actions:\n1\. \[JD match\] Minimum not found: GraphQL/,
    );
    expect(text).toMatch(/Versions: matcher requirement-matcher/);
    expect(text.indexOf("Legacy analysis score")).toBeGreaterThan(
      text.indexOf("Versions:"),
    );
  });
  it("falls back to the older report for results without typed output", () => {
    const old = formatAtsReport(
      { ...result, typed: undefined } as AnalysisResultZod,
      null,
      true,
    );
    expect(old).toContain("Deterministic checks:");
    expect(old).not.toContain("JD match:");
  });
});

describe("summarize", () => {
  it("groups by the satisfying option when altGroup is absent", () => {
    const base = {
      kind: "skill",
      importance: "required",
      altGroup: null,
    } as const;
    const items = [
      { ...base, phrase: "AWS", state: "met", satisfiedBy: null },
      { ...base, phrase: "Terraform", state: "met", satisfiedBy: "AWS" },
      { ...base, phrase: "GraphQL", state: "missing", satisfiedBy: null },
    ] as unknown as Parameters<typeof summarize>[0];
    expect(summarize(items)).toEqual({
      total: 2,
      met: 1,
      partial: 0,
      missing: 1,
    });
  });
});
