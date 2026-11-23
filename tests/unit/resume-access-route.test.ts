import { beforeEach, expect, it, vi } from "vitest";
import type { Route } from "../../app/routes/+types/resume";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  owned: vi.fn(),
  result: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  ownedAnalysis: mocks.owned,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: () => ({
    from: (relation: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        abortSignal: () => query,
        maybeSingle: relation === "analyses" ? mocks.result : undefined,
        limit:
          relation === "document_evidence_attempts"
            ? mocks.evidence
            : undefined,
      };
      return query;
    },
  }),
}));

import { CanonicalError } from "../../app/lib/server/canonical-repository";
import { loader } from "../../app/routes/resume";

const owner = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
const binding = {
  id,
  owner_id: owner,
  organization_id: "10000000-0000-4000-8000-000000000003",
  resume_version_id: "10000000-0000-4000-8000-000000000004",
  resumeId: "10000000-0000-4000-8000-000000000005",
};

function load() {
  const url = new URL(`https://example.test/resume/${id}`);
  return loader({
    request: new Request(url),
    params: { id },
    url,
  } as Route.LoaderArgs);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: owner });
  mocks.owned.mockResolvedValue(binding);
  mocks.result.mockResolvedValue({
    data: { ...binding, status: "extracting" },
    error: null,
  });
  mocks.evidence.mockResolvedValue({ data: [], error: null });
});

it("denies a revoked owner before any saved result read", async () => {
  mocks.owned.mockRejectedValueOnce(new CanonicalError(404, "Private reason"));
  const denied = await load().catch((error: Response) => error);
  expect(denied).toBeInstanceOf(Response);
  expect((denied as Response).status).toBe(404);
  expect(await (denied as Response).text()).toBe("Resume analysis not found.");
  expect((denied as Response).headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
  expect(mocks.result).not.toHaveBeenCalled();
  expect(mocks.evidence).not.toHaveBeenCalled();
});

it("rechecks the source before the evidence redirect", async () => {
  mocks.evidence.mockResolvedValueOnce({
    data: [{ id: "attempt" }],
    error: null,
  });
  mocks.owned.mockResolvedValueOnce(binding).mockResolvedValueOnce({
    ...binding,
    resume_version_id: "10000000-0000-4000-8000-000000000006",
  });
  const denied = await load().catch((error: Response) => error);
  expect((denied as Response).status).toBe(404);
  expect((denied as Response).headers.get("Location")).toBeNull();
});

it("allows a current owned source to reach the evidence route", async () => {
  mocks.evidence.mockResolvedValueOnce({
    data: [{ id: "attempt" }],
    error: null,
  });
  const response = await load();
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe(
    `/analysis/${id}/evidence`,
  );
  expect(mocks.owned).toHaveBeenCalledTimes(2);
});

it("keeps progress and sign-in redirects private", async () => {
  const progress = await load().catch((error: Response) => error);
  expect((progress as Response).status).toBe(202);
  expect((progress as Response).headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
  mocks.user.mockResolvedValueOnce(null);
  const anonymous = await load().catch((error: Response) => error);
  expect((anonymous as Response).status).toBe(302);
  expect((anonymous as Response).headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
});
