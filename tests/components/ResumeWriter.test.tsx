/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ResumeWriter from "../../app/components/ResumeWriter";
afterEach(cleanup);

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
