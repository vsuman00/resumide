import { describe, expect, it, vi } from "vitest";
import {
  MetricsRegistry,
  logEvent,
  normalizeMetricPath,
  metrics,
  recordJobEvent,
  redactLogFields,
} from "../../app/lib/server/observability";
import { beforeEach } from "vitest";

beforeEach(() => metrics.reset());

describe("observability", () => {
  it("redacts secrets and PII without logging resume content", () => {
    expect(
      redactLogFields({
        requestId: "request-1",
        token: "secret-token",
        email: "candidate@example.test",
        resumeText: "confidential resume body",
        nested: { authorization: "Bearer token" },
      }),
    ).toEqual({
      requestId: "request-1",
      token: "[REDACTED]",
      email: "[REDACTED]",
      resumeText: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
    });
  });

  it("normalizes resource ids before they become metric labels", () => {
    expect(
      normalizeMetricPath("/api/analysis/123e4567-e89b-12d3-a456-426614174000"),
    ).toBe("/api/analysis/:id");
    expect(normalizeMetricPath("/resume/42?email=secret@example.test")).toBe(
      "/resume/:id",
    );
    expect(normalizeMetricPath("/resume/candidate@example.test")).toBe(
      "/resume/:id",
    );
  });

  it("records bounded counters and latency histogram summaries", () => {
    const metrics = new MetricsRegistry();
    metrics.increment("http_requests_total", { route: "/upload", status: 200 });
    metrics.increment("http_requests_total", { route: "/upload", status: 200 });
    metrics.observe("http_request_duration_ms", { route: "/upload" }, 15);
    metrics.observe("http_request_duration_ms", { route: "/upload" }, 35);

    const snapshot = metrics.snapshot();
    expect(
      snapshot.counters["http_requests_total|route=/upload,status=200"],
    ).toBe(2);
    expect(
      snapshot.histograms["http_request_duration_ms|route=/upload"],
    ).toEqual(expect.objectContaining({ count: 2, sum: 50, max: 35, p50: 35 }));
    expect(metrics.toPrometheus()).toContain(
      'http_requests_total{route="/upload",status="200"} 2',
    );
    expect(metrics.toPrometheus()).toContain(
      'http_request_duration_ms_bucket{route="/upload",le="50"} 2',
    );
    expect(metrics.toPrometheus()).toContain(
      'http_request_duration_ms_bucket{route="/upload",le="+Inf"} 2',
    );
  });

  it("retains cumulative Prometheus counts after the summary window fills", () => {
    const registry = new MetricsRegistry();
    registry.observe("http_request_duration_ms", {}, 25);
    for (let sample = 0; sample < 2_000; sample += 1) {
      registry.observe("http_request_duration_ms", {}, 100);
    }

    expect(
      registry.snapshot().histograms["http_request_duration_ms|"],
    ).toMatchObject({ count: 2_000, sum: 200_000 });
    expect(registry.toPrometheus()).toContain(
      'http_request_duration_ms_bucket{le="50"} 1\n',
    );
    expect(registry.toPrometheus()).toContain(
      'http_request_duration_ms_bucket{le="+Inf"} 2001\n',
    );
    expect(registry.toPrometheus()).toContain(
      "http_request_duration_ms_count 2001\n",
    );
    expect(registry.toPrometheus()).toContain(
      "http_request_duration_ms_sum 200025\n",
    );
    registry.reset();
    expect(registry.toPrometheus()).not.toContain("http_request_duration_ms");
  });

  it("keeps structured log fields serializable and safe", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logEvent("info", "test.event", {
      requestId: "request-1",
      apiKey: "private-key",
      message: "resume body",
    });
    expect(String(write.mock.calls[0]?.[0])).toContain('"apiKey":"[REDACTED]"');
    expect(String(write.mock.calls[0]?.[0])).toContain(
      '"message":"[REDACTED]"',
    );
    write.mockRestore();
  });

  it("records queue age without adding job identifiers to labels", () => {
    recordJobEvent({ event: "claimed", queueAgeMs: 250 });
    expect(metrics.snapshot().histograms["analysis_queue_age_ms|"]).toEqual(
      expect.objectContaining({ count: 1, p50: 250 }),
    );
  });

  it("exports queue-age buckets on both sides of the five-minute alert", () => {
    recordJobEvent({ event: "claimed", queueAgeMs: 240_000 });
    recordJobEvent({ event: "claimed", queueAgeMs: 540_000 });

    const exposition = metrics.toPrometheus();
    expect(exposition).toContain(
      'analysis_queue_age_ms_bucket{le="300000"} 1\n',
    );
    expect(exposition).toContain(
      'analysis_queue_age_ms_bucket{le="600000"} 2\n',
    );
    expect(exposition).toContain('analysis_queue_age_ms_bucket{le="+Inf"} 2\n');
  });
});
