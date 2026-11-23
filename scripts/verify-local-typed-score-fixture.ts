import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { importCanonicalEvidence } from "../app/lib/server/canonical-content";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";
import { deriveEvidenceEntryAssociations } from "../app/lib/server/evidence-entry-associations";
import { prepareGroupedOriginalCommand } from "../app/lib/server/grouped-import-commands";
import { createJobRequirementRelations } from "../app/lib/server/job-requirement-admission";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { buildTypedScoreDiagnostics } from "../app/lib/server/typed-score-diagnostics";
import { verifyLocalTypedScoreBrowser } from "./verify-local-typed-score-browser";

assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
const input: unknown = JSON.parse(readFileSync(0, "utf8"));

if (process.argv.includes("--prepare")) {
  const clauseOrder = process.argv.includes("--clause-order");
  const { jobId, ...ids } = z
    .strictObject({
      ownerId: z.uuid(),
      organizationId: z.uuid(),
      resumeId: z.uuid(),
      analysisId: z.uuid(),
      jobId: z.uuid(),
      sourceId: z.uuid(),
      attemptId: z.uuid(),
    })
    .parse(input);
  const text = clauseOrder
    ? "Experience\nSoftware Engineer at Orchard Labs\nBuilt services using Python; Developed tools using Git"
    : [
        "Experience",
        "Employer: Synthetic Orchard Labs",
        "Role: Platform Engineer",
        "Dates: 2018-01-01 - 2024-01-01",
        "Built services using Python",
        "Used Python from 2020-01-01 to 2022-01-01",
        "Used Python from 2021-01-01 to 2023-01-01",
        "Skills",
        "Python",
      ].join("\n");
  const owned = {
    ...ids,
    inputSha256: createHash("sha256").update(text).digest("hex"),
  };
  const evidence = reconcileDocumentEvidence(
    {
      id: owned.attemptId,
      ownerId: owned.ownerId,
      analysisId: owned.analysisId,
      sourceId: owned.sourceId,
      inputSha256: owned.inputSha256,
      createdAt: "2026-11-14T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const associations = deriveEvidenceEntryAssociations(evidence, owned);
  if (!clauseOrder) assert.equal(associations.groups.length, 1);
  const grouped = clauseOrder
    ? null
    : prepareGroupedOriginalCommand(evidence, owned, {
        schemaVersion: "grouped-original-command/1.0.0",
        operation: "approve_and_import_grouped_original",
        binding: {
          ...associations.binding,
          organizationId: owned.organizationId,
          resumeId: owned.resumeId,
          associationModelVersion: associations.modelVersion,
          producerVersion: "canonical-engine/1.0.3",
          admissionPolicyVersion: "grouped-original-admission/1.0.0",
          structuralTextProfileVersion: "a02-structural-text/1.0.0",
          correctionProjectionModelVersion: "canonical-corrections/1.0.1",
          correctionAdmissionPolicyVersion:
            "candidate-correction-admission/1.0.0",
          effectiveLocale: "en-IN",
        },
        expected: {
          reviewRevision: 0,
          reviewHeadId: null,
          assignmentRevision: 0,
          assignmentHeadId: null,
          associationRevision: 0,
          associationHeadId: null,
          canonicalHeadId: null,
        },
        selectedGroupIds: associations.groups.map((group) => group.id),
        unselectedDisposition: "retain_original",
      });
  assert(grouped === null || grouped.state === "prepared");
  const first = createJobRequirementRelations(
    clauseOrder
      ? "Requirements\nPython required"
      : "Requirements\nAt least 2 years of Python experience required",
    {
      ...ids,
      jobId,
      locale: "en-IN",
      domain: "software-engineering",
      parentVersionId: null,
    },
  );
  const second = createJobRequirementRelations(
    clauseOrder
      ? "Requirements\nGit required"
      : process.argv.includes("--authoring")
        ? "Requirements\nAt least 4 years of Python experience required\nPython required"
        : "Requirements\nAt least 4 years of Python experience required",
    {
      ...ids,
      jobId,
      locale: "en-IN",
      domain: "software-engineering",
      parentVersionId: first.id,
    },
  );
  process.stdout.write(
    JSON.stringify({
      evidence,
      original: importCanonicalEvidence(evidence, {
        ...owned,
        locale: "en-IN",
      }),
      command:
        grouped?.state === "prepared"
          ? {
              normalForm: grouped.normalForm,
              previewHash: grouped.previewHash,
              idempotencyKey: randomUUID(),
            }
          : null,
      first,
      second,
    }),
  );
} else if (process.env.RESUMIDE_A10_BROWSER === "true") {
  await verifyLocalTypedScoreBrowser(input);
} else {
  const contexts = z
    .strictObject({ historical: z.unknown(), current: z.unknown() })
    .parse(input);
  const historical = buildTypedScoreDiagnostics(contexts.historical);
  const current = buildTypedScoreDiagnostics(contexts.current);
  assert.deepEqual(buildTypedScoreDiagnostics(contexts.current), current);
  assert.equal(
    historical.diagnostics.score.canonicalVersionId,
    current.diagnostics.score.canonicalVersionId,
  );
  assert.notEqual(
    historical.diagnostics.score.requirementVersionId,
    current.diagnostics.score.requirementVersionId,
  );
  for (const [read, expected] of [
    [historical, "satisfied"],
    [current, "not_satisfied"],
  ] as const) {
    const score = read.diagnostics.score;
    assert.equal(score.state, "withheld");
    assert.equal(score.dimensions.length, 3);
    assert(
      score.dimensions.every(
        (dimension) => dimension.value === null && !dimension.eligible,
      ),
    );
    const operand = read.typedCoverage.clauses[0].operands[0];
    assert.notEqual(operand.proposedState, "satisfied");
    assert.equal(operand.confirmedSourceDuration, null);
    const duration = operand.duration;
    assert.equal(duration?.state, expected);
    assert.equal(duration.durationDays.minimum, 1096);
    assert.equal(duration.durationDays.maximum, 1097);
  }
  process.stdout.write(
    "Stored typed pairs preserved duration unions and withheld every numeric dimension.\n",
  );
}
