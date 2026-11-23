# Usage retention peer review

2026-11-15. **SOURCE ACK for the bounded original-month conservation leaf. No unresolved finding remains within this allocation.** Supplied base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with synchronized dirty source. Product files were read only; this handoff is the reviewer's only workspace write. No peer tests, compiler, SQL parser/execution, database, provider, services, actual environment or Git operation ran.

The frozen [contract](usage-retention-contract.json), version 1.0.1, has SHA `3c86b48b78738ba0f67f5b3daed66f010b20f3758ea31426d5b906a873a40c19`. It preserves known run contributions before content deletion. Full purge, deadline enforcement and budget-off provider admission remain separate work.

## Conservation and capture

The actual source bug is a run under retired root A disappearing through the parent cascade, reducing usage read from still-live root B. `private.owned_legacy_ai_usage_retirements` retains the real run ID, source/owner/org, original creation timestamp/month, known counters, class and original deletion clock before that cascade. It stores no invented ordinary NULL-usage run: the source counters are NOT NULL integers with nonnegative CHECKs. Invalid counters/source/classification refuse capture instead of becoming zero or a refund.

Both producer hooks are inside their existing transactions. Account preparation captures after operation/disposition clocks and before publication retirement or analyses deletion. Final R17 completion captures inside exact object coverage immediately before publication retirement/root deletion; terminal replay returns before capture. Final enumeration covers late runs written by already-dispatched work. A capture failure rolls back content deletion too.

Capture enumerates every analysis/run beneath the affected roots or owned analyses, then validates ownership and source. It does not hide malformed foreign children behind owner filters. It counts root/version/analysis/run locks and refuses `SKIP LOCKED` omissions. Parent `FOR UPDATE` and the exclusive owner domain prevent the final-delete window from admitting an uncaptured child or rebinding its counters. This is source-level ordering, not a proved Native race result. No total-history cap is added to R17; actual resource/performance acceptance remains open.

Dedup uses actual `run_id`, not an input hash. Existing copies must match the full immutable source/counter/class/clock tuple. Distinct runs with identical hashes remain separate contributions. Reader integrity checks include either side's organization before month or `since` filtering, so moved live timestamps/organizations cannot hide a conflicting retained copy. A matching live/retained pair is counted once; a retained row contributes only after its live run is absent.

## Reader semantics

- The legacy bigint reader preserves arbitrary finite `p_since` and all three historical known-run classes by exact `run_created_at`. Each counter is cast to numeric before addition. NULL/nonfinite arguments, invalid data and bigint overflow refuse instead of returning capacity.
- Shared usage retains its 13-field wire and globally validated all-month A12/A13 partition. Only retained `legacy_unlinked` rows add to `legacyUnlinkedTokens`, in the original run's UTC month. Linked compatibility rows are not debited again; typed usage keeps its existing claim-month authority. R03 technical accounting is not an extra shared-quota component. Typed unknown claims/holds remain unchanged.
- Missing raw linked runs require surviving exact typed usage/source/counter authority. A12 missing/NULL/conflicting usage refuses. A13 accepts the actual retirement plus published operation/attempt proof after the old publication is deleted. It does not require that deleted publication to remain live.
- Eligible due retained rows cause refusal; expiry is not a quota filter/refund. This covers the 31-day-month case where 720 hours precede period end. The shared reader consumes a STABLE month/integrity validator in a MATERIALIZED CTE inside its final accounting statement. `CROSS JOIN` plus the `proved` predicate consumes the result. False/NULL selects no result and reaches the existing unavailable gate, rather than a zero total. The legacy reader is STABLE.

The known root/account minimum supplies `prepared_at`; stored expiry is exactly 720 hours later, and effective expiry also respects the account deadline. Final capture refuses a tombstoned root without its proved first clock and any selected nonfinite root clock **before** account fallback. It never restarts the deadline at capture, completion or a later account request. Late run creation after the first clock is allowed. Current account dispositions have finite NOT NULL prepared clocks and phase `prepared`; repair-required clocks belong to operation dispositions. No unsupported account-repair fields were invented.

## Export and metadata

The new owner export has the frozen eight-key metadata and 17-key records. It reads the whole owner set across organizations/periods/flags, or refuses more than 4,096 rows/32 MiB. Node validates canonical IDs, known counter strings through 2,147,483,647, exact UTC microseconds, original month, selectors, duplicates and 720-hour arithmetic. One maximum five-second elapsed-clock/abort deadline covers metadata and export; no fallback exists.

The privacy worker unconditionally performs the fifth accounting read and publishes the thirteenth collection, `ownedLegacyAiUsageRetirements`, preserving the previous twelve collections and source-to-ledger join. It verifies the exact paired account minimum. Account-cause rows additionally require the matching account, first request and prepared clock; an absent account cannot be treated as infinity. The multiple RPCs are not an atomic owner snapshot, and inconsistent closure refuses publication.

The migration locks predecessor relations and checks the old sealed readiness before bootstrap. Its new metadata-only seal covers actual schema/constraints/indexes/triggers, including its own schema; only its new closed trigger is omitted during bootstrap and checked explicitly afterward. Old seals are not resealed. New tables are private/RLS with no cascading FK; helpers are service-denied. Only metadata gets a new service EXECUTE grant. New data export remains denied; existing generic grants and flags are unchanged.

## Resolved findings

1. The first A13 validator required a live publication/classifier result after normal retirement had deleted that publication and raw run. The final validator accepts exact surviving retirement/operation/published-attempt authority; unlinked records also reject a retirement reference.
2. Shared validation originally ran in a separate command before a VOLATILE reader's sum. The consumed MATERIALIZED validator now shares the accounting statement snapshot, closing the counter/org/time rebinding interval identified in source review. No ordinary authenticated UPDATE exploit was claimed.
3. Account fallback could create a later first cause for an already-deleted root whose original retirement clock was missing. The final branch refuses that repair case before fallback. The same branch now refuses a present nonfinite root clock rather than bypassing it in favor of the finite account clock.

## Exact final inputs and evidence

The first five paths are in the backend worktree; the last two are in the runtime worktree. Final hashes were stable across their final review snapshots.

| Path | SHA256 |
| --- | --- |
| `supabase/migrations/20261115172527_owned_legacy_ai_usage_retention.sql` | `ed5bb7aaaab792db195af8f7a389d107207165c34f8041b1866746bd76393ae4` |
| `app/lib/server/owned-legacy-ai-usage-profile.ts` | `837172b4f944bf374cc695d2b2dfb99e8fe845d4446e79e34a2be0bddf00da8c` |
| `app/lib/server/initial-feedback-profile.ts` | `a7ced570ef5341cefdb67b42ce83fee844b9d6150b141469c639f64fc80fae55` |
| `app/lib/server/ai-budget-source-profile.ts` | `b2de20c04cddb06349f086912a6517a9da32b8f66e4090537013661319a19328` |
| `app/lib/server/owned-ai-disposition-profile.ts` | `d3af45bf0637475066edf69bbf8926852577cceb7ced9b8bd2d2dba60f3d21ad` |
| `app/lib/server/owned-legacy-ai-usage-export.ts` | `9e9b229bc882c2f5bfd8af5b6682dbe5c3262e6f010e4f1a690bc26bff819c76` |
| `app/lib/server/privacy-worker.ts` | `bdbf4601d2afd52a001716de11ce71ae68a5e8aecfcf7e1ce31bfa20ea46d41c` |

Independent textual composition through historical substring, `changes` and full-body JSON manifests matches all 29 readiness pins, eight current pre/post pairs and 25 digest values in the four final profile files. This is source-text hashing, not SQL parsing, installed-catalog observation or Native acceptance. The peer ran no tests. Author reports/failed receipts remain separate; runtime's 201-case evidence preceded the final clock-only fingerprint changes. Root's final integrated gate supplies current-import/static evidence; no extra duplicate author consumer run is claimed.

The final narrow successor renames capture locals `root`/`v`/`a` to `locked_root`/`locked_version`/`locked_analysis` and export local `t` to `retired_row`, avoiding collisions with SQL aliases. No variable-conflict suppression is present. Reversing only those local-name substitutions and their dependent fingerprints reconstructs the exact previously reviewed migration SHA `4d0939f168b15851a8b9387030c73a3d537d7834e1a7f75fcf99715eb1c3bdac`. Its conservation, clock and snapshot findings remain resolved. Node product bytes and the feedback profile are unchanged. This successor received a narrow source ACK, not another general audit or a Native execution claim.

These retained IDs, clocks, counters and classifications remain personal metadata with an explicit maximum deadline. No anonymous aggregate, physical erasure, actual 720-hour purge or retention extension permission is established. Budget-off dispatch admission, aggregate folding/unknown-hold preservation at identity expiry, foreign actors, Auth/org, old artifacts, objects, scheduling and independent restore-floor closure remain required. Native roles, transactions, races, resource behavior, storage/restore, representative evidence, owner acceptance and release remain open. This ACK does not close the full reliability goal.
