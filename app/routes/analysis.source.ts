import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  CanonicalError,
  ownedAnalysis,
} from "~/lib/server/canonical-repository";
import { createResumeStorage } from "~/lib/server/storage";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";

// Reauthorize every open and keep preview requests inside the same-origin CSP.
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  });
  if (request.method !== "GET") {
    headers.set("Allow", "GET");
    return new Response(null, { status: 405, headers });
  }
  try {
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return new Response("Source not found.", { status: 404, headers });
    const admin = createSupabaseAdminClient();
    const source = await ownedAnalysis(admin, params.id ?? "", user.id);
    const version = await admin
      .from("resume_versions")
      .select("storage_key")
      .eq("id", source.resume_version_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (version.error) throw new Error("Source unavailable");
    if (!version.data?.storage_key)
      return new Response("Source not found.", { status: 404, headers });
    if (
      !version.data.storage_key.startsWith(
        `organizations/${source.organization_id}/`,
      )
    )
      return new Response("Source not found.", { status: 404, headers });
    const bytes = await createResumeStorage().download(
      version.data.storage_key,
    );
    await ownedAnalysis(admin, params.id ?? "", user.id);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", 'inline; filename="source-resume.pdf"');
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    return new Response("The source PDF is unavailable.", {
      status: error instanceof CanonicalError ? error.status : 503,
      headers,
    });
  }
}
