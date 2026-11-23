import { createHash } from "node:crypto";
import { z } from "zod";
import type { JobRequirementRelations } from "./job-requirement-admission";

type DateParts = { year: number; month: number; day: number };
type DayBand = Readonly<{ minimum: number; maximum: number }>;
type State = "satisfied" | "not_satisfied" | "unknown";
type JdDuration =
  JobRequirementRelations["relations"]["clauses"][number]["duration"];
const MAX_INTERVALS = 256;
const invalid = (): never => {
  throw new Error("REQUIREMENT_DURATION_INPUT_INVALID");
};
const leap = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const beforeMonth = [
  0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
] as const;
function ordinal({ year, month, day }: DateParts) {
  const prior = year - 1;
  return (
    365 * prior +
    Math.floor(prior / 4) -
    Math.floor(prior / 100) +
    Math.floor(prior / 400) +
    beforeMonth[month - 1] +
    (month > 2 && leap(year) ? 1 : 0) +
    day -
    1
  );
}
function dateParts(value: string): DateParts {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u.exec(value);
  if (!match) return invalid();
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const days =
    month === 2
      ? leap(year)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days)
    return invalid();
  return { year, month, day };
}
function anniversary(start: DateParts, years: number): DayBand {
  const year = start.year + years;
  if (start.month === 2 && start.day === 29 && !leap(year)) {
    return {
      minimum: ordinal({ year, month: 2, day: 28 }) - ordinal(start),
      maximum: ordinal({ year, month: 3, day: 1 }) - ordinal(start),
    };
  }
  const days = ordinal({ ...start, year }) - ordinal(start);
  return { minimum: days, maximum: days };
}
// For a fixed year pair, the anniversary day difference changes only across
// February's leap boundary. Jan1 and Mar1 cover both classes; Feb29's two
// non-leap anniversary conventions lie within the same extrema. All 400 start
// years exhaust the Gregorian cycle, including non-leap century boundaries.
const calendarBands: readonly DayBand[] = Object.freeze(
  Array.from({ length: 101 }, (_, years) => {
    let minimum = Infinity,
      maximum = -Infinity;
    for (let year = 1; year <= 400; year++)
      for (const month of [1, 3]) {
        const days =
          ordinal({ year: year + years, month, day: 1 }) -
          ordinal({ year, month, day: 1 });
        minimum = Math.min(minimum, days);
        maximum = Math.max(maximum, days);
      }
    return Object.freeze({ minimum, maximum });
  }),
);
export const REQUIREMENT_DURATION_POLICY = Object.freeze({
  version: "requirement-duration/1.0.0" as const,
  dateGrammar: "gregorian-0001-9999-full-iso-date/1.0.0",
  subject: "exact-same-subject-only",
  endpoint: "to-exclusive-lower-to-inclusive-upper",
  union: "half-open-overlap-and-touching-union",
  continuous: "own-anniversary-feb29-feb28-or-mar1",
  cumulative: "all400-startyears-jan1-mar1-exact-calendar-bands",
  comparison: "universal-bounds-three-valued",
  maxIntervals: MAX_INTERVALS,
  maxYears: 100,
  calendarBands,
});
const POLICY_SHA256 = createHash("sha256")
  .update(JSON.stringify(REQUIREMENT_DURATION_POLICY))
  .digest("hex");
export function calendarYearDayBand(years: number): DayBand {
  if (!Number.isInteger(years) || years < 0 || years > 100) return invalid();
  return calendarBands[years];
}
const evidence = z
  .strictObject({
    spanId: z.string().min(1).max(100),
    start: z.number().int().min(0).max(20_000),
    end: z.number().int().min(1).max(20_000),
    quote: z.string().min(1).max(2000),
  })
  .refine((v) => v.end > v.start);
const bound = z.strictObject({
  value: z.number().int().min(0).max(100),
  inclusive: z.boolean(),
  evidence,
});
const durationSchema = z.strictObject({
  kind: z.enum([
    "range",
    "at_least",
    "more_than",
    "at_most",
    "less_than",
    "exactly",
    "unknown",
    "not_stated",
  ]),
  evidence: evidence.nullable(),
  lower: bound.nullable(),
  upper: bound.nullable(),
  operatorEvidence: z.array(evidence).max(3),
  candidateEvidence: z.array(evidence).max(8),
  reason: z.string().min(1).max(100).nullable(),
  subjectBinding: z.literal("literal_clause_only"),
  evaluated: z.literal(false),
});
const subjectId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u);
const inputSchema = z.strictObject({
  subjectId,
  intervals: z
    .array(
      z.strictObject({
        subjectId,
        start: z.string().length(10),
        end: z.string().length(10),
      }),
    )
    .max(MAX_INTERVALS),
  requirement: durationSchema,
});
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parse(raw: unknown) {
  // Reject unbounded arrays before Zod traverses their elements. This function
  // is internal arithmetic, not authentication of caller-declared intervals.
  if (
    !record(raw) ||
    !Array.isArray(raw.intervals) ||
    raw.intervals.length > MAX_INTERVALS ||
    !record(raw.requirement) ||
    !Array.isArray(raw.requirement.operatorEvidence) ||
    raw.requirement.operatorEvidence.length > 3 ||
    !Array.isArray(raw.requirement.candidateEvidence) ||
    raw.requirement.candidateEvidence.length > 8
  )
    return invalid();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data,
    d: JdDuration = input.requirement;
  if (input.intervals.some((i) => i.subjectId !== input.subjectId))
    return invalid();
  switch (d.kind) {
    case "at_least":
    case "more_than":
      if (
        !d.lower ||
        d.upper !== null ||
        d.lower.inclusive !== (d.kind === "at_least")
      )
        return invalid();
      break;
    case "at_most":
    case "less_than":
      if (
        !d.upper ||
        d.lower !== null ||
        d.upper.inclusive !== (d.kind === "at_most")
      )
        return invalid();
      break;
    case "exactly":
      if (
        !d.lower ||
        !d.upper ||
        d.lower.value !== d.upper.value ||
        !d.lower.inclusive ||
        !d.upper.inclusive
      )
        return invalid();
      break;
    case "range":
      if (
        !d.lower ||
        !d.upper ||
        d.lower.value > d.upper.value ||
        (d.lower.value === d.upper.value &&
          (!d.lower.inclusive || !d.upper.inclusive))
      )
        return invalid();
      break;
    default:
      if (d.lower !== null || d.upper !== null) return invalid();
  }
  return input;
}
type Range = { start: number; end: number; anchor: DateParts };
function union(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of [...ranges].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    if (range.end === range.start) continue;
    const prior = merged.at(-1);
    if (prior && range.start <= prior.end)
      prior.end = Math.max(prior.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
function compare(
  days: DayBand,
  threshold: DayBand,
  side: "lower" | "upper",
  inclusive: boolean,
): State {
  if (side === "lower") {
    if (
      inclusive
        ? days.minimum >= threshold.maximum
        : days.minimum > threshold.maximum
    )
      return "satisfied";
    if (
      inclusive
        ? days.maximum < threshold.minimum
        : days.maximum <= threshold.minimum
    )
      return "not_satisfied";
  } else {
    if (
      inclusive
        ? days.maximum <= threshold.minimum
        : days.maximum < threshold.minimum
    )
      return "satisfied";
    if (
      inclusive
        ? days.minimum > threshold.maximum
        : days.minimum >= threshold.maximum
    )
      return "not_satisfied";
  }
  return "unknown";
}
export type RequirementDurationComparison = {
  side: "lower" | "upper";
  years: number;
  inclusive: boolean;
  thresholdDays: DayBand;
  state: State;
};
export type RequirementDurationResult = {
  schemaVersion: "requirement-duration-result/1.0.0";
  policyVersion: typeof REQUIREMENT_DURATION_POLICY.version;
  policySha256: string;
  subjectId: string;
  scoringEligible: false;
  state: State;
  reason:
    | "comparison_decisive"
    | "endpoint_or_calendar_ambiguity"
    | "requirement_duration_unknown"
    | "requirement_duration_not_stated"
    | "no_intervals";
  durationDays: DayBand;
  unionComponents: { exclusiveEnd: number; inclusiveEnd: number };
  basis:
    "none" | "continuous_calendar_anniversary" | "cumulative_calendar_band";
  comparisons: RequirementDurationComparison[];
};
/** Pure comparison of supplied same-subject intervals. It grants no source,
 * ownership, FTE, proficiency, calibrated score or hiring authority. */
export function evaluateRequirementDuration(
  raw: unknown,
): RequirementDurationResult {
  const input = parse(raw);
  const ranges = input.intervals.map((i) => {
    const anchor = dateParts(i.start),
      start = ordinal(anchor),
      end = ordinal(dateParts(i.end));
    if (end < start) return invalid();
    return { start, end, anchor };
  });
  const low = union(ranges),
    high = union(ranges.map((r) => ({ ...r, end: r.end + 1 })));
  const durationDays = {
    minimum: low.reduce((n, r) => n + r.end - r.start, 0),
    maximum: high.reduce((n, r) => n + r.end - r.start, 0),
  };
  const continuous =
    low.length === 1 && high.length === 1 && low[0].start === high[0].start;
  const basis =
    ranges.length === 0
      ? "none"
      : continuous
        ? "continuous_calendar_anniversary"
        : "cumulative_calendar_band";
  const comparisons: RequirementDurationComparison[] = [];
  const result = (
    state: State,
    reason: RequirementDurationResult["reason"],
  ): RequirementDurationResult => ({
    schemaVersion: "requirement-duration-result/1.0.0",
    policyVersion: REQUIREMENT_DURATION_POLICY.version,
    policySha256: POLICY_SHA256,
    subjectId: input.subjectId,
    scoringEligible: false,
    state,
    reason,
    durationDays,
    unionComponents: { exclusiveEnd: low.length, inclusiveEnd: high.length },
    basis,
    comparisons,
  });
  if (input.requirement.kind === "unknown")
    return result("unknown", "requirement_duration_unknown");
  if (input.requirement.kind === "not_stated")
    return result("unknown", "requirement_duration_not_stated");
  if (ranges.length === 0) return result("unknown", "no_intervals");
  for (const side of ["lower", "upper"] as const) {
    const b = input.requirement[side];
    if (!b) continue;
    const thresholdDays = continuous
      ? anniversary(low[0].anchor, b.value)
      : calendarYearDayBand(b.value);
    comparisons.push({
      side,
      years: b.value,
      inclusive: b.inclusive,
      thresholdDays,
      state: compare(durationDays, thresholdDays, side, b.inclusive),
    });
  }
  const state = comparisons.some((c) => c.state === "not_satisfied")
    ? "not_satisfied"
    : comparisons.every((c) => c.state === "satisfied")
      ? "satisfied"
      : "unknown";
  return result(
    state,
    state === "unknown"
      ? "endpoint_or_calendar_ambiguity"
      : "comparison_decisive",
  );
}
