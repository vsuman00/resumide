import { afterEach, expect, it, vi } from "vitest";
import {
  OpenAIQualitativeTransport,
  runQualitativeAi,
} from "../../app/lib/server/qualitative-ai";
afterEach(() => vi.unstubAllGlobals());
it("normal qualitative generation resolves source IDs before grounding and keeps JD-only skills out", async () => {
  const resumeText =
    "Experience\n– Built React services with PostgreSQL; reduced latency by 20%.";
  const output = {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: {
      summary: null,
      bullets: [
        {
          sourceId: 0,
          rewrite:
            "Developed React services with PostgreSQL; reduced latency by 20%.",
          reasoning: "Clarifies the existing measured contribution.",
        },
      ],
    },
  };
  let sent: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          id: "synthetic",
          object: "chat.completion",
          created: 0,
          model: "test-model",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(output),
                refusal: null,
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const result = await runQualitativeAi(
    {
      enabled: true,
      remainingTokenBudget: 10000,
      model: "test-model",
      maxOutputTokens: 1000,
      timeoutMs: 1000,
      idempotencyKey: "source-id-regression",
      resumeText,
      jobTitle: "Engineer",
      jobDescription: "React and Kubernetes",
    },
    new OpenAIQualitativeTransport("synthetic-key", 1000),
  );
  expect(result.output.writer.bullets).toHaveLength(1);
  expect(result.output.writer.bullets[0].original).toBe(
    "– Built React services with PostgreSQL; reduced latency by 20%.",
  );
  expect(JSON.stringify(result.output.writer)).not.toContain("Kubernetes");
  const messages = sent!.messages as { content: string }[];
  expect(messages[0].content).not.toContain(resumeText);
  expect(JSON.parse(messages[1].content).sources[0]).toEqual({
    id: 0,
    text: result.output.writer.bullets[0].original,
  });
  expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
});
