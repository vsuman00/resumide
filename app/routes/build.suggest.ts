import { buildSuggestAction } from "~/lib/server/build-assist-service";

export const action = ({ request }: { request: Request }) =>
  buildSuggestAction(request);
export function loader() {
  return Response.json(
    { error: "Use POST to request a suggestion.", code: "method_not_allowed" },
    {
      status: 405,
      headers: {
        Allow: "POST",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie, Origin",
      },
    },
  );
}
