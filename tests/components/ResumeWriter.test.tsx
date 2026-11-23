/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ResumeWriter from "../../app/components/ResumeWriter";
const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (clipboardDescriptor)
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});
function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}
const retainedWriter: ResumeWriter = {
  summary: "Software engineer who builds test tooling.",
  bullets: [
    {
      original: "Built tests",
      rewrite: "Developed tests",
      reasoning: "Clear wording.",
    },
  ],
};

it("labels an unversioned retained draft as legacy-unbound while preserving manual copy", () => {
  render(<ResumeWriter writer={retainedWriter} />);
  expect(
    screen.getByText(
      "This saved legacy draft has no canonical resume or job-requirement version binding. Its source support and relationship to the current versions are unknown.",
    ),
  ).toBeTruthy();
  expect(screen.getByText(retainedWriter.summary!)).toBeTruthy();
  expect(screen.getByText(retainedWriter.bullets[0].rewrite)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
});

it("does not invent an insufficient-evidence reason for an empty saved draft", () => {
  render(<ResumeWriter writer={{ summary: null, bullets: [] }} />);
  expect(
    screen.getByRole("heading", { name: "No rewrite was saved" }),
  ).toBeTruthy();
  expect(screen.queryByText(/evidence did not support/)).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Review available feedback" })
      .getAttribute("href"),
  ).toBe("#overview");
  expect(
    screen
      .getByRole("link", { name: "Start a new analysis" })
      .getAttribute("href"),
  ).toBe("/upload");
});
it("distinguishes an unavailable writing stage from an empty successful draft", () => {
  render(<ResumeWriter unavailable />);
  expect(
    screen.getByRole("heading", {
      name: "Writing generation did not complete",
    }),
  ).toBeTruthy();
});
it("still displays retained wording and its original source", () => {
  render(
    <ResumeWriter
      writer={{
        summary: null,
        bullets: [
          {
            original: "Built tests",
            rewrite: "Developed tests",
            reasoning: "Clear wording.",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Built tests")).toBeTruthy();
  expect(screen.getByText("Developed tests")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});

it("labels retained output as reviewable drafts without an unsupported grounding guarantee", () => {
  render(<ResumeWriter writer={retainedWriter} />);
  expect(
    screen.getByRole("heading", { name: "Review writing drafts" }),
  ).toBeTruthy();
  expect(screen.queryByText(/^Grounded suggestions$/)).toBeNull();
  expect(
    screen.queryByText(
      /these suggestions are grounded in the uploaded resume evidence/i,
    ),
  ).toBeNull();
  expect(screen.getByText("Built tests")).toBeTruthy();
  expect(screen.getByText("Developed tests")).toBeTruthy();
  expect(screen.getByText(retainedWriter.summary!)).toBeTruthy();
});
it("guides clipboard Copy and separate fact-confirmed saving without network side effects", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network expected"));
  render(
    <ResumeWriter
      writer={{ summary: null, bullets: retainedWriter.bullets }}
    />,
  );
  const note = screen.getByText(/copy a draft to your clipboard/i);
  expect(note.textContent).toMatch(
    /review and save resume edits in the resume workspace/i,
  );
  expect(note.textContent).toMatch(/where you confirm the facts/i);
  expect(
    screen.queryByText(
      /export (?:saved|verified)|score (?:improved|increased)/i,
    ),
  ).toBeNull();
  const copy = screen.getByRole("button", { name: "Copy" });
  expect(copy.getAttribute("aria-describedby")).toBe(note.id);
  fireEvent.click(copy);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
  );
  expect(writeText).toHaveBeenCalledExactlyOnceWith("Developed tests");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not label a replacement draft as already copied", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  const view = render(
    <ResumeWriter
      writer={{ summary: null, bullets: retainedWriter.bullets }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
  );
  view.rerender(
    <ResumeWriter
      writer={{
        summary: null,
        bullets: [
          { ...retainedWriter.bullets[0], rewrite: "Built maintainable tests" },
        ],
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenLastCalledWith("Built maintainable tests"),
  );
});
it("keeps retained drafts visible when the writing stage is unavailable", () => {
  render(<ResumeWriter writer={retainedWriter} unavailable />);
  expect(screen.getByText("Developed tests")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toMatch(
    /saved drafts remain available to review/i,
  );
  expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
});
it("announces clipboard failure without claiming that anything was copied", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValue(new Error("Clipboard access denied."));
  mockClipboard(writeText);
  render(
    <ResumeWriter
      writer={{ summary: null, bullets: retainedWriter.bullets }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Clipboard access denied.",
  );
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  expect(screen.getByText("Developed tests")).toBeTruthy();
});

it("copies the summary draft without submitting a resume edit", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  mockClipboard(writeText);
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <ResumeWriter writer={{ summary: retainedWriter.summary, bullets: [] }} />
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
  );
  expect(writeText).toHaveBeenCalledExactlyOnceWith(retainedWriter.summary);
  expect(submit).not.toHaveBeenCalled();
});
it("keeps the draft usable when the clipboard API is unavailable", async () => {
  Reflect.deleteProperty(navigator, "clipboard");
  render(
    <ResumeWriter
      writer={{ summary: null, bullets: retainedWriter.bullets }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Copy is not available in this browser.",
  );
  expect(screen.getByText("Developed tests")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
});
