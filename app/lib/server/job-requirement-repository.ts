import { z } from "zod";
import type { createSupabaseAdminClient } from "./supabase";
import {
  JobRequirementsSchema,
  parseJobRequirements,
} from "./job-requirements";
import { CanonicalError } from "./canonical-repository";
import { domainFromJobTitle } from "./job-domain";
type Client = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
const id = z.uuid();
export const JobRequirementCommandSchema = z.strictObject({
  expectedVersionId: id.nullable(),
  idempotencyKey: id,
});
const missing = () => new CanonicalError(404, "Job requirements not found.");
const unavailable = () =>
  new CanonicalError(503, "Job requirements are unavailable.");
async function ownedJob(client: Client, analysisId: string, ownerId: string) {
  if (!id.safeParse(analysisId).success || !id.safeParse(ownerId).success)
    throw missing();
  const result = await client
    .from("analyses")
    .select("id,job_id,resume_version_id,owner_id,organization_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (result.error) throw unavailable();
  const parsed = z
    .object({
      id,
      job_id: id.nullable(),
      resume_version_id: id,
      owner_id: id,
      organization_id: id,
    })
    .safeParse(result.data);
  if (!parsed.success || !parsed.data.job_id) throw missing();
  const a = parsed.data;
  const [job, source, membership, deletion] = await Promise.all([
    client
      .from("jobs")
      .select("id,title,description,owner_id,organization_id")
      .eq("id", a.job_id!)
      .eq("owner_id", ownerId)
      .eq("organization_id", a.organization_id)
      .maybeSingle(),
    client
      .from("resume_versions")
      .select("resume_id")
      .eq("id", a.resume_version_id)
      .eq("owner_id", ownerId)
      .eq("organization_id", a.organization_id)
      .maybeSingle(),
    client
      .from("memberships")
      .select("user_id")
      .eq("user_id", ownerId)
      .eq("organization_id", a.organization_id)
      .maybeSingle(),
    client
      .from("data_requests")
      .select("id")
      .eq("user_id", ownerId)
      .eq("kind", "deletion")
      .neq("status", "failed")
      .limit(1),
  ]);
  if ([job, source, membership, deletion].some((r) => r.error))
    throw unavailable();
  if (!job.data || !source.data || !membership.data || deletion.data?.length)
    throw missing();
  const root = await client
    .from("resumes")
    .select("id")
    .eq("id", source.data.resume_id)
    .eq("owner_id", ownerId)
    .eq("organization_id", a.organization_id)
    .eq("status", "active")
    .maybeSingle();
  if (root.error) throw unavailable();
  if (!root.data) throw missing();
  const text = z.string().max(20000).safeParse(job.data.description);
  if (!text.success)
    throw new CanonicalError(422, "The JD exceeds the supported limit.");
  return {
    analysis: a,
    sourceText: text.data,
    domain: domainFromJobTitle(job.data.title),
  };
}
export async function loadJobRequirements(
  client: Client,
  analysisId: string,
  ownerId: string,
  options: { versionId?: string; offset?: number } = {},
) {
  const { analysis, sourceText } = await ownedJob(client, analysisId, ownerId);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
    throw new CanonicalError(422, "Choose a valid history page.");
  if (options.versionId && !id.safeParse(options.versionId).success)
    throw missing();
  const versions = await client
    .from("job_requirement_versions")
    .select("id,revision,parent_version_id,created_at")
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("revision", { ascending: false })
    .range(offset, offset + 20);
  const head = await client
    .from("job_requirement_versions")
    .select("id,revision")
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versions.error || head.error) throw unavailable();
  const chosen = options.versionId ?? head.data?.id;
  if (!chosen)
    return {
      analysisId,
      sourceText,
      current: null,
      headId: null,
      history: [],
      nextOffset: null,
      scoringEligible: false as const,
    };
  const row = await client
    .from("job_requirement_versions")
    .select("*")
    .eq("id", chosen)
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (row.error) throw unavailable();
  if (!row.data) throw missing();
  const doc = JobRequirementsSchema.safeParse(row.data.content);
  if (
    !doc.success ||
    doc.data.id !== row.data.id ||
    doc.data.ownerId !== ownerId ||
    doc.data.organizationId !== analysis.organization_id ||
    doc.data.analysisId !== analysisId ||
    doc.data.jobId !== analysis.job_id ||
    doc.data.parentVersionId !== row.data.parent_version_id
  )
    throw new CanonicalError(
      422,
      "Stored requirements failed integrity checks.",
    );
  return {
    analysisId,
    sourceText: doc.data.sourceText,
    current: { document: doc.data, revision: row.data.revision as number },
    headId: head.data?.id as string,
    history: versions.data!.slice(0, 20) as Array<{
      id: string;
      revision: number;
      parent_version_id: string | null;
      created_at: string;
    }>,
    nextOffset: versions.data!.length > 20 ? offset + 20 : null,
    scoringEligible: false as const,
  };
}
export async function saveJobRequirements(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
  requestId: string,
) {
  const command = JobRequirementCommandSchema.safeParse(raw);
  if (!command.success)
    throw new CanonicalError(422, "Submit a valid requirement request.");
  const { analysis, sourceText, domain } = await ownedJob(
    client,
    analysisId,
    ownerId,
  );
  let body;
  try {
    body = parseJobRequirements(sourceText, {
      ownerId,
      organizationId: analysis.organization_id,
      analysisId,
      jobId: analysis.job_id!,
      domain,
      parentVersionId: command.data.expectedVersionId,
    });
  } catch {
    throw new CanonicalError(422, "The JD exceeds parsing limits.");
  }
  const result = await client.rpc("save_job_requirements", {
    p_user_id: ownerId,
    p_analysis_id: analysisId,
    p_body: body,
    p_expected_version: command.data.expectedVersionId,
    p_idempotency_key: command.data.idempotencyKey,
    p_request_id: requestId,
  });
  if (result.error) {
    if (["22023", "23514", "22P02"].includes(result.error.code))
      throw new CanonicalError(
        422,
        "The requirements failed provenance validation.",
      );
    throw unavailable();
  }
  if (result.data?.status === "not_found") throw missing();
  if (result.data?.status === "conflict")
    throw new CanonicalError(
      409,
      "The JD version changed. Reload before retrying.",
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
  return applied.data;
}
export async function readJobRequirementForm(request: Request) {
  if (
    !/^application\/x-www-form-urlencoded(?:;|$)/iu.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new CanonicalError(422, "Submit the requirement form.");
  const reader = request.body?.getReader();
  if (!reader) throw new CanonicalError(422, "Submit the requirement form.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024)
        throw new CanonicalError(422, "The form exceeds its size limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof CanonicalError) throw error;
    throw new CanonicalError(422, "Invalid form text.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const input: Record<string, string | null> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (
      !["expectedVersionId", "idempotencyKey"].includes(key) ||
      Object.hasOwn(input, key)
    )
      throw new CanonicalError(422, "Invalid form fields.");
    input[key] = value;
  }
  if (input.expectedVersionId === "") input.expectedVersionId = null;
  const result = JobRequirementCommandSchema.safeParse(input);
  if (!result.success)
    throw new CanonicalError(422, "Invalid requirement request.");
  return result.data;
}
