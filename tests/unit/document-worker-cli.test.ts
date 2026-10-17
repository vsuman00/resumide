import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const script = "scripts/verify-document-worker.ts";
describe("local document worker verification guard", () => {
  it.each([
    {
      SUPABASE_URL: "https://hosted.example.test",
      EVIDENCE_REVIEW_ENABLED: "true",
    },
    {
      SUPABASE_URL: "http://127.0.0.1:54321",
      EVIDENCE_REVIEW_ENABLED: "false",
    },
    {
      SUPABASE_URL: "http://user:password@127.0.0.1:54321",
      EVIDENCE_REVIEW_ENABLED: "true",
    },
    {
      SUPABASE_URL: "http://localhost.attacker.test",
      EVIDENCE_REVIEW_ENABLED: "true",
    },
  ])(
    "refuses unsafe configuration before client imports or network activity %j",
    (config) => {
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/vite-node/vite-node.mjs",
          "--config",
          "vitest.config.ts",
          script,
        ],
        {
          env: {
            ...process.env,
            ...config,
            SUPABASE_SECRET_KEY: "synthetic-never-used-secret",
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain("synthetic-never-used-secret");
      expect(result.stderr).toMatch(
        /Explicit EVIDENCE_REVIEW_ENABLED=true|Only a localhost Supabase stack/u,
      );
    },
  );
});
