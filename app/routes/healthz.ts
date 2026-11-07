import { requestIdFrom } from "~/lib/server/request-context";

export function loader({ request }: { request: Request }) {
  const requestId = requestIdFrom(request);
  return Response.json(
    { status: "ok" },
    { headers: { "X-Request-Id": requestId } },
  );
}
