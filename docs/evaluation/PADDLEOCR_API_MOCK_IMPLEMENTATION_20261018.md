# PaddleOCR hosted API mock verification

Date: 2026-10-18, Asia/Kolkata. Base: `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the existing dirty checkout and this additive implementation.

Status: **PARTIAL integration; provider boundary implemented and mock-verified.** No live service, production workflow, OCR accuracy or free account entitlement is verified.

The owner requested hosted PaddleOCR with no local inference, then explicitly chose mocked API testing. All OCR HTTP tests inject synthetic responses. No AI Studio token is required for these tests; no resume is sent to PaddleOCR. Existing ignored environment credentials are preserved. The earlier GPT-6 Luna changes remain separate, uncommitted work.

## Changes

- Added server-only configuration with a disabled default, fixed API/model, empty credential/result-host/disclosure-policy defaults and bounded request/page/output limits.
- Added native-first PDF orchestration and a hosted OCR adapter that preserves native text, binds each singleton result to its original selected page, validates JSONL and marks all hosted text uncalibrated and scoring-ineligible.
- Added required admission and attempt-recording hooks. Intent is recorded before upload, acknowledgment before polling, and completion after validation. Failure outcomes retain job receipts and ambiguous submissions. The adapter never automatically retries uploads.
- Added an example configuration section and the [contract and rollout requirements](../design/HOSTED_PADDLEOCR_API.md). These variables alone do not enable OCR in the app. Production upload consent, worker admission/storage and versioned evidence/UI integration remain pending.

## Verification

The new test file first failed because the adapter module did not exist. The initial 33 checks passed after implementation. Review then identified missing failure receipts and PDF-header validation; both were added with regression coverage. A separate orchestration review identified a cancellation race that could discard hosted receipts; the native-phase deadline now ends before the adapter owns hosted cancellation, with a regression check.

Targeted command: `npm test -- tests/unit/ocr/paddle.test.ts tests/integration/paddle-api.test.ts`.

Result: **2 files / 60 tests pass**. Coverage includes multipart/auth/status/result contracts, fixed model, sparse pages, native-only zero egress, native preservation, real synthetic PDF parsing, checksum and actual page limits, owner/source/policy consent mismatch, denied admission, safe HTTP/auth/429 failures, untrusted URLs, response bounds, malformed JSON/UTF-8/confidence, character caps, deadline/cancellation, blank output, durable-write failure and retained completed/ambiguous receipts. The HTTP responses remain mocked even when the native PDF parser is real.

Typecheck passes after correction of a test mock's callback type. A lint failure in the initial test syntax and control-character regex was corrected without suppressions or changing acceptance checks. Targeted lint passes. The first integrated local run stopped at formatting drift in a new test; that drift was corrected. Final `npm run verify:ci` passes: **117 test files / 929 tests, all 56 browser checks**, formatting, lint, types, web/worker builds, signatures, secret/alert/container checks, load/restore, synthetic benchmarks and zero production dependency vulnerabilities. Log: `/tmp/resumide-paddle-verify-ci-final.log`. This is a local integrated result, not a new GitHub Actions run or live-provider check. Independent read-only review found no blocking issue in this bounded mocked slice.

## Limits

No new package, model download, local inference service, hosted migration, Vercel change, production flag change or live OCR request occurred. No new browser behavior exists in this slice; existing browser regression checks exercise the current application only. Mocks establish transport and failure handling, not provider availability, transcription quality, latency, billing, region, retention, cancellation/deletion guarantees or model access. The app still needs the application integration described in the design note before scanned uploads can use PaddleOCR.
