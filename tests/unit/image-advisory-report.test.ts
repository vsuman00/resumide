import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const imageId = `sha256:${"a".repeat(64)}`;
const script = fileURLToPath(
  new URL("../../scripts/check-image-advisories.mjs", import.meta.url),
);

function report(overrides: Record<string, unknown> = {}) {
  return {
    SchemaVersion: 2,
    ArtifactType: "container_image",
    Trivy: { Version: "0.70.0" },
    CreatedAt: "2026-11-22T09:00:00Z",
    Metadata: { ImageID: imageId, OS: { Family: "alpine" } },
    Results: [
      { Class: "os-pkgs", Packages: [{ Name: "synthetic-system" }] },
      { Class: "lang-pkgs", Packages: [{ Name: "synthetic-js" }] },
    ],
    ...overrides,
  };
}

const sbom = {
  bomFormat: "CycloneDX",
  metadata: {
    component: {
      type: "container",
      properties: [{ name: "aquasecurity:trivy:ImageID", value: imageId }],
    },
  },
  components: [{ type: "library", name: "synthetic-system" }],
};

function run(input: unknown, bom: unknown = sbom) {
  const dir = mkdtempSync(join(tmpdir(), "resumide-image-advisory-test-"));
  try {
    const raw = join(dir, "advisories.json");
    const inventory = join(dir, "sbom.cdx.json");
    writeFileSync(raw, JSON.stringify(input));
    writeFileSync(inventory, JSON.stringify(bom));
    return spawnSync(
      process.execPath,
      [script, imageId, "0.70.0", raw, inventory],
      {
        encoding: "utf8",
        timeout: 5_000,
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("CI image advisory evidence", () => {
  it("counts every severity and flags fixed and unfixed blockers", () => {
    const severities = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const input = report();
    const result = run({
      ...input,
      Results: [
        {
          ...input.Results[0],
          Vulnerabilities: severities.map((Severity, index) => ({
            VulnerabilityID: `SYNTHETIC-${index}`,
            Severity,
            FixedVersion: Severity === "HIGH" ? "" : "1.1.0",
          })),
        },
        input.Results[1],
      ],
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      imageId,
      scannerVersion: "0.70.0",
      findings: { UNKNOWN: 1, LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 1 },
      blocking: 2,
      unfixedBlocking: 1,
      advisorySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      sbomSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("accepts a complete inventory when Trivy omits empty advisory arrays", () => {
    const result = run(report());
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ blocking: 0 });
  });

  it.each([
    report({ Metadata: { ImageID: `sha256:${"b".repeat(64)}` } }),
    report({ Trivy: { Version: "0.60.0" } }),
    report({ Results: [] }),
    report({ Results: [{ Class: "lang-pkgs", Packages: [] }] }),
    report({
      Results: [
        {
          Class: "os-pkgs",
          Packages: [{}],
          Vulnerabilities: [
            { VulnerabilityID: "SYNTHETIC", Severity: "OTHER" },
          ],
        },
      ],
    }),
    report({
      Results: [
        { Class: "os-pkgs", Packages: [{}], Secrets: [{ RuleID: "fixture" }] },
      ],
    }),
  ])("rejects incomplete, unbound or private report data", (input) => {
    const result = run(input);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Image advisory evidence is invalid or incomplete.\n",
    );
  });

  it("rejects an empty SBOM", () => {
    expect(run(report(), { ...sbom, components: [] }).status).toBe(1);
  });

  it.each([
    { properties: [] },
    {
      properties: [
        {
          name: "aquasecurity:trivy:ImageID",
          value: `sha256:${"b".repeat(64)}`,
        },
      ],
    },
  ])("rejects SBOMs without the exact reviewed image ID", ({ properties }) => {
    const metadata = { component: { ...sbom.metadata.component, properties } };
    expect(run(report(), { ...sbom, metadata }).status).toBe(1);
  });

  it("rejects image environment and history before evidence can be published", () => {
    const input = report();
    const result = run({
      ...input,
      Metadata: {
        ...input.Metadata,
        ImageConfig: { architecture: "arm64", config: {}, history: [] },
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });
});
