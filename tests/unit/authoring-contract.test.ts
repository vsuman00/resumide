import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";
import {
  buildSuggestion,
  validateSuggestion,
  clarifyValue,
  patternValue,
  AuthoringCommandSchema,
  buildFindings,
  withheldDelta,
} from "../../app/lib/server/authoring-contract";
function fixture() {
  const f = scoreFixture();
  const fact = f.canonical.facts.find(
    (v) => v.type === "contribution" && v.value === "Built reliable services",
  )!;
  f.canonical.sections
    .find((s) => s.type === "experience")!
    .entries[0].bullets.push({
      id: randomUUID(),
      text: fact.value,
      factIds: [fact.id],
    });
  return { ...f, fact };
}
it("does not invent XYZ measurements and offers metric-free alternatives after explicit clarification", () => {
  let text = "Built services";
  text = clarifyValue(text, "result", "Fewer release failures");
  text = clarifyValue(text, "scope", "Internal release process");
  expect(patternValue(text, "xyz").missing).toEqual(["measurement", "method"]);
  expect(patternValue(text, "action_scope_result").value).toContain(
    "Fewer release failures",
  );
  expect(() =>
    clarifyValue(text, "measurement", "10%\nOwnership: invented"),
  ).toThrow();
  expect(
    patternValue(clarifyValue(text, "measurement", "unknown"), "xyz").missing,
  ).toContain("measurement");
});
it("binds patches to exact confirmed facts, entry, section, input version and known reconstruction", () => {
  const f = fixture();
  f.fact.value = clarifyValue(
    clarifyValue(f.fact.value, "result", "Fewer failures"),
    "scope",
    "Internal tool",
  );
  f.fact.sources = [];
  f.fact.confirmation!.value = f.fact.value;
  const d = buildScoreDiagnostics({
      evidence: f.evidence,
      canonical: f.canonical,
      requirements: f.requirements,
    }),
    patch = buildSuggestion(f.canonical, f.fact.id, "action_scope_result", d);
  expect(validateSuggestion(patch, f.canonical, d)).toEqual(patch);
  expect(() =>
    validateSuggestion({ ...patch, sectionId: randomUUID() }, f.canonical, d),
  ).toThrow();
  expect(() =>
    validateSuggestion(
      {
        ...patch,
        operations: [
          {
            ...patch.operations[0],
            value: "Invented AWS credential and 90% gain",
          },
        ],
      },
      f.canonical,
      d,
    ),
  ).toThrow();
  expect(() =>
    validateSuggestion(
      { ...patch, baseVersionId: randomUUID() },
      f.canonical,
      d,
    ),
  ).toThrow();
  expect(() =>
    validateSuggestion(
      { ...patch, documentReplacement: "invented" },
      f.canonical,
      d,
    ),
  ).toThrow();
});
it("candidate confirmation is required and every finding has a target or explicit non-editable reason", () => {
  const f = fixture();
  f.fact.state = "unconfirmed";
  f.fact.confirmation = null;
  const d = buildScoreDiagnostics({
      evidence: f.evidence,
      canonical: f.canonical,
      requirements: f.requirements,
    }),
    p = buildSuggestion(f.canonical, f.fact.id, "xyz", d);
  expect(p.state).toBe("clarification_required");
  expect(() => validateSuggestion(p, f.canonical, d)).toThrow();
  const findings = buildFindings(f.canonical, d);
  expect(findings.top.length).toBeLessThanOrEqual(5);
  expect(
    [...findings.top, ...findings.remaining].every(
      (v) => v.targetFactId || v.nonEditableReason,
    ),
  ).toBe(true);
  expect(
    AuthoringCommandSchema.safeParse({
      action: "edit",
      expectedVersionId: f.canonical.versionId,
      idempotencyKey: randomUUID(),
      targetFactId: f.fact.id,
      value: "Updated",
      ownerId: randomUUID(),
    }).success,
  ).toBe(false);
  expect(
    withheldDelta(f.canonical.versionId, null, d.score.policyId),
  ).toMatchObject({ value: null, delta: null });
});

it("does not allow generated patches outside the current domain/locale boundary", () => {
  const f = fixture();
  f.requirements.domain = "civil-engineering";
  const d = buildScoreDiagnostics({
    evidence: f.evidence,
    canonical: f.canonical,
    requirements: f.requirements,
  });
  expect(() => buildSuggestion(f.canonical, f.fact.id, "xyz", d)).toThrow(
    "UNSUPPORTED_PATCH_DOMAIN",
  );
});
