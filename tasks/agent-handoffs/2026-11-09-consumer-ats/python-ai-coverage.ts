import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const owned =
  "/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats/tasks/agent-handoffs/2026-11-09-consumer-ats";
globalThis.fetch = async () => {
  throw new Error("NETWORK_PROHIBITED_FOR_PURE_REVIEW");
};
const { scoreFixture } = await import(`${root}/tests/fixtures/scoring-v2.ts`);
const { parseJobRequirements } = await import(
  `${root}/app/lib/server/job-requirements.ts`
);
const { buildScoreDiagnostics, confirmedExperienceMonths } = await import(
  `${root}/app/lib/server/score-v2-engine.ts`
);
const { groundWriterSuggestions } = await import(
  `${root}/app/lib/server/writer-grounding.ts`
);

const jd = [
  "Title: Python AI Engineer",
  "Qualifications",
  "1-4 years of professional software engineering experience required.",
  "Python required.",
  "FastAPI or Flask required.",
  "Object-Oriented Programming (OOP) required.",
  "Pydantic required.",
  "microservices required.",
  "LLMs and RAG required.",
  "embeddings and vector databases required.",
  "AI agents and agent orchestration required.",
  "NoSQL and Redis required.",
  "asynchronous programming with async/await required.",
  "Git required.",
  "AWS and GCP preferred.",
  "REST APIs required.",
  "About Fictional Organization",
  "Our company generated 17 million units of revenue and uses Azure and Java for finance.",
].join("\n");
const resume = [
  "Name: Synthetic Engineer",
  "Email: synthetic-role@example.test",
  "Phone: +91 9999999999",
  "Experience",
  "Employer: Fictional Company",
  "Role: Software Engineer",
  "Dates: 2020-01-01 - 2022-01-01",
  "Dates: 2021-01-01 - 2023-01-01",
  "Built Python REST APIs with FastAPI and Git.",
  "Education",
  "Education: Bachelor",
  "Skills",
  "Python",
  "FastAPI",
  "REST APIs",
  "Git",
].join("\n");
const input = scoreFixture(resume);
input.requirements = parseJobRequirements(jd, input.requirements);
const diagnostics = buildScoreDiagnostics(input);
const expected = [
  "Python",
  "FastAPI",
  "Flask",
  "Object-Oriented Programming",
  "OOP",
  "Pydantic",
  "microservices",
  "LLMs",
  "RAG",
  "embeddings",
  "vector databases",
  "AI agents",
  "agent orchestration",
  "NoSQL",
  "Redis",
  "asynchronous programming",
  "async/await",
  "Git",
  "AWS",
  "GCP",
  "REST APIs",
];
const found = new Set(
  input.requirements.requirements
    .filter((r: { type: string }) => r.type === "skill")
    .map((r: { value: string }) => r.value),
);
const exactCitations = input.requirements.requirements.every(
  (r: { evidence: { start: number; end: number; quote: string } }) =>
    Array.from(jd).slice(r.evidence.start, r.evidence.end).join("") ===
    r.evidence.quote,
);
const typedResumeSkills = input.canonical.facts
  .filter((f: { type: string }) => f.type === "skill")
  .map((f: { value: string }) => f.value);
const rows = expected.map((value) => {
  const requirement = input.requirements.requirements.find(
    (r: { type: string; value: string }) =>
      r.type === "skill" && r.value === value,
  );
  const alignment = diagnostics.alignment.find(
    (r: { type: string; value: string }) =>
      r.type === "skill" && r.value === value,
  );
  return {
    value,
    discovered: found.has(value),
    listedInPartialResume: typedResumeSkills.includes(value),
    importance: requirement?.importance ?? null,
    ambiguity: requirement?.ambiguity ?? null,
    proposedState: alignment?.proposedState ?? null,
    publishedState: alignment?.state ?? null,
    reason: alignment?.reason ?? null,
  };
});
const experience = input.requirements.requirements
  .filter((r: { type: string }) => r.type === "experience")
  .map((r: { minimumYears: number; ambiguity: string[] }) => ({
    minimumYears: r.minimumYears,
    ambiguity: r.ambiguity,
  }));
const exactSafeRewrite = groundWriterSuggestions(
  {
    summary: null,
    bullets: [
      {
        original: "Built Python REST APIs with FastAPI and Git.",
        rewrite: "Developed Python REST APIs with FastAPI and Git.",
        reasoning: "Clarifies wording.",
      },
    ],
  },
  resume,
);
const assertions = [
  {
    id: "requested-role-vocabulary-discovered",
    expected: expected.length,
    observed: rows.filter((r) => r.discovered).length,
  },
  { id: "exact-jd-span-grounding", expected: true, observed: exactCitations },
  {
    id: "company-revenue-and-company-skills-excluded",
    expected: [],
    observed: input.requirements.requirements
      .filter(
        (r: { value: string; evidence: { quote: string } }) =>
          ["Azure", "Java"].includes(r.value) ||
          r.evidence.quote.includes("17 million"),
      )
      .map((r: { value: string }) => r.value),
  },
  {
    id: "range-lower-bound-recovered-upper-bound-reviewable",
    expected: [
      { minimumYears: 1, ambiguity: ["experience_upper_bound_review"] },
    ],
    observed: experience,
  },
  {
    id: "all-authoritative-values-withheld",
    expected: true,
    observed: diagnostics.score.dimensions.every(
      (d: { value: number | null; eligible: boolean }) =>
        d.value === null && !d.eligible,
    ),
  },
  {
    id: "listed-python-does-not-prove-proficiency",
    expected: "candidate_confirmation_required",
    observed: rows.find((r) => r.value === "Python")?.proposedState,
  },
  {
    id: "absent-rag-not-silently-marked-failed",
    expected: "not_evaluated",
    observed: rows.find((r) => r.value === "RAG")?.proposedState,
  },
  {
    id: "alternative-framework-does-not-demand-both",
    expected: true,
    observed: rows
      .filter((r) => ["FastAPI", "Flask"].includes(r.value))
      .every(
        (r) =>
          r.ambiguity?.includes("skill_alternative_review") &&
          r.proposedState === "not_evaluated",
      ),
  },
  {
    id: "same-supported-facts-jd-guided-rewording",
    expected: 1,
    observed: exactSafeRewrite.bullets.length,
  },
];
const checks = assertions.map((item) => {
  let passed = true;
  try {
    assert.deepEqual(item.observed, item.expected);
  } catch {
    passed = false;
  }
  return { ...item, passed };
});
const sources = [
  "tests/fixtures/scoring-v2.ts",
  "app/lib/server/job-requirements.ts",
  "app/lib/server/score-v2-engine.ts",
  "app/lib/server/canonical-content.ts",
  "app/lib/server/native-evidence.ts",
  "app/lib/server/writer-grounding.ts",
];
const report = {
  schemaVersion: "consumer-python-ai-role-coverage/1.0.0",
  executedAt: new Date().toISOString(),
  scope:
    "fresh neutral known synthetic role coverage; no original candidate/company material, provider, database, browser or employer ATS claim",
  sourceHashes: Object.fromEntries(
    sources.map((p) => [
      p,
      createHash("sha256")
        .update(readFileSync(`${root}/${p}`))
        .digest("hex"),
    ]),
  ),
  jdSha256: createHash("sha256").update(jd).digest("hex"),
  resumeSha256: createHash("sha256").update(resume).digest("hex"),
  expectedVocabulary: expected.length,
  discoveredVocabulary: rows.filter((r) => r.discovered).length,
  missingVocabulary: rows.filter((r) => !r.discovered).map((r) => r.value),
  requirementsTotal: input.requirements.requirements.length,
  typedResumeSkills,
  syntheticConfirmedGeneralExperienceMonths: confirmedExperienceMonths(
    input.canonical,
  ),
  experience,
  rows,
  authoritativeDimensions: diagnostics.score.dimensions,
  checks,
  passed: checks.filter((c) => c.passed).length,
  failed: checks.filter((c) => !c.passed).length,
};
writeFileSync(
  `${owned}/python-ai-coverage-results.json`,
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    discoveredVocabulary: report.discoveredVocabulary,
    expectedVocabulary: report.expectedVocabulary,
    missingVocabulary: report.missingVocabulary,
    rows,
  }) + "\n",
);
if (report.failed) process.exitCode = 1;
