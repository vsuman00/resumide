import { z } from "zod";
const pairs = z
  .array(
    z.strictObject({
      caseId: z.string().min(1).max(100),
      segment: z.string().min(1).max(100),
      predicted: z.number().min(0).max(100).nullable(),
      reference: z.number().min(0).max(100),
    }),
  )
  .max(10000)
  .refine(
    (rows) => new Set(rows.map((r) => r.caseId)).size === rows.length,
    "Repeated cases cannot multiply agreement",
  );
type Row = z.infer<typeof pairs>[number];
function ranks(values: number[]) {
  const sorted = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value),
    result: number[] = [];
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end].value === sorted[i].value) end++;
    const rank = (i + 1 + end) / 2;
    for (let j = i; j < end; j++) result[sorted[j].index] = rank;
    i = end;
  }
  return result;
}
function spearman(rows: Row[]) {
  if (rows.length < 2) return null;
  const x = ranks(rows.map((r) => r.predicted!)),
    y = ranks(rows.map((r) => r.reference));
  const mean = (rows.length + 1) / 2;
  let covariance = 0,
    varianceX = 0,
    varianceY = 0;
  for (let i = 0; i < rows.length; i++) {
    covariance += (x[i] - mean) * (y[i] - mean);
    varianceX += (x[i] - mean) ** 2;
    varianceY += (y[i] - mean) ** 2;
  }
  return varianceX && varianceY
    ? covariance / Math.sqrt(varianceX * varianceY)
    : null;
}
function summary(rows: Row[]) {
  const evaluated = rows.filter((r) => r.predicted !== null);
  const errors = evaluated.map((r) => Math.abs(r.predicted! - r.reference));
  return {
    caseCount: rows.length,
    evaluatedCount: evaluated.length,
    coverage: rows.length ? evaluated.length / rows.length : null,
    meanAbsoluteError: errors.length
      ? errors.reduce((a, b) => a + b, 0) / errors.length
      : null,
    rootMeanSquareError: errors.length
      ? Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length)
      : null,
    spearman: spearman(evaluated),
  };
}
/** Offline measurement only. Caller-supplied reference ratings do not establish
 * reviewed corpus, calibration, policy adoption or any release authorization. */
export function measureScoreAgreement(raw: unknown, rawOptions: unknown = {}) {
  const rows = pairs.parse(raw),
    options = z
      .strictObject({
        resamples: z.number().int().min(50).max(2000).default(200),
        seed: z.number().int().min(1).max(2147483647).default(20261012),
      })
      .parse(rawOptions);
  const eligible = rows.filter((r) => r.predicted !== null),
    correlations: number[] = [];
  let seed = options.seed;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  if (eligible.length > 1)
    for (let i = 0; i < options.resamples; i++) {
      const sample = eligible.map(
        () => eligible[Math.floor(random() * eligible.length)],
      );
      const value = spearman(sample);
      if (value !== null) correlations.push(value);
    }
  correlations.sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (!correlations.length) return null;
    const position = p * (correlations.length - 1),
      low = Math.floor(position),
      high = Math.ceil(position);
    return (
      correlations[low] +
      (correlations[high] - correlations[low]) * (position - low)
    );
  };
  const segments = [...new Set(rows.map((r) => r.segment))]
    .sort()
    .map((segment) => ({
      segment,
      ...summary(rows.filter((r) => r.segment === segment)),
    }));
  return {
    ...summary(rows),
    segments,
    bootstrap: {
      seed: options.seed,
      requestedResamples: options.resamples,
      definedResamples: correlations.length,
      spearman95PercentileInterval: correlations.length
        ? [percentile(0.025), percentile(0.975)]
        : null,
    },
    measurementOnly: true,
    releasePassed: false,
  };
}
