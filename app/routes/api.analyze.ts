import { createQueuedAnalysis } from "~/lib/server/analysis-ingestion";
import {
  analysisRateLimitKey,
  parseBoundedAnalyzeFormData,
} from "~/lib/server/analyze-request";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { getServerConfig, getUploadConfig } from "~/lib/server/config";
import { assertSameOrigin } from "~/lib/server/security";
import {
  methodNotAllowedResponse,
  PublicApiError,
  toErrorResponse,
} from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";

import {
  recordAuditEvent,
  requireAndRecordAiConsent,
} from "~/lib/server/privacy";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import {
  validateJobDetails,
  validatePdfUpload,
} from "~/lib/server/upload-validation";

// React Router resource route. POST FormData:
//   file: PDF
//   jobTitle: string
//   jobDescription: string
// Returns: { feedback: Feedback }
export function loader({ request }: { request: Request }) {
  return methodNotAllowedResponse(requestIdFrom(request), ["POST"]);
}

export async function action({ request }: { request: Request }) {
  const requestId = requestIdFrom(request);
  if (request.method !== "POST") {
    return methodNotAllowedResponse(requestId, ["POST"]);
  }

  try {
    const config = getUploadConfig();
    const serverConfig = getServerConfig();
    assertSameOrigin(request, serverConfig.APP_ORIGIN);

    const responseHeaders = new Headers({ "X-Request-Id": requestId });
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, responseHeaders),
    );
    if (!user) {
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in before analyzing a resume.",
        401,
      );
    }

    const { data: allowed, error: rateLimitError } =
      await createSupabaseAdminClient().rpc("consume_analysis_rate_limit", {
        p_key: analysisRateLimitKey(user.id),
        p_limit: serverConfig.ANALYZE_RATE_LIMIT,
        p_window_seconds: serverConfig.ANALYZE_RATE_WINDOW_SECONDS,
      });
    if (rateLimitError) {
      throw new PublicApiError(
        "SERVICE_UNAVAILABLE",
        "The analysis service is unavailable.",
        503,
        true,
      );
    }
    if (allowed !== true) {
      throw new PublicApiError(
        "RATE_LIMITED",
        "Too many analysis requests. Try again later.",
        429,
        true,
        serverConfig.ANALYZE_RATE_WINDOW_SECONDS,
      );
    }
    const form = await parseBoundedAnalyzeFormData(
      request,
      config.MAX_UPLOAD_BYTES,
    );
    const file = form.get("file");
    const jobTitle = (form.get("jobTitle") as string | null) ?? "";
    const jobDescription = (form.get("jobDescription") as string | null) ?? "";
    const idempotencyKey = (form.get("idempotencyKey") as string | null) ?? "";
    const consentAccepted = form.get("aiConsent") === "accepted";
    if (!(file instanceof File)) {
      throw new PublicApiError(
        "INVALID_REQUEST",
        "A PDF file is required.",
        400,
      );
    }

    validateJobDetails(jobTitle, jobDescription, {
      maxTitleCharacters: config.MAX_JOB_TITLE_CHARACTERS,
      maxDescriptionCharacters: config.MAX_JOB_DESCRIPTION_CHARACTERS,
    });
    const buffer = await validatePdfUpload(file, config.MAX_UPLOAD_BYTES);
    await requireAndRecordAiConsent({
      userId: user.id,
      accepted: consentAccepted,
      requestId,
    });
    const persisted = await createQueuedAnalysis({
      userId: user.id,
      fileName: file.name,
      pdf: buffer,
      jobTitle,
      jobDescription,
      idempotencyKey,
      requestId,
    });
    const id = persisted.analysisId;
    await recordAuditEvent({
      userId: user.id,
      action: "analysis.queued",
      targetType: "analysis",
      targetId: id,
      requestId,
    });
    return Response.json(
      { id, status: "quarantined" },
      { status: 202, headers: responseHeaders },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
