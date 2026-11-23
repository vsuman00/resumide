import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const owned =
  "/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats/tasks/agent-handoffs/2026-11-09-consumer-ats";
globalThis.fetch = async () => {
  throw new Error("NETWORK_PROHIBITED_FOR_PURE_REVIEW");
};
const { generateGroundedRewrite } = await import(
  `${root}/app/lib/server/rewrite-ai.ts`
);
const { runQualitativeAi } = await import(
  `${root}/app/lib/server/qualitative-ai.ts`
);
const { buildRewriteSources } = await import(
  `${root}/app/lib/server/rewrite-sources.ts`
);
const { AuthoringCommandSchema } = await import(
  `${root}/app/lib/server/authoring-contract.ts`
);
const source = "- Built a dashboard for internal reports.";
const invented = "Built a dashboard for internal reports that doubled revenue.";
const proposal = {
  summary: null,
  bullets: [
    {
      sourceId: 0,
      rewrite: invented,
      reasoning: "Clarifies dashboard wording.",
    },
  ],
};
const request = {
  resumeText: source,
  jobTitle: "Fictional engineering role",
  jobDescription: "Requirements\nPython required",
  idempotencyKey: "synthetic-downstream-no-provider",
};
const rewrite = await generateGroundedRewrite(
  request,
  {
    execute: async () => ({
      output: proposal,
      usage: { inputTokens: 10, outputTokens: 10 },
    }),
  },
  1000,
);
const resolved = {
  summary: null,
  bullets: [
    {
      original: buildRewriteSources(source)[0].text,
      rewrite: invented,
      reasoning: "Clarifies dashboard wording.",
    },
  ],
};
const category = { tips: [] };
const qualitative = await runQualitativeAi(
  {
    ...request,
    enabled: true,
    remainingTokenBudget: 1000,
    model: "synthetic-injected",
    maxOutputTokens: 100,
    timeoutMs: 1000,
  },
  {
    execute: async () => ({
      output: {
        toneAndStyle: category,
        content: category,
        structure: category,
        skills: category,
        writer: resolved,
      },
      usage: { inputTokens: 10, outputTokens: 10 },
    }),
  },
);
const cases = [
  {
    id: "rewrite-source-id-schema-does-not-close-semantic-gap",
    expectedAcceptedBullets: 0,
    observedAcceptedBullets: rewrite.writer.bullets.length,
    passed: rewrite.writer.bullets.length === 0,
  },
  {
    id: "review-schema-does-not-close-semantic-gap",
    expectedAcceptedBullets: 0,
    observedAcceptedBullets: qualitative.output.writer.bullets.length,
    passed: qualitative.output.writer.bullets.length === 0,
  },
];
const accept = AuthoringCommandSchema.options.find(
  (s: any) => s.shape.action.value === "accept",
);
const confirmationRejected =
  !accept!.shape.confirmation.safeParse(false).success &&
  !accept!.shape.confirmation.safeParse(undefined).success;
const sources = [
  "app/lib/server/rewrite-ai.ts",
  "app/lib/server/qualitative-ai.ts",
  "app/lib/server/qualitative-prose.ts",
  "app/lib/server/rewrite-sources.ts",
  "app/lib/server/writer-proposals.ts",
  "app/lib/server/rewrite-service.ts",
  "app/lib/server/authoring-contract.ts",
  "app/lib/server/authoring-repository.ts",
  "app/components/ResumeWriter.tsx",
  "app/components/AuthoringWorkspace.tsx",
  "app/routes/resume.tsx",
  "app/lib/server/artifact-contract.ts",
  "app/lib/server/evidence-scoring-guard.ts",
  "supabase/migrations/20261012160703_candidate_authoring_transactions.sql",
];
const report = {
  schemaVersion: "consumer-ats-downstream/1.0.0",
  executedAt: new Date().toISOString(),
  scope:
    "two injected-transport proposal probes and confirmation schema; static caller review; no DB/provider/browser",
  cases,
  confirmationRequiredByServerSchema: confirmationRejected,
  sourceHashes: Object.fromEntries(
    sources.map((p) => [
      p,
      createHash("sha256")
        .update(readFileSync(`${root}/${p}`))
        .digest("hex"),
    ]),
  ),
};
writeFileSync(
  `${owned}/downstream-results.json`,
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({
    cases,
    confirmationRequiredByServerSchema: confirmationRejected,
  }) + "\n",
);
if (cases.some((c) => !c.passed) || !confirmationRejected) process.exitCode = 1;
