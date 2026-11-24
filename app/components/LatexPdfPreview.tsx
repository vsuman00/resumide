import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { PdfPageItems, PdfTextItem } from "~/lib/latex-line-locator";
import { safePdfHref } from "~/lib/pdf-links";
import styles from "./LatexConverter.module.css";

const MAX_PAGE_TEXT = 100_000;
const PDF_LOAD_TIMEOUT_MS = 10_000;
export const PDF_VERIFICATION_FAILED =
  "The compiled PDF could not be verified. Your code is still available. Recompile to try again.";
export type PdfLoadResult = {
  pdf: Blob;
  state: "verified" | "unavailable" | "invalid";
};
export type PdfHighlight = {
  page: number;
  rects: PdfTextItem[];
  label: string;
};
type PageText = {
  text: string;
  truncated: boolean;
  unavailable: boolean;
  content: TextContent | null;
  items: PdfTextItem[];
};
type LoadedPdf = {
  pdf: Blob;
  generation: number;
  document: PDFDocumentProxy;
  size: { width: number; height: number };
};
type Props = {
  pdf: Blob | null;
  pages: number;
  onLoadResult?: (result: PdfLoadResult) => void;
  highlight?: PdfHighlight | null;
  onPageVisible?: (page: number) => void;
  onTextItems?: (pages: PdfPageItems[]) => void;
};

function readText(content: TextContent): PageText {
  let text = "";
  let separator = "";
  let truncated = false;
  const items: PdfTextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const transform = (item as { transform?: number[] }).transform;
    if (transform)
      items.push({
        str: item.str,
        x: transform[4],
        y: transform[5],
        width: item.width,
        height: item.height || Math.abs(transform[3]),
      });
    const chunk = separator + item.str;
    const remaining = MAX_PAGE_TEXT - text.length;
    text += chunk.slice(0, remaining);
    if (chunk.length > remaining) {
      truncated = true;
      break;
    }
    separator = item.hasEOL ? "\n" : " ";
  }
  if (truncated && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return { text: text.trim(), truncated, unavailable: false, content, items };
}

function PdfPage({
  doc,
  number,
  total,
  scale,
  size,
  text,
  highlight,
  visible,
  pageRef,
  onRetry,
}: {
  doc: PDFDocumentProxy;
  number: number;
  total: number;
  scale: number;
  size: { width: number; height: number };
  text: PageText | undefined;
  highlight: PdfHighlight | null;
  visible: boolean;
  pageRef: (element: HTMLDivElement | null) => void;
  onRetry: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{
    key: string;
    value: "ready" | "failed";
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [links, setLinks] = useState<{ href: string; rect: number[] }[]>([]);
  const key = `${scale}:${retry}`;
  const current = state?.key === key ? state.value : null;

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let active = true;
    let rendering: RenderTask | undefined;
    const element = canvas.current;
    void (async () => {
      const sheet: PDFPageProxy = await doc.getPage(number);
      if (!active) return;
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
      if (!active) return;
      setState({ key, value: "ready" });
      if (typeof sheet.getAnnotations === "function") {
        const annotations = await sheet.getAnnotations({ intent: "display" });
        if (!active) return;
        setLinks(
          annotations.flatMap(
            (a: {
              subtype?: string;
              url?: string;
              unsafeUrl?: string;
              rect?: number[];
            }) => {
              const href =
                a.subtype === "Link"
                  ? safePdfHref(a.url ?? a.unsafeUrl ?? "")
                  : null;
              return href && a.rect ? [{ href, rect: a.rect }] : [];
            },
          ),
        );
      }
    })().catch((error: unknown) => {
      if (
        active &&
        !(
          error instanceof Error && error.name === "RenderingCancelledException"
        )
      )
        setState({ key, value: "failed" });
    });
    return () => {
      active = false;
      rendering?.cancel();
    };
  }, [doc, number, scale, key, visible]);

  useEffect(() => {
    const container = textLayer.current;
    if (!container || current !== "ready" || !text?.content) return;
    let active = true;
    let layer: { cancel(): void } | undefined;
    void (async () => {
      const lib = await import("pdfjs-dist");
      if (!active || typeof lib.TextLayer !== "function") return;
      const sheet = await doc.getPage(number);
      if (!active) return;
      container.replaceChildren();
      const instance = new lib.TextLayer({
        textContentSource: text.content!,
        container,
        viewport: sheet.getViewport({ scale }),
      });
      layer = instance;
      await instance.render();
    })().catch(() => undefined);
    return () => {
      active = false;
      layer?.cancel();
    };
  }, [doc, number, scale, current, text]);

  const mine = highlight?.page === number ? highlight : null;
  useEffect(() => {
    const element = mark.current;
    if (!element) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // "nearest" leaves an already visible highlight alone, inside the preview's own scroll area.
    element.scrollIntoView?.({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [mine]);

  const width = size.width * scale;
  const height = size.height * scale;
  const toBox = (r: PdfTextItem) => ({
    left: r.x * scale - 2,
    top: (size.height - r.y - r.height) * scale - 2,
    width: r.width * scale + 4,
    height: r.height * scale * 1.25 + 4,
  });
  const top = mine ? Math.min(...mine.rects.map((r) => toBox(r).top)) : 0;
  return (
    <div
      ref={pageRef}
      data-page={number}
      className={styles.pdfPage}
      style={
        {
          width,
          height,
          "--scale-factor": scale,
          "--total-scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      {current === "failed" ? (
        <div className={styles.previewFallback}>
          <p role="alert">
            This page could not render. You can still download the PDF.
          </p>
          <button
            type="button"
            onClick={() => {
              onRetry();
              setRetry((n) => n + 1);
            }}
          >
            Retry page preview
          </button>
        </div>
      ) : current !== "ready" ? (
        <p role="status" className={styles.previewFallback}>
          Rendering PDF page {number}.
        </p>
      ) : null}
      <canvas
        ref={canvas}
        hidden={current !== "ready"}
        aria-label={`PDF page ${number} of ${total}`}
        role="img"
      />
      {current === "ready" && (
        <>
          <div
            ref={textLayer}
            className={`textLayer ${styles.textLayer}`}
            aria-hidden="true"
          />
          <div className={styles.linkLayer}>
            {links.map((link, index) => {
              const [x1, y1, x2, y2] = link.rect;
              return (
                <a
                  key={index}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Link: ${link.href}`}
                  style={{
                    left: Math.min(x1, x2) * scale,
                    top: (size.height - Math.max(y1, y2)) * scale,
                    width: Math.abs(x2 - x1) * scale,
                    height: Math.abs(y2 - y1) * scale,
                  }}
                />
              );
            })}
          </div>
          {mine && (
            <div className={styles.lineHighlight} aria-hidden="true">
              {mine.rects.map((r, i) => (
                <span
                  key={i}
                  ref={i === 0 ? mark : undefined}
                  style={toBox(r)}
                />
              ))}
              <b style={{ top }}>{mine.label}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LatexPdfPreview({
  pdf,
  pages,
  onLoadResult,
  highlight = null,
  onPageVisible,
  onTextItems,
}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const pageElements = useRef(new Map<number, HTMLDivElement>());
  const nextGeneration = useRef(0);
  const currentScale = useRef(1);
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(600);
  const [failure, setFailure] = useState<PdfLoadResult | null>(null);
  const [texts, setTexts] = useState<{
    generation: number;
    pages: Map<number, PageText>;
  } | null>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set([1]));
  const currentPdf = loadedPdf?.pdf === pdf ? loadedPdf : null;
  const failedState = failure?.pdf === pdf ? failure.state : null;
  const pageTexts =
    texts && texts.generation === currentPdf?.generation ? texts.pages : null;
  const currentText = pageTexts?.get(page) ?? null;
  const scale = currentPdf
    ? (zoom ??
      Math.max(0.2, Math.min(1.5, (width - 48) / currentPdf.size.width)))
    : 1;
  currentScale.current = scale;
  const callbacks = useRef({ onPageVisible, onTextItems });
  callbacks.current = { onPageVisible, onTextItems };

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
    setFailure(null);
    setTexts(null);
    setVisible(new Set([1]));
    if (pdf)
      void (async () => {
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (!active) return;
        const data = new Uint8Array(await pdf.arrayBuffer());
        if (!active) return;
        const task = lib.getDocument({ data, isEvalSupported: false });
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
        const first = await doc.getPage(1);
        if (!active) return;
        const base = first.getViewport({ scale: 1 });
        setLoadedPdf({
          pdf,
          generation,
          document: doc,
          size: { width: base.width, height: base.height },
        });
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

  // Extract every page's text once per document; each page settles independently.
  useEffect(() => {
    if (!currentPdf) return;
    let active = true;
    const { generation, document: doc } = currentPdf;
    const results = new Map<number, PageText>();
    setTexts({ generation, pages: new Map() });
    const all = Array.from({ length: pages }, (_, i) => i + 1).map(
      async (n) => {
        let value: PageText;
        try {
          const sheet = await doc.getPage(n);
          if (!active) return;
          value = readText(await sheet.getTextContent());
        } catch {
          value = {
            text: "",
            truncated: false,
            unavailable: true,
            content: null,
            items: [],
          };
        }
        if (!active) return;
        results.set(n, value);
        setTexts({ generation, pages: new Map(results) });
      },
    );
    void Promise.all(all).then(() => {
      if (!active) return;
      callbacks.current.onTextItems?.(
        Array.from({ length: pages }, (_, i) => ({
          page: i + 1,
          items: results.get(i + 1)?.items ?? [],
        })),
      );
    });
    return () => {
      active = false;
    };
  }, [currentPdf, pages]);

  // Track visible pages for lazy rendering and the page indicator.
  useEffect(() => {
    if (!currentPdf || typeof IntersectionObserver === "undefined") {
      if (currentPdf)
        setVisible(new Set(Array.from({ length: pages }, (_, i) => i + 1)));
      return;
    }
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          ratios.set(
            Number((entry.target as HTMLElement).dataset.page),
            entry.intersectionRatio,
          );
        setVisible((old) => {
          const next = new Set(old);
          for (const [n, r] of ratios) if (r > 0) next.add(n);
          return next;
        });
        const [top] = [...ratios.entries()].sort((a, b) => b[1] - a[1]);
        if (top && top[1] > 0) {
          setPage(top[0]);
          callbacks.current.onPageVisible?.(top[0]);
        }
      },
      {
        root: stage.current,
        rootMargin: "200px 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const element of pageElements.current.values())
      observer.observe(element);
    return () => observer.disconnect();
  }, [currentPdf, pages]);

  function goToPage(next: number) {
    setPage(next);
    setVisible((old) => new Set(old).add(next));
    pageElements.current.get(next)?.scrollIntoView?.({ block: "start" });
    onPageVisible?.(next);
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
        ) : !currentPdf ? (
          <p role="status" className={styles.previewFallback}>
            Rendering PDF page 1.
          </p>
        ) : (
          <div className={styles.pdfPages} key={currentPdf.generation}>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                doc={currentPdf.document}
                number={n}
                total={pages}
                scale={scale}
                size={currentPdf.size}
                text={pageTexts?.get(n)}
                highlight={highlight}
                visible={visible.has(n)}
                onRetry={() => stage.current?.focus()}
                pageRef={(element) => {
                  if (element) pageElements.current.set(n, element);
                  else pageElements.current.delete(n);
                }}
              />
            ))}
          </div>
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
