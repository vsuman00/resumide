# R03 shared budget ledger: source and client validation

2026-11-10, Asia/Kolkata. Main at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the preserved dirty worktree. The persistent ledger source and client are integrated. **R03 remains partial: SQL was not parsed, applied or executed, and no provider entry point uses the ledger yet.** The full 64-task reliability goal remains active.

## Implemented source

The CLI-created migration `20261110062548_technical_ai_budget.sql` defines seven private tables and six service-only RPCs. It covers one organization/DB-clock UTC-month pool across qualitative, rewrite and Build operations; immutable policy/opening/operation/event records; captured rate/limit versions; distinct policy-bounded attempts; one-shot dispatch claims; pre-dispatch release; known settlement; unknown holds without expiry; original-period accounting and operator reconciliation. All new tables have RLS and revoked direct client/service DML. Public wrappers restrict execution to the service role and fix an empty search path. These are reviewed source properties, not observed PostgreSQL behaviour.

An operator opening record is required before a month admits work. No policy, rate, operator or opening was seeded. Existing 100,000-token monthly and 25,000-token Build reservation defaults are unchanged. Policy rotation cannot create another monthly allowance. Rates are explicit integer technical-accounting inputs, not customer pricing or a model-price guess. All services remain free of commercial charges.

The RPC-only TypeScript client validates immutable identity, exact decimal counters, cost arithmetic, receipt state and dispatch flags. Missing, malformed, foreign or inconsistent responses fail closed. It provides no local balance, retry scheduler or production fallback. Current membership gates new reserve/dispatch; exactly bound accounting can still record usage after revocation. No current caller, configuration, package or lockfile was changed.

## Defects found and corrected

The first implemented client passed 27 of 28 cases. A fractional rate leaked a raw BigInt exception; a syntax guard now returns the safe typed error. A later concrete receipt case failed with the original 28 cases passing: a fresh over-reservation settlement incorrectly accepted an unblocked result. The client now rejects it.

Independent SQL review found the same missing invariant in draft `e9cb0fc2…`: full charging alone did not fence an overrun below the monthly cap. Corrected `7ab655cf…` blocks unresolved input/output/cost overruns. An allowlisted operator may acknowledge an already settled overrun using identical usage and evidence, appending an event without charging twice or lowering the usage. That acknowledgement cannot clear an actual monthly deficit. Original failed client receipts and the source-review hold are retained. The SQL counterexample and repair were reviewed, not executed.

## Verification

The [Root check](r03-budget-integrated.json) passes all 29 new client tests, full typecheck, lint, web build and worker build. It bound 661 unchanged application/SQL inputs, including both raw SQL files. The [independent observation](r03-budget-integrated-observation.json) rehashed both final artifacts and confirmed all five process groups absent. The test file uses local RPC response doubles; it does not prove database authorization, atomicity or concurrency. Completed R02 tests and the full application suite were not repeated.

[Source integration](r03-budget-source-integration.json) records exact released hashes and unchanged Root checks. [Client implementation](backend-ai-budget.md), [unit and SQL interface review](frontend-ai-budget-tests.md), and [SQL implementation/review](runtime-ai-budget-review.md) keep their separate evidence tiers. Current [Supabase function guidance](https://supabase.com/docs/guides/database/functions), [API security](https://supabase.com/docs/guides/api/securing-your-api) and [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html) informed the review. CLI 2.117.0 was used without upgrading.

No provider, database, Docker, browser or real-document operation ran in this implementation check. No staging, commit, push, deployment, policy activation or commercial pricing occurred.

## Remaining work

The [operator SQL draft](../../../scripts/verify-technical-ai-budget.sql) and [runbook](../../../docs/operations/AI_BUDGETS.md) require a separately admitted isolated direct Supabase target. Native SQL capability, actual functional tests and two-session last-unit/claim/settlement races are not supplied by the existing owned-fixture API guard. Preserve the Docker-database prohibition. Admission, opening/cutover balances and retention/deletion compatibility must be proved before activation; new restrictive foreign keys cannot silently obstruct privacy deletion.

R04–R06 must bind the actual provider entry points to reserve/claim/settle and preserve unknown holds, including persistence failures. Their local contract is now reviewed; this report grants no migration application or provider dispatch. Continue caller integration and native managed-target preparation, then execute the actual SQL/concurrency checks under their concrete allocation. Do not repeat a key check or unchanged test campaign.
