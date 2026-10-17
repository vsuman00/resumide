# OCR CI repair: coordinator handoff

Updated: 2026-10-17, Asia/Kolkata. Coordinator: current primary agent.

Status: PARTIAL. The owner requested repair of the failed GitHub Actions OCR job, commit/push and remote CI verification. Base: `main`, `fab804841183169a8d9a2a6a3fd1b702f979565d`. Commit and remote verification are pending at this checkpoint. The [dated report](../../docs/evaluation/OCR_CI_REPAIR_20261017.md) is the detailed evidence source.

## Scope and constraints

The coordinator owns parser, historical replay, benchmark, migration, workflow, focused tests, repair receipts/report and this handoff. Read-only reviewers checked parser/version/SQL/gates and evaluator matching. Separate authors froze disclosed AI-assisted synthetic sets without inspecting implementation or earlier outcomes. No independent-human validation is claimed.

Preserve unrelated editor, README, operations/runbook, hosted-check, worker-deployment and concurrent AGENTS/CLAUDE/CONTEXT/agent-workflow/auth-design/handoff changes. Only this handoff belongs to the repair commit. Never stage `.env`, `.env.production`, `.env.ocr-repair` or the actual resume. There were no hosted migrations, provider calls, production activations or score-policy changes. All new proposals remain review-required, uncalibrated and scoring-ineligible.

AA1-R1 and formal AA1 remain OPEN. Keep every frozen source/label, floor and failed receipt. Do not tune against frozen labels, delete failing assertions or convert a consumed evaluation into untouched acceptance. The original 98% precision / 97% recall and exact-line gates remain enforced.

## Implemented and reviewed

- `evidence-fields/1.0.1` proposals fix generic development cases. Historical envelopes replay through `evidence-fields-v1.ts`, byte-identical to HEAD's parser. Shared legacy dependencies are unchanged.
- Additive migration `20261017120000_evidence_field_parser_version.sql` preserves existing persistence guards and admits only the explicit new version. It must precede deployed updated writers; only the isolated local audit database received it.
- Versioned benchmark matching requires exact type/value/page and own-source grounding; accepts identical raw coordinates or matching nonempty-line ordinals plus normalized line-local boundaries. Blank lines and unrelated earlier OCR substitutions cannot falsify later correct fields. Duplicate occurrences, wrong pages, invalid slices and invented values remain rejected. Exact-line reading-order checks are unchanged.
- Original CI gate plus every consumed frozen regression are enforced. Additional-loop failures accumulate and receipts upload. Test fixture-generation timeouts increased from 5 to 30 seconds under concurrent CPU load; OCR runtime/resource budgets and assertions are unchanged.

## Evidence and failed attempts

Final local `npm run verify:ci` passed: 113 files / 834 tests, 56 browser checks, formats/lint/types/app/worker builds/security/existing benchmarks, zero production dependency vulnerabilities. Log: `/tmp/resumide-ocr-ci-publication-current.log`. Local Node is 26.5.0; remote pins Node 22. SQL historical/current/retry and ten rejected forgeries pass with rollback; actual worker passes four synthetic fixtures with native preservation, retry cleanup and zero provider/scoring rows (`/tmp/resumide-ocr-db-corrected.log`).

Source-bound current OCR receipts are `aa1-repair-20261017-publication-current-*.json`. Original development/locked and expanded development plus earlier consumed sets pass. All 912 critical fields are recovered with no extras. Acceptance challenging scans still fail strict exact-line agreement (97.10%, interval 93.94–100%, required lower bound 98%) because of two noncritical OCR substitutions. All five runtime controls pass. Its correct critical values were independently compared only between observed clean/challenging text; no truth values were supplied to parser repair. This set is consumed regression. The separately authored `runtime-check` source/freeze remains UNEVALUATED pending all preceding gates.

300-DPI comparisons (PSM 3 and 6) stopped after original development failures. PSM 6 / 150 DPI did not resolve the acceptance exact-line failure. Final config restores original PSM 3 / 150 DPI. All failed receipts remain, with an index in `iteration-history.json`; do not claim repaired production OCR accuracy or green remote CI from local app tests.

Actual OCR image: `sha256:62d40d764375b39c4a829a27ee8d76670723402e1f2988b40e31617c7213ffad`. Isolated database: `supabase_db_resumide-browser-audit-20261016`, API 57321 / DB 57322. Do not reset or touch the separate 54321 stack. `.env.ocr-repair` is ignored, mode 600, local-only, AI disabled. Delete inherited NODE_ENV before React test processes.

## Next action

Finish the current OCR/runtime-controls process; update report with terminal counts and remote status. Clean prose, stage only explicit repair scope, commit/push and observe all five GitHub jobs. Preserve and report any red gate. Remaining engineering work is a development-grounded OCR improvement that meets exact-line and field floors on all consumed sets, followed by the still-frozen fresh runtime-check evaluation. Representative validation, calibration, owner release acceptance and activation remain separate.
