import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabaseTransactionBoundary } from "./database";
import {
  createResumeStorage,
  createResumeStorageKey,
  removeVerifiedResumeStorageObject,
} from "./storage";
import { createSupabaseAdminClient } from "./supabase";
import { getServerConfig } from "./config";
import { AI_CONSENT_POLICY_VERSION } from "./privacy";

export const ANALYSIS_ADMISSION_POLICY_VERSION = "analysis-admission/1.0.0";
type AdmissionCode =
  | "ADMISSION_CONFLICT"
  | "ADMISSION_DENIED"
  | "ADMISSION_INVALID"
  | "ADMISSION_UNAVAILABLE";
export class AnalysisAdmissionError extends Error {
  constructor(readonly code: AdmissionCode) {
    super("Analysis admission could not be completed.");
  }
}
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const identity = {
  schemaVersion: z.literal(ANALYSIS_ADMISSION_POLICY_VERSION),
  operationId: z.uuid(),
  bindingSha256: sha,
};
const preparedSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...identity,
    kind: z.literal("upload"),
    uploadId: z.uuid(),
    analysisId: z.uuid(),
    resumeId: z.uuid(),
    versionId: z.uuid(),
    jobId: z.uuid(),
    storageKey: z.string().max(300),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("replay"),
    analysisId: z.uuid(),
    resumeId: z.uuid(),
    created: z.literal(false),
  }),
]);
const finalizedSchema = z.strictObject({
  ...identity,
  kind: z.literal("result"),
  analysisId: z.uuid(),
  resumeId: z.uuid(),
  created: z.boolean(),
  uploadId: z.uuid(),
  storageKey: z.string().max(300),
  cleanupPending: z.boolean(),
});
const deniedSchema = z.strictObject({
  schemaVersion: z.literal(ANALYSIS_ADMISSION_POLICY_VERSION),
  kind: z.literal("denied"),
  code: z.enum([
    "ADMISSION_CONFLICT",
    "ADMISSION_DENIED",
    "ADMISSION_INVALID",
    "ADMISSION_UNAVAILABLE",
  ]),
});
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

type IngestionArgs = {
  userId: string;
  fileName: string;
  pdf: Uint8Array;
  jobTitle: string;
  jobDescription: string;
  idempotencyKey: string;
  requestId: string;
  bindingEnabled?: boolean;
  requestPolicySha256?: string;
};

async function createBoundQueuedAnalysis(
  args: IngestionArgs,
  organizationId: string,
) {
  if (
    !z.uuid().safeParse(args.idempotencyKey).success ||
    !sha.safeParse(args.requestPolicySha256).success
  )
    throw new AnalysisAdmissionError("ADMISSION_INVALID");
  const pdf = Uint8Array.from(args.pdf);
  const meta = {
    idempotencyKey: args.idempotencyKey,
    uploadId: randomUUID(),
    analysisId: randomUUID(),
    resumeId: randomUUID(),
    versionId: randomUUID(),
    jobId: randomUUID(),
    checksum: digest(pdf),
    bytes: pdf.byteLength,
    titleSha256: digest(args.jobTitle),
    jobSha256: digest(args.jobDescription),
    nameSha256: digest(args.fileName),
    requestPolicySha256: args.requestPolicySha256!,
    policyVersion: ANALYSIS_ADMISSION_POLICY_VERSION,
    consentPolicyVersion: AI_CONSENT_POLICY_VERSION,
  };
  const hash = createHash("sha256").update("ANALYSIS-ADMISSION1\n");
  for (const atom of [
    meta.checksum,
    String(meta.bytes),
    meta.titleSha256,
    meta.jobSha256,
    meta.nameSha256,
    meta.requestPolicySha256,
    meta.policyVersion,
    meta.consentPolicyVersion,
  ])
    hash.update(`T${Buffer.byteLength(atom, "utf8")}:${atom};`);
  const bindingSha256 = hash.digest("hex");
  const admin = createSupabaseAdminClient();
  const scope = { p_user_id: args.userId, p_organization_id: organizationId };
  const rpc = async <T>(
    name: string,
    parameters: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> => {
    try {
      const result = await admin.rpc(name, { ...scope, ...parameters });
      if (result.error)
        throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
      const denied = deniedSchema.safeParse(result.data);
      if (denied.success) throw new AnalysisAdmissionError(denied.data.code);
      const parsed = schema.safeParse(result.data);
      if (!parsed.success)
        throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
      return parsed.data;
    } catch (error) {
      if (error instanceof AnalysisAdmissionError) throw error;
      throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
    }
  };
  const prepared = await rpc(
    "prepare_tracked_analysis_admission",
    { p_request: { ...meta, bindingSha256 } },
    preparedSchema,
  );
  if (prepared.bindingSha256 !== bindingSha256)
    throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
  if (prepared.kind === "replay")
    return {
      analysisId: prepared.analysisId,
      resumeId: prepared.resumeId,
      created: false,
    };
  const storageKey = createResumeStorageKey({
    organizationId,
    resumeId: meta.resumeId,
    versionId: meta.versionId,
  });
  if (
    prepared.storageKey !== storageKey ||
    prepared.uploadId !== meta.uploadId ||
    prepared.analysisId !== meta.analysisId ||
    prepared.resumeId !== meta.resumeId ||
    prepared.versionId !== meta.versionId ||
    prepared.jobId !== meta.jobId
  )
    throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
  const cleanup = (action: "pending" | "cleaned") =>
    rpc(
      "cleanup_analysis_admission",
      {
        p_operation_id: prepared.operationId,
        p_upload_id: meta.uploadId,
        p_action: action,
      },
      z.literal(true),
    );
  const bucket = getServerConfig().SUPABASE_RESUME_BUCKET;
  const transportScope = {
    p_operation_id: prepared.operationId,
    p_upload_id: meta.uploadId,
    p_bucket: bucket,
    p_storage_key: storageKey,
  };
  // A lost dispatch response grants no permission to send another Storage write.
  await rpc("begin_analysis_admission_upload", transportScope, z.literal(true));
  let objectId: string;
  try {
    const uploaded = await admin.storage.from(bucket).upload(storageKey, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (
      uploaded.error ||
      uploaded.data?.path !== storageKey ||
      uploaded.data.fullPath !== `${bucket}/${storageKey}` ||
      !z.uuid().safeParse(uploaded.data.id).success
    )
      throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
    objectId = uploaded.data.id;
  } catch {
    // An upload response can be ambiguous. Keep its durable path pending; no delete.
    try {
      await cleanup("pending");
    } catch {
      throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
    }
    throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
  }
  await rpc(
    "acknowledge_analysis_admission_upload",
    { ...transportScope, p_object_id: objectId },
    z.literal(true),
  );
  async function compensateUnadoptedUpload(pendingRecorded: boolean) {
    try {
      // The exact transition locks the upload and refuses adopted rows.
      if (!pendingRecorded) await cleanup("pending");
      await removeVerifiedResumeStorageObject(storageKey, { bucket, objectId });
      await cleanup("cleaned");
    } catch {
      // Preserve the original result or denial. The ledger retains the obligation.
      return;
    }
  }
  // An unknown/malformed finalize receipt may represent a committed adoption.
  // Compensate only after an explicit denial or an exact duplicate receipt.
  const finalized = await rpc(
    "finalize_analysis_admission",
    {
      p_operation_id: prepared.operationId,
      p_upload_id: meta.uploadId,
      p_request: {
        ...meta,
        bindingSha256,
        jobTitle: args.jobTitle,
        jobDescription: args.jobDescription,
        displayName: args.fileName,
        requestId: args.requestId,
      },
    },
    finalizedSchema,
  ).catch(async (error: unknown) => {
    if (
      error instanceof AnalysisAdmissionError &&
      error.code === "ADMISSION_DENIED"
    )
      await compensateUnadoptedUpload(false);
    throw error;
  });
  if (
    finalized.operationId !== prepared.operationId ||
    finalized.bindingSha256 !== bindingSha256 ||
    finalized.uploadId !== meta.uploadId ||
    finalized.storageKey !== storageKey ||
    (finalized.created &&
      (finalized.analysisId !== meta.analysisId ||
        finalized.resumeId !== meta.resumeId ||
        finalized.cleanupPending)) ||
    (finalized.cleanupPending &&
      (finalized.analysisId === meta.analysisId ||
        finalized.resumeId === meta.resumeId))
  )
    throw new AnalysisAdmissionError("ADMISSION_UNAVAILABLE");
  const result = {
    analysisId: finalized.analysisId,
    resumeId: finalized.resumeId,
    created: finalized.created,
  };
  if (finalized.cleanupPending) await compensateUnadoptedUpload(true);
  return result;
}

const QueuedAnalysisSchema = z.object({
  analysisId: z.string().uuid(),
  resumeId: z.string().uuid(),
  created: z.boolean(),
});

export async function createQueuedAnalysis(args: IngestionArgs) {
  const admin = createSupabaseAdminClient();
  const { data: membership, error } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", args.userId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !membership)
    throw new Error("Personal organization is unavailable.");
  if (args.bindingEnabled)
    return createBoundQueuedAnalysis(args, membership.organization_id);

  const resumeId = randomUUID();
  const versionId = randomUUID();
  const analysisId = randomUUID();
  const jobId = randomUUID();
  const storage = createResumeStorage();
  const uploaded = await storage.upload({
    organizationId: membership.organization_id,
    resumeId,
    versionId,
    bytes: args.pdf,
  });

  try {
    const persisted = await createDatabaseTransactionBoundary().run(
      "create_queued_analysis",
      {
        p_analysis_id: analysisId,
        p_bytes: uploaded.bytes,
        p_checksum: uploaded.checksum,
        p_display_name: args.fileName,
        p_idempotency_key: args.idempotencyKey,
        p_job_description: args.jobDescription,
        p_job_id: jobId,
        p_job_title: args.jobTitle,
        p_organization_id: membership.organization_id,
        p_request_id: args.requestId,
        p_resume_id: resumeId,
        p_storage_key: uploaded.storageKey,
        p_user_id: args.userId,
        p_version_id: versionId,
      },
      QueuedAnalysisSchema,
    );
    if (!persisted.created) await storage.remove(uploaded.storageKey);
    return persisted;
  } catch (caught) {
    await storage.remove(uploaded.storageKey).catch(() => undefined);
    throw caught;
  }
}
