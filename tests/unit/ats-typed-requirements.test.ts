import { describe, expect, it } from "vitest";
import { matchRequirements } from "../../app/lib/server/matching/requirements";
import {
  alignTitle,
  titleFamily,
  titleSeniority,
} from "../../app/lib/server/matching/titles";
import { parseResumeStructure } from "../../app/lib/server/matching/roles";

const NOW = new Date(Date.UTC(2026, 10, 25));
const run = (jd: string, resume: string) =>
  matchRequirements({ jobDescription: jd, resumeText: resume, now: NOW });
const find = (r: ReturnType<typeof run>, phrase: string) =>
  r.requirements.find((q) => q.phrase.toLowerCase() === phrase.toLowerCase());

describe("years of experience (ATS-09)", () => {
  const resume =
    "Experience\nSoftware Engineer, A Corp, Jan 2019 - Dec 2024\nBuilt Python services.\nEngineer, B Corp, 2021 - 2023\nWrote Java.\nSkills\nGo";
  it("counts overall years from dated roles with overlaps merged", () => {
    expect(
      find(run("Requirements\n5+ years of experience.", resume), "5+ years"),
    ).toMatchObject({ state: "met" });
    expect(
      find(run("Requirements\n8+ years of experience.", resume), "8+ years"),
    ).toMatchObject({ state: "partial" });
  });
  it("counts per-skill years only inside dated roles", () => {
    expect(
      find(
        run("Requirements\n5 years of experience with Python.", resume),
        "5+ years",
      )?.state,
    ).toBe("met");
    expect(
      find(
        run("Requirements\n3 years of experience with Java.", resume),
        "3+ years",
      )?.state,
    ).toBe("met");
    expect(
      find(
        run("Requirements\n5 years of experience with Java.", resume),
        "5+ years",
      )?.state,
    ).toBe("partial");
  });
  it("does not count a skill that only appears in a skills list", () => {
    const r = find(
      run("Requirements\n3 years of experience with Go.", resume),
      "3+ years",
    );
    expect(r?.state).toBe("partial");
    expect(r?.detail).toMatch(/not inside a dated role/);
  });
  it("is missing when the skill never appears, and not_evaluated without dated roles", () => {
    expect(
      find(
        run("Requirements\n3 years of experience with Rust.", resume),
        "3+ years",
      )?.state,
    ).toBe("missing");
    expect(
      find(
        run("Requirements\n3 years of experience.", "Experience\nBuilt things"),
        "3+ years",
      )?.state,
    ).toBe("not_evaluated");
  });
  it("reports the years it found", () => {
    expect(
      find(run("Requirements\n5+ years of experience.", resume), "5+ years")
        ?.detail,
    ).toMatch(/^6\.0 years found/);
  });
  it("is reproducible for a fixed date and treats Present as that date", () => {
    const r = run(
      "Requirements\n5+ years of experience.",
      "Experience\nEngineer, A, Jan 2020 - Present",
    );
    expect(find(r, "5+ years")?.state).toBe("met");
    expect(r.asOf).toBe("2026-11-25");
  });
});

describe("degree level and field (ATS-10)", () => {
  it("meets a degree in the named field and downgrades a different field", () => {
    const jd = "Requirements\nBachelor's degree in Computer Science.";
    expect(
      find(
        run(jd, "Education\nB.S. Computer Science, State U, 2018"),
        "Bachelor's degree",
      )?.state,
    ).toBe("met");
    const art = find(
      run(jd, "Education\nB.A. Visual Arts, State U, 2018"),
      "Bachelor's degree",
    );
    expect(art?.state).toBe("partial");
    expect(art?.detail).toMatch(/not in the named field/);
  });
  it("accepts any field when the posting says related or equivalent", () => {
    expect(
      find(
        run(
          "Requirements\nBachelor's degree in Computer Science or a related field.",
          "Education\nB.S. Information Systems, 2018",
        ),
        "Bachelor's degree",
      )?.state,
    ).toBe("met");
  });
  it("accepts a higher degree, and lets the first named field of several satisfy it", () => {
    expect(
      find(
        run(
          "Requirements\nBachelor's degree in statistics, mathematics or economics.",
          "Education\nM.S. Mathematics, 2019",
        ),
        "Bachelor's degree",
      )?.state,
    ).toBe("met");
  });
});

describe("title alignment (ATS-11)", () => {
  const roles = (text: string) => parseResumeStructure(text, NOW).roles;
  it("recognises families and seniority", () => {
    expect(titleFamily("Software Development Engineer II")).toBe(
      "software-engineering",
    );
    expect(titleFamily("Site Reliability Engineer")).toBe("devops-sre");
    expect(titleFamily("Sales Manager")).toBe("sales");
    expect(titleSeniority("Senior Software Engineer")).toBe(3);
    expect(titleSeniority("Staff Engineer")).toBe(4);
    expect(titleSeniority("Software Engineer II")).toBe(2);
  });
  it("aligns equivalent titles and reports seniority", () => {
    const r = alignTitle(
      "Software Engineer II\nRequirements\nPython",
      roles("Experience\nSoftware Engineer II, A, 2020 - 2025"),
    );
    expect(r).toMatchObject({
      alignment: "aligned",
      jdFamily: "software-engineering",
      seniority: "at",
    });
  });
  it("marks adjacent and different families, and unknown without a title", () => {
    expect(
      alignTitle(
        "Site Reliability Engineer",
        roles("Experience\nSoftware Engineer, A, 2020 - 2025"),
      ).alignment,
    ).toBe("adjacent");
    expect(
      alignTitle(
        "Software Engineer",
        roles("Experience\nSales Manager, A, 2020 - 2025"),
      ).alignment,
    ).toBe("different");
    expect(
      alignTitle(
        "Requirements\nPython",
        roles("Experience\nSoftware Engineer, A, 2020 - 2025"),
      ).alignment,
    ).toBe("unknown");
  });
  it("reads a labelled title and reports below-level seniority", () => {
    const r = alignTitle(
      "About us\nTitle: Senior Software Engineer\nRequirements",
      roles("Experience\nSoftware Engineer, A, 2023 - 2025"),
    );
    expect(r).toMatchObject({ alignment: "aligned", seniority: "below" });
  });
});

describe("application checks and evidence context (ATS-12)", () => {
  const jd = `Senior Software Engineer
Location: Hybrid, 3 days in office in Austin, TX.
Requirements
Experience with Kubernetes.
Must be authorized to work in the United States; we cannot offer visa sponsorship.
Willingness to relocate and travel up to 25%.`;
  const result = run(jd, "x");
  it("lists location, authorization, relocation and travel without scoring them", () => {
    const kinds = result.applicationChecks.map((c) => c.kind);
    for (const kind of ["location", "authorization", "relocation", "travel"])
      expect(kinds).toContain(kind);
    expect(
      result.applicationChecks.every((c) => c.text.length > 0 && c.line > 0),
    ).toBe(true);
  });
  it("does not turn application lines into requirements", () => {
    const phrases = result.requirements.map((r) => r.phrase.toLowerCase());
    for (const noise of [
      "authorized",
      "visa sponsorship",
      "relocate",
      "hybrid",
    ])
      expect(phrases.join("|")).not.toContain(noise);
    expect(find(result, "Kubernetes")).toBeDefined();
  });
  it("ranks evidence in a dated role above a skills-list mention and reports recency", () => {
    const resume =
      "Skills\nKubernetes, Python\nExperience\nEngineer, A, 2019 - 2022\nOperated Python services.";
    const r = run(
      "Requirements\nExperience with Kubernetes and Python.",
      resume,
    );
    expect(find(r, "Kubernetes")).toMatchObject({
      state: "met",
      context: "skills_list",
      lastYear: null,
    });
    expect(find(r, "Python")).toMatchObject({
      state: "met",
      context: "role",
      lastYear: 2022,
    });
  });
  it("lets class evidence satisfy a broad skill (digital marketing)", () => {
    const r = run(
      "Requirements\n3+ years of experience in digital marketing.",
      "Experience\nMarketing Manager, A, 2019 - 2025\nLed SEO programs.",
    );
    expect(find(r, "3+ years")?.state).toBe("met");
    expect(find(r, "Digital marketing")?.state).toBe("met");
  });
});
