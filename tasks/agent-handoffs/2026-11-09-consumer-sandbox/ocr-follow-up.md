# Independent local OCR runtime follow-up

Tested 2026-11-09 under the coordinator's explicit one-build/four-runtime-command allocation. This path uses the existing OCR worker and has no LaTeX image dependency. No application source, pinned dependency, configured flag, database or provider was changed.

## Image and commands

One unchanged `scripts/ocr-runtime` build succeeded on Docker `desktop-linux`, `linux/arm64`. The owned tag is `resumide-ocr:consumer-20261109`; its immutable image ID is `sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c`, size 370,411,848 bytes. It uses the recipe's pinned Debian Bookworm base, Tesseract 5.3.0, Poppler 22.12.0 and English fast/best models. Source/model/version checks remain unchanged.

The following existing commands ran serially under Node 22 with `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` and `AI_ENABLED=false`, supplying that exact digest:

1. `npm run test:ocr:local -- <digest>`: exit 0; real scanned/mixed recognition, native no-OCR control, observed resource/isolation settings, cancellation, timeout, malformed-PDF and exact cleanup checks.
2. `npm run test:ocr:local -- <digest> --text-fusion`: exit 0; the two-pass v4 profile also verifies two recognition calls per selected page and actual second-pass cancellation cleanup.
3. `npm run test:ocr:adverse -- <digest>`: exit 0; encrypted input safely returns engine failure. A 16,000,000-pixel source raster is downsampled to 2,103,750 rendered pixels and returns insufficient evidence, preserving native text and limits.
4. `npm run test:ocr:fields -- <digest>`: exit 0; nine normal-font development documents from three authored families yield 72 true-positive fields, zero false positives, zero false negatives and zero ungrounded predictions. These exact synthetic field checks do not establish representative accuracy or calibrated confidence.

The [runtime summary](ocr-runtime-summary.json), four command logs and [source binding](source-binding.json) preserve the actual results. No raw OCR text or raster/PDF assets were persisted by these commands. Container scratch was disposable; no owned OCR containers remained afterward. Unrelated Docker resources were untouched. The owned image/cache remain as approved worker artifacts.

## Retained quality failures

A green runtime exit is not a passed OCR accuracy gate. The original deliberately authored block-glyph smoke still reports `accuracyGate: not_passed`; its outputs remain review-required and scoring-ineligible.

| Profile        | Scanned errors / reference characters | Scanned CER | Mixed OCR-page errors / characters | Mixed CER |
| -------------- | ------------------------------------- | ----------- | ---------------------------------- | --------- |
| Legacy fast    | 13 / 76                               | 17.105%     | 17 / 204                           | 8.333%    |
| Text fusion v4 | 14 / 76                               | 18.421%     | 16 / 204                           | 7.843%    |

These are individual correlated synthetic smoke fixtures, not confidence intervals or an estimate of general resume accuracy. The earlier diagnostic report retains its original failed block-glyph thresholds. The October 18 normal-font synthetic repair results remain separate historical evidence; no locked calibration set was rerun or fitted during this follow-up. Human validation, representative validity and production activation are not supplied by these results.

## Consumer upload integration limitation

The actual local engine works in isolated tests. It is not the default consumer upload OCR path. `app/lib/server/document-extraction.ts` explicitly states that production callers supply no OCR adapter; `syntheticOcr` is an optional engineering-only injection. When native pages require OCR and no adapter is supplied, it returns unsupported OCR evidence. `processExtractionStage` calls it without that injection at `app/lib/server/extraction-stage.ts:296`. The legacy default OCR policy is disabled/not-approved as well. Successful standalone recognition therefore cannot be presented as automatic OCR for scanned consumer uploads.

## Exact-owned scanned upload case for coordinator review

This is a proposed additional integration test, not an executed database result from this agent. Use the configured authorized Supabase project/auth/admin/private-storage setup, a temporary synthetic owner, local `APP_ORIGIN`, `EVIDENCE_REVIEW_ENABLED=true`, `AI_ENABLED=false` and `BUILD_AI_ASSIST_ENABLED=false`. Read-check the existing document-evidence schema and persistence RPC; do not apply DDL or reset a database.

Create one controlled scanned PDF with the existing generator, submit through authenticated `/api/analyze` with explicit consent and idempotency, and retain the exact owner/organization/analysis/version/job/storage identities in the protected cleanup ledger. Keep global queue workers off. Invoke `processExtractionStage(ownedAnalysisId)` directly in an isolated process so it processes only that owned analysis; do not run the global claim loop. Expect OCR unsupported/review withholding on the current default path. Read only that result and check that no authoritative score or fabricated extraction appears. Clean the exact owned job/object/rows/account using the existing fixture cleanup. This adds real ingestion/persistence/withholding evidence, while the independent worker tests above supply actual OCR-engine evidence. Wiring OCR into the default upload path would be a separate implementation/authorization decision.
