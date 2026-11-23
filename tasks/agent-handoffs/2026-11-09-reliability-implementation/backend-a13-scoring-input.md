# CR-A13: bound legacy scoring worker

- Updated: 2026-11-15.
- Worker: `/root/a01_page_backend`, backend worktree `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`.
- Status: IMPLEMENTED; VERIFIED_LOCAL with source, synthetic native responses and actual scorer/worker calls. Native adoption and release remain open.
- Authorization: Root accepted design `c2bf87e8` for staged source implementation, then approved the five worker files and native skipped branch. Shared protocol derives from `backend-a13-scoring-input-contract-proposal.md`; the approved amendment is `77250660`. Root owns the default-off config and shared plans. No Git operation was run.

## Result

The default-off `LEGACY_SCORING_INPUT_ENABLED` branch reads a strict original-input context through the new native interface, runs the existing deterministic scorer unchanged, and calls only the bound finish RPC. Missing lease, readiness, native permission or binding fails closed. It never falls back to the old table query or old persist RPC when selected. The disabled branch retains the existing query and persistence behavior.

The native protocol retains immutable original full JD, source metadata, extraction text/page array and distinct digests. Node correlates all identity fields, hashes exact UTF8 extraction text, preserves empty page arrays/no-job semantics, and rejects NUL or malformed surrogate strings. Native JSONB digests remain opaque; no JSON.stringify/JSONB hash equivalence is claimed. Producer versions, taxonomy, numeric rules, weights and JS result checksum semantics are unchanged.

A pure `validateLegacyScoringInputContext(raw, analysisId, ownerId)` export supplies the same bounded parse and cross-field checks for paired privacy validation. It does no IO and does not turn content correlation into independent native authority. Worker loads support ready, committed and native-authorized skipped/not_scoring. Committed/skipped return false without rescoring. Native owns static lease authorization, fresh lease checks and exact prior lookup; Node introduces no current-head rebase or fresh-lease precondition before finish replay. Actual uncalibrated-evidence checking remains in the stage; native guards remain unchanged.

Saved reads distinguish original bound current/historical context from `legacy_unbound`. No old result gains a snapshot from today's mutable job. This is an A13 prerequisite; the released qualitative support core remains source_content_only/not_provided. Feedback publication, sidecar persistence and consumer adoption are separate work.

## Frozen files

| File                                      | SHA256                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/legacy-scoring-input.ts`  | `e5d487996953e2075122a3b20fbcb5d07c4915d41a81291ae5fd13cd3ba8e3e5` |
| `app/lib/server/scoring-stage.ts`         | `f9c262acc637e26c3f47bd9f9a50ecce87ec2cd0009d3f767a47eda0a193acb6` |
| `tests/unit/legacy-scoring-input.test.ts` | `ac189493702063deb4eeaa7c1d70b4f9d0ff3a856b0ea4f46c75b32b3c8b3c08` |
| `tests/unit/scoring-stage.test.ts`        | `6d6ac8dffddbcd74df5920cec5299c0e8829179df6777f87d96a10ce73bb284c` |
| This handoff                              | In private final release manifest                                  |

The complete original `scoreExtractedResume` function remains byte-identical, SHA256 `e2740dff07cb05d8a8057a5809e523b2af13d67470dc06a2600e68f0886e3135`. The original three-case scorer describe block is also byte-identical. Old assertions were preserved.

Runtime owns the forward migration, separate profile and deferred verifier. Frontend owns paired privacy adoption and tests. Root owns config/env examples, integration, canonical records and combined checks. No integrated bootstrap, A12 or prior qualitative-support source was edited.

## Verification and failures

Private packet, mode 0700:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-scoring-worker-7zu589st`

`commands.json`, `.json` receipts and `.log` files use the labels below. `released-code.json` names exact final source snapshots. Every command used pinned Node22 `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node` and the packet `run.mjs`, sealed synthetic configuration, no dotenv or live credentials.

| Label            | Exact child arguments                                                                                          | Result                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bound-mode-red` | `node_modules/vitest/vitest.mjs run tests/unit/scoring-stage.test.ts -t 'does not use the legacy table query'` | Genuine EXPECTED_RED: old stage resolved true through legacy persistence despite selected bound mode and missing readiness; 1 failed/3 unselected. |
| `finite`         | `node_modules/vitest/vitest.mjs run tests/unit/legacy-scoring-input.test.ts tests/unit/scoring-stage.test.ts`  | PASS 39 tests/2 files: 28 adapter controls and 11 stage controls, including all three original cases.                                              |
| `types`          | Packet `types.cjs`                                                                                             | PASS 5 roots/30 source files/0 diagnostics.                                                                                                        |
| `lint`           | `node_modules/eslint/bin/eslint.js` followed by the four code/test paths above                                 | Preserved failure: two no-control-regex findings and one unused fake-client argument.                                                              |
| `unicode-final`  | `node_modules/vitest/vitest.mjs run tests/unit/legacy-scoring-input.test.ts -t 'reuses the full pure decoder'` | Affected PASS 1/27 unselected after equivalent Unicode-check spelling and unused-argument cleanup.                                                 |
| `lint-final`     | Same exact four-path ESLint command                                                                            | PASS on final source.                                                                                                                              |
| `format-final`   | `node_modules/prettier/bin/prettier.cjs --check` followed by the same four paths                               | PASS on final source.                                                                                                                              |

The 39-case run and scoped types used helper `ce093e6a`, new test `745eb6a6`, final stage/test and the actual early runtime profile `a1799dcb80d81632fc9d9cee14a650fef21fb0bb10def3d1787471c75b27ae46`. Final helper `e5d48799` changes only the lint-rejected NUL regex spelling to `includes` plus the same surrogate check; final new test only consumes its existing unused fake argument. No assertion or field domain changed. The affected Unicode case, final lint and formatting passed after those deltas; the full 39 were not repeated. Root's combined gate covers the final candidate and any later profile-only successor.

Actual Root config dependency `fcc54923e0ade3e3171f437470261075fe07ef7d2735df2298e61c44620c007b` was copied after archiving prior bytes; it includes the flag in both server and analysis schemas. Runtime's actual source profile was copied only after absence/hash checks. Tests explicitly label synthetic expected profiles; they are not catalog evidence. Fakes cover native storage/metadata/RPC behavior and service configuration/client boundaries. The real decoder, scorer, worker, evidence guard and receipt validation ran. Native stale SQLSTATE controls validate handling, not a measured database race or transaction rollback.

The finite log hash is `d35b004924cbb72ce6b6091a8e6d6a10a6b26e4129c805f1b8aec38ef69d7774`; genuine RED log `81a30659004f89ce387d2719884be17e10c0f4f9ba081088dfcf3b0d89685368`; types log `389281ecdcb12021a9746fa4549590596d718fec28d6f9c30a3080bddef5947f`; affected Unicode log `84c521270e3bc288cc279f95dd9aa1b345dee0baf0a9eeffa4c39935f75923d4`. Final lint has the empty-log hash `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; final formatting log `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`. Receipts show stable inputs and confirmed group cleanup: baseline 781 inputs, affected candidate 783, no in-run source drift.

## Release and open adoption

The four code/test files are frozen and released to Root. This handoff completes the fifth owned file. No provider, database, SQL parser, service, real environment/key, browser or deployment was used. No full build, broad unchanged suite or historical readiness campaign was repeated by this worker.

New native data calls remain staged/denied, including service-role finish, and the feature remains false. Root must integrate paired native/profile/privacy plus this worker and the separate flag changes, then run one affected/full-static gate. Native rollback, source/job mutation CAS, locking, original static-lease replay, catalog ACLs, paired export/cascade/retention and activation still require separately authorized acceptance. Old direct legacy writers remain known unbound paths; this optional mode does not prove global cutover or complete A13.
