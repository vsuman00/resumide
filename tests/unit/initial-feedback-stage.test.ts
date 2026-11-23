import { AI_BUDGET_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";
const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  config: {
    INITIAL_FEEDBACK_ENABLED: true,
    LEGACY_SCORING_INPUT_ENABLED: true,
    ANALYSIS_FENCING_ENABLED: true,
    AI_ENABLED: true,
    AI_BUDGET_ENABLED: false,
    AI_BUDGET_POLICY_VERSION: "",
    AI_MONTHLY_TOKEN_LIMIT: 1000000,
    OPENAI_API_KEY: "offline-no-live-key",
    OPENAI_MODEL: "unit-model",
    OPENAI_MAX_OUTPUT_TOKENS: 1200,
    OPENAI_TIMEOUT_MS: 1000,
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    QUALITATIVE_MAX_ATTEMPTS: 3,
  },
}));
vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: () => mocks.config,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => mocks.admin,
}));
import { processQualitativeStage } from "../../app/lib/server/qualitative-stage";
import { runWorkerCycle } from "../../app/lib/server/worker-runner";
import * as observability from "../../app/lib/server/observability";
import { AI_CONSENT_POLICY_VERSION } from "../../app/lib/server/privacy";
import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";
import { createInitialFeedbackPublicationPolicy } from "../../app/lib/server/initial-feedback-publication-policy";

import { INITIAL_FEEDBACK_OPERATION_PROFILE } from "../../app/lib/server/initial-feedback-operation-profile";
import {
  InitialFeedbackPrepareSchema,
  InitialFeedbackPublicationSchema,
  initialFeedbackPartialFeedback,
  type InitialFeedbackCompletion,
} from "../../app/lib/server/initial-feedback-operation-contract";
import { renderInitialFeedbackPlan } from "../../app/lib/server/initial-feedback-plan";
import {
  BASELINE_SEMANTICS,
  legacyCategoryFromProse,
  ProseGenerationSchema,
} from "../../app/lib/server/qualitative-prose";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
import { INITIAL_FEEDBACK_PROFILE } from "../../app/lib/server/initial-feedback-profile";
const SYNTHETIC_RPC_PROFILE = INITIAL_FEEDBACK_PROFILE;
const ready = () => ({
  ...SYNTHETIC_RPC_PROFILE,
  schemaReady: true,
  readerExecutable: true,
  prepareExecutable: true,
  claimExecutable: true,
  settleExecutable: true,
  finishExecutable: true,
  usageExecutable: true,
  exportExecutable: true,
});
function fixture(budgetOn = false) {
  const text = "Built services using Python";
  const policy = createInitialFeedbackPublicationPolicy({
    model: "unit-model",
    maxOutputTokens: 1200,
    attemptLimit: 3,
    budgetPolicyVersion: budgetOn ? "unit-budget/1" : null,
  });
  // Real scorer/checksum and strict context validation. UUIDs and Native JSONB
  // digests are synthetic opaque RPC metadata, never JS emulation/native proof.
  const result = scoreExtractedResume({
    text,
    pageCount: 1,
    pageTexts: [text],
    textChecksum: sha(text),
    jobDescription: "Python required",
  });
  const context = {
    scoringContext: {
      schemaVersion: "legacy-scoring-input/1.0.0",
      analysisId: uuid(1),
      ownerId: uuid(2),
      organizationId: uuid(3),
      requestId: null,
      source: {
        resumeId: uuid(4),
        resumeVersionId: uuid(5),
        fileChecksum: "a".repeat(64),
        bytes: 1000,
        mediaType: "application/pdf",
      },
      extraction: {
        text,
        pageCount: 1,
        pageTexts: [text],
        textChecksum: sha(text),
        extractorVersion: "unpdf-v1",
        contentSha256: "b".repeat(64),
      },
      job: {
        kind: "owned_job",
        id: uuid(6),
        title: "Unit role",
        description: "Python required",
        companyName: "",
        contentSha256: "c".repeat(64),
      },
      producer: {
        parserVersion: "parse-sim-v1",
        rulesetVersion: "ats-rules-v4",
        normalizerVersion: "normalizer-v1",
        taxonomyVersion: "skills-taxonomy-v1",
      },
      binding: {
        schemaVersion: "legacy-scoring-binding/1.0.0",
        analysisId: uuid(1),
        ownerId: uuid(2),
        organizationId: uuid(3),
        resumeId: uuid(4),
        resumeVersionId: uuid(5),
        fileChecksum: "a".repeat(64),
        textChecksum: sha(text),
        extractionSha256: "b".repeat(64),
        jobId: uuid(6),
        jobSha256: "c".repeat(64),
        inputBindingSha256: "d".repeat(64),
      },
    },
    deterministicResult: result,
    currentness: "current",
    generationEligibility: "eligible",
  };
  const attempt = {
    attemptId: uuid(8),
    ordinal: 1,
    state: "reserved",
    claimedAt: null,
    usage: null,
    errorCode: null,
    budgetAttemptId: null,
  };
  const operation = {
    schemaVersion: "initial-feedback-operation/1.0.0",
    operationId: uuid(7),
    analysisId: uuid(1),
    ownerId: uuid(2),
    organizationId: uuid(3),
    binding: {
      schemaVersion: "initial-feedback-binding/1.0.0",
      analysisId: uuid(1),
      ownerId: uuid(2),
      organizationId: uuid(3),
      resumeId: uuid(4),
      resumeVersionId: uuid(5),
      scoringInputSha256: "d".repeat(64),
      deterministicContentSha256: "e".repeat(64),
      resultChecksum: result.resultChecksum,
      sourceTextSha256: sha(text),
      jobId: uuid(6),
      jobSha256: "c".repeat(64),
      policy,
    },
    bindingSha256: "f".repeat(64),
    state: "open",
    attemptLimit: 3,
    attempts: [attempt],
    publicationId: null,
  };
  const prepared = InitialFeedbackPrepareSchema.parse({
    schemaVersion: "initial-feedback-prepare/1.0.0",
    status: "prepared",
    operation,
    attempt,
    context,
    dispatchAllowed: false,
    replayed: false,
  });
  const scope = {
    ownerId: uuid(2),
    organizationId: uuid(3),
    analysisId: uuid(1),
    lease: { workerId: "unit-worker", attempt: 2, leaseFence: uuid(10) },
    policy,
  };
  return { prepared, scope };
}

function producePublication(
  f: ReturnType<typeof fixture>,
  completion: InitialFeedbackCompletion,
  attemptId: string | null,
) {
  // Synthetic RPC metadata only. Real compiler/render/scorer own all content,
  // support, original-index mappings and deterministic checksums. Not Native proof.
  const d = f.prepared.context!.deterministicResult,
    b = f.prepared.operation.binding;
  const render =
    completion.kind === "assessed"
      ? renderInitialFeedbackPlan(
          f.prepared.context!.scoringContext.extraction.text,
          completion.plan,
        )
      : null;
  return InitialFeedbackPublicationSchema.parse({
    schemaVersion: "initial-feedback-publication/1.0.0",
    publicationId: uuid(90),
    state: completion.kind === "assessed" ? "assessed" : "deterministic_only",
    reason: completion.kind === "assessed" ? null : completion.reason,
    binding: b,
    plan: completion.plan,
    recordedObservation: completion.observation,
    generationFailure: completion.generationFailure,
    ownedSupport: render
      ? {
          schemaVersion: "initial-feedback-native-support/1.0.0",
          scope: "retained_output_only",
          bindingSha256: f.prepared.operation.bindingSha256,
          planSha256: "1".repeat(64),
          parts: render.parts,
          mapping: render.mapping,
        }
      : null,
    prose: render?.prose ?? null,
    compatibility: {
      deterministicResult: d,
      feedback: render
        ? {
            scoreSemantics: BASELINE_SEMANTICS,
            overallScore: d.score,
            ATS: {
              score: d.score,
              tips: d.ruleTrace.slice(0, 4).map((r) => ({
                type: r.passed ? "good" : "improve",
                tip: r.detail,
              })),
            },
            toneAndStyle: legacyCategoryFromProse(render.prose.toneAndStyle),
            content: legacyCategoryFromProse(render.prose.content),
            structure: legacyCategoryFromProse(render.prose.structure),
            skills: legacyCategoryFromProse(render.prose.skills),
          }
        : initialFeedbackPartialFeedback(d),
      writer: render?.prose.writer ?? null,
    },
    receipt: {
      schemaVersion: "initial-feedback-receipt/1.0.0",
      operationId: f.prepared.operation.operationId,
      attemptId,
      publicationId: uuid(90),
      analysisId: b.analysisId,
      ownerId: b.ownerId,
      bindingSha256: f.prepared.operation.bindingSha256,
      publicationSha256: "2".repeat(64),
      resultSha256: "3".repeat(64),
      writerSha256: render ? "4".repeat(64) : null,
      runId: render ? uuid(91) : null,
      createdAt: "2026-11-15T00:00:00.123456Z",
      replayed: false,
    },
  });
}
const noAi: InitialFeedbackCompletion = {
  kind: "deterministic_only",
  reason: "ai_disabled",
  plan: null,
  observation: null,
  generationFailure: null,
};
import {
  calculateAiBudgetCost,
  hashAiBudgetBinding,
} from "../../app/lib/server/ai-budget";
import type { InitialFeedbackOperationClient } from "../../app/lib/server/initial-feedback-operation-repository";
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(Error("Offline-only test"))),
  ),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const generation = () =>
  ProseGenerationSchema.parse({
    toneAndStyle: {
      tips: [
        {
          type: "good",
          tip: "Created services using Python",
          explanation: "Clarifies wording.",
          quote: "Built services using Python",
        },
      ],
    },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: { summary: null, bullets: [] },
  });
function harness(budgetOn = true) {
  const f = fixture(budgetOn),
    op = structuredClone(f.prepared.operation),
    events: string[] = [];
  const state: {
    settlementUnavailable: boolean;
    publication: ReturnType<typeof producePublication> | null;
    readPending: boolean;
    claimFalse: boolean;
    claimError: string | null;
    finishLost: boolean;
    finishCount: number;
    tokens: string;
    unknown: string;
    outputTokens: number;
    content: string | null;
    refused: boolean;
    fetchError: boolean;
    generation: ReturnType<typeof generation>;
    budgetRequest: Record<string, unknown> | null;
    budgetUsage: { inputTokens: string; outputTokens: string } | null;
  } = {
    settlementUnavailable: false,
    publication: null,
    readPending: false,
    claimFalse: false,
    claimError: null,
    finishLost: false,
    finishCount: 0,
    tokens: "0",
    unknown: "0",
    outputTokens: 7,
    content: null,
    refused: false,
    fetchError: false,
    generation: generation(),
    budgetRequest: null,
    budgetUsage: null,
  };
  const fullReady = ready();
  function budgetReceipt(
    request: Record<string, unknown>,
    status: string,
    dispatchAllowed = false,
  ) {
    const input = {
      userId: f.scope.ownerId,
      organizationId: f.scope.organizationId,
      operationId: String(request.operationId),
      attemptId: String(request.attemptId),
      attemptOrdinal: Number(request.attemptOrdinal ?? 1),
      surface: "qualitative" as const,
      payloadSha256: String(request.payloadSha256),
      model: String(request.model),
      promptPolicyVersion: String(request.promptPolicyVersion),
      policyVersion: String(request.policyVersion),
      reservedInputTokens: Number(request.reservedInputTokens),
      reservedOutputTokens: Number(request.reservedOutputTokens),
    };
    const cost = (a: number, b: number) =>
      calculateAiBudgetCost({
        inputTokens: a,
        outputTokens: b,
        inputMicrousdPerMillion: "1",
        outputMicrousdPerMillion: "1",
      });
    return {
      schemaVersion: "ai-budget/1.0.0",
      status: "ok",
      receipt: {
        schemaVersion: "ai-budget/1.0.0",
        ...input,
        reservedInputTokens: String(input.reservedInputTokens),
        reservedOutputTokens: String(input.reservedOutputTokens),
        bindingSha256: hashAiBudgetBinding(input),
        poolPolicyVersion: "unit-pool/1",
        attemptLimit: 3,
        period: "2026-11-01",
        state: status,
        inputMicrousdPerMillion: "1",
        outputMicrousdPerMillion: "1",
        reservedCostMicrousd: cost(
          input.reservedInputTokens,
          input.reservedOutputTokens,
        ),
        actualInputTokens:
          status === "settled" ? state.budgetUsage?.inputTokens : null,
        actualOutputTokens:
          status === "settled" ? state.budgetUsage?.outputTokens : null,
        actualCostMicrousd:
          status === "settled"
            ? cost(
                Number(state.budgetUsage?.inputTokens),
                Number(state.budgetUsage?.outputTokens),
              )
            : null,
        replayed: false,
        dispatchAllowed,
        poolBlocked:
          status === "settled" &&
          Number(state.budgetUsage?.outputTokens) > input.reservedOutputTokens,
      },
    };
  }
  const rpc = vi.fn<InitialFeedbackOperationClient["rpc"]>(
    async (name, args) => {
      events.push(name);
      if (name === "read_ai_budget_source_readiness")
        return {
          data: {
            ...AI_BUDGET_SOURCE_PROFILE,
            schemaReady: true,
            reserveExecutable: true,
            exportExecutable: false,
          },
          error: null,
        };
      if (name === "ai_budget_reserve_next")
        throw Error("GENERIC_RESERVE_FORBIDDEN");
      if (name === "assert_analysis_stage_lease")
        return { data: true, error: null };
      if (name === "consume_analysis_rate_limit")
        return { data: true, error: null };
      if (name === "read_initial_feedback_readiness")
        return { data: fullReady, error: null };
      if (name === "read_initial_feedback_operation_readiness")
        return {
          data: {
            ...INITIAL_FEEDBACK_OPERATION_PROFILE,
            schemaReady: true,
            prepareExecutable: true,
            claimExecutable: true,
            settleExecutable: true,
          },
          error: null,
        };
      if (name === "read_initial_feedback_usage")
        return {
          data: {
            schemaVersion: "initial-feedback-usage/1.0.0",
            profileVersion: SYNTHETIC_RPC_PROFILE.profileVersion,
            usageSha256: SYNTHETIC_RPC_PROFILE.usageSha256,
            ownerId: f.scope.ownerId,
            organizationId: f.scope.organizationId,
            analysisId: f.scope.analysisId,
            periodStart: "2026-11-01",
            periodEnd: "2026-12-01",
            legacyUnlinkedTokens: state.tokens,
            canonicalTokens: "0",
            initialFeedbackTokens: "0",
            totalTokens: state.tokens,
            unknownClaims: state.unknown,
          },
          error: null,
        };
      if (name === "read_initial_feedback")
        return {
          data: state.publication
            ? {
                schemaVersion: "initial-feedback-read/1.0.0",
                status: "available",
                currentness: "historical",
                publication: state.publication,
              }
            : state.readPending
              ? {
                  schemaVersion: "initial-feedback-read/1.0.0",
                  status: "pending",
                  operation: op,
                  attempt: op.attempts.at(-1),
                }
              : {
                  schemaVersion: "initial-feedback-read/1.0.0",
                  status: "legacy_unbound",
                  analysisId: f.scope.analysisId,
                  reason: "original_input_or_publication_missing",
                },
          error: null,
        };
      if (name === "prepare_initial_feedback")
        return { data: f.prepared, error: null };
      if (name === "claim_initial_feedback_dispatch") {
        if (state.claimError)
          return {
            data: null,
            error: {
              code: state.claimError,
              message: "private refused detail",
            },
          };
        state.readPending = true;
        const a = op.attempts[0];
        a.state = "dispatched";
        a.claimedAt = "2026-11-15T00:00:00Z";
        if (budgetOn) a.budgetAttemptId = a.attemptId;
        const request = state.budgetRequest;
        return {
          data: {
            schemaVersion: "initial-feedback-claim/1.0.0",
            operation: op,
            attempt: a,
            dispatchAllowed: !state.claimFalse,
            replayed: state.claimFalse,
            budget:
              budgetOn && request
                ? budgetReceipt(request, "dispatched", !state.claimFalse)
                : null,
          },
          error: null,
        };
      }
      if (name === "settle_initial_feedback_attempt") {
        if (state.settlementUnavailable)
          return { data: null, error: { code: "08000" } };
        const a = op.attempts[0];
        a.usage = a.usage ?? (args.p_usage as typeof a.usage);
        a.errorCode = a.errorCode ?? (args.p_error_code as typeof a.errorCode);
        a.state =
          a.usage === null
            ? "held_unknown"
            : a.errorCode === null
              ? "known"
              : "failed";
        return {
          data: {
            schemaVersion: "initial-feedback-settlement/1.0.0",
            operationId: op.operationId,
            attemptId: a.attemptId,
            bindingSha256: op.bindingSha256,
            state: a.state,
            usage: a.usage,
            errorCode: a.errorCode,
            replayed: false,
          },
          error: null,
        };
      }
      if (name === "finish_initial_feedback") {
        state.finishCount++;
        state.publication = producePublication(
          f,
          args.p_completion as InitialFeedbackCompletion,
          args.p_attempt_id as string | null,
        );
        if (state.finishLost) throw Error("lost response");
        return {
          data: {
            schemaVersion: "initial-feedback-finish/1.0.0",
            status: "published",
            publication: state.publication,
          },
          error: null,
        };
      }
      if (name === "ai_budget_reserve_source_next") {
        expect(args).toMatchObject({
          p_user_id: f.scope.ownerId,
          p_organization_id: f.scope.organizationId,
        });
        expect(args.p_source).toEqual({
          schemaVersion: "ai-budget-source/2.0.0",
          kind: "initial_feedback",
          analysisId: f.scope.analysisId,
          resumeVersionId: op.binding.resumeVersionId,
          operationId: op.operationId,
          attemptId: op.attempts.at(-1)!.attemptId,
          lease: f.scope.lease,
        });
        state.budgetRequest = args.p_request as Record<string, unknown>;
        return {
          data: budgetReceipt(state.budgetRequest, "reserved"),
          error: null,
        };
      }
      if (name === "ai_budget_settle") {
        const r = args.p_request as Record<string, unknown>;
        state.budgetUsage = r.usage as typeof state.budgetUsage;
        return { data: budgetReceipt(r, "settled"), error: null };
      }
      if (name === "ai_budget_mark_unknown")
        return {
          data: budgetReceipt(
            args.p_request as Record<string, unknown>,
            "held_unknown",
          ),
          error: null,
        };
      if (name === "ai_budget_release")
        return {
          data: budgetReceipt(
            args.p_request as Record<string, unknown>,
            "released",
          ),
          error: null,
        };
      throw Error("Unexpected RPC");
    },
  );
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    events.push("sdk_fetch");
    if (state.fetchError) throw Error("private network failure");
    return new Response(
      JSON.stringify({
        id: "fixture-chat",
        object: "chat.completion",
        created: 1,
        model: f.scope.policy.model,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: state.content ?? JSON.stringify(state.generation),
              refusal: state.refused ? "refused" : null,
            },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: state.outputTokens },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const consent = { present: true, error: null as unknown };
  const reads: Array<{
    table: string;
    columns: string;
    filters: Record<string, unknown>;
  }> = [];
  const admin = {
    rpc,
    from: (table: string) => {
      const read = {
        table,
        columns: "",
        filters: {} as Record<string, unknown>,
      };
      reads.push(read);
      const q = {
        select: (columns: string) => {
          read.columns = columns;
          if (
            table === "analyses" &&
            columns !== "owner_id, organization_id, request_id"
          )
            throw Error(
              "Legacy mutable input lookup forbidden in selected mode",
            );
          return q;
        },
        eq: (key: string, value: unknown) => {
          read.filters[key] = value;
          return q;
        },
        limit: () => q,
        single: async () => ({
          data: {
            owner_id: f.scope.ownerId,
            organization_id: f.scope.organizationId,
            request_id: "unit-request",
          },
          error: null,
        }),
        maybeSingle: async () => ({
          data: consent.present ? { id: uuid(20) } : null,
          error: consent.error,
        }),
      };
      return q;
    },
  };
  mocks.admin = admin;
  vi.stubGlobal("fetch", fetch);
  return {
    f,
    op,
    state,
    rpc,
    fetch,
    events,
    consent,
    reads,
    run: (
      transport?: Parameters<typeof processQualitativeStage>[2],
      options = { lease: f.scope.lease },
    ) => processQualitativeStage(f.scope.analysisId, 2, transport, options),
  };
}

describe("selected initial-feedback worker stage, actual service/SDK with fake RPC/fetch", () => {
  beforeEach(() => {
    mocks.config.INITIAL_FEEDBACK_ENABLED = true;
    mocks.config.AI_ENABLED = true;
    mocks.config.AI_BUDGET_ENABLED = true;
    mocks.config.AI_BUDGET_POLICY_VERSION = "unit-budget/1";
  });
  it("publishes immutable original inputs before legacy reads and keeps the old transport isolated", async () => {
    const h = harness();
    const old = { execute: vi.fn() };
    await expect(h.run(old)).resolves.toBe(true);
    expect(old.execute).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.state.publication?.state).toBe("assessed");
    expect(h.events).not.toContain("assert_analysis_stage_lease");
    expect(h.events).not.toContain("persist_partial_analysis");
    expect(h.events).not.toContain("persist_qualitative_analysis");
    expect(h.reads[0]).toEqual({
      table: "analyses",
      columns: "owner_id, organization_id, request_id",
      filters: { id: h.f.scope.analysisId },
    });
    expect(h.reads[1]).toEqual({
      table: "consents",
      columns: "id",
      filters: {
        user_id: h.f.scope.ownerId,
        organization_id: h.f.scope.organizationId,
        purpose: "qualitative_ai",
        policy_version: AI_CONSENT_POLICY_VERSION,
      },
    });
    const req = JSON.parse(String(h.fetch.mock.calls[0][1]?.body));
    expect(req.model).toBe(h.f.scope.policy.model);
    expect(req.messages[1].content).toContain(
      h.f.prepared.context!.scoringContext.extraction.text,
    );
    expect(
      h.rpc.mock.calls
        .filter(([n]) => n === "consume_analysis_rate_limit")
        .map(([, a]) => a),
    ).toEqual([
      {
        p_key: `initial-feedback:${sha(h.f.scope.analysisId)}`,
        p_limit: 1,
        p_window_seconds: 61,
      },
      {
        p_key: `initial-feedback-user:${sha(h.f.scope.ownerId)}`,
        p_limit: 3,
        p_window_seconds: 300,
      },
    ]);
  });
  it("replays an owned publication before consent, quota, rate, claim or SDK", async () => {
    const h = harness();
    h.state.publication = producePublication(h.f, noAi, null);
    await expect(h.run()).resolves.toBe(true);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.reads).toHaveLength(1);
    expect(h.events).not.toContain("consume_analysis_rate_limit");
    expect(h.events).not.toContain("prepare_initial_feedback");
  });
  it.each([
    [401, null, "AI_PROVIDER_AUTH"],
    [503, "private upstream detail", "AI_PROVIDER_TRANSIENT"],
  ] as const)(
    "keeps deterministic feedback after HTTP %i and never redispatches on replay",
    async (status, body, code) => {
      const h = harness();
      const log = vi
        .spyOn(observability, "logEvent")
        .mockImplementation(() => undefined);
      try {
        h.fetch.mockResolvedValueOnce(new Response(body, { status }));
        await expect(h.run()).resolves.toBe(true);
        expect(h.state.publication).toMatchObject({
          state: "deterministic_only",
          reason: "provider_unavailable",
          prose: null,
          generationFailure: null,
        });
        expect(h.state.publication?.compatibility.writer).toBeNull();
        expect(h.state.publication?.compatibility.deterministicResult).toEqual(
          h.f.prepared.context!.deterministicResult,
        );
        expect(h.op.attempts[0]).toMatchObject({
          state: "held_unknown",
          usage: null,
          errorCode: "provider_failed",
        });
        expect(h.events).toContain("ai_budget_mark_unknown");
        expect(h.events).not.toContain("ai_budget_release");
        expect(h.events).not.toContain("persist_qualitative_analysis");
        expect(log).toHaveBeenCalledExactlyOnceWith(
          "warn",
          "initial_feedback.provider_failure",
          { code },
        );
        await expect(h.run()).resolves.toBe(true);
        expect(h.state.finishCount).toBe(1);
        expect(h.fetch).toHaveBeenCalledOnce();
        expect(log).toHaveBeenCalledOnce();
      } finally {
        log.mockRestore();
      }
    },
  );
  it("fails pending safely on every queue replay without redispatch or completion", async () => {
    const h = harness();
    h.state.readPending = true;
    for (let i = 0; i < 2; i++)
      await expect(h.run()).rejects.toMatchObject({
        code: "INITIAL_FEEDBACK_PENDING",
        message: "Initial feedback is pending durable completion.",
      });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.reads.every((r) => r.table === "analyses")).toBe(true);
    expect(h.events).not.toContain("consume_analysis_rate_limit");
    expect(h.events).not.toContain("prepare_initial_feedback");
    expect(h.state.finishCount).toBe(0);
  });
  it("publishes AI-off deterministic output without fresh authorization or SDK", async () => {
    const h = harness();
    mocks.config.AI_ENABLED = false;
    await expect(h.run()).resolves.toBe(true);
    expect(h.state.publication?.reason).toBe("ai_disabled");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.reads).toHaveLength(1);
    expect(h.events).not.toContain("consume_analysis_rate_limit");
  });
  it("uses existing consent and never manufactures it", async () => {
    const h = harness();
    h.consent.present = false;
    await expect(h.run()).resolves.toBe(true);
    expect(h.state.publication?.reason).toBe("pre_dispatch_unavailable");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.events).not.toContain("consume_analysis_rate_limit");
    expect(h.events).not.toContain("claim_initial_feedback_dispatch");
  });
  it("requires a real matching lease and respects cancellation before lookup", async () => {
    const h = harness();
    await expect(
      processQualitativeStage(h.f.scope.analysisId, 2),
    ).rejects.toMatchObject({ code: "ANALYSIS_FENCE_REQUIRED" });
    await expect(
      processQualitativeStage(h.f.scope.analysisId, 1, undefined, {
        lease: h.f.scope.lease,
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_LEASE_LOST" });
    await expect(
      processQualitativeStage(h.f.scope.analysisId, 2, undefined, {
        lease: h.f.scope.lease,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_CANCELLED" });
    expect(h.reads).toHaveLength(0);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("leaves the legacy branch selected when the flag is false", async () => {
    const h = harness();
    mocks.config.INITIAL_FEEDBACK_ENABLED = false;
    await expect(h.run()).rejects.toThrow(
      "Legacy mutable input lookup forbidden in selected mode",
    );
    expect(h.events).toEqual(["assert_analysis_stage_lease"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("uses the bounded worker failure path for unresolved accounting and never redispatches", async () => {
    const h = harness();
    h.state.settlementUnavailable = true;
    const queue = {
      claim: vi.fn(async () => ({
        analysisId: h.f.scope.analysisId,
        ...h.f.scope.lease,
      })),
      heartbeat: vi.fn(async () => true),
      complete: vi.fn(async () => true),
      release: vi.fn(async () => true),
    };
    for (let n = 0; n < 2; n++)
      await expect(
        runWorkerCycle(queue, async (id, attempt, signal, lease) => {
          await processQualitativeStage(id, attempt, undefined, {
            signal,
            lease,
          });
        }),
      ).rejects.toThrow("Analysis job processing failed.");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.release).toHaveBeenCalledTimes(2);
    expect(queue.release).toHaveBeenLastCalledWith({
      analysisId: h.f.scope.analysisId,
      attempt: 2,
      errorCode: "INITIAL_FEEDBACK_PENDING",
      workerId: h.f.scope.lease.workerId,
      leaseFence: h.f.scope.lease.leaseFence,
    });
    expect(h.state.finishCount).toBe(0);
    expect(
      h.events.filter((x) => x === "consume_analysis_rate_limit"),
    ).toHaveLength(2);
  });
  it("never dispatches when the once-only claim loses", async () => {
    const h = harness();
    h.state.claimFalse = true;
    await expect(h.run()).rejects.toMatchObject({
      code: "INITIAL_FEEDBACK_PENDING",
    });
    await expect(h.run()).rejects.toMatchObject({
      code: "INITIAL_FEEDBACK_PENDING",
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.state.finishCount).toBe(0);
    expect(
      h.events.filter((x) => x === "claim_initial_feedback_dispatch"),
    ).toHaveLength(1);
  });
  it("uses the exact budget-on selected policy and both accounting paths", async () => {
    const h = harness(true);
    mocks.config.AI_BUDGET_ENABLED = true;
    mocks.config.AI_BUDGET_POLICY_VERSION = "unit-budget/1";
    await expect(h.run()).resolves.toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.events).toContain("read_ai_budget_source_readiness");
    expect(h.events).toContain("ai_budget_reserve_source_next");
    expect(h.rpc).not.toHaveBeenCalledWith(
      "ai_budget_reserve_next",
      expect.anything(),
    );
    expect(h.events).toContain("ai_budget_settle");
    expect(h.events).not.toContain("ai_budget_release");
    expect(h.events).not.toContain("get_organization_ai_tokens_used");
  });
  it("refuses an unselected Native policy before consent, quota or provider with no budget-off fallback", async () => {
    const h = harness(true);
    mocks.config.AI_BUDGET_ENABLED = false;
    await expect(h.run()).rejects.toMatchObject({ code: "unavailable" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.reads).toHaveLength(1);
    expect(h.events).not.toContain("consume_analysis_rate_limit");
    expect(h.events).not.toContain("ai_budget_reserve_next");
    expect(h.events).not.toContain("ai_budget_reserve_source_next");
    expect(h.state.finishCount).toBe(0);
  });
  it("rejects malformed selected dependencies before scope lookup", async () => {
    const h = harness();
    mocks.config.LEGACY_SCORING_INPUT_ENABLED = false;
    try {
      await expect(h.run()).rejects.toMatchObject({
        code: "ANALYSIS_FENCE_UNAVAILABLE",
      });
    } finally {
      mocks.config.LEGACY_SCORING_INPUT_ENABLED = true;
    }
    expect(h.reads).toHaveLength(0);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("cancels the installed SDK attempt and retains unknown spend without legacy publication or redispatch", async () => {
    const h = harness(),
      controller = new AbortController();
    let started!: () => void;
    const fetched = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.fetch.mockImplementationOnce(async (_url, init) => {
      started();
      return new Promise<Response>((_resolve, reject) => {
        const fail = () => reject(new DOMException("Aborted", "AbortError"));
        init?.signal?.addEventListener("abort", fail, { once: true });
        if (init?.signal?.aborted) fail();
      });
    });
    const running = processQualitativeStage(
      h.f.scope.analysisId,
      2,
      undefined,
      { lease: h.f.scope.lease, signal: controller.signal },
    );
    await fetched;
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    expect(h.op.attempts[0]).toMatchObject({
      state: "held_unknown",
      usage: null,
      errorCode: "cancelled",
    });
    expect(h.events).toContain("ai_budget_mark_unknown");
    expect(h.state.budgetUsage).toBeNull();
    expect(h.state.publication).toBeNull();
    expect(h.state.finishCount).toBe(0);
    await expect(h.run()).rejects.toMatchObject({
      code: "INITIAL_FEEDBACK_PENDING",
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.events).not.toContain("persist_partial_analysis");
    expect(h.events).not.toContain("ai_budget_release");
  });
});

it("never uses generic reserve for an admitted selected budget worker", async () => {
  const h = harness(true);
  mocks.config.AI_BUDGET_ENABLED = true;
  mocks.config.AI_BUDGET_POLICY_VERSION = "unit-budget/1";
  await expect(h.run()).resolves.toBe(true);
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect(
    h.rpc.mock.calls.filter(
      ([name]) => name === "ai_budget_reserve_source_next",
    ),
  ).toHaveLength(1);
  expect(
    h.rpc.mock.calls.filter(([name]) => name === "ai_budget_reserve_next"),
  ).toHaveLength(0);
  expect(h.events).not.toContain("ai_budget_reserve_next");
});

it("finishes stored NULL-budget selected worker deterministically without rate/quota/SDK", async () => {
  const h = harness(false);
  mocks.config.AI_BUDGET_ENABLED = false;
  await expect(h.run()).resolves.toBe(true);
  expect(h.state.publication?.reason).toBe("pre_dispatch_unavailable");
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.events).not.toContain("consume_analysis_rate_limit");
  expect(h.events).not.toContain("read_initial_feedback_usage");
  expect(h.events).not.toContain("claim_initial_feedback_dispatch");
  expect(h.events).not.toContain("ai_budget_reserve_source_next");
});
