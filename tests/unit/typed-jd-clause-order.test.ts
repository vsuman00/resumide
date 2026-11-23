import { createHash } from "node:crypto";
import { JdClauseOrderDraftSchema } from "../../app/lib/server/jd-clause-order-drafting";
import { buildTypedAuthoringPatch } from "../../app/lib/server/typed-authoring-contract";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId,
} from "../fixtures/jd-clause-order";
import { expect, it } from "vitest";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import {
  buildJdClauseOrderDraft,
  buildJdClauseOrderPlan,
} from "../../app/lib/server/jd-clause-order-drafting";
it("refuses labelled original metadata when frozen full-source IR does not admit its scope", async () => {
  const f = await createRequirementContextFixture({
    clauses: ["Built services using Python; Developed tools using Git"],
    jdText: "Requirements\nGit required",
    confirm: true,
  });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  expect(() =>
    buildJdClauseOrderDraft(
      f.context,
      { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
      selection,
    ),
  ).toThrow();
});

it("drafts a real whole confirmed original contribution with neutral admitted source headers", async () => {
  const f = await createJdClauseOrderFixture({
    clauses: ["Built services using Python; Developed tools using Git"],
    jdText: "Requirements\nGit required",
    confirm: true,
  });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const draft = buildJdClauseOrderDraft(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    selection,
  );
  expect(draft.after).toBe(
    "Developed tools using Git; Built services using Python",
  );
});

it("reaches the source-backed draft after more than fifty unrelated required clauses", async () => {
  const f = await createJdClauseOrderFixture({
    jdText: [
      "Requirements",
      ...Array.from({ length: 52 }, (_, index) =>
        index % 2 === 0 ? "PostgreSQL required" : "Docker required",
      ),
      "Git required",
    ].join("\n"),
  });
  expect(f.context.requirements.content.relations.clauses).toHaveLength(53);
  const expected = {
    analysisId: f.owned.analysisId,
    ownerId: f.owned.ownerId,
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
  };
  const plan = buildJdClauseOrderPlan(f.context, expected);
  expect(plan).toMatchObject({
    state: "available",
    inspectedPairCount: 1,
    truncated: false,
    scoreDelta: null,
    qualificationCredit: "not_assessed",
  });
  expect(plan.drafts).toEqual([
    buildJdClauseOrderDraft(f.context, expected, {
      canonicalVersionId: expected.canonicalVersionId,
      requirementVersionId: expected.requirementVersionId,
      clauseId: f.context.requirements.content.relations.clauses[52].id,
      targetFactId: f.targetFactId,
    }),
  ]);
});

function selectionFor(
  f: Awaited<ReturnType<typeof createJdClauseOrderFixture>>,
) {
  return {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
}
function draftFor(f: Awaited<ReturnType<typeof createJdClauseOrderFixture>>) {
  return buildJdClauseOrderDraft(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    selectionFor(f),
  );
}
it("binds exact source/JD/current confirmation and real full-stream IR without changing inputs", async () => {
  const f = await createJdClauseOrderFixture();
  const before = JSON.stringify(f.context),
    draft = draftFor(f);
  expect(f.rpcCalls).toHaveLength(1);
  expect(f.rpcCalls[0].name).toBe("read_requirement_relationship_context");
  expect(f.original.producerVersion).toBe("canonical-engine/1.0.1");
  expect(f.context.headerSnapshot.snapshotFamily).toBe("none");
  expect(draft.before).toBe(
    "Built services using Python; Developed tools using Git",
  );
  expect(draft.relevance).toMatchObject({
    quote: "Git required",
    importance: "required",
    expressionKind: "atom",
    movedSourceClauseIndex: 1,
    conceptId: null,
    sourceSkillValue: "Git",
    jdSkillValue: "Git",
  });
  expect(draft.binding.source).toEqual(f.context.source);
  expect(draft.target.factId).toBe(f.targetFactId);
  expect(draft.sourceCitations[0]).toMatchObject({
    attemptId: f.owned.attemptId,
    method: "native_text",
  });
  expect(draft.support.sourceSha256).toBe(
    createHash("sha256").update(f.text).digest("hex"),
  );
  expect(draft.support.operations).toContain("reorder_independent_clauses");
  expect(draft).toMatchObject({
    scoreValue: null,
    scoreDelta: null,
    qualificationCredit: "not_assessed",
  });
  expect(JSON.stringify(f.context)).toBe(before);
  expect(draftFor(f)).toEqual(draft);
  const { id, ...body } = draft;
  expect(id).toBe(
    createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  );
  expect(JdClauseOrderDraftSchema.parse(draft)).toEqual(draft);
});
it("preserves terminal punctuation and exact clause bytes with code-point offsets", async () => {
  const f = await createJdClauseOrderFixture({
      clauses: ["Built 𝒜 service using Python; Developed tools using Git."],
    }),
    draft = draftFor(f);
  expect(draft.after).toBe(
    "Developed tools using Git; Built 𝒜 service using Python.",
  );
  expect(draft.transform.terminal).toBe(".");
  expect(draft.sourceClauses[1].start).toBe(
    Array.from("Built 𝒜 service using Python; ").length,
  );
  expect(draft.sourceClauses[1].start).not.toBe(
    "Built 𝒜 service using Python; ".length,
  );
  for (const clause of draft.sourceClauses)
    expect(
      Array.from(draft.before).slice(clause.start, clause.end).join(""),
    ).toBe(clause.text);
});
it("uses only existing approved aliases for relevance", async () => {
  const f = await createJdClauseOrderFixture({
    clauses: ["Built services using Python; Developed tools using Postgres"],
    jdText: "Requirements\nPostgreSQL required",
  });
  expect(draftFor(f).relevance).toMatchObject({
    conceptId: "local-software:postgresql",
    sourceSkillValue: "Postgres",
    jdSkillValue: "PostgreSQL",
  });
});
it.each(["ownerId", "analysisId"] as const)(
  "refuses expected %s mismatch",
  async (key) => {
    const f = await createJdClauseOrderFixture();
    expect(() =>
      buildJdClauseOrderDraft(
        f.context,
        {
          analysisId: f.owned.analysisId,
          ownerId: f.owned.ownerId,
          [key]: jdClauseOrderFixtureId(999),
        },
        selectionFor(f),
      ),
    ).toThrow();
  },
);
it.each([
  "canonicalVersionId",
  "requirementVersionId",
  "clauseId",
  "targetFactId",
] as const)("refuses a different selected %s", async (key) => {
  const f = await createJdClauseOrderFixture();
  const value =
    key === "clauseId" ? "f".repeat(64) : jdClauseOrderFixtureId(999);
  expect(() =>
    buildJdClauseOrderDraft(
      f.context,
      { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
      { ...selectionFor(f), [key]: value },
    ),
  ).toThrow();
});
it.each([
  "canonical-head",
  "requirement-head",
  "source",
  "hash",
  "source-citation",
  "inactive-stream",
  "caller-support",
])("refuses tampered %s without accepting caller authority", async (kind) => {
  const f = await createJdClauseOrderFixture();
  if (kind === "canonical-head")
    f.context.heads.canonicalHeadId = jdClauseOrderFixtureId(999);
  if (kind === "requirement-head")
    f.context.heads.requirementHeadId = jdClauseOrderFixtureId(999);
  if (kind === "source")
    f.context.source.sourceId = jdClauseOrderFixtureId(999);
  if (kind === "hash") f.context.canonical.contentSha256 = "f".repeat(64);
  if (kind === "source-citation")
    f.context.canonical.content.facts.find(
      (fact) => fact.id === f.targetFactId,
    )!.sources[0].end--;
  if (kind === "inactive-stream")
    f.context.attempt.envelope.spans.find(
      (s) =>
        s.id ===
        f.context.canonical.content.facts.find(
          (fact) => fact.id === f.targetFactId,
        )!.sources[0].spanId,
    )!.method = "local_ocr";
  if (kind === "caller-support")
    Object.assign(f.context, { grounded: true, supported: true });
  expect(() => draftFor(f)).toThrow();
});
it.each(["Team achievements", "Planned work:", "'", "Examples:"])(
  "refuses actual full-source qualifier %s",
  async (header) => {
    const f = await createJdClauseOrderFixture({
      header: header + "\nExperience\nSoftware Engineer at Orchard Labs",
    });
    expect(() => draftFor(f)).toThrow();
  },
);
it.each([
  "Built services using Python; then Developed tools using Git",
  "We Built services using Python; Developed tools using Git",
  "Built their services using Python; Developed tools using Git",
  "Built services using Python; Developed tools using Git by 20%",
  "Built services using Python;Developed tools using Git",
  "Built services using Python; Developed tools using Git; Created helpers using Git",
  "Built services without Python; Developed tools using Git",
])("refuses dependent or unsupported source grammar: %s", async (value) => {
  const f = await createJdClauseOrderFixture({ clauses: [value] });
  expect(() => draftFor(f)).toThrow();
});
it.each([
  "Requirements\nPython required",
  "Requirements\nGit or Python required",
  "Requirements\nGit and Python required",
  "Context\nGit",
  "Requirements\nGit is not required",
  "Requirements\nRAG required",
])("refuses unsupported or already-first JD meaning: %s", async (jdText) => {
  const f = await createJdClauseOrderFixture({ jdText });
  expect(() => draftFor(f)).toThrow();
});
it.each([
  "unconfirmed",
  "declaration-only",
  "multiple-placement",
  "unknown-pages",
  "incomplete-pages",
  "wrong-domain",
])("refuses %s target/source", async (kind) => {
  const f = await createJdClauseOrderFixture({
    confirm: kind !== "unconfirmed",
    ...(kind === "declaration-only"
      ? { edit: "Built services using Python; Developed tools using Git" }
      : {}),
    ...(kind === "unknown-pages" ? { pageCount: null } : {}),
    ...(kind === "incomplete-pages" ? { pageCount: 2 } : {}),
    ...(kind === "wrong-domain" ? { domain: "medicine" } : {}),
  });
  if (kind === "multiple-placement") {
    const section = f.context.canonical.content.sections.find((s) =>
      s.entries.some((e) =>
        e.bullets.some((b) => b.factIds.includes(f.targetFactId)),
      ),
    )!;
    section.entries[0].bullets.push({
      id: jdClauseOrderFixtureId(998),
      text: "Repeated placement",
      factIds: [f.targetFactId],
    });
  }
  expect(() => draftFor(f)).toThrow();
});
it("rejects output mutation and adds no legacy command capability", async () => {
  const f = await createJdClauseOrderFixture(),
    draft = draftFor(f);
  expect(
    JdClauseOrderDraftSchema.safeParse({
      ...draft,
      after: "Created new unsupported prose",
    }).success,
  ).toBe(false);
  expect(
    JdClauseOrderDraftSchema.safeParse({ ...draft, scoreValue: 10 }).success,
  ).toBe(false);
  expect(() =>
    buildTypedAuthoringPatch(f.context, selectionFor(f), "Created"),
  ).toThrow();
});
