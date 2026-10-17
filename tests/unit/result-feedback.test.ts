import { describe, expect, it } from "vitest";
import { buildPartialFeedback } from "../../app/lib/server/qualitative-stage";
import { visibleFeedbackGroups } from "../../app/lib/result-feedback";

describe("visible result feedback", () => {
  it("excludes unavailable service placeholders from candidate repair and strength counts", () => {
    const feedback = buildPartialFeedback({
      score: 74,
      ruleTrace: [
        { passed: true, detail: "Email recovered" },
        { passed: false, detail: "Missing skills section" },
        { passed: true, detail: "Dates recovered" },
      ],
    });
    const groups = visibleFeedbackGroups(feedback, true);
    expect(groups).toHaveLength(1);
    expect(
      groups.flatMap((g) => g.tips).filter((t) => t.type === "improve"),
    ).toHaveLength(1);
    expect(JSON.stringify(groups)).not.toContain("unavailable");
  });
  it("only counts cited prose in new envelopes, retaining historical tips", () => {
    const feedback = buildPartialFeedback({ score: 74, ruleTrace: [] });
    feedback.content = {
      score: 0,
      tips: [
        {
          type: "improve",
          tip: "Clarify outcome",
          explanation: "Explain the change",
          quote: "Built services",
        },
        ...feedback.content.tips.slice(1),
      ],
    };
    expect(visibleFeedbackGroups(feedback).flatMap((g) => g.tips)).toHaveLength(
      1,
    );
    delete feedback.scoreSemantics;
    expect(visibleFeedbackGroups(feedback).flatMap((g) => g.tips)).toHaveLength(
      12,
    );
  });
});
