import { describe, expect, it } from "vitest";
import {
  mergeMonths,
  parseResumeStructure,
} from "../../app/lib/server/matching/roles";

const NOW = new Date(Date.UTC(2026, 10, 25));
const ym = (y: number, m: number) => y * 12 + (m - 1);

describe("resume structure (ATS-09, ATS-14)", () => {
  it("parses title, employer and month-accurate ranges in common layouts", () => {
    const s = parseResumeStructure(
      [
        "Experience",
        "Software Engineer, Example Corp, Jan 2019 - Mar 2022",
        "Built services.",
        "Senior Engineer | Other Inc | 03/2022 – Present",
        "Led a team.",
        "Education",
        "B.S. Computer Science, State University, 2018",
      ].join("\n"),
      NOW,
    );
    expect(s.roles).toHaveLength(2);
    expect(s.roles[0]).toMatchObject({
      title: "Software Engineer",
      employer: "Example Corp",
      startMonth: ym(2019, 1),
      endMonth: ym(2022, 3),
      current: false,
    });
    expect(s.roles[1]).toMatchObject({
      title: "Senior Engineer",
      employer: "Other Inc",
      startMonth: ym(2022, 3),
      current: true,
      endMonth: ym(2026, 11),
    });
    expect(s.education).toEqual([
      {
        text: "B.S. Computer Science, State University, 2018",
        line: 7,
        year: 2018,
      },
    ]);
    expect(s.lineSections[1]).toBe("experience");
  });
  it("takes the title from the line above when the date sits alone", () => {
    const s = parseResumeStructure(
      "Experience\nData Analyst, Example Co\n2020 - 2023",
      NOW,
    );
    expect(s.roles[0]).toMatchObject({
      title: "Data Analyst",
      employer: "Example Co",
    });
  });
  it("does not count education dates as experience", () => {
    const s = parseResumeStructure("Education\nB.S. Physics 2014 - 2018", NOW);
    expect(s.roles).toHaveLength(0);
    expect(s.totalMonths).toBeNull();
  });
  it("merges overlapping roles instead of double counting", () => {
    expect(
      mergeMonths([
        [ym(2019, 1), ym(2021, 12)],
        [ym(2021, 1), ym(2022, 12)],
      ]),
    ).toBe(48);
    const s = parseResumeStructure(
      "Experience\nEngineer, A, 2019 - 2021\nConsultant, B, 2020 - 2022",
      NOW,
    );
    expect(s.totalMonths).toBe(48);
  });
  it("ignores ranges that end before they start or are implausible", () => {
    expect(
      parseResumeStructure("Experience\nEngineer, A, 2022 - 2019", NOW).roles,
    ).toHaveLength(0);
    expect(
      parseResumeStructure("Experience\nEngineer, A, 1850 - 1900", NOW).roles,
    ).toHaveLength(0);
  });
  it("sets each role's line span up to the next role or heading", () => {
    const s = parseResumeStructure(
      "Experience\nEngineer, A, 2019 - 2021\nBuilt X.\nBuilt Y.\nEngineer, B, 2021 - 2023\nBuilt Z.\nSkills\nPython",
      NOW,
    );
    expect(s.roles.map((r) => [r.lineStart, r.lineEnd])).toEqual([
      [2, 4],
      [5, 6],
    ]);
  });
});

describe("role and education parsing defects found in live testing (2026-11-26)", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  it("reads 'Employer, Title' and 'Employer, Note, Title' with the role as the title", () => {
    const s = parseResumeStructure(
      "Experience\nExample Corp, Data Engineer (Contract) Jan 2022 – Dec 2023\n- Built pipelines.\nIndependent, Remote, Backend Developer Feb 2024 – Present\n- Built APIs.",
      now,
    );
    expect(s.roles.map((r) => [r.title, r.employer])).toEqual([
      ["Data Engineer Contract", "Example Corp"],
      ["Backend Developer", "Independent"],
    ]);
  });
  it("keeps 'Title, Employer' unchanged", () => {
    const s = parseResumeStructure(
      "Experience\nData Engineer, Example Corp, Jan 2022 – Dec 2023\n- Built pipelines.",
      now,
    );
    expect([s.roles[0].title, s.roles[0].employer]).toEqual([
      "Data Engineer",
      "Example Corp",
    ]);
  });
  it("keeps only degree and institution lines as education entries", () => {
    const s = parseResumeStructure(
      "Education\nState University, Springfield 2015 – 2019\nB.S. in Physics GPA 3.6\nRelevant coursework: Optics, Mechanics\nHonors: Dean's list",
      now,
    );
    expect(s.education.map((e) => e.text)).toEqual([
      "State University, Springfield 2015 – 2019",
      "B.S. in Physics GPA 3.6",
    ]);
  });
});
