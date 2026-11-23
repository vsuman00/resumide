import { describe, expect, it } from "vitest";
import { TYPED_AUTHORING_READINESS_PROFILE } from "../../app/lib/server/typed-authoring-readiness-profile";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { CanonicalError } from "../../app/lib/server/canonical-repository";
import {
  createRequirementContextFixture,
  requirementFixtureId as id,
} from "../fixtures/requirement-context";
import {
  buildTypedAuthoringPatch,
  createTypedAuthoringCommand,
  typedAuthoringCommandSha256,
} from "../../app/lib/server/typed-authoring-contract";
import {
  readTypedAuthoringHttpForm,
  executeTypedAuthoringHttp,
  validateTypedUndoEvent,
  typedAuthoringHttpErrorResponse,
  TypedAuthoringHttpError,
} from "../../app/lib/server/typed-authoring-http";
const url = "https://example.test/analysis/id/author/typed";
function streaming(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    duplex: "half",
    signal,
  };
  return new Request(url, init);
}
function form(values: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    body: new URLSearchParams(values),
  });
}
async function actual() {
  const f = await createRequirementContextFixture({ confirm: true });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const patch = buildTypedAuthoringPatch(f.context, selection, "Created"),
    command = createTypedAuthoringCommand(patch, "accept", id(80), true);
  return { ...f, selection, patch, command };
}
describe("bounded typed authoring HTTP", () => {
  it("bounds a stalled native body read", async () => {
    const request = streaming(new ReadableStream<Uint8Array>({ start() {} }));
    const pending = readTypedAuthoringHttpForm(request, { timeoutMs: 10 });
    await expect(pending).rejects.toMatchObject({
      status: 503,
      reason: "unavailable",
    });
    const error = await pending.catch((failure: unknown) => failure);
    expect(await typedAuthoringHttpErrorResponse(error).json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
  }, 500);
  it("does not await a hostile cancellation after body overflow", async () => {
    const request = streaming(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(65537));
        },
        cancel() {
          return new Promise<void>(() => undefined);
        },
      }),
    );
    await expect(
      readTypedAuthoringHttpForm(request, { timeoutMs: 10 }),
    ).rejects.toMatchObject({ status: 413 });
  }, 500);
  it("accepts the exact 64KiB native form boundary and refuses its successor", async () => {
    const f = await actual();
    const prefix = new URLSearchParams({
      action: "preview",
      selection: JSON.stringify(f.selection),
    }).toString();
    const body = prefix + "+".repeat(65536 - Buffer.byteLength(prefix));
    const request = (value: string) =>
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: value,
      });
    expect((await readTypedAuthoringHttpForm(request(body))).action).toBe(
      "preview",
    );
    await expect(
      readTypedAuthoringHttpForm(request(body + "+")),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("requires exact accept acknowledgement and omits it for rejection", async () => {
    const f = await actual();
    await expect(
      readTypedAuthoringHttpForm(
        form({ action: "decision", command: JSON.stringify(f.command) }),
      ),
    ).rejects.toBeInstanceOf(TypedAuthoringHttpError);
    expect(
      (
        await readTypedAuthoringHttpForm(
          form({
            action: "decision",
            command: JSON.stringify(f.command),
            reviewAcknowledgement: "accepted",
          }),
        )
      ).action,
    ).toBe("decision");
    const reject = createTypedAuthoringCommand(
      f.patch,
      "reject",
      id(81),
      false,
    );
    await expect(
      readTypedAuthoringHttpForm(
        form({
          action: "decision",
          command: JSON.stringify(reject),
          reviewAcknowledgement: "accepted",
        }),
      ),
    ).rejects.toBeInstanceOf(TypedAuthoringHttpError);
  });
  it("rejects duplicate decoded form and JSON keys without raw echo", async () => {
    const f = await actual();
    const duplicate = new URLSearchParams({
      action: "preview",
      selection: JSON.stringify(f.selection),
    });
    duplicate.append("action", "preview");
    await expect(
      readTypedAuthoringHttpForm(
        new Request(url, { method: "POST", body: duplicate }),
      ),
    ).rejects.toBeInstanceOf(TypedAuthoringHttpError);
    const json = JSON.stringify(f.selection).replace(
      '"targetFactId":',
      `"targetFactId":"${id(99)}","targetFactId":`,
    );
    await expect(
      readTypedAuthoringHttpForm(form({ action: "preview", selection: json })),
    ).rejects.toBeInstanceOf(TypedAuthoringHttpError);
    const response = typedAuthoringHttpErrorResponse(
      new Error("PRIVATE_BODY_CANARY"),
    );
    expect(await response.text()).not.toContain("PRIVATE_BODY_CANARY");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("supports native multipart text forms and refuses file fields", async () => {
    const f = await actual(),
      body = new FormData();
    body.set("action", "preview");
    body.set("selection", JSON.stringify(f.selection));
    expect(
      (
        await readTypedAuthoringHttpForm(
          new Request(url, { method: "POST", body }),
        )
      ).action,
    ).toBe("preview");
    body.set("selection", new Blob(["synthetic"]), "payload.txt");
    await expect(
      readTypedAuthoringHttpForm(new Request(url, { method: "POST", body })),
    ).rejects.toBeInstanceOf(TypedAuthoringHttpError);
  });
  it("publishes an actual local-rule proposal through two owned reads", async () => {
    const f = await actual(),
      calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        return { data: structuredClone(f.context), error: null };
      },
    } as unknown as Parameters<typeof executeTypedAuthoringHttp>[0];
    const result = await executeTypedAuthoringHttp(
      client,
      f.owned.analysisId,
      f.owned.ownerId,
      { action: "preview", selection: f.selection },
    );
    if (result.kind !== "proposal") throw Error("EXPECTED_PROPOSAL");
    expect(result.proposal.patch.after).toBe(
      "Created services using PostgreSQL",
    );
    expect(calls).toEqual([
      "read_requirement_relationship_context",
      "read_requirement_relationship_context",
    ]);
  });
  it("uses the real four-argument atomic seam and preserves unavailable writes", async () => {
    const f = await actual(),
      calls: { name: string; args: unknown }[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return name === "read_requirement_relationship_context"
          ? { data: structuredClone(f.context), error: null }
          : name === "read_typed_authoring_readiness"
            ? {
                data: {
                  ...TYPED_AUTHORING_READINESS_PROFILE,
                  schemaReady: true,
                  writerExecutable: true,
                },
                error: null,
              }
            : {
                data: null,
                error: { code: "42501", message: "PRIVATE_NATIVE_ERROR" },
              };
      },
    } as unknown as Parameters<typeof executeTypedAuthoringHttp>[0];
    let failure: unknown;
    try {
      await executeTypedAuthoringHttp(
        client,
        f.owned.analysisId,
        f.owned.ownerId,
        {
          action: "decision",
          command: f.command,
          reviewAcknowledgement: "accepted",
        },
      );
    } catch (error) {
      failure = error;
    }
    const response = typedAuthoringHttpErrorResponse(
      failure,
      undefined,
      "decision",
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      kind: "error",
      reason: "unavailable",
      recovery: "retry_exact",
    });
    expect(calls.at(-1)).toEqual({
      name: "apply_typed_authoring_action",
      args: {
        p_user_id: f.owned.ownerId,
        p_analysis_id: f.owned.analysisId,
        p_command: f.command,
        p_request_id: f.command.idempotencyKey,
      },
    });
    expect(calls.map((call) => call.name)).toEqual([
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
      "apply_typed_authoring_action",
    ]);
  });
  it("validates actual recorded accept receipts and normalizes only idempotent", async () => {
    const f = await actual();
    let document = reviseCanonical(f.context.canonical.content, {
      operation: "edit",
      factId: f.targetFactId,
      value: f.patch.after,
    });
    document = reviseCanonical(document, {
      operation: "confirm",
      factId: f.targetFactId,
    });
    const receipt = {
      schemaVersion: "typed-authoring-receipt/1.0.0" as const,
      status: "applied" as const,
      action: "accept" as const,
      idempotencyKey: f.command.idempotencyKey,
      commandSha256: typedAuthoringCommandSha256(f.command),
      baseVersionId: f.context.canonical.versionId,
      baseRevision: f.context.canonical.revision,
      requirementVersionId: f.context.requirements.versionId,
      requirementRevision: f.context.requirements.revision,
      versionId: document.versionId,
      revision: f.context.canonical.revision + 2,
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
      action: "accept",
      command: f.command,
      result: receipt,
      retention_policy_id: document.retentionPolicyId,
    };
    const accepted = {
      document,
      revision: receipt.revision,
      sourceId: f.owned.sourceId,
    };
    expect(
      validateTypedUndoEvent(
        event,
        { ...receipt, idempotent: true },
        f.owned.analysisId,
        f.owned.ownerId,
        accepted,
      ).command,
    ).toEqual(f.command);
    expect(() =>
      validateTypedUndoEvent(
        event,
        { ...receipt, versionId: id(83) },
        f.owned.analysisId,
        f.owned.ownerId,
        accepted,
      ),
    ).toThrow(TypedAuthoringHttpError);
    expect(() =>
      validateTypedUndoEvent(
        { ...event, base_version_id: id(84) },
        receipt,
        f.owned.analysisId,
        f.owned.ownerId,
        accepted,
      ),
    ).toThrow(TypedAuthoringHttpError);
  });
  it("maps canonical concurrency and privacy errors to fixed safe envelopes", async () => {
    for (const status of [404, 409, 422, 503] as const) {
      const response = typedAuthoringHttpErrorResponse(
        new CanonicalError(status, "PRIVATE_CANONICAL_MESSAGE"),
        undefined,
        "undo",
      );
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("PRIVATE_CANONICAL_MESSAGE");
      if (status === 409)
        expect(body).toEqual({
          kind: "error",
          reason: "stale_inputs",
          recovery: "review_again",
        });
    }
  });
});
