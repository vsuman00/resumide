import assert from "node:assert/strict";
import { applyAuthoring } from "../app/lib/server/authoring-repository";
import { buildScoreDiagnostics } from "../app/lib/server/score-v2-engine";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createJobRequirementFixture } from "./job-requirement-test-fixture";
import { saveJobRequirements } from "../app/lib/server/job-requirement-repository";
import {
  mutateCanonical,
  loadCanonical,
} from "../app/lib/server/canonical-repository";

const container = process.env.AA2_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_[a-z0-9_]+$/u.test(container))
  throw new Error(
    "Set AA2_TEST_DB_CONTAINER to the isolated local database container",
  );
const fixture = await createJobRequirementFixture();
const restoreDatabase = `aa2_restore_${randomUUID().replaceAll("-", "")}`;
const dumpPath = `/tmp/${restoreDatabase}.dump`;
const docker = (args: string[]) =>
  execFileSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const query = (database: string, sql: string) =>
  docker([
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    database,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]).trim();
let databaseCreated = false;
try {
  await saveJobRequirements(
    fixture.admin,
    fixture.analysisId,
    fixture.ownerId,
    { expectedVersionId: null, idempotencyKey: randomUUID() },
    "aa3-restore-requirements",
  );
  const imported = await mutateCanonical(
    fixture.admin,
    fixture.analysisId,
    fixture.ownerId,
    {
      operation: "import",
      expectedVersionId: null,
      idempotencyKey: randomUUID(),
    },
    "aa2-restore-import",
  );
  const content = (
    await loadCanonical(fixture.admin, fixture.analysisId, fixture.ownerId)
  ).current!.document;
  await mutateCanonical(
    fixture.admin,
    fixture.analysisId,
    fixture.ownerId,
    {
      operation: "confirm",
      expectedVersionId: imported.versionId,
      idempotencyKey: randomUUID(),
      factId: content.facts[0].id,
    },
    "aa2-restore-confirm",
  );
  const current = (
    await loadCanonical(fixture.admin, fixture.analysisId, fixture.ownerId)
  ).current!.document;
  await applyAuthoring(
    fixture.admin,
    fixture.analysisId,
    fixture.ownerId,
    {
      action: "rename",
      sectionId: current.sections[0].id,
      value: "Reviewed profile",
      expectedVersionId: current.versionId,
      idempotencyKey: randomUUID(),
    },
    "aa5-restore-authoring",
  );
  const owner = fixture.ownerId;
  const digestSql = `select md5(jsonb_build_object(
    'versions',(select jsonb_agg(to_jsonb(v) order by revision) from public.canonical_resume_versions v where owner_id='${owner}'::uuid),
    'facts',(select jsonb_agg(to_jsonb(f) order by canonical_version_id,id) from public.resume_facts f where owner_id='${owner}'::uuid),
    'heads',(select jsonb_agg(to_jsonb(h) order by resume_id) from public.canonical_resume_heads h where owner_id='${owner}'::uuid),
    'changes',(select jsonb_agg(to_jsonb(e) order by canonical_version_id,id) from public.change_events e where owner_id='${owner}'::uuid),
    'jdVersions',(select jsonb_agg(to_jsonb(j) order by revision) from public.job_requirement_versions j where owner_id='${owner}'::uuid),
    'requirements',(select jsonb_agg(to_jsonb(q) order by version_id,id) from public.job_requirements q where owner_id='${owner}'::uuid),
    'authoring',(select jsonb_agg(to_jsonb(e) order by created_at,id) from public.authoring_events e where owner_id='${owner}'::uuid)
    )::text);`;
  const before = query("postgres", digestSql);
  const replaySql = `select jsonb_build_object(
    'evidence',(select envelope from public.document_evidence_attempts where owner_id='${owner}'::uuid order by attempt_number desc limit 1),
    'canonical',(select content from public.canonical_resume_versions where owner_id='${owner}'::uuid order by revision desc limit 1),
    'requirements',(select content from public.job_requirement_versions where owner_id='${owner}'::uuid order by revision desc limit 1))::text;`;
  const diagnosticsBefore = buildScoreDiagnostics(
    JSON.parse(query("postgres", replaySql)),
  );

  docker([
    "pg_dump",
    "-U",
    "supabase_admin",
    "-Fc",
    "-f",
    dumpPath,
    "postgres",
  ]);
  query("postgres", `create database ${restoreDatabase} template template0`);
  databaseCreated = true;
  docker([
    "pg_restore",
    "-U",
    "supabase_admin",
    "--exit-on-error",
    "-d",
    restoreDatabase,
    dumpPath,
  ]);
  const after = query(restoreDatabase, digestSql);
  assert.equal(before, after, "Restored canonical data differs");
  const stored = query(
    restoreDatabase,
    `select count(*) from public.canonical_resume_versions where owner_id='${owner}'::uuid`,
  );
  assert.equal(stored, "3");
  const guards = query(
    restoreDatabase,
    `select count(*) from pg_class where relname in ('canonical_resume_versions','resume_facts','canonical_resume_heads','change_events','job_requirement_versions','job_requirements') and relrowsecurity`,
  );
  assert.equal(guards, "6");
  assert.equal(
    query(
      restoreDatabase,
      `select count(*) from public.job_requirements where owner_id='${owner}'::uuid`,
    ),
    "10",
  );
  const diagnosticsAfter = buildScoreDiagnostics(
    JSON.parse(query(restoreDatabase, replaySql)),
  );
  assert.deepEqual(
    diagnosticsAfter,
    diagnosticsBefore,
    "Scoring diagnostics changed after populated restore",
  );
  const writes = query(
    restoreDatabase,
    "select has_table_privilege('authenticated','public.resume_facts','INSERT,UPDATE,DELETE') or has_function_privilege('authenticated','public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)','EXECUTE') or has_table_privilege('authenticated','public.job_requirements','INSERT,UPDATE,DELETE') or has_function_privilege('authenticated','public.save_job_requirements(uuid,uuid,jsonb,uuid,uuid,text)','EXECUTE')",
  );
  assert.equal(writes, "f");
  // Execute a real owner RLS read in the restored database, then verify that
  // immutable rows still reject updates. The SQL transaction always rolls back.
  const policies = query(
    restoreDatabase,
    `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${owner}',true);select count(*) from public.canonical_resume_versions where owner_id='${owner}'::uuid;select count(*) from public.job_requirement_versions where owner_id='${owner}'::uuid;select count(*) from public.job_requirements where owner_id='${owner}'::uuid;select count(*) from public.authoring_events where owner_id='${owner}'::uuid;rollback;`,
  );
  assert.ok(policies.split("\n").includes("3"));
  assert.ok(
    policies.split("\n").includes("1") && policies.split("\n").includes("10"),
  );
  const immutable = query(
    restoreDatabase,
    `do $$ declare rejected boolean:=false; begin begin update public.canonical_resume_versions set locale='en-US' where owner_id='${owner}'::uuid;exception when sqlstate '22023' then rejected:=true;end;if not rejected then raise exception 'Restored version mutable';end if;rejected:=false;begin update public.job_requirement_versions set revision=99 where owner_id='${owner}'::uuid;exception when sqlstate '22023' then rejected:=true;end;if not rejected then raise exception 'Restored JD version mutable';end if;rejected:=false;begin update public.authoring_events set action='reject' where owner_id='${owner}'::uuid;exception when sqlstate '22023' then rejected:=true;end;if not rejected then raise exception 'Restored authoring ledger mutable';end if;end;$$;`,
  );
  assert.ok(immutable.includes("DO"));
  process.stdout.write(
    JSON.stringify({
      phase: "AA2-AA3-AA4-AA5",
      authoringEvents: 1,
      scoreDiagnosticsReplayed: true,
      localOnly: true,
      populatedVersions: 3,
      contentParity: true,
      requirementVersions: 1,
      requirementItems: 10,
      rlsTables: 7,
      immutable: true,
      passed: true,
    }) + "\n",
  );
} finally {
  if (databaseCreated) query("postgres", `drop database ${restoreDatabase}`);
  docker(["rm", "-f", dumpPath]);
  await fixture.cleanup();
}
