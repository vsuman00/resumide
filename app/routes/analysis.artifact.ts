import { data } from "react-router";
import { getServerConfig } from "~/lib/server/config";
import { createSupabaseAdminClient } from "~/lib/server/supabase";
import {
  readArtifactForm,
  renderOwnedArtifact,
} from "~/lib/server/artifact-repository";
import { assertSameOrigin } from "~/lib/server/security";
import {
  artifactIdentity,
  artifactError,
  privateArtifactHeaders,
} from "~/lib/server/artifact-route-helpers";
type Args = { request: Request; params: { id?: string } };
export function loader() {
  const h = privateArtifactHeaders();
  h.set("Allow", "POST");
  return data(
    { error: "Use the checked export form." },
    { status: 405, headers: h },
  );
}
export async function action({ request, params }: Args) {
  const h = privateArtifactHeaders();
  try {
    if (request.method !== "POST") {
      h.set("Allow", "POST");
      return data({ error: "Use POST." }, { status: 405, headers: h });
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await artifactIdentity(request, h),
      options = await readArtifactForm(request);
    const result = await renderOwnedArtifact(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      options,
      request.signal,
    );
    if (!result.bytes || result.report.state !== "verified")
      return data(
        { error: "Export verification failed.", report: result.report },
        { status: 422, headers: h },
      );
    h.set(
      "Content-Type",
      options.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    h.set(
      "Content-Disposition",
      `attachment; filename="resume.${options.format}"`,
    );
    h.set("Content-Length", String(result.bytes.length));
    h.set("X-Artifact-SHA256", result.report.artifactSha256!);
    return new Response(new Uint8Array(result.bytes), { headers: h });
  } catch (error) {
    return artifactError(error, h);
  }
}
