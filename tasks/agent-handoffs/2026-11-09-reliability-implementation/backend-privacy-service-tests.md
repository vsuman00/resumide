# R19 service mapping test addendum

2026-11-10. Verification-only leaf. Backend changed only `tests/unit/privacy.test.ts`, SHA `f5648b20c2ef31ec83b291d3ebe4b2783ac505d5723424c127fefd80af72e4e6`, over original `a69bf35ffd6a96097d0181bd10849dda55b65c30f72ef81b0df4208f094df7d5`. The released application sources and `backend-privacy-policy.md` remain unchanged.

The two existing consent tests remain. Three added cases invoke the actual privacy service with Supabase doubles: creation/cancellation `55P03` maps to retryable `PublicApiError` 503 without raw error/cause; cancellation keeps exact request ID, owner and queued predicates; unknown SQL errors retain the fixed generic creation/cancellation failures. Failed mutations do not emit successful audit records. This closes the service-mapping seam separately from frontend action tests that inject a public service error.

One current-file Node22 Vitest run passes **5/5**, with private synthetic mode, disabled dotenv and fake credentials. Scoped formatting passes. No source replacement or artificial red run was used, and no frontend suite was repeated. Root owns integrated types/lint/build verification. No database, provider, Docker, browser, real-document or Git operation occurred; this is not executed SQL lock-contention evidence.
