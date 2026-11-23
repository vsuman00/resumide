/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rpc: vi.fn(),
  canonicalLoad: vi.fn(),
}));
vi.mock("~/lib/server/auth", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("~/lib/server/config", () => ({
  getServerConfig: () => ({
    APP_ORIGIN: "https://fixture.test",
    CANONICAL_AUTHORING_ENABLED: true,
    CANONICAL_CORRECTIONS_ENABLED: true,
    EVIDENCE_REVIEW_ENABLED: true,
  }),
}));
vi.mock("~/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("~/lib/server/canonical-repository", async (original) => ({
  ...(await original<typeof import("~/lib/server/canonical-repository")>()),
  loadCanonicalCorrectionWorkspace: mocks.canonicalLoad,
}));
import CanonicalResume, {
  action,
  loader,
  shouldRevalidate,
} from "~/routes/analysis.canonical";
import {
  loadCanonicalEntryRegroupWorkspace,
  type CanonicalEntryRegroupCurrent,
} from "~/lib/server/canonical-entry-regroup-repository";
import { buildNativeEvidence } from "~/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "~/lib/server/document-evidence";
import { deriveNativePageDiagnostics } from "~/lib/server/ocr/pdf-detection";
import { deriveEvidenceReviewTargets } from "~/lib/server/evidence-targets";
import { deriveEvidenceEntryAssociations } from "~/lib/server/evidence-entry-associations";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "~/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "~/lib/server/canonical-resume-schema";
import { projectCanonicalCorrectionSourceChoices } from "~/lib/server/canonical-corrections";
import {
  prepareCanonicalEntryRegroupCommand,
  CanonicalEntryRegroupCommandSchema,
  type CanonicalEntryRegroupCommandContext,
  type CanonicalEntryRegroupRequest,
  type CanonicalEntryRegroupCommandPreparation,
} from "~/lib/server/canonical-entry-regroup-commands";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const defaultText =
  "Experience\nEmployer: Synthetic Alpha Labs\nRole: Platform Engineer\nDates: 2020 - 2022\nEmployer: Synthetic Beta Labs\nRole: Data Engineer\nDates: 2021 - 2023";
function stableBase(doc: CanonicalResumeDraft) {
  const identities = [
    doc.versionId,
    ...doc.facts.map((f) => f.id),
    ...doc.sections.flatMap((s) => [
      s.id,
      ...s.entries.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ]),
    ...doc.changes.map((c) => c.id),
  ];
  const mapped = new Map(
    identities.map((value, index) => [value, id(100 + index)]),
  );
  const stable = JSON.parse(
    JSON.stringify(doc, (_key, value) =>
      typeof value === "string" && mapped.has(value)
        ? mapped.get(value)
        : value,
    ),
  );
  stable.createdAt = "2026-11-13T00:00:00.000Z";
  for (const event of stable.changes) event.createdAt = stable.createdAt;
  return CanonicalResumeDraftSchema.parse(stable);
}
function fixture(text = defaultText): CanonicalEntryRegroupCommandContext {
  const evidence = reconcileDocumentEvidence(
    {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-11-13T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const ownedContext = {
    ownerId: id(2),
    analysisId: id(3),
    sourceId: id(4),
    inputSha256: "a".repeat(64),
    attemptId: id(1),
    resumeId: id(5),
    organizationId: id(6),
  };
  const targets = deriveEvidenceReviewTargets(evidence, ownedContext),
    base = stableBase(importCanonicalEvidence(evidence, ownedContext));
  const context: CanonicalEntryRegroupCommandContext = {
    sqlBaseContentSha256: "b".repeat(64),
    historicalBaseView: {
      canonicalRevision: 1,
      ownedContext,
      review: {
        analysisId: id(3),
        attemptId: id(1),
        attemptNumber: 1,
        evidence,
        corrections: [],
        revision: 0,
        scoringEligible: false,
        nativePageDiagnostics: deriveNativePageDiagnostics(
          evidence.nativeSource,
        ),
        targets,
      },
      expectedBinding: {
        ...targets.binding,
        resumeId: id(5),
        organizationId: id(6),
        targetModelVersion: targets.modelVersion,
        projectionModelVersion: "canonical-corrections/1.0.1",
        reviewRevision: 0,
        canonicalHeadId: base.versionId,
      },
      canonicalSnapshot: {
        sourceId: id(4),
        headId: base.versionId,
        current: base,
        ancestors: [],
      },
      selections: [],
    },
  };
  attest(context);
  return context;
}
function attest(context: CanonicalEntryRegroupCommandContext) {
  const v = context.historicalBaseView;
  v.review.historyAttestation = {
    schemaVersion: "evidence-review-history/1.0.0",
    state: "complete_captured_prefix",
    binding: {
      ...v.review.targets.binding,
      targetModelVersion: v.review.targets.modelVersion,
    },
    highWaterRevision: v.review.revision,
    highWaterEventId: v.review.corrections.at(-1)?.id ?? null,
    receivedCount: v.review.corrections.length,
    pageCount: Math.ceil(v.review.corrections.length / 100),
  };
  v.expectedBinding.reviewRevision = v.review.revision;
}
function request(
  context: CanonicalEntryRegroupCommandContext,
): CanonicalEntryRegroupRequest {
  const v = context.historicalBaseView,
    groups = deriveEvidenceEntryAssociations(
      v.review.evidence,
      v.ownedContext,
    ).groups;
  const choices =
    projectCanonicalCorrectionSourceChoices(v).choicesBySourceTarget;
  return {
    schemaVersion: "canonical-entry-regroup-command/1.0.0",
    operation: "approve_whole_entry_regroup",
    binding: {
      ...v.ownedContext,
      evidenceSchemaVersion: "evidence/2.0.0",
      fieldExtractorVersion: "evidence-fields/1.0.1",
      targetModelVersion: "evidence-targets/1.0.0",
      associationModelVersion: "evidence-entry-associations/1.0.0",
      producerVersion: "canonical-engine/1.0.4",
      admissionPolicyVersion: "whole-entry-regroup-admission/1.0.0",
      structuralTextProfileVersion: "a02-structural-text/1.0.0",
      correctionProjectionModelVersion: "canonical-corrections/1.0.1",
      correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
      regroupModelVersion: "canonical-entry-regroup/1.0.0",
    },
    base: {
      versionId: v.canonicalSnapshot!.current.versionId,
      revision: v.canonicalRevision,
      contentSha256: context.sqlBaseContentSha256,
      locale: v.canonicalSnapshot!.current.locale,
    },
    expected: {
      reviewRevision: v.review.revision,
      reviewHeadId: v.review.corrections.at(-1)?.id ?? null,
      assignmentRevision: 0,
      assignmentHeadId: null,
      associationRevision: 0,
      associationHeadId: null,
      regroupRevision: 0,
      regroupHeadId: null,
      canonicalHeadId: v.canonicalSnapshot!.headId,
    },
    selections: groups.map((g) => ({
      groupId: g.id,
      factIds: g.members.map((m) => choices.get(m.targetId)![0].factId),
    })),
    unselectedDisposition: "retain_eligible_original_origins",
  };
}
function prepared(value: CanonicalEntryRegroupCommandPreparation) {
  expect(value.state).toBe("prepared");
  if (value.state !== "prepared") throw Error("EXPECTED_PREPARED");
  return value;
}
function commit(context: CanonicalEntryRegroupCommandContext) {
  const raw = request(context),
    p = prepared(prepareCanonicalEntryRegroupCommand(context, raw));
  return {
    ...raw,
    acknowledgement: true as const,
    previewHash: p.previewHash,
    idempotencyKey: id(900),
  };
}

const routers: ReturnType<typeof createMemoryRouter>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.user.mockResolvedValue({ id: id(2) });
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
  vi.restoreAllMocks();
});
function freshCurrent(
  captured: CanonicalEntryRegroupRequest["expected"],
  canRetry: boolean,
): CanonicalEntryRegroupCurrent {
  return {
    status: "available",
    captured,
    freshCanPreview: true,
    freshCanCommit: canRetry,
  };
}
function serverFixture(canRetry = false) {
  const context = fixture(),
    v = context.historicalBaseView,
    raw = request(context);
  const current = freshCurrent(raw.expected, canRetry);
  const row = {
    schemaVersion: "entry-regroup-read/1.0.0",
    status: "available",
    scoringEligible: false,
    source: v.ownedContext,
    attempt: { id: id(1), attemptNumber: 1, envelope: v.review.evidence },
    historical: {
      base: { ...raw.base, content: v.canonicalSnapshot!.current },
      ancestors: [],
      review: {
        revision: 0,
        headId: null,
        events: [],
        historyAttestation: v.review.historyAttestation,
      },
    },
    current,
    compatibilityReady: true,
    canRetry,
  };
  return { context, row, raw };
}
const storageKey = `resumide:canonical-entry-regroup:pending:${id(2)}:${id(3)}`;
function record(command = commit(fixture()), savedAt = Date.now()) {
  return JSON.stringify({
    schemaVersion: "pending-canonical-entry-regroup/1.0.0",
    savedAt,
    command,
  });
}
async function wirePage(
  canRetry = false,
  outcome:
    | "applied"
    | "ambiguous"
    | "invalid_result"
    | "missing_history"
    | "conflict" = "applied",
  moved = false,
  applyResultGate?: Promise<void>,
) {
  const f = serverFixture(canRetry),
    base = f.context.historicalBaseView.canonicalSnapshot!.current;
  const shown = moved
    ? reviseCanonical(
        base,
        {
          operation: "edit",
          factId: base.facts[0].id,
          value: "Synthetic later wording",
        },
        "2026-11-13T02:00:00.000Z",
      )
    : base;
  if (moved) f.row.current = { status: "unavailable" };
  const applied: unknown[] = [];
  const rpc = vi
    .fn()
    .mockImplementation(async (name: string, args: unknown) => {
      if (name === "apply_canonical_entry_regroup") {
        applied.push(args);
        if (applyResultGate) await applyResultGate;
        if (outcome === "ambiguous") throw Error("hidden transport detail");
        if (outcome === "conflict")
          return {
            data: {
              schemaVersion: "entry-regroup-result/1.0.0",
              status: "conflict",
              scoringEligible: false,
            },
            error: null,
          };
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        const command = CanonicalEntryRegroupCommandSchema.parse(
          stored.command,
        );
        expect(args).toMatchObject({
          p_command: {
            previewHash: command.previewHash,
            idempotencyKey: command.idempotencyKey,
          },
        });
        return {
          data: {
            schemaVersion: "entry-regroup-result/1.0.0",
            status: "applied",
            baseVersionId: command.base.versionId,
            baseRevision: command.base.revision,
            idempotencyKey: command.idempotencyKey,
            commandSha256:
              outcome === "invalid_result"
                ? "f".repeat(64)
                : command.previewHash,
            versionId: id(950),
            revision: command.base.revision + 1,
            batchId: id(951),
            regroupRevision: command.expected.regroupRevision + 1,
            regroupHeadId: id(951),
            idempotent: true,
            scoringEligible: false,
          },
          error: null,
        };
      }
      if (
        outcome === "missing_history" &&
        name === "read_canonical_entry_regroup_workspace" &&
        args &&
        typeof args === "object" &&
        "p_original_capture" in args &&
        args.p_original_capture !== null
      )
        return {
          data: {
            schemaVersion: "entry-regroup-read/1.0.0",
            status: "unavailable",
            scoringEligible: false,
          },
          error: null,
        };
      return {
        data: name === "read_canonical_entry_regroup_workspace" ? f.row : null,
        error: null,
      };
    });
  const workspace = await loadCanonicalEntryRegroupWorkspace(
    { rpc },
    id(3),
    id(2),
  );
  expect(workspace.state).toBe("available");
  mocks.rpc.mockImplementation(rpc);
  mocks.canonicalLoad.mockResolvedValue({
    analysisId: id(3),
    resumeId: id(5),
    current: { sourceId: id(4), revision: moved ? 2 : 1, document: shown },
    headId: shown.versionId,
    history: [],
    nextOffset: null,
    comparison: null,
    scoringEligible: false,
  });
  const router = createMemoryRouter(
    [
      {
        path: "/analysis/:id/canonical",
        Component: CanonicalResume,
        loader,
        action,
        shouldRevalidate,
      },
    ],
    { initialEntries: [`/analysis/${id(3)}/canonical`] },
  );
  routers.push(router);
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  await screen.findByRole("heading", { name: "Review your resume facts" });
  return { ...f, workspace, router, rpc, applied };
}
function chooseFirstGroup() {
  fireEvent.click(screen.getByLabelText("Include this whole-entry merge 1"));
  for (const field of ["Employer", "Role", "Dates"]) {
    const select = screen.getByLabelText(
      `${field} saved fact for source group 1`,
    );
    if (!(select instanceof HTMLSelectElement))
      throw Error("EXPECTED_FACT_SELECT");
    fireEvent.change(select, { target: { value: select.options[1].value } });
  }
}
async function previewFirstGroup() {
  chooseFirstGroup();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
  );
  await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
}
function acknowledgement() {
  return screen.getByRole("checkbox", {
    name: /I reviewed the whole affected entries/,
  });
}
function submitSave() {
  fireEvent.click(acknowledgement());
  fireEvent.click(
    screen.getByRole("button", { name: "Save this entry arrangement" }),
  );
}
describe("saved whole-entry regroup consumer", () => {
  it("current canonical route lacks the saved-entry regroup review", async () => {
    await wirePage();
    expect(
      await screen.findByRole("heading", {
        name: "Regroup saved work entries",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByLabelText(/Include this whole-entry merge/)
        .every(
          (input) => !(input instanceof HTMLInputElement) || !input.checked,
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByLabelText(/saved fact for source group/)
        .every(
          (input) => input instanceof HTMLSelectElement && input.value === "",
        ),
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Facts and confirmation" }),
    ).toBeTruthy();
  });
  it("uses explicit actual fact choices and full Core diff while denied saving stays unavailable", async () => {
    const f = await wirePage();
    await previewFirstGroup();
    expect(
      screen.getByRole("heading", { name: "Before regrouping" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Proposed arrangement" }),
    ).toBeTruthy();
    expect(acknowledgement()).toHaveProperty("checked", false);
    expect(acknowledgement()).toHaveProperty("disabled", true);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(f.applied).toHaveLength(0);
  });
  it("retains before transport and manually resumes the same original after reload and head movement", async () => {
    const first = await wirePage(true, "ambiguous");
    await previewFirstGroup();
    submitSave();
    await screen.findByRole("button", { name: "Review retained request" });
    await waitFor(() => expect(first.applied).toHaveLength(1));
    const storedText = sessionStorage.getItem(storageKey)!;
    const stored = JSON.parse(storedText),
      command = CanonicalEntryRegroupCommandSchema.parse(stored.command);
    expect(Object.keys(stored).sort()).toEqual([
      "command",
      "savedAt",
      "schemaVersion",
    ]);
    expect(storedText).not.toMatch(
      /Synthetic|wholeEntryAcknowledgement|preparation|beforeSections|confirmation/,
    );
    cleanup();
    first.router.dispose();
    const second = await wirePage(true, "applied", true);
    expect(second.applied).toHaveLength(0);
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: /I reviewed the whole affected entries/,
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Review retained request" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    expect(acknowledgement()).toHaveProperty("checked", false);
    expect(sessionStorage.getItem(storageKey)).toBe(storedText);
    fireEvent.click(acknowledgement());
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same regroup request" }),
    );
    const link = await screen.findByRole("link", {
      name: "Open the saved arrangement",
    });
    expect(link.getAttribute("href")).toBe(
      `/analysis/${id(3)}/canonical?version=${id(950)}`,
    );
    const firstArgs = first.applied[0];
    if (
      !firstArgs ||
      typeof firstArgs !== "object" ||
      !("p_command" in firstArgs)
    )
      throw Error("EXPECTED_RPC_COMMAND");
    expect(second.applied[0]).toMatchObject({
      p_user_id: id(2),
      p_analysis_id: id(3),
      p_command: firstArgs.p_command,
    });
    expect(command.base.versionId).not.toBe(id(950));
    await waitFor(() => expect(sessionStorage.getItem(storageKey)).toBeNull());
  });
  it("irreversibly invalidates previews on edit/revert, loader refresh and persisted history", async () => {
    const f = await wirePage(true);
    await previewFirstGroup();
    const original = document.querySelector(
      'form[action$="regroup=commit"] input[name="command"]',
    );
    if (!(original instanceof HTMLInputElement))
      throw Error("EXPECTED_COMMAND");
    const key = JSON.parse(original.value).idempotencyKey;
    fireEvent.click(screen.getByLabelText("Include this whole-entry merge 1"));
    fireEvent.click(screen.getByLabelText("Include this whole-entry merge 1"));
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    const next = document.querySelector(
      'form[action$="regroup=commit"] input[name="command"]',
    );
    if (!(next instanceof HTMLInputElement)) throw Error("EXPECTED_COMMAND");
    expect(JSON.parse(next.value).idempotencyKey).not.toBe(key);
    await act(async () => {
      f.router.revalidate();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
      ).toBeNull(),
    );
    chooseFirstGroup();
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    fireEvent(window, event);
    chooseFirstGroup();
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(f.applied).toHaveLength(0);
  });
  it.each(["expired", "foreign", "oversized", "checkbox"])(
    "rejects invalid retained metadata %s without automatic actions",
    async (kind) => {
      const command = commit(fixture());
      let text = record(command);
      if (kind === "expired")
        text = record(command, Date.now() - 30 * 60 * 1000);
      if (kind === "foreign")
        text = record({
          ...command,
          binding: { ...command.binding, ownerId: id(999) },
        });
      if (kind === "oversized") text = " ".repeat(20_001);
      if (kind === "checkbox")
        text = JSON.stringify({
          ...JSON.parse(text),
          wholeEntryAcknowledgement: "accepted",
        });
      sessionStorage.setItem(storageKey, text);
      const f = await wirePage(true);
      expect(
        screen.queryByRole("button", { name: "Review retained request" }),
      ).toBeNull();
      expect(sessionStorage.getItem(storageKey)).toBeNull();
      expect(f.applied).toHaveLength(0);
    },
  );
  it("keeps the original TTL on an ambiguous retry", async () => {
    const original = record(commit(fixture()), Date.now() - 60_000);
    sessionStorage.setItem(storageKey, original);
    let releaseApply!: () => void;
    const applyResultGate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    const f = await wirePage(true, "ambiguous", true, applyResultGate);
    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Review retained request" }),
      );
      await screen.findByRole("heading", {
        name: "Whole-entry regroup preview",
      });
      fireEvent.click(acknowledgement());
      fireEvent.click(
        screen.getByRole("button", { name: "Retry the same regroup request" }),
      );
      await waitFor(() => expect(f.applied).toHaveLength(1));
      // RPC entry precedes its response. Hold that boundary so this test cannot
      // confuse a pending save with the settled ambiguous-error render.
      expect(acknowledgement()).toHaveProperty("checked", false);
      expect(
        screen.getByRole("button", { name: "Retry the same regroup request" }),
      ).toHaveProperty("disabled", true);
      expect(sessionStorage.getItem(storageKey)).toBe(original);
      await act(async () => releaseApply());
      await screen.findByText(
        "The original request is retained. Review it before retrying; no automatic retry will run.",
      );
      expect(sessionStorage.getItem(storageKey)).toBe(original);
      expect(
        screen.queryByRole("checkbox", {
          name: /I reviewed the whole affected entries/,
        }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Review retained request" }),
      );
      await screen.findByRole("heading", {
        name: "Whole-entry regroup preview",
      });
      expect(acknowledgement()).toHaveProperty("checked", false);
    } finally {
      await act(async () => releaseApply());
    }
  });
  it("retains metadata and withholds success when an actual SDK receipt fails correlation", async () => {
    const f = await wirePage(true, "invalid_result");
    await previewFirstGroup();
    submitSave();
    await waitFor(() => expect(f.applied).toHaveLength(1));
    await screen.findByText(/The save result could not be confirmed/);
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open the saved arrangement" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review retained request" }),
    ).toBeTruthy();
  });
  it("preserves the exact pending request without offering apply when historical diff is unavailable", async () => {
    const stored = record();
    sessionStorage.setItem(storageKey, stored);
    const f = await wirePage(true, "missing_history");
    fireEvent.click(
      screen.getByRole("button", { name: "Review retained request" }),
    );
    await screen.findByText(/The original request is retained/);
    expect(sessionStorage.getItem(storageKey)).toBe(stored);
    expect(f.applied).toHaveLength(0);
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retry the same regroup request" }),
    ).toBeNull();
  });
  it("reports storage failure and retains an honest in-memory retry", async () => {
    await wirePage(true, "ambiguous");
    await previewFirstGroup();
    vi.spyOn(
      Object.getPrototypeOf(window.sessionStorage),
      "setItem",
    ).mockImplementation(() => {
      throw Error("storage denied");
    });
    submitSave();
    await screen.findByText(
      /This tab could not store or restore the regroup request/,
    );
    expect(
      await screen.findByRole("button", { name: "Review retained request" }),
    ).toBeTruthy();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
});

describe("actual Router delayed-preview reachability", () => {
  it.each([false, true])(
    "keeps busy guards and discards cancelled A with a newer B=%s",
    async (newer) => {
      const f = await wirePage(true),
        user = userEvent.setup();
      await act(async () => {
        await f.router.navigate(
          `/analysis/${id(3)}/canonical?version=${f.raw.base.versionId}`,
        );
      });
      const delayed: {
        resolve: (result: { data: typeof f.row; error: null }) => void;
      }[] = [];
      mocks.rpc.mockImplementation((name: string, args: unknown) => {
        if (
          name === "read_canonical_entry_regroup_workspace" &&
          args &&
          typeof args === "object" &&
          "p_original_capture" in args &&
          args.p_original_capture !== null
        )
          return new Promise<{ data: typeof f.row; error: null }>((resolve) => {
            delayed.push({ resolve });
          });
        return f.rpc(name, args);
      });
      chooseFirstGroup();
      await user.click(
        screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
      );
      await waitFor(() => expect(delayed).toHaveLength(1));
      const group = screen.getByLabelText("Include this whole-entry merge 1");
      expect(group.matches(":disabled")).toBe(true);
      expect(
        screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
      ).toHaveProperty("disabled", true);
      await user.click(group);
      await user.click(group);
      expect(group).toHaveProperty("checked", true);
      await user.click(
        screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
      );
      expect(delayed).toHaveLength(1);
      await act(async () => {
        f.router.navigate(-1);
      });
      await waitFor(() => expect(f.router.state.navigation.state).toBe("idle"));
      await waitFor(() =>
        expect(
          screen.getByLabelText("Include this whole-entry merge 1"),
        ).toHaveProperty("checked", false),
      );
      let newerKey: string | null = null;
      if (newer) {
        chooseFirstGroup();
        await user.click(
          screen.getByRole("button", {
            name: "Preview whole-entry arrangement",
          }),
        );
        await waitFor(() => expect(delayed).toHaveLength(2));
        await act(async () => {
          delayed[1].resolve({ data: f.row, error: null });
        });
        await screen.findByRole("heading", {
          name: "Whole-entry regroup preview",
        });
        const command = document.querySelector(
          'form[action$="regroup=commit"] input[name="command"]',
        );
        if (!(command instanceof HTMLInputElement))
          throw Error("EXPECTED_COMMAND");
        newerKey = JSON.parse(command.value).idempotencyKey;
      }
      await act(async () => {
        delayed[0].resolve({ data: f.row, error: null });
      });
      if (newer) {
        const command = document.querySelector(
          'form[action$="regroup=commit"] input[name="command"]',
        );
        if (!(command instanceof HTMLInputElement))
          throw Error("EXPECTED_COMMAND");
        expect(JSON.parse(command.value).idempotencyKey).toBe(newerKey);
      } else
        expect(
          screen.queryByRole("heading", {
            name: "Whole-entry regroup preview",
          }),
        ).toBeNull();
      expect(f.applied).toHaveLength(0);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    },
  );
});

async function conflictedPage() {
  const f = await wirePage(true, "conflict");
  await previewFirstGroup();
  submitSave();
  await screen.findByText("Review the current saved entries again.");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review retained request" }),
    ).toHaveProperty("disabled", false),
  );
  expect(f.applied).toHaveLength(1);
  const retained = sessionStorage.getItem(storageKey);
  if (!retained) throw Error("EXPECTED_RETAINED_CONFLICT");
  return { ...f, retained };
}
describe("explicit local retry discard", () => {
  it("offers recovery after a definite conflict without automatically clearing the original request", async () => {
    const f = await conflictedPage();
    chooseFirstGroup();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    expect(
      screen.getByRole("button", { name: "Save this entry arrangement" }),
    ).toHaveProperty("disabled", true);
    expect(sessionStorage.getItem(storageKey)).toBe(f.retained);
    expect(f.applied).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Discard local retry details" }),
    ).toBeTruthy();
  });
  it("discards only on explicit click without a request and requires a new preview and unchecked acknowledgement", async () => {
    const f = await conflictedPage();
    chooseFirstGroup();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview whole-entry arrangement" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    const old = document.querySelector(
      'form[action$="regroup=commit"] input[name="command"]',
    );
    if (!(old instanceof HTMLInputElement))
      throw Error("EXPECTED_PREVIEW_COMMAND");
    const oldKey = JSON.parse(old.value).idempotencyKey,
      calls = f.rpc.mock.calls.length;
    sessionStorage.setItem("other-local-details", "preserve");
    const discard = screen.getByRole("button", {
      name: "Discard local retry details",
    });
    expect(discard).toHaveProperty("type", "button");
    fireEvent.click(discard);
    expect(f.rpc.mock.calls).toHaveLength(calls);
    expect(f.applied).toHaveLength(1);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(sessionStorage.getItem("other-local-details")).toBe("preserve");
    expect(
      screen.queryByRole("button", { name: "Review retained request" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Include this whole-entry merge 1"),
    ).toHaveProperty("checked", false);
    expect(
      screen
        .getByRole("link", { name: "Check saved history" })
        .getAttribute("href"),
    ).toBe(`/analysis/${id(3)}/canonical#history-heading`);
    expect(
      screen.getByText(/does not cancel a save or delete a saved version/),
    ).toBeTruthy();
    await previewFirstGroup();
    const next = document.querySelector(
      'form[action$="regroup=commit"] input[name="command"]',
    );
    if (!(next instanceof HTMLInputElement))
      throw Error("EXPECTED_NEW_PREVIEW");
    expect(JSON.parse(next.value).idempotencyKey).not.toBe(oldKey);
    expect(acknowledgement()).toHaveProperty("checked", false);
    expect(
      screen.getByRole("button", { name: "Save this entry arrangement" }),
    ).toHaveProperty("disabled", true);
    expect(f.applied).toHaveLength(1);
  });
  it("keeps pending and historical details when local storage removal fails", async () => {
    const f = await conflictedPage();
    fireEvent.click(
      screen.getByRole("button", { name: "Review retained request" }),
    );
    await screen.findByRole("heading", { name: "Whole-entry regroup preview" });
    const calls = f.rpc.mock.calls.length;
    vi.spyOn(
      Object.getPrototypeOf(window.sessionStorage),
      "removeItem",
    ).mockImplementation(() => {
      throw Error("removal denied");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Discard local retry details" }),
    );
    expect(
      screen.getByText(/Could not discard local retry details/),
    ).toBeTruthy();
    expect(sessionStorage.getItem(storageKey)).toBe(f.retained);
    expect(
      screen.getByRole("button", { name: "Review retained request" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Whole-entry regroup preview" }),
    ).toBeTruthy();
    expect(f.rpc.mock.calls).toHaveLength(calls);
    expect(f.applied).toHaveLength(1);
  });
  it("disables discard during a real in-flight resume and retains the request", async () => {
    const f = await conflictedPage(),
      user = userEvent.setup();
    let release: (() => void) | undefined;
    mocks.rpc.mockImplementation((name: string, args: unknown) => {
      if (
        name === "read_canonical_entry_regroup_workspace" &&
        args &&
        typeof args === "object" &&
        "p_original_capture" in args &&
        args.p_original_capture !== null
      )
        return new Promise((resolve) => {
          release = () => resolve({ data: f.row, error: null });
        });
      return f.rpc(name, args);
    });
    await user.click(
      screen.getByRole("button", { name: "Review retained request" }),
    );
    await waitFor(() => expect(release).toBeTypeOf("function"));
    const discard = screen.getByRole("button", {
      name: "Discard local retry details",
    });
    expect(discard).toHaveProperty("disabled", true);
    await user.click(discard);
    expect(sessionStorage.getItem(storageKey)).toBe(f.retained);
    expect(f.applied).toHaveLength(1);
    await act(async () => {
      release?.();
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Discard local retry details" }),
      ).toHaveProperty("disabled", false),
    );
    expect(sessionStorage.getItem(storageKey)).toBe(f.retained);
  });
});
