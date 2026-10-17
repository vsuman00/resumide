/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import Heatmap from "../../app/components/Heatmap";
afterEach(cleanup);
it("does not present uncertain lexical occurrences as confirmed matches", () => {
  render(
    <Heatmap
      jdKeywords={["Python", "distributed systems", "SQL"]}
      matchedKeywords={["Python", "distributed systems"]}
      missingKeywords={["SQL"]}
      uncertainKeywords={["distributed systems"]}
    />,
  );
  expect(screen.getByText("1 found")).toBeTruthy();
  expect(screen.getByText("1 uncertain")).toBeTruthy();
  expect(screen.getByText("1 missing")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "33",
  );
  expect(screen.getByText("distributed systems").closest("li")?.className).toBe(
    "is-uncertain",
  );
});
