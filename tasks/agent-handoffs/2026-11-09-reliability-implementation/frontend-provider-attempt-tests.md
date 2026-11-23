# R02: provider-attempt regression tests

2026-11-10. **Focused-verified: 58/58 pass on the exact released backend implementation.** The owner-approved reliability task is cancellation and truthful usage metadata for the existing qualitative/rewrite surfaces. No pipeline, Build, SQL, shared-code, provider, database, browser, Docker, owner-file or Git operation is part of this test allocation. Root owns final integration and checks.

## Scope and preserved inputs

The assigned frontend worktree started from main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the synchronized 667-input dirty ROOT baseline. Original source bindings were qualitative transport `f673d71f621f994e88f2e120f1b299f28ebd72f6eaea30a0c877afd6b5df1d10`, rewrite transport `6ae2e0fdb960be7d6d50b4c9a4b50c875cc1e445dece3109a8ee82a72b063848` and rewrite service `c1171ef5b8b51431eee16d3fd9541035d8c86a1f9e741c9179f5921a659f5337`. Production inputs remained unchanged during both RED runs.

Owned outputs are the three existing tests and this handoff. The optional provider-attempt test is omitted: high-level linked-signal cleanup is checked through actual wrappers, while the runtime agent separately owns actual installed-SDK/raw-completion controls. No test file or assertion is removed.

| Owned test                         | Frozen SHA-256                                                   |
| ---------------------------------- | ---------------------------------------------------------------- |
| tests/unit/qualitative-ai.test.ts  | 766efe10a3402f507da4f899df2d111d500c678e0874c2db65edee3730de6fd9 |
| tests/unit/rewrite-ai.test.ts      | c4022c088f5bb7f21ac5b2e6fb2dcb5d8176e4315f8ccd18f3625a9bae26c83b |
| tests/unit/rewrite-service.test.ts | 421034e749dcb371f11b192623cf4e340d9ac9a4f870e99cbdf10246e1385335 |

Existing assertions for useful grounded wording, exact wrapped source IDs, rejection of unsupported claims, budget/consent/ownership/stale-save behavior, model/schema/messages/tokens/idempotency, no retries/redirects and disabled logging remain. The existing SDK request matchers gain the stricter `store: false` property. Everything else is appended, except a new type-only import in the service test.

## Agreed contract and actual RED

The backend interface adds optional AbortSignal to transport requests, qualitative arguments and the existing grounded-rewrite request. Caller/deadline cancellation must reach the actual attempt; pre-aborted calls must not dispatch. AI_CANCELLED is nonretryable; AI_TIMEOUT remains retryable. QualitativeAiFailure gains only a third optional usage argument, default null, with readonly metadata. Successful high-level responses require known safe nonnegative integer usage; absent/invalid usage must fail AI_OUTPUT_INVALID with null metadata, never fabricated zero.

The first two tests on each surface produced **4 failed / 22 passed** and immediately unlocked backend implementation. They demonstrate that the baseline still dispatches a pre-aborted caller and times out without aborting its actual transport. All 22 original tests passed at that checkpoint.

The completed bounded test packet produced **24 failed / 34 passed across three files (58 cases)** on the same unchanged baseline. New cases cover immediate in-flight caller cancellation, actual deadline signal state, no acceptance after a late result, cleared timers and a detached caller subscription, known usage including zero, missing/null/fractional/negative usage, preserved known usage on refusal/schema failure and default unknown failure metadata. Existing real SDK stub-fetch assertions require store:false without changing payload/transport controls.

The HTTP service test uses its existing DB/auth/consent doubles and an injected hanging transport. It captures the child signal's aborted state immediately when the HTTP caller aborts, before awaiting any later deadline. Therefore a deadline-only abort cannot falsely satisfy propagation. The response must not be success and the old writer draft must remain untouched. No actual database or network is used.

Root explicitly preserved the old direct qualitative HTTP429/503 numeric-status assertions. A sanitized failure may carry only bounded nonwritable HTTP status, without SDK message/body/cause; rewrite's classified-code assertions remain. Neither test is weakened to accommodate a new implementation.

## Released implementation and green result

The source author released four production files. Each was verified by full hash; prior qualitative/rewrite/service hashes and absence of the new helper were checked before copying. These are read-only validation inputs, not source changes authored or released by this test agent:

| Backend source                     | SHA-256                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/provider-attempt.ts | 576bf61eb9e16429b2527e1c39cf34e8d2b7a0408c9b6751e70eef7f6936953d |
| app/lib/server/qualitative-ai.ts   | 8d1d052042085620d94ca5f32abff23619ee0fd10bbc7f62fce0fb42f28c1b98 |
| app/lib/server/rewrite-ai.ts       | 3b777a5336f0d7aeac331ba3bb3371e236750710e15b85fa1dffe2726b7dc6e0 |
| app/lib/server/rewrite-service.ts  | f60d905f17635ce8d4f9bfc2659bd0f0b6915e4845674cf9c84beae7d9ce82a2 |

The single three-file green run produced **58 passed, zero failed**. Pre-abort dispatch is withheld; deadline/caller cancellation aborts actual custom transport signals; late valid results stay rejected; timer/caller linkage cleans up; known usage including zero survives while unknown/invalid usage fails safely. Known refusal/schema failure metadata and the HTTP-abort propagation/no-draft checks pass. All original grounded wording, transport configuration, HTTP status and source/ownership assertions pass unchanged. Actual installed-SDK completion/abort tests remain separately owned by the runtime agent and are not counted in this 58-case result.

## Checks and receipts

Actual RED commands use pinned Node 22.23.4 and the package-equivalent Vitest CLI on only these test roots. A fresh explicit environment sets RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic, disabling .env loading, with an unused synthetic key. SDK calls use the original stub fetch; high-level transports are local promises and the HTTP service uses existing filtered doubles. No real provider request occurred.

Scoped ESLint and Prettier pass on all three owned tests. After the exact backend release was copied as read-only test input, one behavioral green run passed all 58 cases across the three files without any test change or expectation weakening. A repository-options no-emit TypeScript program rooted at these tests plus the project's three ambient declaration roots checked 591 transitive source/declaration files with zero diagnostics. This is focused type evidence, not the full generated-type/application gate. The original test byte prefixes were independently compared: removing only the stricter store:false properties or the new service type import restores each unchanged original prefix.

Private receipts: `/private/tmp/resumide-r02-attempt-tests-ins260pj`, mode 0700 with source/test snapshots and mode-0600 logs/bindings:

| Receipt                     | SHA-256                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| released-green.log          | cfc601214275e27a7ae5b722e52c76e9391f3176cb2c40181a9f883e5dc2da45 |
| released-green-binding.json | ad8095ac67ac82192ea8ff897a568c17ff29a3804221dc628709b2921070592c |
| released-source-inputs.json | 0ae8830f1dc7a5493d6babc2b26445a8699e8eda5c6d387540395c375e083ddc |
| released-types.log          | e5d479bab5321a53235f0f385476b17b0955b255747e02178be67fe19b4449a4 |
| first-red.log               | 623541960050e66f8ea0a3a1499a48ba449ff627ba9e99196af43eb8fe96ad37 |
| first-red-binding.json      | 45f1bfc20c9f9927e7117e3959f0515aab5a644bb5045de62c4c114c92003b9a |
| full-red.log                | 588cc0e72375dd3aa08ff9226ae5fe8ace4393052644b25e2074d2092f7e86f7 |
| full-red-binding.json       | 5e13c65dc60de85c5aef2adb727e1602194447d68c352a1bce02c4571a75841e |

Both original failed receipts and their bindings remain preserved. No further behavioral run was performed after the single released-source green result. The new wrapper timer tests use a virtual clock; the mocked HTTP test captures cancellation synchronously before awaiting its bounded result. Root has integrated the production release and owns the combined affected gate. No broad unchanged test suite, generated-type/build check, real provider cancellation/billing guarantee, durable usage reservation/ledger, worker pipeline, browser or release acceptance is claimed. The transport primitive remains a source-level R02 leaf until its caller/integration requirements are separately verified.
