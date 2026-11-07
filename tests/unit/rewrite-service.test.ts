import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  consent: vi.fn(),
  config: vi.fn(),
  access: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: mocks.config,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
  createSupabaseServerClient: () => ({}),
}));
vi.mock("../../app/lib/server/privacy", () => ({
  requireAndRecordAiConsent: mocks.consent,
}));
vi.mock("../../app/lib/server/canonical-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../app/lib/server/canonical-repository")
    >();
  return { ...actual, ownedAnalysis: mocks.access };
});
import { CanonicalError } from "../../app/lib/server/canonical-repository";
import { rewriteAction } from "../../app/lib/server/rewrite-service";
import { QualitativeAiFailure } from "../../app/lib/server/qualitative-ai";
const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const original =
  "– Built React services with PostgreSQL; reduced latency by 20%.";
let analysis: Record<string, unknown>;
let stale = false;
let runFailure = false;
const queries: Array<{ table: string; operations: Array<unknown[]> }> = [];
function client() {
  return {
    execute: vi.fn().mockResolvedValue({
      output: {
        summary: null,
        bullets: [
          {
            sourceId: 0,
            rewrite:
              "Developed React services with PostgreSQL; reduced latency by 20%.",
            reasoning: "Clarifies the measured contribution.",
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 200 },
    }),
  };
}
function request(body = "aiConsent=accepted", origin = "https://example.test") {
  return new Request(`https://example.test/resume/${id}/rewrite`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  stale = false;
  runFailure = false;
  analysis = {
    id,
    owner_id: owner,
    organization_id: id,
    status: "completed",
    resume_version_id: id,
    job_id: id,
    jobs: { title: "Engineer", description: "React and PostgreSQL with AWS" },
    resume_versions: { resumes: { status: "active" } },
    analysis_extractions: { extracted_text: original },
    writer_drafts: [
      {
        id,
        kind: "summary",
        draft: { summary: null, bullets: [] },
        updated_at: "2026-10-31T00:00:00Z",
      },
    ],
  };
  mocks.access.mockResolvedValue({});
  mocks.user.mockResolvedValue({ id: owner });
  mocks.config.mockReturnValue({
    APP_ORIGIN: "https://example.test",
    AI_ENABLED: true,
    OPENAI_TIMEOUT_MS: 100,
    OPENAI_MAX_OUTPUT_TOKENS: 1000,
    AI_MONTHLY_TOKEN_LIMIT: 100000,
    MAX_EXTRACTED_CHARACTERS: 100000,
    OPENAI_MODEL: "test-model",
  });
  mocks.consent.mockResolvedValue(undefined);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "consume_analysis_rate_limit" ? true : 0,
    error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    const entry = { table, operations: [] as unknown[][] };
    queries.push(entry);
    const data = () => ({
      data:
        table === "analyses"
          ? analysis
          : table === "document_evidence_attempts"
            ? []
            : table === "writer_drafts"
              ? stale
                ? null
                : { id }
              : null,
      error:
        table === "analysis_ai_runs" && runFailure
          ? { code: "unavailable" }
          : null,
    });
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(data()).then(resolve),
    };
    for (const method of [
      "select",
      "eq",
      "update",
      "insert",
      "limit",
      "maybeSingle",
    ]) {
      q[method] = (...args: unknown[]) => {
        entry.operations.push([method, ...args]);
        return q;
      };
    }
    return q;
  });
});
it("persists a grounded proposal run and compare-and-swap draft without changing scores", async () => {
  const ai = client();
  const response = await rewriteAction(request(), id, ai);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, bulletCount: 1 });
  expect(ai.execute).toHaveBeenCalledTimes(1);
  expect(mocks.consent).toHaveBeenCalledWith(
    expect.objectContaining({ userId: owner, accepted: true }),
  );
  const run = queries.find((q) => q.table === "analysis_ai_runs")!;
  expect(run.operations[0]).toEqual([
    "insert",
    expect.objectContaining({
      owner_id: owner,
      analysis_id: id,
      prompt_version: "source-bound-rewrite/1.0.0",
    }),
  ]);
  const draft = queries.find((q) => q.table === "writer_drafts")!;
  expect(draft.operations).toContainEqual(["eq", "owner_id", owner]);
  expect(draft.operations).toContainEqual([
    "eq",
    "updated_at",
    "2026-10-31T00:00:00Z",
  ]);
  expect(queries.some((q) => q.table === "analysis_results")).toBe(false);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("requires authentication, same origin and consent before provider access", async () => {
  const ai = client();
  mocks.user.mockResolvedValue(null);
  expect((await rewriteAction(request(), id, ai)).status).toBe(401);
  mocks.user.mockResolvedValue({ id: owner });
  expect(
    (
      await rewriteAction(
        request("aiConsent=accepted", "https://evil.test"),
        id,
        ai,
      )
    ).status,
  ).toBe(403);
  expect((await rewriteAction(request(""), id, ai)).status).toBe(403);
  expect(ai.execute).not.toHaveBeenCalled();
  expect(mocks.consent).not.toHaveBeenCalled();
});
it("denies a foreign analysis without exposing saved data", async () => {
  const ai = client();
  analysis = null as unknown as Record<string, unknown>;
  expect((await rewriteAction(request(), id, ai)).status).toBe(404);
  expect(ai.execute).not.toHaveBeenCalled();
  expect(queries[0].operations).toContainEqual(["eq", "owner_id", owner]);
});
it("denies disabled AI, missing JD, inactive source and exhausted budgets", async () => {
  const ai = client();
  const config = mocks.config();
  mocks.config.mockReturnValue({ ...config, AI_ENABLED: false });
  expect((await rewriteAction(request(), id, ai)).status).toBe(503);
  mocks.config.mockReturnValue(config);
  analysis.jobs = { title: "Engineer", description: "" };
  expect((await rewriteAction(request(), id, ai)).status).toBe(422);
  analysis.jobs = { title: "Engineer", description: "React" };
  analysis.resume_versions = { resumes: { status: "deleted" } };
  expect((await rewriteAction(request(), id, ai)).status).toBe(404);
  analysis.resume_versions = { resumes: { status: "active" } };
  mocks.config.mockReturnValue({ ...config, AI_MONTHLY_TOKEN_LIMIT: 100 });
  expect((await rewriteAction(request(), id, ai)).status).toBe(429);
  expect(ai.execute).not.toHaveBeenCalled();
});
it("prevents repeated generation through the shared database limiter", async () => {
  const ai = client();
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  const response = await rewriteAction(request(), id, ai);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBeTruthy();
  expect(ai.execute).not.toHaveBeenCalled();
});
it("preserves previous draft on timeout, ungrounded output, receipt failure or stale write", async () => {
  const ai = client();
  ai.execute.mockRejectedValueOnce(
    new QualitativeAiFailure("AI_TIMEOUT", true),
  );
  expect((await rewriteAction(request(), id, ai)).status).toBe(503);
  expect(queries.some((q) => q.table === "writer_drafts")).toBe(false);
  ai.execute.mockResolvedValueOnce({
    output: {
      summary: null,
      bullets: [
        {
          sourceId: 0,
          rewrite: "Built Kubernetes services with 99% uptime.",
          reasoning: "Clarifies the result.",
        },
      ],
    },
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  expect((await rewriteAction(request(), id, ai)).status).toBe(422);
  expect(queries.some((q) => q.table === "writer_drafts")).toBe(false);
  runFailure = true;
  expect((await rewriteAction(request(), id, ai)).status).toBe(503);
  expect(queries.some((q) => q.table === "writer_drafts")).toBe(false);
  runFailure = false;
  stale = true;
  expect((await rewriteAction(request(), id, ai)).status).toBe(409);
});
it("rejects oversized and wrong-method requests", async () => {
  const ai = client();
  expect(
    (
      await rewriteAction(
        new Request(`https://example.test/resume/${id}/rewrite`),
        id,
        ai,
      )
    ).status,
  ).toBe(405);
  expect(
    (await rewriteAction(request("x=" + "a".repeat(2049)), id, ai)).status,
  ).toBe(413);
  expect(ai.execute).not.toHaveBeenCalled();
});

it("rechecks active ownership, membership and deletion access before and after drafting", async () => {
  const ai = client();
  mocks.access.mockRejectedValueOnce(
    new CanonicalError(404, "Source unavailable."),
  );
  expect((await rewriteAction(request(), id, ai)).status).toBe(404);
  expect(ai.execute).not.toHaveBeenCalled();
  mocks.access
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new CanonicalError(404, "Source unavailable."));
  expect((await rewriteAction(request(), id, ai)).status).toBe(404);
  expect(ai.execute).toHaveBeenCalledTimes(1);
  expect(queries.some((q) => q.table === "writer_drafts")).toBe(false);
});
