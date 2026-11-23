import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn() }));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: () => ({}),
}));
import { loader } from "../../app/routes/home";
const args = (path: string) =>
  ({
    request: new Request(`https://example.test${path}`),
    url: new URL(`https://example.test${path}`),
    params: {},
    context: {},
  }) as Parameters<typeof loader>[0];
beforeEach(() => vi.clearAllMocks());
it("keeps the project homepage public without loading private history", async () => {
  mocks.user.mockResolvedValue({ id: "owner" });
  const result = await loader(args("/"));
  expect(result.data.isWorkspace).toBe(false);
  expect(result.data.entries).toEqual([]);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("requires authentication for the dedicated analysis workspace", async () => {
  mocks.user.mockResolvedValue(null);
  await expect(loader(args("/analyses"))).rejects.toMatchObject({
    status: 302,
  });
  expect(mocks.admin).not.toHaveBeenCalled();
});
