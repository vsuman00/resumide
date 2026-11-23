import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../../app/lib/server/config";
const environment = {
  NODE_ENV: "test",
  APP_ORIGIN: "https://example.test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
  SUPABASE_SECRET_KEY: "synthetic-secret",
  OPENAI_API_KEY: "disabled-placeholder",
};
describe("standalone converter configuration", () => {
  it("is disabled by default", () => {
    const config = parseServerConfig(environment);
    expect(config.LATEX_CONVERTER_ENABLED).toBe(false);
    expect(config.LATEX_COMPILER_IMAGE).toBe("");
  });
  it("accepts an immutable configured image without changing default enablement", () => {
    const config = parseServerConfig({
      ...environment,
      LATEX_COMPILER_IMAGE: "sha256:" + "a".repeat(64),
    });
    expect(config.LATEX_CONVERTER_ENABLED).toBe(false);
  });
  it.each([
    "latest",
    "resumide-latex:latest",
    "sha256:abc",
    "sha256:" + "A".repeat(64),
  ])("rejects mutable/malformed image %s", (image) => {
    expect(() =>
      parseServerConfig({
        ...environment,
        LATEX_CONVERTER_ENABLED: "true",
        LATEX_COMPILER_IMAGE: image,
      }),
    ).toThrow();
  });
  it("rejects ambiguous feature flag values", () => {
    expect(() =>
      parseServerConfig({ ...environment, LATEX_CONVERTER_ENABLED: "yes" }),
    ).toThrow();
  });
});
