/** @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ATS from "../../app/components/ATS";
import Summary from "../../app/components/Summary";

afterEach(cleanup);
it("retains a saved 100 without describing it as strong or complete alignment", () => {
  render(<ATS score={100} suggestions={[]} />);
  expect(screen.getByText("100/100")).toBeDefined();
  expect(screen.getByText("Uncalibrated baseline")).toBeDefined();
  expect(screen.queryByText("Strong")).toBeNull();
  expect(
    screen.getByText(/not a percentage of job requirements met/),
  ).toBeDefined();
});
it("labels legacy category ratings without quality bands", () => {
  const category = { score: 100, tips: [] };
  render(
    <Summary
      feedback={{
        overallScore: 100,
        ATS: category,
        toneAndStyle: category,
        content: category,
        structure: category,
        skills: category,
      }}
    />,
  );
  expect(screen.getAllByText("Historical rating")).toHaveLength(5);
  expect(screen.queryByText("Strong")).toBeNull();
});
