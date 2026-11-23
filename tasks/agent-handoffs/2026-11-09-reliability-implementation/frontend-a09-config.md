# A09 typed JD capability configuration

Status: **IMPLEMENTED; nine focused getter cases and scoped static checks PASS.** Root owns integrated verification and the remaining A09 contract, storage and consumer work. This flag does not activate a typed writer or certify its rollout.

## Scope and actual reproduction

Root delegated exactly four files under `a09-config-allocation.json` (`60159665`): server configuration, its existing unit test, `.env.example` and this handoff. The worktree remains at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. Baselines were config `d2b222f2`, test `ad98bd1c` and example `6c30271d`; the allocation and receipt store full hashes.

Before production edits, all nine new cases failed against the actual existing `getServerConfig()`. Its parsed result lacked the new property, accepted enabled relations without job intelligence, and ignored malformed relation settings. The tests use isolated module instances and restore their synthetic environment stubs. They do not replace or mock the parser/getter. The previous seventeen cases were unselected by the name filter.

## Change

`JOB_RELATIONS_ENABLED` accepts only the literal environment strings `true` and `false`, transforms them to a boolean and defaults to false. Enabling it requires `JOB_INTELLIGENCE_ENABLED=true`. A dependency failure identifies the new flag through the existing redacted configuration error. The new capability adds no AI-enabled or provider prerequisite. Existing base configuration requirements, including credential-shaped settings, remain unchanged; the positive AI-disabled test uses the existing synthetic base settings and makes no provider call.

`.env.example` contains only the new false value and its explanatory comment immediately after job intelligence. No real environment file was read or changed. Analysis/upload parsers, cached getters and other flag dependencies are unchanged.

## Checks and limits

The final named run passed **9/9**. It covers the default, explicit false, explicit enablement with AI disabled, missing/false prerequisites, and four malformed strings. The original twelve declarations expand to seventeen cases; all original declarations and assertions remain byte-identical. The affected file now has twenty-six cases for Root's final gate. No unrelated or full test campaign ran here.

Scoped TypeScript passed with two roots, three ambient inputs, 321 source files and zero diagnostics. Scoped lint, formatting and diff checks passed. The example file was checked for the exact two-line addition and unchanged remaining bytes. The sealed Node 22 directory `/private/tmp/resumide-a09-config-m_bjhodq/` contains `baseline.json`, `baseline-0.txt` through `baseline-2.txt`, `red.json/log`, `green.json/log`, `types.json`, `static-final.json`, final static logs, `assertion-preservation.json` and `example-preservation.json`. Behavioral source hashes stayed stable and both owned process groups were absent on completion.

These are local configuration/application checks. No dotenv or live credentials were loaded, and no provider, database, SQL, Docker, compiler, owner-file, browser, Git mutation or deployment operation ran. The new stored schema, producer, forward SQL, replay identity, typed display, scoring abstention and full canonical/JD pair admission remain separately planned and unimplemented by this packet.

## Frozen source

| File                        | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/config.ts`  | `f75b7d3c3be86e05a1d533d5075d431a52e115dc1d314bb60d3ade444e6f0648` |
| `tests/unit/config.test.ts` | `89506aeacd9978ff7a879a2364e9e7a9e768ce8ac05b845fcf7a44cfb7336c90` |
| `.env.example`              | `fc607d90cbfc19b1e4769947e96d12db67e70e39cce151954c7f2a42ecb8c6fb` |

Root owns durable receipt integration, shared context/task updates and final acceptance. The separate consumer audit is a proposal awaiting the frozen wire, not implementation evidence.
