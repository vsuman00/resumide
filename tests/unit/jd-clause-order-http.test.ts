import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJdClauseOrderFixture,
  jdClauseOrderFixtureId as id,
} from "../fixtures/jd-clause-order";
import {
  buildClauseOrderProposal,
  clauseOrderCommandSha256,
} from "../../app/lib/server/clause-order-authoring";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { CanonicalError } from "../../app/lib/server/canonical-repository";
import { TypedAuthoringError } from "../../app/lib/server/typed-authoring-contract";
import { JD_CLAUSE_ORDER_READINESS_PROFILE } from "../../app/lib/server/jd-clause-order-readiness-profile";
const mocks = vi.hoisted(() => ({ load: vi.fn(), undo: vi.fn() }));
vi.mock(
  "../../app/lib/server/canonical-repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../app/lib/server/canonical-repository")
    >()),
    loadCanonical: mocks.load,
  }),
);
vi.mock(
  "../../app/lib/server/authoring-repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../app/lib/server/authoring-repository")
    >()),
    applyAuthoring: mocks.undo,
  }),
);
import {
  executeJdClauseOrderHttp,
  readJdClauseOrderHttpForm,
  validateJdClauseOrderUndoEvent,
  validateJdClauseOrderUndoResult,
  jdClauseOrderHttpErrorResponse,
  JdClauseOrderHttpError,
} from "../../app/lib/server/jd-clause-order-http";
const url = "https://example.test/analysis/id/author/clause-order";
async function actual() {
  const f = await createJdClauseOrderFixture({ confirm: true });
  const proposal = buildClauseOrderProposal(
    f.context,
    { analysisId: f.owned.analysisId, ownerId: f.owned.ownerId },
    {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    },
    { acceptKey: id(80), rejectKey: id(81) },
  );
  const command = proposal.acceptCommand;
  let document = reviseCanonical(f.context.canonical.content, {
    operation: "edit",
    factId: f.targetFactId,
    value: proposal.draft.after,
  });
  document = reviseCanonical(document, {
    operation: "confirm",
    factId: f.targetFactId,
  });
  const receipt = {
    schemaVersion: "jd-clause-order-receipt/2.0.0" as const,
    status: "applied" as const,
    action: "accept" as const,
    idempotencyKey: command.idempotencyKey,
    commandSha256: clauseOrderCommandSha256(command),
    draftId: command.draftId,
    baseVersionId: command.binding.canonical.versionId,
    baseRevision: command.binding.canonical.revision,
    requirementVersionId: command.binding.requirements.versionId,
    requirementRevision: command.binding.requirements.revision,
    versionId: document.versionId,
    revision: command.binding.canonical.revision + 2,
    eventId: id(82),
    idempotent: false,
  };
  const event = {
    id: receipt.eventId,
    analysis_id: f.owned.analysisId,
    resume_id: f.owned.resumeId,
    owner_id: f.owned.ownerId,
    organization_id: f.owned.organizationId,
    base_version_id: receipt.baseVersionId,
    result_version_id: receipt.versionId,
    idempotency_key: receipt.idempotencyKey,
    action: "accept" as const,
    command,
    result: receipt,
    retention_policy_id: document.retentionPolicyId,
  };
  const undoKey = id(83),
    rawUndo = {
      status: "applied" as const,
      action: "undo" as const,
      versionId: id(84),
      revision: receipt.revision + 1,
      eventId: id(85),
      idempotent: false,
    };
  const undoCommand = {
    action: "undo",
    expectedVersionId: receipt.versionId,
    idempotencyKey: undoKey,
    targetFactId: null,
    sectionId: null,
    value: null,
    questionKind: null,
    pattern: null,
    targetVersionId: receipt.baseVersionId,
    confirmation: false,
    patch: null,
  };
  const undoEvent = {
    ...event,
    id: rawUndo.eventId,
    base_version_id: receipt.versionId,
    result_version_id: rawUndo.versionId,
    idempotency_key: undoKey,
    action: "undo",
    command: undoCommand,
    result: rawUndo,
  };
  return {
    ...f,
    proposal,
    command,
    document,
    receipt,
    event,
    undoKey,
    rawUndo,
    undoEvent,
  };
}
let f: Awaited<ReturnType<typeof actual>>;
beforeAll(async () => {
  f = await actual();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({
    current: {
      document: f.document,
      revision: f.receipt.revision,
      sourceId: f.owned.sourceId,
    },
  });
  mocks.undo.mockResolvedValue(f.rawUndo);
});
const form = (values: Record<string, string>) =>
  new Request(url, { method: "POST", body: new URLSearchParams(values) });
const accept = () => ({
  action: "decision",
  command: JSON.stringify(f.command),
  reviewAcknowledgement: "accepted",
});
function streaming(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    signal,
    duplex: "half",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  };
  return new Request(url, init);
}
function undoClient(
  event: unknown = f.event,
  undone: unknown = f.undoEvent,
  error: unknown = null,
) {
  const reads: { filters: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("authoring_events");
      const read = { filters: {} as Record<string, unknown> };
      const q = {
        select: () => q,
        abortSignal: (signal: AbortSignal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          return q;
        },
        eq: (key: string, value: unknown) => {
          read.filters[key] = value;
          return q;
        },
        maybeSingle: async () => {
          reads.push(read);
          return {
            data: read.filters.id === f.receipt.eventId ? event : undone,
            error,
          };
        },
      };
      return q;
    },
  } as unknown as Parameters<typeof executeJdClauseOrderHttp>[0];
  return { client, reads };
}
function decisionClient(
  response: unknown = f.receipt,
  capability = true,
  error: unknown = null,
) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      let result: { data: unknown; error: unknown };
      if (name === "read_requirement_relationship_context")
        result = { data: structuredClone(f.context), error: null };
      else if (name === "read_jd_clause_order_readiness")
        result = {
          data: {
            ...JD_CLAUSE_ORDER_READINESS_PROFILE,
            schemaReady: true,
            writerExecutable: capability,
          },
          error: null,
        };
      else if (name === "apply_jd_clause_order_action")
        result = { data: response, error };
      else throw Error("UNEXPECTED_RPC");
      const task = Object.assign(Promise.resolve(result), {
        abortSignal: (signal: AbortSignal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          return task;
        },
      });
      return task;
    },
  } as unknown as Parameters<typeof executeJdClauseOrderHttp>[0];
  return { client, calls };
}

describe("bounded clause-order HTTP and v2 undo adapter", () => {
  it("parses only decision/undo and requires the exact independent accept acknowledgement", async () => {
    expect(await readJdClauseOrderHttpForm(form(accept()))).toEqual({
      action: "decision",
      command: f.command,
      reviewAcknowledgement: "accepted",
    });
    const invalidForms: Record<string, string>[] = [
      { action: "decision", command: JSON.stringify(f.command) },
      { ...accept(), reviewAcknowledgement: "true" },
      { ...accept(), extra: "x" },
      { action: "preview", selection: "{}" },
      {
        action: "decision",
        command: JSON.stringify(f.proposal.rejectCommand),
        reviewAcknowledgement: "accepted",
      },
    ];
    for (const value of invalidForms)
      await expect(
        readJdClauseOrderHttpForm(form(value)),
      ).rejects.toMatchObject({ status: 422 });
    expect(
      (
        await readJdClauseOrderHttpForm(
          form({
            action: "decision",
            command: JSON.stringify(f.proposal.rejectCommand),
          }),
        )
      ).action,
    ).toBe("decision");
  });
  it("accepts framed-valid command JSON beyond16KiB without changing command authority", async () => {
    const json = " ".repeat(20_000) + JSON.stringify(f.command);
    expect(Buffer.byteLength(json)).toBeGreaterThan(16384);
    const request = form({ ...accept(), command: json });
    expect(
      Buffer.byteLength(
        new URLSearchParams({ ...accept(), command: json }).toString(),
      ),
    ).toBeLessThan(65536);
    expect(await readJdClauseOrderHttpForm(request)).toEqual({
      action: "decision",
      command: f.command,
      reviewAcknowledgement: "accepted",
    });
  });
  it("rejects duplicate decoded form and nested JSON keys, files and wrong content types", async () => {
    const duplicate = new URLSearchParams(accept());
    duplicate.append("%61ction", "decision");
    duplicate.append("action", "decision");
    await expect(
      readJdClauseOrderHttpForm(
        new Request(url, { method: "POST", body: duplicate }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const json = JSON.stringify(f.command).replace(
      '"ownerId":',
      `"ownerId":"${id(99)}","ownerId":`,
    );
    await expect(
      readJdClauseOrderHttpForm(form({ ...accept(), command: json })),
    ).rejects.toMatchObject({ status: 422 });
    const body = new FormData();
    for (const [k, v] of Object.entries(accept())) body.set(k, v);
    expect(
      (
        await readJdClauseOrderHttpForm(
          new Request(url, { method: "POST", body }),
        )
      ).action,
    ).toBe("decision");
    body.set("command", new Blob(["synthetic"]), "body.txt");
    await expect(
      readJdClauseOrderHttpForm(new Request(url, { method: "POST", body })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      readJdClauseOrderHttpForm(
        new Request(url, {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("retains the 64KiB boundary and bounded cancellation without waiting for hostile cleanup", async () => {
    const prefix = new URLSearchParams({
        action: "decision",
        reviewAcknowledgement: "accepted",
        command: JSON.stringify(f.command),
      }).toString(),
      body = prefix + "&".repeat(65536 - Buffer.byteLength(prefix));
    const req = (value: string) =>
      new Request(url, {
        method: "POST",
        body: value,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    expect((await readJdClauseOrderHttpForm(req(body))).action).toBe(
      "decision",
    );
    await expect(
      readJdClauseOrderHttpForm(req(body + "&")),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJdClauseOrderHttpForm(streaming(new ReadableStream({ start() {} })), {
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ status: 503, recovery: "retry_exact" });
    await expect(
      readJdClauseOrderHttpForm(
        streaming(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(65537));
            },
            cancel() {
              return new Promise<void>(() => undefined);
            },
          }),
        ),
        { timeoutMs: 10 },
      ),
    ).rejects.toMatchObject({ status: 413 });
    const abort = new AbortController();
    abort.abort();
    await expect(
      readJdClauseOrderHttpForm(
        streaming(new ReadableStream({ start() {} }), abort.signal),
      ),
    ).rejects.toMatchObject({ status: 503 });
  }, 500);
  it("executes the real repository with actual profile/readiness and the original four-argument Native command", async () => {
    const { client, calls } = decisionClient();
    expect(
      await executeJdClauseOrderHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        {
          action: "decision",
          command: f.command,
          reviewAcknowledgement: "accepted",
        },
      ),
    ).toEqual({ kind: "applied", receipt: f.receipt });
    expect(calls.map((c) => c.name)).toEqual([
      "read_requirement_relationship_context",
      "read_jd_clause_order_readiness",
      "apply_jd_clause_order_action",
    ]);
    expect(calls.at(-1)?.args).toEqual({
      p_user_id: f.owned.ownerId,
      p_analysis_id: f.owned.analysisId,
      p_command: f.command,
      p_request_id: f.command.idempotencyKey,
    });
  });
  it("fails denied readiness before writing without a legacy RPC fallback", async () => {
    const { client, calls } = decisionClient(f.receipt, false);
    await expect(
      executeJdClauseOrderHttp(client, f.owned.analysisId, f.owned.ownerId, {
        action: "decision",
        command: f.command,
        reviewAcknowledgement: "accepted",
      }),
    ).rejects.toBeInstanceOf(TypedAuthoringError);
    expect(calls.some((c) => c.name.startsWith("apply_"))).toBe(false);
  });
  it.each([
    { response: { status: "conflict" }, status: 409, recovery: "review_again" },
    { response: {}, status: 503, recovery: "retry_exact" },
    { response: null, status: 503, recovery: "retry_exact" },
  ])(
    "maps exact conflict versus unconfirmed writes $status/$recovery",
    async ({ response, status, recovery }) => {
      const { client, calls } = decisionClient(response);
      const error = await executeJdClauseOrderHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        {
          action: "decision",
          command: f.command,
          reviewAcknowledgement: "accepted",
        },
      ).catch((e: unknown) => e);
      const result = jdClauseOrderHttpErrorResponse(
        error,
        undefined,
        "decision",
      );
      expect(result.status).toBe(status);
      expect(await result.json()).toMatchObject({ recovery });
      expect(
        calls.filter((c) => c.name === "apply_jd_clause_order_action"),
      ).toHaveLength(1);
    },
  );
  it("keeps unknown transport errors private and retains exact retry guidance", async () => {
    const { client, calls } = decisionClient(null, true, {
      message: "PRIVATE_CANDIDATE_CANARY",
    });
    const error = await executeJdClauseOrderHttp(
      client,
      f.owned.analysisId,
      f.owned.ownerId,
      {
        action: "decision",
        command: f.command,
        reviewAcknowledgement: "accepted",
      },
    ).catch((e: unknown) => e);
    const result = jdClauseOrderHttpErrorResponse(error, undefined, "decision");
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("PRIVATE_CANDIDATE_CANARY");
    expect(
      calls.filter((c) => c.name === "apply_jd_clause_order_action"),
    ).toHaveLength(1);
  });
  it("accepts only an accepted2 receipt and a distinct canonical lowercase undo key", async () => {
    expect(
      (
        await readJdClauseOrderHttpForm(
          form({
            action: "undo",
            receipt: JSON.stringify(f.receipt),
            idempotencyKey: f.undoKey,
          }),
        )
      ).action,
    ).toBe("undo");
    for (const receipt of [
      { ...f.receipt, schemaVersion: "typed-authoring-receipt/1.0.0" },
      { ...f.receipt, action: "reject" },
    ])
      await expect(
        readJdClauseOrderHttpForm(
          form({
            action: "undo",
            receipt: JSON.stringify(receipt),
            idempotencyKey: f.undoKey,
          }),
        ),
      ).rejects.toMatchObject({ status: 422 });
    await expect(
      readJdClauseOrderHttpForm(
        form({
          action: "undo",
          receipt: JSON.stringify(f.receipt),
          idempotencyKey: f.receipt.idempotencyKey,
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("proves owned accepted2/event consistency and restores the original two-revision base through guarded undo", async () => {
    const { client, reads } = undoClient();
    const result = await executeJdClauseOrderHttp(
      client,
      f.owned.analysisId,
      f.owned.ownerId,
      {
        action: "undo",
        receipt: { ...f.receipt, idempotent: true },
        idempotencyKey: f.undoKey,
      },
    );
    expect(result).toEqual({
      kind: "undone",
      receipt: {
        schemaVersion: "jd-clause-order-undo-receipt/2.0.0",
        status: "applied",
        action: "undo",
        idempotencyKey: f.undoKey,
        acceptedEventId: f.receipt.eventId,
        acceptedCommandSha256: f.receipt.commandSha256,
        acceptedVersionId: f.receipt.versionId,
        baseVersionId: f.receipt.baseVersionId,
        versionId: f.rawUndo.versionId,
        revision: f.rawUndo.revision,
        eventId: f.rawUndo.eventId,
        idempotent: false,
      },
    });
    expect(mocks.undo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        from: expect.any(Function),
        rpc: expect.any(Function),
      }),
      f.owned.analysisId,
      f.owned.ownerId,
      {
        action: "undo",
        expectedVersionId: f.receipt.versionId,
        idempotencyKey: f.undoKey,
      },
      f.undoKey,
    );
    expect(reads).toEqual([
      {
        filters: {
          id: f.receipt.eventId,
          analysis_id: f.owned.analysisId,
          owner_id: f.owned.ownerId,
        },
      },
      {
        filters: {
          id: f.rawUndo.eventId,
          analysis_id: f.owned.analysisId,
          owner_id: f.owned.ownerId,
          idempotency_key: f.undoKey,
        },
      },
    ]);
    expect(f.undoEvent.command.targetVersionId).toBe(
      f.command.binding.canonical.versionId,
    );
    expect(f.undoEvent.command.targetVersionId).not.toBe(
      f.document.parentVersionId,
    );
  });
  it.each([
    "owner_id",
    "organization_id",
    "resume_id",
    "analysis_id",
    "base_version_id",
    "result_version_id",
    "idempotency_key",
    "retention_policy_id",
  ])("refuses accepted event mismatch %s before undo", async (key) => {
    const { client } = undoClient({ ...f.event, [key]: id(99) });
    await expect(
      executeJdClauseOrderHttp(client, f.owned.analysisId, f.owned.ownerId, {
        action: "undo",
        receipt: f.receipt,
        idempotencyKey: f.undoKey,
      }),
    ).rejects.toBeInstanceOf(JdClauseOrderHttpError);
    expect(mocks.undo).not.toHaveBeenCalled();
  });
  it("refuses a changed original command, stored receipt and foreign accepted source before dispatch", () => {
    for (const event of [
      { ...f.event, command: { ...f.command, afterSha256: "a".repeat(64) } },
      { ...f.event, result: { ...f.receipt, idempotent: true } },
    ])
      expect(() =>
        validateJdClauseOrderUndoEvent(
          event,
          f.receipt,
          f.owned.analysisId,
          f.owned.ownerId,
          {
            document: f.document,
            revision: f.receipt.revision,
            sourceId: f.owned.sourceId,
          },
        ),
      ).toThrow(JdClauseOrderHttpError);
    expect(() =>
      validateJdClauseOrderUndoEvent(
        f.event,
        f.receipt,
        f.owned.analysisId,
        f.owned.ownerId,
        {
          document: f.document,
          revision: f.receipt.revision,
          sourceId: id(99),
        },
      ),
    ).toThrow(JdClauseOrderHttpError);
  });
  it.each([
    "command",
    "result",
    "owner_id",
    "base_version_id",
    "result_version_id",
    "idempotency_key",
  ])(
    "refuses post-RPC undo event mismatch %s as unknown, with no second undo",
    async (key) => {
      const { client } = undoClient(f.event, {
        ...f.undoEvent,
        [key]:
          key === "command"
            ? {
                ...f.undoEvent.command,
                targetVersionId: f.document.parentVersionId,
              }
            : key === "result"
              ? { ...f.rawUndo, extra: true }
              : id(99),
      });
      const error = await executeJdClauseOrderHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        { action: "undo", receipt: f.receipt, idempotencyKey: f.undoKey },
      ).catch((e: unknown) => e);
      expect(error).toMatchObject({
        status: 503,
        reason: "invalid_result",
        recovery: "retry_exact",
      });
      expect(mocks.undo).toHaveBeenCalledTimes(1);
    },
  );
  it("preserves exact-key replay while never exposing the internal receipt1", () => {
    const result = validateJdClauseOrderUndoResult(
      { ...f.rawUndo, idempotent: true },
      f.undoEvent,
      f.receipt,
      f.undoKey,
      f.event,
    );
    expect(result.idempotent).toBe(true);
    expect(result.schemaVersion).toBe("jd-clause-order-undo-receipt/2.0.0");
    expect(result.idempotencyKey).toBe(f.undoKey);
  });
  it("maps stale guarded undo to review_again and unknown undo to retry_exact", async () => {
    const { client } = undoClient();
    for (const [error, status, recovery] of [
      [new CanonicalError(409, "synthetic stale"), 409, "review_again"],
      [new CanonicalError(503, "synthetic unknown"), 503, "retry_exact"],
    ] as const) {
      mocks.undo.mockRejectedValueOnce(error);
      const failure = await executeJdClauseOrderHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        { action: "undo", receipt: f.receipt, idempotencyKey: f.undoKey },
      ).catch((e: unknown) => e);
      const response = jdClauseOrderHttpErrorResponse(
        failure,
        undefined,
        "undo",
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ recovery });
    }
  });
  it("bounds a stalled owned undo read and forbids late read/write continuations", async () => {
    vi.useFakeTimers();
    try {
      let release!: (value: unknown) => void;
      mocks.load.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const { client, reads } = undoClient();
      const work = executeJdClauseOrderHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        { action: "undo", receipt: f.receipt, idempotencyKey: f.undoKey },
      );
      const rejection = expect(work).rejects.toMatchObject({
        status: 503,
        recovery: "retry_exact",
      });
      await vi.advanceTimersByTimeAsync(5000);
      await rejection;
      release({
        current: {
          document: f.document,
          revision: f.receipt.revision,
          sourceId: f.owned.sourceId,
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(reads).toHaveLength(0);
      expect(mocks.undo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("propagates undo SDK cancellation and keeps uncertain commit as exact retry without late publication", async () => {
    vi.useFakeTimers();
    try {
      const { client, reads } = undoClient();
      let sdkSignal: AbortSignal | undefined,
        release!: (value: { data: unknown; error: null }) => void;
      const pending = Object.assign(
        new Promise<{ data: unknown; error: null }>((resolve) => {
          release = resolve;
        }),
        {
          abortSignal: (signal: AbortSignal) => {
            sdkSignal = signal;
            return pending;
          },
        },
      );
      const rpc = vi.fn(() => pending);
      const sdk = { ...client, rpc } as unknown as Parameters<
        typeof executeJdClauseOrderHttp
      >[0];
      mocks.undo.mockImplementationOnce(
        async (scoped: Parameters<typeof executeJdClauseOrderHttp>[0]) => {
          const response = await scoped.rpc("apply_authoring_action", {});
          return response.data;
        },
      );
      const controller = new AbortController();
      const work = executeJdClauseOrderHttp(
        sdk,
        f.owned.analysisId,
        f.owned.ownerId,
        { action: "undo", receipt: f.receipt, idempotencyKey: f.undoKey },
        { signal: controller.signal },
      );
      const rejection = expect(work).rejects.toMatchObject({
        status: 503,
        recovery: "retry_exact",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(sdkSignal?.aborted).toBe(false);
      controller.abort();
      await rejection;
      expect(sdkSignal?.aborted).toBe(true);
      release({ data: f.rawUndo, error: null });
      await vi.advanceTimersByTimeAsync(0);
      expect(reads).toHaveLength(1);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(mocks.undo).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
