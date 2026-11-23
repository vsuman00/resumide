import { hashAiBudgetBinding } from "../../app/lib/server/ai-budget";
import { AI_BUDGET_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";
import { createSourceBoundAiBudgetOperationId } from "../../app/lib/server/ai-budget-source";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  buildTypedAuthoringWorkspace,
} from "../../app/lib/server/typed-authoring-protocol";
import {
  buildCanonicalRewriteWorkspace,
  reconstructCanonicalRewrite,
  validateCanonicalRewritePublication,
  type CanonicalRewriteRequest,
} from "../../app/lib/server/canonical-rewrite-contract";
import { CANONICAL_REWRITE_READINESS_PROFILE } from "../../app/lib/server/canonical-rewrite-readiness-profile";
import type { OwnedAiUsage } from "../../app/lib/server/owned-ai-usage";
import { INITIAL_FEEDBACK_PROFILE } from "../../app/lib/server/initial-feedback-profile";
const mocks = vi.hoisted(() => ({
  flags: {
    APP_ORIGIN: "https://example.test",
    CANONICAL_REWRITE_ENABLED: true,
    AUTHORING_ENABLED: true,
    SCORING_V2_ENABLED: true,
    AI_ENABLED: true,
    AI_BUDGET_ENABLED: true,
    AI_BUDGET_POLICY_VERSION: "synthetic-budget/1",
    OPENAI_MODEL: "fixture-model",
    OPENAI_TIMEOUT_MS: 1000,
    OPENAI_MAX_OUTPUT_TOKENS: 1000,
    AI_MONTHLY_TOKEN_LIMIT: 1000000,
  },
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  transport: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => mocks.flags,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/canonical-rewrite-ai", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-rewrite-ai")
  >()),
  createCanonicalRewriteTransport: mocks.transport,
}));
import { action, loader } from "../../app/routes/analysis.rewrite";
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(declared = false) {
  const f = await createRequirementContextFixture({
    confirm: true,
    ...(declared ? { edit: "Built database services using PostgreSQL" } : {}),
  });
  const authoring = buildTypedAuthoringWorkspace(f.context);
  const patch = buildTypedAuthoringPatch(
    f.context,
    {
      canonicalVersionId: authoring.binding.canonical.versionId,
      requirementVersionId: authoring.binding.requirements.versionId,
      clauseId: authoring.clauses[0].clauseId,
      targetFactId: f.targetFactId,
    },
    "Created",
  );
  const fact = f.context.canonical.content.facts.find(
    (item) => item.id === f.targetFactId,
  );
  if (!fact?.confirmation) throw Error("EXPECTED_ACTUAL_CONFIRMED_FACT");
  const row = {
    schemaVersion: "canonical-rewrite-context/1.0.0",
    status: "available",
    relationshipContext: f.context,
    draft: {
      id: id(1),
      updatedAt: "2026-11-14T00:00:00.123456Z",
      contentSha256: "d".repeat(64),
      versionId: null,
      revision: 0,
      headId: null,
    },
    bindingSha256: "e".repeat(64),
    manifest: [
      {
        sourceId: 0,
        factId: f.targetFactId,
        valueSha256: patch.target.currentValueSha256,
        location: {
          sectionId: patch.target.sectionId,
          entryId: patch.target.entryId,
          bulletId: patch.target.bulletId,
        },
        confirmation: fact.confirmation,
        basis: patch.support.basis,
        currentCitations: patch.sourceCitations,
        clauseIds: [patch.selection.clauseId],
        authoringVersion: patch.policies.authoringVersion,
      },
    ],
    saved: {
      state: "legacy_unbound",
      publication: null,
      legacyDraft: {
        summary: "Retained earlier summary",
        bullets: [
          {
            original: "Retained earlier claim",
            rewrite: "Retained earlier wording",
            reasoning: "Review this saved wording.",
          },
        ],
      },
    },
    readiness: {
      ...CANONICAL_REWRITE_READINESS_PROFILE,
      schemaReady: true,
      mutatorsExecutable: true,
    },
  };
  const workspace = buildCanonicalRewriteWorkspace(
    row,
    "fixture-model",
    CANONICAL_REWRITE_READINESS_PROFILE,
  );
  const publication = (request: CanonicalRewriteRequest, copy = false) => {
    const result = reconstructCanonicalRewrite(workspace, request.operationId, {
      summarySourceId: null,
      bullets: [
        {
          sourceId: 0,
          clauseId: workspace.clauses[0].clauseId,
          operation: copy ? "copy" : "equivalent_action",
          replacementAction: copy ? null : "Created",
        },
      ],
    });
    return validateCanonicalRewritePublication(
      {
        result,
        receipt: {
          schemaVersion: "canonical-rewrite-receipt/1.0.0",
          state: "saved_proposals",
          operationId: request.operationId,
          bindingSha256: workspace.bindingSha256,
          runId: id(2),
          draftId: workspace.binding.draft.id,
          draftVersionId: id(3),
          revision: 1,
          draftUpdatedAt: "2026-11-14T00:01:00.654321Z",
          resultSha256: "f".repeat(64),
          projectionSha256: "a".repeat(64),
          idempotent: false,
        },
      },
      request,
      result,
    );
  };
  return { ...f, workspace, row, publication };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.flags, {
    CANONICAL_REWRITE_ENABLED: true,
    AUTHORING_ENABLED: true,
    SCORING_V2_ENABLED: true,
    AI_ENABLED: true,
    AI_BUDGET_ENABLED: true,
    AI_BUDGET_POLICY_VERSION: "synthetic-budget/1",
  });
  mocks.server.mockReturnValue({});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("UNEXPECTED_NETWORK");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
async function setup(declared = false) {
  const f = await fixture(declared);
  const selected: CanonicalRewriteRequest = {
    schemaVersion: "canonical-rewrite-request/1.0.0",
    operationId: id(10),
    canonicalVersionId: f.workspace.binding.authoring.canonical.versionId,
    requirementVersionId: f.workspace.binding.authoring.requirements.versionId,
    draftId: f.workspace.binding.draft.id,
    expectedDraftUpdatedAt: f.workspace.binding.draft.updatedAt,
  };
  let saved: ReturnType<typeof f.publication> | null = null,
    state = "reserved",
    command: unknown = null,
    stale = false,
    owned = true;
  const plan = {
    summarySourceId: null,
    bullets: [
      {
        sourceId: 0,
        clauseId: f.workspace.clauses[0].clauseId,
        operation: "equivalent_action",
        replacementAction: "Created",
      },
    ],
  };
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  // Synthetic native counter metadata, decoded by the actual owned usage helper.
  let usage: OwnedAiUsage = {
    schemaVersion: "initial-feedback-usage/1.0.0",
    profileVersion: INITIAL_FEEDBACK_PROFILE.profileVersion,
    usageSha256: INITIAL_FEEDBACK_PROFILE.usageSha256,
    ownerId: f.owned.ownerId,
    organizationId: f.owned.organizationId,
    analysisId: f.owned.analysisId,
    periodStart: monthStart.toISOString().slice(0, 10),
    periodEnd: monthEnd.toISOString().slice(0, 10),
    legacyUnlinkedTokens: "0",
    canonicalTokens: "0",
    initialFeedbackTokens: "0",
    totalTokens: "0",
    unknownClaims: "0",
  };
  const execute = vi.fn(async () => ({
    output: plan,
    usage: { inputTokens: 25, outputTokens: 10 },
  }));
  mocks.transport.mockReturnValue({ execute });
  const writes: { table: string; value: unknown }[] = [];
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      limit: () => query,
      maybeSingle: async () => ({
        data:
          table === "memberships"
            ? { organization_id: f.owned.organizationId }
            : null,
        error: null,
      }),
      upsert: async (value: unknown) => {
        writes.push({ table, value });
        return { error: null };
      },
      insert: async (value: unknown) => {
        writes.push({ table, value });
        return { error: null };
      },
    };
    return query;
  });
  const operation = (request: CanonicalRewriteRequest) => ({
    schemaVersion: "canonical-rewrite-operation/1.0.0",
    operationId: request.operationId,
    ownerId: f.owned.ownerId,
    analysisId: f.owned.analysisId,
    request,
    policy: f.workspace.binding.policy,
    bindingSha256: f.workspace.bindingSha256,
    state,
    dispatchAllowed: false,
    publication: saved,
  });
  const rpc = vi.fn(
    async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: null }> => {
      const ok = (data: unknown) => ({ data, error: null });
      if (name === "read_ai_budget_source_readiness")
        return ok({
          ...AI_BUDGET_SOURCE_PROFILE,
          schemaReady: true,
          reserveExecutable: true,
          exportExecutable: false,
        });
      if (
        name === "ai_budget_reserve_next" ||
        name === "ai_budget_claim_dispatch"
      )
        throw Error("GENERIC_BUDGET_BYPASS_FORBIDDEN");
      if (
        [
          "ai_budget_reserve_source_next",
          "ai_budget_settle",
          "ai_budget_mark_unknown",
          "ai_budget_release",
        ].includes(name)
      ) {
        const source = {
          schemaVersion: "ai-budget-source/2.0.0" as const,
          kind: "canonical_rewrite" as const,
          analysisId: f.owned.analysisId,
          resumeVersionId: f.owned.sourceId,
          operationId: selected.operationId,
          bindingSha256: f.workspace.bindingSha256,
        };
        expect(args).toMatchObject({
          p_user_id: f.owned.ownerId,
          p_organization_id: f.owned.organizationId,
          p_request: {
            operationId: createSourceBoundAiBudgetOperationId({
              userId: f.owned.ownerId,
              organizationId: f.owned.organizationId,
              source,
            }),
            surface: "rewrite",
            payloadSha256: f.workspace.bindingSha256,
          },
        });
        if (name === "ai_budget_reserve_source_next")
          expect(args.p_source).toEqual(source);
        return admittedBudgetReply(name, args);
      }

      if (name === "prepare_canonical_rewrite") {
        if (!owned) return ok({ status: "not_found" });
        if (
          command !== null &&
          JSON.stringify(command) !== JSON.stringify(args.p_command)
        )
          return ok({ status: "conflict" });
        command = args.p_command;
        return ok({
          status: "prepared",
          operation: operation(selected),
          context: saved ? null : f.row,
        });
      }
      if (name === "consume_analysis_rate_limit") return ok(true);
      if (name === "read_initial_feedback_usage") return ok(usage);
      if (name === "claim_canonical_rewrite_dispatch") {
        state = "dispatched";
        return ok({
          operation: { ...operation(selected), dispatchAllowed: true },
          budget: admittedBudgetReply(
            "ai_budget_claim_dispatch",
            args.p_budget as Record<string, unknown>,
          ).data,
        });
      }
      if (name === "settle_canonical_rewrite_attempt")
        return ok({
          schemaVersion: "canonical-rewrite-settlement/1.0.0",
          operationId: selected.operationId,
          bindingSha256: f.workspace.bindingSha256,
          usage: args.p_usage,
          state,
        });
      if (name === "read_canonical_rewrite_context")
        return ok(
          stale
            ? {
                ...f.row,
                draft: {
                  ...f.row.draft,
                  updatedAt: "2026-11-14T00:00:10.123456Z",
                },
              }
            : f.row,
        );
      if (name === "finish_canonical_rewrite") {
        saved = f.publication(selected);
        state = "saved";
        return ok(saved);
      }
      throw Error("UNEXPECTED_RPC");
    },
  );
  mocks.user.mockResolvedValue({ id: f.owned.ownerId });
  mocks.admin.mockReturnValue({ from, rpc });
  const request = (
    value: unknown = selected,
    extra?: { origin?: string; consent?: string; multipart?: boolean },
  ) => {
    const body = extra?.multipart ? new FormData() : new URLSearchParams();
    body.set("request", JSON.stringify(value));
    body.set("aiConsent", extra?.consent ?? "accepted");
    return new Request(
      `https://example.test/analysis/${f.owned.analysisId}/rewrite`,
      {
        method: "POST",
        headers: { Origin: extra?.origin ?? "https://example.test" },
        body,
      },
    );
  };
  const run = (req = request()) =>
    action({ request: req, params: { id: f.owned.analysisId } });
  return {
    ...f,
    selected,
    plan,
    execute,
    from,
    rpc,
    writes,
    request,
    run,
    setStale: () => {
      stale = true;
    },
    setOwned: (next: boolean) => {
      owned = next;
    },
    getSaved: () => saved,
    setUsage: (next: Partial<OwnedAiUsage>) => {
      usage = { ...usage, ...next };
    },
    setState: (next: string) => {
      state = next;
    },
  };
}
it.each([false, true])(
  "runs the actual authenticated resource and producer with declaration=%s, then exact replay dispatches once",
  async (declared) => {
    const f = await setup(declared);
    const first = await f.run(f.request(f.selected, { multipart: true }));
    expect(first.status).toBe(200);
    const saved = await first.json();
    expect(saved).toEqual({ kind: "saved", publication: f.getSaved() });
    expect(saved.publication.result.bullets[0].source.basis).toBe(
      declared ? "candidate_declaration" : "source_quote",
    );
    expect(saved.publication.result.bullets[0].after).toBe(
      f.workspace.sources[0].value.replace(/^Built/u, "Created"),
    );
    expect(f.execute).toHaveBeenCalledTimes(1);
    const firstCalls = f.rpc.mock.calls.length;
    // A fresh request would now fail quota/unknown-spend admission. Exact replay
    // must return the original receipt before consulting that changed counter.
    f.setUsage({
      canonicalTokens: "1000000",
      totalTokens: "1000000",
      unknownClaims: "1",
    });
    const replay = await f.run();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(saved);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.slice(firstCalls).map(([name]) => name)).toEqual([
      "prepare_canonical_rewrite",
    ]);
    expect(f.rpc.mock.calls[0][1]).toMatchObject({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: { request: f.selected },
      p_request_id: f.selected.operationId,
    });
    const names = f.rpc.mock.calls.map(([name]) => name);
    expect(
      names.filter((name) => name === "read_initial_feedback_usage"),
    ).toHaveLength(1);
    expect(names).not.toContain("get_organization_ai_tokens_used");
    expect(names).toContain("ai_budget_reserve_source_next");
    expect(names).not.toContain("ai_budget_reserve_next");
    expect(names).not.toContain("ai_budget_claim_dispatch");
    expect(names.indexOf("ai_budget_settle")).toBeLessThan(
      names.indexOf("settle_canonical_rewrite_attempt"),
    );
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "read_initial_feedback_usage",
      )?.[1],
    ).toEqual({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
    });
    expect(names.indexOf("read_initial_feedback_usage")).toBeGreaterThan(
      names.indexOf("prepare_canonical_rewrite"),
    );
    expect(names.indexOf("read_initial_feedback_usage")).toBeLessThan(
      names.indexOf("claim_canonical_rewrite_dispatch"),
    );
    expect(names.indexOf("settle_canonical_rewrite_attempt")).toBeLessThan(
      names.indexOf("finish_canonical_rewrite"),
    );
    expect(f.writes.some((w) => w.table === "consents")).toBe(true);
    expect(
      f.writes.some(
        (w) => w.table === "writer_drafts" || w.table === "analysis_ai_runs",
      ),
    ).toBe(false);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(first.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("refuses final draft movement after dispatch while preserving previous drafts and technical usage", async () => {
  const f = await setup();
  f.setStale();
  const response = await f.run();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    kind: "error",
    reason: "stale_inputs",
    recovery: "review_again",
  });
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.getSaved()).toBeNull();
  expect(f.workspace.saved.legacyDraft?.summary).toBe(
    "Retained earlier summary",
  );
  expect(
    f.rpc.mock.calls.some(([name]) => name === "finish_canonical_rewrite"),
  ).toBe(false);
  expect(
    f.rpc.mock.calls.find(
      ([name]) => name === "settle_canonical_rewrite_attempt",
    )?.[1],
  ).toMatchObject({ p_usage: { inputTokens: "25", outputTokens: "10" } });
});
it("refuses a changed request under an existing operation identity without redispatch", async () => {
  const f = await setup();
  expect((await f.run()).status).toBe(200);
  const response = await f.run(
    f.request({
      ...f.selected,
      expectedDraftUpdatedAt: "2026-11-14T00:00:01.123456Z",
    }),
  );
  expect(response.status).toBe(409);
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it.each(["reserved", "dispatched", "unknown"])(
  "does not redispatch a retained %s operation",
  async (state) => {
    const f = await setup();
    f.setState(state);
    // A reserved operation denied a second claim must also remain manual/pending.
    if (state === "reserved")
      f.rpc.mockImplementationOnce(async () => ({
        data: {
          status: "prepared",
          operation: {
            schemaVersion: "canonical-rewrite-operation/1.0.0",
            operationId: f.selected.operationId,
            ownerId: f.owned.ownerId,
            analysisId: f.owned.analysisId,
            request: f.selected,
            policy: f.workspace.binding.policy,
            bindingSha256: f.workspace.bindingSha256,
            state,
            dispatchAllowed: false,
            publication: null,
          },
          context: null,
        },
        error: null,
      }));
    const response = await f.run();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "pending",
      operationId: f.selected.operationId,
      state,
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(mocks.transport).not.toHaveBeenCalled();
  },
);
it("keeps fixed errors and prevents reads for malformed consent, duplicate fields and foreign ownership", async () => {
  const f = await setup();
  let response = await f.run(f.request(f.selected, { consent: "no" }));
  expect(response.status).toBe(403);
  expect(f.rpc).not.toHaveBeenCalled();
  const body = new URLSearchParams({
    request: JSON.stringify(f.selected),
    aiConsent: "accepted",
  });
  body.append("request", JSON.stringify(f.selected));
  response = await f.run(
    new Request(f.request().url, {
      method: "POST",
      headers: { Origin: "https://example.test" },
      body,
    }),
  );
  expect(response.status).toBe(422);
  expect(f.rpc).not.toHaveBeenCalled();
  f.setOwned(false);
  response = await f.run();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    kind: "error",
    reason: "not_found",
    recovery: "unavailable",
  });
  expect(f.execute).not.toHaveBeenCalled();
});
it("preserves method, flag, origin and authentication guards before private dispatch", async () => {
  const f = await setup();
  expect(
    (
      await loader({
        request: new Request(f.request().url),
        params: { id: f.owned.analysisId },
      })
    ).status,
  ).toBe(405);
  mocks.flags.CANONICAL_REWRITE_ENABLED = false;
  expect((await f.run()).status).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.flags.CANONICAL_REWRITE_ENABLED = true;
  expect(
    (await f.run(f.request(f.selected, { origin: "https://foreign.test" })))
      .status,
  ).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce(null);
  expect((await f.run()).status).toBe(401);
  expect(f.rpc).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
});

it.each(["known canonical spend", "unknown canonical claim"] as const)(
  "refuses %s through the actual resource before provider dispatch",
  async (kind) => {
    const f = await setup();
    f.setUsage(
      kind === "known canonical spend"
        ? { canonicalTokens: "1000000", totalTokens: "1000000" }
        : { unknownClaims: "1" },
    );
    const response = await f.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "review_again",
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(mocks.transport).not.toHaveBeenCalled();
    const names = f.rpc.mock.calls.map(([name]) => name);
    expect(
      names.filter((name) => name === "read_initial_feedback_usage"),
    ).toHaveLength(1);
    expect(names).not.toContain("get_organization_ai_tokens_used");
    expect(names).not.toContain("claim_canonical_rewrite_dispatch");
    expect(names).not.toContain("finish_canonical_rewrite");
    expect(f.getSaved()).toBeNull();
    expect(f.workspace.saved.legacyDraft?.summary).toBe(
      "Retained earlier summary",
    );
  },
);

function admittedBudgetReply(name: string, args: Record<string, unknown>) {
  const p = args.p_request as Record<string, unknown>;
  const binding = {
    userId: String(args.p_user_id),
    organizationId: String(args.p_organization_id),
    operationId: String(p.operationId),
    attemptId: String(p.attemptId),
    attemptOrdinal: Number(p.attemptOrdinal ?? 1),
    surface: p.surface as "qualitative" | "rewrite" | "build",
    payloadSha256: String(p.payloadSha256),
    model: String(p.model),
    promptPolicyVersion: String(p.promptPolicyVersion),
    policyVersion: String(p.policyVersion),
    reservedInputTokens: Number(p.reservedInputTokens),
    reservedOutputTokens: Number(p.reservedOutputTokens),
  };
  const usage = p.usage as
    { inputTokens: string; outputTokens: string } | undefined;
  const state =
    name === "ai_budget_claim_dispatch"
      ? "dispatched"
      : name === "ai_budget_settle"
        ? "settled"
        : name === "ai_budget_mark_unknown"
          ? "held_unknown"
          : name === "ai_budget_release"
            ? "released"
            : "reserved";
  return {
    data: {
      schemaVersion: "ai-budget/1.0.0",
      status: "ok",
      receipt: {
        schemaVersion: "ai-budget/1.0.0",
        ...binding,
        reservedInputTokens: String(binding.reservedInputTokens),
        reservedOutputTokens: String(binding.reservedOutputTokens),
        bindingSha256: hashAiBudgetBinding(binding),
        period: "2026-11-01",
        state,
        reservedCostMicrousd: String(
          binding.reservedInputTokens + binding.reservedOutputTokens,
        ),
        actualInputTokens: state === "settled" ? usage!.inputTokens : null,
        actualOutputTokens: state === "settled" ? usage!.outputTokens : null,
        actualCostMicrousd:
          state === "settled"
            ? String(BigInt(usage!.inputTokens) + BigInt(usage!.outputTokens))
            : null,
        replayed: false,
        dispatchAllowed: state === "dispatched",
        poolBlocked: false,
        poolPolicyVersion: "synthetic-pool/1",
        attemptLimit: 3,
        inputMicrousdPerMillion: "1000000",
        outputMicrousdPerMillion: "1000000",
      },
    },
    error: null,
  };
}
