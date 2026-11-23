# Resumide Phase 7 threat model

Status: **IMPLEMENTED LOCALLY, SECURITY OWNER REVIEW REQUIRED FOR A4**
Review date: 2026-09-11
Owner: workspace owner until delegated

This model covers the candidate B2C product only. Resumide provides resume
compatibility guidance and must not make hiring or rejection decisions.

The Phase 7 inventory and evidence statements below retain their original
2026-09-11 review scope. They are not fresh certification of the current hosted
project. The 2026-11-10 source additions follow that inventory; all release and
actual tenant/privacy acceptance remains open.

## Assets and trust boundaries

| Boundary                         | Assets at risk                                   | STRIDE focus                                        | Primary controls                                                                                                                          | Abuse test                                                                      | Owner      | Residual risk and review                                                                  |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Browser -> web                   | Session cookies, request integrity, user actions | Spoofing, tampering, CSRF, disclosure               | HTTP-only SameSite cookies, bounded lifetime, same-origin checks, CSP report-only, frame/MIME/referrer/permissions headers                | `tests/unit/security.test.ts`, `e2e/phase7.spec.ts`                             | Security   | CSP enforcement requires report review; 2026-10-11                                        |
| Browser -> auth                  | Email identity and callback destination          | Spoofing, elevation, open redirect                  | Provider-managed OTP, safe relative return paths, origin check, generic errors                                                            | `tests/unit/auth.test.ts`, `e2e/smoke.spec.ts`                                  | Identity   | Provider abuse controls and mailbox security; 2026-10-11                                  |
| Browser -> upload                | PDF bytes, job text, AI consent, request cost    | Tampering, DoS, injection                           | MIME/signature/size/page/text bounds, consent gate, rate limit, idempotency, generic errors                                               | `tests/unit/upload-validation.test.ts`, `tests/integration/api-analyze.test.ts` | Platform   | Malware scanning and sandbox policy depend on deployment; 2026-10-11                      |
| Web/worker -> storage            | Private resume PDFs and object keys              | Disclosure, tampering, deletion abuse               | Server-generated organization keys, private bucket, short signed URLs, owner-scoped keys, deletion/retention workers                      | `tests/unit/storage.test.ts`, privacy operation tests                           | Platform   | Hosted bucket policy and key rotation need live review; 2026-10-11                        |
| Web/worker -> database           | PII, results, memberships, audit records         | Injection, disclosure, repudiation, elevation       | Parameterized Supabase client, RLS, service-only RPCs, ownership checks, audit events                                                     | authorization/privacy unit tests, migration review, hosted tenant/RLS smoke     | Data       | Hosted schema/RLS/storage smoke passed; restore drill and owner review remain; 2026-10-11 |
| Queue -> worker                  | Leases, retries, provider spend                  | Tampering, DoS, repudiation                         | PostgreSQL lease/CAS, bounded attempts, dead-letter state, request/run IDs, no raw payload logs                                           | `tests/unit/worker-runner.test.ts`, recovery tests                              | Operations | Multi-process capacity and kill drill pending; 2026-10-11                                 |
| Worker -> PDF/OCR                | Untrusted parser input                           | DoS, code execution                                 | Bounded bytes/pages/text/time, OCR disabled by default, isolated worker deployment requirement                                            | extraction and OCR adapter tests                                                | Platform   | Malware scanner/container sandbox still deployment-owned; 2026-10-11                      |
| Worker -> LLM provider           | Resume text, job description, model output, cost | Disclosure, prompt injection, unbounded consumption | Explicit AI consent, bounded tokens/time, schema validation, grounding, provider idempotency, usage/cost metrics, validated OpenAI egress | qualitative AI and writer-grounding tests                                       | AI/Privacy | OpenAI DPA/region and live outage tests pending; 2026-10-11                               |
| Identity/billing webhooks -> web | Future external callbacks                        | Spoofing, tampering, replay                         | No billing/integration webhook is enabled in Phase 7; future work requires signature, timestamp, replay and tenant checks                 | A8/A9 deferred tests                                                            | Identity   | Billing begins only after A4 and commercial approval; 2026-10-11                          |
| Admin/integrations -> data       | Tenant policy and future exports                 | Elevation, repudiation, disclosure                  | Enterprise administration deferred, no admin surface or external integration enabled                                                      | A5 deferred tests                                                               | Product    | Requires independent tenant review and legal approval; 2026-10-11                         |

## Release-blocking rules

- Any untreated critical/high finding blocks A4.
- Raw resume text, job descriptions, tokens, cookies, authorization headers, and
  email addresses are prohibited in logs and metrics.
- A storage or database deletion failure is retried from durable state; it never
  falls back to a broader path or silently reports success.
- A provider or queue outage produces a partial/failed terminal state and an
  operator signal, not an unbounded retry loop.
- CSP remains report-only until staging reports are reviewed and a human owner
  approves enforcement.

## Evidence status

Local unit, browser, type, lint, build, synthetic load, synthetic restore,
alert-policy, egress-policy, and container-hardening checks are implemented.
Hosted schema/RLS/storage/auth smoke verification passes, but malware scanning,
real database restore, monitored staging E2E, alert notification delivery,
rollback rehearsal, live provider verification, deployment-owned parser/egress
controls, and security-owner sign-off remain external A4 evidence and are
intentionally not marked complete here.

## Local source additions, 2026-11-10

The shared technical AI ledger adds private policy, period-opening, pool,
operation, attempt, event and reconciliation-operator records. The admission
ledger adds durable owner-bound operations and exact upload intents before
Storage I/O. These stores hold linkable UUIDs, object paths, hashes, versions,
timestamps and accounting metadata even though they do not hold raw prompts or
resume text. Treat them as personal/operational assets. See the exact inventory
and lifecycle gaps in the [privacy data map](PRIVACY_DATA_MAP.md).

Default-off caller branches bind verified ownership, request identity and exact
payload/model/policy before dispatch or upload adoption. Known AI usage settles
before result persistence, including invalid output; unknown usage retains a
reservation. The lease path uses an opaque per-claim token plus worker/attempt
binding for queue mutations and the fixed stage-write wrapper. Cancellation and
lost ownership must not authorize later writes or compensation. An already
committed valid result is not rolled back by a later cancellation signal.

The main residual threats are duplicate admission, stale-worker writes,
uncertain provider charges, unsafe compensation, operational-token disclosure
and retained metadata outside the existing privacy graph. The source controls
include strict DTOs, first-claim dispatch, exact unadopted-object cleanup,
bounded shutdown waits and fail-closed ownership checks. RPC/provider doubles
and source review are their present evidence tier. The budget/admission/lease
migrations have not been parsed, applied or executed, and no flags, policies or
period openings were activated. Hosted grants, transaction races, old-producer
cutover and terminal-job recovery still require their allocated acceptance.

A successfully withdrawn queued deletion is inactive, like a failed request.
Queued, processing, completed and unknown deletion states still block current
access; lookup failures block access too. The privacy page uses a separate
owner-scoped access query rather than inferring complete history from its
twenty displayed rows, while the download API rechecks before serialization.
The forward enqueue/write barrier is a separate SQL protocol; neither local
tests nor a second access read prove atomic response revocation after enqueue.

Append-only accounting and restrictive ledger foreign keys are not an approved
retention policy. The source resume-retention default of 30 days does not purge
these stores or authorize indefinite retention. Export/omission, deletion,
Auth/session disposition, backups, restore and exact orphan cleanup need
reviewed policies and actual tests before activation. No new provider, billing
surface or release approval follows from these source additions.
