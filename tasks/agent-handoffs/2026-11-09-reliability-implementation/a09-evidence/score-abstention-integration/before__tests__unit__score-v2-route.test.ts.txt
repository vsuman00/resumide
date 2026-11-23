import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({ SCORING_V2_ENABLED: mocks.enabled }),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/score-v2-repository", () => ({
  loadScoreDiagnostics: mocks.load,
}));
import { loader, action, headers } from "../../app/routes/analysis.score";
import { CanonicalError } from "../../app/lib/server/canonical-repository";
const args = (query = "") => ({
  request: new Request(`https://example.test/analysis/test/score${query}`),
  params: { id: "test" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.load.mockResolvedValue({ diagnostics: {} });
});
it("disables diagnostics before auth or privileged reads", async () => {
  mocks.enabled = false;
  await expect(loader(args())).rejects.toMatchObject({ init: { status: 404 } });
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("requires verified sign-in before the admin read model", async () => {
  mocks.user.mockResolvedValue(null);
  await expect(loader(args())).rejects.toMatchObject({ status: 302 });
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects writes without auth or database access", () => {
  const r = action();
  expect(r.init?.status).toBe(405);
  expect(new Headers(r.init?.headers).get("Allow")).toBe("GET");
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects duplicate version selectors", async () => {
  await expect(loader(args("?canonical=a&canonical=b"))).rejects.toMatchObject({
    init: { status: 422 },
  });
  expect(mocks.load).not.toHaveBeenCalled();
});
it("uses the session owner and preserves no-store and cookies", async () => {
  const r = await loader(args("?canonical=version"));
  expect(mocks.load).toHaveBeenCalledWith(undefined, "test", "owner", {
    canonical: "version",
  });
  expect(new Headers(r.init?.headers).get("Cache-Control")).toContain(
    "no-store",
  );
  const h = headers({
    loaderHeaders: new Headers({ "Set-Cookie": "session=test" }),
    errorHeaders: new Headers(),
  } as Parameters<typeof headers>[0]);
  expect(new Headers(h).get("Set-Cookie")).toBe("session=test");
  expect(new Headers(h).get("X-Robots-Tag")).toContain("noindex");
});
it.each([404, 409, 422, 503])(
  "preserves safe repository failure %s",
  async (status) => {
    mocks.load.mockRejectedValue(
      new CanonicalError(status as 404, "Safe failure"),
    );
    await expect(loader(args())).rejects.toMatchObject({
      data: { error: "Safe failure" },
      init: { status },
    });
  },
);
it("never exposes raw database exceptions", async () => {
  mocks.load.mockRejectedValue(Error("secret SQL or source text"));
  await expect(loader(args())).rejects.toMatchObject({
    data: { error: "Scoring diagnostics are unavailable." },
    init: { status: 503 },
  });
});

it.each(["__proto__", "ownerId", "weights", "policyId"])(
  "rejects unsupported selector %s before privileged reads",
  async (key) => {
    await expect(loader(args(`?${key}=untrusted`))).rejects.toMatchObject({
      init: { status: 422 },
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  },
);
