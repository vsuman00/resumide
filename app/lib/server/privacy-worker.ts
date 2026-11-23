import {
  readOwnedLegacyAiUsageExport,
  ownedLegacyAiUsageMicros,
} from "./owned-legacy-ai-usage-export";
import { OWNED_LEGACY_AI_USAGE_PROFILE } from "./owned-legacy-ai-usage-profile";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getServerConfig } from "./config";
import { buildExportManifest, type ExportManifest } from "./privacy-operations";
import { recordJobEvent } from "./observability";
import {
  createResumeStorageKey,
  removeVerifiedResumeStorageObject,
  StorageError,
} from "./storage";
import { createSupabaseAdminClient } from "./supabase";
import { runProviderAttempt } from "./provider-attempt";
import {
  validateLegacyScoringInputContext,
  LegacyScoringReceiptSchema,
} from "./legacy-scoring-input";
import {
  OwnedAiBudgetExportSchema,
  readOwnedAiBudgetExport,
} from "./owned-ai-budget-export";
import { OWNED_AI_BUDGET_EXPORT_PROFILE } from "./owned-ai-budget-export-profile";
import { readAiBudgetSourceExport } from "./ai-budget-source-export";
import { AI_BUDGET_SOURCE_PROFILES } from "./ai-budget-source-profile";
import { readOwnedAiDispositionExport } from "./owned-ai-disposition-export";
import { OWNED_AI_DISPOSITION_PROFILE } from "./owned-ai-disposition-profile";
import {
  createInitialFeedbackOwnerExporter,
  InitialFeedbackPairedOwnedExportSchema,
} from "./initial-feedback-publication-repository";
import {
  INITIAL_FEEDBACK_PROFILES,
  OWNED_AI_RETIREMENT_PROFILE,
} from "./initial-feedback-profile";

const AiBudgetExportMetadataSchema = OwnedAiBudgetExportSchema.pick({
  schemaVersion: true,
  ownerId: true,
  omissions: true,
});
export type OwnedAiPrivacyExportManifest = ExportManifest & {
  aiBudgetExportMetadata: z.infer<typeof AiBudgetExportMetadataSchema>;
};

const ClaimedPrivacyRequestSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["export", "deletion"]),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  attempt: z.number().int().positive(),
});

const DeletionPlanSchema = z.object({
  storageObjects: z.array(z.object({ storageKey: z.string().min(1) })),
  admissionHandoff: z
    .strictObject({
      requestId: z.uuid(),
      attempt: z.number().int().positive(),
      adoptedObjects: z
        .array(
          z.strictObject({
            uploadId: z.uuid(),
            storageKey: z.string().min(1).max(300),
            bucket: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u),
            objectId: z.uuid(),
            verified: z.boolean(),
          }),
        )
        .max(4096),
    })
    .optional(),
});
type AdoptedDeletionObject = NonNullable<
  z.infer<typeof DeletionPlanSchema>["admissionHandoff"]
>["adoptedObjects"][number];
type VerifyDeletionObject = (
  storageKey: string,
  expected?: Pick<AdoptedDeletionObject, "bucket" | "objectId">,
) => Promise<void>;

const retirementCount = z.number().int().min(0).max(4096);
const AdmissionRetirementCaptureSchema = z.strictObject({
  requestId: z.uuid(),
  attempt: z.number().int().positive(),
  operations: retirementCount.min(1),
  uploads: retirementCount,
  legacy: retirementCount,
  undispatched: retirementCount,
  uncertain: retirementCount,
  acknowledged: retirementCount,
  recordedWorkerLeases: retirementCount,
  invalidKeys: retirementCount,
  orphanedOperations: retirementCount,
  unresolvedSources: retirementCount,
});
const AdmissionCleanupClaimSchema = z.strictObject({
  requestId: z.uuid(),
  attempt: z.number().int().positive(),
  uploads: z
    .array(
      z.strictObject({
        uploadId: z.uuid(),
        organizationId: z.uuid(),
        resumeId: z.uuid(),
        versionId: z.uuid(),
        objectId: z.uuid(),
        bucket: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u),
        storageKey: z.string().max(300),
      }),
    )
    .max(4),
});
const ADMISSION_CLEANUP_TIMEOUT_MS = 20_000;

function isAdmissionRetirementHold(error: { code?: string; message: string }) {
  return (
    error.code === "P0A01" && error.message === "ADMISSION_RETIREMENT_REQUIRED"
  );
}

class AdmissionCleanupDeferred extends Error {
  constructor() {
    super("ADMISSION_CLEANUP_DEFERRED");
  }
}

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

const ownedMetadataRow = z
  .object({ owner_id: z.string().min(1) })
  .passthrough();
const WorkspaceMetadataExportSchema = z.object({
  candidateCorrectionOperations: z.array(ownedMetadataRow),
  candidateCorrectionAssignments: z.array(ownedMetadataRow),
  candidateCorrectionApplications: z.array(ownedMetadataRow),
  canonicalCorrectionSnapshots: z.array(ownedMetadataRow),
  canonicalCorrectionSnapshotFacts: z.array(ownedMetadataRow),
  candidateEntryAssociationBatches: z.array(ownedMetadataRow),
  candidateEntryAssociationGroups: z.array(ownedMetadataRow),
  candidateEntryAssociationMembers: z.array(ownedMetadataRow),
  canonicalEntryAssociationSnapshots: z.array(ownedMetadataRow),
  canonicalEntryAssociationLinks: z.array(ownedMetadataRow),
  candidateEntryRegroupBatches: z.array(ownedMetadataRow),
  candidateEntryRegroupGroups: z.array(ownedMetadataRow),
  candidateEntryRegroupMembers: z.array(ownedMetadataRow),
  canonicalEntryRegroupSnapshots: z.array(ownedMetadataRow),
  canonicalEntryRegroupLinks: z.array(ownedMetadataRow),
});

const CanonicalRewriteExportSchema = z.strictObject({
  schemaVersion: z.literal("canonical-rewrite-export/1.0.0"),
  canonicalRewriteOperations: z.array(ownedMetadataRow),
  canonicalRewriteVersions: z.array(ownedMetadataRow),
  canonicalRewriteHeads: z.array(ownedMetadataRow),
});

// Paired native export bounds: reject the entire account export, never truncate.
const SCORING_EXPORT_MAX_ROWS = 4096;
const SCORING_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
const exportUuid = z.uuid().regex(/^[a-f0-9-]+$/u);
const exportDigest = z.string().regex(/^[a-f0-9]{64}$/u);
const exportAudit = z.string().regex(/^[\x20-\x7e]{1,128}$/u);
const LegacyScoringExportSchema = z.strictObject({
  schemaVersion: z.literal("legacy-scoring-export/1.0.0"),
  scoringInputs: z.array(z.unknown()).max(SCORING_EXPORT_MAX_ROWS),
});
const LegacyScoringExportRowSchema = z.strictObject({
  analysis_id: exportUuid,
  organization_id: exportUuid,
  owner_id: exportUuid,
  resume_id: exportUuid,
  resume_version_id: exportUuid,
  extraction_analysis_id: exportUuid,
  job_id: exportUuid.nullable(),
  worker_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  attempt: z.number().int().min(1).max(3),
  lease_fence: exportUuid,
  process_id: exportAudit,
  request_id: exportAudit,
  input_context: z.unknown(),
  input_binding_sha256: exportDigest,
  result_checksum: exportDigest,
  deterministic_content_sha256: exportDigest,
  created_at: LegacyScoringReceiptSchema.shape.createdAt,
});
const exportUnavailable = () =>
  new Error("Privacy export data is unavailable.");
async function readOwnedAiPrivacyExport(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ownerId: string,
) {
  try {
    // Accounting remains personal data even with dispatch disabled, old periods,
    // departed memberships, or deleted candidate content. Every read is mandatory.
    const [budget, rawFeedback, dispositions, registrations, legacyUsage] =
      await Promise.all([
        readOwnedAiBudgetExport(admin, ownerId, OWNED_AI_BUDGET_EXPORT_PROFILE),
        createInitialFeedbackOwnerExporter(
          admin,
          { ownerId },
          INITIAL_FEEDBACK_PROFILES,
          { retirementProfile: OWNED_AI_RETIREMENT_PROFILE },
        ).exportOwned(),
        readOwnedAiDispositionExport(
          admin,
          ownerId,
          OWNED_AI_DISPOSITION_PROFILE,
        ),
        readAiBudgetSourceExport(admin, ownerId, AI_BUDGET_SOURCE_PROFILES),
        readOwnedLegacyAiUsageExport(
          admin,
          ownerId,
          OWNED_LEGACY_AI_USAGE_PROFILE,
        ),
      ]);
    const feedback = InitialFeedbackPairedOwnedExportSchema.parse(rawFeedback);
    const budgetOperations = new Map(
      budget.operations.map((operation) => [operation.id, operation]),
    );
    for (const source of registrations.sources) {
      const operation = budgetOperations.get(source.operationId);
      if (
        !operation ||
        source.ownerId !== operation.user_id ||
        source.organizationId !== operation.organization_id ||
        source.bindingSha256 !== operation.binding_sha256
      )
        throw exportUnavailable();
    }
    const account = dispositions.accounts[0];
    for (const record of legacyUsage.records) {
      const stored = ownedLegacyAiUsageMicros(record.expiresAt),
        accountExpiry = account
          ? ownedLegacyAiUsageMicros(account.expires_at)
          : stored;
      if (
        ownedLegacyAiUsageMicros(record.effectiveExpiresAt) !==
        (accountExpiry < stored ? accountExpiry : stored)
      )
        throw exportUnavailable();
      if (
        record.firstCause === "account_preparation" &&
        (!account ||
          record.deletionRequestId !== account.first_request_id ||
          ownedLegacyAiUsageMicros(record.preparedAt) !==
            ownedLegacyAiUsageMicros(account.prepared_at))
      )
        throw exportUnavailable();
    }
    return {
      metadata: AiBudgetExportMetadataSchema.parse({
        schemaVersion: budget.schemaVersion,
        ownerId: budget.ownerId,
        omissions: budget.omissions,
      }),
      records: {
        aiBudgetOperations: budget.operations,
        aiBudgetAttempts: budget.attempts,
        aiBudgetEvents: budget.events,
        aiBudgetReconciliationOperators: budget.reconciliationOperators,
        aiBudgetOperatorActions: budget.operatorActions,
        initialFeedbackOperations: feedback.operations,
        initialFeedbackAttempts: feedback.attempts,
        initialFeedbackPublications: feedback.publications,
        ownedAiRetirements: feedback.retirements,
        ownedAiDeletionDispositions: dispositions.accounts,
        ownedAiOperationDispositions: dispositions.operations,
        aiBudgetSourceRegistrations: registrations.sources,
        ownedLegacyAiUsageRetirements: legacyUsage.records,
      },
    };
  } catch {
    throw exportUnavailable();
  }
}
async function readLegacyScoringExport(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ownerId: string,
) {
  const deadline = Date.now() + 5000;
  try {
    const reply = await runProviderAttempt({
      timeoutMs: 5000,
      failure: exportUnavailable,
      execute: async (signal) => {
        const pending = admin.rpc("export_legacy_scoring_inputs", {
          p_user_id: ownerId,
        });
        return await (typeof pending.abortSignal === "function"
          ? pending.abortSignal(signal)
          : pending);
      },
    });
    if (Date.now() >= deadline || reply.error) throw exportUnavailable();
    const envelope = LegacyScoringExportSchema.safeParse(reply.data);
    if (
      !envelope.success ||
      Buffer.byteLength(JSON.stringify(reply.data), "utf8") >
        SCORING_EXPORT_MAX_BYTES
    )
      throw exportUnavailable();
    const seen = new Set<string>();
    const rows = envelope.data.scoringInputs.map((raw) => {
      const row = LegacyScoringExportRowSchema.parse(raw);
      if (seen.has(row.analysis_id)) throw exportUnavailable();
      seen.add(row.analysis_id);
      const context = validateLegacyScoringInputContext(
        row.input_context,
        row.analysis_id,
        ownerId,
      );
      if (
        row.owner_id !== ownerId ||
        row.organization_id !== context.organizationId ||
        row.resume_id !== context.source.resumeId ||
        row.resume_version_id !== context.source.resumeVersionId ||
        row.extraction_analysis_id !== row.analysis_id ||
        row.job_id !== context.binding.jobId ||
        row.input_binding_sha256 !== context.binding.inputBindingSha256 ||
        Date.now() >= deadline
      )
        throw exportUnavailable();
      return { ...row, input_context: context };
    });
    if (Date.now() >= deadline) throw exportUnavailable();
    return rows;
  } catch {
    // No raw native response, original source text, or private error is attached.
    throw exportUnavailable();
  }
}

export type PrivacyRequest = z.infer<typeof ClaimedPrivacyRequestSchema> & {
  workerId: string;
};

export interface PrivacyRequestRepository {
  claim(workerId: string): Promise<PrivacyRequest | null>;
  buildExportManifest(request: PrivacyRequest): Promise<ExportManifest>;
  prepareDeletion(
    request: PrivacyRequest,
  ): Promise<z.infer<typeof DeletionPlanSchema>>;
  recordAdoptedObject?(
    request: PrivacyRequest,
    object: AdoptedDeletionObject,
  ): Promise<void>;
  completeAdmissionRetirement?(request: PrivacyRequest): Promise<boolean>;
  complete(request: PrivacyRequest, manifest: unknown): Promise<boolean>;
  fail(request: PrivacyRequest, errorCode: string): Promise<boolean>;
}

export async function processPrivacyRequest(
  repository: PrivacyRequestRepository,
  removeObject: VerifyDeletionObject,
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
  const adopted = new Map(
    plan.admissionHandoff?.adoptedObjects.map((object) => [
      object.storageKey,
      object,
    ]),
  );
  for (const object of plan.storageObjects) {
    const expected = adopted.get(object.storageKey);
    if (!expected) {
      await removeObject(object.storageKey);
    } else if (!expected.verified) {
      if (!repository.recordAdoptedObject)
        throw new Error("ADMISSION_RETIREMENT_REQUIRED");
      await removeObject(object.storageKey, {
        bucket: expected.bucket,
        objectId: expected.objectId,
      });
      await repository.recordAdoptedObject(request, expected);
    }
  }
  if (plan.admissionHandoff) {
    if (!(await repository.completeAdmissionRetirement?.(request)))
      throw new Error("ADMISSION_RETIREMENT_REQUIRED");
    return;
  }
  if (!(await repository.complete(request, { deleted: true }))) {
    throw new Error("Privacy request completion failed.");
  }
}

export async function runPrivacyWorkerCycle(
  repository: PrivacyRequestRepository,
  workerId = `privacy-${randomUUID()}`,
  removeObject: VerifyDeletionObject = removeVerifiedResumeStorageObject,
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
    if (error instanceof AdmissionCleanupDeferred) return true;
    const code =
      error instanceof StorageError &&
      error.code === "STORAGE_DELETE_UNVERIFIED"
        ? error.code
        : error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
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
  private async admissionRetirementRpc(
    name: string,
    request: PrivacyRequest,
    failure: () => Error,
    args: Record<string, unknown> = {},
    cancellation?: AbortSignal,
  ) {
    const { data, error } = await runProviderAttempt({
      timeoutMs: 5_000,
      signal: cancellation,
      failure,
      execute: async (signal) => {
        const pending = createSupabaseAdminClient().rpc(name, {
          ...args,
          p_request_id: request.id,
          p_worker_id: request.workerId,
          p_attempt: request.attempt,
        });
        return await (typeof pending.abortSignal === "function"
          ? pending.abortSignal(signal)
          : pending);
      },
    });
    if (error) throw failure();
    return data;
  }

  private async recoverAdmissionUploads(
    request: PrivacyRequest,
    capturedUploads: number,
  ) {
    const held = () => new Error("ADMISSION_RETIREMENT_REQUIRED");
    const deadlineExceeded = held();
    const deadline = performance.now() + ADMISSION_CLEANUP_TIMEOUT_MS;
    const uploadIds = new Set<string>();
    const keys = new Set<string>();
    try {
      await runProviderAttempt({
        timeoutMs: ADMISSION_CLEANUP_TIMEOUT_MS,
        failure: () => deadlineExceeded,
        execute: async (signal) => {
          const requireActive = () => {
            if (signal.aborted || performance.now() >= deadline)
              throw deadlineExceeded;
          };
          for (;;) {
            requireActive();
            const claim = AdmissionCleanupClaimSchema.parse(
              await this.admissionRetirementRpc(
                "claim_analysis_admission_cleanup",
                request,
                held,
                {},
                signal,
              ),
            );
            if (
              claim.requestId !== request.id ||
              claim.attempt !== request.attempt ||
              uploadIds.size + claim.uploads.length > capturedUploads
            )
              throw held();
            if (claim.uploads.length === 0) return;

            // Validate the entire new batch before acting on any of its keys.
            for (const upload of claim.uploads) {
              if (
                uploadIds.has(upload.uploadId) ||
                keys.has(upload.storageKey) ||
                upload.storageKey !== createResumeStorageKey(upload)
              )
                throw held();
              uploadIds.add(upload.uploadId);
              keys.add(upload.storageKey);
            }
            for (const upload of claim.uploads) {
              requireActive();
              await removeVerifiedResumeStorageObject(
                upload.storageKey,
                upload,
                signal,
              );
              requireActive();
              const recorded = await this.admissionRetirementRpc(
                "complete_analysis_admission_cleanup",
                request,
                held,
                { p_upload_id: upload.uploadId, p_object_id: upload.objectId },
                signal,
              );
              if (recorded !== true) throw held();
            }
          }
        },
      });
    } catch (error) {
      if (error === deadlineExceeded) {
        const deferred = await this.admissionRetirementRpc(
          "defer_analysis_admission_cleanup",
          request,
          held,
        ).catch(() => false);
        if (deferred === true) throw new AdmissionCleanupDeferred();
      }
      throw held();
    }
  }

  private async captureAdmissionRetirement(request: PrivacyRequest) {
    const unavailable = () =>
      new Error("ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE");
    let capturedUploads = 0;
    try {
      const summary = AdmissionRetirementCaptureSchema.parse(
        await this.admissionRetirementRpc(
          "capture_analysis_admission_retirement",
          request,
          unavailable,
        ),
      );
      if (
        summary.requestId !== request.id ||
        summary.attempt !== request.attempt ||
        summary.operations + summary.uploads > 4096 ||
        summary.legacy +
          summary.undispatched +
          summary.uncertain +
          summary.acknowledged !==
          summary.uploads ||
        summary.recordedWorkerLeases > summary.uploads ||
        summary.invalidKeys > summary.uploads ||
        summary.unresolvedSources > summary.uploads ||
        summary.orphanedOperations > summary.operations
      )
        throw unavailable();
      if (summary.acknowledged > 0) capturedUploads = summary.uploads;
    } catch {
      throw unavailable();
    }
    if (capturedUploads > 0)
      await this.recoverAdmissionUploads(request, capturedUploads);
    return capturedUploads > 0;
  }

  async claim(workerId: string): Promise<PrivacyRequest | null> {
    const config = getServerConfig();
    const admin = createSupabaseAdminClient();
    const parameters = {
      p_worker_id: workerId,
      p_lease_seconds: config.PRIVACY_LEASE_SECONDS,
    };
    const preferred = await admin.rpc(
      "claim_privacy_request_with_cleanup_credits",
      { ...parameters, p_max_attempts: config.PRIVACY_MAX_ATTEMPTS },
    );
    const { data, error } =
      preferred.error?.code === "PGRST202"
        ? await admin.rpc("claim_privacy_request", parameters)
        : preferred;
    if (error) throw new Error("Privacy request claim failed.");
    if (!data) return null;
    const parsed = ClaimedPrivacyRequestSchema.safeParse(data);
    if (!parsed.success) throw new Error("Privacy request claim was invalid.");
    return { ...parsed.data, workerId };
  }

  async buildExportManifest(
    request: PrivacyRequest,
  ): Promise<OwnedAiPrivacyExportManifest> {
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
      rewrite,
      workspace,
      scoringInputs,
      ownedAi,
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
      admin.rpc("export_canonical_rewrite_records", {
        p_user_id: request.userId,
      }),
      admin.rpc("export_resume_workspace_records", {
        p_user_id: request.userId,
      }),
      // Always required, including with scoring disabled: stored snapshots cannot
      // be omitted because a dispatch flag or staged native grant is unavailable.
      readLegacyScoringExport(admin, request.userId),
      readOwnedAiPrivacyExport(admin, request.userId),
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
      rewrite,
      workspace,
      auditEvents,
    ];
    if (responses.some((response) => response.error))
      throw new Error("Privacy export data is unavailable.");
    const workspaceRecords = CanonicalExportSchema.extend(
      RequirementExportSchema.shape,
    )
      .extend({ authoringEvents: z.array(z.unknown()) })
      .extend(WorkspaceMetadataExportSchema.shape)
      .safeParse(workspace.data);
    if (!workspaceRecords.success)
      throw new Error("Privacy export data is unavailable.");
    for (const key of Object.keys(
      WorkspaceMetadataExportSchema.shape,
    ) as (keyof typeof WorkspaceMetadataExportSchema.shape)[])
      if (
        workspaceRecords.data[key].some(
          (row) => row.owner_id !== request.userId,
        )
      )
        throw new Error("Privacy export data is unavailable.");
    const rewriteExport = CanonicalRewriteExportSchema.safeParse(rewrite.data);
    if (!rewriteExport.success)
      throw new Error("Privacy export data is unavailable.");
    const rewriteRecords = {
      canonicalRewriteOperations: rewriteExport.data.canonicalRewriteOperations,
      canonicalRewriteVersions: rewriteExport.data.canonicalRewriteVersions,
      canonicalRewriteHeads: rewriteExport.data.canonicalRewriteHeads,
    };
    if (
      Object.values(rewriteRecords).some((rows) =>
        rows.some((row) => row.owner_id !== request.userId),
      )
    )
      throw new Error("Privacy export data is unavailable.");
    const versionRows = versions.data ?? [];
    const manifest = buildExportManifest({
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
        ...rewriteRecords,
        legacyScoringInputs: scoringInputs,
        ...ownedAi.records,
        auditEvents: auditEvents.data ?? [],
      },
      files: versionRows.map((version) => ({
        storageKey: version.storage_key,
        bytes: version.bytes,
        checksum: version.checksum,
      })),
    });
    return { ...manifest, aiBudgetExportMetadata: ownedAi.metadata };
  }

  async prepareDeletion(request: PrivacyRequest) {
    const admin = createSupabaseAdminClient();
    const parameters = {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: request.attempt,
    };
    const preferredName = "prepare_deletion_request_with_admission_handoff";
    const preferred = await admin.rpc(preferredName, parameters);
    const useLegacy = preferred.error?.code === "PGRST202";
    let reply = useLegacy
      ? await admin.rpc("prepare_deletion_request", parameters)
      : preferred;
    if (
      reply.error &&
      request.kind === "deletion" &&
      isAdmissionRetirementHold(reply.error)
    ) {
      if (!(await this.captureAdmissionRetirement(request)) || useLegacy)
        throw new Error("ADMISSION_RETIREMENT_REQUIRED");
      reply = await admin.rpc(preferredName, parameters);
      if (reply.error && isAdmissionRetirementHold(reply.error))
        throw new Error("ADMISSION_RETIREMENT_REQUIRED");
    }
    if (reply.error) {
      throw new Error("Privacy deletion preparation failed.");
    }
    const parsed = DeletionPlanSchema.safeParse(reply.data);
    if (!parsed.success) throw new Error("Privacy deletion plan was invalid.");
    const handoff = parsed.data.admissionHandoff;
    if (handoff) {
      const keys = new Set(
        parsed.data.storageObjects.map(({ storageKey }) => storageKey),
      );
      if (
        handoff.requestId !== request.id ||
        handoff.attempt !== request.attempt ||
        keys.size !== parsed.data.storageObjects.length ||
        new Set(handoff.adoptedObjects.map(({ storageKey }) => storageKey))
          .size !== handoff.adoptedObjects.length ||
        new Set(handoff.adoptedObjects.map(({ uploadId }) => uploadId)).size !==
          handoff.adoptedObjects.length ||
        handoff.adoptedObjects.some(({ storageKey }) => !keys.has(storageKey))
      )
        throw new Error("Privacy deletion plan was invalid.");
    }
    return parsed.data;
  }

  async recordAdoptedObject(
    request: PrivacyRequest,
    object: AdoptedDeletionObject,
  ) {
    const held = () => new Error("ADMISSION_RETIREMENT_REQUIRED");
    const recorded = await this.admissionRetirementRpc(
      "complete_analysis_admission_deletion_object",
      request,
      held,
      { p_upload_id: object.uploadId, p_object_id: object.objectId },
    );
    if (recorded !== true) throw held();
  }

  async completeAdmissionRetirement(request: PrivacyRequest): Promise<boolean> {
    const result = await this.admissionRetirementRpc(
      "complete_deletion_request_with_admission_retirement",
      request,
      () => new Error("ADMISSION_RETIREMENT_REQUIRED"),
    );
    return result === true;
  }

  async complete(request: PrivacyRequest, manifest: unknown): Promise<boolean> {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "complete_privacy_request",
      {
        p_request_id: request.id,
        p_worker_id: request.workerId,
        p_attempt: request.attempt,
        p_manifest: manifest,
      },
    );
    if (error) {
      if (request.kind === "deletion" && isAdmissionRetirementHold(error)) {
        await this.captureAdmissionRetirement(request);
        throw new Error("ADMISSION_RETIREMENT_REQUIRED");
      }
      throw new Error("Privacy request completion failed.");
    }
    return data === true;
  }

  async fail(request: PrivacyRequest, errorCode: string): Promise<boolean> {
    const params = {
      p_request_id: request.id,
      p_worker_id: request.workerId,
      p_attempt: request.attempt,
      p_error_code: errorCode,
      p_max_attempts: getServerConfig().PRIVACY_MAX_ATTEMPTS,
    };
    const admin = createSupabaseAdminClient();
    if (request.kind === "deletion") {
      const adjusted = await admin.rpc(
        "fail_analysis_admission_cleanup",
        params,
      );
      if (adjusted.error && adjusted.error.code !== "PGRST202")
        throw new Error("Privacy request failure could not be recorded.");
      if (!adjusted.error && adjusted.data !== null)
        return adjusted.data === true;
    }
    const { data, error } = await admin.rpc("fail_privacy_request", params);
    if (error)
      throw new Error("Privacy request failure could not be recorded.");
    return data === true;
  }
}
