# R10 analysis stage fencing

Date: 2026-11-10, Asia/Kolkata. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the coordinator's synchronized nonsecret inputs. Status: local worker/extraction/scoring slice verified and released for review. Runtime SQL, backend qualitative integration and the combined gate have separate owners. Full R10 acceptance remains open.

## Scope and contract

Owned files: `analysis-worker.ts`, `extraction-stage.ts`, `scoring-stage.ts`, new `analysis-stage-fence.ts` under `app/lib/server/`, new `tests/unit/analysis-worker-fence.test.ts` and this handoff. R08 files remain frozen. No provider, database, Docker, browser, global worker, network or owner-file operation ran. No configuration, migration, Git or deployment mutation ran.

The shared `AnalysisStageOptions` carries the optional signal and `{workerId, leaseFence, attempt}` context. Active checks reject an observed abort. When `ANALYSIS_FENCING_ENABLED` is true, a missing lease fails before stage work; missing flags in legacy mocks remain false. A supplied lease always uses the fenced path, including when the flag is false. Invalid contexts, unavailable ownership checks and lost leases produce bounded `AnalysisStageFenceError` codes. RPC rejections are sanitized; there is no fallback from a failed fenced operation.

`assertAnalysisStageLease` checks ownership with `assert_analysis_stage_lease`. `persistAnalysisStage` passes the exact context, a fixed operation name and the existing typed RPC parameter object to `persist_analysis_stage_v2`. Inner and outer analysis IDs must match. The operation whitelist is limited to transition, document evidence, legacy/native extraction, deterministic results, partial results and qualitative results. No caller supplies arbitrary SQL or a dynamic function name. The runtime agent confirmed boolean results and the exact argument contract; database transaction behavior is not tested here.

## Stage changes

`processQueuedAnalysis` validates the lease attempt against its attempt argument before entering a stage. It forwards signal/context to extraction and scoring, and preserves the qualitative transport argument while forwarding options as the fourth argument. Active checks run before, between and after stages. Cancellation throws instead of returning a successful worker result.

Extraction checks ownership before loading/expensive work and again around storage download. Both initial status transitions, document evidence, native/legacy extraction persistence and extraction-failure transitions use the shared mutation helper. Scoring checks active ownership before computing and uses the same helper for deterministic persistence. Existing evidence withholding, source/provenance fields, statuses, version identifiers and numeric rules remain unchanged. Default-off calls retain their old RPC names and parameter objects.

Known AI spend settlement is independent of result fencing and remains in the shared budget path owned by the backend integration. A stale result cannot refund provider spend. An abort observed after an already committed valid stage write does not roll that result back. Terminal-job restart/cleanup is R11 acceptance work. PDF/OCR work that lacks an abort-aware adapter may finish internally, but active/lease checks prevent initiating a later result mutation after cancellation; this packet does not claim to kill that underlying work.

## Evidence

Before helper creation, actual worker `b1d53e70bc594c85ec4ad5cdfd5d8a1b2dfaa9e68e1ba9b03923a5df9fcea130` failed both new expectations: pre-aborted processing and cancellation between stages resolved successfully. Both failures are preserved.

Focused command: `node node_modules/vitest/vitest.mjs run tests/unit/analysis-worker-fence.test.ts tests/unit/extraction-stage.test.ts tests/unit/scoring-stage.test.ts`. Result: 24/24 passed, comprising 13 new worker/stage/helper cases and the unchanged eight extraction and three scoring cases. Tests exercise actual extraction/scoring stage functions with controlled storage/PDF/RPC responses. They cover attempt/options forwarding, required leases, pre-work ownership denial, every extraction mutation branch, cancellation before persistence, stale scoring rejection, legacy shape and malformed/rejected RPC handling. They do not prove real SQL locking, authorization, rollback or concurrency.

The helper was released early at `a5746b7295a9644a7cfb63a25ae0b35ab614ab35e84031056cdc0ecb3e4e72b9` for the backend's qualitative integration and stayed unchanged. Scoped typing used its released qualitative dependency `41f8fb783af46407dcbf956fde668978763632df0521d34c414b8ede75483bbc`: 54 transitive source files, three ambient roots, zero diagnostics. Qualitative provider/cancellation behavior is the backend's evidence, not part of the 24-case result. Scoped ESLint, Prettier, prose hygiene and `git diff --check` passed. The coordinator owns the final combined gate.

The sealed Node.js 22 environment used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`; `.env` was not loaded. Private receipts are retained in `/private/tmp/resumide-r10-stage-fence-vkjwecj8`. No broad suite or R08 campaign was repeated.

| Released file                              | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/analysis-worker.ts`        | `bf0ac162d1fb61dc994b23a45d162b9a3c38ca41f665cddafdcdaa63282ec7fd` |
| `app/lib/server/extraction-stage.ts`       | `5deaa438bda819ea20ffa24a3c5dc9215277d9a4bb86d032fd6aa0381b55dbda` |
| `app/lib/server/scoring-stage.ts`          | `fd7d8fa7f9677f03756bf884f80e7470e35ce0b38a5c4f6c1d53dc7984ca86d5` |
| `app/lib/server/analysis-stage-fence.ts`   | `a5746b7295a9644a7cfb63a25ae0b35ab614ab35e84031056cdc0ecb3e4e72b9` |
| `tests/unit/analysis-worker-fence.test.ts` | `3a8a0cc2511f142ce4ddcb30748e6e1d5d3dd9d5ca63db8453f729e37bf10ad5` |
