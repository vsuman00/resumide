import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { requireManagedApiTarget } from "./managed-test-target.ts";

const packet =
  "fba7e856c528d05b6859bc5e6e4785cd4f15a9a93d57eccd1c62c74885958392";
export const sharedProject = "wreqkdavofpfblsupnls";
const rollbackDbProfile = {
  schemaVersion: "managed-db-sql-approval/1",
  purpose: "cr-r16-rollback-sql",
  orderedDigest: packet,
};
const sources = {
  "managed-document-worker-ready":
    "e5f3657e4ae2dd23f4ab585044c611278c5a322560186c21f127ea994be43eb4",
  "phase4-db":
    "a1c48142e5bfadedfdb5a9f0cfb8455a057e20e82c81d34abe54705c00f64e25",
  "phase7-db":
    "5753c6d77906cc8fc6f182e278ad3cc65c7c725e0bb04ec9c5c9a440923c0ed3",
  "native-evidence":
    "60bec7e066d7c38478e7ea78d78bc86a8590ef4058c70071a5564c1ae3913114",
  "document-evidence":
    "7d74822055f7e79355f442d15c2da16d3db0ba73ca6e7e38e50725210cfe5837",
  "canonical-storage":
    "4c82ec9ba9b709be8133b08db33df3803da342d7f0c84f1098cbb4497d10e66f",
  "paddle-admission":
    "43d4e05c3366e946ee04794b363a642824073a5d8719c1cf1ceeabf7fc5c2382",
  "evidence-field-version":
    "cf1991e7c7d3923acabcfb8c48c4391aef016978ce2d8c26e7f309accc4236a3",
  "ocr-fusion-version":
    "d7460d07101902a5ea4f1eab84067c946648d458abefa2999e668fa60802f767",
} as const;
const preflight = "managed-document-worker-ready";
const suites = Object.keys(sources).filter((name) => name !== preflight);
const phases = ["target", ...suites, "complete"];
const marker = "resumide-managed-sql:";

const sessionStart = `
set statement_timeout='15s';
set lock_timeout='2s';
set idle_in_transaction_session_timeout='20s';
do $session$
begin
  if not pg_catalog.pg_try_advisory_lock(48361817, 7316) then
    raise exception 'MANAGED_SQL_RUN_ALREADY_ACTIVE' using errcode='55P03';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('public.claim_analysis_job(text,integer)')
      and p.prosecdef and p.provolatile='v'
      and p.proconfig=array['search_path=""']
      and pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
        ='3ba83b229394b7981604d8b5557ea7631fd25cf942b1406877af504db4369db6') then
    raise exception 'MANAGED_SQL_LEGACY_CLAIMANT_MISMATCH' using errcode='23514';
  end if;
end;
$session$;`;

const beginCase = `
begin transaction isolation level read committed;
set local search_path=pg_catalog,public,extensions;
set local plpgsql.check_asserts=on;
lock table auth.users,storage.objects,public.analyses,public.analysis_jobs,public.data_requests
  in share row exclusive mode;
set local row_security=off;
do $isolation$
begin
  if exists(select 1 from auth.users) or exists(select 1 from storage.objects)
    or exists(select 1 from public.analyses) or exists(select 1 from public.analysis_jobs)
    or exists(select 1 from public.data_requests) then
    raise exception 'MANAGED_SQL_FIXTURE_TARGET_NOT_EMPTY' using errcode='23514';
  end if;
end;
$isolation$;
set local row_security=on;`;

// Phase 4 expects the reserved identities provided by the original seed.
// Create them inside this case's transaction, including the owner membership.
const phase4Setup = `
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  values('11111111-1111-1111-1111-111111111111','authenticated','authenticated',
    'migration-fixture@example.test','{"provider":"email","providers":["email"]}','{}');
delete from public.organizations where owner_id='11111111-1111-1111-1111-111111111111';
insert into public.organizations(id,owner_id,name)
  values('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Migration Fixture');
insert into public.memberships(organization_id,user_id,role)
  values('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','owner');`;

export type ManagedPsql = (
  input: string,
  environment: NodeJS.ProcessEnv,
) => { status: number | null; stdout: string };
export const managedPsqlArgs = ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"];
type ReadSource = (name: string) => Buffer;

const readSource: ReadSource = (name) =>
  readFileSync(new URL(`./verify-${name}.sql`, import.meta.url));

export const runManagedPsql: ManagedPsql = (input, env) => {
  const result = spawnSync("psql", managedPsqlArgs, {
    input,
    env,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 256 * 1024,
    killSignal: "SIGKILL",
  });
  return { status: result.status, stdout: result.stdout ?? "" };
};

export function managedDbConnection(
  environment: NodeJS.ProcessEnv,
  profile = rollbackDbProfile,
): NodeJS.ProcessEnv {
  const raw = environment.MANAGED_DB_APPROVAL;
  const password = environment.MANAGED_DB_PASSWORD;
  const caFile = environment.MANAGED_DB_CA_FILE;
  if (!raw || raw.length > 4096 || !password || !caFile || !isAbsolute(caFile))
    throw new Error("Missing managed SQL configuration");
  const approval = z
    .strictObject({
      schemaVersion: z.literal(profile.schemaVersion),
      purpose: z.literal(profile.purpose),
      targetUrl: z.string().max(120),
      connectionHost: z.string().max(120),
      orderedDigest: z.literal(profile.orderedDigest),
      exclusiveSyntheticProject: z.literal(true),
    })
    .parse(JSON.parse(raw));
  requireManagedApiTarget(approval.targetUrl);
  const project = new URL(approval.targetUrl).hostname.split(".")[0];
  if (
    project === sharedProject ||
    (environment.SUPABASE_URL !== undefined &&
      environment.SUPABASE_URL !== approval.targetUrl)
  )
    throw new Error("Managed SQL target does not match approval");

  const host = approval.connectionHost;
  const direct = host === `db.${project}.supabase.co`;
  if (!direct && !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host))
    throw new Error("Managed SQL host does not match approval");
  const rootCertificate = realpathSync(caFile);
  if (!statSync(rootCertificate).isFile())
    throw new Error("Missing managed SQL root certificate");

  return {
    PATH: environment.PATH,
    LC_ALL: "C",
    PGHOST: host,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: direct ? "postgres" : `postgres.${project}`,
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: rootCertificate,
    PGGSSENCMODE: "disable",
    PGCONNECT_TIMEOUT: "8",
    PGAPPNAME: "resumide-managed-rollback-sql",
  };
}

function verifiedSql(read: ReadSource) {
  return Object.fromEntries(
    Object.entries(sources).map(([name, expected]) => {
      const sql = read(name);
      if (createHash("sha256").update(sql).digest("hex") !== expected)
        throw new Error("Managed SQL source changed");
      return [name, sql.toString("utf8")];
    }),
  );
}

export function managedDbConcurrencySource() {
  const sql = verifiedSql(readSource);
  return {
    preflight: sessionStart + "\n" + sql[preflight],
    beginCase,
    documentEvidence: sql["document-evidence"],
  };
}

export function verifyManagedDb(
  environment: NodeJS.ProcessEnv,
  run: ManagedPsql = runManagedPsql,
  read: ReadSource = readSource,
) {
  let stage = "admission";
  const report = (
    status: "unavailable" | "failed" | "verified",
    completed: number,
  ) => ({
    schemaVersion: "managed-db-rollback/1",
    status,
    stage,
    schemaPacket: packet,
    suitesPassed: completed,
  });
  try {
    const env = managedDbConnection(environment);
    stage = "sql-sources";
    const sql = verifiedSql(read);
    const line = (name: string) => `\\echo ${marker}${name}`;
    const input =
      [
        line("target"),
        sessionStart,
        sql[preflight],
        ...suites.flatMap((name) => [
          line(name),
          beginCase,
          name === "phase4-db" ? phase4Setup : "",
          sql[name],
          "rollback;",
        ]),
        line("complete"),
      ].join("\n") + "\n";
    stage = "connection";
    const result = run(input, env);
    const seen = result.stdout
      .split(/\r?\n/)
      .filter((entry) => entry.startsWith(marker))
      .map((entry) => entry.slice(marker.length));
    if (seen.some((value, index) => value !== phases[index])) {
      stage = "invalid-receipt";
      return report("failed", 0);
    }
    stage = seen.at(-1) ?? "connection";
    if (result.status !== 0 || seen.length !== phases.length)
      return report(
        "failed",
        Math.max(0, Math.min(suites.length, seen.length - 2)),
      );
    return report("verified", suites.length);
  } catch {
    return report(stage === "connection" ? "failed" : "unavailable", 0);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (process.argv.length !== 2) {
    process.stdout.write(
      JSON.stringify({ status: "unavailable", stage: "arguments" }) + "\n",
    );
    process.exitCode = 2;
  } else {
    const result = verifyManagedDb(process.env);
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode =
      result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
  }
}
