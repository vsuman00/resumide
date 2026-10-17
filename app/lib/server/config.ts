import { z } from "zod";
import {
  DEFAULT_OPENAI_BASE_URL,
  isAllowedOpenAiBaseUrl,
} from "./egress-policy.ts";

const ServerConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.url().default("http://localhost:5173"),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_RESUME_BUCKET: z.string().min(1).default("resumes"),
  NATIVE_EVIDENCE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  EVIDENCE_REVIEW_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CANONICAL_AUTHORING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ARTIFACT_RENDERING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTHORING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SCORING_V2_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  JOB_INTELLIGENCE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  NATIVE_LAYOUT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ANALYZE_INVITE_TOKEN: z.string().default(""),
  ANALYZE_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  ANALYZE_RATE_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(3_600)
    .default(60),
  AI_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AI_MONTHLY_TOKEN_LIMIT: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(10_000_000)
    .default(100_000),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z
    .string()
    .default(DEFAULT_OPENAI_BASE_URL)
    .refine(isAllowedOpenAiBaseUrl, "approved OpenAI egress is required"),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(20_000),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(8_000)
    .default(1_200),
  QUALITATIVE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(1),
  ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  MAX_PDF_PAGES: z.coerce.number().int().min(1).max(20).default(10),
  MAX_EXTRACTED_CHARACTERS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(200_000)
    .default(100_000),
  EXTRACTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(15_000),
  MAX_JOB_TITLE_CHARACTERS: z.coerce
    .number()
    .int()
    .min(1)
    .max(240)
    .default(120),
  MAX_JOB_DESCRIPTION_CHARACTERS: z.coerce
    .number()
    .int()
    .min(1)
    .max(20_000)
    .default(10_000),
  READINESS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(5_000)
    .default(2_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(10_000),
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(604_800)
    .default(3_600),
  CSP_MODE: z.enum(["report-only", "enforce"]).default("report-only"),
  CSP_REPORT_URI: z.string().trim().default(""),
  METRICS_TOKEN: z.string().default(""),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  PRIVACY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  PRIVACY_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3_600)
    .default(300),
  AI_INPUT_COST_PER_1K_USD: z.coerce.number().min(0).max(100).default(0),
  AI_OUTPUT_COST_PER_1K_USD: z.coerce.number().min(0).max(100).default(0),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

const AnalysisConfigSchema = ServerConfigSchema.pick({
  NATIVE_EVIDENCE_ENABLED: true,
  NATIVE_LAYOUT_ENABLED: true,
  EVIDENCE_REVIEW_ENABLED: true,
  AI_ENABLED: true,
  AI_MONTHLY_TOKEN_LIMIT: true,
  OPENAI_API_KEY: true,
  OPENAI_BASE_URL: true,
  OPENAI_MODEL: true,
  OPENAI_TIMEOUT_MS: true,
  OPENAI_MAX_OUTPUT_TOKENS: true,
  AI_INPUT_COST_PER_1K_USD: true,
  AI_OUTPUT_COST_PER_1K_USD: true,
  QUALITATIVE_MAX_ATTEMPTS: true,
  ANALYSIS_CONCURRENCY: true,
  MAX_UPLOAD_BYTES: true,
  MAX_PDF_PAGES: true,
  MAX_EXTRACTED_CHARACTERS: true,
  EXTRACTION_TIMEOUT_MS: true,
});

export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

const UploadConfigSchema = ServerConfigSchema.pick({
  MAX_UPLOAD_BYTES: true,
  MAX_JOB_TITLE_CHARACTERS: true,
  MAX_JOB_DESCRIPTION_CHARACTERS: true,
});

export type UploadConfig = z.infer<typeof UploadConfigSchema>;

export class ServerConfigError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    super(
      `Invalid server configuration: ${issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
    this.name = "ServerConfigError";
  }
}

export function parseServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = ServerConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ServerConfigError(parsed.error.issues);
  }
  return parsed.data;
}

export function parseAnalysisConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AnalysisConfig {
  const parsed = AnalysisConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ServerConfigError(parsed.error.issues);
  }
  return parsed.data;
}

export function parseUploadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): UploadConfig {
  const parsed = UploadConfigSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ServerConfigError(parsed.error.issues);
  }
  return parsed.data;
}

let serverConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  serverConfig ??= parseServerConfig();
  return serverConfig;
}

let analysisConfig: AnalysisConfig | undefined;

export function getAnalysisConfig(): AnalysisConfig {
  analysisConfig ??= parseAnalysisConfig();
  return analysisConfig;
}

let uploadConfig: UploadConfig | undefined;

export function getUploadConfig(): UploadConfig {
  uploadConfig ??= parseUploadConfig();
  return uploadConfig;
}
