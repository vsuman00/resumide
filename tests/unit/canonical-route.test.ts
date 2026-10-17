import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
  mutate: vi.fn(),
  enabled: true,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    APP_ORIGIN: "https://example.test",
    CANONICAL_AUTHORING_ENABLED: mocks.enabled,
  }),
}));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  loadCanonical: mocks.load,
  mutateCanonical: mocks.mutate,
}));
import { action, loader, headers } from "../../app/routes/analysis.canonical";
import {
  CanonicalError,
  readCanonicalForm,
} from "../../app/lib/server/canonical-repository";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function form() {
  return new URLSearchParams({
    operation: "confirm",
    expectedVersionId: id(2),
    idempotencyKey: id(3),
    factId: id(4),
  });
}
function args(body = form(), origin = "https://example.test", method = "POST") {
  return {
    request: new Request(`https://example.test/analysis/${id(1)}/canonical`, {
      method,
      headers: { Origin: origin },
      body,
    }),
    params: { id: id(1) },
  };
}
describe("canonical authorization and bounded forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.user.mockResolvedValue({ id: id(5) });
    mocks.mutate.mockResolvedValue({ revision: 2 });
    mocks.load.mockResolvedValue({ current: null, history: [] });
  });
  it("rejects cross-origin writes before authentication or privileged clients", async () => {
    expect(
      (await action(args(form(), "https://foreign.example.test"))).init?.status,
    ).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("requires sign-in before privileged calls", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await action(args())).init?.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    await expect(
      loader({
        request: new Request("https://example.test/canonical"),
        params: { id: id(1) },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });
  it("keeps authoring disabled by default and rejects unsupported methods", async () => {
    mocks.enabled = false;
    expect((await action(args())).init?.status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.enabled = true;
    const response = await action(args(form(), "https://example.test", "PUT"));
    expect(response.init?.status).toBe(405);
    expect(new Headers(response.init?.headers).get("Allow")).toBe("POST");
  });
  it.each(["ownerId", "organizationId", "confirmation", "__proto__"])(
    "rejects supplied %s",
    async (key) => {
      const values = form();
      values.set(key, id(99));
      expect((await action(args(values))).init?.status).toBe(422);
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate and oversized streamed forms", async () => {
    const duplicated = form();
    duplicated.append("factId", id(99));
    expect((await action(args(duplicated))).init?.status).toBe(422);
    const large = form();
    large.set("value", "x".repeat(17000));
    expect((await action(args(large))).init?.status).toBe(422);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("passes authenticated identity and preserves conflict status", async () => {
    mocks.mutate.mockRejectedValue(
      new CanonicalError(409, "Reload latest version."),
    );
    const response = await action(args());
    expect(response.init?.status).toBe(409);
    expect(mocks.mutate).toHaveBeenCalledWith(
      undefined,
      id(1),
      id(5),
      expect.objectContaining({ operation: "confirm" }),
      expect.any(String),
    );
    expect(new Headers(response.init?.headers).get("Cache-Control")).toContain(
      "no-store",
    );
  });
  it("rejects invalid read pagination before repository access", async () => {
    await expect(
      loader({
        request: new Request("https://example.test/canonical?offset=1.5"),
        params: { id: id(1) },
      }),
    ).rejects.toMatchObject({ init: { status: 422 } });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("does not accept JSON or silently normalize a supplied correction", async () => {
    await expect(
      readCanonicalForm(
        new Request("https://example.test/canonical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const values = new URLSearchParams({
      operation: "edit",
      expectedVersionId: id(2),
      idempotencyKey: id(3),
      factId: id(4),
      value: " padded ",
    });
    expect((await action(args(values))).init?.status).toBe(422);
  });
  it("preserves private SSR headers and refreshed cookies", () => {
    const result = new Headers(
      headers({
        parentHeaders: new Headers({
          "Content-Security-Policy": "default-src 'self'",
        }),
        loaderHeaders: new Headers({
          "Set-Cookie": "loader=refreshed; HttpOnly",
        }),
        actionHeaders: new Headers({
          "Set-Cookie": "action=refreshed; HttpOnly",
        }),
        errorHeaders: new Headers({ "Cache-Control": "public" }),
      }),
    );
    expect(result.get("Cache-Control")).toBe("private, no-store");
    expect(result.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(result.getSetCookie()).toHaveLength(2);
  });
});
