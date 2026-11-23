import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, StorageApiError } from "@supabase/supabase-js";
import { z } from "zod";
import { runProviderAttempt } from "../app/lib/server/provider-attempt.ts";
import { readPrivateTestLedger } from "./managed-test-target.ts";
import {
  managedDbConnection,
  runManagedPsql,
  type ManagedPsql,
} from "./verify-managed-db.ts";

const idPattern = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const id = z.uuid().regex(/^[a-f0-9-]+$/);
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sourceKey = z
  .string()
  .regex(
    new RegExp(
      `^organizations/(${idPattern})/resumes/(${idPattern})/(?:versions/)?(${idPattern})\\.pdf$`,
    ),
  );
const browserEntry = z.union([
  z.strictObject({ ownerId: id }),
  z.strictObject({ ownerId: id, storageKey: sourceKey }),
]);
const converterEntry = z.union([
  z.strictObject({
    ownerId: id,
    createdAt: z.iso.datetime(),
    rateKey: z.string().regex(/^latex:user:[a-f0-9]{64}$/),
  }),
  z.strictObject({
    recordType: z.literal("build-ai"),
    ownerId: id,
    orgId: id,
    keys: z.tuple([
      z.string().regex(/^build-ai:user:[a-f0-9]{64}$/),
      z
        .string()
        .regex(/^build-ai:month:[0-9]{4}-(0[1-9]|1[0-2]):[a-f0-9]{64}$/),
    ]),
  }),
]);
const resultSchema = z.strictObject({
  auth: z.boolean(),
  application: z.boolean(),
  storageMetadata: z.boolean(),
  ownedRateBuckets: z.boolean(),
});
const marker = "resumide-browser-cleanup-read-complete";
const latexRateMarker = "resumide-browser-latex-rate-cleanup-complete";

function records<T>(path: string, entry: z.ZodType<T>): T[] {
  const text = readPrivateTestLedger(path);
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.pop() !== "" || lines.length > 512)
    throw new Error("Browser fixture ledger is incomplete");
  return lines.map((line) => entry.parse(JSON.parse(line)));
}

function readScope(runId: string) {
  const browser = records(
    `/tmp/resumide-auth-audit-managed-${runId}.jsonl`,
    browserEntry,
  );
  const converter = records(
    `/tmp/resumide-aa7-managed-${runId}.jsonl`,
    converterEntry,
  );
  const owners = new Set<string>();
  const converterOwners = new Set<string>();
  const objects = new Set<string>();
  const organizations = new Set<string>();
  const resumes = new Set<string>();
  const versions = new Set<string>();
  const rateKeys = new Set<string>();
  for (const entry of browser) {
    if ("storageKey" in entry) {
      if (!owners.has(entry.ownerId))
        throw new Error("Storage receipt has no preceding owner declaration");
      const [, org, , resume, ...path] = entry.storageKey.split("/");
      objects.add(entry.storageKey);
      organizations.add(org);
      resumes.add(resume);
      versions.add(path.at(-1)!.slice(0, -4));
    } else {
      owners.add(entry.ownerId);
    }
  }
  for (const entry of converter) {
    if ("rateKey" in entry) {
      if (entry.rateKey !== `latex:user:${sha256(entry.ownerId)}`)
        throw new Error("Converter rate key differs from owner");
      converterOwners.add(entry.ownerId);
      owners.add(entry.ownerId);
      continue;
    }
    if (
      !converterOwners.has(entry.ownerId) ||
      entry.keys[0] !== `build-ai:user:${sha256(entry.ownerId)}` ||
      !entry.keys[1].endsWith(`:${sha256(entry.orgId)}`)
    )
      throw new Error("Build receipt differs from its synthetic fixture");
    organizations.add(entry.orgId);
    rateKeys.add(entry.keys[1]);
  }
  if (owners.size === 0) throw new Error("No browser accounts were journaled");
  for (const owner of owners) {
    const digest = sha256(owner);
    rateKeys.add(digest);
    rateKeys.add(`latex:user:${digest}`);
    rateKeys.add(`build-ai:user:${digest}`);
  }
  return {
    owners,
    converterOwners,
    objects,
    organizations,
    resumes,
    versions,
    rateKeys,
  };
}

function readCleanupScope(environment: NodeJS.ProcessEnv) {
  const url = environment.SUPABASE_URL;
  const bucket = environment.SUPABASE_RESUME_BUCKET ?? "resumes";
  const runId = id.parse(environment.MANAGED_BROWSER_CLEANUP_RUN_ID);
  if (
    !url ||
    environment.BROWSER_TEST_SUPABASE_URL !== url ||
    environment.BROWSER_SUPABASE_AUTHORIZATION !==
      "synthetic-owned-records-only" ||
    environment.BROWSER_TEST_LEDGER !==
      `/tmp/resumide-auth-audit-managed-${runId}.jsonl` ||
    environment.AA7_AUTH_RECEIPT_FILE !==
      `/tmp/resumide-aa7-managed-${runId}.jsonl` ||
    !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)
  )
    throw new Error("Browser cleanup scope does not match approval");
  return { url, bucket, runId };
}

/** Remove only journaled converter user counters after that run's Auth cleanup. */
export function removeManagedLatexRateBuckets(
  environment: NodeJS.ProcessEnv,
  run: ManagedPsql = runManagedPsql,
) {
  try {
    const { url, runId } = readCleanupScope(environment);
    if (
      environment.MANAGED_BROWSER_AUTHORIZATION !==
        "isolated-authenticated-browser-fixtures" ||
      environment.AA7_HOSTED_TEST_AUTHORIZATION !==
        "temporary-synthetic-users-20261030" ||
      environment.AA7_TEST_SUPABASE_URL !== url
    )
      throw new Error("Managed compiler cleanup not admitted");
    const connection = managedDbConnection(environment);
    const owners = [...readScope(runId).converterOwners];
    if (!owners.length)
      throw new Error("No owned converter counters journaled");
    // Owner IDs and derived digests use the audited ledger's exact alphabet.
    const rows = owners.map(
      (owner) => `('${owner}'::uuid,'latex:user:${sha256(owner)}'::text)`,
    );
    const result = run(
      `
begin;
set local search_path=pg_catalog;
set local row_security=off;
set local statement_timeout='15s';
set local lock_timeout='2s';
lock table auth.users,auth.sessions,auth.identities,auth.refresh_tokens in share mode;
with fixtures(owner_id,bucket_key) as (values ${rows.join(",")}),
remaining_auth as (
  select 1 from fixtures f
  where exists(select 1 from auth.users where id=f.owner_id)
     or exists(select 1 from auth.sessions where user_id=f.owner_id)
     or exists(select 1 from auth.identities where user_id=f.owner_id)
     or exists(select 1 from auth.refresh_tokens where user_id::text=f.owner_id::text)
),
removed as (
  delete from private.analysis_rate_limit_buckets b using fixtures f
  where b.bucket_key=f.bucket_key and not exists(select 1 from remaining_auth)
  returning 1
)
select jsonb_build_object(
  'blocked',exists(select 1 from remaining_auth),
  'removed',(select count(*) from removed)
);
commit;
\\echo ${latexRateMarker}
`,
      { ...connection, PGAPPNAME: "resumide-managed-latex-rate-cleanup" },
    );
    const lines = result.stdout.trim().split(/\r?\n/);
    if (
      result.status !== 0 ||
      lines.length !== 2 ||
      lines[1] !== latexRateMarker
    )
      throw new Error("Converter rate cleanup receipt unavailable");
    const receipt = z
      .strictObject({
        blocked: z.boolean(),
        removed: z.number().int().min(0).max(owners.length),
      })
      .parse(JSON.parse(lines[0]));
    if (receipt.blocked) return { status: "blocked" } as const;
    return { status: "verified", removed: receipt.removed } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

function cleanupSql(scope: ReturnType<typeof readScope>, bucket: string) {
  // readScope and the bucket allowlist restrict literals to the exact fixture alphabet.
  const array = (values: Set<string>, type: "uuid" | "text") =>
    `array[${Array.from(values, (value) => `'${value}'`).join(",")}]::${type}[]`;
  const owner = `any(${array(scope.owners, "uuid")})`;
  const ownerText = `any(${array(scope.owners, "text")})`;
  const org = `any(${array(scope.organizations, "uuid")})`;
  const resume = `any(${array(scope.resumes, "uuid")})`;
  const version = `any(${array(scope.versions, "uuid")})`;
  const object = `any(${array(scope.objects, "text")})`;
  const rateKey = `any(${array(scope.rateKeys, "text")})`;
  return `
begin transaction isolation level repeatable read read only;
set local search_path=pg_catalog;
set local row_security=off;
set local statement_timeout='15s';
set local lock_timeout='2s';
select jsonb_build_object(
  'auth',
    exists(select 1 from auth.users where id=${owner}) or
    exists(select 1 from auth.sessions where user_id=${owner}) or
    exists(select 1 from auth.identities where user_id=${owner}) or
    exists(select 1 from auth.refresh_tokens where user_id::text=${ownerText}),
  'application',
    exists(select 1 from public.profiles where id=${owner}) or
    exists(select 1 from public.organizations where owner_id=${owner} or id=${org}) or
    exists(select 1 from public.memberships where user_id=${owner} or organization_id=${org}) or
    exists(select 1 from public.jobs where owner_id=${owner} or organization_id=${org}) or
    exists(select 1 from public.analyses where owner_id=${owner} or resume_version_id=${version}) or
    exists(select 1 from public.resumes where owner_id=${owner} or id=${resume}) or
    exists(select 1 from public.resume_versions where owner_id=${owner} or id=${version} or storage_key=${object}) or
    exists(select 1 from public.consents where user_id=${owner}) or
    exists(select 1 from public.audit_events where actor_id=${owner} or organization_id=${org}) or
    exists(select 1 from public.data_requests where user_id=${owner}) or
    exists(select 1 from private.analysis_admission_operations where owner_id=${owner}) or
    exists(select 1 from private.analysis_admission_uploads where storage_key=${object}),
  'storageMetadata', exists(
    select 1 from storage.objects
    where bucket_id='${bucket}' and (name=${object} or owner_id=${ownerText})
  ),
  'ownedRateBuckets', exists(
    select 1 from private.analysis_rate_limit_buckets where bucket_key=${rateKey}
  )
);
rollback;
\\echo ${marker}
`;
}

async function storageObjectsAbsent(
  url: string,
  secret: string,
  bucket: string,
  keys: Set<string>,
  transport: typeof globalThis.fetch,
) {
  const failure = () => new Error("Browser fixture Storage absence unverified");
  return runProviderAttempt({
    timeoutMs: 20_000,
    failure,
    execute: async (signal) => {
      const client = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set("Range", "bytes=0-0");
            return transport(input, {
              ...init,
              headers,
              signal,
              redirect: "error",
              cache: "no-store",
            });
          },
        },
      });
      const storage = client.storage.from(bucket);
      for (const key of keys) {
        signal.throwIfAborted();
        const { data, error } = await storage.download(key).asStream();
        if (data) {
          await data.cancel();
          return false;
        }
        if (
          !(error instanceof StorageApiError) ||
          error.status !== 404 ||
          error.code !== "NoSuchKey"
        )
          throw failure();
      }
      return true;
    },
  });
}

export async function verifyManagedBrowserCleanup(
  environment: NodeJS.ProcessEnv,
  run: ManagedPsql = runManagedPsql,
  transport: typeof globalThis.fetch = globalThis.fetch,
) {
  const schemaVersion = "managed-browser-cleanup/1";
  let stage = "admission";
  try {
    const { url, bucket, runId } = readCleanupScope(environment);
    const connection = managedDbConnection(environment);
    stage = "ledger";
    const scope = readScope(runId);
    stage = "query";
    const result = run(cleanupSql(scope, bucket), {
      ...connection,
      PGAPPNAME: "resumide-managed-browser-cleanup",
    });
    const lines = result.stdout.trim().split(/\r?\n/);
    if (result.status !== 0 || lines.length !== 2 || lines[1] !== marker)
      throw new Error("Browser cleanup snapshot is incomplete");
    const resultGroups = resultSchema.parse(JSON.parse(lines[0]));
    const residuals = Object.entries(resultGroups)
      .filter(([, present]) => present)
      .map(([group]) => group);
    if (residuals.length === 0 && scope.objects.size > 0) {
      stage = "storage";
      const secret = environment.SUPABASE_SECRET_KEY;
      if (!secret) throw new Error("Managed Storage credential required");
      if (
        !(await storageObjectsAbsent(
          url,
          secret,
          bucket,
          scope.objects,
          transport,
        ))
      )
        residuals.push("storageObject");
    }
    return {
      schemaVersion,
      status: residuals.length ? "failed" : "verified",
      stage: "complete",
      residuals,
    };
  } catch {
    return {
      schemaVersion,
      status:
        stage === "query" || stage === "storage" ? "failed" : "unavailable",
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
      ? await verifyManagedBrowserCleanup(process.env)
      : { status: "unavailable", stage: "arguments" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
}
