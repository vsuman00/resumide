import { describe, expect, it } from "vitest";
import {
  evaluateStatistics,
  spearmanRankCorrelation,
} from "../../app/lib/server/evaluation-statistics";

const documentHash = (index: number) => index.toString(16).padStart(64, "0");
function input(values = [0, 1, 1, 1], kind = "success", threshold = 0.1) {
  const rows = values.map((value, index) => ({
    documentHash: documentHash(index + 1),
    clusterId: `cluster-${index}`,
    segmentId: "native",
    values: { metric: value },
  }));
  return {
    schemaVersion: 1,
    seed: 7,
    requiredSegments: ["native"],
    policies: [{ id: "metric", kind, threshold, minimumClusters: 2 }],
    expectedDocuments: rows.map((row) => ({
      documentHash: row.documentHash,
      clusterId: row.clusterId,
      segmentId: row.segmentId,
    })),
    observations: rows,
  };
}
describe("whole-cluster evaluation statistics", () => {
  it("runs exactly 10,000 seeded two-sided percentile draws deterministically", () => {
    const first = evaluateStatistics(input());
    const second = evaluateStatistics(input());
    expect(first).toEqual(second);
    expect(first.resamples).toBe(10000);
    expect(first.confidence).toBe(0.95);
    expect(first.status).toBe("assessed");
    expect(first.numericGatePassed).toBe(true);
    expect(first.cells.every((cell) => cell.validReplicates === 10000)).toBe(
      true,
    );
    const changed = evaluateStatistics({ ...input(), seed: 8 });
    expect(changed.cells[0].bootstrapHash).not.toBe(
      first.cells[0].bootstrapHash,
    );
  });

  it("canonicalizes document/policy order without changing results", () => {
    const data = input();
    const reversed = structuredClone(data);
    reversed.observations.reverse();
    reversed.expectedDocuments.reverse();
    expect(evaluateStatistics(reversed)).toEqual(evaluateStatistics(data));
  });

  it("resamples complete clusters rather than pretending member documents are independent", () => {
    const data = input(
      Array.from({ length: 16 }, (_, i) => Number(i >= 8)),
      "success",
      0,
    );
    for (let i = 0; i < data.observations.length; i++) {
      data.observations[i].clusterId = `cluster-${Number(i >= 8)}`;
      data.expectedDocuments[i].clusterId = data.observations[i].clusterId;
    }
    const result = evaluateStatistics(data);
    expect(result.cells[0].clusters).toBe(2);
    expect(result.cells[0].interval).toEqual([0, 1]);
  });

  it("keeps cross-segment members together in aggregate draws", () => {
    const data = input([0, 1, 1, 0], "success", 0);
    data.requiredSegments = ["native", "scanned"];
    for (let i = 0; i < 4; i++) {
      data.observations[i].clusterId = `cluster-${Math.floor(i / 2)}`;
      data.observations[i].segmentId = i % 2 === 0 ? "native" : "scanned";
      Object.assign(data.expectedDocuments[i], {
        clusterId: data.observations[i].clusterId,
        segmentId: data.observations[i].segmentId,
      });
    }
    const result = evaluateStatistics(data);
    expect(result.cells[0].segmentId).toBe(null);
    expect(result.cells[0].estimate).toBe(0.5);
    expect(result.cells[0].intervalStatus).toBe("degenerate");
    expect(result.cells[0].interval).toEqual([0.5, 0.5]);
  });

  it("uses success lower and error upper bounds, never aggregate-only pass", () => {
    expect(
      evaluateStatistics(input([0, 1, 1, 1], "success", 0.99))
        .numericGatePassed,
    ).toBe(false);
    const pass = evaluateStatistics(input([0, 0.1, 0.2, 0.3], "error", 0.4));
    expect(pass.numericGatePassed).toBe(true);
    expect(
      evaluateStatistics(input([0, 0.1, 0.2, 0.3], "error", 0))
        .numericGatePassed,
    ).toBe(false);
    const missing = evaluateStatistics({
      ...input(),
      requiredSegments: ["native", "scanned"],
    });
    expect(
      missing.cells.some((cell) => cell.intervalStatus === "missing_segment"),
    ).toBe(true);
    expect(missing.numericGatePassed).toBe(false);
  });

  it("does not turn all-success or zero observed errors into a population-perfect interval pass", () => {
    for (const data of [
      input([1, 1, 1, 1]),
      input([0, 0, 0, 0], "error", 0.01),
    ]) {
      const result = evaluateStatistics(data);
      expect(result.cells[0].intervalStatus).toBe("degenerate");
      expect(result.numericGatePassed).toBe(false);
    }
  });

  it("treats exact-zero safety as observed evidence without a bootstrap promise", () => {
    const result = evaluateStatistics(input([0, 0, 0, 0], "exact_zero", 0));
    expect(result.numericGatePassed).toBe(true);
    expect(result.cells[0]).toMatchObject({
      intervalStatus: "exact_observed",
      interval: null,
      validReplicates: 0,
      statistic: "observed_incident_sum",
    });
    expect(
      evaluateStatistics(input([0, 0, 1, 0], "exact_zero", 0))
        .numericGatePassed,
    ).toBe(false);
    expect(
      evaluateStatistics(input([-1, 0, 1, 0], "exact_zero", 0)).reason,
    ).toBe("INVALID_MEASUREMENT");
  });

  it("estimates explicit latency/cost means rather than claiming p95", () => {
    for (const kind of ["mean_lower", "mean_upper"]) {
      const result = evaluateStatistics(
        input([10, 20, 30, 40], kind, kind === "mean_lower" ? 0 : 50),
      );
      expect(result.numericGatePassed).toBe(true);
      expect(result.cells[0]).toMatchObject({
        statistic: "document_mean",
        estimate: 25,
        intervalStatus: "estimated",
      });
    }
  });

  it("uses midranks for ties and blocks constant or undersized rank data", () => {
    expect(
      spearmanRankCorrelation([
        { actual: 1, reference: 1 },
        { actual: 1, reference: 2 },
        { actual: 2, reference: 2 },
        { actual: 3, reference: 4 },
      ]),
    ).toBeCloseTo(5 / 6, 12);
    expect(
      spearmanRankCorrelation([
        { actual: 2, reference: 1 },
        { actual: 1, reference: 2 },
      ]),
    ).toBe(-1);
    expect(
      spearmanRankCorrelation([
        { actual: 1, reference: 1 },
        { actual: 1, reference: 2 },
      ]),
    ).toBe(null);
    expect(spearmanRankCorrelation([{ actual: 1, reference: 1 }])).toBe(null);
  });

  it("records undefined bootstrap rank replicates and refuses to discard them into a passing CI", () => {
    const scalar = input();
    const data = {
      ...scalar,
      policies: [
        { id: "metric", kind: "rank", threshold: 0, minimumClusters: 2 },
      ],
      observations: scalar.observations.map((row, index) => ({
        ...row,
        values: { metric: { actual: index, reference: index } },
      })),
    };
    const result = evaluateStatistics(data);
    expect(result.cells[0].invalidReplicates).toBeGreaterThan(0);
    expect(result.cells[0].intervalStatus).toBe("undefined");
    expect(result.numericGatePassed).toBe(false);
  });

  it("rejects missing/extra docs, metric omissions, source/cluster drift and nonfinite data", () => {
    const missing = input();
    missing.observations.pop();
    expect(evaluateStatistics(missing).reason).toBe(
      "DOCUMENT_COVERAGE_MISMATCH",
    );
    const drift = input();
    drift.observations[0].clusterId = "changed";
    expect(evaluateStatistics(drift).reason).toBe("DOCUMENT_COVERAGE_MISMATCH");
    const metric = input();
    metric.observations[0].values = {} as { metric: number };
    expect(evaluateStatistics(metric).reason).toBe("METRIC_COVERAGE_MISMATCH");
    const nonfinite = input();
    nonfinite.observations[0].values.metric = Number.NaN;
    expect(evaluateStatistics(nonfinite).reason).toBe("INVALID_INPUT");
    expect(evaluateStatistics({ ...input(), resamples: 10 }).reason).toBe(
      "INVALID_INPUT",
    );
  });

  it("preserves null denominators as withheld and reports fully measured segments", () => {
    const scalar = input([0, 1, 0, 1]);
    const data = {
      ...scalar,
      requiredSegments: ["native", "scanned"],
      observations: scalar.observations.map((row, i) => ({
        ...row,
        segmentId: i < 2 ? "native" : "scanned",
        values: { metric: i === 0 ? null : row.values.metric },
      })),
    };
    data.expectedDocuments = data.observations.map(
      ({ documentHash, clusterId, segmentId }) => ({
        documentHash,
        clusterId,
        segmentId,
      }),
    );
    const report = evaluateStatistics(data);
    expect(report.status).toBe("assessed");
    expect(report.numericGatePassed).toBe(false);
    expect(report.cells[0]).toMatchObject({
      documents: 4,
      missingMeasurements: 1,
      intervalStatus: "withheld",
      estimate: null,
      interval: null,
      validReplicates: 0,
    });
    expect(
      report.cells.find((cell) => cell.segmentId === "native")?.intervalStatus,
    ).toBe("withheld");
    expect(
      report.cells.find((cell) => cell.segmentId === "scanned")?.intervalStatus,
    ).toBe("estimated");
    const safety = {
      ...data,
      policies: [
        { id: "metric", kind: "exact_zero", threshold: 0, minimumClusters: 2 },
      ],
    };
    expect(evaluateStatistics(safety).cells[0].intervalStatus).toBe("withheld");
  });
  it("rejects oversized computational work before starting resampling", () => {
    const data = input(Array.from({ length: 4096 }, (_, i) => i % 2));
    data.policies = Array.from({ length: 3 }, (_, i) => ({
      ...data.policies[0],
      id: `metric${i}`,
    }));
    const value = {
      ...data,
      observations: data.observations.map((row) => ({
        ...row,
        values: { metric0: 0, metric1: 0, metric2: 0 },
      })),
    };
    expect(evaluateStatistics(value)).toMatchObject({
      status: "rejected",
      reason: "COMPUTE_BUDGET_EXCEEDED",
      cells: [],
    });
  });
  it("reports insufficient clusters even when the document count is large", () => {
    const data = input(Array.from({ length: 100 }, (_, i) => i % 2));
    data.observations.forEach((row) => {
      row.clusterId = "same-cluster";
    });
    data.expectedDocuments.forEach((row) => {
      row.clusterId = "same-cluster";
    });
    expect(evaluateStatistics(data).cells[0].intervalStatus).toBe(
      "insufficient_clusters",
    );
  });
});
