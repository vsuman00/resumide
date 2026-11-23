import { beforeEach, expect, it, vi } from "vitest";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId as id,
} from "../fixtures/jd-clause-order";
import { createJdClauseOrderStore } from "../fixtures/jd-clause-order-store";
import { buildClauseOrderProposal } from "../../app/lib/server/clause-order-authoring";
import { JdClauseOrderWorkspaceSchema } from "../../app/lib/jd-clause-order-decisions";
const mocks = vi.hoisted(() => ({
  flags: {
    SCORING_V2_ENABLED: true,
    AUTHORING_ENABLED: true,
    TYPED_AUTHORING_ENABLED: true,
    CANONICAL_REWRITE_ENABLED: false,
    ARTIFACT_RENDERING_ENABLED: false,
  },
  user: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
  workspace: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => mocks.flags,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/jd-clause-order-repository", () => ({
  loadJdClauseOrderWorkspace: mocks.workspace,
}));
vi.mock("../../app/lib/server/typed-authoring-repository", () => ({
  loadTypedAuthoringWorkspace: mocks.legacy,
}));
import { loader, action } from "../../app/routes/analysis.score";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.flags.SCORING_V2_ENABLED = true;
  mocks.flags.AUTHORING_ENABLED = true;
  mocks.flags.TYPED_AUTHORING_ENABLED = true;
  mocks.legacy.mockResolvedValue(null);
  mocks.server.mockImplementation((_request: Request, h: Headers) => {
    h.append("Set-Cookie", "synthetic=session");
    return {};
  });
});
async function fixture() {
  const f = await createJdClauseOrderFixture({ header: "Experience" }),
    store = createJdClauseOrderStore(f.context);
  const proposal = buildClauseOrderProposal(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    },
  );
  const workspace = JdClauseOrderWorkspaceSchema.parse({
    schemaVersion: "jd-clause-order-workspace/2.0.0",
    binding: proposal.draft.binding,
    proposals: [proposal],
    inspectedPairCount: 1,
    truncated: false,
  });
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.admin.mockReturnValue(store.client);
  mocks.workspace.mockResolvedValue(workspace);
  return { ...f, store, workspace };
}
function args(f: Awaited<ReturnType<typeof fixture>>, query = "") {
  return {
    request: new Request(
      `https://example.test/analysis/${f.owned.analysisId}/score${query}`,
    ),
    params: { id: f.owned.analysisId },
  };
}
it("publishes real owned producer workspace beside matching score/source/pair and private cookies", async () => {
  const f = await fixture(),
    input = args(f),
    result = await loader(input);
  expect(result.data.jdClauseOrderWorkspace).toEqual(f.workspace);
  expect(result.data.jdClauseOrderSource).toEqual(f.context.source);
  expect(mocks.workspace).toHaveBeenCalledExactlyOnceWith(
    f.store.client,
    f.owned.analysisId,
    f.owned.ownerId,
    {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
    },
    { enabled: true, signal: input.request.signal },
  );
  const h = new Headers(result.init?.headers);
  expect(h.get("Cache-Control")).toBe("private, no-store");
  expect(h.get("Set-Cookie")).toBe("synthetic=session");
  expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
});
it.each<["AUTHORING_ENABLED" | "TYPED_AUTHORING_ENABLED"]>([
  ["AUTHORING_ENABLED"],
  ["TYPED_AUTHORING_ENABLED"],
])(
  "does no new workspace read or serialization when %s is off",
  async (flag) => {
    const f = await fixture();
    mocks.flags[flag] = false;
    const result = await loader(args(f));
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(Object.hasOwn(result.data, "jdClauseOrderWorkspace")).toBe(false);
    expect(Object.hasOwn(result.data, "jdClauseOrderSource")).toBe(false);
  },
);
it("keeps scoring disabled before auth/admin/new workspace work", async () => {
  const f = await fixture();
  mocks.flags.SCORING_V2_ENABLED = false;
  await expect(loader(args(f))).rejects.toMatchObject({
    init: { status: 404 },
  });
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("redirects signed out requests without private workspace work", async () => {
  const f = await fixture();
  mocks.user.mockResolvedValue(null);
  try {
    await loader(args(f));
    throw Error("EXPECTED_REDIRECT");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    if (!(error instanceof Response)) throw error;
    expect(error.status).toBe(302);
    expect(error.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("keeps the trusted source and readonly plan when the writer read is unavailable", async () => {
  const f = await fixture();
  mocks.workspace.mockResolvedValue(null);
  const result = await loader(args(f));
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(result.data.jdClauseOrderSource).toEqual(f.context.source);
  expect(result.data.jdClauseOrderPlan?.drafts).toHaveLength(1);
});
it("keeps the historical source mount without asking for a fresh decision workspace", async () => {
  const f = await fixture(),
    prior = f.context.ancestors[0],
    history = structuredClone(f.context);
  history.canonical = { ...prior, locale: prior.content.locale };
  history.ancestors = [];
  history.headerSnapshot = {
    ...history.headerSnapshot,
    canonicalVersionId: prior.versionId,
    canonicalContentSha256: prior.contentSha256,
  };
  f.store.rpc.mockResolvedValue({ data: history, error: null });
  const result = await loader(args(f, `?canonical=${prior.versionId}`));
  expect(result.data.historical).toBe(true);
  expect(result.data.jdClauseOrderSource).toEqual(f.context.source);
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(result.data.canonical.versionId).toBe(prior.versionId);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("withholds a different actual producer pair instead of rebinding it to the displayed score", async () => {
  const f = await fixture(),
    other = await fixture();
  mocks.admin.mockReturnValue(f.store.client);
  mocks.workspace.mockResolvedValue(other.workspace);
  const result = await loader(args(f));
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(result.data.jdClauseOrderSource).toEqual(f.context.source);
  expect(result.data.canonical.versionId).toBe(f.context.canonical.versionId);
});
it("withholds foreign owner/source metadata without serializing it", async () => {
  const f = await fixture();
  mocks.workspace.mockResolvedValue({
    ...f.workspace,
    binding: {
      ...f.workspace.binding,
      source: { ...f.context.source, ownerId: id(999) },
    },
  });
  const result = await loader(args(f));
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(JSON.stringify(result.data)).not.toContain(id(999));
});
it("withholds a tampered command hash even when its workspace binding matches", async () => {
  const f = await fixture(),
    p = f.workspace.proposals[0];
  mocks.workspace.mockResolvedValue({
    ...f.workspace,
    proposals: [{ ...p, acceptCommandSha256: "0".repeat(64) }],
  });
  const result = await loader(args(f));
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(result.data.jdClauseOrderSource).toEqual(f.context.source);
});
it("keeps diagnostics and private headers when a bounded owned read fails", async () => {
  const f = await fixture();
  mocks.workspace.mockRejectedValue(Error("synthetic-private-error"));
  const result = await loader(args(f));
  expect(result.data.jdClauseOrderWorkspace).toBeNull();
  expect(
    result.data.diagnostics.score.dimensions.every((d) => d.value === null),
  ).toBe(true);
  expect(JSON.stringify(result.data)).not.toContain("synthetic-private-error");
  expect(new Headers(result.init?.headers).get("Cache-Control")).toBe(
    "private, no-store",
  );
});
it("rejects query activation and preserves the score route's readonly action", async () => {
  const f = await fixture();
  await expect(loader(args(f, "?clauseOrder=true"))).rejects.toMatchObject({
    init: { status: 422 },
  });
  expect(mocks.workspace).not.toHaveBeenCalled();
  const result = action();
  expect(result.init?.status).toBe(405);
  expect(new Headers(result.init?.headers).get("Allow")).toBe("GET");
});
