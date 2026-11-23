# Technical-budget caller source admission checkpoint

2026-11-15. **IMPLEMENTED AND VERIFIED LOCALLY AT SOURCE TIER. The full reliability goal remains active.** Dirty main HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. All 64 parent IDs/dependencies and their 2 VERIFIED/39 PARTIAL/23 PLANNED totals remain unchanged. No commit, push, deployment or activation occurred.

## Result

All five technical-budget reservation callers now use exact source admission. This scope includes budgeted requests; independent budget-off provider branches remain a required repair. [The shared client](../../../app/lib/server/ai-budget-source.ts) keeps the strict budget receipt and legacy rewrite input/OP2 bytes, adds four v2 source variants and refuses generic reservation fallback.

| Caller | Source and identity |
| --- | --- |
| Legacy rewrite | Existing source-inclusive OP2 and v1 input remain unchanged; every retained OP1 collision blocks redispatch. |
| Legacy qualitative | Actual selected analysis/version/root, server-created analysis UUID; existing unregistered ledger rows cannot be adopted from ID equality alone. |
| Canonical rewrite, A12 | Source-inclusive technical ID separates the globally keyed ledger from the unchanged scoped public operation ID. Any retained old raw-ID collision refuses new admission. |
| Initial feedback, A13 | Server operation ID remains; exact prepared attempt, lease, policy and typed once/consent claim remain mandatory. |
| Build | Explicit account-only identity; analysis/root/version are NULL. No resume parent or per-request expiry is invented. |

The [forward migration](../../../supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql) atomically registers/reserves, proves current source on fresh admission and preserves late settlement, unknown holds and original-period accounting. Public generic reserve/next/claim cannot bypass typed A12/A13 authority. An exclusive nonblocking owner lock holds classification through transition; typed claims invoke the private technical transition after their own checks and before marking dispatch. No caller Boolean or GUC supplies authority.

[Owner export](../../../app/lib/server/ai-budget-source-export.ts) now uses strict v2 tagged rows and preserves the existing twelfth accounting collection with exact ledger linkage. It remains bounded to the complete owner set or refusal at 4,096 rows/32 MiB. Capture uses actual selectors and the original minimum retirement/account clock. Metadata fingerprints are current; existing generic service grants are distinct from the denied new source/owned-data grants. No grant or flag change activates providers.

Upgrade checks lock the relevant tables and require the old sealed schema before any ALTER. The new seal fingerprints the old closed trigger, excluding only its own bootstrap trigger. These changes resolve the two catalogue findings. Old sealed metadata and stored policy JSON remain unchanged.

## Verification

[Root reconciliation](ai-callers-integrated-review.json) covers **5,576 unique passing cases across 275 unit/component files over two receipts**. This is not a fresh single-run whole-suite pass:

- The [first broad receipt](ai-callers-integrated-bcbb73e2-209a-44e0-a91c-a5ceec86b77d.json) recorded 5,561 passes and eleven failures across 274 files, zero skips, on 926 stable inputs. It stopped before neutral lifecycle/statics/build stages. All failures came from three old consumer fixtures.
- The 271 completely passing files supply 5,509 carried cases. Every production/profile input remains identical. Only the three fixture files changed: actual selected version, current metadata, new reserve wire and genuine RPC events. Status/recovery, SDK counts, accounting, cancellation and ordinal assertions remain.
- The [final receipt](ai-callers-followup-5724c27e-175d-4afb-bafd-994332480162.json) passes 67 fresh cases in four files: 64 fixture cases, including all 63 originals and one new generic-absence control, plus the three unchanged neutral process cases. It also passes full `npm run typecheck`, `npm run lint`, `npm run build` and `npm run build:worker`. No failures or skips remain in the verified current case set.

Root independently rehashed 930 inputs, all 37 allocated files, both build artifacts, logs and structured test reports; all six final command groups and the original failed group are absent. Sessions15227 and29420 are CLOSED. [The carry proof](ai-callers-integrated-review.json) requires disjoint file sets and exact unchanged inputs. [Independent TypeScript AST review](ai-callers-historical-assertion-review.json) confirms all 430 old full expect calls in six historical source-test files remain byte-present. Source/policy goldens and failed author/Root receipts are retained.

[Main peer review](peer-ai-callers.md) independently resolves all 48 function pins, 20 patch pre/post pairs and 37 digest values across six profiles. [Fixture peer review](peer-ai-callers-followup.md) confirms the three repairs preserve assertion intent without fake generic events or production profile mocks. Peer review did not execute tests or Native SQL.

Checks used pinned Node22.23.4, sealed empty HOME and OS network/root dotenv/Git-write denials. The sole existing neutral process-fixture exception runs its SHA-pinned three cases in plain sealed HOME because Seatbelt denies ps; its Git work is disposable and outside the workspace. All other commands retain OS isolation. No application services, provider, database, browser, compiler or OCR runtime ran. Integration/native tests and external stages of `verify:ci` were not run.

## Required continuation

SQL and the [privileged mutating rollback verifier](../../../scripts/verify-ai-budget-source.sql) remain unparsed/unexecuted. Actual catalogue/role/transaction/race/restore behavior is not proved by textual hashing, TypeScript checks or fake RPCs. Default-off flags and denied data execution remain in place.

Next, preserve original UTC-month shared usage **before content deletion** and close independent budget-off provider admission. Current surviving unlinked legacy run rows can still disappear from quota reads; this checkpoint does not fix that. Preserve global cross-month A12/A13 link exclusions so compatibility rows are not counted twice, and retain unresolved exposure without refunds. Full 720-hour expiry, foreign-actor linkage, Auth/org disposal, old exports, physical object deletion, scheduling and the independent restore floor remain required. Representative consumer validity, owner acceptance and release approval are separate open gates. Source registrations remain personal metadata; no purge or permanent anonymous tombstone is claimed.
