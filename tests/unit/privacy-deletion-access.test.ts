import { describe, expect, it, vi } from "vitest";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import { ownedAnalysis } from "../../app/lib/server/canonical-repository";
import { loadJobRequirements } from "../../app/lib/server/job-requirement-repository";
import {
  INACTIVE_DELETION_STATUSES,
  isBlockingDeletionRequest,
} from "../../app/lib/privacy-deletion";

type Row = Record<string, unknown>;
type Filter = { operator: "eq" | "neq"; column: string; value: unknown };
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  other: "10000000-0000-4000-8000-000000000002",
  analysis: "10000000-0000-4000-8000-000000000003",
  organization: "10000000-0000-4000-8000-000000000004",
  source: "10000000-0000-4000-8000-000000000005",
  resume: "10000000-0000-4000-8000-000000000006",
  job: "10000000-0000-4000-8000-000000000007",
  deletion: "10000000-0000-4000-8000-000000000008",
};
it("shares the same finite inactive states with the browser and keeps unknown deletion states blocking", () => {
  expect(INACTIVE_DELETION_STATUSES).toEqual(["failed", "cancelled"]);
  for (const status of [
    "failed",
    "cancelled",
    "queued",
    "processing",
    "completed",
    "unrecognized-status",
  ])
    expect(isBlockingDeletionRequest({ kind: "deletion", status })).toBe(
      !["failed", "cancelled"].includes(status),
    );
  expect(isBlockingDeletionRequest({ kind: "export", status: "queued" })).toBe(
    false,
  );
});
function deletion(status: string, userId = ids.owner) {
  return { id: ids.deletion, user_id: userId, kind: "deletion", status };
}

// Filtered, thenable query doubles exercise the real readers. They do not prove
// hosted SQL, RLS, grants, transaction isolation or complete deletion history.
function database(
  options: {
    deletions?: Row[];
    policyError?: unknown;
    malformedPolicy?: boolean;
    foreignAnalysis?: boolean;
    dispositions?: Row[];
    accessOwner?: string;
    missingMembership?: boolean;
    deletedSource?: boolean;
    wrongSourceOwner?: boolean;
    wrongSourceOrganization?: boolean;
    wrongRootOrganization?: boolean;
    unavailableMetadata?: boolean;
  } = {},
) {
  const tables: Record<string, Row[]> = {
    analyses: [
      {
        id: ids.analysis,
        owner_id: options.foreignAnalysis ? ids.other : ids.owner,
        organization_id: ids.organization,
        resume_version_id: ids.source,
        job_id: ids.job,
      },
    ],
    resume_versions: [
      {
        id: ids.source,
        resume_id: ids.resume,
        owner_id: options.wrongSourceOwner ? ids.other : ids.owner,
        organization_id: options.wrongSourceOrganization
          ? ids.other
          : ids.organization,
        active_resume: {
          id: ids.resume,
          owner_id: ids.owner,
          organization_id: options.wrongRootOrganization
            ? ids.other
            : ids.organization,
          status: options.deletedSource ? "deleted" : "active",
        },
      },
    ],
    jobs: [
      {
        id: ids.job,
        owner_id: ids.owner,
        organization_id: ids.organization,
        title: "Engineer",
        description: "Develop Python APIs.",
      },
    ],
    memberships: options.missingMembership
      ? []
      : [{ user_id: ids.owner, organization_id: ids.organization }],
    data_requests: options.deletions ?? [],
    job_requirement_versions: [],
  };
  const queries: Array<{ table: string; filters: Filter[] }> = [];
  const from = (table: string) => {
    const query = { table, filters: [] as Filter[] };
    queries.push(query);
    let limit = Infinity;
    const valueAt = (row: Row, column: string) =>
      column
        .split(".")
        .reduce<unknown>(
          (value, key) =>
            value && typeof value === "object"
              ? (value as Row)[key]
              : undefined,
          row,
        );
    const result = (single: boolean) => {
      const rows = (tables[table] ?? [])
        .filter((row) =>
          query.filters.every((filter) =>
            filter.operator === "eq"
              ? valueAt(row, filter.column) === filter.value
              : valueAt(row, filter.column) !== filter.value,
          ),
        )
        .slice(0, limit);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        query.filters.push({ operator: "eq", column, value });
        return chain;
      },
      neq: (column: string, value: unknown) => {
        query.filters.push({ operator: "neq", column, value });
        return chain;
      },
      limit: (value: number) => {
        limit = value;
        return chain;
      },
      order: () => chain,
      range: () => chain,
      maybeSingle: async () => result(true),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (error: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => result(false))
          .then(resolve, reject),
    };
    return chain;
  };
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => ({
    abortSignal: () =>
      Promise.resolve({
        data:
          name === "read_owned_ai_disposition_readiness"
            ? {
                ...OWNED_AI_DISPOSITION_PROFILE,
                schemaReady: true,
                exportExecutable: true,
                accessExecutable: !options.unavailableMetadata,
              }
            : options.malformedPolicy
              ? null
              : {
                  schemaVersion: "candidate-privacy-access/1.0.0",
                  ownerId: options.accessOwner ?? args.p_user_id,
                  deletionPrepared: (options.dispositions ?? []).some(
                    (row) => row.owner_id === args.p_user_id,
                  ),
                  blockingRequest: tables.data_requests.some(
                    (row) =>
                      row.user_id === args.p_user_id &&
                      row.kind === "deletion" &&
                      !["failed", "cancelled"].includes(String(row.status)),
                  ),
                },
        error:
          name === "read_candidate_privacy_access"
            ? (options.policyError ?? null)
            : null,
      }),
  }));
  const client = { from, rpc } as unknown as Parameters<
    typeof ownedAnalysis
  >[0];
  return { client, queries, rpc };
}

describe.each([
  {
    name: "canonical source",
    read: (client: Parameters<typeof ownedAnalysis>[0]) =>
      ownedAnalysis(client, ids.analysis, ids.owner),
    expected: { owner_id: ids.owner, resumeId: ids.resume },
  },
  {
    name: "job requirements",
    read: (client: Parameters<typeof ownedAnalysis>[0]) =>
      loadJobRequirements(client, ids.analysis, ids.owner),
    expected: { analysisId: ids.analysis, current: null, history: [] },
  },
])("$name deletion access", ({ read, expected }) => {
  it("allows a failed or successfully withdrawn deletion", async () => {
    for (const status of ["cancelled", "failed"]) {
      const db = database({ deletions: [deletion(status)] });
      await expect(read(db.client)).resolves.toMatchObject(expected);
      expect(db.rpc).toHaveBeenCalledWith("read_candidate_privacy_access", {
        p_user_id: ids.owner,
      });
      expect(db.queries.some((q) => q.table === "data_requests")).toBe(false);
    }
  });
  it("blocks queued, processing, completed and unknown deletion states", async () => {
    for (const status of [
      "queued",
      "processing",
      "completed",
      "unrecognized-status",
    ]) {
      const db = database({ deletions: [deletion(status)] });
      await expect(read(db.client)).rejects.toMatchObject({ status: 404 });
    }
  });
  it("does not let another owner's deletion block this owner", async () => {
    const db = database({ deletions: [deletion("queued", ids.other)] });
    await expect(read(db.client)).resolves.toMatchObject(expected);
    expect(db.rpc).toHaveBeenCalledWith("read_candidate_privacy_access", {
      p_user_id: ids.owner,
    });
    expect(db.queries.some((q) => q.table === "data_requests")).toBe(false);
  });
  it("fails closed when the deletion lookup fails", async () => {
    const db = database({
      policyError: { message: "synthetic-private-policy-error" },
    });
    await expect(read(db.client)).rejects.toMatchObject({ status: 503 });
  });
  it("fails closed when the deletion lookup is not an array", async () => {
    const db = database({ malformedPolicy: true });
    await expect(read(db.client)).rejects.toMatchObject({ status: 503 });
  });
  it("rejects a foreign analysis before reading its deletion history", async () => {
    const db = database({ foreignAnalysis: true });
    await expect(read(db.client)).rejects.toMatchObject({ status: 404 });
    expect(db.queries.some((q) => q.table === "data_requests")).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each(["failed", "cancelled"])(
    "blocks a prepared disposition after its request becomes %s",
    async (status) => {
      const db = database({
        deletions: [deletion(status)],
        dispositions: [{ owner_id: ids.owner, phase: "prepared" }],
      });
      await expect(read(db.client)).rejects.toMatchObject({ status: 404 });
      expect(db.queries.some((q) => q.table === "data_requests")).toBe(false);
    },
  );
  it("keeps preparation blocking after request cleanup without blocking a different owner", async () => {
    const prepared = database({
      dispositions: [{ owner_id: ids.owner, phase: "repair_required" }],
    });
    await expect(read(prepared.client)).rejects.toMatchObject({ status: 404 });
    const foreign = database({
      dispositions: [{ owner_id: ids.other, phase: "prepared" }],
    });
    await expect(read(foreign.client)).resolves.toMatchObject(expected);
  });
  it.each([{ accessOwner: ids.other }, { unavailableMetadata: true }])(
    "fails closed on unverifiable durable authority %j",
    async (options) => {
      const db = database(options);
      await expect(read(db.client)).rejects.toMatchObject({ status: 503 });
      expect(db.queries.some((q) => q.table === "data_requests")).toBe(false);
    },
  );
  it.each([
    { missingMembership: true },
    { deletedSource: true },
    { wrongSourceOwner: true },
    { wrongSourceOrganization: true },
    { wrongRootOrganization: true },
  ])(
    "preserves source and membership denial with a clear durable reply %j",
    async (options) => {
      const db = database(options);
      await expect(read(db.client)).rejects.toMatchObject({ status: 404 });
    },
  );
});
