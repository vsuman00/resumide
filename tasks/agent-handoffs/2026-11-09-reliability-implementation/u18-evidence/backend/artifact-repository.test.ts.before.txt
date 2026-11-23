import { beforeEach, expect, it, vi } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  render: vi.fn(),
  download: vi.fn(),
  sourceLinks: vi.fn(),
}));
vi.mock("../../app/lib/server/storage", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/storage")>()),
  createResumeStorage: () => ({ download: mocks.download }),
}));
vi.mock("../../app/lib/server/artifact-source-links", () => ({
  assertSourceLinksPreserved: mocks.sourceLinks,
}));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  loadCanonical: mocks.load,
}));
vi.mock("../../app/lib/server/artifact-renderer", () => ({
  renderArtifact: mocks.render,
}));
import {
  loadArtifactPreview,
  readArtifactForm,
  renderOwnedArtifact,
} from "../../app/lib/server/artifact-repository";
import {
  buildRenderPlan,
  TEMPLATE,
  hash,
} from "../../app/lib/server/artifact-contract";
const client = {} as Parameters<typeof loadArtifactPreview>[0];
let doc: ReturnType<typeof scoreFixture>["canonical"];
beforeEach(() => {
  vi.clearAllMocks();
  doc = scoreFixture().canonical;
  doc.inputSha256 = hash(new Uint8Array([1]));
  mocks.download.mockResolvedValue(new Uint8Array([1]));
  mocks.sourceLinks.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue({
    current: { document: doc },
    headId: doc.versionId,
  });
  mocks.render.mockResolvedValue({
    report: {
      state: "verified",
      contentHash: buildRenderPlan(doc).contentHash,
    },
    bytes: new Uint8Array([1]),
  });
});
const options = () => ({
  versionId: doc.versionId,
  format: "pdf",
  pageSize: "A4",
  templateId: TEMPLATE.id,
});
it("rejects changed head before rendering and checks access again before returning bytes", async () => {
  await expect(
    renderOwnedArtifact(client, doc.analysisId, doc.ownerId, {
      ...options(),
      versionId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(mocks.render).not.toHaveBeenCalled();
  mocks.load
    .mockResolvedValueOnce({
      current: { document: doc },
      headId: doc.versionId,
    })
    .mockRejectedValueOnce(Error("deletion revoked access"));
  await expect(
    renderOwnedArtifact(client, doc.analysisId, doc.ownerId, options()),
  ).rejects.toThrow(/revoked/);
  expect(mocks.render).toHaveBeenCalledOnce();
});
it("blocks source-link loss or changed source bytes before rendering", async () => {
  mocks.sourceLinks.mockRejectedValueOnce(Error("SOURCE_LINKS_NOT_PRESERVED"));
  await expect(
    renderOwnedArtifact(client, doc.analysisId, doc.ownerId, options()),
  ).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining("links missing"),
  });
  expect(mocks.render).not.toHaveBeenCalled();
  mocks.download.mockResolvedValueOnce(new Uint8Array([2]));
  await expect(
    loadArtifactPreview(client, doc.analysisId, doc.ownerId),
  ).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining("could not be checked"),
  });
});
it("detects concurrent edits or altered content after rendering", async () => {
  mocks.load
    .mockResolvedValueOnce({
      current: { document: doc },
      headId: doc.versionId,
    })
    .mockResolvedValueOnce({
      current: { document: doc },
      headId: crypto.randomUUID(),
    });
  await expect(
    renderOwnedArtifact(client, doc.analysisId, doc.ownerId, options()),
  ).rejects.toMatchObject({ status: 409 });
  mocks.load.mockResolvedValue({
    current: { document: doc },
    headId: doc.versionId,
  });
  mocks.render.mockResolvedValueOnce({
    report: { contentHash: "tampered" },
    bytes: new Uint8Array([1]),
  });
  await expect(
    renderOwnedArtifact(client, doc.analysisId, doc.ownerId, options()),
  ).rejects.toMatchObject({ status: 409 });
});
it("blocks empty or uncertain previews without silently omitting facts", async () => {
  mocks.load.mockResolvedValueOnce({ current: null });
  await expect(
    loadArtifactPreview(client, doc.analysisId, doc.ownerId),
  ).rejects.toMatchObject({ status: 422 });
  const f = doc.facts[0];
  f.state = "unconfirmed";
  f.confirmation = null;
  await expect(
    loadArtifactPreview(client, doc.analysisId, doc.ownerId),
  ).rejects.toMatchObject({ status: 422 });
});
it("bounds actual streamed body and rejects duplicate, identity and template injection fields", async () => {
  const body = new URLSearchParams(options());
  const request = (b: URLSearchParams) =>
    new Request("https://example.test/export", { method: "POST", body: b });
  expect(await readArtifactForm(request(body))).toEqual(options());
  for (const [key, value] of [
    ["versionId", doc.versionId],
    ["ownerId", doc.ownerId],
    ["html", "<script/>"],
    ["__proto__", "x"],
  ]) {
    const b = new URLSearchParams(body);
    b.append(key, value);
    await expect(readArtifactForm(request(b))).rejects.toMatchObject({
      status: 422,
    });
  }
  await expect(
    readArtifactForm(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "x".repeat(2049),
      }),
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    readArtifactForm(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify(options()),
      }),
    ),
  ).rejects.toMatchObject({ status: 422 });
});
