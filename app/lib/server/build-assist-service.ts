import { createHash, randomUUID } from "node:crypto";
import { BUILD_AI_LIMITS, BUILD_AI_POLICY_VERSION } from "../build-assist";
import { getServerConfig } from "./config";
import { getAuthenticatedUser } from "./auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import {
  BuildAssistError,
  executeBuildAssist,
  validateBuildAssistRequest,
} from "./build-assist";
import { recordProviderUsage } from "./observability";
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Origin",
  });
function secure(headers: Headers) {
  for (const [key, value] of privateHeaders()) headers.set(key, value);
}
function failure(
  headers: Headers,
  code: string,
  message: string,
  status: number,
) {
  secure(headers);
  return Response.json({ error: message, code }, { status, headers });
}
let active = 0;
async function readInput(request: Request): Promise<unknown> {
  const max = BUILD_AI_LIMITS.sourceBytes * 6 + 2048;
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
    throw new BuildAssistError("invalid_request");
  if (!request.body) throw new BuildAssistError("invalid_request");
  const reader = request.body.getReader(),
    deadline = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener("abort", cancel, { once: true });
  try {
    if (deadline.aborted) {
      cancel();
      throw new BuildAssistError("cancelled");
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (deadline.aborted)
        throw new BuildAssistError(
          request.signal.aborted ? "cancelled" : "invalid_request",
        );
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        cancel();
        throw new BuildAssistError("invalid_request");
      }
      chunks.push(value);
    }
  } finally {
    deadline.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new BuildAssistError("invalid_request");
  }
}
export async function buildSuggestAction(request: Request): Promise<Response> {
  const headers = privateHeaders();
  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return failure(
      headers,
      "method_not_allowed",
      "Use POST to request a suggestion.",
      405,
    );
  }
  let admitted = false;
  try {
    const config = getServerConfig();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return failure(
        headers,
        "unauthenticated",
        "Sign in to ask for a suggestion.",
        401,
      );
    if (
      !config.LATEX_CONVERTER_ENABLED ||
      !config.BUILD_AI_ASSIST_ENABLED ||
      !config.AI_ENABLED
    )
      throw new BuildAssistError("disabled");
    const origin = new URL(config.APP_ORIGIN).origin;
    if (
      request.headers.get("Origin") !== origin ||
      new URL(request.url).origin !== origin ||
      (request.headers.get("Sec-Fetch-Site") &&
        request.headers.get("Sec-Fetch-Site") !== "same-origin")
    )
      return failure(headers, "forbidden", "Open Build from this site.", 403);
    if (
      request.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return failure(
        headers,
        "invalid_request",
        "Send the selected source as JSON.",
        415,
      );
    const prepared = validateBuildAssistRequest(await readInput(request));
    if (request.signal.aborted) throw new BuildAssistError("cancelled");
    if (active >= BUILD_AI_LIMITS.concurrency)
      throw new BuildAssistError("busy");
    active++;
    admitted = true;
    const admin = createSupabaseAdminClient();
    const membership = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membership.error || !membership.data)
      return failure(
        headers,
        "provider_unavailable",
        "AI suggestions are unavailable.",
        503,
      );
    const organizationId = membership.data.organization_id;
    for (const [key, limit] of [
      [
        `build-ai:user:${createHash("sha256").update(user.id).digest("hex")}`,
        3,
      ],
      ["build-ai:global:v1", 20],
    ] as const) {
      const result = await admin.rpc("consume_analysis_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: 60,
      });
      if (result.error) throw new BuildAssistError("provider_unavailable");
      if (result.data !== true) {
        headers.set("Retry-After", "60");
        return failure(
          headers,
          "rate_limited",
          "Too many suggestion requests. Try again later.",
          429,
        );
      }
    }
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const usage = await admin.rpc("get_organization_ai_tokens_used", {
      p_organization_id: organizationId,
      p_since: monthStart.toISOString(),
    });
    const used = Number(usage.data);
    if (
      usage.error ||
      usage.data === null ||
      !["number", "string"].includes(typeof usage.data) ||
      (typeof usage.data === "string" &&
        !/^(0|[1-9][0-9]*)$/.test(usage.data)) ||
      !Number.isSafeInteger(used) ||
      used < 0
    )
      throw new BuildAssistError("provider_unavailable");
    // Existing actual usage is analysis-only. This separate atomic request quota
    // reserves a fixed conservative input/output allowance; it never refunds failures.
    const monthlyQuota = Math.floor(
      (config.AI_MONTHLY_TOKEN_LIMIT - used) / BUILD_AI_LIMITS.reservedTokens,
    );
    if (monthlyQuota < 1) throw new BuildAssistError("budget_exhausted");
    const month = monthStart.toISOString().slice(0, 7);
    const reservation = await admin.rpc("consume_analysis_rate_limit", {
      p_key: `build-ai:month:${month}:${createHash("sha256").update(organizationId).digest("hex")}`,
      p_limit: monthlyQuota,
      p_window_seconds: 32 * 86400,
    });
    if (reservation.error) throw new BuildAssistError("provider_unavailable");
    if (reservation.data !== true)
      throw new BuildAssistError("budget_exhausted");
    const consent = await admin.from("consents").upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        purpose: "qualitative_ai",
        policy_version: BUILD_AI_POLICY_VERSION,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "user_id,purpose,policy_version" },
    );
    if (consent.error) throw new BuildAssistError("provider_unavailable");
    const audit = await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_id: user.id,
      action: "build_ai.consent_recorded",
      target_type: "consent",
      outcome: "success",
      request_id: randomUUID(),
    });
    if (audit.error) throw new BuildAssistError("provider_unavailable");
    if (request.signal.aborted) throw new BuildAssistError("cancelled");
    const result = await executeBuildAssist(prepared, {
      apiKey: config.OPENAI_API_KEY,
      baseUrl: config.OPENAI_BASE_URL,
      model: config.OPENAI_MODEL,
      signal: request.signal,
      onUsage: (usage) =>
        recordProviderUsage({
          provider: "openai",
          model: config.OPENAI_MODEL,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          inputCostPer1kUsd: config.AI_INPUT_COST_PER_1K_USD,
          outputCostPer1kUsd: config.AI_OUTPUT_COST_PER_1K_USD,
        }),
    });
    secure(headers);
    return Response.json(result.response, { headers });
  } catch (error) {
    if (error instanceof BuildAssistError) {
      const status =
        error.code === "disabled"
          ? 404
          : error.code === "consent_required"
            ? 403
            : error.code === "busy" || error.code === "budget_exhausted"
              ? 429
              : error.code === "stale_source" || error.code === "cancelled"
                ? 409
                : error.code === "provider_unavailable"
                  ? 503
                  : error.code === "timeout"
                    ? 504
                    : error.code === "output_invalid"
                      ? 422
                      : 400;
      return failure(headers, error.code, error.message, status);
    }
    return failure(
      headers,
      "provider_unavailable",
      "AI suggestions are unavailable. No edit was applied.",
      503,
    );
  } finally {
    if (admitted) active--;
  }
}
