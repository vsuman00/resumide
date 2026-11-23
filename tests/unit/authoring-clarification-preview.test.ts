import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
import { clarifyValue } from "../../app/lib/server/authoring-contract";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  loadCanonical: mocks.load,
}));
import {
  applyAuthoring,
  previewClarification,
} from "../../app/lib/server/authoring-repository";
import { CanonicalError } from "../../app/lib/server/canonical-repository";

function fixture() {
  const input = scoreFixture();
  const document = input.canonical;
  const fact = document.facts.find((value) => value.type === "contribution")!;
  const command = {
    action: "clarify" as const,
    expectedVersionId: document.versionId,
    idempotencyKey: randomUUID(),
    targetFactId: fact.id,
    questionKind: "result" as const,
    value: "Reduced synthetic processing time",
    confirmation: true as const,
  };
  const model = {
    analysisId: document.analysisId,
    headId: document.versionId,
    current: { document, revision: 1, sourceId: input.evidence.sourceId },
  };
  mocks.load.mockResolvedValue(model);
  let prior: unknown = null;
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: prior, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  const rpc = vi.fn(async (_name: string, args: unknown) => {
    const body = args as { p_confirmation_body: { versionId: string } };
    return {
      error: null,
      data: {
        status: "applied",
        versionId: body.p_confirmation_body.versionId,
        revision: 3,
        eventId: randomUUID(),
        action: "clarify",
        idempotent: false,
      },
    };
  });
  const client = { from, rpc } as unknown as Parameters<
    typeof applyAuthoring
  >[0];
  const reviewedValue = clarifyValue(
    fact.value,
    command.questionKind,
    command.value,
  );
  return {
    document,
    fact,
    command,
    model,
    from,
    rpc,
    client,
    reviewedValue,
    hash: createHash("sha256").update(reviewedValue, "utf8").digest("hex"),
    previewInput: {
      action: "preview_clarification" as const,
      expectedVersionId: command.expectedVersionId,
      idempotencyKey: command.idempotencyKey,
      targetFactId: command.targetFactId,
      questionKind: command.questionKind,
      value: command.value,
    },
    setPrior: (value: unknown) => {
      prior = value;
    },
  };
}
beforeEach(() => vi.clearAllMocks());

it("requires full-value proof before a new clarification can be persisted", async () => {
  const f = fixture();
  await expect(
    applyAuthoring(
      f.client,
      f.document.analysisId,
      f.document.ownerId,
      f.command,
      "u03-answer-only",
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect(f.rpc).not.toHaveBeenCalled();
});

function priorReceipt(f: ReturnType<typeof fixture>) {
  const result = {
    status: "applied",
    versionId: randomUUID(),
    revision: 3,
    eventId: randomUUID(),
    action: "clarify",
    idempotent: false,
  };
  f.setPrior({
    command: {
      action: "clarify",
      expectedVersionId: f.command.expectedVersionId,
      idempotencyKey: f.command.idempotencyKey,
      targetFactId: f.command.targetFactId,
      sectionId: null,
      value: f.command.value,
      questionKind: f.command.questionKind,
      pattern: null,
      targetVersionId: null,
      confirmation: true,
      patch: null,
    },
    result,
  });
  return result;
}

it("previews the complete derived value and exact UTF8 digest without mutation or consent", async () => {
  const f = fixture();
  const original = structuredClone(f.document);
  const preview = await previewClarification(
    f.client,
    f.document.analysisId,
    f.document.ownerId,
    f.previewInput,
  );
  expect(preview).toEqual({
    schemaVersion: "clarification-preview/1.0.0",
    command: { ...f.previewInput, action: "clarify" },
    beforeValue: f.fact.value,
    reviewedValue: f.reviewedValue,
    reviewedValueHash: f.hash,
  });
  expect(preview.reviewedValue).toContain(f.fact.value.split("\n")[0]);
  expect(preview.reviewedValue).toContain(`Result: ${f.command.value}`);
  expect(preview.command).not.toHaveProperty("confirmation");
  expect(f.rpc).not.toHaveBeenCalled();
  expect(f.document).toEqual(original);
  expect(mocks.load).toHaveBeenCalledWith(
    f.client,
    f.document.analysisId,
    f.document.ownerId,
    { versionId: f.command.expectedVersionId },
  );
});

it("requires the current owned version for a new preview", async () => {
  const f = fixture();
  f.model.headId = randomUUID();
  await expect(
    previewClarification(
      f.client,
      f.document.analysisId,
      f.document.ownerId,
      f.previewInput,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.rpc).not.toHaveBeenCalled();
});

it.each(["missing", "non_contribution"])(
  "rejects a %s preview target",
  async (kind) => {
    const f = fixture();
    const targetFactId =
      kind === "missing"
        ? randomUUID()
        : f.document.facts.find((fact) => fact.type !== "contribution")!.id;
    await expect(
      previewClarification(
        f.client,
        f.document.analysisId,
        f.document.ownerId,
        { ...f.previewInput, targetFactId },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.rpc).not.toHaveBeenCalled();
  },
);

it.each([" leading space", "line\nbreak"])(
  "rejects an invalid clarification answer %j before preview",
  async (value) => {
    const f = fixture();
    await expect(
      previewClarification(
        f.client,
        f.document.analysisId,
        f.document.ownerId,
        { ...f.previewInput, value },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.rpc).not.toHaveBeenCalled();
  },
);

it("does not let preview input fabricate confirmation or owner authority", async () => {
  const f = fixture();
  await expect(
    previewClarification(f.client, f.document.analysisId, f.document.ownerId, {
      ...f.previewInput,
      confirmation: true,
      ownerId: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 422 });
  expect(f.rpc).not.toHaveBeenCalled();
});

it("only confirms the exact reviewed full value and keeps review metadata outside the SQL wire", async () => {
  const f = fixture();
  const original = structuredClone(f.document);
  await applyAuthoring(
    f.client,
    f.document.analysisId,
    f.document.ownerId,
    f.command,
    "u03-reviewed",
    f.hash,
  );
  expect(f.rpc).toHaveBeenCalledOnce();
  const [name, raw] = f.rpc.mock.calls[0];
  const args = raw as {
    p_command: Record<string, unknown>;
    p_body: typeof f.document;
    p_confirmation_body: typeof f.document;
  };
  expect(name).toBe("apply_authoring_action");
  expect(args.p_command).toMatchObject({
    action: "clarify",
    expectedVersionId: f.command.expectedVersionId,
    idempotencyKey: f.command.idempotencyKey,
    targetFactId: f.fact.id,
    value: f.command.value,
    questionKind: f.command.questionKind,
    confirmation: true,
  });
  expect(args.p_command).not.toHaveProperty("reviewedValueHash");
  expect(args.p_command).not.toHaveProperty("reviewedValue");
  expect(args.p_body.facts.find((fact) => fact.id === f.fact.id)).toMatchObject(
    {
      value: f.reviewedValue,
      state: "unconfirmed",
      sources: [],
      confirmation: null,
    },
  );
  const confirmed = args.p_confirmation_body.facts.find(
    (fact) => fact.id === f.fact.id,
  )!;
  expect(confirmed).toMatchObject({
    value: f.reviewedValue,
    state: "candidate_confirmed",
    sources: [],
    confirmation: { actorId: f.document.ownerId, value: f.reviewedValue },
  });
  expect(confirmed.confirmation!.confirmedAt).toBe(
    args.p_confirmation_body.createdAt,
  );
  expect(args.p_confirmation_body.parentVersionId).toBe(args.p_body.versionId);
  expect(args.p_body.parentVersionId).toBe(f.document.versionId);
  expect(f.document).toEqual(original);
});

it.each([false, true])(
  "rejects a supplied mismatched review proof before returning any receipt (prior=%s)",
  async (hasPrior) => {
    const f = fixture();
    if (hasPrior) priorReceipt(f);
    await expect(
      applyAuthoring(
        f.client,
        f.document.analysisId,
        f.document.ownerId,
        f.command,
        "u03-mismatch",
        "0".repeat(64),
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.rpc).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "keeps an owned exact legacy receipt reachable after the head advances (proof=%s)",
  async (hasProof) => {
    const f = fixture();
    const prior = priorReceipt(f);
    const currentHead = randomUUID();
    f.model.headId = currentHead;
    expect(
      await applyAuthoring(
        f.client,
        f.document.analysisId,
        f.document.ownerId,
        f.command,
        "u03-replay",
        hasProof ? f.hash : undefined,
      ),
    ).toEqual({ ...prior, idempotent: true });
    expect(f.model.headId).toBe(currentHead);
    expect(f.rpc).not.toHaveBeenCalled();
  },
);

it("rejects changed answer reuse even when its recomputed review proof matches", async () => {
  const f = fixture();
  priorReceipt(f);
  const command = { ...f.command, value: "A different synthetic answer" };
  const hash = createHash("sha256")
    .update(
      clarifyValue(f.fact.value, command.questionKind, command.value),
      "utf8",
    )
    .digest("hex");
  await expect(
    applyAuthoring(
      f.client,
      f.document.analysisId,
      f.document.ownerId,
      command,
      "u03-key-reuse",
      hash,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.rpc).not.toHaveBeenCalled();
});

it("rejects a new reviewed clarification against a stale head", async () => {
  const f = fixture();
  f.model.headId = randomUUID();
  await expect(
    applyAuthoring(
      f.client,
      f.document.analysisId,
      f.document.ownerId,
      f.command,
      "u03-stale",
      f.hash,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.rpc).not.toHaveBeenCalled();
});

it("checks current owned source access before an old receipt", async () => {
  const f = fixture();
  priorReceipt(f);
  mocks.load.mockRejectedValue(
    new CanonicalError(404, "Structured resume not found."),
  );
  await expect(
    applyAuthoring(
      f.client,
      f.document.analysisId,
      f.document.ownerId,
      f.command,
      "u03-foreign",
      f.hash,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(f.from).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
