import { createHash } from "node:crypto";
import { LATEX_LIMITS } from "../latex-converter";
import { getServerConfig } from "./config";
import { getAuthenticatedUser } from "./auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import { LatexSourceError, prepareLatexDocument } from "./latex-source";
import { compileLatex, LatexSandboxError } from "./latex-sandbox";
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Origin",
  });
function secureHeaders(headers: Headers) {
  for (const [key, value] of privateHeaders()) headers.set(key, value);
}
function error(
  headers: Headers,
  code: string,
  message: string,
  status: number,
) {
  secureHeaders(headers);
  return Response.json({ error: message, code }, { status, headers });
}
export async function latexLoader(request: Request) {
  const headers = privateHeaders();
  try {
    const config = getServerConfig();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user) {
      secureHeaders(headers);
      headers.set("Location", "/auth?next=%2Fbuild");
      return new Response(null, { status: 302, headers });
    }
    secureHeaders(headers);
    return Response.json(
      {
        enabled: config.LATEX_CONVERTER_ENABLED,
        aiEnabled:
          config.LATEX_CONVERTER_ENABLED &&
          config.BUILD_AI_ASSIST_ENABLED &&
          config.AI_ENABLED,
      },
      { headers },
    );
  } catch {
    return error(
      headers,
      "runtime_unavailable",
      "The converter is unavailable.",
      503,
    );
  }
}
async function boundedJson(request: Request): Promise<unknown> {
  const max = LATEX_LIMITS.sourceBytes * 6 + 1024;
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
    throw new LatexSourceError("source_too_large");
  if (!request.body) throw new LatexSourceError("source_invalid");
  const reader = request.body.getReader();
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (deadline.aborted) {
      abort();
      throw new LatexSourceError("source_invalid");
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (deadline.aborted) throw new LatexSourceError("source_invalid");
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        abort();
        throw new LatexSourceError("source_too_large");
      }
      chunks.push(value);
    }
  } finally {
    deadline.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new LatexSourceError("source_invalid");
  }
}
export async function latexAction(request: Request): Promise<Response> {
  const headers = privateHeaders();
  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return error(
      headers,
      "method_not_allowed",
      "Use POST to compile a document.",
      405,
    );
  }
  try {
    const config = getServerConfig();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return error(
        headers,
        "unauthenticated",
        "Sign in to use the converter.",
        401,
      );
    if (!config.LATEX_CONVERTER_ENABLED)
      return error(headers, "disabled", "The converter is not enabled.", 404);
    const origin = request.headers.get("Origin");
    if (
      origin !== new URL(config.APP_ORIGIN).origin ||
      new URL(request.url).origin !== new URL(config.APP_ORIGIN).origin ||
      (request.headers.get("Sec-Fetch-Site") &&
        request.headers.get("Sec-Fetch-Site") !== "same-origin")
    )
      return error(
        headers,
        "forbidden",
        "Open the converter from this site.",
        403,
      );
    if (
      request.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return error(
        headers,
        "source_invalid",
        "Send LaTeX source as JSON.",
        415,
      );
    // Deployment-wide metadata buckets are separate from all analysis budget keys.
    const admin = createSupabaseAdminClient();
    for (const [key, limit] of [
      [`latex:user:${createHash("sha256").update(user.id).digest("hex")}`, 3],
      ["latex:global:v1", 20],
    ] as const) {
      const { data: allowed, error: failure } = await admin.rpc(
        "consume_analysis_rate_limit",
        { p_key: key, p_limit: limit, p_window_seconds: 60 },
      );
      if (failure)
        return error(
          headers,
          "runtime_unavailable",
          "The converter is unavailable.",
          503,
        );
      if (allowed !== true) {
        headers.set("Retry-After", "60");
        return error(
          headers,
          "rate_limited",
          "Too many compilation requests. Try again later.",
          429,
        );
      }
    }
    const prepared = prepareLatexDocument(await boundedJson(request));
    const result = await compileLatex(prepared, {
      imageId: config.LATEX_COMPILER_IMAGE,
      signal: request.signal,
    });
    secureHeaders(headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", 'attachment; filename="document.pdf"');
    headers.set("X-Latex-Pages", String(result.pages));
    headers.set("Content-Length", String(result.pdf.byteLength));
    return new Response(new Uint8Array(result.pdf), { headers });
  } catch (failure) {
    if (failure instanceof LatexSourceError)
      return error(
        headers,
        failure.code,
        failure.message,
        failure.code === "source_too_large" ? 413 : 400,
      );
    if (failure instanceof LatexSandboxError)
      return error(
        headers,
        failure.code,
        failure.message,
        failure.code === "busy"
          ? 429
          : failure.code === "cancelled"
            ? 409
            : ["runtime_unavailable", "cleanup_failed"].includes(failure.code)
              ? 503
              : 422,
      );
    return error(
      headers,
      "runtime_unavailable",
      "The converter is unavailable.",
      503,
    );
  }
}
