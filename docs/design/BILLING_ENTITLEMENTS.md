# Billing and entitlements

**Current access, owner decision 2026-11-09:** Pricing implementation is deferred until full testing and consumer feedback. All services, including AI assistance, currently remain free of commercial charges. The price, allowances and paid-feature split below are a future plan only; no commercial 10/1 limit or paid Build AI gate is active. Existing authentication, consent, security and resource/abuse safeguards still apply.

Version: `billing-entitlements/draft-2` · Status: **DRAFT implementation design; owner-supplied pricing recorded, complete catalog pending** · Date: 2026-11-09.

This contract covers canonical Phase 8, [T080–T082](../../tasks/todo.md#phase-8-b2c-billing-and-entitlements), within the existing `billing-entitlements` module. It is not Accuracy-v2 AA8. The [phase plan](../../tasks/plan.md#13-phase-8-b2c-entitlements-and-billing) states: “No billing task begins until A4 passes and the commercial model is approved.” Gate A4 remains open. The owner has supplied the Indian monthly price and free-tier amounts below; the remaining metering rules and complete commercial catalog are pending. Completed AA8/AA9 engineering does not close A4 or authorize a local sequencing exception. The [pricing coordinator](../../tasks/agent-handoffs/2026-11-09-phase8-pricing/coordinator.md) owns integration and the remaining decision record.

Payment provider, merchant jurisdiction, tax treatment, refund terms, final plan names and launch date are not selected. This draft supplies no purchasable product or working checkout. Deployment, hosted changes, payments and external contact remain on hold.

## Owner-supplied pricing, 2026-11-09

The owner selected INR 300 per month for Indian pricing, access to all AI features on the paid plan, and a free maximum of ten resume reviews and one resume edit. The LaTeX code workspace stays free for everyone. The owner subsequently confirmed that the free allowance renews every month, the USD 10 offer is removed entirely, and optional Build AI fixes and writing suggestions belong to the paid AI plan. No international USD plan is approved.

| Offering             | Recorded terms                                                                                                                                                        | Still to decide                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free resume plan     | Maximum 10 resume reviews and 1 resume edit every month.                                                                                                              | Monthly period anchor/timezone, exact review/edit units, failure/retry treatment and the AI output included within these allowances.                                               |
| Paid AI plan, India  | INR 300/month; access to all AI features. Exact money representation is 30,000 paise in INR.                                                                          | Paid usage allowances and renewal-period semantics, tax display, cancellation/downgrade terms and payment provider. Access to every AI feature does not establish unlimited usage. |
| LaTeX code workspace | Free editing, compilation, PDF preview and PDF download, separate from resume-plan pricing. Optional Build AI fixes and writing suggestions require the paid AI plan. | The paid AI usage meter and limits; existing free compiler safety and abuse controls remain.                                                                                       |

Free LaTeX compilation must not consume a resume-review or resume-edit allowance or require purchase of an AI plan. Existing authentication, sandbox, concurrency and abuse controls still apply; free access does not mean unbounded compute. Submitting the downloaded PDF for resume analysis is a separate operation and follows the resume-plan policy.

The approved product boundary is a free editor/compiler/preview/download workspace with Build AI assistance in the paid plan. Free resume allowances renew monthly. A calendar-month UTC bucket versus an account-anchored month, paid usage limits and any rollover policy still require a concrete policy; no implementation may silently decide these or advertise unlimited AI. There is no USD 10 one-time offer.

These amounts and the free LaTeX scope are commercial inputs, not proof of T080 enforcement or a completed pricing UI. No production catalog, entitlement, migration or checkout has been created.

## Architecture and trust boundary

Keep the [modular-monolith architecture](../../ARCHITECTURE.md), existing identity/organization ownership and leased job model. Supabase is the persistence system; Docker is worker-only. Billing is a server capability consumed by ingestion, analysis, AI and export operations, not a client-side paywall. Existing consent, evidence, rate/concurrency limits, model budgets and safety checks remain independently required. Buying a plan cannot unlock unsafe evidence or approve a score/model.

The existing analysis path performs atomic anti-abuse admission, uploads private source bytes, then resolves/creates the queued analysis through its idempotent RPC; a duplicate request cleans its duplicate upload. The commercial gate must join that durable idempotency boundary, not debit every anti-abuse attempt or upload. Existing qualitative-AI successful-run token totals, Build AI's conservative bucket and process-local concurrency are not a shared settled usage ledger. Worker `SKIP LOCKED` leases serialize jobs, not organization quotas. Preserve those controls independently; implementation must not assume they already provide commercial reservations.

The browser requests an allowed operation or catalog identifier. It cannot supply a price, balance, entitlement, period, quota override, merchant identity or completed-payment status. The server authenticates current membership/role and derives the billing organization. A return URL or successful browser redirect is not payment evidence. Unknown entitlement state must not become unlimited usage.

Separate three records: commercial entitlement, billable usage and actual operational/provider cost. A logical operation may incur multiple worker/provider attempts. Retry idempotency prevents accidental duplicate consumption; actual costs still record their real attempts. A policy must explicitly decide what the customer consumes or pays on success, failure, cancellation and retry. Unknown cost remains unknown rather than zero.

### Proposed data contracts

These are logical contracts for the T080 review, not approved table names or migrations.

| Contract                 | Required meaning                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog version          | Immutable version/hash, approved effective dates, configured plan identifiers, display terms, allowed operations, meter units, limits and period/balance rules. A change creates a version rather than rewriting historical terms. |
| Commercial mode          | Owner-selected free and monthly paid policies; exact approved limits, money and period semantics are immutable catalog data. A missing policy differs from an explicitly approved unlimited allowance.                             |
| Entitlement              | Organization, exact catalog/plan version, effective interval, normalized authorization state, source/revision and audit reference. Historical changes remain traceable.                                                            |
| Usage operation          | Organization, operation type, durable request/job identity, catalog/period or balance binding, requested/reserved/committed/released units, state and idempotency key. No resume/JD text or prompts.                               |
| Provider cost            | Actual attempt identity, measurement unit, provider/model version where applicable, measured cost or explicit unavailable state. Not a mutable customer credit balance.                                                            |
| Adjustment               | Authorized actor, reason, scope, effective interval/expiry, previous/new values and append-only audit. Never an unrecorded balance edit.                                                                                           |
| External billing binding | Provider/environment/account and server-bound customer/subscription/session/event identifiers. No card data or secrets in application events or browser DTOs. Required only after a provider is approved.                          |

Monetary amounts use exact approved units and currency, not binary floating-point arithmetic. Usage units are explicit bounded integers or an approved fixed-point representation. Period/bucket identity is server-derived. Boundaries are half-open intervals with explicit timestamps; the commercial decision supplies their schedule and timezone semantics. Credits must not silently inherit recurring renewal, rollover or expiry assumptions.

## T080: first bounded implementation proposal

After the missing authorization, implement the versioned catalog/entitlement/usage core and a read-only account projection before checkout. Do not create a fake paid plan merely to exercise it. Local fixtures may use clearly fictional policy values to test arithmetic, without seeding a production catalog or presenting them as commercial terms.

1. Resolve the active organization and exact effective policy using trusted server context. Produce an explicit allowed/denied/unavailable result with the applicable version, remaining units and period/balance semantics when known.
2. Atomically resolve an existing operation and reserve usage for a new metered job before provider work. Concurrent requests cannot both claim the final available unit. A durable unique operation key binds the same organization, action, source/job and policy bucket; conflicting key reuse is rejected.
3. Bind admission to job persistence so an enqueue failure cannot leak a reservation. Prefer the existing transaction/RPC boundary where it can enforce both changes. Any compensation path must be durable, idempotent and reconciled; an in-memory rollback is insufficient. If admission denies work after upload, preserve exact duplicate/denied-upload cleanup and track cleanup failure without granting usage or creating a job.
4. Commit or release the same reservation according to the approved consumption policy. Worker lease retries do not mint another customer charge. Reservation expiry/recovery uses server time and durable ownership, with a reconciler for crashes and uncertain completion.
5. Recheck membership, revocation, consent and the reservation/policy binding at the existing final operation boundary. A valid purchase does not bypass deletion or consent withdrawal. A delayed worker cannot charge a different period or plan by accident.
6. Return a content-free read model for Account. This is reporting only; changing a browser value cannot change enforcement. Preserve immutable operations and audit authorized adjustments.

The accounting invariant is that reserved plus committed consumption respects the applicable approved allowance/balance. Never reset a mutable total without retaining the underlying ledger. Reconciliation derives balances from durable records and reports differences; it does not invent offsetting events. Downgrade, renewal, cancellation, expiry and corrections must be replayable without deleting usage history.

An over-limit downgrade blocks new metered admission according to the approved effective-time policy. Existing reservations, late completions, grace periods, rollover, carryover and refunds require explicit commercial treatment before those branches are enabled. No default grace or credit expiry is supplied here. Unavailable policy/persistence returns a retryable unavailable state without admitting new metered work.

### T080 acceptance

- Server enforcement covers each approved metered entry point; no UI-only restriction or rate-limit substitute.
- Tests cover exact boundary, concurrent last-unit admission, duplicate/conflicting keys, period rollover, job enqueue failure, worker retry/crash recovery, commit/release replay, downgrade and audited overrides.
- Tenant/role denial, revoked consent/membership, unknown policy, stale snapshot and unavailable persistence fail before prohibited work.
- Reconciliation proves usage/balance consistency and preserves actual provider costs separately.
- Read-only account states are accessible and source-bound. No checkout or production catalog is necessary for this slice.

Pure deterministic fixtures should verify policy/ledger behavior first. Transaction/concurrency evidence needs an explicitly approved isolated Supabase test target and exact cleanup; no Docker database, reset or hosted migration follows from this draft. Relevant implementation, type/lint/build and integrated checks are chosen after the slice is approved. No billing tests have run for this document.

## Account and pricing UX contract

Reuse the authenticated [Account route](../../app/routes/account.tsx) and [WorkspaceShell](../../app/components/WorkspaceShell.tsx), preserving identity and session controls. Follow the existing [future billing guidance](README.md#future-billing), [product blueprint](PRODUCT_DESIGN_BLUEPRINT.md) and [theme tokens](../../app/app.css). Warm surfaces, readable ink, terracotta actions and evidence/status accents retain their current light/dark semantics; do not introduce a new pricing visual system.

The first proposed section is a quiet “Plan and usage” readout. Show only verified plan terms, measured units, remaining allowance/balance and reset/expiry/renewal information applicable to the selected commercial mode. Include the as-of/effective period and pending changes. Use labelled text and a definition list; a visual meter is supplementary, never the only explanation. Do not show a renewal for non-recurring credits or call an unknown plan “Free.”

| State                   | Display and behavior                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Not configured          | Explain that plan information is not configured; no fabricated price, quota or upgrade action.                                            |
| Available               | Show the actual entitlement and usage; no consumption or checkout action in the T080 read-only slice.                                     |
| Pending synchronization | Explain that confirmation is pending; do not grant an entitlement from the return page.                                                   |
| Limit reached           | State the measured limit and approved next option. Do not assert a reset time, upgrade or credit purchase unless the catalog supports it. |
| Scheduled change        | Show the confirmed effective date and current versus future terms.                                                                        |
| Restricted/expired      | State which new operation is unavailable and the approved recovery path; preserve unrelated account/security controls.                    |
| Unavailable/error       | Keep unknowns distinct from zero and show a safe retry/request reference. Do not display private provider errors.                         |

The proposed comparison has one free resume-plan row and one Indian paid-AI row, plus a separate free LaTeX callout. Draft copy may read "Free: 10 resume reviews and 1 resume edit every month" and "AI plan: INR 300/month, with access to all AI features." Add paid limits, precise renewal/cancellation and tax terms before publishing an offer. Do not describe the paid plan as a one-time payment or show a USD offer. Build copy should identify "LaTeX editor, PDF preview and download: free" with a separate "AI fixes and writing suggestions: paid AI plan" label.

Show the free LaTeX workspace outside the paid feature comparison and preserve access after an AI subscription ends or a resume allowance is exhausted. The account readout should report resume reviews, resume edits and any separately approved AI meter distinctly. Editing LaTeX text is not a resume-edit debit. A successful retry must refer to the same durable operation rather than spending the displayed allowance twice.

After the remaining terms are approved, any comparison uses plain parallel rows with visible units, renewal/expiry, cancellation and relevant tax terms. No invented recommended plan, crossed-out price, urgency, preselected paid option or hidden renewal. Keyboard/focus order, announced pending/error states, non-color status text, responsive wrapping and existing touch-target/contrast floors apply. Invoice/history and management links appear only when their data and access rules exist. There is no billing UI implementation or new route in this draft.

## T081: checkout and management boundary

Checkout and customer management are later, separately enabled capabilities. Any flag must default off, have a named owner, expiry/review date, target environment and tested server-side denial. Turning a button off is not the control. An approved catalog/provider configuration must exist before a session can be requested.

The authenticated server selects the approved price/product mapping, quantity, currency, environment, customer/organization and allowlisted return locations. It creates idempotent bounded sessions; the client cannot inject provider identifiers or arbitrary redirect destinations. A portal session is tenant/role-bound and transient. Provider-hosted collection is a proposal pending provider/security approval, not a claim that a particular vendor or merchant arrangement is available.

The return experience distinguishes canceled, expired, processing, failed and confirmed states. Only reconciled verified server evidence makes payment/entitlement changes effective. Reopening/replaying a return URL does not regrant access. A checkout timeout or pending invoice remains uncertain, not paid. Exact recurring versus credit-purchase copy and portal capabilities depend on the approved provider/model.

T081 acceptance includes default-off route/action denial, wrong tenant/role, client price tampering, repeated session requests, safe return targets, and authorized provider test-mode success/cancel/error/expiry. No real payment, product/customer creation or provider call is authorized now.

## T082: signed events and reconciliation

Use a bounded raw-body webhook boundary. Verify the provider's approved signature/timestamp/replay protocol before parsing or mutating state. Provider-specific secret rotation, clock tolerance and acknowledgement/retry behavior must come from the selected provider's official contract; none is guessed here.

Persist a durable unique provider/environment/account/event identity and verified envelope before applying effects. Duplicate deliveries cannot duplicate credits, entitlements or refunds. Model received, processing, applied, retryable failure and quarantined/invalid states separately. Unknown event types or unmatched customers do not grant access. Bind every effect to the correct organization, commercial version and authorized lifecycle transition.

Delivery order is not lifecycle order. Reconcile using the selected provider's authoritative revision/snapshot rules rather than “latest HTTP arrival wins.” Any necessary provider read requires separately authorized integration scope. Preserve cancellation, refund and dispute evidence; do not erase consumption or assume that every refund restores credits. A failed transition is observable and retryable/idempotent, not silently acknowledged as applied.

T082 acceptance covers invalid/missing signature, raw-body mutation, stale/replayed envelopes, duplicate events, concurrent processing, out-of-order transitions, retries, cancellation, refund and dispute. Quota changes are tested through actual server admission, not only a webhook status field. Approved test-mode events and reconciliation evidence precede live configuration.

## Operational and release states

Normalize unknown/provider-specific states without treating them as active. The later lifecycle needs explicit handling for pending confirmation, active access, past-due/failed payment, scheduled cancellation, canceled/expired access, refunds and disputes; those names do not select a grace or refund policy. Support/admin adjustments require authorized scope, reason and expiry, never a browser override.

Audit organization, actor/service, operation/event identity, policy version, transition/outcome and safe reason. Keep secrets, payment-card data, resume/JD text and prompts out of logs and client output. Retention/export/deletion rules must distinguish billing records from resume content, with the actual legal/accounting policy supplied before live collection.

Monitors cover admission failures, reservations stuck past policy bounds, processing lag, reconciliation differences, duplicate/conflicting events, payment errors and cost anomalies. Disabling checkout must stop new sessions while preserving entitlement enforcement and authorized reconciliation of existing obligations. A rollback must not make paid work unlimited, discard events or automatically issue refunds. Kill/disable paths and the previous code/catalog version require an owned runbook.

The canonical Billing launch checkpoint still requires financial reconciliation, support states, webhook monitoring, rollback/disable and authorized test-mode end-to-end evidence, followed by explicit human authorization of live configuration and rollout. A4 closure or an explicit bounded local sequencing exception does not itself authorize live billing. Current deployment and Git holds remain.

## Required decisions and ownership

Only these decisions are needed before a concrete implementation slice can be approved:

1. **Sequencing:** close Gate A4 or explicitly authorize a bounded isolated T080 engineering exception, with unchanged release/deployment restrictions.
2. **Commercial subject and period:** the owner selected monthly free allowances and the INR 300/month Indian AI plan, removed USD 10 entirely and placed Build AI assistance in the paid plan. Define who owns/manages the plan and the exact monthly period boundaries. No international USD plan is approved.
3. **Complete catalog and metering:** retain the owner-supplied free ten-review/one-edit amounts, Indian monthly price and free LaTeX scope. Define review/edit units, paid allowances, Build AI metering, consumption on success/failure/cancel/retry, transition/grace/rollover/expiry/refund behavior and override ownership. Missing values cannot be filled by the implementation.
4. **Provider and live policy, before T081/T082:** approve the payment vendor/merchant environment, currency/price/tax/invoice/cancellation/refund terms, signature/event contract, retention and test/live boundaries. These can remain deferred during an explicitly authorized provider-free T080 slice.

| Owner                 | Current responsibility                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Root coordinator      | Canonical plans, A4/commercial decision packet, architecture/contract integration, migration ordering, flags and later service allocations. |
| Frontend/design agent | This draft and later approved read-only Account UX; no checkout UI before terms.                                                            |
| Backend agent         | Read-only integration audit and proposed persistence/admission/ledger contracts; no implementation before approval.                         |
| Test agent            | A4/prerequisite audit and proposed boundary/concurrency/lifecycle acceptance; no live payment/DB allocation.                                |
| Workspace owner       | Commercial/sequencing decisions and, later, explicit live-billing and launch acceptance.                                                    |

This draft records the owner-supplied price, free amounts and free LaTeX scope while the complete catalog remains pending. It grants no gate approval, migration permission, provider authority, implemented feature or new application-test result.
