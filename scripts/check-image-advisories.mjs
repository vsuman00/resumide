import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

const severities = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function summarize(imageId, scannerVersion, reportPath, sbomPath) {
  requireEvidence(
    /^sha256:[0-9a-f]{64}$/.test(imageId) &&
      /^\d+\.\d+\.\d+$/.test(scannerVersion) &&
      reportPath &&
      sbomPath,
    "Expected an immutable image ID, scanner version and two report files",
  );
  const advisoryBytes = readFileSync(reportPath);
  const sbomBytes = readFileSync(sbomPath);
  const report = JSON.parse(advisoryBytes);
  const sbom = JSON.parse(sbomBytes);
  requireEvidence(
    report?.SchemaVersion === 2 &&
      report.ArtifactType === "container_image" &&
      report.Metadata?.ImageID === imageId &&
      report.Trivy?.Version === scannerVersion &&
      typeof report.CreatedAt === "string" &&
      Number.isFinite(Date.parse(report.CreatedAt)) &&
      typeof report.Metadata.OS?.Family === "string" &&
      Array.isArray(report.Results) &&
      report.Results.some(
        (result) =>
          result?.Class === "os-pkgs" &&
          Array.isArray(result.Packages) &&
          result.Packages.length > 0,
      ),
    "The advisory report does not identify the expected image and OS inventory",
  );
  const imageConfig = report.Metadata.ImageConfig ?? {};
  requireEvidence(
    typeof imageConfig === "object" &&
      Object.entries(imageConfig).every(
        ([key, value]) =>
          (key === "architecture" || key === "os") &&
          (value === null ||
            (typeof value === "string" && /^[a-z0-9_-]+$/.test(value))),
      ),
    "The report contains private image configuration",
  );
  const component = sbom?.metadata?.component;
  const imageIds = component?.properties?.filter(
    (property) => property?.name === "aquasecurity:trivy:ImageID",
  );
  requireEvidence(
    sbom?.bomFormat === "CycloneDX" &&
      component?.type === "container" &&
      imageIds?.length === 1 &&
      imageIds[0].value === imageId &&
      Array.isArray(sbom.components) &&
      sbom.components.length > 0,
    "The CycloneDX document has no container inventory",
  );

  const findings = Object.fromEntries(severities.map((name) => [name, 0]));
  let unfixedBlocking = 0;
  for (const result of report.Results) {
    requireEvidence(
      result &&
        !Object.hasOwn(result, "Secrets") &&
        (result.Vulnerabilities === undefined ||
          Array.isArray(result.Vulnerabilities)),
      "The report contains private or malformed results",
    );
    for (const item of result.Vulnerabilities ?? []) {
      requireEvidence(
        typeof item?.VulnerabilityID === "string" &&
          item.VulnerabilityID.length > 0 &&
          severities.includes(item.Severity),
        "The report contains an unclassifiable advisory",
      );
      findings[item.Severity] += 1;
      if (["HIGH", "CRITICAL"].includes(item.Severity) && !item.FixedVersion) {
        unfixedBlocking += 1;
      }
    }
  }

  return {
    imageId,
    scannerVersion: report.Trivy.Version,
    scannedAt: report.CreatedAt,
    findings,
    blocking: findings.HIGH + findings.CRITICAL,
    unfixedBlocking,
    advisorySha256: digest(advisoryBytes),
    sbomSha256: digest(sbomBytes),
  };
}

try {
  const args = process.argv.slice(2);
  requireEvidence(args.length === 4, "Expected exactly four arguments");
  process.stdout.write(JSON.stringify(summarize(...args), null, 2) + "\n");
} catch {
  // Raw scanner results and parser errors can contain sensitive data.
  process.stderr.write("Image advisory evidence is invalid or incomplete.\n");
  process.exitCode = 1;
}
