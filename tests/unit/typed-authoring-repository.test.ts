import { describe, expect, it, vi } from "vitest";
import {
  TYPED_AUTHORING_READINESS_PROFILE,
  TYPED_AUTHORING_REGROUP_READINESS_PROFILE,
} from "../../app/lib/server/typed-authoring-readiness-profile";
import type { TypedAuthoringReadinessProfile } from "../../app/lib/server/typed-authoring-readiness";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import {
  applyTypedAuthoring,
  loadTypedAuthoringWorkspace,
  proposeTypedAuthoring,
  type TypedAuthoringTransport,
  type TypedAuthoringAtomicCapability,
} from "../../app/lib/server/typed-authoring-repository";
import {
  typedAuthoringCommandSha256,
  TypedAuthoringError,
} from "../../app/lib/server/typed-authoring-contract";
async function fixture(
  profile: TypedAuthoringReadinessProfile = TYPED_AUTHORING_READINESS_PROFILE,
) {
  const f = await createRequirementContextFixture({ confirm: true });
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "read_typed_authoring_readiness")
        return {
          data: {
            ...profile,
            schemaReady: true,
            writerExecutable: true,
          },
          error: null,
        };
      return { data: structuredClone(f.context), error: null };
    },
  } as unknown as Parameters<typeof loadTypedAuthoringWorkspace>[0];
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  return { ...f, client, calls, selection };
}
describe("owned typed authoring repository", () => {
  it("requires explicit transport and atomic capabilities, without default IO", async () => {
    const f = await fixture();
    expect(
      await proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
      ),
    ).toEqual({ state: "disabled", proposal: null });
    expect(f.calls).toHaveLength(0);
    const proposed = await proposeTypedAuthoring(
      f.client,
      f.owned.analysisId,
      f.owned.ownerId,
      f.selection,
      { execute: async () => ({ replacementAction: "Created" }) },
    );
    if (proposed.state !== "review_required")
      throw Error("EXPECTED_REAL_PROPOSAL");
    f.calls.length = 0;
    await expect(
      applyTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        proposed.proposal.acceptCommand,
        proposed.proposal.acceptCommand.idempotencyKey,
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(f.calls).toHaveLength(0);
  });
  it("reads actual owned snapshots twice before publishing exact decision tokens", async () => {
    const f = await fixture(),
      execute = vi.fn(async () => ({ replacementAction: "Created" }));
    const model = await proposeTypedAuthoring(
      f.client,
      f.owned.analysisId,
      f.owned.ownerId,
      f.selection,
      { execute },
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(f.calls.map((c) => c.name)).toEqual([
      "read_requirement_relationship_context",
      "read_requirement_relationship_context",
    ]);
    if (model.state !== "review_required")
      throw Error("EXPECTED_REAL_PROPOSAL");
    expect(model.proposal.patch.after).toBe(
      "Created services using PostgreSQL",
    );
    expect(model.proposal.acceptCommand.operation).toBe("accept");
    expect(model.proposal.rejectCommand.acknowledgement).toBe(false);
    expect(model.proposal.acceptCommand.idempotencyKey).not.toBe(
      model.proposal.rejectCommand.idempotencyKey,
    );
  });
  it("refuses unreliable source before transport", async () => {
    const f = await fixture(),
      execute = vi.fn();
    f.context.sourceMetadata.pageCount = null;
    await expect(
      proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute },
      ),
    ).rejects.toBeInstanceOf(TypedAuthoringError);
    expect(execute).not.toHaveBeenCalled();
  });
  it("withholds provider output after head movement", async () => {
    const f = await fixture();
    let reads = 0;
    const client = {
      rpc: async () => {
        const row = structuredClone(f.context);
        if (++reads === 2) {
          row.heads.canonicalHeadId = id(101);
          row.heads.canonicalHeadRevision++;
        }
        return { data: row, error: null };
      },
    } as unknown as typeof f.client;
    await expect(
      proposeTypedAuthoring(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute: async () => ({ replacementAction: "Created" }) },
      ),
    ).rejects.toMatchObject({ reason: "stale_inputs" });
    expect(reads).toBe(2);
  });
  it("refuses invalid transport results and cancels a bounded wait", async () => {
    const f = await fixture();
    await expect(
      proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute: async () => ({ replacementAction: "Led" }) },
      ),
    ).rejects.toMatchObject({ reason: "invalid_result" });
    const execute = vi.fn<TypedAuthoringTransport["execute"]>(
      async () => new Promise<unknown>(() => undefined),
    );
    await expect(
      proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute },
        { timeoutMs: 5 },
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(execute.mock.calls[0][0].signal.aborted).toBe(true);
  });
  it.each([
    TYPED_AUTHORING_READINESS_PROFILE,
    TYPED_AUTHORING_REGROUP_READINESS_PROFILE,
  ])(
    "applies only the retained exact command and validates the correlated receipt for checker $typedReadinessSha256",
    async (profile) => {
      const f = await fixture(profile);
      const model = await proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute: async () => ({ replacementAction: "Created" }) },
      );
      if (model.state !== "review_required")
        throw Error("EXPECTED_REAL_PROPOSAL");
      const command = model.proposal.acceptCommand;
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
        versionId: id(91),
        revision: command.binding.canonical.revision + 2,
        eventId: id(92),
        idempotent: false,
      };
      const apply = vi.fn<TypedAuthoringAtomicCapability["apply"]>(
        async () => ({
          data: receipt,
          error: null,
        }),
      );
      expect(
        await applyTypedAuthoring(
          f.client,
          f.owned.analysisId,
          f.owned.ownerId,
          command,
          command.idempotencyKey,
          { apply },
        ),
      ).toEqual(receipt);
      expect(f.calls.slice(-2)).toEqual([
        {
          name: "read_requirement_relationship_context",
          args: {
            p_user_id: f.owned.ownerId,
            p_analysis_id: f.owned.analysisId,
            p_selection: {
              canonicalVersionId: command.binding.canonical.versionId,
              requirementVersionId: command.binding.requirements.versionId,
            },
          },
        },
        { name: "read_typed_authoring_readiness", args: {} },
      ]);
      expect(apply.mock.calls[0][0].p_command).toEqual(command);
      await expect(
        applyTypedAuthoring(
          f.client,
          f.owned.analysisId,
          f.owned.ownerId,
          { ...command, coverageDigest: "f".repeat(64) },
          command.idempotencyKey,
          { apply },
        ),
      ).rejects.toMatchObject({ reason: "stale_inputs" });
      expect(apply).toHaveBeenCalledOnce();
    },
  );
  it("allows SQL exact replay with original captures after current heads move", async () => {
    const f = await fixture();
    const model = await proposeTypedAuthoring(
      f.client,
      f.owned.analysisId,
      f.owned.ownerId,
      f.selection,
      { execute: async () => ({ replacementAction: "Created" }) },
    );
    if (model.state !== "review_required")
      throw Error("EXPECTED_REAL_PROPOSAL");
    const command = model.proposal.rejectCommand;
    f.context.heads.canonicalHeadId = id(150);
    f.context.heads.canonicalHeadRevision++;
    const apply = vi.fn(async (args: { p_command: typeof command }) => ({
      data: {
        schemaVersion: "typed-authoring-receipt/1.0.0",
        status: "applied",
        action: "reject",
        idempotencyKey: command.idempotencyKey,
        commandSha256: typedAuthoringCommandSha256(command),
        baseVersionId: command.binding.canonical.versionId,
        baseRevision: command.binding.canonical.revision,
        requirementVersionId: command.binding.requirements.versionId,
        requirementRevision: command.binding.requirements.revision,
        versionId: command.binding.canonical.versionId,
        revision: command.binding.canonical.revision,
        eventId: id(151),
        idempotent: true,
      },
      error: args.p_command === undefined ? {} : null,
    }));
    expect(
      (
        await applyTypedAuthoring(
          f.client,
          f.owned.analysisId,
          f.owned.ownerId,
          command,
          command.idempotencyKey,
          { apply },
        )
      ).idempotent,
    ).toBe(true);
    expect(apply.mock.calls[0][0].p_command.binding.heads).toEqual(
      command.binding.heads,
    );
    expect(f.calls.at(-1)).toEqual({
      name: "read_typed_authoring_readiness",
      args: {},
    });
  });
  it("maps synchronous transport throws without an orphan rejection", async () => {
    const f = await fixture();
    const execute = vi.fn(() => {
      throw Error("SYNTHETIC_SYNC_TRANSPORT_THROW");
    });
    await expect(
      proposeTypedAuthoring(
        f.client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute },
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(execute).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  it("cancels an in-flight final owned read without publishing", async () => {
    const f = await fixture();
    let reads = 0;
    const client = {
      rpc: async () =>
        ++reads === 1
          ? { data: structuredClone(f.context), error: null }
          : new Promise<never>(() => undefined),
    } as unknown as typeof f.client;
    await expect(
      proposeTypedAuthoring(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        f.selection,
        { execute: async () => ({ replacementAction: "Created" }) },
        { timeoutMs: 50 },
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(reads).toBe(2);
  }, 500);
});
