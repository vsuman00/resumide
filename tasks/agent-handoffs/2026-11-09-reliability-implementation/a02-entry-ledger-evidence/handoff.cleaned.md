# A02 entry-association ledger and privacy foundation

2026-11-13, Asia/Kolkata. Runtime worktree, detached at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with preserved unrelated dirty work. Root contract `a7b80e65` and allocation `426028dd` authorize these five files only. Root owns integration, shared context, admission, flags and native authorization.

## Implemented source

The forward migration defines five immutable metadata stores for approval batches, ordered groups/members, snapshot headers and whole-group links. Scoped FKs, deferred origin-result/fact references, RLS, denied application-role access and existing R19 privacy guards preserve ownership and deletion boundaries. Removed raw-base entry IDs are metadata, with no invented persisted-parent FK.

Private helpers validate complete bounded batch prefixes, original command bytes/content proof and normalized source/member mappings. Source order and final entry order remain separate. Snapshots retain historical origin proof after active links disappear. Active groups require the complete entry membership/bullets, unique placement and exact member type/value/ordered sources. Confirmation alone preserves links; changes to entry composition invalidate the whole group. Rollback copies the TARGET snapshot or an explicit legacy-empty marker.

The stable workspace export retains its existing canonical/JD/authoring fields and 32 MiB cap, adding all five C02 and five association metadata arrays in the same SQL snapshot. Its exact predecessor body, attributes and grants are guarded. The worker requires all ten arrays, preserves each metadata row's fields and rejects malformed, missing or foreign-owned rows with the existing safe error.

The initial storage-command check was corrected after cross-lane review to bind the full distinct five-key inner command and the typed version idempotency key. Five R19 table guards were added. The original coherent `24ddf418` source remains in the private packet. Final production SQL is `756121cb`; no shared shape, public writer, repository or route was changed.

## Verification

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-ledger-foundation-1kt8neqw` (directory mode 0700).

The actual existing RPC consumer failed before the worker edit: a nonempty owned metadata array became `undefined` in the manifest. `red.json`/`red.log` preserve one expected failure, with 11 original tests unselected. This was not a missing-import failure. The RED receipt binds 707 inputs.

`focused-final.json` records **34 tests passed in one file**: 32 consumer cases and two explicitly labelled SQL source/reference checks. All original 11-test suite bytes remain exact. The existing complete-response fixture helper adds required empty metadata arrays; no production default or original assertion was added or removed.

`types.json` records two roots, ten project source files and zero diagnostics. `lint.json` and `format.json` pass. Each final command binds 708 unchanged inputs. All 704 nonowned old source inputs remain unchanged. All checks used sealed Node 22.23.4 fake configuration with dotenv disabled; no live credentials were loaded.

`format-write.json` preserves an intentional formatting step: the formatter exited zero, while the harness marked source drift for its two owned writes. The later immutable checks pass. Earlier RED and formatting receipts remain preserved. Root and frontend source review passed; frontend independently matched final hashes and RED/GREEN logs.

The rollback-only verifier is **UNPARSED / UNAPPLIED / UNEXECUTED**. Its privileged synthetic fixture declares ordered-member refusal, independent active-group add/edit invalidation, confirmation/rename preservation, TARGET and legacy-empty restore, owner export, grants and cascades. These are deferred native checks, not executed results or actual public-writer/C02-add coverage.

## Limits and handoff

No SQL parser, database, provider, services, browser, Docker, environment mutation, dependency change, Git mutation, full build or broad unchanged test campaign ran. No activation or durable customer approval is established. Native constraints, transactions, concurrency, restore/export/cleanup, actual writer/consumer and release acceptance remain open. Root integrates this foundation before the separate admission/profile migration and runs the combined gate.

| Source | SHA256 |
| --- | --- |
| `20261113130533_grouped_original_atomic_import.sql` | `756121cbcf403e92da699b42ead62af15759a057486f588bb84525f579fa084d` |
| `privacy-worker.ts` | `a75d225f74389156acd26c5c13fea6acae7e8362f8f52f3755b8f529cd56e67a` |
| `privacy-operations.test.ts` | `d7f8cac81a3f5fe044d7d725ff2f50adf315cc1ec76ef837045febf852c80d4b` |
| `verify-entry-association-ledger.sql` | `e77c13b1cc5fe761e8e0d926e4eca8821c189adc6b8dfa32c17321a78fccc23b` |
