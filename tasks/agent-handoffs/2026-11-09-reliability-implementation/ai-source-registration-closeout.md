# Legacy rewrite source registration checkpoint

2026-11-15. **IMPLEMENTED AND VERIFIED AT SOURCE TIER; full reliability goal remains active.** Dirty main HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. No commit, publication, deployment, data grant or feature activation occurred. Parent totals remain **2 VERIFIED, 39 PARTIAL, 23 PLANNED** across the same 64 IDs and dependencies.

## What changed

Legacy rewrite OP1 IDs included owner, organization and request nonce but omitted the resume source. The new OP2 ID also includes the actual analysis and immutable resume version. [The application client](../../../app/lib/server/ai-budget-source.ts) validates exact scope and current source readiness, then uses the new atomic reserve RPC through the existing strict budget receipt decoder. Retained legacy OP1 requests block redispatch under OP2 in every state. There is no generic reservation fallback.

The new [forward migration](../../../supabase/migrations/20261115154855_ai_budget_source_registration.sql) registers the full source tuple with first reservation and rolls back a new registration on reservation denial. Independent guards recheck actual owner admission, active root, analysis/version and membership for operation/attempt creation and fresh dispatch. Previously dispatched settlement, unknown holds, reconciliation, predispatch release and original-period attribution keep their existing budget semantics. Historical migrations and policy descriptors remain unchanged.

Registration selectors are included in exact-root/account disposition capture before parents disappear. Their clock comes from the original retirement/account event, never registration time. [Owner export](../../../app/lib/server/ai-budget-source-export.ts) validates the complete bounded set, including OP2 recomputation. Privacy export always includes `aiBudgetSourceRegistrations` alongside the eleven existing accounting collections and requires exact ledger binding. Inconsistent multiple-RPC observations refuse publication; they are not an atomic snapshot.

## Verification

The [Root reconciliation](ai-source-registration-integrated-review.json) binds the [fresh receipt](ai-source-registration-integrated-e4d20a44-fe86-4ebd-adae-aadd11d3a3f8.json), 22 allocated files, 926 inputs, both build artifacts and the log. Root independently rehashed these bytes and confirmed all five command process groups absent. Session90398 is CLOSED with exit0.

| Check | Result |
| --- | --- |
| Affected unit/source checks | 633 tests across 22 files; zero failures/skips |
| Full `npm run typecheck` | PASS |
| Full `npm run lint` | PASS |
| `npm run build` and `npm run build:worker` | PASS |
| Independent source review | ACK; 36 function pins, three patch pre/post pairs and actual profile pins match source text |

Checks used pinned Node22.23.4, sealed empty HOME and OS denials for network, root dotenv reads and Git writes. They used synthetic inputs and fake RPCs. [Peer review](peer-ai-source-registration.md), [backend handoff](backend-ai-source-registration.md) and [runtime handoff](runtime-ai-source-registration.md) describe the reviewed behavior. Author checks and failed receipts are preserved separately; they are not added to the fresh 633-case count. Historical assertion bytes remain present. Root's stopped preflight made no product copy and is recorded in `ai-source-registration-integration-attempt.json`.

SQL remains unparsed/unexecuted. The [deferred verifier](../../../scripts/verify-ai-budget-source.sql) is privileged, mutating and rollback-only; it has not run. No database, actual storage/Auth/restore/provider, browser, compiler or OCR test ran. The full `verify:ci` campaign includes external/network/database/browser stages outside this source-only allocation and was not run. The earlier 5,332-case and 517-case results are historical for this changed candidate.

## Required continuation

This is deliberately staged: the new global guards refuse unregistered qualitative, A12, A13 and Build admission. Those callers must adopt exact source admission before activation. Build remains account-only; no resume parent is inferred. New source data grants remain denied and feature flags stay off. Legacy rewrite adoption alone does not complete R03 or the full goal.

Preserve original-month known usage and unresolved exposure **before content deletion**. Current usage reads still sum surviving unlinked legacy `analysis_ai_runs`; removing them can remove quota contributions. This checkpoint does not fix that gap. Full 720-hour erasure, foreign-actor linkage, Auth/organization disposal, old export copies, scheduling and an independent restore floor remain required. Actual Native roles/transactions/concurrency, physical erasure, representative consumer validity, owner acceptance and release approval remain separate open gates.
