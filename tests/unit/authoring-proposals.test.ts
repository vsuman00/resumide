import { it, expect, vi } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId,
} from "../fixtures/requirement-context";
import { parseJobRequirements } from "../../app/lib/server/job-requirements";
import { buildTypedScoreDiagnostics } from "../../app/lib/server/typed-score-diagnostics";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";
import {
  proposeAuthoring,
  type AuthoringProposalTransport,
} from "../../app/lib/server/authoring-proposals";
// Preserve actual imported placement; scoring-v2's date fixture leaves contributions unplaced.
async function legacyFixture(
  options: Parameters<typeof createRequirementContextFixture>[0] = {},
) {
  const { context } = await createRequirementContextFixture({
    confirm: true,
    ...options,
  });
  return {
    evidence: context.attempt.envelope,
    canonical: context.canonical.content,
    requirements: parseJobRequirements("Requirements\nPostgreSQL required", {
      ownerId: context.source.ownerId,
      organizationId: context.source.organizationId,
      analysisId: context.source.analysisId,
      jobId: context.requirements.content.jobId,
      locale: context.canonical.locale,
    }),
  };
}
function target(fixture: Awaited<ReturnType<typeof legacyFixture>>) {
  const fact = fixture.canonical.facts.find(
    (candidate) => candidate.type === "contribution",
  );
  if (!fact) throw Error("SYNTHETIC_CONTRIBUTION_MISSING");
  return fact;
}
function request(fixture: Awaited<ReturnType<typeof legacyFixture>>) {
  return {
    enabled: true,
    document: fixture.canonical,
    diagnostics: buildScoreDiagnostics(fixture),
    targetFactId: target(fixture).id,
  };
}
it("disabled proposals never call a transport or require provider credentials", async () => {
  const f = await legacyFixture(),
    execute = vi.fn();
  const r = await proposeAuthoring(
    {
      enabled: false,
      document: f.canonical,
      diagnostics: buildScoreDiagnostics(f),
      targetFactId: f.canonical.facts[0].id,
    },
    { execute },
  );
  expect(r.state).toBe("disabled");
  expect(execute).not.toHaveBeenCalled();
  const malformed = request(f);
  malformed.enabled = false;
  Object.assign(malformed.document, { schemaVersion: "invalid" });
  expect(await proposeAuthoring(malformed, { execute })).toEqual({
    patches: [],
    state: "disabled",
  });
  expect(execute).not.toHaveBeenCalled();
});
it("provider failures and bounded timeout never produce an accepted patch", async () => {
  const f = await legacyFixture(),
    fact = f.canonical.facts.find((v) => v.type === "contribution")!;
  const args = {
    enabled: true,
    document: f.canonical,
    diagnostics: buildScoreDiagnostics(f),
    targetFactId: fact.id,
    timeoutMs: 5,
  };
  expect(
    (
      await proposeAuthoring(args, {
        execute: async () => {
          throw Error("provider failure");
        },
      })
    ).patches,
  ).toEqual([]);
  const stalled = vi
    .fn()
    .mockImplementation(() => new Promise(() => undefined));
  expect((await proposeAuthoring(args, { execute: stalled })).state).toBe(
    "timeout",
  );
  expect(stalled.mock.calls[0][0].signal.aborted).toBe(true);
});

it("rejects oversize proposal collections before serialization or acceptance", async () => {
  const f = await legacyFixture(),
    fact = f.canonical.facts.find((v) => v.type === "contribution")!,
    execute = vi.fn(async () => Array(10000).fill({}));
  const r = await proposeAuthoring(
    {
      enabled: true,
      document: f.canonical,
      diagnostics: buildScoreDiagnostics(f),
      targetFactId: fact.id,
    },
    { execute },
  );
  expect(execute).toHaveBeenCalledOnce();
  expect(r.patches).toEqual([]);
  expect(r.state).toBe("invalid_or_unavailable");
});

it("dispatches the actual current legacy positive without confusing its diagnostic and raw source hashes", async () => {
  const fixture = await legacyFixture();
  const args = request(fixture);
  expect(args.diagnostics.score.inputSha256).not.toBe(
    args.document.inputSha256,
  );
  const execute = vi.fn<AuthoringProposalTransport["execute"]>(async () => []);
  const result = await proposeAuthoring(args, { execute });
  expect(execute).toHaveBeenCalledOnce();
  expect(result).toEqual({ patches: [], state: "review_required" });
  expect(JSON.parse(execute.mock.calls[0][0].context)).toEqual({
    baseVersionId: args.document.versionId,
    targetFactId: args.targetFactId,
    value: target(fixture).value,
    sourceFactIds: [args.targetFactId],
  });
});

it("refuses an actual revised confirmed document with stale legacy diagnostics before dispatch", async () => {
  const fixture = await legacyFixture();
  const args = request(fixture);
  const section = fixture.canonical.sections[0];
  const current = reviseCanonical(fixture.canonical, {
    operation: "rename_section",
    sectionId: section.id,
    value: "Reviewed experience",
  });
  expect(current.versionId).not.toBe(fixture.canonical.versionId);
  expect(
    current.facts.find((fact) => fact.id === args.targetFactId)?.state,
  ).toBe("candidate_confirmed");
  const execute = vi.fn(async () => []);
  const result = await proposeAuthoring(
    { ...args, document: current },
    { execute },
  );
  expect(execute).not.toHaveBeenCalled();
  expect(result).toEqual({ patches: [], state: "invalid_or_unavailable" });
});

it("refuses actual typed diagnostics before any proposal transport", async () => {
  const fixture = await createRequirementContextFixture({ confirm: true });
  const model = buildTypedScoreDiagnostics(fixture.context);
  const execute = vi.fn(async () => []);
  const result = await proposeAuthoring(
    {
      enabled: true,
      document: fixture.context.canonical.content,
      diagnostics: model.diagnostics,
      targetFactId: fixture.targetFactId,
    },
    { execute },
  );
  expect(execute).not.toHaveBeenCalled();
  expect(result).toEqual({ patches: [], state: "invalid_or_unavailable" });
});

it.each([
  "owner",
  "organization",
  "analysis",
  "source",
  "retention",
  "policy",
] as const)(
  "refuses a mismatched %s diagnostic before dispatch",
  async (binding) => {
    const fixture = await legacyFixture();
    const args = request(fixture);
    if (binding === "owner")
      args.diagnostics.score.ownerId = requirementFixtureId(99);
    if (binding === "organization")
      args.diagnostics.score.organizationId = requirementFixtureId(99);
    if (binding === "analysis")
      args.diagnostics.score.analysisId = requirementFixtureId(99);
    if (binding === "source")
      args.diagnostics.score.evidenceVersionId = requirementFixtureId(99);
    if (binding === "retention")
      args.diagnostics.score.retentionPolicyId = "synthetic-other/1.0.0";
    if (binding === "policy")
      args.diagnostics.score.policyId = "unsupported-policy";
    const execute = vi.fn(async () => []);
    const result = await proposeAuthoring(args, { execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ patches: [], state: "invalid_or_unavailable" });
  },
);

it("refuses malformed diagnostics before dispatch", async () => {
  const args = request(await legacyFixture());
  Object.assign(args.diagnostics, { schemaVersion: "unsupported" });
  const execute = vi.fn(async () => []);
  expect(await proposeAuthoring(args, { execute })).toEqual({
    patches: [],
    state: "invalid_or_unavailable",
  });
  expect(execute).not.toHaveBeenCalled();
});

it.each(["missing", "non_contribution"] as const)(
  "does not dispatch for a %s target",
  async (kind) => {
    const fixture = await legacyFixture();
    const args = request(fixture);
    const other = fixture.canonical.facts.find(
      (fact) => fact.type !== "contribution",
    );
    if (!other) throw Error("SYNTHETIC_HEADER_MISSING");
    args.targetFactId =
      kind === "missing" ? requirementFixtureId(99) : other.id;
    const execute = vi.fn(async () => []);
    expect(await proposeAuthoring(args, { execute })).toEqual({
      patches: [],
      state: "clarification_required",
    });
    expect(execute).not.toHaveBeenCalled();
  },
);

it("does not dispatch an actual newly edited unconfirmed contribution", async () => {
  const fixture = await legacyFixture();
  const fact = target(fixture);
  fixture.canonical = reviseCanonical(fixture.canonical, {
    operation: "edit",
    factId: fact.id,
    value: "Built revised services using PostgreSQL",
  });
  const execute = vi.fn(async () => []);
  expect(await proposeAuthoring(request(fixture), { execute })).toEqual({
    patches: [],
    state: "clarification_required",
  });
  expect(execute).not.toHaveBeenCalled();
});

it.each(["unplaced", "ambiguous", "section_only"] as const)(
  "does not dispatch for a %s contribution placement",
  async (placement) => {
    const fixture = await legacyFixture();
    const args = request(fixture);
    const doc = structuredClone(fixture.canonical);
    if (placement !== "ambiguous") {
      for (const section of doc.sections) {
        section.factIds = section.factIds.filter(
          (id) => id !== args.targetFactId,
        );
        for (const entry of section.entries) {
          entry.factIds = entry.factIds.filter(
            (id) => id !== args.targetFactId,
          );
          entry.bullets = entry.bullets.filter(
            (bullet) => !bullet.factIds.includes(args.targetFactId),
          );
        }
      }
    }
    if (placement === "ambiguous")
      doc.sections[0].entries.push({
        id: requirementFixtureId(99),
        factIds: [args.targetFactId],
        bullets: [],
      });
    if (placement === "section_only")
      doc.sections[0].factIds.push(args.targetFactId);
    const document = CanonicalResumeDraftSchema.parse(doc);
    const execute = vi.fn(async () => []);
    expect(await proposeAuthoring({ ...args, document }, { execute })).toEqual({
      patches: [],
      state: "clarification_required",
    });
    expect(execute).not.toHaveBeenCalled();
  },
);

it("keeps the no-transport branch disabled", async () => {
  const args = request(await legacyFixture());
  Object.assign(args.diagnostics, { schemaVersion: "invalid" });
  expect(await proposeAuthoring(args)).toEqual({
    patches: [],
    state: "disabled",
  });
});

it("preserves the declared unsupported locale branch", async () => {
  const fixture = await legacyFixture({ locale: "fr-FR" });
  const execute = vi.fn(async () => []);
  expect(await proposeAuthoring(request(fixture), { execute })).toEqual({
    patches: [],
    state: "unsupported",
  });
  expect(execute).not.toHaveBeenCalled();
});
