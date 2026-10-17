import { spawnSync } from "node:child_process";
import { it, expect } from "vitest";
import { benchmarkWriterGrounding } from "../../scripts/writer-grounding-engineering";
it("rejects invented claims and never adopts an actual model from synthetic adapters", async () => {
  const r = await benchmarkWriterGrounding();
  expect(r.engineeringPassed).toBe(true);
  expect(r.unsupportedAcceptedFacts).toBe(0);
  expect(r.adapters).toHaveLength(3);
  expect(r.actualModelComparison).toBeNull();
  expect(r.adoptedModel).toBeNull();
  expect(r.releasePassed).toBe(false);
});
it("release mode emits a blocked receipt and exits nonzero", () => {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      "scripts/benchmark-writer-grounding.ts",
      "--release",
    ],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).releasePassed).toBe(false);
});
