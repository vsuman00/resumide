# Build AI: testing handoff

Updated 2026-10-30, Asia/Kolkata. Worker `/root/aa7_sandbox`, TESTING; no subagents. [Coordinator](2026-10-30-build-ai-coordinator.md). Base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; uncommitted unrelated dirty work preserved.

Status: mocked engineering VERIFIED. The latest explicitly authorized smoke verifies minimal live structured capability; the earlier failed access receipts remain historical. Full provider-backed product behavior is not established by this smoke. Owner reuse decision was explicit; one 128-token-capped synthetic call returned HTTP 401 for configured gpt-6-luna, no retry/model/key changes. A later explicit owner request authorized one check with the updated existing credential; its result is recorded below. Further live requests require review.

Owned outputs: four build-assist unit files, existing loader expectation update in latex-service tests, tests/fixtures/build-assist.ts, e2e/build-assist.spec.ts, playwright.build-ai.config.ts, scripts/verify-build-ai.ts, test-only HTTP preload, four additive package scripts and new evidence. Production fixes stayed frontend/backend-owned.

Final root checks: source check PASS, focused 4 files / 88 tests PASS, canonical verify 131 files / 1,152 tests PASS including formatting/lint/types/web/worker builds. Controlled-provider browser 6/6 PASS in 36.8 seconds with managed Supabase and tested desktop/mobile Axe 0. No production egress override or real-provider browser call. The final narrow monthly empty-string guard is separately unit/root verified after the browser bundle; valid RPC behavior was unchanged.

Findings fixed: signed numeric protection, invalid monthly usage coercion, and source-edit/popover stale race. Testing fixture underscores were corrected. No assertions suppressed. Known rejected-output usage accounting and missing-usage behavior are covered.

Cleanup: 14 known synthetic owners/organizations; 19 actual buckets removed by 42 exact recorded keys. Exact auth/profile/membership/org/consent/audit/analysis-AI rows and key counts 0. Private env/ledger deleted, port 3110 stopped, owned compiler containers 0. Global metadata and earlier AA7 expired-counter caveat retained; no broad cleanup.

Evidence: [closeout](../../docs/evaluation/BUILD_AI_ENGINEERING_CLOSEOUT_20261030.md), [receipt](../../docs/evaluation/BUILD_AI_TEST_RECEIPT_20261030.json), [manifest](../../docs/evaluation/BUILD_AI_CODE_MANIFEST_20261030.json), immutable failed live receipt and synthetic review screenshot. Existing AA7/Build route receipts unchanged.

Coordinator owns canonical context, review and next action. Live credential repair/success, private-data use and formal privacy/security/accessibility/release acceptance remain separate; no further implementation or checks remain in this assignment.

## Updated-key live recheck, 2026-10-30 17:55 UTC

The owner reported providing a new key and explicitly requested live testing. One existing bounded public synthetic structured probe used the current configured environment and unchanged `gpt-6-luna` model. It again failed HTTP 401 (`authentication_or_access`) after 641 ms, with a 128-token output cap, zero retries and a 10-second timeout. No provider usage/token counters were returned; zero usage or cost is not inferred. No further live request, key write, model/provider change or private-document test occurred.

New evidence: [updated-key recheck receipt](../../docs/evaluation/BUILD_AI_LIVE_PROBE_RECHECK_20261030T175544Z.json). The original 401 receipt and prior engineering evidence remain unchanged. Live access and model capability remain failed/unverified pending owner review.

## Latest authorized live check, 2026-10-30 18:00 UTC

The owner explicitly requested another live test. Exactly one neutral synthetic structured request with the current configured credential and unchanged `gpt-6-luna` model passed in 1,872 ms. Reported usage was 72 input tokens and 15 output tokens (87 total). The existing 128-token output cap, zero retries and 10-second timeout were retained. No key/provider/model change or private-document use occurred, and no further request was made.

New evidence: [successful minimal live receipt](../../docs/evaluation/BUILD_AI_LIVE_PROBE_RECHECK_20261030T180033Z.json). Both earlier HTTP 401 receipts are unchanged. This establishes the tested minimal structured-response capability, not a complete live resume-authoring, factual-validity or release evaluation.
