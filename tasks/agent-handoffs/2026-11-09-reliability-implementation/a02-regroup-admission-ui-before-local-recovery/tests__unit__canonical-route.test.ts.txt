import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  load: vi.fn(),
  workspace: vi.fn(),
  mutate: vi.fn(),
  groupedLoad: vi.fn(),
  groupedPreview: vi.fn(),
  groupedCommit: vi.fn(),
  regroupLoad: vi.fn(),
  regroupPreview: vi.fn(),
  regroupResume: vi.fn(),
  regroupCommit: vi.fn(),
  enabled: true,
  correctionsEnabled: false,
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    APP_ORIGIN: "https://example.test",
    CANONICAL_AUTHORING_ENABLED: mocks.enabled,
    CANONICAL_CORRECTIONS_ENABLED: mocks.correctionsEnabled,
    EVIDENCE_REVIEW_ENABLED: true,
  }),
}));
vi.mock("../../app/lib/server/canonical-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/canonical-repository")
  >()),
  loadCanonical: mocks.load,
  loadCanonicalCorrectionWorkspace: mocks.workspace,
  mutateCanonical: mocks.mutate,
}));
vi.mock("../../app/lib/server/grouped-import-repository", async (original) => ({
  ...(await original<
    typeof import("../../app/lib/server/grouped-import-repository")
  >()),
  loadGroupedOriginalWorkspace: mocks.groupedLoad,
  previewGroupedOriginalImport: mocks.groupedPreview,
  commitGroupedOriginalImport: mocks.groupedCommit,
}));
vi.mock(
  "../../app/lib/server/canonical-entry-regroup-repository",
  async (original) => ({
    ...(await original<
      typeof import("../../app/lib/server/canonical-entry-regroup-repository")
    >()),
    loadCanonicalEntryRegroupWorkspace: mocks.regroupLoad,
    previewCanonicalEntryRegroup: mocks.regroupPreview,
    resumeCanonicalEntryRegroup: mocks.regroupResume,
    commitCanonicalEntryRegroup: mocks.regroupCommit,
  }),
);
import { CanonicalEntryRegroupCommandSchema } from "../../app/lib/server/canonical-entry-regroup-commands";
import {
  action,
  loader,
  headers,
  shouldRevalidate,
} from "../../app/routes/analysis.canonical";
import { GroupedOriginalError } from "../../app/lib/server/grouped-import-repository";
import { GroupedOriginalCommandSchema } from "../../app/lib/server/grouped-import-commands";
import {
  CanonicalError,
  readCanonicalForm,
} from "../../app/lib/server/canonical-repository";
import type { CanonicalCorrectionCommand } from "../../app/lib/server/canonical-correction-commands";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function form() {
  return new URLSearchParams({
    operation: "confirm",
    expectedVersionId: id(2),
    idempotencyKey: id(3),
    factId: id(4),
  });
}
function correction(
  kind: CanonicalCorrectionCommand["kind"] = "apply",
): CanonicalCorrectionCommand {
  const common = {
    schemaVersion: "candidate-correction-command/1.0.0" as const,
    idempotencyKey: id(3),
    sourceId: id(10),
    attemptId: id(11),
    inputSha256: "a".repeat(64),
    evidenceSchemaVersion: "evidence/2.0.0" as const,
    fieldExtractorVersion: "evidence-fields/test",
    targetModelVersion: "evidence-targets/1.0.0" as const,
    projectionModelVersion: "canonical-corrections/1.0.1" as const,
    admissionPolicyVersion: "candidate-correction-admission/1.0.0" as const,
    expectedReviewRevision: 2,
    expectedAssignmentRevision: 1,
    expectedVersionId: id(2),
    acknowledgement: true as const,
  };
  if (kind === "assign")
    return {
      ...common,
      kind,
      selectors: [
        {
          eventId: id(12),
          targetKind: "observed_assertion",
          assertionId: "assertion-employer",
          opaqueTargetId: "source-target-employer",
          mappingMode: "existing",
          baseVersionId: id(2),
          factId: id(4),
          mappingProofKind: "current_citations",
          originVersionId: null,
          originFactId: null,
          location: {
            kind: "entry",
            sectionId: id(13),
            entryId: id(14),
            bulletId: null,
            newSectionType: null,
            newSectionTitle: null,
          },
          supersedesAssignmentId: null,
        },
      ],
    };
  return {
    ...common,
    kind,
    selectors: [
      {
        assignmentId: id(15),
        priorApplicationId: kind === "reapply" ? id(16) : null,
      },
    ],
  };
}
function correctionForm(command: unknown = correction()) {
  return new URLSearchParams({
    operation: "correction",
    command: JSON.stringify(command),
  });
}
function args(body = form(), origin = "https://example.test", method = "POST") {
  return {
    request: new Request(`https://example.test/analysis/${id(1)}/canonical`, {
      method,
      headers: { Origin: origin },
      body,
    }),
    params: { id: id(1) },
  };
}
function groupedCommand() {
  return GroupedOriginalCommandSchema.parse({
    schemaVersion: "grouped-original-command/1.0.0",
    operation: "approve_and_import_grouped_original",
    binding: {
      ownerId: id(5),
      organizationId: id(6),
      resumeId: id(7),
      analysisId: id(1),
      sourceId: id(8),
      attemptId: id(9),
      inputSha256: "a".repeat(64),
      evidenceSchemaVersion: "evidence/2.0.0",
      fieldExtractorVersion: "evidence-fields/1.0.1",
      targetModelVersion: "evidence-targets/1.0.0",
      associationModelVersion: "evidence-entry-associations/1.0.0",
      producerVersion: "canonical-engine/1.0.3",
      admissionPolicyVersion: "grouped-original-admission/1.0.0",
      structuralTextProfileVersion: "a02-structural-text/1.0.0",
      correctionProjectionModelVersion: "canonical-corrections/1.0.1",
      correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
      effectiveLocale: "en-IN",
    },
    expected: {
      reviewRevision: 2,
      reviewHeadId: id(10),
      assignmentRevision: 1,
      assignmentHeadId: id(11),
      associationRevision: 0,
      associationHeadId: null,
      canonicalHeadId: null,
    },
    selectedGroupIds: [`entry-association-${"b".repeat(64)}`],
    unselectedDisposition: "retain_original",
    acknowledgement: true,
    previewHash: "c".repeat(64),
    idempotencyKey: id(12),
  });
}
function groupedArgs(body: URLSearchParams, selector = "grouped=commit") {
  return {
    request: new Request(
      `https://example.test/analysis/${id(1)}/canonical?${selector}`,
      { method: "POST", headers: { Origin: "https://example.test" }, body },
    ),
    params: { id: id(1) },
  };
}
describe("canonical authorization and bounded forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.correctionsEnabled = false;
    mocks.regroupLoad.mockResolvedValue({
      schemaVersion: "entry-regroup-workspace/1.0.0",
      state: "unavailable",
      reason: "disabled",
      scoringEligible: false,
    });
    mocks.groupedLoad.mockResolvedValue({
      schemaVersion: "grouped-original-workspace/1.0.0",
      state: "unavailable",
      reason: "disabled",
      scoringEligible: false,
    });
    mocks.user.mockResolvedValue({ id: id(5) });
    mocks.mutate.mockResolvedValue({ revision: 2 });
    mocks.load.mockResolvedValue({ current: null, history: [] });
    mocks.workspace.mockResolvedValue({
      current: null,
      history: [],
      corrections: null,
    });
  });
  it("loads the owned correction workspace when correction review is enabled", async () => {
    mocks.correctionsEnabled = true;
    await loader({
      request: new Request("https://example.test/canonical"),
      params: { id: id(1) },
    });
    expect(mocks.workspace).toHaveBeenCalledWith(undefined, id(1), id(5), {
      versionId: undefined,
      compareId: undefined,
      offset: 0,
    });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["assign", "apply", "add", "reapply"] as const)(
    "submits a strictly bound %s command with authenticated identity and precise success copy",
    async (kind) => {
      mocks.correctionsEnabled = true;
      mocks.mutate.mockResolvedValue({
        status: kind === "assign" ? "assigned" : "applied",
        revision: kind === "assign" ? null : 3,
      });
      const command = correction(kind);
      const result = await action(args(correctionForm(command)));
      expect(result.init?.status ?? 200).toBe(200);
      expect(mocks.mutate).toHaveBeenCalledWith(
        undefined,
        id(1),
        id(5),
        { operation: "correction", command },
        expect.any(String),
      );
      expect(result.data.error).toBeNull();
      if (!("success" in result.data))
        throw new Error("Expected a successful correction response.");
      expect(result.data.success).toBe(
        kind === "assign"
          ? "Correction target saved. Review the proposed change before applying it."
          : "Version 3 saved for review. Confirm the new fact separately.",
      );
      expect(new Headers(result.init?.headers).get("Cache-Control")).toBe(
        "private, no-store",
      );
    },
  );
  it.each(["ownerId", "value"])(
    "rejects authoritative %s inside a correction command",
    async (field) => {
      mocks.correctionsEnabled = true;
      const response = await action(
        args(correctionForm({ ...correction(), [field]: "untrusted" })),
      );
      expect(response.init?.status).toBe(422);
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
  it("does not admit correction writes while the feature is disabled", async () => {
    const response = await action(args(correctionForm()));
    expect(response.init?.status).toBe(404);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("preserves a correction conflict and private response without claiming success", async () => {
    mocks.correctionsEnabled = true;
    mocks.mutate.mockRejectedValue(
      new CanonicalError(409, "Reload latest version."),
    );
    const response = await action(args(correctionForm()));
    expect(response.init?.status).toBe(409);
    expect(response.data).toEqual({
      error: "Reload latest version.",
      success: null,
    });
    expect(new Headers(response.init?.headers).get("Cache-Control")).toBe(
      "private, no-store",
    );
  });
  it("rejects cross-origin writes before authentication or privileged clients", async () => {
    expect(
      (await action(args(form(), "https://foreign.example.test"))).init?.status,
    ).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("requires sign-in before privileged calls", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await action(args())).init?.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    await expect(
      loader({
        request: new Request("https://example.test/canonical"),
        params: { id: id(1) },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });
  it("keeps authoring disabled by default and rejects unsupported methods", async () => {
    mocks.enabled = false;
    expect((await action(args())).init?.status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.enabled = true;
    const response = await action(args(form(), "https://example.test", "PUT"));
    expect(response.init?.status).toBe(405);
    expect(new Headers(response.init?.headers).get("Allow")).toBe("POST");
  });
  it.each(["ownerId", "organizationId", "confirmation", "__proto__"])(
    "rejects supplied %s",
    async (key) => {
      const values = form();
      values.set(key, id(99));
      expect((await action(args(values))).init?.status).toBe(422);
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate and oversized streamed forms", async () => {
    const duplicated = form();
    duplicated.append("factId", id(99));
    expect((await action(args(duplicated))).init?.status).toBe(422);
    const large = form();
    large.set("value", "x".repeat(17000));
    expect((await action(args(large))).init?.status).toBe(422);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("passes authenticated identity and preserves conflict status", async () => {
    mocks.mutate.mockRejectedValue(
      new CanonicalError(409, "Reload latest version."),
    );
    const response = await action(args());
    expect(response.init?.status).toBe(409);
    expect(mocks.mutate).toHaveBeenCalledWith(
      undefined,
      id(1),
      id(5),
      expect.objectContaining({ operation: "confirm" }),
      expect.any(String),
    );
    expect(new Headers(response.init?.headers).get("Cache-Control")).toContain(
      "no-store",
    );
  });
  it.each([
    ["edit", 409],
    ["edit", 422],
    ["rename_section", 409],
  ] as const)(
    "U03 draft retains a parsed authenticated %s after status %s",
    async (operation, status) => {
      const submitted = {
        operation,
        expectedVersionId: id(2),
        idempotencyKey: id(3),
        ...(operation === "edit" ? { factId: id(4) } : { sectionId: id(4) }),
        value: "Retained candidate draft",
      };
      mocks.mutate.mockRejectedValue(
        new CanonicalError(status, "Review the latest saved version."),
      );
      const response = await action(args(new URLSearchParams(submitted)));
      expect(response.init?.status).toBe(status);
      expect(response.data).toMatchObject({ submitted, success: null });
      expect(new Headers(response.init?.headers).get("Cache-Control")).toBe(
        "private, no-store",
      );
    },
  );
  it("U03 draft never reflects unauthenticated, unparsed or successful submissions", async () => {
    const submitted = new URLSearchParams({
      operation: "edit",
      expectedVersionId: id(2),
      idempotencyKey: id(3),
      factId: id(4),
      value: "Retained candidate draft",
    });
    mocks.user.mockResolvedValue(null);
    expect((await action(args(submitted))).data).not.toHaveProperty(
      "submitted",
    );
    mocks.user.mockResolvedValue({ id: id(5) });
    const malformed = new URLSearchParams(submitted);
    malformed.append("ownerId", id(99));
    expect((await action(args(malformed))).data).not.toHaveProperty(
      "submitted",
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect((await action(args(submitted))).data).not.toHaveProperty(
      "submitted",
    );
  });
  it("rejects invalid read pagination before repository access", async () => {
    await expect(
      loader({
        request: new Request("https://example.test/canonical?offset=1.5"),
        params: { id: id(1) },
      }),
    ).rejects.toMatchObject({ init: { status: 422 } });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("does not accept JSON or silently normalize a supplied correction", async () => {
    await expect(
      readCanonicalForm(
        new Request("https://example.test/canonical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const values = new URLSearchParams({
      operation: "edit",
      expectedVersionId: id(2),
      idempotencyKey: id(3),
      factId: id(4),
      value: " padded ",
    });
    expect((await action(args(values))).init?.status).toBe(422);
  });
  it("U03 key loader supplies distinct fresh operation-target review keys", async () => {
    mocks.load.mockResolvedValue({
      current: {
        document: {
          facts: [{ id: id(4) }, { id: id(6) }],
          sections: [{ id: id(7) }, { id: id(8) }],
        },
      },
      history: [],
    });
    const first = await loader({
      request: new Request("https://example.test/canonical"),
      params: { id: id(1) },
    });
    const second = await loader({
      request: new Request("https://example.test/canonical"),
      params: { id: id(1) },
    });
    expect(first.data).toHaveProperty("retainedKeys");
    const firstKeys = (first.data as { retainedKeys: Record<string, string> })
      .retainedKeys;
    const secondKeys = (second.data as { retainedKeys: Record<string, string> })
      .retainedKeys;
    expect(Object.keys(firstKeys).sort()).toEqual(
      [
        `edit:${id(4)}`,
        `edit:${id(6)}`,
        `rename_section:${id(7)}`,
        `rename_section:${id(8)}`,
      ].sort(),
    );
    const allKeys = [...Object.values(firstKeys), ...Object.values(secondKeys)];
    expect(new Set(allKeys).size).toBe(8);
    for (const key of allKeys)
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
  });
  it.each(["edit", "rename_section"] as const)(
    "U03 resolution returns a separate authenticated parsed %s resolution on success",
    async (operation) => {
      const command: Record<string, string> =
        operation === "edit"
          ? {
              operation,
              expectedVersionId: id(2),
              idempotencyKey: id(3),
              factId: id(4),
              value: "Resolved correction",
            }
          : {
              operation,
              expectedVersionId: id(2),
              idempotencyKey: id(3),
              sectionId: id(4),
              value: "Resolved title",
            };
      const result = await action(args(new URLSearchParams(command)));
      expect(result.init?.status ?? 200).toBe(200);
      expect(result.data).toHaveProperty("resolved", command);
      expect(result.data).not.toHaveProperty("submitted");
      expect(new Headers(result.init?.headers).get("Cache-Control")).toBe(
        "private, no-store",
      );
      const unrelated = await action(args());
      expect(unrelated.data).not.toHaveProperty("resolved");
      mocks.user.mockResolvedValueOnce(null);
      expect(
        (await action(args(new URLSearchParams(command)))).data,
      ).not.toHaveProperty("resolved");
      expect(
        (
          await action(
            args(new URLSearchParams({ ...command, ownerId: id(9) })),
          )
        ).data,
      ).not.toHaveProperty("resolved");
    },
  );
  it("preserves private SSR headers and refreshed cookies", () => {
    const result = new Headers(
      headers({
        parentHeaders: new Headers({
          "Content-Security-Policy": "default-src 'self'",
        }),
        loaderHeaders: new Headers({
          "Set-Cookie": "loader=refreshed; HttpOnly",
        }),
        actionHeaders: new Headers({
          "Set-Cookie": "action=refreshed; HttpOnly",
        }),
        errorHeaders: new Headers({ "Cache-Control": "public" }),
      }),
    );
    expect(result.get("Cache-Control")).toBe("private, no-store");
    expect(result.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(result.getSetCookie()).toHaveLength(2);
  });
  describe("grouped query consumer", () => {
    beforeEach(() => {
      mocks.correctionsEnabled = true;
    });
    it("adds owned grouped metadata without replacing the existing loader model or generated keys", async () => {
      const workspace = {
        schemaVersion: "grouped-original-workspace/1.0.0",
        state: "unavailable",
        reason: "unavailable",
        scoringEligible: false,
      };
      mocks.groupedLoad.mockResolvedValue(workspace);
      const response = await loader({
        request: new Request("https://example.test/canonical"),
        params: { id: id(1) },
      });
      expect(response.data).toMatchObject({
        current: null,
        history: [],
        groupedOriginal: workspace,
        groupedOwnerId: id(5),
      });
      expect(response.data.formKey).toMatch(/^[a-f0-9-]{36}$/);
      expect(response.data.restoreKey).toMatch(/^[a-f0-9-]{36}$/);
      expect(mocks.groupedLoad).toHaveBeenCalledWith(undefined, id(1), id(5));
    });
    it("uses the strict single-consumption preview parser and authenticated server call", async () => {
      const full = groupedCommand();
      const command = {
        schemaVersion: full.schemaVersion,
        operation: full.operation,
        binding: full.binding,
        expected: full.expected,
        selectedGroupIds: full.selectedGroupIds,
        unselectedDisposition: full.unselectedDisposition,
      };
      const preview = {
        schemaVersion: "grouped-original-preview/1.0.0",
        state: "preview",
        command: groupedCommand(),
        groups: [],
        canCommit: false,
        scoringEligible: false,
      };
      mocks.groupedPreview.mockResolvedValue(preview);
      const request = groupedArgs(
        new URLSearchParams({ command: JSON.stringify(command) }),
        "grouped=preview",
      );
      const response = await action(request);
      expect(response.data).toEqual({
        error: null,
        success: null,
        grouped: { kind: "preview", preview },
      });
      expect(mocks.groupedPreview).toHaveBeenCalledWith(
        undefined,
        id(1),
        id(5),
        command,
      );
      expect(request.request.bodyUsed).toBe(true);
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.groupedCommit).not.toHaveBeenCalled();
    });
    it.each([
      "grouped=wrong",
      "grouped=preview&grouped=commit",
      "grouped=commit&grouped=commit",
    ])("rejects selector %s without a fallback write", async (selector) => {
      const response = await action(
        groupedArgs(
          new URLSearchParams({ command: JSON.stringify(groupedCommand()) }),
          selector,
        ),
      );
      expect(response.init?.status).toBe(422);
      expect(response.data).toMatchObject({
        grouped: { kind: "error", reason: "invalid_command" },
      });
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.groupedCommit).not.toHaveBeenCalled();
      expect(mocks.groupedPreview).not.toHaveBeenCalled();
    });
    it.each([
      "missing_ack",
      "wrong_ack",
      "duplicate_command",
      "duplicate_json",
      "oversized",
      "unknown_field",
    ])("rejects grouped %s before dispatch", async (mode) => {
      let command = JSON.stringify(groupedCommand());
      if (mode === "duplicate_json")
        command = command.replace(
          '"acknowledgement":true',
          '"acknowledgement":true,"acknowledgement":true',
        );
      if (mode === "oversized") command = "x".repeat(16_385);
      const body = new URLSearchParams({ command });
      if (mode !== "missing_ack")
        body.set(
          "relationshipAcknowledgement",
          mode === "wrong_ack" ? "true" : "accepted",
        );
      if (mode === "duplicate_command") body.append("command", command);
      if (mode === "unknown_field") body.set("ownerId", id(5));
      const response = await action(groupedArgs(body));
      expect(response.init?.status).toBe(422);
      expect(response.data).not.toHaveProperty("grouped.submitted");
      expect(mocks.groupedCommit).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
    });
    it.each(["retry_exact", "review_again", "unavailable"] as const)(
      "retains the exact parsed original command with %s failure disposition",
      async (recovery) => {
        const command = groupedCommand();
        mocks.groupedCommit.mockRejectedValue(
          new GroupedOriginalError(
            recovery === "review_again" ? "conflict" : "invalid_result",
            recovery,
            recovery === "review_again" ? 409 : 503,
          ),
        );
        const response = await action(
          groupedArgs(
            new URLSearchParams({
              command: JSON.stringify(command),
              relationshipAcknowledgement: "accepted",
            }),
          ),
        );
        expect(response.data).toMatchObject({
          grouped: { kind: "error", recovery, submitted: command },
          success: null,
        });
        expect(mocks.groupedCommit).toHaveBeenCalledWith(
          undefined,
          id(1),
          id(5),
          command,
          expect.stringMatching(/^[a-f0-9-]{36}$/),
        );
        expect(new Headers(response.init?.headers).get("Cache-Control")).toBe(
          "private, no-store",
        );
        expect(mocks.mutate).not.toHaveBeenCalled();
      },
    );
    it("retains an original command after an unexpected adapter exception without exposing details", async () => {
      mocks.groupedCommit.mockRejectedValue(
        Error("synthetic hidden DB detail"),
      );
      const command = groupedCommand();
      const response = await action(
        groupedArgs(
          new URLSearchParams({
            command: JSON.stringify(command),
            relationshipAcknowledgement: "accepted",
          }),
        ),
      );
      expect(response.init?.status).toBe(503);
      expect(response.data).toMatchObject({
        grouped: {
          reason: "unavailable",
          recovery: "retry_exact",
          submitted: command,
        },
      });
      expect(JSON.stringify(response.data)).not.toContain("hidden DB detail");
    });
    it.each([false, true])(
      "returns the actual applied receipt with idempotent=%s without rebasing the resolved command",
      async (idempotent) => {
        const command = groupedCommand();
        const receipt = {
          schemaVersion: "grouped-original-result/1.0.0",
          status: "applied",
          versionId: id(20),
          revision: 1,
          batchId: id(21),
          associationRevision: 1,
          associationHeadId: id(21),
          idempotent,
          scoringEligible: false,
        };
        mocks.groupedCommit.mockResolvedValue(receipt);
        const response = await action(
          groupedArgs(
            new URLSearchParams({
              command: JSON.stringify(command),
              relationshipAcknowledgement: "accepted",
            }),
          ),
        );
        expect(response.data).toMatchObject({
          error: null,
          grouped: { kind: "applied", receipt, resolved: command },
        });
        if (!("success" in response.data))
          throw Error("EXPECTED_GROUPED_RESULT");
        if (idempotent)
          expect(response.data.success).toContain("already saved");
      },
    );
    it("keeps disabled grouped writes closed before parsing or privileged clients", async () => {
      mocks.correctionsEnabled = false;
      const response = await action(
        groupedArgs(new URLSearchParams({ command: "invalid" })),
      );
      expect(response.init?.status).toBe(404);
      expect(response.data).toMatchObject({
        grouped: { reason: "disabled", recovery: "unavailable" },
      });
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.groupedCommit).not.toHaveBeenCalled();
    });
    it("revalidates ambiguous commit errors/applied receipts while nonmutating previews avoid revalidation", () => {
      const base = {
        currentUrl: new URL("https://example.test/canonical"),
        nextUrl: new URL("https://example.test/canonical"),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: false,
      };
      expect(
        shouldRevalidate({
          ...base,
          actionStatus: 503,
          actionResult: { grouped: { kind: "error" } },
        }),
      ).toBe(true);
      expect(
        shouldRevalidate({
          ...base,
          actionResult: { grouped: { kind: "applied" } },
        }),
      ).toBe(true);
      expect(
        shouldRevalidate({
          ...base,
          defaultShouldRevalidate: true,
          actionResult: { grouped: { kind: "preview" } },
        }),
      ).toBe(false);
    });
  });
});

function regroupCommand() {
  const source = readFileSync(
    new URL("./canonical-entry-regroup-commands.test.ts", import.meta.url),
    "utf8",
  );
  const marker = "export const NODE_REGROUP_LITERAL_JSON = String.raw`";
  const oracle = JSON.parse(source.split(marker)[1].split("`;")[0]);
  return CanonicalEntryRegroupCommandSchema.parse({
    ...oracle.request,
    acknowledgement: true,
    previewHash: oracle.previewHash,
    idempotencyKey: id(90),
  });
}
describe("canonical whole-entry regroup dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.correctionsEnabled = true;
    mocks.user.mockResolvedValue({ id: id(5) });
    mocks.regroupPreview.mockReset();
    mocks.regroupResume.mockReset();
    mocks.regroupCommit.mockReset();
  });
  it.each([
    "regroup=wrong",
    "regroup=preview&regroup=resume",
    "regroup=commit&regroup=commit",
    "grouped=preview&regroup=commit",
  ])(
    "rejects duplicate or mixed intent %s without consuming the body",
    async (selector) => {
      const request = groupedArgs(
        new URLSearchParams({ command: "invalid" }),
        selector,
      );
      const result = await action(request);
      expect(result.init?.status).toBe(422);
      expect(request.request.bodyUsed).toBe(false);
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.regroupCommit).not.toHaveBeenCalled();
      expect(mocks.groupedCommit).not.toHaveBeenCalled();
    },
  );
  it.each(["preview", "resume"] as const)(
    "forwards exact %s metadata without a save acknowledgement",
    async (mode) => {
      const command = regroupCommand();
      const request = {
        schemaVersion: command.schemaVersion,
        operation: command.operation,
        binding: command.binding,
        base: command.base,
        expected: command.expected,
        selections: command.selections,
        unselectedDisposition: command.unselectedDisposition,
      };
      const payload = mode === "preview" ? request : command;
      const preview = {
        state: mode === "preview" ? "preview" : "retained",
        command,
      };
      (mode === "preview"
        ? mocks.regroupPreview
        : mocks.regroupResume
      ).mockResolvedValue(preview);
      const result = await action(
        groupedArgs(
          new URLSearchParams({ command: JSON.stringify(payload) }),
          `regroup=${mode}`,
        ),
      );
      expect(result.data).toMatchObject({
        error: null,
        regroup: { kind: mode === "preview" ? "preview" : "retained", preview },
      });
      expect(
        mode === "preview" ? mocks.regroupPreview : mocks.regroupResume,
      ).toHaveBeenCalledWith(undefined, id(1), id(5), payload);
      expect(mocks.regroupCommit).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(new Headers(result.init?.headers).get("Cache-Control")).toBe(
        "private, no-store",
      );
    },
  );
  it.each([undefined, "wrong", "relationship"])(
    "requires the distinct whole-entry acknowledgement %s",
    async (ack) => {
      const body = new URLSearchParams({
        command: JSON.stringify(regroupCommand()),
      });
      if (ack === "relationship")
        body.set("relationshipAcknowledgement", "accepted");
      else if (ack !== undefined) body.set("wholeEntryAcknowledgement", ack);
      const result = await action(groupedArgs(body, "regroup=commit"));
      expect(result.init?.status).toBe(422);
      expect(mocks.regroupCommit).not.toHaveBeenCalled();
    },
  );
  it("retains the exact original command on ambiguous adapter errors and returns safe private feedback", async () => {
    const command = regroupCommand();
    mocks.regroupCommit.mockRejectedValue(new Error("private SQL detail"));
    const result = await action(
      groupedArgs(
        new URLSearchParams({
          command: JSON.stringify(command),
          wholeEntryAcknowledgement: "accepted",
        }),
        "regroup=commit",
      ),
    );
    expect(result.init?.status).toBe(503);
    expect(result.data).toMatchObject({
      regroup: { kind: "error", recovery: "retry_exact", submitted: command },
    });
    expect(JSON.stringify(result.data)).not.toContain("private SQL detail");
    expect(mocks.regroupCommit).toHaveBeenCalledWith(
      undefined,
      id(1),
      id(5),
      command,
      expect.any(String),
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("returns the actual old saved receipt with the unchanged resolved command", async () => {
    const command = regroupCommand(),
      receipt = { versionId: id(91), idempotent: true };
    mocks.regroupCommit.mockResolvedValue(receipt);
    const result = await action(
      groupedArgs(
        new URLSearchParams({
          command: JSON.stringify(command),
          wholeEntryAcknowledgement: "accepted",
        }),
        "regroup=commit",
      ),
    );
    expect(result.data).toMatchObject({
      regroup: { kind: "applied", receipt, resolved: command },
    });
    if (!("success" in result.data)) throw Error("EXPECTED_REGROUP_RESULT");
    expect(result.data.success).toContain("already saved");
  });
  it("keeps disabled writes closed before reading metadata or creating privileged clients", async () => {
    mocks.correctionsEnabled = false;
    const request = groupedArgs(
      new URLSearchParams({ command: "invalid" }),
      "regroup=commit",
    );
    const result = await action(request);
    expect(result.init?.status).toBe(404);
    expect(request.request.bodyUsed).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.regroupCommit).not.toHaveBeenCalled();
  });
  it.each(["preview", "retained", "applied", "error"])(
    "revalidates only mutating or failed regroup outcomes %s",
    (kind) => {
      expect(
        shouldRevalidate({
          currentUrl: new URL("https://example.test/canonical"),
          nextUrl: new URL("https://example.test/canonical"),
          currentParams: {},
          nextParams: {},
          defaultShouldRevalidate: true,
          actionResult: { regroup: { kind } },
        }),
      ).toBe(kind === "applied" || kind === "error");
    },
  );
});
