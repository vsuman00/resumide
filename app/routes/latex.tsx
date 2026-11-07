import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useLoaderData, type HeadersFunction } from "react-router";
import SiteNavigation from "~/components/SiteNavigation";
import LatexPdfPreview from "~/components/LatexPdfPreview";
import BuildAiAssistant from "~/components/BuildAiAssistant";
import {
  getLatexExample,
  LATEX_EXAMPLES,
  LATEX_LIMITS,
  type LatexProfile,
} from "~/lib/latex-converter";
import { latexLoader } from "~/lib/server/latex-converter-service";
import styles from "~/components/LatexConverter.module.css";

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5" />
    </svg>
  );
}

export const loader = ({ request }: { request: Request }) =>
  latexLoader(request);
export const headers: HeadersFunction = ({
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const result = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    for (const cookie of source?.getSetCookie() ?? [])
      result.append("Set-Cookie", cookie);
  return result;
};
export const meta = () => [
  { title: "Build | Resumide" },
  {
    name: "description",
    content: "Edit LaTeX, preview your PDF and download it.",
  },
];

const compileMessages: Record<string, string> = {
  source_invalid:
    "Provide a complete LaTeX document, including its document environment.",
  source_too_large:
    "Source exceeds the 48 KiB limit. Shorten it before recompiling.",
  source_unsupported:
    "This document uses an unsupported class or package. Try a starter example, or use geometry, titlesec, enumitem, hyperref, xcolor, amsmath, amssymb and latexsym.",
  source_unsafe:
    "This source requests a prohibited operation. Remove external file access, shell commands and unsupported controls.",
  missing_glyph:
    "Some characters are unavailable in the compiler fonts. Replace unsupported characters and recompile.",
  layout_overflow:
    "Content exceeds the supported page layout. Shorten long lines or adjust the document layout.",
  timeout:
    "Compilation exceeded the time limit. Simplify the document, then recompile.",
  output_invalid:
    "The PDF did not pass output checks. Review the source or try a starter example.",
  runtime_unavailable: "The isolated compiler is unavailable. Try again later.",
  cleanup_failed: "The isolated compiler is unavailable. Try again later.",
  disabled: "PDF compilation is currently disabled.",
  unauthenticated: "Your session has ended. Sign in again before recompiling.",
  forbidden:
    "The request could not be accepted. Keep a copy of your code before reloading this page.",
  rate_limited: "Too many compilation requests. Wait a moment, then recompile.",
  busy: "The converter is busy. Wait a moment, then recompile.",
};

function Highlight({ source }: { source: string }) {
  if (source.length > 24_000) return <>{source}</>;
  return (
    <>
      {source.split(/(%[^\n]*|\\[a-zA-Z]+\*?|[{}$])/g).map((part, index) => (
        <span
          key={index}
          className={
            part.startsWith("%")
              ? styles.comment
              : part.startsWith("\\")
                ? styles.command
                : /^[{}$]$/.test(part)
                  ? styles.punctuation
                  : undefined
          }
        >
          {part}
        </span>
      ))}
    </>
  );
}

export default function LatexConverter() {
  const { enabled, aiEnabled = false } = useLoaderData<{
    enabled: boolean;
    aiEnabled?: boolean;
  }>();
  const [source, setSource] = useState(() => getLatexExample("document", "A4"));
  const [profile, setProfile] = useState<LatexProfile>("document");
  const [paper, setPaper] = useState<"A4" | "LETTER">("A4");
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [split, setSplit] = useState(50);
  const [collapsed, setCollapsed] = useState(false);
  const [options, setOptions] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const numbers = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const bytes = new TextEncoder().encode(source).byteLength;
  useEffect(() => {
    if (!pdf) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(pdf);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [pdf]);
  useEffect(
    () => () => {
      generation.current += 1;
      pending.current?.abort();
    },
    [],
  );
  function invalidate() {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setPdf(null);
    setPages(0);
    setError("");
    setStatus("Code changed. Recompile to update the PDF.");
  }
  function changeSource(value: string) {
    if (value.length > LATEX_LIMITS.sourceBytes) {
      setError(
        "The edit exceeds the source limit and was not applied. Use a smaller document.",
      );
      return;
    }
    invalidate();
    setSource(value);
  }
  function insert(before: string, after = "") {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    changeSource(
      source.slice(0, start) +
        before +
        source.slice(start, end) +
        after +
        source.slice(end),
    );
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, end + before.length);
    });
  }
  function example() {
    if (window.confirm("Replace the current code with this example?"))
      changeSource(getLatexExample(profile, paper));
  }
  async function compile() {
    if (!enabled || busy || bytes > LATEX_LIMITS.sourceBytes || !source.trim())
      return;
    invalidate();
    const current = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setStatus("Compiling your current code...");
    const timer = window.setTimeout(
      () => controller.abort(),
      LATEX_LIMITS.timeoutMs + 5_000,
    );
    try {
      const response = await fetch("/build/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, profile }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw Error(
          typeof body === "object" && body !== null && "code" in body
            ? String(body.code)
            : "compile_failed",
        );
      }
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf"))
        throw Error("compile_failed");
      const result = await response.blob();
      const count = Number(response.headers.get("X-Latex-Pages"));
      if (
        result.size > LATEX_LIMITS.pdfBytes ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > LATEX_LIMITS.pages
      )
        throw Error("compile_failed");
      if (current !== generation.current) return;
      setPdf(result);
      setPages(count);
      setStatus(`PDF ready. ${count} ${count === 1 ? "page" : "pages"}.`);
      setTab("preview");
    } catch (cause) {
      if (current !== generation.current) return;
      const code = cause instanceof Error ? cause.message : "";
      setError(
        controller.signal.aborted
          ? "Compilation stopped. You can recompile when ready."
          : (compileMessages[code] ??
              "Compilation failed. Check your code and try again, or load an example."),
      );
      setStatus("");
    } finally {
      window.clearTimeout(timer);
      if (current === generation.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  }
  function drag(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  return (
    <>
      <SiteNavigation />
      <main className={styles.app}>
        <div className={styles.workspace}>
          <header className={styles.header}>
            <div>
              <p>LaTeX editor</p>
              <h1>Build</h1>
            </div>
            <p className={styles.purpose}>
              Write code, compile it and download your PDF.
            </p>
          </header>
          {!enabled && (
            <p className={styles.notice} role="status">
              PDF compilation is turned off for this workspace. You can still
              edit your code.
            </p>
          )}
          <div className={styles.mobileTabs} aria-label="Editor view">
            <button
              type="button"
              aria-pressed={tab === "code"}
              onClick={() => setTab("code")}
            >
              Code
            </button>
            <button
              type="button"
              aria-pressed={tab === "preview"}
              onClick={() => setTab("preview")}
            >
              PDF preview
            </button>
          </div>
          <div
            ref={panes}
            className={`${styles.panes} ${collapsed ? styles.collapsed : ""}`}
            style={{ "--editor-width": `${split}%` } as React.CSSProperties}
          >
            <section
              className={`${styles.editorPane} ${tab !== "code" ? styles.mobileHidden : ""}`}
              aria-label="LaTeX editor"
            >
              <div className={styles.fileBar}>
                <button
                  type="button"
                  className={styles.fileTab}
                  onClick={() => editor.current?.focus()}
                >
                  main.tex
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Clear the current code?"))
                      changeSource("");
                  }}
                >
                  New document
                </button>
              </div>
              <div className={styles.editorTools} aria-label="Editor toolbar">
                <button
                  type="button"
                  aria-label="Bold selected text"
                  onClick={() => insert("\\textbf{", "}")}
                >
                  B
                </button>
                <button
                  type="button"
                  aria-label="Italic selected text"
                  onClick={() => insert("\\textit{", "}")}
                >
                  I
                </button>
                <button type="button" onClick={() => insert("\\section{", "}")}>
                  Heading
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insert("\\begin{itemize}\n\\item ", "\n\\end{itemize}")
                  }
                >
                  List
                </button>
                <BuildAiAssistant
                  source={source}
                  editorRef={editor}
                  enabled={aiEnabled}
                  onApply={changeSource}
                />
                <span className={styles.sourceCount}>
                  {bytes.toLocaleString()} /{" "}
                  {LATEX_LIMITS.sourceBytes.toLocaleString()} bytes
                </span>
              </div>
              <div className={styles.codeArea}>
                <div
                  ref={numbers}
                  className={styles.lineNumbers}
                  aria-hidden="true"
                >
                  {source
                    .split("\n")
                    .map((_, i) => i + 1)
                    .join("\n")}
                </div>
                <div className={styles.codeLayers}>
                  <pre
                    ref={highlight}
                    className={styles.highlight}
                    aria-hidden="true"
                  >
                    <Highlight source={source + "\n"} />
                  </pre>
                  <textarea
                    ref={editor}
                    aria-label="LaTeX source"
                    aria-describedby="latex-source-help"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={source}
                    onChange={(event) => changeSource(event.target.value)}
                    onScroll={(event) => {
                      if (highlight.current) {
                        highlight.current.scrollTop =
                          event.currentTarget.scrollTop;
                        highlight.current.scrollLeft =
                          event.currentTarget.scrollLeft;
                      }
                      if (numbers.current)
                        numbers.current.scrollTop =
                          event.currentTarget.scrollTop;
                    }}
                    onKeyDown={(event) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        void compile();
                      }
                    }}
                  />
                </div>
              </div>
              {bytes > LATEX_LIMITS.sourceBytes && (
                <p role="alert" className={styles.error}>
                  Source exceeds the 48 KiB limit. Shorten it before
                  recompiling.
                </p>
              )}
              <p id="latex-source-help" className={styles.editorNote}>
                Download your PDF, then choose New analysis to review it. Ctrl/⌘
                + Enter recompiles. This page does not save your code or PDF.
                Generated PDFs are not tagged for screen readers.
              </p>
            </section>
            <div className={styles.splitterWrap}>
              <div
                className={styles.splitter}
                role="separator"
                aria-label="Resize editor and PDF preview"
                aria-orientation="vertical"
                aria-valuemin={25}
                aria-valuemax={75}
                aria-valuenow={split}
                tabIndex={0}
                onPointerDown={drag}
                onPointerMove={(event) => {
                  if (
                    !event.currentTarget.hasPointerCapture(event.pointerId) ||
                    !panes.current
                  )
                    return;
                  const rect = panes.current.getBoundingClientRect();
                  setCollapsed(false);
                  setSplit(
                    Math.max(
                      25,
                      Math.min(
                        75,
                        ((event.clientX - rect.left) / rect.width) * 100,
                      ),
                    ),
                  );
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    setCollapsed(false);
                    setSplit(
                      Math.max(
                        25,
                        Math.min(
                          75,
                          split + (event.key === "ArrowLeft" ? -5 : 5),
                        ),
                      ),
                    );
                  }
                }}
              />
              <button
                className={styles.collapseEditor}
                type="button"
                aria-label={collapsed ? "Expand editor" : "Collapse editor"}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? "›" : "‹"}
              </button>
            </div>
            <section
              className={`${styles.pdfPane} ${tab !== "preview" ? styles.mobileHidden : ""}`}
              aria-label="Compilation workspace"
            >
              <div className={styles.compileTools}>
                <button
                  type="button"
                  className={styles.compileButton}
                  disabled={
                    !enabled ||
                    busy ||
                    bytes > LATEX_LIMITS.sourceBytes ||
                    !source.trim()
                  }
                  onClick={() => void compile()}
                >
                  {busy ? "Compiling..." : "Recompile"}
                </button>
                <button
                  type="button"
                  className={styles.optionsButton}
                  aria-label="Example options"
                  aria-expanded={options}
                  aria-controls="latex-example-options"
                  title="Example options"
                  onClick={() => setOptions(!options)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {busy && (
                  <button
                    type="button"
                    onClick={() => {
                      invalidate();
                      setStatus("Compilation cancelled.");
                    }}
                  >
                    Cancel
                  </button>
                )}
                {url && pdf ? (
                  <a
                    className={styles.downloadButton}
                    href={url}
                    download="document.pdf"
                  >
                    Download PDF
                    <DownloadIcon />
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.downloadButton}
                    disabled
                  >
                    Download PDF
                    <DownloadIcon />
                  </button>
                )}
              </div>
              {options && (
                <div id="latex-example-options" className={styles.options}>
                  <label>
                    Example
                    <select
                      value={profile}
                      onChange={(event) => {
                        invalidate();
                        setProfile(event.target.value as LatexProfile);
                      }}
                    >
                      {LATEX_EXAMPLES.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Example paper
                    <select
                      value={paper}
                      onChange={(event) =>
                        setPaper(event.target.value as "A4" | "LETTER")
                      }
                    >
                      <option value="A4">A4</option>
                      <option value="LETTER">US Letter</option>
                    </select>
                  </label>
                  <button type="button" onClick={example}>
                    Load example
                  </button>
                  <p>
                    Loading an example replaces the editor. Paper choice applies
                    only to the example.
                  </p>
                </div>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <p role="status" className={styles.status}>
                {status ||
                  "Compile your current code to preview and download a PDF."}
              </p>
              <LatexPdfPreview pdf={pdf} pages={pages} />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
