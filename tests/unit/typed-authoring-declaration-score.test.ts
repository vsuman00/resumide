import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
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
import { loader } from "../../app/routes/analysis.score";
import { buildTypedScoreDiagnostics } from "../../app/lib/server/typed-score-diagnostics";
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

// This store supplies rows from real immutable builders to the actual repositories.
// RPC/catalog metadata is synthetic, not proof of SQL ownership or native readiness.
beforeEach(() => {
  vi.clearAllMocks();
  mocks.flags.SCORING_V2_ENABLED = true;
  mocks.flags.AUTHORING_ENABLED = true;
  mocks.flags.TYPED_AUTHORING_ENABLED = true;
  mocks.server.mockReturnValue({ kind: "authenticated" });
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
) {
  const f = await createRequirementContextFixture({
    confirm: true,
    ...options,
  });
  const store = ownedStore(f.context);
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.admin.mockReturnValue(store.client);
  const args = {
    request: new Request(
      `https://example.test/analysis/${f.owned.analysisId}/score`,
    ),
    params: { id: f.owned.analysisId },
  };
  return { ...f, store, args };
}
it("loads the real declaration workspace while preserving frozen semantic coverage and null numbers", async () => {
  const f = await setup({ edit: "Built database services using PostgreSQL" });
  const actual = buildTypedScoreDiagnostics(f.context);
  const response = await loader(f.args);
  expect(response.data.typedAuthoring).toHaveProperty(
    "schemaVersion",
    "typed-authoring-workspace/1.1.0",
  );
  expect(
    response.data.typedAuthoring?.targets.find(
      (value) => value.factId === f.targetFactId,
    ),
  ).toMatchObject({
    value: "Built database services using PostgreSQL",
    state: "eligible",
  });
  expect(response.data.typedAuthoring?.binding.canonical).toEqual({
    versionId: f.context.canonical.versionId,
    revision: f.context.canonical.revision,
    contentSha256: f.context.canonical.contentSha256,
  });
  expect(response.data.typedCoverage).toEqual(actual.typedCoverage);
  expect(response.data.diagnostics).toEqual(actual.diagnostics);
  expect(
    response.data.diagnostics.score.dimensions.every(
      (value) => value.value === null,
    ),
  ).toBe(true);
  expect(response.data.typedAuthoring?.scoreValue).toBeNull();
  expect(response.data.typedAuthoring?.scoreDelta).toBeNull();
  expect(response.data.authoring).toBeNull();
  expect(f.store.rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_requirement_relationship_context",
    "read_requirement_relationship_context",
    "read_requirement_relationship_context",
  ]);
  expect(new Headers(response.init?.headers).get("Cache-Control")).toBe(
    "private, no-store",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps an unconfirmed edited declaration noneditable through the actual score loader", async () => {
  const f = await setup({
    edit: "Created database services using PostgreSQL",
    confirm: false,
  });
  const response = await loader(f.args);
  expect(
    response.data.typedAuthoring?.targets.find(
      (value) => value.factId === f.targetFactId,
    ),
  ).toMatchObject({
    state: "explanation_only",
    reason: "confirmation_required",
    location: null,
  });
  expect(
    response.data.typedAuthoring?.targets.some(
      (value) => value.state === "eligible",
    ),
  ).toBe(false);
  expect(response.data.typedCoverage).toEqual(
    buildTypedScoreDiagnostics(f.context).typedCoverage,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("retains the unchanged source-only 1.0 workspace and original diagnostics", async () => {
  const f = await setup();
  const response = await loader(f.args);
  expect(response.data.typedAuthoring?.schemaVersion).toBe(
    "typed-authoring-workspace/1.0.0",
  );
  expect(
    response.data.typedAuthoring?.targets.find(
      (value) => value.factId === f.targetFactId,
    )?.state,
  ).toBe("eligible");
  expect(response.data.typedCoverage).toEqual(
    buildTypedScoreDiagnostics(f.context).typedCoverage,
  );
  expect(fetch).not.toHaveBeenCalled();
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
