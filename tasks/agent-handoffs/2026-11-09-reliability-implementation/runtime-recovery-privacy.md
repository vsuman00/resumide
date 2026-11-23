# R19 privacy barrier and R11 terminal recovery

Status: IMPLEMENTED SOURCE / SQL NOT RUN. Runtime worktree, preserved dirty base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Root owns integration, application checks and any later target admission. This packet does not activate flags, migrate a database or close R11/R19.

The owner authorized the reliability repairs. Root allocated two forward-only migrations and two native operator drafts. No database, provider, network, Docker, browser, owner document, credential, Git publication or service operation occurred. Existing migrations remain unchanged.

## Privacy write contract

`20261110085512` reuses C02 `candidate_owner_lock_keys` and its `resumide:owner-write:v1` namespace. Candidate writes acquire shared transaction locks without waiting, then issue a fresh VOLATILE blocker read. Deletion intake/status updates use the existing exclusive try-lock and fixed `55P03` contention error. Locks last through transaction completion. READ COMMITTED and PostgreSQL's equivalent READ UNCOMMITTED are supported; stronger isolation fails closed. Actual concurrent visibility and lock behavior still need native testing.

Only failed/cancelled deletion requests are inactive. Queued/processing/completed and unknown states block new work. The fixed installation list covers 24 `owner_id` tables plus `profiles.id` and `consents.user_id`; it validates UUID/not-null owner columns. Existing composite FKs, immutable validators and deferred correction ordering remain. Owner transfer is rejected. DELETE/cascades, exact content-free resume tombstones and queued/quarantined cancellation updates remain available. The private accounting, admission, retention, OCR-admission and audit ledgers are outside the generic content trigger.

New export intake and changed nonnull export manifests also require shared admission. Failure bookkeeping and manifest erasure remain possible. Existing export retention/erasure is not solved by this guard.

The migration contains a fixed ten-function source manifest: canonical save, authoring apply, JD save, budget transition/reserve-next, admission authorization, queue owner eligibility, legacy/v2 claim, and stage lease guard. Every latest `prosrc` SHA and old substring/count is checked before migration-time replacement via `pg_get_functiondef`. This preserves all other logic, attributes and grants; drift aborts. No dynamic runtime dispatch is added. Three fixed RLS expressions preserve ownership/membership/source clauses while aligning inactive states. Root review required old-policy drift protection: transaction-local same-table probes now compare deparsed qual/withcheck, roles, command and permissive mode before being dropped and before ALTER. Probe-name collisions or mismatches abort; stronger policies are never silently overwritten. Pre-LIMIT queue filters never acquire locks; locked eligibility checks acquire the shared barrier. Budget reserve/claim require it; release, known settlement, unknown holds and reconciliation remain available after revocation/deletion.

## Recovery contract

`20261110085513` adds service-only `recover_terminal_analysis_jobs_v2(integer)` with limit 1–100 and calls it from the opt-in v2 claim path. It locks analysis then job, rechecks current privacy/membership/exact active source and refreshes expiry after locking. Finished/partial/rejected/current-source-review queue metadata can be deleted only when both lease fields are null or expiry is proved past. NULL-fence legacy leftovers are supported. Failed rows keep attempt/error/fence history and become dead-letter metadata idempotently; pre-existing deadletters are unchanged. Results/status/evidence are never republished or rewritten.

Root review found that the initial `f97ec073` draft treated owner-set/missing-expiry as unleased. Corrected `df3b6c28` preserves that uncertain state. The native draft includes its unchanged-row assertion. This was a source-review finding, not a database failure or a completed race test.

## Evidence and remaining admission

Source-only Python checks passed ten checked-in body hashes/substrings, 26 fixed table entries and the R11 expected post-R19 claim-body hash. Whitespace checks passed. These checks do not parse SQL, validate PL/pgSQL or prove atomicity. Existing application tests were not repeated for these SQL-only files. The operator drafts are NOT_RUN and roll back their exact synthetic fixtures.

Native execution requires a separately reviewed direct-Supabase target packet: exact project/connection role and migration chain, independently confirmed isolation, bounded synthetic owner/run allocation, no competing global producers, statement/lock limits and cleanup receipts. Settings or an empty queue do not prove that admission. R11 invokes a global function and must never run on the configured shared project merely because fixtures are owned.

Required two-session R19 checks remain: hold writer shared lock and show deletion intake returns `55P03`; hold deletion exclusive lock and show content write denies without mutation; commit deletion before a previously started outer write reaches its guard and show the fresh read blocks it. Test both inactive states and stronger-isolation denial. Single-session lock reentrancy is not contention evidence. Real restart/claim/reclaim and source-mismatch recovery negatives remain native R11 acceptance. Restrictive ledger FKs, retention/erasure, orphan cleanup, old-producer fencing cutover and whole consumer/release gates remain open.

## Frozen artifacts

| File                                                           | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261110085512_privacy_write_barrier.sql` | `ef62285882a13d9c4e8813161fd55f80333faedda45e7f4f3fb52b22997a0417` |
| `supabase/migrations/20261110085513_terminal_job_recovery.sql` | `df3b6c28ad1f9e63b4816fccc573705cd74e926e4cbb0ce859511bbf5ee78b3c` |
| `scripts/verify-privacy-write-barrier.sql`                     | `1646f0fda3ebeead981177fda5a353a478cc481daf8f06655bf936c6036460e9` |
| `scripts/verify-terminal-job-recovery.sql`                     | `85489e849106161304ec13a3b4422a3c0a68c58be997c4fc44463e724eae620e` |

Rollback before migration means withholding this source; no hosted change occurred. After a future admitted migration, keep producers disabled and use a reviewed forward repair, preserving ledger/evidence. Do not drop the barrier to admit unsafe writes. Root can integrate source and review the exact native packet later.
