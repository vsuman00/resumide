# Build AI assistance: engineering closeout

Status: mocked engineering VERIFIED; live provider integration FAILED/UNVERIFIED, 2026-10-30. Default-off flags and formal release/privacy/security/accessibility gates remain unchanged. The owner authorized reuse of the configured key; no key or model was changed.

## Live evidence

Exactly one public synthetic structured request used the configured `gpt-6-luna` model, a 128-token output cap, no retries and a 10-second timeout. It returned HTTP 401 after 625 ms. [The immutable safe receipt](BUILD_AI_LIVE_PROBE_20261030.json) contains only status metadata. No second live call occurred. This does not establish live generation, model capability or working credentials. The owner will repair credentials separately.

## Verified engineering behavior

[The test receipt](BUILD_AI_TEST_RECEIPT_20261030.json) and [source manifest](BUILD_AI_CODE_MANIFEST_20261030.json) identify the uncommitted candidate on base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, preserving unrelated dirty work.

| Check                             | Result                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run test:build-ai`           | 4 files / 88 tests PASS                                                                 |
| `npm run check:build-ai:source`   | Formatting and lint PASS                                                                |
| Final root `npm run verify`       | 131 files / 1,152 tests; format/lint/types/web/worker builds PASS                       |
| Controlled-provider browser suite | 6/6 PASS in 36.8 seconds; tested desktop/mobile popup Axe checks report zero violations |

Tests cover exact UTF-8 hashes and CRLF ranges, bounded selected/nearby context, strict consent/version/selection validation, authentication/Origin/default-off gates, membership ownership, independent user/global/month admission, malformed monthly usage, cancellation/concurrency, strict response validation, unsafe TeX, protected signed numbers/currency/units/emails/URLs, candidate confirmation, stale apply and exact undo. Known provider usage is counted once, including refused/malformed results; absent usage is not fabricated and invalid counts are rejected.

Actual browser tests run the production application path with managed Supabase fixtures and a separate test-only HTTP preload. The preload accepts only a fixed dummy key, intercepts the official provider endpoint and rejects unexpected/full-source payloads, far-context canaries, tools or invalid generation options. Production code has no test bypass or custom provider egress. No controlled-browser request reached the live model.

The six cases verify hover/selection disclosure without requests; real PDF state followed by explicit review/apply/undo and PDF invalidation; unverified resume drafts requiring confirmation; unsafe proposals/questions withheld as advice; malformed/refused output; stale edits, cancellation, mobile positioning and the SDK timeout. [The review screenshot](build-ai-review-20261030.png) contains synthetic source and a mocked suggestion only. A final narrow monthly empty-string guard was covered by focused units and root verification after the browser build; the valid managed-RPC browser path was unchanged.

## Findings and interpretation

Testing reproduced a signed-metric preservation failure and an empty monthly-usage string being coerced to zero; backend fixes now pass regression tests. A pending request's popup could reopen after source replacement; the frontend now dismisses/aborts synchronously and rejects stale/collapsed selection events. Assertions were retained. An initial synthetic fixture had unescaped underscores and was corrected before the real compilation case passed.

Resume drafts are not fact-verified or canonical. Protected-token checks and candidate confirmation do not establish semantic truth. Monthly control combines existing analysis usage with a conservative 25,000-token request reservation; failed requests retain reservations. This is a bounded request quota, not a unified atomic credit/billing guarantee.

## Cleanup and omissions

Across all attempts, 14 recorded synthetic accounts/organizations were cleaned up. Exact SQL removed 19 existing buckets from 42 recorded user/month/compiler keys; auth/profile/membership/organization/consent/audit/analysis-AI rows and all exact keys were verified absent. Private credentials/ledger were deleted, port 3110 stopped and owned compiler containers are absent. Existing global counters and the earlier AA7 expired-metadata caveat remain; no broad deletion occurred.

No real documents, Docker database, hosted migrations/reset, provider switch, new credential, deployment, commit or publication occurred. Compiler image/security/benchmark evidence remains unchanged and was not rerun. No `verify:ci`, broad managed database/browser drills, compiler CVE scan, formal assistive-technology acceptance or release activation is claimed. Earlier AA7 and Build route receipts remain historical and unchanged.
