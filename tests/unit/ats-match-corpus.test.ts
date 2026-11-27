import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreFixture } from "../../scripts/benchmark-ats-match";

const corpus = JSON.parse(
  readFileSync(
    new URL("../fixtures/ats-match/corpus.json", import.meta.url),
    "utf8",
  ),
) as {
  fixtures: Parameters<typeof scoreFixture>[0][];
};
describe("ATS match corpus (ATS-01, ATS-05 thresholds)", () => {
  const rows = corpus.fixtures.map(scoreFixture);
  it("has at least 12 labelled pairs across the three match levels", () => {
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const category of ["strong", "partial", "poor"])
      expect(rows.some((r) => r.category === category)).toBe(true);
  });
  it.each(rows.map((r) => [r.id, r] as const))(
    "%s lands in its labelled coverage band",
    (_, row) => {
      expect(
        row.inBand,
        JSON.stringify({
          cov: row.requiredCoverage,
          notMet: row.notFoundMet,
          notMissing: row.notFoundMissing,
        }),
      ).toBe(true);
    },
  );
  it("meets the proposed recall thresholds", () => {
    const mean = (pick: (r: (typeof rows)[number]) => number) =>
      rows.reduce((s, r) => s + pick(r), 0) / rows.length;
    expect(mean((r) => r.metRecall)).toBeGreaterThanOrEqual(0.9);
    expect(mean((r) => r.missingRecall)).toBeGreaterThanOrEqual(0.85);
  });
  it("beats the legacy matcher on met-requirement recall and band accuracy", () => {
    const mean = (pick: (r: (typeof rows)[number]) => number) =>
      rows.reduce((s, r) => s + pick(r), 0) / rows.length;
    expect(mean((r) => r.metRecall)).toBeGreaterThan(
      mean((r) => r.legacyMetRecall),
    );
    expect(rows.filter((r) => r.inBand).length).toBeGreaterThan(
      rows.filter((r) => r.legacyInBand).length,
    );
  });
});
