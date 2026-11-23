# Observability and SLOs

Status: **IMPLEMENTED LOCALLY, DASHBOARD/SINK CONFIGURATION REQUIRED**
Owner: workspace owner until delegated

The checked-in Prometheus Operator rule set is `docs/operations/ALERTS.json`.
It covers availability/error budget, API latency, terminal jobs, queue age,
provider spend, and readiness. The deployment must route these rules to the
approved Alertmanager receiver; receiver credentials are never committed.

## Signals

The server emits one JSON record per HTTP response with a bounded route label,
status class, duration, and correlation request ID. It never records query
strings, request bodies, resume text, email, cookies, authorization headers,
tokens, or stack traces.

The protected `/metrics` endpoint exposes aggregate Prometheus-compatible
counters. It requires `METRICS_TOKEN` and returns 404 when disabled. The browser
reports only allowlisted error codes and Web Vitals to `/api/telemetry`; it does
not send error messages or exception objects.

Key metrics:

- `http_requests_total{method,route,status}` and
  `http_request_duration_ms_{count,sum}`
- `analysis_jobs_total{event,stage}` and `analysis_job_duration_ms_{count,sum}`
- `analysis_queue_age_ms_{bucket,count,sum}`
- `provider_input_tokens_total`, `provider_output_tokens_total`, and
  `provider_cost_usd_total{provider,model}`
- `client_errors_total{path,code}` and `web_vital_value_{count,sum}{name}`

## SLO proposal

| Signal                         |             Objective | Alert window | Action                                                                |
| ------------------------------ | --------------------: | -----------: | --------------------------------------------------------------------- |
| Authenticated web availability |         99.9% monthly |    5 minutes | Check readiness, error logs, then rollback if release-correlated      |
| Non-analysis API p95           |               <500 ms |   15 minutes | Inspect DB pool, storage, and provider calls; shed expensive work     |
| Job terminal state             |                 >=99% |   30 minutes | Inspect queue lease age, dead letters, and worker health              |
| Queue age                      |            <5 minutes |   10 minutes | Scale worker within approved concurrency; inspect provider throttling |
| Cost anomaly                   | 2x seven-day baseline |   15 minutes | Disable qualitative AI, preserve deterministic path, investigate keys |
| Readiness failures             |         3 consecutive |    5 minutes | Verify Supabase/network/config and rollback only if deployment-caused |

## Dashboard queries

The deployment dashboard should graph the metric names above grouped only by
the documented low-cardinality labels. The duration/value metrics expose
Prometheus buckets, so p95 can be calculated without exporting raw samples:

```promql
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket[15m])))
```

Prometheus histogram buckets, counts and sums accumulate until the process
restarts. The in-process percentile snapshot still uses the latest 2,000
observations per series. Queue age has its own millisecond buckets through 30
minutes, including boundaries at five and ten minutes. A series appears after
its first sample.

Logs should be queried by `requestId`, `analysisId`, or `runId`, never by resume
text or email. A synthetic request must be traceable through HTTP, queue,
stage, and provider usage counters while remaining content-free.

## Alert delivery and ownership

Alert configuration belongs in the deployment provider and must point to the
approved notification sink. A4 requires a notification delivery test and a
tabletop exercise for provider outage and stalled queue; local code cannot
prove either external action.
