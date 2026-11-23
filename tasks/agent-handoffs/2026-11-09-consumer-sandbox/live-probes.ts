import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  DEFAULT_OPENAI_MODEL,
  proseModelOptions,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/openai-model";
import {
  DEFAULT_OPENAI_BASE_URL,
  assertAllowedOpenAiBaseUrl,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/egress-policy";
import { runQualitativeAi } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/qualitative-ai";
import { ProseGenerationSchema } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/qualitative-prose";
import { resolveWriterProposals } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/writer-proposals";
import {
  createRewriteTransport,
  generateGroundedRewrite,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/rewrite-ai";
import {
  BUILD_AI_POLICY_VERSION,
  applyBuildSuggestion,
  undoBuildSuggestion,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/build-assist";
import {
  executeBuildAssist,
  validateBuildAssistRequest,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/build-assist";
const ROOT =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const envText = await readFile(`${ROOT}/.env`, "utf8");
function setting(name: string) {
  const line = envText
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}=`));
  return line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/u, "$2");
}
const key = setting("OPENAI_API_KEY"),
  model = setting("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
  baseURL = assertAllowedOpenAiBaseUrl(
    setting("OPENAI_BASE_URL") || DEFAULT_OPENAI_BASE_URL,
  );
assert.ok(key, "Existing configured credential unavailable");
const realFetch = globalThis.fetch;
let calls = 0,
  requestedOutputTokens = 0,
  lastHttpStatus: number | null = null;
const callReceipts: object[] = [];
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  assert.equal(u.origin, new URL(baseURL).origin);
  assert.equal(
    u.pathname,
    `${new URL(baseURL).pathname.replace(/\/$/, "")}/chat/completions`,
  );
  assert.equal(init?.method, "POST");
  const payload = JSON.parse(String(init.body));
  assert.equal(payload.model, model);
  const cap = payload.max_completion_tokens;
  assert.ok(Number.isInteger(cap) && cap > 0 && cap <= 1200);
  assert.ok(
    calls < 5 && requestedOutputTokens + cap <= 4704,
    "Strict live allocation exhausted",
  );
  calls++;
  requestedOutputTokens += cap;
  lastHttpStatus = null;
  const response = await realFetch(input, {
    ...init,
    redirect: "error",
    cache: "no-store",
  });
  lastHttpStatus = response.status;
  callReceipts.push({
    call: calls,
    maxOutputTokens: cap,
    httpStatus: response.status,
  });
  return response;
};
const client = new OpenAI({
  apiKey: key,
  baseURL,
  maxRetries: 0,
  timeout: 10000,
  logLevel: "off",
  fetchOptions: { redirect: "error" },
});
const resumeText =
  "Experience\n- Built Python REST APIs using FastAPI.\n- Added request validation with Pydantic.\n- Maintained PostgreSQL queries and service logs.\nSkills\nPython, FastAPI, Pydantic, PostgreSQL";
const jobTitle = "Python backend engineer",
  jobDescription =
    "Develop Python REST APIs with FastAPI and validated request schemas. Investigate service logs and maintain database queries.";
const results: object[] = [];
let stop = false;
async function probe(name: string, fn: () => Promise<object>) {
  if (stop) return;
  const started = performance.now();
  try {
    const details = await fn();
    results.push({
      name,
      status: "pass",
      durationMs: Math.round(performance.now() - started),
      ...details,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : error instanceof Error
          ? error.name
          : "unknown";
    results.push({
      name,
      status: "failed",
      code,
      httpStatus: lastHttpStatus,
      durationMs: Math.round(performance.now() - started),
    });
    if ([400, 401, 403, 404, 429].includes(lastHttpStatus ?? 0)) stop = true;
  }
}
await probe("qualitative-grounded-prose", async () => {
  const transport = {
    async execute(request: any) {
      const completion = await client.chat.completions.parse(
        {
          ...proseModelOptions(model),
          store: false,
          max_completion_tokens: request.maxOutputTokens,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: zodResponseFormat(
            ProseGenerationSchema,
            "qualitative_analysis",
          ),
        },
        { headers: { "Idempotency-Key": request.idempotencyKey } },
      );
      const m = completion.choices[0]?.message;
      return {
        output: m?.parsed
          ? {
              ...m.parsed,
              writer: resolveWriterProposals(
                m.parsed.writer,
                request.sources ?? [],
              ),
            }
          : null,
        refused: Boolean(m?.refusal),
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
  const r = await runQualitativeAi(
    {
      enabled: true,
      remainingTokenBudget: 100000,
      model,
      maxOutputTokens: 1200,
      timeoutMs: 11000,
      idempotencyKey: `consumer-${randomUUID()}`,
      resumeText,
      jobTitle,
      jobDescription,
    },
    transport,
  );
  const categories = [
    r.prose.toneAndStyle,
    r.prose.content,
    r.prose.structure,
    r.prose.skills,
  ];
  assert.ok(
    categories.every((c) => c.tips.every((t) => resumeText.includes(t.quote))),
  );
  assert.ok(
    r.prose.writer.bullets.every((b) => resumeText.includes(b.original)),
  );
  return {
    usage: r.usage,
    quotedTips: categories.reduce((n, c) => n + c.tips.length, 0),
    acceptedWriterBullets: r.prose.writer.bullets.length,
    quotesSourceBound: true,
    numericRatingsGenerated: false,
    adapterDifference:
      "Existing runQualitativeAi and schemas with explicit zero-retry no-store SDK transport; production OpenAIQualitativeTransport leaves SDK retry default.",
  };
});
await probe("source-bound-resume-rewrite", async () => {
  const transport = createRewriteTransport({
    OPENAI_API_KEY: key!,
    OPENAI_BASE_URL: baseURL,
    OPENAI_MODEL: model,
    OPENAI_TIMEOUT_MS: 10000,
    OPENAI_MAX_OUTPUT_TOKENS: 1200,
  });
  const r = await generateGroundedRewrite(
    {
      resumeText,
      jobTitle,
      jobDescription,
      idempotencyKey: `consumer-${randomUUID()}`,
    },
    transport,
    11000,
  );
  assert.ok(r.writer.bullets.every((b) => resumeText.includes(b.original)));
  return {
    usage: r.usage,
    proposedBullets: r.proposedBullets,
    acceptedBullets: r.writer.bullets.length,
    sourceBound: true,
  };
});
for (const mode of ["fix", "rewrite", "resume"] as const) {
  await probe(`build-${mode}`, async () => {
    const selected =
      mode === "fix"
        ? String.raw`\textbf{Neutral heading`
        : mode === "rewrite"
          ? "Built Python APIs with clear validation."
          : "Helped reduce incidents 12 percent.";
    const source = `\\documentclass{article}\n\\begin{document}\n${selected}\n\\end{document}\n`;
    const prepared = validateBuildAssistRequest({
      source,
      sourceHash: createHash("sha256").update(source).digest("hex"),
      startLine: 3,
      endLine: 3,
      mode,
      consent: true,
      policyVersion: BUILD_AI_POLICY_VERSION,
    });
    const r = await executeBuildAssist(prepared, {
      apiKey: key!,
      baseUrl: baseURL,
      model,
    });
    let applied = false,
      staleDenied = false,
      confirmationDenied = mode !== "resume",
      undoPassed = false;
    if (r.response.suggestion.operation === "replace") {
      if (mode === "resume")
        try {
          await applyBuildSuggestion(source, r.response);
        } catch (e) {
          confirmationDenied = Boolean(
            e &&
            typeof e === "object" &&
            "code" in e &&
            e.code === "fact_confirmation_required",
          );
        }
      const updated = await applyBuildSuggestion(source, r.response, true);
      applied = updated !== source;
      assert.ok(
        updated.startsWith("\\documentclass{article}\n\\begin{document}\n"),
      );
      undoPassed =
        undoBuildSuggestion(updated, {
          beforeSource: source,
          afterSource: updated,
        }) === source;
      try {
        await applyBuildSuggestion(source + " ", r.response, true);
      } catch (e) {
        staleDenied = Boolean(
          e &&
          typeof e === "object" &&
          "code" in e &&
          e.code === "stale_source",
        );
      }
      assert.ok(applied && staleDenied && undoPassed && confirmationDenied);
    }
    return {
      usage: r.usage,
      operation: r.response.suggestion.operation,
      applied,
      staleDenied,
      confirmationDenied,
      undoPassed,
      sourceHashBound: r.response.sourceHash === prepared.sourceHash,
    };
  });
}
globalThis.fetch = realFetch;
const receipt = {
  status:
    results.every((r: any) => r.status === "pass") && results.length === 5
      ? "pass"
      : "partial_or_failed",
  evidenceTier: "live-neutral-synthetic-core-transports-no-db",
  model,
  calls,
  requestedOutputTokens,
  maxCalls: 5,
  maxRequestedOutputTokens: 4704,
  maxRetries: 0,
  callReceipts,
  results,
  databaseWrites: 0,
  credentialsChanged: false,
  rawContentPersisted: false,
};
await writeFile(
  new URL("./live-probes.json", import.meta.url),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(receipt, null, 2));
