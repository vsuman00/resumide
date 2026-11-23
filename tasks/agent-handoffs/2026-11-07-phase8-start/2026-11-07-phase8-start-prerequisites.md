# Phase 8 prerequisite decision packet

Reviewed current ROOT files on 2026-11-08. Base is dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; no source, tests, services or external state changed. This is a proposal for the coordinator, not an approval or a new waiver.

## Current gate

[Phase 8](../plan.md#13-phase-8-b2c-entitlements-and-billing) says no billing task begins until A4 passes and the commercial model is approved. [T080](../todo.md#t080-add-entitlement-and-usage-model) depends on A4. T081 depends on T080; T082 depends on T081. A4 remains explicitly open in the current task list. Accepted AA7 converter work and AA8/AA9 prerelease engineering do not close this separate production gate.

Existing local security/operations implementations and historical hosted tenant/storage/SQL checks are recorded. Remaining A4 evidence includes:

- Security/privacy/operations approval and deployment-owned malware, sandbox and egress controls.
- Hosted restore with integrity, representative user flow and measured recovery evidence.
- SLO dashboards, notification delivery, cross-layer tracing and provider-outage/stalled-queue exercises.
- Monitored staging E2E, live export/deletion scheduling, rollback rehearsal and user-facing policy approval.
- Live-provider verification, hosted pool/throttle/soak/capacity evidence and explicit owner A4 approval.

The localhost-first direction in `tasks/todo.md` defers cloud worker deployment until functional/local testing is complete. ADR-0018 revises AA8/AA9 acceptance only. Existing E-003 through E-007 sequencing approvals have named accuracy/converter scopes. None waives the billing prerequisite. The deployment hold remains explicit.

## Missing commercial decision

The Gate A0 record still lists the B2C payment/entitlement model as unresolved. Its 100 analyses/day and five-concurrent-analysis baseline is operational capacity, not approved free/paid plan allowances. Existing AI request budgets are not commercial entitlements either.

Before T080 code, the owner needs a concrete model revision covering intended plans/free allowance, metered units, allocation/reset period, reservation/commit/refund behavior, retries/cancellation/failure treatment and downgrade/override semantics. Prices and payment-provider selection may remain deferred to T081 only if the owner explicitly approves that narrower T080 model; the packet must not silently invent them.

## One-owner choice

Planning now may specify draft server contracts, deterministic test cases, schema/rollback proposals and UX states, with all commercial choices marked unapproved.

The coordinator can offer either normal A4-first sequencing or this minimum exception for review:

> PROPOSED ONLY: The workspace owner approves isolated local T080 engineering against a specifically approved entitlement-model revision while A4 remains open. Use synthetic limits/data and injected persistence tests; keep new enforcement default-off. Preserve security/privacy floors, existing rate limits, withheld scoring and every A4/live-billing requirement. No provider/payment, hosted migration/write, publication or deployment is authorized. The named exception expires at completion of this local T080 slice or before T081, hosted integration or production activation, whichever comes first.

One owner answer may approve the finalized model and this exact sequencing exception together. A generic continuation or localhost preference supplies neither decision. Do not seek an external reviewer team or pretend A4 passed.

## Verification boundaries for that future slice

T080 needs limit/period boundaries, duplicate/rebound events, reservation races, approved failure/retry accounting, downgrade and audited override tests. Injected-store tests cannot establish durable database concurrency. Real SQL/migration verification needs a separately approved isolated Supabase target; no current hosted-schema authorization exists.

Use Node 22, the private dotenv-disabled mode, targeted tests and affected source/type/lint/build checks. Web and worker builds run sequentially. `verify:ci` itself does not reset a database, but includes network audits and browser tests; browser target/provider/ledger/port-3110 allocation must be explicit. Default browser startup can load `.env`, so use the sealed private profile for authorized synthetic tests.

Historical CI browser/database jobs run `supabase start` and local reset; `test:db` also resets local Supabase. Those Docker-backed DB paths cannot be reused under the current no-Docker-database rule. Plan a guarded Supabase-direct verification path rather than silently starting/resetting a stack. No such execution or CI edit was performed here.
