/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const fetcher = vi.hoisted(() => ({
  state: "idle" as "idle" | "submitting" | "loading",
  data: undefined as
    | { ok?: boolean; code?: string; error?: string; bulletCount?: number }
    | undefined,
}));
vi.mock("react-router", () => ({
  useFetcher: () => ({
    ...fetcher,
    Form: (props: ComponentProps<"form">) => <form {...props} />,
  }),
}));
import RewriteGenerator from "../../app/components/RewriteGenerator";
import SavedWritingDrafts from "../../app/components/ResumeWriter";
afterEach(() => {
  cleanup();
  fetcher.state = "idle";
  fetcher.data = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("offers draft generation without guaranteeing factual grounding", () => {
  render(<RewriteGenerator analysisId="synthetic-analysis" />);
  expect(
    screen.getByRole("heading", { name: "Generate writing drafts" }),
  ).toBeTruthy();
  expect(screen.queryByText(/generate grounded suggestions/i)).toBeNull();
  const consent = screen.getByRole("checkbox") as HTMLInputElement;
  expect(consent.required).toBe(true);
  expect(consent.checked).toBe(false);
  expect(consent.value).toBe("accepted");
  const form = consent.closest("form")!;
  expect(form.getAttribute("method")).toBe("post");
  expect(form.getAttribute("action")).toBe(
    "/resume/synthetic-analysis/rewrite",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Generate suggestions",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it.each(["submitting", "loading"] as const)(
  "announces %s as pending drafts and disables duplicate requests",
  (state) => {
    fetcher.state = state;
    fetcher.data = { error: "Earlier error" };
    render(<RewriteGenerator analysisId="synthetic-analysis" />);
    expect(screen.getByRole("status").textContent).toMatch(
      /generating writing drafts/i,
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole("button").closest("form")!.getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
it("distinguishes saved drafts from accepted or saved resume changes", () => {
  fetcher.data = { ok: true, bulletCount: 0 };
  render(<RewriteGenerator analysisId="synthetic-analysis" />);
  const status = screen.getByRole("status");
  expect(status.textContent).toMatch(/writing drafts saved for review/i);
  expect(status.textContent).toMatch(
    /review and save resume edits in the resume workspace/i,
  );
  expect(
    screen.queryByText(
      /resume changes saved|export (?:saved|verified)|score (?:improved|increased)/i,
    ),
  ).toBeNull();
});
it("shows a failed request without claiming a save or hiding the retry action", () => {
  fetcher.data = { error: "Writing is temporarily unavailable." };
  render(<RewriteGenerator analysisId="synthetic-analysis" />);
  expect(screen.getByRole("alert").textContent).toBe(
    "Writing is temporarily unavailable.",
  );
  expect(screen.getByRole("status").textContent).toBe("");
  expect(
    (
      screen.getByRole("button", {
        name: "Generate suggestions",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it.each([
  [
    "AI_REFUSED",
    "The AI provider declined this writing request. Review any saved drafts.",
  ],
  [
    "AI_RATE_LIMITED",
    "Writing requests are temporarily limited. Wait before trying again.",
  ],
  [
    "AI_CANCELLED",
    "The writing request was cancelled. Review any saved drafts.",
  ],
])(
  "distinguishes published %s feedback in the actual component",
  (code, message) => {
    fetcher.data = {
      code,
      error:
        "The AI provider could not complete writing generation. Your previous draft is preserved.",
    };
    render(<RewriteGenerator analysisId="synthetic-analysis" />);
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(
      screen.getByRole("button").closest("form")?.getAttribute("action"),
    ).toBe("/resume/synthetic-analysis/rewrite");
  },
);
it.each([
  {
    code: "unauthenticated",
    error: "Sign in to generate suggestions.",
    message: "Sign in to request writing suggestions.",
  },
  {
    code: "AI_DISABLED",
    error: "Writing generation is disabled on this server.",
    message: "Writing generation is disabled on this server.",
  },
  {
    code: "AI_PROVIDER_UNAVAILABLE",
    error:
      "The AI provider could not complete writing generation. Your previous draft is preserved.",
    message:
      "Writing suggestions are unavailable from the AI provider. Review any saved drafts.",
  },
  {
    code: "AI_PROVIDER_AUTH",
    error: "This deployment cannot generate writing.",
    message:
      "Writing suggestions are unavailable for this deployment. Review any saved drafts.",
  },
  {
    code: "AI_PROVIDER_TRANSIENT",
    error: "A temporary provider problem occurred.",
    message:
      "The AI service had a temporary problem. Review any saved drafts and try again later.",
  },
  {
    code: "AI_TIMEOUT",
    error:
      "Writing generation timed out. Your previous draft is preserved; try again shortly.",
    message:
      "Writing generation timed out. Review any saved drafts before trying again.",
  },
  {
    code: "AI_OUTPUT_INVALID",
    error:
      "The AI provider could not complete writing generation. Your previous draft is preserved.",
    message:
      "The AI response could not be used safely. Review any saved drafts.",
  },
  ...["AI_BUDGET_EXHAUSTED", "AI_BUDGET_BLOCKED"].map((code) => ({
    code,
    error:
      "The writing budget is unavailable for another request. Your previous draft is preserved.",
    message:
      "The writing service has no capacity for another request. Review any saved drafts.",
  })),
  ...["AI_BUDGET_CONFLICT", "AI_BUDGET_STATE"].map((code) => ({
    code,
    error:
      "This writing request cannot run again. Reload to review the saved draft.",
    message:
      "This writing request cannot run again. Reload to review any saved draft.",
  })),
])(
  "presents the actual safe $code classification without inferring a provider cause",
  ({ code, error, message }) => {
    fetcher.data = { code, error };
    render(<RewriteGenerator analysisId="synthetic-analysis" />);
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(
      screen.queryByText(/provider key|subscription|credits|upgrade/iu),
    ).toBeNull();
    const signIn = screen.queryByRole("link", { name: "Sign in in a new tab" });
    if (code === "unauthenticated") {
      expect(signIn?.getAttribute("href")).toBe(
        "/auth?next=%2Fresume%2Fsynthetic-analysis",
      );
      expect(signIn?.getAttribute("target")).toBe("_blank");
    } else expect(signIn).toBeNull();
  },
);
it.each([
  undefined,
  "future_failure",
  "save_failed",
  "AI_BUDGET_UNAVAILABLE",
  "__proto__",
  "constructor",
  "toString",
])("preserves safe fallback feedback for unknown or legacy code %s", (code) => {
  fetcher.data = {
    code,
    error: "The save result is unknown. Reload to review it.",
  };
  render(<RewriteGenerator analysisId="synthetic-analysis" />);
  expect(screen.getByRole("alert").textContent).toBe(
    "The save result is unknown. Reload to review it.",
  );
  expect(screen.getByRole("alert").textContent).not.toMatch(
    /unchanged|no draft was saved/iu,
  );
});
it.each(["submitting", "loading"] as const)(
  "keeps classified errors hidden and consent disabled while %s",
  (state) => {
    fetcher.state = state;
    fetcher.data = { code: "AI_REFUSED", error: "Earlier safe error." };
    render(<RewriteGenerator analysisId="synthetic-analysis" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /generating writing drafts/iu,
    );
  },
);
it("keeps saved drafts and the existing consent/form target without automatic submission", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "submit")
    .mockImplementation(() => undefined);
  const requestSubmit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => undefined);
  const writer = { summary: "Synthetic retained writing draft.", bullets: [] };
  const before = structuredClone(writer);
  const view = () => (
    <>
      <RewriteGenerator analysisId="bound-analysis" />
      <SavedWritingDrafts writer={writer} />
    </>
  );
  fetcher.data = { code: "unauthenticated", error: "Sign in required." };
  const { rerender } = render(view());
  expect(
    screen.getByRole("link", { name: "Sign in in a new tab" }),
  ).toBeTruthy();
  fetcher.data = { code: "AI_PROVIDER_AUTH", error: "Later safe error." };
  rerender(view());
  expect(
    screen.queryByRole("link", { name: "Sign in in a new tab" }),
  ).toBeNull();
  expect(screen.getByText("Synthetic retained writing draft.")).toBeTruthy();
  expect(writer).toEqual(before);
  const consent = screen.getByRole("checkbox") as HTMLInputElement;
  expect(consent.name).toBe("aiConsent");
  expect(consent.value).toBe("accepted");
  expect(consent.required).toBe(true);
  expect(consent.checked).toBe(false);
  expect(consent.closest("form")?.getAttribute("method")).toBe("post");
  expect(consent.closest("form")?.getAttribute("action")).toBe(
    "/resume/bound-analysis/rewrite",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(requestSubmit).not.toHaveBeenCalled();
});
it("does not invent an error outcome from a code without an error message", () => {
  fetcher.data = { code: "AI_REFUSED" };
  render(<RewriteGenerator analysisId="synthetic-analysis" />);
  expect(screen.queryByRole("alert")).toBeNull();
});
