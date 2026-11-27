import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";

const fixture = (
  JSON.parse(
    readFileSync(
      new URL("../fixtures/ats-match/corpus.json", import.meta.url),
      "utf8",
    ),
  ) as {
    fixtures: { id: string; jobDescription: string; resumeText: string }[];
  }
).fixtures.find((f) => f.id === "swe-large-search-strong")!;
const args = {
  text:
    fixture.resumeText +
    "\nExperience\nSkills\nEducation\nalex@example.com 555 010 0100",
  pageCount: 1,
  jobDescription: fixture.jobDescription,
  textChecksum: "synthetic",
};

describe("matcher switch (ATS-06)", () => {
  it("keeps the legacy matcher and its pinned taxonomy version when asked", () => {
    const result = scoreExtractedResume(args);
    expect(result.taxonomyVersion).toBe("skills-taxonomy-v1");
    expect(
      scoreExtractedResume({ ...args, matcher: "legacy" }).resultChecksum,
    ).toBe(result.resultChecksum);
  });
  it("records matcher and vocabulary versions when v2 is on, and scores the strong match higher", () => {
    const legacy = scoreExtractedResume(args);
    const v2 = scoreExtractedResume({ ...args, matcher: "v2" });
    expect(v2.taxonomyVersion).toMatch(
      /^requirement-matcher\/.+\+match-vocabulary\//,
    );
    expect(v2.keywordCoverage.taxonomyVersion).toBe(v2.taxonomyVersion);
    expect(v2.score).toBeGreaterThan(legacy.score);
    expect(v2.keywordCoverage.missing).toEqual([]);
    expect(v2.resultChecksum).not.toBe(legacy.resultChecksum);
  });
  it("keeps the keyword rule evidence in the stored shape", () => {
    const v2 = scoreExtractedResume({ ...args, matcher: "v2" });
    const rule = v2.ruleTrace.find((r) => r.ruleId === "keywords.coverage")!;
    expect(rule.outcome).toBe("passed");
    expect(
      v2.keywordCoverage.evidence.every(
        (e) => typeof e.term === "string" && e.job && e.resume,
      ),
    ).toBe(true);
  });
});
