import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const single = vi.fn();
  return {
    rpc,
    single,
    evidence: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
});

vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: () => ({
    AI_ENABLED: true,
    AI_MONTHLY_TOKEN_LIMIT: 10_000,
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "test-model",
    OPENAI_MAX_OUTPUT_TOKENS: 1_000,
    OPENAI_TIMEOUT_MS: 50,
    QUALITATIVE_MAX_ATTEMPTS: 1,
  }),
}));

vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.single, limit: mocks.evidence }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));

import { processQualitativeStage } from "../../app/lib/server/qualitative-stage";

describe("qualitative-stage provider outage", () => {
  it("does not call a model or publish historical scores for uncalibrated evidence", async () => {
    mocks.single.mockResolvedValue({
      data: { status: "qualitative_review" },
      error: null,
    });
    mocks.evidence.mockResolvedValueOnce({
      data: [{ id: "attempt" }],
      error: null,
    });
    mocks.rpc.mockClear();
    const execute = vi.fn();
    expect(await processQualitativeStage("analysis-1", 1, { execute })).toBe(
      false,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("persists a deterministic partial result after the first retryable failure", async () => {
    mocks.single.mockResolvedValue({
      data: {
        status: "qualitative_review",
        request_id: "request-1",
        organization_id: "org-1",
        jobs: { title: "Engineer", description: "Build software" },
        analysis_extractions: { extracted_text: "Candidate resume" },
        analysis_deterministic_results: {
          score: 74,
          rule_trace: [
            { passed: true, detail: "Email address was found." },
            { passed: false, detail: "Add a Skills section." },
            { passed: true, detail: "Dates are parseable." },
          ],
        },
      },
      error: null,
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const persisted = await processQualitativeStage("analysis-1", 1, {
      execute: vi.fn().mockRejectedValue({ status: 503 }),
    });

    expect(persisted).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "persist_partial_analysis",
      expect.objectContaining({
        p_analysis_id: "analysis-1",
        p_feedback: expect.objectContaining({
          overallScore: 74,
          ATS: expect.objectContaining({ score: 74 }),
        }),
      }),
    );
  });
});

describe("AA044 persistence semantics", () => {
  it("different cited prose cannot change the deterministic baseline or store model ratings", async () => {
    for (const prose of ["Clarify your role", "Explain the outcome"]) {
      mocks.single.mockResolvedValue({
        data: {
          status: "qualitative_review",
          request_id: "request-1",
          organization_id: "org-1",
          jobs: null,
          analysis_extractions: { extracted_text: "Built reliable services" },
          analysis_deterministic_results: {
            score: 74,
            rule_trace: [
              { passed: true, detail: "Observed email" },
              { passed: true, detail: "Observed dates" },
              { passed: false, detail: "Review structure" },
            ],
          },
        },
        error: null,
      });
      mocks.rpc
        .mockReset()
        .mockResolvedValueOnce({ data: 0, error: null })
        .mockResolvedValueOnce({ data: true, error: null });
      const category = {
        tips: [
          {
            type: "improve",
            tip: prose,
            explanation: prose,
            quote: "Built reliable services",
          },
        ],
      };
      const execute = vi.fn().mockResolvedValue({
        output: {
          toneAndStyle: category,
          content: category,
          structure: category,
          skills: category,
          writer: { summary: null, bullets: [] },
        },
        usage: { inputTokens: 10, outputTokens: 20 },
      });
      expect(await processQualitativeStage("analysis-1", 1, { execute })).toBe(
        true,
      );
      const saved = mocks.rpc.mock.calls.at(-1)![1];
      expect(saved.p_feedback.overallScore).toBe(74);
      expect(saved.p_feedback.scoreSemantics).toBe(
        "deterministic_baseline_no_model_ratings/1.0.0",
      );
      expect(saved.p_output.content).toEqual(category);
      expect(JSON.stringify(saved.p_output)).not.toContain('"score"');
    }
  });
});
