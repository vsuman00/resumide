import { z } from "zod";
import { loadCanonical, CanonicalError } from "./canonical-repository";
import { loadJobRequirements } from "./job-requirement-repository";
import { DocumentEvidenceSchema } from "./document-evidence";
import { buildScoreDiagnostics } from "./score-v2-engine";
import type { createSupabaseAdminClient } from "./supabase";
type Client = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
export const ScoreReadOptions = z.strictObject({
  canonical: z.uuid().optional(),
  requirements: z.uuid().optional(),
  expectedCanonical: z.uuid().optional(),
  expectedRequirements: z.uuid().optional(),
});
export async function loadScoreDiagnostics(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown = {},
) {
  const parsed = ScoreReadOptions.safeParse(raw);
  if (!parsed.success)
    throw new CanonicalError(422, "Choose valid scoring input versions.");
  const options = parsed.data;
  const canonical = await loadCanonical(client, analysisId, ownerId, {
    versionId: options.canonical,
  });
  if (!canonical.current)
    throw new CanonicalError(
      422,
      "Import your structured resume before reviewing scoring diagnostics.",
    );
  const doc = canonical.current.document;
  const analysis = await client
    .from("analyses")
    .select("job_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (analysis.error)
    throw new CanonicalError(503, "Scoring inputs are unavailable.");
  if (!analysis.data)
    throw new CanonicalError(404, "Scoring inputs not found.");
  const requirements = analysis.data.job_id
    ? await loadJobRequirements(client, analysisId, ownerId, {
        versionId: options.requirements,
      })
    : null;
  if (!requirements && options.requirements)
    throw new CanonicalError(404, "Scoring inputs not found.");
  if (
    (options.expectedCanonical &&
      options.expectedCanonical !== canonical.headId) ||
    (options.expectedRequirements &&
      options.expectedRequirements !== requirements?.headId)
  )
    throw new CanonicalError(
      409,
      "Scoring inputs changed. Reload before continuing.",
    );
  const evidence = await client
    .from("document_evidence_attempts")
    .select("envelope,resume_version_id,input_sha256")
    .eq("id", doc.sourceEvidenceVersionId!)
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const source = await client
    .from("resume_versions")
    .select("page_count")
    .eq("id", canonical.current.sourceId)
    .eq("owner_id", ownerId)
    .eq("organization_id", doc.organizationId)
    .maybeSingle();
  if (evidence.error || source.error)
    throw new CanonicalError(503, "Scoring inputs are unavailable.");
  const envelope = DocumentEvidenceSchema.safeParse(evidence.data?.envelope);
  if (
    !source.data ||
    !envelope.success ||
    evidence.data?.resume_version_id !== canonical.current.sourceId ||
    evidence.data?.input_sha256 !== doc.inputSha256 ||
    envelope.data.sourceId !== canonical.current.sourceId
  )
    throw new CanonicalError(422, "Scoring evidence failed integrity checks.");
  let diagnostics;
  try {
    diagnostics = buildScoreDiagnostics({
      evidence: envelope.data,
      canonical: doc,
      requirements: requirements?.current?.document ?? null,
      ...(source.data.page_count == null
        ? {}
        : { expectedPageCount: source.data.page_count }),
    });
  } catch {
    throw new CanonicalError(422, "Scoring inputs failed integrity checks.");
  }
  // Recheck deletion/active ownership and moving heads before releasing private data.
  const final = await loadCanonical(client, analysisId, ownerId, {
    versionId: doc.versionId,
  });
  const finalRequirements = requirements
    ? await loadJobRequirements(client, analysisId, ownerId, {
        versionId: requirements.current?.document.id,
      })
    : null;
  const finalAnalysis = await client
    .from("analyses")
    .select("job_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (finalAnalysis.error)
    throw new CanonicalError(503, "Scoring inputs are unavailable.");
  if (!finalAnalysis.data)
    throw new CanonicalError(404, "Scoring inputs not found.");
  if (finalAnalysis.data.job_id !== analysis.data.job_id)
    throw new CanonicalError(
      409,
      "Scoring inputs changed. Reload before continuing.",
    );
  if (
    final.headId !== canonical.headId ||
    finalRequirements?.headId !== requirements?.headId
  )
    throw new CanonicalError(
      409,
      "Scoring inputs changed. Reload before continuing.",
    );
  return {
    analysisId,
    diagnostics,
    sourceExcerpts: envelope.data.spans
      .filter((span) =>
        diagnostics.rules.some((rule) =>
          rule.citations.some(
            (c) => c.kind === "document_span" && c.id === span.id,
          ),
        ),
      )
      .slice(0, 20)
      .map((span) => ({
        id: span.id,
        text: Array.from(span.text).slice(0, 2000).join(""),
        truncated: Array.from(span.text).length > 2000,
      })),
    canonical: {
      versionId: doc.versionId,
      revision: canonical.current.revision,
      headId: canonical.headId,
    },
    requirements: requirements?.current
      ? {
          versionId: requirements.current.document.id,
          revision: requirements.current.revision,
          headId: requirements.headId,
        }
      : null,
    historical:
      doc.versionId !== canonical.headId ||
      (!!requirements?.current &&
        requirements.current.document.id !== requirements.headId),
  };
}
