import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  server: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: mocks.server,
  createSupabaseAdminClient: mocks.admin,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({ APP_ORIGIN: "https://example.test" }),
}));
import { action, loader } from "../../app/routes/api.analysis-cancel";

const analysisId = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";
const requestId = "synthetic-cancel-request";
const privateDetail = "synthetic-private-RPC-detail";
function request(method = "POST", origin = "https://example.test") {
  return new Request(`https://example.test/api/analysis/${analysisId}/cancel`, {
    method,
    headers: { Origin: origin, "X-Request-Id": requestId },
  });
}
function cancel(id: string | undefined = analysisId, req = request()) {
  return action({ request: req, params: { id } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: ownerId });
  mocks.server.mockImplementation((_request: Request, headers: Headers) => {
    headers.append("Set-Cookie", "synthetic-session=fixture; HttpOnly");
    return {};
  });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: "cancelled", error: null });
});

it.each([
  ["not_found", 404],
  ["already_started", 409],
  ["cancelled", 200],
  ["already_cancelled", 200],
] as const)(
  "maps only the exact known status %s to %s",
  async (status, expected) => {
    mocks.rpc.mockResolvedValue({ data: status, error: null });
    const response = await cancel();
    expect(response.status).toBe(expected);
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.getSetCookie()).toEqual([
      "synthetic-session=fixture; HttpOnly",
    ]);
    const body = await response.json();
    if (status === "not_found")
      expect(body).toMatchObject({
        error: {
          code: "NOT_FOUND",
          message: "Analysis not found.",
          retryable: false,
        },
      });
    else {
      expect(response.headers.getSetCookie()).toEqual([
        "synthetic-session=fixture; HttpOnly",
      ]);
      if (status === "already_started")
        expect(body).toEqual({
          status: "already_started",
          message: "Analysis has already started and cannot be cancelled.",
        });
      else
        expect(body).toEqual({
          status: "cancelled",
          alreadyCancelled: status === "already_cancelled",
        });
    }
    expect(JSON.stringify(body)).not.toContain(ownerId);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cancel_owned_analysis", {
      p_analysis_id: analysisId,
      p_user_id: ownerId,
      p_request_id: requestId,
    });
  },
);

it.each([
  { data: null, error: { code: "PGRST202", message: privateDetail } },
  { data: "not_found", error: { message: privateDetail } },
])(
  "reports RPC infrastructure failure safely instead of concealing it as404 %#",
  async (result) => {
    mocks.rpc.mockResolvedValue(result);
    const response = await cancel();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Analysis cancellation is unavailable. Try again shortly.",
        retryable: true,
        requestId,
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateDetail);
  },
);

it("redacts a rejected RPC promise as a retryable service failure", async () => {
  mocks.rpc.mockRejectedValueOnce(new Error(privateDetail));
  const response = await cancel();
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({
    error: { code: "SERVICE_UNAVAILABLE", retryable: true },
  });
  expect(JSON.stringify(body)).not.toContain(privateDetail);
});

it.each([null, undefined, "unrecognized-status", { status: "cancelled" }])(
  "rejects malformed or unknown cancellation output %# instead of claiming success",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const response = await cancel();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE", retryable: true },
    });
    expect(body).not.toHaveProperty("status", "cancelled");
  },
);

it("preserves the POST-only action and loader before privileged access", async () => {
  const responses = [
    loader({ request: request("GET") }),
    await cancel(analysisId, request("GET")),
  ];
  for (const response of responses) {
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});

it("preserves origin/auth guards and conceals missing or malformed route IDs without an RPC", async () => {
  expect(
    (await cancel(analysisId, request("POST", "https://foreign.test"))).status,
  ).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce(null);
  expect((await cancel()).status).toBe(401);
  for (const id of [undefined, "not-a-uuid"]) {
    const response = await action({ request: request(), params: { id } });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Analysis not found." },
    });
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
