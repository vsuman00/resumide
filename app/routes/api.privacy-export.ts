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

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const requestId = requestIdFrom(request);
  if (request.method !== "GET") {
    return methodNotAllowedResponse(requestId, ["GET"]);
  }
  try {
    const headers = new Headers({ "X-Request-Id": requestId });
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
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
    const { data, error } = await createSupabaseAdminClient()
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
    return Response.json(data.result_manifest, {
      headers: {
        ...Object.fromEntries(headers),
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="resumide-export.json"',
      },
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
