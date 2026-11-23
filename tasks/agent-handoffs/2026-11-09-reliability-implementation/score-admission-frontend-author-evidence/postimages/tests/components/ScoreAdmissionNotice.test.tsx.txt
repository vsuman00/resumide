/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import ScoreAdmissionNotice from "../../app/components/ScoreAdmissionNotice";
import { ScoreBlocker } from "../../app/lib/server/score-v2-contract";

const base = "/analysis/60000000-0000-4000-8000-000000000001";
const cases = [
  [
    "calibration_not_approved",
    /The service has not approved the scoring policy/u,
  ],
  ["coverage_policy_unknown", /minimum evidence coverage needed for a score/u],
  [
    "extraction_review_required",
    /Compare the recovered text with your source document/u,
  ],
  [
    "critical_evidence_missing",
    /Important resume information is missing, uncertain, or conflicting/u,
  ],
  ["unsupported_input", /outside the currently supported scoring scope/u],
  [
    "requirements_review_required",
    /required and preferred labels and their source quotes/u,
  ],
  ["job_description_missing", /No job description is available for this view/u],
] as const;
afterEach(cleanup);
function show(
  dimensionBlockers: readonly string[],
  readinessBlockers: readonly string[] = [],
  versions: { canonicalVersionId?: string; requirementVersionId?: string } = {},
) {
  return render(
    <MemoryRouter>
      <ScoreAdmissionNotice
        base={base}
        dimensions={[{ blockers: dimensionBlockers }]}
        readiness={{ blockers: readinessBlockers }}
        {...versions}
      />
    </MemoryRouter>,
  );
}

it("keeps historical review links bound to the selected input versions", () => {
  show(["critical_evidence_missing", "requirements_review_required"], [], {
    canonicalVersionId: "60000000-0000-4000-8000-000000000002",
    requirementVersionId: "60000000-0000-4000-8000-000000000003",
  });
  expect(
    screen.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual([
    `${base}/evidence`,
    `${base}/canonical?version=60000000-0000-4000-8000-000000000002`,
    `${base}/requirements?version=60000000-0000-4000-8000-000000000003`,
  ]);
});

it("keeps the missing-job-description review link unversioned without inventing a selected requirement", () => {
  show(["job_description_missing"], [], {
    canonicalVersionId: "60000000-0000-4000-8000-000000000002",
  });
  expect(
    screen.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual([`${base}/requirements`]);
});

it("covers the actual existing score blocker vocabulary", () => {
  expect(new Set(cases.map(([blocker]) => blocker))).toEqual(
    new Set(ScoreBlocker.options),
  );
});
it.each(cases)(
  "explains the observed %s blocker in plain language",
  (blocker, explanation) => {
    show([blocker]);
    expect(
      within(
        screen.getByRole("region", { name: "Why scores are unavailable" }),
      ).getByText(explanation),
    ).toBeTruthy();
  },
);
it("combines actual dimension and readiness blockers once without inventing other reasons", () => {
  show(
    [
      "calibration_not_approved",
      "critical_evidence_missing",
      "critical_evidence_missing",
    ],
    ["calibration_not_approved", "requirements_review_required"],
  );
  expect(screen.getAllByText(cases[0][1])).toHaveLength(1);
  expect(screen.getAllByText(cases[3][1])).toHaveLength(1);
  expect(screen.getByText(cases[5][1])).toBeTruthy();
  expect(screen.queryByText(cases[6][1])).toBeNull();
});
it("separates candidate review from service validation and offers only the supplied owned workspaces", () => {
  show(ScoreBlocker.options);
  const review = screen.getByRole("list", { name: "Checks you can review" });
  const service = screen.getByRole("list", {
    name: "Service validation checks",
  });
  expect(within(review).getByText(cases[2][1])).toBeTruthy();
  expect(within(service).getByText(cases[0][1])).toBeTruthy();
  expect(within(service).getByText(cases[1][1])).toBeTruthy();
  expect(within(service).queryByRole("link")).toBeNull();
  expect(
    screen.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual([`${base}/evidence`, `${base}/canonical`, `${base}/requirements`]);
  expect(
    screen.getByText(
      /Reviewing or confirming your inputs does not enable numerical scores/u,
    ),
  ).toBeTruthy();
});
it("does not suggest candidate actions can complete policy validation when review blockers are absent", () => {
  show(["calibration_not_approved", "coverage_policy_unknown"]);
  expect(
    screen.getByRole("heading", {
      name: "Service validation is still required",
    }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Review your inputs" }),
  ).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(
    screen.getByText(
      /Scoring-policy validation is a separate service responsibility/u,
    ),
  ).toBeTruthy();
});
it("provides a safe explanation for an unknown blocker without echoing its raw code", () => {
  const { container } = show(["future_unrecognized_check"]);
  expect(screen.getByText("Another scoring check is unresolved")).toBeTruthy();
  expect(container.textContent).not.toContain("future_unrecognized_check");
  expect(container.textContent).not.toContain("future unrecognized check");
  expect(screen.queryByRole("link")).toBeNull();
});
it("adds no inferred blockers or review controls when no blocker is supplied", () => {
  show([]);
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(cases[0][1])).toBeNull();
});
it("keeps review links keyboard accessible without a form, mutation or score output", async () => {
  const user = userEvent.setup();
  const { container } = show([
    "critical_evidence_missing",
    "requirements_review_required",
  ]);
  for (const name of [
    "Review source evidence",
    "Review structured resume",
    "Review job requirements",
  ]) {
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name }));
  }
  expect(container.querySelectorAll("form, input, button")).toHaveLength(0);
  expect(container.textContent).not.toMatch(
    /(?:score|coverage):\s*\d|\d+\s*\/\s*100|\d+%/iu,
  );
});
it("uses distinct heading labels when more than one notice is rendered", () => {
  render(
    <MemoryRouter>
      {[1, 2].map((key) => (
        <ScoreAdmissionNotice
          key={key}
          base={base}
          dimensions={[]}
          readiness={{ blockers: ["calibration_not_approved"] }}
        />
      ))}
    </MemoryRouter>,
  );
  const regions = screen.getAllByRole("region", {
    name: "Why scores are unavailable",
  });
  expect(regions).toHaveLength(2);
  expect(regions[0].getAttribute("aria-labelledby")).not.toBe(
    regions[1].getAttribute("aria-labelledby"),
  );
});
