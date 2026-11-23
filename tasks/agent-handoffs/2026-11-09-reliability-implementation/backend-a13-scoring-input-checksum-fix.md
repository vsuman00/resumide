# A13: preserve and enforce the existing result checksum

- Updated: 2026-11-15; author `/root/a01_page_backend`.
- Status: IMPLEMENTED; VERIFIED_LOCAL with actual scorer outputs and fake native RPCs. Native execution/activation remains open.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`.
- Authorization: Root's bounded checksum correction after peer source review of released helper `e5d48799`. Only helper, its unit test and this new handoff are owned. Previous source/failed receipts and handoffs stay preserved.

## Correction and limits

The earlier adapter correlated checksum strings without recomputing the existing ordered producer payload. A changed score still within 0..100 could retain the original checksum, pass shape validation and reach finish. The new private guard rebuilds the exact current producer's nested insertion order and compares the existing SHA256 of JSON.stringify(payload). It runs before any finish RPC and on bound saved reads.

The reconstruction follows actual `scoreExtractedResume`, `parseSim`, `parseContact`, layout warnings, `toRuleTrace`, matcher evidence, source evidence and span constructor order. It preserves every array order and handles omitted optional credit/evidence exactly as JSON serialization does. It does not sort input, rescore, change producer output, add a hash domain or version the old algorithm. Strict existing schemas fail closed for unknown producer versions/fields. SQL JSONB hashes remain distinct and opaque.

This guard proves self-consistency with the old checksum, not independent numeric correctness. A trusted worker remains the numeric authority; a caller who changes both content and checksum does not gain independent source proof. Native atomicity, ACLs, original input binding and privacy remain separate checks. No scorer, native migration/profile, stage, configuration, frozen core policy or old assertion changed.

## Frozen files

| File                                      | Final SHA256                                                       |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/legacy-scoring-input.ts`  | `28aef84b37a6c1ac36139f045e91b7d31cd88346036d7aec85c24b179492fdba` |
| `tests/unit/legacy-scoring-input.test.ts` | `73b8fff4cfc5645eee5c05bf289eefbfceb4b42a2e90942316dd3387b052c27f` |
| This handoff                              | Recorded in final private packet                                   |

Preimages are helper `e5d487996953e2075122a3b20fbcb5d07c4915d41a81291ae5fd13cd3ba8e3e5` and test `ac189493702063deb4eeaa7c1d70b4f9d0ff3a856b0ea4f46c75b32b3c8b3c08`. The prior complete 39-case run remains historical evidence; it was not repeated. The new test file has 37 cases: 28 preserved original cases and nine new checksum controls. The separate scoring-stage file retains 11 cases unchanged, for 48 unique cases in the eventual combined worker gate.

## Verification and preserved failures

Private packet, mode 0700:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-scoring-checksum-dj1b_chb`

Each label has `.json` receipt and `.log`; `commands.json` holds exact arguments, and `coherent.json` names exact final source hashes and `.txt` snapshots. All commands ran through packet `run.mjs` with pinned Node22 `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node`, sealed synthetic configuration and no dotenv/live credentials.

| Label               | Exact child command                                                                                                             | Result                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `score-tamper-red`  | `node_modules/vitest/vitest.mjs run tests/unit/legacy-scoring-input.test.ts -t 'refuses a changed in-domain score'`             | Genuine EXPECTED_RED 1/28 unselected on original e5 helper: altered actual scorer score plus original checksum resolved a receipt instead of rejecting.                                                             |
| `checksum-green`    | `node_modules/vitest/vitest.mjs run tests/unit/legacy-scoring-input.test.ts -t 'existing producer checksum self-consistency'`   | Preserved 3 PASS/6 new fixture assertion failures/28 unselected. All six positive finish/saved calls admitted; only comparison to in-memory undefined evidence properties failed after JSON correctly omitted them. |
| `checksum-terminal` | Same exact affected command                                                                                                     | PASS 9/28 unselected after the single expectation became the actual scorer's JSON-roundtripped value. No production change accompanied this correction.                                                             |
| `types`             | Packet `types.cjs`                                                                                                              | PASS 3 roots/29 source files/0 diagnostics.                                                                                                                                                                         |
| `lint`              | `node_modules/eslint/bin/eslint.js app/lib/server/legacy-scoring-input.ts tests/unit/legacy-scoring-input.test.ts`              | PASS.                                                                                                                                                                                                               |
| `format`            | `node_modules/prettier/bin/prettier.cjs --check app/lib/server/legacy-scoring-input.ts tests/unit/legacy-scoring-input.test.ts` | PASS.                                                                                                                                                                                                               |

The six positive vectors use actual scorer construction and then recursively reverse object keys while preserving JSON values and arrays. This is a deliberate transport-order falsifier, not a PostgreSQL execution claim. Vectors cover the original fixture; full contact/links/location; JD-present fractional credit and uncertain evidence spans; JD absent with omitted evidence/credit; exact pages across high/medium/low/empty confidence branches; layout warnings/fallback pages/aliases; and non-ASCII/astral source text. Both finish and saved reads accept the original checksum after reordering. Separate controls reject changed in-domain score, nested numeric weight, checksum-only, unknown producer and extra nested authority fields. Finish refusals assert zero RPC dispatch.

All checks report 783 stable worker inputs, no in-run source drift and confirmed process-group cleanup. Actual imported profile remains the tested early a179 checkpoint; new checksum tests use explicitly synthetic expected metadata. No native profile change is required for this Node-only correction. Root owns final profile integration and the fresh combined gate.

## Release

The two code/test files are frozen and released; this handoff completes the three-file allocation. No SQL parser, database, provider, services, real environment/key or Git operation ran. The feature remains default-off and native calls staged/denied. Root may integrate this correction before its first combined foundation run. Full owned feedback publication, sidecar/current-historical consumer adoption, native concurrency/catalog verification and release acceptance remain open.
