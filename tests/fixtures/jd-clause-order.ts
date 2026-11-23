import { createHash } from "node:crypto";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import type { CanonicalResumeDraft } from "../../app/lib/server/canonical-resume-schema";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import {
  loadRequirementRelationshipContext,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "../../app/lib/server/requirement-relationship-context";
export const jdClauseOrderFixtureId = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export type JdClauseOrderFixtureOptions = {
  clauses?: string[];
  header?: string;
  jdText?: string;
  confirm?: boolean;
  edit?: string;
  pageCount?: number | null;
  locale?: string;
  domain?: string;
};
/** Actual original importer/confirmation/JD/strict-reader builders; fake RPC metadata is not Native proof. */
export async function createJdClauseOrderFixture(
  options: JdClauseOrderFixtureOptions = {},
) {
  const id = jdClauseOrderFixtureId,
    clauses = options.clauses ?? [
      "Built services using Python; Developed tools using Git",
    ],
    locale = options.locale ?? "en-IN";
  const text =
    (options.header ?? "Experience\nSoftware Engineer at Orchard Labs") +
    "\n" +
    clauses.join("\n");
  const owned = {
    ownerId: id(1),
    organizationId: id(2),
    resumeId: id(3),
    analysisId: id(4),
    sourceId: id(5),
    attemptId: id(6),
    inputSha256: createHash("sha256").update(text).digest("hex"),
  };
  const evidence = reconcileDocumentEvidence(
    {
      id: owned.attemptId,
      ownerId: owned.ownerId,
      analysisId: owned.analysisId,
      sourceId: owned.sourceId,
      inputSha256: owned.inputSha256,
      createdAt: "2026-11-16T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const original = importCanonicalEvidence(evidence, {
    ownerId: owned.ownerId,
    organizationId: owned.organizationId,
    resumeId: owned.resumeId,
    locale,
  });
  let document = original;
  const ancestors: CanonicalResumeDraft[] = [];
  const target = original.facts.find(
    (f) => f.type === "contribution" && f.value === clauses[0],
  );
  if (!target) throw Error("SYNTHETIC_WHOLE_CLAUSE_UNAVAILABLE");
  const change = (command: Parameters<typeof reviseCanonical>[1]) => {
    ancestors.unshift(document);
    document = reviseCanonical(
      document,
      command,
      new Date(
        Date.parse(original.createdAt) + ancestors.length * 1000,
      ).toISOString(),
    );
  };
  if (options.edit !== undefined)
    change({ operation: "edit", factId: target.id, value: options.edit });
  if (options.confirm !== false)
    change({ operation: "confirm", factId: target.id });
  const requirements = createJobRequirementRelations(
    options.jdText ?? "Requirements\nGit required",
    {
      ownerId: owned.ownerId,
      organizationId: owned.organizationId,
      analysisId: owned.analysisId,
      jobId: id(7),
      parentVersionId: null,
      locale,
      domain: options.domain ?? "software-engineering",
    },
  );
  const revision = ancestors.length + 1,
    canonicalHash = "b".repeat(64);
  const row: RequirementRelationshipContext = {
    schemaVersion: "requirement-relationship-context/1.0.0",
    status: "available",
    authority: "owned_header_relations_only",
    scoringEligible: false,
    source: owned,
    sourceMetadata: {
      pageCount: options.pageCount === undefined ? 1 : options.pageCount,
    },
    attempt: { id: evidence.id, attemptNumber: 1, envelope: evidence },
    canonical: {
      versionId: document.versionId,
      revision,
      contentSha256: canonicalHash,
      locale,
      content: document,
    },
    requirements: {
      versionId: requirements.id,
      revision: 1,
      inputSha256: requirements.inputSha256,
      contentSha256: "c".repeat(64),
      content: requirements,
    },
    ancestors: ancestors.map((content, i) => ({
      versionId: content.versionId,
      revision: ancestors.length - i,
      contentSha256: (i + 16).toString(16).padStart(64, "0"),
      content,
    })),
    heads: {
      canonicalHeadId: document.versionId,
      canonicalHeadRevision: revision,
      requirementHeadId: requirements.id,
      requirementHeadRevision: 1,
    },
    profiles: { ...REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES },
    headerSnapshot: {
      canonicalVersionId: document.versionId,
      canonicalContentSha256: canonicalHash,
      snapshotFamily: "none",
      creationKind: null,
      associationPrefix: { revision: 0, headId: null },
      regroupPrefix: { revision: 0, headId: null },
      groups: [],
    },
  };
  const rpcCalls: { name: string; args: unknown }[] = [];
  const client = {
    from() {
      throw Error("TABLE_FALLBACK_FORBIDDEN");
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: row, error: null };
    },
  } as unknown as Parameters<typeof loadRequirementRelationshipContext>[0];
  const context = await loadRequirementRelationshipContext(
    client,
    owned.analysisId,
    owned.ownerId,
    {
      canonicalVersionId: document.versionId,
      requirementVersionId: requirements.id,
    },
  );
  return {
    context,
    owned,
    targetFactId: target.id,
    text,
    original,
    row,
    rpcCalls,
  };
}
