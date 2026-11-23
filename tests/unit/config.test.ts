import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAnalysisConfig,
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
  it("keeps owned initial feedback default-off and validates both selected dependencies", () => {
    for (const parse of [parseServerConfig, parseAnalysisConfig]) {
      expect(parse(validEnvironment).INITIAL_FEEDBACK_ENABLED).toBe(false);
      expect(
        parse({ ...validEnvironment, INITIAL_FEEDBACK_ENABLED: "false" })
          .INITIAL_FEEDBACK_ENABLED,
      ).toBe(false);
      expect(() =>
        parse({ ...validEnvironment, INITIAL_FEEDBACK_ENABLED: "yes" }),
      ).toThrow(ServerConfigError);
      for (const deps of [
        {},
        { LEGACY_SCORING_INPUT_ENABLED: "true" },
        { ANALYSIS_FENCING_ENABLED: "true" },
      ]) {
        expect(() =>
          parse({
            ...validEnvironment,
            ...deps,
            INITIAL_FEEDBACK_ENABLED: "true",
          }),
        ).toThrow(ServerConfigError);
      }
      expect(
        parse({
          ...validEnvironment,
          INITIAL_FEEDBACK_ENABLED: "true",
          LEGACY_SCORING_INPUT_ENABLED: "true",
          ANALYSIS_FENCING_ENABLED: "true",
        }).INITIAL_FEEDBACK_ENABLED,
      ).toBe(true);
    }
  });
  it("keeps original scoring input binding default-off and rejects non-boolean configuration", () => {
    expect(
      parseAnalysisConfig(validEnvironment).LEGACY_SCORING_INPUT_ENABLED,
    ).toBe(false);
    expect(
      parseAnalysisConfig({
        ...validEnvironment,
        LEGACY_SCORING_INPUT_ENABLED: "true",
      }).LEGACY_SCORING_INPUT_ENABLED,
    ).toBe(true);
    expect(
      parseServerConfig(validEnvironment).LEGACY_SCORING_INPUT_ENABLED,
    ).toBe(false);
    expect(
      parseServerConfig({
        ...validEnvironment,
        LEGACY_SCORING_INPUT_ENABLED: "true",
      }).LEGACY_SCORING_INPUT_ENABLED,
    ).toBe(true);
    expect(
      parseServerConfig({
        ...validEnvironment,
        LEGACY_SCORING_INPUT_ENABLED: "false",
      }).LEGACY_SCORING_INPUT_ENABLED,
    ).toBe(false);
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        LEGACY_SCORING_INPUT_ENABLED: "yes",
      }),
    ).toThrow(ServerConfigError);
  });
  it("keeps canonical rewrites default-off and admits only explicit boolean strings", () => {
    expect(parseServerConfig(validEnvironment).CANONICAL_REWRITE_ENABLED).toBe(
      false,
    );
    expect(
      parseServerConfig({
        ...validEnvironment,
        CANONICAL_REWRITE_ENABLED: "true",
      }).CANONICAL_REWRITE_ENABLED,
    ).toBe(true);
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        CANONICAL_REWRITE_ENABLED: "yes",
      }),
    ).toThrow(ServerConfigError);
  });
  it("applies safe defaults", () => {
    const config = parseServerConfig(validEnvironment);
    expect(config.MAX_UPLOAD_BYTES).toBe(10_485_760);
    expect(config.ANALYSIS_CONCURRENCY).toBe(5);
    expect(config.OPENAI_TIMEOUT_MS).toBe(20_000);
    expect(config.OPENAI_MAX_OUTPUT_TOKENS).toBe(1_200);
    expect(config.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(config.OPENAI_MODEL).toBe("gpt-6-luna");
    expect(config.QUALITATIVE_MAX_ATTEMPTS).toBe(1);
    expect(config.NATIVE_EVIDENCE_ENABLED).toBe(false);
    expect(config.NATIVE_LAYOUT_ENABLED).toBe(false);
    expect(config.EVIDENCE_REVIEW_ENABLED).toBe(false);
    expect(config.CANONICAL_AUTHORING_ENABLED).toBe(false);
    expect(config.ARTIFACT_RENDERING_ENABLED).toBe(false);
    expect(config.TYPED_AUTHORING_ENABLED).toBe(false);
    expect(config.ANALYSIS_ADMISSION_BINDING_ENABLED).toBe(false);
    expect(config.ANALYSIS_FENCING_ENABLED).toBe(false);
    expect(config.AI_BUDGET_ENABLED).toBe(false);
    expect(config.AI_BUDGET_POLICY_VERSION).toBe("");
    const analysis = parseAnalysisConfig(validEnvironment);
    expect(analysis.ANALYSIS_FENCING_ENABLED).toBe(false);
    expect(analysis.AI_BUDGET_ENABLED).toBe(false);
    expect(analysis.AI_BUDGET_POLICY_VERSION).toBe("");
  });

  it("admits typed authoring only through an explicit strict flag", () => {
    expect(
      parseServerConfig({
        ...validEnvironment,
        TYPED_AUTHORING_ENABLED: "true",
      }).TYPED_AUTHORING_ENABLED,
    ).toBe(true);
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        TYPED_AUTHORING_ENABLED: "yes",
      }),
    ).toThrow(ServerConfigError);
  });

  it("preserves an explicitly configured model", () => {
    expect(
      parseServerConfig({ ...validEnvironment, OPENAI_MODEL: "custom-model" })
        .OPENAI_MODEL,
    ).toBe("custom-model");
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

  it("exposes explicit shared budget settings to server and analysis callers", () => {
    const environment = {
      ...validEnvironment,
      AI_BUDGET_ENABLED: "true",
      AI_BUDGET_POLICY_VERSION: "synthetic-budget/1",
    };
    for (const parse of [parseServerConfig, parseAnalysisConfig]) {
      const config = parse(environment);
      expect(config.AI_BUDGET_ENABLED).toBe(true);
      expect(config.AI_BUDGET_POLICY_VERSION).toBe("synthetic-budget/1");
    }
  });

  it.each([
    { AI_BUDGET_ENABLED: "yes" },
    { AI_BUDGET_POLICY_VERSION: "bad policy" },
    { AI_BUDGET_POLICY_VERSION: "x".repeat(101) },
  ])("rejects invalid shared budget settings %j", (settings) => {
    for (const parse of [parseServerConfig, parseAnalysisConfig]) {
      expect(() => parse({ ...validEnvironment, ...settings })).toThrow(
        ServerConfigError,
      );
    }
  });
});

describe("durable analysis feature flags", () => {
  it("enables only explicitly configured admission and fencing branches", () => {
    const config = parseServerConfig({
      ...validEnvironment,
      ANALYSIS_ADMISSION_BINDING_ENABLED: "true",
      ANALYSIS_FENCING_ENABLED: "true",
    });
    expect(config.ANALYSIS_ADMISSION_BINDING_ENABLED).toBe(true);
    expect(config.ANALYSIS_FENCING_ENABLED).toBe(true);
  });

  it.each(["ANALYSIS_ADMISSION_BINDING_ENABLED", "ANALYSIS_FENCING_ENABLED"])(
    "rejects an ambiguous %s setting",
    (flag) => {
      expect(() =>
        parseServerConfig({ ...validEnvironment, [flag]: "yes" }),
      ).toThrow(ServerConfigError);
    },
  );
});

describe("canonical correction controls", () => {
  it("keeps corrected-version writes disabled by default", () => {
    expect(
      parseServerConfig(validEnvironment).CANONICAL_CORRECTIONS_ENABLED,
    ).toBe(false);
  });

  it("allows explicit correction review without requiring AI", () => {
    const config = parseServerConfig({
      ...validEnvironment,
      CANONICAL_CORRECTIONS_ENABLED: "true",
      CANONICAL_AUTHORING_ENABLED: "true",
      EVIDENCE_REVIEW_ENABLED: "true",
      AI_ENABLED: "false",
    });
    expect(config.CANONICAL_CORRECTIONS_ENABLED).toBe(true);
    expect(config.AI_ENABLED).toBe(false);
  });

  it.each([
    ["false", "true"],
    ["true", "false"],
    ["false", "false"],
  ])("requires both prerequisite capabilities (%s/%s)", (canonical, review) => {
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        CANONICAL_CORRECTIONS_ENABLED: "true",
        CANONICAL_AUTHORING_ENABLED: canonical,
        EVIDENCE_REVIEW_ENABLED: review,
      }),
    ).toThrow(ServerConfigError);
  });

  it("rejects an ambiguous correction setting", () => {
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        CANONICAL_CORRECTIONS_ENABLED: "yes",
      }),
    ).toThrow(ServerConfigError);
  });
});

describe("typed job relation capability", () => {
  afterEach(() => vi.unstubAllEnvs());
  async function freshServerConfig(
    settings: Record<string, string | undefined> = {},
  ) {
    vi.resetModules();
    for (const [name, value] of Object.entries({
      ...validEnvironment,
      AI_ENABLED: "false",
      JOB_INTELLIGENCE_ENABLED: undefined,
      JOB_RELATIONS_ENABLED: undefined,
      ...settings,
    }))
      vi.stubEnv(name, value);
    return await import("../../app/lib/server/config");
  }
  it("A09 config keeps typed relation capability off by default through the actual getter", async () => {
    const { getServerConfig } = await freshServerConfig();
    expect(getServerConfig().JOB_RELATIONS_ENABLED).toBe(false);
    expect(getServerConfig().JOB_INTELLIGENCE_ENABLED).toBe(false);
  });
  it("A09 config permits explicit false without job intelligence", async () => {
    const { getServerConfig } = await freshServerConfig({
      JOB_RELATIONS_ENABLED: "false",
      JOB_INTELLIGENCE_ENABLED: "false",
    });
    expect(getServerConfig().JOB_RELATIONS_ENABLED).toBe(false);
  });
  it("A09 config enables typed relations only with job intelligence and without enabling AI", async () => {
    const { getServerConfig } = await freshServerConfig({
      JOB_RELATIONS_ENABLED: "true",
      JOB_INTELLIGENCE_ENABLED: "true",
      AI_ENABLED: "false",
    });
    expect(getServerConfig().JOB_RELATIONS_ENABLED).toBe(true);
    expect(getServerConfig().JOB_INTELLIGENCE_ENABLED).toBe(true);
    expect(getServerConfig().AI_ENABLED).toBe(false);
  });
  it.each([undefined, "false"])(
    "A09 config rejects enabled relations when job intelligence is %s",
    async (prerequisite) => {
      const { getServerConfig, ServerConfigError } = await freshServerConfig({
        JOB_RELATIONS_ENABLED: "true",
        JOB_INTELLIGENCE_ENABLED: prerequisite,
      });
      expect(() => getServerConfig()).toThrow(ServerConfigError);
      expect(() => getServerConfig()).toThrow("JOB_RELATIONS_ENABLED");
    },
  );
  it.each(["yes", "TRUE", "", "1"])(
    "A09 config rejects ambiguous typed relation flag %s",
    async (flag) => {
      const { getServerConfig, ServerConfigError } = await freshServerConfig({
        JOB_RELATIONS_ENABLED: flag,
        JOB_INTELLIGENCE_ENABLED: "true",
      });
      expect(() => getServerConfig()).toThrow(ServerConfigError);
    },
  );
});
