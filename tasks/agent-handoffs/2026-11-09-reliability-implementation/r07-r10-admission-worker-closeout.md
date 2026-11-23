# R07-R10 admission and worker repair

2026-11-10, Asia/Kolkata. Tested main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the preserved dirty worktree. Status: source and affected application checks verified; new SQL and production enforcement unverified. The full 64-task reliability plan remains active.

## Implemented

Admission now has an opt-in durable binding for authenticated owner, organization, idempotency key, exact PDF bytes/checksum, JD, title, filename and request/consent policy. It records a unique upload intent before storage I/O. Finalization adopts the analysis, job and upload within one database transaction. Exact replay returns the original identity after checking current source ownership and input hashes; conflicting reuse is denied before another upload. Confirmed duplicate cleanup targets only its unadopted path. Unknown upload/finalization outcomes retain the durable intent and never delete a possibly adopted PDF. Failed duplicate cleanup preserves the original result and a pending cleanup record. Technical AI admission remains at actual provider dispatch; this does not invent prepaid usage or claim atomic budget cutover.

The opt-in queue issues a fresh UUID fence for every claim and requires the exact worker, attempt and token for heartbeat, completion and release. Legacy tokenless queue mutations exclude fenced rows. Eligibility filters precede the bounded candidate limit so revoked or deleted sources cannot permanently hide eligible jobs. Rejected documents retain valid terminal cleanup, and current-source evidence handoffs retain review/withholding semantics.

The runner serializes heartbeats, waits for their outcome before completion, and bounds unresolved-heartbeat and shutdown waits. It does not declare success or release a job after heartbeat uncertainty or runner cancellation. The real stage calls now propagate the signal and lease through extraction, scoring and qualitative feedback. Every extraction transition/result, deterministic write and partial/final qualitative write uses the guarded wrapper when fenced. SQL explicitly dispatches seven typed operations, checks current ownership in the same transaction, and rolls back inner writes on a failed or expired post-check. It contains no dynamic SQL dispatch.

Qualitative cancellation reaches both budgeted and legacy provider paths. Known usage settles before cancellation is rethrown; unknown usage stays held. Cancellation and lease failures cannot become partial results. A rewrite cancelled during its final source lookup cannot proceed to draft CAS, while its usage accounting remains recorded.

Both new flags default to false, and the real `.env` is untouched. The three CLI-created forward migrations are `20261110080809`, `20261110080810` and `20261110082455`. No migration, seed, activation, pricing change or deployment occurred.

## Verification

One integrated Node 22 gate passed 123 tests across 14 affected files, the AA4/AA5/Build source checks, full typecheck, lint, web build and worker build. All 674 bound inputs stayed unchanged. The final artifacts and log were independently rehashed, and all eight command process groups were absent afterward. See the [gate](r07-r10-admission-worker-integrated.json) and [observation](r07-r10-admission-worker-observation.json).

The gate used sealed synthetic configuration and mocked RPC/provider/storage calls. It made zero database, provider, Docker or browser operations. No full-suite, key, compiler or owner-document campaign ran. No tests or assertions were disabled. The original eight runner cases remain unchanged.

Actual regressions reproduced ambiguous upload deletion, overlapping heartbeats, completion racing a late negative heartbeat, an unresolved heartbeat wait, successful returns after worker cancellation, and four cancellation/persistence failures. Their failed receipts remain in the agent handoffs. The first admission route run also exposed a cached-config test setup error; only that test setup was corrected. Source review found and corrected legacy token bypass, source replay validation, omitted policy fields, rejected-result cleanup, candidate starvation and visible deletion-request eligibility. Peer reviews acknowledged the final corrected source without rerunning tests.

[Admission](r07-admission-source-integration.json), [queue client](r08-worker-source-integration.json), [queue SQL](r08-sql-source-integration.json) and [stage integration](r09-r10-stage-source-integration.json) record exact released hashes and superseding deltas. Detailed author evidence is in the [admission](backend-analysis-admission.md), [runner](frontend-worker-fence.md), [queue SQL](runtime-lease-fence.md), [cancellation](backend-provider-cancellation.md), [stage callers](frontend-analysis-stage-fence.md) and [stage SQL](runtime-analysis-stage-fence.md) handoffs. The stage operator draft was added after the application gate; it received source/whitespace review only and was never executed. Its hash is recorded separately in stage integration.

## Remaining work

CR-R07 through CR-R10 remain PARTIAL. SQL has not been parsed, applied or executed. RPC doubles do not prove database transactions, privileges, races or real worker behavior. The configured project is not confirmed as an isolated global queue target. No global claim or expired-job sweep was run.

Before activation, verify the admitted SQL target and migrations, actual concurrency and complete producer cutover. Resolve deletion-request enqueue/write serialization and the new ledgers' restrictive foreign keys, retention, erasure and orphan cleanup. A visible deletion request now denies new fenced work; its phantom transaction race is still CR-R19 work. Bounded library shutdown does not kill ignored underlying work. Preserve any valid result committed before abort and implement/test terminal-job restart cleanup under CR-R11. Existing score withholding and all release requirements remain.

Next work should address those concrete recovery/privacy gaps and the remaining canonical correction and ATS tasks. Do not reopen this application gate without a changed source or a specific unresolved failure. Services remain free; Git publication and deployment remain stopped.
