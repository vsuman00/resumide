/** @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SavedScoreContext from "../../app/components/SavedScoreContext";
afterEach(cleanup);
it("keeps provenance in a closed disclosure and explains numeric limitations", () => {
  render(
    <SavedScoreContext
      createdAt="2026-10-30T19:02:59.650484+00:00"
      scoringVersion="ats-rules-v3"
      modelRatingsExcluded
    />,
  );
  const disclosure = document.querySelector("details")!;
  expect(disclosure.open).toBe(false);
  expect(
    screen.getByText(/not a percentage of job requirements met/),
  ).toBeTruthy();
  expect(
    screen.getByText(/AI writing feedback did not change the number/),
  ).toBeTruthy();
  expect(screen.getByText("ats-rules-v3")).toBeTruthy();
  const time = document.querySelector("time")!;
  expect(time.getAttribute("datetime")).toBe(
    "2026-10-30T19:02:59.650484+00:00",
  );
  expect(time.textContent).toContain("31 Oct 2026");
  expect(time.textContent).toContain("IST");
});
it("handles unavailable dates and preserves the older blended-method explanation", () => {
  render(
    <SavedScoreContext createdAt="invalid" modelRatingsExcluded={false} />,
  );
  expect(screen.getByText("Date unavailable")).toBeTruthy();
  expect(screen.getByText("Not recorded")).toBeTruthy();
  expect(
    screen.getByText(/combined resume checks and AI ratings/),
  ).toBeTruthy();
  expect(document.querySelector("time")).toBeNull();
});
