import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createCanonicalFixture } from "./canonical-test-fixture";
import { processQualitativeStage } from "../app/lib/server/qualitative-stage";
import { BASELINE_SEMANTICS } from "../app/lib/server/qualitative-prose";
const f = await createCanonicalFixture(); // This helper rejects non-local databases.
const { admin, ownerId, organizationId } = f;
let analysisId = f.analysisId;
let assertions = 0,
  executions = 0;
const check = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions++;
};
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const text = "Built reliable synthetic services";
const category = {
  tips: [
    {
      type: "improve",
      tip: "Clarify the contribution",
      explanation: "Add verified context",
      quote: text,
    },
  ],
};
const transport = {
  execute: async () => {
    executions++;
    return {
      output: {
        toneAndStyle: category,
        content: category,
        structure: category,
        skills: category,
        writer: { summary: null, bullets: [] },
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  },
};
try {
  check(
    !(
      await admin
        .from("analyses")
        .update({ status: "qualitative_review" })
        .eq("id", analysisId)
    ).error,
    "Legacy fixture setup failed",
  );
  check(
    (await processQualitativeStage(analysisId, 1, transport)) === false &&
      executions === 0,
    "Uncalibrated source reached model",
  );
  // A separate disposable analysis emulates the historical pre-AA1 path.
  // The original evidence-bearing analysis and immutable envelope stay untouched.
  analysisId = randomUUID();
  check(
    !(
      await admin.from("analyses").insert({
        id: analysisId,
        resume_version_id: f.sourceId,
        owner_id: ownerId,
        organization_id: organizationId,
        status: "qualitative_review",
        idempotency_key: randomUUID(),
      })
    ).error,
    "Synthetic historical setup failed",
  );
  check(
    !(
      await admin.from("analysis_extractions").insert({
        analysis_id: analysisId,
        owner_id: ownerId,
        organization_id: organizationId,
        page_count: 1,
        extracted_text: text,
        text_checksum: digest(text),
        duration_ms: 1,
        extractor_version: "synthetic-legacy/1",
      })
    ).error,
    "Synthetic extraction setup failed",
  );
  const trace = [
    { passed: true, detail: "Synthetic contact" },
    { passed: true, detail: "Synthetic dates" },
    { passed: false, detail: "Synthetic structure" },
  ];
  check(
    !(
      await admin.from("analysis_deterministic_results").insert({
        analysis_id: analysisId,
        owner_id: ownerId,
        organization_id: organizationId,
        score: 74,
        parse_view: { source: "synthetic-legacy" },
        rule_trace: trace,
        keyword_coverage: {
          taxonomyVersion: "skills-taxonomy-v1",
          matched: [],
          missing: [],
        },
        input_text_checksum: digest(text),
        result_checksum: digest(JSON.stringify(trace)),
        parser_version: "synthetic-legacy/1",
        ruleset_version: "synthetic-legacy/1",
        normalizer_version: "synthetic-legacy/1",
        taxonomy_version: "skills-taxonomy-v1",
      })
    ).error,
    "Synthetic deterministic setup failed",
  );
  process.env.AI_ENABLED = "true"; // Injected local transport only; no provider client or network call.
  check(
    await processQualitativeStage(analysisId, 1, transport),
    "Cited prose persistence failed",
  );
  check(executions === 1, "Injected transport execution count changed");
  const result = await admin
    .from("analysis_results")
    .select("feedback,created_at,ruleset_version")
    .eq("analysis_id", analysisId)
    .single();
  check(
    !result.error && result.data.feedback.overallScore === 74,
    "Model changed baseline",
  );
  check(
    result.data!.feedback.scoreSemantics === BASELINE_SEMANTICS,
    "Baseline semantics lost",
  );
  check(
    result.data!.feedback.content.tips[0].quote === text,
    "Quote missing from persisted feedback",
  );
  const runs = await admin
    .from("analysis_ai_runs")
    .select("output")
    .eq("analysis_id", analysisId)
    .single();
  check(
    !runs.error && !JSON.stringify(runs.data!.output).includes('"score"'),
    "Model ratings persisted",
  );
  const historical = JSON.stringify(result.data);
  check(
    (await processQualitativeStage(analysisId, 2, transport)) === false &&
      executions === 1,
    "Completed history reevaluated",
  );
  const unchanged = await admin
    .from("analysis_results")
    .select("feedback,created_at,ruleset_version")
    .eq("analysis_id", analysisId)
    .single();
  check(
    JSON.stringify(unchanged.data) === historical,
    "Historical value, version or timestamp changed",
  );
  process.stdout.write(
    JSON.stringify({
      scope: "synthetic historical local pipeline",
      assertions,
      injectedTransportExecutions: executions,
      realProviderCalls: 0,
      passed: true,
    }) + "\n",
  );
} finally {
  await f.cleanup();
}
