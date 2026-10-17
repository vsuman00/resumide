import { data } from "react-router";
import { getServerConfig } from "./config";
import { getAuthenticatedUser } from "./auth";
import { createSupabaseServerClient } from "./supabase";
import { CanonicalError } from "./canonical-repository";
import { PublicApiError } from "./errors";
export const privateArtifactHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
  });
export async function artifactIdentity(request: Request, h: Headers) {
  if (!getServerConfig().ARTIFACT_RENDERING_ENABLED)
    throw new CanonicalError(404, "Resume export is not enabled.");
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, h),
  );
  if (!user) throw new CanonicalError(404, "Export workspace not found.");
  return user;
}
export function artifactError(error: unknown, h: Headers) {
  return data(
    {
      error:
        error instanceof CanonicalError || error instanceof PublicApiError
          ? error.message
          : "Resume export is temporarily unavailable.",
      report: null,
      options: null,
    },
    {
      status:
        error instanceof CanonicalError || error instanceof PublicApiError
          ? error.status
          : 503,
      headers: h,
    },
  );
}
