import { defineConfig, devices } from "@playwright/test";

if (
  process.env.AA7_HOSTED_TEST_AUTHORIZATION !==
    "temporary-synthetic-users-20261030" ||
  process.env.AA7_TEST_SUPABASE_URL !== process.env.SUPABASE_URL ||
  process.env.AI_ENABLED !== "false"
)
  throw Error(
    "Load only the explicitly approved synthetic Supabase test environment; AI must remain disabled",
  );

export default defineConfig({
  testDir: "./e2e",
  testMatch: "latex-converter.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3110",
    screenshot: "off",
    trace: "off", // Authenticated traces can retain cookies; do not save them.
  },
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
      LATEX_CONVERTER_ENABLED: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
