// Seeds one completed synthetic analysis (v2 matcher) for browser checks of the result page.
// Synthetic text only. Hosted writes use the approved synthetic-user target; cleanup is the
// owner fixture's deleteUser cascade plus removing the one storage object created here.
import { createHash, randomUUID } from "node:crypto";
import { processQualitativeStage } from "../../app/lib/server/qualitative-stage";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";
import { createResumeStorage } from "../../app/lib/server/storage";
import { createSupabaseAdminClient } from "../../app/lib/server/supabase";

export const ATS_SEED_RESUME = `Alex Example
alex@example.test | +1 202 555 0100 | Austin, TX

Experience
Senior Software Engineer, Example Corp
Jan 2020 - Present
- Built TypeScript and React services on AWS, deployed with Docker and Kubernetes.
- Designed REST APIs backed by PostgreSQL and tested them with Jest.

Software Engineer, Sample Systems
Jun 2016 - Dec 2019
- Developed Python data pipelines and improved SQL query performance.

Education
B.S. Computer Science, State University, 2016

Skills
TypeScript, React, Python, SQL, AWS, Docker, Kubernetes, PostgreSQL, Jest`;

export const ATS_SEED_JD = `Senior Software Engineer

Requirements
- 5+ years of software engineering experience
- Bachelor's degree in Computer Science or a related field
- Strong experience with TypeScript and React
- Experience with AWS, Terraform or Google Cloud
- Experience with GraphQL

Preferred Qualifications
- Experience with Kubernetes
- Master's degree

You must be authorized to work in the United States.`;

const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

export async function seedAtsAnalysis(owner: { ownerId: string }) {
  const admin = createSupabaseAdminClient();
  const ids = {
    analysis: randomUUID(),
    job: randomUUID(),
    resume: randomUUID(),
    version: randomUUID(),
  };
  let organizationId = "";
  for (let attempt = 0; attempt < 20 && !organizationId; attempt++) {
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", owner.ownerId)
      .maybeSingle();
    if (data) organizationId = data.id;
    else await new Promise((r) => setTimeout(r, 250));
  }
  if (!organizationId) throw new Error("Seed organization unavailable");
  const check = (error: unknown, step: string) => {
    if (error) throw new Error(`Seed failed: ${step}`, { cause: error });
  };
  check(
    (
      await admin.from("memberships").upsert(
        {
          organization_id: organizationId,
          user_id: owner.ownerId,
          role: "owner",
        },
        { onConflict: "organization_id,user_id" },
      )
    ).error,
    "membership",
  );
  const bytes = new TextEncoder().encode("%PDF-1.4\n% synthetic ats seed\n");
  const uploaded = await createResumeStorage().upload({
    organizationId,
    resumeId: ids.resume,
    versionId: ids.version,
    bytes,
  });
  const common = { organization_id: organizationId, owner_id: owner.ownerId };
  check(
    (
      await admin.from("resumes").insert({
        id: ids.resume,
        ...common,
        display_name: "ats-seed.pdf",
      })
    ).error,
    "resume",
  );
  check(
    (
      await admin.from("resume_versions").insert({
        id: ids.version,
        resume_id: ids.resume,
        ...common,
        storage_key: uploaded.storageKey,
        checksum: uploaded.checksum,
        bytes: uploaded.bytes,
        media_type: "application/pdf",
        page_count: 1,
      })
    ).error,
    "version",
  );
  check(
    (
      await admin.from("jobs").insert({
        id: ids.job,
        ...common,
        company_name: "Synthetic Co.",
        title: "Senior Software Engineer",
        description: ATS_SEED_JD,
      })
    ).error,
    "job",
  );
  check(
    (
      await admin.from("analyses").insert({
        id: ids.analysis,
        resume_version_id: ids.version,
        job_id: ids.job,
        ...common,
        status: "qualitative_review",
        idempotency_key: randomUUID(),
        request_id: `ats-seed-${ids.analysis}`,
      })
    ).error,
    "analysis",
  );
  const textChecksum = digest(ATS_SEED_RESUME);
  check(
    (
      await admin.from("analysis_extractions").insert({
        analysis_id: ids.analysis,
        ...common,
        page_count: 1,
        extracted_text: ATS_SEED_RESUME,
        text_checksum: textChecksum,
        warnings: [],
        duration_ms: 1,
        extractor_version: "ats-seed",
      })
    ).error,
    "extraction",
  );
  const scored = scoreExtractedResume({
    text: ATS_SEED_RESUME,
    pageCount: 1,
    jobDescription: ATS_SEED_JD,
    textChecksum,
    matcher: "v2",
  });
  check(
    (
      await admin.from("analysis_deterministic_results").insert({
        analysis_id: ids.analysis,
        ...common,
        score: scored.score,
        parse_view: scored.parseView,
        rule_trace: scored.ruleTrace,
        keyword_coverage: scored.keywordCoverage,
        input_text_checksum: scored.inputTextChecksum,
        result_checksum: scored.resultChecksum,
        parser_version: scored.parserVersion,
        ruleset_version: scored.rulesetVersion,
        normalizer_version: scored.normalizerVersion,
        taxonomy_version: scored.taxonomyVersion,
      })
    ).error,
    "deterministic",
  );
  const category = {
    tips: [
      {
        type: "good" as const,
        tip: "Clear",
        explanation: "Clear evidence.",
        quote: "TypeScript",
      },
      {
        type: "improve" as const,
        tip: "Detail",
        explanation: "Add context.",
        quote: "Python",
      },
      {
        type: "good" as const,
        tip: "Relevant",
        explanation: "Relevant content.",
        quote: "AWS",
      },
    ],
  };
  const transport = {
    execute: async () => ({
      output: {
        toneAndStyle: category,
        content: category,
        structure: category,
        skills: category,
        writer: { summary: null, bullets: [] },
      },
      usage: { inputTokens: 100, outputTokens: 200 },
    }),
  };
  // AI stays off: the stage stores a deterministic-only (partial) result and returns false,
  // which is exactly what the page renders. The status check below catches real failures.
  await processQualitativeStage(ids.analysis, 1, transport);
  const { data: done } = await admin
    .from("analyses")
    .select("status")
    .eq("id", ids.analysis)
    .single();
  if (!done || !["completed", "partial"].includes(done.status))
    throw new Error(`Seed failed: analysis ended as ${done?.status}`);
  return {
    analysisId: ids.analysis,
    scored,
    async cleanup() {
      await createResumeStorage().remove(uploaded.storageKey);
    },
  };
}
