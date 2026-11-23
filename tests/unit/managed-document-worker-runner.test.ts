import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runManagedDocumentWorkerVerification } from "../../scripts/run-managed-document-worker-verification";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const packet =
  "310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76";
const ready = {
  schemaVersion: "document-worker-post-replay/1",
  status: "ready",
  workerFencingReady: true,
  pageCountReady: true,
  cleanupReady: true,
  fixtureQueuesEmpty: true,
  externalIsolationProved: false,
};
const cleanup = {
  schemaVersion: "document-worker-post-cleanup/1",
  status: "verified",
  exactFixtureRowsAbsent: true,
  accountingWriteBarrierRetained: true,
  analysisRateBucketRetained: true,
};
const lifecycle = {
  status: "managed_document_worker_journey_passed",
  packet,
  pages: 2,
  recoveredAttempt: 2,
  reviewRouteVerified: true,
  deletionRouteVerified: true,
  exactStorageAbsence: true,
  syntheticAuthAbsence: true,
  retentionMetadata: "separate_verification_required",
};
const receipt = (data: unknown) => ({
  status: 0,
  stdout: JSON.stringify(data) + "\nresumide-document-worker-sql-complete\n",
});

function fixture() {
  const runId = randomUUID();
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  const analysisId = randomUUID();
  const requestId = randomUUID();
  const requestKey = randomUUID();
  const key = `organizations/${randomUUID()}/resumes/${randomUUID()}/versions/${randomUUID()}.pdf`;
  const url = "https://synthetic-worker.supabase.co";
  const directory = `/tmp/resumide-managed-${runId}`;
  const environment = {
    PATH: "/usr/bin",
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SECRET_KEY: "test-admin-key",
    MANAGED_DB_PASSWORD: "test-db-password",
    MANAGED_DB_CA_FILE: "/etc/hosts",
    MANAGED_DB_APPROVAL: JSON.stringify({
      schemaVersion: "managed-db-document-worker-approval/1",
      purpose: "cr-a01-document-worker",
      orderedDigest: packet,
      targetUrl: url,
      connectionHost: "db.synthetic-worker.supabase.co",
      exclusiveSyntheticProject: true,
    }),
    MANAGED_WORKER_AUTHORIZATION:
      "exclusive-project-worker-and-privacy-fixtures",
    MANAGED_WORKER_RUN_ID: runId,
    APP_ORIGIN: "http://127.0.0.1:3110",
    OPENAI_API_KEY: "ambient-key-canary",
    DATABASE_URL: "ambient-db-canary",
  };
  function event(
    name: string,
    fields: Record<string, string> = {},
  ): Record<string, string> {
    return { runId, ownerId, event: name, ...fields };
  }
  const events = [
    event("auth_creation_requested", { label: "owner" }),
    event("auth_creation_requested", {
      label: "outsider",
      ownerId: outsiderId,
    }),
    event("upload_requested", { uploadKey: randomUUID() }),
    event("upload_accepted", { analysisId, storageKey: key }),
    event("deletion_intent", { requestKey }),
    event("deletion_requested", { requestKey, requestId }),
    event("application_and_storage_cleanup_verified", { requestId }),
    event("auth_cleanup_verified"),
    event("auth_cleanup_verified", { ownerId: outsiderId }),
  ];
  dirs.push(directory);
  const runWorker = vi.fn((child: NodeJS.ProcessEnv) => {
    const path = child.MANAGED_TEST_LEDGER!;
    expect(readFileSync(path, "utf8")).toBe("");
    const admission = JSON.parse(
      readFileSync(directory + "/worker-admission.json", "utf8"),
    );
    expect(admission).toEqual({
      targetUrl: url,
      runId,
      orderedDigest: packet,
      authorizedScope: environment.MANAGED_WORKER_AUTHORIZATION,
      postReplay: ready,
    });
    writeFileSync(path, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    return { status: 0, stdout: JSON.stringify(lifecycle) };
  });
  const runSql = vi
    .fn()
    .mockReturnValueOnce(receipt(ready))
    .mockReturnValueOnce(receipt(cleanup));
  return {
    environment,
    events,
    runWorker,
    runSql,
    ownerId,
    outsiderId,
    analysisId,
    requestId,
    key,
    directory,
  };
}

describe("managed document worker verification coordinator", () => {
  it("binds real SQL and the child to one approved fixture and keeps credentials scoped", () => {
    const f = fixture();
    expect(
      runManagedDocumentWorkerVerification(f.environment, f),
    ).toMatchObject({
      status: "verified",
      stage: "complete",
    });
    expect(f.runSql).toHaveBeenCalledTimes(2);
    expect(f.runSql.mock.calls[0][0]).toContain(
      "DOCUMENT_WORKER_TARGET_NOT_EMPTY",
    );
    const sql = f.runSql.mock.calls[1][0];
    expect(sql).toContain(`\\set fixture_owner_id ${f.ownerId}`);
    expect(sql).toContain(`\\set fixture_outsider_id ${f.outsiderId}`);
    expect(sql).toContain(`\\set fixture_analysis_id ${f.analysisId}`);
    expect(sql).toContain(`\\set fixture_request_id ${f.requestId}`);
    expect(sql).toContain(`\\set fixture_storage_key ${f.key}`);
    expect(sql).toContain("read only");
    const child = f.runWorker.mock.calls[0][0];
    expect(child).toMatchObject({
      AI_ENABLED: "false",
      OPENAI_API_KEY: "build-ai-harness-no-live-key",
    });
    expect(child).not.toHaveProperty("MANAGED_DB_PASSWORD");
    expect(child).not.toHaveProperty("DATABASE_URL");
  });

  it("refuses drifted targets and a rollback SQL approval before either SQL or worker execution", () => {
    const f = fixture();
    for (const variation of [
      { SUPABASE_URL: "https://different-worker.supabase.co" },
      {
        MANAGED_DB_APPROVAL: f.environment.MANAGED_DB_APPROVAL.replace(
          "managed-db-document-worker-approval/1",
          "managed-db-sql-approval/1",
        ),
      },
      { APP_ORIGIN: "http://127.0.0.1:3110/" },
    ]) {
      expect(
        runManagedDocumentWorkerVerification(
          { ...f.environment, ...variation },
          f,
        ),
      ).toMatchObject({ status: "unavailable", stage: "admission" });
    }
    expect(f.runSql).not.toHaveBeenCalled();
    expect(f.runWorker).not.toHaveBeenCalled();
  });

  it("refuses a readiness claim without the SQL completion marker", () => {
    const f = fixture();
    f.runSql
      .mockReset()
      .mockReturnValue({ status: 0, stdout: JSON.stringify(ready) });
    expect(
      runManagedDocumentWorkerVerification(f.environment, f),
    ).toMatchObject({ status: "failed", stage: "readiness" });
    expect(f.runWorker).not.toHaveBeenCalled();
  });

  it.each([
    "wrong-owner",
    "different-run",
    "duplicate-cleanup",
    "unbound-request",
    "wrong-deletion-key",
    "invalid-key",
  ])(
    "preserves the private ledger and refuses a %s cleanup scope",
    (reason) => {
      const f = fixture();
      if (reason === "wrong-owner") f.events[3].ownerId = f.outsiderId;
      if (reason === "different-run") f.events[2].runId = randomUUID();
      if (reason === "duplicate-cleanup") f.events[8] = f.events[7];
      if (reason === "unbound-request")
        f.events[6] = { ...f.events[6], requestId: randomUUID() };
      if (reason === "wrong-deletion-key")
        f.events[5].requestKey = randomUUID();
      if (reason === "invalid-key")
        f.events[3] = { ...f.events[3], storageKey: "not/a/bound/source.pdf" };
      expect(
        runManagedDocumentWorkerVerification(f.environment, f),
      ).toMatchObject({ status: "failed", stage: "cleanup" });
      expect(f.runSql).toHaveBeenCalledTimes(1);
      expect(readFileSync(f.directory + "/fixtures.jsonl", "utf8")).not.toBe(
        "",
      );
    },
  );

  it("keeps the failed journey available for reconciliation and does not run cleanup", () => {
    const f = fixture();
    const run = f.runWorker.getMockImplementation()!;
    f.runWorker.mockImplementation((env) => ({ ...run(env), status: 1 }));
    expect(
      runManagedDocumentWorkerVerification(f.environment, f),
    ).toMatchObject({ status: "failed", stage: "lifecycle" });
    expect(f.runSql).toHaveBeenCalledTimes(1);
    expect(
      runManagedDocumentWorkerVerification(f.environment, f),
    ).toMatchObject({ status: "unavailable", stage: "admission" });
  });

  it.each(["reviewRouteVerified", "deletionRouteVerified"] as const)(
    "refuses a lifecycle receipt missing %s",
    (field) => {
      const f = fixture();
      const run = f.runWorker.getMockImplementation()!;
      f.runWorker.mockImplementation((env) => ({
        ...run(env),
        stdout: JSON.stringify({ ...lifecycle, [field]: undefined }),
      }));
      expect(
        runManagedDocumentWorkerVerification(f.environment, f),
      ).toMatchObject({ status: "failed", stage: "lifecycle" });
      expect(f.runSql).toHaveBeenCalledTimes(1);
    },
  );

  it("requires the distinct retained rate and write-barrier receipt to report success", () => {
    const f = fixture();
    f.runSql
      .mockReset()
      .mockReturnValueOnce(receipt(ready))
      .mockReturnValueOnce(
        receipt({ ...cleanup, accountingWriteBarrierRetained: false }),
      );
    expect(
      runManagedDocumentWorkerVerification(f.environment, f),
    ).toMatchObject({ status: "failed", stage: "cleanup" });
    expect(f.runSql).toHaveBeenCalledTimes(2);
  });
});
