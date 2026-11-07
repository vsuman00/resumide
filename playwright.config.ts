import { defineConfig, devices } from "@playwright/test";
import { lstatSync } from "node:fs";
import { requireBrowserTestTarget } from "./scripts/browser-test-target";

const privateMode = process.env.RESUMIDE_PRIVATE_VERIFY;
if (privateMode !== undefined && privateMode !== "aa7-owned-synthetic")
  throw new Error("Invalid private verification mode");
const privateRun = privateMode === "aa7-owned-synthetic";
if (privateRun) {
  const url = process.env.SUPABASE_URL ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))
    throw new Error("Private verification requires the managed target");
  requireBrowserTestTarget(url);
  if (
    process.env.AA7_HOSTED_TEST_AUTHORIZATION !==
      "temporary-synthetic-users-20261030" ||
    process.env.AA7_TEST_SUPABASE_URL !== url ||
    process.env.OPENAI_API_KEY !== "build-ai-harness-no-live-key" ||
    process.env.OPENAI_BASE_URL !== "https://api.openai.com/v1" ||
    !/^sha256:[a-f0-9]{64}$/.test(process.env.LATEX_COMPILER_IMAGE ?? "")
  )
    throw new Error(
      "Private verification requires its guarded worker/provider",
    );
  for (const [name, pattern] of [
    ["BROWSER_TEST_LEDGER", /^\/tmp\/resumide-auth-audit-[a-z0-9-]+\.jsonl$/],
    ["AA7_AUTH_RECEIPT_FILE", /^\/tmp\/resumide-aa7-[a-z0-9-]+\.jsonl$/],
  ] as const) {
    const path = process.env[name] ?? "";
    if (!pattern.test(path))
      throw new Error("Private verification requires owned fixture ledgers");
    const file = lstatSync(path);
    if (
      !file.isFile() ||
      (file.mode & 0o777) !== 0o600 ||
      file.uid !== process.getuid?.()
    )
      throw new Error("Private verification fixture ledger is not private");
  }
  for (const [name, pattern] of [
    [
      "BROWSER_EVIDENCE_DIR",
      /^docs\/evaluation\/aa7-completion-[a-f0-9-]{36}$/,
    ],
    [
      "BROWSER_PRIVATE_OUTPUT_DIR",
      /^\/tmp\/resumide-aa7-private-[a-f0-9-]{36}\/playwright$/,
    ],
  ] as const) {
    const path = process.env[name] ?? "";
    if (!pattern.test(path))
      throw new Error("Private verification requires fresh evidence paths");
    const directory = lstatSync(path);
    if (
      !directory.isDirectory() ||
      (directory.mode & 0o777) !== 0o700 ||
      directory.uid !== process.getuid?.()
    )
      throw new Error("Private verification evidence directory is not private");
  }
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: privateRun ? ["**/._*", "**/build-assist.spec.ts"] : ["**/._*"],
  fullyParallel: !privateRun,
  workers: privateRun ? 1 : undefined,
  outputDir: privateRun ? process.env.BROWSER_PRIVATE_OUTPUT_DIR : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3110",
    screenshot: privateRun ? "off" : "only-on-failure",
    trace: privateRun ? "off" : "retain-on-failure",
  },
  webServer: {
    command: privateRun
      ? "node --import ./scripts/build-ai-test-preload.mjs --experimental-strip-types scripts/server.mjs"
      : "node --env-file-if-exists=.env --experimental-strip-types scripts/server.mjs",
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
      ...(privateRun
        ? {
            AI_ENABLED: "false",
            LATEX_CONVERTER_ENABLED: "true",
            BUILD_AI_ASSIST_ENABLED: "false",
            BUILD_AI_TEST_HARNESS: "selected-context-synthetic-only",
            OPENAI_API_KEY: "build-ai-harness-no-live-key",
            OPENAI_BASE_URL: "https://api.openai.com/v1",
            NATIVE_EVIDENCE_ENABLED: "true",
            EVIDENCE_REVIEW_ENABLED: "true",
            NATIVE_LAYOUT_ENABLED: "true",
          }
        : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
