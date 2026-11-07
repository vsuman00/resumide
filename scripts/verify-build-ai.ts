import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import {
  assertAllowedOpenAiBaseUrl,
  DEFAULT_OPENAI_BASE_URL,
} from "../app/lib/server/egress-policy";
import {
  DEFAULT_OPENAI_MODEL,
  proseModelOptions,
} from "../app/lib/server/openai-model";

async function liveProbe() {
  const file = process.argv[process.argv.indexOf("--env") + 1];
  if (!process.argv.includes("--env") || !file)
    throw Error("Pass the explicitly authorized existing environment file");
  const text = await readFile(file, "utf8");
  const setting = (name: string) => {
    const line = text
      .split(/\r?\n/u)
      .find((line) => line.startsWith(name + "="));
    const value = line?.slice(name.length + 1).trim();
    return value?.replace(/^(['"])(.*)\1$/u, "$2");
  };
  const apiKey = setting("OPENAI_API_KEY"),
    model = setting("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL;
  if (!apiKey) throw Error("The authorized existing credential is unavailable");
  const baseURL = assertAllowedOpenAiBaseUrl(
    setting("OPENAI_BASE_URL") || DEFAULT_OPENAI_BASE_URL,
  );
  const started = performance.now();
  const client = new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 0,
    timeout: 10000,
    logLevel: "off",
    fetchOptions: { redirect: "error" },
  });
  try {
    const result = await client.chat.completions.create(
      {
        ...proseModelOptions(model),
        max_completion_tokens: 128,
        store: false,
        messages: [
          {
            role: "user",
            content:
              "Review this public synthetic two-line LaTeX snippet. Return the requested JSON with ok true; do not rewrite it.\n\\section{Synthetic note}\nNeutral technical sentence.",
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "synthetic_capability_probe",
            strict: true,
            schema: {
              type: "object",
              properties: { ok: { type: "boolean", const: true } },
              required: ["ok"],
              additionalProperties: false,
            },
          },
        },
      },
      { signal: AbortSignal.timeout(10000) },
    );
    let structured = false;
    try {
      const value = JSON.parse(result.choices[0]?.message.content ?? "null");
      structured = value?.ok === true && Object.keys(value).join(",") === "ok";
    } catch {
      structured = false;
    }
    const receipt = {
      status: structured ? "pass" : "failed",
      category: result.choices[0]?.message.refusal
        ? "refused"
        : structured
          ? "structured_capability"
          : "structured_capability_failed",
      model,
      calls: 1,
      maxOutputTokens: 128,
      maxRetries: 0,
      timeoutMs: 10000,
      durationMs: Math.round(performance.now() - started),
      usage: {
        inputTokens: result.usage?.prompt_tokens ?? 0,
        outputTokens: result.usage?.completion_tokens ?? 0,
      },
    };
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    if (!structured) process.exitCode = 1;
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : null;
    process.stdout.write(
      JSON.stringify(
        {
          status: "failed",
          category:
            status === 401 || status === 403
              ? "authentication_or_access"
              : status === 404
                ? "model_or_endpoint_unavailable"
                : status === 400
                  ? "structured_capability_or_request"
                  : "transport_or_timeout",
          httpStatus: status,
          model,
          calls: 1,
          maxOutputTokens: 128,
          maxRetries: 0,
          timeoutMs: 10000,
          durationMs: Math.round(performance.now() - started),
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
  }
}
if (!process.argv.includes("--live-probe"))
  throw Error("Choose an explicit authorized verification mode");
await liveProbe();
