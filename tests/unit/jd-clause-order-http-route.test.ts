import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId as id,
} from "../fixtures/jd-clause-order";
import {
  buildClauseOrderProposal,
  clauseOrderCommandSha256,
} from "../../app/lib/server/clause-order-authoring";
import { JD_CLAUSE_ORDER_READINESS_PROFILE } from "../../app/lib/server/jd-clause-order-readiness-profile";
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
import { action, loader } from "../../app/routes/analysis.author.clause-order";
let fixture: Awaited<ReturnType<typeof createJdClauseOrderFixture>>,
  proposal: ReturnType<typeof buildClauseOrderProposal>;
type RpcResult = { data: unknown; error: unknown };
type RpcTask = Promise<RpcResult> & {
  abortSignal(signal: AbortSignal): RpcTask;
};
let rpc: ReturnType<typeof vi.fn<(name: string, args: unknown) => RpcTask>>;
let write: unknown, capability: boolean;
beforeAll(async () => {
  fixture = await createJdClauseOrderFixture({ confirm: true });
  proposal = buildClauseOrderProposal(
    fixture.context,
    { analysisId: fixture.owned.analysisId, ownerId: fixture.owned.ownerId },
    {
      canonicalVersionId: fixture.context.canonical.versionId,
      requirementVersionId: fixture.context.requirements.versionId,
      clauseId: fixture.context.requirements.content.relations.clauses[0].id,
      targetFactId: fixture.targetFactId,
    },
    { acceptKey: id(70), rejectKey: id(71) },
  );
});
function receipt(operation: "accept" | "reject" = "accept") {
  const c =
    operation === "accept" ? proposal.acceptCommand : proposal.rejectCommand;
  return {
    schemaVersion: "jd-clause-order-receipt/2.0.0",
    status: "applied",
    action: c.operation,
    idempotencyKey: c.idempotencyKey,
    commandSha256: clauseOrderCommandSha256(c),
    draftId: c.draftId,
    baseVersionId: c.binding.canonical.versionId,
    baseRevision: c.binding.canonical.revision,
    requirementVersionId: c.binding.requirements.versionId,
    requirementRevision: c.binding.requirements.revision,
    versionId: operation === "accept" ? id(72) : c.binding.canonical.versionId,
    revision: c.binding.canonical.revision + (operation === "accept" ? 2 : 0),
    eventId: id(73),
    idempotent: false,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.flags, {
    SCORING_V2_ENABLED: true,
    AUTHORING_ENABLED: true,
    TYPED_AUTHORING_ENABLED: true,
  });
  mocks.user.mockResolvedValue({ id: fixture.owned.ownerId });
  mocks.server.mockImplementation((_request: Request, headers: Headers) => {
    headers.append("Set-Cookie", "synthetic_session=refreshed; HttpOnly");
    return {};
  });
  capability = true;
  write = receipt();
  rpc = vi.fn((name: string) => {
    const reply = (result: RpcResult): RpcTask => {
      const task = Object.assign(Promise.resolve(result), {
        abortSignal: (signal: AbortSignal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          return task;
        },
      });
      return task;
    };
    if (name === "read_requirement_relationship_context")
      return reply({ data: structuredClone(fixture.context), error: null });
    if (name === "read_jd_clause_order_readiness")
      return reply({
        data: {
          ...JD_CLAUSE_ORDER_READINESS_PROFILE,
          schemaReady: true,
          writerExecutable: capability,
        },
        error: null,
      });
    if (name === "apply_jd_clause_order_action")
      return reply({ data: write, error: null });
    throw Error("UNEXPECTED_NATIVE_RPC");
  });
  mocks.admin.mockReturnValue({ rpc });
});
function request(
  values: Record<string, string> = {
    action: "decision",
    command: JSON.stringify(proposal.acceptCommand),
    reviewAcknowledgement: "accepted",
  },
  method = "POST",
  origin = "https://example.test",
) {
  return new Request(
    `https://example.test/analysis/${fixture.owned.analysisId}/author/clause-order`,
    { method, body: new URLSearchParams(values), headers: { Origin: origin } },
  );
}
const submit = (req = request(), analysisId = fixture.owned.analysisId) =>
  action({ request: req, params: { id: analysisId } });
it("is POST-only and never constructs clients on loader/method rejection", async () => {
  const get = loader();
  expect(get.status).toBe(405);
  expect(get.headers.get("Allow")).toBe("POST");
  expect(get.headers.get("Cache-Control")).toBe("private, no-store");
  const result = await submit(request(undefined, "PUT"));
  expect(result.status).toBe(405);
  expect(mocks.server).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each([
  "SCORING_V2_ENABLED",
  "AUTHORING_ENABLED",
  "TYPED_AUTHORING_ENABLED",
] as const)(
  "preserves default-off %s before authentication/admin/read/write",
  async (flag) => {
    mocks.flags[flag] = false;
    const result = await submit();
    expect(result.status).toBe(404);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("requires same origin and auth before admin construction, preserving refresh cookies", async () => {
  expect(
    (await submit(request(undefined, "POST", "https://attacker.test"))).status,
  ).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce(null);
  const result = await submit();
  expect(result.status).toBe(401);
  expect(result.headers.get("Set-Cookie")).toContain(
    "synthetic_session=refreshed",
  );
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects invalid owned identifiers and malformed/duplicate forms before admin construction", async () => {
  expect((await submit(request(), "invalid")).status).toBe(422);
  const body = new URLSearchParams({
    action: "decision",
    command: JSON.stringify(proposal.acceptCommand),
    reviewAcknowledgement: "accepted",
  });
  body.append("action", "decision");
  const req = new Request(
    `https://example.test/analysis/${fixture.owned.analysisId}/author/clause-order`,
    { method: "POST", body, headers: { Origin: "https://example.test" } },
  );
  expect((await submit(req)).status).toBe(422);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("uses actual owned context/profile and real repository RPC, returning only strict2 with no-store and refreshed cookie", async () => {
  const response = await submit();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "applied", receipt: write });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(response.headers.get("Set-Cookie")).toContain(
    "synthetic_session=refreshed",
  );
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "read_requirement_relationship_context",
    "read_jd_clause_order_readiness",
    "apply_jd_clause_order_action",
  ]);
  expect(rpc.mock.calls.at(-1)?.[1]).toEqual({
    p_user_id: fixture.owned.ownerId,
    p_analysis_id: fixture.owned.analysisId,
    p_command: proposal.acceptCommand,
    p_request_id: proposal.acceptCommand.idempotencyKey,
  });
});
it("rejects missing acknowledgement before any write and supports explicit rejection without it", async () => {
  expect(
    (
      await submit(
        request({
          action: "decision",
          command: JSON.stringify(proposal.acceptCommand),
        }),
      )
    ).status,
  ).toBe(422);
  expect(rpc).not.toHaveBeenCalled();
  write = receipt("reject");
  const response = await submit(
    request({
      action: "decision",
      command: JSON.stringify(proposal.rejectCommand),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "applied", receipt: write });
});
it("never bypasses denied actual writer capability or falls back to older writers", async () => {
  capability = false;
  const response = await submit();
  expect(response.status).toBe(503);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "read_requirement_relationship_context",
    "read_jd_clause_order_readiness",
  ]);
  expect(await response.json()).toMatchObject({
    kind: "error",
    recovery: "retry_exact",
  });
});
it.each([
  { data: { status: "conflict" }, status: 409, recovery: "review_again" },
  {
    data: { schemaVersion: "typed-authoring-receipt/1.0.0" },
    status: 503,
    recovery: "retry_exact",
  },
  {
    data: { private: "PRIVATE_TRANSPORT_CANARY" },
    status: 503,
    recovery: "retry_exact",
  },
])(
  "keeps $status response recovery honest and never retries internally",
  async ({ data, status, recovery }) => {
    write = data;
    const response = await submit();
    expect(response.status).toBe(status);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ kind: "error", recovery });
    expect(body).not.toContain("PRIVATE_TRANSPORT_CANARY");
    expect(
      rpc.mock.calls.filter((c) => c[0] === "apply_jd_clause_order_action"),
    ).toHaveLength(1);
  },
);
