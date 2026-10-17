import { data, redirect } from "react-router";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { CanonicalError } from "~/lib/server/canonical-repository";
import {
  applyAuthoring,
  readAuthoringForm,
} from "~/lib/server/authoring-repository";
import { assertSameOrigin } from "~/lib/server/security";
import { PublicApiError } from "~/lib/server/errors";
import { loader as scoreLoader } from "./analysis.score";
export { default, headers, meta, ErrorBoundary } from "./analysis.score";
type Args = { request: Request; params: { id?: string } };
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
export function loader(args: Args) {
  if (!getServerConfig().AUTHORING_ENABLED)
    throw data(
      { error: "Authoring is not enabled." },
      { status: 404, headers: privateHeaders() },
    );
  return scoreLoader(args);
}
export async function action({ request, params }: Args) {
  const h = privateHeaders();
  let submitted;
  try {
    if (!getServerConfig().AUTHORING_ENABLED)
      throw new CanonicalError(404, "Authoring is not enabled.");
    if (request.method !== "POST") {
      h.set("Allow", "POST");
      return data({ error: "Use POST." }, { status: 405, headers: h });
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, h),
    );
    if (!user) throw new CanonicalError(404, "Authoring workspace not found.");
    submitted = await readAuthoringForm(request);
    await applyAuthoring(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      submitted,
      crypto.randomUUID(),
    );
    const focus =
      "targetFactId" in submitted
        ? submitted.targetFactId
        : "patch" in submitted
          ? submitted.patch.targetFactId
          : null;
    return redirect(
      `/analysis/${params.id}/score${focus && ["clarify", "accept", "reject"].includes(submitted.action) ? `?focus=${focus}` : ""}`,
      { headers: h },
    );
  } catch (e) {
    return data(
      {
        error:
          e instanceof CanonicalError || e instanceof PublicApiError
            ? e.message
            : "Your save could not be confirmed. Retry the same submission.",
        submitted,
      },
      {
        status:
          e instanceof CanonicalError || e instanceof PublicApiError
            ? e.status
            : 503,
        headers: h,
      },
    );
  }
}
