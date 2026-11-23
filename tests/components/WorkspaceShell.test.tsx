/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import WorkspaceShell from "~/components/WorkspaceShell";

afterEach(cleanup);

it("includes the workspace heading, description, action and content in one main landmark", async () => {
  const router = createMemoryRouter([
    {
      id: "root",
      path: "/",
      loader: () => ({ user: { email: "synthetic@example.test" } }),
      Component: () => (
        <WorkspaceShell
          eyebrow="Export workspace"
          title="Verified documents"
          description="Review the available document versions."
          action={<button type="button">Create document</button>}
        >
          <section aria-label="Document versions">Saved versions</section>
        </WorkspaceShell>
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, name: "Verified documents" });

  const mains = screen.getAllByRole("main");
  expect(mains).toHaveLength(1);
  const main = mains[0];
  expect(
    within(main).getByRole("heading", {
      level: 1,
      name: "Verified documents",
    }),
  ).toBeTruthy();
  expect(within(main).getByText("Export workspace")).toBeTruthy();
  expect(
    within(main).getByText("Review the available document versions."),
  ).toBeTruthy();
  expect(
    within(main).getByRole("button", { name: "Create document" }),
  ).toBeTruthy();
  expect(
    within(main).getByRole("region", { name: "Document versions" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("navigation", { name: "Main navigation" }).closest("main"),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Resumide home" }).closest("main"),
  ).toBeNull();
});
