# R02 installed SDK transport review

Status: scoped source review ACK; 25/25 installed SDK tests pass on the released candidate. Coordinator integration and its combined gate remain separate.

This leaf owns `tests/unit/provider-attempt-sdk.test.ts`, the required-source addition in `scripts/verify-reliability-ai-live.ts`, its one expectation in `tests/unit/reliability-ai-live.test.ts`, and this handoff. Production source belongs to the backend agent; the coordinator integrates the combined candidate. The detached worktree remains on `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with existing dirty inputs preserved.

## Baseline evidence

The first four independent tests failed under Node 22.23.4 and installed OpenAI SDK 6.47.0. Both production wrappers timed out while the actual SDK fetch signal remained active. Both malformed-JSON cases returned `AI_PROVIDER_UNAVAILABLE` and discarded known input/output usage of 11/7. The preserved receipt is `/private/tmp/resumide-r02-sdk-red-20261110.log`, SHA-256 `9f83298a8f7595948451f3692e0128d55893b6358bd2f8d5fc4dffd99d78c26f`; the run took 400 ms, including 174 ms of tests.

Baseline production SHA-256:

- `qualitative-ai.ts`: `f673d71f621f994e88f2e120f1b299f28ebd72f6eaea30a0c877afd6b5df1d10`
- `rewrite-ai.ts`: `6ae2e0fdb960be7d6d50b4c9a4b50c875cc1e445dece3109a8ee82a72b063848`

The SDK's installed `src/lib/parser.ts` throws for length/content-filter finishes before returning the parsed completion, and parses schema content inside that operation. The proposed raw-completion boundary must capture safe usage before output validation. This is a local source observation, not provider evidence.

A separately selected constructor regression also failed before the repair: `classifyProviderError(new OpenAI.APIConnectionTimeoutError())` returned `AI_PROVIDER_UNAVAILABLE`, nonretryable, without usage. The expected result is `AI_TIMEOUT`, retryable, with unknown usage. Its receipt is `/private/tmp/resumide-r02-sdk-timeout-red-20261110.log`; this filter selected one test and left the other 24 unselected. No test is disabled. The installed SDK's timeout subclass inherits the generic error name, so constructor identity matters.

## Finite acceptance scope

The new 25-case file exercises both real production transports and the installed SDK, replacing only global fetch with a local stub. It checks wrapper-deadline and caller-abort propagation to the SDK's actual fetch signal; pre-abort with no fetch; malformed JSON, invalid schema, refusal, length truncation and content filtering; explicit unknown usage for missing/invalid metadata; genuine zero usage on successful output; and the actual SDK timeout constructor. Error serialization must exclude a synthetic response canary. Each dispatched case requires exactly one fetch.

The live probe's original source/test hashes were `1b60155dead4a2cd4ff5b93d044452b331e68c2bbb179bce6fefbcab8caf4bab` and `8a1a5448866eef4fcbc65c255fdec3440f57bdfdf8b4ce2cb665486cc7e26092`. Its only change is to require the new transitive `app/lib/server/provider-attempt.ts` source in future allocations, with one metadata expectation. Existing fixtures, caps, allocation policy and execution behavior remain unchanged. No live allocation is created or consumed.

Commands run with an empty inherited environment, original `HOME`, Node 22 on `PATH`, and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`:

```sh
node node_modules/vitest/vitest.mjs run tests/unit/provider-attempt-sdk.test.ts
node node_modules/eslint/bin/eslint.js tests/unit/provider-attempt-sdk.test.ts tests/unit/reliability-ai-live.test.ts
```

The initial focused run is RED as recorded above. The coordinator copied the exact four released production files into this worktree. One complete SDK run then passed all 25 tests in 185 ms, with a total duration of 486 ms. Its receipt is `/private/tmp/resumide-r02-sdk-green-20261110.log`. Targeted ESLint passed. A TypeScript program using repository compiler options checked the three owned TypeScript files and transitive imports with zero diagnostics. No unchanged broad suite or production-fixture readiness was rerun here; the coordinator owns the combined gate, including the new live-source metadata expectation.

## Reviewed candidate

The complete shared helper, both transports/wrappers and the HTTP-signal forwarding change were reviewed. The wrapper owns one linked abort signal and removes its timer/listener; timeout/cancellation settle before SDK abort races and reject late output. The transports now use raw `.create` responses, preserve observed safe integer usage before output validation, and reject unknown usage instead of returning a successful fabricated zero. `store:false` is newly explicit. Zero SDK retries, failed redirects, disabled SDK logging, source-bound schemas, configured model/token options and idempotency headers remain present. High-level success still has known usage for existing SQL callers. The optional signal is passed from the actual rewrite HTTP request.

Released production SHA-256:

- `provider-attempt.ts`: `576bf61eb9e16429b2527e1c39cf34e8d2b7a0408c9b6751e70eef7f6936953d`
- `qualitative-ai.ts`: `8d1d052042085620d94ca5f32abff23619ee0fd10bbc7f62fce0fb42f28c1b98`
- `rewrite-ai.ts`: `3b777a5336f0d7aeac331ba3bb3371e236750710e15b85fa1dffe2726b7dc6e0`
- `rewrite-service.ts`: `f60d905f17635ce8d4f9bfc2659bd0f0b6915e4845674cf9c84beae7d9ce82a2`

No concrete hold remains within this local attempt/transport slice. This ACK does not close the durable attempt policy or consumer release gate.

Owned TypeScript SHA-256:

- `tests/unit/provider-attempt-sdk.test.ts`: `2639584159dfcdad8df03f304768c8135c0a14f2ad3995ca3a51f44c645e2175`
- `scripts/verify-reliability-ai-live.ts`: `27c6055efdc08b9823760919054669b96d6a84dd9f3fb307d0e61c758a96dd4a`
- `tests/unit/reliability-ai-live.test.ts`: `f062e9f71c6aab739ffc40f3e1d80ccebd6f4231527a169b4ae94aa2b44f9bc4`

The green log SHA-256 is `065646be40b19212eb9f5eba072288eb32de954dc8ee189fb7bcec0bad154d69`; the separately selected timeout-constructor red log is `0b13126bad8f4a171f481eea8b073b6331ad59b1264741bf30fafff4442d3223`.

## Limits

All HTTP responses and aborting fetches in this leaf are local test doubles. No credentials, provider, database, browser, Docker, owner documents or external network were accessed. This does not establish external authentication, provider billing/cancellation, durable budget settlement, lease-loss cancellation, database persistence or consumer usefulness. R03 durable usage/accounting and later lease integration remain open. Successful high-level results must retain known usage for existing SQL callers; unavailable usage must fail safely rather than return a fabricated zero.
