import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_OPENAI_MODEL } from "../app/lib/server/openai-model.ts";
import {
  requireManagedApiTarget,
  requireManagedTestTarget,
  type ManagedTestRequest,
} from "./managed-test-target.ts";

const REFUSAL = "JD clause-order browser target refused";
const BASE_URL = "http://127.0.0.1:3110" as const;
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BINDING = new URL(
  "../tasks/agent-handoffs/2026-11-09-reliability-implementation/jd-browser-build-binding.json",
  import.meta.url,
);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const BindingSchema = z.strictObject({
  schemaVersion: z.literal("jd-clause-order-browser-build/1.0.0"),
  evidenceTier: z.literal("local-source-and-build-byte-integrity-only"),
  expectedTargetUrl: z.string().nullable(),
  runtime: z.strictObject({
    node: z.string(),
    unicode: z.string(),
    icu: z.string(),
    v8: z.string(),
  }),
  sourceHashes: z
    .record(z.string(), digest)
    .refine(
      (value) =>
        Object.keys(value).length > 0 && Object.keys(value).length <= 2_000,
    ),
  artifacts: z
    .record(
      z.string(),
      z.strictObject({
        sha256: digest,
        bytes: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 * 1024),
      }),
    )
    .refine(
      (value) =>
        Object.keys(value).length > 0 && Object.keys(value).length <= 2_000,
    ),
  verifiedBy: z.strictObject({
    receipt: z.string(),
    receiptSha256: digest,
    reconciliation: z.string(),
    reconciliationSha256: digest,
    actualCommandCodes: z.array(z.literal(0)).length(6),
    originalWrapperExitCode: z.literal(1),
    note: z.string(),
  }),
  targetAdmission: z.string(),
  workerExecution: z.literal(
    "EXTERNAL_SEPARATE_GLOBAL_WORKER_APPROVAL_REQUIRED",
  ),
});
export type JdClauseOrderBrowserBuildBinding = z.infer<typeof BindingSchema>;

export const JD_CLAUSE_ORDER_BROWSER_FEATURES = Object.freeze({
  ANALYSIS_ADMISSION_BINDING_ENABLED: "true",
  ANALYSIS_FENCING_ENABLED: "true",
  EVIDENCE_REVIEW_ENABLED: "true",
  NATIVE_EVIDENCE_ENABLED: "true",
  CANONICAL_AUTHORING_ENABLED: "true",
  JOB_INTELLIGENCE_ENABLED: "true",
  JOB_RELATIONS_ENABLED: "true",
  SCORING_V2_ENABLED: "true",
  AUTHORING_ENABLED: "true",
  TYPED_AUTHORING_ENABLED: "true",
  AI_ENABLED: "false",
  AI_BUDGET_ENABLED: "false",
  BUILD_AI_ASSIST_ENABLED: "false",
  LATEX_CONVERTER_ENABLED: "false",
  ARTIFACT_RENDERING_ENABLED: "false",
  CANONICAL_REWRITE_ENABLED: "false",
  CANONICAL_CORRECTIONS_ENABLED: "false",
  INITIAL_FEEDBACK_ENABLED: "false",
  LEGACY_SCORING_INPUT_ENABLED: "false",
  NATIVE_LAYOUT_ENABLED: "false",
} as const);

function refuse(): never {
  throw new Error(REFUSAL);
}
function parseBinding(value: unknown): JdClauseOrderBrowserBuildBinding {
  const parsed = BindingSchema.safeParse(value);
  if (!parsed.success) refuse();
  return parsed.data;
}
export function readJdClauseOrderBrowserBuildBinding(): JdClauseOrderBrowserBuildBinding {
  try {
    return parseBinding(JSON.parse(readFileSync(BINDING, "utf8")));
  } catch {
    refuse();
  }
}
export function createJdClauseOrderBrowserTestRequest(
  environment: NodeJS.ProcessEnv,
): ManagedTestRequest {
  return {
    targetUrl: environment.SUPABASE_URL ?? "",
    purpose: "jd-clause-order-browser",
    runId: environment.MANAGED_TEST_RUN_ID ?? "",
    ledgerPath: environment.MANAGED_TEST_LEDGER ?? "",
    capability: "owned-fixtures",
  };
}

function localPath(root: string, path: string): string {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (part) =>
          !part || part === "." || part === ".." || part.startsWith(".env"),
      )
  )
    refuse();
  const full = resolve(root, path);
  if (
    relative(root, full).startsWith(`..${sep}`) ||
    realpathSync(full) !== full
  )
    refuse();
  return full;
}
function checkFile(
  root: string,
  path: string,
  expected: string,
  bytes?: number,
) {
  const file = localPath(root, path);
  let fd: number | undefined;
  try {
    const before = lstatSync(file);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > 64 * 1024 * 1024 ||
      (bytes !== undefined && before.size !== bytes)
    )
      refuse();
    fd = openSync(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      refuse();
    const data = readFileSync(fd);
    const after = fstatSync(fd),
      named = lstatSync(file);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      named.dev !== before.dev ||
      named.ino !== before.ino ||
      after.size !== before.size ||
      data.length !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      createHash("sha256").update(data).digest("hex") !== expected
    )
      refuse();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function buildFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (path: string, depth: number) => {
    if (depth > 32 || result.length > 2_000) refuse();
    for (const entry of readdirSync(localPath(root, path), {
      withFileTypes: true,
    })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(child, depth + 1);
      else if (entry.isFile()) {
        localPath(root, child);
        result.push(child);
      } else refuse();
    }
  };
  for (const path of ["build/client", "build/server", "build/worker"])
    walk(path, 0);
  return result.sort();
}

/** Local declarations, private ledgers and point-in-time byte checks only.
 * This cannot prove project isolation, permission, a running server or worker.
 * The optional root is solely a disposable-filesystem unit-test seam; production
 * callers use the fixed binding and repository root, never an env-selected path.
 */
export function requireJdClauseOrderBrowserTarget(
  request: ManagedTestRequest,
  environment: NodeJS.ProcessEnv,
  expectedBuild: JdClauseOrderBrowserBuildBinding,
  optionalLocalTestRoot?: string,
) {
  try {
    const binding = parseBinding(expectedBuild);
    // The fixed Root target is currently null. Refuse before any ledger/build
    // reads or application import, regardless of legacy environment declarations.
    if (
      binding.expectedTargetUrl === null ||
      request.targetUrl !== binding.expectedTargetUrl ||
      request.purpose !== "jd-clause-order-browser" ||
      request.capability !== "owned-fixtures"
    )
      refuse();
    requireManagedApiTarget(binding.expectedTargetUrl);
    requireManagedTestTarget(request, environment);
    if (
      environment.BROWSER_TEST_SUPABASE_URL !== binding.expectedTargetUrl ||
      environment.BROWSER_SUPABASE_AUTHORIZATION !==
        "synthetic-owned-records-only" ||
      environment.BROWSER_TEST_LEDGER !==
        `/tmp/resumide-auth-audit-managed-${request.runId}.jsonl`
    )
      refuse();
    if (
      binding.runtime.node !== process.version ||
      binding.runtime.unicode !== process.versions.unicode ||
      binding.runtime.icu !== process.versions.icu ||
      binding.runtime.v8 !== process.versions.v8 ||
      process.version !== "v22.23.4"
    )
      refuse();
    for (const [key, value] of Object.entries(JD_CLAUSE_ORDER_BROWSER_FEATURES))
      if (environment[key] !== value) refuse();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) continue;
      const upper = key.toUpperCase();
      if (
        /^(?:AWS|AZURE|GOOGLE|GCLOUD|ANTHROPIC|GEMINI|COHERE|VERTEX|OCR)_/u.test(
          upper,
        ) ||
        upper.endsWith("_PROXY") ||
        upper === "NO_PROXY" ||
        upper === "BUILD_AI_TEST_HARNESS" ||
        (upper === "LATEX_COMPILER_IMAGE" && value !== "")
      )
        refuse();
    }
    if (
      environment.NODE_ENV !== "production" ||
      environment.HOST !== "127.0.0.1" ||
      environment.PORT !== "3110" ||
      environment.APP_ORIGIN !== BASE_URL ||
      environment.OPENAI_MODEL !== DEFAULT_OPENAI_MODEL ||
      !environment.SUPABASE_PUBLISHABLE_KEY ||
      !environment.SUPABASE_SECRET_KEY ||
      !environment.HOME ||
      !isAbsolute(environment.HOME)
    )
      refuse();
    const root = realpathSync(optionalLocalTestRoot ?? ROOT);
    for (const required of [
      "app/lib/server/document-page-count-readiness-profile.ts",
      "app/lib/server/jd-clause-order-readiness-profile.ts",
      "scripts/server.mjs",
      "package-lock.json",
    ])
      if (!(required in binding.sourceHashes)) refuse();
    for (const required of [
      "build/server/index.js",
      "build/worker/analysis.mjs",
    ])
      if (!(required in binding.artifacts)) refuse();
    for (const [path, expected] of Object.entries(binding.sourceHashes))
      checkFile(root, path, expected);
    const artifactPaths = Object.keys(binding.artifacts).sort();
    if (JSON.stringify(buildFiles(root)) !== JSON.stringify(artifactPaths))
      refuse();
    for (const [path, expected] of Object.entries(binding.artifacts)) {
      if (!/^(?:build\/client|build\/server|build\/worker)\//u.test(path))
        refuse();
      checkFile(root, path, expected.sha256, expected.bytes);
    }
    const serverEnv: Record<string, string> = {
      ...JD_CLAUSE_ORDER_BROWSER_FEATURES,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "3110",
      APP_ORIGIN: BASE_URL,
      OPENAI_API_KEY: "build-ai-harness-no-live-key",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
      HOME: environment.HOME,
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
      LANG: "C",
      TZ: "UTC",
      NO_COLOR: "1",
    };
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_RESUME_BUCKET",
      "ANALYZE_INVITE_TOKEN",
      "RESUMIDE_PRIVATE_VERIFY",
      "MANAGED_TEST_AUTHORIZATION",
      "MANAGED_TEST_TARGET_URL",
      "MANAGED_TEST_PURPOSE",
      "MANAGED_TEST_RUN_ID",
      "MANAGED_TEST_LEDGER",
      "MANAGED_TEST_CAPABILITY",
      "BROWSER_TEST_SUPABASE_URL",
      "BROWSER_SUPABASE_AUTHORIZATION",
      "BROWSER_TEST_LEDGER",
    ])
      if (environment[key] !== undefined) serverEnv[key] = environment[key];
    return Object.freeze({
      baseURL: BASE_URL,
      targetUrl: request.targetUrl,
      runId: request.runId,
      ledgerPath: request.ledgerPath,
      serverEnv: Object.freeze(serverEnv),
      evidence: "configuration-local-ledger-and-build-bytes-only" as const,
    });
  } catch {
    refuse();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3 || process.argv[2] !== "--serve") refuse();
  const admitted = requireJdClauseOrderBrowserTarget(
    createJdClauseOrderBrowserTestRequest(process.env),
    process.env,
    readJdClauseOrderBrowserBuildBinding(),
  );
  // Replace inherited values before any app/config/build import. The separately
  // launched Playwright parent must itself start with the approved sealed env.
  process.env = { ...admitted.serverEnv };
  await import(new URL("./server.mjs", import.meta.url).href);
}
