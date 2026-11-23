import { createHash, randomUUID } from "node:crypto";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  removeManagedLatexRateBuckets,
  verifyManagedBrowserCleanup,
} from "../../scripts/verify-managed-browser-cleanup";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) unlinkSync(file);
});

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const marker = "resumide-browser-cleanup-read-complete";
const empty = {
  auth: false,
  application: false,
  storageMetadata: false,
  ownedRateBuckets: false,
};

function fixture() {
  const runId = randomUUID();
  const ownerId = randomUUID();
  const converterId = randomUUID();
  const orgId = randomUUID();
  const browser = `/tmp/resumide-auth-audit-managed-${runId}.jsonl`;
  const converter = `/tmp/resumide-aa7-managed-${runId}.jsonl`;
  const ca = `/tmp/resumide-ca-${runId}.pem`;
  for (const path of [browser, converter, ca]) {
    writeFileSync(path, "", { mode: 0o600, flag: "wx" });
    files.push(path);
  }
  const url = "https://synthetic-ci.supabase.co";
  return {
    browser,
    converter,
    ownerId,
    converterId,
    orgId,
    env: {
      MANAGED_BROWSER_CLEANUP_RUN_ID: runId,
      SUPABASE_URL: url,
      BROWSER_TEST_SUPABASE_URL: url,
      BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
      BROWSER_TEST_LEDGER: browser,
      AA7_AUTH_RECEIPT_FILE: converter,
      MANAGED_DB_PASSWORD: "synthetic-db-password",
      SUPABASE_SECRET_KEY: "synthetic-storage-admin-key",
      MANAGED_DB_CA_FILE: ca,
      MANAGED_DB_APPROVAL: JSON.stringify({
        schemaVersion: "managed-db-sql-approval/1",
        purpose: "cr-r16-rollback-sql",
        targetUrl: url,
        connectionHost: "db.synthetic-ci.supabase.co",
        orderedDigest:
          "fba7e856c528d05b6859bc5e6e4785cd4f15a9a93d57eccd1c62c74885958392",
        exclusiveSyntheticProject: true,
      }),
    },
  };
}

function write(path: string, ...entries: unknown[]) {
  writeFileSync(
    path,
    entries.map((entry) => JSON.stringify(entry) + "\n").join(""),
  );
}

function witness(groups = empty) {
  return { status: 0, stdout: JSON.stringify(groups) + "\n" + marker + "\n" };
}

describe("managed browser cleanup audit", () => {
  it("checks exact owners, object and rate keys in one read-only snapshot", async () => {
    const f = fixture();
    const key = `organizations/${f.orgId}/resumes/${randomUUID()}/versions/${randomUUID()}.pdf`;
    const month = `build-ai:month:2026-11:${digest(f.orgId)}`;
    write(
      f.browser,
      { ownerId: f.ownerId },
      { ownerId: f.ownerId, storageKey: key },
    );
    write(
      f.converter,
      {
        ownerId: f.converterId,
        rateKey: `latex:user:${digest(f.converterId)}`,
        createdAt: "2026-11-21T00:00:00.000Z",
      },
      {
        ownerId: f.converterId,
        recordType: "build-ai",
        orgId: f.orgId,
        keys: [`build-ai:user:${digest(f.converterId)}`, month],
      },
    );
    const query = vi.fn((sql: string, env: NodeJS.ProcessEnv) => {
      expect(env).toMatchObject({
        PGSSLMODE: "verify-full",
        PGHOST: "db.synthetic-ci.supabase.co",
      });
      for (const expected of [
        key,
        f.orgId,
        f.ownerId,
        f.converterId,
        digest(f.ownerId),
        month,
        "auth.sessions",
        "auth.refresh_tokens",
        "storage.objects",
      ])
        expect(sql).toContain(expected);
      expect(sql).toContain(
        "begin transaction isolation level repeatable read read only",
      );
      expect(sql).not.toContain("latex:global:v1");
      expect(sql).not.toContain("build-ai:global:v1");
      return witness();
    });
    const transport = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(
        `${f.env.SUPABASE_URL}/storage/v1/object/resumes/${key}`,
      );
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-0");
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json(
        { statusCode: "404", code: "NoSuchKey" },
        { status: 404 },
      );
    });
    expect(
      await verifyManagedBrowserCleanup(f.env, query, transport),
    ).toMatchObject({
      status: "verified",
      residuals: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(Object.keys(empty) as (keyof typeof empty)[])(
    "fails on remaining %s and returns metadata only",
    async (group) => {
      const f = fixture();
      write(f.browser, { ownerId: f.ownerId });
      const result = await verifyManagedBrowserCleanup(f.env, () =>
        witness({ ...empty, [group]: true }),
      );
      expect(result).toEqual({
        schemaVersion: "managed-browser-cleanup/1",
        status: "failed",
        stage: "complete",
        residuals: [group],
      });
    },
  );

  it.each([
    { BROWSER_TEST_SUPABASE_URL: "https://other.supabase.co" },
    { BROWSER_TEST_LEDGER: "/tmp/wrong.jsonl" },
    { AA7_AUTH_RECEIPT_FILE: "/tmp/wrong.jsonl" },
    { SUPABASE_RESUME_BUCKET: "x'unsafe" },
    { BROWSER_SUPABASE_AUTHORIZATION: "" },
  ])(
    "refuses misbound configuration before connecting %#",
    async (overrides) => {
      const f = fixture();
      write(f.browser, { ownerId: f.ownerId });
      const query = vi.fn();
      expect(
        await verifyManagedBrowserCleanup({ ...f.env, ...overrides }, query),
      ).toMatchObject({ status: "unavailable", stage: "admission" });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    "empty",
    "partial",
    "public",
    "oversized",
    "unbound-object",
    "wrong-rate-key",
    "unbound-build",
  ])("refuses a %s ledger before connecting", async (defect) => {
    const f = fixture();
    if (defect === "partial")
      writeFileSync(f.browser, JSON.stringify({ ownerId: f.ownerId }));
    if (defect === "public") chmodSync(f.browser, 0o644);
    if (defect === "oversized")
      writeFileSync(f.browser, " ".repeat(128 * 1024 + 1));
    if (defect === "unbound-object")
      write(f.browser, {
        ownerId: f.ownerId,
        storageKey: `organizations/${f.orgId}/resumes/${randomUUID()}/${randomUUID()}.pdf`,
      });
    if (defect === "wrong-rate-key")
      write(f.converter, {
        ownerId: f.converterId,
        rateKey: `latex:user:${digest(f.ownerId)}`,
        createdAt: "2026-11-21T00:00:00.000Z",
      });
    if (defect === "unbound-build")
      write(f.converter, {
        ownerId: f.converterId,
        orgId: f.orgId,
        recordType: "build-ai",
        keys: [
          `build-ai:user:${digest(f.converterId)}`,
          `build-ai:month:2026-11:${digest(f.orgId)}`,
        ],
      });
    const query = vi.fn();
    expect(await verifyManagedBrowserCleanup(f.env, query)).toMatchObject({
      status: "unavailable",
      stage: "ledger",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { status: 1, stdout: witness().stdout },
    { status: 0, stdout: JSON.stringify(empty) },
    { status: 0, stdout: "{}\n" + marker },
  ])("refuses a missing or unverified query receipt %#", async (receipt) => {
    const f = fixture();
    write(f.browser, { ownerId: f.ownerId });
    expect(
      await verifyManagedBrowserCleanup(f.env, () => receipt),
    ).toMatchObject({
      status: "failed",
      stage: "query",
    });
  });

  it.each([
    [404, "NotFound"],
    [404, "NoSuchBucket"],
    [403, "NoSuchKey"],
    [503, "NoSuchKey"],
  ])("refuses Storage status %s with code %s", async (status, code) => {
    const f = fixture();
    write(
      f.browser,
      { ownerId: f.ownerId },
      {
        ownerId: f.ownerId,
        storageKey: `organizations/${f.orgId}/resumes/${randomUUID()}/${randomUUID()}.pdf`,
      },
    );
    const transport = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ code }, { status }),
    );
    expect(
      await verifyManagedBrowserCleanup(f.env, () => witness(), transport),
    ).toMatchObject({
      status: "failed",
      stage: "storage",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("fails and cancels an available source without reading its bytes", async () => {
    const f = fixture();
    write(
      f.browser,
      { ownerId: f.ownerId },
      {
        ownerId: f.ownerId,
        storageKey: `organizations/${f.orgId}/resumes/${randomUUID()}/${randomUUID()}.pdf`,
      },
    );
    const cancel = vi.fn();
    const transport = vi.fn<typeof globalThis.fetch>(
      async () => new Response(new ReadableStream({ cancel }), { status: 206 }),
    );
    expect(
      await verifyManagedBrowserCleanup(f.env, () => witness(), transport),
    ).toMatchObject({
      status: "failed",
      residuals: ["storageObject"],
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("managed Build fixture rate cleanup", () => {
  const prepare = () => {
    const f = fixture();
    const key = `latex:user:${digest(f.converterId)}`;
    write(f.browser, { ownerId: f.ownerId });
    write(f.converter, {
      ownerId: f.converterId,
      rateKey: key,
      createdAt: "2026-11-21T00:00:00.000Z",
    });
    return {
      ...f,
      key,
      env: {
        ...f.env,
        MANAGED_BROWSER_AUTHORIZATION:
          "isolated-authenticated-browser-fixtures",
        AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
        AA7_TEST_SUPABASE_URL: f.env.SUPABASE_URL,
      },
    };
  };
  const result = (blocked: boolean, removed: number) => ({
    status: 0,
    stdout:
      JSON.stringify({ blocked, removed }) +
      "\nresumide-browser-latex-rate-cleanup-complete\n",
  });
  it("deletes exact converter user counters under an Auth absence condition", () => {
    const f = prepare();
    const query = vi.fn((sql: string, env: NodeJS.ProcessEnv) => {
      expect(env.PGSSLMODE).toBe("verify-full");
      expect(sql).toContain(f.converterId);
      expect(sql).toContain(f.key);
      expect(sql).not.toContain(f.ownerId);
      expect(sql).not.toContain("latex:global:v1");
      expect(sql).not.toContain("build-ai:");
      expect(sql).toContain("and not exists(select 1 from remaining_auth)");
      for (const table of ["users", "sessions", "identities", "refresh_tokens"])
        expect(sql).toContain("auth." + table);
      return result(false, 1);
    });
    expect(removeManagedLatexRateBuckets(f.env, query)).toEqual({
      status: "verified",
      removed: 1,
    });
  });
  it("keeps a residual Auth account or session unresolved", () => {
    const f = prepare();
    expect(removeManagedLatexRateBuckets(f.env, () => result(true, 0))).toEqual(
      {
        status: "blocked",
      },
    );
  });
  it("refuses a mismatched target or tampered ledger before issuing SQL", () => {
    const f = prepare();
    const query = vi.fn();
    expect(
      removeManagedLatexRateBuckets(
        { ...f.env, AA7_TEST_SUPABASE_URL: "https://other-ci.supabase.co" },
        query,
      ),
    ).toEqual({ status: "unavailable" });
    write(f.converter, {
      ownerId: f.converterId,
      rateKey: `latex:user:${"0".repeat(64)}`,
      createdAt: "2026-11-21T00:00:00.000Z",
    });
    expect(removeManagedLatexRateBuckets(f.env, query)).toEqual({
      status: "unavailable",
    });
    expect(query).not.toHaveBeenCalled();
  });
  it("requires the post-commit receipt even if the query exits successfully", () => {
    const f = prepare();
    expect(
      removeManagedLatexRateBuckets(f.env, () => ({
        status: 0,
        stdout: '{"blocked":false,"removed":1}',
      })),
    ).toEqual({ status: "unavailable" });
  });
});
