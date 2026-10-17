import { z } from "zod";
import type { createSupabaseAdminClient } from "./supabase";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";
import {
  compareCanonical,
  importCanonicalEvidence,
  reviseCanonical,
  rollbackCanonical,
} from "./canonical-content";
import { loadEvidenceReview } from "./evidence-review";

type Client = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
const id = z.uuid();
const value = z
  .string()
  .min(1)
  .max(2000)
  .refine((text) => text === text.trim());
const base = { expectedVersionId: id.nullable(), idempotencyKey: id };
export const CanonicalCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...base, operation: z.literal("import") }),
  z.strictObject({
    ...base,
    expectedVersionId: id,
    operation: z.literal("edit"),
    factId: id,
    value,
  }),
  z.strictObject({
    ...base,
    expectedVersionId: id,
    operation: z.literal("confirm"),
    factId: id,
  }),
  z.strictObject({
    ...base,
    expectedVersionId: id,
    operation: z.literal("rename_section"),
    sectionId: id,
    value: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    ...base,
    expectedVersionId: id,
    operation: z.literal("rollback"),
    targetVersionId: id,
  }),
]);
export type CanonicalCommand = z.infer<typeof CanonicalCommandSchema>;
export class CanonicalError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new CanonicalError(503, "Structured resume is unavailable. Try again later.");
const missing = () => new CanonicalError(404, "Structured resume not found.");
const rowSchema = z.object({
  id,
  resume_id: id,
  owner_id: id,
  organization_id: id,
  source_resume_version_id: id,
  parent_version_id: id.nullable(),
  revision: z.number().int().positive(),
  content: z.unknown(),
});
function replay(raw: unknown): {
  document: CanonicalResumeDraft;
  revision: number;
  sourceId: string;
} {
  const row = rowSchema.safeParse(raw);
  const document = CanonicalResumeDraftSchema.safeParse(
    row.success ? row.data.content : null,
  );
  if (
    !row.success ||
    !document.success ||
    document.data.versionId !== row.data.id ||
    document.data.resumeId !== row.data.resume_id ||
    document.data.ownerId !== row.data.owner_id ||
    document.data.organizationId !== row.data.organization_id ||
    document.data.parentVersionId !== row.data.parent_version_id
  )
    throw new CanonicalError(
      422,
      "Stored structured content failed integrity checks.",
    );
  return {
    document: document.data,
    revision: row.data.revision,
    sourceId: row.data.source_resume_version_id,
  };
}
export async function ownedAnalysis(
  client: Client,
  analysisId: string,
  ownerId: string,
) {
  if (!id.safeParse(analysisId).success || !id.safeParse(ownerId).success)
    throw missing();
  const result = await client
    .from("analyses")
    .select("id,owner_id,organization_id,resume_version_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (result.error) throw unavailable();
  const analysis = z
    .object({ id, owner_id: id, organization_id: id, resume_version_id: id })
    .safeParse(result.data);
  if (!analysis.success || analysis.data.owner_id !== ownerId) throw missing();
  const source = await client
    .from("resume_versions")
    .select("id,resume_id,owner_id,organization_id")
    .eq("id", analysis.data.resume_version_id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (source.error) throw unavailable();
  const parsed = z
    .object({ id, resume_id: id, owner_id: id, organization_id: id })
    .safeParse(source.data);
  if (
    !parsed.success ||
    parsed.data.organization_id !== analysis.data.organization_id
  )
    throw missing();
  const root = await client
    .from("resumes")
    .select("id")
    .eq("id", parsed.data.resume_id)
    .eq("owner_id", ownerId)
    .eq("organization_id", parsed.data.organization_id)
    .eq("status", "active")
    .maybeSingle();
  const membership = await client
    .from("memberships")
    .select("user_id")
    .eq("organization_id", parsed.data.organization_id)
    .eq("user_id", ownerId)
    .maybeSingle();
  const deletion = await client
    .from("data_requests")
    .select("id")
    .eq("user_id", ownerId)
    .eq("kind", "deletion")
    .neq("status", "failed")
    .limit(1);
  if (root.error || membership.error || deletion.error) throw unavailable();
  if (!root.data || !membership.data || deletion.data?.length) throw missing();
  return { ...analysis.data, resumeId: parsed.data.resume_id };
}
async function version(
  client: Client,
  resumeId: string,
  ownerId: string,
  versionId: string,
) {
  if (!id.safeParse(versionId).success) throw missing();
  const result = await client
    .from("canonical_resume_versions")
    .select("*")
    .eq("id", versionId)
    .eq("resume_id", resumeId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (result.error) throw unavailable();
  if (!result.data) throw missing();
  const parsed = replay(result.data);
  if (
    parsed.document.ownerId !== ownerId ||
    parsed.document.resumeId !== resumeId
  )
    throw missing();
  return parsed;
}
export async function loadCanonical(
  client: Client,
  analysisId: string,
  ownerId: string,
  options: { versionId?: string; offset?: number; compareId?: string } = {},
) {
  const analysis = await ownedAnalysis(client, analysisId, ownerId);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
    throw new CanonicalError(422, "Choose a valid history page.");
  const head = await client
    .from("canonical_resume_heads")
    .select("version_id,revision")
    .eq("resume_id", analysis.resumeId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (head.error) throw unavailable();
  if (!head.data && (options.versionId || options.compareId)) throw missing();
  if (!head.data)
    return {
      analysisId,
      resumeId: analysis.resumeId,
      current: null,
      headId: null,
      history: [],
      nextOffset: null,
      comparison: null,
      scoringEligible: false as const,
    };
  const headValue = z
    .object({ version_id: id, revision: z.number().int().positive() })
    .safeParse(head.data);
  if (!headValue.success) throw unavailable();
  const current = await version(
    client,
    analysis.resumeId,
    ownerId,
    options.versionId ?? headValue.data.version_id,
  );
  if (current.sourceId !== analysis.resume_version_id) throw missing();
  const list = await client
    .from("canonical_resume_versions")
    .select("id,parent_version_id,revision,created_at")
    .eq("resume_id", analysis.resumeId)
    .eq("owner_id", ownerId)
    .order("revision", { ascending: false })
    .range(offset, offset + 20);
  if (list.error) throw unavailable();
  const history = z
    .array(
      z.object({
        id,
        parent_version_id: id.nullable(),
        revision: z.number().int().positive(),
        created_at: z.iso.datetime({ offset: true }),
      }),
    )
    .safeParse(list.data);
  if (!history.success) throw unavailable();
  let comparison: ReturnType<typeof compareCanonical> | null = null;
  if (options.compareId) {
    const other = await version(
      client,
      analysis.resumeId,
      ownerId,
      options.compareId,
    );
    // A root has one serialized lineage; revisions are unique and every child
    // is committed against its current head by the database CAS transaction.
    if (other.sourceId !== current.sourceId) throw missing();
    comparison = compareCanonical(other.document, current.document);
  }
  return {
    analysisId,
    resumeId: analysis.resumeId,
    current: { ...current },
    headId: headValue.data.version_id,
    history: history.data.slice(0, 20),
    nextOffset: history.data.length > 20 ? offset + 20 : null,
    comparison,
    scoringEligible: false as const,
  };
}
export async function mutateCanonical(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
  requestId: string,
) {
  const parsed = CanonicalCommandSchema.safeParse(raw);
  if (!parsed.success)
    throw new CanonicalError(
      422,
      "Submit a valid structured resume operation.",
    );
  const command = parsed.data;
  const analysis = await ownedAnalysis(client, analysisId, ownerId);
  let document: CanonicalResumeDraft;
  if (command.operation === "import") {
    const review = await loadEvidenceReview(client, analysisId, ownerId);
    try {
      document = importCanonicalEvidence(review.evidence, {
        resumeId: analysis.resumeId,
        organizationId: analysis.organization_id,
        ownerId,
      });
    } catch {
      throw new CanonicalError(
        422,
        "This evidence exceeds the structured import limits or failed integrity validation.",
      );
    }
  } else {
    const base = await version(
      client,
      analysis.resumeId,
      ownerId,
      command.expectedVersionId,
    );
    if (base.sourceId !== analysis.resume_version_id) throw missing();
    if (command.operation === "rollback") {
      const target = await version(
        client,
        analysis.resumeId,
        ownerId,
        command.targetVersionId,
      );
      document = rollbackCanonical(base.document, target.document);
    } else {
      try {
        document = reviseCanonical(base.document, command);
      } catch {
        throw new CanonicalError(
          422,
          "Choose an existing fact and a valid value.",
        );
      }
    }
  }
  const input = {
    ...(command.operation === "rename_section"
      ? { sectionId: command.sectionId }
      : {}),
    operation: command.operation,
    expectedVersionId: command.expectedVersionId,
    idempotencyKey: command.idempotencyKey,
    factId: "factId" in command ? command.factId : null,
    value: "value" in command ? command.value : null,
    targetVersionId:
      "targetVersionId" in command ? command.targetVersionId : null,
  };
  const result = await client.rpc("save_canonical_version", {
    p_user_id: ownerId,
    p_source_id: analysis.resume_version_id,
    p_body: document,
    p_command: input,
    p_request_id: requestId,
  });
  if (result.error) {
    if (["22023", "22P02", "23514"].includes(result.error.code))
      throw new CanonicalError(
        422,
        "The change failed content or provenance validation.",
      );
    throw unavailable();
  }
  if (result.data?.status === "not_found") throw missing();
  if (result.data?.status === "conflict")
    throw new CanonicalError(
      409,
      "This resume changed or the submission key was reused. Reload and review the latest version.",
    );
  const applied = z
    .object({
      status: z.literal("applied"),
      versionId: id,
      revision: z.number().int().positive(),
      idempotent: z.boolean(),
    })
    .safeParse(result.data);
  if (!applied.success) throw unavailable();
  return { ...applied.data, scoringEligible: false as const };
}

export async function readCanonicalForm(
  request: Request,
): Promise<CanonicalCommand> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded(?:;|$)/iu.test(contentType))
    throw new CanonicalError(422, "Submit the structured resume form.");
  const reader = request.body?.getReader();
  if (!reader) throw new CanonicalError(422, "Submit a form.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384)
        throw new CanonicalError(422, "The form exceeds its size limit.");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new CanonicalError(422, "The form contains invalid text.");
  }
  const values: Record<string, string | null> = {};
  const allowed = new Set([
    "operation",
    "expectedVersionId",
    "idempotencyKey",
    "factId",
    "value",
    "targetVersionId",
    "sectionId",
  ]);
  for (const [key, value] of new URLSearchParams(text)) {
    if (!allowed.has(key) || Object.hasOwn(values, key))
      throw new CanonicalError(422, "Duplicate form fields are invalid.");
    values[key] = value;
  }
  if (values.expectedVersionId === "") values.expectedVersionId = null;
  const result = CanonicalCommandSchema.safeParse(values);
  if (!result.success)
    throw new CanonicalError(
      422,
      "Submit a valid structured resume operation.",
    );
  return result.data;
}
