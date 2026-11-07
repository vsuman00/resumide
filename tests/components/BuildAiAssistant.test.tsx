/** @vitest-environment jsdom */
import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BuildAiAssistant from "~/components/BuildAiAssistant";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps selected-context suggestions dismissed through Escape keyup and permits fresh selection", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  function Editor() {
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const source = "Neutral first line\nNeutral second line";
    return (
      <>
        <textarea aria-label="Source" ref={editorRef} defaultValue={source} />
        <BuildAiAssistant
          source={source}
          editorRef={editorRef}
          enabled
          onApply={vi.fn()}
        />
      </>
    );
  }
  render(<Editor />);
  const editor = screen.getByRole("textbox", {
    name: "Source",
  }) as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(0, 18);
  fireEvent.select(editor);
  expect(screen.getByRole("dialog", { name: "AI suggestions" })).toBeTruthy();
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "AI suggestions" })).toBeNull();
  fireEvent.keyUp(editor, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "AI suggestions" })).toBeNull();
  editor.setSelectionRange(19, 38);
  fireEvent.select(editor);
  expect(screen.getByRole("dialog", { name: "AI suggestions" })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
