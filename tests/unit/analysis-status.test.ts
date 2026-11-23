import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  server: vi.fn(),
  privateAccess: vi.fn(),
  queueObservation: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: mocks.server,
  createSupabaseAdminClient: () => ({ rpc: mocks.queueObservation }),
}));
vi.mock("../../app/lib/server/privacy-deletion-policy", () => ({
  readCandidatePrivacyAccess: mocks.privateAccess,
}));
import { loader } from "../../app/routes/api.analysis-status";

const id = "10000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000002";
const source = "10000000-0000-4000-8000-000000000003";
const organization = "10000000-0000-4000-8000-000000000004";
const resume = "10000000-0000-4000-8000-000000000005";
const clear = { state: "clear", deletionPrepared: false };
const blocked = { state: "blocked", deletionPrepared: true };
const analysis = {
  id,
  owner_id: owner,
  resume_version_id: source,
  organization_id: organization,
  resume_versions: {
    id: source,
    owner_id: owner,
    organization_id: organization,
    resume_id: resume,
    resumes: {
      id: resume,
      owner_id: owner,
      organization_id: organization,
      status: "active",
    },
  },
  status: "needs_ocr",
  stage_updated_at: "2026-11-22T00:00:00.000Z",
  completed_at: null,
};
const attempt = { analysis_id: id, owner_id: owner, resume_version_id: source };
const fetchFixture = vi.fn();

function status() {
  return loader({
    request: new Request(`https://example.test/api/analysis/${id}`),
    params: { id },
  });
}
function result(row: unknown | null) {
  return Response.json(row === null ? [] : [row]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: owner });
  mocks.privateAccess.mockResolvedValue(clear);
  mocks.queueObservation.mockReturnValue({
    abortSignal: async () => ({ data: null, error: { code: "PGRST202" } }),
  });
  fetchFixture.mockImplementation(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/rest/v1/analyses") return result(analysis);
    throw new Error("Unexpected synthetic status read");
  });
  mocks.server.mockReturnValue(
    createClient("https://fixture.example.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchFixture },
    }),
  );
});

describe("owner status recovery projection", () => {
  it.each([
    ["unsupported", "unsupported", null, "ocr_unavailable"],
    ["failed", "timeout", null, "ocr_failed"],
    ["review_required", null, null, "native_review"],
    ["review_required", null, "review_required", "ocr_review"],
    ["insufficient", null, "insufficient", "ocr_incomplete"],
    ["review_required", null, "insufficient", "ocr_incomplete"],
    ["failed", "private-error-text", null, "review_status_unavailable"],
  ] as const)(
    "projects only bounded recovery for %s/%s/%s",
    async (evidence_status, failure_code, recognized_status, recovery) => {
      fetchFixture
        .mockResolvedValueOnce(result(analysis))
        .mockResolvedValueOnce(
          result({
            ...attempt,
            evidence_status,
            failure_code,
            recognized_status,
          }),
        );
      const response = await status();
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.json()).toEqual({
        id,
        status: "needs_ocr",
        stage_updated_at: analysis.stage_updated_at,
        completed_at: null,
        recovery,
      });
      const url = new URL(String(fetchFixture.mock.calls[1][0]));
      expect(url.pathname).toBe("/rest/v1/document_evidence_attempts");
      expect(url.searchParams.get("analysis_id")).toBe(`eq.${id}`);
      expect(url.searchParams.get("owner_id")).toBe(`eq.${owner}`);
      expect(url.searchParams.get("resume_version_id")).toBe(`eq.${source}`);
      expect(url.searchParams.get("order")).toBe("attempt_number.desc");
      expect(url.searchParams.get("limit")).toBe("1");
      expect(url.searchParams.get("select")).toBe(
        "analysis_id,owner_id,resume_version_id,evidence_status:envelope->>status,failure_code:envelope->ocrFailure->>code,recognized_status:envelope->ocrSource->>status",
      );
    },
  );

  it("returns general PDF recovery for an owned legacy row without an attempt", async () => {
    fetchFixture
      .mockResolvedValueOnce(result(analysis))
      .mockResolvedValueOnce(result(null));
    expect(await (await status()).json()).toMatchObject({
      recovery: "text_pdf_required",
    });
  });

  it("omits evidence recovery for a worker queue status", async () => {
    fetchFixture.mockResolvedValueOnce(
      result({ ...analysis, status: "quarantined" }),
    );
    expect(await (await status()).json()).toEqual({
      id,
      status: "quarantined",
      stage_updated_at: analysis.stage_updated_at,
      completed_at: null,
    });
    expect(fetchFixture).toHaveBeenCalledTimes(1);
  });

  it.each(["recent_check", "no_recent_check"])(
    "returns only a safe observation for an owned waiting item (%s)",
    async (observation) => {
      mocks.queueObservation.mockReturnValueOnce({
        abortSignal: async () => ({ data: observation, error: null }),
      });
      fetchFixture.mockResolvedValueOnce(
        result({ ...analysis, status: "queued" }),
      );
      expect(await (await status()).json()).toMatchObject({
        queueActivity: observation,
      });
      expect(mocks.queueObservation).toHaveBeenCalledExactlyOnceWith(
        "read_owned_analysis_queue_observation",
        { p_analysis_id: id, p_user_id: owner },
      );
    },
  );

  it("denies a waiting item whose access is revoked during the observation", async () => {
    mocks.queueObservation.mockReturnValueOnce({
      abortSignal: async () => ({ data: "not_found", error: null }),
    });
    fetchFixture.mockResolvedValueOnce(
      result({ ...analysis, status: "queued" }),
    );
    expect((await status()).status).toBe(404);
  });

  it("withholds review when the lookup fails or returns an unbound row", async () => {
    for (const lookup of [
      Response.json({ message: "private error" }, { status: 503 }),
      result({
        ...attempt,
        resume_version_id: id,
        evidence_status: "review_required",
        failure_code: null,
        recognized_status: null,
      }),
    ]) {
      fetchFixture
        .mockResolvedValueOnce(result(analysis))
        .mockResolvedValueOnce(lookup);
      expect(await (await status()).json()).toMatchObject({
        recovery: "review_status_unavailable",
      });
    }
  });

  it("never looks up evidence on an unowned status request", async () => {
    fetchFixture.mockResolvedValueOnce(result({ ...analysis, owner_id: id }));
    expect((await status()).status).toBe(404);
    expect(fetchFixture).toHaveBeenCalledTimes(1);
  });

  it("denies an owned analysis whose source was deleted", async () => {
    fetchFixture.mockResolvedValueOnce(
      result({
        ...analysis,
        resume_versions: {
          ...analysis.resume_versions,
          resumes: { ...analysis.resume_versions.resumes, status: "deleted" },
        },
      }),
    );
    const response = await status();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fetchFixture).toHaveBeenCalledTimes(1);
  });

  it("denies pending deletion before reading evidence recovery", async () => {
    mocks.privateAccess.mockResolvedValueOnce(blocked);
    fetchFixture.mockResolvedValueOnce(result(analysis));
    const response = await status();
    expect(response.status).toBe(404);
    expect(fetchFixture).toHaveBeenCalledTimes(1);
  });

  it("withholds recovery when deletion begins during the evidence read", async () => {
    mocks.privateAccess
      .mockResolvedValueOnce(clear)
      .mockResolvedValueOnce(blocked);
    fetchFixture.mockResolvedValueOnce(result(analysis)).mockResolvedValueOnce(
      result({
        ...attempt,
        evidence_status: "review_required",
        failure_code: null,
        recognized_status: "review_required",
      }),
    );
    const response = await status();
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("recovery");
  });

  it("denies a source that becomes invisible before recovery returns", async () => {
    fetchFixture
      .mockResolvedValueOnce(result(analysis))
      .mockResolvedValueOnce(result(null))
      .mockResolvedValueOnce(result(null));
    expect((await status()).status).toBe(404);
  });

  it("drops recovery for a superseded stage and returns the new status", async () => {
    fetchFixture
      .mockResolvedValueOnce(result(analysis))
      .mockResolvedValueOnce(result(null))
      .mockResolvedValueOnce(result({ ...analysis, status: "extracting" }));
    const response = await status();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe("extracting");
    expect(payload).not.toHaveProperty("recovery");
  });

  it("returns a private retryable error when deletion access is unavailable", async () => {
    mocks.privateAccess.mockResolvedValueOnce({ state: "unavailable" });
    fetchFixture.mockResolvedValueOnce(result(analysis));
    const response = await status();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ error: { retryable: true } });
  });
});
