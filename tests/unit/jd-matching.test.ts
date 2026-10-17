import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SKILL_TAXONOMY,
  TAXONOMY_VERSION,
  matchJobDescription,
  type MatchEvidence,
} from "../../app/lib/server/matching";

interface LabeledFixture {
  id: string;
  category: "positive" | "negative" | "adversarial";
  jobDescription: string;
  resumeText: string;
  expected: {
    terms: string[];
    matched: string[];
    missing: string[];
  };
}

const corpus = JSON.parse(
  readFileSync(
    new URL("../fixtures/matching/t052-labeled.json", import.meta.url),
    "utf8",
  ),
) as { fixtures: LabeledFixture[] };

describe("versioned JD phrase and skill matching", () => {
  it("selects requirement vocabulary before generic company prose without corrupting citations", () => {
    const jobDescription =
      "About Example Company\n" +
      "Innovative practical exposure focuses teams products the job. ".repeat(
        10,
      ) +
      "\nQualifications\nPython FastAPI Flask Pydantic required\nAbout Example Company\nJava";
    const result = matchJobDescription({
      jobDescription,
      resumeText: "Built FastAPI with Python",
    });
    expect(result.terms.slice(0, 4)).toEqual([
      "Python",
      "FastAPI",
      "Flask",
      "Pydantic",
    ]);
    expect(result.terms).not.toContain("the");
    expect(result.terms).not.toContain("Java");
    expectEvidenceOffsets(result.evidence, {
      jobDescription,
      resumeText: "Built FastAPI with Python",
    } as LabeledFixture);
  });
  it("does not count negated resume or excluded job skills as positive evidence", () => {
    const result = matchJobDescription({
      jobDescription: "Python required; no Java experience required",
      resumeText: "No Python experience. Java developer.",
    });
    expect(result.terms).toContain("Python");
    expect(result.terms).not.toContain("Java");
    expect(result.matched).not.toContain("Python");
    expect(
      matchJobDescription({
        jobDescription: "Python",
        resumeText: "Not only Python but Java",
      }).matched,
    ).toContain("Python");
  });
  it("has a stable version and collision-free taxonomy identifiers", () => {
    expect(TAXONOMY_VERSION).toBe("skills-taxonomy-v1");
    expect(new Set(SKILL_TAXONOMY.entries.map((entry) => entry.id)).size).toBe(
      SKILL_TAXONOMY.entries.length,
    );
  });

  it.each(corpus.fixtures)("matches labeled fixture: $id", (fixture) => {
    const result = matchJobDescription({
      jobDescription: fixture.jobDescription,
      resumeText: fixture.resumeText,
    });

    expect(result.taxonomyVersion).toBe(TAXONOMY_VERSION);
    expect(result.terms).toEqual(fixture.expected.terms);
    expect(result.matched).toEqual(fixture.expected.matched);
    expect(result.missing).toEqual(fixture.expected.missing);
    expectEvidenceOffsets(result.evidence, fixture);
  });

  it("gives one coverage credit for repeated aliases and caps stored spans", () => {
    const result = matchJobDescription({
      jobDescription: "JavaScript",
      resumeText: "JS JavaScript ECMAScript JS JavaScript",
    });

    expect(result.matched).toEqual(["JavaScript"]);
    expect(result.evidence[0].resume).toMatchObject({ occurrenceCount: 5 });
    expect(result.evidence[0].resume.spans).toHaveLength(3);
  });

  it("labels generic matches as uncertain while leaving taxonomy matches certain", () => {
    const result = matchJobDescription({
      jobDescription: "TypeScript observability",
      resumeText: "TypeScript and observability work",
    });

    expect(result.uncertain).toContain("observability");
    expect(
      result.evidence.find((item) => item.term === "TypeScript")?.uncertain,
    ).toBe(false);
  });

  it("reproduces the labeled match-quality counts", () => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let expectedNegative = 0;

    for (const fixture of corpus.fixtures) {
      const actual = matchJobDescription({
        jobDescription: fixture.jobDescription,
        resumeText: fixture.resumeText,
      });
      const actualMatched = new Set(actual.matched);
      const expectedMatched = new Set(fixture.expected.matched);
      for (const term of fixture.expected.terms) {
        const predicted = actualMatched.has(term);
        const expected = expectedMatched.has(term);
        if (predicted && expected) truePositive += 1;
        if (predicted && !expected) falsePositive += 1;
        if (!predicted && expected) falseNegative += 1;
        if (!expected) expectedNegative += 1;
      }
    }

    expect({
      truePositive,
      falsePositive,
      falseNegative,
      expectedNegative,
    }).toEqual({
      truePositive: 13,
      falsePositive: 0,
      falseNegative: 0,
      expectedNegative: 9,
    });
  });
});

function expectEvidenceOffsets(
  evidence: MatchEvidence[],
  fixture: LabeledFixture,
): void {
  for (const item of evidence) {
    expect(item.job.occurrenceCount).toBeGreaterThan(0);
    for (const span of item.job.spans) {
      expect(fixture.jobDescription.slice(span.start, span.end)).toBe(
        span.text,
      );
    }
    for (const span of item.resume.spans) {
      expect(fixture.resumeText.slice(span.start, span.end)).toBe(span.text);
    }
  }
}
