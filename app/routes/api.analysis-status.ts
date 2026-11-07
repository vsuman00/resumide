import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  methodNotAllowedResponse,
  PublicApiError,
  toErrorResponse,
} from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";
import { createSupabaseServerClient } from "~/lib/server/supabase";

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const requestId = requestIdFrom(request);
  if (request.method !== "GET")
    return methodNotAllowedResponse(requestId, ["GET"]);
  try {
    const responseHeaders = new Headers({ "X-Request-Id": requestId });
    const client = createSupabaseServerClient(request, responseHeaders);
    const user = await getAuthenticatedUser(client);
    if (!user)
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in to view analysis status.",
        401,
      );
    if (!params.id)
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    const { data, error } = await client
      .from("analyses")
      .select("id, status, stage_updated_at, completed_at")
      .eq("id", params.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error || !data)
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    return Response.json(data, { headers: responseHeaders });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
