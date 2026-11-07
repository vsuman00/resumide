import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import styles from "./LatexConverter.module.css";

const MAX_PAGE_TEXT = 100_000;
type PageText = {
  pdf: Blob;
  page: number;
  text: string;
  truncated: boolean;
  unavailable: boolean;
};

export default function LatexPdfPreview({
  pdf,
  pages,
}: {
  pdf: Blob | null;
  pages: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const document = useRef<PDFDocumentProxy | null>(null);
  const render = useRef<RenderTask | null>(null);
  const currentScale = useRef(1);
  const [ready, setReady] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(600);
  const [failed, setFailed] = useState(false);
  const [pageText, setPageText] = useState<PageText | null>(null);
  const currentText =
    pageText?.pdf === pdf && pageText?.page === page ? pageText : null;
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
    setPage(1);
    setZoom(null);
    setReady(0);
    setFailed(false);
    document.current = null;
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
        document.current = doc;
        setReady(1);
      })().catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      render.current?.cancel();
      if (loading) void loading.destroy().catch(() => undefined);
      document.current = null;
    };
  }, [pdf]);
  useEffect(() => {
    let active = true;
    const doc = document.current;
    if (!ready || !doc || !canvas.current) return;
    void (async () => {
      const sheet = await doc.getPage(page);
      if (!active || !canvas.current) return;
      const base = sheet.getViewport({ scale: 1 });
      const scale =
        zoom ?? Math.max(0.2, Math.min(1.5, (width - 48) / base.width));
      currentScale.current = scale;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = sheet.getViewport({ scale: scale * ratio });
      const element = canvas.current;
      element.width = viewport.width;
      element.height = viewport.height;
      element.style.width = `${viewport.width / ratio}px`;
      element.style.height = `${viewport.height / ratio}px`;
      const context = element.getContext("2d");
      if (!context) throw Error("Canvas unavailable");
      const task = sheet.render({
        canvas: element,
        canvasContext: context,
        viewport,
      });
      render.current = task;
      await task.promise;
    })().catch((error: unknown) => {
      if (
        active &&
        !(
          error instanceof Error && error.name === "RenderingCancelledException"
        )
      )
        setFailed(true);
    });
    return () => {
      active = false;
      render.current?.cancel();
    };
  }, [ready, page, zoom, width]);
  useEffect(() => {
    let active = true;
    const doc = document.current;
    setPageText(null);
    if (pdf && ready && doc)
      void (async () => {
        const sheet = await doc.getPage(page);
        if (!active || document.current !== doc) return;
        const content = await sheet.getTextContent();
        if (!active || document.current !== doc) return;
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
          pdf,
          page,
          text: text.trim(),
          truncated,
          unavailable: false,
        });
      })().catch(() => {
        if (active && document.current === doc)
          setPageText({
            pdf,
            page,
            text: "",
            truncated: false,
            unavailable: true,
          });
      });
    return () => {
      active = false;
    };
  }, [pdf, ready, page]);
  return (
    <section className={styles.preview} aria-label="PDF preview">
      <div className={styles.previewTools}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={!pdf || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ‹
        </button>
        <span aria-live="polite">{pdf ? `${page} / ${pages}` : "0 / 0"}</span>
        <button
          type="button"
          aria-label="Next page"
          disabled={!pdf || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          ›
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!pdf}
          onClick={() => setZoom(Math.max(0.2, currentScale.current - 0.25))}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!pdf}
          onClick={() => setZoom(Math.min(2, currentScale.current + 0.25))}
        >
          +
        </button>
        <button type="button" disabled={!pdf} onClick={() => setZoom(null)}>
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
        ) : failed ? (
          <p role="alert" className={styles.previewFallback}>
            Preview unavailable. You can still download the PDF and open it in
            your PDF reader.
          </p>
        ) : (
          <canvas
            ref={canvas}
            aria-label={`PDF page ${page} of ${pages}`}
            role="img"
          />
        )}
      </div>
      {pdf && (
        <details
          className={styles.previewText}
          aria-label={`Text for PDF page ${page} of ${pages}`}
        >
          <summary>Read page text</summary>
          {currentText?.unavailable || (!currentText && failed) ? (
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
