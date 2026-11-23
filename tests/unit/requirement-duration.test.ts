import { describe, expect, it } from "vitest";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import {
  calendarYearDayBand,
  evaluateRequirementDuration,
  REQUIREMENT_DURATION_POLICY,
} from "../../app/lib/server/requirement-duration";

type Kind =
  | "at_least"
  | "more_than"
  | "at_most"
  | "less_than"
  | "exactly"
  | "range"
  | "unknown"
  | "not_stated";
const span = { spanId: "jd-duration", start: 0, end: 1, quote: "1" };
function requirement(kind: Kind, years = 1, upper = years) {
  const lower = ["at_least", "more_than", "exactly", "range"].includes(kind)
    ? { value: years, inclusive: kind !== "more_than", evidence: span }
    : null;
  const high = ["at_most", "less_than", "exactly", "range"].includes(kind)
    ? { value: upper, inclusive: kind !== "less_than", evidence: span }
    : null;
  return {
    kind,
    evidence: kind === "not_stated" ? null : span,
    lower,
    upper: high,
    operatorEvidence: [],
    candidateEvidence: [],
    reason: kind === "unknown" ? "ambiguous" : null,
    subjectBinding: "literal_clause_only",
    evaluated: false,
  };
}
const interval = (start: string, end: string, subjectId = "skill:python") => ({
  subjectId,
  start,
  end,
});
const evaluate = (
  ranges: ReturnType<typeof interval>[],
  kind: Kind = "at_least",
  years = 1,
  upper = years,
) =>
  evaluateRequirementDuration({
    subjectId: "skill:python",
    intervals: ranges,
    requirement: requirement(kind, years, upper),
  });

describe("exact requirement duration calendar policy", () => {
  it("uses the exact Gregorian cycle rather than an average year", () => {
    expect(calendarYearDayBand(0)).toEqual({ minimum: 0, maximum: 0 });
    expect(calendarYearDayBand(1)).toEqual({ minimum: 365, maximum: 366 });
    expect(calendarYearDayBand(4)).toEqual({ minimum: 1460, maximum: 1461 });
    expect(calendarYearDayBand(100)).toEqual({
      minimum: 36524,
      maximum: 36525,
    });
  });
  it("unions unsorted overlapping and duplicate ranges once", () => {
    const result = evaluate([
      interval("2021-01-05", "2021-01-20"),
      interval("2021-01-01", "2021-01-10"),
      interval("2021-01-01", "2021-01-10"),
    ]);
    expect(result.durationDays).toEqual({ minimum: 19, maximum: 20 });
    expect(result.unionComponents).toEqual({
      exclusiveEnd: 1,
      inclusiveEnd: 1,
    });
  });
  it("merges touching ranges without creating another inclusive-end day", () => {
    expect(
      evaluate([
        interval("2021-01-01", "2021-01-10"),
        interval("2021-01-10", "2021-01-20"),
      ]).durationDays,
    ).toEqual({ minimum: 19, maximum: 20 });
  });
  it("uses the actual continuous start anniversary", () => {
    const result = evaluate([interval("2019-01-01", "2020-01-01")]);
    expect(result.state).toBe("satisfied");
    expect(result.basis).toBe("continuous_calendar_anniversary");
    expect(result.comparisons[0].thresholdDays).toEqual({
      minimum: 365,
      maximum: 365,
    });
  });
  it("does not floor an exclusive greater-than comparison", () => {
    expect(
      evaluate([interval("2019-01-01", "2020-01-02")], "more_than").state,
    ).toBe("satisfied");
    expect(
      evaluate([interval("2019-01-01", "2020-01-01")], "more_than").state,
    ).toBe("unknown");
  });
  it("preserves inclusive lower equality", () => {
    expect(
      evaluate([interval("2020-01-01", "2022-01-01")], "at_least", 2).state,
    ).toBe("satisfied");
  });
  it("preserves inclusive and exclusive upper operators", () => {
    const ranges = [interval("2020-01-01", "2022-01-01")];
    expect(evaluate(ranges, "at_most", 2).state).toBe("unknown");
    expect(evaluate(ranges, "less_than", 2).state).toBe("not_satisfied");
    expect(
      evaluate([interval("2020-01-01", "2021-12-30")], "at_most", 2).state,
    ).toBe("satisfied");
    expect(
      evaluate([interval("2020-01-01", "2022-01-02")], "at_most", 2).state,
    ).toBe("not_satisfied");
  });
  it("retains the last-day uncertainty below an anniversary", () => {
    expect(
      evaluate([interval("2020-01-01", "2021-12-31")], "less_than", 2).state,
    ).toBe("unknown");
    expect(
      evaluate([interval("2020-01-01", "2021-12-30")], "less_than", 2).state,
    ).toBe("satisfied");
  });
  it("does not claim exact years from an ambiguous to endpoint", () => {
    expect(
      evaluate([interval("2019-01-01", "2020-01-01")], "exactly").state,
    ).toBe("unknown");
    expect(
      evaluate([interval("2019-01-01", "2020-01-03")], "exactly").state,
    ).toBe("not_satisfied");
  });
  it("combines both range bounds using three-valued AND", () => {
    expect(
      evaluate([interval("2020-01-01", "2023-01-01")], "range", 2, 4).state,
    ).toBe("satisfied");
    expect(
      evaluate([interval("2020-01-01", "2024-01-02")], "range", 2, 4).state,
    ).toBe("not_satisfied");
    expect(
      evaluate([interval("2020-01-01", "2024-01-01")], "range", 2, 4).state,
    ).toBe("unknown");
  });
  it("honors independently exclusive range endpoints", () => {
    const raw = {
      subjectId: "skill:python",
      intervals: [interval("2020-01-01", "2024-01-01")],
      requirement: requirement("range", 2, 4),
    };
    raw.requirement.upper!.inclusive = false;
    expect(evaluateRequirementDuration(raw).state).toBe("not_satisfied");
  });
  it("preserves Feb29 anniversary ambiguity", () => {
    const result = evaluate([interval("2020-02-29", "2021-02-28")]);
    expect(result.comparisons[0].thresholdDays).toEqual({
      minimum: 365,
      maximum: 366,
    });
    expect(result.state).toBe("unknown");
    expect(
      evaluate([interval("2020-02-29", "2021-03-02")], "more_than").state,
    ).toBe("satisfied");
  });
  it("handles Gregorian century leap rules without host Date parsing", () => {
    expect(
      evaluate([interval("1900-02-28", "1900-03-01")]).durationDays,
    ).toEqual({ minimum: 1, maximum: 2 });
    expect(
      evaluate([interval("2000-02-28", "2000-03-01")]).durationDays,
    ).toEqual({ minimum: 2, maximum: 3 });
  });
  it("uses a conservative calendar band for disjoint periods", () => {
    const result = evaluate([
      interval("2021-01-01", "2021-07-01"),
      interval("2022-01-01", "2022-07-04"),
    ]);
    expect(result.durationDays).toEqual({ minimum: 365, maximum: 367 });
    expect(result.basis).toBe("cumulative_calendar_band");
    expect(result.state).toBe("unknown");
    expect(
      evaluate([
        interval("2021-01-01", "2021-07-01"),
        interval("2022-01-01", "2022-07-05"),
      ]).state,
    ).toBe("satisfied");
  });
  it("can prove a disjoint total below a lower bound", () => {
    expect(
      evaluate([
        interval("2021-01-01", "2021-07-01"),
        interval("2022-01-01", "2022-07-01"),
      ]).state,
    ).toBe("not_satisfied");
  });
  it("keeps gaps that only inclusive ends might bridge conservative", () => {
    const result = evaluate([
      interval("2020-01-01", "2020-01-02"),
      interval("2020-01-03", "2020-01-04"),
    ]);
    expect(result.unionComponents).toEqual({
      exclusiveEnd: 2,
      inclusiveEnd: 1,
    });
    expect(result.basis).toBe("cumulative_calendar_band");
  });
  it("does not turn absent evidence into zero tenure", () => {
    expect(evaluate([], "at_least", 0).state).toBe("unknown");
    expect(evaluate([], "at_least", 0).reason).toBe("no_intervals");
  });
  it("preserves unknown and unstated JD duration", () => {
    expect(
      evaluate([interval("2020-01-01", "2022-01-01")], "unknown").reason,
    ).toBe("requirement_duration_unknown");
    expect(
      evaluate([interval("2020-01-01", "2022-01-01")], "not_stated").reason,
    ).toBe("requirement_duration_not_stated");
  });
  it("accepts an actual typed-JD duration without flattening its bounds", () => {
    const jd = createJobRequirementRelations(
      "Requirements\nAt least 2 years of experience with Python",
      {
        ownerId: "30000000-0000-4000-8000-000000000001",
        organizationId: "30000000-0000-4000-8000-000000000002",
        analysisId: "30000000-0000-4000-8000-000000000003",
        jobId: "30000000-0000-4000-8000-000000000004",
        parentVersionId: null,
        locale: "en-IN",
        domain: "software-engineering",
      },
    );
    const duration = jd.relations.clauses.find(
      (clause) => clause.duration.kind === "at_least",
    )?.duration;
    expect(duration).toBeDefined();
    expect(
      evaluateRequirementDuration({
        subjectId: "skill:python",
        intervals: [interval("2020-01-01", "2023-01-01")],
        requirement: duration,
      }).state,
    ).toBe("satisfied");
  });
  it("rejects foreign subjects instead of pooling their time", () => {
    expect(() =>
      evaluate([interval("2020-01-01", "2022-01-01", "skill:java")]),
    ).toThrow("REQUIREMENT_DURATION_INPUT_INVALID");
  });
  it.each([
    "2021",
    "Present",
    "2021-02-29",
    "1900-02-29",
    "0000-01-01",
    "2021-1-01",
    " 2021-01-01",
    "2021-01-01T00:00:00Z",
  ])("rejects invalid or imprecise endpoint %s", (date) => {
    expect(() => evaluate([interval(date, "2022-01-01")])).toThrow(
      "REQUIREMENT_DURATION_INPUT_INVALID",
    );
  });
  it("rejects reversed dates and unsupported request fields", () => {
    expect(() => evaluate([interval("2022-01-02", "2022-01-01")])).toThrow(
      "REQUIREMENT_DURATION_INPUT_INVALID",
    );
    expect(() =>
      evaluateRequirementDuration({
        subjectId: "skill:python",
        intervals: [],
        requirement: requirement("at_least"),
        approved: true,
      }),
    ).toThrow("REQUIREMENT_DURATION_INPUT_INVALID");
  });
  it("enforces interval and integer-year bounds before expansion", () => {
    expect(
      evaluate(
        Array.from({ length: 256 }, () => interval("2020-01-01", "2022-01-01")),
      ).durationDays,
    ).toEqual({ minimum: 731, maximum: 732 });
    expect(() =>
      evaluate(
        Array.from({ length: 257 }, () => interval("2020-01-01", "2022-01-01")),
      ),
    ).toThrow("REQUIREMENT_DURATION_INPUT_INVALID");
    for (const years of [-1, 101, 1.5])
      expect(() => calendarYearDayBand(years)).toThrow(
        "REQUIREMENT_DURATION_INPUT_INVALID",
      );
  });
  it("rejects internally contradictory JD bounds", () => {
    const wrong = requirement("at_least");
    wrong.lower!.inclusive = false;
    expect(() =>
      evaluateRequirementDuration({
        subjectId: "skill:python",
        intervals: [],
        requirement: wrong,
      }),
    ).toThrow("REQUIREMENT_DURATION_INPUT_INVALID");
    expect(() =>
      evaluate([interval("2020-01-01", "2022-01-01")], "range", 4, 2),
    ).toThrow("REQUIREMENT_DURATION_INPUT_INVALID");
  });
  it("is deterministic and never grants scoring authority", () => {
    const ranges = [
      interval("2020-01-01", "2021-01-01"),
      interval("2021-01-01", "2022-01-01"),
    ];
    expect(evaluate(ranges)).toEqual(evaluate([...ranges].reverse()));
    expect(evaluate(ranges).scoringEligible).toBe(false);
    expect(evaluate(ranges).policyVersion).toBe(
      REQUIREMENT_DURATION_POLICY.version,
    );
    expect(evaluate(ranges).policySha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
