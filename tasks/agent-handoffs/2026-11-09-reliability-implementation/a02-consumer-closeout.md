# Grouped original consumer: local implementation closeout

Status: **INTEGRATED / LOCAL SYNTHETIC VERIFIED; NATIVE ACCEPTANCE OPEN**, 2026-11-13. This closes the allocated server and UI consumer slice of CR-A02-S02 and extends CR-U01. It does not close either parent task or the reliability plan.

The tested candidate is dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with the exact backend and frontend files recorded in their integration manifests. Unrelated work is preserved. The coordinator managed separate backend and frontend worktrees and a read-only source reviewer under the [frozen consumer contract](a02-consumer-contract.json).

## Result

The canonical page now has a separate grouped first-import review. The server reads one owned source/revision snapshot, validates the actual evidence and derives all supported candidate groups with their values and exact source links. It returns no raw envelope to the browser. The page displays the relationships as unverified and lets the candidate preview up to 32 selected groups with an explicit output locale.

Saving requires a visible named relationship acknowledgement. This approves entry links only; facts remain unconfirmed. Fresh preview eligibility and permission to save are separate. Existing canonical imports, corrections, ordinary drafts, history and confirmation controls retain their behavior. The new writer remains revoked; the UI reports saving as unavailable under that policy.

Before an accepted manual save, the page retains the exact compact command in bounded tab storage for up to 30 minutes. The record contains identifiers and metadata, with no extracted values, tokens or actual checkbox acceptance. A lost response, new head or moved review capture does not rebase its source, captures, locale, hash or request key. Reload restores an unchecked manual retry. A matching receipt clears only that pending command and links to the saved version; an idempotent result is not described as the current head or a new mutation. Storage failure retains page-memory recovery with explicit limitations.

Editing and then reverting a selection or locale cannot revive an old preview. Persisted history restoration also requires a new preview submission. This reset does not erase a retained original retry.

The new form parser consumes one body with fatal UTF-8 decoding and a 16,384-byte encoded limit. It rejects unknown and duplicate decoded fields, duplicate nested JSON keys, excessive nesting/work and missing named acknowledgement. Legacy parsing is unchanged. The adapter constructs the frozen original once and submits one RPC; denied capability skips both operations. Malformed or ambiguous receipts retain the original retry without automatic resubmission.

## Verification

One fresh integrated gate passed **268 tests in seven files** on exact Node.js `v22.23.4`, followed by full `npm run typecheck`, `npm run lint`, `npm run build` and `npm run build:worker`. The environment used synthetic credentials, disabled dotenv and made no database, provider or Docker calls. Exec session `78797` completed with exit 0.

The affected files were the grouped repository, canonical route, grouped review component, existing canonical correction component, grouped command normalizer, correction repository and canonical SQL shape-reader tests. They include actual neutral evidence derivation, command preparation, construction, route parsing and DOM interactions with mocked storage. The simulated ambiguous-save case creates a head, returns an unusable receipt, reloads an unchecked original command and succeeds through one explicit idempotent retry.

Root independently rehashed all **737 inputs**, the complete log and both build artifacts, and confirmed all five owned process groups absent. All 47 generated client JavaScript bundles exclude the two grouped server RPC identifiers. The [gate receipt](a02-consumer-integrated-ea1b3c21-0909-47b5-88e4-62231e90750b.json), [log](a02-consumer-integrated-ea1b3c21-0909-47b5-88e4-62231e90750b.log) and [independent custody check](a02-consumer-integrated-review.json) record the exact source and outputs. This is an affected gate, not a fresh full-project or native browser campaign.

Original failures remain preserved. The backend packet retains narrowing/mock-type failures, the initial citation-prefix expectation error and formatting receipts. The UI packet retains the initial missing-review RED, the test router revalidation omission, test-only union narrowing and the real preview-revival RED. The reset fix passed its four affected DOM cases before the integrated gate; assertions and thresholds were preserved. Final source review found no remaining required issue and supersedes the earlier UI checkpoint that missed the reset sequence.

## Database source and remaining acceptance

The forward reader migration adds a service-only read RPC and a guarded 68-to-69 routine capability successor. It preserves every predecessor routine and existing table, column, foreign-key, trigger and ACL check, including writer denial. The externally pinned readiness successor is `c2098f91ee32e4035ff30dd5db71c4d7e95944cef24e4b137c8c489841edd5db`. The 16 MiB response bound preserves existing valid evidence-envelope admission. The rollback-only native verifier is prepared but was not run.

SQL remains **UNPARSED, UNAPPLIED and UNEXECUTED**. Hosted grants, feature flags, provider settings and dependencies were not changed. No staging, commit, push, deployment or publication occurred. `npm run verify:ci`, native browser/storage, transaction/ACL/parity/concurrency/cascade/restore checks and actual managed cutover were not run in this source/mock allocation. Existing CI includes database/browser and other side effects outside this allocation; its omission is explicit, not a passing claim. The existing hosted action question remains pending.

Next bounded implementation is immutable existing-head regrouping that preserves candidate edits and complete lineage. Native admission and complete consumer verification remain separate acceptance work. No authoritative score, calibration, representative-validity or proprietary ATS claim changed. The 64-task parent totals remain **2 VERIFIED / 35 PARTIAL / 27 PLANNED**. Services remain free; pricing and deployment stay on hold.

Source records: [backend integration and archived packet](a02-consumer-backend-integration.json), [frontend integration and archived packet](a02-consumer-frontend-integration.json), [backend handoff](backend-a02-grouped-original-consumer.md), [frontend handoff](frontend-a02-grouped-original-consumer.md), [retry privacy map](../../../docs/security/PRIVACY_DATA_MAP.md#grouped-import-retry-metadata-2026-11-13).
