/** @vitest-environment jsdom */
import { randomUUID } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import TypedAuthoringBridge from "../../app/components/TypedAuthoringBridge";
import { createRequirementContextFixture } from "../fixtures/requirement-context";
import {
  reviseCanonical,
  rollbackCanonical,
} from "../../app/lib/server/canonical-content";
import {
  buildTypedAuthoringWorkspace as buildProtocolWorkspace,
  buildTypedAuthoringPatch as buildProtocolPatch,
  createTypedAuthoringCommand as createProtocolCommand,
  TypedAuthoringProposalSchema as ProtocolProposalSchema,
  validateTypedAuthoringReceipt as validateProtocolReceipt,
  typedAuthoringCommandSha256 as protocolCommandSha256,
  type TypedAuthoringCommand as ProtocolCommand,
} from "../../app/lib/server/typed-authoring-protocol";
import {
  buildTypedAuthoringPatch,
  buildTypedAuthoringWorkspace,
  createTypedAuthoringCommand,
  validateTypedAuthoringReceipt,
  typedAuthoringCommandSha256,
  type TypedAuthoringCommand,
} from "../../app/lib/server/typed-authoring-contract";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const id = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const f = await createRequirementContextFixture({ confirm: true });
  const workspace = buildTypedAuthoringWorkspace(f.context);
  const selection = {
    canonicalVersionId: workspace.binding.canonical.versionId,
    requirementVersionId: workspace.binding.requirements.versionId,
    clauseId: workspace.clauses[0].clauseId,
    targetFactId: f.targetFactId,
  };
  const patch = buildTypedAuthoringPatch(f.context, selection, "Created");
  const proposal = {
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
  const receiptFor = (command: TypedAuthoringCommand) => {
    let doc = f.context.canonical.content;
    if (command.operation === "accept") {
      doc = reviseCanonical(doc, {
        operation: "edit",
        factId: command.target.factId,
        value: patch.after,
      });
      doc = reviseCanonical(doc, {
        operation: "confirm",
        factId: command.target.factId,
      });
    }
    // Synthetic HTTP receipt uses actual canonical transitions and Node correlation.
    // It is not evidence that the SQL writer has run.
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
        versionId: doc.versionId,
        revision:
          command.binding.canonical.revision +
          (command.operation === "accept" ? 2 : 0),
        eventId: id(1),
        idempotent: false,
      },
      command,
    );
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const load = vi.fn(async () => null);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: load,
        element: (
          <TypedAuthoringBridge
            analysisId={f.context.source.analysisId}
            workspace={workspace}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  const mounted = render(<RouterProvider router={router} />);
  await screen.findByRole("combobox", { name: "Job requirement" });
  return {
    ...f,
    workspace,
    selection,
    proposal,
    receiptFor,
    fetch,
    load,
    router,
    mounted,
  };
}
async function preview(
  f: Pick<Awaited<ReturnType<typeof fixture>>, "selection" | "targetFactId">,
) {
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Job requirement" }),
    f.selection.clauseId,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Current contribution" }),
    f.targetFactId,
  );
  await user.click(
    screen.getByRole("button", { name: "Prepare wording change" }),
  );
  return user;
}
function fields(
  f: Pick<Awaited<ReturnType<typeof fixture>>, "fetch">,
  index: number,
) {
  const init = f.fetch.mock.calls[index][1];
  if (!(init?.body instanceof FormData))
    throw Error("EXPECTED_NATIVE_FORMDATA");
  return Object.fromEntries(init.body.entries());
}
async function accept(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Accept reviewed wording" }),
  );
}

async function declarationFixture() {
  const f = await createRequirementContextFixture({
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
  const edited = reviseCanonical(f.context.canonical.content, {
    operation: "edit",
    factId: f.targetFactId,
    value: patch.after,
  });
  const confirmed = reviseCanonical(edited, {
    operation: "confirm",
    factId: f.targetFactId,
  });
  const receiptFor = (command: ProtocolCommand) =>
    validateProtocolReceipt(
      {
        schemaVersion: "typed-authoring-receipt/1.0.0",
        status: "applied",
        action: command.operation,
        idempotencyKey: command.idempotencyKey,
        commandSha256: protocolCommandSha256(command),
        baseVersionId: command.binding.canonical.versionId,
        baseRevision: command.binding.canonical.revision,
        requirementVersionId: command.binding.requirements.versionId,
        requirementRevision: command.binding.requirements.revision,
        versionId:
          command.operation === "accept"
            ? confirmed.versionId
            : command.binding.canonical.versionId,
        revision:
          command.binding.canonical.revision +
          (command.operation === "accept" ? 2 : 0),
        eventId: randomUUID(),
        idempotent: false,
      },
      command,
    );
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const load = vi.fn(async () => null);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: load,
        element: (
          <TypedAuthoringBridge
            analysisId={f.owned.analysisId}
            workspace={workspace}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("combobox", { name: "Job requirement" });
  return {
    ...f,
    workspace,
    selection,
    proposal,
    confirmed,
    receiptFor,
    fetch,
    load,
  };
}

describe("versioned recorded declaration HTTP bridge", () => {
  it("retains the actual 1.1 wire and fresh declaration acknowledgement through retry and recorded undo", async () => {
    const f = await declarationFixture();
    const saved = f.receiptFor(f.proposal.acceptCommand);
    const undone = rollbackCanonical(f.confirmed, f.context.canonical.content);
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockRejectedValueOnce(Error("SYNTHETIC_LOST_RESPONSE"))
      .mockResolvedValueOnce(json({ kind: "applied", receipt: saved }))
      .mockImplementationOnce(async (_url, init) => {
        if (!(init?.body instanceof FormData))
          throw Error("EXPECTED_NATIVE_FORMDATA");
        return json({
          kind: "undone",
          idempotencyKey: init.body.get("idempotencyKey"),
          receipt: {
            status: "applied",
            action: "undo",
            versionId: undone.versionId,
            revision: saved.revision + 1,
            eventId: randomUUID(),
            idempotent: false,
          },
        });
      });
    const user = await preview(f);
    expect(screen.getByText("Your confirmed declaration")).toBeTruthy();
    expect(
      screen.getByText(
        "No current source quote is linked to this edited wording.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Inspect cited source" }),
    ).toBeNull();
    await accept(user);
    const retry = await screen.findByRole("button", {
      name: "Retry exact accept submission",
    });
    expect(retry.hasAttribute("disabled")).toBe(true);
    await user.click(
      screen.getByRole("checkbox", {
        name: "I reviewed the complete proposed change and my recorded declaration.",
      }),
    );
    await user.click(retry);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    expect(fields(f, 1)).toEqual({
      action: "decision",
      command: JSON.stringify(f.proposal.acceptCommand),
      reviewAcknowledgement: "accepted",
    });
    expect(fields(f, 2)).toEqual(fields(f, 1));
    expect(f.proposal.acceptCommand.schemaVersion).toBe(
      "typed-authoring-command/1.1.0",
    );
    expect(f.proposal.acceptCommand.sourceCitations).toEqual([]);
    await user.click(
      screen.getByRole("button", { name: "Undo this saved change" }),
    );
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(3));
    expect(fields(f, 3)).toMatchObject({
      action: "undo",
      receipt: JSON.stringify(saved),
    });
    expect(fields(f, 3).idempotencyKey).not.toBe(saved.idempotencyKey);
  });
  it("refuses a mixed-version command pair instead of treating it as a reviewed declaration", async () => {
    const f = await declarationFixture();
    f.fetch.mockResolvedValueOnce(
      json({
        kind: "proposal",
        proposal: {
          ...f.proposal,
          acceptCommand: {
            ...f.proposal.acceptCommand,
            schemaVersion: "typed-authoring-command/1.0.0",
          },
        },
      }),
    );
    await preview(f);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Complete wording change" }),
    ).toBeNull();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.load).toHaveBeenCalledOnce();
  });
});

describe("authenticated typed authoring browser bridge", () => {
  it("explains a stale preview and clears the previous decision controls", async () => {
    const f = await fixture();
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(
        json(
          { kind: "error", reason: "stale_inputs", recovery: "review_again" },
          409,
        ),
      );
    const user = await preview(f);
    await screen.findByRole("region", { name: "Proposed wording review" });
    await user.click(
      screen.getByRole("button", { name: "Prepare wording change" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/The reviewed inputs changed/u);
    expect(
      screen
        .getByRole("link", { name: "Open current input versions" })
        .getAttribute("href"),
    ).toBe(`/analysis/${f.context.source.analysisId}/score`);
    expect(
      screen.queryByRole("button", { name: "Accept reviewed wording" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Prepare wording change",
        }) as HTMLButtonElement
      ).closest("fieldset")?.disabled,
    ).toBe(true);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(fields(f, 1)).toEqual({
      action: "preview",
      selection: JSON.stringify(f.selection),
    });
  });

  it("posts an explicit exact selection to the private resource without URL or storage payloads", async () => {
    const f = await fixture();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    expect(f.fetch).not.toHaveBeenCalled();
    f.fetch.mockResolvedValueOnce(
      json({ kind: "proposal", proposal: f.proposal }),
    );
    await preview(f);
    expect(
      await screen.findByRole("region", { name: "Complete wording change" }),
    ).toBeTruthy();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.fetch.mock.calls[0][0]).toBe(
      `/analysis/${f.context.source.analysisId}/author/typed`,
    );
    expect(f.fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    expect(fields(f, 0)).toEqual({
      action: "preview",
      selection: JSON.stringify(f.selection),
    });
    expect(storage).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(screen.getByText(/Numeric score change: unavailable/)).toBeTruthy();
    expect(
      screen.queryByText(/AI generated|score increase guaranteed/),
    ).toBeNull();
    storage.mockRestore();
  });
  it("sends the original accept command and fresh named acknowledgement, then revalidates a correlated receipt", async () => {
    const f = await fixture();
    const saved = f.receiptFor(f.proposal.acceptCommand);
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(json({ kind: "applied", receipt: saved }));
    const user = await preview(f);
    await accept(user);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    expect(fields(f, 1)).toEqual({
      action: "decision",
      command: JSON.stringify(f.proposal.acceptCommand),
      reviewAcknowledgement: "accepted",
    });
    expect(
      screen
        .getByRole("link", { name: "Inspect the exact recorded version" })
        .getAttribute("href"),
    ).toContain(saved.versionId);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it("retains the exact manual accept retry after network ambiguity and requires another fresh acknowledgement", async () => {
    const f = await fixture();
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockRejectedValueOnce(Error("PRIVATE_NETWORK_DETAIL"))
      .mockResolvedValueOnce(
        json({
          kind: "applied",
          receipt: f.receiptFor(f.proposal.acceptCommand),
        }),
      );
    const user = await preview(f);
    await accept(user);
    const retry = await screen.findByRole("button", {
      name: "Retry exact accept submission",
    });
    expect(retry.hasAttribute("disabled")).toBe(true);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.load).toHaveBeenCalledOnce();
    expect(screen.queryByText(/PRIVATE_NETWORK_DETAIL/)).toBeNull();
    await user.click(screen.getByRole("checkbox"));
    await user.click(retry);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    expect(fields(f, 2)).toEqual(fields(f, 1));
  });
  it("omits the acceptance checkbox field for the exact reject command", async () => {
    const f = await fixture();
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(
        json({
          kind: "applied",
          receipt: f.receiptFor(f.proposal.rejectCommand),
        }),
      );
    const user = await preview(f);
    await user.click(
      screen.getByRole("button", { name: "Reject this proposal" }),
    );
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    expect(fields(f, 1)).toEqual({
      action: "decision",
      command: JSON.stringify(f.proposal.rejectCommand),
    });
  });
  it.each(["stale", "rationale", "command", "citation"] as const)(
    "refuses a malformed or stale %s proposal before displaying a review",
    async (kind) => {
      const f = await fixture();
      const bad = structuredClone(f.proposal);
      const value: unknown =
        kind === "rationale"
          ? {
              ...bad,
              patch: { ...bad.patch, rationale: { private: "PRIVATE_DETAIL" } },
            }
          : kind === "citation"
            ? { ...bad, patch: { ...bad.patch, sourceCitations: [null] } }
            : bad;
      if (kind === "stale") bad.patch.binding.canonical.versionId = id(90);
      if (kind === "command") bad.acceptCommand.idempotencyKey = "__proto__";
      f.fetch.mockResolvedValueOnce(
        json({ kind: "proposal", proposal: value }),
      );
      await preview(f);
      await screen.findByRole("alert");
      expect(
        screen.queryByRole("region", { name: "Complete wording change" }),
      ).toBeNull();
      expect(screen.queryByText(/PRIVATE_DETAIL/)).toBeNull();
      expect(f.load).toHaveBeenCalledOnce();
    },
  );
  it.each(["key", "revision", "version", "action"] as const)(
    "keeps a retry instead of trusting a mismatched receipt %s",
    async (kind) => {
      const f = await fixture();
      const saved = f.receiptFor(f.proposal.acceptCommand);
      if (kind === "key") saved.idempotencyKey = id(91);
      if (kind === "revision") saved.revision++;
      if (kind === "version") saved.versionId = saved.baseVersionId;
      if (kind === "action") saved.action = "reject";
      f.fetch
        .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
        .mockResolvedValueOnce(json({ kind: "applied", receipt: saved }));
      const user = await preview(f);
      await accept(user);
      expect(
        (
          await screen.findByRole("button", {
            name: "Retry exact accept submission",
          })
        ).hasAttribute("disabled"),
      ).toBe(true);
      expect(f.load).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("link", {
          name: "Inspect the exact recorded version",
        }),
      ).toBeNull();
    },
  );
  it("uses fixed known errors and keeps raw server details and prototype names out of the UI", async () => {
    const f = await fixture();
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(
        json(
          {
            kind: "error",
            reason: "constructor",
            recovery: "retry_exact",
            detail: "PRIVATE_PROVIDER_DETAIL",
          },
          503,
        ),
      );
    const user = await preview(f);
    await accept(user);
    await screen.findByRole("button", {
      name: "Retry exact accept submission",
    });
    expect(
      screen.queryByText(/constructor|PRIVATE_PROVIDER_DETAIL/),
    ).toBeNull();
    expect(f.load).toHaveBeenCalledOnce();
  });
  it("preserves an undo key across a lost response and revalidates only the correlated canonical undo receipt", async () => {
    const f = await fixture();
    const saved = f.receiptFor(f.proposal.acceptCommand);
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(json({ kind: "applied", receipt: saved }))
      .mockRejectedValueOnce(Error("LOST_UNDO_RESPONSE"))
      .mockImplementationOnce(async (_url, init) => {
        if (!(init?.body instanceof FormData)) throw Error("EXPECTED_FORM");
        return json({
          kind: "undone",
          idempotencyKey: init.body.get("idempotencyKey"),
          receipt: {
            status: "applied",
            action: "undo",
            versionId: id(92),
            revision: saved.revision + 1,
            eventId: id(93),
            idempotent: true,
          },
        });
      });
    const user = await preview(f);
    await accept(user);
    const undo = await screen.findByRole("button", { name: /undo/i });
    await user.click(undo);
    await screen.findByText(/Undo could not be confirmed/);
    expect(f.load).toHaveBeenCalledTimes(2);
    await user.click(undo);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(3));
    expect(fields(f, 3)).toEqual(fields(f, 2));
    expect(fields(f, 2)).toMatchObject({
      action: "undo",
      receipt: JSON.stringify(saved),
    });
    expect(fields(f, 2).idempotencyKey).not.toBe(saved.idempotencyKey);
  });
  it("does not accept an uncorrelated undo response or infer success from HTTP status", async () => {
    const f = await fixture();
    const saved = f.receiptFor(f.proposal.acceptCommand);
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(json({ kind: "applied", receipt: saved }))
      .mockResolvedValueOnce(
        json({
          kind: "undone",
          idempotencyKey: id(94),
          receipt: {
            status: "applied",
            action: "undo",
            versionId: saved.versionId,
            revision: saved.revision,
            eventId: id(95),
            idempotent: true,
          },
        }),
      );
    const user = await preview(f);
    await accept(user);
    await user.click(await screen.findByRole("button", { name: /undo/i }));
    await screen.findByText(/Undo could not be confirmed/);
    expect(f.load).toHaveBeenCalledTimes(2);
  });
  it("aborts an outstanding request on unmount without submitting a decision", async () => {
    const f = await fixture();
    f.fetch.mockImplementation(
      async () => new Promise<Response>(() => undefined),
    );
    await preview(f);
    const signal = f.fetch.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    f.mounted.unmount();
    expect(signal?.aborted).toBe(true);
    expect(f.fetch).toHaveBeenCalledOnce();
  });
  it.each(["fetch", "body"] as const)(
    "bounds an ignored-abort stalled %s decision and retains only a manual exact retry",
    async (stage) => {
      const f = await fixture();
      f.fetch.mockResolvedValueOnce(
        json({ kind: "proposal", proposal: f.proposal }),
      );
      const user = await preview(f);
      f.fetch.mockImplementationOnce(async () =>
        stage === "fetch"
          ? new Promise<Response>(() => undefined)
          : new Response(new ReadableStream<Uint8Array>({ start() {} }), {
              headers: { "Content-Type": "application/json" },
            }),
      );
      await user.click(screen.getByRole("checkbox"));
      const form = screen
        .getByRole("button", { name: "Accept reviewed wording" })
        .closest("form");
      if (!form) throw Error("EXPECTED_DECISION_FORM");
      vi.useFakeTimers();
      fireEvent.submit(form);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30001);
      });
      expect(
        screen
          .getByRole("button", { name: "Retry exact accept submission" })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(f.fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
      expect(fields(f, 1).command).toBe(
        JSON.stringify(f.proposal.acceptCommand),
      );
      expect(f.fetch).toHaveBeenCalledTimes(2);
      expect(f.load).toHaveBeenCalledOnce();
    },
  );
  it("cancels an oversized response stream before waiting for an unbounded body", async () => {
    const f = await fixture();
    const cancel = vi.fn();
    f.fetch
      .mockResolvedValueOnce(json({ kind: "proposal", proposal: f.proposal }))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(131073));
            },
            cancel,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    const user = await preview(f);
    await accept(user);
    await screen.findByRole("button", {
      name: "Retry exact accept submission",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.load).toHaveBeenCalledOnce();
  });
});
