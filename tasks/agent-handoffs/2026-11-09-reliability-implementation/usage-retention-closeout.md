# Usage preservation before content erasure

2026-11-15. **IMPLEMENTED AND VERIFIED LOCALLY AT SOURCE TIER. Full reliability and Native acceptance remain open.** Dirty main HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Same 64 parents: 2 VERIFIED, 39 PARTIAL, 23 PLANNED. No commit, push, deployment or feature activation occurred.

## Result

Deleting a resume could cascade through its AI run rows and remove known usage from an otherwise active account. The [forward migration](../../../supabase/migrations/20261115172527_owned_legacy_ai_usage_retention.sql) captures the final actual disappearing run set in the same transaction immediately before account or fully covered root erasure. Exact run IDs, original timestamps/months and validated counters survive content deletion. Different run IDs count separately even when their input hashes match. Every cascade child is enumerated before ownership/source validation; conflicts or skipped locks refuse the transaction.

All three classifications are retained. The shared reader adds only `legacy_unlinked` contributions, while A12/A13 typed usage remains authoritative. The legacy arbitrary-since reader preserves its original all-run semantics and exact original timestamps. Both compare coexisting live/retained records before excluding a duplicate. Cross-month link validation stays global; no compatibility row or R03 technical cost is charged twice. Existing typed unknown holds remain unchanged. Each integer counter is cast before addition, avoiding an intermediate integer overflow.

Capture preserves the actual first root/account clock and the exact 720-hour deadline. A tombstoned root with a missing or nonfinite retirement clock requires repair before a later account clock can be considered. Expiry is not a refund or permission to omit usage: an eligible due row fails closed pending the separate fold/purge protocol. No extended personal retention, anonymous aggregate or physical erasure is claimed.

[The strict exporter](../../../app/lib/server/owned-legacy-ai-usage-export.ts) validates eight metadata keys, seventeen record fields, exact UTC microseconds/months, bounded counters, causal IDs and deadline arithmetic. Owner export unconditionally adds `ownedLegacyAiUsageRetirements` as the thirteenth accounting collection and verifies its effective minimum deadline against the paired account disposition. It covers the full owner set across organizations, periods and flags, or refuses beyond 4,096 rows/32 MiB. Capture stays private and new export execution remains denied by default.

## Verification

The [fresh combined receipt](usage-retention-integrated-b7a05463-16fa-46f9-925f-f799f3bcf752.json) passes **820 tests across 24 affected files**, zero failures/skips, then full `npm run typecheck`, `npm run lint`, `npm run build` and `npm run build:worker`. [Root reconciliation](usage-retention-integrated-review.json) independently rehashes 931 inputs, all 20 allocated files, logs and both build artifacts. All five command groups are absent; session19100 is CLOSED exit0.

[Peer source review](peer-usage-retention.md) resolved normal A13 publication retirement through surviving typed proof, same-statement shared-reader integrity through a consumed MATERIALIZED stable validator, and the historical clock refusals. Final local row-variable renames avoid SQL alias ambiguity without a conflict override. Twenty-nine function pins, eight patch pre/post pairs and the actual profile digests match source text. [Root TypeScript AST review](usage-retention-historical-assertion-review.json) confirms all 476 old complete assertions in four historical source-test files remain byte-present.

Author source/Node receipts, earlier failures and earlier fingerprint packets are archived. Their counts are not added to the fresh 820. Node code and wire stayed unchanged through the final fingerprint corrections; the fresh Root run tests the current imports. The earlier 5,576-case checkpoint is historical for this changed candidate, not a fresh whole-suite pass.

Checks used pinned Node22.23.4, sealed empty HOME and OS network/root dotenv/Git-write denials. No database, actual provider, service, browser, compiler or OCR runtime ran. SQL remains unparsed/unexecuted; the [deferred verifier](../../../scripts/verify-owned-legacy-ai-usage.sql) is a privileged mutating rollback draft. Source hashing and fake RPCs do not prove actual database deletion, isolation, role behavior or concurrency. The broad unit/component and external `verify:ci` campaigns were not repeated for this bounded change.

## Required continuation

Close budget-off provider dispatch next: every paid-provider attempt needs technical reservation, independent of commercial pricing. Preserve saved results and honest deterministic/partial responses; do not mint a policy, enable flags or change prices.

Implement the full 720-hour identity-expiry/fold protocol, conservative unresolved holds, foreign-actor linkage, Auth/org disposal, old export cleanup, scheduling and the independent restore floor. New retained records are personal metadata and must join that closure. Historical missing records/clocks receive no guessed backfill. Actual Native transaction/race/performance tests, storage/restore checks, representative consumer validity, owner acceptance and release approval remain separate open gates. Deployment stays on HOLD and services remain commercially free.
