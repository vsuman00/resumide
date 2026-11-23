import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  methodNotAllowedResponse,
  PublicApiError,
  toErrorResponse,
} from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { AnalysisStatuses } from "~/lib/server/analysis-state";
import { readCandidatePrivacyAccess } from "~/lib/server/privacy-deletion-policy";
import { z } from "zod";

export type AnalysisRecovery =
  | "text_pdf_required"
  | "ocr_unavailable"
  | "ocr_failed"
  | "ocr_incomplete"
  | "native_review"
  | "ocr_review"
  | "review_status_unavailable";

export type AnalysisQueueActivity = "recent_check" | "no_recent_check";

const analysisRow = z.object({
  id: z.string(),
  owner_id: z.string(),
  organization_id: z.string(),
  resume_version_id: z.string(),
  resume_versions: z.object({
    id: z.string(),
    owner_id: z.string(),
    organization_id: z.string(),
    resume_id: z.string(),
    resumes: z.object({
      id: z.string(),
      owner_id: z.string(),
      organization_id: z.string(),
      status: z.literal("active"),
    }),
  }),
  status: z.enum(AnalysisStatuses),
  stage_updated_at: z.string(),
  completed_at: z.string().nullable(),
});
const ocrFailures = new Set([
  "timeout",
  "cancelled",
  "resource_limit",
  "engine_failure",
  "invalid_request",
  "invalid_output",
]);

async function readRecovery(
  client: ReturnType<typeof createSupabaseServerClient>,
  analysis: z.infer<typeof analysisRow>,
  signal: AbortSignal,
): Promise<AnalysisRecovery> {
  const { data, error } = await client
    .from("document_evidence_attempts")
    .select(
      "analysis_id,owner_id,resume_version_id,evidence_status:envelope->>status,failure_code:envelope->ocrFailure->>code,recognized_status:envelope->ocrSource->>status",
    )
    .eq("analysis_id", analysis.id)
    .eq("owner_id", analysis.owner_id)
    .eq("resume_version_id", analysis.resume_version_id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(2_000)]))
    .maybeSingle();
  if (error) return "review_status_unavailable";
  if (!data) return "text_pdf_required";
  if (
    data.analysis_id !== analysis.id ||
    data.owner_id !== analysis.owner_id ||
    data.resume_version_id !== analysis.resume_version_id
  )
    return "review_status_unavailable";
  if (data.recognized_status === null) {
    if (
      data.evidence_status === "unsupported" &&
      data.failure_code === "unsupported"
    )
      return "ocr_unavailable";
    if (
      data.evidence_status === "failed" &&
      typeof data.failure_code === "string" &&
      ocrFailures.has(data.failure_code)
    )
      return "ocr_failed";
    if (
      data.evidence_status === "review_required" &&
      data.failure_code === null
    )
      return "native_review";
  } else if (data.failure_code === null) {
    if (
      data.evidence_status === "review_required" &&
      data.recognized_status === "review_required"
    )
      return "ocr_review";
    if (
      ["review_required", "insufficient"].includes(
        data.evidence_status ?? "",
      ) &&
      data.recognized_status === "insufficient"
    )
      return "ocr_incomplete";
  }
  return "review_status_unavailable";
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const requestId = requestIdFrom(request);
  const responseHeaders = new Headers({ "X-Request-Id": requestId });
  const privateResponse = (response: Response) => {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  if (request.method !== "GET")
    return privateResponse(methodNotAllowedResponse(requestId, ["GET"]));
  try {
    const client = createSupabaseServerClient(request, responseHeaders);
    const user = await getAuthenticatedUser(client);
    if (!user)
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in to view analysis status.",
        401,
      );
    const notFound = () =>
      new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    const analysisId = params.id;
    if (!analysisId) throw notFound();
    const readStatus = async () => {
      const { data, error } = await client
        .from("analyses")
        .select(
          "id, owner_id, organization_id, resume_version_id, status, stage_updated_at, completed_at, resume_versions!inner(id, owner_id, organization_id, resume_id, resumes!resume_versions_resume_id_fkey!inner(id, owner_id, organization_id, status))",
        )
        .eq("id", analysisId)
        .eq("owner_id", user.id)
        .eq("resume_versions.owner_id", user.id)
        .eq("resume_versions.resumes.owner_id", user.id)
        .eq("resume_versions.resumes.status", "active")
        .abortSignal(request.signal)
        .maybeSingle();
      const analysis = analysisRow.safeParse(data);
      if (
        error ||
        !analysis.success ||
        analysis.data.id !== analysisId ||
        analysis.data.owner_id !== user.id
      )
        throw notFound();
      const source = analysis.data.resume_versions;
      const resume = source.resumes;
      if (
        source.id !== analysis.data.resume_version_id ||
        source.owner_id !== user.id ||
        source.organization_id !== analysis.data.organization_id ||
        resume.id !== source.resume_id ||
        resume.owner_id !== user.id ||
        resume.organization_id !== analysis.data.organization_id
      )
        throw notFound();
      return analysis.data;
    };

    const initial = await readStatus();
    const admin = createSupabaseAdminClient();
    const requireAccess = async () => {
      const access = await readCandidatePrivacyAccess(admin, user.id, {
        signal: request.signal,
      });
      if (access.state === "blocked") throw notFound();
      if (access.state === "unavailable")
        throw new PublicApiError(
          "SERVICE_UNAVAILABLE",
          "Analysis status is unavailable. Try again.",
          503,
          true,
        );
    };
    await requireAccess();
    let current = initial;
    let recovery: AnalysisRecovery | undefined;
    let queueActivity: AnalysisQueueActivity | undefined;
    if (initial.status === "quarantined" || initial.status === "queued") {
      const observation = await admin
        .rpc("read_owned_analysis_queue_observation", {
          p_analysis_id: analysisId,
          p_user_id: user.id,
        })
        .abortSignal(
          AbortSignal.any([request.signal, AbortSignal.timeout(1_000)]),
        )
        .then(
          ({ data, error }) => (error ? null : data),
          () => null,
        );
      if (observation === "not_found") throw notFound();
      if (observation === "recent_check" || observation === "no_recent_check")
        queueActivity = observation;
    }
    if (initial.status === "needs_ocr") {
      recovery = await readRecovery(client, initial, request.signal);
      current = await readStatus();
      if (
        current.resume_version_id !== initial.resume_version_id ||
        current.organization_id !== initial.organization_id ||
        current.resume_versions.resume_id !== initial.resume_versions.resume_id
      )
        throw notFound();
      await requireAccess();
      if (current.status !== "needs_ocr") recovery = undefined;
      else if (current.stage_updated_at !== initial.stage_updated_at)
        recovery = "review_status_unavailable";
    }
    const { id, status, stage_updated_at, completed_at } = current;
    return privateResponse(
      Response.json(
        { id, status, stage_updated_at, completed_at, recovery, queueActivity },
        { headers: responseHeaders },
      ),
    );
  } catch (error) {
    const response = toErrorResponse(error, requestId);
    for (const cookie of responseHeaders.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    return privateResponse(response);
  }
}
