import { beforeEach, expect, it, vi } from "vitest";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Array<{
    id: string;
    user_id: string;
    kind: string;
    status: string;
    created_at: string;
  }>,
  deletionPrepared: false,
  accessError: null as unknown,
  targetError: null as unknown,
  rpcData: undefined as unknown,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/privacy", () => ({
  createDataRequest: mocks.create,
  cancelDataRequest: mocks.cancel,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: mocks.server,
  createSupabaseAdminClient: mocks.admin,
  getSessionCookieOptions: () => ({
    path: "/",
    maxAge: 0,
    httpOnly: true,
  }),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({ APP_ORIGIN: "https://example.test" }),
}));
import Privacy, { action, headers, loader } from "../../app/routes/privacy";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
import { PublicApiError } from "../../app/lib/server/errors";

const owner = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const submissionKey = "10000000-0000-4000-8000-000000000003";
function request(
  kind: string,
  origin = "https://example.test",
  key: string | null = submissionKey,
) {
  const body = new URLSearchParams({ kind, requestId });
  if (key !== null) body.set("submissionKey", key);
  return new Request("https://example.test/privacy", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}
function invoke(req: Request) {
  return action({ request: req, params: {}, context: {} } as Parameters<
    typeof action
  >[0]);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [
    {
      id: requestId,
      user_id: owner,
      kind: "deletion",
      status: "queued",
      created_at: "2026-11-10T00:00:00Z",
    },
  ];
  mocks.deletionPrepared = false;
  mocks.accessError = null;
  mocks.targetError = null;
  mocks.rpcData = undefined;
  mocks.admin.mockReturnValue(database());
  mocks.rpc.mockImplementation(
    (name: string, parameters: Record<string, unknown>) => ({
      abortSignal: () =>
        Promise.resolve({
          data:
            name === "read_owned_ai_disposition_readiness"
              ? {
                  ...OWNED_AI_DISPOSITION_PROFILE,
                  schemaReady: true,
                  exportExecutable: true,
                  accessExecutable: true,
                }
              : (mocks.rpcData ?? {
                  schemaVersion: "candidate-privacy-access/1.0.0",
                  ownerId: parameters.p_user_id,
                  deletionPrepared: mocks.deletionPrepared,
                  blockingRequest: mocks.rows.some(
                    (row) =>
                      row.user_id === parameters.p_user_id &&
                      row.kind === "deletion" &&
                      !["failed", "cancelled"].includes(row.status),
                  ),
                }),
          error:
            name === "read_candidate_privacy_access" ? mocks.accessError : null,
        }),
    }),
  );
  mocks.user.mockResolvedValue({ id: owner });
  mocks.server.mockImplementation(
    (_request: Request, responseHeaders: Headers) => {
      responseHeaders.append("Set-Cookie", "synthetic=fixture; HttpOnly");
      return {};
    },
  );
  mocks.create.mockResolvedValue({ status: "queued" });
  mocks.cancel.mockResolvedValue({ status: "cancelled" });
});

it.each([null, "invalid-key"])(
  "rejects an invalid submission key before creating a privacy request: %s",
  async (key) => {
    const result = await invoke(request("export", undefined, key));
    expect(result.init?.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  },
);

it("requires fresh email verification before deletion can create a request", async () => {
  const result = await invoke(request("deletion"));
  expect(result.init?.status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keys deletion to the verified session and clears its cookie after intake", async () => {
  const verifiedSession = "10000000-0000-4000-8000-000000000004";
  const proofCookie = `resumide-deletion-verification-${requestId}.0`;
  mocks.server.mockImplementation(
    (_request: Request, _headers: Headers, isolated?: { name: string }) => ({
      auth: {
        getClaims: async () => ({
          data: {
            claims: {
              sub: owner,
              session_id: isolated ? verifiedSession : requestId,
              amr: [
                {
                  method: "magiclink",
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          },
        }),
      },
    }),
  );
  const mutation = request("deletion");
  mutation.headers.set("Cookie", proofCookie + "=synthetic");
  const result = await invoke(mutation);
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: owner,
      kind: "deletion",
      submissionKey: verifiedSession,
    }),
  );
  expect(result.data.success).toBe("deletion request queued.");
  expect(new Headers(result.init?.headers).getSetCookie()).toEqual([
    expect.stringContaining(proofCookie + "=; Max-Age=0"),
  ]);
});

it("binds creation to the submitted form key and acknowledges replay without promising completion", async () => {
  mocks.create.mockResolvedValueOnce({ status: "already_requested" });
  const result = await invoke(request("export"));
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ userId: owner, kind: "export", submissionKey }),
  );
  expect(result.data.success).toBe(
    "This privacy request is already in your history.",
  );
});

it.each(["export", "cancel"])(
  "returns service contention as a safe SSR action response for %s",
  async (kind) => {
    const busy = new PublicApiError(
      "SERVICE_UNAVAILABLE",
      "Privacy changes are busy. Try again shortly.",
      503,
      true,
      2,
    );
    (kind === "cancel" ? mocks.cancel : mocks.create).mockRejectedValueOnce(
      busy,
    );
    const handler = createStaticHandler([
      {
        id: "privacy",
        path: "/privacy",
        action: (args) => invoke(args.request),
        loader: () => null,
      },
    ]);
    const result = await handler.query(request(kind));
    if (result instanceof Response)
      throw new Error("Expected an SSR action context");
    expect(result.statusCode).toBe(503);
    expect(result.errors).toBeNull();
    expect(result.actionData?.privacy).toEqual({
      error: busy.message,
      success: null,
    });
    const responseHeaders = new Headers(
      await headers({
        loaderHeaders: new Headers(),
        actionHeaders: result.actionHeaders.privacy,
        errorHeaders: new Headers(),
        parentHeaders: new Headers(),
      }),
    );
    expect(responseHeaders.get("Cache-Control")).toBe("private, no-store");
    expect(responseHeaders.get("Vary")).toBe("Cookie");
    expect(responseHeaders.get("Retry-After")).toBe("2");
    expect(responseHeaders.getSetCookie()).toEqual([
      "synthetic=fixture; HttpOnly",
    ]);
    expect(
      kind === "cancel" ? mocks.cancel : mocks.create,
    ).toHaveBeenCalledWith(expect.objectContaining({ userId: owner }));
  },
);

it("preserves origin/authentication guards and unexpected service failures", async () => {
  await expect(
    invoke(request("export", "https://foreign.test")),
  ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  mocks.user.mockResolvedValueOnce(null);
  await expect(invoke(request("export"))).rejects.toMatchObject({
    status: 302,
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.cancel).not.toHaveBeenCalled();
  const unexpected = new Error("synthetic-unexpected-error");
  mocks.create.mockRejectedValueOnce(unexpected);
  await expect(invoke(request("export"))).rejects.toBe(unexpected);
});

it("loads a blocking deletion outside the displayed twenty-row history", async () => {
  mocks.rows = [
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `synthetic-export-${index}`,
      user_id: owner,
      kind: "export",
      status: "completed",
      created_at: "2026-11-10T00:00:00Z",
    })),
    {
      id: requestId,
      user_id: owner,
      kind: "deletion",
      status: "queued",
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const result = await load();
  expect(result.data.requests).toHaveLength(20);
  expect(result.data.requests.every((row) => row.kind === "export")).toBe(true);
  expect(result.data.exportDownloadAccess).toBe("blocked");
  expect(result.data.deletionPrepared).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith("read_candidate_privacy_access", {
    p_user_id: owner,
  });
});

function load() {
  return loader({
    request: new Request("https://example.test/privacy"),
    params: {},
    context: {},
  } as Parameters<typeof loader>[0]);
}
function database() {
  return {
    rpc: mocks.rpc,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let limit: number | undefined;
      const result = (single: boolean) => {
        const values =
          table === "consents"
            ? []
            : mocks.rows
                .filter((row) =>
                  filters.every(
                    ([column, value]) =>
                      row[column as keyof typeof row] === value,
                  ),
                )
                .slice(0, limit);
        return {
          data: single ? (values[0] ?? null) : values,
          error: single ? mocks.targetError : null,
        };
      };
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return chain;
        },
        order: () => chain,
        limit: (value: number) => {
          limit = value;
          return chain;
        },
        maybeSingle: async () => result(true),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result(false)).then(resolve),
      };
      return chain;
    },
  };
}
async function renderPage() {
  const handler = createStaticHandler([
    { id: "privacy", path: "/privacy", Component: Privacy, loader },
  ]);
  const context = await handler.query(
    new Request("https://example.test/privacy"),
  );
  if (context instanceof Response) throw Error("Expected privacy page context");
  return renderToString(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
      hydrate: false,
    }),
  );
}
it.each(["failed", "cancelled"])(
  "keeps durable preparation distinct from a %s request in loader and UI",
  async (status) => {
    mocks.rows[0].status = status;
    mocks.deletionPrepared = true;
    const result = await load();
    expect(result.data.exportDownloadAccess).toBe("blocked");
    expect(result.data.deletionPrepared).toBe(true);
    const html = await renderPage();
    expect(html).toContain("Account deletion has been prepared.");
    expect(html).not.toContain("Download export");
  },
);
it.each(["failed", "cancelled"])(
  "preserves nonblocking %s before preparation",
  async (status) => {
    mocks.rows[0].status = status;
    expect((await load()).data).toMatchObject({
      exportDownloadAccess: "allowed",
      deletionPrepared: false,
    });
  },
);
it("shows durable preparation even when no deletion is in the displayed history", async () => {
  mocks.rows = [];
  mocks.deletionPrepared = true;
  expect((await load()).data).toMatchObject({
    requests: [],
    exportDownloadAccess: "blocked",
    deletionPrepared: true,
  });
});
it("denies a direct cancellation POST for a prepared deletion retry", async () => {
  mocks.deletionPrepared = true;
  const result = await invoke(request("cancel"));
  expect(result.init?.status).toBe(409);
  expect(result.data).toMatchObject({
    error:
      "Account deletion has already been prepared and cannot be cancelled.",
    success: null,
  });
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it("allows cancellation before preparation despite a blocking queued request", async () => {
  const result = await invoke(request("cancel"));
  expect(result.data.success).toBe("Privacy request cancelled.");
  expect(mocks.cancel).toHaveBeenCalledWith(
    expect.objectContaining({ userId: owner, requestId }),
  );
});
it("keeps export cancellation available after deletion preparation", async () => {
  mocks.rows[0].kind = "export";
  mocks.deletionPrepared = true;
  mocks.accessError = { message: "synthetic-private-access-error" };
  const result = await invoke(request("cancel"));
  expect(result.data.success).toBe("Privacy request cancelled.");
  expect(mocks.cancel).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await renderPage()).toContain('value="cancel"');
});
it("hides prepared deletion cancellation but keeps unprepared cancellation visible", async () => {
  mocks.deletionPrepared = true;
  expect(await renderPage()).not.toContain('value="cancel"');
  mocks.deletionPrepared = false;
  expect(await renderPage()).toContain('value="cancel"');
});
it("does not treat unavailable durable authority as unprepared", async () => {
  mocks.accessError = { message: "synthetic-private-access-error" };
  expect((await load()).data).toMatchObject({
    exportDownloadAccess: "unavailable",
    deletionPrepared: null,
  });
  const result = await invoke(request("cancel"));
  expect(result.init?.status).toBe(503);
  expect(JSON.stringify(result.data)).not.toContain(
    "synthetic-private-access-error",
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(await renderPage()).not.toContain('value="cancel"');
});
it("requires an owned target before checking deletion cancellation", async () => {
  mocks.rows[0].user_id = "10000000-0000-4000-8000-000000000003";
  const result = await invoke(request("cancel"));
  expect(result.data.success).toBe(
    "This privacy request can no longer be cancelled.",
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("fails closed on an unavailable cancellation target", async () => {
  mocks.targetError = { message: "synthetic-private-target-error" };
  const result = await invoke(request("cancel"));
  expect(result.init?.status).toBe(503);
  expect(JSON.stringify(result.data)).not.toContain(
    "synthetic-private-target-error",
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
});
