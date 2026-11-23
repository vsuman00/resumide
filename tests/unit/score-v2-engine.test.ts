import { randomUUID, createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";
import { parseJobRequirements } from "../../app/lib/server/job-requirements";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import {
  getDraftScorePolicy,
  WithheldScoreV2Schema,
} from "../../app/lib/server/score-v2-contract";
import {
  buildScoreDiagnostics,
  confirmedExperienceMonths,
  normalizeWeightedRules,
} from "../../app/lib/server/score-v2-engine";
describe("AA4 deterministic diagnostics", () => {
  it("records an edited and confirmed certification declaration without inventing source evidence", () => {
    const input = scoreFixture();
    const fact = input.canonical.facts.find(
      (item) => item.type === "certification",
    )!;
    input.canonical = reviseCanonical(input.canonical, {
      operation: "edit",
      factId: fact.id,
      value: "Azure",
    });
    input.canonical = reviseCanonical(input.canonical, {
      operation: "confirm",
      factId: fact.id,
    });
    input.requirements = parseJobRequirements(
      "Azure certification required",
      input.requirements,
    );
    const declared = input.canonical.facts.find((item) => item.id === fact.id)!;
    expect(declared).toMatchObject({
      state: "candidate_confirmed",
      sources: [],
      confirmation: { actorId: input.canonical.ownerId, value: "Azure" },
    });
    const diagnostics = buildScoreDiagnostics(input);
    expect(
      diagnostics.alignment.find((item) => item.type === "certification"),
    ).toMatchObject({
      state: "not_evaluated",
      proposedState: "not_evaluated",
      reason: expect.stringContaining("declaration is recorded"),
      factIds: [fact.id],
    });
    expect(diagnostics.score.state).toBe("withheld");
    expect(
      diagnostics.score.dimensions.every(
        (item) =>
          item.value === null && !item.eligible && item.coverage === null,
      ),
    ).toBe(true);
    expect(diagnostics.readiness.blockers).toContain(
      "calibration_not_approved",
    );
    expect(declared.sources).toEqual([]);
  });
  it.each(["cited", "uncited"])(
    "reviews proficiency for an already declared %s skill without asking for repeated confirmation",
    (source) => {
      const input = scoreFixture();
      const skill = input.canonical.facts.find(
        (item) => item.type === "skill" && item.value === "SQL",
      )!;
      if (source === "uncited") {
        input.canonical = reviseCanonical(input.canonical, {
          operation: "edit",
          factId: skill.id,
          value: skill.value,
        });
        input.canonical = reviseCanonical(input.canonical, {
          operation: "confirm",
          factId: skill.id,
        });
      }
      const diagnostics = buildScoreDiagnostics(input);
      expect(
        diagnostics.alignment.find((item) => item.value === "SQL"),
      ).toMatchObject({
        state: "not_evaluated",
        proposedState: "not_evaluated",
        reason: expect.stringContaining(
          "proficiency and skill-specific duration",
        ),
        factIds: [skill.id],
      });
      expect(
        diagnostics.score.dimensions.every((item) => item.value === null),
      ).toBe(true);
    },
  );
  it.each(["cited", "uncited"])(
    "still requests confirmation for an unconfirmed %s certification",
    (source) => {
      const input = scoreFixture();
      const fact = input.canonical.facts.find(
        (item) => item.type === "certification",
      )!;
      if (source === "uncited")
        input.canonical = reviseCanonical(input.canonical, {
          operation: "edit",
          factId: fact.id,
          value: fact.value,
        });
      else {
        fact.state = "unconfirmed";
        fact.confirmation = null;
      }
      expect(
        buildScoreDiagnostics(input).alignment.find(
          (item) => item.type === "certification",
        ),
      ).toMatchObject({
        state: "not_evaluated",
        proposedState: "candidate_confirmation_required",
      });
    },
  );
  it.each([false, true])(
    "does not merge uncited declaration with a different unconfirmed cited duplicate (reverse=%s)",
    (reverse) => {
      const input = scoreFixture();
      const citedFact = structuredClone(
        input.canonical.facts.find((item) => item.type === "certification")!,
      );
      input.canonical = reviseCanonical(input.canonical, {
        operation: "edit",
        factId: citedFact.id,
        value: citedFact.value,
      });
      input.canonical = reviseCanonical(input.canonical, {
        operation: "confirm",
        factId: citedFact.id,
      });
      citedFact.id = randomUUID();
      citedFact.state = "unconfirmed";
      citedFact.confirmation = null;
      input.canonical.facts.push(citedFact);
      if (reverse) input.canonical.facts.reverse();
      expect(
        buildScoreDiagnostics(input).alignment.find(
          (item) => item.type === "certification",
        ),
      ).toMatchObject({
        proposedState: "not_evaluated",
        reason: expect.stringContaining("no matching source citation"),
        factIds: expect.arrayContaining([citedFact.id]),
      });
    },
  );
  it.each(["actor", "value"])(
    "rejects an invalid exact declaration %s rather than acknowledging it",
    (kind) => {
      const input = scoreFixture();
      const fact = input.canonical.facts.find(
        (item) => item.type === "certification",
      )!;
      if (kind === "actor") fact.confirmation!.actorId = randomUUID();
      else fact.confirmation!.value = "Another certification";
      expect(() => buildScoreDiagnostics(input)).toThrow();
    },
  );
  it("does not use an uncited declared role for date arithmetic", () => {
    const input = scoreFixture();
    const role = input.canonical.facts.find((item) => item.type === "role")!;
    input.canonical = reviseCanonical(input.canonical, {
      operation: "edit",
      factId: role.id,
      value: role.value,
    });
    input.canonical = reviseCanonical(input.canonical, {
      operation: "confirm",
      factId: role.id,
    });
    expect(confirmedExperienceMonths(input.canonical)).toBeNull();
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (item) => item.type === "experience",
      )?.proposedState,
    ).toBe("not_evaluated");
  });
  it("versions regenerated diagnostics while retaining historical withheld readers", () => {
    const input = scoreFixture();
    const first = buildScoreDiagnostics(input);
    expect(first.score.producerVersion).toBe("score-v2/1.0.3");
    expect(buildScoreDiagnostics(input)).toEqual(first);
    for (const producerVersion of [
      "score-v2/preparation-1.0.0",
      "score-v2/1.0.0",
      "score-v2/1.0.1",
      "score-v2/1.0.2",
      "score-v2/1.0.3",
    ])
      expect(
        WithheldScoreV2Schema.safeParse({ ...first.score, producerVersion })
          .success,
      ).toBe(true);
    expect(
      WithheldScoreV2Schema.safeParse({
        ...first.score,
        producerVersion: "score-v2/99.0.0",
      }).success,
    ).toBe(false);
    const fingerprint = (producer: string) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            producer,
            policy: getDraftScorePolicy(),
            evidence: input.evidence,
            canonical: input.canonical,
            requirements: input.requirements,
            expectedPageCount: input.evidence.nativeSource.pages.length,
          }),
        )
        .digest("hex");
    expect(first.score.inputSha256).toBe(fingerprint("score-v2/1.0.3"));
    expect(first.score.inputSha256).not.toBe(fingerprint("score-v2/1.0.2"));
  });
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
  it.each([
    "At most 2 years of professional experience required",
    "More than 3 years of professional experience required",
    "Exactly 2 years of professional experience required",
    "3 years of professional experience maximum required",
    "1.5 years of professional experience required",
    "2 years of professional experience or 4 years of leadership experience required",
    "2 years of hospitality experience required",
  ])("does not infer minimum-only tenure from %s", (clause) => {
    const input = scoreFixture();
    input.requirements = parseJobRequirements(clause, input.requirements);
    expect(confirmedExperienceMonths(input.canonical)).toBe(36);
    const diagnostics = buildScoreDiagnostics(input);
    expect(
      diagnostics.alignment.find((item) => item.type === "experience"),
    ).toMatchObject({
      state: "not_evaluated",
      proposedState: "not_evaluated",
      reason: expect.stringContaining("explicit minimum"),
      factIds: [],
    });
    expect(
      diagnostics.score.dimensions.every((item) => item.value === null),
    ).toBe(true);
  });
  it.each([
    "Must have 3 years experience",
    "At least 3 years of professional experience required",
    "• 3+ years of work experience required",
  ])("retains a minimum-only tenure observation for %s", (clause) => {
    const input = scoreFixture();
    input.requirements = parseJobRequirements(clause, input.requirements);
    expect(
      buildScoreDiagnostics(input).alignment.find(
        (item) => item.type === "experience",
      ),
    ).toMatchObject({ state: "not_evaluated", proposedState: "satisfied" });
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
      proposedState: "not_evaluated",
      reason: expect.stringContaining(
        "proficiency and skill-specific duration",
      ),
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
    expect(grouped.proposedState).toBe("not_evaluated");
    expect(grouped.reason).toContain("proficiency and skill-specific duration");
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
