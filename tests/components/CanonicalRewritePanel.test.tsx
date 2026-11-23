/** @vitest-environment jsdom */
import { randomUUID } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import CanonicalRewritePanel from "../../app/components/CanonicalRewritePanel";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  buildTypedAuthoringWorkspace,
} from "../../app/lib/server/typed-authoring-protocol";
import {
  buildCanonicalRewriteWorkspace,
  reconstructCanonicalRewrite,
  validateCanonicalRewritePublication,
  type CanonicalRewriteWorkspace,
  type CanonicalRewriteRequest,
} from "../../app/lib/server/canonical-rewrite-contract";
import { CANONICAL_REWRITE_READINESS_PROFILE } from "../../app/lib/server/canonical-rewrite-readiness-profile";
import { CANONICAL_REWRITE_WORKSPACE_PROFILE } from "../../app/lib/server/canonical-rewrite-workspace-profile";
import {
  decodeCanonicalRewriteWorkspaceState,
  initializeCanonicalRewriteWorkspace,
  type CanonicalRewriteWorkspaceState,
} from "../../app/lib/server/canonical-rewrite-workspace";
type Initialization = Extract<
  CanonicalRewriteWorkspaceState,
  { status: "initialization_required" }
>;
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Actual immutable builders -> strict reader -> A11 proof -> actual rewrite producer.
// Only native catalog/row/hash/receipt metadata is synthetic; no SQL authority is claimed.
async function fixture(declared = false) {
  const f = await createRequirementContextFixture({
    confirm: true,
    ...(declared ? { edit: "Built database services using PostgreSQL" } : {}),
  });
  const authoring = buildTypedAuthoringWorkspace(f.context);
  const patch = buildTypedAuthoringPatch(
    f.context,
    {
      canonicalVersionId: authoring.binding.canonical.versionId,
      requirementVersionId: authoring.binding.requirements.versionId,
      clauseId: authoring.clauses[0].clauseId,
      targetFactId: f.targetFactId,
    },
    "Created",
  );
  const fact = f.context.canonical.content.facts.find(
    (item) => item.id === f.targetFactId,
  );
  if (!fact?.confirmation) throw Error("EXPECTED_ACTUAL_CONFIRMED_FACT");
  const row = {
    schemaVersion: "canonical-rewrite-context/1.0.0",
    status: "available",
    relationshipContext: f.context,
    draft: {
      id: id(1),
      updatedAt: "2026-11-14T00:00:00.123456Z",
      contentSha256: "d".repeat(64),
      versionId: null,
      revision: 0,
      headId: null,
    },
    bindingSha256: "e".repeat(64),
    manifest: [
      {
        sourceId: 0,
        factId: f.targetFactId,
        valueSha256: patch.target.currentValueSha256,
        location: {
          sectionId: patch.target.sectionId,
          entryId: patch.target.entryId,
          bulletId: patch.target.bulletId,
        },
        confirmation: fact.confirmation,
        basis: patch.support.basis,
        currentCitations: patch.sourceCitations,
        clauseIds: [patch.selection.clauseId],
        authoringVersion: patch.policies.authoringVersion,
      },
    ],
    saved: {
      state: "legacy_unbound",
      publication: null,
      legacyDraft: {
        summary: "Retained earlier summary",
        bullets: [
          {
            original: "Retained earlier claim",
            rewrite: "Retained earlier wording",
            reasoning: "Review this saved wording.",
          },
        ],
      },
    },
    readiness: {
      ...CANONICAL_REWRITE_READINESS_PROFILE,
      schemaReady: true,
      mutatorsExecutable: true,
    },
  };
  const workspace = buildCanonicalRewriteWorkspace(
    row,
    "fixture-model",
    CANONICAL_REWRITE_READINESS_PROFILE,
  );
  const publication = (request: CanonicalRewriteRequest, copy = false) => {
    const result = reconstructCanonicalRewrite(workspace, request.operationId, {
      summarySourceId: null,
      bullets: [
        {
          sourceId: 0,
          clauseId: workspace.clauses[0].clauseId,
          operation: copy ? "copy" : "equivalent_action",
          replacementAction: copy ? null : "Created",
        },
      ],
    });
    return validateCanonicalRewritePublication(
      {
        result,
        receipt: {
          schemaVersion: "canonical-rewrite-receipt/1.0.0",
          state: "saved_proposals",
          operationId: request.operationId,
          bindingSha256: workspace.bindingSha256,
          runId: id(2),
          draftId: workspace.binding.draft.id,
          draftVersionId: id(3),
          revision: 1,
          draftUpdatedAt: "2026-11-14T00:01:00.654321Z",
          resultSha256: "f".repeat(64),
          projectionSha256: "a".repeat(64),
          idempotent: false,
        },
      },
      request,
      result,
    );
  };
  return { ...f, workspace, row, publication };
}
async function mount(
  workspace: CanonicalRewriteWorkspace | null,
  analysisId: string,
  initialization: Initialization | null = null,
) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  let current = { workspace, initialization };
  const load = vi.fn(async () => current);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: load,
        Component: () => {
          // Router revalidation owns server-projected saved state; tests update it explicitly.
          const loaded = useLoaderData<typeof load>();
          return (
            <CanonicalRewritePanel
              analysisId={analysisId}
              workspace={loaded.workspace}
              initialization={loaded.initialization}
            />
          );
        },
      },
    ],
    { initialEntries: ["/"] },
  );
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("heading", {
    name: "Writing drafts from saved claims",
  });
  return {
    fetch,
    load,
    router,
    view,
    nextRead: (
      workspace: CanonicalRewriteWorkspace | null,
      initialization: Initialization | null = null,
    ) => {
      current = { workspace, initialization };
    },
    replace: async (
      next: CanonicalRewriteWorkspace | null,
      initialization: Initialization | null = null,
    ) => {
      current = { workspace: next, initialization };
      await act(() => router.revalidate());
    },
  };
}
function fields(
  fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>,
  index = 0,
) {
  const init = fetch.mock.calls[index][1];
  if (!(init?.body instanceof FormData)) throw Error("EXPECTED_NATIVE_FORM");
  return Object.fromEntries(init.body.entries());
}
function requestAt(
  fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>,
  index = 0,
): CanonicalRewriteRequest {
  return JSON.parse(String(fields(fetch, index).request));
}
async function submit(label = "Generate writing drafts") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: label }));
  return user;
}
const savedWorkspace = (
  f: Awaited<ReturnType<typeof fixture>>,
  historical = false,
  copy = false,
) => {
  const request = {
    schemaVersion: "canonical-rewrite-request/1.0.0" as const,
    operationId: randomUUID(),
    canonicalVersionId: f.workspace.binding.authoring.canonical.versionId,
    requirementVersionId: f.workspace.binding.authoring.requirements.versionId,
    draftId: f.workspace.binding.draft.id,
    expectedDraftUpdatedAt: f.workspace.binding.draft.updatedAt,
  };
  const publication = f.publication(request, copy);
  return buildCanonicalRewriteWorkspace(
    {
      ...f.row,
      draft: {
        ...f.row.draft,
        updatedAt: publication.receipt.draftUpdatedAt,
        contentSha256: publication.receipt.projectionSha256,
        versionId: publication.receipt.draftVersionId,
        headId: publication.receipt.draftVersionId,
        revision: 1,
      },
      saved: {
        state: historical ? "historical" : "current",
        publication,
        legacyDraft: null,
      },
    },
    "fixture-model",
    CANONICAL_REWRITE_READINESS_PROFILE,
  );
};

it("shows actual saved source basis, pinned versions and honest exact-copy wording", async () => {
  const f = await fixture();
  const workspace = savedWorkspace(f, false, true);
  await mount(workspace, f.owned.analysisId);
  expect(
    screen.getByText(
      "Basis: quoted source claim, not independent verification.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "This wording is an exact copy. No wording improvement is claimed.",
    ),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Pinned resume version" })
      .getAttribute("href"),
  ).toContain(workspace.binding.authoring.canonical.versionId);
  expect(
    screen
      .getByRole("link", { name: "Pinned job requirements" })
      .getAttribute("href"),
  ).toContain(workspace.binding.authoring.requirements.versionId);
  expect(
    screen
      .getByRole("link", { name: "Inspect pinned claim" })
      .getAttribute("href"),
  ).toContain(f.targetFactId);
  expect(
    screen.getByRole("link", { name: "Inspect cited source" }),
  ).toBeTruthy();
  const user = userEvent.setup();
  const copy = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(copy).toHaveBeenCalledWith(
    workspace.saved.publication!.result.bullets[0].after,
  );
});
it("distinguishes recorded declarations without borrowing the earlier quote", async () => {
  const f = await fixture(true);
  const workspace = savedWorkspace(f);
  await mount(workspace, f.owned.analysisId);
  expect(
    screen.getByText(
      "Basis: your recorded declaration, not independent source verification.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "No current source quote is linked to this recorded declaration.",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "Inspect cited source" }),
  ).toBeNull();
  expect(
    screen.getByText(f.workspace.sources[0].confirmation.confirmedAt),
  ).toBeTruthy();
  expect(screen.getByText(f.owned.ownerId)).toBeTruthy();
});
it("labels historical drafts while retaining their actual pinned references", async () => {
  const f = await fixture();
  await mount(savedWorkspace(f, true), f.owned.analysisId);
  expect(
    screen.getByText(
      "These drafts were saved from earlier input versions or settings. Review their pinned references before copying.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeTruthy();
});
it("retains the actual legacy projection and copy controls with an unbound notice", async () => {
  const f = await fixture();
  await mount(f.workspace, f.owned.analysisId);
  expect(screen.getByText("Retained earlier summary")).toBeTruthy();
  expect(
    screen.getByText(/This saved legacy draft has no canonical resume/),
  ).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
});
it("requires fresh consent and sends only the exact request and consent to the same-origin endpoint", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  expect(
    screen
      .getByRole("button", { name: "Generate writing drafts" })
      .hasAttribute("disabled"),
  ).toBe(true);
  m.fetch.mockImplementation(async () =>
    json(
      {
        kind: "pending",
        operationId: requestAt(m.fetch).operationId,
        state: "dispatched",
      },
      409,
    ),
  );
  await submit();
  await screen.findByRole("button", { name: "Retry exact writing request" });
  expect(Object.keys(fields(m.fetch)).sort()).toEqual(["aiConsent", "request"]);
  expect(fields(m.fetch).aiConsent).toBe("accepted");
  expect(requestAt(m.fetch)).toEqual({
    schemaVersion: "canonical-rewrite-request/1.0.0",
    operationId: expect.any(String),
    canonicalVersionId: f.workspace.binding.authoring.canonical.versionId,
    requirementVersionId: f.workspace.binding.authoring.requirements.versionId,
    draftId: f.workspace.binding.draft.id,
    expectedDraftUpdatedAt: "2026-11-14T00:00:00.123456Z",
  });
  expect(m.fetch.mock.calls[0][0]).toBe(
    `/analysis/${f.owned.analysisId}/rewrite`,
  );
  expect(m.fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  expect(m.fetch).toHaveBeenCalledTimes(1);
});
it("keeps the original request and captured binding after ambiguity and current head movement", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  m.fetch.mockRejectedValueOnce(Error("PRIVATE_PROVIDER_DETAIL"));
  await submit();
  await screen.findByRole("alert");
  const original = fields(m.fetch).request;
  const newer = await fixture(true);
  await m.replace(newer.workspace);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  m.fetch.mockImplementationOnce(async () =>
    json({ kind: "saved", publication: f.publication(requestAt(m.fetch, 1)) }),
  );
  await submit("Retry exact writing request");
  await screen.findByText(
    "Writing drafts were saved for review. This does not save edits to your resume.",
  );
  expect(fields(m.fetch, 1).request).toBe(original);
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_DETAIL");
});
it.each([
  "operation",
  "binding",
  "draft",
  "revision",
  "version",
  "projection",
  "result",
  "timestamp",
])(
  "refuses a mismatched %s receipt without hiding earlier drafts",
  async (kind) => {
    const f = await fixture();
    const m = await mount(f.workspace, f.owned.analysisId);
    m.fetch.mockImplementation(async () => {
      const publication = f.publication(requestAt(m.fetch));
      if (kind === "operation") publication.receipt.operationId = id(90);
      if (kind === "binding")
        publication.receipt.bindingSha256 = "b".repeat(64);
      if (kind === "draft") publication.receipt.draftId = id(91);
      if (kind === "revision") publication.receipt.revision += 1;
      if (kind === "version") publication.receipt.draftVersionId = "invalid";
      if (kind === "projection")
        publication.receipt.projectionSha256 = "invalid";
      if (kind === "result") publication.receipt.resultSha256 = "invalid";
      if (kind === "timestamp") publication.receipt.draftUpdatedAt = "0";
      return json({ kind: "saved", publication });
    });
    await submit();
    await screen.findByRole("alert");
    expect(
      screen.queryByText(
        "Writing drafts were saved for review. This does not save edits to your resume.",
      ),
    ).toBeNull();
    expect(screen.getByText("Retained earlier summary")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry exact writing request" }),
    ).toBeTruthy();
  },
);
it("preserves earlier drafts on definite stale-input or unsupported-output failure", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  for (const reason of ["stale_inputs", "unsupported_output"]) {
    m.fetch.mockResolvedValueOnce(
      json({ kind: "error", reason, recovery: "review_again" }, 409),
    );
    await submit();
    await screen.findByRole("alert");
    expect(screen.getByText("Retained earlier wording")).toBeTruthy();
    expect(
      screen.queryByText(
        "Writing drafts were saved for review. This does not save edits to your resume.",
      ),
    ).toBeNull();
  }
  expect(requestAt(m.fetch).operationId).not.toBe(
    requestAt(m.fetch, 1).operationId,
  );
});
it("keeps the exact request and opens sign-in separately after session expiry", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  m.fetch.mockResolvedValueOnce(
    json(
      { kind: "error", reason: "unauthenticated", recovery: "retry_exact" },
      401,
    ),
  );
  await submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /session has ended/u,
  );
  const signIn = screen.getByRole("link", { name: "Sign in in a new tab" });
  expect(signIn.getAttribute("href")).toBe(
    `/auth?next=${encodeURIComponent(`/analysis/${f.owned.analysisId}/score`)}`,
  );
  expect(signIn.getAttribute("target")).toBe("_blank");
  expect(screen.getByText("Retained earlier wording")).toBeTruthy();
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  m.fetch.mockImplementationOnce(async () =>
    json(
      {
        kind: "pending",
        state: "dispatched",
        operationId: requestAt(m.fetch).operationId,
      },
      409,
    ),
  );
  await submit("Retry exact writing request");
  await screen.findByText(/This request has no confirmed saved result/u);
  expect(requestAt(m.fetch, 1)).toEqual(requestAt(m.fetch));
});
it("ends recovery for provider authentication rejection without asking the candidate to sign in", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  m.fetch.mockResolvedValueOnce(
    json(
      { kind: "error", reason: "provider_auth", recovery: "unavailable" },
      503,
    ),
  );
  await submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /unavailable for this deployment/u,
  );
  expect(
    screen.queryByRole("link", { name: "Sign in in a new tab" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Retry exact writing request" }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Generate writing drafts",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText("Retained earlier wording")).toBeTruthy();
  expect(m.fetch).toHaveBeenCalledTimes(1);
});
it("allows a temporary failure to be followed by a separately consented request", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  m.fetch.mockResolvedValueOnce(
    json(
      { kind: "error", reason: "provider_transient", recovery: "review_again" },
      503,
    ),
  );
  await submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /temporary problem/u,
  );
  const original = requestAt(m.fetch);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  expect(screen.getByText("Retained earlier wording")).toBeTruthy();
  expect(m.fetch).toHaveBeenCalledTimes(1);
  m.fetch.mockImplementationOnce(async () =>
    json({ kind: "saved", publication: f.publication(requestAt(m.fetch, 1)) }),
  );
  await submit();
  await screen.findByText(/Writing drafts were saved for review/u);
  expect(requestAt(m.fetch, 1)).toEqual({
    ...original,
    operationId: expect.any(String),
  });
  expect(requestAt(m.fetch, 1).operationId).not.toBe(original.operationId);
  expect(m.fetch).toHaveBeenCalledTimes(2);
});
it("blocks duplicate submit and resets consent on pageshow and input changes", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  await user.click(screen.getByRole("checkbox"));
  await m.replace({ ...f.workspace, bindingSha256: "c".repeat(64) });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  m.fetch.mockImplementation(() => new Promise(() => undefined));
  await submit();
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Generate writing drafts" })
      .closest("form")!,
  );
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox").closest("fieldset")?.disabled).toBe(true);
});
it.each(["fetch", "body"])(
  "bounds a stalled %s attempt and keeps its exact manual retry",
  async (stage) => {
    const f = await fixture();
    const m = await mount(f.workspace, f.owned.analysisId);
    m.fetch.mockImplementation(async () =>
      stage === "fetch"
        ? await new Promise<Response>(() => undefined)
        : new Response(new ReadableStream({ start() {} }), {
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Generate writing drafts" })
        .closest("form")!,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30001);
    });
    vi.useRealTimers();
    await screen.findByRole("button", { name: "Retry exact writing request" });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Retained earlier summary")).toBeTruthy();
  },
);
it("rejects an oversized body and cancels the browser attempt on unmount", async () => {
  const f = await fixture();
  const m = await mount(f.workspace, f.owned.analysisId);
  m.fetch.mockResolvedValueOnce(
    new Response(new Uint8Array(1_048_577), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  await submit();
  await screen.findByRole("alert");
  expect(m.fetch).toHaveBeenCalledTimes(1);
  m.fetch.mockImplementation(
    async () => await new Promise<Response>(() => undefined),
  );
  await submit("Retry exact writing request");
  const signal = m.fetch.mock.calls[1][1]?.signal;
  m.view.unmount();
  expect(signal?.aborted).toBe(true);
});

// Real RR/A11 builders and actual bootstrap producer. Only native row tokens,
// permissions and hashes are fake RPC metadata; they are not installed proof.
async function bootstrapFixture(declared = false) {
  const f = await fixture(declared);
  const readiness = {
    ...CANONICAL_REWRITE_WORKSPACE_PROFILE,
    schemaReady: true,
    initializerExecutable: true,
  };
  const missing = {
    schemaVersion: "canonical-rewrite-workspace-state/1.0.0",
    status: "initialization_required",
    relationshipContext: f.context,
    readiness,
  };
  const selected = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
  };
  const options = { ...selected, model: "fixture-model" };
  const state = decodeCanonicalRewriteWorkspaceState(
    missing,
    f.owned.analysisId,
    f.owned.ownerId,
    options,
  );
  if (state.status !== "initialization_required")
    throw Error("EXPECTED_REAL_MISSING_STATE");
  const emptyRow = {
    ...f.row,
    saved: {
      state: "legacy_unbound",
      publication: null,
      legacyDraft: { summary: null, bullets: [] },
    },
  };
  const nativeAvailable = {
    schemaVersion: "canonical-rewrite-workspace-state/1.0.0",
    status: "available",
    context: emptyRow,
    readiness,
  };
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "read_canonical_rewrite_workspace_state"
        ? missing
        : {
            schemaVersion: "canonical-rewrite-workspace-initialization/1.0.0",
            created: true,
            state: nativeAvailable,
          },
    error: null,
  }));
  const initialized = await initializeCanonicalRewriteWorkspace(
    { rpc },
    f.owned.analysisId,
    f.owned.ownerId,
    selected,
    { model: "fixture-model" },
  );
  const afterRead = buildCanonicalRewriteWorkspace(
    {
      ...emptyRow,
      draft: {
        ...emptyRow.draft,
        updatedAt: "2026-11-15T00:02:00.123456Z",
        contentSha256: "7".repeat(64),
      },
      bindingSha256: "8".repeat(64),
    },
    "fixture-model",
    CANONICAL_REWRITE_READINESS_PROFILE,
  );
  const disabled = decodeCanonicalRewriteWorkspaceState(
    { ...missing, readiness: { ...readiness, initializerExecutable: false } },
    f.owned.analysisId,
    f.owned.ownerId,
    options,
  );
  if (disabled.status !== "initialization_required")
    throw Error("EXPECTED_DISABLED_MISSING_STATE");
  return { ...f, initialization: state, initialized, afterRead, disabled };
}
it("sets up an empty workspace, revalidates actual tokens and requires a separate fresh AI request", async () => {
  const f = await bootstrapFixture(),
    m = await mount(null, f.owned.analysisId, f.initialization),
    user = userEvent.setup();
  const storage = vi.spyOn(Storage.prototype, "setItem");
  expect(screen.queryByRole("checkbox")).toBeNull();
  m.fetch.mockImplementationOnce(async () => {
    m.nextRead(f.afterRead);
    return json(f.initialized);
  });
  await user.click(
    screen.getByRole("button", { name: "Set up writing workspace" }),
  );
  await screen.findByRole("button", { name: "Generate writing drafts" });
  expect(Object.keys(fields(m.fetch)).sort()).toEqual([
    "canonicalVersionId",
    "requirementVersionId",
  ]);
  expect(fields(m.fetch)).toEqual({
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
  });
  expect(m.fetch.mock.calls[0][0]).toBe(
    `/analysis/${f.owned.analysisId}/rewrite/workspace`,
  );
  expect(m.fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  expect(m.load.mock.calls.length).toBeGreaterThan(1);
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(storage).not.toHaveBeenCalled();
  expect(
    screen.queryByText(
      "These drafts are bound to the displayed input versions.",
    ),
  ).toBeNull();
  expect(
    screen.getByText("No version-bound writing drafts are saved here yet."),
  ).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  expect(
    screen
      .getByRole("button", { name: "Generate writing drafts" })
      .hasAttribute("disabled"),
  ).toBe(true);
  m.fetch.mockImplementationOnce(async () =>
    json(
      {
        kind: "pending",
        operationId: requestAt(m.fetch, 1).operationId,
        state: "dispatched",
      },
      409,
    ),
  );
  await submit();
  await screen.findByRole("button", { name: "Retry exact writing request" });
  expect(requestAt(m.fetch, 1).draftId).toBe(f.afterRead.binding.draft.id);
  expect(requestAt(m.fetch, 1).expectedDraftUpdatedAt).toBe(
    f.afterRead.binding.draft.updatedAt,
  );
  expect(requestAt(m.fetch, 1).expectedDraftUpdatedAt).not.toBe(
    f.initialized.workspace.binding.draft.updatedAt,
  );
  expect(fields(m.fetch, 1).aiConsent).toBe("accepted");
  const retained = fields(m.fetch, 1).request;
  await m.replace(null, f.initialization);
  expect(
    screen.getByRole("button", { name: "Retry exact writing request" }),
  ).toBeTruthy();
  expect(m.fetch).toHaveBeenCalledTimes(2);
  m.fetch.mockImplementationOnce(async () => {
    m.nextRead(f.afterRead);
    return json(f.initialized);
  });
  await user.click(
    screen.getByRole("button", { name: "Set up writing workspace" }),
  );
  await screen.findByText(
    "The writing workspace is ready. Review the saved inputs before choosing Generate writing drafts.",
  );
  m.fetch.mockImplementationOnce(async () =>
    json(
      {
        kind: "pending",
        operationId: requestAt(m.fetch, 3).operationId,
        state: "unknown",
      },
      409,
    ),
  );
  await submit("Retry exact writing request");
  await screen.findByRole("button", { name: "Retry exact writing request" });
  expect(fields(m.fetch, 3).request).toBe(retained);
  expect(m.fetch).toHaveBeenCalledTimes(4);
});
it("reuses an existing historical workspace without overwriting its saved copyable drafts", async () => {
  const f = await bootstrapFixture(),
    existing = savedWorkspace(f, true),
    m = await mount(null, f.owned.analysisId, f.initialization);
  m.fetch.mockImplementationOnce(async () => {
    m.nextRead(existing);
    return json({
      kind: "workspace_initialized",
      created: false,
      workspace: existing,
    });
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Set up writing workspace" }));
  await screen.findByRole("button", { name: "Copy draft" });
  expect(
    screen.getByText(
      "These drafts were saved from earlier input versions or settings. Review their pinned references before copying.",
    ),
  ).toBeTruthy();
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "Set up writing workspace" }),
  ).toBeNull();
});
it("retains the exact setup selection after ambiguity and input movement without automatic rebase", async () => {
  const f = await bootstrapFixture(),
    m = await mount(null, f.owned.analysisId, f.initialization);
  m.fetch.mockRejectedValueOnce(Error("PRIVATE_SETUP_DETAIL"));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Set up writing workspace" }));
  await screen.findByRole("button", { name: "Retry workspace setup" });
  const original = fields(m.fetch);
  const newer = await bootstrapFixture(true);
  await m.replace(null, newer.initialization);
  expect(m.fetch).toHaveBeenCalledTimes(1);
  m.fetch.mockResolvedValueOnce(
    json(
      { kind: "error", reason: "stale_inputs", recovery: "review_again" },
      409,
    ),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry workspace setup" }));
  await screen.findByRole("alert");
  expect(fields(m.fetch, 1)).toEqual(original);
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain("PRIVATE_SETUP_DETAIL");
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it.each(["binding", "draft hash"])(
  "rejects malformed setup %s metadata without adopting a workspace",
  async (kind) => {
    const f = await bootstrapFixture(),
      m = await mount(null, f.owned.analysisId, f.initialization);
    const bad = structuredClone(f.initialized);
    if (kind === "binding")
      bad.workspace.binding.authoring.source.ownerId = id(99);
    else bad.workspace.binding.draft.contentSha256 = "invalid";
    m.fetch.mockResolvedValueOnce(json(bad));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Set up writing workspace" }));
    await screen.findByRole("button", { name: "Retry workspace setup" });
    expect(m.load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByText(
        "The writing workspace is ready. Review the saved inputs before choosing Generate writing drafts.",
      ),
    ).toBeNull();
  },
);
it.each(["fetch", "body"])(
  "bounds stalled setup %s and blocks duplicate submit",
  async (stage) => {
    const f = await bootstrapFixture(),
      m = await mount(null, f.owned.analysisId, f.initialization);
    m.fetch.mockImplementation(async () =>
      stage === "fetch"
        ? await new Promise<Response>(() => undefined)
        : new Response(new ReadableStream({ start() {} }), {
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "Set up writing workspace" }),
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Set up writing workspace" })
        .closest("form")!,
    );
    expect(m.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30001);
    });
    vi.useRealTimers();
    await screen.findByRole("button", { name: "Retry workspace setup" });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
  },
);
it("keeps setup disabled without recorded initializer capability and makes no HTTP request", async () => {
  const f = await bootstrapFixture(),
    m = await mount(null, f.owned.analysisId, f.disabled);
  expect(
    screen
      .getByRole("button", { name: "Set up writing workspace" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Set up writing workspace" }));
  expect(m.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("aborts an outstanding setup request when the panel unmounts", async () => {
  const f = await bootstrapFixture(),
    m = await mount(null, f.owned.analysisId, f.initialization);
  m.fetch.mockImplementation(
    async () => await new Promise<Response>(() => undefined),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Set up writing workspace" }));
  const signal = m.fetch.mock.calls[0][1]?.signal;
  m.view.unmount();
  expect(signal?.aborted).toBe(true);
});
