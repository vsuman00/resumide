import { beforeEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router";
import {
  parseJobRequirements,
  parseJobRequirementsWithRelations,
  LOCAL_JD_RELATION_MODEL_VERSION,
} from "../../app/lib/server/job-requirements";
import { JobRequirementRelationsSchema } from "../../app/lib/server/job-requirement-admission";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  enabled: true,
  relationsEnabled: false,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    APP_ORIGIN: "https://example.test",
    JOB_INTELLIGENCE_ENABLED: mocks.enabled,
    JOB_RELATIONS_ENABLED: mocks.relationsEnabled,
  }),
}));
vi.mock(
  "../../app/lib/server/job-requirement-repository",
  async (original) => ({
    ...(await original<
      typeof import("../../app/lib/server/job-requirement-repository")
    >()),
    loadJobRequirements: mocks.load,
    saveJobRequirements: mocks.save,
  }),
);
import JobRequirements, {
  action,
  loader,
  headers,
} from "../../app/routes/analysis.requirements";
import { readJobRequirementForm } from "../../app/lib/server/job-requirement-repository";
const id = "11111111-1111-4111-8111-111111111111";
function request(
  body = new URLSearchParams({ expectedVersionId: "", idempotencyKey: id }),
  origin = "https://example.test",
) {
  return new Request("https://example.test/requirements", {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
}
const historyIds = {
  analysis: "10000000-0000-4000-8000-000000000001",
  job: "10000000-0000-4000-8000-000000000002",
  head: "10000000-0000-4000-8000-000000000003",
};
function historyModel(state: "historical" | "current" | "empty") {
  const document = parseJobRequirements(
    "Requirements\nSQL required\n<em>Saved synthetic snapshot</em>",
    {
      ownerId: id,
      organizationId: id,
      analysisId: historyIds.analysis,
      jobId: historyIds.job,
    },
  );
  return {
    analysisId: historyIds.analysis,
    sourceText: document.sourceText,
    current: state === "empty" ? null : { document, revision: 1 },
    headId:
      state === "historical"
        ? historyIds.head
        : state === "empty"
          ? null
          : document.id,
    history:
      state === "empty"
        ? []
        : [
            {
              id: document.id,
              revision: 1,
              parent_version_id: null,
              created_at: document.createdAt,
            },
            ...(state === "historical"
              ? [
                  {
                    id: historyIds.head,
                    revision: 2,
                    parent_version_id: document.id,
                    created_at: document.createdAt,
                  },
                ]
              : []),
          ],
    nextOffset: null,
    scoringEligible: false,
  };
}
async function renderHistory<
  T extends {
    analysisId: string;
    current: { document: { id: string } } | null;
  },
>(model: T) {
  mocks.load.mockResolvedValue(model);
  const routes = [
    {
      id: "requirements",
      path: "/analysis/:id/requirements",
      Component: JobRequirements,
      loader,
    },
  ];
  const handler = createStaticHandler(routes);
  const selected = model.current ? `?version=${model.current.document.id}` : "";
  const context = await handler.query(
    new Request(
      `https://example.test/analysis/${model.analysisId}/requirements${selected}`,
    ),
  );
  if (context instanceof Response)
    throw Error("Expected a rendered requirements response.");
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(
    createElement(StaticRouterProvider, { router, context, hydrate: false }),
  );
  return { html, context };
}
function typedRequirementsModel(historical = false) {
  const local = parseJobRequirementsWithRelations(
    [
      "Requirements",
      "JS or Postgres required",
      "JavaScript and PostgreSQL required",
      "FastAPI or Flask required",
      "ZephyrCircuit <em>unmapped</em> required",
      "At least 3 years of Python experience required",
      "More than 3 years experience required",
      "At most 4 years experience required",
      "Less than 4 years experience required",
      "Exactly 3 years experience required",
      "1-4 years of Python experience required",
      "4-1 years of Python experience required",
      "Bachelor degree required",
    ].join("\n"),
    {
      ownerId: id,
      organizationId: id,
      analysisId: historyIds.analysis,
      jobId: historyIds.job,
    },
    { modelVersion: LOCAL_JD_RELATION_MODEL_VERSION },
  );
  // Validate the explicit stored fixture before it enters the mocked owned reader.
  const document = JobRequirementRelationsSchema.parse({
    schemaVersion: "requirements/2.0.0",
    producerVersion: "jd-relations/1.0.0",
    id: local.id,
    parentVersionId: local.parentVersionId,
    ownerId: local.ownerId,
    organizationId: local.organizationId,
    analysisId: local.analysisId,
    jobId: local.jobId,
    createdAt: local.createdAt,
    retentionPolicyId: local.retentionPolicyId,
    inputSha256: local.inputSha256,
    locale: local.locale,
    domain: local.domain,
    state: local.state,
    sourceText: local.sourceText,
    scoringEligible: false,
    mappingPolicy: local.mappingPolicy,
    relationPolicy: local.relations.policy,
    requirements: local.requirements,
    retainedClauses: local.retainedClauses,
    relations: {
      clauses: local.relations.clauses.map(({ scope, ...clause }) => ({
        ...clause,
        scope: { importance: scope.importance, negated: scope.negated },
      })),
    },
    warnings: local.warnings,
  });
  return {
    analysisId: document.analysisId,
    sourceText: document.sourceText,
    current: { document, revision: 1 },
    headId: historical ? historyIds.head : document.id,
    history: [
      {
        id: document.id,
        revision: 1,
        parent_version_id: null,
        created_at: document.createdAt,
      },
    ],
    nextOffset: null,
    scoringEligible: false as const,
  };
}
describe("JD route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.relationsEnabled = false;
    mocks.user.mockResolvedValue({ id });
    mocks.save.mockResolvedValue({ revision: 1 });
    mocks.load.mockResolvedValue({ current: null, history: [] });
  });
  it("checks origin and authentication before privileged clients", async () => {
    expect(
      (
        await action({
          request: request(undefined, "https://foreign.test"),
          params: { id },
        })
      ).init?.status,
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue(null);
    expect(
      (await action({ request: request(), params: { id } })).init?.status,
    ).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("defaults off and rejects invalid pagination", async () => {
    mocks.enabled = false;
    await expect(
      loader({
        request: new Request("https://example.test/requirements"),
        params: { id },
      }),
    ).rejects.toMatchObject({ init: { status: 404 } });
    mocks.enabled = true;
    await expect(
      loader({
        request: new Request("https://example.test/requirements?offset=-1"),
        params: { id },
      }),
    ).rejects.toMatchObject({ init: { status: 422 } });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("saves using authenticated identity and private headers", async () => {
    const result = await action({ request: request(), params: { id } });
    expect(new Headers(result.init?.headers).get("Cache-Control")).toContain(
      "no-store",
    );
    expect(mocks.save).toHaveBeenCalledWith(
      undefined,
      id,
      id,
      { expectedVersionId: null, idempotencyKey: id },
      expect.any(String),
    );
  });
  it.each(["ownerId", "sourceText", "score", "__proto__"])(
    "rejects client supplied %s",
    async (field) => {
      const body = new URLSearchParams({
        expectedVersionId: "",
        idempotencyKey: id,
        [field]: "fake",
      });
      expect(
        (await action({ request: request(body), params: { id } })).init?.status,
      ).toBe(422);
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate and oversized forms", async () => {
    const body = new URLSearchParams({
      expectedVersionId: "",
      idempotencyKey: id,
    });
    body.append("idempotencyKey", id);
    await expect(readJobRequirementForm(request(body))).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      readJobRequirementForm(
        request(new URLSearchParams({ sourceText: "x".repeat(1025) })),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("U04 history withholds current-head Save while displaying a historical JD snapshot", async () => {
    const model = historyModel("historical"),
      before = JSON.stringify(model);
    const { html, context } = await renderHistory(model);
    expect(context.statusCode).toBe(200);
    expect(html).not.toContain("Save job requirements for review");
    expect(html).not.toMatch(/<form\b/u);
    expect(html).toContain("Historical JD version 1");
    expect(html).toContain("This saved snapshot is read-only.");
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/analysis/${model.analysisId}/requirements"[^>]*>Review current JD version</a>`,
        "u",
      ),
    );
    expect(html).toContain(
      "SQL required\n&lt;em&gt;Saved synthetic snapshot&lt;/em&gt;",
    );
    expect(html).not.toContain("<em>Saved synthetic snapshot</em>");
    expect(JSON.stringify(model)).toBe(before);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      new Headers(context.loaderHeaders.requirements).get("Cache-Control"),
    ).toBe("private, no-store");
  });
  it.each(["current", "empty"] as const)(
    "U04 history preserves the %s native form and exact expected-head/key fields",
    async (state) => {
      const model = historyModel(state);
      const { html, context } = await renderHistory(model);
      const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0];
      expect(form).toBeDefined();
      expect(form).toMatch(/method="post"/u);
      expect(form).toContain("Save job requirements for review");
      const fields = Object.fromEntries(
        [...form!.matchAll(/<input\b([^>]*)>/gu)].map(([, attributes]) => [
          /name="([^"]+)"/u.exec(attributes)![1],
          /value="([^"]*)"/u.exec(attributes)![1],
        ]),
      );
      const loaded = context.loaderData.requirements as { formKey: string };
      expect(fields).toEqual({
        expectedVersionId: model.headId ?? "",
        idempotencyKey: loaded.formKey,
      });
      expect(html).not.toContain("Historical JD version");
      await action({
        params: { id: model.analysisId },
        request: new Request(
          `https://example.test/analysis/${model.analysisId}/requirements`,
          {
            method: "POST",
            headers: { Origin: "https://example.test" },
            body: new URLSearchParams(fields),
          },
        ),
      });
      expect(mocks.save).toHaveBeenCalledWith(
        undefined,
        model.analysisId,
        id,
        { expectedVersionId: model.headId, idempotencyKey: loaded.formKey },
        expect.any(String),
      );
    },
  );
  it("A09 typed JD renders stored grouped literals, aliases, bounds and unknown clauses", async () => {
    const model = typedRequirementsModel(),
      before = JSON.stringify(model);
    const { html, context } = await renderHistory(model),
      visible = html.replace(/<!--[\s\S]*?-->/gu, "");
    expect(context.statusCode).toBe(200);
    expect(visible).toContain("Typed JD clause review");
    expect(visible).toContain("Any one of these skills (OR)");
    expect(visible).toContain("All of these skills (AND)");
    expect(visible).toContain("Alias mapping: JS → JavaScript.");
    expect(visible).toContain("Alias mapping: Postgres → PostgreSQL.");
    expect(visible).toContain("Exact local label: JavaScript.");
    expect(visible).toContain("No local concept mapping for FastAPI.");
    expect(visible).toContain("Skill interpretation needs review");
    expect(visible).toContain(
      "ZephyrCircuit &lt;em&gt;unmapped&lt;/em&gt; required",
    );
    expect(html).not.toContain("<em>unmapped</em>");
    for (const wording of [
      "at least",
      "more than",
      "at most",
      "less than",
      "exactly",
      "range",
    ])
      expect(visible).toContain(`Duration interpretation: ${wording}.`);
    for (const bound of [
      "Lower bound: 3 years (included).",
      "Lower bound: 3 years (excluded).",
      "Upper bound: 4 years (included).",
      "Upper bound: 4 years (excluded).",
      "Lower bound: 1 year (included).",
    ])
      expect(visible).toContain(bound);
    expect(visible).toContain("Duration interpretation needs review");
    expect(visible).toContain("inverted range review");
    expect(visible).toContain("No explicit duration was identified.");
    expect(visible).toContain("Literal observations and mappings");
    expect(visible).toContain("Bachelor");
    expect(visible).not.toContain("Explicit minimum experience:");
    expect(html).toMatch(
      /<details(?:\s[^>]*)?><summary>Stored JD version and policies<\/summary>/u,
    );
    for (const value of [
      model.current.document.id,
      "requirements/2.0.0",
      "jd-relations/1.0.0",
      model.current.document.inputSha256,
      model.current.document.mappingPolicy.version,
      model.current.document.mappingPolicy.lexiconSha256,
      model.current.document.relationPolicy.version,
      model.current.document.relationPolicy.sha256,
    ])
      expect(visible).toContain(value);
    expect(visible).not.toContain("Save job requirements for review");
    expect(visible).toContain("Saving typed JD updates is paused.");
    expect(JSON.stringify(model)).toBe(before);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      new Headers(context.loaderHeaders.requirements).get("Cache-Control"),
    ).toBe("private, no-store");
  });
  it("A09 typed JD pauses the current Save while preserving the stored review when the writer is off", async () => {
    const model = typedRequirementsModel();
    const { html } = await renderHistory(model),
      visible = html.replace(/<!--[\s\S]*?-->/gu, "");
    expect(visible).not.toContain("Save job requirements for review");
    expect(visible).toContain("Saving typed JD updates is paused.");
    expect(visible).toContain("Typed JD clause review");
    expect(visible).toContain(model.current.document.id);
  });
  it("A09 typed JD enables only the current native form when the typed writer is enabled", async () => {
    mocks.relationsEnabled = true;
    const model = typedRequirementsModel();
    const { html, context } = await renderHistory(model);
    const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0];
    expect(form).toBeDefined();
    expect(form).toMatch(/method="post"/u);
    expect(form).toContain("Save job requirements for review");
    const fields = Object.fromEntries(
      [...form!.matchAll(/<input\b([^>]*)>/gu)].map(([, attributes]) => [
        /name="([^"]+)"/u.exec(attributes)![1],
        /value="([^"]*)"/u.exec(attributes)![1],
      ]),
    );
    const loaded = context.loaderData.requirements as {
      formKey: string;
      jobRelationsWriterEnabled: boolean;
    };
    expect(loaded.jobRelationsWriterEnabled).toBe(true);
    expect(fields).toEqual({
      expectedVersionId: model.headId,
      idempotencyKey: loaded.formKey,
    });
    expect(Object.keys(fields)).not.toContain("producerVersion");
  });
  it("A09 typed JD keeps its exact historical version readable with writer capability off", async () => {
    const model = typedRequirementsModel(true);
    const { html, context } = await renderHistory(model),
      visible = html.replace(/<!--[\s\S]*?-->/gu, "");
    expect(context.statusCode).toBe(200);
    expect(visible).toContain("Historical JD version 1");
    expect(visible).not.toContain("Save job requirements for review");
    expect(visible).toContain("Typed JD clause review");
    expect(visible).toContain("jd-relations/1.0.0");
    expect(visible).toContain(model.current.document.id);
    expect(visible).toContain(
      model.current.document.mappingPolicy.lexiconSha256,
    );
    expect(visible).toMatch(
      new RegExp(
        `<a[^>]*href="/analysis/${model.analysisId}/requirements"[^>]*>Review current JD version</a>`,
        "u",
      ),
    );
    expect(visible).toContain(
      "ZephyrCircuit &lt;em&gt;unmapped&lt;/em&gt; required",
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retains refreshed cookies on private responses", async () => {
    const h = new Headers(
      await headers({
        parentHeaders: new Headers(),
        loaderHeaders: new Headers({
          "Set-Cookie": "session=refreshed; HttpOnly",
        }),
        actionHeaders: new Headers(),
        errorHeaders: new Headers(),
      } as Parameters<typeof headers>[0]),
    );
    expect(h.get("Set-Cookie")).toContain("refreshed");
    expect(h.get("Cache-Control")).toContain("no-store");
  });
});
