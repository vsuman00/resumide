import { spawnSync } from "node:child_process";
import { it, expect } from "vitest";
import { scoringEngineeringBenchmark } from "../../scripts/scoring-validity-engineering";
it("AA046 checks deterministic traces and invariance while failing closed on unreviewed release metrics", () => {
  const report = scoringEngineeringBenchmark();
  expect(report.engineeringPassed).toBe(true);
  expect(report.releasePassed).toBe(false);
  expect(report.segments).toHaveLength(9);
  expect(report.expertAgreement).toBeNull();
  expect(report.representativeFairnessError).toBeNull();
});

it("release CLI produces a blocked receipt and a nonzero exit", () => {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      "scripts/benchmark-scoring-validity.ts",
      "--release",
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  const receipt = JSON.parse(result.stdout.trim());
  expect(receipt.engineeringPassed).toBe(true);
  expect(receipt.releasePassed).toBe(false);
  expect(receipt.releaseBlockers.length).toBeGreaterThan(0);
});
