import { it, expect } from "vitest";
import { checkWritingQuality } from "../../app/lib/writing-quality";
it("flags unsupported measurements and seniority without scoring prose", () => {
  const q = checkWritingQuality(
    "Senior architect reduced failures by 99%.",
    "Built release tests",
  );
  expect(q.unsupportedNumbers).toEqual(["99%"]);
  expect(q.newSeniorityTerms).toEqual(["senior", "architect"]);
  expect(q.domainQuality).toBeNull();
  expect(
    checkWritingQuality(
      "Reduced failures by 5%.",
      "Result: Reduced failures by 5%",
    ).unsupportedNumbers,
  ).toEqual([]);
});
it("reports grammar/duplication/length review needs without inventing mandatory metrics", () => {
  const q = checkWritingQuality(
    "Built built services.; " + "context ".repeat(60),
    "Built services",
  );
  expect(q.warnings).toHaveLength(3);
  expect(
    checkWritingQuality(
      "Built services; scope: internal deployment; result: fewer failures.",
      "Built services\nScope: internal deployment\nResult: fewer failures",
    ).unsupportedNumbers,
  ).toEqual([]);
});
