# AA7 hardening candidate validation

Status: private synthetic engineering checks PASSED on immutable candidate `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac`. Source bindings and exact checks are in the [validation receipt](AA7_HARDENING_CANDIDATE_VALIDATION_20261106.json). This is the uncommitted root candidate on base a0b239299d75b0bd64b588fe743ebe2975fb28b9; unrelated dirty work was preserved.

## Executed checks

- `check:latex:source`: formatting, lint, Python syntax and license-auditor self-check passed.
- `verify:latex`: 20 actual worker groups passed, including pypdf6.21.4 identity, legacy-parser and runtime compiler-tool absence, exact image/source/lock binding, Landlock/filesystem/exec boundaries, network/resource limits, parser policy, real PDF compilation, hostile source, cancellation, wall timeout, concurrency and scoped cleanup. The [runtime receipt](AA7_HARDENING_CANDIDATE_RUNTIME_20261106.json) records all outcomes.
- The policy probe retains all 19 original PDF cases and adds bounded excessive object depth. All 20 pass using pypdf writer and generic objects consistently with the candidate inspector; no old-parser type mismatch or fallback is used. These are structural-policy checks, not a named CVE exploit reproduction.
- `benchmark:latex`: all six profile/paper combinations passed. The small sample has p95 712ms; this is not a representative performance guarantee. See the [benchmark](AA7_HARDENING_CANDIDATE_BENCHMARK_20261106.json).
- `verify:latex:rollback`: flag-off unit HTTP-boundary check, actual stopped-resource refusal, exact owned-resource removal, same-process quarantine retention and fresh-process two-page compilation all passed. The [rollback receipt](AA7_HARDENING_CANDIDATE_ROLLBACK_20261106.json) records zero owned containers afterward.
- Final root `npm run verify` exited0 under Node22.23.4: 1,203 tests / 145 files, formatting, lint, types, web and worker builds. Existing non-fatal dependency annotation and Vite .env NODE_ENV warnings remain.

No provider, database, migration, Docker database, real candidate document, deployment or public operation ran. The worker container slot was released before the separately coordinated license audit. Historical image and failed build/parser-only receipts remain unchanged. Successful current validation supersedes their execution blocker for this candidate; it does not erase those attempts.

Compiler OS/package vulnerability triage, license review, document accessibility and formal release approval remain separate evidence. These checks do not confer representative validity, PDF/UA compliance, verified canonical provenance or production authorization.

## Full current-candidate browser integration

After the worker checks and root verification passed, the coordinator authorized both complete dedicated browser suites sequentially. The current converter suite contains seven cases rather than the earlier planning estimate of six. All seven passed in 24.6 seconds; all six controlled-provider AI cases passed in 35.6 seconds, for 13 passed cases total.

Coverage includes authenticated/unauthenticated boundaries, actual candidate PDF compile/download and legacy POST source preservation, syntax/unsafe input retry, origin enforcement, keyboard/mobile/current-buffer/toolbar geometry, stale preview cancellation and both-theme readability. The full AI suite covers no-request hover/context disclosure, Escape dismissal, source-bound review/Apply/Undo and preview invalidation, candidate fact confirmation and protected metrics, unsafe/malformed/refused proposals, stale/cancel/mobile consent, plus the actual bounded SDK timeout against a test-only provider stub. Existing desktop/mobile Axe checks pass without exclusions. No live provider request occurred.

The [browser receipt](AA7_HARDENING_CANDIDATE_BROWSER_20261106.json) binds candidate/source/configuration hashes. The [candidate-specific synthetic screenshot](build-toolbar-candidate-20261106.png) preserves the earlier baseline artifact. The only browser-spec edit in this step was that explicitly approved screenshot path; assertions were not weakened.

Direct managed Supabase testing created 12 recorded synthetic owners. Fixture cleanup removed those accounts, and independent exact SQL verification found zero recorded auth users/sessions, profiles, memberships, organizations, consents, audit events, analysis AI runs and recorded organization IDs. The 24 exact recorded user/month rate keys contained 13 rows; only those rows were deleted and the same lookup then returned zero. Shared global counters remain untouched. Private environment/ledger/launcher files were removed after verification; port3110 is not listening, all owned compiler containers are absent and running container inventory is empty. No database container, schema change, reset, model call or public operation was used.
