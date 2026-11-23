# R04-R06 caller integration

2026-11-10, Asia/Kolkata. Main at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the preserved dirty worktree. Status: local source and affected tests verified; database execution and production enforcement remain open. This is progress on the 64-task reliability plan, not full-plan or release completion.

## Changes

Qualitative feedback, explicit rewrites and Build assistance now share an opt-in attempt orchestrator: reserve, win the first dispatch claim, observe usage, then settle known usage before saving output. Refusal, invalid output or later persistence failure cannot refund known usage. Unknown usage holds the reservation. A reserved replay can recover a crash before the first claim, while a claimed or terminal replay cannot dispatch again. Claim losers do not mutate the winner's accounting.

The added service-only reserve-next SQL wrapper allocates actual provider ordinals rather than treating job retries as provider attempts. The previous six RPC contracts remain. HTTP operation identities bind owner, organization, surface and a request nonce; changed payload under the same identity conflicts. Qualitative exhaustion/blocking follows the existing non-retryable partial-result path. Auth, consent, ownership, rate, factual, version and concurrency guards remain. Build retains its 25,000-token total envelope.

Build's actual SDK timeout class has `.name="Error"`; relying on its name misclassified it as provider unavailable. The added installed-SDK fetch-stub regression reproduced that error, then passed after a minimal class check. No live request was needed.

`AI_BUDGET_ENABLED=false` and an empty policy are the defaults. Real `.env` was not edited; nothing was enabled or seeded. These are technical safety controls, not commercial pricing. Services remain free.

## Finite verification result

One integrated Node 22 gate passed:

- AA4, AA5 and Build AI source checks.
- 169 tests across 10 affected config, client, qualitative, rewrite, Build and installed-SDK files.
- Full typecheck, lint, web build and worker build.

All 665 bound source inputs remained unchanged. Both final artifacts and the log were independently rehashed, and all eight command process groups were absent afterward. The integrated check used sealed synthetic configuration, mocked RPC/provider calls and no `.env` loading. It made no database, provider, Docker or browser operation. No repeated full suite, key check, compiler campaign or owner-document test ran.

Separately, one read-only catalog query through the connected Supabase account confirmed that the configured project was healthy and accessible, with zero ledger tables and zero ledger RPCs. No candidate rows were read and no rows or schema were changed. Native access is available; missing local PostgreSQL credentials are not a connectivity blocker. Isolation and native write admission remain unproved.

## Evidence and limits

[Integration receipt](r04-r06-source-integration.json), [combined gate](r04-r06-entrypoints-integrated.json), [independent observation](r04-r06-entrypoints-observation.json) and [read-only inventory](r04-r06-native-readonly-inventory.json) bind this result. Agent source reviews and failures are retained in the [backend](backend-ai-budget-entrypoints.md), [rewrite](frontend-ai-budget-entrypoints.md) and [Build/SQL](runtime-ai-budget-entrypoints.md) handoffs. Earlier failed receipts are not relabeled as passing. A transcription error in Root's expected test-file hash stopped integration before any copy; correcting that expected value allowed the complete original-root check to pass. Prettier has no inferred parser for `.env.example`; that file received a whitespace check instead.

CR-R03 through CR-R06 remain PARTIAL. SQL has not been parsed, applied or executed; transaction races, real permissions, opening balances, old-producer cutover and privacy deletion/retention remain unverified. Source preparation does not waive those dependencies or activate production enforcement. Worker lease/cancellation/write fencing, correction materialization, OCR, useful JD writing, browser/accessibility, security and release acceptance remain separate open work.

The next budget step is an exact isolated direct-Supabase migration/test packet, followed by real SQL and concurrency tests under that packet. Do not rerun this gate unless code changes or a specific unresolved failure requires it. No Git mutation, deployment or publication occurred.
