import { redirect } from "react-router";
import type { Route } from "./+types/auth.logout";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";
import { requestIdFrom } from "~/lib/server/request-context";
import {
  methodNotAllowedResponse,
  PublicApiError,
  toErrorResponse,
} from "~/lib/server/errors";

export function loader({ request }: Route.LoaderArgs) {
  return methodNotAllowedResponse(requestIdFrom(request), ["POST"]);
}

export async function action({ request }: Route.ActionArgs) {
  const requestId = requestIdFrom(request);
  if (request.method !== "POST") {
    return methodNotAllowedResponse(requestId, ["POST"]);
  }
  try {
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const responseHeaders = new Headers();
    const client = createSupabaseServerClient(request, responseHeaders);
    const { error } = await client.auth.signOut();
    if (error) {
      const response = toErrorResponse(
        new PublicApiError(
          "SERVICE_UNAVAILABLE",
          "Sign-out could not be confirmed.",
          503,
          true,
        ),
        requestId,
      );
      for (const cookie of responseHeaders.getSetCookie())
        response.headers.append("Set-Cookie", cookie);
      return response;
    }
    return redirect("/", { headers: responseHeaders });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
