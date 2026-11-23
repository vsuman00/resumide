import { describe, expect, it } from "vitest";
import { groundWriterSuggestions } from "~/lib/server/writer-grounding";
import { generateGroundedRewrite } from "~/lib/server/rewrite-ai";
import { runQualitativeAi } from "~/lib/server/qualitative-ai";
import { RELIABILITY_REGRESSIONS } from "../fixtures/reliability-regressions";

describe("writer evidence grounding", () => {
  it("keeps suggestions whose source facts are present", () => {
    const result = groundWriterSuggestions(
      {
        summary: "Backend engineer who improved API latency by 40% at Acme.",
        bullets: [
          {
            original: "Improved API latency by 40% at Acme.",
            rewrite: "Reduced API latency by 40% at Acme.",
            reasoning: "Makes the measured outcome clearer.",
          },
        ],
      },
      "Jordan Doe\nBackend Engineer at Acme\nImproved API latency by 40% at Acme.",
    );

    expect(result.summary).toContain("40%");
    expect(result.bullets).toHaveLength(1);
  });

  it("removes invented facts and never creates suggestions from empty source", () => {
    const result = groundWriterSuggestions(
      {
        summary: "Won an award and led 12 engineers at Globex.",
        bullets: [
          {
            original: "Built a dashboard.",
            rewrite:
              "Built a dashboard with python that saved 90% of support time at Globex.",
            reasoning: "Adds impact.",
          },
        ],
      },
      "Jordan Doe\nBuilt a dashboard.",
    );

    expect(result.summary).toBeNull();
    expect(result.bullets).toEqual([]);
    expect(
      groundWriterSuggestions({ summary: "Anything", bullets: [] }, "   "),
    ).toEqual({ summary: null, bullets: [] });
  });

  it.each(RELIABILITY_REGRESSIONS.unsupportedWriter)(
    "rejects the preserved $id claim",
    (testCase) => {
      const writer =
        testCase.kind === "summary"
          ? { summary: testCase.summary, bullets: [] }
          : {
              summary: null,
              bullets: [
                {
                  original: testCase.original,
                  rewrite: testCase.rewrite,
                  reasoning: testCase.reasoning,
                },
              ],
            };
      expect(groundWriterSuggestions(writer, testCase.source)).toEqual({
        summary: null,
        bullets: [],
      });
    },
  );

  it.each(RELIABILITY_REGRESSIONS.relationshipHypotheses)(
    "rejects unsupported relationship $id",
    (testCase) => {
      expect(
        groundWriterSuggestions(
          {
            summary: null,
            bullets: [
              {
                original: testCase.source,
                rewrite: testCase.rewrite,
                reasoning: "Clarifies the result.",
              },
            ],
          },
          testCase.source,
        ).bullets,
      ).toEqual([]);
    },
  );

  it("does not promote contributor agency into leadership", () => {
    const original = "Supported reliable services.";
    expect(
      groundWriterSuggestions(
        {
          summary: null,
          bullets: [
            {
              original,
              rewrite: "Led reliable services.",
              reasoning: "Clarifies the contribution.",
            },
          ],
        },
        original,
      ).bullets,
    ).toEqual([]);
  });

  it("does not assign a role to an employer from another clause", () => {
    expect(
      groundWriterSuggestions(
        {
          summary: "Backend engineer at Acme.",
          bullets: [],
        },
        "Backend Engineer at OtherCo\nImproved API latency by 40% at Acme.",
      ).summary,
    ).toBeNull();
  });

  it.each(RELIABILITY_REGRESSIONS.unsupportedDownstream)(
    "rejects $id after the actual structured pipeline",
    async (testCase) => {
      const request = {
        resumeText: testCase.source,
        jobTitle: testCase.jobTitle,
        jobDescription: testCase.jobDescription,
        idempotencyKey: "synthetic-grounding-regression",
      };
      if (testCase.pipeline === "explicit_rewrite") {
        const result = await generateGroundedRewrite(
          request,
          {
            execute: async () => ({
              output: {
                summary: null,
                bullets: [
                  {
                    sourceId: testCase.sourceId,
                    rewrite: testCase.rewrite,
                    reasoning: testCase.reasoning,
                  },
                ],
              },
              usage: { inputTokens: 10, outputTokens: 10 },
            }),
          },
          1000,
        );
        expect(result.writer.bullets).toEqual([]);
      } else {
        const category = { tips: [] };
        const result = await runQualitativeAi(
          {
            ...request,
            enabled: true,
            remainingTokenBudget: 1000,
            model: "injected-synthetic-transport",
            maxOutputTokens: 100,
            timeoutMs: 1000,
          },
          {
            execute: async () => ({
              output: {
                toneAndStyle: category,
                content: category,
                structure: category,
                skills: category,
                writer: {
                  summary: null,
                  bullets: [
                    {
                      original: testCase.source,
                      rewrite: testCase.rewrite,
                      reasoning: testCase.reasoning,
                    },
                  ],
                },
              },
              usage: { inputTokens: 10, outputTokens: 10 },
            }),
          },
        );
        expect(result.output.writer.bullets).toEqual([]);
      }
    },
  );

  it("retains a useful source-preserving verb and clause-format rewrite", () => {
    const original =
      "Built React services with PostgreSQL and reduced latency by 20%.";
    expect(
      groundWriterSuggestions(
        {
          summary: null,
          bullets: [
            {
              original,
              rewrite:
                "Developed React services with PostgreSQL; reduced latency by 20%.",
              reasoning:
                "Emphasizes the existing technical contribution without adding claims.",
            },
          ],
        },
        original,
      ).bullets,
    ).toHaveLength(1);
  });
});
