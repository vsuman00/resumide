import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
  correct: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({ APP_ORIGIN: "https://example.test" }),
}));
vi.mock("../../app/lib/server/evidence-review", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/evidence-review")>()),
  loadEvidenceReview: mocks.load,
  correctEvidenceReview: mocks.correct,
}));
import { action, loader, headers } from "../../app/routes/analysis.evidence";
import { EvidenceReviewError } from "../../app/lib/server/evidence-review";
const analysisId = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";
const attemptId = "10000000-0000-4000-8000-000000000003";
const body = () =>
  new URLSearchParams({
    attemptId,
    expectedRevision: "0",
    field: "name",
    operation: "correct",
    value: "Demo Person",
    candidateId: "",
    idempotencyKey: "10000000-0000-4000-8000-000000000004",
  });
function args(origin = "https://example.test", form = body()) {
  return {
    request: new Request(
      `https://example.test/analysis/${analysisId}/evidence`,
      { method: "POST", headers: { Origin: origin }, body: form },
    ),
    params: { id: analysisId },
  };
}
describe("owner-authenticated evidence route", () => {
  it("propagates private SSR headers and session refresh cookies on loader/action/error paths", () => {
    const output = new Headers(
      headers({
        parentHeaders: new Headers({
          "Cache-Control": "public, max-age=3600",
          "Set-Cookie": "root=session; HttpOnly",
          "Content-Security-Policy": "default-src 'self'",
        }),
        loaderHeaders: new Headers({
          "Set-Cookie": "loader=session; HttpOnly",
        }),
        actionHeaders: new Headers({
          "Set-Cookie": "action=session; HttpOnly",
        }),
        errorHeaders: new Headers({ "Set-Cookie": "error=session; HttpOnly" }),
      }),
    );
    expect(output.get("Cache-Control")).toBe("private, no-store");
    expect(output.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(output.get("Content-Security-Policy")).toBe("default-src 'self'");
    expect(output.getSetCookie()).toEqual([
      "root=session; HttpOnly",
      "loader=session; HttpOnly",
      "action=session; HttpOnly",
      "error=session; HttpOnly",
    ]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: ownerId });
    mocks.correct.mockResolvedValue({
      status: "applied",
      scoringEligible: false,
    });
  });
  it("requires authentication before creating privileged clients", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await action(args());
    expect(response.init?.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    await expect(
      loader({
        request: new Request("https://example.test/evidence"),
        params: { id: analysisId },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });
  it("rejects cross-origin browser writes before authentication or RPC", async () => {
    const response = await action(args("https://attacker.test"));
    expect(response.init?.status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.correct).not.toHaveBeenCalled();
  });
  it("does not accept identity fields or malformed duplicate submissions", async () => {
    const malicious = body();
    malicious.set("userId", ownerId);
    expect(
      (await action(args("https://example.test", malicious))).init?.status,
    ).toBe(422);
    const duplicated = body();
    duplicated.append("expectedRevision", "1");
    expect(
      (await action(args("https://example.test", duplicated))).init?.status,
    ).toBe(422);
    expect(mocks.correct).not.toHaveBeenCalled();
  });
  it("uses authenticated identity, hides caching and preserves no-score feedback", async () => {
    const response = await action(args());
    expect(mocks.correct).toHaveBeenCalledWith(
      undefined,
      analysisId,
      ownerId,
      expect.objectContaining({
        operation: "correct",
        expectedRevision: 0,
        candidateId: null,
      }),
      expect.any(String),
    );
    expect(response.data.success).toContain("remains unscored");
    expect(new Headers(response.init?.headers).get("Cache-Control")).toBe(
      "private, no-store",
    );
  });
  it.each([404, 409, 422] as const)(
    "returns safe correction status %i",
    async (status) => {
      mocks.correct.mockRejectedValue(
        new EvidenceReviewError(status, "Safe review error."),
      );
      const response = await action(args());
      expect(response.init?.status).toBe(status);
      expect(response.data.error).toBe("Safe review error.");
    },
  );
  it("does not leak provider/database errors", async () => {
    mocks.correct.mockRejectedValue(
      new Error("private raw text and database diagnostic"),
    );
    const response = await action(args());
    expect(response.init?.status).toBe(503);
    expect(JSON.stringify(response.data)).not.toContain("private raw text");
  });
});
