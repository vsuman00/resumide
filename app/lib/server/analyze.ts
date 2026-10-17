import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  type AnalysisResultZod,
  type FeedbackZod,
  type ParseViewZod,
} from "./schema";
import { parseSim } from "./parseSim";
import { atsRules } from "./atsRules";
import { extractResumeText, ResumeExtractionError } from "./extract";
import { PublicApiError } from "./errors";
import {
  ProseAnalysisSchema,
  PROSE_INSTRUCTIONS,
  groundQualitativeProse,
  legacyCategoryFromProse,
  BASELINE_SEMANTICS,
} from "./qualitative-prose";
import { getAnalysisConfig } from "./config";

function getClient(): OpenAI {
  const config = getAnalysisConfig();
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    timeout: config.OPENAI_TIMEOUT_MS,
  });
}

function getModel(): string {
  return getAnalysisConfig().OPENAI_MODEL;
}

let activeAnalyses = 0;

// Run the analysis pipeline: extract text, parse-sim, deterministic ATS
// rules, then the LLM pass for the 4 qualitative dimensions. Assembles
// the full AnalysisResult envelope so the LLM no longer scores ATS.
export async function analyzeResume(args: {
  pdf: Buffer | Uint8Array;
  jobTitle: string;
  jobDescription: string;
}): Promise<AnalysisResultZod> {
  const config = getAnalysisConfig();
  if (activeAnalyses >= config.ANALYSIS_CONCURRENCY) {
    throw new PublicApiError(
      "SERVICE_UNAVAILABLE",
      "The analysis service is busy. Please try again.",
      503,
      true,
    );
  }

  activeAnalyses += 1;
  try {
    return await runAnalysis(args, config);
  } finally {
    activeAnalyses -= 1;
  }
}

async function runAnalysis(
  args: { pdf: Buffer | Uint8Array; jobTitle: string; jobDescription: string },
  config: ReturnType<typeof getAnalysisConfig>,
): Promise<AnalysisResultZod> {
  let extracted: Awaited<ReturnType<typeof extractResumeText>>;
  try {
    extracted = await extractResumeText(args.pdf, {
      maxPages: config.MAX_PDF_PAGES,
      maxCharacters: config.MAX_EXTRACTED_CHARACTERS,
    });
  } catch (error) {
    if (error instanceof ResumeExtractionError) {
      const message =
        error.code === "PAGE_LIMIT"
          ? "The PDF has too many pages."
          : error.code === "EMPTY_TEXT"
            ? "The PDF contains no extractable text and may require OCR."
            : error.code === "TEXT_LIMIT"
              ? "The PDF contains too much text."
              : "The PDF could not be processed and may be malformed or encrypted.";
      throw new PublicApiError("UNPROCESSABLE_INPUT", message, 422);
    }
    throw error;
  }
  const { totalPages, text, pageTexts } = extracted;

  const instructions = PROSE_INSTRUCTIONS;
  const userMessage = JSON.stringify({
    resumeText: text,
    jobTitle: args.jobTitle,
    jobDescription: args.jobDescription,
  });

  // Parse-simulation + deterministic ATS run first — they're pure, no LLM,
  // no API key, and they don't depend on the LLM's output. Failures here
  // are bugs in our code, not in the model.
  const parseView: ParseViewZod = parseSim({ text, totalPages, pageTexts });
  const rules = atsRules({
    text,
    jobDescription: args.jobDescription,
    parseView,
  });

  // ponytail: gpt-5.6 reasoning family rejects non-default temperature
  // ("Only the default (1) value is supported"), which surfaced as the 500
  // on /api/analyze. Omit it so the SDK uses the model's default.
  const completion = await getClient().chat.completions.parse({
    model: getModel(),
    max_completion_tokens: config.OPENAI_MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userMessage },
    ],
    response_format: zodResponseFormat(
      ProseAnalysisSchema,
      "qualitative_analysis",
    ),
  });

  const raw = completion.choices[0]?.message?.parsed;
  const qualitative = raw ? groundQualitativeProse(raw, text) : null;
  if (!qualitative) {
    throw new Error("OpenAI returned no parsed qualitative feedback.");
  }

  // Assemble the frozen Feedback contract from the deterministic ATS block
  // + cited unscored prose. The overall value is the deterministic baseline.
  const feedback: FeedbackZod = {
    scoreSemantics: BASELINE_SEMANTICS,
    overallScore: rules.score,
    ATS: { score: rules.score, tips: rules.tips },
    toneAndStyle: legacyCategoryFromProse(qualitative.toneAndStyle),
    content: legacyCategoryFromProse(qualitative.content),
    structure: legacyCategoryFromProse(qualitative.structure),
    skills: legacyCategoryFromProse(qualitative.skills),
  };

  return {
    feedback,
    parseView,
    ruleTrace: rules.ruleTrace,
    jdKeywords: rules.jdKeywords,
    matchedKeywords: rules.matchedKeywords,
    missingKeywords: rules.missingKeywords,
    uncertainKeywords: rules.uncertainKeywords,
    keywordEvidence: rules.matchingEvidence,
    writer: qualitative.writer,
  };
}
