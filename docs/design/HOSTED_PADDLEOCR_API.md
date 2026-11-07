# Hosted PaddleOCR API integration

Status: **PARTIAL: provider boundary and local admission ledger implemented; production integration pending**

Owner direction, 2026-10-18: implement hosted PaddleOCR without local inference or model installation. The owner selected mocked API responses for this step. No live provider request, private document upload, account entitlement, spend, deployment or production activation is verified or implied.

## Implemented contract

`app/lib/server/ocr/paddle-extraction.ts` runs the existing native PDF parser first, with byte, page, character and overall time bounds. `paddle.ts` calls the hosted API only for pages below the existing usable-text routing threshold. Native page text is retained separately and unchanged. The adapter does not replace ordinary extraction results or call scoring persistence.

The HTTP contract follows the [official TypeScript SDK](https://www.paddleocr.ai/main/en/version3.x/inference_deployment/serving/paddleocr_official_api/typescript.html) and its [HTTP implementation at commit dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf](https://github.com/PaddlePaddle/PaddleOCR/blob/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf/api_sdk/typescript/src/internal/http.ts). Native Node.js fetch, FormData and Blob avoid an additional package. No PaddleOCR inference package, model weights or hardware runtime is installed.

- Fixed API origin: `https://paddleocr.aistudio-app.com`; fixed model alias: `PP-OCRv6`. This does not pin hosted model weights.
- Multipart PDF upload to `POST /api/v2/ocr/jobs`, Bearer authentication, bounded status polling and a separate unauthenticated JSONL result download.
- One selected original page per job using `pageRanges`. Exactly one returned page is required for that job. Missing, extra or malformed records fail closed. Sparse original page numbers remain bound locally.
- **The complete PDF is uploaded for every selected-page job.** `pageRanges` selects processing output; it does not redact uploaded bytes. The admission budget receives total repeated upload bytes and selected-page count.
- Redirects are refused. Result URLs require HTTPS, no user information, port or fragment, and an exact approved BOS hostname. The hostname list defaults empty; no guessed production hostname is supplied. Signed URLs and provider errors are not logged or returned.
- Requests, polling, response streams, UTF-8, character counts and selected pages are bounded. One submission is made per selected page with no automatic retries. Abort stops client requests; remote job cancellation or deletion is not claimed.

## Evidence and recovery

Output is a separate `paddle-review/1.0.0` engineering contract, **not** a persisted `evidence/2.0.0` envelope. It carries source checksum, owner, analysis and source IDs. Hosted provenance remains distinct from Tesseract's `local_ocr` evidence. Provider line confidence is tagged uncalibrated. Unicode code-point line offsets are calculated from exact returned text. Word geometry is not fabricated; page geometry is explicitly unavailable because no independently rendered page dimensions are bound to these PDF results.

Every outcome withholds scoring. Blank successful output is `insufficient`; nonempty successful output requires review. Model revision, physical region, provider retention and API fee remain unknown, represented as null. A published free allowance does not establish this account's entitlement or guarantee billing. No allowance is hardcoded.

Trusted callers must provide two durable operations. `admit` must atomically verify owner/source, consume a per-owner rate/page budget and reject duplicate or ambiguous attempts. `recordAttempt` must persist submission intent before upload, acknowledgment before polling, and completion. A failed write stops execution. Failure/cancellation outcomes retain acknowledged and ambiguous receipts, including receipts from earlier selected pages. A timeout cannot justify resubmitting an uncancellable remote job. The adapter checks source-bound, versioned whole-document consent and a matching disclosure policy reference; those arguments are not a substitute for obtaining consent from storage.

## Admission ledger (2026-10-29, local implementation)

The forward migration `supabase/migrations/20261029130000_paddle_ocr_admission.sql` adds service-only admission and attempt RPCs, owner-readable receipt tables, and a private per-owner page/byte budget bucket. `admit_paddle_ocr` binds the analysis, source version, owner, checksum, selected pages and total repeated upload bytes; duplicate or mismatched requests return null. It consumes the page/byte window atomically, so a rejected admission is rolled back with its budget increment. `record_paddle_ocr_attempt` appends at most one `submit_started`, `acknowledged` and `completed` event for each admitted page; duplicate, regressive or job-mismatched receipts are rejected. An interrupted submission therefore remains visible and cannot be automatically resubmitted.

`app/lib/server/ocr/paddle-admission.ts` provides the untrusted-caller store and validates the supplied budget. The adapter now includes the selected page numbers in its admission request. This code is not connected to upload, workers, scoring or UI. Budget values remain caller-supplied; no production quota, provider policy or consent text is implied.

Verification: the migration and `scripts/verify-paddle-admission.sql` pass from a clean disposable PostgreSQL 17 cluster. The verifier covers binding, duplicate/rollback, page/byte budgets, window reset, attempt transitions, RLS reads, denied client writes/RPCs, and cascade deletion. The full local suite passes 122 files / 958 tests; typecheck, lint, builds and the 25-test security suite pass. Supabase `test:db` was not run because Docker/local Supabase is unavailable, and the migration has not been applied to any hosted project.

## Remaining application integration

The existing production upload, worker, database and UI do **not** call this adapter. `PADDLEOCR_ENABLED` is an adapter guard and does not activate OCR in the application. Existing candidate uploads follow the current extraction behavior. The earlier local OCR contract and frozen acceptance data remain unchanged.

Before production wiring:

1. Establish the provider's actual region, retention/deletion, training use, account quota/billing and exact result hosts. Record an approved disclosure policy using verified facts.
2. Add optional, explicit whole-document PaddleOCR consent to upload and persist it atomically against the analysis/source. Existing `qualitative_ai` text-only consent is insufficient.
3. Wire the local admission/attempt ledger (schema and repository implemented 2026-10-29) into the trusted upload/worker path, with an approved per-owner page/byte budget. Do not auto-resubmit an interrupted or ambiguous POST.
4. Version hosted evidence reconciliation, persisted ownership/source validation, privacy export/deletion and candidate review together. Preserve native data and keep uncalibrated OCR unscored. Do not disguise hosted output as local evidence or use the legacy OCR success path into scoring.
5. Run a bounded synthetic live test when the owner requests it and credentials are configured. Representative OCR accuracy, calibration and release gates remain separate.

See the [mock verification report](../evaluation/PADDLEOCR_API_MOCK_IMPLEMENTATION_20261018.md).
