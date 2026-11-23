import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import type { RequirementRelationshipContext } from "../../app/lib/server/requirement-relationship-context";
import type { loadScoreDiagnostics } from "../../app/lib/server/score-v2-repository";
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
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import { loader, headers, action } from "../../app/routes/analysis.score";
import { action as typedAction } from "../../app/routes/analysis.author.typed";
type Result = { data: unknown; error: unknown };
type Read = {
  table: string;
  columns: string;
  filters: Record<string, unknown>;
  single: boolean;
};
const ok = (data: unknown): Result => ({ data, error: null });
function ownedStore(
  context: RequirementRelationshipContext,
  override?: (read: Read, sequence: Read[]) => Result | undefined,
) {
  const c = context.canonical,
    s = context.source,
    r = context.requirements;
  const docs = [c, ...context.ancestors];
  const reads: Read[] = [];
  const root = {
    id: s.resumeId,
    owner_id: s.ownerId,
    organization_id: s.organizationId,
    status: "active",
  };
  const analysis = {
    id: s.analysisId,
    owner_id: s.ownerId,
    organization_id: s.organizationId,
    resume_version_id: s.sourceId,
    job_id: r.content.jobId,
  };
  const source = {
    id: s.sourceId,
    resume_id: s.resumeId,
    owner_id: s.ownerId,
    organization_id: s.organizationId,
    active_resume: root,
    page_count: context.sourceMetadata.pageCount,
  };
  const job = {
    id: r.content.jobId,
    title: "Software Engineer",
    description: r.content.sourceText,
    owner_id: s.ownerId,
    organization_id: s.organizationId,
  };
  const canonicalRows = docs.map((d) => ({
    id: d.versionId,
    resume_id: s.resumeId,
    owner_id: s.ownerId,
    organization_id: s.organizationId,
    source_resume_version_id: s.sourceId,
    parent_version_id: d.content.parentVersionId,
    revision: d.revision,
    content: d.content,
    created_at: d.content.createdAt,
  }));
  const requirementRows = [
    {
      id: r.versionId,
      analysis_id: s.analysisId,
      job_id: r.content.jobId,
      owner_id: s.ownerId,
      organization_id: s.organizationId,
      parent_version_id: r.content.parentVersionId,
      revision: r.revision,
      content: r.content,
      created_at: r.content.createdAt,
    },
  ];
  const rpc = vi.fn<(name: string, args: unknown) => Promise<Result>>(
    async (name) => {
      if (name !== "read_requirement_relationship_context")
        throw Error("UNEXPECTED_WRITE_RPC");
      return ok(context);
    },
  );
  function valueAt(row: Record<string, unknown>, path: string): unknown {
    let value: unknown = row;
    for (const key of path.split(".")) {
      if (typeof value !== "object" || value === null) return undefined;
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  }
  const from = vi.fn((table: string) => {
    const read: Read = { table, columns: "", filters: {}, single: false };
    const query = {
      select(columns: string) {
        read.columns = columns;
        return query;
      },
      eq(key: string, value: unknown) {
        read.filters[key] = value;
        return query;
      },
      neq() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      range() {
        return query;
      },
      maybeSingle() {
        read.single = true;
        return query;
      },
      then(yes: (result: Result) => unknown, no: (error: unknown) => unknown) {
        reads.push(read);
        const replacement = override?.(read, reads);
        if (replacement) return Promise.resolve(replacement).then(yes, no);
        let rows: Record<string, unknown>[];
        if (table === "analyses") rows = [analysis];
        else if (table === "resume_versions") rows = [source];
        else if (table === "memberships")
          rows = [
            {
              organization_id: s.organizationId,
              user_id: s.ownerId,
              role: "owner",
            },
          ];
        else if (table === "data_requests" || table === "authoring_events")
          rows = [];
        else if (table === "resumes") rows = [root];
        else if (table === "jobs") rows = [job];
        else if (table === "canonical_resume_heads")
          rows = [
            {
              resume_id: s.resumeId,
              owner_id: s.ownerId,
              organization_id: s.organizationId,
              version_id: context.heads.canonicalHeadId,
              revision: context.heads.canonicalHeadRevision,
            },
          ];
        else if (table === "canonical_resume_versions") rows = canonicalRows;
        else if (table === "job_requirement_versions") rows = requirementRows;
        else if (table === "document_evidence_attempts")
          rows = [
            {
              id: context.attempt.id,
              analysis_id: s.analysisId,
              owner_id: s.ownerId,
              organization_id: s.organizationId,
              envelope: context.attempt.envelope,
              resume_version_id: s.sourceId,
              input_sha256: s.inputSha256,
              attempt_number: context.attempt.attemptNumber,
            },
          ];
        else throw Error("UNEXPECTED_TABLE_READ");
        rows = rows.filter((row) =>
          Object.entries(read.filters).every(
            ([key, value]) => valueAt(row, key) === value,
          ),
        );
        if (
          table === "canonical_resume_versions" ||
          table === "job_requirement_versions"
        )
          rows = [...rows].sort(
            (a, b) => Number(b.revision) - Number(a.revision),
          );
        return Promise.resolve(ok(read.single ? (rows[0] ?? null) : rows)).then(
          yes,
          no,
        );
      },
    };
    return query;
  });
  // Separate scoped authority fixtures keep domain RPC assertions meaningful.
  const privacy = {
    subjects: [s.ownerId] as string[],
    dispositions: [] as Array<{ owner_id: string }>,
    requests: [] as Array<{ user_id: string; kind: string; status: string }>,
    schemaReady: true,
    accessExecutable: true,
    exportExecutable: true,
    replyOwner: undefined as string | undefined,
  };
  const privacyRpc = vi.fn((name: string, raw: unknown) => {
    const args = raw as Record<string, unknown>;
    const requested = args.p_user_id;
    const result =
      name === "read_owned_ai_disposition_readiness"
        ? ok({
            ...OWNED_AI_DISPOSITION_PROFILE,
            schemaReady: privacy.schemaReady,
            accessExecutable: privacy.accessExecutable,
            exportExecutable: privacy.exportExecutable,
          })
        : typeof requested !== "string" || !privacy.subjects.includes(requested)
          ? {
              data: null,
              error: { code: "42501", message: "SYNTHETIC_OWNER_UNAVAILABLE" },
            }
          : ok({
              schemaVersion: "candidate-privacy-access/1.0.0",
              ownerId: privacy.replyOwner ?? requested,
              deletionPrepared: privacy.dispositions.some(
                (row) => row.owner_id === requested,
              ),
              blockingRequest: privacy.requests.some(
                (row) =>
                  row.user_id === requested &&
                  row.kind === "deletion" &&
                  !["failed", "cancelled"].includes(row.status),
              ),
            });
    const pending = Promise.resolve(result);
    return Object.assign(pending, {
      abortSignal: (signal: AbortSignal) =>
        signal.aborted
          ? Promise.resolve({ data: null, error: { code: "ABORTED" } })
          : pending,
    });
  });
  const clientRpc = (name: string, args: unknown) =>
    name === "read_owned_ai_disposition_readiness" ||
    name === "read_candidate_privacy_access"
      ? privacyRpc(name, args)
      : rpc(name, args);
  return {
    privacy,
    privacyRpc,
    client: { from, rpc: clientRpc } as unknown as Parameters<
      typeof loadScoreDiagnostics
    >[0],
    from,
    rpc,
    reads,
    canonicalRows,
    requirementRows,
    source,
    analysis,
    job,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flags.SCORING_V2_ENABLED = true;
  mocks.flags.AUTHORING_ENABLED = true;
  mocks.flags.TYPED_AUTHORING_ENABLED = true;
  mocks.server.mockImplementation((_request: Request, h: Headers) => {
    h.append("Set-Cookie", "owned_session=refreshed; Path=/; HttpOnly");
    return { kind: "auth" };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("UNEXPECTED_PROVIDER_REQUEST");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
async function setup(
  options: Parameters<typeof createRequirementContextFixture>[0] = {},
  override?: Parameters<typeof ownedStore>[1],
) {
  const f = await createRequirementContextFixture({
    confirm: true,
    ...options,
  });
  const store = ownedStore(f.context, override);
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.admin.mockReturnValue(store.client);
  return {
    ...f,
    store,
    args: {
      request: new Request(
        `https://example.test/analysis/${f.owned.analysisId}/score`,
      ),
      params: { id: f.owned.analysisId },
    },
  };
}
function privateResponse(h: Headers) {
  expect(h.get("Cache-Control")).toBe("private, no-store");
  expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
}
it("loads the actual current typed workspace through the authenticated owned score path", async () => {
  const f = await setup();
  const response = await loader(f.args);
  expect(response.data).toHaveProperty(
    "typedAuthoring.schemaVersion",
    "typed-authoring-workspace/1.0.0",
  );
  expect(response.data.typedAuthoring?.binding.canonical).toEqual({
    versionId: f.context.canonical.versionId,
    revision: f.context.canonical.revision,
    contentSha256: f.context.canonical.contentSha256,
  });
  expect(response.data.typedAuthoring?.binding.requirements).toEqual({
    versionId: f.context.requirements.versionId,
    revision: f.context.requirements.revision,
    inputSha256: f.context.requirements.inputSha256,
    contentSha256: f.context.requirements.contentSha256,
  });
  expect(response.data.typedAuthoring?.diagnosticDigest).toBe(
    response.data.diagnostics.score.inputSha256,
  );
  expect(response.data.typedAuthoring?.coverageDigest).toBe(
    response.data.typedCoverage?.digest,
  );
  expect(response.data.authoring).toBeNull();
  expect(f.store.rpc).toHaveBeenCalledTimes(3);
  for (const [name, args] of f.store.rpc.mock.calls) {
    expect(name).toBe("read_requirement_relationship_context");
    expect(args).toEqual({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_selection: {
        canonicalVersionId: f.context.canonical.versionId,
        requirementVersionId: f.context.requirements.versionId,
      },
    });
  }
  expect(fetch).not.toHaveBeenCalled();
  privateResponse(new Headers(response.init?.headers));
  expect(new Headers(response.init?.headers).getSetCookie()).toEqual([
    "owned_session=refreshed; Path=/; HttpOnly",
  ]);
});
it("denies disabled scoring before authentication or owned I/O", async () => {
  const f = await setup();
  mocks.flags.SCORING_V2_ENABLED = false;
  await expect(loader(f.args)).rejects.toMatchObject({ init: { status: 404 } });
  expect(mocks.server).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(f.store.from).not.toHaveBeenCalled();
  expect(f.store.rpc).not.toHaveBeenCalled();
});
it.each(["AUTHORING_ENABLED", "TYPED_AUTHORING_ENABLED"] as const)(
  "keeps actual typed diagnostics read-only when %s is disabled",
  async (flag) => {
    const f = await setup();
    mocks.flags[flag] = false;
    const result = await loader(f.args);
    expect(result.data.typedAuthoring).toBeNull();
    expect(result.data.typedCoverage?.state).toBe("available");
    expect(f.store.rpc).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("redirects an unauthenticated reader with private headers and refreshed cookies", async () => {
  const f = await setup();
  mocks.user.mockResolvedValue(null);
  let failure: unknown;
  try {
    await loader(f.args);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Response);
  const response = failure as Response;
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(
    `/auth?next=${encodeURIComponent(`/analysis/${f.owned.analysisId}/score`)}`,
  );
  privateResponse(response.headers);
  expect(response.headers.getSetCookie()).toHaveLength(1);
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(f.store.rpc).not.toHaveBeenCalled();
});
it.each(["foreign_owner", "withdrawn_access"] as const)(
  "hides owned score inputs for %s",
  async (kind) => {
    const f = await setup();
    if (kind === "withdrawn_access")
      f.store.privacy.requests.push({
        user_id: f.owned.ownerId,
        kind: "deletion",
        status: "queued",
      });
    if (kind === "foreign_owner") mocks.user.mockResolvedValue({ id: id(901) });
    await expect(loader(f.args)).rejects.toMatchObject({
      init: { status: 404 },
    });
    expect(f.store.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  "not_found",
  "missing_migration",
  "foreign",
  "stale_head",
  "native_digest",
] as const)(
  "retains readable diagnostics but hides actions after the separate authoring read: %s",
  async (kind) => {
    const f = await setup();
    const row = structuredClone(f.context);
    let result: Result;
    if (kind === "not_found")
      result = ok({
        schemaVersion: "requirement-relationship-context/1.0.0",
        status: "not_found",
        scoringEligible: false,
      });
    else if (kind === "missing_migration")
      result = {
        data: null,
        error: { code: "42883", message: "PRIVATE_SOURCE_CANARY" },
      };
    else {
      if (kind === "foreign") row.source.ownerId = id(902);
      if (kind === "stale_head") {
        row.heads.canonicalHeadId = id(903);
        row.heads.canonicalHeadRevision++;
      }
      if (kind === "native_digest") {
        row.canonical.contentSha256 = "f".repeat(64);
        row.headerSnapshot.canonicalContentSha256 = row.canonical.contentSha256;
      }
      result = ok(row);
    }
    f.store.rpc
      .mockResolvedValueOnce(ok(f.context))
      .mockResolvedValueOnce(ok(f.context))
      .mockResolvedValueOnce(result);
    const response = await loader(f.args);
    expect(response.data.typedAuthoring).toBeNull();
    expect(response.data.typedCoverage?.state).toBe("available");
    expect(JSON.stringify(response.data)).not.toContain(
      "PRIVATE_SOURCE_CANARY",
    );
    expect(f.store.rpc).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([null, 21])(
  "keeps incomplete declared page metadata %s explanation-only and denies actual preparation",
  async (pageCount) => {
    const f = await setup({ pageCount });
    const response = await loader(f.args);
    const workspace = response.data.typedAuthoring;
    expect(workspace).not.toBeNull();
    expect(workspace?.binding.source).toEqual(f.context.source);
    expect(workspace?.binding.canonical.versionId).toBe(
      f.context.canonical.versionId,
    );
    expect(workspace?.binding.requirements.versionId).toBe(
      f.context.requirements.versionId,
    );
    expect(workspace?.scoreValue).toBeNull();
    expect(workspace?.scoreDelta).toBeNull();
    expect(workspace?.targets.length).toBeGreaterThan(0);
    expect(
      workspace?.targets.every(
        (target) =>
          target.state === "explanation_only" &&
          target.reason === "incomplete_source_coverage" &&
          target.location === null,
      ),
    ).toBe(true);
    expect(response.data.typedCoverage?.state).toBe("available");
    expect(response.data.diagnostics.readiness).toHaveProperty(
      "declaredPageCount",
      pageCount,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      f.store.rpc.mock.calls.every(
        ([name]) => name === "read_requirement_relationship_context",
      ),
    ).toBe(true);
    f.store.rpc.mockClear();
    const preview = await typedAction({
      params: f.args.params,
      request: new Request(
        `https://example.test/analysis/${f.owned.analysisId}/author/typed`,
        {
          method: "POST",
          headers: { Origin: "https://example.test" },
          body: new URLSearchParams({
            action: "preview",
            selection: JSON.stringify({
              canonicalVersionId: f.context.canonical.versionId,
              requirementVersionId: f.context.requirements.versionId,
              clauseId: f.context.requirements.content.relations.clauses[0].id,
              targetFactId: f.targetFactId,
            }),
          }),
        },
      ),
    });
    expect(preview.status).toBe(422);
    expect((await preview.json()).kind).toBe("error");
    expect(f.store.rpc).toHaveBeenCalledTimes(1);
    expect(f.store.rpc.mock.calls[0][0]).toBe(
      "read_requirement_relationship_context",
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("does not unpause a real historical canonical selection", async () => {
  const f = await setup({ extraVersions: 1 });
  const original = f.context.ancestors.at(-1)!;
  const selected = structuredClone(f.context);
  selected.canonical = { ...original, locale: original.content.locale };
  selected.ancestors = [];
  selected.headerSnapshot.canonicalVersionId = original.versionId;
  selected.headerSnapshot.canonicalContentSha256 = original.contentSha256;
  selected.headerSnapshot.creationKind = "grouped_import";
  f.store.rpc.mockResolvedValue(ok(selected));
  f.args.request = new Request(
    `${f.args.request.url}?canonical=${original.versionId}`,
  );
  const response = await loader(f.args);
  expect(response.data.historical).toBe(true);
  expect(response.data.typedAuthoring).toBeNull();
  expect(response.data.canonical.versionId).toBe(original.versionId);
  expect(response.data.canonical.headId).toBe(f.context.heads.canonicalHeadId);
  expect(f.store.rpc).toHaveBeenCalledTimes(2);
});
it("does not unpause a real historical typed requirement selection", async () => {
  const f = await setup();
  const newer = createJobRequirementRelations("Requirements\nPython required", {
    ownerId: f.owned.ownerId,
    organizationId: f.owned.organizationId,
    analysisId: f.owned.analysisId,
    jobId: f.context.requirements.content.jobId,
    parentVersionId: f.context.requirements.versionId,
    locale: f.context.requirements.content.locale,
    domain: f.context.requirements.content.domain,
  });
  const selected = structuredClone(f.context);
  selected.heads.requirementHeadId = newer.id;
  selected.heads.requirementHeadRevision = 2;
  f.store.requirementRows.push({
    id: newer.id,
    analysis_id: f.owned.analysisId,
    job_id: newer.jobId,
    owner_id: f.owned.ownerId,
    organization_id: f.owned.organizationId,
    parent_version_id: newer.parentVersionId,
    revision: 2,
    content: newer,
    created_at: newer.createdAt,
  });
  f.store.job.description = newer.sourceText;
  f.store.rpc.mockResolvedValue(ok(selected));
  f.args.request = new Request(
    `${f.args.request.url}?requirements=${f.context.requirements.versionId}`,
  );
  const response = await loader(f.args);
  expect(response.data.historical).toBe(true);
  expect(response.data.typedAuthoring).toBeNull();
  expect(response.data.requirements?.versionId).toBe(
    f.context.requirements.versionId,
  );
  expect(response.data.requirements?.headId).toBe(newer.id);
  expect(f.store.rpc).toHaveBeenCalledTimes(2);
});
it("keeps the score action read-only and preserves every private cookie through headers", () => {
  const response = action();
  expect(response.init?.status).toBe(405);
  const h = new Headers(response.init?.headers);
  expect(h.get("Allow")).toBe("GET");
  privateResponse(h);
  expect(mocks.admin).not.toHaveBeenCalled();
  const merged = new Headers(
    headers({
      parentHeaders: new Headers({ "Set-Cookie": "parent=1" }),
      loaderHeaders: new Headers({ "Set-Cookie": "loader=1" }),
      actionHeaders: new Headers({ "Set-Cookie": "action=1" }),
      errorHeaders: new Headers({ "Set-Cookie": "error=1" }),
    }),
  );
  privateResponse(merged);
  expect(merged.getSetCookie()).toEqual([
    "parent=1",
    "loader=1",
    "action=1",
    "error=1",
  ]);
});

it.each(["prepared", "capability_missing", "foreign_reply"] as const)(
  "withholds score input under scoped durable authority: %s",
  async (reason) => {
    const f = await setup();
    if (reason === "prepared") {
      f.store.privacy.dispositions.push({ owner_id: f.owned.ownerId });
      f.store.privacy.requests.push({
        user_id: f.owned.ownerId,
        kind: "deletion",
        status: "failed",
      });
    }
    if (reason === "capability_missing")
      f.store.privacy.accessExecutable = false;
    if (reason === "foreign_reply")
      f.store.privacy.replyOwner = "10000000-0000-4000-8000-000000009999";
    await expect(loader(f.args)).rejects.toMatchObject({
      init: { status: reason === "prepared" ? 404 : 503 },
    });
    expect(f.store.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
