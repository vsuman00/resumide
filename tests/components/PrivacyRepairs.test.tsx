/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  RouterProvider,
  RouterContextProvider,
} from "react-router";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
}));
vi.mock("~/lib/server/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "owner" }),
}));
vi.mock("~/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
import Privacy, { loader, headers } from "~/routes/privacy";

afterEach(cleanup);

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
  expect(mocks.select).toHaveBeenCalledWith("id, kind, status, created_at");
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

it("uses stable UTC dates and lets the browser handle the export attachment link", async () => {
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/privacy",
        Component: Privacy,
        loader: () => ({
          consents: [],
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
