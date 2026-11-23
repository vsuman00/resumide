import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const output =
  "/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats/tasks/agent-handoffs/2026-11-09-consumer-ats/counterfactual-results.json";
globalThis.fetch = async () => {
  throw new Error("NETWORK_PROHIBITED_FOR_PURE_REVIEW");
};
const { scoreFixture, SCORE_SOURCE } = await import(
  `${root}/tests/fixtures/scoring-v2.ts`
);
const { parseJobRequirements } = await import(
  `${root}/app/lib/server/job-requirements.ts`
);
const { buildScoreDiagnostics } = await import(
  `${root}/app/lib/server/score-v2-engine.ts`
);
const { groundWriterSuggestions } = await import(
  `${root}/app/lib/server/writer-grounding.ts`
);
const { reviseCanonical, rollbackCanonical } = await import(
  `${root}/app/lib/server/canonical-content.ts`
);
const { buildSuggestion, validateSuggestion, clarifyValue } = await import(
  `${root}/app/lib/server/authoring-contract.ts`
);
const {
  buildRenderPlan,
  ArtifactOptionsSchema,
  verifyArtifact,
  normalizeArtifactText,
} = await import(`${root}/app/lib/server/artifact-contract.ts`);

const cases: Array<{
  id: string;
  passed: boolean;
  expected: unknown;
  observed: unknown;
  classification: string;
}> = [];
function record(
  id: string,
  expected: unknown,
  observed: unknown,
  classification = "regression",
) {
  let passed = true;
  try {
    assert.deepEqual(observed, expected);
  } catch {
    passed = false;
  }
  cases.push({ id, passed, expected, observed, classification });
}
const context = scoreFixture().requirements;
const requirementValues = (text: string) =>
  parseJobRequirements(text, context).requirements.map(
    (r: { value: string }) => r.value,
  );
record(
  "jd-exact-typescript-required",
  ["TypeScript"],
  requirementValues("Requirements\nTypeScript required"),
);
record(
  "jd-no-java-substring-in-javascript",
  ["JavaScript"],
  requirementValues("Requirements\nJavaScript required"),
);
record(
  "jd-company-benefits-resume-discovery",
  ["Python", "SQL"],
  requirementValues(
    "Requirements\nPython required\nAbout Fictional Company\nAWS and JavaScript services\nBenefits\nDocker credits\nRequired Skills and Experience\nSQL",
  ),
);
record(
  "jd-approved-taxonomy-alias-js",
  ["JavaScript"],
  requirementValues("Requirements\nJS required"),
  "feature-gap",
);
record(
  "jd-approved-taxonomy-alias-postgres",
  ["PostgreSQL"],
  requirementValues("Requirements\nPostgres required"),
  "feature-gap",
);
const years = parseJobRequirements(
  "Requirements\n5 years software experience and 2 years Python experience required\nDocker preferred; no Java experience required",
  context,
);
record(
  "jd-years-clause-separation",
  [5, 2],
  years.requirements
    .filter((r: { type: string }) => r.type === "experience")
    .map((r: { minimumYears: number }) => r.minimumYears),
);
record(
  "jd-negation-clause-separation",
  [true, "contextual"],
  years.requirements
    .filter((r: { value: string }) => r.value === "Java")
    .map((r: { negated: boolean; importance: string }) => [
      r.negated,
      r.importance,
    ])[0],
);
const allCitations = years.requirements.every(
  (r: { evidence: { start: number; end: number; quote: string } }) =>
    Array.from(years.sourceText)
      .slice(r.evidence.start, r.evidence.end)
      .join("") === r.evidence.quote,
);
record("jd-exact-evidence-codepoints", true, allCitations);

const base = scoreFixture();
base.requirements = parseJobRequirements(
  "Requirements\nTypeScript required\nKubernetes required\n3 years software experience required",
  base.requirements,
);
const baseline = buildScoreDiagnostics(base);
record(
  "uncalibrated-authoritative-values-withheld",
  true,
  baseline.score.dimensions.every(
    (d: { value: number | null; eligible: boolean }) =>
      d.value === null && !d.eligible,
  ),
);
record(
  "listed-skill-not-inferred-proficiency",
  "candidate_confirmation_required",
  baseline.alignment.find((r: { value: string }) => r.value === "TypeScript")
    ?.proposedState,
);
record(
  "missing-skill-stays-unknown-not-false-failure",
  "not_evaluated",
  baseline.alignment.find((r: { value: string }) => r.value === "Kubernetes")
    ?.proposedState,
);
const compareAlignment = (input: typeof base) =>
  buildScoreDiagnostics(input).alignment.map(
    (r: { value: string; proposedState: string; importance: string }) => [
      r.value,
      r.proposedState,
      r.importance,
    ],
  );
const stuffed = scoreFixture(
  SCORE_SOURCE + "\nTypeScript\nTypeScript\nTypeScript",
);
stuffed.requirements = parseJobRequirements(
  base.requirements.sourceText + "\nTypeScript required\nTypeScript required",
  stuffed.requirements,
);
record(
  "keyword-stuffing-and-repeat-no-extra-credit",
  compareAlignment(base),
  compareAlignment(stuffed),
);
const incomplete = buildScoreDiagnostics({ ...base, expectedPageCount: 2 });
record("missing-page-coverage", 0.5, incomplete.readiness.observedPageCoverage);
record(
  "missing-page-numerical-withholding",
  true,
  incomplete.score.dimensions.every(
    (d: { value: number | null }) => d.value === null,
  ),
);

const original = "Built a dashboard.";
const writer = (
  rewrite: string,
  source = original,
  reasoning = "Clarifies dashboard wording.",
) =>
  groundWriterSuggestions(
    { summary: null, bullets: [{ original, rewrite, reasoning }] },
    source,
  ).bullets.length;
record("writer-valid-same-fact", 1, writer("Created a dashboard."));
record(
  "writer-invented-digit-metric",
  0,
  writer("Built a dashboard that reduced costs by 90%."),
);
record(
  "writer-invented-taxonomy-skill",
  0,
  writer("Built a dashboard using python."),
);
record(
  "writer-invented-proper-employer",
  0,
  writer("Built a dashboard at InventedCo."),
);
record(
  "writer-invented-spelled-out-impact",
  0,
  writer("Built a dashboard that doubled revenue."),
  "truthfulness-defect",
);
record(
  "writer-invented-lowercase-team-scope",
  0,
  writer("Built a dashboard and led a team."),
  "truthfulness-defect",
);
record(
  "writer-invented-causal-outcome",
  0,
  writer("Built a dashboard that prevented all outages."),
  "truthfulness-defect",
);
record(
  "writer-unlisted-lowercase-skill",
  0,
  writer("Built a dashboard using pydantic."),
  "truthfulness-defect",
);
record(
  "writer-summary-invented-lowercase-scope",
  null,
  groundWriterSuggestions(
    { summary: "Built a dashboard and led a global team.", bullets: [] },
    original,
  ).summary,
  "truthfulness-defect",
);
record(
  "writer-cross-contribution-metric",
  0,
  writer(
    "Built a dashboard that reduced costs by 90%.",
    original + "\nA separate project reduced costs by 90%.",
  ),
);

const author = scoreFixture();
const fact = author.canonical.facts.find(
  (f: { type: string; value: string }) =>
    f.type === "contribution" && f.value === "Built reliable services",
)!;
author.canonical.sections
  .find((s: { type: string }) => s.type === "experience")!
  .entries[0].bullets.push({
    id: randomUUID(),
    text: fact.value,
    factIds: [fact.id],
  });
fact.value = clarifyValue(
  clarifyValue(fact.value, "result", "Fewer release failures"),
  "scope",
  "Internal release workflow",
);
fact.sources = [];
fact.confirmation!.value = fact.value;
const d = buildScoreDiagnostics(author);
const patch = buildSuggestion(
  author.canonical,
  fact.id,
  "action_scope_result",
  d,
);
record("author-source-bound-ready-patch", "ready", patch.state);
record(
  "author-accepts-only-exact-patch",
  patch.id,
  validateSuggestion(patch, author.canonical, d).id,
);
const before = JSON.stringify(author.canonical);
const edited = reviseCanonical(author.canonical, {
  operation: "edit",
  factId: fact.id,
  value: patch.operations[0].value,
});
record(
  "author-edit-preserves-original",
  before,
  JSON.stringify(author.canonical),
);
record(
  "author-edit-immutable-lineage",
  true,
  edited.versionId !== author.canonical.versionId &&
    edited.parentVersionId === author.canonical.versionId,
);
record(
  "author-edit-does-not-auto-confirm",
  "unconfirmed",
  edited.facts.find((f: { id: string }) => f.id === fact.id)?.state,
);
let staleRejected = false;
try {
  validateSuggestion(patch, edited, d);
} catch {
  staleRejected = true;
}
record("author-stale-patch-rejected", true, staleRejected);
const restored = rollbackCanonical(edited, author.canonical);
record(
  "author-undo-restores-facts-as-new-version",
  true,
  JSON.stringify(restored.facts) === JSON.stringify(author.canonical.facts) &&
    restored.versionId !== author.canonical.versionId &&
    restored.parentVersionId === edited.versionId,
);
let tamperedRejected = false;
try {
  validateSuggestion(
    {
      ...patch,
      operations: [
        {
          ...patch.operations[0],
          value: "Invented ninety percent revenue gain",
        },
      ],
    },
    author.canonical,
    d,
  );
} catch {
  tamperedRejected = true;
}
record("author-invented-acceptance-rejected", true, tamperedRejected);

const plan = buildRenderPlan(scoreFixture().canonical);
const options = ArtifactOptionsSchema.parse({
  versionId: plan.versionId,
  format: "pdf",
  pageSize: "A4",
  templateId: "software-engineering-single-column",
});
const observation = {
  text: plan.blocks.map((b: { text: string }) => b.text).join("\n"),
  links: plan.blocks.flatMap((b: { link: string | null }) =>
    b.link ? [b.link] : [],
  ),
  linkBindings: plan.blocks.flatMap(
    (b: { link: string | null; text: string }) =>
      b.link ? [`${b.link}|${normalizeArtifactText(b.text)}`] : [],
  ),
  pages: 1,
  layoutPass: true,
  structuralAccessibility: true,
  diagnostics: [],
};
record(
  "export-known-pure-observation",
  "verified",
  verifyArtifact(plan, options, observation, new Uint8Array([1]), 1).state,
);
for (const [id, mutation] of [
  ["export-extra-claim", { text: observation.text + "\ninvented claim" }],
  ["export-missing-text", { text: observation.text.slice(10) }],
  [
    "export-order-corruption",
    {
      text: [...plan.blocks]
        .reverse()
        .map((b: { text: string }) => b.text)
        .join("\n"),
    },
  ],
  [
    "export-link-anchor-corruption",
    { linkBindings: ["https://attacker.test|wrong"] },
  ],
  ["export-clipping", { layoutPass: false }],
] as const)
  record(
    id,
    "export_verification_failed",
    verifyArtifact(
      plan,
      options,
      { ...observation, ...mutation },
      new Uint8Array([1]),
      1,
    ).state,
  );
let unconfirmedExportRejected = false;
try {
  buildRenderPlan(edited);
} catch {
  unconfirmedExportRejected = true;
}
record("export-unconfirmed-edit-blocked", true, unconfirmedExportRejected);

const sources = [
  "tests/fixtures/scoring-v2.ts",
  "app/lib/server/job-requirements.ts",
  "app/lib/server/score-v2-engine.ts",
  "app/lib/server/writer-grounding.ts",
  "app/lib/server/canonical-content.ts",
  "app/lib/server/authoring-contract.ts",
  "app/lib/server/artifact-contract.ts",
  "app/lib/server/matching/taxonomy.ts",
];
const report = {
  schemaVersion: "consumer-ats-counterfactuals/1.0.0",
  executedAt: new Date().toISOString(),
  scope:
    "pure known synthetic and counterfactuals; no database, rendering, live provider or external ATS validation",
  rootBase: "a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus dirty source",
  sourceHashes: Object.fromEntries(
    sources.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(`${root}/${path}`))
        .digest("hex"),
    ]),
  ),
  cases,
  passed: cases.filter((c) => c.passed).length,
  failed: cases.filter((c) => !c.passed).length,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    failures: cases.filter((c) => !c.passed),
  }) + "\n",
);
if (report.failed) process.exitCode = 1;
