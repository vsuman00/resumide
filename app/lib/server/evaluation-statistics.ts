import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const finite = z.number().finite().min(-1e12).max(1e12);
const source = z.strictObject({
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  clusterId: id,
  segmentId: id,
});
export const evaluationMetricPolicySchema = z
  .strictObject({
    id,
    kind: z.enum([
      "success",
      "error",
      "rank",
      "mean_lower",
      "mean_upper",
      "exact_zero",
    ]),
    threshold: finite,
    minimumClusters: z.number().int().min(2).max(4096),
  })
  .refine((policy) =>
    policy.kind === "success" || policy.kind === "error"
      ? policy.threshold >= 0 && policy.threshold <= 1
      : policy.kind === "rank"
        ? policy.threshold >= -1 && policy.threshold <= 1
        : policy.kind !== "exact_zero" || policy.threshold === 0,
  );
const measurement = z
  .union([finite, z.strictObject({ actual: finite, reference: finite })])
  .nullable();
const observation = source.extend({
  values: z
    .record(id, measurement)
    .refine((values) => Object.keys(values).length <= 16),
});
const inputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  seed: z.number().int().min(0).max(0xffff_ffff),
  requiredSegments: z.array(id).min(1).max(32),
  policies: z.array(evaluationMetricPolicySchema).min(1).max(16),
  expectedDocuments: z.array(source).min(1).max(4096),
  observations: z.array(observation).max(4096),
});
export type EvaluationMetricPolicy = z.infer<
  typeof evaluationMetricPolicySchema
>;
export type EvaluationMetricObservation = z.infer<typeof observation>;
export type EvaluationStatisticsInput = z.infer<typeof inputSchema>;
export type StatisticsCell = {
  metricId: string;
  segmentId: string | null;
  documents: number;
  clusters: number;
  missingMeasurements: number;
  statistic: "document_mean" | "spearman_rank" | "observed_incident_sum";
  estimate: number | null;
  interval: [number, number] | null;
  intervalStatus:
    | "estimated"
    | "missing_segment"
    | "insufficient_clusters"
    | "undefined"
    | "degenerate"
    | "exact_observed"
    | "withheld";
  validReplicates: number;
  invalidReplicates: number;
  bootstrapHash: string | null;
  numericGatePassed: boolean;
};
export type EvaluationStatistics = {
  schemaVersion: 1;
  status: "assessed" | "rejected";
  reason:
    | "INVALID_INPUT"
    | "DOCUMENT_COVERAGE_MISMATCH"
    | "METRIC_COVERAGE_MISMATCH"
    | "INVALID_MEASUREMENT"
    | "COMPUTE_BUDGET_EXCEEDED"
    | null;
  inputHash: string | null;
  method: "seeded-whole-cluster-percentile-v1";
  resamples: 10000;
  confidence: 0.95;
  numericGatePassed: boolean;
  cells: StatisticsCell[];
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function ranks(values: readonly number[]) {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = Array<number>(values.length);
  for (let first = 0; first < order.length;) {
    let end = first + 1;
    while (end < order.length && order[end].value === order[first].value) end++;
    const rank = (first + 1 + end) / 2;
    for (let i = first; i < end; i++) result[order[i].index] = rank;
    first = end;
  }
  return result;
}

/** Average ranks for ties; a constant/undersized pair has no correlation. */
export function spearmanRankCorrelation(
  pairs: readonly { actual: number; reference: number }[],
): number | null {
  if (
    pairs.length < 2 ||
    pairs.some(
      (p) => !Number.isFinite(p.actual) || !Number.isFinite(p.reference),
    )
  )
    return null;
  const x = ranks(pairs.map((p) => p.actual));
  const y = ranks(pairs.map((p) => p.reference));
  const center = (pairs.length + 1) / 2;
  let xy = 0,
    xx = 0,
    yy = 0;
  for (let i = 0; i < pairs.length; i++) {
    const a = x[i] - center;
    const b = y[i] - center;
    xy += a * b;
    xx += a * a;
    yy += b * b;
  }
  return xx === 0 || yy === 0
    ? null
    : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function percentile(sorted: readonly number[], probability: number) {
  const position = (sorted.length - 1) * probability;
  const low = Math.floor(position);
  return (
    sorted[low] +
    (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) *
      (position - low)
  );
}

function summarize(
  rows: EvaluationMetricObservation[],
  policy: EvaluationMetricPolicy,
  segmentId: string | null,
  seed: number,
): StatisticsCell {
  const clusters = new Map<string, EvaluationMetricObservation[]>();
  for (const row of rows) {
    const group = clusters.get(row.clusterId);
    if (group) group.push(row);
    else clusters.set(row.clusterId, [row]);
  }
  const groups = [...clusters.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, values]) => values);
  const cell: StatisticsCell = {
    metricId: policy.id,
    segmentId,
    documents: rows.length,
    clusters: groups.length,
    missingMeasurements: rows.filter((row) => row.values[policy.id] === null)
      .length,
    statistic:
      policy.kind === "rank"
        ? "spearman_rank"
        : policy.kind === "exact_zero"
          ? "observed_incident_sum"
          : "document_mean",
    estimate: null,
    interval: null,
    intervalStatus: "missing_segment",
    validReplicates: 0,
    invalidReplicates: 0,
    bootstrapHash: null,
    numericGatePassed: false,
  };
  if (rows.length === 0) return cell;
  if (cell.missingMeasurements > 0) {
    cell.intervalStatus = "withheld";
    return cell;
  }
  const estimate = (sample: EvaluationMetricObservation[]) =>
    policy.kind === "rank"
      ? spearmanRankCorrelation(
          sample.map(
            (row) =>
              row.values[policy.id] as { actual: number; reference: number },
          ),
        )
      : sample.reduce(
          (sum, row) => sum + (row.values[policy.id] as number),
          0,
        ) / (policy.kind === "exact_zero" ? 1 : sample.length);
  cell.estimate = estimate(rows);
  if (policy.kind === "exact_zero") {
    cell.intervalStatus = "exact_observed";
    cell.numericGatePassed = rows.every((row) => row.values[policy.id] === 0);
    return cell; // No population-error or confidence-bound claim follows from zero observed incidents.
  }
  if (groups.length < policy.minimumClusters) {
    cell.intervalStatus = "insufficient_clusters";
    return cell;
  }
  if (cell.estimate === null) {
    cell.intervalStatus = "undefined";
    return cell;
  }
  // All metrics in this slice use the same draw plan. Aggregate groups retain ALL segments together.
  const sliceSeed = Number.parseInt(digest([seed, segmentId]).slice(0, 8), 16);
  const rng = random(sliceSeed);
  const values: number[] = [];
  const trace = createHash("sha256");
  for (let iteration = 0; iteration < 10000; iteration++) {
    const sample: EvaluationMetricObservation[] = [];
    for (let draw = 0; draw < groups.length; draw++)
      sample.push(...groups[Math.floor(rng() * groups.length)]);
    const value = estimate(sample);
    trace.update(value === null ? "undefined;" : `${value};`);
    if (value === null || !Number.isFinite(value)) cell.invalidReplicates++;
    else values.push(value);
  }
  cell.validReplicates = values.length;
  cell.bootstrapHash = trace.digest("hex");
  if (cell.invalidReplicates > 0) {
    cell.intervalStatus = "undefined";
    return cell;
  }
  values.sort((a, b) => a - b);
  cell.interval = [percentile(values, 0.025), percentile(values, 0.975)];
  const spread = values[values.length - 1] - values[0];
  if (
    spread <=
    Number.EPSILON *
      Math.max(1, Math.abs(values[0]), Math.abs(values[values.length - 1])) *
      8
  ) {
    cell.intervalStatus = "degenerate";
    return cell;
  }
  cell.intervalStatus = "estimated";
  cell.numericGatePassed =
    policy.kind === "error" || policy.kind === "mean_upper"
      ? cell.interval[1] <= policy.threshold
      : cell.interval[0] >= policy.threshold;
  return cell;
}

/** Numeric diagnostics only. Representative validity still needs trusted provenance and sample justification. */
export function evaluateStatistics(input: unknown): EvaluationStatistics {
  const report: EvaluationStatistics = {
    schemaVersion: 1,
    status: "rejected",
    reason: null,
    inputHash: null,
    method: "seeded-whole-cluster-percentile-v1",
    resamples: 10000,
    confidence: 0.95,
    numericGatePassed: false,
    cells: [],
  };
  const deny = (reason: EvaluationStatistics["reason"]) => ({
    ...report,
    reason,
  });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return deny("INVALID_INPUT");
  const data = parsed.data;
  if (
    new Set(data.requiredSegments).size !== data.requiredSegments.length ||
    new Set(data.policies.map((p) => p.id)).size !== data.policies.length ||
    new Set(data.expectedDocuments.map((d) => d.documentHash)).size !==
      data.expectedDocuments.length
  )
    return deny("INVALID_INPUT");
  const expected = new Map(
    data.expectedDocuments.map((d) => [d.documentHash, d]),
  );
  const observed = new Set<string>();
  const policyIds = data.policies.map((p) => p.id).sort(compare);
  for (const row of data.observations) {
    const source = expected.get(row.documentHash);
    if (
      !source ||
      observed.has(row.documentHash) ||
      source.clusterId !== row.clusterId ||
      source.segmentId !== row.segmentId ||
      !data.requiredSegments.includes(row.segmentId)
    )
      return deny("DOCUMENT_COVERAGE_MISMATCH");
    observed.add(row.documentHash);
    if (
      JSON.stringify(Object.keys(row.values).sort(compare)) !==
      JSON.stringify(policyIds)
    )
      return deny("METRIC_COVERAGE_MISMATCH");
    for (const policy of data.policies) {
      const value = row.values[policy.id];
      if (value === null) continue;
      if (
        policy.kind === "rank"
          ? typeof value !== "object"
          : typeof value !== "number" ||
            ((policy.kind === "success" || policy.kind === "error") &&
              (value < 0 || value > 1)) ||
            (policy.kind === "exact_zero" && value < 0)
      )
        return deny("INVALID_MEASUREMENT");
    }
  }
  if (observed.size !== expected.size)
    return deny("DOCUMENT_COVERAGE_MISMATCH");
  // Bound synchronous work across all 10,000 draws. Larger runs need a separately reviewed execution budget.
  const workUnits =
    data.expectedDocuments.length *
    data.policies.reduce(
      (sum, policy) =>
        sum +
        (policy.kind === "exact_zero"
          ? 0
          : policy.kind === "rank"
            ? Math.max(1, Math.log2(data.expectedDocuments.length))
            : 1),
      0,
    );
  if (workUnits > 8192) return deny("COMPUTE_BUDGET_EXCEEDED");
  const rows = [...data.observations].sort((a, b) =>
    compare(a.documentHash, b.documentHash),
  );
  const policies = [...data.policies].sort((a, b) => compare(a.id, b.id));
  const segments = [...data.requiredSegments].sort(compare);
  report.inputHash = digest({
    schemaVersion: 1,
    seed: data.seed,
    requiredSegments: segments,
    policies,
    expectedDocuments: [...data.expectedDocuments].sort((a, b) =>
      compare(a.documentHash, b.documentHash),
    ),
    observations: rows.map((row) => ({
      ...row,
      values: Object.fromEntries(policyIds.map((id) => [id, row.values[id]])),
    })),
  });
  report.status = "assessed";
  for (const policy of policies) {
    report.cells.push(summarize(rows, policy, null, data.seed));
    for (const segment of segments)
      report.cells.push(
        summarize(
          rows.filter((row) => row.segmentId === segment),
          policy,
          segment,
          data.seed,
        ),
      );
  }
  report.numericGatePassed = report.cells.every(
    (cell) => cell.numericGatePassed,
  );
  return report;
}
