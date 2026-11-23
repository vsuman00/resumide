import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  createTypedAuthoringCommand,
  typedAuthoringCommandSha256,
  type TypedAuthoringCommand,
} from "../../app/lib/server/typed-authoring-contract";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import type { executeTypedAuthoringHttp } from "../../app/lib/server/typed-authoring-http";
import { TYPED_AUTHORING_READINESS_PROFILE } from "../../app/lib/server/typed-authoring-readiness-profile";

const mocks = vi.hoisted(() => ({
  flags: {
    SCORING_V2_ENABLED: true,
    AUTHORING_ENABLED: true,
    TYPED_AUTHORING_ENABLED: true,
    APP_ORIGIN: "https://example.test",
  },
  user: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => mocks.flags,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: mocks.server,
  createSupabaseAdminClient: mocks.admin,
}));
import { action } from "../../app/routes/analysis.author.typed";

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });
async function fixture() {
  const f = await createRequirementContextFixture({ confirm: true });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const patch = buildTypedAuthoringPatch(f.context, selection, "Created");
  const command = createTypedAuthoringCommand(patch, "accept", id(800), true);
  const reads: { name: string; args: unknown }[] = [];
  const readiness: { result: Result } = {
    result: {
      data: null,
      error: { code: "42883", message: "PRIVATE_READINESS_UNAVAILABLE" },
    },
  };
  let document = reviseCanonical(f.context.canonical.content, {
    operation: "edit",
    factId: command.target.factId,
    value: patch.after,
  });
  document = reviseCanonical(document, {
    operation: "confirm",
    factId: command.target.factId,
  });
  const receiptFor = (wire: TypedAuthoringCommand, idempotent = false) => ({
    schemaVersion: "typed-authoring-receipt/1.0.0",
    status: "applied",
    action: wire.operation,
    idempotencyKey: wire.idempotencyKey,
    commandSha256: typedAuthoringCommandSha256(wire),
    baseVersionId: wire.binding.canonical.versionId,
    baseRevision: wire.binding.canonical.revision,
    requirementVersionId: wire.binding.requirements.versionId,
    requirementRevision: wire.binding.requirements.revision,
    versionId:
      wire.operation === "accept"
        ? document.versionId
        : wire.binding.canonical.versionId,
    revision:
      wire.binding.canonical.revision + (wire.operation === "accept" ? 2 : 0),
    eventId: id(801),
    idempotent,
  });
  const rpc = vi.fn(async (name: string, args: unknown): Promise<Result> => {
    reads.push({ name, args });
    if (name === "read_requirement_relationship_context")
      return ok(structuredClone(f.context));
    if (name === "read_typed_authoring_readiness") return readiness.result;
    if (name === "apply_typed_authoring_action") return ok(receiptFor(command));
    throw Error("UNEXPECTED_RPC");
  });
  const from = vi.fn(() => {
    throw Error("UNEXPECTED_TABLE_FALLBACK");
  });
  const client = { rpc, from } as unknown as Parameters<
    typeof executeTypedAuthoringHttp
  >[0];
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.server.mockReturnValue({ kind: "authenticated" });
  mocks.admin.mockReturnValue(client);
  const submit = (wire: TypedAuthoringCommand = command) =>
    action({
      request: new Request(
        `https://example.test/analysis/${f.owned.analysisId}/author/typed`,
        {
          method: "POST",
          headers: { Origin: "https://example.test" },
          body: new URLSearchParams({
            action: "decision",
            command: JSON.stringify(wire),
            ...(wire.operation === "accept"
              ? { reviewAcknowledgement: "accepted" }
              : {}),
          }),
        },
      ),
      params: { id: f.owned.analysisId },
    });
  return {
    ...f,
    patch,
    command,
    reads,
    readiness,
    rpc,
    from,
    submit,
    receiptFor,
  };
}
// Catalog metadata is a synthetic RPC fixture using the actual source profile.
// A future optional service grant is simulated; no native grant or SQL run is claimed.
const ready = () => ({
  ...TYPED_AUTHORING_READINESS_PROFILE,
  schemaReady: true,
  writerExecutable: true,
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe("owned typed readiness admission through the real HTTP route", () => {
  it("refuses a missing native readiness RPC before any typed writer dispatch", async () => {
    const f = await fixture();
    const response = await f.submit();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
    ]);
    expect(
      f.rpc.mock.calls.filter(
        ([name]) => name === "apply_typed_authoring_action",
      ),
    ).toHaveLength(0);
    expect(f.from).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("keeps the valid staged writer denial separate from catalog integrity", async () => {
    const f = await fixture();
    f.readiness.result = ok({ ...ready(), writerExecutable: false });
    const response = await f.submit();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
    ]);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("refuses a catalog body hash drift after real owned proof without attempting a write", async () => {
    const f = await fixture();
    f.readiness.result = ok({ ...ready(), writerSha256: "f".repeat(64) });
    const response = await f.submit();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
    ]);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("admits only an exact ready profile between original owned proof and the exact command dispatch", async () => {
    const f = await fixture();
    f.readiness.result = ok(ready());
    const response = await f.submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "applied",
      receipt: f.receiptFor(f.command),
    });
    expect(f.reads).toEqual([
      {
        name: "read_requirement_relationship_context",
        args: {
          p_user_id: f.owned.ownerId,
          p_analysis_id: f.owned.analysisId,
          p_selection: {
            canonicalVersionId: f.command.binding.canonical.versionId,
            requirementVersionId: f.command.binding.requirements.versionId,
          },
        },
      },
      { name: "read_typed_authoring_readiness", args: {} },
      {
        name: "apply_typed_authoring_action",
        args: {
          p_user_id: f.owned.ownerId,
          p_analysis_id: f.owned.analysisId,
          p_command: f.command,
          p_request_id: f.command.idempotencyKey,
        },
      },
    ]);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("retains original versions, captures and command when readiness admits a historical exact replay", async () => {
    const f = await fixture();
    f.readiness.result = ok(ready());
    const original = structuredClone(f.command);
    const later = reviseCanonical(f.context.canonical.content, {
      operation: "confirm",
      factId: f.targetFactId,
    });
    f.context.heads.canonicalHeadId = later.versionId;
    f.context.heads.canonicalHeadRevision++;
    f.rpc.mockImplementation(async (name, args) => {
      f.reads.push({ name, args });
      if (name === "read_requirement_relationship_context")
        return ok(structuredClone(f.context));
      if (name === "read_typed_authoring_readiness") return f.readiness.result;
      if (name === "apply_typed_authoring_action")
        return ok(f.receiptFor(original, true));
      throw Error("UNEXPECTED_RPC");
    });
    const response = await f.submit(original);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "applied",
      receipt: f.receiptFor(original, true),
    });
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
      "apply_typed_authoring_action",
    ]);
    expect(f.reads[0].args).toMatchObject({
      p_selection: {
        canonicalVersionId: original.binding.canonical.versionId,
        requirementVersionId: original.binding.requirements.versionId,
      },
    });
    expect(f.reads[2].args).toEqual({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: original,
      p_request_id: original.idempotencyKey,
    });
    expect(f.command).toEqual(original);
  });
  it("refuses a malformed command before owned proof, metadata or writer access", async () => {
    const f = await fixture();
    const malformed = { ...f.command, schemaVersion: "untrusted-command/9" };
    const response = await action({
      request: new Request(
        `https://example.test/analysis/${f.owned.analysisId}/author/typed`,
        {
          method: "POST",
          headers: { Origin: "https://example.test" },
          body: new URLSearchParams({
            action: "decision",
            command: JSON.stringify(malformed),
            reviewAcknowledgement: "accepted",
          }),
        },
      ),
      params: { id: f.owned.analysisId },
    });
    expect(response.status).toBe(422);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a foreign command owner before any owned proof or readiness read", async () => {
    const f = await fixture();
    const command = structuredClone(f.command);
    command.binding.source.ownerId = id(802);
    const response = await f.submit(command);
    expect(response.status).toBe(422);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });
  it("keeps an owned privacy refusal ahead of readiness and exact-replay dispatch", async () => {
    const f = await fixture();
    f.rpc.mockImplementation(async (name, args) => {
      f.reads.push({ name, args });
      return ok({
        schemaVersion: "requirement-relationship-context/1.0.0",
        status: "not_found",
        scoringEligible: false,
      });
    });
    const response = await f.submit();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
    ]);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("rechecks fresh catalog metadata on the next exact attempt instead of caching readiness", async () => {
    const f = await fixture();
    f.readiness.result = ok(ready());
    expect((await f.submit()).status).toBe(200);
    f.readiness.result = ok({ ...ready(), writerExecutable: false });
    const second = await f.submit();
    expect(second.status).toBe(503);
    expect(f.reads.map((read) => read.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
      "apply_typed_authoring_action",
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
    ]);
    expect(
      f.reads.filter((read) => read.name === "apply_typed_authoring_action"),
    ).toHaveLength(1);
  });
});
