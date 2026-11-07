import { afterEach, describe, expect, it, vi } from "vitest";
import { requireBrowserTestTarget } from "../../scripts/browser-test-target";

afterEach(() => vi.unstubAllEnvs());
describe("managed browser fixture admission", () => {
  const url = "https://synthetic-project.supabase.co";
  function approved() {
    vi.stubEnv(
      "BROWSER_SUPABASE_AUTHORIZATION",
      "synthetic-owned-records-only",
    );
    vi.stubEnv("BROWSER_TEST_SUPABASE_URL", url);
    vi.stubEnv("BROWSER_TEST_LEDGER", "/tmp/resumide-auth-audit-unit.jsonl");
    vi.stubEnv("AI_ENABLED", "false");
  }
  it("retains isolated local fixture support", () => {
    expect(() =>
      requireBrowserTestTarget("http://127.0.0.1:54321"),
    ).not.toThrow();
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
});
