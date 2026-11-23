import { createRequirementContextFixture } from "../fixtures/requirement-context";
import { buildTypedScoreDiagnostics } from "../../app/lib/server/typed-score-diagnostics";
import {
  buildSuggestion,
  TypedAuthoringPausedError,
} from "../../app/lib/server/authoring-contract";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "../../app/lib/server/canonical-resume-schema";
import { importCanonicalGroupedEvidence } from "../../app/lib/server/canonical-grouped-import";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupInput,
} from "../../app/lib/server/canonical-entry-regroup";
import { projectCanonicalCorrectionSourceChoices } from "../../app/lib/server/canonical-corrections";
import { deriveNativePageDiagnostics } from "../../app/lib/server/ocr/pdf-detection";
import {
  JOB_ALIAS_POLICY_VERSION,
  JOB_ALIAS_LEXICON_SHA256,
} from "../../app/lib/server/job-aliases";
import {
  LOCAL_JOB_RELATION_POLICY_VERSION,
  LOCAL_JOB_RELATION_POLICY_SHA256,
} from "../../app/lib/server/job-relations";
import {
  JOB_RELATION_UNICODE_PROFILE,
  JOB_RELATION_UNICODE_SHA256,
} from "../../app/lib/server/job-relation-unicode";
import { JOB_RELATION_ADMISSION_PROFILE_SHA256 } from "../../app/lib/server/job-requirement-admission";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";

import {
  loadRequirementRelationshipContext,
  RequirementRelationshipContextError,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "../../app/lib/server/requirement-relationship-context";

const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sourceText =
  "Experience\nEmployer: Synthetic Orchard Labs\nRole: Platform Engineer\nDates: 2020 - 2022";
const jdText =
  "Requirements\nTypeScript or SQL required\nAt least 2 years experience required";

function realInputs(text = sourceText) {
  const owned = {
    ownerId: id(1),
    organizationId: id(2),
    resumeId: id(3),
    analysisId: id(4),
    sourceId: id(5),
    attemptId: id(6),
    inputSha256: "a".repeat(64),
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
  const base = importCanonicalEvidence(evidence, owned);
  const requirements = createJobRequirementRelations(jdText, {
    ownerId: owned.ownerId,
    organizationId: owned.organizationId,
    analysisId: owned.analysisId,
    jobId: id(7),
    parentVersionId: null,
    locale: "en-IN",
    domain: "software-engineering",
  });
  const associations = deriveEvidenceEntryAssociations(evidence, owned);
  const targets = deriveEvidenceReviewTargets(evidence, owned);
  if (associations.state !== "review_required" || !associations.groups.length)
    throw Error("SYNTHETIC_HEADER_FIXTURE_UNAVAILABLE");
  return { owned, evidence, base, requirements, associations, targets };
}
type Inputs = ReturnType<typeof realInputs>;
function realGrouped(input: Inputs, selected = input.associations.groups) {
  const fieldExtractorVersion =
    input.associations.binding.fieldExtractorVersion;
  if (fieldExtractorVersion !== "evidence-fields/1.0.1")
    throw Error("SYNTHETIC_EXTRACTOR_VERSION_UNAVAILABLE");
  const selections = selected.map((group) => ({
    groupId: group.id,
    members: group.members.map((member) => {
      const { field } = member;
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
  const result = importCanonicalGroupedEvidence(input.evidence, input.owned, {
    schemaVersion: "grouped-original-selection/1.0.0",
    binding: {
      ...input.associations.binding,
      fieldExtractorVersion,
      organizationId: input.owned.organizationId,
      resumeId: input.owned.resumeId,
      associationModelVersion: input.associations.modelVersion,
      producerVersion: "canonical-engine/1.0.3",
      canonicalHeadId: null,
    },
    acknowledgement: "relationship_only_not_fact_confirmation",
    unselectedDisposition: "retain_original",
    selections,
  });
  if (result.state !== "prepared")
    throw Error("SYNTHETIC_GROUPED_FIXTURE_UNAVAILABLE");
  return result;
}
function editedAndConfirmed(base: CanonicalResumeDraft) {
  const employer = base.facts.find((fact) => fact.type === "employer");
  if (!employer) throw Error("SYNTHETIC_EMPLOYER_UNAVAILABLE");
  const edited = reviseCanonical(
    base,
    {
      operation: "edit",
      factId: employer.id,
      value: "Synthetic Updated Orchard Labs",
    },
    new Date(Date.parse(base.createdAt) + 1000).toISOString(),
  );
  const confirmed = reviseCanonical(
    edited,
    { operation: "confirm", factId: employer.id },
    new Date(Date.parse(base.createdAt) + 2000).toISOString(),
  );
  return { document: confirmed, ancestors: [edited, base] };
}

const SQL_CANONICAL_SHA = "b".repeat(64);
function rowFor(
  input: Inputs,
  document = input.base,
  ancestors: CanonicalResumeDraft[] = [],
): RequirementRelationshipContext {
  const revision = ancestors.length + 1;
  return {
    schemaVersion: "requirement-relationship-context/1.0.0",
    status: "available",
    authority: "owned_header_relations_only",
    scoringEligible: false,
    source: { ...input.owned },
    sourceMetadata: { pageCount: null },
    attempt: {
      id: input.evidence.id,
      attemptNumber: 1,
      envelope: input.evidence,
    },
    canonical: {
      versionId: document.versionId,
      revision,
      contentSha256: SQL_CANONICAL_SHA,
      locale: document.locale,
      content: document,
    },
    requirements: {
      versionId: input.requirements.id,
      revision: 1,
      inputSha256: input.requirements.inputSha256,
      contentSha256: "c".repeat(64),
      content: input.requirements,
    },
    ancestors: ancestors.map((content, index) => ({
      versionId: content.versionId,
      revision: revision - index - 1,
      contentSha256: "d".repeat(64),
      content,
    })),
    heads: {
      canonicalHeadId: document.versionId,
      canonicalHeadRevision: revision,
      requirementHeadId: input.requirements.id,
      requirementHeadRevision: 1,
    },
    profiles: { ...REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES },
    headerSnapshot: {
      canonicalVersionId: document.versionId,
      canonicalContentSha256: SQL_CANONICAL_SHA,
      snapshotFamily: "none",
      creationKind: null,
      associationPrefix: { revision: 0, headId: null },
      regroupPrefix: { revision: 0, headId: null },
      groups: [],
    },
  };
}
function associationRow() {
  const input = realInputs(),
    grouped = realGrouped(input),
    row = rowFor(input, grouped.document);
  const sourceGroup = input.associations.groups[0],
    mapping = grouped.associationReceipt.mappings[0];
  const batchId = id(20);
  row.headerSnapshot.snapshotFamily = "association";
  row.headerSnapshot.creationKind = "grouped_import";
  row.headerSnapshot.associationPrefix = { revision: 1, headId: batchId };
  row.headerSnapshot.groups = [
    {
      sectionId: mapping.sectionId,
      entryId: mapping.entryId,
      originFamily: "association",
      batchId,
      groupId: id(21),
      originalApprovalVersionId: grouped.document.versionId,
      sourceSelection: {
        pageId: sourceGroup.pageId,
        method: sourceGroup.method,
        members: mapping.members.map((member) => {
          const observed = sourceGroup.members.find(
            (m) => m.assertionId === member.assertionId,
          );
          if (!observed) throw Error("SYNTHETIC_SOURCE_MEMBER_UNAVAILABLE");
          return {
            assertionId: member.assertionId,
            field: member.field,
            citations: observed.citations.map((cite) => ({
              attemptId: input.evidence.id,
              ...cite,
            })),
          };
        }),
      },
      members: mapping.members.map((member, index) => {
        const fact = grouped.document.facts.find((f) => f.id === member.factId);
        const observed = input.targets.observations.find(
          (m) => m.assertionId === member.assertionId,
        );
        if (!fact || !observed)
          throw Error("SYNTHETIC_FACT_MEMBER_UNAVAILABLE");
        return {
          sourceOrder: index + 1,
          assertionId: member.assertionId,
          field: member.field,
          factId: fact.id,
          currentValue: fact.value,
          currentState: fact.state,
          confirmation: fact.confirmation,
          sourceValue: observed.value,
          citations: observed.citations.map((cite) => ({
            attemptId: input.evidence.id,
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
  ];
  return row;
}
function rpcClient(data: unknown) {
  const rpc = vi.fn<
    (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>
  >(async () => ({ data, error: null }));
  const from = vi.fn(() => {
    throw Error("TABLE_FALLBACK_FORBIDDEN");
  });
  const client = { rpc, from } as unknown as Parameters<
    typeof loadRequirementRelationshipContext
  >[0];
  return { client, rpc, from };
}

describe("owned requirement relationship context", () => {
  it("reads actual grouped-builder headers through one exact RPC without semantic eligibility", async () => {
    const row = associationRow(),
      mock = rpcClient(row);
    const value = await loadRequirementRelationshipContext(
      mock.client,
      row.source.analysisId,
      row.source.ownerId,
    );
    expect(value).toEqual(row);
    expect(value.authority).toBe("owned_header_relations_only");
    expect(value.scoringEligible).toBe(false);
    expect(value.canonical.content.producerVersion).toBe(
      "canonical-engine/1.0.3",
    );
    expect(mock.rpc.mock.calls).toEqual([
      [
        "read_requirement_relationship_context",
        {
          p_user_id: row.source.ownerId,
          p_analysis_id: row.source.analysisId,
          p_selection: { canonicalVersionId: null, requirementVersionId: null },
        },
      ],
    ]);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("refuses a regroup origin inside an association-family snapshot", async () => {
    const row = associationRow();
    row.headerSnapshot.groups[0].originFamily = "regroup";
    const mock = rpcClient(row);
    await expect(
      loadRequirementRelationshipContext(
        mock.client,
        row.source.analysisId,
        row.source.ownerId,
      ),
    ).rejects.toMatchObject({ status: 503, reason: "unavailable" });
    expect(mock.rpc).toHaveBeenCalledOnce();
    expect(mock.from).not.toHaveBeenCalled();
  });
});

type HeaderGroup =
  RequirementRelationshipContext["headerSnapshot"]["groups"][number];
function setPath(value: unknown, path: string, replacement: unknown) {
  const keys = path.split(".");
  let target: unknown = value;
  for (const key of keys.slice(0, -1)) {
    if (!target || typeof target !== "object")
      throw Error("FIXTURE_PATH_UNAVAILABLE");
    target = Reflect.get(target, key);
  }
  if (!target || typeof target !== "object")
    throw Error("FIXTURE_PATH_UNAVAILABLE");
  Reflect.set(target, keys.at(-1)!, replacement);
}
function currentLocation(
  doc: CanonicalResumeDraft,
  factId: string,
): HeaderGroup["members"][number]["location"] {
  const found: HeaderGroup["members"][number]["location"][] = [];
  for (const section of doc.sections)
    for (const entry of section.entries) {
      if (entry.factIds.includes(factId))
        found.push({
          kind: "entry",
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
        });
      for (const bullet of entry.bullets)
        if (bullet.factIds.includes(factId))
          found.push({
            kind: "bullet",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: bullet.id,
          });
    }
  if (found.length !== 1) throw Error("SYNTHETIC_LOCATION_UNAVAILABLE");
  return found[0];
}
function coreMerge(
  input: Inputs,
  base: CanonicalResumeDraft,
  selected = input.associations.groups,
) {
  const view: CanonicalEntryRegroupInput = {
    canonicalRevision: 1,
    ownedContext: input.owned,
    review: {
      analysisId: input.owned.analysisId,
      attemptId: input.evidence.id,
      attemptNumber: 1,
      evidence: input.evidence,
      corrections: [],
      revision: 0,
      scoringEligible: false,
      targets: input.targets,
      nativePageDiagnostics: deriveNativePageDiagnostics(
        input.evidence.nativeSource,
      ),
      historyAttestation: {
        schemaVersion: "evidence-review-history/1.0.0",
        state: "complete_captured_prefix",
        binding: {
          ...input.targets.binding,
          targetModelVersion: input.targets.modelVersion,
        },
        highWaterRevision: 0,
        highWaterEventId: null,
        receivedCount: 0,
        pageCount: 0,
      },
    },
    expectedBinding: {
      ...input.targets.binding,
      resumeId: input.owned.resumeId,
      organizationId: input.owned.organizationId,
      targetModelVersion: input.targets.modelVersion,
      projectionModelVersion: "canonical-corrections/1.0.1",
      reviewRevision: 0,
      canonicalHeadId: base.versionId,
    },
    canonicalSnapshot: {
      sourceId: input.owned.sourceId,
      headId: base.versionId,
      current: base,
      ancestors: [],
    },
    selections: [],
  };
  const choices =
    projectCanonicalCorrectionSourceChoices(view).choicesBySourceTarget;
  const result = prepareCanonicalEntryRegroup(view, {
    schemaVersion: "canonical-entry-regroup-intent/1.0.0",
    operation: "preview_whole_entry_merge",
    baseVersionId: base.versionId,
    baseRevision: 1,
    selections: selected.map((group) => ({
      groupId: group.id,
      members: group.members.map((member) => {
        const choice = choices.get(member.targetId)?.[0];
        if (!choice) throw Error("SYNTHETIC_SOURCE_CHOICE_UNAVAILABLE");
        return { assertionId: member.assertionId, factId: choice.factId };
      }),
    })),
  });
  if (result.state !== "prepared")
    throw Error("SYNTHETIC_CORE_MERGE_UNAVAILABLE");
  // Actual Core supplies the full facts/sections. Remaining fields model a synthetic saved row;
  // this does not claim that the SQL writer ran or approved semantic relationships.
  const createdAt = new Date(Date.parse(base.createdAt) + 1000).toISOString();
  const document = CanonicalResumeDraftSchema.parse({
    ...base,
    versionId: randomUUID(),
    parentVersionId: base.versionId,
    producerVersion: "canonical-engine/1.0.4",
    createdAt,
    facts: result.facts,
    sections: result.afterSections,
    changes: [
      {
        id: randomUUID(),
        actorId: base.ownerId,
        action: "import",
        targetId: base.resumeId,
        priorValue: null,
        createdAt,
      },
    ],
  });
  return { document, result };
}
function regroupRow() {
  const input = realInputs(),
    base = input.base,
    merged = coreMerge(input, base),
    row = rowFor(input, merged.document, [base]);
  const group = merged.result.groups[0],
    batchId = id(30);
  row.headerSnapshot.snapshotFamily = "regroup";
  row.headerSnapshot.creationKind = "regroup";
  row.headerSnapshot.regroupPrefix = { revision: 1, headId: batchId };
  row.headerSnapshot.groups = [
    {
      sectionId: group.sectionId,
      entryId: group.anchorEntryId,
      originFamily: "regroup",
      batchId,
      groupId: id(31),
      originalApprovalVersionId: merged.document.versionId,
      sourceSelection: {
        pageId: group.pageId,
        method: group.method,
        members: group.members.map((member) => ({
          assertionId: member.assertionId,
          field: member.field,
          citations: member.sourceCitations,
        })),
      },
      members: group.members.map((member, index) => {
        const fact = merged.document.facts.find(
          (candidate) => candidate.id === member.factId,
        );
        if (!fact) throw Error("SYNTHETIC_REGROUP_FACT_UNAVAILABLE");
        return {
          sourceOrder: index + 1,
          assertionId: member.assertionId,
          field: member.field,
          factId: fact.id,
          currentValue: fact.value,
          currentState: fact.state,
          confirmation: fact.confirmation,
          sourceValue: member.sourceValue,
          citations: member.sourceCitations,
          location: currentLocation(merged.document, fact.id),
          mappedThrough: member.mappedThrough,
          originVersionId: member.originVersionId,
          originFactId: member.originFactId,
        };
      }),
    },
  ];
  return row;
}
function declaredRow() {
  const row = associationRow(),
    original = row.canonical.content,
    changed = editedAndConfirmed(original);
  const replacement = rowFor(
    {
      ...realInputs(),
      owned: row.source,
      evidence: row.attempt.envelope,
      requirements: row.requirements.content,
    },
    changed.document,
    changed.ancestors,
  );
  row.canonical = replacement.canonical;
  row.ancestors = replacement.ancestors;
  row.heads = replacement.heads;
  row.headerSnapshot.canonicalVersionId = changed.document.versionId;
  row.headerSnapshot.creationKind = "inherited";
  for (const group of row.headerSnapshot.groups)
    for (const member of group.members) {
      const fact = changed.document.facts.find(
        (candidate) => candidate.id === member.factId,
      );
      if (!fact) throw Error("SYNTHETIC_CURRENT_FACT_UNAVAILABLE");
      member.currentValue = fact.value;
      member.currentState = fact.state;
      member.confirmation = fact.confirmation;
      if (!fact.sources.length) {
        const origin = changed.ancestors.find(
          (ancestor) =>
            ancestor.facts.find((candidate) => candidate.id === fact.id)
              ?.sources.length,
        );
        if (!origin) throw Error("SYNTHETIC_ORIGIN_UNAVAILABLE");
        member.mappedThrough = "owned_ancestor_chain";
        member.originVersionId = origin.versionId;
        member.originFactId = fact.id;
      }
    }
  return row;
}
async function readRow(
  row: RequirementRelationshipContext,
  options: unknown = {},
) {
  const mock = rpcClient(row);
  const value = await loadRequirementRelationshipContext(
    mock.client,
    row.source.analysisId,
    row.source.ownerId,
    options,
  );
  expect(mock.rpc).toHaveBeenCalledOnce();
  expect(mock.from).not.toHaveBeenCalled();
  return value;
}
async function refused(
  row: unknown,
  expected: "unavailable" | "not_found" = "unavailable",
) {
  const mock = rpcClient(row);
  await expect(
    loadRequirementRelationshipContext(mock.client, id(4), id(1)),
  ).rejects.toMatchObject({
    status: expected === "not_found" ? 404 : 503,
    reason: expected,
  });
  expect(mock.rpc).toHaveBeenCalledOnce();
  expect(mock.from).not.toHaveBeenCalled();
}

describe("relationship context selected snapshots and provenance", () => {
  it("normalizes explicit null selections and preserves an actual none marker", async () => {
    const row = rowFor(realInputs()),
      mock = rpcClient(row);
    const result = await loadRequirementRelationshipContext(
      mock.client,
      row.source.analysisId,
      row.source.ownerId,
      { canonicalVersionId: null, requirementVersionId: null },
    );
    expect(result.headerSnapshot).toEqual(row.headerSnapshot);
    expect(result.headerSnapshot.snapshotFamily).toBe("none");
    expect(result.canonical.contentSha256).toBe(SQL_CANONICAL_SHA);
    expect(mock.rpc.mock.calls[0][1]).toEqual({
      p_user_id: row.source.ownerId,
      p_analysis_id: row.source.analysisId,
      p_selection: { canonicalVersionId: null, requirementVersionId: null },
    });
    expect(mock.rpc).toHaveBeenCalledOnce();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("loads an explicit historical canonical/JD pair independently of later heads", async () => {
    const input = realInputs(),
      row = rowFor(input),
      later = editedAndConfirmed(input.base);
    const nextRequirements = createJobRequirementRelations(
      "Requirements\nSQL required",
      {
        ownerId: input.owned.ownerId,
        organizationId: input.owned.organizationId,
        analysisId: input.owned.analysisId,
        jobId: input.requirements.jobId,
        parentVersionId: input.requirements.id,
        locale: "en-IN",
        domain: "software-engineering",
      },
    );
    row.heads = {
      canonicalHeadId: later.document.versionId,
      canonicalHeadRevision: 3,
      requirementHeadId: nextRequirements.id,
      requirementHeadRevision: 2,
    };
    const options = {
      canonicalVersionId: row.canonical.versionId,
      requirementVersionId: row.requirements.versionId,
    };
    expect((await readRow(row, options)).heads).toEqual(row.heads);
    await refused(row);
  });
  it.each([null, 1, 21, 2147483647])(
    "preserves actual nullable pageCount %s without observed-page substitution",
    async (pageCount) => {
      const row = rowFor(realInputs());
      row.sourceMetadata.pageCount = pageCount;
      expect(row.attempt.envelope.nativeSource.pages).toHaveLength(1);
      expect((await readRow(row)).sourceMetadata.pageCount).toBe(pageCount);
    },
  );
  it.each(["association", "regroup"] as const)(
    "preserves an empty %s marker rather than converting it to none",
    async (family) => {
      const row = rowFor(realInputs());
      row.headerSnapshot.snapshotFamily = family;
      row.headerSnapshot.creationKind =
        family === "association" ? "legacy_empty" : "legacy_bridge";
      expect((await readRow(row)).headerSnapshot).toEqual(row.headerSnapshot);
      expect(row.headerSnapshot.groups).toEqual([]);
    },
  );
  it("reads real Core-prepared regroup headers without granting carried semantic support", async () => {
    const row = regroupRow(),
      result = await readRow(row);
    expect(result.canonical.content.producerVersion).toBe(
      "canonical-engine/1.0.4",
    );
    expect(result.headerSnapshot.groups).toEqual(row.headerSnapshot.groups);
    expect(result.scoringEligible).toBe(false);
    expect(
      Object.keys(result.headerSnapshot.groups[0].sourceSelection).sort(),
    ).toEqual(["members", "method", "pageId"]);
    expect(
      result.headerSnapshot.groups[0].members.map((member) => member.field),
    ).toEqual(["employer", "role", "dates"]);
  });
  it("allows a regroup snapshot to retain an earlier association origin", async () => {
    const row = associationRow();
    row.headerSnapshot.snapshotFamily = "regroup";
    row.headerSnapshot.creationKind = "legacy_bridge";
    expect((await readRow(row)).headerSnapshot.groups[0].originFamily).toBe(
      "association",
    );
  });
  it("separates exact current declaration from observed source through real ancestors", async () => {
    const row = declaredRow(),
      result = await readRow(row);
    const employer = result.headerSnapshot.groups[0].members.find(
      (member) => member.field === "employer",
    )!;
    expect(employer.sourceValue).toBe("Synthetic Orchard Labs");
    expect(employer.currentValue).toBe("Synthetic Updated Orchard Labs");
    expect(employer.currentState).toBe("candidate_confirmed");
    expect(employer.confirmation?.value).toBe(employer.currentValue);
    expect(employer.mappedThrough).toBe("owned_ancestor_chain");
    expect(employer.originVersionId).toBe(row.ancestors.at(-1)?.versionId);
    expect(result.ancestors).toHaveLength(2);
    expect(result.scoringEligible).toBe(false);
  });
  it("pins the exact published model/JD/Unicode/readiness profile independently", async () => {
    const expected = {
      evidenceSchemaVersion: "evidence/2.0.0",
      fieldExtractorVersion: "evidence-fields/1.0.1",
      targetModelVersion: "evidence-targets/1.0.0",
      associationModelVersion: "evidence-entry-associations/1.0.0",
      correctionProjectionVersion: "canonical-corrections/1.0.1",
      regroupModelVersion: "canonical-entry-regroup/1.0.0",
      jdAdmissionProfileSha256: JOB_RELATION_ADMISSION_PROFILE_SHA256,
      aliasPolicyVersion: JOB_ALIAS_POLICY_VERSION,
      aliasLexiconSha256: JOB_ALIAS_LEXICON_SHA256,
      relationPolicyVersion: LOCAL_JOB_RELATION_POLICY_VERSION,
      relationPolicySha256: LOCAL_JOB_RELATION_POLICY_SHA256,
      unicodePolicyVersion: JOB_RELATION_UNICODE_PROFILE.schemaVersion,
      unicodePolicySha256: JOB_RELATION_UNICODE_SHA256,
      readinessProfileVersion: "requirement-relationship-readiness/1.0.0",
      readinessPredecessorSha256:
        "de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd",
    };
    expect(REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES).toEqual(expected);
    for (const key of Object.keys(expected)) {
      const row = rowFor(realInputs());
      setPath(row, `profiles.${key}`, "unrecognized-profile");
      await refused(row);
    }
    const row = rowFor(realInputs());
    setPath(row, "profiles.callerApproval", true);
    await refused(row);
  });
});

const invalidSelections: [string, unknown][] = [
  ["null", null],
  ["array", []],
  ["primitive", "current"],
  ["unknown key", { expectedHead: id(9) }],
  ["caller proof", { proof: { approved: true } }],
  ["invalid canonical UUID", { canonicalVersionId: "not-a-uuid" }],
  ["invalid requirement UUID", { requirementVersionId: "not-a-uuid" }],
  ["non-null version type", { canonicalVersionId: 4 }],
];
describe("strict selection and exact bindings", () => {
  it.each(invalidSelections)(
    "rejects %s before any RPC",
    async (_label, options) => {
      const mock = rpcClient(null);
      await expect(
        loadRequirementRelationshipContext(mock.client, id(4), id(1), options),
      ).rejects.toMatchObject({
        status: 422,
        reason: "invalid_input",
        message: "Choose valid relationship context versions.",
      });
      expect(mock.rpc).not.toHaveBeenCalled();
      expect(mock.from).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["invalid-analysis", id(1)],
    [id(4), "invalid-owner"],
  ])(
    "rejects malformed owned IDs %s/%s without RPC",
    async (analysisId, ownerId) => {
      const mock = rpcClient(null);
      await expect(
        loadRequirementRelationshipContext(mock.client, analysisId, ownerId),
      ).rejects.toMatchObject({ status: 422, reason: "invalid_input" });
      expect(mock.rpc).not.toHaveBeenCalled();
      expect(mock.from).not.toHaveBeenCalled();
    },
  );
  it("requires explicit selected UUIDs to match the returned pair", async () => {
    const row = rowFor(realInputs());
    for (const options of [
      { canonicalVersionId: id(90) },
      { requirementVersionId: id(91) },
    ]) {
      const mock = rpcClient(row);
      await expect(
        loadRequirementRelationshipContext(mock.client, id(4), id(1), options),
      ).rejects.toMatchObject({ status: 503, reason: "unavailable" });
      expect(mock.rpc).toHaveBeenCalledOnce();
      expect(mock.from).not.toHaveBeenCalled();
    }
  });
  it.each([
    ["source owner", "source.ownerId", id(90)],
    ["organization", "source.organizationId", id(90)],
    ["resume root", "source.resumeId", id(90)],
    ["analysis", "source.analysisId", id(90)],
    ["source version", "source.sourceId", id(90)],
    ["attempt", "source.attemptId", id(90)],
    ["source SHA", "source.inputSha256", "e".repeat(64)],
    ["wrapped attempt", "attempt.id", id(90)],
    ["attempt number", "attempt.attemptNumber", 0],
    ["extractor", "attempt.envelope.fieldExtractorVersion", "unknown/1.0.0"],
    ["canonical version", "canonical.versionId", id(90)],
    ["locale", "canonical.locale", "fr-FR"],
    ["canonical row revision", "canonical.revision", 0],
    ["JD version", "requirements.versionId", id(90)],
    ["JD source SHA", "requirements.inputSha256", "e".repeat(64)],
    ["JD owner", "requirements.content.ownerId", id(90)],
    ["current canonical head", "heads.canonicalHeadId", id(90)],
    ["canonical head revision", "heads.canonicalHeadRevision", 2],
    ["current requirement head", "heads.requirementHeadId", id(90)],
    ["requirement head revision", "heads.requirementHeadRevision", 2],
    ["snapshot version", "headerSnapshot.canonicalVersionId", id(90)],
    ["snapshot SHA", "headerSnapshot.canonicalContentSha256", "e".repeat(64)],
    ["scoring authority", "scoringEligible", true],
    ["semantic authority", "authority", "skill_duration_verified"],
    ["unknown field", "callerApproved", true],
  ] as const)("refuses %s swaps", async (_label, path, replacement) => {
    const row = rowFor(realInputs());
    setPath(row, path, replacement);
    await refused(row);
  });
  it.each([0, -1, 1.5, 2147483648])(
    "refuses invalid actual pageCount %s",
    async (pageCount) => {
      const row = rowFor(realInputs());
      setPath(row, "sourceMetadata.pageCount", pageCount);
      await refused(row);
    },
  );
});

describe("complete header members and owned origins", () => {
  it.each([
    ["source order", "sourceOrder", 2],
    ["assertion", "assertionId", "unknown-assertion"],
    ["field", "field", "skill"],
    ["fact", "factId", id(90)],
    ["current value", "currentValue", "Unrecorded current text"],
    ["current state", "currentState", "candidate_confirmed"],
    ["source value", "sourceValue", "Unrecorded source text"],
    ["current section", "location.sectionId", id(90)],
    ["current entry", "location.entryId", id(90)],
    ["bullet location", "location.bulletId", id(90)],
    ["source attempt", "citations.0.attemptId", id(90)],
    ["source span", "citations.0.spanId", "foreign-span"],
    ["source page", "citations.0.pageId", "foreign-page"],
    ["source method", "citations.0.method", "local_ocr"],
    ["source start", "citations.0.start", 0],
    ["source end", "citations.0.end", 1],
    ["page start", "citations.0.pageStart", 0],
    ["page end", "citations.0.pageEnd", 1],
  ] as const)(
    "refuses %s member/citation swaps",
    async (_label, path, replacement) => {
      const row = associationRow();
      setPath(row, `headerSnapshot.groups.0.members.0.${path}`, replacement);
      await refused(row);
    },
  );
  it("refuses missing/duplicate members, duplicated groups and incoherent prefix identities", async () => {
    const mutations: ((row: RequirementRelationshipContext) => void)[] = [
      (row) => {
        row.headerSnapshot.groups[0].members.pop();
      },
      (row) => {
        row.headerSnapshot.groups[0].members[1] = structuredClone(
          row.headerSnapshot.groups[0].members[0],
        );
      },
      (row) => {
        row.headerSnapshot.groups.push(
          structuredClone(row.headerSnapshot.groups[0]),
        );
      },
      (row) => {
        row.headerSnapshot.associationPrefix.revision = 0;
      },
      (row) => {
        row.headerSnapshot.groups[0].sourceSelection.members.reverse();
      },
      (row) => {
        row.headerSnapshot.snapshotFamily = "none";
        row.headerSnapshot.creationKind = null;
      },
    ];
    for (const change of mutations) {
      const row = associationRow();
      change(row);
      await refused(row);
    }
  });
  it("refuses shared current placement rather than choosing one of multiple locations", async () => {
    const row = associationRow(),
      group = row.headerSnapshot.groups[0];
    row.canonical.content.sections
      .find((section) => section.id === group.sectionId)!
      .factIds.push(group.members[0].factId);
    await refused(row);
  });
  it("refuses mismatched exact confirmation, origin version, origin fact and mapping kind", async () => {
    for (const [path, replacement] of [
      ["confirmation.value", "Another declaration"],
      ["confirmation.actorId", id(90)],
      ["originVersionId", id(90)],
      ["originFactId", id(90)],
      ["mappedThrough", "current_citations"],
    ] as const) {
      const row = declaredRow(),
        index = row.headerSnapshot.groups[0].members.findIndex(
          (member) => member.field === "employer",
        );
      setPath(
        row,
        `headerSnapshot.groups.0.members.${index}.${path}`,
        replacement,
      );
      await refused(row);
    }
  });
  it("refuses incomplete, reordered, duplicated, revision-skipped and foreign ancestor suffixes", async () => {
    const mutations: ((row: RequirementRelationshipContext) => void)[] = [
      (row) => {
        row.ancestors.pop();
      },
      (row) => {
        row.ancestors.reverse();
      },
      (row) => {
        row.ancestors.push(structuredClone(row.ancestors[0]));
      },
      (row) => {
        row.ancestors[0].revision = 1;
      },
      (row) => {
        row.ancestors[0].content.ownerId = id(90);
      },
      (row) => {
        row.ancestors[0].content.inputSha256 = "e".repeat(64);
      },
    ];
    for (const change of mutations) {
      const row = declaredRow();
      change(row);
      await refused(row);
    }
  });
});

describe("protocol, bounds and sanitized failures", () => {
  it.each(["not_found", "unavailable"] as const)(
    "maps exact %s protocol failures to fixed errors",
    async (status) => {
      await refused(
        {
          schemaVersion: "requirement-relationship-context/1.0.0",
          status,
          scoringEligible: false,
        },
        status,
      );
    },
  );
  it("refuses malformed/extra-key protocol payloads without leaking their data", async () => {
    for (const data of [
      null,
      [],
      { status: "available" },
      {
        schemaVersion: "requirement-relationship-context/1.0.0",
        status: "not_found",
        scoringEligible: false,
        detail: "SYNTHETIC_PRIVATE_FAILURE_DETAIL",
      },
    ])
      await refused(data);
  });
  it.each(["returned", "thrown"] as const)(
    "sanitizes %s RPC errors and never uses table fallback",
    async (kind) => {
      const marker = "SYNTHETIC_PRIVATE_FAILURE_DETAIL",
        mock = rpcClient(null);
      if (kind === "returned")
        mock.rpc.mockResolvedValue({
          data: null,
          error: { message: marker, details: marker },
        });
      else mock.rpc.mockRejectedValue(Error(marker));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      let failure: unknown;
      try {
        await loadRequirementRelationshipContext(mock.client, id(4), id(1));
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(RequirementRelationshipContextError);
      expect(failure).toMatchObject({
        status: 503,
        reason: "unavailable",
        message: "Relationship context is unavailable.",
      });
      if (!(failure instanceof Error)) throw Error("EXPECTED_SAFE_ERROR");
      expect(failure.stack).not.toContain(marker);
      expect(JSON.stringify(failure)).not.toContain(marker);
      expect(log).not.toHaveBeenCalled();
      expect(mock.rpc).toHaveBeenCalledOnce();
      expect(mock.from).not.toHaveBeenCalled();
    },
  );
  it("refuses cyclic and over-depth results with a fixed failure", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await refused(cyclic);
    let nested: unknown = {};
    for (let i = 0; i < 34; i++) nested = { nested };
    await refused(nested);
  });
  it("refuses excess ancestor/member/group cardinalities rather than truncating", async () => {
    const ancestral = declaredRow();
    ancestral.ancestors = Array.from({ length: 65 }, () =>
      structuredClone(ancestral.ancestors[0]),
    );
    await refused(ancestral);
    const grouped = associationRow();
    grouped.headerSnapshot.groups = Array.from({ length: 1001 }, () =>
      structuredClone(grouped.headerSnapshot.groups[0]),
    );
    await refused(grouped);
    const members = associationRow();
    members.headerSnapshot.groups[0].members.push(
      structuredClone(members.headerSnapshot.groups[0].members[0]),
    );
    await refused(members);
  });
  it("keeps typed diagnostics read-only and pauses typed proposals", async () => {
    const fixture = await createRequirementContextFixture({ confirm: true });
    const context = fixture.context;
    const model = buildTypedScoreDiagnostics(context);
    expect(context.scoringEligible).toBe(false);
    expect(model.typedCoverage.state).toBe("available");
    expect(model.typedCoverage.scoringEligible).toBe(false);
    expect(model.typedCoverage.binding).toEqual({
      source: context.source,
      attemptId: context.attempt.id,
      canonical: {
        versionId: context.canonical.versionId,
        revision: context.canonical.revision,
        contentSha256: context.canonical.contentSha256,
      },
      requirements: {
        versionId: context.requirements.versionId,
        revision: context.requirements.revision,
        inputSha256: context.requirements.inputSha256,
        contentSha256: context.requirements.contentSha256,
      },
      profiles: context.profiles,
    });
    expect(model.diagnostics.score).toMatchObject({
      state: "withheld",
      canonicalVersionId: context.canonical.versionId,
      requirementVersionId: context.requirements.versionId,
      evidenceVersionId: context.attempt.id,
      calibrationReceipt: null,
    });
    expect(model.diagnostics.score.dimensions).toHaveLength(3);
    for (const dimension of model.diagnostics.score.dimensions)
      expect(dimension).toMatchObject({
        value: null,
        coverage: null,
        eligible: false,
      });
    expect(model.diagnostics.readinessAggregate).toBeNull();
    expect(model.diagnostics.alignment).toEqual([]);
    expect(() =>
      buildSuggestion(
        context.canonical.content,
        fixture.targetFactId,
        "xyz",
        model.diagnostics,
      ),
    ).toThrow(TypedAuthoringPausedError);
  });
});

describe("relationship context SQL source contracts only", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261114104337_requirement_relationship_context.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const body = (tag: string) =>
    migration.split(`as $${tag}$`)[1]?.split(`$${tag}$`)[0] ?? "";
  const reader = body("rr_read"),
    headers = body("rr_headers"),
    charge = body("rr_charge");
  const catalog = (
    tag: string,
  ): {
    signature: string;
    sha256: string;
    definer: boolean;
    volatility: string;
    resultType: string;
    strict: boolean;
    language: string;
    serviceExecute: boolean;
  }[] => {
    const text = migration.split(`$${tag}$`)[1];
    if (!text) throw Error("SQL_SOURCE_CATALOG_NOT_FOUND");
    return JSON.parse(text);
  };
  it("keeps one loaded proof cache, selected historical prefix and final owned pair/head recheck", () => {
    expect(reader).not.toBe("");
    expect(headers).not.toBe("");
    expect(reader.match(/private\.entry_regroup_cache\(/g)).toHaveLength(1);
    expect(reader).toContain("result_revision<=v.revision");
    expect(reader).toContain(
      "private.entry_regroup_prove_data(scope,base,through,c);c:=loaded->'cache'",
    );
    expect(reader).toContain(
      "private.requirement_header_context(scope,loaded->'data',c);c:=headers->'cache'",
    );
    expect(reader).not.toMatch(/private\.entry_regroup_current\s*\(/);
    expect(headers).not.toMatch(
      /private\.entry_regroup_(?:cache|prove_data|current)\s*\(/,
    );
    expect(headers).toContain(
      "private.entry_regroup_resolve_loaded(p_scope,p_base,jsonb_build_array(selection),c);c:=resolution->'cache'",
    );
    expect(reader).toContain(
      "final_scope:=private.entry_regroup_scope(p_user_id,p_analysis_id,v.source_evidence_version_id)",
    );
    expect(reader).toContain(
      "final_canonical_head.version_id,final_canonical_head.revision",
    );
    expect(reader).toContain("final_jd_head.id,final_jd_head.revision");
    expect(reader).toContain("job_id=a.job_id");
    expect(reader).toContain(
      "selected_jd.id and content=selected_jd.content and revision=selected_jd.revision",
    );
    expect(reader).toContain("'pageCount',src.page_count");
    expect(reader).not.toMatch(
      /'pageCount'\s*,\s*(?:jsonb_array_length|least|greatest|coalesce)/i,
    );
  });
  it("charges new JD/projection/output visits without resets or a new32 active-origin ceiling", () => {
    expect(charge).toContain("private.entry_regroup_work(p_cache,1)");
    expect(charge).toContain(
      "private.entry_regroup_inspect(c,p_kind,p_id,p_value)",
    );
    expect(charge).toContain("strict $.**");
    expect(charge).toContain("+units>8000000");
    expect(reader).toContain("octet_length(selected_jd.content::text)>1048576");
    expect(reader).toContain(
      "private.requirement_relationship_charge(c,'requirements',selected_jd.id::text,selected_jd.content)",
    );
    expect(headers).toContain(
      "private.requirement_relationship_charge(c,'header-output',version_id::text,output)",
    );
    expect(reader).toContain("jsonb_path_query(result,'strict $.**')");
    expect(reader).toContain(
      "octet_length(convert_to(result::text,'UTF8'))>33554432",
    );
    expect(headers).not.toMatch(
      /group_index\s*>\s*32|jsonb_array_length\(links\)\s*>\s*32/,
    );
    expect(migration).not.toMatch(
      /create(?: or replace)? function private\.entry_regroup_/i,
    );
  });
  it("preserves old103 readiness entries and binds all35 added definitions to actual source bytes", () => {
    const old = catalog("rr_old_catalog"),
      next = catalog("rr_new_catalog");
    expect(old).toHaveLength(103);
    expect(next).toHaveLength(138);
    expect(new Set(next.map((entry) => entry.signature)).size).toBe(
      next.length,
    );
    for (const entry of old)
      expect(next.find((item) => item.signature === entry.signature)).toEqual(
        entry,
      );
    const additions = next.filter(
      (entry) => !old.some((prior) => prior.signature === entry.signature),
    );
    expect(additions).toHaveLength(35);
    const newBodies = new Map([
      [
        "private.requirement_relationship_charge(jsonb,text,text,jsonb)",
        charge,
      ],
      ["private.requirement_header_context(jsonb,jsonb,jsonb)", headers],
      ["public.read_requirement_relationship_context(uuid,uuid,jsonb)", reader],
    ]);
    const prior = readFileSync(
      new URL(
        "../../supabase/migrations/20261111010000_job_requirement_relations.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const jdBodies = new Map(
      [
        ...prior.matchAll(
          /create function (private\.[a-z0-9_]+)\([\s\S]*?\)\s*returns[\s\S]*?\bas (\$[a-zA-Z0-9_]*\$)([\s\S]*?)\2;/g,
        ),
      ].map((match) => [match[1], match[3]]),
    );
    for (const entry of additions) {
      const actual =
        newBodies.get(entry.signature) ??
        jdBodies.get(entry.signature.split("(")[0]);
      expect(actual, entry.signature).toBeDefined();
      expect(
        createHash("sha256").update(actual!).digest("hex"),
        entry.signature,
      ).toBe(entry.sha256);
      expect(entry.serviceExecute).toBe(
        entry.signature ===
          "public.read_requirement_relationship_context(uuid,uuid,jsonb)",
      );
    }
    expect(migration).toContain(
      "predecessor text:='de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd'",
    );
    expect(migration).toContain(
      "postimage text:='f88516e99f6ee34120dc66217eea3191486ff0083d9053615e14cd925cdec999'",
    );
    for (const guard of [
      "RR_READINESS_PREDECESSOR_DRIFT",
      "RR_READINESS_CONTEXT_DRIFT",
      "RR_READINESS_POSTIMAGE_DRIFT",
      "RR_SUCCESSOR_NOT_ADMITTED",
    ])
      expect(migration).toContain(guard);
  });
  it("keeps public admission scoped to service_role and private helpers denied", () => {
    expect(migration).toContain(
      "returns jsonb\nlanguage plpgsql volatile security definer set search_path='' as $rr_read$",
    );
    expect(migration).toContain(
      "revoke all on function public.read_requirement_relationship_context(uuid,uuid,jsonb) from public,anon,authenticated,service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.read_requirement_relationship_context(uuid,uuid,jsonb) to service_role",
    );
    expect(migration).toContain(
      "revoke all on function private.requirement_relationship_charge(jsonb,text,text,jsonb),private.requirement_header_context(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role",
    );
    expect(migration).not.toMatch(/grant[^;]+(?:anon|authenticated)/i);
    expect(migration).not.toMatch(
      /create(?: or replace)? table|create policy|enable row level security/i,
    );
    expect(reader).toContain(
      "when others then return jsonb_build_object('schemaVersion','requirement-relationship-context/1.0.0','status','unavailable','scoringEligible',false)",
    );
  });
});
