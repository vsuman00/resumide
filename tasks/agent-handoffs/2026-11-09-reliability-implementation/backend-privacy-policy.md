# R19: withdrawn deletion access policy

2026-11-10. Local application repair over Root's 696 synchronized nonsecret inputs at main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty work. Backend owns the five source files below and this handoff. Frontend owns the tests, pure shared policy and privacy action/UI boundary; runtime owns privacy-barrier/recovery SQL. No hosted database, provider, Docker, browser, real-document, credential or Git operation occurred.

| File | SHA-256 |
| --- | --- |
| `app/lib/server/canonical-repository.ts` | `5d2e1e60121929dbace999e0d41c5fc37383495aeb418567f41e862dd6e4458f` |
| `app/lib/server/job-requirement-repository.ts` | `360ee4e0e37b0cb2be3e6ded0cdd6ea10e43015374d28b24196fc280d609d7f9` |
| `app/routes/api.privacy-export.ts` | `2006369e584ace8cfe403d815690d63b5c77a8cd05231f95c9af0aeeae4f4e6a` |
| `app/lib/server/privacy-deletion-policy.ts` | `11712faf49968fa23880fd9a131aa41883a4e404916fc86a3c116296d354c571` |
| `app/lib/server/privacy.ts` | `9a5c3fc1af3a61a4c1105f32f8f4d7e1c89153f4dc62e3ecd756dcded9b24943` |

Root approved `cancelled` as a successfully withdrawn, previously queued request. Like `failed`, it no longer blocks otherwise valid access. Queued, processing, completed and unknown status strings remain blocking. The inactive tuple comes from frontend's pure `app/lib/privacy-deletion.ts`, exact dependency SHA `05701eb4d929467edde903a7e8deb8f9b445c193f6ee1a2090afaa6080e70626`, copied with its author's permission and left unchanged.

The server helper applies both inactive-status exclusions to the mutable PostgREST builder. The installed SDK implementation was checked: `neq` appends its URL filter and returns the same builder. Callers retain their concrete query/result type. An initial generic fluent-return interface caused excessive TypeScript type instantiation; the finite typed `neq` capability/void return resolves it without `any`, suppressions or behavior fallback. This was a static implementation failure, not a product test failure.

The common result classifier returns clear only for `error === null` and an empty array. Nonempty arrays block; malformed/null/non-array results or query errors are unavailable. Canonical and JD repositories retain owner/organization/source checks and their existing unavailable/not-found behavior. Export keeps authentication, both pre/post-manifest checks, safe errors, no-store and download semantics.

Privacy creation/cancellation maps only SQL lock contention `55P03` to safe `PublicApiError` status 503, retryable true, with no raw SQL message/cause. Cancel remains conditional on the exact owner and queued status. Frontend owns delivery of that service error through the privacy action's HTTP/data boundary; this module change alone is not HTTP proof.

Frontend captured real regressions before source changes: export returned 404 for a cancelled request (one failed/16 passed). Its repository tests then found four failures/eight passes: cancelled requests incorrectly denied canonical/JD access, and malformed null deletion results incorrectly allowed it. Existing active/unknown-state, foreign-owner and query-error controls passed. Those failed receipts remain in the frontend's private R19 evidence directory. Backend did not repeat or edit its tests.

Backend scoped ESLint/Prettier passes. Project-options no-emit TypeScript reports zero diagnostics across 394 files/seven roots. Root owns combined verification after the independent test packet. SQL remains unexecuted; no flag, retention period, erasure rule, Auth deletion, ledger deletion or production activation is added here. This is one R19 application-policy slice, not complete privacy, enqueue/write race, backup/restore or release acceptance.
