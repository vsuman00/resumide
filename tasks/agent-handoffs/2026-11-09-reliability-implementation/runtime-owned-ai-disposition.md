# Owned AI disposition export runtime handoff

Status: IMPLEMENTED / LOCAL SYNTHETIC VERIFIED; released to Root, with native and parent acceptance open. 2026-11-15 Asia/Kolkata. Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; dirty source preserved. Root owns CONTEXT, contracts, profiles and integration. The five implementation files below plus this handoff are the complete runtime allocation.

The new adapter implements the frozen six-string profile, nine-key readiness and four-key owner-wide export. It validates exact owner, typed composite operation identity, source/cause selectors, explicit unresolved repair rows, microsecond 720-hour own clocks and minimum account/root expiry. Missing historical clocks receive no new deadline. Bounds apply to the whole reply: 4,096 combined rows and 32 MiB. Metadata/data reads share one bounded deadline and AbortSignal, with no implicit pins, retry, truncation or fallback. Export capability does not imply candidate-access capability. Native complete selection, capture authority, immutable producer clocks and transaction behavior remain separate; returned empty arrays cannot independently prove Native completeness.

The privacy repository now unconditionally requires this export even with all feature flags off. It preserves the existing nine collections, `aiBudgetExportMetadata`, manifest version and API, adding `ownedAiDeletionDispositions` and `ownedAiOperationDispositions`. Tests include cross-organization records, original-period counters, unavailable/incomplete/repair/clock/overflow rejection and an actual repository timeout.

Verification retained under `/tmp/resumide-owned-ai-disposition-check-`:

- `vB6gVu`: actual missing-export RED; the repository returned a manifest despite denied disposition export. One assertion failed, 22 unrelated cases filtered without source skips. PG15037 closed; 892 stable inputs.
- `EwOpy5`: first 63 adapter tests pass; PG15641 closed, 894 stable inputs. Historical subset only.
- `9mmqRt`: final affected 153 tests across three files pass, zero failures/skips; PG17589 closed, 895 stable inputs. Its `tests.json`, log and receipt retain the exact tested hashes.
- `HMtETA`: typegen exited zero; TypeScript failed on nullable narrowing and the synthetic thenable signature. PG17631 was independently absent after transient immediate cleanup sampling; PG17639 closed. Failure remains preserved.
- `DhzZKg`: full TypeScript and scoped five-file lint pass; PG17908/17931 closed; 895 stable inputs. Corrections changed annotations only. `/tmp/resumide-disposition-typeonly-proof.json` proves byte-identical emitted JavaScript for adapter and test; behavior tests were not repeated. Root transferred adapter successor `f1acee9b...` to the access lane.

Pinned Node v22.23.4, sealed empty HOME/fake environment/private marker; supervisor outside Seatbelt for identity, children deny OS network, actual dotenv reads and Git writes. `/tmp/resumide-owned-ai-disposition-controller.mjs` retains 120-second stage limits, 8-MiB log cap, hashes, identities and cleanup. No SQL parsing/execution, DB, hosted/provider calls, actual keys/data, services, browser, PDF compiler, Docker, dependencies or workspace Git mutation occurred. Deployment stays STOP.

Actual backend profile `d5632c2a...` was a read-only dependency for these checks. Root installed actual-pin successor `28117a23...` after these checks for confirmed Native source repairs; the receipts retain their earlier bound candidate. Only profile constants changed. Root owns final synchronization and the single combined full gate. No author full-suite or builds ran here. `/tmp/resumide-owned-ai-disposition-release.json` binds exact release/preimages, dependency, logs, failed receipts, proof and independently absent groups.

| Source                                           | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/owned-ai-disposition-export.ts`  | `f1acee9bd962b00d4bbe78712149a7c429fb7a2514e8f0a667ec2c86bbdb8c3c` |
| `app/lib/server/privacy-worker.ts`               | `5cb95e132e2a0b3c6a819f0a214d03fc75edcc43cde009b8019c56ffcb4be6bd` |
| `tests/unit/owned-ai-disposition-export.test.ts` | `d85cf4eaa9c0e11f16d9896dd137431c2bddd17fc4e634c1676ecae1364d7901` |
| `tests/unit/owned-ai-privacy-export.test.ts`     | `06a1f8164bbd86ba12074268be445c9f5f2e285109055683494cb6ba746deaee` |
| `tests/unit/privacy-operations.test.ts`          | `94b7f08ac58af0f1afd287f26037dcef41a895038bf9cd6fef070b98a0cad564` |
