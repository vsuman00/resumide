import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  extractText: vi.fn(),
  getPage: vi.fn(),
  items: [] as unknown[],
  pages: 1,
}));
vi.mock("unpdf", () => ({
  getDocumentProxy: async () => ({
    numPages: mocks.pages,
    destroy: mocks.destroy,
    getPage: mocks.getPage,
  }),
  extractText: mocks.extractText,
}));
import {
  extractPdfTextLayers,
  MAX_NATIVE_LAYOUT_ITEMS_PER_PAGE,
} from "../../app/lib/server/ocr/pdf-detection";
import { extractResumeText } from "../../app/lib/server/extract";

describe("native layout resource bounds", () => {
  const limits = { maxPages: 2, maxCharacters: 100, includeLayout: true };
  beforeEach(() => {
    mocks.pages = 1;
    mocks.items = [];
    mocks.destroy.mockReset().mockResolvedValue(undefined);
    mocks.extractText.mockReset().mockResolvedValue({
      totalPages: 2,
      text: ["x".repeat(101), "later"],
    });
    mocks.getPage.mockReset().mockImplementation(async () => ({
      getTextContent: async () => ({ items: mocks.items, styles: {} }),
      getViewport: () => ({
        width: 600,
        height: 800,
        rotation: 0,
        convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
      }),
      cleanup: vi.fn(),
    }));
  });

  it("caps zero-text item floods and releases the document on rejection", async () => {
    mocks.items = Array.from(
      { length: MAX_NATIVE_LAYOUT_ITEMS_PER_PAGE + 1 },
      () => ({ str: "" }),
    );
    await expect(
      extractPdfTextLayers(new Uint8Array(), limits),
    ).rejects.toMatchObject({ code: "LAYOUT_LIMIT" });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("rejects page overflow before fetching pages and releases the document", async () => {
    mocks.pages = 3;
    await expect(
      extractPdfTextLayers(new Uint8Array(), limits),
    ).rejects.toMatchObject({ code: "PAGE_LIMIT" });
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("keeps empty pages linked and releases the document on success", async () => {
    const result = await extractPdfTextLayers(new Uint8Array(), limits);
    expect(result.nativeLayout?.pages[0]).toMatchObject({
      pageId: "page-1",
      blocks: [],
    });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it.each([extractPdfTextLayers, extractResumeText])(
    "stops parsing additional text-only pages when the first page exceeds the text limit",
    async (extractor) => {
      mocks.pages = 2;
      mocks.items = [{ str: "x".repeat(101) }];
      await expect(
        extractor(new Uint8Array(), { maxPages: 2, maxCharacters: 100 }),
      ).rejects.toMatchObject({ code: "TEXT_LIMIT" });
      expect(mocks.getPage.mock.calls).toEqual([[1]]);
      expect(mocks.destroy).toHaveBeenCalledOnce();
    },
  );
  it("preserves the primary page-limit failure when PDF teardown rejects", async () => {
    mocks.pages = 3;
    mocks.destroy.mockRejectedValue(new Error("Synthetic teardown refusal"));
    await expect(
      extractPdfTextLayers(new Uint8Array(), limits),
    ).rejects.toMatchObject({ code: "PAGE_LIMIT" });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("stops at the first cancelled page boundary and still tears down the document", async () => {
    mocks.pages = 2;
    const controller = new AbortController();
    mocks.getPage.mockImplementationOnce(async () => ({
      getTextContent: async () => {
        controller.abort();
        return { items: [{ str: "Synthetic text" }], styles: {} };
      },
      cleanup: vi.fn(),
    }));
    await expect(
      extractPdfTextLayers(new Uint8Array(), {
        maxPages: 2,
        maxCharacters: 100,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(mocks.getPage.mock.calls).toEqual([[1]]);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
