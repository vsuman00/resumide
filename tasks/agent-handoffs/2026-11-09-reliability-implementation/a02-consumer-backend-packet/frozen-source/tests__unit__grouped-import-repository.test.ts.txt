import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import * as content from "../../app/lib/server/canonical-content";
import { normalizeGroupedOriginalCommand } from "../../app/lib/server/grouped-import-commands";
import {
  commitGroupedOriginalImport,
  loadGroupedOriginalWorkspace,
  previewGroupedOriginalImport,
  readGroupedOriginalForm,
  GroupedOriginalError,
  type GroupedOriginalPreviewRequest,
} from "../../app/lib/server/grouped-import-repository";

const flags = vi.hoisted(() => ({
  CANONICAL_CORRECTIONS_ENABLED: true,
  CANONICAL_AUTHORING_ENABLED: true,
  EVIDENCE_REVIEW_ENABLED: true,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => flags,
}));
const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-11-13T00:00:00.000Z",
  retentionPolicyId: "synthetic/1.0.0",
};
const owned = {
  ownerId: context.ownerId,
  analysisId: context.analysisId,
  sourceId: context.sourceId,
  inputSha256: context.inputSha256,
  attemptId: context.id,
  resumeId: "10000000-0000-4000-8000-000000000005",
  organizationId: "10000000-0000-4000-8000-000000000006",
};
const next = "20000000-0000-4000-8000-000000000001";
const batch = "30000000-0000-4000-8000-000000000001";
function fixture() {
  const envelope = reconcileDocumentEvidence(
    context,
    buildNativeEvidence([
      "Experience\nEmployer: Synthetic North Labs\nRole: Engineer\nDates: 2020 - 2022\nEmployer: Synthetic South Labs\nRole: Analyst\nDates: 2021 - 2023",
    ]),
  );
  return {
    schemaVersion: "grouped-original-read/1.0.0",
    status: "available",
    compatibilityReady: true,
    canCommit: false,
    freshImportAllowed: true,
    scoringEligible: false,
    source: { ...owned },
    captured: {
      reviewRevision: 0,
      reviewHeadId: null as string | null,
      assignmentRevision: 0,
      assignmentHeadId: null as string | null,
      associationRevision: 0,
      associationHeadId: null as string | null,
      canonicalHeadId: null as string | null,
    },
    attempt: { id: context.id, attemptNumber: 1, envelope },
  };
}
// Only the mocked transport is adapted to Supabase's fluent RPC interface.
function rpcClient<T>(
  value: T,
): T & Parameters<typeof loadGroupedOriginalWorkspace>[0] {
  return value as T & Parameters<typeof loadGroupedOriginalWorkspace>[0];
}
function client(row = fixture()) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    void name;
    void args;
    return { data: row as unknown, error: null };
  });
  return rpcClient({ rpc });
}
async function preview(row = fixture()) {
  const c = client(row);
  const workspace = await loadGroupedOriginalWorkspace(
    c,
    context.analysisId,
    context.ownerId,
  );
  if (workspace.state !== "available")
    throw Error("FIXTURE_WORKSPACE_UNAVAILABLE");
  const request: GroupedOriginalPreviewRequest = {
    schemaVersion: "grouped-original-command/1.0.0",
    operation: "approve_and_import_grouped_original",
    binding: workspace.binding,
    expected: { ...workspace.captured, canonicalHeadId: null },
    selectedGroupIds: workspace.groups.slice(0, 32).map((g) => g.id),
    unselectedDisposition: "retain_original",
  };
  return {
    c,
    workspace,
    request,
    result: await previewGroupedOriginalImport(
      c,
      context.analysisId,
      context.ownerId,
      request,
    ),
  };
}
function applied(versionId: string, idempotent = false) {
  return {
    schemaVersion: "grouped-original-result/1.0.0",
    status: "applied",
    versionId,
    revision: 1,
    batchId: batch,
    associationRevision: 1,
    associationHeadId: batch,
    idempotent,
    scoringEligible: false,
  };
}
function form(command: unknown, ack?: string) {
  const body = new URLSearchParams({ command: JSON.stringify(command) });
  if (ack !== undefined) body.set("relationshipAcknowledgement", ack);
  return new Request(
    "http://fixture.test/analysis/x/canonical?grouped=commit",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
}
async function error(
  promise: Promise<unknown>,
  reason: string,
  status: number,
  recovery?: string,
) {
  await expect(promise).rejects.toMatchObject({
    name: "Error",
    reason,
    status,
    ...(recovery ? { recovery } : {}),
  });
}
beforeEach(() => {
  Object.assign(flags, {
    CANONICAL_CORRECTIONS_ENABLED: true,
    CANONICAL_AUTHORING_ENABLED: true,
    EVIDENCE_REVIEW_ENABLED: true,
  });
});

describe("one owned grouped source snapshot", () => {
  it("derives both real two-job groups and bounded source citations without raw envelopes", async () => {
    const row = fixture(),
      c = client(row);
    const w = await loadGroupedOriginalWorkspace(
      c,
      context.analysisId,
      context.ownerId,
    );
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith(
      "read_grouped_original_workspace",
      { p_user_id: context.ownerId, p_analysis_id: context.analysisId },
    );
    expect(w.state).toBe("available");
    if (w.state !== "available") return;
    expect(w.groups).toHaveLength(2);
    expect(w.groups.flatMap((g) => g.members)).toHaveLength(6);
    expect(w).toMatchObject({
      compatibilityReady: true,
      canCommit: false,
      canPreview: true,
      captured: row.captured,
      source: owned,
    });
    expect(w.groups[0].members[0]).toMatchObject({
      value: "Synthetic North Labs",
      citations: [
        {
          attemptId: context.id,
          href: `/analysis/${context.analysisId}/evidence#source-native-page-1-line-2`,
        },
      ],
    });
    expect(JSON.stringify(w)).not.toMatch(
      /nativeSource|retentionPolicyId|semanticAtoms|normalForm/,
    );
    expect(
      row.attempt.envelope.assertions.every(
        (a) => a.state === "review_required",
      ),
    ).toBe(true);
  });
  it.each(Object.keys(flags) as (keyof typeof flags)[])(
    "denies disabled flag %s before RPC",
    async (key) => {
      flags[key] = false;
      const c = client();
      expect(
        await loadGroupedOriginalWorkspace(
          c,
          context.analysisId,
          context.ownerId,
        ),
      ).toMatchObject({ state: "unavailable", reason: "disabled" });
      expect(c.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(["not_found", "unavailable"])(
    "keeps safe %s status",
    async (status) => {
      const c = client();
      c.rpc.mockResolvedValue({
        data: {
          schemaVersion: "grouped-original-read/1.0.0",
          status,
          scoringEligible: false,
        },
        error: null,
      });
      expect(
        await loadGroupedOriginalWorkspace(
          c,
          context.analysisId,
          context.ownerId,
        ),
      ).toMatchObject({ state: "unavailable", reason: status });
    },
  );
  it.each([
    (r: ReturnType<typeof fixture>) => {
      r.source.ownerId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.analysisId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.attemptId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.sourceId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.inputSha256 = "b".repeat(64);
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.organizationId = "INVALID";
    },
    (r: ReturnType<typeof fixture>) => {
      r.source.resumeId = "INVALID";
    },
    (r: ReturnType<typeof fixture>) => {
      r.attempt.attemptNumber = 0;
    },
    (r: ReturnType<typeof fixture>) => {
      r.compatibilityReady = false;
      r.canCommit = true;
    },
    (r: ReturnType<typeof fixture>) => {
      r.captured.canonicalHeadId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.captured.reviewRevision = 1;
    },
    (r: ReturnType<typeof fixture>) => {
      r.captured.assignmentHeadId = next;
    },
    (r: ReturnType<typeof fixture>) => {
      r.captured.associationRevision = 1;
    },
    (r: ReturnType<typeof fixture>) => {
      r.attempt.envelope.assertions[0].value = "forged";
    },
  ])("fails closed on malformed or mismatched snapshot %#", async (mutate) => {
    const r = fixture();
    mutate(r);
    expect(
      await loadGroupedOriginalWorkspace(
        client(r),
        context.analysisId,
        context.ownerId,
      ),
    ).toMatchObject({ state: "unavailable", reason: "invalid_source" });
  });
  it("rejects extra RPC keys and malformed argument IDs", async () => {
    const c = client();
    c.rpc.mockResolvedValue({
      data: { ...fixture(), unexpected: true },
      error: null,
    });
    expect(
      await loadGroupedOriginalWorkspace(
        c,
        context.analysisId,
        context.ownerId,
      ),
    ).toMatchObject({ reason: "invalid_source" });
    const no = client();
    await error(
      previewGroupedOriginalImport(no, "foreign", context.ownerId, {}),
      "invalid_command",
      422,
    );
    expect(no.rpc).not.toHaveBeenCalled();
  });
  it("preserves all groups beyond the selected32 work bound", async () => {
    const r = fixture();
    r.attempt.envelope = reconcileDocumentEvidence(
      context,
      buildNativeEvidence([
        "Experience\n" +
          Array.from(
            { length: 40 },
            (_, i) => `Employer: Synthetic Lab ${i}\nRole: Engineer ${i}`,
          ).join("\n"),
      ]),
    );
    const w = await loadGroupedOriginalWorkspace(
      client(r),
      context.analysisId,
      context.ownerId,
    );
    expect(w.state).toBe("available");
    if (w.state === "available") expect(w.groups).toHaveLength(40);
  });
});
describe("preview and exact retained commit", () => {
  it("prepares actual source semantics with one new key and explicit output locale", async () => {
    const f = await preview();
    const p = await previewGroupedOriginalImport(
      f.c,
      context.analysisId,
      context.ownerId,
      {
        ...f.request,
        binding: { ...f.request.binding, effectiveLocale: "en-US" },
      },
    );
    expect(p).toMatchObject({
      state: "preview",
      canCommit: false,
      scoringEligible: false,
      command: { acknowledgement: true, binding: { effectiveLocale: "en-US" } },
    });
    expect(p.command.idempotencyKey).not.toBe(f.result.command.idempotencyKey);
    expect(p.command.previewHash).not.toBe(f.result.command.previewHash);
    expect(
      normalizeGroupedOriginalCommand(
        fixture().attempt.envelope,
        owned,
        p.command,
      ).state,
    ).toBe("prepared");
  });
  it("denies stale captures and pending original admission only for fresh preview", async () => {
    const f = await preview();
    const r = fixture();
    r.captured.reviewRevision = 1;
    r.captured.reviewHeadId = next;
    await error(
      previewGroupedOriginalImport(
        client(r),
        context.analysisId,
        context.ownerId,
        f.request,
      ),
      "stale_preview",
      409,
    );
    r.captured.reviewRevision = 0;
    r.captured.reviewHeadId = null;
    r.freshImportAllowed = false;
    await error(
      previewGroupedOriginalImport(
        client(r),
        context.analysisId,
        context.ownerId,
        f.request,
      ),
      "stale_preview",
      409,
    );
  });
  it("denies foreign binding, nonexistent selection and changed preview hash", async () => {
    const f = await preview();
    await error(
      previewGroupedOriginalImport(f.c, context.analysisId, context.ownerId, {
        ...f.request,
        binding: { ...f.request.binding, resumeId: next },
      }),
      "invalid_command",
      422,
    );
    await error(
      previewGroupedOriginalImport(f.c, context.analysisId, context.ownerId, {
        ...f.request,
        selectedGroupIds: ["entry-association-" + "0".repeat(64)],
      }),
      "invalid_command",
      422,
    );
    await error(
      commitGroupedOriginalImport(
        f.c,
        context.analysisId,
        context.ownerId,
        { ...f.result.command, previewHash: "b".repeat(64) },
        "request",
      ),
      "invalid_command",
      422,
    );
  });
  it("maps stale strict source identity to conflict without rebasing", async () => {
    const f = await preview();
    const changed = {
      ...f.result.command,
      binding: { ...f.result.command.binding, resumeId: next },
    };
    await error(
      commitGroupedOriginalImport(
        f.c,
        context.analysisId,
        context.ownerId,
        changed,
        "request",
      ),
      "conflict",
      409,
      "review_again",
    );
    expect(changed.binding.resumeId).toBe(next);
  });
  it("maps actual valid-source constructor limits to fixed error with one construction", async () => {
    const row = fixture();
    row.canCommit = true;
    row.attempt.envelope = reconcileDocumentEvidence(
      context,
      buildNativeEvidence([
        "Experience\n" +
          Array.from(
            { length: 60 },
            (_, i) => `Employer: Synthetic Lab ${i}\nRole: Engineer ${i}`,
          ).join("\n"),
      ]),
    );
    const f = await preview(row);
    const selected = {
      ...f.request,
      selectedGroupIds: [f.workspace.groups[0].id],
    };
    const p = await previewGroupedOriginalImport(
      f.c,
      context.analysisId,
      context.ownerId,
      selected,
    );
    const construct = vi.spyOn(content, "importCanonicalEvidence");
    await error(
      commitGroupedOriginalImport(
        f.c,
        context.analysisId,
        context.ownerId,
        p.command,
        "request",
      ),
      "invalid_source",
      422,
      "review_again",
    );
    expect(construct).toHaveBeenCalledTimes(1);
    expect(
      f.c.rpc.mock.calls.every(
        ([name]) => name === "read_grouped_original_workspace",
      ),
    ).toBe(true);
  });
  it("denied writer skips constructor and writer even on compatible preview", async () => {
    const f = await preview(),
      construct = vi.spyOn(content, "importCanonicalEvidence");
    await error(
      commitGroupedOriginalImport(
        f.c,
        context.analysisId,
        context.ownerId,
        f.result.command,
        "request",
      ),
      "unavailable",
      503,
      "unavailable",
    );
    expect(construct).not.toHaveBeenCalled();
    expect(
      f.c.rpc.mock.calls.every(
        ([name]) => name === "read_grouped_original_workspace",
      ),
    ).toBe(true);
  });
  it.each([false, true])(
    "calls actual legacy constructor once; exact original command survives moved head/prefix; replay=%s",
    async (replay) => {
      const f = await preview();
      const originalCommand = structuredClone(f.result.command);
      const row = fixture();
      row.canCommit = true;
      row.freshImportAllowed = false;
      row.captured.canonicalHeadId = next;
      row.captured.reviewRevision = 1;
      row.captured.reviewHeadId = next;
      row.captured.assignmentRevision = 1;
      row.captured.assignmentHeadId = next;
      row.captured.associationRevision = 1;
      row.captured.associationHeadId = batch;
      const construct = vi.spyOn(content, "importCanonicalEvidence");
      const rpc = vi.fn(
        async (name: string, args: Record<string, unknown>) => ({
          error: null,
          data:
            name === "read_grouped_original_workspace"
              ? row
              : applied(
                  replay
                    ? next
                    : (args.p_original as { versionId: string }).versionId,
                  replay,
                ),
        }),
      );
      const receipt = await commitGroupedOriginalImport(
        rpcClient({ rpc }),
        context.analysisId,
        context.ownerId,
        originalCommand,
        "request",
      );
      expect(receipt).toMatchObject({ idempotent: replay });
      expect(construct).toHaveBeenCalledTimes(1);
      expect(construct.mock.results[0].value.producerVersion).toBe(
        "canonical-engine/1.0.1",
      );
      expect(rpc).toHaveBeenCalledTimes(2);
      const sent = rpc.mock.calls[1][1];
      const expected = normalizeGroupedOriginalCommand(
        row.attempt.envelope,
        owned,
        originalCommand,
      );
      if (expected.state !== "prepared") throw Error("EXPECTED_NORMALIZED");
      expect(sent.p_command).toEqual({
        normalForm: expected.normalForm,
        previewHash: originalCommand.previewHash,
        idempotencyKey: originalCommand.idempotencyKey,
      });
      expect(originalCommand).toEqual(f.result.command);
      expect(Object.keys(sent).sort()).toEqual([
        "p_analysis_id",
        "p_command",
        "p_original",
        "p_request_id",
        "p_user_id",
      ]);
    },
  );
  it.each(["invalid", "not_found", "conflict", "unavailable"])(
    "maps fixed SQL refusal %s",
    async (status) => {
      const f = await preview(),
        r = fixture();
      r.canCommit = true;
      const c = client(r);
      c.rpc.mockImplementation(async (name) => ({
        error: null,
        data:
          name === "read_grouped_original_workspace"
            ? r
            : {
                schemaVersion: "grouped-original-result/1.0.0",
                status,
                scoringEligible: false,
              },
      }));
      await error(
        commitGroupedOriginalImport(
          c,
          context.analysisId,
          context.ownerId,
          f.result.command,
          "request",
        ),
        status === "invalid" ? "invalid_command" : status,
        status === "invalid"
          ? 422
          : status === "not_found"
            ? 404
            : status === "conflict"
              ? 409
              : 503,
      );
    },
  );
  it.each([
    { ...applied(next), extra: true },
    { ...applied(next), batchId: next },
    { ...applied(next), associationRevision: 2 },
    { ...applied(next), revision: 2 },
    { ...applied(next), scoringEligible: true },
    applied(next),
    {},
  ])(
    "keeps exact retry for ambiguous or invalid receipt %#",
    async (result) => {
      const f = await preview(),
        r = fixture();
      r.canCommit = true;
      const rpc = vi.fn(async (name: string) => ({
        error: null,
        data: name === "read_grouped_original_workspace" ? r : result,
      }));
      await error(
        commitGroupedOriginalImport(
          rpcClient({ rpc }),
          context.analysisId,
          context.ownerId,
          f.result.command,
          "request",
        ),
        "invalid_result",
        503,
        "retry_exact",
      );
      expect(rpc).toHaveBeenCalledTimes(2);
    },
  );
  it("keeps exact retry on network read and write failure without automatic retry", async () => {
    const f = await preview();
    const read = vi.fn().mockRejectedValue(new Error("secret"));
    await error(
      commitGroupedOriginalImport(
        rpcClient({ rpc: read }),
        context.analysisId,
        context.ownerId,
        f.result.command,
        "request",
      ),
      "unavailable",
      503,
      "retry_exact",
    );
    expect(read).toHaveBeenCalledTimes(1);
    const r = fixture();
    r.canCommit = true;
    const rpc = vi.fn(async (name: string) => {
      if (name !== "read_grouped_original_workspace") throw Error("secret");
      return { data: r, error: null };
    });
    await error(
      commitGroupedOriginalImport(
        rpcClient({ rpc }),
        context.analysisId,
        context.ownerId,
        f.result.command,
        "request",
      ),
      "unavailable",
      503,
      "retry_exact",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
describe("compact single-consumption forms", () => {
  it("reads preview and explicit named commit acknowledgement once", async () => {
    const f = await preview();
    const a = form(f.request);
    expect(await readGroupedOriginalForm(a, "preview")).toEqual(f.request);
    expect(a.bodyUsed).toBe(true);
    const b = form(f.result.command, "accepted");
    expect(await readGroupedOriginalForm(b, "commit")).toEqual(
      f.result.command,
    );
    expect(b.bodyUsed).toBe(true);
    await error(readGroupedOriginalForm(b, "commit"), "invalid_command", 422);
  });
  it.each([undefined, "true", "false", ""])(
    "hidden ack cannot replace named acceptance %s",
    async (ack) => {
      const f = await preview();
      await error(
        readGroupedOriginalForm(form(f.result.command, ack), "commit"),
        "invalid_command",
        422,
      );
    },
  );
  it.each([
    "command=x&command=y",
    "command=x&%63ommand=y",
    "command=x&unknown=y",
    "command=x&relationshipAcknowledgement=accepted&relationshipAcknowledgement=accepted",
    "command=%FF",
    "command=%ZZ",
  ])("rejects decoded duplicate/unknown/malformed form %s", async (body) => {
    await error(
      readGroupedOriginalForm(
        new Request("http://fixture.test", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        }),
        "commit",
      ),
      "invalid_command",
      422,
    );
  });
  it.each([
    '{"binding":{"ownerId":"x","\\u006fwnerId":"y"}}',
    '{"x":1,"x":2}',
    "[[[[[[[[[0]]]]]]]]]",
    "[" + Array(4100).fill("0").join(",") + "]",
  ])("rejects duplicate JSON/depth/token budgets %#", async (json) => {
    const body = new URLSearchParams({ command: json });
    await error(
      readGroupedOriginalForm(
        new Request("http://fixture.test", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        }),
        "preview",
      ),
      "invalid_command",
      422,
    );
  });
  it("rejects non-urlencoded, fatal UTF8 and encoded16385byte overflow; releases/cancels stream", async () => {
    await error(
      readGroupedOriginalForm(
        new Request("http://fixture.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        "preview",
      ),
      "invalid_command",
      422,
    );
    const invalid = new Request("http://fixture.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new Uint8Array([0xff]),
    });
    await error(
      readGroupedOriginalForm(invalid, "preview"),
      "invalid_command",
      422,
    );
    expect(invalid.body?.locked).toBe(false);
    let cancelled = false;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(16385));
      },
      cancel() {
        cancelled = true;
      },
    });
    const r = new Request("http://fixture.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await error(readGroupedOriginalForm(r, "preview"), "invalid_command", 422);
    expect(cancelled).toBe(true);
    expect(r.body?.locked).toBe(false);
  });
  it("accepts exact16384 encoded bytes and rejects16385 without narrowing the form", async () => {
    const f = await preview();
    let body = new URLSearchParams({
      command: JSON.stringify(f.request),
    }).toString();
    body += "+".repeat(16384 - new TextEncoder().encode(body).byteLength);
    const make = (text: string) =>
      new Request("http://fixture.test", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: text,
      });
    expect(await readGroupedOriginalForm(make(body), "preview")).toEqual(
      f.request,
    );
    await error(
      readGroupedOriginalForm(make(body + "+"), "preview"),
      "invalid_command",
      422,
    );
  });
  it("rejects a duplicate escaped JSON key in an otherwise valid strict command", async () => {
    const f = await preview();
    const json = JSON.stringify(f.request).replace(
      '"ownerId":',
      `"\\u006fwnerId":"${context.ownerId}","ownerId":`,
    );
    // JSON.parse alone would accept exactly the strict valid request.
    expect(JSON.parse(json)).toEqual(f.request);
    const request = new Request("http://fixture.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ command: json }),
    });
    await error(
      readGroupedOriginalForm(request, "preview"),
      "invalid_command",
      422,
    );
  });
  it("cancels and releases after a reader error using a fixed safe failure", async () => {
    const stream = new ReadableStream({
      pull(controller) {
        controller.error(new Error("raw-private-cause"));
      },
    });
    const request = new Request("http://fixture.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await error(
      readGroupedOriginalForm(request, "preview"),
      "invalid_command",
      422,
    );
    expect(request.body?.locked).toBe(false);
  });
  it("returns fixed errors without raw cause", () => {
    const e = new GroupedOriginalError("invalid_result", "retry_exact", 503);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toHaveProperty("cause");
  });
});

// Source/profile tests added after the owned SQL declaration is coherent.
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const read = (path: string) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const migrationPath =
  "supabase/migrations/20261113142537_grouped_original_workspace_read.sql";
const readSql = read(migrationPath);
const predecessorSql = read(
  "supabase/migrations/20261113131538_grouped_original_admission.sql",
);
const priorBody = predecessorSql.match(
  /as \$a02_ready\$([\s\S]*?)\$a02_ready\$;/,
)![1];
const readBody = readSql.match(/as \$a02_read\$([\s\S]*?)\$a02_read\$;/)![1];
const oldManifestText = readSql.match(
  /\$a02_old_manifest\$([\s\S]*?)\$a02_old_manifest\$/,
)![1];
const newManifestText = readSql.match(
  /\$a02_new_manifest\$([\s\S]*?)\$a02_new_manifest\$/,
)![1];
const predecessorPin = readSql.match(/predecessor text:='([a-f0-9]{64})'/)![1];
const successorPin = readSql.match(/postimage text:='([a-f0-9]{64})'/)![1];
function applyReadProfile(
  source: string,
  oldText = oldManifestText,
  newText = newManifestText,
) {
  if (sha(source) !== predecessorPin) throw Error("PREDECESSOR_DRIFT");
  if (source.split(oldText).length !== 2) throw Error("CONTEXT_DRIFT");
  const next = source.replace(oldText, newText);
  if (sha(next) !== successorPin) throw Error("POSTIMAGE_DRIFT");
  return next;
}
describe("forward read SQL source and independent external profile pin (not native proof)", () => {
  it("guards exact predecessor and carries all68 policies unchanged into69", () => {
    expect(predecessorPin).toBe(
      "07d338cc1cbd2c79df76dcbc21bd814b3612c43a0e748531f574974b55c25958",
    );
    expect(successorPin).toBe(
      "c2098f91ee32e4035ff30dd5db71c4d7e95944cef24e4b137c8c489841edd5db",
    );
    const old = JSON.parse(oldManifestText),
      next = JSON.parse(newManifestText);
    expect(old).toHaveLength(68);
    expect(next).toHaveLength(69);
    expect(next.slice(0, 68)).toEqual(old);
    expect(next.at(-1)).toEqual({
      signature: "public.read_grouped_original_workspace(uuid,uuid)",
      sha256: sha(readBody),
      definer: true,
      volatility: "v",
      resultType: "jsonb",
      strict: false,
      language: "plpgsql",
      serviceExecute: true,
    });
    const result = applyReadProfile(priorBody);
    expect(result.replace(newManifestText, oldManifestText)).toBe(priorBody);
    expect(
      next.find(
        (r: { signature: string }) =>
          r.signature ===
          "public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)",
      ).serviceExecute,
    ).toBe(false);
    expect(readBody).not.toContain(successorPin);
    expect(readSql).not.toMatch(
      /grant execute[^;]*import_canonical_grouped_original/i,
    );
  });
  it("refuses predecessor, context and postimage drift; historical68 stays intact", () => {
    expect(() => applyReadProfile(priorBody + " ")).toThrow(
      "PREDECESSOR_DRIFT",
    );
    expect(() => applyReadProfile(priorBody, oldManifestText + " ")).toThrow(
      "CONTEXT_DRIFT",
    );
    expect(() =>
      applyReadProfile(priorBody, oldManifestText, newManifestText + " "),
    ).toThrow("POSTIMAGE_DRIFT");
    expect(
      JSON.parse(
        priorBody.match(
          /\$catalog_manifest\$([\s\S]*?)\$catalog_manifest\$/,
        )![1],
      ),
    ).toHaveLength(68);
    expect(readSql).toContain("execute replace(definition,source,next_source)");
    for (const guard of [
      "A02_READ_PROFILE_PREDECESSOR_DRIFT",
      "A02_READ_PROFILE_CONTEXT_DRIFT",
      "A02_READ_PROFILE_POSTIMAGE_DRIFT",
      "A02_READ_PROFILE_DEFINITION_DRIFT",
    ])
      expect(readSql).toContain(guard);
  });
  it("reads one locked exact attempt and separates permission, compatibility and freshness without mutation", () => {
    expect(readSql).toContain(
      "language plpgsql volatile security definer set search_path=''",
    );
    expect(
      readBody.match(/scope:=private.grouped_original_scope/g),
    ).toHaveLength(1);
    expect(readBody).toContain(
      "organization_id=(scope->>'organizationId')::uuid",
    );
    expect(readBody).toContain("input_sha256=scope->>'inputSha256' for share");
    expect(readBody).toContain(
      "ready:=private.canonical_correction_write_ready()",
    );
    expect(readBody).toContain(
      "permitted:=ready and has_function_privilege('service_role'",
    );
    expect(readBody).toContain(
      "scope->'headId'='null'::jsonb and private.correction_original_import_allowed(scope)",
    );
    expect(readBody).toContain("16777216");
    expect(readBody).not.toMatch(/\b(?:insert|update|delete|truncate)\b/iu);
    expect(readSql).toContain(
      "revoke all on function public.read_grouped_original_workspace(uuid,uuid) from public,anon,authenticated,service_role",
    );
    expect(readSql).toContain(
      "grant execute on function public.read_grouped_original_workspace(uuid,uuid) to service_role",
    );
  });
  it("pins rollback-only native source and actual frozen JS oracle independently", () => {
    const verifier = read("scripts/verify-grouped-original-read.sql");
    expect(verifier).toContain(successorPin);
    expect(verifier).toContain(
      "SOURCE ONLY / UNPARSED / UNAPPLIED / UNEXECUTED",
    );
    expect(verifier.trimEnd()).toMatch(/rollback;$/);
    expect(verifier).not.toMatch(/\bgrant\s+execute\b/iu);
    for (const id of [
      "ready_but_writer_denied",
      "one_exact_source_envelope",
      "actual_initial_pairs",
      "read_has_no_version_or_approval_writes",
      "foreign_owner_fixed_not_found",
      "missing_analysis_denied",
      "privileged_grouped_fixture",
      "nonzero_captures_head_and_capability_are_distinct",
      "latest_attempt_not_mixed_with_old_envelope",
      "current_privacy_blocks_raw_source",
    ])
      expect(verifier).toContain(`'${id}'`);
    const oracle = JSON.parse(
      verifier.match(/\$oracle\$([\s\S]*?)\$oracle\$::jsonb/)![1],
    );
    const candidates = deriveEvidenceEntryAssociations(
      oracle.envelope,
      oracle.scope,
    );
    expect(candidates.state).toBe("review_required");
    const normalized = normalizeGroupedOriginalCommand(
      oracle.envelope,
      oracle.scope,
      {
        schemaVersion: oracle.command.normalForm.schemaVersion,
        operation: oracle.command.normalForm.operation,
        binding: oracle.command.normalForm.binding,
        expected: oracle.command.normalForm.expected,
        selectedGroupIds: candidates.groups.map((group) => group.id),
        unselectedDisposition: "retain_original",
        acknowledgement: true,
        previewHash: oracle.command.previewHash,
        idempotencyKey: oracle.command.idempotencyKey,
      },
    );
    expect(normalized.state).toBe("prepared");
    if (normalized.state !== "prepared") throw Error("ORACLE_NOT_PREPARED");
    expect(normalized.normalForm).toEqual(oracle.command.normalForm);
    expect(normalized.previewHash).toBe(oracle.command.previewHash);
    expect(normalized.semanticAtoms).toEqual(oracle.atoms);
    // The payload is the same immutable JS-generated input, not a SQL-generated expected body.
    const oldVerifier = read("scripts/verify-grouped-original-admission.sql");
    expect(oracle).toEqual(
      JSON.parse(
        oldVerifier.match(/\$oracle\$([\s\S]*?)\$oracle\$::jsonb/)![1],
      ),
    );
    expect(oracle.command.normalForm.selections).toHaveLength(2);
  });
});
