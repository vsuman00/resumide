# OCR CI repair, 2026-10-18

Status: LOCAL ENGINEERING VERIFIED. The frozen candidate passes every development and consumed regression gate, followed by the runtime-check set on its first evaluation. Formal representative validity, calibration and production activation remain open. Remote results belong to the [GitHub workflow and commit checks](https://github.com/vsuman00/resumide/actions/workflows/ci.yml); this report records local evidence before publication.

The preceding repair, commit `3ffc206`, passed four GitHub jobs but [failed local-ocr](https://github.com/vsuman00/resumide/actions/runs/39037572986). All 912 critical fields matched; acceptance challenging scans failed strict exact-line agreement at 97.1014%, with a 93.9394–100% interval and an unchanged 98% lower-bound target. The [earlier report](OCR_CI_REPAIR_20261017.md), original failure and all subsequent trials remain retained.

## Change and boundaries

An explicit synthetic engineering profile, `tesseract-5.3.0-2/text-fusion-v4`, decodes the same 150-DPI raster twice. It uses the existing Debian fast English data and checksum-pinned [official best English data](https://github.com/tesseract-ocr/tessdata_best/tree/e2aad9b983032bb1beff9133104a67cdbb87ca4d), with its Apache-2.0 license included in the test image. The best model SHA256 is `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`. Downloads occur during image build; recognition runs without a network.

The selector only considers unique reciprocal word-box matches with IoU at least 0.8. Ambiguous matches, split/merged words, lines over 128 words, plain alphabetic baseline words, numeric/email/scheme-bearing tokens, and uppercase baselines whose alternative introduces lowercase retain the baseline. Other eligible nonalphabetic disagreements choose one complete observed alternative token, including its geometry and raw confidence. It does not synthesize spelling or select the higher confidence value. This is a heuristic: legitimate punctuation, compound names, software terms and combining marks can enter this path. Neither punctuation nor raw confidence establishes which decoder is correct.

The manifest identifies both models, decoding settings and selector. Its bundle hash is `74a6c07f4943981367364af90d830c36c6de018cb0c7762caba61e51189c44cc`. The immutable local image is `sha256:990ac9d9ff190beeeaa0bb6323a2cbee8b1da0a78926f194ec217f6afa09877d`. Default adapter behavior and production flags are unchanged. The profile shares the existing 10-second attempt, one-render-per-page, page/pixel/memory/CPU/process limits and cleanup. It makes exactly two recognition calls per selected page and remains review-required, uncalibrated and scoring-ineligible.

Migration `20261018072430_ocr_fusion_resource_profile.sql` admits only that exact engine/renderer/bundle combination with mandatory N renders and 2N recognition calls. Legacy optional resources and N/N semantics remain. Every other ownership, provenance, transaction and score-withholding check is preserved. Apply the forward migrations before persisting this profile in an authorized environment; no hosted migration or production activation occurred.

CI enforces all eight locked corpora, both development runs and existing runtime controls. It also tests actual two-pass cancellation and cleanup. Original development and locked failures now accumulate instead of allowing development failure to skip the locked evaluation. No evaluator, label, floor or assertion was weakened.

## Evaluation and retained failures

The source and image were frozen before evaluation. Mutable development passed first; every earlier consumed regression passed before the untouched runtime-check set ran. The coordinator did not read runtime-check fixture values. Its unchanged authored source hash is `3e4de155736743cfcbe362cd8b85d6dcd87ce4495b549bfb3f2a42fc5f134e3e`. This remains disclosed AI-assisted synthetic evidence, not independent human validation. After this first evaluation it is a consumed regression set.

The ten runs contain 126 rendered documents and 1,008 critical-field checks: all match, with no extras. Every segment passes all unchanged field, CER, page-coverage and exact-line confidence-interval gates. OCR CER is zero and exact-line agreement is 100%, including the previously failing acceptance scans. The fresh runtime-check run contributes 12 documents / 96 matching fields; its three segments have 100–100% intervals for field precision, recall, coverage and exact-line agreement. Native text remains preserved. No authoritative scores are emitted.

Receipts are `aa1-repair-20261018-text-fusion-v4-*.json`, with source hashes, configuration, model manifest and pre-recognition lock. The publication-source receipt records one later nonalgorithmic change: the exported default engineering image ID now matches the immutable image already supplied explicitly to every evaluated run. CI supplies its own freshly built immutable image ID.

[Iteration history](aa1-repair-20261017-iteration-history.json) retains failures from Sauvola, Leptonica Otsu, increased DPI, best-only decoding and fusion v1–v3. A best-model directory-permission failure is also preserved; the image now checks model/config readability as the unprivileged runtime user. Unrestricted word replacement and confidence-based vetoes failed; v4 was frozen as a narrower generic policy before development/regression and fresh evaluation. Consumed results are not relabeled as untouched acceptance.

## Verification

- Full `npm run verify:ci`: 114 files / 866 unit tests and 56 browser checks, formatting, lint, types, app/worker builds, security checks and existing benchmarks pass. Production dependency audit reports zero vulnerabilities. Local Node is 26.5.0; GitHub pins Node 22.
- Local SQL: historical/native/document/versioned evidence checks pass. The new rollback test accepts the exact 2N profile and legacy optional/N receipts, preserves idempotency and review withholding, and rejects 15 invalid variants. Security advisors report no issues. Only the isolated audit database was modified.
- Six real-image runtime commands cover legacy selective OCR, the two-pass profile, diagnostic pilot, unchanged normal-font quality screening, encrypted/oversized controls and grounded fields. Their terminal results and log hashes are retained in the runtime-controls receipt.
- Read-only reviews checked the selector, official model provenance, resource bounds, TypeScript/SQL agreement, runtime cancellation, benchmark floors and CI coverage. No independent-human validation is claimed.

AA1-R1 now has measured synthetic exit evidence. Owner/formal acceptance, representative layout/language/adverse coverage, calibration and production release are separate obligations. This change does not establish general resume accuracy, proprietary ATS behavior or hiring outcomes. Private resumes, JDs and credential files are excluded.
