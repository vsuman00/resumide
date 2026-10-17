import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  owned: vi.fn(),
  source: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  ownedAnalysis: mocks.owned,
}));
vi.mock("../../app/lib/server/storage", () => ({
  createResumeStorage: () => ({ download: mocks.signed }),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mocks.source }) }),
      }),
    }),
  }),
}));
import { CanonicalError } from "../../app/lib/server/canonical-repository";
import { loader } from "../../app/routes/analysis.source";
const args = {
  request: new Request("http://localhost/analysis/analysis/source"),
  params: { id: "analysis" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.owned.mockResolvedValue({
    organization_id: "org",
    resume_version_id: "version",
  });
  mocks.source.mockResolvedValue({
    data: { storage_key: "organizations/org/private.pdf" },
    error: null,
  });
  mocks.signed.mockResolvedValue(new TextEncoder().encode("%PDF-test"));
});
it("reauthorizes private same-origin PDF bytes on every open without an expiring URL", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await loader(args);
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(await response.text()).toBe("%PDF-test");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  }
  expect(mocks.signed).toHaveBeenCalledTimes(2);
  expect(mocks.owned).toHaveBeenCalledWith(
    expect.anything(),
    "analysis",
    "owner",
  );
});
it("does not read storage before identity and active-source ownership checks", async () => {
  mocks.user.mockResolvedValueOnce(null);
  expect((await loader(args)).status).toBe(404);
  expect(mocks.owned).not.toHaveBeenCalled();
  mocks.owned.mockRejectedValueOnce(new CanonicalError(404, "Source missing"));
  expect((await loader(args)).status).toBe(404);
  expect(mocks.signed).not.toHaveBeenCalled();
});
it("redacts storage failures and refuses write methods", async () => {
  mocks.signed.mockRejectedValueOnce(new Error("private storage credential"));
  const response = await loader(args);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("credential");
  expect(
    (
      await loader({
        ...args,
        request: new Request(args.request.url, { method: "POST" }),
      })
    ).status,
  ).toBe(405);
});
