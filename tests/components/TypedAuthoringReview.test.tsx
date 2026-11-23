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
import { afterEach, describe, expect, it, vi } from "vitest";
import TypedAuthoringReview, {
  type TypedAuthoringReviewProps,
  type TypedAuthoringPreparedReview,
  type TypedAuthoringDecisionResult,
} from "../../app/components/TypedAuthoringReview";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  buildTypedAuthoringWorkspace,
  createTypedAuthoringCommand,
  typedAuthoringCommandSha256,
  validateTypedAuthoringReceipt,
  type TypedAuthoringSelection,
} from "../../app/lib/server/typed-authoring-contract";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import {
  buildTypedAuthoringWorkspace as buildProtocolWorkspace,
  buildTypedAuthoringPatch as buildProtocolPatch,
  createTypedAuthoringCommand as createProtocolCommand,
  TypedAuthoringProposalSchema as ProtocolProposalSchema,
  type TypedAuthoringCommand,
} from "../../app/lib/server/typed-authoring-protocol";

afterEach(cleanup);
async function fixture(
  options: Parameters<typeof createRequirementContextFixture>[0] = {},
) {
  const data = await createRequirementContextFixture({
    confirm: true,
    ...options,
  });
  const workspace = buildTypedAuthoringWorkspace(data.context);
  const prepare = (
    selection: TypedAuthoringSelection,
  ): TypedAuthoringPreparedReview => {
    const patch = buildTypedAuthoringPatch(data.context, selection, "Created");
    return {
      patch,
      acceptCommand: createTypedAuthoringCommand(
        patch,
        "accept",
        randomUUID(),
        true,
      ),
      rejectCommand: createTypedAuthoringCommand(
        patch,
        "reject",
        randomUUID(),
        false,
      ),
    };
  };
  const request = vi.fn(async (selection: TypedAuthoringSelection) =>
    prepare(selection),
  );
  const decision = vi
    .fn<TypedAuthoringReviewProps["onDecision"]>()
    .mockResolvedValue({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
  const undo = vi.fn(async () => {});
  const props: TypedAuthoringReviewProps = {
    workspace,
    onRequestProposal: request,
    onDecision: decision,
    onUndo: undo,
  };
  return { ...data, workspace, prepare, request, decision, undo, props };
}
async function choose(f: Awaited<ReturnType<typeof fixture>>) {
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Job requirement" }),
    f.workspace.clauses[0].clauseId,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Current contribution" }),
    f.targetFactId,
  );
  return user;
}
async function preview(f: Awaited<ReturnType<typeof fixture>>) {
  const user = await choose(f);
  await user.click(
    screen.getByRole("button", { name: "Prepare wording change" }),
  );
  expect(
    await screen.findByRole("region", { name: "Complete wording change" }),
  ).toBeTruthy();
  return user;
}
function receiptFor(
  f: Awaited<ReturnType<typeof fixture>>,
  command: TypedAuthoringCommand,
  proposal: TypedAuthoringPreparedReview,
) {
  if (command.schemaVersion !== "typed-authoring-command/1.0.0")
    throw Error("EXPECTED_LEGACY_RECEIPT_FIXTURE");
  let version = f.context.canonical.content;
  if (command.operation === "accept") {
    version = reviseCanonical(version, {
      operation: "edit",
      factId: command.target.factId,
      value: proposal.patch.after,
    });
    version = reviseCanonical(version, {
      operation: "confirm",
      factId: command.target.factId,
    });
  }
  // Synthetic route receipt: real canonical transitions and shared correlation validator, not SQL proof.
  return validateTypedAuthoringReceipt(
    {
      schemaVersion: "typed-authoring-receipt/1.0.0",
      status: "applied",
      action: command.operation,
      idempotencyKey: command.idempotencyKey,
      commandSha256: typedAuthoringCommandSha256(command),
      baseVersionId: command.binding.canonical.versionId,
      baseRevision: command.binding.canonical.revision,
      requirementVersionId: command.binding.requirements.versionId,
      requirementRevision: command.binding.requirements.revision,
      versionId: version.versionId,
      revision:
        command.binding.canonical.revision +
        (command.operation === "accept" ? 2 : 0),
      eventId: randomUUID(),
      idempotent: false,
    },
    command,
  );
}

async function declarationFixture() {
  const f = await fixture({
    edit: "Built database services using PostgreSQL",
    confirm: true,
  });
  const workspace = buildProtocolWorkspace(f.context);
  const selection = {
    canonicalVersionId: workspace.binding.canonical.versionId,
    requirementVersionId: workspace.binding.requirements.versionId,
    clauseId: workspace.clauses[0].clauseId,
    targetFactId: f.targetFactId,
  };
  const patch = buildProtocolPatch(f.context, selection, "Created");
  const proposal = ProtocolProposalSchema.parse({
    patch,
    acceptCommand: createProtocolCommand(patch, "accept", randomUUID(), true),
    rejectCommand: createProtocolCommand(patch, "reject", randomUUID(), false),
  });
  f.request.mockResolvedValue(proposal);
  f.props.workspace = workspace;
  return { ...f, proposal, selection };
}

describe("recorded declaration review", () => {
  it("shows actual declaration, confirmation and pinned-fact provenance without borrowing an old quote", async () => {
    const f = await declarationFixture();
    render(<TypedAuthoringReview {...f.props} />);
    await preview(f);
    expect(f.proposal.patch.schemaVersion).toBe("typed-authoring-patch/1.1.0");
    expect(f.proposal.patch.sourceCitations).toEqual([]);
    expect(screen.getByText("Your confirmed declaration")).toBeTruthy();
    expect(
      screen.getByText(
        "No current source quote is linked to this edited wording.",
      ),
    ).toBeTruthy();
    const time = screen.getByText(f.proposal.patch.target.confirmedAt);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe(
      f.proposal.patch.target.confirmedAt,
    );
    expect(
      screen
        .getByRole("link", { name: "Inspect this pinned fact" })
        .getAttribute("href"),
    ).toBe(
      `/analysis/${f.context.source.analysisId}/canonical?version=${f.context.canonical.versionId}#fact-${f.targetFactId}`,
    );
    expect(
      screen.queryByRole("link", { name: "Inspect cited source" }),
    ).toBeNull();
    expect(screen.queryByText("Built services using PostgreSQL")).toBeNull();
    const actor = screen.getByText(f.proposal.patch.target.confirmationActorId);
    expect(actor.closest("details")?.hasAttribute("open")).toBe(false);
    expect(
      screen
        .getByRole("checkbox", {
          name: "I reviewed the complete proposed change and my recorded declaration.",
        })
        .hasAttribute("checked"),
    ).toBe(false);
    expect(screen.getByText(/Numeric score change: unavailable/)).toBeTruthy();
  });
  it("retains the exact 1.1 command with fresh declaration review on a manual retry", async () => {
    const f = await declarationFixture();
    render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Accept reviewed wording" }),
    );
    const retry = await screen.findByRole("button", {
      name: "Retry exact accept submission",
    });
    expect(retry.hasAttribute("disabled")).toBe(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(retry);
    expect(f.decision).toHaveBeenCalledTimes(2);
    expect(f.decision.mock.calls[0]).toEqual([
      f.proposal.acceptCommand,
      "accepted",
    ]);
    expect(f.decision.mock.calls[1][0]).toBe(f.decision.mock.calls[0][0]);
    expect(f.decision.mock.calls[1][0].schemaVersion).toBe(
      "typed-authoring-command/1.1.0",
    );
    expect(
      f.context.canonical.content.facts.find(
        (value) => value.id === f.targetFactId,
      )?.confirmation?.value,
    ).toBe("Built database services using PostgreSQL");
    expect(f.proposal.patch.sourceCitations).toEqual([]);
  });
});

describe("typed proposal review callbacks", () => {
  it("requires explicit clause and target selection without automatic requests", async () => {
    const f = await fixture();
    render(<TypedAuthoringReview {...f.props} />);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Job requirement",
        }) as HTMLSelectElement
      ).value,
    ).toBe("");
    expect(
      screen
        .getByRole("button", { name: "Prepare wording change" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await choose(f);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.decision).not.toHaveBeenCalled();
  });
  it("renders an actual source-preserving proposal, complete text and withheld numbers", async () => {
    const f = await fixture();
    render(<TypedAuthoringReview {...f.props} />);
    await preview(f);
    const selected = f.request.mock.calls[0][0];
    const actual = f.prepare(selected);
    const region = screen.getByRole("region", {
      name: "Complete wording change",
    });
    expect(region.textContent).toContain(actual.patch.before);
    expect(region.textContent).toContain(actual.patch.after);
    expect(region.textContent).toContain(actual.patch.rationale);
    expect(region.textContent).toContain("Numeric score change: unavailable");
    expect(region.textContent).toContain("does not establish proficiency");
    expect(screen.getByRole("checkbox").hasAttribute("checked")).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Accept reviewed wording" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("treats actual date fragments and listings as explanation-only", async () => {
    const f = await fixture({
      clauses: ["Used PostgreSQL from 2020-01-01 to 2022-01-01"],
    });
    render(<TypedAuthoringReview {...f.props} />);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Job requirement" }),
      f.workspace.clauses[0].clauseId,
    );
    expect(
      f.workspace.targets.every(
        (target) => target.state === "explanation_only",
      ),
    ).toBe(true);
    expect(
      screen.getByRole("region", { name: "Claims for explanation only" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Prepare wording change" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(f.request).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Accept reviewed wording" }),
    ).toBeNull();
  });
  it("invalidates review irreversibly after selection edit and revert", async () => {
    const f = await fixture();
    render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(screen.getByRole("checkbox"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Current contribution" }),
      "",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Current contribution" }),
      f.targetFactId,
    );
    expect(
      screen.queryByRole("region", { name: "Proposed wording review" }),
    ).toBeNull();
    expect(f.request).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(f.request).toHaveBeenCalledTimes(2);
  });
  it("clears stale proposals on owned input changes and history restoration", async () => {
    const f = await fixture();
    const view = render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(screen.getByRole("checkbox"));
    const changed = await fixture({ extraVersions: 1 });
    view.rerender(<TypedAuthoringReview {...changed.props} />);
    expect(
      screen.queryByRole("region", { name: "Proposed wording review" }),
    ).toBeNull();
    view.rerender(<TypedAuthoringReview {...f.props} />);
    expect(
      screen.queryByRole("region", { name: "Proposed wording review" }),
    ).toBeNull();
    await preview(f);
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);
    expect(
      screen.queryByRole("region", { name: "Proposed wording review" }),
    ).toBeNull();
    expect(f.decision).not.toHaveBeenCalled();
    await preview(f);
    f.decision.mockResolvedValueOnce({
      kind: "error",
      reason: "stale_inputs",
      recovery: "review_again",
    });
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Accept reviewed wording" }),
    );
    expect(
      screen.getByRole("region", { name: "Retained exact submission" }),
    ).toBeTruthy();
    view.rerender(<TypedAuthoringReview {...changed.props} />);
    await choose(changed);
    await user.click(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    expect(
      screen.getByRole("region", { name: "Proposed wording review" }),
    ).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
  });
  it("blocks duplicate request clicks and rejects untrusted returned patch data", async () => {
    const f = await fixture();
    let release!: (value: TypedAuthoringPreparedReview) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<TypedAuthoringReview {...f.props} />);
    const user = await choose(f);
    await user.dblClick(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    expect(f.request).toHaveBeenCalledOnce();
    await act(async () => {
      release(JSON.parse("{}"));
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Accept reviewed wording" }),
    ).toBeNull();
  });
  it("retains the exact accept command on failure and requires fresh review for manual retry", async () => {
    const f = await fixture();
    let release!: (value: TypedAuthoringDecisionResult) => void;
    f.decision.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(screen.getByRole("checkbox"));
    await user.dblClick(
      screen.getByRole("button", { name: "Accept reviewed wording" }),
    );
    expect(f.decision).toHaveBeenCalledOnce();
    await act(async () => {
      release({
        kind: "error",
        reason: "unavailable",
        recovery: "retry_exact",
      });
    });
    const original = f.decision.mock.calls[0][0];
    const snapshot = JSON.stringify(original);
    expect(original.acknowledgement).toBe(true);
    expect(f.decision.mock.calls[0][1]).toBe("accepted");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      screen
        .getByRole("button", { name: "Retry exact accept submission" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Retry exact accept submission" }),
    );
    expect(f.decision).toHaveBeenCalledTimes(2);
    expect(f.decision.mock.calls[1][0]).toBe(original);
    expect(JSON.stringify(f.decision.mock.calls[1][0])).toBe(snapshot);
  });
  it("retains reject command identity without manufacturing factual acknowledgement", async () => {
    const f = await fixture();
    render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(
      screen.getByRole("button", { name: "Reject this proposal" }),
    );
    const original = f.decision.mock.calls[0][0];
    expect(original.operation).toBe("reject");
    expect(original.acknowledgement).toBe(false);
    expect(f.decision.mock.calls[0][1]).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Retry exact reject submission" }),
    );
    expect(f.decision.mock.calls[1][0]).toBe(original);
    f.decision.mockImplementationOnce(async (command) => {
      const proposal = f.prepare({
        canonicalVersionId: command.binding.canonical.versionId,
        requirementVersionId: command.binding.requirements.versionId,
        clauseId: command.clauseIds[0],
        targetFactId: command.target.factId,
      });
      return { kind: "applied", receipt: receiptFor(f, command, proposal) };
    });
    await user.click(
      screen.getByRole("button", { name: "Retry exact reject submission" }),
    );
    expect(
      screen.getByRole("region", { name: "Recorded decision" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    expect(
      screen.getByRole("region", { name: "Proposed wording review" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Recorded decision" }),
    ).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
  });
  it("links a validated saved receipt and passes the exact receipt to owning-route undo", async () => {
    const f = await fixture();
    f.decision.mockImplementation(async (command) => {
      const proposal = f.prepare({
        canonicalVersionId: command.binding.canonical.versionId,
        requirementVersionId: command.binding.requirements.versionId,
        clauseId: command.clauseIds[0],
        targetFactId: command.target.factId,
      });
      return { kind: "applied", receipt: receiptFor(f, command, proposal) };
    });
    let finishUndo!: () => void;
    f.undo.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUndo = resolve;
        }),
    );
    const view = render(<TypedAuthoringReview {...f.props} />);
    const user = await preview(f);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Accept reviewed wording" }),
    );
    const result = await f.decision.mock.results[0].value;
    if (result.kind !== "applied") throw Error("EXPECTED_RECEIPT");
    expect(
      screen
        .getByRole("link", { name: "Inspect the exact recorded version" })
        .getAttribute("href"),
    ).toContain(
      `version=${result.receipt.versionId}&compare=${result.receipt.baseVersionId}`,
    );
    expect(
      screen.queryByRole("button", { name: "Accept reviewed wording" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Undo this saved change" }),
    );
    expect(f.undo).toHaveBeenCalledWith(result.receipt);
    const changed = await fixture({ extraVersions: 1 });
    view.rerender(<TypedAuthoringReview {...changed.props} />);
    await act(async () => {
      finishUndo();
    });
    expect(
      screen.queryByText(
        "Undo request returned. Review your version history for the owning route's result.",
      ),
    ).toBeNull();
  });
  it("does not resolve a submission from a mismatched receipt", async () => {
    for (const fault of ["key", "revision", "reject_version"] as const) {
      const f = await fixture();
      f.decision.mockImplementation(async (command) => {
        const proposal = f.prepare({
          canonicalVersionId: command.binding.canonical.versionId,
          requirementVersionId: command.binding.requirements.versionId,
          clauseId: command.clauseIds[0],
          targetFactId: command.target.factId,
        });
        const receipt = receiptFor(f, command, proposal);
        return {
          kind: "applied",
          receipt: {
            ...receipt,
            ...(fault === "key"
              ? { idempotencyKey: randomUUID() }
              : fault === "revision"
                ? { revision: receipt.revision - 1 }
                : { versionId: randomUUID() }),
          },
        };
      });
      const view = render(<TypedAuthoringReview {...f.props} />);
      const user = await preview(f);
      if (fault !== "reject_version")
        await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", {
          name:
            fault === "reject_version"
              ? "Reject this proposal"
              : "Accept reviewed wording",
        }),
      );
      expect
        .soft(
          screen.queryByRole("region", { name: "Retained exact submission" }),
          fault,
        )
        .not.toBeNull();
      expect
        .soft(
          screen.queryByRole("region", { name: "Recorded decision" }),
          fault,
        )
        .toBeNull();
      view.unmount();
    }
  });

  it("keeps native labelled controls reachable by keyboard", async () => {
    const f = await fixture();
    render(<TypedAuthoringReview {...f.props} />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Job requirement" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Job requirement" }),
      f.workspace.clauses[0].clauseId,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Current contribution" }),
      f.targetFactId,
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    await user.keyboard("{Enter}");
    expect(f.request).toHaveBeenCalledOnce();
  });
});
