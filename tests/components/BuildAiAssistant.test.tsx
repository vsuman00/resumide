/** @vitest-environment jsdom */
import { createRef } from "react";
import { webcrypto } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BuildAiAssistant, {
  type BuildAiAssistantHandle,
} from "~/components/BuildAiAssistant";
import type { LatexEditorHandle } from "~/components/LatexEditor";
import { BUILD_AI_LIMITS } from "~/lib/build-assist";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const failureSource = "Neutral first line\nNeutral second line";
function harness(
  source = failureSource,
  selection = { startLine: 1, endLine: 1 },
) {
  const editor = {
    focus: vi.fn(),
    goToLine: vi.fn(),
    getSelectionLines: vi.fn(() => selection),
    insertAround: vi.fn(),
    showInlineDiff: vi.fn(),
  } satisfies LatexEditorHandle;
  const editorRef = { current: editor };
  const assistant = createRef<BuildAiAssistantHandle>();
  const onApply = vi.fn();
  const onPreview = vi.fn();
  const ui = (text: string) => (
    <>
      <div data-testid="editor" />
      <BuildAiAssistant
        ref={assistant}
        source={text}
        enabled
        editor={editorRef}
        onApply={onApply}
        onPreview={onPreview}
      />
    </>
  );
  const view = render(ui(source));
  return {
    ...view,
    editor,
    assistant,
    onApply,
    onPreview,
    rerenderSource: (text: string) => view.rerender(ui(text)),
  };
}
const dialog = () => screen.queryByRole("dialog", { name: "Ask AI" });
function prepareRequest(response: Promise<Response>, source = failureSource) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => response);
  vi.stubGlobal("fetch", fetch);
  const h = harness(source);
  act(() => h.assistant.current!.open());
  expect(dialog()).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  const consent = screen.getByRole("checkbox", {
    name: "I agree to send this selected context for this request.",
  }) as HTMLInputElement;
  const ask = screen.getByRole("button", {
    name: "Ask AI",
  }) as HTMLButtonElement;
  expect(ask.disabled).toBe(true);
  fireEvent.click(ask);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(consent);
  expect(ask.disabled).toBe(false);
  fireEvent.click(ask);
  return { ...h, fetch, consent, ask };
}
function deferredResponse<T = Response>() {
  let resolveResponse: ((response: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolveResponse = resolve;
  });
  return {
    promise,
    finish(response: T) {
      resolveResponse?.(response);
    },
  };
}
const reply = (
  bound: {
    sourceHash: string;
    startLine: number;
    endLine: number;
    mode: string;
  },
  patch: Record<string, unknown> = {},
) => ({
  sourceHash: bound.sourceHash,
  startLine: bound.startLine,
  endLine: bound.endLine,
  mode: bound.mode,
  originalText: "Neutral first line",
  requiresFactConfirmation: false,
  suggestion: {
    operation: "replace",
    replacement: "Neutral edited line",
    explanation: "Clearer.",
    questions: [],
  },
  ...patch,
});

it("never opens on hover and opens from the handle with focus on the first action", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const h = harness();
  fireEvent.mouseMove(screen.getByTestId("editor"));
  fireEvent.mouseEnter(screen.getByTestId("editor"));
  expect(dialog()).toBeNull();
  act(() => h.assistant.current!.open());
  expect(dialog()).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Fix code" }),
  );
  expect(screen.getByRole("button", { name: "Rewrite" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Improve resume wording" }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Selected lines").textContent).toBe(
    "Neutral first line",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("closes on Escape inside the panel and returns focus to the editor", () => {
  vi.stubGlobal("fetch", vi.fn());
  const h = harness();
  act(() => h.assistant.current!.open());
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(dialog()).toBeNull();
  expect(h.editor.focus).toHaveBeenCalled();
});

it.each([
  [
    "cancelled",
    409,
    "The AI request was cancelled. No suggestion was applied.",
  ],
  [
    "output_invalid",
    422,
    "The AI response could not be used safely. No change was applied.",
  ],
  [
    "request_conflict",
    409,
    "This suggestion request cannot be reused. Review the current selection before asking again.",
  ],
  ["disabled", 404, "AI suggestions are currently disabled."],
  [
    "unauthenticated",
    401,
    "Your session has ended. Sign in again before asking for a suggestion.",
  ],
  [
    "forbidden",
    403,
    "This request could not be accepted. Keep a copy of your code before reloading.",
  ],
  [
    "rate_limited",
    429,
    "Too many requests. Wait a moment before asking again.",
  ],
  [
    "budget_exhausted",
    429,
    "The AI service has no capacity for another suggestion. No change was applied.",
  ],
  [
    "budget_exceeded",
    429,
    "The AI service has no capacity for another suggestion. No change was applied.",
  ],
  ["busy", 429, "AI suggestions are busy. Try again shortly."],
  ["timeout", 504, "The request timed out. No suggestion was applied."],
  [
    "selection_invalid",
    400,
    "Select up to 20 nonempty lines and 4,000 characters. Nearby context must also fit the request limit.",
  ],
  [
    "stale_source",
    409,
    "Your source or selection changed. Ask again for the current selection.",
  ],
  [
    "invalid_suggestion",
    422,
    "The suggestion did not pass checks. No change was applied.",
  ],
  [
    "invalid_request",
    415,
    "This suggestion request could not be accepted. Review the source and selected lines.",
  ],
  [
    "consent_required",
    403,
    "Review and accept the AI processing notice before asking for a suggestion.",
  ],
  [
    "provider_unavailable",
    503,
    "AI suggestions are unavailable. No change was applied.",
  ],
  [
    "provider_auth",
    503,
    "AI suggestions are unavailable for this deployment. You can keep editing your code.",
  ],
  [
    "provider_transient",
    503,
    "The AI service had a temporary problem. Try again later.",
  ],
  [
    "provider_refused",
    422,
    "The AI provider declined this request. Review the selection before asking again.",
  ],
] as const)(
  "maps Build code %s to fixed safe copy",
  async (code, status, message) => {
    const request = prepareRequest(
      Promise.resolve(
        Response.json(
          { code, error: "Synthetic safe server feedback." },
          { status },
        ),
      ),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(request.fetch).toHaveBeenCalledTimes(1);
    expect(request.consent.checked).toBe(false);
    expect(request.onApply).not.toHaveBeenCalled();
    const signIn = screen.queryByRole("link", { name: "Sign in in a new tab" });
    if (code === "unauthenticated") {
      expect(signIn?.getAttribute("href")).toBe("/auth?next=%2Fbuild");
      expect(signIn?.getAttribute("target")).toBe("_blank");
    } else expect(signIn).toBeNull();
  },
);

it.each([
  "__proto__",
  "constructor",
  "toString",
  "future_failure",
  undefined,
  null,
  { unexpected: true },
])(
  "uses fixed safe fallback for unknown or malformed Build code %j",
  async (code) => {
    const request = prepareRequest(
      Promise.resolve(
        Response.json(
          { code, error: "SYNTHETIC_PRIVATE_DETAIL" },
          { status: 503 },
        ),
      ),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "AI suggestions are unavailable. No change was applied. You can try again later.",
    );
    expect(screen.queryByText(/SYNTHETIC_PRIVATE_DETAIL/u)).toBeNull();
    expect(request.onApply).not.toHaveBeenCalled();
  },
);

it("binds the exact request, locks controls while reading, and sends one fetch", async () => {
  const response = deferredResponse();
  const request = prepareRequest(response.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = request.fetch.mock.calls[0];
  expect(url).toBe("/build/suggest");
  expect(init?.method).toBe("POST");
  expect(init?.cache).toBe("no-store");
  const body = JSON.parse(String(init?.body));
  expect(Object.keys(body).sort()).toEqual([
    "consent",
    "endLine",
    "mode",
    "policyVersion",
    "source",
    "sourceHash",
    "startLine",
  ]);
  expect(body).toMatchObject({
    source: failureSource,
    startLine: 1,
    endLine: 1,
    mode: "fix",
    consent: true,
    policyVersion: "build-ai-selected-context-v2",
  });
  expect(body.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(screen.getByText("Reading lines 1–1…").getAttribute("role")).toBe(
    "status",
  );
  expect(request.consent.disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Rewrite" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const pending = screen.getByRole("button", {
    name: "Asking AI…",
  }) as HTMLButtonElement;
  expect(pending.disabled).toBe(true);
  fireEvent.click(pending);
  expect(request.fetch).toHaveBeenCalledTimes(1);
  await act(async () =>
    response.finish(Response.json({ code: "cancelled" }, { status: 409 })),
  );
  expect(request.consent.disabled).toBe(false);
  expect(request.consent.checked).toBe(false);
});

it("cancels explicitly and ignores a late server failure", async () => {
  const response = deferredResponse();
  const request = prepareRequest(response.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const signal = request.fetch.mock.calls[0][1]?.signal;
  fireEvent.click(screen.getByRole("button", { name: "Cancel AI request" }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe(
    "The request stopped. No suggestion was applied.",
  );
  await act(async () =>
    response.finish(Response.json({ code: "output_invalid" }, { status: 422 })),
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "The request stopped. No suggestion was applied.",
  );
  expect(request.onApply).not.toHaveBeenCalled();
});

it("drops a reply when the code changes first and says so", async () => {
  const response = deferredResponse();
  const request = prepareRequest(response.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const init = request.fetch.mock.calls[0][1];
  const bound = JSON.parse(String(init?.body));
  request.rerenderSource("Updated neutral first line\nNeutral second line");
  expect(init?.signal?.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe(
    "Code changed. Ask again.",
  );
  await act(async () => response.finish(Response.json(reply(bound))));
  expect(
    screen.queryByRole("region", { name: "AI suggestion review" }),
  ).toBeNull();
  expect(request.onPreview).not.toHaveBeenCalledWith(
    expect.anything(),
    "Neutral edited line",
  );
  expect(request.onApply).not.toHaveBeenCalled();
});

it("previews a replacement inline, accepts with the handle (Tab), and clears on reject (Esc)", async () => {
  const response = deferredResponse();
  const request = prepareRequest(response.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const bound = JSON.parse(String(request.fetch.mock.calls[0][1]?.body));
  await act(async () => response.finish(Response.json(reply(bound))));
  expect(request.onPreview).toHaveBeenLastCalledWith(
    { startLine: 1, endLine: 1 },
    "Neutral edited line",
  );
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Accept suggestion" }),
  );
  act(() => request.assistant.current!.reject());
  expect(request.onPreview).toHaveBeenLastCalledWith(null, null);
  expect(dialog()).toBeNull();
  expect(request.onApply).not.toHaveBeenCalled();

  const again = deferredResponse();
  request.fetch.mockReturnValueOnce(again.promise);
  act(() => request.assistant.current!.open());
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I agree to send this selected context for this request.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(2));
  await act(async () => again.finish(Response.json(reply(bound))));
  await act(async () => request.assistant.current!.accept());
  await waitFor(() =>
    expect(request.onApply).toHaveBeenCalledExactlyOnceWith(
      "Neutral edited line\nNeutral second line",
    ),
  );
  expect(request.onPreview).toHaveBeenLastCalledWith(null, null);
});

it("shows advice without a diff and requires fact confirmation for resume wording", async () => {
  const response = deferredResponse();
  const request = prepareRequest(response.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const bound = JSON.parse(String(request.fetch.mock.calls[0][1]?.body));
  await act(async () =>
    response.finish(
      Response.json(
        reply(bound, {
          suggestion: {
            operation: "advice",
            replacement: null,
            explanation: "Consider a verb.",
            questions: [],
          },
        }),
      ),
    ),
  );
  expect(screen.getByText("Consider a verb.")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Accept suggestion" }),
  ).toBeNull();
  expect(request.onPreview).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.any(String),
  );

  act(() => request.assistant.current!.open());
  fireEvent.click(
    screen.getByRole("button", { name: "Improve resume wording" }),
  );
  const resume = deferredResponse();
  request.fetch.mockReturnValueOnce(resume.promise);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I agree to send this selected context for this request.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(2));
  const resumeBound = JSON.parse(String(request.fetch.mock.calls[1][1]?.body));
  expect(resumeBound.mode).toBe("resume");
  await act(async () =>
    resume.finish(
      Response.json(reply(resumeBound, { requiresFactConfirmation: true })),
    ),
  );
  await act(async () => request.assistant.current!.accept());
  expect(screen.getByRole("alert").textContent).toBe(
    "Confirm the draft keeps your facts before accepting it.",
  );
  expect(request.onApply).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /I confirm this draft preserves my facts/u,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
  await waitFor(() => expect(request.onApply).toHaveBeenCalledTimes(1));
});

it("prefills Fix with AI from a compile error and still needs consent", async () => {
  const source = ["a", "b", "c", "\\oops", "e", "f"].join("\n");
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const h = harness(source);
  act(() =>
    h.assistant.current!.open(
      { startLine: 2, endLine: 6 },
      { kind: "undefined_command", line: 4 },
    ),
  );
  expect(screen.getByText("Fixing line 4: undefined command")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Rewrite" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const ask = screen.getByRole("button", {
    name: "Ask AI",
  }) as HTMLButtonElement;
  expect(ask.disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I agree to send this selected context for this request.",
    }),
  );
  fireEvent.click(ask);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    mode: "fix",
    startLine: 2,
    endLine: 6,
    diagnostic: { kind: "undefined_command", line: 4 },
  });
});

it("expires a stalled response body and allows only a freshly consented result", async () => {
  const timer = vi.spyOn(globalThis, "setTimeout");
  const stalled = deferredResponse();
  const response = Response.json({});
  const body = deferredResponse<unknown>();
  vi.spyOn(response, "json").mockReturnValue(body.promise as Promise<never>);
  const request = prepareRequest(stalled.promise);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(1));
  const init = request.fetch.mock.calls[0][1];
  const bound = JSON.parse(String(init?.body));
  await act(async () => stalled.finish(response));
  const expire = timer.mock.calls.find(
    (entry) => entry[1] === BUILD_AI_LIMITS.timeoutMs + 2_000,
  )?.[0];
  expect(typeof expire).toBe("function");
  await act(async () => (expire as () => void)());
  expect(init?.signal?.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe(
    "The request timed out. No suggestion was applied.",
  );
  expect(request.consent.checked).toBe(false);
  const fresh = deferredResponse();
  request.fetch.mockReturnValueOnce(fresh.promise);
  fireEvent.click(request.consent);
  fireEvent.click(request.ask);
  await waitFor(() => expect(request.fetch).toHaveBeenCalledTimes(2));
  await act(async () =>
    body.finish(
      reply(bound, {
        suggestion: {
          operation: "replace",
          replacement: "Expired edit",
          explanation: "x",
          questions: [],
        },
      }),
    ),
  );
  expect(screen.queryByText("Expired edit")).toBeNull();
  await act(async () =>
    fresh.finish(
      Response.json(
        reply(bound, {
          suggestion: {
            operation: "replace",
            replacement: "Fresh edit",
            explanation: "x",
            questions: [],
          },
        }),
      ),
    ),
  );
  expect(await screen.findByText("Fresh edit")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
  await waitFor(() =>
    expect(request.onApply).toHaveBeenCalledExactlyOnceWith(
      "Fresh edit\nNeutral second line",
    ),
  );
});

it("reports deadline expiry while still hashing and never dispatches that request", async () => {
  const timer = vi.spyOn(globalThis, "setTimeout");
  const hashing = deferredResponse<ArrayBuffer>();
  const digest = vi
    .spyOn(webcrypto.subtle, "digest")
    .mockReturnValueOnce(hashing.promise);
  const request = prepareRequest(deferredResponse().promise);
  expect(digest).toHaveBeenCalledTimes(1);
  const expire = timer.mock.calls.find(
    (entry) => entry[1] === BUILD_AI_LIMITS.timeoutMs + 2_000,
  )?.[0];
  await act(async () => (expire as () => void)());
  expect(screen.getByRole("alert").textContent).toBe(
    "The request timed out. No suggestion was applied.",
  );
  await act(async () => hashing.finish(new ArrayBuffer(32)));
  expect(request.fetch).not.toHaveBeenCalled();
  expect(request.onApply).not.toHaveBeenCalled();
});
