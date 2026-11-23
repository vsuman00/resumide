import { createHash, randomUUID } from "node:crypto";
import { processQualitativeStage } from "../app/lib/server/qualitative-stage";
import { createResumeStorage } from "../app/lib/server/storage";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";

function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function failureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }
  if (error && typeof error === "object" && "cause" in error && error.cause) {
    return failureCode(error.cause);
  }
  if (error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)) {
    return error.message;
  }
  return "UNEXPECTED";
}

async function waitForOrganization(userId: string) {
  const admin = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("SYNTHETIC_ORGANIZATION_UNAVAILABLE");
}

async function assertNoError(error: unknown, step: string) {
  if (error) throw new Error(step, { cause: error });
}

async function main() {
  const admin = createSupabaseAdminClient();
  const runId = randomUUID();
  const ids = {
    analysis: randomUUID(),
    job: randomUUID(),
    resume: randomUUID(),
    version: randomUUID(),
  };
  let userId: string | undefined;
  let organizationId: string | undefined;
  let storageKey: string | undefined;
  let successful = false;
  let stage = "create_synthetic_user";
  const cleanupFailures: string[] = [];

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: `phase4-${runId}@example.test`,
      email_confirm: true,
    });
    await assertNoError(error, "CREATE_SYNTHETIC_USER_FAILED");
    if (!data.user) throw new Error("CREATE_SYNTHETIC_USER_FAILED");
    userId = data.user.id;
    stage = "find_synthetic_organization";
    const organization = await waitForOrganization(userId);
    organizationId = organization;

    stage = "create_synthetic_membership";
    const { error: membershipError } = await admin.from("memberships").upsert(
      {
        organization_id: organization,
        user_id: userId,
        role: "owner",
      },
      { onConflict: "organization_id,user_id" },
    );
    await assertNoError(membershipError, "CREATE_SYNTHETIC_MEMBERSHIP_FAILED");

    stage = "upload_synthetic_resume";
    const fixtureBytes = new TextEncoder().encode(
      "%PDF-1.4\n% phase4 synthetic staging fixture\n",
    );
    const uploaded = await createResumeStorage().upload({
      organizationId: organization,
      resumeId: ids.resume,
      versionId: ids.version,
      bytes: fixtureBytes,
    });
    storageKey = uploaded.storageKey;

    stage = "create_synthetic_records";
    const { error: resumeError } = await admin.from("resumes").insert({
      id: ids.resume,
      organization_id: organization,
      owner_id: userId,
      display_name: "phase4-synthetic-resume.pdf",
    });
    await assertNoError(resumeError, "CREATE_SYNTHETIC_RESUME_FAILED");
    const { error: versionError } = await admin.from("resume_versions").insert({
      id: ids.version,
      resume_id: ids.resume,
      organization_id: organization,
      owner_id: userId,
      storage_key: uploaded.storageKey,
      checksum: uploaded.checksum,
      bytes: uploaded.bytes,
      media_type: "application/pdf",
      page_count: 1,
    });
    await assertNoError(versionError, "CREATE_SYNTHETIC_VERSION_FAILED");
    const { error: jobError } = await admin.from("jobs").insert({
      id: ids.job,
      organization_id: organization,
      owner_id: userId,
      company_name: "Synthetic Staging Co.",
      title: "Software Engineer",
      description:
        "Build reliable services, collaborate with engineers, and improve testing.",
    });
    await assertNoError(jobError, "CREATE_SYNTHETIC_JOB_FAILED");
    const { error: analysisError } = await admin.from("analyses").insert({
      id: ids.analysis,
      resume_version_id: ids.version,
      job_id: ids.job,
      organization_id: organization,
      owner_id: userId,
      status: "qualitative_review",
      idempotency_key: randomUUID(),
      request_id: `phase4-staging-${runId}`,
    });
    await assertNoError(analysisError, "CREATE_SYNTHETIC_ANALYSIS_FAILED");

    const extractedText =
      "Synthetic candidate. Built TypeScript services, tested deployments, and collaborated across product teams.";
    const { error: extractionError } = await admin
      .from("analysis_extractions")
      .insert({
        analysis_id: ids.analysis,
        organization_id: organization,
        owner_id: userId,
        page_count: 1,
        extracted_text: extractedText,
        text_checksum: digest(extractedText),
        warnings: [],
        duration_ms: 1,
        extractor_version: "phase4-staging-smoke",
      });
    await assertNoError(extractionError, "CREATE_SYNTHETIC_EXTRACTION_FAILED");
    const ruleTrace = [
      {
        passed: true,
        detail: "Synthetic fixture includes TypeScript experience.",
      },
      {
        passed: true,
        detail: "Synthetic fixture includes testing experience.",
      },
      { passed: false, detail: "Synthetic fixture omits a production metric." },
    ];
    const { error: deterministicError } = await admin
      .from("analysis_deterministic_results")
      .insert({
        analysis_id: ids.analysis,
        organization_id: organization,
        owner_id: userId,
        score: 74,
        parse_view: { source: "synthetic-stage4-test" },
        rule_trace: ruleTrace,
        keyword_coverage: {
          taxonomyVersion: "skills-taxonomy-v1",
          matched: ["TypeScript", "testing"],
          missing: [],
        },
        input_text_checksum: digest(extractedText),
        result_checksum: digest(JSON.stringify(ruleTrace)),
        parser_version: "phase4-staging-smoke",
        ruleset_version: "phase4-staging-smoke",
        normalizer_version: "phase4-staging-smoke",
        taxonomy_version: "skills-taxonomy-v1",
      });
    await assertNoError(
      deterministicError,
      "CREATE_SYNTHETIC_DETERMINISTIC_RESULT_FAILED",
    );

    stage = "run_qualitative_stage";
    const qualitativeCategory = {
      tips: [
        {
          type: "good" as const,
          tip: "Clear",
          explanation: "Clear evidence.",
          quote: "synthetic",
        },
        {
          type: "improve" as const,
          tip: "Detail",
          explanation: "Add context.",
          quote: "synthetic",
        },
        {
          type: "good" as const,
          tip: "Relevant",
          explanation: "Relevant content.",
          quote: "synthetic",
        },
      ],
    };
    const testTransport = {
      execute: async () => ({
        output: {
          toneAndStyle: qualitativeCategory,
          content: qualitativeCategory,
          structure: qualitativeCategory,
          skills: qualitativeCategory,
          writer: { summary: null, bullets: [] },
        },
        usage: { inputTokens: 100, outputTokens: 200 },
      }),
    };
    if (!(await processQualitativeStage(ids.analysis, 1, testTransport))) {
      throw new Error("QUALITATIVE_STAGE_DID_NOT_COMPLETE");
    }
    stage = "verify_persisted_results";
    const { data: analysis, error: completedError } = await admin
      .from("analyses")
      .select("status")
      .eq("id", ids.analysis)
      .single();
    await assertNoError(completedError, "READ_COMPLETED_ANALYSIS_FAILED");
    if (!analysis || analysis.status !== "completed")
      throw new Error("ANALYSIS_NOT_COMPLETED");

    const { data: aiRuns, error: aiRunsError } = await admin
      .from("analysis_ai_runs")
      .select("input_tokens, output_tokens")
      .eq("analysis_id", ids.analysis);
    await assertNoError(aiRunsError, "READ_AI_RUNS_FAILED");
    if (!aiRuns || aiRuns.length !== 1) throw new Error("AI_RUN_COUNT_INVALID");
    const { count: resultCount, error: resultError } = await admin
      .from("analysis_results")
      .select("*", { count: "exact", head: true })
      .eq("analysis_id", ids.analysis);
    await assertNoError(resultError, "READ_ANALYSIS_RESULT_FAILED");
    const { count: draftCount, error: draftError } = await admin
      .from("writer_drafts")
      .select("*", { count: "exact", head: true })
      .eq("analysis_id", ids.analysis);
    await assertNoError(draftError, "READ_WRITER_DRAFT_FAILED");
    if (resultCount !== 1 || draftCount !== 1) {
      throw new Error("PERSISTED_OUTPUT_COUNT_INVALID");
    }
    stage = "verify_terminal_idempotency";
    if (await processQualitativeStage(ids.analysis, 2)) {
      throw new Error("COMPLETED_STAGE_WAS_RERUN");
    }
    const { count: repeatedRunCount, error: repeatedRunError } = await admin
      .from("analysis_ai_runs")
      .select("*", { count: "exact", head: true })
      .eq("analysis_id", ids.analysis);
    await assertNoError(repeatedRunError, "READ_REPEATED_AI_RUNS_FAILED");
    if (repeatedRunCount !== 1) throw new Error("DUPLICATE_AI_RUN_CREATED");

    successful = true;
    console.log(
      JSON.stringify({
        status: "ok",
        stage: "qualitative",
        aiRuns: 1,
        inputTokens: aiRuns[0].input_tokens,
        outputTokens: aiRuns[0].output_tokens,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ status: "failed", stage, code: failureCode(error) }),
    );
    process.exitCode = 1;
  } finally {
    if (storageKey) {
      await createResumeStorage()
        .remove(storageKey)
        .catch(() => cleanupFailures.push("storage"));
    }
    if (organizationId) {
      const { error } = await admin
        .from("organizations")
        .delete()
        .eq("id", organizationId);
      if (error) cleanupFailures.push("organization");
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) cleanupFailures.push("user");
    }
    if (cleanupFailures.length > 0) {
      console.error(JSON.stringify({ status: "cleanup_failed" }));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ cleanup: "complete", successful }));
    }
  }
}

await main();
