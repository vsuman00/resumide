/** @vitest-environment jsdom */
import { randomUUID } from "node:crypto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import AuthoringWorkspace from "../../app/components/AuthoringWorkspace";
import { scoreFixture } from "../fixtures/scoring-v2";
import {
  buildSuggestion,
  clarifyValue,
  withheldDelta,
} from "../../app/lib/server/authoring-contract";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";

afterEach(cleanup);
function fixture(
  pattern:
    | "xyz"
    | "action_impact_context"
    | "action_scope_result" = "action_scope_result",
  complete = true,
  recordedSource = false,
) {
  const f = scoreFixture();
  const fact = f.canonical.facts.find((v) => v.type === "contribution")!;
  if (!recordedSource)
    for (const [kind, answer] of [
      ["result", "Fewer release failures"],
      ["scope", "Internal services"],
      ...(complete
        ? [
            ["measurement", "Release review records"],
            ["method", "Automated checks"],
          ]
        : []),
    ] as const) {
      fact.value = clarifyValue(
        fact.value,
        kind as "result" | "scope" | "measurement" | "method",
        answer,
      );
    }
  if (!recordedSource) fact.sources = [];
  fact.confirmation!.value = fact.value;
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
  const patch = buildSuggestion(f.canonical, fact.id, pattern, diagnostics);
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
  const action = vi.fn(async () => null);
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "/analysis/:id/*",
            element: (
              <AuthoringWorkspace
                model={f.model}
                analysisId={f.canonical.analysisId}
              />
            ),
            action,
          },
        ],
        { initialEntries: [`/analysis/${f.canonical.analysisId}/score`] },
      )}
    />,
  );
  await screen.findByRole("heading", { name: "Grounded writing review" });
  const article = screen
    .getByRole("heading", { name: f.patch.pattern.replaceAll("_", " ") })
    .closest("article")!;
  return { article, action };
}
it.each([
  ["xyz", /result first.*recorded measurement and method/u],
  ["action_impact_context", /original action first.*recorded result.*scope/u],
  ["action_scope_result", /original action first.*recorded scope.*result/u],
] as const)(
  "shows complete before/after and the actual %s structural reason",
  async (pattern, reason) => {
    const f = fixture(pattern);
    const { article } = await show(f);
    const view = within(article);
    expect(
      view.getByRole("blockquote", { name: "Complete current wording" })
        .textContent,
    ).toBe(f.fact.value);
    expect(
      view.getByRole("blockquote", { name: "Complete proposed wording" })
        .textContent,
    ).toBe(f.patch.operations[0].value);
    expect(view.getByText(reason)).toBeTruthy();
    expect(view.getByText(/not added qualification evidence/u)).toBeTruthy();
  },
);
it("shows exact unchanged source fact binding and recorded provenance without upgrading historical references", async () => {
  const f = fixture("action_scope_result", true, true);
  const { article } = await show(f);
  const view = within(
    within(article)
      .getByText("Unchanged fact binding and recorded provenance")
      .closest("details")!,
  );
  expect(view.getByText(f.fact.id, { exact: false })).toBeTruthy();
  expect(
    view.getByText(/Recorded provenance may describe earlier wording/u),
  ).toBeTruthy();
  expect(
    view.getByText(/Candidate confirmation is a declaration/u),
  ).toBeTruthy();
  const provenance = view.getByRole("link", {
    name: "Inspect the bound fact and recorded provenance",
  });
  expect(provenance.getAttribute("href")).toBe(
    `/analysis/${f.canonical.analysisId}/canonical?version=${f.patch.baseVersionId}#fact-${f.fact.id}`,
  );
  for (const source of f.fact.sources) {
    expect(view.getByText(new RegExp(source.spanId, "u"))).toBeTruthy();
  }
});
it("keeps projected and saved diagnostics distinct and numerical outcomes unavailable", async () => {
  const f = fixture();
  const { article } = await show(f);
  expect(
    within(article).getByText(
      /Projected before acceptance: unavailable.*Actual after a saved version: unavailable.*Numeric delta: unavailable/u,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      new RegExp(
        `Actual diagnostics use saved version ${f.canonical.versionId}`,
        "u",
      ),
    ),
  ).toBeTruthy();
});
it("preserves the exact acceptance payload, explicit acknowledgement and reject action", async () => {
  const f = fixture();
  const { article, action } = await show(f);
  const view = within(article);
  const accept = view.getByRole("button", {
    name: "Accept action scope result",
  });
  const form = accept.closest("form")!;
  const before = new FormData(form);
  expect(before.get("patch")).toBe(JSON.stringify(f.patch));
  expect(before.get("expectedVersionId")).toBe(f.canonical.versionId);
  expect(before.get("idempotencyKey")).toBe(
    f.model.formKeys[`accept:${f.patch.id}`],
  );
  expect(before.get("confirmation")).toBeNull();
  expect(
    view
      .getByRole("button", { name: "Reject action scope result" })
      .closest("form")!
      .querySelector('input[name="action"]')
      ?.getAttribute("value"),
  ).toBe("reject");
  await userEvent.setup().click(
    view.getByRole("checkbox", {
      name: "I reviewed and confirm every proposed claim.",
    }),
  );
  expect(new FormData(form).get("confirmation")).toBe("true");
  expect(action).not.toHaveBeenCalled();
});
it("leaves incomplete XYZ unavailable without making measurements mandatory for the metric-free alternative", async () => {
  const f = fixture("xyz", false);
  const { article } = await show(f);
  expect(
    (
      within(article).getByRole("button", {
        name: "Accept xyz",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    within(article).getByText("Clarification needed: measurement, method"),
  ).toBeTruthy();
  expect(fixture("action_scope_result", false).patch.state).toBe("ready");
});
it("preserves historical read-only state", async () => {
  const f = fixture();
  f.model.editable = false;
  const { article } = await show(f);
  expect(within(article).queryByRole("button")).toBeNull();
  expect(
    screen.getByText(
      /Historical version: editing and acceptance are disabled/u,
    ),
  ).toBeTruthy();
});

it("explains that an incomplete unchanged patch retains current wording", async () => {
  const f = fixture("xyz", false);
  expect(f.patch.state).toBe("clarification_required");
  expect(f.patch.operations[0].value).toBe(f.fact.value);
  const { article } = await show(f);
  const view = within(article);
  expect(
    view.getByText(
      /Current wording is retained; no wording change is proposed yet/u,
    ),
  ).toBeTruthy();
  expect(view.queryByText(/These are structural wording changes/u)).toBeNull();
  expect(
    view.getByText(
      /Clarify only details you know; unknown answers may remain unanswered/u,
    ),
  ).toBeTruthy();
  expect(
    view.getByText(
      /A measurement is not required to use the metric-free alternatives/u,
    ),
  ).toBeTruthy();
});
