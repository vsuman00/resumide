import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn().mockResolvedValue(null),
  queued: vi.fn(),
  consent: vi.fn(),
  audit: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  bindingEnabled: false,
}));
vi.mock("../../app/lib/server/config", async (original) => {
  const actual = await original<typeof import("../../app/lib/server/config")>();
  return {
    ...actual,
    getServerConfig: () => ({
      ...actual.parseServerConfig(),
      ANALYSIS_ADMISSION_BINDING_ENABLED: mocks.bindingEnabled,
    }),
  };
});
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: () => ({}),
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../../app/lib/server/privacy", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/privacy")>()),
  requireAndRecordAiConsent: mocks.consent,
  recordAuditEvent: mocks.audit,
}));
vi.mock("../../app/lib/server/analysis-ingestion", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/analysis-ingestion")
  >()),
  createQueuedAnalysis: mocks.queued,
}));
vi.mock("../../app/lib/server/upload-validation", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/upload-validation")
  >()),
  validateResumeUpload: vi.fn().mockResolvedValue({
    bytes: Buffer.from([37, 80, 68, 70]),
    mediaType: "application/pdf",
  }),
}));
import { AnalysisAdmissionError } from "../../app/lib/server/analysis-ingestion";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.APP_ORIGIN = "http://localhost:5173";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.SUPABASE_SECRET_KEY = "secret";
  process.env.OPENAI_API_KEY = "openai";
});

describe("/api/analyze request contract", async () => {
  const route = await import("../../app/routes/api.analyze");

  it("rejects non-POST requests with Allow", async () => {
    const response = route.loader({
      request: new Request("http://localhost:5173/api/analyze", {
        headers: { "X-Request-Id": "request-1234" },
      }),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    const body = await response.json();
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.error.requestId).toBe("request-1234");
    expect(response.headers.get("X-Request-Id")).toBe("request-1234");
  });

  it("rejects unauthenticated requests before parsing multipart data", async () => {
    const response = await route.action({
      request: new Request("http://localhost:5173/api/analyze", {
        method: "POST",
        headers: { Origin: "http://localhost:5173" },
        body: "not multipart",
      }),
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("passes the enabled server policy binding and returns a safe payload conflict as 409", async () => {
    mocks.bindingEnabled = true;
    mocks.user.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
    mocks.queued.mockRejectedValue(
      new AnalysisAdmissionError("ADMISSION_CONFLICT"),
    );
    const form = new FormData();
    form.set(
      "file",
      new File(["%PDF synthetic"], "synthetic.pdf", {
        type: "application/pdf",
      }),
    );
    form.set("jobTitle", "Backend Engineer");
    form.set("jobDescription", "Develop Python backend services and APIs.");
    form.set("idempotencyKey", "00000000-0000-4000-8000-000000000002");
    form.set("aiConsent", "accepted");
    try {
      const response = await route.action({
        request: new Request("http://localhost:5173/api/analyze", {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "X-Request-Id": "synthetic-conflict",
          },
          body: form,
        }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: {
          code: "ADMISSION_CONFLICT",
          message: "Analysis admission could not be completed.",
          retryable: false,
          requestId: "synthetic-conflict",
        },
      });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(mocks.queued).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingEnabled: true,
          requestPolicySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
      );
      expect(mocks.audit).not.toHaveBeenCalled();
    } finally {
      mocks.bindingEnabled = false;
      mocks.user.mockResolvedValue(null);
    }
  });
});
