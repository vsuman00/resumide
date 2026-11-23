import { authResponseHeaders, getAuthenticatedUser } from "~/lib/server/auth";
import { readCandidatePrivacyAccess } from "~/lib/server/privacy-deletion-policy";
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

async function requireExportAccess(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  signal: AbortSignal,
) {
  const { state } = await readCandidatePrivacyAccess(admin, userId, { signal });
  if (state === "unavailable") {
    throw new PublicApiError(
      "SERVICE_UNAVAILABLE",
      "Privacy access is unavailable. Try again later.",
      503,
      true,
    );
  }
  if (state === "blocked") {
    throw new PublicApiError("NOT_FOUND", "Export not found.", 404);
  }
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const requestId = requestIdFrom(request);
  const sessionHeaders = new Headers();
  const privateResponse = (response: Response) => {
    const headers = authResponseHeaders(sessionHeaders);
    for (const [name, value] of headers) {
      if (name !== "set-cookie") response.headers.set(name, value);
    }
    for (const cookie of headers.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    return response;
  };
  if (request.method !== "GET") {
    return privateResponse(methodNotAllowedResponse(requestId, ["GET"]));
  }
  try {
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, sessionHeaders),
    );
    if (!user) {
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in to download your export.",
        401,
      );
    }
    if (!params.id) {
      throw new PublicApiError("NOT_FOUND", "Export not found.", 404);
    }
    const admin = createSupabaseAdminClient();
    await requireExportAccess(admin, user.id, request.signal);
    const { data, error } = await admin
      .from("data_requests")
      .select("id, result_manifest")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .eq("kind", "export")
      .eq("status", "completed")
      .maybeSingle();
    if (error || !data?.result_manifest) {
      throw new PublicApiError("NOT_FOUND", "Export not found.", 404);
    }
    await requireExportAccess(admin, user.id, request.signal);
    return privateResponse(
      Response.json(data.result_manifest, {
        headers: {
          "X-Request-Id": requestId,
          "Content-Disposition": 'attachment; filename="resumide-export.json"',
        },
      }),
    );
  } catch (error) {
    return privateResponse(toErrorResponse(error, requestId));
  }
}
