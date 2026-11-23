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

Candidates receive evidence-backed guidance that clearly distinguishes whether the document was read reliably, whether it is structurally compatible with common ATS ingestion, and how well it matches a specific job. They can edit the resume on the result page, accept only fact-supported suggestions, and export a PDF or DOCX whose content is parsed back and verified. The owner scoped AA7 on 2026-10-30 to an independent LaTeX-to-PDF editor/converter under ADR-0016/E-007; it does not consume canonical records or integrate with analysis.

This phase is specified in [`accuracy-authoring-plan.md`](accuracy-authoring-plan.md) and [`../docs/ATS_SCORING_AND_AUTHORING_SPEC.md`](../docs/ATS_SCORING_AND_AUTHORING_SPEC.md). Its numeric floors are in [`../CONSTRAINTS.md`](../CONSTRAINTS.md). ADR-0006/0007 AA0 design is accepted through [`ADR-0009`](../docs/decisions/0009-aa0-truth-contract-and-evaluation-design.md), explicitly approved 2026-10-04. First review provisional AA010/AA011 for contract conformity; each later implementation retains its own prerequisites and acceptance gates.

### Dependency order

1. **AA0 Truth contract:** approve score meanings, legacy-score treatment, corpus governance, first occupation/domain, first locale, artifact formats, and OCR bake-off protocol.
2. **AA1 Document evidence:** native extraction, scanned-page detection, provider bake-off, OCR normalization, geometry, reading order, field evidence, and confidence gating.
3. **AA2 Canonical resume:** template-independent structured content, fact provenance, immutable versions, and change records.
4. **AA3 Job intelligence:** typed requirements, explicit-versus-inferred importance, versioned O*NET/ESCO concepts, aliases, domain packs, and evidence citations.
5. **AA4 Scoring v2:** deterministic, versioned ATS Compatibility and Job Alignment with counterfactual, stuffing, duplication, and prompt-injection resistance.
6. **AA5 Authoring:** result-page editor, line-level diagnostics, fact-safe rewrite contracts, multiple bullet patterns including XYZ, impact review, undo, compare, and re-score.
7. **AA6 Verified artifacts:** PDF/DOCX render adapters, overflow/link checks, parse-back parity, accessible output, and artifact evidence.
8. **AA7 standalone converter:** source-preserving editor/PDF preview/download, reviewed examples and isolated compiler under owner-approved E-007 sequencing. Local engineering is complete and verified; formal release/security/accessibility gates remain open. See [closeout](../docs/evaluation/AA7_ENGINEERING_CLOSEOUT_20261030.md).
9. **AA8 - COMPLETE (prerelease engineering):** permitted intake/lifecycle, annotation, immutable partitions, calibration, locked evaluation, evidence cards and guarded claims/monitors are implemented and verified under ADR-0018. Representative domain-validity research remains a release requirement.
10. **AA9 - COMPLETE (prerelease engineering):** transparent advisory protocol, controlled comparison adapters and correction/appeal/audit/stop/rollback workflows are implemented and verified. Actual vendor/customer/recruiter runs remain owner-deferred; no automatic hiring action is enabled.

### Gates

- **AA0** must pass before implementation. Documentation alone does not pass it.
- **AA1-AA7** require their focused correctness, security, privacy, accessibility, performance, and artifact evidence before the next dependent phase.
- **AA8** must pass before the product uses “industry-level,” “industry-standard,” or generalized recruiter-validity language.
- **AA9** must pass before any named vendor compatibility or recruiter/outcome-calibrated claim.
- The existing A3 pass remains a synthetic regression baseline only; it is not evidence for AA8 or AA9.

### Verification

Each `AA*` task and its required evidence is tracked in [`todo.md`](todo.md). Current AA8/AA9 completion is indexed in [plan.plan.md](../plan.plan.md) and [tutorial.md](../tutorial.md), with [verified closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md). Deferred empirical/claim/launch requirements are tracked in [release readiness](aa8-aa9-release-readiness.md), separate from the complete engineering gates. Planned Accuracy-v2 commands are targets until the corresponding task implements them; `npm run benchmark:phase5` remains the current synthetic baseline.

## 12B. Consumer reliability remediation — planning requested 2026-11-09

Latest coupled source checkpoint: rewrite compatibility and factual feedback pass 218 tests/twelve files plus full types, lint and web/worker builds on 851 stable inputs. Original scoring guards remain intact; canonical usage cannot disappear behind the old counter, and source quotes alone no longer validate invented feedback. Native behavior, fresh-workspace bootstrap, owned feedback persistence/consumer adoption and full reliability acceptance remain open. [Evidence and next work](agent-handoffs/2026-11-09-reliability-implementation/a12-compat-a13-core-closeout.md).

Latest rewrite checkpoint: CR-A12 source and its owned score-page consumer pass 351 tests/nineteen files plus full types, lint and web/worker builds on 838 stable inputs. Mandatory once-dispatch, known/unknown usage, exact receipt recovery, current/historical provenance and honest legacy labels are integrated. SQL remains unparsed/unexecuted, mutators denied and flags off. Broader useful rewriting, initial feedback/Build truth boundaries and native/full consumer acceptance remain open. [Evidence and next work](agent-handoffs/2026-11-09-reliability-implementation/a12-rewrite-closeout.md).

Latest A11 checkpoint: authoring-only 1.1 confirmed declarations are integrated through owned consumers with truthful provenance and versioned replay/undo. One gate passes 229 tests/sixteen files plus full types, lint and web/worker builds on 816 stable inputs. The old contract, semantic/coverage rules and codec stay unchanged. Native SQL, broader useful writing, remaining AI surfaces and full consumer acceptance stay open; writer execution remains denied. [Evidence and next work](agent-handoffs/2026-11-09-reliability-implementation/a11-declaration-closeout.md).

**Status: IMPLEMENTATION ACTIVE; owner approved 2026-11-09 after plan review.** The owner requested a complete plan before implementation after the [consumer audit](../docs/evaluation/CONSUMER_VALIDATION_20261109.md). The [master repair plan](reliability-remediation-plan.md), [dependency/traceability index](reliability-remediation-plan.json) and canonical CR task checklist in [todo.md](todo.md#consumer-reliability-remediation-plan) extend this same consumer repair work without replacing earlier phases or closing their gates.

The plan maps every CV01–CV08 finding and unverified capability, plus source-review risks, to 64 bounded work items/evidence checkpoints with all 62 reviewer proposals covered. Three tracks address trustworthy evidence/AI/JD, consumer workflows and worker/security/operations; shared contracts and migrations stay coordinator-owned. The owner has now authorized implementation with proper validation. Track bounded source repairs separately from actual runtime, empirical-validity and release evidence; the original planning receipt stays historical.

Immediate priorities are preserved red regressions, target-bound correction materialization, semantic fact/relationship support, API/compiler availability and real OCR integration/quality. Existing healthy code remains the baseline. Local engineering, real runtime/live-provider proof, empirical score validity and later operations/release are separate closure gates. Pricing stays deferred and all services free of commercial charges. No Docker database/reset, publication or deployment is authorized. Prepare new hosted-target/DDL/provider-scope packets at their actual boundary; reuse existing scoped testing authorization.

R04-R06 default-off caller preparation is now integrated: shared reservation/first-claim/settlement and server-allocated provider ordinals, with 169 affected tests/10 files plus source/type/lint/build checks. The configured Supabase project was reachable in one read-only catalog check; its ledger tables/RPCs are absent. SQL execution, isolation, concurrency, cutover and privacy remain open. See the [bounded integration report](agent-handoffs/2026-11-09-reliability-implementation/r04-r06-entrypoints-closeout.md). Do not repeat unchanged full-suite or live-provider campaigns.

R07-R10 source preparation is also integrated, including the actual stage signal/token propagation and typed SQL wrapper. A single affected gate passed 123 tests/14 files and the required source/type/lint/build checks. The new branches remain disabled; real SQL, queue/recovery and privacy acceptance are open. [Report](agent-handoffs/2026-11-09-reliability-implementation/r07-r10-admission-worker-closeout.md).

R11/R19 source preparation and application consistency repairs are integrated. One affected gate passed 117 tests/12 files, full typecheck/lint and both builds. Exact source-body/policy guards and terminal recovery are unexecuted SQL, not concurrency or privacy acceptance. [Report](agent-handoffs/2026-11-09-reliability-implementation/r11-r19-privacy-recovery-closeout.md).

R11 preclaim readiness now passes 19 affected tests plus full typecheck/lint/web/worker builds. No unchanged gate will be repeated. Native read-only metadata confirms missing cancellation and older transition routines, with partially applied historical semantics that make blanket replay unsafe. The [next compatibility repair](agent-handoffs/2026-11-09-reliability-implementation/r11-native-compatibility-prerequisites.md) is source preparation only until a concrete hosted action is admitted. R11 and full reliability acceptance remain open.

The subsequent cancellation repair now passes 13 focused cases, full typecheck/lint and both builds. The forward-only three-function compatibility bridge is source-integrated with an independent ACK; [its exact hosted action](agent-handoffs/2026-11-09-reliability-implementation/legacy-worker-hosted-action.md) awaits an owner decision. No SQL or deployment occurred. Native behavior and the full reliability gate remain open.

A11 layout comparison now retains otherwise supported ligature/soft-hyphen prose and square-bullet entries. One affected gate passed 378 tests/12 files plus types/lint/web/worker; fresh OCR sources passed integrity checks without recognition or quality claims. The [closeout](agent-handoffs/2026-11-09-reliability-implementation/writing-layout-ocr-closeout.md) also records the current correction-protocol amendment needed before A04. The pending hosted question is unchanged.

C02/A04/U01/U02 now have integrated correction source and UI: source-specific targets, separate assignment/apply/add/reapply, immutable history and transaction-fresh original import after a superseding confirmation. The [A04 closeout](agent-handoffs/2026-11-09-reliability-implementation/a04-closeout.md) records 282 tests/21 files plus full types/lint/web/worker. Type-only compatibility preserved emitted JavaScript, so passing behavioral tests were not repeated. All SQL/operator source is unparsed/unapplied/unexecuted; flags remain off and native/browser/cutover gates remain open. At the A04 checkpoint, totals were 2 VERIFIED, 29 PARTIAL and 33 PLANNED; the 64 IDs and dependencies remained unchanged. This is scoped source/application progress, not full plan or release acceptance.

CR-U03 now has integrated exact-value review and rejected-draft recovery. Clarification displays the complete fact before its separate native confirmation; canonical failures preserve exact retries and offer a separately reviewed attempt against the current head. The initial combined gate passed 100 tests in seven files. Review then reproduced unrelated-draft loss; the final affected gate passed 47 canonical cases plus full types, lint and web/worker builds. All 703 recorded inputs were stable, and Root verified the log, two artifacts and five exited process groups. The 60 unchanged authoring cases were carried forward by exact source comparison, giving 107 unique cases across the two receipts; no fresh full-suite pass is claimed. See the [U03 closeout](agent-handoffs/2026-11-09-reliability-implementation/u03-closeout.md). Native browser, managed storage/concurrency, export and consumer acceptance remain open. At the U03 checkpoint, CR-U03 was PARTIAL and totals were 2 VERIFIED, 30 PARTIAL and 32 PLANNED; the 64 IDs and dependencies are unchanged. Pricing and deployment remain stopped.

CR-U18 now has an integrated confirmed-link replacement repair. A real synthetic corrected email reaches PDF and DOCX through the owned repository; independent output parses preserve the new text/target and exclude the old target. Exact plan/source/confirmation and bounded owned immutable lineage permit only the intended replacement, while unsafe or unexplained missing links remain blocked. One integrated gate passed 45 tests in four files plus full types, lint and web/worker builds. Root independently verified all 704 inputs, the log, two artifacts and five exited process groups. See the [U18 closeout](agent-handoffs/2026-11-09-reliability-implementation/u18-closeout.md). Native browser, managed storage/concurrency and full consumer acceptance remain open. At the U18 checkpoint, CR-U18 was PARTIAL and totals were 2 VERIFIED, 31 PARTIAL and 31 PLANNED, with all 64 IDs/dependencies unchanged. Pricing and deployment remain stopped.

A10 now distinguishes exact recorded declarations from missing source proof or skill proficiency under diagnostic producer `score-v2/1.0.2`, without changing numerical admission. U04 now makes explicitly selected historical JD views read-only while preserving current native form/CAS fields. One combined gate passed 66 tests in five files plus full types, lint and web/worker builds; Root verified all 706 inputs, the log, two artifacts and five exited process groups. See the [JD review closeout](agent-handoffs/2026-11-09-reliability-implementation/jd-review-closeout.md). Full A09/A10/A15/U04 and native consumer acceptance remain open. Current totals are 2 VERIFIED, 33 PARTIAL and 29 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A02-S02 private source/placement preparation and CR-U10 rewrite feedback are now integrated. One combined local gate passed 234 tests in five files plus full types, lint and web/worker builds; Root rehashed all 726 inputs, the log, both artifacts and five absent process groups. The source corpus has 61 valid JS oracles and 47 placement oracles; all SQL remains unparsed, unapplied and unexecuted. Rewrite failure feedback preserves actual three-case DOM RED and distinguishes safe published codes without changing consent, drafts or requests. See the [source and feedback closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-source-u10-closeout.md). Full A02/U10, native/storage/browser/live and release acceptance remain open. Totals are 2 VERIFIED, 35 PARTIAL and 27 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A02-S02 ledger/privacy and atomic admission source, plus Build failure feedback, are integrated. The initial gate passed 308 of 309 tests and exposed one stale schema reader; its guarded-transition repair passed seven affected cases plus full types, lint and web/worker builds. Exact source comparison carries the unchanged 308 cases, yielding 315 unique passing cases across two receipts, not a fresh full-suite pass. Root rehashed 733 current inputs, both logs/artifacts and six exited groups. SQL remains unparsed/unapplied/unexecuted; the new writer is revoked and server/route/native admission remains open. See the [atomic source closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-atomic-import-closeout.md). Totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A02-S02/U01 grouped first-import review is now integrated at the local source/mock/DOM/build tier. One fresh affected gate passed 268 tests in seven files plus full types, lint and web/worker builds; Root verified 737 stable inputs, the log, both artifacts and five exited groups. The UI preserves exact retries across ambiguous saves/reloads and invalidates old previews after edit/revert or history restoration. See the [consumer closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-consumer-closeout.md). SQL remains unparsed/unapplied/unexecuted and the writer remains revoked. Existing-head regrouping and native/storage/browser/full consumer acceptance remain open. Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment stay on hold.

CR-A02-S02 now includes verified pure whole-entry regroup preparation and its structural diff. One fresh gate passed 58 tests in two files plus full types, lint and web/worker builds; all 741 inputs were stable and all 737 prior consumer inputs remain unchanged. Current facts and confirmations survive partial, already-grouped and bullet-bearing entry merges, with full ordering and retired-entry review. This creates no saved version or route: durable multi-origin approval, actual consumer wiring and native acceptance remain open. See the [preparation closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-preparation-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED.

CR-A02-S02/C02 now has a separate whole-entry regroup metadata foundation and paired privacy consumer. One fresh gate passed 65 tests in three files plus full types, lint and web/worker builds; 744 inputs stayed stable and only the two allocated privacy files changed among the previous 741 inputs. The actual omission RED is fixed: all fifteen owned metadata collections are required and preserved. Five new stores and guarded profile70 are source-integrated, not applied SQL. Semantic admission, saving, native lifecycle and actual regroup consumer wiring remain open. See the [ledger/privacy closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-ledger-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment remain on hold.

CR-A02-S02 now includes strict whole-entry regroup commands and four private SQL preparation helpers. One fresh gate passed 47 tests in two files plus full types, lint and web/worker builds; all 748 inputs stayed stable and all 744 prior ledger inputs are unchanged. The real 32-group/96-member request fits its wire and framing limits. Original base/capture identity is preserved; this creates no saved version or route. SQL remains unparsed/unapplied/unexecuted. See the [command closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-command-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment stay on hold.

CR-A02-S02/U01 saved-entry regroup admission is paired-integrated with its SQL proof/lifecycle/readiness, `.4` SDK/schema and actual canonical page. One fresh local gate passed 230 tests in seven files plus full types, lint and web/worker builds; all 755 inputs stayed stable. Exact retries, full-entry acknowledgement and explicit local retry-detail recovery are covered. SQL remains unparsed/unapplied/unexecuted; app writer execution and default flags remain off. See the [admission closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-admission-closeout.md). Native/storage/browser and release acceptance remain open; parent totals stay 2 VERIFIED, 35 PARTIAL and 27 PLANNED. Pricing and deployment stay on hold.

CR-R01-S02 now has one explicit bounded doctor model-access interface and an import-safe legacy delegate. One fresh local gate passed 75 tests in one file plus full types, lint and web/worker builds; all 755 inputs stayed stable, with only four allocated changes among the previous inputs. All 31 original offline cases remain. Actual deadline and SDK colon-path counterexamples are fixed. See the [doctor closeout](agent-handoffs/2026-11-09-reliability-implementation/r01-doctor-closeout.md). Tests use the installed SDK with fake fetch; no new live authentication or writing usefulness is claimed. Parent totals stay 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment remain on hold.

CR-U11 now has verified actual-route compile recovery: distinct missing-runtime/service-recovery guidance and safe unknown/inherited error handling. One fresh gate passed 24 DOM cases in one file plus full types, lint and web/worker builds; all 756 inputs stayed stable, and only the allocated route changed among the previous 755 inputs. See the [Build recovery closeout](agent-handoffs/2026-11-09-reliability-implementation/u11-compile-recovery-closeout.md). Actual compiler restoration, quarantine cleanup, PDF/browser and full U11 acceptance remain open. Parent totals are now 2 VERIFIED, 36 PARTIAL and 26 PLANNED across the unchanged 64 tasks; pricing and deployment stay on hold.

CR-A10 now has an integrated strict owned header relationship reader prerequisite: 88 synthetic/fake-RPC cases in one file plus full type checking, lint and web/worker builds passed. The previous 756 source inputs remain unchanged. [Reader closeout](agent-handoffs/2026-11-09-reliability-implementation/a10-relationship-context-closeout.md) retains source fixes and all failed receipts. Native SQL was not run; semantic witnesses, typed coverage/consumer and separate authoring binding remain open. Parent totals remain 2 VERIFIED, 36 PARTIAL and 26 PLANNED.

CR-A10 semantic and duration prerequisites are now integrated: 158 cases in three files plus full types/lint/web/worker builds passed. [Closeout](agent-handoffs/2026-11-09-reliability-implementation/a10-semantic-evidence-closeout.md) preserves genuine attribution/date/quote failures and distinguishes source clauses from declarations. Actual typed coverage tests and its server/route/UI consumer are in progress; numeric, native and authoring acceptance remain open. Parent totals are unchanged at 2 VERIFIED, 36 PARTIAL and 26 PLANNED.

CR-A10 now has an integrated actual typed readmodel and read-only diagnostics consumer. A fresh 347-case/17-file gate plus full types/lint/web/worker builds passed; 776 inputs stayed stable. [Closeout](agent-handoffs/2026-11-09-reliability-implementation/a10-typed-consumer-closeout.md) records explicit source-derived JD duration binding beside unchanged saved output, provenance/dedup/UI repairs, legacy compatibility and the reviewed obsolete-pause expectation transition. Native/representative acceptance and typed proposal binding remain open; authoritative dimensions remain null and defaults off. Parent totals stay 2 VERIFIED/36 PARTIAL/26 PLANNED; full reliability goal remains active.

CR-A11 pre-dispatch admission is now integrated. A fresh 25-case/two-file gate and full types/lint/web/worker builds pass; 778 inputs remained stable. [Closeout](agent-handoffs/2026-11-09-reliability-implementation/a11-preflight-closeout.md) preserves actual stale/typed/ambiguous dispatch failures, one valid control and the original assertions. The complete typed proposal contract, structural support, atomic apply path, consumer and usefulness evidence remain required. This helper validates supplied snapshots, not database ownership; typed proposals remain paused. Parent totals stay 2 VERIFIED/36 PARTIAL/26 PLANNED.

## 13. Phase 8: B2C entitlements and billing

**Owner deferral, 2026-11-09:** Pricing implementation waits for full testing and consumer feedback. All services currently remain free of commercial charges. Preserve the future terms below without activating quotas, checkout or paid AI restrictions. The [consumer validation round](../docs/evaluation/CONSUMER_VALIDATION_20261109.md) is complete with reproduced issues and blocked capabilities; focused repairs and affected runtime checks remain before an all-features claim. Billing implementation stays deferred.

**Current step, 2026-11-09:** The owner selected INR 300/month for India, monthly free allowances of 10 reviews and 1 edit, free LaTeX editing/compilation/preview/download and paid Build AI assistance. USD 10 is removed. The [draft design](../docs/design/BILLING_ENTITLEMENTS.md), [decision record](../docs/decisions/0019-phase8-billing-prerequisites.md) and [pricing packet](agent-handoffs/2026-11-09-phase8-pricing/coordinator.md) preserve these terms. Paid allowances, exact metering/lifecycle, payment provider and any local T080 exception to A4 sequencing remain pending. A4 stays open; no billing implementation or checkout is claimed.

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

Explicit writing-workspace setup now has a verified local source checkpoint. The first gate passed 126 cases but failed the client build; the one-line type-import correction passed 69 affected cases plus full types, lint and web/worker builds on 863 stable inputs. The other 57 cases are carried unchanged. GET never creates a draft; setup and consented generation stay separate. Native and actual consumer acceptance remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a12-workspace-bootstrap-closeout.md).

Original legacy scoring-input binding, its default-off worker adapter, checksum self-consistency and paired privacy export now pass one fresh gate: 195 tests/eight files plus full types, lint and web/worker builds on 878 stable inputs. Native SQL remains unparsed/unexecuted, data RPCs/export denied and runtime adoption open. The paired privacy export fails closed until adoption. Initial-feedback owned publication, sidecar persistence and consumer usefulness remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a13-scoring-input-closeout.md).

Pure initial-feedback plans now pass one fresh gate: 103 tests/six files plus full types, lint and web/worker builds on 899 stable inputs. Twelve independent synthetic meaning oracles retain useful transformations, separate questions/editorial guidance from strengths and refuse unsafe changes. The private counterpart remains argument-content source only, denied and unexecuted; no ownership/publication/adoption is implied. A separate original-source guard is active. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a13-initial-feedback-plan-closeout.md).

A forward original-source guard now passes 64 tests/three files plus full types, lint and web/worker builds on 898 stable inputs. It adds nonblocking original snapshot/version/root admission to bound read/replay without changing active historical receipts or complete account export. This addresses a privileged-pointer source gap; current client exposure was not established. Native SQL and retirement/race behavior remain unexecuted, data RPCs denied. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a13-stored-source-guard-closeout.md).

Initial feedback operation source now passes one fresh combined gate: 216 tests/ten files plus full types, lint and web/worker builds on 942 stable inputs. Raw usage capture, exact contracts, staged operation/accounting source and RPC capabilities are verified locally; full publication, shared usage/privacy/lifecycle, worker/consumer adoption and actual/native acceptance remain open. Data access stays denied. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a13-initial-feedback-operation-foundation-closeout.md). Parent totals remain 2 VERIFIED, 38 PARTIAL and 24 PLANNED across all 64 unchanged tasks.


Initial feedback publication/shared usage now passes 176 tests/nine affected files plus full types, lint and web/worker builds on 891 stable inputs. Owned publication, both caller accounting paths, read-only export scopes and exact late-known settlement source are integrated. SQL remains unparsed/unexecuted, data denied and flags off. Content-retirement counter proof, the accepted 30-day lifecycle, worker/consumer adoption and actual/native/release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a13-publication-usage-closeout.md). All 64 parent tasks/dependencies and 2 VERIFIED/38 PARTIAL/24 PLANNED totals remain unchanged.


Retirement accounting and the owned feedback consumer now pass 112 tests/nine affected files plus full types, lint and web/worker builds on 895 stable inputs. Exact retirement proof repairs the counter/export gap without accepting arbitrary missing publications. Source claims require independently supported title and explanation; legacy notes remain visibly unverified. Native execution, full privacy/30-day lifecycle, worker adoption and release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a13-retirement-consumer-closeout.md). All 64 parent tasks/dependencies and status totals remain unchanged.


Owned AI privacy exports and the integrated local candidate now pass 5,054 tests across 266 unit/component files, with zero failures/skips, plus full types, lint and web/worker builds. Root reconciled 902 inputs and 66 allocated files. The first failed broad receipt and exact repairs remain preserved. Native execution, the 30-day lifecycle, initial-feedback worker adoption and release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/owned-ai-privacy-closeout.md). All 64 parent IDs/dependencies and status totals remain unchanged.


The owned-feedback worker path now passes 223 tests/ten affected files plus full types, lint and web/worker builds. Default-off configuration and both worker startup gates require the complete actual metadata capabilities before claiming work. The stage uses immutable source/context and the existing once-dispatch service; pending work does not complete or redispatch. Native execution, the 30-day lifecycle and release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a13-worker-adoption-closeout.md). Parent task IDs/dependencies/status totals are unchanged.

Owned AI disposition clocks, mandatory export and durable access are now verified locally. Current evidence covers 5,332 unique cases in 269 unit/component files across two receipts: 5,048 unchanged cases carried forward and 284 fresh follow-up cases, then full types, lint and web/worker builds. The original 120 failed cases remain preserved; only their 13 test files changed afterward, and production inputs stayed identical. Both independent source reviews ACK final hashes. SQL remains unparsed/unexecuted, new data access denied and expiry/purge inactive. Full 30-day erasure, CR-R17 storage coverage, Native/actual/representative/release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/owned-ai-disposition-closeout.md). Parent IDs, dependencies and 2 VERIFIED/38 PARTIAL/24 PLANNED totals are unchanged.

CR-R17 now has verified local source for bounded retention backfill, complete owned key coverage before parent deletion, terminal completion/failure receipts, active/immutable version admission and strict current-profile Node cleanup. One fresh gate passes 517 tests/15 files plus full types, lint and web/worker builds; 917 inputs and 14 allocated files are bound. Historical erased keys, Native transactions/roles/races, actual storage/process behavior and full privacy/release acceptance remain open. [Checkpoint](agent-handoffs/2026-11-09-reliability-implementation/r17-storage-closeout.md). CR-R17 is PARTIAL; totals are 2 VERIFIED, 39 PARTIAL and 23 PLANNED across the same 64 IDs/dependencies. The earlier 5,332-case checkpoint is historical, not a fresh result for this revision. Pricing and deployment stay on hold.

The [legacy rewrite source-registration checkpoint](agent-handoffs/2026-11-09-reliability-implementation/ai-source-registration-closeout.md) records 633 passing local cases/22 files and full type/lint/web/worker checks. It adds source-inclusive identity, atomic admission and mandatory privacy export. Other callers must adopt the source guard before activation. Original-month quota preservation before content erasure, full 30-day expiry, actual Native behavior and release acceptance remain open; no phase or parent gate closes from this source-only result.

The [all technical-budget caller checkpoint](agent-handoffs/2026-11-09-reliability-implementation/ai-callers-closeout.md) integrates legacy qualitative, A12/A13 and account-only Build admission while preserving legacy rewrite, typed once/lease claims and accounting. Current evidence covers 5,576 unique cases in 275 unit/component files across two receipts (5,509 unchanged carried cases and 67 fresh), then full types, lint and web/worker builds. The first eleven failures remain preserved; only three fixtures changed afterward. Production and profile bytes stayed identical. SQL is unparsed/unexecuted and new data grants remain denied. Original-month usage preservation, independent budget-off admission, full expiry and Native/consumer/release gates remain open. All 64 parent IDs/dependencies and the 2 VERIFIED/39 PARTIAL/23 PLANNED totals are unchanged.

The [usage-preservation checkpoint](agent-handoffs/2026-11-09-reliability-implementation/usage-retention-closeout.md) integrates capture before content erasure, exact original-period counting and mandatory retained-usage owner export. A fresh gate passes 820 cases/24 files plus full types, lint and web/worker builds on 931 stable inputs. Root reconciled 20 allocated files, logs/artifacts and five exited groups; failures and historical fingerprints remain preserved. SQL is unparsed/unexecuted. Budget-off dispatch admission, full expiry/fold/holds, Native/actual/consumer and release gates remain open. All 64 parent IDs/dependencies and 2 VERIFIED/39 PARTIAL/23 PLANNED totals remain unchanged.

Mandatory provider admission is locally source-verified across all five paths. Combined coverage is 5,709 unique cases/278 unit-component files across two receipts, with 5,666 unchanged cases carried forward and 43 fresh cases, then full types/lint/web/worker builds. Original seven combined failures remain preserved; only two fixtures changed after production froze. Native/live and full parent acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/budget-required-closeout.md. All 64 parent IDs/dependencies and 2 VERIFIED/39 PARTIAL/23 PLANNED totals remain unchanged. Services remain free and deployment stays HOLD.

The staged expiry core/client source now passes one fresh 5,821-case/281-file unit-component gate plus full types, lint and web/worker builds on 947 stable inputs. Root reconciled 29 allocated files, reports/artifacts and six absent command groups; all 973 old full assertions and failed receipts remain preserved. SQL is unparsed/unexecuted. Real adoption authority is absent/unseeded, destructive access denied, and usable expiry/720-hour, Native/physical/restore/consumer/release gates remain open. See agent-handoffs/2026-11-09-reliability-implementation/expiry-fold-closeout.md. Parent IDs/dependencies and 2 VERIFIED/39 PARTIAL/23 PLANNED totals remain unchanged; services stay free and deployment stays HOLD.


Privacy generation and restore foundations pass one fresh source-only gate: 5,907 tests/285 unit-component files, synthetic restore and full types/lint/web/worker builds on 954 stable inputs. Root reconciled 30 allocated files and seven absent command groups; 952 complete old assertions remain. Database-stamped attempt/generation export fencing and the owner-free journal/controller are integrated. SQL remains unparsed/unexecuted; real adopter/platform/fencing/serving/first-clock integration, physical lock recovery, full expiry and Native/consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/adoption-foundation-closeout.md. All 64 parent IDs/dependencies and 2 VERIFIED/39 PARTIAL/23 PLANNED totals remain unchanged. Services remain free; deployment stays HOLD.


CR-A15 local score admission/explanation now passes 240 tests/16 affected files plus full types/lint/web/worker builds on 958 stable inputs. Existing numerical guards were correct; four policy/validation files remain unchanged. New plain-language notice and both navigation paths preserve selected versions. All285 old test files and failed receipts remain. Native/browser/actual/representative/numerical-policy/release acceptance remains open. See agent-handoffs/2026-11-09-reliability-implementation/score-admission-closeout.md. CR-A15 is PARTIAL. All 64 parent IDs/dependencies remain unchanged; totals are 2 VERIFIED, 40 PARTIAL and 22 PLANNED. Services remain free and deployment stays HOLD.


CR-A14 now has verified local typed-JD review priorities and complete legacy wording inspection. Current coverage is 529 unique affected cases in 28 files across two receipts: 521 carried unchanged and eight fresh, followed by fresh types, lint and web/worker builds. Root reconciled 970 inputs, 16 final files and seven absent groups. All 287 old test files and original failures remain. Only a new fixture table type changed after the first 529-case pass. Useful JD-specific drafting, projected/saved diagnostic comparison and actual/native/consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/jd-recommendations-closeout.md. CR-A14 is PARTIAL; all 64 parent IDs/dependencies remain unchanged. Totals: 2 VERIFIED, 41 PARTIAL, 21 PLANNED. Services remain free and deployment HOLD.

CR-A14 projected and saved writing observations are locally verified. Current affected coverage is 732 unique cases in 30 files across three receipts: 667 carried current cases and 65 fresh final cases, with fresh typecheck, lint and web/worker builds passing. This is not a fresh full-suite rerun. Root reconciled 982 final gate inputs, 951 raw source inputs, 19 allocated files and eight absent command groups. Original failures remain preserved; the selector correction preserves 29 assertions, and the type-only correction preserves 81 assertions and identical emitted production JavaScript. Useful JD-specific drafting and Native/database/browser/provider/consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/writing-comparison-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services remain free; deployment stays HOLD.

CR-A14 now includes a locally verified JD-selected exact two-clause drafting kernel and complete projected review component. Root reconciles 241 unique current cases/ten files across two receipts: 190 carried unchanged plus 51 fresh final, with fresh types/lint/web/worker builds. Two type-only repairs preserve identical configured-compiler JavaScript; the original failed receipt and all assertions remain. All 951 prior raw source inputs are unchanged; five new files were added. The component is not mounted yet and grants no save authority. Actual owned-page preview integration, labelled/bullet-prefix grammar support, additive v2 Native accept/reject/undo and full consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/jd-clause-order-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A14 now has an actual owned result/author-page preview consumer under the existing authoring flag. One fresh integrated gate passes 251 affected cases/13 files plus full types/lint/web/worker builds. Preparation shares the validated score context and releases only after unchanged final privacy/source/pair/head/hash checks; default-off adds no work/data, historical inputs stay pinned, and 50-pair/five-draft bounds report truncation without a fabricated eligible total. Root binds 974 inputs/nine files and preserves 61 old assertions with two additive call signatures. The initial audit-only failure and all author failures remain. A single-long-whitespace preparation timeout is an open CR-A01/CR-A02 investigation, not a proven production defect. Independent Native candidate decisions/undo, broader grammar/usefulness and actual/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/preview-consumer-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A01-I01 is locally resolved: a controlled identical probe localized the timeout to synchronous contact parsing, and one separator-only regex change reduced the original synthetic case from 7790.73ms to 99.16ms without changing its five second threshold. One fresh integrated gate passes 235 affected cases/15 files plus full types/lint/web/worker builds on 976 bound inputs. Original contact tests, preparation expectations, source bytes, limits and parser semantics are preserved; temporary profiling was removed. The original input exceeds default PDF ingress size, so no default-upload exploit or deployed latency claim follows. See agent-handoffs/2026-11-09-reliability-implementation/whitespace-closeout.md. Broader extraction/OCR, actual ingress/consumer and release acceptance remain open. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A14-S06 is in progress: the additive v2 decision policy, A11OP2 atom order and independent codec vectors are frozen, and the pinned Supabase CLI created the forward migration `20261116192537_jd_clause_order_decisions.sql`. Three separate worktrees own Node original-pair proof and command admission, browser review/codec, and independent Native transaction/readiness source. The raw-role whitespace correction is recorded in the successor policy; the initial freeze is preserved. Final implementation, peer review and integrated verification are pending. No database execution, writable route, activation or deployment is claimed. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED. [Current contract](agent-handoffs/2026-11-09-reliability-implementation/decisions-contract.json).

CR-A14-S06 Node/browser core is locally verified: one fresh Root gate passed 235 affected tests in ten files, character-profile reproduction, formatting, full types/lint and web/worker builds on 987 stable gate inputs. The controlled review now keeps saved receipts with their original proposals after input heads change; the actual failed DOM case is preserved. ORIGINAL reconstruction, strict writer scope and v2 hashes are implemented. Independent Native transaction/readiness source is still being authored, and owned HTTP/mounted decisions/undo, broader usefulness and actual consumer/release acceptance remain open. The parent stays PARTIAL. [Core checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-core-closeout.md).

CR-A14-S06 now includes the complete additive Native migration source alongside the verified Node/browser core. Root verifies 245 unique cases in eleven files across two receipts: 235 fresh core cases with full types/lint/web/worker builds, then ten source-contract cases with fresh types and scoped checks. This is not a fresh full-suite or executed database result. Fourteen allocated files are integrated; 79 prior migrations are unchanged. The writer remains revoked. Trusted readiness/owned HTTP/mounted decisions/undo, actual Native validation and broader usefulness remain open, so the parent stays PARTIAL. [Integrated checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-closeout.md).

CR-A14-S07 and CR-U06-S01 now have a mounted owned decision/undo consumer in source. One fresh integrated gate passes 434 affected cases in nineteen files, formatting/profile reproduction, full types/lint and web/worker builds on 1001 stable inputs. Actual readiness, owned double reads, strict HTTP/review acknowledgement, original-key retry, accepted-event/base rollback and post-undo event proof are wired. Default-off flags and denied Native writer remain. Supabase execution, real browser/consumer validation and broader grammar/usefulness remain open. CR-U06 moves from PLANNED to PARTIAL; totals are now 2 VERIFIED, 42 PARTIAL and 20 PLANNED across the same 64 tasks. [Consumer checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md).
