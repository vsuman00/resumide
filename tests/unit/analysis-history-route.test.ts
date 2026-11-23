import { beforeEach, expect, it, vi } from "vitest";
import type { Route } from "../../app/routes/+types/home";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  privateAccess: vi.fn(),
  authenticatedFrom: vi.fn(),
  adminFrom: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/privacy-deletion-policy", () => ({
  readCandidatePrivacyAccess: mocks.privateAccess,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseServerClient: () => ({ from: mocks.authenticatedFrom }),
  createSupabaseAdminClient: () => ({ from: mocks.adminFrom }),
}));

import { loader } from "../../app/routes/home";

function load(path = "/analyses") {
  const url = new URL(path, "http://localhost");
  return loader({ request: new Request(url), url } as Route.LoaderArgs);
}

const activeVersion = {
  owner_id: "owner",
  organization_id: "org",
  resumes: { owner_id: "owner", organization_id: "org", status: "active" },
};
const entry = {
  id: "visible",
  owner_id: "owner",
  organization_id: "org",
  status: "partial",
  created_at: "2026-11-21T12:00:00Z",
  jobs: { title: "Synthetic role", company_name: null },
  analysis_results: {
    feedback: { overallScore: 50, extraData: "synthetic detail" },
  },
  resume_versions: activeVersion,
};
const clear = { state: "clear", deletionPrepared: false };
const blocked = { state: "blocked", deletionPrepared: true };

beforeEach(() => {
  vi.resetAllMocks();
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    range: mocks.query,
  };
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.privateAccess.mockResolvedValue(clear);
  mocks.authenticatedFrom.mockReturnValue(builder);
  mocks.adminFrom.mockReturnValue(builder);
  mocks.query.mockResolvedValue({ data: [entry], error: null });
});

it("reads active history with the caller session and returns only the needed result score", async () => {
  const result = await load();
  expect(mocks.authenticatedFrom).toHaveBeenCalledWith("analyses");
  expect(mocks.adminFrom).not.toHaveBeenCalled();
  expect(mocks.privateAccess).toHaveBeenCalledTimes(2);
  expect(result.data.entries).toEqual([
    {
      id: entry.id,
      status: entry.status,
      created_at: entry.created_at,
      jobs: entry.jobs,
      score: 50,
    },
  ]);
  expect(new Headers(result.init?.headers).get("Cache-Control")).toBe(
    "private, no-store",
  );
});

it("omits foreign, deleted and cross-organization sources from the history payload", async () => {
  mocks.query.mockResolvedValueOnce({
    error: null,
    data: [
      entry,
      { ...entry, id: "foreign", owner_id: "other" },
      {
        ...entry,
        id: "other-org",
        resume_versions: { ...activeVersion, organization_id: "other" },
      },
      {
        ...entry,
        id: "deleted",
        resume_versions: {
          ...activeVersion,
          resumes: { ...activeVersion.resumes, status: "deleted" },
        },
      },
    ],
  });
  expect((await load()).data.entries.map(({ id }) => id)).toEqual(["visible"]);
});

it("withholds all history before data access when deletion is pending", async () => {
  mocks.privateAccess.mockResolvedValueOnce(blocked);
  expect((await load()).data.entries).toEqual([]);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("withholds the returned history when deletion begins during the read", async () => {
  mocks.privateAccess
    .mockResolvedValueOnce(clear)
    .mockResolvedValueOnce(blocked);
  expect((await load()).data.entries).toEqual([]);
  expect(mocks.query).toHaveBeenCalledOnce();
});

it("returns a private error when candidate access cannot be checked", async () => {
  mocks.privateAccess.mockResolvedValueOnce({ state: "unavailable" });
  const result = await load().catch((error: unknown) => error);
  expect(result).toBeInstanceOf(Response);
  expect((result as Response).status).toBe(503);
  expect((result as Response).headers.get("Cache-Control")).toContain(
    "no-store",
  );
  expect(mocks.query).not.toHaveBeenCalled();
});

it("keeps public home independent of candidate history and redirects signed-out reads", async () => {
  expect((await load("/")).data.isWorkspace).toBe(false);
  mocks.user.mockResolvedValueOnce(null);
  const denied = await load().catch((error: unknown) => error);
  expect(denied).toBeInstanceOf(Response);
  expect((denied as Response).headers.get("Location")).toBe(
    "/auth?next=%2Fanalyses",
  );
  expect((denied as Response).headers.get("Cache-Control")).toContain(
    "no-store",
  );
  expect(mocks.query).not.toHaveBeenCalled();
});
