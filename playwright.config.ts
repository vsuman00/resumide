import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3110",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --env-file-if-exists=.env --experimental-strip-types scripts/server.mjs",
    url: "http://127.0.0.1:3110/healthz",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: "127.0.0.1",
      PORT: "3110",
      NODE_ENV: "production",
      APP_ORIGIN: "http://127.0.0.1:3110",
      CANONICAL_AUTHORING_ENABLED: "true",
      JOB_INTELLIGENCE_ENABLED: "true",
      SCORING_V2_ENABLED: "true",
      AUTHORING_ENABLED: "true",
      ARTIFACT_RENDERING_ENABLED: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
