import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  CanonicalError,
  ownedAnalysis,
} from "~/lib/server/canonical-repository";
import { assertResumeSource } from "~/lib/server/extract";
import {
  createResumeStorage,
  createResumeStorageKey,
} from "~/lib/server/storage";
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
    "X-Content-Type-Options": "nosniff",
  });
  const notFound = () =>
    new Response("Source not found.", { status: 404, headers });
  if (request.method !== "GET") {
    headers.set("Allow", "GET");
    return new Response(null, { status: 405, headers });
  }
  try {
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user) return notFound();
    const admin = createSupabaseAdminClient();
    const source = await ownedAnalysis(admin, params.id ?? "", user.id);
    const version = await admin
      .from("resume_versions")
      .select("storage_key,checksum,bytes")
      .eq("id", source.resume_version_id)
      .eq("owner_id", user.id)
      .eq("organization_id", source.organization_id)
      .eq("resume_id", source.resumeId)
      .maybeSingle();
    if (version.error) throw new Error("Source unavailable");
    const storageKey = createResumeStorageKey({
      organizationId: source.organization_id,
      resumeId: source.resumeId,
      versionId: source.resume_version_id,
    });
    if (version.data?.storage_key !== storageKey) return notFound();
    const bytes = await createResumeStorage().download(storageKey);
    const current = await ownedAnalysis(admin, params.id ?? "", user.id);
    if (
      current.organization_id !== source.organization_id ||
      current.resumeId !== source.resumeId ||
      current.resume_version_id !== source.resume_version_id
    )
      return notFound();
    if (bytes.byteLength !== version.data.bytes)
      throw new Error("Source length mismatch");
    assertResumeSource(bytes, version.data.bytes, version.data.checksum);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", 'inline; filename="source-resume.pdf"');
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    if (error instanceof CanonicalError && error.status === 404)
      return notFound();
    return new Response("The source PDF is unavailable.", {
      status: error instanceof CanonicalError ? error.status : 503,
      headers,
    });
  }
}
