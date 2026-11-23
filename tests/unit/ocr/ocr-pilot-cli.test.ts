import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function check(flags: string[], script = "scripts/verify-ocr-pilot.ts") {
  // No Docker executable is reachable. Receipt/argument checks must finish
  // without recognition, container operations or application credentials.
  return spawnSync(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      script,
      `sha256:${"a".repeat(64)}`,
      ...flags,
    ],
    {
      encoding: "utf8",
      env: {
        PATH: "",
        RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
      },
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
      ["--reliability-development", "--partition=locked"],
      "Reliability development fixtures have a fixed development partition",
    ],
    [["--reliability-development", "--print-pilot"], "Select one pilot corpus"],
    [
      ["--reliability-holdout", "--partition=locked"],
      "Reliability holdout currently permits manifest generation only",
    ],
    [
      ["--reliability-holdout", "--partition=development", "--manifest-only"],
      "Reliability holdout requires calibration or locked",
    ],
    [
      [
        "--reliability-holdout",
        "--partition=locked",
        "--fresh-calibration",
        "--manifest-only",
      ],
      "Fresh calibration is available only in the calibration partition",
    ],
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
  it("binds only the six registered development documents before recognition", () => {
    const result = check([
      "--reliability-development",
      "--psm=3",
      "--dpi=150",
      "--manifest-only",
    ]);
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.status).toBe("manifest_only_no_recognition");
    expect(receipt.evaluationReceipt).toMatchObject({
      datasetId: "ocr-reliability-development/1.0.0",
      partition: "development",
      evaluationConfig: { psm: 3, maxDpi: 150 },
    });
    expect(receipt.sourceManifest).toHaveLength(6);
    expect(
      receipt.sourceManifest.map((row: { segment: string }) => row.segment),
    ).toEqual([
      "clean",
      "challenging",
      "mixed",
      "clean",
      "challenging",
      "mixed",
    ]);
    for (const row of receipt.sourceManifest) {
      expect(row.partition).toBe("development");
      expect(row.expectedTextSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(row.lineOrderSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  }, 20_000);
});

describe("OCR field calibration admission", () => {
  it.each([
    [
      ["--reliability-calibration"],
      "Calibration image differs from registration",
    ],
    [
      ["--reliability-calibration-round2"],
      "Calibration image differs from registration",
    ],
    [
      ["--reliability-calibration", "--partition=locked"],
      "Select a development diagnostic or the registered calibration run",
    ],
    [
      ["--reliability-locked"],
      "Select a development diagnostic or the registered calibration run",
    ],
  ] as const)(
    "rejects an inadmissible calibration request before OCR: %j",
    (flags, message) => {
      const result = check([...flags], "scripts/verify-ocr-fields.ts");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
    },
  );
});
