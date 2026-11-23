# What remains in the Resumide goal

Snapshot from November 22, 2026 on dirty `main` based on `a0b2392`. The [canonical tracker](../../todo.md#stage-19-progress) and its [task graph](../../reliability-remediation-plan.json) record **61 open parent tasks**, with 52 PARTIAL and 9 PLANNED. Both Stage 0 tasks and the Stage 7 provider contract are VERIFIED. PARTIAL means a task has progress recorded and still has acceptance work. PLANNED means the full parent task is still scheduled. Each task link opens its acceptance criteria and evidence references.

## What unblocks the next run

1. Confirm an empty, dedicated Supabase validation target and approval for the exact [93-operation successor](managed-schema-worker-successor-93.json). The full local PostgreSQL replay, real lease recovery, page-count persistence and synthetic cleanup receipt passed. The read-only managed preflight was rehearsed locally. [Exact managed action](cr-a01-managed-validation-action.md)
2. Verify CR-A01 through a synthetic upload, a live worker lease, evidence persistence, recovery and cleanup. Reconcile the exact fixture rows and expected accounting and rate metadata. Local extraction, SQL and synthetic OCR checks passed. [CR-A01 results](cr-a01-extraction-closeout.md) · [Cleanup audit](cr-a01-managed-cleanup-closeout.md).
3. Run the correction and import journey on the same schema, then validate JD scoring, factual authoring, and Build through their normal entry points. The dependency graph allows unrelated local work to proceed while the managed target is pending.

Google and ChatGPT identity depend on the approved capability matrix. The ChatGPT task needs a supported mechanism and real verification, or an explicit owner deferral reflected in the product. The owner is the sole approver. Representative/customer feedback and launch review sit in the later release scope. [Owner review decision](../../../docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md).

## Stage 1 · Execution foundations (14 open)

Finish managed admission, lease fencing, CI isolation, AI usage accounting, compiler provenance, privacy policy, and upload safety.

| Task                                                   | Remaining scope                                                     | Status  |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------- |
| [CR-R01](../../reliability-remediation-plan.md#cr-r01) | Provide safe offline AI doctor and bounded real readiness check     | PARTIAL |
| [CR-R02](../../reliability-remediation-plan.md#cr-r02) | Bound SDK attempts, cancellation and actual/unknown usage           | PARTIAL |
| [CR-R03](../../reliability-remediation-plan.md#cr-r03) | Reserve and reconcile shared technical AI budgets atomically        | PARTIAL |
| [CR-R04](../../reliability-remediation-plan.md#cr-r04) | Bind qualitative provider calls to the technical attempt ledger     | PARTIAL |
| [CR-R05](../../reliability-remediation-plan.md#cr-r05) | Bind explicit rewrites to the technical attempt ledger              | PARTIAL |
| [CR-R07](../../reliability-remediation-plan.md#cr-r07) | Bind durable analysis admission to payload and operation identity   | PARTIAL |
| [CR-R08](../../reliability-remediation-plan.md#cr-r08) | Fence leases and define a genuinely isolated verification scope     | PARTIAL |
| [CR-R09](../../reliability-remediation-plan.md#cr-r09) | Propagate cancellation and stage deadlines to provider requests     | PARTIAL |
| [CR-R10](../../reliability-remediation-plan.md#cr-r10) | Fence stage writes and worker shutdown against stale owners         | PARTIAL |
| [CR-R12](../../reliability-remediation-plan.md#cr-r12) | Build the compiler from verified reproducible dependency artifacts  | PARTIAL |
| [CR-R13](../../reliability-remediation-plan.md#cr-r13) | Distinguish known missing images from ambiguous cleanup             | PARTIAL |
| [CR-R16](../../reliability-remediation-plan.md#cr-r16) | Replace Docker-database CI with guarded direct-Supabase testing     | PARTIAL |
| [CR-R19](../../reliability-remediation-plan.md#cr-r19) | Restore the real privacy map and verify tenant/auth/security policy | PARTIAL |
| [CR-R24](../../reliability-remediation-plan.md#cr-r24) | Verify upload malware and parser-host admission controls            | PLANNED |

## Stage 2 · Evidence and corrections (9 open)

Start with CR-A01. Prove upload through evidence review with a live lease, then validate grouping, correction, replay, import, confirmation, and recovery on the same version.

| Task                                                   | Remaining scope                                                       | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------- |
| [CR-A01](../../reliability-remediation-plan.md#cr-a01) | Diagnose native page completeness and extraction failure states       | PARTIAL |
| [CR-A02](../../reliability-remediation-plan.md#cr-a02) | Group evidence by entity and stable field target                      | PARTIAL |
| [CR-A03](../../reliability-remediation-plan.md#cr-a03) | Define correction projection, targets and candidate provenance        | PARTIAL |
| [CR-C02](../../reliability-remediation-plan.md#cr-c02) | Verify evidence/canonical storage compatibility before new writes     | PARTIAL |
| [CR-A04](../../reliability-remediation-plan.md#cr-a04) | Persist corrected canonical children atomically with replay and CAS   | PARTIAL |
| [CR-U01](../../reliability-remediation-plan.md#cr-u01) | Preview corrected imports with target and provenance                  | PARTIAL |
| [CR-U02](../../reliability-remediation-plan.md#cr-u02) | Reconcile corrections into existing versions without clobbering edits | PARTIAL |
| [CR-U03](../../reliability-remediation-plan.md#cr-u03) | Bind confirmation and uncertainty to the exact displayed value        | PARTIAL |
| [CR-U16](../../reliability-remediation-plan.md#cr-u16) | Verify managed private-source access and history/session recovery      | PARTIAL |

## Stage 3 · Job descriptions and scoring (6 open)

Verify versioned requirements and coverage on managed storage, including replay and score withholding. Numerical release requires the applicable calibration evidence.

| Task                                                   | Remaining scope                                                    | Status  |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------- |
| [CR-A07](../../reliability-remediation-plan.md#cr-a07) | Version JD aliases while preserving literal quotation              | PARTIAL |
| [CR-A08](../../reliability-remediation-plan.md#cr-a08) | Define typed alternatives, bounds and unmapped requirements        | PARTIAL |
| [CR-A09](../../reliability-remediation-plan.md#cr-a09) | Admit versioned JD relations through real storage and RPC replay   | PARTIAL |
| [CR-A10](../../reliability-remediation-plan.md#cr-a10) | Evaluate requirement coverage from related dated facts             | PARTIAL |
| [CR-A15](../../reliability-remediation-plan.md#cr-a15) | Complete deterministic score admission and explainable withholding | PARTIAL |
| [CR-U04](../../reliability-remediation-plan.md#cr-u04) | Keep JD, canonical, preview and diagnostics versions consistent    | PARTIAL |

## Stage 4 · Factual AI and authoring (9 open)

Prove that users can review, accept, reject, and undo useful JD-based and Build suggestions while keeping facts, consent, and source versions intact.

| Task                                                   | Remaining scope                                                       | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------- |
| [CR-A11](../../reliability-remediation-plan.md#cr-a11) | Enforce bounded factual and relationship support for AI proposals     | PARTIAL |
| [CR-A12](../../reliability-remediation-plan.md#cr-a12) | Apply support, source/version binding and budget to explicit rewrites | PARTIAL |
| [CR-A13](../../reliability-remediation-plan.md#cr-a13) | Apply the same truth contract to initial qualitative feedback         | PARTIAL |
| [CR-A14](../../reliability-remediation-plan.md#cr-a14) | Generate useful source-backed JD improvements and honest deltas       | PARTIAL |
| [CR-U05](../../reliability-remediation-plan.md#cr-u05) | Make legacy writing output truthful, source-bound and usable          | PARTIAL |
| [CR-U06](../../reliability-remediation-plan.md#cr-u06) | Complete reviewed authoring, questions, accept/reject and undo        | PARTIAL |
| [CR-U07](../../reliability-remediation-plan.md#cr-u07) | Protect facts and consent in every Build mode                         | PARTIAL |
| [CR-U10](../../reliability-remediation-plan.md#cr-u10) | Separate session, provider-auth and transient AI failures             | PARTIAL |
| [CR-R06](../../reliability-remediation-plan.md#cr-r06) | Bind Build requests to both technical budgets and all-mode support    | PARTIAL |

## Stage 5 · OCR (4 open)

Verify the OCR quality and activation decision, the actual upload-to-worker path and the recovery experience. The synthetic admission preflight passed for both local worker profiles. The current quality campaign's locked set remains unused.

| Task                                                   | Remaining scope                                                 | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------- |
| [CR-A05](../../reliability-remediation-plan.md#cr-a05) | Repair OCR quality using declared development scan segments     | PARTIAL |
| [CR-A06](../../reliability-remediation-plan.md#cr-a06) | Integrate approved OCR into the actual owned upload/worker path | PARTIAL |
| [CR-U09](../../reliability-remediation-plan.md#cr-u09) | Show accurate worker/OCR progress, recovery and guidance        | PARTIAL |
| [CR-R15](../../reliability-remediation-plan.md#cr-r15) | Approve bounded OCR activation, data and privacy contracts      | PARTIAL |

## Stage 6 · LaTeX and Build (4 open)

Restore the pinned compiler artifacts within the Docker limit. Verify real compilation, containment, cleanup, PDF lifecycle, recovery, and the disposition of dependency advisories.

| Task                                                   | Remaining scope                                                 | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------- |
| [CR-U08](../../reliability-remediation-plan.md#cr-u08) | Verify Build apply/undo and PDF lifecycle with the reviewed compiler | PARTIAL |
| [CR-U11](../../reliability-remediation-plan.md#cr-u11) | Verify recovery through the approved operational target after local success | PARTIAL |
| [CR-R14](../../reliability-remediation-plan.md#cr-r14) | Verify actual compiler output, confinement and cleanup          | PARTIAL |
| [CR-R18](../../reliability-remediation-plan.md#cr-r18) | Resolve npm and worker-image advisories without filtering       | PARTIAL |

## Stage 7 · Identity, privacy, and accessibility (8 open)

Verify actual email recovery, deliver the admitted OAuth options, finish account deletion and exact export, and complete authenticated accessibility and alert delivery. [Verified provider contract](../../../docs/decisions/0022-auth-provider-contract.md)

| Task                                                   | Remaining scope                                                   | Status  |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ------- |
| [CR-U12](../../reliability-remediation-plan.md#cr-u12) | Verify sign-in through an approved inbox and managed session refresh | PARTIAL |
| [CR-U14](../../reliability-remediation-plan.md#cr-u14) | Complete Google identity when in the approved capability matrix   | PLANNED |
| [CR-U15](../../reliability-remediation-plan.md#cr-u15) | Complete ChatGPT identity only on a documented approved mechanism | PLANNED |
| [CR-U17](../../reliability-remediation-plan.md#cr-u17) | Verify managed email, export, session revocation and exact cleanup | PARTIAL |
| [CR-U18](../../reliability-remediation-plan.md#cr-u18) | Export the exact corrected and confirmed version                  | PARTIAL |
| [CR-U19](../../reliability-remediation-plan.md#cr-u19) | Complete mobile, keyboard and accessibility acceptance            | PARTIAL |
| [CR-R17](../../reliability-remediation-plan.md#cr-r17) | Verify exact fixture cleanup and deletion recovery                | PARTIAL |
| [CR-R20](../../reliability-remediation-plan.md#cr-r20) | Verify end-to-end correlation, managed scraping and alert delivery | PARTIAL |

## Stage 8 · Integrated consumer and operations tests (5 open)

Run the complete consumer gate, real worker lease and queue tests, managed restore rehearsal, and operator recovery drills in an isolated environment.

| Task                                                   | Remaining scope                                                  | Status  |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ------- |
| [CR-R11](../../reliability-remediation-plan.md#cr-r11) | Verify the real leased lifecycle in an approved safe target      | PARTIAL |
| [CR-R21](../../reliability-remediation-plan.md#cr-r21) | Measure real HTTP/database/queue capacity and recovery           | PLANNED |
| [CR-R22](../../reliability-remediation-plan.md#cr-r22) | Perform actual isolated managed restore and compatibility checks | PLANNED |
| [CR-R23](../../reliability-remediation-plan.md#cr-r23) | Rehearse kill switches, rollback and operator recovery           | PLANNED |
| [CR-G01](../../reliability-remediation-plan.md#cr-g01) | Pass the complete local consumer reliability gate                | PLANNED |

## Stage 9 · Feedback and release (2 open)

Run owner-authorized feedback and appropriate representative evaluation at demo or release-candidate time, then obtain explicit launch approval.

| Task                                                   | Remaining scope                                                          | Status  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ------- |
| [CR-G02](../../reliability-remediation-plan.md#cr-g02) | Run owner-authorized opt-in feedback and per-segment validity evaluation | PLANNED |
| [CR-G03](../../reliability-remediation-plan.md#cr-g03) | Complete operations acceptance and explicit later launch decision        | PLANNED |
