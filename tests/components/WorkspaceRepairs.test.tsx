/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
import AuthoringWorkspace from "~/components/AuthoringWorkspace";
import WorkspaceShell from "~/components/WorkspaceShell";
import { StageTimeline } from "~/components/StageTimeline";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";
import { withheldDelta } from "~/lib/server/authoring-contract";
import { randomUUID } from "node:crypto";

afterEach(cleanup);

it("rebinds writing selection and clears clarification text and confirmation when focus changes", async () => {
  const { canonical } = scoreFixture(
    SCORE_SOURCE.replace(
      "Built reliable services",
      "Built reliable services\nImproved release tooling",
    ),
  );
  const contributions = canonical.facts.filter(
    (fact) => fact.type === "contribution",
  );
  expect(contributions.length).toBeGreaterThanOrEqual(2);
  const model = {
    document: canonical,
    editable: true,
    findings: { top: [], remaining: [], total: 0 },
    patches: [],
    events: [],
    history: [],
    nextOffset: null,
    selectedFactId: contributions[0].id,
    formKey: randomUUID(),
    formKeys: {},
    projected: withheldDelta(canonical.versionId, null, "test-policy"),
    actual: withheldDelta(
      canonical.versionId,
      canonical.versionId,
      "test-policy",
    ),
  };
  const router = createMemoryRouter([
    {
      path: "/",
      loader: ({ request }) => ({
        ...model,
        selectedFactId:
          new URL(request.url).searchParams.get("focus") ?? contributions[0].id,
      }),
      Component: function Workspace() {
        const loaded = useLoaderData<typeof model>();
        return <AuthoringWorkspace model={loaded} analysisId="analysis" />;
      },
    },
  ]);
  render(<RouterProvider router={router} />);
  const input = await screen.findByLabelText(
    "What result can you truthfully attribute to this contribution?",
  );
  fireEvent.change(input, {
    target: { value: "Draft for first contribution" },
  });
  const form = input.closest("form")!;
  fireEvent.click(within(form).getByRole("checkbox"));
  await router.navigate(`/?focus=${contributions[1].id}`);
  await waitFor(
    () =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Contribution to review",
          }) as HTMLSelectElement
        ).value,
      ).toBe(contributions[1].id),
    { timeout: 5000 },
  );
  const next = screen.getByLabelText(
    "What result can you truthfully attribute to this contribution?",
  ) as HTMLInputElement;
  expect(next.value).toBe("");
  expect(
    (within(next.closest("form")!).getByRole("checkbox") as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(
    (
      screen.getByRole("combobox", {
        name: "Contribution to review",
      }) as HTMLSelectElement
    ).value,
  ).toBe(contributions[1].id);
  expect(
    (
      next
        .closest("form")!
        .querySelector('[name="targetFactId"]') as HTMLInputElement
    ).value,
  ).toBe(contributions[1].id);
  fireEvent.change(next, {
    target: { value: "Draft for second contribution" },
  });
  await router.navigate(-1);
  await waitFor(
    () =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Contribution to review",
          }) as HTMLSelectElement
        ).value,
      ).toBe(contributions[0].id),
    { timeout: 5000 },
  );
  const restored = screen.getByLabelText(
    "What result can you truthfully attribute to this contribution?",
  ) as HTMLInputElement;
  expect(restored.value).toBe("");
  fireEvent.change(restored, {
    target: { value: "Draft before cached-page restore" },
  });
  fireEvent.click(within(restored.closest("form")!).getByRole("checkbox"));
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
  expect(restored.value).toBe("");
  expect(
    (
      within(restored.closest("form")!).getByRole(
        "checkbox",
      ) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

it("provides Privacy and the current-session sign-out form on mobile surfaces", async () => {
  const router = createMemoryRouter([
    {
      id: "root",
      path: "/",
      loader: () => ({ user: { email: "synthetic@example.test" } }),
      Component: () => (
        <WorkspaceShell title="Workspace">Content</WorkspaceShell>
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Workspace" });
  const mobileNavigation = document.querySelector(
    ".workspace-mobile-tabs",
  ) as HTMLElement;
  expect(
    within(mobileNavigation)
      .getByRole("link", { name: "Privacy" })
      .getAttribute("href"),
  ).toBe("/privacy");
  const header = document.querySelector(
    ".workspace-mobile-header",
  ) as HTMLElement;
  expect(
    within(header)
      .getByRole("button", { name: "Sign out" })
      .closest("form")!
      .getAttribute("action"),
  ).toBe("/auth/logout");
});

it("shows a partial result as saved while marking qualitative feedback unavailable", () => {
  render(<StageTimeline status="partial" updatedAt="2026-10-16T00:00:00Z" />);
  const items = screen.getAllByRole("listitem");
  expect(within(items[3]).getAllByText("Unavailable").length).toBeGreaterThan(
    0,
  );
  expect(within(items[4]).getByText("Complete")).toBeTruthy();
  expect(screen.queryByText("Pending")).toBeNull();
});

it("shows saved extraction as needing review and later stages as blocked", () => {
  render(<StageTimeline status="needs_ocr" updatedAt="2026-10-16T00:00:00Z" />);
  const items = screen.getAllByRole("listitem");
  expect(within(items[0]).getByText("Complete")).toBeTruthy();
  expect(within(items[1]).getAllByText("Needs review").length).toBeGreaterThan(
    0,
  );
  expect(screen.getAllByText("Blocked pending evidence review")).toHaveLength(
    3,
  );
  expect(screen.queryByText("Current stage")).toBeNull();
});

it("does not label cancelled work as pending or active", () => {
  render(<StageTimeline status="cancelled" updatedAt="2026-10-16T00:00:00Z" />);
  expect(screen.getAllByText("Not completed")).toHaveLength(5);
  expect(screen.queryByText("Current stage")).toBeNull();
  expect(screen.queryByText("Pending")).toBeNull();
});
