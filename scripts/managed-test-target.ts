import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  writeSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DEFAULT_OPENAI_MODEL } from "../app/lib/server/openai-model.ts";

const REFUSAL = "Managed test target admission refused";
const SENTINEL = "build-ai-harness-no-live-key";

export type ManagedTestRequest = {
  targetUrl: string;
  purpose: string;
  runId: string;
  ledgerPath: string;
  capability: "owned-fixtures" | "global-queue" | "native-sql" | "restore";
};

function refuse(): never {
  throw new Error(REFUSAL);
}

export function requireManagedApiTarget(value: string): void {
  try {
    const url = new URL(value);
    if (
      typeof value !== "string" ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co(?::443)?\/?$/.test(value) ||
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    )
      refuse();
  } catch {
    refuse();
  }
}

function privateFile(file: Stats): boolean {
  return (
    file.isFile() &&
    file.nlink === 1 &&
    (file.mode & 0o7777) === 0o600 &&
    typeof process.getuid === "function" &&
    file.uid === process.getuid()
  );
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function openPrivateLedger(path: string, append: boolean): number {
  let descriptor: number | undefined;
  try {
    if (!isAbsolute(path) || resolve(path) !== path) refuse();
    const before = lstatSync(path);
    if (!privateFile(before)) refuse();
    descriptor = openSync(
      path,
      (append ? constants.O_WRONLY | constants.O_APPEND : constants.O_RDONLY) |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor);
    const after = lstatSync(path);
    if (
      !privateFile(opened) ||
      !privateFile(after) ||
      !sameFile(before, opened) ||
      !sameFile(opened, after)
    )
      refuse();
    return descriptor;
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    refuse();
  }
}

export function requirePrivateTestLedger(path: string): void {
  try {
    closeSync(openPrivateLedger(path, false));
  } catch {
    refuse();
  }
}

export function readPrivateTestLedger(path: string): string {
  const descriptor = openPrivateLedger(path, false);
  try {
    const before = fstatSync(descriptor);
    if (before.size > 128 * 1024) refuse();
    const bytes = Buffer.alloc(before.size + 1);
    const length = readSync(descriptor, bytes, 0, bytes.length, 0);
    const after = fstatSync(descriptor);
    const named = lstatSync(path);
    if (
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      !privateFile(after) ||
      !privateFile(named) ||
      !sameFile(after, named)
    )
      refuse();
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, length),
    );
  } finally {
    closeSync(descriptor);
  }
}

export function appendPrivateTestLedger(path: string, record: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openPrivateLedger(path, true);
    const bytes = Buffer.from(record, "utf8");
    if (writeSync(descriptor, bytes) !== bytes.length) refuse();
    fsyncSync(descriptor);
  } catch {
    refuse();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function requireSealedDeclarations(environment: NodeJS.ProcessEnv): void {
  if (
    environment.AI_ENABLED !== "false" ||
    environment.OPENAI_API_KEY !== SENTINEL ||
    environment.OPENAI_BASE_URL !== "https://api.openai.com/v1" ||
    environment.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic" ||
    (environment.BUILD_AI_ASSIST_ENABLED !== undefined &&
      environment.BUILD_AI_ASSIST_ENABLED !== "false") ||
    (environment.BUILD_AI_TEST_HARNESS !== undefined &&
      environment.BUILD_AI_TEST_HARNESS !== "selected-context-synthetic-only")
  )
    refuse();
  const allowedOpenAI: Record<string, string> = {
    OPENAI_API_KEY: SENTINEL,
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
  };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (
      (upper.startsWith("OPENAI_") &&
        (name !== upper || allowedOpenAI[name] !== value)) ||
      /^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_USE_ENV_PROXY|DATABASE_URL|SUPABASE_DB_URL|AA2_TEST_DB_CONTAINER|DOCUMENT_EVIDENCE_TEST_DB_URL)$/.test(
        upper,
      ) ||
      upper.startsWith("DOTENV_") ||
      upper.startsWith("PG")
    )
      refuse();
  }
}

/**
 * Checks declarations and local ledger metadata only. It does not authenticate,
 * prove target isolation, inspect a running app's cached config, seal a child
 * process or enforce network policy. Callers must supply the actual child env.
 * Global/native-SQL/restore admission needs separate reviewed target contracts.
 */
export function requireManagedTestTarget(
  request: ManagedTestRequest,
  environment: NodeJS.ProcessEnv,
) {
  if (request.capability !== "owned-fixtures")
    throw new Error("Managed test capability is not supported by this guard");
  requireManagedApiTarget(request.targetUrl);
  if (
    typeof request.purpose !== "string" ||
    !/^[a-z][a-z0-9-]{2,63}$/.test(request.purpose) ||
    typeof request.runId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.runId,
    ) ||
    request.ledgerPath !==
      `/tmp/resumide-managed-${request.runId}/fixtures.jsonl` ||
    environment.MANAGED_TEST_AUTHORIZATION !== "synthetic-owned-records-only" ||
    environment.MANAGED_TEST_TARGET_URL !== request.targetUrl ||
    environment.MANAGED_TEST_PURPOSE !== request.purpose ||
    environment.MANAGED_TEST_RUN_ID !== request.runId ||
    environment.MANAGED_TEST_LEDGER !== request.ledgerPath ||
    environment.MANAGED_TEST_CAPABILITY !== request.capability ||
    environment.SUPABASE_URL !== request.targetUrl
  )
    refuse();
  for (const name of ["BROWSER_TEST_SUPABASE_URL", "AA7_TEST_SUPABASE_URL"])
    if (
      environment[name] !== undefined &&
      environment[name] !== request.targetUrl
    )
      refuse();
  const hasBrowserDeclarations = [
    "BROWSER_TEST_SUPABASE_URL",
    "BROWSER_SUPABASE_AUTHORIZATION",
    "BROWSER_TEST_LEDGER",
  ].some((name) => environment[name] !== undefined);
  const browserLedger = `/tmp/resumide-auth-audit-managed-${request.runId}.jsonl`;
  if (hasBrowserDeclarations) {
    if (
      environment.BROWSER_TEST_SUPABASE_URL !== request.targetUrl ||
      environment.BROWSER_SUPABASE_AUTHORIZATION !==
        "synthetic-owned-records-only" ||
      environment.BROWSER_TEST_LEDGER !== browserLedger
    )
      refuse();
    requirePrivateTestLedger(browserLedger);
  }
  for (const [name, value] of [
    ["BROWSER_SUPABASE_AUTHORIZATION", "synthetic-owned-records-only"],
    ["AA7_HOSTED_TEST_AUTHORIZATION", "temporary-synthetic-users-20261030"],
  ])
    if (environment[name] !== undefined && environment[name] !== value)
      refuse();
  requireSealedDeclarations(environment);
  try {
    const parent = lstatSync(dirname(request.ledgerPath));
    if (
      !parent.isDirectory() ||
      (parent.mode & 0o7777) !== 0o700 ||
      typeof process.getuid !== "function" ||
      parent.uid !== process.getuid()
    )
      refuse();
    requirePrivateTestLedger(request.ledgerPath);
    const after = lstatSync(dirname(request.ledgerPath));
    if (!sameFile(parent, after) || !after.isDirectory()) refuse();
  } catch {
    refuse();
  }
  return Object.freeze({
    targetUrl: request.targetUrl,
    purpose: request.purpose,
    runId: request.runId,
    ledgerPath: request.ledgerPath,
    ledgerBindings: Object.freeze({
      primary: request.ledgerPath,
      ...(hasBrowserDeclarations ? { browser: browserLedger } : {}),
    }),
    capability: request.capability,
    evidence: "configuration-and-local-ledger-only" as const,
  });
}
