import {
  methodNotAllowedResponse,
  PublicApiError,
  toErrorResponse,
} from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";
import {
  parseClientTelemetry,
  recordClientTelemetry,
} from "~/lib/server/observability";

export function loader({ request }: { request: Request }) {
  return methodNotAllowedResponse(requestIdFrom(request), ["POST"]);
}

export async function action({ request }: { request: Request }) {
  const requestId = requestIdFrom(request);
  if (request.method !== "POST") {
    return methodNotAllowedResponse(requestId, ["POST"]);
  }
  try {
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > 8_192) {
      throw new PublicApiError(
        "PAYLOAD_TOO_LARGE",
        "Telemetry payload is too large.",
        413,
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new PublicApiError(
        "INVALID_REQUEST",
        "Telemetry payload is invalid.",
        400,
      );
    }
    const event = parseClientTelemetry(body);
    if (!event) {
      throw new PublicApiError(
        "INVALID_REQUEST",
        "Telemetry payload is invalid.",
        400,
      );
    }
    recordClientTelemetry(event);
    return new Response(null, {
      status: 204,
      headers: { "X-Request-Id": requestId },
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
