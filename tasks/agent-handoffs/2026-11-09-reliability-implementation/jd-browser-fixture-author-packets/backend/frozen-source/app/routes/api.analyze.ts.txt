import { createHash } from "node:crypto";
import {
  createQueuedAnalysis,
  AnalysisAdmissionError,
  ANALYSIS_ADMISSION_POLICY_VERSION,
} from "~/lib/server/analysis-ingestion";
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
  AI_CONSENT_POLICY_VERSION,
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
      bindingEnabled: serverConfig.ANALYSIS_ADMISSION_BINDING_ENABLED,
      requestPolicySha256: serverConfig.ANALYSIS_ADMISSION_BINDING_ENABLED
        ? createHash("sha256")
            .update(
              JSON.stringify({
                admission: ANALYSIS_ADMISSION_POLICY_VERSION,
                consent: AI_CONSENT_POLICY_VERSION,
                upload: config,
                nativeEvidence: serverConfig.NATIVE_EVIDENCE_ENABLED,
                evidenceReview: serverConfig.EVIDENCE_REVIEW_ENABLED,
                nativeLayout: serverConfig.NATIVE_LAYOUT_ENABLED,
                maxPdfPages: serverConfig.MAX_PDF_PAGES,
                maxExtractedCharacters: serverConfig.MAX_EXTRACTED_CHARACTERS,
                extractionTimeoutMs: serverConfig.EXTRACTION_TIMEOUT_MS,
                scoring: serverConfig.SCORING_V2_ENABLED,
                jobIntelligence: serverConfig.JOB_INTELLIGENCE_ENABLED,
                ai: serverConfig.AI_ENABLED,
                model: serverConfig.OPENAI_MODEL,
                outputTokens: serverConfig.OPENAI_MAX_OUTPUT_TOKENS,
                budgetEnabled: serverConfig.AI_BUDGET_ENABLED,
                budgetPolicy: serverConfig.AI_BUDGET_POLICY_VERSION,
              }),
            )
            .digest("hex")
        : undefined,
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
    if (error instanceof AnalysisAdmissionError) {
      const status =
        error.code === "ADMISSION_CONFLICT"
          ? 409
          : error.code === "ADMISSION_DENIED"
            ? 403
            : error.code === "ADMISSION_INVALID"
              ? 400
              : 503;
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            retryable: status === 503,
            requestId,
          },
        },
        {
          status,
          headers: {
            "X-Request-Id": requestId,
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    return toErrorResponse(error, requestId);
  }
}
