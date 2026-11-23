import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  managedDbConcurrencySource,
  managedDbConnection,
  runManagedPsql,
  type ManagedPsql,
} from "./verify-managed-db.ts";

const countsMarker = "resumide-managed-schema-lint:";
const rollbackMarker = "resumide-managed-schema-lint-rolled-back";
const countsSchema = z.strictObject({
  checkedRoutines: z.number().int().positive(),
  warnings: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

// The legacy CLI checked the non-trigger PL/pgSQL routines in user schemas
// and enabled the extension inside a transaction it always rolled back.
const lintSql = `
begin;
set local search_path=pg_catalog,public,extensions;
set local statement_timeout='120s';
create extension if not exists plpgsql_check with schema extensions;
do $lint$
declare
  linter_schema text;
  checked_routines bigint;
  warnings bigint;
  errors bigint;
begin
  select n.nspname into strict linter_schema
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid=e.extnamespace
    where e.extname='plpgsql_check';
  execute format($check$
    with candidates as materialized (
      select p.oid
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      join pg_catalog.pg_language l on l.oid=p.prolang
      where l.lanname='plpgsql' and p.prorettype<>'trigger'::regtype
        and n.nspname<>'information_schema' and left(n.nspname,3)<>'pg_'
        and n.nspname not in ('_analytics','_realtime','_supavisor','pgbouncer',
          'pgmq','pgsodium','pgtle','supabase_migrations','vault')
    )
    select count(distinct c.oid),count(*) filter(where finding.level like 'warning%%'),
      count(*) filter(where finding.level='error')
    from candidates c
    left join lateral %I.plpgsql_check_function_tb(c.oid::regprocedure) finding on true
  $check$,linter_schema) into checked_routines,warnings,errors;
  if checked_routines=0 then raise exception 'MANAGED_SCHEMA_LINT_EMPTY'; end if;
  perform set_config('resumide.schema_lint',jsonb_build_object(
    'checkedRoutines',checked_routines,'warnings',warnings,'errors',errors)::text,true);
end;
$lint$;
select '${countsMarker}'||current_setting('resumide.schema_lint');
rollback;
\\echo ${rollbackMarker}
`;

export function verifyManagedDbLint(
  environment: NodeJS.ProcessEnv,
  run: ManagedPsql = runManagedPsql,
) {
  const schemaVersion = "managed-db-schema-lint/1";
  let stage = "admission";
  try {
    const env = managedDbConnection(environment);
    const { preflight } = managedDbConcurrencySource();
    stage = "execution";
    const result = run(preflight + "\n" + lintSql, env);
    const lines = result.stdout.trim().split(/\r?\n/);
    const countLines = lines.filter((line) => line.startsWith(countsMarker));
    if (
      result.status !== 0 ||
      lines.at(-1) !== rollbackMarker ||
      countLines.length !== 1
    )
      return { schemaVersion, status: "failed", stage };
    const counts = countsSchema.parse(
      JSON.parse(countLines[0].slice(countsMarker.length)),
    );
    return {
      schemaVersion,
      status:
        counts.warnings > 0 || counts.errors > 0
          ? "completed_with_findings"
          : "completed",
      stage: "complete",
      ...counts,
    };
  } catch {
    return {
      schemaVersion,
      status: stage === "admission" ? "unavailable" : "failed",
      stage,
    };
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result =
    process.argv.length === 2
      ? verifyManagedDbLint(process.env)
      : { status: "unavailable", stage: "arguments" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "unavailable" ? 2 : result.status === "failed" ? 1 : 0;
}
