import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import {
  createJdClauseOrderBrowserTestRequest,
  readJdClauseOrderBrowserBuildBinding,
  requireJdClauseOrderBrowserTarget,
} from "./scripts/jd-clause-order-browser-target";

const admitted = requireJdClauseOrderBrowserTarget(
  createJdClauseOrderBrowserTestRequest(process.env),
  process.env,
  readJdClauseOrderBrowserBuildBinding(),
);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export default defineConfig({
  testDir: "./e2e",
  testMatch: "jd-clause-order.journey.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: admitted.baseURL,
    screenshot: "off",
    trace: "off",
    video: "off",
    storageState: undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${quote(process.execPath)} --experimental-strip-types ${quote(fileURLToPath(new URL("./scripts/jd-clause-order-browser-target.ts", import.meta.url)))} --serve`,
    url: `${admitted.baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: admitted.serverEnv,
  },
});
