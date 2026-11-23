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
import { z } from "zod";

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function loader({ request }: { request: Request }) {
  return privateResponse(
    methodNotAllowedResponse(requestIdFrom(request), ["POST"]),
  );
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
    return privateResponse(methodNotAllowedResponse(requestId, ["POST"]));
  const headers = new Headers({ "X-Request-Id": requestId });
  try {
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw new PublicApiError(
        "UNAUTHENTICATED",
        "Sign in to cancel analysis.",
        401,
      );
    if (!z.uuid().safeParse(params.id).success)
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    const unavailable = () =>
      new PublicApiError(
        "SERVICE_UNAVAILABLE",
        "Analysis cancellation is unavailable. Try again shortly.",
        503,
        true,
      );
    let result: unknown;
    try {
      result = await createSupabaseAdminClient().rpc("cancel_owned_analysis", {
        p_analysis_id: params.id,
        p_user_id: user.id,
        p_request_id: requestId,
      });
    } catch {
      throw unavailable();
    }
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !("data" in result) ||
      !("error" in result) ||
      result.error !== null
    )
      throw unavailable();
    const data = result.data;
    if (data === "not_found")
      throw new PublicApiError("NOT_FOUND", "Analysis not found.", 404);
    if (data === "already_started") {
      return privateResponse(
        Response.json(
          {
            status: "already_started",
            message: "Analysis has already started and cannot be cancelled.",
          },
          { status: 409, headers },
        ),
      );
    }
    if (data !== "cancelled" && data !== "already_cancelled")
      throw unavailable();
    return privateResponse(
      Response.json(
        { status: "cancelled", alreadyCancelled: data === "already_cancelled" },
        { headers },
      ),
    );
  } catch (error) {
    const response = toErrorResponse(error, requestId);
    for (const cookie of headers.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    return privateResponse(response);
  }
}
