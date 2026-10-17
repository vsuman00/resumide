import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import {
  createEncryptedOcrControl,
  createOversizedRasterOcrControl,
} from "../../fixtures/ocr-adverse";
import { extractPdfTextLayers } from "../../../app/lib/server/ocr/pdf-detection";

describe("original adverse OCR controls", () => {
  it("creates an authenticated, structurally valid encrypted blank PDF", async () => {
    const fixture = createEncryptedOcrControl();
    const native = await extractPdfTextLayers(fixture.bytes, {
      maxPages: 10,
      maxCharacters: 100_000,
    });
    expect(native.pageTexts).toEqual([""]);
    expect(Buffer.from(fixture.bytes).toString()).toContain("/Encrypt 4 0 R");
    expect(fixture.properties.encryption).toBe(
      "standard_r2_empty_user_password",
    );
    expect(createEncryptedOcrControl().sourceSha256).toBe(fixture.sourceSha256);
  });
  it("contains a real decoded raster above ten megapixels within the source byte cap", async () => {
    const fixture = createOversizedRasterOcrControl();
    expect(fixture.bytes.length).toBeLessThan(10 * 1024 * 1024);
    const bytes = Buffer.from(fixture.bytes);
    const marker = bytes.indexOf("/Subtype /Image");
    const start = bytes.indexOf("stream\n", marker) + 7;
    const length = Number(
      bytes
        .subarray(marker, start)
        .toString()
        .match(/\/Length (\d+)/u)![1],
    );
    expect(inflateSync(bytes.subarray(start, start + length)).length).toBe(
      16_000_000,
    );
    const native = await extractPdfTextLayers(fixture.bytes, {
      maxPages: 10,
      maxCharacters: 100_000,
    });
    expect(native.pageTexts).toEqual([""]);
    expect(fixture.properties.sourcePixels).toBeGreaterThan(10_000_000);
  });
});
