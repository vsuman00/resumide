import { beforeEach, expect, it, vi } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  render: vi.fn(),
  preview: vi.fn(),
  canonical: vi.fn(),
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
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  loadCanonical: mocks.canonical,
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
const args = (
  origin = "https://example.test",
  method = "POST",
  versionId = id,
) => ({
  params: { id },
  request: new Request(`https://example.test/analysis/${id}/artifact`, {
    method,
    headers: { Origin: origin },
    body: new URLSearchParams({
      versionId,
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
it("refuses an outdated preview handoff without substituting the new saved resume", async () => {
  const actual = await vi.importActual<
    typeof import("../../app/lib/server/artifact-repository")
  >("../../app/lib/server/artifact-repository");
  mocks.preview.mockImplementation(actual.loadArtifactPreview);
  const document = scoreFixture().canonical;
  expect(document.versionId).not.toBe(id);
  mocks.canonical.mockResolvedValue({
    headId: document.versionId,
    current: { document },
  });
  await expect(
    loader({
      params: { id },
      request: new Request(
        `https://example.test/analysis/${id}/export?version=${id}`,
      ),
    }),
  ).rejects.toMatchObject({
    init: { status: 409 },
    data: {
      error:
        "Your resume changed. Review the current saved version before exporting.",
    },
  });
});
it.each(["malformed", `${id}&version=${id}`])(
  "refuses invalid or repeated export version parameters before reading saved content",
  async (version) => {
    await expect(
      loader({
        params: { id },
        request: new Request(
          `https://example.test/analysis/${id}/export?version=${version}`,
        ),
      }),
    ).rejects.toMatchObject({ init: { status: 422 } });
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it("keeps the exact export version in the sign-in return link", async () => {
  mocks.user.mockResolvedValue(null);
  const path = `/analysis/${id}/export?version=${id}`;
  const response = await loader({
    params: { id },
    request: new Request(`https://example.test${path}`),
  }).catch((error: unknown) => error);
  if (!(response instanceof Response))
    throw new Error("Expected sign-in redirect");
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(
    `/auth?next=${encodeURIComponent(path)}`,
  );
});
it("returns private, actionable responses from check and download while correction confirmation is pending", async () => {
  const original = scoreFixture().canonical;
  const document = reviseCanonical(original, {
    operation: "edit",
    factId: original.facts[0].id,
    value: "Synthetic Reviewed Candidate",
  });
  mocks.canonical.mockResolvedValue({
    headId: document.versionId,
    current: { document },
  });
  const actual = await vi.importActual<
    typeof import("../../app/lib/server/artifact-repository")
  >("../../app/lib/server/artifact-repository");
  mocks.render.mockImplementation(actual.renderOwnedArtifact);
  for (const submit of [action, download]) {
    const result = await submit(args(undefined, undefined, document.versionId));
    if (result instanceof Response) throw new Error("Unexpected attachment");
    const headers = new Headers(result.init?.headers);
    expect(result.init?.status).toBe(422);
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.has("Content-Disposition")).toBe(false);
    expect(result.data).toEqual({
      error: "Review and confirm 1 unconfirmed fact before exporting.",
      report: null,
      options: null,
    });
  }
});
