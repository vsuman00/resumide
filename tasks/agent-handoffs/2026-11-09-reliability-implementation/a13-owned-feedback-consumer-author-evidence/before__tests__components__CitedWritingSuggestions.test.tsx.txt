/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import CitedWritingSuggestions from "../../app/components/CitedWritingSuggestions";

afterEach(cleanup);
it("separates suggestion titles, explanations and exact excerpts without ratings", () => {
  const quote = "Built reliable tests.\nMaintained regression coverage.";
  const tips = [
    {
      type: "good" as const,
      tip: "Keep the concrete outcome",
      explanation: "The source supports this observation.",
      quote,
    },
    {
      type: "improve" as const,
      tip: "Clarify the scope",
      explanation: "Confirm the scope before adding detail.",
      quote: "Maintained regression coverage.",
    },
    {
      type: "improve" as const,
      tip: "Uncited proposal",
      explanation: "Hidden without a citation.",
    },
  ];
  render(
    <CitedWritingSuggestions
      feedback={{
        toneAndStyle: { tips },
        content: { tips: [] },
        structure: { tips: [] },
        skills: { tips: [] },
      }}
    />,
  );
  const group = screen.getByRole("region", { name: "Tone and style" });
  expect(
    within(group).getByRole("heading", {
      name: "Keep the concrete outcome",
      level: 4,
    }),
  ).toBeTruthy();
  expect(within(group).getByText("Strength to keep")).toBeTruthy();
  expect(within(group).getByText("Suggested change")).toBeTruthy();
  expect(group.querySelector("blockquote")?.textContent).toBe(quote);
  expect(within(group).getByText("2 cited notes")).toBeTruthy();
  expect(screen.queryByText("Uncited proposal")).toBeNull();
  expect(screen.getByText("Qualitative ratings are unavailable.")).toBeTruthy();
});

it("explains empty groups and omits whitespace-only citations", () => {
  const area = {
    tips: [
      {
        type: "improve" as const,
        tip: "Do not display",
        explanation: "No source",
        quote: " \n ",
      },
    ],
  };
  render(
    <CitedWritingSuggestions
      feedback={{
        toneAndStyle: area,
        content: area,
        structure: area,
        skills: area,
      }}
    />,
  );
  expect(
    screen.getAllByText("No cited suggestions for this area."),
  ).toHaveLength(4);
  expect(screen.queryByText("Do not display")).toBeNull();
});
