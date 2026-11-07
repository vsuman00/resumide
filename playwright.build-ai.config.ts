import { defineConfig, devices } from "@playwright/test";
import guardedBase from "./playwright.config";
const privateRun =
  process.env.RESUMIDE_PRIVATE_VERIFY === "aa7-owned-synthetic";
if (
  !privateRun &&
  (process.env.AA7_HOSTED_TEST_AUTHORIZATION !==
    "temporary-synthetic-users-20261030" ||
    process.env.AA7_TEST_SUPABASE_URL !== process.env.SUPABASE_URL ||
    process.env.OPENAI_API_KEY !== "build-ai-harness-no-live-key")
)
  throw Error(
    "Explicit synthetic Supabase and non-live provider harness required",
  );
const standalone = defineConfig({
  testDir: "./e2e",
  testMatch: "build-assist.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3110", trace: "off", screenshot: "off" },
  webServer: {
    command:
      "node --import ./scripts/build-ai-test-preload.mjs --experimental-strip-types scripts/server.mjs",
    url: "http://127.0.0.1:3110/healthz",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      HOST: "127.0.0.1",
      PORT: "3110",
      NODE_ENV: "production",
      APP_ORIGIN: "http://127.0.0.1:3110",
      AI_ENABLED: "true",
      LATEX_CONVERTER_ENABLED: "true",
      BUILD_AI_ASSIST_ENABLED: "true",
      BUILD_AI_TEST_HARNESS: "selected-context-synthetic-only",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

function privateAiConfiguration() {
  const server = guardedBase.webServer;
  if (!server || Array.isArray(server))
    throw Error("Private Build AI requires the guarded single-server base");
  return defineConfig({
    ...guardedBase,
    testMatch: "build-assist.spec.ts",
    testIgnore: ["**/._*"],
    webServer: {
      ...server,
      env: {
        ...server.env,
        AI_ENABLED: "true",
        BUILD_AI_ASSIST_ENABLED: "true",
      },
    },
  });
}
export default privateRun ? privateAiConfiguration() : standalone;
