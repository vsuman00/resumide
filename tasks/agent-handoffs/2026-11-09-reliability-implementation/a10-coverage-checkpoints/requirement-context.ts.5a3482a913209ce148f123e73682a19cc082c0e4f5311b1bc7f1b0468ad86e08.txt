import { createHash } from "node:crypto";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import type { CanonicalResumeDraft } from "../../app/lib/server/canonical-resume-schema";
import { importCanonicalGroupedEvidence } from "../../app/lib/server/canonical-grouped-import";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import {
  loadRequirementRelationshipContext,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "../../app/lib/server/requirement-relationship-context";

// Actual builders and strict reader, with synthetic RPC metadata; no SQL-origin proof.
export const requirementFixtureId = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = requirementFixtureId;
const HEADER =
  "Experience\nEmployer: Synthetic Orchard Labs\nRole: Platform Engineer\nDates: 2018-01-01 - 2024-01-01";
export type RequirementContextFixtureOptions = {
  jdText?: string;
  pageCount?: number | null;
  confirmClauses?: number[];
  clauses?: string[];
  skill?: string;
  requiredSkill?: string;
  edit?: string;
  confirm?: boolean;
  locale?: string;
  domain?: string;
  targetIndex?: number;
  extraVersions?: number;
};
export async function createRequirementContextFixture(
  options: RequirementContextFixtureOptions = {},
) {
  const clauses = options.clauses ?? ["Built services using PostgreSQL"],
    skill = options.skill ?? "PostgreSQL";
  const requiredSkill = options.requiredSkill ?? skill,
    locale = options.locale ?? "en-IN";
  const text = `${HEADER}\n${clauses.join("\n")}\nSkills\n${skill}`;
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
      createdAt: "2026-11-14T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const associations = deriveEvidenceEntryAssociations(evidence, owned);
  if (
    associations.state !== "review_required" ||
    associations.groups.length !== 1
  )
    throw Error("SYNTHETIC_HEADER_UNAVAILABLE");
  const fieldExtractorVersion = associations.binding.fieldExtractorVersion;
  if (fieldExtractorVersion !== "evidence-fields/1.0.1")
    throw Error("SYNTHETIC_PROFILE_UNAVAILABLE");
  const selections = associations.groups.map((group) => ({
    groupId: group.id,
    members: group.members.map((member) => {
      const field = member.field;
      if (field !== "employer" && field !== "role" && field !== "dates")
        throw Error("SYNTHETIC_HEADER_FIELD_UNAVAILABLE");
      return {
        observationId: member.observationId,
        assertionId: member.assertionId,
        targetId: member.targetId,
        field,
        citations: member.citations,
      };
    }),
  }));
  const prepared = importCanonicalGroupedEvidence(
    evidence,
    { ...owned, locale },
    {
      schemaVersion: "grouped-original-selection/1.0.0",
      binding: {
        ...associations.binding,
        fieldExtractorVersion,
        organizationId: owned.organizationId,
        resumeId: owned.resumeId,
        associationModelVersion: associations.modelVersion,
        producerVersion: "canonical-engine/1.0.3",
        canonicalHeadId: null,
      },
      acknowledgement: "relationship_only_not_fact_confirmation",
      unselectedDisposition: "retain_original",
      selections,
    },
  );
  if (prepared.state !== "prepared")
    throw Error("SYNTHETIC_GROUPED_IMPORT_UNAVAILABLE");
  const original = prepared.document;
  let document = original;
  const ancestors: CanonicalResumeDraft[] = [];
  const targetClause = clauses[options.targetIndex ?? 0];
  const sourceSpanIds = new Set(
    evidence.spans
      .filter((span) => span.text === targetClause)
      .map((span) => span.id),
  );
  const target =
    original.facts.find(
      (fact) => fact.type === "contribution" && fact.value === targetClause,
    ) ??
    original.facts.find(
      (fact) =>
        fact.type === "contribution" &&
        fact.sources.some((cite) => sourceSpanIds.has(cite.spanId)),
    );
  if (!target) throw Error("SYNTHETIC_CLAUSE_FACT_UNAVAILABLE");
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
  if (options.confirm) change({ operation: "confirm", factId: target.id });
  for (const index of options.confirmClauses ?? []) {
    const fact = document.facts.find(
      (candidate) =>
        candidate.type === "contribution" && candidate.value === clauses[index],
    );
    if (!fact) throw Error("SYNTHETIC_CONFIRMATION_TARGET_UNAVAILABLE");
    if (!fact.confirmation) change({ operation: "confirm", factId: fact.id });
  }
  for (let index = 0; index < (options.extraVersions ?? 0); index++) {
    const section = document.sections.find(
      (candidate) => candidate.type === "experience",
    );
    if (!section) throw Error("SYNTHETIC_EXPERIENCE_SECTION_UNAVAILABLE");
    change({
      operation: "rename_section",
      sectionId: section.id,
      value: `Experience revision ${index + 1}`,
    });
  }
  const requirements = createJobRequirementRelations(
    options.jdText ?? `Requirements\n${requiredSkill} required`,
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
  const sourceGroup = associations.groups[0],
    mapping = prepared.associationReceipt.mappings[0];
  const batchId = id(20),
    nativeSha = "b".repeat(64);
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
      revision: ancestors.length + 1,
      contentSha256: nativeSha,
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
    ancestors: ancestors.map((content, index) => ({
      versionId: content.versionId,
      revision: ancestors.length - index,
      contentSha256: (index + 16).toString(16).padStart(64, "0"),
      content,
    })),
    heads: {
      canonicalHeadId: document.versionId,
      canonicalHeadRevision: ancestors.length + 1,
      requirementHeadId: requirements.id,
      requirementHeadRevision: 1,
    },
    profiles: { ...REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES },
    headerSnapshot: {
      canonicalVersionId: document.versionId,
      canonicalContentSha256: nativeSha,
      snapshotFamily: "association",
      creationKind: ancestors.length ? "inherited" : "grouped_import",
      associationPrefix: { revision: 1, headId: batchId },
      regroupPrefix: { revision: 0, headId: null },
      groups: [
        {
          sectionId: mapping.sectionId,
          entryId: mapping.entryId,
          originFamily: "association",
          batchId,
          groupId: id(21),
          originalApprovalVersionId: original.versionId,
          sourceSelection: {
            pageId: sourceGroup.pageId,
            method: sourceGroup.method,
            members: mapping.members.map((member) => {
              const observed = sourceGroup.members.find(
                (candidate) => candidate.assertionId === member.assertionId,
              );
              if (!observed)
                throw Error("SYNTHETIC_SOURCE_SELECTION_UNAVAILABLE");
              return {
                assertionId: member.assertionId,
                field: member.field,
                citations: observed.citations.map((cite) => ({
                  attemptId: evidence.id,
                  ...cite,
                })),
              };
            }),
          },
          members: mapping.members.map((member, index) => {
            const fact = document.facts.find(
              (candidate) => candidate.id === member.factId,
            );
            const observed = evidence.assertions.find(
              (candidate) => candidate.id === member.assertionId,
            );
            const selected = sourceGroup.members.find(
              (candidate) => candidate.assertionId === member.assertionId,
            );
            if (!fact || !observed || !selected)
              throw Error("SYNTHETIC_HEADER_MEMBER_UNAVAILABLE");
            return {
              sourceOrder: index + 1,
              assertionId: member.assertionId,
              field: member.field,
              factId: fact.id,
              currentValue: fact.value,
              currentState: fact.state,
              confirmation: fact.confirmation,
              sourceValue: observed.value,
              citations: selected.citations.map((cite) => ({
                attemptId: evidence.id,
                ...cite,
              })),
              location: {
                kind: "entry",
                sectionId: mapping.sectionId,
                entryId: mapping.entryId,
                bulletId: null,
              },
              mappedThrough: "current_citations",
              originVersionId: null,
              originFactId: null,
            };
          }),
        },
      ],
    },
  };
  const rpcCalls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: row, error: null };
    },
    from: () => {
      throw Error("TABLE_FALLBACK_FORBIDDEN");
    },
  } as unknown as Parameters<typeof loadRequirementRelationshipContext>[0];
  const context = await loadRequirementRelationshipContext(
    client,
    owned.analysisId,
    owned.ownerId,
  );
  if (rpcCalls.length !== 1) throw Error("SYNTHETIC_READER_CALL_COUNT");
  return {
    context,
    targetFactId: target.id,
    original,
    text,
    row,
    rpcCalls,
    owned,
  };
}
