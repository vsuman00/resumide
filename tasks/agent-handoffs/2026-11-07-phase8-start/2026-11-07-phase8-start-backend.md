# Phase 8 backend integration audit

Run ID: 2026-11-07; completed 2026-11-08. Read-only audit of current ROOT main/a0b239299d75b0bd64b588fe743ebe2975fb28b9, including dirty files. Only this handoff was written in the licenses worktree. No application tests, database/provider calls, services, schema changes, publication or deployment were performed.

## Gate and scope

`tasks/plan.md` Phase 8 prohibits billing tasks until A4 passes and the commercial model is approved. Current A4 is open; no approved commercial model, prices, product quotas or payment provider were found. This is a proposal, not an implementation or gate waiver. The coordinator owns the missing owner decision and shared documentation. Deployment remains stopped.

## Existing integration points

| Current component                                  | Actual behavior                                                                                                                                                                                                     | T080 implication                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/routes/api.analyze.ts`                        | Origin/authentication, atomic abuse-rate bucket, bounded request validation and consent precede queued ingestion.                                                                                                   | Keep abuse prevention distinct from commercial usage. Add an entitlement check before metered admission, without trusting client plan fields.                                                                             |
| `analysis-ingestion.ts` / `create_queued_analysis` | Private storage upload precedes the transaction RPC. The RPC checks membership, resolves existing idempotency keys and creates the analysis/job atomically. Duplicate/error paths remove the newly uploaded object. | Authoritative reservation must be atomic with duplicate resolution/job creation. Decide separately whether storage itself is metered; a new pre-upload reservation would need compensation.                               |
| `analyses.idempotency_key`                         | Unique UUID, with existing-record ownership check. The current RPC selects before insertion.                                                                                                                        | Existing uniqueness is useful but is not a payload-bound usage ledger. Concurrent duplicate conflict handling needs an explicit contract; retries must return the original admission without another debit.               |
| `jobs.ts`, `worker-runner.ts`, final claim RPC     | Durable lease ownership/heartbeats; `FOR UPDATE SKIP LOCKED` claims one job; a worker loop awaits each job.                                                                                                         | Leases prevent simultaneous ownership of one job. They do not implement organization-wide plan concurrency across workers. The separate `analyze.ts` counter is process-local and is not the queued route's global limit. |
| `qualitative-stage.ts` / `analysis_ai_runs`        | Reads organization token sum since UTC month start before provider execution, then persists successful analysis usage with its result.                                                                              | Existing budget is not an atomic shared reservation. Concurrent calls can observe the same allowance. Failed/uncertain provider attempts need explicit reconciliation rather than assumed zero cost.                      |
| `build-assist-service.ts`                          | Process-local concurrency, atomic abuse buckets and a separate conservative monthly request allowance based on analysis token usage. Failed requests are not refunded by that allowance.                            | Preserve current protection, but do not present it as complete cross-product usage or paid credits.                                                                                                                       |
| PaddleOCR admission migration                      | Source/owner-bound admission, atomic page/byte budget and immutable attempt-state receipts; default-off path.                                                                                                       | Reuse the transaction/idempotency pattern where suitable, not its provider-specific units or policy. It is not commercial entitlement infrastructure.                                                                     |

`DatabaseTransactionBoundary` already validates RPC results through Zod and exposes sanitized persistence errors. Existing service-role RPCs and RLS patterns support a server-owned entitlement module. No commercial plan-version, entitlement-assignment, subscription or general usage-ledger table was identified in the migration inventory. Operational token/cost metrics are not an invoice ledger; configured zero costs or missing provider usage must not establish actual free usage.

## Proposed minimum T080 contract

Keep this inside the existing `billing-entitlements` modular-monolith boundary, backed by Supabase. Proposed names below are design labels, not created tables/APIs.

1. Immutable `PlanVersion`/limit-policy definitions and effective-dated organization entitlement assignments. Server-owned scope, status, period bounds and provenance determine the applicable version. No invented default paid plan or implicit unlimited fallback.
2. Durable operation reservations and append-only settlement/release/reconciliation events. Bind organization, owner, action, idempotency key, request fingerprint, policy/period version, units and reason codes. Preserve uncertain provider outcomes. Distinguish measured usage, reserved allowance and estimated cost.
3. Atomic service-only admission checks membership, resolves replay, locks the relevant entitlement/period counter, reserves approved units and creates the job in one transaction. Changed payload under the same key must conflict. A failed transaction cannot leave a debit. Database uniqueness/locking must handle concurrent requests, not process memory.
4. If the approved plan includes concurrency, use separate expiring execution reservations with ownership/fencing at claim and provider boundaries. Queue admission and active execution capacity are different controls. Retry/cancel/lease-loss behavior must preserve usage history and follow the approved charge policy.
5. Read-only account projection returns the scoped plan version, period and reconciled usage. Client-supplied quota/price/status never authorizes work. Server-only audited administrative overrides require actor, reason, scope and expiry. Database/entitlement unavailability denies new metered work safely; preserve access to existing owned artifacts under the agreed policy.

## First slice and tests after authorization

Start T080 with strict versioned contracts, a deterministic entitlement evaluator, repository transaction interfaces and a read-only scoped projection. Add the forward-only migration and atomic analysis-admission path together when approved; use injected repositories for unit tests and an explicitly authorized disposable Supabase target for transaction/RLS tests. No Docker database. Keep T081 checkout and T082 webhook adapters out of this slice.

Meaningful acceptance tests: exact quota boundary; period rollover; duplicate/reordered settle/release; same-key changed payload; concurrent last-unit admission; independent organizations; unavailable/stale entitlement; downgrade and existing reservations; lease loss/cancellation/retry; unknown provider usage; storage/DB compensation; unauthorized override and audited expiry. Existing abuse controls and ownership/consent guards must remain intact.

## Owner decisions required

Approve the commercial model and either satisfy A4 or explicitly authorize isolated local T080 engineering while keeping A4/release open. Specify the billable actions/units, charge timing and retry/refund policy; billing-period/reset/rollover behavior; downgrade/grace semantics; and organization/user/concurrency limits. Prices and payment-provider selection remain owner choices for the later session/webhook slices. General continuation does not supply those decisions.

## Evidence binding

Reviewed source bytes below, rather than unchanged HEAD alone, bind this audit. Existing governing evidence is in `CONTEXT.md`, `tasks/plan.md` Phase 8, `tasks/todo.md` A4/T080–T082 and `tasks/agent-handoffs/2026-11-07-phase8-start/coordinator.md`. Checks for this handoff: prose hygiene, Markdown formatting and whitespace; no application CI was needed for this read-only documentation task.

| ROOT source                                                                | SHA256                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/routes/api.analyze.ts`                                                | `74f7dd51fc7c9be8516efae5d1d415c45e4f5a7a828ea91efc4a56ea0d0345f7` |
| `app/lib/server/analysis-ingestion.ts`                                     | `73e9f38b067bca040d88d931d0afefe87be1f8fe3f4d26ebf98cdf0e75955d95` |
| `app/lib/server/qualitative-stage.ts`                                      | `d541c2aa000a8b79c48e5df75c21c0d6b66d2b568921e4a09ba8df1f16c64032` |
| `app/lib/server/build-assist-service.ts`                                   | `3c74c80514aa4f8b61ec32089c73440941681d78d49e493094307d0d5d1178ea` |
| `app/lib/server/worker-runner.ts`                                          | `33242e587c1b3ec216363f1891959f7be053acd2fa31e24c1c2a6ab149340b06` |
| `supabase/migrations/20260909190000_analysis_ingestion_and_extraction.sql` | `ad952e8d59dc26d405416de406e52a6cfe025da993855119eef921e7fd449a0c` |
| `supabase/migrations/20260909220000_qualitative_ai_stage.sql`              | `5f693f5a162b05d789c9d071d50c4eb9baf7c9df0144187bf4c5e809c6e15ee3` |
| `supabase/migrations/20260911120000_phase7_queue_age_metric.sql`           | `fac3fdee058d5beff8ddc867ced22d6abb839c7ab2d6a68238c4262d2bb56138` |
