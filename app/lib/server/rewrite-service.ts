import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getServerConfig } from "./config";
import { getAuthenticatedUser } from "./auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import { requireAndRecordAiConsent } from "./privacy";
import { QualitativeAiFailure } from "./qualitative-ai";
import {
  createRewriteTransport,
  generateGroundedRewrite,
  REWRITE_PROMPT_VERSION,
  type RewriteTransport,
} from "./rewrite-ai";
import { buildRewriteSources } from "./rewrite-sources";
import { hasUncalibratedEvidence } from "./evidence-scoring-guard";
import { requestIdFrom } from "./request-context";
import { ownedAnalysis, CanonicalError } from "./canonical-repository";

class RewriteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const single = <T>(value: T | T[] | null): T | undefined =>
  Array.isArray(value) ? value[0] : (value ?? undefined);
async function consentFrom(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw new RewriteError(
      "invalid_request",
      "Submit the writing consent form.",
      415,
    );
  if (!request.body) return false;
  const reader = request.body.getReader();
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (deadline.aborted)
      throw new RewriteError(
        "invalid_request",
        "Please submit the form again.",
        400,
      );
    for (;;) {
      const next = await reader.read();
      if (deadline.aborted)
        throw new RewriteError(
          "invalid_request",
          "Please submit the form again.",
          400,
        );
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 2048) {
        cancel();
        throw new RewriteError(
          "invalid_request",
          "The request is too large.",
          413,
        );
      }
      chunks.push(next.value);
    }
  } finally {
    deadline.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  return (
    new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get(
      "aiConsent",
    ) === "accepted"
  );
}

/** A bounded, owner-triggered drafting request. Existing analysis scores and
 * canonical versions are never changed. Completed runs keep proposal history. */
export async function rewriteAction(
  request: Request,
  analysisId: string | undefined,
  transport?: RewriteTransport,
): Promise<Response> {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Origin",
    "X-Request-Id": requestIdFrom(request),
  });
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return respond(
      {
        code: "method_not_allowed",
        error: "Use POST to generate suggestions.",
      },
      405,
    );
  }
  try {
    const config = getServerConfig();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw new RewriteError(
        "unauthenticated",
        "Sign in to generate suggestions.",
        401,
      );
    const origin = new URL(config.APP_ORIGIN).origin;
    if (
      request.headers.get("Origin") !== origin ||
      new URL(request.url).origin !== origin
    )
      throw new RewriteError("forbidden", "Open Review from this site.", 403);
    if (!z.uuid().safeParse(analysisId).success)
      throw new RewriteError("not_found", "Analysis not found.", 404);
    const accepted = await consentFrom(request);
    if (!accepted)
      throw new RewriteError(
        "consent_required",
        "Consent is required before AI processing.",
        403,
      );
    if (!config.AI_ENABLED)
      throw new RewriteError(
        "ai_disabled",
        "Writing generation is disabled on this server.",
        503,
      );
    const admin = createSupabaseAdminClient();
    const result = await admin
      .from("analyses")
      .select(
        "id, owner_id, organization_id, status, resume_version_id, job_id, jobs(title, description), resume_versions(resumes(status)), analysis_extractions(extracted_text), writer_drafts(id, kind, draft, updated_at)",
      )
      .eq("id", analysisId!)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (result.error)
      throw new RewriteError(
        "unavailable",
        "Saved analysis could not be loaded.",
        503,
      );
    const a = result.data;
    if (!a) throw new RewriteError("not_found", "Analysis not found.", 404);
    await ownedAnalysis(admin, a.id, user.id);
    if (!["completed", "partial"].includes(a.status))
      throw new RewriteError(
        "not_ready",
        "Wait for this analysis to finish.",
        409,
      );
    const version = single(a.resume_versions);
    if (single(version?.resumes ?? null)?.status !== "active")
      throw new RewriteError("not_found", "Analysis not found.", 404);
    if (await hasUncalibratedEvidence(admin, a.id))
      throw new RewriteError(
        "unsupported_evidence",
        "This evidence needs review before generating wording.",
        422,
      );
    const extraction = single(a.analysis_extractions);
    const job = single(a.jobs);
    if (
      !extraction?.extracted_text?.trim() ||
      extraction.extracted_text.length > config.MAX_EXTRACTED_CHARACTERS ||
      !buildRewriteSources(extraction.extracted_text).length
    )
      throw new RewriteError(
        "missing_source",
        "No usable source contribution is available for rewriting.",
        422,
      );
    if (!job?.description?.trim())
      throw new RewriteError(
        "missing_job",
        "Add a job description in a new analysis before generating targeted wording.",
        422,
      );
    const draft = a.writer_drafts?.find((d) => d.kind === "summary");
    if (!draft)
      throw new RewriteError(
        "missing_draft",
        "The saved writing record is unavailable. Start a new analysis.",
        422,
      );
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          source: extraction.extracted_text,
          job,
          version: a.resume_version_id,
          prompt: REWRITE_PROMPT_VERSION,
        }),
      )
      .digest("hex");
    // The relative database window exceeds the bounded provider call. All web
    // processes share it; the draft timestamp below is a second stale-write guard.
    const windowSeconds = Math.ceil(config.OPENAI_TIMEOUT_MS / 1000) + 60;
    const allowed = await admin.rpc("consume_analysis_rate_limit", {
      p_key: `rewrite:${createHash("sha256").update(a.id).digest("hex")}`,
      p_limit: 1,
      p_window_seconds: windowSeconds,
    });
    if (allowed.error)
      throw new RewriteError(
        "unavailable",
        "Writing generation could not start.",
        503,
      );
    if (allowed.data !== true) {
      headers.set("Retry-After", String(windowSeconds));
      throw new RewriteError(
        "rate_limited",
        "A recent generation is still pending or cooling down. Try again shortly.",
        429,
      );
    }
    const userLimit = await admin.rpc("consume_analysis_rate_limit", {
      p_key: `rewrite-user:${createHash("sha256").update(user.id).digest("hex")}`,
      p_limit: 3,
      p_window_seconds: 300,
    });
    if (userLimit.error)
      throw new RewriteError(
        "unavailable",
        "Writing generation could not start.",
        503,
      );
    if (userLimit.data !== true)
      throw new RewriteError(
        "rate_limited",
        "Too many writing requests. Try again in a few minutes.",
        429,
      );
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const usage = await admin.rpc("get_organization_ai_tokens_used", {
      p_organization_id: a.organization_id,
      p_since: since.toISOString(),
    });
    if (usage.error)
      throw new RewriteError(
        "unavailable",
        "The writing budget could not be checked.",
        503,
      );
    const maxInputTokens = Math.ceil(
      extraction.extracted_text.length * 2 + job.description.length + 4000,
    );
    if (
      Number(usage.data) + maxInputTokens + config.OPENAI_MAX_OUTPUT_TOKENS >
      config.AI_MONTHLY_TOKEN_LIMIT
    )
      throw new RewriteError(
        "budget_exhausted",
        "The writing token budget is exhausted.",
        429,
      );
    await requireAndRecordAiConsent({
      userId: user.id,
      accepted,
      requestId: headers.get("X-Request-Id")!,
    });
    if (request.signal.aborted)
      throw new RewriteError("cancelled", "Generation was cancelled.", 409);
    const runId = randomUUID();
    const generated = await generateGroundedRewrite(
      {
        resumeText: extraction.extracted_text,
        jobTitle: job.title,
        jobDescription: job.description,
        idempotencyKey: `rewrite-${runId}`,
      },
      transport ?? createRewriteTransport(config),
      config.OPENAI_TIMEOUT_MS,
    );
    const hasSuggestions = Boolean(
      generated.writer.summary || generated.writer.bullets.length,
    );
    const recorded = await admin.from("analysis_ai_runs").insert({
      id: runId,
      analysis_id: a.id,
      organization_id: a.organization_id,
      owner_id: user.id,
      provider: "openai",
      model_id: config.OPENAI_MODEL,
      prompt_version: REWRITE_PROMPT_VERSION,
      input_hash: inputHash,
      input_tokens: generated.usage.inputTokens,
      output_tokens: generated.usage.outputTokens,
      output: {
        writer: generated.writer,
        proposedBullets: generated.proposedBullets,
        state: hasSuggestions ? "grounded" : "no_grounded_suggestions",
        resumeVersionId: a.resume_version_id,
      },
    });
    if (recorded.error)
      throw new RewriteError(
        "save_failed",
        "Suggestions could not be recorded. The previous draft is preserved.",
        503,
      );
    if (!hasSuggestions)
      throw new RewriteError(
        "no_grounded_suggestions",
        "No proposed wording passed the source checks. The previous draft is preserved.",
        422,
      );
    if (request.signal.aborted)
      throw new RewriteError(
        "cancelled",
        "Generation was cancelled. The previous draft is preserved.",
        409,
      );
    await ownedAnalysis(admin, a.id, user.id);
    // Ensure the resume is still active and the input binding remains unchanged.
    const current = await admin
      .from("analyses")
      .select(
        "resume_version_id, job_id, jobs(title, description), resume_versions(resumes(status)), analysis_extractions(extracted_text)",
      )
      .eq("id", a.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (
      current.error ||
      !current.data ||
      current.data.resume_version_id !== a.resume_version_id ||
      current.data.job_id !== a.job_id ||
      single(current.data.jobs)?.description !== job.description ||
      single(current.data.jobs)?.title !== job.title ||
      single(current.data.analysis_extractions)?.extracted_text !==
        extraction.extracted_text ||
      single(single(current.data.resume_versions)?.resumes ?? null)?.status !==
        "active"
    )
      throw new RewriteError(
        "stale_source",
        "The source changed. Reload before generating again.",
        409,
      );
    const saved = await admin
      .from("writer_drafts")
      .update({ draft: generated.writer })
      .eq("id", draft.id)
      .eq("analysis_id", a.id)
      .eq("owner_id", user.id)
      .eq("updated_at", draft.updated_at)
      .select("id")
      .maybeSingle();
    if (saved.error)
      throw new RewriteError(
        "save_failed",
        "Suggestions could not be saved. Reload and try again.",
        503,
      );
    if (!saved.data)
      throw new RewriteError(
        "stale_draft",
        "Another request changed the draft. Reload to review it.",
        409,
      );
    return respond({
      ok: true,
      bulletCount: generated.writer.bullets.length,
      hasSummary: Boolean(generated.writer.summary),
    });
  } catch (error) {
    if (error instanceof CanonicalError)
      return respond(
        {
          code: "source_unavailable",
          error:
            "The saved source is unavailable for writing. Reload or start a new analysis.",
        },
        error.status,
      );
    if (error instanceof RewriteError)
      return respond({ code: error.code, error: error.message }, error.status);
    if (error instanceof QualitativeAiFailure)
      return respond(
        {
          code: error.code,
          error:
            error.code === "AI_TIMEOUT"
              ? "Writing generation timed out. Your previous draft is preserved; try again shortly."
              : "The AI provider could not complete writing generation. Your previous draft is preserved.",
        },
        503,
      );
    return respond(
      {
        code: "unavailable",
        error:
          "Writing generation is unavailable. Your previous draft is preserved.",
      },
      503,
    );
  }
}
