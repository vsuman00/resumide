# R08 queue client and runner fencing

Date: 2026-11-10, Asia/Kolkata. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 682 coordinator-synchronized nonsecret inputs. Status: local client/runner slice verified and released for review. Database execution, activation and final stage-write fencing remain open.

## Scope and contract

Owned files: `app/lib/server/jobs.ts`, `app/lib/server/worker-runner.ts`, `tests/unit/worker-runner.test.ts`, `tests/unit/jobs-fence.test.ts` and this handoff. The coordinator owns configuration and integration; the runtime agent owns SQL. No provider, database, Docker, browser, owner-file, network or global worker operation ran. The existing unit test launches one isolated synthetic idle-loop child and cleans its temporary driver. No Git mutation or deployment ran.

`ANALYSIS_FENCING_ENABLED` defaults off. Missing/false retains legacy queue RPC names and argument shapes. Enabled claims call `claim_analysis_job_v2`, accept only explicit null or the exact `analysis-job-lease/2.0.0` receipt, and validate UUIDs, integer attempts 1–3 and timestamp shapes. The private queue instance injects its worker ID after parsing; the database does not supply it.

The queue carries `{workerId, leaseFence, attempt}` through every v2 heartbeat, completion and release. A latest-claim cache refuses missing, malformed, foreign or superseded contexts; this cache is an additional local check, never database authority. RPC errors and malformed receipts fail closed without legacy fallback. An explicit false ownership result invalidates the local binding. V2 mutation responses must be booleans.

The runner forwards that immutable context as the optional fourth processor argument; legacy processors retain the exact three-argument call. This enables later R10 persistence integration but does not fence existing stage writes by itself.

## Runner behavior

Only one heartbeat check runs at a time. Processing settlement stops future heartbeats, then awaits any pending ownership check before completion or release. A late false/error cannot race success. Unknown completion results never cause a release. Failure release retains the exact attempt and fence.

Loop shutdown reaches the in-flight processor signal. Once the runner observes an abort, it initiates no completion or release, including when a processor returns after abort. One absolute shutdown deadline bounds the remaining wait; it is not reset between processor, heartbeat and queue-mutation waits. The default is 10 seconds, with a positive bounded override for controlled callers/tests. Heartbeat responses also have a bounded deadline. A hung heartbeat marks ownership uncertain, aborts processing and stops the loop instead of claiming another job. Timers and listeners created here are cleaned up.

The library cannot forcibly stop an ignored-abort processor or an underlying RPC. Their promises remain observed, and late settlements cannot trigger queue mutations. Returning from the loop is bounded; hard process exit, actual RPC cancellation and protection of final stage writes are not proved by these tests. Unknown provider/budget reservations are not refunded or changed by this slice.

## Reproduction and verification

The actual baseline runner `33242e587c1b3ec216363f1891959f7be053acd2fa31e24c1c2a6ab149340b06` failed two new expectations: completion ran before an in-flight false heartbeat settled, and three heartbeat calls overlapped. All eight original cases passed.

Coordinator review identified a second concrete liveness gap in the draft: a processor could return while a heartbeat remained pending indefinitely without an external shutdown. One controlled test reproduced that failure on draft `325ff2a4d14c41c3a1a9c2a39f122f892ae036765a00679c2147960601eb8fe3`. The targeted run selected one case; the other 15 were not executed, and no skip annotations were added. The response deadline closes this gap.

Final command: `node node_modules/vitest/vitest.mjs run tests/unit/worker-runner.test.ts tests/unit/jobs-fence.test.ts`. Result: 29/29 passed (16 runner, 13 client). The original eight runner cases and assertions remain. Coverage includes strict claims, stale reacquisition and foreign contexts, exact v2 mutation bindings, legacy behavior, heartbeat serialization/races, processor context, idle/in-flight shutdown, ignored abort, hanging heartbeat and uncertain completion. Queue/RPC responses are local doubles, not SQL race or tenancy evidence.

Scoped ESLint passed. Scoped TypeScript verification passed with 10 transitive source files, three ambient roots and zero diagnostics. Prettier, prose hygiene and `git diff --check` passed. The coordinator owns the combined gate. The sealed Node.js 22 environment uses `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`; `.env` was not loaded. Failed and passing receipts remain in `/private/tmp/resumide-r08-worker-fence-4ugzci41`.

| Released file                      | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/jobs.ts`           | `08f5b50663e96df0e8d6362d20a6580f78d3b7b2c15c962bfa926cbdd20bb931` |
| `app/lib/server/worker-runner.ts`  | `802d120ef7ae1a9eef0050127331db306cc2d9d93eee38f8970bf5a17b170e7e` |
| `tests/unit/worker-runner.test.ts` | `e71e42b7a131f81feb6dae0e68c88d5d418cdcf6495e71424bdc66e4054b20b3` |
| `tests/unit/jobs-fence.test.ts`    | `b2ae557e1df9554921bf8957d9fda9cdd2ed4f7d52b5ee44520dd37df5737e8b` |
