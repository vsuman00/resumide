# ADR-0019 draft: Phase 8 local engineering prerequisites

**Owner deferral, 2026-11-09:** Retain the pricing plan for later; do not implement it before full testing and consumer feedback. All services currently remain free of commercial charges, including Build AI. The terms below describe a future commercial plan. Local T080 sequencing and provider decisions are parked until billing is resumed; do not ask them again during consumer validation.

Status: **PARTIAL OWNER TERMS RECORDED; LOCAL SEQUENCING AND COMPLETE POLICY PENDING**. Updated 2026-11-09. The owner has chosen the price, monthly free allowance and free LaTeX boundary below. The proposed local sequencing exception and remaining commercial policy are unapproved. This record does not waive Gate A4 or authorize implementation, live billing or deployment.

## Existing requirements

Phase 8 comprises T080 entitlement/usage storage and enforcement, T081 checkout/customer portal behind a default-off flag, and T082 signed idempotent webhook reconciliation. [tasks/plan.md](../../tasks/plan.md#13-phase-8-b2c-entitlements-and-billing) states: “No billing task begins until A4 passes and the commercial model is approved.” [Gate A4](../../tasks/todo.md#checkpoint-a4-b2c-production-readiness-implementation-ready-gate-open) remains open. The September A0 commercial question is now partly resolved by the owner terms below; it is not evidence of an approved complete policy.

The localhost-first direction permits continuing the approved sequence and postpones deployment; it does not itself approve missing prices, quotas or payment-provider choices. The owner can approve an explicit local-engineering sequencing exception while retaining every production/launch requirement. No such exception is recorded by this draft.

The approved baseline of 100 analyses/day and five concurrent analyses describes operating capacity, not a free or paid customer plan. Existing anti-abuse/provider safeguards remain independent of commercial entitlements.

## Owner pricing decisions, 2026-11-09

The owner chose INR 300 per month for Indian users and access to all AI features on the paid plan. Three subsequent answers explicitly confirm:

- Free accounts receive at most ten resume reviews and one resume edit, renewed every month.
- Remove the earlier USD 10 one-time idea entirely. No international USD offer is selected.
- LaTeX editing, compilation, PDF preview and download stay free. Build AI fixes and writing suggestions belong to the paid AI plan.

Store the approved price as 30,000 paise in INR when a catalog is implemented. Monthly paid usage allowances, exact review/edit units, reset anchors, failure/retry settlement and transition rules are still pending. Access to every AI feature does not mean unlimited usage. Manual LaTeX edits do not consume the free resume-edit allowance.

The owner asked for a comparison of Razorpay, Stripe and open-source options; that question does not select a payment provider. See the [pricing and payment research](../../tasks/agent-handoffs/2026-11-09-phase8-pricing/research.md) for recommendations, separately identified from approved terms. No pricing UI, commercial enforcement or checkout is implemented by this decision record.

## Concrete proposed implementation sequence

1. **T080 first:** immutable versioned catalog/entitlement policies, server-owned periods, an append-only idempotent usage ledger and atomic quota reservations coupled to durable analysis acceptance. Replays return the existing analysis without another debit. Failures and eligible cancellations create linked releases/reversals rather than rewriting usage history. Preserve tenant ownership, anti-abuse controls, kill switches and provider budgets.
2. **T080 verification:** limit boundary, simultaneous admission, duplicate/replayed and conflicting keys, period reset, failure/cancellation, downgrade and audited override scenarios. Start with controlled fictional fixtures; fixture numbers are not production commercial defaults. Review additive SQL before any separately authorized hosted application. Docker databases and destructive resets remain prohibited.
3. **T081 after the model/provider decision:** authenticated read-only plan/usage display and server-created checkout/portal sessions. Client inputs cannot choose a price or grant entitlement. The feature stays off by default. Cover success/cancel/error/expired sessions, ownership and tampering in provider test mode or approved mocks; identify actual provider evidence separately.
4. **T082 after T081:** verify the selected provider's signature on the raw request body, deduplicate event IDs, bind customers to server-owned organization mappings and reconcile out-of-order deliveries. Cover replay, retry, cancellation, refund and dispute states without granting access from browser success URLs.
5. Record verification and completion in the canonical tasks plus tutorial.md and plan.plan.md. Keep current code tests, provider sandbox results, database execution, finance/support/reconciliation checks and live rollout approval distinct.

The [draft feature design](../design/BILLING_ENTITLEMENTS.md) supplies state/UX and acceptance details. No source code, migration, product, price, customer, checkout session or payment has been created by this proposal.

## Proposed local T080 exception for review

Owner: workspace owner. Constraint: the Phase 8 A4-before-implementation prerequisite. Proposed scope: isolated T080 contracts, entitlement/usage implementation, additive migration files and synthetic local verification after the owner chooses the initial commercial model. Root coordinates; backend owns server/storage contracts, frontend owns account display, and testing owns independent verification in separate worktrees.

Rationale: the owner wants complete localhost functionality before final deployment. Evidence: earlier local checks pass, but the A4 production gate remains open. This proposal does not turn those local checks into A4 approval. Expiry: T080 local acceptance, any material commercial-model change, or before hosted schema application, external provider execution, T081/T082 activation or live rollout, whichever occurs first. Further steps must have their required decisions and authorization.

Existing identity/consent/ownership, immutable versions, quota/provider safeguards, data restrictions and numerical claim floors remain enforced. No production prices, paid entitlement, live checkout or vendor success is supplied by mock fixtures. Missing or unapproved catalog state must fail closed. The owner may instead require A4 closure first.

## Owner decisions required

| Decision           | Current state                                 | Needed value                                                                                               |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Local sequencing   | Pending                                       | Approve or decline isolated Phase 8 engineering while Gate A4 remains an open production gate.             |
| Commercial model   | Monthly free and paid model selected          | Retain the owner terms above; complete the policy before implementation.                                   |
| Entitlement policy | Free monthly 10/1 and Build boundary selected | Paid allowances, exact review/edit units, reset anchors, retry/failure settlement and transition behavior. |
| Money and provider | INR 300/month selected; provider pending      | Tax display, selected payment provider and test-mode scope before T081/T082; no keys in chat.              |

The selected model includes a paid monthly subscription, so checkout and webhook work remains required for the full phase. Until the remaining policy and sequencing decisions are resolved, interfaces/local fakes remain engineering scaffolding and cannot supply commercial acceptance or a completed paid-billing phase.

## Boundaries retained

Gate A4, finance/support/monitoring/reconciliation evidence and explicit live-billing rollout approval remain open until actually satisfied. Existing failed/withheld accuracy evidence remains unchanged. No new external call, provider spend, real data, new dependency, hosted schema change, database reset, Git publication or deployment is authorized. Supabase remains the database/storage provider; Docker is worker-only. The existing deployment hold stays in force.
