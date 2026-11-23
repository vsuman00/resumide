import { describe, expect, it, vi } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import * as legacy from "../../app/lib/server/typed-authoring-contract";
import * as protocol from "../../app/lib/server/typed-authoring-protocol";
import {
  proposeTypedAuthoring,
  applyTypedAuthoring,
} from "../../app/lib/server/typed-authoring-repository";
import { TYPED_AUTHORING_READINESS_PROFILE } from "../../app/lib/server/typed-authoring-readiness-profile";
const selection = (
  f: Awaited<ReturnType<typeof createRequirementContextFixture>>,
) => ({
  canonicalVersionId: f.context.canonical.versionId,
  requirementVersionId: f.context.requirements.versionId,
  clauseId: f.context.requirements.content.relations.clauses[0].id,
  targetFactId: f.targetFactId,
});
async function declaration(value = "Built database services using PostgreSQL") {
  const f = await createRequirementContextFixture({
    edit: value,
    confirm: true,
  });
  return { ...f, selection: selection(f) };
}
describe("strict versioned typed authoring protocol", () => {
  it("preserves all actual source1.0 builders, bytes, policies and hash semantics", async () => {
    const f = await createRequirementContextFixture({ confirm: true }),
      s = selection(f);
    const oldPatch = legacy.buildTypedAuthoringPatch(f.context, s, "Created");
    expect(protocol.buildTypedAuthoringPatch(f.context, s, "Created")).toEqual(
      oldPatch,
    );
    expect(protocol.buildTypedAuthoringWorkspace(f.context)).toEqual(
      legacy.buildTypedAuthoringWorkspace(f.context),
    );
    const oldCommand = legacy.createTypedAuthoringCommand(
      oldPatch,
      "accept",
      id(90),
      true,
    );
    expect(
      protocol.createTypedAuthoringCommand(oldPatch, "accept", id(90), true),
    ).toEqual(oldCommand);
    expect(protocol.typedAuthoringCommandAtoms(oldCommand)).toEqual(
      legacy.typedAuthoringCommandAtoms(oldCommand),
    );
    expect(protocol.typedAuthoringCommandSha256(oldCommand)).toBe(
      legacy.typedAuthoringCommandSha256(oldCommand),
    );
    expect(protocol.verifyTypedAuthoringCommand(f.context, oldCommand)).toEqual(
      oldCommand,
    );
  });
  it("keeps old declaration refusal while the real1.1 fallback becomes usable", async () => {
    const f = await declaration();
    expect(() =>
      legacy.buildTypedAuthoringPatch(f.context, f.selection, "Created"),
    ).toThrow(legacy.TypedAuthoringError);
    const workspace = protocol.buildTypedAuthoringWorkspace(f.context);
    expect(workspace.schemaVersion).toBe("typed-authoring-workspace/1.1.0");
    expect(
      workspace.targets.find((t) => t.factId === f.targetFactId),
    ).toMatchObject({
      state: "eligible",
      reason: "whole_current_confirmed_declaration",
    });
    const patch = protocol.buildTypedAuthoringPatch(
      f.context,
      f.selection,
      "Created",
    );
    expect(patch).toMatchObject({
      schemaVersion: "typed-authoring-patch/1.1.0",
      before: "Built database services using PostgreSQL",
      after: "Created database services using PostgreSQL",
      sourceCitations: [],
      support: {
        basis: "candidate_declaration",
        sourceClause: null,
        offsetSpace: "current_fact",
      },
      scoreValue: null,
      scoreDelta: null,
    });
    expect(patch.support.witnessId).toMatch(
      /^declaration-witness-[a-f0-9]{64}$/u,
    );
    const oldWorkspace = legacy.buildTypedAuthoringWorkspace(f.context);
    expect(patch.coverageDigest).toBe(oldWorkspace.coverageDigest);
    expect(patch.semanticDigest).toBe(oldWorkspace.semanticDigest);
    expect(patch.diagnosticDigest).toBe(oldWorkspace.diagnosticDigest);
  });
  it.each([
    "Created database services using PostgreSQL",
    "built database\tservices using PostgreSQL.",
  ])("preserves the full current declaration remainder %s", async (value) => {
    const f = await declaration(value);
    const patch = protocol.buildTypedAuthoringPatch(
      f.context,
      f.selection,
      "Developed",
    );
    const oldVerb = /^(Built|Created|Developed|built|created|developed)/u.exec(
      value,
    )![0];
    expect(patch.after.slice("Developed".length)).toBe(
      value.slice(oldVerb.length),
    );
    expect(
      patch.after.startsWith(
        value[0] === value[0].toLowerCase() ? "developed" : "Developed",
      ),
    ).toBe(true);
  });
  it("refuses a copy, unknown version, mixed policy, nonempty citations and false acceptance", async () => {
    const f = await declaration(),
      patch = protocol.buildTypedAuthoringPatch(
        f.context,
        f.selection,
        "Created",
      );
    expect(() =>
      protocol.buildTypedAuthoringPatch(f.context, f.selection, "Built"),
    ).toThrow("unchanged");
    const command = protocol.createTypedAuthoringCommand(
      patch,
      "accept",
      id(91),
      true,
    );
    expect(() => legacy.parseTypedAuthoringCommand(command)).toThrow(
      legacy.TypedAuthoringError,
    );
    for (const raw of [
      { ...command, schemaVersion: "typed-authoring-command/1.2.0" },
      { ...command, policies: legacy.TYPED_AUTHORING_POLICIES },
      { ...command, sourceCitations: [{ attemptId: f.owned.attemptId }] },
      { ...command, acknowledgement: false },
    ])
      expect(() => protocol.parseTypedAuthoringCommand(raw)).toThrow(
        legacy.TypedAuthoringError,
      );
    const atoms = protocol.typedAuthoringCommandAtoms(command);
    expect(atoms).toHaveLength(50);
    expect(atoms[0]).toBe("typed-authoring-command/1.1.0");
    expect(atoms[25]).toBe("typed-authoring-rules/1.1.0");
    expect(atoms[49]).toBe("0");
  });
  it("recomputes new support/current value/policy and preserves original captures for exact replay", async () => {
    const f = await declaration(),
      patch = protocol.buildTypedAuthoringPatch(
        f.context,
        f.selection,
        "Created",
      );
    const command = protocol.createTypedAuthoringCommand(
      patch,
      "reject",
      id(92),
      false,
    );
    f.context.heads.canonicalHeadId = id(170);
    f.context.heads.canonicalHeadRevision++;
    f.context.heads.requirementHeadId = id(171);
    f.context.heads.requirementHeadRevision++;
    expect(protocol.verifyTypedAuthoringCommand(f.context, command)).toEqual(
      command,
    );
    expect(() =>
      protocol.buildTypedAuthoringPatch(f.context, f.selection, "Created"),
    ).toThrow(expect.objectContaining({ reason: "stale_inputs" }));
    expect(() =>
      protocol.verifyTypedAuthoringCommand(f.context, {
        ...command,
        target: { ...command.target, currentValueSha256: "f".repeat(64) },
      }),
    ).toThrow(legacy.TypedAuthoringError);
    expect(() =>
      protocol.verifyTypedAuthoringCommand(f.context, {
        ...command,
        coverageDigest: "f".repeat(64),
      }),
    ).toThrow(legacy.TypedAuthoringError);
  });
  it("runs actual owned repository preflight/two reads and current readiness for1.1 replay", async () => {
    const f = await declaration(),
      reads: string[] = [];
    const client = {
      rpc: vi.fn(async (name: string) => {
        reads.push(name);
        return {
          data:
            name === "read_typed_authoring_readiness"
              ? {
                  ...TYPED_AUTHORING_READINESS_PROFILE,
                  schemaReady: true,
                  writerExecutable: true,
                }
              : structuredClone(f.context),
          error: null,
        };
      }),
    } as unknown as Parameters<typeof proposeTypedAuthoring>[0];
    const result = await proposeTypedAuthoring(
      client,
      f.owned.analysisId,
      f.owned.ownerId,
      f.selection,
      { execute: async () => ({ replacementAction: "Created" }) },
    );
    if (result.state !== "review_required")
      throw Error("EXPECTED_REAL_DECLARATION_PROPOSAL");
    expect(reads).toEqual([
      "read_requirement_relationship_context",
      "read_requirement_relationship_context",
    ]);
    expect(result.proposal.patch.schemaVersion).toBe(
      "typed-authoring-patch/1.1.0",
    );
    const command = result.proposal.rejectCommand;
    f.context.heads.canonicalHeadId = id(175);
    f.context.heads.canonicalHeadRevision++;
    const receipt = {
      schemaVersion: "typed-authoring-receipt/1.0.0",
      status: "applied",
      action: "reject",
      idempotencyKey: command.idempotencyKey,
      commandSha256: protocol.typedAuthoringCommandSha256(command),
      baseVersionId: command.binding.canonical.versionId,
      baseRevision: command.binding.canonical.revision,
      requirementVersionId: command.binding.requirements.versionId,
      requirementRevision: command.binding.requirements.revision,
      versionId: command.binding.canonical.versionId,
      revision: command.binding.canonical.revision,
      eventId: id(176),
      idempotent: true,
    };
    const apply = vi.fn(async () => ({ data: receipt, error: null }));
    expect(
      await applyTypedAuthoring(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        command,
        command.idempotencyKey,
        { apply },
      ),
    ).toEqual(receipt);
    expect(reads.slice(-2)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
    ]);
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: command,
      p_request_id: command.idempotencyKey,
    });
  });
});
