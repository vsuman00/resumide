# R03-S04 and R06 budget entry points

Status: both ordered source leaves implemented; 63 focused Build tests pass. Root source review of the SQL wrapper is ACK; combined integration and final Build source review remain coordinator-owned. SQL remains unapplied and unexecuted. No database, provider, Docker, browser or owner-document operation occurred.

The first leaf appends `public.ai_budget_reserve_next(uuid,uuid,jsonb)` to the unapplied technical-budget migration and updates only the matching operator-draft catalog/assertions. Its request is the existing strict base binding without `attemptOrdinal`. Caller ordinals, period, limits and rates are rejected. Under the same transaction, the wrapper locks the organization and its current owner membership before attempt lookup. An existing owned attempt UUID retains its ordinal; otherwise SQL selects the next operation ordinal and delegates to the existing transition. Policy caps, exact replay/conflicts, first-claim-only dispatch and all six old RPCs remain unchanged. The byte hash already excludes attempt ordinal and does not change. The new RPC uses an empty search path and service-role-only execution privileges.

The second leaf owns `app/lib/server/build-assist-service.ts`, the minimal safe-usage observation addition in `app/lib/server/build-assist.ts`, existing service tests and `tests/unit/build-assist-budget.test.ts`. Backend owns the shared client/attempt helper; Root owns the default-off config. The opt-in branch reserves exactly 24,232 input plus 768 output tokens and retains user/global rates and source/auth/consent/audit/concurrency controls. It skips only legacy organization-use/month-request allowances. Known usage is observed before output/ceiling rejection; unknown or post-claim abort keeps a hold. Existing bounded `onUsage` metrics remain in their original position. No UI, compile, PDF or proposal-application behavior changes.

The accepted UUID `Idempotency-Key`, if supplied, is preserved without normalization; invalid keys receive a fixed 400. Otherwise the server stamps one accepted/generated request ID for that POST. Operation identity namespaces owner, organization, Build surface and nonce, independently of payload; the attempt nonce is `http-post/1`. A separate hash binds validated source hash, selection, mode, model and policy metadata. Reusing the key with changed payload conflicts; a prior dispatched request cannot call the SDK again. A previously reserved but unclaimed request can recover through the first dispatch CAS. No provider-level idempotency guarantee is inferred.

## Local evidence

The pre-change opt-in case used an actual service call with RPC/SDK doubles: a denied shared pool still returned 200 and dispatched the SDK. The expected 429 failed in 15 ms (266 ms total), not from a missing import. Preserve `/private/tmp/resumide-r06-build-budget-red-20261110.log`, SHA `f59f99fe43f80b4aa5574063bb77f18a54085e2bba600989d12909a9a81b9c46`.

After integrating exact dependency inputs `ai-budget.ts` at `497168d5bc6775b1092582e7f0e1775ee82f2eaa629b2968e2e35063eb62681a` and `ai-budget-attempt.ts` at `46621f1a45613f9b2165cbaa8208b310693c87257e707cae2ac15d6eb1f872dd`, one scoped run passed all 63 tests: 13 new budget cases, 32 service cases and 18 provider cases, 533 ms total. Preserve `/private/tmp/resumide-r06-build-budget-green-20261110.log`, SHA `713741f5963fa249435ad326fd3b8a3a556e4c28c569fa645eaa353647015ded`. Targeted ESLint passed, and a TypeScript program checked the four Build files plus transitive imports with zero diagnostics. No broad suite, prior R02 campaign or external service was repeated.

The finite cases cover denied admission, exact reservation size, required gates, invalid/stable HTTP keys, reserved recovery, dispatched replay without accounting mutation, known rejected output, full overrun settlement, unknown/invalid numeric usage holds, post-claim cancellation, failed settlement and delivery failure after settlement. SDK and RPC implementations are local doubles. They do not prove PostgreSQL isolation, durable capacity, actual provider cancellation/cost or consumer usefulness. The fact guard implementation and its thresholds remain unchanged.

## Frozen source

- Migration: `b9868c41b41a073f1cd066bdebfd3575d17f0487a698cf5e4692620cb8a57db0`; its exact prior `7ab655cf` prefix is preserved.
- Operator draft: `0abea2ccbadb60d98a55fd99aa4a7cfd39209c7b6e9c29a367c89add1e8e6f16`.
- Build service: `3f6279ef5843fe88ccc2a0de44811d544e2beaa78d8ff74f05b6b0ea5838a0c7`.
- Safe usage observation: `f307d1fb211081c937e54fc383c448da1faccb9560df4b42d7448b4563c46ef3`.
- Existing service test fixture: `a28d8f26686ac5f56c54664124eb20417cf7454ba4583d87f4fe9af1ad5fd6c4`.
- New budget tests: `2e5df97124d5dffdadaef1a00bb6c95e45f78d1495cea8e7c5037cb2c02a7cc2`.

Rollback keeps `AI_BUDGET_ENABLED=false`, restores the previous compatible application artifact, and preserves all ledger history/unknown holds. No reserve, policy, opening, rate or account counter is reset. Root owns the final affected test/type/lint/web/worker gate and canonical runbook updates for the seventh RPC.

## Remaining native SQL and activation prerequisites

Actual native SQL verification requires an admitted isolated direct Supabase target and native connection/privileged role, not just the existing REST project URL. No such target or native SQL credential is admitted in this task. Bind the exact migration/operator/client/helper/app hashes, bounded statement/lock/session timeouts, a preallocated synthetic run/two-user journal and exact rollback/namespace-absence cleanup. Establish actual isolation and absence of unrelated producers; the current owned-fixture API guard does not admit native SQL, and a self-declared flag is insufficient. Separately allocate two-session first-period/last-unit/ordinal/dispatch/settlement/revocation races; current RPC doubles prove none of them.

Before enabling any consumer path, apply and verify the reviewed forward migration, approve real model/rate provenance and immutable policy rows, establish known opening balances with zero unresolved legacy attempts, and complete the legacy-producer cutover across all three AI features. Review restrictive foreign keys and retention/export/erasure behavior before activating identified ledger records. No schema, policy, opening balance, reconciler or feature flag is activated here. Pricing, deployment and Git publication remain deferred.

## R06 installed SDK timeout follow-up

The previous packet and its source ACKs remain historical evidence. Root found one concrete Build transport classification issue before integration: installed `OpenAI.APIConnectionTimeoutError` has the generic error name, so the existing name-only check returned `provider_unavailable` for an actual SDK timeout. This addendum supersedes only core hash `f307d1fb211081c937e54fc383c448da1faccb9560df4b42d7448b4563c46ef3` and the affected timeout disposition; shared accounting, SQL and other source reviews are unchanged.

One new case uses the real installed SDK with fetch locally rejecting a synthetic `AbortError`; no HTTP or timeout wait occurs. Against that exact core baseline it failed with `provider_unavailable` instead of `timeout`. The RED receipt is `/private/tmp/resumide-r06-build-timeout-red-20261110.log`. The fix adds a guarded `instanceof OpenAI.APIConnectionTimeoutError` check and retains the existing name fallback, abort precedence, usage callbacks and fact validation. No other production behavior is changed.

One selected run then passed the new SDK case plus all 18 affected Build provider tests: 19 passed, 327 ms total. The existing 25 SDK cases remain unchanged and were unselected by the explicit name filter, not disabled. The GREEN receipt is `/private/tmp/resumide-r06-build-timeout-green-20261110.log`. Targeted lint and scoped TypeScript checks passed with zero diagnostics. Root owns the single final combined gate; no other feature suite or external operation was run for this delta.

The corrected core SHA is `45a4d441f5675fd3c8617d42a93f23e3574b8fb29e415f00676e4f54d65a9975`; the SDK test SHA is `c7073230e53288d468e7613ffac483288b261427e6bd377584cec2ee0e34c8f0`. RED/GREEN log hashes are `969e269a66badb78a601c64f5b45e386edec6c2aa2c507afbab6f28a479accc1` and `b8f3d29adb6f7c4a752807efcee4598862aee3f74abe117a25e65a69bac0f86f` respectively. The original handoff prefix is preserved without edits.
