# Resumide Target Architecture

Status: **CANDIDATE B2C FOUNDATION APPROVED; AA0 DESIGN APPROVED 2026-10-04; AA1 ENGINEERING CLOSED / OWNER ACCEPTED; AA1 ACCURACY OPEN; AA2 ENGINEERING CLOSED / VERIFIED LOCALLY; FORMAL GATE OPEN; GATE A4 OPEN**
Last updated: 2026-10-12
AA3 status: **LOCAL IMPLEMENTATION DELIVERED; DOMAIN/DATA ACCEPTANCE OPEN**
AA4 status: **LOCAL ENGINEERING COMPLETE AND VERIFIED; FORMAL GATE OPEN**
AA5 status: **LOCAL ENGINEERING COMPLETE, VERIFIED AND OWNER-ACCEPTED 2026-10-14; FORMAL GATE OPEN**
AA6 status: **LOCAL ENGINEERING COMPLETE AND VERIFIED; FORMAL GATE OPEN**
Canonical execution documents: [`tasks/plan.md`](tasks/plan.md) and [`tasks/todo.md`](tasks/todo.md)
Accuracy-v2 sources: [`docs/ATS_SCORING_AND_AUTHORING_SPEC.md`](docs/ATS_SCORING_AND_AUTHORING_SPEC.md), [`docs/ATS_SCORING_AND_AUTHORING_RESEARCH.md`](docs/ATS_SCORING_AND_AUTHORING_RESEARCH.md), [`tasks/accuracy-authoring-plan.md`](tasks/accuracy-authoring-plan.md), and [`CONSTRAINTS.md`](CONSTRAINTS.md)

This document defines the target architecture for turning the current ResumeATS prototype into a reliable B2C product and, only after explicit gates are passed, an enterprise-capable platform. It is written for humans and implementation agents. Existing code is evidence of the current state, not proof that a capability is complete.

## 1. Product definition

Resumide helps a candidate understand how reliably their resume can be parsed, how closely it matches a job description, and how to improve it without inventing experience. Its core differentiators are:

1. A transparent evidence view showing what fields, lines, pages, and requirements were extracted, with method, location, confidence, and correction state.
2. Separate versioned, deterministic `ATS Compatibility` and `Job Alignment` results, gated by `Evidence Confidence`.
3. A job-description requirement view that distinguishes required, preferred, satisfied, partial, confirmation-required, missing, and not-evaluated evidence.
4. Qualitative writing feedback and drafts produced by an LLM under a strict schema and candidate-verified fact boundary; the model does not own numeric scoring.
5. A same-page improvement workspace that preserves immutable versions, accept/reject/undo history, and projected versus actual score deltas.
6. PDF/DOCX and later LaTeX generation from a canonical resume document, with parse-back verification before an artifact is labelled verified.

The product is **not** an exact emulator of Workday, Greenhouse, Oracle, Taleo, Lever, iCIMS, or another proprietary ATS. User-facing language must say “ATS compatibility guidance,” “job alignment,” or “parse simulation,” never claim guaranteed passage through an employer’s ATS. A vendor-specific claim requires controlled evidence for the named vendor and version. An interview/hiring probability requires a separately approved outcome-calibration study.

### Product modes

| Mode                    | Primary user             | Permitted purpose                            | Gate                           |
| ----------------------- | ------------------------ | -------------------------------------------- | ------------------------------ |
| Candidate coach         | Individual job seeker    | Self-improvement and application preparation | Build first                    |
| Career-center workspace | Advisor and candidate    | Human-assisted coaching                      | After B2C reliability gate     |
| Employer workspace      | Recruiter or hiring team | Advisory review with human oversight         | Separate enterprise/legal gate |

Employer ranking, automatic rejection, or fully automated hiring decisions are out of scope until accuracy, fairness, human-oversight, and legal requirements are independently approved.

## 2. Status vocabulary

Every plan, task, PR, and handoff must use these labels:

- `IMPLEMENTED`: code exists in the current branch.
- `VERIFIED`: acceptance criteria passed in the required evidence tier.
- `PARTIAL`: some behavior exists, but acceptance criteria are incomplete.
- `PLANNED`: specified but not implemented.
- `BLOCKED`: cannot continue without a named decision, credential, service, or external action.
- `DEFERRED`: intentionally outside the active phase.

“Build passes” does not mean a page, workflow, security control, deployment, or scoring claim is verified.

## 3. Current-state baseline

The current repository contains a React Router SSR application, an authenticated `/api/analyze` resource action, all-page PDF text extraction through `unpdf`, heuristic parsing, versioned deterministic rules, an OpenAI structured-output pass, durable Supabase-backed analysis/job state, and a browser-side result cache over server-owned results.

### What is currently working

- TypeScript typecheck and production compilation.
- Synthetic extraction, parsing, rule, and non-LLM pipeline self-checks.
- Authenticated, rate-limited, consent-gated durable analysis ingestion with private storage and idempotency.
- Leased analysis and privacy workers with retry, cancellation, retention, export, deletion, and audit boundaries.
- Security headers, same-origin enforcement, bounded sessions, PII-safe telemetry, health/readiness, and protected metrics.
- Unit/integration/browser/accessibility/benchmark/load/restore checks wired into CI.
- Browser and upload rendering at laptop and mobile widths.
- AA2 structured resume review is implemented behind a default-off flag:
  evidence-bound import, immutable fact versions, owner confirmation/correction,
  optimistic concurrency, history/compare/restore, privacy export and deletion.
  Formal Gate AA2 acceptance remains open under ADR-0012/E-003. See the
  [AA2 closeout](docs/evaluation/AA2_ENGINEERING_CLOSEOUT.md) for the local
  verification tier and the [workspace design](docs/design/CANONICAL_RESUME_WORKSPACE.md).
- AA3 JD review is implemented behind a default-off flag: typed proposals,
  exact JD/importance citations, immutable versions and owner-only history,
  bounded model fallback, pinned offline taxonomy proposals and disabled market
  inputs. Domain pack review, real mapping quality and representative acceptance
  remain open. See [AA3 status](docs/evaluation/AA3_ENGINEERING_STATUS.md).

### Known release blockers

- The current deterministic score is a nine-rule synthetic-regression baseline with hand-authored weights, not a representative industry-calibrated score.
- The current prominent overall score mixes deterministic ATS rules with LLM category ratings; Accuracy-v2 must separate these semantics before broader scoring claims.
- OCR is safely refused by the default unsupported adapter. Scanned/mixed resume completion requires an approved provider/local engine, calibrated confidence policy, and representative corpus.
- The current skill taxonomy and synthetic matching corpus do not establish cross-industry requirement coverage.
- The current writer is a bounded copy-suggestion view, not a structured same-page resume editor or verified document generator.
- Production start requires explicit secret/config injection; it does not load a developer `.env` implicitly.
- Malware scanning, parser sandboxing, restricted worker egress, and container/runtime policy remain deployment-owned controls.
- The checked-in Phase 7 migrations are applied to the configured hosted project and the hosted schema, tenant/RLS, private-storage, and Phase 4 persistence smoke checks pass. The local Supabase database also resets cleanly through the current migration set and passes the SQL verification/lint gates.
- Live OpenAI verification is blocked by the configured model credential returning HTTP 401. Malware scanning, parser sandboxing, restricted worker egress, and container/runtime policy remain deployment-owned controls. Hosted restore, monitored staging E2E, alert notification delivery, rollback rehearsal, privacy-policy approval, and human security/operations approval remain open A4 evidence.
- In-process metrics reset on restart and require a deployment scrape/sink; replacing them with a managed backend is deferred until measured scale requires it.

## 4. Architecture principles

1. **Modular monolith first.** One web deployable and one worker deployable may share domain packages. Do not split into microservices without measured scaling or ownership pressure.
2. **Thin routes, explicit services.** Routes authenticate, validate, authorize, call an application service, and map typed errors to HTTP responses.
3. **Deterministic scoring owns numeric ATS compatibility.** LLM output may explain or critique; it must not silently override deterministic evidence.
4. **All external values are untrusted.** This includes PDFs, job descriptions, model responses, webhooks, environment variables, and stored JSON.
5. **Persist state before navigation.** A result URL must be durable, authorized, refreshable, and return a real 404 when absent.
6. **Version everything affecting a score.** Parser, rules, prompt, schema, model, and normalization versions are recorded with every analysis.
7. **Privacy by minimization.** Store only required data, define retention before collection, and make export/deletion testable.
8. **Accessible and reduced-motion by default.** Animations enhance state changes but never hide meaning or block task completion.
9. **Observable and reversible releases.** No release without health signals, dashboards, a rollback procedure, and an owner.
10. **Evidence before score.** Missing, conflicting, unsupported, or low-confidence critical evidence produces verification or no-score states, never an arbitrary low score.
11. **Canonical content before presentation.** Resume facts and versions live in template-independent structured data; PDF, DOCX, HTML, and LaTeX are generated artifacts.
12. **Verify every export.** A successful render or compile is not proof of ATS readability; generated artifacts are parsed back and compared before a verified label.
13. **Claims follow evidence.** Synthetic regression, representative-corpus validation, domain validation, vendor observation, and outcome calibration are distinct claim levels.

## 5. Capability map

Stable module IDs must be used in specs, tasks, telemetry, and ownership records.

| Module ID                   | Responsibility                                                                | Depends on                                               |
| --------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `platform-foundation`       | Runtime config, errors, IDs, clocks, CI, deployment contracts                 | None                                                     |
| `identity-tenancy`          | Accounts, sessions, organizations, membership, RBAC, SSO boundary             | platform-foundation                                      |
| `resume-ingestion`          | Upload validation, quarantine, storage, extraction, OCR boundary              | platform-foundation, identity-tenancy                    |
| `analysis-orchestration`    | Jobs, leases, idempotency, retries, cancellation, status                      | resume-ingestion                                         |
| `document-evidence`         | Native/OCR evidence, geometry, reading order, confidence, correction          | resume-ingestion, analysis-orchestration                 |
| `canonical-resume`          | Structured resume facts, immutable versions, provenance, change ledger        | document-evidence, persistence-history                   |
| `job-intelligence`          | Typed JD requirements, O*NET/ESCO mapping, domain packs, market evidence      | persistence-history                                      |
| `scoring-evaluation`        | Compatibility/alignment rules, confidence gates, benchmark and calibration    | document-evidence, canonical-resume, job-intelligence    |
| `qualitative-ai`            | Provider adapter, grounded drafts, explanations, prompt defense, budgets      | analysis-orchestration, scoring-evaluation               |
| `resume-authoring`          | Same-page editing, clarification, accept/reject/undo, deterministic rescoring | canonical-resume, scoring-evaluation, qualitative-ai     |
| `verified-rendering`        | HTML/PDF/DOCX/LaTeX rendering, sandboxed compile, parse-back verification     | canonical-resume, document-evidence                      |
| `persistence-history`       | Resumes, jobs, analyses, versions, deletion/export                            | identity-tenancy                                         |
| `web-experience`            | Home, upload, progress, result/editor, errors, accessibility, responsive UI   | identity-tenancy, persistence-history, resume-authoring  |
| `observability-operations`  | Logs, metrics, traces, health, SLOs, alerts, runbooks                         | platform-foundation                                      |
| `privacy-security`          | Consent, retention, encryption, audit, threat model, security controls        | all core modules                                         |
| `billing-entitlements`      | Plans, quotas, metering, invoices, webhook processing                         | identity-tenancy, persistence-history                    |
| `enterprise-administration` | Enterprise workspaces, SSO/SAML, audit export, policy controls, integrations  | identity-tenancy, privacy-security, billing-entitlements |
| `recruiter-calibration`     | Human-authored job rubric, oversight, correction/appeal, named ATS pilots     | all candidate modules, enterprise-administration         |

Build order:

`platform-foundation` → `identity-tenancy` + `persistence-history` → `resume-ingestion` → `analysis-orchestration` → `document-evidence` → `canonical-resume` + `job-intelligence` → `scoring-evaluation` → `qualitative-ai` + `resume-authoring` → `verified-rendering` + `web-experience` → `privacy-security` + `observability-operations` → `billing-entitlements` → `enterprise-administration` → `recruiter-calibration`.

Security, privacy, testing, and observability are threaded through every slice even though they have named modules.

## 6. Target system context

```mermaid
flowchart LR
    Candidate[Candidate]
    Advisor[Career advisor]
    Recruiter[Enterprise reviewer]
    Browser[Resumide web app]
    Web[React Router web service]
    Worker[Analysis worker]
    DB[(PostgreSQL)]
    Storage[(Private object storage)]
    Queue[(PostgreSQL-backed job queue)]
    Auth[Managed identity provider]
    AI[LLM provider]
    OCR[OCR or document service]
    Obs[Logs, metrics, traces]

    Candidate --> Browser
    Advisor --> Browser
    Recruiter --> Browser
    Browser --> Web
    Web --> Auth
    Web --> DB
    Web --> Storage
    Web --> Queue
    Worker --> Queue
    Worker --> Storage
    Worker --> DB
    Worker --> AI
    Worker -. optional .-> OCR
    Web --> Obs
    Worker --> Obs
```

### Deployable units

1. **Web service**: SSR pages, authenticated API/resource routes, upload initiation, result reads, user actions, health/readiness.
2. **Analysis worker**: claims jobs, extracts and normalizes documents, runs deterministic scoring, calls the LLM adapter, persists results.
3. **Managed data services**: PostgreSQL, private object storage, identity provider, secret manager, telemetry backend.

The web and worker share TypeScript domain packages and schemas. They are separate processes so long PDF/AI work never holds an HTTP request open.

## 7. Repository target structure

```text
app/
  components/              # Presentation components
  routes/                  # Thin route loaders/actions/pages
  features/
    auth/                   # Session and account UI
    resumes/                # Upload, list, detail UI and client contracts
    analyses/               # Progress/result UI and client contracts
  lib/
    server/
      config/               # Validated runtime configuration
      auth/                 # Session and authorization adapters
      db/                   # Database client and repositories
      storage/              # Private object-storage adapter
      jobs/                 # Job queue and worker lease logic
      analysis/             # Orchestration service
      ats/                  # Parser, rule engine, scoring versions
      ai/                   # Provider interface and OpenAI adapter
      observability/        # Logger, metrics, traces
    shared/                 # Cross-runtime schemas and error codes
db/
  migrations/               # Forward migrations and tested rollback notes
tests/
  unit/
  integration/
  fixtures/                 # Synthetic/anonymized PDFs and expected results
e2e/                        # Browser workflows
docs/decisions/             # ADRs
tasks/                      # Canonical plan and task state
```

Feature-specific logic must not be moved into generic utilities. Git, database, storage, AI, and authentication calls stay behind explicit server adapters.

## 8. Data architecture

All tables use server-generated UUIDs, `created_at`, `updated_at`, and explicit tenant/user ownership. Sensitive records use least-privilege access and audit trails.

| Entity                      | Required fields                                                        | Notes                                                                |
| --------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `users`                     | `id`, provider subject, email, status                                  | Identity profile, not password storage                               |
| `organizations`             | `id`, name, type, settings                                             | Personal workspace can be a single-user organization                 |
| `memberships`               | `organization_id`, `user_id`, role                                     | Unique pair; roles enforced server-side and with RLS where available |
| `jobs`                      | `id`, organization_id, title, company, description, owner_id           | Job-description source for analyses                                  |
| `resumes`                   | `id`, organization_id, owner_id, display_name, status                  | Logical resume independent of file versions                          |
| `resume_versions`           | `id`, resume_id, storage_key, checksum, bytes, media_type, page_count  | Immutable input version                                              |
| `analyses`                  | `id`, resume_version_id, job_id, status, requested_by, idempotency_key | Durable user-visible analysis record                                 |
| `analysis_runs`             | versions, model, prompt hash, timestamps, usage, error code            | One execution attempt; immutable evidence                            |
| `analysis_results`          | feedback JSON, parse JSON, rule trace JSON, confidence metadata        | Validated against a versioned schema                                 |
| `document_pages`            | resume_version_id, index, dimensions, text status, quality             | Page-level native/OCR and render evidence                            |
| `evidence_spans`            | page_id, text offsets, polygon, method, confidence, version            | Source for fields, requirements, findings, and generated claims      |
| `canonical_resume_versions` | resume_id, parent_id, schema_version, author, reason                   | Immutable template-independent resume content                        |
| `resume_facts`              | canonical_version_id, type, value, evidence_ids, confirmation_state    | Candidate/source-verified factual boundary                           |
| `job_requirements`          | job_id, type, importance, value, evidence_span, mapping, confidence    | Required/preferred/contextual public-JD rubric                       |
| `score_policies`            | policy_version, dimensions, weights, gates, claim_level                | Human-approved immutable scoring semantics                           |
| `score_runs`                | canonical_version_id, job_id, policy_version, evidence_state, results  | Deterministic compatibility/alignment result                         |
| `change_events`             | canonical_version_id, operation, target_id, before, after, suggestion  | Append-only accept/edit/reject/undo history                          |
| `rendered_artifacts`        | canonical_version_id, format, template_version, status, storage_key    | Generated PDF/DOCX/LaTeX outputs                                     |
| `artifact_verifications`    | artifact_id, extractor_version, parity_metrics, status                 | Parse-back proof required for verified label                         |
| `evaluation_runs`           | corpus_version, policy/model/provider versions, metrics, intervals     | Immutable benchmark and claim evidence                               |
| `consents`                  | user_id, purpose, policy_version, captured_at                          | Required before third-party AI processing                            |
| `audit_events`              | actor, tenant, action, target, outcome, request_id, timestamp          | Append-only; never store resume body or API keys                     |
| `entitlements`              | organization_id, plan, limits, period                                  | Server-side enforcement source                                       |
| `usage_events`              | organization_id, analysis_id, tokens, cost units                       | Idempotent and reconcilable                                          |

### Invariants

- A user may read a resume only through an active membership in its organization and an allowed role.
- Storage keys are generated by the server and never accepted directly from clients.
- Resume files are private; access uses short-lived signed URLs or authenticated streaming.
- Completed results are immutable. Re-analysis creates a new analysis record.
- The original uploaded resume version is immutable. Authoring creates canonical child versions; restore also creates a child rather than mutating history.
- Every scored finding and accepted generated fact resolves to source evidence or explicit candidate confirmation.
- Generated artifacts are not labelled verified until their parse-back policy passes.
- Delete requests remove active records and enqueue object, cache, index, and backup-retention actions.
- Every score stores `parser_version`, `ruleset_version`, `normalizer_version`, `prompt_version`, `schema_version`, and `model_id`.

## 9. Analysis lifecycle

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> UPLOADING
    UPLOADING --> QUARANTINED
    QUARANTINED --> QUEUED: validation passed
    QUARANTINED --> REJECTED: invalid or unsafe file
    QUEUED --> EXTRACTING
    EXTRACTING --> SCORING
    SCORING --> QUALITATIVE_REVIEW
    QUALITATIVE_REVIEW --> COMPLETED
    EXTRACTING --> NEEDS_OCR
    NEEDS_OCR --> SCORING
    EXTRACTING --> FAILED
    SCORING --> FAILED
    QUALITATIVE_REVIEW --> PARTIAL: deterministic result available
    QUALITATIVE_REVIEW --> FAILED
    CREATED --> CANCELLED
    QUEUED --> CANCELLED
```

Rules:

- State changes use transactions and compare-and-set semantics.
- Workers claim jobs with a lease and heartbeat; abandoned leases can be retried.
- Idempotency prevents duplicate uploads, jobs, AI calls, results, and billing events.
- Retry only transient failures with capped exponential backoff and jitter.
- Deterministic results may be returned as `PARTIAL` when the LLM provider is unavailable.
- Permanent errors use stable public codes; internal stack/provider details stay in protected logs.

### Accuracy-v2 and authoring lifecycle

```mermaid
stateDiagram-v2
    [*] --> EVIDENCE_EXTRACTING
    EVIDENCE_EXTRACTING --> EVIDENCE_REVIEW: confidence/critical disagreement
    EVIDENCE_EXTRACTING --> CANONICAL_READY: evidence gate passed
    EVIDENCE_REVIEW --> CANONICAL_READY: candidate confirmed/corrected
    EVIDENCE_REVIEW --> UNSUPPORTED: evidence remains insufficient
    CANONICAL_READY --> SCORED
    SCORED --> EDITING
    EDITING --> CLARIFICATION_REQUIRED: rewrite needs a new fact
    CLARIFICATION_REQUIRED --> EDITING: candidate confirms/corrects/declines
    EDITING --> RESCORING: accepted change creates child version
    RESCORING --> SCORED
    SCORED --> RENDERING
    RENDERING --> VERIFYING_ARTIFACT
    VERIFYING_ARTIFACT --> EXPORT_READY: parse-back passed
    VERIFYING_ARTIFACT --> EXPORT_FAILED: parity/compile/accessibility failure
```

The state names above are target domain states, not evidence that corresponding database columns or routes exist. The original upload remains immutable throughout the authoring lifecycle.

## 10. API and route contracts

All JSON errors use:

```json
{
  "error": {
    "code": "UPLOAD_TOO_LARGE",
    "message": "The PDF exceeds the allowed size.",
    "requestId": "req_...",
    "retryable": false
  }
}
```

Target routes:

| Method and route                    | Purpose                          | Success | Required controls                               |
| ----------------------------------- | -------------------------------- | ------- | ----------------------------------------------- |
| `GET /`                             | Resume/job dashboard             | 200     | Session, tenant-scoped pagination               |
| `GET /upload`                       | Upload form                      | 200     | Session and consent state                       |
| `POST /api/resumes`                 | Initiate validated upload        | 201     | Auth, quota, CSRF/origin, body cap, idempotency |
| `POST /api/resumes/:id/complete`    | Finalize direct upload           | 202     | Ownership, checksum, quarantine enqueue         |
| `GET /api/analyses/:id`             | Status/result envelope           | 200/404 | Ownership, no cross-tenant leakage              |
| `POST /api/analyses/:id/cancel`     | Cancel queued work               | 202/409 | Ownership, idempotency                          |
| `GET /resume/:id`                   | Durable result page              | 200/404 | Server loader and ownership                     |
| `GET /api/resumes/:id/structured`   | Canonical resume/version read    | 200/404 | Ownership, evidence redaction, version ETag     |
| `POST /api/resumes/:id/verify`      | Confirm/correct extracted facts  | 201/409 | Ownership, schema, optimistic concurrency       |
| `POST /api/resumes/:id/versions`    | Apply candidate-approved edit    | 201/409 | Ownership, fact validation, idempotency         |
| `POST /api/resumes/:id/suggestions` | Request grounded line draft      | 202     | Consent, quota, evidence IDs, model budget      |
| `POST /api/resumes/:id/score`       | Score one canonical version      | 202     | Evidence gate, versioned policy, idempotency    |
| `POST /api/resumes/:id/render`      | Generate a versioned artifact    | 202     | Approved template, quota, compiler isolation    |
| `GET /api/artifacts/:id`            | Read verification/download state | 200/404 | Ownership, short-lived access, safe status      |
| `POST /api/resumes/:id/delete`      | Begin privacy-safe deletion      | 202     | Re-auth for sensitive action, audit             |
| `GET /api/me/export`                | User data export                 | 202     | Re-auth, audited asynchronous export            |
| `GET /healthz`                      | Process liveness                 | 200     | No dependency or secret data                    |
| `GET /readyz`                       | Dependency readiness             | 200/503 | Bounded DB/storage/queue checks                 |

The first implementation may upload through the web service for simplicity. Direct-to-object-storage uploads become necessary only when measured file volume justifies them.

## 11. Scoring architecture

The full target contract is [`docs/ATS_SCORING_AND_AUTHORING_SPEC.md`](docs/ATS_SCORING_AND_AUTHORING_SPEC.md), with AA0 logical contracts frozen by [`ADR-0009`](docs/decisions/0009-aa0-truth-contract-and-evaluation-design.md) on 2026-10-04. ADR-0006 design is accepted; shipped score semantics do not change until implementation, calibration and migration are verified.

### Evidence Confidence

Evidence Confidence is not candidate merit and does not contribute points. It gates whether other dimensions may be calculated. It combines calibrated page/word/field extraction evidence, native/OCR disagreements, reading-order uncertainty, critical-field completeness, job-requirement extraction confidence, and candidate confirmation.

`review_required`, `insufficient`, and `unsupported` are visible states. They must not be translated into low ATS or job-alignment scores.

### ATS Compatibility

The deterministic engine owns the numeric cross-system document compatibility index. It evaluates observable parse properties only:

- Page/text completeness, reading order, standard sections, contact fields, roles/employers, dates, bullets, and links.
- Columns, tables, text boxes, headers/footers, images, hidden/overlaid text, font/encoding, and file risks.
- Locale-specific parsing under a declared supported profile.
- Generated-artifact parse-back parity.

Rules retain exact evidence and policy versions. `not_evaluated` leaves the denominator and never earns free points. The score is not a qualification score or employer-pass probability.

### Job Alignment

The deterministic engine evaluates verified resume facts against typed job requirements. It separates required, preferred, contextual, unknown, and not-applicable requirements; exact, approved-alias, semantic-proposal, and recruiter-confirmed mappings; and satisfied, partial, confirmation-required, not-evidenced, and not-evaluated states.

Repeated terms and aliases cannot receive duplicate credit. Skills listed without supporting experience may count as weaker evidence but not as proven proficiency. Years, dates, education, certifications, location, authorization, and travel are typed comparisons rather than keywords.

The exact job description is the primary source. O*NET, ESCO, and approved domain packs normalize concepts. Market-frequency claims require dated permissioned data with sample/query provenance. Recruiter-authored calibration is deferred behind the enterprise/fairness gate.

### Optional Application Readiness

A combined candidate progress index may be tested only after comprehension research. If introduced, it is deterministic, exposes its components/confidence, is withheld with insufficient evidence, and is labelled `Application Readiness`. It must not be called an employer ATS score or interview probability.

### Qualitative AI and authoring layer

- The provider adapter accepts a typed request and returns a typed result.
- Resume/JD content is untrusted data and is clearly separated from system instructions.
- Structured output is validated again at the service boundary.
- Calls have input/output token caps, timeouts, retry classification, usage capture, and per-tenant budgets.
- No secret, cross-tenant context, or unnecessary PII enters the prompt.
- Every proposed factual statement cites canonical fact IDs; unsupported claims are rejected or converted into candidate clarification questions.
- Candidate-visible accept/edit/reject/undo events are immutable. The LLM cannot silently mutate the canonical resume.
- XYZ is one writing pattern; verified impact and scope are preferred, but a number is never fabricated or universally required.
- The user's four-level prompt becomes a typed result view: version/evidence state, blockers, at most five highest-impact changes, reliable strengths, missing/confirmation-required evidence, and server-supplied score fields. The LLM may narrate these objects but cannot calculate or replace their numeric values.
- Provider refusal or outage preserves deterministic results and manual editing.
- A provider/model/prompt change requires a locked writer evaluation and a versioned rollout.
- LLM category scores do not own ATS Compatibility, Job Alignment, or authoritative Application Readiness.

### Accuracy evidence and claim ladder

Maintain consented, licensed, synthetic, or irreversibly anonymized corpora covering clean, multi-page, multi-column, scanned, mixed, malformed, encrypted, international, sparse, long, adversarial, and generated documents. Development, calibration, and locked test partitions remain separate.

Track character/word error, page coverage, reading order, field precision/recall, requirement/importance F1, evidence precision/recall, deterministic variance, expert agreement, unsupported-fact rate, render parity, counterfactual invariance, failure rate, latency, and cost. Report per-segment metrics and confidence intervals; an aggregate cannot hide a failed segment.

Allowed claim levels are `Regression-tested` → `Corpus-validated` → `Domain-validated` → `Vendor-observed` → `Outcome-calibrated`. Product language may use only the achieved level. Current Phase 5 evidence is `Regression-tested`.

## 12. Page and interaction architecture

| Page                     | Current problem                                                                   | Target behavior                                                                                                  | Verification                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Home `/`                 | Claims tracking but state is memory-only                                          | Server-loaded, paginated resume/job history with empty, loading, error states                                    | Refresh and second browser session show authorized records                                        |
| Upload `/upload`         | Hidden errors, 10/20 MB mismatch, discarded company, no timeout                   | Schema-backed fields, visible inline errors, consent, progress, cancellation, idempotent submit                  | Keyboard + malformed/oversize/network test matrix                                                 |
| Progress `/analysis/:id` | Missing                                                                           | Durable state timeline with polling or SSE and safe retry/cancel                                                 | Reload during every state; worker loss recovery                                                   |
| Result `/resume/:id`     | Durable analysis and copyable writer suggestions; no structured editor            | Synchronized preview, evidence findings, structured same-page editor, accept/reject/undo, versions and rescoring | Direct open, refresh, edit conflict, provider outage, keyboard/screen-reader, cross-tenant denial |
| Parse View               | Multi-page text/evidence exists; word polygons and corrected reading order do not | Page/word geometry, native/OCR provenance, confidence, disagreements, and correction                             | Accuracy-v2 extraction corpus plus responsive, keyboard, a11y, hosted/manual review               |
| Keyword view             | Called heatmap but no overlay                                                     | Implement real evidence overlay or rename to keyword coverage                                                    | Content/design acceptance test                                                                    |
| Evidence verification    | Scanned/mixed PDFs stop safely; no correction flow                                | Candidate confirms/corrects uncertain critical fields before scoring                                             | Native/OCR disagreement, correction, audit, low-confidence and unsupported tests                  |
| Authoring workspace      | Up to four copyable grounded suggestions                                          | Full structured resume editing, fact questions, diff, accept/reject/undo, projected and actual deltas            | Fact-invention adversarial suite, version lineage, concurrent edit and browser state matrix       |
| Artifact export          | Downloadable report only                                                          | Profile templates for PDF/DOCX and later LaTeX, with compile/render and parse-back status                        | Critical-field/text/order/link parity, overflow, A4/Letter, accessibility and sandbox tests       |
| 404/error                | Bare and inconsistent metadata                                                    | Branded recovery page with stable status and request ID                                                          | HTTP and browser assertions                                                                       |
| Account/privacy          | Missing                                                                           | Profile, consent, export, deletion, session management                                                           | End-to-end privacy tests                                                                          |
| Billing                  | Missing                                                                           | Plan, usage, checkout/portal, entitlement states                                                                 | Webhook replay/idempotency tests                                                                  |
| Enterprise admin         | Missing                                                                           | Members, roles, SSO policy, audit export                                                                         | Tenant isolation and role matrix                                                                  |

### Accessibility and motion contract

- WCAG 2.2 AA target.
- Every route has one `<h1>`, unique title, logical landmarks, and a skip link.
- Visible `:focus-visible` styles are never removed without replacement.
- Errors are programmatically associated with fields and announced through `aria-live`.
- Accordions expose `aria-expanded`, `aria-controls`, stable IDs, and regions.
- Scores and progress expose accessible names, values, and text equivalents.
- Color is never the only signal.
- Animation honors `prefers-reduced-motion`; task completion never depends on animation.
- Layout and motion verification covers 390, 768, 1024, 1366, and 1440 CSS-pixel widths.

## 13. Security and privacy architecture

### Trust boundaries

1. Browser to web service.
2. Web/worker to database and object storage.
3. Worker to PDF/OCR libraries.
4. Worker to LLM provider.
5. Billing and identity webhooks to web service.
6. Tenant administrators to enterprise policy controls.
7. Worker to document/OCR provider and taxonomy/market-data source.
8. Worker to PDF/DOCX renderer and isolated LaTeX compiler.

### Required controls

- Secure, HTTP-only, SameSite session cookies; rotation and bounded lifetime.
- Authorization in every loader/action/service, with tenant isolation tested at both application and data-policy layers.
- CSRF/origin checks for state-changing browser requests.
- CSP, HSTS, frame, MIME-sniffing, referrer, and permissions headers.
- Secrets from a managed secret store; startup validation; no `.env` in Docker contexts.
- File/body/page/text/token/time limits before expensive work.
- Quarantine and sandboxing for PDFs; malware scanning based on deployment risk.
- Renderer inputs come from validated canonical data; LaTeX uses allowlisted templates/packages, complete escaping, no shell escape/network/host access, and hard process/resource limits.
- Generated artifacts remain private and are not recommended until parse-back verification passes.
- Shared rate limits, quotas, concurrency caps, and provider cost kill switches.
- Encryption in transit and at rest, short-lived signed URLs, and access audit.
- Generic client errors and structured protected logs with PII redaction.
- Explicit consent before LLM transfer, documented purpose, retention, subprocessor record, export, correction, and deletion.
- Dependency, provenance, container, and secret scanning in CI.

## 14. Reliability, performance, and observability

Initial SLOs are proposals and require human approval plus measured baselines:

| Signal                   | Proposed objective                                                 |
| ------------------------ | ------------------------------------------------------------------ |
| Web availability         | 99.9% monthly for authenticated core pages                         |
| Non-analysis API latency | p95 under 500 ms excluding upload transfer                         |
| Analysis acceptance      | p95 under 1 s to create a durable queued job                       |
| Analysis completion      | p95 target established from corpus before launch                   |
| Job terminal-state rate  | At least 99% complete, partial, rejected, or explicit failed state |
| Cross-tenant access      | Zero tolerated                                                     |
| Data-loss objective      | RPO and RTO explicitly approved after restore drill                |

Required telemetry:

- Structured logs with request, tenant, user, analysis, run, and correlation IDs; never raw resume text.
- RED metrics for routes and worker stages.
- Queue depth, lease age, retry count, provider error, token usage, and cost metrics.
- Browser Core Web Vitals and client error reporting with PII scrubbing.
- Alerts on symptoms: sustained error rate, stalled jobs, queue age, cost anomaly, readiness failure, and SLO burn.
- Runbooks for provider outage, worker backlog, corrupt upload, compromised key, failed migration, and rollback.

Static hashed assets receive immutable caching. Large GIFs should be replaced with optimized video/WebP or CSS motion; the PDF worker should be versioned and cached.

## 15. Deployment architecture

- Reproducible frozen install in CI.
- Supported runtime version pinned across local development, CI, and containers.
- Multi-stage container with minimal runtime files, non-root user, init/signal handling, health check, and immutable base-image digest policy.
- Separate web and worker commands from the same tested artifact, deployed initially as Fly.io process groups in Mumbai.
- Environment-specific configuration from a secret/config manager.
- Managed TLS, CDN/static caching, web application firewall where appropriate, and restricted egress from workers.
- Forward-compatible database migrations with expand/migrate/contract sequencing.
- Staging smoke tests, production canary, monitored rollout, and tested rollback.
- Backups are not considered valid until a restore drill passes.

## 16. Testing architecture

| Level           | Scope                                                       | Required examples                                                                                      |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit            | Parser, rules, normalization, score bands, schemas          | Boundaries, international formats, skipped rules, deterministic reruns                                 |
| Contract        | API schemas, provider adapter, storage adapter              | Schema drift, refusal, timeout, malformed provider output                                              |
| Integration     | DB, storage, queue, authenticated routes                    | Ownership, idempotency, retry, durable status, deletion                                                |
| Security        | Upload abuse, authz, CSRF, rate limits, headers             | Oversize/spoofed/malformed files, cross-tenant IDs                                                     |
| Browser E2E     | All user journeys                                           | Upload, progress, result, refresh, retry, delete, billing states                                       |
| Accessibility   | Axe plus keyboard/screen-reader manual checks               | Focus, announcements, accordion, score semantics                                                       |
| Performance     | Web and worker corpus benchmarks                            | Core Web Vitals, extraction/AI latency, memory, concurrency, cost                                      |
| Resilience      | Dependency and process failure                              | Worker kill/reclaim, provider outage, DB/storage timeout                                               |
| Metamorphic     | Semantics-preserving and adversarial transformations        | Whitespace/order/alias stability, duplication, stuffing, prompt injection, protected-name substitution |
| Corpus validity | Locked representative per-segment evaluation                | Native/OCR error, field/requirement F1, evidence validity, expert agreement, confidence intervals      |
| Artifact        | Render/compile and parse-back verification                  | Critical fields, text/order/link parity, overflow, A4/Letter, accessibility, resource limits           |
| External        | Named domain, recruiter panel, and ATS/provider environment | Construct validity, vendor-observed behavior, limitations, reproducibility                             |

Implemented verification commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:load
npm run test:restore
npm run benchmark:phase5
npm run build
npm audit --omit=dev --audit-level=high
npm run verify:ci
```

## 17. Architecture gates

| Gate                            | Approval required before                           | Evidence                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0 Architecture                 | Any broad implementation                           | Capability map, ADR choices, product mode, data retention, SLO proposals approved                                                                                               |
| A1 Reliable MVP                 | Persistence/auth expansion                         | Production configured E2E, visible errors, safe uploads, patched dependencies, CI green                                                                                         |
| A2 Durable candidate product    | Accuracy/polish expansion                          | Auth, durable results, ownership, deletion/export skeleton, worker recovery verified                                                                                            |
| A3 Synthetic scoring regression | Existing analyzer iteration                        | PASS 2026-09-11: current synthetic Phase 5 thresholds are reproducible and claim limitations are recorded; this is not representative, OCR, domain, vendor, or outcome validity |
| AA0 Accuracy-v2 architecture    | Accuracy-v2 implementation                         | Proposed score/evidence contracts, corpus governance, provider bake-off, first domain/locale, and ADR-0006/0007 approved                                                        |
| AA8 Domain validity             | Domain/industry-level claim                        | Locked representative corpus, per-segment lower confidence bounds, expert agreement, truthfulness, fairness, render parity, and independent claim review pass                   |
| AA9 Recruiter/vendor pilot      | Recruiter-facing calibration or named-vendor claim | Candidate validity, controlled named environment, legal/fairness/security review, notice, correction/appeal, and human oversight pass                                           |
| A4 B2C launch                   | Billing rollout                                    | Monitoring, privacy documents, backups/restores, staged rollout and rollback verified                                                                                           |
| A5 Enterprise pilot             | External employer access                           | Tenant isolation, RBAC, audit, SSO plan, legal/security review, human oversight                                                                                                 |
| A6 Enterprise GA                | General availability                               | Pilot SLOs, incident response, support, DR, procurement artifacts, independent review                                                                                           |

No gate is passed by documentation alone. A human owner records approval and links the evidence.

## 18. Approved decisions and open questions

The workspace owner approved the following candidate B2C baseline on 2026-09-09:

- Node.js 22 LTS; React Router modular monolith with separate web and worker processes.
- Fly.io deployment in Mumbai; Supabase PostgreSQL 17, Auth, and private Storage in `ap-south-1`.
- PostgreSQL-backed leased jobs sized initially for 100 analyses per day and five concurrent analyses.
- Thirty-day active resume retention, immediate removal of active access after deletion, and provider-governed backup expiry.
- 99.5% monthly availability, 24-hour RPO, and 4-hour RTO for the MVP.
- OCR remains disabled behind an adapter until a provider is separately selected.
- Portable SQL, storage, and identity adapters preserve a vendor-exit path.
- The workspace owner holds product, privacy/security, scoring-quality, cost, operations, and release ownership until delegated.
- The existing A3 result is approved only as a synthetic regression gate. Accuracy-v2 AA0 design is approved through ADR-0009; representative-corpus validity and industry/vendor claims remain open.

Still required to close Gate A0:

1. Approve maximum analysis duration, retry count, and dead-letter procedure.
2. AA0 design decisions for ADR-0006 are approved through ADR-0009. Numeric weights remain hypotheses; calibration and implementation acceptance are still required. No LLM-generated score weight is approved.
3. Define the initial B2C payment model and entitlement limits.
4. Gate AA0 passed 2026-10-04: software engineering / English / India, synthetic local OCR evaluation, corpus governance and PDF/DOCX export scope. Execution prerequisites and later release gates remain open.

Until the remaining A0 decisions and relevant execution/release gates pass, implementation must preserve current provider and claim boundaries. AA0 approval does not approve production or any industry, vendor, or outcome-calibrated claim.

### AA4 local engineering (2026-10-12)

Owner-accepted E-004 authorizes AA040–AA046 synthetic localhost engineering while upstream formal gates remain open. The versioned diagnostics engine/read model, source-bound readiness, technical traces, typed alignment, cited prose without numeric model authority, legacy presenter and validity/error/bootstrap harness are implemented. The default-off `SCORING_V2_ENABLED` route has no numeric scoring activation, no new storage migration and no readiness aggregate. See [AA4 closeout](docs/evaluation/AA4_ENGINEERING_CLOSEOUT.md) for actual verification and the remaining formal calibration/domain/expert/fairness/comprehension obligations.

### AA5 local authoring (2026-10-12)

Owner-approved ADR-0014/E-005 permits AA050–AA057 local engineering. The default-off analysis editor, finding navigation, strict suggestion/clarification contracts, grounded patterns, transactional authoring ledger, candidate undo/restore and synthetic adapter benchmark are implemented. Numeric deltas remain withheld and actual model/candidate/domain evaluation remains open. See [AA5 closeout](docs/evaluation/AA5_ENGINEERING_CLOSEOUT.md) and [authoring design](docs/design/CANDIDATE_AUTHORING_WORKSPACE.md).

### AA6 local verified core rendering (2026-10-14)

Owner-approved [ADR-0015](docs/decisions/0015-aa6-local-engineering-sequencing.md) permits local AA060–AA065 engineering. A private, default-off semantic preview and one shared single-column PDF/DOCX template now render confirmed canonical versions. Independent parse-back blocks missing/changed text, wrong order, links or layout before download. The known-synthetic matrix passes; representative corpus, approved viewer and assistive-technology acceptance remain open. See [AA6 closeout](docs/evaluation/AA6_ENGINEERING_CLOSEOUT.md).
