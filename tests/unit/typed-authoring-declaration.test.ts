import { describe, expect, it } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import {
  deriveTypedAuthoringDeclarations,
  TYPED_AUTHORING_DECLARATION_POLICY_SHA256,
} from "../../app/lib/server/typed-authoring-declaration";
import {
  deriveRequirementSemanticEvidence,
  REQUIREMENT_SEMANTIC_POLICY_VERSION,
} from "../../app/lib/server/requirement-semantic-evidence";

const edit = "Built database services using PostgreSQL";
describe("authoring-only current declaration witnesses", () => {
  it("derives the actual edited/confirmed claim without fabricating a semantic or source witness", async () => {
    const f = await createRequirementContextFixture({ edit, confirm: true });
    const fact = f.context.canonical.content.facts.find(
      (v) => v.id === f.targetFactId,
    )!;
    expect(fact.sources).toEqual([]);
    const semantic = deriveRequirementSemanticEvidence(f.context);
    expect(REQUIREMENT_SEMANTIC_POLICY_VERSION).toBe(
      "requirement-semantic-rules/1.0.1",
    );
    if (semantic.state !== "available") throw Error("EXPECTED_ACTUAL_SEMANTIC");
    expect(semantic.witnesses.filter((w) => w.factId === fact.id)).toEqual([]);
    const result = deriveTypedAuthoringDeclarations(f.context),
      w = result.witnesses[0];
    expect(result.witnesses).toHaveLength(1);
    expect(w).toMatchObject({
      factId: fact.id,
      value: edit,
      confirmation: fact.confirmation,
      basis: "candidate_declaration",
      sourceClause: null,
      offsetSpace: "current_fact",
      currentSourceCitations: [],
      from: "Built",
      case: "title",
      rest: " database services using PostgreSQL",
    });
    expect(w.id).toMatch(/^declaration-witness-[a-f0-9]{64}$/u);
    expect(w.clauseIds).toContain(
      f.context.requirements.content.relations.clauses[0].id,
    );
    expect(TYPED_AUTHORING_DECLARATION_POLICY_SHA256).toBe(
      "9fe1f173a86350883bf1ae7773ef8dfbd3225e780d23b210d86354c6b6cfb477",
    );
  });
  it("requires actual current confirmation rather than old ancestor confirmation", async () => {
    const f = await createRequirementContextFixture({ edit });
    const result = deriveTypedAuthoringDeclarations(f.context);
    expect(result.witnesses).toEqual([]);
    expect(result.failures.get(f.targetFactId)).toBe("confirmation_required");
  });
  it("never reclassifies an existing current source citation, even after confirmation", async () => {
    for (const clauses of [
      ["Built services using PostgreSQL"],
      ["Team achievements:", "Built services using PostgreSQL"],
    ]) {
      const f = await createRequirementContextFixture({
        clauses,
        targetIndex: clauses.length - 1,
        confirm: true,
      });
      expect(
        f.context.canonical.content.facts.find((v) => v.id === f.targetFactId)!
          .sources.length,
      ).toBeGreaterThan(0);
      expect(deriveTypedAuthoringDeclarations(f.context).witnesses).toEqual([]);
    }
  });
  it.each([
    "BUILT database services using PostgreSQL",
    "Led database services using PostgreSQL",
    "Built database and services using PostgreSQL",
    "Built team services using PostgreSQL",
    "Built planned services using PostgreSQL",
    "Built services without PostgreSQL",
    '"Built database services using PostgreSQL"',
    "Built services; using PostgreSQL",
    "Built services\nusing PostgreSQL",
    "Built services using PostgreSQL and Python",
  ])("abstains on unsupported or qualified current claim %s", async (value) => {
    const f = await createRequirementContextFixture({
      edit: value,
      confirm: true,
    });
    expect(deriveTypedAuthoringDeclarations(f.context).witnesses).toEqual([]);
  });
  it("requires same-clause actual skill evidence, with approved aliases or literal identity only", async () => {
    const alias = await createRequirementContextFixture({
      edit: "Created database services using Postgres",
      confirm: true,
    });
    expect(
      deriveTypedAuthoringDeclarations(alias.context).witnesses,
    ).toHaveLength(1);
    const literal = await createRequirementContextFixture({
      skill: "Python",
      edit: "Developed services using Python",
      confirm: true,
    });
    expect(
      deriveTypedAuthoringDeclarations(literal.context).witnesses,
    ).toHaveLength(1);
    const wrong = await createRequirementContextFixture({
      edit: "Built services using Python",
      confirm: true,
    });
    expect(deriveTypedAuthoringDeclarations(wrong.context).witnesses).toEqual(
      [],
    );
  });
  it.each([null, 21])(
    "retains actual page metadata withholding %s",
    async (pageCount) => {
      const f = await createRequirementContextFixture({
        edit,
        confirm: true,
        pageCount,
      });
      expect(() => deriveTypedAuthoringDeclarations(f.context)).toThrow(
        expect.objectContaining({ reason: "incomplete_source_coverage" }),
      );
    },
  );
  it("retains polarity and unique physical location restrictions", async () => {
    const negated = await createRequirementContextFixture({
      edit,
      confirm: true,
      jdText: "PostgreSQL not required",
    });
    expect(deriveTypedAuthoringDeclarations(negated.context).witnesses).toEqual(
      [],
    );
    const f = await createRequirementContextFixture({ edit, confirm: true });
    const current = structuredClone(f.context);
    const hasTarget = (
      e: (typeof current.canonical.content.sections)[number]["entries"][number],
    ) =>
      e.factIds.includes(f.targetFactId) ||
      e.bullets.some((b) => b.factIds.includes(f.targetFactId));
    const section = current.canonical.content.sections.find((s) =>
      s.entries.some(hasTarget),
    )!;
    const entry = section.entries.find(hasTarget)!;
    section.entries.push({
      id: id(180),
      factIds: [f.targetFactId],
      bullets: [],
    });
    expect(hasTarget(entry)).toBe(true);
    const result = deriveTypedAuthoringDeclarations(current);
    expect(result.witnesses).toEqual([]);
    expect(result.failures.get(f.targetFactId)).toBe("ambiguous_location");
  });
  it("does not require today's heads when deriving the immutable original declaration", async () => {
    const f = await createRequirementContextFixture({ edit, confirm: true });
    f.context.heads.canonicalHeadId = id(190);
    f.context.heads.canonicalHeadRevision++;
    expect(deriveTypedAuthoringDeclarations(f.context).witnesses).toHaveLength(
      1,
    );
  });
});
