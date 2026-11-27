import { describe, expect, it } from "vitest";
import {
  assertEvidenceGrounded,
  matchRequirements,
} from "../../app/lib/server/matching/requirements";

const NOW = new Date("2026-11-26T00:00:00Z");
const run = (jd: string, resume: string) =>
  matchRequirements({ jobDescription: jd, resumeText: resume, now: NOW });
const phrases = (
  jd: string,
  resume = "Engineer, Example Corp, Jan 2020 - Present\n- Built things",
) => run(jd, resume).requirements.map((r) => `${r.kind}:${r.phrase}`);

describe("R-01 the subject of a years line is part of the years item", () => {
  it("yields one item for '3+ years of software development experience'", () => {
    expect(
      phrases("Requirements\n- 3+ years of software development experience"),
    ).toEqual(["years:3+ years"]);
  });
  it("is missing, with the reason, when the subject is not on the resume", () => {
    const [item] = run(
      "Requirements\n- 5+ years of enterprise sales experience",
      "Engineer, Example Corp, Jan 2015 - Present\n- Built APIs",
    ).requirements;
    expect(item.state).toBe("missing");
    expect(item.detail).toMatch(/enterprise sales was not found/);
  });
  it("keeps the old reading for lists and exclusions", () => {
    expect(
      phrases(
        "Requirements\n- 3+ years of non-internship software development experience",
      ).join(),
    ).toMatch(/phrase:.*software development/);
  });
  it("keeps named skills as per-skill years", () => {
    expect(phrases("Requirements\n- 4+ years of Python")).toEqual([
      "years:4+ years",
      "skill:Python",
    ]);
  });
});

describe("R-02 the degree field is part of the degree item", () => {
  it("yields one item for 'Bachelor's degree in Computer Science or a related field'", () => {
    expect(
      phrases(
        "Requirements\n- Bachelor's degree in Computer Science or a related field",
      ),
    ).toEqual(["degree:Bachelor's degree"]);
  });
});

describe("R-03 evidence must match the resume text", () => {
  it("reports no downgrades for ordinary matches", () => {
    const r = run(
      "Requirements\n- Experience with Docker\n- Bachelor's degree",
      "B.S. Physics\nDocker",
    );
    expect(r.integrity.downgraded).toBe(0);
  });
  it("shows a tampered or evidence-less 'met' item as not checked, never as found", () => {
    const r = run("Requirements\n- Experience with Docker", "Docker");
    const tampered = structuredClone(r.requirements);
    tampered[0].resumeEvidence[0].text = "Kubernetes";
    expect(assertEvidenceGrounded(tampered, "Docker")).toEqual({
      downgraded: 1,
    });
    expect(tampered[0].state).toBe("not_evaluated");
    const empty = structuredClone(r.requirements);
    empty[0].resumeEvidence = [];
    expect(assertEvidenceGrounded(empty, "Docker")).toEqual({ downgraded: 1 });
  });
});

describe("R-04 responsibility lines do not create junk phrases", () => {
  it("drops the leading verb and ignores responsibilities", () => {
    const list = phrases(
      "Requirements\n- Ability to write unit and integration tests\nResponsibilities\n- Build scalable data pipelines",
    );
    expect(list.join()).not.toMatch(/Write unit/);
    expect(list.join()).not.toMatch(/data pipelines/);
  });
  it("does not treat 'written' as the verb 'write'", () => {
    expect(phrases("Requirements\n- Excellent written communication")).toEqual([
      "soft:written communication",
    ]);
  });
});

describe("R-05 internships are counted and disclosed", () => {
  it("says how much of the experience was internships", () => {
    const [item] = run(
      "Requirements\n- 1+ years of experience",
      "Experience\nSoftware Engineer Intern, Example Corp, Jan 2025 - Jun 2025\n- Built tools.\nEngineer, Sample Co, Jan 2024 - Dec 2024\n- Built APIs.",
    ).requirements;
    expect(item.state).toBe("met");
    expect(item.detail).toMatch(/including 0\.5 years of internships/);
  });
  it("adds no note when there are no internships", () => {
    const [item] = run(
      "Requirements\n- 1+ years of experience",
      "Experience\nEngineer, Sample Co, Jan 2024 - Dec 2024\n- Built APIs.",
    ).requirements;
    expect(item.detail).not.toMatch(/internship/);
  });
});
