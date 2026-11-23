import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3110";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/a11y.spec.ts",
    "**/audit-repairs.spec.ts",
    "**/phase6.spec.ts",
    "**/phase7.spec.ts",
    "**/smoke.spec.ts",
    "**/public-health.journey.ts",
  ],
  fullyParallel: true,
  outputDir: "test-results/public",
  reporter: "list",
  use: {
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Clear inherited configuration and avoid loading the workspace .env.
    command: [
      'env -i PATH="$PATH"',
      "HOST=127.0.0.1 PORT=3110",
      `APP_ORIGIN=${origin}`,
      "AI_ENABLED=false",
      "SUPABASE_URL=http://127.0.0.1:0",
      "SUPABASE_PUBLISHABLE_KEY=public-test-placeholder",
      "SUPABASE_SECRET_KEY=public-test-placeholder",
      "OPENAI_API_KEY=public-test-placeholder",
      "node --experimental-strip-types scripts/server.mjs",
    ].join(" "),
    url: `${origin}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
