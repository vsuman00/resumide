# R11/R19 privacy consistency and recovery

2026-11-10, Asia/Kolkata. Main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty worktree. Status: application repairs verified; database barrier/recovery source reviewed but unparsed and unexecuted. The full 64-task reliability plan remains active.

## Application changes

Successfully cancelling an owner's still-queued deletion now withdraws its access block. Failed and cancelled requests are inactive; queued, processing, completed and unknown states still block access. Canonical resume access, JD requirement access and privacy export use the same pure status tuple and strict query-result classifier. A null/malformed result or lookup error cannot silently grant access. Existing owner, organization and active-source checks remain.

The privacy page checks blocking deletions across the owner's complete request set instead of authorizing download visibility from only 20 displayed history rows. It hides downloads when that check is blocked or unavailable, while the export API retains its pre/post-manifest checks. Existing cancelled-request denial cases moved into allow coverage; their coverage was not deleted.

Privacy mutation contention maps the fixed SQL `55P03` code to a safe retryable 503 error. The actual React Router action/SSR handler returns that status and safe data/headers for create and cancel. Origin, authentication and unexpected-error behavior remain. Cancellation is still conditional on the exact owner and queued status. The map was already repaired on November 9; this batch updated it for the new stores and boundaries, preserving its original archive unchanged.

## SQL source changes

The CLI-created `20261110085512_privacy_write_barrier.sql` defines an owner transaction barrier using the existing C02 key namespace. Deletion intake/status changes use an exclusive try-lock; candidate work uses a shared try-lock followed by a fresh volatile blocking-state lookup. The implementation requires READ COMMITTED or READ UNCOMMITTED and fails closed at other isolation settings. Fixed triggers cover 26 candidate-content tables, plus deletion/export intake and new export manifest copies. Reviewed erasure/failure bookkeeping and existing safety accounting can continue. No new retention period or permission to delete safety ledgers is introduced.

Ten exact function-body hashes and literal replacement counts guard forward compatibility changes for canonical/JD/authoring writes, AI admission and worker admission/stage checks. Three same-table probe policies verify existing roles, commands, permissiveness and deparsed expressions before status-only RLS edits; drift aborts the migration. Probes disappear before commit. This is migration-time fixed DDL, not arbitrary runtime SQL dispatch. Root independently matched all ten source-body hashes/counts and the recovery predecessor binding. [Source observation](r19-privacy-sql-source-observation.json).

The subsequent `20261110085513_terminal_job_recovery.sql` adds bounded recovery before opt-in v2 claims. It removes queue metadata for confirmed finished/latest-source review results only after expiry or proved unleased state. It never rewrites results or retries AI. Failed leftovers retain their history and become dead letters; existing dead letters, live leases and owner-set/missing-expiry uncertainty remain untouched. NULL-fence legacy leftovers are included under those same checks.

The design follows PostgreSQL's [transaction advisory lock functions](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) and [locking guidance](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS). Actual transaction visibility, contention, policy comparison and recovery behavior still require native execution.

## Verification and evidence

One integrated Node 22 gate passed **117 tests across 12 affected files**, full typecheck, lint, web build and worker build. All 683 bound inputs stayed unchanged. Both artifacts and the log were independently rehashed; all five command process groups were absent afterward. [Gate](r11-r19-privacy-recovery-integrated.json), [observation](r11-r19-privacy-recovery-observation.json).

The gate exercised actual application/repository code, component rendering and the local SSR handler with mocked Supabase. It made no database, provider, Docker, browser or owner-document operation. It did not repeat the unchanged full suite, key checks, compiler campaigns or earlier worker suites. SQL/draft hashes are bound inputs, not executed tests.

The original cancelled-export failure, four repository access failures, two SSR 500-versus-503 failures and private type-harness failures remain in the agent evidence. No suppression, threshold relaxation or disabled test was added. Source reviews corrected uncertain-lease cleanup and missing target-policy drift protection before final integration. Peer review acknowledged the final exact SQL without another test campaign.

[Application integration](r19-application-source-integration.json) and [SQL integration](r11-r19-sql-source-integration.json) record exact files/hashes. Detailed evidence: [application policy](backend-privacy-policy.md), [service seam](backend-privacy-service-tests.md), [tests/UI/docs](frontend-privacy-consistency.md), [barrier/recovery SQL](runtime-recovery-privacy.md). Native operator drafts remain unexecuted and do not prove two-session contention or global queue isolation.

## Remaining work

CR-R11 and CR-R19 remain PARTIAL. Verify actual target schema/function/policy compatibility, admitted migration execution, transactions, races and the real leased lifecycle before activation. A metadata query or self-declared flag does not establish an isolated global queue. Retention/erasure, restrictive ledger foreign keys, orphan reconciliation, Auth identity/session deletion, provider/backup lifecycle and complete export coverage remain open. There is no full privacy or release acceptance.

Next, inspect native compatibility and prepare the concrete SQL target/action packet; continue independent ATS/canonical repairs without rerunning this unchanged application gate. Services remain free. No Git mutation, deployment, publication, hosted DDL, flag activation or new provider use occurred.
