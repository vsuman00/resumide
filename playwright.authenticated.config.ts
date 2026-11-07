import { defineConfig, devices } from "@playwright/test";
import { requireBrowserTestTarget } from "./scripts/browser-test-target";

requireBrowserTestTarget(process.env.SUPABASE_URL ?? "");
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "canonical-resume.spec.ts",
    "job-requirements.spec.ts",
    "scoring-v2.spec.ts",
    "authoring.spec.ts",
    "artifact-export.spec.ts",
    "browser-repairs.spec.ts",
    "evidence-review.spec.ts",
    "native-layout.spec.ts",
    "audit-repairs.spec.ts",
    "workspace-navigation.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3110", screenshot: "off", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --experimental-strip-types scripts/server.mjs",
    url: "http://127.0.0.1:3110/healthz",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      HOST: "127.0.0.1",
      PORT: "3110",
      NODE_ENV: "production",
      APP_ORIGIN: "http://127.0.0.1:3110",
      AI_ENABLED: "false",
      EVIDENCE_REVIEW_ENABLED: "true",
      NATIVE_EVIDENCE_ENABLED: "true",
      NATIVE_LAYOUT_ENABLED: "true",
      CANONICAL_AUTHORING_ENABLED: "true",
      JOB_INTELLIGENCE_ENABLED: "true",
      SCORING_V2_ENABLED: "true",
      AUTHORING_ENABLED: "true",
      ARTIFACT_RENDERING_ENABLED: "true",
    },
  },
});
