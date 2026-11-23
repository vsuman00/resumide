# U03 canonical rejected-draft recovery

Status: **IMPLEMENTED; seven focused follow-up cases PASS; Root final two-file gate pending.** This four-file packet follows `u03-canonical-draft-allocation.json` and the coordinator contract. The existing frontend worktree remains at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. No shared plan or configuration changed.

## Reproduced behavior

The initial named RED run exposed three authenticated, strictly parsed route failures: rejected edit commands at 409 and 422, and a rejected section rename at 409, lost their submitted command. A real client React Router submission also confirmed that its default 4xx behavior did not refresh the current loader. The no-reflection control passed. Four initial static-render cases had a detached-container accessibility-query error; those failures were test setup errors, not product evidence.

After attaching each static-render container to the document, only those four cases ran again. Each then failed because the retained-draft region was absent: edit, section rename, historical view and missing target. These local static requests use the actual route action, authentication/parser boundary and Router rendering, with a mocked mutation rejection. They do not prove a native browser or managed database result.

## Repair

A failed action returns a retained command only after authentication and successful strict parsing, and only for `edit` or `rename_section`. Invalid and unauthenticated submissions do not echo draft data. Successful edit/rename responses now use a separate parsed `resolved` identity, as recorded in the reviewer follow-up below; they do not return failure-only `submitted` data. The response remains private and uncached. A client-side structural guard permits revalidation for this retained error response without importing a runtime server parser into client code.

The ordinary fact editor and retained recovery forms post to the unqualified canonical route. An old history query therefore does not trap the failed response on its formerly current version. The old command remains separate from the refreshed model. The retained panel displays the parsed text safely, preserves visual whitespace and offers an immutable exact retry with its original key, version, target and value.

A distinct new-attempt form shows the current saved value and retained proposal. It uses the current head, fresh loader key and the same actual fact or section ID. It requires a fresh native review checkbox and checks native validity on JavaScript submission. No saved confirmation is granted by this acknowledgement. An edit still produces an unconfirmed correction under the existing domain rules. A section rename keeps its existing semantics.

Historical views and missing targets keep the draft readable without enabling either recovery mutation. No target is inferred from its value, field or nearby position. The ordinary editor for the retained fact is hidden to avoid silently prefilling a fresh attempt with the old draft. The review acknowledgement resets when its exact head, target, value or key binding changes and after a persisted `pageshow`; the page-memory draft survives those resets.

The first affected two-file run passed 39/40 cases. Its remaining assertion initially inspected the former checkbox after explicit loader revalidation. Waiting for the current head revealed another actual behavior: React Router clears action data on this reload, removing the draft panel. The component now retains only the already parsed command in page memory, bound to analysis, resume, source and owner identity. At this initial checkpoint, any new feedback replaced or cleared the single retained command. The reviewer follow-up below replaces that behavior with a target-bound collection. A source change still discards source-bound memory. There is no local storage or draft text in a URL. Page reload still loses this temporary memory; the panel tells the candidate to copy the text before leaving or reloading.

## Verification and preserved receipts

All original test declarations remain byte-identical: 14 unit declarations expand to 21 original cases, plus 10 original component cases. Their bodies and assertions were not removed, disabled or weakened. The initial packet contained 25 route cases and 15 component cases. One extra affected two-file run occurred while refining the loader assertion because a command sequence continued after a preparation assertion failed; that 39/40 failed receipt is retained rather than hidden. The earlier 282-case campaign was not repeated.

After the page-memory repair, only the affected client recovery case ran and passed. Its final follow-up also passed with the source-identity clearing assertion. It checks the fresh head/key after reload, unchanged exact retry, fresh acknowledgement, persisted history reset, native checked-property restoration and source-change clearing. The remaining 39 cases passed before that last production delta; Root's original combined gate was still pending at this checkpoint. This paragraph records the earlier 39/40 and focused follow-up evidence, not a final 40/40 run at the replacement hashes.

Scoped final TypeScript passed with three roots, three ambient inputs, 474 source files and zero diagnostics. Scoped lint, formatting and `git diff --check` passed. Source comparison found no changed or missing original test declaration. The sealed Node 22 evidence directory is `/private/tmp/resumide-u03-canonical-draft-t7uaq0u3/`:

- `red.json/log`: initial route/client failures and disclosed static-render setup errors.
- `ssr-red.json/log`: four corrected static-render product failures.
- `green.json/log` and `revalidation-followup.json/log`: preserved 39/40 intermediate results.
- `memory-followup.json/log` and `source-binding-followup.json/log`: affected-case passes.
- `types.json`, `static-final.json`, related logs and `assertion-preservation.json`: final scoped static checks and preservation evidence.

Behavioral receipts record stable scoped source hashes and absent owned process groups. They used sealed fake configuration without dotenv or live credentials. The React Router hydration-fallback warning is retained in the logs; it did not fail these checks. No database, SQL, provider, Docker, browser, owner-file, Git mutation or deployment ran. Native history behavior, visual review, managed concurrency and formal release acceptance remain separate gates.

## Reviewer follow-up: unrelated actions and multiple targets

Root's review found two remaining losses in the initial page-memory implementation. After a rejected edit A, successful confirmation of a different fact B cleared A. A rejected section rename A followed by rejected rename B also discarded A. Both were reproduced through actual client Router POST navigation, the strict route parser and mocked mutation outcomes at unchanged route `126f64cb`. The first attempt at this follow-up used an unsupported test helper method, `router.submit`; those component failures are setup errors. Correcting the helper to actual `router.navigate` POST navigation and rerunning only those two cases produced the concrete draft-loss failures. No production fix preceded that corrected reproduction.

The retained collection is now keyed by operation and stable fact/section ID. A new rejected command replaces only a retained failure for that same operation and target. Unrelated successful or failed feedback leaves other drafts intact. A successful edit/rename carries a separate `resolved` parsed command after the mutation returns success. It clears only a retained entry with the same operation, actual target and exact value, whether the successful command used the original key or a newly reviewed key. Successful confirmation and other operations carry no resolution identity. Invalid and unauthenticated inputs remain unreflected. These private response fields identify the command; they do not grant target ownership or bypass server admission.

All retained panels remain separate, and ordinary editors are hidden for each retained fact. The normal collection is capped at 1,030 entries, matching the document's 1,000-fact and 30-section limits. It never evicts an older draft to accept a new target. A further response can occupy one separate read-only overflow slot. While full, new ordinary editor submissions are disabled and guarded, while existing retained reviews/retries and unrelated fact confirmations remain available. If another out-of-flow submission exceeds that slot, its current response is displayed separately with an explicit copy-before-another-action warning; the retained collection and overflow entry remain unchanged. Space freed by a matching resolution promotes the overflow entry. Parsing does not prove ownership: initially missing/deleted targets remain readable, but only an actual current target can enable a normal retained mutation, and the server still owns all write checks.

Multiple panels also require distinct idempotency keys. The same-route loader now supplies a fresh server-generated `retainedKeys` map for current operation/target pairs. Each review uses its own returned key. Missing or invalid keys withhold a new review, preserving the exact old retry. There is no singleton `formKey` fallback or browser-generated authority. The existing one-target tests now model this loader contract in their setup; all prior assertions remain unchanged. New multi-target cases verify distinct keys and fresh keys after loader refresh.

The named final run passed **7/7**, leaving the previous 40 cases unselected by filter. It covers successful edit/rename resolution identities and private/no-reflection controls; actual two-target Router failure/success sequences; unchanged original retries; same-target different-value success; exact and reviewed resolution; loader key uniqueness/freshness; and missing/invalid key withholding. Root will run the final canonical two-file gate over all 47 cases. The prior Root 100-case/seven-file pass remains historical; unrelated authoring inputs were not changed or rerun here.

Final scoped TypeScript passed again with three roots, three ambient inputs, 474 source files and zero diagnostics. Lint, formatting and scoped diff checks passed. The first type pass found four test-fixture diagnostics: a missing `scoringEligible:false` result field and three form-map union typing errors. The corrected fixtures preserve their assertions. `types-red.json` records the count; the original detailed diagnostics were tool output, not a preserved raw log. An AST comparison confirms no changed or missing assertion expressions from any of the 40 preceding cases. Two setup blocks now provide per-target loader keys.

The new sealed Node 22 directory is `/private/tmp/resumide-u03-resolution-1njv0ux_/`. `red.json/log` preserves the two missing-resolution route failures and disclosed helper errors. `red-router.json/log` preserves both actual Router draft-loss failures. `green.json/log` records the first four focused passes. `key-red.json/log` records all three actual key failures before the loader/guard edit. `final-green.json/log` records the seven final passes. `baseline.json`, `baseline-0.txt` through `baseline-3.txt`, `types-red.json`, `types.json`, `static-final.json`, final static logs and `assertion-preservation.json` preserve source and verification detail. Behavioral runs had stable scoped source hashes and absent owned groups. The prior private receipt directory and failed artifacts remain unchanged. No full 40-, 100- or 282-case campaign, provider, database, browser, Git mutation or deployment ran in this follow-up.

## Final source packet

| File                                             | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.canonical.tsx`              | `aa6bd75349f6fc507f5358105d9a411384418dbc87f094d833014eae7cbf7d9b` |
| `tests/unit/canonical-route.test.ts`             | `5c35439708f1967e78b94d930d7adce5975bde64a1502b3eb2b89464087b8791` |
| `tests/components/CanonicalCorrections.test.tsx` | `4986eb3db4b581107c2b6d270eeb9fc56406e60ab9035ba8c11e4c7271cca696` |

Original baselines are route `50f0f006`, unit `0256c28f` and component `c4512586`; the allocation records their full hashes. Root owns durable receipt integration, the combined gate and shared task status.
