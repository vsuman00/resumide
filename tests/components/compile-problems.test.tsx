/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CompileProblems from "~/components/CompileProblems";
import { LATEX_DIAGNOSTIC_KINDS } from "~/lib/latex-converter";
import { LATEX_DIAGNOSTIC_TEXT } from "~/lib/latex-diagnostics";

afterEach(cleanup);
const error = {
  kind: "undefined_command",
  line: 42,
  severity: "error",
} as const;
const warning = { kind: "overfull_box", line: 7, severity: "warning" } as const;

it("renders an error with its help text and a jump button", () => {
  const onJump = vi.fn();
  render(
    <CompileProblems diagnostics={[error]} stale={false} onJump={onJump} />,
  );
  expect(
    screen.getByText(
      "Line 42 · Undefined command — check the spelling or remove it",
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Jump to line 42" }));
  expect(onJump).toHaveBeenCalledWith(42);
});

it("groups warnings in a collapsed details element", () => {
  const { container } = render(
    <CompileProblems diagnostics={[warning]} stale={false} onJump={vi.fn()} />,
  );
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(screen.getByText("1 warning")).toBeTruthy();
});

it("disables jumping and explains when the code changed", () => {
  render(
    <CompileProblems
      diagnostics={[error]}
      stale
      onJump={vi.fn()}
      onFixWithAi={vi.fn()}
    />,
  );
  expect(
    screen.getByText("Code changed since this compile. Recompile to refresh."),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Jump to line 42",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Fix with AI" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("maps every kind to a fixed help sentence", () => {
  for (const kind of LATEX_DIAGNOSTIC_KINDS)
    expect(LATEX_DIAGNOSTIC_TEXT[kind].help.length).toBeGreaterThan(5);
});

it("offers Fix with AI only for errors", () => {
  const onFix = vi.fn();
  render(
    <CompileProblems
      diagnostics={[error, warning]}
      stale={false}
      onJump={vi.fn()}
      onFixWithAi={onFix}
    />,
  );
  expect(screen.getAllByRole("button", { name: "Fix with AI" })).toHaveLength(
    1,
  );
  fireEvent.click(screen.getByRole("button", { name: "Fix with AI" }));
  expect(onFix).toHaveBeenCalledWith(error);
});

it("renders nothing without diagnostics", () => {
  const { container } = render(
    <CompileProblems diagnostics={[]} stale={false} onJump={vi.fn()} />,
  );
  expect(container.innerHTML).toBe("");
});
