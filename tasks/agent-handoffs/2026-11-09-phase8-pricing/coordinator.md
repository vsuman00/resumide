# Phase 8 pricing coordinator

**Superseding owner direction, 2026-11-09:** Keep this as a future plan and defer pricing implementation until full testing and consumer feedback. All services currently remain free, including Build AI; do not apply the planned free 10/1 commercial allowance now. Continue with [consumer validation](../2026-11-09-consumer-validation/coordinator.md). No payment provider has been selected or activated.

Updated 2026-11-09. Root base main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus preserved extensive dirty work.

## Authorized slice

Record the owner-supplied Indian price of INR 300/month, free maximum 10 resume reviews and one resume edit, and free LaTeX workspace. The owner explicitly confirmed all three follow-up choices: free allowances renew every month; remove USD 10 entirely; Build AI fixes and writing suggestions belong to the paid plan while editing/compilation/preview/download stay free. Paid allowances and precise units/lifecycle remain pending. Supply researched recommendations, including the owner's later Razorpay/Stripe/open-source question. ADR-0019 local T080 sequencing remains pending, Gate A4 open. No commercial application code, migration, payment/provider execution, service, publication or deployment is authorized by this documentation/recommendation slice.

## Assignments

- Root: shared CONTEXT, ADR-0019, plans/task evidence, this coordinator, official payment/cost research and integration.
- Frontend/design agent: existing accessible-preview worktree; exclusive docs/design/BILLING_ENTITLEMENTS.md draft and own pricing handoff. Update confirmed terms, preserve unresolved choices and all enforcement/UX boundaries. No application edits.
- Backend agent: existing licenses worktree; exclusive own pricing-metering handoff. Read root source as authoritative dirty baseline, audit metered entry points, free Build boundary and costs without changing code.
- Independent verifier: existing sandbox worktree; exclusive own pricing-validation handoff. Verify requirements and risky ambiguities, recommend bounded tests and inspect actual gate prerequisites. Do not rerun broad suites for this prose-only slice.

The worktrees remain based on a0b2392 with prior owned dirty work preserved; they do not synchronize automatically. Only explicit returned files integrate. No shared services or ports allocated.

## Acceptance and verification

Review returned diffs sequentially; record confirmed price separately from proposals. Keep T080-T082 unchecked. Verify Markdown, local links, prose hygiene and git diff --check. No application tests are needed unless source behavior changes.

## Integrated result

The frontend draft and backend/independent audits are integrated. ADR-0019 and the Phase 8 todo/plan record the confirmed monthly terms without closing A4 or claiming implementation. [Payment research](research.md) recommends Razorpay for this India-focused launch and explains Stripe's invitation-only onboarding, actual recurring fees and the role of Hyperswitch/Lago. No provider is selected by the owner's comparison question. Proposed paid allowances and edit units are identified as recommendations, not approved catalog values.

The old cached Node 22 binary was absent. The coordinator restored the same 22.23.4 runtime through the npm execution cache and ran the scoped formatter successfully; no project dependency or lockfile changed. Earlier worker reports preserve that their own formatter did not run. The integrated independent review, scoped Markdown formatting, local file links, prose and whitespace checks pass; see [verification](verification.json). No application tests were rerun for this prose-only slice.
