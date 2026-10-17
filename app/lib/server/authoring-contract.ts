import { checkWritingQuality } from "../writing-quality";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";
import {
  ScoreDiagnosticsSchema,
  type ScoreDiagnostics,
} from "./score-v2-engine";
export const ClarificationKind = z.enum([
  "result",
  "measurement",
  "scope",
  "method",
  "ownership",
]);
export const BulletPattern = z.enum([
  "xyz",
  "action_impact_context",
  "action_scope_result",
]);
export { QUESTIONS } from "../authoring-ui";
export const SuggestionPatchSchema = z.strictObject({
  schemaVersion: z.literal("suggestion-patch/1.0.0"),
  id: z.uuid(),
  producerVersion: z.literal("grounded-patterns/1.0.0"),
  baseVersionId: z.uuid(),
  targetFactId: z.uuid(),
  sectionId: z.uuid(),
  entryId: z.uuid(),
  sourceFactIds: z.array(z.uuid()).length(1),
  affectedRuleIds: z.array(z.string().min(1).max(100)).max(20),
  affectedRequirementIds: z.array(z.uuid()).max(300),
  pattern: BulletPattern,
  operations: z
    .array(
      z.strictObject({
        operation: z.literal("replace_fact"),
        factId: z.uuid(),
        value: z.string().min(1).max(2000),
      }),
    )
    .length(1),
  rationale: z.string().min(1).max(500),
  confidence: z.strictObject({
    kind: z.literal("uncalibrated"),
    value: z.null(),
  }),
  clarificationNeeds: z.array(ClarificationKind).max(5),
  state: z.enum(["ready", "clarification_required"]),
});
export type SuggestionPatch = z.infer<typeof SuggestionPatchSchema>;
export function clarifyValue(
  raw: string,
  kind: z.infer<typeof ClarificationKind>,
  answer: string,
) {
  const clean = z
    .string()
    .min(1)
    .max(300)
    .refine(
      (s) =>
        s === s.trim() &&
        !Array.from(s).some(
          (c) =>
            c.charCodeAt(0) < 32 ||
            (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
        ),
    )
    .parse(answer);
  const label = kind[0].toUpperCase() + kind.slice(1) + ": ";
  const lines = raw
    .split("\n")
    .filter((line, i) => i === 0 || !line.startsWith(label));
  return z
    .string()
    .max(2000)
    .parse([...lines, label + clean].join("\n"));
}
export function patternValue(
  value: string,
  pattern: z.infer<typeof BulletPattern>,
) {
  const parts: Partial<Record<z.infer<typeof ClarificationKind>, string>> = {};
  const lines = value.split("\n");
  for (const kind of ClarificationKind.options) {
    const label = kind[0].toUpperCase() + kind.slice(1) + ": ";
    const matches = lines.slice(1).filter((l) => l.startsWith(label));
    if (matches.length === 1) {
      const answer = matches[0].slice(label.length);
      if (
        answer.trim() &&
        !/^(unknown|n\/?a|none|not known|no measurement)$/iu.test(answer.trim())
      )
        parts[kind] = answer;
    }
  }
  const required =
    pattern === "xyz"
      ? (["result", "measurement", "method"] as const)
      : (["result", "scope"] as const);
  const missing = required.filter((kind) => !parts[kind]);
  if (missing.length) return { value, missing };
  const generated =
    pattern === "xyz"
      ? `${parts.result}; measured by ${parts.measurement}; by ${parts.method}.`
      : pattern === "action_impact_context"
        ? `${lines[0]}; impact: ${parts.result}; context: ${parts.scope}.`
        : `${lines[0]}; scope: ${parts.scope}; result: ${parts.result}.`;
  return { value: z.string().min(1).max(2000).parse(generated), missing };
}
export function locateFact(doc: CanonicalResumeDraft, factId: string) {
  for (const section of doc.sections)
    for (const entry of section.entries)
      if (
        entry.factIds.includes(factId) ||
        entry.bullets.some((b) => b.factIds.includes(factId))
      )
        return { sectionId: section.id, entryId: entry.id };
  return null;
}
export function buildSuggestion(
  raw: unknown,
  factId: string,
  pattern: z.infer<typeof BulletPattern>,
  diagnostics: ScoreDiagnostics,
): SuggestionPatch {
  const doc = CanonicalResumeDraftSchema.parse(raw),
    score = ScoreDiagnosticsSchema.parse(diagnostics);
  if (score.score.canonicalVersionId !== doc.versionId)
    throw Error("STALE_DIAGNOSTICS");
  if (doc.locale !== "en-IN" || score.readiness.state === "unsupported")
    throw Error("UNSUPPORTED_PATCH_DOMAIN");
  const fact = doc.facts.find((f) => f.id === factId),
    location = locateFact(doc, factId);
  if (!fact || fact.type !== "contribution" || !location)
    throw Error("UNSUPPORTED_PATCH_TARGET");
  const composed = patternValue(fact.value, pattern),
    confirmed = fact.state === "candidate_confirmed";
  const hash = createHash("sha256")
    .update(JSON.stringify([doc.versionId, fact.id, pattern, composed.value]))
    .digest("hex");
  return SuggestionPatchSchema.parse({
    schemaVersion: "suggestion-patch/1.0.0",
    id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
    producerVersion: "grounded-patterns/1.0.0",
    baseVersionId: doc.versionId,
    targetFactId: fact.id,
    ...location,
    sourceFactIds: [fact.id],
    affectedRuleIds: score.rules
      .filter((r) =>
        r.citations.some((c) => c.kind === "fact" && c.id === fact.id),
      )
      .map((r) => r.id),
    affectedRequirementIds: score.alignment
      .filter((a) => a.factIds.includes(fact.id))
      .flatMap((a) => a.sourceRequirementIds),
    pattern,
    operations: [
      { operation: "replace_fact", factId: fact.id, value: composed.value },
    ],
    rationale:
      "Reorder only candidate-confirmed contribution and clarification text. Review every proposed claim before accepting.",
    confidence: { kind: "uncalibrated", value: null },
    clarificationNeeds: composed.missing,
    state:
      confirmed && !composed.missing.length
        ? "ready"
        : "clarification_required",
  });
}
export function validateSuggestion(
  raw: unknown,
  doc: CanonicalResumeDraft,
  diagnostics: ScoreDiagnostics,
) {
  const patch = SuggestionPatchSchema.parse(raw);
  const expected = buildSuggestion(
    doc,
    patch.targetFactId,
    patch.pattern,
    diagnostics,
  );
  if (
    JSON.stringify(patch) !== JSON.stringify(expected) ||
    patch.state !== "ready"
  )
    throw Error("UNSUPPORTED_OR_STALE_PATCH");
  const quality = checkWritingQuality(
    patch.operations[0].value,
    doc.facts.find((f) => f.id === patch.targetFactId)!.value,
  );
  if (quality.unsupportedNumbers.length || quality.newSeniorityTerms.length)
    throw Error("UNSUPPORTED_FACTUAL_STRENGTH");
  return patch;
}
export function buildFindings(
  doc: CanonicalResumeDraft,
  diagnostics: ScoreDiagnostics,
) {
  if (diagnostics.score.canonicalVersionId !== doc.versionId)
    throw Error("STALE_DIAGNOSTICS");
  const first = (types: string[]) =>
    doc.facts.find((f) => types.includes(f.type))?.id ?? null;
  const rules = diagnostics.rules
    .filter((r) => r.state !== "pass" && r.state !== "not_applicable")
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      priority: r.critical ? "source_first" : "review",
      effort: "review required",
      targetFactId: r.id.includes("contact")
        ? first(["name", "email", "phone"])
        : r.id.includes("date")
          ? first(["dates"])
          : r.id.includes("duplication")
            ? first(["contribution"])
            : null,
      nonEditableReason:
        "This finding requires source or structure review; editing prose cannot establish missing evidence.",
    }));
  const alignment = diagnostics.alignment
    .filter((a) => a.state !== "not_applicable")
    .map((a) => ({
      id: a.id,
      reason: a.reason,
      priority:
        a.importance === "required"
          ? "required_review"
          : a.importance === "preferred"
            ? "preferred_review"
            : "review",
      effort: "review required",
      targetFactId:
        a.factIds.find((id) => doc.facts.some((f) => f.id === id)) ?? null,
      nonEditableReason:
        "No verified editable fact supports this requirement. Clarify evidence rather than inventing a qualification.",
    }));
  const rank: Record<string, number> = {
    source_first: 4,
    required_review: 3,
    review: 2,
    preferred_review: 1,
  };
  const all = [...rules, ...alignment].sort(
    (a, b) => rank[b.priority] - rank[a.priority],
  );
  return { top: all.slice(0, 5), remaining: all.slice(5), total: all.length };
}
const common = { expectedVersionId: z.uuid(), idempotencyKey: z.uuid() };
export const AuthoringCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...common,
    action: z.literal("edit"),
    targetFactId: z.uuid(),
    value: z
      .string()
      .min(1)
      .max(2000)
      .refine((v) => v === v.trim()),
  }),
  z.strictObject({
    ...common,
    action: z.literal("confirm"),
    targetFactId: z.uuid(),
  }),
  z.strictObject({
    ...common,
    action: z.literal("rename"),
    sectionId: z.uuid(),
    value: z
      .string()
      .min(1)
      .max(100)
      .refine((v) => v === v.trim()),
  }),
  z.strictObject({
    ...common,
    action: z.literal("clarify"),
    targetFactId: z.uuid(),
    questionKind: ClarificationKind,
    value: z.string().min(1).max(300),
    confirmation: z.literal(true),
  }),
  z.strictObject({
    ...common,
    action: z.literal("accept"),
    patch: SuggestionPatchSchema,
    confirmation: z.literal(true),
  }),
  z.strictObject({
    ...common,
    action: z.literal("reject"),
    patch: SuggestionPatchSchema,
  }),
  z.strictObject({ ...common, action: z.literal("undo") }),
  z.strictObject({
    ...common,
    action: z.literal("restore"),
    targetVersionId: z.uuid(),
  }),
]);
export type AuthoringCommand = z.infer<typeof AuthoringCommandSchema>;
export function withheldDelta(
  baseVersionId: string,
  actualVersionId: string | null,
  policyId: string,
) {
  return {
    label: actualVersionId
      ? "actual saved-version diagnostics"
      : "projected before acceptance",
    baseVersionId,
    actualVersionId,
    policyId,
    value: null,
    delta: null,
    reason:
      "Numeric scores and deltas require accepted calibration and policy.",
  };
}
