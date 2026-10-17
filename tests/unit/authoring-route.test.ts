import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  read: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    AUTHORING_ENABLED: mocks.enabled,
    APP_ORIGIN: "https://example.test",
  }),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/authoring-repository", () => ({
  readAuthoringForm: mocks.read,
  applyAuthoring: mocks.apply,
}));
vi.mock("../../app/routes/analysis.score", () => ({
  loader: vi.fn(),
  headers: vi.fn(),
  meta: vi.fn(),
  ErrorBoundary: vi.fn(),
  default: vi.fn(),
}));
import { action } from "../../app/routes/analysis.author";
import { CanonicalError } from "../../app/lib/server/canonical-repository";
const status = (r: Awaited<ReturnType<typeof action>>) =>
  r instanceof Response ? r.status : r.init?.status;
const args = (origin = "https://example.test", method = "POST") => ({
  request: new Request("https://example.test/analysis/id/author", {
    method,
    headers: { Origin: origin },
  }),
  params: { id: "id" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.read.mockResolvedValue({
    action: "edit",
    targetFactId: "fact",
    value: "Retained correction",
    expectedVersionId: "version",
    idempotencyKey: "key",
  });
  mocks.apply.mockResolvedValue({ versionId: "new" });
});
it("authoring is default-off and rejects unsupported methods", async () => {
  mocks.enabled = false;
  expect(status(await action(args()))).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.enabled = true;
  expect(status(await action(args("https://example.test", "PUT")))).toBe(405);
});
it("rejects foreign origin and missing sign-in before privileged reads", async () => {
  expect(status(await action(args("https://foreign.test")))).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue(null);
  expect(status(await action(args()))).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("passes authenticated identity and redirects to the recomputed analysis after save", async () => {
  const r = await action(args());
  expect(r).toBeInstanceOf(Response);
  expect((r as Response).headers.get("Location")).toBe("/analysis/id/score");
  expect(mocks.apply).toHaveBeenCalledWith(
    undefined,
    "id",
    "owner",
    expect.objectContaining({ value: "Retained correction" }),
    expect.any(String),
  );
});
it.each([409, 503])(
  "preserves correction and idempotency for failure %s",
  async (status) => {
    mocks.apply.mockRejectedValue(
      new CanonicalError(status as 409, "Safe save failure"),
    );
    const r = await action(args());
    expect(r).toMatchObject({
      data: {
        error: "Safe save failure",
        submitted: expect.objectContaining({
          value: "Retained correction",
          idempotencyKey: "key",
          expectedVersionId: "version",
        }),
      },
      init: { status },
    });
    expect(
      new Headers((r as { init: { headers: Headers } }).init.headers).get(
        "Cache-Control",
      ),
    ).toContain("no-store");
  },
);
