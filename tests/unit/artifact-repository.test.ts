import { beforeEach, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import { getDocumentProxy } from "unpdf";
import { strFromU8, unzipSync } from "fflate";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
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
async function confirmedEmail() {
  const source = new PDFDocument();
  const chunks: Buffer[] = [];
  const bytes = new Promise<Uint8Array>((resolve, reject) => {
    source.on("data", (chunk) => chunks.push(chunk));
    source.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    source.on("error", reject);
  });
  source.text(SCORE_SOURCE);
  source.text("fictional@example.test", {
    link: "mailto:fictional@example.test",
  });
  source.end();
  const pdf = await bytes;
  const original = scoreFixture().canonical;
  original.inputSha256 = hash(pdf);
  const email = original.facts.find((fact) => fact.type === "email")!;
  const edited = reviseCanonical(original, {
    operation: "edit",
    factId: email.id,
    value: "corrected@example.test",
  });
  const confirmed = reviseCanonical(edited, {
    operation: "confirm",
    factId: email.id,
  });
  const versions = new Map(
    [confirmed, edited, original].map((document, index) => [
      document.versionId,
      {
        analysisId: document.analysisId,
        resumeId: document.resumeId,
        current: {
          document,
          sourceId: "55555555-5555-4555-8555-555555555555",
          revision: 3 - index,
        },
        headId: confirmed.versionId,
      },
    ]),
  );
  mocks.load.mockImplementation(async (_client, _analysis, _owner, selected) =>
    versions.get(selected?.versionId ?? confirmed.versionId),
  );
  mocks.download.mockResolvedValue(pdf);
  const actual = await vi.importActual<
    typeof import("../../app/lib/server/artifact-source-links")
  >("../../app/lib/server/artifact-source-links");
  mocks.sourceLinks.mockImplementation(actual.assertSourceLinksPreserved);
  return { confirmed, email };
}
it("previews a confirmed email replacement without requiring the old source annotation", async () => {
  const { confirmed, email } = await confirmedEmail();
  await expect(
    loadArtifactPreview(
      client,
      confirmed.analysisId,
      confirmed.ownerId,
      confirmed.versionId,
    ),
  ).resolves.toMatchObject({
    plan: {
      versionId: confirmed.versionId,
      blocks: expect.arrayContaining([
        expect.objectContaining({
          factIds: [email.id],
          text: "corrected@example.test",
          link: "mailto:corrected@example.test",
        }),
      ]),
    },
  });
  expect(mocks.render).not.toHaveBeenCalled();
});
it.each(["pdf", "docx"] as const)(
  "renders actual %s bytes through confirmed source-link replacement",
  async (format) => {
    const { confirmed, email } = await confirmedEmail();
    const actual = await vi.importActual<
      typeof import("../../app/lib/server/artifact-renderer")
    >("../../app/lib/server/artifact-renderer");
    mocks.render.mockImplementation(actual.renderArtifact);
    const plan = buildRenderPlan(confirmed);
    expect(plan.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factIds: [email.id],
          text: "corrected@example.test",
          link: "mailto:corrected@example.test",
        }),
      ]),
    );
    const result = await renderOwnedArtifact(
      client,
      confirmed.analysisId,
      confirmed.ownerId,
      { ...options(), versionId: confirmed.versionId, format },
    );
    expect(result.report).toMatchObject({
      state: "verified",
      versionId: confirmed.versionId,
      contentHash: plan.contentHash,
      artifactSha256: hash(result.bytes!),
      linkParity: true,
      normalizedTextCoverage: 1,
      criticalParity: 1,
    });
    expect(result.bytes!.byteLength).toBeGreaterThan(1000);
    if (format === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(result.bytes!));
      try {
        const text: string[] = [],
          links: string[] = [];
        for (let index = 1; index <= pdf.numPages; index++) {
          const page = await pdf.getPage(index);
          for (const item of (await page.getTextContent()).items)
            if ("str" in item) text.push(item.str);
          for (const annotation of await page.getAnnotations())
            if (annotation.subtype === "Link" && annotation.url)
              links.push(annotation.url);
        }
        const recovered = text.join(" ");
        expect(recovered.split("corrected@example.test")).toHaveLength(2);
        expect(recovered).not.toContain("fictional@example.test");
        expect(links).toContain("mailto:corrected@example.test");
        expect(links).not.toContain("mailto:fictional@example.test");
      } finally {
        await pdf.destroy();
      }
    } else {
      const files = unzipSync(result.bytes!);
      const recovered = strFromU8(files["word/document.xml"]);
      expect(recovered.split("corrected@example.test")).toHaveLength(2);
      expect(recovered).not.toContain("fictional@example.test");
      const relationships = strFromU8(files["word/_rels/document.xml.rels"]);
      expect(relationships).toContain('Target="mailto:corrected@example.test"');
      expect(relationships).not.toContain("mailto:fictional@example.test");
    }
    expect(mocks.load).toHaveBeenLastCalledWith(
      client,
      confirmed.analysisId,
      confirmed.ownerId,
    );
  },
  30000,
);
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
it("returns the confirmation requirement before checking or downloading an unconfirmed correction", async () => {
  const fact = doc.facts.find((item) => item.type === "name")!;
  const edited = reviseCanonical(doc, {
    operation: "edit",
    factId: fact.id,
    value: "Synthetic Reviewed Candidate",
  });
  mocks.load.mockResolvedValue({
    current: { document: edited },
    headId: edited.versionId,
  });
  const refusal = {
    status: 422,
    message: "Review and confirm 1 unconfirmed fact before exporting.",
  };
  await expect(
    loadArtifactPreview(client, edited.analysisId, edited.ownerId),
  ).rejects.toMatchObject(refusal);
  await expect(
    renderOwnedArtifact(client, edited.analysisId, edited.ownerId, options()),
  ).rejects.toMatchObject({ status: 409 });
  for (const format of ["pdf", "docx"]) {
    await expect(
      renderOwnedArtifact(client, edited.analysisId, edited.ownerId, {
        ...options(),
        format,
        versionId: edited.versionId,
      }),
    ).rejects.toMatchObject(refusal);
  }
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.render).not.toHaveBeenCalled();
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
