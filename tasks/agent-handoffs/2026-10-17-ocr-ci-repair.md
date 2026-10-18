# OCR CI repair: coordinator handoff

Updated: 2026-10-18, Asia/Kolkata. Coordinator: current primary agent.

Status: LOCAL ENGINEERING VERIFIED; publication/remote verdict belongs to GitHub commit checks. User authorized fixes, commit/push and remote CI verification. Base `3ffc206` is the published parser/evaluator repair; its four non-OCR jobs pass and local-ocr fails the historical acceptance exact-line gate. The [follow-up report](../../docs/evaluation/OCR_CI_REPAIR_20261018.md) records the completed local repair; the [earlier report](../../docs/evaluation/OCR_CI_REPAIR_20261017.md) preserves the original failures.

## Scope and constraints

Root owns OCR adapter/profile/runner, harness/CLI/CI, runtime checker, forward migration, tests, repair receipts and canonical task evidence. Read-only agents reviewed selector, model provenance, bounds, SQL agreement and gates. The DB agent authored only its two draft SQL files in `/tmp/resumide-ocr-fusion-db-20261018`, based on `3ffc206`; root reviewed, copied and tested them locally. No other agent owns the running OCR slot now.

Preserve unrelated editor/README/operations/hosted-check/worker-deployment/concurrent AGENTS/CLAUDE/CONTEXT/workflow/auth-design/handoff changes. Only this coordinator handoff belongs to the repair commit. Never stage credentials or actual resume/JD content. `.env`, `.env.production`, `.env.ocr-repair` and the actual resume stay ignored. No hosted migration, external provider, production activation or score-policy change was performed.

Synthetic AA1-R1 exit evidence is now VERIFIED, with formal acceptance pending. AA1-R2–R5, representative validity, calibration and production release remain open. Frozen truth, evaluator and every numeric floor are unchanged. Failed receipts remain indexed; no consumed set is called untouched again.

## Implemented and verified

Explicit text-fusion-v4 uses the fast and checksum-pinned official best English models on one 150-DPI raster. Unique reciprocal word alignment is bounded. Plain alphabetic baselines, numeric/email/scheme-bearing tokens and uppercase-to-lowercase alternatives retain baseline. Eligible nonalphabetic disagreements select an entire observed alternative token; this remains a heuristic with known legitimate-punctuation/combining-mark risks. Raw confidence is not calibrated correctness. Default adapter/production behavior stays unchanged; two decodes share the original attempt/isolation caps and remain review-required/scoring-ineligible.

Local image: `sha256:990ac9d9ff190beeeaa0bb6323a2cbee8b1da0a78926f194ec217f6afa09877d`. Manifest bundle: `74a6c07f4943981367364af90d830c36c6de018cb0c7762caba61e51189c44cc`. Pre-evaluation source freeze and ten safe reports are `aa1-repair-20261018-text-fusion-v4-*.json`. Development, every earlier consumed regression, then fresh runtime-check first evaluation ALL pass: 126 documents, 1,008 matching critical fields, no extras, zero OCR CER and 100% exact-line agreement. Runtime-check is now consumed. Root did not read its source values. Only the default engineering image constant changed after evaluation to the exact image already supplied explicitly; publication-source receipt records this nonalgorithmic delta.

Full CI passes 114 files / 866 unit tests and 56 browser checks; final log `/tmp/resumide-ocr-ci-fusion-publication.log`. Six actual-image runtime commands pass, including both-pass cancellation, timeout, malformed input, isolation and exact-owned cleanup. SQL legacy/native/document/version/fusion tests pass on isolated `supabase_db_resumide-browser-audit-20261016`; 15 new forgeries reject, fixtures roll back, advisors report no issues. Forward migration `20261018072430_ocr_fusion_resource_profile.sql` preserves all other persistence guards and must precede authorized persistence of the optional profile. Do not touch/reset the separate 54321 stack.

Sauvola, Leptonica, 300-DPI, best-only, unreadable-model and fusion v1–v3 failures remain. V4 is frozen without further target-shaped exceptions. CI accumulates original development/locked failures and all additional corpus failures, uploads receipts and preserves every floor.

## Next action

Finish final source/prose/Git checks, commit/push only repair scope, then inspect all five GitHub jobs to terminal. A local pass is not remote proof. Record the actual commit/run in the final user response; inspect safe artifacts and fix any red job without weakening gates. Do not infer production deployment or formal acceptance from green CI.
