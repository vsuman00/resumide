import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { runEvaluationWorkflow } from "../../scripts/verify-evaluation-workflow";
import { createEvaluationWorkflowFixture } from "../fixtures/evaluation-workflow";

let report: Awaited<ReturnType<typeof runEvaluationWorkflow>>;
beforeAll(async () => {
  report = await runEvaluationWorkflow();
}, 90_000);

describe("actual local evaluation workflow", () => {
  it("freezes twenty unique byte-hashed cases with honest shared generation families", () => {
    const fixture = createEvaluationWorkflowFixture();
    expect(fixture.documents).toHaveLength(20);
    expect(new Set(fixture.documents.map((doc) => doc.sourceHash)).size).toBe(
      20,
    );
    for (const doc of fixture.documents)
      expect(createHash("sha256").update(doc.bytes).digest("hex")).toBe(
        doc.sourceHash,
      );
    expect(new Set(fixture.documents.map((doc) => doc.serializer)).size).toBe(
      1,
    );
    expect(new Set(fixture.documents.map((doc) => doc.family)).size).toBe(3);
    expect(
      fixture.documents
        .filter((doc) => doc.cohort === "simulated_scanned")
        .every((doc) => doc.reference === null),
    ).toBe(true);
  });

  it("executes application stages without exposing locked labels to calibration", () => {
    expect(report.status).toBe("engineering_pass");
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
    expect(report.annotation.evidenceTier).toBe("synthetic_engineering");
    expect(report.annotation.humanIndependenceDeclared).toBe(false);
    expect(report.calibration.status).toBe("proposed");
    expect(report.calibration.productionAdoptionAllowed).toBe(false);
    expect(report.cases).toHaveLength(8);
    expect(
      report.cases.every(
        (row) => row.sourceUnchanged && row.values.safe_failure === 0,
      ),
    ).toBe(true);
    expect(report.cases.some((row) => row.outputHashes.length === 2)).toBe(
      true,
    );
    expect(report.pilot.checks).toMatchObject({
      noticeBeforeRead: true,
      override: true,
      correction: true,
      appeal: true,
      stop: true,
      rollback: true,
      delete: true,
    });
  });

  it("preserves measured limitations and withholds unsupported corpus/release claims", () => {
    expect(report.lockedEvaluation.status).toBe("assessed");
    expect(report.lockedEvaluation.engineeringReady).toBe(false);
    expect(report.lockedEvaluation.statistics?.numericGatePassed).toBe(false);
    expect(report.cases.every((row) => row.values.cost === null)).toBe(true);
    expect(
      report.cases.some((row) => row.values.artifact_parity === null),
    ).toBe(true);
    expect(
      report.lockedEvaluation.statistics?.cells.some(
        (cell) =>
          cell.metricId === "cost" &&
          cell.intervalStatus === "withheld" &&
          cell.missingMeasurements > 0,
      ),
    ).toBe(true);
    expect(report).toMatchObject({
      providerRequests: 0,
      providerCostUsd: 0,
      computeCostUsd: null,
      representativeReady: false,
      releaseReady: false,
    });
    expect(report.engineeringChecksPassed).toBe(true);
    expect(report.claims.regression.status).toBe("blocked");
    expect(
      report.claims.higher.every(
        (item) => item.assessment.status !== "eligible",
      ),
    ).toBe(true);
    expect(report.claims.monitor).toMatchObject({
      action: "stop_and_rollback",
      activationAllowed: false,
    });
    expect(report.claims.actualTechnicalReviewRegistered).toBe(false);
    expect(report.pilot).toMatchObject({
      actorExecution: "synthetic_role_simulation",
      actualExternalVendorCalls: 0,
      remainingSyntheticDocuments: 0,
    });
    const json = JSON.stringify(report);
    expect(json).not.toContain("Fictional Profile");
    expect(json).not.toContain("@example.test");
  });
});
