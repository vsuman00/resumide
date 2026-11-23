/** @vitest-environment jsdom */
import { webcrypto } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import JdClauseOrderBridge from "../../app/components/JdClauseOrderBridge";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId as id,
} from "../fixtures/jd-clause-order";
import {
  buildClauseOrderProposal,
  validateClauseOrderReceipt,
  clauseOrderCommandSha256,
} from "../../app/lib/server/clause-order-authoring";
import { buildJdClauseOrderPlan } from "../../app/lib/server/jd-clause-order-drafting";
import {
  reviseCanonical,
  rollbackCanonical,
} from "../../app/lib/server/canonical-content";
import {
  JdClauseOrderWorkspaceSchema,
  JdClauseOrderRequestFailure,
  type JdClauseOrderCommand,
} from "../../app/lib/jd-clause-order-decisions";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const json = (raw: unknown, status = 200) =>
  new Response(JSON.stringify(raw), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function fixture(
  options: Parameters<typeof createJdClauseOrderFixture>[0] = {},
) {
  const f = await createJdClauseOrderFixture({
    header: "Experience",
    ...options,
  });
  const expected = { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId };
  const plan = buildJdClauseOrderPlan(f.context, {
    ...expected,
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
  });
  const proposal = buildClauseOrderProposal(f.context, expected, {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  });
  const workspace = JdClauseOrderWorkspaceSchema.parse({
    schemaVersion: "jd-clause-order-workspace/2.0.0",
    binding: proposal.draft.binding,
    proposals: [proposal],
    inspectedPairCount: 1,
    truncated: false,
  });
  const receiptFor = (c: JdClauseOrderCommand) => {
    let document = f.context.canonical.content;
    if (c.operation === "accept") {
      document = reviseCanonical(document, {
        operation: "edit",
        factId: c.target.factId,
        value: proposal.draft.after,
      });
      document = reviseCanonical(document, {
        operation: "confirm",
        factId: c.target.factId,
      });
    }
    const receipt = validateClauseOrderReceipt(
      {
        schemaVersion: "jd-clause-order-receipt/2.0.0",
        status: "applied",
        action: c.operation,
        idempotencyKey: c.idempotencyKey,
        commandSha256: clauseOrderCommandSha256(c),
        draftId: c.draftId,
        baseVersionId: c.binding.canonical.versionId,
        baseRevision: c.binding.canonical.revision,
        requirementVersionId: c.binding.requirements.versionId,
        requirementRevision: c.binding.requirements.revision,
        versionId: document.versionId,
        revision:
          c.binding.canonical.revision + (c.operation === "accept" ? 2 : 0),
        eventId: id(801),
        idempotent: false,
      },
      c,
    );
    return { document, receipt };
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const props = {
    analysisId: f.owned.analysisId,
    source: f.context.source,
    workspace,
    previewPlan: plan,
  };
  return { ...f, plan, proposal, workspace, receiptFor, fetch, props };
}
function show(f: Awaited<ReturnType<typeof fixture>>) {
  return render(
    <MemoryRouter>
      <JdClauseOrderBridge {...f.props} />
    </MemoryRouter>,
  );
}
function fields(
  f: Pick<Awaited<ReturnType<typeof fixture>>, "fetch">,
  index: number,
) {
  const body = f.fetch.mock.calls[index][1]?.body;
  if (!(body instanceof FormData)) throw Error("EXPECTED_FORMDATA");
  return Object.fromEntries(body.entries());
}
const ready = () =>
  screen.findByRole("button", { name: "Accept reviewed wording" });
async function accept() {
  const user = userEvent.setup();
  await ready();
  await user.click(screen.getByRole("checkbox"));
  await user.click(await ready());
  return user;
}
function undoReceipt(
  f: Awaited<ReturnType<typeof fixture>>,
  accepted: ReturnType<typeof f.receiptFor>,
  key: string,
) {
  const restored = rollbackCanonical(
    accepted.document,
    f.context.canonical.content,
  );
  return {
    schemaVersion: "jd-clause-order-undo-receipt/2.0.0",
    status: "applied",
    action: "undo",
    idempotencyKey: key,
    acceptedEventId: accepted.receipt.eventId,
    acceptedCommandSha256: accepted.receipt.commandSha256,
    acceptedVersionId: accepted.receipt.versionId,
    baseVersionId: accepted.receipt.baseVersionId,
    versionId: restored.versionId,
    revision: accepted.receipt.revision + 1,
    eventId: id(802),
    idempotent: false,
  };
}
it("renders actual prepared full review without a readonly contradiction or automatic request", async () => {
  const f = await fixture();
  show(f);
  await ready();
  expect(
    screen.getByRole("blockquote", { name: "Complete current wording" })
      .textContent,
  ).toBe(f.proposal.draft.before);
  expect(
    screen.getByRole("blockquote", { name: "Complete proposed wording" })
      .textContent,
  ).toBe(f.proposal.draft.after);
  expect(
    screen.getByRole("blockquote", { name: "Exact saved JD quote" })
      .textContent,
  ).toBe(f.proposal.draft.relevance.quote);
  expect(screen.queryByText(/This preview cannot save or undo/u)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Undo this saved change" }),
  ).toBeNull();
  expect(f.fetch).not.toHaveBeenCalled();
});
it("posts only the exact accepted command with fresh acknowledgement and same-origin bounded options", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  f.fetch.mockResolvedValue(json({ kind: "applied", receipt: saved.receipt }));
  show(f);
  await accept();
  await screen.findByText(/The exact decision was confirmed as saved/u);
  expect(fields(f, 0)).toEqual({
    action: "decision",
    command: JSON.stringify(f.proposal.acceptCommand),
    reviewAcknowledgement: "accepted",
  });
  expect(f.fetch.mock.calls[0][0]).toBe(
    `/analysis/${f.owned.analysisId}/author/clause-order`,
  );
  expect(f.fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  const fact = saved.document.facts.find((v) => v.id === f.targetFactId);
  expect(fact?.sources).toEqual([]);
  expect(fact?.state).toBe("candidate_confirmed");
  expect(fact?.value).toBe(f.proposal.draft.after);
  expect(
    await screen.findByRole("button", { name: "Undo this saved change" }),
  ).toBeTruthy();
});
it("omits acceptance acknowledgement for exact rejection and offers no undo", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.rejectCommand);
  f.fetch.mockResolvedValue(json({ kind: "applied", receipt: saved.receipt }));
  show(f);
  await ready();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Reject this proposal" }));
  await screen.findByText(
    "Rejection was confirmed. This decision did not move the resume head.",
  );
  expect(fields(f, 0)).toEqual({
    action: "decision",
    command: JSON.stringify(f.proposal.rejectCommand),
  });
  expect(screen.queryByRole("button", { name: /undo/iu })).toBeNull();
});
it("undo posts the accepted2 receipt with a new key and accepts only correlated undo2", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  f.fetch
    .mockResolvedValueOnce(json({ kind: "applied", receipt: saved.receipt }))
    .mockImplementationOnce(async (_url, init) => {
      if (!(init?.body instanceof FormData)) throw Error("EXPECTED_FORMDATA");
      return json({
        kind: "undone",
        receipt: undoReceipt(f, saved, String(init.body.get("idempotencyKey"))),
      });
    });
  show(f);
  await accept();
  await userEvent
    .setup()
    .click(
      await screen.findByRole("button", { name: "Undo this saved change" }),
    );
  await screen.findByText(/Undo was confirmed/u);
  const payload = fields(f, 1);
  expect(payload.action).toBe("undo");
  expect(payload.receipt).toBe(JSON.stringify(saved.receipt));
  expect(payload.idempotencyKey).not.toBe(saved.receipt.idempotencyKey);
  expect(Object.keys(payload).sort()).toEqual([
    "action",
    "idempotencyKey",
    "receipt",
  ]);
  expect(
    screen.getByRole("link", { name: "Inspect the restored version" }),
  ).toBeTruthy();
});
it("retains exact unknown acceptance across same-source changed heads and a null workspace", async () => {
  const f = await fixture(),
    next = await fixture({ jdText: "Requirements\nGit preferred" }),
    saved = f.receiptFor(f.proposal.acceptCommand);
  vi.stubGlobal("fetch", f.fetch);
  f.fetch
    .mockRejectedValueOnce(Error("synthetic transport loss"))
    .mockResolvedValueOnce(
      json({
        kind: "applied",
        receipt: { ...saved.receipt, idempotent: true },
      }),
    );
  const view = show(f);
  const user = await accept();
  await screen.findByRole("button", { name: "Retry exact acceptance" });
  view.rerender(
    <MemoryRouter>
      <JdClauseOrderBridge {...next.props} workspace={null} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("blockquote", { name: "Exact saved JD quote" })
      .textContent,
  ).toBe(f.proposal.draft.relevance.quote);
  expect(screen.queryByText(/This preview cannot save or undo/u)).toBeNull();
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  );
  await screen.findByText(/confirmed as saved/u);
  expect(fields(f, 1)).toEqual(fields(f, 0));
  expect(f.fetch).toHaveBeenCalledTimes(2);
});
it("does not erase an earlier unknown acceptance after a later validated unavailable response", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  f.fetch
    .mockRejectedValueOnce(Error("synthetic loss"))
    .mockResolvedValueOnce(
      json(
        { kind: "error", reason: "unavailable", recovery: "unavailable" },
        503,
      ),
    )
    .mockResolvedValueOnce(
      json({
        kind: "applied",
        receipt: { ...saved.receipt, idempotent: true },
      }),
    );
  show(f);
  const user = await accept();
  for (let i = 0; i < 2; i++) {
    await screen.findByRole("button", { name: "Retry exact acceptance" });
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Retry exact acceptance" }),
    );
    if (i === 0)
      await screen.findByText(
        /service is unavailable for this retained request/u,
      );
  }
  await screen.findByText(/confirmed as saved/u);
  expect(fields(f, 1)).toEqual(fields(f, 0));
  expect(fields(f, 2)).toEqual(fields(f, 0));
  expect(f.fetch).toHaveBeenCalledTimes(3);
});
it("retains the same undo payload and key through unknown and later known errors", async () => {
  const f = await fixture(),
    next = await fixture({ jdText: "Requirements\nGit preferred" }),
    saved = f.receiptFor(f.proposal.acceptCommand);
  vi.stubGlobal("fetch", f.fetch);
  f.fetch
    .mockResolvedValueOnce(json({ kind: "applied", receipt: saved.receipt }))
    .mockRejectedValueOnce(Error("synthetic undo loss"))
    .mockResolvedValueOnce(
      json(
        { kind: "error", reason: "stale_inputs", recovery: "review_again" },
        409,
      ),
    )
    .mockImplementationOnce(async (_url, init) => {
      if (!(init?.body instanceof FormData)) throw Error("EXPECTED_FORMDATA");
      return json({
        kind: "undone",
        receipt: {
          ...undoReceipt(f, saved, String(init.body.get("idempotencyKey"))),
          idempotent: true,
        },
      });
    });
  const view = show(f);
  await accept();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Undo this saved change" }),
  );
  await screen.findByRole("button", { name: "Retry exact undo" });
  view.rerender(
    <MemoryRouter>
      <JdClauseOrderBridge {...next.props} workspace={null} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Retry exact undo" }));
  await screen.findByText(/service requests a review of current inputs/u);
  await user.click(screen.getByRole("button", { name: "Retry exact undo" }));
  await screen.findByText(/Undo was confirmed/u);
  expect(fields(f, 2)).toEqual(fields(f, 1));
  expect(fields(f, 3)).toEqual(fields(f, 1));
  expect(f.fetch).toHaveBeenCalledTimes(4);
});
it("refuses a wrong undo event/key without losing the exact retry payload", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  f.fetch
    .mockResolvedValueOnce(json({ kind: "applied", receipt: saved.receipt }))
    .mockImplementation(async (_url, init) => {
      if (!(init?.body instanceof FormData)) throw Error("EXPECTED_FORMDATA");
      return json({
        kind: "undone",
        receipt: {
          ...undoReceipt(f, saved, String(init.body.get("idempotencyKey"))),
          acceptedEventId: id(999),
        },
      });
    });
  show(f);
  await accept();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Undo this saved change" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Retry exact undo" }),
  );
  await screen.findByRole("button", { name: "Retry exact undo" });
  expect(screen.queryByText(/Undo was confirmed/u)).toBeNull();
  expect(fields(f, 2)).toEqual(fields(f, 1));
});
it("rejects receipt1 downgrades without offering undo or claiming a save", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  f.fetch.mockResolvedValue(
    json({
      kind: "applied",
      receipt: {
        ...saved.receipt,
        schemaVersion: "typed-authoring-receipt/1.0.0",
      },
    }),
  );
  show(f);
  await accept();
  await screen.findByRole("button", { name: "Retry exact acceptance" });
  expect(
    screen.queryByRole("button", { name: "Undo this saved change" }),
  ).toBeNull();
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
});
it("withholds controls on a tampered prepared workspace", async () => {
  const f = await fixture();
  f.props.workspace = {
    ...f.workspace,
    proposals: [{ ...f.proposal, acceptCommandSha256: "0".repeat(64) }],
  };
  show(f);
  await screen.findByText(/source-bound decision workspace is unavailable/u);
  expect(screen.queryByRole("button")).toBeNull();
  expect(f.fetch).not.toHaveBeenCalled();
});
it("aborts and discards an old in-flight request on an actual source change", async () => {
  const f = await fixture(),
    next = await fixture({
      header: "Experience\nSoftware Engineer at Orchard Labs",
    }),
    saved = f.receiptFor(f.proposal.acceptCommand);
  vi.stubGlobal("fetch", f.fetch);
  let resolve: ((response: Response) => void) | undefined;
  f.fetch.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const view = show(f);
  await accept();
  const signal = f.fetch.mock.calls[0][1]?.signal;
  view.rerender(
    <MemoryRouter>
      <JdClauseOrderBridge {...next.props} />
    </MemoryRouter>,
  );
  await ready();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve?.(json({ kind: "applied", receipt: saved.receipt }));
  });
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Retry exact acceptance" }),
  ).toBeNull();
});
it("sends one action during a double click and preserves the confirmed review when fresh workspace vanishes", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  let resolve: ((response: Response) => void) | undefined;
  f.fetch.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const view = show(f);
  await ready();
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.dblClick(await ready());
  expect(f.fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve?.(json({ kind: "applied", receipt: saved.receipt }));
  });
  await screen.findByText(/confirmed as saved/u);
  view.rerender(
    <MemoryRouter>
      <JdClauseOrderBridge {...f.props} workspace={null} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: "Undo this saved change" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("blockquote", { name: "Complete proposed wording" })
      .textContent,
  ).toBe(f.proposal.draft.after);
});
it("bounds ignored-signal transport at five seconds without automatic retry", async () => {
  const f = await fixture();
  f.fetch.mockImplementation(() => new Promise<Response>(() => {}));
  show(f);
  const acceptButton = await ready();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(acceptButton);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  ).toHaveProperty("disabled", true);
  expect(f.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("checks elapsed time even when a transport blocks past the timer callback", async () => {
  const f = await fixture(),
    saved = f.receiptFor(f.proposal.acceptCommand);
  show(f);
  await ready();
  vi.useFakeTimers();
  f.fetch.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 5001);
    return json({ kind: "applied", receipt: saved.receipt });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept reviewed wording" }),
    );
  });
  expect(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  ).toBeTruthy();
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
});
it("refuses an oversized response stream before it can claim a save", async () => {
  const f = await fixture();
  f.fetch.mockResolvedValue(
    new Response("x".repeat(65537), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  show(f);
  await accept();
  await screen.findByRole("button", { name: "Retry exact acceptance" });
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("does not trust a recovery class thrown by transport as an HTTP error envelope", async () => {
  const f = await fixture();
  f.fetch.mockRejectedValue(
    new JdClauseOrderRequestFailure({
      kind: "error",
      reason: "stale_inputs",
      recovery: "review_again",
    }),
  );
  show(f);
  await accept();
  await screen.findByRole("button", { name: "Retry exact acceptance" });
  expect(
    screen.queryByText(/service requests a review of current inputs/u),
  ).toBeNull();
});
it("shows the existing readonly preview when no writer workspace is admitted", async () => {
  const f = await fixture();
  render(
    <MemoryRouter>
      <JdClauseOrderBridge {...f.props} workspace={null} />
    </MemoryRouter>,
  );
  await screen.findByText(/This preview cannot save or undo/u);
  expect(screen.queryByRole("button")).toBeNull();
  expect(f.fetch).not.toHaveBeenCalled();
});
