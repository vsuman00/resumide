import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { extractDocumentForReviewWithMetadata } from "../../app/lib/server/document-extraction";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import {
  loadRequirementRelationshipContext,
  REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES,
  type RequirementRelationshipContext,
} from "../../app/lib/server/requirement-relationship-context";
import {
  buildJdClauseOrderPlan,
  buildJdClauseOrderDraft,
} from "../../app/lib/server/jd-clause-order-drafting";
import { loadJdClauseOrderWorkspace } from "../../app/lib/server/jd-clause-order-repository";
import { loadScoreDiagnostics } from "../../app/lib/server/score-v2-repository";
import { createJdClauseOrderStore } from "../fixtures/jd-clause-order-store";
import { jdClauseOrderFixtureId as id } from "../fixtures/jd-clause-order";

const claim = "Built services using Python; Developed tools using Git";
const firstPage = `Experience\n${claim}`;
const nextPage = "Projects\nCreated tools using Java";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
async function extract(
  totalPages: number,
  pageTexts: string[] | undefined,
  maxPages = 20,
) {
  const text = pageTexts?.join("\n\n") ?? firstPage;
  const bytes = new TextEncoder().encode(text);
  const source = {
    ownerId: id(1),
    organizationId: id(2),
    resumeId: id(3),
    analysisId: id(4),
    sourceId: id(5),
    attemptId: id(6),
    inputSha256: sha(text),
  };
  const extractor = vi.fn().mockResolvedValue({
    totalPages,
    text,
    ...(pageTexts === undefined ? {} : { pageTexts }),
  });
  const result = await extractDocumentForReviewWithMetadata(
    {
      bytes,
      context: {
        id: source.attemptId,
        ownerId: source.ownerId,
        analysisId: source.analysisId,
        sourceId: source.sourceId,
        inputSha256: source.inputSha256,
        createdAt: "2026-11-16T00:00:00.000Z",
        retentionPolicyId: "synthetic/1.0.0",
      },
      maxBytes: 100000,
      maxPages,
      maxCharacters: 100000,
      timeoutMs: 1000,
    },
    extractor,
  );
  return { source, extractor, result };
}
/** Synthetic read-boundary inputs only. No SQL mutation, stored-count repair,
 * role/readiness simulation or PDF parser is executed by this consumer fixture. */
async function contextFor(
  produced: Awaited<ReturnType<typeof extract>>,
  readCount: number | null,
) {
  const s = produced.source,
    original = importCanonicalEvidence(produced.result.envelope, {
      ownerId: s.ownerId,
      organizationId: s.organizationId,
      resumeId: s.resumeId,
      locale: "en-IN",
    });
  const fact = original.facts.find(
    (f) => f.type === "contribution" && f.value === claim,
  );
  if (!fact) throw Error("SYNTHETIC_TARGET_UNAVAILABLE");
  const document = reviseCanonical(original, {
    operation: "confirm",
    factId: fact.id,
  });
  const requirements = createJobRequirementRelations(
    "Requirements\nGit required",
    {
      ownerId: s.ownerId,
      organizationId: s.organizationId,
      analysisId: s.analysisId,
      jobId: id(7),
      parentVersionId: null,
      locale: "en-IN",
      domain: "software-engineering",
    },
  );
  const contentSha256 = sha(JSON.stringify(document));
  const row: RequirementRelationshipContext = {
    schemaVersion: "requirement-relationship-context/1.0.0",
    status: "available",
    authority: "owned_header_relations_only",
    scoringEligible: false,
    source: s,
    sourceMetadata: { pageCount: readCount },
    attempt: {
      id: s.attemptId,
      attemptNumber: 1,
      envelope: produced.result.envelope,
    },
    canonical: {
      versionId: document.versionId,
      revision: 2,
      contentSha256,
      locale: document.locale,
      content: document,
    },
    requirements: {
      versionId: requirements.id,
      revision: 1,
      inputSha256: requirements.inputSha256,
      contentSha256: sha(JSON.stringify(requirements)),
      content: requirements,
    },
    ancestors: [
      {
        versionId: original.versionId,
        revision: 1,
        contentSha256: sha(JSON.stringify(original)),
        content: original,
      },
    ],
    heads: {
      canonicalHeadId: document.versionId,
      canonicalHeadRevision: 2,
      requirementHeadId: requirements.id,
      requirementHeadRevision: 1,
    },
    profiles: { ...REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES },
    headerSnapshot: {
      canonicalVersionId: document.versionId,
      canonicalContentSha256: contentSha256,
      snapshotFamily: "none",
      creationKind: null,
      associationPrefix: { revision: 0, headId: null },
      regroupPrefix: { revision: 0, headId: null },
      groups: [],
    },
  };
  const selection = {
    canonicalVersionId: document.versionId,
    requirementVersionId: requirements.id,
  };
  const rpc = vi.fn(async (name: string) => {
    if (name !== "read_requirement_relationship_context")
      throw Error("UNEXPECTED_RPC");
    return { data: row, error: null };
  });
  const context = await loadRequirementRelationshipContext(
    { rpc } as unknown as Parameters<
      typeof loadRequirementRelationshipContext
    >[0],
    s.analysisId,
    s.ownerId,
    selection,
  );
  return {
    context,
    targetFactId: fact.id,
    selection,
    expected: { analysisId: s.analysisId, ownerId: s.ownerId, ...selection },
  };
}
function plan(f: Awaited<ReturnType<typeof contextFor>>) {
  return buildJdClauseOrderPlan(f.context, f.expected);
}
async function refusedWorkspace(f: Awaited<ReturnType<typeof contextFor>>) {
  const rpc = vi.fn((name: string) => ({
    abortSignal: async (signal: AbortSignal) => {
      if (signal.aborted) throw Error("SYNTHETIC_CANCELLED");
      if (name !== "read_requirement_relationship_context")
        throw Error("UNEXPECTED_READINESS_OR_WRITE");
      return { data: f.context, error: null };
    },
  }));
  const value = await loadJdClauseOrderWorkspace(
    { rpc } as unknown as Parameters<typeof loadJdClauseOrderWorkspace>[0],
    f.context.source.analysisId,
    f.context.source.ownerId,
    f.selection,
    { enabled: true },
  );
  expect(value).toBeNull();
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "read_requirement_relationship_context",
  ]);
}
it.each<[number, string[]]>([
  [1, [firstPage]],
  [2, [firstPage, nextPage]],
])(
  "uses the current producer's declared %s pages in a synthetic owned consumer input",
  async (totalPages, pages) => {
    const produced = await extract(totalPages, pages);
    expect(produced.extractor).toHaveBeenCalledTimes(1);
    expect(produced.result.pageCount).toBe(totalPages);
    expect(
      produced.result.envelope.nativeSource.pages.map((p) => p.text),
    ).toEqual(pages);
    expect(produced.result.envelope).not.toHaveProperty("pageCount");
    const f = await contextFor(produced, produced.result.pageCount),
      result = plan(f);
    expect(result.state).toBe("available");
    expect(result.drafts[0].before).toBe(claim);
    expect(result.drafts[0].after).toBe(
      "Developed tools using Git; Built services using Python",
    );
    expect(f.context.sourceMetadata.pageCount).toBe(produced.result.pageCount);
    const model = await loadScoreDiagnostics(
      createJdClauseOrderStore(f.context).client,
      f.context.source.analysisId,
      f.context.source.ownerId,
      {},
      undefined,
      { clauseOrderPreview: true },
    );
    expect(model.jdClauseOrderPlan?.drafts[0]).toEqual(result.drafts[0]);
    expect(model.diagnostics.score.state).toBe("withheld");
    expect(
      model.diagnostics.score.dimensions.every((d) => d.value === null),
    ).toBe(true);
    expect(model.diagnostics.readinessAggregate).toBeNull();
  },
);
it("does not infer or repair historical NULL metadata from complete current evidence", async () => {
  const produced = await extract(1, [firstPage]),
    f = await contextFor(produced, null);
  expect(produced.result.pageCount).toBe(1);
  expect(produced.result.envelope.nativeSource.pages).toHaveLength(1);
  expect(plan(f)).toMatchObject({
    state: "unavailable",
    reason: "unsupported_context",
    drafts: [],
    inspectedPairCount: 0,
  });
  await refusedWorkspace(f);
  const model = await loadScoreDiagnostics(
    createJdClauseOrderStore(f.context).client,
    f.context.source.analysisId,
    f.context.source.ownerId,
    {},
    undefined,
    { clauseOrderPreview: true },
  );
  expect(model.jdClauseOrderPlan?.state).toBe("unavailable");
  expect(model.diagnostics.readiness.blockers).toContain(
    "critical_evidence_missing",
  );
  expect(
    model.diagnostics.score.dimensions.every((d) => d.value === null),
  ).toBe(true);
  expect(f.context.sourceMetadata.pageCount).toBeNull();
});
it.each<[number, number, string[]]>([
  [2, 1, [firstPage]],
  [1, 2, [firstPage, nextPage]],
])(
  "refuses reader metadata %s when declared extraction coverage differs",
  async (readCount, declaredTotal, pages) => {
    const produced = await extract(declaredTotal, pages),
      f = await contextFor(produced, readCount);
    expect(readCount).not.toBe(produced.result.pageCount);
    expect(plan(f)).toMatchObject({
      state: "unavailable",
      reason: "unsupported_context",
      drafts: [],
    });
    expect(() =>
      buildJdClauseOrderDraft(
        f.context,
        {
          analysisId: f.context.source.analysisId,
          ownerId: f.context.source.ownerId,
        },
        {
          ...f.selection,
          clauseId: f.context.requirements.content.relations.clauses[0].id,
          targetFactId: f.targetFactId,
        },
      ),
    ).toThrow(
      expect.objectContaining({ reason: "incomplete_source_coverage" }),
    );
    await refusedWorkspace(f);
    expect(f.context.sourceMetadata.pageCount).toBe(readCount);
  },
);
it("retains declared blank pages and refuses OCR-unsafe source despite a known count", async () => {
  const produced = await extract(2, [firstPage, ""]);
  expect(produced.result.pageCount).toBe(2);
  expect(
    produced.result.envelope.nativeSource.pages.map((p) => p.text),
  ).toEqual([firstPage, ""]);
  expect(produced.result.envelope.ocrFailure).toMatchObject({
    code: "unsupported",
  });
  expect(produced.result.envelope.scoringEligible).toBe(false);
  const f = await contextFor(produced, produced.result.pageCount);
  expect(plan(f)).toMatchObject({
    state: "unavailable",
    reason: "unsupported_context",
    drafts: [],
  });
  await refusedWorkspace(f);
});
it("retains the supported one-page aggregate extraction fallback without claiming multipage coverage", async () => {
  const produced = await extract(1, undefined),
    f = await contextFor(produced, produced.result.pageCount);
  expect(produced.extractor).toHaveBeenCalledTimes(1);
  expect(produced.result.pageCount).toBe(1);
  expect(plan(f).state).toBe("available");
  await expect(extract(2, undefined)).rejects.toMatchObject({
    code: "INVALID_PDF",
  });
});
it.each<[number, string[]]>([
  [2, [firstPage]],
  [1, [firstPage, nextPage]],
  [0, []],
  [1.5, [firstPage]],
])(
  "does not replace invalid declared total %s with materialized-page length",
  async (totalPages, pages) => {
    await expect(extract(totalPages, pages)).rejects.toMatchObject({
      code: "INVALID_PDF",
    });
  },
);
it("preserves the configured declared-page limit even when an extractor ignores it", async () => {
  await expect(extract(2, [firstPage, nextPage], 1)).rejects.toMatchObject({
    code: "PAGE_LIMIT",
  });
});
