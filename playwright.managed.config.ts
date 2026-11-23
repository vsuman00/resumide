import { defineConfig, devices } from "@playwright/test";
import { requireBrowserTestTarget } from "./scripts/browser-test-target";
import { requireManagedApiTarget } from "./scripts/managed-test-target";

const origin = "http://127.0.0.1:3110";
const output = process.env.BROWSER_PRIVATE_OUTPUT_DIR;
if (
  process.env.MANAGED_BROWSER_CORE !== "isolated-synthetic" ||
  !output ||
  process.env.OPENAI_API_KEY !== "build-ai-harness-no-live-key" ||
  process.env.AI_ENABLED !== "false"
)
  throw new Error("Managed browser configuration requires its private runner");
const target = process.env.SUPABASE_URL ?? "";
requireManagedApiTarget(target);
requireBrowserTestTarget(target);

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/readiness.spec.ts",
    "**/artifact-export.spec.ts",
    "**/authoring.spec.ts",
    "**/browser-repairs.spec.ts",
    "**/canonical-resume.spec.ts",
    "**/evidence-review.spec.ts",
    "**/job-requirements.spec.ts",
    "**/native-layout.spec.ts",
    "**/scoring-v2.spec.ts",
    "**/workspace-navigation.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTimeout: 5 * 60_000,
  outputDir: output,
  reporter: "list",
  use: { baseURL: origin, screenshot: "off", trace: "off", video: "off" },
  webServer: {
    command: "node --experimental-strip-types scripts/server.mjs",
    url: `${origin}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: "127.0.0.1",
      PORT: "3110",
      NODE_ENV: "production",
      APP_ORIGIN: origin,
      AI_ENABLED: "false",
      CANONICAL_AUTHORING_ENABLED: "true",
      JOB_INTELLIGENCE_ENABLED: "true",
      SCORING_V2_ENABLED: "true",
      AUTHORING_ENABLED: "true",
      ARTIFACT_RENDERING_ENABLED: "true",
      EVIDENCE_REVIEW_ENABLED: "true",
      NATIVE_EVIDENCE_ENABLED: "true",
      NATIVE_LAYOUT_ENABLED: "true",
      LATEX_CONVERTER_ENABLED: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
