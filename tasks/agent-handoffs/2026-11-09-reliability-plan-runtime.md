# Reliability repair plan: runtime, security and verification

Planning only, 2026-11-09. Authoritative source is root main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus the preserved dirty 615-input candidate. No application/test/configuration changes, execution of application checks, provider calls, Docker operations, DB access, migration, publication or deployment were performed for this plan. Every task below is **PROPOSED / NOT STARTED**. The coordinator assigns final migration timestamps, owners and worktrees before implementation.

Pricing remains parked and services remain free of commercial charges. Technical spend/abuse budgets are separate from commercial entitlements: this plan must not activate INR 300, the future 10/1 allowance or a paid Build gate. Keep candidate ownership/consent, immutable versions, score withholding, failed receipts, default-off flags and current numerical floors. Sole owner plus AI technical reviewers is sufficient for current engineering review; no reviewer team is requested. Real customer/domain evidence remains a later opt-in stage.

## Baseline and dependencies

The completed consumer audit supplies the evidence; do not repeat it to discover the same failures. CV01 has two HTTP 401 attempts despite a fresh authoritative-root credential read and a clean source/format/precedence diagnostic. That does not prove which key/account/project condition failed. CV02 has two BuildKit asset-fetch failures despite a matching bounded host download. No current LaTeX image exists. An independent OCR worker does exist at `sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c`; four real-runtime checks passed, but block-glyph accuracy failed and the consumer caller supplies no OCR adapter. Normal-font 72/72 fields across nine documents/three authored families are diagnostic evidence only.

Current qualitative transport leaves the installed SDK's two-retry default; the audit deliberately used a zero-retry adapter. Current budgets read successful usage before provider work; Build uses a separate conservative bucket. These are not a unified atomic attempt reservation. Global `claim_analysis_job` also sweeps expired jobs and claims any eligible organization before a caller can filter its result. Client-side allowlisting after a claim is unsafe on the shared configured project.

Implement source-only deterministic slices first, with targeted regression evidence after each change. Hosted schema application, provider spending, managed configuration, isolated load/restore and final launch decisions occur at their actual side-effect boundary. Planning and local code preparation do not authorize those effects. Preserve the original 401/build failures and failed assertions after repairs.

## Proposed bounded tasks

All listed files count toward the five-file maximum, including tests/docs. A `<timestamp>` migration is one new coordinator-assigned file; no date/order is invented here. If implementation needs another file, split the task before editing. Dependencies named “ATS” or “frontend” refer to the other planning agents' integrated tasks rather than parallel ownership of their files.

### RT01: safe AI doctor and explicit readiness

**Files (5):** new `app/lib/server/ai-readiness.ts`; new `scripts/doctor-ai.ts`; new `tests/unit/ai-readiness.test.ts`; `package.json`; `docs/operations/RUNBOOKS.md`.

**Depends:** plan acceptance; no provider prerequisite for the offline doctor. Check authoritative env path, parser/precedence, server-cache restart, exact allowed endpoint/model and required setting presence. Return only safe booleans/status categories. Never print key fragments, hash credentials, guess keys, select a production fallback, silently swap `.env.production` or create a key. A separately selected `--live` mode must require a bounded explicit allocation and make one request with no retry; sanitize allowed status/error codes rather than provider messages.

**Acceptance/check:** offline fixture tests for duplicates, quotes/whitespace, missing/wrong source, inherited overrides and cached configuration. The proposed `npm run doctor:ai` does not exist yet; document offline default versus explicit live mode. A valid shape is not valid authentication. On repeated 401 stop; the owner resolves the configured credential/account/project through their secure local/provider workflow. **Rollback:** remove the doctor command if necessary; keep AI disabled/partial, never weaken ATS or auth checks.

### RT02: bounded provider attempts and usage on rejected output

**Files (5):** `app/lib/server/qualitative-ai.ts`; `app/lib/server/rewrite-ai.ts`; `tests/unit/qualitative-ai.test.ts`; `tests/unit/rewrite-ai.test.ts`; new `app/lib/server/provider-attempt.ts`.

**Depends:** RT01 source contract. Make retries zero at the SDK layer, redirects fail, official egress enforced, storage/logging settings explicit, and total attempts owned by one durable policy. Preserve known usage even for refused/schema-invalid/truncated output; represent unavailable/ambiguous usage as unknown, not zero. A timeout must abort transport rather than merely abandon a promise. Keep actual provider attempts separate from one logical user operation.

**Acceptance/check:** deterministic mock tests for 401/403/404/429/5xx, bounded timeout, refusal/malformed JSON, missing/invalid usage, aborted fetch and exact no-retry/no-redirect options. Existing `npm test -- tests/unit/qualitative-ai.test.ts tests/unit/rewrite-ai.test.ts tests/unit/build-assist-provider.test.ts` is available; Build's existing zero-retry behavior must stay green. No live call is needed to implement this slice. **Rollback:** restore the previous code artifact with AI off; retain unknown-cost receipts and do not resume retries automatically.

### RT03: atomic technical AI budget contract

**Files (5):** new `app/lib/server/ai-budget.ts`; new `supabase/migrations/<timestamp>_technical_ai_budget.sql`; new `tests/unit/ai-budget.test.ts`; new `tests/integration/ai-budget.test.ts`; new `docs/operations/AI_BUDGETS.md`.

**Depends:** RT02 attempt identity. Design a server-owned reserve/settle/release/reconcile ledger for technical tokens/cost, binding organization, operation, payload/policy/model version, period and attempt identity. Reserve pessimistically before dispatch under one transaction/lock. Charge/record every actual attempt, including invalid output. A pre-dispatch failure can release; cancellation after dispatch or unknown usage must retain a conservative pending reservation until reconciled. No automatic refund or expiry can mint spend capacity. Keep safety limits while measuring why the existing 100,000/25,000 defaults allow only four Build reservations.

**Acceptance/check:** pure concurrent-boundary model first; actual concurrent transaction proof only on an explicitly approved isolated direct Supabase target. Cover last-unit races, replay/conflicting hash, cross-tenant denial, late settlement across period end, crash, unknown usage and append-only reconciliation. SQL review and target approval precede hosted application; no Docker DB/reset. **Rollback:** forward-compatible schema remains; disable AI admission if uncertain, preserve the ledger and reconcile instead of resetting totals.

### RT04–RT06: bind each provider entry point to RT03

- **RT04 files (3):** `app/lib/server/qualitative-stage.ts`, `tests/unit/qualitative-stage.test.ts`, `tests/unit/qualitative-stage-outage.test.ts`.
- **RT05 files (3):** `app/lib/server/rewrite-service.ts`, `tests/unit/rewrite-service.test.ts`, new `tests/unit/rewrite-budget.test.ts`.
- **RT06 files (3):** `app/lib/server/build-assist-service.ts`, `tests/unit/build-assist-service.test.ts`, new `tests/unit/build-assist-budget.test.ts`.

**Depends:** RT03 accepted local contract; persistence verification additionally needs its approved schema/target. Each is a separate task. Authenticate membership/consent and atomically reserve before its SDK call; settle even if result persistence fails; retain exact request ownership and no provider on unknown policy. Do not turn existing rate-limit attempts into customer billing. Preserve request/concurrency controls and content-free audit.

**Acceptance/check:** entry-point mocks prove zero calls on denied/reservation failure, one debit for exact replay and no cross-path double spending; live controlled concurrency later proves the shared ledger. Use the named existing unit files; new test paths are proposed. **Rollback:** feature off/partial state, with durable unsettled attempts retained. No “all services free” exception permits unlimited provider work.

### RT07: payload-bound durable analysis admission

**Files (5):** `app/lib/server/analysis-ingestion.ts`; `app/routes/api.analyze.ts`; new `supabase/migrations/<timestamp>_analysis_admission_binding.sql`; `tests/integration/api-analyze.test.ts`; new `scripts/verify-analysis-admission.ts`.

**Depends:** RT03 transaction semantics; coordinate shared migration ordering. Bind idempotency to authenticated organization and exact PDF/JD/request-policy inputs. Commit job/reservation together, or provide durable idempotent compensation. Exact replay returns its original operation and removes only its duplicate upload; conflicting reuse denies before new work. Preserve anti-abuse admission separately.

**Acceptance/check:** duplicate, mismatched payload/key, concurrent final admission, storage success/DB failure, cleanup failure and deleted/revoked membership. The new verification driver is proposed and must require an exact fixture ledger/approved Supabase target; it cannot silently use production. **Rollback:** stop new admissions if the old artifact cannot honor the new binding; preserve existing jobs/versions and reconcile owned orphan objects, never broad-delete storage.

### RT08: durable lease fencing and safe verification scope

**Files (5):** `app/lib/server/jobs.ts`; `app/lib/server/worker-runner.ts`; new `supabase/migrations/<timestamp>_lease_fencing_and_verification_scope.sql`; `tests/unit/worker-runner.test.ts`; new `scripts/verify-lease-fencing.sql`.

**Depends:** RT07 job identity. Carry an opaque attempt/lease fence from claim through heartbeat, completion and final writes; a reclaimed worker must not commit after losing ownership. If a shared-project verification RPC is needed, atomically scope **every** mutation, including expired-job/dead-letter scans, to an explicit server-approved synthetic fixture set. Never claim globally and filter afterward. Keep service-only grants, bounded arguments and fixed search paths. This scoped RPC is not evidence that the unscoped global queue was tested.

**Acceptance/check:** deterministic lease expiry/race/duplicate heartbeat/complete/foreign fence cases, followed by transaction tests on the reviewed target. Hosted application is separately approved. **Rollback:** pause workers/admission if fencing is unavailable; do not bypass ownership or downgrade stored fences.

### RT09: cancellation reaches providers and stage deadlines

**Files (5):** `app/lib/server/qualitative-ai.ts`; `app/lib/server/qualitative-stage.ts`; `app/lib/server/rewrite-ai.ts`; `app/lib/server/rewrite-service.ts`; new `tests/unit/provider-cancellation.test.ts`.

**Depends:** RT02; implement an optional backwards-compatible abort contract before RT10 consumes it. Link request abort, deadline and lease loss to actual SDK fetch cancellation. Do not accept late output, falsely claim cancellation refunded spend, or mutate a newer draft. Preserve the previous saved draft when outcome is uncertain; settle RT03 consistently.

**Acceptance/check:** controlled pre-dispatch abort, in-flight abort, provider ignoring abort, timeout/late response, client disconnect and persistence race. Proposed new tests supplement existing rewrite/provider suites without a live provider. **Rollback:** AI off; retain unresolved attempt reservation and previous versions.

### RT10: stage writes and worker shutdown respect the fence

**Files (5):** `app/lib/server/analysis-worker.ts`; `app/lib/server/extraction-stage.ts`; `app/lib/server/scoring-stage.ts`; `app/lib/server/qualitative-stage.ts`; new `tests/unit/analysis-worker-fence.test.ts`.

**Depends:** RT08/RT09; coordinate this sequential edit of `qualitative-stage.ts` after RT04/RT09. Revalidate the fence before each durable transition/result; stop work after lease loss, revocation, deletion or shutdown. Bound graceful shutdown and cleanup; an aborted processor must not complete the job as a successful new result. Preserve valid terminal/review states and safe deterministic partial output.

**Acceptance/check:** stage-boundary crash, old-worker late completion, cancellation before/after result write, two workers racing and restart recovery. Existing worker/extraction/scoring/qualitative tests plus proposed fence tests are local evidence; real leased behavior requires RT11. **Rollback:** pause dispatch; retain completed immutable versions and resume only with matching attempt ownership.

### RT11: actual leased queue lifecycle in a safe target

**Files (4):** new `scripts/verify-leased-worker.ts`; new `tests/integration/leased-worker.test.ts`; `docs/operations/WORKER_DEPLOYMENT.md`; `package.json`.

**Depends:** RT07–RT10 and a **confirmed** isolated direct Supabase target. None is currently confirmed available. The existing `scripts/run-worker-once.ts`, `npm run dev` and worker start commands can claim globally; do not run them against the shared configured project merely because a snapshot looks empty. A shared queue can receive another job immediately, and the current claim function also sweeps expired jobs.

**Acceptance/check:** in an isolated project/branch/schema arrangement whose actual routing and schema compatibility have been verified, run the real unscoped queue with two workers, heartbeats, worker kill/reclaim, delay/retry cap/dead letter, cancellation, readiness failure, restart and exact fixture cleanup. Measure actual outcomes/costs, no unrelated jobs. If only the shared target exists, run RT08's exact-scoped contract tests and mark the **global leased-worker gate blocked**; do not substitute direct processing, mocks, a Docker DB or inferred empty-queue safety. Provisioning/cost/schema application needs the owner's concrete target decision at that boundary. **Rollback:** stop only owned worker processes, preserve unresolved leased fixtures, and reconcile exact IDs before cleanup.

### RT12: reproducible compiler artifact retrieval/build

**Files (5):** `scripts/latex-runtime/Dockerfile`; new `scripts/latex-runtime/prefetch-inputs.py`; new `tests/unit/latex-build-inputs.test.ts`; `docs/operations/LATEX_CONVERTER.md`; new `scripts/verify-latex-build-inputs.ts`.

**Depends:** CV02 failure receipt, not new blind retries. Separate transport from artifact identity: prefetch the exact pinned public asset with bounded downloads, verify its existing checksum and upstream/archive provenance/license, and consume only a reviewed immutable local build input or verified cache. Review any remote-ADD-to-local-input Dockerfile change as a recipe change; never replace a missing checksum with a tag, mirror trust assumption, host package, broad mount or newer unreviewed version. Keep native Expat/Poppler/FreeType proofs, license closure, offline native build steps and resource/security assertions.

**Acceptance/check:** pure checksum/missing/tampered input tests, then one explicit worker-only build with disk/time limits and an exact digest receipt. Measure fresh and verified-cache builds; nonidentical IDs need explained package/provenance binding, not a reproducibility claim. BuildKit network recovery can be separately attempted only with diagnosed evidence; preserve both prior failures. **Rollback:** no config promotion; retain the last source-bound artifact or keep compilation off. No database/image cleanup beyond exact owned artifacts.

### RT13: known missing image versus ambiguous cleanup

**Files (3):** `app/lib/server/latex-sandbox.ts`; `tests/unit/latex-sandbox.test.ts`; `scripts/verify-latex-rollback.ts`.

**Depends:** RT12 identity contract; missing-image cases can be developed with mocks before a real image exists. Preflight the exact local immutable image before a source-bearing create. A proved absent image returns unavailable without speculative deletion or permanent quarantine. Keep quarantine for timeout/disconnect/ambiguous create, ownership mismatch, unknown resource or failed cleanup. A preflight race still requires conservative reconciliation.

**Acceptance/check:** no-image, image removed after preflight, create error/timeout/late-created container, foreign/abandoned container, daemon loss and restart. Preserve the original expected-unavailable/actual-cleanup-failed receipt. No source is sent before identity/confinement prerequisites; no automatic pull or host fallback. **Rollback:** current conservative fail-closed behavior; never broadly clear quarantine.

### RT14: real compiler/PDF/confinement acceptance

**Files (5):** `scripts/verify-latex-sandbox.ts`; `scripts/verify-latex-render-parity.ts`; new `scripts/verify-latex-current-render.ts`; `e2e/latex-converter.spec.ts`; `docs/operations/LATEX_CONVERTER.md`.

**Depends:** RT12/RT13, exact image, serialized owned runtime/browser allocation and the frontend Build repair tasks. Existing commands: `npm run verify:latex -- <digest>`, `npm run benchmark:latex -- <digest>`, `npm run verify:latex:rollback -- <digest>` and approved `npm run test:e2e:latex`. Exercise actual Landlock rights, filesystem/process/network/shell denial, non-root/no mounts, source/body/output limits, malformed/active PDF, memory/CPU/PID/file/time caps, cancellation/concurrency and exact cleanup. Verify fonts/glyphs/text/order/links, all six profile/paper cases, accessible fallback and actual apply/undo/invalidated-preview/download behavior.

The existing paired-render command hardcodes an absent historical baseline. Recover a provenance-bound baseline before that comparison or add a separately named current-candidate semantic/render check; never pass one candidate twice or weaken its old assertion. Record PNGs only from neutral fixtures. **Acceptance:** all supported cases and negative controls pass on the exact current image; known unsafe/unsupported input is refused with useful recovery. OS security clearance remains RT20. **Rollback:** disable compilation; exact owned cleanup, previous compatible code/image only, preserve all failed receipts.

### RT15: consumer OCR activation and privacy contract

**Files (5):** `app/lib/server/ocr/selective.ts`; `app/lib/server/config.ts`; `tests/unit/ocr/selective.test.ts`; new `docs/operations/OCR_WORKER.md`; new `docs/decisions/<next>-consumer-local-ocr.md`.

**Depends:** ATS planner's supported OCR/quality policy and RT21 privacy map. The current `synthetic_local_test` policy cannot be relabelled as real candidate authorization. Define a distinct server-created processing purpose, owned source binding, consent/retention/location disclosure, permitted local adapter/version, technical resource allocation and default-off activation. No new cloud OCR provider or Google account is implied. Keep confidence uncalibrated, ordinary uncertainty visible and score withholding intact.

**Acceptance/check:** schema/policy tests reject browser-manufactured allocation, unapproved real processing, wrong owner/source/region/retention, legacy ambiguous evidence and unsafe OCR output. Local implementation uses synthetic fixtures; any real-data or deployment activation requires its exact purpose/target authorization later. **Rollback:** flag off and unsupported/review response; retain immutable prior evidence and compatible producer semantics.

### RT16: wire the approved OCR worker into the actual owned path

**Files (5):** `app/lib/server/document-extraction.ts`; `app/lib/server/extraction-stage.ts`; new `app/lib/server/ocr/local-admission.ts`; `tests/unit/document-extraction.test.ts`; new `scripts/verify-consumer-ocr.ts`.

**Depends:** RT15, RT03/RT08 resource/fence contracts and ATS OCR acceptance. Supply an approved adapter through server-owned durable admission rather than a browser parameter or synthetic-only bypass. Preserve native pages, select only required pages, reconcile exact source IDs/geometry, and persist attempt/failure/review state atomically. Do not run recognition merely because the image exists.

**Acceptance/check:** synthetic native/scanned/mixed/no-glyph/corrupt/encrypted/deadline/cancel cases through actual managed ingestion/extraction/review, then RT11's real leased path. Owner-scoped direct extraction first proves integration without claiming unrelated jobs; it does not replace leased evidence. No provider calls or DDL are hidden in the proposed driver. Exact stored object/job/owner cleanup is mandatory. **Rollback:** disable OCR only, preserve native extraction and honest unsupported/review behavior.

### RT17: OCR regression/quality and frozen failure disposition

**Files (5):** `scripts/verify-ocr-pilot.ts`; `app/lib/server/ocr/profiles.ts`; new `tests/fixtures/ocr-supported-development.ts`; new `tests/fixtures/ocr-supported-heldout.ts`; new `docs/evaluation/OCR_RELIABILITY_PROTOCOL.md`.

**Depends:** ATS planner owns the quality contract; implement only the agreed smallest algorithm/profile repair here. Preserve original block-glyph failures (legacy scanned 13/76; fusion 14/76), thresholds, all consumed regression sets and native controls. Do not fit the nine-document field sample and claim general accuracy. New synthetic family labels/partitions must be recorded before a frozen candidate evaluates them; consumed labels remain consumed. No representative real corpus is invented or requested now.

**Acceptance/check:** existing `test:ocr:local`, `test:ocr:adverse`, `test:ocr:fields` prove runtime; `test:ocr:pilot -- ... --require-quality` and locked engineering commands remain separate quality gates. A green diagnostics exit cannot replace quality acceptance. Retain failures and abstain/review unsafe evidence; unsupported-class policy changes need an explicit reviewed scope decision rather than quietly dropping hard inputs. **Rollback:** prior version/profile with original receipts; keep activation off if adopted quality requirements remain unmet.

### RT18: direct-Supabase, non-destructive CI contract

**Files (5):** `.github/workflows/ci.yml`; `package.json`; new `scripts/verify-managed-db.ts`; new `tests/unit/managed-db-verifier.test.ts`; new `docs/operations/MANAGED_TESTING.md`.

**Depends:** confirmed approved target/schema and RT19 fixture ownership. Current CI runs `npx supabase start` and `npm run test:db`, which reset a Docker database; those commands are forbidden under the owner's standing instruction. The managed verifier must also reject legacy Docker-based restore commands such as `test:aa2:restore`; synthetic `test:restore`/`test:load` remain separate simulations, not replacements for missing real drills. Rewire database verification to direct Supabase without resetting, provisioning implicitly or disabling assertions. Review each SQL test's writes; only approved transactional/exact synthetic fixtures may run. Split any SQL rewrites into further tasks of at most five files.

**Acceptance/check:** fixture/mock target guards first; real target execution later verifies all retained applicable schema/RLS/transaction contracts. Missing target/secrets must report unavailable and leave its required gate open, never silently skip to green. Snapshot the relevant migration state, inspect current official Supabase docs/changelog before implementation, and do not use dashboard tools as an iterative migration scratchpad. **Rollback:** keep the DB gate visibly blocked; do not restore Docker DB commands as the workaround.

### RT19: exact cleanup and privacy-deletion recovery

**Files (5):** `tests/fixtures/latex-auth.ts`; new `scripts/cleanup-consumer-fixtures.ts`; new `tests/unit/fixture-cleanup.test.ts`; `app/lib/server/privacy-worker.ts`; `tests/unit/privacy-operations.test.ts`.

**Depends:** RT18 target guard; coordinate fixture changes with frontend tests. Journal exact synthetic owner/org/job/object/rate-key identities before mutation, distinguish active session revocation from user deletion, and prove zero allowlisted residuals. Retain failed cleanup state for durable retry; never broaden prefix deletion, truncate tables or clean other projects. Do not log source text, cookies or credential material.

**Acceptance/check:** mid-setup/mid-provider/crash/timeout failures, storage deletion denial, cascade failure and repeated cleanup. Owner deletion alone does not establish old token invalidation. Real deletion/retention behavior uses exact synthetic fixtures and recorded retention policy, not a production purge. **Rollback:** stop the fixture runner; reconcile exact ledger records before deleting anything else.

### RT20: dependency and worker-image advisory closure

**Files (5):** `.github/workflows/ci.yml`; `scripts/ocr-runtime/Dockerfile`; `scripts/latex-runtime/Dockerfile`; `docs/security/THREAT_MODEL.md`; new `docs/evaluation/DEPENDENCY_DISPOSITION.md`.

**Depends:** buildable exact images; staged sequentially after RT12/RT18 shared-file changes. Current production npm audit is zero; it does not clear native images. Existing CI scans only the main production image, ignores unfixed advisories and filters high/critical output. Retain a full unsuppressed, timestamped advisory/SBOM record for main, OCR and LaTeX worker images; classify vendor applicability and runtime reachability separately. Preserve historical AA7 raw advisories and the 70/71 signer test exception rather than rewriting them as fixed.

**Acceptance/check:** current `npm audit signatures`, production npm audit and existing container checks, plus exact-image scanning using the reviewed scanner contract. Scanner/tool DB downloads are a separately inspected side effect. Any package/native remediation is a separate at-most-five-file task with hashes/license/provenance and functional/security regressions; do not combine mass upgrades here. Untreated critical/high findings continue to block A4 unless a specifically applicable documented owner exception is accepted; this plan grants none. **Rollback:** affected capability off/prior reviewed artifact; retain raw findings, no suppression to manufacture closure.

### RT21: privacy, tenant/security and password exposure readiness

**Files (5):** `docs/security/PRIVACY_DATA_MAP.md`; `docs/security/THREAT_MODEL.md`; `docs/security/EGRESS.md`; `tests/unit/privacy.test.ts`; new `tests/integration/tenant-security.test.ts`.

**Depends:** source-only document recovery can start immediately after implementation approval; integration target later. Current `PRIVACY_DATA_MAP.md` contains the Accuracy-v2 implementation plan and mismatched relative links, not a data map. Preserve/provenance-review that dirty content before replacing it with the actual browser/auth/upload/Supabase/OCR/OpenAI/Build/export/retention/deletion flow. Include transient versus stored data, purpose/consent, retention, subprocessors, backups, content-free telemetry and deletion exceptions.

**Acceptance/check:** stale session/revocation, cross-owner/org/version/artifact access, consent withdrawal mid-flight, signed URL TTL, private storage, service-only RPC grants, CSRF/origin/CSP and output escaping. Keep private RLS-without-policy notices distinct from exposure; do not add broad policies to silence an adviser. Password-leak protection is disabled: verify current availability/terms before a concrete hosted setting change, and keep public password launch gated until the chosen protection is addressed. External egress/region enforcement needs actual deployment evidence later. **Rollback:** deny unsafe boundary/disable affected capability; never grant broader tenant access or weaken consent.

### RT22: privacy-safe operational signals and delivery

**Files (5):** `app/lib/server/observability.ts`; `tests/unit/observability.test.ts`; `docs/operations/ALERTS.json`; `docs/operations/OBSERVABILITY.md`; new `scripts/verify-observability-path.ts`.

**Depends:** RT02/RT03/RT08 event identities. Report actual queue age/lease loss, provider attempts/unknown usage, stuck reservations, OCR/compiler unavailable/cleanup, DB/storage failure and readiness with bounded labels; never raw content or secrets. Keep no-sample/unknown distinct from zero. Local fixtures can test emission/redaction without contacting anyone.

**Acceptance/check:** one synthetic HTTP→job→stage→attempt path correlates with aggregate counters; deterministic error redaction passes. Real sink/notification delivery is a later explicitly allocated action naming the receiver, not authorization to message people now. Current SLOs are proposals, not achieved service levels. **Rollback:** disable unsafe telemetry/sink while retaining safe local diagnostics and spend kill switches.

### RT23: actual capacity, concurrency and recovery soak

**Files (4):** new `scripts/load-test-live.ts`; new `tests/unit/live-load-guard.test.ts`; `docs/operations/LOAD_RECOVERY.md`; `package.json`.

**Depends:** RT11 isolated target, RT22 signals, core product repairs and exact worker images. `npm run test:load` is currently a deterministic simulation. Add a clearly separate proposed live command with explicit target/owner/run ledger, bounded workload/time/resource budget, provider fixture and hard stop. Do not aim at production or the unisolated shared queue.

**Acceptance/check:** proposed baseline remains 100 analyses/five concurrent slots unless an approved capacity decision changes it; measure real HTTP latency, queue age/throughput, DB pool pressure, RSS/cgroups, errors, duplicate work/cost, browser polling, worker kill/reclaim and provider throttling. Set acceptance against the adopted runbook SLO/thresholds, not invented convenient numbers. A short soak is not monthly availability. **Rollback:** stop owned generators/workers, disable admission if needed, drain/reconcile exact jobs and preserve receipts.

### RT24: real isolated restore and historical compatibility

**Files (4):** new `scripts/verify-managed-restore.ts`; `tests/unit/backup-restore.test.ts` (new if absent); `docs/operations/BACKUP_RESTORE.md`; new `tests/unit/managed-restore-guard.test.ts`.

**Depends:** an actually available isolated direct Supabase restore target, RT19 exact manifests and deployment/provider capabilities verified at execution. `npm run test:restore` only compares synthetic in-memory manifests today; it is not a real drill. The existing `npm run test:aa2:restore` invokes `scripts/verify-canonical-restore.ts`, which requires `AA2_TEST_DB_CONTAINER` and uses `docker exec` against PostgreSQL. It is forbidden under this owner's no-Docker-database instruction, even for an isolated container. Do not execute or wrap it as a managed-target verifier. RT24 must create the **new guarded** `scripts/verify-managed-restore.ts`; no current safe real managed-restore command exists. That driver must reject Docker/local-container targets and any legacy container fallback, require an explicitly approved direct Supabase drill target, and preserve historical compatibility assertions through the direct connection. Do not claim PITR, backups, isolated projects or plan eligibility exist without checking; any cost/provisioning/hosted schema application needs a concrete owner decision then.

**Acceptance/check:** real DB and private-object checksums/ownership/RLS/queue state plus immutable historical producer/render compatibility and authenticated flow. Measure adopted RPO24h/RTO4h targets and data-loss boundary; restored sensitive data stays in approved location/purpose. No destructive restore to the current project. **Rollback:** discard only the exact drill target after review, keep original environment and restore receipts; no down-migration over newer versions.

### RT25: rollback/kill-switch rehearsal and release operations

**Files (4):** `docs/operations/RUNBOOKS.md`; `docs/operations/WORKER_DEPLOYMENT.md`; `docs/operations/DEPLOYMENT_HOLD.md`; new `scripts/verify-release-rollback.ts`.

**Depends:** RT20–RT24 and application compatibility. Keep deployment hold throughout planning/local repair. Prepare exact old/new code/image/schema/flag artifacts and rollback criteria before any future deployment approval. Disable AI/compiler/OCR independently while retaining honest partial/review states, durable events and private data. Validate degraded-mode support and incident instructions.

**Acceptance/check:** local artifact/flag tests first, then a separately approved isolated staging rollout/rollback with real readiness, queue/data/URL compatibility, preserved versions and alert delivery. No deployment command is inferred from an npm script. **Rollback:** the approved prior compatible artifact/flags; forward repair where schema changes prevent reversal. Formal A4/live activation remains owner-owned.

### RT26: final consumer gate, then opt-in feedback/launch

**Files (5):** new `scripts/verify-consumer-release.ts`; new `tests/unit/consumer-release-gate.test.ts`; `package.json`; new `docs/evaluation/CONSUMER_RELIABILITY_ACCEPTANCE.md`; new `docs/operations/LAUNCH_CHECKLIST.md`.

**Depends:** the supported local branches RT01–RT22 and RT27 plus ATS truth/JD/score/authoring repairs and frontend correction/Build/auth/history/export/accessibility tasks. RT23–RT25 managed load/restore/staging/rollback evidence is a separate later launch requirement, not a reason to stop independent localhost repairs. RT11 real unscoped leased-worker evidence still needs its safe target; if unavailable, state that capability gate is open instead of substituting a direct processor call. Preserve original failed cases; repaired exact counterexamples must pass before broadening. Then one integrated Node22 type/lint/unit/web-build-before-worker run and actual consumer journeys cover supported native/scanned/mixed uploads, real leased lifecycle, corrected evidence/canonical/authoring, successful bounded live prose/rewrite/three Build modes, actual compiler preview/download/apply/undo, exports, auth/privacy, mobile/a11y and deliberate failures/recovery.

**Acceptance:** source/config/image-bound receipts, zero unresolved product-blocking failures, no hidden unsupported input counted as success, exact cleanup, and explicit blocked/unknown results for unavailable evidence. Existing `npm run verify` and feature commands remain real commands; proposed `verify:consumer:release` is not present until this task adds it. A green local gate does not close representative numerical claims, OS security exceptions, OAuth/email delivery, managed operational gates or A4 by implication. If a required capability remains unwired/unavailable, leave its gate open rather than claiming all features work.

After the supported local gate, the owner can approve a bounded opt-in demo/customer-feedback protocol with purpose/consent/retention/deletion, visible limits and rollback. Do not require a reviewer team, contact customers, collect resumes or host real data now. Representative/ATS-vendor studies and public release remain explicitly later. Pricing stays deferred until the owner revisits it after feedback.

### RT27: untrusted-upload scanning and parser-host policy

**Files (5):** new `app/lib/server/upload-safety.ts`; `app/lib/server/extraction-stage.ts`; new `tests/unit/upload-safety.test.ts`; `tests/unit/extraction-stage.test.ts`; `docs/security/THREAT_MODEL.md`.

**Depends:** RT21 data/tenant boundary and RT20 image review; sequence this shared stage edit after RT10/RT16. Define the quarantine/scan/admission contract before parsing untrusted customer PDFs. Signature/byte limits are not malware scanning. A missing/unknown scanner or failed resource confinement cannot be labelled clean; preserve quarantine and safe error guidance. A deployed scanner/engine choice, its updates/license, permitted region/data access and host sandbox controls require a concrete reviewed integration decision; no new provider/dependency or host mount is selected here.

**Acceptance/check:** mocked contract tests cover malicious/suspicious/unknown/unavailable/timeout/cancel and exact cleanup, then an approved worker-host test uses harmless recognized security fixtures and real parser resource/egress restrictions. Mock scanning is never reported as real malware protection. Production parser-host/malware evidence remains a later release requirement if only local synthetic behavior is available. **Rollback:** disable unsafe parsing/admission or retain quarantine; never bypass scanning policy to make an upload appear successful.

## Decision points and missing risks

- **Now:** accept/refine this implementation sequence only. It grants no provider spend, hosted write, deployment or publication. Source-only preparation/review should not be held for a future merchant, reviewer or hosting choice.
- **Before live AI:** owner supplies/fixes the existing credential through the secure local workflow, then approves the exact fresh request/token budget. Stop on credential/rate/model failure; no guessing or automatic alternate key/environment/model.
- **Before hosted schema/queue/CI/load/restore:** name the exact verified isolated direct Supabase target, schema diff, cost/retention/cleanup and allowed mutations. No target is invented. Global polling on the shared project is not an acceptable substitute, even with no currently visible queued jobs.
- **Before real OCR/provider data or capability activation:** adopt processing purpose, consent/retention/location, supported inputs and the exact candidate/image/policy. Local synthetic permission is not real-data or release approval. Do not waive failed quality thresholds merely to finish a phase.
- **Before hosted settings, notifications or deployment:** review the concrete receiver/config/artifacts and applicable cost/availability; obtain the actual owner boundary approval once. Keep release/security/representative gates distinct; no team-review question now.
- **Risk not yet measured:** future worker OS/native scanner output, actual hostile-parser/malware behavior beyond bounded fixtures, every residual/unfixed advisory, sustained multi-process capacity, attempt-cost ambiguity, session revocation under load, real OAuth/email, backup availability, network policy and alert delivery. The audit does not supply those results.
- **Documentation risk:** the misplaced privacy map and older runbooks can overstate readiness; recover meaning with provenance rather than overwriting user-owned history. Current CI's Docker DB/reset and ignored-unfixed scan contract must be addressed transparently, not silently skipped.

## Review and handoff

Read-only planning and one owned handoff are the only changes in this agent's worktree. No implementation boxes are checked. Current/future commands and existing/synthetic/live evidence remain separated. Apply prose hygiene and Markdown/link checks to this handoff; the coordinator owns canonical integration and source-unchanged evidence.

I can review the integrated final plan for missing side-effect decisions, unsafe global-queue tests, tasks exceeding five files, false quality closure and contradictions across the ATS/frontend/runtime sequences before any fixing begins.
