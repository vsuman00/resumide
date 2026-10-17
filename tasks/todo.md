# Resumide Enterprise Implementation Tasks

Status: **PARTIAL; CANDIDATE B2C BASELINE IMPLEMENTED; AA0 APPROVED 2026-10-04; AA1 ENGINEERING CLOSED / OWNER ACCEPTED; LOCKED FIELD GATE FAILED; INDEPENDENT VALIDATION DEFERRED; AA2 ENGINEERING CLOSED / VERIFIED LOCALLY; FORMAL GATE OPEN; A0/A4 OPEN**
Plan: [`plan.md`](plan.md)
AA3 status: **LOCAL IMPLEMENTATION DELIVERED; DOMAIN/DATA ACCEPTANCE OPEN**
Accuracy-v2 subplan: [`accuracy-authoring-plan.md`](accuracy-authoring-plan.md)
Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

## Task rules

- Work in numeric dependency order unless a task explicitly says it can run in parallel.
- One task equals one focused, reviewable change. Split it if it exceeds five likely files.
- Check a task only after all acceptance and verification items pass.
- A checkbox proves only the named evidence tier. Live-provider, browser, staging, restore, and production checks remain separate.
- Update this file in the same change that completes a task.
- Preserve unrelated dirty work. Do not stage, commit, deploy, or push unless explicitly authorized.

## Localhost-first completion direction — 2026-10-12

The owner deferred cloud worker deployment until the project is functionally
complete and feature-tested on localhost. Continue the approved implementation
sequence, test each slice locally, then perform final deployment and launch
verification. Oracle Always Free is a discussed option, not a provisioned service
or a completed provider/region change. Keep existing hosted incident evidence
historical; new AA2 work and migrations remain local. Release accuracy and
other acceptance obligations remain visible during engineering.

## Gate A0 decision record - 2026-09-09

- Approved by the workspace owner: candidate B2C-first product; Node.js 22 LTS; Fly.io web/worker process groups in Mumbai; Supabase PostgreSQL 17, Auth, and private Storage in `ap-south-1`; modular monolith with PostgreSQL-backed jobs.
- Approved operating baseline: 30-day active resume retention, immediate removal of active access after deletion, provider-window backup expiry, 100 analyses/day, five concurrent analyses, 99.5% monthly availability, 24-hour RPO, and 4-hour RTO.
- OCR is disabled behind an adapter. The workspace owner holds product, privacy/security, scoring, cost, operations, and release ownership until delegated.
- Deferred: enterprise administration, enterprise roles, and employer workflows. Do not create an admin surface in the active build.
- Still unresolved: maximum job duration/retry/dead-letter policy, scoring weights/skipped-rule/claim-language approval, and the B2C payment/entitlement model.
- Accuracy-v2 AA0 design is approved on 2026-10-04 through ADR-0009, including first segment, logical contracts, synthetic corpus governance, local-only OCR protocol and export scope. Numeric calibration, runtime conformity and artifact release acceptance remain later gates; this does not close A0/A4.
- The hosted Resumide Supabase project is active; initial migration, RLS, private bucket, and advisory checks passed through Supabase MCP.

## Phase 0: Architecture approval and documentation control

### T000: Approve the capability map and product sequence

**Dependencies:** None
**Likely files:** `ARCHITECTURE.md`, `tasks/plan.md`, relevant ADRs
**Scope:** S

- [x] Human confirms B2C-first, career-center-first, or immediate enterprise-pilot sequence.
- [x] Human confirms prohibited automatic hiring decisions and required oversight.
- [x] Capability IDs, dependency direction, and gate owners are approved.
- **Verify:** Record approver, date, decisions, and unresolved items under Gate A0 without marking unapproved ADRs accepted.

### T001: Resolve platform provider decisions

**Dependencies:** T000
**Likely files:** `docs/decisions/0001-*`, `docs/decisions/0002-*`, `ARCHITECTURE.md`
**Scope:** S

- [x] Select supported Node runtime, deployment platform, managed PostgreSQL, identity, object storage, and required regions.
- [x] Record SSO path, retention assumptions, RPO/RTO target, and vendor exit boundaries.
- **Verify:** ADR alternatives, consequences, cost/risk owner, and acceptance evidence are complete; statuses change from Proposed only with human approval.

### T002: Make canonical documentation unambiguous

**Dependencies:** T000
**Likely files:** `README.md`, `CLAUDE.md`, `docs/README.md`, `docs/archive/PLAN.md`, `docs/archive/PLAN-REST.md`, `docs/archive/GAP-REPORT.md`
**Scope:** M

- [x] All stale files point to `ARCHITECTURE.md` and `tasks/` before historical content.
- [x] README labels current capabilities accurately and removes claims of auth, persistence, enterprise readiness, or completed deployment.
- [x] Commands and environment setup match the repository.
- **Verify:** `rg -n "Puter|shipped|enterprise|authentication|Docker-Ready" README.md CLAUDE.md docs/archive/PLAN*.md docs/archive/GAP-REPORT.md`; manually classify every remaining claim as current or historical.

## Phase 1: Production-operable MVP

### T010: Upgrade vulnerable React Router packages

**Dependencies:** T001
**Likely files:** `package.json`, `package-lock.json`
**Scope:** S

- [x] Upgrade all React Router packages together to the approved patched 7.x version.
- [x] Review migration notes and lockfile diff; do not mix unrelated dependency upgrades.
- **Verify:** `npm ci && npm audit --omit=dev --audit-level=high && npm run typecheck && npm run build`; smoke `/`, `/upload`, `/resume/missing`, and `/api/analyze` method handling.

### T011: Add typed runtime configuration and startup validation

**Dependencies:** T010
**Likely files:** `app/lib/server/config.ts`, `app/lib/server/analyze.ts`, `.env.example`, `package.json`
**Scope:** M

- [x] Parse required/optional environment values once with a schema and redacted errors.
- [x] Production startup/readiness fails when required secrets or invalid limits are missing.
- [x] Local production and container instructions inject environment explicitly.
- **Verify:** tests cover valid, missing, malformed, and secret-redaction cases; production server works with injected test config and fails safely without it.

### T012: Establish stable server error contracts and request IDs

**Dependencies:** T011
**Likely files:** `app/lib/server/errors.ts`, `app/lib/server/request-context.ts`, `app/root.tsx`, `app/routes/api.analyze.ts`
**Scope:** M

- [x] Public responses use stable codes, safe messages, request IDs, and retryability.
- [x] Provider/parser stacks remain in protected logs only.
- [x] GET on POST-only resources returns 405 plus `Allow: POST`.
- **Verify:** integration tests assert 400/401/403/404/405/413/422/429/500/503 bodies and confirm no key, prompt, stack, or raw PDF text leaks.

### T013: Add liveness, readiness, and graceful shutdown

**Dependencies:** T011
**Likely files:** `app/routes/healthz.ts`, `app/routes/readyz.ts`, `app/routes.ts`, server entry/config
**Scope:** M

- [x] `/healthz` checks process liveness without exposing dependencies.
- [x] `/readyz` performs bounded required-dependency checks and returns 503 when unavailable.
- [x] SIGTERM stops new work and allows bounded request completion.
- **Verify:** curl status/body tests, dependency-failure test, and local termination test.

### T014: Enforce server input and cost boundaries

**Dependencies:** T011, T012
**Likely files:** `app/routes/api.analyze.ts`, `app/lib/server/upload-validation.ts`, `app/lib/server/analyze.ts`, tests
**Scope:** M

- [x] Enforce request bytes before buffering, PDF signature/MIME, page count, extracted characters, JD/title lengths, AI token limit, provider timeout, and concurrency limit.
- [x] Empty/scanned/encrypted/malformed/oversized inputs produce explicit safe outcomes.
- [x] Limits come from validated config with safe ceilings.
- **Verify:** adversarial integration matrix proves rejection occurs before OpenAI and returns expected codes.

### T015: Put the analysis endpoint behind temporary access and shared rate limits

**Dependencies:** T011, T014
**Likely files:** auth middleware, rate-limit adapter, `app/routes/api.analyze.ts`, tests
**Scope:** M

- [x] Anonymous public cost burn is impossible; use an approved invite/session boundary until full identity exists.
- [x] Rate/concurrency counters work across multiple processes and return retry metadata.
- [x] Origin/CSRF policy is enforced for browser submissions.
- **Verify:** unauthenticated, cross-origin, limit-exceeded, window-reset, and two-instance tests; no provider call on rejection.

### T016: Repair upload form state and validation UX

**Dependencies:** T012, T014
**Likely files:** `app/routes/upload.tsx`, `app/components/FileUploader.tsx`, shared upload schema, component tests
**Scope:** M

- [x] One canonical size limit is displayed and enforced.
- [x] Empty/rejected/remove/error states are visible; remove is `type="button"`, clears dropzone and parent state, and never submits.
- [x] Company/job fields are either persisted in the request or removed by product decision.
- [x] Submit is busy/disabled, duplicate-safe, cancellable where possible, and handles non-JSON failures.
- **Verify:** component tests plus keyboard browser tests for every state; errors use field association and `aria-live`.

### T017: Repair current route semantics and visual defects

**Dependencies:** T012
**Likely files:** `app/routes/resume.tsx`, `app/root.tsx`, `app/app.css`, route metadata tests
**Scope:** M

- [x] Fix malformed background class, missing image alternatives, missing result `<h1>`, page titles, and branded error recovery.
- [x] Missing results no longer silently masquerade as valid content.
- [x] No focus outline is removed without a visible replacement.
- **Verify:** production-build browser screenshots at 390/768/1024/1366/1440; HTTP status assertions; zero console warnings/errors.

### T018: Harden the container and build context

**Dependencies:** T011, T013
**Likely files:** `Dockerfile`, `.dockerignore`, deployment README section
**Scope:** S

- [x] Exclude `.env*`, `.git`, editor/cache/test artifacts as appropriate.
- [x] Pin approved runtime/base policy, use frozen installs, minimal runtime files, non-root user, health check, and direct process execution.
- [x] Runtime secrets are injected, never copied into a layer.
- **Verify:** image build, image history/context review, container scan, non-root assertion, health/readiness test, SIGTERM test, and synthetic production E2E.

### Checkpoint A1: Reliable MVP

- [x] T010-T018 pass.
- [x] Production-like synthetic upload → analysis → result works.
- [x] Failure matrix is visible and safe.
- [x] Security audit has no unmitigated reachable critical/high findings.
- [x] Human approves Gate A1 before persistence expansion (workspace owner, 2026-09-09).

## Phase 2: Automated verification foundation

### T020: Add linting, formatting, and unified quality scripts

**Dependencies:** A1
**Likely files:** `package.json`, lint config, format config, ignore file
**Scope:** M

- [x] `lint`, `format:check`, and `verify` scripts exist without rewriting unrelated files.
- [x] Production console debugging statements are prohibited or allowlisted.
- **Verify:** scripts pass cleanly and fail on an intentional temporary violation that is then removed.

### T021: Add unit test infrastructure and migrate self-check assertions

**Dependencies:** T020
**Likely files:** `package.json`, test config, `tests/unit/*`, existing self-check scripts
**Scope:** M; split by domain if over five files

- [x] Parser, rules, schemas, score bands, configuration, and errors run under a maintained test runner.
- [x] Tests are deterministic and make no live network calls.
- **Verify:** `npm run test`; mutation/manual fault demonstrates tests catch a scoring/parser regression.

### T022: Add integration test infrastructure

**Dependencies:** T021
**Likely files:** integration config, test environment helper, `tests/integration/*`
**Scope:** M

- [x] Production request handlers run against isolated test dependencies.
- [x] OpenAI/storage/auth are contract fakes unless a test is explicitly tagged live.
- **Verify:** endpoint status/error matrix and cleanup-isolation tests pass locally and in CI.

### T023: Add production-build browser E2E and accessibility tests

**Dependencies:** T022
**Likely files:** Playwright config, `e2e/upload.spec.ts`, `e2e/routes.spec.ts`, axe helper
**Scope:** M

- [x] Home, upload, progress/result stub, refresh, errors, keyboard, and viewport cases are automated.
- [x] Screenshots/traces are retained on failure.
- **Verify:** `npm run test:e2e` and `npm run test:a11y` against the production build.

### T024: Add CI quality gates

**Dependencies:** T020-T023
**Likely files:** CI workflow(s), `package.json`, CI documentation
**Scope:** M

- [x] Frozen install, provenance/signature check where supported, audit, secret scan, lint, typecheck, unit, integration, build, E2E, and artifacts run.
- [x] Required jobs are documented; no flaky retry hides a failure.
- **Verify:** green clean run and one controlled failing run for each required gate.

## Phase 3: Durable identity and history

### T030: Add database boundary and migration discipline

**Dependencies:** T001, T024
**Likely files:** DB config/client, migration config, first migration, integration helper
**Scope:** M

- [x] Transactions, typed repositories, migration ownership, and test isolation are defined.
- [x] Migration has forward behavior, compatibility notes, and rollback/recovery plan.
- **Verify:** migrate empty DB, migrate populated fixture DB, restart, and restore snapshot test.

### T031: Implement user session and personal organization slice

**Dependencies:** T030
**Likely files:** auth adapter, session helper, login/callback routes, tests
**Scope:** M

- [x] Secure cookie session maps an identity subject to one user and personal organization.
- [x] Logout/revocation/expiry work; no tokens enter client storage or logs.
- **Verify:** login, expiry, replay, logout, fixation, and cookie-attribute tests.

### T032: Implement membership and authorization policy

**Dependencies:** T031
**Likely files:** membership repository, policy helper, schemas, tests
**Scope:** M

- [x] One canonical policy enforces owner/member/admin/viewer operations.
- [x] Cross-tenant identifiers never reveal existence.
- **Verify:** complete role-resource-action matrix at service and data-policy layers.

### T033: Implement private object-storage adapter

**Dependencies:** T032
**Likely files:** storage interface, provider adapter, key policy, tests
**Scope:** M

- [x] Server-generated tenant-scoped keys, checksum, private ACL, and bounded signed URLs.
- [x] Partial upload cleanup and reconciliation are defined.
- **Verify:** guessed/cross-tenant/expired URL denial and orphan cleanup tests.

### T034: Implement durable resume creation vertical slice

**Dependencies:** T030-T033
**Likely files:** resume repository/service, create route, upload UI integration, tests
**Scope:** M

- [x] Upload produces durable resume/version records tied to owner, organization, job metadata, and checksum.
- [x] Duplicate idempotency key returns the original result without duplicate objects.
- **Verify:** create, retry, transaction failure, storage failure, and ownership tests.

### T035: Implement durable home history

**Dependencies:** T034
**Likely files:** home loader, history query, home component, tests
**Scope:** M

- [x] Server-loaded pagination, stable ordering, empty/loading/error states, and tenant scoping.
- **Verify:** refresh, second session, pagination boundary, no-data, DB-failure, and cross-tenant tests.

### T036: Implement durable result route

**Dependencies:** T034
**Likely files:** result loader, result query/service, result component, tests
**Scope:** M

- [x] Direct URL and refresh return authorized stored state.
- [x] Missing/forbidden/processing/partial/failed/completed states have correct HTTP/UI behavior.
- **Verify:** production browser and HTTP matrix including guessed ID and expired session.

### T037: Add consent, audit-event, export, and deletion skeletons

**Dependencies:** T032-T034
**Likely files:** privacy schema/migration, audit service, privacy routes, tests
**Scope:** M; split if needed

- [x] AI transfer requires versioned consent.
- [x] Create/read/delete actions emit PII-safe audit events.
- [x] Export and deletion requests are durable jobs with visible status.
- **Verify:** consent denial, audit completeness, export manifest, deletion denial/ownership tests.

### Checkpoint A2: Durable candidate product

- [x] T030-T037 pass.
- [ ] Tenant isolation and durable refresh are independently reviewed.
- [x] Backup/restore and orphan reconciliation evidence exists.
- [x] Human approves Gate A2 (workspace owner, 2026-09-09).

## Phase 4: Asynchronous analysis

### T040: Add analysis records and state-transition policy

**Dependencies:** A2
**Likely files:** migration, analysis repository, state policy, tests
**Scope:** M

- [x] State graph matches `ARCHITECTURE.md`; illegal transitions fail atomically.
- [x] Every transition records attempt, actor/process, timestamp, and request ID.
- **Verify:** exhaustive allowed/denied transition tests and concurrent update test.

### T041: Add leased PostgreSQL job worker

**Dependencies:** T040
**Likely files:** job repository, worker entry, lease runner, tests
**Scope:** M

- [x] Atomic claim, lease, heartbeat, backoff, attempt cap, dead-letter and graceful shutdown.
- **Verify:** two-worker single-claim, worker-kill reclaim, poison-job isolation, and shutdown tests.

**Verification (2026-09-10):** The worker loop, lease-loss abort, 120-second lease, bounded retries, final-attempt dead-letter transition, and graceful shutdown entry point pass unit tests. The local PostgreSQL matrix proves two-worker claim exclusivity, lease reclaim, and final-attempt dead-letter failure. The production provider itself remains intentionally fake in this test environment.

### T042: Add validation/quarantine and extraction stages

**Dependencies:** T033, T041
**Likely files:** ingestion service, extraction stage, storage/quarantine policy, fixtures/tests
**Scope:** M

- [x] Unsafe/unsupported files never reach scoring or AI.
- [x] Extraction records pages, text checksum, warnings, duration, and bounded resource use.
- **Verify:** clean, multi-page, malformed, encrypted, empty, scanned, oversized, and timeout fixtures.

### T043: Add deterministic scoring worker stage

**Dependencies:** T042
**Likely files:** scoring stage, rule engine adapter, result schema, tests
**Scope:** M

- [x] Versioned deterministic result persists atomically with rule evidence.
- [x] Rerun with identical versions/input produces identical deterministic output.
- **Verify:** golden fixtures, schema validation, retry/idempotency, and forced persistence failure.

### T044: Add bounded qualitative AI adapter and stage

**Dependencies:** T041, T043
**Likely files:** AI interface, OpenAI adapter, qualitative stage, contract tests
**Scope:** M

- [x] Typed structured output, untrusted-input separation, timeout, retry classification, token/cost capture, model/prompt version.
- [x] No provider call exceeds tenant entitlement or global kill switch.
- **Verify:** success, malformed output, refusal, timeout, 429, 5xx, budget exhaustion, and prompt-injection fixtures.

**Verification (2026-09-10):** Unit fixtures cover the declared provider outcomes. A hosted staging smoke test used only a synthetic resume/job/user, invoked the real OpenAI qualitative stage, and verified one persisted AI run, result, writer draft, and terminal `completed` analysis state before deleting all synthetic database and storage data.

### T045: Add partial results and provider-outage behavior

**Dependencies:** T043, T044
**Likely files:** orchestration service, result assembler, status mapper, tests
**Scope:** M

- [x] Deterministic results remain available when qualitative analysis fails.
- [x] Retry and user messaging distinguish transient from permanent failure.
- **Verify:** simulated provider outage, recovery, retry idempotency, and no duplicate usage charge.

**Verification (2026-09-10):** The new migration persists a deterministic partial result and safe empty writer draft after the final qualitative failure; provider requests use a stable idempotency key. Mocked outage, production-browser, and local PostgreSQL persistence checks pass. The hosted staging smoke test also verified that a completed qualitative stage is not rerun and does not create a duplicate AI usage record.

### T046: Add analysis status API and progress page

**Dependencies:** T040-T045
**Likely files:** status route, progress route/component, client poller, tests
**Scope:** M

- [x] Durable URL renders queued/stage/partial/completed/failed/cancelled states.
- [x] Polling uses backoff, visibility awareness, abort, and terminal stop.
- **Verify:** reload at each state, slow worker, network loss, session expiry, and accessibility announcements.

**Verification (2026-09-10):** The progress page has terminal polling stop, visibility-triggered restart, abort cleanup, accessible status/error announcements, and partial-result navigation. Production-build browser/a11y checks and local database status persistence checks pass.

### T047: Add safe cancellation

**Dependencies:** T041, T046
**Likely files:** cancel route, orchestration cancellation policy, worker checks, tests
**Scope:** M

- [x] Authorized queued work cancels; in-flight behavior is explicit and idempotent.
- [x] Cancellation never leaves inaccessible files or contradictory billing records.
- **Verify:** cancel-before-claim, cancel-during-stage, duplicate cancel, unauthorized cancel, and cleanup tests.

**Verification (2026-09-10):** The cancellation RPC is idempotent for already-cancelled work and explicitly returns `already_started` for in-flight work rather than falsely claiming cancellation. The local PostgreSQL matrix verifies queued-job deletion and both idempotent terminal paths; billing is not in scope until Phase 8.

## Phase 5: Scoring trust

### T050: Introduce versioned score semantics

**Dependencies:** T043
**Likely files:** schemas, rule engine, score-band helper, migrations/tests
**Scope:** M

- [x] Passed/failed/not-evaluated/confidence are distinct; skipped rules leave the denominator.
- [x] All UI components share one score-band mapping.
- **Verify:** boundary scores 0/39/40/49/50/69/70/71/100 and no-JD fixtures.

### T051: Improve parsing and international coverage

**Dependencies:** T050
**Likely files:** parser modules, locale config, fixtures, tests
**Scope:** M per parser slice

- [x] Split contact, section, date, bullet, and layout parsing into separately tested modules.
- [x] Add international phones/locations, aliases, Unicode, multi-column/order warnings.
- **Verify:** labeled fixtures and per-field precision/recall report.

### T052: Improve JD phrase and skill matching

**Dependencies:** T050
**Likely files:** matcher, taxonomy data/interface, evidence model, tests
**Scope:** M

- [x] Multi-word phrases, aliases, boundaries, and evidence spans work without keyword stuffing false positives.
- [x] Taxonomy/version is stored with every analysis.
- **Verify:** positive/negative/adversarial labeled corpus and match-quality report.

**Verification (2026-09-10):** The versioned matcher covers 22 synthetic canonical-term labels with 13 true positives, zero false positives, and zero false negatives. It rejects URL/email-only and concatenated-word stuffing, and records bounded source spans. Local PostgreSQL migration and persistence tests confirm that the taxonomy version is required, stored with deterministic and assembled results, and carried through partial-result persistence.

### T053: Add scanned-PDF/OCR path

**Dependencies:** T001, T042
**Likely files:** OCR interface/adapter, extraction router, result warnings, tests
**Scope:** M

- [x] Scanned documents are detected before false scoring.
- [x] Approved OCR path respects region, retention, timeout, and cost controls; otherwise user receives explicit unsupported state.
- **Verify:** scanned/mixed/text PDFs, OCR outage, low-confidence, and privacy tests.

**Verification (2026-09-10):** Text-layer profiling routes text PDFs to deterministic extraction and scanned/mixed PDFs to `needs_ocr` before scoring. The default runtime is deliberately unsupported, makes no provider request, and gives an explicit upload-a-text-PDF message. Adapter tests cover approval, consent/privacy, region, retention, cost, timeout, outage, and low-confidence boundaries using synthetic bytes only.

### T054: Build benchmark and regression harness

**Dependencies:** T050-T053
**Likely files:** benchmark runner, manifest, reports, package scripts
**Scope:** M

- [x] Corpus manifest records provenance, anonymization, expected outputs, and permitted use.
- [x] Report includes field precision/recall, section F1, match quality, variance, latency, cost, failure rate.
- **Verify:** baseline report is reproducible and CI blocks approved regression thresholds.

**Verification (2026-09-11):** `npm run benchmark:phase5` reads only the manifest-listed synthetic corpora and reports field precision/recall, section F1, matching precision/recall, deterministic variance, latency, cost, and failure rate. Approved regression thresholds now enforce field precision/recall >= 0.95, section F1 >= 0.90, match precision/recall >= 0.95, failure rate <= 0%, and p95 deterministic latency <= 10 ms. The measured run passed every threshold: parser aggregate precision/recall 1.00/1.00, section F1 0.952, matching precision/recall 1.00/1.00, failure rate 0%, and p95 latency 0.667 ms.

### Checkpoint A3: Scoring trust [PASS, 2026-09-11]

- [x] T050-T054 pass.
- [x] Product copy and score meanings match measured evidence.
- [x] Human scoring/product review approves Gate A3.

**Gate A3 verification (2026-09-11):** PASS. The scoring/product owner approved the threshold policy and the current limitations under the explicit instruction to complete A3. Score bands are shared at 0-49 `Needs attention`, 50-69 `Good start`, and 70-100 `Strong`; product copy consistently describes ATS-like parse-simulation guidance rather than a proprietary ATS guarantee. The approved threshold artifact is `benchmarks/phase5-thresholds.json`, and CI enforces it through `npm run benchmark:phase5`.

## Phase 6: Accessible complete web experience

### T060: Build shared accessible application shell

**Dependencies:** A2, T023
**Likely files:** `app/root.tsx`, Navbar, global CSS, shell tests
**Scope:** M

- [x] Skip link, landmarks, one-h1 rule, unique metadata, focus-visible, session/error states, reduced-motion tokens.
- **Verify:** keyboard, 200% zoom, axe, title/status, and viewport matrix.

**Verification (2026-09-11):** Shared shell landmarks, skip navigation, route metadata, recovery states, focus-visible styles, motion tokens, and one-H1 behavior are covered by the 390/768/1024/1366/1440 browser matrix. Reduced-motion and 200% zoom runtime checks pass; the expanded axe suite reports no serious or critical violations.

### T061: Complete upload and progress experience

**Dependencies:** T016, T046, T060
**Likely files:** upload route, FileUploader, progress component, E2E test
**Scope:** M

- [x] All validation/status/retry/cancel states are visible, announced, and refresh-safe.
- [x] Decorative scan GIF is replaced by optimized, optional motion.
- **Verify:** state matrix E2E with reduced motion and throttled/offline network.

**Verification (2026-09-11):** Upload validation, consent errors, cancellation, retry, offline recovery, and durable analysis polling are announced in the browser. The Phase 6 Playwright suite passes reduced-motion, offline, transient-status-retry, and viewport checks. Motion uses CSS/scene primitives with the reduced-motion media override; no scan GIF is referenced.

### T062: Complete result summary and details accessibility

**Dependencies:** T036, T050, T060
**Likely files:** Summary, Details, Accordion, score components, E2E test
**Scope:** M; split score and accordion work if needed

- [x] Scores/progress have names and values; accordion semantics/focus work; color is supplemental.
- [x] Mobile details collapse to readable layout.
- **Verify:** axe, keyboard, screen-reader spot check, snapshot and boundary-score tests.

**Verification (2026-09-11):** Score progressbars/groups expose names and numeric values, rule outcomes distinguish pass/attention/skipped in text, and native button accordion semantics pass keyboard component tests. The expanded axe and responsive browser suites pass; boundary score semantics remain covered by the existing Phase 5 unit suite.

### T063: Build multi-page Parse View

**Dependencies:** T051, T060
**Likely files:** ParseView, page-preview component, result mapper, tests
**Scope:** M

- [x] Page selector, extracted evidence, confidence, warnings, and limitation copy support every page.
- [x] Long links/text cannot overflow.
- **Verify:** 1/2/10-page, scanned, missing-field, mobile, zoom, and keyboard fixtures.

**Verification (2026-09-11):** Page-level text is retained through extraction, worker persistence, deterministic scoring, and the durable result mapper. Parse simulation tests cover 1/2/10-page evidence, low-confidence/empty pages, and per-page warnings; the component test covers keyboard page selection and limitations. The UI wraps long evidence and links, and the responsive/zoom browser checks pass. Scanned PDFs retain the existing explicit OCR-required limitation state.

### T064: Implement true keyword evidence view or rename feature

**Dependencies:** T052, T060, product decision
**Likely files:** Heatmap, overlay component, result schema mapping, tests
**Scope:** M

- [x] Human chooses true page-coordinate overlay or honest “keyword coverage” naming.
- [x] Match/missing/uncertain evidence is accessible without color.
- **Verify:** product acceptance, coordinate/evidence fixtures if overlay, responsive snapshots, axe.

**Verification (2026-09-11):** The product path is the honest “Keyword coverage” view, not a coordinate overlay. Taxonomy matches, missing terms, and lower-confidence generic matches are represented in stored evidence and exposed as text labels with source spans; component, axe, and responsive browser checks pass. No unverified coordinate-overlay claim is made.

### T065: Build account and privacy pages

**Dependencies:** T037, T060
**Likely files:** account route, privacy route/components, server actions, E2E tests
**Scope:** M per page slice

- [x] User can review consent, request export, request deletion, cancel queued requests, manage other sessions, and track request status.
- **Verify:** re-auth, cancellation windows, completed export, deletion, unauthorized and failure recovery E2E.

**Verification (2026-09-11):** `/account` provides identity/session review and signs out other sessions without storing tokens client-side. `/privacy` reads versioned consent records, creates export/deletion requests, shows durable status, and allows cancellation only while queued with owner scoping and audit events. Signed-out redirects and failure-safe UI are covered locally. Hosted owner/cross-tenant/RLS and service-only worker-RPC checks pass through `npm run test:hosted:rls`; hosted Phase 4 durable persistence and private-storage checks also pass. Authenticated re-authentication, completed export artifact delivery, and a live deletion-worker execution remain A4 evidence.

### T066: Add candidate evidence-grounded writing suggestions

**Dependencies:** T044, T060
**Likely files:** analysis schema, AI prompt, writer component, result route, tests
**Scope:** M

- [x] Summary and bullet suggestions are generated from resume evidence only and are clearly presented for candidate review.
- [x] Suggestions never invent achievements, metrics, employers, dates, skills, or credentials.
- **Verify:** structured-output, grounding, empty-source, keyboard, and accessibility tests.

**Verification (2026-09-11):** Structured output remains schema-validated, then passes a conservative server-side grounding gate that removes unsupported summaries/bullets and requires each original bullet to exist in source text. Valid, invented-fact, and empty-source unit fixtures pass; the UI labels suggestions as grounded and review-before-use. Live provider output and manual screen-reader review remain unrun locally.

## Phase 7: Production security and operations

### T070: Implement security headers and session hardening

**Dependencies:** T031, T060
**Likely files:** server headers/session config, root response, tests
**Scope:** M

- [x] CSP, HSTS in HTTPS environments, frame, MIME, referrer, permissions and cookie policies are explicit.
- [x] Session cookies have an explicit bounded lifetime and state-changing routes enforce same-origin requests.
- **Verify:** `tests/unit/security.test.ts` and `e2e/phase7.spec.ts` pass. CSP defaults to report-only for burn-in; staging report review and enforcement approval remain A4 evidence.

**Implementation (2026-09-11):** Security headers are applied to SSR and the
production server, HTTPS-only HSTS is conditional, cookies have a configured
maximum age, and same-origin checks protect state-changing routes.

### T071: Complete threat model and abuse-case suite

**Dependencies:** T032, T042, T044, T070
**Likely files:** threat-model doc, security tests by boundary
**Scope:** M per boundary

- [x] STRIDE covers browser, auth, upload, storage, queue, worker, LLM, billing, admin, integrations.
- [x] Each high threat maps to owner, control, test, residual risk, review date.
- **Verify:** `docs/security/THREAT_MODEL.md` and the abuse-boundary tests are present. Security-owner review and treatment of deployment-owned risks remain required before A4.

### T072: Add observability foundations

**Dependencies:** T012, T040
**Likely files:** logger, metrics, tracing, web/worker bootstrap, tests
**Scope:** M

- [x] Correlated PII-safe logs, RED metrics, job-stage metrics, provider usage/cost, client errors/Core Web Vitals.
- **Verify:** `tests/unit/observability.test.ts` and Phase 7 browser telemetry tests pass; `docs/operations/ALERTS.json` is validated in local and CI checks. Dashboard/sink wiring and a hosted cross-layer trace join remain A4 evidence.

**Implementation (2026-09-11):** Structured logs, bounded Prometheus metrics,
provider cost signals, worker lifecycle metrics, and content-free browser
telemetry are implemented with redaction and low-cardinality route labels.

### T073: Add SLO alerts and runbooks

**Dependencies:** T072
**Likely files:** SLO doc, alert config, runbooks
**Scope:** M

- [x] Availability, latency, terminal-job, queue-age, cost, readiness and error-budget alerts have owners and actions.
- **Verify:** `docs/operations/OBSERVABILITY.md`, `docs/operations/ALERTS.json`, and `docs/operations/RUNBOOKS.md` define owners/actions, alert expressions, and runbook links; `npm run check:alerts` passes. Notification-sink delivery and provider-outage/stalled-queue tabletop exercises remain hosted A4 evidence.

### T074: Complete retention, export, and deletion execution

**Dependencies:** T037, T065, T072
**Likely files:** retention worker, deletion service, export service, tests
**Scope:** M per workflow

- [x] Policy covers DB, objects, caches, indexes, telemetry references, and backup expiry.
- [x] Workflows are idempotent, audited, retryable, and visible to users.
- **Verify:** privacy/retention unit coverage and the Phase 7 SQL/RPC implementation are present. The configured hosted project has all checked-in Phase 7 migrations applied; hosted SQL verification covers durable deletion-plan retry/reclaim semantics, retention claim behavior, privilege/RLS boundaries, and cleanup. Hosted storage and cross-tenant denial checks pass. Timed retention under production scheduling, live export artifact delivery, and a hosted restore drill remain A4 evidence.

### T075: Prove backup, restore, and disaster recovery

**Dependencies:** T030, T033, T074
**Likely files:** backup/restore scripts or IaC, DR runbook, evidence record
**Scope:** M

- [x] Database and object-store recovery procedures have an explicit RPO/RTO baseline and isolated-restore procedure.
- [x] The local restore verifier preserves ownership and integrity through manifest checksums.
- **Verify:** `npm run test:restore` is a deterministic local verifier. A dated hosted restore drill with checksums, representative user flow, measured duration, and remediation items remains required for A4.

### T076: Add load, soak, and recovery testing

**Dependencies:** T041-T046, T072
**Likely files:** performance config/scenarios, package scripts, report template
**Scope:** M

- [x] The deterministic load scenario exercises accepted uploads, queue growth, worker concurrency, provider throttling hooks, browser performance, cost, and worker recovery.
- **Verify:** `npm run test:load` emits p50/p95/p99, memory, error, queue-age, throughput, cost, and recovery evidence. Hosted DB-pool, provider-throttle, soak, and capacity approval remain A4 evidence.

### Phase 7 implementation checkpoint: local and hosted evidence — 2026-09-11

- [x] T070-T076 implementation slices, tests, operational docs, alert policy, migration, worker entry points, egress policy, container hardening check, and CI command wiring are present in this checkout.
- [x] Local evidence passes: 45 Vitest files / 190 tests, TypeScript, lint, build, deterministic load, deterministic restore, and 44 Playwright tests (including accessibility and Phase 7 coverage).
- [x] Database evidence passes: local Supabase reset through the full migration set, Phase 4 and Phase 7 SQL verification, and database lint. Hosted Phase 4 persistence, tenant/RLS, private-storage, and Phase 7 SQL verification also pass.
- [x] Dependency/security checks pass: registry signatures and attestations verify, the production dependency audit reports 0 vulnerabilities, and the secret scan passes.
- [ ] Gate A4 external evidence is complete. Hosted restore, notification delivery, monitored staging E2E, rollback rehearsal, policy approval, human security/operations approval, live provider verification, and deployment-owned malware/sandbox/egress controls are still pending and cannot be inferred from local tests.

### Checkpoint A4: B2C production readiness [IMPLEMENTATION READY; GATE OPEN]

- [x] T060-T076 implementation slices and local acceptance checks pass.
- [ ] Security/privacy review, restore drill, SLO dashboards, staging E2E, rollback rehearsal, and policy approval are attached.
- [ ] Human approves Gate A4.

## Phase 7A: Accuracy-v2, authoring, and verified artifacts [AA0 APPROVED 2026-10-04; AA1 ENGINEERING CLOSED / OWNER ACCEPTED; RELEASE GATE OPEN]

### Approval record — 2026-10-03

The workspace owner approved the proposed Accuracy-v2 architecture and the recommended AA010 first implementation slice with “I approve.” This records approval of that limited native-PDF slice and the architectural direction in ADR-0006/0007, not completion or waiver of Gate AA0. It does not resolve the unnamed first release domain/locale, approve scoring weights, select an OCR provider, authorize real-data collection, or close production Gate A4. AA000-AA005 remain unchecked where concrete decisions, frozen contracts or named approvals are missing.

### Sequencing correction — 2026-10-04

The assistant incorrectly extended the limited direction/AA010 approval into AA011 implementation and reported AA011 as complete despite AA0 being open. Passing implementation tests does not satisfy its prerequisite gate. AA010/AA011 implementation and verification evidence are retained below, but their phase acceptance is pending AA0; neither AA0 nor AA1 is complete. Existing additive migrations and Git history are preserved, not destructively rolled back. No further AA1 implementation, OCR execution/installation, contract adoption, real-data collection or production enablement proceeds until AA000–AA005 and Gate AA0 receive their required recorded approvals. General “continue,” preparation approval, local-host information, or green CI must not substitute for those decisions.

**Historical pre-approval routing:** AA000, then AA001/AA002 and AA003, then AA004/AA005 and explicit Gate AA0 review. The gap matrix below records what was missing before the later approval, not current blockers. Local-testing scope alone was not engine/policy/budget approval.

| AA0 task | Existing material                                                                             | Missing acceptance                                                                                |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AA000    | Spec capability map, non-goals and claim ladder                                               | Dated product/scoring/privacy/evaluation approval of allowed claims and boundaries                |
| AA001    | Proposed score dimensions and ADR-0006 direction                                              | Concrete score/legacy/unknown-state decisions, worked examples and owner approval                 |
| AA002    | Proposed schemas/contracts and limited native evidence implementation                         | Reviewed, frozen versioned contracts for all named objects and approval                           |
| AA003    | Proposed evaluation/privacy requirements                                                      | Corpus provenance, partitions, retention, annotation/adjudication and statistical-policy approval |
| AA004    | ADR-0008 provider/evaluation proposal; local-test scope clarified                             | AA002/AA003 completion, approved local OCR contract, resource/cost/privacy protocol and sign-off  |
| AA005    | Owner selected software engineering / English / India on 2026-10-04; PDF/DOCX-first direction | Input mix, formats and unsupported behavior approval                                              |

These tasks supplement, rather than retroactively upgrade, the synthetic A3 evidence.

### Phase AA0: Truth contract and evaluation design

**Approval recorded (2026-10-04):** the workspace owner explicitly replied “I approve” to the presented request for approval of [`ADR-0009 candidate 1`](../docs/decisions/0009-aa0-truth-contract-and-evaluation-design.md) for AA000–AA005 and Gate AA0, at reviewed revision `e629a2882b3cc14a63771ae400f4f67a7e4f3f62`. The owner signs as product/scoring/privacy/evaluation approver. Software engineering / English / India, two scores/no aggregate, logical contracts, synthetic corpus governance and local-only OCR evaluation design are accepted without exceptions or threshold relaxations. The six design tasks close in dependency order below. No app code, migration, engine installation or corpus collection is part of this acceptance record.

**Active routing (2026-10-11, AA1-first closeout):** AA1 engineering is CLOSED and owner-accepted; its full accuracy gate remains NOT PASSED. The owner directed AA1 wrap-up before further AA2 work. The [final closeout and residual register](../docs/evaluation/AA1_ENGINEERING_CLOSEOUT.md) reconcile AA010–AA015, approval, verification, known failures, deployment requirements and cleanup. Existing AA020 draft work is preserved; no additional AA2 implementation is part of this closeout. ADR-0012/E-003 retain authorization for the subsequent AA2 engineering task. Independent reviewers remain deferred and must not be requested as an engineering prerequisite. Uncertain evidence cannot become verified facts or numeric scores through this sequencing approval.

**Runtime incident resolved (2026-10-11):** owner authorized migration/recovery with “do it test yourself.” Exact AA1 migration applied to hosted Resumide as `20261011151855`; hosted SQL guard verifier passes with fixtures rolled back. Fixed stale extraction status across quarantine → queued → extracting. The queued analysis reached `partial` with deterministic/saved results, queue empty and zero AI runs; continuous worker is running with AI disabled. Native/mixed synthetic worker tests now begin in quarantine. Final `verify:ci` passes 78 files / 536 tests and all 46 browser tests, with zero production dependency vulnerabilities. See the [quarantine recovery record](../docs/operations/RUNBOOKS.md#quarantined-development-upload-incident--2026-10-11). AA2 engineering authorization remains valid; failed AA1 accuracy and release gates are unchanged.

**AA1 progress (2026-10-04, after AA0 approval):** native source-contract review and hardening are verified locally. `buildNativeEvidence` now parses its output through a strict `native-evidence-v1` runtime validator: ordered page/span identities, complete line coverage, Unicode ranges, distinct contact assertion fields, exact source grounding, explicit unknown states and uncalibrated confidence. Unknown versions/fields, malformed or contradictory references, fabricated facts/confirmation and nonfinite offsets fail closed. This retains the existing format; it is not `evidence/2.0.0` adoption, calibrated validity or AA1 completion. Ownership/hash/time bindings remain in the enclosing private extraction/resume rows; a future v2 adapter must preserve those bindings rather than relabel v1 JSON.

**Verification:** tests were written first and failed before the validator existed. Then 33 focused native-evidence tests and 24 native-layout tests passed; full `npm run verify:ci` passed with 55 files / 248 tests, all 45 browser tests, formatting/lint/types/build, Phase 5, signatures/security, load/restore and zero production dependency vulnerabilities. The browser suite exercises real persisted geometry, keyboard/accessibility, responsive layouts and cross-owner denial. Database schema, RPC signatures, legacy graph values and default-false native feature flags are unchanged. Supabase SQL verification is enforced in the fresh GitHub CI run after this commit; no local Docker database verification is claimed.

**Next execution prerequisites:** AA012 local OCR remains pending. Read-only host checks found 16 GiB RAM, ten logical CPUs and approximately 40 GiB temporary-volume space; `pdftoppm` is available but `tesseract` is absent. `docker info` returned HTTP 500 from the local Docker API; isolated native execution, actual caps and compute assumptions are not verified. No package was installed and no OCR/corpus collection was run. Two independent human annotators and an adjudicator have been requested but not assigned. These are required under ADR-0009 before evaluation collection; no model-generated substitute, threshold relaxation or claimed AA013 calibration/AA015 corpus result is permitted. Complete native v2 conformity/acceptance review and these prerequisites before dependent OCR/reconciliation/correction work. AA010/AA011 phase acceptance remains open below, despite the verified native hardening slice.

**Assistant verification (2026-10-04):** `npm run verify:ci` passed: registry signatures, secret/alert/container checks, formatting, lint, 54 Vitest files / 226 tests, typecheck, production build, synthetic load/restore, Phase 5 benchmark, all 45 browser tests and zero production dependency vulnerabilities. `npm run benchmark:native-layout` separately passed both pinned-fixture tests. Approval-reference/link/arithmetic checks passed: 96 local links, six contract versions, eight AA0 task/gate checks, consistent active routing and AA1 acceptance kept open; changed ADR formatting and Git whitespace checks passed. These verify existing regression behavior and AA0 design closure, not OCR execution, representative calibration, AA1 conformity or production readiness. No thresholds or production flags changed.

#### AA000: Approve capability map, non-goals, and claim ladder

**Dependencies:** A2; **Likely files:** `ARCHITECTURE.md`, Accuracy-v2 spec/subplan; **Scope:** S

- [x] Product, scoring, privacy, and evaluation owners approve capability boundaries and the five claim levels.
- **Verify:** dated approval names allowed product language and explicitly prohibits employer-probability, universal-ATS, and automatic-hiring claims.

#### AA001: Approve score semantics and legacy treatment

**Dependencies:** AA000; **Likely files:** ADR-0006, Accuracy-v2 spec, migration/UX decision note; **Scope:** S

- [x] Approve score names, dimensions, weights-as-hypotheses, unknown/not-evaluated behavior, evidence gates, and treatment of historical scores.
- **Verify:** worked examples prove no skipped rule receives free points and no LLM output is authoritative numeric input.

#### AA002: Freeze Accuracy-v2 contracts

**Dependencies:** AA001; **Likely files:** Accuracy-v2 spec, schema/API contract docs, ADR-0007; **Scope:** M

- [x] Freeze versioned evidence, canonical resume, requirement, score, suggestion, and artifact state logical contracts in ADR-0009; runtime adoption remains later implementation.
- **Verify:** contract review covers IDs, provenance, confidence, versioning, authorization, retention, and failure/unknown states.

#### AA003: Approve corpus and annotation governance

**Dependencies:** AA000; **Likely files:** `CONSTRAINTS.md`, evaluation plan, annotation handbook, privacy data map; **Scope:** M

- [x] Approve provenance, consent/de-identification, retention, two-annotator/adjudication process, partitions, segment taxonomy, and statistical reporting.
- **Verify:** privacy owner approves access/deletion controls; evaluation owner approves agreement and confidence-interval method before data collection.

#### AA004: Approve document/OCR provider bake-off

**Dependencies:** AA002, AA003; **Likely files:** provider evaluation protocol, security/privacy review, cost ceiling; **Scope:** S

- [x] Approve representative fixtures, normalized output contract, accuracy/latency/cost/privacy measures, local-only processing boundary, failure policy, and exit boundary.
- **Verify:** protocol can compare native extraction and candidate providers without binding production to a vendor.

**Design accepted (2026-10-04):** [`ADR-0009`](../docs/decisions/0009-aa0-truth-contract-and-evaluation-design.md) accepts the local Tesseract/native evaluation design informed by [`ADR-0008`](../docs/decisions/0008-selective-ocr-evaluation.md). No managed provider or external spend is approved. AA002 logical contracts and AA003 governance design are accepted; actual host/resource/isolation/cost validation remains an AA012 execution prerequisite. AA012 stays unchecked. No provider calls, real resume disclosures, provisioning or OCR enablement occurred in AA0.

#### AA005: Approve first release segment

**Dependencies:** AA001-AA004; **Likely files:** release-scope decision, domain/locale matrix, template matrix; **Scope:** S

- [x] Select software engineering / English / India, PDF input with gated layout/scan subclasses and initial PDF/DOCX export targets; LaTeX stays later. Explicit unsupported behavior approved.
- **Verify:** unsupported domains/locales/formats have explicit UI behavior and no generalized claim.

#### Gate AA0: Accuracy-v2 architecture approval

- [x] Human owners approve AA000-AA005 and change ADR-0006/0007 status only through the recorded ADR-0009 decision, 2026-10-04.
- [x] Initial weights remain hypotheses until calibration; documentation creation alone does not pass this gate. Explicit workspace-owner approval is recorded above.

### Phase AA1: Document evidence [ENGINEERING CLOSED / OWNER ACCEPTED; LOCKED QUALITY FAILED; RELEASE VALIDATION DEFERRED]

#### AA010: Persist one native-PDF evidence graph

**Dependencies:** AA0; **Likely files:** evidence schema/migration, extraction service, fixture, tests; **Scope:** M

- [x] Persist pages, text spans, source method, confidence, and critical contact-field assertions for one native-text PDF. Scoped native conformity accepted 2026-10-04; see the qualified conformity matrix in the native layout design.
- **Verify:** deterministic integration test reconstructs every assertion from page/span evidence and enforces owner isolation.

**Implementation (2026-10-03):** AA010 stores `native-evidence-v1` in the existing private extraction row, with Unicode code-point offsets and source references for name/email/phone candidates. All candidates are `review_required` with `uncalibrated` confidence; this is not calibrated extraction validity. Other critical fields await later structured-evidence slices. Privacy export includes the new column through its existing owner-filtered read, and deletion inherits the analysis cascade. `NATIVE_EVIDENCE_ENABLED` defaults to false until migration and full Supabase verification pass. Deploy migration `20261003100000_native_evidence_graph.sql` first, run `npm run test:aa010:db`, then opt the worker in. Disabling the flag restores the older RPC call.

**Evidence:** Real synthetic-PDF reconstruction, Unicode offsets, and absent-field tests pass. GitHub CI applies the full migration set to Supabase and passes the Phase 4, Phase 7, and AA010 SQL verifiers plus database lint. On 2026-10-03, the committed native-evidence migration was applied to hosted Resumide (`wreqkdavofpfblsupnls`; hosted migration version `20261003143648`). The same AA010 SQL verifier passes there: fabricated assertion rejection, atomic transition, ownership derivation, retry protection, and denied client-role privileges. The verifier now creates a randomly identified synthetic user/workspace and rolls back every fixture; a hosted follow-up query confirms zero remaining AA010 test users. This verifies AA010's scoped database contract, not the wider AA1 accuracy gate or production Gate A4.

**Regression verification:** 48 Vitest files / 197 tests, formatting, lint, typecheck, production build, registry signatures, secret/alert/container checks, synthetic load/restore, and Phase 5 benchmark pass. [GitHub CI run 37129633129](https://github.com/vsuman00/ai_resume_checker/actions/runs/37129633129) at `44c3427` passes all four jobs, including all 44 browser tests and the full Supabase database checks. After the hosted project resumed, local `npm run test:e2e` also passes all 44 tests, including `/readyz`; no threshold was relaxed. Local Docker remains unavailable and is not claimed as verified on this machine.

**Hosted advisors:** No new evidence-table security warning was reported. Auth leaked-password protection remains disabled and requires an Auth configuration decision ([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Three private service-only tables have informational RLS-without-policy notices (intentional deny-by-default), and unused-index notices remain informational; no indexes or access controls were weakened to suppress them. The worker feature flag remains opt-in; hosted schema verification does not imply production deployment or provider/calibration readiness.

#### AA011: Add geometry and reading-order evidence

**Dependencies:** AA010; **Likely files:** layout normalizer, Parse View, API read model, tests; **Scope:** M

- [x] Normalize page coordinates, word/line blocks, columns, tables, and reading-order warnings for supported native PDFs. Scoped supported-native conformity accepted 2026-10-04; approximate geometry and review-required hypotheses remain explicit.
- **Verify:** single- and multi-column fixtures meet the reading-order gate and Parse View exposes page-linked evidence accessibly.

**Implemented native-text path (2026-10-04):** `extractPdfForAnalysis({ includeLayout: true, ... })` returns `native-layout-v1` pages with rendered viewport dimensions, normalized top-left approximate font-em text-run boxes, stable page/run IDs, Unicode code-point source offsets, and original PDF source order. Text is unchanged from the legacy extractor. Rotated/unsupported directions, invalid or out-of-page geometry, reversed vertical source order, and separated same-row runs produce explicit review warnings; column/table ambiguity is never silently reordered. The layout pass is sequential, keeps existing byte/page/character/time bounds, caps text items per page, and releases the PDF document. OCR replacement text never inherits native offsets.

**Storage/access/UI completed:** `NATIVE_LAYOUT_ENABLED` defaults false and opts the worker into the service-only layout RPC and AA010 evidence together. The additive migration validates text, ordered source coverage, page/run identities, dimensions, boxes, warning states, and role privileges before atomic persistence. Hosted Resumide migration version `20261003183757` passes the expanded SQL verifier (six malformed-layout cases, persistence/ownership, retries, denied client roles); every fixture rolls back. The server read model filters by both analysis and authenticated owner and validates the stored JSON before returning it. Parse View exposes page-linked text runs, textual line/word offsets, keyboard-selectable source highlights, meaningful warning/unavailable states, and bounded/paginated controls. The selected overlay is aligned to the rendered PDF image and clears on page change. Owner-filtered privacy export and deletion inherit existing protections.

**AA011 fixture-level implementation verified; phase acceptance pending AA0 (corrected 2026-10-04):** The versioned `native-xy-cut-v1` normalizer derives geometric lines, grounded words, column bounds/order, spanning bands, and row-major table candidates from validated persisted source runs. It preserves immutable PDF source order and abstains on unsupported geometry/direction; aligned table/column alternatives remain review-required hypotheses, not confirmed semantics. Parse View exposes the derived evidence and keyboard-linked source runs. The SHA-256-pinned real generated PDF suite meets the unchanged 98% single-column/95% supported multi-column fixture thresholds with 12/12 and 19/19 exact-position lines, full supported-fixture coverage, table-cell reconstruction and unsupported-page abstention. `npm run benchmark:native-layout` runs without `.env` and is explicitly enforced in CI. Supported scope, algorithm constants, rollback and limitations are documented in [`docs/design/NATIVE_LAYOUT_EVIDENCE.md`](../docs/design/NATIVE_LAYOUT_EVIDENCE.md).

**Release boundary:** AA011's scoped native-PDF implementation and fixture gate do not establish production calibration. The independently held-out representative release corpus and `benchmark:extraction-v2` remain AA015/AA1 work; the small synthetic corpus cannot establish those gates or confidence intervals. No OCR provider, real-data collection, scoring policy, production feature flag, or Gate A4 decision was changed.

**First-slice verification:** Real generated single-column, multi-column, and rotated PDFs preserve legacy text and reconstruct text-run offsets. Unit tests cover Unicode offsets, unavailable/out-of-page geometry, reading-direction and source-order warnings, item/page limits, and document cleanup on success/rejection. Full local `npm run verify:ci` passes (206 tests at that run, all 44 browser tests, Phase 5 benchmark, build/types/lint, supply-chain/security checks, load/restore); three subsequently added resource-bound tests also pass. No production feature flag, scoring policy, or Supabase schema was changed for this opt-in foundation.

**Storage/access/UI verification:** 220 unit/integration/component tests pass. The authenticated Playwright fixture passes against hosted Supabase with a real two-page single-/multi-column PDF and the new PostgREST RPC: keyboard selection, overlay coordinate alignment, page reset, explicit ambiguity warning, 320/768/1024/1440-pixel layouts, no serious/critical Parse View accessibility violations, and another owner receiving 404. Synthetic sessions are signed out, files/users are removed, and a hosted follow-up query confirms zero remaining test users. Security advisors report only the previously recorded private-table notices and disabled leaked-password protection; no new layout security warning appeared.

**Final scoped verification:** `npm run verify:ci` passes with 54 test files / 226 tests, all 45 browser tests, the Phase 5 benchmark, build/type/lint/format gates, registry signatures/attestations, secret/alert/container checks, synthetic load/restore and zero production dependency vulnerabilities. The authenticated fixture now covers three real PDF pages: source highlighting/keyboard selection, explicit left-before-right inferred order, table row/cell alternatives, serious/critical accessibility checks, responsive layouts and cross-owner denial. The existing SQL verifier also passes again on hosted Resumide, including all malformed evidence rejections and service-only privileges. Cleanup verification confirms zero synthetic AA010/AA011 users. The normalizer/gate commit `5bf13dd` passes all four GitHub CI jobs in [run 37146976847](https://github.com/vsuman00/ai_resume_checker/actions/runs/37146976847); final UI integration is verified locally and its push will trigger a fresh full CI run.

#### AA012: Implement selective OCR adapter slice

**Container-memory measurement slice (2026-10-11): IMPLEMENTED; local OCR VERIFIED.** The runner adds an optional, validated cgroup-v2 `memory.peak` receipt through recognition completion, distinct from individual-child RSS. Only namespace-root membership with the exact approved 1-GiB allocation is accepted; unreadable/unverified/invalid counters remain null with a reason, and older images remain compatible. The new image's development pilot passes unchanged PSM 3 / 150-DPI transcription screening: nine authored documents have 0% CER and complete exact-position lines/page coverage; ten completed attempts (including blank) yield a maximum observed container peak of 51,126,272 bytes, with five unmeasured controls explicitly counted. Real isolation/cancellation/timeout/cleanup checks pass. [Measured receipt, reproduction and limitations](../docs/evaluation/AA012_LOCAL_OCR_DIAGNOSTICS.md#container-memory-measurement-slice-2026-10-11). Failed attempts, result serialization, cold start, structured fields and remaining adverse classes remain acceptance work; AA012 and AA013–AA015/AA1 stay unchecked. No locked/calibration partition, thresholds, production integration, migrations or scoring policy changed.

**Verification prerequisite patch (2026-10-11):** the first full local verification passed 64 files / 425 tests and all 45 browser tests, then failed the final audit on [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). A separate lockfile-only patch updates Express's transitive `proxy-addr` from 2.0.7 to 2.0.8; the direct dependency manifest is unchanged. Final local `npm run verify:ci` after this patch passes 64 files / 425 tests, all 45 browser tests, formatting/lint/types/build, registry signatures/attestations, secret/alert/container checks, load/restore, Phase 5 regression and zero production dependency vulnerabilities. Live local `test:ocr:local` and the development print pilot pass separately. Changes remain uncommitted; no GitHub CI, deployment or phase acceptance is claimed.

**Frozen held-out verification (2026-10-04):** source/configuration/image receipt `d753f080ab6a23291bf00c6557c81e533b3a89f4da8cf20327a99f0cc1bc4a7a` was recorded and pushed at `f78a53e` before recognition. All six normal-font held-out documents pass `--require-quality` at unchanged PSM 3 / 150 DPI: 0% OCR CER, 100% exact-position lines/page coverage and 48/48 critical source values preserved (substring preservation, not structured-field precision/recall). Two held-out authored families per segment yield descriptive [0, 0] CER intervals, not representative confidence. The separate three-document calibration-family recognition also has zero errors, but its one-family intervals remain null and its statistical gate is explicitly not passed; no confidence model was calibrated. Every OCR result remains review-required/scoring-ineligible, native pages and exact-owned cleanup are verified, and no raw text/assets are persisted. [Measured report and remaining acceptance requirements](../docs/evaluation/AA012_LOCAL_OCR_DIAGNOSTICS.md#frozen-held-out-results) preserve original block-font failures. Local verification passes 63 files / 402 tests and all 45 browser tests; the pushed `f78a53e` normal-font OCR CI gate passes on Linux in addition to local arm64 verification. AA012 stays unchecked for structured-field evaluation, missing adverse classes/measurements and final protocol acceptance. AA013–AA015/AA1 remain open; no production enablement or scoring-policy change.

**Accuracy repair progress (2026-10-04):** the [normal-font investigation and pre-recognition lock](../docs/evaluation/AA012_LOCAL_OCR_DIAGNOSTICS.md#normal-font-accuracy-investigation-2026-10-04) preserve the original failing block corpus and all targets. Six authored synthetic content/layout families are kept in disjoint development/calibration/held-out partitions; they share one pinned font/renderer and are not representative human validation. A development-only 2×2 PSM/DPI comparison found both 300-DPI configurations fail CER confidence bounds and exact-position ordering, while PSM 3 / 150 and PSM 6 / 150 have 0% CER, 100% exact-position agreement and complete critical-value substring recovery across all three normal-font segments. PSM 3 / 150 is selected for a frozen held-out engineering check; this is not a global production downsampling policy. Parent rerun of `--require-quality` exits 0 for development; its receipt is `2edfa33d38e696478da89d62b7637a6688fdc79f50a3a1a4fc2af5dda4c123b1`. Held-out source/configuration/image receipt is recorded before recognition. Missing/mismatched receipts and unsafe CLI flags fail before Docker; extra/reversed/missing lines/pages now penalize exact-position agreement. Actual successful child CPU/RSS/process starts are qualified, failed resources/whole-container peak and host price remain unknown. Runtime smoke safety passes; 63 files / 402 tests, formatting/lint/types/build and 45 browser tests pass. CI adds a normal-font development transcription gate without claiming full AA012 acceptance. Original block diagnostics still fail at selected settings (19.30% / 70.18% / 8.33% CER). AA012/AA1 remain unchecked until remaining protocol/acceptance requirements are satisfied; no production integration, scoring, real-data or provider scope changes.

**Diagnostic expansion (2026-10-04):** the reproducible [24-document development report](../docs/evaluation/AA012_LOCAL_OCR_DIAGNOSTICS.md) and `test:ocr:pilot` now cover six clean variants, six encoded challenging scans, six mixed/native-middle variants and six adverse/contract controls. Live local execution verifies immutable native preservation, safe blank/corrupt/oversized behavior, exact-owned cleanup and strict duplicate/missing-page rejection (the latter two are contract injections, not engine failures). `--require-quality` correctly exits 1. OCR-only CER is 17.105% clean, 70.833% challenging and 8.333% mixed; native text is excluded from OCR denominators. No target or label was weakened. The helper counts omitted/abstained pages as errors and tests fixed-seed whole-family bootstrap, but this one-family corpus cannot yield a meaningful independent-family interval. All variants remain disclosed, correlated development data; original independent-family partitions, 150-DPI/blur/compression/encrypted controls, CPU/peak-memory measurements and structured-field evaluation remain incomplete. Therefore this is **not** completion of the approved pilot or AA012. Exit: revise/review, no production enablement. AA013–AA015/Gate AA1 stay unchecked; the read-only dependency audit confirms reconciliation requires persisted no-score/review guards and accessible owner-filtered review, not merely a pure helper. No migrations, production flags, candidate-data or provider permissions changed.

**Diagnostic source verification:** final local `npm run verify:ci` passes with 61 files / 369 tests and all 45 browser tests, including formatting/lint/typecheck/build, Phase 5 benchmark, signatures/attestations, security checks, load/restore and zero production dependency vulnerabilities. GitHub quality checks include the pilot source check; the separate local-OCR job records diagnostic execution explicitly as non-release acceptance. Its newly pushed result remains separate evidence until observed.

**Local execution progress (2026-10-04):** the owner restored Docker and explicitly approved testing OCR execution after the bounded-allocation question; [ADR-0008](../docs/decisions/0008-selective-ocr-evaluation.md#local-execution-authorization-2026-10-04) records the scope. The pinned test-only image built successfully. A first live attempt exposed non-root runner read permissions; a failing regression test preceded the explicit read-only COPY fix. Final tested arm64 image ID: `sha256:38e6a126b40ade4bfb6dd189b4bd69a037c672e6bdb25fefa63a698dc61756e0`.

**Provenance receipt:** built package-manifest SHA-256 is `2ef93728bd18faf83b4511d11b3cc5af2044b3954ac7cb15bb372eb335c8a4f2`. The local image is retained for repeat tests, not published. Per-attempt containers/scratch are discarded; source generators and non-PII receipts remain reproducible. The checker is intentionally separate from `.env`-dependent application workers and from release benchmark commands.

**Measured engineering results:** `npm run test:ocr:local -- <image-id>` passes real scanned/mixed/native controls. Only original pages 1/3 of the mixed PDF are recognized; native page 2 is retained separately. The checker observes actual non-root/read-only/network-none/no-host-bind, CPU/memory/swap/PID/capability/log/tmpfs configuration. Cancellation and the 500 ms recognition timeout interrupt observed renderer/OCR processes; exact-owned containers and their scratch are removed. Malformed PDF safely returns engine failure. One passing run measured approximately 625 ms scanned, 1,074 ms mixed, 306 ms cancellation including cleanup, 560 ms timeout including cleanup and 226 ms malformed failure. These are single development observations, not p95/SLO estimates. No external OCR calls/API fees; local compute cost and physical-region verification remain explicitly unknown.

**Quality and acceptance boundary:** authored block-font scan page errors are 13/76 (17.1% whitespace-normalized CER); mixed OCR pages are 13/76 and 4/128 (3.125%). This smoke corpus does **not** pass release transcription floors. All OCR text remains review-required/scoring-ineligible, with raw 0–100 Tesseract scores tagged uncalibrated; no expected labels or thresholds were changed to obtain a pass. The three same-family development controls, AI-only labels and repeated ten-page cancellation fixture are not the planned 24-document pilot, locked-family evaluation, calibrated critical-field corpus or representative AA015 release benchmark. AA012 remains unchecked pending its full evaluation/acceptance; AA013–AA015 and full AA1 remain open. No production integration, migrations, new provider, scoring-policy or feature-flag changes occurred.

**Combined verification:** final local `npm run verify:ci` passes with 59 files / 356 tests, all 45 browser tests, Phase 5 benchmark, formatting/lint/types/build, registry signatures/attestations, secret/alert/container checks, load/restore and zero production dependency vulnerabilities. `test:ocr:local` separately passes live selective recognition/isolation/cancellation/timeout/malformed-input/cleanup checks with the quality limitations above. GitHub Actions now has a separate secret-free `local-ocr` runtime job; no `.env` or provider keys are required, and recognition still has no network access. Its subsequent pushed-run result must be verified separately from these local results.

**Post-AA0 acceptance update (2026-10-04):** AA010/AA011 are accepted for their native-only scope following the [conformity matrix](../docs/design/NATIVE_LAYOUT_EVIDENCE.md#post-aa0-conformity-record-2026-10-04), fresh local regression and all four CI jobs at `db9c1ab`. This supersedes the earlier pending-conformity routing, without erasing its sequencing history. Retained v1 is allowed; the experimental pure v2 adapter is not integrated and cannot authorize scoring. Full AA1, OCR, corrections, calibration and representative evaluation remain open.

**Bounded AA012 preparation:** TDD fixes keep the total extraction deadline active through OCR, cap OCR to remaining time, forward deadline cancellation and reject invalid page counts/nonfinite confidence/invalid projected or charged costs. Signal cancellation is not proof of subprocess termination. No real engine has run: Docker API checks are unresponsive and Tesseract is absent. Installation, daemon repair, isolated process/resource enforcement, selective-page preservation and actual scanned/mixed execution remain prerequisites; AA012 is unchecked.

**Combined assistant verification (2026-10-04):** after all three subagent reviews and parent integration review, `npm run verify:ci` passes: 56 Vitest files / 303 tests, all 45 browser tests, formatting/lint/types/build, registry signatures/attestations, secret/alert/container checks, load/restore, Phase 5 benchmark and zero production dependency vulnerabilities. Adapter tests disclose its lack of pipeline integration; deadline tests prove bounded promise settlement and signal cancellation, not operating-system process cleanup. Local Docker/real OCR and representative validation are not claimed. The annotation amendment `4125ab6` also passes all four [CI jobs](https://github.com/vsuman00/ai_resume_checker/actions/runs/37187313788).

**Annotation prerequisite amendment (2026-10-04):** the workspace owner approved [ADR-0010](../docs/decisions/0010-ai-assisted-synthetic-annotation.md) with “Ok” and “yes.” AI-assisted labels with known synthetic generator truth are now permitted for local engineering tests without human annotation assignments (E-002). Every label must disclose AI provenance and unverified human validation; representative release annotation, calibration, numerical thresholds and Gate AA1 are not waived. The earlier missing-human prerequisite applies to representative validation, not this scoped synthetic test collection. Host/isolation/resource/dependency verification remains required before actual OCR execution. AA010/AA011 conformity and AA012–AA015 acceptance remain separately verified tasks.

**Dependencies:** AA004, AA010; **Likely files:** document adapter interface, selected adapter, fixtures, tests; **Scope:** M

- [x] Engineering: selective synthetic local OCR, bounded failure/resource controls and normalized provenance are implemented and tested. Production OCR and representative provider acceptance remain deferred.
- **Verify:** one scanned and one mixed fixture pass adapter-contract, timeout, retry, cost-accounting, and safe-failure tests.

#### AA013: Reconcile native and OCR evidence

**Dependencies:** AA011, AA012; **Likely files:** reconciliation service, confidence policy, tests, UI state; **Scope:** M

- [x] Preserve immutable native/OCR sources and disagreements; all proposals remain `review_required` with explicit uncalibrated confidence and score withholding.
- [ ] Production confidence calibration remains DEFERRED; raw engine confidence and owner confirmation are not calibration.
- **Verify:** disagreement and low-confidence fixtures never reach a misleading authoritative score.

#### AA014: Add candidate evidence correction

**Dependencies:** AA013; **Likely files:** correction API/service, evidence UI, audit event, tests; **Scope:** M

- [x] Owner can confirm or correct uncertain critical fields through the authenticated review route; source attempts stay immutable and separate events are auditable, concurrency-safe, exported and deleted with their source.
- **Verify:** authorization, concurrent correction, validation, audit, deletion/export, keyboard, and screen-reader tests pass.

#### AA015: Build extraction-v2 benchmark

**Dependencies:** AA010-AA014; **Likely files:** benchmark harness, locked manifest, report template, CI gate; **Scope:** M

- [x] Engineering harness reports source-grounded fields, transcription, coverage/order, failure, latency, cost limitations and source-family intervals per segment for the approved local provider; frozen manifests bind code/configuration/source/provider.
- [ ] Locked synthetic field acceptance fails (92.31% precision / 75% recall); representative release validity, calibration and provider comparison remain DEFERRED.
- **Verify:** locked evaluation is reproducible, confidence intervals are present, and any required-segment failure blocks AA1.

#### Engineering closeout AA1 (2026-10-11)

- [x] AA010–AA015 engineering closed under ADR-0011 and owner acceptance in ADR-0012; task evidence, residual acceptance obligations AA1-R1–R5, activation requirements and cleanup are reconciled in the [closeout report](../docs/evaluation/AA1_ENGINEERING_CLOSEOUT.md). This checkbox does not pass the accuracy gate below.

#### Gate AA1: Evidence-safe extraction

- [ ] `CONSTRAINTS.md` extraction floors pass on every approved segment; unsafe evidence reaches review/unsupported state, not numeric scoring.

**2026-10-11 engineering closeout:** new reconciliation, worker opt-in, immutable persistence, owner correction UI, private export/cascade cleanup and frozen extraction benchmark are implemented. Live SQL authorization/provenance/read/write guards and two-session correction CAS pass. Real native/mixed worker checks and browser keyboard/correction/owner-isolation/a11y checks pass. Development benchmark recovers 96/96 critical fields; locked synthetic benchmark records TP36/FP3/FN12 across six documents and fails all three field segments. The CI local-OCR job now enforces this nonzero gate and uploads receipts; no pushed GitHub run is claimed. Thresholds and labels were not changed. Gate AA1 is **NOT PASSED**, separately from engineering completion and the user's reviewer deferral. Final `verify:ci` passes 75 test files / 512 tests, 46 browser tests, types/build and zero production dependency vulnerabilities. Final regression receipts are in the [closeout report](../docs/evaluation/AA1_ENGINEERING_CLOSEOUT.md).

### Phase AA2: Canonical resume and immutable versions [ENGINEERING CLOSED / VERIFIED LOCALLY; FORMAL GATE OPEN]

**Owner approval (2026-10-11):** “Everything is clear in this phase AA1, then ready to go for the AA2 phase. Approve all.” [ADR-0012](../docs/decisions/0012-aa2-engineering-sequencing-approval.md) records acceptance of the disclosed AA1 engineering closeout and the E-003 sequencing exception. This is owner approval, not evidence of other reviewers' approval or passed field-accuracy/calibration gates.

#### AA020: Add canonical resume persistence

**Dependencies:** AA1, ADR-0007 approval; **Likely files:** migration, repository, recovery notes, tests; **Scope:** M

- [x] Add tenant-scoped canonical resume, immutable version, fact provenance, and deletion/export semantics.
- [x] Initial AA020 contract slice: strict `canonical-resume/1.0.0` draft validator with bounded content, stable IDs, internal fact references, evidence-version binding, exact owner confirmation and explicit unconfirmed facts. Verified state is unavailable; persistence/authentication/source grounding and multi-version lineage are subsequent services, not assertions supplied by this parser.
- [x] AA020a historical storage foundation (2026-10-12): additive immutable `canonical_resume_versions` and `resume_facts` tables, exact upload/root/tenant binding, owner-only active reads, revoked direct writes and source/resume/account deletion cascades. The later AA020–AA024 transaction migration and repository now supply the writer, grounding, export and retention integration.
- **AA020a verification:** all migrations apply to a fresh isolated local PostgreSQL 17 database; `scripts/verify-canonical-storage.sql` passes ownership, invalid state/locale/size, forged support/confirmation, immutability, grants, owner/viewer isolation, soft deletion and source/root/account cascade checks with fixtures rolled back. Public/private SQL lint has no warnings. A full empty-local-database custom dump restores with ownership/grants retained using `supabase_admin`, and the same verifier passes against the restored schema. This is local schema recovery, not hosted restore or persisted user-data parity evidence. Local `verify:ci` passes 78 files / 536 tests, all 46 browser tests and zero production dependency vulnerabilities (log `/tmp/resumide-local-first-verify-ci.log`). No hosted migration, cloud provisioning, commit or push occurred.
- **Historical AA020a verification:** 16 canonical contract tests and the earlier local regression checks passed. The full AA2 transaction, privacy and populated restore checks are tracked in the [AA2 closeout](../docs/evaluation/AA2_ENGINEERING_CLOSEOUT.md). The AA1 locked benchmark remains failed.
- **Verify:** migration forward/recovery, RLS/authorization, transaction, orphan, retention, and restore tests pass.

#### AA021: Map verified evidence into canonical content

**Dependencies:** AA020; **Likely files:** importer, canonical schema, fixtures, tests; **Scope:** M

- [x] Map contacts, sections, entries, roles, dates, bullets, skills, and source evidence without template coupling.
- **Verify:** native/OCR/import fixtures retain content, order, confidence, and provenance; unresolved values remain explicit.

#### AA022: Add version lineage and concurrency

**Dependencies:** AA021; **Likely files:** version service, change-event schema, API, tests; **Scope:** M

- [x] Edits create child versions with optimistic concurrency and append-only change events; rollback creates a new version.
- **Verify:** concurrent edit, retry/idempotency, lineage, compare, rollback, and audit tests pass.

#### AA023: Enforce fact verification

**Dependencies:** AA022; **Likely files:** fact ledger, validation policy, API, tests; **Scope:** M

- [x] Every factual value retains its source or explicit unconfirmed state; candidate confirmation binds the exact owner and value. Unsupported generated facts cannot be accepted.
- **Verify:** adversarial insert/strengthen/date/metric tests record zero unsupported accepted facts.

#### AA024: Add structured resume read and compare models

**Dependencies:** AA022, AA023; **Likely files:** query service, routes, response contract, tests; **Scope:** M

- [x] Authorized clients can load a structured version and compare two lineage-related versions with provenance states.
- **Verify:** 403/404 isolation, pagination/size, deletion, stale version, and deterministic diff tests pass.

#### Gate AA2: Canonical content integrity

- [x] Import, correction, concurrency, lineage, deletion/export, authorization, audit, and unsupported-fact tests pass on isolated localhost. **Formal Gate AA2 acceptance remains open** under ADR-0012/E-003 until the AA1 dependency or a separately reviewed replacement decision is satisfied; the checkbox records automated engineering integrity only. See the [AA2 closeout](../docs/evaluation/AA2_ENGINEERING_CLOSEOUT.md).

### Phase AA3: Job intelligence and domain packs [LOCAL IMPLEMENTATION DELIVERED; DOMAIN/DATA ACCEPTANCE OPEN]

**2026-10-16 owner-input finding:** The Python AI Engineer JD smoke test fails functional coverage despite passing citation/repeatability/score-withholding guards. AI/backend skill vocabulary, `Exp Range`, common heading variants and the `BE` education false positive need correction. See [owner JD test](../docs/evaluation/OWNER_JD_SMOKE_20261016.md).

**Owner direction (2026-10-12):** “Now go for the Phase AA3.” The approved AA0 first segment remains software engineering / English / India. Local engineering now includes the JD review route, strict source/hash/importance contracts, atomic immutable persistence, bounded model proposals, pinned offline taxonomy mappings, candidate domain pack, optional market-data gate and synthetic benchmark. No real corpus, reviewer signature, adopted taxonomy release, hosted migration or release validity is inferred. See the [AA3 engineering status](../docs/evaluation/AA3_ENGINEERING_STATUS.md) and [review candidate pack](../docs/design/SOFTWARE_ENGINEERING_DOMAIN_PACK.md).

#### AA030: Persist evidence-linked job requirements

**Dependencies:** AA0; **Likely files:** requirement schema/migration, repository, tests; **Scope:** M

- [x] Persist typed requirements, importance state, exact JD spans, provenance, confidence, and version metadata; local Auth/Data API/SQL verification passes owner isolation, concurrent head CAS, idempotent retry, malformed/foreign source rejection, export and privacy deletion.
- **Verify:** schema/repository tests cover duplicate spans, authorization, empty/contradictory requirements, export, and deletion.

#### AA031: Parse explicit deterministic requirements

**Dependencies:** AA030; **Likely files:** deterministic parser, normalizer, fixtures, tests; **Scope:** M

- [x] Parse explicit years/ranges, education, certification, location, work authorization, required/preferred cues and negation without model inference. Exact heading/inline importance citations are stored; conflicting importance is unknown, numeric thresholds must match the JD, and unrelated job titles remain unsupported.
- **Verify:** adversarial and international fixtures report per-type precision/recall and preserve exact evidence.

#### AA032: Add bounded model-proposed structure

**Dependencies:** AA031; **Likely files:** model adapter, structured schema, validator, tests; **Scope:** M

- [x] Optional injected model adapter may propose importance only for exact deterministic requirements; inferred importance is distinct from explicit importance. No live adapter is enabled. Malformed/uncited/duplicate/injected output, explicit-cue changes, variable inferred proposals, timeout and outage are exercised with synthetic adapters and fail closed to review.
- **Verify:** malformed output, unsupported inference, prompt injection, run variance, timeout, and outage tests fail closed or fall back safely.

#### AA033: Add versioned O*NET/ESCO boundary

**Dependencies:** AA030; **Likely files:** taxonomy adapter, import job, attribution/version record, tests; **Scope:** M

- [x] Implement the normalized offline O*NET/ESCO mapping boundary: reviewed provider/version/hash/license pin, attribution/modifications, exact and alias proposals, ambiguity/unmapped states, immutable release registry and activation/rollback. Synthetic test IDs are explicitly fictional; no licensed release has been adopted and real mapping quality remains unmeasured.
- **Verify:** license/attribution, version pin, alias, ambiguity, update/rollback, and unmapped-concept tests pass.

#### AA034: Build first domain pack

**Dependencies:** AA005, AA031-AA033; **Likely files:** domain pack, aliases/rules, fixture manifest, docs; **Scope:** M

- [ ] Encode only reviewed domain concepts, credentials, terminology, and evaluation fixtures for the approved first domain.
- [x] Prepare the first software engineering/en-IN engineering vocabulary and review document. Candidate title boundaries and pending-review/scoring-disabled state are implemented and tested. The original reviewed-pack acceptance item remains open; no reviewer signature is fabricated.
- **Verify:** reviewer signs the pack; unsupported domains are labeled and cannot inherit the first domain's claim.

#### AA035: Specify optional market-frequency data

**Dependencies:** AA003; **Likely files:** dataset contract, provenance/licensing record, privacy review; **Scope:** S

- [x] Define dated, permissioned market-corpus inputs, bias/coverage reporting and exact server-owned approval hash. Missing/altered/future/expired datasets disable claims. No collection or scraping occurs.
- **Verify:** absence or expiry of an approved dataset disables frequency-based claims and scoring inputs.

#### AA036: Build job-intelligence benchmark

**Dependencies:** AA030-AA034; **Likely files:** benchmark harness, locked annotations, report, CI gate; **Scope:** M

- [x] Implement per-type/importance F1, exact citation precision/recall, abstention, repeatability and measured local latency/provider-call accounting per synthetic segment. Optional supplied taxonomy mapping gold is evaluated; absent release/gold returns unknown. Live model variance and representative intervals remain unknown. Durable source/manifest receipts and a nonzero blocked release mode are recorded.
- **Verify:** reproducible report meets `CONSTRAINTS.md` floors on the locked first-domain set before AA3 passes.

#### Gate AA3: Evidence-linked job intelligence

- [ ] Typed-requirement, importance, mapping, citation, and supported-domain gates pass; market frequency stays disabled without an approved dataset.

### Phase AA4: Deterministic scoring v2

**Entry status:** AA040–AA046 local engineering is complete and verified under owner-accepted ADR-0013/E-004: 653 tests, 49 browser checks, 43 AA4 DB assertions, upstream regressions and populated restore. Formal AA1–AA4 gates remain failed/open. All authoritative v2 values remain null. See [AA4 closeout](../docs/evaluation/AA4_ENGINEERING_CLOSEOUT.md) and [local plan](aa4-local-engineering-plan.md).

#### AA040: Introduce versioned score policies

**Dependencies:** AA1-AA3, ADR-0006 approval; **Likely files:** score contracts, policy registry, legacy adapter, tests; **Scope:** M

- [x] **Local engineering under E-004:** Version dimensions, weights, bands, evidence states, normalization, and legacy read behavior independently of model prompts.
- [x] Preparatory AA0 interface slice: strict draft policy with null weights/coverage/calibration and empty bands; explicit null-only withheld score contract; isolated legacy adapter preserving original version/date/value. Preparatory snapshot only; now superseded by the delivered diagnostics route. No numeric policy is activated.
- **Verify:** golden tests reproduce each version and historical results never silently change meaning.

#### AA041: Implement Evidence Confidence gating

**Dependencies:** AA040; **Likely files:** confidence policy, analysis orchestration, result model/UI, tests; **Scope:** M

- [x] **Local engineering under E-004:** Compute fail-closed evidence readiness from observed coverage, uncalibrated confidence and disagreement and withhold dependent scores when unsafe.
- **Verify:** low-confidence and missing-critical-field cases show exact repair/review reasons and no authoritative numeric result.

#### AA042: Implement ATS Compatibility dimensions

**Dependencies:** AA041; **Likely files:** compatibility rules, evidence trace, score service, tests; **Scope:** M

- [x] **Local engineering under E-004:** Compute continuous deterministic technical observations for parseability/structure/contact/date/section/format; unqualified format evidence stays not evaluated and dimension values null with passed/failed/not-evaluated states.
- **Verify:** boundary, skipped-rule, layout, duplicate-content, and international-format tests produce complete evidence traces.

#### AA043: Implement typed Job Alignment

**Dependencies:** AA036, AA041; **Likely files:** alignment engine, requirement states, evidence trace, tests; **Scope:** M

- [x] **Local engineering under E-004:** Evaluate typed requirement observations as satisfied/partial/confirmation-needed/unknown/inapplicable, with bounded source traces and no double counting; authoritative alignment remains withheld.
- **Verify:** repeated keywords, aliases, missing evidence, inferred importance, years, education, certification, and contradiction fixtures pass.

#### AA044: Remove LLM numeric authority

**Dependencies:** AA042, AA043; **Likely files:** qualitative stage, score assembly, historical-result presenter, tests; **Scope:** M

- [x] **Local engineering under E-004:** Model output is limited to cited qualitative suggestions; historical blended scores are labeled legacy and are not compared as v2 scores.
- **Verify:** changing provider/model prose cannot change authoritative numeric output for identical structured evidence.

#### AA045: Add score explanations and readiness experiment

**Dependencies:** AA044; **Likely files:** result read model, score UI, feature flag, tests; **Scope:** M

- [x] **Local engineering under E-004:** Expose the versioned resume state, blockers, top five evidence repair priorities, recovered observations, missing evidence, dimension contributions, evidence links, unknowns, limitations, and optional Application Readiness only behind an experiment flag.
- **Verify:** automated accessibility and explanatory-copy checks pass; human comprehension review remains required for formal Gate AA4.

#### AA046: Build scoring validity and robustness suite

**Dependencies:** AA040-AA045; **Likely files:** scoring benchmark, metamorphic fixtures, report, CI gate; **Scope:** M

- [x] **Local engineering under E-004:** Evaluate synthetic determinism, counterfactual invariance, stuffing/duplication resistance, prompt injection, latency and provider cost; implement agreement/bootstrap and per-segment error measurement. Actual expert/fairness/comprehension evidence remains unavailable.
- **Verify:** identical inputs are stable, protected-name changes do not alter score, and all required segment/claim gates are reported separately.

#### Gate AA4: Explainable deterministic scoring

- [ ] Score-contract, legacy, evidence, per-domain, expert-agreement, metamorphic, fairness/error, and comprehension gates pass.

### Phase AA5: Same-page authoring and grounded writing

**Entry status:** AA050–AA057 local engineering is complete, verified and owner-accepted on 2026-10-14 (“I approved”) under owner-approved ADR-0014/E-005: 675 tests, 51 browser checks, 40 authoring DB assertions, upstream regressions, schema lint, populated restore and cleanup. Formal Gate AA5 remains open. See [AA5 closeout](../docs/evaluation/AA5_ENGINEERING_CLOSEOUT.md).

#### AA050: Add structured result-page editing

**Dependencies:** AA2, AA4; **Likely files:** resume editor route/components, mutation API, tests; **Scope:** M

- [x] **Local engineering under E-005:** Edit the structured resume on the analysis result page by section/line while preserving source evidence and version identity.
- **Verify:** keyboard, screen-reader, validation, save failure, stale version, mobile, and no-JavaScript-safe recovery behaviors pass.

#### AA051: Navigate findings to editable lines

**Dependencies:** AA050; **Likely files:** finding queue, editor navigation, impact model, tests; **Scope:** M

- [x] **Local engineering under E-005:** Rank findings by critical source and requirement review needs with honest review-effort labels (calibrated impact points are unavailable), display at most the top five in the high-impact section, and focus the exact affected line/section without hiding uncertainty or discarding the remaining findings.
- **Verify:** every released rule/requirement maps to an editable target or an explicit non-editable explanation.

#### AA052: Add typed suggestion patches

**Dependencies:** AA023, AA051; **Likely files:** suggestion schema, provider adapter, validator, tests; **Scope:** M

- [x] **Local engineering under E-005:** Suggestions identify source fact IDs, affected rule/requirement IDs, proposed operations, rationale, confidence, and clarification needs.
- **Verify:** unsupported IDs, free-form document replacement, cross-section mutation, malformed output, and stale-version application are rejected.

#### AA053: Add clarification questions

**Dependencies:** AA052; **Likely files:** clarification contract, editor UI, mutation service, tests; **Scope:** M

- [x] **Local engineering under E-005:** Ask for missing result, measurement, scope, method, or ownership instead of inventing stronger claims.
- **Verify:** candidate answers become candidate-confirmed facts with provenance; unanswered questions cannot silently populate content.

#### AA054: Add XYZ and alternative bullet patterns

**Dependencies:** AA052, AA053; **Likely files:** bullet strategy, prompt/schema, UI, tests; **Scope:** M

- [x] **Local engineering under E-005:** Offer Google-style “accomplished X, measured by Y, by doing Z” when evidence supports it, plus action-impact-context and action-scope-result alternatives.
- **Verify:** no template requires fabricated metrics; grammar, factual strength, duplication, seniority, and domain terminology are checked.

#### AA055: Add candidate-controlled change workflow

**Dependencies:** AA022, AA052; **Likely files:** change service, editor controls, audit/read model, tests; **Scope:** M

- [x] **Local engineering under E-005:** Accept, edit, reject, undo, compare, and restore-as-new-version are explicit actions recorded in the immutable ledger.
- **Verify:** concurrency, repeated action/idempotency, provider outage, audit, undo, ownership, and deletion/export tests pass.

#### AA056: Show projected and actual score delta

**Dependencies:** AA043, AA055; **Likely files:** preview scorer, result UI, score history, tests; **Scope:** M

- [x] **Local engineering under E-005:** Label pre-acceptance diagnostics as projected and recompute actual diagnostics from persisted versions; scores and numeric deltas stay null while policy/calibration are unavailable.
- **Verify:** stale evidence, multiple edits, rollback, unknown requirements, and score-policy-version changes cannot display a false delta.

#### AA057: Benchmark writer grounding and model options

**Dependencies:** AA052-AA056; **Likely files:** writer benchmark, adversarial set, report, model policy; **Scope:** M

- [x] **Local engineering under E-005:** Implement locked grounding/adversarial/model-adapter comparison on unsupported generated facts, reference validity, latency and provider cost. Actual eligible model comparison, edit usefulness/domain quality and candidate review remain unavailable.
- **Verify:** zero unsupported accepted facts; a cheaper/faster model is selected only if it passes the same quality gates.

#### Gate AA5: Truthful candidate-controlled authoring

- [ ] Grounding, browser accessibility, concurrent edit, failure, undo, correction, model comparison, and candidate-review gates pass.

### Phase AA6: Verified PDF and DOCX rendering

**Entry status:** AA060–AA065 local engineering complete and verified under owner-approved ADR-0015/E-006: 694 tests, 53 browser checks, 23 DB assertions, 20/20 synthetic parity cases, image build and cleanup. Final regression and closeout evidence are tracked in [AA6 closeout](../docs/evaluation/AA6_ENGINEERING_CLOSEOUT.md). Formal Gate AA6 remains open.

**2026-10-16 local follow-up:** Template/renderer 1.0.1 fixes mathematical glyph coverage. The owner-provided PDF exposes unresolved import fields, four missing clickable targets and three-page export expansion. Current verification: 696 tests and 20/20 synthetic parity cases; original normal export still requires review. See the closeout follow-up and aggregate owner smoke receipt.

#### AA060: Define renderer and artifact states

**Dependencies:** AA2, ADR-0007 approval; **Likely files:** renderer interface, template manifest, artifact contract, tests; **Scope:** M

- [x] **Local engineering under E-006:** Define deterministic input, escaping, renderer/template versions, queued/rendered/verification-failed/verified states, and evidence report.
- **Verify:** contract tests prevent template-specific data from becoming canonical content and block unverified recommended downloads.

#### AA061: Implement semantic preview and one PDF template

**Dependencies:** AA060; **Likely files:** preview, PDF renderer, template, tests; **Scope:** M

- [x] **Local engineering under E-006:** Render the approved first-domain profile with semantic sections, selectable text, valid links, and no critical clipping.
- **Verify:** visual, text, link, page-size, font/encoding, overflow, keyboard, and screen-reader preview checks pass.

#### AA062: Implement one DOCX template

**Dependencies:** AA060; **Likely files:** DOCX renderer, template, tests, fixture; **Scope:** M

- [x] **Local engineering under E-006:** Render the same canonical content and section order without divergent authoring logic.
- **Verify:** DOCX opens in approved viewers and passes text/order/link/style and round-trip fixtures.

#### AA063: Implement parse-back verification

**Dependencies:** AA061, AA062; **Likely files:** artifact verifier, extraction adapter, report model, tests; **Scope:** M

- [x] **Local engineering under E-006:** Re-extract each artifact and compare critical fields, normalized text, order, links, and expected section anchors to canonical content.
- **Verify:** deliberate clipping, missing glyph, reordered column, broken link, and omitted-field fixtures lose the verified label.

#### AA064: Enforce artifact layout policies

**Dependencies:** AA063; **Likely files:** layout policy, renderer checks, diagnostics UI, tests; **Scope:** M

- [x] **Local engineering under E-006:** Enforce A4/US Letter selection, page-count guidance, overflow, links, embedded fonts/encoding, and deterministic safe failure.
- **Verify:** boundary content and locale fixtures provide actionable diagnostics rather than silently shrinking or dropping content.

#### AA065: Build render-parity and accessibility corpus

**Dependencies:** AA061-AA064; **Likely files:** artifact benchmark, fixture manifest, accessibility report, CI gate; **Scope:** M

- [x] **Local engineering under E-006:** Evaluate every released template/format/locale combination for critical parity, normalized text, reading order, accessibility, failure, and latency.
- **Verify:** `CONSTRAINTS.md` artifact floors pass per combination; failures block the recommended download path.

#### Gate AA6: Verified core artifacts

- [ ] PDF/DOCX parity, accessibility, security, performance, and safe-failure evidence passes for every released combination.

### Phase AA7: Sandboxed LaTeX rendering

#### AA070: Approve LaTeX threat model

**Dependencies:** AA6; **Likely files:** threat model, compiler ADR, package allowlist, runbook; **Scope:** S

- [ ] Approve runtime isolation, package/font allowlist, no-shell-escape/network/host policy, resource limits, cleanup, and incident response.
- **Verify:** security owner records misuse cases, controls, residual risk, rollback, and provider/runtime exit path.

#### AA071: Implement canonical-to-LaTeX rendering

**Dependencies:** AA070; **Likely files:** LaTeX renderer, templates, escape library, tests; **Scope:** M

- [ ] Generate source from canonical content with complete escaping and no raw user-controlled commands.
- **Verify:** special characters, Unicode, URLs, bidi text, injection payloads, long content, and deterministic-source tests pass.

#### AA072: Isolate LaTeX compilation

**Dependencies:** AA071; **Likely files:** compiler worker, sandbox policy, cleanup, tests; **Scope:** M

- [ ] Compile without network, shell escape, writable host mounts, or reusable state; cap CPU, memory, files, output, and wall time.
- **Verify:** malicious input, package escape, file-read/write, fork/resource exhaustion, timeout, cleanup, and cancellation tests pass.

#### AA073: Add profile-specific LaTeX templates

**Dependencies:** AA071; **Likely files:** template manifests, templates, preview metadata, fixtures; **Scope:** M

- [ ] Add reviewed templates by supported profile rather than assuming one student/technology layout fits all users.
- **Verify:** each template declares domain/locale/page support and passes the same canonical content and accessibility policy.

#### AA074: Add LaTeX diagnostics and source download

**Dependencies:** AA072, AA073; **Likely files:** diagnostics sanitizer, preview/source routes, UI, tests; **Scope:** M

- [ ] Provide safe diagnostics, preview, source download, retry, and fallback to verified core templates without exposing host paths or secrets.
- **Verify:** compilation errors, timeout, unsupported glyph/package, stale version, authorization, and log-redaction paths pass.

#### AA075: Benchmark compiled artifacts

**Dependencies:** AA072-AA074; **Likely files:** LaTeX benchmark, parse-back fixtures, security report, CI gate; **Scope:** M

- [ ] Run parity, accessibility, template, malicious-input, resource, latency, and failure evaluation for each released combination.
- **Verify:** security review and AA6-equivalent artifact floors pass before the production flag can be enabled.

#### Gate AA7: Safe LaTeX export

- [ ] Sandbox, malicious-input, resource, parity, accessibility, operational, and rollback evidence passes with explicit security-owner approval.

### Phase AA8: Representative validity and staged claims

#### AA080: Acquire permitted first-domain data

**Dependencies:** AA003, AA005; **Likely files:** corpus registry, consent/provenance records, retention controls, data card; **Scope:** M

- [ ] Acquire the approved planning sample across native/scanned/mixed/layout/experience/locale segments with documented rights and exclusions.
- **Verify:** privacy review, provenance audit, access log, deletion drill, segment counts, and coverage gaps are complete before annotation.

#### AA081: Run independent annotation and adjudication

**Dependencies:** AA080; **Likely files:** annotation handbook, annotation store, adjudication log, agreement report; **Scope:** M

- [ ] Two trained annotators independently label critical fields, requirements, evidence, and expert rubric; disagreements are adjudicated blind to system output.
- **Verify:** agreement meets the approved floor per label family or the handbook/data are revised before continuing.

#### AA082: Freeze evaluation partitions

**Dependencies:** AA081; **Likely files:** partition manifest, hash registry, leakage report, access policy; **Scope:** S

- [ ] Freeze development, calibration, and locked test partitions with person/employer/template and near-duplicate leakage controls.
- **Verify:** hashes and membership are immutable, test access is restricted/audited, and no calibration report includes locked-test labels.

#### AA083: Calibrate without the locked test set

**Dependencies:** AA082, AA4; **Likely files:** calibration pipeline, policy versions, calibration report, approval record; **Scope:** M

- [ ] Fit or revise thresholds/weights only on development/calibration data with rationale, uncertainty, and rollback version.
- **Verify:** reproducible calibration contains no test-set access and documents sensitivity plus rejected alternatives.

#### AA084: Run the locked end-to-end evaluation

**Dependencies:** AA5-AA7 as released, AA083; **Likely files:** evaluation runner, locked report, fairness/error report, artifact archive; **Scope:** M

- [ ] Evaluate extraction, job intelligence, scoring, writer grounding, artifact parity, accessibility, fairness/error, failure, latency, and cost per required segment.
- **Verify:** bootstrap confidence intervals and lower bounds are reported; one failed required segment fails the gate regardless of aggregate score.

#### AA085: Publish versioned evidence and limitations

**Dependencies:** AA084; **Likely files:** model/ruleset card, dataset card, limitations page, release note; **Scope:** M

- [ ] Publish versions, intended use, prohibited use, data composition, metrics, uncertainty, known failures, monitoring, rollback, and expiry/retest conditions.
- **Verify:** independent technical, domain, privacy, fairness, and product reviewers approve every public claim against the locked report.

#### AA086: Promote only the achieved claim level

**Dependencies:** AA085; **Likely files:** claim registry, product copy, feature flags, rollout/monitor plan; **Scope:** M

- [ ] Release only the first domain/locale/formats that passed, with monitoring, drift thresholds, stop conditions, and rollback.
- **Verify:** unsupported segments remain labeled; regression, evidence-quality, complaint/correction, latency, cost, and fairness monitors are active.

#### Gate AA8: Domain-valid claim

- [ ] Every required segment meets the approved lower confidence bound and independent reviewers approve construct validity and exact claim language.
- [ ] Only after this gate may copy use the approved scoped domain-level claim; “all industries” remains unsupported until each claimed segment passes.

### Phase AA9: Recruiter and vendor calibration pilot

#### AA090: Design transparent recruiter calibration

**Dependencies:** AA8, A5 prerequisites; **Likely files:** pilot protocol, rubric contract, notice/correction policy, legal review; **Scope:** M

- [ ] Define employer rubric inputs, visibility, override/rationale, candidate notice, correction/appeal, retention, audit, and prohibited automatic rejection.
- **Verify:** legal, fairness, security, privacy, domain, and product owners approve pilot scope, stop conditions, and human-decision boundary.

#### AA091: Run one named-vendor ingestion comparison

**Dependencies:** AA090, named authorized environment; **Likely files:** comparison protocol, synthetic/consented fixtures, observations, report; **Scope:** M

- [ ] Compare one named vendor/version/configuration on permitted documents and defined ingestion behaviors without reverse-engineering proprietary scores.
- **Verify:** repeatable observations, limitations, configuration/version, dates, errors, and raw evidence support only the named compatibility statement.

#### AA092: Run one career-center or recruiter pilot

**Dependencies:** AA090, optional AA091; **Likely files:** pilot plan, participant records, outcome rubric, pilot report; **Scope:** M

- [ ] Run an allowlisted advisory pilot measuring rubric agreement, corrections, user comprehension, workflow usefulness, fairness/error, safety, latency, and cost.
- **Verify:** independent review approves scoped findings; no hidden score, automatic decision, general vendor equivalence, or selection-probability claim is enabled.

#### Gate AA9: Scoped recruiter/vendor evidence

- [ ] Pilot evidence supports only the named domain, locale, vendor/configuration, and workflow; ongoing monitoring, appeals, human oversight, and rollback are operational.

## Phase 8: B2C billing and entitlements

### T080: Add entitlement and usage model

**Dependencies:** A4
**Likely files:** migration, entitlement service, usage service, tests
**Scope:** M

- [ ] Plans/limits are versioned and enforced server-side before job/provider use.
- [ ] Usage events are idempotent and reconcilable.
- **Verify:** limit boundary, period reset, duplicate event, downgrade, admin override audit tests.

### T081: Add checkout and customer portal behind a feature flag

**Dependencies:** T080
**Likely files:** billing adapter, checkout/portal routes, pricing UI, tests
**Scope:** M

- [ ] Server creates approved sessions; client never controls price or entitlement.
- [ ] Feature flag defaults off and has owner/expiry.
- **Verify:** test-mode success/cancel/error/expired sessions and unauthorized access.

### T082: Add signed idempotent billing webhooks

**Dependencies:** T081
**Likely files:** webhook route, reconciliation service, event store, tests
**Scope:** M

- [ ] Verify signature on raw body, store event ID, process idempotently, reconcile out-of-order delivery.
- **Verify:** invalid signature, replay, duplicates, reordering, retry, refund, cancellation, dispute tests.

### Checkpoint: Billing launch

- [ ] Finance reconciliation, support states, webhook monitoring, rollback/disable plan, and test-mode E2E pass.
- [ ] Human explicitly authorizes live billing configuration and rollout.

## Phase 9: Enterprise capabilities

### T090: Implement enterprise organization provisioning and role matrix

**Dependencies:** A4, T032
**Likely files:** organization service, admin routes, membership UI, tests
**Scope:** M per slice

- [ ] Verified provisioning, invites, expiry/revocation, admin/member/viewer permissions, offboarding.
- **Verify:** full role matrix, domain/tenant collision, last-admin, expired invite, offboarding tests.

### T091: Add enterprise OIDC and gated SAML adapter

**Dependencies:** T090, pilot requirement
**Likely files:** enterprise IdP adapter, callback/config routes, tests
**Scope:** M

- [ ] Tenant-bound issuer/client configuration, state/nonce/PKCE, claim mapping, certificate/key rotation, break-glass policy.
- **Verify:** login, logout, replay, wrong tenant/issuer/audience, clock skew, rotation, disabled-user tests.

### T092: Add tenant policy controls

**Dependencies:** T090, T074
**Likely files:** policy schema/service, admin policy page, enforcement tests
**Scope:** M

- [ ] Retention, AI use, region, sharing, export and allowed-use policies are server-enforced and audited.
- **Verify:** each policy denies a real operation, not only hides UI; version/change audit tests.

### T093: Add audit search and export

**Dependencies:** T071, T090
**Likely files:** audit query/export service, admin routes, tests
**Scope:** M

- [ ] Tenant-scoped pagination, filters, stable export schema, integrity metadata, retention policy.
- **Verify:** completeness, ordering, authorization, large export, tamper/integrity and PII-minimization tests.

### T094: Implement human-oversight workflow

**Dependencies:** A3, T090, legal/product approval
**Likely files:** review schema/service, reviewer UI, candidate notice/correction UI, tests
**Scope:** M per slice

- [ ] Analysis is advisory; human decision, rationale, correction/appeal and notice are distinct recorded events.
- [ ] Automatic rejection is technically prohibited.
- **Verify:** workflow state/role tests, correction propagation, audit completeness, prohibited automation test.

### T095: Build first allowlisted integration adapter

**Dependencies:** T090-T094, named pilot
**Likely files:** integration interface, provider adapter, webhook route, tests
**Scope:** M

- [ ] Minimal scopes, tenant allowlist, signed callbacks, cursor/idempotency, rate limits, disable switch, no merge/hiring action.
- **Verify:** contract sandbox, replay/signature, permission loss, rate-limit, duplicate, tenant-isolation, disable/offboarding tests.

### Checkpoint A5: Enterprise pilot

- [ ] Independent tenant-isolation/security review passes.
- [ ] Intended-use/legal/privacy review and human-oversight evidence pass.
- [ ] SSO lifecycle, audit export, offboarding, incident communication, restore, and rollback pass.
- [ ] Named pilot, support owner, limits, success metrics, and stop conditions are approved.

## Phase 10: Release and continuous assurance

### T100: Build staged deployment and rollback automation

**Dependencies:** A4 or A5 for respective release
**Likely files:** deployment workflow, feature-flag config, rollback runbook, tests
**Scope:** M

- [ ] Same immutable artifact moves through staging/canary/production.
- [ ] Migrations use compatible sequencing; flags have owner/expiry; rollback is bounded.
- **Verify:** staging deploy, smoke suite, rollback rehearsal, migration compatibility, health/readiness and telemetry checks.

### T101: Execute launch observation window

**Dependencies:** T100, explicit deployment authorization
**Likely files:** release evidence record, incident/runbook updates
**Scope:** S

- [ ] Internal → 5% → 25% → 50% → 100% only while error, latency, client error, cost and business gates remain green.
- [ ] Hold/rollback triggers and decision owner are active.
- **Verify:** dated evidence for each step; no phase marked complete from deployment success alone.

### T102: Establish recurring assurance

**Dependencies:** T101
**Likely files:** operations calendar/policy, dependency/DR/model evaluation workflows
**Scope:** M

- [ ] Scheduled dependency review, access review, restore drill, incident exercise, scoring evaluation, privacy deletion audit, and capacity review.
- **Verify:** first cycle completes with owners, evidence, findings, deadlines, and escalation path.

### Gate A6: Enterprise general availability

- [ ] Pilot objectives and SLOs pass for the approved observation period.
- [ ] Security, privacy, DR, support, procurement, scoring-quality, and operational evidence are approved.
- [ ] Human explicitly authorizes enterprise GA.

## Final verification command set

These commands are targets. Add them in the tasks above before relying on them:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
npm run test:e2e
npm run test:a11y
npm run test:performance
npm audit --omit=dev --audit-level=high
```

Accuracy-v2 target commands do not exist yet and must not be reported as run until their owning `AA*` tasks implement them:

```bash
npm run benchmark:extraction-v2
npm run benchmark:job-intelligence
npm run benchmark:scoring-validity
npm run benchmark:writer-grounding
npm run benchmark:render-parity
npm run benchmark:fairness
npm run verify:accuracy-v2
```

Required non-command evidence:

- [ ] Production-build browser state matrix.
- [ ] Live-provider test with synthetic data and cost record.
- [ ] Tenant-isolation security review.
- [ ] Staging deployment smoke report.
- [ ] Backup restore drill.
- [ ] Rollback rehearsal.
- [ ] Scoring benchmark report.
- [ ] Approved corpus governance, annotation agreement, and locked-partition evidence.
- [ ] Extraction/OCR provider comparison with segment-level confidence intervals, latency, cost, and privacy review.
- [ ] Independent first-domain construct-validity and claim-language review.
- [ ] Writer grounding and unsupported-fact report.
- [ ] PDF/DOCX parse-back and accessibility report; LaTeX security evidence if enabled.
- [ ] Named-vendor/recruiter pilot evidence only when claiming that named scope.
- [ ] Accessibility manual spot check.
- [ ] Privacy export/deletion evidence.
- [ ] Human approval at the active gate.

### Owner-requested browser audit repairs (2026-10-17)

Local bug repairs follow the [browser audit repair report](../docs/evaluation/BROWSER_BUG_REPAIRS_20261017.md). Matching, provenance validation, section import, authoring state, availability counts, downloads, mobile navigation and terminal progress have dedicated regressions. Forward migrations were applied only to the isolated audit database. This work does not close formal accuracy/release gates; source-link import is partial and exports fail closed when targets would disappear. The development crash remains mitigated pending reproduction. No Git publication or hosted deployment is included.
