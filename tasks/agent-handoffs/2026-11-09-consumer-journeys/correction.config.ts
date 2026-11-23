import { defineConfig } from "@playwright/test";
import base from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/playwright.config";
const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const server = base.webServer;
if (!server || Array.isArray(server))
  throw Error("Single guarded server required");
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "correction-flow.spec.ts",
  testIgnore: ["**/._*"],
  tsconfig: `${root}/tsconfig.json`,
  webServer: { ...server, cwd: root },
});
