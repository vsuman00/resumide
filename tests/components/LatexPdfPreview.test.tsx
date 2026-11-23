/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LatexPdfPreview from "~/components/LatexPdfPreview";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));
beforeEach(() => {
  getDocument.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["dismiss", "unmount"])(
  "does not start PDF loading after %s while bytes are pending",
  async (action) => {
    getDocument.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    let resolve!: (bytes: ArrayBuffer) => void;
    const bytes = new Promise<ArrayBuffer>((done) => {
      resolve = done;
    });
    const arrayBuffer = vi.fn(() => bytes);
    const pdf = { arrayBuffer } as unknown as Blob;
    getDocument.mockReturnValue({
      promise: new Promise(() => {}),
      destroy: vi.fn(async () => {}),
    });
    const view = render(<LatexPdfPreview pdf={pdf} pages={1} />);
    await waitFor(() => expect(arrayBuffer).toHaveBeenCalledTimes(1));
    if (action === "dismiss")
      view.rerender(<LatexPdfPreview pdf={null} pages={0} />);
    else view.unmount();
    await act(async () => {
      resolve(new ArrayBuffer(8));
      await bytes;
    });
    expect(getDocument).not.toHaveBeenCalled();
  },
);

function mockPdf() {
  return {
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  } as unknown as Blob;
}
type TextResult = {
  items: ({ str: string; hasEOL?: boolean } | { type: string; id?: string })[];
};
function mockPage(text: string) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    getTextContent: vi.fn(async (): Promise<TextResult> => ({
      items: [{ str: text, hasEOL: true }],
    })),
  };
}
function mockDocument(pages: ReturnType<typeof mockPage>[]) {
  const doc = {
    numPages: pages.length,
    getPage: vi.fn(async (page: number) => pages[page - 1]),
    destroy: vi.fn(async () => {}),
  };
  getDocument.mockReturnValueOnce({
    promise: Promise.resolve(doc),
    destroy: vi.fn(async () => {}),
  });
  return doc;
}

it("refuses inconsistent compiler page metadata before rendering any page", async () => {
  const doc = mockDocument([mockPage("One-page document")]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={2} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(doc.getPage).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("exposes the current page text in labelled native details", async () => {
  const page = mockPage("Current PDF page text");
  const doc = mockDocument([page]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  await waitFor(() => expect(doc.getPage).toHaveBeenCalledWith(1));
  const details = screen.getByRole("group", {
    name: "Text for PDF page 1 of 1",
  });
  expect(details.tagName).toBe("DETAILS");
  const summary = within(details).getByText("Read page text");
  expect(summary.tagName).toBe("SUMMARY");
  fireEvent.click(summary);
  const text = await screen.findByRole("region", {
    name: "Extracted text for PDF page 1",
  });
  expect(text.textContent).toBe("Current PDF page text");
  expect(page.getTextContent).toHaveBeenCalledTimes(1);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
it.each([
  ["InvalidPDFException", "invalid"],
  ["PasswordException", "invalid"],
  ["Error", "unavailable"],
])(
  "classifies a PDF.js %s without exposing its raw message",
  async (name, state) => {
    const pdf = mockPdf();
    const notify = vi.fn();
    getDocument.mockImplementationOnce(() => ({
      promise: Promise.reject(
        Object.assign(new Error("internal PDF detail"), { name }),
      ),
      destroy: vi.fn(async () => {}),
    }));
    render(<LatexPdfPreview pdf={pdf} pages={1} onLoadResult={notify} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("internal PDF detail");
    expect(notify).toHaveBeenCalledExactlyOnceWith({ pdf, state });
  },
);

it("bounds stalled document loading and ignores late readiness", async () => {
  const pdf = mockPdf();
  const notify = vi.fn();
  const timer = vi.spyOn(window, "setTimeout");
  const pending = deferred<{ destroy: () => Promise<void> }>();
  const destroy = vi.fn(async () => {});
  getDocument.mockReturnValueOnce({ promise: pending.promise, destroy });
  const view = render(
    <LatexPdfPreview pdf={pdf} pages={1} onLoadResult={notify} />,
  );
  try {
    await waitFor(() => expect(getDocument).toHaveBeenCalledOnce());
    const deadline = timer.mock.calls.find(
      ([, delay]) => delay === 10_000,
    )?.[0];
    expect(typeof deadline).toBe("function");
    await act(async () => (deadline as () => void)());
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      pdf,
      state: "unavailable",
    });
    expect(destroy).toHaveBeenCalledOnce();
    const discard = vi.fn(async () => {});
    await act(async () => pending.resolve({ destroy: discard }));
    expect(discard).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
  } finally {
    view.unmount();
    timer.mockRestore();
  }
});

function extracted(text: string): TextResult {
  return { items: [{ str: text, hasEOL: true }] };
}
function openText() {
  fireEvent.click(screen.getByText("Read page text"));
}

it("preserves line boundaries and ignores PDF marked-content records", async () => {
  const page = mockPage("");
  page.getTextContent.mockResolvedValue({
    items: [
      { str: "First line", hasEOL: true },
      { type: "beginMarkedContent", id: "section" },
      { str: "Second", hasEOL: false },
      { str: "line", hasEOL: true },
    ],
  });
  mockDocument([page]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  const text = await screen.findByRole("region", {
    name: "Extracted text for PDF page 1",
  });
  expect(text.textContent).toBe("First line\nSecond line");
});

it("renders extracted markup as plain text", async () => {
  const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  mockDocument([mockPage(unsafe)]);
  const view = render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  const text = await screen.findByRole("region", {
    name: "Extracted text for PDF page 1",
  });
  expect(text.textContent).toBe(unsafe);
  expect(view.container.querySelector("script, img")).toBeNull();
});

it("bounds retained page text to 100000 characters", async () => {
  const page = mockPage("x".repeat(100010));
  page.getTextContent.mockResolvedValue({
    items: [{ str: "x".repeat(100010) }, { str: "must not be retained" }],
  });
  mockDocument([page]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  const text = await screen.findByRole("region", {
    name: "Extracted text for PDF page 1",
  });
  expect(text.textContent).toHaveLength(100000);
  expect(text.textContent).not.toContain("must not be retained");
  expect(
    screen.getByText("Text preview is limited to 100,000 characters."),
  ).toBeTruthy();
});

it("keeps complete mathematical glyphs when the text cap cuts a surrogate pair", async () => {
  const prefix = "x".repeat(99_997);
  mockDocument([mockPage(prefix + "𝛼𝛽 trailing text")]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  const text = await screen.findByRole("region", {
    name: "Extracted text for PDF page 1",
  });
  expect(text.textContent?.slice(prefix.length)).toBe("𝛼");
  expect(text.textContent).toHaveLength(99_999);
  expect(
    screen.getByText("Text preview is limited to 100,000 characters."),
  ).toBeTruthy();
});

it("keeps visual preview available when text extraction fails", async () => {
  const page = mockPage("");
  page.getTextContent.mockRejectedValue(
    new Error("internal extraction details"),
  );
  mockDocument([page]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  expect(
    await screen.findByText(
      "Text preview unavailable. You can still view or download the PDF.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("img", { name: "PDF page 1 of 1" })).toBeTruthy();
  expect(page.render).toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("internal extraction details")).toBeNull();
});

it("explains an empty text page without failing the canvas", async () => {
  mockDocument([mockPage("")]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  expect(
    await screen.findByText("No readable text was found on this page."),
  ).toBeTruthy();
  expect(screen.getByRole("img", { name: "PDF page 1 of 1" })).toBeTruthy();
});

it("keeps page text and navigation available after a canvas render failure", async () => {
  const first = mockPage("Readable first page");
  first.render.mockImplementationOnce(() => ({
    promise: Promise.reject(new Error("First page render failed")),
    cancel: vi.fn(),
  }));
  const second = mockPage("Readable second page");
  mockDocument([first, second]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={2} />);
  openText();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(await screen.findByText("Readable first page")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(
    await screen.findByRole("img", { name: "PDF page 2 of 2" }),
  ).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(
    await screen.findByRole("img", { name: "PDF page 1 of 2" }),
  ).toBeTruthy();
});

it("retries rendering the current page without reloading the PDF", async () => {
  const page = mockPage("Readable page");
  page.render.mockImplementationOnce(() => ({
    promise: Promise.reject(new Error("Transient canvas failure")),
    cancel: vi.fn(),
  }));
  mockDocument([page]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry page preview" }));
  expect(
    await screen.findByRole("img", { name: "PDF page 1 of 1" }),
  ).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("region", { name: "PDF page viewport" }),
  );
  expect(getDocument).toHaveBeenCalledTimes(1);
  expect(page.render).toHaveBeenCalledTimes(2);
  expect(page.getTextContent).toHaveBeenCalledTimes(1);
});

it.each(["resolve", "reject"])(
  "ignores a late text %s after switching pages",
  async (outcome) => {
    const old = deferred<TextResult>();
    const first = mockPage("");
    first.getTextContent.mockReturnValue(old.promise);
    const second = mockPage("Current second page");
    mockDocument([first, second]);
    render(<LatexPdfPreview pdf={mockPdf()} pages={2} />);
    openText();
    await waitFor(() => expect(first.getTextContent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const text = await screen.findByRole("region", {
      name: "Extracted text for PDF page 2",
    });
    expect(text.textContent).toBe("Current second page");
    await act(async () => {
      if (outcome === "resolve") old.resolve(extracted("Stale first page"));
      else old.reject(new Error("late old-page failure"));
      await old.promise.catch(() => undefined);
    });
    expect(text.textContent).toBe("Current second page");
    expect(screen.queryByText("Stale first page")).toBeNull();
    expect(
      screen.queryByText(
        "Text preview unavailable. You can still view or download the PDF.",
      ),
    ).toBeNull();
  },
);

it("clears loaded page text while the next page extraction is pending", async () => {
  const next = deferred<TextResult>();
  const second = mockPage("");
  second.getTextContent.mockReturnValue(next.promise);
  mockDocument([mockPage("Previous page text"), second]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={2} />);
  openText();
  expect(await screen.findByText("Previous page text")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(second.getTextContent).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Previous page text")).toBeNull();
  await act(async () => {
    next.resolve(extracted("Next page text"));
    await next.promise;
  });
  expect(await screen.findByText("Next page text")).toBeTruthy();
});

it("does not expose the previous visual page while the next one is rendering", async () => {
  const first = mockPage("First page");
  const second = mockPage("Second page");
  const paint = deferred<void>();
  second.render.mockReturnValue({ promise: paint.promise, cancel: vi.fn() });
  mockDocument([first, second]);
  render(<LatexPdfPreview pdf={mockPdf()} pages={2} />);
  const previous = await screen.findByRole("img", { name: "PDF page 1 of 2" });
  await waitFor(() => expect(first.render).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(second.render).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("Rendering PDF page 2.")).toBeTruthy();
  expect(previous.isConnected).toBe(false);

  await act(async () => {
    paint.resolve();
    await paint.promise;
  });
  expect(
    await screen.findByRole("img", { name: "PDF page 2 of 2" }),
  ).toBeTruthy();
});

it("waits for replacement PDF pixels and ignores a late render from the old document", async () => {
  const oldPaint = deferred<void>();
  const oldPage = mockPage("Previous document");
  const cancelOld = vi.fn();
  oldPage.render.mockReturnValue({
    promise: oldPaint.promise,
    cancel: cancelOld,
  });
  const replacement = mockPage("Replacement document");
  const newPaint = deferred<void>();
  replacement.render.mockReturnValue({
    promise: newPaint.promise,
    cancel: vi.fn(),
  });
  mockDocument([oldPage]);
  mockDocument([replacement]);
  const view = render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  await waitFor(() => expect(oldPage.render).toHaveBeenCalledTimes(1));

  view.rerender(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  await waitFor(() => expect(replacement.render).toHaveBeenCalledTimes(1));
  expect(cancelOld).toHaveBeenCalled();
  await act(async () => {
    oldPaint.resolve();
    await oldPaint.promise;
  });
  expect(screen.queryByRole("img")).toBeNull();

  await act(async () => {
    newPaint.resolve();
    await newPaint.promise;
  });
  expect(
    await screen.findByRole("img", { name: "PDF page 1 of 1" }),
  ).toBeTruthy();
});

it("ignores a late extraction after replacing the PDF", async () => {
  const old = deferred<TextResult>();
  const oldPage = mockPage("");
  oldPage.getTextContent.mockReturnValue(old.promise);
  mockDocument([oldPage]);
  mockDocument([mockPage("New PDF text")]);
  const view = render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  await waitFor(() => expect(oldPage.getTextContent).toHaveBeenCalledTimes(1));
  view.rerender(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  expect(await screen.findByText("New PDF text")).toBeTruthy();
  await act(async () => {
    old.resolve(extracted("Old PDF text"));
    await old.promise;
  });
  expect(screen.queryByText("Old PDF text")).toBeNull();
  expect(screen.getByText("New PDF text")).toBeTruthy();
});

it("clears existing text while replacement PDF bytes are pending", async () => {
  mockDocument([mockPage("Previous PDF text")]);
  const view = render(<LatexPdfPreview pdf={mockPdf()} pages={1} />);
  openText();
  expect(await screen.findByText("Previous PDF text")).toBeTruthy();
  const bytes = deferred<ArrayBuffer>();
  const replacement = {
    arrayBuffer: vi.fn(() => bytes.promise),
  } as unknown as Blob;
  mockDocument([mockPage("Replacement PDF text")]);
  view.rerender(<LatexPdfPreview pdf={replacement} pages={1} />);
  await waitFor(() => expect(replacement.arrayBuffer).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Previous PDF text")).toBeNull();
  await act(async () => {
    bytes.resolve(new ArrayBuffer(8));
    await bytes.promise;
  });
  expect(await screen.findByText("Replacement PDF text")).toBeTruthy();
});

it("rejects an old extraction after dismissal and reopening the same Blob/page", async () => {
  const old = deferred<TextResult>();
  const oldPage = mockPage("");
  oldPage.getTextContent.mockReturnValue(old.promise);
  mockDocument([oldPage]);
  mockDocument([mockPage("Reopened PDF text")]);
  const pdf = mockPdf();
  const view = render(<LatexPdfPreview pdf={pdf} pages={1} />);
  openText();
  await waitFor(() => expect(oldPage.getTextContent).toHaveBeenCalledTimes(1));
  view.rerender(<LatexPdfPreview pdf={null} pages={0} />);
  expect(screen.queryByText("Read page text")).toBeNull();
  view.rerender(<LatexPdfPreview pdf={pdf} pages={1} />);
  openText();
  expect(await screen.findByText("Reopened PDF text")).toBeTruthy();
  await act(async () => {
    old.resolve(extracted("Dismissed PDF text"));
    await old.promise;
  });
  expect(screen.queryByText("Dismissed PDF text")).toBeNull();
  expect(screen.getByText("Reopened PDF text")).toBeTruthy();
});
