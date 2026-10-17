import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { scoreFixture } from "../fixtures/scoring-v2";
import { renderArtifact } from "../../app/lib/server/artifact-renderer";
import { TEMPLATE } from "../../app/lib/server/artifact-contract";
it.each(["pdf", "docx"] as const)(
  "renders and independently parses %s for A4 and Letter",
  async (format) => {
    const doc = scoreFixture().canonical;
    for (const pageSize of ["A4", "LETTER"]) {
      const result = await renderArtifact(doc, {
        versionId: doc.versionId,
        format,
        pageSize,
        templateId: TEMPLATE.id,
      });
      expect(result.report, JSON.stringify(result.report)).toMatchObject({
        state: "verified",
        criticalParity: 1,
        normalizedTextCoverage: 1,
        orderParity: true,
        linkParity: true,
        structuralAccessibility: true,
      });
      expect(result.bytes!.length).toBeGreaterThan(1000);
    }
  },
  30000,
);
it("blocks unsupported glyphs, overflow, stale input and cancelled work", async () => {
  const doc = scoreFixture().canonical;
  const options = {
    versionId: doc.versionId,
    format: "pdf",
    pageSize: "A4",
    templateId: TEMPLATE.id,
  };
  await expect(
    renderArtifact(doc, { ...options, versionId: crypto.randomUUID() }),
  ).rejects.toThrow(/changed/);
  await expect(
    renderArtifact(doc, options, AbortSignal.abort()),
  ).rejects.toThrow(/cancel/);
  for (const value of ["Unsupported 😀", "W".repeat(1000)]) {
    const d = structuredClone(doc);
    const f = d.facts.find((f) => f.type === "name")!;
    f.value = value;
    f.confirmation!.value = value;
    const result = await renderArtifact(d, options);
    expect(result.report.state).toBe("export_verification_failed");
    expect(result.bytes).toBeNull();
  }
}, 30000);

it.each(["pdf", "docx"] as const)(
  "reproduces identical %s bytes for identical version and options",
  async (format) => {
    const doc = scoreFixture().canonical,
      options = {
        versionId: doc.versionId,
        format,
        pageSize: "A4",
        templateId: TEMPLATE.id,
      };
    const first = await renderArtifact(doc, options),
      second = await renderArtifact(doc, options);
    expect(first.report.state).toBe("verified");
    expect(second.bytes).toEqual(first.bytes);
  },
  30000,
);
it("bounds simultaneous jobs and cancels active workers", async () => {
  const doc = scoreFixture().canonical,
    options = {
      versionId: doc.versionId,
      format: "pdf",
      pageSize: "A4",
      templateId: TEMPLATE.id,
    };
  const controller = new AbortController();
  const first = renderArtifact(doc, options, controller.signal),
    second = renderArtifact(doc, options);
  await expect(renderArtifact(doc, options)).rejects.toThrow(/busy/);
  controller.abort();
  await expect(first).rejects.toThrow(/cancel/);
  expect((await second).report.state).toBe("verified");
  expect((await renderArtifact(doc, options)).report.state).toBe("verified");
}, 30000);

it.each(["pdf", "docx"] as const)(
  "preserves mixed text and mathematical symbols in %s without substitution",
  async (format) => {
    const doc = scoreFixture().canonical;
    const fact = doc.facts.find((item) => item.type === "name")!;
    fact.value = "Demo • latency ≤ 100 ms ≥ 50 ms";
    fact.confirmation!.value = fact.value;
    const options = {
      versionId: doc.versionId,
      format,
      pageSize: "A4",
      templateId: TEMPLATE.id,
    };
    const first = await renderArtifact(doc, options);
    expect(first.report).toMatchObject({
      state: "verified",
      criticalParity: 1,
      normalizedTextCoverage: 1,
    });
    const second = await renderArtifact(doc, options);
    expect(second.bytes).toEqual(first.bytes);
    if (format === "docx") {
      const files = unzipSync(first.bytes!);
      const keys = [
        ...strFromU8(files["word/fontTable.xml"]).matchAll(
          /w:fontKey="([^"]+)"/gu,
        ),
      ].map((match) => match[1]);
      expect(keys).toHaveLength(2);
      for (const [index, name] of [
        "NotoSans-Regular.ttf",
        "NotoSansMath-Regular.ttf",
      ].entries()) {
        const data = new Uint8Array(files[`word/fonts/font${index + 1}.odttf`]);
        const key = Buffer.from(
          keys[index].replace(/[{}-]/gu, ""),
          "hex",
        ).reverse();
        for (let i = 0; i < 32; i++) data[i] ^= key[i % 16];
        const digest = (value: Uint8Array) =>
          createHash("sha256").update(value).digest("hex");
        expect(digest(data)).toBe(digest(readFileSync(`assets/fonts/${name}`)));
      }
    }
  },
  30000,
);
