/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfLoadResult } from "~/components/LatexPdfPreview";
import LatexConverter from "~/routes/latex";
import { LATEX_LIMITS } from "~/lib/latex-converter";

// Only server and PDF-render boundaries are mocked. The route, navigation, editor,
// compile state machine and disabled AI component are actual product components.
vi.mock("~/lib/server/latex-converter-service", () => ({
  latexLoader: vi.fn(),
}));
const { openPdf } = vi.hoisted(() => ({
  openPdf:
    vi.fn<(pdf: Blob, onLoad: (result: PdfLoadResult) => void) => void>(),
}));
vi.mock("~/components/LatexPdfPreview", async (importOriginal) => {
  const { useEffect } = await import("react");
  const { PDF_VERIFICATION_FAILED } =
    await importOriginal<typeof import("~/components/LatexPdfPreview")>();
  return {
    PDF_VERIFICATION_FAILED,
    default: function MockPreview({
      pdf,
      pages,
      onLoadResult,
    }: {
      pdf: Blob | null;
      pages: number;
      onLoadResult: (result: PdfLoadResult) => void;
    }) {
      useEffect(() => {
        if (pdf) openPdf(pdf, onLoadResult);
      }, [pdf, onLoadResult]);
      return pdf ? (
        <div data-testid="mock-pdf-render-boundary">
          Mock PDF boundary: {pages} page(s), {pdf.size} bytes
        </div>
      ) : null;
    },
  };
});
const runtimeMessage =
  "PDF compilation is unavailable right now. Keep your code and try again later.";
const cleanupMessage =
  "PDF compilation needs service recovery. Keep your code and recompile only after the service is restored.";
const fallback =
  "Compilation failed. Check your code and try again, or load an example.";
const source = String.raw`\documentclass[letterpaper]{article}
\begin{document}
Synthetic recovery fixture.
\end{document}`;
const NativeURL = URL;
const fetchMock = vi.fn<typeof fetch>();
let objectURLCount = 0;
const createObjectURL = vi.fn(
  () => `blob:synthetic-compile-${++objectURLCount}`,
);
const revokeObjectURL = vi.fn();
let router: ReturnType<typeof createMemoryRouter> | undefined;
let errors: ReturnType<typeof vi.spyOn>;
function mount(enabled = true) {
  router = createMemoryRouter(
    [
      {
        id: "build",
        path: "/build",
        loader: () => ({ enabled, aiEnabled: false }),
        element: <LatexConverter />,
        errorElement: <p role="alert">Test route component crashed.</p>,
      },
    ],
    {
      initialEntries: ["/build"],
      hydrationData: { loaderData: { build: { enabled, aiEnabled: false } } },
    },
  );
  return render(<RouterProvider router={router} />);
}
// The editor is CodeMirror; drive it through its view rather than a textarea.
function editor() {
  return screen.getByRole("textbox", { name: "LaTeX source" });
}
function view() {
  return EditorView.findFromDOM(editor().closest(".cm-editor") as HTMLElement)!;
}
function typeSource(value: string) {
  const v = view();
  act(() =>
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      userEvent: "input.paste",
    }),
  );
}
const editorText = () => view().state.doc.toString();
function compileStatus() {
  return within(
    screen.getByRole("region", { name: "Compilation workspace" }),
  ).getByRole("status");
}
function compile() {
  fireEvent.click(screen.getByRole("button", { name: "Recompile" }));
}
function failure(code: unknown) {
  return new Response(
    JSON.stringify({ code, message: "PRIVATE_UNIT_RAW_SERVER_DETAIL" }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}
function pdf(pages = 1) {
  return new Response("%PDF-SYNTHETIC-RENDER-BOUNDARY-ONLY", {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "X-Latex-Pages": String(pages),
    },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
beforeEach(() => {
  // jsdom has no layout; CodeMirror only needs these to exist.
  const rect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON() {},
    }) as DOMRect;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = rect;
  document.elementFromPoint = () => null;
  fetchMock.mockReset();
  openPdf
    .mockReset()
    .mockImplementation((pdf, onLoad) => onLoad({ pdf, state: "verified" }));
  objectURLCount = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  router?.dispose();
  router = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("actual Build route compile recovery with fake HTTP/PDF boundaries", () => {
  it.each([
    ["runtime_unavailable", runtimeMessage],
    ["cleanup_failed", cleanupMessage],
  ])("shows distinct prescribed %s recovery", async (code, message) => {
    fetchMock.mockResolvedValueOnce(failure(code));
    mount();
    typeSource(source);
    compile();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(editorText()).toBe(source);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alert.textContent).not.toContain("PRIVATE_UNIT_RAW_SERVER_DETAIL");
  });
  it.each(["__proto__", "constructor", "toString"])(
    "uses own-property fallback for inherited %s code without React crash",
    async (code) => {
      fetchMock.mockResolvedValueOnce(failure(code));
      mount();
      compile();
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(fallback);
      expect(screen.getByRole("heading", { name: "Build" })).toBeTruthy();
      expect(errors).not.toHaveBeenCalled();
      expect(alert.textContent).not.toContain(code);
    },
  );
  it("keeps an own published unsafe-source message and the exact fake request", async () => {
    fetchMock.mockResolvedValueOnce(failure("source_unsafe"));
    mount();
    typeSource(source);
    compile();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This source requests a prohibited operation. Remove external file access, shell commands and unsupported controls.",
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/build/compile");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      cache: "no-store",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      source,
      profile: "document",
    });
  });
  it.each([
    {
      code: "PRIVATE_UNIT_UNKNOWN_CODE",
      message: "PRIVATE_UNIT_RAW_SERVER_DETAIL",
    },
    { message: "PRIVATE_UNIT_RAW_SERVER_DETAIL" },
    "PRIVATE_UNIT_RAW_SERVER_DETAIL",
  ])("uses fixed fallback for unexpected server body %#", async (body) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 503 }),
    );
    mount();
    compile();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(fallback);
    expect(alert.textContent).not.toContain("PRIVATE_UNIT");
    expect(errors).not.toHaveBeenCalled();
  });
  it("uses fixed fallback for malformed error JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("PRIVATE_UNIT_NON_JSON_DETAIL", { status: 503 }),
    );
    mount();
    compile();
    expect((await screen.findByRole("alert")).textContent).toBe(fallback);
  });
  it("offers sign-in without replacing the editor and retries with the exact code", async () => {
    const cancel = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status: 401 }),
      )
      .mockResolvedValueOnce(pdf());
    mount();
    typeSource(source);
    compile();
    const link = await screen.findByRole("link", {
      name: "Sign in in a new tab",
    });
    expect(link.getAttribute("href")).toBe("/auth?next=%2Fbuild");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(cancel).toHaveBeenCalledOnce();
    expect(editorText()).toBe(source);
    expect(createObjectURL).not.toHaveBeenCalled();
    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
  });
  it.each([
    ["application/pdf-other", "1", "%PDF-sample"],
    ["application/pdf", "1e0", "%PDF-sample"],
    ["application/pdf", "1", ""],
    ["application/pdf", "1", "Unrecognized document"],
  ])(
    "withholds an invalid compile reply (%s, %s, %j)",
    async (mime, pages, body) => {
      fetchMock.mockResolvedValueOnce(
        new Response(body, {
          headers: { "Content-Type": mime, "X-Latex-Pages": pages },
        }),
      );
      mount();
      compile();
      expect((await screen.findByRole("alert")).textContent).toBe(fallback);
      expect(createObjectURL).not.toHaveBeenCalled();
    },
  );
  it("only offers sign-in for an HTTP 401", async () => {
    fetchMock.mockResolvedValueOnce(failure("unauthenticated"));
    mount();
    compile();
    expect((await screen.findByRole("alert")).textContent).toBe(fallback);
    expect(
      screen.queryByRole("link", { name: "Sign in in a new tab" }),
    ).toBeNull();
  });
  it.each([200, 503])(
    "cancels an over-limit stream without waiting for the response to end (%s)",
    async (status) => {
      const cancel = vi.fn();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(LATEX_LIMITS.pdfBytes + 1));
        },
        cancel,
      });
      fetchMock.mockResolvedValueOnce(
        new Response(body, {
          status,
          headers: { "Content-Type": "application/pdf", "X-Latex-Pages": "1" },
        }),
      );
      mount();
      compile();
      expect((await screen.findByRole("alert")).textContent).toBe(fallback);
      expect(cancel).toHaveBeenCalledOnce();
      expect(createObjectURL).not.toHaveBeenCalled();
    },
  );
  it("retains exact source, profile and example paper after cleanup failure", async () => {
    fetchMock.mockResolvedValueOnce(failure("cleanup_failed"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Example options" }));
    fireEvent.change(screen.getByLabelText("Example", { exact: true }), {
      target: { value: "experienced" },
    });
    fireEvent.change(screen.getByLabelText("Example paper"), {
      target: { value: "LETTER" },
    });
    typeSource(source);
    compile();
    expect((await screen.findByRole("alert")).textContent).toBe(cleanupMessage);
    expect(editorText()).toBe(source);
    expect(
      (screen.getByLabelText("Example", { exact: true }) as HTMLSelectElement)
        .value,
    ).toBe("experienced");
    expect(
      (screen.getByLabelText("Example paper") as HTMLSelectElement).value,
    ).toBe("LETTER");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      source,
      profile: "experienced",
    });
  });
  it("creates the current preview/download only at the mocked PDF boundary", async () => {
    fetchMock.mockResolvedValueOnce(pdf(2));
    mount();
    typeSource(source);
    compile();
    expect(
      (await screen.findByTestId("mock-pdf-render-boundary")).textContent,
    ).toContain("2 page(s)");
    const link = await screen.findByRole("link", { name: "Download PDF" });
    expect(link.getAttribute("href")).toBe("blob:synthetic-compile-1");
    expect(link.getAttribute("download")).toBe("document.pdf");
    expect(compileStatus().textContent).toBe("PDF ready. 2 pages.");
    expect(editorText()).toBe(source);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
  it("withholds download until the current compiled PDF passes the document check", async () => {
    const check = deferred<PdfLoadResult["state"]>();
    openPdf.mockImplementationOnce((pdf, onLoad) => {
      void check.promise.then((state) => onLoad({ pdf, state }));
    });
    fetchMock.mockResolvedValueOnce(pdf(2)).mockResolvedValueOnce(pdf());
    mount();
    typeSource(source);
    compile();
    await screen.findByTestId("mock-pdf-render-boundary");
    expect(compileStatus().textContent).toBe("Checking the compiled PDF...");
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    await act(async () => check.resolve("invalid"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The compiled PDF could not be verified.",
    );
    expect(screen.queryByTestId("mock-pdf-render-boundary")).toBeNull();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(editorText()).toBe(source);

    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
    expect(compileStatus().textContent).toBe("PDF ready. 1 page.");
  });
  it("ignores a late rejection of an older PDF after a new result verifies", async () => {
    const stale = deferred<void>();
    openPdf.mockImplementationOnce((pdf, onLoad) => {
      void stale.promise.then(() => onLoad({ pdf, state: "invalid" }));
    });
    fetchMock.mockResolvedValueOnce(pdf()).mockResolvedValueOnce(pdf(2));
    mount();
    compile();
    await screen.findByTestId("mock-pdf-render-boundary");
    typeSource(source);
    compile();
    const download = await screen.findByRole("link", { name: "Download PDF" });
    await act(async () => stale.resolve());
    expect(screen.getByRole("link", { name: "Download PDF" })).toBe(download);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(compileStatus().textContent).toBe("PDF ready. 2 pages.");
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
  it("keeps the download if the browser cannot display the verified server response", async () => {
    openPdf.mockImplementationOnce((pdf, onLoad) =>
      onLoad({ pdf, state: "unavailable" }),
    );
    fetchMock.mockResolvedValueOnce(pdf(2));
    mount();
    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    expect(compileStatus().textContent).toBe("PDF available for download.");
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
  it("invalidates and revokes the old preview/download before a failed recompile", async () => {
    const next = deferred<Response>();
    fetchMock.mockResolvedValueOnce(pdf()).mockReturnValueOnce(next.promise);
    mount();
    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    compile();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.queryByTestId("mock-pdf-render-boundary")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-compile-1");
    await act(async () => next.resolve(failure("runtime_unavailable")));
    expect((await screen.findByRole("alert")).textContent).toBe(runtimeMessage);
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
  it("invalidates old output on an edit and permits a fresh current success", async () => {
    fetchMock.mockResolvedValueOnce(pdf()).mockResolvedValueOnce(pdf(2));
    mount();
    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    typeSource(source);
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.queryByTestId("mock-pdf-render-boundary")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-compile-1");
    compile();
    expect(
      (await screen.findByTestId("mock-pdf-render-boundary")).textContent,
    ).toContain("2 page(s)");
    expect(
      (await screen.findByRole("link", { name: "Download PDF" })).getAttribute(
        "href",
      ),
    ).toBe("blob:synthetic-compile-2");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      source,
      profile: "document",
    });
  });
  it("keeps one request busy across repeated button and keyboard activation", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    mount();
    compile();
    const button = screen.getByRole("button", {
      name: "Compiling...",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.keyDown(editor(), { key: "Enter", ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    await act(async () => pending.resolve(failure("timeout")));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Compilation exceeded the time limit. Simplify the document, then recompile.",
    );
    expect(
      (screen.getByRole("button", { name: "Recompile" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("preserves the Code pane selected after compilation starts", async () => {
    const waiting = deferred<Response>();
    fetchMock.mockReturnValueOnce(waiting.promise);
    mount();
    typeSource(source);
    compile();
    const codeTab = screen.getByRole("button", { name: /^Code$/u });
    codeTab.focus();
    fireEvent.click(codeTab);
    view().focus();
    await act(async () => waiting.resolve(pdf()));
    await screen.findByRole("link", { name: "Download PDF" });
    expect(codeTab.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(editor());
    expect(editorText()).toBe(source);
    expect(compileStatus().textContent).toBe("PDF ready. 1 page.");
  });
  it.each(["cancelled", "completed"])(
    "returns focus to Recompile when the focused Cancel control disappears (%s)",
    async (outcome) => {
      const waiting = deferred<Response>();
      fetchMock.mockReturnValueOnce(waiting.promise);
      mount();
      compile();
      const cancel = screen.getByRole("button", {
        name: /^Cancel$/u,
      });
      cancel.focus();
      if (outcome === "cancelled") {
        fireEvent.click(cancel);
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
      }
      await act(async () => waiting.resolve(pdf()));
      const button = screen.getByRole("button", { name: "Recompile" });
      expect(document.activeElement).toBe(button);
      expect(compileStatus().textContent).toBe(
        outcome === "cancelled"
          ? "Compilation cancelled."
          : "PDF ready. 1 page.",
      );
    },
  );
  it.each(["success", "failure"])(
    "cancels and ignores a late %s before a fresh request",
    async (kind) => {
      const old = deferred<Response>();
      fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(pdf(2));
      mount();
      typeSource(source);
      compile();
      const signal = fetchMock.mock.calls[0][1]?.signal;
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(signal?.aborted).toBe(true);
      expect(compileStatus().textContent).toBe("Compilation cancelled.");
      await act(async () => {
        if (kind === "success") old.resolve(pdf());
        else old.reject(new Error("PRIVATE_UNIT_LATE_FAILURE"));
      });
      expect(compileStatus().textContent).toBe("Compilation cancelled.");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(createObjectURL).not.toHaveBeenCalled();
      compile();
      await screen.findByRole("link", { name: "Download PDF" });
      expect(compileStatus().textContent).toBe("PDF ready. 2 pages.");
      expect(editorText()).toBe(source);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["success", "failure"])(
    "keeps the fresh result when an edited request has a late %s",
    async (kind) => {
      const old = deferred<Response>();
      fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(pdf(2));
      mount();
      compile();
      const signal = fetchMock.mock.calls[0][1]?.signal;
      typeSource(source);
      expect(signal?.aborted).toBe(true);
      compile();
      await screen.findByRole("link", { name: "Download PDF" });
      await act(async () => {
        if (kind === "success") old.resolve(pdf());
        else old.reject(new Error("PRIVATE_UNIT_LATE_FAILURE"));
      });
      expect(compileStatus().textContent).toBe("PDF ready. 2 pages.");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(
        screen.getByTestId("mock-pdf-render-boundary").textContent,
      ).toContain("2 page(s)");
      expect(editorText()).toBe(source);
    },
  );
  it.each(["success", "failure"])(
    "aborts on unmount and ignores late %s",
    async (kind) => {
      const old = deferred<Response>();
      fetchMock.mockReturnValueOnce(old.promise);
      const view = mount();
      compile();
      const signal = fetchMock.mock.calls[0][1]?.signal;
      view.unmount();
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        if (kind === "success") old.resolve(pdf());
        else old.reject(new Error("PRIVATE_UNIT_LATE_FAILURE"));
      });
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    },
  );
  it("retains the existing deadline-abort copy using a controlled browser timer", async () => {
    // Invoke only the component's client deadline; this is not a compiler timeout.
    const timer = vi.spyOn(window, "setTimeout");
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Synthetic abort", "AbortError")),
            { once: true },
          );
        }),
    );
    mount();
    compile();
    const call = timer.mock.calls.find(
      (entry) => entry[1] === LATEX_LIMITS.timeoutMs + 5_000,
    );
    expect(call).toBeDefined();
    expect(typeof call?.[0]).toBe("function");
    await act(async () => {
      (call?.[0] as () => void)();
    });
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Compilation stopped. You can recompile when ready.",
    );
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
  it("reopens compilation at the client deadline and rejects bytes that arrive afterward", async () => {
    const timer = vi.spyOn(window, "setTimeout");
    const oldBytes = deferred<Uint8Array>();
    const pulling = deferred<void>();
    const dropped = vi.fn();
    const cancel = vi.fn();
    const older = new Response(
      new ReadableStream(
        {
          async pull(controller) {
            pulling.resolve();
            const bytes = await oldBytes.promise;
            try {
              controller.enqueue(bytes);
              controller.close();
            } catch {
              dropped();
            }
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
      { headers: { "Content-Type": "application/pdf", "X-Latex-Pages": "1" } },
    );
    fetchMock.mockResolvedValueOnce(older).mockResolvedValueOnce(pdf(2));
    mount();
    typeSource(source);
    compile();
    await act(async () => pulling.promise);
    const callback = timer.mock.calls.find(
      (entry) => entry[1] === LATEX_LIMITS.timeoutMs + 5_000,
    )?.[0];
    expect(typeof callback).toBe("function");
    await act(async () => (callback as () => void)());
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "Compilation stopped. You can recompile when ready.",
    );
    expect(editorText()).toBe(source);
    compile();
    await screen.findByRole("link", { name: "Download PDF" });
    expect(cancel).toHaveBeenCalledOnce();
    await act(async () =>
      oldBytes.resolve(new TextEncoder().encode("%PDF-STALE")),
    );
    expect(dropped).toHaveBeenCalledOnce();
    expect(compileStatus().textContent).toBe("PDF ready. 2 pages.");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("keeps compilation disabled while allowing source edits", async () => {
    mount(false);
    typeSource(source);
    const button = screen.getByRole("button", {
      name: "Recompile",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.keyDown(editor(), { key: "Enter", ctrlKey: true });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(editorText()).toBe(source);
    expect(
      screen.getByText(
        "PDF compilation is turned off for this workspace. You can still edit your code.",
      ),
    ).toBeTruthy();
  });
  it("preserves the source byte limit and refuses over-limit editing/dispatch", async () => {
    mount();
    typeSource("a".repeat(LATEX_LIMITS.sourceBytes + 1));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The edit exceeds the source limit and was not applied. Use a smaller document.",
    );
    const multibyte = "界".repeat(Math.floor(LATEX_LIMITS.sourceBytes / 3) + 1);
    typeSource(multibyte);
    expect(editorText()).toBe(multibyte);
    expect(screen.getByRole("alert").textContent).toBe(
      "Source exceeds the 48 KiB limit. Shorten it before recompiling.",
    );
    expect(
      (screen.getByRole("button", { name: "Recompile" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(editor(), { key: "Enter", ctrlKey: true });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
