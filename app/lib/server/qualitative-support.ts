import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
  WRITING_SUPPORT_POLICY_VERSION,
  type WritingSupportDocument,
  type WritingSupportOutcome,
  type WritingSupportRequest,
} from "./writing-support";

const categories = ["toneAndStyle", "content", "structure", "skills"] as const;
const kinds = [
  "source_claim",
  "editorial_observation",
  "clarification_question",
] as const;
const states = ["supported", "clarification_required", "rejected"] as const;
const reasons = [
  "source_transformation",
  "editorial_template",
  "clarification_template",
  "question_only",
  "unsupported_assertion",
  "quote_missing",
  "quote_ambiguous",
  "binding_mismatch",
  "invalid_input",
  "source_resource_limit",
  "qualified_source",
  "missing_source_anchor",
] as const;
const operationKinds = [
  "copy_source",
  "normalize_layout",
  "replace_equivalent_action",
  "reorder_independent_clauses",
  "compose_explicit_role_contribution",
  "editorial_explanation",
] as const;
const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const tipSchema = z.strictObject({
  type: z.enum(["good", "improve"]),
  tip: z.string().min(1).max(500),
  explanation: z.string().min(1).max(1000),
  quote: z.string().min(1).max(500),
});
const categorySchema = z.strictObject({ tips: z.array(tipSchema).max(4) });
const writerSchema = z.strictObject({
  summary: z.string().min(1).max(1200).nullable(),
  bullets: z
    .array(
      z.strictObject({
        original: z.string().min(1).max(500),
        rewrite: z.string().min(1).max(700),
        reasoning: z.string().min(1).max(500),
      }),
    )
    .max(4),
});
/** Same legacy prose shape; the new support sidecar never widens Feedback. */
export const QualitativeSourceProseSchema = z.strictObject({
  toneAndStyle: categorySchema,
  content: categorySchema,
  structure: categorySchema,
  skills: categorySchema,
  writer: writerSchema,
});
export type QualitativeSourceProse = z.infer<
  typeof QualitativeSourceProseSchema
>;

// These are nonclaim writing requests, not a vocabulary of candidate attributes.
const editorialTemplates = Object.freeze([
  "Clarify this contribution",
  "Clarify the wording",
  "Review the wording",
  "Improve readability",
  "Clear",
  "Clear evidence",
  "Relevant",
  "Relevant content",
  "Detail",
  "Add context",
  "Clarifies wording",
  "Clarifies the wording",
  "Clarifies the contribution",
  "Clarifies the existing contribution",
  "Clarifies the technical contribution",
  "Emphasizes the existing technical contribution without adding claims",
  "Makes the source clearer",
  "Reorders the existing facts",
  "Preserves the source facts",
]);
const questionTopics = Object.freeze([
  "outcome",
  "result",
  "context",
  "scope",
  "method",
  "role",
  "contribution",
]);
const clarificationTemplates = Object.freeze([
  "Clarify your role",
  "Explain the outcome",
  "Add context you can verify",
  "Add only a result you can verify",
  "Add only a result you can verify. Leave this unanswered if the information is unavailable",
  "Leave this unanswered if the information is unavailable",
]);
export const QUALITATIVE_SUPPORT_POLICY_VERSION =
  "qualitative-content-support/1.0.0";
export const QUALITATIVE_SUPPORT_POLICY = Object.freeze({
  version: QUALITATIVE_SUPPORT_POLICY_VERSION,
  authority: "source_content_only",
  ownedVersionProof: "not_provided",
  writingSupportPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
  titleAndExplanation: "independently_assessed_against_same_exact_quote",
  factualSupport: "actual_writing_ir_source_transformations",
  editorialTemplates,
  clarificationTemplates,
  questionGrammar: Object.freeze({
    topics: questionTopics,
    forms: Object.freeze([
      "What <topic> can you verify?",
      "What <topic> can you confirm?",
      "Can you verify the <topic>?",
    ]),
    presuppositions: "unsupported",
    unknownQuestionPunctuation: "withheld_before_ir_copy",
  }),
  questions: "retained_as_improve_never_strengths_or_facts",
  unknownGrammar: "withheld_not_silently_rewritten",
  limits: Object.freeze({
    sourceUtf16: 100000,
    anchors: 512,
    citationAnchors: 16,
    itemsPerCategory: 4,
    writerBullets: 4,
    assessments: 73,
    inputJsonBytes: 65536,
  }),
});
export const QUALITATIVE_SUPPORT_POLICY_SHA256 = hash(
  JSON.stringify(QUALITATIVE_SUPPORT_POLICY),
);
const bindingSchema = z.strictObject({
  sourceSha256: digest,
  policyVersion: z.literal(QUALITATIVE_SUPPORT_POLICY_VERSION),
  policySha256: z.literal(QUALITATIVE_SUPPORT_POLICY_SHA256),
  writingSupportPolicyVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
});
const operationSchema = z.strictObject({
  kind: z.enum(operationKinds),
  anchorId: digest,
});
const partSchema = z.strictObject({
  textSha256: digest,
  kind: z.enum(kinds),
  state: z.enum(states),
  reason: z.enum(reasons),
  anchorIds: z.array(digest).max(16),
  operations: z.array(operationSchema).max(34),
});
const citationSchema = z
  .strictObject({
    quoteSha256: digest,
    offsetUnit: z.literal("unicode_code_point"),
    start: z.number().int().min(0).max(100000),
    end: z.number().int().min(1).max(100000),
    anchorIds: z.array(digest).min(1).max(16),
  })
  .refine((v) => v.end > v.start);
const itemSchema = z.strictObject({
  category: z.enum(categories),
  index: z.number().int().min(0).max(3),
  kind: z.enum(kinds),
  state: z.enum(states),
  reason: z.enum(reasons),
  retained: z.boolean(),
  type: z.enum(["good", "improve"]),
  citation: citationSchema.nullable(),
  title: partSchema,
  explanation: partSchema,
});
const writerDecisionSchema = z.strictObject({
  index: z.number().int().min(0).max(3),
  retained: z.boolean(),
  state: z.enum(states),
  reason: z.enum(reasons),
  rewrite: partSchema,
  reasoning: partSchema,
});
export const QualitativeSupportSchema = z.strictObject({
  schemaVersion: z.literal("qualitative-support/1.0.0"),
  authority: z.literal("source_content_only"),
  ownedVersionProof: z.literal("not_provided"),
  status: z.enum(["assessed", "unavailable"]),
  reason: z.enum(reasons).nullable(),
  binding: bindingSchema.nullable(),
  items: z.array(itemSchema).max(16),
  writer: z.strictObject({
    summary: partSchema.nullable(),
    bullets: z.array(writerDecisionSchema).max(4),
  }),
});
export type QualitativeSupport = z.infer<typeof QualitativeSupportSchema>;
export const QualitativeSupportResultSchema = z.strictObject({
  prose: QualitativeSourceProseSchema,
  support: QualitativeSupportSchema,
});
export type QualitativeSupportResult = z.infer<
  typeof QualitativeSupportResultSchema
>;
const expectedSchema = z.strictObject({
  sourceSha256: digest.optional(),
  policyVersion: z.string().min(1).max(100).optional(),
  policySha256: digest.optional(),
});
type Part = z.infer<typeof partSchema>;
type Reason = (typeof reasons)[number];
class SupportResourceError extends Error {}
function emptyProse(): QualitativeSourceProse {
  return {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: { summary: null, bullets: [] },
  };
}
function wellFormed(text: string) {
  for (const c of text) {
    const n = c.codePointAt(0)!;
    if (n >= 0xd800 && n <= 0xdfff) return false;
  }
  return true;
}
function templateText(text: string) {
  return text.replace(/\.$/u, "");
}
function isQuestion(text: string) {
  if (clarificationTemplates.includes(templateText(text))) return true;
  return questionTopics.some(
    (topic) =>
      text === `What ${topic} can you verify?` ||
      text === `What ${topic} can you confirm?` ||
      text === `Can you verify the ${topic}?`,
  );
}
function part(
  text: string,
  kind: Part["kind"],
  state: Part["state"],
  reason: Reason,
  anchorIds: string[] = [],
  operations: Part["operations"] = [],
): Part {
  return { textSha256: hash(text), kind, state, reason, anchorIds, operations };
}
function fromIR(text: string, outcome: WritingSupportOutcome): Part {
  if (/[?？؟]/u.test(text))
    return part(
      text,
      "clarification_question",
      "rejected",
      "unsupported_assertion",
    );
  if (outcome.state === "supported")
    return part(
      text,
      "source_claim",
      "supported",
      "source_transformation",
      outcome.sourceAnchorIds,
      outcome.operations,
    );
  if (outcome.state === "clarification_required")
    return part(
      text,
      "source_claim",
      "clarification_required",
      "qualified_source",
    );
  const reason: Reason =
    outcome.reason === "missing_source_anchor"
      ? "missing_source_anchor"
      : outcome.reason === "ambiguous_source_anchor"
        ? "quote_ambiguous"
        : "unsupported_assertion";
  return part(text, "source_claim", "rejected", reason);
}
function unavailable(
  reason: Reason,
  binding: z.infer<typeof bindingSchema> | null,
): QualitativeSupportResult {
  return {
    prose: emptyProse(),
    support: {
      schemaVersion: "qualitative-support/1.0.0",
      authority: "source_content_only",
      ownedVersionProof: "not_provided",
      status: "unavailable",
      reason,
      binding,
      items: [],
      writer: { summary: null, bullets: [] },
    },
  };
}
/** Pure source-content assessment. Expected hashes detect mismatch, never ownership. */
export function assessQualitativeProse(
  raw: unknown,
  source: unknown,
  expected: unknown = {},
): QualitativeSupportResult {
  if (typeof source !== "string") return unavailable("invalid_input", null);
  if (source.length > QUALITATIVE_SUPPORT_POLICY.limits.sourceUtf16)
    return unavailable("source_resource_limit", null);
  if (!wellFormed(source)) return unavailable("invalid_input", null);
  const binding: z.infer<typeof bindingSchema> = {
    sourceSha256: hash(source),
    policyVersion: QUALITATIVE_SUPPORT_POLICY_VERSION,
    policySha256: QUALITATIVE_SUPPORT_POLICY_SHA256,
    writingSupportPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
  };
  const exp = expectedSchema.safeParse(expected);
  if (!exp.success) return unavailable("invalid_input", binding);
  if (
    (exp.data.sourceSha256 !== undefined &&
      exp.data.sourceSha256 !== binding.sourceSha256) ||
    (exp.data.policyVersion !== undefined &&
      exp.data.policyVersion !== binding.policyVersion) ||
    (exp.data.policySha256 !== undefined &&
      exp.data.policySha256 !== binding.policySha256)
  )
    return unavailable("binding_mismatch", binding);
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return unavailable("invalid_input", binding);
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized, "utf8") >
      QUALITATIVE_SUPPORT_POLICY.limits.inputJsonBytes
  )
    return unavailable("invalid_input", binding);
  const parsed = QualitativeSourceProseSchema.safeParse(raw);
  if (!parsed.success) return unavailable("invalid_input", binding);
  const input = parsed.data;
  if (
    categories.some((c) =>
      input[c].tips.some(
        (t) => ![t.tip, t.explanation, t.quote].every(wellFormed),
      ),
    ) ||
    [
      input.writer.summary,
      ...input.writer.bullets.flatMap((b) => [
        b.original,
        b.rewrite,
        b.reasoning,
      ]),
    ].some((t) => t !== null && !wellFormed(t))
  )
    return unavailable("invalid_input", binding);
  let document: WritingSupportDocument;
  try {
    document = buildWritingSupportDocument(source);
  } catch {
    return unavailable("source_resource_limit", binding);
  }
  const cpOffsets = new Uint32Array(source.length + 1);
  let points = 0;
  for (let offset = 0; offset < source.length;) {
    const width = source.codePointAt(offset)! > 0xffff ? 2 : 1;
    cpOffsets[offset] = points;
    if (width === 2) cpOffsets[offset + 1] = points;
    offset += width;
    cpOffsets[offset] = ++points;
  }
  const memo = new Map<string, WritingSupportOutcome>();
  let assessments = 0;
  const assess = (request: WritingSupportRequest): WritingSupportOutcome => {
    const key = JSON.stringify(request),
      prior = memo.get(key);
    if (prior) return prior;
    if (++assessments > QUALITATIVE_SUPPORT_POLICY.limits.assessments)
      throw new SupportResourceError("QUALITATIVE_SUPPORT_WORK_LIMIT");
    const value = assessWritingSupport(document, {
      ...request,
      expectedSourceSha256: binding.sourceSha256,
      expectedPolicyVersion: binding.writingSupportPolicyVersion,
    });
    memo.set(key, value);
    return value;
  };
  const citation = (
    quote: string,
  ): {
    value: z.infer<typeof citationSchema> | null;
    reason: Reason | null;
  } => {
    const begin = source.indexOf(quote);
    if (!quote.trim() || begin < 0)
      return { value: null, reason: "quote_missing" };
    if (source.indexOf(quote, begin + 1) >= 0)
      return { value: null, reason: "quote_ambiguous" };
    const start = cpOffsets[begin],
      end = cpOffsets[begin + quote.length];
    const anchorIds = document.anchors
      .filter((a) => a.span.start < end && a.span.end > start)
      .map((a) => a.span.id);
    if (!anchorIds.length || anchorIds.length > 16)
      return { value: null, reason: "missing_source_anchor" };
    return {
      value: {
        quoteSha256: hash(quote),
        offsetUnit: "unicode_code_point",
        start,
        end,
        anchorIds,
      },
      reason: null,
    };
  };
  const evaluate = (text: string, quote: string, anchors: string[]): Part => {
    if (isQuestion(text))
      return part(
        text,
        "clarification_question",
        "clarification_required",
        "clarification_template",
        anchors,
      );
    if (/[?？؟]/u.test(text))
      return part(
        text,
        "clarification_question",
        "rejected",
        "unsupported_assertion",
        anchors,
      );
    if (editorialTemplates.includes(templateText(text)))
      return part(
        text,
        "editorial_observation",
        "supported",
        "editorial_template",
        anchors,
      );
    // Source-specific editorial wording must come from the actual anchored IR.
    const editorial = assess({
      kind: "editorial",
      original: quote,
      proposed: text,
    });
    if (editorial.state === "supported")
      return part(
        text,
        "editorial_observation",
        "supported",
        "editorial_template",
        editorial.sourceAnchorIds,
        editorial.operations,
      );
    return fromIR(
      text,
      assess({ kind: "rewrite", original: quote, proposed: text }),
    );
  };
  const prose = emptyProse();
  const items: QualitativeSupport["items"] = [];
  try {
    for (const category of categories)
      for (const [index, tip] of input[category].tips.entries()) {
        const cite = citation(tip.quote);
        const title = cite.value
          ? evaluate(tip.tip, tip.quote, cite.value.anchorIds)
          : part(tip.tip, "source_claim", "rejected", cite.reason!);
        const explanation = cite.value
          ? evaluate(tip.explanation, tip.quote, cite.value.anchorIds)
          : part(tip.explanation, "source_claim", "rejected", cite.reason!);
        const accepts = (p: Part) =>
          p.state === "supported" ||
          (p.kind === "clarification_question" &&
            p.reason === "clarification_template");
        const retained = !!cite.value && accepts(title) && accepts(explanation);
        const kind: Part["kind"] =
          title.kind === "clarification_question" ||
          explanation.kind === "clarification_question"
            ? "clarification_question"
            : title.kind === "source_claim" ||
                explanation.kind === "source_claim"
              ? "source_claim"
              : "editorial_observation";
        const state: Part["state"] = retained
          ? kind === "clarification_question"
            ? "clarification_required"
            : "supported"
          : title.state === "rejected" || explanation.state === "rejected"
            ? "rejected"
            : "clarification_required";
        const reason: Reason = retained
          ? kind === "clarification_question"
            ? "question_only"
            : kind === "source_claim"
              ? "source_transformation"
              : "editorial_template"
          : (cite.reason ?? "unsupported_assertion");
        const type = kind === "source_claim" && retained ? tip.type : "improve";
        items.push({
          category,
          index,
          kind,
          state,
          reason,
          retained,
          type,
          citation: cite.value,
          title,
          explanation,
        });
        if (retained) prose[category].tips.push({ ...tip, type });
      }
    let summary: Part | null = null;
    if (input.writer.summary !== null) {
      summary = fromIR(
        input.writer.summary,
        assess({ kind: "summary", proposed: input.writer.summary }),
      );
      if (summary.state === "supported")
        prose.writer.summary = input.writer.summary;
    }
    const bullets: QualitativeSupport["writer"]["bullets"] = [];
    for (const [index, b] of input.writer.bullets.entries()) {
      const rewrite = fromIR(
        b.rewrite,
        assess({ kind: "rewrite", original: b.original, proposed: b.rewrite }),
      );
      const out = assess({
        kind: "editorial",
        original: b.original,
        proposed: b.reasoning,
      });
      const reasoning: Part =
        out.state === "supported"
          ? part(
              b.reasoning,
              "editorial_observation",
              "supported",
              "editorial_template",
              out.sourceAnchorIds,
              out.operations,
            )
          : part(
              b.reasoning,
              "editorial_observation",
              out.state,
              "unsupported_assertion",
            );
      const retained =
        rewrite.state === "supported" && reasoning.state === "supported";
      bullets.push({
        index,
        retained,
        state: retained
          ? "supported"
          : rewrite.state === "rejected" || reasoning.state === "rejected"
            ? "rejected"
            : "clarification_required",
        reason: retained ? "source_transformation" : "unsupported_assertion",
        rewrite,
        reasoning,
      });
      if (retained) prose.writer.bullets.push(b);
    }
    return QualitativeSupportResultSchema.parse({
      prose,
      support: {
        schemaVersion: "qualitative-support/1.0.0",
        authority: "source_content_only",
        ownedVersionProof: "not_provided",
        status: "assessed",
        reason: null,
        binding,
        items,
        writer: { summary, bullets },
      },
    });
  } catch (error) {
    if (error instanceof SupportResourceError)
      return unavailable("source_resource_limit", binding);
    throw error;
  }
}
