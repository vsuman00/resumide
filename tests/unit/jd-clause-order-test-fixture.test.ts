import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  binding: vi.fn(),
  request: vi.fn(),
  config: vi.fn(),
  ledger: vi.fn(),
  client: vi.fn(),
  serverClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  signIn: vi.fn(),
  review: vi.fn(),
  mutate: vi.fn(),
  canonical: vi.fn(),
  requirements: vi.fn(),
  context: vi.fn(),
  workspace: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../../scripts/jd-clause-order-browser-target", () => ({
  requireJdClauseOrderBrowserTarget: m.guard,
  readJdClauseOrderBrowserBuildBinding: m.binding,
  createJdClauseOrderBrowserTestRequest: m.request,
  JD_CLAUSE_ORDER_BROWSER_FEATURES: {
    AI_ENABLED: "false",
    JOB_RELATIONS_ENABLED: "true",
  },
}));
vi.mock("../../scripts/managed-test-target", () => ({
  appendPrivateTestLedger: m.ledger,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.client }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: m.serverClient,
  serializeCookieHeader: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => {
    expect(options).toEqual({});
    return `${name}=${value}; Path=/`;
  },
}));
vi.mock("../../app/lib/server/config", () => ({ getServerConfig: m.config }));
vi.mock("../../app/lib/server/evidence-review", () => ({
  loadEvidenceReview: m.review,
}));
vi.mock("../../app/lib/server/canonical-repository", () => ({
  loadCanonical: m.canonical,
  mutateCanonical: m.mutate,
}));
vi.mock("../../app/lib/server/job-requirement-repository", () => ({
  saveJobRequirements: m.requirements,
}));
vi.mock("../../app/lib/server/requirement-relationship-context", () => ({
  loadRequirementRelationshipContext: m.context,
}));
vi.mock("../../app/lib/server/jd-clause-order-repository", () => ({
  loadJdClauseOrderWorkspace: m.workspace,
}));
import {
  createJdClauseOrderTestFixture,
  JdClauseOrderFixtureCleanupError,
  JdClauseOrderFixtureSetupError,
  JD_CLAUSE_ORDER_FIXTURE_TEXT,
  JD_CLAUSE_ORDER_FIXTURE_JD,
  JD_CLAUSE_ORDER_FIXTURE_BEFORE,
  JD_CLAUSE_ORDER_FIXTURE_AFTER,
} from "../../scripts/jd-clause-order-test-fixture";

const uuid = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pdf = new TextEncoder().encode("mock-byte-input-only"); // No PDF generation or parser.
const options = () => ({
  pdf,
  syntheticConsent: true as const,
  timeoutMs: 500,
  pollIntervalMs: 1,
});
let ownerId: string;
let queryRows: Record<string, any>;
let queries: Array<{ table: string; filters: Array<[string, unknown]> }>;
let sdkFetch: typeof fetch;
let cookieSetter: (values: Array<{ name: string; value: string }>) => void;
const admin = {
  auth: {
    admin: {
      createUser: m.createUser,
      deleteUser: m.deleteUser,
      getUserById: m.getUser,
    },
  },
  from: m.from,
};

beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  queryRows = {
    organizations: { id: uuid(2) },
    analyses: () => ({
      id: uuid(4),
      owner_id: ownerId,
      organization_id: uuid(2),
      resume_version_id: uuid(5),
      status: "needs_ocr",
    }),
    resume_versions: () => ({
      id: uuid(5),
      resume_id: uuid(3),
      owner_id: ownerId,
      organization_id: uuid(2),
      checksum: createHash("sha256").update(pdf).digest("hex"),
      page_count: 1,
      storage_key: "owned/object.pdf",
    }),
    analysis_jobs: null,
  };
  m.guard.mockReturnValue({
    baseURL: "http://127.0.0.1:3110",
    targetUrl: "https://fixture.supabase.co",
    runId: "mock-run",
    ledgerPath: "/tmp/mock-private-ledger",
    serverEnv: {
      SUPABASE_PUBLISHABLE_KEY: "mock-pub",
      SUPABASE_SECRET_KEY: "mock-secret",
      SUPABASE_RESUME_BUCKET: "resumes",
      OPENAI_API_KEY: "sentinel",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "mock-model",
    },
  });
  m.config.mockImplementation(() => ({
    SUPABASE_URL: "https://fixture.supabase.co",
    APP_ORIGIN: "http://127.0.0.1:3110",
    ...m.guard.mock.results[0].value.serverEnv,
    AI_ENABLED: false,
    JOB_RELATIONS_ENABLED: true,
  }));
  m.client.mockImplementation((_url, _key, config) => {
    sdkFetch = config.global.fetch;
    return admin;
  });
  m.serverClient.mockImplementation((_url, _key, config) => {
    cookieSetter = config.cookies.setAll;
    return { auth: { signInWithPassword: m.signIn } };
  });
  m.createUser.mockImplementation(async ({ id }) => {
    ownerId = id;
    return { data: { user: { id } }, error: null };
  });
  m.signIn.mockImplementation(async () => {
    cookieSetter([{ name: "sb-session", value: "private-cookie" }]);
    return { error: null };
  });
  m.deleteUser.mockResolvedValue({ error: null });
  m.getUser.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
  m.from.mockImplementation((table: string) => {
    const query = { table, filters: [] as Array<[string, unknown]> };
    queries.push(query);
    const resolve = () => ({
      error: null,
      data:
        typeof queryRows[table] === "function"
          ? queryRows[table]()
          : queryRows[table],
    });
    const chain: any = {
      select: () => chain,
      eq: (field: string, value: unknown) => {
        query.filters.push([field, value]);
        return chain;
      },
      limit: () => chain,
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (yes: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(yes, no),
    };
    return chain;
  });
  m.fetch.mockImplementation(async () =>
    Response.json({ id: uuid(4), status: "quarantined" }, { status: 202 }),
  );
  vi.stubGlobal("fetch", m.fetch);
  m.review.mockImplementation(async () => ({
    attemptId: uuid(6),
    evidence: {
      id: uuid(6),
      analysisId: uuid(4),
      ownerId,
      sourceId: uuid(5),
      inputSha256: createHash("sha256").update(pdf).digest("hex"),
      status: "review_required",
      nativeSource: { pages: [{ text: JD_CLAUSE_ORDER_FIXTURE_TEXT }] },
    },
  }));
  m.mutate.mockImplementation(async (_admin, _analysis, _owner, command) => ({
    status: "applied",
    versionId: command.operation === "import" ? uuid(7) : uuid(8),
    revision: command.operation === "import" ? 1 : 2,
  }));
  m.canonical.mockResolvedValue({
    current: {
      document: {
        versionId: uuid(7),
        facts: [
          {
            id: uuid(9),
            type: "contribution",
            value: JD_CLAUSE_ORDER_FIXTURE_BEFORE,
          },
        ],
      },
    },
  });
  m.requirements.mockResolvedValue({ versionId: uuid(10), revision: 1 });
  m.context.mockImplementation(async () => ({
    status: "available",
    source: {
      attemptId: uuid(6),
      inputSha256: createHash("sha256").update(pdf).digest("hex"),
    },
    sourceMetadata: { pageCount: 1 },
  }));
  m.workspace.mockResolvedValue({
    proposals: [
      {
        draft: {
          target: { factId: uuid(9) },
          before: JD_CLAUSE_ORDER_FIXTURE_BEFORE,
          after: JD_CLAUSE_ORDER_FIXTURE_AFTER,
          selection: { clauseId: "a".repeat(64) },
          relevance: { quote: "Git required" },
        },
      },
    ],
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("requires the fixed guard before config, clients, ledger or HTTP", async () => {
  m.guard.mockImplementation(() => {
    throw Error("target refused");
  });
  await expect(createJdClauseOrderTestFixture(options())).rejects.toThrow(
    "target refused",
  );
  expect(m.binding).toHaveBeenCalledOnce();
  for (const mock of [m.config, m.client, m.serverClient, m.ledger, m.fetch])
    expect(mock).not.toHaveBeenCalled();
});
it.each([
  { syntheticConsent: false },
  { timeoutMs: 0 },
  { timeoutMs: 180001 },
  { pollIntervalMs: 0 },
  { pollIntervalMs: 1001 },
  { pdf: new Uint8Array(1) },
])(
  "refuses invalid explicit consent/bounds before clients: %j",
  async (patch) => {
    await expect(
      createJdClauseOrderTestFixture({ ...options(), ...patch } as any),
    ).rejects.toThrow();
    expect(m.client).not.toHaveBeenCalled();
    expect(m.ledger).not.toHaveBeenCalled();
  },
);
it.each([
  "SUPABASE_URL",
  "APP_ORIGIN",
  "SUPABASE_SECRET_KEY",
  "AI_ENABLED",
  "JOB_RELATIONS_ENABLED",
])("refuses stale cached configuration %s before clients", async (field) => {
  const get = m.config.getMockImplementation()!;
  m.config.mockImplementation(() => ({ ...get(), [field]: "wrong" }));
  await expect(createJdClauseOrderTestFixture(options())).rejects.toThrow();
  expect(m.client).not.toHaveBeenCalled();
  expect(m.ledger).not.toHaveBeenCalled();
});
it("uses SSR session cookies and authenticated multipart admission with explicit synthetic consent", async () => {
  const fixture = await createJdClauseOrderTestFixture(options());
  const [url, init] = m.fetch.mock.calls[0];
  expect(String(url)).toBe("http://127.0.0.1:3110/api/analyze");
  expect(init).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      Origin: "http://127.0.0.1:3110",
      Cookie: "sb-session=private-cookie",
    },
  });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.body.get("aiConsent")).toBe("accepted");
  expect(init.body.get("jobDescription")).toBe(JD_CLAUSE_ORDER_FIXTURE_JD);
  expect(new Uint8Array(await init.body.get("file").arrayBuffer())).toEqual(
    pdf,
  );
  expect(m.signIn).toHaveBeenCalledWith({
    email: fixture.email,
    password: fixture.password,
  });
  expect(fixture).toMatchObject({
    organizationId: uuid(2),
    resumeId: uuid(3),
    analysisId: uuid(4),
    sourceId: uuid(5),
    attemptId: uuid(6),
    targetFactId: uuid(9),
    canonical: { versionId: uuid(8), revision: 2 },
    requirements: {
      versionId: uuid(10),
      revision: 1,
      clauseId: "a".repeat(64),
    },
    expected: {
      before: JD_CLAUSE_ORDER_FIXTURE_BEFORE,
      after: JD_CLAUSE_ORDER_FIXTURE_AFTER,
      jdQuote: "Git required",
      sourceQuote: JD_CLAUSE_ORDER_FIXTURE_BEFORE,
    },
  });
  const ledgerText = JSON.stringify(m.ledger.mock.calls);
  for (const secret of [
    fixture.email,
    fixture.password,
    "private-cookie",
    JD_CLAUSE_ORDER_FIXTURE_TEXT,
    JD_CLAUSE_ORDER_FIXTURE_JD,
  ])
    expect(ledgerText).not.toContain(secret);
  expect(m.ledger.mock.invocationCallOrder[0]).toBeLessThan(
    m.createUser.mock.invocationCallOrder[0],
  );
});
it("polls only the exact owned analysis and waits for its real job to settle despite needs_ocr", async () => {
  let reads = 0;
  queryRows.analysis_jobs = () =>
    ++reads < 3
      ? {
          analysis_id: uuid(4),
          lease_owner: "real-worker",
          lease_expires_at: "future",
          dead_lettered_at: null,
        }
      : null;
  await createJdClauseOrderTestFixture(options());
  expect(reads).toBe(3);
  for (const query of queries) {
    if (query.table === "analysis_jobs")
      expect(query.filters).toEqual([["analysis_id", uuid(4)]]);
    if (query.table === "analyses")
      expect(query.filters).toContainEqual(["owner_id", ownerId]);
    expect([
      "organizations",
      "analyses",
      "resume_versions",
      "analysis_jobs",
    ]).toContain(query.table);
  }
  expect(m.mutate.mock.calls.map((call) => call[3].operation)).toEqual([
    "import",
    "confirm",
  ]);
  expect(m.requirements).toHaveBeenCalledOnce();
  expect(m.context).toHaveBeenCalledOnce();
  expect(m.workspace).toHaveBeenCalledOnce();
});
it.each(["checksum", "page_count", "owner_id"])(
  "refuses invalid persisted source %s without importing or destroying",
  async (field) => {
    const get = queryRows.resume_versions;
    queryRows.resume_versions = () => ({
      ...get(),
      [field]: field === "page_count" ? null : "wrong",
    });
    await expect(
      createJdClauseOrderTestFixture(options()),
    ).rejects.toBeInstanceOf(JdClauseOrderFixtureSetupError);
    expect(m.mutate).not.toHaveBeenCalled();
    expect(m.deleteUser).not.toHaveBeenCalled();
  },
);
it("refuses incomplete physical coverage and mismatched persisted review quotes", async () => {
  const get = m.review.getMockImplementation()!;
  m.review.mockImplementation(async () => {
    const v = await get();
    v.evidence.nativeSource.pages[0].text = "other";
    return v;
  });
  await expect(
    createJdClauseOrderTestFixture(options()),
  ).rejects.toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.mutate).not.toHaveBeenCalled();
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("does not treat unavailable production workspace as positive fixture completion", async () => {
  m.workspace.mockResolvedValue(null);
  await expect(
    createJdClauseOrderTestFixture(options()),
  ).rejects.toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("retains the private ledger and refuses destructive cleanup when immutable admission retirement is missing", async () => {
  const fixture = await createJdClauseOrderTestFixture(options());
  await expect(fixture.cleanup()).rejects.toMatchObject({
    reason: "admission_retirement_unavailable",
  });
  expect(m.deleteUser).not.toHaveBeenCalled();
  expect(m.ledger.mock.calls.at(-1)?.[1]).toContain(
    "cleanup_blocked_admission_retirement",
  );
  expect(m.from.mock.calls.map(([table]) => table)).not.toContain("storage");
});
it("refuses cleanup while the exact owned job remains live", async () => {
  const fixture = await createJdClauseOrderTestFixture(options());
  queryRows.analysis_jobs = {
    analysis_id: uuid(4),
    lease_owner: "worker",
    lease_expires_at: "future",
    dead_lettered_at: null,
  };
  await expect(fixture.cleanup()).rejects.toMatchObject({
    reason: "owned_work_active",
  });
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("retains uncertain HTTP ingestion and never guesses an ID or retries a write", async () => {
  m.fetch.mockRejectedValue(Error("lost response"));
  const error = await createJdClauseOrderTestFixture(options()).catch(
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  await expect(
    (error as JdClauseOrderFixtureSetupError).cleanup(),
  ).rejects.toMatchObject({ reason: "unknown_or_inflight" });
  expect(m.fetch).toHaveBeenCalledOnce();
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("bounds a never-settling Auth mutation and retains its planned owner without deletion", async () => {
  vi.useFakeTimers();
  m.createUser.mockImplementation(() => new Promise(() => {}));
  const result = createJdClauseOrderTestFixture({
    ...options(),
    timeoutMs: 20,
  }).catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(25);
  expect(await result).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.deleteUser).not.toHaveBeenCalled();
  expect(m.fetch).not.toHaveBeenCalled();
});
it("bounds owned polling without claiming or modifying queue work", async () => {
  vi.useFakeTimers();
  queryRows.analysis_jobs = {
    analysis_id: uuid(4),
    lease_owner: "worker",
    lease_expires_at: "future",
    dead_lettered_at: null,
  };
  const result = createJdClauseOrderTestFixture({
    ...options(),
    timeoutMs: 20,
  }).catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(16000);
  expect(await result).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.mutate).not.toHaveBeenCalled();
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("keeps returned SDK reads cancellable after setup closes and refuses concurrent unknown cleanup", async () => {
  const fixture = await createJdClauseOrderTestFixture(options());
  m.fetch.mockResolvedValueOnce(new Response("ok"));
  expect(
    await (await sdkFetch("https://fixture.supabase.co/rest/v1/owned")).text(),
  ).toBe("ok");
  vi.useFakeTimers();
  m.fetch.mockImplementation(() => new Promise(() => {}));
  const pending = sdkFetch("https://fixture.supabase.co/rest/v1/owned").catch(
    (e: unknown) => e,
  );
  await vi.advanceTimersByTimeAsync(5001);
  expect(await pending).toBeInstanceOf(Error);
  await expect(fixture.cleanup()).rejects.toBeInstanceOf(
    JdClauseOrderFixtureCleanupError,
  );
  expect(m.deleteUser).not.toHaveBeenCalled();
});

it("bounds a stalled HTTP response body and retains unknown ingestion", async () => {
  vi.useFakeTimers();
  m.fetch.mockResolvedValue(
    new Response(new ReadableStream({ start() {} }), { status: 202 }),
  );
  const result = createJdClauseOrderTestFixture({
    ...options(),
    timeoutMs: 20,
  }).catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(25);
  const error = await result;
  expect(error).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  await expect(
    (error as JdClauseOrderFixtureSetupError).cleanup(),
  ).rejects.toMatchObject({ reason: "unknown_or_inflight" });
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("cancels setup with its caller and never retries the uncertain upload", async () => {
  const controller = new AbortController();
  m.fetch.mockImplementation(async (_url, init) => {
    controller.abort();
    expect(init.signal.aborted).toBe(true);
    throw Error("cancelled");
  });
  await expect(
    createJdClauseOrderTestFixture({ ...options(), signal: controller.signal }),
  ).rejects.toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.fetch).toHaveBeenCalledOnce();
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("keeps returned SDK response bodies within their deadline", async () => {
  await createJdClauseOrderTestFixture(options());
  vi.useFakeTimers();
  m.fetch.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
  const result = sdkFetch("https://fixture.supabase.co/rest/v1/owned").catch(
    (e: unknown) => e,
  );
  await vi.advanceTimersByTimeAsync(5001);
  expect(await result).toBeInstanceOf(Error);
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("retains unknown oversized SDK responses and refuses subsequent requests", async () => {
  const fixture = await createJdClauseOrderTestFixture(options());
  m.fetch.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
          controller.close();
        },
      }),
    ),
  );
  await expect(
    sdkFetch("https://fixture.supabase.co/rest/v1/owned"),
  ).rejects.toThrow();
  const calls = m.fetch.mock.calls.length;
  await expect(
    sdkFetch("https://fixture.supabase.co/rest/v1/owned"),
  ).rejects.toThrow();
  expect(m.fetch).toHaveBeenCalledTimes(calls);
  await expect(fixture.cleanup()).rejects.toMatchObject({
    reason: "unknown_or_inflight",
  });
});
it("permits cleanup only for a proved owner with no attempted ingestion, then checks owner and workspace absence", async () => {
  m.signIn.mockResolvedValue({ error: { message: "denied" } });
  queryRows.analyses = [];
  m.deleteUser.mockImplementation(async () => {
    queryRows.organizations = [];
    queryRows.memberships = [];
    queryRows.profiles = [];
    return { error: null };
  });
  await expect(createJdClauseOrderTestFixture(options())).rejects.toThrow(
    "fixture unavailable",
  );
  expect(m.fetch).not.toHaveBeenCalled();
  expect(m.deleteUser).toHaveBeenCalledOnce();
  expect(m.getUser).toHaveBeenCalledWith(ownerId);
  expect(m.ledger.mock.calls.at(-1)?.[1]).toContain(
    "cleanup_verified_no_ingestion",
  );
  for (const table of ["organizations", "memberships", "profiles"])
    expect(queries.some((query) => query.table === table)).toBe(true);
});
it("does not claim no-ingestion cleanup from Auth cascade alone", async () => {
  m.signIn.mockResolvedValue({ error: { message: "denied" } });
  queryRows.analyses = [];
  queryRows.organizations = [{ id: uuid(2) }];
  const error = await createJdClauseOrderTestFixture(options()).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  expect(m.ledger.mock.calls.at(-1)?.[1]).not.toContain(
    "cleanup_verified_no_ingestion",
  );
});
it("refuses malformed admission responses while retaining the exact planned upload ledger", async () => {
  m.fetch.mockResolvedValue(
    Response.json({ id: "invalid", status: "quarantined" }, { status: 202 }),
  );
  const error = await createJdClauseOrderTestFixture(options()).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(JdClauseOrderFixtureSetupError);
  await expect(
    (error as JdClauseOrderFixtureSetupError).cleanup(),
  ).rejects.toMatchObject({ reason: "unknown_or_inflight" });
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("retries absent evidence only within the owned poll instead of accepting fabricated readiness", async () => {
  const review = m.review.getMockImplementation()!;
  m.review
    .mockRejectedValueOnce(Object.assign(Error("not found"), { status: 404 }))
    .mockImplementation(review);
  await createJdClauseOrderTestFixture(options());
  expect(m.review).toHaveBeenCalledTimes(2);
});
