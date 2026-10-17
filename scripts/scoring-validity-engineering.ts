import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { scoreFixture, SCORE_SOURCE } from "../tests/fixtures/scoring-v2";
import {
  buildScoreDiagnostics,
  confirmedExperienceMonths,
  normalizeWeightedRules,
} from "../app/lib/server/score-v2-engine";
import { parseJobRequirements } from "../app/lib/server/job-requirements";
import { groundQualitativeProse } from "../app/lib/server/qualitative-prose";
export function scoringEngineeringBenchmark() {
  const base = scoreFixture();
  const semantic = (input: Parameters<typeof buildScoreDiagnostics>[0]) => {
    const r = buildScoreDiagnostics(input);
    return {
      dimensions: r.score.dimensions,
      blockers: r.readiness.blockers,
      coverage: r.readiness.observedPageCoverage,
      strengths: r.strengths,
      rules: r.rules.map(({ id, state, credit, reason }) => ({
        id,
        state,
        credit,
        reason,
      })),
      alignment: r.alignment.map(
        ({ type, value, importance, state, proposedState, reason }) => ({
          type,
          value,
          importance,
          state,
          proposedState,
          reason,
        }),
      ),
    };
  };
  const replaceJD = (input: typeof base, text: string) => {
    input.requirements = parseJobRequirements(text, {
      ownerId: input.canonical.ownerId,
      organizationId: input.canonical.organizationId,
      analysisId: input.canonical.analysisId,
      jobId: input.requirements.jobId,
    });
    input.requirements.createdAt = base.requirements.createdAt;
    return input;
  };
  const repeated = replaceJD(
    scoreFixture(),
    base.requirements.sourceText + "\nSQL required\nSQL required",
  );
  const stuffed = scoreFixture(SCORE_SOURCE + "\nSQL\nSQL\nSQL");
  const names = [
    "Aisha Fictional",
    "Arjun Fictional",
    "Zoë Fictional",
    "Wei Fictional",
  ];
  const counterfactuals = names.map((name) =>
    scoreFixture(SCORE_SOURCE.replace("Fictional Person", name)),
  );
  const incomplete = { ...base, expectedPageCount: 2 };
  const missingJD = { ...base, requirements: null };
  const cases = [
    { segment: "source_bound_full_dates", input: base },
    { segment: "repeated_jd", input: repeated },
    { segment: "skill_stuffing", input: stuffed },
    { segment: "incomplete_pages", input: incomplete },
    { segment: "missing_jd", input: missingJD },
    ...counterfactuals.map((input, i) => ({
      segment: `synthetic_name_${i + 1}`,
      input,
    })),
  ];
  const segments = cases.map(({ segment, input }) => {
    const first = buildScoreDiagnostics(input),
      durations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      assert.deepEqual(buildScoreDiagnostics(input), first);
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    assert.ok(
      first.score.dimensions.every((d) => d.value === null && !d.eligible),
    );
    return {
      segment,
      repetitions: 20,
      deterministic: true,
      numericValuesWithheld: true,
      technicalRuleCount: first.rules.length,
      groupedRequirementCount: first.alignment.length,
      inputFingerprint: first.score.inputSha256,
      semanticFingerprint: createHash("sha256")
        .update(JSON.stringify(semantic(input)))
        .digest("hex"),
      latencyP95Ms: durations[18],
    };
  });
  for (const input of counterfactuals)
    assert.deepEqual(semantic(input), semantic(base));
  assert.deepEqual(semantic(repeated), semantic(base));
  assert.deepEqual(semantic(stuffed).dimensions, semantic(base).dimensions);
  assert.deepEqual(semantic(stuffed).alignment, semantic(base).alignment);
  for (const rule of semantic(stuffed).rules) {
    const original = semantic(base).rules.find((r) => r.id === rule.id)!;
    if (rule.credit !== null && original.credit !== null)
      assert.ok(
        rule.credit <= original.credit,
        "Stuffing improved a technical rule",
      );
  }
  assert.equal(
    buildScoreDiagnostics(repeated).alignment.find((a) => a.value === "SQL")!
      .sourceRequirementIds.length,
    3,
  );
  assert.equal(confirmedExperienceMonths(base.canonical), 36);
  assert.equal(
    buildScoreDiagnostics(incomplete).readiness.observedPageCoverage,
    0.5,
  );
  assert.ok(
    buildScoreDiagnostics(missingJD).readiness.blockers.includes(
      "job_description_missing",
    ),
  );
  assert.throws(() =>
    buildScoreDiagnostics({ ...base, modelScore: 100 } as Parameters<
      typeof buildScoreDiagnostics
    >[0]),
  );
  const category = {
    tips: [
      { type: "good", tip: "Good", explanation: "Observed", quote: "SQL" },
    ],
  };
  const prose = {
    toneAndStyle: category,
    content: category,
    structure: category,
    skills: category,
    writer: { summary: null, bullets: [] },
  };
  assert.throws(() =>
    groundQualitativeProse({ ...prose, score: 100 }, SCORE_SOURCE),
  );
  const bullet = {
    id: randomUUID(),
    text: "Built reliable services",
    factIds: [],
  };
  const duplicate = structuredClone(base);
  for (const section of duplicate.canonical.sections)
    for (const entry of section.entries) entry.bullets = [];
  duplicate.canonical.sections.find(
    (s) => s.type === "experience",
  )!.entries[0].bullets = [bullet, { ...bullet, id: randomUUID() }];
  assert.equal(
    buildScoreDiagnostics(duplicate).rules.find(
      (r) => r.id === "content.duplication",
    )!.credit,
    0.5,
  );
  const math = [
    {
      state: "pass",
      credit: 1,
      weight: 40,
      critical: false,
      applicabilityReason: null,
    },
    {
      state: "partial",
      credit: 0.5,
      weight: 40,
      critical: false,
      applicabilityReason: null,
    },
    {
      state: "fail",
      credit: 0,
      weight: 20,
      critical: false,
      applicabilityReason: null,
    },
  ];
  assert.equal(normalizeWeightedRules(math).internalValue, 60);
  return {
    schemaVersion: "scoring-validity-engineering/1.0.0",
    scope: "known synthetic engineering only",
    engineVersion: "score-v2/1.0.1",
    policyId: "software-engineering-en-IN/draft-1.0.0",
    engineeringPassed: true,
    releasePassed: false,
    segments,
    invariance: {
      syntheticNames: 4,
      repeatedRequirements: true,
      skillStuffing: true,
      duplicateBulletCredit: 0.5,
      promptInjectionRejected: true,
      overlappedMonths: 36,
    },
    measurementMethods: [
      "tie-aware Spearman",
      "seeded case bootstrap percentile interval",
      "MAE",
      "RMSE",
      "coverage and error by segment",
    ],
    expertAgreement: null,
    representativeFairnessError: null,
    comprehensionReview: null,
    authoritativeScoreAccuracy: null,
    providerCalls: 0,
    providerCostUsd: 0,
    releaseBlockers: [
      "AA1 locked critical field accuracy failed",
      "AA3 domain and representative corpus acceptance open",
      "No approved scoring weights or coverage policy",
      "No reviewed expert ratings or bootstrap agreement estimates",
      "No representative fairness/error or comprehension review",
    ],
    fixtureManifestSha256: createHash("sha256")
      .update(
        SCORE_SOURCE + base.requirements.sourceText + JSON.stringify(names),
      )
      .digest("hex"),
  };
}
