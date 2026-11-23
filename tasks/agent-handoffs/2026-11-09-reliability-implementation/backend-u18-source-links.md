# U18 confirmed source-link replacement

Updated 2026-11-11, Asia/Kolkata. Backend owns the five files in [Root's allocation](u18-backend-baseline.json), based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty prerequisites in the existing `reliability-20261109-backend` worktree. Root synchronized nine prior U03 files before this task; none was edited here. Implementation is complete for this bounded source repair. Root integration and native consumer acceptance remain open; CR-U18 is not fully accepted by this record.

The initial real regression reproduced the actual defect: `loadArtifactPreview` rejected an explicitly edited and separately confirmed email because its original PDF retained the old mailto annotation. The test used a neutral synthetic PDF and the real source-link guard; only owned storage/version reads were mocked. `confirmed-email-red.json/log` preserve the failure on unchanged production hashes `1fbc9cd2` and `f2602349`. The renderer was not called by this preview regression.

The guard now derives a narrow replacement proof from the exact current canonical document, its render plan and owned immutable parent records. The current safe email/link must be actually represented under the same fact identity, exactly confirmed by its owner and cleared of the old citations. Source bytes must match the current input hash. Every parent must have the expected ID, immediately preceding revision, same stable fact/type and the same owner, organization, resume, analysis, source object, source hash, evidence attempt and retention policy. The nearest cited origin supplies the old safe target. Missing identities, changed types or a nearer cited origin cannot be bridged by searching farther back for a convenient URL.

The walk admits at most 64 ancestors, 2 MiB of canonical JSON and 20,000 facts. An origin outside these bounds remains blocked. The repository supplies only existing owned `loadCanonical` reads, with the original analysis/owner and exact parent version; there is no boolean bypass or caller-supplied target exception list. Citation authority remains the existing validated immutable canonical storage boundary. Annotation metadata is never promoted into candidate facts, fetched, logged or returned. No new ledger table, migration or mandatory unapplied A04 dependency was introduced.

Unsafe or unexplained annotations still deny the whole export. A mismatched current plan, source bytes, confirmation or lineage binding also denies. When all source links are already represented, the original path performs no ancestry reads. Restoring an older version renders its selected old link without reapplying later corrections. Existing source-download/hash checks and pre-render/current-head/post-render ownership and content checks remain unchanged.

## Verification and preserved attempts

All receipts below are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-u18-source-links-u2aycrw4`. The private runner uses Node22.23.4, a sealed synthetic environment without dotenv/live credentials, a 60-second deadline and an 8 MiB log cap. It records process identity, verifies owned process-group cleanup and compares 698 nonsecret source inputs before/after each command. Every completed receipt reports no source drift and confirmed cleanup. No broad U03/A04 gate was repeated.

| Receipt                                | Actual result                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirmed-email-red.json`             | One failed actual preview regression; five filter-unselected. Original defect reproduced before production edits.                                                      |
| `affected-first.json`                  | 34/35 passed. One new unsafe-email fixture incorrectly assumed mailto query strings were forbidden by the existing link contract.                                      |
| `affected-corrected.json`              | 35/35 passed across the two owned test files after replacing that fixture with an existing-contract forbidden control character. The same denial assertion remained.   |
| `types.json`                           | One optional-lineage narrowing diagnostic. The missing-lineage branch now returns the existing throwing failure; no cast or suppression.                               |
| `corrected-real-render.json`           | Only the two new PDF/DOCX cases ran, both passed; six filter-unselected. Real guard, actual repository renderer dispatch, local renderer workers and final parse-back. |
| `nearest-cited-origin.json`            | One requested safety regression passed; 29 filter-unselected. A nearer cited safe email blocks borrowing an older matching annotation. No production source changed.   |
| `types-final.json`                     | Zero diagnostics over six roots and 40 project source files.                                                                                                           |
| `lint-final.json`, `format-final.json` | Scoped ESLint and Prettier passed for all four owned code/test files. Focused `git diff --check` also passed.                                                          |

The 35-case receipt precedes the type-narrowing return and the test-only extraction of the shared email fixture. The final two-case receipt covers the frozen production source; Root owns the final combined artifact gate. A subsequent review added only the nearer-origin test and a fixture suffix. Its one-case run, scoped lint and formatting passed without repeating the 35 cases, actual-render cases or type check. These are 38 unique cases across receipts, not a claimed fresh 38-case run. The earlier `release.json` packet is preserved as historical; `release-final.json` records the renewed test/handoff hashes.

The two final cases drive `renderOwnedArtifact` through edit, separate confirmation, actual source-PDF checking, bounded lineage and real PDF/DOCX rendering. Each report is verified against the exact current version, content hash and actual artifact hash. Independently inspected PDF text/annotations and DOCX document text/relationships contain the corrected email and safe target, with the original mailto target absent. Final owned-current revalidation remains in the path. These are real local render bytes with mocked owned storage/version reads, not managed database transactions or native browser/customer acceptance.

## Frozen source packet

| File                                       | SHA256                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/artifact-source-links.ts`  | `1207c3f85f0a959465c90b377d11867a8dabb761a5ada632067e4fdb3e3ab573` |
| `app/lib/server/artifact-repository.ts`    | `6f46e7baf4665c4db1eaaad8f1ac8e144ac03be58fef32e167a4c0dc9c6cbbe3` |
| `tests/unit/artifact-source-links.test.ts` | `5d2e46927f374f7c015308776caa5102fd21b6a01c2235d4d74758007babc52a` |
| `tests/unit/artifact-repository.test.ts`   | `a04170e8bfc95bd5cec34825c42f359b52bf2ee488f1772c8a51b86eb2e845fe` |

Only the five allocated files changed. No SQL/schema, routes, renderer implementation or dependencies changed. No database, provider, Docker/LaTeX compiler, owner data, real environment, deployment or Git publication action ran. Root should review/integrate this exact five-file packet and run its affected artifact gate, then update canonical task evidence and `CONTEXT.md`. Managed ownership/deletion/source races, actual storage, native browser/export/restore, assistive technology and release acceptance remain separate open evidence tiers. Backend makes no ATS score or hiring-outcome claim.
