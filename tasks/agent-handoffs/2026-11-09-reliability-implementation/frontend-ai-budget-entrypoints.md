# R05 rewrite budget integration

Date: 2026-11-10, Asia/Kolkata. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 676 coordinator-synchronized nonsecret inputs. Status: local source slice verified and released for coordinator review. Full R03/R05 and release acceptance remain open.

## Scope and behavior

The five owned files are `app/lib/server/rewrite-service.ts`, `tests/unit/rewrite-service.test.ts`, `tests/unit/rewrite-budget.test.ts`, `tests/unit/ai-budget.test.ts` and this handoff. Shared helper/client and coordinator-owned configuration are read-only synchronized inputs. No provider, database, Docker, browser, network or owner-file operation ran. No Git mutation, activation, deployment or pricing change ran.

The opt-in branch uses the shared actual RPC client and attempt helper. It reserves, claims once, observes known transport usage and settles before returning a proposal for persistence. Known refusal or invalid output still incurs known spend. Unknown dispatched failures retain a hold. Empty grounded results, stale writes and persistence errors never refund provider spend. Existing rate limits, consent, ownership, evidence eligibility, source checks and draft compare-and-swap remain in place. Configuration mocks without the new flag retain the legacy path; the enabled branch skips the legacy monthly-token check.

The logical operation namespaces the verified owner, organization, `rewrite` surface and nonce. A supplied `Idempotency-Key` must pass the existing UUID parser or receives a fixed 400 response. Otherwise the once-stamped accepted/generated request ID is used. No trimming or case folding occurs. The attempt ID derives from that operation and `http-post/1`; SQL supplies the ordinal. Payload is deliberately excluded from operation identity so a changed payload under the same nonce conflicts rather than creates fresh authority.

The payload hash binds the exact production system instructions, serialized user source/JD payload, response schema, analysis/resume/job IDs, prompt/support-policy versions, configured model and technical budget policy. Reservation uses the shared conservative UTF8 payload/schema framing calculation and configured output maximum. Full source remains server-side except for the unchanged authorized rewrite transport payload. Error responses contain fixed messages and bounded codes, never raw database/provider detail. These are technical limits; services remain free and pricing is deferred.

## Reproduction and focused coverage

The baseline regression ran against implemented rewrite service `f60d905f17635ce8d4f9bfc2659bd0f0b6915e4845674cf9c84beae7d9ce82a2`. With the ledger flag enabled and a reserve-next exhaustion response, the endpoint still called the provider once. The new expectation failed; all nine existing service cases passed. This was actual missing-admission behavior, not a missing-module import failure.

The bounded endpoint suite exercises settlement-before-persistence, exact payload and assigned ordinal, terminal replay and changed-payload conflict, accepted request-ID reuse, fresh nonce generation, known refusal, unknown timeout, invalid output, empty grounded result, settlement failure, persistence/stale failure and invalid nonce. One additional recovery case covers a replayed reserved attempt competing for its first claim. The unchanged terminal replay case uses a settled receipt and continues to require no second provider call. The shared helper's author and coordinator own its claim-race/lifecycle tests.

The client suite preserves all 29 prior cases and adds two reserve-next checks: omit the caller ordinal while accepting a valid server ordinal, and reject an out-of-policy returned ordinal. RPC responses are local doubles. Their state maps are fixture controls, not an implementation fallback or SQL concurrency evidence.

The first endpoint fixture was below the existing source-selector length floor; all ten new cases stopped at source eligibility. That failed driver receipt remains preserved. The fixture was corrected to a neutral contribution that meets the unchanged selector floor; all ten cases then passed. No acceptance assertion or production source-support rule was relaxed.

## Evidence and remaining boundaries

Private receipts: `/private/tmp/resumide-r05-rewrite-budget-svtss53r`. They preserve baseline failure, first shared-source integration, fixture correction and source/test bindings. The sealed Node.js 22 environment uses `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` and does not load `.env`.

Final focused command: `node node_modules/vitest/vitest.mjs run tests/unit/rewrite-service.test.ts tests/unit/rewrite-budget.test.ts tests/unit/ai-budget.test.ts`. Result: 52/52 passed across three files (10 service, 11 budget-entrypoint and 31 client cases). The exact final test bytes ran against shared client `497168d5bc6775b1092582e7f0e1775ee82f2eaa629b2968e2e35063eb62681a` and helper `46621f1a45613f9b2165cbaa8208b310693c87257e707cae2ac15d6eb1f872dd`.

Scoped TypeScript verification of the owned code/test roots passed: 42 transitive source files plus three ambient roots, zero diagnostics. The initial two helper closure-narrowing diagnostics were fixed by its author without suppressions. Scoped ESLint, Prettier, prose hygiene and `git diff --check` passed. Removing only the additive test blocks reproduces the exact prior 29-case client and nine-case service files. The coordinator owns configuration tests and the final combined gate.

| Released file                        | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/rewrite-service.ts`  | `f134c6bf9b3bae369ab141b85ee90bae2f141842da564dcdda318528ef7be3b0` |
| `tests/unit/rewrite-service.test.ts` | `5934579dba97d7792296487119f6b0e154dd69e8ba997c7a150339059c7f27cb` |
| `tests/unit/rewrite-budget.test.ts`  | `aea1d458bd661391eaafbb654404a64a91531e2bae7522b76d3af459c685d655` |
| `tests/unit/ai-budget.test.ts`       | `3a4cf99c5c4b552f54f4b68cf4729fd4b45b7f0b38eeaa9369a0a2c55f8046d0` |

No SQL was parsed, applied or executed here. This packet proves local endpoint/client behavior with controlled responses, not durable debit, race safety, hosted authorization, cross-process isolation or activated production enforcement. Policy/opening/operator activation, cutover, real ledger tests, all callers and the full reliability plan remain separate acceptance work.
