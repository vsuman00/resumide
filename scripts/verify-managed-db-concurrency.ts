import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  managedDbConcurrencySource,
  managedDbConnection,
  managedPsqlArgs,
  runManagedPsql,
  type ManagedPsql,
} from "./verify-managed-db.ts";
import {
  appendPrivateTestLedger,
  requirePrivateTestLedger,
} from "./managed-test-target.ts";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const suite = "cr-r16-managed-correction";
const setupStarted = "resumide-managed-correction:setup";
const setupComplete = "resumide-managed-correction:committed";
const timeoutSql =
  "set statement_timeout='18s'; set lock_timeout='12s'; set idle_in_transaction_session_timeout='20s';";

type ClientResult = ReturnType<ManagedPsql>;
type Client = {
  wait: Promise<ClientResult>;
  stop: () => void;
  exited: () => boolean;
  finish: (sql: string) => void;
};
type StartClient = (
  sql: string,
  env: NodeJS.ProcessEnv,
  keepInputOpen?: boolean,
) => Client;

const startPsql: StartClient = (input, env, keepInputOpen = false) => {
  const child = spawn("psql", managedPsqlArgs, {
    env,
    stdio: ["pipe", "pipe", "ignore"],
  });
  let stdout = "";
  let exited = false;
  const stop = () => {
    if (!exited) child.kill("SIGKILL");
  };
  const wait = new Promise<ClientResult>((settle) => {
    const timer = setTimeout(stop, 25_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 32 * 1024) stop();
    });
    child.on("error", () => {
      clearTimeout(timer);
      exited = true;
      settle({ status: null, stdout: "" });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      exited = true;
      settle({ status, stdout });
    });
    child.stdin.on("error", stop);
    if (keepInputOpen) child.stdin.write(input);
    else child.stdin.end(input);
  });
  return {
    wait,
    stop,
    exited: () => exited,
    finish: (sql) => child.stdin.end(sql),
  };
};

// Exact fixture identities can be derived again from the CI run reference
// even if its private workspace disappears during an interrupted run.
function fixtureUuid(runId: string, purpose: string) {
  const bytes = createHash("sha256")
    .update(`${suite}/1/${runId}/${purpose}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function managedCorrectionFixture(runId: string) {
  if (!uuidPattern.test(runId))
    throw new Error("Invalid correction fixture run");
  return {
    owner_id: fixtureUuid(runId, "owner"),
    other_id: fixtureUuid(runId, "outsider"),
    analysis_id: fixtureUuid(runId, "analysis"),
    attempt_id: fixtureUuid(runId, "evidence"),
  };
}

type Fixture = ReturnType<typeof managedCorrectionFixture>;

function makeEvidenceSetup(source: string, fixture: Fixture) {
  const boundary = "    for test_case in 1..10 loop";
  const split = source.indexOf(boundary);
  if (split < 0 || split !== source.lastIndexOf(boundary))
    throw new Error("Managed correction setup changed");
  let prefix = source.slice(0, split);
  for (const [field, id] of Object.entries(fixture)) {
    const declaration = `${field} uuid := gen_random_uuid()`;
    const position = prefix.indexOf(declaration);
    if (position < 0 || position !== prefix.lastIndexOf(declaration))
      throw new Error("Managed correction declaration changed");
    prefix = prefix.replace(declaration, `${field} uuid := '${id}'`);
  }
  return (
    prefix +
    `
    if not public.persist_document_evidence(analysis_id,envelope,'concurrency-test','concurrency-test')
    then raise exception 'MANAGED_CORRECTION_EVIDENCE_SETUP_FAILED'; end if;
  end;
end;
$$;`
  );
}

function cleanupSql(fixture: Fixture) {
  const {
    owner_id: owner,
    other_id: outsider,
    analysis_id: analysis,
    attempt_id: attempt,
  } = fixture;
  return `
${timeoutSql}
begin transaction isolation level read committed;
delete from auth.users where
  (id='${owner}' and email='aa013-${owner}@example.test')
  or (id='${outsider}' and email='aa013-${outsider}@example.test');
do $cleanup$
begin
  if exists(select 1 from auth.users where id in ('${owner}','${outsider}'))
    or exists(select 1 from public.organizations where owner_id in ('${owner}','${outsider}'))
    or exists(select 1 from public.analyses where id='${analysis}')
    or exists(select 1 from public.document_evidence_attempts where id='${attempt}')
    or exists(select 1 from public.evidence_corrections where analysis_id='${analysis}') then
    raise exception 'MANAGED_CORRECTION_CLEANUP_INCOMPLETE';
  end if;
end;
$cleanup$;
commit;
\\echo resumide-managed-correction:clean`;
}

async function waitForCondition(
  client: Client,
  predicate: () => string,
  maxWaitMs: number,
) {
  const deadline = performance.now() + maxWaitMs;
  while (!client.exited() && performance.now() < deadline) {
    if (predicate() === "t") return true;
    await delay(50);
  }
  return false;
}

export async function verifyManagedDbConcurrency(
  processEnv: NodeJS.ProcessEnv,
  query: ManagedPsql = runManagedPsql,
  start: StartClient = startPsql,
) {
  let stage = "admission";
  let setupAttempted = false;
  let cleanupVerified = false;
  let passed = false;
  let cleanup: (() => boolean) | undefined;
  const clients: Client[] = [];
  try {
    const runId = processEnv.MANAGED_DB_RUN_ID ?? "";
    const ledger = processEnv.MANAGED_DB_FIXTURE_LEDGER ?? "";
    if (
      processEnv.MANAGED_DB_CONCURRENCY_AUTHORIZATION !==
        "isolated-exact-committed-cas-fixture" ||
      !uuidPattern.test(runId) ||
      ledger !== `/tmp/resumide-managed-${runId}/correction-fixture.jsonl`
    )
      throw new Error("Managed correction scope unavailable");
    const env = managedDbConnection(processEnv);
    const directory = lstatSync(dirname(ledger));
    if (
      !directory.isDirectory() ||
      (directory.mode & 0o7777) !== 0o700 ||
      directory.uid !== process.getuid?.()
    )
      throw new Error("Managed correction ledger directory is not private");
    requirePrivateTestLedger(ledger);
    if (statSync(ledger).size !== 0)
      throw new Error("Reconcile the previous managed correction run");
    const fixture = managedCorrectionFixture(runId);
    const { preflight, beginCase, documentEvidence } =
      managedDbConcurrencySource();
    const setup = makeEvidenceSetup(documentEvidence, fixture);
    const run = (sql: string, name?: string) =>
      name ? query(sql, { ...env, PGAPPNAME: name }) : query(sql, env);
    const read = (sql: string) => {
      const result = run(timeoutSql + sql);
      if (result.status !== 0)
        throw new Error("Managed correction query failed");
      return result.stdout.trim();
    };
    appendPrivateTestLedger(
      ledger,
      JSON.stringify({
        runId,
        event: "correction_fixture_planned",
        ...fixture,
      }) + "\n",
    );

    stage = "setup";
    const created = run(`
${preflight}
${beginCase}
\\echo ${setupStarted}
${setup}
commit;
\\echo ${setupComplete}
`);
    setupAttempted = created.stdout.split(/\r?\n/).includes(setupStarted);
    if (setupAttempted)
      cleanup = () => {
        const result = run(cleanupSql(fixture) + "\n");
        return (
          result.status === 0 &&
          result.stdout.trim() === "resumide-managed-correction:clean"
        );
      };
    if (
      created.status !== 0 ||
      !created.stdout.split(/\r?\n/).includes(setupComplete)
    )
      throw new Error("Managed correction setup failed");

    stage = "race";
    const firstName = `r16-first-${runId}`;
    const secondName = `r16-second-${runId}`;
    const rpc = (name: string) =>
      `select public.correct_document_evidence('${fixture.analysis_id}','${fixture.attempt_id}',` +
      `'${fixture.owner_id}',0,'email','confirm','alex@example.test','email-1','${fixtureUuid(runId, name)}','concurrent-test');`;
    const first = start(
      `
${timeoutSql}
begin transaction isolation level read committed;
select id from public.analyses where id='${fixture.analysis_id}' for update;
`,
      { ...env, PGAPPNAME: firstName },
      true,
    );
    clients.push(first);
    if (
      !(await waitForCondition(
        first,
        () =>
          read(
            `select exists(select 1 from pg_stat_activity where application_name='${firstName}'
              and state='idle in transaction' and backend_xid is not null);`,
          ),
        7_000,
      ))
    )
      throw new Error("Managed first correction did not hold the lock");

    const second = start(timeoutSql + rpc("secondary-correction"), {
      ...env,
      PGAPPNAME: secondName,
    });
    clients.push(second);
    if (
      !(await waitForCondition(
        second,
        () =>
          read(
            `select exists(select 1 from pg_stat_activity s join pg_stat_activity f
        on f.pid=any(pg_blocking_pids(s.pid))
        where s.application_name='${secondName}' and f.application_name='${firstName}');`,
          ),
        5_000,
      ))
    )
      throw new Error(
        "Managed stale correction did not wait on the first writer",
      );

    first.finish(rpc("primary-correction") + "\ncommit;\n");
    const [applied, stale] = await Promise.all([first.wait, second.wait]);
    if (applied.status !== 0 || stale.status !== 0)
      throw new Error("Managed correction writers failed");
    const firstResult = JSON.parse(
      applied.stdout.trim().split(/\r?\n/).at(-1)!,
    );
    const secondResult = JSON.parse(stale.stdout.trim());
    if (
      firstResult?.status !== "applied" ||
      firstResult?.revision !== 1 ||
      secondResult?.status !== "conflict" ||
      read(
        `select count(*) from public.evidence_corrections where analysis_id='${fixture.analysis_id}';`,
      ) !== "1"
    )
      throw new Error("Managed correction CAS result mismatch");
    passed = true;
  } catch {
    passed = false;
  } finally {
    for (const client of clients) client.stop();
    await Promise.all(clients.map((client) => client.wait));
    if (cleanup) {
      try {
        cleanupVerified = cleanup();
      } catch {
        cleanupVerified = false;
      }
      if (cleanupVerified) {
        try {
          appendPrivateTestLedger(
            processEnv.MANAGED_DB_FIXTURE_LEDGER!,
            JSON.stringify({ event: "correction_cleanup_verified" }) + "\n",
          );
        } catch {
          cleanupVerified = false;
        }
      }
    }
  }
  return {
    schemaVersion: "managed-db-correction/1",
    status:
      passed && cleanupVerified
        ? "verified"
        : stage === "admission"
          ? "unavailable"
          : "failed",
    stage:
      passed && cleanupVerified
        ? "complete"
        : setupAttempted && !cleanupVerified
          ? "cleanup"
          : stage,
    exactCleanup: cleanupVerified,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result =
    process.argv.length === 2
      ? await verifyManagedDbConcurrency(process.env)
      : { status: "unavailable", stage: "arguments" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
}
