# R11 worker readiness and startup tests

Date: 2026-11-10, Asia/Kolkata. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 703 coordinator-synchronized nonsecret inputs. Status: bounded test slice verified and released. Native capability, transaction, recovery and release acceptance remain open.

## Scope and contract

Owned files are `tests/unit/worker-readiness.test.ts`, new `tests/unit/worker-startup.test.ts` and this handoff. The backend owns the actual helper and both CLI scripts; the runtime agent owns the read-only metadata-probe migration. Their files were copied only after prior/frozen hash checks. No production source was edited here. No provider, real database/Supabase, browser, Docker, global worker, owner-file, credential or network operation ran. No Git mutation ran.

Legacy readiness retains the two zero-row evidence/correction storage checks. Optional selection requires the metadata probe when fencing is enabled or both AI and its technical budget are enabled. The test contract sends explicit selected booleans and model/policy only when budget admission is selected. It checks the exact schema version, capability echo, closed failure labels and agreement between ready state and failures. This is a read-only capability contract, not a queue claim or proof of actual SQL behavior.

The original two tests and assertions remain. Their query fixtures gained chainable `abortSignal` and thenable behavior so they represent the current PostgREST interface. Six bounded invalid-response cases cover missing data, schema mismatch, wrong echo, unavailable capability, contradictory ready/failure state and an unrecognized failure label. Selected/disabled combinations, pre-abort, a missing response and late success complete the finite readiness set.

The timeout fixture observes the signal supplied through the query builder's `abortSignal` method and rejects on abort; it does not merely stop a wrapper timer. A separate deliberately noncooperative query resolves after the deadline and still cannot pass readiness. Both cases verify timer cleanup and one probe invocation. These are abort-aware query doubles, not live HTTP cancellation evidence.

## Actual regression and startup checks

Before the backend edit, helper `629a6f2d4b0be5f2d74fc401b1716ed9db5cdbc7161e1598817c10c0d021fb57` accepted enabled fencing/budget selection despite a missing required metadata RPC. The new expectation failed because the promise resolved; both original cases passed. This was an actual implemented-helper failure, not a missing-module import result. The failure and source binding remain preserved.

The startup tests import the actual loop and one-cycle scripts with fully mocked dependencies. A readiness rejection precedes queue construction, claim, loop and cycle in both scripts. A controlled successful loop verifies readiness ordering, selected configuration forwarding and shutdown-signal propagation while the mocked loop remains in flight. The tests restore process signal listeners, exit code and output spies. No real worker loop or queue is launched.

## Verification and bindings

One focused command passed 19/19: `node node_modules/vitest/vitest.mjs run tests/unit/worker-readiness.test.ts tests/unit/worker-startup.test.ts` (16 readiness, three startup). Scoped ESLint passed. Scoped TypeScript verification passed with 60 transitive source files, four ambient roots and zero diagnostics. Prettier, prose hygiene and `git diff --check` passed. The coordinator owns the final combined gate; no old 117-case or full-suite campaign was repeated.

The sealed Node.js 22 environment used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` and did not load `.env`. Private failure, passing result and exact source/input bindings remain in `/private/tmp/resumide-r11-readiness-tests-ndcmo0yn`.

| Tested file                                        | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/unit/worker-readiness.test.ts`              | `13fd4c6eda261d1b4f0c9fd51159dcc8b8d477e07d7cd8502ecf4a2a1a82079e` |
| `tests/unit/worker-startup.test.ts`                | `4782558ca4e96f76f2405cbc3039bf6ef040d42691677db4bb50d436eb7b1322` |
| Helper input: `app/lib/server/worker-readiness.ts` | `4fe2084a2c67423ac2cf02dd2ccb99a6bf6defdabea163d6d8d080086b8b7ef1` |
| Loop CLI input: `scripts/run-worker.ts`            | `b92cb12751e274f5b03745a50f1b99391f4f662f0a3f73150a3f4d0a3a57ce4b` |
| Once CLI input: `scripts/run-worker-once.ts`       | `59353a1d3f8b09138014994e016a805a1d44af3b403e483cb888711452f2009b` |

SQL was not parsed, applied or executed here. A valid mocked capability response does not prove native grants, function bodies, trigger coverage, isolation, pool policy, races or startup behavior against the managed project. Those acceptance tiers and any activation remain separate.
