import { createHash } from "node:crypto";
import { z } from "zod";
import {
  QUALITATIVE_SUPPORT_POLICY,
  QUALITATIVE_SUPPORT_POLICY_SHA256,
  QualitativeSourceProseSchema,
  QualitativeSupportSchema,
} from "./qualitative-support";
import { WRITING_SUPPORT_POLICY_VERSION } from "./writing-support";

export const INITIAL_FEEDBACK_PLAN_POLICY_VERSION =
  "initial-feedback-plan-policy/1.0.0";
export const INITIAL_FEEDBACK_CATEGORIES = [
  "toneAndStyle",
  "content",
  "structure",
  "skills",
] as const;
export const INITIAL_FEEDBACK_VERBS = [
  "original",
  "source_lower",
  "source_title",
  "Built",
  "built",
  "Created",
  "created",
  "Developed",
  "developed",
  "Reduced",
  "reduced",
] as const;
export const INITIAL_FEEDBACK_MEASURED_TEMPLATES = [
  "Makes the measured outcome clearer.",
  "Clarifies the measured contribution.",
  "Clarifies the existing measured contribution.",
  "Clarifies the existing contribution and measured result.",
  "Clarifies the result.",
] as const;
export const INITIAL_FEEDBACK_PLAN_POLICY = Object.freeze({
  version: INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
  authority: "source_content_only",
  ownedVersionProof: "not_provided",
  supportVersion: QUALITATIVE_SUPPORT_POLICY.version,
  supportSha256: QUALITATIVE_SUPPORT_POLICY_SHA256,
  writingSupportPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
  reference:
    "exact_unicode_code_point_slice_and_utf8_sha256;whole_derived_anchor_for_anchorref",
  legacyAnchorIds: "unchanged_utf16_offsets_in_existing_source_hash_namespace",
  operators: [
    "copy_source",
    "normalize_layout",
    "rewrite_clauses",
    "role_summary",
    "compose_explicit_role_contribution",
    "editorial_fixed",
    "editorial_measured",
    "editorial_object_prefix",
    "clarification_fixed",
    "clarification_question",
  ],
  verbs: INITIAL_FEEDBACK_VERBS,
  clauseJoin: "; ",
  normalization:
    "exact_frozen_comparable_or_guarded_comparableProse;no_generic_locale_fold",
  terminal: "as_rendered_or_append_one_period_only_without_url_or_mailto",
  templatePeriod: "strip_one_final_ascii_period_then_append_iff_selected",
  editorialTemplates: QUALITATIVE_SUPPORT_POLICY.editorialTemplates,
  measuredTemplates: INITIAL_FEEDBACK_MEASURED_TEMPLATES,
  clarificationTemplates: QUALITATIVE_SUPPORT_POLICY.clarificationTemplates,
  questionGrammar: QUALITATIVE_SUPPORT_POLICY.questionGrammar,
  admission:
    "actual_frozen_core;byte_exact_complete_retained_output;no_caller_assessments",
  mapping:
    "original_index_to_compacted_retained_and_explicit_min3_legacy_padding",
  nativeScope: "retained_output_only;full_node_observation_capture_only",
  limits: {
    sourceUtf16: 100000,
    anchors: 512,
    clauses: 16,
    citationAnchors: 16,
    assessments: 73,
    expressions: 41,
    inputJsonBytes: 65536,
    plannerWorkUnits: 8000000,
  },
});
export const INITIAL_FEEDBACK_PLAN_POLICY_SHA256 = createHash("sha256")
  .update(JSON.stringify(INITIAL_FEEDBACK_PLAN_POLICY))
  .digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const index = z.number().int().min(0).max(3);
const category = z.enum(INITIAL_FEEDBACK_CATEGORIES);
export const InitialFeedbackSpanRefSchema = z
  .strictObject({
    start: z.number().int().min(0).max(100000),
    end: z.number().int().min(1).max(100000),
    textSha256: sha,
  })
  .refine((v) => v.end > v.start);
const anchor = InitialFeedbackSpanRefSchema;
const terminal = z.enum(["as_rendered", "append_period"]);
const typography = z.enum(["basic", "admitted_prose"]);
const verb = z.enum(INITIAL_FEEDBACK_VERBS);
export const InitialFeedbackTextExprSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("copy_source"), anchor }),
  z.strictObject({
    kind: z.literal("normalize_layout"),
    anchor,
    typography,
    terminal,
  }),
  z.strictObject({
    kind: z.literal("rewrite_clauses"),
    anchor,
    clauses: z
      .array(
        z.strictObject({ sourceIndex: z.number().int().min(0).max(15), verb }),
      )
      .min(1)
      .max(16),
    typography,
    terminal,
  }),
  z.strictObject({ kind: z.literal("role_summary"), role: anchor, terminal }),
  z.strictObject({
    kind: z.literal("compose_explicit_role_contribution"),
    role: anchor,
    contribution: anchor,
    verb,
    terminal,
  }),
  z.strictObject({
    kind: z.literal("editorial_fixed"),
    templateIndex: z.number().int().min(0).max(18),
    period: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("editorial_measured"),
    anchor,
    templateIndex: z.number().int().min(0).max(4),
    period: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("editorial_object_prefix"),
    anchor,
    wordCount: z.number().int().min(1).max(4),
    period: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("clarification_fixed"),
    templateIndex: z.number().int().min(0).max(5),
    period: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("clarification_question"),
    topic: z.enum([
      "outcome",
      "result",
      "context",
      "scope",
      "method",
      "role",
      "contribution",
    ]),
    form: z.enum(["what_verify", "what_confirm", "can_verify"]),
  }),
]);
export type InitialFeedbackTextExpr = z.infer<
  typeof InitialFeedbackTextExprSchema
>;
export type InitialFeedbackSpanRef = z.infer<
  typeof InitialFeedbackSpanRefSchema
>;
const tip = z.strictObject({
  originalIndex: index,
  requestedType: z.enum(["good", "improve"]),
  quote: anchor,
  title: InitialFeedbackTextExprSchema,
  explanation: InitialFeedbackTextExprSchema,
});
const bullet = z.strictObject({
  originalIndex: index,
  original: anchor,
  rewrite: InitialFeedbackTextExprSchema,
  reasoning: InitialFeedbackTextExprSchema,
});
export const InitialFeedbackPlanSchema = z.strictObject({
  schemaVersion: z.literal("initial-feedback-plan/1.0.0"),
  sourceTextSha256: sha,
  policyVersion: z.literal(INITIAL_FEEDBACK_PLAN_POLICY_VERSION),
  toneAndStyle: z.array(tip).max(4),
  content: z.array(tip).max(4),
  structure: z.array(tip).max(4),
  skills: z.array(tip).max(4),
  writer: z.strictObject({
    summary: InitialFeedbackTextExprSchema.nullable(),
    bullets: z.array(bullet).max(4),
  }),
});
export type InitialFeedbackPlan = z.infer<typeof InitialFeedbackPlanSchema>;
const kind = z.enum([
  "source_claim",
  "editorial_observation",
  "clarification_question",
]);
const state = z.enum(["supported", "clarification_required"]);
const part = z.strictObject({
  kind,
  state,
  reason: z.enum([
    "source_transformation",
    "editorial_template",
    "clarification_template",
  ]),
  textSha256: sha,
  sourceRefs: z.array(anchor).max(16),
});
export const InitialFeedbackRetainedPartsSchema = z.strictObject({
  tips: z
    .array(
      z.strictObject({
        category,
        originalIndex: index,
        retainedIndex: index,
        type: z.enum(["good", "improve"]),
        kind,
        state,
        reason: z.enum([
          "source_transformation",
          "editorial_template",
          "question_only",
        ]),
        quote: anchor,
        title: part,
        explanation: part,
      }),
    )
    .max(16),
  writer: z.strictObject({
    summary: part.nullable(),
    bullets: z
      .array(
        z.strictObject({
          originalIndex: index,
          retainedIndex: index,
          original: anchor,
          rewrite: part,
          reasoning: part,
        }),
      )
      .max(4),
  }),
});
export const InitialFeedbackMappingSchema = z.strictObject({
  tips: z
    .array(
      z.strictObject({
        category,
        originalIndex: index,
        retainedIndex: index,
        compatibilityIndex: index,
      }),
    )
    .max(16),
  bullets: z
    .array(z.strictObject({ originalIndex: index, retainedIndex: index }))
    .max(4),
  summary: z.strictObject({ retainedIndex: z.literal(0) }).nullable(),
  padding: z
    .array(
      z.strictObject({
        category,
        compatibilityIndex: index,
        origin: z.null(),
        scope: z.literal("compatibility_only"),
      }),
    )
    .max(12),
});
const compatibleTip = z.strictObject({
  type: z.enum(["good", "improve"]),
  tip: z.string(),
  explanation: z.string(),
  quote: z.string().optional(),
});
const compatibleCategory = z.strictObject({
  score: z.literal(0),
  tips: z.array(compatibleTip).min(3).max(4),
});
const compatibility = z.strictObject({
  toneAndStyle: compatibleCategory,
  content: compatibleCategory,
  structure: compatibleCategory,
  skills: compatibleCategory,
  writer: QualitativeSourceProseSchema.shape.writer,
});
export const InitialFeedbackRenderSchema = z.strictObject({
  schemaVersion: z.literal("initial-feedback-render/1.0.0"),
  authority: z.literal("source_content_only"),
  ownedVersionProof: z.literal("not_provided"),
  policyVersion: z.literal(INITIAL_FEEDBACK_PLAN_POLICY_VERSION),
  policySha256: z.literal(INITIAL_FEEDBACK_PLAN_POLICY_SHA256),
  sourceTextSha256: sha,
  prose: QualitativeSourceProseSchema,
  parts: InitialFeedbackRetainedPartsSchema,
  mapping: InitialFeedbackMappingSchema,
  compatibility,
});
export type InitialFeedbackRender = z.infer<typeof InitialFeedbackRenderSchema>;
// Validation only for a later owned publisher. The pure renderer never fabricates this.
export const InitialFeedbackNativeSupportSchema = z.strictObject({
  schemaVersion: z.literal("initial-feedback-native-support/1.0.0"),
  scope: z.literal("retained_output_only"),
  bindingSha256: sha,
  planSha256: sha,
  parts: InitialFeedbackRetainedPartsSchema,
  mapping: InitialFeedbackMappingSchema,
});
export const InitialFeedbackNoProviderResultSchema = z.strictObject({
  kind: z.literal("deterministic_only"),
  reason: z.enum(["ai_disabled", "historical_inputs"]),
  plan: z.null(),
  observation: z.null(),
});
const failureReason = z.enum([
  "invalid_input",
  "source_resource_limit",
  "unsupported_output",
  "native_incompatible",
]);
export type InitialFeedbackPlanFailureReason = z.infer<typeof failureReason>;
export const InitialFeedbackCompileResultSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({
      status: z.literal("available"),
      plan: InitialFeedbackPlanSchema,
      rendered: InitialFeedbackRenderSchema,
      recordedObservation: QualitativeSupportSchema,
    }),
    z.strictObject({
      status: z.literal("unavailable"),
      reason: failureReason,
      recordedObservation: QualitativeSupportSchema.nullable(),
    }),
  ],
);
export type InitialFeedbackCompileResult = z.infer<
  typeof InitialFeedbackCompileResultSchema
>;
export class InitialFeedbackPlanError extends Error {
  constructor(readonly reason: InitialFeedbackPlanFailureReason) {
    super("Initial feedback plan is unavailable.");
    this.name = "InitialFeedbackPlanError";
  }
}
