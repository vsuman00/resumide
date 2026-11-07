import { expect, it } from "vitest";
import { atsRules } from "../../app/lib/server/atsRules";
import { parseSim } from "../../app/lib/server/parseSim";
import { matchJobDescription } from "../../app/lib/server/matching";

const text =
  "Demo Person\ndemo@example.test\n+1 202 555 0147\nExperience\nEngineer\n2020 - Present\n• Built React services\n• Delivered Node.js features\n" +
  "Built reliable services and maintained tests. ".repeat(40) +
  "\nEducation\nBachelor degree\nSkills\nReact Node.js";

it("retains skills under role purpose and key accountabilities before qualifications", () => {
  const result = matchJobDescription({
    jobDescription:
      "Job Purpose and Impact\nReactJS NodeJS PostgreSQL AWS\nKey Accountabilities\nDocker Jest\nQualifications\nMinimum 2 years of experience\nAbout Example Company\nPython",
    resumeText: text,
  });
  expect(result.terms).toEqual(
    expect.arrayContaining([
      "React",
      "Node.js",
      "PostgreSQL",
      "AWS",
      "Docker",
      "Jest",
    ]),
  );
  expect(result.terms).not.toContain("Python");
});

it("does not award all keyword points when half the recognized skills are missing", () => {
  const result = atsRules({
    text,
    jobDescription: "React Node.js PostgreSQL AWS",
    parseView: parseSim({ text, totalPages: 1 }),
  });
  expect(result.matchedKeywords).toHaveLength(2);
  expect(result.missingKeywords).toHaveLength(2);
  expect(result.score).toBeLessThan(100);
  expect(result.score).toBe(87);
  expect(
    result.ruleTrace.find((r) => r.ruleId === "keywords.coverage")?.credit,
  ).toBe(0.5);
  expect(
    atsRules({
      text,
      jobDescription: "React Node.js PostgreSQL AWS",
      parseView: parseSim({ text, totalPages: 1 }),
      rulesetVersion: "ats-rules-v3",
    }).score,
  ).toBe(100);
  expect(
    result.ruleTrace.find((r) => r.ruleId === "keywords.coverage")?.outcome,
  ).toBe("failed");
});
