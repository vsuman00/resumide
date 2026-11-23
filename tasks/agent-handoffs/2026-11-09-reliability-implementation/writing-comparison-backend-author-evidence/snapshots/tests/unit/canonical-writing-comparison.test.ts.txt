import { buildSavedWritingComparison } from "../../app/lib/writing-comparison";
import { compareCanonical } from "../../app/lib/server/canonical-content";
import { expect, it, vi } from "vitest";
import { loadCanonical } from "../../app/lib/server/canonical-repository";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import {
  createRequirementContextFixture,
  requirementFixtureId,
} from "../fixtures/requirement-context";
import type { RequirementRelationshipContext } from "../../app/lib/server/requirement-relationship-context";
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
  const privacy = {
    subjects: new Set([s.ownerId]),
    preparations: [] as { owner_id: string }[],
    requests: [] as { user_id: string; kind: string; status: string }[],
  };
  const authorityRpc = vi.fn((name: string, args: Record<string, unknown>) => ({
    abortSignal: async (signal: AbortSignal) => {
      if (signal.aborted) throw Error("SYNTHETIC_AUTHORITY_ABORTED");
      const read: Read = {
        table: name,
        columns: "",
        filters: args,
        single: true,
      };
      reads.push(read);
      const replacement = override?.(read, reads);
      if (replacement) return replacement;
      if (name === "read_owned_ai_disposition_readiness")
        return ok({
          ...OWNED_AI_DISPOSITION_PROFILE,
          schemaReady: true,
          exportExecutable: false,
          accessExecutable: true,
        });
      const ownerId = String(args.p_user_id);
      if (
        name !== "read_candidate_privacy_access" ||
        !privacy.subjects.has(ownerId)
      )
        return { data: null, error: { code: "42501" } };
      return ok({
        schemaVersion: "candidate-privacy-access/1.0.0",
        ownerId,
        deletionPrepared: privacy.preparations.some(
          (row) => row.owner_id === ownerId,
        ),
        blockingRequest: privacy.requests.some(
          (row) =>
            row.user_id === ownerId &&
            row.kind === "deletion" &&
            !["failed", "cancelled"].includes(row.status),
        ),
      });
    },
  }));
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
  return {
    client: {
      from,
      rpc(name: string, args: Record<string, unknown>) {
        return [
          "read_owned_ai_disposition_readiness",
          "read_candidate_privacy_access",
        ].includes(name)
          ? authorityRpc(name, args)
          : rpc(name, args);
      },
    } as unknown as Parameters<typeof loadCanonical>[0],
    from,
    rpc,
    authorityRpc,
    privacy,
    reads,
    canonicalRows,
    requirementRows,
    source,
    analysis,
    job,
  };
}

it("returns saved writing observations through the actual owned reader", async () => {
  const f = await createRequirementContextFixture({
    edit: "Responsible for services using PostgreSQL",
    confirm: true,
  });
  const store = ownedStore(f.context);
  const before = f.context.ancestors.at(-1)!;
  const model = await loadCanonical(
    store.client,
    f.owned.analysisId,
    f.owned.ownerId,
    { compareId: before.versionId },
  );
  expect(model).toHaveProperty(
    "writingComparison.schemaVersion",
    "saved-writing-comparison/1.0.0",
  );
  expect(model).toHaveProperty(
    "writingComparison.beforeVersionId",
    before.versionId,
  );
});
it("preserves complete raw comparison and uses actual loaded rows without extra RPC", async () => {
  const f = await createRequirementContextFixture({
    edit: "Responsible for services using PostgreSQL",
    confirm: true,
  });
  const store = ownedStore(f.context);
  const before = f.context.ancestors.at(-1)!;
  const model = await loadCanonical(
    store.client,
    f.owned.analysisId,
    f.owned.ownerId,
    { compareId: before.versionId },
  );
  expect(model.comparison).toEqual(
    compareCanonical(before.content, f.context.canonical.content),
  );
  expect(model.writingComparison).toEqual(
    buildSavedWritingComparison({
      before: before.content,
      after: f.context.canonical.content,
      beforeRevision: before.revision,
      afterRevision: f.context.canonical.revision,
      changes: model.comparison!,
    }),
  );
  expect(store.rpc).not.toHaveBeenCalled();
  expect(store.authorityRpc).toHaveBeenCalledTimes(2);
});
it.each(["reverse", "same"])(
  "labels actual selected %s versions and revisions without chronology assumptions",
  async (mode) => {
    const f = await createRequirementContextFixture({
      edit: "Responsible for services using PostgreSQL",
      confirm: true,
    });
    const store = ownedStore(f.context);
    const prior = f.context.ancestors.at(-1)!;
    const options =
      mode === "reverse"
        ? {
            versionId: prior.versionId,
            compareId: f.context.canonical.versionId,
          }
        : { versionId: prior.versionId, compareId: prior.versionId };
    const model = await loadCanonical(
      store.client,
      f.owned.analysisId,
      f.owned.ownerId,
      options,
    );
    expect(model.writingComparison).toMatchObject({
      beforeVersionId: options.compareId,
      afterVersionId: prior.versionId,
      beforeRevision:
        mode === "reverse" ? f.context.canonical.revision : prior.revision,
      afterRevision: prior.revision,
    });
    if (mode === "same") expect(model.writingComparison?.items).toEqual([]);
  },
);
it.each(["no-comparison", "no-head"])(
  "returns null observations for %s",
  async (mode) => {
    const f = await createRequirementContextFixture();
    const store = ownedStore(f.context, (read) =>
      mode === "no-head" && read.table === "canonical_resume_heads"
        ? ok(null)
        : undefined,
    );
    const model = await loadCanonical(
      store.client,
      f.owned.analysisId,
      f.owned.ownerId,
    );
    expect(model.writingComparison).toBeNull();
    expect(model.comparison).toBeNull();
  },
);
it.each([
  "owner",
  "organization",
  "analysis",
  "input",
  "evidence",
  "retention",
  "source",
])("refuses mismatched saved %s identity", async (kind) => {
  const f = await createRequirementContextFixture({
    edit: "Responsible for services using PostgreSQL",
  });
  const store = ownedStore(f.context);
  const other = store.canonicalRows.at(-1)!;
  const content = structuredClone(other.content);
  if (kind === "owner") {
    content.ownerId = requirementFixtureId(999);
    other.owner_id = content.ownerId;
  }
  if (kind === "organization") {
    content.organizationId = requirementFixtureId(999);
    other.organization_id = content.organizationId;
  }
  if (kind === "analysis") content.analysisId = requirementFixtureId(999);
  if (kind === "input") content.inputSha256 = "f".repeat(64);
  if (kind === "evidence") {
    content.sourceEvidenceVersionId = requirementFixtureId(999);
    for (const fact of content.facts)
      for (const cite of fact.sources)
        cite.attemptId = content.sourceEvidenceVersionId;
  }
  if (kind === "retention") content.retentionPolicyId = "another/1.0.0";
  if (kind === "source")
    other.source_resume_version_id = requirementFixtureId(999);
  other.content = content;
  await expect(
    loadCanonical(store.client, f.owned.analysisId, f.owned.ownerId, {
      compareId: other.id,
    }),
  ).rejects.toHaveProperty("status");
});
it("retains the active-root and durable deletion admission before comparison", async () => {
  const f = await createRequirementContextFixture({
    edit: "Responsible for services using PostgreSQL",
  });
  const store = ownedStore(f.context);
  store.privacy.preparations.push({ owner_id: f.owned.ownerId });
  await expect(
    loadCanonical(store.client, f.owned.analysisId, f.owned.ownerId, {
      compareId: f.context.ancestors[0].versionId,
    }),
  ).rejects.toHaveProperty("status");
});
