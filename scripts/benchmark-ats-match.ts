// Corpus metrics for the requirement matcher against the legacy matcher (ATS-01).
// Synthetic fixtures only. Writes one JSON report to stdout.
import { readFileSync } from "node:fs";
import { matchJobDescription } from "../app/lib/server/matching";
import { normalizeTerm } from "../app/lib/server/matching/normalize";
import { matchRequirements } from "../app/lib/server/matching/requirements";

interface Fixture {
  id: string;
  category: "strong" | "partial" | "poor";
  jobDescription: string;
  resumeText: string;
  expectedMet: string[];
  expectedMissing: string[];
  requiredCoverage: [number, number];
}
const corpus = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/ats-match/corpus.json", import.meta.url),
    "utf8",
  ),
) as { fixtures: Fixture[] };
const key = (text: string) => normalizeTerm(text.replace(/'s\b/g, ""));
const has = (list: string[], wanted: string) =>
  list.some((item) => key(item) === key(wanted));

export function scoreFixture(f: Fixture) {
  const v2 = matchRequirements({
    jobDescription: f.jobDescription,
    resumeText: f.resumeText,
  }).requirements;
  const legacy = matchJobDescription({
    jobDescription: f.jobDescription,
    resumeText: f.resumeText,
  });
  const required = v2.filter(
    (r) => r.importance === "required" && r.state !== "not_evaluated",
  );
  const coverage = required.length
    ? required.filter((r) => r.state !== "missing").length / required.length
    : null;
  const legacyCoverage = legacy.terms.length
    ? legacy.matched.length / legacy.terms.length
    : null;
  const v2Met = v2.filter((r) => r.state !== "missing").map((r) => r.phrase);
  const v2Missing = v2
    .filter((r) => r.state === "missing")
    .map((r) => r.phrase);
  const hit = (found: string[], expected: string[]) =>
    expected.filter((e) => has(found, e));
  return {
    id: f.id,
    category: f.category,
    requiredCoverage: coverage,
    legacyCoverage,
    metRecall: f.expectedMet.length
      ? hit(v2Met, f.expectedMet).length / f.expectedMet.length
      : 1,
    missingRecall: f.expectedMissing.length
      ? hit(v2Missing, f.expectedMissing).length / f.expectedMissing.length
      : 1,
    legacyMetRecall: f.expectedMet.length
      ? hit(legacy.matched, f.expectedMet).length / f.expectedMet.length
      : 1,
    notFoundMet: f.expectedMet.filter((e) => !has(v2Met, e)),
    notFoundMissing: f.expectedMissing.filter((e) => !has(v2Missing, e)),
    inBand:
      coverage === null
        ? false
        : coverage >= f.requiredCoverage[0] &&
          coverage <= f.requiredCoverage[1],
    legacyInBand:
      legacyCoverage === null
        ? false
        : legacyCoverage >= f.requiredCoverage[0] &&
          legacyCoverage <= f.requiredCoverage[1],
    requirementCount: v2.length,
    legacyTermCount: legacy.terms.length,
  };
}
if (!process.env.VITEST) {
  const rows = corpus.fixtures.map(scoreFixture);
  const mean = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((s, r) => s + pick(r), 0) / rows.length;
  console.log(
    JSON.stringify(
      {
        corpus: corpus.fixtures.length,
        v2: {
          metRecall: mean((r) => r.metRecall),
          missingRecall: mean((r) => r.missingRecall),
          inBand: rows.filter((r) => r.inBand).length,
        },
        legacy: {
          metRecall: mean((r) => r.legacyMetRecall),
          inBand: rows.filter((r) => r.legacyInBand).length,
        },
        rows,
      },
      null,
      1,
    ),
  );
}
