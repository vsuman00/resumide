import { describe, expect, it } from "vitest";
import {
  parseServerConfig,
  ServerConfigError,
} from "../../app/lib/server/config";

const validEnvironment = {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SECRET_KEY: "secret",
  OPENAI_API_KEY: "openai",
};

describe("server configuration", () => {
  it("applies safe defaults", () => {
    const config = parseServerConfig(validEnvironment);
    expect(config.MAX_UPLOAD_BYTES).toBe(10_485_760);
    expect(config.ANALYSIS_CONCURRENCY).toBe(5);
    expect(config.OPENAI_TIMEOUT_MS).toBe(20_000);
    expect(config.OPENAI_MAX_OUTPUT_TOKENS).toBe(1_200);
    expect(config.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(config.QUALITATIVE_MAX_ATTEMPTS).toBe(1);
    expect(config.NATIVE_EVIDENCE_ENABLED).toBe(false);
    expect(config.NATIVE_LAYOUT_ENABLED).toBe(false);
    expect(config.EVIDENCE_REVIEW_ENABLED).toBe(false);
    expect(config.CANONICAL_AUTHORING_ENABLED).toBe(false);
    expect(config.ARTIFACT_RENDERING_ENABLED).toBe(false);
  });

  it("rejects provider egress outside the approved OpenAI endpoint", () => {
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        OPENAI_BASE_URL: "https://proxy.example.test/v1",
      }),
    ).toThrow(ServerConfigError);
  });

  it("redacts values from configuration errors", () => {
    expect(() =>
      parseServerConfig({ ...validEnvironment, SUPABASE_URL: "bad-url" }),
    ).toThrow(ServerConfigError);
    try {
      parseServerConfig({ ...validEnvironment, SUPABASE_URL: "bad-url" });
    } catch (error) {
      expect(String(error)).not.toContain("bad-url");
    }
  });
});
