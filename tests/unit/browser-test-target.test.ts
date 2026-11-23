import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  chmodSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  createBrowserTestAccount,
  recordBrowserFixture,
  requireBrowserTestTarget,
} from "../../scripts/browser-test-target";
import { createLatexOwner } from "../fixtures/latex-auth";

const ownedPaths: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const path of ownedPaths.splice(0)) unlinkSync(path);
});

describe("converter fixture account receipt", () => {
  function approved() {
    const url = "https://synthetic-project.supabase.co";
    const path = `/tmp/resumide-aa7-unit-${randomUUID()}.jsonl`;
    writeFileSync(path, "", { flag: "wx", mode: 0o600 });
    ownedPaths.push(path);
    for (const [name, value] of Object.entries({
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-credential",
      SUPABASE_SECRET_KEY: "synthetic-admin-credential",
      AA7_TEST_SUPABASE_URL: url,
      AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
      AA7_AUTH_RECEIPT_FILE: path,
    }))
      vi.stubEnv(name, value);
    return path;
  }

  it("records the requested user and rate-limit key even if Auth returns an error", async () => {
    const path = approved();
    const transport = vi.fn<typeof globalThis.fetch>(async (_request, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.email).toBe(`aa7-${body.id}@example.test`);
      expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
        ownerId: body.id,
        rateKey: `latex:user:${createHash("sha256").update(body.id).digest("hex")}`,
      });
      return Response.json(
        { message: "synthetic response failure" },
        { status: 503 },
      );
    });
    vi.stubGlobal("fetch", transport);
    await expect(createLatexOwner()).rejects.toThrow(
      "Synthetic converter owner creation failed",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refuses a symlink to a private receipt before touching Auth", async () => {
    const path = approved();
    const target = approved();
    unlinkSync(path);
    symlinkSync(target, path);
    vi.stubEnv("AA7_AUTH_RECEIPT_FILE", path);
    const transport = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", transport);
    await expect(createLatexOwner()).rejects.toThrow(
      "Synthetic converter cleanup ledger unavailable",
    );
    expect(transport).not.toHaveBeenCalled();
    expect(readFileSync(target, "utf8")).toBe("");
  });
});
describe("managed browser fixture admission", () => {
  const url = "https://synthetic-project.supabase.co";
  function ledger() {
    const path = `/tmp/resumide-auth-audit-unit-${randomUUID()}.jsonl`;
    writeFileSync(path, "", { flag: "wx", mode: 0o600 });
    ownedPaths.push(path);
    return path;
  }
  function approved(target = url) {
    const path = ledger();
    vi.stubEnv(
      "BROWSER_SUPABASE_AUTHORIZATION",
      "synthetic-owned-records-only",
    );
    vi.stubEnv("BROWSER_TEST_SUPABASE_URL", target);
    vi.stubEnv("BROWSER_TEST_LEDGER", path);
    vi.stubEnv("AI_ENABLED", "false");
    return path;
  }
  it("retains isolated local fixture support", () => {
    expect(() =>
      requireBrowserTestTarget("http://127.0.0.1:54321"),
    ).not.toThrow();
  });
  it("preserves the legacy local record no-op without opening a ledger", async () => {
    vi.stubEnv("BROWSER_TEST_LEDGER", undefined);
    await expect(
      recordBrowserFixture("http://127.0.0.1:54321", { ownerId: randomUUID() }),
    ).resolves.toBeUndefined();
  });
  it("rejects a managed target by default", () => {
    vi.stubEnv("BROWSER_SUPABASE_AUTHORIZATION", "");
    expect(() => requireBrowserTestTarget(url)).toThrow();
  });
  it("accepts an exact approved target with disabled AI and a ledger", () => {
    approved();
    expect(() => requireBrowserTestTarget(url)).not.toThrow();
  });
  it.each([
    ["BROWSER_TEST_SUPABASE_URL", "https://other.supabase.co"],
    ["BROWSER_TEST_LEDGER", "/tmp/other.jsonl"],
    ["AI_ENABLED", "true"],
  ])("rejects an invalid %s", (name, value) => {
    approved();
    vi.stubEnv(name, value);
    expect(() => requireBrowserTestTarget(url)).toThrow();
  });
  it.each([
    "http://synthetic-project.supabase.co",
    "https://synthetic-project.supabase.co:8443",
    "https://synthetic-project.supabase.co/path",
    "https://synthetic-project.supabase.co?query=synthetic",
    "https://synthetic-project.supabase.co#synthetic",
    "https://synthetic-project.supabase.co?",
    "https://synthetic-project.supabase.co#",
    "https://synthetic-project.supabase.co/child/..",
    "https://synthetic-project.supabase.co.evil.example",
    "https://synthetic@synthetic-project.supabase.co",
  ])("rejects an acknowledged unsafe managed target %#", (target) => {
    approved(target);
    expect(() => requireBrowserTestTarget(target)).toThrow(
      "Managed browser tests require",
    );
  });
  it("rejects missing, public and symlink ledgers despite a matching path acknowledgment", () => {
    const missing = `/tmp/resumide-auth-audit-unit-${randomUUID()}.jsonl`;
    const path = approved();
    vi.stubEnv("BROWSER_TEST_LEDGER", missing);
    expect(() => requireBrowserTestTarget(url)).toThrow();
    vi.stubEnv("BROWSER_TEST_LEDGER", path);
    chmodSync(path, 0o644);
    expect(() => requireBrowserTestTarget(url)).toThrow();
    chmodSync(path, 0o600);
    symlinkSync(path, missing);
    ownedPaths.push(missing);
    vi.stubEnv("BROWSER_TEST_LEDGER", missing);
    expect(() => requireBrowserTestTarget(url)).toThrow();
  });
  it("appends only to the admitted private ledger and rejects a substituted symlink", async () => {
    const path = approved();
    const record = { ownerId: randomUUID() };
    await recordBrowserFixture(url, record);
    expect(readFileSync(path, "utf8")).toBe(JSON.stringify(record) + "\n");
    const other = ledger();
    unlinkSync(path);
    symlinkSync(other, path);
    await expect(recordBrowserFixture(url, record)).rejects.toThrow();
    expect(readFileSync(other, "utf8")).toBe("");
  });
  it("uses a fixed refusal for malformed input rather than echoing the target", () => {
    expect(() => requireBrowserTestTarget("synthetic-invalid-target")).toThrow(
      "Managed browser tests require",
    );
  });
  it("rejects a foreign-owned ledger", () => {
    approved();
    vi.spyOn(process, "getuid").mockReturnValue(process.getuid!() + 1);
    expect(() => requireBrowserTestTarget(url)).toThrow(
      "ledger is not private",
    );
  });

  function admin(fetch: typeof globalThis.fetch) {
    return createClient(url, "synthetic-admin-credential", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch },
    }).auth.admin;
  }

  it("records the exact client-selected ID before the installed SDK calls Auth", async () => {
    const path = approved();
    const transport = vi.fn<typeof globalThis.fetch>(async (request, init) => {
      const body = JSON.parse(String(init?.body));
      expect(String(request)).toBe(url + "/auth/v1/admin/users");
      expect(init?.method).toBe("POST");
      expect(readFileSync(path, "utf8")).toBe(
        JSON.stringify({ ownerId: body.id }) + "\n",
      );
      expect(body.email).toBe(`browser-audit-${body.id}@example.test`);
      expect(body.email_confirm).toBe(true);
      return Response.json({ id: body.id, email: body.email });
    });
    const account = await createBrowserTestAccount(
      url,
      admin(transport),
      "browser-audit",
    );
    expect(account.ownerId).toMatch(/^[a-f0-9-]{36}$/);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("preserves the requested ID if the create response is lost", async () => {
    const path = approved();
    const transport = vi.fn<typeof globalThis.fetch>(async (_request, init) => {
      const body = JSON.parse(String(init?.body));
      expect(readFileSync(path, "utf8")).toBe(
        JSON.stringify({ ownerId: body.id }) + "\n",
      );
      throw new TypeError("synthetic network failure");
    });
    const sdk = admin(transport);
    // The SDK may log a failed fetch. Keep this deliberately induced failure quiet.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      createBrowserTestAccount(url, sdk, "aa2-local"),
    ).rejects.toThrow(
      "Synthetic browser account creation could not be verified",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(path, "utf8")).ownerId).toMatch(
      /^[a-f0-9-]{36}$/,
    );
  });

  it("refuses an ID returned for a different account and preserves the original record", async () => {
    const path = approved();
    const otherId = randomUUID();
    const transport = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ id: otherId }),
    );
    await expect(
      createBrowserTestAccount(url, admin(transport), "aa014-browser"),
    ).rejects.toThrow(
      "Synthetic browser account creation could not be verified",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(readFileSync(path, "utf8")).not.toContain(otherId);
    expect(JSON.parse(readFileSync(path, "utf8")).ownerId).toMatch(
      /^[a-f0-9-]{36}$/,
    );
  });

  it("does not call Auth if the private ledger cannot be written", async () => {
    const path = approved();
    chmodSync(path, 0o644);
    const transport = vi.fn<typeof globalThis.fetch>();
    await expect(
      createBrowserTestAccount(url, admin(transport), "aa011-browser"),
    ).rejects.toThrow("ledger is not private");
    expect(transport).not.toHaveBeenCalled();
  });
});
