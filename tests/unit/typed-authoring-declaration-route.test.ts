import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import type { executeTypedAuthoringHttp } from "../../app/lib/server/typed-authoring-http";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { TYPED_AUTHORING_READINESS_PROFILE } from "../../app/lib/server/typed-authoring-readiness-profile";
import {
  typedAuthoringCommandSha256,
  type TypedAuthoringCommand,
} from "../../app/lib/server/typed-authoring-protocol";
import {
  buildTypedAuthoringPatch as buildOldPatch,
  createTypedAuthoringCommand as createOldCommand,
} from "../../app/lib/server/typed-authoring-contract";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("UNEXPECTED_PROVIDER_REQUEST");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("previews the actual edited confirmed whole declaration without inventing a current source quote", async () => {
  const f = await createRequirementContextFixture({
    edit: "Built database services using PostgreSQL",
    confirm: true,
  });
  const fact = f.context.canonical.content.facts.find(
    (value) => value.id === f.targetFactId,
  );
  expect(fact?.sources).toEqual([]);
  expect(fact?.confirmation?.value).toBe(
    "Built database services using PostgreSQL",
  );
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const rpc = vi.fn(async (name: string) => {
    if (name !== "read_requirement_relationship_context")
      throw Error("UNEXPECTED_WRITE_OR_METADATA_READ");
    return { data: structuredClone(f.context), error: null };
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
  const response = await action({
    request: new Request(
      `https://example.test/analysis/${f.owned.analysisId}/author/typed`,
      {
        method: "POST",
        headers: { Origin: "https://example.test" },
        body: new URLSearchParams({
          action: "preview",
          selection: JSON.stringify(selection),
        }),
      },
    ),
    params: { id: f.owned.analysisId },
  });
  const result = await response.json();
  expect({ status: response.status, kind: result.kind }).toEqual({
    status: 200,
    kind: "proposal",
  });
  expect(result.proposal.patch).toMatchObject({
    schemaVersion: "typed-authoring-patch/1.1.0",
    before: fact?.value,
    support: {
      basis: "candidate_declaration",
      sourceClause: null,
      offsetSpace: "current_fact",
    },
    sourceCitations: [],
    scoreValue: null,
    scoreDelta: null,
  });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_requirement_relationship_context",
    "read_requirement_relationship_context",
  ]);
  expect(from).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

async function setup(
  options: Parameters<typeof createRequirementContextFixture>[0] = {},
) {
  const f = await createRequirementContextFixture({
    edit: "Created database services using PostgreSQL",
    confirm: true,
    ...options,
  });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  type Result = { data: unknown; error: unknown };
  const rpc = vi.fn<(name: string, args: unknown) => Promise<Result>>(
    async (name) => {
      if (name === "read_requirement_relationship_context")
        return { data: structuredClone(f.context), error: null };
      if (name === "read_typed_authoring_readiness")
        return {
          data: {
            ...TYPED_AUTHORING_READINESS_PROFILE,
            schemaReady: true,
            writerExecutable: true,
          },
          error: null,
        };
      throw Error("UNEXPECTED_WRITE_RPC");
    },
  );
  const from = vi.fn(() => {
    throw Error("UNEXPECTED_TABLE_FALLBACK");
  });
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.server.mockReturnValue({ kind: "authenticated" });
  mocks.admin.mockReturnValue({ rpc, from });
  const post = (fields: Record<string, string>) =>
    action({
      request: new Request(
        `https://example.test/analysis/${f.owned.analysisId}/author/typed`,
        {
          method: "POST",
          headers: { Origin: "https://example.test" },
          body: new URLSearchParams(fields),
        },
      ),
      params: { id: f.owned.analysisId },
    });
  return { ...f, rpc, from, selection, post };
}

it.each(["unconfirmed", "compound", "foreign_selection"] as const)(
  "keeps the actual %s declaration consumer from producing a proposal",
  async (kind) => {
    const f = await setup(
      kind === "unconfirmed"
        ? { confirm: false }
        : kind === "compound"
          ? { edit: "Created database services using PostgreSQL and Python" }
          : {},
    );
    const selection =
      kind === "foreign_selection"
        ? {
            ...f.selection,
            canonicalVersionId: "40000000-0000-4000-8000-000000000099",
          }
        : f.selection;
    const response = await f.post({
      action: "preview",
      selection: JSON.stringify(selection),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).kind).toBe("error");
    expect(
      f.rpc.mock.calls.every(
        ([name]) => name === "read_requirement_relationship_context",
      ),
    ).toBe(true);
    expect(f.from).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("dispatches and replays the actual 1.1 declaration command without changing its original captures", async () => {
  const f = await setup();
  const preview = await f.post({
    action: "preview",
    selection: JSON.stringify(f.selection),
  });
  expect(preview.status).toBe(200);
  const { proposal } = await preview.json();
  expect(proposal.patch.schemaVersion).toBe("typed-authoring-patch/1.1.0");
  expect(proposal.patch.after).toBe(
    "Developed database services using PostgreSQL",
  );
  expect(proposal.patch.sourceCitations).toEqual([]);
  const command: TypedAuthoringCommand = proposal.acceptCommand;
  const originalBytes = JSON.stringify(command);
  const edited = reviseCanonical(f.context.canonical.content, {
    operation: "edit",
    factId: f.targetFactId,
    value: proposal.patch.after,
  });
  const confirmed = reviseCanonical(edited, {
    operation: "confirm",
    factId: f.targetFactId,
  });
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
    versionId: confirmed.versionId,
    revision: command.binding.canonical.revision + 2,
    eventId: "40000000-0000-4000-8000-000000000098",
    idempotent: false,
  };
  let writes = 0;
  f.rpc.mockImplementation(async (name) => {
    if (name === "read_requirement_relationship_context")
      return { data: structuredClone(f.context), error: null };
    if (name === "read_typed_authoring_readiness")
      return {
        data: {
          ...TYPED_AUTHORING_READINESS_PROFILE,
          schemaReady: true,
          writerExecutable: true,
        },
        error: null,
      };
    if (name === "apply_typed_authoring_action")
      return { data: { ...receipt, idempotent: writes++ > 0 }, error: null };
    throw Error("UNEXPECTED_RPC");
  });
  const fields = {
    action: "decision",
    command: originalBytes,
    reviewAcknowledgement: "accepted",
  };
  expect(await (await f.post(fields)).json()).toEqual({
    kind: "applied",
    receipt,
  });
  f.context.heads.canonicalHeadId = confirmed.versionId;
  f.context.heads.canonicalHeadRevision = receipt.revision;
  expect(await (await f.post(fields)).json()).toEqual({
    kind: "applied",
    receipt: { ...receipt, idempotent: true },
  });
  const calls = f.rpc.mock.calls.filter(
    ([name]) => name === "apply_typed_authoring_action",
  );
  expect(calls).toHaveLength(2);
  for (const [, args] of calls)
    expect(args).toEqual({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: command,
      p_request_id: command.idempotencyKey,
    });
  expect(
    f.rpc.mock.calls.filter(
      ([name]) => name === "read_typed_authoring_readiness",
    ),
  ).toHaveLength(2);
  expect(JSON.stringify(command)).toBe(originalBytes);
  expect(fetch).not.toHaveBeenCalled();
});

it("retains the exact original 1.0 command through the versioned resource", async () => {
  const f = await setup({ edit: undefined });
  const patch = buildOldPatch(f.context, f.selection, "Created");
  const command = createOldCommand(
    patch,
    "reject",
    "40000000-0000-4000-8000-000000000097",
    false,
  );
  const originalBytes = JSON.stringify(command);
  const receipt = {
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
    eventId: "40000000-0000-4000-8000-000000000096",
    idempotent: true,
  };
  f.rpc.mockImplementation(async (name) => {
    if (name === "read_requirement_relationship_context")
      return { data: structuredClone(f.context), error: null };
    if (name === "read_typed_authoring_readiness")
      return {
        data: {
          ...TYPED_AUTHORING_READINESS_PROFILE,
          schemaReady: true,
          writerExecutable: true,
        },
        error: null,
      };
    if (name === "apply_typed_authoring_action")
      return { data: receipt, error: null };
    throw Error("UNEXPECTED_RPC");
  });
  const response = await f.post({ action: "decision", command: originalBytes });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "applied", receipt });
  expect(f.rpc.mock.calls.at(-1)).toEqual([
    "apply_typed_authoring_action",
    {
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: command,
      p_request_id: command.idempotencyKey,
    },
  ]);
  expect(JSON.stringify(command)).toBe(originalBytes);
});
