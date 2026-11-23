/** @vitest-environment jsdom */
import { webcrypto } from "node:crypto";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import JdClauseOrderDecisionReview from "../../app/components/JdClauseOrderDecisionReview";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId as id,
} from "../fixtures/jd-clause-order";
import {
  buildClauseOrderProposal,
  clauseOrderCommandSha256,
} from "../../app/lib/server/clause-order-authoring";
import * as decisionContract from "../../app/lib/jd-clause-order-decisions";
import type { JdClauseOrderCommand } from "../../app/lib/jd-clause-order-decisions";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.unstubAllGlobals();
});
async function fixture(
  options: Parameters<typeof createJdClauseOrderFixture>[0] = {},
) {
  const f = await createJdClauseOrderFixture(options);
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const proposal = buildClauseOrderProposal(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    selection,
    { acceptKey: id(90), rejectKey: id(91) },
  );
  return { ...f, proposal };
}
function receipt(c: JdClauseOrderCommand, idempotent = false) {
  return {
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
    versionId:
      c.operation === "accept" ? id(94) : c.binding.canonical.versionId,
    revision: c.binding.canonical.revision + (c.operation === "accept" ? 2 : 0),
    eventId: id(95),
    idempotent,
  };
}
const ready = () =>
  screen.findByRole("button", { name: "Accept reviewed wording" });
const acknowledgement = () =>
  screen.getByRole("checkbox", {
    name: "I reviewed the complete wording, source support and saved job requirement.",
  });
it("renders the complete actual prepared wording, JD and source with pinned references and no undo authority", async () => {
  const f = await fixture();
  render(
    <JdClauseOrderDecisionReview proposal={f.proposal} onDecision={vi.fn()} />,
  );
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
  expect(
    screen.getByRole("blockquote", { name: "Whole quoted source claim" })
      .textContent,
  ).toBe(f.proposal.draft.before);
  expect(
    within(screen.getByRole("list", { name: "Proposed clause order" }))
      .getAllByRole("blockquote")
      .map((n) => n.textContent),
  ).toEqual([
    f.proposal.draft.sourceClauses[1].text,
    f.proposal.draft.sourceClauses[0].text,
  ]);
  expect(
    screen
      .getByRole("link", {
        name: "Inspect the current fact and pinned version",
      })
      .getAttribute("href"),
  ).toBe(
    `/analysis/${f.owned.analysisId}/canonical?version=${f.proposal.draft.binding.canonical.versionId}#fact-${f.targetFactId}`,
  );
  expect(
    screen
      .getByRole("link", { name: "Inspect the saved job requirements" })
      .getAttribute("href"),
  ).toBe(
    `/analysis/${f.owned.analysisId}/requirements?version=${f.proposal.draft.binding.requirements.versionId}`,
  );
  expect(screen.queryByRole("button", { name: /undo/iu })).toBeNull();
  expect(
    screen.getByText(/Numeric score and score change: unavailable/u),
  ).toBeTruthy();
});
it("requires a fresh controlled acknowledgement before acceptance", async () => {
  const f = await fixture(),
    onDecision = vi.fn(),
    user = userEvent.setup();
  render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  const accept = await ready();
  expect(accept).toHaveProperty("disabled", true);
  await user.click(accept);
  expect(onDecision).not.toHaveBeenCalled();
  await user.click(acknowledgement());
  expect(accept).toHaveProperty("disabled", false);
});
it("accepts only the exact actual producer command and a fully correlated receipt", async () => {
  const f = await fixture(),
    onDecision = vi.fn(async (c: JdClauseOrderCommand) => receipt(c)),
    user = userEvent.setup();
  render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  expect(onDecision).toHaveBeenCalledExactlyOnceWith(
    f.proposal.acceptCommand,
    "accepted",
  );
  expect(
    await screen.findByText(/The exact decision was confirmed as saved/u),
  ).toBeTruthy();
  expect(
    screen.getByText(/original support citations remain recorded provenance/u),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Inspect the confirmed saved version" })
      .getAttribute("href"),
  ).toBe(`/analysis/${f.owned.analysisId}/canonical?version=${id(94)}`);
  expect(
    screen.queryByRole("button", { name: "Accept reviewed wording" }),
  ).toBeNull();
});
it("records rejection without an acknowledgement or a resume-head movement claim", async () => {
  const f = await fixture(),
    onDecision = vi.fn(async (c: JdClauseOrderCommand) => receipt(c)),
    user = userEvent.setup();
  render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(
    screen.getByRole("button", { name: "Reject this proposal" }),
  );
  expect(onDecision).toHaveBeenCalledExactlyOnceWith(
    f.proposal.rejectCommand,
    null,
  );
  expect(
    await screen.findByText(
      "Rejection was confirmed. This decision did not move the resume head.",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "Inspect the confirmed saved version" }),
  ).toBeNull();
});
it("withholds all controls when the actual proposal command digest is corrupted", async () => {
  const f = await fixture(),
    onDecision = vi.fn();
  render(
    <JdClauseOrderDecisionReview
      proposal={{ ...f.proposal, acceptCommandSha256: "0".repeat(64) }}
      onDecision={onDecision}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This decision review could not be verified. No decision was sent.",
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(onDecision).not.toHaveBeenCalled();
});
it("rejects a cross-bound command even when its individual shape is valid", async () => {
  const f = await fixture(),
    other = await fixture({ jdText: "Requirements\nGit preferred" }),
    onDecision = vi.fn();
  render(
    <JdClauseOrderDecisionReview
      proposal={{
        ...f.proposal,
        rejectCommand: other.proposal.rejectCommand,
        rejectCommandSha256: other.proposal.rejectCommandSha256,
      }}
      onDecision={onDecision}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This decision review could not be verified. No decision was sent.",
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(onDecision).not.toHaveBeenCalled();
});
it("treats a wrong receipt SHA as unknown and requires fresh acknowledgement for exact retry", async () => {
  const f = await fixture(),
    onDecision = vi.fn(async (c: JdClauseOrderCommand) => ({
      ...receipt(c),
      commandSha256: "0".repeat(64),
    })),
    user = userEvent.setup();
  render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("outcome could not be confirmed"),
  );
  expect(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  ).toHaveProperty("disabled", true);
  expect(acknowledgement()).toHaveProperty("checked", false);
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
});
it("retains the exact original proposal and command after transport ambiguity and later head movement", async () => {
  const f = await fixture(),
    next = await fixture({ jdText: "Requirements\nGit preferred" }),
    user = userEvent.setup();
  const onDecision = vi
    .fn<(c: JdClauseOrderCommand, ack: "accepted" | null) => Promise<unknown>>()
    .mockRejectedValueOnce(Error("synthetic transport loss"))
    .mockImplementationOnce(async (c) => receipt(c, true));
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  await screen.findByRole("alert");
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={next.proposal}
      onDecision={onDecision}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry exact acceptance" }),
    ).toHaveProperty("disabled", true),
  );
  expect(
    screen.getByRole("blockquote", { name: "Exact saved JD quote" })
      .textContent,
  ).toBe(f.proposal.draft.relevance.quote);
  await user.click(acknowledgement());
  await user.click(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  );
  await screen.findByText(/The exact decision was confirmed as saved/u);
  expect(onDecision.mock.calls).toEqual([
    [f.proposal.acceptCommand, "accepted"],
    [f.proposal.acceptCommand, "accepted"],
  ]);
});
it("clears unknown private review state when the actual source scope changes", async () => {
  const f = await fixture(),
    next = await fixture({ header: "Experience" }),
    onDecision = vi.fn().mockRejectedValue(Error("synthetic loss")),
    user = userEvent.setup();
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  await screen.findByRole("alert");
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={next.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  expect(
    screen.queryByRole("button", { name: "Retry exact acceptance" }),
  ).toBeNull();
  expect(acknowledgement()).toHaveProperty("checked", false);
  expect(
    screen
      .getByRole("link", {
        name: "Inspect the current fact and pinned version",
      })
      .getAttribute("href"),
  ).toContain(next.proposal.draft.binding.canonical.versionId);
});
it("resets acknowledgement on a full proposal change and persisted history restoration", async () => {
  const f = await fixture(),
    next = await fixture({ jdText: "Requirements\nGit preferred" }),
    user = userEvent.setup(),
    onDecision = vi.fn();
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  expect(acknowledgement()).toHaveProperty("checked", true);
  act(() => {
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
  });
  expect(acknowledgement()).toHaveProperty("checked", false);
  await user.click(acknowledgement());
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={next.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  expect(acknowledgement()).toHaveProperty("checked", false);
  expect(onDecision).not.toHaveBeenCalled();
});
it("prevents a duplicate action while the first controlled handler is unresolved", async () => {
  const f = await fixture(),
    user = userEvent.setup();
  let resolve: ((value: unknown) => void) | undefined;
  const onDecision = vi.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.dblClick(await ready());
  expect(onDecision).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Retry exact acceptance" }),
  ).toHaveProperty("disabled", true);
  await act(async () => {
    resolve?.(receipt(f.proposal.acceptCommand));
  });
  expect(await screen.findByText(/confirmed as saved/u)).toBeTruthy();
});
it("does not publish an old in-flight receipt into a different source review", async () => {
  const f = await fixture(),
    next = await fixture({ header: "Experience" }),
    user = userEvent.setup();
  let resolve: ((value: unknown) => void) | undefined;
  const onDecision = vi.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={next.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await act(async () => {
    resolve?.(receipt(f.proposal.acceptCommand));
  });
  expect(screen.queryByText(/confirmed as saved/u)).toBeNull();
  expect(acknowledgement()).toHaveProperty("checked", false);
});

it("keeps a confirmed old receipt attached to its original review after same-source heads move in flight", async () => {
  const f = await fixture(),
    next = await fixture({ jdText: "Requirements\nGit preferred" }),
    user = userEvent.setup();
  let resolve: ((value: unknown) => void) | undefined;
  const onDecision = vi.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await ready();
  await user.click(acknowledgement());
  await user.click(await ready());
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={next.proposal}
      onDecision={onDecision}
    />,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("link", { name: "Inspect the saved job requirements" })
        .getAttribute("href"),
    ).toContain(f.proposal.draft.binding.requirements.versionId),
  );
  await act(async () => {
    resolve?.(receipt(f.proposal.acceptCommand));
  });
  await screen.findByText(/The exact decision was confirmed as saved/u);
  expect(
    screen.getByRole("blockquote", { name: "Exact saved JD quote" })
      .textContent,
  ).toBe(f.proposal.draft.relevance.quote);
  expect(
    screen
      .getByRole("link", {
        name: "Inspect the current fact and pinned version",
      })
      .getAttribute("href"),
  ).toContain(f.proposal.draft.binding.canonical.versionId);
  expect(onDecision).toHaveBeenCalledExactlyOnceWith(
    f.proposal.acceptCommand,
    "accepted",
  );
});
it("ignores stale async verification after mutation of the incoming proposal", async () => {
  const f = await fixture(),
    onDecision = vi.fn();
  let release: (() => void) | undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const originalDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
  const digest = vi
    .spyOn(webcrypto.subtle, "digest")
    .mockImplementationOnce(async (algorithm, data) => {
      await held;
      return originalDigest(algorithm, data);
    });
  const verification = vi.spyOn(
    decisionContract,
    "validateClauseOrderProposal",
  );
  const view = render(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await waitFor(() => expect(digest).toHaveBeenCalled());
  f.proposal.draft.relevance.quote = "Changed after preparation";
  view.rerender(
    <JdClauseOrderDecisionReview
      proposal={f.proposal}
      onDecision={onDecision}
    />,
  );
  await screen.findByRole("alert");
  await act(async () => {
    release?.();
    await verification.mock.results[0].value;
  });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("blockquote")).toBeNull();
  expect(onDecision).not.toHaveBeenCalled();
});
