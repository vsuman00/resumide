import { z } from "zod";

type MetricLabelValue = string | number | boolean;
type MetricLabels = Record<string, MetricLabelValue>;

type HistogramSummary = {
  count: number;
  sum: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
};
type HistogramSeries = {
  samples: number[];
  count: number;
  sum: number;
  buckets: { upper: number; count: number }[];
};

export type MetricsSnapshot = {
  counters: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
};

const MAX_SAMPLES_PER_HISTOGRAM = 2_000;
const PROMETHEUS_HISTOGRAM_BUCKETS = [50, 100, 250, 500, 1_000, 5_000, 10_000];
const QUEUE_AGE_BUCKETS_MS = [
  1_000, 5_000, 10_000, 30_000, 60_000, 120_000, 180_000, 300_000, 600_000,
  900_000, 1_800_000,
];
const SENSITIVE_FIELD =
  /password|secret|token|authorization|cookie|api[-_]?key|email|resume|prompt|content|description|message|raw|body|stack/i;

function cleanLabelValue(value: MetricLabelValue): string {
  return String(value)
    .replaceAll(/[^a-zA-Z0-9_.:/-]/g, "_")
    .slice(0, 80);
}

function labelKey(labels: MetricLabels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${cleanLabelValue(value)}`)
    .join(",");
}

function metricKey(name: string, labels: MetricLabels): string {
  return `${name}|${labelKey(labels)}`;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * quantile),
  );
  return sorted[index] ?? 0;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramSeries>();

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    if (!Number.isFinite(value) || value < 0) return;
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observe(name: string, labels: MetricLabels = {}, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    const key = metricKey(name, labels);
    let series = this.histograms.get(key);
    if (!series) {
      const boundaries =
        name === "analysis_queue_age_ms"
          ? QUEUE_AGE_BUCKETS_MS
          : PROMETHEUS_HISTOGRAM_BUCKETS;
      series = {
        samples: [],
        count: 0,
        sum: 0,
        buckets: boundaries.map((upper) => ({ upper, count: 0 })),
      };
      this.histograms.set(key, series);
    }
    // Keep snapshot percentiles bounded while exported counters remain cumulative.
    if (series.samples.length >= MAX_SAMPLES_PER_HISTOGRAM) {
      series.samples.shift();
    }
    series.samples.push(value);
    series.count += 1;
    series.sum += value;
    for (const bucket of series.buckets) {
      if (value <= bucket.upper) bucket.count += 1;
    }
  }

  snapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramSummary> = {};
    for (const [key, { samples: values }] of this.histograms) {
      histograms[key] = {
        count: values.length,
        sum: values.reduce((sum, value) => sum + value, 0),
        max: Math.max(...values, 0),
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
      };
    }
    return { counters: Object.fromEntries(this.counters), histograms };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const [key, value] of this.counters) {
      const [name, rawLabels = ""] = key.split("|");
      lines.push(`${name}${formatPrometheusLabels(rawLabels)} ${value}`);
    }
    for (const [key, series] of this.histograms) {
      const [name, rawLabels = ""] = key.split("|");
      const labels = formatPrometheusLabels(rawLabels);
      for (const bucket of series.buckets) {
        const bucketLabels = rawLabels
          ? `${rawLabels},le=${bucket.upper}`
          : `le=${bucket.upper}`;
        lines.push(
          `${name}_bucket${formatPrometheusLabels(bucketLabels)} ${bucket.count}`,
        );
      }
      const infinityLabels = rawLabels ? `${rawLabels},le=+Inf` : "le=+Inf";
      lines.push(
        `${name}_bucket${formatPrometheusLabels(infinityLabels)} ${series.count}`,
      );
      lines.push(`${name}_count${labels} ${series.count}`);
      lines.push(`${name}_sum${labels} ${series.sum}`);
    }
    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

function formatPrometheusLabels(rawLabels: string): string {
  if (!rawLabels) return "";
  const labels = rawLabels.split(",").map((entry) => {
    const separator = entry.indexOf("=");
    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1).replaceAll('"', "'");
    return `${key}="${value}"`;
  });
  return `{${labels.join(",")}}`;
}

export const metrics = new MetricsRegistry();

export function normalizeMetricPath(path: string): string {
  const pathname = path.split("?", 1)[0] ?? "/";
  return pathname
    .split("/")
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(segment) ||
      /^\d+$/.test(segment) ||
      (segment !== "" && !/^[a-zA-Z0-9_-]{1,32}$/.test(segment))
        ? ":id"
        : segment,
    )
    .join("/")
    .replaceAll("//", "/");
}

export function redactLogFields(value: unknown, fieldName?: string): unknown {
  if (fieldName && SENSITIVE_FIELD.test(fieldName)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactLogFields(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactLogFields(item, key),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 120)}…`;
  }
  return value;
}

export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const redactedFields = redactLogFields(fields);
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redactedFields && typeof redactedFields === "object"
      ? redactedFields
      : {}),
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export function recordHttpRequest(args: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
}): void {
  const route = normalizeMetricPath(args.path);
  const statusClass = `${Math.floor(args.status / 100)}xx`;
  metrics.increment("http_requests_total", {
    method: args.method,
    route,
    status: statusClass,
  });
  metrics.observe(
    "http_request_duration_ms",
    { method: args.method, route },
    args.durationMs,
  );
  logEvent(args.status >= 500 ? "error" : "info", "http.request", {
    requestId: args.requestId,
    method: args.method,
    route,
    status: args.status,
    durationMs: Math.round(args.durationMs * 100) / 100,
  });
}

export function recordJobEvent(args: {
  event: "claimed" | "completed" | "failed" | "lease_lost";
  stage?: string;
  durationMs?: number;
  queueAgeMs?: number;
}): void {
  metrics.increment("analysis_jobs_total", {
    event: args.event,
    stage: args.stage ?? "unknown",
  });
  if (args.durationMs !== undefined) {
    metrics.observe(
      "analysis_job_duration_ms",
      { stage: args.stage ?? "unknown" },
      args.durationMs,
    );
  }
  if (args.queueAgeMs !== undefined) {
    metrics.observe("analysis_queue_age_ms", {}, args.queueAgeMs);
  }
}

export function recordProviderUsage(args: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostPer1kUsd: number;
  outputCostPer1kUsd: number;
}): void {
  const labels = { provider: args.provider, model: args.model };
  metrics.increment("provider_input_tokens_total", labels, args.inputTokens);
  metrics.increment("provider_output_tokens_total", labels, args.outputTokens);
  metrics.increment(
    "provider_cost_usd_total",
    labels,
    (args.inputTokens / 1_000) * args.inputCostPer1kUsd +
      (args.outputTokens / 1_000) * args.outputCostPer1kUsd,
  );
}

const ClientTelemetrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("client_error"),
      code: z.enum(["window_error", "unhandled_rejection"]),
      path: z
        .string()
        .regex(/^\/[\x20-\x7e]*$/)
        .max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("web_vital"),
      name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
      value: z.number().finite().min(0).max(600_000),
      path: z
        .string()
        .regex(/^\/[\x20-\x7e]*$/)
        .max(200),
    })
    .strict(),
]);

export type ClientTelemetry = z.infer<typeof ClientTelemetrySchema>;

export function parseClientTelemetry(value: unknown): ClientTelemetry | null {
  const parsed = ClientTelemetrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function recordClientTelemetry(event: ClientTelemetry): void {
  const labels = { path: normalizeMetricPath(event.path) };
  if (event.type === "client_error") {
    metrics.increment("client_errors_total", { ...labels, code: event.code });
    return;
  }
  metrics.increment("web_vitals_total", { ...labels, name: event.name });
  metrics.observe("web_vital_value", { name: event.name }, event.value);
}
