import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  verifyManagedDb,
  type ManagedPsql,
} from "../../scripts/verify-managed-db";
import {
  managedCorrectionFixture,
  verifyManagedDbConcurrency,
} from "../../scripts/verify-managed-db-concurrency";
import { verifyManagedDbLint } from "../../scripts/verify-managed-db-lint";

const project = "synthetic-isolated-db";
const targetUrl = `https://${project}.supabase.co`;
const directHost = `db.${project}.supabase.co`;
const poolerHost = "aws-0-unit-test.pooler.supabase.com";
const password = "UNIT_ONLY_DATABASE_PASSWORD";
const caFile = fileURLToPath(import.meta.url); // Metadata check only, no TLS call.
const approval = {
  schemaVersion: "managed-db-sql-approval/1",
  purpose: "cr-r16-rollback-sql",
  targetUrl,
  connectionHost: directHost,
  orderedDigest:
    "fba7e856c528d05b6859bc5e6e4785cd4f15a9a93d57eccd1c62c74885958392",
  exclusiveSyntheticProject: true,
};

function environment(changes: Record<string, unknown> = {}) {
  return {
    ...{
      MANAGED_DB_APPROVAL: JSON.stringify({ ...approval, ...changes }),
      MANAGED_DB_PASSWORD: password,
      MANAGED_DB_CA_FILE: caFile,
      SUPABASE_URL: targetUrl,
      PGHOST: "UNIT_ONLY_UNAPPROVED_HOST",
      PGSERVICE: "UNIT_ONLY_UNAPPROVED_SERVICE",
      PGOPTIONS: "UNIT_ONLY_UNAPPROVED_OPTIONS",
      SUPABASE_SECRET_KEY: "UNIT_ONLY_SERVICE_CREDENTIAL",
    },
  };
}

function receipt(input: string, length?: number) {
  return input
    .split("\n")
    .filter((line) => line.startsWith("\\echo resumide-managed-sql:"))
    .slice(0, length)
    .map((line) => line.substring(6))
    .join("\n");
}

describe("managed SQL CI runner", () => {
  it.each([
    ["direct", directHost, "postgres"],
    ["session pooler", poolerHost, `postgres.${project}`],
  ])(
    "passes eight rollback suites through the approved %s",
    (_, host, user) => {
      const run = vi.fn<ManagedPsql>((input, env) => {
        expect(env).toMatchObject({
          PGHOST: host,
          PGPORT: "5432",
          PGDATABASE: "postgres",
          PGUSER: user,
          PGSSLMODE: "verify-full",
          PGSSLROOTCERT: caFile,
          PGGSSENCMODE: "disable",
          PGPASSWORD: password,
        });
        for (const key of ["PGSERVICE", "PGOPTIONS", "SUPABASE_SECRET_KEY"])
          expect(env).not.toHaveProperty(key);
        expect(input).not.toContain(password);
        expect(
          input.match(/^begin transaction isolation level read committed;$/gm),
        ).toHaveLength(8);
        expect(input.match(/^rollback;$/gm)).toHaveLength(9);
        expect(input).not.toMatch(/^commit;$/im);
        expect(
          input.indexOf("MANAGED_SQL_LEGACY_CLAIMANT_MISMATCH"),
        ).toBeLessThan(input.indexOf("insert into auth.users"));
        return { status: 0, stdout: receipt(input) };
      });
      expect(
        verifyManagedDb(environment({ connectionHost: host }), run),
      ).toMatchObject({
        status: "verified",
        suitesPassed: 8,
        stage: "complete",
      });
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { targetUrl: "http://localhost:54321" },
    { targetUrl: "https://wreqkdavofpfblsupnls.supabase.co" },
    { targetUrl: `https://${project}.supabase.co/private` },
    { connectionHost: "db.somewhere-else.supabase.co" },
    { connectionHost: poolerHost + ":6543" },
    { connectionHost: "localhost" },
    { connectionHost: "pooler.supabase.com.example.test" },
    { orderedDigest: "a".repeat(64) },
    { exclusiveSyntheticProject: false },
    { purpose: "deployment" },
    { restore: "legacy" },
  ])("refuses a mismatched approval without opening psql (%o)", (changes) => {
    const run = vi.fn<ManagedPsql>();
    const env = environment(changes);
    // The target even when explicitly selected has to satisfy admission.
    env.SUPABASE_URL = String(changes.targetUrl ?? targetUrl);
    expect(verifyManagedDb(env, run)).toMatchObject({
      status: "unavailable",
      stage: "admission",
      suitesPassed: 0,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { MANAGED_DB_APPROVAL: undefined },
    { MANAGED_DB_PASSWORD: undefined },
    { MANAGED_DB_CA_FILE: "relative.pem" },
    { MANAGED_DB_CA_FILE: "/dev/null" },
    { SUPABASE_URL: "https://other-project.supabase.co" },
  ])("refuses missing or conflicting configuration (%o)", (changes) => {
    const run = vi.fn<ManagedPsql>();
    expect(verifyManagedDb({ ...environment(), ...changes }, run).status).toBe(
      "unavailable",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a changed SQL source before spawning the client", () => {
    const run = vi.fn<ManagedPsql>();
    const result = verifyManagedDb(environment(), run, (name) => {
      const file = new URL(`../../scripts/verify-${name}.sql`, import.meta.url);
      const original = readFileSync(file);
      return name === "phase4-db"
        ? Buffer.concat([original, Buffer.from("\n-- drift")])
        : original;
    });
    expect(result).toMatchObject({
      status: "unavailable",
      stage: "sql-sources",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("reports only safe progress when a suite aborts", () => {
    const result = verifyManagedDb(environment(), (input) => ({
      status: 3,
      stdout: receipt(input, 4) + "\n" + password,
    }));
    expect(result).toMatchObject({
      status: "failed",
      stage: "native-evidence",
      suitesPassed: 2,
    });
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it("cannot report success if the client exits without all markers", () => {
    expect(
      verifyManagedDb(environment(), (input) => ({
        status: 0,
        stdout: receipt(input, 2),
      })),
    ).toMatchObject({ status: "failed", stage: "phase4-db", suitesPassed: 0 });
    expect(
      verifyManagedDb(environment(), () => ({
        status: null,
        stdout: "",
      })),
    ).toMatchObject({ status: "failed", stage: "connection", suitesPassed: 0 });
  });

  it("rejects unexpected phase output before reporting a result", () => {
    expect(
      verifyManagedDb(environment(), () => ({
        status: 0,
        stdout: "resumide-managed-sql:complete",
      })),
    ).toMatchObject({
      status: "failed",
      stage: "invalid-receipt",
      suitesPassed: 0,
    });
  });
});

describe("managed correction fixture admission", () => {
  it("derives four stable, distinct IDs per run for crash reconciliation", () => {
    const first = randomUUID();
    const second = randomUUID();
    const ids = managedCorrectionFixture(first);
    expect(Object.values(ids)).toHaveLength(4);
    expect(new Set(Object.values(ids))).toHaveLength(4);
    expect(managedCorrectionFixture(first)).toEqual(ids);
    expect(Object.values(managedCorrectionFixture(second))).not.toEqual(
      Object.values(ids),
    );
  });

  it("requires the committed-fixture authorization before a connection", async () => {
    const run = vi.fn<ManagedPsql>();
    expect(await verifyManagedDbConcurrency(environment(), run)).toMatchObject({
      status: "unavailable",
      stage: "admission",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("preserves a prior ledger and refuses to rerun its fixture", async () => {
    const runId = randomUUID();
    const directory = `/tmp/resumide-managed-${runId}`;
    const ledger = directory + "/correction-fixture.jsonl";
    mkdirSync(directory, { mode: 0o700 });
    try {
      writeFileSync(ledger, "previous receipt\n", { mode: 0o600 });
      const run = vi.fn<ManagedPsql>();
      expect(
        await verifyManagedDbConcurrency(
          {
            ...environment(),
            MANAGED_DB_RUN_ID: runId,
            MANAGED_DB_FIXTURE_LEDGER: ledger,
            MANAGED_DB_CONCURRENCY_AUTHORIZATION:
              "isolated-exact-committed-cas-fixture",
          },
          run,
        ),
      ).toMatchObject({ status: "unavailable", stage: "admission" });
      expect(run).not.toHaveBeenCalled();
      expect(readFileSync(ledger, "utf8")).toBe("previous receipt\n");
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

describe("managed schema lint", () => {
  it("keeps findings visible and requires the rollback receipt", () => {
    const run: ManagedPsql = (input) => {
      expect(input).toMatch(/create extension if not exists plpgsql_check/);
      expect(input).not.toMatch(/^commit;$/im);
      return {
        status: 0,
        stdout: [
          'resumide-managed-schema-lint:{"checkedRoutines":12,"warnings":3,"errors":1}',
          "resumide-managed-schema-lint-rolled-back",
        ].join("\n"),
      };
    };
    expect(verifyManagedDbLint(environment(), run)).toMatchObject({
      status: "completed_with_findings",
      checkedRoutines: 12,
      warnings: 3,
      errors: 1,
    });
  });

  it("fails when psql exits without confirming rollback", () => {
    const result = verifyManagedDbLint(environment(), () => ({
      status: 0,
      stdout:
        'resumide-managed-schema-lint:{"checkedRoutines":12,"warnings":0,"errors":0}',
    }));
    expect(result).toMatchObject({ status: "failed", stage: "execution" });
  });

  it("refuses a shared schema before running the linter", () => {
    const run = vi.fn<ManagedPsql>();
    expect(
      verifyManagedDbLint(environment({ connectionHost: "localhost" }), run),
    ).toMatchObject({ status: "unavailable", stage: "admission" });
    expect(run).not.toHaveBeenCalled();
  });
});
