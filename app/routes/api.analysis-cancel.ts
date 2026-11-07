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
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";

export function loader({ request }: { request: Request }) {
  return methodNotAllowedResponse(requestIdFrom(request), ["POST"]);
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const requestId = requestIdFrom(request);
  if (request.method !== "POST")
    return methodNotAllowedResponse(requestId, ["POST"]);
  try {
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const headers = new Headers({ "X-Request-Id": requestId });
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in to cancel analysis.",
        401,
      );
    if (!params.id)
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    const { data, error } = await createSupabaseAdminClient().rpc(
      "cancel_analysis",
      {
        p_analysis_id: params.id,
        p_user_id: user.id,
        p_request_id: requestId,
      },
    );
    if (error || data === "not_found")
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    if (data === "already_started") {
      return Response.json(
        {
          status: "already_started",
          message: "Analysis has already started and cannot be cancelled.",
        },
        { status: 409, headers },
      );
    }
    return Response.json(
      { status: "cancelled", alreadyCancelled: data === "already_cancelled" },
      { headers },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
