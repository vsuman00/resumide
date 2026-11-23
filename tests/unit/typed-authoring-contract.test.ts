import { describe, expect, it } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  buildTypedAuthoringWorkspace,
  createTypedAuthoringCommand,
  verifyTypedAuthoringCommand,
  typedAuthoringCommandAtoms,
  typedAuthoringCommandSha256,
  validateTypedAuthoringReceipt,
  TypedAuthoringError,
} from "../../app/lib/server/typed-authoring-contract";
const selection = (
  f: Awaited<ReturnType<typeof createRequirementContextFixture>>,
) => ({
  canonicalVersionId: f.context.canonical.versionId,
  requirementVersionId: f.context.requirements.versionId,
  clauseId: f.context.requirements.content.relations.clauses[0].id,
  targetFactId: f.targetFactId,
});
describe("owned typed authoring contract", () => {
  it("derives a real source-backed whole-current transformation and exact command", async () => {
    const f = await createRequirementContextFixture({ confirm: true });
    const patch = buildTypedAuthoringPatch(f.context, selection(f), "Created");
    expect(patch.before).toBe("Built services using PostgreSQL");
    expect(patch.after).toBe("Created services using PostgreSQL");
    expect(patch.support).toMatchObject({
      basis: "source_quote",
      sourceClause: null,
      offsetSpace: "current_fact",
    });
    expect(patch.support.operations).toContain("replace_equivalent_action");
    expect(patch.scoreDelta).toBeNull();
    const command = createTypedAuthoringCommand(patch, "accept", id(90), true);
    expect(verifyTypedAuthoringCommand(f.context, command)).toEqual(command);
    expect(typedAuthoringCommandAtoms(command).length).toBeLessThanOrEqual(256);
    expect(typedAuthoringCommandSha256(command)).toMatch(/^[a-f0-9]{64}$/u);
    const receipt = {
      schemaVersion: "typed-authoring-receipt/1.0.0",
      status: "applied",
      action: "accept",
      idempotencyKey: command.idempotencyKey,
      commandSha256: typedAuthoringCommandSha256(command),
      baseVersionId: command.binding.canonical.versionId,
      baseRevision: command.binding.canonical.revision,
      requirementVersionId: command.binding.requirements.versionId,
      requirementRevision: command.binding.requirements.revision,
      versionId: id(92),
      revision: command.binding.canonical.revision + 2,
      eventId: id(93),
      idempotent: false,
    };
    expect(validateTypedAuthoringReceipt(receipt, command)).toEqual(receipt);
    expect(() =>
      validateTypedAuthoringReceipt(
        { ...receipt, revision: receipt.revision - 1 },
        command,
      ),
    ).toThrow(TypedAuthoringError);
  });
  it("preserves lowercase remainder bytes and refuses an exact-copy noop", async () => {
    const f = await createRequirementContextFixture({
      confirm: true,
      clauses: ["built services using PostgreSQL"],
    });
    expect(
      buildTypedAuthoringPatch(f.context, selection(f), "Developed").after,
    ).toBe("developed services using PostgreSQL");
    expect(() =>
      buildTypedAuthoringPatch(f.context, selection(f), "Built"),
    ).toThrow("unchanged");
  });
  it.each([null, 21])(
    "withholds writing on actual page metadata %s",
    async (pageCount) => {
      const f = await createRequirementContextFixture({
        confirm: true,
        pageCount,
      });
      expect(() =>
        buildTypedAuthoringPatch(f.context, selection(f), "Created"),
      ).toThrow(TypedAuthoringError);
      expect(
        buildTypedAuthoringWorkspace(f.context).targets.find(
          (t) => t.factId === f.targetFactId,
        )?.state,
      ).toBe("explanation_only");
    },
  );
  it("refuses unconfirmed, foreign selection and listed-skill targets", async () => {
    const f = await createRequirementContextFixture();
    expect(() =>
      buildTypedAuthoringPatch(f.context, selection(f), "Created"),
    ).toThrow(TypedAuthoringError);
    const g = await createRequirementContextFixture({ confirm: true });
    expect(() =>
      buildTypedAuthoringPatch(
        g.context,
        { ...selection(g), canonicalVersionId: id(99) },
        "Created",
      ),
    ).toThrow(TypedAuthoringError);
    const skill = g.context.canonical.content.facts.find(
      (v) => v.type === "skill",
    )!;
    expect(() =>
      buildTypedAuthoringPatch(
        g.context,
        { ...selection(g), targetFactId: skill.id },
        "Created",
      ),
    ).toThrow(TypedAuthoringError);
  });
  it("does not fabricate a witness for an edited confirmed declaration", async () => {
    const f = await createRequirementContextFixture({
      edit: "Built database services using PostgreSQL",
      confirm: true,
    });
    expect(() =>
      buildTypedAuthoringPatch(f.context, selection(f), "Created"),
    ).toThrow(TypedAuthoringError);
  });
  it("binds citations and opaque digests by actual recomputation", async () => {
    const f = await createRequirementContextFixture({ confirm: true });
    const command = createTypedAuthoringCommand(
      buildTypedAuthoringPatch(f.context, selection(f), "Created"),
      "accept",
      id(95),
      true,
    );
    expect(() =>
      verifyTypedAuthoringCommand(f.context, {
        ...command,
        coverageDigest: "d".repeat(64),
      }),
    ).toThrow(TypedAuthoringError);
    expect(() =>
      verifyTypedAuthoringCommand(f.context, {
        ...command,
        sourceCitations: [],
      }),
    ).toThrow(TypedAuthoringError);
    expect(() =>
      createTypedAuthoringCommand(
        buildTypedAuthoringPatch(f.context, selection(f), "Created"),
        "accept",
        id(96),
        false,
      ),
    ).toThrow(TypedAuthoringError);
  });
  it("preserves tab-delimited source bytes in the portable kernel", async () => {
    const f = await createRequirementContextFixture({
      confirm: true,
      clauses: ["Built\tservices using PostgreSQL"],
    });
    expect(
      buildTypedAuthoringPatch(f.context, selection(f), "Created").after,
    ).toBe("Created\tservices using PostgreSQL");
  });
  it.each([
    "Built services using Python and PostgreSQL",
    "Built services using PostgreSQL and Python",
  ])("retains compound-source abstention for %s", async (clause) => {
    const f = await createRequirementContextFixture({
      confirm: true,
      clauses: [clause],
      skill: "PostgreSQL",
      requiredSkill: "PostgreSQL",
    });
    expect(() =>
      buildTypedAuthoringPatch(f.context, selection(f), "Created"),
    ).toThrow(TypedAuthoringError);
  });
  it("uses actual derived-duration operands for wording without granting qualification", async () => {
    const f = await createRequirementContextFixture({
      confirm: true,
      skill: "Python",
      clauses: ["Built services using Python"],
      jdText: "At least 4 years of Python experience required",
    });
    const patch = buildTypedAuthoringPatch(f.context, selection(f), "Created");
    expect(patch.after).toBe("Created services using Python");
    expect(patch.scoreDelta).toBeNull();
  });
});
