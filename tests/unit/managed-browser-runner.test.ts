import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recoverManagedBrowserLedgers,
  verifyManagedBrowser,
} from "../../scripts/verify-managed-browser";
import { verifyManagedBrowserCleanup as auditCleanup } from "../../scripts/verify-managed-browser-cleanup";

const files = new Set<string>();
const directories = new Set<string>();
afterEach(() => {
  for (const path of files) rmSync(path, { force: true });
  for (const path of directories)
    rmSync(path, { recursive: true, force: true });
  files.clear();
  directories.clear();
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "resumide-browser-test-"));
  directories.add(root);
  const ca = join(root, "ca.pem");
  writeFileSync(ca, "offline placeholder");
  const url = "https://synthetic-ci.supabase.co";
  const output = join(root, "test-run");
  const env = {
    PATH: "/usr/bin",
    MANAGED_BROWSER_AUTHORIZATION: "isolated-authenticated-browser-fixtures",
    MANAGED_BROWSER_OUTPUT_DIR: output,
    MANAGED_BROWSER_LEDGER_KEY: randomBytes(32).toString("base64"),
    MANAGED_DB_PASSWORD: "synthetic-db-password",
    MANAGED_DB_CA_FILE: ca,
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    SUPABASE_SECRET_KEY: "synthetic-admin-key",
    OPENAI_API_KEY: "ambient-canary",
    NODE_OPTIONS: "ambient-canary",
    MANAGED_DB_APPROVAL: JSON.stringify({
      schemaVersion: "managed-db-sql-approval/1",
      purpose: "cr-r16-rollback-sql",
      targetUrl: url,
      connectionHost: "db.synthetic-ci.supabase.co",
      orderedDigest:
        "fba7e856c528d05b6859bc5e6e4785cd4f15a9a93d57eccd1c62c74885958392",
      exclusiveSyntheticProject: true,
    }),
  };
  const ownerId = randomUUID();
  const receipt = JSON.stringify({ ownerId }) + "\n";
  const auditSql =
    JSON.stringify({
      auth: false,
      application: false,
      storageMetadata: false,
      ownedRateBuckets: false,
    }) + "\nresumide-browser-cleanup-read-complete\n";
  const runSql = vi
    .fn()
    .mockReturnValueOnce({
      status: 0,
      stdout: "resumide-managed-browser-preflight-complete\n",
    })
    .mockReturnValueOnce({ status: 0, stdout: auditSql });
  const runBrowser = vi.fn((child: NodeJS.ProcessEnv) => {
    const { BROWSER_TEST_LEDGER, AA7_AUTH_RECEIPT_FILE } = child;
    files.add(BROWSER_TEST_LEDGER!);
    files.add(AA7_AUTH_RECEIPT_FILE!);
    expect(readFileSync(BROWSER_TEST_LEDGER!, "utf8")).toBe("");
    writeFileSync(BROWSER_TEST_LEDGER!, receipt);
    return true;
  });
  return { env, output, receipt, ownerId, runSql, runBrowser };
}

describe("managed authenticated browser runner", () => {
  it("uses a sealed child and the real audit coordinator after the browser exits", async () => {
    const f = fixture();
    expect(
      await verifyManagedBrowser(f.env, {
        runSql: f.runSql,
        runBrowser: f.runBrowser,
        audit: auditCleanup,
      }),
    ).toMatchObject({
      status: "verified",
      browserPassed: true,
      auditStatus: "verified",
      ledgerRetained: true,
    });
    expect(f.runSql).toHaveBeenCalledTimes(2);
    expect(f.runSql.mock.calls[0][0]).toContain(
      "DOCUMENT_WORKER_TARGET_NOT_EMPTY",
    );
    expect(f.runSql.mock.calls[1][0]).toContain(f.ownerId);
    const child = f.runBrowser.mock.calls[0][0];
    expect(child.OPENAI_API_KEY).toBe("build-ai-harness-no-live-key");
    expect(child.AI_ENABLED).toBe("false");
    for (const name of [
      "MANAGED_DB_PASSWORD",
      "MANAGED_BROWSER_LEDGER_KEY",
      "NODE_OPTIONS",
    ])
      expect(child).not.toHaveProperty(name);
  });

  it.each([false, "exception"])(
    "audits a browser failure and recovers only the encrypted exact ledgers %#",
    async (mode) => {
      const f = fixture();
      const wrapped = vi.fn((env: NodeJS.ProcessEnv) => {
        f.runBrowser(env);
        if (mode === "exception") throw new Error("controlled browser failure");
        return false;
      });
      expect(
        await verifyManagedBrowser(f.env, {
          runSql: f.runSql,
          runBrowser: wrapped,
          audit: auditCleanup,
        }),
      ).toMatchObject({
        status: "failed",
        stage: "complete",
        browserPassed: false,
        auditStatus: "verified",
        ledgerRetained: true,
      });
      const file = join(f.output, "fixture-ledgers.enc");
      const encrypted = readFileSync(file);
      expect(encrypted.includes(f.ownerId)).toBe(false);
      const paths = wrapped.mock.calls[0][0];
      unlinkSync(paths.BROWSER_TEST_LEDGER!);
      unlinkSync(paths.AA7_AUTH_RECEIPT_FILE!);
      const tampered = join(f.output, "tampered.enc");
      const altered = Buffer.from(encrypted);
      altered[altered.length - 1] ^= 1;
      writeFileSync(tampered, altered);
      expect(() => recoverManagedBrowserLedgers(tampered, f.env)).toThrow();
      expect(() =>
        recoverManagedBrowserLedgers(file, {
          ...f.env,
          SUPABASE_URL: "https://different-ci.supabase.co",
        }),
      ).toThrow("Managed browser ledger target differs from recovery target");
      recoverManagedBrowserLedgers(file, f.env);
      expect(readFileSync(paths.BROWSER_TEST_LEDGER!, "utf8")).toBe(f.receipt);
      expect(readFileSync(paths.AA7_AUTH_RECEIPT_FILE!, "utf8")).toBe("");
    },
  );

  it("reports a failing cleanup audit even when the browser passed", async () => {
    const f = fixture();
    const audit = vi.fn(async () => ({
      schemaVersion: "managed-browser-cleanup/1",
      status: "failed",
      stage: "complete",
      residuals: ["auth"],
    }));
    expect(
      await verifyManagedBrowser(f.env, {
        runSql: f.runSql,
        runBrowser: f.runBrowser,
        audit,
      }),
    ).toMatchObject({
      status: "failed",
      browserPassed: true,
      auditStatus: "failed",
      residuals: ["auth"],
    });
  });

  it("refuses missing recovery material without contacting the database", async () => {
    const f = fixture();
    const audit = vi.fn();
    expect(
      await verifyManagedBrowser(
        { ...f.env, MANAGED_BROWSER_LEDGER_KEY: "" },
        { runSql: f.runSql, runBrowser: f.runBrowser, audit },
      ),
    ).toMatchObject({ status: "unavailable", stage: "admission" });
    expect(f.runSql).not.toHaveBeenCalled();
    expect(f.runBrowser).not.toHaveBeenCalled();
  });

  it("refuses an unavailable or unready target before starting the browser", async () => {
    const f = fixture();
    f.runSql.mockReset().mockReturnValue({ status: 1, stdout: "" });
    const audit = vi.fn();
    expect(
      await verifyManagedBrowser(f.env, {
        runSql: f.runSql,
        runBrowser: f.runBrowser,
        audit,
      }),
    ).toMatchObject({ status: "failed", stage: "preflight" });
    expect(f.runBrowser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

const noResiduals = {
  auth: false,
  application: false,
  storageMetadata: false,
  ownedRateBuckets: false,
};
function latexFixture() {
  const f = fixture();
  const rateKey =
    "latex:user:" + createHash("sha256").update(f.ownerId).digest("hex");
  const env = {
    ...f.env,
    LATEX_TEST_IMAGE: `sha256:${"a".repeat(64)}`,
    AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
    AA7_TEST_SUPABASE_URL: f.env.SUPABASE_URL,
  };
  f.runSql.mockReset().mockReturnValueOnce({
    status: 0,
    stdout: "resumide-managed-browser-preflight-complete\n",
  });
  const runBrowser = vi.fn((child: NodeJS.ProcessEnv, suite: string) => {
    expect(suite).toBe("latex");
    expect(child.AA7_TEST_SUPABASE_URL).toBe(env.SUPABASE_URL);
    expect(child.LATEX_COMPILER_IMAGE).toBe(env.LATEX_TEST_IMAGE);
    expect(child.AI_ENABLED).toBe("false");
    expect(child.OPENAI_API_KEY).toBe("build-ai-harness-no-live-key");
    files.add(child.BROWSER_TEST_LEDGER!);
    files.add(child.AA7_AUTH_RECEIPT_FILE!);
    writeFileSync(
      child.AA7_AUTH_RECEIPT_FILE!,
      JSON.stringify({
        ownerId: f.ownerId,
        rateKey,
        createdAt: "2026-11-22T00:00:00.000Z",
      }) + "\n",
    );
    return true;
  });
  return { ...f, env, runBrowser, compilerAvailable: vi.fn(() => true) };
}
describe("managed Build browser mode", () => {
  it("checks the image before admission, then removes owned counters and audits", async () => {
    const f = latexFixture();
    f.runSql
      .mockReturnValueOnce({
        status: 0,
        stdout:
          '{"blocked":false,"removed":1}\nresumide-browser-latex-rate-cleanup-complete\n',
      })
      .mockReturnValueOnce({
        status: 0,
        stdout:
          JSON.stringify(noResiduals) +
          "\nresumide-browser-cleanup-read-complete\n",
      });
    expect(
      await verifyManagedBrowser(
        f.env,
        {
          runSql: f.runSql,
          runBrowser: f.runBrowser,
          audit: auditCleanup,
          compilerAvailable: f.compilerAvailable,
        },
        "latex",
      ),
    ).toMatchObject({
      status: "verified",
      browserPassed: true,
      ledgerRetained: true,
      converterRateCleanup: "verified",
      converterRuntimeClean: true,
      auditStatus: "verified",
    });
    expect(f.compilerAvailable).toHaveBeenCalledWith(
      f.env.LATEX_TEST_IMAGE,
      f.env,
    );
    expect(f.compilerAvailable).toHaveBeenCalledTimes(2);
    expect(f.runSql.mock.calls[0][0]).toContain(
      "DOCUMENT_WORKER_TARGET_NOT_EMPTY",
    );
    expect(f.runSql.mock.calls[1][0]).toContain(
      "delete from private.analysis_rate_limit_buckets",
    );
    expect(f.runSql.mock.calls[2][0]).toContain("repeatable read read only");
  });
  it("refuses the compiler or a mismatched Build target before accessing the database", async () => {
    const f = latexFixture();
    f.compilerAvailable.mockReturnValue(false);
    const operations = {
      runSql: f.runSql,
      runBrowser: f.runBrowser,
      audit: auditCleanup,
      compilerAvailable: f.compilerAvailable,
    };
    expect(
      await verifyManagedBrowser(f.env, operations, "latex"),
    ).toMatchObject({
      status: "unavailable",
      stage: "admission",
    });
    expect(
      await verifyManagedBrowser(
        {
          ...f.env,
          AA7_TEST_SUPABASE_URL: "https://other-ci.supabase.co",
        },
        operations,
        "latex",
      ),
    ).toMatchObject({
      status: "unavailable",
      stage: "admission",
    });
    expect(f.compilerAvailable).toHaveBeenCalledOnce();
    expect(f.runSql).not.toHaveBeenCalled();
    expect(f.runBrowser).not.toHaveBeenCalled();
  });
  it("retains and audits a failed run without deleting its counters", async () => {
    const f = latexFixture();
    f.runSql.mockReturnValueOnce({
      status: 0,
      stdout:
        JSON.stringify({ ...noResiduals, ownedRateBuckets: true }) +
        "\nresumide-browser-cleanup-read-complete\n",
    });
    expect(
      await verifyManagedBrowser(
        f.env,
        {
          runSql: f.runSql,
          runBrowser: (env, suite) => {
            f.runBrowser(env, suite);
            return false;
          },
          audit: auditCleanup,
          compilerAvailable: f.compilerAvailable,
        },
        "latex",
      ),
    ).toMatchObject({
      status: "failed",
      browserPassed: false,
      ledgerRetained: true,
      converterRateCleanup: "not_run",
      auditStatus: "failed",
      residuals: ["ownedRateBuckets"],
    });
    expect(f.runSql).toHaveBeenCalledTimes(2);
    expect(f.runSql.mock.calls[1][0]).toContain("repeatable read read only");
  });
  it("keeps counters for recovery if the compiler still has an owned container", async () => {
    const f = latexFixture();
    f.compilerAvailable.mockReturnValueOnce(true).mockReturnValueOnce(false);
    f.runSql.mockReturnValueOnce({
      status: 0,
      stdout:
        JSON.stringify(noResiduals) +
        "\nresumide-browser-cleanup-read-complete\n",
    });
    expect(
      await verifyManagedBrowser(
        f.env,
        {
          runSql: f.runSql,
          runBrowser: f.runBrowser,
          audit: auditCleanup,
          compilerAvailable: f.compilerAvailable,
        },
        "latex",
      ),
    ).toMatchObject({
      status: "failed",
      browserPassed: true,
      ledgerRetained: true,
      converterRateCleanup: "not_run",
      converterRuntimeClean: false,
    });
    expect(f.runSql).toHaveBeenCalledTimes(2);
    expect(f.runSql.mock.calls[1][0]).toContain("repeatable read read only");
  });
});
