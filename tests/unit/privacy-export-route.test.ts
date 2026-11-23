import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  result_manifest?: unknown;
};
type Query = {
  table: string;
  columns: string;
  filters: Array<{ operator: "eq" | "neq"; column: string; value: unknown }>;
  limit: number | null;
};
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
  manifestRead: vi.fn(),
  rpc: vi.fn(),
  rpcData: {} as Record<string, unknown>,
  rpcErrors: {} as Record<string, unknown>,
  signals: [] as AbortSignal[],
  pendingRpc: "",
  serialize: vi.fn(),
  rows: [] as Row[],
  queries: [] as Query[],
  policyError: null as unknown,
  policyMalformed: false,
  deletionPrepared: false,
  exportError: null as unknown,
  onManifestRead: undefined as (() => void) | undefined,
}));
vi.mock("../../app/lib/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/lib/server/auth")>()),
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
import { loader } from "../../app/routes/api.privacy-export";
import { readCandidatePrivacyAccess } from "../../app/lib/server/privacy-deletion-policy";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const exportId = "10000000-0000-4000-8000-000000000003";
const deletionId = "10000000-0000-4000-8000-000000000004";
const marker = "synthetic-export-marker";
const args = (method = "GET") => ({
  request: new Request(`https://example.test/api/privacy-export/${exportId}`, {
    method,
  }),
  params: { id: exportId },
});
const deletion = (status: string, user_id = owner): Row => ({
  id: deletionId,
  user_id,
  kind: "deletion",
  status,
});

function database() {
  return {
    rpc: mocks.rpc,
    from: (table: string) => {
      const query: Query = { table, columns: "*", filters: [], limit: null };
      mocks.queries.push(query);
      const kind = () =>
        query.filters.find(
          (filter) => filter.column === "kind" && filter.operator === "eq",
        )?.value;
      const result = (single: boolean) => {
        if (kind() === "export" && mocks.exportError)
          return { data: null, error: mocks.exportError };
        let rows = mocks.rows.filter((row) =>
          query.filters.every((filter) =>
            filter.operator === "eq"
              ? row[filter.column as keyof Row] === filter.value
              : row[filter.column as keyof Row] !== filter.value,
          ),
        );
        if (query.limit !== null) rows = rows.slice(0, query.limit);
        const values = rows.map((row) =>
          Object.fromEntries(
            query.columns
              .split(",")
              .map((value) => value.trim())
              .map((column) => [column, row[column as keyof Row]]),
          ),
        );
        if (kind() === "export") mocks.onManifestRead?.();
        return { data: single ? (values[0] ?? null) : values, error: null };
      };
      const chain = {
        select: (columns: string) => {
          query.columns = columns;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          query.filters.push({ operator: "eq", column, value });
          return chain;
        },
        neq: (column: string, value: unknown) => {
          query.filters.push({ operator: "neq", column, value });
          return chain;
        },
        limit: (value: number) => {
          query.limit = value;
          return chain;
        },
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
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.queries = [];
  mocks.rpcData = {};
  mocks.rpcErrors = {};
  mocks.signals = [];
  mocks.pendingRpc = "";
  mocks.rpc.mockImplementation(
    (name: string, parameters: Record<string, unknown>) => ({
      abortSignal(signal: AbortSignal) {
        mocks.signals.push(signal);
        if (mocks.pendingRpc === name) return new Promise(() => {});
        const value =
          name === "read_owned_ai_disposition_readiness"
            ? {
                ...OWNED_AI_DISPOSITION_PROFILE,
                schemaReady: true,
                exportExecutable: true,
                accessExecutable: true,
              }
            : {
                schemaVersion: "candidate-privacy-access/1.0.0",
                ownerId: parameters.p_user_id,
                deletionPrepared: mocks.deletionPrepared,
                blockingRequest: mocks.rows.some(
                  (row) =>
                    row.user_id === parameters.p_user_id &&
                    row.kind === "deletion" &&
                    !["failed", "cancelled"].includes(row.status),
                ),
              };
        return Promise.resolve({
          data: Object.hasOwn(mocks.rpcData, name)
            ? mocks.rpcData[name]
            : name === "read_candidate_privacy_access" && mocks.policyMalformed
              ? null
              : value,
          error:
            mocks.rpcErrors[name] ??
            (name === "read_candidate_privacy_access"
              ? mocks.policyError
              : null),
        });
      },
    }),
  );
  mocks.policyError = null;
  mocks.policyMalformed = false;
  mocks.deletionPrepared = false;
  mocks.exportError = null;
  mocks.onManifestRead = undefined;
  mocks.user.mockResolvedValue({ id: owner });
  mocks.server.mockReturnValue({});
  mocks.admin.mockReturnValue(database());
  const manifest = { toJSON: mocks.serialize };
  mocks.serialize.mockReturnValue({
    version: "resumide-export-v1",
    account: { id: owner },
    records: { synthetic: [{ marker }] },
    files: [],
  });
  mocks.manifestRead.mockReturnValue(manifest);
  const completed: Row = {
    id: exportId,
    user_id: owner,
    kind: "export",
    status: "completed",
  };
  Object.defineProperty(completed, "result_manifest", {
    enumerable: true,
    get: mocks.manifestRead,
  });
  mocks.rows = [completed];
});

describe("owner privacy export download", () => {
  it.each([200, 401, 404, 503])(
    "preserves separate SDK cookies and private headers on a %s response",
    async (status) => {
      const cookies = [
        "synthetic-session.0=fresh; Path=/; HttpOnly",
        "synthetic-session.1=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
      ];
      mocks.server.mockImplementation((_request: Request, headers: Headers) => {
        for (const cookie of cookies) headers.append("Set-Cookie", cookie);
        headers.set("Pragma", "no-cache");
        return {};
      });
      if (status === 401) mocks.user.mockResolvedValue(null);
      if (status === 404) mocks.rows.push(deletion("queued"));
      if (status === 503) mocks.policyError = new Error("unavailable");
      const response = await loader(args());
      expect(response.status).toBe(status);
      expect(response.headers.getSetCookie()).toEqual(cookies);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("Pragma")).toBe("no-cache");
      if (status !== 200) {
        expect(response.headers.get("Content-Disposition")).toBeNull();
        expect(await response.text()).not.toContain(marker);
      }
    },
  );

  it("downloads a permitted completed export with fixed no-store and attachment semantics", async () => {
    const response = await loader(args());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="resumide-export.json"',
    );
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(await response.json()).toMatchObject({
      version: "resumide-export-v1",
      account: { id: owner },
    });
    expect(
      mocks.queries.find((query) =>
        query.filters.some(
          (filter) => filter.column === "kind" && filter.value === "export",
        ),
      )?.filters,
    ).toEqual(
      expect.arrayContaining([
        { operator: "eq", column: "id", value: exportId },
        { operator: "eq", column: "user_id", value: owner },
        { operator: "eq", column: "kind", value: "export" },
        { operator: "eq", column: "status", value: "completed" },
      ]),
    );
  });
  it.each(["queued", "processing", "completed"])(
    "revokes old completed manifest access for an active deletion: %s",
    async (status) => {
      mocks.rows.push(deletion(status));
      const response = await loader(args());
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).not.toContain(marker);
      expect(mocks.manifestRead).not.toHaveBeenCalled();
      expect(mocks.serialize).not.toHaveBeenCalled();
    },
  );
  it.each(["failed", "cancelled"])(
    "keeps an old export blocked after durable preparation even when its request is %s",
    async (status) => {
      mocks.rows.push(deletion(status));
      mocks.deletionPrepared = true;
      const response = await loader(args());
      expect(response.status).toBe(404);
      expect(mocks.manifestRead).not.toHaveBeenCalled();
      expect(mocks.serialize).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain(marker);
    },
  );
  it("blocks before serialization when deletion arrives while the manifest is loading", async () => {
    mocks.onManifestRead = () => {
      mocks.rows.push(deletion("queued"));
    };
    const response = await loader(args());
    expect(response.status).toBe(404);
    expect(mocks.manifestRead).toHaveBeenCalledTimes(1);
    expect(mocks.serialize).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(marker);
  });
  it.each([
    deletion("failed"),
    deletion("cancelled"),
    deletion("queued", other),
  ])(
    "permits an export when deletion does not match the existing access policy: %j",
    async (row) => {
      mocks.rows.push(row);
      const response = await loader(args());
      expect(response.status).toBe(200);
      expect(mocks.serialize).toHaveBeenCalledTimes(1);
      expect(mocks.rpc).toHaveBeenCalledWith("read_candidate_privacy_access", {
        p_user_id: owner,
      });
      expect(mocks.queries).toHaveLength(1);
      expect(mocks.queries[0].filters).toContainEqual({
        operator: "eq",
        column: "user_id",
        value: owner,
      });
    },
  );
  it("fails closed on a deletion-policy query error before loading private manifest data", async () => {
    mocks.policyError = { message: "synthetic-private-policy-error" };
    const response = await loader(args());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).not.toContain("synthetic-private-policy-error");
    expect(text).not.toContain(marker);
    expect(mocks.manifestRead).not.toHaveBeenCalled();
    expect(mocks.serialize).not.toHaveBeenCalled();
  });
  it("fails closed on an unverifiable deletion-policy result", async () => {
    mocks.policyMalformed = true;
    const response = await loader(args());
    expect(response.status).toBe(503);
    expect(mocks.manifestRead).not.toHaveBeenCalled();
  });
  it("fails closed if the final access check fails after manifest loading", async () => {
    mocks.onManifestRead = () => {
      mocks.policyError = { message: "synthetic-late-policy-error" };
    };
    const response = await loader(args());
    expect(response.status).toBe(503);
    expect(mocks.manifestRead).toHaveBeenCalledTimes(1);
    expect(mocks.serialize).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("synthetic-late-policy-error");
  });
  it("keeps unauthenticated, missing-id and unsupported-method guards before privileged reads", async () => {
    const method = await loader(args("POST"));
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");
    expect(method.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue(null);
    expect((await loader(args())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: owner });
    expect((await loader({ ...args(), params: {} })).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["queued", "processing", "failed", "cancelled"])(
    "does not expose an export request with status %s",
    async (status) => {
      mocks.rows[0].status = status;
      expect((await loader(args())).status).toBe(404);
      expect(mocks.serialize).not.toHaveBeenCalled();
    },
  );
  it("keeps foreign-owner and manifest-query failures unavailable", async () => {
    mocks.rows[0].user_id = other;
    expect((await loader(args())).status).toBe(404);
    expect(mocks.serialize).not.toHaveBeenCalled();
    mocks.rows[0].user_id = owner;
    mocks.exportError = { message: "synthetic-export-error" };
    const response = await loader(args());
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("synthetic-export-error");
    expect(mocks.serialize).not.toHaveBeenCalled();
  });
});

describe("durable access authority", () => {
  it("checks exact access metadata independently from export permission", async () => {
    mocks.rpcData.read_owned_ai_disposition_readiness = {
      ...OWNED_AI_DISPOSITION_PROFILE,
      schemaReady: true,
      exportExecutable: false,
      accessExecutable: true,
    };
    expect((await loader(args())).status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "read_owned_ai_disposition_readiness",
      "read_candidate_privacy_access",
      "read_owned_ai_disposition_readiness",
      "read_candidate_privacy_access",
    ]);
    expect(mocks.queries).toHaveLength(1);
  });
  it("blocks after preparation even when the request and its storage plan have gone", async () => {
    mocks.deletionPrepared = true;
    expect((await loader(args())).status).toBe(404);
    expect(mocks.manifestRead).not.toHaveBeenCalled();
    expect(mocks.serialize).not.toHaveBeenCalled();
  });
  it("rechecks durable preparation before serializing a loaded manifest", async () => {
    mocks.onManifestRead = () => {
      mocks.deletionPrepared = true;
    };
    expect((await loader(args())).status).toBe(404);
    expect(mocks.manifestRead).toHaveBeenCalledTimes(1);
    expect(mocks.serialize).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    {
      ...OWNED_AI_DISPOSITION_PROFILE,
      schemaReady: true,
      exportExecutable: true,
      accessExecutable: false,
    },
    {
      ...OWNED_AI_DISPOSITION_PROFILE,
      schemaReady: false,
      exportExecutable: true,
      accessExecutable: true,
    },
    {
      ...OWNED_AI_DISPOSITION_PROFILE,
      accessSha256: "0".repeat(64),
      schemaReady: true,
      exportExecutable: true,
      accessExecutable: true,
    },
    {
      ...OWNED_AI_DISPOSITION_PROFILE,
      schemaReady: true,
      exportExecutable: true,
      accessExecutable: true,
      extra: true,
    },
  ])(
    "refuses missing, denied, mismatched or open metadata %# without REST fallback",
    async (reply) => {
      mocks.rpcData.read_owned_ai_disposition_readiness = reply;
      expect((await loader(args())).status).toBe(503);
      expect(mocks.manifestRead).not.toHaveBeenCalled();
      expect(mocks.queries).toHaveLength(0);
      expect(mocks.rpc).not.toHaveBeenCalledWith(
        "read_candidate_privacy_access",
        expect.anything(),
      );
    },
  );
  it.each([
    null,
    {},
    {
      schemaVersion: "candidate-privacy-access/1.0.0",
      ownerId: other,
      deletionPrepared: false,
      blockingRequest: false,
    },
    {
      schemaVersion: "candidate-privacy-access/1.0.0",
      ownerId: owner,
      deletionPrepared: "false",
      blockingRequest: false,
    },
    {
      schemaVersion: "candidate-privacy-access/1.0.0",
      ownerId: owner,
      deletionPrepared: false,
      blockingRequest: false,
      extra: true,
    },
  ])(
    "refuses unverifiable access replies %# without loading private data",
    async (reply) => {
      mocks.rpcData.read_candidate_privacy_access = reply;
      expect((await loader(args())).status).toBe(503);
      expect(mocks.manifestRead).not.toHaveBeenCalled();
      expect(mocks.queries).toHaveLength(0);
    },
  );
  it("fails closed when the access RPC or metadata RPC is absent or denied", async () => {
    for (const name of [
      "read_owned_ai_disposition_readiness",
      "read_candidate_privacy_access",
    ]) {
      mocks.rpcErrors[name] = {
        message: "synthetic-private-denial",
        code: "42501",
      };
      const result = await loader(args());
      expect(result.status).toBe(503);
      expect(await result.text()).not.toContain("synthetic-private-denial");
      delete mocks.rpcErrors[name];
    }
    expect(mocks.manifestRead).not.toHaveBeenCalled();
  });
  it("bounds both RPCs with one deadline and rejects a late ignored cancellation", async () => {
    vi.useFakeTimers();
    let resolveMetadata!: (value: unknown) => void;
    mocks.rpc.mockImplementationOnce(() => ({
      abortSignal(signal: AbortSignal) {
        mocks.signals.push(signal);
        return new Promise((resolve) => {
          resolveMetadata = resolve;
        });
      },
    }));
    mocks.pendingRpc = "read_candidate_privacy_access";
    const pending = readCandidatePrivacyAccess(database(), owner, {
      timeoutMs: 20,
    });
    await vi.advanceTimersByTimeAsync(15);
    resolveMetadata({
      data: {
        ...OWNED_AI_DISPOSITION_PROFILE,
        schemaReady: true,
        exportExecutable: true,
        accessExecutable: true,
      },
      error: null,
    });
    await vi.advanceTimersByTimeAsync(4);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.signals[0]).toBe(mocks.signals[1]);
    expect(mocks.signals[1].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({
      state: "unavailable",
      deletionPrepared: null,
    });
    expect(mocks.signals[1].aborted).toBe(true);
    vi.useRealTimers();
  });
  it.each([
    "read_owned_ai_disposition_readiness",
    "read_candidate_privacy_access",
  ])(
    "refuses a clear reply when %s crosses the deadline before the timer can run",
    async (lateRpc) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
      const original = mocks.rpc.getMockImplementation()!;
      mocks.rpc.mockImplementation((name, parameters) => {
        const query = original(name, parameters);
        return {
          abortSignal(signal: AbortSignal) {
            if (name === lateRpc)
              vi.setSystemTime(new Date("2026-11-15T00:00:05.001Z"));
            return query.abortSignal(signal);
          },
        };
      });
      expect(await readCandidatePrivacyAccess(database(), owner)).toEqual({
        state: "unavailable",
        deletionPrepared: null,
      });
      expect(mocks.signals.every((signal) => signal.aborted)).toBe(true);
      if (lateRpc === "read_owned_ai_disposition_readiness")
        expect(mocks.rpc).not.toHaveBeenCalledWith(
          "read_candidate_privacy_access",
          expect.anything(),
        );
      vi.useRealTimers();
    },
  );
  it("skips already-cancelled access and aborts an in-flight metadata request", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await readCandidatePrivacyAccess(database(), owner, {
        signal: controller.signal,
      }),
    ).toEqual({ state: "unavailable", deletionPrepared: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
    const running = new AbortController();
    mocks.pendingRpc = "read_owned_ai_disposition_readiness";
    const pending = readCandidatePrivacyAccess(database(), owner, {
      signal: running.signal,
    });
    running.abort();
    expect(await pending).toEqual({
      state: "unavailable",
      deletionPrepared: null,
    });
    expect(mocks.signals[0].aborted).toBe(true);
    expect(mocks.queries).toHaveLength(0);
  });
});
