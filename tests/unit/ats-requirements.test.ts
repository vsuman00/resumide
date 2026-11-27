import { describe, expect, it } from "vitest";
import {
  matchRequirements,
  MAX_REQUIREMENTS,
  toLegacyCoverage,
} from "../../app/lib/server/matching/requirements";

const run = (jd: string, resume: string) =>
  matchRequirements({ jobDescription: jd, resumeText: resume }).requirements;
const find = (list: ReturnType<typeof run>, phrase: string) =>
  list.find((r) => r.phrase.toLowerCase() === phrase.toLowerCase());

describe("requirement extraction (ATS-04)", () => {
  const jd = `Minimum qualifications
Bachelor's degree in Computer Science or equivalent practical experience.
5 years of experience with software development in one or more programming languages, and with data structures/algorithms.
Preferred qualifications
Experience with large language models (LLMs) and machine learning infrastructure.
Responsibilities
Manage project priorities and deliverables.`;
  const list = run(jd, "x");
  it("never turns filler words into requirements", () => {
    for (const noise of [
      "one",
      "more",
      "equivalent",
      "languages",
      "practical",
      "degree",
      "experience",
    ])
      expect(find(list, noise)).toBeUndefined();
  });
  it("keeps multi-word phrases whole and tags section and importance", () => {
    expect(find(list, "Data structures and algorithms")).toMatchObject({
      importance: "required",
      kind: "skill",
    });
    expect(find(list, "Large language models")).toMatchObject({
      importance: "preferred",
    });
    expect(find(list, "programming languages")).toMatchObject({
      importance: "required",
    });
    expect(find(list, "Project management")?.importance).toBe("contextual");
  });
  it("types years and degree requirements", () => {
    expect(find(list, "5+ years")).toMatchObject({
      kind: "years",
      state: "not_evaluated",
    });
    expect(find(list, "Bachelor's degree")).toMatchObject({
      kind: "degree",
      importance: "required",
    });
  });
  it("has no 20-term cap but bounds the total and says so", () => {
    const many =
      "Requirements\n" +
      Array.from(
        { length: 200 },
        (_, i) => `Experience with alpha${i} beta${i}.`,
      ).join("\n");
    const result = matchRequirements({ jobDescription: many, resumeText: "x" });
    expect(result.requirements.length).toBe(MAX_REQUIREMENTS);
    expect(result.truncated).toBe(true);
  });
  it("treats a requirement in two sections once, at the higher importance", () => {
    const both = run(
      "Preferred qualifications\nExperience with Kubernetes.\nRequirements\nExperience with Kubernetes.",
      "Kubernetes",
    );
    const k = both.filter((r) => r.phrase === "Kubernetes");
    expect(k).toHaveLength(1);
    expect(k[0].importance).toBe("required");
  });
  it("drops lines that say a thing is not required and marks nice-to-haves preferred", () => {
    const l = run(
      "Requirements\nPython experience.\nKubernetes is not required.\nExperience with Terraform is a plus.",
      "x",
    );
    expect(find(l, "Kubernetes")).toBeUndefined();
    expect(find(l, "Terraform")?.importance).toBe("preferred");
  });
  it("accepts plural and singular section headings", () => {
    for (const heading of [
      "Requirements",
      "Requirement",
      "Qualifications",
      "Minimum qualifications",
      "Basic Qualifications:",
    ])
      expect(
        find(run(`${heading}\nExperience with Docker.`, "x"), "Docker")
          ?.importance,
      ).toBe("required");
  });
});

describe("requirement matching (ATS-05)", () => {
  const jd =
    "Requirements\nExperience with Kubernetes and Google Cloud Platform.\nBachelor's degree in Computer Science or related field.";
  it("matches acronyms and aliases, with evidence and offsets", () => {
    const resume = "Ran workloads on K8s and GCP.\nB.S. Computer Science";
    const list = run(jd, resume);
    const k8s = find(list, "Kubernetes")!;
    expect(k8s.state).toBe("met");
    expect(
      resume.slice(k8s.resumeEvidence[0].start, k8s.resumeEvidence[0].end),
    ).toBe("K8s");
    expect(find(list, "Google Cloud Platform")?.state).toBe("met");
    expect(find(list, "Bachelor's degree")?.state).toBe("met");
  });
  it("matches word forms and plurals", () => {
    const list = run(
      "Requirements\nExperience with distributed systems and mentoring engineers.",
      "Built a distributed system; mentored engineers.",
    );
    expect(list.every((r) => r.state === "met")).toBe(true);
  });
  it("reports missing and uses the highest degree level", () => {
    expect(find(run(jd, "Nothing relevant"), "Kubernetes")?.state).toBe(
      "missing",
    );
    expect(
      find(
        run(
          "Requirements\nMaster's degree in Computer Science.",
          "B.S. Computer Science",
        ),
        "Master's degree",
      )?.state,
    ).toBe("missing");
    expect(
      find(
        run("Requirements\nBachelor's degree.", "Ph.D. Physics"),
        "Bachelor's degree",
      )?.state,
    ).toBe("met");
  });
  it("lets 'or equivalent experience' soften a missing degree to partial", () => {
    const r = find(
      run(
        "Requirements\nBachelor's degree or equivalent practical experience.",
        "Self-taught engineer",
      ),
      "Bachelor's degree",
    );
    expect(r?.state).toBe("partial");
  });
  it("treats alternatives as one: a met option satisfies the rest", () => {
    const list = run(
      "Requirements\nExperience with Java, C++, or C#.",
      "Wrote Java services.",
    );
    expect(list.map((r) => r.state)).toEqual(["met", "met", "met"]);
    expect(find(list, "C++")?.satisfiedBy).toBe("Java");
    const none = run(
      "Requirements\nExperience with Java, C++, or C#.",
      "Sold shoes.",
    );
    expect(none.every((r) => r.state === "missing")).toBe(true);
  });
  it("treats a class phrase as met by any member", () => {
    expect(
      find(
        run(
          "Requirements\nExperience with programming languages.",
          "Services in Rust.",
        ),
        "programming languages",
      )?.state,
    ).toBe("met");
  });
  it("does not match the verb 'go' as the Go language", () => {
    expect(
      find(
        run(
          "Requirements\nProduction services in Go.",
          "A go-getter who helps customers go further.",
        ),
        "Go",
      )?.state,
    ).toBe("missing");
    expect(
      find(
        run(
          "Requirements\nProduction services in Go.",
          "Built services in Go and Rust.",
        ),
        "Go",
      )?.state,
    ).toBe("met");
  });
  it("keeps soft skills and unscored years out of coverage", () => {
    const result = matchRequirements({
      jobDescription:
        "Requirements\n5 years of experience.\nExcellent written communication.\nExperience with Docker.",
      resumeText: "Docker",
    });
    const legacy = toLegacyCoverage(result);
    expect(legacy.terms).toEqual(["Docker"]);
    expect(find(result.requirements, "written communication")?.state).toBe(
      "not_evaluated",
    );
  });
  it("scores required coverage only when required items exist, so preferred cannot hide a gap", () => {
    const result = matchRequirements({
      jobDescription:
        "Requirements\nExperience with Kubernetes.\nPreferred qualifications\nExperience with Docker and Terraform and Git.",
      resumeText: "Docker Terraform Git",
    });
    const legacy = toLegacyCoverage(result);
    expect(legacy.terms).toEqual(["Kubernetes"]);
    expect(legacy.missing).toEqual(["Kubernetes"]);
  });
  it("records matcher, vocabulary and normalizer versions", () => {
    const r = matchRequirements({
      jobDescription: "Requirements\nDocker",
      resumeText: "Docker",
    });
    expect(r.matcherVersion).toMatch(/^requirement-matcher\//);
    expect(r.vocabularyVersion).toMatch(/^match-vocabulary\//);
    expect(r.normalizerVersion).toMatch(/^match-normalizer\//);
  });
  it("is deterministic", () => {
    const a = JSON.stringify(run(jd, "K8s GCP"));
    expect(JSON.stringify(run(jd, "K8s GCP"))).toBe(a);
  });
});

describe("alternatives are never reported as found (live-page defect 2026-11-26)", () => {
  const result = matchRequirements({
    jobDescription:
      "Requirements\n- Experience with AWS, Terraform or Google Cloud\n- Experience with GraphQL",
    resumeText:
      "Engineer, Example Corp, Jan 2020 - Present\n- Ran services on AWS.",
  });
  it("lists only the option that was found, not the ones it stood in for", () => {
    const legacy = toLegacyCoverage(result);
    expect(legacy.matched).toEqual(["AWS"]);
    expect(legacy.matched).not.toContain("Terraform");
    expect(legacy.missing).toEqual(["GraphQL"]);
    expect(legacy.evidence.map((e) => e.term)).not.toContain("Terraform");
  });
  it("lists every option as missing when none is found", () => {
    const none = toLegacyCoverage(
      matchRequirements({
        jobDescription:
          "Requirements\n- Experience with AWS, Terraform or Google Cloud",
        resumeText:
          "Engineer, Example Corp, Jan 2020 - Present\n- Wrote Python.",
      }),
    );
    expect(none.matched).toEqual([]);
    expect(none.missing.length).toBe(3);
  });
});

describe("phrase requirements need the words in order (live-page defect 2026-11-26)", () => {
  const jd = "Requirements\n- Experience in vendor contract negotiation";
  const state = (resume: string) =>
    matchRequirements({
      jobDescription: jd,
      resumeText: resume,
    }).requirements.find((r) => r.kind === "phrase")?.state;
  it("is met when the words appear in order, with small gaps allowed", () => {
    expect(state("Led vendor contract negotiation for a retailer.")).toBe(
      "met",
    );
    expect(state("Ran vendor and supplier contract negotiation.")).toBe("met");
  });
  it("is only partial when the words are on one line out of order", () => {
    expect(state("Negotiation course; Contract award; Vendor list.")).toBe(
      "partial",
    );
  });
  it("is missing when a word is absent", () => {
    expect(state("Led vendor negotiation.")).toBe("missing");
  });
});
