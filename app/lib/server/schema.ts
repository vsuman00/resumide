import { z } from "zod";

// Frozen output contract — mirrors Feedback in types/index.d.ts exactly.
// The LLM (OpenAI Structured Outputs) and the server action both return
// this shape. The existing UI (Summary, Details, ATS, ScoreGauge, etc.)
// consumes it with zero changes.

const TipCategory = z.enum(["good", "improve"]);

const ATSDimensionalTips = z.object({
  type: TipCategory,
  tip: z.string().min(1),
});

const QualitativeTips = z.object({
  quote: z.string().min(1).max(500).optional(),
  type: TipCategory,
  tip: z.string().min(1),
  explanation: z.string().min(1),
});

const Score = z.number().int().min(0).max(100);

const CategoryWithExplanation = z.object({
  score: Score,
  tips: z.array(QualitativeTips).min(3).max(4),
});

const ATSCategory = z.object({
  score: Score,
  tips: z.array(ATSDimensionalTips).min(3).max(4),
});

// What the LLM is asked to produce. The deterministic ATS block is
// computed server-side from rules, so it's not in the LLM's responsibility.
export const QualitativeFeedbackSchema = z.object({
  toneAndStyle: CategoryWithExplanation,
  content: CategoryWithExplanation,
  structure: CategoryWithExplanation,
  skills: CategoryWithExplanation,
});

export type QualitativeFeedbackZod = z.infer<typeof QualitativeFeedbackSchema>;

const ResumeWriterSchema = z.object({
  summary: z.string().min(1).max(1_200).nullable(),
  bullets: z
    .array(
      z.object({
        original: z.string().min(1).max(500),
        rewrite: z.string().min(1).max(700),
        reasoning: z.string().min(1).max(500),
      }),
    )
    .max(4),
});

export const QualitativeAnalysisSchema = QualitativeFeedbackSchema.extend({
  writer: ResumeWriterSchema,
});

export type ResumeWriterZod = z.infer<typeof ResumeWriterSchema>;

// The full Feedback contract returned to the client. The LLM fills
// the 4 qualitative categories; the server fills ATS + overallScore
// deterministically. The shape is identical to the frozen Feedback
// in types/index.d.ts.
export const FeedbackSchema = z.object({
  scoreSemantics: z
    .literal("deterministic_baseline_no_model_ratings/1.0.0")
    .optional(),
  overallScore: Score,
  ATS: ATSCategory,
  toneAndStyle: CategoryWithExplanation,
  content: CategoryWithExplanation,
  structure: CategoryWithExplanation,
  skills: CategoryWithExplanation,
});

export type FeedbackZod = z.infer<typeof FeedbackSchema>;

// Additive: parseView feeds the new Parse View screen. Does not alter
// the frozen Feedback contract.
const SectionType = z.enum([
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "awards",
  "publications",
  "volunteer",
  "languages",
  "interests",
  "references",
  "other",
]);

export const ParseViewSchema = z.object({
  totalPages: z.number().int().min(1),
  totalLines: z.number().int().min(0),
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    links: z.array(z.string()),
    location: z.string().nullable(),
  }),
  sections: z.array(
    z.object({
      type: SectionType,
      title: z.string(),
      startLine: z.number().int().min(0),
      lineCount: z.number().int().min(0),
      bulletCount: z.number().int().min(0),
      dateStrings: z.array(z.string()),
    }),
  ),
  warnings: z.array(
    z.object({
      field: z.enum([
        "name",
        "email",
        "phone",
        "location",
        "links",
        "sections",
        "dates",
        "bullets",
        "overall",
      ]),
      severity: z.enum(["info", "warn", "error"]),
      message: z.string(),
    }),
  ),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        text: z.string(),
        lineCount: z.number().int().min(0),
        confidence: z.enum(["high", "medium", "low"]),
        warnings: z.array(z.string()),
      }),
    )
    .default([]),
});

export type ParseViewZod = z.infer<typeof ParseViewSchema>;

export const AnalysisResultSchema = z.object({
  feedback: FeedbackSchema,
  parseView: ParseViewSchema,
  ruleTrace: z.array(
    z.object({
      ruleId: z.string(),
      label: z.string(),
      passed: z.boolean(),
      outcome: z.enum(["passed", "failed", "not_evaluated"]).optional(),
      confidence: z.enum(["high", "none"]).optional(),
      weight: z.number().int().min(0),
      detail: z.string(),
      evidence: z.array(z.string()).optional(),
    }),
  ),
  jdKeywords: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  uncertainKeywords: z.array(z.string()).default([]),
  keywordEvidence: z
    .array(
      z.object({
        term: z.string(),
        taxonomyId: z.string().nullable(),
        kind: z.enum(["taxonomy", "keyword"]),
        uncertain: z.boolean().default(false),
        job: z.object({
          occurrenceCount: z.number().int().min(0),
          spans: z.array(
            z.object({
              start: z.number().int().min(0),
              end: z.number().int().min(0),
              text: z.string(),
              alias: z.string(),
            }),
          ),
        }),
        resume: z.object({
          occurrenceCount: z.number().int().min(0),
          spans: z.array(
            z.object({
              start: z.number().int().min(0),
              end: z.number().int().min(0),
              text: z.string(),
              alias: z.string(),
            }),
          ),
        }),
      }),
    )
    .default([]),
  writer: ResumeWriterSchema,
});

export type AnalysisResultZod = z.infer<typeof AnalysisResultSchema>;
