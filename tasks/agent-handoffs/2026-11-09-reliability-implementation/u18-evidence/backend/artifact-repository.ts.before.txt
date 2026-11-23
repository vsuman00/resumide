import {
  ArtifactOptionsSchema,
  buildRenderPlan,
  hash,
  type ArtifactOptions,
} from "./artifact-contract";
import { renderArtifact } from "./artifact-renderer";
import { CanonicalError, loadCanonical } from "./canonical-repository";
import { createResumeStorage, createResumeStorageKey } from "./storage";
import { assertSourceLinksPreserved } from "./artifact-source-links";
import type { createSupabaseAdminClient } from "./supabase";
type Client = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
async function checkSourceLinks(
  model: Awaited<ReturnType<typeof loadCanonical>>,
  plan: ReturnType<typeof buildRenderPlan>,
) {
  const current = model.current!;
  try {
    const source = await createResumeStorage().download(
      createResumeStorageKey({
        organizationId: current.document.organizationId,
        resumeId: current.document.resumeId,
        versionId: current.sourceId,
      }),
    );
    if (
      source.byteLength > 10 * 1024 * 1024 ||
      hash(source) !== current.document.inputSha256
    )
      throw new Error("SOURCE_LINK_CHECK_FAILED");
    await assertSourceLinksPreserved(source, plan);
  } catch (error) {
    throw new CanonicalError(
      422,
      error instanceof Error && error.message === "SOURCE_LINKS_NOT_PRESERVED"
        ? "The source PDF contains links missing from this structured resume. Keep using the original PDF until those links can be preserved; this export cannot be verified."
        : "The original PDF could not be checked for preserved links. Retry before exporting.",
    );
  }
}
export async function loadArtifactPreview(
  client: Client,
  analysisId: string,
  ownerId: string,
) {
  const model = await loadCanonical(client, analysisId, ownerId);
  if (!model.current)
    throw new CanonicalError(
      422,
      "Import and review your structured resume before exporting.",
    );
  try {
    const plan = buildRenderPlan(model.current.document);
    await checkSourceLinks(model, plan);
    return {
      analysisId,
      plan,
      headId: model.headId,
    };
  } catch (e) {
    throw new CanonicalError(
      422,
      e instanceof Error ? e.message : "Review your resume before exporting.",
    );
  }
}
export async function renderOwnedArtifact(
  client: Client,
  analysisId: string,
  ownerId: string,
  rawOptions: unknown,
  signal?: AbortSignal,
) {
  const parsed = ArtifactOptionsSchema.safeParse(rawOptions);
  if (!parsed.success)
    throw new CanonicalError(
      422,
      "Choose one supported format, page size, template and saved version.",
    );
  const options = parsed.data;
  const model = await loadCanonical(client, analysisId, ownerId);
  if (
    !model.current ||
    model.headId !== options.versionId ||
    model.current.document.versionId !== options.versionId
  )
    throw new CanonicalError(
      409,
      "Your resume changed. Review the current saved version before exporting.",
    );
  let result;
  await checkSourceLinks(model, buildRenderPlan(model.current.document));
  try {
    result = await renderArtifact(model.current.document, options, signal);
  } catch {
    throw new CanonicalError(
      422,
      "Rendering could not start. Review confirmed content or retry shortly.",
    );
  }
  // Revoke access after a pending deletion, ownership/source change, or edit during rendering.
  const final = await loadCanonical(client, analysisId, ownerId);
  if (
    !final.current ||
    final.headId !== options.versionId ||
    final.current.document.versionId !== options.versionId
  )
    throw new CanonicalError(
      409,
      "Your resume changed during rendering. Review it and retry.",
    );
  if (
    buildRenderPlan(final.current.document).contentHash !==
    result.report.contentHash
  )
    throw new CanonicalError(
      409,
      "Saved content changed during rendering. Review it and retry.",
    );
  return result;
}
export async function readArtifactForm(
  request: Request,
): Promise<ArtifactOptions> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > 2048 || !request.body)
    throw new CanonicalError(422, "Export options are too large or missing.");
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded"))
    throw new CanonicalError(422, "Use the export form.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) {
        await reader.cancel();
        throw new CanonicalError(422, "Export options are too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const params = new URLSearchParams(new TextDecoder().decode(bytes)),
    values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (
      !["versionId", "format", "pageSize", "templateId"].includes(key) ||
      Object.hasOwn(values, key)
    )
      throw new CanonicalError(
        422,
        "Choose distinct supported export options.",
      );
    values[key] = value;
  }
  const parsed = ArtifactOptionsSchema.safeParse(values);
  if (!parsed.success)
    throw new CanonicalError(422, "Choose supported export options.");
  return parsed.data;
}
