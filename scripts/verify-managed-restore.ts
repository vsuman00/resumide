import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  runManagedPsql,
  sharedProject,
  type ManagedPsql,
} from "./verify-managed-db.ts";

const uuid = z.uuidv4().regex(/^[a-f0-9-]+$/);
const projectUrl = z.string().regex(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const approvalSchema = z.strictObject({
  schemaVersion: z.literal("managed-restore-check/1"),
  exclusiveSyntheticProjects: z.literal(true),
  sourceUrl: projectUrl,
  restoredUrl: projectUrl,
  ownerId: uuid,
  viewerId: uuid,
});
const marker = "resumide-managed-restore-read-complete";
type Approval = z.infer<typeof approvalSchema>;

// Keep the fixed table and trigger set aligned with the legacy restore check.
const tables = {
  canonical_resume_versions: "revision,id",
  resume_facts: "canonical_version_id,id",
  canonical_resume_heads: "resume_id",
  change_events: "canonical_version_id,id",
  job_requirement_versions: "revision,id",
  job_requirements: "version_id,id",
  authoring_events: "created_at,id",
  document_evidence_attempts: "attempt_number,id",
};
const triggers = [
  [
    "canonical_resume_versions",
    "canonical_version_immutable",
    "reject_canonical_update",
  ],
  ["resume_facts", "canonical_fact_immutable", "reject_canonical_update"],
  ["change_events", "canonical_change_immutable", "reject_canonical_update"],
  [
    "job_requirement_versions",
    "immutable_job_requirement_version",
    "reject_job_requirement_update",
  ],
  [
    "job_requirements",
    "immutable_job_requirement",
    "reject_job_requirement_update",
  ],
  ["authoring_events", "immutable_authoring_event", "reject_canonical_update"],
] as const;

function snapshotSql({ ownerId, viewerId }: Approval): string {
  const owner = `'${ownerId}'::uuid`;
  const viewer = `'${viewerId}'::uuid`;
  const fixtureEmail = (id: string) => `'restore-check-${id}@example.test'`;
  const aggregate = Object.entries(tables).map(
    ([table, order]) =>
      `(select jsonb_agg(to_jsonb(r) order by ${order}) from public.${table} r where owner_id=${owner})`,
  );
  const rowSecurity = Object.keys(tables).map(
    (table) => `row_security_active('public.${table}'::regclass)`,
  );
  const triggerSpec = triggers.map(
    ([table, name, routine]) =>
      `('public.${table}'::regclass,'${name}','private.${routine}()'::regprocedure)`,
  );
  const counts = Object.keys(tables).map(
    (table) => `(select count(*) from public.${table} where owner_id=${owner})`,
  );
  const claims = (id: string) => `
set local request.jwt.claim.sub='${id}';
set local request.jwt.claims='{"sub":"${id}","role":"authenticated"}';`;
  return `
begin isolation level repeatable read read only;
set local search_path=pg_catalog;
set local statement_timeout='12s';
set local lock_timeout='2s';
set local time zone 'UTC';
set local row_security=off;
do $fixture$
begin
  if (select count(*) from auth.users) <> 2
    or not exists(select 1 from auth.users where id=${owner} and email=${fixtureEmail(ownerId)})
    or not exists(select 1 from auth.users where id=${viewer} and email=${fixtureEmail(viewerId)})
    or not exists (
      select 1 from public.memberships m
      join public.organizations o on o.id=m.organization_id
      where o.owner_id=${owner} and m.user_id=${viewer} and m.role='viewer'
    )
  then raise exception 'Restore fixture identity mismatch'; end if;
  if has_table_privilege('authenticated','public.resume_facts','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.job_requirements','INSERT,UPDATE,DELETE')
    or has_function_privilege('authenticated','public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)','EXECUTE')
    or has_function_privilege('authenticated','public.save_job_requirements(uuid,uuid,jsonb,uuid,uuid,text)','EXECUTE')
  then raise exception 'Restored write grant mismatch'; end if;
end;
$fixture$;
with expected(rel,name,routine) as (values ${triggerSpec.join(",")}),
guards as (
  select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid))
                    order by t.tgname) as definitions,
    count(*) as found
  from expected g join pg_trigger t on t.tgrelid=g.rel and t.tgname=g.name
    and t.tgfoid=g.routine and t.tgenabled in ('O','A') and not t.tgisinternal
)
select jsonb_build_object(
  'sha256', encode(sha256(convert_to(jsonb_build_array(${aggregate.join(",")},definitions)::text,'UTF8')),'hex'),
  'guards', found, 'counts', jsonb_build_array(${counts.join(",")})
) from guards;
set local row_security=on;
set local role authenticated;
${claims(ownerId)}
select jsonb_build_object('rls', ${rowSecurity.join(" and ")},
  'counts', jsonb_build_array(${counts.join(",")}));
${claims(viewerId)}
select jsonb_build_array(${counts.join(",")});
rollback;
\\echo ${marker}
`;
}

function connection(
  url: string,
  side: "SOURCE" | "RESTORED",
  environment: NodeJS.ProcessEnv,
) {
  const project = new URL(url).hostname.split(".")[0];
  const password = environment[`MANAGED_RESTORE_${side}_PASSWORD`];
  const cert = environment[`MANAGED_RESTORE_${side}_CA_FILE`];
  if (project === sharedProject || !password || !cert || !isAbsolute(cert))
    throw new Error("Restore connection is unavailable");
  const rootCertificate = realpathSync(cert);
  if (!statSync(rootCertificate).isFile())
    throw new Error("Restore certificate is unavailable");
  return {
    PATH: environment.PATH,
    LC_ALL: "C",
    PGHOST: `db.${project}.supabase.co`,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: rootCertificate,
    PGGSSENCMODE: "disable",
    PGCONNECT_TIMEOUT: "8",
    PGAPPNAME: "resumide-managed-restore-check",
  };
}

const counts = z
  .array(z.number().int().nonnegative())
  .length(Object.keys(tables).length);
const adminReceipt = z.strictObject({
  sha256,
  guards: z.literal(triggers.length),
  counts,
});
const ownerReceipt = z.strictObject({ rls: z.literal(true), counts });

function readSnapshot(result: ReturnType<ManagedPsql>) {
  const lines = result.stdout.trim().split(/\r?\n/);
  if (result.status !== 0 || lines.length !== 4 || lines[3] !== marker)
    throw new Error("Restore snapshot is incomplete");
  const admin = adminReceipt.parse(JSON.parse(lines[0]));
  const owner = ownerReceipt.parse(JSON.parse(lines[1]));
  const viewer = counts.parse(JSON.parse(lines[2]));
  const [
    versions,
    facts,
    heads,
    changes,
    jdVersions,
    requirements,
    authoring,
    evidence,
  ] = admin.counts;
  if (
    versions !== 3 ||
    facts === 0 ||
    heads !== 1 ||
    changes === 0 ||
    jdVersions !== 1 ||
    requirements !== 10 ||
    authoring !== 1 ||
    evidence !== 1 ||
    owner.counts.some((count, index) => count !== admin.counts[index]) ||
    viewer.some((count) => count !== 0)
  )
    throw new Error("Restore snapshot does not match the populated fixture");
  return admin.sha256;
}

export function verifyManagedRestore(
  environment: NodeJS.ProcessEnv,
  run: ManagedPsql = runManagedPsql,
) {
  const schemaVersion = "managed-restore-db-comparison/1";
  let stage = "admission";
  try {
    const raw = environment.MANAGED_RESTORE_APPROVAL;
    if (
      !raw ||
      raw.length > 4096 ||
      Object.keys(environment).some((key) =>
        /^(?:AA2_TEST_DB_CONTAINER|SUPABASE_URL|SUPABASE_DB_URL|DATABASE_URL|PG[A-Z0-9_]+)$/i.test(
          key,
        ),
      )
    )
      throw new Error(
        "Restore requires explicit isolated project configuration",
      );
    const approval = approvalSchema.parse(JSON.parse(raw));
    if (
      approval.sourceUrl === approval.restoredUrl ||
      approval.ownerId === approval.viewerId
    )
      throw new Error("Restore fixture identities must be distinct");
    const source = connection(approval.sourceUrl, "SOURCE", environment);
    const restored = connection(approval.restoredUrl, "RESTORED", environment);
    const input = snapshotSql(approval);
    stage = "source";
    const before = readSnapshot(run(input, source));
    stage = "restored";
    const after = readSnapshot(run(input, restored));
    stage = "comparison";
    if (before !== after)
      throw new Error("Restore snapshot differs from source");
    return { schemaVersion, status: "verified", stage: "complete" };
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
      ? verifyManagedRestore(process.env)
      : { status: "unavailable", stage: "arguments" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
}
