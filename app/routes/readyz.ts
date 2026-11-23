import { getServerConfig } from "~/lib/server/config";
import { PublicApiError, toErrorResponse } from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";
import { createSupabaseAdminClient } from "~/lib/server/supabase";

export async function loader({ request }: { request: Request }) {
  const requestId = requestIdFrom(request);

  try {
    const config = getServerConfig();
    const { error } = await createSupabaseAdminClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .abortSignal(AbortSignal.timeout(config.READINESS_TIMEOUT_MS));

    if (error) {
      throw new PublicApiError(
        "SERVICE_UNAVAILABLE",
        "Service is not ready.",
        503,
        true,
      );
    }

    return Response.json(
      { status: "ready" },
      { headers: { "X-Request-Id": requestId } },
    );
  } catch {
    return toErrorResponse(
      new PublicApiError(
        "SERVICE_UNAVAILABLE",
        "Service is not ready.",
        503,
        true,
      ),
      requestId,
    );
  }
}
