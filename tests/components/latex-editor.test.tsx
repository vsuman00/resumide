/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import LatexEditor, { type LatexEditorHandle } from "~/components/LatexEditor";

beforeAll(() => {
  // jsdom has no layout; CodeMirror only needs these to exist.
  const rect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {},
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = rect as () => DOMRect;
  document.elementFromPoint = () => null;
});
afterEach(cleanup);

const source = [
  "\\documentclass{article}",
  "\\begin{document}",
  "Line three",
  "Line four",
  "Line five",
  "\\end{document}",
].join("\n");
function setup(extra: Partial<Parameters<typeof LatexEditor>[0]> = {}) {
  const props = {
    value: source,
    onChange: vi.fn(),
    onCompile: vi.fn(),
    onCursorLine: vi.fn(),
    onSelectionLines: vi.fn(),
    onAskAi: vi.fn(),
    diagnostics: [],
    ...extra,
  };
  const ref = createRef<LatexEditorHandle>();
  const result = render(<LatexEditor ref={ref} {...props} />);
  const view = EditorView.findFromDOM(
    screen.getByTestId("latex-editor").firstElementChild as HTMLElement,
  )!;
  return { props, ref, view, result };
}
const key = (view: EditorView, init: KeyboardEventInit) =>
  act(() => {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });

it("calls onChange when the user types", () => {
  const { props, view } = setup();
  act(() =>
    view.dispatch({
      changes: { from: 0, insert: "% hi\n" },
      userEvent: "input.type",
    }),
  );
  expect(props.onChange).toHaveBeenCalledWith("% hi\n" + source);
});

it("compiles on Mod-Enter and asks AI on Mod-K", () => {
  const { props, view } = setup();
  key(view, { key: "Enter", ctrlKey: true });
  expect(props.onCompile).toHaveBeenCalledTimes(1);
  key(view, { key: "k", ctrlKey: true });
  expect(props.onAskAi).toHaveBeenCalledTimes(1);
});

it("toggles % on the selected lines with Mod-/", () => {
  const { props, view } = setup();
  act(() =>
    view.dispatch({
      selection: {
        anchor: view.state.doc.line(3).from,
        head: view.state.doc.line(4).to,
      },
    }),
  );
  key(view, { key: "/", ctrlKey: true });
  const lines = (
    props.onChange as ReturnType<typeof vi.fn>
  ).mock.lastCall![0].split("\n");
  expect(lines[2]).toBe("% Line three");
  expect(lines[3]).toBe("% Line four");
});

it("goToLine places the cursor on that line and reports it", () => {
  const { props, ref, view } = setup();
  act(() => ref.current!.goToLine(5));
  expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(5);
  expect(props.onCursorLine).toHaveBeenLastCalledWith(5);
});

it("renders a labelled gutter marker for a diagnostic", () => {
  // Gutters are aria-hidden in CodeMirror; the Problems panel is the accessible list.
  setup({
    diagnostics: [{ kind: "undefined_command", line: 3, severity: "error" }],
  });
  const markers = screen.getAllByLabelText(/on line/);
  expect(markers.map((m) => m.getAttribute("aria-label"))).toEqual([
    "Error on line 3: undefined command",
  ]);
});

it("reports selected line ranges, excluding a trailing line start", () => {
  const { props, view } = setup();
  act(() =>
    view.dispatch({
      selection: {
        anchor: view.state.doc.line(3).from,
        head: view.state.doc.line(5).from,
      },
    }),
  );
  expect(props.onSelectionLines).toHaveBeenLastCalledWith({
    startLine: 3,
    endLine: 4,
  });
});

it("draws an inline diff and routes Tab and Escape while it is shown", () => {
  const onDiffKey = vi.fn();
  const { ref, view } = setup({ onDiffKey });
  act(() =>
    ref.current!.showInlineDiff(
      { startLine: 3, endLine: 3 },
      "Line 3 rewritten",
    ),
  );
  expect(view.dom.querySelector(".cm-diff-removed")?.textContent).toBe(
    "Line three",
  );
  expect(screen.getByLabelText("Suggested replacement").textContent).toBe(
    "Line 3 rewritten",
  );
  key(view, { key: "Tab" });
  key(view, { key: "Escape" });
  expect(onDiffKey.mock.calls).toEqual([["accept"], ["reject"]]);
  act(() => ref.current!.showInlineDiff(null, null));
  expect(view.dom.querySelector(".cm-diff-removed")).toBeNull();
  expect(view.state.doc.toString()).toBe(source);
});

it("applies external value changes without echoing onChange", () => {
  const { props, result, view } = setup();
  result.rerender(<LatexEditor {...props} value="new" />);
  expect(view.state.doc.toString()).toBe("new");
  expect(props.onChange).not.toHaveBeenCalled();
});

it("refuses an edit that would exceed the source limit", async () => {
  const onRejectedEdit = vi.fn();
  const { props, view } = setup({ onRejectedEdit });
  act(() =>
    view.dispatch({ changes: { from: 0, insert: "x".repeat(49_153) } }),
  );
  await Promise.resolve();
  expect(view.state.doc.toString()).toBe(source);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(onRejectedEdit).toHaveBeenCalled();
});
