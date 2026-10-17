# Implementation Plan: Resumide Reliable Product to Enterprise Platform

Status: **PARTIAL; AA0 APPROVED 2026-10-04; AA1 ENGINEERING CLOSED / OWNER ACCEPTED; LOCKED FIELD GATE FAILED; INDEPENDENT VALIDATION DEFERRED; AA2 ENGINEERING CLOSED / VERIFIED LOCALLY; FORMAL GATE OPEN; GATES A0/A4 OPEN**
Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
AA3 status: **LOCAL IMPLEMENTATION DELIVERED; DOMAIN/DATA ACCEPTANCE OPEN**
AA4 status: **LOCAL ENGINEERING COMPLETE AND VERIFIED; FORMAL GATE OPEN**
AA5 status: **LOCAL ENGINEERING COMPLETE, VERIFIED AND OWNER-ACCEPTED 2026-10-14; FORMAL GATE OPEN**
AA6 status: **LOCAL ENGINEERING COMPLETE AND VERIFIED; FORMAL GATE OPEN**
Executable checklist: [`todo.md`](todo.md)
Accuracy-v2 subplan: [`accuracy-authoring-plan.md`](accuracy-authoring-plan.md)
Decision records: [`../docs/decisions/`](../docs/decisions/)

## 1. Objective

Deliver Resumide as a trustworthy candidate-focused resume analysis product, then add monetization and enterprise capabilities behind explicit evidence gates. The current prototype must first become production-operable, secure against upload and AI-cost abuse, durable across refreshes, accessible, observable, and honest about scoring limitations.

This plan does not authorize implementation automatically. Each gate requires human approval. Tasks are implemented as small vertical slices, verified before the next slice, and reported with `IMPLEMENTED`, `VERIFIED`, `PARTIAL`, `BLOCKED`, or `DEFERRED` status.

## 2. Scope

### Included

- Production configuration and dependency remediation.
- Test/CI foundation.
- Authentication, tenant-aware persistence, and private file storage.
- Safe upload, extraction, asynchronous analysis, deterministic scoring, and structured LLM feedback.
- Candidate-facing, evidence-grounded same-page editing, line-by-line suggestions, and immutable resume versions.
- Separate Evidence Confidence, ATS Compatibility, Job Alignment, and optional Application Readiness contracts.
- Canonical resume content with verified PDF/DOCX rendering; sandboxed LaTeX rendering after the core artifact gate.
- Home, upload, progress, result, account/privacy, and billing pages. Enterprise administration remains deferred until Gate A5.
- Accessibility, responsive layout, reduced motion, security, privacy, observability, backup/restore, and deployment controls.
- B2C monetization followed by gated enterprise capabilities.

### Excluded until separately approved

- Automatic candidate rejection or hiring decisions.
- Exact claims of emulating proprietary ATS products.
- Microservices, Kubernetes, event streaming, vector databases, or multi-provider orchestration without measured need.
- Employer integrations before tenant, audit, and privacy foundations pass.
- Cover-letter generation, automatic job application, candidate ranking, or automatic hiring decisions.
- Named-ATS compatibility or recruiter-outcome claims until controlled observation and calibration gates pass.

## 3. Required decisions at Gate A0

The proposed defaults are intentionally reversible:

| Decision          | Proposed default                           | Alternative                     | Approval evidence                              |
| ----------------- | ------------------------------------------ | ------------------------------- | ---------------------------------------------- |
| Product sequence  | Candidate B2C first                        | Immediate enterprise pilot      | Named target user and prohibited use cases     |
| Application shape | React Router modular monolith plus worker  | Separate services               | Expected load and ownership pressure           |
| Database          | Managed PostgreSQL                         | Other relational store          | Regions, backups, RLS, cost                    |
| Identity          | Managed OIDC provider with cookie sessions | Supabase Auth or enterprise IdP | SSO path, tenant model, session policy         |
| File storage      | Private S3-compatible object storage       | Supabase Storage                | Region, malware/quarantine, signed URL support |
| Job queue         | PostgreSQL-backed leased jobs              | Managed queue                   | Volume, retry/ordering needs                   |
| OCR               | Adapter, disabled until provider selected  | Local OCR                       | Accuracy, privacy, cost, regions               |
| Retention         | Configurable policy, explicit consent      | User-only immediate deletion    | Legal/product approval                         |

If a decision is not approved, implement only interfaces and local fakes. Do not silently bind the product to a vendor.

### Gate A0 decision record - 2026-09-09

The workspace owner approved a candidate B2C-first product, Node.js 22 LTS, a React Router modular monolith with separate web and worker processes, and Fly.io deployment in Mumbai. Supabase is selected for PostgreSQL 17, Auth, and private Storage in `ap-south-1`; the Resumide project is active and its initial migrations are deployed. PostgreSQL-backed leased jobs are sized initially for 100 analyses per day and five concurrent analyses. Active resume retention defaults to 30 days, deletion immediately removes active access, and backup copies expire under the provider window. The MVP targets 99.5% monthly availability, a 24-hour RPO, and a 4-hour RTO. OCR remains disabled behind an adapter. The workspace owner holds product, privacy/security, scoring, cost, operations, and release ownership until delegated. Enterprise administration remains deferred.

Still required before Gate A0 can be marked complete: maximum job duration/retry/dead-letter policy, score weights/skipped-rule/claim-language approval, and the initial B2C payment and entitlement model.

## 4. Delivery strategy

Each phase delivers an independently testable vertical capability. The build order follows dependency direction and prioritizes failures that currently make the site appear broken.

```text
Phase 0  Canonical docs and decisions
Phase 1  Production-operable MVP
Phase 2  Automated verification foundation
Phase 3  Durable identity and resume history
Phase 4  Safe asynchronous ingestion and analysis
Phase 5  Versioned and benchmarked scoring
Phase 6  Complete accessible web experience
Phase 7  Security, privacy, and operations readiness
Phase 7A Accuracy-v2, same-page authoring, and verified artifacts
Phase 8  B2C entitlements and billing
Phase 9  Enterprise workspace and governance
Phase 10 Staged launch and continuous assurance
```

## 5. Phase 0: Canonical architecture and project controls

### Outcome

Future agents have one current architecture, one plan, one checklist, explicit status language, and proposed ADRs. Stale documents cannot be mistaken for current implementation truth.

### Deliverables

- `ARCHITECTURE.md`, this plan, and `tasks/todo.md`.
- Proposed ADRs for application shape, data/identity, scoring/AI, and asynchronous jobs.
- Pointers from historical plans and agent guidance.
- Human decisions recorded in ADR status and the Gate A0 record.

### Verification

```bash
rg -n "Status:|Gate A0|Acceptance criteria|Verification" ARCHITECTURE.md tasks docs/decisions
git diff --check
npm run typecheck
```

### Gate A0

Human approves capability boundaries, build order, provider choices or boundaries, product mode, retention assumptions, and proposed quality targets. Documentation creation alone does not pass the gate.

## 6. Phase 1: Production-operable MVP

### Outcome

The existing synchronous demo works in a production-like environment without silent failures or obvious security/cost exposure. This is stabilization, not enterprise completion.

### Workstreams

1. Upgrade React Router packages to a reviewed patched 7.x release; regenerate lockfile and verify SSR/resource routes.
2. Add typed server configuration, startup validation, and deployment-secret instructions. Production processes must receive environment variables explicitly.
3. Add `/healthz` and `/readyz`, stable error codes, request IDs, and generic client-facing server errors.
4. Add server request limits, PDF MIME/signature/page checks, job-description limits, provider timeout, concurrency/rate limits, and a temporary authenticated or invite-only boundary.
5. Fix upload error visibility, file removal, 10/20 MB mismatch, company-name handling, disabled/busy/cancel states, and non-JSON error handling.
6. Fix route semantics, page metadata, malformed result CSS, missing alt text, and basic focus/ARIA issues.
7. Align Docker context/runtime: ignore secrets and Git metadata, pin supported runtime, run non-root, add health check and direct process command.

### Acceptance gate A1

- A clean production-like start receives secrets from process environment and fails readiness without them.
- One synthetic PDF completes through the production HTTP route and result UI.
- Empty, malformed, spoofed, oversized, timeout, provider failure, and duplicate-submit paths show accessible errors and do not trigger uncontrolled spend.
- Missing result/API methods return correct 404/405 statuses.
- No unmitigated reachable critical/high dependency findings remain.
- Browser console has no new errors or warnings in the critical flow.

### Verification

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run typecheck
npm run build
npm run start
curl --fail http://localhost:3000/healthz
curl --fail http://localhost:3000/readyz
```

Run the browser smoke matrix in `todo.md` before approval.

## 7. Phase 2: Automated verification foundation

### Outcome

Every later slice has fast unit feedback, realistic integration tests, browser E2E coverage, accessibility checks, and required CI gates.

### Workstreams

- Add formatter/linter configuration and scripts.
- Add Vitest unit and integration projects with coverage focused on critical domain modules rather than a vanity global percentage.
- Convert self-checks into assertions while preserving useful fixtures.
- Add Playwright production-build E2E tests and axe checks.
- Add a fixture catalog with provenance, expected outcomes, PII classification, and synthetic/anonymized-only policy.
- Add CI: frozen install, audit, typecheck, lint, unit, integration, build, E2E artifact capture, and secret scan.

### Checkpoint

No skipped/red tests, no hidden network dependency in unit tests, deterministic fixtures, and one documented command that reproduces every CI gate locally.

## 8. Phase 3: Durable identity and resume history

### Outcome

A user can authenticate, upload a resume, receive a durable URL, refresh or sign in elsewhere, and see only their authorized data.

### Vertical slices

1. Database migration runner and repository transaction boundary.
2. User/session bootstrap and personal organization creation.
3. Organization membership and role authorization helper.
4. Private object-storage adapter with server-generated keys and short-lived access.
5. Durable resume creation and version record.
6. Server-loaded home history with pagination and empty/error states.
7. Server-loaded result route with correct 403/404 behavior.
8. Consent record, delete workflow skeleton, and audit events.

### Acceptance gate A2

- Refresh and second-session access work for the owner.
- Cross-user and cross-tenant access tests return indistinguishable safe denial responses.
- Files are private and cannot be listed or fetched by guessed keys.
- Creation is transactional or recoverable; orphaned files/records are reconciled.
- Deletion removes active access and tracks remaining retention-bound copies.

## 9. Phase 4: Safe asynchronous ingestion and analysis

### Outcome

Uploads return quickly with a durable analysis ID. A worker owns expensive parsing and AI calls, survives restarts, and exposes explicit progress, partial, retryable, failed, rejected, cancelled, and completed states.

### Vertical slices

1. Analysis state schema and compare-and-set transitions.
2. PostgreSQL-backed job claim, lease, heartbeat, retry, and dead-letter handling.
3. Quarantine/validation stage and checksum-based idempotency.
4. Extraction stage with page/text/time/memory limits.
5. Deterministic scoring stage.
6. LLM provider adapter with structured output validation, timeout, usage, and budget accounting.
7. Partial-result behavior during provider outage.
8. Progress API and polling UI; evaluate SSE only if polling fails measured UX/load goals.
9. Cancellation and worker-recovery scenarios.

### Checkpoint

Kill a worker in each stage and prove the job is reclaimed once, no duplicate AI charge is recorded, and the user reaches a terminal state.

## 10. Phase 5: Versioned and benchmarked scoring

### Outcome

Scores are explainable, versioned, calibrated, and bounded by published limitations.

### Workstreams

- Version parser, normalizer, taxonomy, rules, prompt, model, and output schema.
- Remove free points for skipped rules and add `passed`, `failed`, `not_evaluated`, and confidence semantics.
- Improve multi-word skill matching, aliases, evidence spans, international formats, reading order, table/column warnings, and section aliases.
- Add scanned-PDF detection and an OCR adapter decision.
- Build a representative fixture corpus and benchmark harness.
- Measure field precision/recall, section F1, keyword quality, run variance, latency, cost, and failure rate.
- Review all product copy against measured capability.

### Acceptance gate A3

Human product/scoring owners approve benchmark thresholds, limitations, score-band meanings, and claims. Regression thresholds block ruleset/model rollout.

**Gate record (2026-09-11):** PASS. The synthetic Phase 5 benchmark passed the approved quality, failure-rate, and p95 deterministic-latency thresholds. Score bands and ATS-like guidance limitations are reflected consistently in the product copy. Human scoring/product approval was recorded under the explicit instruction to complete A3; broader anonymized-corpus and proprietary-ATS claims remain out of scope.

## 11. Phase 6: Complete accessible web experience

### Outcome

Every route and state is usable on keyboard, screen reader, laptop, tablet, and mobile; motion is correct and optional.

### Page slices

- Shared shell, navigation, skip link, metadata, error boundary, and session states.
- Home/history with pagination, sorting, loading, empty, error, and retry states.
- Upload with validation, consent, progress, cancellation, retry, and duplicate-submit prevention.
- Progress page for queued and running analysis.
- Result summary with partial/error states and durable navigation.
- Multi-page Parse View with evidence/confidence and limitation messaging.
- True resume keyword overlay or renamed coverage view.
- Accessible details/accordion, scores, progress bars, and downloadable report.
- Candidate writing suggestions for summaries and existing experience bullets, with source-evidence and accuracy review messaging.
- Account, consent, export, and deletion pages.

### UI verification matrix

- Viewports: 390, 768, 1024, 1366, and 1440 CSS pixels.
- Input: mouse, keyboard-only, touch-sized targets.
- Preferences: reduced motion, zoom 200%, high contrast where supported.
- States: initial, empty, loading, success, partial, validation error, offline/network error, unauthorized, forbidden, missing, rate-limited, provider outage.
- Quality: zero console errors/warnings, axe has no serious/critical violations, correct focus movement and live announcements.

### Phase 6 implementation checkpoint - 2026-09-11

T060-T066 are implemented in the current checkout. Current evidence includes
190 passing Vitest tests, production build/type/lint/format gates, 44 passing
Playwright tests including accessibility and Phase 6 coverage, configuration
and upload self-checks, and hosted tenant/storage/persistence smoke checks.
Authenticated re-authentication, completed export artifact delivery, live
deletion-worker execution, and live provider output remain A4 evidence.

## 12. Phase 7: Security, privacy, and operations readiness

### Outcome

The candidate product can be operated safely with known SLOs, incident procedures, recoverable data, and privacy controls.

### Workstreams

- Threat model and abuse-case tests for browser, upload, storage, queue, LLM, admin, identity, and webhooks.
- Security headers, cookie/session hardening, CSRF/origin enforcement, secret rotation, restricted egress, dependency/container scanning.
- Consent, purpose limitation, retention automation, data export/correction/deletion, subprocessor inventory, and PII-safe telemetry.
- Structured logs, metrics, traces, dashboards, SLO/error-budget alerts, cost anomaly alerts, and runbooks.
- Backup policy, restore automation, restore drill, RPO/RTO approval.
- Load, soak, chaos/recovery, and capacity tests.

### Acceptance gate A4

Security/privacy review, production readiness review, restore evidence, monitored staging E2E, rollback rehearsal, and user-facing policy approval are complete.

### Phase 7 implementation checkpoint - 2026-09-11

The Phase 7 implementation is complete: security boundaries, privacy workers
and migration, PII-safe observability, queue-age metrics, checked-in SLO alert
rules, recovery/load evidence, OpenAI egress policy, and container
hardening/scan CI are implemented and covered by local checks. Hosted schema
migrations, tenant/RLS, private-storage, and Phase 4 persistence smoke checks
also pass. A4 remains open because hosted restore, notification delivery,
monitored staging E2E, rollback rehearsal, policy approval, human
security/operations approval, live provider verification, and deployment-owned
controls require external evidence.

## 12A. Phase 7A: Accuracy-v2, same-page authoring, and verified artifacts

### Outcome

Candidates receive evidence-backed guidance that clearly distinguishes whether the document was read reliably, whether it is structurally compatible with common ATS ingestion, and how well it matches a specific job. They can edit the resume on the result page, accept only fact-supported suggestions, and export a PDF or DOCX whose content is parsed back and verified. LaTeX follows as a sandboxed renderer, not as the source of truth.

This phase is specified in [`accuracy-authoring-plan.md`](accuracy-authoring-plan.md) and [`../docs/ATS_SCORING_AND_AUTHORING_SPEC.md`](../docs/ATS_SCORING_AND_AUTHORING_SPEC.md). Its numeric floors are in [`../CONSTRAINTS.md`](../CONSTRAINTS.md). ADR-0006/0007 AA0 design is accepted through [`ADR-0009`](../docs/decisions/0009-aa0-truth-contract-and-evaluation-design.md), explicitly approved 2026-10-04. First review provisional AA010/AA011 for contract conformity; each later implementation retains its own prerequisites and acceptance gates.

### Dependency order

1. **AA0 Truth contract:** approve score meanings, legacy-score treatment, corpus governance, first occupation/domain, first locale, artifact formats, and OCR bake-off protocol.
2. **AA1 Document evidence:** native extraction, scanned-page detection, provider bake-off, OCR normalization, geometry, reading order, field evidence, and confidence gating.
3. **AA2 Canonical resume:** template-independent structured content, fact provenance, immutable versions, and change records.
4. **AA3 Job intelligence:** typed requirements, explicit-versus-inferred importance, versioned O*NET/ESCO concepts, aliases, domain packs, and evidence citations.
5. **AA4 Scoring v2:** deterministic, versioned ATS Compatibility and Job Alignment with counterfactual, stuffing, duplication, and prompt-injection resistance.
6. **AA5 Authoring:** result-page editor, line-level diagnostics, fact-safe rewrite contracts, multiple bullet patterns including XYZ, impact review, undo, compare, and re-score.
7. **AA6 Verified artifacts:** PDF/DOCX render adapters, overflow/link checks, parse-back parity, accessible output, and artifact evidence.
8. **AA7 LaTeX:** reviewed templates and a networkless resource-bounded compiler after AA6 passes.
9. **AA8 Domain validity:** locked representative per-segment corpus, independent review, expert agreement, fairness/error analysis, and claim review.
10. **AA9 Recruiter/vendor pilot:** optional controlled observation for recruiter calibration or a specifically named ATS claim; no automatic hiring action.

### Gates

- **AA0** must pass before implementation. Documentation alone does not pass it.
- **AA1-AA7** require their focused correctness, security, privacy, accessibility, performance, and artifact evidence before the next dependent phase.
- **AA8** must pass before the product uses “industry-level,” “industry-standard,” or generalized recruiter-validity language.
- **AA9** must pass before any named vendor compatibility or recruiter/outcome-calibrated claim.
- The existing A3 pass remains a synthetic regression baseline only; it is not evidence for AA8 or AA9.

### Verification

Each `AA*` task and its required evidence is tracked in [`todo.md`](todo.md). Planned Accuracy-v2 commands are targets until the corresponding task implements them; `npm run benchmark:phase5` remains the current synthetic baseline.

## 13. Phase 8: B2C entitlements and billing

### Outcome

Plans and quotas are enforced server-side and billing failures never corrupt access or usage data.

### Vertical slices

1. Entitlement model and read-only plan display.
2. Server-side analysis quotas and cost ledger.
3. Checkout/portal integration behind a feature flag.
4. Signed webhook verification and idempotent reconciliation.
5. Grace, cancellation, refund, retry, and support states.
6. Billing observability and financial reconciliation.

No billing task begins until A4 passes and the commercial model is approved.

## 14. Phase 9: Enterprise workspace and governance

### Outcome

Approved pilot organizations can manage members and advisory resume workflows with isolation, auditability, policy controls, and human oversight.

### Vertical slices

- Organization provisioning and verified domains.
- Admin/member/viewer role matrix and invite lifecycle.
- Enterprise OIDC first; SAML only when a pilot requires it.
- Tenant-configurable retention, AI processing, region, and export policies.
- Audit-event search/export with tamper-evident retention controls.
- Career-center/advisor workflow before employer-ranking features.
- Employer use-case guardrails, candidate notice, human review, appeal/correction path.
- One integration adapter behind narrow scopes and a tenant allowlist.
- Enterprise support, incident communication, status, and offboarding runbooks.

### Acceptance gate A5

Independent tenant-isolation/security test, legal review of intended use, SSO lifecycle test, audit completeness test, pilot rollback/offboarding plan, and named support ownership.

## 15. Phase 10: Launch and continuous assurance

### Rollout

1. Deploy to staging and run full production-build suites.
2. Deploy production artifact with feature flags off.
3. Verify health, readiness, migrations, logs, metrics, and rollback.
4. Enable internal users; monitor a full agreed window.
5. Canary 5%, then 25%, 50%, and 100% only while gates remain green.
6. Hold or roll back on security findings, data-integrity risk, new client errors, SLO burn, latency regression, cost anomaly, or business-metric regression.
7. Remove expired flags and update architecture/status evidence.

### Enterprise GA gate A6

Pilot SLOs, incident response, disaster recovery, support, security/privacy evidence, procurement documents, and product outcomes are approved. No automatic transition from pilot to GA.

## 16. Cross-phase Definition of Done

A task is complete only when:

- Acceptance criteria pass with attached evidence.
- Focused tests, full relevant suite, typecheck, lint, and build pass.
- Runtime behavior is checked at the appropriate layer.
- Security/privacy impact is reviewed.
- Logs contain no secrets or resume body.
- Documentation, schemas, migrations, API contracts, and task status are updated.
- No unrelated files are changed.
- Rollback or compatibility behavior is stated.
- `VERIFIED` is not used for unrun live-provider, browser, staging, restore, load, or deployment checks.

## 17. Risks and mitigations

| Risk                                            | Impact   | Mitigation                                                                                                         |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| Prototype expands into a rewrite                | High     | Preserve modular monolith and vertical slices; gate new services                                                   |
| AI costs are abused                             | Critical | Auth, shared rate limit, quota, concurrency cap, token cap, kill switch                                            |
| Resume PII leaks                                | Critical | Private storage, consent, least privilege, short URLs, redacted logs, deletion                                     |
| Scoring claims exceed evidence                  | High     | Benchmarks, versioning, limitation copy, human approval                                                            |
| Extraction loses or misorders evidence          | Critical | Native/OCR benchmarks, geometry, confidence gates, page citations, unsafe-state blocking                           |
| LLM invents or strengthens facts                | Critical | Fact ledger, typed suggestion patches, evidence citations, candidate confirmation, zero unsupported accepted facts |
| Job matching stays generic or technology-biased | High     | Typed requirements, versioned O*NET/ESCO concepts, domain packs, adjudicated per-domain evaluation                 |
| Export differs from the editor                  | Critical | Canonical source of truth, deterministic rendering, parse-back verification, artifact quarantine on failure        |
| Aggregate metrics hide segment failure          | High     | Locked per-segment reports, confidence intervals, fairness/error review, no aggregate-only gate                    |
| Evaluation corpus exposes PII                   | Critical | Provenance registry, synthetic or de-identified defaults, access limits, retention and deletion controls           |
| Async jobs duplicate charges                    | High     | Idempotency, leases, attempt ledger, provider request correlation                                                  |
| Vendor lock-in                                  | Medium   | Narrow adapters and proposed ADRs; avoid lowest-common-denominator abstractions                                    |
| UI polish hides broken states                   | High     | State matrix and production-build E2E gates                                                                        |
| Tenant isolation fails                          | Critical | Central authz helper, RLS/policies, adversarial integration tests                                                  |
| Docs drift again                                | Medium   | Canonical pointers, CI link checks, status updates in each PR                                                      |

## 18. Handoff rules for implementation agents

1. Read `CONSTRAINTS.md`, `ARCHITECTURE.md`, this plan, the relevant ADR, and only the active task section. For an `AA*` task, also read the Accuracy-v2 spec and subplan.
2. Confirm the active gate is approved; otherwise stop at design/interfaces.
3. Inspect Git state and preserve user-owned changes.
4. Implement the smallest unblocked task ID from `todo.md`.
5. Use tests first for defects and domain behavior.
6. Do not combine dependency upgrades, refactors, schema changes, and features in one task.
7. Record commands and results; distinguish local, mocked, live-provider, browser, staging, and production evidence.
8. Update task status only after acceptance and verification. Never mark an entire phase complete from a single happy-path test.
9. Stop on contradictory specs, provider choices, data-retention decisions, or cross-task file conflicts.
10. Require human approval at every architecture and release gate.

### AA2 engineering authorization (2026-10-11)

The owner accepts the AA1 engineering closeout and authorizes AA020–AA024
engineering under [ADR-0012](../docs/decisions/0012-aa2-engineering-sequencing-approval.md)
and exception E-003. The AA1 locked field gate remains failed, confidence remains
uncalibrated and unsafe evidence remains unscored. AA020 starts with the strict
canonical draft contract; persistence and integrity checks remain separate work.

**2026-10-12 AA2 implementation:** AA020–AA024 now include tenant-bound
immutable persistence, source-preserving import, optimistic concurrency,
confirmation and unsupported-fact guards, private history/compare UI, privacy
export/deletion and populated local restore. Completed local verification is
tracked in the [AA2 closeout](../docs/evaluation/AA2_ENGINEERING_CLOSEOUT.md).
Formal Gate AA2 acceptance remains separate from engineering completion under
E-003; the failed AA1 field gate and calibration obligations are unchanged.

### AA1 final engineering closeout (2026-10-11)

The owner directed AA1 wrap-up before further AA2 implementation. AA010–AA015
engineering is closed and owner-accepted; the [final report](../docs/evaluation/AA1_ENGINEERING_CLOSEOUT.md)
contains the completed task matrix and acceptance obligations AA1-R1–R5.
Gate AA1 is NOT PASSED: locked field accuracy fails and representative validation
and calibration remain deferred. Existing AA020 draft work and its authorization
are preserved; no additional AA2 implementation was performed in this closeout.

### AA3 local implementation (2026-10-12)

The owner requested progression to AA3 after AA2 localhost verification. The
JD review route, exact source/importance contract, immutable transactional
persistence, bounded model-proposal fallback, offline pinned taxonomy boundary,
candidate first-domain pack, disabled-without-approval market contract and
synthetic benchmark are implemented. [AA3 status](../docs/evaluation/AA3_ENGINEERING_STATUS.md)
records the measured local tier. Domain pack review, real taxonomy adoption and
mapping quality, representative validity and calibration remain formal gate
requirements. Hosted deployment and launch remain the final project step.

### AA4 local engineering (2026-10-12)

Owner-accepted E-004 authorizes AA040–AA046 synthetic localhost engineering while upstream formal gates remain open. The versioned diagnostics engine/read model, source-bound readiness, technical traces, typed alignment, cited prose without numeric model authority, legacy presenter and validity/error/bootstrap harness are implemented. The default-off `SCORING_V2_ENABLED` route has no numeric scoring activation, no new storage migration and no readiness aggregate. See [AA4 closeout](../docs/evaluation/AA4_ENGINEERING_CLOSEOUT.md) for actual verification and the remaining formal calibration/domain/expert/fairness/comprehension obligations.

### AA5 local authoring (2026-10-12)

Owner-approved ADR-0014/E-005 permits AA050–AA057 local engineering. The default-off analysis editor, finding navigation, strict suggestion/clarification contracts, grounded patterns, transactional authoring ledger, candidate undo/restore and synthetic adapter benchmark are implemented. Numeric deltas remain withheld and actual model/candidate/domain evaluation remains open. See [AA5 closeout](../docs/evaluation/AA5_ENGINEERING_CLOSEOUT.md) and [authoring design](../docs/design/CANDIDATE_AUTHORING_WORKSPACE.md).

### AA6 local verified core rendering (2026-10-14)

Owner-approved [ADR-0015](../docs/decisions/0015-aa6-local-engineering-sequencing.md) permits local AA060–AA065 engineering. Private, default-off semantic preview and shared PDF/DOCX templates parse generated bytes back before download. The known-synthetic matrix passes; representative corpus, approved viewer and assistive-technology acceptance remain open. See [AA6 closeout](../docs/evaluation/AA6_ENGINEERING_CLOSEOUT.md).
