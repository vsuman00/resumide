import {
  useCallback,
  useEffect,
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
  selectionLineRange,
  undoBuildSuggestion,
  type BuildAssistMode,
  type BuildAssistRequest,
  type BuildAssistResponse,
  type BuildSelection,
  type BuildUndo,
} from "~/lib/build-assist";
import styles from "./BuildAiAssistant.module.css";

type Range = { startLine: number; endLine: number; selection: BuildSelection };
type Props = {
  source: string;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  enabled: boolean;
  onApply: (source: string) => void;
};
const errors: Record<string, string> = {
  disabled: "AI suggestions are currently disabled.",
  unauthenticated:
    "Your session has ended. Sign in again before asking for a suggestion.",
  forbidden:
    "This request could not be accepted. Keep a copy of your code before reloading.",
  rate_limited: "Too many requests. Wait a moment before asking again.",
  budget_exceeded: "The AI usage allowance is unavailable. Try again later.",
  budget_exhausted:
    "The AI usage allowance has been reached. Try again after it renews.",
  busy: "AI suggestions are busy. Try again shortly.",
  timeout: "The request timed out. No suggestion was applied.",
  selection_invalid:
    "Select up to 20 nonempty lines and 4,000 characters. Nearby context must also fit the request limit.",
  stale_source:
    "Your source or selection changed. Ask again for the current selection.",
  invalid_suggestion:
    "The suggestion did not pass checks. No change was applied.",
};

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

export default function BuildAiAssistant({
  source,
  editorRef,
  enabled,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<Range | null>(null);
  const [mode, setMode] = useState<BuildAssistMode>("fix");
  const [consent, setConsent] = useState(false);
  const [factConfirmed, setFactConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuildAssistResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<BuildUndo | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 80 });
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const modeControl = useRef<HTMLSelectElement>(null);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHover = useRef(false);
  const latest = useRef({ source, open, range, enabled, factConfirmed });
  latest.current = { source, open, range, enabled, factConfirmed };
  const anchor = useRef({ x: 12, y: 80 });
  const focusOnOpen = useRef(false);
  const previousSource = useRef(source);

  const stopRequest = useCallback(() => {
    sequence.current += 1;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
  }, []);
  const clearTimers = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);
  function close(restoreFocus = false) {
    clearTimers();
    stopRequest();
    suppressHover.current = true;
    // Native selection events can precede React's state commit after an input.
    // Make dismissal visible to those listeners in the same event turn.
    latest.current = { ...latest.current, open: false, range: null };
    setOpen(false);
    setResult(null);
    setConsent(false);
    setFactConfirmed(false);
    setError("");
    if (restoreFocus) trigger.current?.focus();
  }
  const closeRef = useRef(close);
  closeRef.current = close;
  function show(
    startLine: number,
    endLine: number,
    keyboard = false,
    y?: number,
  ) {
    if (!latest.current.enabled) return;
    const current = latest.current;
    if (
      current.open &&
      current.range?.startLine === startLine &&
      current.range.endLine === endLine
    )
      return;
    stopRequest();
    setResult(null);
    setConsent(false);
    setFactConfirmed(false);
    setError("");
    const editor = editorRef.current;
    if (!editor) return;
    const rect = editor.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
    anchor.current = {
      x: rect.left + Math.min(120, rect.width / 4),
      y:
        y ??
        rect.top +
          16 +
          (startLine - 1) * lineHeight -
          editor.scrollTop +
          lineHeight,
    };
    setPosition({
      left: Math.max(
        12,
        Math.min(
          anchor.current.x,
          window.innerWidth - Math.min(520, window.innerWidth - 24) - 12,
        ),
      ),
      top: Math.max(
        12,
        Math.min(anchor.current.y + 8, window.innerHeight - 180),
      ),
    });
    try {
      setRange({
        startLine,
        endLine,
        selection: getBuildSelection(current.source, startLine, endLine),
      });
    } catch {
      setRange(null);
      setError(errors.selection_invalid);
    }
    focusOnOpen.current = keyboard;
    setOpen(true);
  }
  const showRef = useRef(show);
  showRef.current = show;
  function showCurrent() {
    const editor = editorRef.current;
    if (!editor) return;
    // Textarea offsets count normalized newlines; line indices bind back to exact source bytes.
    const selected = selectionLineRange(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
    );
    show(selected.startLine, selected.endLine, true);
  }
  useEffect(() => {
    if (source !== previousSource.current) {
      previousSource.current = source;
      closeRef.current();
    }
  }, [source]);
  useEffect(() => {
    if (!enabled) closeRef.current();
  }, [enabled]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled) return;
    const selected = (event: Event) => {
      if (event.type === "keyup" && (event as KeyboardEvent).key === "Escape")
        return;
      if (editor.value !== latest.current.source.replace(/\r\n?/g, "\n")) {
        closeRef.current();
        return;
      }
      // Caret changes are not a fresh selection. The toolbar still supports
      // explicit current-line requests without reopening after an edit.
      if (editor.selectionStart === editor.selectionEnd) {
        if (latest.current.open) closeRef.current();
        return;
      }
      const selection = selectionLineRange(
        editor.value,
        editor.selectionStart,
        editor.selectionEnd,
      );
      showRef.current(selection.startLine, selection.endLine);
    };
    const enter = () => {
      suppressHover.current = false;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
    const move = (event: MouseEvent) => {
      if (latest.current.open || suppressHover.current || event.buttons) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      const rect = editor.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
      const line = Math.max(
        1,
        Math.floor(
          (event.clientY - rect.top - 16 + editor.scrollTop) / lineHeight,
        ) + 1,
      );
      const y = event.clientY;
      hoverTimer.current = setTimeout(
        () => showRef.current(line, line, false, y),
        450,
      );
    };
    const leave = () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      leaveTimer.current = setTimeout(() => {
        if (
          !popup.current?.matches(":hover") &&
          !popup.current?.contains(document.activeElement)
        )
          closeRef.current();
      }, 500);
    };
    const edited = () => closeRef.current();
    editor.addEventListener("beforeinput", edited);
    editor.addEventListener("input", edited);
    editor.addEventListener("mouseenter", enter);
    editor.addEventListener("mousemove", move);
    editor.addEventListener("mouseleave", leave);
    editor.addEventListener("mouseup", selected);
    editor.addEventListener("select", selected);
    editor.addEventListener("keyup", selected);
    return () => {
      clearTimers();
      editor.removeEventListener("beforeinput", edited);
      editor.removeEventListener("input", edited);
      editor.removeEventListener("mouseenter", enter);
      editor.removeEventListener("mousemove", move);
      editor.removeEventListener("mouseleave", leave);
      editor.removeEventListener("mouseup", selected);
      editor.removeEventListener("select", selected);
      editor.removeEventListener("keyup", selected);
    };
  }, [editorRef, enabled, clearTimers]);
  useEffect(() => {
    if (!open) return;
    const align = () => {
      const height = popup.current?.getBoundingClientRect().height ?? 400;
      const width = Math.min(520, window.innerWidth - 24);
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor.current.x, window.innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          Math.min(anchor.current.y + 8, window.innerHeight - height - 12),
        ),
      });
    };
    align();
    if (focusOnOpen.current) {
      modeControl.current?.focus();
      focusOnOpen.current = false;
    }
    const observer = new ResizeObserver(align);
    if (popup.current) observer.observe(popup.current);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popup.current?.contains(target) &&
        !trigger.current?.contains(target) &&
        target !== editorRef.current
      )
        closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current(
          Boolean(popup.current?.contains(document.activeElement)),
        );
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", align);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", align);
    };
  }, [open, editorRef]);
  useEffect(
    () => () => {
      clearTimers();
      sequence.current += 1;
      pending.current?.abort();
    },
    [clearTimers],
  );

  async function ask() {
    if (!range || !consent || busy || !enabled) return;
    if (
      new TextEncoder().encode(source).byteLength > BUILD_AI_LIMITS.sourceBytes
    ) {
      setError(
        "Source exceeds the 48 KiB limit. Shorten it before asking for a suggestion.",
      );
      return;
    }
    // Consent covers the context displayed in this popover, not a later edit.
    // Recheck synchronously before any hash work or provider-bound request.
    try {
      const current = getBuildSelection(source, range.startLine, range.endLine);
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
      setResult(null);
      setError(errors.stale_source);
      return;
    }
    stopRequest();
    const requestId = sequence.current;
    const controller = new AbortController();
    pending.current = controller;
    const snapshot = source;
    const selected = range;
    const selectedMode = mode;
    setBusy(true);
    setResult(null);
    setError("");
    setConsent(false);
    setFactConfirmed(false);
    const timer = setTimeout(
      () => controller.abort(),
      BUILD_AI_LIMITS.timeoutMs + 2_000,
    );
    try {
      const request: BuildAssistRequest = {
        source: snapshot,
        sourceHash: await hashBuildSource(snapshot),
        startLine: selected.startLine,
        endLine: selected.endLine,
        mode: selectedMode,
        consent: true,
        policyVersion: BUILD_AI_POLICY_VERSION,
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
      if (!response.ok)
        throw Error(
          body &&
            typeof body === "object" &&
            "code" in body &&
            typeof body.code === "string"
            ? body.code
            : "unavailable",
        );
      const value = checkedResult(
        body,
        request,
        selected.selection.originalText,
      );
      if (
        requestId !== sequence.current ||
        latest.current.source !== snapshot ||
        latest.current.range?.startLine !== selected.startLine ||
        latest.current.range.endLine !== selected.endLine
      )
        return;
      setResult(value);
    } catch (cause) {
      if (requestId !== sequence.current) return;
      setError(
        controller.signal.aborted
          ? "The request stopped. No suggestion was applied."
          : (errors[cause instanceof Error ? cause.message : ""] ??
              "AI suggestions are unavailable. No change was applied. You can try again later."),
      );
    } finally {
      clearTimeout(timer);
      if (requestId === sequence.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  }
  async function apply() {
    if (
      !result ||
      !range ||
      ((result.requiresFactConfirmation || result.mode === "resume") &&
        !factConfirmed)
    )
      return;
    const snapshot = source;
    const applySequence = sequence.current;
    try {
      if (
        result.startLine !== range.startLine ||
        result.endLine !== range.endLine
      )
        throw Error("stale_source");
      const next = await applyBuildSuggestion(snapshot, result, factConfirmed);
      if (applySequence !== sequence.current || !latest.current.open) return;
      if (
        ((result.requiresFactConfirmation || result.mode === "resume") &&
          !latest.current.factConfirmed) ||
        latest.current.source !== snapshot ||
        latest.current.range?.startLine !== result.startLine ||
        latest.current.range.endLine !== result.endLine
      )
        throw Error("stale_source");
      setUndo({ beforeSource: snapshot, afterSource: next });
      onApply(next);
      close();
      setNotice(
        "AI edit applied. Review your code, then recompile to update the PDF.",
      );
    } catch {
      setError(errors.stale_source);
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
      setNotice("The code changed after the AI edit, so Undo is unavailable.");
    }
  }
  return (
    <span className={styles.controls}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!enabled}
        title={
          enabled
            ? "Select code or place the cursor on a line"
            : "AI suggestions are currently disabled"
        }
        onClick={() => (open ? close() : showCurrent())}
      >
        AI suggestions
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
            style={position}
            onMouseEnter={() => {
              if (leaveTimer.current) clearTimeout(leaveTimer.current);
            }}
          >
            <div className={styles.heading}>
              <div>
                <h2 id="build-ai-title">AI suggestions</h2>
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
            <label className={styles.mode}>
              Suggestion type
              <select
                ref={modeControl}
                aria-label="Suggestion type"
                value={mode}
                disabled={busy}
                onChange={(event) => {
                  stopRequest();
                  setMode(event.target.value as BuildAssistMode);
                  setResult(null);
                  setConsent(false);
                  setFactConfirmed(false);
                  setError("");
                }}
              >
                <option value="fix">Fix code</option>
                <option value="rewrite">Rewrite</option>
                <option value="resume">Resume wording</option>
              </select>
            </label>
            <p className={styles.disclosure}>
              The complete editor buffer goes to Resumide to bind the suggestion
              to your current code. Only the selected lines and up to two nearby
              lines on each side go to the configured AI provider. Hovering does
              not send a request.
            </p>
            {mode === "resume" && (
              <p className={styles.draft}>
                Resume wording is an unverified draft. Check every fact. Missing
                evidence should be a question, not an invented claim.
              </p>
            )}
            {range && (
              <details>
                <summary>Review selected context</summary>
                {range.selection.beforeContext && (
                  <>
                    <h3>Nearby context before</h3>
                    <pre>{range.selection.beforeContext}</pre>
                  </>
                )}
                <h3>Selected lines</h3>
                <pre>{range.selection.originalText}</pre>
                {range.selection.afterContext && (
                  <>
                    <h3>Nearby context after</h3>
                    <pre>{range.selection.afterContext}</pre>
                  </>
                )}
              </details>
            )}
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
                    {busy ? "Requesting suggestion..." : "Ask AI"}
                  </button>
                  {busy && (
                    <button
                      type="button"
                      onClick={() => {
                        stopRequest();
                        setError(
                          "The request stopped. No suggestion was applied.",
                        );
                      }}
                    >
                      Cancel AI request
                    </button>
                  )}
                </div>
              </>
            )}
            {busy && (
              <p role="status">
                Requesting a suggestion for the selected context...
              </p>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
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
                      : "Review suggestion"}
                </h3>
                <h4>Before</h4>
                <pre>{result.originalText}</pre>
                {result.suggestion.operation === "replace" && (
                  <>
                    <h4>After</h4>
                    <pre>{result.suggestion.replacement}</pre>
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
                {(result.requiresFactConfirmation ||
                  result.mode === "resume") &&
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
                      type="button"
                      disabled={
                        (result.requiresFactConfirmation ||
                          result.mode === "resume") &&
                        !factConfirmed
                      }
                      onClick={() => void apply()}
                    >
                      Apply suggestion
                    </button>
                  )}
                  <button type="button" onClick={() => close(true)}>
                    Discard suggestion
                  </button>
                </div>
              </section>
            )}
            <p className={styles.footer}>
              Suggestions are optional. Apply never recompiles automatically.
              Press Escape to dismiss.
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}
