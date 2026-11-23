import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import {
  CanonicalEntryRegroupRequestSchema,
  CanonicalEntryRegroupCommandSchema,
} from "../../app/lib/server/canonical-entry-regroup-commands";
import {
  loadCanonicalEntryRegroupWorkspace,
  previewCanonicalEntryRegroup,
  resumeCanonicalEntryRegroup,
  commitCanonicalEntryRegroup,
  readCanonicalEntryRegroupForm,
} from "../../app/lib/server/canonical-entry-regroup-repository";
const config = vi.hoisted(() => ({
  CANONICAL_AUTHORING_ENABLED: true,
  CANONICAL_CORRECTIONS_ENABLED: true,
  EVIDENCE_REVIEW_ENABLED: true,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => config,
}));
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const text = readFileSync(
    "tests/unit/canonical-entry-regroup-commands.test.ts",
    "utf8",
  );
  const marker = "export const NODE_REGROUP_LITERAL_JSON = String.raw`";
  const body = text.slice(text.indexOf(marker) + marker.length).split("`;")[0];
  const oracle = JSON.parse(body);
  const request = CanonicalEntryRegroupRequestSchema.parse(oracle.request);
  const command = CanonicalEntryRegroupCommandSchema.parse({
    ...request,
    acknowledgement: true,
    previewHash: oracle.previewHash,
    idempotencyKey: id(90),
  });
  const source = Object.fromEntries(
    [
      "ownerId",
      "organizationId",
      "resumeId",
      "analysisId",
      "sourceId",
      "attemptId",
      "inputSha256",
    ].map((key) => [key, request.binding[key as keyof typeof request.binding]]),
  );
  const binding = {
    ownerId: request.binding.ownerId,
    analysisId: request.binding.analysisId,
    sourceId: request.binding.sourceId,
    attemptId: request.binding.attemptId,
    inputSha256: request.binding.inputSha256,
    evidenceSchemaVersion: "evidence/2.0.0",
    fieldExtractorVersion: "evidence-fields/1.0.1",
    targetModelVersion: "evidence-targets/1.0.0",
  };
  const row = {
    schemaVersion: "entry-regroup-read/1.0.0",
    status: "available",
    scoringEligible: false,
    source,
    attempt: {
      id: source.attemptId,
      attemptNumber: 1,
      envelope: oracle.evidence,
    },
    historical: {
      base: { ...request.base, content: oracle.base },
      ancestors: [] as {
        versionId: string;
        revision: number;
        content: unknown;
      }[],
      review: {
        revision: 0,
        headId: null as string | null,
        events: [] as Record<string, unknown>[],
        historyAttestation: {
          schemaVersion: "evidence-review-history/1.0.0",
          state: "complete_captured_prefix",
          binding,
          highWaterRevision: 0,
          highWaterEventId: null as string | null,
          receivedCount: 0,
          pageCount: 0,
        },
      },
    },
    current: {
      status: "available",
      captured: { ...request.expected },
      freshCanPreview: true,
      freshCanCommit: false,
    } as
      | {
          status: "available";
          captured: typeof request.expected;
          freshCanPreview: boolean;
          freshCanCommit: boolean;
        }
      | { status: "unavailable" },
    compatibilityReady: true,
    canRetry: false,
  };
  const receipt = {
    schemaVersion: "entry-regroup-result/1.0.0",
    status: "applied",
    baseVersionId: request.base.versionId,
    baseRevision: request.base.revision,
    idempotencyKey: command.idempotencyKey,
    commandSha256: command.previewHash,
    versionId: id(91),
    revision: request.base.revision + 1,
    batchId: id(92),
    regroupRevision: request.expected.regroupRevision + 1,
    regroupHeadId: id(92),
    idempotent: true,
    scoringEligible: false,
  };
  const transport = {
    rpc: vi.fn(
      async (name: string): Promise<{ data: unknown; error: unknown }> => ({
        data: name === "read_canonical_entry_regroup_workspace" ? row : receipt,
        error: null as unknown,
      }),
    ),
  };
  const client = transport as unknown as Parameters<
    typeof loadCanonicalEntryRegroupWorkspace
  >[0];
  return {
    oracle,
    request,
    command,
    row,
    receipt,
    transport,
    client,
    ownerId: request.binding.ownerId,
    analysisId: request.binding.analysisId,
  };
}
function form(command: unknown, acknowledgement?: string) {
  const body = new URLSearchParams({
    command: JSON.stringify(command),
    ...(acknowledgement === undefined
      ? {}
      : { wholeEntryAcknowledgement: acknowledgement }),
  });
  return new Request("https://fixture.invalid/analysis/review/canonical", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
}

describe("owned saved entry regroup repository", () => {
  it("refuses a skipped ancestor revision with intact owned document identities", async () => {
    const f = fixture();
    const parent = CanonicalResumeDraftSchema.parse(f.oracle.base);
    const child = reviseCanonical(parent, {
      operation: "confirm",
      factId: f.request.selections[0].factIds[0],
    });
    expect(child.parentVersionId).toBe(parent.versionId);
    f.row.historical.base = {
      ...f.request.base,
      versionId: child.versionId,
      revision: 3,
      content: child,
    };
    f.row.historical.ancestors = [
      { versionId: parent.versionId, revision: 1, content: parent },
    ];
    expect(
      await loadCanonicalEntryRegroupWorkspace(
        f.client,
        f.analysisId,
        f.ownerId,
      ),
    ).toMatchObject({ state: "unavailable", reason: "invalid_source" });
    expect(f.transport.rpc).toHaveBeenCalledTimes(1);
  });
  it("derives actual source-ordered explicit fact choices without exposing raw records", async () => {
    const f = fixture();
    const workspace = await loadCanonicalEntryRegroupWorkspace(
      f.client,
      f.analysisId,
      f.ownerId,
    );
    expect(workspace.state).toBe("available");
    if (workspace.state !== "available") throw Error("WORKSPACE_REQUIRED");
    expect(workspace.base).toEqual(f.request.base);
    expect(workspace.groups.map((g) => g.id)).toEqual(
      f.request.selections.map((g) => g.groupId),
    );
    expect(
      workspace.groups.map((g) =>
        g.members.map((m) => m.choices.map((c) => c.factId)),
      ),
    ).toEqual(
      f.request.selections.map((g) => g.factIds.map((factId) => [factId])),
    );
    expect(workspace.capability).toEqual({
      compatibilityReady: true,
      canRetry: false,
    });
    expect(workspace.canPreview).toBe(true);
    expect(JSON.stringify(workspace)).not.toContain('"envelope"');
    expect(JSON.stringify(workspace)).not.toContain('"ancestors"');
    expect(f.transport.rpc).toHaveBeenCalledTimes(1);
    expect(f.transport.rpc).toHaveBeenCalledWith(
      "read_canonical_entry_regroup_workspace",
      {
        p_user_id: f.ownerId,
        p_analysis_id: f.analysisId,
        p_original_capture: null,
      },
    );
  });
  it("previews with the real frozen normalizer and full Core diff", async () => {
    const f = fixture();
    const preview = await previewCanonicalEntryRegroup(
      f.client,
      f.analysisId,
      f.ownerId,
      f.request,
    );
    expect(preview.command.previewHash).toBe(f.oracle.previewHash);
    expect(preview.command.idempotencyKey).not.toBe(f.command.idempotencyKey);
    expect(preview.preparation.beforeSections).toEqual(f.oracle.base.sections);
    expect(preview.preparation.afterSections[0].entries).toHaveLength(2);
    expect(preview.preparation.facts).toEqual(f.oracle.base.facts);
    expect(preview.capability.canRetry).toBe(false);
  });
  it("resumes the exact original command when current state is unavailable", async () => {
    const f = fixture();
    f.row.current = { status: "unavailable" };
    const retained = await resumeCanonicalEntryRegroup(
      f.client,
      f.analysisId,
      f.ownerId,
      f.command,
    );
    expect(retained.state).toBe("retained");
    expect(retained.command).toEqual(f.command);
    expect(retained.current).toEqual({ status: "unavailable" });
    expect(retained.preparation.beforeSections).toEqual(f.oracle.base.sections);
    expect(f.transport.rpc).toHaveBeenCalledWith(
      "read_canonical_entry_regroup_workspace",
      {
        p_user_id: f.ownerId,
        p_analysis_id: f.analysisId,
        p_original_capture: {
          base: f.command.base,
          reviewRevision: 0,
          reviewHeadId: null,
        },
      },
    );
  });
  it("does not invoke the denied writer", async () => {
    const f = fixture();
    await expect(
      commitCanonicalEntryRegroup(
        f.client,
        f.analysisId,
        f.ownerId,
        f.command,
        "sdk-test",
      ),
    ).rejects.toMatchObject({
      reason: "unavailable",
      recovery: "unavailable",
      status: 503,
    });
    expect(f.transport.rpc).toHaveBeenCalledTimes(1);
  });
  it("returns a strictly correlated old receipt independently of today's head", async () => {
    const f = fixture();
    f.row.canRetry = true;
    f.row.current = {
      status: "available",
      captured: {
        ...f.request.expected,
        canonicalHeadId: id(95),
        reviewRevision: 1001,
        reviewHeadId: id(96),
      },
      freshCanPreview: false,
      freshCanCommit: false,
    };
    const receipt = await commitCanonicalEntryRegroup(
      f.client,
      f.analysisId,
      f.ownerId,
      f.command,
      "sdk-test",
    );
    expect(receipt).toEqual(f.receipt);
    expect(f.transport.rpc).toHaveBeenCalledTimes(2);
    expect(f.transport.rpc).toHaveBeenLastCalledWith(
      "apply_canonical_entry_regroup",
      {
        p_user_id: f.ownerId,
        p_analysis_id: f.analysisId,
        p_command: {
          normalForm: f.oracle.normalForm,
          previewHash: f.oracle.previewHash,
          idempotencyKey: f.command.idempotencyKey,
        },
        p_request_id: "sdk-test",
      },
    );
  });
  it("requires the distinct named whole-entry acknowledgement only on commit", async () => {
    const f = fixture();
    expect(
      await readCanonicalEntryRegroupForm(form(f.request), "preview"),
    ).toEqual(f.request);
    expect(
      await readCanonicalEntryRegroupForm(form(f.command), "resume"),
    ).toEqual(f.command);
    await expect(
      readCanonicalEntryRegroupForm(form(f.command), "commit"),
    ).rejects.toMatchObject({ reason: "invalid_command" });
    expect(
      await readCanonicalEntryRegroupForm(
        form(f.command, "accepted"),
        "commit",
      ),
    ).toEqual(f.command);
  });
  it("accepts a witnessed GLOBAL prefix containing an earlier attempt", async () => {
    const f = fixture(),
      review = f.row.historical.review;
    review.revision = 1;
    review.headId = id(93);
    review.events.push({
      id: id(93),
      attempt_id: id(94),
      analysis_id: f.analysisId,
      owner_id: f.ownerId,
      actor_id: f.ownerId,
      revision: 1,
      expected_revision: 0,
      field: "role",
      operation: "confirm",
      value: "Earlier source role",
      candidate_id: "earlier-source-assertion",
      created_at: "2026-11-13T00:00:00.000Z",
    });
    Object.assign(review.historyAttestation, {
      highWaterRevision: 1,
      highWaterEventId: id(93),
      receivedCount: 1,
      pageCount: 1,
    });
    if (f.row.current.status !== "available") throw Error("CURRENT_REQUIRED");
    f.row.current.captured.reviewRevision = 1;
    f.row.current.captured.reviewHeadId = id(93);
    const workspace = await loadCanonicalEntryRegroupWorkspace(
      f.client,
      f.analysisId,
      f.ownerId,
    );
    expect(workspace.state).toBe("available");
    if (workspace.state !== "available") throw Error("WORKSPACE_REQUIRED");
    expect(workspace.reviewNotice).toBe("captured_corrections_present");
    expect(workspace.groups).toHaveLength(2);
  });
  it.each([
    "owner",
    "attempt",
    "hash",
    "native-sha",
    "body-id",
    "body-scope",
    "witness-binding",
    "witness-count",
    "witness-pages",
    "canRetry",
    "fresh-permission",
    "ancestor",
    "oversized-facts",
  ])("refuses malformed owned read %s before preview or save", async (kind) => {
    const f = fixture();
    if (kind === "owner") f.row.source.ownerId = id(99);
    if (kind === "attempt") f.row.attempt.id = id(99);
    if (kind === "hash") f.row.source.inputSha256 = "c".repeat(64);
    if (kind === "native-sha")
      f.row.historical.base.contentSha256 = "c".repeat(64);
    if (kind === "body-id") f.row.historical.base.content.versionId = id(99);
    if (kind === "body-scope")
      f.row.historical.base.content.organizationId = id(99);
    if (kind === "witness-binding")
      f.row.historical.review.historyAttestation.binding.ownerId = id(99);
    if (kind === "witness-count")
      f.row.historical.review.historyAttestation.receivedCount = 1;
    if (kind === "witness-pages")
      f.row.historical.review.historyAttestation.pageCount = 1;
    if (kind === "canRetry") {
      f.row.canRetry = true;
      f.row.compatibilityReady = false;
    }
    if (kind === "fresh-permission" && f.row.current.status === "available")
      f.row.current.freshCanCommit = true;
    if (kind === "ancestor")
      f.row.historical.ancestors.push({
        versionId: id(98),
        revision: 1,
        content: { ...f.oracle.base, versionId: id(98) },
      });
    if (kind === "oversized-facts")
      f.row.historical.base.content.facts = Array.from(
        { length: 1001 },
        () => null,
      );
    await expect(
      resumeCanonicalEntryRegroup(f.client, f.analysisId, f.ownerId, f.command),
    ).rejects.toMatchObject({ reason: "invalid_source" });
    expect(f.transport.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["expected", "actor", "whitespace", "candidate", "head"])(
    "does not trust forged original event %s",
    async (kind) => {
      const f = fixture(),
        r = f.row.historical.review;
      r.revision = 1;
      r.headId = id(93);
      const event = {
        id: id(93),
        attempt_id: id(94),
        analysis_id: f.analysisId,
        owner_id: f.ownerId,
        actor_id: f.ownerId,
        revision: 1,
        expected_revision: 0,
        field: "role",
        operation: "correct",
        value: "Candidate role",
        candidate_id: null as string | null,
        created_at: "2026-11-13T00:00:00.000Z",
      };
      if (kind === "expected") event.expected_revision = 4;
      if (kind === "actor") event.actor_id = id(99);
      if (kind === "whitespace") event.value = " Candidate role ";
      if (kind === "candidate") event.candidate_id = "forged";
      if (kind === "head") r.headId = id(99);
      r.events.push(event);
      Object.assign(r.historyAttestation, {
        highWaterRevision: 1,
        highWaterEventId: r.headId,
        receivedCount: 1,
        pageCount: 1,
      });
      expect(
        await loadCanonicalEntryRegroupWorkspace(
          f.client,
          f.analysisId,
          f.ownerId,
        ),
      ).toMatchObject({ state: "unavailable", reason: "invalid_source" });
    },
  );
  it("refuses new preview after capture movement without changing the original request", async () => {
    const f = fixture(),
      before = structuredClone(f.request);
    f.row.current = {
      status: "available",
      captured: { ...f.request.expected, canonicalHeadId: id(95) },
      freshCanPreview: true,
      freshCanCommit: false,
    };
    await expect(
      previewCanonicalEntryRegroup(
        f.client,
        f.analysisId,
        f.ownerId,
        f.request,
      ),
    ).rejects.toMatchObject({ reason: "stale_preview", status: 409 });
    expect(f.request).toEqual(before);
    const retained = await resumeCanonicalEntryRegroup(
      f.client,
      f.analysisId,
      f.ownerId,
      f.command,
    );
    expect(retained.command).toEqual(f.command);
  });
  it.each([
    "baseVersionId",
    "baseRevision",
    "idempotencyKey",
    "commandSha256",
    "revision",
    "regroupRevision",
    "regroupHeadId",
    "extra",
  ])("keeps exact original request on unconfirmed receipt %s", async (kind) => {
    const f = fixture();
    f.row.canRetry = true;
    const changed: Record<string, unknown> = { ...f.receipt };
    changed[kind] =
      kind === "baseRevision" ||
      kind === "revision" ||
      kind === "regroupRevision"
        ? 9
        : kind === "commandSha256"
          ? "c".repeat(64)
          : kind === "extra"
            ? true
            : id(99);
    f.transport.rpc.mockImplementation(async (name) => ({
      data: name === "read_canonical_entry_regroup_workspace" ? f.row : changed,
      error: null,
    }));
    const original = structuredClone(f.command);
    await expect(
      commitCanonicalEntryRegroup(
        f.client,
        f.analysisId,
        f.ownerId,
        f.command,
        "sdk-test",
      ),
    ).rejects.toMatchObject({
      reason: "invalid_result",
      recovery: "retry_exact",
      status: 503,
    });
    expect(f.command).toEqual(original);
    expect(f.transport.rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["throw", "error", "unknown"])(
    "does not retry ambiguous %s outcomes",
    async (kind) => {
      const f = fixture();
      f.row.canRetry = true;
      f.transport.rpc.mockImplementation(async (name) => {
        if (name === "read_canonical_entry_regroup_workspace")
          return { data: f.row, error: null };
        if (kind === "throw") throw Error("PRIVATE_TRANSPORT_DETAIL");
        return {
          data: kind === "unknown" ? {} : null,
          error:
            kind === "error" ? { message: "PRIVATE_DATABASE_DETAIL" } : null,
        };
      });
      await expect(
        commitCanonicalEntryRegroup(
          f.client,
          f.analysisId,
          f.ownerId,
          f.command,
          "sdk-test",
        ),
      ).rejects.toMatchObject({ recovery: "retry_exact", status: 503 });
      expect(f.transport.rpc).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    ["not_found", 404, "not_found"],
    ["conflict", 409, "conflict"],
    ["invalid", 422, "invalid_command"],
    ["unavailable", 503, "unavailable"],
  ] as const)(
    "maps fixed SQL refusal %s without exposing details",
    async (status, http, reason) => {
      const f = fixture();
      f.row.canRetry = true;
      f.transport.rpc.mockImplementation(async (name) => ({
        data:
          name === "read_canonical_entry_regroup_workspace"
            ? f.row
            : {
                schemaVersion: "entry-regroup-result/1.0.0",
                status,
                scoringEligible: false,
              },
        error: null,
      }));
      await expect(
        commitCanonicalEntryRegroup(
          f.client,
          f.analysisId,
          f.ownerId,
          f.command,
          "sdk-test",
        ),
      ).rejects.toMatchObject({ reason, status: http });
    },
  );
  it.each([undefined, null, 5, "bad trace", "x".repeat(101)])(
    "refuses unsafe request trace %s before reading or writing",
    async (trace) => {
      const f = fixture();
      await expect(
        commitCanonicalEntryRegroup(
          f.client,
          f.analysisId,
          f.ownerId,
          f.command,
          trace as unknown as string,
        ),
      ).rejects.toMatchObject({ reason: "invalid_command", status: 422 });
      expect(f.transport.rpc).not.toHaveBeenCalled();
    },
  );
  it("returns disabled workspace without querying owned data", async () => {
    const f = fixture();
    config.CANONICAL_CORRECTIONS_ENABLED = false;
    try {
      expect(
        await loadCanonicalEntryRegroupWorkspace(
          f.client,
          f.analysisId,
          f.ownerId,
        ),
      ).toMatchObject({ state: "unavailable", reason: "disabled" });
      expect(f.transport.rpc).not.toHaveBeenCalled();
    } finally {
      config.CANONICAL_CORRECTIONS_ENABLED = true;
    }
  });
});

describe("saved entry regroup form boundary", () => {
  it("accepts exactly16384 encoded bytes and refuses16385", async () => {
    const f = fixture(),
      encoded = new URLSearchParams({
        command: JSON.stringify(f.command),
      }).toString();
    const request = (length: number) =>
      new Request("https://fixture.invalid/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: encoded + "+".repeat(length - encoded.length),
      });
    expect(
      await readCanonicalEntryRegroupForm(request(16384), "resume"),
    ).toEqual(f.command);
    await expect(
      readCanonicalEntryRegroupForm(request(16385), "resume"),
    ).rejects.toMatchObject({ reason: "invalid_command" });
  });
  it.each([
    "duplicate-form",
    "escaped-form",
    "nested-json",
    "escaped-json",
    "unknown",
    "old-ack",
    "false-ack",
    "prototype",
    "wrong-mode",
  ])("refuses %s", async (kind) => {
    const f = fixture(),
      encoded = new URLSearchParams({
        command: JSON.stringify(f.command),
      }).toString();
    let body = encoded;
    if (kind === "duplicate-form") body += "&" + encoded;
    if (kind === "escaped-form")
      body += "&%63ommand=" + encodeURIComponent(JSON.stringify(f.command));
    if (kind === "nested-json" || kind === "escaped-json")
      body = new URLSearchParams({
        command: JSON.stringify(f.command).replace(
          '"revision":1',
          kind === "nested-json"
            ? '"revision":1,"revision":1'
            : '"revision":1,"\\u0072evision":1',
        ),
      }).toString();
    if (kind === "unknown") body += "&other=true";
    if (kind === "old-ack") body += "&relationshipAcknowledgement=accepted";
    if (kind === "false-ack") body += "&wholeEntryAcknowledgement=false";
    if (kind === "prototype") body += "&__proto__=x";
    const request = new Request("https://fixture.invalid/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const result =
      kind === "wrong-mode"
        ? readCanonicalEntryRegroupForm(request, "preview")
        : readCanonicalEntryRegroupForm(
            request,
            kind === "false-ack" || kind === "old-ack" ? "commit" : "resume",
          );
    await expect(result).rejects.toMatchObject({ reason: "invalid_command" });
  });
  it("refuses invalid UTF8, content type and consumed body", async () => {
    const f = fixture();
    const invalid = new Request("https://fixture.invalid/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new Uint8Array([0xff]),
    });
    await expect(
      readCanonicalEntryRegroupForm(invalid, "resume"),
    ).rejects.toMatchObject({ reason: "invalid_command" });
    await expect(
      readCanonicalEntryRegroupForm(
        new Request("https://fixture.invalid/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(f.command),
        }),
        "resume",
      ),
    ).rejects.toMatchObject({ reason: "invalid_command" });
    const used = form(f.command);
    await used.text();
    await expect(
      readCanonicalEntryRegroupForm(used, "resume"),
    ).rejects.toMatchObject({ reason: "invalid_command" });
  });
});
