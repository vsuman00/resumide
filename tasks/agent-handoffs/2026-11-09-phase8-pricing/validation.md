# Phase 8 pricing: independent requirements review

Reviewed 2026-11-09 against root main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus the current dirty source. Reviewer: pricing_validation, an AI peer reviewer. This is a requirements/source review, not human acceptance or executed billing evidence.

## Scope and owner decisions

The coordinator relayed all three owner clarifications during this review: Free includes 10 resume reviews and one resume edit **each month**; remove the USD 10 proposal entirely; the India paid price is **INR 300/month**. Build AI fixes and writing suggestions belong to the paid AI plan. The code editor, compilation, PDF preview and PDF download remain free for every signed-in user. Free compiler access does not waive authentication, sandbox or anti-abuse controls.

Do not re-ask the resolved monthly, USD-price or Build AI questions. Access to every AI feature does not establish unlimited usage. Paid allowances, the resume-edit unit, consumption/transition treatment and the payment provider remain unset. No prices outside India are supplied by these decisions.

## Findings

| Severity | Finding                                                                                                                                                                                                | Required action                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | There is no approved paid usage ceiling. All-feature access cannot safely be translated into unlimited provider work or an invented production token allowance.                                        | Present one bounded paid review/rewrite/Build-suggestion allowance proposal with a measured-cost review point. Keep proposal values out of production defaults until chosen.                                                                               |
| High     | One resume edit is not yet an executable unit. Manual authoring changes, proposal generation and proposal acceptance are different operations.                                                         | Recommended unit: one successful AI rewrite batch, labelled clearly as such; manual corrections and evidence confirmation do not consume the AI rewrite allowance. Owner acceptance is still required for this interpretation.                             |
| High     | Existing controls are not commercial monthly counters. Analysis anti-abuse admission precedes private upload and transactional job creation; rewrite and Build AI have separate request/budget checks. | Attach a durable quota reservation to the exact logical operation and settle it once. Preserve anti-abuse and actual provider-cost records separately.                                                                                                     |
| Medium   | Month reset and plan-transition semantics remain implicit. Calendar months and subscription billing periods differ.                                                                                    | Recommended Free period: server-derived UTC calendar month, displayed in Account. Paid periods follow verified subscription boundaries. Upgrade/downgrade must preserve history and not mint repeated allowances. These are proposals, not approved terms. |
| Medium   | Billing implementation is still gated by the unresolved local T080 sequencing proposal while Gate A4 remains open.                                                                                     | Root should record the actual owner sequencing answer in ADR-0019; do not manufacture A4 closure. The current pricing documentation can be completed independently.                                                                                        |
| Medium   | A paid AI gate accidentally reused by compilation would contradict the approved free Build contract.                                                                                                   | Keep editor/compile/preview/download independent of commercial AI entitlement; enforce paid status on Build AI suggestion requests server-side.                                                                                                            |

## Source evidence

- `app/routes/api.analyze.ts:60` consumes the existing anti-abuse request bucket before admission. That check must remain independent of monthly purchased usage.
- `app/lib/server/analysis-ingestion.ts:23` derives the organization from trusted membership; line 47 invokes `create_queued_analysis`; line 67 removes a duplicate upload. Commercial admission must share a durable idempotency boundary rather than debit every upload attempt.
- `app/lib/server/rewrite-service.ts:219` and line 238 apply separate cooldown/request controls; line 260 reads organization AI usage. These are not an idempotent plan ledger.
- `app/lib/server/build-assist-service.ts:177` uses UTC month start; lines 195-206 describe and reserve a separate conservative request budget, including a 32-day rate-limit window. This is not evidence that approved monthly commercial allowances already exist.
- `app/routes/analysis.author.tsx:59` dispatches authoring commands. `app/lib/server/authoring-repository.ts:243` handles manual edits separately from accepting proposals. A raw save count would misrepresent the proposed AI rewrite unit.
- `app/routes/latex.compile.ts:1` delegates to the standalone compiler service. No paid AI dependency should be introduced into this path.
- `tasks/todo.md:1403` requires server-enforced, versioned plans and `tasks/todo.md:1405` names boundary/reset/duplicate/downgrade/override tests. `tasks/plan.md:354` retains the A4-before-billing rule.

## Implementation acceptance matrix

These are future tests. None was executed in this documentation-only review.

| Scenario                   | Exact assertion                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free review boundary       | Requests 1-10 in one server period can reserve one review each; request 11 is denied before a job/provider call. Count only the approved settlement outcome.                                                                      |
| Free edit boundary         | The first successful operation in the approved edit meter consumes one unit; the next is denied. Plain manual correction/confirmation behavior matches the approved edit definition.                                              |
| Concurrency                | With one review left, two distinct simultaneous admissions produce exactly one reservation and one denial. Concurrent duplicate keys return the same logical operation and consume once.                                          |
| Idempotency conflict       | Same organization/action/key and identical payload replay without another debit; a changed payload with that key is rejected. Another organization cannot read or consume the first organization's operation.                     |
| Month reset                | An operation immediately before the half-open period end remains bound to its original period, including completion after midnight. A new-period operation uses its new allowance; no client clock or supplied period changes it. |
| Job/provider failure       | An enqueue failure leaves neither a job nor leaked reservation. Provider timeout/worker retry/cancellation follows the approved linked release/reversal rule exactly once; real provider attempts remain cost records.            |
| Retry after success        | Reloading a result, downloading its PDF, retrying a finished job or replaying payment confirmation does not consume or grant a second unit. An explicitly new review/new JD is a new unit only under the approved definition.     |
| Plan transitions           | Upgrade/cancel/expire/downgrade use verified effective times; repeated toggles do not refill Free usage. An over-limit downgrade blocks new metered work without corrupting prior results or reservations.                        |
| Free Build                 | Free, exhausted-Free, expired-paid and active-paid accounts can edit/compile/preview/download subject to normal security/resource checks. None of those operations creates an AI usage debit or upgrade requirement.              |
| Paid Build AI              | Free and expired-paid accounts cannot call the AI suggestion provider directly. Active paid accounts receive all supported AI modes within the approved allowance. UI hiding alone cannot pass.                                   |
| Unavailable/unknown policy | Missing catalog, stale membership, invalid usage totals or persistence errors do not grant AI work or misreport unlimited access. Public errors remain content-free.                                                              |
| Audit/reconciliation       | Admin adjustments require authorized reason/expiry and append-only audit. Reconstruct balances from events and prove reserved plus committed usage never exceeds the allowance.                                                   |
| Checkout/events later      | Client price/period/plan tampering, invalid raw-body signature, duplicate/reordered/retried events and refunds/disputes do not grant duplicate or unearned entitlement. Default-off routes deny sessions.                         |
| UX/copy                    | Only INR 300/month is shown for the Indian paid plan; Free says 10 reviews and one edit per month; compiler/PDF access is visibly free; paid usage limits and reset dates match the server projection.                            |

Real transactional and concurrency proof needs an approved isolated Supabase target and exact cleanup. Docker database/reset commands remain prohibited. No provider calls, DB mutations, services, application tests, dependency changes or publication were performed.

## Minimum remaining owner choices

Bundle these into a concrete decision rather than repeatedly asking broad validation questions: accept the bounded paid allowances and the AI rewrite unit/settlement/reset proposal; approve the already prepared local T080 sequencing exception if local implementation is desired before A4. Provider/tax/refund and test-mode decisions are needed before T081/T082, not to repeat the completed pricing-document review.

## Verification

One handoff file is owned by this agent. Root source and existing worktree changes were read/preserved. The self-contained prose inspection scored 0.0325 (low density); deterministic cleanup changed zero characters. No prose rewrite was needed. Focused diff checking passed. The cached Node 22 formatter path no longer exists, so Prettier did not execute; root should run the final formatting check on integration. No billing implementation, application test pass, merchant approval or live activation is claimed.
