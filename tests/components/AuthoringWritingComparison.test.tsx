/** @vitest-environment jsdom */
import { randomUUID } from "node:crypto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it } from "vitest";
import AuthoringWorkspace from "../../app/components/AuthoringWorkspace";
import { scoreFixture } from "../fixtures/scoring-v2";
import {
  buildSuggestion,
  clarifyValue,
  withheldDelta,
} from "../../app/lib/server/authoring-contract";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";

afterEach(cleanup);
function fixture(unchanged = false) {
  const f = scoreFixture();
  const fact = f.canonical.facts.find(
    (value) => value.type === "contribution",
  )!;
  if (!unchanged) {
    fact.value = clarifyValue(
      clarifyValue(fact.value, "result", "Fewer release failures"),
      "scope",
      "Internal services",
    );
    fact.sources = [];
    fact.confirmation!.value = fact.value;
  }
  f.canonical.sections
    .find((s) => s.type === "experience")!
    .entries[0].bullets.push({
      id: randomUUID(),
      text: fact.value,
      factIds: [fact.id],
    });
  const diagnostics = buildScoreDiagnostics({
    evidence: f.evidence,
    canonical: f.canonical,
    requirements: f.requirements,
  });
  const patch = buildSuggestion(
    f.canonical,
    fact.id,
    unchanged ? "xyz" : "action_scope_result",
    diagnostics,
  );
  const model: Parameters<typeof AuthoringWorkspace>[0]["model"] = {
    document: f.canonical,
    editable: true,
    findings: { top: [], remaining: [], total: 0 },
    patches: [patch],
    events: [],
    history: [],
    nextOffset: null,
    selectedFactId: fact.id,
    formKey: randomUUID(),
    formKeys: {
      [`accept:${patch.id}`]: randomUUID(),
      [`reject:${patch.id}`]: randomUUID(),
    },
    projected: withheldDelta(f.canonical.versionId, null, "test-policy"),
    actual: withheldDelta(
      f.canonical.versionId,
      f.canonical.versionId,
      "test-policy",
    ),
  };
  return { ...f, fact, patch, model };
}
async function show(f: ReturnType<typeof fixture>) {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "*",
            element: (
              <AuthoringWorkspace
                model={f.model}
                analysisId={f.canonical.analysisId}
              />
            ),
          },
        ],
        { initialEntries: [`/analysis/${f.canonical.analysisId}/score`] },
      )}
    />,
  );
  await screen.findByRole("heading", { name: "Grounded writing review" });
}
it("shows projected text observations from the actual patch without replacing full wording review", async () => {
  const f = fixture();
  await show(f);
  const region = screen.getByRole("region", {
    name: /^Projected writing observations \(not saved\)/,
  });
  expect(
    within(region).getByText(
      /Text counts and writing warnings are observations/u,
    ),
  ).toBeTruthy();
  expect(
    within(region).getByText(f.canonical.versionId, { exact: false }),
  ).toBeTruthy();
  expect(
    screen.getByRole("blockquote", { name: "Complete current wording" })
      .textContent,
  ).toBe(f.fact.value);
  expect(
    screen.getByRole("blockquote", { name: "Complete proposed wording" })
      .textContent,
  ).toBe(f.patch.operations[0].value);
});
it("does not carry source references or confirmation into an unchanged unsaved preview", async () => {
  const f = fixture(true);
  expect(f.fact.sources.length).toBeGreaterThan(0);
  expect(f.fact.confirmation).not.toBeNull();
  expect(f.patch.operations[0].value).toBe(f.fact.value);
  await show(f);
  const view = within(
    screen.getByRole("region", {
      name: /^Projected writing observations \(not saved\)/,
    }),
  );
  expect(view.getByText("Wording unchanged")).toBeTruthy();
  expect(
    view.getByText(
      /Proposed text has no saved version, source references or confirmation/u,
    ),
  ).toBeTruthy();
  expect(view.queryByText(/Saved version comparison/u)).toBeNull();
});
it("preserves exact acceptance fields and a fresh explicit acknowledgement", async () => {
  const f = fixture();
  await show(f);
  const button = screen.getByRole("button", {
    name: "Accept action scope result",
  });
  const form = button.closest("form")!;
  const data = new FormData(form);
  expect(data.get("patch")).toBe(JSON.stringify(f.patch));
  expect(data.get("expectedVersionId")).toBe(f.canonical.versionId);
  expect(data.get("idempotencyKey")).toBe(
    f.model.formKeys[`accept:${f.patch.id}`],
  );
  expect(data.get("confirmation")).toBeNull();
  await userEvent.setup().click(within(form).getByRole("checkbox"));
  expect(new FormData(form).get("confirmation")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Reject action scope result" })
      .closest("form")!
      .querySelector('input[name="action"]')
      ?.getAttribute("value"),
  ).toBe("reject");
});
it("keeps historical authoring read-only while calling a proposal projected", async () => {
  const f = fixture();
  f.model.editable = false;
  await show(f);
  expect(
    screen.getByRole("region", {
      name: /^Projected writing observations \(not saved\)/,
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /Historical version: editing and acceptance are disabled/u,
    ),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Accept action scope result" }),
  ).toBeNull();
});
