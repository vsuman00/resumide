import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorSelection,
  EditorState,
  Prec,
  RangeSet,
  StateEffect,
  StateField,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  drawSelection,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  showTooltip,
  type Tooltip,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { LATEX_LIMITS, type LatexDiagnostic } from "~/lib/latex-converter";
import { describeDiagnostic } from "~/lib/latex-diagnostics";
import styles from "./LatexConverter.module.css";

export type LineRange = { startLine: number; endLine: number };
export type LatexEditorHandle = {
  focus(): void;
  goToLine(line: number): void;
  getSelectionLines(): LineRange | null;
  insertAround(before: string, after: string): void;
  showInlineDiff(range: LineRange | null, replacement: string | null): void;
};
type Props = {
  value: string;
  onChange(value: string): void;
  onCompile(): void;
  onCursorLine(line: number): void;
  onSelectionLines(range: LineRange | null): void;
  onAskAi(): void;
  diagnostics: LatexDiagnostic[];
  aiEnabled?: boolean;
  onDiffKey?(action: "accept" | "reject"): void;
  onRejectedEdit?(): void;
};

// Design-token colors (the same ones the previous overlay used) so every token meets AA contrast.
const latexHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--ink-muted)" },
  {
    tag: [
      tags.keyword,
      tags.tagName,
      tags.atom,
      tags.meta,
      tags.operator,
      tags.definition(tags.variableName),
    ],
    color: "var(--brand)",
  },
  {
    tag: [tags.bracket, tags.punctuation, tags.number, tags.string],
    color: "var(--evidence)",
  },
]);

const setProblems = StateEffect.define<LatexDiagnostic[]>();
const setDiff = StateEffect.define<{
  range: LineRange;
  replacement: string;
} | null>();
const setAi = StateEffect.define<boolean>();

class ProblemMarker extends GutterMarker {
  constructor(readonly diagnostic: LatexDiagnostic) {
    super();
  }
  eq(other: ProblemMarker) {
    return (
      other.diagnostic.kind === this.diagnostic.kind &&
      other.diagnostic.severity === this.diagnostic.severity
    );
  }
  toDOM() {
    const marker = document.createElement("span");
    const label = describeDiagnostic(this.diagnostic);
    marker.className = `cm-problem cm-problem-${this.diagnostic.severity}`;
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", label);
    marker.title = label;
    marker.textContent = this.diagnostic.severity === "error" ? "●" : "▲";
    return marker;
  }
}
class Spacer extends GutterMarker {
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-problem";
    marker.textContent = "●";
    return marker;
  }
}
class AddedLines extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: AddedLines) {
    return other.text === this.text;
  }
  toDOM() {
    const block = document.createElement("div");
    block.className = "cm-diff-added";
    block.setAttribute("aria-label", "Suggested replacement");
    for (const line of this.text.split("\n")) {
      const row = document.createElement("div");
      row.textContent = line || " ";
      block.append(row);
    }
    return block;
  }
}

const lineOf = (doc: Text, line: number) =>
  doc.line(Math.max(1, Math.min(doc.lines, line)));

const problems = StateField.define<LatexDiagnostic[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setProblems)) return effect.value;
    return value;
  },
});
const problemGutter = gutter({
  class: "cm-problem-gutter",
  markers: (view) => {
    const doc = view.state.doc;
    const byLine = new Map<number, LatexDiagnostic>();
    for (const item of view.state.field(problems))
      if (item.line && item.line <= doc.lines) {
        const current = byLine.get(item.line);
        if (!current || item.severity === "error") byLine.set(item.line, item);
      }
    return RangeSet.of(
      [...byLine.entries()]
        .sort(([a], [b]) => a - b)
        .map(([line, item]) =>
          new ProblemMarker(item).range(doc.line(line).from),
        ),
    );
  },
  initialSpacer: () => new Spacer(),
});

const diff = StateField.define<{
  range: LineRange;
  replacement: string;
} | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setDiff)) return effect.value;
    return tr.docChanged ? null : value;
  },
});
const diffDecorations = EditorView.decorations.compute([diff], (state) => {
  const value = state.field(diff);
  if (!value) return Decoration.none;
  const doc = state.doc;
  const ranges = [];
  for (let n = value.range.startLine; n <= value.range.endLine; n++)
    ranges.push(
      Decoration.line({ class: "cm-diff-removed" }).range(lineOf(doc, n).from),
    );
  ranges.push(
    Decoration.widget({
      widget: new AddedLines(value.replacement),
      block: true,
      side: 1,
    }).range(lineOf(doc, value.range.endLine).to),
  );
  return Decoration.set(ranges, true);
});
const problemLines = EditorView.decorations.compute([problems], (state) => {
  const doc = state.doc;
  return Decoration.set(
    state
      .field(problems)
      .filter(
        (item) =>
          item.line && item.line <= doc.lines && item.severity === "error",
      )
      .map((item) =>
        Decoration.line({ class: "cm-problem-line" }).range(
          doc.line(item.line!).from,
        ),
      ),
    true,
  );
});

function selectedLines(state: EditorState): LineRange {
  const { from, to } = state.selection.main;
  const start = state.doc.lineAt(from);
  let end = state.doc.lineAt(to);
  // A selection that ends at the start of a line does not include that line.
  if (to > from && to === end.from && end.number > start.number)
    end = state.doc.line(end.number - 1);
  return { startLine: start.number, endLine: end.number };
}

export function editorTheme() {
  return EditorView.theme({
    "&": { height: "100%", fontSize: "13px", color: "var(--ink)" },
    "&.cm-focused": {
      outline: "2px solid var(--focus, var(--brand))",
      outlineOffset: "-2px",
    },
    ".cm-scroller": {
      fontFamily: '"IBM Plex Mono", monospace',
      lineHeight: "22px",
    },
    ".cm-content": { padding: "16px 0", caretColor: "var(--ink)" },
    ".cm-gutters": {
      background: "var(--canvas-subtle)",
      color: "var(--ink-faint)",
      border: "none",
    },
    // No tint behind the active line: tinted backgrounds pushed brand-colored tokens under AA contrast.
    ".cm-activeLine": {
      background: "transparent",
      boxShadow: "inset 2px 0 0 var(--brand)",
    },
    ".cm-activeLineGutter": {
      background: "var(--brand-soft)",
      color: "var(--ink)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        background: "var(--brand-soft) !important",
      },
    ".cm-problem-gutter": { width: "18px" },
    ".cm-problem": {
      display: "inline-block",
      width: "14px",
      textAlign: "center",
      fontSize: "10px",
    },
    ".cm-problem-error": { color: "var(--danger, #b42318)" },
    ".cm-problem-warning": { color: "var(--warning, #b54708)" },
    // No tint: it pushed brand-colored tokens under AA contrast. A marker bar and wavy underline instead.
    ".cm-problem-line": { boxShadow: "inset 3px 0 0 var(--danger, #b42318)" },
    ".cm-problem-line .cm-problem-text, .cm-problem-line": {
      textDecorationLine: "underline",
      textDecorationStyle: "wavy",
      textDecorationColor: "var(--danger, #b42318)",
    },
    ".cm-diff-removed span": { color: "var(--ink) !important" },
    ".cm-diff-removed": {
      background: "color-mix(in srgb, var(--danger, #b42318) 16%, transparent)",
      textDecoration: "line-through",
      textDecorationColor: "var(--danger, #b42318)",
    },
    ".cm-diff-added": {
      background:
        "color-mix(in srgb, var(--success, #067647) 16%, transparent)",
      borderLeft: "3px solid var(--success, #067647)",
      padding: "0 6px",
      whiteSpace: "pre",
    },
    ".cm-tooltip.cm-ai-chip": { border: "none", background: "transparent" },
    ".cm-ai-chip button": {
      minHeight: "32px",
      padding: "4px 10px",
      borderRadius: "999px",
      border: "1px solid var(--border)",
      background: "var(--surface)",
      color: "var(--ink)",
      font: "inherit",
      fontSize: "12px",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
    },
    "@media (prefers-reduced-motion: no-preference)": {
      ".cm-diff-added": { animation: "cm-fade 160ms ease-out" },
    },
    "@keyframes cm-fade": { from: { opacity: 0 }, to: { opacity: 1 } },
  });
}

const LatexEditor = forwardRef<LatexEditorHandle, Props>(
  function LatexEditor(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    const external = useRef(false);

    useImperativeHandle(ref, () => ({
      focus: () => view.current?.focus(),
      goToLine(line) {
        const v = view.current;
        if (!v) return;
        const target = lineOf(v.state.doc, line);
        v.dispatch({
          selection: EditorSelection.cursor(target.from),
          effects: EditorView.scrollIntoView(target.from, { y: "center" }),
        });
        v.focus();
      },
      getSelectionLines: () =>
        view.current ? selectedLines(view.current.state) : null,
      insertAround(before, after) {
        const v = view.current;
        if (!v) return;
        const { from, to } = v.state.selection.main;
        v.dispatch({
          changes: {
            from,
            to,
            insert: before + v.state.sliceDoc(from, to) + after,
          },
          selection: EditorSelection.range(
            from + before.length,
            to + before.length,
          ),
        });
        v.focus();
      },
      showInlineDiff(range, replacement) {
        const v = view.current;
        if (!v) return;
        v.dispatch({
          effects: [
            setDiff.of(
              range && replacement !== null ? { range, replacement } : null,
            ),
            ...(range
              ? [
                  EditorView.scrollIntoView(
                    lineOf(v.state.doc, range.startLine).from,
                    { y: "nearest" },
                  ),
                ]
              : []),
          ],
        });
      },
    }));

    useEffect(() => {
      const aiChip = StateField.define<{
        on: boolean;
        tooltip: Tooltip | null;
      }>({
        create: () => ({
          on: Boolean(callbacks.current.aiEnabled),
          tooltip: null,
        }),
        update(value, tr) {
          let on = value.on;
          for (const effect of tr.effects)
            if (effect.is(setAi)) on = effect.value;
          const sel = tr.state.selection.main;
          if (!on || sel.empty || tr.state.field(diff))
            return { on, tooltip: null };
          const lines = selectedLines(tr.state);
          if (lines.endLine - lines.startLine + 1 > 20)
            return { on, tooltip: null };
          return {
            on,
            tooltip: {
              pos: sel.head,
              above: sel.head < sel.anchor,
              strictSide: false,
              arrow: false,
              create: () => {
                const dom = document.createElement("div");
                dom.className = "cm-ai-chip";
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "✦ Ask AI";
                button.setAttribute(
                  "aria-label",
                  `Ask AI about lines ${lines.startLine}–${lines.endLine}`,
                );
                button.addEventListener("mousedown", (event) =>
                  event.preventDefault(),
                );
                button.addEventListener("click", () =>
                  callbacks.current.onAskAi(),
                );
                dom.append(button);
                return { dom };
              },
            },
          };
        },
        provide: (field) =>
          showTooltip.compute([field], (state) => state.field(field).tooltip),
      });
      const extensions: Extension[] = [
        lineNumbers(),
        problemGutter,
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        search({ top: true }),
        StreamLanguage.define(stex),
        syntaxHighlighting(latexHighlight),
        problems,
        diff,
        diffDecorations,
        problemLines,
        aiChip,
        Prec.highest(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                callbacks.current.onCompile();
                return true;
              },
            },
            {
              key: "Mod-k",
              run: () => {
                callbacks.current.onAskAi();
                return true;
              },
            },
            {
              key: "Tab",
              run: (v) => {
                if (!v.state.field(diff) || !callbacks.current.onDiffKey)
                  return false;
                callbacks.current.onDiffKey("accept");
                return true;
              },
            },
            {
              key: "Escape",
              run: (v) => {
                if (!v.state.field(diff) || !callbacks.current.onDiffKey)
                  return false;
                callbacks.current.onDiffKey("reject");
                return true;
              },
            },
          ]),
        ),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorState.transactionFilter.of((tr) => {
          if (tr.docChanged && tr.newDoc.length > LATEX_LIMITS.sourceBytes) {
            queueMicrotask(() => callbacks.current.onRejectedEdit?.());
            return [];
          }
          return tr;
        }),
        EditorView.contentAttributes.of({
          "aria-label": "LaTeX source",
          "aria-describedby": "latex-source-help",
          // Explicit so the scrollable editor region has a focusable descendant for assistive tech.
          tabindex: "0",
          spellcheck: "false",
          autocapitalize: "off",
          autocorrect: "off",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !external.current)
            callbacks.current.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const sel = update.state.selection.main;
            const lines = selectedLines(update.state);
            if (sel.empty) {
              callbacks.current.onSelectionLines(null);
              callbacks.current.onCursorLine(lines.startLine);
            } else callbacks.current.onSelectionLines(lines);
          }
        }),
        editorTheme(),
      ];
      const editor = new EditorView({
        parent: host.current!,
        state: EditorState.create({ doc: callbacks.current.value, extensions }),
      });
      view.current = editor;
      return () => {
        editor.destroy();
        view.current = null;
      };
    }, []);

    useEffect(() => {
      const v = view.current;
      if (!v || v.state.doc.toString() === props.value) return;
      external.current = true;
      try {
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: props.value },
        });
      } finally {
        external.current = false;
      }
    }, [props.value]);
    useEffect(() => {
      view.current?.dispatch({ effects: setProblems.of(props.diagnostics) });
    }, [props.diagnostics]);
    useEffect(() => {
      view.current?.dispatch({ effects: setAi.of(Boolean(props.aiEnabled)) });
    }, [props.aiEnabled]);

    return (
      <div
        ref={host}
        className={styles.codeEditor}
        data-testid="latex-editor"
      />
    );
  },
);
export default LatexEditor;
