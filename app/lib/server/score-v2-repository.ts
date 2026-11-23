import {
  buildJdClauseOrderPlan,
  type JdClauseOrderPlan,
} from "./jd-clause-order-drafting";
import { z } from "zod";
import {
  buildJdRecommendations,
  type JdRecommendationPlan,
} from "./jd-recommendations";
import { loadCanonical, CanonicalError } from "./canonical-repository";
import { loadJobRequirements } from "./job-requirement-repository";
import { DocumentEvidenceSchema } from "./document-evidence";
import {
  buildScoreDiagnostics,
  type ScoreDiagnostics,
} from "./score-v2-engine";
import {
  buildTypedScoreDiagnostics,
  type TypedScoreDiagnosticResult,
} from "./typed-score-diagnostics";
import {
  loadRequirementRelationshipContext,
  RequirementRelationshipContextError,
} from "./requirement-relationship-context";
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
type ScoreReadMetadata = {
  jdClauseOrderPlan?: JdClauseOrderPlan;
  jdRecommendations?: JdRecommendationPlan;
  analysisId: string;
  sourceExcerpts: { id: string; text: string; truncated: boolean }[];
  canonical: { versionId: string; revision: number; headId: string | null };
  requirements: {
    versionId: string;
    revision: number;
    headId: string | null;
  } | null;
  historical: boolean;
};
export type ScoreDiagnosticReadModel = ScoreReadMetadata &
  (
    | { diagnostics: ScoreDiagnostics; typedCoverage?: undefined }
    | TypedScoreDiagnosticResult
  );

export async function loadScoreDiagnostics(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown = {},
  canonicalSnapshot?: Awaited<ReturnType<typeof loadCanonical>>,
  serverOptions?: { clauseOrderPreview: boolean },
): Promise<ScoreDiagnosticReadModel> {
  const parsed = ScoreReadOptions.safeParse(raw);
  if (!parsed.success)
    throw new CanonicalError(422, "Choose valid scoring input versions.");
  const options = parsed.data;
  const [canonical, analysis] = await Promise.all([
    canonicalSnapshot ??
      loadCanonical(client, analysisId, ownerId, {
        versionId: options.canonical,
      }),
    client
      .from("analyses")
      .select("job_id")
      .eq("id", analysisId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);
  if (!canonical.current)
    throw new CanonicalError(
      422,
      "Import your structured resume before reviewing scoring diagnostics.",
    );
  const doc = canonical.current.document;
  if (
    canonical.analysisId !== analysisId ||
    doc.ownerId !== ownerId ||
    (options.canonical && doc.versionId !== options.canonical)
  )
    throw new CanonicalError(422, "Scoring input binding failed.");
  if (analysis.error)
    throw new CanonicalError(503, "Scoring inputs are unavailable.");
  if (!analysis.data)
    throw new CanonicalError(404, "Scoring inputs not found.");
  const [requirements, evidence, source] = await Promise.all([
    analysis.data.job_id
      ? loadJobRequirements(client, analysisId, ownerId, {
          versionId: options.requirements,
        })
      : Promise.resolve(null),
    client
      .from("document_evidence_attempts")
      .select("envelope,resume_version_id,input_sha256")
      .eq("id", doc.sourceEvidenceVersionId!)
      .eq("analysis_id", analysisId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    client
      .from("resume_versions")
      .select("page_count")
      .eq("id", canonical.current.sourceId)
      .eq("owner_id", ownerId)
      .eq("organization_id", doc.organizationId)
      .maybeSingle(),
  ]);
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
  const requirementDocument = requirements?.current?.document ?? null;
  if (requirementDocument?.schemaVersion === "requirements/2.0.0") {
    const selection = {
      canonicalVersionId: doc.versionId,
      requirementVersionId: requirementDocument.id,
    };
    try {
      const context = await loadRequirementRelationshipContext(
        client,
        analysisId,
        ownerId,
        selection,
      );
      if (
        context.heads.canonicalHeadId !== canonical.headId ||
        context.heads.requirementHeadId !== requirements?.headId ||
        (!options.canonical &&
          context.canonical.versionId !== context.heads.canonicalHeadId) ||
        (!options.requirements &&
          context.requirements.versionId !== context.heads.requirementHeadId) ||
        (options.expectedCanonical &&
          options.expectedCanonical !== context.heads.canonicalHeadId) ||
        (options.expectedRequirements &&
          options.expectedRequirements !== context.heads.requirementHeadId)
      )
        throw new CanonicalError(
          409,
          "Scoring inputs changed. Reload before continuing.",
        );
      const result = buildTypedScoreDiagnostics(context);
      const jdRecommendations = buildJdRecommendations(context, {
        analysisId,
        ownerId,
        ...selection,
      });
      const jdClauseOrderPlan =
        serverOptions?.clauseOrderPreview === true
          ? buildJdClauseOrderPlan(context, {
              analysisId,
              ownerId,
              ...selection,
            })
          : undefined;
      // A second owned read rechecks privacy, source ownership, pair linkage and both heads.
      const final = await loadRequirementRelationshipContext(
        client,
        analysisId,
        ownerId,
        selection,
      );
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
      if (
        finalAnalysis.data.job_id !== analysis.data.job_id ||
        final.heads.canonicalHeadId !== context.heads.canonicalHeadId ||
        final.heads.canonicalHeadRevision !==
          context.heads.canonicalHeadRevision ||
        final.heads.requirementHeadId !== context.heads.requirementHeadId ||
        final.heads.requirementHeadRevision !==
          context.heads.requirementHeadRevision ||
        final.canonical.contentSha256 !== context.canonical.contentSha256 ||
        final.requirements.contentSha256 !==
          context.requirements.contentSha256 ||
        final.sourceMetadata.pageCount !== context.sourceMetadata.pageCount
      )
        throw new CanonicalError(
          409,
          "Scoring inputs changed. Reload before continuing.",
        );
      return {
        analysisId,
        ...result,
        jdRecommendations,
        ...(jdClauseOrderPlan ? { jdClauseOrderPlan } : {}),
        sourceExcerpts: context.attempt.envelope.spans
          .filter((span) =>
            result.diagnostics.rules.some((rule) =>
              rule.citations.some(
                (cite) => cite.kind === "document_span" && cite.id === span.id,
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
          versionId: context.canonical.versionId,
          revision: context.canonical.revision,
          headId: context.heads.canonicalHeadId,
        },
        requirements: {
          versionId: context.requirements.versionId,
          revision: context.requirements.revision,
          headId: context.heads.requirementHeadId,
        },
        historical:
          context.canonical.versionId !== context.heads.canonicalHeadId ||
          context.requirements.versionId !== context.heads.requirementHeadId,
      };
    } catch (error) {
      if (error instanceof CanonicalError) throw error;
      if (
        error instanceof RequirementRelationshipContextError &&
        error.reason === "not_found"
      )
        throw new CanonicalError(404, "Scoring inputs not found.");
      throw new CanonicalError(
        503,
        "Typed scoring diagnostics are unavailable. Reload before continuing.",
      );
    }
  }
  let diagnostics;
  try {
    diagnostics = buildScoreDiagnostics({
      evidence: envelope.data,
      canonical: doc,
      requirements: requirementDocument,
      ...(source.data.page_count == null
        ? {}
        : { expectedPageCount: source.data.page_count }),
    });
  } catch {
    throw new CanonicalError(422, "Scoring inputs failed integrity checks.");
  }
  // Recheck deletion/active ownership and moving heads before releasing private data.
  const [final, finalRequirements] = await Promise.all([
    loadCanonical(client, analysisId, ownerId, { versionId: doc.versionId }),
    requirements
      ? loadJobRequirements(client, analysisId, ownerId, {
          versionId: requirements.current?.document.id,
        })
      : Promise.resolve(null),
  ]);
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
