import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function check(flags: string[]) {
  // No Docker executable is reachable. Receipt/argument checks must finish
  // without recognition, container operations or application credentials.
  return spawnSync(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      "scripts/verify-ocr-pilot.ts",
      `sha256:${"a".repeat(64)}`,
      ...flags,
    ],
    {
      encoding: "utf8",
      env: { PATH: "" },
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    },
  );
}

describe("OCR pilot CLI safety gates", () => {
  it.each([
    [["--psm=7"], "Unknown checker option"],
    [["--dpi=150", "--dpi=300"], "Duplicate checker option"],
    [["--print-pilot"], "Print pilot requires an explicit partition"],
    [
      ["--print-pilot", "--partition=locked"],
      "Locked execution requires the previously frozen receipt",
    ],
    [
      [`--lock-receipt=${"b".repeat(64)}`],
      "Lock receipt is valid only for the locked print partition",
    ],
  ] as const)("refuses unsafe flags before execution: %j", (flags, message) => {
    const result = check([...flags]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe("");
  });
  it("rejects a mismatched frozen receipt without reaching Docker", () => {
    const result = check([
      "--print-pilot",
      "--partition=locked",
      `--lock-receipt=${"b".repeat(64)}`,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Frozen receipt mismatches source, configuration or immutable image",
    );
    expect(result.stdout).toBe("");
  }, 20_000);
  it("can freeze held-out sources without Docker or recognition", () => {
    const result = check([
      "--print-pilot",
      "--partition=locked",
      "--manifest-only",
    ]);
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.evaluationReceipt.partition).toBe("locked");
    expect(receipt.evaluationReceiptSha256).toMatch(/^[a-f0-9]{64}$/u);
  }, 20_000);
});
