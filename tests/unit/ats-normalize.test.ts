import { describe, expect, it } from "vitest";
import {
  normalizeTerm,
  stem,
  tokenize,
} from "../../app/lib/server/matching/normalize";

describe("match normalizer (ATS-02)", () => {
  it.each([
    ["designed", "designing", "design"],
    ["developed", "development", "developing"],
    ["LLMs", "LLM"],
    ["mapping", "mapped", "map"],
    ["managed", "managing", "management"],
    ["mentored", "mentoring"],
    ["engineers", "engineer"],
    ["built", "building", "build"],
    ["led", "leading", "lead"],
    ["algorithms", "algorithm"],
    ["libraries", "library"],
    ["languages", "language"],
    ["databases", "database"],
    ["systems", "system"],
  ])("treats %s and its forms as one stem", (...forms) => {
    const stems = new Set(forms.map((form) => normalizeTerm(form)));
    expect(stems.size).toBe(1);
  });
  it.each(["c++", "c#", "node.js", ".net", "ci/cd".split("/")[0]])(
    "keeps the tech name %s intact",
    (name) => {
      expect(tokenize(name)[0].token).toBe(name.toLowerCase());
    },
  );
  it("does not collapse distinct words", () => {
    expect(normalizeTerm("data")).not.toBe(normalizeTerm("date"));
    expect(normalizeTerm("java")).not.toBe(normalizeTerm("javascript"));
    expect(normalizeTerm("kubernetes")).toBe(normalizeTerm("Kubernetes"));
  });
  it("keeps offsets into the original text", () => {
    const [first, second] = tokenize("Built APIs");
    expect([first.start, first.end, second.start, second.end]).toEqual([
      0, 5, 6, 10,
    ]);
    expect(second.raw).toBe("APIs");
  });
  it("is stable on already-stemmed input", () => {
    for (const word of ["design", "develop", "manage", "build", "data"]) {
      expect(stem(stem(word))).toBe(stem(word));
    }
  });
  it("gives one stem to every form of a word, including engineer and engineering", () => {
    const forms = [
      ["engineer", "engineers", "engineering"],
      ["develop", "developer", "developers", "developing", "development"],
    ];
    for (const group of forms)
      expect(new Set(group.map((w) => stem(w))).size, group.join()).toBe(1);
  });
});

describe("O*NET vocabulary import (ATS-D1)", () => {
  it("records source and licence per entry and never overrides a project term", async () => {
    const { SKILLS } = await import("../../app/lib/server/matching/vocabulary");
    const onet = SKILLS.filter((s) => s.source === "onet-hot-technology");
    expect(onet.length).toBeGreaterThan(100);
    expect(onet.every((s) => s.licence === "CC-BY-4.0 (O*NET 31.0)")).toBe(
      true,
    );
    const excel = SKILLS.find((s) => s.canonical === "Microsoft Excel");
    expect(excel?.aliases).toContain("Excel");
    const python = SKILLS.find((s) => s.canonical.toLowerCase() === "python");
    expect(python?.licence).toBe("project-owned");
  });
});
