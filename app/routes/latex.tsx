import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useLoaderData, useNavigate, type HeadersFunction } from "react-router";
import SiteNavigation from "~/components/SiteNavigation";
import LatexPdfPreview, {
  PDF_VERIFICATION_FAILED,
  type PdfHighlight,
  type PdfLoadResult,
} from "~/components/LatexPdfPreview";
import BuildAiAssistant, {
  type BuildAiAssistantHandle,
} from "~/components/BuildAiAssistant";
import ClientOnly from "~/components/ClientOnly";
import CompileProblems from "~/components/CompileProblems";
import LatexEditor, {
  type LatexEditorHandle,
  type LineRange,
} from "~/components/LatexEditor";
import BuildOnboarding, {
  BuildTips,
  ShortcutSheet,
  type OnboardingChoice,
} from "~/components/BuildOnboarding";
import {
  isBuildOnboarded,
  loadBuildDraft,
  saveBuildDraft,
  setBuildOnboarded,
} from "~/lib/build-drafts";
import { diagnosticSelection } from "~/lib/build-assist";
import { BUILD_TEMPLATES } from "~/lib/build-templates";
import {
  LatexCompileError,
  readLatexCompileReply,
} from "~/lib/latex-compile-response";
import {
  getLatexExample,
  LATEX_EXAMPLES,
  LATEX_LIMITS,
  LATEX_PACKAGES,
  type LatexDiagnostic,
  type LatexNotice,
  type LatexProfile,
} from "~/lib/latex-converter";
import {
  locateLineInPdf,
  visibleTextOfLine,
  type PdfPageItems,
} from "~/lib/latex-line-locator";
import { setPendingUpload } from "~/lib/pending-upload";
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
  source_unsupported: `This document uses an unsupported class or package. Build supports the article class with ${LATEX_PACKAGES.join(", ")}. Start from a template, or remove the other packages.`,
  source_unsafe:
    "This source requests a prohibited operation. Remove external file access, shell commands and unsupported controls.",
  missing_glyph:
    "Some characters are unavailable in the compiler fonts. Replace unsupported characters and recompile.",
  layout_overflow:
    "Some content runs far past the page edge. Shorten the line shown in Problems or allow it to break.",
  timeout:
    "Compilation exceeded the time limit. Simplify the document, then recompile.",
  output_invalid:
    "The PDF did not pass output checks. Review the source or try a starter example.",
  runtime_unavailable:
    "PDF compilation is unavailable right now. Keep your code and try again later.",
  cleanup_failed:
    "PDF compilation needs service recovery. Keep your code and recompile only after the service is restored.",
  disabled: "PDF compilation is currently disabled.",
  unauthenticated: "Your session has ended. Sign in again to recompile.",
  forbidden:
    "The request could not be accepted. Keep a copy of your code before reloading this page.",
  rate_limited: "Too many compilation requests. Wait a moment, then recompile.",
  busy: "The converter is busy. Wait a moment, then recompile.",
};

export default function LatexConverter() {
  const { enabled, aiEnabled = false } = useLoaderData<{
    enabled: boolean;
    aiEnabled?: boolean;
  }>();
  const [source, setSource] = useState(() => getLatexExample("document", "A4"));
  const [profile, setProfile] = useState<LatexProfile>("document");
  const [paper, setPaper] = useState<"A4" | "LETTER">("A4");
  const [output, setOutput] = useState<{
    pdf: Blob;
    pages: number;
    state: "checking" | PdfLoadResult["state"];
  } | null>(null);
  const [download, setDownload] = useState<{ pdf: Blob; href: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const draftLoaded = useRef(false);
  const [diagnostics, setDiagnostics] = useState<LatexDiagnostic[]>([]);
  const [diagnosticsSource, setDiagnosticsSource] = useState<string | null>(
    null,
  );
  const [notices, setNotices] = useState<LatexNotice[]>([]);
  const [highlight, setHighlight] = useState<PdfHighlight | null>(null);
  const [noText, setNoText] = useState(false);
  const [onboarding, setOnboarding] = useState<"closed" | "dialog" | "tips">(
    "closed",
  );
  const [hasDraft, setHasDraft] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const navigate = useNavigate();
  const textItems = useRef<PdfPageItems[]>([]);
  const lastLines = useRef<{
    range: LineRange;
    kind: "cursor" | "selection";
  } | null>(null);
  const aiAssistant = useRef<BuildAiAssistantHandle>(null);
  const aiAnchor = useRef<HTMLElement>(null);
  const [error, setError] = useState<{
    message: string;
    needsSignIn?: boolean;
  } | null>(null);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [split, setSplit] = useState(50);
  const [collapsed, setCollapsed] = useState(false);
  const [options, setOptions] = useState(false);
  const editor = useRef<LatexEditorHandle>(null);
  const panes = useRef<HTMLDivElement>(null);
  const compileAlert = useRef<HTMLParagraphElement>(null);
  const compileButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnCompileFocus = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const bytes = new TextEncoder().encode(source).byteLength;
  const admitted =
    output?.state === "verified" || output?.state === "unavailable";
  const pdf = admitted ? output.pdf : null;
  const url = download?.pdf === pdf ? download.href : "";
  const onPdfLoadResult = useCallback((result: PdfLoadResult) => {
    setOutput((current) =>
      current?.pdf === result.pdf && current.state === "checking"
        ? { ...current, state: result.state }
        : current,
    );
  }, []);
  // Load after mount so server and client render the same first HTML.
  useEffect(() => {
    const draft = loadBuildDraft(window.localStorage);
    if (draft) {
      setSource(draft.source);
      setSavedAt(draft.savedAt);
      setHasDraft(true);
    }
    if (!isBuildOnboarded(window.localStorage)) setOnboarding("dialog");
    draftLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!draftLoaded.current) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      saveBuildDraft(window.localStorage, source, now);
      setSavedAt(now);
    }, 800);
    return () => clearTimeout(timer);
  }, [source]);
  const outputStatus =
    output?.state === "checking"
      ? "Checking the compiled PDF..."
      : output?.state === "verified"
        ? `PDF ready. ${output.pages} ${output.pages === 1 ? "page" : "pages"}.`
        : output?.state === "unavailable"
          ? "PDF available for download."
          : status;
  useEffect(() => {
    if (!pdf) {
      setDownload(null);
      return;
    }
    const href = URL.createObjectURL(pdf);
    setDownload({ pdf, href });
    return () => URL.revokeObjectURL(href);
  }, [pdf]);
  useEffect(() => {
    if (error?.needsSignIn) compileAlert.current?.focus();
  }, [error]);
  useEffect(() => {
    if (busy || !returnCompileFocus.current) return;
    returnCompileFocus.current = false;
    if (!error?.needsSignIn && document.activeElement === document.body)
      compileButton.current?.focus();
  }, [busy, error]);
  useEffect(
    () => () => {
      generation.current += 1;
      pending.current?.abort();
    },
    [],
  );
  function endCompile() {
    if (document.activeElement === cancelButton.current)
      returnCompileFocus.current = true;
    setBusy(false);
  }
  function invalidate() {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    endCompile();
    setOutput(null);
    setError(null);
    setHighlight(null);
    setNotices([]);
    setStatus("Code changed. Recompile to update the PDF.");
  }
  function changeSource(value: string) {
    if (value.length > LATEX_LIMITS.sourceBytes) {
      setError({
        message:
          "The edit exceeds the source limit and was not applied. Use a smaller document.",
      });
      return;
    }
    invalidate();
    setSource(value);
  }
  function insert(before: string, after = "") {
    editor.current?.insertAround(before, after);
  }
  function example() {
    if (window.confirm("Replace the current code with this example?"))
      changeSource(getLatexExample(profile, paper));
  }
  function onboard(choice: OnboardingChoice) {
    if (choice.kind === "template") {
      const template = BUILD_TEMPLATES.find((t) => t.id === choice.id);
      if (template) changeSource(template.source());
    } else if (choice.kind === "restore") {
      const draft = loadBuildDraft(window.localStorage);
      if (draft) changeSource(draft.source);
    }
    setBuildOnboarded(window.localStorage, true);
    setOnboarding("tips");
    requestAnimationFrame(() => editor.current?.focus());
  }
  function dismissOnboarding() {
    setBuildOnboarded(window.localStorage, true);
    setOnboarding("closed");
    requestAnimationFrame(() => editor.current?.focus());
  }
  function finishTips() {
    setOnboarding("closed");
  }
  // "?" opens the shortcut sheet unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      event.preventDefault();
      setShortcuts(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Selecting lines (or moving the cursor) highlights them in the PDF.
  const locate = useCallback(
    (range: LineRange) => {
      if (!textItems.current.length) return;
      const lines = source.split("\n");
      // A blank line has nothing to find, so say nothing about it.
      if (
        !lines
          .slice(range.startLine - 1, range.endLine)
          .join("")
          .trim()
      ) {
        setNoText(false);
        setHighlight(null);
        return;
      }
      const text = visibleTextOfLine(
        lines.slice(range.startLine - 1, range.endLine).join(" "),
      );
      const hit = locateLineInPdf(
        text,
        range.startLine - 1,
        lines.length,
        textItems.current,
      );
      setNoText(!hit);
      setHighlight(
        hit
          ? {
              page: hit.page,
              rects: hit.rects,
              label:
                range.startLine === range.endLine
                  ? `L${range.startLine}`
                  : `L${range.startLine}–${range.endLine}`,
            }
          : null,
      );
    },
    [source],
  );
  useEffect(() => {
    const last = lastLines.current;
    if (!last || !pdf) return;
    const timer = setTimeout(() => locate(last.range), 150);
    return () => clearTimeout(timer);
  }, [pdf, locate]);
  function onLines(range: LineRange, kind: "cursor" | "selection") {
    lastLines.current = { range, kind };
    if (!pdf) return;
    window.clearTimeout(lineTimer.current);
    lineTimer.current = window.setTimeout(() => locate(range), 150);
  }
  const lineTimer = useRef(0);
  function fixWithAi(diagnostic: LatexDiagnostic) {
    if (!diagnostic.line) return;
    aiAssistant.current?.open(diagnosticSelection(source, diagnostic.line), {
      kind: diagnostic.kind,
      line: diagnostic.line,
    });
  }
  function checkThisResume() {
    if (!pdf) return;
    setPendingUpload(
      new File([pdf], "document.pdf", { type: "application/pdf" }),
    );
    void navigate("/upload");
  }
  const diagnosticsStale =
    diagnosticsSource !== null && diagnosticsSource !== source;
  async function compile() {
    if (
      !enabled ||
      pending.current ||
      bytes > LATEX_LIMITS.sourceBytes ||
      !source.trim()
    )
      return;
    invalidate();
    const current = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setTab("preview");
    setStatus("Compiling your current code...");
    setDiagnostics([]);
    setDiagnosticsSource(null);
    const compiledSource = source;
    const timer = window.setTimeout(() => {
      if (current !== generation.current) return;
      invalidate();
      setStatus("");
      setError({
        message: "Compilation stopped. You can recompile when ready.",
      });
    }, LATEX_LIMITS.timeoutMs + 5_000);
    try {
      const response = await fetch("/build/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, profile }),
        signal: controller.signal,
        cache: "no-store",
      });
      const reply = await readLatexCompileReply(response, controller.signal);
      if (current !== generation.current) return;
      setOutput({ pdf: reply.pdf, pages: reply.pages, state: "checking" });
      setNotices(reply.notices);
      setDiagnostics(reply.diagnostics);
      setDiagnosticsSource(compiledSource);
      setStatus("");
    } catch (cause) {
      if (current !== generation.current) return;
      const code = cause instanceof Error ? cause.message : "";
      const message = Object.hasOwn(compileMessages, code)
        ? compileMessages[code]
        : undefined;
      if (code === "unauthenticated") setTab("preview");
      if (cause instanceof LatexCompileError && cause.diagnostic) {
        setDiagnostics([cause.diagnostic]);
        setDiagnosticsSource(compiledSource);
      }
      setError({
        message:
          message ??
          (cause instanceof LatexCompileError && cause.diagnostic
            ? "The document did not compile. Fix the problem listed below, then recompile."
            : "Compilation failed. Check your code and try again, or load an example."),
        needsSignIn: code === "unauthenticated",
      });
      setStatus("");
    } finally {
      window.clearTimeout(timer);
      if (current === generation.current) {
        endCompile();
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
                <div className={styles.aiAnchor}>
                  <BuildAiAssistant
                    ref={aiAssistant}
                    source={source}
                    editor={editor}
                    anchor={aiAnchor}
                    onOpenChange={setAiOpen}
                    enabled={aiEnabled}
                    onApply={changeSource}
                    onPreview={(range, replacement) => {
                      editor.current?.showInlineDiff(range, replacement);
                      // The suggestion's lines are also marked in the PDF.
                      if (range) onLines(range, "selection");
                    }}
                  />
                </div>
                <span className={styles.sourceCount}>
                  {bytes.toLocaleString()} /{" "}
                  {LATEX_LIMITS.sourceBytes.toLocaleString()} bytes
                </span>
              </div>
              <div className={styles.codeArea}>
                <ClientOnly
                  fallback={
                    <textarea
                      className={styles.codeFallback}
                      aria-label="LaTeX source"
                      aria-describedby="latex-source-help"
                      spellCheck={false}
                      value={source}
                      onChange={(event) => changeSource(event.target.value)}
                    />
                  }
                >
                  <LatexEditor
                    ref={editor}
                    value={source}
                    onChange={changeSource}
                    onCompile={() => void compile()}
                    onCursorLine={(line) =>
                      onLines({ startLine: line, endLine: line }, "cursor")
                    }
                    onSelectionLines={(range) =>
                      range && onLines(range, "selection")
                    }
                    onAskAi={() => aiAssistant.current?.open()}
                    aiEnabled={aiEnabled && !aiOpen}
                    diagnostics={diagnostics}
                    onDiffKey={(action) =>
                      action === "accept"
                        ? aiAssistant.current?.accept()
                        : aiAssistant.current?.reject()
                    }
                    onRejectedEdit={() =>
                      setError({
                        message:
                          "The edit exceeds the source limit and was not applied. Use a smaller document.",
                      })
                    }
                  />
                </ClientOnly>
              </div>
              {bytes > LATEX_LIMITS.sourceBytes && (
                <p role="alert" className={styles.error}>
                  Source exceeds the 48 KiB limit. Shorten it before
                  recompiling.
                </p>
              )}
              <p id="latex-source-help" className={styles.editorNote}>
                Ctrl/⌘ + Enter recompiles, Ctrl/⌘ + K asks AI about the selected
                lines. Saved only in this browser. Generated PDFs are not tagged
                for screen readers.
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
              ref={aiAnchor}
              className={`${styles.pdfPane} ${tab !== "preview" ? styles.mobileHidden : ""}`}
              aria-label="Compilation workspace"
            >
              <div className={styles.compileTools}>
                <button
                  ref={compileButton}
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
                    ref={cancelButton}
                    type="button"
                    onClick={() => {
                      invalidate();
                      setStatus("Compilation cancelled.");
                    }}
                  >
                    Cancel
                  </button>
                )}
                {url && pdf && (
                  <button
                    type="button"
                    className={styles.checkButton}
                    onClick={checkThisResume}
                  >
                    Check this resume
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
                  <button type="button" onClick={() => setShortcuts(true)}>
                    Keyboard shortcuts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBuildOnboarded(window.localStorage, false);
                      setOnboarding("tips");
                    }}
                  >
                    Show tips again
                  </button>
                  <p>
                    Loading an example replaces the editor. Paper choice applies
                    only to the example.
                  </p>
                </div>
              )}
              {error && (
                <p
                  ref={compileAlert}
                  tabIndex={error.needsSignIn ? -1 : undefined}
                  role="alert"
                  className={styles.error}
                >
                  {error.message}
                  {error.needsSignIn && (
                    <>
                      {" "}
                      <a
                        href="/auth?next=%2Fbuild"
                        target="_blank"
                        rel="noopener"
                      >
                        Sign in in a new tab
                      </a>
                    </>
                  )}
                </p>
              )}
              {!error && output?.state === "invalid" && (
                <p role="alert" className={styles.error}>
                  {PDF_VERIFICATION_FAILED}
                </p>
              )}
              {notices.map((notice) => (
                <p key={notice.line} role="status" className={styles.notice}>
                  Line {notice.line} is for pdfLaTeX and was skipped. Build uses
                  XeLaTeX, which already embeds Unicode text.
                </p>
              ))}
              <CompileProblems
                diagnostics={diagnostics}
                stale={diagnosticsStale}
                onJump={(line) => {
                  setTab("code");
                  editor.current?.goToLine(line);
                }}
                onFixWithAi={aiEnabled ? fixWithAi : undefined}
              />
              {noText && pdf && (
                <p className={styles.noTextChip}>
                  No visible text for this line
                </p>
              )}
              <p role="status" className={styles.status}>
                {outputStatus ||
                  "Compile your current code to preview and download a PDF."}
              </p>
              {savedAt && (
                <p className={styles.savedAt}>
                  Saved in this browser ·{" "}
                  {new Date(savedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <LatexPdfPreview
                pdf={output?.state === "invalid" ? null : (output?.pdf ?? null)}
                pages={output?.pages ?? 0}
                onLoadResult={onPdfLoadResult}
                highlight={highlight}
                onTextItems={(items) => {
                  textItems.current = items;
                  if (lastLines.current) locate(lastLines.current.range);
                }}
              />
            </section>
          </div>
          {onboarding === "tips" && <BuildTips onDone={finishTips} />}
        </div>
      </main>
      {shortcuts && <ShortcutSheet onClose={() => setShortcuts(false)} />}
      {onboarding === "dialog" && (
        <BuildOnboarding
          hasDraft={hasDraft}
          onChoose={onboard}
          onDismiss={dismissOnboarding}
        />
      )}
    </>
  );
}
