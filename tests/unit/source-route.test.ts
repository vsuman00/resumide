import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  owned: vi.fn(),
  source: vi.fn(),
  signed: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
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
vi.mock("../../app/lib/server/storage", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/storage")>()),
  createResumeStorage: () => ({ download: mocks.signed }),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: () => ({ from: () => ({ select: mocks.select }) }),
}));
import { CanonicalError } from "../../app/lib/server/canonical-repository";
import { loader } from "../../app/routes/analysis.source";
const args = {
  request: new Request("http://localhost/analysis/analysis/source"),
  params: { id: "analysis" },
};
const sourceBytes = new TextEncoder().encode("%PDF-test");
const source = {
  storage_key: "organizations/org/resumes/resume/versions/version.pdf",
  checksum: createHash("sha256").update(sourceBytes).digest("hex"),
  bytes: sourceBytes.byteLength,
};
const binding = {
  organization_id: "org",
  resumeId: "resume",
  resume_version_id: "version",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.owned.mockResolvedValue(binding);
  const query = { eq: mocks.eq, maybeSingle: mocks.source };
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.source.mockResolvedValue({ data: source, error: null });
  mocks.signed.mockResolvedValue(sourceBytes);
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
  expect(mocks.eq.mock.calls.slice(0, 4)).toEqual([
    ["id", "version"],
    ["owner_id", "owner"],
    ["organization_id", "org"],
    ["resume_id", "resume"],
  ]);
});
it("refuses an alternate key inside the same organization before reading Storage", async () => {
  mocks.source.mockResolvedValueOnce({
    data: {
      ...source,
      storage_key: "organizations/org/resumes/resume/versions/other.pdf",
    },
    error: null,
  });
  const response = await loader(args);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Source not found.");
  expect(mocks.signed).not.toHaveBeenCalled();
});
it.each(["%PDF-demo", "%PDF-test-other"])(
  "refuses bytes that do not match the saved source",
  async (candidate) => {
    mocks.signed.mockResolvedValueOnce(new TextEncoder().encode(candidate));
    const response = await loader(args);
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).not.toBe("application/pdf");
    expect(await response.text()).toBe("The source PDF is unavailable.");
  },
);
it.each([
  { organization_id: "other-org" },
  { resumeId: "other-resume" },
  { resume_version_id: "other-version" },
])(
  "refuses a changed source binding after Storage returns %j",
  async (change) => {
    mocks.owned
      .mockResolvedValueOnce(binding)
      .mockResolvedValueOnce({ ...binding, ...change });
    const response = await loader(args);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).not.toBe("application/pdf");
    expect(await response.text()).toBe("Source not found.");
  },
);
it("returns the same private 404 if access is lost during the download", async () => {
  mocks.owned
    .mockResolvedValueOnce(binding)
    .mockRejectedValueOnce(new CanonicalError(404, "Source access denied"));
  const denied = await loader(args);
  mocks.user.mockResolvedValueOnce(null);
  const anonymous = await loader(args);
  expect(denied.status).toBe(anonymous.status);
  expect(await denied.text()).toBe(await anonymous.text());
  expect(denied.headers.get("Cache-Control")).toContain("no-store");
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
