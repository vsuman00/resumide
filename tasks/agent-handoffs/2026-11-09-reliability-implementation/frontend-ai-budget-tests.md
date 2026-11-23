# R03 technical budget client tests and SQL review

Date: 2026-11-10. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the coordinator's synchronized dirty inputs. Status: client regression slice verified; SQL source review passed. R03 remains partial pending database validation, caller integration and approved activation.

## Ownership and scope

The released files are `tests/unit/ai-budget.test.ts` and this handoff. The client and migration were copied only as hash-checked review/test inputs; their authors retain ownership. No application caller, shared plan, configuration, package or SQL was edited here. No provider, database, Docker, browser, owner-resume or network operation ran. No Git mutation ran.

The tests exercise the actual TypeScript RPC client with local response doubles. They do not simulate a production database, establish transaction isolation or prove concurrent SQL behavior. No separate reference model or mock integration test was added.

## Implemented-client regressions

The first implemented client, `547b04342d3d3d070eaa0089ab62a359029fa21891d568ac481c355ee4536047`, produced 1 failure and 27 passes. A fractional rate escaped as native `SyntaxError` during `BigInt` refinement instead of `AiBudgetError`. The author guarded the canonical decimal pattern before conversion and aligned receipt counters to the SQL's 128-digit domain. The same 28 cases then passed on `a9739b39a7b9270e6d9451ca31a81e36a0b814213a45d5ccd0303f1e565cc070`.

SQL review then found one contract gap: a known usage overrun could charge actual usage yet leave admission open when the month still had capacity. The coordinator confirmed that an unresolved reservation overrun must block admission. One additional client case reproduced that gap on the implemented `a9739b39...` client: 1 failure and the previous 28 passes. A fresh settlement with usage 9/7 and cost 23 against reservation 8/4 and cost 16 wrongly accepted `poolBlocked:false`.

The minimal client correction rejects that fresh receipt as unavailable. Replayed settlements and operator acknowledgements may legitimately report a cleared fence. The final unchanged 29-case file passed on `735db302f74b7ed5d03f8c1d49a548b16716375d56edbdea72621892d8a73cff`.

The bounded suite covers combined integer cost rounding, the independent `AIBUDGET1` golden hash, immutable operation versus distinct attempt binding, all three feature surfaces, fixed RPC arguments, authoritative denials, malformed output, owner/source/policy substitution, captured attempt caps, exact replay, dispatch permission, release, unknown holds, original-period settlement, overrun handling, separate pool/rate policies and operator/evidence delegation. Rates are synthetic test values, not product pricing. RPC doubles cannot prove membership checks, durable replay, append-only accounting or pool enforcement.

## SQL review and disposition

Read-only review of `e9cb0fc25b67cc2a2195d3775760bd139ef76e5cd83336b748783aaa711a22ea` identified the overrun hold above. Its blocked predicate inspected aggregate monthly deficits only; settlement charged actual usage without a separate unresolved-overrun fence.

The corrective migration, `7ab655cfe638f31daac9819709baa70abccc88f294024577e43c9fa9f00fd6bb`, closes that source-level gap. The predicate also detects settled input, output or cost overruns lacking a reconciliation event. An allowlisted operator may acknowledge an already settled overrun only with identical usage and exact reconciliation/evidence binding. That branch appends an event without updating pool counters again. Conflicts and exact replays remain distinct; acknowledgement cannot clear an actual monthly deficit.

The reviewed source retains organization-first locking, private tables and service-only RPCs, strict requests, immutable captured policies, one organization/month pool, separately bounded attempts, first-claim dispatch, pre-dispatch-only release, unknown reservations without expiry, and accounting against the original period after revocation. Policies and operators have no enabled seed; period opening requires an explicit reviewed record. This is a source/DTO review, not SQL syntax, authorization, race, hosted-migration or actual-accounting execution evidence. Internal membership does not grant any new endpoint permission. Existing AI callers are not wired by this slice.

## Checks and evidence

- Node.js 22, sealed synthetic environment, `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`; no `.env` loading.
- Focused command: `node node_modules/vitest/vitest.mjs run tests/unit/ai-budget.test.ts`. Final result: 29/29 on the exact released test bytes.
- Scoped ESLint and Prettier check passed. An earlier format check required test-only reflow; the final 29-case run includes that formatting. Earlier auxiliary comparison output is retained and is not used as semantic-equivalence proof.
- Scoped TypeScript check before the single added overrun case: 319 transitive files plus three ambient roots, no diagnostics. The coordinator owns final integrated typing and builds.
- Markdown/prose checks and `git diff --check` are recorded with the final release. No broad suite was repeated here.

Private receipts remain in `/private/tmp/resumide-r03-budget-client-tests-71ed3bqx` with private directory/file modes. They preserve the original 27/28 result, first 28-case green, overrun 28/29 result, final 29-case green and exact source/test bindings. Import absence was never counted as bug reproduction.

Final test SHA-256: `783ca7ae27a5185f56ce416a200a2335917c264f37bd233281dbf31839d71207`. Final client SHA-256: `735db302f74b7ed5d03f8c1d49a548b16716375d56edbdea72621892d8a73cff`. Migration SHA-256: `7ab655cfe638f31daac9819709baa70abccc88f294024577e43c9fa9f00fd6bb`.
