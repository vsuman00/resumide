import { describe, expect, it, vi } from "vitest";
import {
  buildExportManifest,
  retentionCutoff,
} from "../../app/lib/server/privacy-operations";
import {
  processPrivacyRequest,
  runPrivacyWorkerCycle,
  type PrivacyRequestRepository,
  SupabasePrivacyRequestRepository,
} from "../../app/lib/server/privacy-worker";
import {
  runRetentionSweep,
  type RetentionRepository,
} from "../../app/lib/server/retention";

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => database,
}));
function mockCanonicalExport(response: unknown) {
  database.rpc.mockImplementation(() => {
    const r = response as {
      data: Record<string, unknown> | null;
      error: unknown;
    };
    return Promise.resolve({
      ...r,
      data: r.data
        ? {
            ...r.data,
            jobRequirementVersions: [],
            jobRequirements: [],
            authoringEvents: [],
          }
        : r.data,
    });
  });
}

describe("privacy operations", () => {
  it("exports immutable evidence and corrections only through the request owner's filters", async () => {
    const owner = "owner-1";
    const evidence = {
      id: "attempt-1",
      owner_id: owner,
      envelope: { status: "review_required", original: "fictional source" },
    };
    const correction = {
      id: "correction-1",
      owner_id: owner,
      value: "fictional corrected value",
      revision: 1,
    };
    const filters: Array<{ table: string; column: string; value: string }> = [];
    mockCanonicalExport({
      data: {
        canonicalResumeVersions: [],
        resumeFacts: [],
        canonicalResumeHeads: [],
        changeEvents: [],
      },
      error: null,
    });
    database.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => {
          filters.push({ table, column, value });
          const records =
            table === "document_evidence_attempts"
              ? [
                  evidence,
                  { ...evidence, id: "other-attempt", owner_id: "other-owner" },
                ]
              : table === "evidence_corrections"
                ? [
                    correction,
                    {
                      ...correction,
                      id: "other-correction",
                      owner_id: "other-owner",
                    },
                  ]
                : [];
          return Promise.resolve({
            data: records.filter((row) => row.owner_id === value),
            error: null,
          });
        },
      }),
    }));
    const repository = new SupabasePrivacyRequestRepository();
    const manifest = await repository.buildExportManifest({
      id: "request-1",
      kind: "export",
      userId: owner,
      organizationId: "organization-1",
      attempt: 1,
      workerId: "worker-1",
    });
    expect(filters).toContainEqual({
      table: "document_evidence_attempts",
      column: "owner_id",
      value: owner,
    });
    expect(filters).toContainEqual({
      table: "evidence_corrections",
      column: "owner_id",
      value: owner,
    });
    expect(manifest.records.documentEvidenceAttempts).toEqual([evidence]);
    expect(manifest.records.evidenceCorrections).toEqual([correction]);
    expect(database.rpc).toHaveBeenCalledWith(
      "export_resume_workspace_records",
      { p_user_id: owner },
    );
    expect(manifest.records.authoringEvents).toEqual([]);
    expect(JSON.stringify(manifest)).not.toContain("other-owner");
  });

  it.each([
    "document_evidence_attempts",
    "evidence_corrections",
    "canonical export RPC",
  ])("fails export closed when %s cannot be read", async (unavailable) => {
    mockCanonicalExport({
      data:
        unavailable === "canonical export RPC"
          ? null
          : {
              canonicalResumeVersions: [],
              resumeFacts: [],
              canonicalResumeHeads: [],
              changeEvents: [],
            },
      error:
        unavailable === "canonical export RPC"
          ? { message: "private failure detail" }
          : null,
    });
    database.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [],
            error:
              table === unavailable
                ? { message: "private failure detail" }
                : null,
          }),
      }),
    }));
    await expect(
      new SupabasePrivacyRequestRepository().buildExportManifest({
        id: "request-1",
        kind: "export",
        userId: "owner-1",
        organizationId: "organization-1",
        attempt: 1,
        workerId: "worker-1",
      }),
    ).rejects.toThrow("Privacy export data is unavailable.");
  });

  it("fails export closed when the canonical snapshot is incomplete", async () => {
    database.from.mockImplementation(() => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }));
    mockCanonicalExport({ data: { resumeFacts: [] }, error: null });
    await expect(
      new SupabasePrivacyRequestRepository().buildExportManifest({
        id: "request-1",
        kind: "export",
        userId: "owner-1",
        organizationId: "organization-1",
        attempt: 1,
        workerId: "worker-1",
      }),
    ).rejects.toThrow("Privacy export data is unavailable.");
  });
  it("fails export closed when JD requirements cannot be exported", async () => {
    database.from.mockImplementation(() => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }));
    database.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "export_resume_workspace_records"
          ? { data: null, error: { message: "private JD failure" } }
          : {
              data: {
                canonicalResumeVersions: [],
                resumeFacts: [],
                canonicalResumeHeads: [],
                changeEvents: [],
              },
              error: null,
            },
      ),
    );
    await expect(
      new SupabasePrivacyRequestRepository().buildExportManifest({
        id: "request-1",
        kind: "export",
        userId: "owner-1",
        organizationId: "org-1",
        attempt: 1,
        workerId: "worker-1",
      }),
    ).rejects.toThrow("Privacy export data is unavailable.");
  });

  it("builds a versioned export manifest without raw resume text", () => {
    const manifest = buildExportManifest({
      generatedAt: "2026-09-11T00:00:00.000Z",
      account: { id: "user-1" },
      records: {
        analyses: [{ id: "analysis-1", status: "completed" }],
        consents: [
          { purpose: "qualitative_ai", policyVersion: "candidate-ai-v1" },
        ],
      },
      files: [
        {
          storageKey: "organizations/org-1/resumes/resume-1/v1.pdf",
          bytes: 100,
        },
      ],
    });

    expect(manifest.version).toBe("resumide-export-v1");
    expect(manifest.records.analyses).toHaveLength(1);
    expect(manifest.files[0]?.storageKey).toContain("organizations/");
    expect(JSON.stringify(manifest)).not.toContain("extracted_text");
  });

  it("calculates a UTC retention cutoff", () => {
    expect(
      retentionCutoff(new Date("2026-09-11T12:00:00.000Z"), 30).toISOString(),
    ).toBe("2026-08-12T12:00:00.000Z");
  });

  it("completes an export request and is safe to replay", async () => {
    const repository: PrivacyRequestRepository = {
      claim: vi.fn().mockResolvedValue({
        id: "request-1",
        kind: "export",
        userId: "user-1",
        organizationId: "org-1",
        attempt: 1,
        workerId: "privacy-worker-1",
      }),
      buildExportManifest: vi
        .fn()
        .mockResolvedValue({ version: "resumide-export-v1" }),
      prepareDeletion: vi.fn(),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn(),
    };

    expect(await runPrivacyWorkerCycle(repository, "privacy-worker-1")).toBe(
      true,
    );
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request-1",
        workerId: "privacy-worker-1",
      }),
      { version: "resumide-export-v1" },
    );
    expect(repository.prepareDeletion).not.toHaveBeenCalled();
  });

  it("deletes every object before completing deletion", async () => {
    const repository: PrivacyRequestRepository = {
      claim: vi.fn().mockResolvedValue({
        id: "request-2",
        kind: "deletion",
        userId: "user-1",
        organizationId: "org-1",
        attempt: 1,
        workerId: "privacy-worker-1",
      }),
      buildExportManifest: vi.fn(),
      prepareDeletion: vi.fn().mockResolvedValue({
        storageObjects: [
          { storageKey: "organizations/org-1/resumes/r-1/v-1.pdf" },
          { storageKey: "organizations/org-1/resumes/r-1/v-2.pdf" },
        ],
      }),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn(),
    };
    const remove = vi.fn().mockResolvedValue(undefined);

    await processPrivacyRequest(repository, remove, {
      id: "request-2",
      kind: "deletion",
      userId: "user-1",
      organizationId: "org-1",
      attempt: 1,
      workerId: "privacy-worker-1",
    });

    expect(remove).toHaveBeenCalledTimes(2);
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "request-2" }),
      { deleted: true },
    );
  });

  it("keeps a retention item retryable when object deletion fails", async () => {
    const repository: RetentionRepository = {
      claimExpiredObjects: vi.fn().mockResolvedValue([
        {
          id: "item-1",
          storageKey: "organizations/org-1/resumes/r-1/v-1.pdf",
        },
      ]),
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    await runRetentionSweep(
      repository,
      vi.fn().mockRejectedValue(new Error("storage unavailable")),
      new Date("2026-09-11T00:00:00.000Z"),
      30,
    );
    expect(repository.fail).toHaveBeenCalledWith(
      "item-1",
      "STORAGE_DELETE_FAILED",
    );
    expect(repository.complete).not.toHaveBeenCalled();
  });
});
