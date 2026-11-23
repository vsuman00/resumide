import { randomUUID, createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";
import { parseJobRequirements } from "../../app/lib/server/job-requirements";
import {
  buildScoreDiagnostics,
  confirmedExperienceMonths,
  normalizeWeightedRules,
} from "../../app/lib/server/score-v2-engine";
describe("AA4 deterministic diagnostics", () => {
  it("does not satisfy a subject-specific degree with an unrelated degree", () => {
    const input = scoreFixture(
      SCORE_SOURCE.replace(
        "Education: Bachelor",
        "Education: Bachelor in Fine Arts",
      ),
    );
    input.requirements = parseJobRequirements(
      "Bachelor in Computer Science required",
      input.requirements,
    );
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (item) => item.type === "education",
      )?.proposedState,
    ).toBe("not_evaluated");
  });
  it("does not reuse general software tenure for skill-specific experience", () => {
    const input = scoreFixture();
    input.requirements = parseJobRequirements(
      "3 years Python experience required",
      input.requirements,
    );
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (item) => item.type === "experience",
      )?.proposedState,
    ).toBe("not_evaluated");
  });
  it("treats terminal punctuation as formatting in an exact certification requirement", () => {
    const input = scoreFixture();
    input.requirements = parseJobRequirements(
      "AWS certification required.",
      input.requirements,
    );
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (item) => item.type === "certification",
      )?.proposedState,
    ).toBe("satisfied");
  });
  it("withholds all numeric dimensions even after owner confirmations", () => {
    const input = scoreFixture(),
      r = buildScoreDiagnostics(input);
    expect(r.score.state).toBe("withheld");
    expect(
      r.score.dimensions.every(
        (d) => d.value === null && !d.eligible && d.coverage === null,
      ),
    ).toBe(true);
    expect(r.readiness.blockers).toContain("calibration_not_approved");
    expect(r.readiness.confirmedFactCount).toBeGreaterThan(0);
    expect(r.readinessAggregate).toBeNull();
    expect(r.improvements.length).toBeLessThanOrEqual(5);
    expect(buildScoreDiagnostics(input)).toEqual(r);
  });
  it("reports missing declared pages and JD without merit zero", () => {
    const input = scoreFixture(),
      r = buildScoreDiagnostics({
        ...input,
        requirements: null,
        expectedPageCount: 2,
      });
    expect(r.readiness.observedPageCoverage).toBe(0.5);
    expect(r.readiness.blockers).toEqual(
      expect.arrayContaining([
        "critical_evidence_missing",
        "job_description_missing",
      ]),
    );
    expect(r.alignment).toEqual([]);
    expect(r.score.dimensions.every((d) => d.value === null)).toBe(true);
  });
  it.each([
    "owner",
    "canonical",
    "requirements",
    "source",
    "fact",
    "promotion",
    "model",
  ])("rejects %s tampering", (kind) => {
    const input = scoreFixture();
    if (kind === "owner") input.canonical.ownerId = randomUUID();
    if (kind === "canonical")
      input.canonical.sourceEvidenceVersionId = randomUUID();
    if (kind === "requirements") input.requirements.analysisId = randomUUID();
    if (kind === "source") input.canonical.inputSha256 = "b".repeat(64);
    if (kind === "fact")
      input.canonical.facts[0].value = "Invented source fact";
    if (kind === "promotion")
      input.canonical.facts[0] = {
        ...input.canonical.facts[0],
        state: "source_supported",
        confirmation: null,
      };
    expect(() =>
      buildScoreDiagnostics(
        kind === "model"
          ? ({ ...input, llmScore: 100 } as unknown as Parameters<
              typeof buildScoreDiagnostics
            >[0])
          : input,
      ),
    ).toThrow();
  });
  it("unions overlapping dated roles and refuses ambiguous or reversed ranges", () => {
    const input = scoreFixture();
    expect(confirmedExperienceMonths(input.canonical)).toBe(36);
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (a) => a.type === "experience",
      ),
    ).toMatchObject({ state: "not_evaluated", proposedState: "satisfied" });
    const d = input.canonical.facts.find(
      (f) =>
        f.type === "dates" &&
        f.value.startsWith("2020-") &&
        input.canonical.sections.some((s) =>
          s.entries.some((e) => e.factIds.includes(f.id)),
        ),
    )!;
    d.value = "2020 - 2022";
    expect(confirmedExperienceMonths(input.canonical)).toBeNull();
    d.value = "2022-01-01 - 2020-01-01";
    expect(confirmedExperienceMonths(input.canonical)).toBeNull();
    d.value = "2020-02-30 - 2022-01-01";
    expect(confirmedExperienceMonths(input.canonical)).toBeNull();
  });
  it("keeps negation, unknown importance, credential and skill evidence distinct", () => {
    const r = buildScoreDiagnostics(scoreFixture());
    expect(r.alignment.find((a) => a.type === "authorization")).toMatchObject({
      state: "not_evaluated",
      proposedState: "not_evaluated",
    });
    expect(r.alignment.find((a) => a.type === "education")).toMatchObject({
      state: "not_evaluated",
      proposedState: "satisfied",
    });
    expect(r.alignment.find((a) => a.value === "SQL")).toMatchObject({
      proposedState: "candidate_confirmation_required",
    });
    expect(r.alignment.find((a) => a.value === "Python")).toMatchObject({
      importance: "unknown",
      proposedState: "not_evaluated",
    });
  });
  it("withholds observations outside the policy domain or locale", () => {
    const input = scoreFixture();
    input.requirements.domain = "civil-engineering";
    const r = buildScoreDiagnostics(input);
    expect(r.readiness.state).toBe("unsupported");
    expect(r.alignment.every((a) => a.proposedState === "not_evaluated")).toBe(
      true,
    );
    input.requirements.domain = "software-engineering";
    input.canonical.locale = "fr-FR";
    expect(buildScoreDiagnostics(input).readiness.state).toBe("unsupported");
  });
  it("groups repeated clauses without trusting supplied dedup groups", () => {
    const input = scoreFixture(),
      r = input.requirements.requirements.find((a) => a.value === "SQL")!;
    input.requirements.sourceText += "\nSQL required";
    const start = Array.from(input.requirements.sourceText).length - 12;
    input.requirements.requirements.push({
      ...structuredClone(r),
      id: randomUUID(),
      dedupGroup: "different-untrusted-group",
      evidence: {
        spanId: "extra",
        start,
        end: start + 12,
        quote: "SQL required",
      },
      importanceEvidence: { start, end: start + 12, quote: "SQL required" },
    });
    // A changed source hash must be explicitly rebound, never silently corrected.
    expect(() => buildScoreDiagnostics(input)).toThrow();
    input.requirements.inputSha256 = createHash("sha256")
      .update(input.requirements.sourceText)
      .digest("hex");
    // The repeated clause is now bound to its changed source; it still counts once.
    const grouped = buildScoreDiagnostics(input).alignment.find(
      (a) => a.value === "SQL",
    )!;
    expect(grouped.sourceRequirementIds).toHaveLength(2);
    expect(grouped.proposedState).toBe("candidate_confirmation_required");
  });
  it("does not infer absent qualifications from unrecovered or aliased words", () => {
    const input = scoreFixture();
    input.canonical.facts = input.canonical.facts.filter(
      (f) => f.type !== "education",
    );
    input.canonical.sections = input.canonical.sections.filter(
      (s) => s.type !== "education",
    );
    const r = buildScoreDiagnostics(input);
    expect(r.alignment.find((a) => a.type === "education")?.proposedState).toBe(
      "not_evaluated",
    );
  });
});
describe("AA0 arithmetic golden cases", () => {
  const base = [
    {
      state: "pass",
      weight: 40,
      credit: 1,
      critical: false,
      applicabilityReason: null,
    },
    {
      state: "partial",
      weight: 40,
      credit: 0.5,
      critical: false,
      applicabilityReason: null,
    },
    {
      state: "fail",
      weight: 20,
      credit: 0,
      critical: false,
      applicabilityReason: null,
    },
  ];
  it("reproduces 60, 75 with 80% coverage, and justified inapplicability", () => {
    expect(normalizeWeightedRules(base)).toMatchObject({
      internalValue: 60,
      coverage: 1,
    });
    expect(
      normalizeWeightedRules([
        ...base.slice(0, 2),
        { ...base[2], state: "not_evaluated", credit: null, critical: true },
      ]),
    ).toMatchObject({
      internalValue: 75,
      coverage: 0.8,
      criticalUnknown: true,
    });
    expect(
      normalizeWeightedRules([
        ...base.slice(0, 2),
        {
          ...base[2],
          state: "not_applicable",
          credit: null,
          applicabilityReason: "No applicable input",
        },
      ]),
    ).toMatchObject({ internalValue: 75, coverage: 1 });
  });
  it("returns null for zero denominators and rejects inconsistent states", () => {
    expect(normalizeWeightedRules([])).toMatchObject({
      internalValue: null,
      coverage: null,
    });
    expect(() =>
      normalizeWeightedRules([
        { ...base[0], state: "not_applicable", credit: null },
      ]),
    ).toThrow();
    expect(() =>
      normalizeWeightedRules([{ ...base[0], credit: 0.5 }]),
    ).toThrow();
    expect(() => normalizeWeightedRules([{ ...base[0], weight: 0 }])).toThrow();
    expect(() =>
      normalizeWeightedRules([
        { ...base[0], state: "not_evaluated", credit: 1 },
      ]),
    ).toThrow();
  });
});
