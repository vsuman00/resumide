import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { DocxError, DOCX_MEDIA_TYPE } from "../../app/lib/server/docx-extract";
import {
  extractDocxForAnalysis,
  extractionFailureStatus,
} from "../../app/lib/server/extraction-stage";
import { validateResumeUpload } from "../../app/lib/server/upload-validation";
import { buildDocx } from "../fixtures/docx";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const file = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as BlobPart], name, { type });
const LIMIT = 5 * 1024 * 1024;

describe("Word upload validation (ATS-D5)", () => {
  const word = buildDocx(["Alex Example", "Software Engineer at Example Corp"]);

  it("accepts a real .docx and reports its type from the bytes", async () => {
    const result = await validateResumeUpload(
      file(word, "resume.docx", DOCX_MEDIA_TYPE),
      LIMIT,
    );
    expect(result.mediaType).toBe(DOCX_MEDIA_TYPE);
    expect(result.bytes.equals(Buffer.from(word))).toBe(true);
  });

  it("accepts a .docx whose browser type is empty, and still accepts a PDF", async () => {
    expect(
      (await validateResumeUpload(file(word, "resume.docx", ""), LIMIT))
        .mediaType,
    ).toBe(DOCX_MEDIA_TYPE);
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
    expect(
      (
        await validateResumeUpload(
          file(pdf, "resume.pdf", "application/pdf"),
          LIMIT,
        )
      ).mediaType,
    ).toBe("application/pdf");
  });

  it("rejects a file whose bytes disagree with its claimed type, and other types", async () => {
    await expect(
      validateResumeUpload(file(word, "resume.pdf", "application/pdf"), LIMIT),
    ).rejects.toMatchObject({ code: "INVALID_PDF", status: 400 });
    await expect(
      validateResumeUpload(file(word, "resume.txt", "text/plain"), LIMIT),
    ).rejects.toMatchObject({ code: "INVALID_PDF", status: 400 });
    await expect(
      validateResumeUpload(
        file(new TextEncoder().encode("plain text"), "resume.docx", ""),
        LIMIT,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses unsafe Word files with a plain message", async () => {
    const macro = buildDocx(["x"], { "word/vbaProject.bin": "x" });
    await expect(
      validateResumeUpload(file(macro, "m.docx", DOCX_MEDIA_TYPE), LIMIT),
    ).rejects.toMatchObject({
      code: "UNPROCESSABLE_INPUT",
      status: 422,
      message: expect.stringContaining("macros"),
    });
    await expect(
      validateResumeUpload(
        file(buildDocx([""]), "e.docx", DOCX_MEDIA_TYPE),
        LIMIT,
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("No readable text"),
    });
  });

  it("enforces the size limit before reading", async () => {
    await expect(
      validateResumeUpload(file(word, "resume.docx", DOCX_MEDIA_TYPE), 10),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
  });
});

describe("Word extraction in the worker (ATS-D5)", () => {
  const bytes = buildDocx([
    "Alex Example",
    "Software Engineer at Example Corp",
  ]);

  it("returns text, one text block, a checksum and an honest page estimate", () => {
    const result = extractDocxForAnalysis({
      bytes,
      maxBytes: LIMIT,
      expectedSha256: sha(bytes),
    });
    expect(result.text).toBe("Alex Example\nSoftware Engineer at Example Corp");
    expect(result.pageTexts).toEqual([result.text]);
    expect(result.totalPages).toBe(1);
    expect(result.extractorVersion).toBe("docx-reader/1.0.0");
    expect(result.warnings[0]).toContain("no fixed pages");
    expect(result.warnings).not.toContain("Resume exceeds two pages.");
  });

  it("warns about length when the word count implies more than two pages", () => {
    const long = buildDocx(
      Array.from({ length: 120 }, () => "word ".repeat(10)),
    );
    const result = extractDocxForAnalysis({
      bytes: long,
      maxBytes: LIMIT,
      expectedSha256: sha(long),
    });
    expect(result.totalPages).toBe(3);
    expect(result.warnings).toContain("Resume exceeds two pages.");
  });

  it("refuses bytes that do not match the stored checksum", () => {
    expect(() =>
      extractDocxForAnalysis({
        bytes,
        maxBytes: LIMIT,
        expectedSha256: "0".repeat(64),
      }),
    ).toThrow(/checksum/i);
  });

  it("marks an unreadable Word file as failed, not as needing OCR", () => {
    expect(extractionFailureStatus(new DocxError("EMPTY_TEXT"))).toBe("failed");
    expect(() =>
      extractDocxForAnalysis({
        bytes: buildDocx([""]),
        maxBytes: LIMIT,
        expectedSha256: sha(buildDocx([""])),
      }),
    ).toThrow(DocxError);
  });
});
