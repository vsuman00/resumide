import { createHash, randomUUID } from "node:crypto";
import { atsRules } from "./atsRules";
import { parseSim } from "./parseSim";
import { createSupabaseAdminClient } from "./supabase";

import { hasUncalibratedEvidence } from "./evidence-scoring-guard";

export const PARSER_VERSION = "parse-sim-v1";
export const RULESET_VERSION = "ats-rules-v3";
export const NORMALIZER_VERSION = "normalizer-v1";

export function scoreExtractedResume(args: {
  text: string;
  pageCount: number;
  pageTexts?: readonly string[];
  jobDescription: string;
  textChecksum: string;
}) {
  const parseView = parseSim({
    text: args.text,
    totalPages: args.pageCount,
    pageTexts: args.pageTexts,
  });
  const rules = atsRules({
    text: args.text,
    jobDescription: args.jobDescription,
    parseView,
  });
  const keywordCoverage = {
    taxonomyVersion: rules.taxonomyVersion,
    job: rules.jdKeywords,
    matched: rules.matchedKeywords,
    missing: rules.missingKeywords,
    uncertain: rules.uncertainKeywords,
    evidence: rules.matchingEvidence,
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
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analyses")
    .select(
      "status, request_id, jobs(description), analysis_extractions(extracted_text, text_checksum, page_count, page_texts)",
    )
    .eq("id", analysisId)
    .single();
  if (error || !data) throw new Error("Scoring input is unavailable.");
  if (data.status !== "scoring") return false;

  const extraction = Array.isArray(data.analysis_extractions)
    ? data.analysis_extractions[0]
    : data.analysis_extractions;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  if (!extraction) throw new Error("Persisted extraction is unavailable.");

  if (await hasUncalibratedEvidence(admin, analysisId)) return false;

  const result = scoreExtractedResume({
    text: extraction.extracted_text,
    pageCount: extraction.page_count,
    pageTexts: extraction.page_texts ?? undefined,
    jobDescription: job?.description ?? "",
    textChecksum: extraction.text_checksum,
  });
  const processId = `scorer-${randomUUID()}`;
  const requestId = data.request_id || `worker-${randomUUID()}`;
  const { data: persisted, error: persistError } = await admin.rpc(
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
  );
  if (persistError || persisted !== true) {
    throw new Error("Deterministic result persistence failed.");
  }
  return true;
}
