import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import { buildTypedAuthoringPatch } from "../../app/lib/server/typed-authoring-protocol";
import {
  buildCanonicalRewriteWorkspace,
  createCanonicalRewriteRequest,
  reconstructCanonicalRewrite,
  canonicalRewriteProjection,
  validateCanonicalRewritePublication,
  CanonicalRewritePlanSchema,
} from "../../app/lib/server/canonical-rewrite-contract";
import {
  canonicalRewritePayload,
  canonicalRewriteProviderKey,
} from "../../app/lib/server/canonical-rewrite-ai";

const profile = {
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256: "a".repeat(64),
  readerSha256: "b".repeat(64),
  prepareSha256: "c".repeat(64),
  claimSha256: "d".repeat(64),
  finishSha256: "e".repeat(64),
  settleSha256: "f".repeat(64),
  usageSha256: "0".repeat(64), // Explicit synthetic expected profile, not catalog evidence.
};
async function fixture(edit?: string) {
  const f = await createRequirementContextFixture({ confirm: true, edit }),
    clauseId = f.context.requirements.content.relations.clauses[0].id;
  const patch = buildTypedAuthoringPatch(
    f.context,
    {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId,
      targetFactId: f.targetFactId,
    },
    "Created",
  );
  const fact = f.context.canonical.content.facts.find(
    (v) => v.id === f.targetFactId,
  )!;
  const raw = {
    schemaVersion: "canonical-rewrite-context/1.0.0",
    status: "available",
    relationshipContext: f.context,
    draft: {
      id: id(201),
      updatedAt: "2026-11-15T00:00:00.000001Z",
      contentSha256: "1".repeat(64),
      versionId: null as string | null,
      revision: 0,
      headId: null as string | null,
    },
    bindingSha256: "2".repeat(64),
    manifest: [
      {
        sourceId: 0,
        factId: fact.id,
        valueSha256: patch.target.currentValueSha256,
        location: {
          sectionId: patch.target.sectionId,
          entryId: patch.target.entryId,
          bulletId: patch.target.bulletId,
        },
        confirmation: fact.confirmation,
        basis: patch.support.basis,
        currentCitations: patch.sourceCitations,
        clauseIds: [clauseId],
        authoringVersion: patch.policies.authoringVersion,
      },
    ],
    saved: {
      state: "legacy_unbound" as "legacy_unbound" | "current" | "historical",
      publication: null as unknown,
      legacyDraft: {
        summary: "Legacy wording remains copyable.",
        bullets: [],
      } as unknown,
    },
    readiness: { ...profile, schemaReady: true, mutatorsExecutable: true },
  };
  return {
    ...f,
    clauseId,
    raw,
    workspace: buildCanonicalRewriteWorkspace(raw, "unit-model", profile),
  };
}
describe("owned canonical rewrite closed contract", () => {
  it.each([undefined, "Built database services using PostgreSQL"])(
    "uses actual current confirmed values and truthful source basis %s",
    async (edit) => {
      const f = await fixture(edit),
        source = f.workspace.sources[0];
      expect(source.value).toBe(edit ?? "Built services using PostgreSQL");
      expect(source.basis).toBe(
        edit ? "candidate_declaration" : "source_quote",
      );
      expect(source.currentCitations.length).toBe(edit ? 0 : 1);
      expect(canonicalRewritePayload(f.workspace).sources[0].text).toBe(
        source.value,
      );
      const request = createCanonicalRewriteRequest(f.workspace, id(210));
      expect(request.expectedDraftUpdatedAt).toBe(f.raw.draft.updatedAt);
      const result = reconstructCanonicalRewrite(
        f.workspace,
        request.operationId,
        {
          summarySourceId: 0,
          bullets: [
            {
              sourceId: 0,
              clauseId: f.clauseId,
              operation: "equivalent_action",
              replacementAction: "Created",
            },
          ],
        },
      );
      expect(result.bullets[0].after).toBe(
        source.value.replace(/^Built/u, "Created"),
      );
      expect(result.summary?.after).toBe(source.value);
      expect(canonicalRewriteProjection(result).bullets[0].original).toBe(
        source.value,
      );
      expect(result.bullets[0].source.confirmation.actorId).toBe(
        f.owned.ownerId,
      );
    },
  );
  it("retains explicit copy semantics and refuses free prose, unknown sources, wrong clauses, duplicates and noops", async () => {
    const f = await fixture();
    const copy = {
      sourceId: 0,
      clauseId: f.clauseId,
      operation: "copy",
      replacementAction: null,
    };
    const result = reconstructCanonicalRewrite(f.workspace, id(211), {
      summarySourceId: null,
      bullets: [copy],
    });
    expect(result.bullets[0].after).toBe(result.bullets[0].before);
    expect(
      CanonicalRewritePlanSchema.safeParse({
        summarySourceId: null,
        bullets: [{ ...copy, rewrite: "Invented revenue" }],
      }).success,
    ).toBe(false);
    for (const bullet of [
      { ...copy, sourceId: 31 },
      { ...copy, clauseId: "f".repeat(64) },
      { ...copy, operation: "equivalent_action", replacementAction: "Built" },
    ])
      expect(() =>
        reconstructCanonicalRewrite(f.workspace, id(211), {
          summarySourceId: null,
          bullets: [bullet],
        }),
      ).toThrow();
    expect(() =>
      reconstructCanonicalRewrite(f.workspace, id(211), {
        summarySourceId: null,
        bullets: [copy, copy],
      }),
    ).toThrow();
  });
  it("refuses fabricated manifest/citations and staged native capability", async () => {
    const f = await fixture(),
      bad = structuredClone(f.raw);
    bad.manifest[0].valueSha256 = "9".repeat(64);
    expect(() =>
      buildCanonicalRewriteWorkspace(bad, "unit-model", profile),
    ).toThrow();
    f.raw.readiness.mutatorsExecutable = false;
    expect(
      buildCanonicalRewriteWorkspace(f.raw, "unit-model", profile).canGenerate,
    ).toBe(false);
    expect(() =>
      buildCanonicalRewriteWorkspace(f.raw, "unit-model", {
        ...profile,
        readerSha256: "0".repeat(64),
      }),
    ).toThrow();
  });
  it("matches current saved results using OUTPUT draft identity, full owner/policy and reconstructed source", async () => {
    const f = await fixture(),
      operationId = id(212);
    const result = reconstructCanonicalRewrite(f.workspace, operationId, {
      summarySourceId: null,
      bullets: [
        {
          sourceId: 0,
          clauseId: f.clauseId,
          operation: "equivalent_action",
          replacementAction: "Created",
        },
      ],
    });
    const receipt = {
      schemaVersion: "canonical-rewrite-receipt/1.0.0",
      state: "saved_proposals",
      operationId,
      bindingSha256: f.workspace.bindingSha256,
      runId: id(213),
      draftId: f.raw.draft.id,
      draftVersionId: id(214),
      revision: 1,
      draftUpdatedAt: "2026-11-15T00:00:01.000002Z",
      resultSha256: "3".repeat(64),
      projectionSha256: "4".repeat(64),
      idempotent: false,
    };
    f.raw.draft = {
      ...f.raw.draft,
      versionId: receipt.draftVersionId,
      revision: 1,
      headId: receipt.draftVersionId,
      updatedAt: receipt.draftUpdatedAt,
      contentSha256: receipt.projectionSha256,
    };
    f.raw.saved = {
      state: "current",
      publication: { result, receipt },
      legacyDraft: null,
    };
    expect(
      buildCanonicalRewriteWorkspace(f.raw, "unit-model", profile).saved.state,
    ).toBe("current");
    for (const state of ["current", "historical"] as const) {
      const foreign = structuredClone(f.raw);
      foreign.saved.state = state;
      const publication = structuredClone({ result, receipt });
      publication.result.binding.authoring.source.ownerId = id(250);
      foreign.saved.publication = publication;
      expect(() =>
        buildCanonicalRewriteWorkspace(foreign, "unit-model", profile),
      ).toThrow();
    }
    const wrongPolicy = structuredClone(f.raw);
    const publication = structuredClone({ result, receipt });
    publication.result.binding.policy.model = "other-model";
    wrongPolicy.saved.publication = publication;
    expect(() =>
      buildCanonicalRewriteWorkspace(wrongPolicy, "unit-model", profile),
    ).toThrow();
    const request = createCanonicalRewriteRequest(f.workspace, operationId);
    expect(
      validateCanonicalRewritePublication({ result, receipt }, request, result),
    ).toEqual({ result, receipt });
    expect(() =>
      validateCanonicalRewritePublication(
        { result, receipt: { ...receipt, operationId: id(255) } },
        request,
        result,
      ),
    ).toThrow();
  });
  it("keeps historical snapshots and actual legacy projection distinct from current support", async () => {
    const f = await fixture();
    expect(f.workspace.saved).toMatchObject({
      state: "legacy_unbound",
      publication: null,
      legacyDraft: { summary: "Legacy wording remains copyable." },
    });
    const raw = structuredClone(f.raw);
    raw.saved.legacyDraft = { unexpected: "not a valid writer" };
    expect(() =>
      buildCanonicalRewriteWorkspace(raw, "unit-model", profile),
    ).toThrow();
    f.raw.relationshipContext.heads.canonicalHeadId = id(260);
    f.raw.relationshipContext.heads.canonicalHeadRevision++;
    expect(
      buildCanonicalRewriteWorkspace(f.raw, "unit-model", profile).canGenerate,
    ).toBe(false);
  });
  it("enforces legacy projection size without truncation (defensive output boundary)", async () => {
    const f = await fixture(),
      result = reconstructCanonicalRewrite(f.workspace, id(216), {
        summarySourceId: null,
        bullets: [
          {
            sourceId: 0,
            clauseId: f.clauseId,
            operation: "copy",
            replacementAction: null,
          },
        ],
      });
    result.bullets[0].before = "x".repeat(501);
    expect(() => canonicalRewriteProjection(result)).toThrow();
    expect(result.bullets[0].before).toHaveLength(501);
  });
  it("scopes the provider key to owner/analysis/native binding and retains it on retry", async () => {
    const f = await fixture(),
      key = canonicalRewriteProviderKey(f.workspace, id(217));
    expect(canonicalRewriteProviderKey(f.workspace, id(217))).toBe(key);
    const other = structuredClone(f.workspace);
    other.binding.authoring.source.ownerId = id(280);
    expect(canonicalRewriteProviderKey(other, id(217))).not.toBe(key);
    other.binding.authoring.source.ownerId = f.owned.ownerId;
    other.bindingSha256 = createHash("sha256")
      .update("other-native-binding")
      .digest("hex");
    expect(canonicalRewriteProviderKey(other, id(217))).not.toBe(key);
  });
});
