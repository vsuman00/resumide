import { PublicApiError, toErrorResponse } from "~/lib/server/errors";
import { requestIdFrom } from "~/lib/server/request-context";

function notFound(request: Request) {
  return toErrorResponse(
    new PublicApiError("NOT_FOUND", "API endpoint not found.", 404),
    requestIdFrom(request),
  );
}

export function loader({ request }: { request: Request }) {
  return notFound(request);
}

export function action({ request }: { request: Request }) {
  return notFound(request);
}
