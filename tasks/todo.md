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

### Consumer validation — 2026-11-09

The owner deferred pricing implementation until full testing and consumer feedback; all services currently remain free of commercial charges. The [consumer validation report](../docs/evaluation/CONSUMER_VALIDATION_20261109.md) records the completed audit round: 1,453 tests, 65 passing browser cases, one unresolved correction-flow expectation, 20 actual render-parity cases and four actual OCR runtime commands. All 615 source inputs remained unchanged. This is not all-features acceptance: two live AI probes returned 401, LaTeX runtime rebuilding was blocked, automatic upload OCR is not wired, and independent grounding counterexamples failed. Original failed/withheld receipts and accuracy/release gates remain intact.

- [ ] Resolve live AI authentication and verify bounded live qualitative/rewrite/Build output.
- [ ] Restore/build the pinned LaTeX runtime and complete actual compile/confinement/PDF/browser verification.
- [ ] Address CV03 unsupported legacy writer claims and CV04 correction handoff/disclosure, preserving provenance and confirmation.
- [ ] Decide and verify consumer OCR integration under the retained quality/permission controls; do not equate standalone engine checks with automatic upload support.

No source fix, paid gate, deployment, publication, Docker database or schema migration was performed by this audit. See the report for source bindings, exact commands, fixture cleanup and remaining claim limits.

<a id="consumer-reliability-remediation-plan"></a>

### Consumer reliability remediation plan — IMPLEMENTATION PAUSED

Follow the [current context](../CONTEXT.md#active-goal) for the task order and verification state. Record completed work and evidence here. Keep blocked tasks open with their exact prerequisites while independent work proceeds.

#### Current task checkpoint — 2026-11-22

The reliability plan has 64 parent tasks: **3 VERIFIED, 52 PARTIAL, and 9 PLANNED**. There are 61 open parent tasks. These counts come from the [task graph](reliability-remediation-plan.json).

- **VERIFIED** means all acceptance criteria recorded for that parent task have evidence.
- **PARTIAL** means some implementation or verification is recorded, but the parent task remains incomplete. A checked child slice does not close its parent.
- **PLANNED** means the parent-level work or gate has not been completed. A preparatory child slice may have evidence without satisfying the parent.

The current reliability implementation goal is paused. On resumption, the next task is [CR-A01](reliability-remediation-plan.md#cr-a01). Its managed acceptance still needs an approved empty Supabase project, approval for the exact schema packet, and a synthetic upload through the real worker, followed by evidence, lease recovery, and exact fixture-cleanup checks. See the [managed validation action](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-validation-action.md).

Local LaTeX compilation, Chrome preview, and byte-matched PDF downloads have evidence. The managed Build browser run and live Build AI acceptance remain open. Deployment and pricing remain on hold.

#### Parent tasks whose full implementation or gate remains outstanding

These nine parent tasks remain PLANNED. The unchecked rows below carry the same label.

| ID                                               | Parent-level work not completed                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| [CR-U14](reliability-remediation-plan.md#cr-u14) | Complete Google identity when in the approved capability matrix          |
| [CR-U15](reliability-remediation-plan.md#cr-u15) | Complete ChatGPT identity only on a documented approved mechanism        |
| [CR-R21](reliability-remediation-plan.md#cr-r21) | Measure real HTTP/database/queue capacity and recovery                   |
| [CR-R22](reliability-remediation-plan.md#cr-r22) | Perform actual isolated managed restore and compatibility checks         |
| [CR-R23](reliability-remediation-plan.md#cr-r23) | Rehearse kill switches, rollback and operator recovery                   |
| [CR-R24](reliability-remediation-plan.md#cr-r24) | Verify upload malware and parser-host admission controls                 |
| [CR-G01](reliability-remediation-plan.md#cr-g01) | Pass the complete local consumer reliability gate                        |
| [CR-G02](reliability-remediation-plan.md#cr-g02) | Run owner-authorized opt-in feedback and per-segment validity evaluation |
| [CR-G03](reliability-remediation-plan.md#cr-g03) | Complete operations acceptance and explicit later launch decision        |

#### Partially implemented parent tasks that remain incomplete

Each PARTIAL parent row below has recorded work, but does not satisfy the full task. The table groups these open parents by stage. Read the unchecked child items, the parent task’s remaining-scope note in the task graph, and its linked evidence to see the specific implementation or verification still due.

| Stage | PARTIAL parent tasks                                                                                                             | PLANNED parent tasks                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1     | `CR-R01`, `CR-R02`, `CR-R03`, `CR-R04`, `CR-R05`, `CR-R07`, `CR-R08`, `CR-R09`, `CR-R10`, `CR-R12`, `CR-R13`, `CR-R16`, `CR-R19` | `CR-R24`                               |
| 2     | `CR-A01`, `CR-A02`, `CR-A03`, `CR-C02`, `CR-A04`, `CR-U01`, `CR-U02`, `CR-U03`, `CR-U16`                                         | —                                      |
| 3     | `CR-A07`, `CR-A08`, `CR-A09`, `CR-A10`, `CR-A15`, `CR-U04`                                                                       | —                                      |
| 4     | `CR-A11`, `CR-A12`, `CR-A13`, `CR-A14`, `CR-U05`, `CR-U06`, `CR-U07`, `CR-U10`, `CR-R06`                                         | —                                      |
| 5     | `CR-A05`, `CR-A06`, `CR-U09`, `CR-R15`                                                                                           | —                                      |
| 6     | `CR-U08`, `CR-U11`, `CR-R14`, `CR-R18`                                                                                           | —                                      |
| 7     | `CR-U12`, `CR-U17`, `CR-U18`, `CR-U19`, `CR-R17`, `CR-R20`                                                                       | `CR-U14`, `CR-U15`                     |
| 8     | `CR-R11`                                                                                                                         | `CR-R21`, `CR-R22`, `CR-R23`, `CR-G01` |
| 9     | —                                                                                                                                | `CR-G02`, `CR-G03`                     |

The detailed parent checklists follow by stage. The [remaining-work handoff](agent-handoffs/2026-11-09-reliability-implementation/remaining-goal-work.md) also lists the open scope and prerequisites for every parent.

#### Historical checkpoint — 2026-11-21 (superseded)

Use `tasks/todo.md` as the canonical tracker. The [64-task index](reliability-remediation-plan.json) records **2 VERIFIED, 47 PARTIAL and 15 PLANNED**. The 62 unfinished parent tasks include tasks with verified local implementation slices.

The latest [JD review checkpoint](agent-handoffs/2026-11-09-reliability-implementation/jd-recommendations-closeout.md) verifies **529 unique affected cases across 28 files** over two receipts: 521 unchanged carried cases and eight fresh follow-up cases, then fresh types, lint and web/worker builds. Root reconciled 970 inputs, 16 final allocated files and seven absent command groups. All 287 preexisting test files remain byte-identical. The first typecheck failure is preserved; only a new fixture table type changed afterward. Earlier full-suite counts are historical; no fresh full-suite claim is made. Actual/native/consumer and release acceptance remain separate.

The next execution step is the [isolated Supabase schema packet](agent-handoffs/2026-11-09-reliability-implementation/native-schema-action.md): 80 pinned migrations, an empty-target preflight and a read-only catalogue verifier. One fresh source-only gate passed 24 tests in two files, scoped lint/format and full type checking; Root reconciled 1,003 inputs and all 985 previous raw source inputs unchanged. SQL is unparsed/unexecuted, the target is not admitted and approval is pending. This is CR-R16-S02 preparation, not managed database or consumer acceptance. Parent totals remain 2 VERIFIED, 42 PARTIAL and 20 PLANNED.

The review-page-count defect is now repaired at the local source tier under CR-A01-S04. Actual controlled extraction reproduced missing declared counts in both persistence paths; the repair preserves the measured total through atomic SQL source and requires matched startup capabilities before claims. All 481 affected tests/18 files and all six check commands passed; a stale four-step controller counter caused its exit one and is separately reconciled without changing application/tests or rerunning them. The [repair closeout](agent-handoffs/2026-11-09-reliability-implementation/document-page-count-closeout.md) preserves that failed receipt. The new 81st migration is unparsed/unexecuted and outside the pending frozen 80-operation packet. Native/browser/consumer acceptance remains open; parent totals stay 2 VERIFIED, 42 PARTIAL and 20 PLANNED.

The genuine JD consumer browser harness is now authored and verified locally under CR-U06-S02 / CR-R16-S03. A fresh source-only gate passes 135 cases in three files, formatting, full type checking and lint (four recorded warnings), plus standalone-harness lint. Root reconciled 1,014 stable inputs, all 993 prior raw inputs and the exact carried 403-source/105-artifact build binding. Multipart parsing, cookie SDK arguments, Supabase abort-chain order and test runtime narrowing were repaired; failed receipts remain. Actual browser/SQL/PDF/worker execution is NOT_RUN and fixture cleanup is BLOCKED by missing admission retirement. The target binding remains NULL. Two read-only Supabase control-plane calls report the named Resumide project INACTIVE; no database records, env/keys, schema or resources were changed. Non-AI admission erasure/unlink policy and isolated-target/exact-DDL decisions remain pending. See the [harness source checkpoint](agent-handoffs/2026-11-09-reliability-implementation/jd-browser-fixture-closeout.md). No parent status, dependency or deployment authorization changed.

The account-deletion guard and upload export coverage are implemented under CR-R19. A disposable PostgreSQL regression reproduced the early deletion bug and verified rollback, claim checks, owned export and concurrent write fencing after the fix. The privacy page now explains the cleanup hold and distinguishes unavailable history from an empty list. The chosen implementation policy is erasure of upload operation IDs and hashes after verified cleanup. Physical cleanup, retirement of the records, managed Supabase verification and the actual browser journeys are still open. [Repair checkpoint](agent-handoffs/2026-11-09-reliability-implementation/analysis-admission-privacy-repair.md).

The stages 1–9 continuation added protected upload dispatch and acknowledgement evidence, then verified Auth and tenant isolation on the restarted Supabase project with exact fixture cleanup. Local checks passed 6,752 tests, five engineering benchmarks and both builds. OCR smoke passed using one container image, and the documented 150 DPI profile passed the development quality gate. The missing newer hosted schema, physical erasure, LaTeX images, real browser journeys and final evidence still block stage closure. [Stages 1–9 checkpoint](agent-handoffs/2026-11-09-reliability-implementation/stages-1-to-9-resume.md).

#### Historical stage summary (superseded by current parent statuses above)

On resumption, close CR-A01 first, then work through remaining tasks in dependency order. This stage snapshot predates the current parent-status summary above. Use the task checklists below and the linked handoff for current open requirements.

The [remaining goal work](agent-handoffs/2026-11-09-reliability-implementation/remaining-goal-work.md) lists all 61 open parent tasks by stage and records managed validation prerequisites.

Each stage stays open until its remaining acceptance checks pass. The [stage checkpoint](agent-handoffs/2026-11-09-reliability-implementation/stages-1-to-9-resume.md) records the managed Auth, OCR and engineering evidence. The [deletion inventory checkpoint](agent-handoffs/2026-11-09-reliability-implementation/admission-retirement-inventory-closeout.md) records the latest stage 1 and 7 changes.

| Stage                            | Verified progress                                                                                                                            | Required to close                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Safe execution                | Tracked upload dispatch, exact Storage acknowledgements and claim-bound retirement inventory passed local PostgreSQL and application checks. | Reconcile old or uncertain writes, verify exact physical cleanup, finish managed schema, leases and runtime acceptance.         |
| 2. Evidence and corrections      | CR-A01's bounded extraction and page-count SQL passed local checks. The 12-document locked synthetic OCR benchmark passed.                   | Prove the current leased worker on managed Supabase, then verify correction, re-import, confirmation and recovery in the app.   |
| 3. Job descriptions and scoring  | JD and deterministic scoring engineering benchmarks passed.                                                                                  | Verify real managed persistence and replay, locked calibration and policy evidence.                                             |
| 4. Factual AI and authoring      | Writer grounding passed its engineering gate. The three JD browser journeys are authored.                                                    | Run the real managed authoring journeys and applicable live AI and Build acceptance.                                            |
| 5. OCR                           | Smoke and 12 locked synthetic PDFs passed. Both profiles transcribed the six new development PDFs. Mixed field recall was 93.75%.            | Repair the mixed field omission, verify OCR through upload and complete representative quality and release checks.              |
| 6. LaTeX and Build               | Local source and application checks passed. Canonical PDF/DOCX parity passed its separate 20-case engineering benchmark.                     | Restore the pinned compiler images within the Docker limit, then verify compile, confinement, recovery, parity and browser use. |
| 7. Consumer trust and operations | Managed synthetic Auth and tenant isolation passed. Local mobile, keyboard and automated accessibility checks passed.                        | Complete authenticated accessibility, account erasure, export/restore copy handling and operational alert delivery.             |
| 8. Integrated acceptance         | Local browser smoke and synthetic load and restore checks passed.                                                                            | Run the integrated consumer gate and real capacity, restore and rollback drills in an isolated target.                          |
| 9. Feedback and release          | Engineering fixtures and release blockers are recorded.                                                                                      | Obtain opt-in and representative evidence and complete operational and owner release acceptance.                                |

Remaining work, in dependency order within the existing plan:

- [x] **Clock foundation, local source tier only.** First-preparation/retirement clock and exact closure, durable access barriers and mandatory disposition export are implemented and verified locally under [ADR-0020](../docs/decisions/0020-owned-ai-accounting-retention.md). Historical repair states do not invent deadlines. Native adoption, expiry and full erasure remain open. CR-A13 / CR-R19.
- [x] **Retention storage coverage, local source tier only.** Bounded backfill/draining, exact owned key coverage before parent deletion, terminal receipts and post-retirement source admission are implemented. Native storage/transactions, historical erased keys and actual deadline/process behavior remain unverified. CR-R17.

- [x] **All technical-budget callers, local source tier only.** Legacy rewrite/qualitative, A12/A13 and Build now use actual source admission; typed claim authority, immutable policy and late accounting are preserved. Strict v2 export and the catalogue upgrade checks are implemented. Native validation and independent budget-off provider admission remain open. CR-R03 / CR-R19.
- [x] **Usage preservation, local source tier only.** Capture actual runs atomically before content erasure, preserve original timestamps/months and validated all-month classifications, prevent duplicate charges, and include the retained personal metadata in owner export. Unknown holds and original clocks remain intact. Native conservation/races and full expiry remain open. CR-R03 / CR-R19.
- [x] **Mandatory provider admission, local source tier only.** All five app provider paths require technical reservation/claim before fresh AI work; saved replay and deterministic results remain available. Combined evidence covers 5,709 unique unit/component cases in 278 files across two receipts, plus fresh types/lint/web/worker builds. Native/live/release gates remain open. [Source closeout](agent-handoffs/2026-11-09-reliability-implementation/budget-required-closeout.md). CR-R03–CR-R06 / CR-A12 / CR-A13.
- [x] **Accounting expiry core/client, staged source tier only.** Real atomic fold/removal source, original-month and unresolved-exposure safeguards, strict client/CLI and exact profile successors are integrated. Fresh 5,821 tests/281 unit-component files plus full types/lint/web/worker pass. Actual adoption is absent and destructive access denied; no 720-hour erasure guarantee follows. [Source closeout](agent-handoffs/2026-11-09-reliability-implementation/expiry-fold-closeout.md). CR-R03 / CR-R19.
- [x] **Export generation and restore foundations, local source tier only.** Actual claim/attempt/live-lease and hidden-generation export fencing, strict service write controls, and the owner-free durable restore journal/controller are integrated. The fresh 5,907-case combined gate passes. Trusted platform adapters, serving/first-clock integration and physical crash-lock recovery remain unavailable. [Source closeout](agent-handoffs/2026-11-09-reliability-implementation/adoption-foundation-closeout.md). CR-R19 / CR-R22.
- [ ] **Next: complete actual accounting/privacy adoption.** Implement pre-fold non-admission authority and FK-safe finalization, then foreign actors, Auth/session/organization disposition, opening/pool evidence, old exports, exact object deletion, scheduler/deadline monitoring and aggregate reconciliation. Connect the staged restore foundation to independent storage, trusted platform fencing/checkpoints, serving and first-preparation/root-clock protection. Complete Native and consumer validation. These remain open requirements, not completed deletion guarantees. CR-R03 / CR-R19 / CR-U17 / CR-R22.

  The earlier [retained usage source](agent-handoffs/2026-11-09-reliability-implementation/usage-retention-closeout.md) passed an 820-case/24-file gate and full statics/builds; it is historical for the current candidate. Root reconciled 20 allocated files, 931 inputs, logs/artifacts and five exited groups. All prior failed receipts remain. New data grants stay denied and full expiry/Native/release gates remain open; no parent status closes from this source-only result.

- [x] **Scoring admission and explanations, local source tier only.** A fresh 240-case affected gate verifies current withholding, strict receipt/claim refusal, plain-language blockers and selected-version review links. No numerical bypass or policy change was found. CR-A15 is PARTIAL; actual consumer/representative/numerical-policy/release gates remain open. [Source closeout](agent-handoffs/2026-11-09-reliability-implementation/score-admission-closeout.md).
- [x] **JD priorities and complete wording inspection, local source slices only.** Typed owned-context guidance preserves exact claims/quotes/basis, top-five/full counts and conditional same-contribution questions. Legacy review shows before/after and provenance without inventing qualification credit. CR-A14 is PARTIAL: useful JD-specific drafting and projected/saved diagnostics still need completion. [Source checkpoint](agent-handoffs/2026-11-09-reliability-implementation/jd-recommendations-closeout.md).
- [ ] **Finish ATS and JD workflows.** Complete outstanding correction/import persistence, OCR admission and upload integration, useful source-backed JD improvements, deterministic score admission and explainable withholding. Preserve candidate confirmation and source/version binding. CR-A01–CR-A15 and their dependencies.
- [ ] **Finish authoring and Build journeys.** Complete reviewed suggestions and accept/reject/undo, factual support and consent in every Build mode, version consistency, actual PDF compile/preview/download and recovery. CR-U01–CR-U11 / CR-U18.
- [ ] **Complete identity and consumer acceptance.** Verify sign-in/session recovery, resolve supported OAuth/account-linking capabilities, and finish tenant/history/privacy, mobile, keyboard and accessibility journeys. Unsupported identity mechanisms cannot be marked implemented. CR-U12–CR-U17 / CR-U19.
- [ ] **Validate actual database, workers, OCR and compiler.** Complete native transactions, permissions, concurrency, cancellation, cleanup and runtime acceptance in an authorized target. Use Supabase directly; never use a Docker database. Current source-only verification does not close these gates. CR-R07–CR-R19 and feature-specific acceptance.
- [ ] **Finish security and operations.** Complete upload/parser controls, advisories, metrics and alert delivery, capacity/recovery, isolated restore, kill switches and rollback rehearsal. CR-R18–CR-R24.
- [ ] **Close the final gates.** Run the integrated local consumer gate and produce the final evidence report; keep owner-authorized customer/representative evaluation and operations/launch acceptance distinct. CR-G01–CR-G03.

All services remain free; pricing implementation is deferred. Deployment and launch remain on hold. This checkpoint records remaining work without authorizing hosted changes or changing parent task statuses.

Owner requested a proper repair plan before fixing. [Master plan](reliability-remediation-plan.md) and [dependency/traceability index](reliability-remediation-plan.json) govern all 64 canonical work items. Implementation and validation were approved on 2026-11-09. Only C00 capability contracts and C01 regression intake close their contract/metadata tier. The next transport repair is now integrated: caller/deadline cancellation reaches SDK fetch, and rejected output retains known usage without inventing zero for missing counts. Its affected gate passes 145 tests/11 files plus typecheck/lint/web/worker; see the [R02 closeout](agent-handoffs/2026-11-09-reliability-implementation/r02-attempt-closeout.md). The shared ledger source/client and default-off qualitative, rewrite and Build caller branches are integrated. One affected gate passed 169 tests/10 files, source checks, types/lint/web/worker; actual SQL, concurrency, cutover and activation remain open. See the [caller integration report](agent-handoffs/2026-11-09-reliability-implementation/r04-r06-entrypoints-closeout.md) and historical [R03 source/client report](agent-handoffs/2026-11-09-reliability-implementation/r03-budget-closeout.md). The next admission/worker batch is source-integrated: exact payload binding, durable upload compensation, per-attempt tokens, serialized heartbeats, cancellation and guarded stage writes. One combined gate passed 123 tests/14 files plus source/type/lint/web/worker checks. Native SQL, global queue, recovery and privacy acceptance remain open; see the [R07-R10 report](agent-handoffs/2026-11-09-reliability-implementation/r07-r10-admission-worker-closeout.md). R19 withdrawn-deletion access and SSR contention handling now pass a combined 117-case/12-file gate with types/lint/web/worker builds. R11 terminal recovery and R19 transaction barriers are source-integrated only; native execution and full privacy/release gates remain open. See the [privacy/recovery closeout](agent-handoffs/2026-11-09-reliability-implementation/r11-r19-privacy-recovery-closeout.md). The earlier writing repair batch is complete: writing source alignment, finite all-mode Build support and content-free AI-stage diagnostics are integrated. Verify08 passed 2,399 tests and found one invalid TeX privacy-marker fixture; its two-line comment correction then passed all 18 affected tests, typecheck, web build and worker build. This is combined evidence for 2,400 unique cases, not a fresh full-suite pass. The original failure is preserved. See the [batch closeout](agent-handoffs/2026-11-09-reliability-implementation/batch-08-closeout.md). One local owner-file follow-up reduced missing support anchors from 7 to 0; all 14 passages still require clarification. C02 foundation is source-integrated; SQL has never run. The earlier five live AI generation calls returned HTTP 200, with a useful syntax fix but no retained writing edits on a concise fixture. [Live AI report](agent-handoffs/2026-11-09-reliability-implementation/r01-live-validation.md). Full parent tasks, browser/accessibility, canonical correction, OCR, managed compatibility, security and release acceptance remain open. Pricing and deployment remain stopped.

The R11 preclaim readiness batch passed 19 affected tests, full typecheck/lint and both builds. Its unchanged gate is closed. A separate read-only Supabase preflight confirmed missing cancellation and older transition routines; native compatibility and consumer acceptance remain open. See the [finite next repair and evidence](agent-handoffs/2026-11-09-reliability-implementation/r11-native-compatibility-prerequisites.md). No new SQL was applied and deployment remains stopped.

The subsequent cancellation repair now passes 13 focused cases, full typecheck/lint and both builds. The forward-only three-function compatibility bridge is source-integrated with an independent ACK; [its exact hosted action](agent-handoffs/2026-11-09-reliability-implementation/legacy-worker-hosted-action.md) awaits an owner decision. No SQL or deployment occurred. Native behavior and the full reliability gate remain open.

A11 layout comparison now retains otherwise supported ligature/soft-hyphen prose and square-bullet entries. One affected gate passed 378 tests/12 files plus types/lint/web/worker; fresh OCR sources passed integrity checks without recognition or quality claims. The [closeout](agent-handoffs/2026-11-09-reliability-implementation/writing-layout-ocr-closeout.md) also records the current correction-protocol amendment needed before A04. The pending hosted question is unchanged.

C02/A04/U01/U02 now have integrated correction source and UI: source-specific targets, separate assignment/apply/add/reapply, immutable history and transaction-fresh original import after a superseding confirmation. The [A04 closeout](agent-handoffs/2026-11-09-reliability-implementation/a04-closeout.md) records 282 tests/21 files plus full types/lint/web/worker. Type-only compatibility preserved emitted JavaScript, so passing behavioral tests were not repeated. All SQL/operator source is unparsed/unapplied/unexecuted; flags remain off and native/browser/cutover gates remain open. At the A04 checkpoint, totals were 2 VERIFIED, 29 PARTIAL and 33 PLANNED; the 64 IDs and dependencies remained unchanged. No parent checkbox closes from this scoped evidence.

CR-U03 now has integrated exact-value review and rejected-draft recovery. Clarification displays the complete fact before its separate native confirmation; canonical failures preserve exact retries and offer a separately reviewed attempt against the current head. The initial combined gate passed 100 tests in seven files. Review then reproduced unrelated-draft loss; the final affected gate passed 47 canonical cases plus full types, lint and web/worker builds. All 703 recorded inputs were stable, and Root verified the log, two artifacts and five exited process groups. The 60 unchanged authoring cases were carried forward by exact source comparison, giving 107 unique cases across the two receipts; no fresh full-suite pass is claimed. See the [U03 closeout](agent-handoffs/2026-11-09-reliability-implementation/u03-closeout.md). Native browser, managed storage/concurrency, export and consumer acceptance remain open. At the U03 checkpoint, CR-U03 was PARTIAL and totals were 2 VERIFIED, 30 PARTIAL and 32 PLANNED; the 64 IDs and dependencies are unchanged. Pricing and deployment remain stopped.

CR-U18 now has an integrated confirmed-link replacement repair. A real synthetic corrected email reaches PDF and DOCX through the owned repository; independent output parses preserve the new text/target and exclude the old target. Exact plan/source/confirmation and bounded owned immutable lineage permit only the intended replacement, while unsafe or unexplained missing links remain blocked. One integrated gate passed 45 tests in four files plus full types, lint and web/worker builds. Root independently verified all 704 inputs, the log, two artifacts and five exited process groups. See the [U18 closeout](agent-handoffs/2026-11-09-reliability-implementation/u18-closeout.md). Native browser, managed storage/concurrency and full consumer acceptance remain open. At the U18 checkpoint, CR-U18 was PARTIAL and totals were 2 VERIFIED, 31 PARTIAL and 31 PLANNED, with all 64 IDs/dependencies unchanged. Pricing and deployment remain stopped.

A10 now distinguishes exact recorded declarations from missing source proof or skill proficiency under diagnostic producer `score-v2/1.0.2`, without changing numerical admission. U04 now makes explicitly selected historical JD views read-only while preserving current native form/CAS fields. One combined gate passed 66 tests in five files plus full types, lint and web/worker builds; Root verified all 706 inputs, the log, two artifacts and five exited process groups. See the [JD review closeout](agent-handoffs/2026-11-09-reliability-implementation/jd-review-closeout.md). Full A09/A10/A15/U04 and native consumer acceptance remain open. At the JD checkpoint, totals were 2 VERIFIED, 33 PARTIAL and 29 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A09 now has integrated local typed-JD storage admission, immutable policy review, writer-off downgrade protection and explicit scoring/proposal abstention. The final combined gate passed 187 tests in eight files plus full type checking, lint and web/worker builds; Root rehashed all 715 inputs, the log, both artifacts and five exited process groups. See the [A09 source closeout](agent-handoffs/2026-11-09-reliability-implementation/a09-source-closeout.md). The new SQL and rollback-only operator remain unparsed, unapplied and unexecuted. Full managed storage/RLS/replay/concurrency, browser, typed coverage and release acceptance remain open. Current totals are 2 VERIFIED, 34 PARTIAL and 28 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A01 now has a bounded shared page-text scanner and separate native-review and saved-text displays. Damaged characters, exact repeated text and unavailable metadata receive explicit review guidance; count bands are labelled text availability. Review also reproduced and fixed an oversized fallback-allocation crash without changing saved results or parser/checksum sources. The initial gate passed 182 tests in seven files; full typing found one outdated test fixture. A fixture-only follow-up passed 82 cases plus full types, lint and web/worker builds while preserving all 218 application source hashes. Root rehashed 720 final inputs, both logs/artifacts and seven exited process groups. See the [A01 local page-review closeout](agent-handoffs/2026-11-09-reliability-implementation/a01-page-review-closeout.md). Full A01, native/quality/browser/consumer and release acceptance remain open. Totals remain 2 VERIFIED, 34 PARTIAL and 28 PLANNED across the unchanged 64-task DAG.

CR-A02-S02 private source/placement preparation and CR-U10 rewrite feedback are now integrated. One combined local gate passed 234 tests in five files plus full types, lint and web/worker builds; Root rehashed all 726 inputs, the log, both artifacts and five absent process groups. The source corpus has 61 valid JS oracles and 47 placement oracles; all SQL remains unparsed, unapplied and unexecuted. Rewrite failure feedback preserves actual three-case DOM RED and distinguishes safe published codes without changing consent, drafts or requests. See the [source and feedback closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-source-u10-closeout.md). Full A02/U10, native/storage/browser/live and release acceptance remain open. Totals are 2 VERIFIED, 35 PARTIAL and 27 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A02-S02 ledger/privacy and atomic admission source, plus Build failure feedback, are integrated. The initial gate passed 308 of 309 tests and exposed one stale schema reader; its guarded-transition repair passed seven affected cases plus full types, lint and web/worker builds. Exact source comparison carries the unchanged 308 cases, yielding 315 unique passing cases across two receipts, not a fresh full-suite pass. Root rehashed 733 current inputs, both logs/artifacts and six exited groups. SQL remains unparsed/unapplied/unexecuted; the new writer is revoked and server/route/native admission remains open. See the [atomic source closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-atomic-import-closeout.md). Totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED across the unchanged 64-task DAG. Pricing and deployment remain stopped.

CR-A02-S02/U01 grouped first-import review is now integrated at the local source/mock/DOM/build tier. One fresh affected gate passed 268 tests in seven files plus full types, lint and web/worker builds; Root verified 737 stable inputs, the log, both artifacts and five exited groups. The UI preserves exact retries across ambiguous saves/reloads and invalidates old previews after edit/revert or history restoration. See the [consumer closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-consumer-closeout.md). SQL remains unparsed/unapplied/unexecuted and the writer remains revoked. Existing-head regrouping and native/storage/browser/full consumer acceptance remain open. Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment stay on hold.

CR-A02-S02 now includes verified pure whole-entry regroup preparation and its structural diff. One fresh gate passed 58 tests in two files plus full types, lint and web/worker builds; all 741 inputs were stable and all 737 prior consumer inputs remain unchanged. Current facts and confirmations survive partial, already-grouped and bullet-bearing entry merges, with full ordering and retired-entry review. This creates no saved version or route: durable multi-origin approval, actual consumer wiring and native acceptance remain open. See the [preparation closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-preparation-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED.

CR-A02-S02/C02 now has a separate whole-entry regroup metadata foundation and paired privacy consumer. One fresh gate passed 65 tests in three files plus full types, lint and web/worker builds; 744 inputs stayed stable and only the two allocated privacy files changed among the previous 741 inputs. The actual omission RED is fixed: all fifteen owned metadata collections are required and preserved. Five new stores and guarded profile70 are source-integrated, not applied SQL. Semantic admission, saving, native lifecycle and actual regroup consumer wiring remain open. See the [ledger/privacy closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-ledger-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment remain on hold.

CR-A02-S02 now includes strict whole-entry regroup commands and four private SQL preparation helpers. One fresh gate passed 47 tests in two files plus full types, lint and web/worker builds; all 748 inputs stayed stable and all 744 prior ledger inputs are unchanged. The real 32-group/96-member request fits its wire and framing limits. Original base/capture identity is preserved; this creates no saved version or route. SQL remains unparsed/unapplied/unexecuted. See the [command closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-command-closeout.md). Parent totals remain 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment stay on hold.

CR-A02-S02/U01 saved-entry regroup admission is paired-integrated with its SQL proof/lifecycle/readiness, `.4` SDK/schema and actual canonical page. One fresh local gate passed 230 tests in seven files plus full types, lint and web/worker builds; all 755 inputs stayed stable. Exact retries, full-entry acknowledgement and explicit local retry-detail recovery are covered. SQL remains unparsed/unapplied/unexecuted; app writer execution and default flags remain off. See the [admission closeout](agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-admission-closeout.md). Native/storage/browser and release acceptance remain open; parent totals stay 2 VERIFIED, 35 PARTIAL and 27 PLANNED. Pricing and deployment stay on hold.

CR-R01-S02 now has one explicit bounded doctor model-access interface and an import-safe legacy delegate. One fresh local gate passed 75 tests in one file plus full types, lint and web/worker builds; all 755 inputs stayed stable, with only four allocated changes among the previous inputs. All 31 original offline cases remain. Actual deadline and SDK colon-path counterexamples are fixed. See the [doctor closeout](agent-handoffs/2026-11-09-reliability-implementation/r01-doctor-closeout.md). Tests use the installed SDK with fake fetch; no new live authentication or writing usefulness is claimed. Parent totals stay 2 VERIFIED, 35 PARTIAL and 27 PLANNED; pricing and deployment remain on hold.

CR-U11 now has verified actual-route compile recovery: distinct missing-runtime/service-recovery guidance and safe unknown/inherited error handling. One fresh gate passed 24 DOM cases in one file plus full types, lint and web/worker builds; all 756 inputs stayed stable, and only the allocated route changed among the previous 755 inputs. See the [Build recovery closeout](agent-handoffs/2026-11-09-reliability-implementation/u11-compile-recovery-closeout.md). Actual compiler restoration, quarantine cleanup, PDF/browser and full U11 acceptance remain open. Parent totals are now 2 VERIFIED, 36 PARTIAL and 26 PLANNED across the unchanged 64 tasks; pricing and deployment stay on hold.

CR-A11-S06 source is now locally verified: strict fresh readiness before typed dispatch and reviewed forward legacy bypass source, with 137 tests/nine files plus types/lint/web/worker passing on 806 stable inputs. SQL stays unparsed/unexecuted and the writer stays denied. Broader useful authoring, native and consumer acceptance remain open. See the [readiness checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a11-readiness-closeout.md). Parent totals remain 2 VERIFIED, 36 PARTIAL and 26 PLANNED.

CR-A11-S07 source is locally verified: authoring-only 1.1 confirmed declarations, truthful provenance and exact-version replay/undo now pass 229 tests/sixteen files plus types/lint/web/worker on 816 stable inputs. The original contract/semantic/coverage/codec remain unchanged; SQL and full consumer validation remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a11-declaration-closeout.md). Parent totals remain 2 VERIFIED, 36 PARTIAL and 26 PLANNED.

CR-A12-S01 source is locally verified: the owned rewrite panel/resource, mandatory operation claim, usage settlement and atomic-publication SQL source pass 351 tests/nineteen files plus types/lint/web/worker on 838 stable inputs. Exact retries and current/historical/legacy provenance are explicit. All old contracts and original legacy assertions remain intact. SQL, native/privacy/retention/races, broader useful writing and actual consumer/provider acceptance remain open; mutators denied and flags off. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a12-rewrite-closeout.md). Parent totals are 2 VERIFIED, 37 PARTIAL and 25 PLANNED across the unchanged 64-task DAG.

CR-A12-S02 and CR-A13-S01 source now pass one coupled gate: 218 tests/twelve files plus full types, lint and web/worker builds on 851 stable inputs. The forward rewrite path preserves scoring guards, uses private canonical run metadata and counts known/unknown usage without an old-counter fallback. Feedback titles and explanations receive independent source-content checks; questions do not count as strengths. Owned feedback publication, sidecar persistence, fresh writing-workspace initialization, native and actual consumer acceptance remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a12-compat-a13-core-closeout.md). Parent totals are 2 VERIFIED, 38 PARTIAL and 24 PLANNED; all 64 IDs/dependencies are unchanged.

**Stage 0: Baseline/contracts**

- [x] [CR-C00](reliability-remediation-plan.md#cr-c00): Freeze supported capabilities, truth contracts and closure matrix.
- [x] [CR-C01](reliability-remediation-plan.md#cr-c01): Preserve and assign every failing regression and coverage omission.

**Stage 1: Availability and execution foundations**

- [ ] **PARTIAL** [CR-R01](reliability-remediation-plan.md#cr-r01): Provide safe offline AI doctor and bounded real readiness check.
  - [x] **CR-R01-S03, align offline and live checks.** Fixed false offline success for oversized keys and malformed organization or project settings. All 78 doctor tests, two offline CLI boundary checks, typecheck, lint and both builds passed. Live operation and writing acceptance stay open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r01-offline-validation-closeout.md)
- [ ] **PARTIAL** [CR-R02](reliability-remediation-plan.md#cr-r02): Bound SDK attempts, cancellation and actual/unknown usage.
- [ ] **PARTIAL** [CR-R03](reliability-remediation-plan.md#cr-r03): Reserve and reconcile shared technical AI budgets atomically.
- [ ] **PARTIAL** [CR-R04](reliability-remediation-plan.md#cr-r04): Bind qualitative provider calls to the technical attempt ledger.
- [ ] **PARTIAL** [CR-R05](reliability-remediation-plan.md#cr-r05): Bind explicit rewrites to the technical attempt ledger.
- [ ] **PARTIAL** [CR-R07](reliability-remediation-plan.md#cr-r07): Bind durable analysis admission to payload and operation identity.
- [ ] **PARTIAL** [CR-R08](reliability-remediation-plan.md#cr-r08): Fence leases and define a genuinely isolated verification scope.
- [ ] **PARTIAL** [CR-R09](reliability-remediation-plan.md#cr-r09): Propagate cancellation and stage deadlines to provider requests.
- [ ] **PARTIAL** [CR-R10](reliability-remediation-plan.md#cr-r10): Fence stage writes and worker shutdown against stale owners.
- [ ] **PARTIAL** [CR-R12](reliability-remediation-plan.md#cr-r12): Build the compiler from verified reproducible dependency artifacts.
  - [x] **CR-R12-S05, repair compiler runtime CI admission.** The workflow uses a reviewed immutable ARM64 registry artifact and checks its Docker image ID before runtime tests. Local checks passed for artifact admission and the LaTeX and Build AI source suites. The reviewed image was absent locally, so compiler execution remains open. [Compiler workflow](../docs/operations/LATEX_CONVERTER.md#test-the-reviewed-worker-artifact-in-github-actions)
  - [x] **CR-R12-S06, prepare a fresh compiler recovery packet.** Verified the pinned Expat archive and froze 61 build files. Docker is on a newer toolchain and the previous probe layout is absent. Rebuilding requires a current cancellation proof and packet review. [Preparation receipt](agent-handoffs/2026-11-09-reliability-implementation/cr-r12-compiler-recovery-preflight.json)
  - [x] **CR-R12-S07, verify cancellation on the current Docker toolchain.** Verified the exact local ARM64 probe layout and bound the packet to the current daemon and socket. One cache-only probe reached its marker, canceled the owned daemon operation, and proved the client group had exited. [Cancellation receipt](agent-handoffs/2026-11-09-reliability-implementation/cr-r12-current-cancellation-proof.json)
  - [x] **CR-R12-S08, rebuild the compiler from the reviewed packet.** The first build stopped on a Debian source-index checksum mismatch. All three indexes from the dated archive matched the original pins. The revised compiler image built successfully. The first runtime check exposed a separate XeTeX class lookup failure. [Recovery receipt](agent-handoffs/2026-11-09-reliability-implementation/cr-r12-debian-snapshot-recovery.json)
  - [x] **CR-R12-S09, preserve earlier images when building a new candidate.** The wrapper assigns a distinct local tag to each reviewed output directory and verifies the built image ID against that tag. The previous image stayed available and the revised image built in 3.2 seconds with the existing cache. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-real-compiler-and-chrome.json)
- [ ] **PARTIAL** [CR-R13](reliability-remediation-plan.md#cr-r13): Distinguish known missing images from ambiguous cleanup.
  - [x] **CR-R13-S03, verify process quarantine and recovery on the rebuilt worker.** The exact stopped test container blocked admission. Removing it preserved quarantine in the same process, and a fresh process compiled successfully. No converter containers remained. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-debian-stock-security.json)
  - [x] **CR-R13-S04, verify rollback and recovery on the flattened worker.** A stopped test container blocked compilation. Exact cleanup left the current process quarantined, and a fresh process compiled a two-page PDF. No converter containers remained. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-local-pdf-primary-admission.json)
- [ ] **PARTIAL** [CR-R16](reliability-remediation-plan.md#cr-r16): Replace Docker-database CI with guarded direct-Supabase testing.
  - [x] **CR-R16-S04, repair the SQL checks before moving CI.** Eight SQL suites and the two-session correction check passed on PostgreSQL 17 after the fixture repairs and the forward fix for the legacy queue claimant. The Docker-backed CI jobs, managed runner and hosted acceptance are still open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-native-sql-closeout.md)
  - [x] **CR-R16-S05, build the managed transactional SQL runner.** The 94-operation packet materialized, 22 runner tests passed, and eight rollback suites passed in one PostgreSQL session. The runner refused a missing schema fix and a populated target. Hosted execution and the CI cutover remain open. [Operator command](../docs/operations/MANAGED_TESTING.md) · [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-sql-runner-closeout.md)
  - [x] **CR-R16-S06, carry forward the two-session correction check.** The managed runner observed actual PostgreSQL lock contention, one applied revision and one stale conflict. Cleanup passed after the successful run and an injected client failure. Hosted execution, schema lint and CI cutover remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-correction-closeout.md)
  - [x] **CR-R16-S07, move the database CI job to direct Supabase.** The manual database job uses guarded rollback SQL, schema lint, and the two-session correction check. Actionlint, local workflow checks, and real local linter execution passed. Findings, hosted acceptance, the browser cutover, and restore remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-database-ci-closeout.md)
  - [x] **CR-R16-S08, repair the owner accounting export found by lint.** PostgreSQL reproduced the alias failure and verified empty and populated owner export, foreign exclusion, restricted grants, and rollback on catalogue drift. The repair is in the local 95-operation successor. Other lint findings and hosted adoption remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-lint-export-closeout.md)
  - [x] **CR-R16-S09, repair accounting disposition capture.** PostgreSQL reproduced the cast failure in the privacy worker's deletion-preparation call. The local fix passed account retry, exact root retention, and expiry clock assertions. It is in the 96-operation successor. Hosted adoption and the expiry findings remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-lint-disposition-closeout.md)
  - [x] **CR-R16-S10, repair the monthly expiry projection.** The exact 97-operation local successor passed aggregate arithmetic, owner isolation, and refusal of expiry without adoption. The full lint scan retained the missing adoption verifier diagnostic. Hosted adoption, browser, and restore remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/r16-managed-lint-expiry-closeout.md)
  - [x] **CR-R16-S11, remove Docker database startup and reset from browser CI.** The new public job passed 45 local Chromium checks. The full gate reports unavailable until managed authenticated coverage, worker, and restore are wired. Existing readiness and authenticated assertions remain discoverable. [Verification and remaining coverage](../docs/operations/MANAGED_TESTING.md#public-browser-check)
  - [x] **CR-R16-S12, verify populated restore rows and access without Docker.** The guarded comparison passed a real local PostgreSQL dump and restore and rejected trigger, row, and fixture drift. Managed execution and the broader restore drill remain open. [Restore comparison](../docs/operations/BACKUP_RESTORE.md#compare-two-isolated-synthetic-databases)
  - [x] **CR-R16-S13, record exact browser accounts before Auth creation.** The installed SDK transport tests passed for write ordering, a lost response, a wrong returned ID, and an invalid ledger. The converter receipt also records its rate-limit key before account creation. Managed cleanup verification remains open. [Fixture receipts](../docs/operations/MANAGED_TESTING.md#browser-fixture-receipts)
  - [x] **CR-R16-S14, audit exact fixture residuals.** PostgreSQL detected Auth, application, Storage metadata, and per-fixture rate rows. The audit passed after exact cleanup while unrelated rows remained. The protected job, physical Storage, and hosted session proof remain open. [Audit and verification](../docs/operations/MANAGED_TESTING.md#audit-browser-fixture-cleanup)
  - [x] **CR-R16-S15, wire protected authenticated browser CI.** The guarded runner discovers 14 checks and requires the cleanup audit even after browser failure. The local native replay verified refusal before launch on a populated target and retention of encrypted ledgers on failure. Hosted execution and remaining full-browser coverage stay open. [Protected job and recovery](../docs/operations/MANAGED_TESTING.md#run-the-protected-authenticated-browser-job)
  - [x] **CR-R16-S16, verify Storage retrieval and report Auth sign-out failures.** The audit requires explicit missing-key evidence from the Storage API. A regression reproduced the false success redirect, and the built SSR route passed after the fix. The managed browser suite checks old and fresh sessions before account cleanup. Hosted execution remains open. [Verification](../docs/operations/MANAGED_TESTING.md#run-the-protected-authenticated-browser-job)
  - [x] **CR-R16-S17, restore the integrated local verification run.** Three historical SQL profile checks now validate the exact later regroup declarations before reconstructing their frozen predecessors. All 7,161 tests passed, as did type checking, both builds, and 53 public Chrome tests. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r16-historical-profile-verify.json)
- [ ] **PARTIAL** [CR-R19](reliability-remediation-plan.md#cr-r19): Restore the real privacy map and verify tenant/auth/security policy.
- [ ] **PLANNED / NOT VERIFIED** [CR-R24](reliability-remediation-plan.md#cr-r24): Verify upload malware and parser-host admission controls.

**Stage 2: Evidence/correction flow**

- [ ] **PARTIAL** [CR-A01](reliability-remediation-plan.md#cr-a01): Diagnose native page completeness and extraction failure states.
  - [x] **CR-A01-S05, local verification.** Bounded page reads, parser cleanup and timeout handling passed. The locked synthetic OCR engineering run and PostgreSQL page-count fixture passed. [Results and remaining checks](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-extraction-closeout.md).
  - [x] **CR-A01-S06, local clean schema replay.** All 91 successor operations ran on disposable PostgreSQL 17. The page-count profile and catalogue permission checks passed. [Successor packet and results](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-clean-successor-closeout.md)
  - [x] **CR-A01-S07, local database lifecycle.** Forward repairs resolve ambiguous queue aliases and align the sealed usage reader attribute. All 93 operations, real lease expiry and reclaim, page-count evidence and receipt-bound deletion passed on disposable PostgreSQL. [Lifecycle results](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-native-worker-lifecycle-closeout.md)
  - [ ] **CR-A01-S08, managed validation.** The read-only readiness check and seven post-cleanup checks passed on the 93-operation PostgreSQL fixture. The cleanup check covers removed fixture rows, the retained 30-day accounting hold and the separate rate-limit token. Managed replay and the HTTP upload, worker recovery and Storage cleanup journey still need the approved isolated Supabase target. Representative OCR and release acceptance remain open. [Exact validation action](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-validation-action.md) · [Runner](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md) · [Cleanup results](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-cleanup-closeout.md)
  - [x] **CR-A01-S09, coordinate readiness, worker receipts and cleanup.** One guarded command binds both SQL checks to the approved 93-operation target and derives cleanup IDs from the private run ledger. Native PostgreSQL verified the complete sequence and refused populated Auth before worker start. The managed HTTP journey remains open. [Coordinator and verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#run-the-coordinated-verification)
  - [x] **CR-A01-S10, close the owned app on verifier exit.** Reproduced an orphaned app after coordinator timeout. The verifier now requires clean app exit before success. The built app stopped after normal disconnect and abrupt supervisor death. [Process verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#run-the-coordinated-verification)
  - [x] **CR-A01-S11, wire protected worker CI and fixture recovery.** The opt-in job uses the separate worker approval. Local checks verified encrypted recovery, target binding and overwrite refusal. All 6,924 tests passed without loading the workspace environment file. Managed CI and the hosted consumer lifecycle remain open. [Job and recovery instructions](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#run-the-protected-ci-job)
  - [x] **CR-A01-S12, verify saved PDF pages and the owner evidence page.** Reproduced a verifier failure caused by using the correction-history counter for PDF pages. The runner now checks the persisted page count, the blank page and the private owner and outsider HTTP responses. All 141 focused tests and the built app's loopback SSR check passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#verify-the-saved-page-count-and-evidence-route)
  - [x] **CR-A01-S13, verify the candidate deletion form and bind cleanup to its request.** The runner submits the authenticated privacy form and requires the exact audit event and queued request before its worker starts. All 78 focused tests passed. The built app queued one owner request and refused unauthenticated submission in loopback testing. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#verify-the-candidate-deletion-form)
  - [x] **CR-A01-S14, verify saved PDF bytes before legacy parsing.** Both legacy extraction modes now fail through the worker lease when the Storage bytes differ from the saved version. All 107 focused tests passed. Managed Storage and parser-host verification remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a01-extraction-closeout.md#verify-the-stored-pdf-before-parsing)
- [ ] **PARTIAL** [CR-A02](reliability-remediation-plan.md#cr-a02): Group evidence by entity and stable field target. Local association review/UI and first-import preparation have separate 143/218-case gates. Managed transactions, concurrent replay and consumer acceptance remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a02-source-u10-closeout.md).
  - [x] **CR-A02-S03, verify grouping and placement in local PostgreSQL.** The 93-operation replay with the upstream JSON Schema validator passed 61 source fixtures, including 47 placement checks, and refused all 54 invalid inputs. The transaction rolled back and all 339 related application tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a02-native-source-closeout.md)
  - [x] **CR-A02-S04, repair the grouped import transaction.** A forward migration resolves the snapshot alias collision and preserves all 11 readiness checks. Local PostgreSQL verified the full 98-operation replay, single approval, exact replay, rollback and refusal through ordinary save. All 270 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a02-native-atomic-closeout.md)
  - [x] **CR-A02-S05, verify local concurrent replay and deletion.** Two PostgreSQL sessions waited on the owner lock. Identical commands created one saved version and audit event. A waiting import saw the committed deletion and wrote no import rows. Managed concurrency and browser acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a02-native-atomic-closeout.md#concurrent-replay-and-deletion)
  - [x] **CR-A02-S06, repair saved-entry regroup previews and writes.** A forward migration fixes the saved-head comparison in the reader and writer. The 99-operation local replay passed preview, regroup, replay, correction materialization, rollback and all 11 readiness checks. All 310 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a02-native-regroup-closeout.md)
- [ ] **PARTIAL** [CR-A03](reliability-remediation-plan.md#cr-a03): Define correction projection, targets and candidate provenance.
  - [x] **CR-A03-S02 local verification.** The stored child links one corrected value to the exact actor, event, revision and attempt. It leaves the original intact and refuses old replay after a real replacement attempt. All 260 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a03-native-corrections-closeout.md)
- [ ] **PARTIAL** [CR-C02](reliability-remediation-plan.md#cr-c02): Verify evidence/canonical storage compatibility before new writes.
  - [x] **CR-C02-S03 local verification.** PostgreSQL verified ledger reads, direct mutation refusal, immutable lineage and rollback on the 99-operation packet. Managed admission remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a03-native-corrections-closeout.md)
- [ ] **PARTIAL** [CR-A04](reliability-remediation-plan.md#cr-a04): Persist corrected canonical children atomically with replay and CAS.
  - [x] **CR-A04-S04, verify the correction transaction locally.** Local SQL passed assign, apply, explicit add, reapply, restore and historical replay. Managed transactions, concurrency and the CV04 consumer remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a03-native-corrections-closeout.md)
  - [x] **CR-A04-S05, repair service-role commits and verify local correction races.** The 100-operation replay verified that the deferred validator can read the sealed ledger at commit. Four concurrent cases and the invalid-assignment rollback passed with existing access restrictions. All 234 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a04-native-correction-concurrency.md)
  - [x] **CR-A04-S06, repair the export confirmation response.** Preview, check and download return an actionable 422 for an unconfirmed correction. Earlier versions still return 409. After confirmation, real PDF and DOCX parse-back recovers the replacement once. All 245 focused tests passed with synthetic data. Authenticated CV04 remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/u18-closeout.md#confirmation-before-check-or-download)
  - [x] **CR-A04-S07, link the confirmed version to export.** The structured resume links to preview the exact reviewed version. Local route and component checks covered stale versions, confirmation, sign-in return and the feature flag. Managed browser execution remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/u18-closeout.md#structured-resume-to-export)
  - [x] **CR-A04-S08, repair candidate access and verify correction through export.** The candidate privacy reader accepts the exact regroup schema fingerprint. The 100-operation local replay passed evidence correction, replay, confirmation, real PDF and DOCX parse-back, restore and deletion refusal on one synthetic resume. All 223 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a04-native-correction-journey.md)
  - [x] **CR-A04-S09, verify the browser correction and download locally.** Chromium on the built app and local PostgreSQL passed evidence correction, target review, confirmation, checked PDF and DOCX download, and restore. The browser used simulated Supabase Auth and Storage. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a04-native-correction-journey.md#chromium-correction-and-download)
- [ ] **PARTIAL** [CR-U01](reliability-remediation-plan.md#cr-u01): Preview corrected imports with target and provenance.
- [ ] **PARTIAL** [CR-U02](reliability-remediation-plan.md#cr-u02): Reconcile corrections into existing versions without clobbering edits.
- [ ] **PARTIAL** [CR-U03](reliability-remediation-plan.md#cr-u03): Bind confirmation and uncertainty to the exact displayed value.
  - [x] **Verify stale canonical fact recovery locally.** A two-tab conflict preserved the original draft and retry request. Reviewing the latest saved value and acknowledging it saved the draft as an unconfirmed fact in a new version. [CR-U19-S04 verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-stale-canonical-recovery-a11y.json)
- [ ] **PARTIAL** [CR-U16](reliability-remediation-plan.md#cr-u16): Preserve history, tenant isolation and private source access.
  - [x] **CR-U16-S01, bind private downloads to the saved version.** The route checks the exact object key, length and SHA-256 and rechecks access after Storage responds. Local Chromium received the exact owner PDF and refused corrupt bytes and anonymous, foreign and in-flight revoked access. Managed history and session acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u16-source-download.json)
  - [x] **CR-U16-S02, verify private history and navigation locally.** History now uses the signed-in user's database permissions, checks deletion before and after reading, and omits inactive sources. Chromium verified sort, pagination, reload, Back after sign-out and account switching. PostgreSQL verified exclusion of revoked memberships and foreign or deleted sources. Managed acceptance remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u16-history-ownership.json)
  - [x] **CR-U16-S03, verify direct result and progress access.** The result page rechecks the owned source before returning data or redirecting. Progress denies inactive sources and rechecks access after reading OCR recovery. Chromium verified a private 404 after revocation and cleared stale progress. All 151 focused tests passed. Managed verification remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u16-direct-result-status.json)
  - [x] **CR-U16-S04, authorize cancellation at the database write.** PostgreSQL verified queued cancellation and exact retry, preserved a live worker lease, and rejected foreign owners, revoked memberships, deleted sources and pending deletion. Chromium verified success, conflict and private denial. All 87 focused tests passed. The forward migration and browser journey still need managed verification. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u16-owned-cancellation.json)

**Stage 3: JD/score admission**

- [ ] **PARTIAL** [CR-A07](reliability-remediation-plan.md#cr-a07): Version JD aliases while preserving literal quotation.
  - [x] **Local typed alias storage.** PostgreSQL reloaded literal `JS` and `Postgres`, the exact code-point spans and their versioned concepts. Managed adoption remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a09-native-jd-relations.md)
- [ ] **PARTIAL** [CR-A08](reliability-remediation-plan.md#cr-a08): Define typed alternatives, bounds and unmapped requirements.
  - [x] **Local typed clause storage.** PostgreSQL preserved OR and AND groups, inclusive 1–4 year bounds and an unfamiliar required clause as unknown. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a09-native-jd-relations.md)
  - [x] **CR-A08-S02, read common list markers in typed JD reviews.** Bulleted alternatives and explicit tenure bounds reach the owned score review with exact citations. Ambiguous clauses stay unresolved and equivalent clauses deduplicate. Saved JD replay retains its original reading. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a08-typed-jd-list-formatting.json)
  - [x] **CR-A08-S03, distinguish preferred and mandatory skills headings.** The typed score review cites the heading, respects explicit clauses and preserves saved JD scope. All 285 focused tests and 7,218 integrated tests passed. Representative calibration and managed review remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a08-typed-jd-skills-headings.json)
- [ ] **PARTIAL** [CR-A09](reliability-remediation-plan.md#cr-a09): Admit versioned JD relations through real storage and RPC replay.
  - [x] **CR-A09-S07, verify native JD writes and replay locally.** The 100-operation replay passed rollback and three observed service-role races. All 252 affected tests passed. Managed RLS, browser reload and restore remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a09-native-jd-relations.md)
- [ ] **PARTIAL** [CR-A10](reliability-remediation-plan.md#cr-a10): Evaluate requirement coverage from related dated facts.
  - [x] **CR-A10-S05, verify dated coverage from saved versions.** Fixed a typed JD save error on clauses with a skill-specific duration. Local PostgreSQL and the scoring engine verified overlapping intervals, historical and current JD bounds, and numeric withholding. All 472 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a10-native-typed-score.md)
  - Actual typed read-only consumer: fresh 347/17/full types/lint/web/worker PASS. Native/representative acceptance open; typed proposals separately paused. [Closeout](agent-handoffs/2026-11-09-reliability-implementation/a10-typed-consumer-closeout.md).
  - Actual semantic/duration prerequisites: fresh158/3/full static/builds PASS; typed matcher tests and actual consumer remain open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a10-semantic-evidence-closeout.md).
  - Reader source prerequisite: 88 cases/full static and builds PASS; semantic coverage/native acceptance open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a10-relationship-context-closeout.md).
- [ ] **PARTIAL** [CR-A15](reliability-remediation-plan.md#cr-a15): Complete deterministic score admission and explainable withholding.
  - [x] **CR-A15-S02, verify the JD quote before comparing legacy tenure.** The review keeps unsupported bounds, fractional durations, alternatives and subject-specific experience open for review. The format still handles inclusive general minimums. Synthetic regression and determinism checks passed. Authoritative scores remain withheld pending calibration. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a15-legacy-tenure-quote.json)
  - [x] **Verify score withholding in Chromium with saved input pairs.** The current and historical pages showed the expected duration evidence and withheld every authoritative dimension. Managed, representative and numerical-policy acceptance remain open. [Browser verification](agent-handoffs/2026-11-09-reliability-implementation/a10-native-typed-score.md#selected-versions-in-chromium)
- [ ] **PARTIAL** [CR-U04](reliability-remediation-plan.md#cr-u04): Keep JD, canonical, preview and diagnostics versions consistent.
  - [x] **CR-U04-S02, preserve the selected score versions.** Repair links retain their versions, current export requires the exact resume version, and historical resumes omit the export shortcut. Chromium verified both saved pairs and stale-head refusal. All 133 affected tests passed. Proposal races and managed acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a10-native-typed-score.md#selected-version-navigation)

**Stage 4: Truthful AI/authoring**

- [ ] **PARTIAL** [CR-A11](reliability-remediation-plan.md#cr-a11): Enforce bounded factual and relationship support for AI proposals.
  - [x] **CR-A11-S09, verify saved-input authoring preview and recovery.** Chromium verified the quote and confirmed-declaration previews, stale resume recovery, exact retry and unchanged storage when the writer is denied. All 129 affected tests passed. Successful writes and saved-event undo remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a11-declaration-closeout.md#cr-a11-s09-staged-authoring-in-chromium)
  - [x] **CR-A11-S08, verify native readiness and repair stale pins.** The 100-operation PostgreSQL replay reported a valid schema with the writer still denied. The repository now accepts either complete known profile and rejects mixed pins. All 136 affected tests passed. Native authoring transactions and managed acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a11-readiness-closeout.md#cr-a11-s08-readiness-after-regroup)
  - Authenticated typed page/resource/undo source: 184 tests/11 files plus full types/lint/web/worker PASS; 798 stable inputs. Default-off; native writer denied. Readiness/cutover/native/broader support remains open. [HTTP checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a11-http-closeout.md).
  - Bound typed proposal/repository/review source: 193 tests/8 files plus full types/lint/web/worker PASS; 790 stable inputs. SQL remains unparsed, unexecuted and denied; route/cutover/native/usefulness acceptance remains open. [Source checkpoint](agent-handoffs/2026-11-09-reliability-implementation/a11-typed-path-closeout.md).
  - Pre-dispatch supplied-snapshot/target admission: 25/2/full types/lint/web/worker PASS. Complete typed/atomic/consumer/usefulness path open. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/a11-preflight-closeout.md).
- [ ] **PARTIAL** [CR-A12](reliability-remediation-plan.md#cr-a12): Apply support, source/version binding and budget to explicit rewrites.
  - [x] **CR-A12-S04, restore rewrite reads on the current schema.** Fixed stale readiness pins. Chromium verified an empty workspace and a saved legacy draft on current and historical inputs with setup and generation disabled. All 214 affected tests passed. Publication and version-bound replay remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a12-workspace-bootstrap-closeout.md#cr-a12-s04-native-rewrite-read-admission)
- [ ] **PARTIAL** [CR-A13](reliability-remediation-plan.md#cr-a13): Apply the same truth contract to initial qualitative feedback.
  - [x] **CR-A13-S11, restore saved-feedback reads on the current schema.** Fixed the stale checker pin. Local PostgreSQL verified legacy provenance, foreign-owner and pending-deletion refusal, and staged capability denial. All 439 affected tests passed. Version-bound publication and replay remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a13-publication-usage-closeout.md#cr-a13-s11-native-saved-feedback-read-admission)
- [ ] **PARTIAL** [CR-A14](reliability-remediation-plan.md#cr-a14): Generate useful source-backed JD improvements and honest deltas.
  - [x] **CR-A14-S08, verify clause-order preview, decisions and undo on saved inputs.** Fixed the stale readiness pin. Chromium and local PostgreSQL verified reject, accept, exact replay, stale-head refusal and undo. All 541 affected tests passed. Managed verification and broader usefulness remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md#cr-a14-s08-clause-order-decisions-in-chromium)
  - [x] **CR-A14-S09, keep required evidence gaps visible.** The recommendation plan now shows unresolved requirements before already-supported claims within the same importance group. The regression verified a required Pydantic gap, five supported required skills and a separate preferred Redis requirement. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a14-jd-required-gap-priority.json)
  - [x] **CR-A14-S10, find supported resume drafts in long job descriptions.** The planner finds relevant skills before spending its detailed validation budget. A supported Git draft after 52 unrelated requirements reached the same full validator and kept its exact source and JD citations. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-a14-clause-order-candidate-selection.json)
- [ ] **PARTIAL** [CR-U05](reliability-remediation-plan.md#cr-u05): Make legacy writing output truthful, source-bound and usable.
  - [x] **CR-U05-S03, verify legacy draft copy and retry.** Local Chromium copied the exact saved summary and suggested bullet from current and historical score views. A denied clipboard write left the draft visible and a retry succeeded. PostgreSQL confirmed the draft, resume head and version IDs stayed unchanged. All 106 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a12-workspace-bootstrap-closeout.md#cr-u05-s03-saved-draft-copy-and-retry)
- [ ] **PARTIAL** [CR-U06](reliability-remediation-plan.md#cr-u06): Complete reviewed authoring, questions, accept/reject and undo.
  - [x] **Verify the clause-order decision journey locally.** Chromium checked review acknowledgement, reject, accept, exact replay and saved-event undo against PostgreSQL. [CR-A14-S08](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md#cr-a14-s08-clause-order-decisions-in-chromium)
  - [x] **CR-U06-S03, verify clarification review and undo.** Chromium verified that editing the answer invalidates the preview, a fresh preview requires fresh acknowledgement, and confirmation saves the complete fact. Undo restored the original wording and citations in a new revision. PostgreSQL confirmed both events and scores stayed unavailable. All 32 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md#cr-u06-s03-manual-clarification-in-chromium)
  - [x] **CR-U06-S04, recover a stale clarification across tabs.** The stale confirmation returned HTTP 409 and wrote no version or event. The page loaded the newer fact, retained the answer in its own field, and saved only after a fresh preview and confirmation. Chromium and PostgreSQL verified the journey, and all 91 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md#cr-u06-s04-cross-tab-clarification-recovery)
- [ ] **PARTIAL** [CR-U07](reliability-remediation-plan.md#cr-u07): Protect facts and consent in every Build mode.
  - [x] **CR-U07-S01, verify all three modes in Chromium.** Hover sent nothing. Selection and mode changes cleared consent. The simulated provider received only the disclosed lines. Fix, Rewrite and Resume withheld an unsupported metric change and applied and undid a supported formatting edit. Resume required separate fact confirmation. [Verification](agent-handoffs/2026-11-09-reliability-implementation/frontend-build-factual-support.md#cr-u07-s01-and-cr-r06-s03-build-browser-and-budget-verification)
- [ ] **PARTIAL** [CR-U10](reliability-remediation-plan.md#cr-u10): Separate session, provider-auth and transient AI failures.
  - [x] **CR-U10-S03, verify Build failure recovery.** Chromium verified expired app-session recovery, safe upstream authentication and temporary failure messages, and a fresh consented request after a refusal with known usage. PostgreSQL preserved usage holds and refused dispatch when the remaining capacity was insufficient. All 272 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/frontend-build-factual-support.md#cr-u10-s03-build-session-and-provider-recovery)
  - [x] **CR-U10-S04, classify legacy rewrite and qualitative provider errors.** SDK checks separated upstream authentication rejection from temporary failures. The rewrite action preserved the saved draft and held unknown usage. The worker retained deterministic feedback after upstream authentication rejection without scheduling another attempt. All 198 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a02-source-u10-closeout.md#cr-u10-s04-legacy-rewrite-and-qualitative-recovery)
  - [x] **CR-U10-S05, distinguish canonical rewrite failure recovery.** Checks verified sign-in with the retained request, distinct provider outcomes, and fresh consent for a new attempt after confirmed failure. Uncertain accounting kept the original request, and saved drafts remained readable. All 263 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a12-workspace-bootstrap-closeout.md#cr-u10-s05-canonical-rewrite-failure-recovery)
  - [x] **CR-U10-S06, preserve initial feedback after upstream failure.** The SDK and worker checks distinguish an empty 401 from a temporary 503, keep deterministic results and hold unknown usage without dispatching again on replay. The result page presents the verified availability reason. All 164 affected tests passed, plus the isolated PostgreSQL read check. [Verification](agent-handoffs/2026-11-09-reliability-implementation/a13-publication-usage-closeout.md#cr-u10-s06-source-bound-initial-feedback-recovery)
  - [x] **CR-U10-S07, stop expired Build suggestions.** A deadline frees the dialog during hashing or response reads. The selection stays available and a retry needs fresh consent. Chromium discarded a late expired response after a fresh result. All 268 focused tests passed. Managed and live provider checks remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u10-build-ai-client-deadline.json)
- [ ] **PARTIAL** [CR-R06](reliability-remediation-plan.md#cr-r06): Bind Build requests to both technical budgets and all-mode support.
  - [x] **CR-R06-S03, restore budget admission on the current schema.** The old profile caused HTTP 503. The shared guard now accepts either complete supported catalog profile and denies mixed fingerprints. PostgreSQL verified source registration, first dispatch and settlement for six Build requests. All 731 affected tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/frontend-build-factual-support.md#cr-u07-s01-and-cr-r06-s03-build-browser-and-budget-verification)

**Stage 5: OCR quality/integration**

- [ ] **PARTIAL** [CR-A05](reliability-remediation-plan.md#cr-a05): Repair OCR quality using declared development scan segments.
  - [x] **CR-A05-S02, measure the registered OCR development sources.** Both PSM 3 profiles passed transcription on all six documents. Mixed structured-field recall was 15/16, below the 97% floor. Preserve that failure for the parser repair. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#development-comparison-on-2026-11-22)
  - [x] **CR-A05-S03, preregister held-out layouts and repair the mixed employer case in development.** The review-only candidate recovered 48/48 fields with exact citations and no extra proposals. Calibration, locked evaluation, and application adoption remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#held-out-registration-and-mixed-field-candidate)
  - [x] **CR-A05-S04, run the registered calibration.** The frozen candidate recovered 66/72 fields. Clean, challenging and mixed recall each fell below 97%. The locked set is untouched. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#first-calibration-result)
  - [x] **CR-A05-S05, repair employment layouts and run fresh calibration.** The candidate recovered 96/96 development fields. Fresh calibration recovered 69/72 and failed recall and exact-line confidence floors. The locked set is untouched. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#expanded-development-and-second-calibration)
  - [x] **CR-A05-S06, recover employers in OCR headers with workplace modes.** The new profile recovered 48/48 fields from six development PDFs. Three recognition settings each matched 75/78 line positions. Line repair, fresh calibration and locked evaluation remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#workplace-headers-and-ocr-line-comparison)
  - [x] **CR-A05-S07, identify the clean development mismatch.** Both models returned a hyphen for the source en dash. Line recognition, fresh calibration and locked evaluation remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#locate-the-clean-fixture-line-mismatch)
  - [x] **CR-A05-S08, compare punctuation controls and recover names ending in Lab.** Three settings each preserved 19/19 hyphens and recovered 0/10 en dashes. The new review-only parser recovered 32/32 fields, up from 29/32, with exact citations. The 408 affected tests passed. Line recognition and held-out evaluation remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#compare-hyphen-and-en-dash-controls)
  - [x] **CR-A05-S09, recover punctuation from character boxes.** The guarded experiment recovered 16/19 en dashes and preserved all 34 hyphens and three em dashes. Exact line matches rose from 68/90 to 84/90. Three en dashes and three minus signs still fail. Fresh calibration and locked evaluation remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#compare-character-geometry-on-synthetic-punctuation)
  - [x] **CR-A05-S10, recover numeric ranges and signs.** The frozen development candidate matched 129/129 lines and recovered 80/80 source-backed fields across ten synthetic PDFs. It resolved all six earlier line errors and preserved the new punctuation controls. Fresh calibration and locked evaluation remain open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#recover-marks-next-to-digits)
  - [x] **CR-A05-S11, run the third calibration.** The frozen candidate recovered 119/120 fields on 15 new synthetic PDFs. Exact line agreement failed in all three segments. Challenging field precision and recall also failed. The consumed result is recorded and locked evaluation remains open. [Verification](../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#third-calibration-result)
- [ ] **PARTIAL** [CR-A06](reliability-remediation-plan.md#cr-a06): Integrate approved OCR into the actual owned upload/worker path.
  - [x] **CR-A06-S01, fence synthetic OCR through the owned extraction stage.** The isolated stage checked cancellation, remaining time, retention and lease binding before recognition. It preserved native pages and rejected a stale write without fallback. [Verification](../docs/operations/OCR_WORKER.md#owned-extraction-stage)
- [ ] **PARTIAL** [CR-U09](reliability-remediation-plan.md#cr-u09): Show accurate worker/OCR progress, recovery and guidance.
  - [x] **CR-U09-S01, show saved worker status and source-specific extraction recovery.** Chromium verified waiting, active extraction and recovery for each supported response state. The API tests verified scoped evidence status reads. Actual worker readiness and leased upload OCR remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u09-analysis-recovery.json)
  - [x] **CR-U09-S02, discard stale progress and cancellation responses.** A confirmed cancellation or access denial stops older polls. Switching analysis resets the view and discards the previous request. Chromium verified both delayed-poll cases, and all 46 focused tests passed. Worker readiness and managed verification remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u09-progress-response-order.json)
  - [x] **CR-U09-S03, show recent worker queue checks.** Disposable PostgreSQL verified both lease modes and access checks. Chromium verified the waiting messages and their removal once extraction starts. All 51 focused tests passed. An end-to-end leased OCR upload on an approved managed target remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u09-queue-observation.json)
  - [x] **Verify progress after access changes.** The local browser confirmed that progress clears its previously shown status when access is denied. Leased OCR and worker readiness remain open. [CR-U16-S03 verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u16-direct-result-status.json)
- [ ] **PARTIAL** [CR-R15](reliability-remediation-plan.md#cr-r15): Approve bounded OCR activation, data and privacy contracts.
  - [x] **CR-R15-S01, verify default-off local OCR preflight.** Both synthetic worker profiles recognized only the expected pages and cleared their containers after success and failure. The consumer decision and durable admission remain open. [Verification](../docs/operations/OCR_WORKER.md#verify-the-synthetic-worker)

**Stage 6: Compiler/Build**

- [ ] **PARTIAL** [CR-U08](reliability-remediation-plan.md#cr-u08): Verify Build apply/undo, source versions and real PDF lifecycle.
  - [x] **CR-U08-S01, bind Build output to the current request and page.** Stale canvas pixels stay hidden and late bytes after the client deadline cannot restore output. Chromium verified page navigation, apply, recompile, undo and byte-matched downloads with synthetic responses. All 273 focused tests passed. The reviewed compiler run remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-build-pdf-lifecycle.json)
  - [x] **CR-U08-S02, bound compile replies and preserve the editor during sign-in recovery.** Build rejects invalid and oversized replies without exposing a download and cancels unfinished reads. Chrome verified sign-in in a separate tab, retry with the same code, and three byte-matched downloads. All 288 focused tests passed. Current worker and managed sign-in verification remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-response-recovery.json)
  - [x] **CR-U08-S03, verify the Build journey on the real local compiler.** At 200% zoom, Chrome verified three real compilations, PDF.js preview and page text, exact downloads, and preview removal after apply and undo. Auth, rate admission and the AI suggestion used fixtures. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-real-compiler-and-chrome.json)
  - [x] **CR-U08-S04, stop cancelled or expired compile admission.** Both rate checks share one server deadline. A late reply cannot start the next check or the compiler. Chrome verified source retention and a retry on the real worker after one simulated rate response expired. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-admission-deadline.json)
  - [x] **CR-U08-S05, recover one failed PDF page render.** Chrome at 200% zoom verified that keyboard retry redraws the page without recompiling. Page text and download stayed available, and three real compilations produced byte-matched downloads. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-preview-page-recovery.json)
  - [x] **CR-U08-S06, preserve the selected pane and keyboard focus during compilation.** Chrome at 200% zoom kept editor focus after the user selected Code during compilation. Focus returned to Recompile when the focused Cancel button disappeared. Three real compilations produced byte-matched downloads. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-pane-focus.json)
  - [x] **CR-U08-S07, check the PDF before enabling download.** Chrome rejected a two-page PDF with a one-page response header, kept the source, and successfully recompiled it. Three real outputs produced byte-matched downloads. A separate preview deadline preserves download when the browser renderer is unavailable. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-browser-pdf-verification.json)
  - [x] **CR-U08-S08, prepare the managed Build browser run and exact fixture cleanup.** The guarded runner discovers all seven Build cases and checks the reviewed image. Local PostgreSQL verified removal of two journaled rate rows, refusal while Auth records remained and preservation of shared and unrelated counters. Hosted execution remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u08-managed-build-runner.json)
- [ ] **PARTIAL** [CR-U11](reliability-remediation-plan.md#cr-u11): Explain compiler absence and safe restart/recovery.
  - [x] **CR-U11-S02, verify missing-image recovery in Chromium.** Two requests reached the actual Docker image check and returned recoverable 503s. The source stayed intact, and the page withheld PDF output. [Verification](../docs/operations/LATEX_CONVERTER.md#verify-the-missing-compiler-in-a-local-browser)
  - [x] **CR-U11-S03, verify local service recovery with the reviewed successor worker.** Chrome verified preview and exact downloads on the rebuilt image. The runtime drill confirmed that cleanup uncertainty requires a fresh process. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-debian-stock-security.json)
- [ ] **PARTIAL** [CR-R14](reliability-remediation-plan.md#cr-r14): Verify actual compiler output, confinement and cleanup.
  - [x] **CR-R14-S05, restrict XeTeX to the stable package trees and verify actual output.** The image checks stable class resolution during assembly. All six starter combinations and the two-page render check passed on the same image. Chrome verified three matching downloads. The final container check was empty. Current native advisory review and formal runtime acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-real-compiler-and-chrome.json)
  - [x] **CR-R14-S06, verify PDF output after the Debian security update.** The rebuilt image compiled all six starter combinations, rendered both pages of the longer fixture, and passed three byte-matched Chrome downloads at 200% zoom. No converter containers remained. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-debian-stock-security.json)
  - [x] **CR-R14-S07, verify PDF output on the local-PDF Poppler successor.** All six starter combinations compiled. Both rendered pages matched the predecessor PNG bytes, and Chrome verified three exact downloads at 200% zoom. No converter containers remained. Formal worker admission is open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-poppler-local-pdf-worker.json)
  - [x] **CR-R14-S08, verify the flattened worker's compile and confinement.** The exact image passed six starter cases, paired two-page renders and three byte-matched Chrome downloads. The Landlock ABI 8 probe passed and no test containers remained. Primary worker admission is still open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-flattened-latex-worker.json)
  - [x] **CR-R14-S09, admit the flattened image through the primary verifier's opt-in profile.** Six exact-image checks passed, including 107 frame cases, 14 installed ELF hashes and Landlock ABI 8. Eight invalid invocations were refused. The predecessor's native check retained its 70/71 result under E010. Broader runtime acceptance is open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-local-pdf-primary-admission.json)
  - [x] **CR-R14-S10, verify worker cancellation, expiry and recovery.** Five checks passed on the exact flattened image. The verifier removed cancelled and timed-out workers, refused a third concurrent request and compiled two pages in the same process after cleanup. Runtime and release acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-flattened-latex-lifecycle.json)
  - [x] **CR-R14-S11, bound Docker checks before worker creation.** Two slow image checks occupy both slots. A third request receives `busy` before reaching Docker. Cancellation and unavailable images release their slots. Synthetic adapter tests and the reviewed worker lifecycle and starter checks passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-compiler-preflight-capacity.json)
  - [x] **CR-R14-S12, verify exact source and page limits.** The reviewed worker produced ten readable pages from a 49,152-byte source. Source admission refused one additional byte, the compiler withheld the eleven-page output, and a one-page recompile succeeded in the same process. Cleanup checks found no converter containers. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-source-page-boundaries.json)
  - [x] **CR-R14-S13, verify the 5 MiB output ceiling.** The installed supervisor accepted an ordinary rendered PDF padded to exactly 5 MiB and refused one extra byte before reading it. Separate adapter tests verified the decoded response limit. Both disposable workers were removed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-pdf-output-ceiling.json)
  - [x] **CR-R14-S14, verify effective worker resource settings.** The kernel reported two CPUs, 512 MiB of memory, zero swap and 128 MiB of scratch. The probe reached the PID, descriptor and file-size limits. Only loopback was active, and no converter containers remained. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-effective-worker-resources.json)
  - [x] **CR-R14-S15, exercise CPU, memory and scratch saturation.** The kernel stopped the CPU child at ten seconds and recorded one local memory-limit kill. Scratch refused another block at 128 MiB and recovered after cleanup. The disposable worker was removed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-worker-saturation.json)
  - [x] **CR-R14-S16, verify PDF structural policy and the rendered link.** The installed inspector passed 16 neutral cases. Five separate mock cases verified image-policy rejection and hook restoration. A two-page compile preserved the link and all eight text positions. No converter containers remained. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-worker-pdf-policy.json)
- [ ] **PARTIAL** [CR-R18](reliability-remediation-plan.md#cr-r18): Resolve npm and worker-image advisories without filtering.
  - [x] **CR-R18-S05, patch and verify the npm advisory.** Both npm audits report zero known advisories after the parser update. Registry signatures, 61 artifact tests and 20 synthetic PDF and DOCX parity cases passed. The native image scans remain open. [Dependency disposition](../docs/evaluation/DEPENDENCY_DISPOSITION.md)
  - [x] **CR-R18-S06, upgrade and verify the LaTeX PDF parser.** The rebuilt worker loads hash-pinned pypdf 7.1.1. Five mock checks verified the parser guards and hook restoration. All six starter cases, two rendered pages and three byte-matched Chrome downloads passed on the same image. [Evidence](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-parser-advisory-review.json)
  - [x] **CR-R18-S07, inventory the LaTeX worker and match Debian advisories.** The original image-bound CycloneDX SBOM contains 217 components. Debian identified 19 records where the installed source version preceded a published fix. [Dependency disposition](../docs/evaluation/DEPENDENCY_DISPOSITION.md#native-images)
  - [x] **CR-R18-S08, resolve the 19 Debian version flags on the local LaTeX worker.** Six exact Debian package upgrades addressed 18 advisories. The installed FreeType library hash and XeTeX linkage verified the reviewed backport for the nineteenth. The successor SBOM records 217 components. Complete image scans and disposition of the other advisories remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-debian-stock-security.json)
  - [x] **CR-R18-S09, retain all main-image package advisories in CI.** Actionlint and 83 focused tests passed. Workflow fixtures verified that all advisory records survive metadata cleanup. The upload step precedes the high and critical gate. The GitHub Actions scan remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-main-image-ci-evidence.json)
  - [x] **CR-R18-S10, inventory the exact OCR worker and compare Debian versions.** The 172-component SBOM matched the installed packages and vendored files. The Debian tracker identified the 15 version gaps addressed by S11. The full image scan remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-ocr-image-inventory.json)
  - [x] **CR-R18-S11, apply the four reviewed Debian fixes to the OCR worker.** Both ARM64 and AMD64 images contain the fixed versions for all 15 recorded version gaps. ARM64 verified exactly four package changes against the previous image. Both OCR profiles passed on both architectures, including failure handling and cleanup. Full image scans and consumer acceptance remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-ocr-security-cohort.json)
  - [x] **CR-R18-S12, authenticate the scanner and retain reports for the exact worker images.** Trivy completed four offline scans across the LaTeX ARM64 and OCR ARM64 and AMD64 successor images. The LaTeX report has zero critical and 142 high matches. Each OCR report has four critical and 145 high matches. The MiniZip component is absent from both OCR images. The other three OCR critical findings, high-severity dispositions and main-image CI scan remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-current-worker-scanner-evidence.json)
  - [x] **CR-R18-S13, compare high and critical findings with Debian and the exact runtime.** Matched all 440 report rows across three worker images to the Debian tracker and measured library dependencies. Verified four Expat fixes in the exact LaTeX custom build. Raw counts are preserved. LaTeX has 138 open high matches. Each OCR image has three open critical and 145 open high matches. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-worker-high-critical-disposition.json)
  - [x] **CR-R18-S14, verify the source option and package impact for removing Poppler HTTP support.** The pinned source has a separate curl option. An APT simulation on the current image would remove both Poppler packages along with curl and the four Kerberos packages. The replacement build and PDF verification are still open. This cohort accounts for 58 current high matches. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-poppler-network-dependency-preflight.json)
  - [x] **CR-R18-S15, build and scan an opt-in LaTeX worker with Poppler HTTP support disabled.** The exact image retains both Poppler packages and removes curl and four Kerberos packages. The raw high count fell from 142 to 84, including four previously verified Expat fixes. Zero critical matches remain in this LaTeX image. The original signature suite result is 70/71. The suite passed 71/71 with the padding-normalized test copy. Formal worker and release admission remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-poppler-local-pdf-worker.json)
  - [x] **CR-R18-S16, remove retired libraries from the opt-in worker archive.** The image contains one filesystem layer and one verified empty layer. No predecessor payload layer remains. All 32,534 effective filesystem entries matched in content and security metadata. The exact scan and SBOM confirm the package inventory and advisory counts. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-flattened-latex-worker.json)
  - [x] **CR-R18-S17, qualify a local worker without the OpenSSL CLI.** The opt-in image removes only the CLI and CA bundle. Six starter PDFs and three Chrome downloads matched their predecessor bytes. The scan removed one high match and added none, leaving 79 open high matches on the candidate. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-openssl-cli-purge.json)
  - [x] **CR-R18-S18, measure offline signature behavior and the CA-store change.** Both exact images reported a valid signature on the normalized public OpenPGP fixture and the same failures on the original and CMS fixtures. The default Python CA store fell from 148 roots to zero. Explicit loading passed on both. The candidate stays opt-in while positive CMS and full native verification remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-worker-signature-trust-parity.json)
  - [x] **CR-R18-S19, verify a valid CMS signature and chain on both exact images.** Both accepted the signature and rejected the chain with an empty trust store. NSS verified the same chain with the synthetic root installed. Both Poppler CLIs still reported a generic certificate error. Native requalification, advisory disposition and promotion remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r18-worker-cms-result.json)

**Stage 7: Consumer trust/signals**

- [ ] **PARTIAL** [CR-U12](reliability-remediation-plan.md#cr-u12): Verify actual email sign-in and session recovery.
  - [x] **CR-U12-S01, keep the return destination through email sign-in recovery.** Chromium verified an expired link, a failed resend, a different browser, a successful replacement link, replay refusal and sign-out with simulated Auth. All 60 focused tests passed. Live email delivery and managed session refresh remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u12-email-link-recovery.json)
- [x] [CR-U13](reliability-remediation-plan.md#cr-u13): Resolve advertised OAuth and account-linking contracts. Official provider documentation confirms the Google flow and its account-linking prerequisite, the ChatGPT partner trial, and the separate AI funding contracts. Provider implementation and live acceptance remain in CR-U14 and CR-U15. [Provider contract](../docs/decisions/0022-auth-provider-contract.md)
- [ ] **PLANNED / NOT IMPLEMENTED** [CR-U14](reliability-remediation-plan.md#cr-u14): Complete Google identity when in the approved capability matrix.
- [ ] **PLANNED / NOT IMPLEMENTED** [CR-U15](reliability-remediation-plan.md#cr-u15): Complete ChatGPT identity only on a documented approved mechanism.
- [ ] **PARTIAL** [CR-U17](reliability-remediation-plan.md#cr-u17): Verify consumer export/delete/session privacy journeys.
  - [x] **CR-U17-S01, preserve the current session when signing out other devices.** Chromium used simulated Auth to verify one token refresh, a failed revocation that kept both sessions, a successful retry and new sign-in. All 202 focused tests passed. Managed revocation, privacy export and deletion journeys remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-account-sessions.json)
  - [x] **CR-U17-S02, verify private export and deletion status in Chromium.** The native download preserved the exact JSON and the refreshed session. A queued deletion blocked downloads until cancellation. A prepared deletion kept downloads blocked, and the completion message avoided claiming full erasure. All 237 focused tests passed. Supabase responses were simulated. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-privacy-journey.json)
  - [x] **CR-U17-S03, make privacy form retries idempotent.** Chromium recovered a missing audit after a request was saved. Retrying a cancelled deletion kept it cancelled, and a fresh form could start a new request. All 234 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-privacy-request-replay.json)
  - [x] **CR-U17-S04, grant the server the privileges required for idempotent audits.** Disposable PostgreSQL verified contention, no duplicate processing steps, one audit row and unchanged client grants. The managed target still needs the migration. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-privacy-request-replay.json)
  - [x] **CR-U17-S05, require fresh email verification for account deletion.** The separate verification session is bound to the signed-in account and browser session for up to 10 minutes. A verified link enables confirmation. A separate submission queues deletion and clears the verification cookie. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-deletion-verification.json)
  - [x] **CR-U17-S06, verify the deletion confirmation journey.** Chromium rejected unverified submissions, expired verification and a different account. It verified that another browser could not consume the link and that retrying an audit failure kept one request. Ordinary sign-in recovery and 248 focused tests passed. Managed email and cleanup remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u17-deletion-verification.json)
- [ ] **PARTIAL** [CR-U18](reliability-remediation-plan.md#cr-u18): Export the exact corrected and confirmed version.
  - [x] **Local export confirmation and parity.** Verified the check and download responses and independently parsed corrected PDF and DOCX bytes. [CR-A04-S06 results](agent-handoffs/2026-11-09-reliability-implementation/u18-closeout.md#confirmation-before-check-or-download)
- [ ] **PARTIAL** [CR-U19](reliability-remediation-plan.md#cr-u19): Complete mobile, keyboard and accessibility acceptance.
  - [x] **CR-U19-S01, repair keyboard focus and contrast in deletion confirmation.** Chromium verified focus containment, pending-state focus and return to the trigger at narrow widths. Axe found zero serious or critical violations in the dark verification prompt and light confirmation dialog. All 256 focused tests passed. The broader accessibility matrix and manual screen-reader checks remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-privacy-dialog.json)
  - [x] **CR-U19-S02, repair sign-in recovery on mobile and keyboard.** Focus follows the result, and a failed resend keeps a valid address valid. Chromium tested keyboard retry at 390 and 320 CSS pixels with simulated Auth. Axe found zero serious or critical violations in the two tested sign-in states. All 104 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-auth-recovery-a11y.json)
  - [x] **CR-U19-S03, repair narrow-screen correction controls and focus.** Chromium verified keyboard correction, selection, acknowledgement and application at 390 and 320 CSS pixels. Focus reached each result, the full chosen target stayed readable, and the dark correction section had zero serious or critical Axe violations. The disposable PostgreSQL workflow and PDF/DOCX content checks passed. All 290 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-correction-review-a11y.json)
  - [x] **CR-U19-S04, repair keyboard recovery from a stale resume version.** Chromium and disposable PostgreSQL verified the stale save and reviewed retry at 320 CSS pixels. Focus reached the conflict and success messages, and the retained correction region had zero serious or critical Axe violations. All 253 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-stale-canonical-recovery-a11y.json)
  - [x] **CR-U19-S05, repair clarification review and stale recovery by keyboard.** At 390 and 320 CSS pixels, Chromium verified preview focus, a shortcut from the stale-save alert to the retained answer, and confirmation by keyboard. PostgreSQL verified no change from the stale attempt and the exact saved fact after fresh acknowledgement. The preview had zero serious or critical Axe violations, and all 251 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-clarification-recovery-a11y.json)
  - [x] **CR-U19-S06, repair keyboard focus in typed wording review.** Chromium at 390 and 320 CSS pixels verified focus on previews and errors, recovery from stale inputs, and a freshly acknowledged keyboard retry. With the writer disabled, both submissions returned HTTP 503 with the same command and left the saved version unchanged. The proposed wording review had zero serious or critical Axe violations, and all 419 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-typed-wording-recovery-a11y.json)
  - [x] **CR-U19-S07, verify both authoring flows at 200% browser zoom.** Chromium used its Page zoom setting in a disposable profile. At effective widths of 390 and 320 CSS pixels, review and stale recovery passed by keyboard, the tested confirmation controls fit, and both preview regions had zero serious or critical Axe findings. PostgreSQL verified the reviewed clarification save and that the denied typed wording retry preserved the saved version. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-authoring-browser-zoom.json)
  - [x] **CR-U19-S08, verify correction, export and stale fact recovery at 200% browser zoom.** Chromium and disposable PostgreSQL verified correction review, fact confirmation, PDF/DOCX downloads and two-tab recovery. Confirmation and download controls fit at 320 CSS pixels, and both tested correction regions had zero serious or critical Axe findings. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-correction-browser-zoom.json)
  - [x] **CR-U19-S09, verify sign-in recovery and deletion confirmation at 200% browser zoom.** At 390 and 320 CSS pixels, Chromium verified keyboard retry, focus containment and return, and a visible final deletion action. The two sign-in states and both dialog steps had zero serious or critical Axe findings. Auth and request processing used simulated services. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-account-browser-zoom.json)
  - [x] **CR-U19-S10, verify Build and PDF preview at 200% browser zoom.** At 390 and 320 CSS pixels, Chromium verified pane switching, suggestion apply and undo, PDF.js text, and keyboard download. The downloaded bytes matched the active PDF after each compile. The suggestion review and compilation workspace had zero serious or critical Axe findings. Auth, compilation and suggestions used simulated transport. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-build-browser-zoom.json)
  - [x] **CR-U19-S11, repair keyboard focus on analysis status retry.** At 200% Chromium zoom, retry kept focus on the live status while the simulated check was pending and after it returned. At 320 CSS pixels, Tab reached the evidence link without clipping, and the progress region had zero serious or critical Axe findings. All 31 public Chromium smoke tests and 278 focused tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-progress-browser-zoom.json)
  - [x] **CR-U19-S12, repair history focus and contrast and verify private PDF access at 200% zoom.** At 320 CSS pixels, Next moved focus to the history heading, and the original PDF opened by keyboard with exact stored bytes. History passed scoped Axe checks in light and dark themes. Simulated services verified sign-out and Back, account switching, and refusal after deletion began. All 46 focused tests and 31 public Chromium smoke tests passed. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-history-source-browser-zoom.json)
  - [x] **CR-U19-S13, repair keyboard focus in JD clause-order decisions.** At 200% Chromium zoom and 320 CSS pixels, keyboard actions reached rejection, acceptance and undo confirmations. The decision region had zero serious or critical Axe findings. Disposable PostgreSQL verified exact replay, stale refusal, and restoration of the original wording. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-clause-order-browser-zoom.json)
  - [x] **CR-U19-S14, verify saved writing drafts at 200% zoom.** Chromium checked keyboard copy, recovery from simulated clipboard denial, and scoped Axe checks at 320 CSS pixels on current and historical inputs. PostgreSQL confirmed the saved draft and version history stayed unchanged. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-u19-rewrite-browser-zoom.json)
- [ ] **PARTIAL** [CR-R17](reliability-remediation-plan.md#cr-r17): Verify exact fixture cleanup and deletion recovery.
  - [x] **CR-R17-S02, local verification.** The privacy worker checks exact-key absence before completing existing deletion plans. Provider response, retry and cancellation regressions passed. Bound admission retirement and managed verification remain open. [Results](agent-handoffs/2026-11-09-reliability-implementation/privacy-storage-absence-closeout.md).
  - [x] **CR-R17-S03, local verification.** Tracked upload cleanup checks durable non-adoption, the acknowledged Storage object ID, and exact-key absence. SDK and native PostgreSQL transition checks passed. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-compensation-closeout.md).
  - [x] **CR-R17-S04, local verification.** The privacy worker can resume acknowledged tracked-upload cleanup on a fresh claim. Bounded recovery, stale-attempt refusal and SDK retry checks passed. Account-wide retirement remains open. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-cleanup-recovery-closeout.md).
  - [x] **CR-R17-S05, local verification.** A live attempt drains successive eligible batches under a shared deadline. Repeated keys, scope drift and late responses are refused. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-cleanup-batches-closeout.md).
  - [x] **CR-R17-S06, local verification.** Deadline-limited cleanup with newly recorded progress can hand off remaining uploads without spending a failure. Native tests preserved the attempt fence and genuine failure limit. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-cleanup-progress-closeout.md).
  - [x] **CR-R17-S07, local verification.** A live deletion claim must issue each upload-specific absence receipt. Older cleaned markers need fresh verification. Native replay, reference and owner export checks passed. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-cleanup-receipts-closeout.md).
  - [x] **CR-R17-S08, local verification.** The deletion inventory binds acknowledged adopted uploads to the exact source and checks recorded worker state. Native terminal and evidence-review cases passed. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-adopted-source-closeout.md).
  - [x] **CR-R17-S09, local verification.** The actual privacy queue uses verified cleanup credits when reclaiming a deletion. Native tests passed four handoffs and three genuine failures through the queue. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-credit-claim-closeout.md).
  - [x] **CR-R17-S10, local verification.** Adopted uploads hand off their exact Storage obligation before source deletion. Fresh claims can resume the plan and record absence. Account completion stays held pending ledger retirement. [Results](agent-handoffs/2026-11-09-reliability-implementation/admission-deletion-handoff-closeout.md).
  - [x] **CR-R17-S11, local verification.** The database retires the exact admission ledger and completes the sealed request atomically after verified Storage absence. Local PostgreSQL passed stale and foreign scope refusal and rollback. The 91-migration inventory is pinned. Managed cleanup and broader account erasure remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/admission-ledger-retirement-closeout.md).
- [ ] **PARTIAL** [CR-R20](reliability-remediation-plan.md#cr-r20): Verify safe operational metrics, alerts and actual delivery.
  - [x] **CR-R20-S01, fix cumulative histogram export and queue-age alert buckets.** Local tests verified that expired summary samples still count in Prometheus and that queue-age buckets extend past the five-minute threshold. The alert rule check passed. Managed scraping, end-to-end correlation and delivery remain open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r20-histogram-export.json)

**Stage 8: Integrated/operational evidence**

- [ ] **PARTIAL** [CR-R11](reliability-remediation-plan.md#cr-r11): Verify the real leased lifecycle in an approved safe target.
- [ ] **PLANNED / NOT RUN** [CR-R21](reliability-remediation-plan.md#cr-r21): Measure real HTTP/database/queue capacity and recovery.
- [ ] **PLANNED / NOT RUN** [CR-R22](reliability-remediation-plan.md#cr-r22): Perform actual isolated managed restore and compatibility checks.
  - [x] **CR-R22-S01, wait for the observed quarantine in restore admission tests.** The local tests now await the journal write and check that the delayed reopen rejects the stale token. The managed restore drill remains open. [Verification](agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-pdf-output-ceiling.json)
  - [ ] Run the approved Supabase restore drill, including private objects, historical artifacts and diagnostics, queue and authenticated journeys, and RPO/RTO. The CR-R16 comparison is available for the database evidence. [Restore procedure](../docs/operations/BACKUP_RESTORE.md)
- [ ] **PLANNED / NOT RUN** [CR-R23](reliability-remediation-plan.md#cr-r23): Rehearse kill switches, rollback and operator recovery.
- [ ] **PLANNED / NOT RUN** [CR-G01](reliability-remediation-plan.md#cr-g01): Pass the complete local consumer reliability gate.
  - [x] **Run the integrated application checks and public browser suite.** The [CR-R16-S17 run](agent-handoffs/2026-11-09-reliability-implementation/cr-r16-historical-profile-verify.json) verified the local build and public journeys. Authenticated managed and live runtime checks remain open.

**Stage 9: Later feedback/release**

- [ ] **PLANNED / NOT RUN** [CR-G02](reliability-remediation-plan.md#cr-g02): Run owner-authorized opt-in feedback and per-segment validity evaluation.
- [ ] **PLANNED / NOT RUN** [CR-G03](reliability-remediation-plan.md#cr-g03): Complete operations acceptance and explicit later launch decision.

Implementation follows the dependency graph, not a full-stage wait on unrelated blocked services. Keep per-task acceptance/tests/file scopes/rollback from the detailed blueprints; split before exceeding five implementation files. G01–G03 are distinct local, empirical and release checkpoints. Deployment and pricing remain on hold.

**Oracle worker planning (2026-10-31):** The owner requested a documented
Always Free Mumbai deployment plan. The [proposed plan](../docs/operations/ORACLE_FREE_WORKER_PLAN.md)
contains prerequisites, ordered tasks and separate provider, staging and release
gates. It does not change the approved Fly decision or authorize provisioning,
hosted testing, real data or deployment; the localhost-first direction remains.

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

**Model configuration (2026-10-18):** Owner-requested GPT-6 Luna migration updates the default, explicit local environment overrides and standard token-cost estimates. Both prose request paths set no reasoning for this alias while retaining structured output, source grounding, output caps and deterministic score ownership. Local contract checks pass; live access returned HTTP 401 and remains unverified. Production OCR activation stays deferred; the subsequent hosted mock implementation is tracked in AA012. See the [migration report](../docs/evaluation/GPT6_LUNA_MIGRATION_20261018.md).

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

**Owner-requested functional Rewrite repair (2026-10-31):** Added a consented Generate suggestions action on legacy Review, source-ID drafting for the normal qualitative pipeline and same-passage grounding. The owner's supplied PDF was checksum-matched to the saved MERN analysis; live Chromium/Supabase validation generated and saved usable suggestions, checked Copy/reload, and preserved numeric/parse results. Previous drafts survive failed or rejected requests. Formal writer quality and release acceptance remain open. See [functional repair evidence](../docs/evaluation/REWRITE_GENERATION_REPAIR_20261031.md).

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

### Phase 7 implementation checkpoint: local and hosted evidence — 2026-09-11 (local revalidation 2026-10-30)

- [x] T070-T076 implementation slices, tests, operational docs, alert policy, migration, worker entry points, egress policy, container hardening check, and CI command wiring are present in this checkout.
- [x] Local evidence revalidated 2026-10-30: 122 Vitest files / 958 tests; 5 security files / 25 tests; TypeScript, lint, formatting, web/worker builds; deterministic load and restore; and 56/56 Playwright tests against isolated local Supabase with local-only credentials and no `.env` loading.
- [x] Canonical verification revalidated 2026-10-30: `npm run verify` passes, and the Phase 5, job-intelligence, scoring-validity, writer-grounding, and render-parity benchmarks pass at engineering tier with release blockers preserved.
- [x] Database evidence revalidated 2026-10-30: local Supabase reset through the full migration set; Phase 4, Phase 7, native evidence, document evidence, canonical storage, and Paddle admission SQL verification; and database lint with no schema errors. Earlier hosted Phase 4 persistence, tenant/RLS, private-storage, and Phase 7 SQL verification remain recorded; hosted revalidation was not performed.
- [x] Dependency/security checks revalidated 2026-10-30: registry signatures and attestations verify, the production dependency audit reports 0 vulnerabilities, the secret scan passes, and alert/container checks pass.
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

**Hosted PaddleOCR boundary (2026-10-18; PARTIAL integration):** The owner requested an API-based alternative without local inference, then selected mocked API responses for this step. The additive server-only adapter and native-first orchestration are implemented with 60 mocked/synthetic checks; full local `verify:ci` passes 117 files / 929 tests and 56 browser checks; native text remains unchanged, hosted line confidence is uncalibrated, all outputs are scoring-ineligible, and submission intent/acknowledgment receipts are required. Production upload/worker/database/UI wiring remains pending explicit document consent, durable admission/attempt storage and versioned hosted evidence support. No provider request, production activation, model installation or hosted migration occurred. Existing local OCR, frozen labels and accuracy/release gates remain unchanged. See [contract](../docs/design/HOSTED_PADDLEOCR_API.md) and [verification](../docs/evaluation/PADDLEOCR_API_MOCK_IMPLEMENTATION_20261018.md).

**Cross-cutting verification and security repair (2026-10-29; engineering evidence only):** A sanitized local sweep (provider credentials unset; production build against synthetic, non-routable Supabase/OpenAI configuration with AI and PaddleOCR disabled) found and fixed two defects. First, every route generated a second `X-Request-Id`, so response headers, JSON error bodies, and request logs disagreed; the server now owns one validated ID, stamps it onto the inbound request, routes read it through `requestIdFrom`, and route copies cannot duplicate the response header. Second, a foreign-origin `POST /auth/logout` surfaced an unhandled `PublicApiError` as HTTP 500; it now returns the safe `403 FORBIDDEN` JSON envelope. The audit then fixed production `zod` 4.4.3 -> 4.6.7 for GHSA-mrhx-c7xc-m3w5, transitive `body-parser`/`qs` patches through a non-forced `npm audit fix`, and dev Vitest 4.1.11 -> 4.1.12; production and full audits report zero vulnerabilities. Zod 4.6 tightened ISO-datetime generation against the frozen SQL validators, so DB-backed schemas now pin the already-migrated pattern in `iso-datetime.ts`; no historical migration, SQL check, threshold, or frozen label was edited or weakened.

Verification: 120 test files / 936 tests pass; typecheck, lint, Prettier, and web/worker builds pass; the security suite passes 5 files / 25 tests. A black-box production-server matrix covers health/readiness, public pages, auth redirects, method/`Allow`, 401/403/404/405/503 behavior, metrics token handling, security headers, request-ID/log correlation, and absence of secret/PII/`X-Powered-By` leakage. Phase 5, job-intelligence, scoring-validity, writer-grounding, and render-parity checks pass at the engineering tier with release blockers preserved; synthetic load/restore, registry signatures/attestations, secret scan, alerts, container policy, and zero-vulnerability audits pass. Not run: Playwright/E2E (loads real `.env` and creates hosted Supabase fixtures), local Supabase SQL/DB (Docker unavailable), live OpenAI/PaddleOCR (unauthorized or HTTP 401), hosted migrations, and deployment. No commit, push, provider call, candidate data, or hosted mutation occurred. AA0/AA1 accuracy/release gates and AA012 acceptance are unchanged.

**HTTP contract fixes and durable hosted-OCR admission (2026-10-29; engineering evidence only):** The remaining black-box defects are fixed. `GET /auth/logout` now returns `405` with `Allow: POST` instead of a generic `400`, the action rejects non-POST methods before sign-out (previously `PUT`/`DELETE` could execute the action and redirect), and unknown `/api/*` paths return the shared JSON `NOT_FOUND` envelope instead of an HTML page. Regression tests cover the loader/action method policy and unknown API GET/POST responses. The production-server matrix re-verified all logout methods (`405`/`Allow: POST`), foreign-origin POST (`403`), known API methods (`405`/`401`), unknown API paths (`404` JSON), health/readiness, metrics token handling, one request ID, and security headers.

The first provider-independent hosted-OCR slice is implemented locally: forward migration `20261029130000_paddle_ocr_admission.sql` adds service-only `admit_paddle_ocr` / `record_paddle_ocr_attempt` RPCs, owner-readable admission/page/attempt tables, and a private per-owner page/byte budget bucket. `app/lib/server/ocr/paddle-admission.ts` supplies the store; the adapter now binds selected page numbers into admission. Duplicate admissions, owner/source/hash mismatches, page/byte overflow, duplicate or regressive attempt receipts, and job mismatches fail closed; an interrupted submission remains visible and cannot be auto-resubmitted. The slice is default-off and not wired to upload, workers, scoring or UI. Budget limits remain caller-supplied; no provider facts, disclosure text, production quota or consent persistence is added.

Verification: 122 test files / 958 tests pass; typecheck, lint, web/worker builds and Prettier pass; security suite passes 5 files / 25 tests. `scripts/verify-paddle-admission.sql` passes from a clean disposable PostgreSQL 17 cluster, covering binding, duplicate rollback, page/byte budgets, window reset, attempt transitions, RLS owner reads, denied client writes/RPCs, and cascade deletion. Not run: Supabase `test:db`/local stack (Docker unavailable), hosted migration, live PaddleOCR, Playwright/E2E, and production approval. No commit, push, deployment, provider request, candidate data or hosted mutation occurred.

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
- [ ] Formal field acceptance remains open. The original locked failure (92.31% precision / 75% recall) is retained; the 2026-10-18 synthetic repair meets its measured exit evidence. Representative release validity, calibration and provider comparison remain DEFERRED.
- **Verify:** locked evaluation is reproducible, confidence intervals are present, and any required-segment failure blocks AA1.

#### Engineering closeout AA1 (2026-10-11)

- [x] AA010–AA015 engineering closed under ADR-0011 and owner acceptance in ADR-0012; task evidence, residual acceptance obligations AA1-R1–R5, activation requirements and cleanup are reconciled in the [closeout report](../docs/evaluation/AA1_ENGINEERING_CLOSEOUT.md). This checkbox does not pass the accuracy gate below.

**CI repair follow-up (2026-10-17):** Owner-requested parser repairs now carry an explicit extractor version and historical replay. Frozen regression coverage and coordinate-space tests are expanded. Later challenging-scan exact-line failures remain enforced; AA1-R1 and Gate AA1 stay open. See the [dated repair report](../docs/evaluation/OCR_CI_REPAIR_20261017.md) for measured results and remaining work. No representative validation, calibration or activation is implied.

**Synthetic repair verification (2026-10-18):** The explicit engineering text-fusion-v4 profile passes both development runs, every consumed regression and the separately frozen runtime-check set on its first evaluation: 1,008/1,008 critical-field checks, no extras, zero OCR CER and 100% exact-line agreement across measured segments. Original failures, frozen sources and all interval floors remain. Full local CI passes 866 unit tests and 56 browser checks; versioned SQL/resource and real-container two-pass cancellation checks pass. AA1-R1 has measured synthetic exit evidence; formal acceptance, AA1-R2–R5 and Gate AA1 remain open. See the [follow-up report](../docs/evaluation/OCR_CI_REPAIR_20261018.md). No hosted migration or production activation occurred.

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

**Owner-reported score inflation repair (2026-10-31):** Fixed role/accountability heading masking and binary keyword full credit for new `ats-rules-v4` analyses. Preserved historical values, removed uncalibrated Strong labels and exposed proportional trace credit. Owner PDF/JD validation was local only; formal calibration remains open. See [reproduction and verification](../docs/evaluation/SCORE_INFLATION_REPAIR_20261031.md).

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

**Owner-requested Review UI follow-up (2026-10-31):** Styled the Cited writing suggestions branch with category/status hierarchy, separate explanations and source excerpts, responsive rows and explicit empty states. No scoring or authoring mutation changed. Component and sequential synthetic browser evidence is in the [UI receipt](../docs/evaluation/CITED_WRITING_UI_20261031.md).

**Owner-requested navigation and Rewrite follow-up (2026-10-31):** Shared floating navbar now connects the public homepage `/`, history `/analyses`, upload and LaTeX Build with identical links. Theme and session controls stay in Menu. The report button has a fixed 44px height. Empty Rewrite copy now describes the saved state without inventing a grounding failure; existing retained suggestions remain supported. See [verification and limitations](../docs/evaluation/NAVIGATION_REWRITE_REPAIR_20261031.md).

**Eight browser-comment repairs (2026-10-31):** Replaced raw score metadata with an accessible disclosure and readable timestamp while preserving score semantics; shortened empty Rewrite guidance and generated two suggestions on the exact owner-commented saved analysis. Removed Build's redundant icon rail/upload shortcut, retained labelled mobile panes, and enabled only the verified local compiler after nineteen sandbox checks. Current-site preview/download and sequential browser evidence are in the [comment repair report](../docs/evaluation/BROWSER_COMMENT_REPAIRS_20261031.md).

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

### Phase AA7: Standalone sandboxed LaTeX-to-PDF converter [GATE CLOSED / OWNER ACCEPTED 2026-11-07]

**Owner-scoped revision, 2026-10-30:** The owner requested a separate code-left/PDF-right converter, with current-buffer recompilation, preview and PDF download for manual upload. The owner approved the revised [design](../docs/design/LATEX_CONVERTER.md) and [ADR-0016](../docs/decisions/0016-standalone-latex-converter.md). E-007 permits local engineering while formal upstream/release gates remain open. No canonical/analyzer integration, LaTeX output, automatic upload, persisted source/PDF or ATS-verified claim. **Local engineering is complete and verified:**126 files/1,052 tests,94 focused cases,6 real browser scenarios with desktop/mobile Axe,19 runtime check groups and6 example/paper cases. Canonical `npm run verify` passes. Formal Gate AA7 remains open; the default flag is off. See the [dated closeout](../docs/evaluation/AA7_ENGINEERING_CLOSEOUT_20261030.md).

#### AA070: Approve LaTeX threat model

**Dependencies:** AA6; **Likely files:** threat model, compiler ADR, package allowlist, runbook; **Scope:** S

- [x] Owner approved the revised local compiler-security design and bounded execution scope through ADR-0016. Current runtime, closure, resource and cleanup evidence passes; formal release security review remains separate.
- **Verify:** ADR-0016 and the [converter runbook](../docs/operations/LATEX_CONVERTER.md) record misuse cases, tested controls, resource limits, cleanup/quarantine, residual risks, rollback and runtime exit. Formal release/security and assistive-technology acceptance are separate.

#### AA071: Validate supported single-file LaTeX source

**Dependencies:** AA070; **Likely files:** source contract, admission policy, examples, tests; **Scope:** M

- [x] **Local engineering under E-007:** Accept bounded single-file source with the reviewed macro/math/layout capabilities, preserve source bytes and geometry, bind hash/policy, and revalidate before isolated execution. Lexical screening is not the runtime security boundary.
- **Verify:** supported macros/math/packages, special characters, Unicode, URLs, bidi/encoded controls, unsupported input, size and deterministic binding tests pass.

#### AA072: Isolate LaTeX compilation

**Dependencies:** AA071; **Likely files:** compiler worker, sandbox policy, cleanup, tests; **Scope:** M

- [x] **Local engineering under E-007:** Compile without network, shell escape, writable host mounts, or reusable state; cap CPU, memory, files, output, and wall time.
- **Verify:** Actual Docker+Landlock ABI8 resource/filesystem/exec/network and output-policy probes pass, including denied files/packages, memory/CPU/process/file/scratch exhaustion, timeout, active cancellation, two-active/third-busy and cleanup. No host fallback. Docker is compiler-worker-only; database/auth/rate metadata use managed Supabase directly.

#### AA073: Add editable example profiles

**Dependencies:** AA071; **Likely files:** template manifests, templates, preview metadata, fixtures; **Scope:** M

- [x] **Local engineering under E-007:** Add neutral early-career, experienced and general-document starter examples with supported paper/font/package metadata; preserve user-edited source.
- **Verify:** every example/paper combination recovers its known synthetic text/order/links, passes output checks and declares accessibility limits without ATS claims.

#### AA074: Add standalone editor, PDF preview, diagnostics and download

**Dependencies:** AA072, AA073; **Likely files:** diagnostics sanitizer, preview/source routes, UI, tests; **Scope:** M

- [x] **Local engineering under E-007:** Provide the screenshot-based two-pane editor, in-place current-buffer recompilation, safe diagnostics, retry/cancel, PDF preview/page/zoom/download and separate manual-upload navigation. No source export or analyzer calls.
- **Verify:** compilation errors, timeout, unsupported glyph/package, stale response/download, authorization/origin/admission, cancellation, mobile/keyboard and log-redaction paths pass.

**Owner-reported availability/UI follow-up (2026-10-31):** Local compilation was off because `.env` lacked the converter settings. Verified the existing pinned runtime, activated only the local workspace, removed redundant navigation and validated real preview/download. Default-off repository settings and formal Gate AA7 remain unchanged; see the [comment repair report](../docs/evaluation/BROWSER_COMMENT_REPAIRS_20261031.md).

**Owner-reported contrast follow-up (2026-10-31):** Selected code now paints visible foreground text; native theme/example/paper options have paired theme colors. Five sequential browser modes cover light/dark/system/mobile/forced colors with rendered-glyph and contrast checks; the native dark popup was visually verified. [Evidence](../docs/evaluation/EDITOR_CONTRAST_REPAIR_20261031.md).

**Owner-supplied document overflow follow-up (2026-10-31):** Reproduced a 0.78194-point overfull paragraph in the exact supplied source. One explicit emergency line-breaking command in a new private copy preserves all original bytes, wording, fonts and margins. Sequential headed-browser preview/download passed with direct Supabase auth; four runtime controls confirm overflow rejection remains active. No application policy change; the existing in-app buffer still needs the corrected source. [Evidence](../docs/evaluation/LATEX_DOCUMENT_OVERFLOW_REPAIR_20261031.md).

**Owner-reported toolbar follow-up (2026-10-31):** Example options now has a 44-pixel square SVG chevron and an explicit expanded-panel relationship. Download PDF keeps matching outlined-button dimensions across disabled and ready states. Six sequential light/dark desktop/mobile browser cases, keyboard interaction and real synthetic PDF download pass. LaTeX's 106 unit tests, source checks, lint, typecheck and web build pass. [Evidence](../docs/evaluation/BUILD_TOOLBAR_REPAIR_20261031.md).

#### AA075: Benchmark compiled artifacts

**Dependencies:** AA072-AA074; **Likely files:** LaTeX benchmark, parse-back fixtures, security report, CI gate; **Scope:** M

- [x] **Local engineering under E-007:** Run known synthetic output text/order/link/layout, accessibility-limit, example, malicious-input, resource, latency and failure evaluation for every declared combination; arbitrary pasted source has no canonical fact/parity baseline.
- **Verify:** runtime security and declared synthetic recovery floors pass; compiled PDFs are not AA6 verified artifacts. Accessibility/security/release approval remains necessary before production enablement.

#### Owner-requested Build AI follow-up (2026-10-30)

**Scope:** separate Build workspace only; see the [design](../docs/design/LATEX_CONVERTER.md#inline-ai-assistance-follow-up) and [coordinator packet](agent-handoffs/2026-10-30-build-ai-coordinator.md). Owner approved reuse of the configured key and bounded synthetic testing. No canonical fact/score integration or release approval.

- [x] Integrate contextual fix/rewrite/resume popover with per-request selected-context consent, plain-text review, guarded Apply/Undo and PDF invalidation.
- [x] Implement authenticated origin-checked default-off API, strict source/patch binding, provider/context/time/output limits and managed Supabase consent/rate/monthly quota metadata without migrations.
- [x] Verify focused safeguards, controlled-provider browser flows, accessibility and the combined application candidate. The final local candidate passes 88 focused tests, six controlled-provider browser scenarios including desktop/mobile Axe, and `npm run verify` (131 files / 1,152 tests plus format, lint, types, web and worker builds). Exact recorded synthetic accounts and rate keys were cleaned; detailed receipts are in the [handoff](agent-handoffs/2026-10-30-build-ai-coordinator.md).
- [x] Verify live provider availability: two earlier bounded probes returned HTTP 401; a third owner-requested synthetic structured-response probe succeeded using the configured model. No automatic retry or model/key fallback. Live end-to-end browser acceptance remains separate.
- **Sequential browser audit (2026-10-30):** Public, LaTeX and controlled-provider Build AI checks passed; home-page claim and medium-width navigation findings and untested authenticated flows are recorded in the [audit report](../docs/evaluation/BROWSER_AUDIT_20261030.md). This is partial engineering evidence and does not close Gate AA7 or release gates.

**Browser audit repair follow-up:** The owner approved eight existing hosted migrations after review. UI claims/header and consent wording were repaired; direct-Supabase authenticated testing now uses guarded synthetic fixtures and exact cleanup. The final combined browser run passed 12/13; intermittent authoring acceptance over five seconds and PDF tagging remain open. See [repair evidence](../docs/evaluation/AUDIT_REPAIRS_20261030.md) and [migration mapping](../docs/evaluation/MANAGED_BROWSER_PREREQUISITES_20261030.md).

**Private internal continuation (2026-11-06):** Senior frontend/backend review reproduced four defects: transient compiler startup failures remained cached, formatted units bypassed resume protection, deferred PDF bytes could start loading after dismissal, and Escape keyup reopened the AI popup. Minimal shared-function fixes and permanent regressions are integrated. The same regression set failed 10 cases before and passed all 59 afterward; current-root focused checks pass 108 converter, 95 AI and three component cases. Combined verification and detailed evidence are recorded in the [private coordinator handoff](agent-handoffs/2026-11-06-aa7-coordinator.md). No public testing, provider call, database change or production activation.

**Fresh runtime/browser follow-up (2026-11-06):** The changed compiler adapter passed all 19 runtime groups against the pinned image. Six selected current-browser cases passed after a popup heading semantic repair; no Axe exclusions. Direct Supabase fixtures and exact recorded rate keys were cleaned and verified absent. Docker was used only for worker jobs. [Browser receipt](../docs/evaluation/AA7_BROWSER_REVALIDATION_20261106.json); [runtime receipt](../docs/evaluation/LATEX_RUNTIME_RECHECK_20261106.json). Private license/CVE and complete rollback evidence remain in progress; formal acceptance is unchanged.

**Private security follow-up (2026-11-06):** Exact-image license metadata inventory and actual quarantine/restart drill are recorded. An enforced-offline Trivy scan preserved all raw findings, including four critical and 269 high package matches; applicability/vendor triage is in progress. Passing functional tests do not clear those findings. See [CVE evidence](../docs/evaluation/AA7_IMAGE_CVE_20261106.md), [license inventory](../docs/evaluation/AA7_IMAGE_LICENSES_20261106.md), and [rollback receipt](../docs/evaluation/AA7_ROLLBACK_RECEIPT_20261106.json). No public testing, upload, provider use or production enablement.

**Hardened private candidate (2026-11-06):** Candidate19d2 replaces PyPDF2 with exact hash-pinned pypdf6.21.4 and keeps compiler/header/pip tools out of the final runtime. Same base/snapshot/TeX source capabilities; one signed-index-authenticated identical XeTeX artifact uses an explicit transport/cache remedy. All20runtimegroups/20PDFcases,6profile-paper cases, rollback, combined1,203tests/145files and full13browser cases pass. Direct-Supabase cleanup is verified; no Docker database or live provider. Paired offline scan under identical databases retains3critical/70high matches, down from4/269; all findings remain. The configured image is unchanged and formal security/accessibility/release gates remain open. [Private candidate closeout](../docs/evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md).

**Private engineering closure (2026-11-06):** Coordinator and senior developer/tester audits confirm AA070-AA075 private requirements have current source-bound evidence. Current runbook commands now target the maintained-parser19d2 candidate; historical activation explicitly identifies600c. All requested internal functional checks are complete. Residual package-risk acceptance, license interpretation, document/assistive-technology acceptance and production release remain separate open decisions, not requirements for public testing now. Optional APT removal was stopped without bypassing its native safety warning. [Final private closeout](../docs/evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md).

**Full vulnerability-remediation request (2026-11-06):** Incomplete; do not close the phase. The scoped application dependency repair has zero all-dependency audit findings and the integrated application passes 1,205 tests. Current paperfix worker `8f7…` passes 20 runtime groups, 20 PDF-policy cases, six example/paper cases, rollback, paired glyph/render review and all 13 dedicated browser cases. Direct Supabase fixtures and owned resources were cleaned up. The full unsuppressed scan removes three critical matches but retains 978 total matches, including 89 high (previously 70). Known upstream-open issues and broader native-backport/applicability work remain. No release or configuration promotion occurred. See the [current security closeout and remaining obligations](../docs/evaluation/AA7_FULL_SECURITY_CLOSEOUT_20261106.md).

**Native repair and full-verification continuation (2026-11-06):** Unpromoted worker `38292747…` builds archive-authenticated native Expat2.10 with both upstream modes, each with 5,328 checks, old-header compatibility and exact loaded-library verification. Exactly six optional packages are purged with native safety guards. A sealed Fontconfig clone preserves 40 measured font/style selections and excludes user-home configuration. The full unsuppressed scan now has 947 matches, including 0 critical and 80 high: 31 removed and none added. Source-backed Expat fixes remain visible in the raw output, and CVE-2025-66382 remains open. The first literal private CI failed at 65/71 browser cases after 1,220 unit tests; its receipt remains unchanged. Reviewed landmark, query scheduling/LEFT-FK and private AI-context repairs now pass the complete integrated verification: 1,242 tests across 149 files, all 65 general browser cases and all six dedicated Build AI cases. All nine commands exit zero; both npm audits have zero findings. Original assertions and timeouts remain. The expanded 22-group runtime matrix, 20 PDF cases, six examples, rollback and paired render now pass on that exact image; coordinator visual review found both candidate pages identical to baseline PNGs. The [final private receipt](../docs/evaluation/AA7_FULL_PRIVATE_CI_FINAL_20261106.json) binds 557 stable source inputs and independent exact cleanup of 31 synthetic owners, four storage keys and 13 owned rate rows. Supabase is used directly; no Docker database, deployment or promotion. [Completion packet](agent-handoffs/2026-11-06-aa7-completion-coordinator.md), [scan](../docs/evaluation/AA7_SEALED_NATIVE_SECURITY_20261106.md).

**Decoder guard and current verification (2026-11-06):** Current unpromoted worker `fc8c0ace…` explicitly disables optional external pypdf decoding and legacy overrides for each inspection, restoring configuration afterward. Permanent before/after regression passes without changing the original validation body. The exact image passes 23 runtime groups, all 20 PDF cases, six profile/paper cases, rollback and paired render. Full private verification passes 149 files/1,242 unit tests and all 71 browser cases; all nine commands exit zero and both npm audits report zero. The [current final receipt](../docs/evaluation/AA7_DECODER_GUARD_PRIVATE_CI_FINAL_20261106.json) binds 558 stable source inputs and exact synthetic cleanup. The [fresh unsuppressed scan](../docs/evaluation/AA7_DECODER_GUARD_SECURITY_20261106.md) still has 947 matches, including 80 high and zero critical, with no package/CVE delta from3829. Native decoder/XML remediation remains in progress; no security clearance, deployment or configuration promotion.

**Immutable native HOME follow-up (2026-11-06):** An actual benign forced-config-failure probe reproduces Fontconfig loading XML from writable scratch HOME. The reviewed fix gives both native child environments and the image an empty root-owned read-only HOME. Interim worker `fb277061…` builds and passes the same focused RED-to-GREEN probe, all 40 ordinary font selections, source checks/typecheck/108 LaTeX tests and all six profile/paper cases. 559 code inputs/21 runtime hashes remain stable and exact cleanup passes. Full matrix/CI/scan remains reserved for the final native-frame candidate; no raw CVE is suppressed or release accepted. [Repair evidence](../docs/evaluation/AA7_IMMUTABLE_HOME_REMEDIATION_20261106.md).

#### Gate AA7: Safe LaTeX export

**November 7 engineering closeout:** AA070–AA075 implementation and private verification are complete on exact worker `4b83ffec…`. The actual FreeType repair and mandatory mapped-library probe pass; all 28 runtime groups, original 20 PDF cases, 49 admission cases, four explicitly mocked boundaries, 107 frame checks, six profiles, rollback and render pass. The single final integrated run passes all nine commands, 1,242 unit tests/149 files and all 71 browser cases; both npm audits report zero. Exact synthetic Supabase, rate-key, file/process/container and scan-directory cleanup is complete. The [current closeout](../docs/evaluation/AA7_FREETYPE_FINAL_CLOSEOUT_20261107.md) binds 588 code inputs and 61 runtime hashes. The final unsuppressed image scan retains 947 advisories, including 80 high and zero critical; these remain formal release work, with no all-vulnerabilities-fixed claim. Historical native 70/71/E-010 and unavailable font-reproduction evidence remain explicit. The owner requested an end to repeated validation: green engineering tasks stay closed unless changed code or a concrete failure warrants reopening. No deployment or configuration promotion occurred.

- [x] Sandbox, malicious-input, resource, parity, accessibility, operational and rollback evidence accepted by the workspace owner on 2026-11-07, with the disclosed residual risks and tested accessibility limits. [Owner decision](../docs/decisions/0017-aa7-owner-acceptance-and-aa8-start.md). Production activation and whole-project launch remain deferred.

### Phase AA8: Representative validity and staged claims [PRERELEASE ENGINEERING COMPLETE / VERIFIED 2026-11-07]

**Completion tracking:** [plan.plan.md](../plan.plan.md) records all ten task completions; [tutorial.md](../tutorial.md) explains reproduction. Original deferred research/release requirements remain in the [separate readiness checklist](aa8-aa9-release-readiness.md).

**Solo-prerelease owner revision (2026-11-07):** [ADR-0018](../docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md) replaces team-verification prerequisites for current completion with sole-owner accountability and actual subagent technical review. Complete all software/workflow capabilities with honest synthetic/AI-assisted evidence. Customer/representative and vendor/recruiter experiments are deferred to demo/RC/pre-launch; their original empirical claims remain unachieved until real evidence exists. Do not block current implementation on a reviewer team or pretend AI reviews are human/customer results.

**Phase-start history, 2026-11-07:** Gate AA7 is owner-accepted and closed; proceed to AA8. Start AA080 with metadata-only corpus-admission tooling and synthetic tests. Preserve real-data permission, independent annotation and representative-validity requirements. No AA7 green-check reruns or speculative remediation loop. [Decision](../docs/decisions/0017-aa7-owner-acceptance-and-aa8-start.md), [coordinator](agent-handoffs/2026-11-07-aa8-coordinator.md).

#### AA080: Acquire permitted first-domain data

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA003, AA005; **Likely files:** corpus registry, consent/provenance records, retention controls, data card; **Scope:** M

- [x] **AA080 engineering foundation, 2026-11-07:** Strict synthetic metadata admission/access/lifecycle helpers and bounded CLI implemented. All 44 targeted tests and 14 actual CLI cases pass; types, lint, source checks and web/worker builds pass. No raw corpus acquisition or representative validity is claimed. [Report](../docs/evaluation/AA8_METADATA_ADMISSION_20261107.md), [contract](../docs/design/EVALUATION_CORPUS.md).
- [x] **Synthetic storage workflow, 2026-11-07:** Seventeen lifecycle tests and one actual direct-Supabase drill pass: 2 temporary owners, 2 neutral PDFs, byte/hash reads, ownership/group/revoke/expiry checks and 11 audit rows. Independent read-only SQL confirms zero remaining exact objects, owners, audit rows or organizations. No database container, reset, schema change, provider or deployment. [Receipt](../docs/evaluation/AA8_STORAGE_DRILL_20261107.json).
- [x] **AA080 authority completion:** Optional trusted in-process authorization now binds the full record, source/rights, actor groups and assessment time for future permitted non-synthetic intake. An explicit representative purpose is required; the default CLI still denies real sources. Fresh read-time checks deny withdrawn authority. All 76 focused corpus/lifecycle tests and the current 1,453-test full suite pass. No real data or hosted operation was used. [Current verification](../docs/evaluation/AA8_AA9_COMPLETION_TRACKING_20261107.json).
- **Deferred representative acquisition (owner, ADR-0018):** Acquire the approved planning sample across native/scanned/mixed/layout/experience/locale segments with documented rights and exclusions.
- **Representative/release verification (deferred):** privacy review, provenance audit, access log, deletion drill, segment counts, and coverage gaps are complete before annotation.

#### AA081: Run independent annotation and adjudication

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA080; **Likely files:** annotation handbook, annotation store, adjudication log, agreement report; **Scope:** M

- [x] **Prerelease software, 2026-11-07:** Seven-family annotation, immutable original submissions, blind adjudication bindings and measured agreement implemented; synthetic/AI and trusted future human evidence remain distinct. Integrated annotation/partition tests pass 43/43; independent AI source review passed. Independent-human collection remains deferred under ADR-0018.

- **Deferred independent-human research (owner, ADR-0018):** Two trained annotators independently label critical fields, requirements, evidence, and expert rubric; disagreements are adjudicated blind to system output.
- **Representative/release verification (deferred):** agreement meets the approved floor per label family or the handbook/data are revised before continuing.

#### AA082: Freeze evaluation partitions

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA081; **Likely files:** partition manifest, hash registry, leakage report, access policy; **Scope:** S

- [x] **Prerelease software, 2026-11-07:** Canonical immutable locks bind annotation/source hashes, all five leakage categories, access groups and restricted calibration reads. Included in the integrated 43 passing tests; independent AI source review passed. Representative partition acquisition remains deferred under ADR-0018.

- [x] Freeze synthetic development, calibration, and locked test partitions with person/employer/template and near-duplicate leakage controls; representative acquisition is deferred.
- **Verify:** hashes and membership are immutable, test access is restricted/audited, and no calibration report includes locked-test labels.

#### AA083: Calibrate without the locked test set

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA082, AA4; **Likely files:** calibration pipeline, policy versions, calibration report, approval record; **Scope:** M

- [x] **Prerelease software, 2026-11-07:** Reproducible per-dimension candidate fitting, sensitivity/rejected alternatives, source/partition/observation bindings and rollback references implemented; all 12 integrated tests pass. Missing features retain full penalties and locked-test calibration is denied before label reads. Existing AA4 policy stays unchanged; representative fitting/adoption remains deferred.

- [x] Fit synthetic offline policy proposals only on development/calibration data with rationale, sensitivity, uncertainty boundaries and rollback version. Representative adoption remains deferred.
- **Verify:** reproducible calibration contains no test-set access and documents sensitivity plus rejected alternatives.

#### AA084: Run the locked end-to-end evaluation

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA5-AA7 as released, AA083; **Likely files:** evaluation runner, locked report, fairness/error report, artifact archive; **Scope:** M

- [x] **Evaluator software, 2026-11-07:** Seeded 10,000 whole-cluster bootstrap, tied ranks, per-segment/aggregate gates, explicit withheld measurements and actual restricted locked-reader/calibration bindings implemented; all 24 integrated tests pass. The final 20-document application workflow and CLI pass all 12 engineering checks; 40 statistical cells honestly retain missing/insufficient evidence and no representative validity is claimed.

- [x] Execute the synthetic application workflow and report all required metric slots per segment, preserving unknowns and failed gates. Representative validity, real OCR/render coverage, customer observations and complete cost/fairness measurements remain deferred.
- **Representative/release verification (deferred):** bootstrap confidence intervals and lower bounds are reported; one failed required segment fails the gate regardless of aggregate score.

#### AA085: Publish versioned evidence and limitations

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA084; **Likely files:** model/ruleset card, dataset card, limitations page, release note; **Scope:** M

- [x] **Card/claim software, 2026-11-07:** Versioned dataset/ruleset/model/evidence card bindings, exact five-level claim ladder and guarded higher-claim authority implemented. All 10 integrated tests pass and independent AI source review passed; synthetic failures remain visible and do not qualify higher claims. Final cards, immutable runtime/verification reports and an actual AI-reviewed synthetic successor card are recorded in the [closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

- [x] Record local versioned cards, intended/prohibited use, composition, metrics/unknowns, failures, monitoring, rollback and expiry/retest conditions. External claim publication remains deferred.
- **Representative/release verification (deferred):** independent technical, domain, privacy, fairness, and product reviewers approve every public claim against the locked report.

#### AA086: Promote only the achieved claim level

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA085; **Likely files:** claim registry, product copy, feature flags, rollout/monitor plan; **Scope:** M

- [x] **Monitor software, 2026-11-07:** Complete finite/fresh signal checks, expiry/drift/revocation/complaint/correction/latency/cost/fairness/error stop and previous-version rollback proposals implemented and tested. No feature flag, production claim or deployment was promoted.

- **Deferred release (owner):** Release only the first domain/locale/formats that passed, with monitoring, drift thresholds, stop conditions, and rollback.
- **Representative/release verification (deferred):** unsupported segments remain labeled; regression, evidence-quality, complaint/correction, latency, cost, and fairness monitors are active.

#### Gate AA8: Domain-valid claim

- [x] **Current prerelease engineering gate:** AA080–AA086 software/workflows, technical cross-reviews and applicable local verification are complete under ADR-0018. [Closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

**Deferred public-claim criteria:** [R-GATE-AA8 and the continuing copy restriction](aa8-aa9-release-readiness.md#deferred-claim-gates) retain the original requirements. They remain unachieved release criteria; they are not unchecked engineering tasks in this completed phase.

### Phase AA9: Recruiter and vendor calibration pilot [PRERELEASE ENGINEERING COMPLETE / VERIFIED 2026-11-07]

**Current acceptance achieved:** Per ADR-0018, the complete advisory protocol, comparison/observation interfaces, corrections/appeals, retention/audit and stop/rollback workflows are implemented and verified with synthetic data and actual subagent technical review. Actual customer/named-vendor/recruiter runs and owner launch review are deferred to demo/RC/pre-launch; no public vendor/selection claims are promoted.

#### AA090: Design transparent recruiter calibration

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA8, A5 prerequisites; **Likely files:** pilot protocol, rubric contract, notice/correction policy, legal review; **Scope:** M

- [x] **Protocol software, 2026-11-07:** Strict advisory protocol and receipt-bound evidence assessment implemented, with a sole-owner/AI prerelease path and a separately guarded future external path. All 26 integrated contract tests pass; independent AI source review passed. Operational controller integration passes 17 tests, including async authority/expiry checks; independent AI review passed. Full workflow verification passes all 11 local pilot controls; customer/vendor runs remain owner-deferred.

- [x] Implement employer rubric inputs, visibility, override/rationale, candidate notice, correction/appeal, retention, audit and prohibited automatic rejection for the synthetic prerelease workflow.
- **Representative/release verification (deferred):** legal, fairness, security, privacy, domain, and product owners approve pilot scope, stop conditions, and human-decision boundary.

#### AA091: Run one named-vendor ingestion comparison

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA090, named authorized environment; **Likely files:** comparison protocol, synthetic/consented fixtures, observations, report; **Scope:** M

- [x] **AA091 software complete:** Implement and verify repeatable ingestion-comparison adapters, typed outcomes/errors, source/configuration bindings, interruption and authorization denial. Synthetic execution and unit tests pass; the live named-vendor run is separately deferred. [Evidence](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

- **Deferred named-vendor run (owner, ADR-0018):** Compare one named vendor/version/configuration on permitted documents and defined ingestion behaviors without reverse-engineering proprietary scores.
- **Representative/release verification (deferred):** repeatable observations, limitations, configuration/version, dates, errors, and raw evidence support only the named compatibility statement.

#### AA092: Run one career-center or recruiter pilot

**Status: COMPLETE - current prerelease engineering under ADR-0018.**

**Dependencies:** AA090, optional AA091; **Likely files:** pilot plan, participant records, outcome rubric, pilot report; **Scope:** M

- [x] **AA092 software complete:** Implement and verify the complete local advisory workflow, including notice/read, human override/rationale, correction, appeal, retention/audit, stop, rollback, revoke and deletion. All 11 actual local control checks pass; customer outcomes remain separately deferred. [Evidence](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

- **Deferred customer/recruiter run (owner, ADR-0018):** Run an allowlisted advisory pilot measuring rubric agreement, corrections, user comprehension, workflow usefulness, fairness/error, safety, latency, and cost.
- **Representative/release verification (deferred):** independent review approves scoped findings; no hidden score, automatic decision, general vendor equivalence, or selection-probability claim is enabled.

#### Gate AA9: Scoped recruiter/vendor evidence

- [x] **Current prerelease engineering gate:** AA090–AA092 software/workflows, technical cross-reviews and applicable local verification are complete under ADR-0018. [Closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

**Deferred external-evidence criterion:** [R-GATE-AA9](aa8-aa9-release-readiness.md#deferred-claim-gates) retains the original requirement and remains unachieved. Real pilots and launch review are tracked outside the completed engineering phase.

## Phase 8: B2C billing and entitlements

**Status: OWNER-DEFERRED UNTIL FULL TESTING AND CONSUMER FEEDBACK. ALL SERVICES CURRENTLY FREE.**

**Owner direction, 2026-11-09:** Keep the future pricing plan without implementing commercial quotas, paid AI gates or checkout. Validate current ATS/JD recommendations, authoring, Build AI and LaTeX/sandbox consumer journeys first; [validation coordinator](agent-handoffs/2026-11-09-consumer-validation/coordinator.md). Existing security, consent and operational limits remain. T080-T082 stay unchecked.

**Preparation, 2026-11-08:** Backend integration/prerequisite audits and the [draft billing design](../docs/design/BILLING_ENTITLEMENTS.md) are prepared. [ADR-0019 proposal](../docs/decisions/0019-phase8-billing-prerequisites.md) records the unresolved commercial model and proposed isolated T080 sequencing exception. A4 remains open. No T080-T082 implementation or live billing is claimed; task checkboxes below stay unchecked until their actual acceptance passes.

**Owner pricing, 2026-11-09:** INR 300/month for Indian users replaces USD 10 entirely. Free accounts receive 10 resume reviews and 1 resume edit every month. LaTeX editing/compilation/PDF preview/download remain free; Build AI fixes and writing suggestions require the paid AI plan. The [pricing packet](agent-handoffs/2026-11-09-phase8-pricing/coordinator.md) records the source audit and payment recommendations. Paid usage limits, edit units/lifecycle, provider selection and the local T080 sequencing decision remain pending. No implementation or checkout is claimed by this documentation update.

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

CR-A14 projected and saved writing observations are locally verified. Current affected coverage is 732 unique cases in 30 files across three receipts: 667 carried current cases and 65 fresh final cases, with fresh typecheck, lint and web/worker builds passing. This is not a fresh full-suite rerun. Root reconciled 982 final gate inputs, 951 raw source inputs, 19 allocated files and eight absent command groups. Original failures remain preserved; the selector correction preserves 29 assertions, and the type-only correction preserves 81 assertions and identical emitted production JavaScript. Useful JD-specific drafting and Native/database/browser/provider/consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/writing-comparison-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services remain free; deployment stays HOLD.

CR-A14 now includes a locally verified JD-selected exact two-clause drafting kernel and complete projected review component. Root reconciles 241 unique current cases/ten files across two receipts: 190 carried unchanged plus 51 fresh final, with fresh types/lint/web/worker builds. Two type-only repairs preserve identical configured-compiler JavaScript; the original failed receipt and all assertions remain. All 951 prior raw source inputs are unchanged; five new files were added. The component is not mounted yet and grants no save authority. Actual owned-page preview integration, labelled/bullet-prefix grammar support, additive v2 Native accept/reject/undo and full consumer/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/jd-clause-order-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A14 now has an actual owned result/author-page preview consumer under the existing authoring flag. One fresh integrated gate passes 251 affected cases/13 files plus full types/lint/web/worker builds. Preparation shares the validated score context and releases only after unchanged final privacy/source/pair/head/hash checks; default-off adds no work/data, historical inputs stay pinned, and 50-pair/five-draft bounds report truncation without a fabricated eligible total. Root binds 974 inputs/nine files and preserves 61 old assertions with two additive call signatures. The initial audit-only failure and all author failures remain. A single-long-whitespace preparation timeout is an open CR-A01/CR-A02 investigation, not a proven production defect. Independent Native candidate decisions/undo, broader grammar/usefulness and actual/release acceptance remain open. See agent-handoffs/2026-11-09-reliability-implementation/preview-consumer-closeout.md. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A01-I01 is locally resolved: a controlled identical probe localized the timeout to synchronous contact parsing, and one separator-only regex change reduced the original synthetic case from 7790.73ms to 99.16ms without changing its five second threshold. One fresh integrated gate passes 235 affected cases/15 files plus full types/lint/web/worker builds on 976 bound inputs. Original contact tests, preparation expectations, source bytes, limits and parser semantics are preserved; temporary profiling was removed. The original input exceeds default PDF ingress size, so no default-upload exploit or deployed latency claim follows. See agent-handoffs/2026-11-09-reliability-implementation/whitespace-closeout.md. Broader extraction/OCR, actual ingress/consumer and release acceptance remain open. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED across the unchanged 64-task DAG. Services stay free; deployment stays HOLD.

CR-A14-S06 is in progress: the additive v2 decision policy, A11OP2 atom order and independent codec vectors are frozen, and the pinned Supabase CLI created the forward migration `20261116192537_jd_clause_order_decisions.sql`. Three separate worktrees own Node original-pair proof and command admission, browser review/codec, and independent Native transaction/readiness source. The raw-role whitespace correction is recorded in the successor policy; the initial freeze is preserved. Final implementation, peer review and integrated verification are pending. No database execution, writable route, activation or deployment is claimed. Parent totals remain 2 VERIFIED, 41 PARTIAL and 21 PLANNED. [Current contract](agent-handoffs/2026-11-09-reliability-implementation/decisions-contract.json).

CR-A14-S06 Node/browser core is locally verified: one fresh Root gate passed 235 affected tests in ten files, character-profile reproduction, formatting, full types/lint and web/worker builds on 987 stable gate inputs. The controlled review now keeps saved receipts with their original proposals after input heads change; the actual failed DOM case is preserved. ORIGINAL reconstruction, strict writer scope and v2 hashes are implemented. Independent Native transaction/readiness source is still being authored, and owned HTTP/mounted decisions/undo, broader usefulness and actual consumer/release acceptance remain open. The parent stays PARTIAL. [Core checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-core-closeout.md).

CR-A14-S06 now includes the complete additive Native migration source alongside the verified Node/browser core. Root verifies 245 unique cases in eleven files across two receipts: 235 fresh core cases with full types/lint/web/worker builds, then ten source-contract cases with fresh types and scoped checks. This is not a fresh full-suite or executed database result. Fourteen allocated files are integrated; 79 prior migrations are unchanged. The writer remains revoked. Trusted readiness/owned HTTP/mounted decisions/undo, actual Native validation and broader usefulness remain open, so the parent stays PARTIAL. [Integrated checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-closeout.md).

CR-A14-S07 and CR-U06-S01 now have a mounted owned decision/undo consumer in source. One fresh integrated gate passes 434 affected cases in nineteen files, formatting/profile reproduction, full types/lint and web/worker builds on 1001 stable inputs. Actual readiness, owned double reads, strict HTTP/review acknowledgement, original-key retry, accepted-event/base rollback and post-undo event proof are wired. Default-off flags and denied Native writer remain. Supabase execution, real browser/consumer validation and broader grammar/usefulness remain open. CR-U06 moves from PLANNED to PARTIAL; totals are now 2 VERIFIED, 42 PARTIAL and 20 PLANNED across the same 64 tasks. [Consumer checkpoint](agent-handoffs/2026-11-09-reliability-implementation/decisions-adoption-closeout.md).
