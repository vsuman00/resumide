import { it, expect } from "vitest";
import { measureScoreAgreement } from "../../app/lib/server/score-v2-validity-metrics";
const rows = [10, 20, 20, 40, 50].map((reference, i) => ({
  caseId: `synthetic-${i}`,
  segment: i < 2 ? "a" : "b",
  predicted: reference,
  reference,
}));
it("measures tie-aware agreement and seeded bootstrap without release approval", () => {
  const r = measureScoreAgreement(rows);
  expect(r.spearman).toBe(1);
  expect(r.meanAbsoluteError).toBe(0);
  expect(r.bootstrap.spearman95PercentileInterval).toEqual([1, 1]);
  expect(r).toEqual(measureScoreAgreement(rows));
  expect(r.releasePassed).toBe(false);
  expect(
    measureScoreAgreement(
      rows.map((r) => ({ ...r, predicted: 100 - r.reference })),
    ).spearman,
  ).toBe(-1);
});
it("reports coverage, per-segment error and undefined correlation separately", () => {
  const r = measureScoreAgreement(
    rows.map((r, i) => ({ ...r, predicted: i < 2 ? null : 20 })),
  );
  expect(r.coverage).toBe(0.6);
  expect(r.spearman).toBeNull();
  expect(r.meanAbsoluteError).toBeCloseTo(50 / 3);
  expect(r.segments[0].meanAbsoluteError).toBeNull();
  expect(r.bootstrap.spearman95PercentileInterval).toBeNull();
  expect(measureScoreAgreement([]).coverage).toBeNull();
});
it("rejects duplicated cases, invalid numeric predictions and forged metric options", () => {
  expect(() => measureScoreAgreement([...rows, rows[0]])).toThrow();
  expect(() =>
    measureScoreAgreement([{ ...rows[0], predicted: 101 }]),
  ).toThrow();
  expect(() => measureScoreAgreement(rows, { approval: true })).toThrow();
});
