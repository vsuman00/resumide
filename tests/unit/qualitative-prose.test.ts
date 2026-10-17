import { describe, it, expect } from "vitest";
import {
  groundQualitativeProse,
  legacyCategoryFromProse,
} from "../../app/lib/server/qualitative-prose";
const tip = {
  type: "improve" as const,
  tip: "Clarify this contribution",
  explanation: "Add context you can verify",
  quote: "Built services",
};
function output(tips = [tip]) {
  const category = { tips };
  return {
    toneAndStyle: category,
    content: category,
    structure: category,
    skills: category,
    writer: { summary: null, bullets: [] },
  };
}
describe("AA044 cited prose boundary", () => {
  it("accepts exact quotes and excludes unsupported tips", () => {
    const r = groundQualitativeProse(
      output([tip, { ...tip, quote: "Invented credential" }]),
      "Built services",
    );
    expect(r.content.tips).toEqual([tip]);
    expect(legacyCategoryFromProse(r.content).score).toBe(0);
    expect(legacyCategoryFromProse(r.content).tips[0]).toMatchObject({
      quote: "Built services",
    });
  });
  it.each(["score", "overallScore", "probability", "weights"])(
    "rejects model numeric field %s",
    (key) => {
      expect(() =>
        groundQualitativeProse({ ...output(), [key]: 100 }, "Built services"),
      ).toThrow();
      expect(() =>
        groundQualitativeProse(
          { ...output(), content: { tips: [tip], [key]: 100 } },
          "Built services",
        ),
      ).toThrow();
    },
  );
  it("does not treat normalized or invented quotations as exact evidence", () => {
    const r = groundQualitativeProse(
      output([{ ...tip, quote: "built services" }]),
      "Built services",
    );
    expect(r.skills.tips).toEqual([]);
  });
});
