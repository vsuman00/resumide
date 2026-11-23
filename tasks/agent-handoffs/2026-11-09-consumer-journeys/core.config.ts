import { defineConfig } from "@playwright/test";
import base from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/playwright.config";
const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const server = base.webServer;
if (!server || Array.isArray(server))
  throw Error("Single guarded server required");
export default defineConfig({
  ...base,
  testDir: `${root}/e2e`,
  testIgnore: [
    "**/._*",
    "**/latex-converter.spec.ts",
    "**/build-assist.spec.ts",
  ],
  tsconfig: `${root}/tsconfig.json`,
  webServer: { ...server, cwd: root },
});
