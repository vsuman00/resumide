# U04 historical JD view

Status: **IMPLEMENTED; three focused cases and scoped static checks PASS.** Root's final combined gate remains pending. This is the independent `CR-U04-S01` slice under `u04-history-allocation.json` (`a3873ed2`). It does not close full canonical/JD pair binding, A09 storage, A15 source/policy dependencies or native acceptance.

## Scope and reproduced failure

The three owned files are the requirements route, its existing unit test and this handoff. Work used the existing frontend worktree at base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. Original route hash was `332f9e5b048c68c53ec28b81b8762969d87b1d30232fc4487350c75c10f4ae78`; original test hash was `a412be7c2f2fc51c637b85327badf4b8acfb65f5517be742dc47da36ab085e4b`.

Before production edits, the actual React Router static handler and route loader rendered a selected JD revision 1 while its Save form posted the newer head's ID. The new historical regression failed on that visible Save button. Both controls passed: a current selected version and an empty initial workspace retained their native form and exact expected-head/key fields. The nine prior cases were unselected by the name filter, not disabled or removed. The snapshot uses a neutral synthetic JD created by the existing parser; owned persistence is mocked.

## Result

A selected document whose ID differs from the current head is now labelled with its historical revision and a read-only explanation. It has no Save form. An explicit `Review current JD version` link opens the unqualified requirements route, dropping the old history selector. The current revision is also labelled. Its existing form, including first-save behavior, remains unchanged and uses the existing style class.

The selected JD text and requirement citations remain intact and escaped. The loader, feature guard and action declarations are byte-identical to the baseline. No input or restore API was added. Server ownership, strict parsing, expected-head concurrency, private responses and repository save admission remain under their existing contracts; hiding the historical form does not create a new server authorization rule.

## Checks and limits

The final named run passed **3/3**, with the original nine cases still unselected. The native-form controls inspect actual server-rendered hidden fields, then submit their URL-encoded values through the actual authenticated route action and strict parser. The repository save is mocked. These checks establish rendering and command transport, not browser/no-JavaScript or managed transaction acceptance.

Scoped TypeScript passed with two roots, three ambient inputs, 458 source files and zero diagnostics. Scoped lint, formatting and `git diff --check` passed. All six prior test declarations, expanding to nine cases, remain byte-identical with every original assertion. The final affected file contains twelve cases; Root owns its full integrated execution.

Sealed Node 22 receipts are in `/private/tmp/resumide-u04-history-u7pp19rw/`: `baseline.json`, `baseline-0.txt`, `baseline-1.txt`, `red.json/log`, `green.json/log`, `types.json`, `static-final.json`, static logs and `assertion-preservation.json`. Behavioral receipts record stable scoped source hashes and absent owned process groups. Dotenv and live credentials were not loaded. No U18, U03 or 282-case campaign was repeated. No database, SQL, provider, owner-file, Docker, compiler, browser, Git mutation or deployment action ran.

## Frozen source

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.requirements.tsx`     | `e8f5f1529c1c89a3a5974f531c7b8760e79e5ddae668444e53fbdbe67b7f2fe9` |
| `tests/unit/job-requirement-route.test.ts` | `a5dc12b7850b494f3d753ded25591159f79748c0a8b787e7b28977384471864c` |

Root owns shared task/context updates, durable receipt integration and final acceptance. The remaining U04 proposal-pair, navigation and preview-invalidation work awaits its reviewed dependency contract.
