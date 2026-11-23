import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getServerConfig } from "./config";
import { buildExportManifest, type ExportManifest } from "./privacy-operations";
import { recordJobEvent } from "./observability";
import { createResumeStorage } from "./storage";
import { createSupabaseAdminClient } from "./supabase";

const ClaimedPrivacyRequestSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["export", "deletion"]),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  attempt: z.number().int().positive(),
});

const DeletionPlanSchema = z.object({
  storageObjects: z.array(z.object({ storageKey: z.string().min(1) })),
});

const CanonicalExportSchema = z.object({
  canonicalResumeVersions: z.array(z.unknown()),
  resumeFacts: z.array(z.unknown()),
  canonicalResumeHeads: z.array(z.unknown()),
  changeEvents: z.array(z.unknown()),
});
const RequirementExportSchema = z.object({
  jobRequirementVersions: z.array(z.unknown()),
  jobRequirements: z.array(z.unknown()),
});

export type PrivacyRequest = z.infer<typeof ClaimedPrivacyRequestSchema> & {
  workerId: string;
};

export interface PrivacyRequestRepository {
  claim(workerId: string): Promise<PrivacyRequest | null>;
  buildExportManifest(request: PrivacyRequest): Promise<ExportManifest>;
  prepareDeletion(
    request: PrivacyRequest,
  ): Promise<z.infer<typeof DeletionPlanSchema>>;
  complete(request: PrivacyRequest, manifest: unknown): Promise<boolean>;
  fail(request: PrivacyRequest, errorCode: string): Promise<boolean>;
}

export async function processPrivacyRequest(
  repository: PrivacyRequestRepository,
  removeObject: (storageKey: string) => Promise<void>,
  request: PrivacyRequest,
): Promise<void> {
  if (request.kind === "export") {
    const manifest = await repository.buildExportManifest(request);
    if (!(await repository.complete(request, manifest))) {
      throw new Error("Privacy request completion failed.");
    }
    return;
  }

  const plan = await repository.prepareDeletion(request);
  for (const object of plan.storageObjects)
    await removeObject(object.storageKey);
  if (!(await repository.complete(request, { deleted: true }))) {
    throw new Error("Privacy request completion failed.");
  }
}

export async function runPrivacyWorkerCycle(
  repository: PrivacyRequestRepository,
  workerId = `privacy-${randomUUID()}`,
  removeObject: (storageKey: string) => Promise<void> = (storageKey) =>
    createResumeStorage().remove(storageKey),
): Promise<boolean> {
  const request = await repository.claim(workerId);
  if (!request) return false;
  const startedAt = performance.now();
  recordJobEvent({ event: "claimed", stage: "privacy" });
  const leasedRequest = { ...request, workerId };
  try {
    await processPrivacyRequest(repository, removeObject, leasedRequest);
    recordJobEvent({
      event: "completed",
      stage: "privacy",
      durationMs: performance.now() - startedAt,
    });
    return true;
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
        ? error.message
        : "PRIVACY_REQUEST_FAILED";
    await repository.fail(leasedRequest, code).catch(() => undefined);
    recordJobEvent({
      event: "failed",
      stage: "privacy",
      durationMs: performance.now() - startedAt,
    });
    throw error;
  }
}

export async function runPrivacyWorkerLoop(
  repository: PrivacyRequestRepository,
  options: { signal: AbortSignal; idleDelayMs?: number; workerId?: string },
): Promise<void> {
  const workerId = options.workerId ?? `privacy-${randomUUID()}`;
  while (!options.signal.aborted) {
    try {
      const processed = await runPrivacyWorkerCycle(repository, workerId);
      if (!processed) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, options.idleDelayMs ?? 1_000);
          timer.unref?.();
          options.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    } catch {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, options.idleDelayMs ?? 1_000);
        timer.unref?.();
      });
    }
  }
}

export class SupabasePrivacyRequestRepository implements PrivacyRequestRepository {
  async claim(workerId: string): Promise<PrivacyRequest | null> {
    const config = getServerConfig();
    const { data, error } = await createSupabaseAdminClient().rpc(
      "claim_privacy_request",
      { p_worker_id: workerId, p_lease_seconds: config.PRIVACY_LEASE_SECONDS },
    );
    if (error) throw new Error("Privacy request claim failed.");
    if (!data) return null;
    const parsed = ClaimedPrivacyRequestSchema.safeParse(data);
    if (!parsed.success) throw new Error("Privacy request claim was invalid.");
    return { ...parsed.data, workerId };
  }

  async buildExportManifest(request: PrivacyRequest): Promise<ExportManifest> {
    const admin = createSupabaseAdminClient();
    const [
      profile,
      memberships,
      consents,
      requests,
      analyses,
      jobs,
      resumes,
      versions,
      results,
      drafts,
      extractions,
      evidenceAttempts,
      evidenceCorrections,
      workspace,
      auditEvents,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, created_at, updated_at")
        .eq("id", request.userId),
      admin
        .from("memberships")
        .select("organization_id, role, created_at")
        .eq("user_id", request.userId),
      admin
        .from("consents")
        .select("purpose, policy_version, captured_at")
        .eq("user_id", request.userId),
      admin
        .from("data_requests")
        .select("id, kind, status, created_at, completed_at")
        .eq("user_id", request.userId),
      admin
        .from("analyses")
        .select("id, status, requested_at, completed_at, created_at")
        .eq("owner_id", request.userId),
      admin
        .from("jobs")
        .select("id, company_name, title, created_at, updated_at")
        .eq("owner_id", request.userId),
      admin
        .from("resumes")
        .select("id, display_name, status, created_at, updated_at")
        .eq("owner_id", request.userId),
      admin
        .from("resume_versions")
        .select(
          "id, resume_id, storage_key, checksum, bytes, media_type, page_count, created_at",
        )
        .eq("owner_id", request.userId),
      admin.from("analysis_results").select("*").eq("owner_id", request.userId),
      admin.from("writer_drafts").select("*").eq("owner_id", request.userId),
      admin
        .from("analysis_extractions")
        .select("*")
        .eq("owner_id", request.userId),
      admin
        .from("document_evidence_attempts")
        .select("*")
        .eq("owner_id", request.userId),
      admin
        .from("evidence_corrections")
        .select("*")
        .eq("owner_id", request.userId),
      admin.rpc("export_resume_workspace_records", {
        p_user_id: request.userId,
      }),
      admin
        .from("audit_events")
        .select(
          "id, action, target_type, target_id, outcome, request_id, created_at",
        )
        .eq("actor_id", request.userId),
    ]);
    const responses = [
      profile,
      memberships,
      consents,
      requests,
      analyses,
      jobs,
      resumes,
      versions,
      results,
      drafts,
      extractions,
      evidenceAttempts,
      evidenceCorrections,
      workspace,
      auditEvents,
    ];
    if (responses.some((response) => response.error))
      throw new Error("Privacy export data is unavailable.");
    const workspaceRecords = CanonicalExportSchema.extend(
      RequirementExportSchema.shape,
    )
      .extend({ authoringEvents: z.array(z.unknown()) })
      .safeParse(workspace.data);
    if (!workspaceRecords.success)
      throw new Error("Privacy export data is unavailable.");
    const versionRows = versions.data ?? [];
    return buildExportManifest({
      generatedAt: new Date().toISOString(),
      account: { id: request.userId },
      records: {
        profile: profile.data ?? [],
        memberships: memberships.data ?? [],
        consents: consents.data ?? [],
        dataRequests: requests.data ?? [],
        analyses: analyses.data ?? [],
        jobs: jobs.data ?? [],
        resumes: resumes.data ?? [],
        resumeVersions: versionRows,
        analysisResults: results.data ?? [],
        writerDrafts: drafts.data ?? [],
        analysisExtractions: extractions.data ?? [],
        documentEvidenceAttempts: evidenceAttempts.data ?? [],
        evidenceCorrections: evidenceCorrections.data ?? [],
        ...workspaceRecords.data,
        auditEvents: auditEvents.data ?? [],
      },
      files: versionRows.map((version) => ({
        storageKey: version.storage_key,
        bytes: version.bytes,
        checksum: version.checksum,
      })),
    });
  }

  async prepareDeletion(request: PrivacyRequest) {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "prepare_deletion_request",
      { p_request_id: request.id, p_worker_id: request.workerId },
    );
    if (error) throw new Error("Privacy deletion preparation failed.");
    const parsed = DeletionPlanSchema.safeParse(data);
    if (!parsed.success) throw new Error("Privacy deletion plan was invalid.");
    return parsed.data;
  }

  async complete(request: PrivacyRequest, manifest: unknown): Promise<boolean> {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "complete_privacy_request",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_manifest: manifest,
      },
    );
    if (error) throw new Error("Privacy request completion failed.");
    return data === true;
  }

  async fail(request: PrivacyRequest, errorCode: string): Promise<boolean> {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "fail_privacy_request",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_error_code: errorCode,
        p_max_attempts: getServerConfig().PRIVACY_MAX_ATTEMPTS,
      },
    );
    if (error)
      throw new Error("Privacy request failure could not be recorded.");
    return data === true;
  }
}
