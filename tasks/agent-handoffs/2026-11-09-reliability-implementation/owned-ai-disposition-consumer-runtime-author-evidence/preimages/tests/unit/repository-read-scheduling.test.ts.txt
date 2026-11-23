import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { loadCanonical } from "../../app/lib/server/canonical-repository";
import { loadJobRequirements } from "../../app/lib/server/job-requirement-repository";
import {
  applyAuthoring,
  loadAuthoring,
} from "../../app/lib/server/authoring-repository";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";
import { scoreFixture } from "../fixtures/scoring-v2";

type Result = { data: unknown; error: unknown };
type Read = {
  table: string;
  columns: string;
  filters: Record<string, unknown>;
};
const ok = (data: unknown): Result => ({ data, error: null });
function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(
  override?: (read: Read) => Result | Promise<Result> | undefined,
) {
  const f = scoreFixture(),
    doc = f.canonical,
    req = f.requirements;
  const reads: Read[] = [];
  const history = {
    id: doc.versionId,
    parent_version_id: doc.parentVersionId,
    revision: 1,
    created_at: doc.createdAt,
  };
  const analysisRow = {
    id: req.analysisId,
    job_id: req.jobId,
    owner_id: doc.ownerId,
    organization_id: doc.organizationId,
    resume_version_id: f.evidence.sourceId,
  };
  const sourceRow = {
    id: f.evidence.sourceId,
    resume_id: doc.resumeId,
    owner_id: doc.ownerId,
    organization_id: doc.organizationId,
    active_resume: {
      id: doc.resumeId,
      owner_id: doc.ownerId,
      organization_id: doc.organizationId,
      status: "active",
    },
  };
  const head = ok({ version_id: doc.versionId, revision: 1 });
  const jobHead = ok({ id: req.id, revision: 1 });
  const client = {
    from(table: string) {
      const read: Read = { table, columns: "", filters: {} };
      const query = {
        select(columns: string) {
          read.columns = columns;
          return query;
        },
        eq(key: string, value: unknown) {
          read.filters[key] = value;
          return query;
        },
        neq() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        range() {
          return query;
        },
        maybeSingle() {
          return query;
        },
        then(yes: (value: Result) => unknown, no: (error: unknown) => unknown) {
          reads.push(read);
          const replacement = override?.(read);
          if (replacement) return Promise.resolve(replacement).then(yes, no);
          let result: Result;
          if (table === "analyses") result = ok(analysisRow);
          else if (table === "resume_versions") result = ok(sourceRow);
          else if (table === "resumes") result = ok({ id: doc.resumeId });
          else if (table === "memberships")
            result = ok({ user_id: doc.ownerId });
          else if (table === "data_requests") result = ok([]);
          else if (table === "canonical_resume_heads") result = head;
          else if (table === "canonical_resume_versions")
            result =
              read.columns === "*"
                ? ok({
                    ...history,
                    resume_id: doc.resumeId,
                    owner_id: doc.ownerId,
                    organization_id: doc.organizationId,
                    source_resume_version_id: f.evidence.sourceId,
                    content: doc,
                  })
                : ok([history]);
          else if (table === "jobs")
            result = ok({
              id: req.jobId,
              title: "Software Engineer",
              description: req.sourceText,
              owner_id: doc.ownerId,
              organization_id: doc.organizationId,
            });
          else if (table === "job_requirement_versions")
            result =
              read.columns === "*"
                ? ok({
                    id: req.id,
                    parent_version_id: req.parentVersionId,
                    revision: 1,
                    content: req,
                  })
                : read.columns === "id,revision"
                  ? jobHead
                  : ok([
                      {
                        id: req.id,
                        parent_version_id: req.parentVersionId,
                        revision: 1,
                        created_at: req.createdAt,
                      },
                    ]);
          else if (table === "authoring_events") result = ok([]);
          else throw Error("Unexpected table: " + table);
          return Promise.resolve(result).then(yes, no);
        },
      };
      return query;
    },
    rpc: vi.fn(),
  };
  const model = {
    canonical: { versionId: doc.versionId, headId: doc.versionId, revision: 1 },
    diagnostics: buildScoreDiagnostics({
      evidence: f.evidence,
      canonical: doc,
      requirements: req,
    }),
  } as Parameters<typeof loadAuthoring>[3];
  return {
    ...f,
    client: client as unknown as Parameters<typeof loadCanonical>[0],
    rawClient: client,
    reads,
    analysisRow,
    sourceRow,
    head,
    jobHead,
    model,
  };
}

it("starts known canonical version and history reads while its head is pending", async () => {
  const gate = held<Result>();
  const f = fixture((r) =>
    r.table === "canonical_resume_heads" ? gate.promise : undefined,
  );
  const pending = loadCanonical(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { versionId: f.canonical.versionId },
  );
  try {
    await setImmediate();
    expect(
      f.reads
        .filter((r) => r.table === "canonical_resume_versions")
        .map((r) => r.columns),
    ).toEqual(
      expect.arrayContaining(["*", "id,parent_version_id,revision,created_at"]),
    );
  } finally {
    gate.resolve(f.head);
    await pending;
  }
});

it("starts known requirement version and history reads while its head is pending", async () => {
  const gate = held<Result>();
  const f = fixture((r) =>
    r.table === "job_requirement_versions" && r.columns === "id,revision"
      ? gate.promise
      : undefined,
  );
  const pending = loadJobRequirements(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { versionId: f.requirements.id },
  );
  try {
    await setImmediate();
    expect(
      f.reads
        .filter((r) => r.table === "job_requirement_versions")
        .map((r) => r.columns),
    ).toEqual(
      expect.arrayContaining(["*", "id,revision,parent_version_id,created_at"]),
    );
  } finally {
    gate.resolve(f.jobHead);
    await pending;
  }
});

it("starts authoring events while canonical authorization/head loading is pending", async () => {
  const gate = held<Result>();
  const f = fixture((r) =>
    r.table === "canonical_resume_heads" ? gate.promise : undefined,
  );
  const pending = loadAuthoring(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    f.model,
  );
  try {
    await setImmediate();
    expect(f.reads.some((r) => r.table === "authoring_events")).toBe(true);
  } finally {
    gate.resolve(f.head);
    await pending;
  }
});

it.each(["foreign", "deleted"])(
  "keeps %s canonical scope closed before version/history reads",
  async (mode) => {
    const f = fixture((r) =>
      mode === "foreign" && r.table === "analyses"
        ? ok(null)
        : mode === "deleted" && r.table === "data_requests"
          ? ok([{ id: randomUUID() }])
          : undefined,
    );
    await expect(
      loadCanonical(f.client, f.requirements.analysisId, f.canonical.ownerId, {
        versionId: f.canonical.versionId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.reads.some((r) => r.table === "canonical_resume_versions")).toBe(
      false,
    );
  },
);

it("keeps the head failure ahead of a rejected speculative version read", async () => {
  const head = held<Result>(),
    version = held<Result>();
  const f = fixture((r) =>
    r.table === "canonical_resume_heads"
      ? head.promise
      : r.table === "canonical_resume_versions" && r.columns === "*"
        ? version.promise
        : undefined,
  );
  const pending = loadCanonical(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { versionId: f.canonical.versionId },
  );
  const assertion = expect(pending).rejects.toMatchObject({ status: 503 });
  await setImmediate();
  if (
    f.reads.some(
      (r) => r.table === "canonical_resume_versions" && r.columns === "*",
    )
  )
    version.reject(Error("speculative version failed"));
  else version.resolve(ok(null));
  head.resolve({ data: null, error: Error("head unavailable") });
  await assertion;
  await setImmediate(); // Vitest also rejects any unhandled promise rejection.
});

it("keeps canonical conflict precedence and handles a concurrent event rejection", async () => {
  const events = held<Result>();
  const f = fixture((r) =>
    r.table === "authoring_events" ? events.promise : undefined,
  );
  const pending = loadAuthoring(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { ...f.model, canonical: { ...f.model.canonical, headId: randomUUID() } },
  );
  const assertion = expect(pending).rejects.toMatchObject({ status: 409 });
  await setImmediate();
  if (f.reads.some((r) => r.table === "authoring_events"))
    events.reject(Error("events unavailable"));
  else events.resolve(ok([]));
  await assertion;
  await setImmediate();
});

it("preserves historical authoring as read-only", async () => {
  const headId = randomUUID();
  const f = fixture((r) =>
    r.table === "canonical_resume_heads"
      ? ok({ version_id: headId, revision: 2 })
      : undefined,
  );
  const result = await loadAuthoring(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { ...f.model, canonical: { ...f.model.canonical, headId } },
  );
  expect(result.editable).toBe(false);
  expect(result.document.versionId).toBe(f.canonical.versionId);
});

it("preserves a valid idempotent receipt even after the head advances", async () => {
  const idempotencyKey = randomUUID(),
    headId = randomUUID();
  const f = fixture((r) =>
    r.table === "canonical_resume_heads"
      ? ok({ version_id: headId, revision: 2 })
      : r.table === "authoring_events"
        ? ok({
            command: expectedWire,
            result: {
              status: "applied",
              versionId: headId,
              revision: 2,
              eventId: randomUUID(),
              action: "edit",
              idempotent: false,
            },
          })
        : undefined,
  );
  const target = f.canonical.facts.find(
    (fact) => fact.type === "contribution",
  )!;
  const expectedWire: unknown = {
    action: "edit",
    expectedVersionId: f.canonical.versionId,
    idempotencyKey,
    targetFactId: target.id,
    sectionId: null,
    value: "Neutral corrected contribution",
    questionKind: null,
    pattern: null,
    targetVersionId: null,
    confirmation: false,
    patch: null,
  };
  await expect(
    applyAuthoring(
      f.client,
      f.requirements.analysisId,
      f.canonical.ownerId,
      {
        action: "edit",
        expectedVersionId: f.canonical.versionId,
        idempotencyKey,
        targetFactId: target.id,
        value: "Neutral corrected contribution",
      },
      "scheduling-retry",
    ),
  ).resolves.toMatchObject({ idempotent: true, versionId: headId });
  expect(f.rawClient.rpc).not.toHaveBeenCalled();
});

it("keeps a history rejection ahead of concurrent requirement read failures", async () => {
  const history = held<Result>(),
    head = held<Result>(),
    row = held<Result>();
  const f = fixture((r) =>
    r.table !== "job_requirement_versions"
      ? undefined
      : r.columns === "*"
        ? row.promise
        : r.columns === "id,revision"
          ? head.promise
          : history.promise,
  );
  const pending = loadJobRequirements(
    f.client,
    f.requirements.analysisId,
    f.canonical.ownerId,
    { versionId: f.requirements.id },
  );
  const assertion = expect(pending).rejects.toThrow("history unavailable");
  await setImmediate();
  history.reject(Error("history unavailable"));
  if (
    f.reads.some(
      (r) =>
        r.table === "job_requirement_versions" && r.columns === "id,revision",
    )
  )
    head.reject(Error("head unavailable"));
  else head.resolve(f.jobHead);
  if (
    f.reads.some(
      (r) => r.table === "job_requirement_versions" && r.columns === "*",
    )
  )
    row.reject(Error("row unavailable"));
  else row.resolve(ok(null));
  await assertion;
  await setImmediate();
});

it("retains requirement immutable-row binding validation", async () => {
  const f = fixture((r) =>
    r.table === "job_requirement_versions" && r.columns === "*"
      ? ok({
          id: randomUUID(),
          parent_version_id: null,
          revision: 1,
          content: f.requirements,
        })
      : undefined,
  );
  await expect(
    loadJobRequirements(
      f.client,
      f.requirements.analysisId,
      f.canonical.ownerId,
      { versionId: f.requirements.id },
    ),
  ).rejects.toMatchObject({ status: 422 });
});

it.each(["foreign", "deleted"])(
  "keeps %s job scope closed before requirement-version reads",
  async (mode) => {
    const f = fixture((r) =>
      mode === "foreign" && r.table === "analyses"
        ? ok(null)
        : mode === "deleted" && r.table === "data_requests"
          ? ok([{ id: randomUUID() }])
          : undefined,
    );
    await expect(
      loadJobRequirements(
        f.client,
        f.requirements.analysisId,
        f.canonical.ownerId,
        {
          versionId: f.requirements.id,
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.reads.some((r) => r.table === "job_requirement_versions")).toBe(
      false,
    );
  },
);

it.each(["canonical", "requirements"] as const)(
  "authorizes %s in two query waves without a separate parent request",
  async (kind) => {
    const analysis = held<Result>(),
      source = held<Result>();
    const f = fixture((read) =>
      read.table === "analyses"
        ? analysis.promise
        : read.table === "resume_versions"
          ? source.promise
          : undefined,
    );
    const pending =
      kind === "canonical"
        ? loadCanonical(
            f.client,
            f.requirements.analysisId,
            f.canonical.ownerId,
          )
        : loadJobRequirements(
            f.client,
            f.requirements.analysisId,
            f.canonical.ownerId,
          );
    try {
      await setImmediate();
      expect(f.reads.map((read) => read.table)).toEqual(["analyses"]);
      analysis.resolve(ok(f.analysisRow));
      await setImmediate();
      expect(f.reads.map((read) => read.table)).toEqual(
        expect.arrayContaining([
          "resume_versions",
          "memberships",
          "data_requests",
          ...(kind === "requirements" ? ["jobs"] : []),
        ]),
      );
      expect(
        f.reads.some(
          (read) =>
            read.table === "canonical_resume_versions" ||
            read.table === "job_requirement_versions",
        ),
      ).toBe(false);
    } finally {
      analysis.resolve(ok(f.analysisRow));
      source.resolve(ok(f.sourceRow));
      await pending;
    }
    const sourceRead = f.reads.find(
      (read) => read.table === "resume_versions",
    )!;
    expect(sourceRead.columns).toContain(
      "active_resume:resumes!resume_versions_resume_id_fkey(",
    );
    expect(sourceRead.columns).not.toContain("!inner");
    expect(sourceRead.filters).toEqual({
      id: f.evidence.sourceId,
      owner_id: f.canonical.ownerId,
      organization_id: f.canonical.organizationId,
      "active_resume.owner_id": f.canonical.ownerId,
      "active_resume.organization_id": f.canonical.organizationId,
      "active_resume.status": "active",
    });
    expect(f.reads.some((read) => read.table === "resumes")).toBe(false);
  },
);

it.each(["canonical", "requirements"] as const)(
  "closes invalid source or nullable parent scope for %s",
  async (kind) => {
    for (const mismatch of [
      "null source",
      "source id",
      "source owner",
      "source organization",
      "null parent",
      "parent id",
      "parent owner",
      "parent organization",
      "inactive parent",
      "array parent",
    ]) {
      const f = fixture((read) => {
        if (read.table !== "resume_versions") return;
        if (mismatch === "null source") return ok(null);
        const row: Record<string, unknown> = { ...f.sourceRow };
        if (mismatch === "source id") row.id = randomUUID();
        if (mismatch === "source owner") row.owner_id = randomUUID();
        if (mismatch === "source organization")
          row.organization_id = randomUUID();
        if (mismatch === "null parent") row.active_resume = null;
        if (mismatch === "array parent")
          row.active_resume = [f.sourceRow.active_resume];
        if (mismatch.startsWith("parent ") || mismatch === "inactive parent")
          row.active_resume = {
            ...f.sourceRow.active_resume,
            ...(mismatch === "parent id" ? { id: randomUUID() } : {}),
            ...(mismatch === "parent owner" ? { owner_id: randomUUID() } : {}),
            ...(mismatch === "parent organization"
              ? { organization_id: randomUUID() }
              : {}),
            ...(mismatch === "inactive parent" ? { status: "deleted" } : {}),
          };
        return ok(row);
      });
      const pending =
        kind === "canonical"
          ? loadCanonical(
              f.client,
              f.requirements.analysisId,
              f.canonical.ownerId,
            )
          : loadJobRequirements(
              f.client,
              f.requirements.analysisId,
              f.canonical.ownerId,
            );
      await expect(pending, mismatch).rejects.toMatchObject({ status: 404 });
      expect(
        f.reads.some(
          (read) =>
            read.table === "canonical_resume_versions" ||
            read.table === "job_requirement_versions",
        ),
        mismatch,
      ).toBe(false);
    }
  },
);

it.each(["memberships", "data_requests"] as const)(
  "handles a rejected speculative %s read without replacing a foreign-source failure",
  async (table) => {
    const scope = held<Result>(),
      source = held<Result>();
    const f = fixture((read) =>
      read.table === table
        ? scope.promise
        : read.table === "resume_versions"
          ? source.promise
          : undefined,
    );
    const pending = loadCanonical(
      f.client,
      f.requirements.analysisId,
      f.canonical.ownerId,
    );
    const assertion = expect(pending).rejects.toMatchObject({ status: 404 });
    await setImmediate();
    if (f.reads.some((read) => read.table === table))
      scope.reject(Error("scope request rejected"));
    else scope.resolve(ok(null));
    source.resolve(ok({ ...f.sourceRow, organization_id: randomUUID() }));
    await assertion;
    await setImmediate();
  },
);

it.each(["canonical", "requirements"] as const)(
  "keeps membership/deletion guards and scope-error precedence over a missing parent for %s",
  async (kind) => {
    for (const state of [
      "missing membership",
      "deletion",
      "scope error",
      "scope rejection",
    ]) {
      const rejected = Error("scope request rejected");
      const f = fixture((read) => {
        if (state === "scope error" || state === "scope rejection") {
          if (read.table === "resume_versions")
            return ok({ ...f.sourceRow, active_resume: null });
          if (read.table === "memberships")
            return state === "scope error"
              ? { data: null, error: Error("scope database unavailable") }
              : Promise.reject(rejected);
        }
        if (state === "missing membership" && read.table === "memberships")
          return ok(null);
        if (state === "deletion" && read.table === "data_requests")
          return ok([{ id: randomUUID() }]);
      });
      const pending =
        kind === "canonical"
          ? loadCanonical(
              f.client,
              f.requirements.analysisId,
              f.canonical.ownerId,
            )
          : loadJobRequirements(
              f.client,
              f.requirements.analysisId,
              f.canonical.ownerId,
            );
      if (state === "scope rejection")
        await expect(pending).rejects.toBe(rejected);
      else
        await expect(pending).rejects.toMatchObject({
          status: state === "scope error" ? 503 : 404,
        });
    }
  },
);
