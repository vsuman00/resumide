import { afterEach, expect, it, vi } from "vitest";
import { OpenAIQualitativeTransport } from "../../app/lib/server/qualitative-ai";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["gpt-6-luna", "none"],
  ["custom-model", undefined],
])(
  "sends a bounded structured text request for %s",
  async (model, reasoning) => {
    const output = {
      toneAndStyle: { tips: [] },
      content: { tips: [] },
      structure: { tips: [] },
      skills: { tips: [] },
      writer: { summary: null, bullets: [] },
    };
    const requests: Array<{ url: unknown; init: RequestInit }> = [];
    const fetch = vi.fn(async (url: unknown, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({
          id: "synthetic-completion",
          object: "chat.completion",
          created: 0,
          model,
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
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const result = await new OpenAIQualitativeTransport(
      "test-key",
      1000,
    ).execute({
      model,
      system: "Synthetic system instruction.",
      user: "Synthetic text only.",
      maxOutputTokens: 1200,
      idempotencyKey: "model-migration-test",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requests[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const init = requests[0].init;
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(model);
    expect(body.reasoning_effort).toBe(reasoning);
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.messages[1].content).toBe("Synthetic text only.");
    expect(body).not.toHaveProperty("temperature");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "model-migration-test",
    );
    expect(result.output).toEqual(output);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  },
);
