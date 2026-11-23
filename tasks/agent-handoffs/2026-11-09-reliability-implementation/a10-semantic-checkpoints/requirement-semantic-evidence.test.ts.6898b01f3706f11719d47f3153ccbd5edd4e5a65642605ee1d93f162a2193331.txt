import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import type { CanonicalResumeDraft } from "../../app/lib/server/canonical-resume-schema";
import { importCanonicalGroupedEvidence } from "../../app/lib/server/canonical-grouped-import";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import {
  resolveJobAlias,
  JOB_ALIAS_LEXICON_SHA256,
  JOB_ALIAS_POLICY_VERSION,
} from "../../app/lib/server/job-aliases";
import {
  loadRequirementRelationshipContext,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "../../app/lib/server/requirement-relationship-context";

import {
  deriveRequirementSemanticEvidence,
  RequirementSemanticEvidenceSchema,
  REQUIREMENT_SEMANTIC_POLICY,
  REQUIREMENT_SEMANTIC_POLICY_VERSION,
  REQUIREMENT_SEMANTIC_POLICY_SHA256,
  type RequirementSemanticEvidence,
} from "../../app/lib/server/requirement-semantic-evidence";

const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HEADER =
  "Experience\nEmployer: Synthetic Orchard Labs\nRole: Platform Engineer\nDates: 2018-01-01 - 2024-01-01";
type FixtureOptions = {
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
async function readerFixture(options: FixtureOptions = {}) {
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
    `Requirements\n${requiredSkill} required`,
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
    sourceMetadata: { pageCount: 1 },
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
  const rpc = vi.fn<
    (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>
  >(async () => ({ data: row, error: null }));
  const from = vi.fn(() => {
    throw Error("TABLE_FALLBACK_FORBIDDEN");
  });
  const client = { rpc, from } as unknown as Parameters<
    typeof loadRequirementRelationshipContext
  >[0];
  const context = await loadRequirementRelationshipContext(
    client,
    owned.analysisId,
    owned.ownerId,
  );
  expect(rpc).toHaveBeenCalledOnce();
  expect(from).not.toHaveBeenCalled();
  return { context, targetFactId: target.id, original, text };
}

// Fixed essential inputs, not fabricated semantic outputs. Assertions follow the actual published producer API.
const ESSENTIAL_INPUTS = {
  source: "Built services using PostgreSQL",
  responsibility: "Responsible for database services using PostgreSQL",
  dated: "Used PostgreSQL from 2020-01-01 to 2022-01-01",
  literal: "Built services using Python",
  alias: "Built services using Postgres",
  prohibited: [
    "Did not build services using PostgreSQL",
    "Will build services using PostgreSQL",
    "Would build services using PostgreSQL",
    "I built services using PostgreSQL",
    "The team built services using PostgreSQL",
    '"Built services using PostgreSQL"',
  ],
};

describe("bounded requirement semantic evidence", () => {
  it("recognizes an actual exact Python clause without inventing an alias concept", async () => {
    const fixture = await readerFixture({
      clauses: ["Built services using Python"],
      skill: "Python",
      requiredSkill: "Python",
    });
    const result = deriveRequirementSemanticEvidence(fixture.context);
    expect(result.state).toBe("available");
    expect(result.scoringEligible).toBe(false);
    expect(
      result.witnesses.find(
        (witness) => witness.factId === fixture.targetFactId,
      ),
    ).toMatchObject({
      tier: "source_contribution",
      basis: "source_quote",
      actor: "resume_author_claim",
      skill: {
        value: "Python",
        identity: {
          kind: "literal_only",
          mappingKind: "unmapped",
          conceptId: null,
        },
      },
    });
  });
  it("does not promote a clause scoped by Team achievements into candidate agency", async () => {
    const fixture = await readerFixture({
      clauses: ["Team achievements:", "Built services using Python"],
      targetIndex: 1,
      skill: "Python",
      requiredSkill: "Python",
    });
    const result = deriveRequirementSemanticEvidence(fixture.context);
    expect(result.state).toBe("available");
    expect(
      result.witnesses.filter(
        (witness) => witness.factId === fixture.targetFactId,
      ),
    ).toEqual([]);
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ factId: fixture.targetFactId }),
    );
  });
});

type Available = Extract<RequirementSemanticEvidence, { state: "available" }>;
function available(raw: unknown): Available {
  const result = deriveRequirementSemanticEvidence(raw);
  expect(result.state).toBe("available");
  expect(result.scoringEligible).toBe(false);
  expect(RequirementSemanticEvidenceSchema.parse(result)).toEqual(result);
  if (result.state !== "available")
    throw Error("EXPECTED_SYNTHETIC_AVAILABLE_RESULT");
  return result;
}
function targetWitness(result: Available, factId: string) {
  const witnesses = result.witnesses.filter(
    (candidate) => candidate.factId === factId,
  );
  expect(witnesses).toHaveLength(1);
  return witnesses[0];
}
function unresolvedTarget(result: Available, factId: string, reason?: string) {
  expect(
    result.witnesses.filter((candidate) => candidate.factId === factId),
  ).toEqual([]);
  expect(result.unresolved).toContainEqual(
    expect.objectContaining({ factId, ...(reason ? { reason } : {}) }),
  );
}
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

describe("immutable source and exact current declarations", () => {
  it("binds real source/listing witnesses, Unicode parts, policies and native identities without mutation", async () => {
    const fixture = await readerFixture({
      clauses: ["Built 𐐀services using PostgreSQL"],
    });
    const before = structuredClone(fixture.context),
      result = available(fixture.context);
    expect(
      deriveRequirementSemanticEvidence(structuredClone(fixture.context)),
    ).toEqual(result);
    expect(fixture.context).toEqual(before);
    expect(result.policy).toEqual({
      version: REQUIREMENT_SEMANTIC_POLICY_VERSION,
      sha256: REQUIREMENT_SEMANTIC_POLICY_SHA256,
    });
    expect(
      createHash("sha256")
        .update(JSON.stringify(REQUIREMENT_SEMANTIC_POLICY))
        .digest("hex"),
    ).toBe(REQUIREMENT_SEMANTIC_POLICY_SHA256);
    expect(REQUIREMENT_SEMANTIC_POLICY.aliasPolicyVersion).toBe(
      JOB_ALIAS_POLICY_VERSION,
    );
    expect(REQUIREMENT_SEMANTIC_POLICY.aliasLexiconSha256).toBe(
      JOB_ALIAS_LEXICON_SHA256,
    );
    expect(REQUIREMENT_SEMANTIC_POLICY.durationScalar).toBeNull();
    expect(result.binding).toEqual({
      source: fixture.context.source,
      attemptId: fixture.context.attempt.id,
      canonical: {
        versionId: fixture.context.canonical.versionId,
        revision: fixture.context.canonical.revision,
        contentSha256: fixture.context.canonical.contentSha256,
      },
      requirements: {
        versionId: fixture.context.requirements.versionId,
        revision: fixture.context.requirements.revision,
        inputSha256: fixture.context.requirements.inputSha256,
        contentSha256: fixture.context.requirements.contentSha256,
      },
      profiles: fixture.context.profiles,
    });
    expect(result.binding.canonical.contentSha256).toBe("b".repeat(64));
    const witness = targetWitness(result, fixture.targetFactId),
      fact = fixture.context.canonical.content.facts.find(
        (candidate) => candidate.id === fixture.targetFactId,
      )!;
    expect(witness).toMatchObject({
      tier: "source_contribution",
      basis: "source_quote",
      actor: "resume_author_claim",
      clause: { value: fact.value },
      action: { value: "Built" },
      object: { value: "𐐀services" },
      interval: null,
      confirmation: null,
    });
    expect(witness.clause.end).toBe(Array.from(fact.value).length);
    expect(witness.clause.end).toBeLessThan(fact.value.length);
    for (const part of [
      witness.clause,
      witness.action!,
      witness.object!,
      witness.skill,
    ])
      expect(Array.from(fact.value).slice(part.start, part.end).join("")).toBe(
        part.value,
      );
    for (const citation of witness.currentSourceCitations) {
      const span = fixture.context.attempt.envelope.spans.find(
        (candidate) => candidate.id === citation.spanId,
      )!;
      expect(
        Array.from(span.text).slice(citation.start, citation.end).join(""),
      ).toBe(fact.value);
      expect(citation.attemptId).toBe(fixture.context.attempt.id);
      expect(citation.pageStart).toBe(span.start + citation.start);
    }
    const listed = result.witnesses.find(
      (candidate) => candidate.tier === "listed",
    );
    expect(listed).toMatchObject({
      factType: "skill",
      tier: "listed",
      basis: "source_quote",
      action: null,
      object: null,
      interval: null,
    });
    expect(
      result.witnesses.some((candidate) => candidate.tier === "dated_use"),
    ).toBe(false);
    expect(
      result.unresolved.some(
        (candidate) => candidate.reason === "unbound_job_dates",
      ),
    ).toBe(true);
  });
  it.each([false, true])(
    "keeps an edited responsibility a declaration with confirmation=%s",
    async (confirm) => {
      const fixture = await readerFixture({
          edit: ESSENTIAL_INPUTS.responsibility,
          confirm,
        }),
        result = available(fixture.context);
      if (!confirm) {
        unresolvedTarget(
          result,
          fixture.targetFactId,
          "missing_source_or_confirmation",
        );
        return;
      }
      const witness = targetWitness(result, fixture.targetFactId);
      expect(witness).toMatchObject({
        tier: "candidate_responsibility",
        basis: "candidate_declaration",
        actor: "owner_declaration",
        confirmation: {
          actorId: fixture.context.source.ownerId,
          value: ESSENTIAL_INPUTS.responsibility,
        },
        currentSourceCitations: [],
        observedOrigin: {
          versionId: fixture.original.versionId,
          factId: fixture.targetFactId,
          value: ESSENTIAL_INPUTS.source,
        },
      });
      expect(witness.observedOrigin?.citations.length).toBeGreaterThan(0);
      expect(witness.clause.value).toBe(ESSENTIAL_INPUTS.responsibility);
      expect(
        result.witnesses.filter(
          (candidate) =>
            candidate.factId === fixture.targetFactId &&
            candidate.basis === "source_quote",
        ),
      ).toEqual([]);
      expect(fixture.context.ancestors).toHaveLength(2);
    },
  );
  it("does not turn generic exact confirmation or an old observed quote into stronger current agency", async () => {
    const fixture = await readerFixture({
        edit: "Led services using PostgreSQL",
        confirm: true,
      }),
      result = available(fixture.context);
    unresolvedTarget(result, fixture.targetFactId, "unsupported_grammar");
    expect(
      fixture.context.ancestors
        .at(-1)
        ?.content.facts.find(
          (candidate) => candidate.id === fixture.targetFactId,
        )?.value,
    ).toBe(ESSENTIAL_INPUTS.source);
  });
  it("requires explicit responsibility confirmation even when that wording appears in the source", async () => {
    const fixture = await readerFixture({
      clauses: [ESSENTIAL_INPUTS.responsibility],
    });
    unresolvedTarget(
      available(fixture.context),
      fixture.targetFactId,
      "missing_responsibility_confirmation",
    );
  });
});

describe("literal identity and bounded agency", () => {
  it.each([
    ["Postgres", "PostgreSQL", "local-software:postgresql"],
    ["JS", "JavaScript", "local-software:javascript"],
  ])(
    "retains approved %s alias mapping without adding a synonym taxonomy",
    async (skill, requiredSkill, conceptId) => {
      const fixture = await readerFixture({
        clauses: [`Built services using ${skill}`],
        skill,
        requiredSkill,
      });
      const witness = targetWitness(
        available(fixture.context),
        fixture.targetFactId,
      );
      expect(witness.skill.value).toBe(skill);
      expect(witness.skill.identity).toMatchObject({
        kind: "mapped_concept",
        mappingKind: "alias",
        conceptId,
        canonicalValue: requiredSkill,
        policyVersion: JOB_ALIAS_POLICY_VERSION,
        lexiconSha256: JOB_ALIAS_LEXICON_SHA256,
      });
      expect(resolveJobAlias(skill).conceptId).toBe(conceptId);
    },
  );
  it.each(["JSX", "Pydantic"])(
    "does not infer %s from an approved alias or a different Python requirement",
    async (skill) => {
      const fixture = await readerFixture({
        clauses: [`Built services using ${skill}`],
        requiredSkill: "Python",
      });
      unresolvedTarget(
        available(fixture.context),
        fixture.targetFactId,
        "unknown_skill_identity",
      );
    },
  );
  it.each(ESSENTIAL_INPUTS.prohibited)(
    "abstains from guarded claim %s",
    async (clause) => {
      const fixture = await readerFixture({ clauses: [clause] }),
        result = available(fixture.context);
      unresolvedTarget(result, fixture.targetFactId);
    },
  );
  it("does not treat a standalone multiline quotation as candidate agency", async () => {
    const fixture = await readerFixture({
      clauses: ['"', "Built services using Python", '"'],
      targetIndex: 1,
      skill: "Python",
      requiredSkill: "Python",
    });
    const result = available(fixture.context);
    unresolvedTarget(result, fixture.targetFactId);
    const qualified = await readerFixture({
      clauses: [
        '"',
        "Personal contributions:",
        "Built services using Python",
        '"',
      ],
      targetIndex: 2,
      skill: "Python",
      requiredSkill: "Python",
    });
    unresolvedTarget(available(qualified.context), qualified.targetFactId);
  });
});

describe("explicit subject-bound date claims", () => {
  it.each(["source", "declaration"] as const)(
    "keeps %s dated use explicit without computing duration",
    async (basis) => {
      const fixture = await readerFixture(
        basis === "source"
          ? { clauses: [ESSENTIAL_INPUTS.dated] }
          : { edit: ESSENTIAL_INPUTS.dated, confirm: true },
      );
      const result = available(fixture.context);
      if (basis === "source") {
        const fact = fixture.context.canonical.content.facts.find(
          (candidate) => candidate.id === fixture.targetFactId,
        )!;
        const span = fixture.context.attempt.envelope.spans.find((candidate) =>
          fact.sources.some((cite) => cite.spanId === candidate.id),
        )!;
        const layout = {
          fact,
          span,
          sameSpanFacts: fixture.context.canonical.content.facts.filter(
            (candidate) =>
              candidate.sources.some((cite) => cite.spanId === span.id),
          ),
        };
        expect(
          result.witnesses.some(
            (candidate) =>
              candidate.factId === fixture.targetFactId &&
              candidate.tier === "dated_use",
          ),
          JSON.stringify(layout),
        ).toBe(true);
      }
      const witness = targetWitness(result, fixture.targetFactId);
      expect(witness).toMatchObject({
        tier: "dated_use",
        basis: basis === "source" ? "source_quote" : "candidate_declaration",
        interval: {
          startDate: "2020-01-01",
          endDate: "2022-01-01",
          endpointSemantics: "literal_to_unspecified",
          claim: basis === "source" ? "source_reported" : "candidate_declared",
        },
      });
      expect(witness.offsetSpace).toBe(
        basis === "source" ? "source_span" : "current_fact",
      );
      expect(witness.confirmationScope).toBe("current_fact");
      const fact = fixture.context.canonical.content.facts.find(
        (candidate) => candidate.id === fixture.targetFactId,
      )!;
      let coordinateText = fact.value;
      if (basis === "source") {
        expect(fact.value).toBe("Used PostgreSQL from");
        expect(witness.clause.value).toBe(ESSENTIAL_INPUTS.dated);
        expect(fact.value).not.toBe(witness.clause.value);
        const sourceClause = witness.sourceClause;
        expect(sourceClause).not.toBeNull();
        if (!sourceClause) throw Error("EXPECTED_FULL_IMMUTABLE_SOURCE_CLAUSE");
        const span = fixture.context.attempt.envelope.spans.find(
          (candidate) => candidate.id === sourceClause.citation.spanId,
        )!;
        coordinateText = span.text;
        expect(sourceClause.quote).toBe(ESSENTIAL_INPUTS.dated);
        expect(
          Array.from(span.text)
            .slice(sourceClause.citation.start, sourceClause.citation.end)
            .join(""),
        ).toBe(sourceClause.quote);
        expect(sourceClause.confirmation).toBeNull();
        expect(witness.confirmation).toEqual(fact.confirmation);
        expect(sourceClause.supportingFacts.length).toBeGreaterThan(1);
        for (const support of sourceClause.supportingFacts) {
          const current = fixture.context.canonical.content.facts.find(
            (candidate) => candidate.id === support.factId,
          )!;
          expect(current).toBeDefined();
          expect(support.factType).toBe(current.type);
          expect(support.citation.spanId).toBe(span.id);
          expect(
            current.sources.some(
              (cite) =>
                cite.attemptId === support.citation.attemptId &&
                cite.spanId === support.citation.spanId &&
                cite.start === support.citation.start &&
                cite.end === support.citation.end,
            ),
          ).toBe(true);
          expect(
            Array.from(span.text)
              .slice(support.citation.start, support.citation.end)
              .join(""),
          ).toBe(current.value);
          const locations: typeof support.locations = [];
          const doc = fixture.context.canonical.content;
          if (doc.contactFactIds.includes(current.id))
            locations.push({
              kind: "contact",
              sectionId: null,
              entryId: null,
              bulletId: null,
            });
          for (const section of doc.sections) {
            if (section.factIds.includes(current.id))
              locations.push({
                kind: "section",
                sectionId: section.id,
                entryId: null,
                bulletId: null,
              });
            for (const entry of section.entries) {
              if (entry.factIds.includes(current.id))
                locations.push({
                  kind: "entry",
                  sectionId: section.id,
                  entryId: entry.id,
                  bulletId: null,
                });
              for (const bullet of entry.bullets)
                if (bullet.factIds.includes(current.id))
                  locations.push({
                    kind: "bullet",
                    sectionId: section.id,
                    entryId: entry.id,
                    bulletId: bullet.id,
                  });
            }
          }
          expect(support.locations).toEqual(locations);
        }
        for (const cite of witness.currentSourceCitations)
          expect(
            Array.from(span.text).slice(cite.start, cite.end).join(""),
          ).toBe(fact.value);
        expect(
          sourceClause.supportingFacts.some(
            (support) =>
              support.factType === "phone" &&
              support.locations.some(
                (location) => location.kind === "contact",
              ) &&
              support.locations.some((location) => location.kind === "entry"),
          ),
        ).toBe(true);
      } else {
        expect(witness.sourceClause).toBeNull();
        expect(fact.value).toBe(ESSENTIAL_INPUTS.dated);
      }
      expect(witness.currentSourceCitations.length > 0).toBe(
        basis === "source",
      );
      expect(Object.keys(witness.interval!).sort()).toEqual([
        "claim",
        "endDate",
        "endEvidence",
        "endpointSemantics",
        "startDate",
        "startEvidence",
      ]);
      for (const part of [
        witness.interval!.startEvidence,
        witness.interval!.endEvidence,
      ])
        expect(
          Array.from(coordinateText).slice(part.start, part.end).join(""),
        ).toBe(part.value);
    },
  );
  it.each([
    ["Used PostgreSQL from 2020 to 2022", "unsupported_grammar"],
    ["Used PostgreSQL from 2020-01-01 to Present", "unsupported_grammar"],
    ["Used PostgreSQL from 2022-01-01 to 2020-01-01", "invalid_date_interval"],
    ["Used PostgreSQL from 2020-02-30 to 2022-01-01", "invalid_date_interval"],
    ["Used PostgreSQL from 2020-01-01 to 2099-01-01", "future_interval"],
  ])("abstains from unbound/invalid date claim %s", async (clause, reason) => {
    const fixture = await readerFixture({ clauses: [clause] });
    unresolvedTarget(available(fixture.context), fixture.targetFactId, reason);
  });
  it("retains two explicit overlapping source intervals rather than unioning or summing them", async () => {
    const clauses = [
      ESSENTIAL_INPUTS.dated,
      "Used PostgreSQL from 2021-01-01 to 2023-01-01",
    ];
    const fixture = await readerFixture({ clauses }),
      result = available(fixture.context);
    const dated = result.witnesses.filter(
      (witness) => witness.tier === "dated_use",
    );
    expect(dated).toHaveLength(2);
    expect(
      dated.map((witness) => [
        witness.interval!.startDate,
        witness.interval!.endDate,
      ]),
    ).toEqual([
      ["2020-01-01", "2022-01-01"],
      ["2021-01-01", "2023-01-01"],
    ]);
    expect(new Set(dated.map((witness) => witness.factId)).size).toBe(2);
    expect(new Set(dated.map((witness) => witness.evidenceGroupId)).size).toBe(
      2,
    );
  });
});

describe("binding, source integrity and explicit budgets", () => {
  it.each([
    ["source owner", "source.ownerId", id(90)],
    ["source SHA", "source.inputSha256", "e".repeat(64)],
    ["attempt", "attempt.id", id(90)],
    ["canonical version", "canonical.versionId", id(90)],
    ["JD version", "requirements.versionId", id(90)],
    ["policy profile", "profiles.aliasLexiconSha256", "e".repeat(64)],
    ["caller witness flag", "callerSemanticEvidence", { accepted: true }],
  ] as const)(
    "refuses %s binding/injection swaps",
    async (_label, path, replacement) => {
      const fixture = await readerFixture(),
        raw = structuredClone(fixture.context);
      setPath(raw, path, replacement);
      const result = deriveRequirementSemanticEvidence(raw);
      expect(result.state).toBe("unavailable");
      expect(result.unavailableReason).toBe("invalid_context");
      expect(result.witnesses).toEqual([]);
      expect(result.scoringEligible).toBe(false);
    },
  );
  it.each(["span", "offset"] as const)(
    "retains unresolved when a current contribution's %s citation no longer quotes it",
    async (kind) => {
      const fixture = await readerFixture(),
        raw = structuredClone(fixture.context);
      const fact = raw.canonical.content.facts.find(
        (candidate) => candidate.id === fixture.targetFactId,
      )!;
      if (kind === "span") fact.sources[0].spanId = "missing-current-span";
      else fact.sources[0].start += 1;
      unresolvedTarget(
        available(raw),
        fixture.targetFactId,
        "source_quote_mismatch",
      );
    },
  );
  it.each([
    ["fr-FR", "software-engineering"],
    ["en-IN", "finance"],
  ])("abstains from unsupported %s/%s context", async (locale, domain) => {
    const fixture = await readerFixture({ locale, domain }),
      result = deriveRequirementSemanticEvidence(fixture.context);
    expect(result.state).toBe("unavailable");
    expect(result.unavailableReason).toBe("unsupported_context");
    expect(result.witnesses).toEqual([]);
  });
  it("rejects a real builder-generated oversized immutable suffix before witness expansion", async () => {
    const clauses = Array.from(
      { length: 97 },
      (_, index) => `Built resource${index}${"x".repeat(800)} using PostgreSQL`,
    );
    const fixture = await readerFixture({ clauses, extraVersions: 12 });
    const docs = [
      fixture.context.canonical.content,
      ...fixture.context.ancestors.map((ancestor) => ancestor.content),
    ];
    const measured = docs.reduce(
      (total, doc) =>
        total +
        doc.facts.reduce(
          (sum, fact) =>
            sum + fact.value.length + (fact.confirmation?.value.length ?? 0),
          0,
        ) +
        doc.sections.reduce(
          (sum, section) =>
            sum +
            section.title.length +
            section.entries.reduce(
              (subtotal, entry) =>
                subtotal +
                entry.bullets.reduce(
                  (bulletTotal, bullet) => bulletTotal + bullet.text.length,
                  0,
                ),
              0,
            ),
          0,
        ),
      0,
    );
    expect(measured).toBeGreaterThan(
      REQUIREMENT_SEMANTIC_POLICY.limits.suffixTextUtf16,
    );
    const result = deriveRequirementSemanticEvidence(fixture.context);
    expect(result.state).toBe("unavailable");
    expect(result.unavailableReason).toBe("resource_limit");
    expect(result.witnesses).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
