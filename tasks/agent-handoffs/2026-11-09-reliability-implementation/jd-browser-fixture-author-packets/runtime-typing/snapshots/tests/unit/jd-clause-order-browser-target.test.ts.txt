import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPENAI_MODEL } from "../../app/lib/server/openai-model";
import {
  createJdClauseOrderBrowserTestRequest,
  JD_CLAUSE_ORDER_BROWSER_FEATURES,
  readJdClauseOrderBrowserBuildBinding,
  requireJdClauseOrderBrowserTarget,
  type JdClauseOrderBrowserBuildBinding,
} from "../../scripts/jd-clause-order-browser-target";

const owned: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of owned.splice(0).reverse())
    rmSync(path, { recursive: true, force: true });
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
// Synthetic byte/ledger fixtures only: these are not application builds, managed
// target approval, provider credentials or evidence of project isolation.
function fixture() {
  const { unicode, icu } = process.versions;
  if (unicode !== "17.0" || icu !== "78.3")
    throw new Error("Synthetic fixture requires pinned Unicode/ICU runtime");
  const root = mkdtempSync(join(tmpdir(), "resumide-jd-browser-unit-"));
  owned.push(root);
  const runId = randomUUID();
  const parent = `/tmp/resumide-managed-${runId}`;
  mkdirSync(parent, { mode: 0o700 });
  owned.push(parent);
  const ledger = `${parent}/fixtures.jsonl`;
  writeFileSync(ledger, "", { mode: 0o600, flag: "wx" });
  const browserLedger = `/tmp/resumide-auth-audit-managed-${runId}.jsonl`;
  writeFileSync(browserLedger, "", { mode: 0o600, flag: "wx" });
  owned.push(browserLedger);
  const target = "https://synthetic-jd-browser.supabase.co";
  const environment: NodeJS.ProcessEnv = {
    ...JD_CLAUSE_ORDER_BROWSER_FEATURES,
    HOME: root,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "3110",
    APP_ORIGIN: "http://127.0.0.1:3110",
    RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
    OPENAI_API_KEY: "build-ai-harness-no-live-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
    SUPABASE_URL: target,
    SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
    SUPABASE_SECRET_KEY: "synthetic-secret",
    SUPABASE_RESUME_BUCKET: "resumes",
    MANAGED_TEST_AUTHORIZATION: "synthetic-owned-records-only",
    MANAGED_TEST_TARGET_URL: target,
    MANAGED_TEST_PURPOSE: "jd-clause-order-browser",
    MANAGED_TEST_RUN_ID: runId,
    MANAGED_TEST_LEDGER: ledger,
    MANAGED_TEST_CAPABILITY: "owned-fixtures",
    BROWSER_TEST_SUPABASE_URL: target,
    BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
    BROWSER_TEST_LEDGER: browserLedger,
  };
  const sourceHashes: Record<string, string> = {};
  const artifacts: JdClauseOrderBrowserBuildBinding["artifacts"] = {};
  const write = (path: string, data: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  for (const path of [
    "app/lib/server/document-page-count-readiness-profile.ts",
    "app/lib/server/jd-clause-order-readiness-profile.ts",
    "scripts/server.mjs",
    "package-lock.json",
  ]) {
    const data = `synthetic source ${path}`;
    write(path, data);
    sourceHashes[path] = hash(data);
  }
  for (const path of [
    "build/client/assets/synthetic.js",
    "build/server/index.js",
    "build/worker/analysis.mjs",
  ]) {
    const data = `synthetic bytes ${path}`;
    write(path, data);
    artifacts[path] = { sha256: hash(data), bytes: Buffer.byteLength(data) };
  }
  const binding: JdClauseOrderBrowserBuildBinding = {
    schemaVersion: "jd-clause-order-browser-build/1.0.0",
    evidenceTier: "local-source-and-build-byte-integrity-only",
    expectedTargetUrl: target,
    runtime: {
      node: process.version,
      unicode,
      icu,
      v8: process.versions.v8,
    },
    sourceHashes,
    artifacts,
    verifiedBy: {
      receipt: "synthetic/receipt.json",
      receiptSha256: hash("synthetic receipt"),
      reconciliation: "synthetic/reconciliation.json",
      reconciliationSha256: hash("synthetic reconciliation"),
      actualCommandCodes: [0, 0, 0, 0, 0, 0],
      originalWrapperExitCode: 1,
      note: "synthetic local unit fixture; not actual execution or authority",
    },
    targetAdmission: "SYNTHETIC_UNIT_ONLY_NOT_APPROVAL",
    workerExecution: "EXTERNAL_SEPARATE_GLOBAL_WORKER_APPROVAL_REQUIRED",
  };
  const request = createJdClauseOrderBrowserTestRequest(environment);
  const check = () =>
    requireJdClauseOrderBrowserTarget(request, environment, binding, root);
  return {
    root,
    environment,
    binding,
    request,
    check,
    write,
    ledger,
    browserLedger,
  };
}

describe("dedicated JD2 browser local guard, not runtime authorization", () => {
  it("admits only complete synthetic local byte/ledger/environment fixtures", () => {
    const f = fixture();
    const admitted = f.check();
    expect(admitted).toMatchObject({
      baseURL: "http://127.0.0.1:3110",
      targetUrl: f.request.targetUrl,
      runId: f.request.runId,
      ledgerPath: f.ledger,
      evidence: "configuration-local-ledger-and-build-bytes-only",
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.serverEnv)).toBe(true);
    expect(admitted.serverEnv).toMatchObject(JD_CLAUSE_ORDER_BROWSER_FEATURES);
    expect(admitted.serverEnv.OPENAI_API_KEY).toBe(
      "build-ai-harness-no-live-key",
    );
  });
  it("reads the fixed Root binding with target still unapproved and refuses before local effects", () => {
    const binding = readJdClauseOrderBrowserBuildBinding();
    expect(binding.expectedTargetUrl).toBeNull();
    expect(() =>
      requireJdClauseOrderBrowserTarget(
        createJdClauseOrderBrowserTestRequest({}),
        {},
        binding,
        "/nonexistent-synthetic-test-root",
      ),
    ).toThrow("JD clause-order browser target refused");
  });
  it("does not let legacy environment markers override a null or different fixed target", () => {
    const f = fixture();
    f.binding.expectedTargetUrl = null;
    expect(f.check).toThrow();
    f.binding.expectedTargetUrl = "https://other-synthetic.supabase.co";
    expect(f.check).toThrow();
  });
  it("uses the passed environment independently of ambient browser declarations", () => {
    vi.stubEnv("BROWSER_TEST_SUPABASE_URL", "http://localhost:54321");
    try {
      const f = fixture();
      expect(f.check).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "https://synthetic-jd-browser.supabase.co/path",
    "https://synthetic-jd-browser.supabase.co?x=1",
  ])("rejects localhost bypass/unsafe target %s", (target) => {
    const f = fixture();
    f.binding.expectedTargetUrl = target;
    f.request.targetUrl = target;
    for (const key of [
      "SUPABASE_URL",
      "MANAGED_TEST_TARGET_URL",
      "BROWSER_TEST_SUPABASE_URL",
    ])
      f.environment[key] = target;
    expect(f.check).toThrow();
  });
  it.each(["global-queue", "native-sql", "restore"] as const)(
    "does not grant %s",
    (capability) => {
      const f = fixture();
      f.request.capability = capability;
      f.environment.MANAGED_TEST_CAPABILITY = capability;
      expect(f.check).toThrow();
    },
  );
  it.each([
    "BROWSER_TEST_SUPABASE_URL",
    "BROWSER_SUPABASE_AUTHORIZATION",
    "BROWSER_TEST_LEDGER",
    "MANAGED_TEST_AUTHORIZATION",
    "MANAGED_TEST_PURPOSE",
    "MANAGED_TEST_RUN_ID",
  ])("requires actual matching %s", (key) => {
    const f = fixture();
    delete f.environment[key];
    expect(f.check).toThrow();
  });
  it.each(Object.entries(JD_CLAUSE_ORDER_BROWSER_FEATURES))(
    "requires exact %s=%s",
    (key, value) => {
      const f = fixture();
      f.environment[key] = value === "true" ? "false" : "true";
      expect(f.check).toThrow();
    },
  );
  it.each([
    "HTTP_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "NO_PROXY",
    "NODE_OPTIONS",
    "NODE_EXTRA_CA_CERTS",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "NODE_USE_ENV_PROXY",
    "DATABASE_URL",
    "PGHOST",
    "DOTENV_CONFIG_PATH",
    "OPENAI_ORG_ID",
    "AWS_ACCESS_KEY_ID",
    "AZURE_OPENAI_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "ANTHROPIC_API_KEY",
    "OCR_PROVIDER",
    "BUILD_AI_TEST_HARNESS",
  ])("rejects hazardous inherited %s", (key) => {
    const f = fixture();
    f.environment[key] = "synthetic-forbidden";
    expect(f.check).toThrow();
  });
  it("drops unrelated ambient settings from the child allowlist", () => {
    const f = fixture();
    f.environment.UNRELATED_SYNTHETIC = "not-forwarded";
    f.environment.PATH = "/synthetic/untrusted";
    const admitted = f.check();
    expect(admitted.serverEnv.UNRELATED_SYNTHETIC).toBeUndefined();
    expect(admitted.serverEnv.PATH).not.toContain("untrusted");
    expect(admitted.serverEnv.PATH).toContain("/usr/bin:/bin");
  });
  it.each(["node", "unicode", "icu", "v8"] as const)(
    "rejects wrong pinned %s",
    (key) => {
      const f = fixture();
      f.binding.runtime[key] = "wrong-synthetic-runtime";
      expect(f.check).toThrow();
    },
  );
  it.each([
    "HOST",
    "PORT",
    "APP_ORIGIN",
    "NODE_ENV",
    "OPENAI_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ])("rejects wrong or missing %s", (key) => {
    const f = fixture();
    delete f.environment[key];
    expect(f.check).toThrow();
  });
  it.each(["managed", "browser"])(
    "requires a private actual %s ledger",
    (which) => {
      const f = fixture();
      chmodSync(which === "managed" ? f.ledger : f.browserLedger, 0o644);
      expect(f.check).toThrow();
    },
  );
  it("rejects symlink ledgers", () => {
    const f = fixture();
    rmSync(f.browserLedger);
    symlinkSync(f.ledger, f.browserLedger);
    expect(f.check).toThrow();
  });
  it("rejects missing and altered sources and artifacts", () => {
    const f = fixture();
    f.write("scripts/server.mjs", "synthetic altered");
    expect(f.check).toThrow();
    f.binding.sourceHashes["scripts/server.mjs"] = hash("synthetic altered");
    expect(f.check).not.toThrow();
    rmSync(join(f.root, "build/server/index.js"));
    expect(f.check).toThrow();
  });
  it("rejects mismatched artifact byte counts and hashes", () => {
    const f = fixture();
    f.binding.artifacts["build/server/index.js"].bytes++;
    expect(f.check).toThrow();
    f.binding.artifacts["build/server/index.js"].bytes--;
    f.binding.artifacts["build/server/index.js"].sha256 = "0".repeat(64);
    expect(f.check).toThrow();
  });
  it("rejects unbound extra build files", () => {
    const f = fixture();
    f.write("build/server/extra.js", "synthetic extra");
    expect(f.check).toThrow();
  });
  it("rejects symlink source files and build directories", () => {
    const f = fixture();
    rmSync(join(f.root, "scripts/server.mjs"));
    symlinkSync(
      join(f.root, "package-lock.json"),
      join(f.root, "scripts/server.mjs"),
    );
    expect(f.check).toThrow();
  });
  it("rejects path traversal and missing mandatory source/profile closure", () => {
    const f = fixture();
    f.binding.sourceHashes["../synthetic-escape"] = hash("synthetic");
    expect(f.check).toThrow();
    delete f.binding.sourceHashes["../synthetic-escape"];
    delete f.binding.sourceHashes[
      "app/lib/server/document-page-count-readiness-profile.ts"
    ];
    expect(f.check).toThrow();
  });
  it("keeps dedicated config and CLI entry isolated from default globs and app imports", () => {
    const config = readFileSync(
      new URL("../../playwright.jd-clause-order.config.ts", import.meta.url),
      "utf8",
    );
    for (const literal of [
      'testMatch: "jd-clause-order.journey.ts"',
      "workers: 1",
      "retries: 0",
      "reuseExistingServer: false",
      'screenshot: "off"',
      'trace: "off"',
      'video: "off"',
    ])
      expect(config).toContain(literal);
    expect(config).not.toContain("env-file");
    expect(config).not.toContain("run-worker");
    const script = readFileSync(
      new URL(
        "../../scripts/jd-clause-order-browser-target.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const entry = script.slice(script.indexOf("process.argv[1] &&"));
    expect(entry.indexOf("requireJdClauseOrderBrowserTarget")).toBeLessThan(
      entry.indexOf("process.env ="),
    );
    expect(entry.indexOf("process.env =")).toBeLessThan(
      entry.indexOf("await import("),
    );
    expect(entry).toContain('process.argv[2] !== "--serve"');
    expect(entry).not.toContain("optionalLocalTestRoot");
  });
});
