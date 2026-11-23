import { latexAction } from "~/lib/server/latex-converter-service";

export const action = ({ request }: { request: Request }) =>
  latexAction(request);
export function loader() {
  return Response.json(
    { error: "Use POST to compile a document.", code: "method_not_allowed" },
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
