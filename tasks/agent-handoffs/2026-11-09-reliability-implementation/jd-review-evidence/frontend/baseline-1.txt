import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
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
    JOB_INTELLIGENCE_ENABLED: mocks.enabled,
  }),
}));
vi.mock(
  "../../app/lib/server/job-requirement-repository",
  async (original) => ({
    ...(await original<
      typeof import("../../app/lib/server/job-requirement-repository")
    >()),
    loadJobRequirements: mocks.load,
    saveJobRequirements: mocks.save,
  }),
);
import {
  action,
  loader,
  headers,
} from "../../app/routes/analysis.requirements";
import { readJobRequirementForm } from "../../app/lib/server/job-requirement-repository";
const id = "11111111-1111-4111-8111-111111111111";
function request(
  body = new URLSearchParams({ expectedVersionId: "", idempotencyKey: id }),
  origin = "https://example.test",
) {
  return new Request("https://example.test/requirements", {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
}
describe("JD route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.user.mockResolvedValue({ id });
    mocks.save.mockResolvedValue({ revision: 1 });
    mocks.load.mockResolvedValue({ current: null, history: [] });
  });
  it("checks origin and authentication before privileged clients", async () => {
    expect(
      (
        await action({
          request: request(undefined, "https://foreign.test"),
          params: { id },
        })
      ).init?.status,
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue(null);
    expect(
      (await action({ request: request(), params: { id } })).init?.status,
    ).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("defaults off and rejects invalid pagination", async () => {
    mocks.enabled = false;
    await expect(
      loader({
        request: new Request("https://example.test/requirements"),
        params: { id },
      }),
    ).rejects.toMatchObject({ init: { status: 404 } });
    mocks.enabled = true;
    await expect(
      loader({
        request: new Request("https://example.test/requirements?offset=-1"),
        params: { id },
      }),
    ).rejects.toMatchObject({ init: { status: 422 } });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("saves using authenticated identity and private headers", async () => {
    const result = await action({ request: request(), params: { id } });
    expect(new Headers(result.init?.headers).get("Cache-Control")).toContain(
      "no-store",
    );
    expect(mocks.save).toHaveBeenCalledWith(
      undefined,
      id,
      id,
      { expectedVersionId: null, idempotencyKey: id },
      expect.any(String),
    );
  });
  it.each(["ownerId", "sourceText", "score", "__proto__"])(
    "rejects client supplied %s",
    async (field) => {
      const body = new URLSearchParams({
        expectedVersionId: "",
        idempotencyKey: id,
        [field]: "fake",
      });
      expect(
        (await action({ request: request(body), params: { id } })).init?.status,
      ).toBe(422);
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate and oversized forms", async () => {
    const body = new URLSearchParams({
      expectedVersionId: "",
      idempotencyKey: id,
    });
    body.append("idempotencyKey", id);
    await expect(readJobRequirementForm(request(body))).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      readJobRequirementForm(
        request(new URLSearchParams({ sourceText: "x".repeat(1025) })),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("retains refreshed cookies on private responses", async () => {
    const h = new Headers(
      await headers({
        parentHeaders: new Headers(),
        loaderHeaders: new Headers({
          "Set-Cookie": "session=refreshed; HttpOnly",
        }),
        actionHeaders: new Headers(),
        errorHeaders: new Headers(),
      } as Parameters<typeof headers>[0]),
    );
    expect(h.get("Set-Cookie")).toContain("refreshed");
    expect(h.get("Cache-Control")).toContain("no-store");
  });
});
