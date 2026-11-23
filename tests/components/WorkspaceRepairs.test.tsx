/** @vitest-environment jsdom */

import {
  act,
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
  useActionData,
  useLoaderData,
} from "react-router";
import type { ClarificationPreview } from "~/lib/server/authoring-repository";
import AuthoringWorkspace, {
  type AuthoringFeedback,
} from "~/components/AuthoringWorkspace";
import WorkspaceShell from "~/components/WorkspaceShell";
import { StageTimeline } from "~/components/StageTimeline";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";
import {
  buildSuggestion,
  clarifyValue,
  withheldDelta,
} from "~/lib/server/authoring-contract";
import { buildScoreDiagnostics } from "~/lib/server/score-v2-engine";
import { createHash, randomUUID } from "node:crypto";

afterEach(cleanup);

type AuthoringModel = Parameters<typeof AuthoringWorkspace>[0]["model"];
type PreviewFeedback = AuthoringFeedback & { preview?: ClarificationPreview };
function confirmationFixture(source = SCORE_SOURCE) {
  const f = scoreFixture(source);
  const fact = f.canonical.facts.find(
    (value) => value.type === "contribution",
  )!;
  fact.value = clarifyValue(
    clarifyValue(fact.value, "scope", "Internal services"),
    "result",
    "Fewer release failures",
  );
  fact.sources = [];
  fact.confirmation!.value = fact.value;
  f.canonical.sections
    .find((section) => section.type === "experience")!
    .entries[0].bullets.push({
      id: randomUUID(),
      factIds: [fact.id],
      text: fact.value,
    });
  const diagnostics = buildScoreDiagnostics({
    evidence: f.evidence,
    canonical: f.canonical,
    requirements: f.requirements,
  });
  const patch = buildSuggestion(
    f.canonical,
    fact.id,
    "action_scope_result",
    diagnostics,
  );
  const model: AuthoringModel = {
    document: f.canonical,
    editable: true,
    findings: { top: [], remaining: [], total: 0 },
    patches: [patch],
    events: [],
    history: [],
    nextOffset: null,
    selectedFactId: fact.id,
    formKey: randomUUID(),
    formKeys: { [`confirm:${fact.id}`]: randomUUID() },
    projected: withheldDelta(f.canonical.versionId, null, "test-policy"),
    actual: withheldDelta(
      f.canonical.versionId,
      f.canonical.versionId,
      "test-policy",
    ),
  };
  return { model, fact };
}
async function mountConfirmation(
  model: AuthoringModel,
  feedback?: PreviewFeedback,
) {
  const state = { model, feedback };
  const router = createMemoryRouter([
    {
      path: "/",
      loader: () => ({ ...state }),
      Component: function Workspace() {
        const loaded = useLoaderData<typeof state>();
        return (
          <AuthoringWorkspace
            model={loaded.model}
            analysisId="analysis"
            feedback={loaded.feedback}
          />
        );
      },
    },
  ]);
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", {
    name: "Edit your resume on this analysis",
  });
  return {
    state,
    async revalidate() {
      await act(async () => {
        await router.revalidate();
      });
    },
  };
}
function clarificationAnswer() {
  return screen.getByLabelText(
    "What result can you truthfully attribute to this contribution?",
  ) as HTMLInputElement;
}
function reviewCheckbox(form: HTMLFormElement) {
  return within(form).getByRole("checkbox", {
    hidden: true,
  }) as HTMLInputElement;
}
function recoveryForm() {
  return screen
    .getByText("Save reviewed correction against current version")
    .closest("form")!;
}
function clarificationPreviewForm() {
  return within(screen.getByRole("region", { name: "Clarification preview" }))
    .getByRole("button", { name: "Confirm complete fact" })
    .closest("form")!;
}
function retainedFeedback(model: AuthoringModel, factId: string) {
  return {
    error: "The resume changed. Review the latest version.",
    submitted: {
      action: "edit",
      expectedVersionId: model.document.parentVersionId ?? randomUUID(),
      idempotencyKey: randomUUID(),
      targetFactId: factId,
      value: "Retained correction",
    },
  };
}
function previewFeedback(
  model: AuthoringModel,
  targetFactId: string,
  value: string,
): PreviewFeedback {
  const beforeValue = model.document.facts.find(
    (fact) => fact.id === targetFactId,
  )!.value;
  const reviewedValue = clarifyValue(beforeValue, "result", value);
  const command = {
    action: "clarify" as const,
    expectedVersionId: model.document.versionId,
    idempotencyKey: randomUUID(),
    targetFactId,
    questionKind: "result" as const,
    value,
  };
  return {
    preview: {
      schemaVersion: "clarification-preview/1.0.0",
      command,
      beforeValue,
      reviewedValue,
      reviewedValueHash: createHash("sha256")
        .update(reviewedValue)
        .digest("hex"),
    },
    submitted: { ...command, action: "preview_clarification" },
  };
}

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
      path: "*",
      loader: ({ request }) => ({
        ...model,
        selectedFactId:
          new URL(request.url).searchParams.get("focus") ?? contributions[0].id,
      }),
      action: async ({ request }) => {
        const form = await request.formData();
        return previewFeedback(
          model,
          String(form.get("targetFactId")),
          String(form.get("value")),
        );
      },
      Component: function Workspace() {
        const loaded = useLoaderData<typeof model>();
        const feedback = useActionData<PreviewFeedback>();
        return (
          <AuthoringWorkspace
            model={loaded}
            analysisId="analysis"
            feedback={feedback}
          />
        );
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
  fireEvent.submit(form);
  await screen.findByRole("region", { name: "Clarification preview" });
  fireEvent.click(reviewCheckbox(clarificationPreviewForm()));
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
  // A new target has no final acknowledgement until its own server preview.
  expect(
    screen.queryByRole("region", { name: "Clarification preview" }),
  ).toBeNull();
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
  fireEvent.submit(restored.closest("form")!);
  await screen.findByRole("region", { name: "Clarification preview" });
  fireEvent.click(reviewCheckbox(clarificationPreviewForm()));
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
  expect(restored.value).toBe("");
  expect(reviewCheckbox(clarificationPreviewForm()).checked).toBe(false);
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
    ".workspace-floating-header details",
  ) as HTMLElement;
  expect(
    within(mobileNavigation)
      .getByRole("link", { name: "Privacy" })
      .getAttribute("href"),
  ).toBe("/privacy");
  const header = document.querySelector(
    ".workspace-floating-header details",
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

it("U03 resets acknowledgement after editing the clarification answer", async () => {
  const { model, fact } = confirmationFixture();
  await mountConfirmation(
    model,
    previewFeedback(model, fact.id, "First reviewed answer"),
  );
  const answer = clarificationAnswer();
  const checkbox = reviewCheckbox(clarificationPreviewForm());
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  fireEvent.change(answer, { target: { value: "Changed answer" } });
  expect(reviewCheckbox(clarificationPreviewForm()).checked).toBe(false);
  expect(
    within(clarificationPreviewForm())
      .getByRole("button", { name: "Confirm complete fact" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(answer.value).toBe("Changed answer");
});

it("U03 resets same-target acknowledgement after version changes while retaining its draft", async () => {
  const { model, fact } = confirmationFixture();
  const view = await mountConfirmation(
    model,
    previewFeedback(model, fact.id, "My unsaved answer"),
  );
  const answer = clarificationAnswer();
  expect(answer.value).toBe("My unsaved answer");
  fireEvent.click(reviewCheckbox(clarificationPreviewForm()));
  const nextVersion = randomUUID();
  view.state.model = {
    ...model,
    document: {
      ...model.document,
      parentVersionId: model.document.versionId,
      versionId: nextVersion,
    },
  };
  await view.revalidate();
  const current = clarificationAnswer();
  expect(reviewCheckbox(clarificationPreviewForm()).checked).toBe(false);
  expect(current.value).toBe("My unsaved answer");
  expect(new FormData(current.closest("form")!).get("expectedVersionId")).toBe(
    nextVersion,
  );
});

it("U03 resets retained-correction acknowledgement after current head or draft changes", async () => {
  const { model, fact } = confirmationFixture();
  const feedback = retainedFeedback(model, fact.id);
  const view = await mountConfirmation(model, feedback);
  fireEvent.click(reviewCheckbox(recoveryForm()));
  view.state.model = {
    ...model,
    document: {
      ...model.document,
      parentVersionId: model.document.versionId,
      versionId: randomUUID(),
    },
  };
  await view.revalidate();
  expect.soft(reviewCheckbox(recoveryForm()).checked).toBe(false);
  if (!reviewCheckbox(recoveryForm()).checked)
    fireEvent.click(reviewCheckbox(recoveryForm()));
  view.state.feedback = {
    ...feedback,
    submitted: {
      ...feedback.submitted,
      value: "Different retained correction",
    },
  };
  await view.revalidate();
  expect.soft(reviewCheckbox(recoveryForm()).checked).toBe(false);
  expect(new FormData(recoveryForm()).get("value")).toBe(
    "Different retained correction",
  );
  expect(new FormData(recoveryForm()).get("expectedVersionId")).toBe(
    view.state.model.document.versionId,
  );
});

it("U03 resets proposal and recovery acknowledgements after persisted history restore", async () => {
  const { model, fact } = confirmationFixture();
  await mountConfirmation(model, retainedFeedback(model, fact.id));
  const proposal = screen
    .getByRole("button", { name: "Accept action scope result" })
    .closest("form")!;
  fireEvent.click(reviewCheckbox(proposal));
  fireEvent.click(reviewCheckbox(recoveryForm()));
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
  expect.soft(reviewCheckbox(proposal).checked).toBe(false);
  expect.soft(reviewCheckbox(recoveryForm()).checked).toBe(false);
});

it("U03 confirms the displayed current fact while preserving the separate exact retry", async () => {
  const { model, fact } = confirmationFixture();
  fact.state = "unconfirmed";
  fact.confirmation = null;
  const oldVersion = randomUUID(),
    oldKey = randomUUID();
  await mountConfirmation(model, {
    error: "The resume changed.",
    submitted: {
      action: "confirm",
      targetFactId: fact.id,
      expectedVersionId: oldVersion,
      idempotencyKey: oldKey,
    },
  });
  const confirm = screen
    .getAllByRole("button", { name: "Confirm this saved fact" })
    .find((button) => !button.hasAttribute("disabled"))!
    .closest("form")!;
  const retry = screen
    .getByRole("button", { name: "Retry this exact submission" })
    .closest("form")!;
  expect
    .soft(new FormData(confirm).get("expectedVersionId"))
    .toBe(model.document.versionId);
  expect
    .soft(new FormData(confirm).get("idempotencyKey"))
    .toBe(model.formKeys[`confirm:${fact.id}`]);
  expect(new FormData(confirm).get("targetFactId")).toBe(fact.id);
  expect(new FormData(retry).get("expectedVersionId")).toBe(oldVersion);
  expect(new FormData(retry).get("idempotencyKey")).toBe(oldKey);
});

it("U03 preview displays the complete reviewed value with one native final acknowledgement", async () => {
  const { model, fact } = confirmationFixture();
  model.patches = [];
  const feedback = previewFeedback(model, fact.id, "A revised result");
  await mountConfirmation(model, feedback);
  const answer = clarificationAnswer();
  const stageOne = answer.closest("form")!;
  expect
    .soft(new FormData(stageOne).get("action"))
    .toBe("preview_clarification");
  expect.soft(within(stageOne).queryByRole("checkbox")).toBeNull();
  expect.soft(answer.value).toBe("A revised result");
  expect
    .soft(screen.queryByRole("button", { name: "Retry this exact submission" }))
    .toBeNull();
  const region = screen.getByRole("region", { name: "Clarification preview" });
  expect(
    within(region).getByLabelText("Complete fact to confirm").textContent,
  ).toBe(feedback.preview!.reviewedValue);
  const commit = within(region)
    .getByRole("button", { name: "Confirm complete fact" })
    .closest("form")!;
  expect(Object.fromEntries(new FormData(commit))).toEqual({
    ...feedback.preview!.command,
    reviewedValueHash: feedback.preview!.reviewedValueHash,
  });
  const checkbox = reviewCheckbox(commit);
  expect(checkbox.required).toBe(true);
  expect(checkbox.checked).toBe(false);
  expect(
    within(commit)
      .getByRole("button", { name: "Confirm complete fact" })
      .hasAttribute("disabled"),
  ).toBe(false);
  fireEvent.click(checkbox);
  expect(new FormData(commit).get("confirmation")).toBe("true");
  for (const form of [stageOne, commit]) {
    const url = new URL(form.getAttribute("action")!, "https://fixture.test");
    expect(url.searchParams.get("focus")).toBe(fact.id);
    expect([...url.searchParams.keys()]).toEqual(["focus"]);
  }
});

it("U03 preview preserves a non-first target and invalidates changed answer and head context", async () => {
  const { model } = confirmationFixture(
    SCORE_SOURCE.replace(
      "Built reliable services",
      "Built reliable services\nImproved release tooling",
    ),
  );
  const second = model.document.facts.filter(
    (fact) => fact.type === "contribution",
  )[1];
  model.selectedFactId = second.id;
  model.patches = [];
  const feedback = previewFeedback(
    model,
    second.id,
    "Second contribution result",
  );
  const view = await mountConfirmation(model, feedback);
  const region = screen.getByRole("region", { name: "Clarification preview" });
  const button = within(region).getByRole("button", {
    name: "Confirm complete fact",
  });
  expect(new FormData(button.closest("form")!).get("targetFactId")).toBe(
    second.id,
  );
  expect(
    new URL(
      button.closest("form")!.getAttribute("action")!,
      "https://fixture.test",
    ).searchParams.get("focus"),
  ).toBe(second.id);
  fireEvent.click(reviewCheckbox(button.closest("form")!));
  fireEvent.change(clarificationAnswer(), {
    target: { value: "Changed draft answer" },
  });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(reviewCheckbox(button.closest("form")!).checked).toBe(false);
  expect(clarificationAnswer().value).toBe("Changed draft answer");
  view.state.feedback = previewFeedback(
    model,
    second.id,
    "Changed draft answer",
  );
  await view.revalidate();
  const fresh = screen.getByRole("region", { name: "Clarification preview" });
  const freshButton = within(fresh).getByRole("button", {
    name: "Confirm complete fact",
  });
  expect(freshButton.hasAttribute("disabled")).toBe(false);
  expect(reviewCheckbox(freshButton.closest("form")!).checked).toBe(false);
  fireEvent.click(reviewCheckbox(freshButton.closest("form")!));
  view.state.model = {
    ...model,
    document: {
      ...model.document,
      parentVersionId: model.document.versionId,
      versionId: randomUUID(),
    },
  };
  await view.revalidate();
  const staleButton = within(
    screen.getByRole("region", { name: "Clarification preview" }),
  ).getByRole("button", { name: "Confirm complete fact" });
  expect(staleButton.hasAttribute("disabled")).toBe(true);
  expect(reviewCheckbox(staleButton.closest("form")!).checked).toBe(false);
  expect(clarificationAnswer().value).toBe("Changed draft answer");
});

it("U03 preview retains failed proof for exact retry while using the current binding for a new preview", async () => {
  const { model, fact } = confirmationFixture();
  const feedback = previewFeedback(model, fact.id, "Retained answer");
  const oldVersion = randomUUID();
  const submitted = {
    ...feedback.preview!.command,
    expectedVersionId: oldVersion,
    confirmation: true as const,
    reviewedValueHash: feedback.preview!.reviewedValueHash,
  };
  await mountConfirmation(model, {
    error: "The resume changed.",
    submitted,
  });
  const main = clarificationAnswer().closest("form")!;
  expect.soft(new FormData(main).get("action")).toBe("preview_clarification");
  expect
    .soft(new FormData(main).get("expectedVersionId"))
    .toBe(model.document.versionId);
  expect.soft(new FormData(main).get("idempotencyKey")).toBe(model.formKey);
  expect(clarificationAnswer().value).toBe("Retained answer");
  const retry = screen
    .getByRole("button", { name: "Retry this exact submission" })
    .closest("form")!;
  expect(Object.fromEntries(new FormData(retry))).toEqual({
    ...submitted,
    confirmation: "true",
  });
});
