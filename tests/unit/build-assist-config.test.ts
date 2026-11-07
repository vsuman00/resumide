import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../../app/lib/server/config";
const environment = {
  NODE_ENV: "test",
  APP_ORIGIN: "https://example.test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "unit-only",
  SUPABASE_SECRET_KEY: "unit-only",
  OPENAI_API_KEY: "unit-only",
};
describe("Build assist configuration", () => {
  it("keeps selected-context assistance default off without changing existing AI defaults", () => {
    const config = parseServerConfig(environment);
    expect(config.BUILD_AI_ASSIST_ENABLED).toBe(false);
    expect(config.OPENAI_MODEL).toBe("gpt-6-luna");
  });
  it("accepts explicit enablement only as a strict boolean string", () => {
    expect(
      parseServerConfig({ ...environment, BUILD_AI_ASSIST_ENABLED: "true" })
        .BUILD_AI_ASSIST_ENABLED,
    ).toBe(true);
    expect(() =>
      parseServerConfig({ ...environment, BUILD_AI_ASSIST_ENABLED: "yes" }),
    ).toThrow();
  });
});
