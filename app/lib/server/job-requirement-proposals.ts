import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  JobRequirementsSchema,
  RequirementItemSchema,
  type JobRequirements,
} from "./job-requirements";

const ProposalSchema = z.strictObject({
  items: z
    .array(
      RequirementItemSchema.omit({
        id: true,
        dedupGroup: true,
        confidence: true,
        ambiguity: true,
        derivation: true,
      }),
    )
    .max(100),
});
export interface RequirementProposalAdapter {
  propose(input: { sourceText: string; signal: AbortSignal }): Promise<unknown>;
}
// Optional/injected adapter. The application's default performs no provider call.
export async function proposeJobRequirements(
  base: JobRequirements,
  adapter?: RequirementProposalAdapter,
  timeoutMs = 1000,
): Promise<JobRequirements> {
  const original = JobRequirementsSchema.parse(base);
  if (!adapter || original.state !== "review_required") return original;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000)
    throw new Error("JD_PROPOSAL_TIMEOUT_LIMIT");
  const controller = new AbortController();
  const child = () => ({
    ...structuredClone(original),
    id: randomUUID(),
    parentVersionId: original.id,
    createdAt: new Date().toISOString(),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await Promise.race([
      adapter.propose({
        sourceText: original.sourceText,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, timeoutMs);
      }),
    ]);
    const proposals = ProposalSchema.parse(output);
    const result = child();
    const seen = new Set<string>();
    for (const proposed of proposals.items) {
      const item = result.requirements.find(
        (r) =>
          r.type === proposed.type &&
          r.value === proposed.value &&
          r.minimumYears === proposed.minimumYears &&
          r.negated === proposed.negated &&
          JSON.stringify(r.evidence) === JSON.stringify(proposed.evidence),
      );
      if (!item || seen.has(item.id)) throw new Error("unsupported proposal");
      seen.add(item.id);
      if (
        item.importanceBasis === "explicit" &&
        (proposed.importance !== item.importance ||
          proposed.importanceBasis !== "explicit" ||
          JSON.stringify(proposed.importanceEvidence) !==
            JSON.stringify(item.importanceEvidence))
      )
        throw new Error("explicit importance changed");
      if (
        item.importanceBasis === "unknown" &&
        proposed.importance !== "unknown"
      ) {
        if (proposed.importanceBasis !== "inferred" || item.negated)
          throw new Error("inference not disclosed");
        item.importance = proposed.importance;
        item.importanceBasis = "inferred";
        item.importanceEvidence = null;
        item.derivation = "model_proposed";
        item.ambiguity.push("model_importance_review");
      }
    }
    result.warnings = [
      ...new Set([...result.warnings, "model_proposals_require_review"]),
    ];
    return JobRequirementsSchema.parse(result);
  } catch {
    return {
      ...child(),
      warnings: [
        ...new Set([...original.warnings, "model_proposals_unavailable"]),
      ],
    };
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
