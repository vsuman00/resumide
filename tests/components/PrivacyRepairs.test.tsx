/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  RouterProvider,
  RouterContextProvider,
} from "react-router";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  access: vi.fn(),
}));
vi.mock("~/lib/server/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "owner" }),
}));
vi.mock("~/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("~/lib/server/privacy-deletion-policy", () => ({
  readCandidatePrivacyAccess: mocks.access,
}));
import Privacy, { loader, headers } from "~/routes/privacy";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ state: "clear", deletionPrepared: false });
});

function historyReply(rows: unknown[] | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  const consents = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  mocks.admin.mockReturnValue({
    from: (table: string) => (table === "data_requests" ? query : consents),
  });
  return query;
}

function load() {
  return loader({
    request: new Request("https://example.test/privacy"),
    params: {},
    context: new RouterContextProvider(),
    url: new URL("https://example.test/privacy"),
    pattern: "/privacy",
  });
}

function renderSummary(summary: unknown) {
  const router = createMemoryRouter(
    [{ path: "/privacy", Component: Privacy, loader: () => summary }],
    { initialEntries: ["/privacy"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const summary = (overrides = {}) => ({
  id: "deletion-id",
  kind: "deletion",
  status: "queued",
  created_at: "2026-11-21T00:00:00Z",
  ...overrides,
});

it("loads only privacy request summaries and prevents private response caching", async () => {
  const query = {
    select: mocks.select,
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  mocks.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [] });
  mocks.admin.mockReturnValue({ from: () => query });
  await loader({
    request: new Request("https://example.test/privacy"),
    params: {},
    context: new RouterContextProvider(),
    url: new URL("https://example.test/privacy"),
    pattern: "/privacy",
  });
  expect(mocks.select).toHaveBeenCalledWith(
    "id, kind, status, created_at, last_error_code",
  );
  expect(
    mocks.select.mock.calls.some(([columns]) =>
      String(columns).includes("result_manifest"),
    ),
  ).toBe(false);
  const responseHeaders = new Headers(
    headers({
      loaderHeaders: new Headers(),
      actionHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    }),
  );
  expect(responseHeaders.get("Cache-Control")).toBe("private, no-store");
  expect(responseHeaders.get("Vary")).toBe("Cookie");
});

it("projects only the admitted upload-cleanup hold and strips raw error codes", async () => {
  const query = historyReply([
    summary({ last_error_code: "ADMISSION_RETIREMENT_REQUIRED" }),
    summary({
      id: "inventory",
      last_error_code: "ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE",
    }),
    summary({ id: "unknown", last_error_code: "PRIVATE_UNKNOWN_FAILURE" }),
    summary({ id: "none", last_error_code: null }),
  ]);
  const response = await load();
  expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(query.limit).toHaveBeenCalledWith(20);
  expect(response.data.requests).toEqual([
    { ...summary(), uploadCleanupHold: true },
    { ...summary({ id: "inventory" }), uploadCleanupHold: true },
    { ...summary({ id: "unknown" }), uploadCleanupHold: false },
    { ...summary({ id: "none" }), uploadCleanupHold: false },
  ]);
  expect(response.data.historyUnavailable).toBe(false);
  expect(JSON.stringify(response.data)).not.toContain("last_error_code");
  expect(JSON.stringify(response.data)).not.toContain(
    "ADMISSION_RETIREMENT_REQUIRED",
  );
  expect(JSON.stringify(response.data)).not.toContain(
    "ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE",
  );
  expect(JSON.stringify(response.data)).not.toContain(
    "PRIVATE_UNKNOWN_FAILURE",
  );
});

it.each([
  { rows: null, error: { message: "private failure" } },
  { rows: [summary()], error: { message: "private partial failure" } },
  { rows: null, error: null },
])(
  "shows unavailable history instead of an empty or partial success %#",
  async ({ rows, error }) => {
    historyReply(rows, error);
    const response = await load();
    expect(response.data.historyUnavailable).toBe(true);
    expect(response.data.requests).toEqual([]);
    renderSummary(response.data);
    const history = await screen.findByRole("region", {
      name: "Recent requests",
    });
    expect(within(history).getByRole("alert").textContent).toBe(
      "Request history is unavailable. Try again later.",
    );
    expect(within(history).queryByText("No privacy requests yet.")).toBeNull();
    expect(within(history).queryByText("0 shown")).toBeNull();
    expect(
      within(history).queryByRole("link", { name: "Download export" }),
    ).toBeNull();
    expect(history.textContent).not.toContain("private");
  },
);

it("keeps a successful empty history distinct from an unavailable history", async () => {
  historyReply([]);
  const response = await load();
  expect(response.data.historyUnavailable).toBe(false);
  renderSummary(response.data);
  const history = await screen.findByRole("region", {
    name: "Recent requests",
  });
  expect(within(history).getByText("No privacy requests yet.")).toBeTruthy();
  expect(within(history).queryByRole("alert")).toBeNull();
});

it("contains a rejected history read without exposing its private error", async () => {
  historyReply([]).limit.mockRejectedValueOnce(
    new Error("private transport detail"),
  );
  const response = await load();
  expect(response.data.historyUnavailable).toBe(true);
  expect(response.data.requests).toEqual([]);
  expect(JSON.stringify(response.data)).not.toContain(
    "private transport detail",
  );
  renderSummary(response.data);
  const history = await screen.findByRole("region", {
    name: "Recent requests",
  });
  expect(within(history).getByRole("alert")).toBeTruthy();
  expect(
    within(history).queryByText(
      "Export downloads are unavailable because an account deletion request is on record.",
    ),
  ).toBeNull();
});

it.each(["queued", "failed"])(
  "explains an upload-cleanup hold for a %s request without adding recovery actions",
  async (status) => {
    historyReply([
      summary({ status, last_error_code: "ADMISSION_RETIREMENT_REQUIRED" }),
    ]);
    mocks.access.mockResolvedValue({
      state: "blocked",
      deletionPrepared: true,
    });
    const response = await load();
    renderSummary(response.data);
    const history = await screen.findByRole("region", {
      name: "Recent requests",
    });
    const row = within(history).getByRole("listitem");
    expect(within(row).getByRole("status").textContent).toBe(
      "Upload cleanup is still required. Request processing is on hold.",
    );
    expect(within(row).getByText(status)).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.textContent).not.toContain("ADMISSION_RETIREMENT_REQUIRED");
  },
);

it("does not label an unknown failure as an upload-cleanup hold", async () => {
  historyReply([
    summary({ status: "failed", last_error_code: "OTHER_FAILURE" }),
  ]);
  renderSummary((await load()).data);
  const row = within(
    await screen.findByRole("region", { name: "Recent requests" }),
  ).getByRole("listitem");
  expect(within(row).getByText("failed")).toBeTruthy();
  expect(within(row).queryByRole("status")).toBeNull();
  expect(row.textContent).not.toContain("OTHER_FAILURE");
});

it("qualifies a historical completed deletion while keeping export completion unchanged", async () => {
  historyReply([
    summary({ status: "completed" }),
    summary({ id: "export-id", kind: "export", status: "completed" }),
  ]);
  renderSummary((await load()).data);
  const rows = within(
    await screen.findByRole("region", { name: "Recent requests" }),
  ).getAllByRole("listitem");
  expect(
    within(rows[0]).getByText("Request processing completed"),
  ).toBeTruthy();
  expect(
    within(rows[0]).getByText(
      "This status does not confirm full account erasure.",
    ),
  ).toBeTruthy();
  expect(within(rows[0]).queryByText("completed", { exact: true })).toBeNull();
  expect(within(rows[1]).getByText("completed", { exact: true })).toBeTruthy();
});

it("uses stable UTC dates and lets the browser handle the export attachment link", async () => {
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/privacy",
        Component: Privacy,
        loader: () => ({
          consents: [],
          exportDownloadAccess: "allowed",
          requests: [
            {
              id: "export-id",
              kind: "export",
              status: "completed",
              created_at: "2026-10-16T23:30:00-07:00",
            },
          ],
        }),
      },
    ],
    { initialEntries: ["/privacy"] },
  );
  render(<RouterProvider router={router} />);
  const link = await screen.findByRole("link", { name: "Download export" });
  expect(link.getAttribute("href")).toBe(
    "/api/privacy/requests/export-id/export",
  );
  expect(screen.getByText(/17 Oct 2026/)).toBeTruthy();
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  // Cancel the browser default after React has had the opportunity to intercept it.
  let intercepted: boolean | undefined;
  const stopNavigation = (event: MouseEvent) => {
    intercepted = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", stopNavigation, { once: true });
  link.dispatchEvent(click);
  expect(intercepted).toBe(false);
  expect(router.state.location.pathname).toBe("/privacy");
});
