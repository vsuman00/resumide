/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createJdClauseOrderFixture } from "../fixtures/jd-clause-order";
import { createJdClauseOrderStore } from "../fixtures/jd-clause-order-store";
import { buildJdClauseOrderDraft } from "../../app/lib/server/jd-clause-order-drafting";
const mocks = vi.hoisted(() => ({
  flags: {
    SCORING_V2_ENABLED: true,
    AUTHORING_ENABLED: true,
    TYPED_AUTHORING_ENABLED: false,
    CANONICAL_REWRITE_ENABLED: false,
    ARTIFACT_RENDERING_ENABLED: false,
  },
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
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
import ScorePage, { loader } from "../../app/routes/analysis.score";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.flags.SCORING_V2_ENABLED = true;
  mocks.flags.AUTHORING_ENABLED = true;
  mocks.server.mockImplementation((_request: Request, headers: Headers) => {
    headers.append("Set-Cookie", "synthetic=session");
    return {};
  });
});
async function fixture(
  options: Parameters<typeof createJdClauseOrderFixture>[0] = {},
) {
  const f = await createJdClauseOrderFixture({
    header: "Experience",
    ...options,
  });
  const store = createJdClauseOrderStore(f.context);
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.admin.mockReturnValue(store.client);
  return { ...f, store };
}
function args(f: Awaited<ReturnType<typeof fixture>>, query = "") {
  return {
    request: new Request(
      `https://example.test/analysis/${f.owned.analysisId}/score${query}`,
    ),
    params: { id: f.owned.analysisId },
  };
}
async function page(f: Awaited<ReturnType<typeof fixture>>, query = "") {
  const results: Awaited<ReturnType<typeof loader>>[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/analysis/:id/score",
        loader: async (input) => {
          const result = await loader(input);
          results.push(result);
          return result;
        },
        Component: ScorePage,
      },
    ],
    { initialEntries: [`/analysis/${f.owned.analysisId}/score${query}`] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Review scoring diagnostics" });
  return { router, results };
}
it("renders actual owned source-to-plan-to-page previews with pinned inputs, private headers and no save authority", async () => {
  const f = await fixture();
  const { results } = await page(f);
  const view = within(
    await screen.findByRole("region", { name: "JD-focused wording previews" }),
  );
  const expected = buildJdClauseOrderDraft(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    },
  );
  expect(results[0].data.jdClauseOrderPlan?.drafts[0]).toEqual(expected);
  expect(
    view.getByRole("blockquote", { name: "Complete current wording" })
      .textContent,
  ).toBe(expected.before);
  expect(
    view.getByRole("blockquote", { name: "Complete proposed wording" })
      .textContent,
  ).toBe(expected.after);
  expect(
    view.getByRole("blockquote", { name: "Exact saved JD quote" }).textContent,
  ).toBe(expected.relevance.quote);
  expect(
    view.getByRole("blockquote", { name: "Whole quoted source claim" })
      .textContent,
  ).toBe(expected.before);
  expect(
    view
      .getByRole("link", {
        name: "Inspect the current fact and pinned version",
      })
      .getAttribute("href"),
  ).toBe(
    `/analysis/${f.owned.analysisId}/canonical?version=${expected.binding.canonical.versionId}#fact-${f.targetFactId}`,
  );
  expect(
    view
      .getByRole("link", { name: "Inspect the saved job requirements" })
      .getAttribute("href"),
  ).toBe(
    `/analysis/${f.owned.analysisId}/requirements?version=${expected.binding.requirements.versionId}`,
  );
  expect(
    screen.getByText(
      /Reviewed saving is unavailable for these projected previews/u,
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText(/Proposals are paused for typed job requirements/u),
  ).toBeNull();
  expect(view.queryAllByRole("button")).toHaveLength(0);
  expect(view.queryAllByRole("checkbox")).toHaveLength(0);
  expect(new Headers(results[0].init?.headers).get("Cache-Control")).toBe(
    "private, no-store",
  );
  expect(new Headers(results[0].init?.headers).get("X-Robots-Tag")).toBe(
    "noindex, nofollow",
  );
  expect(new Headers(results[0].init?.headers).get("Set-Cookie")).toBe(
    "synthetic=session",
  );
  expect(f.store.rpc.mock.calls.map((call) => call[0])).toEqual([
    "read_requirement_relationship_context",
    "read_requirement_relationship_context",
  ]);
});
it("keeps the existing authoring default-off path free of plan data and preserves the old paused message", async () => {
  const f = await fixture();
  mocks.flags.AUTHORING_ENABLED = false;
  const { results } = await page(f);
  expect(results[0].data).not.toHaveProperty("jdClauseOrderPlan");
  expect(
    screen.queryByRole("region", { name: "JD-focused wording previews" }),
  ).toBeNull();
  expect(
    screen.getByText(/Proposals are paused for typed job requirements/u),
  ).toBeTruthy();
});
it("requires verified sign-in before privileged owned reads", async () => {
  const f = await fixture();
  mocks.user.mockResolvedValue(null);
  await expect(loader(args(f))).rejects.toMatchObject({ status: 302 });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(f.store.rpc).not.toHaveBeenCalled();
});
it("keeps scoring disabled before auth or privileged reads", async () => {
  const f = await fixture();
  mocks.flags.SCORING_V2_ENABLED = false;
  await expect(loader(args(f))).rejects.toMatchObject({
    init: { status: 404 },
  });
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each<[string]>([["clauseOrderPreview=true"], ["authoring=true"]])(
  "refuses public activation query %s before the client boundary",
  async (query) => {
    const f = await fixture();
    await expect(loader(args(f, `?${query}`))).rejects.toMatchObject({
      init: { status: 422 },
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it("keeps exact historical inputs and shows refusal instead of substituting current heads", async () => {
  const f = await fixture();
  const prior = f.context.ancestors[0];
  const historical = structuredClone(f.context);
  historical.canonical = {
    versionId: prior.versionId,
    revision: prior.revision,
    contentSha256: prior.contentSha256,
    locale: prior.content.locale,
    content: prior.content,
  };
  historical.ancestors = [];
  historical.headerSnapshot = {
    ...historical.headerSnapshot,
    canonicalVersionId: prior.versionId,
    canonicalContentSha256: prior.contentSha256,
  };
  f.store.rpc.mockResolvedValue({ data: historical, error: null });
  const { results } = await page(f, `?canonical=${prior.versionId}`);
  const view = within(
    await screen.findByRole("region", { name: "JD-focused wording previews" }),
  );
  expect(results[0].data.canonical.versionId).toBe(prior.versionId);
  expect(results[0].data.jdClauseOrderPlan?.reason).toBe("historical_inputs");
  expect(
    view.getByText(
      /Fresh clause-order previews are unavailable for these historical input versions/u,
    ),
  ).toBeTruthy();
  expect(
    view.queryByRole("blockquote", { name: "Complete proposed wording" }),
  ).toBeNull();
});
it("explains no admitted pair without calling it no room for improvement", async () => {
  const f = await fixture({ clauses: ["Built services using Python"] });
  const { results } = await page(f);
  const region = await screen.findByRole("region", {
    name: "JD-focused wording previews",
  });
  expect(results[0].data.jdClauseOrderPlan?.reason).toBe("no_admitted_pairs");
  expect(
    within(region).getByText(
      /No clause-order draft was admitted among the candidate pairs examined/u,
    ),
  ).toBeTruthy();
  expect(region.textContent).not.toMatch(
    /nothing to improve|no improvements|eligible total/iu,
  );
  expect(
    screen.getByRole("heading", { name: "JD review priorities" }),
  ).toBeTruthy();
});
it("keeps diagnostics and JD priorities when source coverage makes previews unavailable", async () => {
  const f = await fixture({ pageCount: null });
  const { results } = await page(f);
  const view = within(
    await screen.findByRole("region", { name: "JD-focused wording previews" }),
  );
  expect(results[0].data.jdClauseOrderPlan?.reason).toBe("unsupported_context");
  expect(
    view.getByText(/outside this preview's admitted source scope/u),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "JD review priorities" }),
  ).toBeTruthy();
  expect(screen.getByRole("region", { name: "Score dimensions" })).toBeTruthy();
});
it("shows at most five real previews and identifies unexamined pairs without a full eligible count", async () => {
  const f = await fixture({
    jdText: "Requirements\n" + Array(6).fill("Git required").join("\n"),
  });
  const { results } = await page(f);
  const view = within(
    await screen.findByRole("region", { name: "JD-focused wording previews" }),
  );
  expect(results[0].data.jdClauseOrderPlan).toMatchObject({
    inspectedPairCount: 5,
    truncated: true,
  });
  expect(
    view.getAllByRole("region", { name: "Review JD-focused clause order" }),
  ).toHaveLength(5);
  expect(
    view.getByText("Candidate fact/requirement pairs inspected: 5."),
  ).toBeTruthy();
  expect(
    view.getByText(/Some candidate pairs were not examined/u),
  ).toBeTruthy();
  expect(view.queryByText(/total eligible|all eligible/iu)).toBeNull();
});
it("refuses a final privacy/source read failure before releasing any preview", async () => {
  const f = await fixture();
  f.store.rpc
    .mockResolvedValueOnce({ data: f.context, error: null })
    .mockResolvedValueOnce({
      data: {
        schemaVersion: "requirement-relationship-context/1.0.0",
        status: "not_found",
        scoringEligible: false,
      },
      error: null,
    });
  await expect(loader(args(f))).rejects.toMatchObject({
    init: { status: 404 },
  });
});
it("preserves duplicate version-query rejection", async () => {
  const f = await fixture();
  await expect(
    loader(
      args(
        f,
        `?canonical=${f.context.canonical.versionId}&canonical=${f.context.canonical.versionId}`,
      ),
    ),
  ).rejects.toMatchObject({ init: { status: 422 } });
  expect(mocks.admin).not.toHaveBeenCalled();
});
