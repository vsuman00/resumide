import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { scoreFixture, SCORE_SOURCE } from "../tests/fixtures/scoring-v2";
import { buildScoreDiagnostics } from "../app/lib/server/score-v2-engine";
import {
  clarifyValue,
  buildSuggestion,
  validateSuggestion,
} from "../app/lib/server/authoring-contract";
import { proposeAuthoring } from "../app/lib/server/authoring-proposals";
export const WRITER_MANIFEST = {
  id: "writer-known-synthetic/1.0.0",
  scope: "known synthetic, no representative or human/model evaluation",
  sourceSha256: createHash("sha256").update(SCORE_SOURCE).digest("hex"),
  patterns: ["xyz", "action_impact_context", "action_scope_result"],
  knownAnswers: {
    result: "Fewer failed releases",
    measurement: "Five fewer failed releases",
    scope: "Internal deployment workflow",
    method: "Tested release checks",
  },
  adversarialCases: [
    "invented_metric",
    "invented_employer",
    "unsupported_skill",
    "unsupported_certification",
    "foreign_fact",
    "cross_section",
    "stale_version",
    "document_replacement",
    "model_numeric_authority",
    "missing_confirmation",
    "missing_measurement",
  ],
};
export async function benchmarkWriterGrounding() {
  const f = scoreFixture(),
    fact = f.canonical.facts.find(
      (v) => v.type === "contribution" && v.value === "Built reliable services",
    )!;
  f.canonical.sections
    .find((s) => s.type === "experience")!
    .entries[0].bullets.push({
      id: randomUUID(),
      text: fact.value,
      factIds: [fact.id],
    });
  for (const [kind, value] of Object.entries(WRITER_MANIFEST.knownAnswers))
    fact.value = clarifyValue(fact.value, kind as "result", value);
  fact.sources = [];
  fact.confirmation!.value = fact.value;
  const diagnostics = buildScoreDiagnostics(f);
  const patch = buildSuggestion(f.canonical, fact.id, "xyz", diagnostics);
  assert.equal(patch.state, "ready");
  assert.equal(
    patch.operations[0].value,
    "Fewer failed releases; measured by Five fewer failed releases; by Tested release checks.",
  );
  const good = validateSuggestion(patch, f.canonical, diagnostics);
  assert.equal(good.sourceFactIds[0], fact.id);
  const invalidValues = [
    "Increased revenue by 99%",
    "Worked at Invented Corporation",
    "Expert Kubernetes proficiency",
    "AWS Certified Architect",
  ];
  for (const value of invalidValues)
    assert.throws(() =>
      validateSuggestion(
        { ...patch, operations: [{ ...patch.operations[0], value }] },
        f.canonical,
        diagnostics,
      ),
    );
  for (const altered of [
    { ...patch, targetFactId: randomUUID() },
    { ...patch, sectionId: randomUUID() },
    { ...patch, baseVersionId: randomUUID() },
    { ...patch, documentReplacement: "whole resume" },
    { ...patch, score: 100 },
  ])
    assert.throws(() => validateSuggestion(altered, f.canonical, diagnostics));
  assert.ok(
    buildSuggestion(
      f.canonical,
      fact.id,
      "action_scope_result",
      diagnostics,
    ).operations[0].value.includes("Internal deployment workflow"),
  );
  const unknown = clarifyValue(
    "Built reliable services",
    "result",
    "Fewer failures",
  );
  const incomplete = structuredClone(f.canonical);
  const incompleteFact = incomplete.facts.find((v) => v.id === fact.id)!;
  incompleteFact.value = unknown;
  incompleteFact.confirmation!.value = unknown;
  const iDiagnostics = buildScoreDiagnostics({ ...f, canonical: incomplete });
  assert.equal(
    buildSuggestion(incomplete, fact.id, "xyz", iDiagnostics).state,
    "clarification_required",
  );
  const unconfirmed = structuredClone(f.canonical);
  const unconfirmedFact = unconfirmed.facts.find((v) => v.id === fact.id)!;
  unconfirmedFact.state = "unconfirmed";
  unconfirmedFact.confirmation = null;
  const unconfirmedDiagnostics = buildScoreDiagnostics({
    ...f,
    canonical: unconfirmed,
  });
  assert.throws(() =>
    validateSuggestion(patch, unconfirmed, unconfirmedDiagnostics),
  );
  const adapters = [];
  for (const id of [
    "injected_exact_a",
    "injected_exact_b",
    "injected_hallucination",
  ]) {
    const started = performance.now();
    const r = await proposeAuthoring(
      {
        enabled: true,
        document: f.canonical,
        diagnostics,
        targetFactId: fact.id,
      },
      {
        execute: async () =>
          id === "injected_hallucination"
            ? [
                {
                  ...patch,
                  operations: [
                    {
                      ...patch.operations[0],
                      value: "Invented employer and 99% revenue",
                    },
                  ],
                },
              ]
            : [patch],
      },
    );
    const valid = id !== "injected_hallucination";
    assert.equal(r.patches.length, valid ? 1 : 0);
    adapters.push({
      adapterId: id,
      realModel: false,
      validatedProposalCount: r.patches.length,
      unsupportedAcceptedFacts: 0,
      citationValidity: valid ? 1 : null,
      latencyMs: performance.now() - started,
      providerCostUsd: 0,
    });
  }
  return {
    schemaVersion: "writer-grounding-engineering/1.0.0",
    manifest: WRITER_MANIFEST,
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(WRITER_MANIFEST))
      .digest("hex"),
    engineeringPassed: true,
    releasePassed: false,
    adapters,
    adversarialCases: WRITER_MANIFEST.adversarialCases.length,
    unsupportedAcceptedFacts: 0,
    realProviderCalls: 0,
    adoptedModel: null,
    actualModelComparison: null,
    editUsefulness: null,
    representativeDomainQuality: null,
    candidateReviewAcceptance: null,
    releaseBlockers: [
      "No representative locked writer corpus or candidate review",
      "No authorized real model comparison or model policy adoption",
      "Formal AA4 confidence/scoring and domain gates remain open",
    ],
  };
}
