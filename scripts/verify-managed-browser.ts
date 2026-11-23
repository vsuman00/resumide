import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  fixtureBundleKey,
  readFixtureBundle,
  writeFixtureBundle,
} from "./managed-fixture-bundle.ts";
import { readPrivateTestLedger } from "./managed-test-target.ts";
import {
  managedDbConcurrencySource,
  managedDbConnection,
  runManagedPsql,
} from "./verify-managed-db.ts";
import {
  removeManagedLatexRateBuckets,
  verifyManagedBrowserCleanup,
} from "./verify-managed-browser-cleanup.ts";

const scope = "isolated-authenticated-browser-fixtures";
const preflightMarker = "resumide-managed-browser-preflight-complete";
const bundlePrefix = Buffer.from("resumide-browser-ledgers-v1\n");
const runIdSchema = z.uuidv4().regex(/^[a-f0-9-]+$/);
const bundleSchema = z.strictObject({
  runId: runIdSchema,
  targetUrl: z.url(),
  browser: z.string().max(128 * 1024),
  converter: z.string().max(128 * 1024),
});

function ledgerPaths(runId: string) {
  return {
    browser: `/tmp/resumide-auth-audit-managed-${runId}.jsonl`,
    converter: `/tmp/resumide-aa7-managed-${runId}.jsonl`,
  };
}

function retainLedgers(
  runId: string,
  targetUrl: string,
  directory: string,
  key: Buffer,
) {
  const paths = ledgerPaths(runId);
  writeFixtureBundle(
    join(directory, "fixture-ledgers.enc"),
    bundlePrefix,
    {
      runId,
      targetUrl,
      browser: readPrivateTestLedger(paths.browser),
      converter: readPrivateTestLedger(paths.converter),
    },
    key,
  );
}

export function recoverManagedBrowserLedgers(
  file: string,
  environment: NodeJS.ProcessEnv,
) {
  const { runId, targetUrl, browser, converter } = bundleSchema.parse(
    readFixtureBundle(
      file,
      bundlePrefix,
      fixtureBundleKey(environment.MANAGED_BROWSER_LEDGER_KEY),
    ),
  );
  if (targetUrl !== environment.SUPABASE_URL)
    throw new Error(
      "Managed browser ledger target differs from recovery target",
    );
  const paths = ledgerPaths(runId);
  for (const [path, expected] of [
    [paths.browser, browser],
    [paths.converter, converter],
  ]) {
    try {
      writeFileSync(path, expected, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        readPrivateTestLedger(path) !== expected
      )
        throw error;
    }
  }
  return runId;
}

type BrowserSuite = "core" | "latex";
const runBrowser = (environment: NodeJS.ProcessEnv, suite: BrowserSuite) => {
  const command = spawnSync(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      suite === "latex"
        ? "playwright.latex.config.ts"
        : "playwright.managed.config.ts",
    ],
    { env: environment, stdio: "ignore", timeout: 330_000 },
  );
  return command.status === 0;
};

function localCompilerAvailable(image: string, environment: NodeJS.ProcessEnv) {
  if (
    environment.DOCKER_HOST !== undefined ||
    environment.DOCKER_CONTEXT !== undefined
  )
    return false;
  const inspect = (...args: string[]) =>
    spawnSync("docker", args, {
      env: { PATH: environment.PATH, HOME: environment.HOME },
      encoding: "utf8",
      timeout: 5000,
    });
  const context = inspect(
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  );
  if (
    context.status !== 0 ||
    !/^unix:\/\/\/[^\r\n]+$/u.test(context.stdout.trim())
  )
    return false;
  const artifact = inspect(
    "image",
    "inspect",
    "--format",
    "{{.Id}} {{.Os}}/{{.Architecture}}",
    image,
  );
  if (
    artifact.status !== 0 ||
    artifact.stdout.trim() !== image + " linux/arm64"
  )
    return false;
  const owned = inspect(
    "ps",
    "-aq",
    "--filter",
    "label=resumide.latex.service=converter",
  );
  return owned.status === 0 && owned.stdout.trim() === "";
}

export async function verifyManagedBrowser(
  environment: NodeJS.ProcessEnv,
  operations: {
    runSql: typeof runManagedPsql;
    runBrowser: typeof runBrowser;
    audit: typeof verifyManagedBrowserCleanup;
    compilerAvailable?: typeof localCompilerAvailable;
  } = {
    runSql: runManagedPsql,
    runBrowser,
    audit: verifyManagedBrowserCleanup,
  },
  suite: BrowserSuite = "core",
) {
  let stage = "admission";
  try {
    const checkCompiler =
      operations.compilerAvailable ?? localCompilerAvailable;
    const url = environment.SUPABASE_URL;
    const browserDirectory = environment.MANAGED_BROWSER_OUTPUT_DIR;
    if (
      environment.MANAGED_BROWSER_AUTHORIZATION !== scope ||
      !url ||
      !environment.SUPABASE_PUBLISHABLE_KEY ||
      !environment.SUPABASE_SECRET_KEY ||
      !browserDirectory ||
      !isAbsolute(browserDirectory) ||
      resolve(browserDirectory) !== browserDirectory
    )
      throw new Error("Managed browser admission unavailable");
    const compiler =
      suite === "latex" ? environment.LATEX_TEST_IMAGE : undefined;
    if (
      suite === "latex" &&
      (environment.AA7_HOSTED_TEST_AUTHORIZATION !==
        "temporary-synthetic-users-20261030" ||
        environment.AA7_TEST_SUPABASE_URL !== url ||
        !compiler ||
        !/^sha256:[a-f0-9]{64}$/u.test(compiler) ||
        !checkCompiler(compiler, environment))
    )
      throw new Error("Managed LaTeX browser admission unavailable");
    const key = fixtureBundleKey(environment.MANAGED_BROWSER_LEDGER_KEY);
    const connection = managedDbConnection(environment);
    if (
      environment.SUPABASE_RESUME_BUCKET &&
      environment.SUPABASE_RESUME_BUCKET !== "resumes"
    )
      throw new Error(
        "Managed browser target requires the verified resumes bucket",
      );
    const runId = randomUUID();
    const { browser, converter } = ledgerPaths(runId);
    mkdirSync(browserDirectory, { mode: 0o700 });
    const artifacts = join(browserDirectory, "private-playwright");
    mkdirSync(artifacts, { mode: 0o700 });
    const child = {
      PATH: environment.PATH,
      HOME: environment.HOME,
      TMPDIR: environment.TMPDIR,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: environment.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: environment.SUPABASE_SECRET_KEY,
      SUPABASE_RESUME_BUCKET: "resumes",
      BROWSER_TEST_SUPABASE_URL: url,
      BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
      BROWSER_TEST_LEDGER: browser,
      AA7_AUTH_RECEIPT_FILE: converter,
      BROWSER_EVIDENCE_DIR: artifacts,
      BROWSER_PRIVATE_OUTPUT_DIR: join(artifacts, "playwright"),
      MANAGED_BROWSER_CORE: "isolated-synthetic",
      OPENAI_API_KEY: "build-ai-harness-no-live-key",
      AI_ENABLED: "false",
      ...(compiler
        ? {
            LATEX_COMPILER_IMAGE: compiler,
            AA7_HOSTED_TEST_AUTHORIZATION:
              environment.AA7_HOSTED_TEST_AUTHORIZATION,
            AA7_TEST_SUPABASE_URL: url,
          }
        : {}),
    };
    stage = "preflight";
    const input =
      managedDbConcurrencySource().preflight +
      "\n\\echo " +
      preflightMarker +
      "\n";
    const ready = operations.runSql(input, connection);
    if (
      ready.status !== 0 ||
      ready.stdout.trim().split(/\r?\n/).at(-1) !== preflightMarker
    )
      throw new Error("Managed browser database readiness failed");
    writeFileSync(browser, "", { flag: "wx", mode: 0o600 });
    writeFileSync(converter, "", { flag: "wx", mode: 0o600 });
    stage = "browser";
    let passed = false;
    let compilerClean = !compiler;
    try {
      passed = operations.runBrowser(child, suite);
    } catch {
      passed = false;
    }
    if (compiler && passed) {
      try {
        compilerClean = checkCompiler(compiler, environment);
      } catch {
        compilerClean = false;
      }
    }
    let ledgerRetained = false;
    try {
      retainLedgers(runId, url, browserDirectory, key);
      ledgerRetained = true;
    } catch {
      ledgerRetained = false;
    }
    stage = "audit";
    const auditEnvironment = {
      ...environment,
      BROWSER_TEST_SUPABASE_URL: url,
      BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
      BROWSER_TEST_LEDGER: browser,
      AA7_AUTH_RECEIPT_FILE: converter,
      MANAGED_BROWSER_CLEANUP_RUN_ID: runId,
    };
    const rateCleanup =
      compiler && passed && compilerClean && ledgerRetained
        ? removeManagedLatexRateBuckets(auditEnvironment, operations.runSql)
            .status
        : "not_run";
    const result = await operations.audit(auditEnvironment, operations.runSql);
    return {
      status:
        passed &&
        ledgerRetained &&
        result.status === "verified" &&
        (!compiler || rateCleanup === "verified")
          ? "verified"
          : "failed",
      stage: "complete",
      runId,
      browserPassed: passed,
      ledgerRetained,
      auditStatus: result.status,
      ...(compiler
        ? {
            converterRateCleanup: rateCleanup,
            converterRuntimeClean: compilerClean,
          }
        : {}),
      residuals: "residuals" in result ? result.residuals : [],
    };
  } catch {
    return {
      status: stage === "admission" ? "unavailable" : "failed",
      stage,
    };
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (process.argv.length === 4 && process.argv[2] === "--recover") {
    try {
      const runId = recoverManagedBrowserLedgers(process.argv[3], process.env);
      process.stdout.write(
        JSON.stringify({ status: "recovered", runId }) + "\n",
      );
    } catch {
      process.stderr.write("Browser ledger recovery failed.\n");
      process.exitCode = 1;
    }
  } else {
    const result =
      process.argv.length === 2
        ? await verifyManagedBrowser(process.env)
        : process.argv.length === 3 && process.argv[2] === "--latex"
          ? await verifyManagedBrowser(process.env, undefined, "latex")
          : { status: "unavailable", stage: "arguments" };
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode =
      result.status === "verified" ? 0 : result.status === "failed" ? 1 : 2;
  }
}
