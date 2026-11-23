import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lexical source assertions only. This file does not parse or execute SQL and
// cannot establish management identity, isolation, database privileges or emptiness.
const source = readFileSync(
  new URL("../../scripts/verify-empty-supabase-target.sql", import.meta.url),
  "utf8",
);
const statements = source.replace(/--[^\n]*/gu, "");
const before = (left: string, right: string) => {
  const first = statements.indexOf(left),
    second = statements.indexOf(right);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(second).toBeGreaterThan(first);
};
describe("empty managed target preflight source, not Native execution", () => {
  it("discloses the unexecuted tier and external admission limits", () => {
    expect(source).toContain("DRAFT / UNPARSED / UNEXECUTED");
    expect(source).toContain("separately owner-admitted fresh managed project");
    expect(source).toContain("cannot prove project identity or exclusive use");
    expect(source).toContain("Refuse a nonempty or drifted target");
  });
  it("uses one repeatable read-only snapshot with finite session-local limits", () => {
    expect(statements).toContain(
      "begin transaction isolation level repeatable read read only;",
    );
    for (const setting of [
      "statement_timeout='15s'",
      "lock_timeout='1s'",
      "idle_in_transaction_session_timeout='20s'",
      "search_path=''",
    ])
      expect(statements).toContain(`set local ${setting};`);
    expect(statements.trimEnd()).toMatch(/rollback;$/u);
  });
  it("fails instead of accepting an RLS-filtered zero count", () => {
    expect(statements).toContain("set local row_security=off;");
    before("set local row_security=off;", "select count(*) from auth.users");
    expect(statements).not.toMatch(/\b(?:bypassrls|set role)\b/iu);
  });
  it("requires actual PostgreSQL major17 before any aggregates", () => {
    expect(statements).toContain(
      "current_setting('server_version_num')::integer not between 170000 and 179999",
    );
    before(
      "EMPTY_TARGET_POSTGRES_MAJOR_MISMATCH",
      "select count(*) from auth.users",
    );
  });
  it("refuses missing Auth/Storage tables before their fixed aggregate queries", () => {
    for (const table of ["auth.users", "storage.objects", "storage.buckets"])
      before(`to_regclass('${table}')`, `select count(*) from ${table}`);
    expect(statements).toContain("EMPTY_TARGET_REQUIRED_MANAGED_TABLE_MISSING");
  });
  it("requires ordinary managed tables before fixed aggregate reads", () => {
    expect(statements).toContain("p.relkind='r'");
    expect(statements).toContain("EMPTY_TARGET_MANAGED_RELATION_KIND_MISMATCH");
    before(
      "EMPTY_TARGET_MANAGED_RELATION_KIND_MISMATCH",
      "select count(*) from auth.users",
    );
  });
  it("refuses non-table optional history before its fixed literal query", () => {
    expect(statements).toContain(
      "p.oid=to_regclass('supabase_migrations.schema_migrations') and p.relkind<>'r'",
    );
    before(
      "EMPTY_TARGET_MIGRATION_HISTORY_KIND_MISMATCH",
      "execute 'select count(*) from supabase_migrations.schema_migrations'",
    );
  });
  it.each([
    ["auth.users", "EMPTY_TARGET_AUTH_USERS_PRESENT"],
    ["storage.objects", "EMPTY_TARGET_STORAGE_OBJECTS_PRESENT"],
    ["storage.buckets", "EMPTY_TARGET_STORAGE_BUCKETS_PRESENT"],
  ])(
    "refuses nonzero %s without returning record selectors",
    (table, refusal) => {
      expect(statements).toContain(
        `if (select count(*) from ${table})<>0 then`,
      );
      expect(statements).toContain(`raise exception '${refusal}'`);
    },
  );
  it("checks public/private ordinary, partitioned, foreign and materialized relations", () => {
    expect(statements).toContain("pg_catalog.pg_class");
    expect(statements).toContain("pg_catalog.pg_namespace");
    expect(statements).toContain(
      "n.nspname in ('public','private') and c.relkind in ('r','p','f','m')",
    );
    expect(statements).toContain("EMPTY_TARGET_APPLICATION_RELATIONS_PRESENT");
  });
  it("allows absent migration history but rejects any present rows using one fixed literal", () => {
    before(
      "if to_regclass('supabase_migrations.schema_migrations') is not null then",
      "execute 'select count(*) from supabase_migrations.schema_migrations' into history_rows;",
    );
    expect(statements).toContain("if history_rows<>0 then");
    expect(statements).toContain("EMPTY_TARGET_MIGRATION_HISTORY_PRESENT");
    expect([...statements.matchAll(/\bexecute\b/giu)]).toHaveLength(1);
    expect(statements).not.toMatch(/\bformat\s*\(|\|\|/u);
  });
  it("emits only a metadata pass row after every refusal check", () => {
    before("$empty_target$;", "select jsonb_build_object(");
    before("EMPTY_TARGET_MIGRATION_HISTORY_PRESENT", "'status','empty'");
    for (const field of [
      "authUsers",
      "storageObjects",
      "storageBuckets",
      "applicationRelations",
      "migrationHistoryRows",
    ])
      expect(statements).toContain(`'${field}',0`);
    expect(statements).toContain("'externalIsolationProved',false");
    expect(statements).toContain("'postgresMajor',17");
  });
  it("contains no fixtures, object mutation, temp objects, grants or caller authorization settings", () => {
    expect(statements).not.toMatch(
      /\b(?:insert|update|delete|truncate|drop|create|alter|grant|revoke|copy|call)\b/iu,
    );
    expect(statements).not.toMatch(/\bselect\s+(?:[a-z_]+\.)?\*/iu);
    expect(statements).not.toContain("resumide.");
    expect(statements).not.toMatch(
      /\bset\s+(?:session\s+)?role\b|request\.jwt|set_config\(/iu,
    );
  });
});
