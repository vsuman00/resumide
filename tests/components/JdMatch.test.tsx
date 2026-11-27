/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JdMatchPanel, ParsedProfile, TwoResults } from "~/components/JdMatch";
import { buildAtsReport, summarize } from "~/lib/ats-report";
import {
  type AnalysisResultZod,
  TypedCoverageSchema,
} from "~/lib/server/schema";
import { scoreExtractedResume } from "~/lib/server/scoring-stage";

afterEach(cleanup);

const jd = `Senior Software Engineer
Location: Hybrid, 3 days in office in Austin, TX.
Minimum qualifications
Bachelor's degree in Computer Science or equivalent practical experience.
5+ years of experience with Python.
Experience with Kubernetes and Terraform.
Excellent written communication.
Preferred qualifications
Master's degree in Computer Science.
Must be authorized to work in the United States.`;
const resume = `Alex Example
alex@example.com 555 010 0100
Skills
Terraform
Experience
Software Engineer, Example Corp, Jan 2019 - Dec 2024
Built Python services on Kubernetes.
Education
B.S. Computer Science, State University, 2018`;
const stored = scoreExtractedResume({
  text: resume,
  pageCount: 1,
  jobDescription: jd,
  textChecksum: "x",
  matcher: "v2",
});
const typed = TypedCoverageSchema.parse(stored.keywordCoverage.typed);
// Only the fields the report reads; the full page result is validated elsewhere.
const asResult = (t: typeof typed) =>
  ({
    typed: t,
    ruleTrace: stored.ruleTrace,
    parseView: stored.parseView,
  }) as unknown as AnalysisResultZod;
const report = buildAtsReport(asResult(typed))!;
const contact = {
  name: "Alex Example",
  email: "alex@example.com",
  phone: "555 010 0100",
  location: null,
};

describe("stored typed result", () => {
  it("round-trips through the page schema", () => {
    expect(typed.requirements.length).toBeGreaterThan(3);
    expect(typed.profile.roles).toHaveLength(1);
    expect(JSON.stringify(typed)).not.toContain("lineSections");
  });
});

describe("two results and the match panel (ATS-07, ATS-08)", () => {
  it("shows parse health and JD match separately, with no blended number", () => {
    render(<TwoResults report={report} />);
    const group = screen.getByRole("group", { name: "Your two results" });
    expect(
      within(group).getByRole("heading", { name: "Parse health" }),
    ).toBeTruthy();
    expect(
      within(group).getByRole("heading", { name: "JD match" }),
    ).toBeTruthy();
    expect(group.textContent).toMatch(/\d+ of \d+ checks pass/);
    expect(group.textContent).toMatch(/\d+ of \d+ minimum qualifications met/);
    expect(group.textContent).not.toMatch(/\/100/);
  });
  it("lists minimum qualifications first with missing items on top and evidence for met ones", () => {
    render(<JdMatchPanel report={report} />);
    expect(
      screen.getByRole("heading", { name: "Minimum qualifications" }),
    ).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    const firstMinimum = items[0].textContent ?? "";
    expect(firstMinimum).toMatch(/Not found|Partly met|Not checked/);
    expect(screen.getByText("Kubernetes").closest("li")?.textContent).toMatch(
      /Met.*Found: .*Kubernetes/s,
    );
    const bachelor = screen.getByText("Bachelor's degree").closest("li");
    expect(bachelor?.textContent).toMatch(/Met/);
  });
  it("explains years found and the skills-list-only case", () => {
    render(<JdMatchPanel report={report} />);
    expect(screen.getByText("5+ years").closest("li")?.textContent).toMatch(
      /years found for the named skill|6\.0 years/,
    );
    expect(screen.getByText("Terraform").closest("li")?.textContent).toMatch(
      /only in your skills list/,
    );
  });
  it("keeps preferred items in their own list and application questions out of the result", () => {
    render(<JdMatchPanel report={report} />);
    expect(
      screen.getByRole("heading", { name: "Preferred qualifications" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Answer these in the application" }),
    ).toBeTruthy();
    expect(screen.getByText(/authorized to work/)).toBeTruthy();
    expect(screen.getByText(/never change your result/)).toBeTruthy();
  });
  it("shows title alignment as evidence only and states the guidance caveat", () => {
    render(<JdMatchPanel report={report} />);
    expect(screen.getByText(/shown as evidence only/)).toBeTruthy();
    expect(screen.getByText(/not an employer decision/)).toBeTruthy();
  });
  it("tells the user what to do when no minimum qualifications were found", () => {
    const empty = {
      ...typed,
      requirements: typed.requirements.filter(
        (r) => r.importance !== "required",
      ),
    };
    render(<JdMatchPanel report={buildAtsReport(asResult(empty))!} />);
    expect(screen.getByText(/Paste the full posting/)).toBeTruthy();
  });
});

describe("parsed profile (ATS-14)", () => {
  it("shows roles with dates and flags missing fields", () => {
    render(<ParsedProfile typed={typed} contact={contact} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Software Engineer")).toBeTruthy();
    expect(within(table).getByText("Example Corp")).toBeTruthy();
    expect(within(table).getByText(/Jan 2019 – Dec 2024/)).toBeTruthy();
    expect(screen.getByText("Location").nextSibling?.textContent).toBe(
      "Not found",
    );
    expect(screen.getByText(/B\.S\. Computer Science/)).toBeTruthy();
  });
  it("explains how to fix a resume with no dated roles", () => {
    const none = {
      ...typed,
      profile: { roles: [], education: [], totalMonths: null },
    };
    render(<ParsedProfile typed={none} contact={contact} />);
    expect(screen.getByText(/No dated roles were found/)).toBeTruthy();
    expect(screen.getByText(/No Education section/)).toBeTruthy();
  });
});

describe("summarize counts qualifications, not options", () => {
  type Item = Parameters<typeof summarize>[0][number];
  const item = (
    phrase: string,
    state: Item["state"],
    altGroup: string | null = null,
  ) =>
    ({
      phrase,
      kind: "skill",
      state,
      altGroup,
      importance: "required",
    }) as Item;
  it("counts 'A, B or C' once, as met when any option is met", () => {
    expect(
      summarize([
        item("AWS", "met", "g1"),
        item("Terraform", "met", "g1"),
        item("Google Cloud", "met", "g1"),
        item("GraphQL", "missing"),
      ]),
    ).toEqual({ total: 2, met: 1, partial: 0, missing: 1 });
  });
  it("counts a group with no option found as one missing item", () => {
    expect(
      summarize([
        item("AWS", "missing", "g1"),
        item("Terraform", "missing", "g1"),
      ]),
    ).toEqual({ total: 1, met: 0, partial: 0, missing: 1 });
  });
});
