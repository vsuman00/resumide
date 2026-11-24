import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  BUILD_AI_LIMITS,
  BUILD_AI_POLICY_VERSION,
  applyBuildSuggestion,
  getBuildSelection,
  hashBuildSource,
  undoBuildSuggestion,
  type BuildAssistDiagnostic,
  type BuildAssistMode,
  type BuildAssistRequest,
  type BuildAssistResponse,
  type BuildSelection,
  type BuildUndo,
} from "~/lib/build-assist";
import { LATEX_DIAGNOSTIC_TEXT } from "~/lib/latex-diagnostics";
import type { LatexEditorHandle, LineRange } from "./LatexEditor";
import styles from "./BuildAiAssistant.module.css";

type Range = { startLine: number; endLine: number; selection: BuildSelection };
export type BuildAiAssistantHandle = {
  /** Open for a line range (the current selection when omitted). */
  open(range?: LineRange | null, diagnostic?: BuildAssistDiagnostic): void;
  accept(): void;
  reject(): void;
};
type Props = {
  source: string;
  enabled: boolean;
  editor: RefObject<LatexEditorHandle | null>;
  anchor?: RefObject<HTMLElement | null>;
  onApply: (source: string) => void;
  /** Draw (or clear with nulls) the pending replacement in the editor and PDF. */
  onPreview?: (range: LineRange | null, replacement: string | null) => void;
  /** Lets the editor hide its floating chip while the panel is open. */
  onOpenChange?: (open: boolean) => void;
};
const MODES: { id: BuildAssistMode; label: string }[] = [
  { id: "fix", label: "Fix code" },
  { id: "rewrite", label: "Rewrite" },
  { id: "resume", label: "Improve resume wording" },
];
const errors: Record<string, string> = {
  disabled: "AI suggestions are currently disabled.",
  unauthenticated:
    "Your session has ended. Sign in again before asking for a suggestion.",
  forbidden:
    "This request could not be accepted. Keep a copy of your code before reloading.",
  rate_limited: "Too many requests. Wait a moment before asking again.",
  budget_exceeded:
    "The AI service has no capacity for another suggestion. No change was applied.",
  budget_exhausted:
    "The AI service has no capacity for another suggestion. No change was applied.",
  busy: "AI suggestions are busy. Try again shortly.",
  timeout: "The request timed out. No suggestion was applied.",
  selection_invalid:
    "Select up to 20 nonempty lines and 4,000 characters. Nearby context must also fit the request limit.",
  stale_source:
    "Your source or selection changed. Ask again for the current selection.",
  code_changed: "Code changed. Ask again.",
  invalid_suggestion:
    "The suggestion did not pass checks. No change was applied.",
  cancelled: "The AI request was cancelled. No suggestion was applied.",
  output_invalid:
    "The AI response could not be used safely. No change was applied.",
  request_conflict:
    "This suggestion request cannot be reused. Review the current selection before asking again.",
  invalid_request:
    "This suggestion request could not be accepted. Review the source and selected lines.",
  consent_required:
    "Review and accept the AI processing notice before asking for a suggestion.",
  provider_auth:
    "AI suggestions are unavailable for this deployment. You can keep editing your code.",
  provider_transient:
    "The AI service had a temporary problem. Try again later.",
  provider_refused:
    "The AI provider declined this request. Review the selection before asking again.",
  provider_unavailable:
    "AI suggestions are unavailable. No change was applied.",
  source_too_large:
    "Source exceeds the 48 KiB limit. Shorten it before asking for a suggestion.",
  stopped: "The request stopped. No suggestion was applied.",
  fact_confirmation_required:
    "Confirm the draft keeps your facts before accepting it.",
};
const errorMessages = new Map(Object.entries(errors));

function checkedResult(
  raw: unknown,
  request: BuildAssistRequest,
  originalText: string,
): BuildAssistResponse {
  if (!raw || typeof raw !== "object") throw Error("invalid_suggestion");
  const value = raw as BuildAssistResponse;
  const suggestion = value.suggestion;
  if (
    value.sourceHash !== request.sourceHash ||
    value.startLine !== request.startLine ||
    value.endLine !== request.endLine ||
    value.mode !== request.mode ||
    value.originalText !== originalText ||
    typeof value.requiresFactConfirmation !== "boolean" ||
    !suggestion ||
    !["replace", "advice", "no_change"].includes(suggestion.operation) ||
    typeof suggestion.explanation !== "string" ||
    suggestion.explanation.length > BUILD_AI_LIMITS.explanationChars ||
    !Array.isArray(suggestion.questions) ||
    suggestion.questions.length > BUILD_AI_LIMITS.questions ||
    suggestion.questions.some(
      (item) =>
        typeof item !== "string" || item.length > BUILD_AI_LIMITS.questionChars,
    ) ||
    (suggestion.operation === "replace"
      ? typeof suggestion.replacement !== "string" ||
        suggestion.replacement.length > BUILD_AI_LIMITS.replacementChars
      : suggestion.replacement !== null)
  )
    throw Error("invalid_suggestion");
  return value;
}
const needsFacts = (result: BuildAssistResponse) =>
  result.requiresFactConfirmation || result.mode === "resume";

const BuildAiAssistant = forwardRef<BuildAiAssistantHandle, Props>(
  function BuildAiAssistant(
    { source, enabled, editor, anchor, onApply, onPreview, onOpenChange },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [range, setRange] = useState<Range | null>(null);
    const [diagnostic, setDiagnostic] = useState<BuildAssistDiagnostic | null>(
      null,
    );
    const [mode, setMode] = useState<BuildAssistMode>("fix");
    const [consent, setConsent] = useState(false);
    const [factConfirmed, setFactConfirmed] = useState(false);
    const [phase, setPhase] = useState<"idle" | "reading" | "checking">("idle");
    const busy = phase !== "idle";
    const [result, setResult] = useState<BuildAssistResponse | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [undo, setUndo] = useState<BuildUndo | null>(null);
    const [position, setPosition] = useState({ left: 12, top: 80 });
    const popup = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const firstAction = useRef<HTMLButtonElement>(null);
    const acceptButton = useRef<HTMLButtonElement>(null);
    const pending = useRef<{
      controller: AbortController;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const sequence = useRef(0);
    const latest = useRef({
      source,
      open,
      range,
      enabled,
      factConfirmed,
      result,
    });
    latest.current = { source, open, range, enabled, factConfirmed, result };
    const previousSource = useRef(source);
    const applying = useRef<string | null>(null);
    const preview = useRef(onPreview);
    preview.current = onPreview;
    const openChange = useRef(onOpenChange);
    openChange.current = onOpenChange;
    useEffect(() => openChange.current?.(open), [open]);

    const stopRequest = useCallback((resetBusy = true) => {
      sequence.current += 1;
      const request = pending.current;
      pending.current = null;
      if (request) {
        clearTimeout(request.timer);
        request.controller.abort();
      }
      if (resetBusy) setPhase("idle");
    }, []);
    const clearResult = useCallback(() => {
      setResult(null);
      preview.current?.(null, null);
    }, []);
    function close(restoreFocus = false) {
      stopRequest();
      latest.current = { ...latest.current, open: false, range: null };
      setOpen(false);
      clearResult();
      setConsent(false);
      setFactConfirmed(false);
      setDiagnostic(null);
      setError("");
      if (restoreFocus) editor.current?.focus();
    }
    const closeRef = useRef(close);
    closeRef.current = close;
    function bind(
      startLine: number,
      endLine: number,
      text = latest.current.source,
    ) {
      try {
        setRange({
          startLine,
          endLine,
          selection: getBuildSelection(text, startLine, endLine),
        });
        return true;
      } catch {
        setRange(null);
        return false;
      }
    }
    function show(target?: LineRange | null, issue?: BuildAssistDiagnostic) {
      if (!latest.current.enabled) return;
      const lines = target ?? editor.current?.getSelectionLines();
      if (!lines) return;
      stopRequest();
      clearResult();
      setConsent(false);
      setFactConfirmed(false);
      setError("");
      setDiagnostic(issue ?? null);
      if (issue) setMode("fix");
      if (!bind(lines.startLine, lines.endLine)) setError("selection_invalid");
      // Float over the PDF pane so the inline diff in the editor stays visible. When that
      // pane is hidden (mobile code view) fall back to the top of the screen.
      const box = anchor?.current?.getBoundingClientRect();
      const width = Math.min(440, window.innerWidth - 24);
      const placed = box && box.width > 0;
      setPosition({
        left: placed
          ? Math.max(
              12,
              Math.min(box.right - width - 12, window.innerWidth - width - 12),
            )
          : Math.max(12, (window.innerWidth - width) / 2),
        top: placed ? Math.max(12, box.top + 56) : 80,
      });
      setOpen(true);
    }
    useImperativeHandle(ref, () => ({
      open: (target, issue) => show(target, issue),
      accept: () => void apply(),
      reject: () => closeRef.current(true),
    }));

    // An edit invalidates any request or suggestion bound to the old source.
    useEffect(() => {
      if (source === previousSource.current) return;
      previousSource.current = source;
      if (applying.current === source) {
        applying.current = null;
        return;
      }
      const current = latest.current;
      if (!current.open) return;
      const hadWork = Boolean(pending.current) || Boolean(current.result);
      stopRequest();
      clearResult();
      setConsent(false);
      setFactConfirmed(false);
      if (current.range)
        bind(current.range.startLine, current.range.endLine, source);
      setError(hadWork ? "code_changed" : "");
    }, [source, stopRequest, clearResult]);
    useEffect(() => {
      if (!enabled) closeRef.current();
    }, [enabled]);
    useEffect(() => {
      if (!open) return;
      firstAction.current?.focus();
      // The panel is modeless: Escape dismisses it from the panel or the editor.
      const escape = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        closeRef.current(true);
      };
      document.addEventListener("keydown", escape);
      return () => document.removeEventListener("keydown", escape);
    }, [open]);
    useEffect(() => {
      if (result?.suggestion.operation === "replace")
        acceptButton.current?.focus();
    }, [result]);
    useEffect(() => () => stopRequest(false), [stopRequest]);

    async function ask() {
      if (!range || !consent || busy || pending.current || !enabled) return;
      if (
        new TextEncoder().encode(source).byteLength >
        BUILD_AI_LIMITS.sourceBytes
      ) {
        setError("source_too_large");
        return;
      }
      // Consent covers the context displayed in this panel, not a later edit.
      try {
        const current = getBuildSelection(
          source,
          range.startLine,
          range.endLine,
        );
        const displayed = range.selection;
        if (
          current.startOffset !== displayed.startOffset ||
          current.endOffset !== displayed.endOffset ||
          current.originalText !== displayed.originalText ||
          current.beforeContext !== displayed.beforeContext ||
          current.afterContext !== displayed.afterContext
        )
          throw Error("stale_source");
      } catch {
        stopRequest();
        setConsent(false);
        clearResult();
        setError("stale_source");
        return;
      }
      stopRequest();
      const requestId = sequence.current;
      const controller = new AbortController();
      const snapshot = source;
      const selected = range;
      const selectedMode = mode;
      const issue = diagnostic;
      setPhase("reading");
      clearResult();
      setError("");
      setConsent(false);
      setFactConfirmed(false);
      const timer = setTimeout(() => {
        if (requestId !== sequence.current) return;
        stopRequest();
        setError("timeout");
      }, BUILD_AI_LIMITS.timeoutMs + 2_000);
      pending.current = { controller, timer };
      try {
        const request: BuildAssistRequest = {
          source: snapshot,
          sourceHash: await hashBuildSource(snapshot),
          startLine: selected.startLine,
          endLine: selected.endLine,
          mode: selectedMode,
          consent: true,
          policyVersion: BUILD_AI_POLICY_VERSION,
          ...(issue && selectedMode === "fix" ? { diagnostic: issue } : {}),
        };
        if (
          controller.signal.aborted ||
          requestId !== sequence.current ||
          latest.current.source !== snapshot
        )
          return;
        const response = await fetch("/build/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (requestId !== sequence.current) return;
        if (!response.ok)
          throw Error(
            body &&
              typeof body === "object" &&
              "code" in body &&
              typeof body.code === "string"
              ? body.code
              : "unavailable",
          );
        setPhase("checking");
        const value = checkedResult(
          body,
          request,
          selected.selection.originalText,
        );
        if (
          latest.current.source !== snapshot ||
          latest.current.range?.startLine !== selected.startLine ||
          latest.current.range.endLine !== selected.endLine
        )
          return;
        setResult(value);
        if (value.suggestion.operation === "replace")
          preview.current?.(
            { startLine: value.startLine, endLine: value.endLine },
            value.suggestion.replacement,
          );
      } catch (cause) {
        if (requestId !== sequence.current) return;
        const code = cause instanceof Error ? cause.message : "";
        setError(controller.signal.aborted ? "stopped" : code || "unavailable");
      } finally {
        clearTimeout(timer);
        if (requestId === sequence.current) {
          setPhase("idle");
          pending.current = null;
        }
      }
    }
    async function apply() {
      const current = latest.current;
      const value = current.result;
      if (!value || !current.range || value.suggestion.operation !== "replace")
        return;
      if (needsFacts(value) && !current.factConfirmed) {
        setError("fact_confirmation_required");
        return;
      }
      const snapshot = current.source;
      const applySequence = sequence.current;
      try {
        if (
          value.startLine !== current.range.startLine ||
          value.endLine !== current.range.endLine
        )
          throw Error("stale_source");
        const next = await applyBuildSuggestion(
          snapshot,
          value,
          current.factConfirmed,
        );
        if (applySequence !== sequence.current || !latest.current.open) return;
        if (
          (needsFacts(value) && !latest.current.factConfirmed) ||
          latest.current.source !== snapshot ||
          latest.current.range?.startLine !== value.startLine ||
          latest.current.range.endLine !== value.endLine
        )
          throw Error("stale_source");
        setUndo({ beforeSource: snapshot, afterSource: next });
        applying.current = next;
        onApply(next);
        close(true);
        setNotice(
          "AI edit applied. Review your code, then recompile to update the PDF.",
        );
      } catch {
        setError("stale_source");
      }
    }
    function undoLast() {
      if (!undo) return;
      try {
        const previous = undoBuildSuggestion(source, undo);
        onApply(previous);
        setUndo(null);
        close();
        setNotice("Last AI edit undone. Recompile to update the PDF.");
      } catch {
        setNotice(
          "The code changed after the AI edit, so Undo is unavailable.",
        );
      }
    }
    const lines = range ? `lines ${range.startLine}–${range.endLine}` : "";
    return (
      <span className={styles.controls}>
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Control+K Meta+K"
          disabled={!enabled}
          title={
            enabled
              ? "Select lines, then press ⌘/Ctrl+K"
              : "AI suggestions are currently disabled"
          }
          onClick={() => (open ? close() : show())}
        >
          ✦ Ask AI
        </button>
        {undo && (
          <button
            type="button"
            disabled={source !== undo.afterSource}
            title="Undo is available only while the code matches the applied AI edit"
            onClick={undoLast}
          >
            Undo AI edit
          </button>
        )}
        <span role="status" className={styles.srOnly}>
          {notice}
        </span>
        {open &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={popup}
              className={styles.popup}
              role="dialog"
              aria-modal="false"
              aria-labelledby="build-ai-title"
              style={{
                ...position,
                width: "min(440px, calc(100vw - 24px))",
                maxHeight: `min(680px, calc(100dvh - ${position.top}px - 12px))`,
              }}
            >
              <div className={styles.heading}>
                <div>
                  <h2 id="build-ai-title">Ask AI</h2>
                  <p>
                    {range
                      ? `Lines ${range.startLine}–${range.endLine}`
                      : "Choose a smaller nonempty selection"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close AI suggestions"
                  onClick={() => close(true)}
                >
                  ×
                </button>
              </div>
              {diagnostic && (
                <p className={styles.fixing}>
                  Fixing line {diagnostic.line}:{" "}
                  {LATEX_DIAGNOSTIC_TEXT[diagnostic.kind].title.toLowerCase()}
                </p>
              )}
              <div
                className={styles.modes}
                role="group"
                aria-label="What should AI do?"
              >
                {MODES.map((item, index) => (
                  <button
                    key={item.id}
                    ref={index === 0 ? firstAction : undefined}
                    type="button"
                    aria-pressed={mode === item.id}
                    disabled={
                      busy || (Boolean(diagnostic) && item.id !== "fix")
                    }
                    onClick={() => {
                      stopRequest();
                      setMode(item.id);
                      clearResult();
                      setConsent(false);
                      setFactConfirmed(false);
                      setError("");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {mode === "resume" && (
                <p className={styles.draft}>
                  Resume wording is an unverified draft. Check every fact.
                  Missing evidence should be a question, not an invented claim.
                </p>
              )}
              {range && (
                <>
                  <h3>Lines that will be sent</h3>
                  <pre aria-label="Selected lines">
                    {range.selection.originalText}
                  </pre>
                  {(range.selection.beforeContext ||
                    range.selection.afterContext) && (
                    <details>
                      <summary>Nearby context (also sent, read-only)</summary>
                      {range.selection.beforeContext && (
                        <pre>{range.selection.beforeContext}</pre>
                      )}
                      {range.selection.afterContext && (
                        <pre>{range.selection.afterContext}</pre>
                      )}
                    </details>
                  )}
                </>
              )}
              <p className={styles.disclosure}>
                The complete editor buffer goes to Resumide to bind the
                suggestion to your current code. Only these lines and up to two
                nearby lines on each side go to the configured AI provider.
              </p>
              {!result && (
                <>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy || !range}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    I agree to send this selected context for this request.
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={!enabled || !range || !consent || busy}
                      onClick={() => void ask()}
                    >
                      {busy ? "Asking AI…" : "Ask AI"}
                    </button>
                    {busy && (
                      <button
                        type="button"
                        onClick={() => {
                          stopRequest();
                          setError("stopped");
                        }}
                      >
                        Cancel AI request
                      </button>
                    )}
                  </div>
                </>
              )}
              {busy && (
                <p role="status" className={styles.progress}>
                  {phase === "reading"
                    ? `Reading ${lines}…`
                    : "Checking the suggestion…"}
                </p>
              )}
              {error && (
                <div>
                  <p role="alert" className={styles.error}>
                    {errorMessages.get(error) ??
                      "AI suggestions are unavailable. No change was applied. You can try again later."}
                  </p>
                  {error === "unauthenticated" && (
                    <a
                      href="/auth?next=%2Fbuild"
                      target="_blank"
                      rel="noopener"
                    >
                      Sign in in a new tab
                    </a>
                  )}
                </div>
              )}
              {result && (
                <section
                  aria-label="AI suggestion review"
                  className={styles.review}
                >
                  <h3>
                    {result.mode === "resume"
                      ? "Unverified draft"
                      : result.suggestion.operation === "no_change"
                        ? "No change suggested"
                        : result.suggestion.operation === "advice"
                          ? "Advice"
                          : "Suggested change"}
                  </h3>
                  {result.suggestion.operation === "replace" && (
                    <>
                      <p className={styles.hint}>
                        Shown in the editor: removed lines are struck through,
                        added lines are green. Press Tab in the editor to accept
                        or Esc to reject.
                      </p>
                      <pre aria-label="Suggested replacement">
                        {result.suggestion.replacement}
                      </pre>
                    </>
                  )}
                  <p>{result.suggestion.explanation}</p>
                  {result.suggestion.questions.length > 0 && (
                    <>
                      <h4>Questions to resolve</h4>
                      <ul>
                        {result.suggestion.questions.map((question, index) => (
                          <li key={index}>{question}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {needsFacts(result) &&
                    result.suggestion.operation === "replace" && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={factConfirmed}
                          onChange={(event) =>
                            setFactConfirmed(event.target.checked)
                          }
                        />
                        I confirm this draft preserves my facts and adds no
                        experience, skills, employers, credentials or metrics.
                      </label>
                    )}
                  <div className={styles.actions}>
                    {result.suggestion.operation === "replace" && (
                      <button
                        ref={acceptButton}
                        type="button"
                        aria-keyshortcuts="Tab"
                        disabled={needsFacts(result) && !factConfirmed}
                        onClick={() => void apply()}
                      >
                        Accept suggestion
                      </button>
                    )}
                    <button
                      type="button"
                      aria-keyshortcuts="Escape"
                      onClick={() => close(true)}
                    >
                      {result.suggestion.operation === "replace"
                        ? "Reject"
                        : "Close"}
                    </button>
                  </div>
                </section>
              )}
              <p className={styles.footer}>
                Suggestions are optional. Accept never recompiles automatically.
              </p>
            </div>,
            document.body,
          )}
      </span>
    );
  },
);
export default BuildAiAssistant;
