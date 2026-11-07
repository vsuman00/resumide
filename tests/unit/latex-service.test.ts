import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  rpc: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  compile: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    LATEX_CONVERTER_ENABLED: mocks.enabled,
    LATEX_COMPILER_IMAGE: "sha256:" + "a".repeat(64),
    APP_ORIGIN: "https://example.test",
  }),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/latex-sandbox", async (original) => ({
  ...(await original<typeof import("../../app/lib/server/latex-sandbox")>()),
  compileLatex: mocks.compile,
}));
import { getLatexExample, LATEX_LIMITS } from "../../app/lib/latex-converter";
import { LatexSandboxError } from "../../app/lib/server/latex-sandbox";
import {
  latexAction,
  latexLoader,
} from "../../app/lib/server/latex-converter-service";

const userId = "11111111-1111-4111-8111-111111111111";
const source = getLatexExample("document", "A4");
const request = (
  headers: Record<string, string> = {},
  body = JSON.stringify({ source, profile: "document" }),
) =>
  new Request("https://example.test/build/compile", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.user.mockResolvedValue({ id: userId });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.compile.mockResolvedValue({
    pdf: new Uint8Array([1, 2, 3]),
    pages: 1,
    text: "mock transport only",
    diagnostics: [],
    durationMs: 1,
  });
});

describe("standalone converter HTTP boundary (compiler mocked)", () => {
  it("redirects unauthenticated page loads and denies unauthenticated compilation", async () => {
    mocks.user.mockResolvedValue(null);
    const loader = await latexLoader(new Request("https://example.test/build"));
    expect(loader.status).toBe(302);
    expect(loader.headers.get("Location")).toBe("/auth?next=%2Fbuild");
    expect((await latexAction(request())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
  });
  it("keeps disabled converter unavailable for compilation", async () => {
    mocks.enabled = false;
    expect((await latexAction(request())).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
    const loader = await latexLoader(new Request("https://example.test/build"));
    expect(await loader.json()).toEqual({ enabled: false, aiEnabled: false });
  });
  it.each(["GET", "PUT", "DELETE", "PATCH"])(
    "refuses %s requests before privileged work",
    async (method) => {
      const response = await latexAction(
        new Request("https://example.test/build/compile", { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each([
    "https://foreign.test",
    "null",
    "",
    "https://example.test.attacker.test",
  ])("rejects an untrusted Origin %s", async (Origin) => {
    expect((await latexAction(request({ Origin }))).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
  });
  it("requires Origin even when fetch metadata is same-origin", async () => {
    const r = request({ "Sec-Fetch-Site": "same-origin" });
    r.headers.delete("Origin");
    expect((await latexAction(r)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("rejects contradictory fetch metadata and wrong target origin", async () => {
    expect(
      (await latexAction(request({ "Sec-Fetch-Site": "cross-site" }))).status,
    ).toBe(403);
    const r = new Request("https://foreign.test/build/compile", request());
    expect((await latexAction(r)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ])("rejects unsupported content type %s", async (type) => {
    expect((await latexAction(request({ "Content-Type": type }))).status).toBe(
      415,
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses only independent hashed converter buckets and forwards exact source", async () => {
    const r = request();
    const result = await latexAction(r);
    expect(result.status).toBe(200);
    expect(mocks.rpc.mock.calls).toEqual([
      [
        "consume_analysis_rate_limit",
        {
          p_key:
            "latex:user:" + createHash("sha256").update(userId).digest("hex"),
          p_limit: 3,
          p_window_seconds: 60,
        },
      ],
      [
        "consume_analysis_rate_limit",
        { p_key: "latex:global:v1", p_limit: 20, p_window_seconds: 60 },
      ],
    ]);
    const [prepared, options] = mocks.compile.mock.calls[0];
    expect(prepared.source).toBe(source);
    expect(options).toEqual({
      imageId: "sha256:" + "a".repeat(64),
      signal: r.signal,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(source);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(userId);
    expect(result.headers.get("Content-Type")).toBe("application/pdf");
    expect(result.headers.get("Content-Disposition")).toBe(
      'attachment; filename="document.pdf"',
    );
    expect(result.headers.get("X-Latex-Pages")).toBe("1");
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("Vary")).toContain("Cookie");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it.each([0, 1])(
    "denies exhausted rate bucket %i before compilation",
    async (bucket) => {
      if (bucket === 1)
        mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
      const response = await latexAction(request());
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(mocks.compile).not.toHaveBeenCalled();
    },
  );
  it("fails closed when shared admission storage fails and hides its details", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "PRIVATE-DB-DETAIL" },
    });
    const response = await latexAction(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE-DB-DETAIL");
    expect(mocks.compile).not.toHaveBeenCalled();
  });
  it.each([
    "not JSON",
    JSON.stringify({ source, profile: "document", imageId: "evil" }),
    JSON.stringify({
      source: source + " ".repeat(LATEX_LIMITS.sourceBytes),
      profile: "document",
    }),
  ])("refuses malformed, forged or oversized source bodies", async (body) => {
    const response = await latexAction(request({}, body));
    expect([400, 413]).toContain(response.status);
    expect(mocks.compile).not.toHaveBeenCalled();
  });
  it("bounds streamed request bytes independently of Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LATEX_LIMITS.sourceBytes * 6 + 1025));
        controller.close();
      },
    });
    const r = new Request("https://example.test/build/compile", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body,
      duplex: "half",
    } as RequestInit);
    expect((await latexAction(r)).status).toBe(413);
    expect(mocks.compile).not.toHaveBeenCalled();
  });
  it("rejects an already-aborted request with a non-delivering stream promptly", async () => {
    const controller = new AbortController();
    controller.abort();
    const r = new Request("https://example.test/build/compile", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body: new ReadableStream<Uint8Array>(),
      signal: controller.signal,
      duplex: "half",
    } as RequestInit);
    const started = performance.now();
    expect((await latexAction(r)).status).toBe(400);
    expect(performance.now() - started).toBeLessThan(500);
    expect(mocks.compile).not.toHaveBeenCalled();
  }, 1000);
  it.each([
    "busy",
    "cancelled",
    "timeout",
    "cleanup_failed",
    "output_invalid",
  ] as const)(
    "maps safe compiler failure %s without exposing internals",
    async (code) => {
      mocks.compile.mockRejectedValue(new LatexSandboxError(code));
      const response = await latexAction(request());
      expect(response.status).toBe(
        code === "busy"
          ? 429
          : code === "cancelled"
            ? 409
            : code === "cleanup_failed"
              ? 503
              : 422,
      );
      expect(await response.json()).toMatchObject({ code });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    },
  );
  it("never returns an arbitrary exception or source fragment", async () => {
    mocks.compile.mockRejectedValue(
      Error("PRIVATE-CONTENT /home/private/token"),
    );
    const response = await latexAction(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(
      /PRIVATE-CONTENT|\/home\/private/,
    );
  });
});
