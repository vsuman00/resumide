import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sharedProject } from "../../scripts/verify-managed-db";
import { verifyManagedRestore } from "../../scripts/verify-managed-restore";

const approval = {
  schemaVersion: "managed-restore-check/1",
  exclusiveSyntheticProjects: true,
  sourceUrl: "https://restorefixturesrc123.supabase.co",
  restoredUrl: "https://restorefixturedst123.supabase.co",
  ownerId: "e0caa2f4-fbc6-4b88-bd5d-6a13ee4778b5",
  viewerId: "668b15b8-2e1c-4eb7-8c2c-fd2b54f11111",
};
const counts = [3, 3, 1, 3, 1, 10, 1, 1];
const marker = "resumide-managed-restore-read-complete";
const dirs: string[] = [];

afterEach(() => {
  for (const path of dirs.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture(changes: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "managed-restore-test-"));
  dirs.push(dir);
  const sourceCa = join(dir, "source-ca.pem");
  const restoredCa = join(dir, "restored-ca.pem");
  writeFileSync(sourceCa, "synthetic CA sentinel");
  writeFileSync(restoredCa, "synthetic CA sentinel");
  return {
    PATH: "/usr/bin",
    MANAGED_RESTORE_APPROVAL: JSON.stringify({ ...approval, ...changes }),
    MANAGED_RESTORE_SOURCE_CA_FILE: sourceCa,
    MANAGED_RESTORE_RESTORED_CA_FILE: restoredCa,
    MANAGED_RESTORE_SOURCE_PASSWORD: "source-placeholder",
    MANAGED_RESTORE_RESTORED_PASSWORD: "restored-placeholder",
  };
}

function receipt(
  admin: Record<string, unknown> = {},
  owner: Record<string, unknown> = {},
  viewer = counts.map(() => 0),
) {
  const stdout = [
    JSON.stringify({
      sha256: createHash("sha256").update("synthetic fixture").digest("hex"),
      guards: 6,
      counts,
      ...admin,
    }),
    JSON.stringify({ rls: true, counts, ...owner }),
    JSON.stringify(viewer),
    marker,
  ].join("\n");
  return { status: 0, stdout };
}

describe("managed restore database comparison", () => {
  it.each([
    { sourceUrl: "http://127.0.0.1:54321" },
    { sourceUrl: "https://restorefixturesrc123.supabase.co:443" },
    { sourceUrl: "https://restorefixturesrc123.supabase.co@elsewhere.test" },
    { sourceUrl: `https://${sharedProject}.supabase.co` },
    { restoredUrl: `https://${sharedProject}.supabase.co` },
    { restoredUrl: approval.sourceUrl },
    { viewerId: approval.ownerId },
    { ownerId: "no" },
    { exclusiveSyntheticProjects: false },
    { connectionHost: "db.other.test" },
  ])("refuses an inadmissible isolated restore declaration %#", (overrides) => {
    const run = vi.fn();
    expect(verifyManagedRestore(fixture(overrides), run)).toMatchObject({
      status: "unavailable",
      stage: "admission",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { MANAGED_RESTORE_RESTORED_PASSWORD: "" },
    { MANAGED_RESTORE_RESTORED_CA_FILE: "/" },
    { AA2_TEST_DB_CONTAINER: "supabase_db_resume_ats" },
    { PGHOST: "127.0.0.1" },
    { PGOPTIONS: "-c default_transaction_read_only=off" },
    { SUPABASE_URL: approval.sourceUrl },
  ])(
    "refuses invalid or ambiguous runtime settings %# before either query",
    (overrides) => {
      const run = vi.fn();
      expect(
        verifyManagedRestore({ ...fixture(), ...overrides }, run),
      ).toMatchObject({
        status: "unavailable",
        stage: "admission",
      });
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("uses identical read-only SQL, exact hosts, and separate TLS credentials", () => {
    const run = vi.fn(() => receipt());
    expect(verifyManagedRestore(fixture(), run)).toMatchObject({
      status: "verified",
      stage: "complete",
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        "begin isolation level repeatable read read only",
      ),
      expect.objectContaining({
        PGHOST: "db.restorefixturesrc123.supabase.co",
        PGPASSWORD: "source-placeholder",
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: expect.stringMatching(/\/source-ca\.pem$/),
      }),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("rollback;"),
      expect.objectContaining({
        PGHOST: "db.restorefixturedst123.supabase.co",
        PGPASSWORD: "restored-placeholder",
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: expect.stringMatching(/\/restored-ca\.pem$/),
      }),
    );
  });

  it.each([
    receipt({ guards: 5 }),
    receipt({ counts: counts.map(() => 0) }),
    receipt({}, { rls: false }),
    receipt({}, { counts: counts.map(() => 0) }),
    receipt({}, {}, [1, 0, 0, 0, 0, 0, 0, 0]),
    { status: 2, stdout: receipt().stdout },
    { status: 0, stdout: receipt().stdout.replace(marker, "") },
    { status: 0, stdout: "unexpected-content\n" + receipt().stdout },
  ])(
    "fails a broken source receipt %# without opening the restored connection",
    (witness) => {
      const run = vi.fn(() => witness);
      expect(verifyManagedRestore(fixture(), run)).toMatchObject({
        status: "failed",
        stage: "source",
      });
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses a different restored snapshot and carries no source data into the report", () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(receipt())
      .mockReturnValueOnce(receipt({ sha256: "a".repeat(64) }));
    expect(verifyManagedRestore(fixture(), run)).toEqual({
      schemaVersion: "managed-restore-db-comparison/1",
      status: "failed",
      stage: "comparison",
    });
  });
});
