import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  render: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    ARTIFACT_RENDERING_ENABLED: mocks.enabled,
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
vi.mock("../../app/lib/server/artifact-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/artifact-repository")
  >()),
  renderOwnedArtifact: mocks.render,
  loadArtifactPreview: mocks.preview,
}));
import {
  action as download,
  loader as getDownload,
} from "../../app/routes/analysis.artifact";
import { action, loader } from "../../app/routes/analysis.export";
const status = (value: { init?: { status?: number } | null } | Response) =>
  value instanceof Response ? value.status : value.init?.status;
const id = "11111111-1111-4111-8111-111111111111";
const args = (origin = "https://example.test", method = "POST") => ({
  params: { id },
  request: new Request(`https://example.test/analysis/${id}/artifact`, {
    method,
    headers: { Origin: origin },
    body: new URLSearchParams({
      versionId: id,
      format: "pdf",
      pageSize: "A4",
      templateId: "software-engineering-single-column",
    }),
  }),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.user.mockResolvedValue({ id });
  mocks.render.mockResolvedValue({
    report: { state: "verified", artifactSha256: "a".repeat(64) },
    bytes: new Uint8Array([1, 2, 3]),
  });
});
it("rejects foreign origins and unauthenticated users before privileged rendering", async () => {
  expect(status(await download(args("https://evil.test")))).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue(null);
  expect((await action(args())).init?.status).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("keeps renderer default-off and refuses unsupported methods and GET downloads", async () => {
  mocks.enabled = false;
  expect((await action(args())).init?.status).toBe(404);
  expect(mocks.render).not.toHaveBeenCalled();
  mocks.enabled = true;
  expect(status(await download(args("https://example.test", "PUT")))).toBe(405);
  expect(getDownload().init?.status).toBe(405);
  mocks.user.mockResolvedValue(null);
  await expect(
    loader({
      params: { id },
      request: new Request(`https://example.test/analysis/${id}/export`),
    }),
  ).rejects.toMatchObject({ status: 302 });
});
it("sends only verified attachment bytes with private headers and a fixed safe filename", async () => {
  const response = await download(args());
  expect(response).toBeInstanceOf(Response);
  const r = response as Response;
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Content-Disposition")).toBe(
    'attachment; filename="resume.pdf"',
  );
  expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(await r.arrayBuffer()).toHaveProperty("byteLength", 3);
  mocks.render.mockResolvedValue({
    report: { state: "export_verification_failed" },
    bytes: null,
  });
  expect(status(await download(args()))).toBe(422);
});
it("redacts third-party failures from public responses", async () => {
  mocks.render.mockRejectedValue(Error("secret private candidate text"));
  const result = await download(args());
  expect(status(result)).toBe(503);
  expect(JSON.stringify(result)).not.toContain("secret");
});
