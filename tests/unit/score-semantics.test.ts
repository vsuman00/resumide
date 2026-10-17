import { describe, expect, it } from "vitest";
import { scoreBand } from "../../app/lib/score-band";
import { atsRules } from "../../app/lib/server/atsRules";
import { parseSim } from "../../app/lib/server/parseSim";

describe("score semantics", () => {
  it("uses dated bullets across every experience section", () => {
    const text =
      "Fictional Person\nfictional@example.test\nExperience\nExperience\n2021 - 2023\n• Delivered services\n• Improved reliability\nSkills\nPython";
    const parseView = parseSim({ text, totalPages: 1 });
    const populated = parseView.sections.find(
      (section) => section.type === "experience" && section.bulletCount > 0,
    )!;
    expect(populated).toBeDefined();
    const empty = { ...populated, dateStrings: [], bulletCount: 0 };
    const result = atsRules({
      text,
      jobDescription: "Python required",
      parseView: { ...parseView, sections: [empty, populated] },
    });
    expect(
      result.ruleTrace
        .filter((rule) =>
          ["dates.parseable", "bullets.experience"].includes(rule.ruleId),
        )
        .every((rule) => rule.outcome === "passed"),
    ).toBe(true);
  });
  it("does not award score credit to uncertain generic lexical matches", () => {
    const text =
      "Fictional Person\nfictional@example.test\nSkills\nobservability";
    const result = atsRules({
      text,
      jobDescription: "observability Python required",
      parseView: parseSim({ text, totalPages: 1 }),
    });
    expect(result.uncertainKeywords).toContain("observability");
    expect(
      result.ruleTrace.find((rule) => rule.ruleId === "keywords.coverage"),
    ).toMatchObject({
      outcome: "failed",
      detail: "0/1 JD phrases and skills present (0%).",
    });
  });
  it.each([
    [0, "needs_work"],
    [39, "needs_work"],
    [40, "needs_work"],
    [49, "needs_work"],
    [50, "good_start"],
    [69, "good_start"],
    [70, "strong"],
    [71, "strong"],
    [100, "strong"],
  ] as const)("maps %i to %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });

  it("excludes the no-JD rule from the denominator", () => {
    const text =
      "Jane Doe\njane@example.com\nExperience\n2022 - Present\nSkills\nTypeScript";
    const parseView = parseSim({ text, totalPages: 1 });
    const result = atsRules({ text, jobDescription: "", parseView });
    const keywordRule = result.ruleTrace.find(
      (rule) => rule.ruleId === "keywords.coverage",
    );
    expect(keywordRule).toMatchObject({
      outcome: "not_evaluated",
      confidence: "none",
    });
    expect(result.score).toBeLessThan(100);
  });
});
