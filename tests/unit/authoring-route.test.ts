import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  user: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  read: vi.fn(),
  apply: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    AUTHORING_ENABLED: mocks.enabled,
    APP_ORIGIN: "https://example.test",
  }),
}));
vi.mock("../../app/lib/server/auth", () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
  createSupabaseServerClient: mocks.server,
}));
vi.mock("../../app/lib/server/authoring-repository", () => ({
  readAuthoringForm: mocks.read,
  applyAuthoring: mocks.apply,
  previewClarification: mocks.preview,
}));
vi.mock("../../app/routes/analysis.score", () => ({
  loader: vi.fn(),
  headers: vi.fn(),
  meta: vi.fn(),
  ErrorBoundary: vi.fn(),
  default: vi.fn(),
}));
import { action } from "../../app/routes/analysis.author";
import { CanonicalError } from "../../app/lib/server/canonical-repository";
const status = (r: Awaited<ReturnType<typeof action>>) =>
  r instanceof Response ? r.status : r.init?.status;
const args = (origin = "https://example.test", method = "POST") => ({
  request: new Request("https://example.test/analysis/id/author", {
    method,
    headers: { Origin: origin },
  }),
  params: { id: "id" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.read.mockResolvedValue({
    action: "edit",
    targetFactId: "fact",
    value: "Retained correction",
    expectedVersionId: "version",
    idempotencyKey: "key",
  });
  mocks.apply.mockResolvedValue({ versionId: "new" });
  mocks.preview.mockResolvedValue({
    schemaVersion: "clarification-preview/1.0.0",
    command: {
      action: "clarify",
      expectedVersionId: "version",
      idempotencyKey: "key",
      targetFactId: "fact",
      questionKind: "result",
      value: "Synthetic answer",
    },
    beforeValue: "Original contribution",
    reviewedValue: "Original contribution\nResult: Synthetic answer",
    reviewedValueHash: "a".repeat(64),
  });
});
it("authoring is default-off and rejects unsupported methods", async () => {
  mocks.enabled = false;
  expect(status(await action(args()))).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.enabled = true;
  expect(status(await action(args("https://example.test", "PUT")))).toBe(405);
});
it("rejects foreign origin and missing sign-in before privileged reads", async () => {
  expect(status(await action(args("https://foreign.test")))).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue(null);
  expect(status(await action(args()))).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("passes authenticated identity and redirects to the recomputed analysis after save", async () => {
  const r = await action(args());
  expect(r).toBeInstanceOf(Response);
  expect((r as Response).headers.get("Location")).toBe("/analysis/id/score");
  expect(mocks.apply).toHaveBeenCalledWith(
    undefined,
    "id",
    "owner",
    expect.objectContaining({ value: "Retained correction" }),
    expect.any(String),
  );
});
it.each([409, 503])(
  "preserves correction and idempotency for failure %s",
  async (status) => {
    mocks.apply.mockRejectedValue(
      new CanonicalError(status as 409, "Safe save failure"),
    );
    const r = await action(args());
    expect(r).toMatchObject({
      data: {
        error: "Safe save failure",
        submitted: expect.objectContaining({
          value: "Retained correction",
          idempotencyKey: "key",
          expectedVersionId: "version",
        }),
      },
      init: { status },
    });
    expect(
      new Headers((r as { init: { headers: Headers } }).init.headers).get(
        "Cache-Control",
      ),
    ).toContain("no-store");
  },
);

const clarification = (action = "preview_clarification") => ({
  action,
  expectedVersionId: "version",
  idempotencyKey: "key",
  targetFactId: "fact",
  questionKind: "result",
  value: "Synthetic answer",
});

it("returns a private native-POST full-value preview without calling mutation or redirecting", async () => {
  mocks.read.mockResolvedValue(clarification());
  const r = await action(args());
  expect(r).not.toBeInstanceOf(Response);
  expect(r).toMatchObject({
    data: {
      error: null,
      submitted: clarification(),
      preview: {
        schemaVersion: "clarification-preview/1.0.0",
        beforeValue: "Original contribution",
        reviewedValue: "Original contribution\nResult: Synthetic answer",
        reviewedValueHash: "a".repeat(64),
      },
    },
  });
  expect(mocks.preview).toHaveBeenCalledWith(
    undefined,
    "id",
    "owner",
    clarification(),
  );
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(
    new Headers((r as { init: { headers: Headers } }).init.headers).get(
      "Cache-Control",
    ),
  ).toContain("no-store");
});

it("keeps preview behind the same feature, method, origin and authentication guards", async () => {
  mocks.read.mockResolvedValue(clarification());
  mocks.enabled = false;
  expect(status(await action(args()))).toBe(404);
  mocks.enabled = true;
  expect(status(await action(args("https://example.test", "GET")))).toBe(405);
  expect(status(await action(args("https://foreign.test")))).toBe(403);
  mocks.user.mockResolvedValue(null);
  expect(status(await action(args()))).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});

it("passes review metadata separately from the stable clarification command", async () => {
  const command = { ...clarification("clarify"), confirmation: true };
  mocks.read.mockResolvedValue({
    ...command,
    reviewedValueHash: "a".repeat(64),
  });
  const r = await action(args());
  expect(r).toBeInstanceOf(Response);
  expect((r as Response).headers.get("Location")).toBe(
    "/analysis/id/score?focus=fact",
  );
  expect(mocks.apply).toHaveBeenCalledWith(
    undefined,
    "id",
    "owner",
    command,
    expect.any(String),
    "a".repeat(64),
  );
  expect(mocks.preview).not.toHaveBeenCalled();
});

it.each([409, 503])(
  "retains exact clarification review and retry binding on failure %s",
  async (code) => {
    const input = {
      ...clarification("clarify"),
      confirmation: true,
      reviewedValueHash: "a".repeat(64),
    };
    mocks.read.mockResolvedValue(input);
    mocks.apply.mockRejectedValue(
      new CanonicalError(code as 409, "Safe clarification failure"),
    );
    expect(await action(args())).toMatchObject({
      data: { error: "Safe clarification failure", submitted: input },
      init: { status: code },
    });
  },
);

it("retains an unsuccessful preview answer without creating a version", async () => {
  const input = clarification();
  mocks.read.mockResolvedValue(input);
  mocks.preview.mockRejectedValue(
    new CanonicalError(409, "The resume changed."),
  );
  expect(await action(args())).toMatchObject({
    data: { error: "The resume changed.", submitted: input },
    init: { status: 409 },
  });
  expect(mocks.apply).not.toHaveBeenCalled();
});
