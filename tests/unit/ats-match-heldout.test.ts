import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreFixture } from "../../scripts/benchmark-ats-match";

// Held-out set (ATS-16): labels fixed before the first run. If this fails, report it;
// do not retune the matcher against these pairs.
const load = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/ats-match/${name}`, import.meta.url),
        "utf8",
      ),
    ) as { fixtures: Parameters<typeof scoreFixture>[0][] }
  ).fixtures;
const heldout = {
  fixtures: [...load("heldout.json"), ...load("heldout-2.json")],
};

// Known misses, recorded not fixed. `it.fails` turns green-to-red the day one starts passing.
const KNOWN_MISSES = new Set<string>([]);

describe("ATS match held-out pairs", () => {
  const rows = heldout.fixtures.map(scoreFixture);
  for (const row of rows) {
    const run = KNOWN_MISSES.has(row.id) ? it.fails : it;
    run(row.id, () => {
      expect(
        row.inBand,
        JSON.stringify({ cov: row.requiredCoverage, notMet: row.notFoundMet }),
      ).toBe(true);
    });
  }
  it("beats the legacy matcher on band accuracy", () => {
    expect(rows.filter((r) => r.inBand).length).toBeGreaterThan(
      rows.filter((r) => r.legacyInBand).length,
    );
  });
});
