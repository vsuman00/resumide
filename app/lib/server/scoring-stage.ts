import { createHash, randomUUID } from "node:crypto";
import { atsRules } from "./atsRules";
import { parseSim } from "./parseSim";
import { createSupabaseAdminClient } from "./supabase";
import { getAnalysisConfig } from "./config";
import {
  finishLegacyScoringInput,
  LegacyScoringInputError,
  LegacyScoringLeaseSchema,
  loadLegacyScoringInput,
} from "./legacy-scoring-input";

import { hasUncalibratedEvidence } from "./evidence-scoring-guard";
import {
  assertAnalysisStageActive,
  assertAnalysisStageLease,
  persistAnalysisStage,
  type AnalysisStageOptions,
} from "./analysis-stage-fence";

export const PARSER_VERSION = "parse-sim-v1";
export const RULESET_VERSION = "ats-rules-v4";
export const NORMALIZER_VERSION = "normalizer-v1";

/** Drops per-line section maps and caps list sizes so the stored JSON stays small. */
function compactTyped(
  typed: NonNullable<ReturnType<typeof atsRules>["typed"]>,
) {
  const { structure, ...rest } = typed;
  return {
    ...rest,
    profile: {
      version: structure.version,
      roles: structure.roles.slice(0, 20),
      education: structure.education.slice(0, 10),
      totalMonths: structure.totalMonths,
      internMonths: structure.internMonths,
    },
  };
}

export function scoreExtractedResume(args: {
  text: string;
  pageCount: number;
  pageTexts?: readonly string[];
  /** Stored extraction warnings; only structure findings are shown (ATS-15). */
  extractionWarnings?: readonly unknown[] | null;
  jobDescription: string;
  textChecksum: string;
  matcher?: "legacy" | "v2";
}) {
  const parseView = parseSim({
    text: args.text,
    totalPages: args.pageCount,
    pageTexts: args.pageTexts,
    extractionWarnings: args.extractionWarnings,
  });
  const rules = atsRules({
    text: args.text,
    jobDescription: args.jobDescription,
    parseView,
    matcher: args.matcher,
  });
  const keywordCoverage = {
    taxonomyVersion: rules.taxonomyVersion,
    job: rules.jdKeywords,
    matched: rules.matchedKeywords,
    missing: rules.missingKeywords,
    uncertain: rules.uncertainKeywords,
    evidence: rules.matchingEvidence,
    // Typed result for the v2 matcher: requirements by importance, application checks,
    // title alignment and the parsed profile. Absent for the legacy matcher.
    ...(rules.typed ? { typed: compactTyped(rules.typed) } : {}),
  };
  const payload = {
    score: rules.score,
    parseView,
    ruleTrace: rules.ruleTrace,
    keywordCoverage,
    inputTextChecksum: args.textChecksum,
    parserVersion: PARSER_VERSION,
    rulesetVersion: RULESET_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    taxonomyVersion: rules.taxonomyVersion,
  };

  return {
    ...payload,
    resultChecksum: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
  };
}

export async function processScoringStage(
  analysisId: string,
  options: AnalysisStageOptions = {},
): Promise<boolean> {
  assertAnalysisStageActive(options);
  const admin = createSupabaseAdminClient();
  if (getAnalysisConfig().LEGACY_SCORING_INPUT_ENABLED === true) {
    const lease = LegacyScoringLeaseSchema.safeParse(options.lease);
    if (!lease.success) throw new LegacyScoringInputError("invalid");
    const input = await loadLegacyScoringInput(
      admin,
      analysisId,
      lease.data,
      options,
    );
    assertAnalysisStageActive(options);
    if (input.status !== "ready") return false;
    if (await hasUncalibratedEvidence(admin, analysisId)) return false;
    assertAnalysisStageActive(options);
    const context = input.context;
    const result = scoreExtractedResume({
      text: context.extraction.text,
      pageCount: context.extraction.pageCount,
      pageTexts: context.extraction.pageTexts,
      jobDescription:
        context.job.kind === "none" ? "" : context.job.description,
      textChecksum: context.extraction.textChecksum,
    });
    assertAnalysisStageActive(options);
    await finishLegacyScoringInput(
      admin,
      {
        analysisId,
        lease: lease.data,
        binding: context.binding,
        result,
        processId: `scorer-${randomUUID()}`,
        requestId: context.requestId || `worker-${randomUUID()}`,
      },
      options,
    );
    assertAnalysisStageActive(options);
    return true;
  }
  await assertAnalysisStageLease(admin, analysisId, options);
  const { data, error } = await admin
    .from("analyses")
    .select(
      "status, request_id, jobs(description), analysis_extractions(extracted_text, text_checksum, page_count, page_texts, warnings)",
    )
    .eq("id", analysisId)
    .single();
  assertAnalysisStageActive(options);
  if (error || !data) throw new Error("Scoring input is unavailable.");
  if (data.status !== "scoring") return false;

  const extraction = Array.isArray(data.analysis_extractions)
    ? data.analysis_extractions[0]
    : data.analysis_extractions;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  if (!extraction) throw new Error("Persisted extraction is unavailable.");

  const uncalibrated = await hasUncalibratedEvidence(admin, analysisId);
  assertAnalysisStageActive(options);
  if (uncalibrated) return false;
  await assertAnalysisStageLease(admin, analysisId, options);

  const result = scoreExtractedResume({
    text: extraction.extracted_text,
    pageCount: extraction.page_count,
    pageTexts: extraction.page_texts ?? undefined,
    extractionWarnings: extraction.warnings,
    jobDescription: job?.description ?? "",
    textChecksum: extraction.text_checksum,
    matcher: getAnalysisConfig().MATCHER_V2_ENABLED ? "v2" : "legacy",
  });
  const processId = `scorer-${randomUUID()}`;
  const requestId = data.request_id || `worker-${randomUUID()}`;
  assertAnalysisStageActive(options);
  const { data: persisted, error: persistError } = await persistAnalysisStage(
    admin,
    analysisId,
    "persist_deterministic_analysis",
    {
      p_analysis_id: analysisId,
      p_input_text_checksum: result.inputTextChecksum,
      p_keyword_coverage: result.keywordCoverage,
      p_normalizer_version: result.normalizerVersion,
      p_parse_view: result.parseView,
      p_parser_version: result.parserVersion,
      p_process_id: processId,
      p_request_id: requestId,
      p_result_checksum: result.resultChecksum,
      p_rule_trace: result.ruleTrace,
      p_ruleset_version: result.rulesetVersion,
      p_score: result.score,
      p_taxonomy_version: result.taxonomyVersion,
    },
    options,
  );
  if (persistError || persisted !== true) {
    throw new Error("Deterministic result persistence failed.");
  }
  return true;
}
