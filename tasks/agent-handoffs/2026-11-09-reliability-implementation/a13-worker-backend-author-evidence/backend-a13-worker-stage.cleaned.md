# A13 initial-feedback worker adoption

Released source candidate, 2026-11-15 17:44 IST. Root owns integration and canonical context. Exclusive backend worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`. Assigned base HEAD is `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; the inherited dirty source was preserved. No Git mutation occurred.

The selected branch runs before legacy extraction/JD/quota and fresh lease reads. It requires the supplied matching lease, derives only owner/organization/request IDs from analyses, then runs the actual initial-feedback service. Its exact policy factory output must match the Native selected policy; there is no seed or budget-off fallback. The installed SDK transport receives the immutable context through the real service. The old supplied transport is isolated. Existing explicit consent is read without insertion or manufactured acceptance, followed by hashed analysis/user rate keys. Only a published result returns success. Pending throws `INITIAL_FEEDBACK_PENDING` into the existing bounded queue failure path.

Saved publication and pending replays precede admission. As clarified by Root's ordering supplement, a fresh claim loser can incur bounded pre-claim consent/rate/quota checks; it never dispatches, settles/releases a winner or uses legacy persistence. Frozen service bytes remain unchanged.

## Released source

| File                                        | SHA256                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/initial-feedback-stage.ts`  | `fe8db04ed9278a14d6b1ec711045b1289a7a43fe21e31c0affee498665efcb34` |
| `app/lib/server/qualitative-stage.ts`       | `34858b0ade2258a617ee21d7c0579a9608e343a6bc3f65f7c080981803644fbd` |
| `tests/unit/initial-feedback-stage.test.ts` | `60caebe51a116b812f5ff058f3cedeb315a4c177e4189a908fcd80eeedf5e437` |

The qualitative preimage is `41f8fb783af46407dcbf956fde668978763632df0521d34c414b8ede75483bbc`; other release files were absent. This handoff is the fourth released file; Root records its final hash. Runtime config was archived and copied exactly for statics: preimage `fcc54923e0ade3e3171f437470261075fe07ef7d2735df2298e61c44620c007b`, candidate `afa7eaf05ceb3d54c74d455f805ac58095094709392575f2f97ac8f5f5b7650f`. Config is excluded from this release.

## Verification and preserved failures

Pinned Node22 v22.23.4 ran the installed Vitest CLI, equivalent to package `test`, with these exact filters: `tests/unit/initial-feedback-stage.test.ts tests/unit/initial-feedback-service.test.ts tests/unit/qualitative-stage.test.ts tests/unit/analysis-worker-fence.test.ts tests/unit/writer-worker-transport.test.ts`. Final: **53 tests / five files passed**, zero skips. Thirteen new controls cover immutable publication, replay, pending, AI-off, consent, cancellation, leases, legacy isolation, queue retry, claim loss and policy/budget selection. Real service/compiler/installed SDK use fake RPC/fetch; no Native execution is claimed.

Final `react-router typegen` followed by `tsc`, scoped ESLint and scoped Prettier checks passed. All checks used empty HOME, explicit fake environment, private verification mode and OS network/dotenv/Git-write denials, with 120-second and 8 MiB limits through the existing process helper. Every source manifest remained stable. All fifteen PID/process groups are now absent; typegen's brief surviving child exited without signaling.

Receipts, logs, config preimage and finite controller: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-worker-stage-q59f20hz`. `groups-and-receipts.json` binds all receipts/logs/groups. Final acceptance is `final-affected3`, types `statics-types3`, lint `statics-lint2`, format `statics-format2`.

Preserved failures: `red` has five actual worker-boundary failures from legacy mutable reads before implementation. `statics-types` reports missing generated route types and one duplicate synthetic property, both corrected. `final-affected` and `final-affected2` preserve two new cancellation-test expectation errors; the actual stage emits `ANALYSIS_CANCELLED` and retains an unknown hold with null error code. Assertions remain explicit. Earlier `final-tests` passed only three matching files because two filter names did not exist; final acceptance uses five verified paths.

No SQL was parsed or executed. No DB, hosted operation, live provider, native compiler, browser, Docker, dependency installation or deployment ran. Root's integrated gate, Native transactions/roles, representative validity and release acceptance remain open. Prose received the required local cleaning pass.
