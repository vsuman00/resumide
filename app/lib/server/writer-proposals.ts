import { z } from "zod";
import type { RewriteSource } from "./rewrite-sources";
import type { ResumeWriterZod } from "./schema";

export const WriterProposalSchema = z.strictObject({
  summary: z.string().min(1).max(1200).nullable(),
  bullets: z
    .array(
      z.strictObject({
        sourceId: z.number().int().min(0).max(31),
        rewrite: z.string().min(1).max(700),
        reasoning: z.string().min(1).max(500),
      }),
    )
    .max(4),
});
export function resolveWriterProposals(
  raw: z.infer<typeof WriterProposalSchema>,
  sources: RewriteSource[],
): ResumeWriterZod {
  const seen = new Set<number>();
  return {
    summary: raw.summary,
    bullets: raw.bullets.flatMap((b) => {
      const source = sources.find((s) => s.id === b.sourceId);
      if (!source || seen.has(b.sourceId)) return [];
      seen.add(b.sourceId);
      return [
        { original: source.text, rewrite: b.rewrite, reasoning: b.reasoning },
      ];
    }),
  };
}
