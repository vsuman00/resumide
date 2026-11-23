import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import styles from "./LatexConverter.module.css";

const MAX_PAGE_TEXT = 100_000;
const PDF_LOAD_TIMEOUT_MS = 10_000;
export const PDF_VERIFICATION_FAILED =
  "The compiled PDF could not be verified. Your code is still available. Recompile to try again.";
export type PdfLoadResult = {
  pdf: Blob;
  state: "verified" | "unavailable" | "invalid";
};
type PageText = {
  generation: number;
  page: number;
  text: string;
  truncated: boolean;
  unavailable: boolean;
};
type LoadedPdf = { pdf: Blob; generation: number; document: PDFDocumentProxy };
type PageRender = { key: string; state: "ready" | "failed" };

export default function LatexPdfPreview({
  pdf,
  pages,
  onLoadResult,
}: {
  pdf: Blob | null;
  pages: number;
  onLoadResult?: (result: PdfLoadResult) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const nextGeneration = useRef(0);
  const currentScale = useRef(1);
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const [pageRender, setPageRender] = useState<PageRender | null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(600);
  const [failure, setFailure] = useState<PdfLoadResult | null>(null);
  const [pageText, setPageText] = useState<PageText | null>(null);
  const currentPdf = loadedPdf?.pdf === pdf ? loadedPdf : null;
  const fitWidth = zoom === null ? width : 0;
  const renderKey = `${currentPdf?.generation}:${page}:${zoom}:${fitWidth}:${retry}`;
  const currentRender = pageRender?.key === renderKey ? pageRender.state : null;
  const failedState = failure?.pdf === pdf ? failure.state : null;
  const currentText =
    pageText &&
    pageText.generation === currentPdf?.generation &&
    pageText.page === page
      ? pageText
      : null;
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let loading: { destroy: () => Promise<void> } | undefined;
    function destroyLoading() {
      const task = loading;
      loading = undefined;
      if (task) void task.destroy().catch(() => undefined);
    }
    function finish(state: PdfLoadResult["state"]) {
      if (!active || !pdf) return;
      window.clearTimeout(timer);
      const result = { pdf, state };
      if (state !== "verified") {
        setFailure(result);
        destroyLoading();
      }
      onLoadResult?.(result);
    }
    const timer = pdf
      ? window.setTimeout(() => {
          finish("unavailable");
          active = false;
        }, PDF_LOAD_TIMEOUT_MS)
      : undefined;
    const generation = ++nextGeneration.current;
    setPage(1);
    setZoom(null);
    setLoadedPdf(null);
    setPageRender(null);
    setFailure(null);
    if (pdf)
      void (async () => {
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (!active) return;
        const data = new Uint8Array(await pdf.arrayBuffer());
        if (!active) return;
        const task = lib.getDocument({
          data,
          isEvalSupported: false,
        });
        loading = task;
        const doc = await task.promise;
        if (!active) {
          await doc.destroy();
          return;
        }
        if (doc.numPages !== pages) {
          finish("invalid");
          return;
        }
        setLoadedPdf({ pdf, generation, document: doc });
        finish("verified");
      })().catch((error: unknown) => {
        const invalid =
          error instanceof Error &&
          (error.name === "InvalidPDFException" ||
            error.name === "PasswordException");
        finish(invalid ? "invalid" : "unavailable");
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
      destroyLoading();
    };
  }, [pdf, pages, onLoadResult]);
  useEffect(() => {
    if (!currentPdf || !canvas.current) return;
    setPageRender(null);
    let active = true;
    let rendering: RenderTask | undefined;
    const element = canvas.current;
    void (async () => {
      const sheet = await currentPdf.document.getPage(page);
      if (!active || canvas.current !== element) return;
      const base = sheet.getViewport({ scale: 1 });
      const scale =
        zoom ?? Math.max(0.2, Math.min(1.5, (fitWidth - 48) / base.width));
      currentScale.current = scale;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = sheet.getViewport({ scale: scale * ratio });
      element.width = viewport.width;
      element.height = viewport.height;
      element.style.width = `${viewport.width / ratio}px`;
      element.style.height = `${viewport.height / ratio}px`;
      const context = element.getContext("2d");
      if (!context) throw Error("Canvas unavailable");
      rendering = sheet.render({
        canvas: element,
        canvasContext: context,
        viewport,
      });
      await rendering.promise;
      if (active && canvas.current === element)
        setPageRender({ key: renderKey, state: "ready" });
    })().catch((error: unknown) => {
      if (
        active &&
        !(
          error instanceof Error && error.name === "RenderingCancelledException"
        )
      )
        setPageRender({ key: renderKey, state: "failed" });
    });
    return () => {
      active = false;
      rendering?.cancel();
    };
  }, [currentPdf, page, zoom, fitWidth, renderKey]);
  useEffect(() => {
    let active = true;
    setPageText(null);
    if (currentPdf)
      void (async () => {
        const sheet = await currentPdf.document.getPage(page);
        if (!active) return;
        const content = await sheet.getTextContent();
        if (!active) return;
        let text = "";
        let separator = "";
        let truncated = false;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const chunk = separator + item.str;
          const remaining = MAX_PAGE_TEXT - text.length;
          text += chunk.slice(0, remaining);
          if (chunk.length > remaining) {
            truncated = true;
            break;
          }
          separator = item.hasEOL ? "\n" : " ";
        }
        if (truncated && /[\uD800-\uDBFF]$/.test(text))
          text = text.slice(0, -1);
        setPageText({
          generation: currentPdf.generation,
          page,
          text: text.trim(),
          truncated,
          unavailable: false,
        });
      })().catch(() => {
        if (active)
          setPageText({
            generation: currentPdf.generation,
            page,
            text: "",
            truncated: false,
            unavailable: true,
          });
      });
    return () => {
      active = false;
    };
  }, [currentPdf, page]);
  function goToPage(next: number) {
    setPageRender(null);
    setPage(next);
  }
  return (
    <section className={styles.preview} aria-label="PDF preview">
      <div className={styles.previewTools}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={!currentPdf || page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          ‹
        </button>
        <span aria-live="polite">
          {currentPdf ? `${page} / ${pages}` : "0 / 0"}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={!currentPdf || page >= pages}
          onClick={() => goToPage(page + 1)}
        >
          ›
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!currentPdf}
          onClick={() => setZoom(Math.max(0.2, currentScale.current - 0.25))}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!currentPdf}
          onClick={() => setZoom(Math.min(2, currentScale.current + 0.25))}
        >
          +
        </button>
        <button
          type="button"
          disabled={!currentPdf}
          onClick={() => setZoom(null)}
        >
          Fit
        </button>
      </div>
      <div
        ref={stage}
        className={styles.previewStage}
        role="region"
        aria-label="PDF page viewport"
        tabIndex={0}
      >
        {!pdf ? (
          <div className={styles.emptyPreview}>
            <span aria-hidden="true">▤</span>
            <h2>Your PDF appears here</h2>
            <p>Write or paste LaTeX, then recompile.</p>
          </div>
        ) : failedState === "invalid" ? (
          <p role="alert" className={styles.previewFallback}>
            {PDF_VERIFICATION_FAILED}
          </p>
        ) : failedState === "unavailable" ? (
          <p role="alert" className={styles.previewFallback}>
            Preview unavailable. You can still download the PDF and open it in
            your PDF reader.
          </p>
        ) : (
          <>
            {currentRender === "failed" ? (
              <div className={styles.previewFallback}>
                <p role="alert">
                  This page could not render. You can still download the PDF.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    stage.current?.focus();
                    setRetry((attempt) => attempt + 1);
                  }}
                >
                  Retry page preview
                </button>
              </div>
            ) : currentRender !== "ready" ? (
              <p role="status" className={styles.previewFallback}>
                Rendering PDF page {page}.
              </p>
            ) : null}
            <canvas
              key={`${currentPdf?.generation ?? 0}:${page}`}
              ref={canvas}
              hidden={currentRender !== "ready"}
              aria-label={`PDF page ${page} of ${pages}`}
              role="img"
            />
          </>
        )}
      </div>
      {pdf && failedState !== "invalid" && (
        <details
          className={styles.previewText}
          aria-label={`Text for PDF page ${page} of ${pages}`}
        >
          <summary>Read page text</summary>
          {currentText?.unavailable || failedState === "unavailable" ? (
            <p className={styles.previewTextStatus}>
              Text preview unavailable. You can still view or download the PDF.
            </p>
          ) : !currentText ? (
            <p className={styles.previewTextStatus} role="status">
              Preparing page text…
            </p>
          ) : !currentText.text ? (
            <p className={styles.previewTextStatus}>
              No readable text was found on this page.
            </p>
          ) : (
            <>
              <div
                className={styles.previewTextContent}
                role="region"
                aria-label={`Extracted text for PDF page ${page}`}
                tabIndex={0}
              >
                {currentText.text}
              </div>
              {currentText.truncated && (
                <p className={styles.previewTextStatus}>
                  Text preview is limited to 100,000 characters.
                </p>
              )}
            </>
          )}
        </details>
      )}
    </section>
  );
}
