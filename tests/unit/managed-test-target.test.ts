import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireManagedTestTarget,
  type ManagedTestRequest,
} from "../../scripts/managed-test-target";

const directories: string[] = [];
const legacyLedgers: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const path of legacyLedgers.splice(0)) rmSync(path);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});

function fixture() {
  const runId = randomUUID();
  const directory = `/tmp/resumide-managed-${runId}`;
  mkdirSync(directory, { mode: 0o700 });
  directories.push(directory);
  const request: ManagedTestRequest = {
    targetUrl: "https://synthetic-project.supabase.co",
    purpose: "reliability-owned-fixtures-v1",
    runId,
    ledgerPath: `${directory}/fixtures.jsonl`,
    capability: "owned-fixtures",
  };
  writeFileSync(request.ledgerPath, "", { flag: "wx", mode: 0o600 });
  const environment: NodeJS.ProcessEnv = {
    MANAGED_TEST_AUTHORIZATION: "synthetic-owned-records-only",
    MANAGED_TEST_TARGET_URL: request.targetUrl,
    MANAGED_TEST_PURPOSE: request.purpose,
    MANAGED_TEST_RUN_ID: runId,
    MANAGED_TEST_LEDGER: request.ledgerPath,
    MANAGED_TEST_CAPABILITY: request.capability,
    SUPABASE_URL: request.targetUrl,
    AI_ENABLED: "false",
    OPENAI_API_KEY: "build-ai-harness-no-live-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
  };
  return { request, environment, directory };
}

function addBrowserDeclarations(value: ReturnType<typeof fixture>) {
  const path = `/tmp/resumide-auth-audit-managed-${value.request.runId}.jsonl`;
  writeFileSync(path, "", { flag: "wx", mode: 0o600 });
  legacyLedgers.push(path);
  Object.assign(value.environment, {
    BROWSER_TEST_LEDGER: path,
    BROWSER_TEST_SUPABASE_URL: value.request.targetUrl,
    BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
  });
  return path;
}

describe("declared managed owned-fixture target admission", () => {
  it("admits exact declarations and an owned private ledger without claiming external proof", () => {
    const { request, environment } = fixture();
    const before = structuredClone(environment);
    const admission = requireManagedTestTarget(request, environment);
    expect(admission).toEqual({
      ...request,
      ledgerBindings: { primary: request.ledgerPath },
      evidence: "configuration-and-local-ledger-only",
    });
    expect(Object.isFrozen(admission)).toBe(true);
    expect(Object.isFrozen(admission.ledgerBindings)).toBe(true);
    expect(environment).toEqual(before);
  });

  it.each([
    "MANAGED_TEST_AUTHORIZATION",
    "MANAGED_TEST_TARGET_URL",
    "MANAGED_TEST_PURPOSE",
    "MANAGED_TEST_RUN_ID",
    "MANAGED_TEST_LEDGER",
    "MANAGED_TEST_CAPABILITY",
    "SUPABASE_URL",
    "RESUMIDE_PRIVATE_VERIFY",
    "AI_ENABLED",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
  ])("rejects a missing or mismatched %s", (name) => {
    const { request, environment } = fixture();
    delete environment[name];
    expect(() => requireManagedTestTarget(request, environment)).toThrow(
      /^Managed test target admission refused$/,
    );
    environment[name] = "synthetic-mismatch";
    expect(() => requireManagedTestTarget(request, environment)).toThrow(
      /^Managed test target admission refused$/,
    );
  });

  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
    "https://host.docker.internal",
    "https://supabase_kong_fixture",
    "http://synthetic-project.supabase.co",
    "https://synthetic-project.supabase.co:8443",
    "https://synthetic-project.supabase.co/path",
    "https://synthetic-project.supabase.co?synthetic=true",
    "https://synthetic-project.supabase.co#synthetic",
    "https://synthetic-project.supabase.co?",
    "https://synthetic-project.supabase.co#",
    "https://synthetic-project.supabase.co/child/..",
    "https://synthetic-project.supabase.co.evil.example",
    "https://synthetic@synthetic-project.supabase.co",
    " https://synthetic-project.supabase.co",
    "synthetic-invalid-target",
  ])(
    "rejects local, fallback or unsafe target %# even when declarations match",
    (targetUrl) => {
      const { request, environment } = fixture();
      request.targetUrl = targetUrl;
      environment.MANAGED_TEST_TARGET_URL = targetUrl;
      environment.SUPABASE_URL = targetUrl;
      expect(() => requireManagedTestTarget(request, environment)).toThrow(
        /^Managed test target admission refused$/,
      );
    },
  );

  it("accepts default HTTPS normalization only with the exact same declared spelling", () => {
    const { request, environment } = fixture();
    request.targetUrl += ":443/";
    environment.MANAGED_TEST_TARGET_URL = request.targetUrl;
    environment.SUPABASE_URL = request.targetUrl;
    expect(() => requireManagedTestTarget(request, environment)).not.toThrow();
    environment.SUPABASE_URL = "https://synthetic-project.supabase.co";
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
  });

  it.each(["global-queue", "native-sql", "restore"] as const)(
    "does not turn a declared isolated %s capability into permission or proof",
    (capability) => {
      const { request, environment } = fixture();
      request.capability = capability;
      environment.MANAGED_TEST_CAPABILITY = capability;
      environment.MANAGED_TEST_ISOLATION = "exclusive-synthetic-target-only";
      expect(() => requireManagedTestTarget(request, environment)).toThrow(
        /^Managed test capability is not supported by this guard$/,
      );
    },
  );

  it("rejects a missing purpose even when a runtime caller omits both declarations", () => {
    const { request, environment } = fixture();
    Reflect.deleteProperty(request, "purpose");
    delete environment.MANAGED_TEST_PURPOSE;
    expect(() => requireManagedTestTarget(request, environment)).toThrow(
      /^Managed test target admission refused$/,
    );
  });

  it("rejects a ledger owned by another UID", () => {
    const { request, environment } = fixture();
    vi.spyOn(process, "getuid").mockReturnValue(process.getuid!() + 1);
    expect(() => requireManagedTestTarget(request, environment)).toThrow(
      /^Managed test target admission refused$/,
    );
  });

  it("refuses a FIFO before open, under a bounded standalone process", () => {
    const { request } = fixture();
    rmSync(request.ledgerPath);
    const environment = { PATH: process.env.PATH };
    execFileSync("mkfifo", [request.ledgerPath], {
      env: environment,
      timeout: 1000,
    });
    const moduleUrl = new URL(
      "../../scripts/managed-test-target.ts",
      import.meta.url,
    ).href;
    const program = `
      import { requirePrivateTestLedger } from ${JSON.stringify(moduleUrl)};
      try {
        requirePrivateTestLedger(${JSON.stringify(request.ledgerPath)});
        process.exitCode = 1;
      } catch (error) {
        if (error instanceof Error && error.message === "Managed test target admission refused")
          process.stdout.write("fifo-refused");
        else throw error;
      }
    `;
    expect(
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", program],
        { env: environment, timeout: 1500, encoding: "utf8" },
      ),
    ).toBe("fifo-refused");
  });

  it("returns only its public admission fields, never extra caller properties", () => {
    const { request, environment } = fixture();
    Object.assign(request, { extraSyntheticCredential: "synthetic-private" });
    expect(requireManagedTestTarget(request, environment)).not.toHaveProperty(
      "extraSyntheticCredential",
    );
  });

  it.each([
    ["purpose", ""],
    ["purpose", "../synthetic"],
    ["purpose", "a".repeat(65)],
    ["runId", ""],
    ["runId", "../synthetic"],
    ["ledgerPath", "/tmp/other.jsonl"],
  ] as const)("rejects malformed %s declarations", (key, value) => {
    const { request, environment } = fixture();
    request[key] = value;
    const names = {
      purpose: "MANAGED_TEST_PURPOSE",
      runId: "MANAGED_TEST_RUN_ID",
      ledgerPath: "MANAGED_TEST_LEDGER",
    };
    environment[names[key]] = value;
    expect(() => requireManagedTestTarget(request, environment)).toThrow(
      /^Managed test target admission refused$/,
    );
  });

  it.each([
    ["BROWSER_TEST_SUPABASE_URL", "https://other.supabase.co"],
    ["AA7_TEST_SUPABASE_URL", "https://other.supabase.co"],
    ["BROWSER_TEST_LEDGER", "/tmp/other.jsonl"],
    ["BROWSER_SUPABASE_AUTHORIZATION", "synthetic-mismatch"],
    ["AA7_HOSTED_TEST_AUTHORIZATION", "synthetic-mismatch"],
    ["BUILD_AI_ASSIST_ENABLED", "true"],
    ["BUILD_AI_TEST_HARNESS", "other"],
    ["OPENAI_API_KEY", "synthetic-real-looking-key"],
    ["OPENAI_BASE_URL", "https://other.example/v1"],
    ["OPENAI_MODEL", "synthetic-override"],
    ["OPENAI_ORG_ID", "synthetic-context"],
    ["OPENAI_PROJECT_ID", "synthetic-context"],
    ["OPENAI_LOG", "debug"],
    ["OPENAI_TIMEOUT_MS", "600000"],
    ["HTTP_PROXY", "http://proxy.example"],
    ["https_proxy", "http://proxy.example"],
    ["ALL_PROXY", "http://proxy.example"],
    ["NODE_OPTIONS", "--require=synthetic"],
    ["NODE_EXTRA_CA_CERTS", "/tmp/synthetic.pem"],
    ["NODE_TLS_REJECT_UNAUTHORIZED", "0"],
    ["NODE_USE_ENV_PROXY", "1"],
    ["DOTENV_CONFIG_PATH", "/tmp/synthetic.env"],
    ["DATABASE_URL", "postgresql://synthetic@other.example/postgres"],
    ["SUPABASE_DB_URL", "postgresql://synthetic@other.example/postgres"],
    ["PGHOST", "other.example"],
    ["AA2_TEST_DB_CONTAINER", "supabase_db_synthetic"],
    [
      "DOCUMENT_EVIDENCE_TEST_DB_URL",
      "postgresql://synthetic@localhost/postgres",
    ],
  ])(
    "rejects an inherited %s override with a fixed content-free error",
    (name, value) => {
      const { request, environment } = fixture();
      environment[name] = value;
      expect(() => requireManagedTestTarget(request, environment)).toThrow(
        /^Managed test target admission refused$/,
      );
    },
  );

  it("retains compatible exact browser declarations and the non-live harness marker", () => {
    const value = fixture();
    const { request, environment } = value;
    addBrowserDeclarations(value);
    Object.assign(environment, {
      AA7_TEST_SUPABASE_URL: request.targetUrl,
      AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
      BUILD_AI_ASSIST_ENABLED: "false",
      BUILD_AI_TEST_HARNESS: "selected-context-synthetic-only",
    });
    expect(() => requireManagedTestTarget(request, environment)).not.toThrow();
  });

  it("composes both guards under the same actual child environment with separate run-bound ledgers", () => {
    const value = fixture();
    const browser = addBrowserDeclarations(value);
    const managedModule = new URL(
      "../../scripts/managed-test-target.ts",
      import.meta.url,
    ).href;
    const browserModule = new URL(
      "../../scripts/browser-test-target.ts",
      import.meta.url,
    ).href;
    const program = `
      import { requireManagedTestTarget } from ${JSON.stringify(managedModule)};
      import { requireBrowserTestTarget } from ${JSON.stringify(browserModule)};
      const request = ${JSON.stringify(value.request)};
      requireBrowserTestTarget(request.targetUrl);
      const admission = requireManagedTestTarget(request, process.env);
      if (!Object.isFrozen(admission.ledgerBindings)) throw Error("Bindings are mutable");
      requireBrowserTestTarget(request.targetUrl);
      process.stdout.write(JSON.stringify(admission.ledgerBindings));
    `;
    const bindings = JSON.parse(
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", program],
        {
          env: value.environment,
          timeout: 1500,
          maxBuffer: 16384,
          encoding: "utf8",
        },
      ),
    );
    expect(bindings).toEqual({ primary: value.request.ledgerPath, browser });
  });

  it("rejects another run's valid browser ledger and the nested primary as a browser fallback", () => {
    const value = fixture();
    addBrowserDeclarations(value);
    const other = fixture();
    value.environment.BROWSER_TEST_LEDGER = addBrowserDeclarations(other);
    expect(() =>
      requireManagedTestTarget(value.request, value.environment),
    ).toThrow();
    value.environment.BROWSER_TEST_LEDGER = value.request.ledgerPath;
    expect(() =>
      requireManagedTestTarget(value.request, value.environment),
    ).toThrow();
  });

  it("requires complete browser acknowledgments and a private nonsymlink flat ledger", () => {
    const value = fixture();
    const path = addBrowserDeclarations(value);
    delete value.environment.BROWSER_SUPABASE_AUTHORIZATION;
    expect(() =>
      requireManagedTestTarget(value.request, value.environment),
    ).toThrow();
    value.environment.BROWSER_SUPABASE_AUTHORIZATION =
      "synthetic-owned-records-only";
    chmodSync(path, 0o644);
    expect(() =>
      requireManagedTestTarget(value.request, value.environment),
    ).toThrow();
    chmodSync(path, 0o600);
    rmSync(path);
    symlinkSync(value.request.ledgerPath, path);
    expect(() =>
      requireManagedTestTarget(value.request, value.environment),
    ).toThrow();
  });

  it("rejects missing/public/symlink/hardlink ledgers and public or symlink parents", () => {
    const { request, environment, directory } = fixture();
    const original = request.ledgerPath;
    rmSync(original);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
    writeFileSync(original, "", { mode: 0o644 });
    chmodSync(original, 0o644);
    expect(statSync(original).mode & 0o777).toBe(0o644);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
    chmodSync(original, 0o600);
    const other = `${directory}/other.jsonl`;
    linkSync(original, other);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
    rmSync(other);
    rmSync(original);
    writeFileSync(other, "", { mode: 0o600 });
    symlinkSync(other, original);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
    rmSync(original);
    rmSync(other);
    writeFileSync(original, "", { mode: 0o600 });
    chmodSync(directory, 0o755);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
    chmodSync(directory, 0o700);
    const moved = `${directory}-actual`;
    mkdirSync(moved, { mode: 0o700 });
    directories.push(moved);
    writeFileSync(`${moved}/fixtures.jsonl`, "", { mode: 0o600 });
    rmSync(directory, { recursive: true });
    symlinkSync(moved, directory);
    expect(() => requireManagedTestTarget(request, environment)).toThrow();
  });
});
