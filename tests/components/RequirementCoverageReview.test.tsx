/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RequirementCoverageReview from "../../app/components/RequirementCoverageReview";
import { evaluateRequirementCoverage } from "../../app/lib/server/requirement-coverage";
import { createRequirementContextFixture } from "../fixtures/requirement-context";

afterEach(cleanup);
async function review(
  options: Parameters<typeof createRequirementContextFixture>[0] = {},
) {
  const fixture = await createRequirementContextFixture(options);
  const coverage = evaluateRequirementCoverage(fixture.context);
  if (coverage.state !== "available") throw Error("EXPECTED_ACTUAL_COVERAGE");
  const view = render(
    <RequirementCoverageReview
      coverage={coverage}
      analysisId={fixture.owned.analysisId}
    />,
  );
  return { fixture, coverage, ...view };
}

describe("read-only typed requirement review", () => {
  it("renders actual source support with pinned versions, citation and policy identities", async () => {
    const { fixture, coverage, container } = await review({ confirm: true });
    expect(
      screen.getByRole("heading", { name: "Job requirement review" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Source contribution claim: PostgreSQL",
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Bounded support observed/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Every requirement remains unevaluated/),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/not independently verified/).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("link", { name: "Open pinned resume version" })
        .getAttribute("href"),
    ).toBe(
      `/analysis/${fixture.owned.analysisId}/canonical?version=${fixture.context.canonical.versionId}`,
    );
    expect(
      screen
        .getByRole("link", { name: "Open pinned job requirements" })
        .getAttribute("href"),
    ).toContain(fixture.context.requirements.versionId);
    expect(container.textContent).toContain(coverage.digest);
    expect(container.textContent).toContain(coverage.policy.sha256);
    expect(container.textContent).toContain(coverage.policy.semanticSha256);
    expect(container.textContent).toContain(coverage.policy.durationSha256);
    expect(container.textContent).toContain(
      coverage.policy.durationSubjectSha256,
    );
    expect(
      screen.getAllByText("Observed text in this pinned resume version:")
        .length,
    ).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("Earlier resume version:");
    for (const citation of coverage.witnesses.flatMap(
      (w) => w.currentSourceCitations,
    )) {
      expect(
        container.querySelector(
          `a[href="/analysis/${fixture.owned.analysisId}/evidence#source-${citation.spanId}"]`,
        ),
      ).toBeTruthy();
      expect(container.textContent).toContain(citation.attemptId);
    }
    expect(
      container.querySelectorAll("form,button,input,textarea").length,
    ).toBe(0);
  });

  it("keeps an owner declaration distinct from its earlier observed source", async () => {
    const { fixture, container } = await review({
      edit: "Responsible for services using PostgreSQL",
      confirm: true,
    });
    expect(
      screen.getByRole("heading", {
        name: "Candidate responsibility declaration: PostgreSQL",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Basis: your recorded declaration, not independent source support.",
      ),
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "do not need to repeat that confirmation",
    );
    expect(container.textContent).toContain(
      "This earlier quote does not support newly declared text",
    );
    expect(container.textContent).toContain(fixture.original.versionId);
    expect(
      screen.queryByText(/Current source claim needs confirmation/),
    ).toBeNull();
  });

  it("labels listed skills without promoting them to contribution or proficiency", async () => {
    const { container } = await review({
      clauses: ["Built services using Python"],
      skill: "PostgreSQL",
      requiredSkill: "PostgreSQL",
      confirm: true,
    });
    expect(
      screen.getByRole("heading", { name: "Listed skill: PostgreSQL" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Source contribution claim: PostgreSQL",
      }),
    ).toBeNull();
    expect(container.textContent).toContain(
      "A listing alone does not establish contribution, proficiency or skill-specific duration",
    );
  });

  it("retains zero-mapped clauses and unknown interpretation without judging qualifications", async () => {
    const { coverage, container } = await review({
      jdText:
        "Requirements\nMust have experience with ZephyrCircuit\nPython and PostgreSQL or Java required",
    });
    const retained = screen.getByRole("region", {
      name: "Preserved uninterpreted clauses",
    });
    expect(
      within(retained).getByText("Must have experience with ZephyrCircuit"),
    ).toBeTruthy();
    expect(retained.textContent).toContain("0 mapped requirement record(s)");
    expect(
      coverage.retainedClauses.some((c) => c.requirementIds.length === 0),
    ).toBe(true);
    expect(container.textContent).toContain(
      "The clause interpretation remains unknown",
    );
    expect(container.textContent).toContain(
      "does not mean you are unqualified",
    );
  });

  it("shows claimed calendar uncertainty and the limited scope of a fragment confirmation", async () => {
    const { container } = await review({
      clauses: [
        "Used Python from 2020-01-01 to 2022-01-01",
        "Built services using Python",
      ],
      skill: "Python",
      confirm: true,
      confirmClauses: [1],
      jdText: "Requirements\nMore than 2 years of Python experience required",
    });
    expect(
      screen.getByRole("heading", { name: "Dated skill-use claim: Python" }),
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "uncertain at the calendar or endpoint boundary",
    );
    expect(container.textContent).toContain(
      "The saved skill interpretation remains unresolved",
    );
    expect(container.textContent).toContain(
      "It does not change the saved job requirements",
    );
    expect(container.textContent).toContain("combining overlapping intervals");
    expect(container.textContent).toContain(
      "Source-reported interval: 2020-01-01 to 2022-01-01",
    );
    expect(container.textContent).toContain(
      "A confirmation of one fragment applies only to that current fact",
    );
    expect(container.textContent).toContain(
      "does not establish full-time work, proficiency or independent verification",
    );
  });

  it("states reference truncation counts from the actual bounded output", async () => {
    const { coverage } = await review({
      clauses: Array.from(
        { length: 24 },
        (_, index) => `Built service${index} using PostgreSQL`,
      ),
    });
    const operand = coverage.clauses[0].operands[0];
    expect(
      screen.getByText(
        `Showing 20 of ${operand.matchingWitnessCount} related claims; ${operand.additionalWitnessCount} additional claim references and ${operand.additionalFactCount} additional fact references are not displayed.`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Related resume claims" }).textContent,
    ).toContain(
      `${coverage.witnessCounts.additionalMatching} additional matching claims are not displayed`,
    );
  });

  it.each(["and", "or"])(
    "explains the actual %s relationship without an editing or confirmation control",
    async (connector) => {
      const { container } = await review({
        clauses: ["Built services using Python"],
        skill: "Python",
        confirm: true,
        jdText: `Requirements\nPython ${connector} PostgreSQL required`,
      });
      expect(container.textContent).toContain(
        connector === "and"
          ? "The listed skills are required together"
          : "The clause gives explicit alternatives",
      );
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();
    },
  );

  it("escapes actual retained JD text instead of interpreting markup", async () => {
    const quote =
      'Must have experience with <img src="synthetic" onerror="synthetic()">';
    const { container } = await review({ jdText: `Requirements\n${quote}` });
    expect(
      screen.getByRole("region", { name: "Preserved uninterpreted clauses" })
        .textContent,
    ).toContain(quote);
    expect(container.querySelectorAll("img,script").length).toBe(0);
  });

  it("shows an unavailable observation without inventing an empty success state", () => {
    const actual = evaluateRequirementCoverage(null);
    render(
      <RequirementCoverageReview
        coverage={actual}
        analysisId="synthetic-analysis"
      />,
    );
    expect(
      screen.getByText(/These requirement observations are unavailable/),
    ).toBeTruthy();
    expect(
      screen.getByText(/No conclusion about your qualifications/),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
